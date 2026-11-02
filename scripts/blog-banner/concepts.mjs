#!/usr/bin/env node
/**
 * 네이버 블로그 스킨 배경 배너 — 성글벙글 콘셉트 시안 4가지 (2026-11-02 사용자 "예시와 너무 비슷, 친근함·편안함이 묻어나게 4장").
 *   1 골목 상점가  2 메모 보드  3 소풍  4 아늑한 선반
 *
 *   node scripts/blog-banner/concepts.mjs [번호]
 *
 * 실측(1920 폭): 높이 600 · 위 0~85 네이버 메뉴 · 위젯(눌리는 칸) 가로 170 × 5 · 사이 16 · x 486 부터 · 위 321~600.
 * 그림: content/blog-banner/src/ 의 캐릭터(icon-*)·사진(photo-*) — 새 GPT 비용 없음.
 * 결과: content/blog-banner/out/concept-<번호>.png (+ -preview.png: 위젯 칸 점선·메뉴 흉내)
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
const L = (k) => 486 + k * 186; // 위젯 칸 왼쪽
const CX = 943; // 위젯 다섯 칸의 가운데
const CATS = [
  { n: '생활·정보', i: 'icon-life', c: '#7fb77e', s: '#e3f1dc' },
  { n: '생활·보장', i: 'icon-care', c: '#6fa8dc', s: '#dceaf7' },
  { n: '이슈·뉴스', i: 'icon-news', c: '#f2a65a', s: '#fdebd8' },
  { n: '연예·방송', i: 'icon-ent', c: '#ee8fa8', s: '#fbe1e8' },
  { n: '맛집·나들이', i: 'icon-food', c: '#e9c35b', s: '#fbf0cf' },
];
const TITLE = '성글벙글', TAG = '매일매일 좋은 날을 나누는 공간';

const BASE = `
@font-face{font-family:Jua;src:url('${font('scripts/lib/fonts/Jua-Regular.ttf')}')}
@font-face{font-family:Gaegu;src:url('${font('scripts/lib/fonts/Gaegu-Bold.ttf')}')}
@font-face{font-family:Pen;src:url('${font('scripts/lib/fonts/NanumPenScript-Regular.ttf')}')}
@font-face{font-family:Pre;src:url('${font('scripts/threads/fonts/Pretendard-Bold.otf')}')}
*{margin:0;padding:0;box-sizing:border-box}
body{width:1920px;background:#fff}
.bn{position:relative;width:1920px;height:600px;overflow:hidden}
.abs{position:absolute}
.ic{object-fit:contain;filter:drop-shadow(0 3px 4px rgba(90,60,30,.18))}
.nv{position:absolute;font:13px sans-serif;color:#333}
`;
const guide = () => [0, 1, 2, 3, 4].map((k) => `<div class="abs" style="left:${L(k)}px;top:321px;width:170px;height:279px;border:2px dashed rgba(40,90,220,.55)"></div>`).join('')
  + `<div class="nv" style="left:1158px;top:12px">내블로그 | 이웃블로그 | 블로그홈 | 로그인</div><div class="nv" style="left:487px;top:56px;font-weight:bold">프롤로그 | <span style="color:#d22">블로그</span></div><div class="nv" style="left:1365px;top:56px">태그 | 안부</div>`;

/* ── 1 골목 상점가: 다섯 카테고리가 성글벙글 동네의 가게. 간판에 이름, 창문에 캐릭터 ── */
function v1() {
  const house = (x, w, h, c, roof) => `<div class="abs" style="left:${x}px;bottom:24px;width:${w}px;height:${h}px;background:${c};border-radius:6px 6px 0 0">
    <div class="abs" style="left:-10px;top:-34px;width:${w + 20}px;height:40px;background:${roof};clip-path:polygon(50% 0,100% 100%,0 100%)"></div>
    ${[0, 1].map((r) => [0, 1].map((q) => `<div class="abs" style="left:${18 + q * (w - 64)}px;top:${24 + r * 50}px;width:28px;height:30px;background:#fff6dc;border-radius:4px;border:3px solid rgba(255,255,255,.7)"></div>`).join('')).join('')}</div>`;
  const tree = (x, s) => `<div class="abs" style="left:${x}px;bottom:24px;transform:scale(${s});transform-origin:bottom"><div class="abs" style="left:34px;bottom:0;width:14px;height:60px;background:#b98a5e;border-radius:6px"></div><div class="abs" style="left:0;bottom:46px;width:82px;height:82px;background:#a9d18e;border-radius:50%"></div><div class="abs" style="left:22px;bottom:96px;width:52px;height:52px;background:#bfe0a4;border-radius:50%"></div></div>`;
  const shops = CATS.map((c, k) => {
    const stripes = `repeating-linear-gradient(90deg,${c.c} 0 17px,#fffaf0 17px 34px)`;
    return `<div class="abs" style="left:${L(k) + 5}px;top:352px;width:160px;height:248px">
      <div class="abs" style="left:0;top:40px;width:160px;height:210px;background:#fffaf0;border:3px solid #ead6bd;border-bottom:none;border-radius:8px 8px 0 0"></div>
      <div class="abs" style="left:-6px;top:0;width:172px;height:46px;background:${stripes};border-radius:8px 8px 0 0;box-shadow:0 4px 0 rgba(0,0,0,.05)"></div>
      <div class="abs" style="left:-6px;top:44px;width:172px;height:16px;background:radial-gradient(circle at 8.6px 0,${c.c} 8px,transparent 8.5px) 0 0/17.2px 16px repeat-x"></div>
      <div class="abs" style="left:22px;top:70px;width:116px;height:100px;background:${c.s};border-radius:56px 56px 10px 10px;border:4px solid #fff;box-shadow:inset 0 0 0 2px #ead6bd;overflow:hidden">
        <img class="ic abs" src="${img(c.i)}" style="left:12px;top:6px;width:86px;height:92px"></div>
      <div class="abs" style="left:14px;top:182px;width:132px;height:40px;background:#fff;border:3px solid ${c.c};border-radius:20px;text-align:center;font:24px/34px Gaegu;color:#4a3526">${c.n}</div>
    </div>`;
  }).join('');
  return `<div class="bn" style="background:linear-gradient(180deg,#ffe7cf 0%,#fff4e6 55%,#fdf0de 100%)">
    <div class="abs" style="left:1540px;top:70px;width:120px;height:120px;border-radius:50%;background:radial-gradient(circle,#ffe2a6,#ffd08a 60%,rgba(255,208,138,0) 72%)"></div>
    ${[[200, 90, 1], [1380, 150, .8], [1700, 260, .9], [340, 230, .7]].map(([x, y, s]) => `<div class="abs" style="left:${x}px;top:${y}px;transform:scale(${s})"><div class="abs" style="width:120px;height:40px;background:#fff;border-radius:20px;opacity:.9"></div><div class="abs" style="left:24px;top:-22px;width:56px;height:56px;background:#fff;border-radius:50%;opacity:.9"></div></div>`).join('')}
    ${house(40, 150, 200, '#f6d7b8', '#e9a77f')}${house(210, 120, 160, '#f2e2c4', '#d9b48a')}${tree(345, 1)}
    ${house(1450, 130, 180, '#f2e2c4', '#d9b48a')}${tree(1595, 1.1)}${house(1700, 170, 220, '#f6d7b8', '#e9a77f')}
    <div class="abs" style="left:0;bottom:0;width:1920px;height:26px;background:#e9cfae"></div>
    <div class="abs" style="left:0;bottom:22px;width:1920px;height:6px;background:#f3dfc4"></div>
    <div class="abs" style="left:${CX - 2 - 150}px;top:86px;width:4px;height:40px;background:#a77a52;transform:rotate(18deg)"></div>
    <div class="abs" style="left:${CX - 2 + 150}px;top:86px;width:4px;height:40px;background:#a77a52;transform:rotate(-18deg)"></div>
    <div class="abs" style="left:${CX - 290}px;top:118px;width:580px;height:178px;background:linear-gradient(180deg,#d9a36e,#c98d58);border-radius:22px;box-shadow:0 8px 0 #b47a48,0 14px 20px rgba(120,70,30,.2);border:5px solid #e8bb88">
      <div class="abs" style="left:0;right:0;top:20px;text-align:center;font:92px/1 Jua;color:#fff8ea;letter-spacing:6px;text-shadow:0 3px 0 rgba(120,70,30,.35)">${TITLE}</div>
      <div class="abs" style="left:0;right:0;top:120px;text-align:center;font:30px/1 Gaegu;color:#fff1d8">${TAG}</div></div>
    ${shops}</div>`;
}

