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
 *   node scripts/goms-ad.mjs --file-dir <보험글 폴더> --revise --scan --fixes <goms-fixes.tsv> --out <폴더>
 *       반려 재심사 1단계 (2026-10-26 사용자 요청): 목록에서 승인상태 "반려" 인 「스레드 N편」을 하나씩 열어 심의결과 탭의
 *       심의의견을 읽고, 넣으라는 문구("→ '…'" / ">…" 줄)를 <fixes> 에 "번호<TAB>문구<TAB>날짜" 로 적는다. 아무것도 지우거나 올리지 않는다.
 *       문구를 못 찾은 사유는 reason-스레드 N편.txt 로만 남긴다 (Claude 가 보고 고친다).
 *   (그다음 insurance-word.ps1 이 <fixes> 문구를 본문 아래 빨간 글씨로 넣어 Word 를 다시 만든다)
 *   node scripts/goms-ad.mjs --file-dir <보험글 폴더> --revise [--submit] --fixes <tsv> --done-dir <폴더> --out <폴더>
 *       반려 재심사 2단계 — 사용자가 알려 준 순서: 상세정보 "등록" 탭 → 첨부파일 네모칸 체크 → 파일삭제 → 파일추가(고친 Word) → 수정.
 *       시험(기본): 첫 편의 네모칸 체크까지만 하고 멈춘다. --submit 이면 반려 건을 모두 다시 올린다.
 *       올리기 전에 새 Word 에 그 문구가 들어 있는지 확인하고(없으면 그 편은 건너뜀), 수정 뒤 목록이 반려에서 바뀌었는지 본다.
 *
 *   node scripts/goms-ad.mjs --file-dir <보험글 폴더> --approved --approved-out <goms-approved.tsv> --out <폴더>
 *       승인 결과 읽기 (2026-10-26 사용자 — 스레드에 올릴 때 배너에 편마다 준법심의필번호·유효기간을 넣는다):
 *       목록에서 승인상태 "승인완료" 인 「스레드 N편」을 열어 심의결과 탭의 심의결과·준법심의필번호·유효기간을 읽고
 *       <approved-out> 에 "번호<TAB>심의필번호<TAB>시작일<TAB>끝일<TAB>심의결과<TAB>읽은 날" 로 적는다. 이미 적은 편은 다시 열지 않는다. 아무것도 바꾸지 않는다.
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
import { readFixes as readWordFixes, missingIn } from './threads/word-fix.mjs';

