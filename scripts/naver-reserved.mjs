#!/usr/bin/env node
/**
 * 예약발행 해 둔 네이버 글을 찾는다 (읽기만 — 아무것도 누르지 않는다, 브라우저는 닫지 않는다).
 * 2026-11-13 사용자: "16일부터 다시 진행할거야, 모두 수정해" — 11/16~18 원고 30편이 11/10~11/11 에 옛 그림으로 예약돼 있다.
 * 예약 글을 지우고 새 그림으로 다시 예약하려면 먼저 예약 글이 블로그 어디에 어떤 모양으로 보이는지 알아야 한다(아직 본 적 없음).
 *
 *   node scripts/naver-reserved.mjs seongdaeeyo --look --out dumps/reserved-look
 *
 * 남기는 것: 후보 화면마다 글자(앞 8000자)·글 링크(logNo + 글자)·'예약' 이 들어간 줄·화면 캡처, 관리 화면 메뉴 링크 전부.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const id = argv.find((a, i) => !a.startsWith('--') && !['--out', '--cdp', '--dates'].includes(argv[i - 1]));
const OUT = opt('--out', 'dumps/reserved-look');
// --list : 글쓰기 화면의 '예약 발행 N건' 목록을 열어 읽기만 (2026-11-13 20:16 첫 살펴보기에서 위치 확인)
// --delete --dates 2026-11-16,2026-11-17 : 그 날짜 네이버 원고(content/posts) 제목과 똑같은 예약 글만 지운다.
//   한 편 먼저 지우고 목록을 다시 읽어 그 글만 사라졌는지 확인 → 맞을 때만 나머지. 지운 원고는 deleted.tsv (날짜·슬러그·제목)
const LIST = argv.includes('--list') || argv.includes('--delete');
const DELETE = argv.includes('--delete');
const DATES = (opt('--dates', '') || '').split(',').filter(Boolean);
const CDP = opt('--cdp', 'http://localhost:9222');
if (!id) { console.log('사용법: node scripts/naver-reserved.mjs <블로그 아이디> --look [--out 폴더]'); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lines = [];
const log = (s) => { console.log(s); lines.push(s); };

async function dump(page, name) {
  const all = [];
  for (const f of [page.mainFrame(), ...page.frames()]) {
    try {
      all.push(await f.evaluate((bid) => {
        const t = (document.body?.innerText || '');
        const links = [...document.querySelectorAll('a[href]')].map((a) => {
          const m = /logNo=(\d{9,})/.exec(a.href) || new RegExp(`/${bid}/(\\d{9,})`).exec(a.href);
          return { href: a.href.slice(0, 200), logNo: m ? m[1] : '', text: (a.innerText || a.title || '').replace(/\s+/g, ' ').trim().slice(0, 80) };
        });
        return { url: location.href, text: t.slice(0, 8000), reserveLines: t.split('\n').filter((l) => /예약/.test(l)).slice(0, 60), links };
      }, id));
    } catch { /* 다른 출처 프레임 */ }
  }
  fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(all, null, 1));
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false }).catch(() => {});
  const posts = all.flatMap((x) => x.links.filter((l) => l.logNo));
  const res = all.flatMap((x) => x.reserveLines);
  log(`${name}: 프레임 ${all.length} · 글 링크 ${posts.length} · '예약' 줄 ${res.length}${res.length ? ` — ${res.slice(0, 5).join(' | ')}` : ''}`);
  return all;
}


