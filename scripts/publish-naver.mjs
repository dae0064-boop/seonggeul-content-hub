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
      case '--reserve':     out.reserve = true; break;
      case '--url':         out.url = next(); break;
      case '--dump':        out.dump = true; break;
      case '--no-tags':     out.tags = false; break;
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
  --save-draft       에디터 "저장"(임시저장)을 누르고 끝낸다. 태그가 있으면 발행 패널을 열어
                     태그만 넣고 닫은 뒤 저장한다 (발행 확인 버튼은 누르지 않는다)
  --no-tags          --save-draft 에서 태그를 넣지 않는다
  --dry-run          발행 패널까지 열어 카테고리·태그를 넣고, 발행 버튼은 누르지 않는다
  --at "Y-M-D H:M"   (--dry-run 과 함께) 예약 시각을 채워 둔다
  --publish-now      실제 발행 버튼까지 누른다. 사람이 그 자리에서 결정했을 때만 쓴다
  --reserve          예약발행. 먼저 임시저장한 뒤 발행 패널에서 '예약'을 고르고 시각을 넣고,
                     예약·날짜·시·분이 맞게 들어갔는지 다시 읽어 확인한 다음에만 발행을 누른다.
                     하나라도 확인되지 않으면 누르지 않고 임시저장으로 남긴다 (종료 코드 2).
                     시각은 --at 이나 원고의 publish_at. 오늘 날짜, 지금부터 20분 뒤 이후만 받는다
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

// 표시 줄은 짧게 "[이미지 N]" 만 쓴다. 길면 화면에서 두 줄로 접혀 키보드로 한 줄 선택이 안 된다.
const imageLabel = (block) => `[이미지 ${block.n}]`;

// ---------------------------------------------------------------- 툴바 / 서식
// 규칙 [11] 색상: 빨강 #ff0010 (글자색), 연한 노랑 #fff8b2 (배경색)
const COLORS = {
  red:    { hex: '#ff0010', rgb: [255, 0, 16],    prop: 'color',           name: '빨간글씨' },
  yellow: { hex: '#fff8b2', rgb: [255, 248, 178], prop: 'backgroundColor', name: '노란배경' },
  blue:   { hex: '#0078cb', rgb: [0, 120, 203],   prop: 'color',           name: '파란글씨' },
};
const swatchSelectors = (hex) => [
  `button.se-color-palette[title="${hex}"]`,
  `button.se-color-palette[data-color="${hex}"]`,
  `.se-color-palette[title="${hex}" i]`,
  `[class*="palette"] button[title="${hex}" i]`,
  `[data-value="${hex}" i]`,
];
// 툴바의 "발행" — 발행 패널을 여는 버튼. 실제 발행은 패널 안의 확인 버튼(confirm_btn)이 한다.
const PUBLISH_OPEN = ['button[class*="publish_btn"]', 'button:has-text("발행")'];
const PUBLISH_LAYER_CLOSE = [
  '[class*="layer_publish"] button[class*="close"]',
  '[class*="publish_layer"] button[class*="close"]',
  'button[class*="btn_close"]',
  'button[aria-label*="닫기"]',
  'button:has-text("닫기")',
];
const TAG_INPUT = ['input#tag-input', '[class*="tag_input"] input', 'input[placeholder*="태그"]'];

/**
 * 발행 패널의 태그 칸에 태그를 하나씩 넣는다.
 * Enter 를 누르기 전에 커서가 태그 칸에 있는지 매번 확인한다 — 다른 곳(발행 확인 버튼)에
 * 커서가 있으면 Enter 가 발행을 눌러 버린다.
 */
