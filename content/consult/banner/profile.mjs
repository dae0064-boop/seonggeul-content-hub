// 블로그 프로필 이미지 + 모바일앱 커버 이미지 (2026-11-09 사용자 — 별명 "친근한 설계사", 블로그명 "친근한 설계사의 보험 이야기")
// node content/consult/banner/profile.mjs --photo 사람(배경 뺀 PNG) [--out 폴더] → profile.png(1000×1000) · cover.png(1080×1080)
// 사람 사진은 저장소에 두지 않는다 (Drive 블로그배너/consult-pose-hands.png 에서 흰 배경을 뺀 것).
// 색은 배너와 같게: 딥그린 #12463D · 크림 · 샴페인 골드.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const A = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const PH = A('--photo', '');
if (!PH || !fs.existsSync(PH)) { console.error('사용법: node content/consult/banner/profile.mjs --photo 사람.png [--out 폴더]'); process.exit(1); }
const OUT = A('--out', '.');
const photo = `data:image/png;base64,${fs.readFileSync(PH).toString('base64')}`;
const font = (f) => `data:font/${f.endsWith('otf') ? 'otf' : 'ttf'};base64,${fs.readFileSync(f).toString('base64')}`;
const SERIF = font('scripts/lib/fonts/NotoSerifKR-Black.ttf');
const BOLD = font('scripts/threads/fonts/Pretendard-Bold.otf');
const SEMI = font('scripts/threads/fonts/Pretendard-SemiBold.otf');

const base = `
@font-face{font-family:S;src:url(${SERIF})}
@font-face{font-family:B;src:url(${BOLD})}
@font-face{font-family:M;src:url(${SEMI})}
*{margin:0;padding:0;box-sizing:border-box}
body{width:var(--w);height:var(--h);overflow:hidden;position:relative;
  background:radial-gradient(120% 90% at 70% 20%,#21695a 0%,#12463D 55%,#0b332c 100%)}
.glow{position:absolute;inset:0;background:
  linear-gradient(115deg,transparent 0 38%,rgba(255,236,190,.07) 38% 46%,transparent 46% 60%,rgba(255,236,190,.05) 60% 64%,transparent 64%)}
.ring{position:absolute;border-radius:50%;border:2px solid rgba(226,196,140,.35)}
img.p{position:absolute;filter:drop-shadow(0 18px 30px rgba(0,0,0,.35))}
`;

// 프로필: 얼굴이 가운데(모바일은 동그랗게 잘린다), 글씨 없음(161px 로 줄어든다)
const profile = `<html><head><style>${base}
:root{--w:1000px;--h:1000px}
.halo{position:absolute;left:50%;top:44%;width:640px;height:640px;transform:translate(-50%,-50%);border-radius:50%;
  background:radial-gradient(circle,rgba(255,240,210,.28) 0%,rgba(255,240,210,.12) 45%,rgba(255,240,210,0) 70%)}
img.p{width:1180px;left:50%;top:70px;transform:translateX(-50%)}
</style></head><body><div class="glow"></div><div class="halo"></div><img class="p" src="${photo}"></body></html>`;

// 모바일앱 커버: 네이버가 아래쪽에 블로그명·별명을 흰 글씨로 얹는다 → 아래 30% 는 비워 두고, 글씨는 왼쪽 위
const cover = `<html><head><style>${base}
:root{--w:1080px;--h:1080px}
.ring.r1{width:760px;height:760px;right:-170px;top:40px}
.ring.r2{width:600px;height:600px;right:-90px;top:120px;border-color:rgba(226,196,140,.2)}
img.p{width:820px;right:-150px;top:120px}
.fade{position:absolute;left:0;right:0;bottom:0;height:360px;background:linear-gradient(transparent,rgba(8,40,34,.92))}
.t{position:absolute;left:72px;top:120px;color:#fbf5e9}
.chip{display:inline-block;font:24px M;letter-spacing:1px;color:#12463D;background:#e2c48c;padding:10px 22px;border-radius:40px}
.h{font:78px/1.22 S;margin-top:30px;letter-spacing:1px}
.h b{color:#e8cf9c;font-weight:inherit}
.s{margin-top:34px;font:31px/1.75 M;color:rgba(251,245,233,.92)}
.s i{font-style:normal;color:#e2c48c;margin-right:12px}
</style></head><body><div class="glow"></div><div class="ring r1"></div><div class="ring r2"></div>
<img class="p" src="${photo}"><div class="fade"></div>
<div class="t"><span class="chip">친근한 설계사</span>
<div class="h">보험,<br><b>어렵지 않게</b><br>풀어 드려요</div>
<div class="s"><i>✔</i>실비·보험금 청구<br><i>✔</i>병원비·돌봄 제도</div></div>
</body></html>`;

const browser = await chromium.launch();
for (const [name, html, w, h] of [['profile.png', profile, 1000, 1000], ['cover.png', cover, 1080, 1080]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(OUT, name) });
  await page.close();
  console.log('만듦:', path.join(OUT, name));
}
await browser.close();
