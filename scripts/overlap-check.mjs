#!/usr/bin/env node
// 채널 겹침 점검 — 보고만 한다 (2026-11-05 사용자 "A 바로 진행해줘").
// 네이버·티스토리(발행 기록 + 지금 원고) · 스레드(보험 심의 · 블로그 유입 · 일상) · 인스타 카드뉴스 · 네이버 클립 기록을 모아
//   ① 같은/비슷한 메인 키워드를 쓴 네이버·티스토리 글 쌍
//   ② 주제 쏠림 (묶음별 채널 편수, 스레드 보험글 실손 비중)
//   ③ 퍼뜨리는 매체끼리 겹침 (스레드 보험 ↔ 인스타 같은 글감 14일 안, 스레드 유입 ↔ 클립 같은 글 2일 안)
// 을 찾는다. 아무것도 막지 않는다 — 🧊 11/30 까지 규칙을 바꾸지 않기로 한 약속 안에서 숫자만 보여 준다.
//
//   node scripts/overlap-check.mjs                  # 글자 요약
//   node scripts/overlap-check.mjs --html out.html  # 아티팩트로 올릴 화면 (아침 확인이 매일 같은 주소에 다시 올린다)
//   node scripts/overlap-check.mjs --json out.json
//   --today YYYY-MM-DD  (기본: 한국 날짜)
//
// 사람이 보고 "괜찮다"고 정한 쌍은 content/archive/overlap-ok.tsv (키워드 A ⇥ 키워드 B ⇥ 판정 ⇥ 메모) 에 적으면 '확인함'으로 내려간다.
// 클립에 올린 글은 content/archive/clip-posted.tsv (날짜 ⇥ 슬러그) — 아침 확인이 Drive run-locks/<날짜>/clip.done 을 보고 한 줄씩 남긴다.

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const TODAY = opt('--today') || new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const NEW_DAYS = 3;          // 이 안에 생긴 쌍은 '새로 생김'
const NEAR = 0.55;           // 글자 두 개 조각 겹침 비율
const CROSS_DAYS = 14;       // 스레드 보험 ↔ 인스타 같은 글감 간격
const CLIP_DAYS = 2;         // 스레드 유입 ↔ 클립 같은 글 간격
const SILSON_MAX = 0.25;     // 스레드 보험글 중 실손·청구 글감 비중 (최근 30일)

const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '');
const tsv = (p) => {
  const [head, ...rows] = read(p).split(/\r?\n/).filter(Boolean);
  if (!head) return [];
  const h = head.split('\t');
  return rows.map((r) => Object.fromEntries(r.split('\t').map((v, i) => [h[i], v ?? ''])));
};
const frontmatter = (text) => {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  const d = {};
  if (m) for (const l of m[1].split(/\r?\n/)) { const i = l.indexOf(':'); if (i > 0) d[l.slice(0, i).trim()] = l.slice(i + 1).trim(); }
  return d;
};
const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
const norm = (s) => String(s || '').replace(/[\s·,\-]/g, '').replace(/보험금/g, '보험').replace(/실비/g, '실손').replace(/실손보험/g, '실손');
// 끝에 붙는 흔한 말(방법·레시피·비용 …)을 떼고 본 줄기 — '운동화 세탁' 과 '운동화 세탁방법' 을 같은 말로 본다
const SUFFIX = /(하는법|방법|하는방법|레시피|만들기|제거|비용|기준|혜택|신청|구분|정리|순서|법)$/;
const core = (s) => { let t = norm(s), u; while ((u = t.replace(SUFFIX, '')) !== t && u.length >= 2) t = u; return t; };
const grams = (s) => { const t = norm(s); const g = new Set(); for (let i = 0; i < t.length - 1; i++) g.add(t.slice(i, i + 2)); return g; };
const jac = (a, b) => { const A = grams(a), B = grams(b); if (!A.size || !B.size) return 0; let n = 0; for (const x of A) if (B.has(x)) n++; return n / (A.size + B.size - n); };

