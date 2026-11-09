/**
 * 진초록 정보 카드 (2026-11-09 사용자 — "우리 카드가 한다팀장 카드보다 허접해 보여", "캐릭터로 쭉, 카드뉴스도 딥그린 쪽으로").
 * 블로그 배너와 같은 색: 딥그린 #12463D · 크림 · 샴페인 골드. 캐릭터 '친근한 설계사'(클레이 3D)는 PC 의 content/mascot/img/<자세>.png.
 *
 *   greenCardHtml(S, c, { mascot })  — c.type: lead | number | check | steps
 *     lead   : { keyword, title: "줄", bubble, next }                    큰 두 색 제목 + 말풍선 + 캐릭터 + 아래 띠
 *     number : { title, sub, big, items: ["설명 한 줄"], next }          스프링 달력 + 큰 숫자
 *     check  : { title, sub, items: [3~5줄], hl, where }                 진초록 바탕 + 스프링 메모지 + 돋보기
 *   next  = 아래 띠 '이어서 → 『…』' 에 넣을 다음 소제목 (post-images 가 원고에서 찾아 넣는다)
 *   mascot = data URL (배경을 뺀 PNG). 없으면 캐릭터 없이 그린다.
 */
import fs from 'node:fs';

const font = (rel, fam, fmt) => {
  try { return `@font-face{font-family:"${fam}";src:url(data:font/${fmt};base64,${fs.readFileSync(new URL(rel, import.meta.url)).toString('base64')}) format("${fmt === 'otf' ? 'opentype' : 'truetype'}")}`; }
  catch { return ''; }
};
let faces;
const fontFaces = () => (faces ??= [
  font('./fonts/GothicA1-ExtraBold.ttf', 'HAN', 'ttf'),
  font('../threads/fonts/Pretendard-Bold.otf', 'PTD', 'otf'),
  font('../threads/fonts/Pretendard-SemiBold.otf', 'PTS', 'otf'),
].join(''));

export const GREEN = {
  deep: '#12463D', deeper: '#0B3029', mid: '#1F7A60', fresh: '#2E9C78', mint: '#E4F1EB', mint2: '#D3E8DE',
  cream: '#FBF6EC', gold: '#C9A45C', gold2: '#E8CC8A', ink: '#183A33', mu: '#6B7F78', line: '#E3E9E6',
};
const G = GREEN;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const brand = (c) => esc(c.brand || '친근한 설계사의 보험 이야기');
const label = (c) => esc(c.label || '친근한 설계사 · 한 장 요약');

// 장식 — 전구·반짝이·돋보기 (SVG, 로컬로 그림)
const bulb = (k, x, y) => `<svg style="position:absolute;left:${x * k}px;top:${y * k}px;width:${70 * k}px;height:${90 * k}px" viewBox="0 0 70 90">
  <defs><radialGradient id="bg1" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#FFF6D6"/><stop offset=".55" stop-color="#F6D27A"/><stop offset="1" stop-color="#D9A441"/></radialGradient></defs>
  <circle cx="35" cy="32" r="26" fill="url(#bg1)"/><ellipse cx="27" cy="22" rx="8" ry="6" fill="#fff" opacity=".7"/>
  <rect x="24" y="56" width="22" height="9" rx="3" fill="#B9C3C0"/><rect x="25" y="66" width="20" height="8" rx="3" fill="#9FAAA7"/><rect x="29" y="75" width="12" height="6" rx="3" fill="#86918E"/></svg>`;
const sparkle = (k, x, y, s = 1, col = G.gold) => `<svg style="position:absolute;left:${x * k}px;top:${y * k}px;width:${40 * s * k}px;height:${40 * s * k}px" viewBox="0 0 40 40"><path d="M20 0 C22 14 26 18 40 20 C26 22 22 26 20 40 C18 26 14 22 0 20 C14 18 18 14 20 0Z" fill="${col}"/></svg>`;
const magnifier = (k, x, y, rot = -30) => `<svg style="position:absolute;left:${x * k}px;top:${y * k}px;width:${190 * k}px;height:${190 * k}px;transform:rotate(${rot}deg);filter:drop-shadow(0 ${8 * k}px ${10 * k}px rgba(0,0,0,.25))" viewBox="0 0 190 190">
  <defs><radialGradient id="gl" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".5" stop-color="#E8F3EF" stop-opacity=".55"/><stop offset="1" stop-color="#BFD8CF" stop-opacity=".6"/></radialGradient>
  <linearGradient id="rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F2F5F4"/><stop offset=".5" stop-color="#A8B3B0"/><stop offset="1" stop-color="#E4E9E7"/></linearGradient>
  <linearGradient id="hd" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2A7A63"/><stop offset=".5" stop-color="#12463D"/><stop offset="1" stop-color="#0B3029"/></linearGradient></defs>
  <rect x="84" y="118" width="24" height="70" rx="12" fill="url(#hd)" transform="rotate(-0 96 150)"/>
  <circle cx="96" cy="70" r="62" fill="url(#rim)"/><circle cx="96" cy="70" r="51" fill="url(#gl)"/>
  <path d="M62 52 A40 40 0 0 1 98 30" stroke="#fff" stroke-width="9" stroke-linecap="round" fill="none" opacity=".9"/></svg>`;
