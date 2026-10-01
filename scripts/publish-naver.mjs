#!/usr/bin/env node
/**
 * 네이버 블로그 글 작성 → 임시저장 (또는 예약발행 준비) 자동화
 *
 * 이미 로그인된 크롬(디버깅 포트 9222)에 CDP로 attach 하므로 재로그인/캡차가 없다.
 *
 *   node scripts/publish-naver.mjs --post <파일.json> --save-draft --images <폴더> --color --dump
 *
 * 순서
 *   1) 제목 → 본문을 "글자만" 먼저 전부 입력한다.
 *      [이미지 N] 자리는 "[이미지 N] 설명" 한 줄로 표시해 둔다.
 *   2) --color : 입력이 끝난 뒤 빨간글씨/노란배경 줄을 하나씩 찾아 마우스로 정확히 선택하고 색을 입힌다.
 *   3) --images: "[이미지 N]" 표시 줄을 찾아 지우고 그 자리에 <폴더>/NN.png 를 넣는다.
 *   4) --save-draft: 에디터의 "저장" 버튼만 누른다. "발행" 패널은 열지도 않는다.
 *
 * 글자색이 깨지던 이유 (2026-09 테스트에서 본 증상)
 *   색을 입힌 직후 선택 영역이 그대로 남아 있었고, 그 상태에서 다음 줄을 입력하니
 *   선택된 글자가 새 글자로 덮어써졌다 → "칠하려던 글자가 사라지고 뒷글이 그 색을 입는" 현상.
 *   그래서 색은 본문 입력이 전부 끝난 뒤에 따로 입히고(뒤에 입력할 글이 없다),
 *   입힐 때마다 글자가 그대로 있는지 확인하고, 사라졌으면 Ctrl+Z 로 되돌린 뒤 수동 목록에 넣는다.
 *
 * 실제 발행은 --publish-now 를 사람이 직접 붙였을 때만 한다. 기본은 아무것도 발행하지 않는다.
 */

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------- args
function parseArgs(argv) {
  const out = { cdp: 'http://localhost:9222', slow: 60, linebreak: 'soft', quote: true, quoteStyle: 'quotation_underline' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--post':        out.post = next(); break;
      case '--blog-id':     out.blogId = next(); break;
      case '--at':          out.at = next(); break;
      case '--cdp':         out.cdp = next(); break;
      case '--slow':        out.slow = Number(next()); break;
      case '--linebreak':   out.linebreak = next(); break;
      case '--images':      out.images = next(); break;
      case '--color':       out.color = true; break;
      case '--quote':       out.quote = true; break;
      case '--no-quote':    out.quote = false; break;
      case '--quote-style': out.quoteStyle = next(); break;
      case '--format':      out.color = true; out.quote = true; break;
      case '--save-draft':  out.saveDraft = true; break;
      case '--dry-run':     out.dryRun = true; break;
      case '--publish-now': out.publishNow = true; break;
      case '--url':         out.url = next(); break;
      case '--dump':        out.dump = true; break;
      case '--help':        out.help = true; break;
      default:
        if (a.startsWith('--')) throw new Error(`알 수 없는 옵션: ${a}`);
    }
  }
  return out;
}

const USAGE = `
네이버 블로그 글 작성 자동화 (기본: 임시저장까지만)

  node scripts/publish-naver.mjs \\
    --post content/posts/2026-10-01-dokgam-75.json \\
    --images content/images/2026-10-01-dokgam-75 \\
    --color --save-draft --dump

옵션
  --post <파일>      글 JSON (필수). build-post.mjs 로 .md 에서 생성한다.
  --images <폴더>    [이미지 N] 자리에 <폴더>/NN.png 를 넣는다 (post-images.mjs 결과 폴더)
  --color            빨간글씨/노란배경을 입력 후에 따로 입힌다. 실패한 줄은 목록으로 알려준다
  --format           --color 와 같음 (예전 이름)
  --no-quote         소제목을 인용구로 바꾸지 않는다 (기본은 인용구 4번 '라인&따옴표')
  --quote-style <s>  인용구 모양: default(1) quotation_line(2) quotation_bubble(3)
                     quotation_underline(4, 기본) quotation_postit(5) quotation_corner(6)
  --save-draft       에디터 "저장"(임시저장)만 누르고 끝낸다. 발행 패널은 열지 않는다
  --dry-run          발행 패널까지 열어 카테고리·태그를 넣고, 발행 버튼은 누르지 않는다
  --at "Y-M-D H:M"   (--dry-run 과 함께) 예약 시각을 채워 둔다
  --publish-now      실제 발행 버튼까지 누른다. 사람이 그 자리에서 결정했을 때만 쓴다
  --dump             단계별 스크린샷/HTML 을 dumps/ 에 저장
  --blog-id <id>     글쓰기 주소에 쓸 블로그 아이디 (생략하면 GoBlogWrite 주소)
  --cdp <url>        CDP 주소 (기본 http://localhost:9222)
  --slow <ms>        붙여넣기가 안 될 때 키보드 입력 간 지연 (기본 60)
  --url <url>        글쓰기 URL 재정의 (로컬 목업 테스트용)

--save-draft / --dry-run / --publish-now 중 아무것도 없으면 본문만 채우고 멈춘다.
`;

// ---------------------------------------------------------------- utils
const log  = (...m) => console.log('  ', ...m);
const step = (...m) => console.log('\n▶', ...m);
const warn = (...m) => console.log('  ⚠', ...m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let dumpDir = null, dumpSeq = 0;
const stats = { select: { 마우스: 0, DOM: 0 } };
async function dump(page, label) {
  if (!dumpDir) return;
  const base = path.join(dumpDir, `${String(++dumpSeq).padStart(2, '0')}-${label}`);
  try {
    await page.screenshot({ path: `${base}.png`, fullPage: true });
    fs.writeFileSync(`${base}.html`, await page.content());
    for (const f of page.frames()) {
      if (f === page.mainFrame()) continue;
      if (f.name() === 'mainFrame' || /PostWrite|postwrite/i.test(f.url())) {
        fs.writeFileSync(`${base}.frame.html`, await f.content());
      }
    }
    log(`덤프: ${base}.{png,html}`);
  } catch (e) { warn(`덤프 실패(${label}): ${e.message}`); }
}

async function findFirst(scope, selectors, { timeout = 8000 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const sel of selectors) {
      try {
        const loc = scope.locator(sel).first();
        if (await loc.isVisible({ timeout: 300 })) return { loc, sel };
      } catch { /* 다음 후보 */ }
    }
    await sleep(250);
  }
  throw new Error(`요소를 찾지 못했습니다.\n시도한 선택자:\n${selectors.map(s => `    - ${s}`).join('\n')}`);
}

