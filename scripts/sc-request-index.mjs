#!/usr/bin/env node
/**
 * 구글 서치 콘솔 'URL 검사' → 색인이 안 된 티스토리 글만 '색인 생성 요청'을 누른다.
 * 2026-10-26 사용자: "90편 색인 생성 요청해줘" (서치 콘솔 '발견됨 - 현재 색인이 생성되지 않음' 90편).
 *
 * 구글은 속성마다 하루 약 10개까지만 받는다 → 하루 --max 개(기본 10)씩, 할당량 문구가 뜨면 바로 멈춘다.
 * 요청한 주소는 --state 파일(두 PC 가 나눠 쓰게 Drive)에 남겨 다시 요청하지 않는다. 이미 '등록되어 있음'인 글도 남겨 건너뛴다.
 * 누르는 단추는 '색인 생성 요청'과 끝난 뒤 창 닫기('확인'·'닫기')뿐이다. 삭제·유효성 검사·설정은 누르지 않는다.
 *
 *   node scripts/sc-request-index.mjs --state <requested.tsv> --out <폴더> [--max 10]
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const SITE = 'https://seongdaeeyo.com/';
const SC = process.env.SC_TEST_BASE || 'https://search.google.com/search-console';  // 가짜 화면 시험용
const SITEMAP = process.env.SC_TEST_SITEMAP || `${SITE}sitemap.xml`;
const STATE = opt('--state', 'dumps/sc-requested.tsv');
const OUT = opt('--out', `dumps/sc-request/${new Date().toISOString().slice(0, 10)}`);
const MAX = Number(opt('--max', '10'));
const CDP = opt('--cdp', 'http://localhost:9222');
if (argv.includes('--help')) { console.log('사용법: node scripts/sc-request-index.mjs --state <파일> --out <폴더> [--max 10]'); process.exit(0); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (s) => console.log(s);
const today = new Date().toISOString().slice(0, 10);
// 2026-10-26 첫 실행: 서치 콘솔 검사 화면은 열린 뒤 스스로 한 번 더 이동해 'Execution context was destroyed'·'interrupted by another navigation' 으로
// 처음 3편이 모두 실패했다. → 이동 중이면 잠깐 기다렸다 다시 읽고, 다음 글로 가기 전 빈 화면으로 이동을 끊는다.
const readText = async (page) => {
  for (let i = 0; i < 8; i++) {
    try { return await page.evaluate(() => document.body?.innerText || ''); } catch { await sleep(1500); }
  }
  return '';
};

// state: 주소<TAB>결과<TAB>날짜 — 결과 = requested | indexed
const done = new Map();
if (fs.existsSync(STATE)) for (const l of fs.readFileSync(STATE, 'utf8').split(/\r?\n/)) { const [u, r] = l.split('\t'); if (u) done.set(u, r); }
const note = (u, r) => { done.set(u, r); fs.mkdirSync(path.dirname(STATE), { recursive: true }); fs.appendFileSync(STATE, `${u}\t${r}\t${today}\n`); };

// 2026-10-26 두 번째 실행도 실패(사용자 "계속 오류 뜨는 거 같아, 다시 구성해봐") → 글마다 검사 주소를 새로 여는 방식을 버리고,
// 사람이 하는 그대로 서치 콘솔을 한 번 연 뒤 맨 위 'URL 검사' 칸에 주소를 넣고 Enter 한다 (화면이 새로 열리지 않아 이동 충돌이 없다).
// 진행 기록(sc-request.json·log.txt)은 글 하나마다 다시 써서 도중에 창을 닫아도 어디까지 됐는지 남는다.
const SEARCH = ['input[aria-label*="검사"]', 'input[placeholder*="검사"]', 'input[aria-label*="Inspect"]', 'input[placeholder*="Inspect"]', 'header input[type="text"]', 'input[type="text"]'];
async function searchBox(page) {
  for (const sel of SEARCH) {
    const el = page.locator(sel).first();
    if (await el.count() && await el.isVisible().catch(() => false)) return el;
  }
  return null;
}
const RESULT = /URL이 Google에 등록되어 있|URL is on Google|URL is not on Google|할당량|quota/i;

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const logFile = path.join(OUT, 'log.txt');
  const say = (s) => { log(s); fs.appendFileSync(logFile, `${new Date().toTimeString().slice(0, 8)} ${s}\n`); };
  let browser;
  try { browser = await chromium.connectOverCDP(CDP); }
  catch (e) { console.error(`자동화용 크롬(${CDP})에 연결하지 못했어요: ${e.message.split('\n')[0]}`); process.exit(1); }
  const ctx = browser.contexts()[0] || await browser.newContext();
  const page = await ctx.newPage();
  const report = { at: new Date().toISOString(), requested: [], indexed: [], failed: [], stop: null };
  const save = () => fs.writeFileSync(path.join(OUT, 'sc-request.json'), JSON.stringify(report, null, 1));
  const shot = async (name) => {
    await page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: 'jpeg', quality: 55 }).catch(() => {});
    fs.writeFileSync(path.join(OUT, `${name}.txt`), `${page.url()}\n\n${await readText(page)}`);
  };
  try {
    // 사이트맵의 글 주소(/숫자)만, 오래된 글부터 — '발견됨' 90편은 대부분 옛 글이다
    const xml = await (await page.request.get(SITEMAP, { timeout: 20000 })).text();
    const posts = [...new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim()).filter((u) => /^https:\/\/seongdaeeyo\.com\/\d+$/.test(u)))]
      .sort((a, b) => Number(a.split('/').pop()) - Number(b.split('/').pop()));
    const todo = posts.filter((u) => !done.has(u));
    say(`사이트맵 글 ${posts.length}편 · 남은 확인 ${todo.length}편 · 오늘 최대 ${MAX}편 요청`);

    // 서치 콘솔 첫 화면 한 번만 연다
    await page.goto(`${SC}?resource_id=${encodeURIComponent(SITE)}&hl=ko`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    await sleep(8000);
    if (/accounts\.google\.com/.test(page.url())) { report.stop = 'login'; say('구글 로그인 화면 — 자동화 크롬이 구글에 로그인 안 됨'); await shot('login'); return; }
    if (!(await searchBox(page))) { report.stop = 'no-search-box'; say("맨 위 'URL 검사' 칸을 못 찾음 — 화면 기록을 Claude 가 본다"); await shot('start'); return; }
    await shot('start');

    for (const u of todo) {
      if (report.requested.length >= MAX) break;
      const n = u.split('/').pop();
      try {
        // 열려 있는 창(앞 글 결과 창 등)을 닫고 검색칸에 주소 넣기
        await page.keyboard.press('Escape').catch(() => {});
        const box = await searchBox(page);
        if (!box) { report.failed.push({ u, why: 'no-search-box' }); say(`/${n} 검색칸을 못 찾음`); await shot(`fail-${n}`); continue; }
        await box.click({ timeout: 10000 });
        await box.fill('');
        await box.fill(u);
        await box.press('Enter');
        // 이 글의 검사 결과가 뜰 때까지 (최대 90초) — 앞 글 결과를 잘못 읽지 않게 화면에 이 주소가 있는지도 본다
        let t = '';
        for (let i = 0; i < 45; i++) { await sleep(2000); t = await readText(page); if (RESULT.test(t) && t.includes(u.replace('https://', ''))) break; }
        if (/할당량|quota/i.test(t)) { report.stop = 'quota'; say('오늘 할당량이 끝났어요'); break; }
        if (!RESULT.test(t)) { report.failed.push({ u, why: 'no-result' }); say(`/${n} 검사 결과가 안 뜸`); await shot(`fail-${n}`); }
        else if (/URL이 Google에 등록되어 있(음|지만)|URL is on Google/.test(t) && !/등록되어 있지 않음|URL is not on Google/.test(t)) {
          note(u, 'indexed'); report.indexed.push(u); say(`/${n} 이미 색인됨`);
        } else {
          const btn = page.getByText(/^(색인 생성 요청|REQUEST INDEXING|Request indexing)$/).first();
          if (!(await btn.count())) { report.failed.push({ u, why: 'no-button' }); say(`/${n} 요청 단추를 못 찾음`); await shot(`fail-${n}`); }
          else {
            await btn.click({ timeout: 10000 });
            // 실제 URL 테스트 1~2분 → '색인 생성 요청됨' 또는 할당량 문구 (최대 3분)
            let r = '';
            for (let i = 0; i < 90; i++) { await sleep(2000); r = await readText(page); if (/색인 생성 요청됨|Indexing requested|할당량|quota|문제가 발생|went wrong/i.test(r)) break; }
            if (/할당량|quota/i.test(r)) { report.stop = 'quota'; say('오늘 할당량이 끝났어요'); await shot('quota'); break; }
            if (/색인 생성 요청됨|Indexing requested/i.test(r)) { note(u, 'requested'); report.requested.push(u); say(`/${n} 색인 생성 요청됨`); }
            else { report.failed.push({ u, why: 'no-confirm' }); say(`/${n} 요청 결과를 확인 못 함`); await shot(`fail-${n}`); }
            for (const name of ['확인', '닫기', 'Got it', 'Dismiss']) { const b = page.getByRole('button', { name, exact: true }).first(); if (await b.count()) { await b.click({ timeout: 5000 }).catch(() => {}); break; } }
          }
        }
        await sleep(2000);
      } catch (e) {
        report.failed.push({ u, why: e.message.split('\n')[0] }); say(`/${n} 실패: ${e.message.split('\n')[0]}`);
        await shot(`fail-${n}`);
      }
      save();
      if (report.failed.length >= 3 && !report.requested.length && !report.indexed.length) { report.stop = 'failing'; say('처음 3편이 모두 실패해 멈춤 — 화면 기록을 Claude 가 본다'); break; }
    }
    report.left = posts.filter((u) => !done.has(u)).length;
  } catch (e) {
    report.stop = `error: ${e.message.split('\n')[0]}`;
    say(`멈춤: ${report.stop}`);
  } finally {
    save();
    await Promise.race([page.close().catch(() => {}), sleep(5000)]);
    // 사용자의 브라우저는 닫지 않는다
  }
  say(`✅ 요청 ${report.requested.length}편 · 이미 색인 ${report.indexed.length}편 · 실패 ${report.failed.length}편 · 남은 글 ${report.left ?? '?'}편${report.stop ? ` (멈춤: ${report.stop})` : ''}`);
}
main().then(() => process.exit(0));
