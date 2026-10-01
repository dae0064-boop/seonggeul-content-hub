/**
 * 그림 위에 한글 글씨를 얹는다.
 *
 * 그림 모델은 한글을 자주 깨뜨리고 날짜·숫자를 틀리게 그린다. 그래서 그림은 글씨 없이 만들고,
 * 제목·날짜 같은 글씨는 여기서 정확한 글꼴(맑은 고딕)로 따로 얹는다.
 * 렌더링은 PC 에 깔린 크롬을 화면 없이(headless) 잠깐 띄워 HTML 로 그린 뒤 캡처한다.
 * 자동화용 크롬(9222)과는 별개로 뜨고, 끝나면 바로 닫힌다.
 *
 * overlay 종류 (계획서 images[].overlay)
 *   { kind: "thumb", title: "줄1\n줄2", tag: "작은 주제 꼬리표" }   대표사진 — 위쪽 3분의 1에 제목
 *   { kind: "label", text: "한 줄 문구", pos: "bottom" | "top" }    본문 — 띠 하나
 *   { kind: "steps", items: [["75세 이상", "10월 12일"], ...] }      본문 — 아래쪽 칸 나눔 표
 */
import fs from 'node:fs';
import { chromium } from 'playwright';

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
  if (o.kind === 'thumb') {
    const n = String(o.title).split('\n').length;
    const fs1 = Math.round(S * (n > 2 ? 0.078 : 0.094));
    layer = `
      <div class="thumb">
        ${o.tag ? `<div class="tag">${esc(o.tag)}</div>` : ''}
        <div class="title" style="font-size:${fs1}px">${lines(o.title)}</div>
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
    *{margin:0;box-sizing:border-box}
    body{width:${S}px;height:${S}px;position:relative;overflow:hidden;font-family:${STYLE.font};color:${STYLE.ink}}
    img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
    .thumb{position:absolute;left:0;right:0;top:${S * 0.05}px;height:${S * 0.3}px;display:flex;flex-direction:column;
      align-items:center;justify-content:center;gap:${S * 0.018}px;padding:0 ${S * 0.06}px;text-align:center}
    .title{font-weight:800;line-height:1.22;letter-spacing:-0.02em;white-space:nowrap;
      text-shadow:0 0 ${S * 0.006}px #fff,0 0 ${S * 0.006}px #fff,0 0 ${S * 0.012}px #fff,0 0 ${S * 0.02}px #fff;
      -webkit-text-stroke:${S * 0.003}px #fff;paint-order:stroke fill}
    .tag{font-weight:700;font-size:${S * 0.036}px;background:${STYLE.red};color:#fff;border-radius:999px;
      padding:${S * 0.01}px ${S * 0.03}px;box-shadow:0 ${S * 0.004}px ${S * 0.012}px rgba(0,0,0,.12)}
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
          const over = () => isTitle ? el.scrollWidth > el.parentElement.clientWidth * 0.92 : el.scrollWidth > el.clientWidth + 1;
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
