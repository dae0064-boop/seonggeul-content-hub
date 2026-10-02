#!/usr/bin/env node
/**
 * 티스토리 글 작성(사진 포함) → 임시저장 자동화
 *
 * 티스토리 Open API 는 2024년 2월에 종료됐다 (memory/decisions.md). 남은 길은 브라우저 자동화뿐이라
 * 네이버와 같이 이미 로그인된 크롬(디버깅 포트 9222)에 CDP 로 attach 한다.
 *
 *   node scripts/publish-tistory.mjs --post content/tistory/2026-10-02-hasan-mureup.json --save-draft --dump
 *
 * 순서
 *   1) <블로그>.tistory.com/manage/newpost 를 연다
 *   2) 제목을 넣고, 본문은 HTML 을 통째로 넣는다 (기본 에디터의 TinyMCE → 안 되면 HTML 모드)
 *      네이버처럼 한 줄씩 치지 않는다 — 티스토리는 HTML 을 그대로 받는다
 *   3) 들어간 본문을 다시 읽어 제목(H2)·표·글자 수가 맞는지 확인한다. 안 맞으면 저장하지 않는다
 *   4) 카테고리·태그
 *   5) --save-draft: 에디터 아래 '임시저장'만 누른다
 *
 * 아직 하지 않는 것 (실제 화면 덤프를 보고 붙인다)
 *   - 예약발행: 발행 패널의 날짜·시각 칸 구조를 아직 모른다. --dry-run 덤프를 받은 뒤 만든다.
 *     네이버처럼 '다시 읽어 확인 → 안 되면 임시저장' 규칙으로 만든다.
 *
 * 사진 (--images <폴더>, 2026-10-03 사용자 지시 — 테스트부터 사진까지)
 *   빈 본문에 <폴더>/NN.png 를 1번부터 한 장씩 올린다 → 티스토리가 그림마다 [##_Image|…_##] 코드를 만든다
 *   → HTML 모드로 바꿔 그 코드를 순서대로 읽는다 → 원고의 [이미지 N] 자리에 코드를 끼워 넣고 본문 전체를 덮어쓴다.
 *   커서 위치를 맞출 필요가 없어서 순서가 틀어지지 않는다. 올리지 못한 그림 자리는 표시 문단으로 남기고 목록으로 알린다.
 *
 * 실제 발행은 --publish-now 를 사람이 그 자리에서 붙였을 때만 한다. 기본은 아무것도 발행하지 않는다.
 * attach 한 브라우저는 사용자 것이다. 종료하지 않는다.
 */

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------- args
function parseArgs(argv) {
  const out = { cdp: 'http://localhost:9222', blog: process.env.TISTORY_BLOG || '', tags: true, body: 'auto' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--post':        out.post = next(); break;
      case '--blog':        out.blog = next(); break;
      case '--cdp':         out.cdp = next(); break;
      case '--body':        out.body = next(); break;
      case '--save-draft':  out.saveDraft = true; break;
      case '--dry-run':     out.dryRun = true; break;
      case '--publish-now': out.publishNow = true; break;
      case '--reserve':     out.reserve = true; break;
      case '--no-tags':     out.tags = false; break;
      case '--url':         out.url = next(); break;
      case '--images':      out.images = next(); break;
      case '--dump':        out.dump = true; break;
      case '--help':        out.help = true; break;
      default:
        if (a.startsWith('--')) throw new Error(`알 수 없는 옵션: ${a}`);
    }
  }
  return out;
}