// ── 모으기 ─────────────────────────────────────────────
const items = [];
const seen = new Set();
for (const r of tsv('content/archive/published.tsv')) {
  const ch = r.channel?.startsWith('naver') ? 'naver' : r.channel;
  items.push({ date: r.date, ch, slug: r.slug, kw: r.main_keyword || '', title: r.title || '', cat: r.category || '', deleted: r.status === 'deleted' });
  seen.add(r.slug);
}
for (const [ch, dir] of [['naver', 'content/posts'], ['tistory', 'content/tistory']]) {
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md')).sort()) {
    const slug = f.slice(0, -3);
    if (seen.has(slug)) continue;
    const d = frontmatter(read(path.join(dir, f)));
    items.push({ date: slug.slice(0, 10), ch, slug, kw: d.main_keyword || '', title: d.title || '', cat: d.category || '', planned: true });
  }
}
const listMd = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((x) => x.endsWith('.md')).sort() : []);
for (const f of listMd('content/threads/insurance/sets')) {
  for (const m of read(`content/threads/insurance/sets/${f}`).matchAll(/^글감:\s*(.+)$/gm))
    items.push({ date: f.slice(0, 10), ch: 'threads-insurance', kw: m[1].split(/[(（]/)[0].trim(), title: m[1].trim(), cat: '생활보장' });
}
for (const f of listMd('content/threads/blog')) {
  for (const m of read(`content/threads/blog/${f}`).matchAll(/^원고:\s*(.+)$/gm))
    items.push({ date: f.slice(0, 10), ch: 'threads-blog', slug: m[1].trim(), kw: '', title: m[1].trim(), cat: '생활보장' });
}
for (const f of listMd('content/threads/daily')) {
  for (const m of read(`content/threads/daily/${f}`).matchAll(/^주제:\s*(.+)$/gm))
    items.push({ date: f.slice(0, 10), ch: 'threads-daily', kw: m[1].trim(), title: m[1].trim(), cat: '일상' });
}
if (fs.existsSync('content/instagram/sets')) {
  for (const f of fs.readdirSync('content/instagram/sets').filter((x) => x.endsWith('.json')).sort()) {
    let d; try { d = JSON.parse(read(`content/instagram/sets/${f}`)); } catch { continue; }
    for (const p of d.posts || []) {
      const c = (p.cards || [])[0] || {};
      items.push({ date: f.slice(0, 10), ch: 'instagram', kw: c.kw || '', title: [].concat(c.title || []).join(' '), cat: '생활보장', no: p.no });
    }
  }
}
for (const r of tsv('content/archive/clip-posted.tsv')) items.push({ date: r.date, ch: 'clip', slug: r.slug, kw: '', title: r.slug, cat: '' });

const CH = { naver: '네이버', tistory: '티스토리', 'threads-insurance': '스레드 보험', 'threads-blog': '스레드 유입', 'threads-daily': '스레드 일상', instagram: '인스타', clip: '네이버 클립' };
const count = (ch) => items.filter((i) => i.ch === ch).length;

// ── ① 네이버·티스토리 키워드 쌍 ────────────────────────
const okRows = tsv('content/archive/overlap-ok.tsv');
const okOf = (a, b) => okRows.find((r) => (norm(r.a) === norm(a) && norm(r.b) === norm(b)) || (norm(r.a) === norm(b) && norm(r.b) === norm(a)));
const blog = items.filter((i) => (i.ch === 'naver' || i.ch === 'tistory') && i.kw);
const pairs = [];
for (let x = 0; x < blog.length; x++) for (let y = x + 1; y < blog.length; y++) {
  let a = blog[x], b = blog[y];
  if (a.date > b.date) [a, b] = [b, a];
  const na = core(a.kw), nb = core(b.kw);
  const short = Math.min(na.length, nb.length), long = Math.max(na.length, nb.length);
  let v = null, j = 1;
  if (norm(a.kw) === norm(b.kw) && a.deleted && a.ch === b.ch) v = 'republish';
  else if (na === nb) v = 'same';
  else if (short >= 4 && short / long >= 0.75 && (na.includes(nb) || nb.includes(na))) v = 'same';
  else if ((j = jac(a.kw, b.kw)) >= NEAR) v = 'near';
  if (!v) continue;
  const ok = okOf(a.kw, b.kw);
  if (ok) v = 'ok';
  pairs.push({ v, j: Math.round(j * 100) / 100, gap: days(a.date, b.date), fresh: days(b.date, TODAY) <= NEW_DAYS, note: ok?.memo || ok?.verdict || '',
    a: [a.date, a.ch, a.kw, a.title], b: [b.date, b.ch, b.kw, b.title] });
}
const RANK = { same: 0, near: 1, ok: 2, republish: 3 };
pairs.sort((p, q) => RANK[p.v] - RANK[q.v] || (q.b[0] > p.b[0] ? 1 : q.b[0] < p.b[0] ? -1 : 0));
const kind = (p) => `${p.a[1]}>${p.b[1]}`;
const sameP = pairs.filter((p) => p.v === 'same');
const nearP = pairs.filter((p) => p.v === 'near');

// ── ② 주제 쏠림 ───────────────────────────────────────
const CLUSTERS = [
  ['실손·실비 청구', /실손|실비|보험금|청구/], ['장기요양·돌봄', /요양|간병|돌봄|치매/], ['국민연금·노후', /연금/],
  ['건강검진·내시경', /검진|내시경|검사/], ['병원비·본인부담', /본인부담|산정특례|병원비|의료비|CT|MRI/], ['보관법', /보관/],
  ['세탁·이불', /세탁|빨래|이불/], ['청소·곰팡이·벌레', /청소|곰팡이|결로|벌레|파리|모기/], ['제철·요리', /제철|손질|레시피|만들기|삶|장조림|김장/],
  ['나들이·축제', /단풍|축제|억새|명소|여행/], ['드라마·예능', /드라마|\d+회|예능|몇부작|넷플릭스|출연/], ['정책·경제', /지원금|급여|수당|제도|신청|정책/],
];
const CL_CH = ['naver', 'tistory', 'threads-insurance', 'instagram'];
const since30 = (i) => days(i.date, TODAY) <= 30;
const clusterOf = (i) => (CLUSTERS.find(([, re]) => re.test(`${i.kw} ${i.title}`)) || [null])[0];
const clus = CLUSTERS.map(([name]) => {
  const row = { name, all: {}, d30: {} };
  for (const ch of CL_CH) {
    const list = items.filter((i) => i.ch === ch && clusterOf(i) === name);
    row.all[ch] = list.length; row.d30[ch] = list.filter(since30).length;
  }
  return row;
}).filter((r) => CL_CH.some((c) => r.all[c]));
const ins30 = items.filter((i) => i.ch === 'threads-insurance' && since30(i));
const silson30 = ins30.filter((i) => /실손|실비|보험금|청구/.test(i.title)).length;
const silsonRate = ins30.length ? silson30 / ins30.length : 0;

// ── ③ 퍼뜨리는 매체끼리 ───────────────────────────────
const cross = [];
const ins = items.filter((i) => i.ch === 'threads-insurance');
for (const g of items.filter((i) => i.ch === 'instagram' && i.kw)) {
  for (const t of ins) {
    if (Math.abs(days(g.date, t.date)) > CROSS_DAYS) continue;
    if (norm(t.title).includes(norm(g.kw)) || jac(g.kw, t.kw) >= NEAR)
      cross.push({ type: '스레드 보험 ↔ 인스타', a: `${t.date} 스레드 보험 · ${t.kw}`, b: `${g.date} 인스타 ${g.no ?? ''}편 · ${g.kw}`, gap: Math.abs(days(g.date, t.date)) });
  }
}
const tb = items.filter((i) => i.ch === 'threads-blog');
for (const c of items.filter((i) => i.ch === 'clip')) {
  for (const t of tb) if (t.slug === c.slug && Math.abs(days(c.date, t.date)) <= CLIP_DAYS)
    cross.push({ type: '스레드 유입 ↔ 클립', a: `${t.date} 스레드 유입`, b: `${c.date} 클립`, gap: Math.abs(days(c.date, t.date)), slug: c.slug });
}
// 스레드 보험·인스타 글감이 네이버·티스토리 메인 키워드를 그대로 담은 것 (괜찮지만 쏠림 확인용)
const echo = [];
for (const t of items.filter((i) => i.ch === 'threads-insurance' || i.ch === 'instagram')) {
  const hit = blog.find((b) => norm(b.kw).length >= 4 && norm(t.title + t.kw).includes(norm(b.kw)));
  if (hit) echo.push({ a: `${t.date} ${CH[t.ch]} · ${t.kw}`, b: `${hit.date} ${CH[hit.ch]} · ${hit.kw}` });
}

// ── 찾은 것 (문장) ────────────────────────────────────
const KIND_KO = { 'naver>naver': '네이버끼리', 'tistory>naver': '티스토리에 먼저 쓰고 네이버에', 'naver>tistory': '네이버에 먼저 쓰고 티스토리에', 'tistory>tistory': '티스토리끼리' };
const byKind = (list) => Object.entries(list.reduce((m, p) => ((m[kind(p)] = (m[kind(p)] || 0) + 1), m), {}))
  .map(([k, n]) => `${KIND_KO[k] || k} ${n}쌍`).join(', ');
const findings = [];
const freshSame = sameP.filter((p) => p.fresh), freshNear = nearP.filter((p) => p.fresh);
findings.push({ lv: sameP.length ? 'bad' : 'ok', h: `같은 키워드를 두 번 쓴 글 ${sameP.length}쌍`,
  p: sameP.length ? `${byKind(sameP)}. 네이버 검색에는 티스토리 글도 나와서 내 글끼리 자리를 다퉈요.${freshSame.length ? ` 최근 ${NEW_DAYS}일 안에 새로 생긴 것: ${[...new Set(freshSame.map((p) => p.b[2]))].join(', ')}.` : ' 최근 3일 안에 새로 생긴 것은 없어요.'}` : '없어요.' });
findings.push({ lv: nearP.length ? 'warn' : 'ok', h: `비슷한 키워드 ${nearP.length}쌍 (사람이 확인할 것)`,
  p: `${nearP.length ? byKind(nearP) + '. ' : ''}확인해서 괜찮은 쌍은 overlap-ok.tsv 에 적으면 '확인함'으로 내려가요.${freshNear.length ? ` 새로 생긴 것: ${freshNear.map((p) => `${p.a[2]} ↔ ${p.b[2]}`).join(', ')}.` : ''}` });
findings.push({ lv: silsonRate > SILSON_MAX ? 'warn' : 'ok', h: `스레드 보험글 중 실손·청구 글감 ${Math.round(silsonRate * 100)}% (최근 30일 ${silson30}/${ins30.length}편)`,
  p: silsonRate > SILSON_MAX ? `추천 기준 ${Math.round(SILSON_MAX * 100)}% 를 넘어요. 같은 독자가 블로그·스레드·인스타에서 같은 이야기를 연달아 보게 돼요.` : `추천 기준 ${Math.round(SILSON_MAX * 100)}% 안이에요.` });
findings.push({ lv: cross.length ? 'warn' : 'ok', h: `퍼뜨리는 매체끼리 겹침 ${cross.length}건`,
  p: cross.length ? cross.slice(0, 6).map((c) => `${c.type}: ${c.a} · ${c.b}`).join(' / ') : `스레드 보험 ↔ 인스타(${CROSS_DAYS}일 안 같은 글감), 스레드 유입 ↔ 클립(${CLIP_DAYS}일 안 같은 글) 모두 없어요. 클립은 ${count('clip')}편 기록돼 있어요.` });
const rep = pairs.filter((p) => p.v === 'republish');
if (rep.length) findings.push({ lv: 'ok', h: `지운 글을 다시 올린 것 ${rep.length}쌍 (문제 아님)`, p: rep.map((p) => p.b[2]).join(', ') });

const report = { today: TODAY, counts: Object.fromEntries(Object.keys(CH).map((c) => [c, count(c)])), deleted: items.filter((i) => i.deleted).length,
  total: items.length, findings, pairs, clus, cross, echo, silson: { n: silson30, of: ins30.length } };

// ── 출력 ──────────────────────────────────────────────
console.log(`채널 겹침 점검 ${TODAY} — ${items.length}건 (${Object.entries(report.counts).map(([c, n]) => `${CH[c]} ${n}`).join(' · ')})`);
for (const f of findings) console.log(`${f.lv === 'bad' ? '❌' : f.lv === 'warn' ? '⚠' : '✅'} ${f.h} — ${f.p}`);
if (args.includes('--list')) for (const p of pairs.filter((x) => x.v === 'same' || x.v === 'near')) console.log(`  ${p.v === 'same' ? '같음' : '비슷'} ${p.a[0]} ${CH[p.a[1]]} ${p.a[2]}  ↔  ${p.b[0]} ${CH[p.b[1]]} ${p.b[2]} (${p.gap}일)`);
const jsonOut = opt('--json');
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(report, null, 1));
const htmlOut = opt('--html');
if (htmlOut) { fs.writeFileSync(htmlOut, html(report)); console.log(`화면: ${htmlOut}`); }

