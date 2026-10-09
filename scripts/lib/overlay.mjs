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
 *
 * 대표사진 카드 틀 (2026-10-09 대표사진 시험 결론 — 10/12 원고부터 네이버 하루 2편):
 *   계획서 1번에 "frame": "card" → 진한 남색 카드 + 가운데 사진 칸(1번 그림 그대로) + 위 질문형 제목 두 줄
 *   (메인 키워드만 노란 글씨, 나머지 흰 글씨) + 아래 분류 표시(생활정보·생활보장)와 '성글벙글'.
 *   overlay 에 key(메인 키워드)·category 를 post-images.mjs 가 원고에서 채워 넣는다.
 *
 * 정보 카드 (2026-10-02 사용자 결정 — 10/12 원고부터 글 1편 8장 중 2~3장): renderCards()
 *   그림 없이 글자만으로 그린다 (OpenAI 를 부르지 않는다 — 비용 0).
 *   { type: "steps",   title, items: ["물기 닦기", ...] }                 ①②③ 단계
 *   { type: "check",   title, items: ["고무패킹 곰팡이", ...] }            ✔ 확인 목록
 *   { type: "compare", title, heads: ["되는 경우", "안 되는 경우"], items: [["왼쪽", "오른쪽"], ...] }
 *   카드 글자는 원고 본문에 있는 말 그대로 쓴다 (lint-post 가 확인). 돈·통화기호는 쓰지 않는다.
 */
import fs from 'node:fs';
// playwright 는 그릴 때만 불러온다 — lint-post 가 checkCard 만 쓰는데, `검사`(GitHub Actions)는 npm install 없이 돌아서
// 맨 위에서 불러오면 원고 검사가 통째로 멈췄다 (2026-10-09 밤).

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
  if (o.kind === 'thumb' && o.frame === 'card') return cardThumbHtml(imgDataUrl, S, o);
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

// ── 대표사진 카드 틀 ────────────────────────────────────────────
const NAVY = { bg: '#17243F', panel: '#22345A', yellow: '#FFD84D', white: '#FFFFFF', soft: '#C9D4EA' };

// 제목 줄에서 메인 키워드만 노란 글씨로. 키워드가 줄에 없으면 첫 줄 전체를 노랗게
function keyLine(line, key, first) {
  const k = String(key || '').trim();
  const at = k ? line.replace(/\s/g, '').indexOf(k.replace(/\s/g, '')) : -1;
  if (at < 0) return first && !k ? `<span class="y">${esc(line)}</span>` : esc(line);
  // 공백을 건너뛰며 원래 줄에서 키워드 자리를 찾는다
  let i = 0, n = 0, start = -1, end = -1;
  const want = k.replace(/\s/g, '').length;
  for (; i < line.length; i++) {
    if (/\s/.test(line[i])) continue;
    if (n === at) start = i;
    n++;
    if (n === at + want) { end = i + 1; break; }
  }
  return `${esc(line.slice(0, start))}<span class="y">${esc(line.slice(start, end))}</span>${esc(line.slice(end))}`;
}

