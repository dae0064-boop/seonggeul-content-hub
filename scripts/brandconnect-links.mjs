#!/usr/bin/env node
/**
 * 네이버 쇼핑 커넥트 링크를 PC 에서 저절로 만든다 (2026-10-26 사용자 — "링크를 너가 직접 만드는 방향으로, 나에게 만들라고 하지 말아줘").
 * 클라우드는 naver.com 이 막혀 있어서, 아침 PC 의 자동화용 크롬(9222, 네이버 로그인 상태)에 붙어 한다.
 *
 *   node scripts/brandconnect-links.mjs [--max 2] [--out dumps/brandconnect/<날짜>] [--dry-run] [키워드 ...]
 *
 * 순서: brandconnect.naver.com → 쇼핑 커넥트 → 상품 검색(키워드) → 리뷰 많은순(없으면 판매순) →
 *       후기·구매 수가 가장 큰 상품의 '링크' 버튼 → 새로 나타난 naver 주소(창·복사창·클립보드)를 읽는다.
 * 지키는 것: 구매·결제·신청·동의·설정·삭제·로그아웃 같은 글자가 있는 버튼은 누르지 않는다. 연 탭만 닫는다(브라우저는 닫지 않는다).
 * 쇼핑 커넥트 화면을 아직 실제로 본 적이 없어 단계마다 화면 글자·캡처·받은 JSON 을 남긴다 — 아침 확인이 Drive 에서 보고 고친다.
 *
 * 키워드: 인자 → 없으면 앞으로 나갈 원고(content/posts)의 brandconnect: → content/affiliate/brandconnect-wanted.txt 순.
 *         이미 링크가 있는 키워드는 건너뛴다.
 * 남기는 것: dumps/brandconnect-links.local.tsv (이 PC 의 발행이 바로 쓴다 — lib/brandconnect.mjs loadLinks)
 *            <out>/result.json, NN-*.txt/jpg, api-*.json  (Drive ClaudeWorkspace/brandconnect/<날짜>/ 로 올라간다 → 아침 확인이 저장소 목록에 옮긴다)
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { LINK_RE, LOCAL_LINKS_FILE, loadLinks } from './lib/brandconnect.mjs';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const OUT = opt('--out', `dumps/brandconnect/${today}`);
const CDP = opt('--cdp', 'http://localhost:9222');
const MAX = Number(opt('--max', 2));
const DRY = argv.includes('--dry-run');
const START = opt('--start', 'https://brandconnect.naver.com/');  // 시험용으로만 바꾼다
if (argv.includes('--help')) { console.log(fs.readFileSync(new URL(import.meta.url)).toString().split('*/')[0]); process.exit(0); }
const argKw = argv.filter((a, i) => !a.startsWith('--') && !['--out', '--cdp', '--max', '--start'].includes(argv[i - 1]));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (s) => console.log(s);
// 누르면 안 되는 버튼 (사용자 — 상품을 사거나 다른 설정을 바꾸지 말 것)
const DENY = /구매|결제|주문|장바구니|찜|신청|동의|설정|정산|계좌|삭제|해지|해제|탈퇴|로그아웃|수정|등록|저장|발행|공유하기/;
const MENU = ['쇼핑 커넥트', '쇼핑커넥트', '상품 찾기', '상품 검색', '상품 탐색'];
const LINK_BTN = /^(링크\s*(복사|생성|만들기|발급|받기)?|(복사|생성)\s*링크|URL\s*복사|홍보\s*링크.*)$/i;
const COPY_BTN = /^(링크\s*)?(복사|복사하기|URL\s*복사)$/i;
const URL_IN = /https:\/\/(?:naver\.me|(?:[a-z0-9-]+\.)*naver\.com)\/[A-Za-z0-9/_\-?=&.%]+/g;

