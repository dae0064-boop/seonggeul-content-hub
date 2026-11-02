#!/usr/bin/env node
/**
 * 네이버 블로그 스킨 배경 배너 — 스크랩북 모양 (2026-11-02 사용자가 보여 준 폴라로이드·테이프·찢은 종이 예시를 성글벙글 색·캐릭터로).
 *
 *   node scripts/blog-banner/scrap.mjs
 *
 * 화면 실측(1920 폭): 높이 600, 위 0~85 네이버 메뉴, 위젯(눌리는 칸) 가로 170 × 5 · 사이 16 · x 486 부터 · 위 321~600.
 * 폴라로이드 사진 4장은 GPT 그림(content/blog-banner/src/photo-*.png, PC 가 만듦). 없으면 색 칸으로 자리만.
 * 결과: content/blog-banner/out/scrap-1920x600.png + scrap-preview.png (위젯 칸 점선·네이버 메뉴 흉내)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = path.join(ROOT, 'content/blog-banner/src');
const OUT = path.join(ROOT, 'content/blog-banner/out');
fs.mkdirSync(OUT, { recursive: true });
const font = (f) => `data:font/ttf;base64,${fs.readFileSync(path.join(ROOT, f)).toString('base64')}`;
const img = (s) => { const f = path.join(SRC, `${s}.png`); return fs.existsSync(f) ? `data:image/png;base64,${fs.readFileSync(f).toString('base64')}` : ''; };

const CATS = [['생활·정보', 'icon-life'], ['생활·보장', 'icon-care'], ['이슈·뉴스', 'icon-news'], ['연예·방송', 'icon-ent'], ['맛집·나들이', 'icon-food']];
// 폴라로이드: [slug, left, top, w, 기울기, 빈칸 색]
const PHOTOS = [
  ['photo-food', 150, 140, 290, -7, '#f3c9a0'],
  ['photo-home', 400, 112, 280, 6, '#e8d9c2'],
  ['photo-walk', 1210, 108, 280, -5, '#f5d9a8'],
  ['photo-cafe', 1450, 148, 290, 8, '#eccab4'],
];

// 찢은 종이 가장자리
function torn(w, h, seed) {
  let r = seed; const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  const pts = [];
  for (let x = 0; x <= w; x += 14) pts.push([x, 6 + rnd() * 10]);
  for (let y = 0; y <= h; y += 14) pts.push([w - 4 - rnd() * 8, y]);
  for (let x = w; x >= 0; x -= 14) pts.push([x, h - 6 - rnd() * 10]);
  for (let y = h; y >= 0; y -= 14) pts.push([4 + rnd() * 8, y]);
  return pts.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ');
}
const tape = (x, y, w, rot) => `<div class="tape" style="left:${x}px;top:${y}px;width:${w}px;transform:rotate(${rot}deg)"></div>`;

function banner(preview) {
  const photos = PHOTOS.map(([s, l, t, w, rot, c]) => {
    const i = img(s);
    return `<div class="pol" style="left:${l}px;top:${t}px;width:${w}px;transform:rotate(${rot}deg)"><div class="ph" style="height:${Math.round(w * 0.92)}px;background:${c}">${i ? `<img src="${i}">` : ''}</div></div>${tape(l + w / 2 - 55, t - 18, 110, rot - 4)}`;
  }).join('');
  const cats = CATS.map(([n, s], k) => {
    const i = img(s);
    return `<div class="btn" style="left:${486 + k * 186}px">${i ? `<img class="mini" src="${i}">` : ''}<div class="in"><span>${n}</span><em>바로가기</em><svg width="110" height="10" viewBox="0 0 110 10"><path d="M0 5 Q 6.9 0 13.8 5 T 27.5 5 T 41.3 5 T 55 5 T 68.8 5 T 82.5 5 T 96.3 5 T 110 5" fill="none" stroke="#e7a77a" stroke-width="2"/></svg></div></div>`;
  }).join('');
  const mascot = img('icon-life');
  return `
<div class="bn">
  <svg class="map" width="1920" height="600" viewBox="0 0 1920 600">
    <path d="M-20 420 C 200 300, 380 520, 640 380 S 1100 250, 1300 380 S 1700 520, 1940 300" fill="none" stroke="#e2bf98" stroke-width="3" stroke-dasharray="10 12" opacity=".8"/>
    <path d="M-20 120 C 260 40, 520 160, 760 70" fill="none" stroke="#e2bf98" stroke-width="3" stroke-dasharray="10 12" opacity=".6"/>
    <path d="M1180 60 C 1420 130, 1640 20, 1940 110" fill="none" stroke="#e2bf98" stroke-width="3" stroke-dasharray="10 12" opacity=".6"/>
    <g fill="none" stroke="#e6c8a6" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity=".9">
      <path d="M70 560 l30 -26 l30 26 v28 h-60z M92 588 v-16 h16 v16"/>
      <path d="M1840 470 c-18 -22 -40 -6 -26 12 l26 22 l26 -22 c14 -18 -8 -34 -26 -12z"/>
      <path d="M60 300 c20 -30 50 -30 60 0 c-20 10 -40 10 -60 0z M90 300 v26"/>
      <path d="M1850 60 l6 14 l15 1 l-12 9 l4 15 l-13 -8 l-13 8 l4 -15 l-12 -9 l15 -1z"/>
      <path d="M1790 560 h44 v10 a22 22 0 0 1 -44 0z M1834 562 h8 a8 8 0 0 1 0 16 h-10"/>
    </g>
  </svg>
  ${photos}
  <svg class="arc" width="700" height="200" viewBox="0 0 700 200">
    <path id="arcp" d="M60 190 A 300 190 0 0 1 640 190" fill="none"/>
    <text><textPath href="#arcp" startOffset="50%" text-anchor="middle">Every Good Day</textPath></text>
  </svg>
  <div class="paper">
    <svg width="600" height="178" viewBox="0 0 600 178"><polygon points="${torn(600, 178, 7)}" fill="#fffaf1"/></svg>
    <div class="ttl">성글벙글</div>
    <div class="tg">매일매일 좋은 날을 나누는 공간</div>
  </div>
  ${tape(885, 116, 120, -3)}
  ${mascot ? `<img class="mascot" src="${mascot}">` : ''}
  ${cats}
  ${preview ? [0, 1, 2, 3, 4].map((k) => `<div style="position:absolute;left:${486 + k * 186}px;top:321px;width:170px;height:279px;border:2px dashed rgba(40,90,220,.55)"></div>`).join('') + `<div class="nv" style="left:1158px;top:12px">내블로그 | 이웃블로그 | 블로그홈 | 로그인</div><div class="nv" style="left:487px;top:56px;font-weight:bold">프롤로그 | <span style="color:#d22">블로그</span></div><div class="nv" style="left:1365px;top:56px">태그 | 안부</div>` : ''}
</div>`;
}
const CSS = `
@font-face{font-family:Jua;src:url('${font('scripts/lib/fonts/Jua-Regular.ttf')}')}
@font-face{font-family:Gaegu;src:url('${font('scripts/lib/fonts/Gaegu-Bold.ttf')}')}
@font-face{font-family:Pop;src:url('${font('scripts/lib/fonts/Poppins-SemiBold.ttf')}')}
*{margin:0;padding:0;box-sizing:border-box}
body{width:1920px;background:#fff}
.bn{position:relative;width:1920px;height:600px;overflow:hidden;background:radial-gradient(ellipse 900px 380px at 960px 260px,#fffaf0,rgba(255,250,240,0) 75%),linear-gradient(180deg,#fdf3e3,#fbe9d2)}
.map{position:absolute;inset:0}
.pol{position:absolute;background:#fff;padding:14px 14px 52px;box-shadow:0 10px 22px rgba(150,100,60,.18),0 2px 4px rgba(0,0,0,.06)}
.ph{overflow:hidden}.ph img{width:100%;height:100%;object-fit:cover}
.tape{position:absolute;height:34px;background:rgba(244,226,196,.82);box-shadow:0 1px 2px rgba(0,0,0,.06)}
.arc{position:absolute;left:593px;top:40px}
.arc text{font:46px Pop;fill:#fff;letter-spacing:4px;paint-order:stroke;stroke:#e9a878;stroke-width:6px;stroke-linejoin:round}
.paper{position:absolute;left:643px;top:130px;width:600px;height:178px;filter:drop-shadow(0 6px 10px rgba(150,100,60,.16));transform:rotate(-1.2deg)}
.paper svg{position:absolute;inset:0}
.ttl{position:absolute;left:0;right:0;top:28px;text-align:center;font:88px/1 Jua;color:#3b5a3f;letter-spacing:4px}
.tg{position:absolute;left:0;right:0;top:124px;text-align:center;font:28px/1 Gaegu;color:#8a5a34}
.mascot{position:absolute;left:610px;top:96px;width:118px;transform:rotate(-8deg);filter:drop-shadow(0 4px 6px rgba(120,80,40,.2))}
.btn{position:absolute;top:400px;width:170px;height:176px}
.btn .in{position:absolute;left:6px;right:6px;top:56px;bottom:6px;background:#fff;border-radius:14px;box-shadow:0 8px 16px rgba(150,100,60,.16);display:flex;flex-direction:column;align-items:center;justify-content:flex-end;padding-bottom:16px;gap:7px;outline:2px dashed #f0cfae;outline-offset:-9px}
.btn span{font:27px/1 Gaegu;color:#4a3526}
.btn em{font:15px/1 sans-serif;font-style:normal;color:#a08670;letter-spacing:1px;order:3}
.btn .mini{position:absolute;left:50%;top:-8px;width:92px;transform:translateX(-50%);z-index:2;filter:drop-shadow(0 3px 4px rgba(120,80,40,.18))}
.nv{position:absolute;font:13px sans-serif;color:#333}
`;
const html = (pv) => `<!doctype html><meta charset="utf-8"><style>${CSS}</style>${banner(pv)}`;
const browser = await chromium.launch();
for (const pv of [false, true]) {
  const p = await browser.newPage({ viewport: { width: 1920, height: 600 } });
  await p.setContent(html(pv)); await p.waitForTimeout(400);
  const f = path.join(OUT, `scrap${pv ? '-preview' : '-1920x600'}.png`);
  await p.screenshot({ path: f }); await p.close(); console.log(f);
}
await browser.close();
