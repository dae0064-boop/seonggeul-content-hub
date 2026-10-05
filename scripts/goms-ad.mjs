#!/usr/bin/env node
/**
 * GOMS(글로벌금융판매 업무 시스템) 광고심의 등록 — 스레드 보험글 Word 를 한 편씩 심의 신청한다.
 *
 * 2026-10-05 사용자 요청: "광고심의를 매번 체크하고 파일을 올리는데 너무 힘들어".
 * 사용자가 알려 준 순서 (화면은 아직 못 봄 — 첫 시험 실행의 캡처·구조 기록으로 맞춘다):
 *   왼쪽 "업무" → "광고심의" → "광고등록"
 *   운영자 "접수자와 동일" 체크 / 광고제목 "스레드 N편" / 신청구분 신규 / 광고구분 업무광고 / 광고방법 SNS
 *   파일추가: 스레드 N편.docx
 *   위쪽 "심의점검표" → 모두 "해당없음" → "등록하기" → 기본내용 맨 아래 "등록"
 *
 *   node scripts/goms-ad.mjs --file-dir <Drive 보험글 폴더> --number 11 --out <폴더>
 *       시험(기본): 칸을 모두 채우고 점검표까지 고른 뒤 멈춘다. "등록하기"·"등록"은 누르지 않는다.
 *   node scripts/goms-ad.mjs ... --submit --from 11 --to 50 --done-dir <폴더>
 *       실제 등록. 한 편씩 차례로, 끝난 편은 <done-dir>/스레드 N편.done 을 남겨 다시 하지 않는다.
 *
 * - 자동화용 크롬(9222)에 붙는다. 크롬은 끄지 않는다. GOMS 로그인은 사람이 그 크롬에서 직접 한다.
 * - 칸을 채운 뒤 다시 읽어 맞지 않으면 등록을 누르지 않는다. 이 확인을 경고로 낮추지 않는다.
 * - 화면 HTML 은 남기지 않는다(개인정보). 칸 이름·버튼 글자만 structure-*.txt 로 남긴다.
 *
 * 종료 코드: 0 = 끝까지 됨, 1 = 크롬에 붙지 못함, 2 = 중간 단계 실패(등록 안 함), 3 = GOMS 로그인 필요
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, def = '') => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : def; };
const submit = argv.includes('--submit');
const fileDir = arg('--file-dir');
const out = arg('--out', path.join('dumps', `goms-${Date.now()}`));
const doneDir = arg('--done-dir');
const from = Number(arg('--from', arg('--number', '11')));
const to = submit ? Number(arg('--to', String(from))) : from; // 시험은 한 편만
const cdp = process.env.CDP_URL || 'http://localhost:9222';
const HOME = process.env.GOMS_HOME || 'https://www.globalgoms.co.kr/#/'; // GOMS_HOME: 모의 화면 시험용
fs.mkdirSync(out, { recursive: true });
if (doneDir) fs.mkdirSync(doneDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.log(m);
let shotNo = 0;
async function shot(page, name) {
  shotNo += 1;
  await page.screenshot({ path: path.join(out, `${String(shotNo).padStart(2, '0')}-${name}.png`), fullPage: true }).catch(() => {});
}
class Stop extends Error {}

/** 칸 이름·입력칸·버튼·고르는 목록만 적는다 (입력된 값은 적지 않는다). 선택자를 고칠 근거. */
async function structure(page, name) {
  const lines = [];
  for (const f of page.frames()) {
    const s = await f.evaluate(() => {
      const vis = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
      const t = (e) => (e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);
      const r = [];
      for (const e of document.querySelectorAll('th, label, dt, .label, .tit, .title, h1, h2, h3, h4, legend')) if (vis(e) && t(e)) r.push(`[칸이름 ${e.tagName.toLowerCase()}] ${t(e)}`);
      for (const e of document.querySelectorAll('input, textarea, select')) {
        const lab = e.id && document.querySelector(`label[for="${e.id}"]`);
        const opts = e.tagName === 'SELECT' ? ` 목록=[${[...e.options].map((o) => o.text.trim()).join(' | ')}]` : '';
        r.push(`[입력 ${e.tagName.toLowerCase()} type=${e.type || ''} name=${e.name || ''} id=${e.id || ''} placeholder=${e.placeholder || ''} 보임=${vis(e)}${lab ? ` label=${t(lab)}` : ''}]${opts}`);
      }
      for (const e of document.querySelectorAll('button, a, [role=button], input[type=button], input[type=submit]')) if (vis(e) && (t(e) || e.value)) r.push(`[버튼 ${e.tagName.toLowerCase()}] ${t(e) || e.value}`);
      for (const e of document.querySelectorAll('[role=combobox], [role=listbox], [role=radio], [role=checkbox], [class*=select], [class*=radio], [class*=check]')) if (vis(e)) r.push(`[꾸민칸 ${e.tagName.toLowerCase()} class=${(e.className + '').slice(0, 60)}] ${t(e)}`);
      return r;
    }).catch(() => []);
    lines.push(`=== frame ${f.url()}`, ...s);
  }
  fs.writeFileSync(path.join(out, `structure-${name}.txt`), lines.join('\n'), 'utf8');
}

