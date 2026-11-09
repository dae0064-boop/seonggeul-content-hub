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
    ${o.mascot ? `<img class="mascot" src="${o.mascot}" style="right:${-20 * k}px;bottom:${-10 * k}px;height:${430 * k}px">` : magnifier(k, 760, 330)}
    <div class="br"${o.mascot ? ` style="left:${74 * k}px;right:auto"` : ''}>${brand(c)}</div>
  </div></body>`;
}

// ── 매일 원고 카드 (계획서 card 모양 그대로 — 2026-11-09 사용자 "적용해") ──────────────
// 제목 끝 낱말을 강조색으로 (한 글자 낱말이면 두 낱말)
const headOf = (t, cls = 'b') => {
  const w = String(t || '').split(' ');
  const cut = w.length > 2 && w.at(-1).length < 2 ? 2 : 1;
  return w.length > 1 ? `${esc(w.slice(0, -cut).join(' '))} <${cls}>${esc(w.slice(-cut).join(' '))}</${cls}>` : `<${cls}>${esc(t)}</${cls}>`;
};
const check = (k, col = '#fff') => `<svg width="${24 * k}" height="${24 * k}" viewBox="0 0 24 24"><path d="M5 12.5l4.2 4.2L19 7" stroke="${col}" stroke-width="3.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// 밝은 바탕 + 왼쪽 정렬 제목 + 오른쪽 위 캐릭터(메모지 뒤에 서 있음) + 스프링 메모지
function peekShell(S, c, o, { css = '', body = '', foot = '', sheetTop = 300, sheetBottom = 150 }) {
  const k = S / 1024;
  return `${base(S, (k) => `
    .h{position:absolute;left:${64 * k}px;width:${o.mascot ? 640 : 900}px;top:${96 * k}px;font-family:"HAN";font-size:${84 * k}px;color:${G.deep};letter-spacing:-.03em;line-height:1.12}
    .h b{font-weight:normal;color:${G.fresh}}
    .sub{position:absolute;left:${66 * k}px;top:${212 * k}px;width:${620 * k}px;font-family:"PTS";font-size:${30 * k}px;color:${G.mu}}
    .sheet{left:${60 * k}px;right:${60 * k}px;top:${sheetTop * k}px;bottom:${sheetBottom * k}px;padding:${48 * k}px ${40 * k}px ${26 * k}px;display:flex;flex-direction:column;z-index:2}
    .mascot{z-index:1}
    .band{height:${118 * k}px;padding-top:${36 * k}px;z-index:3}.band .m{margin-top:0;font-size:${33 * k}px}.band .m small{font-family:"PTS";font-size:${26 * k}px;color:${G.mint2};margin-right:${14 * k}px}
    .br{bottom:${20 * k}px;z-index:4}
    ${css}
  `)}<body><div class="c light">
    ${sparkle(k, 900, 40, 0.6)}
    <div class="lab" style="top:${44 * k}px"><i></i>${label(c)}</div>
    <div class="h"><div class="fitw">${headOf(c.title)}</div></div>${c.sub ? `<div class="sub"><div class="fitw">${esc(c.sub)}</div></div>` : ''}
    ${o.mascot ? `<img class="mascot" src="${o.mascot}" style="right:${40 * k}px;top:${30 * k}px;height:${380 * k}px">` : bulb(k, 880, 120)}
    <div class="sheet">${rings(k, 10, 904)}${body}${foot}</div>
    <div class="band"><div class="m">${c.next ? `<small>이어서 →</small>『<b>${esc(c.next)}</b>』` : `<small>자세한 기준은</small><b>아래 글에서</b> 확인해요 ↓`}</div></div>
    <div class="br">${brand(c)}</div>
  </div></body>`;
}

function numberMultiHtml(S, c, o) {
  const k = S / 1024;
  const cols = [G.fresh, G.deep, '#B8893A'];
  const n = c.items.length;
  return peekShell(S, c, o, {
    css: `.rows{flex:1;display:flex;flex-direction:column;justify-content:center;gap:${18 * k}px}
      .t{flex:1;max-height:${n === 2 ? 190 : 140}px;border-radius:${20 * k}px;background:#F3F7F5;display:flex;align-items:center;gap:${30 * k}px;padding:0 ${34 * k}px}
      .n{font-family:"HAN";font-size:${(n === 2 ? 96 : 80) * k}px;min-width:${260 * k}px;letter-spacing:-.03em;white-space:nowrap}
      .d{font-family:"PTS";font-size:${28 * k}px;color:${G.mu};min-width:0}.d b{display:block;font-family:"PTD";font-weight:normal;font-size:${38 * k}px;color:${G.ink};margin-top:${4 * k}px}`,
    body: `<div class="rows">${c.items.map((r, i) => `<div class="t" style="border-left:${12 * k}px solid ${cols[i]}"><div class="n" style="color:${cols[i]}">${esc(r[0])}</div><div class="d"><div class="fitw">${esc(r[1])}</div><b class="fitw">${esc(r[2])}</b></div></div>`).join('')}</div>`,
  });
}

