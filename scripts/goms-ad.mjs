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

// 신청서는 목록 화면 위에 뜨는 창이다 (2026-10-05 실제 화면 structure-form.txt). 목록 화면에도 "등록" 버튼과
// 신청구분·광고방법·광고구분 칸이 그대로 보이므로, 신청서 영역에 data-goms-form 표시를 붙이고 모든 동작을 그 안에서만 한다.
let FORM = null; // { frame, root }
let CURRENT = ''; // 지금 등록하는 제목 (목록에 이미 있으면 다시 등록하지 않는다)

async function markForm(page) {
  for (const f of page.frames()) {
    const ok = await f.evaluate(() => {
      const vis = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
      const txt = (e) => (e.innerText || '').replace(/\s/g, '');
      document.querySelectorAll('[data-goms-form]').forEach((x) => x.removeAttribute('data-goms-form'));
      const tab = [...document.querySelectorAll('button, [role=tab], a')].find((b) => vis(b) && txt(b).endsWith('심의점검표'));
      if (!tab) return false;
      const hasBtn = (box, t) => [...box.querySelectorAll('button, a, [role=button]')].some((b) => vis(b) && txt(b) === t);
      let box = tab; let best = null;
      while (box.parentElement && box.parentElement !== document.body) {
        box = box.parentElement;
        if (hasBtn(box, '조회')) break; // 목록 화면까지 올라가면 멈춘다
        if (hasBtn(box, '등록') || hasBtn(box, '닫기')) best = box;
      }
      if (!best) return false;
      best.setAttribute('data-goms-form', '1');
      return true;
    }).catch(() => false);
    if (ok) { FORM = { frame: f, root: f.locator('[data-goms-form="1"]') }; return true; }
  }
  return false;
}

/** 신청서 안에서만 글자가 정확히 같은 버튼(탭)을 누른다. */
async function clickInForm(texts, { timeout = 8000, endsWith = false } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const text of texts) {
      // endsWith: 광고구분을 고르면 탭 이름이 "심의점검표" → "업무광고 심의점검표" 로 바뀐다 (2026-10-05 14:03 등록 시도)
      const name = endsWith ? new RegExp(`${text}\\s*$`) : text;
      for (const loc of [FORM.root.getByRole('button', { name, exact: !endsWith }), FORM.root.getByRole('tab', { name, exact: !endsWith }), FORM.root.getByText(name, { exact: !endsWith })]) {
        const n = await loc.count().catch(() => 0);
        for (let i = 0; i < n; i++) {
          if (await loc.nth(i).isVisible().catch(() => false)) { await loc.nth(i).click(); log(`  클릭(신청서): ${text}`); return; }
        }
      }
    }
    await sleep(300);
  }
  throw new Stop(`신청서에서 "${texts.join('" / "')}" 버튼을 찾지 못했어요`);
}

/** 신청서 안에서 칸 이름(예: 광고제목 *)이 있는 줄을 찾아 표시를 붙인다. 이름 바로 뒤의 입력칸에도 표시. */
async function row(page, key, labels) {
  const ok = await FORM.root.evaluate((form, { key, labels }) => {
    const vis = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
    const norm = (s) => (s || '').replace(/[\s*:：]/g, '');
    const want = labels.map(norm);
    const CTRL = 'input, select, textarea, [role=combobox], [role=radio], [role=checkbox], span.radio, .check-box';
    // 입력칸은 글자가 없어 줄 전체의 글자가 "광고제목 *" 로만 읽힌다 — 입력칸을 품은 요소는 칸 이름이 아니다
    // (2026-10-05 11:49 등록 시도: 줄 전체를 이름으로 잡아 그 안의 제목 칸을 건너뛰었다)
    const cands = [...form.querySelectorAll('th, td, label, dt, span, div, p, strong')]
      .filter((e) => vis(e) && want.includes(norm(e.innerText)) && e.children.length <= 2 && !e.querySelector(CTRL));
    for (const c of cands) {
      let box = c;
      for (let up = 0; up < 5 && box && box !== form; up++) {
        box = box.parentElement;
        // 읽기 전용 칸(접수자 정보 등)은 빼고 본다 — 11:44 시험에서 광고제목 대신 못 쓰는 칸에 쓰려다 멈췄다
        const ctrls = [...box.querySelectorAll(CTRL)].filter((x) => !c.contains(x) && !x.readOnly && !x.disabled && (x.type === 'file' || vis(x) || x.matches('span.radio, .check-box')));
        if (!ctrls.length) continue;
        form.querySelectorAll(`[data-goms="${key}"]`).forEach((x) => x.removeAttribute('data-goms'));
        box.setAttribute('data-goms', key);
        // 신청구분·광고구분처럼 한 줄에 칸이 둘이면 이름 바로 뒤의 칸을 쓴다
        const next = ctrls.find((x) => c.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING) || ctrls[0];
        form.querySelectorAll(`[data-goms-ctrl="${key}"]`).forEach((x) => x.removeAttribute('data-goms-ctrl'));
        next.setAttribute('data-goms-ctrl', key);
        return true;
      }
    }
    return false;
  }, { key, labels }).catch(() => false);
  if (!ok) throw new Stop(`신청서에서 "${labels[0]}" 칸을 찾지 못했어요`);
  return FORM.root.locator(`[data-goms="${key}"]`);
}