/** 모든 프레임에서 글자가 정확히 같은, 보이는 요소를 찾아 누른다. 버튼·링크를 먼저 본다. */
async function clickText(page, texts, { timeout = 10000, scopePage } = {}) {
  const pg = scopePage || page;
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const f of pg.frames()) for (const text of texts) {
      for (const loc of [
        f.getByRole('button', { name: text, exact: true }),
        f.getByRole('link', { name: text, exact: true }),
        f.getByText(text, { exact: true }),
      ]) {
        const n = await loc.count().catch(() => 0);
        for (let i = n - 1; i >= 0; i--) { // 같은 글자가 여럿이면 나중 것(열린 화면 안쪽)부터
          const el = loc.nth(i);
          if (await el.isVisible().catch(() => false)) { await el.click(); log(`  클릭: ${text}`); return true; }
        }
      }
    }
    await sleep(300);
  }
  throw new Stop(`"${texts.join('" / "')}" 를 화면에서 찾지 못했어요`);
}

/** 칸 이름(예: 광고제목)이 있는 줄을 찾아 data-goms 표시를 붙이고 그 줄의 locator 를 돌려준다. */
async function row(page, key, labels) {
  for (const f of page.frames()) {
    const ok = await f.evaluate(({ key, labels }) => {
      const vis = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
      const norm = (s) => (s || '').replace(/[\s*:：]/g, '');
      const want = labels.map(norm);
      const cands = [...document.querySelectorAll('th, td, label, dt, span, div, p, strong')]
        .filter((e) => vis(e) && want.includes(norm(e.innerText)) && e.children.length <= 2);
      // 목록 화면 검색칸에도 같은 이름(신청구분·광고방법·광고구분)이 있다 — 나중에 열린 등록 화면이 DOM 뒤쪽에 오므로 뒤에서부터 본다
      for (const c of cands.reverse()) {
        let box = c;
        for (let up = 0; up < 5 && box; up++) {
          box = box.parentElement;
          if (!box) break;
          const ctrls = [...box.querySelectorAll('input, select, textarea, [role=combobox], [role=radio], [role=checkbox]')].filter((x) => !c.contains(x));
          // 목록 화면 검색칸(첫 항목이 "전체"인 목록)은 등록 칸이 아니다
          if (ctrls.some((x) => x.tagName === 'SELECT' && /^전체$/.test((x.options[0]?.text || '').trim()))) break;
          if (ctrls.length) { document.querySelectorAll(`[data-goms="${key}"]`).forEach((x) => x.removeAttribute('data-goms')); box.setAttribute('data-goms', key);
            // 신청구분·광고구분처럼 한 줄에 칸이 둘이면 이름 바로 뒤의 칸을 쓴다 (2026-10-05 등록 화면 캡처)
            const next = ctrls.find((x) => c.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING) || ctrls[0];
            document.querySelectorAll(`[data-goms-ctrl="${key}"]`).forEach((x) => x.removeAttribute('data-goms-ctrl'));
            next.setAttribute('data-goms-ctrl', key);
            return true; }
        }
      }
      return false;
    }, { key, labels }).catch(() => false);
    if (ok) return f.locator(`[data-goms="${key}"]`);
  }
  throw new Stop(`"${labels[0]}" 칸을 찾지 못했어요`);
}

const same = (a, b) => (a || '').replace(/\s/g, '').toLowerCase() === (b || '').replace(/\s/g, '').toLowerCase();

async function fillText(page, key, labels, value) {
  const r = await row(page, key, labels);
  const box = r.locator('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]), textarea').first();
  await box.fill(value);
  const got = await box.inputValue();
  if (got !== value) throw new Stop(`${labels[0]} 칸에 "${value}" 를 넣었는데 "${got}" 로 읽혀요`);
  log(`  ${labels[0]}: ${value} ✓`);
}