const USAGE = `
티스토리 글 작성 자동화 (기본: 임시저장까지만)

  node scripts/publish-tistory.mjs \\
    --post content/tistory/2026-10-02-hasan-mureup.json --save-draft --dump

옵션
  --post <파일>      글 JSON (필수). build-tistory.mjs 로 .md 에서 생성한다.
  --blog <이름>      블로그 주소 앞부분 (<이름>.tistory.com). 생략하면 환경변수 TISTORY_BLOG
  --save-draft       에디터 아래 '임시저장'만 누른다. 발행 패널은 열지 않는다
  --dry-run          임시저장한 뒤 '완료'(발행 패널)를 열어 화면을 덤프하고, 발행하지 않고 닫는다.
                     예약발행을 만들 때 쓸 화면 자료를 남긴다 (--dump 를 함께 쓴다)
  --publish-now      공개 발행까지 누른다. 사람이 그 자리에서 결정했을 때만 쓴다
  --reserve          아직 없다. --dry-run 덤프로 발행 패널을 확인한 뒤 만든다
  --body <방식>      본문 넣는 방식: auto(기본) / tinymce / html
  --no-tags          태그를 넣지 않는다
  --dump             단계별 스크린샷/HTML 을 dumps/ 에 저장
  --cdp <url>        CDP 주소 (기본 http://localhost:9222)
  --images <폴더>    [이미지 N] 자리에 <폴더>/NN.png 를 올려 넣는다 (post-images.mjs 결과 폴더)
  --url <url>        글쓰기 URL 재정의 (로컬 목업 테스트용)

--save-draft / --dry-run / --publish-now 중 아무것도 없으면 본문만 채우고 멈춘다.
`;

