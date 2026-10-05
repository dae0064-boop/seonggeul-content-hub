#!/usr/bin/env node
/**
 * 자동화용 크롬(9222)에 네이버·티스토리 로그인이 살아 있는지 확인한다. 읽기만 한다.
 *
 *   node scripts/login-check.mjs                 확인만
 *   node scripts/login-check.mjs --open-login    로그인이 풀린 곳만 로그인 화면 탭을 열어 둔다
 *   node scripts/login-check.mjs --shots <폴더>  실제로 네이버 글쓰기·티스토리 관리 화면을 열어 캡처를 남긴다
 *                                                (launchers/login-test.cmd → Drive run-logs 로 올려 Claude 가 확인)
 *
 * 2026-10-05 사용자: "네이버는 로그인 유지를 해도 계속 입력하라고 한다".
 * 예전 chrome-login.cmd 는 로그인돼 있어도 매번 로그인 화면을 열었다 — 이제 풀린 곳만 연다.
 *
 * - 네이버: 로그인 쿠키(NID_AUT·NID_SES)가 있는지 본다. 페이지를 열지 않는다.
 * - 티스토리: 새 탭으로 <블로그>.tistory.com/manage 를 열어 로그인 화면으로 넘어가는지 본다. 확인한 탭은 닫는다.
 * - attach 한 크롬은 끄지 않는다 (사용자의 크롬이다).
 *
 * 종료 코드: 0 = 모두 로그인됨, 3 = 로그인이 필요한 곳이 있음, 2 = 화면을 열지 못해 확인 못 함, 1 = 크롬에 붙지 못함
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const openLogin = argv.includes('--open-login');
const shotsAt = argv.indexOf('--shots');
const shots = shotsAt >= 0 ? argv[shotsAt + 1] : '';
if (shots) fs.mkdirSync(shots, { recursive: true });
const cdp = process.env.CDP_URL || 'http://localhost:9222';
const blog = process.env.TISTORY_BLOG || 'seongdaeeyo';
const LOGIN = {
  naver: 'https://nid.naver.com/nidlogin.login',
  tistory: 'https://www.tistory.com/auth/login',
};

let browser;
try { browser = await chromium.connectOverCDP(cdp, { timeout: 15000 }); }
catch (e) {
  console.log(`❌ 자동화용 크롬(9222)에 붙지 못했어요: ${e.message.split('\n')[0]}`);
  process.exit(1);
}
const ctx = browser.contexts()[0];
const need = [];
let failed = false;

// 네이버 — 로그인 쿠키 (--shots 면 블로그 글쓰기 화면까지 실제로 열어 본다)
if (shots) {
  const page = await ctx.newPage();
  try {
    await page.goto('https://blog.naver.com/GoBlogWrite.naver', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);
    await page.screenshot({ path: path.join(shots, 'naver-write.png') }).catch(() => {});
    if (/nidlogin|nid\.naver\.com/.test(page.url())) { console.log(`⚠ 네이버 글쓰기 화면 대신 로그인 화면이 떴어요 (${page.url()})`); need.push('naver'); }
    else console.log(`✅ 네이버 블로그 글쓰기 화면 열림 (${page.url()})`);
  } catch (e) { failed = true; console.log(`⚠ 네이버 글쓰기 화면 확인 실패: ${e.message.split('\n')[0]}`); }
  await page.close({ runBeforeUnload: false }).catch(() => {});
} else try {
  const names = new Set((await ctx.cookies(['https://www.naver.com', 'https://nid.naver.com'])).map((c) => c.name));
  if (names.has('NID_AUT') && names.has('NID_SES')) console.log('✅ 네이버 로그인 유지됨');
  else { console.log('⚠ 네이버 로그인이 풀려 있어요'); need.push('naver'); }
} catch (e) { failed = true; console.log(`⚠ 네이버 확인 실패: ${e.message}`); }

// 티스토리 — 관리 화면이 열리는지
{
  const page = await ctx.newPage();
  try {
    await page.goto(`https://${blog}.tistory.com/manage`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    if (shots) await page.screenshot({ path: path.join(shots, 'tistory-manage.png') }).catch(() => {});
    if (/auth\/login|accounts\.kakao\.com|\/login/.test(page.url())) { console.log('⚠ 티스토리(카카오) 로그인이 풀려 있어요'); need.push('tistory'); }
    else console.log(`✅ 티스토리 로그인 유지됨 (${page.url()})`);
  } catch (e) { failed = true; console.log(`⚠ 티스토리 확인 실패: ${e.message.split('\n')[0]}`); }
  await page.close().catch(() => {});
}

if (need.length && openLogin) {
  for (const k of need) {
    const p = await ctx.newPage();
    await p.goto(LOGIN[k], { waitUntil: 'domcontentloaded' }).catch(() => {});
  }
  console.log('\n로그인 화면이 열린 탭에서만 로그인해 주세요. "로그인 상태 유지"에 체크하고,');
  if (need.includes('naver')) console.log('네이버는 로그인 버튼 아래 "IP보안"을 OFF 로 두세요 (노트북이 다른 인터넷에 붙으면 로그인이 풀려요).');
}
// 연결만 끊는다 — 크롬은 그대로 둔다
await browser.close().catch(() => {});
process.exit(need.length ? 3 : failed ? 2 : 0);
