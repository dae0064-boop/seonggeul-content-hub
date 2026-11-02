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

function banner() {
  const bg = img(slug);
  const cats = CATS.map(([n, s]) => { const i = img(s); return `<div class="cat"><div class="nm">${n}</div><div class="ic">${i ? `<img src="${i}">` : '<i></i>'}</div></div>`; }).join('');
  return `
<div class="bn">
  ${bg ? `<img class="bg" src="${bg}">` : ''}
  <div class="col">
    <div class="title">성글벙글</div>
    <div class="tag">매일매일 좋은 날을 나누는 공간</div>
    <div class="sub">살림·건강·보험부터 오늘의 이슈·연예까지!</div>
    <div class="cats">${cats}</div>
  </div>
</div>`;
}
const CSS = `
@font-face{font-family:Pen;src:url('${font('scripts/lib/fonts/NanumPenScript-Regular.ttf')}')}
@font-face{font-family:Gaegu;src:url('${font('scripts/lib/fonts/Gaegu-Bold.ttf')}')}
*{margin:0;padding:0;box-sizing:border-box}
body{width:1920px;background:#fff;font-family:sans-serif}
.bn{position:relative;width:1920px;height:600px;overflow:hidden;background:linear-gradient(90deg,#f7e6cf,#f4dcc0)}
.bg{position:absolute;left:50%;top:50%;width:${1920 * ZOOM}px;transform:translate(-${X}%,-${Y}%)}
.col{position:absolute;left:477px;width:966px;top:0;height:600px}
.title{position:absolute;left:0;width:860px;top:92px;text-align:center;font:138px/1 Pen;color:#2c5236;letter-spacing:6px;text-shadow:0 2px 0 rgba(255,255,255,.35)}
.tag{position:absolute;left:0;width:860px;top:252px;text-align:center;font:58px/1 Pen;color:#7a5230}
.sub{position:absolute;left:0;width:860px;top:330px;text-align:center;font:40px/1 Pen;color:#2c5236}
.cats{position:absolute;left:22px;top:418px;display:flex;gap:6px}
.cat{width:160px;text-align:center}
.nm{font:27px/1 Gaegu;color:#2b2b2b;margin-bottom:6px}
.ic{width:132px;height:132px;margin:0 auto}
.ic img{width:100%;height:100%;object-fit:contain;mix-blend-mode:multiply}
.ic i{display:block;width:110px;height:110px;margin:10px auto;border-radius:50%;border:3px dashed rgba(0,0,0,.2)}
/* 확인용 네이버 화면 흉내 */
.nv{position:absolute;font:13px sans-serif;color:#333}
.side{margin:18px 0 0 477px;width:170px;border:1px solid #ddd;border-radius:4px;padding:14px;font:13px/1.9 sans-serif;color:#555}
.side b{color:#d33;display:block;margin-bottom:4px}
`;
const page = (preview) => `<!doctype html><meta charset="utf-8"><style>${CSS}</style><div style="position:relative">${banner()}
${preview ? `<div class="nv" style="left:1158px;top:12px">내블로그 | 이웃블로그 | 블로그홈 | 로그인</div>
<div class="nv" style="left:487px;top:56px;font-weight:bold">프롤로그 | <span style="color:#d22">블로그</span></div>
<div class="nv" style="left:1365px;top:56px">태그 | 안부</div>` : ''}</div>
${preview ? `<div class="side"><b>카테고리</b>전체보기 (448)<br>맛집·나들이 (236)<br>생활·정보 (153)<br>생활·보장 (59)<br>이슈·뉴스<br>연예·방송</div>` : ''}`;

const browser = await chromium.launch();
for (const pv of [false, true]) {
  const p = await browser.newPage({ viewport: { width: 1920, height: pv ? 900 : 600 } });
  await p.setContent(page(pv)); await p.waitForTimeout(400);
  const f = path.join(OUT, `${slug}${pv ? '-preview' : ''}.png`);
  await p.screenshot({ path: f }); await p.close(); console.log(f);
}
await browser.close();
