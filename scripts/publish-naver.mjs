#!/usr/bin/env node
/**
 * 네이버 블로그 글 작성 + 예약발행 자동화
 *
 * 이미 로그인된 크롬에 CDP로 attach 하므로 재로그인/캡차가 없다.
 *
 *   node scripts/publish-naver.mjs --post <파일.json> --blog-id <아이디> [--at "Y-M-D H:M"]
 *
 * 서식(인용구/글자색/배경색)은 에디터 툴바를 조작해야 해서 선택자가 쉽게 깨진다.
 * 기본값은 "본문만 입력 + 서식 체크리스트 출력"이고, --format 을 주면 자동 서식을 시도한다.
 * 서식 적용에 실패해도 본문은 그대로 남고, 어느 줄을 수동으로 칠해야 하는지 알려준다.
 */

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------- args
function parseArgs(argv) {
  const out = { cdp: 'http://localhost:9222', slow: 60, linebreak: 'soft' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--post':      out.post = next(); break;
      case '--blog-id':   out.blogId = next(); break;
      case '--at':        out.at = next(); break;
      case '--cdp':       out.cdp = next(); break;
      case '--slow':      out.slow = Number(next()); break;
      case '--linebreak': out.linebreak = next(); break;
      case '--format':    out.format = true; break;
      case '--dry-run':   out.dryRun = true; break;
      case '--url':       out.url = next(); break;
      case '--dump':      out.dump = true; break;
      case '--help':      out.help = true; break;
      default:
        if (a.startsWith('--')) throw new Error(`알 수 없는 옵션: ${a}`);
    }
  }
  return out;
}

const USAGE = `
네이버 블로그 예약발행 자동화

  node scripts/publish-naver.mjs \\
    --post content/posts/2026-09-11-yeoreum-ibul.json \\
    --blog-id 내블로그아이디 \\
    --dry-run --dump

옵션
  --post <파일>      발행할 글 JSON (필수). build-post.mjs 로 .md 에서 생성한다.
  --blog-id <id>     네이버 블로그 아이디 (필수)
  --at "Y-M-D H:M"   예약 발행 시각. 생략하면 예약 설정을 건드리지 않는다.
  --format           인용구/글자색/배경색 자동 적용 시도 (기본: 끔)
  --linebreak soft   덩어리 안에서 Shift+Enter (기본) | hard = 그냥 Enter
  --dry-run          최종 발행 직전에 멈춤
  --dump             단계별 스크린샷/HTML 을 dumps/ 에 저장
  --cdp <url>        CDP 주소 (기본 http://localhost:9222)
  --url <url>        글쓰기 URL 재정의 (로컬 목업 테스트용)
  --slow <ms>        동작 간 지연 (기본 60)
`;

