// 상담 배너 — 나만의 판 (2026-11-09 사용자 "한다팀장 배너 느낌이 전혀 들지 않게"). 남색·금색·금 배지·붓 서명·탄색 띠 없음.
// 밝은 바탕 + 청록(신뢰) + 코랄(친근) 포인트, 말풍선·흰 카드. 1920×600, 아래 5칸 = 위젯 자리(x 486+186k · 가로 170 · 위 321~600).
// node content/consult/banner/fresh.mjs --photo 사람.png [--guide] → fresh-banner.png (저장소에 올리지 않음)
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import { chromium } from 'playwright';
const HERE = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.resolve(HERE, '../../..');
const A = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const GUIDE = process.argv.includes('--guide');
const font = f => `data:font/ttf;base64,${fs.readFileSync(path.join(ROOT, 'scripts/lib/fonts', f)).toString('base64')}`;
const PH = A('--photo', ''); const photo = PH && fs.existsSync(PH) ? `data:image/png;base64,${fs.readFileSync(PH).toString('base64')}` : '';
const TE = '#0d6b66', TL = '#e3f2ef', CO = '#ff7a59', INK = '#1f2a2e';
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
const COLS = [['bill', '보험금·실비', '실비 청구·진단비'], ['care', '병원비·돌봄', '의료비·간병·요양'], ['won', '지원금·제도', '놓치기 쉬운 혜택'], ['insta', '인스타그램', '카드뉴스로 쉽게'], ['kakao', '1:1 보험상담', '카카오톡으로 편하게']];
const X = k => 486 + k * 186;
const chk = `<svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="12" r="11" fill="${TE}"/><path d="M7 12.5l3.2 3.2L17 9" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:XB;src:url(${font('GothicA1-ExtraBold.ttf')})}
@font-face{font-family:GB;src:url(${font('GothicA1-Bold.ttf')})}
@font-face{font-family:GM;src:url(${font('GothicA1-Medium.ttf')})}
@font-face{font-family:J;src:url(${font('Jua-Regular.ttf')})}
*{margin:0;box-sizing:border-box}body{width:1920px;height:600px;overflow:hidden}
.bn{position:relative;width:1920px;height:600px;overflow:hidden;background:linear-gradient(180deg,#fbfaf7 0%,#f3f1ec 100%);font-family:GM;color:${INK}}
svg.deco{position:absolute;inset:0}
.tag{position:absolute;left:500px;top:96px;padding:7px 18px;border-radius:20px;background:${TL};color:${TE};font-family:GB;font-size:20px}
.h{position:absolute;left:498px;font-family:XB;letter-spacing:-1.5px}
.l1{top:140px;font-size:46px;color:#3b474b}
.l2{top:194px;font-size:62px;color:${INK}}
.l2 em{font-style:normal;color:${TE};background:linear-gradient(transparent 62%,#ffd9cc 62%)}
.chips{position:absolute;left:500px;top:276px;display:flex;gap:12px}
.chip{display:flex;align-items:center;gap:8px;padding:8px 16px 8px 10px;border-radius:24px;background:#fff;border:1.5px solid #dfe7e4;font-family:GB;font-size:17px;color:#33403f;box-shadow:0 4px 10px rgba(13,107,102,.06)}
.chip b{color:${TE};font-weight:normal;font-family:XB}
.col{position:absolute;top:321px;width:170px;height:279px}
.card{position:absolute;left:4px;right:4px;top:22px;height:232px;border-radius:24px;background:#fff;box-shadow:0 10px 26px rgba(31,42,46,.10);border:1.5px solid #ece8e1;text-align:center}
.card .ic{width:78px;height:78px;margin:24px auto 0;border-radius:50%;background:${TL};display:flex;align-items:center;justify-content:center}
.card .ic svg{width:58px;height:58px}
.card .t{margin-top:16px;font-family:XB;font-size:21px;letter-spacing:-.6px;color:${INK}}
.card .s{margin-top:7px;font-size:14px;color:#6c7678}
.card .go{position:absolute;left:0;right:0;bottom:16px;font-family:GB;font-size:14px;color:${TE}}
.card.p{padding:0;overflow:hidden}.card.p .pic{height:122px;background-size:cover;background-position:center}.card.p .t{margin-top:14px}.card.p .go{bottom:14px}
.card.k{background:#fff8c9;border-color:#f3e27a}.card.k .ic{background:#fff}.card.k .go{color:#5b4a00}
.card.i .ic{background:#fdeef3}.card.i .go{color:#c13584}
.circle{position:absolute;left:1440px;top:70px;width:440px;height:440px;border-radius:50%;background:radial-gradient(circle at 40% 35%,#1d8a83 0%,${TE} 70%,#0a5753 100%)}
.ring{position:absolute;left:1410px;top:40px;width:500px;height:500px;border-radius:50%;border:2px dashed rgba(13,107,102,.25)}
.ph{position:absolute;left:1490px;top:44px;height:556px;overflow:hidden}
.ph img{height:630px;display:block}
.bub{position:absolute;left:1268px;top:118px;padding:14px 22px;border-radius:22px 22px 4px 22px;background:#fff;box-shadow:0 10px 24px rgba(31,42,46,.12);font-family:J;font-size:26px;color:${INK};line-height:1.3;text-align:center}
.bub b{color:${CO};font-weight:normal}
.guide{position:absolute;top:321px;width:170px;height:279px;border:2px dashed rgba(220,40,40,.8)}
</style></head><body><div class="bn">
<svg class="deco" width="1920" height="600">
<circle cx="250" cy="150" r="190" fill="${TL}" opacity=".6"/><circle cx="330" cy="470" r="90" fill="#ffe8df" opacity=".7"/>
<g fill="${TE}" opacity=".18">${Array.from({ length: 36 }, (_, i) => `<circle cx="${1300 + (i % 6) * 18}" cy="${430 + Math.floor(i / 6) * 18}" r="3"/>`).join('')}</g>
<circle cx="1840" cy="560" r="70" fill="#ffe8df" opacity=".8"/>
</svg>
<div class="tag">보험, 어렵지 않게</div>
<div class="h l1">아플 때 받을 보험금,</div>
<div class="h l2"><em>놓치지 않게</em> 챙겨 드려요</div>
<div class="chips"><div class="chip">${chk}보험사 <b>34개사</b> 비교·분석</div><div class="chip">${chk}보험금 청구 <b>같이</b> 챙겨 드려요</div></div>
<div class="ring"></div><div class="circle"></div>
<div class="ph">${photo ? `<img src="${photo}">` : ''}</div>
<div class="bub">궁금한 건<br><b>강팀장</b>에게 편하게!</div>
${COLS.map(([ic, t, s], k) => `<div class="col" style="left:${X(k)}px"><div class="card ${ic === 'kakao' ? 'k' : ic === 'insta' ? 'i' : ''} ${PHOTOS[ic] ? 'p' : ''}">${PHOTOS[ic] ? `<div class="pic" style="background-image:url(${PHOTOS[ic]})"></div>` : `<div class="ic">${IC[ic]}</div>`}<div class="t">${t}</div><div class="s">${s}</div><div class="go">바로가기 ›</div></div></div>`).join('')}
${GUIDE ? [0, 1, 2, 3, 4].map(k => `<div class="guide" style="left:${X(k)}px"></div>`).join('') : ''}
</div></body></html>`;
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1920, height: 600 } });
await p.setContent(html); await p.waitForTimeout(400);
await p.screenshot({ path: path.join(HERE, GUIDE ? 'fresh-banner-guide.png' : 'fresh-banner.png') }); await b.close(); console.log('ok');
