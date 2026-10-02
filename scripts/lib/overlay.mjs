/**
 * 그림 위에 한글 글씨를 얹는다.
 *
 * 그림 모델은 한글을 자주 깨뜨리고 날짜·숫자를 틀리게 그린다. 그래서 그림은 글씨 없이 만들고,
 * 제목·날짜 같은 글씨는 여기서 정확한 글꼴(맑은 고딕)로 따로 얹는다.
 * 렌더링은 PC 에 깔린 크롬을 화면 없이(headless) 잠깐 띄워 HTML 로 그린 뒤 캡처한다.
 * 자동화용 크롬(9222)과는 별개로 뜨고, 끝나면 바로 닫힌다.
 *
 * overlay 종류 (계획서 images[].overlay)
 *   { kind: "thumb", title: "줄1\n줄2" }   대표사진 — 위쪽 3분의 1에 제목
 *       2026-10-02 사용자 선택 "① 둥근 글씨 + 형광펜": 주아체로 크게, 첫 줄(메인 키워드)에 노란 형광펜.
 *       글꼴은 scripts/lib/fonts 에 넣어 둔 것을 쓴다 (PC 마다 깔린 글꼴이 달라도 똑같이 나온다).
 *       한 줄이 길면 글씨가 줄어든다 — 한 줄 10자 안쪽으로 쓴다. tag(숫자 꼬리표)는 그리지 않는다.
 *   { kind: "label", text: "한 줄 문구", pos: "bottom" | "top" }    본문 — 띠 하나
 *   { kind: "steps", items: [["75세 이상", "10월 12일"], ...] }      본문 — 아래쪽 칸 나눔 표
 */
import fs from 'node:fs';
import { chromium } from 'playwright';

// 대표사진 제목 글꼴: 주아체(둥근 글씨, SIL OFL — scripts/lib/fonts/Jua-OFL.txt).
// 파일이 없으면 맑은 고딕으로 그린다 (그림은 나오되 덜 눈에 띈다)
const JUA = new URL('./fonts/Jua-Regular.ttf', import.meta.url);
let juaCache;
const juaFace = () => {
  if (juaCache === undefined) {
    try { juaCache = `@font-face{font-family:"Jua";src:url(data:font/ttf;base64,${fs.readFileSync(JUA).toString('base64')}) format("truetype")}`; }
    catch { juaCache = ''; }
  }
  return juaCache;
};

