#!/usr/bin/env node
/**
 * 내 블로그 통계(관리자 화면)를 읽어 기록한다 — 유입 검색어, 글별 조회수, 방문 흐름.
 * 2026-10-02 사용자 승인: "무엇이 통했는지" 숫자로 보고 글감·제목을 고치려고.
 *
 * 클라우드는 네이버에 못 들어가므로 PC 의 자동화용 크롬(9222, 네이버 로그인 상태)에 붙어 읽는다.
 * 읽기만 한다 — 아무것도 누르거나 바꾸지 않는다. 연 탭만 닫는다 (브라우저는 닫지 않는다).
 * 통계 화면 모양을 아직 모르므로(실제로 돌려 보기 전) 화면마다 글자·스크린샷과,
 * 화면이 불러오는 통계 데이터(JSON 응답)를 그대로 남긴다. Claude 가 그걸 보고 읽는 법을 다듬는다.
 *
 *   node scripts/blog-stats.mjs seongdaeeyo --out dumps/blog-stats/2026-10-03
 *
 * 남기는 것 (<out>/):
 *   NN-<화면>.txt   화면 글자 (innerText)
 *   NN-<화면>.jpg   화면 캡처
 *   api-*.json      통계 화면이 받은 데이터 (주소에 stat 이 들어간 응답만)
 *   index.json      어느 화면을 열었고 무엇이 남았는지
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const id = argv.find((a, i) => !a.startsWith('--') && !['--out', '--cdp'].includes(argv[i - 1]));
const OUT = opt('--out', `dumps/blog-stats/${new Date().toISOString().slice(0, 10)}`);
const CDP = opt('--cdp', 'http://localhost:9222');
if (!id) { console.log('사용법: node scripts/blog-stats.mjs <내 블로그 아이디> [--out 폴더]'); process.exit(1); }

// 블로그 관리 → 내 블로그 통계. 주소가 바뀌었으면 첫 화면에서 통계 메뉴 링크를 모아 따라간다.
const PAGES = [
  ['today', `https://admin.blog.naver.com/${id}/stat/today`],
  ['visit', `https://admin.blog.naver.com/${id}/stat/visit`],
  ['search-keyword', `https://admin.blog.naver.com/${id}/stat/referer/search`],
  ['referer', `https://admin.blog.naver.com/${id}/stat/referer`],
  ['post-rank', `https://admin.blog.naver.com/${id}/stat/rank/cv`],
  ['post-rank-like', `https://admin.blog.naver.com/${id}/stat/rank/like`],
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (s) => console.log(s);

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  let browser;
  try { browser = await chromium.connectOverCDP(CDP); }
  catch (e) { console.error(`자동화용 크롬(${CDP})에 연결하지 못했어요: ${e.message.split('\n')[0]}`); process.exit(1); }
  const ctx = browser.contexts()[0] || await browser.newContext();
  const page = await ctx.newPage();
  const index = { id, at: new Date().toISOString(), pages: [], apis: [] };
  let apiN = 0;
  page.on('response', async (res) => {
    const u = res.url();
    if (!/stat/i.test(u) || !/json/i.test(res.headers()['content-type'] || '')) return;
    try {
      const body = await res.text();
      const f = `api-${String(++apiN).padStart(2, '0')}.json`;
      fs.writeFileSync(path.join(OUT, f), JSON.stringify({ url: u, status: res.status(), body: JSON.parse(body) }, null, 1));
      index.apis.push({ file: f, url: u.slice(0, 300) });
    } catch { /* 본문 없음 */ }
  });
  try {
    const seen = new Set();
    const queue = [...PAGES];
    for (let n = 1; queue.length && n <= 14; n++) {
      const [name, url] = queue.shift();
      if (seen.has(url)) { n--; continue; }
      seen.add(url);
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await sleep(4000);
        // 통계가 iframe 안에 있을 수 있어 모든 프레임 글자를 모은다
        const texts = [];
        for (const fr of page.frames()) texts.push(await fr.evaluate(() => document.body?.innerText || '').catch(() => ''));
        const text = texts.filter(Boolean).join('\n\n----- frame -----\n\n');
        const base = `${String(n).padStart(2, '0')}-${name}`;
        fs.writeFileSync(path.join(OUT, `${base}.txt`), `${page.url()}\n\n${text}`);
        await page.screenshot({ path: path.join(OUT, `${base}.jpg`), type: 'jpeg', quality: 55, fullPage: true }).catch(() => {});
        const login = /nid\.naver\.com|로그인/.test(page.url());
        index.pages.push({ name, url, landed: page.url(), chars: text.length, login });
        log(`  ${base}: ${text.length}자${login ? ' — 로그인 화면으로 갔어요 (네이버 로그인 풀림)' : ''}`);
        if (login) break;
        // 첫 화면에서 통계 메뉴 링크를 모아, 위 목록에 없던 화면도 연다
        if (n === 1) {
          const links = await page.evaluate(() => [...document.querySelectorAll('a[href*="/stat/"]')].map((a) => [a.textContent.trim().slice(0, 20), a.href]));
          for (const [t, h] of links) if (!seen.has(h) && !queue.some((q) => q[1] === h)) queue.push([`menu-${t.replace(/[^\p{L}\p{N}]+/gu, '_')}`, h]);
        }
      } catch (e) { log(`  ${name} 읽지 못함: ${e.message.split('\n')[0]}`); index.pages.push({ name, url, error: e.message.split('\n')[0] }); }
    }
  } finally {
    fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 1));
    await page.close().catch(() => {});
    // 사용자의 브라우저는 닫지 않는다 — 연결만 끊는다
  }
  log(`✅ 저장: ${OUT} (화면 ${index.pages.length}, 데이터 ${index.apis.length})`);
  process.exit(0);
}
main();