function cardThumbHtml(imgDataUrl, S, o) {
  const tl = String(o.title).split('\n');
  const hasKey = tl.some((t) => o.key && t.replace(/\s/g, '').includes(String(o.key).replace(/\s/g, '')));
  const face = juaFace();
  const fam = face ? `"Jua",${STYLE.font}` : STYLE.font;
  const pad = S * 0.055;
  return `<!doctype html><meta charset="utf-8"><style>
    ${face}
    *{margin:0;box-sizing:border-box}
    body{width:${S}px;height:${S}px;position:relative;overflow:hidden;background:${NAVY.bg};font-family:${STYLE.font}}
    .top{position:absolute;left:${pad}px;right:${pad}px;top:${S * 0.04}px;height:${S * 0.27}px;display:flex;flex-direction:column;
      align-items:center;justify-content:center;text-align:center}
    .title{font-family:${fam};font-weight:${face ? 400 : 800};font-size:${S * 0.105}px;line-height:1.18;white-space:nowrap;color:${NAVY.white}}
    .y{color:${NAVY.yellow}}
    .photo{position:absolute;left:${pad}px;right:${pad}px;top:${S * 0.325}px;height:${S * 0.53}px;border-radius:${S * 0.035}px;
      overflow:hidden;border:${S * 0.008}px solid ${NAVY.panel};background:${NAVY.panel}}
    .photo img{width:100%;height:100%;object-fit:cover;object-position:center 85%;display:block}
    .foot{position:absolute;left:${pad}px;right:${pad}px;bottom:${S * 0.035}px;height:${S * 0.075}px;display:flex;
      align-items:center;justify-content:space-between}
    .cat{font-family:${fam};font-weight:${face ? 400 : 800};font-size:${S * 0.04}px;color:${NAVY.bg};background:${NAVY.yellow};
      border-radius:${S * 0.04}px;padding:${S * 0.01}px ${S * 0.03}px}
    .brand{font-family:${fam};font-weight:${face ? 400 : 800};font-size:${S * 0.042}px;color:${NAVY.soft};letter-spacing:.02em}
  </style><body>
    <div class="top">${tl.map((t, i) => `<div class="title">${keyLine(t, hasKey ? o.key : '', i === 0)}</div>`).join('')}</div>
    <div class="photo"><img src="${imgDataUrl}"></div>
    <div class="foot"><div class="cat">${esc(o.category || '생활정보')}</div><div class="brand">성글벙글</div></div>
  </body>`;
}

// ── 정보 카드 (그림 없이 글자만) ───────────────────────────────
// 돈·통화기호 금지 (보험 글 그림 규칙과 같다 — standards/이미지-기준.md)
const MONEY = /[₩$€¥￦]|\d[\d,.]*\s*(만\s*|천\s*|억\s*)?(원|달러)|지폐|동전/;
const CARD_TYPES = ['steps', 'check', 'compare'];

/** 카드 내용이 규칙에 맞는지 본다. 문제 목록(빈 배열이면 통과) */
export function checkCard(c) {
  const bad = [];
  if (!c || !CARD_TYPES.includes(c.type)) bad.push(`card.type 은 ${CARD_TYPES.join('/')} 중 하나`);
  if (!c?.title) bad.push('card.title 이 없음');
  const items = Array.isArray(c?.items) ? c.items : [];
  if (c?.type === 'compare') {
    if (items.length < 2 || items.length > 4) bad.push(`compare 줄은 2~4개 (지금 ${items.length})`);
    if (items.some((r) => !Array.isArray(r) || r.length !== 2)) bad.push('compare 의 items 는 ["왼쪽", "오른쪽"] 쌍');
    if (items.flat().some((t) => String(t).length > 12)) bad.push('compare 칸 글자는 12자 안쪽');
  } else {
    if (items.length < 3 || items.length > 5) bad.push(`${c?.type} 줄은 3~5개 (지금 ${items.length})`);
    if (items.some((t) => typeof t !== 'string' || t.length > 16)) bad.push('줄 글자는 16자 안쪽');
  }
  if (String(c?.title || '').length > 16) bad.push('card.title 은 16자 안쪽');
  const all = [c?.title, ...(c?.heads || []), ...items.flat()].join(' ');
  const m = MONEY.exec(all);
  if (m) bad.push(`돈·통화기호는 쓰지 않음: "${m[0]}"`);
  return bad;
}