async function clickFirst(scope, selectors, opts) {
  const { loc, sel } = await findFirst(scope, selectors, opts);
  await loc.click();
  log(`클릭: ${sel}`);
  return loc;
}

/** 페이지와 에디터 프레임 양쪽에서 찾는다. 네이버는 주소에 따라 iframe 이 있거나 없다. */
async function findAnywhere(page, editor, selectors, opts) {
  const scopes = editor === page.mainFrame() ? [page] : [editor, page];
  let lastErr;
  for (const s of scopes) {
    try { return await findFirst(s, selectors, opts); } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

async function resolveEditorFrame(page, timeout = 30000) {
  const probes = ['.se-content', '.se-main-container', '[class*="se-documentTitle"]'];
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      for (const p of probes) {
        try {
          if (await frame.locator(p).first().isVisible({ timeout: 200 })) {
            log(`에디터 프레임 감지 (${p}${frame === page.mainFrame() ? '' : `, iframe ${frame.name() || frame.url().slice(0, 60)}`})`);
            return frame;
          }
        } catch { /* 프레임 전환 중 */ }
      }
    }
    await sleep(400);
  }
  throw new Error('에디터 프레임을 찾지 못했습니다. --dump 로 화면을 확인하세요.');
}

/** 프레임 안 좌표 → 페이지 좌표 보정값 */
async function frameOffset(page, frame) {
  if (frame === page.mainFrame()) return { x: 0, y: 0 };
  const el = await frame.frameElement();
  const box = await el.boundingBox();
  return box ? { x: box.x, y: box.y } : { x: 0, y: 0 };
}

function parseAt(at) {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})$/.exec(at.trim());
  if (!m) throw new Error(`--at 형식이 잘못됐습니다: "${at}" (예: "2026-09-12 07:30")`);
  const date = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  if (Number.isNaN(date.getTime())) throw new Error(`존재하지 않는 날짜: "${at}"`);
  if (+m[5] % 10 !== 0) warn(`네이버 예약은 보통 10분 단위입니다. 분(${m[5]})이 반영되지 않을 수 있습니다.`);
  const p = (n) => String(+n).padStart(2, '0');
  return { date, ymd: `${m[1]}-${p(m[2])}-${p(m[3])}`, hh: p(m[4]), mm: m[5] };
}

const imageLabel = (block) => `[이미지 ${block.n}] ${block.lines[0]?.t || ''}`.trim();

// ---------------------------------------------------------------- 툴바 / 서식
// 규칙 [11] 색상: 빨강 #ff0010 (글자색), 연한 노랑 #fff8b2 (배경색)
const COLORS = {
  red:    { hex: '#ff0010', rgb: [255, 0, 16],    prop: 'color',           name: '빨간글씨' },
  yellow: { hex: '#fff8b2', rgb: [255, 248, 178], prop: 'backgroundColor', name: '노란배경' },
};
const swatchSelectors = (hex) => [
  `button.se-color-palette[title="${hex}"]`,
  `button.se-color-palette[data-color="${hex}"]`,
  `.se-color-palette[title="${hex}" i]`,
  `[class*="palette"] button[title="${hex}" i]`,
  `[data-value="${hex}" i]`,
];
const TOOLBAR = {
  red: [
    'button.se-font-color-toolbar-button',
    'button[data-name="font-color"]',
    'button[class*="font-color"]',
    'button[title*="글자색"]',
  ],
  yellow: [
    'button.se-background-color-toolbar-button',
    'button[data-name="background-color"]',
    'button[class*="background-color"]',
    'button[title*="배경색"]',
  ],
  quote: [
    'button.se-insert-quotation-default-toolbar-button',
    'button[data-name="quotation"]',
    'button[title*="인용구"]',
  ],
  image: [
    'button.se-image-toolbar-button',
    'button[data-name="image"]',
    'button[title*="사진"]',
  ],
  save: [
    'button[class*="save_btn"]',
    'button:text-is("저장")',
    'button:has-text("저장"):not(:has-text("발행"))',
  ],
  helpClose: ['.se-help-panel-close-button', 'button[class*="help"][class*="close"]'],
};

/**
 * 에디터 본문 DOM 작업을 한 곳에서 한다 (프레임 안에서 실행된다).
 *   op 'locate' : text 의 nth 번째 위치를 찾아 화면 좌표(rects)를 돌려준다
 *   op 'select' : 그 구간을 DOM 선택 영역으로 지정한다
 *   op 'check'  : 그 구간이 남아 있는지, 원하는 색(prop=rgb)을 입었는지
 * 한 줄 전체가 같아야 맞은 것으로 본다(앞뒤가 줄 경계). 다른 줄 속의 같은 문구는 세지 않는다.
 */
