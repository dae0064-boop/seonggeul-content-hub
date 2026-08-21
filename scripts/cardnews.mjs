#!/usr/bin/env node
/**
 * 카드뉴스 이미지를 만든다. 인스타그램 정사각(1080×1080) PNG.
 *
 *   node scripts/cardnews.mjs work/YYYY-MM-DD_원고/카드뉴스.json [출력폴더]
 *
 * 생성 모델을 쓰지 않는다. HTML을 그려서 캡처하므로 한글이 정확하게 나온다.
 * 폰트는 구글 폰트에서 받아 쓴다.
 *
 * 카드 종류: cover · statement · list · steps · outro
 * 제목 안에서 *별표* 로 감싼 부분은 강조색으로 칠해진다.
 */

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
// playwright 는 전역에 설치되어 있을 수 있다. 지역에서 못 찾으면 전역에서 찾는다.
const { chromium } = await (async () => {
  const paths = [
    "playwright",
    "/opt/node22/lib/node_modules/playwright/index.js",
    "/usr/lib/node_modules/playwright/index.js",
  ];
  for (const p of paths) {
    try {
      const mod = await import(p);
      // 전역 경로로 직접 부르면 CommonJS 라 이름 있는 내보내기가 default 아래에 온다
      const api = mod.chromium ? mod : mod.default;
      if (api?.chromium) return api;
    } catch {}
  }
  console.error(
    "playwright 를 찾지 못했습니다. 다음 중 하나를 실행하세요:\n" +
    "  npm install playwright   (브라우저는 이미 설치되어 있습니다)"
  );
  process.exit(1);
})();

const SIZE = 1080;

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// *강조* 처리 후 줄바꿈을 <br> 로
const rich = (s) =>
  esc(s)
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n/g, "<br>");

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&family=IBM+Plex+Sans+KR:wght@300;400;500;600&family=IBM+Plex+Mono:wght@500&display=swap');

  :root {
    --ground:  #10201A;
    --panel:   #172C24;
    --paper:   #F4F2EA;
    --muted:   #93A89A;
    --accent:  #F2C14E;
    --no:      #E88370;
    --yes:     #8ED3A8;
    --display: "Gowun Batang", serif;
    --body:    "IBM Plex Sans KR", sans-serif;
    --mono:    "IBM Plex Mono", monospace;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    width: ${SIZE}px; height: ${SIZE}px;
    background: var(--ground);
    color: var(--paper);
    font-family: var(--body);
    -webkit-font-smoothing: antialiased;
  }

  .card {
    width: ${SIZE}px; height: ${SIZE}px;
    padding: 92px 88px 78px;
    display: flex; flex-direction: column;
    position: relative; overflow: hidden;
  }

  /* 내용은 위아래 가운데로 모은다. 피드에서 무게중심이 가운데여야 한다 */
  .content {
    flex: 1; min-height: 0;
    display: flex; flex-direction: column; justify-content: center;
  }
  .card--cover .content { justify-content: flex-end; padding-bottom: 30px; }

  /* 왼쪽 위에서 아래로 흐르는 얇은 기준선 */
  .card::before {
    content: ""; position: absolute;
    left: 88px; top: 0; width: 3px; height: 62px;
    background: var(--accent);
  }

  .kicker {
    font-family: var(--body); font-weight: 500;
    font-size: 32px; letter-spacing: .04em;
    color: var(--accent);
    margin-bottom: 30px;
  }

  h1 {
    font-family: var(--display); font-weight: 700;
    font-size: 96px; line-height: 1.28;
    letter-spacing: -.01em;
  }
  h1 em { font-style: normal; color: var(--accent); }
  .card--cover h1 { font-size: 112px; }
  .card--outro h1 { font-size: 100px; }

  .body {
    font-size: 38px; line-height: 1.62; font-weight: 300;
    color: var(--muted); margin-top: 40px; max-width: 780px;
  }

  .spacer { flex: 1; }

  ul { list-style: none; margin-top: 50px; }
  li {
    font-size: 44px; line-height: 1.45; font-weight: 400;
    padding: 22px 0 22px 54px; position: relative;
    border-bottom: 1px solid rgba(244,242,234,.10);
  }
  li:last-child { border-bottom: 0; }
  li::before {
    position: absolute; left: 0; top: 22px;
    font-family: var(--mono); font-size: 34px;
    color: var(--mark, var(--accent));
  }
  .tone-neutral li::before { content: "—"; }
  .tone-no  { --mark: var(--no); }
  .tone-no  li::before { content: "✕"; }
  .tone-yes { --mark: var(--yes); }
  .tone-yes li::before { content: "✓"; }

  ol { list-style: none; counter-reset: s; margin-top: 50px; }
  ol li { counter-increment: s; padding-left: 78px; }
  ol li::before {
    content: counter(s);
    font-family: var(--mono); font-size: 30px; font-weight: 500;
    color: var(--ground); background: var(--accent);
    width: 46px; height: 46px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    top: 24px;
  }

  .note {
    font-size: 30px; line-height: 1.5; color: var(--muted);
    margin-top: 40px; padding-left: 24px;
    border-left: 3px solid rgba(242,193,78,.45);
  }

  footer {
    display: flex; align-items: baseline; justify-content: space-between;
    margin-top: 46px; padding-top: 30px;
    border-top: 1px solid rgba(244,242,234,.13);
    font-family: var(--mono); font-size: 26px; color: var(--muted);
  }
  footer .brand { font-family: var(--body); font-weight: 500; color: var(--paper); font-size: 28px; }

  .swipe {
    margin-top: 40px; font-family: var(--body); font-weight: 400;
    font-size: 30px; color: var(--paper); opacity: .72; letter-spacing: .02em;
  }

  /* 표지와 마무리는 색을 반전해 시선을 잡는다 */
  .card--cover { background: var(--panel); }
  .card--outro { background: var(--panel); }
  .card--outro h1 em { color: var(--accent); }
