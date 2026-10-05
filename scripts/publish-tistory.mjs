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
 *   2) 제목·카테고리·태그를 넣고, 본문은 HTML 을 기본 에디터(TinyMCE)에 통째로 넣는다.
 *      HTML 모드 화면은 쓰지 않는다 — 거기 넣은 글은 저장되지 않는다 (2026-10-03 실제 테스트)
 *      네이버처럼 한 줄씩 치지 않는다 — 티스토리는 HTML 을 그대로 받는다
 *   3) 들어간 본문을 다시 읽어 제목(H2)·표·글자 수가 맞는지 확인한다. 안 맞으면 저장하지 않는다
 *   4) 카테고리·태그
 *   5) --save-draft: 에디터 아래 '임시저장'만 누른다
 *
 * 예약발행 --reserve (2026-10-03 사용자 지시 — 네이버와 30분 텀): 아래 reservePublish 참고.
 *   패널의 날짜·시각 칸을 실제 화면에서 아직 본 적이 없어 '예약' 전후로 새로 보이는 칸을 찾아 쓰고 로그에 남긴다.
 *   날짜·시·분을 다시 읽어 확인되지 않으면 발행을 누르지 않는다(종료 코드 2, 글은 임시저장).
 *
 * 사진 (--images <폴더>, 2026-10-03 사용자 지시 — 테스트부터 사진까지)
 *   빈 본문에 <폴더>/NN.png 를 1번부터 한 장씩 올린다 → 기본 에디터에 생긴 그림 덩어리를 순서대로 읽는다
 *   → 원고의 [이미지 N] 자리에 그 덩어리를 끼워 넣고 본문 전체를 기본 에디터에 덮어쓴다.
 *   커서 위치를 맞출 필요가 없어서 순서가 틀어지지 않는다. 올리지 못한 그림 자리는 표시 문단으로 남기고 목록으로 알린다.
 *
 * 실제 발행은 --publish-now 를 사람이 그 자리에서 붙였을 때만 한다. 기본은 아무것도 발행하지 않는다.
 * attach 한 브라우저는 사용자 것이다. 종료하지 않는다.
 */

import { chromium } from 'playwright';
import { tistoryRelogin } from './lib/tistory-login.mjs';
import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------- args
function parseArgs(argv) {
  const out = { cdp: 'http://localhost:9222', blog: process.env.TISTORY_BLOG || '', tags: true };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--post':        out.post = next(); break;
      case '--blog':        out.blog = next(); break;
      case '--cdp':         out.cdp = next(); break;
      case '--save-draft':  out.saveDraft = true; break;
      case '--dry-run':     out.dryRun = true; break;
      case '--publish-now': out.publishNow = true; break;
      case '--reserve':     out.reserve = true; break;
      case '--at':          out.at = next(); break;
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
  --reserve          예약발행. 임시저장 → 발행 패널 → '공개' → '예약' → 날짜·시·분을 넣고 다시 읽어 확인한 뒤에만
                     '발행'을 누른다. 하나라도 확인되지 않으면 누르지 않고 임시저장으로 남긴다 (종료 코드 2).
                     시각은 --at 또는 원고 publish_at. 오늘 날짜, 지금부터 20분 뒤 이후만 받는다
  --at "Y-M-D H:M"   예약 시각 (--reserve 와 함께)
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
    ed.nodeChanged?.();
    ed.fire?.('change');
    ed.fire?.('input');
    ed.fire?.('keyup');
    ed.save?.();
    return { ok: true };
  }, html);
}

// 모드 전환 확인창('작성 모드를 변경하시겠습니까?')은 언제나 거절한다. HTML 모드로 가면 글이 저장되지 않는다.
// (2026-10-03 첫 실제 테스트: 수락했더니 글이 사라졌고, 두 번째 테스트: HTML 화면에 넣은 글은 저장되지 않았다)
const allowModeSwitch = false;

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

