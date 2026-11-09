#!/usr/bin/env node
/**
 * 네이버 클립용 세로 영상 만들기 (2026-11-05 사용자 — "네이버 클립부터 진행해줘").
 *
 *   node scripts/clip/make-clip.mjs content/posts/<원고>.md [--out dumps/clips/<날짜>]
 *
 * 블로그 원고(.md) 하나로 1080×1920 세로 영상(약 20초, 소리 없음)을 만든다. 그림 값 0원 — 글자 장면을 HTML 로 그려 찍고 ffmpeg 로 잇는다.
 *   ① 표지: 카테고리 · 제목 (PC 에 그 글 대표사진 content/images/<슬러그>/01.* 이 있으면 위에 깐다)
 *   ② 한눈에 보기: 원고의 '•' 줄 (없으면 노란배경 줄)
 *   ③④ 꼭 기억할 한 문장: [노란배경] 줄 두 개 (위 소제목과 함께)
 *   ⑤ 많이 묻는 질문: Q1/A1
 *   ⑥ 끝: "네이버에서 '<메인 키워드> 성글벙글' 검색" — 클립 설명에는 링크를 못 단다
 * 같은 폴더에 <슬러그>.json (클립 설명 300자 안쪽·태그) 을 남긴다. 업로드는 scripts/clip/upload-clip.mjs.
 * 원고에 없는 말은 넣지 않는다 (사실은 원고 그대로 — 원고가 1차 원문으로 확인한 것).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const src = args.find((a) => a.endsWith('.md'));
if (!src) { console.log('사용법: node scripts/clip/make-clip.mjs content/posts/<원고>.md [--out 폴더]'); process.exit(1); }
const oi = args.indexOf('--out');
const slug = path.basename(src, '.md');
const date = slug.slice(0, 10);
const outDir = path.resolve(oi >= 0 ? args[oi + 1] : path.join(ROOT, 'dumps', 'clips', date));
fs.mkdirSync(outDir, { recursive: true });

// ── 원고 읽기 ──────────────────────────────────────────────
const raw = fs.readFileSync(src, 'utf8').replace(/\r/g, '');
const fm = {}; let body = raw;
const m = /^---\n([\s\S]*?)\n---\n/.exec(raw);
if (m) { for (const l of m[1].split('\n')) { const i = l.indexOf(':'); if (i > 0) fm[l.slice(0, i).trim()] = l.slice(i + 1).trim(); } body = raw.slice(m[0].length); }
const clean = (s) => s.replace(/\[\/?(빨간글씨|파란글씨|노란배경|초록배경)\]/g, '').trim();
const lines = body.split('\n');
const bullets = lines.filter((l) => /^•\s*/.test(l)).map((l) => clean(l.replace(/^•\s*/, ''))).slice(0, 4);
const yellow = [];
let lastHead = '';
for (const l of lines) {
  const h = /^인용구\(소제목\)\s*(.+)/.exec(l); if (h) { lastHead = clean(h[1]); continue; }
  const y = /\[노란배경\](.+?)\[\/노란배경\]/.exec(l);
  if (y && clean(y[1]).length >= 8) yellow.push({ head: lastHead, t: clean(y[1]) });
}
const q = lines.findIndex((l) => /^Q1:/.test(l));
let qa = null;
if (q >= 0) {
  const a = []; for (let i = q + 1; i < lines.length && lines[i].trim(); i++) a.push(lines[i].replace(/^A1:\s*/, ''));
  qa = { q: clean(lines[q].replace(/^Q1:\s*/, '')), a: clean(a.join(' ')).slice(0, 90) };
}
const title = fm.title || slug;
const [t1, ...rest] = title.split(/,\s*/);
const t2 = rest.join(', ');
const key = fm.main_keyword || t1;
const cat = /보장|보험/.test(fm.category || '') ? '생활보장' : (fm.issue ? '이슈' : '생활정보');