/** 고르는 칸: 진짜 select → 라디오 → 꾸민 목록 순서로 시도하고, 고른 값을 다시 읽어 확인한다. */
async function choose(page, key, labels, option) {
  const r = await row(page, key, labels);
  const ctrl = r.locator(`[data-goms-ctrl="${key}"]`);
  const sel = ctrl;
  if (await ctrl.evaluate((x) => x.tagName === 'SELECT').catch(() => false)) {
    const texts = await sel.locator('option').allInnerTexts();
    const pick = texts.find((t) => same(t, option)) || texts.find((t) => t.replace(/\s/g, '').toLowerCase().includes(option.toLowerCase()));
    if (!pick) throw new Stop(`${labels[0]} 목록에 "${option}" 이 없어요 (목록: ${texts.join(', ')})`);
    await sel.selectOption({ label: pick });
    const now = await sel.evaluate((s) => s.options[s.selectedIndex]?.text || '');
    if (!same(now, pick)) throw new Stop(`${labels[0]} 를 "${pick}" 로 골랐는데 "${now}" 로 읽혀요`);
    log(`  ${labels[0]}: ${pick} ✓ (목록)`);
    return;
  }
  const radios = r.locator('input[type=radio]');
  if (await radios.count()) {
    const ok = await r.evaluate((box, option) => {
      const norm = (s) => (s || '').replace(/\s/g, '').toLowerCase();
      for (const x of box.querySelectorAll('input[type=radio]')) {
        const lab = (x.id && box.querySelector(`label[for="${x.id}"]`)) || x.closest('label') || x.parentElement;
        const txt = norm(lab?.innerText) || norm(x.nextSibling?.textContent) || norm(x.value);
        if (txt === norm(option) || norm(x.value) === norm(option)) { x.setAttribute('data-goms-pick', '1'); return true; }
      }
      return false;
    }, option);
    if (!ok) throw new Stop(`${labels[0]} 에 "${option}" 고르는 칸이 없어요`);
    const pickLoc = r.locator('[data-goms-pick="1"]');
    await pickLoc.check({ force: true });
    if (!(await pickLoc.isChecked())) throw new Stop(`${labels[0]} "${option}" 이 골라지지 않았어요`);
    log(`  ${labels[0]}: ${option} ✓ (라디오)`);
    return;
  }
  // 꾸민 목록: 칸을 눌러 펼치고 글자로 고른다
  await r.locator('[role=combobox], input, [class*=select]').first().click();
  await sleep(500);
  await clickText(page, [option, option.toUpperCase(), option.toLowerCase()], { timeout: 4000 });
  await sleep(300);
  const shown = (await r.innerText().catch(() => '')) + ' ' + (await r.locator('input').first().inputValue().catch(() => ''));
  if (!shown.replace(/\s/g, '').toLowerCase().includes(option.toLowerCase())) throw new Stop(`${labels[0]} 를 "${option}" 로 골랐는데 화면에 안 보여요`);
  log(`  ${labels[0]}: ${option} ✓ (펼침 목록)`);
}

/** "접수자와 동일" 체크칸을 켠다. */
async function checkSame(page) {
  for (const f of page.frames()) {
    const ok = await f.evaluate(() => {
      const vis = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
      for (const x of document.querySelectorAll('input[type=checkbox]')) {
        const lab = (x.id && document.querySelector(`label[for="${x.id}"]`)) || x.closest('label') || x.parentElement;
        if (/접수자와\s*동일/.test(lab?.innerText || '') && (vis(x) || vis(lab))) { x.setAttribute('data-goms-same', '1'); return true; }
      }
      return false;
    }).catch(() => false);
    if (!ok) continue;
    const box = f.locator('[data-goms-same="1"]');
    if (!(await box.isChecked())) await box.check({ force: true }).catch(async () => { await box.click({ force: true }); });
    if (!(await box.isChecked())) throw new Stop('"접수자와 동일" 이 체크되지 않았어요');
    log('  운영자: 접수자와 동일 ✓');
    return;
  }
  throw new Stop('"접수자와 동일" 체크칸을 찾지 못했어요');
}

async function attach(page, file) {
  const name = path.basename(file);
  let done = false;
  for (const f of page.frames()) {
    const inp = f.locator('input[type=file]');
    if (await inp.count()) { await inp.first().setInputFiles(file); done = true; break; }
  }
  if (!done) { // 파일 칸이 없으면 "파일추가" 버튼이 파일 고르는 창을 연다
    const chooser = page.waitForEvent('filechooser', { timeout: 10000 });
    await clickText(page, ['파일추가', '파일 추가', '파일선택', '찾아보기']);
    await (await chooser).setFiles(file);
  }
  await sleep(2000);
  const seen = await Promise.all(page.frames().map((f) => f.evaluate((n) => document.body?.innerText.includes(n) ||
    [...document.querySelectorAll('input[type=file]')].some((x) => [...(x.files || [])].some((y) => y.name === n)), name).catch(() => false)));
  if (!seen.some(Boolean)) throw new Stop(`파일을 넣었는데 화면에 "${name}" 이 보이지 않아요`);
  log(`  파일: ${name} ✓`);
}

