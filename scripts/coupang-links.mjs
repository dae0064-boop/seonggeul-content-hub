#!/usr/bin/env node
/**
 * 쿠팡 파트너스 링크를 PC 에서 저절로 만든다 (2026-11-01 사용자 — 티스토리 10편, 쿠팡으로 수익화. 링크 목록이 비어 있었다).
 * 클라우드는 coupang.com 이 막혀 있어서, 아침 PC 의 자동화용 크롬(9222, 쿠팡 파트너스 로그인 상태)에 붙어 한다.
 * 네이버 쪽 scripts/brandconnect-links.mjs 와 같은 구조·같은 안전 규칙이다.
 *
 *   node scripts/coupang-links.mjs [--max 8] [--out dumps/coupang/<날짜>] [--dry-run] [키워드 ...]
 *
 * 순서: partners.coupang.com → 링크 생성 / 상품 링크 → 상품 검색(키워드) → 후기 수가 가장 큰 상품(못 읽으면 첫 결과)의
 *       '링크 생성'(또는 '링크 복사') 버튼 → 새로 나타난 https://link.coupang.com/... 주소(입력칸·복사창·클립보드·화면 글자)를 읽는다.
 * 지키는 것: 구매·결제·주문·장바구니·설정·삭제·정산·로그아웃 같은 글자가 있는 버튼은 누르지 않는다. 연 탭만 닫는다(브라우저는 닫지 않는다).
 * 쿠팡 파트너스 화면을 아직 실제로 본 적이 없어 단계마다 화면 글자·캡처·받은 JSON 을 남긴다 — 아침 확인이 Drive 에서 보고 고친다.
 * 로그인 화면이 나오면 화면을 남기고 종료 코드 3 으로 멈춘다 (나머지 키워드도 같은 이유로 안 되므로).
 *
 * 키워드: 인자 → 없으면 앞으로 나갈 티스토리 원고(content/tistory, 오늘 이후)의 coupang: → content/affiliate/coupang-wanted.txt 순.
 *         이미 링크가 있는 키워드는 건너뛴다.
 * 남기는 것: dumps/coupang-links.local.tsv (이 PC 의 발행이 바로 쓴다 — lib/coupang.mjs loadLinks)
 *            <out>/result.json, NN-*.txt/jpg, cards-*.json, api-*.json  (Drive ClaudeWorkspace/coupang/<날짜>/ 로 올라간다 → 아침 확인이 저장소 목록에 옮긴다)
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { LINK_RE, LOCAL_LINKS_FILE, loadLinks } from './lib/coupang.mjs';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const OUT = opt('--out', `dumps/coupang/${today}`);
const CDP = opt('--cdp', 'http://localhost:9222');
const MAX = Number(opt('--max', 8));
const DRY = argv.includes('--dry-run');
const START = opt('--start', 'https://partners.coupang.com/');  // 시험용으로만 바꾼다
if (argv.includes('--help')) { console.log(fs.readFileSync(new URL(import.meta.url)).toString().split('*/')[0]); process.exit(0); }
const argKw = argv.filter((a, i) => !a.startsWith('--') && !['--out', '--cdp', '--max', '--start'].includes(argv[i - 1]));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (s) => console.log(s);
// 누르면 안 되는 버튼 (사용자 — 상품을 사거나 다른 설정을 바꾸지 말 것). 정산·지급·계좌는 파트너스 수익 화면이다
const DENY = /구매|결제|주문|장바구니|바로\s*구매|찜|신청|동의|설정|정산|지급|출금|계좌|삭제|해지|해제|탈퇴|로그아웃|수정|등록|저장|발행|공유하기|회원|약관|사업자|세금/;
const MENU = ['링크 생성', '링크생성', '상품 링크', '상품링크', '상품 검색', '상품검색', '상품 찾기'];
const LINK_BTN = /^(링크\s*(생성|복사|만들기|발급|받기)?|(생성|복사)\s*링크|URL\s*(생성|복사)|단축\s*URL.*|파트너스\s*링크.*)$/i;
const URL_IN = /https:\/\/link\.coupang\.com\/[A-Za-z0-9/_\-?=&.]+/g;
const LOGIN_URL = /login\.coupang\.com|\/login|\/signin/i;

