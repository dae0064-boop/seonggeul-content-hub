#!/usr/bin/env node
/**
 * 네이버 블로그 PC 타이틀 배너 그리기 (2026-11-02 사용자 — 카테고리 5개).
 *
 *   node scripts/blog-banner/render.mjs            # a·b·c 세 시안 모두
 *   node scripts/blog-banner/render.mjs b          # 하나만
 *
 * 바탕·아이콘 그림은 GPT(OpenAI) 로 PC 가 만든다 (content/blog-banner/prompts.json → make-bg.mjs → Drive 블로그배너/).
 * 클라우드가 그 그림을 content/blog-banner/src/ 에 넣고 이 스크립트로 한글 글씨·카테고리 칸을 얹는다 (GPT 는 한글이 깨진다).
 * 그림이 아직 없으면 색 바탕·빈 동그라미로 자리만 그린다.
 * 결과: content/blog-banner/out/banner-<시안>.png (966×400 — 네이버 타이틀 폭) + banner-<시안>@2x.png (선명한 화면용)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = path.join(ROOT, 'content/blog-banner/src');
const OUT = path.join(ROOT, 'content/blog-banner/out');
fs.mkdirSync(OUT, { recursive: true });
const b64 = (f) => fs.readFileSync(path.join(ROOT, f)).toString('base64');
const font = (f) => `data:font/ttf;base64,${b64(f)}`;
const img = (slug) => {
  const f = path.join(SRC, `${slug}.png`);
  return fs.existsSync(f) ? `data:image/png;base64,${fs.readFileSync(f).toString('base64')}` : '';
};

const CATS = [
  { name: '생활·정보', icon: 'icon-life' },
  { name: '생활·보장', icon: 'icon-care' },
  { name: '이슈·뉴스', icon: 'icon-news' },
  { name: '연예·방송', icon: 'icon-ent' },
  { name: '맛집·나들이', icon: 'icon-food' },
];
const V = {
  a: { bg: 'bg-a-warm', fallback: 'linear-gradient(90deg,#f6e7d3,#f3d9bf)', fade: 'rgba(250,240,226,.85)', title: '#2f5a3c', tag: '#7a5532', sub: '#5b4a3a', ring: '#e7cfae' },
  b: { bg: 'bg-b-fresh', fallback: 'linear-gradient(90deg,#dff5ec,#d6ecfa)', fade: 'rgba(238,250,248,.85)', title: '#1f5f7a', tag: '#2f7d6a', sub: '#3d5560', ring: '#bfe3dc' },
  c: { bg: 'bg-c-clean', fallback: 'linear-gradient(90deg,#fffdf6,#fbf1cf)', fade: 'rgba(255,253,246,.88)', title: '#3a3a3a', tag: '#c4842a', sub: '#555', ring: '#efdca8' },
};

function html(v) {
  const t = V[v];
  const bg = img(t.bg);
  const cats = CATS.map((c) => {
    const i = img(c.icon);
    return `<div class="cat"><div class="ic">${i ? `<img src="${i}">` : ''}</div><div class="nm">${c.name}</div></div>`;
  }).join('');
  return `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:Jua;src:url('${font('scripts/lib/fonts/Jua-Regular.ttf')}')}
@font-face{font-family:Pre;src:url('${font('scripts/threads/fonts/Pretendard-Bold.otf')}')}
*{margin:0;padding:0;box-sizing:border-box}
body{width:966px;height:400px;overflow:hidden;position:relative;background:${t.fallback};word-break:keep-all}
.bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:60% 38%}
.fade{position:absolute;inset:0;background:linear-gradient(90deg,${t.fade} 0%,${t.fade} 38%,rgba(255,255,255,0) 66%)}
.txt{position:absolute;left:46px;top:34px}
.title{font:82px/1 Jua;color:${t.title};letter-spacing:2px}
.tag{margin-top:12px;font:28px/1.2 Jua;color:${t.tag}}
.sub{margin-top:8px;font:18px/1.3 Pre;color:${t.sub}}
.cats{position:absolute;left:36px;bottom:22px;display:flex;gap:10px}
.cat{width:104px;text-align:center}
.ic{width:84px;height:84px;margin:0 auto;border-radius:50%;background:#fff;border:3px solid ${t.ring};overflow:hidden;box-shadow:0 3px 8px rgba(0,0,0,.08)}
.ic img{width:100%;height:100%;object-fit:cover;transform:scale(1.12)}
.nm{margin-top:6px;font:16px Pre;color:${t.sub}}
</style>
${bg ? `<img class="bg" src="${bg}">` : ''}<div class="fade"></div>
<div class="txt"><div class="title">성글벙글</div><div class="tag">매일매일 좋은 날을 나누는 공간</div><div class="sub">살림·건강·보험부터 오늘의 이슈까지</div></div>
<div class="cats">${cats}</div>`;
}

const want = process.argv[2] ? [process.argv[2]] : Object.keys(V);
const browser = await chromium.launch();
for (const v of want) {
  for (const scale of [1, 2]) {
    const page = await browser.newPage({ viewport: { width: 966, height: 400 }, deviceScaleFactor: scale });
    await page.setContent(html(v));
    await page.waitForTimeout(300);
    const f = path.join(OUT, `banner-${v}${scale === 2 ? '@2x' : ''}.png`);
    await page.screenshot({ path: f });
    await page.close();
    console.log(f);
  }
}
await browser.close();
