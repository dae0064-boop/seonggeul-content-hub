#!/usr/bin/env node
/**
 * 네이버 블로그 글 작성 + 예약발행 자동화
 *
 * 이미 로그인된 크롬에 CDP로 attach 하므로 재로그인/캡차가 없습니다.
 *
 * 사용법:
 *   1) 크롬을 디버깅 포트로 실행 (기존 크롬은 완전히 종료한 뒤)
 *   2) node scripts/publish-naver.mjs --post <파일> --blog-id <아이디> --at "2026-09-12 07:30"
 *
 * 주요 옵션:
 *   --dry-run   최종 발행 버튼만 누르지 않고 직전에 멈춤 (기본 권장)
 *   --dump      각 단계마다 스크린샷 + HTML 저장 (dumps/)
 *   --slow <ms> 각 동작 사이 지연
 */

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------- args
function parseArgs(argv) {
  const out = { cdp: 'http://localhost:9222', slow: 120 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--post':     out.post = next(); break;
      case '--blog-id':  out.blogId = next(); break;
      case '--at':       out.at = next(); break;
      case '--cdp':      out.cdp = next(); break;
      case '--slow':     out.slow = Number(next()); break;
      case '--dry-run':  out.dryRun = true; break;
      case '--dump':     out.dump = true; break;
      case '--help':     out.help = true; break;
      default:
        if (a.startsWith('--')) throw new Error(`알 수 없는 옵션: ${a}`);
    }
  }
  return out;
}

const USAGE = `
네이버 블로그 예약발행 자동화

  node scripts/publish-naver.mjs \\
    --post content/posts/2026-09-11-hwanjeolgi-gamgi.json \\
    --blog-id 내블로그아이디 \\
    --at "2026-09-12 07:30" \\
    --dry-run --dump

옵션
  --post <파일>     발행할 글 JSON (필수)
  --blog-id <id>    네이버 블로그 아이디 (필수)
  --at "Y-M-D H:M"  예약 발행 시각. 생략하면 즉시 발행 설정
  --cdp <url>       CDP 엔드포인트 (기본 http://localhost:9222)
  --dry-run         최종 발행 직전에 멈춤 (반드시 먼저 한 번 실행해 보세요)
  --dump            단계별 스크린샷/HTML 저장
  --slow <ms>       동작 간 지연 (기본 120)
`;

// ---------------------------------------------------------------- utils
const log  = (...m) => console.log('  ', ...m);
const step = (...m) => console.log('\n▶', ...m);
const warn = (...m) => console.log('  ⚠', ...m);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let dumpDir = null;
let dumpSeq = 0;

async function dump(page, label) {
  if (!dumpDir) return;
  const n = String(++dumpSeq).padStart(2, '0');
  const base = path.join(dumpDir, `${n}-${label}`);
  try {
    await page.screenshot({ path: `${base}.png`, fullPage: true });
    fs.writeFileSync(`${base}.html`, await page.content());
    log(`덤프 저장: ${base}.{png,html}`);
  } catch (e) {
    warn(`덤프 실패(${label}): ${e.message}`);
  }
}

/**
 * 여러 후보 선택자를 순서대로 시도해 "보이는" 첫 요소를 반환.
 * 네이버 에디터는 클래스명에 해시가 붙어 자주 바뀌므로 텍스트 기반 선택자를 함께 둔다.
 */
async function findFirst(scope, selectors, { timeout = 8000 } = {}) {
  const deadline = Date.now() + timeout;
  let lastErr = null;
  while (Date.now() < deadline) {
    for (const sel of selectors) {
      try {
        const loc = scope.locator(sel).first();
        if (await loc.isVisible({ timeout: 300 })) return { loc, sel };
      } catch (e) { lastErr = e; }
    }
    await sleep(250);
  }
  const err = new Error(
    `요소를 찾지 못했습니다.\n시도한 선택자:\n${selectors.map((s) => `    - ${s}`).join('\n')}`
  );
  err.cause = lastErr;
  throw err;
}