function selfGreenHtml(S, c, o) {
  const k = S / 1024;
  return peekShell(S, c, o, {
    sheetBottom: 300,
    css: `.rows{flex:1;display:flex;flex-direction:column;justify-content:center}
      .r{display:flex;align-items:center;gap:${24 * k}px;flex:1;max-height:${92 * k}px;font-family:"PTD";font-size:${40 * k}px;border-bottom:${3 * k}px dashed ${G.line};white-space:nowrap}.r:last-child{border:0}
      .r i{flex:none;width:${54 * k}px;height:${54 * k}px;border-radius:${14 * k}px;border:${5 * k}px solid ${G.deep}}
      .res{position:absolute;left:${60 * k}px;right:${60 * k}px;bottom:${136 * k}px;height:${140 * k}px;border-radius:${24 * k}px;background:linear-gradient(90deg,${G.gold2},${G.gold});padding:${22 * k}px ${34 * k}px;color:${G.deeper};z-index:2}
      .res b{display:block;font-family:"HAN";font-weight:normal;font-size:${40 * k}px}.res div{font-family:"PTD";font-size:${32 * k}px;margin-top:${6 * k}px}`,
    body: `<div class="rows">${c.items.map((t) => `<div class="r"><i></i><span class="fitw">${esc(t)}</span></div>`).join('')}</div>`,
    foot: `</div><div class="res"><b>하나라도 체크했다면</b><div class="fitw">${esc(c.result)}</div>`,
  });
}

function compareGreenHtml(S, c, o) {
  const k = S / 1024;
  const [h1, h2] = c.heads?.length === 2 ? c.heads : ['이럴 땐 괜찮아요', '이럴 땐 피해요'];
  const col = (mk, h, list, bg, fg) => `<div class="col"><div class="ch" style="background:${bg};color:${fg}">${mk} <span class="fitw" style="display:inline-block">${esc(h)}</span></div>${list.map((t) => `<div class="cc"><span class="fitw">${esc(t)}</span></div>`).join('')}</div>`;
  return peekShell(S, c, o, {
    css: `.cols{flex:1;display:grid;grid-template-columns:1fr 1fr;gap:${22 * k}px;align-content:center}
      .ch{border-radius:${16 * k}px;padding:${16 * k}px ${18 * k}px;font-family:"PTD";font-size:${32 * k}px;white-space:nowrap;overflow:hidden;margin-bottom:${12 * k}px}
      .cc{border-radius:${14 * k}px;background:#F3F7F5;padding:${16 * k}px ${18 * k}px;font-family:"PTD";font-size:${32 * k}px;margin-bottom:${12 * k}px;white-space:nowrap;overflow:hidden}`,
    body: `<div class="cols">${col('⭕', h1, c.items.map((r) => r[0]), G.mint2, G.deep)}${col('❌', h2, c.items.map((r) => r[1]), '#FBE9DF', '#8A3B1C')}</div>`,
  });
}

function quizGreenHtml(S, c, o) {
  const k = S / 1024;
  return peekShell(S, c, o, {
    css: `.rows{flex:1;display:flex;flex-direction:column;justify-content:center;gap:${18 * k}px}
      .q{flex:1;max-height:${120 * k}px;border-radius:${18 * k}px;background:#F3F7F5;display:flex;align-items:center;gap:${18 * k}px;padding:0 ${24 * k}px;font-family:"PTD";font-size:${36 * k}px;white-space:nowrap}
      .no{flex:none;font-family:"HAN";font-size:${50 * k}px;color:${G.fresh};width:${44 * k}px}.tx{flex:1;min-width:0;overflow:hidden}
      .ox{flex:none;display:flex;gap:${10 * k}px}.ox span{width:${70 * k}px;height:${70 * k}px;border-radius:${16 * k}px;background:#fff;border:${4 * k}px solid ${G.line};font-family:"HAN";font-size:${42 * k}px;display:flex;align-items:center;justify-content:center;color:${G.fresh}}.ox span+span{color:#C0623A}
      .ans{margin-top:${18 * k}px;text-align:center;font-family:"PTD";font-size:${32 * k}px;color:${G.ink}}.ans b{background:${G.deep};color:${G.gold2};border-radius:${12 * k}px;padding:${4 * k}px ${16 * k}px;font-weight:normal}`,
    body: `<div class="rows">${c.items.map((t, i) => `<div class="q"><span class="no">${i + 1}</span><span class="tx"><span class="fitw">${esc(t)}</span></span><span class="ox"><span>O</span><span>X</span></span></div>`).join('')}</div>`,
    foot: `<div class="ans">정답은 <b>${esc(c.where || '아래 본문')}</b>에 있어요 👇</div>`,
  });
}

