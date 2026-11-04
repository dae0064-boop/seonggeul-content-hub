#!/usr/bin/env node
/**
 * 발행된 네이버 글을 옮길 표(content/archive/category-plan.tsv)대로 하위 카테고리로 한꺼번에 옮긴다.
 * 2026-11-04 사용자: "올라간 글들 위치를 카테고리에 맞게, 내 블로그를 들어가서 한번에 확인" —
 * 표는 naver-category-scan.mjs 가 블로그에서 직접 읽은 483편을 Claude 가 제목으로 나눈 것.
 *
 * 글을 하나씩 열어 고치지 않는다(수정은 블로그 지수에 좋지 않다 — CLAUDE.md). 블로그 글 목록의 '목록열기'에서
 * 글을 골라 카테고리만 바꾸는 화면을 쓴다. 이 화면은 실제로 본 적이 없어 글자로 찾고, 매 묶음 뒤 블로그를
 * 다시 읽어 정말 옮겨졌는지 확인한다. 확인이 안 되면 바로 멈춘다. '삭제'·'공개' 같은 글자가 든 버튼은 누르지 않는다.
 *
 *   node scripts/naver-category-move.mjs seongdaeeyo --look           읽기만 (목록 화면 모양을 남김)
 *   node scripts/naver-category-move.mjs seongdaeeyo --test           한 편만 옮겨 보고 확인
 *   node scripts/naver-category-move.mjs seongdaeeyo --all            한 편 시험 → 맞으면 나머지 전부
 *   [--out 폴더] [--plan content/archive/category-plan.tsv]
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const id = argv.find((a, i) => !a.startsWith('--') && !['--out', '--cdp', '--plan'].includes(argv[i - 1]));
const MODE = argv.includes('--all') ? 'all' : argv.includes('--test') ? 'test' : 'look';
const OUT = opt('--out', `dumps/category-move/${new Date().toISOString().slice(0, 10)}`);
const CDP = opt('--cdp', 'http://localhost:9222');
const PLAN = opt('--plan', 'content/archive/category-plan.tsv');
if (!id) { console.log('사용법: node scripts/naver-category-move.mjs <블로그 아이디> [--look|--test|--all]'); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lines = [];
const log = (s) => { console.log(s); lines.push(s); };
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const BAD = /삭제|공개|발행|수정|스크랩|초기화|비공개|신고/; // 이 글자가 든 것은 절대 누르지 않는다

function readPlan() {
  const rows = fs.readFileSync(PLAN, 'utf8').split('\n').filter((l) => l && !l.startsWith('#'));
  const head = rows.shift().split('\t');
  return rows.map((l) => Object.fromEntries(l.split('\t').map((v, i) => [head[i], v])));
}
async function getJson(page, url) {
  const t = await page.evaluate(async (u) => (await fetch(u, { credentials: 'include' })).text(), url);
  try { return JSON.parse(t); } catch { return null; }
}
async function readCategories(page) {
  const j = await getJson(page, `https://m.blog.naver.com/api/blogs/${id}/category-list`);
  return (j?.result?.mylogCategoryList || []).map((c) => ({ no: c.categoryNo, name: norm(c.categoryName), parent: c.parentCategoryNo, count: c.postCnt }));
}
/** logNo → 지금 카테고리 번호 (블로그에서 다시 읽음) */
async function readState(page) {
  const m = new Map();
  for (let p = 1; p <= 200; p++) {
    const j = await getJson(page, `https://m.blog.naver.com/api/blogs/${id}/post-list?categoryNo=0&itemCount=30&page=${p}`);
    const items = j?.result?.items || [];
    if (!items.length) break;
    for (const it of items) m.set(String(it.logNo), Number(it.categoryNo));
    await sleep(250);
  }
  return m;
}
async function save(page, name) {
  try {
    const f = page.frames().find((x) => /PostList|PostTitle/i.test(x.url())) || page.mainFrame();
    fs.writeFileSync(path.join(OUT, `${name}.txt`), `${f.url()}\n\n${(await f.evaluate(() => document.body.innerText)).slice(0, 60000)}`);
    fs.writeFileSync(path.join(OUT, `${name}.html`), (await f.content()).slice(0, 400000));
    await page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: 'jpeg', quality: 60, fullPage: true });
  } catch (e) { log(`  (화면 저장 실패: ${e.message.split('\n')[0]})`); }
}