function html(r) {
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const tile = (c, dot, sub) => `<div class="tile"><span><i class="dot" style="background:var(${dot})"></i>${CH[c]}</span><b>${r.counts[c]}</b><span>${sub}</span></div>`;
  const ths = r.counts['threads-insurance'] + r.counts['threads-blog'] + r.counts['threads-daily'];
  const data = JSON.stringify({ pairs: r.pairs, clus: r.clus }).replace(/</g, '\\u003c');
  return `<title>채널 겹침 점검</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;700&family=IBM+Plex+Mono:wght@500&display=swap">
<style>
/* 보고서: 요약 → 찾은 것 → 키워드 쌍 → 쏠림 → 채널 역할 → 12월 안 */
:root{--bg:#f6f7f8;--panel:#fff;--fg:#1b2329;--muted:#5d6b75;--line:#dde3e7;--accent:#0f6b73;--accent-soft:#e2f1f2;
--bad:#b42318;--bad-soft:#fdecea;--warn:#9a5b00;--warn-soft:#fdf3e1;--ok:#2e7d4f;--ok-soft:#e6f4ec;
--nv:#03a94d;--ts:#e5552b;--th:#333c44;--ig:#c13584;--cl:#2a62d8;
--sans:"IBM Plex Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif;--mono:"IBM Plex Mono",ui-monospace,Menlo,monospace}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#12171b;--panel:#1a2126;--fg:#e4e9ec;--muted:#98a6ae;--line:#2c363d;--accent:#5cc3ca;--accent-soft:#16393c;--bad:#ff8a7a;--bad-soft:#3a1c19;--warn:#f0b65c;--warn-soft:#3a2b12;--ok:#7fd3a0;--ok-soft:#173326;--nv:#3ed27f;--ts:#ff8a63;--th:#b8c3cb;--ig:#f07ab8;--cl:#7ea3ff;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#12171b;--panel:#1a2126;--fg:#e4e9ec;--muted:#98a6ae;--line:#2c363d;--accent:#5cc3ca;--accent-soft:#16393c;--bad:#ff8a7a;--bad-soft:#3a1c19;--warn:#f0b65c;--warn-soft:#3a2b12;--ok:#7fd3a0;--ok-soft:#173326;--nv:#3ed27f;--ts:#ff8a63;--th:#b8c3cb;--ig:#f07ab8;--cl:#7ea3ff;color-scheme:dark}
body{background:var(--bg);color:var(--fg);font-family:var(--sans);font-size:15px;line-height:1.65}
.wrap{max-width:980px;margin:0 auto;padding-block:28px 64px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));display:grid;gap:36px}
h1{font-size:26px;margin:0;text-wrap:balance}h2{font-size:19px;margin:0 0 4px;text-wrap:balance}p{margin:0}
.sub{color:var(--muted);font-size:14px}section{display:grid;gap:14px;min-width:0}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px}
.tile{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:12px 14px;display:grid;gap:2px}
.tile b{font-family:var(--mono);font-size:24px;font-variant-numeric:tabular-nums}.tile span{font-size:13px;color:var(--muted)}
.dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;vertical-align:1px}
.find{display:grid;gap:10px}
.f{background:var(--panel);border:1px solid var(--line);border-left:4px solid var(--c);border-radius:6px;padding:12px 14px;display:grid;gap:4px}
.f.bad{--c:var(--bad)}.f.warn{--c:var(--warn)}.f.ok{--c:var(--ok)}.f p{font-size:14px;color:var(--muted)}
.scroll{overflow-x:auto;background:var(--panel);border:1px solid var(--line);border-radius:8px}
table{border-collapse:collapse;width:100%;font-size:13.5px}
th,td{padding:8px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
th{font-size:12px;color:var(--muted);font-weight:500;white-space:nowrap}tr:last-child td{border-bottom:0}
td.num,.num{font-family:var(--mono);font-variant-numeric:tabular-nums;white-space:nowrap}
.pill{display:inline-block;font-size:12px;padding:1px 8px;border-radius:99px;white-space:nowrap;font-weight:500}
.p-bad{background:var(--bad-soft);color:var(--bad)}.p-warn{background:var(--warn-soft);color:var(--warn)}.p-ok{background:var(--ok-soft);color:var(--ok)}.p-mut{background:var(--line);color:var(--muted)}
.new{font-size:11px;color:var(--accent);font-weight:700;margin-left:4px}
.ch{font-size:12px;font-weight:700}.c-naver{color:var(--nv)}.c-tistory{color:var(--ts)}
.kw{font-weight:500}.ti{color:var(--muted);font-size:12.5px;display:block}
.filters{display:flex;flex-wrap:wrap;gap:8px}
.filters button{font:inherit;font-size:13px;border:1px solid var(--line);background:var(--panel);color:var(--fg);border-radius:99px;padding:4px 12px;cursor:pointer}
.filters button[aria-pressed="true"]{background:var(--accent);color:var(--panel);border-color:var(--accent)}
.filters button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.bar{height:8px;border-radius:4px;background:var(--accent)}
.roles{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px}
.role{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:14px;display:grid;gap:6px;align-content:start}
.role h3{margin:0;font-size:15px}.role p{font-size:13.5px}.role .rule{font-size:13px;color:var(--muted)}
.rec{background:var(--accent-soft);border-radius:8px;padding:16px 18px;display:grid;gap:8px}
.note{font-size:12.5px;color:var(--muted)}
</style>
<div class="wrap">
<header style="display:grid;gap:6px">
  <h1>채널 겹침 점검</h1>
  <p class="sub">${esc(r.today)} 기준 · 원고·발행 기록 ${r.total}건. 매일 아침 확인이 새로 만들어요 (보고만 하고 아무것도 막지 않아요).</p>
</header>
<section><h2>한눈에</h2><div class="tiles">
${tile('naver', '--nv', `그중 지운 글 ${r.deleted}`)}${tile('tistory', '--ts', '발행·예약')}
<div class="tile"><span><i class="dot" style="background:var(--th)"></i>스레드</span><b>${ths}</b><span>보험 ${r.counts['threads-insurance']} · 유입 ${r.counts['threads-blog']} · 일상 ${r.counts['threads-daily']}</span></div>
${tile('instagram', '--ig', '심의 카드뉴스')}${tile('clip', '--cl', r.counts.clip ? '올린 영상' : '11/9(월) 시작')}
</div></section>
<section><h2>찾은 것</h2><div class="find">
${r.findings.map((f) => `<div class="f ${f.lv}"><strong>${esc(f.h)}</strong><p>${esc(f.p)}</p></div>`).join('\n')}
</div></section>
<section><h2>네이버·티스토리 키워드 쌍</h2>
<p class="sub">메인 키워드가 같거나, 한쪽이 다른 쪽을 그대로 담거나, 글자 조각이 ${Math.round(NEAR * 100)}% 넘게 겹치는 글. <span class="new">새로</span> 는 ${NEW_DAYS}일 안에 생긴 쌍이에요.</p>
<div class="filters" role="group" aria-label="판정 거르기">
<button type="button" id="fl-same" data-v="same" aria-pressed="true">같은 키워드</button>
<button type="button" id="fl-near" data-v="near" aria-pressed="false">비슷</button>
<button type="button" id="fl-ok" data-v="ok" aria-pressed="false">확인함 (괜찮음)</button>
<button type="button" id="fl-rep" data-v="republish" aria-pressed="false">다시 올림</button>
<button type="button" id="fl-all" data-v="all" aria-pressed="false">전체</button>
</div>
<div class="scroll"><table><thead><tr><th>판정</th><th>먼저 쓴 글</th><th>나중 글</th><th>간격</th></tr></thead><tbody id="rows"></tbody></table></div>
</section>
<section><h2>주제 쏠림</h2>
<div class="scroll"><table><thead><tr><th>묶음</th><th>네이버</th><th>티스토리</th><th>스레드 보험</th><th>인스타</th><th style="width:32%">합계 (최근 30일)</th></tr></thead><tbody id="clus"></tbody></table></div>
<p class="note">제목·키워드 낱말로 나눈 대략적인 숫자예요. 칸 안 숫자는 전체, 괄호는 최근 30일.</p>
</section>
<section><h2>채널마다 할 일 (추천안)</h2>
<div class="rec"><p><strong>네이버가 주제를 정하고, 스레드·클립·인스타는 그 주제를 다른 모양으로 퍼뜨리고, 티스토리는 다른 질문을 맡아요.</strong></p>
<p style="font-size:14px">같은 검색창에서 다투는 건 네이버와 티스토리뿐이라 두 곳만 키워드를 엄격히 나누고, 퍼뜨리는 매체는 같은 글을 두 번 퍼뜨리지 않게만 해요. 검사기로 막는 것(B)·12월 캘린더(C)는 11/30 판정 때 정해요.</p></div>
<div class="roles">
<div class="role"><h3><i class="dot" style="background:var(--nv)"></i>네이버 블로그 · 하루 20</h3><p>홈판 + 검색. 그 주 묶음의 정본 글.</p><p class="rule">같은 메인 키워드와 비슷한 말을 90일 안에 다시 쓰지 않기. 다시 쓸 땐 다른 질문으로.</p></div>
<div class="role"><h3><i class="dot" style="background:var(--ts)"></i>티스토리 · 하루 5</h3><p>다음·구글의 작은 질문. 서류·계산·살림.</p><p class="rule">네이버가 지난 90일 동안 쓴 키워드와 비슷한 말은 쓰지 않기. 네이버도 티스토리 기록을 보게 하기.</p></div>
<div class="role"><h3><i class="dot" style="background:var(--th)"></i>스레드 · 하루 6</h3><p>일상 4 · 유입 1 (네이버 글 요약) · 보험 심의 1.</p><p class="rule">유입 글은 발행 1~3일 뒤 네이버 글 1편에 한 번만. 보험글의 실손·청구 비중은 ${Math.round(SILSON_MAX * 100)}% 아래로.</p></div>
<div class="role"><h3><i class="dot" style="background:var(--ig)"></i>인스타 · 심의 하루 3</h3><p>법·제도 카드뉴스 (게시는 멈춤).</p><p class="rule">스레드 보험글과 같은 글감이면 2주 띄우기.</p></div>
<div class="role"><h3><i class="dot" style="background:var(--cl)"></i>네이버 클립 · 하루 1</h3><p>네이버 글 → 20초 세로 영상.</p><p class="rule">그날 스레드 유입이 고른 글과 다른 글을 골라 퍼뜨리는 글 수를 늘리기.</p></div>
</div></section>
</div>
<script>
const D=${data};
const CH={naver:'네이버',tistory:'티스토리'};
const PILL={same:['p-bad','같은 키워드'],near:['p-warn','비슷'],ok:['p-ok','확인함'],republish:['p-mut','다시 올림']};
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const cell=x=>'<span class="ch c-'+x[1]+'">'+CH[x[1]]+'</span> <span class="num">'+x[0].slice(5)+'</span><br><span class="kw">'+esc(x[2])+'</span><span class="ti">'+esc(x[3])+'</span>';
function draw(v){
  const list=D.pairs.filter(p=>v==='all'||p.v===v);
  document.getElementById('rows').innerHTML=list.length?list.map(p=>'<tr><td><span class="pill '+PILL[p.v][0]+'">'+PILL[p.v][1]+'</span>'+(p.fresh?'<span class="new">새로</span>':'')+(p.note?'<span class="ti">'+esc(p.note)+'</span>':'')+'</td><td>'+cell(p.a)+'</td><td>'+cell(p.b)+'</td><td class="num">'+p.gap+'일</td></tr>').join(''):'<tr><td colspan="4" class="note">이 판정에 해당하는 쌍이 없어요.</td></tr>';
  document.querySelectorAll('.filters button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v===v)));
}
document.querySelectorAll('.filters button').forEach(b=>b.addEventListener('click',()=>{draw(b.dataset.v);try{localStorage.setItem('fl',b.dataset.v)}catch(e){}}));
let start='same';try{start=localStorage.getItem('fl')||start}catch(e){}
draw(start);
const C=['naver','tistory','threads-insurance','instagram'];
const tot=r=>C.reduce((s,c)=>s+(r.all[c]||0),0), t30=r=>C.reduce((s,c)=>s+(r.d30[c]||0),0);
const max=Math.max(1,...D.clus.map(tot));
document.getElementById('clus').innerHTML=D.clus.sort((a,b)=>tot(b)-tot(a)).map(r=>'<tr><td>'+esc(r.name)+'</td>'+C.map(c=>'<td class="num">'+(r.all[c]||0)+' <span class="note">('+(r.d30[c]||0)+')</span></td>').join('')+'<td><div style="display:flex;align-items:center;gap:8px"><div class="bar" style="width:'+(tot(r)/max*80)+'%"></div><span class="num">'+tot(r)+' ('+t30(r)+')</span></div></td></tr>').join('');
</script>
`;
}