function pickKeywords() {
  const have = loadLinks();
  const list = [];
  const add = (k) => { k = (k || '').trim(); if (k && !have.has(k) && !list.includes(k)) list.push(k); };
  if (argKw.length) argKw.forEach(add);
  else {
    const dir = 'content/posts';
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.md') && f.slice(0, 10) >= today).sort()) {
        const m = fs.readFileSync(path.join(dir, f), 'utf8').match(/^brandconnect:\s*(.+)$/m);
        if (m) add(m[1]);
      }
    }
    const w = 'content/affiliate/brandconnect-wanted.txt';
    if (fs.existsSync(w)) fs.readFileSync(w, 'utf8').split(/\r?\n/).map((l) => l.replace(/#.*$/, '')).forEach(add);
  }
  return list.slice(0, MAX);
}

let shotN = 0;
async function dump(page, name) {
  const base = path.join(OUT, `${String(++shotN).padStart(2, '0')}-${name}`);
  const texts = [];
  for (const fr of page.frames()) texts.push(await fr.evaluate(() => document.body?.innerText || '').catch(() => ''));
  fs.writeFileSync(`${base}.txt`, `${page.url()}\n\n${texts.filter(Boolean).join('\n\n----- frame -----\n\n')}`);
  await page.screenshot({ path: `${base}.jpg`, type: 'jpeg', quality: 55, fullPage: true }).catch(() => {});
}

/** 보이는 버튼·링크 중 글자가 정확히 맞는 것을 누른다 (DENY 글자는 절대 안 누름). 새 탭이 열리면 그 탭을 돌려준다 */
async function clickText(page, texts) {
  for (const t of texts) {
    for (const fr of page.frames()) {
      const loc = fr.locator('a, button, [role="tab"], [role="menuitem"], [role="button"], li, span').filter({ hasText: new RegExp(`^\\s*${t}\\s*$`) });
      const n = await loc.count().catch(() => 0);
      for (let i = 0; i < n; i++) {
        const el = loc.nth(i);
        if (!(await el.isVisible().catch(() => false))) continue;
        const txt = (await el.innerText().catch(() => '')).trim();
        if (DENY.test(txt)) continue;
        const popup = page.context().waitForEvent('page', { timeout: 5000 }).catch(() => null);
        await el.click({ timeout: 5000 }).catch(() => {});
        const np = await popup;
        if (np) { await np.waitForLoadState('domcontentloaded').catch(() => {}); await sleep(3000); return { clicked: t, page: np }; }
        await sleep(3000);
        return { clicked: t, page };
      }
    }
  }
  return null;
}

async function findSearchBox(page) {
  for (const fr of page.frames()) {
    const loc = fr.locator('input[type="search"], input[placeholder*="검색"], input[placeholder*="상품"], input[type="text"]');
    const n = await loc.count().catch(() => 0);
    for (let i = 0; i < n; i++) if (await loc.nth(i).isVisible().catch(() => false)) return loc.nth(i);
  }
  return null;
}