function pickKeywords() {
  const have = loadLinks();
  const list = [];
  const add = (k) => { k = (k || '').trim(); if (k && !have.has(k) && !list.includes(k)) list.push(k); };
  if (argKw.length) argKw.forEach(add);
  else {
    const dir = 'content/tistory';
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.md') && f.slice(0, 10) >= today).sort()) {
        const m = fs.readFileSync(path.join(dir, f), 'utf8').match(/^coupang:\s*(.+)$/m);
        if (m) add(m[1]);
      }
    }
    const w = 'content/affiliate/coupang-wanted.txt';
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

/** 로그인 화면인가 — 주소가 로그인이거나, 비밀번호 칸이 보이거나, 로그인 전 첫 화면(로그인·회원가입 버튼 + 가입 안내)이면.
 *  2026-11-01 첫 시험: 로그인 안 된 첫 화면("로그인회원가입 … 쿠팡과 함께 수익을 창출해보세요")을 못 알아보고 검색 칸을 찾다 실패했다 */
const LOGGED_OUT_TEXT = /로그인\s*회원가입|쿠팡과 함께 수익을\s*창출해보세요|왜 쿠팡 파트너스 인가요/;
async function isLogin(page) {
  if (LOGIN_URL.test(page.url())) return true;
  const body = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
  if (LOGGED_OUT_TEXT.test(body) && !/로그아웃|마이페이지|리포트|정산 정보/.test(body)) return true;
  for (const fr of page.frames()) {
    const pw = fr.locator('input[type="password"]');
    const n = await pw.count().catch(() => 0);
    for (let i = 0; i < n; i++) if (await pw.nth(i).isVisible().catch(() => false)) return true;
  }
  return false;
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
    const loc = fr.locator('input[type="search"], input[placeholder*="검색"], input[placeholder*="상품"], input[placeholder*="키워드"], input[type="text"]');
    const n = await loc.count().catch(() => 0);
    for (let i = 0; i < n; i++) {
      const el = loc.nth(i);
      if (!(await el.isVisible().catch(() => false))) continue;
      // 이미 만든 링크·주소를 보여 주는 칸(link.coupang.com 값, 읽기 전용)은 검색 칸이 아니다
      const v = await el.inputValue().catch(() => '');
      const ro = await el.getAttribute('readonly').catch(() => null);
      if (ro !== null || /^https?:\/\//.test(v)) continue;
      return el;
    }
  }
  return null;
}

/** 페이지 안 '링크 생성' 버튼마다 상품 카드 글자를 모아 후기 수를 읽는다 */
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
        // 쿠팡 카드는 별점 옆 괄호에 후기 수를 쓴다 — "(1,234)". 글자가 있으면 그쪽 먼저
        const rv = t.match(/(?:리뷰|후기|상품평)\s*\(?\s*([\d,.]+\s*만?)/) || t.match(/\(\s*([\d,]{1,9}\s*만?)\s*\)/);
        return { idx, text: t.slice(0, 300), review: rv ? num(rv[1]) : 0 };
      });
    }, { src: LINK_BTN.source }).catch(() => []);
    for (const c of got) cards.push({ ...c, frame: fi });
  }
  return cards;
}