// ---------------------------------------------------------------- utils
const log  = (...m) => console.log('  ', ...m);
const step = (...m) => console.log('\n▶', ...m);
const warn = (...m) => console.log('  ⚠', ...m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let dumpDir = null, dumpSeq = 0;
async function dump(page, label) {
  if (!dumpDir) return;
  const base = path.join(dumpDir, `${String(++dumpSeq).padStart(2, '0')}-tistory-${label}`);
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
  throw new Error(`요소를 찾지 못했습니다.\n시도한 선택자:\n${selectors.map((s) => `    - ${s}`).join('\n')}`);
}

async function clickFirst(scope, selectors, opts) {
  const { loc, sel } = await findFirst(scope, selectors, opts);
  await loc.click();
  log(`클릭: ${sel}`);
  return loc;
}

// ---------------------------------------------------------------- 선택자
// 티스토리 에디터 id 는 네이버보다 안정적이지만, 바뀔 때를 대비해 글자 기반 후보를 함께 둔다.
const SEL = {
  title:     ['textarea#post-title-inp', 'textarea[placeholder*="제목"]', 'input[placeholder*="제목"]'],
  editorIfr: ['iframe#editor-tistory_ifr', 'iframe[id$="_ifr"]'],
  modeBtn:   ['#editor-mode-layer-btn-open', 'button:has-text("기본모드")'],
  modeHtml:  ['#editor-mode-html', '[id*="mode-html"]', 'span:has-text("HTML")'],
  codeMirror:['.CodeMirror'],
  modeOk:    ['.mce-window button:has-text("확인")', '[role="dialog"] button:has-text("확인")', '.layer_btn button:has-text("확인")', 'button.btn_ok', 'button:has-text("확인")'],
  fileInput: ['input[type="file"][accept*="image"]', 'input#attach-image[type="file"]', 'input[type="file"]'],
  attachBtn: ['#mceu_0-open', 'button[aria-label="첨부"]', 'button:has-text("첨부")'],
  attachPhoto:['#attach-image', 'li:has-text("사진")', 'button:has-text("사진")'],
  category:  ['button#category-btn', 'button:has-text("카테고리")'],
  tagInput:  ['input#tagText', 'input[placeholder*="태그"]'],
  draft:     ['a.btn-draft', 'button.btn-draft', '.btn-draft .action', 'button:has-text("임시저장")', 'a:has-text("임시저장")'],
  complete:  ['button#publish-layer-btn', 'button:has-text("완료")'],
  layerClose:['button#publish-cancel-btn', '.layer_post button:has-text("취소")', 'button:has-text("취소")'],
  openPublic:['input#open20', 'input[type="radio"][value="20"]', 'label:has-text("공개") input[type="radio"]'],
  openPublicLabel: ['label[for="open20"]', 'label:has-text("공개")'],
  publishBtn:['button#publish-btn', 'button:has-text("공개 발행")', 'button:has-text("발행")'],
};

// ---------------------------------------------------------------- 본문
const squash = (s) => s.replace(/\s/g, '');

/** 기본 에디터(TinyMCE)에 HTML 을 통째로 넣는다. */
async function bodyByTinymce(page, html) {
  return page.evaluate((h) => {
    const ed = window.tinymce && (window.tinymce.activeEditor || window.tinymce.editors?.[0]);
    if (!ed) return { ok: false, why: 'tinymce 없음' };
    ed.focus();
    ed.setContent(h);
    ed.undoManager?.add();
    ed.setDirty?.(true);
    ed.fire?.('change');
    ed.fire?.('input');
    return { ok: true };
  }, html);
}

/** HTML 모드로 바꿔 코드 편집기(CodeMirror)에 넣는다. 전환 확인창은 dialog 핸들러가 수락한다. */
async function toHtmlMode(page) {
  if (await page.evaluate(() => { const e = document.querySelector('.CodeMirror'); return !!(e && e.offsetParent); })) return;
  await clickFirst(page, SEL.modeBtn, { timeout: 5000 });
  await sleep(500);
  await clickFirst(page, SEL.modeHtml, { timeout: 5000 });
  await sleep(800);
  // 모드 전환 경고가 화면 안 레이어로 뜨면 '확인' (브라우저 확인창이면 dialog 핸들러가 수락한다)
  await clickFirst(page, SEL.modeOk, { timeout: 1500 }).catch(() => {});
  await sleep(800);
  await findFirst(page, SEL.codeMirror, { timeout: 8000 });
}

const IMAGE_CODE = /\[##_Image\|[\s\S]*?_##\]/g;

/** 지금 본문에 들어 있는 그림 수 (기본 에디터의 <img> 또는 HTML 모드의 [##_Image] 코드) */
const countImages = (page) => page.evaluate(() => {
  const cm = document.querySelector('.CodeMirror');
  if (cm && cm.offsetParent && cm.CodeMirror) return (cm.CodeMirror.getValue().match(/\[##_Image\|/g) || []).length;
  const ed = window.tinymce && (window.tinymce.activeEditor || window.tinymce.editors?.[0]);
  const body = ed?.getBody?.();
  if (!body) return 0;
  const imgs = body.querySelectorAll('img, figure[data-ke-type="image"]').length;
  const codes = (body.textContent.match(/\[##_Image\|/g) || []).length;
  return Math.max(imgs, codes);
});

/** 그림 한 장 올리기: 숨은 파일 칸에 바로 넣고, 안 되면 첨부 → 사진 버튼으로 파일 선택창을 띄운다. 들어갔는지 그림 수로 확인 */
async function uploadOne(page, file) {
  const before = await countImages(page);
  let sent = false;
  for (const sel of SEL.fileInput) {
    const loc = page.locator(sel).first();
    if (await loc.count().catch(() => 0)) {
      try { await loc.setInputFiles(file); sent = true; break; } catch { /* 다음 후보 */ }
    }
  }
  if (!sent) {
    await clickFirst(page, SEL.attachBtn, { timeout: 4000 });
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 8000 }),
      clickFirst(page, SEL.attachPhoto, { timeout: 4000 }),
    ]);
    await chooser.setFiles(file);
  }
  const deadline = Date.now() + 40000;
  while (Date.now() < deadline) {
    if ((await countImages(page)) > before) return true;
    await sleep(500);
  }
  return false;
}

async function bodyByHtmlMode(page, html) {
  await toHtmlMode(page);
  return page.evaluate((h) => {
    const cm = document.querySelector('.CodeMirror')?.CodeMirror;
    if (!cm) return { ok: false, why: 'CodeMirror 없음' };
    cm.setValue(h);
    cm.save?.();
    return { ok: true };
  }, html);
}

/** 에디터에 실제로 들어간 것을 다시 읽는다. 어느 방식이든 같은 기준으로 확인한다. */
async function readBack(page) {
  return page.evaluate(() => {
    const cm = document.querySelector('.CodeMirror')?.CodeMirror;
    const visibleCm = cm && document.querySelector('.CodeMirror').offsetParent !== null;
    let root;
    let images = 0;
    if (visibleCm) {
      const v = cm.getValue();
      images = (v.match(/\[##_Image\|/g) || []).length;
      root = document.createElement('div');
      root.innerHTML = v.replace(/\[##_Image\|[\s\S]*?_##\]/g, '');
    }
    else {
      const ed = window.tinymce && (window.tinymce.activeEditor || window.tinymce.editors?.[0]);
      root = ed?.getBody?.();
    }
    if (!root) return null;
    return {
      via: visibleCm ? 'html' : 'tinymce',
      images,
      text: root.textContent || '',
      h2: [...root.querySelectorAll('h2')].map((e) => e.textContent.trim()),
      tables: root.querySelectorAll('table').length,
      // 색·배경을 입힌 글자 (에디터가 style 을 지우면 강조가 사라진다)
      styled: [...root.querySelectorAll('span[style]')].filter((e) => /color/i.test(e.getAttribute('style'))).length,
    };
  });
}

function checkBody(got, post, want, imagesWant = 0) {
  if (!got) return '에디터 본문을 읽지 못함';
  if (got.images < imagesWant) return `그림 ${got.images}장 (올린 것 ${imagesWant}장)`;
  const count = (re) => (post.html.match(re) || []).length;
  const h2Want = count(/<h2[\s>]/g);
  const tWant = count(/<table[\s>]/g);
  const sWant = count(/<span style="[^"]*color/g);
  const ratio = squash(got.text).length / want;
  if (got.h2.length !== h2Want) return `H2 ${got.h2.length}개 (원고 ${h2Want}개)`;
  if (got.tables !== tWant) return `표 ${got.tables}개 (원고 ${tWant}개)`;
  if (got.styled < sWant) return `색 강조 ${got.styled}곳 (원고 ${sWant}곳) — 에디터가 색을 지웠다`;
  if (ratio < 0.97 || ratio > 1.05) return `글자 수가 원고의 ${Math.round(ratio * 100)}%`;
  return '';
}

// ---------------------------------------------------------------- 카테고리·태그
async function pickCategory(page, name) {
  const btn = await clickFirst(page, SEL.category, { timeout: 4000 });
  await sleep(500);
  await clickFirst(page, [
    `#category-list [role="option"]:has-text("${name}")`,
    `[role="option"]:has-text("${name}")`,
    `.mce-menu-item:has-text("${name}")`,
    `#category-list span:text-is("${name}")`,
  ], { timeout: 4000 });
  await sleep(400);
  const label = (await btn.innerText().catch(() => '')).trim();
  if (!label.includes(name)) throw new Error(`카테고리 버튼이 "${label}" 로 남음`);
}

async function enterTags(page, tags) {
  const { loc } = await findFirst(page, SEL.tagInput, { timeout: 4000 });
  for (const t of tags) {
    await loc.click();
    // 커서가 태그 칸에 있을 때만 Enter 를 누른다 (다른 버튼이 눌릴 여지를 없앤다)
    const focused = await loc.evaluate((el) => document.activeElement === el);
    if (!focused) throw new Error('태그 칸에 커서가 없습니다');
    await loc.fill(t);
    await loc.press('Enter');
    await sleep(250);
  }
  const area = await page.evaluate(() => {
    const inp = document.querySelector('input#tagText') || document.querySelector('input[placeholder*="태그"]');
    return (inp?.closest('[class*="tag"]')?.parentElement || document.body).innerText;
  });
  const miss = tags.filter((t) => !area.includes(t));
  if (miss.length) warn(`화면에서 확인되지 않은 태그: ${miss.join(', ')}`);
  log(`태그 ${tags.length - miss.length}/${tags.length}개`);
}

// ---------------------------------------------------------------- main
async function main() {
  const args = parseArgs(process.argv);
  if (args.help) { console.log(USAGE); return; }
  if (args.reserve) {
    throw new Error('--reserve 는 아직 없습니다. 먼저 --dry-run --dump 로 발행 패널 화면을 남겨 주세요.\n'
      + '그 덤프를 보고 예약 칸을 확인하는 코드를 붙입니다. 지금은 --save-draft 를 쓰세요.');
  }
  if (!args.post) throw new Error('--post 가 필요합니다. --help 참고.');
  if ([args.saveDraft, args.dryRun, args.publishNow].filter(Boolean).length > 1) {
    throw new Error('--save-draft / --dry-run / --publish-now 는 하나만 쓰세요.');
  }
  if (!args.url && !/^[a-z0-9-]+$/i.test(args.blog)) {
    throw new Error('블로그 이름이 필요합니다: --blog <이름> 또는 환경변수 TISTORY_BLOG (예: seonggeul → seonggeul.tistory.com)');
  }
  if (!['auto', 'tinymce', 'html'].includes(args.body)) throw new Error(`--body 는 auto / tinymce / html: ${args.body}`);

  const post = JSON.parse(fs.readFileSync(args.post, 'utf8'));
  if (!post.title || !post.html || !Array.isArray(post.blocks)) {
    throw new Error(`${args.post}: title·html·blocks 가 필요합니다. build-tistory.mjs 로 생성하세요.`);
  }
  // 기대 글자 수 = 에디터가 보여 줄 글자 (HTML 의 태그를 걷어 낸 것)
  const textOf = (h) => squash(h.replace(IMAGE_CODE, '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' '));
  let finalHtml = post.html;
  let want = textOf(finalHtml);
  // 그림 파일 미리 확인
  const imageBlocks = post.blocks.filter((b) => b.type === 'image');
  const imageFiles = [];
  if (args.images) {
    if (!fs.existsSync(args.images)) throw new Error(`이미지 폴더가 없습니다: ${args.images}\n먼저 post-images.mjs 로 만드세요.`);
    for (const b of imageBlocks) {
      const f = path.resolve(args.images, `${String(b.n).padStart(2, '0')}.png`);
      if (fs.existsSync(f)) imageFiles.push({ n: b.n, file: f });
    }
  }

  if (args.dump) {
    dumpDir = path.join('dumps', new Date().toISOString().replace(/[:.]/g, '-'));
    fs.mkdirSync(dumpDir, { recursive: true });
  }

  const mode = args.saveDraft ? '임시저장 (발행 안 함)'
    : args.dryRun ? 'DRY-RUN (임시저장 + 발행 패널 덤프, 발행 안 함)'
    : args.publishNow ? '⚠ 공개 발행'
    : '본문만 채우고 멈춤';
  console.log('═'.repeat(58));
  console.log(' 티스토리 글 작성');
  console.log('═'.repeat(58));
  log(`글    : ${post.title}`);
  log(`블로그: ${args.url || `${args.blog}.tistory.com`}`);
  log(`본문  : ${post.blocks.length}블록 / 공백 제외 ${want.length}자`);
  log(`이미지: ${imageBlocks.length}자리 / ${args.images ? `파일 ${imageFiles.length}장 준비됨` : '넣지 않음 (표시 문단으로 남김)'}`);
  log(`모드  : ${mode}`);

  step('1. 실행 중인 크롬에 연결');
  let browser;
  try { browser = await chromium.connectOverCDP(args.cdp); }
  catch (e) { throw new Error(`${args.cdp} 에 연결하지 못했습니다.\n자동화용 크롬(9222)이 켜져 있는지 확인하세요.\n원인: ${e.message}`); }
  const context = browser.contexts()[0];
  if (!context) throw new Error('브라우저 컨텍스트가 없습니다. 크롬에 탭이 하나 이상 있어야 합니다.');

  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  // 확인창 처리: 모드 전환은 수락, "작성 중인 글을 이어서?" 같은 나머지는 거절(새 글로 시작)
  page.on('dialog', async (d) => {
    const msg = d.message().replace(/\s+/g, ' ').slice(0, 80);
    if (d.type() === 'confirm' && /HTML|모드|전환/.test(msg)) { log(`확인창 수락: ${msg}`); await d.accept().catch(() => {}); }
    else { log(`확인창 거절: [${d.type()}] ${msg}`); await d.dismiss().catch(() => {}); }
  });

  try {
    step('2. 글쓰기 페이지 열기');
    await page.goto(args.url || `https://${args.blog}.tistory.com/manage/newpost/?type=post`, { waitUntil: 'domcontentloaded' });
    await sleep(args.url ? 500 : 3000);
    if (!args.url && /auth\/login|accounts\.kakao\.com|\/login/.test(page.url())) {
      throw new Error(`로그인 화면으로 갔습니다. 9222 크롬 창에서 티스토리(카카오)에 로그인돼 있는지 확인하세요.\n현재 URL: ${page.url()}`);
    }
    log(`URL: ${page.url()}`);
    await dump(page, 'opened');

    step('3. 제목');
    const title = await findFirst(page, SEL.title, { timeout: 15000 });
    await title.loc.fill(post.title);
    const gotTitle = (await title.loc.inputValue()).trim();
    if (gotTitle !== post.title) throw new Error(`제목이 다르게 들어갔습니다: "${gotTitle}"`);
    log(post.title);

    // 4-0. 사진: 빈 본문에 한 장씩 올리고, HTML 모드에서 코드를 읽어 원고 자리에 끼운다
    let uploaded = [];
    const missingImages = [];
    if (imageFiles.length) {
      step(`4-0. 사진 ${imageFiles.length}장 올리기`);
      await findFirst(page, SEL.editorIfr, { timeout: 15000 }).catch(() => {});
      for (const im of imageFiles) {
        const ok = await uploadOne(page, im.file).catch((e) => { warn(`${im.n}번 올리기 실패: ${e.message.split('\n')[0]}`); return false; });
        if (ok) { uploaded.push(im); log(`${im.n}번 올림`); } else missingImages.push(im.n);
        if (!ok) break; // 한 장이 안 되면 뒤 장도 같은 이유로 안 된다 — 순서가 틀어지지 않게 멈춘다
      }
      await dump(page, 'images-uploaded');
      if (uploaded.length) {
        await toHtmlMode(page);
        const codes = await page.evaluate(() => (document.querySelector('.CodeMirror').CodeMirror.getValue().match(/\[##_Image\|[\s\S]*?_##\]/g) || []));
        if (codes.length !== uploaded.length) {
          warn(`그림 코드 ${codes.length}개 / 올린 그림 ${uploaded.length}장 — 수가 달라 사진은 넣지 않고 글만 넣습니다.`);
          missingImages.push(...uploaded.map((u) => u.n)); uploaded = [];
        } else {
          uploaded.forEach((u, i) => {
            const re = new RegExp(`<p data-ke-size="size16">\\[이미지 ${u.n}\\][^<]*</p>`);
            finalHtml = finalHtml.replace(re, `<p data-ke-size="size16">${codes[i]}</p>`);
          });
          want = textOf(finalHtml);
          args.body = 'html'; // 그림 코드는 HTML 모드에서만 그대로 들어간다
        }
      }
      for (const b of imageBlocks) if (!imageFiles.some((f) => f.n === b.n) && !missingImages.includes(b.n)) missingImages.push(b.n);
    }

    step('4. 본문 (HTML 통째로)');
    let problem = 'not tried';
    if (args.body !== 'html') {
      await findFirst(page, SEL.editorIfr, { timeout: 15000 }).catch(() => {});
      const r = await bodyByTinymce(page, finalHtml);
      await sleep(800);
      problem = r.ok ? checkBody(await readBack(page), post, want.length, uploaded.length) : r.why;
      if (problem) warn(`기본 에디터로 넣기 실패: ${problem}`);
      else log('기본 에디터(TinyMCE)로 넣음');
    }
    if (problem && args.body !== 'tinymce') {
      const r = await bodyByHtmlMode(page, finalHtml).catch((e) => ({ ok: false, why: e.message.split('\n')[0] }));
      await sleep(800);
      problem = r.ok ? checkBody(await readBack(page), post, want.length, uploaded.length) : r.why;
      if (problem) warn(`HTML 모드로 넣기 실패: ${problem}`);
      else log('HTML 모드로 넣음');
    }
    await dump(page, 'body');
    if (problem) {
      throw new Error(`본문이 원고대로 들어가지 않아 저장하지 않습니다 (${problem}).\n`
        + `손으로 하려면 HTML 모드에 ${args.post.replace(/\.json$/, '.html')} 내용을 붙여넣으세요.`);
    }
    const back = await readBack(page);
    log(`확인: H2 ${back.h2.length}개 · 색 강조 ${back.styled}곳 · 그림 ${back.images}장 · ${squash(back.text).length}자 (${back.via})`);
    if (missingImages.length) warn(`사진을 넣지 못한 자리: ${[...new Set(missingImages)].sort((a, b) => a - b).join(', ')}번 — 표시 문단으로 남겼어요.`);

    step('5. 카테고리·태그');
    if (post.category) {
      try { await pickCategory(page, post.category); log(`카테고리: ${post.category}`); }
      catch (e) { warn(`카테고리 선택 실패 (${e.message.split('\n')[0]}) — 저장 후 직접 고르세요.`); }
    }
    if (args.tags && post.tags?.length) {
      try { await enterTags(page, post.tags); }
      catch (e) { warn(`태그 입력 실패 (${e.message.split('\n')[0]}) — 저장 후 직접 넣으세요.`); }
    }
    await dump(page, 'filled');

    if (!args.saveDraft && !args.dryRun && !args.publishNow) {
      console.log('\n✅ 본문까지 넣었습니다. 저장·발행은 하지 않았습니다 (탭은 열어둡니다).');
      return;
    }

    step('6. 임시저장');
    const { loc: draftBtn, sel } = await findFirst(page, SEL.draft, { timeout: 6000 });
    const label = (await draftBtn.innerText().catch(() => '')).trim();
    if (/발행|완료|공개/.test(label)) throw new Error(`임시저장 대신 다른 버튼이 잡혔습니다 ("${label}"). 멈춥니다.`);
    await draftBtn.click();
    log(`클릭: ${sel} ("${label || '임시저장'}")`);
    await sleep(2500);
    await dump(page, 'saved');

    if (args.saveDraft) {
      console.log('\n✅ 임시저장 완료 — 발행하지 않았습니다.');
      log('글쓰기 화면 아래 "임시저장" 옆 숫자를 누르면 목록에서 볼 수 있어요.');
      return;
    }

    step('7. 발행 패널 열기 (완료)');
    await clickFirst(page, SEL.complete, { timeout: 6000 });
    await sleep(1500);
    await dump(page, 'publish-layer');
    const layer = await page.evaluate(() => {
      const radios = [...document.querySelectorAll('input[type="radio"]')].map((r) => {
        const lab = r.id && document.querySelector(`label[for="${r.id}"]`);
        return `${r.id || r.name}=${r.value}${r.checked ? '(선택)' : ''}:${(lab?.innerText || '').trim()}`;
      });
      const buttons = [...document.querySelectorAll('button')].filter((b) => b.offsetParent).map((b) => `${b.id ? '#' + b.id : ''}"${b.innerText.trim()}"`).filter((s) => s.length < 40);
      // 예약 칸(날짜·시·분)을 만들 때 쓸 자료. 화면에 보이는 입력칸만 적는다
      const inputs = [...document.querySelectorAll('input:not([type="radio"]), select')].filter((e) => e.offsetParent)
        .map((e) => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${e.name ? '[name=' + e.name + ']' : ''}${e.className ? '.' + String(e.className).trim().split(/\s+/).join('.') : ''}="${e.value}"${e.placeholder ? ' ph=' + e.placeholder : ''}`);
      return { radios, buttons, inputs };
    });
    log(`라디오: ${layer.radios.join(' | ') || '없음'}`);
    log(`버튼  : ${layer.buttons.join(' | ')}`);
    log(`입력칸: ${layer.inputs.join(' | ') || '없음'}`);

    if (args.dryRun) {
      await clickFirst(page, SEL.layerClose, { timeout: 4000 }).catch(() => warn('발행 패널 닫기 버튼을 찾지 못했습니다. 화면에서 "취소"를 눌러 주세요.'));
      console.log('\n✅ DRY-RUN 완료 — 임시저장만 하고 발행하지 않았습니다.');
      if (dumpDir) log(`${dumpDir} 의 publish-layer 덤프로 예약발행을 만듭니다.`);
      return;
    }

    step('8. 공개 발행 (--publish-now)');
    const radio = await findFirst(page, SEL.openPublic, { timeout: 3000 }).catch(() => null);
    if (radio && !(await radio.loc.isChecked())) await clickFirst(page, SEL.openPublicLabel, { timeout: 3000 });
    if (!radio || !(await radio.loc.isChecked())) throw new Error("'공개'가 선택됐는지 확인하지 못해 발행하지 않습니다. 글은 임시저장에 있습니다.");
    const { loc: pubBtn } = await findFirst(page, SEL.publishBtn, { timeout: 4000 });
    const pubLabel = (await pubBtn.innerText().catch(() => '')).trim();
    if (!/발행/.test(pubLabel)) throw new Error(`발행 버튼 글자가 "${pubLabel}" 입니다. 발행하지 않습니다.`);
    await pubBtn.click();
    log(`클릭: "${pubLabel}"`);
    await sleep(3500);
    await dump(page, 'published');
    const left = !/manage\/newpost/.test(page.url());
    console.log(left ? '\n✅ 발행했습니다.' : `\n⚠ 발행을 눌렀지만 화면이 그대로예요 (${page.url().slice(0, 80)}). 글 목록에서 확인하세요.`);
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

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