`;

function renderCard(c, i, total, meta) {
  const foot = `<footer><span class="brand">${esc(meta.brand)}</span><span>${i + 1} / ${total}</span></footer>`;

  if (c.type === "cover") {
    return `<div class="card card--cover">
      <div class="content">
        <p class="kicker">${esc(c.kicker || meta.topic || "")}</p>
        <h1>${rich(c.title)}</h1>
        ${c.note ? `<p class="swipe">${esc(c.note)} →</p>` : ""}
      </div>${foot}</div>`;
  }
  if (c.type === "outro") {
    return `<div class="card card--outro">
      <div class="content">
        <h1>${rich(c.title)}</h1>
        ${c.note ? `<p class="body">${rich(c.note)}</p>` : ""}
      </div>${foot}</div>`;
  }
  if (c.type === "steps") {
    return `<div class="card">
      <div class="content">
        <h1>${rich(c.title)}</h1>
        <ol>${c.items.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>
        ${c.note ? `<p class="note">${rich(c.note)}</p>` : ""}
      </div>${foot}</div>`;
  }
  if (c.type === "list") {
    return `<div class="card">
      <div class="content">
        <h1>${rich(c.title)}</h1>
        <ul class="tone-${c.tone || "neutral"}">${c.items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
        ${c.note ? `<p class="note">${rich(c.note)}</p>` : ""}
      </div>${foot}</div>`;
  }
  // statement
  return `<div class="card">
    <div class="content">
      <h1>${rich(c.title)}</h1>
      ${c.body ? `<p class="body">${rich(c.body)}</p>` : ""}
    </div>${foot}</div>`;
}

// ---------------------------------------------------------------- 실행

const specPath = process.argv[2];
if (!specPath) {
  console.error("사용법: node scripts/cardnews.mjs <카드뉴스.json> [출력폴더]");
  process.exit(2);
}
const spec = JSON.parse(readFileSync(specPath, "utf8"));
const outDir = process.argv[3] || join(dirname(specPath), "카드뉴스");
mkdirSync(outDir, { recursive: true });

const total = spec.cards.length;
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: SIZE, height: SIZE },
  deviceScaleFactor: 1,
});

const files = [];
for (let i = 0; i < total; i++) {
  const html = `<!doctype html><meta charset="utf-8"><style>${CSS}</style>${renderCard(
    spec.cards[i], i, total, spec
  )}`;
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const name = `${String(i + 1).padStart(2, "0")}.png`;
  await page.screenshot({ path: join(outDir, name) });
  files.push(name);
  console.log(`  ${name}  ${spec.cards[i].title.replace(/[*\n]/g, " ").trim()}`);
}

// 한눈에 보는 미리보기 한 장
const cols = Math.min(4, total);
const rows = Math.ceil(total / cols);
const cell = 340;
const sheet = `<!doctype html><meta charset="utf-8">
<style>body{margin:0;background:#0B140F;display:grid;
grid-template-columns:repeat(${cols},${cell}px);gap:16px;padding:16px;width:max-content}
img{width:${cell}px;height:${cell}px;display:block;border-radius:6px}</style>
${files.map((f) => `<img src="${f}">`).join("")}`;
writeFileSync(join(outDir, "_미리보기.html"), sheet, "utf8");
await page.setViewportSize({
  width: cols * cell + (cols - 1) * 16 + 32,
  height: rows * cell + (rows - 1) * 16 + 32,
});
await page.goto("file://" + join(process.cwd(), outDir, "_미리보기.html"));
await page.waitForTimeout(300);
await page.screenshot({ path: join(outDir, "_미리보기.png") });

await browser.close();
console.log(`\n${total}장 완성 → ${outDir}`);
