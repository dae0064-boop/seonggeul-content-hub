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
 *   대표사진 모양 look (2026-10-26 사용자 — "더 눈에 띄는 방식" 시험. 없으면 위 ① 둥근 글씨 + 형광펜):
 *     look "band"  사진 위쪽에 진한 남색 그러데이션 띠 + 굵은 고딕 흰 글씨, 메인 키워드(첫 줄)는 노란 글씨
 *     look "frame" 사진 둘레에 진한 남색 테두리 + 위쪽 흰 글상자에 남색 굵은 글씨, 첫 줄에 노란 형광펜
 *     theme "forest" 등 (standards/image-style.json thumb_themes) — 띠·테두리 색과 첫 줄 글씨 색. 없으면 남색
 *     font "jua" (둥근 글씨) | "ptd" (굵은 고딕, 기본) — 2026-10-26 사용자: 대표사진마다 색·글씨가 같아 보이지 않게
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
  if (o.kind === 'thumb' && (o.look === 'band' || o.look === 'frame')) return lookThumbHtml(imgDataUrl, S, o);
  if (o.kind === 'thumb' && o.look === 'news') return newsThumbHtml(imgDataUrl, S, o);
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
    <div class="foot"><div class="cat">${esc(o.category || '생활정보')}</div><div class="brand">${esc(o.brand || '성글벙글')}</div></div>
  </body>`;
}

// ── 대표사진 모양 band·frame (2026-10-26 시험) ─────────────────
// 굵은 고딕: 프리텐다드 Bold (SIL OFL — scripts/threads/fonts/Pretendard-LICENSE.txt). 없으면 맑은 고딕
const PRETENDARD = new URL('../threads/fonts/Pretendard-Bold.otf', import.meta.url);
let ptdCache;
const ptdFace = () => {
  if (ptdCache === undefined) {
    try { ptdCache = `@font-face{font-family:"PTD";src:url(data:font/otf;base64,${fs.readFileSync(PRETENDARD).toString('base64')}) format("opentype")}`; }
    catch { ptdCache = ''; }
  }
  return ptdCache;
};

let themesCache;
function thumbTheme(name) {
  if (themesCache === undefined) {
    try { themesCache = JSON.parse(fs.readFileSync(new URL('../../standards/image-style.json', import.meta.url), 'utf8')).thumb_themes || {}; }
    catch { themesCache = {}; }
  }
  const t = themesCache[name] || {};
  return { band: t.band || NAVY.bg, key: t.key || NAVY.yellow };
}
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

function lookThumbHtml(imgDataUrl, S, o) {
  const tl = String(o.title).split('\n');
  const th = thumbTheme(o.theme);
  const jua = o.font === 'jua' && juaFace();
  const face = jua || ptdFace();
  const fam = jua ? `"Jua",${STYLE.font}` : face ? `"PTD",${STYLE.font}` : STYLE.font;
  const band = o.look === 'band';
  const b = band ? 0 : S * 0.045;   // frame: 테두리 두께
  const fs1 = Math.round(S * (tl.length > 2 ? 0.095 : 0.125));
  return `<!doctype html><meta charset="utf-8"><style>
    ${face}
    *{margin:0;box-sizing:border-box}
    body{width:${S}px;height:${S}px;position:relative;overflow:hidden;background:${th.band};font-family:${fam}}
    .ph{position:absolute;inset:${b}px;overflow:hidden;border-radius:${band ? 0 : S * 0.02}px}
    .ph img{width:100%;height:100%;object-fit:cover;display:block}
    .shade{position:absolute;left:0;right:0;top:0;height:${S * 0.46}px;
      background:linear-gradient(to bottom,${rgba(th.band, 0.93)} 0%,${rgba(th.band, 0.84)} 55%,${rgba(th.band, 0)} 100%)}
    .wrap{position:absolute;left:${S * 0.06}px;right:${S * 0.06}px;top:${band ? S * 0.035 : S * 0.085}px;height:${band ? S * 0.31 : S * 0.29}px;
      display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
    .box{background:rgba(255,255,255,.95);border-radius:${S * 0.03}px;padding:${S * 0.025}px ${S * 0.05}px;
      box-shadow:0 ${S * 0.008}px ${S * 0.03}px rgba(0,0,0,.18);display:flex;flex-direction:column;align-items:center;max-width:100%}
    .title{font-family:${fam};font-weight:${jua ? 400 : 800};font-size:${fs1}px;line-height:1.2;white-space:nowrap;letter-spacing:${jua ? 0 : '-.02em'};position:relative;z-index:1}
    .band .title{color:#fff;text-shadow:0 ${S * 0.004}px ${S * 0.012}px rgba(0,0,0,.35)}
    .band .title.key{color:${th.key}}
    .frame .title{color:${th.band}}
    .frame .title.key span{position:relative}
    .frame .title.key span:before{content:"";position:absolute;left:-${S * 0.01}px;right:-${S * 0.01}px;bottom:6%;height:42%;
      background:${th.key};border-radius:${S * 0.008}px;z-index:-1}
  </style><body class="${band ? 'band' : 'frame'}">
    <div class="ph"><img src="${imgDataUrl}">${band ? '<div class="shade"></div>' : ''}</div>
    <div class="wrap">${band
      ? tl.map((t, i) => `<div class="title${i === 0 ? ' key' : ''}">${esc(t)}</div>`).join('')
      : `<div class="box">${tl.map((t, i) => `<div class="title${i === 0 ? ' key' : ''}"><span>${esc(t)}</span></div>`).join('')}</div>`}</div>
  </body>`;
}

// ── 이슈 글 대표사진 (2026-11-02 사용자 — "사진이 눈에 확 들어와야, 글자는 눈에 띄지 않을 정도로") ──
// 실제 사진을 꽉 채우고(얼굴이 잘리지 않게 위쪽 기준으로 자름), 아래쪽만 살짝 어둡게 해서 작은 글씨 한 줄.
/** data:image/png;base64 의 가로÷세로 (PNG 머리에서 읽는다, 모르면 1) */
function pngRatio(dataUrl) {
  try {
    const m = /^data:image\/png;base64,(.{0,64})/.exec(dataUrl); if (!m) return 1;
    const b = Buffer.from(m[1], 'base64'); const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
    return w && h ? w / h : 1;
  } catch { return 1; }
}

function newsThumbHtml(imgDataUrl, S, o) {
  const face = ptdFace();
  const fam = face ? `"PTD",${STYLE.font}` : STYLE.font;
  const text = String(o.title || '').replace(/\n/g, ' ').trim();
  const pos = o.focus || 'center 22%';
  // 가로로 긴 사진(방송 장면·유튜브 표지 16:9)은 가운데만 잘라내면 사람·화면 글씨가 잘린다 (2026-11-03 계약결혼 대표사진 — 사용자 "짤려있잖아").
  // 가로:세로가 1.25 넘으면 사진 전체를 가운데 두고, 위아래 빈 곳은 같은 사진을 흐리게 채운다. o.fit 으로 강제할 수 있다 ('cover' | 'contain').
  const ratio = pngRatio(imgDataUrl);
  const contain = o.fit === 'contain' || (o.fit !== 'cover' && ratio > 1.25);
  if (contain) return `<!doctype html><meta charset="utf-8"><style>
    ${face}
    *{margin:0;box-sizing:border-box}
    body{width:${S}px;height:${S}px;position:relative;overflow:hidden;background:#111;font-family:${fam}}
    .bg{position:absolute;inset:-${S * 0.06}px;width:calc(100% + ${S * 0.12}px);height:calc(100% + ${S * 0.12}px);object-fit:cover;filter:blur(${Math.round(S * 0.03)}px) brightness(.55)}
    .fg{position:absolute;left:0;right:0;top:${S * 0.04}px;bottom:${S * 0.2}px;width:100%;height:${S * 0.76}px;object-fit:contain}
    .cap{position:absolute;left:${S * 0.05}px;right:${S * 0.05}px;bottom:${S * 0.06}px;color:#fff;font-weight:800;text-align:center;
      font-size:${Math.round(S * 0.058)}px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
      letter-spacing:-.01em;text-shadow:0 ${S * 0.003}px ${S * 0.01}px rgba(0,0,0,.5)}
  </style><body><img class="bg" src="${imgDataUrl}"><img class="fg" src="${imgDataUrl}">${text ? `<div class="cap">${esc(text)}</div>` : ''}</body>`;
  return `<!doctype html><meta charset="utf-8"><style>
    ${face}
    *{margin:0;box-sizing:border-box}
    body{width:${S}px;height:${S}px;position:relative;overflow:hidden;background:#111;font-family:${fam}}
    img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:${pos}}
    .shade{position:absolute;left:0;right:0;bottom:0;height:${S * 0.24}px;background:linear-gradient(to top,rgba(0,0,0,.55),rgba(0,0,0,0))}
    .cap{position:absolute;left:${S * 0.05}px;right:${S * 0.05}px;bottom:${S * 0.045}px;color:#fff;font-weight:800;
      font-size:${Math.round(S * 0.052)}px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
      letter-spacing:-.01em;text-shadow:0 ${S * 0.003}px ${S * 0.01}px rgba(0,0,0,.5)}
  </style><body><img src="${imgDataUrl}">${text ? `<div class="shade"></div><div class="cap">${esc(text)}</div>` : ''}</body>`;
}

// ── 정보 카드 (그림 없이 글자만) ───────────────────────────────
// 돈·통화기호 금지 (보험 글 그림 규칙과 같다 — standards/이미지-기준.md)
const MONEY = /[₩$€¥￦]|\d[\d,.]*\s*(만\s*|천\s*|억\s*)?(원|달러)|지폐|동전/;
const CARD_TYPES = ['steps', 'check', 'compare', 'lead'];

/** 카드 내용이 규칙에 맞는지 본다. 문제 목록(빈 배열이면 통과) */
export function checkCard(c) {
  const bad = [];
  if (!c || !CARD_TYPES.includes(c.type)) bad.push(`card.type 은 ${CARD_TYPES.join('/')} 중 하나`);
  if (!c?.title) bad.push('card.title 이 없음');
  const items = Array.isArray(c?.items) ? c.items : [];
  if (c?.type === 'lead') {
    // ① 첫머리 카드 (2026-11-04 사용자) — 큰 질문 제목만, 그림 없음
    if (!c.keyword || String(c.keyword).length > 8) bad.push('lead 카드 keyword(메인 키워드, 8자 안쪽)가 필요');
    if (String(c.title || '').split('\n').some((l) => l.length > 7) || String(c.title || '').split('\n').length > 2) bad.push('lead 카드 title(키워드 다음 질문)은 두 줄까지, 한 줄 7자 안쪽 (줄바꿈 \\n)');
    if (!c.ask) bad.push('lead 카드 ask(말풍선, 18자 안쪽)가 필요');
    if (items.length) bad.push('lead 카드에는 items 를 쓰지 않음');
  } else if (c?.type === 'compare') {
    if (items.length < 2 || items.length > 4) bad.push(`compare 줄은 2~4개 (지금 ${items.length})`);
    if (items.some((r) => !Array.isArray(r) || r.length !== 2)) bad.push('compare 의 items 는 ["왼쪽", "오른쪽"] 쌍');
    if (items.flat().some((t) => String(t).length > 12)) bad.push('compare 칸 글자는 12자 안쪽');
  } else {
    if (items.length < 3 || items.length > 5) bad.push(`${c?.type} 줄은 3~5개 (지금 ${items.length})`);
    if (items.some((t) => typeof t !== 'string' || t.length > 16)) bad.push('줄 글자는 16자 안쪽');
  }
  if (String(c?.title || '').length > 16) bad.push('card.title 은 16자 안쪽');
  if (c?.ask && String(c.ask).length > 18) bad.push('card.ask(질문 말풍선)는 18자 안쪽');
  if (c?.theme && !CARD_THEMES[c.theme]) bad.push(`card.theme 은 ${Object.keys(CARD_THEMES).join('/')} 중 하나`);
  if (c?.style === 'memo') {
    if (!['check', 'steps'].includes(c.type)) bad.push('memo 모양은 check·steps 카드만');
    if (String(c.sub || '').length > 24) bad.push('card.sub(제목 아래 한 줄)는 24자 안쪽');
    if (String(c.memo || '').length > 24) bad.push('card.memo(아래 메모 한 줄)는 24자 안쪽');
  }
  const all = [c?.keyword, c?.title, c?.ask, c?.sub, c?.memo, ...(c?.heads || []), ...items.flat()].join(' ');
  const m = MONEY.exec(all);
  if (m) bad.push(`돈·통화기호는 쓰지 않음: "${m[0]}"`);
  return bad;
}

// 2026-11-02 사용자 — "8번(채팅)으로 통일, 채팅 느낌이 제일 깔끔하고 눈에 들어온다". 질문 말풍선(오른쪽, 노랑) + 성글벙글 답 말풍선(왼쪽, 흰색).
//   카카오톡 화면처럼 보이지 않게 바탕·말풍선은 우리 색(따뜻한 연보라 바탕, 버터 노랑 질문), 위에 '성글벙글 Q&A' 를 단다 — 실제 대화 캡처로 오해받지 않게.
//   질문은 card.ask (18자 안쪽, 없으면 제목으로 "○○ 알려 줘!").  steps 는 번호 말풍선, compare 는 ⭕/❌ 두 말풍선에 줄을 나눠 담는다.
//   예전 크림색·파스텔 동그라미 카드는 cardHtmlClassic (card.style: "classic" 일 때만).
const askOf = (c) => {
  const a = String(c.ask || '').trim();
  if (a) return a;
  const t = String(c.title || '').trim();
  return /[?？]$/.test(t) ? t : `${t} 알려 줘!`;
};
// ── ① 첫머리 카드·② 메모 카드 (2026-11-04 사용자 — 다른 블로그 카드 느낌을 우리 색·우리 말투로, 그림 자리 없이) ──
//   문구는 성글벙글 말로만. 아래 고정 문구는 글마다 돌려 써 같은 문장이 매일 반복되지 않게 한다.
const pick = (arr, seed) => { let h = 0; for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return arr[h % arr.length]; };
const brandLine = (b) => (!b || b === '성글벙글' ? '⌂ 매일매일 좋은 날, 성글벙글' : `⌂ ${b}`);
const HAN = new URL('./fonts/BlackHanSans-Regular.ttf', import.meta.url);
let hanCache;
const hanFace = () => {
  if (hanCache === undefined) {
    try { hanCache = `@font-face{font-family:"HAN";src:url(data:font/ttf;base64,${fs.readFileSync(HAN).toString('base64')}) format("truetype")}`; }
    catch { hanCache = ''; }
  }
  return hanCache;
};
// 카테고리별 색 (2026-11-04 사용자 — 생활보장은 보라로 쭉, 생활정보도 따로). card.category 는 post-images 가 원고에서 넣는다
const BASE_SUBS = ['걱정 내려놓고, 같이 차근차근 볼까요?', '어렵지 않아요, 순서대로 정리했어요', '궁금했던 것부터 하나씩 풀어 볼게요'];
const BASE_MAINS = [['답은 이 글에', ' 다 모아 뒀어요 😊'], ['끝까지 보면', ' 딱 정리돼요 😊'], ['대신 찾아서', ' 정리해 뒀어요 😊']];
const CARD_THEMES = {
  생활보장: { l1: '#F3EEFC', l2: '#E6EEFA', ac: '#7C6CF2', dk: '#2A2540', dk2: '#3B3650', yl: '#FFD54A', yl2: '#FFE58A', soft: '#C9C2F5', shadow: 'rgba(124,108,242,.18)',
    g1: '#8E7FF5', g2: '#6A5AE0', g3: '#4B3FB0', on: '#E6E1FF', row: '#F3F1FB', rowhl: '#FFF3C4', dash: '#E2DEF3', heart: '💜', mark: '?',
    tags: ['오늘의 궁금증', '오늘 같이 볼 것', '많이 물어보셔서'], subs: BASE_SUBS, mains: BASE_MAINS },
  생활정보: { l1: '#EEF8F1', l2: '#FFF8E8', ac: '#2FA36B', dk: '#1F3A2E', dk2: '#2F4A3D', yl: '#FFB648', yl2: '#FFE08A', soft: '#BFE5CF', shadow: 'rgba(47,163,107,.18)',
    g1: '#5CC28E', g2: '#2FA36B', g3: '#1E7A50', on: '#E3F6EA', row: '#F0F8F3', rowhl: '#FFF1CC', dash: '#D5EBDD', heart: '💚', mark: '?',
    tags: ['오늘의 살림 팁', '이맘때 꼭 할 것', '알아 두면 편해요'],
    subs: ['한 번 알아 두면 매년 편해요', '어렵지 않아요, 순서대로 정리했어요', '오늘 저녁에 바로 해 볼 수 있어요'],
    mains: [['방법은 이 글에', ' 다 모아 뒀어요 😊'], ['끝까지 보면', ' 살림이 쉬워져요 😊'], ['순서대로만', ' 따라 해 보세요 😊']] },
  이슈뉴스: { l1: '#EEF3FB', l2: '#F7F2EC', ac: '#2F6FD6', dk: '#14243F', dk2: '#25344F', yl: '#FF7A59', yl2: '#FFD9A8', soft: '#BFD2F2', shadow: 'rgba(47,111,214,.18)',
    g1: '#4F86E0', g2: '#2F6FD6', g3: '#1D4E9E', on: '#E2ECFB', row: '#F0F4FB', rowhl: '#FFEBD9', dash: '#D8E2F2', heart: '📌', mark: '!',
    tags: ['오늘의 이슈', '오늘 바뀌는 것', '한 번에 정리'],
    subs: ['어려운 말은 빼고 쉽게 풀었어요', '내 생활에 뭐가 달라지는지 봐요', '핵심만 골라 순서대로 정리했어요'],
    mains: [['핵심만', ' 쏙 골라 정리했어요 📌'], ['3분이면', ' 오늘 이슈 끝나요 📌'], ['나랑 관계있는 것만', ' 모았어요 📌']] },
  연예방송: { l1: '#FDEFF4', l2: '#F1ECFB', ac: '#E5487D', dk: '#2E1A2B', dk2: '#45293F', yl: '#FFC94A', yl2: '#FFE38F', soft: '#F6C2D5', shadow: 'rgba(229,72,125,.18)',
    g1: '#F06C98', g2: '#D9437A', g3: '#9B2D6A', on: '#FCE3EC', row: '#FBF0F4', rowhl: '#FFF0C8', dash: '#F1D9E3', heart: '🎬', mark: '★',
    tags: ['어젯밤 화제 장면', '이번 주 화제작', '본방 놓쳤다면'],
    subs: ['본방 놓친 분도 금방 따라와요', '다들 궁금해한 그 장면, 같이 봐요', '어젯밤 이야기, 순서대로 풀었어요'],
    mains: [['다음 회 보기 전에', ' 같이 정리해요 🎬'], ['화제 장면만', ' 쏙 골라 봤어요 🎬'], ['3분이면', ' 줄거리 따라와요 🎬']] },
  맛집나들이: { l1: '#FFF3E6', l2: '#F2F7EC', ac: '#E07A3F', dk: '#3A2618', dk2: '#4E3626', yl: '#7DBB5A', yl2: '#FFE08A', soft: '#F5CFB3', shadow: 'rgba(224,122,63,.18)',
    g1: '#F29A5E', g2: '#E07A3F', g3: '#B5572A', on: '#FDEBDD', row: '#FDF4EC', rowhl: '#EAF5DF', dash: '#F1E0D2', heart: '🧡', mark: '♪',
    tags: ['이번 주말 어디 가지', '나들이 메모', '가기 전에 보세요'],
    subs: ['헛걸음 안 하게 미리 챙겨요', '주차·시간부터 차근차근 봐요', '사진 찍기 좋은 때까지 정리했어요'],
    mains: [['가기 전에', ' 이것만 챙겨요 🧺'], ['주말 계획은', ' 이 글로 끝 🧺'], ['헛걸음 없이', ' 다녀와요 🧺']] },
};
const cardTheme = (c) => CARD_THEMES[c.theme] || CARD_THEMES[String(c.category || '').replace(/[·\s]/g, '')] || CARD_THEMES.생활보장;
export const CARD_THEME_NAMES = Object.keys(CARD_THEMES);
function leadHtml(S, c) {
  const k = S / 1024;
  const P = cardTheme(c);
  const seed = `${c.keyword}${c.title}`;
  const [m1, m2] = pick(P.mains, seed + 'm');
  const t = String(c.title || '').split('\n');
  return `<!doctype html><meta charset="utf-8"><style>${ptdFace()}${hanFace()}
    *{margin:0;box-sizing:border-box}body{width:${S}px;height:${S}px;position:relative;overflow:hidden;background:#fff;font-family:"PTD",sans-serif}
    .c{position:absolute;inset:${28 * k}px;border-radius:${44 * k}px;overflow:hidden;background:linear-gradient(160deg,${P.l1} 0%,${P.l2} 100%)}
    .top{position:absolute;left:${64 * k}px;top:${62 * k}px;font-size:${30 * k}px;color:${P.dk};display:flex;align-items:center;gap:${10 * k}px}
    .top i{display:inline-block;width:${34 * k}px;height:${34 * k}px;border-radius:${10 * k}px;background:${P.ac};color:#fff;font-style:normal;text-align:center;line-height:${34 * k}px;font-size:${22 * k}px}
    .bub{position:absolute;right:${120 * k}px;top:${48 * k}px;background:#fff;border-radius:${40 * k}px;padding:${18 * k}px ${32 * k}px;font-size:${30 * k}px;color:${P.dk};white-space:nowrap;box-shadow:0 ${4 * k}px ${14 * k}px ${P.shadow}}
    .bub:after{content:'';position:absolute;left:${40 * k}px;bottom:${-16 * k}px;border:${12 * k}px solid transparent;border-top:${16 * k}px solid #fff}
    .dots{position:absolute;left:${66 * k}px;top:${186 * k}px;display:flex;gap:${10 * k}px}.dots i{width:${14 * k}px;height:${14 * k}px;border-radius:50%;background:${P.ac}}.dots i:nth-child(2){background:${P.yl}}.dots i:nth-child(3){background:${P.soft}}
    .q{position:absolute;right:${70 * k}px;top:${330 * k}px;font-family:"HAN";font-size:${380 * k}px;line-height:1;color:${P.ac};opacity:.16;transform:rotate(12deg)}
    .t{position:absolute;left:${62 * k}px;right:${62 * k}px;top:${220 * k}px;font-family:"HAN",sans-serif;font-size:${138 * k}px;line-height:1.12;color:${P.dk}}
    .t div{white-space:nowrap;width:fit-content}.t b{font-weight:normal;color:${P.ac};background:linear-gradient(transparent 62%,${P.yl2} 62%)}
    .bot{position:absolute;left:0;right:0;bottom:0;height:${176 * k}px;background:${P.dk};color:#fff;padding:${34 * k}px ${64 * k}px}
    .bot .s{font-size:${28 * k}px;color:${P.soft}}.bot .m{font-size:${42 * k}px;margin-top:${12 * k}px}.bot .m span{color:${P.yl2}}
    .bot .br{position:absolute;right:${56 * k}px;top:${36 * k}px;font-size:${24 * k}px;color:${P.soft}}.bot .s{max-width:62%;white-space:nowrap;overflow:hidden}.bot .m{white-space:nowrap}
  </style><body><div class="c">
    <div class="top"><i>⌂</i>${esc(c.brand && c.brand !== '성글벙글' ? c.brand : '성글벙글')} · ${esc(pick(P.tags, seed))}</div>
    <div class="bub">${esc(c.ask)}</div><div class="dots"><i></i><i></i><i></i></div><div class="q">${esc(P.mark)}</div>
    <div class="t"><div class="fitw"><b>${esc(c.keyword)}</b></div>${t.map((x) => `<div class="fitw">${esc(x)}</div>`).join('')}</div>
    <div class="bot"><div class="s">${esc(pick(P.subs, seed + 's'))}</div><div class="m"><span>${esc(m1)}</span>${esc(m2)}</div><div class="br">${esc(brandLine(c.brand))}</div></div>
  </div></body>`;
}
function memoHtml(S, c) {
  const k = S / 1024;
  const P = cardTheme(c);
  const n = c.items.length;
  const rowH = (n <= 3 ? 104 : n === 4 ? 86 : 72) * k;
  const fz = (n <= 3 ? 46 : n === 4 ? 40 : 34) * k;
  const hl = Number.isInteger(c.hl) ? c.hl : Math.floor((n - 1) / 2);
  const words = String(c.title || '').split(' ');
  const cut = words.length > 2 && words.at(-1).length < 2 ? 2 : 1; // 끝 낱말이 한 글자('것')면 두 낱말을 칠한다
  const head = words.length > 1 ? `${esc(words.slice(0, -cut).join(' '))} <b>${esc(words.slice(-cut).join(' '))}</b>` : `<b>${esc(c.title)}</b>`;
  return `<!doctype html><meta charset="utf-8"><style>${ptdFace()}${hanFace()}
    *{margin:0;box-sizing:border-box}body{width:${S}px;height:${S}px;position:relative;overflow:hidden;background:#fff;font-family:"PTD",sans-serif}
    .c{position:absolute;inset:${28 * k}px;border-radius:${44 * k}px;overflow:hidden;background:linear-gradient(160deg,${P.g1} 0%,${P.g2} 55%,${P.g3} 100%)}
    .h{position:absolute;top:${70 * k}px;left:${40 * k}px;right:${40 * k}px;text-align:center;font-family:"HAN",sans-serif;font-size:${84 * k}px;color:#fff;white-space:nowrap}
    .h b{font-weight:normal;color:${P.yl2}}
    .sub{position:absolute;top:${184 * k}px;width:100%;text-align:center;font-size:${32 * k}px;color:${P.on}}
    .nb{position:absolute;left:${78 * k}px;right:${78 * k}px;top:${280 * k}px;bottom:${120 * k}px;background:#fff;border-radius:${30 * k}px;padding:${64 * k}px ${46 * k}px 0;display:flex;flex-direction:column;justify-content:center;box-shadow:0 ${10 * k}px ${30 * k}px rgba(0,0,0,.18)}
    .tape{position:absolute;top:${-26 * k}px;left:50%;width:${260 * k}px;height:${56 * k}px;margin-left:${-130 * k}px;background:rgba(255,229,138,.92);transform:rotate(-3deg);border-radius:${6 * k}px}
    .r{display:flex;align-items:center;gap:${22 * k}px;background:${P.row};border-radius:${18 * k}px;height:${rowH}px;padding:0 ${30 * k}px;margin-bottom:${20 * k}px;font-size:${fz}px;color:${P.dk};white-space:nowrap;overflow:hidden}
    .r.hl{background:${P.rowhl}}
    .r .ck{width:${50 * k}px;height:${50 * k}px;border-radius:50%;background:${P.ac};color:#fff;font-size:${28 * k}px;text-align:center;line-height:${50 * k}px;flex:none}
    .foot{border-top:${3 * k}px dashed ${P.dash};margin:${6 * k}px 0 ${30 * k}px;padding-top:${22 * k}px;font-size:${29 * k}px;color:${P.dk2};display:flex;gap:${16 * k}px;align-items:center;white-space:nowrap}
    .tag{background:${P.yl2};border-radius:${10 * k}px;padding:${6 * k}px ${14 * k}px;font-size:${25 * k}px;color:${P.dk};flex:none}
    .br{position:absolute;right:${62 * k}px;bottom:${46 * k}px;font-size:${26 * k}px;color:${P.on}}
  </style><body><div class="c">
    <div class="h">${head}</div>${c.sub ? `<div class="sub">${esc(c.sub)}</div>` : ''}
    <div class="nb"><div class="tape"></div>
      ${c.items.map((t, i) => `<div class="r${i === hl ? ' hl' : ''}"><span class="ck">${c.type === 'steps' ? i + 1 : '✓'}</span>${esc(t)}</div>`).join('')}
      ${c.memo ? `<div class="foot"><span class="tag">${P.heart} ${esc(c.brand && c.brand !== '성글벙글' ? c.brand : '성글벙글')} 메모</span>${esc(c.memo)}</div>` : ''}
    </div><div class="br">${esc(brandLine(c.brand))}</div>
  </div></body>`;
}

function cardHtml(S, c) {
  if (c.type === 'lead') return leadHtml(S, c);
  if (c.style === 'memo') return memoHtml(S, c);
  if (c.style === 'classic') return cardHtmlClassic(S, c);
  const face = ptdFace();
  const fam = face ? `"PTD",${STYLE.font}` : STYLE.font;
  const n = c.items.length;
  const big = c.type === 'compare' ? (n >= 4 ? 0.72 : 0.8) : n <= 3 ? 1.08 : n >= 5 ? 0.88 : 1;
  const fz = Math.round(S * 0.047 * big);
  let answers = '';
  if (c.type === 'compare') {
    const [h1, h2] = c.heads?.length === 2 ? c.heads : ['이럴 땐 괜찮아요', '이럴 땐 피해요'];
    const box = (mk, h, list) => `<div class="m wide"><div class="mh">${mk} ${esc(h)}</div>${list.map((t) => `<div class="ml"><span class="fit">· ${esc(t)}</span></div>`).join('')}</div>`;
    answers = box('⭕', h1, c.items.map((r) => r[0])) + box('❌', h2, c.items.map((r) => r[1]));
  } else {
    answers = c.items.map((t, i) => `<div class="m"><span class="fit">${c.type === 'steps' ? `<b class="no">${i + 1}</b>` : '✔ '}${esc(t)}</span></div>`).join('');
  }
  return `<!doctype html><meta charset="utf-8"><style>
    ${face}
    *{margin:0;box-sizing:border-box}
    body{width:${S}px;height:${S}px;position:relative;overflow:hidden;font-family:${fam};color:#1E1B2E;
      background:linear-gradient(180deg,#EDE7F6 0%,#E3ECF7 100%);padding:${S * 0.06}px ${S * 0.06}px;display:flex;flex-direction:column;justify-content:center;gap:${S * 0.026}px}
    .top{text-align:center;font-size:${S * 0.034}px;color:#6B6585;letter-spacing:.02em}
    .top b{display:block;font-size:${S * 0.05}px;color:#2A2540;margin-top:${S * 0.008}px;letter-spacing:-.02em}
    .q{align-self:flex-end;max-width:84%;background:#FFE58A;font-size:${S * 0.05}px;padding:${S * 0.022}px ${S * 0.032}px;
      border-radius:${S * 0.03}px ${S * 0.03}px ${S * 0.006}px ${S * 0.03}px;box-shadow:0 ${S * 0.004}px ${S * 0.012}px rgba(60,50,90,.08);white-space:nowrap;overflow:hidden}
    .a{display:flex;gap:${S * 0.02}px;align-items:flex-start;min-height:0}
    .av{flex:none;width:${S * 0.085}px;height:${S * 0.085}px;border-radius:${S * 0.028}px;background:#fff;display:flex;align-items:center;justify-content:center;
      font-size:${S * 0.048}px;box-shadow:0 ${S * 0.004}px ${S * 0.012}px rgba(60,50,90,.08)}
    .bb{flex:1;min-width:0;display:flex;flex-direction:column;gap:${S * 0.016}px}
    .nm{font-size:${S * 0.03}px;color:#6B6585}
    .m{align-self:flex-start;max-width:100%;background:#fff;font-size:${fz}px;padding:${S * 0.02}px ${S * 0.03}px;
      border-radius:${S * 0.006}px ${S * 0.03}px ${S * 0.03}px ${S * 0.03}px;box-shadow:0 ${S * 0.004}px ${S * 0.012}px rgba(60,50,90,.08);white-space:nowrap;overflow:hidden}
    .m .no{display:inline-flex;align-items:center;justify-content:center;width:${fz * 1.15}px;height:${fz * 1.15}px;border-radius:50%;background:#7C6CF2;color:#fff;
      font-size:${fz * 0.7}px;margin-right:${S * 0.016}px;vertical-align:middle}
    .m.wide{width:100%;padding:${S * 0.016}px ${S * 0.03}px}
    .mh{font-size:${fz}px;margin-bottom:${S * 0.01}px}
    .ml{font-size:${fz * 0.95}px;color:#3B3650;padding:${S * 0.002}px 0;white-space:nowrap;overflow:hidden}
  </style><body>
    <div class="top">성글벙글 Q&amp;A<b><span class="fit">${esc(c.title)}</span></b></div>
    <div class="q"><span class="fit">${esc(askOf(c))}</span></div>
    <div class="a"><div class="av">🏠</div><div class="bb"><div class="nm">${esc(c.brand || '성글벙글')}</div>${answers}</div></div>
  </body>`;
}

function cardHtmlClassic(S, c) {
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
    <div class="brand">${esc(c.brand || '성글벙글')}</div>
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
        for (const el of document.querySelectorAll('.fitw, .h, .r, .bub, .bot .m, .bot .s')) {
          let fs = parseFloat(getComputedStyle(el).fontSize); let guard = 40;
          const max = (el.classList.contains('bub') ? document.body.clientWidth * 0.5 : el.parentElement.clientWidth) - 4;
          while (el.scrollWidth > max && fs > 12 && guard--) { fs *= 0.95; el.style.fontSize = fs + 'px'; }
        }
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

export async function launch() {
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
