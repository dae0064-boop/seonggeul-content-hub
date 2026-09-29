#!/usr/bin/env node
/**
 * 대표 사진(1번 이미지)을 만든다. 사진은 OpenAI 이미지 API 로 받고, 제목 글자는 여기서 얹는다.
 *
 *   OPENAI_API_KEY=... node scripts/thumbnail.mjs content/posts/<원고>.md
 *   node scripts/thumbnail.mjs content/posts/<원고>.md --photo 받아둔사진.png   (API 호출 없이 글자만 얹기)
 *
 * 옵션
 *   --model gpt-image-1-mini   이미지 모델 (기본값)
 *   --quality low              low | medium | high (기본 low — 가장 저렴)
 *   --photo <파일>             이미 있는 사진을 쓴다. API 를 부르지 않는다
 *
 * 한글 글자는 이미지 모델에 맡기지 않는다. 저가 품질에서 한글이 자주 깨지므로
 * 사진은 글자 없이 받고, 제목은 HTML 로 그려 정확하게 얹는다.
 *
 * 결과: out/images/<슬러그>/01-photo.png (원본 사진), 01-thumb.jpg (제목 합성본)
 */
import fs from 'node:fs';
import path from 'node:path';
import { parsePost } from './lib/parse-post.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const file = args.find((a) => a.endsWith('.md'));
if (!file) {
  console.error('사용법: node scripts/thumbnail.mjs content/posts/<원고>.md [--photo 사진] [--model 모델] [--quality low]');
  process.exit(1);
}

const model = opt('model', 'gpt-image-1-mini');
const quality = opt('quality', 'low');
const photoArg = opt('photo');

const post = parsePost(fs.readFileSync(file, 'utf8'));
const slug = path.basename(file, '.md');
const outDir = path.join('out', 'images', slug);
fs.mkdirSync(outDir, { recursive: true });

// 이미지 프롬프트는 작업판 데이터에 있다. 제목으로 찾는다.
const board = JSON.parse(fs.readFileSync('content/board/posts-data.json', 'utf8'));
const entry = board.find((p) => p.title === post.title);
if (!entry?.images?.[0]?.p) {
  console.error(`작업판(content/board/posts-data.json)에서 "${post.title}" 의 1번 이미지 프롬프트를 찾지 못했습니다.`);
  process.exit(1);
}

const prompt = entry.images[0].p +
  ', the lower half of the frame is calm and uncluttered so a title can be placed over it' +
  ', absolutely no text, letters, numbers, signs, logos or watermarks anywhere in the image';

let photoPath = photoArg;
if (!photoPath) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    console.error('OPENAI_API_KEY 환경변수가 없습니다. 키를 넣거나 --photo 로 사진을 지정하세요.');
    process.exit(1);
  }
  console.log(`사진 생성 중… (${model}, quality=${quality}, 1024x1024)`);
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, size: '1024x1024', quality, n: 1 }),
  });
  const json = await res.json();
  if (!res.ok) {
    console.error(`이미지 API 오류 (${res.status}): ${json.error?.message || JSON.stringify(json)}`);
    process.exit(1);
  }
  photoPath = path.join(outDir, '01-photo.png');
  fs.writeFileSync(photoPath, Buffer.from(json.data[0].b64_json, 'base64'));
  if (json.usage) console.log(`사용량: ${JSON.stringify(json.usage)}`);
  console.log(`✅ ${photoPath}`);
}

// 제목은 쉼표에서 두 줄로 나눈다. 첫 줄(메인 키워드 쪽)을 강조색으로.
const [line1, ...rest] = post.title.split(/,\s*/);
const line2 = rest.join(', ');

const { chromium } = await (async () => {
  for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright/index.js', '/usr/lib/node_modules/playwright/index.js']) {
    try {
      const mod = await import(p);
      const api = mod.chromium ? mod : mod.default;
      if (api?.chromium) return api;
    } catch {}
  }
  console.error('playwright 를 찾지 못했습니다. npm install 을 먼저 실행하세요.');
  process.exit(1);
})();

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const photo = `data:image/png;base64,${fs.readFileSync(photoPath).toString('base64')}`;
const SIZE = 1080;

// 폰트는 제목에 쓰인 글자만 잘라 받아 페이지 안에 넣는다.
// 브라우저가 외부 폰트를 못 받는 환경(프록시 인증서 등)에서도 글자가 정확히 나온다.
async function fontFace(family, query, text) {
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${query}&text=${encodeURIComponent(text)}`)).text();
  const url = /url\((.+?)\)/.exec(css)?.[1];
  if (!url) throw new Error(`${family} 폰트를 받지 못했습니다.`);
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  const weight = /font-weight:\s*(\d+)/.exec(css)?.[1] || '400';
  return `@font-face{font-family:"${family}";font-weight:${weight};src:url(data:font/ttf;base64,${buf.toString('base64')}) format("truetype")}`;
}
const fonts = (await Promise.all([
  fontFace('Black Han Sans', 'Black+Han+Sans', line1),
  fontFace('Noto Sans KR', 'Noto+Sans+KR:wght@900', line2 || line1),
])).join('\n');

const html = `<!doctype html><html><head><meta charset="utf-8">
<style>
  ${fonts}
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:${SIZE}px;height:${SIZE}px;overflow:hidden}
  .card{position:relative;width:${SIZE}px;height:${SIZE}px;background:#222 url('${photo}') center/cover no-repeat}
  .shade{position:absolute;inset:0;background:linear-gradient(to bottom,rgba(0,0,0,0) 38%,rgba(0,0,0,.55) 62%,rgba(0,0,0,.82) 100%)}
  .text{position:absolute;left:72px;right:72px;bottom:86px;color:#fff;word-break:keep-all}
  .l1{font-family:"Black Han Sans","Noto Sans KR",sans-serif;font-size:104px;line-height:1.12;color:#FFE14D;
      text-shadow:0 4px 18px rgba(0,0,0,.45)}
  .l2{font-family:"Noto Sans KR",sans-serif;font-weight:900;font-size:62px;line-height:1.3;margin-top:18px;
      text-shadow:0 3px 14px rgba(0,0,0,.5)}
</style></head><body>
<div class="card"><div class="shade"></div>
  <div class="text"><div class="l1">${esc(line1)}</div>${line2 ? `<div class="l2">${esc(line2)}</div>` : ''}</div>
</div></body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  const out = path.join(outDir, '01-thumb.jpg');
  await page.screenshot({ path: out, type: 'jpeg', quality: 90 });
  console.log(`✅ ${out}`);
} finally {
  await browser.close();
}