const STYLE = {
  font: '"Malgun Gothic","맑은 고딕","Apple SD Gothic Neo","Noto Sans CJK KR","Noto Sans KR",sans-serif',
  ink: '#4A3A30',
  cream: '#F6EFE3',
  apricot: '#F2B8A0',
  mint: '#A8D8C8',
  sky: '#A9C8E8',
  red: '#E0453A',
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const lines = (s) => String(s).split('\n').map(esc).join('<br>');

function html(imgDataUrl, size, o) {
  const S = size;
  let layer = '';
  let face = '';
  let thumbFamily = STYLE.font;
  if (o.kind === 'thumb') {
    const tl = String(o.title).split('\n');
    const fs1 = Math.round(S * (tl.length > 2 ? 0.105 : 0.15));
    face = juaFace();
    if (face) thumbFamily = `"Jua",${STYLE.font}`;
    // 줄마다 따로 그려서 줄마다 칸에 맞게 줄인다. 첫 줄 = 메인 키워드 = 형광펜
    layer = `
      <div class="thumb">
        ${tl.map((t, i) => `<div class="title${i === 0 ? ' key' : ''}" style="font-size:${fs1}px">${esc(t)}</div>`).join('')}
      </div>`;
  } else if (o.kind === 'label') {
    layer = `<div class="label ${o.pos === 'top' ? 'top' : 'bottom'}">${lines(o.text)}</div>`;
  } else if (o.kind === 'steps') {
    const colors = [STYLE.apricot, STYLE.mint, STYLE.sky, STYLE.cream];
    layer = `<div class="steps">${o.items.map(([a, b], i) => `
      <div class="step" style="background:${colors[i % colors.length]}">
        <div class="a">${esc(a)}</div><div class="b">${esc(b)}</div>
      </div>`).join('')}</div>`;
  }
  return `<!doctype html><meta charset="utf-8"><style>
    ${face}
    *{margin:0;box-sizing:border-box}
    body{width:${S}px;height:${S}px;position:relative;overflow:hidden;font-family:${STYLE.font};color:${STYLE.ink}}
    img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
    .thumb{position:absolute;left:0;right:0;top:${S * 0.02}px;height:${S * 0.34}px;display:flex;flex-direction:column;
      align-items:center;justify-content:center;padding:0 ${S * 0.04}px;text-align:center;z-index:1}
    .title{font-family:${thumbFamily};font-weight:${face ? 400 : 800};line-height:1.16;white-space:nowrap;
      position:relative;z-index:1;color:#3A2A22;
      -webkit-text-stroke:${S * 0.022}px #fff;paint-order:stroke fill}
    .title.key:before{content:"";position:absolute;left:-${S * 0.015}px;right:-${S * 0.015}px;bottom:8%;height:48%;
      background:#FFE14D;border-radius:${S * 0.012}px;z-index:-1}
    .label{position:absolute;left:${S * 0.05}px;right:${S * 0.05}px;text-align:center;font-weight:800;
      font-size:${S * 0.05}px;line-height:1.3;white-space:nowrap;overflow:hidden;background:rgba(255,255,255,.92);border-radius:${S * 0.03}px;
      padding:${S * 0.022}px ${S * 0.03}px;box-shadow:0 ${S * 0.006}px ${S * 0.02}px rgba(0,0,0,.12)}
    .label.bottom{bottom:${S * 0.05}px}.label.top{top:${S * 0.05}px}
    .steps{position:absolute;left:${S * 0.04}px;right:${S * 0.04}px;bottom:${S * 0.045}px;display:flex;gap:${S * 0.02}px}
    .step{flex:1;border-radius:${S * 0.028}px;padding:${S * 0.02}px ${S * 0.01}px;text-align:center;
      box-shadow:0 ${S * 0.006}px ${S * 0.018}px rgba(0,0,0,.14);border:${S * 0.004}px solid rgba(255,255,255,.9)}
    .step .a{font-weight:700;font-size:${S * 0.036}px;white-space:nowrap;overflow:hidden}
    .step .b{font-weight:800;font-size:${S * 0.05}px;margin-top:${S * 0.004}px;white-space:nowrap;overflow:hidden}
  </style><body><img src="${imgDataUrl}">${layer}</body>`;
}

async function launch() {
  const tries = [
    () => chromium.launch({ channel: 'chrome', headless: true }),
    () => chromium.launch({ channel: 'msedge', headless: true }),
    () => chromium.launch({ headless: true }),
    // 크롬이 없는 환경(클라우드 컨테이너 등)에서 미리보기를 낼 때: OVERLAY_CHROME=<크롬 실행 파일>
    () => chromium.launch({ headless: true, executablePath: process.env.OVERLAY_CHROME, args: ['--no-sandbox'] }),
  ];
  let last;
  for (const t of tries) { try { return await t(); } catch (e) { last = e; } }
  throw new Error(`글씨를 얹을 브라우저를 띄우지 못했어요 (크롬이 설치돼 있어야 해요): ${last?.message?.split('\n')[0]}`);
}

/** jobs: [{ src, dest, overlay, size }] */
export async function renderOverlays(jobs) {
  if (!jobs.length) return;
  const browser = await launch();
  try {
    for (const j of jobs) {
      const size = j.size || 1024;
      const page = await browser.newPage({ viewport: { width: size, height: size } });
      const data = `data:image/png;base64,${fs.readFileSync(j.src).toString('base64')}`;
      await page.setContent(html(data, size, j.overlay), { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      // 글씨가 칸을 넘으면 넘지 않을 때까지 줄인다 (줄바꿈으로 "챙기나 / 요?" 처럼 끊기지 않게)
      await page.evaluate(() => {
        for (const el of document.querySelectorAll('.title, .label, .step .a, .step .b')) {
          const isTitle = el.classList.contains('title');
          const over = () => isTitle ? el.scrollWidth > el.parentElement.clientWidth * 0.9 : el.scrollWidth > el.clientWidth + 1;
          let fs = parseFloat(getComputedStyle(el).fontSize);
          let guard = 40;
          while (over() && fs > 12 && guard--) { fs *= 0.95; el.style.fontSize = fs + 'px'; }
        }
      });
      await page.screenshot({ path: j.dest, type: 'png' });
      await page.close();
    }
  } finally {
    await browser.close();
  }
}