async function clickFirst(scope, selectors, opts) {
  const { loc, sel } = await findFirst(scope, selectors, opts);
  await loc.click();
  log(`클릭: ${sel}`);
  return loc;
}

/** 에디터(SmartEditor ONE)가 들어 있는 프레임을 찾는다. iframe 안일 수도, 최상위일 수도 있다. */
async function resolveEditorFrame(page, timeout = 30000) {
  const probes = ['.se-content', '.se-main-container', '[class*="se-documentTitle"]'];
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      for (const p of probes) {
        try {
          if (await frame.locator(p).first().isVisible({ timeout: 200 })) {
            log(`에디터 프레임: ${frame.url().slice(0, 90) || '(about:blank)'} — 감지 선택자 ${p}`);
            return frame;
          }
        } catch { /* 프레임 전환 중 */ }
      }
    }
    await sleep(400);
  }
  throw new Error('에디터 프레임을 찾지 못했습니다. --dump 로 화면을 확인해 주세요.');
}

function parseAt(at) {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})$/.exec(at.trim());
  if (!m) throw new Error(`--at 형식이 잘못됐습니다: "${at}" (예: "2026-09-12 07:30")`);
  const date = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  if (Number.isNaN(date.getTime())) throw new Error(`존재하지 않는 날짜: "${at}"`);
  if (+m[5] % 10 !== 0) {
    warn(`네이버 예약발행은 보통 10분 단위만 선택됩니다. 분(${m[5]})이 반영되지 않을 수 있습니다.`);
  }
  return {
    date,
    y: m[1],
    mo: String(+m[2]).padStart(2, '0'),
    d: String(+m[3]).padStart(2, '0'),
    hh: String(+m[4]).padStart(2, '0'),
    mm: m[5],
    ymd: `${m[1]}-${String(+m[2]).padStart(2, '0')}-${String(+m[3]).padStart(2, '0')}`,
  };
}

