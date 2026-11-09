#!/usr/bin/env node
/**
 * 네이버 블로그 2개 이어서 작업 시험 (2026-11-09 사용자 — "블로그 1 작업이 끝나면 블로그 2 로 다시 로그인해서 작업이 되는지 테스트").
 *
 * 한 크롬에서 로그아웃 → 다른 아이디 로그인을 매일 하지 않고, 블로그마다 자동화용 크롬(프로필)을 따로 둔다:
 *   블로그 1 = 9222 (%LOCALAPPDATA%\seonggeul-chrome, 지금 쓰는 것)
 *   블로그 2 = 9223 (%LOCALAPPDATA%\blog2-chrome) — 처음 한 번만 손으로 로그인, 그 뒤로는 프로필에 로그인이 남는다.
 * 이 시험은 실제 하루 순서대로 1 → 2 → 1 을 돈다: 각 크롬에 붙어 로그인 쿠키·내 블로그 아이디·글쓰기 화면을 확인하고,
 * 블로그 2 작업 뒤에도 블로그 1 로그인이 그대로인지 본다. 글을 쓰거나 저장하지 않는다. 크롬은 끄지 않고 연 탭만 닫는다.
 *
 *   node scripts/two-blog-test.mjs [--ports 9222,9223] [--shots <폴더>] [--wait-login <초>]
 *     --wait-login  로그인이 안 된 크롬이 있으면 그 크롬에 로그인 탭을 열고 이 시간까지 기다린다 (사람이 로그인)
 *
 * 종료 코드: 0 = 두 블로그 모두 이어서 작업 가능, 3 = 로그인 필요, 4 = 두 크롬이 같은 아이디, 2 = 화면을 못 열어 확인 못 함, 1 = 크롬에 못 붙음
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const opt = (k, d = '') => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const ports = opt('--ports', '9222,9223').split(',').map((s) => s.trim()).filter(Boolean);
const shots = opt('--shots');
const waitLogin = Number(opt('--wait-login', '0')) || 0;
const BASE = process.env.NAVER_BASE || 'https://blog.naver.com'; // 시험용으로만 바꾼다
if (shots) fs.mkdirSync(shots, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (s) => console.log(s);

async function attach(port) {
  try { return await chromium.connectOverCDP(`http://localhost:${port}`, { timeout: 15000 }); }
  catch (e) { say(`❌ 크롬(${port})에 붙지 못했어요: ${e.message.split('\n')[0]}`); return null; }
}
async function loggedIn(ctx) {
  const names = new Set((await ctx.cookies(['https://www.naver.com', 'https://nid.naver.com', 'https://blog.naver.com'])).map((c) => c.name));
  return names.has('NID_AUT') && names.has('NID_SES');
}

/** 한 크롬에서 블로그 작업 한 번: 로그인 쿠키 → 내 블로그 아이디 → 글쓰기 화면. */
async function round(label, port) {
  const r = { label, port, login: false, id: '', write: false, error: '' };
  const browser = await attach(port);
  if (!browser) { r.error = 'attach'; return r; }
  const ctx = browser.contexts()[0];
  try {
    r.login = await loggedIn(ctx);
    if (!r.login && waitLogin > 0) {
      say(`   ${label}: 로그인이 안 돼 있어요 → 그 크롬에 로그인 탭을 열었어요. ${Math.round(waitLogin / 60)}분까지 기다려요.`);
      const lp = await ctx.newPage();
      await lp.goto('https://nid.naver.com/nidlogin.login', { timeout: 30000 }).catch(() => {});
      await lp.bringToFront().catch(() => {});
      const until = Date.now() + waitLogin * 1000;
      while (Date.now() < until && !(r.login = await loggedIn(ctx))) await sleep(5000);
      if (r.login) await lp.close().catch(() => {}); // 로그인 끝난 탭만 닫는다 (안 됐으면 그대로 둔다)
    }
    if (!r.login) { say(`⚠ ${label} (크롬 ${port}): 네이버 로그인이 없어요`); return r; }
    const page = await ctx.newPage();
    try {
      // 내 블로그 → blog.naver.com/<아이디> 로 넘어간다
      await page.goto(`${BASE}/MyBlog.naver`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(2500);
      const m = /blog\.naver\.com\/(?:PostList\.naver\?blogId=)?([A-Za-z0-9_-]+)/.exec(page.url()) || /blogId=([A-Za-z0-9_-]+)/.exec(page.url());
      r.id = m && !/^(MyBlog|GoBlogWrite|PostList)/.test(m[1]) ? m[1] : '';
      await page.goto(`${BASE}/GoBlogWrite.naver`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(4000);
      if (shots) await page.screenshot({ path: path.join(shots, `${label.replace(/\s/g, '-')}-write.png`) }).catch(() => {});
      r.write = !/nidlogin|nid\.naver\.com/.test(page.url());
      say(`${r.write ? '✅' : '⚠'} ${label} (크롬 ${port}): 아이디 ${r.id || '(못 읽음)'} · 글쓰기 화면 ${r.write ? '열림' : '대신 로그인 화면'}`);
    } catch (e) { r.error = e.message.split('\n')[0]; say(`⚠ ${label} (크롬 ${port}) 화면 확인 실패: ${r.error}`); }
    await page.close({ runBeforeUnload: false }).catch(() => {});
  } finally { /* 사용자의 크롬 — 끄지 않고 연결만 끊는다 */ }
  return r;
}

const [p1, p2] = ports;
say(`블로그 2개 이어서 작업 시험 — 블로그 1 = 크롬 ${p1}, 블로그 2 = 크롬 ${p2}`);
const a = await round('블로그1 작업', p1);
const b = await round('블로그2 작업', p2);
const a2 = await round('블로그1 다시', p1); // 블로그 2 작업 뒤에도 1 의 로그인이 그대로인가

const rs = [a, b, a2];
let code = 0, why = '두 블로그 모두 로그아웃 없이 이어서 작업할 수 있어요';
if (rs.some((r) => r.error === 'attach')) { code = 1; why = '크롬에 붙지 못함'; }
else if (rs.some((r) => !r.login)) { code = 3; why = `로그인 필요: ${[...new Set(rs.filter((r) => !r.login).map((r) => `크롬 ${r.port}`))].join(', ')}`; }
else if (rs.some((r) => r.error || !r.write)) { code = 2; why = '화면을 열지 못해 확인 못 함'; }
else if (a.id && b.id && a.id === b.id) { code = 4; why = `두 크롬이 같은 아이디(${a.id})예요 — 블로그 2 크롬에서 로그아웃 후 다른 아이디로 로그인`; }
else if (a.id && a2.id && a.id !== a2.id) { code = 4; why = `블로그 1 아이디가 바뀌었어요 (${a.id} → ${a2.id})`; }
say(`\n결과: ${code === 0 ? '✅' : '⚠'} ${why} (코드 ${code})`);
if (shots) fs.writeFileSync(path.join(shots, 'result.json'), JSON.stringify({ code, why, rounds: rs }, null, 2));
process.exit(code);
