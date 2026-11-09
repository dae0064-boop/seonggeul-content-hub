// 상담 배너 시안 (2026-11-09 사용자 "생활보장 상담을 유도하는 배너") — 1920×600, 네이버 블로그 타이틀 칸.
// node content/consult/banner/render.mjs --name 이름 --role 직함 --contact 연락처 [--photo 사진.png] [--review 심의필 문구] → consult-banner.png
// 이름·연락처는 저장소(공개)에 적지 않고 실행할 때 넘긴다. 결과 PNG 도 올리지 않는다(.gitignore).
// ⚠ 상담 권유·이름·연락처가 들어가므로 GOMS 심의(적격 + 심의필번호) 뒤에만 블로그에 올린다.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import { chromium } from 'playwright';
const HERE = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.resolve(HERE, '../../..');
const font = f => `data:font/ttf;base64,${fs.readFileSync(path.join(ROOT, 'scripts/lib/fonts', f)).toString('base64')}`;
const A = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const PH = A('--photo', '');
const photo = PH && fs.existsSync(PH) ? `data:image/png;base64,${fs.readFileSync(PH).toString('base64')}` : '';
const T = { name: A('--name', '[이름]'), role: A('--role', '[직함]'), contact: A('--contact', '[연락처]'), review: A('--review', '준법감시인 심의필 제[ ]호 (20[ ].[ ].[ ]~20[ ].[ ].[ ])') };
const MENU = [['실비·보험금', '청구 서류·기한'], ['검진·질병', '검사·진단 정보'], ['의료비·건강보험', '본인부담·환급'], ['돌봄·요양', '간병·요양 제도'], ['지원 제도', '나라 지원 찾기']];
const ICONS = [
 ['카카오톡 상담', `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#FEE500"/><path d="M32 17c-10 0-18 6-18 14 0 5 3 9 8 11l-2 7 8-5h4c10 0 18-6 18-13s-8-14-18-14z" fill="#3A1D1D"/></svg>`],
 ['톡톡 문의', `<svg viewBox="0 0 64 64"><rect x="4" y="4" width="56" height="56" rx="16" fill="#03C75A"/><path d="M18 20h28a4 4 0 0 1 4 4v14a4 4 0 0 1-4 4H30l-9 7v-7h-3a4 4 0 0 1-4-4V24a4 4 0 0 1 4-4z" fill="#fff"/><circle cx="26" cy="31" r="3" fill="#03C75A"/><circle cx="38" cy="31" r="3" fill="#03C75A"/></svg>`],
 ['인스타그램', `<svg viewBox="0 0 64 64"><defs><linearGradient id="ig" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#FEDA75"/><stop offset=".4" stop-color="#FA7E1E"/><stop offset=".7" stop-color="#D62976"/><stop offset="1" stop-color="#4F5BD5"/></linearGradient></defs><rect x="4" y="4" width="56" height="56" rx="16" fill="url(#ig)"/><rect x="16" y="16" width="32" height="32" rx="10" fill="none" stroke="#fff" stroke-width="4"/><circle cx="32" cy="32" r="8" fill="none" stroke="#fff" stroke-width="4"/><circle cx="42" cy="22" r="2.5" fill="#fff"/></svg>`],
 ['블로그 이웃추가', `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#fff"/><path d="M20 22h24v20H20z" fill="none" stroke="#14224a" stroke-width="4" stroke-linejoin="round"/><path d="M26 30h12M26 36h8" stroke="#14224a" stroke-width="4" stroke-linecap="round"/></svg>`],
];
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:G;src:url(${font('GothicA1-ExtraBold.ttf')})}
@font-face{font-family:GM;src:url(${font('GothicA1-Medium.ttf')})}
@font-face{font-family:GB;src:url(${font('GothicA1-Bold.ttf')})}
@font-face{font-family:P;src:url(${font('NanumPenScript-Regular.ttf')})}
*{margin:0;box-sizing:border-box}
body{width:1920px;height:600px;overflow:hidden}
.bn{position:relative;width:1920px;height:600px;background:radial-gradient(ellipse at 70% 40%,#1f2f5c 0%,#121c3d 45%,#0b1230 100%);font-family:GM;color:#fff;overflow:hidden}
.ln{position:absolute;border:2px solid rgba(201,162,92,.55)}
.gold{background:linear-gradient(180deg,#f8e2a6 0%,#d9ae5b 45%,#b98a3a 70%,#e9c97f 100%);-webkit-background-clip:text;color:transparent}
.kick{position:absolute;left:480px;top:96px;font-family:P;font-size:40px;color:#f3e3bd}
.h1{position:absolute;left:480px;top:140px;font-family:G;font-size:62px;line-height:1.18;letter-spacing:-1px}
.h1 b{font-weight:normal}
.sign{position:absolute;left:985px;top:270px;font-family:P;font-size:130px;transform:rotate(-8deg);filter:drop-shadow(0 4px 10px rgba(0,0,0,.4))}
.cta{position:absolute;left:480px;top:318px;width:470px;height:84px;border-radius:44px;background:linear-gradient(180deg,#fbe7b0 0%,#e2b866 48%,#bf8f3f 52%,#e8c67c 100%);box-shadow:0 0 0 3px #f5dc9c inset,0 10px 28px rgba(0,0,0,.45),0 0 40px rgba(240,200,110,.25);display:flex;align-items:center;justify-content:center;gap:16px;font-family:G;font-size:40px;color:#1b2547}
.cta svg{width:46px;height:46px}
.bar{position:absolute;left:0;top:428px;width:1460px;height:62px;background:linear-gradient(90deg,rgba(176,134,72,.0) 0%,#b08648 22%,#c39a5a 60%,#b08648 100%);display:flex;padding-left:470px}
.bar div{width:194px;text-align:center;border-right:2px solid rgba(255,255,255,.45);padding-top:7px}
.bar div:last-child{border-right:0}
.bar b{display:block;font-family:GB;font-size:22px;font-weight:normal}
.bar span{font-size:15px;color:#fff6e3}
.ic{position:absolute;top:506px;left:490px;display:flex;gap:70px}
.ic div{text-align:center;width:130px;font-family:GB;font-size:17px}
.ic svg{width:48px;height:48px;display:block;margin:0 auto 6px}
.ph{position:absolute;left:1440px;top:70px;width:400px;height:530px;display:flex;align-items:flex-end;justify-content:center}
.ph img{height:530px;object-fit:contain}
.ph .ghost{width:340px;height:500px;border:3px dashed rgba(243,227,189,.6);border-bottom:0;border-radius:170px 170px 0 0;display:flex;align-items:center;justify-content:center;font-size:26px;color:#f3e3bd;text-align:center;line-height:1.5}
.badge{position:absolute;width:132px;height:132px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff3c7 0%,#e8c36f 40%,#b8873a 100%);box-shadow:0 8px 20px rgba(0,0,0,.45),0 0 0 4px rgba(255,236,180,.5) inset;color:#3b2a0e;text-align:center;display:flex;flex-direction:column;justify-content:center;font-family:GB;font-size:17px;line-height:1.3}
.badge b{font-family:G;font-size:26px;font-weight:normal}
.who{position:absolute;right:50px;top:455px;text-align:right;text-shadow:0 2px 8px rgba(0,0,0,.7)}
.who .n{font-family:G;font-size:34px}.who .n small{font-family:GM;font-size:22px;margin-left:8px}
.who .c{font-family:GB;font-size:26px;margin-top:6px;color:#f3e3bd}
.rv{position:absolute;right:24px;bottom:10px;font-size:14px;color:rgba(255,255,255,.75)}
.star{position:absolute;width:6px;height:6px;border-radius:50%;background:#fff;box-shadow:0 0 12px 4px rgba(255,240,200,.9)}
</style></head><body><div class="bn">
<div class="ln" style="left:440px;top:-20px;width:600px;height:700px;border-bottom:0"></div>
<div class="ln" style="left:1290px;top:-60px;width:2px;height:700px;border-width:0 0 0 2px"></div>
<div class="star" style="left:470px;top:150px"></div><div class="star" style="left:1180px;top:120px"></div><div class="star" style="left:1350px;top:130px"></div><div class="star" style="left:1300px;top:400px"></div>
<div class="kick">병원비 앞에서 혼자 헤매지 않게~</div>
<div class="h1">아플 때 꼭 필요한<br><span class="gold">보험금 청구</span>, 함께 챙겨요</div>
<div class="sign gold">성글벙글</div>
<div class="cta"><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#1b2547"/><path d="M32 16c-9 0-16 5.5-16 12.5 0 4.5 3 8.3 7.4 10.4l-1.8 6.6 7.2-4.6c1 .1 2.1.2 3.2.2 9 0 16-5.5 16-12.6S41 16 32 16z" fill="#FEE500"/></svg>카카오톡 1:1 상담</div>
<div class="bar">${MENU.map(([a, b]) => `<div><b>${a}</b><span>${b}</span></div>`).join('')}</div>
<div class="ic">${ICONS.map(([n, s]) => `<div>${s}${n}</div>`).join('')}</div>
<div class="ph">${photo ? `<img src="${photo}">` : '<div class="ghost">설계사 사진 자리<br>(허리 위, 배경 없는 PNG)</div>'}</div>
<div class="badge" style="left:1330px;top:150px"><span>내 보험</span><b>1:1</b><span>보장 점검</span></div>
<div class="badge" style="left:1330px;top:300px"><span>실비·보험금</span><b>청구</b><span>서류 안내</span></div>
<div class="who"><div class="n">${T.name}<small>| ${T.role}</small></div><div class="c">${T.contact}</div></div>
<div class="rv">${T.review}</div>
</div></body></html>`;
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1920, height: 600 } });
await p.setContent(html); await p.waitForTimeout(300);
await p.screenshot({ path: path.join(HERE, 'consult-banner.png') }); await b.close(); console.log('ok');
