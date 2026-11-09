// 상담 배너 — 나만의 판 (2026-11-09 사용자 "한다팀장 배너 느낌이 전혀 들지 않게"). 남색·금색·금 배지·붓 서명·탄색 띠 없음.
// 밝은 바탕 + 청록(신뢰) + 코랄(친근) 포인트, 말풍선·흰 카드. 1920×600, 아래 5칸 = 위젯 자리(x 486+186k · 가로 170 · 위 321~600).
// node content/consult/banner/fresh.mjs --photo 사람.png [--guide] → fresh-banner.png (저장소에 올리지 않음)
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import { chromium } from 'playwright';
const HERE = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.resolve(HERE, '../../..');
const A = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const GUIDE = process.argv.includes('--guide');
const BGI = A('--bgimg', ''); const bgimg = BGI && fs.existsSync(BGI) ? `data:image/jpeg;base64,${fs.readFileSync(BGI).toString('base64')}` : '';
const font = f => { const fp = fs.existsSync(path.join(ROOT, 'scripts/lib/fonts', f)) ? path.join(ROOT, 'scripts/lib/fonts', f) : path.join(ROOT, 'scripts/threads/fonts', f); return `data:font/${f.endsWith('.otf') ? 'otf' : 'ttf'};base64,${fs.readFileSync(fp).toString('base64')}`; };
// 제목 글씨체·자간 (2026-11-09 사용자 "자간 넓혀 줘, 답답해 보여") — --hfont gothic|pretendard|blackhan, --ls 자간(px)
const HF = { gothic: 'GothicA1-ExtraBold.ttf', pretendard: 'Pretendard-Bold.otf', blackhan: 'BlackHanSans-Regular.ttf', serif: 'NotoSerifKR-Black.ttf', batang: 'GowunBatang-Bold.ttf' }[A('--hfont', 'serif')] || 'Pretendard-Bold.otf';
const LS = A('--ls', '2');
// 꼬리표·체크 칩 글씨체 (2026-11-09 사용자 "너무 무난해서 눈에 안 띈다") — --cfont pretendard|jua|blackhan|gaegu
const CFN = { pretendard: 'Pretendard-Bold.otf', jua: 'Jua-Regular.ttf', blackhan: 'BlackHanSans-Regular.ttf', gaegu: 'Gaegu-Bold.ttf' }[A('--cfont', 'pretendard')] || 'Pretendard-Bold.otf';
const CSTROKE = /Pretendard/.test(CFN) ? 1 : 0;
const PH = A('--photo', ''); const photo = PH && fs.existsSync(PH) ? `data:image/png;base64,${fs.readFileSync(PH).toString('base64')}` : '';
// 배경 색 (2026-11-09 사용자 "회색 정장과 어울리는 배경, 동그라미는 모두 빼")
const THEMES = {
  greige: { bg: 'linear-gradient(120deg,#f3eee7 0%,#e6ddd1 55%,#d8ccbd 100%)', te: '#33505e', tl: '#e9eef0', hl: '#f2c9a9' },
  slate: { bg: 'linear-gradient(120deg,#eef1f4 0%,#dbe2e9 55%,#c6d0da 100%)', te: '#25496b', tl: '#e4ecf4', hl: '#ffd6a8' },
  sage: { bg: 'linear-gradient(120deg,#f0f2ec 0%,#dfe5da 55%,#cbd5c6 100%)', te: '#3c6455', tl: '#e6eee9', hl: '#f5cbb3' },
  deepgreen: { edge: '#12463d', bg: 'linear-gradient(90deg,#12463d 0%,#12463d 12%,#165448 45%,#144c42 72%,#12463d 90%,#12463d 100%)', te: '#9fe0c9', tl: '#e6f3ee', hl: 'rgba(255,199,140,.55)', dark: true, glow: 'rgba(120,200,170,.28)' },
  deepnavy: { bg: 'linear-gradient(120deg,#0f1f3a 0%,#152a4d 55%,#0c1830 100%)', te: '#9cc4ff', tl: '#e6eefb', hl: 'rgba(255,199,140,.55)', dark: true, glow: 'rgba(130,170,240,.28)' },
  teal: { bg: 'linear-gradient(120deg,#dcefeb 0%,#cfe7e2 45%,#bfdfd9 100%)', te: '#0d6b66', tl: '#e3f2ef', hl: '#ffc7b4' },
};
const TH = THEMES[A('--theme', 'deepgreen')] || THEMES.greige;
const TE = TH.dark ? (TH === THEMES.deepgreen ? '#13493f' : '#152a4d') : TH.te, TL = TH.tl, CO = '#ff7a59', INK = '#1f2a2e';
const IC = {
  // 보험금·실비: 병원 영수증(톱니 아래) + 돌려받는 돈(₩ 동전)
  bill: `<svg viewBox="0 0 64 64"><path d="M14 8h30v44l-3.75-3-3.75 3-3.75-3-3.75 3-3.75-3-3.75 3-3.75-3L14 52z" fill="#fff" stroke="${TE}" stroke-width="3" stroke-linejoin="round"/><path d="M29 15v8M25 19h8" stroke="${CO}" stroke-width="3" stroke-linecap="round"/><path d="M21 30h16M21 37h12" stroke="${TE}" stroke-width="3" stroke-linecap="round"/><circle cx="46" cy="44" r="12" fill="#ffd25e" stroke="#e0a92e" stroke-width="2.5"/><path d="M40 39l2.5 9 3.5-7 3.5 7 2.5-9M39 44h14" stroke="#8a5a00" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  // 병원비·돌봄: 병원 건물(십자) + 돌봄 하트
  care: `<svg viewBox="0 0 64 64"><path d="M10 54V24l14-8 14 8v30" fill="#fff" stroke="${TE}" stroke-width="3" stroke-linejoin="round"/><path d="M24 25v10M19 30h10" stroke="${CO}" stroke-width="3.2" stroke-linecap="round"/><path d="M17 54v-9h14v9" fill="none" stroke="${TE}" stroke-width="3" stroke-linejoin="round"/><path d="M6 54h32" stroke="${TE}" stroke-width="3" stroke-linecap="round"/><path d="M47 52c-9-6-13-10.5-13-15.5 0-4 3-7 6.5-7 2.8 0 4.8 1.6 6.5 4 1.7-2.4 3.7-4 6.5-4 3.5 0 6.5 3 6.5 7 0 5-4 9.5-13 15.5z" fill="${CO}"/></svg>`,
  // 지원금·제도: 나라 지원 서류(도장) + 돈 봉투
  won: `<svg viewBox="0 0 64 64"><rect x="10" y="8" width="30" height="38" rx="4" fill="#fff" stroke="${TE}" stroke-width="3"/><path d="M17 17h16M17 24h16M17 31h10" stroke="${TE}" stroke-width="3" stroke-linecap="round"/><circle cx="33" cy="38" r="6" fill="none" stroke="${CO}" stroke-width="2.6"/><rect x="28" y="34" width="30" height="22" rx="4" fill="#ffd25e" stroke="#e0a92e" stroke-width="2.5"/><path d="M28 37l15 10 15-10" fill="none" stroke="#e0a92e" stroke-width="2.5" stroke-linejoin="round"/><path d="M38 49l2 5 3-4 3 4 2-5" stroke="#8a5a00" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  insta: `<svg viewBox="0 0 64 64"><defs><linearGradient id="ig" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#FEDA75"/><stop offset=".35" stop-color="#FA7E1E"/><stop offset=".65" stop-color="#D62976"/><stop offset="1" stop-color="#4F5BD5"/></linearGradient></defs><rect x="6" y="6" width="52" height="52" rx="15" fill="url(#ig)"/><rect x="17" y="17" width="30" height="30" rx="9" fill="none" stroke="#fff" stroke-width="4"/><circle cx="32" cy="32" r="7.5" fill="none" stroke="#fff" stroke-width="4"/><circle cx="41.5" cy="22.5" r="2.5" fill="#fff"/></svg>`,
  kakao: `<svg viewBox="0 0 64 64"><rect x="6" y="6" width="52" height="52" rx="15" fill="#FEE500"/><path d="M32 17c-10 0-18 6.3-18 14 0 5 3.3 9.3 8.3 11.8l-2 7.4 8-5.2c1.2.2 2.4.3 3.7.3 10 0 18-6.3 18-14.1S42 17 32 17z" fill="#3A1D1D"/></svg>`,
};
// 카드 위쪽 사진 (--cardphotos 폴더에 ph2-bill.jpg·ph2-care.jpg·ph2-won.jpg 가 있으면)
const CP = A('--cardphotos', '');
const cph = n => { const f = CP && path.join(CP, `ph2-${n}.jpg`); return f && fs.existsSync(f) ? `data:image/jpeg;base64,${fs.readFileSync(f).toString('base64')}` : ''; };
const PHOTOS = { bill: cph('bill'), care: cph('care'), won: cph('won') };
// 바탕 무늬 (2026-11-09 사용자 "배경이 너무 밋밋") — 동그라미 없이: --pattern lines(빛줄기·사선 결) | waves(물결 선) | none
const PAT = A('--pattern', 'premium');
const premium = () => `<svg class="pat" width="1920" height="600"><defs>
<radialGradient id="g1" cx="62%" cy="38%" r="55%"><stop offset="0" stop-color="#2a7a66" stop-opacity=".55"/><stop offset="1" stop-color="#2a7a66" stop-opacity="0"/></radialGradient>
<radialGradient id="g2" cx="30%" cy="0%" r="45%"><stop offset="0" stop-color="#3d9c84" stop-opacity=".22"/><stop offset="1" stop-color="#3d9c84" stop-opacity="0"/></radialGradient>
<linearGradient id="sheen" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".06"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<linearGradient id="edgeL" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#12463d"/><stop offset="1" stop-color="#12463d" stop-opacity="0"/></linearGradient>
<linearGradient id="edgeR" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#12463d"/><stop offset="1" stop-color="#12463d" stop-opacity="0"/></linearGradient>
<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="5"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .05 0"/></filter></defs>
<rect width="1920" height="600" fill="url(#g1)"/><rect width="1920" height="600" fill="url(#g2)"/>
<polygon points="980,0 1260,0 900,600 620,600" fill="url(#sheen)"/>
<rect width="1920" height="600" filter="url(#grain)"/>
<rect x="0" y="0" width="300" height="600" fill="url(#edgeL)"/><rect x="1620" y="0" width="300" height="600" fill="url(#edgeR)"/></svg>`;
const pattern = () => {
  if (PAT === 'premium') return premium();
  if (PAT === 'none') return '';
  const lineCol = TH.dark ? 'rgba(255,255,255,' : 'rgba(30,50,60,';
  if (PAT === 'rings') { // 연한 동그라미 무늬 (2026-11-09 사용자 "동그라미로 연하게 해서 무늬로")
    let r = 7, rnd = () => (r = (r * 9301 + 49297) % 233280) / 233280;
    const soft = Array.from({ length: 34 }, () => { const x = rnd() * 1920, y = rnd() * 600, rr = 14 + rnd() * 60; return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${rr.toFixed(0)}" fill="${lineCol}${(0.025 + rnd() * 0.04).toFixed(3)})"/>`; }).join('');
    const ringsAt = (cx, cy, n, gap, a) => Array.from({ length: n }, (_, i) => `<circle cx="${cx}" cy="${cy}" r="${40 + i * gap}" fill="none" stroke="${lineCol}${(a - i * a / (n + 2)).toFixed(3)})" stroke-width="1.2"/>`).join('');
    return `<svg class="pat" width="1920" height="600">${soft}${ringsAt(170, 120, 9, 34, 0.09)}${ringsAt(1890, 560, 8, 36, 0.08)}${ringsAt(1250, 40, 5, 30, 0.06)}</svg>`;
  }
  if (PAT === 'waves') {
    const w = Array.from({ length: 9 }, (_, i) => `<path d="M-50 ${430 + i * 22} C 300 ${360 + i * 22}, 600 ${520 + i * 22}, 980 ${440 + i * 22} S 1600 ${360 + i * 22}, 1980 ${460 + i * 22}" stroke="${lineCol}${0.05 + i * 0.008})" stroke-width="1.5" fill="none"/>`).join('');
    const w2 = Array.from({ length: 6 }, (_, i) => `<path d="M-50 ${60 + i * 18} C 400 ${0 + i * 18}, 800 ${150 + i * 18}, 1300 ${70 + i * 18} S 1800 ${10 + i * 18}, 1980 ${90 + i * 18}" stroke="${lineCol}${0.04 + i * 0.006})" stroke-width="1.2" fill="none"/>`).join('');
    return `<svg class="pat" width="1920" height="600">${w}${w2}</svg>`;
  }
  const diag = Array.from({ length: 70 }, (_, i) => `<path d="M${i * 34 - 400} 600 L${i * 34} 0" stroke="${lineCol}.035)" stroke-width="1"/>`).join('');
  return `<svg class="pat" width="1920" height="600"><defs><linearGradient id="beam" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><linearGradient id="beam2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9fe0c9" stop-opacity=".12"/><stop offset="1" stop-color="#9fe0c9" stop-opacity="0"/></linearGradient></defs>${diag}
<polygon points="1180,0 1420,0 1000,600 760,600" fill="url(#beam)"/><polygon points="1470,0 1560,0 1180,600 1090,600" fill="url(#beam)" opacity=".7"/>
<polygon points="0,0 260,0 0,330" fill="url(#beam2)"/>
<path d="M0 560 L520 300" stroke="#e6c58a" stroke-opacity=".35" stroke-width="1.5"/><path d="M0 590 L600 290" stroke="#e6c58a" stroke-opacity=".18" stroke-width="1"/>
<path d="M1900 20 L1980 0" stroke="#e6c58a" stroke-opacity=".3"/></svg>`;
};
const COLS = [['bill', '보험금·실비', '실비 청구·진단비'], ['care', '병원비·돌봄', '의료비·간병·요양'], ['won', '지원금·제도', '놓치기 쉬운 혜택'], ['insta', '인스타그램', '카드뉴스로 쉽게'], ['kakao', '1:1 보험상담', '카카오톡으로 편하게']];
const X = k => 486 + k * 186;
const chk = `<svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="12" r="11" fill="${TE}"/><path d="M7 12.5l3.2 3.2L17 9" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:XB;src:url(${font('GothicA1-ExtraBold.ttf')})}
@font-face{font-family:HF;src:url(${font(HF)})}
@font-face{font-family:CF;src:url(${font(CFN)})}
@font-face{font-family:GB;src:url(${font('GothicA1-Bold.ttf')})}
@font-face{font-family:GM;src:url(${font('GothicA1-Medium.ttf')})}
@font-face{font-family:J;src:url(${font('Jua-Regular.ttf')})}
*{margin:0;box-sizing:border-box}body{width:1920px;height:600px;overflow:hidden}
.bn{position:relative;width:1920px;height:600px;overflow:hidden;background:radial-gradient(ellipse 300px 340px at 1600px 300px,${TH.glow || 'rgba(255,255,255,.75)'} 0%,rgba(255,255,255,0) 100%),${TH.bg};font-family:GM;color:${INK}}
${A('--chipstyle', 'glass') === 'glass' ? `.tag{background:#ffd54f !important;color:#13493f !important;-webkit-text-stroke:0 !important}.chip{background:rgba(8,40,34,.82) !important;border:1.5px solid rgba(255,213,79,.85) !important;color:#fff !important;-webkit-text-stroke:0 !important;box-shadow:0 6px 16px rgba(0,0,0,.35) !important}.chip b{color:#ffd54f !important;-webkit-text-stroke:0 !important}.chip svg circle{fill:#ffd54f}.chip svg path{stroke:#13493f}` : ''}
${TH.dark ? `.l1{color:#ffffff !important;font-size:46px !important;text-shadow:0 2px 10px rgba(0,0,0,.25)}.l2{color:#fff !important}.l2 em{color:#ffd54f !important;background:none !important;position:relative}.l2 em:after{content:'';position:absolute;left:2px;right:2px;bottom:-10px;height:6px;border-radius:3px;background:#ff6b4a}` : ''}
svg.deco,svg.pat{position:absolute;inset:0}
.tag{position:absolute;left:500px;top:100px;letter-spacing:1.2px;padding:7px 18px;border-radius:20px;background:#fff;color:${TE};font-family:CF;font-size:${/Gaegu/.test(CFN) ? 25 : 22}px;-webkit-text-stroke:${CSTROKE * .6}px ${TE}}
.h{position:absolute;left:498px;font-family:HF;letter-spacing:${LS}px;word-spacing:8px}
.l1{top:146px;font-size:44px;color:#3b474b}
.l2{top:194px;font-size:56px;color:${INK}}
.l2 em{font-style:normal;color:${TE};background:linear-gradient(transparent 62%,${TH.hl} 62%)}
.chips{position:absolute;left:500px;top:286px;display:flex;gap:12px}
.chip{display:flex;align-items:center;gap:8px;padding:8px 16px 8px 10px;border-radius:24px;background:#fff;border:1.5px solid #dfe7e4;font-family:CF;font-size:${/Gaegu/.test(CFN) ? 22 : 19}px;letter-spacing:1px;color:#22302f;-webkit-text-stroke:${CSTROKE * .5}px #22302f;box-shadow:0 4px 10px rgba(13,107,102,.06)}
.chip b{color:${TE};font-weight:normal;font-family:CF;-webkit-text-stroke:${CSTROKE * .6}px ${TE}}
.col{position:absolute;top:321px;width:170px;height:279px}
.card{position:absolute;left:4px;right:4px;top:22px;height:232px;border-radius:24px;background:#fff;box-shadow:0 10px 26px rgba(31,42,46,.10);border:1.5px solid #ece8e1;text-align:center}
.card .ic{width:78px;height:78px;margin:24px auto 0;border-radius:50%;background:${TL};display:flex;align-items:center;justify-content:center}
.card .ic svg{width:58px;height:58px}
.card .t{margin-top:16px;font-family:HF;font-size:21px;letter-spacing:1px;color:${INK}}
.card .s{margin-top:7px;font-size:14px;letter-spacing:.8px;color:#6c7678}
.card .go{position:absolute;left:0;right:0;bottom:16px;font-family:GB;font-size:14px;color:${TE}}
.card.p{padding:0;overflow:hidden}.card.p .pic{height:122px;background-size:cover;background-position:center}.card.p .t{margin-top:14px}.card.p .go{bottom:14px}
.card.k{background:#fff8c9;border-color:#f3e27a}.card.k .ic{background:#fff}.card.k .go{color:#5b4a00}
.card.i .ic{background:#fdeef3}.card.i .go{color:#c13584}
.circle{position:absolute;left:1440px;top:70px;width:440px;height:440px;border-radius:50%;background:radial-gradient(circle at 40% 35%,#1d8a83 0%,${TE} 70%,#0a5753 100%)}
.ring{position:absolute;left:1410px;top:40px;width:500px;height:500px;border-radius:50%;border:2px dashed rgba(255,255,255,.7)}
.ph{position:absolute;left:1440px;top:44px;height:556px;overflow:hidden}
.ph img{height:630px;display:block}
.bub{position:absolute;left:1150px;top:112px;padding:16px 24px;border-radius:24px;background:#fff;box-shadow:0 10px 24px rgba(0,0,0,.18);font-family:HF;font-size:23px;color:${INK};line-height:1.45;text-align:center;letter-spacing:.8px}
.bub:after{content:'';position:absolute;right:-16px;top:58px;border-width:12px 0 12px 20px;border-style:solid;border-color:transparent transparent transparent #fff}
.bub b{color:${CO};font-weight:normal}
.guide{position:absolute;top:321px;width:170px;height:279px;border:2px dashed rgba(220,40,40,.8)}
${A('--look', 'lux') === 'lux' ? `
.l1{color:#f6efe2 !important;text-shadow:0 3px 14px rgba(0,0,0,.55) !important}
.l2{color:#f6efe2 !important;text-shadow:0 3px 14px rgba(0,0,0,.55)}
.h.l2 em{color:transparent !important;background:linear-gradient(180deg,#fff3cf 0%,#f0cf86 45%,#c9963f 80%,#e8c37a 100%) !important;-webkit-background-clip:text !important;text-shadow:none !important;filter:drop-shadow(0 3px 10px rgba(0,0,0,.5))}
.h.l2 em:after{display:none !important}
.bn .tag{background:rgba(10,30,26,.75) !important;color:#f0cf86 !important;border:1.5px solid #d9b26a !important;-webkit-text-stroke:0 !important;letter-spacing:2px !important}
.bn .chip{background:rgba(10,30,26,.8) !important;border:1px solid rgba(217,178,106,.9) !important}
.bn .chip b{color:#f0cf86 !important}.bn .chip svg circle{fill:#d9b26a !important}
.bub b{color:#b8862f !important}` : ''}
${A('--look', 'lux') === 'lux' && /Serif|Batang/.test(HF) ? `.h{letter-spacing:0 !important;word-spacing:2px !important}.l1{font-size:42px !important}.l2{font-size:54px !important}` : ''}
</style></head><body><div class="bn">
${bgimg ? `<img src="${bgimg}" style="position:absolute;inset:0;width:1920px;height:600px">` : pattern()}
<div class="tag">보험, 어렵지 않게</div>
<div class="h l1">아플 때 받을 보험금,</div>
<div class="h l2"><em>놓치지 않게</em> 챙겨 드려요</div>
<div class="chips"><div class="chip">${chk}보험사 <b>34개사</b> 비교·분석</div><div class="chip">${chk}보험금 청구 <b>같이</b> 챙겨 드려요</div></div>
<div class="ph">${photo ? `<img src="${photo}">` : ''}</div>
<div class="bub">보험에 관한 궁금증은<br><b>${A('--name', '친근한 설계사')}</b>에게 편하게 물어보세요!</div>
${COLS.map(([ic, t, s], k) => `<div class="col" style="left:${X(k)}px"><div class="card ${ic === 'kakao' ? 'k' : ic === 'insta' ? 'i' : ''} ${PHOTOS[ic] ? 'p' : ''}">${PHOTOS[ic] ? `<div class="pic" style="background-image:url(${PHOTOS[ic]})"></div>` : `<div class="ic">${IC[ic]}</div>`}<div class="t">${t}</div><div class="s">${s}</div><div class="go">바로가기 ›</div></div></div>`).join('')}
${GUIDE ? [0, 1, 2, 3, 4].map(k => `<div class="guide" style="left:${X(k)}px"></div>`).join('') : ''}
</div></body></html>`;
const OUTN = A('--out', GUIDE ? 'fresh-banner-guide.png' : 'fresh-banner.png');
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1920, height: 600 } });
await p.setContent(html); await p.waitForTimeout(400);
await p.screenshot({ path: path.join(HERE, OUTN) }); await b.close(); console.log('ok');
