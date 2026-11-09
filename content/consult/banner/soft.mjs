// 성글벙글이(성대의 싱글벙글) 부드러운 배너 (2026-11-09 사용자 — "나만의 스타일, 부드럽고 편안하게, 사진과 이름만").
// node content/consult/banner/soft.mjs [--guide 위젯 칸 점선] --name 이름 [--photo 사진.png(배경 없는 것)] → soft-banner.png (1920×600, 저장소에 올리지 않음)
// 위 0~85px 은 네이버 메뉴 자리, 글씨·사진은 글 칸(x 477~1443) 안. 상담 단추가 있어 GOMS 심의 뒤 게시.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import { chromium } from 'playwright';
const HERE = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.resolve(HERE, '../../..');
const A = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const font = f => `data:font/ttf;base64,${fs.readFileSync(path.join(ROOT, 'scripts/lib/fonts', f)).toString('base64')}`;
const PH = A('--photo', ''); const photo = PH && fs.existsSync(PH) ? `data:image/png;base64,${fs.readFileSync(PH).toString('base64')}` : '';
const NAME = A('--name', '[이름]');
// GPT 그림(PC 가 content/blog-banner/prompts.json 의 soft-* 를 Drive 블로그배너/ 로 만든 것)을 content/blog-banner/src/ 에 두면 바탕·카드 그림으로 쓴다.
const SRC = path.join(ROOT, 'content/blog-banner/src');
const gimg = s => { const f = path.join(SRC, `${s}.png`); return fs.existsSync(f) ? `data:image/png;base64,${fs.readFileSync(f).toString('base64')}` : ''; };
const BG = gimg('soft-bg'); const GUIDE = process.argv.includes('--guide');
// 아래 카드 5개 = 네이버 링크 위젯 자리(실측: 가로 170 · 사이 16 · x 486~ · 위 321~600). 그림 위 글자는 눌리지 않아 위젯이 링크를 맡는다.
const ICON = {
  bill: `<svg viewBox="0 0 64 64"><rect x="14" y="8" width="36" height="48" rx="6" fill="#fff" stroke="#6e8b6b" stroke-width="4"/><path d="M22 22h20M22 31h20M22 40h12" stroke="#6e8b6b" stroke-width="4" stroke-linecap="round"/><circle cx="46" cy="46" r="11" fill="#e2a07a"/><path d="M41 46l4 4 7-8" stroke="#fff" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  med: `<svg viewBox="0 0 64 64"><rect x="10" y="14" width="44" height="40" rx="10" fill="#fff" stroke="#6e8b6b" stroke-width="4"/><path d="M24 14v-4h16v4" stroke="#6e8b6b" stroke-width="4" fill="none"/><path d="M32 24v20M22 34h20" stroke="#e2a07a" stroke-width="6" stroke-linecap="round"/></svg>`,
  care: `<svg viewBox="0 0 64 64"><path d="M32 52C14 40 8 30 12 21c3-7 13-9 20 0 7-9 17-7 20 0 4 9-2 19-20 31z" fill="#f4cfae" stroke="#e2a07a" stroke-width="4" stroke-linejoin="round"/><path d="M8 50c8-2 14-2 20 2h10" stroke="#6e8b6b" stroke-width="4" fill="none" stroke-linecap="round"/></svg>`,
  insta: `<svg viewBox="0 0 64 64"><defs><linearGradient id="ig" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#FEDA75"/><stop offset=".4" stop-color="#FA7E1E"/><stop offset=".7" stop-color="#D62976"/><stop offset="1" stop-color="#4F5BD5"/></linearGradient></defs><rect x="4" y="4" width="56" height="56" rx="16" fill="url(#ig)"/><rect x="16" y="16" width="32" height="32" rx="10" fill="none" stroke="#fff" stroke-width="4"/><circle cx="32" cy="32" r="8" fill="none" stroke="#fff" stroke-width="4"/><circle cx="42" cy="22" r="2.5" fill="#fff"/></svg>`,
  kakao: `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#3A1D1D"/><path d="M32 15c-10.5 0-19 6.6-19 14.8 0 5.3 3.5 9.9 8.8 12.5l-2.2 8 8.4-5.5c1.3.2 2.6.3 4 .3 10.5 0 19-6.6 19-14.8S42.5 15 32 15z" fill="#FEE500"/></svg>`,
};
for (const k of ['bill', 'med', 'care']) { const g = gimg(`soft-ic-${k}`); if (g) ICON[k] = `<img class="gi" src="${g}">`; }
const CARDS = [
  ['bill', '실비·보험금', '청구 서류·기한'],
  ['med', '의료비·건강보험', '본인부담·환급'],
  ['care', '돌봄·요양', '간병·요양 제도'],
  ['insta', '인스타그램', '카드뉴스 보기', 'ig'],
  ['kakao', '카카오톡 채널', '편하게 물어보기', 'kk'],
];
const leaf = (x, y, r, s, c) => `<g transform="translate(${x} ${y}) rotate(${r}) scale(${s})"><path d="M0 0 C 30 -38, 90 -38, 120 0 C 90 38, 30 38, 0 0Z" fill="${c}"/><path d="M4 0 L116 0" stroke="rgba(255,255,255,.6)" stroke-width="3"/></g>`;
const sprig = (x, y, r, s, c) => `<g transform="translate(${x} ${y}) rotate(${r}) scale(${s})"><path d="M0 0 C 10 -80 0 -160 18 -240" stroke="${c}" stroke-width="6" fill="none" stroke-linecap="round"/>${[[-60, 160], [-110, 20], [-160, 165], [-210, 25]].map(([yy, rr]) => leaf(6, yy, rr, .5, c)).join('')}</g>`;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:J;src:url(${font('Jua-Regular.ttf')})}
@font-face{font-family:GM;src:url(${font('GothicA1-Medium.ttf')})}
@font-face{font-family:GB;src:url(${font('GothicA1-Bold.ttf')})}
@font-face{font-family:P;src:url(${font('NanumPenScript-Regular.ttf')})}
*{margin:0;box-sizing:border-box}body{width:1920px;height:600px;overflow:hidden}
.bn{position:relative;width:1920px;height:600px;background:linear-gradient(180deg,#fbf6ee 0%,#f6eee2 100%);overflow:hidden;font-family:GM;color:#4a4038}
svg.deco{position:absolute;inset:0}
.kick{position:absolute;left:500px;top:92px;font-family:P;font-size:38px;color:#8a7a68}
.kick b{font-weight:normal;color:#6e8b6b}
.title{position:absolute;left:494px;top:132px;font-family:J;font-size:104px;line-height:1.1;color:#5f7d5c;letter-spacing:2px;text-shadow:0 4px 0 rgba(110,139,107,.15)}
.title small{font-size:104px;color:#e2a07a}
.sub{position:absolute;left:504px;top:258px;font-family:GB;font-size:30px;color:#5a4e44}
.sub span{background:linear-gradient(transparent 58%,#f7d9b8 58%)}
.cat{position:absolute;top:321px;width:170px;height:279px}
.card{position:absolute;left:8px;right:8px;top:22px;bottom:22px;border-radius:28px;background:#fffdf9;border:2px solid #ece2d3;box-shadow:0 8px 18px rgba(120,90,60,.10);text-align:center;padding-top:30px}
.card .gi{width:100px;height:100px;object-fit:contain;display:block;margin:-8px auto 8px;mix-blend-mode:multiply}
.bgimg{position:absolute;inset:0;width:1920px;height:600px;object-fit:cover}
.card svg{width:84px;height:84px;display:block;margin:0 auto 16px}
.card b{display:block;font-family:J;font-size:24px;font-weight:normal;color:#4f6a4c;letter-spacing:-.5px}
.card span{display:block;margin-top:8px;font-family:GM;font-size:16px;color:#8a7a68}
.card.kk{background:#FEE500;border-color:#f3d900}.card.kk b{color:#3A1D1D}.card.kk span{color:#5b4a2a}
.card.ig{background:linear-gradient(160deg,#fff6ef,#fde9f0);border-color:#f6d6e2}.card.ig b{color:#b3456e}
.go{position:absolute;left:50%;bottom:22px;transform:translateX(-50%);width:34px;height:34px;border-radius:50%;background:rgba(110,139,107,.14);color:#6e8b6b;font-family:GB;font-size:20px;line-height:34px;text-align:center}
.kk .go{background:rgba(58,29,29,.12);color:#3A1D1D}.ig .go{background:rgba(179,69,110,.12);color:#b3456e}
.blob{position:absolute;left:1218px;top:86px;width:228px;height:228px;border-radius:46% 54% 50% 50%/52% 46% 54% 48%;background:radial-gradient(circle at 40% 35%,#fde6d2 0%,#f4cfae 70%,#efc39d 100%)}
.ring{position:absolute;left:1232px;top:96px;width:200px;height:200px;border-radius:50%;background:#fff;border:7px solid #fff;box-shadow:0 10px 22px rgba(120,90,60,.18);overflow:hidden}
.ring img{width:100%;height:100%;object-fit:cover;object-position:50% 15%}
.ring .ghost{width:100%;height:100%;background:#eef2ea;display:flex;align-items:center;justify-content:center;font-size:20px;color:#7d8f78}
.tag{position:absolute;left:1332px;top:272px;transform:translateX(-50%);background:#fff;border-radius:26px;padding:6px 24px;box-shadow:0 6px 14px rgba(120,90,60,.15);font-family:J;font-size:28px;color:#5f7d5c;white-space:nowrap}
.tag:before{content:'';display:inline-block;width:10px;height:10px;border-radius:50%;background:#e2a07a;margin-right:8px;vertical-align:middle}
.guide{position:absolute;top:321px;width:170px;height:279px;border:2px dashed rgba(40,90,220,.6)}
</style></head><body><div class="bn">
${BG ? `<img class="bgimg" src="${BG}">` : ''}
<svg class="deco" style="${BG ? 'display:none' : ''}" width="1920" height="600">
<circle cx="250" cy="240" r="160" fill="#f3e4d0" opacity=".7"/><circle cx="1720" cy="380" r="190" fill="#e7eddf" opacity=".8"/><circle cx="1660" cy="150" r="70" fill="#f8dcc6" opacity=".6"/><circle cx="380" cy="470" r="60" fill="#e7eddf" opacity=".8"/>
<path d="M0 540 C 300 500, 600 575, 960 548 S 1600 515, 1920 545 L1920 600 L0 600Z" fill="#ece2d3"/>
${sprig(160, 600, -14, 1.15, '#a9c09a')}${sprig(330, 600, 14, .8, '#c5d4b4')}${sprig(1790, 600, 14, 1.2, '#a9c09a')}${sprig(1610, 600, -12, .8, '#c5d4b4')}
${leaf(1530, 150, 25, .5, '#cfdcc0')}${leaf(420, 170, 150, .45, '#cfdcc0')}
<path d="M1490 120 q 10 -14 20 0 q 10 -14 20 0 q 0 16 -20 28 q -20 -12 -20 -28z" fill="#f2b8a0" opacity=".8"/>
<path d="M400 330 q 8 -11 16 0 q 8 -11 16 0 q 0 13 -16 22 q -16 -9 -16 -22z" fill="#f2b8a0" opacity=".7"/>
<path d="M1080 150 c 30 -20 60 -20 90 0" stroke="#e2a07a" stroke-width="4" fill="none" stroke-linecap="round" stroke-dasharray="2 12"/>
</svg>
<div class="kick"><b>성</b>대의 싱<b>글벙글</b> 생활보장 이야기</div>
<div class="title">성글벙글<small>이</small></div>
<div class="sub"><span>병원비·보험금, 편하게 물어보세요</span></div>
${CARDS.map(([ic, a, b, cls], k) => `<div class="cat" style="left:${486 + k * 186}px"><div class="card ${cls || ''}">${ICON[ic]}<b>${a}</b><span>${b}</span></div></div>`).join('')}
${GUIDE ? [0,1,2,3,4].map(k => `<div class="guide" style="left:${486 + k * 186}px"></div>`).join('') : ''}
<div class="blob"></div>
<div class="ring">${photo ? `<img src="${photo}">` : '<div class="ghost">사진 자리</div>'}</div>
<div class="tag">${NAME}</div>
</div></body></html>`;
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1920, height: 600 } });
await p.setContent(html); await p.waitForTimeout(300);
await p.screenshot({ path: path.join(HERE, GUIDE ? 'soft-banner-guide.png' : 'soft-banner.png') }); await b.close(); console.log('ok');