function domOp({ op, text, nth, rgb, prop }) {
  const root = document.querySelector('.se-main-container') || document.querySelector('.se-content') || document.body;
  const paras = [...root.querySelectorAll('.se-text-paragraph')].filter((p) => !p.closest('.se-documentTitle'));
  let k = 0;
  for (const p of paras) {
    const nodes = []; let full = '';
    const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let n;
    while ((n = w.nextNode())) {
      if (n.nodeType === 1) { if (n.tagName === 'BR' || ((n.tagName === 'DIV' || n.tagName === 'P') && full)) full += '\n'; continue; }
      nodes.push({ n, start: full.length });
      full += n.nodeValue;
    }
    const clean = full.replace(/\u200b/g, ' ');
    let from = 0, idx;
    while ((idx = clean.indexOf(text, from)) !== -1) {
      const end = idx + text.length;
      from = end;
      const b0 = idx === 0 || clean[idx - 1] === '\n' || !clean.slice(0, idx).trim();
      const b1 = end === clean.length || clean[end] === '\n' || !clean.slice(end).replace(/\n/g, '').trim();
      if (!b0 || !b1) continue;
      if (k++ !== nth) continue;

      const at = (pos, isEnd) => {
        for (let i = nodes.length - 1; i >= 0; i--) {
          const x = nodes[i];
          if (isEnd ? pos > x.start : pos >= x.start) return [x.n, Math.min(pos - x.start, x.n.nodeValue.length)];
        }
        return [nodes[0].n, 0];
      };
      const range = document.createRange();
      range.setStart(...at(idx, false));
      range.setEnd(...at(end, true));

      if (op === 'locate') {
        p.scrollIntoView({ block: 'center' });
        const rects = [...range.getClientRects()].filter((r) => r.width > 0)
          .map((r) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom }));
        return { found: true, rects };
      }
      if (op === 'select') {
        const host = p.closest('[contenteditable="true"], [contenteditable=""]') || p;
        if (host.focus) host.focus({ preventScroll: true });
        const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
        document.dispatchEvent(new Event('selectionchange'));
        return { found: true };
      }
      // check
      const want = `rgb(${rgb.join(', ')})`;
      const inside = nodes.filter((x) => x.start < end && x.start + x.n.nodeValue.length > idx && x.n.nodeValue.trim());
      const styled = inside.length > 0 && inside.every((x) => {
        for (let e = x.n.parentElement; e && e !== p.parentElement; e = e.parentElement) {
          if (getComputedStyle(e)[prop] === want) return true;
        }
        return false;
      });
      return { found: true, present: true, styled };
    }
  }
  return { found: false, present: false, styled: false, count: k };
}

/** text 와 똑같은 줄이 본문(인용구 밖)에 몇 개 있는지 */
function domCount(text) {
  const root = document.querySelector('.se-main-container') || document.querySelector('.se-content') || document.body;
  return [...root.querySelectorAll('.se-text-paragraph')]
    .filter((p) => !p.closest('.se-documentTitle') && !p.closest('.se-quotation'))
    .filter((p) => p.textContent.replace(/\u200b/g, '').trim() === text).length;
}

const locateText = (editor, text, nth) => editor.evaluate(domOp, { op: 'locate', text, nth });
const selectTextByRange = (editor, text, nth) => editor.evaluate(domOp, { op: 'select', text, nth });
const checkStyled = (editor, text, nth, color) =>
  editor.evaluate(domOp, { op: 'check', text, nth, rgb: color.rgb, prop: color.prop });
const currentSelection = (editor) => editor.evaluate(() => String(getSelection()).replace(/\u200b/g, '').trim());

/** 화면에서 마우스로 text 구간을 끌어 선택한다. 빗나가면 DOM 선택으로 한 번 더. */
async function selectText(page, editor, text, nth) {
  const loc = await locateText(editor, text, nth);
  if (!loc.found || !loc.rects?.length) return { ok: false, why: `본문에서 글자를 찾지 못함 (같은 줄 ${loc.count ?? 0}개)` };
  await sleep(200);
  const again = await locateText(editor, text, nth); // 스크롤이 끝난 뒤 좌표를 다시 잰다
  const off = await frameOffset(page, editor);
  const first = again.rects[0], last = again.rects[again.rects.length - 1];
  await page.mouse.move(off.x + first.left + 0.5, off.y + (first.top + first.bottom) / 2);
  await page.mouse.down();
  await page.mouse.move(off.x + last.right - 0.5, off.y + (last.top + last.bottom) / 2, { steps: 12 });
  await page.mouse.up();
  await sleep(250);
  let sel = await currentSelection(editor);
  let how = "마우스";
  if (sel !== text) {
    await selectTextByRange(editor, text, nth);
    await sleep(200);
    sel = await currentSelection(editor);
    how = 'DOM';
  }
  if (sel !== text) return { ok: false, why: `선택이 빗나감 (선택된 글: "${sel.slice(0, 40)}")` };
  stats.select[how]++;
  return { ok: true, how };
}

async function collapseSelection(page, editor) {
  await editor.evaluate(() => { const s = getSelection(); if (s.rangeCount) s.collapseToEnd(); }).catch(() => {});
  await page.keyboard.press('Escape').catch(() => {});
}

/** 한 줄에 색을 입힌다. 성공 여부를 돌려주고, 글자가 사라지면 되돌린다. */
async function applyColor(page, editor, text, nth, style) {
  const color = COLORS[style];
  const before = await checkStyled(editor, text, nth, color);
  if (!before.present) return { ok: false, why: '본문에서 글자를 찾지 못함' };
  if (before.styled) return { ok: true, already: true };

  const sel = await selectText(page, editor, text, nth);
  if (!sel.ok) return sel;

  try {
    await clickFirst(editor, TOOLBAR[style], { timeout: 3000 });
    await sleep(400);
    // 팔레트를 열었을 때 선택이 풀렸으면 여기서 멈춘다 (글자를 잃지 않기 위해)
    if ((await currentSelection(editor)) !== text) {
      await page.keyboard.press('Escape').catch(() => {});
      return { ok: false, why: '팔레트를 여는 순간 선택이 풀림' };
    }
    await clickFirst(editor, swatchSelectors(color.hex), { timeout: 3000 });
    await sleep(350);
  } catch (e) {
    await page.keyboard.press('Escape').catch(() => {});
    return { ok: false, why: `툴바/팔레트를 찾지 못함 — ${e.message.split('\n')[0]}` };
  }

  await collapseSelection(page, editor);
  await sleep(200);
  const after = await checkStyled(editor, text, nth, color);
  if (!after.present) {
    warn(`글자가 사라졌습니다 → Ctrl+Z 로 되돌립니다: "${text}"`);
    await page.keyboard.press('Control+z');
    await sleep(500);
    const back = await checkStyled(editor, text, nth, color);
    return { ok: false, why: back.present ? '글자가 사라져 되돌림' : '글자가 사라졌고 되돌리기도 실패 — 직접 확인 필요', lost: !back.present };
  }
  if (!after.styled) return { ok: false, why: '눌렀지만 색이 들어가지 않음' };
  return { ok: true };
}

/**
 * 소제목 줄을 지우고 그 자리에 인용구(기본 4번 '라인&따옴표')를 넣어 같은 글을 쓴다.
 * 툴바 인용구 버튼 옆 ▼ 로 모양을 고른다. 모양 이름(2026-10 에디터 기준):
 *   default=1 따옴표, quotation_line=2 버티컬 라인, quotation_bubble=3 말풍선,
 *   quotation_underline=4 라인&따옴표, quotation_postit=5 포스트잇, quotation_corner=6 프레임
 */
