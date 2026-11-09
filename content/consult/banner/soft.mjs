// 성글벙글이(성대의 싱글벙글) 부드러운 배너 (2026-11-09 사용자 — "나만의 스타일, 부드럽고 편안하게, 사진과 이름만").
// node content/consult/banner/soft.mjs --name 이름 [--photo 사진.png(배경 없는 것)] → soft-banner.png (1920×600, 저장소에 올리지 않음)
// 위 0~85px 은 네이버 메뉴 자리, 글씨·사진은 글 칸(x 477~1443) 안. 상담 단추가 있어 GOMS 심의 뒤 게시.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import { chromium } from 'playwright';
const HERE = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.resolve(HERE, '../../..');
const A = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const font = f => `data:font/ttf;base64,${fs.readFileSync(path.join(ROOT, 'scripts/lib/fonts', f)).toString('base64')}`;
const PH = A('--photo', ''); const photo = PH && fs.existsSync(PH) ? `data:image/png;base64,${fs.readFileSync(PH).toString('base64')}` : '';
const NAME = A('--name', '[이름]');
const CHIPS = ['실비·보험금', '검진·질병', '의료비·건강보험', '돌봄·요양', '지원 제도'];
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
.kick{position:absolute;left:520px;top:118px;font-family:P;font-size:44px;color:#8a7a68}
.kick b{font-weight:normal;color:#6e8b6b}
.title{position:absolute;left:512px;top:158px;font-family:J;font-size:118px;color:#5f7d5c;letter-spacing:2px;text-shadow:0 4px 0 rgba(110,139,107,.15)}
.title small{font-size:118px;color:#e2a07a}
.sub{position:absolute;left:522px;top:300px;font-family:GB;font-size:34px;color:#5a4e44}
.sub span{background:linear-gradient(transparent 58%,#f7d9b8 58%)}
.cta{position:absolute;left:520px;top:368px;height:64px;padding:0 34px 0 18px;border-radius:32px;background:#6e8b6b;color:#fff;font-family:GB;font-size:26px;display:flex;align-items:center;gap:12px;box-shadow:0 6px 16px rgba(95,125,92,.28)}
.cta i{width:38px;height:38px;border-radius:50%;background:#FEE500;display:flex;align-items:center;justify-content:center}
.chips{position:absolute;left:520px;top:462px;display:flex;gap:12px}
.chips div{padding:10px 20px;border-radius:24px;background:#fff;border:2px solid #e6dccd;font-family:GB;font-size:20px;color:#6b5d50}
.blob{position:absolute;left:1140px;top:96px;width:330px;height:330px;border-radius:46% 54% 50% 50%/52% 46% 54% 48%;background:radial-gradient(circle at 40% 35%,#fde6d2 0%,#f4cfae 70%,#efc39d 100%)}
.ring{position:absolute;left:1158px;top:112px;width:296px;height:296px;border-radius:50%;background:#fff;border:8px solid #fff;box-shadow:0 10px 26px rgba(120,90,60,.18);overflow:hidden;display:flex;align-items:flex-end;justify-content:center}
.ring img{width:100%;height:100%;object-fit:cover;object-position:50% 15%}
.ring .ghost{width:100%;height:100%;background:#eef2ea;display:flex;align-items:center;justify-content:center;text-align:center;font-size:22px;color:#7d8f78;line-height:1.5}
.tag{position:absolute;left:1306px;top:392px;transform:translateX(-50%);background:#fff;border-radius:30px;padding:10px 30px;box-shadow:0 6px 16px rgba(120,90,60,.15);font-family:J;font-size:34px;color:#5f7d5c;white-space:nowrap}
.tag:before{content:'';display:inline-block;width:12px;height:12px;border-radius:50%;background:#e2a07a;margin-right:10px;vertical-align:middle}
.hello{position:absolute;left:1340px;top:470px;font-family:P;font-size:36px;color:#8a7a68;transform:rotate(-4deg)}
</style></head><body><div class="bn">
<svg class="deco" width="1920" height="600">
<circle cx="250" cy="240" r="160" fill="#f3e4d0" opacity=".7"/><circle cx="1720" cy="380" r="190" fill="#e7eddf" opacity=".8"/><circle cx="1660" cy="150" r="70" fill="#f8dcc6" opacity=".6"/><circle cx="380" cy="470" r="60" fill="#e7eddf" opacity=".8"/>
<path d="M0 540 C 300 500, 600 575, 960 548 S 1600 515, 1920 545 L1920 600 L0 600Z" fill="#ece2d3"/>
${sprig(160, 600, -14, 1.15, '#a9c09a')}${sprig(330, 600, 14, .8, '#c5d4b4')}${sprig(1790, 600, 14, 1.2, '#a9c09a')}${sprig(1610, 600, -12, .8, '#c5d4b4')}
${leaf(1530, 150, 25, .5, '#cfdcc0')}${leaf(420, 170, 150, .45, '#cfdcc0')}
<path d="M1490 120 q 10 -14 20 0 q 10 -14 20 0 q 0 16 -20 28 q -20 -12 -20 -28z" fill="#f2b8a0" opacity=".8"/>
<path d="M470 400 q 8 -11 16 0 q 8 -11 16 0 q 0 13 -16 22 q -16 -9 -16 -22z" fill="#f2b8a0" opacity=".7"/>
<path d="M1080 150 c 30 -20 60 -20 90 0" stroke="#e2a07a" stroke-width="4" fill="none" stroke-linecap="round" stroke-dasharray="2 12"/>
</svg>
<div class="kick"><b>성</b>대의 싱<b>글벙글</b> 생활보장 이야기</div>
<div class="title">성글벙글<small>이</small></div>
<div class="sub"><span>병원비·보험금, 편하게 물어보세요</span></div>
<div class="cta"><i><svg width="24" height="24" viewBox="0 0 64 64"><path d="M32 12c-12 0-22 7.5-22 17 0 6 4 11.3 10 14l-2.5 9 9.5-6.2c1.6.2 3.2.3 5 .3 12 0 22-7.6 22-17.1S44 12 32 12z" fill="#3A1D1D"/></svg></i>카카오톡으로 편하게 물어보기</div>
<div class="chips">${CHIPS.map(c => `<div>${c}</div>`).join('')}</div>
<div class="blob"></div>
<div class="ring">${photo ? `<img src="${photo}">` : '<div class="ghost">사진 자리</div>'}</div>
<div class="tag">${NAME}</div>
</div></body></html>`;
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1920, height: 600 } });
await p.setContent(html); await p.waitForTimeout(300);
await p.screenshot({ path: path.join(HERE, 'soft-banner.png') }); await b.close(); console.log('ok');