/** 페이지 안 '링크' 버튼마다 상품 카드 글자를 모아 후기·구매 수를 읽는다 */
async function readCards(page) {
  const cards = [];
  for (const [fi, fr] of page.frames().entries()) {
    const got = await fr.evaluate(({ src }) => {
      const re = new RegExp(src, 'i');
      const num = (s) => Math.round((parseFloat(String(s).replace(/,/g, '')) || 0) * (/만/.test(s) ? 10000 : 1));
      const btns = [...document.querySelectorAll('a, button, [role="button"]')].filter((b) => re.test((b.innerText || b.getAttribute('aria-label') || '').trim()) && b.offsetParent);
      return btns.map((b, idx) => {
        b.setAttribute('data-sg-link', String(idx));
        let card = b;
        for (let k = 0; k < 8 && card.parentElement; k++) {
          card = card.parentElement;
          const t = card.innerText || '';
          if (t.length > 30 && /원/.test(t)) break;
        }
        const t = (card.innerText || '').replace(/\s+\n/g, '\n');
        const rv = t.match(/(?:리뷰|후기|상품평)\s*\(?\s*([\d,.]+\s*만?)/);
        const sl = t.match(/(?:구매|판매)\s*(?:건수|수|량)?\s*([\d,.]+\s*만?)/);
        return { idx, text: t.slice(0, 300), review: rv ? num(rv[1]) : 0, sales: sl ? num(sl[1]) : 0 };
      });
    }, { src: LINK_BTN.source }).catch(() => []);
    for (const c of got) cards.push({ ...c, frame: fi });
  }
  return cards;
}

async function collectUrls(page, extraBodies) {
  const set = new Set();
  for (const fr of page.frames()) {
    const s = await fr.evaluate(() => [document.body?.innerText || '', ...[...document.querySelectorAll('input, textarea')].map((e) => e.value)].join('\n')).catch(() => '');
    (s.match(URL_IN) || []).forEach((u) => set.add(u));
  }
  for (const b of extraBodies) (b.match(URL_IN) || []).forEach((u) => set.add(u));
  return set;
}

async function readClipboard(page) {
  await page.bringToFront().catch(() => {});
  return page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
}

async function makeOne(ctx, kw) {
  const r = { keyword: kw, ok: false, steps: [] };
  const page = await ctx.newPage();
  const bodies = [];
  let apiN = 0;
  page.on('response', async (res) => {
    if (!/json/i.test(res.headers()['content-type'] || '')) return;
    try {
      const body = await res.text();
      bodies.push(body);
      if (apiN < 40) fs.writeFileSync(path.join(OUT, `api-${kw}-${String(++apiN).padStart(2, '0')}.json`), JSON.stringify({ url: res.url(), status: res.status(), body: body.slice(0, 200000) }));
    } catch { /* 본문 없음 */ }
  });
  let cur = page;
  try {
    await cur.goto(START, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(4000);
    await dump(cur, `${kw}-home`);
    if (/nid\.naver\.com/.test(cur.url())) { r.why = '네이버 로그인이 풀려 있어요 (launchers\\chrome-login.cmd)'; return r; }

    // 메뉴를 따라 상품 검색 칸이 보일 때까지 (최대 3번)
    let box = await findSearchBox(cur);
    for (let k = 0; k < 3 && !box; k++) {
      const c = await clickText(cur, MENU);
      if (!c) break;
      cur = c.page; r.steps.push(`메뉴: ${c.clicked}`);
      await dump(cur, `${kw}-menu${k + 1}`);
      if (/nid\.naver\.com/.test(cur.url())) { r.why = '쇼핑 커넥트에서 로그인을 다시 요구해요'; return r; }
      box = await findSearchBox(cur);
    }
    if (!box) { r.why = '상품 검색 칸을 찾지 못했어요 (화면 기록 확인 필요)'; return r; }
    await box.fill(kw); await box.press('Enter'); await sleep(5000);
    r.steps.push('검색');
    const s1 = await clickText(cur, ['리뷰 많은순', '리뷰많은순', '리뷰순', '후기 많은순', '상품평 많은순']);
    const s2 = s1 ? null : await clickText(cur, ['판매 많은순', '판매많은순', '판매순', '구매 많은순', '인기순', '랭킹순']);
    r.sort = s1?.clicked || s2?.clicked || '정렬 못 바꿈(기본 순서)';
    if (s1 || s2) await sleep(2000);
    await dump(cur, `${kw}-search`);

    const cards = await readCards(cur);
    fs.writeFileSync(path.join(OUT, `cards-${kw}.json`), JSON.stringify(cards, null, 1));
    if (!cards.length) { r.why = '검색 결과에서 링크 버튼을 찾지 못했어요'; return r; }
    // 검색어가 들어간 카드 중 후기 수 → 구매 수가 큰 것. 숫자를 못 읽으면 정렬된 첫 카드
    const rel = cards.filter((c) => c.text.replace(/\s/g, '').includes(kw.replace(/\s/g, '')));
    const pool = rel.length ? rel : cards;
    const best = [...pool].sort((a, b) => b.review - a.review || b.sales - a.sales)[0];
    // 카드 글자에서 상품 이름 줄만 (수수료·판매가·할인율·숫자·버튼 줄을 빼고 가장 긴 줄) — 10/26 첫 실행에서 "수수료 5%" 가 이름으로 잡혔다
    r.product = best.text.split('\n').map((s) => s.trim())
      .filter((s) => s.length > 3 && !LINK_BTN.test(s) && !/^(수수료|판매가|할인|리뷰|링크|[\d,.%원\s]+$)/.test(s))
      .sort((a, b) => b.length - a.length)[0] || '';
    r.review = best.review; r.sales = best.sales;
    log(`  고른 상품: ${r.product} (후기 ${best.review}, 구매 ${best.sales}, ${r.sort})`);
    if (DRY) { r.why = '--dry-run: 링크 버튼은 누르지 않음'; return r; }

    const before = await collectUrls(cur, bodies);
    const clip0 = await readClipboard(cur);
    const target = cur.frames()[best.frame].locator(`[data-sg-link="${best.idx}"]`).first();
    if (!(await target.count()) || DENY.test(await target.innerText().catch(() => ''))) { r.why = '링크 버튼을 누르지 못했어요'; return r; }
    await target.click({ timeout: 5000 }); await sleep(3000);
    r.steps.push('링크 버튼');
    await dump(cur, `${kw}-link`);
    let after = await collectUrls(cur, bodies);
    let clip = await readClipboard(cur);
    let fresh = [...after].filter((u) => !before.has(u));
    // 복사 창이 떴다면 그 안의 '복사' 를 한 번 더 누른다
    if (!fresh.length && !(clip && clip !== clip0 && LINK_RE.test(clip.trim()))) {
      const c = await clickText(cur, ['복사', '복사하기', '링크 복사', 'URL 복사']);
      if (c) { r.steps.push(`복사창: ${c.clicked}`); await dump(cur, `${kw}-copy`); after = await collectUrls(cur, bodies); clip = await readClipboard(cur); fresh = [...after].filter((u) => !before.has(u)); }
    }
    const cands = [];
    if (clip && clip !== clip0 && LINK_RE.test(clip.trim())) cands.push(clip.trim());
    cands.push(...fresh.filter((u) => /naver\.me\//.test(u)), ...fresh.filter((u) => !/naver\.me\//.test(u)));
    const url = cands.find((u) => LINK_RE.test(u) && !/brandconnect\.naver\.com\/?$/.test(u));
    r.candidates = cands.slice(0, 10);
    if (!url) { r.why = '링크 주소를 읽지 못했어요 (화면 기록 확인 필요)'; return r; }
    r.url = url; r.ok = true;
    // 복사창이 남아 있으면 닫기만 (Esc)
    await cur.keyboard.press('Escape').catch(() => {});
    return r;
  } catch (e) {
    r.why = `오류: ${e.message.split('\n')[0]}`;
    await dump(cur, `${kw}-error`).catch(() => {});
    return r;
  } finally {
    for (const p of ctx.pages()) if (p !== page && p.url().includes('brandconnect')) await p.close().catch(() => {});
    await page.close().catch(() => {});
  }
}

async function main() {
  const kws = pickKeywords();
  if (!kws.length) { log('쇼핑 커넥트: 새로 만들 링크 없음'); return 0; }
  fs.mkdirSync(OUT, { recursive: true });
  log(`쇼핑 커넥트 링크 만들기: ${kws.join(', ')}`);
  let browser;
  try { browser = await chromium.connectOverCDP(CDP); }
  catch (e) { console.error(`자동화용 크롬(${CDP})에 연결하지 못했어요: ${e.message.split('\n')[0]}`); return 1; }
  const ctx = browser.contexts()[0] || await browser.newContext();
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://brandconnect.naver.com' }).catch(() => {});
  const resFile = path.join(OUT, 'result.json');
  const results = fs.existsSync(resFile) ? JSON.parse(fs.readFileSync(resFile, 'utf8')) : [];
  for (const kw of kws) {
    const r = await makeOne(ctx, kw);
    r.at = new Date().toISOString();
    results.push(r);
    if (r.ok) {
      fs.mkdirSync(path.dirname(LOCAL_LINKS_FILE), { recursive: true });
      fs.appendFileSync(LOCAL_LINKS_FILE, `${kw}\t${r.url}\t${kw}\n`);
      log(`  쇼핑 링크 만듦: ${kw} → ${r.url}`);
    } else log(`  쇼핑 링크 못 만듦: ${kw} — ${r.why}`);
    fs.writeFileSync(resFile, JSON.stringify(results, null, 1));
  }
  // 연결만 끊는다 — 사용자의 브라우저를 닫지 않는다
  return 0;
}

main().then((c) => process.exit(c), (e) => { console.error(e); process.exit(1); });
