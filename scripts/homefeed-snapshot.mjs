#!/usr/bin/env node
/**
 * 네이버 홈판(모바일 첫 화면 아래 홈피드) 들여다보기 (2026-11-02 사용자 — "지금 하는 게 홈판에 노출될 확률이 있는지 네이버 홈판을 확인해 봐").
 *
 * 클라우드에서는 네이버가 막혀 있어 사용자 PC 에서만 돈다 (catchup-reserve 가 13·16·19·22시에 부른다).
 * 두 가지로 본다:
 *   login — 자동화용 크롬(9222, 사용자 네이버 로그인)에서 m.naver.com. 사용자 관심사로 맞춤된 화면이다.
 *   guest — 로그인 없는 새 브라우저(휴대폰 크기). 처음 온 사람에게 보이는 화면에 가깝다.
 * 홈판 카드(블로그·카페·포스트·뉴스·인플루언서 링크)의 제목·출처·순서를 모으고, 블로그 글이면 블로그 아이디를 남긴다.
 * 결과: <out>-login.json / -guest.json + 화면 캡처 jpg. Drive 로는 catchup-reserve 가 옮긴다 (GitHub 에 올리지 않는다).
 *
 *   node scripts/homefeed-snapshot.mjs --out dumps/homefeed/2026-11-02/1600 [--scrolls 18] [--only guest]
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { launch } from './lib/overlay.mjs';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const out = opt('--out', `dumps/homefeed/${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}`);
const scrolls = Number(opt('--scrolls', 18));
const only = opt('--only', '');
const CDP = process.env.CDP || 'http://localhost:9222';
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
fs.mkdirSync(path.dirname(out), { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function readFeed(page) {
  await page.goto('https://m.naver.com/', { waitUntil: 'domcontentloaded', timeout: 40000 });
  await sleep(3000);
  for (let i = 0; i < scrolls; i++) { await page.mouse.wheel(0, 1400); await sleep(900); }
  await sleep(1500);
  return page.evaluate(() => {
    const kind = (u) => /blog\.naver\.com/.test(u) ? '블로그' : /cafe\.naver\.com/.test(u) ? '카페' : /post\.naver\.com/.test(u) ? '포스트'
      : /in\.naver\.com/.test(u) ? '인플루언서' : /(n\.news|news|entertain|sports)\.naver\.com/.test(u) ? '뉴스' : /tv\.naver\.com|clip/.test(u) ? '영상·클립' : '';
    const seen = new Set(); const cards = [];
    for (const a of document.querySelectorAll('a[href]')) {
      const href = a.href; const k = kind(href);
      if (!k || seen.has(href)) continue;
      const t = (a.innerText || a.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
      if (t.length < 10) continue;
      seen.add(href);
      const y = a.getBoundingClientRect().top + window.scrollY;
      const box = a.closest('li, article, div[class*="card"], div[class*="item"]');
      const meta = (box?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 200);
      const blogId = (/blog\.naver\.com\/(?:PostView\.naver\?blogId=)?([A-Za-z0-9_-]+)/.exec(href) || [])[1] || '';
      cards.push({ y: Math.round(y), kind: k, title: t.slice(0, 120), url: href, blogId, meta });
    }
    cards.sort((a, b) => a.y - b.y);
    return { url: location.href, height: document.body.scrollHeight, cards: cards.map((c, i) => ({ rank: i + 1, ...c })) };
  });
}

function summary(name, r) {
  const by = {};
  for (const c of r.cards) by[c.kind] = (by[c.kind] || 0) + 1;
  return [`## ${name} — 카드 ${r.cards.length}개 (${Object.entries(by).map(([k, v]) => `${k} ${v}`).join(' · ')})`,
    ...r.cards.slice(0, 60).map((c) => `${c.rank}. [${c.kind}${c.blogId ? ` ${c.blogId}` : ''}] ${c.title}`)].join('\n');
}

const report = [`# 네이버 홈판 ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`];

if (only !== 'guest') {
  let browser;
  try {
    browser = await chromium.connectOverCDP(CDP, { timeout: 15000 });
    const ctx = browser.contexts()[0] || await browser.newContext();
    const page = await ctx.newPage();
    try {
      const s = await ctx.newCDPSession(page);
      await s.send('Network.setUserAgentOverride', { userAgent: MOBILE_UA });
      await s.send('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 2, mobile: true });
      const r = await readFeed(page);
      await page.screenshot({ path: `${out}-login.jpg`, type: 'jpeg', quality: 50 });
      fs.writeFileSync(`${out}-login.json`, JSON.stringify(r, null, 2));
      report.push(summary('로그인 화면 (내 관심사 맞춤)', r));
    } finally { await page.close().catch(() => {}); }
  } catch (e) { report.push(`## 로그인 화면 — 읽지 못함: ${e.message.split('\n')[0]}`); }
  // 사용자의 크롬은 닫지 않는다 — 연결만 끊는다 (CLAUDE.md 자동화 규칙)
  finally { /* connectOverCDP 연결은 프로세스가 끝나면 끊긴다 */ }
}

if (only !== 'login') {
  const browser = await launch();
  try {
    const ctx = await browser.newContext({ userAgent: MOBILE_UA, viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ko-KR' });
    const page = await ctx.newPage();
    const r = await readFeed(page);
    await page.screenshot({ path: `${out}-guest.jpg`, type: 'jpeg', quality: 50 });
    fs.writeFileSync(`${out}-guest.json`, JSON.stringify(r, null, 2));
    report.push(summary('로그인 없는 화면', r));
  } catch (e) { report.push(`## 로그인 없는 화면 — 읽지 못함: ${e.message.split('\n')[0]}`); }
  finally { await browser.close(); }
}

fs.writeFileSync(`${out}.txt`, report.join('\n\n') + '\n');
console.log(report.join('\n\n'));
process.exit(0);
