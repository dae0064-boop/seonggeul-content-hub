#!/usr/bin/env node
/**
 * 인스타 카드뉴스 → 세로 영상 (네이버 클립 · 인스타 릴스 겸용) 예시 (2026-11-05 사용자 —
 * "카드뉴스가 좋은데 눈에 잘 안 들어온다, 대체할 수 있는지 확인하고 예시로 하나").
 *
 *   node scripts/clip/make-reel.mjs content/instagram/sets/<날짜>.json <편 번호> [--out 폴더] [--cards 카드 그림 폴더]
 *
 * 카드뉴스 원고(json)를 그대로 쓴다 — 말을 새로 지어내지 않는다. 그림 값 0원(편의 AI 바탕 사진을 다시 씀).
 *  - 1080×1920, 30fps, 소리 없음(음악은 올릴 때 앱 안의 무료 음악으로)
 *  - 바탕 사진이 천천히 다가오고, 위에 이야기(스토리)식 진행 막대
 *  - 장마다 글이 한 줄씩 떠오르고, [핵심 낱말]에 노란 형광펜이 그어진다
 *  - 카톡형 장은 말풍선이 하나씩, 체크 장은 ✔ 가 하나씩
 *  - 마지막은 심의 고지 장(카드 07.png)을 그대로 4초 — 심의 글이라 빼지 않는다
 * 장면 하나하나를 브라우저 애니메이션 시간을 멈춰 가며 찍어(프레임마다) ffmpeg 로 잇는다.
 *
 * ⚠ 보험 상담 유입(심의) 글이다. 카드(그림) 심의필을 영상에 그대로 쓸 수 없다 — 영상은 영상으로 따로 GOMS 심의를 받은 뒤에만 올린다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const setFile = args.find((a) => a.endsWith('.json'));
const no = Number(args.find((a) => /^\d+$/.test(a)));
if (!setFile || !no) { console.log('사용법: node scripts/clip/make-reel.mjs content/instagram/sets/<날짜>.json <편 번호> [--out 폴더]'); process.exit(1); }
const oi = args.indexOf('--out');
const set = JSON.parse(fs.readFileSync(setFile, 'utf8'));
const post = set.posts.find((p) => p.no === no);
if (!post) { console.log(`❌ ${no}편이 없어요`); process.exit(1); }
const date = path.basename(setFile, '.json');
const outDir = path.resolve(oi >= 0 ? args[oi + 1] : path.join(ROOT, 'dumps', 'reels', date));
fs.mkdirSync(outDir, { recursive: true });

const b64 = (f) => fs.readFileSync(f).toString('base64');
const font = (f) => `url(data:font/ttf;base64,${b64(path.join(ROOT, 'scripts/lib/fonts', f))})`;
const bgFile = [path.join(ROOT, 'content/instagram/bg', `${post.slug}.png`), path.join(ROOT, 'content/instagram/bg/_placeholder.png')].find((f) => fs.existsSync(f));
const ci = args.indexOf('--cards'); // 카드 그림 폴더 (마지막 장 = 심의 고지). 없으면 content/instagram/images/<날짜>/<번호>-<slug>/
const cardDir = ci >= 0 ? path.resolve(args[ci + 1]) : path.join(ROOT, 'content/instagram/images', date, `${no}-${post.slug}`);
const lastCard = fs.existsSync(cardDir) ? fs.readdirSync(cardDir).filter((f) => /^\d+\.png$/.test(f)).sort().pop() : '';
const discl = lastCard ? path.join(cardDir, lastCard) : '';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// [낱말] → 형광펜. d = 이 낱말에 펜이 그어지기 시작하는 시각(초)
const hi = (s, d) => esc(s).replace(/\[(.+?)\]/g, (_, w) => `<em style="--d:${d}s">${w}</em>`);

// ── 장면 만들기 (원고 카드 그대로) ─────────────────────────
const scenes = []; // { html, dur }
let t; // 장면 안 시각 계산용
const line = (cls, s, d, extra = '') => `<div class="${cls} up" style="animation-delay:${d}s${extra}">${hi(s, d + 0.35)}</div>`;
for (const c of post.cards) {
  t = 0.15; let h = '';
  const head = (c.head || c.title || []);
  if (c.type === 'cover') {
    h += `<div class="kw pop" style="animation-delay:0.05s">${esc(c.kw)}</div>`;
    t = 0.45;
    for (const l of head) { h += line('h1', l, t); t += 0.35; }
    if (c.sub) { h += line('sub', `[${c.sub}]`, t + 0.2); t += 0.6; }
    h += `<div class="swipe up" style="animation-delay:${t + 0.3}s">끝까지 보면 정리돼요 ↓</div>`;
    scenes.push({ html: `<div class="wrap cover">${h}</div>`, dur: Math.max(3.2, t + 1.6) });
    continue;
  }
  if (c.label) { h += `<div class="lab up" style="animation-delay:${t}s">${esc(c.label)}</div>`; t += 0.2; }
  for (const l of head) { h += line('h2', l, t); t += 0.3; }
  t += 0.2;
  if (c.type === 'chat') {
    for (const [who, m] of c.msgs) {
      if (who === 'a') h += `<div class="bub a up" style="animation-delay:${t}s"><span class="dots" style="animation-delay:${t}s">•••</span><div class="txt" style="animation-delay:${t + 0.45}s">${hi(m, t + 0.8)}</div></div>`;
      else h += `<div class="bub q up" style="animation-delay:${t}s">${hi(m, t + 0.3)}</div>`;
      t += who === 'a' ? 1.25 : 0.9;
    }
  } else if (c.type === 'steps') {
    for (const [n, s] of c.steps) { h += `<div class="step up" style="animation-delay:${t}s"><b>${esc(n)}</b><span>${hi(s, t + 0.35)}</span></div>`; t += 0.85; }
  } else if (c.type === 'compare') {
    for (const side of [c.left, c.right]) { h += `<div class="cmp up" style="animation-delay:${t}s"><h4>${esc(side.t)}</h4><p>${side.lines.map(esc).join('<br>')}</p></div>`; t += 0.9; }
    if (c.foot) { h += line('foot2', c.foot, t); t += 0.5; }
  } else if (c.type === 'check') {
    for (const s of c.checks) { h += `<div class="ck up" style="animation-delay:${t}s"><i class="tick" style="animation-delay:${t + 0.2}s">✔</i><span>${hi(s, t + 0.35)}</span></div>`; t += 0.75; }
    if (c.cta) { h += `<div class="cta up" style="animation-delay:${t + 0.2}s">📌 ${esc(c.cta)}</div>`; t += 0.6; }
  }
  if (c.terms) { h += `<div class="terms up" style="animation-delay:${t}s">자세한 내용은 약관을 참조하시기 바랍니다</div>`; t += 0.3; }
  if (c.src) h += `<div class="src">근거 · ${esc(c.src)}</div>`;
  scenes.push({ html: `<div class="wrap">${h}</div>`, dur: Math.max(3.4, t + 1.9) });
}

const BG = `data:image/png;base64,${b64(bgFile)}`;
const css = `@font-face{font-family:Ser;src:${font('NotoSerifKR-Black.ttf')}}@font-face{font-family:H;src:${font('BlackHanSans-Regular.ttf')}}
@font-face{font-family:GB;src:${font('GothicA1-Bold.ttf')}}@font-face{font-family:GX;src:${font('GothicA1-ExtraBold.ttf')}}
*{margin:0;box-sizing:border-box}body{width:1080px;height:1920px;overflow:hidden;background:#000;color:#fff;font-family:GB,sans-serif;word-break:keep-all;text-wrap:balance;position:relative}
.bg{position:absolute;inset:-40px;background:url(${BG}) center/cover;filter:brightness(1.25);animation:zoom var(--D) linear both}
@keyframes zoom{from{transform:scale(1.05)}to{transform:scale(1.18) translateY(-20px)}}
.shade{position:absolute;inset:0;background:linear-gradient(rgba(0,0,0,.72),rgba(0,0,0,.38) 45%,rgba(0,0,0,.7))}
.bars{position:absolute;top:70px;left:50px;right:50px;display:flex;gap:10px}.bars i{flex:1;height:8px;border-radius:4px;background:rgba(255,255,255,.3);overflow:hidden}
.bars i b{display:block;height:100%;background:#fff;width:var(--w)}.bars i.now b{animation:fill var(--D) linear both}@keyframes fill{from{width:0}to{width:100%}}
.who{position:absolute;top:110px;left:50px;font-family:GX;font-size:34px;display:flex;align-items:center;gap:16px;text-shadow:0 2px 8px #000}
.who img{width:64px;height:64px;border-radius:50%;background:#fff}
.wrap{position:absolute;left:80px;right:80px;top:250px;bottom:400px;display:flex;flex-direction:column;justify-content:center}
.wrap>*{flex:none}
.up{opacity:0;animation:up .55s cubic-bezier(.2,.9,.3,1.2) both}@keyframes up{from{opacity:0;transform:translateY(60px)}to{opacity:1;transform:none}}
.pop{opacity:0;animation:pop .5s cubic-bezier(.2,1.6,.4,1) both}@keyframes pop{from{opacity:0;transform:scale(.4) rotate(-6deg)}to{opacity:1;transform:rotate(-3deg)}}
.kw{align-self:flex-start;background:#FFD978;color:#2b1d10;font-family:H;font-size:96px;padding:14px 40px;border-radius:24px;margin-bottom:56px;box-shadow:0 10px 0 rgba(0,0,0,.35)}
.h1{font-family:Ser;font-size:126px;line-height:1.24;text-shadow:0 6px 24px rgba(0,0,0,.8)}
.h2{font-family:Ser;font-size:88px;line-height:1.3;text-shadow:0 6px 24px rgba(0,0,0,.8)}
.sub{font-family:GX;font-size:62px;margin-top:60px;text-shadow:0 4px 14px #000}
.swipe{margin-top:120px;font-family:GX;font-size:44px;color:#FFD978}
em{font-style:normal;color:#FFD978;background:linear-gradient(rgba(255,200,80,.45),rgba(255,200,80,.45)) left 88%/0% 34% no-repeat;animation:pen .5s ease-out both;animation-delay:var(--d)}
@keyframes pen{to{background-size:100% 34%}}
.lab{font-family:GX;font-size:42px;color:#FFD978;margin-bottom:28px;padding-left:66px;position:relative}.lab:before{content:'';position:absolute;left:0;top:50%;width:46px;height:4px;background:#FFD978}
.bub{font-size:50px;line-height:1.45;border-radius:40px;padding:34px 42px;margin-top:40px;max-width:880px;box-shadow:0 10px 30px rgba(0,0,0,.4)}
.bub.q{background:#fff;color:#222;margin-left:auto;border-bottom-right-radius:8px}
.bub.a{align-self:flex-start;background:#FFE28A;color:#2b1d10;border-bottom-left-radius:8px;position:relative;min-height:120px}
.bub.a em{color:#C2410C;background-image:linear-gradient(rgba(255,255,255,.7),rgba(255,255,255,.7))}
.dots{position:absolute;left:42px;top:30px;font-size:50px;letter-spacing:6px;animation:dots .45s steps(1) both}@keyframes dots{0%{opacity:1}100%{opacity:0}}
.txt{opacity:0;animation:show .01s both}@keyframes show{to{opacity:1}}
.step{display:flex;gap:30px;align-items:flex-start;font-size:58px;line-height:1.45;margin-top:56px;text-shadow:0 3px 12px #000}
.step b{flex:none;width:86px;height:86px;border-radius:50%;background:#fff;color:#111;font-family:GX;font-size:52px;display:flex;align-items:center;justify-content:center;margin-top:-2px}
.cmp{border-left:8px solid #FFD978;padding:16px 0 16px 40px;margin-top:56px;text-shadow:0 3px 12px #000}.cmp h4{font-family:GX;font-size:52px;color:#FFD978;margin-bottom:14px}.cmp p{font-size:58px;line-height:1.45}
.foot2{font-size:44px;margin-top:56px;color:#eee}
.ck{font-size:60px;line-height:1.4;margin-top:52px;display:flex;gap:28px;text-shadow:0 3px 12px #000}
.tick{flex:none;font-style:normal;color:#2b1d10;background:#FFD978;width:80px;height:80px;border-radius:20px;display:flex;align-items:center;justify-content:center;font-family:GX;opacity:0;animation:pop .4s cubic-bezier(.2,1.6,.4,1) both}
.cta{margin-top:80px;font-family:GX;font-size:44px;line-height:1.5;background:rgba(255,255,255,.14);border:3px solid rgba(255,255,255,.5);border-radius:30px;padding:30px 36px}
.terms{margin-top:50px;font-size:36px;color:#ddd}
.src{margin-top:70px;font-size:34px;color:#ddd}
.mark{position:absolute;bottom:90px;left:0;right:0;text-align:center;font-family:GX;font-size:36px;color:rgba(255,255,255,.85)}`;

const avatar = path.join(ROOT, 'content/instagram/avatar.png');
const N = scenes.length + (discl ? 1 : 0);
const page = (s, i) => `<!doctype html><meta charset="utf-8"><style>${css}</style><body style="--D:${s.dur}s">
<div class="bg"></div><div class="shade"></div>
<div class="bars">${Array.from({ length: N }, (_, k) => `<i class="${k === i ? 'now' : ''}" style="--w:${k < i ? '100%' : '0'}"><b></b></i>`).join('')}</div>
<div class="who">${fs.existsSync(avatar) ? `<img src="data:image/png;base64,${b64(avatar)}">` : ''}친근한 설계사</div>
${s.html}<div class="mark">${i + 1} / ${N}</div></body>`;

// ── 프레임 찍기 ────────────────────────────────────────────
const FPS = 30;
const fdir = path.join(outDir, `${post.slug}-frames`);
fs.rmSync(fdir, { recursive: true, force: true }); fs.mkdirSync(fdir);
const { launch } = await import('../lib/overlay.mjs');
const browser = await launch();
let k = 0;
try {
  const pg = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  for (let i = 0; i < scenes.length; i++) {
    await pg.setContent(page(scenes[i], i), { waitUntil: 'load' });
    await pg.evaluate(() => document.fonts.ready);
    // 원고에서 한 줄로 쓴 제목 줄이 두 줄로 끊기면 글씨를 줄여 한 줄에 (사용자 — "글자가 애매하게 끊긴다")
    await pg.evaluate(() => { for (const el of document.querySelectorAll('.h1,.h2')) { const lh = parseFloat(getComputedStyle(el).lineHeight); let fs = parseFloat(getComputedStyle(el).fontSize); const min = fs * 0.7; while (el.offsetHeight > lh * 1.3 && fs > min) { fs *= 0.96; el.style.fontSize = fs + 'px'; el.style.lineHeight = lh * fs / parseFloat(getComputedStyle(el).fontSize) + 'px'; } } });
    await pg.evaluate(() => document.getAnimations().forEach((a) => a.pause()));
    const n = Math.round(scenes[i].dur * FPS);
    for (let f = 0; f < n; f++) {
      await pg.evaluate((ms) => document.getAnimations().forEach((a) => { a.currentTime = ms; }), (f / FPS) * 1000);
      await pg.screenshot({ path: path.join(fdir, `${String(k++).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 90 });
    }
    if (i === 0) await pg.screenshot({ path: path.join(outDir, `${post.slug}-cover.jpg`), type: 'jpeg', quality: 90 });
  }
  if (discl) {
    // 심의 고지 장 — 카드 그대로, 4초
    await pg.setContent(`<body style="margin:0;width:1080px;height:1920px;background:#000;display:flex;align-items:center;justify-content:center"><img src="data:image/png;base64,${b64(discl)}" style="width:1080px"></body>`);
    const f0 = path.join(fdir, 'discl.jpg'); await pg.screenshot({ path: f0, type: 'jpeg', quality: 92 });
    for (let f = 0; f < 4 * FPS; f++) fs.copyFileSync(f0, path.join(fdir, `${String(k++).padStart(5, '0')}.jpg`));
    fs.rmSync(f0);
  }
} finally { await browser.close(); }

let ffmpeg = process.env.FFMPEG || 'ffmpeg';
try { execFileSync(ffmpeg, ['-version'], { stdio: 'ignore' }); } catch { ffmpeg = (await import('ffmpeg-static')).default; }
const mp4 = path.join(outDir, `${no}-${post.slug}.mp4`);
execFileSync(ffmpeg, ['-y', '-framerate', String(FPS), '-i', path.join(fdir, '%05d.jpg'), '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-shortest',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', mp4], { stdio: 'ignore' });
fs.rmSync(fdir, { recursive: true, force: true });
console.log(`✅ ${mp4} (${N}장면, 약 ${Math.round(k / FPS)}초)`);