// 진초록 바탕 + 스프링 메모지 (check·steps — 메모 카드·채팅 카드 모두 이것으로)
function listGreenHtml(S, c, o) {
  const k = S / 1024;
  const n = c.items.length;
  const rowH = (n <= 3 ? 110 : n === 4 ? 92 : 78) * k;
  const hl = Number.isInteger(c.hl) ? c.hl : Math.min(1, n - 1);
  const steps = c.type === 'steps';
  const sub = c.sub || c.ask || '';
  const foot = c.memo ? `<div class="ft"><span class="chip ok">💡 설계사 메모</span><span class="fitw">${esc(c.memo)}</span></div>`
    : c.where ? `<div class="ft"><span class="chip">⚠ 글에서 확인</span>『${esc(c.where)}』</div>` : '';
  const right = o.mascot ? 250 : 40;
  return `${base(S, (k) => `
    .h{position:absolute;left:${50 * k}px;right:${50 * k}px;top:${70 * k}px;text-align:center;font-family:"HAN";font-size:${82 * k}px;color:#fff;letter-spacing:-.03em}
    .h b{font-weight:normal;color:${G.gold2}}
    .sub{position:absolute;left:${60 * k}px;right:${60 * k}px;top:${178 * k}px;text-align:center;font-family:"PTS";font-size:${30 * k}px;color:${G.mint2}}
    .sheet{left:${74 * k}px;right:${74 * k}px;top:${292 * k}px;bottom:${96 * k}px;padding:${52 * k}px ${right * k}px ${28 * k}px ${40 * k}px;display:flex;flex-direction:column}
    .rows{flex:1;display:flex;flex-direction:column;justify-content:center;gap:${18 * k}px}
    .r{height:${rowH}px;border-radius:${18 * k}px;background:#F2F6F4;border:${2 * k}px solid ${G.line};display:flex;align-items:center;gap:${22 * k}px;padding:0 ${30 * k}px;font-family:"PTD";font-size:${40 * k}px;color:${G.ink};white-space:nowrap;overflow:hidden}
    .r.hl{background:linear-gradient(90deg,#FFF7E3,#FDF1D2);border-color:${G.gold2}}
    .r i{flex:none;width:${46 * k}px;height:${46 * k}px;border-radius:50%;background:${G.deep};color:#fff;font-style:normal;font-family:"PTD";font-size:${26 * k}px;display:flex;align-items:center;justify-content:center}
    .ft{border-top:${3 * k}px dashed ${G.line};margin-top:${22 * k}px;padding-top:${20 * k}px;display:flex;align-items:center;gap:${16 * k}px;font-family:"PTS";font-size:${28 * k}px;color:${G.ink};white-space:nowrap;overflow:hidden}
    .chip{flex:none;background:#FFF1CF;color:#8A6416;border-radius:${10 * k}px;padding:${6 * k}px ${14 * k}px;font-family:"PTD";font-size:${24 * k}px}.chip.ok{background:${G.mint};color:${G.deep}}
    .br{color:${G.mint2}}
  `)}<body><div class="c dark">
    ${sparkle(k, 90, 90, 0.7, G.gold2)}${sparkle(k, 880, 200, 0.5, G.gold2)}
    <div class="h"><div class="fitw" style="margin:0 auto">${headOf(c.title)}</div></div>${sub ? `<div class="sub"><div class="fitw" style="margin:0 auto">${esc(sub)}</div></div>` : ''}
    <div class="sheet">${rings(k, 10, 876)}
      <div class="rows">${c.items.map((t, i) => `<div class="r${i === hl ? ' hl' : ''}"><i>${steps ? i + 1 : check(k)}</i><span class="fitw">${esc(t)}</span></div>`).join('')}</div>
      ${foot}
    </div>
    ${o.mascot ? `<img class="mascot" src="${o.mascot}" style="right:${-20 * k}px;bottom:${-10 * k}px;height:${430 * k}px">` : magnifier(k, 760, 330)}
    <div class="br"${o.mascot ? ` style="left:${74 * k}px;right:auto"` : ''}>${brand(c)}</div>
  </div></body>`;
}

export function greenCardHtml(S, c, o = {}) {
  if (c.type === 'lead') return leadHtml(S, { ...c, bubble: c.bubble || c.ask }, o);
  if (c.type === 'number') return Array.isArray(c.items?.[0]) ? numberMultiHtml(S, c, o) : numberHtml(S, c, o);
  if (c.type === 'selfcheck') return selfGreenHtml(S, c, o);
  if (c.type === 'quiz') return quizGreenHtml(S, c, o);
  if (c.type === 'compare') return compareGreenHtml(S, c, o);
  if (c.titleHtml) return checkHtml(S, c, o); // 예시(green-sample)
  return listGreenHtml(S, c, o);
}

// 카드마다 캐릭터 자세 (같은 모양이어도 글마다 돌려 쓴다 — 2026-11-09 사용자 "자세·표정이 항상 똑같지 말고")
const POSES = {
  lead: ['pose-magnifier', 'pose-surprise', 'pose-wave', 'pose-point'],
  number: ['pose-think', 'pose-point', 'pose-palm'],
  selfcheck: ['pose-magnifier', 'pose-clipboard', 'pose-think'],
  quiz: ['pose-surprise', 'pose-think', 'pose-thumb'],
  compare: ['pose-palm', 'pose-think', 'pose-point'],
  list: ['pose-clipboard', 'pose-thumb', 'pose-point', 'pose-palm'],
};
export function poseFor(c, seed) {
  const list = POSES[c.type] || POSES.list;
  let h = 0; for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return list[h % list.length];
}
/** 메모지 칸(check·steps)에서는 줄이 짧을 때만 캐릭터를 넣는다 (긴 줄을 가리지 않게). 아니면 돋보기 */
export function wantsMascot(c) {
  if (['check', 'steps'].includes(c.type)) return (c.items || []).every((t) => String(t).length <= 11) && !c.memo && !c.where;
  return true;
}

/** 글자가 칸을 넘으면 줄인다 (renderCards 의 page.evaluate 안에서 부른다) */
export const FIT_SCRIPT = () => {
  for (const el of document.querySelectorAll('.fitw')) {
    let fs = parseFloat(getComputedStyle(el).fontSize); let guard = 40;
    const max = el.parentElement.clientWidth - 8;
    while (el.scrollWidth > max && fs > 12 && guard--) { fs *= 0.95; el.style.fontSize = fs + 'px'; }
  }
};

/**
 * 캐릭터 그림의 크로마키 초록 바탕(#00B140)이나 연회색 바탕을 그리는 순간 빼고, 빈 가장자리를 잘라 낸다.
 * renderCards 에서 setContent 뒤, FIT_SCRIPT 앞에 page.evaluate(KEY_SCRIPT) 로 부른다. 이미 투명한 PNG 는 가장자리만 자른다.
 */
export const KEY_SCRIPT = async () => {
  for (const el of document.querySelectorAll('img.mascot')) {
    if (!el.complete) await new Promise((r) => { el.onload = r; el.onerror = r; });
    const w = el.naturalWidth, h = el.naturalHeight;
    if (!w) continue;
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const x = cv.getContext('2d'); x.drawImage(el, 0, 0);
    const d = x.getImageData(0, 0, w, h); const a = d.data;
    const g0 = (i) => a[i + 1] - Math.max(a[i], a[i + 2]);
    const greenBg = g0(0) > 60;
    if (greenBg) {
      for (let i = 0; i < a.length; i += 4) {
        const g = g0(i);
        if (g > 70) a[i + 3] = 0;
        else if (g > 25) { a[i + 3] = Math.round(255 * (70 - g) / 45); a[i + 1] = Math.max(a[i], a[i + 2]); }
        else if (g > 0) a[i + 1] = Math.max(a[i], a[i + 2]) + Math.round(g / 2); // 가장자리 초록 번짐 덜기
      }
    }
    let x0 = w, y0 = h, x1 = 0, y1 = 0;
    for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) if (a[(y * w + xx) * 4 + 3] > 20) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 <= x0) continue;
    x.putImageData(d, 0, 0);
    const out = document.createElement('canvas'); out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
    out.getContext('2d').drawImage(cv, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
    el.src = out.toDataURL('image/png');
    await new Promise((r) => { el.onload = r; });
  }
};