// ---------------------------------------------------------------- utils
const log  = (...m) => console.log('  ', ...m);
const step = (...m) => console.log('\n▶', ...m);
const warn = (...m) => console.log('  ⚠', ...m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let dumpDir = null, dumpSeq = 0;
async function dump(page, label) {
  if (!dumpDir) return;
  const base = path.join(dumpDir, `${String(++dumpSeq).padStart(2, '0')}-${label}`);
  try {
    await page.screenshot({ path: `${base}.png`, fullPage: true });
    fs.writeFileSync(`${base}.html`, await page.content());
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

async function resolveEditorFrame(page, timeout = 30000) {
  const probes = ['.se-content', '.se-main-container', '[class*="se-documentTitle"]'];
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      for (const p of probes) {
        try {
          if (await frame.locator(p).first().isVisible({ timeout: 200 })) {
            log(`에디터 프레임 감지 (${p})`);
            return frame;
          }
        } catch { /* 프레임 전환 중 */ }
      }
    }
    await sleep(400);
  }
  throw new Error('에디터 프레임을 찾지 못했습니다. --dump 로 화면을 확인하세요.');
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

// ---------------------------------------------------------------- 서식
const TOOLBAR = {
  quote: ['button[data-name="quotation"]', '[class*="quotation"]', 'button[title*="인용구"]'],
  red: {
    button: ['button[data-name="font-color"]', '[class*="color_text"]', 'button[title*="글자색"]'],
    swatch: ['[data-value="#ff0000"]', 'button[title*="빨강"]', '[class*="palette"] [style*="rgb(255, 0, 0)"]'],
  },
  yellow: {
    button: ['button[data-name="background-color"]', '[class*="color_background"]', 'button[title*="배경색"]'],
    swatch: ['[data-value="#ffe400"]', 'button[title*="노랑"]', '[class*="palette"] [style*="rgb(255, 228, 0)"]'],
  },
};

/** 방금 입력한 줄을 선택해 색을 입힌다. 실패해도 예외를 던지지 않는다. */
async function applyStyle(page, editor, style, manual, text) {
  const spec = TOOLBAR[style];
  try {
    await page.keyboard.down('Shift');
    await page.keyboard.press('Home');
    await page.keyboard.up('Shift');
    await sleep(150);
    await clickFirst(editor, spec.button, { timeout: 2500 });
    await sleep(400);
    await clickFirst(editor, spec.swatch, { timeout: 2500 });
    await sleep(250);
    await page.keyboard.press('End');
    return true;
  } catch {
    await page.keyboard.press('End').catch(() => {});
    manual.push(`${style === 'red' ? '빨간글씨' : '노란배경'} → "${text}"`);
    return false;
  }
}

// ---------------------------------------------------------------- main
async function main() {
  const args = parseArgs(process.argv);
  if (args.help) { console.log(USAGE); return; }
  if (!args.post)   throw new Error('--post 가 필요합니다. --help 참고.');
  if (!args.blogId) throw new Error('--blog-id 가 필요합니다. --help 참고.');

  const post = JSON.parse(fs.readFileSync(args.post, 'utf8'));
  if (!post.title || !Array.isArray(post.blocks)) {
    throw new Error(`${args.post}: title 과 blocks 가 필요합니다. build-post.mjs 로 생성하세요.`);
  }
  const at = args.at ? parseAt(args.at) : null;
  if (at && at.date.getTime() < Date.now()) throw new Error(`예약 시각이 과거입니다: ${args.at}`);

  if (args.dump) {
    dumpDir = path.join('dumps', new Date().toISOString().replace(/[:.]/g, '-'));
    fs.mkdirSync(dumpDir, { recursive: true });
  }

  const allLines = post.blocks.flatMap((b) => b.lines);
  const styled = allLines.filter((l) => l.s);

  console.log('═'.repeat(58));
  console.log(' 네이버 블로그 발행');
  console.log('═'.repeat(58));
  log(`글    : ${post.title}`);
  log(`본문  : ${post.blocks.length}덩어리 / ${allLines.length}줄 / ${allLines.map(l => l.t).join('').length}자`);
  log(`인용구: ${post.blocks.filter(b => b.type === 'quote').length}개`);
  log(`강조  : ${styled.length}줄 ${args.format ? '(자동 적용 시도)' : '(수동 — 체크리스트 출력)'}`);
  log(`예약  : ${at ? `${at.ymd} ${at.hh}:${at.mm}` : '설정 안 함'}`);
  log(`모드  : ${args.dryRun ? 'DRY-RUN (최종 발행 안 함)' : '실제 발행'}`);

  step('1. 실행 중인 크롬에 연결');
  let browser;
  try {
    browser = await chromium.connectOverCDP(args.cdp);
  } catch (e) {
    throw new Error(
      `${args.cdp} 에 연결하지 못했습니다.\n크롬을 디버깅 포트로 띄웠는지 확인하세요 (README 1단계).\n원인: ${e.message}`
    );
  }
  const context = browser.contexts()[0];
  if (!context) throw new Error('브라우저 컨텍스트가 없습니다. 크롬에 탭이 하나 이상 있어야 합니다.');
  log(`연결됨 — 열린 탭 ${context.pages().length}개`);

  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const manual = [];

  try {
    step('2. 글쓰기 페이지 열기');
    const writeUrl = args.url || `https://blog.naver.com/${args.blogId}/postwrite`;
    await page.goto(writeUrl, { waitUntil: 'domcontentloaded' });
    await sleep(args.url ? 500 : 2500);
    if (!args.url && /nid\.naver\.com|login/.test(page.url())) {
      throw new Error(`로그인 페이지로 이동했습니다. attach 한 크롬이 로그인된 프로필인지 확인하세요.\n현재 URL: ${page.url()}`);
    }
    log(`URL: ${page.url()}`);
    await dump(page, 'write-page');

    const editor = await resolveEditorFrame(page);

    step('3. 이전 작성글 팝업 확인');
    try {
      const { loc } = await findFirst(editor,
        ['button:has-text("취소")', '.se-popup-button-cancel', '[class*="popup"] button:has-text("취소")'],
        { timeout: 3000 });
      await loc.click();
      log('불러오기 팝업 → 취소');
      await sleep(600);
    } catch { log('팝업 없음 (정상)'); }

    step('4. 제목 입력');
    await clickFirst(editor, [
      '.se-documentTitle .se-text-paragraph',
      '[class*="documentTitle"] [contenteditable="true"]',
      '.se-placeholder:has-text("제목")',
    ]);
    await sleep(300);
    await page.keyboard.insertText(post.title);
    log(post.title);
    await dump(page, 'title');

    step('5. 본문 입력');
    await clickFirst(editor, [
      '.se-component.se-text:not(.se-documentTitle) .se-text-paragraph',
      '.se-main-container .se-text-paragraph',
      '.se-placeholder:has-text("내용")',
    ]);
    await sleep(300);

    let done = 0;
    for (let bi = 0; bi < post.blocks.length; bi++) {
      const block = post.blocks[bi];

      if (block.type === 'quote') {
        const text = block.lines[0].t;
        if (args.format) {
          try {
            await clickFirst(editor, TOOLBAR.quote, { timeout: 2500 });
            await sleep(400);
          } catch { manual.push(`인용구 → "${text}"`); }
        } else {
          manual.push(`인용구 → "${text}"`);
        }
        await page.keyboard.insertText(text);
        done++;
      } else {
        for (let li = 0; li < block.lines.length; li++) {
          const line = block.lines[li];
          await page.keyboard.insertText(line.t);
          if (line.s) {
            if (args.format) await applyStyle(page, editor, line.s, manual, line.t);
            else manual.push(`${line.s === 'red' ? '빨간글씨' : '노란배경'} → "${line.t}"`);
          }
          done++;
          if (li < block.lines.length - 1) {
            if (args.linebreak === 'soft') {
              await page.keyboard.down('Shift');
              await page.keyboard.press('Enter');
              await page.keyboard.up('Shift');
            } else {
              await page.keyboard.press('Enter');
            }
          }
          if (args.slow) await sleep(args.slow);
        }
      }

      if (bi < post.blocks.length - 1) {
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
      }
    }
    log(`${done}줄 입력 완료`);
    await dump(page, 'body');

    step('6. 발행 설정 열기');
    try {
      await clickFirst(page, ['button:has-text("발행")', '[class*="publish_btn"]'], { timeout: 6000 });
    } catch {
      await clickFirst(editor, ['button:has-text("발행")', '[class*="publish_btn"]']);
    }
    await sleep(1500);
    await dump(page, 'publish-layer');

    if (post.category) {
      step(`7. 카테고리: ${post.category}`);
      try {
        await clickFirst(page, ['[class*="selectbox_button"]', 'button:has-text("카테고리")'], { timeout: 4000 });
        await sleep(500);
        await clickFirst(page, [`label:has-text("${post.category}")`, `span:has-text("${post.category}")`], { timeout: 4000 });
      } catch { warn('카테고리 자동 선택 실패 — 수동으로 지정하세요.'); }
    }

    if (post.tags?.length) {
      step('8. 태그 입력');
      try {
        const { loc } = await findFirst(page,
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
      step(`9. 예약 설정: ${at.ymd} ${at.hh}:${at.mm}`);
      try {
        await clickFirst(page, ['label:has-text("예약")', 'input[type="radio"][value="RESERVE"]'], { timeout: 5000 });
        await sleep(800);
        const { loc } = await findFirst(page,
          ['input[class*="input_date"]', 'input[placeholder*="날짜"]'], { timeout: 4000 });
        await loc.fill(at.ymd);
        for (const [label, value, sels] of [
          ['시', at.hh, ['select[class*="hour"]', '.hour_option select']],
          ['분', at.mm, ['select[class*="minute"]', '.minute_option select']],
        ]) {
          try {
            const r = await findFirst(page, sels, { timeout: 3000 });
            await r.loc.selectOption(value);
            log(`${label}: ${value}`);
          } catch { warn(`${label} 선택 실패 — 수동으로 ${value} 지정하세요.`); }
        }
      } catch { warn('예약 UI 자동 설정 실패 — 수동으로 지정하세요.'); }
      await dump(page, 'schedule');
    }

    if (manual.length) {
      console.log('\n' + '─'.repeat(58));
      console.log(' 수동으로 입혀야 할 서식 ' + `(${manual.length}건)`);
      console.log('─'.repeat(58));
      manual.forEach((m, i) => console.log(`  ${String(i + 1).padStart(2)}. ${m}`));
      console.log('\n  해당 줄을 드래그해서 툴바로 지정하면 됩니다.');
    }

    step('10. 최종 발행');
    if (args.dryRun) {
      log('DRY-RUN — 최종 발행 버튼을 누르지 않고 멈춥니다.');
      log('브라우저에서 내용을 확인하세요. 탭은 열어둡니다.');
      log('문제 없으면 --dry-run 을 빼고 다시 실행하세요.');
      await dump(page, 'dry-run-final');
      console.log('\n✅ DRY-RUN 완료');
      return;
    }
    await clickFirst(page, ['[class*="confirm_btn"]', 'button:has-text("발행"):visible', '.btn_apply']);
    await sleep(3000);
    await dump(page, 'published');
    console.log(`\n✅ 완료 — ${at ? `${at.ymd} ${at.hh}:${at.mm} 예약됨` : '발행됨'}`);
    log(`확인: https://blog.naver.com/${args.blogId}`);

  } catch (e) {
    console.error('\n❌ 실패:', e.message);
    await dump(page, 'error').catch(() => {});
    console.error(dumpDir
      ? `\n👉 ${dumpDir} 안의 파일을 보내주시면 선택자를 고치겠습니다.`
      : '\n👉 --dump 를 붙여 다시 실행하면 dumps/ 에 화면과 HTML이 남습니다.');
    process.exitCode = 1;
  } finally {
    // attach 한 브라우저는 사용자 것이다. 종료하지 않고 연결만 해제한다.
    await browser.close().catch(() => {});
  }
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