/* ── 2 메모 보드: 크라프트 종이 위 손글씨 제목, 버튼은 색 포스트잇, 양옆 빨랫줄에 집게로 건 사진 ── */
function v2() {
  const rot = [-3, 2, -1.5, 3, -2];
  const notes = CATS.map((c, k) => `<div class="abs" style="left:${L(k) + 10}px;top:372px;width:150px;height:200px;background:${c.s};transform:rotate(${rot[k]}deg);box-shadow:0 10px 14px rgba(110,80,40,.18);border-radius:2px 2px 18px 2px">
      <div class="abs" style="left:63px;top:-10px;width:24px;height:24px;border-radius:50%;background:radial-gradient(circle at 40% 35%,#fff 0 3px,${c.c} 4px);box-shadow:0 3px 3px rgba(0,0,0,.2)"></div>
      <img class="ic abs" src="${img(c.i)}" style="left:23px;top:18px;width:104px;height:110px">
      <div class="abs" style="left:0;right:0;top:136px;text-align:center;font:34px/1 Pen;color:#3d2c20">${c.n}</div>
      <div class="abs" style="left:40px;right:40px;top:172px;height:3px;background:${c.c};border-radius:2px;opacity:.7"></div></div>`).join('');
  const garland = (x0, y0, x1, y1, items, flip) => {
    const mx = (x0 + x1) / 2, my = Math.max(y0, y1) + 70;
    const pts = items.map((_, i) => { const t = (i + 1) / (items.length + 1); const x = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * mx + t * t * x1; const y = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * my + t * t * y1; return [x, y]; });
    return `<svg class="abs" style="left:0;top:0" width="1920" height="600"><path d="M${x0} ${y0} Q ${mx} ${my} ${x1} ${y1}" stroke="#b98a5e" stroke-width="3" fill="none"/></svg>`
      + items.map((s, i) => { const [x, y] = pts[i]; const r = (flip ? -1 : 1) * (i % 2 ? 5 : -5); return `<div class="abs" style="left:${x - 75}px;top:${y + 4}px;width:150px;padding:9px 9px 26px;background:#fff;transform:rotate(${r}deg);transform-origin:top center;box-shadow:0 8px 14px rgba(110,80,40,.18)"><img src="${img(s)}" style="display:block;width:132px;height:132px;object-fit:cover"></div><div class="abs" style="left:${x - 7}px;top:${y - 14}px;width:14px;height:34px;background:#d9a36e;border-radius:3px;transform:rotate(${r}deg)"></div>`; }).join('');
  };
  const dots = `radial-gradient(circle,rgba(233,190,140,.35) 3px,transparent 3.5px) 0 0/46px 46px`;
  return `<div class="bn" style="background:${dots},linear-gradient(180deg,#fff8ee,#fbecd8)">
    ${garland(-10, 120, 470, 100, ['photo-food', 'photo-home'], false)}
    ${garland(1430, 100, 1930, 120, ['photo-walk', 'photo-cafe'], true)}
    <div class="abs" style="left:${CX - 300}px;top:100px;width:600px;height:200px;background:linear-gradient(135deg,#e2c49c,#d7b386);transform:rotate(-1.5deg);box-shadow:0 10px 18px rgba(110,80,40,.2);clip-path:polygon(0 4%,6% 0,20% 3%,38% 0,55% 3%,72% 0,90% 2%,100% 0,99% 30%,100% 60%,98% 100%,80% 97%,62% 100%,45% 97%,28% 100%,10% 97%,0 100%,2% 60%,0 30%)">
      <div class="abs" style="left:0;right:0;top:22px;text-align:center;font:118px/1 Pen;color:#2f4f37;letter-spacing:4px">${TITLE}</div>
      <div class="abs" style="left:0;right:0;top:138px;text-align:center;font:40px/1 Pen;color:#6b4426">${TAG}</div></div>
    <div class="abs" style="left:${CX - 330}px;top:92px;width:110px;height:30px;background:rgba(255,236,170,.85);transform:rotate(-28deg)"></div>
    <div class="abs" style="left:${CX + 222}px;top:92px;width:110px;height:30px;background:rgba(190,226,200,.85);transform:rotate(26deg)"></div>
    <svg class="abs" style="left:0;top:0" width="1920" height="600" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="3">
      <path d="M${CX + 320} 300 c-14 -18 -34 -6 -22 10 l22 18 l22 -18 c12 -16 -8 -28 -22 -10z" stroke="#ee8fa8"/>
      <path d="M${CX - 340} 290 l6 13 l14 1 l-11 9 l4 14 l-13 -8 l-12 8 l4 -14 l-11 -9 l14 -1z" stroke="#e9c35b"/>
      <path d="M120 470 q 30 -40 60 0 t 60 0" stroke="#e9b98e"/><path d="M1700 470 q 30 -40 60 0 t 60 0" stroke="#e9b98e"/>
    </svg>
    ${notes}</div>`;
}