async function insertQuoteAt(page, editor, text, style) {
  const ids = () => editor.evaluate(() => [...document.querySelectorAll('.se-component.se-quotation')].map((e) => e.id || e.dataset.compid || ''));
  const before = await ids();

  const sel = await selectText(page, editor, text, 0);
  if (!sel.ok) return { ok: false, why: `소제목 줄을 찾지 못함 — ${sel.why}` };
  const countBefore = await editor.evaluate(domCount, text);
  await page.keyboard.press('Backspace');
  await sleep(300);
  if ((await editor.evaluate(domCount, text)) >= countBefore) {
    await selectTextByRange(editor, text, 0);
    await editor.evaluate(() => document.execCommand('delete'));
    await sleep(300);
    if ((await editor.evaluate(domCount, text)) >= countBefore) return { ok: false, why: '소제목 줄이 지워지지 않음 (그대로 둠)' };
  }

  const restore = async () => { await page.keyboard.insertText(text).catch(() => {}); };
  try {
    await clickFirst(editor, [
      'button.se-document-toolbar-select-option-button[data-name="quotation"]',
      'button[data-name="quotation"][aria-haspopup="true"]',
    ], { timeout: 3000 });
    await sleep(400);
    await clickFirst(editor, [
      `button[data-name="quotation"][data-value="${style}"]`,
      `[data-value="${style}"]`,
      `button[class*="-${style}"]`,
      `button[class*="${style}"]`,
    ], { timeout: 3000 });
  } catch (e) {
    await page.keyboard.press('Escape').catch(() => {});
    await restore();
    return { ok: false, why: `인용구 모양 메뉴를 찾지 못함 — ${e.message.split('\n')[0]}` };
  }

  // 새 인용구가 생겼는지
  let newId = null;
  for (let i = 0; i < 20 && !newId; i++) {
    await sleep(250);
    const now = await ids();
    newId = now.find((x) => !before.includes(x)) || (now.length > before.length ? now[now.length - 1] : null);
  }
  if (!newId) { await restore(); return { ok: false, why: '인용구가 만들어지지 않음' }; }

  // 커서가 새 인용구 안에 있는지 보고, 아니면 그 안을 눌러 넣는다
  const inside = await editor.evaluate((id) => {
    const n = getSelection().anchorNode;
    const el = n && (n.nodeType === 1 ? n : n.parentElement);
    const comp = el && el.closest('.se-component');
    return !!comp && (comp.id === id || comp.dataset.compid === id);
  }, newId);
  if (!inside) {
    const target = editor.locator(`[id="${newId}"] .se-text-paragraph, [data-compid="${newId}"] .se-text-paragraph`).first();
    try { await target.click(); await sleep(300); } catch { /* 아래에서 확인 */ }
    const nowInside = await editor.evaluate((id) => {
      const n = getSelection().anchorNode; const el = n && (n.nodeType === 1 ? n : n.parentElement);
      const comp = el && el.closest('.se-component'); return !!comp && (comp.id === id || comp.dataset.compid === id);
    }, newId);
    if (!nowInside) return { ok: false, why: '새 인용구 안으로 커서가 들어가지 않음 — 빈 인용구 안에 소제목을 직접 써 주세요', lost: text };
  }
  await page.keyboard.insertText(text);
  await sleep(300);

  const got = await editor.evaluate((id) => {
    const el = document.getElementById(id) || document.querySelector(`[data-compid="${id}"]`);
    return el ? { text: el.textContent.replace(/\u200b/g, ''), cls: el.className } : null;
  }, newId);
  if (!got || !got.text.includes(text)) {
    await page.keyboard.press('Control+z').catch(() => {}); // 엉뚱한 곳에 들어간 글을 되돌린다
    return { ok: false, why: '인용구에 글이 들어가지 않음 (되돌림 — 화면 확인 필요)', lost: text };
  }
  await collapseSelection(page, editor);
  return { ok: true, styled: got.cls.includes(style) };
}

/** "[이미지 N] 설명" 표시 줄을 지우고 그 자리에 그림 파일을 넣는다. */
async function insertImageAt(page, editor, label, file) {
  const count = () => editor.locator('.se-component.se-image, .se-module-image').count();
  const before = await count();

  const sel = await selectText(page, editor, label, 0);
  if (!sel.ok) return { ok: false, why: `표시 줄을 찾지 못함 — ${sel.why}` };
  await page.keyboard.press('Backspace');
  await sleep(300);
  let leftover = false;
  if ((await locateText(editor, label, 0)).found) {
    // 키 입력이 안 먹었으면 선택을 다시 잡고 에디터 명령으로 지운다
    await selectTextByRange(editor, label, 0);
    await editor.evaluate(() => document.execCommand('delete'));
    await sleep(300);
    leftover = (await locateText(editor, label, 0)).found;
    if (leftover) warn(`표시 줄이 지워지지 않았습니다 — 그림은 그 아래에 넣고 표시 줄은 손으로 지우세요.`);
  }

  let chosen = false;
  try {
    const btn = await findFirst(editor, TOOLBAR.image, { timeout: 4000 });
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 8000 }),
      btn.loc.click(),
    ]);
    await chooser.setFiles(file);
    chosen = true;
  } catch (e) {
    // 파일 선택 창을 못 잡으면 숨은 input[type=file] 에 직접 넣어 본다
    try {
      const input = editor.locator('input[type="file"]').first();
      if (await input.count()) { await input.setInputFiles(file); chosen = true; }
    } catch { /* 아래에서 실패 처리 */ }
    if (!chosen) {
      await page.keyboard.insertText(label); // 표시 줄을 되살린다
      return { ok: false, why: `사진 버튼/파일 선택 실패 — ${e.message.split('\n')[0]}` };
    }
  }

  const deadline = Date.now() + 40000;
  while (Date.now() < deadline) {
    if ((await count()) > before) {
      await sleep(800);
      await collapseSelection(page, editor);
      return { ok: true, leftover };
    }
    await sleep(500);
  }
  return { ok: false, why: '업로드가 40초 안에 끝나지 않음 (화면 확인 필요)' };
}