function cardHtml(S, c) {
  const face = juaFace();
  const fam = face ? `"Jua",${STYLE.font}` : STYLE.font;
  const fw = face ? 400 : 800;
  const colors = [STYLE.apricot, STYLE.mint, STYLE.sky, '#E8D9F2', '#F7E3A8'];
  const n = c.items.length;
  let body = '';
  if (c.type === 'compare') {
    const [h1, h2] = c.heads?.length === 2 ? c.heads : ['이럴 땐 괜찮아요', '이럴 땐 피해요'];
    body = `<div class="cmp">
      <div class="ch ok">⭕ ${esc(h1)}</div><div class="ch no">❌ ${esc(h2)}</div>
      ${c.items.map(([a, b]) => `<div class="cc ok"><span class="fit">${esc(a)}</span></div><div class="cc no"><span class="fit">${esc(b)}</span></div>`).join('')}
    </div>`;
  } else {
    const mark = (i) => (c.type === 'steps' ? '①②③④⑤'[i] : '✔');
    body = `<div class="rows">${c.items.map((t, i) => `
      <div class="row"><div class="mk" style="background:${colors[i % colors.length]}">${mark(i)}</div><div class="tx"><span class="fit">${esc(t)}</span></div></div>`).join('')}</div>`;
  }
  const rowH = S * (n >= 5 ? 0.104 : 0.13);
  return `<!doctype html><meta charset="utf-8"><style>
    ${face}
    *{margin:0;box-sizing:border-box}
    body{width:${S}px;height:${S}px;position:relative;overflow:hidden;background:${STYLE.cream};color:${STYLE.ink};font-family:${STYLE.font}}
    .card{position:absolute;inset:${S * 0.045}px;background:#fff;border-radius:${S * 0.045}px;box-shadow:0 ${S * 0.01}px ${S * 0.03}px rgba(74,58,48,.12);
      padding:${S * 0.05}px ${S * 0.055}px;display:flex;flex-direction:column}
    .head{font-family:${fam};font-weight:${fw};font-size:${S * 0.075}px;line-height:1.2;white-space:nowrap;text-align:center;
      padding-bottom:${S * 0.03}px;margin-bottom:${S * 0.035}px;border-bottom:${S * 0.006}px dashed ${STYLE.apricot}}
    .rows{flex:1;display:flex;flex-direction:column;justify-content:center;gap:${S * 0.022}px}
    .row{display:flex;align-items:center;gap:${S * 0.03}px;height:${rowH}px;background:#FBF7F0;border-radius:${S * 0.03}px;padding:0 ${S * 0.03}px}
    .mk{flex:none;width:${S * 0.085}px;height:${S * 0.085}px;border-radius:50%;display:flex;align-items:center;justify-content:center;
      font-weight:800;font-size:${S * 0.05}px;color:${STYLE.ink}}
    .tx{flex:1;min-width:0;font-weight:800;font-size:${S * 0.052}px;white-space:nowrap;overflow:hidden}
    .cmp{flex:1;display:grid;grid-template-columns:1fr 1fr;gap:${S * 0.02}px;align-content:center}
    .ch{font-family:${fam};font-weight:${fw};font-size:${S * 0.05}px;text-align:center;padding:${S * 0.02}px 0;border-radius:${S * 0.025}px;white-space:nowrap}
    .ch.ok{background:${STYLE.mint}}.ch.no{background:${STYLE.apricot}}
    .cc{height:${S * 0.13}px;display:flex;align-items:center;justify-content:center;text-align:center;border-radius:${S * 0.025}px;
      font-weight:800;font-size:${S * 0.046}px;white-space:nowrap;overflow:hidden;padding:0 ${S * 0.015}px}
    .cc.ok{background:#EEF8F4}.cc.no{background:#FCEFE9}
    .brand{font-family:${fam};font-weight:${fw};text-align:right;font-size:${S * 0.032}px;color:#B49A86;margin-top:${S * 0.02}px}
  </style><body><div class="card">
    <div class="head"><span class="fit">${esc(c.title)}</span></div>
    ${body}
    <div class="brand">성글벙글</div>
  </div></body>`;
}

/** jobs: [{ dest, card, size }] — 그림 없이 카드만 그린다 */
export async function renderCards(jobs) {
  if (!jobs.length) return;
  const browser = await launch();
  try {
    for (const j of jobs) {
      const size = j.size || 1024;
      const page = await browser.newPage({ viewport: { width: size, height: size } });
      await page.setContent(cardHtml(size, j.card), { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      // 칸을 넘는 글자는 넘지 않을 때까지 줄인다
      await page.evaluate(() => {
        for (const el of document.querySelectorAll('.fit')) {
          const box = el.parentElement;
          let fs = parseFloat(getComputedStyle(box).fontSize);
          let guard = 40;
          while (el.offsetWidth > box.clientWidth - 4 && fs > 12 && guard--) { fs *= 0.95; box.style.fontSize = fs + 'px'; }
        }
      });
      await page.screenshot({ path: j.dest, type: 'png' });
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

async function launch() {
  const { chromium } = await import('playwright');
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
