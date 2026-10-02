#!/usr/bin/env node
/**
 * 제목용 키워드 후보 수집 — 메인 키워드마다 "사람들이 실제로 함께 검색하는 말"과 월간 검색량을 모은다.
 *
 * 제목 규칙(2026-10-02 사용자 지시): 메인 키워드 + 서브 키워드 2개. 서브 키워드는 감으로 고른 낱말이 아니라
 * 네이버 자동완성·연관 키워드에서, 검색량을 보고 고른다. 이 스크립트는 고르기 위한 자료만 만든다.
 *
 *   node scripts/title-keywords.mjs --date 2026-10-03            그날 원고들의 main_keyword
 *   node scripts/title-keywords.mjs "대하 제철" "가을 캠핑"       직접 지정
 *   node scripts/title-keywords.mjs --file 후보.txt              한 줄에 키워드 하나
 *
 * 하는 일 (키워드마다)
 *   1) 네이버 자동완성 (키 필요 없음)
 *   2) 검색광고 API 연관 키워드 + 월간 검색량 (.env 의 NAVER_AD_* 필요. 없으면 건너뜀)
 *   3) 자동완성 후보의 검색량 조회
 *   4) 블로그 글 수 (NAVER_CLIENT_ID/SECRET 이 있을 때만) — 많을수록 경쟁이 세다
 *
 * 결과: dumps/title-keywords-<이름>.json 과 .txt (dumps/ 는 git 에 올라가지 않는다)
 * 클라우드 세션에서는 naver.com 이 막혀 돌지 않는다. 사용자 PC 에서 돌린다.
 * 외부 패키지를 쓰지 않는다.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const AD_HOST = 'https://api.searchad.naver.com';
const OPEN_HOST = 'https://openapi.naver.com';
const AC_URLS = [
  'https://ac.search.naver.com/nx/ac?con=0&frm=nv&ans=2&r_format=json&r_enc=UTF-8&r_unicode=0&t_koreng=1&run=2&rev=4&q_enc=UTF-8&st=100&q=',
  'https://mac.search.naver.com/mobile/ac?_q_enc=UTF-8&st=1&frm=mobile_nv&r_format=json&r_enc=UTF-8&r_unicode=0&t_koreng=1&q=',
];
const GAP_MS = 350;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nospace = (s) => s.replace(/\s+/g, '');

// ---------------------------------------------------------------- env (.env 는 메모장이 만든 형식까지 받는다)
function decodeEnvFile(buf) {
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString('utf16le');
  if (buf.length > 3 && buf[1] === 0x00 && buf[3] === 0x00) return buf.toString('utf16le');
  let s = buf.toString('utf8');
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return s;
}
function loadEnv() {
  for (const f of ['.env', '.env.local']) {
    if (!fs.existsSync(f)) continue;
    for (let line of decodeEnvFile(fs.readFileSync(f)).split(/\r?\n/)) {
      line = line.replace(/[\r\u0000]/g, '').trim();
      const m = /^([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (!m || line.startsWith('#')) continue;
      const v = m[2].trim().replace(/^["']|["']$/g, '');
      if (v && !process.env[m[1]]) process.env[m[1]] = v;
    }
  }
}

// ---------------------------------------------------------------- args
function parseArgs(argv) {
  const out = { dates: [], keywords: [], max: 25 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === '--date') out.dates.push(next());
    else if (a === '--out') out.out = next();
    else if (a === '--file') out.file = next();       // 한 줄에 키워드 하나 (# 은 주석)
    else if (a === '--max') out.max = Number(next());
    else if (a === '--ad-host') out.adHost = next();     // 목 서버 테스트용
    else if (a === '--ac-url') out.acUrl = next();       // 목 서버 테스트용
    else if (a === '--open-host') out.openHost = next(); // 목 서버 테스트용
    else if (a === '--help') out.help = true;
    else if (a.startsWith('--')) throw new Error(`알 수 없는 옵션: ${a}`);
    else out.keywords.push(a);
  }
  return out;
}

// ---------------------------------------------------------------- 네이버 호출
async function autocomplete(q, urls) {
  const errors = [];
  for (const base of urls) {
    try {
      const res = await fetch(base + encodeURIComponent(q), {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36', Referer: 'https://www.naver.com/' },
      });
      const text = await res.text();
      if (!res.ok) { errors.push(`${res.status} ${text.slice(0, 80)}`); continue; }
      let j;
      try { j = JSON.parse(text); } catch { j = JSON.parse(text.replace(/^[^(]*\(|\)\s*;?\s*$/g, '')); } // JSONP 로 올 때
      const found = [];
      const walk = (v) => { if (typeof v === 'string') found.push(v); else if (Array.isArray(v)) v.forEach(walk); };
      walk(j.items || []);
      const list = [...new Set(found.map((s) => s.trim()).filter((s) => s && /[가-힣]/.test(s) && s !== q))];
      if (list.length) return { list, error: null };
      errors.push('후보 없음');
    } catch (e) { errors.push(e.cause?.code || e.message); }
  }
  return { list: [], error: errors.join(' / ') };
}

function sign(ts, method, urlPath, secret) {
  return crypto.createHmac('sha256', secret).update(`${ts}.${method}.${urlPath}`).digest('base64');
}
async function keywordTool(hints, host) {
  const urlPath = '/keywordstool';
  const ts = Date.now().toString();
  const qs = new URLSearchParams({ hintKeywords: hints.map(nospace).join(','), showDetail: '1' });
  const res = await fetch(`${host}${urlPath}?${qs}`, {
    headers: {
      'X-Timestamp': ts,
      'X-API-KEY': process.env.NAVER_AD_API_KEY,
      'X-Customer': process.env.NAVER_AD_CUSTOMER_ID,
      'X-Signature': sign(ts, 'GET', urlPath, process.env.NAVER_AD_SECRET_KEY),
    },
  });
  if (!res.ok) throw new Error(`검색광고 API ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`);
  return (await res.json()).keywordList || [];
}
async function blogTotal(query, host) {
  const res = await fetch(`${host}/v1/search/blog.json?query=${encodeURIComponent(query)}&display=1`, {
    headers: { 'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID, 'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET },
  });
  if (!res.ok) throw new Error(`검색 API ${res.status}`);
  return (await res.json()).total ?? null;
}
/** 10 미만은 "< 10" 문자열로 온다 */
function toCount(v) {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').trim();
  if (/^<\s*10$/.test(s)) return 5;
  const n = Number(s.replace(/[^\d]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------- 원고에서 메인 키워드 읽기
function postsOf(date) {
  const dir = path.join('content', 'posts');
  return fs.readdirSync(dir).filter((f) => f.startsWith(`${date}-`) && f.endsWith('.md')).sort().map((f) => {
    const raw = fs.readFileSync(path.join(dir, f), 'utf8');
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
    const meta = {};
    if (fm) for (const l of fm[1].split(/\r?\n/)) { const m = /^([A-Za-z_]+):\s*(.*)$/.exec(l.trim()); if (m) meta[m[1]] = m[2].trim(); }
    return { slug: f.replace(/\.md$/, ''), title: meta.title || '', main: meta.main_keyword || '', subs: (meta.sub_keywords || '').split(',').map((s) => s.trim()).filter(Boolean) };
  });
}

// ---------------------------------------------------------------- main
async function main() {
  const args = parseArgs(process.argv);
  if (args.help || (!args.dates.length && !args.keywords.length && !args.file)) {
    console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').match(/\/\*\*([\s\S]*?)\*\//)[1].replace(/^ \* ?/gm, ''));
    return;
  }
  loadEnv();
  const hasAd = ['NAVER_AD_API_KEY', 'NAVER_AD_SECRET_KEY', 'NAVER_AD_CUSTOMER_ID'].every((k) => process.env[k]);
  const hasOpen = ['NAVER_CLIENT_ID', 'NAVER_CLIENT_SECRET'].every((k) => process.env[k]);
  const adHost = args.adHost || AD_HOST, openHost = args.openHost || OPEN_HOST;
  const acUrls = args.acUrl ? [args.acUrl] : AC_URLS;

  const targets = [];
  for (const d of args.dates) for (const p of postsOf(d)) if (p.main) targets.push(p);
  if (args.file) {
    for (const l of fs.readFileSync(args.file, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
      const k = l.trim();
      if (k && !k.startsWith('#')) args.keywords.push(k);
    }
  }
  for (const k of args.keywords) targets.push({ slug: '', title: '', main: k, subs: [] });
  if (!targets.length) throw new Error('조회할 메인 키워드가 없습니다.');

  console.log('═'.repeat(60));
  console.log(' 제목용 키워드 후보 수집');
  console.log('═'.repeat(60));
  console.log(`  메인 키워드 ${targets.length}개 · 검색량 ${hasAd ? '조회함' : '건너뜀 (.env 에 NAVER_AD_* 없음)'} · 글 수 ${hasOpen ? '조회함' : '건너뜀'}`);

  const report = [];
  for (const t of targets) {
    console.log(`\n▶ ${t.main}${t.slug ? `  (${t.slug})` : ''}`);
    const entry = { ...t, autocomplete: [], candidates: [], notes: [] };

    const ac = await autocomplete(t.main, acUrls);
    entry.autocomplete = ac.list;
    if (ac.error && !ac.list.length) entry.notes.push(`자동완성 실패: ${ac.error}`);
    console.log(`   자동완성 ${ac.list.length}개${ac.error && !ac.list.length ? ` (${ac.error})` : ''}`);
    await sleep(GAP_MS);

    const vol = new Map(); // nospace 키워드 → { pc, mobile, comp }
    const related = [];
    if (hasAd) {
      const core = nospace(t.main);
      const head = t.main.split(/\s+/)[0];
      try {
        const list = await keywordTool([t.main], adHost);
        for (const k of list) {
          vol.set(k.relKeyword, { pc: toCount(k.monthlyPcQcCnt), mobile: toCount(k.monthlyMobileQcCnt), comp: k.compIdx ?? '' });
          // 메인과 이어지는 말만 후보로: 메인 전체나 첫 낱말이 들어간 연관 키워드
          if (k.relKeyword !== core && (k.relKeyword.includes(core) || k.relKeyword.includes(head))) related.push(k.relKeyword);
        }
      } catch (e) { entry.notes.push(e.message.split('\n')[0]); console.log(`   ⚠ ${e.message.split('\n')[0]}`); }
      await sleep(GAP_MS);

      // 자동완성 후보·현재 서브 키워드의 검색량 (5개씩)
      const need = [...new Set([...ac.list, ...t.subs, ...t.subs.map((s) => `${t.main} ${s}`)])].filter((k) => !vol.has(nospace(k)));
      for (let i = 0; i < need.length; i += 5) {
        const batch = need.slice(i, i + 5);
        try {
          const want = new Set(batch.map(nospace));
          for (const k of await keywordTool(batch, adHost)) {
            if (want.has(k.relKeyword)) vol.set(k.relKeyword, { pc: toCount(k.monthlyPcQcCnt), mobile: toCount(k.monthlyMobileQcCnt), comp: k.compIdx ?? '' });
          }
        } catch (e) { entry.notes.push(e.message.split('\n')[0]); }
        await sleep(GAP_MS);
      }
    }

    const seen = new Set();
    const add = (kw, source) => {
      const key = nospace(kw);
      if (seen.has(key)) { const c = entry.candidates.find((x) => nospace(x.keyword) === key); if (c && !c.source.includes(source)) c.source += `+${source}`; return; }
      seen.add(key);
      const v = vol.get(key);
      entry.candidates.push({ keyword: kw, source, pc: v?.pc ?? null, mobile: v?.mobile ?? null, total: v ? v.pc + v.mobile : null, blogs: null });
    };
    add(t.main, '메인');
    ac.list.forEach((k) => add(k, '자동완성'));
    related.forEach((k) => add(k, '연관'));
    t.subs.forEach((k) => add(k, '현재서브'));

    entry.candidates.sort((a, b) => (a.source.startsWith('메인') ? -1 : b.source.startsWith('메인') ? 1 : (b.total ?? -1) - (a.total ?? -1)));
    entry.candidates = entry.candidates.slice(0, args.max + 1 + t.subs.length);

    if (hasOpen) {
      for (const c of entry.candidates.slice(0, 12)) {
        try { c.blogs = await blogTotal(c.keyword, openHost); } catch (e) { entry.notes.push(e.message); break; }
        await sleep(120);
      }
    }

    for (const c of entry.candidates.slice(0, 14)) {
      const v = c.total == null ? '     -' : String(c.total).padStart(6);
      console.log(`   ${v}  ${c.keyword}  [${c.source}]${c.blogs != null ? `  글 ${c.blogs.toLocaleString()}` : ''}`);
    }
    report.push(entry);
  }

  const label = args.out || (args.dates.length ? args.dates.join('_') : 'custom');
  fs.mkdirSync('dumps', { recursive: true });
  const base = path.join('dumps', `title-keywords-${label}`);
  fs.writeFileSync(`${base}.json`, JSON.stringify({ generatedAt: new Date().toISOString(), hasAd, hasOpen, report }, null, 2));
  const txt = report.map((e) => [
    `■ ${e.main}${e.title ? `  — 지금 제목: ${e.title}` : ''}`,
    ...e.candidates.map((c) => `  ${String(c.total ?? '-').padStart(7)}  ${c.keyword}  [${c.source}]${c.blogs != null ? `  글 ${c.blogs}` : ''}`),
    ...e.notes.map((n) => `  ! ${n}`),
  ].join('\n')).join('\n\n');
  fs.writeFileSync(`${base}.txt`, txt + '\n');
  console.log(`\n✅ 저장: ${base}.json / .txt`);
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