async function enterTags(page, editor, tags) {
  const { loc } = await findAnywhere(page, editor, TAG_INPUT, { timeout: 5000 });
  let n = 0;
  for (const t of tags) {
    await loc.click();
    const focused = await loc.evaluate((el) => el === el.ownerDocument.activeElement);
    if (!focused) throw new Error(`커서가 태그 칸에 없어 멈췄습니다 (${n}/${tags.length}개 입력)`);
    await page.keyboard.insertText(t.replace(/^#/, ''));
    await page.keyboard.press('Enter');
    await sleep(200);
    n++;
  }
  log(`태그 ${n}개 입력`);
}

/** 발행 패널을 닫는다. 닫기 버튼이 없으면 Esc. */
async function closePublishLayer(page, editor) {
  try {
    await findAnywhere(page, editor, PUBLISH_LAYER_CLOSE, { timeout: 2500 }).then((r) => r.loc.click());
    log('발행 패널 닫음');
  } catch {
    await page.keyboard.press('Escape');
    log('발행 패널 닫음 (Esc)');
  }
  await sleep(800);
}

const RESERVE_LEAD_MIN = 20;  // 지금부터 이 분 안쪽 시각은 예약하지 않는다
const RESERVE_RADIO = ['label[for="radio_time2"]', 'input#radio_time2 + label', 'label:has-text("예약")'];
const RESERVE_RADIO_INPUT = ['input#radio_time2', 'input[type="radio"][value="pre"]', 'input[type="radio"][id*="time2"]'];
const RESERVE_HOUR = ['select[class*="hour_option"]', 'select[class*="hour"]'];
const RESERVE_MIN = ['select[class*="minute_option"]', 'select[class*="minute"]'];
const RESERVE_DATE = ['input[class*="input_date"]', '[class*="date_area"] input', 'input[class*="date"]', 'button[class*="date"]', '[class*="date_area"]'];
const PUBLISH_CONFIRM = ['button[class*="confirm_btn"]'];

/**
 * 발행 패널에서 예약발행한다. 순서: 패널 열기 → 카테고리 → 태그 → '예약' → 시·분 → 다시 읽어 확인 → 발행.
 * 예약 라디오가 켜졌는지, 날짜가 오늘인지, 시·분이 맞는지 하나라도 확인되지 않으면 발행을 누르지 않는다.
 * (확인 없이 누르면 '현재' 발행이 돼 버린다 — 되돌릴 수 없다.)
 */
async function reservePublish(page, editor, post, at) {
  const fail = async (why) => { await dump(page, 'reserve-stop'); await closePublishLayer(page, editor); return { ok: false, why }; };
  step(`9. 예약발행 준비: ${at.ymd} ${at.hh}:${at.mm}`);
  try {
    await clickFirst(page, PUBLISH_OPEN, { timeout: 6000 }).catch(() => clickFirst(editor, PUBLISH_OPEN));
  } catch (e) { return { ok: false, why: `발행 패널을 열지 못함 — ${e.message.split('\n')[0]}` }; }
  await sleep(1500);
  await dump(page, 'publish-layer');

  if (post.category) await pickCategory(page, editor, post.category);
  if (post.tags?.length) {
    try { await enterTags(page, editor, post.tags); }
    catch (e) { warn(`태그 입력 실패 (${e.message}) — 예약 후 글 수정에서 넣어 주세요.`); }
  }

  // 예약 라디오
  try {
    await findAnywhere(page, editor, RESERVE_RADIO, { timeout: 5000 }).then((r) => r.loc.click());
  } catch { return fail("'예약' 버튼을 찾지 못함"); }
  await sleep(800);
  const radioOn = await findAnywhere(page, editor, RESERVE_RADIO_INPUT, { timeout: 2000 })
    .then((r) => r.loc.isChecked()).catch(() => false);
  if (!radioOn) return fail("'예약'이 선택됐는지 확인하지 못함");

  // 시·분
  const want = { 시: at.hh, 분: at.mm };
  for (const [label, sels] of [['시', RESERVE_HOUR], ['분', RESERVE_MIN]]) {
    try {
      const r = await findAnywhere(page, editor, sels, { timeout: 3000 });
      await r.loc.selectOption(want[label]).catch(() => r.loc.selectOption(String(+want[label])));
      await sleep(300);
      const got = await r.loc.inputValue();
      if (String(+got) !== String(+want[label])) return fail(`${label}이 ${want[label]} 대신 ${got} 로 들어감`);
      log(`${label}: ${got}`);
    } catch (e) { return fail(`${label} 칸을 찾지 못함 — ${e.message.split('\n')[0]}`); }
  }

  // 날짜: 기본값이 오늘이어야 한다. 화면 글자에서 연·월·일 숫자를 읽어 맞춰 본다
  const [y, mo, d] = at.ymd.split('-').map(Number);
  let dateText = '';
  try {
    const r = await findAnywhere(page, editor, RESERVE_DATE, { timeout: 3000 });
    dateText = (await r.loc.inputValue().catch(() => '')) || (await r.loc.innerText().catch(() => ''));
  } catch { /* 아래에서 실패 처리 */ }
  const nums = (dateText.match(/\d+/g) || []).map(Number);
  const seq = `,${nums.join(',')},`;
  const dateOk = seq.includes(`,${y},${mo},${d},`) || seq.includes(`,${y % 100},${mo},${d},`);
  if (!dateOk) return fail(`예약 날짜를 확인하지 못함 (화면: "${dateText.trim().slice(0, 30)}")`);
  log(`날짜: ${dateText.trim()}`);
  await dump(page, 'reserve-ready');

  step('10. 예약발행 (예약·날짜·시·분 확인됨)');
  try {
    await findAnywhere(page, editor, PUBLISH_CONFIRM, { timeout: 5000 }).then((r) => r.loc.click());
  } catch { return fail('발행 확인 버튼을 찾지 못함'); }
  await sleep(3500);
  await dump(page, 'reserved');
  // 에디터를 벗어났으면(글 목록·글 보기로 이동) 예약이 들어간 것으로 본다
  const left = !/PostWriteForm|postwrite|Redirect=Write/i.test(page.url());
  if (!left) warn(`발행을 눌렀지만 화면이 그대로예요 (${page.url().slice(0, 80)}). 예약 목록에서 꼭 확인하세요.`);
  return { ok: true, confirmed: left };
}

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

/**
 * 발행 패널에서 카테고리를 고른다. 이름이 정확히 같은 항목만 누른다 —
 * '일상'을 찾다 본문의 "…성글벙글의 일상 포스팅" 글자를 눌러 패널이 닫힌 적이 있다 (2026-10-02).
 * 고른 뒤 패널이 닫혔으면 다시 연다. 실패해도 멈추지 않는다 (기본 카테고리로 간다).
 */
async function pickCategory(page, editor, category) {
  const exact = [
    `[class*="option"] label:text-is("${category}")`,
    `[class*="category"] label:text-is("${category}")`,
    `[class*="option"] span:text-is("${category}")`,
    `[class*="category"] span:text-is("${category}")`,
  ];
  try {
    await findFirst(page, ['button[class*="selectbox_button"]', 'button:has-text("카테고리")'], { timeout: 4000 }).then((r) => r.loc.click());
    await sleep(500);
    await findFirst(page, exact, { timeout: 4000 }).then((r) => r.loc.click());
    log(`카테고리: ${category}`);
  } catch {
    warn(`카테고리 자동 선택 실패 — 기본 카테고리로 갑니다 (${category})`);
    await page.keyboard.press('Escape').catch(() => {});
  }
  await sleep(400);
  const open = await findAnywhere(page, editor, RESERVE_RADIO, { timeout: 1500 }).then(() => true).catch(() => false);
  if (!open) {
    warn('발행 패널이 닫혀 다시 엽니다');
    await clickFirst(page, PUBLISH_OPEN, { timeout: 4000 }).catch(() => clickFirst(editor, PUBLISH_OPEN).catch(() => {}));
    await sleep(1200);
  }
}

/** 인용구 바로 아래 빈 문단의 화면 위치. 없으면 null */
function blankAfterQuote(i) {
  const q = [...document.querySelectorAll('.se-component.se-quotation')][i];
  const next = q && q.nextElementSibling;
  if (!next || !next.classList.contains('se-text')) return null;
  const ps = [...next.querySelectorAll('.se-text-paragraph')];
  if (!ps.length || ps[0].textContent.replace(/\u200b/g, '').trim()) return null;
  // 빈 문단 뒤에 같은 덩어리 안 글 줄이 있어야 Delete 로 당겨 붙일 수 있다
  if (ps.length < 2) return null;
  ps[0].scrollIntoView({ block: 'center' });
  const r = ps[0].getBoundingClientRect();
  return { x: r.left + 4, y: r.top + r.height / 2 };
}

/** 인용구마다 바로 아래 빈 문단을 지운다. 빈 문단에 커서를 두고 Delete — 다음 줄이 올라붙는다. */
async function removeBlankAfterQuotes(page, editor) {
  const n = await editor.evaluate(() => document.querySelectorAll('.se-component.se-quotation').length).catch(() => 0);
  let removed = 0, left = 0;
  for (let i = 0; i < n; i++) {
    let at = await editor.evaluate(blankAfterQuote, i).catch(() => null);
    if (!at) continue;
    await sleep(200);
    at = await editor.evaluate(blankAfterQuote, i).catch(() => null); // 스크롤 뒤 다시 잰다
    if (!at) continue;
    const before = await snapshot(editor);
    const off = await frameOffset(page, editor);
    await page.mouse.click(off.x + at.x, off.y + at.y);
    await sleep(200);
    await page.keyboard.press('Delete');
    await sleep(350);
    const lost = lostLines(before, await snapshot(editor));
    const still = await editor.evaluate(blankAfterQuote, i).catch(() => null);
    if (lost.length) {
      const back = await undoUntilRestored(page, editor, before);
      if (!back) throw new Error(`인용구 아래 빈 줄을 지우다 글이 사라졌고 되돌리지 못했습니다: ${lost.slice(0, 3).join(' / ')}. 저장하지 않고 멈춥니다.`);
      left++;
    } else if (still) left++;
    else removed++;
  }
  return { removed, left };
}

/** "[이미지 N] 설명" 표시 줄을 지우고 그 자리에 그림 파일을 넣는다. */
// ---------------------------------------------------------------- 본문 지킴이
const PLACEHOLDERS = new Set(['사진 설명을 입력하세요.', '출처 입력', '내용을 입력하세요.']);
/** 본문(인용구 포함)의 글 줄 목록 */
const snapshot = (editor) => editor.evaluate(() => {
  const root = document.querySelector('.se-main-container') || document.querySelector('.se-content') || document.body;
  return [...root.querySelectorAll('.se-text-paragraph')].filter((p) => !p.closest('.se-documentTitle'))
    .map((p) => p.textContent.replace(/​/g, '').trim()).filter(Boolean);
});
/** before 에서 removed 만 빠졌는지. 다른 줄이 사라졌으면 그 줄들을 돌려준다 */
function lostLines(before, after, removed = []) {
  const pool = new Map();
  after.filter((t) => !PLACEHOLDERS.has(t)).forEach((t) => pool.set(t, (pool.get(t) || 0) + 1));
  const skip = new Map(); removed.forEach((t) => skip.set(t, (skip.get(t) || 0) + 1));
  const lost = [];
  for (const t of before) {
    if (PLACEHOLDERS.has(t)) continue;
    if ((skip.get(t) || 0) > 0) { skip.set(t, skip.get(t) - 1); continue; }
    const k = pool.get(t) || 0;
    if (k > 0) pool.set(t, k - 1); else lost.push(t);
  }
  return lost;
}
/** 다른 줄이 사라졌으면 Ctrl+Z 로 되돌려 본다 (최대 4번). 되돌렸으면 true */
async function undoUntilRestored(page, editor, before) {
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Control+z');
    await sleep(500);
    if (!lostLines(before, await snapshot(editor)).length) return true;
  }
  return false;
}

/** 에디터 커서를 text 줄의 끝에 둔다. 진짜 마우스 클릭이라 에디터가 커서 위치를 정확히 안다. */
async function caretAtEnd(page, editor, text) {
  const loc = await locateText(editor, text, 0);
  if (!loc.found || !loc.rects?.length) return false;
  await sleep(200);
  const again = await locateText(editor, text, 0);
  const off = await frameOffset(page, editor);
  const last = again.rects[again.rects.length - 1];
  await page.mouse.click(off.x + last.right - 1, off.y + (last.top + last.bottom) / 2);
  await sleep(250);
  await page.keyboard.press('End');
  await sleep(150);
  return true;
}

/**
 * "[이미지 N]" 표시 줄을 지우고 그 자리에 그림 파일을 넣는다.
 * 2026-10-01: 화면 밖에서 만든 선택(DOM 선택)으로 지우니 에디터가 다른 범위를 지워 20줄이 사라졌다.
 * 이제 마우스로 줄 끝을 누르고 Shift+Home → Backspace 로, 에디터가 직접 아는 선택만 쓴다.
 * 매 단계 다른 줄이 사라지지 않았는지 보고, 사라졌으면 되돌린 뒤 실패로 멈춘다.
 */
async function insertImageAt(page, editor, label, file) {
  const count = () => editor.locator('.se-component.se-image, .se-module-image').count();
  const before = await count();
  const snap0 = await snapshot(editor);

  if (!(await caretAtEnd(page, editor, label))) return { ok: false, why: '표시 줄을 찾지 못함' };
  await page.keyboard.press('Shift+Home');
  await sleep(200);
  await page.keyboard.press('Backspace');
  await sleep(400);
  let snap1 = await snapshot(editor);
  let lost = lostLines(snap0, snap1, [label]);
  if (lost.length) {
    const back = await undoUntilRestored(page, editor, snap0);
    return { ok: false, why: `표시 줄을 지우다 다른 글 ${lost.length}줄이 같이 지워져 ${back ? '되돌림' : '되돌리지 못함'}`, lost: back ? null : lost };
  }
  if (snap1.includes(label)) return { ok: false, why: '표시 줄이 지워지지 않음 (그대로 둠)' };

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
      await sleep(1000);
      lost = lostLines(snap1, await snapshot(editor));
      if (lost.length) {
        const back = await undoUntilRestored(page, editor, snap1);
        return { ok: false, why: `그림을 넣으며 다른 글 ${lost.length}줄이 사라져 ${back ? '되돌림' : '되돌리지 못함'}`, lost: back ? null : lost };
      }
      return { ok: true };
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

/** 색 하나를 입힌 글 조각 (붙여넣기용 HTML) */
function styledSpan(text, style) {
  const t = escHtml(text);
  if (!style) return t;
  const c = COLORS[style];
  // 강조는 세 색 모두 굵게 (사용자 지시 2026-10-01)
  return `<b><span style="${c.prop === 'color' ? 'color' : 'background-color'}:${c.hex}">${t}</span></b>`;
}

/** 줄 일부만 칠한 경우: nth 번째 그 줄에서 각 조각이 제 색을 입었는지 본다 */
function segCheckInPage({ text, nth, segs, colors }) {
  const root = document.querySelector('.se-main-container') || document.querySelector('.se-content') || document.body;
  const ps = [...root.querySelectorAll('.se-text-paragraph')].filter((p) => !p.closest('.se-documentTitle'))
    .filter((p) => p.textContent.replace(/\u200b/g, '').trim() === text);
  const p = ps[nth];
  if (!p) return { present: false, bad: [] };
  const nodes = []; let full = '';
  const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT); let n;
  while ((n = w.nextNode())) { const v = n.nodeValue.replace(/\u200b/g, ''); nodes.push({ n, start: full.length, len: v.length }); full += v; }
  const lead = full.length - full.trimStart().length;
  const bad = [];
  let pos = lead;
  for (const g of segs) {
    const start = pos, end = pos + g.t.length; pos = end;
    if (!g.s) continue;
    const c = colors[g.s];
    const want = `rgb(${c.rgb.join(', ')})`;
    const cover = nodes.filter((x) => x.start < end && x.start + x.len > start && x.n.nodeValue.trim());
    const ok = cover.length && cover.every((x) => {
      for (let e = x.n.parentElement; e && e !== p.parentElement; e = e.parentElement) if (getComputedStyle(e)[c.prop] === want) return true;
      return false;
    });
    if (!ok) bad.push(g.t);
  }
  return { present: true, bad };
}

const escHtml = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** 원고 → 붙여넣을 HTML. 줄마다 문단 하나, 덩어리 사이엔 빈 문단. 색은 미리 입혀 둔다. */
function bodyHtml(post) {
  const parts = [];
  post.blocks.forEach((b, i) => {
    // 이미지 위아래에는 빈 줄을 두지 않는다 (사용자 지시 2026-10-01: 글과 그림이 붙어 이어지게)
    // 소제목 아래 빈 문단은 붙여 넣을 때는 둔다. 빼고 넣었더니 인용구로 바꿀 때 다음 줄이 같이 지워졌다
    // (2026-10-02 실행: 인용구 10개 중 9개 실패). 인용구를 다 만든 뒤 removeBlankAfterQuotes 가 지운다.
    if (i && b.type !== 'image' && post.blocks[i - 1].type !== 'image') parts.push('<p><br></p>');
    if (b.type === 'image') { parts.push(`<p>${escHtml(imageLabel(b))}</p>`); return; }
    for (const l of b.lines) {
      const segs = l.segs || [{ t: l.t, s: l.s }];
      parts.push(`<p>${segs.map((g) => styledSpan(g.t, g.s)).join('')}</p>`);
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
  if ([args.saveDraft, args.dryRun, args.publishNow, args.reserve].filter(Boolean).length > 1) {
    throw new Error('--save-draft / --dry-run / --publish-now / --reserve 는 하나만 쓰세요.');
  }
  if (args.at && !args.dryRun && !args.publishNow && !args.reserve) throw new Error('--at 은 --dry-run, --publish-now, --reserve 와 함께만 씁니다.');

  const post = JSON.parse(fs.readFileSync(args.post, 'utf8'));
  if (!post.title || !Array.isArray(post.blocks)) {
    throw new Error(`${args.post}: title 과 blocks 가 필요합니다. build-post.mjs 로 생성하세요.`);
  }
  if (args.reserve && !args.at) args.at = post.publishAt;
  if (args.reserve && !args.at) throw new Error('--reserve 에는 예약 시각이 필요합니다 (--at 또는 원고의 publish_at).');
  const at = args.at ? parseAt(args.at) : null;
  if (args.reserve) {
    // 자동 예약은 같은 날짜, 20분 뒤 이후, 10분 단위만 한다 — 네이버 예약 날짜 기본값이 오늘이라 달력을 건드리지 않는다.
    // 조건이 안 맞으면 멈추지 않고 임시저장으로 바꿔 글은 남긴다 (PC 가 늦게 켜진 날 등).
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const why = at.ymd !== today ? `예약 날짜(${at.ymd})가 오늘(${today})이 아님`
      : at.date.getTime() - Date.now() < RESERVE_LEAD_MIN * 60000 ? `예약 시각(${args.at})까지 ${RESERVE_LEAD_MIN}분이 안 남음`
      : +at.mm % 10 ? `네이버 예약은 10분 단위 (${args.at})` : '';
    if (why) {
      warn(`${why} — 예약하지 않고 임시저장만 합니다.`);
      args.reserve = false; args.saveDraft = true; args.reserveSkipped = why;
    }
  } else if (at && at.date.getTime() < Date.now()) throw new Error(`예약 시각이 과거입니다: ${args.at}`);

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
  const styled = allLines.filter((l) => l.s || l.segs);
  const mode = args.reserve ? `예약발행 (${at.ymd} ${at.hh}:${at.mm}, 확인 후에만)`
    : args.saveDraft ? '임시저장 (발행 안 함)'
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
      if (line.segs) {
        // 낱말 단위 색은 붙여넣기로 들어간다. 여기서는 확인만 하고, 빠졌으면 손으로 칠할 목록에 넣는다
        const r = await editor.evaluate(segCheckInPage, { text: line.t, nth, segs: line.segs, colors: COLORS });
        for (const g of line.segs.filter((x) => x.s)) {
          if (r.present && !r.bad.includes(g.t)) report.color.ok++;
          else { report.color.fail++; manual.push(`${COLORS[g.s].name} → "${g.t}" (줄: ${line.t})`); }
        }
        continue;
      }
      if (!line.s) continue;
      const name = COLORS[line.s].name;
      if (!args.color) { manual.push(`${name} → "${line.t}"`); continue; }
      if (report.color.ok + report.color.fail === 0) step(`6. 강조 색 확인·입히기 (${styled.length}줄)`);
      const snapC = await snapshot(editor);
      const r = await applyColor(page, editor, line.t, nth, line.s);
      const lostC = lostLines(snapC, await snapshot(editor));
      if (lostC.length) {
        const back = await undoUntilRestored(page, editor, snapC);
        if (!back) throw new Error(`색을 입히다 글이 사라졌고 되돌리지 못했습니다: ${lostC.slice(0, 3).join(' / ')}. 저장하지 않고 멈춥니다.`);
        r.ok = false; r.why = `다른 글 ${lostC.length}줄이 같이 바뀌어 되돌림`;
      }
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
        const snapQ = await snapshot(editor);
        const r = await insertQuoteAt(page, editor, q, args.quoteStyle);
        const lostQ = lostLines(snapQ, await snapshot(editor));
        if (lostQ.length) {
          const back = await undoUntilRestored(page, editor, snapQ);
          if (!back) throw new Error(`인용구를 넣다 글이 사라졌고 되돌리지 못했습니다: ${lostQ.slice(0, 3).join(' / ')}. 저장하지 않고 멈춥니다.`);
          r.ok = false; r.why = `다른 글 ${lostQ.length}줄이 같이 지워져 되돌림`;
        }
        if (r.ok) { report.quote.ok++; log(`✓ 인용구: ${q}${r.styled ? '' : ' (모양 확인 필요)'}`); }
        else {
          report.quote.fail++;
          warn(`인용구 실패 (${r.why}): ${q}`);
          manual.push(`인용구 → "${q}"  [${r.why}]`);
          if (report.quote.ok === 0 && report.quote.fail === 1) await dump(page, 'quote-fail');
        }
      }
      if (quotes.length) await dump(page, 'quotes');
      if (report.quote.ok) {
        // 인용구 바로 아래 빈 줄을 지운다 (사용자 지시 2026-10-01). 글이 하나라도 사라지면 되돌린다.
        const r = await removeBlankAfterQuotes(page, editor);
        log(`인용구 아래 빈 줄: ${r.removed}곳 지움${r.left ? ` · ${r.left}곳 남음 (그대로 둠)` : ''}`);
      }
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
        if (r.lost) throw new Error(`이미지를 넣다가 글이 사라졌고 되돌리지 못했습니다: ${r.lost.slice(0, 3).join(' / ')}. 저장하지 않고 멈춥니다.`);
        manual.push(`이미지 ${b.n} → "${label}" 자리에 ${path.basename(file)} 직접 넣기  [${r.why}]`);
      }
    }
    if (args.images) await dump(page, 'images');


    // ---- 강조 글씨가 굵게 들어갔는지 (빨강·파랑·노랑 배경 모두)
    {
      const notBold = await editor.evaluate((colors) => {
        const root = document.querySelector('.se-main-container') || document.querySelector('.se-content') || document.body;
        const wants = Object.values(colors).map((c) => [c.prop, `rgb(${c.rgb.join(', ')})`]);
        const out = [];
        for (const el of root.querySelectorAll('span')) {
          if (el.closest('.se-documentTitle') || !el.textContent.trim()) continue;
          const cs = getComputedStyle(el);
          if (!wants.some(([prop, v]) => cs[prop] === v)) continue;
          if (el.querySelector('span')) continue; // 가장 안쪽 글자만 본다
          if (!(parseInt(cs.fontWeight, 10) >= 600)) out.push(el.textContent.trim());
        }
        return [...new Set(out)];
      }, COLORS);
      log(`굵게 확인: 굵게 안 된 강조 ${notBold.length}곳`);
      notBold.forEach((t) => manual.push(`굵게 → "${t}"`));
    }

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

    if (args.saveDraft && !args.reserve && args.tags !== false && post.tags?.length) {
      // 태그 칸은 발행 패널 안에만 있다. 패널을 열어 태그만 넣고 닫는다. 발행 확인 버튼은 누르지 않는다.
      step(`7-1. 태그 ${post.tags.length}개 (발행 패널을 열어 태그만 넣고 닫습니다)`);
      try {
        await clickFirst(page, PUBLISH_OPEN, { timeout: 6000 })
          .catch(() => clickFirst(editor, PUBLISH_OPEN));
        await sleep(1500);
        await dump(page, 'tag-layer');
        await enterTags(page, editor, post.tags);
        await dump(page, 'tag-filled');
      } catch (e) {
        warn(`태그 입력 실패 — 저장 후 수동으로 넣으세요. (${e.message})`);
      }
      await closePublishLayer(page, editor);
    }

    if (args.saveDraft || args.reserve) {
      step(args.reserve ? '8. 임시저장 (예약 전에 먼저 저장해 둡니다)' : '8. 임시저장 (발행 버튼은 누르지 않습니다)');
      const { loc, sel } = await findAnywhere(page, editor, TOOLBAR.save, { timeout: 6000 });
      const label = (await loc.innerText().catch(() => '')).trim();
      if (/발행/.test(label)) throw new Error(`저장 버튼 대신 발행 버튼이 잡혔습니다 ("${label}"). 멈춥니다.`);
      await loc.click();
      log(`클릭: ${sel} ("${label || '저장'}")`);
      await sleep(2500);
      await dump(page, 'saved');
      if (args.reserve) {
        const r = await reservePublish(page, editor, post, at);
        if (r.ok) { console.log(`\n✅ 예약발행 완료 — ${at.ymd} ${at.hh}:${at.mm}`); return; }
        console.log(`\n⚠ 예약하지 않았습니다 (${r.why}). 글은 임시저장에 남아 있어요.`);
        process.exitCode = 2;
        return;
      }
      console.log('\n✅ 임시저장 완료 — 발행하지 않았습니다.');
      if (args.reserveSkipped) { console.log(`   (예약하지 않은 이유: ${args.reserveSkipped})`); process.exitCode = 2; }
      log('네이버 글쓰기 화면 오른쪽 위 "저장" 옆 숫자를 누르면 임시저장 목록에서 볼 수 있어요.');
      if (post.category) log(`카테고리는 발행할 때 고르세요: ${post.category}`);
      if (post.tags?.length) log(`태그: ${post.tags.join(', ')}`);
      log('임시저장 글을 다시 열었을 때 태그가 없으면 발행 패널에서 위 태그를 넣어 주세요.');
      return;
    }

    if (!args.dryRun && !args.publishNow) {
      console.log('\n✅ 본문 입력까지 했습니다. 저장·발행은 하지 않았습니다 (탭은 열어둡니다).');
      return;
    }

    step('8. 발행 설정 열기');
    await clickFirst(page, PUBLISH_OPEN, { timeout: 6000 })
      .catch(() => clickFirst(editor, PUBLISH_OPEN));
    await sleep(1500);
    await dump(page, 'publish-layer');

    if (post.category) {
      step(`9. 카테고리: ${post.category}`);
      await pickCategory(page, editor, post.category);
    }

    if (post.tags?.length) {
      step('10. 태그 입력');
      try { await enterTags(page, editor, post.tags); }
      catch (e) { warn(`태그 입력 실패 — 수동으로 넣으세요. (${e.message})`); }
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