/* ── 3 소풍: 하늘·구름·초록 언덕, 구름 모양 제목, 버튼은 체크무늬 돗자리 띠를 두른 도시락 카드 ── */
function v3() {
  const cloud = (x, y, s, o = 1) => `<div class="abs" style="left:${x}px;top:${y}px;transform:scale(${s});opacity:${o}"><div class="abs" style="width:160px;height:54px;background:#fff;border-radius:27px"></div><div class="abs" style="left:28px;top:-34px;width:72px;height:72px;background:#fff;border-radius:50%"></div><div class="abs" style="left:76px;top:-20px;width:56px;height:56px;background:#fff;border-radius:50%"></div></div>`;
  const flower = (x, y, c) => `<div class="abs" style="left:${x}px;top:${y}px;width:18px;height:18px;border-radius:50%;background:#ffe27a;box-shadow:0 -11px 0 ${c},0 11px 0 ${c},-11px 0 0 ${c},11px 0 0 ${c}"></div>`;
  const cards = CATS.map((c, k) => `<div class="abs" style="left:${L(k) + 8}px;top:356px;width:154px;height:222px;background:#fffdf8;border-radius:22px;box-shadow:0 10px 18px rgba(80,110,60,.18);overflow:hidden">
      <div class="abs" style="left:0;top:0;width:154px;height:40px;background:repeating-linear-gradient(0deg,rgba(255,255,255,.45) 0 10px,transparent 10px 20px),repeating-linear-gradient(90deg,${c.c} 0 10px,rgba(255,255,255,.9) 10px 20px)"></div>
      <img class="ic abs" src="${img(c.i)}" style="left:22px;top:50px;width:110px;height:118px">
      <div class="abs" style="left:0;right:0;top:176px;text-align:center;font:26px/1 Gaegu;color:#3f3a2a">${c.n}</div></div>`).join('');
  return `<div class="bn" style="background:linear-gradient(180deg,#d9efff 0%,#eef8ff 45%,#fff7e8 100%)">
    <div class="abs" style="left:150px;top:60px;width:140px;height:140px;border-radius:50%;background:radial-gradient(circle,#fff1b8,#ffe28a 58%,rgba(255,226,138,0) 72%)"></div>
    ${cloud(380, 120, 1, .9)}${cloud(1480, 90, 1.2, .95)}${cloud(1720, 210, .8, .9)}${cloud(60, 250, .8, .85)}
    <svg class="abs" style="left:0;top:0" width="1920" height="600">
      <path d="M0 470 C 300 380, 600 460, 900 430 S 1500 360, 1920 440 L1920 600 L0 600Z" fill="#cfe8b3"/>
      <path d="M0 520 C 360 470, 760 540, 1100 505 S 1660 470, 1920 520 L1920 600 L0 600Z" fill="#b6db97"/>
    </svg>
    <div class="abs" style="left:230px;top:300px"><div class="abs" style="left:40px;top:70px;width:18px;height:140px;background:#b98a5e;border-radius:8px"></div><div class="abs" style="left:-30px;top:0;width:160px;height:120px;background:#9fcc80;border-radius:50%"></div><div class="abs" style="left:10px;top:-40px;width:100px;height:90px;background:#b4d996;border-radius:50%"></div></div>
    <div class="abs" style="left:1580px;top:470px;width:200px;height:70px;transform:skewX(-20deg);background:repeating-linear-gradient(0deg,rgba(255,255,255,.5) 0 14px,transparent 14px 28px),repeating-linear-gradient(90deg,#ef8f8f 0 14px,#fff 14px 28px);border-radius:6px;box-shadow:0 6px 10px rgba(0,0,0,.08)"></div>
    <img class="abs" src="${img('photo-food')}" style="display:none">
    ${flower(120, 540, '#ffb3c1')}${flower(400, 560, '#fff')}${flower(1450, 548, '#ffb3c1')}${flower(1820, 566, '#fff')}${flower(1300, 575, '#ffd6a5')}${flower(260, 575, '#ffd6a5')}
    <div class="abs" style="left:${CX - 320}px;top:96px;width:640px;height:210px">
      <div class="abs" style="left:40px;top:50px;width:560px;height:150px;background:#fff;border-radius:75px;box-shadow:0 10px 24px rgba(90,140,190,.18)"></div>
      <div class="abs" style="left:110px;top:6px;width:150px;height:150px;background:#fff;border-radius:50%"></div>
      <div class="abs" style="left:240px;top:-20px;width:180px;height:180px;background:#fff;border-radius:50%"></div>
      <div class="abs" style="left:390px;top:20px;width:140px;height:140px;background:#fff;border-radius:50%"></div>
      <div class="abs" style="left:0;right:0;top:56px;text-align:center;font:96px/1 Jua;color:#4a8a5a;letter-spacing:6px">${TITLE}</div>
      <div class="abs" style="left:0;right:0;top:158px;text-align:center;font:30px/1 Gaegu;color:#7a6040">${TAG}</div></div>
    ${cards}</div>`;
}

