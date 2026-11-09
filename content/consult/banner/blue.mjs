// 성글벙글 상담 배너 — 하늘색판 (2026-11-09 사용자: GPT 시안 C 의 색 + 한다팀장 배너 같은 틀 + 본인 사진, "성대의 싱글벙글"·카톡 단추 뺌)
// node content/consult/banner/blue.mjs --name 이름 --photo 사람.png(배경 없는 PNG) [--guide] → blue-banner.png (저장소에 올리지 않음)
// 아래 5칸 = 네이버 링크 위젯 자리(x 486+186k · 가로 170 · 위 321~600). 상담 칸(카카오톡)이 있어 GOMS 심의 뒤 게시.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import { chromium } from 'playwright';
const HERE = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.resolve(HERE, '../../..');
const A = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const GUIDE = process.argv.includes('--guide');
const font = f => `data:font/ttf;base64,${fs.readFileSync(path.join(ROOT, 'scripts/lib/fonts', f)).toString('base64')}`;
const PH = A('--photo', ''); const photo = PH && fs.existsSync(PH) ? `data:image/png;base64,${fs.readFileSync(PH).toString('base64')}` : '';
const NAME = A('--name', '[이름]');
const B = '#1d4f9c', N = '#14275a';
const IC = {
  bill: `<svg viewBox="0 0 64 64"><rect x="14" y="10" width="32" height="42" rx="5" fill="none" stroke="${B}" stroke-width="4"/><path d="M22 22h16M22 30h16M22 38h9" stroke="${B}" stroke-width="4" stroke-linecap="round"/><path d="M46 34l10 4v7c0 6-4 9-10 11-6-2-10-5-10-11v-7z" fill="#4a86d8"/><path d="M41 45l4 4 6-7" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  med: `<svg viewBox="0 0 64 64"><path d="M32 54C12 40 6 30 10 20c4-9 15-10 22-1 7-9 18-8 22 1 4 10-2 20-22 34z" fill="#4a86d8"/><path d="M12 32h12l4-8 6 16 4-8h14" stroke="#fff" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  care: `<svg viewBox="0 0 64 64"><path d="M32 30c-8-6-12-10-12-15 0-4 3-7 6-7 3 0 5 2 6 4 1-2 3-4 6-4 3 0 6 3 6 7 0 5-4 9-12 15z" fill="#4a86d8"/><path d="M8 34l8 14c2 3 5 5 9 5h3V44l-8-9c-2-2-5-2-6 0M56 34l-8 14c-2 3-5 5-9 5h-3V44l8-9c2-2 5-2 6 0" stroke="${B}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  insta: `<svg viewBox="0 0 64 64"><rect x="10" y="10" width="44" height="44" rx="13" fill="none" stroke="${B}" stroke-width="5"/><circle cx="32" cy="32" r="10" fill="none" stroke="${B}" stroke-width="5"/><circle cx="44" cy="20" r="3" fill="${B}"/></svg>`,
  kakao: `<svg viewBox="0 0 64 64"><path d="M32 10C18 10 7 19 7 30c0 7 4 13 11 16l-3 10 11-7c2 .3 4 .5 6 .5 14 0 25-9 25-20S46 10 32 10z" fill="#4a86d8"/><circle cx="22" cy="30" r="3.5" fill="#fff"/><circle cx="32" cy="30" r="3.5" fill="#fff"/><circle cx="42" cy="30" r="3.5" fill="#fff"/></svg>`,
};
const COLS = [['bill', '실비·보험금', '청구 서류·기한'], ['med', '의료비·건강보험', '본인부담·환급'], ['care', '돌봄·요양', '간병·요양 제도'], ['insta', '인스타그램', '카드뉴스 보기'], ['kakao', '카카오톡 채널', '편하게 물어보기']];
const X = k => 486 + k * 186;
const cloud = (x, y, s, o) => `<g transform="translate(${x} ${y}) scale(${s})" opacity="${o}"><ellipse cx="0" cy="0" rx="60" ry="26" fill="#fff"/><ellipse cx="-28" cy="-14" rx="30" ry="24" fill="#fff"/><ellipse cx="18" cy="-22" rx="34" ry="30" fill="#fff"/></g>`;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:XB;src:url(${font('GothicA1-ExtraBold.ttf')})}
@font-face{font-family:GB;src:url(${font('GothicA1-Bold.ttf')})}
@font-face{font-family:GM;src:url(${font('GothicA1-Medium.ttf')})}
@font-face{font-family:P;src:url(${font('NanumPenScript-Regular.ttf')})}
*{margin:0;box-sizing:border-box}body{width:1920px;height:600px;overflow:hidden}
.bn{position:relative;width:1920px;height:600px;overflow:hidden;background:linear-gradient(100deg,#f7fbff 0%,#ffffff 38%,#eef5fe 70%,#dfeafa 100%);font-family:GM}
svg.deco{position:absolute;inset:0}
.h1{position:absolute;left:490px;top:104px;font-family:XB;font-size:64px;line-height:1.16;color:${N};letter-spacing:-1.5px}
.h1 em{font-style:normal;color:${B}}
.sign{position:absolute;left:990px;top:150px;font-family:P;font-size:150px;color:${B};transform:rotate(-7deg);text-shadow:0 4px 12px rgba(29,79,156,.15)}
.sign i{font-style:normal;font-family:GM;font-size:46px;color:#7fa8e0;margin-left:6px;vertical-align:10px}
.bar{position:absolute;left:0;top:338px;width:1452px;height:74px;background:linear-gradient(90deg,rgba(29,79,156,0) 0%,#2a5ca8 24%,${B} 70%,#173f80 100%);border-radius:0 40px 40px 0;box-shadow:0 8px 20px rgba(20,39,90,.18)}
.col{position:absolute;top:321px;width:170px;height:279px;text-align:center;color:#fff}
.col .t{position:absolute;left:0;right:0;top:26px;font-family:GB;font-size:22px;letter-spacing:-.5px}
.col .s{position:absolute;left:0;right:0;top:56px;font-size:15px;color:#d8e6fa}
.col .ic{position:absolute;left:35px;top:116px;width:100px;height:100px;border-radius:50%;background:#fff;box-shadow:0 8px 18px rgba(29,79,156,.14);display:flex;align-items:center;justify-content:center;border:2px solid #e1ebf8}
.col .ic svg{width:56px;height:56px}
.col .go{position:absolute;left:0;right:0;top:228px;font-family:GB;font-size:17px;color:${N}}
.sep{position:absolute;top:350px;width:2px;height:50px;background:rgba(255,255,255,.35)}
.ph{position:absolute;left:1370px;bottom:0;height:520px}
.ph img{height:520px;display:block;-webkit-mask-image:linear-gradient(90deg,transparent 0%,#000 16%,#000 100%)}
.ph .ghost{width:390px;height:520px;border:3px dashed #9bb8e2;border-bottom:0;border-radius:190px 190px 0 0;display:flex;align-items:center;justify-content:center;color:#6c8fc4;font-size:24px}
.nm{position:absolute;left:1770px;top:440px;font-family:XB;font-size:44px;color:${N};letter-spacing:2px}
.nm:before{content:'';position:absolute;left:-18px;top:12px;width:6px;height:36px;border-radius:3px;background:#4a86d8}
.guide{position:absolute;top:321px;width:170px;height:279px;border:2px dashed rgba(220,40,40,.7)}
</style></head><body><div class="bn">
<svg class="deco" width="1920" height="600">
<circle cx="1560" cy="250" r="230" fill="#e4eefc" opacity=".8"/><circle cx="210" cy="160" r="140" fill="#eef5fe"/>
${cloud(1240, 140, 1.1, .9)}${cloud(1830, 120, .9, .9)}${cloud(300, 520, 1.3, .7)}
<path d="M440 0 L440 600 M1300 0 L1300 600" stroke="#cddcf2" stroke-width="2"/>
<path d="M440 70 L1300 70" stroke="#cddcf2" stroke-width="2"/>
<path d="M1150 100 q 8 -12 16 0 q 8 -12 16 0 q 0 13 -16 22 q -16 -9 -16 -22z" fill="#9cc0ee"/>
<path d="M1888 300h12M1894 294v12M1330 300h10M1335 295v10" stroke="#9cc0ee" stroke-width="3" stroke-linecap="round"/>
</svg>
<div class="h1">병원비·보험금 걱정,<br><em>쉽게</em> 풀어 드려요</div>
<div class="sign">성글벙글<i>:)</i></div>
<div class="bar"></div>
${[1, 2, 3, 4].map(k => `<div class="sep" style="left:${X(k) - 9}px"></div>`).join('')}
${COLS.map(([ic, t, s], k) => `<div class="col" style="left:${X(k)}px"><div class="t">${t}</div><div class="s">${s}</div><div class="ic">${IC[ic]}</div><div class="go">바로가기 ›</div></div>`).join('')}
<div class="ph">${photo ? `<img src="${photo}">` : '<div class="ghost">사진 자리</div>'}</div>
<div class="nm">${NAME}</div>
${GUIDE ? [0, 1, 2, 3, 4].map(k => `<div class="guide" style="left:${X(k)}px"></div>`).join('') : ''}
</div></body></html>`;
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1920, height: 600 } });
await p.setContent(html); await p.waitForTimeout(300);
await p.screenshot({ path: path.join(HERE, GUIDE ? 'blue-banner-guide.png' : 'blue-banner.png') }); await b.close(); console.log('ok');