/** 받은 응답 중 /api/v1/search 의 상품 목록 (2026-11-01 시험에서 확인: data.products[] — title·ratingCount·rawImage·image·productId) */
function searchProducts(bodies) {
  for (let i = bodies.length - 1; i >= 0; i--) {
    try {
      const j = JSON.parse(bodies[i]);
      const ps = j?.data?.products;
      if (Array.isArray(ps) && ps.length && ps[0].productId) return ps;
    } catch { /* JSON 아님 */ }
  }
  return [];
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
  const loginStop = (why) => { r.login = true; r.why = why; return r; };
  try {
    await cur.goto(START, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(4000);
    await dump(cur, `${kw}-home`);
    if (await isLogin(cur)) return loginStop('쿠팡 파트너스 로그인이 풀려 있어요 (launchers\\coupang-test.cmd 가 연 자동화용 크롬에서 partners.coupang.com 에 로그인)');

    // 2026-11-01 두 번째 시험에서 확인: 검색 결과 화면 주소는 #affiliate/ws/link/0/<키워드> — 메뉴 없이 바로 간다
    const searchUrl = `https://partners.coupang.com/#affiliate/ws/link/0/${encodeURIComponent(kw)}`;
    let direct = false;
    try {
      await cur.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(5000);
      direct = !!searchProducts(bodies).length;
    } catch { /* 아래 메뉴 방식으로 */ }
    if (await isLogin(cur)) return loginStop('쿠팡 파트너스에서 로그인을 다시 요구해요');
    // 메뉴를 따라 상품 검색 칸이 보일 때까지 (최대 3번)
    let box = direct ? true : await findSearchBox(cur);
    for (let k = 0; k < 3 && !box; k++) {
      const c = await clickText(cur, MENU);
      if (!c) break;
      cur = c.page; r.steps.push(`메뉴: ${c.clicked}`);
      await dump(cur, `${kw}-menu${k + 1}`);
      if (await isLogin(cur)) return loginStop('쿠팡 파트너스에서 로그인을 다시 요구해요');
      box = await findSearchBox(cur);
    }
    if (!box) { r.why = '상품 검색 칸을 찾지 못했어요 (화면 기록 확인 필요)'; return r; }
    if (direct) r.steps.push('검색(주소로 바로)');
    else { await box.fill(kw); await box.press('Enter'); await sleep(5000); r.steps.push('검색'); }
    // 정렬 칸이 있으면 후기 많은순으로 (없으면 기본 순서 — 보통 쿠팡 랭킹순)
    const s1 = await clickText(cur, ['리뷰 많은순', '리뷰많은순', '상품평 많은순', '후기 많은순', '리뷰순']);
    r.sort = s1?.clicked || '정렬 못 바꿈(기본 순서)';
    if (s1) await sleep(2000);
    await dump(cur, `${kw}-search`);

    // ① 검색 데이터(/api/v1/search 의 products — ratingCount·image)로 후기가 가장 많은 상품을 고르고,
    //    그 상품 그림에 마우스를 올려 나타나는 '링크 생성' 버튼 중 그림에서 가장 가까운 것을 누른다 (2026-11-01 두 번째 시험:
    //    카드 버튼은 마우스를 올려야 보여서, 예전 방식은 화면 위 안내 문구 '링크 생성 을 클릭하여…'를 눌렀다)
    const prods = searchProducts(bodies);
    if (prods.length && !DRY) {
      const kwS = kw.replace(/\s/g, '');
      const rel = prods.filter((p) => (p.title || '').replace(/\s/g, '').includes(kwS) && !p.isSoldOut && !p.isAdult);
      const best = [...(rel.length ? rel : prods)].sort((a, b) => (b.ratingCount || 0) - (a.ratingCount || 0))[0];
      r.product = best.title; r.review = best.ratingCount || 0; r.productId = best.productId;
      log(`  고른 상품: ${r.product} (후기 ${r.review})`);
      const seg = String(best.rawImage || best.image || '').split('/').pop();
      const before0 = await collectUrls(cur, bodies);
      const clip00 = await readClipboard(cur);
      const img = cur.locator(`img[src*="${seg}"]`).first();
      if (seg && await img.count().catch(() => 0)) {
        await img.scrollIntoViewIfNeeded().catch(() => {});
        await img.hover({ timeout: 5000 }).catch(() => {});
        await sleep(800);
        const ib = await img.boundingBox().catch(() => null);
        const btns = cur.locator('a, button, [role="button"], span, div').filter({ hasText: /^\s*링크\s*생성\s*$/ });
        const n = await btns.count().catch(() => 0);
        let pick = null, dist = Infinity;
        for (let i = 0; i < n; i++) {
          const b = btns.nth(i);
          if (!(await b.isVisible().catch(() => false))) continue;
          const bb = await b.boundingBox().catch(() => null);
          if (!bb || !ib) continue;
          const d = Math.hypot(bb.x + bb.width / 2 - (ib.x + ib.width / 2), bb.y + bb.height / 2 - (ib.y + ib.height / 2));
          if (d < dist) { dist = d; pick = b; }
        }
        if (pick && dist < 400) {
          await pick.click({ timeout: 5000 }).catch(() => {});
          await sleep(3500);
          r.steps.push('상품 그림 위 링크 생성');
          await dump(cur, `${kw}-link`);
          let got = [...(await collectUrls(cur, bodies))].filter((u) => !before0.has(u));
          let clipA = await readClipboard(cur);
          if (!got.some((u) => LINK_RE.test(u)) && !(clipA && clipA !== clip00 && LINK_RE.test(clipA.trim()))) {
            const c = await clickText(cur, ['단축 URL', '단축URL', 'URL 생성', 'URL 복사', '링크 복사', '복사', '복사하기']);
            if (c) { r.steps.push(`복사창: ${c.clicked}`); await dump(cur, `${kw}-copy`); got = [...(await collectUrls(cur, bodies))].filter((u) => !before0.has(u)); clipA = await readClipboard(cur); }
          }
          const cands = [];
          if (clipA && clipA !== clip00 && LINK_RE.test(clipA.trim())) cands.push(clipA.trim());
          cands.push(...got.filter((u) => /link\.coupang\.com\/a\//.test(u)), ...got.filter((u) => !/link\.coupang\.com\/a\//.test(u)));
          const url = cands.find((u) => LINK_RE.test(u) && !/link\.coupang\.com\/?$/.test(u));
          r.candidates = cands.slice(0, 10);
          if (url) { r.url = url; r.ok = true; await cur.keyboard.press('Escape').catch(() => {}); return r; }
          r.why = '상품 링크 생성은 눌렀는데 주소를 읽지 못했어요 (화면 기록 확인 필요)';
          return r;
        }
        r.steps.push(`상품 그림 위 링크 생성 버튼 못 찾음(${n}개, 거리 ${Math.round(dist)})`);
      } else r.steps.push('검색 데이터의 상품 그림을 화면에서 못 찾음');
    }
    // ② 예전 방식 (화면 카드 글자로)
    const cards = await readCards(cur);
    fs.writeFileSync(path.join(OUT, `cards-${kw}.json`), JSON.stringify(cards, null, 1));
    if (!cards.length) { r.why = '검색 결과에서 링크 생성 버튼을 찾지 못했어요'; return r; }
    // 검색어가 들어간 카드 중 후기 수가 큰 것. 숫자를 못 읽으면(모두 0) 첫 카드
    const rel = cards.filter((c) => c.text.replace(/\s/g, '').includes(kw.replace(/\s/g, '')));
    const pool = rel.length ? rel : cards;
    const best = [...pool].sort((a, b) => b.review - a.review)[0];
    // 카드 글자에서 상품 이름 줄만 (가격·할인율·숫자·별점·버튼 줄을 빼고 가장 긴 줄)
    r.product = best.text.split('\n').map((s) => s.trim())
      .filter((s) => s.length > 3 && !LINK_BTN.test(s) && !/^(판매가|할인|리뷰|상품평|링크|로켓|무료배송|[\d,.%원()\s]+$)/.test(s))
      .sort((a, b) => b.length - a.length)[0] || '';
    r.review = best.review;
    log(`  고른 상품: ${r.product} (후기 ${best.review}, ${r.sort})`);
    if (DRY) { r.why = '--dry-run: 링크 버튼은 누르지 않음'; return r; }

    const before = await collectUrls(cur, bodies);
    const clip0 = await readClipboard(cur);
    const target = cur.frames()[best.frame].locator(`[data-sg-link="${best.idx}"]`).first();
    if (!(await target.count()) || DENY.test(await target.innerText().catch(() => ''))) { r.why = '링크 생성 버튼을 누르지 못했어요'; return r; }
    const popup = ctx.waitForEvent('page', { timeout: 5000 }).catch(() => null);
    await target.click({ timeout: 5000 }); await sleep(3000);
    const np = await popup;
    if (np) { await np.waitForLoadState('domcontentloaded').catch(() => {}); await sleep(3000); cur = np; r.steps.push('새 탭'); }
    r.steps.push('링크 생성 버튼');
    await dump(cur, `${kw}-link`);
    let after = await collectUrls(cur, bodies);
    let clip = await readClipboard(cur);
    let fresh = [...after].filter((u) => !before.has(u));
    const clipOk = () => clip && clip !== clip0 && LINK_RE.test(clip.trim());
    // 창에 '단축 URL' 칸이 따로 있거나 복사 버튼을 한 번 더 눌러야 하면 (생성·복사 글자만, DENY 는 clickText 가 거른다)
    if (!fresh.length && !clipOk()) {
      const c = await clickText(cur, ['단축 URL', '단축URL', 'URL 생성', 'URL 복사', '링크 복사', '복사', '복사하기']);
      if (c) {
        cur = c.page; r.steps.push(`복사창: ${c.clicked}`); await dump(cur, `${kw}-copy`);
        after = await collectUrls(cur, bodies); clip = await readClipboard(cur); fresh = [...after].filter((u) => !before.has(u));
        if (!fresh.length && !clipOk()) {
          const c2 = await clickText(cur, ['URL 복사', '링크 복사', '복사', '복사하기']);
          if (c2) { cur = c2.page; r.steps.push(`복사창: ${c2.clicked}`); await dump(cur, `${kw}-copy2`); after = await collectUrls(cur, bodies); clip = await readClipboard(cur); fresh = [...after].filter((u) => !before.has(u)); }
        }
      }
    }
    const cands = [];
    if (clipOk()) cands.push(clip.trim());
    // 짧은 주소(link.coupang.com/a/...)를 먼저
    cands.push(...fresh.filter((u) => /link\.coupang\.com\/a\//.test(u)), ...fresh.filter((u) => !/link\.coupang\.com\/a\//.test(u)));
    const url = cands.find((u) => LINK_RE.test(u) && !/link\.coupang\.com\/?$/.test(u));
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
    for (const p of ctx.pages()) if (p !== page && /partners\.coupang\.com|link\.coupang\.com/.test(p.url())) await p.close().catch(() => {});
    await page.close().catch(() => {});
  }
}

async function main() {
  const kws = pickKeywords();
  if (!kws.length) { log('쿠팡 파트너스: 새로 만들 링크 없음'); return 0; }
  fs.mkdirSync(OUT, { recursive: true });
  log(`쿠팡 파트너스 링크 만들기: ${kws.join(', ')}`);
  let browser;
  try { browser = await chromium.connectOverCDP(CDP); }
  catch (e) { console.error(`자동화용 크롬(${CDP})에 연결하지 못했어요: ${e.message.split('\n')[0]}`); return 1; }
  const ctx = browser.contexts()[0] || await browser.newContext();
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://partners.coupang.com' }).catch(() => {});
  const resFile = path.join(OUT, 'result.json');
  const results = fs.existsSync(resFile) ? JSON.parse(fs.readFileSync(resFile, 'utf8')) : [];
  let code = 0;
  for (const kw of kws) {
    const r = await makeOne(ctx, kw);
    r.at = new Date().toISOString();
    results.push(r);
    if (r.ok) {
      fs.mkdirSync(path.dirname(LOCAL_LINKS_FILE), { recursive: true });
      fs.appendFileSync(LOCAL_LINKS_FILE, `${kw}\t${r.url}\t${kw}\n`);
      log(`  쿠팡 링크 만듦: ${kw} → ${r.url}`);
    } else log(`  쿠팡 링크 못 만듦: ${kw} — ${r.why}`);
    fs.writeFileSync(resFile, JSON.stringify(results, null, 1));
    if (r.login) {
      console.error(`쿠팡 파트너스 로그인이 필요해요. launchers 폴더의 coupang-test.cmd 를 더블클릭해 열린 크롬에서 partners.coupang.com 에 로그인해 주세요. 남은 키워드는 다음 실행에서 합니다.`);
      code = 3;
      break;
    }
  }
  // 연결만 끊는다 — 사용자의 브라우저를 닫지 않는다
  return code;
}

main().then((c) => process.exit(c), (e) => { console.error(e); process.exit(1); });