const rings = (k, n, w) => {
  const gap = w / n;
  return Array.from({ length: n }, (_, i) => `<div class="ring" style="left:${(gap * i + gap / 2 - 11) * k}px"></div>`).join('');
};

function base(S, extra) {
  const k = S / 1024;
  return `<!doctype html><meta charset="utf-8"><style>${fontFaces()}
    *{margin:0;box-sizing:border-box}
    body{width:${S}px;height:${S}px;position:relative;overflow:hidden;background:#fff;font-family:"PTD",sans-serif;color:${G.ink}}
    .c{position:absolute;inset:${24 * k}px;border-radius:${46 * k}px;overflow:hidden;box-shadow:0 ${6 * k}px ${24 * k}px rgba(18,70,61,.14)}
    .light{background:radial-gradient(120% 90% at 30% 20%,#FFFFFF 0%,${G.mint} 55%,${G.mint2} 100%)}
    .dark{background:radial-gradient(120% 100% at 40% 10%,#1E6455 0%,${G.deep} 50%,${G.deeper} 100%)}
    .lab{position:absolute;left:${64 * k}px;top:${58 * k}px;font-family:"PTS";font-size:${28 * k}px;color:${G.deep};letter-spacing:-.01em;display:flex;align-items:center;gap:${10 * k}px}
    .lab i{width:${12 * k}px;height:${12 * k}px;border-radius:50%;background:${G.gold}}
    .band{position:absolute;left:0;right:0;bottom:0;height:${178 * k}px;background:linear-gradient(180deg,${G.deep},${G.deeper});padding:${36 * k}px ${64 * k}px 0;color:#fff}
    .band .s{font-family:"PTS";font-size:${27 * k}px;color:${G.mint2};opacity:.9}
    .band .m{font-family:"PTD";font-size:${40 * k}px;margin-top:${12 * k}px;white-space:nowrap;letter-spacing:-.02em}
    .band .m b{color:${G.gold2};font-weight:normal}
    .br{position:absolute;right:${56 * k}px;bottom:${34 * k}px;font-family:"PTS";font-size:${22 * k}px;color:${G.mint2};opacity:.85}
    .mascot{position:absolute;filter:drop-shadow(0 ${10 * k}px ${18 * k}px rgba(18,70,61,.22))}
    .ring{position:absolute;top:${-34 * k}px;width:${22 * k}px;height:${62 * k}px;border-radius:${11 * k}px;background:linear-gradient(90deg,#9AA6A3,#F4F7F6 45%,#A7B2AF);box-shadow:0 ${3 * k}px ${4 * k}px rgba(0,0,0,.18)}
    .fitw{width:fit-content;white-space:nowrap}
    .sheet{position:absolute;background:#fff;border-radius:${30 * k}px;box-shadow:0 ${18 * k}px ${40 * k}px rgba(11,48,41,.18),0 ${2 * k}px 0 rgba(255,255,255,.9) inset}
    ${extra(k)}
  </style>`;
}