/* ── 4 아늑한 선반: 따뜻한 벽지·창가·액자, 칠판 제목, 버튼은 선반 위 유리병(뚜껑 천·이름표) ── */
function v4() {
  const jars = CATS.map((c, k) => `<div class="abs" style="left:${L(k) + 12}px;top:352px;width:146px;height:226px">
      <div class="abs" style="left:24px;top:0;width:98px;height:30px;background:repeating-linear-gradient(45deg,${c.c} 0 8px,#fff 8px 16px);border-radius:10px 10px 4px 4px;box-shadow:0 3px 0 rgba(0,0,0,.08)"></div>
      <div class="abs" style="left:16px;top:24px;width:114px;height:12px;background:${c.c};border-radius:6px"></div>
      <div class="abs" style="left:4px;top:34px;width:138px;height:192px;background:linear-gradient(90deg,rgba(255,255,255,.75),rgba(255,255,255,.45) 40%,rgba(255,255,255,.7));border:3px solid rgba(255,255,255,.95);border-radius:26px 26px 30px 30px;box-shadow:inset 0 0 18px rgba(255,255,255,.8),0 8px 12px rgba(110,70,30,.12)"></div>
      <div class="abs" style="left:22px;top:46px;width:10px;height:120px;border-radius:5px;background:rgba(255,255,255,.9)"></div>
      <img class="ic abs" src="${img(c.i)}" style="left:23px;top:48px;width:100px;height:104px">
      <div class="abs" style="left:14px;top:160px;width:118px;height:40px;background:#fffaf0;border:2px solid ${c.c};border-radius:6px;text-align:center;font:23px/36px Gaegu;color:#4a3526;box-shadow:0 2px 0 rgba(0,0,0,.05)">${c.n}</div></div>`).join('');
  const frame = (x, y, w, s, r) => `<div class="abs" style="left:${x}px;top:${y}px;width:${w}px;height:${w}px;padding:12px;background:#c99a6b;border-radius:6px;transform:rotate(${r}deg);box-shadow:0 8px 14px rgba(110,70,30,.2),inset 0 0 0 4px #ddb68c"><div style="width:100%;height:100%;padding:8px;background:#fffaf0"><img src="${img(s)}" style="display:block;width:100%;height:100%;object-fit:cover"></div></div>`;
  return `<div class="bn" style="background:repeating-linear-gradient(90deg,rgba(255,255,255,.35) 0 2px,transparent 2px 36px),linear-gradient(180deg,#fbead4,#f6dcbc)">
    <div class="abs" style="left:${CX - 600}px;top:-200px;width:1200px;height:700px;background:radial-gradient(ellipse at center,rgba(255,244,214,.9),rgba(255,244,214,0) 60%)"></div>
    <div class="abs" style="left:90px;top:96px;width:300px;height:330px;background:#fff;border-radius:150px 150px 10px 10px;padding:14px;box-shadow:0 10px 18px rgba(110,70,30,.15)">
      <div style="width:100%;height:100%;border-radius:140px 140px 4px 4px;overflow:hidden;position:relative"><img src="${img('photo-walk')}" style="width:100%;height:100%;object-fit:cover"><div class="abs" style="left:50%;top:0;width:8px;height:100%;background:#fff;transform:translateX(-50%)"></div><div class="abs" style="left:0;top:48%;width:100%;height:8px;background:#fff"></div></div></div>
    <div class="abs" style="left:60px;top:80px;width:90px;height:380px;background:linear-gradient(90deg,#f6c8b4,#f9dccd);border-radius:0 0 40px 10px;clip-path:polygon(0 0,100% 0,70% 100%,0 100%)"></div>
    <div class="abs" style="left:330px;top:80px;width:90px;height:380px;background:linear-gradient(90deg,#f9dccd,#f6c8b4);clip-path:polygon(0 0,100% 0,100% 100%,30% 100%)"></div>
    <div class="abs" style="left:66px;top:418px;width:360px;height:16px;background:#e2b68a;border-radius:4px"></div>
    <div class="abs" style="left:300px;top:340px"><div class="abs" style="left:0;top:40px;width:60px;height:44px;background:#e9a77f;border-radius:4px 4px 16px 16px"></div><div class="abs" style="left:-10px;top:-6px;width:36px;height:56px;background:#9fcc80;border-radius:50% 50% 50% 0;transform:rotate(-20deg)"></div><div class="abs" style="left:28px;top:-16px;width:36px;height:60px;background:#b4d996;border-radius:50% 50% 0 50%;transform:rotate(18deg)"></div></div>
    ${frame(1470, 110, 190, 'photo-food', -4)}${frame(1690, 170, 160, 'photo-cafe', 5)}${frame(1500, 330, 130, 'photo-home', 3)}
    <div class="abs" style="left:1700px;top:380px;width:90px;height:60px;background:#fff3c4;border-radius:50%;box-shadow:0 0 60px 30px rgba(255,230,160,.5)"></div>
    <div class="abs" style="left:1735px;top:430px;width:20px;height:110px;background:#c99a6b"></div><div class="abs" style="left:1700px;top:536px;width:90px;height:14px;background:#b8875a;border-radius:6px"></div>
    <div class="abs" style="left:1690px;top:340px;width:110px;height:70px;background:#f9e3b4;clip-path:polygon(18% 0,82% 0,100% 100%,0 100%);border-radius:4px"></div>
    <div class="abs" style="left:${CX - 300}px;top:98px;width:600px;height:206px;background:#c99a6b;border-radius:14px;padding:12px;box-shadow:0 10px 18px rgba(110,70,30,.22)">
      <div style="position:relative;width:100%;height:100%;background:radial-gradient(ellipse at 30% 20%,#4f7a5c,#3e6249);border-radius:6px">
        <div class="abs" style="left:0;right:0;top:18px;text-align:center;font:112px/1 Pen;color:#fdfbf2;letter-spacing:4px;text-shadow:0 0 2px rgba(255,255,255,.4)">${TITLE}</div>
        <div class="abs" style="left:0;right:0;top:128px;text-align:center;font:38px/1 Pen;color:#ffe9a8">${TAG}</div>
        <div class="abs" style="right:22px;bottom:12px;width:40px;height:10px;background:#fff;border-radius:3px;opacity:.8"></div></div></div>
    <div class="abs" style="left:440px;top:574px;width:1006px;height:20px;background:linear-gradient(180deg,#d4a171,#b8875a);border-radius:4px;box-shadow:0 6px 10px rgba(110,70,30,.25)"></div>
    ${jars}</div>`;
}

const V = { 1: v1, 2: v2, 3: v3, 4: v4 };
const want = process.argv[2] ? [process.argv[2]] : Object.keys(V);
const browser = await chromium.launch();
for (const k of want) {
  for (const pv of [false, true]) {
    const p = await browser.newPage({ viewport: { width: 1920, height: 600 } });
    const inner = V[k]();
    await p.setContent(`<!doctype html><meta charset="utf-8"><style>${BASE}</style>${pv ? inner.replace(/<\/div>$/, guide() + '</div>') : inner}`);
    await p.waitForTimeout(400);
    const f = path.join(OUT, `concept-${k}${pv ? '-preview' : ''}.png`);
    await p.screenshot({ path: f }); await p.close(); console.log(f);
  }
}
await browser.close();
