// 상담 배너 (2026-11-09 사용자와 하나씩 정함) — 1920×600, 네이버 블로그 타이틀 칸.
// node content/consult/banner/pro.mjs --photo 사람.png(배경 없는 PNG) [--guide] → pro-banner.png (저장소에 올리지 않음)
// 아래 5칸 = 네이버 링크 위젯 자리(x 486+186k · 가로 170 · 위 321~600). 블로그 배너는 심의 대상 아님(사용자).
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import { chromium } from 'playwright';
const HERE = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.resolve(HERE, '../../..');
const A = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const GUIDE = process.argv.includes('--guide');
const font = f => `data:font/ttf;base64,${fs.readFileSync(path.join(ROOT, 'scripts/lib/fonts', f)).toString('base64')}`;
const PH = A('--photo', ''); const photo = PH && fs.existsSync(PH) ? `data:image/png;base64,${fs.readFileSync(PH).toString('base64')}` : '';
const T = {
  kick: A('--kick', '보험, 어렵지 않게~'),
  l1: A('--l1', '아플 때 받을 보험금,'),
  l2: A('--l2', '놓치지 않게 챙겨 드려요'),
  sign: A('--sign', '강팀장'),
};
const W = '#fff', G = '#e6c58a';
const IC = {
  bill: `<svg viewBox="0 0 64 64"><rect x="14" y="8" width="36" height="48" rx="5" fill="none" stroke="${W}" stroke-width="3.5"/><path d="M22 20h20M22 28h20M22 36h12" stroke="${W}" stroke-width="3.5" stroke-linecap="round"/><circle cx="45" cy="46" r="10" fill="${G}"/><path d="M40 46l4 4 6-7" stroke="#14254f" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  care: `<svg viewBox="0 0 64 64"><path d="M32 30c-8-6-12-10-12-15 0-4 3-7 6-7 3 0 5 2 6 4 1-2 3-4 6-4 3 0 6 3 6 7 0 5-4 9-12 15z" fill="${G}"/><path d="M8 34l8 14c2 3 5 5 9 5h3V44l-8-9c-2-2-5-2-6 0M56 34l-8 14c-2 3-5 5-9 5h-3V44l8-9c2-2 5-2 6 0" stroke="${W}" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  won: `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="24" fill="none" stroke="${W}" stroke-width="3.5"/><path d="M20 24l6 18 6-14 6 14 6-18M18 32h28" stroke="${G}" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  insta: `<svg viewBox="0 0 64 64"><defs><linearGradient id="ig" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#FEDA75"/><stop offset=".35" stop-color="#FA7E1E"/><stop offset=".65" stop-color="#D62976"/><stop offset="1" stop-color="#4F5BD5"/></linearGradient></defs><rect x="6" y="6" width="52" height="52" rx="15" fill="url(#ig)"/><rect x="17" y="17" width="30" height="30" rx="9" fill="none" stroke="#fff" stroke-width="4"/><circle cx="32" cy="32" r="7.5" fill="none" stroke="#fff" stroke-width="4"/><circle cx="41.5" cy="22.5" r="2.5" fill="#fff"/></svg>`,
  kakao: `<svg viewBox="0 0 64 64"><rect x="6" y="6" width="52" height="52" rx="15" fill="#FEE500"/><path d="M32 17c-10 0-18 6.3-18 14 0 5 3.3 9.3 8.3 11.8l-2 7.4 8-5.2c1.2.2 2.4.3 3.7.3 10 0 18-6.3 18-14.1S42 17 32 17z" fill="#3A1D1D"/></svg>`,
};
const COLS = [['bill', '보험금·실비', '실비 청구·진단비'], ['care', '병원비·돌봄', '의료비·간병·요양'], ['won', '지원금·제도', '놓치기 쉬운 혜택'], ['insta', '인스타그램', '카드뉴스로 쉽게'], ['kakao', '1:1 보험상담', '카카오톡으로 편하게']];
const X = k => 486 + k * 186;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:XB;src:url(${font('GothicA1-ExtraBold.ttf')})}
@font-face{font-family:GB;src:url(${font('GothicA1-Bold.ttf')})}
@font-face{font-family:GM;src:url(${font('GothicA1-Medium.ttf')})}
@font-face{font-family:P;src:url(${font('NanumPenScript-Regular.ttf')})}
*{margin:0;box-sizing:border-box}body{width:1920px;height:600px;overflow:hidden}
.bn{position:relative;width:1920px;height:600px;overflow:hidden;background:radial-gradient(ellipse 900px 520px at 1560px 260px,#22386e 0%,rgba(34,56,110,0) 70%),linear-gradient(115deg,#0a1230 0%,#0f1d45 55%,#0b1536 100%);font-family:GM;color:#fff}
svg.deco{position:absolute;inset:0}
.gold{background:linear-gradient(180deg,#fbe9be 0%,#e2bd76 45%,#b8873e 75%,#e9c98a 100%);-webkit-background-clip:text;color:transparent}
.kick{position:absolute;left:500px;top:78px;font-family:P;font-size:36px;color:#f1e2bf}
.h{position:absolute;left:494px;font-family:XB;letter-spacing:-1.5px;text-shadow:0 4px 14px rgba(0,0,0,.35)}
.l1{top:120px;font-size:50px}.l2{top:178px;font-size:64px}
.sign{position:absolute;left:1210px;top:150px;font-family:P;font-size:120px;transform:rotate(-8deg);filter:drop-shadow(0 4px 10px rgba(0,0,0,.45))}
.bar{position:absolute;left:0;top:338px;width:1470px;height:78px;background:linear-gradient(90deg,rgba(176,134,82,0) 0%,#a98252 20%,#c39a62 55%,#b48a55 100%);box-shadow:0 8px 20px rgba(0,0,0,.25)}
.col{position:absolute;top:321px;width:170px;height:279px;text-align:center}
.col .t{position:absolute;left:0;right:0;top:27px;font-family:GB;font-size:23px;letter-spacing:-.5px}
.col .s{position:absolute;left:0;right:0;top:61px;font-size:14px;color:#fff3dc}
.col .ic{position:absolute;left:50px;top:126px;width:70px;height:70px}
.col .ic svg{width:70px;height:70px}
.col .go{position:absolute;left:0;right:0;top:212px;font-family:GB;font-size:16px;color:#e9dcc0}
.sep{position:absolute;top:352px;width:2px;height:50px;background:rgba(255,255,255,.5)}
.ph{position:absolute;left:1440px;top:40px;height:560px;overflow:hidden}
.ph img{height:700px;display:block}
.badge{position:absolute;width:150px;height:150px;border-radius:50%;background:radial-gradient(circle at 35% 28%,#fff6d6 0%,#ecc97e 38%,#c0903f 78%,#a3772f 100%);box-shadow:0 10px 24px rgba(0,0,0,.45),inset 0 0 0 4px rgba(255,240,200,.55),inset 0 0 0 9px rgba(160,115,45,.35);color:#3a2a10;text-align:center;display:flex;flex-direction:column;justify-content:center;font-family:GB;font-size:16px;line-height:1.35}
.badge b{font-family:XB;font-size:30px;font-weight:normal;color:#2a1d08;line-height:1.15}
.star{position:absolute;width:5px;height:5px;border-radius:50%;background:#fff;box-shadow:0 0 14px 5px rgba(255,236,190,.85)}
.guide{position:absolute;top:321px;width:170px;height:279px;border:2px dashed rgba(255,80,80,.8)}
</style></head><body><div class="bn">
<svg class="deco" width="1920" height="600">
<path d="M440 600 L440 70 L760 -10" stroke="#a98252" stroke-width="2" fill="none" opacity=".75"/>
<path d="M470 600 L470 100 L800 18" stroke="#a98252" stroke-width="1.2" fill="none" opacity=".45"/>
<path d="M1320 -10 L1320 600" stroke="#a98252" stroke-width="1.5" opacity=".4"/>
<path d="M1050 -10 L1400 80" stroke="#a98252" stroke-width="1.5" opacity=".35"/>
</svg>
<div class="star" style="left:478px;top:150px"></div><div class="star" style="left:1180px;top:110px"></div><div class="star" style="left:1300px;top:300px"></div>
<div class="kick">${T.kick}</div>
<div class="h l1">${T.l1}</div>
<div class="h l2">${T.l2}</div>
<div class="sign gold">${T.sign}</div>
<div class="ph">${photo ? `<img src="${photo}">` : ''}</div>
<div class="bar"></div>
${[1, 2, 3, 4].map(k => `<div class="sep" style="left:${X(k) - 9}px"></div>`).join('')}
${COLS.map(([ic, t, s], k) => `<div class="col" style="left:${X(k)}px"><div class="t">${t}</div><div class="s">${s}</div><div class="ic">${IC[ic]}</div><div class="go">바로가기 ›</div></div>`).join('')}
<div class="badge" style="left:1770px;top:110px"><span>보험사</span><b>34개사</b><span>비교·분석</span></div>
<div class="badge" style="left:1770px;top:280px"><span>보험금 청구</span><b>같이</b><span>챙겨 드려요</span></div>
${GUIDE ? [0, 1, 2, 3, 4].map(k => `<div class="guide" style="left:${X(k)}px"></div>`).join('') : ''}
</div></body></html>`;
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1920, height: 600 } });
await p.setContent(html); await p.waitForTimeout(400);
await p.screenshot({ path: path.join(HERE, GUIDE ? 'pro-banner-guide.png' : 'pro-banner.png') }); await b.close(); console.log('ok');