function leadHtml(S, c, o) {
  const k = S / 1024;
  return `${base(S, (k) => `
    .bub{position:absolute;right:${150 * k}px;top:${52 * k}px;max-width:${470 * k}px;background:#fff;border-radius:${34 * k}px;padding:${20 * k}px ${34 * k}px;font-family:"PTS";font-size:${29 * k}px;color:${G.deep};text-align:center;line-height:1.35;box-shadow:0 ${8 * k}px ${22 * k}px rgba(18,70,61,.14)}
    .bub:after{content:'';position:absolute;left:${54 * k}px;bottom:${-18 * k}px;border:${14 * k}px solid transparent;border-top:${20 * k}px solid #fff;border-bottom:0}
    .t{position:absolute;left:${60 * k}px;width:${620 * k}px;top:${200 * k}px;font-family:"HAN";line-height:1.1;letter-spacing:-.03em}
    .t .k{font-size:${150 * k}px;padding-bottom:${6 * k}px;background:linear-gradient(180deg,${G.fresh},${G.mid});-webkit-background-clip:text;color:transparent;white-space:nowrap}
    .t .q{font-size:${132 * k}px;color:${G.deep};white-space:nowrap}
    .ul{position:absolute;left:${64 * k}px;top:${560 * k}px;display:none;width:${120 * k}px;height:${10 * k}px;border-radius:${5 * k}px;background:${G.gold}}
  `)}<body><div class="c light">
    ${bulb(k, 880, 70)}${sparkle(k, 600, 600, 0.9)}${sparkle(k, 640, 655, 0.5, G.fresh)}
    <div class="lab"><i></i>${label(c)}</div>
    ${c.bubble ? `<div class="bub">${esc(c.bubble)}</div>` : ''}
    <div class="t"><div class="k fitw">${esc(c.keyword)}</div>${String(c.title).split('\n').map((l) => `<div class="q fitw">${esc(l)}</div>`).join('')}</div>
    <div class="ul"></div>
    ${o.mascot ? `<img class="mascot" src="${o.mascot}" style="right:${-10 * k}px;bottom:${118 * k}px;height:${560 * k}px">` : ''}
    <div class="band"><div class="s">자세한 기준은 아래 글에서 ↓</div><div class="m">『<b>${esc(c.next || `${c.keyword} 한눈에 보기`)}</b>』</div></div>
    <div class="br">${brand(c)}</div>
  </div></body>`;
}

function numberHtml(S, c, o) {
  const k = S / 1024;
  const W = o.mascot ? 600 : 820;
  return `${base(S, (k) => `
    .h{position:absolute;left:0;right:0;top:${66 * k}px;text-align:center;font-family:"HAN";font-size:${76 * k}px;color:${G.deep};letter-spacing:-.03em;white-space:nowrap}
    .h b{font-weight:normal;color:${G.fresh}}.h em{font-style:normal;color:${G.gold}}
    .sub{position:absolute;left:0;right:0;top:${170 * k}px;text-align:center;font-family:"PTS";font-size:${30 * k}px;color:${G.mu}}
    .sheet{left:${66 * k}px;top:${290 * k}px;width:${W * k}px;height:${380 * k}px;padding:${44 * k}px ${36 * k}px}
    .panel{height:${200 * k}px;border-radius:${22 * k}px;background:linear-gradient(180deg,#F1F6F4,#E6EFEB);display:flex;align-items:center;justify-content:center;box-shadow:inset 0 ${2 * k}px ${6 * k}px rgba(18,70,61,.08)}
    .big{font-family:"HAN";font-size:${150 * k}px;letter-spacing:-.04em;background:linear-gradient(180deg,${G.fresh},${G.deep});-webkit-background-clip:text;color:transparent;white-space:nowrap}
    .row{display:flex;align-items:center;gap:${18 * k}px;margin-top:${30 * k}px;font-family:"PTD";font-size:${34 * k}px;color:${G.ink};white-space:nowrap}
    .row span{flex:none;width:${48 * k}px;height:${48 * k}px;border-radius:50%;background:${G.deep};color:#fff;font-size:${26 * k}px;display:flex;align-items:center;justify-content:center}
    .band{height:${130 * k}px;padding-top:${42 * k}px}.band .m{margin-top:0;font-size:${34 * k}px}.band .m small{font-family:"PTS";font-size:${27 * k}px;color:${G.mint2};margin-right:${14 * k}px}
    .br{bottom:${24 * k}px}
  `)}<body><div class="c light">
    ${bulb(k, 640, 230)}${sparkle(k, 80, 210, 0.6)}
    <div class="h"><div class="fitw" style="margin:0 auto">${c.titleHtml || esc(c.title)}</div></div><div class="sub">${esc(c.sub || '숫자 하나로 먼저 봐요')}</div>
    <div class="sheet">${rings(k, o.mascot ? 7 : 9, W)}<div class="panel"><div class="big fitw">${esc(c.big)}</div></div>
      ${(c.items || []).map((t, i) => `<div class="row"><span>${i + 1}</span><div class="fitw">${esc(t)}</div></div>`).join('')}</div>
    ${o.mascot ? `<img class="mascot" src="${o.mascot}" style="right:${-30 * k}px;bottom:${70 * k}px;height:${640 * k}px">` : ''}
    <div class="band"><div class="m"><small>이어서 →</small>『<b>${esc(c.next || '')}</b>』</div></div>
    <div class="br">${brand(c)}</div>
  </div></body>`;
}

function checkHtml(S, c, o) {
  const k = S / 1024;
  const n = c.items.length;
  const rowH = (n <= 3 ? 110 : n === 4 ? 92 : 78) * k;
  const hl = Number.isInteger(c.hl) ? c.hl : 1;
  return `${base(S, (k) => `
    .h{position:absolute;left:0;right:0;top:${70 * k}px;text-align:center;font-family:"HAN";font-size:${82 * k}px;color:#fff;letter-spacing:-.03em;white-space:nowrap}
    .h b{font-weight:normal;color:${G.gold2}}
    .sub{position:absolute;left:0;right:0;top:${178 * k}px;text-align:center;font-family:"PTS";font-size:${30 * k}px;color:${G.mint2}}
    .sheet{left:${74 * k}px;right:${74 * k}px;top:${292 * k}px;bottom:${96 * k}px;padding:${52 * k}px ${40 * k}px ${28 * k}px;display:flex;flex-direction:column}
    .rows{flex:1;display:flex;flex-direction:column;justify-content:center;gap:${18 * k}px}
    .r{height:${rowH}px;border-radius:${18 * k}px;background:#F2F6F4;border:${2 * k}px solid ${G.line};display:flex;align-items:center;gap:${22 * k}px;padding:0 ${30 * k}px;font-family:"PTD";font-size:${40 * k}px;color:${G.ink};white-space:nowrap}
    .r.hl{background:linear-gradient(90deg,#FFF7E3,#FDF1D2);border-color:${G.gold2}}
    .r i{flex:none;width:${46 * k}px;height:${46 * k}px;border-radius:50%;background:${G.deep};display:flex;align-items:center;justify-content:center}
    .ft{border-top:${3 * k}px dashed ${G.line};margin-top:${22 * k}px;padding-top:${20 * k}px;display:flex;align-items:center;gap:${16 * k}px;font-family:"PTS";font-size:${28 * k}px;color:${G.ink};white-space:nowrap}
    .chip{background:#FFF1CF;color:#8A6416;border-radius:${10 * k}px;padding:${6 * k}px ${14 * k}px;font-family:"PTD";font-size:${24 * k}px}
    .br{color:${G.mint2}}
  `)}<body><div class="c dark">
    ${sparkle(k, 90, 90, 0.7, G.gold2)}${sparkle(k, 880, 200, 0.5, G.gold2)}
    <div class="h"><div class="fitw" style="margin:0 auto">${c.titleHtml || esc(c.title)}</div></div>${c.sub ? `<div class="sub">${esc(c.sub)}</div>` : ''}
    <div class="sheet">${rings(k, 10, 876)}
      <div class="rows">${c.items.map((t, i) => `<div class="r${i === hl ? ' hl' : ''}"><i><svg width="${24 * k}" height="${24 * k}" viewBox="0 0 24 24"><path d="M5 12.5l4.2 4.2L19 7" stroke="#fff" stroke-width="3.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></i><span class="fitw">${esc(t)}</span></div>`).join('')}</div>
      ${c.where ? `<div class="ft"><span class="chip">⚠ 글에서 확인</span>『${esc(c.where)}』</div>` : ''}
    </div>
    ${magnifier(k, 760, 330)}
    <div class="br">${brand(c)}</div>
  </div></body>`;
}

export function greenCardHtml(S, c, o = {}) {
  if (c.type === 'lead') return leadHtml(S, c, o);
  if (c.type === 'number') return numberHtml(S, c, o);
  return checkHtml(S, c, o);
}

/** 글자가 칸을 넘으면 줄인다 (renderCards 의 page.evaluate 안에서 부른다) */
export const FIT_SCRIPT = () => {
  for (const el of document.querySelectorAll('.fitw')) {
    let fs = parseFloat(getComputedStyle(el).fontSize); let guard = 40;
    const max = el.parentElement.clientWidth - 8;
    while (el.scrollWidth > max && fs > 12 && guard--) { fs *= 0.95; el.style.fontSize = fs + 'px'; }
  }
};