const normT = (t) => String(t || '').replace(/\s+/g, '').replace(/[·,.?!()（）]/g, '');
function targets() {
  const out = [];
  for (const d of DATES) for (const f of fs.readdirSync('content/posts').filter((x) => x.startsWith(d + '-') && x.endsWith('.md'))) {
    const raw = fs.readFileSync(path.join('content/posts', f), 'utf8');
    const title = (/^title:\s*(.+)$/m.exec(raw) || [])[1]?.trim();
    if (title) out.push({ date: d, slug: f.replace(/\.md$/, ''), title });
  }
  return out;
}
async function editorFrame(page) {
  for (let i = 0; i < 20; i++) {
    for (const f of page.frames()) if (f !== page.mainFrame() && (f.name() === 'mainFrame' || /PostWrite|postwrite/i.test(f.url()))) return f;
    if (await page.locator('text=/예약 발행/').count().catch(() => 0)) return page.mainFrame();
    await sleep(500);
  }
  return page.mainFrame();
}
/** 글쓰기 화면을 열고 '예약 발행 N건' 을 눌러 목록을 연다. 목록의 줄(제목 글자 + 그 줄 안 단추 글자)을 돌려준다 */
async function openReserveList(page, tag) {
  await page.goto(`https://blog.naver.com/${id}/postwrite`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await sleep(4000);
  const ed = await editorFrame(page);
  // 작성 중이던 글 불러오기 팝업은 취소 (publish-naver 와 같은 범위 — 팝업 안에서만)
  for (const sel of ['.se-popup-container .se-popup-button-cancel', '.se-popup-alert .se-popup-button-cancel', '[class*="se-popup"] button:text-is("취소")']) {
    const b = ed.locator(sel).first(); if (await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); await sleep(600); break; }
  }
  const btn = ed.locator('button:has-text("예약 발행"), a:has-text("예약 발행"), [class*="reserve"]:has-text("예약")').first();
  const cnt = (await btn.innerText().catch(() => '')).replace(/\s+/g, ' ');
  if (!(await btn.isVisible().catch(() => false))) { log(`  '예약 발행' 단추를 못 찾음`); await dump(page, `${tag}-nobutton`); return { ed, rows: [], cnt: '' }; }
  await btn.click().catch(() => {}); await sleep(2500);
  // 목록을 끝까지 내려 모은다 (스크롤되는 칸)
  const rows = new Map();
  for (let k = 0; k < 15; k++) {
    let got = { rows: [], moved: false };
    for (const sc of [...new Set([ed, page.mainFrame()])]) {
    const g = await sc.evaluate(() => {
      const box = [...document.querySelectorAll('[class*="reserve"], [class*="Reserve"], [role="dialog"], [class*="layer"], [class*="popup"]')]
        .filter((e) => e.offsetParent && /예약/.test(e.innerText || '')).sort((a, b) => (a.innerText || '').length - (b.innerText || '').length).pop();
      if (!box) return { rows: [], moved: false };
      const items = [...box.querySelectorAll('li, [class*="item"], tr')].filter((e) => (e.innerText || '').trim().length > 6 && !e.querySelector('li, [class*="item"]'));
      const rows = items.map((e, i) => ({ i, text: (e.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 160),
        btns: [...e.querySelectorAll('button, a, [role="button"]')].map((b) => ((b.innerText || '') + ' ' + (b.getAttribute('aria-label') || '') + ' ' + (b.className || '')).replace(/\s+/g, ' ').trim().slice(0, 80)) }));
      const sc = [...box.querySelectorAll('*')].find((e) => e.scrollHeight > e.clientHeight + 10) || box;
      const before = sc.scrollTop; sc.scrollTop = before + 400;
      return { rows, moved: sc.scrollTop !== before };
    }).catch(() => ({ rows: [], moved: false }));
    if (g.rows.length) { got = g; break; }
    }
    for (const r of got.rows) rows.set(r.text, r);
    if (!got.moved) break; await sleep(700);
  }
  const list = [...rows.values()];
  fs.writeFileSync(path.join(OUT, `${tag}-rows.json`), JSON.stringify(list, null, 1));
  await page.screenshot({ path: path.join(OUT, `${tag}.png`) }).catch(() => {});
  log(`${tag}: 단추 "${cnt}" · 목록 줄 ${list.length}`);
  return { ed, rows: list, cnt };
}
/** 목록에서 제목이 같은 줄의 '삭제' 단추를 누르고 확인한다. 성공하면 true */
async function deleteOne(page, ed, title) {
  const key = normT(title).slice(0, 22);
  page.once('dialog', (d) => { log(`  확인 창: ${d.message().slice(0, 60)} → 확인`); d.accept().catch(() => {}); });
  let ok = '줄 0개';
  for (const sc of [...new Set([ed, page.mainFrame()])]) {
  ok = await sc.evaluate((key) => {
    const norm = (t) => String(t || '').replace(/\s+/g, '').replace(/[·,.?!()（）]/g, '');
    const items = [...document.querySelectorAll('li, [class*="item"], tr')].filter((e) => e.offsetParent && norm(e.innerText).includes(key) && !e.querySelector('li, [class*="item"]'));
    if (items.length !== 1) return `줄 ${items.length}개`;
    const del = [...items[0].querySelectorAll('button, a, [role="button"]')].find((b) => /삭제|delete|remove/i.test((b.innerText || '') + ' ' + (b.getAttribute('aria-label') || '') + ' ' + (b.className || '')));
    if (!del) return '삭제 단추 없음';
    del.click(); return 'ok';
  }, key).catch((e) => `오류 ${e.message}`);
  if (ok !== '줄 0개') break;
  }
  if (ok !== 'ok') { log(`  ✖ ${title.slice(0, 30)} — ${ok}`); return false; }
  await sleep(1200);
  // 페이지 안 확인 칸 (브라우저 확인 창이 아니면)
  for (const sc of [ed, page]) {
    const c = sc.locator('[class*="popup"] button:has-text("확인"), [class*="layer"] button:has-text("확인"), [role="dialog"] button:has-text("확인"), [class*="popup"] button:has-text("삭제")').first();
    if (await c.isVisible().catch(() => false)) { await c.click().catch(() => {}); log('  확인 칸 → 확인'); break; }
  }
  await sleep(2000);
  return true;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  let browser;
  try { browser = await chromium.connectOverCDP(CDP); }
  catch (e) { console.error(`자동화용 크롬(${CDP})에 연결하지 못했어요: ${e.message.split('\n')[0]}`); process.exit(1); }
  const ctx = browser.contexts()[0] || await browser.newContext();
  const page = await ctx.newPage();
  try {
    if (LIST) {
      const want = targets();
      log(`[예약 글 ${DELETE ? '지우기' : '목록 읽기'}] ${id} — 날짜 ${DATES.join(',') || '없음'} · 원고 ${want.length}편`);
      let { ed, rows } = await openReserveList(page, '10-list');
      const has = (rs, t) => rs.some((r) => normT(r.text).includes(normT(t).slice(0, 22)));
      const found = want.filter((w) => has(rows, w.title));
      log(`목록에서 찾은 우리 원고: ${found.length}/${want.length}`);
      for (const w of want) log(`  ${has(rows, w.title) ? '●' : '○'} ${w.date} ${w.title}`);
      if (!DELETE || !found.length) { log(DELETE ? '지울 글이 목록에 없어 멈춤' : '읽기만 끝'); return; }
      const deleted = [];
      // 1) 한 편 시험
      const first = found[0];
      if (!(await deleteOne(page, ed, first.title))) { log('✖ 첫 편을 지우지 못해 멈춤 — 캡처 확인'); await dump(page, '11-fail'); return; }
      ({ ed, rows } = await openReserveList(page, '12-after-test'));
      const lost = found.filter((w) => w !== first && !has(rows, w.title));
      if (has(rows, first.title) || lost.length) { log(`✖ 확인 실패 — 첫 편 ${has(rows, first.title) ? '아직 있음' : '사라짐'}, 다른 글 사라짐 ${lost.length} → 멈춤`); return; }
      deleted.push(first); log(`✅ 시험 1편 지움 확인: ${first.title}`);
      // 2) 나머지
      for (const w of found.slice(1)) {
        if (!(await deleteOne(page, ed, w.title))) { ({ ed, rows } = await openReserveList(page, '13-retry')); if (!(await deleteOne(page, ed, w.title))) continue; }
        deleted.push(w);
      }
      ({ ed, rows } = await openReserveList(page, '14-final'));
      const still = deleted.filter((w) => has(rows, w.title));
      const done = deleted.filter((w) => !has(rows, w.title));
      fs.writeFileSync(path.join(OUT, 'deleted.tsv'), done.map((w) => `${w.date}\t${w.slug}\t${w.title}`).join('\n') + (done.length ? '\n' : ''));
      log(`끝: 지움 ${done.length}편${still.length ? ` · 지웠는데 남아 있음 ${still.length}편` : ''} · 목록에 없던 원고 ${want.length - found.length}편`);
      return;
    }
    log(`[예약 글 찾기] ${id} — 읽기만`);
    const go = async (u, name, wait = 3500) => { await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch((e) => log(`  열기 실패 ${u}: ${e.message.split('\n')[0]}`)); await sleep(wait); return dump(page, name); };
    // ① 관리 첫 화면 — 메뉴 링크 전부 (글 관리·예약 메뉴 주소를 찾는다)
    const admin = await go(`https://admin.blog.naver.com/${id}`, '01-admin-home');
    const menu = admin.flatMap((x) => x.links).filter((l) => /글|예약|관리|post/i.test(l.text + l.href));
    fs.writeFileSync(path.join(OUT, '01-admin-menu.txt'), menu.map((l) => `${l.text}\t${l.href}`).join('\n'));
    // ② 관리 메뉴 중 '글 관리'·'예약' 이 든 주소를 열어 본다 (최대 6곳, 누르지 않고 주소로만)
    let k = 0;
    for (const l of menu.filter((l) => /글\s*관리|예약|postmanage|post\/list|PostManage/i.test(l.text + l.href)).slice(0, 6)) {
      await go(l.href, `02-admin-${++k}`);
    }
    // ③ 내 블로그 글 목록 (주인으로 볼 때 예약 글이 보이는지)
    await go(`https://blog.naver.com/PostList.naver?blogId=${id}&categoryNo=0&from=postList`, '03-postlist');
    // ④ 모바일 글 목록 API (주인 쿠키로) — 예약 글 표시가 있는지
    for (const p of [1, 2]) {
      const t = await page.evaluate(async (u) => (await fetch(u, { credentials: 'include' })).text(), `https://m.blog.naver.com/api/blogs/${id}/post-list?categoryNo=0&itemCount=30&page=${p}`).catch((e) => `ERR ${e.message}`);
      fs.writeFileSync(path.join(OUT, `04-mobile-api-${p}.json`), t);
      log(`04-mobile-api-${p}: ${t.length}자 · '예약'·reserve 글자 ${(t.match(/예약|reserv/gi) || []).length}`);
    }
    // ⑤ 글쓰기 화면 (예약·임시저장 목록 단추 글자만 읽는다 — 누르지 않음)
    await go(`https://blog.naver.com/${id}?Redirect=Write&`, '05-write', 7000);
    log('\n끝 — 아무것도 바꾸지 않았어요.');
  } catch (e) { log(`✖ 오류: ${e.message.split('\n')[0]}`); }
  finally {
    fs.writeFileSync(path.join(OUT, 'reserved-look-log.txt'), lines.join('\n') + '\n');
    await Promise.race([page.close().catch(() => {}), sleep(3000)]);
  }
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
