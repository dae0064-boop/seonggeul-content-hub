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

// state: 주소<TAB>결과<TAB>날짜 — 결과 = requested | indexed2
// 10/26 첫 판의 'indexed' 는 앞 글 결과를 잘못 읽었을 수 있어(크롤링됨-색인 안 됨 /78~/86 이 '이미 색인'으로 나옴) 믿지 않고 다시 검사한다.
const done = new Map();
if (fs.existsSync(STATE)) for (const l of fs.readFileSync(STATE, 'utf8').split(/\r?\n/)) { const [u, r] = l.split('\t'); if (u && r !== 'indexed') done.set(u, r); }
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
// 10/26 네 번째 판: 'URL 검사 용량 초과 — 용량은 매일 갱신됩니다' 창이 떴는데(그날 검사 100번 넘게 함) '할당량' 만 찾아 못 알아봤다
const QUOTA = /용량 초과|용량을 초과|할당량|quota/i;
// 검사(요청 아님)도 하루 한도가 있다 → 하루 검사 횟수를 묶어, 이미 색인된 글을 훑느라 한도를 다 쓰지 않게 한다
const MAX_INSPECT = Number(opt('--max-inspect', '30'));
const RESULT = /URL이 Google에 등록되어 있|URL is on Google|URL is not on Google|용량 초과|용량을 초과|할당량|quota/i;

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

    let streak = 0, inspected = 0;
    if (QUOTA.test(await readText(page))) { report.stop = 'quota'; say('오늘 URL 검사 용량이 이미 끝났어요 — 내일 이어서'); return; }
    for (const u of todo) {
      if (report.requested.length >= MAX) break;
      if (++inspected > MAX_INSPECT) { say(`오늘 검사 ${MAX_INSPECT}번을 다 써서 멈춤 — 내일 이어서`); break; }
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
        // 이 글의 검사 결과가 뜰 때까지 (최대 90초) — 화면에서 이 주소 아래쪽 첫 판정 줄만 읽는다(앞 글 결과를 잘못 읽지 않게)
        const key = u.replace('https://', '');
        const keyRe = new RegExp(`${key.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(?=\\s|$)`, 'g');
        let t = '', verdict = '';
        for (let i = 0; i < 45; i++) {
          await sleep(2000); t = await readText(page);
          if (QUOTA.test(t)) break;
          // 주소 뒤가 공백·줄끝인 자리만 (/1 이 /10 에 걸리지 않게), 그중 마지막 자리 아래 600자 안의 첫 판정
          const hits = [...t.matchAll(keyRe)];
          const at = hits.length ? hits.at(-1).index : -1;
          const m = at >= 0 && t.slice(at, at + 600).match(/URL이 Google에 등록되어 있(?:지 않음|지만|음)|URL is (?:not )?on Google/);
          if (m) { verdict = m[0]; break; }
        }
        if (QUOTA.test(t)) { report.stop = 'quota'; say('오늘 구글 용량(할당량)이 끝났어요 — 내일 이어서'); break; }
        if (!verdict) { report.failed.push({ u, why: 'no-result' }); say(`/${n} 검사 결과가 안 뜸`); await shot(`fail-${n}`); }
        else if (!/않음|not on/.test(verdict)) {
          note(u, 'indexed2'); report.indexed.push(u); say(`/${n} 이미 색인됨 (${verdict})`);
        } else {
          // 10/26 두 번째 판: 첫 글 뒤로는 '색인 생성 요청' 글자가 숨은 창 안에도 남아 첫 번째(숨은 것)를 누르려다 10초 초과 — 보이는 것만 누른다
          const all = page.getByText(/^(색인 생성 요청|REQUEST INDEXING|Request indexing)$/);
          let btn = null;
          for (let k = (await all.count()) - 1; k >= 0; k--) { const c = all.nth(k); if (await c.isVisible().catch(() => false)) { btn = c; break; } }
          if (!btn) { report.failed.push({ u, why: 'no-button' }); say(`/${n} 요청 단추를 못 찾음`); await shot(`fail-${n}`); }
          else {
            await btn.click({ timeout: 10000 }).catch(async () => { await btn.evaluate((el) => el.click()); });
            // 실제 URL 테스트 1~2분 → '색인 생성 요청됨' 또는 할당량 문구 (최대 3분)
            let r = '';
            for (let i = 0; i < 90; i++) { await sleep(2000); r = await readText(page); if (/색인 생성 요청됨|Indexing requested|용량 초과|용량을 초과|할당량|quota|문제가 발생|went wrong/i.test(r)) break; }
            if (QUOTA.test(r)) { report.stop = 'quota'; say('오늘 구글 용량(할당량)이 끝났어요 — 내일 이어서'); await shot('quota'); break; }
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
      streak = report.failed.at(-1)?.u === u ? streak + 1 : 0;
      if (streak >= 4) { report.stop = 'failing'; say('4편 연달아 실패해 멈춤 — 화면 기록을 Claude 가 본다'); break; }
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