// ── 장면 HTML ──────────────────────────────────────────────
const font = (f) => `url(data:font/ttf;base64,${fs.readFileSync(path.join(ROOT, 'scripts/lib/fonts', f)).toString('base64')})`;
const FACE = `@font-face{font-family:H;src:${font('BlackHanSans-Regular.ttf')}}@font-face{font-family:G;font-weight:800;src:${font('GothicA1-ExtraBold.ttf')}}@font-face{font-family:G;font-weight:500;src:${font('GothicA1-Medium.ttf')}}`;
const C = { ivory: '#F6EFE3', ink: '#3E2F25', sage: '#7F9C86', coral: '#E9806B', butter: '#F6D77A' };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const shell = (inner, n, total) => `<!doctype html><meta charset="utf-8"><style>${FACE}
*{margin:0;box-sizing:border-box}body{width:1080px;height:1920px;background:${C.ivory};font-family:G,sans-serif;color:${C.ink};position:relative;overflow:hidden;word-break:keep-all}
.top{position:absolute;top:110px;left:90px;right:90px;display:flex;justify-content:space-between;align-items:center;font-weight:800;font-size:40px}
.chip{background:${C.sage};color:#fff;border-radius:40px;padding:14px 34px}
.pg{color:${C.sage}}
.wrap{position:absolute;left:90px;right:90px;top:300px;bottom:300px;display:flex;flex-direction:column;justify-content:center}
.foot{position:absolute;bottom:120px;left:0;right:0;text-align:center;font-family:H;font-size:46px;color:${C.sage}}
.h{font-family:H;font-size:104px;line-height:1.18;letter-spacing:-1px}
.sub{font-weight:800;font-size:58px;line-height:1.35;margin-top:44px;color:${C.coral}}
.lab{font-weight:800;font-size:46px;color:${C.sage};margin-bottom:36px}
.li{font-weight:800;font-size:60px;line-height:1.35;padding:26px 0 26px 70px;position:relative;border-bottom:3px dashed #d9cdbb}
.li:before{content:"✔";position:absolute;left:0;color:${C.coral}}
.big{font-family:H;font-size:92px;line-height:1.3;background:linear-gradient(transparent 62%,${C.butter} 62%);display:inline}
.qq{font-weight:800;font-size:64px;line-height:1.35;background:#fff;border-radius:40px;padding:44px 50px;box-shadow:0 8px 0 #e6dccb}
.aa{font-weight:500;font-size:54px;line-height:1.5;margin-top:50px;padding-left:20px;border-left:12px solid ${C.sage}}
.img{width:100%;height:760px;object-fit:cover;border-radius:48px;margin-bottom:70px}
</style><body><div class="top"><span class="chip">${esc(cat)}</span><span class="pg">${n}/${total}</span></div>${inner}<div class="foot">성글벙글</div></body>`;

const thumbFile = ['png', 'jpg', 'jpeg', 'webp'].map((e) => path.join(ROOT, 'content/images', slug, `01.${e}`)).find((f) => fs.existsSync(f));
const scenes = [];
scenes.push(`<div class="wrap">${thumbFile ? `<img class="img" src="data:image/${path.extname(thumbFile).slice(1)};base64,${fs.readFileSync(thumbFile).toString('base64')}">` : ''}<div class="h">${esc(t1)}</div>${t2 ? `<div class="sub">${esc(t2)}</div>` : ''}</div>`);
const pts = bullets.length >= 2 ? bullets : yellow.slice(0, 3).map((y) => y.t);
if (pts.length) scenes.push(`<div class="wrap"><div class="lab">${esc(key)}, 한눈에 보기</div>${pts.map((p) => `<div class="li">${esc(p)}</div>`).join('')}</div>`);
for (const y of yellow.slice(bullets.length >= 2 ? 0 : 3, (bullets.length >= 2 ? 0 : 3) + 2)) scenes.push(`<div class="wrap"><div class="lab">${esc(y.head || '꼭 기억할 한 가지')}</div><div><span class="big">${esc(y.t)}</span></div></div>`);
if (qa) scenes.push(`<div class="wrap"><div class="lab">많이 묻는 질문</div><div class="qq">Q. ${esc(qa.q)}</div><div class="aa">${esc(qa.a)}${qa.a.length >= 90 ? '…' : ''}</div></div>`);
scenes.push(`<div class="wrap" style="text-align:center"><div class="lab" style="font-size:54px">더 자세한 내용은</div><div class="h" style="font-size:96px">네이버에서<br><span class="big" style="font-size:96px">${esc(key)} 성글벙글</span><br>검색</div><div class="sub" style="color:${C.ink};font-size:50px">블로그에 출처와 함께 정리해 두었어요</div></div>`);