/** 심의점검표를 열고 모든 항목을 "해당없음"으로. 팝업 창이면 그 창을 돌려준다. */
async function checklist(page, ctx) {
  const popup = ctx.waitForEvent('page', { timeout: 5000 }).catch(() => null);
  await clickText(page, ['심의점검표', '심의 점검표']);
  const pop = await popup;
  const scope = pop || page;
  if (pop) await pop.waitForLoadState('domcontentloaded').catch(() => {});
  await sleep(2000);
  await shot(scope, 'checklist-open');
  await structure(scope, 'checklist');
  // "모두 해당없음" 같은 한 번에 고르는 버튼이 있으면 그것부터
  try { await clickText(page, ['모두 해당없음', '전체 해당없음', '일괄 해당없음', '모두해당없음', '전체해당없음'], { timeout: 2000, scopePage: scope }); } catch { /* 하나씩 고른다 */ }
  let total = 0; let picked = 0;
  for (const f of scope.frames()) {
    const n = await f.evaluate(() => {
      const norm = (s) => (s || '').replace(/\s/g, '');
      const groups = new Map();
      for (const x of document.querySelectorAll('input[type=radio], input[type=checkbox]')) {
        const lab = (x.id && document.querySelector(`label[for="${x.id}"]`)) || x.closest('label') || x.parentElement;
        const txt = norm(lab?.innerText) || norm(x.nextSibling?.textContent) || norm(x.value);
        if (txt === '해당없음') { x.setAttribute('data-goms-na', '1'); groups.set(x.name || x.id || Math.random(), x); }
      }
      for (const s of document.querySelectorAll('select')) {
        const o = [...s.options].find((o) => norm(o.text) === '해당없음');
        if (o) { s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); }
      }
      return document.querySelectorAll('[data-goms-na="1"]').length;
    }).catch(() => 0);
    if (!n) continue;
    const boxes = f.locator('[data-goms-na="1"]');
    for (let i = 0; i < n; i++) {
      const b = boxes.nth(i);
      if (!(await b.isChecked())) await b.check({ force: true }).catch(() => b.click({ force: true }));
    }
    total += n;
    for (let i = 0; i < n; i++) if (await boxes.nth(i).isChecked()) picked += 1;
  }
  await shot(scope, 'checklist-filled');
  if (!total) throw new Stop('심의점검표에서 "해당없음" 칸을 찾지 못했어요');
  if (picked !== total) throw new Stop(`심의점검표 "해당없음" ${total}곳 중 ${picked}곳만 골라졌어요`);
  log(`  심의점검표: 해당없음 ${picked}곳 ✓`);
  return scope;
}