/** 올린 그림이 서버에 다 올라갈 때까지 기다린다. 그 전에 getContent() 를 부르면 티스토리 에디터가
 *  '이미지 업로드가 완료된 후 시도해 주세요.' 를 던진다 (2026-10-05 실제 실행: 5편 중 2편이 이 오류로 저장되지 않았다).
 *  그림 수가 늘었다고 업로드가 끝난 것이 아니다. getContent 가 오류 없이 돌 때까지 본다. */
async function waitUploadsDone(page, ms = 90000) {
  const deadline = Date.now() + ms;
  let last = '';
  while (Date.now() < deadline) {
    last = await page.evaluate(() => {
      const ed = window.tinymce && (window.tinymce.activeEditor || window.tinymce.editors?.[0]);
      if (!ed) return '';
      try { ed.getContent(); return ''; } catch (e) { return String(e?.message || e); }
    }).catch((e) => String(e?.message || e));
    if (!last) return true;
    await sleep(1000);
  }
  throw new Error(`그림 업로드가 ${Math.round(ms / 1000)}초 안에 끝나지 않았습니다 (${last})`);
}

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


/** 에디터에 실제로 들어간 것을 다시 읽는다. 어느 방식이든 같은 기준으로 확인한다. */
// 티스토리는 저장할 때 기본 에디터(TinyMCE)의 내용을 쓴다. HTML 모드 화면(CodeMirror)에 넣은 글은 저장되지 않았다
// (2026-10-03 두 번째 실제 테스트: HTML 화면엔 글이 다 있었는데 임시저장 글에는 사진만 남았다). 그래서 기본 에디터만 읽는다.
async function readBack(page) {
  return page.evaluate(() => {
    const cmEl = document.querySelector('.CodeMirror');
    if (cmEl && cmEl.offsetParent) return { via: 'html', images: 0, text: '', h2: [], tables: 0, styled: 0, htmlMode: true };
    const ed = window.tinymce && (window.tinymce.activeEditor || window.tinymce.editors?.[0]);
    if (!ed) return null;
    const root = document.createElement('div');
    // 저장될 내용 그대로. 티스토리는 저장할 때 그림을 [##_Image|…_##] 코드로 바꿔 내보낸다 (2026-10-03 실제 테스트)
    const html = typeof ed.getContent === "function" ? ed.getContent() : ed.getBody().innerHTML;
    const codes = (html.match(/\[##_Image\|/g) || []).length;
    root.innerHTML = html.replace(/\[##_Image\|[\s\S]*?_##\]/g, '');
    return {
      via: 'tinymce',
      images: root.querySelectorAll('img').length + codes,
      text: root.textContent || '',
      h2: [...root.querySelectorAll('h2')].map((e) => e.textContent.trim()),
      tables: root.querySelectorAll('table').length,
      // 색·배경을 입힌 글자 (에디터가 style 을 지우면 강조가 사라진다)
      styled: [...root.querySelectorAll('span[style]')].filter((e) => /color/i.test(e.getAttribute('style'))).length,
    };
  });
}

/** 올린 그림이 기본 에디터에 만든 덩어리(그림을 감싼 맨 바깥 요소)를 순서대로 */
const imageBlocksInEditor = (page) => page.evaluate(() => {
  const ed = window.tinymce && (window.tinymce.activeEditor || window.tinymce.editors?.[0]);
  const body = ed?.getBody?.();
  if (!body) return [];
  return [...body.children].filter((el) => el.querySelector('img') || el.tagName === 'IMG').map((el) => el.outerHTML);
});

function checkBody(got, post, want, imagesWant = 0) {
  if (!got) return '에디터 본문을 읽지 못함';
  if (got.htmlMode) return 'HTML 모드 화면에 있음 — 이 상태로는 글이 저장되지 않는다';
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
  try {
    await clickFirst(page, [
      `#category-list [role="option"]:has-text("${name}")`,
      `#category-list span:text-is("${name}")`,
      `#category-list :text-is("${name}")`,
    ], { timeout: 4000 });
  } catch (e) {
    // 목록을 열어 둔 채 다음 단계로 가면 다른 버튼이 눌린다 — 닫고 나간다
    const names = await page.evaluate(() => [...document.querySelectorAll('#category-list [role="option"], #category-list li')].map((e) => e.innerText.trim()).filter(Boolean).slice(0, 20)).catch(() => []);
    await page.keyboard.press('Escape').catch(() => {});
    await sleep(300);
    if (names.length <= 1 && /없음/.test(names[0] || '')) throw new Error(`블로그에 카테고리가 아직 없어요 — 티스토리 관리 > 카테고리에서 "${name}" 을 만들면 다음부터 자동으로 골라요`);
    throw new Error(`"${name}" 카테고리를 찾지 못함${names.length ? ` (블로그 카테고리: ${names.join(', ')})` : ''}`);
  }
  await sleep(400);
  const label = (await btn.innerText().catch(() => '')).trim();
  if (!label.includes(name)) throw new Error(`카테고리 버튼이 "${label}" 로 남음`);
}

async function enterTags(page, tags) {
  // 화면에 보이는 태그 칸 하나만 쓴다. 2026-10-03 실제 실행: 보이는 칸은 찾았는데(findFirst 통과)
  // querySelector 로 고른 칸은 '보임 false' 였다 — 같은 선택자에 걸리는 칸이 둘 이상이고, 보이지 않는 쪽에 포커스를 주고 있었다.
  const { loc: tagLoc } = await findFirst(page, SEL.tagInput, { timeout: 6000 }).catch(async (e) => {
    throw new Error(`${e.message.split('\n')[0]} (${await tagCandidates(page)})`);
  });
  const inTag = () => tagLoc.evaluate((el) => el === document.activeElement).catch(() => false);
  for (const t of tags) {
    // 1) 그 칸에 직접 포커스 → 2) 칸을 눌러 포커스
    await tagLoc.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
    await tagLoc.focus({ timeout: 2000 }).catch(() => {});
    if (!(await inTag())) await tagLoc.click({ timeout: 3000 }).catch(() => {});
    if (!(await inTag())) {
      const a = await page.evaluate(() => { const x = document.activeElement; return x ? x.tagName + (x.id ? '#' + x.id : '') : '없음'; });
      throw new Error(`태그 칸에 커서가 없습니다 (커서 위치 ${a} · ${await tagCandidates(page)})`);
    }
    // 커서가 태그 칸에 있을 때만 Enter 를 누른다 (다른 버튼이 눌릴 여지를 없앤다). 글자·Enter 모두 그 칸에 직접 보낸다
    await tagLoc.fill(t);
    if (!(await inTag()) || (await tagLoc.inputValue().catch(() => '')) !== t) throw new Error('입력 중에 커서가 태그 칸을 벗어났습니다');
    await tagLoc.press('Enter');
    await sleep(250);
  }
  const area = await tagLoc.evaluate((inp) => (inp.closest('[class*="tag"]')?.parentElement || document.body).innerText).catch(() => '');
  const miss = tags.filter((t) => !area.includes(t));
  if (miss.length) warn(`화면에서 확인되지 않은 태그: ${miss.join(', ')}`);
  log(`태그 ${tags.length - miss.length}/${tags.length}개`);
}

/** 태그 칸 후보를 로그에 남긴다 — 실패했을 때 다음에 선택자를 고칠 근거 (HTML 덤프는 Drive 로 올라오지 않는다) */
async function tagCandidates(page) {
  return page.evaluate(() => {
    const els = [...document.querySelectorAll('input, [contenteditable="true"]')]
      .filter((e) => /tag|태그/i.test(`${e.id} ${e.name || ''} ${e.className} ${e.placeholder || ''} ${e.getAttribute('aria-label') || ''}`));
    if (!els.length) return '태그 후보 칸 없음';
    return els.slice(0, 6).map((e) => {
      const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
      return `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}.${String(e.className).trim().split(/\s+/).join('.')} ph=${e.placeholder || ''} 크기 ${Math.round(r.width)}x${Math.round(r.height)} display ${cs.display} visibility ${cs.visibility} 부모 ${e.parentElement?.className || ''}`;
    }).join(' | ');
  }).catch(() => '후보 읽기 실패');
}

// ---------------------------------------------------------------- 예약발행
/**
 * 발행 패널(완료를 누른 뒤)에서 예약한다. 순서: '공개' 확인 → '예약' → 날짜·시·분 → 다시 읽어 확인 → 발행.
 * 패널의 날짜·시각 칸 이름을 아직 실제 화면에서 본 적이 없어서(2026-10-03), '예약'을 누르기 전후로 화면에 새로 보이는
 * 칸을 찾아 쓰고, 찾은 칸을 모두 로그에 남긴다. 날짜·시·분 하나라도 맞게 읽히지 않으면 발행을 누르지 않는다
 * — 확인 없이 누르면 '현재 발행'이 돼 되돌릴 수 없다. 이 확인을 빼거나 경고로 낮추지 않는다.
 */
async function reservePublish(page, at) {
  step(`8. 예약발행 준비: ${at.text}`);
  // 공개
  const radio = await findFirst(page, SEL.openPublic, { timeout: 3000 }).catch(() => null);
  if (radio && !(await radio.loc.isChecked())) await clickFirst(page, SEL.openPublicLabel, { timeout: 3000 }).catch(() => {});
  if (!radio || !(await radio.loc.isChecked())) return { ok: false, why: "'공개'가 선택됐는지 확인하지 못함" };

  const fields = () => page.evaluate(() => [...document.querySelectorAll('input:not([type="radio"]):not([type="checkbox"]):not([type="hidden"]), select')]
    .filter((e) => e.offsetParent && e.id !== 'tagText' && e.id !== 'post-title-inp' && e.id !== 'urlPublish')
    .map((e, i) => (e.setAttribute('data-sg-field', String(i)), { i, tag: e.tagName.toLowerCase(), id: e.id, name: e.name, cls: String(e.className || ''), value: e.value,
      ph: e.placeholder || '', ro: !!e.readOnly, opts: e.tagName === 'SELECT' ? [...e.options].slice(0, 3).map((o) => o.value).join('/') : '',
      key: `${e.tagName}#${e.id}.${e.name}.${e.className}` })));
  const before = await fields();

  // '예약' 버튼 (패널 안의 글자가 정확히 '예약'인 버튼)
  try {
    await clickFirst(page, ['button:text-is("예약")', '.layer_post button:has-text("예약")', 'label:text-is("예약")'], { timeout: 4000 });
  } catch { return { ok: false, why: "'예약' 버튼을 찾지 못함" }; }
  await sleep(1200);
  const after = await fields();
  const fresh = after.filter((f) => !before.some((b) => b.key === f.key));
  const pool = fresh.length ? fresh : after;
  log(`예약 칸: ${pool.map((f) => `${f.tag}${f.id ? '#' + f.id : ''}${f.name ? '[' + f.name + ']' : ''}${f.cls ? '.' + f.cls.trim().split(/\s+/).join('.') : ''}="${f.value}"${f.ph ? ' ph=' + f.ph : ''}${f.ro ? ' (읽기전용)' : ''}${f.opts ? ' 옵션:' + f.opts : ''}`).join(' | ') || '없음'}`);
  await dump(page, 'reserve-open');

  const hint = (f) => `${f.id} ${f.name} ${f.cls} ${f.ph}`.toLowerCase();
  const isHour = (f) => /hour|시/.test(hint(f)) && !/minute|min|분/.test(hint(f));
  const isMin = (f) => /minute|min|분/.test(hint(f));
  const hourF = pool.find(isHour);
  const minF = pool.find(isMin);
  // 날짜 칸: 시·분 칸은 빼고 찾는다. 티스토리는 #dateHour·#dateMinute 두 칸뿐이고 날짜는 글자로만 보인다 (2026-10-03 실제 화면)
  const dateF = pool.find((f) => !isHour(f) && !isMin(f) && (/\d{4}\D{1,3}\d{1,2}\D{1,3}\d{1,2}/.test(f.value) || /date|day|날짜/.test(hint(f))));
  if (!hourF || !minF) return { ok: false, why: `예약 시·분 칸을 알아보지 못함 (시 ${!!hourF} / 분 ${!!minF}) — 로그의 '예약 칸' 줄로 고칩니다` };
  // 날짜를 칸이 아닌 글자로 보여 주는 화면: 시 칸에서 위로 올라가며 'YYYY.MM.DD' 같은 글자를 찾는다
  const dateText = async () => page.evaluate((hi) => {
    const pat = /(\d{4})\s*[.\-\/년]\s*(\d{1,2})\s*[.\-\/월]\s*(\d{1,2})/;
    let el = document.querySelector(`[data-sg-field="${hi}"]`);
    for (let k = 0; el && k < 6; k++, el = el.parentElement) {
      const txt = [el.innerText || '', ...[...el.querySelectorAll('input')].map((x) => x.value || '')].join(' ');
      const m = pat.exec(txt);
      if (m) return { found: m[0], around: txt.replace(/\s+/g, ' ').slice(0, 160) };
    }
    let top = document.querySelector(`[data-sg-field="${hi}"]`);
    while (top && top.parentElement && (top.innerText || '').trim().length < 20) top = top.parentElement;
    return { found: '', around: (top?.innerText || '').replace(/\s+/g, ' ').slice(0, 200) };
  }, hourF.i);

  const loc = (f) => page.locator(`[data-sg-field="${f.i}"]`).first(); // 마지막으로 읽은 칸 번호 (after)
  // 시·분 넣기 (select 면 고르고, 입력칸이면 지우고 친다)
  for (const [f, v, label] of [[hourF, at.hh, '시'], [minF, at.mm, '분']]) {
    const l = loc(f);
    try {
      if (f.tag === 'select') await l.selectOption(v).catch(() => l.selectOption(String(+v)));
      else { await l.fill(''); await l.type(v, { delay: 30 }); await l.press('Tab').catch(() => {}); }
    } catch (e) { return { ok: false, why: `${label} 칸에 넣지 못함 — ${e.message.split('\n')[0]}` }; }
    await sleep(300);
  }
  // 날짜: 오늘이어야 한다. 비었거나 다르면 입력칸일 때만 직접 넣는다 (달력은 건드리지 않는다)
  const ymdOk = (txt) => { const n = (txt.match(/\d+/g) || []).map(Number); const q = `,${n.join(',')},`; return q.includes(`,${at.y},${at.mo},${at.d},`) || q.includes(`,${at.y % 100},${at.mo},${at.d},`); };
  let dateVal = '';
  if (dateF) dateVal = await loc(dateF).inputValue().catch(() => '');
  else {
    const d = await dateText();
    dateVal = d.found;
    log(`날짜 글자: "${d.found}"${d.found ? '' : ` (못 찾음 — 주변 글자: ${d.around})`}`);
  }
  if (dateF && !ymdOk(dateVal) && !dateF.ro && dateF.tag === 'input') {
    const sep = (dateF.value.match(/\d{4}(\D+)\d/) || [, '-'])[1];
    await loc(dateF).fill(`${at.y}${sep}${String(at.mo).padStart(2, '0')}${sep}${String(at.d).padStart(2, '0')}`).catch(() => {});
    dateVal = await loc(dateF).inputValue().catch(() => '');
  }
  // 다시 읽어 확인
  const hv = await loc(hourF).inputValue().catch(() => '');
  const mv = await loc(minF).inputValue().catch(() => '');
  log(`확인: 날짜 "${dateVal}" · 시 "${hv}" · 분 "${mv}"`);
  if (!ymdOk(dateVal)) return { ok: false, why: `예약 날짜가 오늘(${at.y}-${at.mo}-${at.d})로 읽히지 않음 ("${dateVal}")` };
  if (String(+hv) !== String(+at.hh)) return { ok: false, why: `시가 ${at.hh} 대신 "${hv}"` };
  if (String(+mv) !== String(+at.mm)) return { ok: false, why: `분이 ${at.mm} 대신 "${mv}"` };
  await dump(page, 'reserve-ready');

  step(`9. 예약발행 (공개·예약·날짜·시·분 확인됨)`);
  const { loc: pubBtn } = await findFirst(page, SEL.publishBtn, { timeout: 4000 }).catch(() => ({}));
  if (!pubBtn) return { ok: false, why: '발행 버튼을 찾지 못함' };
  const pubLabel = (await pubBtn.innerText().catch(() => '')).trim();
  log(`발행 버튼 글자: "${pubLabel}"`);
  if (!/발행|예약/.test(pubLabel)) return { ok: false, why: `발행 버튼 글자가 "${pubLabel}"` };
  await pubBtn.click();
  await sleep(3500);
  await dump(page, 'reserved');
  return { ok: true, confirmed: !/manage\/newpost/.test(page.url()) };
}

// ---------------------------------------------------------------- main
async function main() {
  const args = parseArgs(process.argv);
  if (args.help) { console.log(USAGE); return; }
  if (!args.post) throw new Error('--post 가 필요합니다. --help 참고.');
  if ([args.saveDraft, args.dryRun, args.publishNow, args.reserve].filter(Boolean).length > 1) {
    throw new Error('--save-draft / --dry-run / --publish-now / --reserve 는 하나만 쓰세요.');
  }
  if (!args.url && !/^[a-z0-9-]+$/i.test(args.blog)) {
    throw new Error('블로그 이름이 필요합니다: --blog <이름> 또는 환경변수 TISTORY_BLOG (예: seonggeul → seonggeul.tistory.com)');
  }

  const post = JSON.parse(fs.readFileSync(args.post, 'utf8'));
  if (!post.title || !post.html || !Array.isArray(post.blocks)) {
    throw new Error(`${args.post}: title·html·blocks 가 필요합니다. build-tistory.mjs 로 생성하세요.`);
  }
  // 예약: 오늘 날짜, 20분 뒤 이후만. 조건이 안 맞으면 멈추지 않고 임시저장으로 바꿔 글은 남긴다
  let at = null;
  if (args.reserve) {
    const when = args.at || post.publishAt;
    const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(when || '');
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const why = !m ? `예약 시각이 없거나 형식이 다름 ("${when || ''}")`
      : `${m[1]}-${m[2]}-${m[3]}` !== today ? `예약 날짜(${m[1]}-${m[2]}-${m[3]})가 오늘(${today})이 아님`
      : new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime() - Date.now() < 20 * 60000 ? `예약 시각(${when})까지 20분이 안 남음` : '';
    if (why) { warn(`${why} — 예약하지 않고 임시저장만 합니다.`); args.reserve = false; args.saveDraft = true; args.reserveSkipped = why; }
    else at = { y: +m[1], mo: +m[2], d: +m[3], hh: m[4], mm: m[5], text: when };
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
  // 그림 8장은 지킨다 (2026-10-03 사용자 지시 — 그림이 빠진 채 '[이미지 N]' 글자로 예약됐다). 하나라도 없으면 예약하지 않는다
  if (args.reserve) {
    const have = new Set(imageFiles.map((x) => x.n));
    const lack = imageBlocks.filter((b) => !have.has(b.n)).map((b) => b.n);
    if (lack.length) throw new Error(`그림 ${lack.join(', ')}번 파일이 없어 예약하지 않습니다 (그림을 모두 넣어야 예약). 먼저 post-images.mjs 로 만드세요.`);
  }

  if (args.dump) {
    dumpDir = path.join('dumps', new Date().toISOString().replace(/[:.]/g, '-'));
    fs.mkdirSync(dumpDir, { recursive: true });
  }

  const mode = args.reserve ? `예약발행 (${at.text}, 확인 후에만)`
    : args.saveDraft ? '임시저장 (발행 안 함)'
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
    if (d.type() === 'confirm' && /HTML|모드|전환/.test(msg)) {
      if (allowModeSwitch) { log(`확인창 수락: ${msg}`); await d.accept().catch(() => {}); }
      else { warn(`모드 전환 확인창을 거절했어요 (본문을 지키려고): ${msg}`); await d.dismiss().catch(() => {}); }
    }
    else { log(`확인창 거절: [${d.type()}] ${msg}`); await d.dismiss().catch(() => {}); }
  });

  try {
    step('2. 글쓰기 페이지 열기');
    await page.goto(args.url || `https://${args.blog}.tistory.com/manage/newpost/?type=post`, { waitUntil: 'domcontentloaded' });
    await sleep(args.url ? 500 : 3000);
    if (!args.url && /auth\/login|accounts\.kakao\.com|\/login/.test(page.url())) {
      // 2026-10-05: 카카오 로그인이 살아 있으면 버튼 하나로 돌아온다 — 사람을 부르기 전에 먼저 해 본다
      const re = await tistoryRelogin(page, `https://${args.blog}.tistory.com/manage/newpost/?type=post`, log);
      if (!re.ok) throw new Error(`로그인 화면으로 갔습니다. 9222 크롬 창에서 티스토리(카카오)에 로그인돼 있는지 확인하세요.\n${re.why}\n현재 URL: ${page.url()}`);
    }
    log(`URL: ${page.url()}`);
    await dump(page, 'opened');

    step('3. 제목');
    const title = await findFirst(page, SEL.title, { timeout: 15000 });
    await title.loc.fill(post.title);
    const gotTitle = (await title.loc.inputValue()).trim();
    if (gotTitle !== post.title) throw new Error(`제목이 다르게 들어갔습니다: "${gotTitle}"`);
    log(post.title);

    let tagsDone = false;
    step('3-1. 카테고리·태그 (본문보다 먼저)');
    // 티스토리 카테고리는 생활보장·생활정보 두 개만 쓴다 (2026-10-05 사용자 지시). 보험 글은 생활보장, 나머지(맛집·카페 포함)는 생활정보
    if (post.category) post.category = /보험|생활보장/.test(`${post.category} ${post.title}`) ? '생활보장' : '생활정보';
    if (post.category) {
      try { await pickCategory(page, post.category); log(`카테고리: ${post.category}`); }
      catch (e) { warn(`카테고리 선택 실패 (${e.message.split('\n')[0]}) — 저장 후 직접 고르세요.`); }
    }
    if (args.tags && post.tags?.length) {
      try { await enterTags(page, post.tags); tagsDone = true; }
      catch (e) { warn(`태그 입력 실패 (${e.message.split('\n')[0]}) — 본문을 넣은 뒤 한 번 더 해 봅니다.`); }
    }
    await dump(page, 'filled');

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
      if (uploaded.length) await waitUploadsDone(page);
      await dump(page, 'images-uploaded');
      if (uploaded.length) {
        const blocks = await imageBlocksInEditor(page);
        if (blocks.length !== uploaded.length) {
          warn(`에디터의 그림 ${blocks.length}개 / 올린 그림 ${uploaded.length}장 — 수가 달라 사진은 넣지 않고 글만 넣습니다.`);
          missingImages.push(...uploaded.map((u) => u.n)); uploaded = [];
        } else {
          uploaded.forEach((u, i) => {
            const re = new RegExp(`<p data-ke-size="size16">\\[이미지 ${u.n}\\][^<]*</p>`);
            // 구글 이미지 검색용 대체텍스트: 원고 [이미지 N] 설명 (대표사진 표시는 뺀다)
            const desc = (imageBlocks.find((b) => b.n === u.n)?.lines?.[0]?.t || '').replace(/\s*\(대표사진\)\s*$/, '').replace(/"/g, '');
            const block = desc ? blocks[i].replace(/<img\b([^>]*?)\salt="[^"]*"/i, '<img$1').replace(/<img\b/i, `<img alt="${desc}"`) : blocks[i];
            finalHtml = finalHtml.replace(re, () => block);
          });
          want = textOf(finalHtml.replace(/<img[^>]*>/g, ''));
        }
      }
      for (const b of imageBlocks) if (!imageFiles.some((f) => f.n === b.n) && !missingImages.includes(b.n)) missingImages.push(b.n);
    }

    step('4. 본문 (기본 에디터에 통째로)');
    await findFirst(page, SEL.editorIfr, { timeout: 15000 }).catch(() => {});
    if (uploaded.length) await waitUploadsDone(page);
    const r = await bodyByTinymce(page, finalHtml);
    await sleep(1000);
    const problem = r.ok ? checkBody(await readBack(page), post, want.length, uploaded.length) : r.why;
    if (!problem) log('기본 에디터(TinyMCE)로 넣음');
    await dump(page, 'body');
    if (problem) {
      throw new Error(`본문이 원고대로 들어가지 않아 저장하지 않습니다 (${problem}).\n`
        + `손으로 하려면 HTML 모드에 ${args.post.replace(/\.json$/, '.html')} 내용을 붙여넣으세요.`);
    }
    const back = await readBack(page);
    log(`확인: H2 ${back.h2.length}개 · 색 강조 ${back.styled}곳 · 그림 ${back.images}장 · ${squash(back.text).length}자 (${back.via})`);
    if (missingImages.length) warn(`사진을 넣지 못한 자리: ${[...new Set(missingImages)].sort((a, b) => a - b).join(', ')}번 — 표시 문단으로 남겼어요.`);


    if (!args.saveDraft && !args.dryRun && !args.publishNow && !args.reserve) {
      console.log('\n✅ 본문까지 넣었습니다. 저장·발행은 하지 않았습니다 (탭은 열어둡니다).');
      return;
    }

    // 태그를 처음에 넣지 못했으면 한 번 더 (본문 확인은 바로 아래에서 다시 한다)
    if (args.tags && post.tags?.length && !tagsDone) {
      step('5. 태그 다시 넣기');
      try { await enterTags(page, post.tags); }
      catch (e) { warn(`태그 입력 실패 (${e.message.split('\n')[0]}) — 저장 후 직접 넣으세요.`); }
    }

    // 저장 직전 마지막 확인: 카테고리·태그를 넣는 사이에 본문이 바뀌지 않았는지 다시 읽는다
    const beforeSave = await readBack(page);
    const lost = checkBody(beforeSave, post, want.length, uploaded.length);
    if (lost) {
      await dump(page, 'body-changed');
      throw new Error(`저장 직전에 본문이 달라져 저장하지 않습니다 (${lost}). 글쓰기 탭은 그대로 두었어요.`);
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
      if (args.reserveSkipped) { console.log(`   (예약하지 않은 이유: ${args.reserveSkipped})`); process.exitCode = 2; }
      log('글쓰기 화면 아래 "임시저장" 옆 숫자를 누르면 목록에서 볼 수 있어요.');
      return;
    }

    step('7. 발행 패널 열기 (완료)');
    try { await clickFirst(page, SEL.complete, { timeout: 6000 }); }
    catch (e) {
      if (!args.reserve) throw e;
      console.log(`\n⚠ 예약하지 않았습니다 (발행 패널을 열지 못함). 글은 임시저장에 남아 있어요.`);
      process.exitCode = 2; return;
    }
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

    if (args.reserve && missingImages.length) {
      await clickFirst(page, SEL.layerClose, { timeout: 4000 }).catch(() => {});
      console.log(`\n⚠ 예약하지 않았습니다 (사진 ${[...new Set(missingImages)].join(', ')}번을 올리지 못함 — 그림을 모두 넣어야 예약). 글은 임시저장에 남아 있어요.`);
      process.exitCode = 2;
      return;
    }
    if (args.reserve) {
      const r = await reservePublish(page, at);
      if (r.ok) { console.log(`\n✅ 예약발행 완료 — ${at.text}${r.confirmed ? '' : ' (화면이 그대로라 예약 목록에서 꼭 확인하세요)'}`); return; }
      await dump(page, 'reserve-stop');
      await clickFirst(page, SEL.layerClose, { timeout: 4000 }).catch(() => {});
      console.log(`\n⚠ 예약하지 않았습니다 (${r.why}). 글은 임시저장에 남아 있어요.`);
      process.exitCode = 2;
      return;
    }

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