// ---------------------------------------------------------------- 본문 넣기
/** 굵게/기울임/밑줄/취소선이 켜져 있으면 끈다. 켜진 채로 쓰면 글 전체에 그 서식이 붙는다. */
async function resetToggles(editor) {
  for (const name of ['bold', 'italic', 'underline', 'strikethrough']) {
    try {
      const btn = editor.locator(`button[data-name="${name}"].se-is-selected`).first();
      if (await btn.count() && await btn.isVisible()) {
        await btn.click();
        log(`켜져 있던 서식 끔: ${name}`);
        await sleep(150);
      }
    } catch { /* 버튼 없음 */ }
  }
}

/** 원고에서 본문에 들어가야 할 줄 목록 (이미지 자리는 표시 줄) */
function expectedLines(post) {
  const out = [];
  for (const b of post.blocks) {
    if (b.type === 'image') out.push(imageLabel(b));
    else for (const l of b.lines) out.push(l.t);
  }
  return out;
}

const escHtml = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** 원고 → 붙여넣을 HTML. 줄마다 문단 하나, 덩어리 사이엔 빈 문단. 색은 미리 입혀 둔다. */
function bodyHtml(post) {
  const parts = [];
  post.blocks.forEach((b, i) => {
    // 이미지 위아래에는 빈 줄을 두지 않는다 (사용자 지시 2026-10-01: 글과 그림이 붙어 이어지게)
    if (i && b.type !== 'image' && post.blocks[i - 1].type !== 'image') parts.push('<p><br></p>');
    if (b.type === 'image') { parts.push(`<p>${escHtml(imageLabel(b))}</p>`); return; }
    for (const l of b.lines) {
      const t = escHtml(l.t);
      if (l.s === 'red') parts.push(`<p><span style="color:${COLORS.red.hex}">${t}</span></p>`);
      else if (l.s === 'yellow') parts.push(`<p><span style="background-color:${COLORS.yellow.hex}">${t}</span></p>`);
      else parts.push(`<p>${t}</p>`);
    }
  });
  return parts.join('');
}
const bodyText = (post) => post.blocks.map((b) => b.type === 'image' ? imageLabel(b) : b.lines.map((l) => l.t).join('\n')).join('\n\n'); // 붙여넣기 실패 시 참고용

const bodyCharCount = (editor) => editor.evaluate(() => {
  const ps = [...(document.querySelector('.se-main-container') || document.querySelector('.se-content') || document.body).querySelectorAll('.se-text-paragraph')].filter((p) => !p.closest('.se-documentTitle'));
  return ps.map((p) => p.textContent).join('').replace(/\u200b/g, '').trim().length;
});

/** 붙여넣은 글이 화면에 나타날 때까지 최대 10초 기다린다 */
async function waitForBody(editor, ms = 10000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if ((await bodyCharCount(editor)) > 50) { await sleep(1000); return true; }
    await sleep(400);
  }
  return false;
}

/**
 * 본문을 붙여넣는다. 한 줄씩 키보드로 치면 에디터가 문단을 새로 만드는 사이에 글자를 먹는다
 * (2026-10-01 실제로 119줄 중 16줄이 사라졌다). 그래서 한 번에 붙여넣는다.
 *   1) 클립보드에 HTML 을 넣고 Ctrl+V   2) 안 되면 붙여넣기 이벤트를 직접 보낸다
 *   3) 둘 다 안 되면 예전 방식(키보드)으로, 문단마다 천천히 친다
 */
async function pasteBody(page, editor, post, args) {
  const html = bodyHtml(post), text = bodyText(post);

  // 1) 시스템 클립보드 + Ctrl+V
  try {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://blog.naver.com' }).catch(() => {});
    await page.bringToFront().catch(() => {});
    const wrote = await editor.evaluate(async ({ html, text }) => {
      try {
        await navigator.clipboard.write([new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        })]);
        return true;
      } catch (e) { return String(e); }
    }, { html, text });
    if (wrote === true) {
      await page.keyboard.press('Control+V');
      if (await waitForBody(editor)) return '클립보드 붙여넣기 (이 PC 의 클립보드 내용이 원고로 바뀌었어요)';
    } else {
      log(`클립보드 쓰기 안 됨: ${String(wrote).slice(0, 80)}`);
    }
  } catch (e) { log(`클립보드 방식 실패: ${e.message.split('\n')[0]}`); }

  // 2) 붙여넣기 이벤트 직접 보내기
  const dispatched = await editor.evaluate(({ html, text }) => {
    const target = document.activeElement && document.activeElement.isContentEditable
      ? document.activeElement
      : (getSelection().anchorNode?.parentElement?.closest('[contenteditable]') || document.querySelector('[contenteditable="true"]'));
    if (!target) return false;
    const dt = new DataTransfer();
    dt.setData('text/html', html);
    dt.setData('text/plain', text);
    target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    return true;
  }, { html, text });
  if (dispatched && await waitForBody(editor)) return '붙여넣기 이벤트';
  if ((await bodyCharCount(editor)) > 0) {
    throw new Error('붙여넣기 결과를 확인하지 못했는데 본문에 글자가 생겼습니다. 두 번 들어가지 않게 여기서 멈춥니다.');
  }

  // 3) 키보드 — 문단마다 기다리며 천천히
  warn('붙여넣기가 안 돼서 키보드로 천천히 입력합니다 (몇 분 걸려요).');
  for (let bi = 0; bi < post.blocks.length; bi++) {
    const block = post.blocks[bi];
    const lines = block.type === 'image' ? [{ t: imageLabel(block) }] : block.lines;
    for (let li = 0; li < lines.length; li++) {
      await page.keyboard.insertText(lines[li].t);
      await sleep(Math.max(args.slow || 0, 120));
      if (li < lines.length - 1) { await page.keyboard.press('Enter'); await sleep(250); }
    }
    if (bi < post.blocks.length - 1) {
      await page.keyboard.press('Enter'); await sleep(250);
      await page.keyboard.press('Enter'); await sleep(250);
    }
  }
  return '키보드 입력 (느린 모드)';
}

const verifyBodyAll = (editor, want) => verifyBody(editor, want, { dupCheck: false });

