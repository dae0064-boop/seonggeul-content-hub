#!/usr/bin/env node
/**
 * 네이버 블로그 스킨 배경 배너 (2026-11-02 사용자 — 카테고리 5개, 블로그 전체 화면에 맞춰).
 *
 *   node scripts/blog-banner/render.mjs [바탕slug] [--x 0.5] [--y 0.45] [--zoom 1]
 *
 * 블로그 화면(1920 폭 모니터) 실측: 타이틀 영역 높이 600, 글 칸 966px 이 가운데(x 477~1443).
 *   위 0~85px 은 네이버 메뉴(내블로그·이웃블로그 / 프롤로그·블로그 / 태그·안부)가 얹히는 자리 — 글씨를 두지 않는다.
 *   글씨·아이콘은 글 칸 안, 인물은 칸 오른쪽 끝에 걸치게 (지금 배너와 같은 배치).
 * 바탕·아이콘은 GPT 그림(PC 가 만들어 Drive 블로그배너/ → content/blog-banner/src/). 아이콘은 흰 바탕이라 multiply 로 얹어 흰색을 지운다.
 * 결과: content/blog-banner/out/<바탕>.png (1920×600 — 블로그에 올릴 파일), <바탕>-preview.png (네이버 메뉴·카테고리 칸을 흉내 낸 확인용)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = path.join(ROOT, 'content/blog-banner/src');
const OUT = path.join(ROOT, 'content/blog-banner/out');
fs.mkdirSync(OUT, { recursive: true });
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const slug = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'bg-full-1';
const X = arg('--x', '50'), Y = arg('--y', '45'), ZOOM = Number(arg('--zoom', '1'));
const font = (f) => `data:font/ttf;base64,${fs.readFileSync(path.join(ROOT, f)).toString('base64')}`;
const img = (s) => { const f = path.join(SRC, `${s}.png`); return fs.existsSync(f) ? `data:image/png;base64,${fs.readFileSync(f).toString('base64')}` : ''; };

const CATS = [['생활·정보', 'icon-life'], ['생활·보장', 'icon-care'], ['이슈·뉴스', 'icon-news'], ['연예·방송', 'icon-ent'], ['맛집·나들이', 'icon-food']];


// 따뜻한 바탕 장식 (2026-11-02 사용자 — "너무 심플, 친근하고 따뜻하게"): 종이 결·햇살·물방울 빛·양옆 잎사귀·하트·별·아래 언덕
const leaf = (x, y, r, s, c) => `<g transform="translate(${x} ${y}) rotate(${r}) scale(${s})"><path d="M0 0 C 30 -40, 90 -40, 120 0 C 90 40, 30 40, 0 0Z" fill="${c}"/><path d="M0 0 L118 0" stroke="rgba(255,255,255,.55)" stroke-width="3"/></g>`;
const sprig = (x, y, r, s, c) => `<g transform="translate(${x} ${y}) rotate(${r}) scale(${s})"><path d="M0 0 C 10 -80, 0 -160, 20 -240" stroke="${c}" stroke-width="6" fill="none" stroke-linecap="round"/>${[[-60, 0.8, -40], [-120, 0.7, 30], [-170, 0.6, -35], [-215, 0.5, 25]].map(([yy, sc, rr]) => leaf(rr < 0 ? 2 : 10, yy, rr < 0 ? 200 + rr : rr - 20, sc * 0.6, c)).join('')}</g>`;
const heart = (x, y, s, c) => `<path transform="translate(${x} ${y}) scale(${s})" d="M0 8 C -10 -6, -26 4, 0 26 C 26 4, 10 -6, 0 8Z" fill="${c}"/>`;
const star = (x, y, s, c) => `<path transform="translate(${x} ${y}) scale(${s})" d="M0 -12 L3 -3 L12 -3 L5 3 L8 12 L0 6 L-8 12 L-5 3 L-12 -3 L-3 -3Z" fill="${c}"/>`;
const dots = Array.from({ length: 26 }, (_, k) => { const x = (k * 733) % 1920, y = 40 + ((k * 397) % 520), r = 6 + (k % 5) * 5; return (x > 470 && x < 1450) ? '' : `<circle cx="${x}" cy="${y}" r="${r}" fill="rgba(255,255,255,${0.25 + (k % 3) * 0.12})"/>`; }).join('');
const DECO = `<svg class="deco" width="1920" height="600" viewBox="0 0 1920 600">
<defs><filter id="paper"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="3"/><feColorMatrix values="0 0 0 0 .55  0 0 0 0 .4  0 0 0 0 .25  0 0 0 .06 0"/></filter>
<linearGradient id="ray" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff6e0" stop-opacity=".7"/><stop offset="1" stop-color="#fff6e0" stop-opacity="0"/></linearGradient></defs>
<polygon points="0,0 420,0 900,600 520,600" fill="url(#ray)" opacity=".45"/><polygon points="460,0 600,0 1150,600 1000,600" fill="url(#ray)" opacity=".25"/>
${dots}
<path d="M0 520 C 260 470, 420 560, 700 530 S 1200 480, 1420 540 S 1760 500, 1920 520 L1920 600 L0 600Z" fill="#efc9a3" opacity=".55"/>
<path d="M0 560 C 300 530, 560 590, 900 565 S 1500 540, 1920 570 L1920 600 L0 600Z" fill="#e9bb92" opacity=".5"/>
${sprig(120, 600, -18, 1.25, '#9fbf8a')}${sprig(300, 600, 12, 0.9, '#b8cf98')}${sprig(1800, 600, 16, 1.3, '#9fbf8a')}${sprig(1620, 600, -10, 0.85, '#c3d6a2')}
${leaf(1560, 120, 30, 0.5, '#c9dbad')}${leaf(330, 170, 150, 0.45, '#c9dbad')}
${heart(400, 300, 1.3, '#f4a7a0')}${heart(1500, 240, 1.0, '#f6b8a8')}${heart(1700, 90, 0.8, '#f4a7a0')}${heart(210, 430, 0.9, '#f6b8a8')}
${star(260, 110, 1.6, '#f7cf6a')}${star(1660, 330, 1.4, '#f7cf6a')}${star(1480, 420, 1.0, '#f9dc8e')}${star(420, 450, 1.1, '#f9dc8e')}${star(1840, 200, 1.0, '#f7cf6a')}
<rect width="1920" height="600" filter="url(#paper)"/>
</svg>`;

function banner() {
  const bg = img(slug);
  // 네이버 위젯(눌리는 칸) 실측: 가로 170 · 사이 16 · 위 321 (1905 화면 캡처 + 스크롤바 보정 7px)
  const cats = CATS.map(([n, s], k) => { const i = img(s); return `<div class="cat" style="left:${486 + k * 186}px"><div class="card"></div><div class="nm">${n}</div><div class="ic">${i ? `<img src="${i}">` : '<i></i>'}</div></div>`; }).join('');
  return `
<div class="bn">
  ${bg ? `<img class="bg" src="${bg}">` : ''}
  ${bg ? '' : DECO}
  <div class="col">
    <div class="title">성글벙글</div>
    <div class="tag">매일매일 좋은 날을 나누는 공간</div>
    <div class="sub">살림·건강·보험부터 오늘의 이슈·연예까지!</div>
  </div>
  ${cats}
</div>`;
}
const CSS = `
@font-face{font-family:Pen;src:url('${font('scripts/lib/fonts/NanumPenScript-Regular.ttf')}')}
@font-face{font-family:Gaegu;src:url('${font('scripts/lib/fonts/Gaegu-Bold.ttf')}')}
*{margin:0;padding:0;box-sizing:border-box}
body{width:1920px;background:#fff;font-family:sans-serif}
.bn{position:relative;width:1920px;height:600px;overflow:hidden;background:
 radial-gradient(ellipse 900px 420px at 960px 230px,rgba(255,250,236,.95),rgba(255,250,236,0) 70%),
 radial-gradient(circle 520px at 180px 80px,rgba(255,226,170,.75),rgba(255,226,170,0) 70%),
 radial-gradient(circle 560px at 1780px 520px,rgba(250,200,170,.6),rgba(250,200,170,0) 70%),
 linear-gradient(180deg,#fbeedb 0%,#f8e2c6 60%,#f3d3b2 100%)}
.deco{position:absolute;inset:0;pointer-events:none}
.bg{position:absolute;left:50%;top:50%;width:${1920 * ZOOM}px;transform:translate(-${X}%,-${Y}%)}
.col{position:absolute;left:477px;width:966px;top:0;height:600px}
.title{position:absolute;left:0;width:932px;top:78px;text-align:center;font:120px/1 Pen;color:#2c5236;letter-spacing:6px;text-shadow:0 2px 0 rgba(255,255,255,.6)}
.tag{position:absolute;left:0;width:932px;top:206px;text-align:center;font:50px/1 Pen;color:#7a5230}
.sub{position:absolute;left:0;width:932px;top:268px;text-align:center;font:34px/1 Pen;color:#2c5236}
.cat{position:absolute;top:321px;width:170px;height:279px;text-align:center}
.card{position:absolute;left:8px;right:8px;top:14px;bottom:16px;border-radius:26px;background:rgba(255,252,245,.62);border:2px solid rgba(255,255,255,.85);box-shadow:0 6px 16px rgba(160,100,50,.10)}
.nm{position:relative;margin-top:36px;font:25px/1 Gaegu;color:#4a3526}
.ic{position:relative;width:118px;height:140px;margin:30px auto 0}
.ic img{width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 3px 4px rgba(120,80,40,.15))}
.ic i{display:block;width:110px;height:110px;margin:10px auto;border-radius:50%;border:3px dashed rgba(0,0,0,.2)}
/* 확인용 네이버 화면 흉내 */
.nv{position:absolute;font:13px sans-serif;color:#333}
.side{margin:18px 0 0 477px;width:170px;border:1px solid #ddd;border-radius:4px;padding:14px;font:13px/1.9 sans-serif;color:#555}
.side b{color:#d33;display:block;margin-bottom:4px}
`;
const page = (preview) => `<!doctype html><meta charset="utf-8"><style>${CSS}</style><div style="position:relative">${banner()}
${preview ? `<div class="nv" style="left:1158px;top:12px">내블로그 | 이웃블로그 | 블로그홈 | 로그인</div>
<div class="nv" style="left:487px;top:56px;font-weight:bold">프롤로그 | <span style="color:#d22">블로그</span></div>
<div class="nv" style="left:1365px;top:56px">태그 | 안부</div>${[0,1,2,3,4].map((k)=>`<div style="position:absolute;left:${486+k*186}px;top:321px;width:170px;height:279px;border:2px dashed rgba(40,90,220,.55)"></div>`).join('')}` : ''}</div>
${preview ? `<div class="side"><b>카테고리</b>전체보기 (448)<br>맛집·나들이 (236)<br>생활·정보 (153)<br>생활·보장 (59)<br>이슈·뉴스<br>연예·방송</div>` : ''}`;

const browser = await chromium.launch();
for (const pv of [false, true]) {
  const p = await browser.newPage({ viewport: { width: 1920, height: pv ? 900 : 600 } });
  await p.setContent(page(pv)); await p.waitForTimeout(400);
  const f = path.join(OUT, `${slug}${pv ? '-preview' : ''}.png`);
  await p.screenshot({ path: f }); await p.close(); console.log(f);
}
await browser.close();