/** 글 목록 화면을 '목록열기' + '글 관리'(체크칸) 상태로 연다. 목록(#toplistWrapper)이 있는 프레임을 돌려준다.
 *  2026-11-04 두 번째 실행 화면: '목록열기' 는 <a class="btn_openlist"><span class="blind">전체보기</span><span id="toplistSpanBlind">목록열기</span></a>
 *  (안 보이는 글자가 붙어 글자 맞춤으로는 못 찾았다), 열리면 #toplistWrapper 에 목록이 채워진다. 주인에게는 '관리' 상태(userTopListManageOpen)가 있다. */
async function openList(page, catNo, pageNo = 1) {
  await page.goto(`https://blog.naver.com/PostList.naver?blogId=${id}&categoryNo=${catNo}&from=postList`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(2500);
  const frames = () => [page.mainFrame(), ...page.frames()];
  let f = null;
  for (const x of frames()) { if (await x.locator('#toplistWrapper').count().catch(() => 0)) { f = x; break; } }
  if (!f) { log('  ✖ 목록 칸(#toplistWrapper)이 없음'); return null; }
  const W = f.locator('#toplistWrapper');
  if (!(await W.isVisible().catch(() => false))) {
    const open = f.locator('a.btn_openlist:has(#toplistSpanBlind), #toplistSpanBlind').first();
    await open.click().catch(() => {});
    await f.waitForFunction(() => { const w = document.querySelector('#toplistWrapper'); return w && w.offsetParent && w.querySelectorAll('a[href*="logNo"], a[logno]').length > 0; }, null, { timeout: 15000 }).catch(() => {});
    await sleep(1000);
  }
  const html0 = await W.innerHTML().catch(() => '');
  if (pageNo === 1 && !fs.existsSync(path.join(OUT, 'toplist-open.html'))) fs.writeFileSync(path.join(OUT, 'toplist-open.html'), html0.slice(0, 300000));
  // 2026-11-04 세 번째 실행 화면: 줄 수 #listCountToggle → #changeListCount a[data-value="30"],
  // 글관리 열기 #btnSwitchManager → #listManagerWrapper 안에 '설정 변경 · 태그달기 · 이동(a._cfmMovePost) · 삭제',
  // 쪽 번호 a._goPageTop._param(N), 다음 a.next._goPageTop. 체크칸 input._checkPost[name=logNo] value=글 번호.
  if (!/30/.test(await f.locator('#listCountView').innerText().catch(() => ''))) {
    await f.locator('#listCountToggle').click().catch(() => {}); await sleep(600);
    await f.locator('#changeListCount a[data-value="30"]').click().catch(() => {}); await sleep(2500);
  }
  if (!(await f.locator('#listManagerWrapper').isVisible().catch(() => false))) {
    await f.locator('#btnSwitchManager').click().catch(() => {}); await sleep(1200);
    log(`  글관리 열기: ${await f.locator('#listManagerWrapper').isVisible().catch(() => false) ? '열림' : '안 열림'}`);
  }
  if (pageNo > 1) {
    for (let k = 0; k < 6; k++) {
      const pg = f.locator(`#toplistWrapper a._goPageTop._param\\(${pageNo}\\)`);
      if (await pg.count().catch(() => 0)) { await pg.first().click().catch(() => {}); await sleep(2500); break; }
      const nx = f.locator('#toplistWrapper a.next._goPageTop');
      if (!(await nx.count().catch(() => 0))) return null;
      await nx.first().click().catch(() => {}); await sleep(2500);
    }
    const cur = norm(await f.locator('#toplistWrapper strong.page').first().innerText().catch(() => ''));
    if (!cur.startsWith(String(pageNo))) return null;
    if (!(await f.locator('#listManagerWrapper').isVisible().catch(() => false))) { await f.locator('#btnSwitchManager').click().catch(() => {}); await sleep(1000); }
  }
  if (pageNo === 1 && !fs.existsSync(path.join(OUT, 'toplist-manage.html'))) fs.writeFileSync(path.join(OUT, 'toplist-manage.html'), (await W.innerHTML().catch(() => '')).slice(0, 300000));
  return f;
}

/** 목록에 보이는 글 번호들 (체크칸 줄마다) */
async function visibleLogNos(frame) {
  return frame.evaluate(() => {
      const noOf = (cb) => {
        for (const a of ['value', 'data-log-no', 'data-logno', 'data-lognum']) { const v = cb.getAttribute(a) || ''; const m = /(\d{9,})/.exec(v); if (m) return m[1]; }
        let el = cb.parentElement;
        for (let d = 0; el && d < 8; d++, el = el.parentElement) {
          const set = new Set();
          for (const x of el.querySelectorAll('a[href], a[logno]')) { const ln = x.getAttribute('logno'); if (/^\d{9,}$/.test(ln || '')) { set.add(ln); continue; } const m = /logNo=(\d{9,})|\/(\d{9,})(?:[?#]|$)/.exec(x.href || ''); if (m) set.add(m[1] || m[2]); }
          if (set.size === 1) return [...set][0];
          if (set.size > 1) return '';
        }
        return '';
      };
    const out = [];
    for (const cb of (document.querySelector('#toplistWrapper') || document).querySelectorAll('input._checkPost[name=logNo], input[type=checkbox][name=logNo]')) { const no = noOf(cb); if (no) out.push(no); }
    return out;
  });
}

/** 목록에서 logNo 가 맞는 줄의 체크칸을 켠다. 켠 logNo 들을 돌려준다 */
async function checkRows(frame, want) {
  return frame.evaluate((wantList) => {
      const noOf = (cb) => {
        for (const a of ['value', 'data-log-no', 'data-logno', 'data-lognum']) { const v = cb.getAttribute(a) || ''; const m = /(\d{9,})/.exec(v); if (m) return m[1]; }
        let el = cb.parentElement;
        for (let d = 0; el && d < 8; d++, el = el.parentElement) {
          const set = new Set();
          for (const x of el.querySelectorAll('a[href], a[logno]')) { const ln = x.getAttribute('logno'); if (/^\d{9,}$/.test(ln || '')) { set.add(ln); continue; } const m = /logNo=(\d{9,})|\/(\d{9,})(?:[?#]|$)/.exec(x.href || ''); if (m) set.add(m[1] || m[2]); }
          if (set.size === 1) return [...set][0];
          if (set.size > 1) return '';
        }
        return '';
      };
    const want = new Set(wantList);
    const done = [];
    for (const cb of (document.querySelector('#toplistWrapper') || document).querySelectorAll('input._checkPost[name=logNo], input[type=checkbox][name=logNo]')) {
      const no = noOf(cb);
      if (no && want.has(no)) { if (!cb.checked) cb.click(); if (cb.checked) done.push(no); }
    }
    return done;
  }, [...want]);
}

/** '이동'(a._cfmMovePost) → 뜨는 창(새 창 또는 레이어)에서 대상 카테고리 → 확인. 어느 단계든 못 찾으면 false */
async function clickMove(page, frame, target) {
  const mv = frame.locator('#listManagerWrapper a._cfmMovePost');
  if (!(await mv.count().catch(() => 0)) || !(await mv.first().isVisible().catch(() => false))) { log('  ✖ \'이동\' 버튼이 안 보임'); return false; }
  const popP = page.context().waitForEvent('page', { timeout: 8000 }).catch(() => null);
  await mv.first().click(); log('  누름: 이동');
  const pop = await popP;
  if (pop) {
    pop.on('dialog', async (d) => { const m = d.message(); log(`  확인창(새 창): "${m.slice(0, 80)}"`); if (/이동|카테고리/.test(m) && !/삭제/.test(m)) await d.accept().catch(() => {}); else await d.dismiss().catch(() => {}); });
    await pop.waitForLoadState('domcontentloaded').catch(() => {}); await sleep(2000);
    log(`  새 창: ${pop.url().slice(0, 120)}`);
  } else await sleep(1500);
  const where = pop ? [pop.mainFrame(), ...pop.frames()] : [frame, page.mainFrame(), ...page.frames()];
  if (!fs.existsSync(path.join(OUT, 'move-window.html'))) {
    try { fs.writeFileSync(path.join(OUT, 'move-window.html'), (await where[0].content()).slice(0, 300000)); (pop || page).screenshot({ path: path.join(OUT, 'move-window.jpg'), type: 'jpeg', quality: 60, fullPage: true }).catch(() => {}); } catch { /* */ }
  }
  const esc = target.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let picked = false;
  for (const f of where) {
    const sels = f.locator('select'); const n = await sels.count().catch(() => 0);
    for (let i = 0; i < n && !picked; i++) {
      const sl = sels.nth(i);
      const opts = await sl.locator('option').allInnerTexts().catch(() => []);
      const hit = opts.find((o) => norm(o).replace(/^[-ㄴ└·\s]+/, '') === target.name);
      if (hit) { await sl.selectOption({ label: hit }); picked = true; log(`  고름(목록): "${norm(hit)}"`); }
    }
    if (picked) break;
    const it = f.locator('label, li, a, span, td').filter({ hasText: new RegExp(`^\\s*[-ㄴ└·]?\\s*${esc}\\s*$`) });
    const k = await it.count().catch(() => 0);
    for (let i = k - 1; i >= 0 && !picked; i--) {
      if (!(await it.nth(i).isVisible().catch(() => false))) continue;
      if (!pop && await it.nth(i).evaluate((el) => !!el.closest('#category-list, .category_list, #category')).catch(() => false)) continue; // 왼쪽 카테고리 메뉴는 아님
      await it.nth(i).click(); picked = true; log(`  고름: "${target.name}"`);
    }
    if (picked) break;
  }
  if (!picked) { log(`  ✖ 옮길 카테고리 "${target.name}" 를 못 찾음`); if (pop) await pop.close().catch(() => {}); return false; }
  await sleep(800);
  for (const f of where) {
    const ok = f.locator('a, button, input[type=button], input[type=submit], input[type=image]').filter({ hasText: /^\s*(확인|이동|적용)\s*$/ });
    let n = await ok.count().catch(() => 0);
    for (let i = n - 1; i >= 0; i--) if (await ok.nth(i).isVisible().catch(() => false)) { await ok.nth(i).click(); log('  누름: 확인'); await sleep(3000); return true; }
    const inp = f.locator('input[value="확인"], input[alt="확인"], img[alt="확인"], input[value="이동"]');
    n = await inp.count().catch(() => 0);
    for (let i = n - 1; i >= 0; i--) if (await inp.nth(i).isVisible().catch(() => false)) { await inp.nth(i).click(); log('  누름: 확인'); await sleep(3000); return true; }
  }
  log('  ✖ 확인 버튼을 못 찾음'); if (pop) await pop.close().catch(() => {}); return false;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  let browser;
  try { browser = await chromium.connectOverCDP(CDP); }
  catch (e) { console.error(`자동화용 크롬(${CDP})에 연결하지 못했어요: ${e.message.split('\n')[0]}`); process.exit(1); }
  const ctx = browser.contexts()[0] || await browser.newContext();
  const page = await ctx.newPage();
  // 확인창: 이동·카테고리 이야기면 '확인', 그 밖은 모두 '취소'
  page.on('dialog', async (d) => {
    const m = d.message();
    log(`  확인창: "${m.slice(0, 80)}"`);
    if (/이동|카테고리|변경/.test(m) && !BAD.test(m.replace(/변경/g, ''))) await d.accept().catch(() => {}); else await d.dismiss().catch(() => {});
  });
  let code = 0;
  try {
    await page.goto(`https://m.blog.naver.com/${id}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(1500);
    const cats = await readCategories(page);
    const byName = new Map(cats.map((c) => [`${c.parent ? cats.find((p) => p.no === c.parent)?.name + '>' : ''}${c.name}`, c]));
    const plan = readPlan();
    let state = await readState(page);
    log(`[카테고리 옮기기] ${id} — ${MODE}, 블로그 글 ${state.size}편, 표 ${plan.length}줄`);
    const todo = [];
    let missingTarget = 0, gone = 0;
    for (const r of plan) {
      const key = r.to_sub ? `${r.to_parent}>${r.to_sub}` : r.to_parent;
      const t = byName.get(key);
      if (!t) { missingTarget++; continue; }
      if (!state.has(r.logNo)) { gone++; continue; }
      if (state.get(r.logNo) !== t.no) todo.push({ ...r, target: t, from: state.get(r.logNo) });
    }
    log(`옮길 글 ${todo.length}편 (이미 맞음 ${plan.length - todo.length - missingTarget - gone}, 블로그에 없음 ${gone}, 카테고리 이름 못 찾음 ${missingTarget})`);
    const by = {};
    for (const t of todo) { const k = `${cats.find((c) => c.no === t.from)?.name} → ${t.target.name}`; by[k] = (by[k] || 0) + 1; }
    for (const [k, v] of Object.entries(by)) log(`  ${k}: ${v}편`);

    if (MODE === 'look') {
      const f = await openList(page, 0);
      log(f ? `목록열기 화면: 체크칸 ${await f.locator('input[type=checkbox]').count()}개` : '목록열기 화면에서 체크칸을 못 찾음');
      await save(page, 'look-list');
      return;
    }

    let moved = 0;
    const limit = MODE === 'test' ? 1 : Infinity;
    let first = true;
    const pages = Math.ceil(state.size / 30) + 1;
    // 전체보기 목록을 쪽마다 돌며, 그 쪽에 보이는 옮길 글을 대상 카테고리별로 묶어 옮긴다 (옮겨도 전체보기 순서는 그대로)
    for (let pg = 1; pg <= pages && todo.length && moved < limit && !code; ) {
      const frame = await openList(page, 0, pg);
      if (!frame) { if (pg === 1) { log('✖ 목록열기 화면에서 체크칸을 못 찾음 — 멈춤'); await save(page, 'fail-list'); code = 2; } break; }
      const vis = new Set(await visibleLogNos(frame));
      if (pg === 1 && first) { log(`1쪽: 글 체크칸 ${await frame.locator('#toplistWrapper input[name=logNo]').count()}개, 글 번호 읽힘 ${vis.size}개 (${frame.url().slice(0, 120)})`); await save(page, 'list-page1'); }
      const here = todo.filter((t) => vis.has(t.logNo));
      if (!here.length) { pg++; continue; }
      const cnt = {};
      for (const t of here) cnt[t.target.no] = (cnt[t.target.no] || 0) + 1;
      const tno = Number(Object.entries(cnt).sort((a, b) => b[1] - a[1])[0][0]);
      const target = here.find((t) => t.target.no === tno).target;
      let want = here.filter((t) => t.target.no === tno).map((t) => t.logNo);
      if (first || MODE === 'test') want = want.slice(0, 1);
      const checked = await checkRows(frame, want);
      if (!checked.length) { log(`✖ ${pg}쪽에서 옮길 글 체크칸을 켜지 못함 — 멈춤`); await save(page, 'fail-check'); code = 2; break; }
      log(`${pg}쪽 묶음: ${checked.length}편 → ${target.name}`);
      if (first) await save(page, 'first-checked');
      const ok = await clickMove(page, frame, target);
      if (!ok) { await save(page, 'fail-move'); code = 2; break; }
      state = await readState(page);
      const good = checked.filter((n) => state.get(n) === target.no);
      log(`  확인: ${good.length}/${checked.length}편 옮겨짐`);
      if (good.length !== checked.length) { log('✖ 블로그에서 다시 읽었더니 옮겨지지 않은 글이 있어 멈춤'); await save(page, 'fail-verify'); code = 2; break; }
      moved += good.length;
      for (const n of good) todo.splice(todo.findIndex((t) => t.logNo === n), 1);
      first = false;
    }
    if (!moved && !code) { log('✖ 목록에서 옮길 글을 하나도 찾지 못함 — list-page1 화면을 보고 고친다'); code = 2; }
    log(`\n끝: ${moved}편 옮김, 남은 글 ${todo.length}편`);
    if (MODE === 'test' && moved === 1) log('시험 한 편이 맞게 옮겨졌어요.');
  } catch (e) { log(`✖ 오류: ${e.message.split('\n')[0]}`); await save(page, 'fail-error'); code = 1; }
  finally {
    fs.writeFileSync(path.join(OUT, 'move-log.txt'), lines.join('\n') + '\n');
    await Promise.race([page.close().catch(() => {}), sleep(3000)]);
    // 사용자의 브라우저 — 끄지 않고 연결만 끊는다
  }
  process.exitCode = code;
}
main().then(() => process.exit(process.exitCode || 0), (e) => { console.error(e); process.exit(1); });