async function gotoForm(page) {
  await page.goto(HOME, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(4000);
  const login = /#\/login/.test(page.url()) || await page.locator('input[type=password]').first().isVisible().catch(() => false);
  if (login) { await shot(page, 'login'); return false; }
  await shot(page, 'home');
  await clickText(page, ['업무']);
  await sleep(1500);
  await shot(page, 'menu-work');
  await structure(page, 'menu-work');
  await clickText(page, ['광고심의']);
  await sleep(3000);
  await shot(page, 'ad-review');
  await structure(page, 'ad-review');
  // 목록 화면 오른쪽 위 버튼 글자는 "등록" (사용자는 "광고등록"이라 부름 — 2026-10-05 첫 시험 structure-ad-review.txt)
  // 안전장치: "등록"은 신청서의 최종 등록 버튼과 글자가 같다. 신청서(심의점검표 탭)가 이미 보이면 누르지 않는다.
  const formShown = async () => (await Promise.all(page.frames().map((f) => f.getByText('심의점검표', { exact: true }).first().isVisible().catch(() => false)))).some(Boolean);
  if (await formShown()) throw new Stop('목록 화면에 신청서가 이미 열려 있어 "등록"을 누르지 않았어요');
  await clickText(page, ['광고등록', '광고 등록', '등록']);
  for (let i = 0; i < 20 && !(await formShown()); i++) await sleep(500);
  if (!(await formShown())) throw new Stop('"등록"을 눌렀는데 신청서(심의점검표 탭)가 열리지 않았어요');
  await sleep(3000);
  await shot(page, 'form-open');
  await structure(page, 'form');
  return true;
}

async function one(page, ctx, n) {
  const title = `스레드 ${n}편`;
  const file = path.join(fileDir, `${title}.docx`);
  if (!fs.existsSync(file)) throw new Stop(`Word 파일이 없어요: ${file}`);
  log(`\n▶ ${title}`);
  if (!(await gotoForm(page))) return 'login';
  await checkSame(page);
  await fillText(page, 'title', ['광고제목', '광고 제목', '제목'], title);
  await choose(page, 'kind', ['신청구분', '신청 구분'], '신규');
  await choose(page, 'type', ['광고구분', '광고 구분'], '업무광고');
  await choose(page, 'how', ['광고방법', '광고 방법', '광고매체'], 'SNS');
  // 경품여부는 필수칸 — 스레드 보험 정보글은 경품이 없다 (사용자가 알려 준 순서엔 없었지만 화면에 * 표시)
  await choose(page, 'gift', ['경품여부', '경품 여부'], '아니오');
  await attach(page, file);
  await shot(page, 'form-filled');
  const scope = await checklist(page, ctx);
  if (!submit) {
    await clickText(page, ['기본내용', '기본 내용'], { timeout: 3000 }).catch(() => {});
    await sleep(1000);
    await shot(page, 'form-before-register');
    log('  시험이라 "등록하기"·"등록"은 누르지 않고 멈춰요.');
    return 'test';
  }
  await clickText(page, ['등록하기'], { scopePage: scope });
  await sleep(2500);
  await shot(page, 'checklist-saved');
  await clickText(page, ['기본내용', '기본 내용']); // 점검표는 같은 화면의 탭이다 — 기본내용 탭으로 돌아가 등록
  await sleep(1000);
  // 점검표 저장 뒤에도 기본내용이 그대로인지 다시 확인하고 나서 등록한다
  const t = await (await row(page, 'title', ['광고제목', '광고 제목', '제목'])).locator('input, textarea').first().inputValue();
  if (t !== title) throw new Stop(`등록 직전 광고제목이 "${t}" 로 바뀌어 있어 멈췄어요`);
  await clickText(page, ['등록']);
  await sleep(4000);
  await shot(page, 'registered');
  return 'done';
}

let browser;
try { browser = await chromium.connectOverCDP(cdp, { timeout: 15000 }); }
catch (e) { log(`❌ 자동화용 크롬(9222)에 붙지 못했어요: ${e.message.split('\n')[0]}`); process.exit(1); }
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
const dialogs = [];
const onDialog = async (d) => {
  dialogs.push(d.message());
  log(`  알림창: ${d.message()}`);
  if (submit) await d.accept().catch(() => {}); else await d.dismiss().catch(() => {});
};
page.on('dialog', onDialog);
ctx.on('page', (p) => p.on('dialog', onDialog));

log(submit ? `실제 등록: 스레드 ${from}편 ~ ${to}편` : `시험: 스레드 ${from}편 (등록은 누르지 않음)`);
let code = 0;
for (let n = from; n <= to; n++) {
  const mark = doneDir && path.join(doneDir, `스레드 ${n}편.done`);
  if (submit && mark && fs.existsSync(mark)) { log(`\n▶ 스레드 ${n}편 — 이미 등록함, 건너뜀`); continue; }
  try {
    const r = await one(page, ctx, n);
    if (r === 'login') { log('⚠ GOMS 로그인이 필요해요. 자동화용 크롬에 로그인 화면을 열어 두었어요.'); code = 3; break; }
    if (r === 'done') {
      if (mark) fs.writeFileSync(mark, `${new Date().toISOString()}\n${dialogs.slice(-3).join('\n')}\n`, 'utf8');
      log(`  ✅ 스레드 ${n}편 등록`);
    }
  } catch (e) {
    await shot(page, 'stopped');
    await structure(page, 'stopped').catch(() => {});
    log(`  ❌ 멈춤 — ${e instanceof Stop ? e.message : e.message.split('\n')[0]} (등록하지 않았어요)`);
    code = 2;
    break;
  }
}
// 시험 화면 탭은 닫지 않는다 — 사람이 채워진 칸을 직접 볼 수 있게
log(`\n캡처·구조 기록: ${out}`);
await browser.close().catch(() => {}); // CDP 연결만 끊는다 — attach 한 크롬은 꺼지지 않는다
process.exit(code);
