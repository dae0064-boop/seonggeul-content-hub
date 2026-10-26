#!/usr/bin/env node
/**
 * 티스토리 상태를 하루 한 번 읽어 기록한다 — 방문 통계, 유입 경로·검색어, 애드센스 연동, 구글 색인.
 * 2026-10-14 사용자 요청: "티스토리 조회수가 너무 안 나온다, 왜 안 나오는지 확인하고 애드센스 등록이 됐는지도 확인".
 *
 * 클라우드는 tistory.com·google.com 에 들어가지 못하므로 PC 의 자동화용 크롬(9222, 카카오 로그인 상태)에 붙어 읽는다.
 * 읽기만 한다 — 글쓰기·설정 바꾸기·버튼 누르기를 하지 않는다 (화면 이동만). 연 탭만 닫는다 (브라우저는 닫지 않는다).
 * 관리 화면 주소를 아직 실제로 확인하지 못했으므로, 화면마다 글자·캡처와 화면이 받은 통계 데이터(JSON)를 그대로 남기고
 * 첫 관리 화면의 메뉴 링크(통계·수익·플러그인)를 모아 따라간다. Claude 가 Drive 에서 보고 읽는 법을 다듬는다.
 *
 *   node scripts/tistory-stats.mjs seongdaeeyo --out dumps/tistory-stats/2026-10-15
 *
 * 남기는 것 (<out>/):
 *   NN-<화면>.txt / .jpg   관리 화면 글자·캡처 (통계, 유입, 수익·애드센스)
 *   api-*.json            통계 화면이 받은 데이터
 *   public.json           공개 주소 확인 — ads.txt, robots.txt, sitemap.xml, 첫 화면의 애드센스 코드(ca-pub-)·사이트 확인 태그
 *   google-site.txt/.jpg  구글에서 site:<블로그>.tistory.com 검색 결과 (색인된 글이 있는지)
 *   serp-NN.txt           티스토리 글감 후보(content/calendar/tistory-queue.txt)의 구글 1페이지 — 상위 10개 주소·함께 묻는 질문
 *   index-check.json      색인 진단 — seongdaeeyo.com 이 열리는지·넘어가는지, 사이트맵 주소 갈래(글·목록·/m/)와 글 주소 상태(noindex·canonical)
 *   sc-N.txt / .jpg       서치 콘솔 '페이지'(색인 생성) 보고서 — 자동화용 크롬이 구글에 로그인돼 있을 때만 읽힌다
 *   index.json            무엇을 열었고 무엇이 남았는지
 *
 *   --index-only          색인 진단만 한다 (launchers/index-check.cmd, 2026-10-26)
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { tistoryRelogin, onLoginPage } from './lib/tistory-login.mjs';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const blog = argv.find((a, i) => !a.startsWith('--') && !['--out', '--cdp', '--serp-queue'].includes(argv[i - 1]));
const OUT = opt('--out', `dumps/tistory-stats/${new Date().toISOString().slice(0, 10)}`);
const CDP = opt('--cdp', 'http://localhost:9222');
const SERP_QUEUE = opt('--serp-queue', 'content/calendar/tistory-queue.txt');
const SERP_MAX = 8;
const INDEX_ONLY = argv.includes('--index-only');  // launchers/index-check.cmd — 색인 진단만 (지금 바로 볼 때)
if (!blog || argv.includes('--help')) {
  console.log('사용법: node scripts/tistory-stats.mjs <티스토리 아이디> [--out 폴더]   (읽기만 한다)');
  process.exit(blog ? 0 : 1);
}
const BASE = `https://${blog}.tistory.com`;
// 짐작한 관리 화면 주소 — 없으면 첫 화면 메뉴 링크로 찾아간다
const PAGES = [
  ['manage', `${BASE}/manage`],
  ['stat-visit', `${BASE}/manage/statistics/visit`],
  ['stat-refer', `${BASE}/manage/statistics/refer`],
  ['stat-keyword', `${BASE}/manage/statistics/keyword`],
  ['stat-post', `${BASE}/manage/statistics/entry`],
  ['revenue', `${BASE}/manage/revenue`],
];
const MENU = /statistic|stat|revenue|adsense|plugin|수익|통계|애드/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (s) => console.log(s);

async function publicCheck(page) {
  const out = {};
  for (const p of ['ads.txt', 'robots.txt', 'sitemap.xml']) {
    try {
      const r = await page.request.get(`${BASE}/${p}`, { timeout: 20000 });
      const t = await r.text();
      out[p] = { status: r.status(), head: t.slice(0, 600) };
    } catch (e) { out[p] = { error: e.message.split('\n')[0] }; }
  }
  try {
    const r = await page.request.get(`${BASE}/`, { timeout: 20000 });
    const html = await r.text();
    out.home = {
      status: r.status(),
      adsenseCode: [...new Set(html.match(/ca-pub-\d{10,20}/g) || [])],
      adsbygoogle: /adsbygoogle|pagead2\.googlesyndication\.com/.test(html),
      googleVerify: /google-site-verification/.test(html),
      naverVerify: /naver-site-verification/.test(html),
      kakaoAdfit: /ba\.daum\.net|adfit/i.test(html),
    };
  } catch (e) { out.home = { error: e.message.split('\n')[0] }; }
  return out;
}

// 사이트맵 주소를 갈래로 나눈다 — 글(/숫자, /entry/)만 색인되면 되고 카테고리·태그·/m/ 은 빠져도 정상
const urlKind = (u) => {
  const p = new URL(u).pathname;
  if (p === '/' || p === '') return 'home';
  if (/^\/m\//.test(p)) return 'mobile';
  if (/^\/(category|tag|guestbook|notice)/.test(p)) return 'list';
  if (/^\/(\d+|entry\/)/.test(p)) return 'post';
  return 'other';
};

async function indexCheck(page, ctx) {
  const DOMAIN = 'https://seongdaeeyo.com';
  const res = { at: new Date().toISOString() };
  // ① 개인 도메인이 열리는지, 티스토리 주소와 어느 쪽으로 넘어가는지 (넘김을 따라가지 않고 본다)
  const head = async (u) => {
    try {
      const r = await page.request.get(u, { timeout: 20000, maxRedirects: 0 });
      const h = r.headers();
      const out = { status: r.status(), location: h.location || null };
      if (r.status() === 200 && /html/.test(h['content-type'] || '')) {
        const html = await r.text();
        out.noindex = /<meta[^>]+name=["']robots["'][^>]+noindex/i.test(html) || /noindex/i.test(h['x-robots-tag'] || '');
        out.canonical = (html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i) || [])[1] || null;
      }
      return out;
    } catch (e) { return { error: e.message.split('\n')[0] }; }
  };
  res.domain = { home: await head(`${DOMAIN}/`), sitemap: await head(`${DOMAIN}/sitemap.xml`), tistoryHome: await head(`${BASE}/`) };
  // ② 사이트맵 안 주소를 갈래별로 세고, 글 주소 몇 개를 열어 상태·넘김·noindex·canonical 을 본다
  for (const sm of [`${DOMAIN}/sitemap.xml`, `${BASE}/sitemap.xml`]) {
    try {
      const r = await page.request.get(sm, { timeout: 20000 });
      const locs = [...(await r.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
      const kinds = {};
      for (const u of locs) { const k = urlKind(u); kinds[k] = (kinds[k] || 0) + 1; }
      const hosts = [...new Set(locs.map((u) => new URL(u).host))];
      const samples = [];
      for (const u of [...locs.filter((u) => urlKind(u) === 'post').slice(0, 8), ...locs.filter((u) => urlKind(u) !== 'post').slice(0, 4)]) {
        samples.push({ url: u, kind: urlKind(u), ...(await head(u)) });
      }
      res[sm] = { status: r.status(), finalUrl: r.url(), total: locs.length, hosts, kinds, samples };
    } catch (e) { res[sm] = { error: e.message.split('\n')[0] }; }
  }
  // ③ 서치 콘솔 '페이지' 보고서 — 자동화용 크롬이 구글에 로그인돼 있으면 사유 표가 읽힌다. 화면 이동만, 아무것도 누르지 않는다.
  //    속성 종류(도메인·URL 접두어)를 몰라서 셋 다 열어 본다.
  const props = ['sc-domain:seongdaeeyo.com', `${DOMAIN}/`, `${BASE}/`];
  res.searchConsole = [];
  for (const [i, p] of props.entries()) {
    const url = `https://search.google.com/search-console/index?resource_id=${encodeURIComponent(p)}&hl=ko`;
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(7000);
      const t = await page.evaluate(() => document.body?.innerText || '');
      const f = `sc-${i + 1}`;
      fs.writeFileSync(path.join(OUT, `${f}.txt`), `${p}\n${page.url()}\n\n${t}`);
      await page.screenshot({ path: path.join(OUT, `${f}.jpg`), type: 'jpeg', quality: 55, fullPage: true }).catch(() => {});
      const login = /accounts\.google\.com/.test(page.url());
      res.searchConsole.push({ property: p, file: f, login, chars: t.length, hasReasons: /색인이 생성되지 않는 이유|Why pages aren/.test(t) });
      log(`  서치 콘솔 ${p}: ${login ? '구글 로그인 화면 (자동화 크롬이 구글에 로그인 안 됨)' : `${t.length}자`}`);
      if (login) {
        // 사람이 로그인할 수 있게 서치 콘솔 탭 하나를 열어 두고 끝낸다 (index-check.cmd 를 다시 누르면 읽힌다)
        if (INDEX_ONLY) await (await ctx.newPage()).goto('https://search.google.com/search-console?hl=ko').catch(() => {});
        break;
      }
    } catch (e) { res.searchConsole.push({ property: p, error: e.message.split('\n')[0] }); }
  }
  fs.writeFileSync(path.join(OUT, 'index-check.json'), JSON.stringify(res, null, 1));
  log(`  색인 진단: seongdaeeyo.com ${res.domain.home.status ?? res.domain.home.error}${res.domain.home.location ? ` → ${res.domain.home.location}` : ''}`);
  return { domain: res.domain.home.status ?? 'error', sc: res.searchConsole.map((s) => s.login ? 'login' : s.hasReasons ? 'ok' : 'read') };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  let browser;
  try { browser = await chromium.connectOverCDP(CDP); }
  catch (e) { console.error(`자동화용 크롬(${CDP})에 연결하지 못했어요: ${e.message.split('\n')[0]}`); process.exit(1); }
  const ctx = browser.contexts()[0] || await browser.newContext();
  const page = await ctx.newPage();
  const index = { blog, at: new Date().toISOString(), pages: [], apis: [] };
  let apiN = 0;
  page.on('response', async (res) => {
    const u = res.url();
    if (!/statistic|stat|revenue|adsense/i.test(u) || !/json/i.test(res.headers()['content-type'] || '')) return;
    try {
      const f = `api-${String(++apiN).padStart(2, '0')}.json`;
      fs.writeFileSync(path.join(OUT, f), JSON.stringify({ url: u, status: res.status(), body: JSON.parse(await res.text()) }, null, 1));
      index.apis.push({ file: f, url: u.slice(0, 300) });
    } catch { /* 본문 없음 */ }
  });
  try {
    if (INDEX_ONLY) { index.indexCheck = await indexCheck(page, ctx); log(`✅ 색인 진단 저장: ${OUT}`); return; }
    // 1) 공개 주소 확인 (로그인 필요 없음)
    const pub = await publicCheck(page);
    fs.writeFileSync(path.join(OUT, 'public.json'), JSON.stringify(pub, null, 1));
    log(`  공개 확인: ads.txt ${pub['ads.txt']?.status ?? '?'} · sitemap ${pub['sitemap.xml']?.status ?? '?'} · 애드센스 코드 ${pub.home?.adsenseCode?.length ? pub.home.adsenseCode.join(',') : '없음'}`);

    // 2) 관리 화면 (통계·수익) — 화면 이동과 읽기만
    const seen = new Set();
    const queue = [...PAGES];
    for (let n = 1; queue.length && n <= 20; n++) {
      const [name, url] = queue.shift();
      if (seen.has(url)) { n--; continue; }
      seen.add(url);
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await sleep(4000);
        // 2026-10-15: 첫 실행에서 관리 화면이 로그인 화면으로 갔다 — 티스토리 세션만 끊긴 것이면
        // publish-tistory 처럼 "카카오계정으로 로그인" 버튼 하나로 돌아온다 (비밀번호는 넣지 않는다)
        if (onLoginPage(page) && !index.relogin) {
          const re = await tistoryRelogin(page, url, log);
          index.relogin = re.ok ? 'ok' : re.why;
          if (re.ok) { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {}); await sleep(4000); }
        }
        const texts = [];
        for (const fr of page.frames()) texts.push(await fr.evaluate(() => document.body?.innerText || '').catch(() => ''));
        const text = texts.filter(Boolean).join('\n\n----- frame -----\n\n');
        const base = `${String(n).padStart(2, '0')}-${name}`;
        fs.writeFileSync(path.join(OUT, `${base}.txt`), `${page.url()}\n\n${text}`);
        await page.screenshot({ path: path.join(OUT, `${base}.jpg`), type: 'jpeg', quality: 55, fullPage: true }).catch(() => {});
        const login = /accounts\.kakao\.com|tistory\.com\/auth\/login/.test(page.url());
        index.pages.push({ name, url, landed: page.url(), chars: text.length, login });
        log(`  ${base}: ${text.length}자${login ? ' — 로그인 화면으로 갔어요 (티스토리 로그인 풀림)' : ''}`);
        if (login) break;
        if (n === 1) {
          const links = await page.evaluate(() => [...document.querySelectorAll('a[href*="/manage/"]')].map((a) => [a.textContent.trim().slice(0, 20), a.href]));
          for (const [t, h] of links) {
            if (!t || !(MENU.test(h) || MENU.test(t))) continue;
            if (!seen.has(h) && !queue.some((q) => q[1] === h)) queue.push([`menu-${t.replace(/[^\p{L}\p{N}]+/gu, '_')}`, h]);
          }
        }
      } catch (e) { log(`  ${name} 읽지 못함: ${e.message.split('\n')[0]}`); index.pages.push({ name, url, error: e.message.split('\n')[0] }); }
    }

    // 3) 구글 색인 — site: 검색 한 번 (읽기만)
    try {
      await page.goto(`https://www.google.com/search?q=${encodeURIComponent(`site:${blog}.tistory.com`)}&hl=ko`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(3000);
      const t = await page.evaluate(() => document.body?.innerText || '');
      fs.writeFileSync(path.join(OUT, 'google-site.txt'), `${page.url()}\n\n${t}`);
      await page.screenshot({ path: path.join(OUT, 'google-site.jpg'), type: 'jpeg', quality: 55 }).catch(() => {});
      const hits = await page.evaluate((b) => new Set([...document.querySelectorAll('a[href]')].map((a) => a.href).filter((h) => h.includes(`${b}.tistory.com/`))).size, blog);
      index.google = { links: hits, captcha: /sorry\/index|unusual traffic|로봇이 아닙니다/i.test(page.url() + t) };
      log(`  구글 site: 검색 — 우리 글 링크 ${hits}개${index.google.captcha ? ' (구글 확인 화면이 떠서 못 셈)' : ''}`);
    } catch (e) { index.google = { error: e.message.split('\n')[0] }; }

    // 4) 구글 상단 확인 — 티스토리 글감 후보마다 구글 1페이지에 누가 있는지 (2026-10-14 사용자: 티스토리는 구글 상단 노출이 목표)
    //    content/calendar/tistory-queue.txt (한 줄에 하나, # 은 설명). 하루 SERP_MAX 개까지, 사이에 쉬어 구글 확인 화면을 피한다.
    const queue2 = fs.existsSync(SERP_QUEUE) ? fs.readFileSync(SERP_QUEUE, 'utf8').split(/\r?\n/).map((l) => l.replace(/#.*$/, '').trim()).filter(Boolean) : [];
    index.serp = [];
    for (const [i, q] of queue2.slice(0, SERP_MAX).entries()) {
      try {
        await sleep(8000 + Math.floor(Math.random() * 7000));
        await page.goto(`https://www.google.com/search?q=${encodeURIComponent(q)}&hl=ko&gl=kr`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await sleep(2500);
        const r = await page.evaluate(() => {
          const res = [];
          for (const h of document.querySelectorAll('a h3')) {
            const a = h.closest('a');
            if (a?.href && !/google\./.test(new URL(a.href).hostname)) res.push({ title: h.innerText.trim().slice(0, 80), url: a.href.slice(0, 200) });
          }
          return { res: res.slice(0, 10), text: document.body?.innerText || '' };
        });
        const captcha = /sorry\/index|unusual traffic|로봇이 아닙니다/i.test(page.url() + r.text);
        if (captcha) { index.serp.push({ q, captcha: true }); log(`  구글 "${q}": 확인 화면이 떠서 멈춤`); break; }
        const hosts = r.res.map((x) => new URL(x.url).hostname);
        const personal = hosts.filter((h) => /tistory\.com|blog\.naver\.com|brunch\.co\.kr|velog\.io|blogspot\.|wordpress\./.test(h)).length;
        // '함께 묻는 질문'·'관련 검색어'는 글자 그대로 남긴다 (화면 모양이 자주 바뀐다)
        const paa = (r.text.match(/(다른 사람들도 질문함|함께 묻는 질문|관련 검색어)[\s\S]{0,900}/) || [''])[0];
        fs.writeFileSync(path.join(OUT, `serp-${String(i + 1).padStart(2, '0')}.txt`), `${q}\n\n${r.res.map((x, k) => `${k + 1}. ${x.title} — ${x.url}`).join('\n')}\n\n${paa}`);
        index.serp.push({ q, top: hosts, personal, ours: hosts.filter((h) => h.startsWith(`${blog}.`)).length });
        log(`  구글 "${q}": 상위 ${hosts.length}개 중 개인 블로그 ${personal}개`);
      } catch (e) { index.serp.push({ q, error: e.message.split('\n')[0] }); }
    }

    // 5) 색인 진단 (2026-10-26 사용자 — 구글 메일 "새로운 이유로 인해 seongdaeeyo.com 사이트맵 페이지의 색인이 생성되지 않습니다",
    //    "너무 어려워, 너가 들어가서 확인해봐"). 클라우드는 못 들어가므로 여기서 읽기만 해 index-check.json·sc-*.txt 로 남긴다.
    try { index.indexCheck = await indexCheck(page, ctx); } catch (e) { index.indexCheck = { error: e.message.split('\n')[0] }; }
  } finally {
    fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 1));
    await Promise.race([page.close().catch(() => {}), sleep(5000)]);
    // 사용자의 브라우저는 닫지 않는다 — 연결만 끊는다
  }
  log(`✅ 저장: ${OUT} (화면 ${index.pages.length}, 데이터 ${index.apis.length})`);
  process.exit(0);
}
main().then(() => process.exit(0));