const same = (a, b) => (a || '').replace(/\s/g, '').toLowerCase() === (b || '').replace(/\s/g, '').toLowerCase();

async function fillText(page, key, labels, value) {
  const r = await row(page, key, labels);
  const box = r.locator(`[data-goms-ctrl="${key}"]`);
  if (!(await box.evaluate((x) => /^(INPUT|TEXTAREA)$/.test(x.tagName) && !/^(checkbox|radio|file|hidden)$/.test(x.type)).catch(() => false)))
    throw new Stop(`${labels[0]} 칸 옆에서 글 쓰는 칸을 찾지 못했어요`);
  await box.fill(value, { timeout: 5000 }).catch((e) => { throw new Stop(`${labels[0]} 칸에 글을 넣지 못했어요`); });
  const got = await box.inputValue();
  if (got !== value) throw new Stop(`${labels[0]} 칸에 "${value}" 를 넣었는데 "${got}" 로 읽혀요`);
  log(`  ${labels[0]}: ${value} ✓`);
}

// GOMS 의 동그라미·네모 칸은 진짜 input 이 아니다: 안 고른 칸은 <span class="radio">, 고른 칸은 <svg> 로 그려진다
// (2026-10-05 structure-form.txt — 기본값 "손보"만 svg). 글자(span)를 품은 칸 묶음을 눌러 고르고, svg 로 확인한다.
const PICKED = (item) => !!(item.querySelector('svg') || item.querySelector('input:checked') ||
  /(^|\s)(checked|active|on|selected)(\s|$)/.test(item.className || '') || item.getAttribute('aria-checked') === 'true');

/** 신청서 안의 꾸민 동그라미/네모 칸 하나에 표시를 붙인다 (글자가 정확히 같은 것). */
async function markPick(scopeLoc, option, attr) {
  return scopeLoc.evaluate((box, { option, attr, PICKED }) => {
    const picked = new Function('item', `return (${PICKED})(item)`);
    const vis = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
    const norm = (s) => (s || '').replace(/\s/g, '').toLowerCase();
    box.querySelectorAll(`[${attr}]`).forEach((x) => x.removeAttribute(attr));
    const leaf = [...box.querySelectorAll('span, label, div, p')].find((e) => vis(e) && norm(e.innerText) === norm(option) && e.children.length === 0);
    if (!leaf) return null;
    let item = leaf.parentElement; // 칸 그림(span.radio / svg / input)과 글자를 같이 품은 가장 가까운 묶음
    for (let i = 0; i < 3 && item && !item.querySelector('span.radio, .check-box, svg, input'); i++) item = item.parentElement;
    // 가장 가까운 묶음이 여러 칸을 품으면(무리 전체) 어느 칸인지 알 수 없다 — 고르지 않는다
    if (!item || item.querySelectorAll('span.radio, .check-box, svg, input').length > 2) return null;
    item.setAttribute(attr, '1');
    return picked(item);
  }, { option, attr, PICKED: PICKED.toString() });
}

/** 꾸민 칸 누르기: 칸 묶음(글자 포함)을 누르고, 안 골라지면 칸 그림에 직접 클릭 이벤트를 보낸다 (그림이 0px 일 수 있다). */
async function clickPick(item, isOn) {
  await item.click().catch(() => {});
  await sleep(300);
  if (await isOn()) return;
  await item.evaluate((x) => (x.querySelector('span.radio, .check-box, input') || x).click());
  await sleep(300);
}

