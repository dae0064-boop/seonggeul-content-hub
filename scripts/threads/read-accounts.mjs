#!/usr/bin/env node
/**
 * 스레드 계정 글 읽어 오기 — 읽기만 한다. 누르지도, 올리지도, 좋아요·팔로우도 하지 않는다.
 * 2026-11-02 사용자: "이 세 명의 스레드 글감을 참고해서" — 클라우드에서는 threads.com 이 막혀,
 * PC 의 자동화용 크롬(9222)에 붙어 프로필을 스크롤하며 글자만 모은다 → Drive 로 올려 Claude 가 정리한다.
 *
 *   node scripts/threads/read-accounts.mjs [--out dumps/threads-read/<날짜>] [--cdp http://localhost:9222] [--scrolls 25] [아이디 ...]
 *
 * 아이디를 안 주면 아래 ACCOUNTS. 남기는 것: <out>/<아이디>.txt (글마다 ----- 로 나눔), <아이디>.jpg (첫 화면), result.json
 * 로그인 화면만 보이고 글이 하나도 없으면 종료 코드 3. 연 탭만 닫는다 (브라우저는 닫지 않는다).
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ACCOUNTS = ['yj_baeksbook', 'jei_7942', 'bohum.onepick'];
const argv = process.argv.slice(2);
if (argv.includes('--help')) { console.log(fs.readFileSync(new URL(import.meta.url)).toString().split('*/')[0]); process.exit(0); }
const flags = new Set(['--out', '--cdp', '--scrolls']);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const ids = argv.filter((a, i) => !a.startsWith('--') && !flags.has(argv[i - 1])).map((a) => a.replace(/^@/, ''));
const accounts = ids.length ? ids : ACCOUNTS;
const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const OUT = opt('--out', `dumps/threads-read/${today}`);
const CDP = opt('--cdp', 'http://localhost:9222');
const SCROLLS = Number(opt('--scrolls', 25));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP(CDP).catch((e) => { console.error(`자동화용 크롬(${CDP})에 붙지 못했어요: ${e.message}`); process.exit(2); });
const ctx = browser.contexts()[0] || (await browser.newContext());
const page = await ctx.newPage();
const result = { date: today, accounts: [] };
let anyPosts = false;
let loginWall = false;

for (const id of accounts) {
  const url = `https://www.threads.com/@${id}`;
  console.log(`▶ @${id} 읽는 중...`);
  const posts = new Map(); // 첫 80자 → 글
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(4000);
    await page.screenshot({ path: path.join(OUT, `${id}.jpg`), type: 'jpeg', quality: 60 }).catch(() => {});
    let still = 0;
    for (let s = 0; s < SCROLLS && still < 4; s++) {
      const before = posts.size;
      const got = await page.evaluate(() => {
        const boxes = [...document.querySelectorAll('div[data-pressable-container="true"]')];
        return boxes.map((b) => (b.innerText || '').trim()).filter((t) => t.length > 20);
      }).catch(() => []);
      for (const t of got) { const k = t.slice(0, 80); if (!posts.has(k) || posts.get(k).length < t.length) posts.set(k, t); }
      still = posts.size === before ? still + 1 : 0;
      await page.mouse.wheel(0, 2500).catch(() => {});
      await sleep(1800);
    }
    const body = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
    if (!posts.size) {
      if (/로그인|Log in|Sign up|가입/.test(body)) loginWall = true;
      fs.writeFileSync(path.join(OUT, `${id}-page.txt`), `${url}\n\n${body}`); // 글 상자를 못 찾았을 때 화면 글자 전체
    }
    fs.writeFileSync(path.join(OUT, `${id}.txt`), `${url}\n글 ${posts.size}개\n\n` + [...posts.values()].join('\n\n-----\n\n'));
    console.log(`  글 ${posts.size}개`);
    if (posts.size) anyPosts = true;
    result.accounts.push({ id, url, posts: posts.size });
  } catch (e) {
    console.log(`  ✗ 열지 못함: ${e.message.slice(0, 120)}`);
    result.accounts.push({ id, url, posts: 0, error: e.message.slice(0, 200) });
  }
}

fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(result, null, 1));
await page.close().catch(() => {});
await browser.close().catch(() => {}); // connectOverCDP 에서는 연결만 끊는다 — 사용자 크롬은 그대로
if (!anyPosts && loginWall) { console.log('로그인 화면만 보였어요.'); process.exit(3); }
process.exit(0);