// ---------------------------------------------------------------- main
async function main() {
  const args = parseArgs(process.argv);
  if (args.help) { console.log(USAGE); return; }

  if (!args.post)   throw new Error('--post 가 필요합니다. --help 를 참고하세요.');
  if (!args.blogId) throw new Error('--blog-id 가 필요합니다. --help 를 참고하세요.');

  const post = JSON.parse(fs.readFileSync(args.post, 'utf8'));
  if (!post.title || !Array.isArray(post.blocks)) {
    throw new Error(`${args.post}: title 과 blocks 필드가 필요합니다.`);
  }

  const at = args.at ? parseAt(args.at) : null;
  if (at && at.date.getTime() < Date.now()) {
    throw new Error(`예약 시각이 과거입니다: ${args.at}`);
  }

  if (args.dump) {
    dumpDir = path.join('dumps', new Date().toISOString().replace(/[:.]/g, '-'));
    fs.mkdirSync(dumpDir, { recursive: true });
  }

  console.log('═'.repeat(58));
  console.log(' 네이버 블로그 예약발행');
  console.log('═'.repeat(58));
  log(`글    : ${post.title}`);
  log(`블록  : ${post.blocks.length}개`);
  log(`태그  : ${(post.tags || []).join(', ') || '(없음)'}`);
  log(`예약  : ${at ? `${at.ymd} ${at.hh}:${at.mm}` : '즉시 발행'}`);
  log(`모드  : ${args.dryRun ? 'DRY-RUN (최종 발행 안 함)' : '실제 발행'}`);

  // ---- 1. 크롬 attach
  step('1. 실행 중인 크롬에 연결');
  let browser;
  try {
    browser = await chromium.connectOverCDP(args.cdp);
  } catch (e) {
    throw new Error(
      `${args.cdp} 에 연결하지 못했습니다.\n` +
      `크롬을 디버깅 포트로 띄웠는지 확인하세요. README.md 의 "크롬 실행" 항목 참고.\n` +
      `원인: ${e.message}`
    );
  }
  const context = browser.contexts()[0];
  if (!context) throw new Error('브라우저 컨텍스트가 없습니다. 크롬에 탭이 하나 이상 열려 있어야 합니다.');
  log(`연결됨 — 열린 탭 ${context.pages().length}개`);

  const page = await context.newPage();
  page.setDefaultTimeout(20000);

  try {
    // ---- 2. 글쓰기 페이지
    step('2. 글쓰기 페이지 열기');
    const writeUrl = `https://blog.naver.com/${args.blogId}/postwrite`;
    await page.goto(writeUrl, { waitUntil: 'domcontentloaded' });
    await sleep(2500);

    if (/nid\.naver\.com|login/.test(page.url())) {
      throw new Error(
        '로그인 페이지로 이동했습니다. attach 한 크롬이 네이버에 로그인된 프로필이 맞는지 확인하세요.\n' +
        `현재 URL: ${page.url()}`
      );
    }
    log(`URL: ${page.url()}`);
    await dump(page, 'write-page');

    const editor = await resolveEditorFrame(page);

    // ---- 3. 이전 작성글 복구 팝업 처리
    step('3. 이전 작성글 팝업 확인');
    try {
      const { loc } = await findFirst(
        editor,
        [
          'button:has-text("취소")',
          '.se-popup-button-cancel',
          '[class*="popup"] button:has-text("취소")',
        ],
        { timeout: 3000 }
      );
      await loc.click();
      log('작성 중이던 글 불러오기 팝업 → 취소');
      await sleep(600);
    } catch {
      log('팝업 없음 (정상)');
    }

    // ---- 4. 제목
    step('4. 제목 입력');
    await clickFirst(editor, [
      '.se-documentTitle .se-text-paragraph',
      '[class*="documentTitle"] [contenteditable="true"]',
      '.se-title-text .se-text-paragraph',
      '.se-placeholder:has-text("제목")',
    ]);
    await sleep(300);
    await page.keyboard.insertText(post.title);
    log(`입력: ${post.title}`);
    await dump(page, 'title');

    // ---- 5. 본문
    step('5. 본문 입력');
    await clickFirst(editor, [
      '.se-component.se-text:not(.se-documentTitle) .se-text-paragraph',
      '.se-main-container .se-text-paragraph',
      '.se-placeholder:has-text("내용")',
    ]);
    await sleep(300);

    for (let i = 0; i < post.blocks.length; i++) {
      const b = post.blocks[i];
      const text = (b.text ?? '').trim();
      if (text) await page.keyboard.insertText(text);
      if (i < post.blocks.length - 1) await page.keyboard.press('Enter');
      if (args.slow) await sleep(Math.min(args.slow, 80));
      if ((i + 1) % 20 === 0) log(`${i + 1}/${post.blocks.length} 블록`);
    }
    log(`본문 ${post.blocks.length}개 블록 입력 완료`);
    await dump(page, 'body');

    // ---- 6. 발행 레이어
    step('6. 발행 설정 열기');
    await clickFirst(page, [
      'button:has-text("발행")',
      '[class*="publish_btn"]',
      '.publish_btn__m9KHH',
    ]).catch(async () => {
      await clickFirst(editor, ['button:has-text("발행")', '[class*="publish_btn"]']);
    });
    await sleep(1500);
    await dump(page, 'publish-layer');

    const layer = page; // 발행 레이어는 보통 최상위 문서에 렌더링됨

    // ---- 7. 카테고리 (선택)
    if (post.category) {
      step(`7. 카테고리: ${post.category}`);
      try {
        await clickFirst(layer, ['[class*="selectbox_button"]', 'button:has-text("카테고리")'], { timeout: 4000 });
        await sleep(500);
        await clickFirst(layer, [`label:has-text("${post.category}")`, `span:has-text("${post.category}")`], { timeout: 4000 });
        log('카테고리 선택 완료');
      } catch (e) {
        warn(`카테고리 자동 선택 실패 — 수동으로 지정하세요. (${e.message.split('\n')[0]})`);
      }
    }

    // ---- 8. 태그
    if (post.tags?.length) {
      step('8. 태그 입력');
      try {
        const { loc } = await findFirst(layer, [
          'input#tag-input',
          '[class*="tag_input"] input',
          'input[placeholder*="태그"]',
        ], { timeout: 5000 });
        await loc.click();
        for (const t of post.tags) {
          await page.keyboard.insertText(t);
          await page.keyboard.press('Enter');
          await sleep(200);
        }
        log(`태그 ${post.tags.length}개 입력`);
      } catch (e) {
        warn(`태그 입력 실패 — 수동으로 넣으세요. (${e.message.split('\n')[0]})`);
      }
    }

    // ---- 9. 예약 발행
    if (at) {
      step(`9. 예약 설정: ${at.ymd} ${at.hh}:${at.mm}`);
      await clickFirst(layer, [
        'label:has-text("예약")',
        'input[type="radio"][value="RESERVE"]',
        'span:has-text("예약")',
      ]);
      await sleep(800);

      // 날짜
      try {
        const { loc } = await findFirst(layer, [
          'input[class*="input_date"]',
          'input[placeholder*="날짜"]',
          '.se-date-input input',
        ], { timeout: 5000 });
        await loc.fill(at.ymd);
        log(`날짜: ${at.ymd}`);
      } catch (e) {
        warn(`날짜 입력란을 못 찾았습니다 — 수동 확인 필요. (${e.message.split('\n')[0]})`);
      }

      // 시 / 분 (네이버는 select 또는 커스텀 드롭다운)
      for (const [label, value, sels] of [
        ['시', at.hh, ['select[class*="hour"]', '.hour_option select', 'select:near(:text("시"))']],
        ['분', at.mm, ['select[class*="minute"]', '.minute_option select', 'select:near(:text("분"))']],
      ]) {
        try {
          const { loc } = await findFirst(layer, sels, { timeout: 4000 });
          await loc.selectOption(value);
          log(`${label}: ${value}`);
        } catch {
          warn(`${label} 선택 실패 — 수동으로 ${value} 지정하세요.`);
        }
      }
      await dump(page, 'schedule-set');
    }

    // ---- 10. 최종 발행
    step('10. 최종 발행');
    if (args.dryRun) {
      log('DRY-RUN: 최종 발행 버튼을 누르지 않고 멈춥니다.');
      log('브라우저에서 내용을 눈으로 확인하세요.');
      log('문제 없으면 --dry-run 을 빼고 다시 실행하면 실제로 예약됩니다.');
      await dump(page, 'dry-run-final');
      console.log('\n✅ DRY-RUN 완료 — 탭은 열어둡니다.');
      return;
    }

    await clickFirst(layer, [
      '[class*="confirm_btn"]',
      'button:has-text("발행"):visible',
      '.btn_apply',
    ]);
    await sleep(3000);
    await dump(page, 'published');
    console.log(`\n✅ 완료 — ${at ? `${at.ymd} ${at.hh}:${at.mm} 예약됨` : '발행됨'}`);
    log(`확인: https://blog.naver.com/${args.blogId}`);

  } catch (e) {
    console.error('\n❌ 실패:', e.message);
    await dump(page, 'error').catch(() => {});
    if (!dumpDir) {
      console.error('\n👉 --dump 옵션을 붙여 다시 실행하면 화면과 HTML이 dumps/ 에 저장됩니다.');
      console.error('   그 파일을 저에게 보내주시면 선택자를 맞춰 고치겠습니다.');
    } else {
      console.error(`\n👉 ${dumpDir} 안의 파일을 보내주시면 선택자를 고치겠습니다.`);
    }
    process.exitCode = 1;
  } finally {
    // attach 한 크롬은 닫지 않는다. 사용자의 브라우저이므로 연결만 해제.
    await browser.close().catch(() => {});
  }
}

main().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});