const argv = process.argv.slice(2);
const arg = (name, def = '') => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : def; };
const submit = argv.includes('--submit');
const revise = argv.includes('--revise');
const approved = argv.includes('--approved');
const approvedOut = arg('--approved-out');
const scan = argv.includes('--scan');
const fixesPath = arg('--fixes');
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
const log = (m) => { console.log(m); try { fs.appendFileSync(path.join(out, 'progress.txt'), m + '\n', 'utf8'); } catch { /* 기록 실패는 넘어간다 */ } };
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
          if (await loc.nth(i).isVisible().catch(() => false)) {
            // GOMS 창의 자체 스크롤바 덮개가 마우스 클릭을 가로챌 때가 있다(14:30) — 그때는 페이지 안에서 직접 누른다
            await loc.nth(i).click({ timeout: 3000 }).catch(() => loc.nth(i).evaluate((e) => e.click()));
            log(`  클릭(신청서): ${text}`); return;
          }
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
  // 점검표: 해당없음·적합·미흡·부적합 4열 표. 줄이 30개 넘는데 화면에는 18줄 정도만 그려지고 스크롤하면 나머지가 그려진다
  // (2026-10-05 14:21 — 1-16 까지만 체크되고 1-17 부터 빨간 줄로 남음). 그래서 표 오른쪽 스크롤을 내려 가며 끝까지 체크한다.
  // tick=true 면 보이는 줄 중 안 된 "해당없음"을 페이지 안에서 바로 누른다 (밖에서 누르면 스크롤이 움직여 줄이 다시 그려져 놓친다)
  const pass = (tick) => FORM.root.evaluate((form, tick) => {
    const vis = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
    const norm = (t) => (t || '').replace(/\s/g, '');
    const head = [...form.querySelectorAll('th')].find((e) => vis(e) && norm(e.innerText) === '해당없음');
    if (!head) return { error: 'nohead' };
    const heads = [...head.parentElement.children];
    const col = heads.indexOf(head);
    const noCol = heads.findIndex((h) => /^NO\.?$/i.test(norm(h.innerText)));
    const table = head.closest('table');
    const scope = table.parentElement?.parentElement?.parentElement || table.parentElement;
    const rows = [...scope.querySelectorAll('tr')].filter((tr) => !tr.querySelector('th'));
    const out = [];
    for (const tr of rows) {
      const cells = [...tr.children];
      const cell = cells.length === heads.length ? cells[col] : cells[cells.length - (heads.length - col)];
      const box = cell?.querySelector('input[type=checkbox]');
      if (!box) continue;
      const key = (noCol >= 0 && cells.length === heads.length ? norm(cells[noCol]?.innerText) : '') || norm(tr.innerText).slice(0, 40);
      const others = cells.filter((c) => c !== cell).some((c) => c.querySelector('input[type=checkbox]:checked'));
      if (tick && !box.checked && !others) box.click();
      out.push({ key, on: box.checked, others });
    }
    // 표를 품은 스크롤 영역 (표 안쪽 → 신청서 창 순서로, 실제로 스크롤되는 첫 번째)
    let sc = rows[0] || table;
    while (sc && sc !== document.body && !(sc.scrollHeight > sc.clientHeight + 5 && /(auto|scroll)/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
    const atEnd = !sc || sc === document.body || sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 5;
    return { rows: out, atEnd, hasScroll: !!sc && sc !== document.body };
  }, tick);
  const scrollDown = () => FORM.root.evaluate((form) => {
    const head = [...form.querySelectorAll('th')].find((e) => (e.innerText || '').replace(/\s/g, '') === '해당없음');
    let sc = head?.closest('table')?.querySelector('tbody tr') || head;
    while (sc && sc !== document.body && !(sc.scrollHeight > sc.clientHeight + 5 && /(auto|scroll)/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
    if (!sc || sc === document.body) return false;
    const before = sc.scrollTop;
    sc.scrollTop = before + Math.max(120, sc.clientHeight * 0.7);
    sc.dispatchEvent(new Event('scroll'));
    return sc.scrollTop !== before;
  });
  const scrollTop = () => FORM.root.evaluate((form) => {
    const head = [...form.querySelectorAll('th')].find((e) => (e.innerText || '').replace(/\s/g, '') === '해당없음');
    let sc = head?.closest('table')?.querySelector('tbody tr') || head;
    while (sc && sc !== document.body && !(sc.scrollHeight > sc.clientHeight + 5 && /(auto|scroll)/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
    if (sc && sc !== document.body) { sc.scrollTop = 0; sc.dispatchEvent(new Event('scroll')); }
  });

  // GOMS 신청서 창은 자체 스크롤바(div.scroll-bar)를 쓴다 — 스크롤 값을 바꾸는 방식은 안 먹혔다(14:30 시도, 16줄에서 멈춤).
  // 사람처럼 표 위에 마우스를 올리고 휠을 굴려 내린다. 새 줄이 두 번 연속 안 나오면 맨 아래로 본다.
  // 표에서 지금 그려진 줄들 가운데 한 줄 위에 마우스를 두고, 보이는 줄 높이의 절반만큼만 굴린다(한 번에 많이 굴리면 줄을 건너뛴다)
  const tableBox = async () => FORM.root.evaluate((form) => {
    const head = [...form.querySelectorAll('th')].find((e) => (e.innerText || '').replace(/\s/g, '') === '해당없음');
    const t = head?.closest('table'); if (!t) return null;
    const rows = [...t.querySelectorAll('tr')].filter((tr) => !tr.querySelector('th') && tr.querySelector('input[type=checkbox]'));
    if (!rows.length) return null;
    const inView = (r) => r.top >= 0 && r.bottom <= window.innerHeight;
    if (!inView(rows[0].getBoundingClientRect())) rows[0].scrollIntoView({ block: 'center' }); // 표가 화면 안에 들어오게
    const vr = rows.map((r) => r.getBoundingClientRect()).filter((r) => r.height > 0 && r.bottom > 0 && r.top < window.innerHeight);
    if (!vr.length) return null;
    const mid = vr[Math.floor(vr.length / 2)];
    const span = vr[vr.length - 1].bottom - vr[0].top;
    return { x: mid.left + 40, y: mid.top + mid.height / 2, step: Math.max(40, Math.floor(span * 0.5)) };
  });
  const wheel = async () => {
    const b = await tableBox().catch(() => null);
    if (!b) return;
    await page.mouse.move(b.x, b.y);
    await page.mouse.wheel(0, b.step);
    await sleep(250);
  };
  const goTop = async () => {
    const b = await tableBox().catch(() => null);
    if (b) { await page.mouse.move(b.x, b.y); for (let k = 0; k < 40; k++) await page.mouse.wheel(0, -600); }
    await FORM.root.evaluate((form) => form.querySelectorAll('*').forEach((e) => { if (e.scrollTop) e.scrollTop = 0; })).catch(() => {});
  };

  const seen = new Map(); // 줄 번호(1-1, 2-3 …)
  let still = 0;
  for (let round = 0; round < 200 && still < 3; round++) {
    const r = await pass(true);
    if (r.error) throw new Stop('심의점검표에서 "해당없음" 열을 찾지 못했어요');
    let fresh = 0;
    for (const row of r.rows) {
      if (row.others) throw new Stop(`심의점검표 ${row.key} 줄에 "해당없음" 말고 다른 칸이 체크돼 있어 멈췄어요`);
      if (!seen.has(row.key)) fresh += 1;
      seen.set(row.key, true);
    }
    still = fresh ? 0 : still + 1;
    await wheel();
    await sleep(300);
  }
  log(`  심의점검표: 스크롤하며 ${seen.size}줄 체크`);
  // 맨 위로 돌아가 끝까지 다시 훑어 빠진 줄이 없는지 확인
  await goTop(); await sleep(600);
  const missed = new Set(); const seen2 = new Set();
  still = 0;
  for (let round = 0; round < 200 && still < 3; round++) {
    const r = await pass(false);
    let fresh = 0;
    for (const row of r.rows) { if (!row.on || row.others) missed.add(row.key); else missed.delete(row.key); if (!seen2.has(row.key)) fresh += 1; seen2.add(row.key); }
    still = fresh ? 0 : still + 1;
    await wheel();
    await sleep(300);
  }
  for (const k of seen2) seen.set(k, true);
  await shot(page, 'checklist-filled');
  if (!seen.size) throw new Stop('심의점검표에서 "해당없음" 칸을 찾지 못했어요');
  if (missed.size) throw new Stop(`심의점검표 ${[...missed].join(', ')} 줄이 체크되지 않아 멈췄어요`);
  log(`  심의점검표: 맨 아래까지 ${seen.size}줄 모두 "해당없음" ✓`);
}

/** GOMS 첫 화면 → (로그인) → 업무 → 광고심의 목록. 로그인이 안 되면 false. */
async function openList(page) {
  await page.goto(HOME, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(4000);
  const onLogin = async () => /#\/login/.test(page.url()) || await page.locator('input[type=password]').first().isVisible().catch(() => false);
  if (await onLogin()) {
    // 사용자 (2026-10-05): "LOGIN 만 누르면 들어갈 수 있어" — 크롬이 아이디·비밀번호를 채워 둔다.
    // 비밀번호는 넣지 않는다. 크롬 자동 채움은 실제 클릭이 있어야 사이트에 전달되므로 비밀번호 칸을 한 번 누른 뒤 LOGIN.
    await shot(page, 'login');
    log('  GOMS 로그인 화면 — LOGIN 을 눌러요');
    await page.locator('input[type=password]').first().click({ timeout: 5000 }).catch(() => {});
    await sleep(500);
    await clickText(page, ['LOGIN', 'Login', '로그인'], { timeout: 5000 }).catch(() => {});
    for (let i = 0; i < 20 && await onLogin(); i++) await sleep(500);
    await gomsMessages(page).catch(() => {}); // 로그인 뒤 공지 창이 뜨면 닫는다
    if (await onLogin()) { await shot(page, 'login-failed'); return false; }
    log('  GOMS 로그인 ✓');
    await sleep(3000);
  }
  await shot(page, 'home');
  await clickText(page, ['업무']);
  await sleep(1500);
  await shot(page, 'menu-work');
  await structure(page, 'menu-work');
  await clickText(page, ['광고심의']);
  await sleep(3000);
  await shot(page, 'ad-review');
  await structure(page, 'ad-review');
  return true;
}

async function gotoForm(page) {
  if (!(await openList(page))) return false;
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

/** GOMS 자체 알림창("알림 — 광고심의를 등록 하시겠습니까? [확인][취소]")을 읽고 "확인"을 누른다. 읽은 글을 돌려준다.
 *  알림창은 신청서 영역 안에 그려지기도 한다(2026-10-05 14:45 — 신청서 밖만 찾다가 놓쳤다). 그래서 위치와 상관없이
 *  화면 맨 위에 보이는 "확인"/"예" 버튼을 찾는다. 신청서 자체에는 "확인" 버튼이 없다. */
async function gomsMessages(page) {
  const texts = [];
  for (let k = 0; k < 4; k++) {
    let hit = null;
    for (const f of page.frames()) {
      hit = await f.evaluate(() => {
        const vis = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
        const btns = [...document.querySelectorAll('button, a, [role=button]')]
          .filter((b) => vis(b) && /^(확인|예|OK)$/i.test((b.innerText || '').trim()));
        for (const b of btns.reverse()) {
          const r = b.getBoundingClientRect();
          const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          if (!top || !(b === top || b.contains(top))) continue; // 다른 창에 가려진 버튼은 건너뛴다
          let box = b;
          for (let i = 0; i < 6 && box.parentElement; i++) { box = box.parentElement; if ((box.innerText || '').replace(/\s/g, '').length > 6) break; }
          for (let i = 0; i < 3 && box.parentElement && (box.innerText || '').length < 15; i++) box = box.parentElement;
          const text = (box.innerText || '').replace(/\s+/g, ' ').replace(/(^|\s)(확인|취소|예|아니오|OK)(?=\s|$)/g, ' ').replace(/\s+/g, ' ').replace(/^알림\s*/, '').replace(/(확인|취소|닫기)+\s*$/, '').trim().slice(0, 200);
          return { text, x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }
        return null;
      }).catch(() => null);
      if (hit) {
        // 사람처럼 마우스로 누른다 (안 되면 페이지 안에서)
        await page.mouse.click(hit.x, hit.y).catch(() => {});
        break;
      }
    }
    if (!hit) break;
    texts.push(hit.text);
    log(`  GOMS 알림: ${hit.text || '(문구 없음)'} → 확인`);
    await sleep(1200);
  }
  return texts;
}

async function formOpen() {
  // 신청서 창이 다시 그려지면 표시가 사라질 수 있어, 화면에 "…심의점검표" 탭이 보이는지로 판단한다
  return (await Promise.all(FORM.frame.page().frames().map((f) => f.evaluate(() => [...document.querySelectorAll('button, [role=tab], a')]
    .some((b) => !!(b.offsetWidth || b.offsetHeight) && (b.innerText || '').replace(/\s/g, '').endsWith('심의점검표'))).catch(() => false)))).some(Boolean);
}

/** 광고심의 목록에 이 제목이 있는지 ("조회"를 눌러 새로 읽는다). 같은 편을 두 번 등록하지 않으려고 쓴다. */
async function listHas(page, title) {
  await gomsMessages(page); // 남아 있는 완료 알림을 먼저 닫는다
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
  await sleep(1500);
  const msgs = await gomsMessages(page); // "광고심의를 등록 하시겠습니까?" → 확인, 이어서 완료 알림 → 확인
  await sleep(2000);
  msgs.push(...await gomsMessages(page));
  const bad = msgs.find((t) => /(필수|체크|선택|입력|누락|확인해|실패|오류)/.test(t) && !/하시겠습니까/.test(t));
  if (bad && await formOpen()) throw new Stop(`GOMS 가 "${bad}" 라고 알려 등록되지 않았어요`);
  await shot(page, 'after-register-1');
  // GOMS 는 빠진 점검 줄을 빨간 줄(notice-emergency)로 표시하고 등록하지 않는다
  const red = await FORM.root.evaluate((f) => [...f.querySelectorAll('tr.notice-emergency')].map((tr) => (tr.children[1]?.innerText || '').trim()).filter(Boolean)).catch(() => []);
  if (red.length && await formOpen()) throw new Stop(`GOMS 가 점검표 ${red.join(', ')} 줄이 빠졌다고 표시해 등록되지 않았어요`);
  // "등록 하시겠습니까?"에 이미 확인을 눌렀으면 다시 등록하지 않는다 (두 번 등록 막기)
  const confirmed = msgs.some((t) => /하시겠습니까/.test(t));
  if (confirmed && await formOpen()) throw new Stop('등록 확인을 눌렀는데 신청서가 그대로예요 — GOMS 목록에서 등록됐는지 확인이 필요해요');
  if (!confirmed && await formOpen()) { // 아무 알림 없이 신청서가 남아 있으면 기본내용 맨 아래 "등록"까지
    await clickInForm(['기본내용', '기본 내용']);
    await sleep(1000);
    await verifyAll(page, title);
    await clickInForm(['등록']);
    await sleep(1500);
    await gomsMessages(page);
    await sleep(2500);
    await gomsMessages(page);
    await shot(page, 'after-register-2');
  }
  if (await formOpen()) throw new Stop('"등록"을 눌렀는데 신청서가 닫히지 않았어요 — GOMS 목록에서 등록됐는지 확인이 필요해요');
  if (!(await listHas(page, title))) throw new Stop(`신청서는 닫혔는데 목록에서 "${title}" 이 보이지 않아요 — GOMS 목록에서 확인이 필요해요`);
  log(`  목록에서 "${title}" 확인 ✓`);
  return 'done';
}

// ───────── 반려 재심사 (2026-10-26 사용자 요청) ─────────
// 목록: 승인상태 "반려", 심의결과 "수정요구" 줄이 빨갛게 보인다. 줄을 누르면 "광고심의 상세정보 : 반려" 창이 뜨고
// 탭은 등록 / 심의점검표 / 심의결과. 심의결과 탭의 심의의견 칸에 고칠 내용이 있다 (예: "→ '보험사 상품별로 … 바랍니다'").
// 2026-10-26 첫 실행에서 알게 된 것: 줄을 한 번 누르면 선택만 된다(tr.g-table-selected-row) — 두 번 눌러야 창이 열린다.
// 목록은 보이는 14줄만 그려진다 → 승인상태 칸을 "반려"로 골라 조회한다. 화면 안내: "반려 승인상태시 빨간색으로 표기되며,
// 반려 이후 등록자가 광고심의 내용 수정시 파란색으로 변경" — 수정해도 승인상태는 "반려" 그대로이고 빨간 줄(tr.notice-emergency)만 빠진다.
// 그래서 빨간 줄만 다시 올릴 대상으로 보고, 수정 뒤에는 빨간 줄이 빠졌는지로 확인한다 (두 번 올리지 않게).
const DRIVER = '음주, 무면허, 도주 사고는 보상에서 제외됩니다.';
const YAKGWAN = '보험사 상품별로 상이할 수 있으므로, 세부사항은 반드시 해당 약관을 참조하시기바랍니다';

/** 심의의견에서 넣으라는 문구를 뽑는다. "→ '…'", ">…" 처럼 화살표로 시작하는 줄의 글을 그대로 쓴다 (따옴표만 뗀다). */
function phrasesFrom(opinion) {
  const out = [];
  for (const raw of opinion.split(/\r?\n/)) {
    const m = raw.match(/^\s*(?:→|->|=>|>|▶|☞)\s*(.+)$/);
    if (!m) continue;
    const t = m[1].trim().replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, '').trim();
    if (t.length >= 8 && !out.includes(t)) out.push(t);
  }
  if (!out.length) { // 화살표 줄이 없으면 이미 아는 사유만 (협회 가이드라인 문구 그대로)
    if (/음주|뺑소니|무면허|도주/.test(opinion)) out.push(DRIVER);
    else if (/약관/.test(opinion)) out.push(YAKGWAN);
  }
  return out;
}

function readFixes() {
  const map = new Map();
  if (fixesPath && fs.existsSync(fixesPath)) {
    for (const line of fs.readFileSync(fixesPath, 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
      const [n, t] = line.split('\t');
      if (/^\d+$/.test((n || '').trim()) && (t || '').trim()) {
        const k = Number(n);
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(t.trim());
      }
    }
  }
  return map;
}

/**
 * 목록 표를 위·아래로 움직인다. 표는 보이는 줄만 그린다 (2026-10-26 14:31 — 승인완료 21건 중 14줄만 읽혔다).
 * 'top' 이면 맨 위로, 'down' 이면 한 화면 아래로. 움직였으면 true.
 */
async function scrollList(page, where) {
  for (const f of page.frames()) {
    const r = await f.evaluate((where) => {
      const cell = [...document.querySelectorAll('td')].find((td) => /^스레드\s*\d+\s*편$/.test((td.innerText || '').trim()));
      if (!cell) return null;
      let box = cell.parentElement;
      while (box && box !== document.body) {
        const st = getComputedStyle(box);
        if (/(auto|scroll)/.test(st.overflowY) && box.scrollHeight > box.clientHeight + 4) break;
        box = box.parentElement;
      }
      const el = box && box !== document.body ? box : (document.scrollingElement || document.documentElement);
      const before = el.scrollTop;
      if (where === 'top') el.scrollTop = 0;
      else el.scrollTop = before + Math.max(200, el.clientHeight * 0.7);
      return el.scrollTop !== before;
    }, where).catch(() => null);
    if (r !== null) return r;
  }
  return false;
}

/** 지금 그려진 줄만 읽는다. 칸 이름(th)과 칸 수가 맞으면 이름으로도 꺼낼 수 있게 byName 을 붙인다. */
async function visibleRows(page) {
  const rows = []; let total = null;
  for (const f of page.frames()) {
    const r = await f.evaluate(() => {
      const heads = [...document.querySelectorAll('th')].map((th) => (th.innerText || '').replace(/\s+/g, '').trim()).filter(Boolean);
      const out = [];
      for (const tr of document.querySelectorAll('tr')) {
        const cells = [...tr.children].map((td) => (td.innerText || '').replace(/\s+/g, ' ').trim());
        const title = cells.find((c) => /^스레드\s*\d+\s*편$/.test(c));
        if (!title) continue;
        const byName = {};
        if (heads.length === cells.length) heads.forEach((h, i) => { byName[h] = cells[i]; });
        out.push({ title: title.replace(/\s+/g, ' '), cells, byName, red: /notice-emergency/.test(tr.className || '') });
      }
      const m = (document.body.innerText || '').match(/전체\s*조회\s*건수\s*[:：]?\s*(\d+)/);
      return { out, total: m ? Number(m[1]) : null };
    }).catch(() => null);
    if (r) { rows.push(...r.out); if (r.total != null) total = r.total; }
  }
  return { rows, total };
}

/** 그 편 줄이 지금 표에 그려져 있는지. */
async function rowVisible(page, title) {
  return (await visibleRows(page)).rows.some((r) => r.title.replace(/\s/g, '') === title.replace(/\s/g, ''));
}

/** 목록을 새로 읽어 「스레드 N편」 줄과 칸 글자를 돌려준다 — 표를 끝까지 내려 가며 모은다. */
async function listRows(page) {
  await gomsMessages(page);
  await clickText(page, ['조회'], { timeout: 5000 }).catch(() => {});
  await sleep(2500);
  const seen = new Map(); let total = null;
  await scrollList(page, 'top'); await sleep(500);
  for (let pass = 0; pass < 40; pass++) {
    const v = await visibleRows(page);
    if (v.total != null) total = v.total;
    for (const r of v.rows) seen.set(r.title.replace(/\s/g, ''), r);
    if (total != null && seen.size >= total) break;
    if (!(await scrollList(page, 'down'))) break;
    await sleep(800);
  }
  await scrollList(page, 'top'); await sleep(500);
  const rows = [...seen.values()];
  rows.total = total;
  if (total != null && total > rows.length) log(`  ⚠ 목록 ${total}건 중 ${rows.length}건만 읽혔어요 (표를 끝까지 내려도 더 안 나와요)`);
  else log(`  목록 ${rows.length}건 읽음`);
  return rows;
}
const isRejected = (row) => row.cells.includes('반려');
const needsFix = (row) => isRejected(row) && row.red; // 파란 줄 = 이미 고쳐 올림

/** 목록 위 "승인상태" 칸(선택 목록: 전체·심의대기·반려·승인완료·승인취소)을 고른다. 못 고르면 false (전체로 본다). */
async function filterStatus(page, label) {
  for (const f of page.frames()) {
    const ok = await f.evaluate((label) => {
      document.querySelectorAll('[data-goms-status]').forEach((x) => x.removeAttribute('data-goms-status'));
      const sel = [...document.querySelectorAll('select')].find((s) => {
        const t = [...s.options].map((o) => o.text.trim());
        return t.includes('반려') && t.includes('승인완료');
      });
      if (!sel) return false;
      sel.setAttribute('data-goms-status', '1');
      return true;
    }, label).catch(() => false);
    if (!ok) continue;
    const sel = f.locator('[data-goms-status="1"]');
    await sel.selectOption({ label });
    const now = await sel.evaluate((x) => x.options[x.selectedIndex]?.text.trim() || '');
    if (now === label) { log(`  승인상태: ${label} ✓`); return true; }
  }
  log(`  ⚠ 승인상태 칸을 "${label}" 로 고르지 못해 전체 목록에서 찾아요`);
  return false;
}
const numOf = (title) => Number(title.match(/(\d+)/)[1]);

async function detailOpen(page) {
  return (await Promise.all(page.frames().map((f) => f.evaluate(() => [...document.querySelectorAll('*')]
    .some((e) => !!(e.offsetWidth || e.offsetHeight) && e.children.length <= 2 && /^광고심의\s*상세정보/.test((e.innerText || '').trim()))).catch(() => false)))).some(Boolean);
}

/** "광고심의 상세정보" 창 영역에 표시를 붙여 FORM 으로 쓴다 (목록 화면 버튼을 잘못 누르지 않게). */
async function markDetail(page) {
  for (const f of page.frames()) {
    const ok = await f.evaluate(() => {
      const vis = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
      const txt = (e) => (e.innerText || '').replace(/\s/g, '');
      document.querySelectorAll('[data-goms-form]').forEach((x) => x.removeAttribute('data-goms-form'));
      const heads = [...document.querySelectorAll('*')].filter((e) => vis(e) && e.children.length <= 2 && /^광고심의상세정보/.test(txt(e)));
      heads.sort((a, b) => txt(a).length - txt(b).length);
      if (!heads.length) return false;
      let box = heads[0];
      while (box.parentElement && box.parentElement !== document.body) {
        box = box.parentElement;
        const names = [...box.querySelectorAll('[role=tab], button, a')].filter(vis).map(txt);
        if (names.includes('심의결과') && names.includes('닫기')) { box.setAttribute('data-goms-form', '1'); return true; }
      }
      return false;
    }).catch(() => false);
    if (ok) { FORM = { frame: f, root: f.locator('[data-goms-form="1"]') }; return true; }
  }
  return false;
}

async function openDetail(page, title) {
  if (await detailOpen(page)) throw new Stop('상세정보 창이 이미 열려 있어 다른 줄을 누르지 않았어요');
  // 한 번 누르면 줄 선택만 된다 — 두 번 누른다 (2026-10-26 첫 실행)
  let cell = null;
  // 표는 보이는 줄만 그린다 — 못 찾으면 맨 위부터 한 화면씩 내려 가며 찾는다
  for (let pass = 0; pass < 40 && !cell; pass++) {
    for (const f of page.frames()) {
      const loc = f.locator('td').filter({ hasText: new RegExp(`^\\s*${title.replace(/\s+/g, '\\s*')}\\s*$`) });
      if (await loc.count().catch(() => 0)) { cell = loc.first(); break; }
    }
    if (cell) break;
    if (pass === 0) await scrollList(page, 'top');
    else if (!(await scrollList(page, 'down'))) break;
    await sleep(800);
  }
  if (!cell) throw new Stop(`목록에서 "${title}" 칸을 찾지 못했어요`);
  await cell.scrollIntoViewIfNeeded().catch(() => {});
  await cell.dblclick({ timeout: 5000 }).catch(() => cell.evaluate((e) => e.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))));
  log(`  두 번 클릭: ${title}`);
  for (let i = 0; i < 20 && !(await detailOpen(page)); i++) await sleep(500);
  if (!(await detailOpen(page))) throw new Stop(`목록에서 "${title}" 을 눌렀는데 상세정보 창이 열리지 않았어요`);
  await sleep(1500);
  if (!(await markDetail(page))) throw new Stop('상세정보 창 영역을 가려내지 못했어요');
  // 다른 편이 열리면 안 된다 — 창 안 광고제목 칸으로 확인
  const t = await FORM.root.evaluate((f) => [...f.querySelectorAll('input')].map((i) => i.value).find((v) => /^스레드\s*\d+\s*편$/.test((v || '').trim())) || '').catch(() => '');
  if (t && t.replace(/\s/g, '') !== title.replace(/\s/g, '')) throw new Stop(`"${title}" 을 눌렀는데 "${t}" 창이 열렸어요`);
}

async function closeDetail(page) {
  if (!(await detailOpen(page))) return;
  await clickInForm(['닫기']).catch(() => {});
  await sleep(1500);
  await gomsMessages(page);
}

/** 심의결과 탭의 심의결과·심의의견 글을 읽는다. */
async function readReason(page) {
  await clickInForm(['심의결과']);
  await sleep(1500);
  return FORM.root.evaluate((f) => {
    const vals = [...f.querySelectorAll('textarea')].map((t) => t.value || t.innerText || '').filter((v) => v.trim());
    const result = [...f.querySelectorAll('input')].map((i) => (i.value || '').trim()).find((v) => /^(수정요구|적격|부적격|조건부승인|해당사항없음)$/.test(v)) || '';
    return { result, opinion: vals.join('\n').trim() || (f.innerText || '').trim().slice(0, 1500) };
  });
}

/** 1단계: 반려 건마다 사유를 읽어 goms-fixes.tsv 에 넣을 문구를 적는다. */
async function scanRejected(page, targets) {
  const known = readFixes();
  const added = [];
  for (const row of targets) {
    const n = numOf(row.title);
    log(`\n▶ ${row.title} (반려) — 사유 읽기`);
    await openDetail(page, row.title);
    const { result, opinion } = await readReason(page);
    await shot(page, `reason-${n}`);
    fs.writeFileSync(path.join(out, `reason-스레드 ${n}편.txt`), `심의결과: ${result}\n심의의견:\n${opinion}\n`, 'utf8');
    log(`  심의결과: ${result || '(못 읽음)'}`);
    for (const l of opinion.split(/\r?\n/).filter(Boolean)) log(`  심의의견: ${l}`);
    const ph = phrasesFrom(opinion);
    if (!ph.length) log('  ⚠ 넣을 문구를 찾지 못했어요 — 이 편은 다시 올리지 않고 사유만 남겨요 (Claude 가 보고 고칠게요)');
    for (const t of ph) {
      const have = (known.get(n) || []).some((x) => x.replace(/\s/g, '') === t.replace(/\s/g, ''));
      if (!have) {
        added.push(`${n}\t${t}\t${new Date().toISOString().slice(0, 10)}`);
        if (!known.has(n)) known.set(n, []);
        known.get(n).push(t);
      }
      log(`  넣을 문구: ${t}${have ? ' (이미 적어 둠)' : ''}`);
    }
    await closeDetail(page);
  }
  if (added.length) {
    if (!fixesPath) throw new Stop('--fixes 파일 위치가 없어 문구를 적지 못했어요');
    fs.appendFileSync(fixesPath, added.join('\n') + '\n', 'utf8');
    log(`\n문구 ${added.length}개를 ${path.basename(fixesPath)} 에 적었어요`);
  }
}

/** 승인 결과 표(goms-approved.tsv)에 이미 적은 편 번호. */
function readApproved() {
  // 편마다 마지막 줄이 지금 상태 (반려로 적었다가 나중에 승인되면 적격 줄이 뒤에 붙는다). 적격인 편만 "이미 읽음"으로 본다.
  const last = new Map();
  if (approvedOut && fs.existsSync(approvedOut)) {
    for (const line of fs.readFileSync(approvedOut, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
      const c = line.split('\t');
      if (/^\d+$/.test((c[0] || '').trim())) last.set(Number(c[0]), (c[4] || '').trim());
    }
  }
  const have = new Set([...last].filter(([, r]) => r === '적격').map(([n]) => n));
  have.status = last;
  return have;
}

/** 심의결과 탭에서 칸 이름(준법심의필번호·유효기간 등) 옆 입력칸 글자를 읽는다. */
async function readApproval(page) {
  await clickInForm(['심의결과']);
  await sleep(1500);
  return FORM.root.evaluate((f) => {
    const vis = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
    const norm = (s) => (s || '').replace(/[\s*:：]/g, '');
    // 칸 이름 바로 뒤의 입력칸만 읽는다 — "심의결과"는 탭 이름과 같고, 유효기간 줄에는 심의결과일 칸도 있다 (2026-10-26 모의 시험)
    const valueOf = (label, count = 1) => {
      const cands = [...f.querySelectorAll('th, td, label, dt, span, div, p, strong')]
        .filter((e) => vis(e) && norm(e.innerText) === label && e.children.length <= 2 && !e.querySelector('input, textarea')
          && !e.closest('[role=tab], [role=tablist], button, a'));
      for (const c of cands) {
        let box = c;
        for (let up = 0; up < 4 && box && box !== f; up++) {
          box = box.parentElement;
          const vals = [...box.querySelectorAll('input, textarea')]
            .filter((x) => vis(x) && x.type !== 'radio' && x.type !== 'checkbox' && (c.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING))
            .slice(0, count).map((x) => (x.value || '').trim());
          if (vals.length) return vals.filter(Boolean).join(' ~ ');
        }
      }
      return '';
    };
    return { result: valueOf('심의결과'), no: valueOf('준법심의필번호'), period: valueOf('유효기간', 2) };
  });
}

/** 목록 위 "제목" 칸에 글자를 넣는다 (빈 글자면 지운다). 칸을 못 찾으면 false. */
async function setTitleFilter(page, text) {
  for (const f of page.frames()) {
    const ok = await f.evaluate(() => {
      const vis = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
      document.querySelectorAll('[data-goms-title]').forEach((x) => x.removeAttribute('data-goms-title'));
      const labels = [...document.querySelectorAll('th, td, label, span, div, p, strong')]
        .filter((e) => vis(e) && (e.innerText || '').replace(/\s/g, '') === '제목' && !e.querySelector('input'));
      for (const c of labels) {
        let box = c;
        for (let up = 0; up < 4 && box; up++) {
          box = box.parentElement;
          const inp = [...box.querySelectorAll('input[type=text], input:not([type])')]
            .find((x) => vis(x) && (c.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING));
          if (inp) { inp.setAttribute('data-goms-title', '1'); return true; }
        }
      }
      return false;
    }).catch(() => false);
    if (!ok) continue;
    const inp = f.locator('[data-goms-title="1"]');
    await inp.fill(text);
    return (await inp.inputValue()) === text;
  }
  return false;
}

/**
 * 목록 표가 보이는 줄만 그리고 내려도 더 안 나올 때 (2026-10-26 14:39 실제 GOMS — 승인완료 21건 중 14줄),
 * 빠진 편을 제목 칸에 "스레드 N편" 을 넣고 하나씩 조회해 찾는다. Word 가 있는 번호만 본다.
 */
async function findMissing(page, rows, have) {
  const seen = new Set(rows.map((r) => numOf(r.title)));
  // GOMS 에 올린 편만 — 목록에 보인 가장 큰 번호까지 (Word 는 80편까지 있어도 심의 신청은 30편까지, 2026-10-26 14:45)
  const max = Math.max(0, ...seen, ...have);
  const need = rows.total != null ? rows.total - rows.length : Infinity;
  const missing = [];
  for (let n = 1; n <= max; n++) if (!seen.has(n) && !have.has(n)) missing.push(n);
  if (!missing.length || need <= 0) return [];
  log(`  목록에 안 보인 편을 제목으로 하나씩 찾아요: ${missing.join(', ')}편`);
  const found = [];
  for (const n of missing) {
    if (!(await setTitleFilter(page, `스레드 ${n}편`))) { log('  ⚠ 제목 칸을 찾지 못해 더 찾지 않아요'); break; }
    const hit = (await listRows(page)).find((r) => numOf(r.title) === n && r.cells.includes('승인완료'));
    if (hit) found.push(hit);
    if (found.length >= need) break;
  }
  await setTitleFilter(page, '');
  log(`  제목으로 찾은 승인완료: ${found.map((r) => r.title).join(', ') || '없음'}`);
  return found;
}

/** 승인완료 「스레드 N편」의 심의필번호·유효기간을 goms-approved.tsv 에 적는다. */
async function runApproved(page) {
  if (!approvedOut) throw new Stop('--approved-out 파일 위치가 없어요');
  if (!(await openList(page))) return 3;
  await filterStatus(page, '승인완료');
  const rows = (await listRows(page)).filter((r) => r.cells.includes('승인완료'));
  const have = readApproved();
  rows.push(...(await findMissing(page, rows, have)));
  const targets = rows.filter((r) => !have.has(numOf(r.title))).sort((a, b) => numOf(a.title) - numOf(b.title));
  log(`목록 승인완료 ${rows.length}건 중 새로 읽을 것 ${targets.length}건: ${targets.map((r) => r.title).join(', ') || '없음'}`);
  const today = new Date().toISOString().slice(0, 10);
  for (const row of targets) {
    const n = numOf(row.title);
    log(`\n▶ ${row.title} (승인완료) — 심의필 번호 읽기`);
    // 목록 표에 사내준법심의필번호·유효기간·심의결과 칸이 있다 (2026-10-26 structure-ad-review.txt) — 있으면 상세 창을 열지 않는다
    const b = row.byName || {};
    // 칸 이름과 칸 수가 안 맞으면(14:45 실제 GOMS) 글자 모양으로 찾는다: 번호 26-10-0209, 기간 날짜 둘, 결과 적격 등
    const byShape = (re) => row.cells.find((c) => re.test(c)) || '';
    let a = {
      result: b['심의결과'] || byShape(/^(적격|조건부승인|부적격|수정요구|해당사항없음)$/),
      no: b['사내준법심의필번호'] || byShape(/^제?\s*\d{2}-\d{2}-\d{3,5}\s*호?$/),
      period: b['유효기간'] || byShape(/\d{4}[-.\/]\d{2}[-.\/]\d{2}.*\d{4}[-.\/]\d{2}[-.\/]\d{2}/),
    };
    if (!a.no || !/\d{4}[-./]\d{2}[-./]\d{2}.*\d{4}[-./]\d{2}[-./]\d{2}/.test(a.period) || !a.result) {
      log(`  목록 칸에서 못 읽어 상세 창을 열어요 (칸: ${row.cells.join(' | ')})`);
      // 제목 조회로 찾은 편은 목록에 안 보인다 — 제목 칸에 넣고 다시 조회한 뒤 연다
      if (!(await rowVisible(page, row.title))) { await setTitleFilter(page, row.title); await listRows(page); }
      await openDetail(page, row.title);
      a = await readApproval(page);
      await shot(page, `approved-${n}`);
      await closeDetail(page);
      await setTitleFilter(page, '');
    } else log('  (목록 칸에서 읽음)');
    const no = (a.no.match(/제?\s*(\d{2}-\d{2}-\d{3,5})\s*호?/) || [])[1];
    const dates = (a.period.match(/\d{4}[-./]\d{2}[-./]\d{2}/g) || []).map((d) => d.replace(/[./]/g, '-'));
    log(`  심의결과: ${a.result || '(못 읽음)'} · 준법심의필번호: ${a.no || '(못 읽음)'} · 유효기간: ${a.period || '(못 읽음)'}`);
    if (!no || dates.length < 2) { log('  ⚠ 번호나 유효기간을 읽지 못해 적지 않았어요 (다음 실행에서 다시 봐요)'); continue; }
    fs.appendFileSync(approvedOut, `${n}\t제${no}호\t${dates[0]}\t${dates[1]}\t${a.result}\t${today}\n`, 'utf8');
    log(`  적음: 스레드 ${n}편 제${no}호 (${dates[0]} ~ ${dates[1]})`);
  }
  // 반려(수정요구)된 편도 적어 둔다 — 게시가 "앞 번호 결과를 못 읽었다"며 기다리지 않게 (2026-10-26). 승인되면 적격 줄이 뒤에 붙는다.
  await filterStatus(page, '반려');
  const rej = (await listRows(page)).filter((r) => r.cells.includes('반려'));
  const add = rej.filter((r) => have.status.get(numOf(r.title)) !== '반려').sort((a, b) => numOf(a.title) - numOf(b.title));
  for (const r of add) fs.appendFileSync(approvedOut, `${numOf(r.title)}\t\t\t\t반려\t${today}\n`, 'utf8');
  log(`반려 ${rej.length}건 (새로 적음: ${add.map((r) => numOf(r.title)).join(', ') || '없음'})`);
  return 0;
}

/** 고친 Word 에 문구가 다 들어 있는지 — Python 없이 Word 를 직접 읽는다 (사무실 PC 에 Python 이 없다, 2026-10-26). */
function wordHasFix(n) {
  const ph = readWordFixes(fixesPath).get(n) || [];
  const file = path.join(fileDir, `스레드 ${n}편.docx`);
  try { return ph.length > 0 && fs.existsSync(file) && missingIn(file, ph).length === 0; } catch { return false; }
}

/** 등록 탭 첨부파일 표에서 파일 이름들을 읽고, name 줄에 표시를 붙인다. */
async function fileRows(name) {
  return FORM.root.evaluate((f, name) => {
    const vis = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
    f.querySelectorAll('[data-goms-file]').forEach((x) => x.removeAttribute('data-goms-file'));
    const names = [];
    for (const tr of f.querySelectorAll('tr')) {
      if (!vis(tr)) continue;
      const cell = [...tr.children].map((td) => (td.innerText || '').trim()).find((t) => /\.(docx?|pdf|hwp|jpe?g|png)$/i.test(t));
      if (!cell) continue;
      names.push(cell);
      if (cell.replace(/\s/g, '') === name.replace(/\s/g, '')) tr.setAttribute('data-goms-file', '1');
    }
    return names;
  }, name);
}

// 첨부파일 표의 네모칸은 파일 이름 줄(tr) 안에 없다 — 표 머리의 "전체 선택"(input.g-table-default-all-check)과
// 줄 네모칸이 따로 그려진다 (2026-10-26 13:24 실행 structure-revise-29.txt). 다른 탭(점검표)의 네모칸은 숨어 있으니
// 상세 창에서 보이는 네모칸만 본다. 파일이 하나뿐인 것은 앞에서 확인했다.
const BOXES = (f) => {
  const vis = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
  const all = [...f.querySelectorAll('input[type=checkbox]')].filter(vis);
  return { head: all.filter((i) => /all-check/.test(i.className || '')), rows: all.filter((i) => !/all-check/.test(i.className || '')) };
};

async function fileChecked() {
  return FORM.root.evaluate((f, src) => {
    const { head, rows } = new Function(`return (${src})`)()(f);
    return rows.some((i) => i.checked) || head.some((i) => i.checked);
  }, BOXES.toString()).catch(() => false);
}

/** 첨부파일 네모칸 켜기 — 진짜 마우스로 누르고, 안 되면 표 머리 "전체 선택"(파일이 하나뿐이라 같은 뜻). */
async function checkFileBox(page) {
  const spots = await FORM.root.evaluate((f, src) => {
    const { head, rows } = new Function(`return (${src})`)()(f);
    const at = (i) => { const r = i.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; };
    return { rows: rows.map(at), head: head.map(at) };
  }, BOXES.toString()).catch(() => ({ rows: [], head: [] }));
  log(`  첨부파일 네모칸: 줄 ${spots.rows.length}개, 전체 선택 ${spots.head.length}개`);
  for (const p of [...spots.rows, ...spots.head]) {
    if (!p.w) continue;
    await page.mouse.click(p.x, p.y);
    await sleep(600);
    if (await fileChecked()) return true;
  }
  // 마우스가 안 먹으면(덮개 등) 페이지 안에서 직접 누른다
  await FORM.root.evaluate((f, src) => {
    const { head, rows } = new Function(`return (${src})`)()(f);
    (rows[0] || head[0])?.click();
  }, BOXES.toString()).catch(() => {});
  await sleep(600);
  return fileChecked();
}

/** 2단계: 한 편 다시 올리기 — 등록 탭 → 네모칸 → 파일삭제 → 파일추가 → 수정. */
async function reviseOne(page, row) {
  const n = numOf(row.title);
  const title = `스레드 ${n}편`;
  const file = path.join(fileDir, `${title}.docx`);
  log(`\n▶ ${title} (반려) — 다시 올리기`);
  if (!fs.existsSync(file)) throw new Stop(`Word 파일이 없어요: ${file}`);
  if (!wordHasFix(n)) { log('  ⚠ 새 Word 에 넣을 문구가 아직 없어 건너뛰어요 (사유를 Claude 가 보고 고친 뒤 다시)'); return 'skip'; }
  log('  새 Word 에 수정 문구 들어감 ✓');
  await openDetail(page, title);
  await clickInForm(['등록']); // 상세정보 창의 "등록" 탭 (창 안에만 동작)
  await sleep(1500);
  await shot(page, `revise-${n}-open`);
  await structure(page, `revise-${n}`);
  const names = await fileRows(`${title}.docx`);
  if (!names.length) throw new Stop('첨부파일 표에서 파일을 찾지 못했어요');
  if (names.length > 1 || names[0].replace(/\s/g, '') !== `${title}.docx`.replace(/\s/g, ''))
    throw new Stop(`첨부파일이 예상과 달라 멈췄어요 (보이는 파일: ${names.join(', ')})`);
  if (!(await fileChecked()) && !(await checkFileBox(page))) throw new Stop(`"${title}.docx" 네모칸을 눌렀는데 체크되지 않았어요`);
  log(`  첨부파일 "${title}.docx" 체크 ✓`);
  await shot(page, `revise-${n}-checked`);
  if (!submit) { log('  시험이라 "파일삭제"·"수정"은 누르지 않고 멈춰요.'); return 'test'; }

  await clickInForm(['파일삭제', '파일 삭제']);
  await sleep(1200);
  await gomsMessages(page); // "삭제하시겠습니까?" 같은 확인
  await sleep(1200);
  if ((await fileRows(`${title}.docx`)).length) throw new Stop('"파일삭제"를 눌렀는데 옛 파일이 그대로 있어요 (수정은 누르지 않았어요)');
  log('  옛 파일 삭제 ✓');
  await attach(page, file);
  const after = await fileRows(`${title}.docx`);
  if (after.length !== 1) throw new Stop(`새 파일을 넣은 뒤 첨부파일이 ${after.length}개예요 (수정은 누르지 않았어요)`);
  await shot(page, `revise-${n}-attached`);
  await clickInForm(['수정']);
  await sleep(1500);
  const msgs = await gomsMessages(page);
  await sleep(2000);
  msgs.push(...await gomsMessages(page));
  await shot(page, `revise-${n}-after`);
  const bad = msgs.find((t) => /(필수|체크|선택|입력|누락|확인해|실패|오류)/.test(t) && !/하시겠습니까/.test(t));
  if (bad) throw new Stop(`GOMS 가 "${bad}" 라고 알렸어요 — GOMS 목록에서 확인이 필요해요`);
  // "수정"은 한 번만 누른다 — 창이 남아 있으면 닫고 목록으로 확인한다
  await closeDetail(page);
  const now = (await listRows(page)).find((r) => r.title.replace(/\s/g, '') === title.replace(/\s/g, ''));
  if (!now) throw new Stop(`수정 뒤 목록에서 "${title}" 이 보이지 않아요 — GOMS 목록에서 확인이 필요해요`);
  if (needsFix(now)) throw new Stop(`"수정"을 눌렀는데 목록 줄이 아직 빨간색(반려)이에요 — GOMS 에서 직접 확인이 필요해요 (다시 누르지 않았어요)`);
  log(`  목록: 빨간 줄이 빠짐 (승인상태 ${now.cells.filter((c) => /반려|승인|대기|취소/.test(c)).join(' / ') || '?'}) ✓`);
  return 'done';
}

async function runRevise(page) {
  if (!(await openList(page))) return 3;
  await filterStatus(page, '반려');
  const rows = await listRows(page);
  const blue = rows.filter((r) => isRejected(r) && !r.red);
  if (blue.length) log(`  이미 고쳐 올린 반려(파란 줄): ${blue.map((r) => r.title).join(', ')} — 건너뜀`);
  let targets = rows.filter(needsFix);
  const only = arg('--only');
  if (only) targets = targets.filter((r) => numOf(r.title) === Number(only));
  const limit = Number(arg('--limit', '0'));
  if (!scan && limit > 0 && targets.length > limit) { log(`  이번에는 ${limit}편만 올려요 (나머지는 다음 실행)`); targets = targets.slice(0, limit); }
  log(`목록 ${rows.length}건 중 반려 ${targets.length}건: ${targets.map((r) => r.title).join(', ') || '없음'}`);
  if (!targets.length) return 0;
  if (scan) { await scanRejected(page, targets); return 0; }
  for (const row of targets) {
    const r = await reviseOne(page, row);
    if (r === 'test') break; // 시험은 한 편만, 창을 열어 둔다
    if (r === 'done') {
      if (doneDir) fs.writeFileSync(path.join(doneDir, `${row.title}.revised-${new Date().toISOString().slice(0, 10)}`), `${new Date().toISOString()}\n`, 'utf8');
      log(`  ✅ ${row.title} 다시 올림`);
    }
  }
  return 0;
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

let code = 0;
if (approved) {
  log('승인 결과 읽기: 승인완료 편의 준법심의필번호·유효기간 (아무것도 바꾸지 않음)');
  try { code = await runApproved(page); if (code === 3) log('⚠ LOGIN 을 눌렀는데 들어가지지 않았어요. 열린 크롬 창에서 아이디·비밀번호가 채워져 있는지 확인해 주세요.'); }
  catch (e) {
    await shot(page, 'stopped');
    await structure(page, 'stopped').catch(() => {});
    if (!(e instanceof Stop)) fs.writeFileSync(path.join(out, 'error-detail.txt'), String(e.stack || e.message), 'utf8');
    log(`  ❌ 멈춤 — ${e instanceof Stop ? e.message : '화면이 예상과 달라 멈췄어요 (자세한 내용은 기록 파일에)'}`);
    code = 2;
  }
} else if (revise) {
  log(scan ? '반려 재심사 1단계: 사유 읽기 (아무것도 바꾸지 않음)' : submit ? '반려 재심사: 고친 Word 로 다시 올리기' : '반려 재심사 시험: 네모칸 체크까지만');
  try { code = await runRevise(page); if (code === 3) log('⚠ LOGIN 을 눌렀는데 들어가지지 않았어요. 열린 크롬 창에서 아이디·비밀번호가 채워져 있는지 확인해 주세요.'); }
  catch (e) {
    await shot(page, 'stopped');
    await structure(page, 'stopped').catch(() => {});
    if (!(e instanceof Stop)) fs.writeFileSync(path.join(out, 'error-detail.txt'), String(e.stack || e.message), 'utf8');
    log(`  ❌ 멈춤 — ${e instanceof Stop ? e.message : '화면이 예상과 달라 멈췄어요 (자세한 내용은 기록 파일에)'}`);
    code = 2;
  }
} else log(submit ? `실제 등록: 스레드 ${from}편 ~ ${to}편` : `시험: 스레드 ${from}편 (등록은 누르지 않음)`);
for (let n = from; !revise && !approved && n <= to; n++) {
  const mark = doneDir && path.join(doneDir, `스레드 ${n}편.done`);
  if (submit && mark && fs.existsSync(mark)) { log(`\n▶ 스레드 ${n}편 — 이미 등록함, 건너뜀`); continue; }
  try {
    const r = await one(page, ctx, n);
    if (r === 'login') { log('⚠ LOGIN 을 눌렀는데 들어가지지 않았어요. 열린 크롬 창에서 아이디·비밀번호가 채워져 있는지 확인해 주세요.'); code = 3; break; }
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