async function pickCustom(scopeLoc, option, label) {
  const before = await markPick(scopeLoc, option, 'data-goms-pick');
  if (before === null) throw new Stop(`${label} 에 "${option}" 칸이 없어요`);
  const item = scopeLoc.locator('[data-goms-pick="1"]');
  if (!before) await clickPick(item, async () => !!(await markPick(scopeLoc, option, 'data-goms-pick')));
  const after = await markPick(scopeLoc, option, 'data-goms-pick');
  if (!after) throw new Stop(`${label} "${option}" 을 눌렀는데 골라진 표시가 안 보여요`);
}

/** 고르는 칸: 진짜 select → 꾸민 동그라미 순서. 고른 값을 다시 읽어 확인한다. */
async function choose(page, key, labels, option) {
  const r = await row(page, key, labels);
  const ctrl = r.locator(`[data-goms-ctrl="${key}"]`);
  if (await ctrl.evaluate((x) => x.tagName === 'SELECT').catch(() => false)) {
    const texts = await ctrl.locator('option').allInnerTexts();
    const pick = texts.find((t) => same(t, option));
    if (!pick) throw new Stop(`${labels[0]} 목록에 "${option}" 이 없어요 (목록: ${texts.join(', ')})`);
    await ctrl.selectOption({ label: pick });
    const now = await ctrl.evaluate((s) => s.options[s.selectedIndex]?.text || '');
    if (!same(now, pick)) throw new Stop(`${labels[0]} 를 "${pick}" 로 골랐는데 "${now}" 로 읽혀요`);
    log(`  ${labels[0]}: ${pick} ✓ (목록)`);
    return;
  }
  await pickCustom(r, option, labels[0]);
  log(`  ${labels[0]}: ${option} ✓`);
}

/** "접수자와 동일" 네모칸을 켠다. */
async function checkSame() {
  const before = await markPick(FORM.root, '접수자와 동일', 'data-goms-same');
  if (before === null) throw new Stop('"접수자와 동일" 체크칸을 찾지 못했어요');
  const item = FORM.root.locator('[data-goms-same="1"]');
  const isOn = async () => item.evaluate((x) => { const i = x.querySelector('input[type=checkbox]'); return i ? i.checked : !!x.querySelector('svg'); });
  if (!(await isOn())) await clickPick(item, isOn);
  if (!(await isOn())) throw new Stop('"접수자와 동일" 을 눌렀는데 체크되지 않았어요');
  log('  운영자: 접수자와 동일 ✓');
}

async function attach(page, file) {
  const name = path.basename(file);
  const inp = FORM.root.locator('input[type=file]');
  if (await inp.count()) await inp.first().setInputFiles(file);
  else { // 파일 칸이 없으면 "파일추가" 버튼이 파일 고르는 창을 연다
    const chooser = page.waitForEvent('filechooser', { timeout: 10000 });
    await clickInForm(['파일추가', '파일 추가']);
    await (await chooser).setFiles(file);
  }
  await sleep(2000);
  const seen = await FORM.root.evaluate((form, n) => form.innerText.includes(n), name).catch(() => false);
  if (!seen) throw new Stop(`파일을 넣었는데 신청서 첨부 목록에 "${name}" 이 보이지 않아요`);
  log(`  파일: ${name} ✓`);
}