/** 에디터 본문이 원고와 같은지 본다. 빠진 줄과 취소선 개수를 돌려준다. */
async function verifyBody(editor, expected, { dupCheck = true } = {}) {
  const got = await editor.evaluate(() => {
    const ps = [...(document.querySelector('.se-main-container') || document.querySelector('.se-content') || document.body).querySelectorAll('.se-text-paragraph')].filter((p) => !p.closest('.se-documentTitle'));
    return {
      lines: ps.map((p) => p.textContent.replace(/\u200b/g, '').trim()).filter(Boolean),
      strike: ps.reduce((n, p) => n + p.querySelectorAll('strike, s, [style*="line-through"]').length, 0),
    };
  });
  const pool = new Map();
  got.lines.forEach((l) => pool.set(l, (pool.get(l) || 0) + 1));
  const missing = [];
  for (const e of expected) {
    const k = pool.get(e) || 0;
    if (k > 0) pool.set(e, k - 1); else missing.push(e);
  }
  if (dupCheck && got.lines.length > expected.length + 5) missing.push(`(본문이 ${got.lines.length}줄로 원고 ${expected.length}줄보다 많음 — 두 번 들어간 것 같음)`);
  return { found: expected.length - missing.length, missing, strike: got.strike };
}

// ---------------------------------------------------------------- main
async function main() {
  const args = parseArgs(process.argv);
  if (args.help) { console.log(USAGE); return; }
  if (!args.post) throw new Error('--post 가 필요합니다. --help 참고.');
  if ([args.saveDraft, args.dryRun, args.publishNow].filter(Boolean).length > 1) {
    throw new Error('--save-draft / --dry-run / --publish-now 는 하나만 쓰세요.');
  }
  if (args.at && !args.dryRun && !args.publishNow) throw new Error('--at 은 --dry-run 또는 --publish-now 와 함께만 씁니다.');

  const post = JSON.parse(fs.readFileSync(args.post, 'utf8'));
  if (!post.title || !Array.isArray(post.blocks)) {
    throw new Error(`${args.post}: title 과 blocks 가 필요합니다. build-post.mjs 로 생성하세요.`);
  }
  const at = args.at ? parseAt(args.at) : null;
  if (at && at.date.getTime() < Date.now()) throw new Error(`예약 시각이 과거입니다: ${args.at}`);

  // 이미지 파일 미리 확인
  const imageBlocks = post.blocks.filter((b) => b.type === 'image');
  const imageFiles = new Map();
  if (args.images) {
    if (!fs.existsSync(args.images)) throw new Error(`이미지 폴더가 없습니다: ${args.images}\n먼저 post-images.mjs 로 만드세요.`);
    for (const b of imageBlocks) {
      const f = path.resolve(args.images, `${String(b.n).padStart(2, '0')}.png`);
      if (fs.existsSync(f)) imageFiles.set(b.n, f);
    }
  }

  if (args.dump) {
    dumpDir = path.join('dumps', new Date().toISOString().replace(/[:.]/g, '-'));
    fs.mkdirSync(dumpDir, { recursive: true });
  }

  const textBlocks = post.blocks.filter((b) => b.type !== 'image');
  const allLines = textBlocks.flatMap((b) => b.lines);
  const styled = allLines.filter((l) => l.s);
  const mode = args.saveDraft ? '임시저장 (발행 안 함)'
    : args.dryRun ? 'DRY-RUN (발행 패널까지, 발행 안 함)'
    : args.publishNow ? '⚠ 실제 발행'
    : '본문만 채우고 멈춤';

  console.log('═'.repeat(58));
  console.log(' 네이버 블로그 글 작성');
  console.log('═'.repeat(58));
  log(`글    : ${post.title}`);
  log(`본문  : ${textBlocks.length}덩어리 / ${allLines.length}줄 / ${allLines.map(l => l.t).join('').length}자`);
  log(`인용구: ${post.blocks.filter(b => b.type === 'quote').length}개 ${args.quote ? `(자동 — 인용구 ${args.quoteStyle})` : '(수동 — 목록 출력)'}`);
  log(`강조  : ${styled.length}줄 ${args.color ? '(입력 후 자동 적용)' : '(수동 — 목록 출력)'}`);
  log(`이미지: ${imageBlocks.length}자리 / 파일 ${args.images ? `${imageFiles.size}개 준비됨` : '넣지 않음 (표시 줄만)'}`);
  log(`모드  : ${mode}`);
  if (args.images && imageFiles.size < imageBlocks.length) {
    const miss = imageBlocks.filter((b) => !imageFiles.has(b.n)).map((b) => b.n);
    warn(`그림 파일이 없는 자리: ${miss.join(', ')} → 표시 줄로 남깁니다.`);
  }

  step('1. 실행 중인 크롬에 연결');
  let browser;
  try {
    browser = await chromium.connectOverCDP(args.cdp);
  } catch (e) {
    throw new Error(
      `${args.cdp} 에 연결하지 못했습니다.\n자동화용 크롬(9222)이 켜져 있는지 확인하세요.\n원인: ${e.message}`
    );
  }
  const context = browser.contexts()[0];
  if (!context) throw new Error('브라우저 컨텍스트가 없습니다. 크롬에 탭이 하나 이상 있어야 합니다.');
  log(`연결됨 — 열린 탭 ${context.pages().length}개`);

  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const manual = [];
  const report = { color: { ok: 0, fail: 0 }, image: { ok: 0, fail: 0 }, quote: { ok: 0, fail: 0 } };

  try {
    step('2. 글쓰기 페이지 열기');
    const writeUrl = args.url
      || (args.blogId ? `https://blog.naver.com/${args.blogId}/postwrite` : 'https://blog.naver.com/GoBlogWrite.naver');
    await page.goto(writeUrl, { waitUntil: 'domcontentloaded' });
    await sleep(args.url ? 500 : 3000);
    if (!args.url && /nid\.naver\.com|nidlogin/.test(page.url())) {
      throw new Error(`로그인 페이지로 이동했습니다. 9222 크롬 창에서 네이버에 로그인돼 있는지 확인하세요.\n현재 URL: ${page.url()}`);
    }
    log(`URL: ${page.url()}`);

    const editor = await resolveEditorFrame(page);
    await dump(page, 'write-page');

    step('3. 팝업 정리');
    // 주의: 'button:has-text("취소")' 처럼 넓게 잡으면 툴바의 "취소선" 버튼이 잡힌다
    // (2026-10-01 실제로 그렇게 눌려서 본문 전체에 취소선이 그어졌다). 팝업 안에서만 찾는다.
    try {
      const { loc } = await findFirst(editor, [
        '.se-popup-container .se-popup-button-cancel',
        '.se-popup-alert .se-popup-button-cancel',
        '[class*="se-popup"] button:text-is("취소")',
      ], { timeout: 3000 });
      await loc.click();
      log('작성 중이던 글 불러오기 팝업 → 취소 (새 글로 시작)');
      await sleep(600);
    } catch { log('불러오기 팝업 없음'); }
    try {
      await clickFirst(editor, TOOLBAR.helpClose, { timeout: 1500 });
      log('도움말 패널 닫음');
    } catch { /* 없음 */ }

    step('4. 제목 입력');
    await clickFirst(editor, [
      '.se-documentTitle .se-text-paragraph',
      '[class*="documentTitle"] [contenteditable="true"]',
      '.se-placeholder:has-text("제목")',
    ]);
    await sleep(300);
    await resetToggles(editor);
    await page.keyboard.insertText(post.title);
    log(post.title);

    step('5. 본문 넣기 (글자만, 붙여넣기 방식)');
    await clickFirst(editor, [
      '.se-component.se-text:not(.se-documentTitle) .se-text-paragraph',
      '.se-main-container .se-text-paragraph',
      '.se-placeholder:has-text("내용")',
    ]);
    await sleep(300);
    await resetToggles(editor);

    if (!args.quote) for (const b of post.blocks) if (b.type === 'quote') manual.push(`인용구 → "${b.lines[0].t}"`);
    const expected = expectedLines(post);
    const how = await pasteBody(page, editor, post, args);
    log(`방식: ${how}`);
    await sleep(800);
    await dump(page, 'body-text');

    const check = await verifyBody(editor, expected);
    log(`본문 확인: ${check.found}/${expected.length}줄 · 취소선 ${check.strike}곳`);
    if (check.missing.length || check.strike) {
      console.log('\n  빠지거나 달라진 줄:');
      check.missing.slice(0, 20).forEach((m) => console.log(`    - ${m}`));
      if (check.strike) console.log(`    - 취소선이 그어진 글자 ${check.strike}곳`);
      throw new Error('본문이 원고와 다르게 들어갔습니다. 저장하지 않고 멈춥니다 (탭은 열어둡니다. 저장하지 말고 닫아주세요).');
    }

    // ---- 색 입히기 (입력이 전부 끝난 뒤)
    const seen = new Map();
    const nthOf = (t) => { const k = seen.get(t) || 0; seen.set(t, k + 1); return k; };
    for (const line of allLines) {
      // 같은 글이 강조 없이 앞에 나올 수도 있으니 모든 줄을 순서대로 센다
      const nth = nthOf(line.t);
      if (!line.s) continue;
      const name = COLORS[line.s].name;
      if (!args.color) { manual.push(`${name} → "${line.t}"`); continue; }
      if (report.color.ok + report.color.fail === 0) step(`6. 강조 색 입히기 (${styled.length}줄)`);
      const r = await applyColor(page, editor, line.t, nth, line.s);
      if (r.ok) { report.color.ok++; log(`✓ ${name}: ${line.t}`); }
      else {
        report.color.fail++;
        warn(`${name} 실패 (${r.why}): ${line.t}`);
        manual.push(`${name} → "${line.t}"  [${r.why}]`);
        if (r.lost) throw new Error(`글자가 사라졌습니다: "${line.t}". 저장하지 않고 멈춥니다. 화면을 확인하세요.`);
      }
    }
    if (args.color) await dump(page, 'colors');

    // ---- 소제목 → 인용구
    if (args.quote) {
      const quotes = post.blocks.filter((b) => b.type === 'quote').map((b) => b.lines[0].t);
      if (quotes.length) step(`6-2. 소제목을 인용구로 (${quotes.length}개, 모양 ${args.quoteStyle})`);
      for (const q of quotes) {
        const r = await insertQuoteAt(page, editor, q, args.quoteStyle);
        if (r.ok) { report.quote.ok++; log(`✓ 인용구: ${q}${r.styled ? '' : ' (모양 확인 필요)'}`); }
        else {
          report.quote.fail++;
          warn(`인용구 실패 (${r.why}): ${q}`);
          manual.push(`인용구 → "${q}"  [${r.why}]`);
          if (report.quote.ok === 0 && report.quote.fail === 1) await dump(page, 'quote-fail');
        }
      }
      if (quotes.length) await dump(page, 'quotes');
    }

    // ---- 이미지 넣기
    for (const b of imageBlocks) {
      const label = imageLabel(b);
      const file = imageFiles.get(b.n);
      if (!file) { manual.push(`이미지 ${b.n} → "${label}" 자리에 직접 넣기`); continue; }
      if (report.image.ok + report.image.fail === 0) step(`7. 이미지 넣기 (${imageFiles.size}장)`);
      const r = await insertImageAt(page, editor, label, file);
      if (r.ok) {
        report.image.ok++; log(`✓ 이미지 ${b.n}: ${path.basename(file)}`);
        if (r.leftover) manual.push(`이미지 ${b.n} 위의 표시 줄 "${label}" 지우기`);
      }
      else {
        report.image.fail++;
        warn(`이미지 ${b.n} 실패 (${r.why})`);
        manual.push(`이미지 ${b.n} → "${label}" 자리에 ${path.basename(file)} 직접 넣기  [${r.why}]`);
      }
    }
    if (args.images) await dump(page, 'images');

    printManual(manual, report, args);

    // ---- 저장 전 마지막 확인: 원고 글이 다 있는지 (이미지 표시 줄은 그림으로 바뀌었으니 뺀다)
    {
      const inserted = new Set(imageBlocks.filter((b) => imageFiles.has(b.n)).map(imageLabel));
      const want = expectedLines(post).filter((l) => !inserted.has(l));
      const fin = await verifyBodyAll(editor, want);
      log(`최종 확인: ${fin.found}/${want.length}줄 · 취소선 ${fin.strike}곳`);
      if (fin.missing.length || fin.strike) {
        fin.missing.slice(0, 20).forEach((m) => console.log(`    - ${m}`));
        throw new Error('마지막 확인에서 원고와 다른 부분이 나왔습니다. 저장하지 않고 멈춥니다.');
      }
    }

    if (args.saveDraft) {
      step('8. 임시저장 (발행 버튼은 누르지 않습니다)');
      const { loc, sel } = await findAnywhere(page, editor, TOOLBAR.save, { timeout: 6000 });
      const label = (await loc.innerText().catch(() => '')).trim();
      if (/발행/.test(label)) throw new Error(`저장 버튼 대신 발행 버튼이 잡혔습니다 ("${label}"). 멈춥니다.`);
      await loc.click();
      log(`클릭: ${sel} ("${label || '저장'}")`);
      await sleep(2500);
      await dump(page, 'saved');
      console.log('\n✅ 임시저장 완료 — 발행하지 않았습니다.');
      log('네이버 글쓰기 화면 오른쪽 위 "저장" 옆 숫자를 누르면 임시저장 목록에서 볼 수 있어요.');
      log('카테고리·태그는 발행 단계에서 넣습니다:');
      if (post.category) log(`  카테고리: ${post.category}`);
      if (post.tags?.length) log(`  태그: ${post.tags.join(', ')}`);
      return;
    }

    if (!args.dryRun && !args.publishNow) {
      console.log('\n✅ 본문 입력까지 했습니다. 저장·발행은 하지 않았습니다 (탭은 열어둡니다).');
      return;
    }

    step('8. 발행 설정 열기');
    await clickFirst(page, ['button[class*="publish_btn"]', 'button:has-text("발행")'], { timeout: 6000 })
      .catch(() => clickFirst(editor, ['button[class*="publish_btn"]', 'button:has-text("발행")']));
    await sleep(1500);
    await dump(page, 'publish-layer');

    if (post.category) {
      step(`9. 카테고리: ${post.category}`);
      try {
        await findAnywhere(page, editor, ['button[class*="selectbox_button"]', 'button:has-text("카테고리")'], { timeout: 4000 }).then((r) => r.loc.click());
        await sleep(500);
        await findAnywhere(page, editor, [`label:has-text("${post.category}")`, `span:has-text("${post.category}")`], { timeout: 4000 }).then((r) => r.loc.click());
      } catch { warn('카테고리 자동 선택 실패 — 수동으로 지정하세요.'); }
    }

    if (post.tags?.length) {
      step('10. 태그 입력');
      try {
        const { loc } = await findAnywhere(page, editor,
          ['input#tag-input', '[class*="tag_input"] input', 'input[placeholder*="태그"]'], { timeout: 5000 });
        await loc.click();
        for (const t of post.tags) {
          await page.keyboard.insertText(t);
          await page.keyboard.press('Enter');
          await sleep(200);
        }
        log(`${post.tags.length}개 입력`);
      } catch { warn('태그 입력 실패 — 수동으로 넣으세요.'); }
    }

    if (at) {
      step(`11. 예약 설정: ${at.ymd} ${at.hh}:${at.mm}`);
      warn('예약 날짜/시각 자동 입력은 아직 검증 전입니다. 화면에서 꼭 확인하세요.');
      try {
        await findAnywhere(page, editor, ['label[for="radio_time2"]', 'label:has-text("예약")'], { timeout: 5000 }).then((r) => r.loc.click());
        await sleep(800);
        for (const [label, value, sels] of [
          ['시', at.hh, ['select[class*="hour_option"]', 'select[class*="hour"]']],
          ['분', String(Math.floor(+at.mm / 10) * 10).padStart(2, '0'), ['select[class*="minute_option"]', 'select[class*="minute"]']],
        ]) {
          try {
            const r = await findAnywhere(page, editor, sels, { timeout: 3000 });
            await r.loc.selectOption(value);
            log(`${label}: ${value}`);
          } catch { warn(`${label} 선택 실패 — 수동으로 ${value} 지정하세요.`); }
        }
        warn(`날짜(${at.ymd})는 달력에서 직접 고르세요.`);
      } catch { warn('예약 UI 자동 설정 실패 — 수동으로 지정하세요.'); }
      await dump(page, 'schedule');
    }

    if (!args.publishNow) {
      log('DRY-RUN — 발행 버튼을 누르지 않고 멈춥니다. 탭은 열어둡니다.');
      await dump(page, 'dry-run-final');
      console.log('\n✅ DRY-RUN 완료');
      return;
    }

    step('12. 최종 발행 (--publish-now)');
    await findAnywhere(page, editor, ['button[class*="confirm_btn"]'], { timeout: 5000 }).then((r) => r.loc.click());
    await sleep(3000);
    await dump(page, 'published');
    console.log(`\n✅ 완료 — ${at ? `${at.ymd} ${at.hh}:${at.mm} 예약됨` : '발행됨'}`);

  } catch (e) {
    console.error('\n❌ 실패:', e.message);
    await dump(page, 'error').catch(() => {});
    console.error(dumpDir
      ? `\n👉 ${dumpDir} 안의 파일을 보여주시면 선택자를 고치겠습니다.`
      : '\n👉 --dump 를 붙여 다시 실행하면 dumps/ 에 화면과 HTML이 남습니다.');
    process.exitCode = 1;
  } finally {
    // attach 한 브라우저는 사용자 것이다. 종료하지 않고 연결만 해제한다. 탭도 닫지 않는다.
    await browser.close().catch(() => {});
  }
}

function printManual(manual, report, args) {
  console.log('\n' + '─'.repeat(58));
  if (args.color) console.log(` 색 입히기   : 성공 ${report.color.ok} / 실패 ${report.color.fail}`);
  if (args.images) console.log(` 이미지 넣기 : 성공 ${report.image.ok} / 실패 ${report.image.fail}`);
  if (args.quote) console.log(` 인용구      : 성공 ${report.quote.ok} / 실패 ${report.quote.fail}`);
  if (args.color || args.images) console.log(` 선택 방식   : 마우스 ${stats.select['마우스']} / DOM ${stats.select.DOM}`);
  if (!manual.length) { console.log(' 손으로 할 것: 없음'); console.log('─'.repeat(58)); return; }
  console.log(` 손으로 할 것 (${manual.length}건)`);
  console.log('─'.repeat(58));
  manual.forEach((m, i) => console.log(`  ${String(i + 1).padStart(2)}. ${m}`));
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