// ── 찍고 잇기 ──────────────────────────────────────────────
const { launch } = await import('../lib/overlay.mjs');
const browser = await launch();
const frames = [];
try {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  for (let i = 0; i < scenes.length; i++) {
    await page.setContent(shell(scenes[i], i + 1, scenes.length), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    // 글이 칸을 넘치면 글씨를 줄인다
    await page.evaluate(() => { const w = document.querySelector('.wrap'); let g = 30; while (w.scrollHeight > w.clientHeight + 2 && g--) { for (const el of w.querySelectorAll('*')) { const fs = parseFloat(getComputedStyle(el).fontSize); el.style.fontSize = fs * 0.94 + 'px'; } } });
    const f = path.join(outDir, `${slug}-${String(i + 1).padStart(2, '0')}.png`);
    await page.screenshot({ path: f });
    frames.push(f);
  }
} finally { await browser.close(); }

let ffmpeg = process.env.FFMPEG || 'ffmpeg';
try { execFileSync(ffmpeg, ['-version'], { stdio: 'ignore' }); }
catch { try { ffmpeg = (await import('ffmpeg-static')).default; } catch { console.log('❌ ffmpeg 를 찾지 못했어요 (npm install 로 ffmpeg-static 을 받아야 해요)'); process.exit(2); } }
const dur = frames.map((_, i) => (i === 0 ? 3 : 3.6));
const XF = 0.4;
const inputs = frames.flatMap((f, i) => ['-loop', '1', '-t', String(dur[i] + XF), '-i', f]);
let filter = frames.map((_, i) => `[${i}:v]scale=1080:1920,setsar=1,format=yuv420p,fps=30[v${i}]`).join(';');
let last = 'v0', off = 0;
for (let i = 1; i < frames.length; i++) { off += dur[i - 1]; filter += `;[${last}][v${i}]xfade=transition=fade:duration=${XF}:offset=${off.toFixed(2)}[x${i}]`; last = `x${i}`; }
const mp4 = path.join(outDir, `${slug}.mp4`);
execFileSync(ffmpeg, ['-y', ...inputs, '-f', 'lavfi', '-t', String(off + dur.at(-1) + XF), '-i', 'anullsrc=r=44100:cl=stereo',
  '-filter_complex', filter, '-map', `[${last}]`, '-map', `${frames.length}:a`, '-shortest', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-movflags', '+faststart', mp4], { stdio: 'ignore' });
for (const f of frames.slice(1)) fs.rmSync(f, { force: true });   // 표지 한 장만 남긴다 (미리보기용)

// ── 클립 설명 (300자 안쪽, 링크 없음) ─────────────────────
const tags = (fm.tags || '').split(/,\s*/).filter((t) => t && !/서이추|이웃추가/.test(t)).slice(0, 5);
let desc = `${title}\n\n${pts.slice(0, 3).map((p) => `✔ ${p}`).join('\n')}\n\n자세한 내용은 네이버에서 '${key} 성글벙글' 검색\n${tags.map((t) => `#${t.replace(/\s+/g, '')}`).join(' ')}`;
if (desc.length > 300) desc = desc.slice(0, 297) + '…';
fs.writeFileSync(path.join(outDir, `${slug}.json`), JSON.stringify({ slug, title, category: cat, description: desc, tags, video: path.basename(mp4), scenes: frames.length }, null, 2));
console.log(`✅ ${mp4} (${frames.length}장면, 약 ${Math.round(off + dur.at(-1))}초)`);