/** 심의점검표 탭을 열고 모든 항목을 "해당없음"으로. */
async function checklist(page) {
  await clickInForm(['심의점검표', '심의 점검표'], { endsWith: true, timeout: 15000 });
  await sleep(2000);
  await shot(page, 'checklist-open');
  await structure(page, 'checklist');
  // "모두 해당없음" 같은 한 번에 고르는 버튼이 있으면 그것부터 (사용자: "모두 해당없음 클릭")
  await clickInForm(['모두 해당없음', '전체 해당없음', '일괄 해당없음', '모두해당없음', '전체해당없음'], { timeout: 2000 }).catch(() => {});
  await sleep(800);
  // 점검표는 표다: 맨 위 "해당없음" 제목 아래로 줄마다 네모칸이 하나씩 있다 (2026-10-05 사용자 캡처).
  // 줄에는 "해당없음" 글자가 없으므로, 제목 칸과 같은 세로줄(가로 위치)에 있는 네모칸을 모두 고른다.
  const state = async () => FORM.root.evaluate((form) => {
    const vis = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
    const head = [...form.querySelectorAll('th, td, div, span')].find((e) => vis(e) && e.children.length === 0 && (e.innerText || '').replace(/\s/g, '') === '해당없음');
    if (!head) return [];
    const hr = head.getBoundingClientRect();
    const boxes = new Set();
    for (const x of form.querySelectorAll('input[type=checkbox], .check-box, .check-content')) {
      const r = (x.closest('.check-box-container, td, label') || x).getBoundingClientRect();
      const cx = r.left + r.width / 2;
      if (r.top < hr.bottom - 2 || cx < hr.left - 4 || cx > hr.right + 4) continue;
      if (!vis(x) && !vis(x.closest('.check-box-container, td, label') || x)) continue;
      boxes.add(x.closest('.check-box-container, td, label') || x);
    }
    return [...boxes].map((b, i) => {
      b.setAttribute('data-goms-na', String(i));
      const inp = b.matches('input') ? b : b.querySelector('input[type=checkbox]');
      return { i, on: inp ? inp.checked : !!b.querySelector('svg') };
    });
  });
  let st = await state();
  if (!st.length) throw new Stop('심의점검표에서 "해당없음" 칸을 찾지 못했어요');
  for (const { i, on } of st) {
    if (on) continue;
    const item = FORM.root.locator(`[data-goms-na="${i}"]`);
    const isOn = async () => item.evaluate((b) => { const inp = b.matches('input') ? b : b.querySelector('input[type=checkbox]'); return inp ? inp.checked : !!b.querySelector('svg'); });
    await clickPick(item, isOn);
  }
  await sleep(500);
  st = await state();
  await shot(page, 'checklist-filled');
  const ok = st.filter((x) => x.on).length;
  if (ok !== st.length) throw new Stop(`심의점검표 "해당없음" ${st.length}곳 중 ${ok}곳만 골라졌어요`);
  log(`  심의점검표: 해당없음 ${ok}곳 ✓`);
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
  // 탭은 Vuetify v-tab(role=tab)이라 button 으로 안 잡힐 수 있다 — 화면 글자로 직접 본다. 이름은 "…심의점검표"로 바뀔 수 있다.
  const formShown = async () => (await Promise.all(page.frames().map((f) => f.evaluate(() => [...document.querySelectorAll('button, [role=tab], a')]
    .some((b) => !!(b.offsetWidth || b.offsetHeight) && (b.innerText || '').replace(/\s/g, '').endsWith('심의점검표'))).catch(() => false)))).some(Boolean);
  if (await formShown()) throw new Stop('목록 화면에 신청서가 이미 열려 있어 "등록"을 누르지 않았어요');
  if (submit && CURRENT && await listHas(page, CURRENT)) return 'exists';
  await clickText(page, ['광고등록', '광고 등록', '등록']);
  for (let i = 0; i < 20 && !(await formShown()); i++) await sleep(500);
  if (!(await formShown())) throw new Stop('"등록"을 눌렀는데 신청서(심의점검표 탭)가 열리지 않았어요');
  await sleep(3000);
  if (!(await markForm(page))) throw new Stop('신청서 영역을 가려내지 못했어요');
  await shot(page, 'form-open');
  await structure(page, 'form');
  return true;
}

async function formOpen() {
  return FORM.root.evaluate((x) => !!(x.isConnected && (x.offsetWidth || x.offsetHeight))).catch(() => false);
}

/** 광고심의 목록에 이 제목이 있는지 ("조회"를 눌러 새로 읽는다). 같은 편을 두 번 등록하지 않으려고 쓴다. */
async function listHas(page, title) {
  await clickText(page, ['조회'], { timeout: 5000 }).catch(() => {});
  await sleep(2500);
  const found = await Promise.all(page.frames().map((f) => f.evaluate((t) => [...document.querySelectorAll('td')]
    .some((td) => (td.innerText || '').replace(/\s/g, '') === t.replace(/\s/g, '')), title).catch(() => false)));
  return found.some(Boolean);
}

/** 등록 직전 마지막 확인 — 하나라도 다르면 등록을 누르지 않는다. */
async function verifyAll(page, title) {
  const t = await (await row(page, 'title', ['광고제목', '광고 제목'])).locator('[data-goms-ctrl="title"]').inputValue();
  if (t !== title) throw new Stop(`등록 직전 광고제목이 "${t}" 로 되어 있어 멈췄어요`);
  for (const [key, labels, want] of [['kind', ['신청구분'], '신규'], ['type', ['광고구분'], '업무광고']]) {
    const v = await (await row(page, key, labels)).locator(`[data-goms-ctrl="${key}"]`).evaluate((x) => x.options[x.selectedIndex]?.text || '');
    if (!same(v, want)) throw new Stop(`등록 직전 ${labels[0]}이 "${v}" 로 되어 있어 멈췄어요`);
  }
  for (const [key, labels, want] of [['how', ['광고방법'], 'SNS'], ['gift', ['경품여부'], '아니오']]) {
    if (!(await markPick(await row(page, key, labels), want, 'data-goms-pick'))) throw new Stop(`등록 직전 ${labels[0]} "${want}" 이 골라져 있지 않아 멈췄어요`);
  }
  if (!(await FORM.root.evaluate((f, n) => f.innerText.includes(n), `${title}.docx`))) throw new Stop('등록 직전 첨부 파일이 보이지 않아 멈췄어요');
  log('  등록 직전 확인: 제목·신규·업무광고·SNS·경품 아니오·파일 ✓');
}

async function one(page, ctx, n) {
  const title = `스레드 ${n}편`;
  const file = path.join(fileDir, `${title}.docx`);
  if (!fs.existsSync(file)) throw new Stop(`Word 파일이 없어요: ${file}`);
  log(`\n▶ ${title}`);
  CURRENT = title;
  const g = await gotoForm(page);
  if (g === 'exists') { log(`  GOMS 목록에 "${title}" 이 이미 있어 건너뛰어요`); return 'done'; }
  if (!g) return 'login';
  await checkSame();
  await fillText(page, 'title', ['광고제목', '광고 제목'], title);
  await choose(page, 'kind', ['신청구분', '신청 구분'], '신규');
  await choose(page, 'type', ['광고구분', '광고 구분'], '업무광고');
  await choose(page, 'how', ['광고방법', '광고 방법', '광고매체'], 'SNS');
  // 경품여부는 필수칸 — 스레드 보험 정보글은 경품이 없다 (사용자가 알려 준 순서엔 없었지만 화면에 * 표시)
  await choose(page, 'gift', ['경품여부', '경품 여부'], '아니오');
  await attach(page, file);
  await shot(page, 'form-filled');
  // 사용자 순서 (2026-10-05): 기본내용을 모두 채우고 파일추가 → 심의점검표로 넘어가 해당없음 모두 체크 → 등록
  await verifyAll(page, title); // 점검표로 넘어가기 전에 기본내용을 한 번 더 확인
  await checklist(page);
  if (!submit) {
    log('  시험이라 "등록하기"·"등록"은 누르지 않고 멈춰요.');
    return 'test';
  }
  await clickInForm(['등록하기', '등록']);
  await sleep(3000);
  await shot(page, 'after-register-1');
  if (await formOpen()) { // 점검표 저장만 되고 신청서가 남아 있으면 기본내용 맨 아래 "등록"까지
    await clickInForm(['기본내용', '기본 내용']);
    await sleep(1000);
    await verifyAll(page, title);
    await clickInForm(['등록']);
    await sleep(4000);
    await shot(page, 'after-register-2');
  }
  if (await formOpen()) throw new Stop('"등록"을 눌렀는데 신청서가 닫히지 않았어요 — GOMS 목록에서 등록됐는지 확인이 필요해요');
  if (!(await listHas(page, title))) throw new Stop(`신청서는 닫혔는데 목록에서 "${title}" 이 보이지 않아요 — GOMS 목록에서 확인이 필요해요`);
  log(`  목록에서 "${title}" 확인 ✓`);
  return 'done';
}

let browser;
try { browser = await chromium.connectOverCDP(cdp, { timeout: 15000 }); }
catch (e) { log('❌ 자동화용 크롬에 연결하지 못했어요. 크롬 창이 켜져 있는지 확인해 주세요.'); process.exit(1); }
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
    // 사용자 요청: 진행 상황은 한글로만. 예상 못 한 오류의 영어 원문은 기록 파일에만 남긴다.
    if (!(e instanceof Stop)) fs.writeFileSync(path.join(out, 'error-detail.txt'), String(e.stack || e.message), 'utf8');
    log(`  ❌ 멈춤 — ${e instanceof Stop ? e.message : '화면이 예상과 달라 멈췄어요 (자세한 내용은 기록 파일에)'} (등록하지 않았어요)`);
    code = 2;
    break;
  }
}
// 시험 화면 탭은 닫지 않는다 — 사람이 채워진 칸을 직접 볼 수 있게
log(`\n캡처·구조 기록: ${out}`);
await browser.close().catch(() => {}); // CDP 연결만 끊는다 — attach 한 크롬은 꺼지지 않는다
process.exit(code);
