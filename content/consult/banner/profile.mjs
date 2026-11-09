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
// --bgimg 사무실 바탕 (배너와 같은 그림, Drive 블로그배너/consult-bg-room1) — 없으면 딥그린 그라데이션
// 커버 칩 (2026-11-09 사용자 "몇 개 더") — 정보 주제만, 가입·비교 권유 말 없이
const CHIPS = ['실비·보험금 청구', '수술비·진단비', '병원비·간병·요양', '지원금·건강보험 제도'];
const BGI = A('--bgimg', '');
const bgimg = BGI && fs.existsSync(BGI) ? `data:image/png;base64,${fs.readFileSync(BGI).toString('base64')}` : '';
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
.room{position:absolute;inset:0;background-size:cover;background-repeat:no-repeat}
.room:after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,rgba(6,30,26,.55),rgba(6,30,26,.15) 60%,rgba(6,30,26,.25))}
.gold{background:linear-gradient(180deg,#f6e2b0 0%,#d9b46a 55%,#b88a3c 100%);-webkit-background-clip:text;color:transparent}
`;
const room = (pos, blur = 0) => bgimg ? `<div class="room" style="background-image:url(${bgimg});background-position:${pos};${blur ? `filter:blur(${blur}px);transform:scale(1.05)` : ''}"></div>` : '<div class="glow"></div>';

// 프로필: 얼굴이 가운데(모바일은 동그랗게 잘린다), 글씨 없음(161px 로 줄어든다)
const profile = `<html><head><style>${base}
:root{--w:1000px;--h:1000px}
.halo{position:absolute;left:50%;top:44%;width:640px;height:640px;transform:translate(-50%,-50%);border-radius:50%;
  background:radial-gradient(circle,rgba(255,240,210,.28) 0%,rgba(255,240,210,.12) 45%,rgba(255,240,210,0) 70%)}
img.p{width:1180px;left:50%;top:70px;transform:translateX(-50%)}
</style></head><body>${room('62% 40%', 6)}<div class="halo"></div><img class="p" src="${photo}"></body></html>`;

// 모바일앱 커버: 네이버가 아래쪽에 블로그명·별명을 흰 글씨로 얹는다 → 아래 30% 는 비워 두고, 글씨는 왼쪽 위
const cover = `<html><head><style>${base}
:root{--w:1080px;--h:1080px}
.ring.r1{width:760px;height:760px;right:-170px;top:40px}
.ring.r2{width:600px;height:600px;right:-90px;top:120px;border-color:rgba(226,196,140,.2)}
img.p{width:820px;right:-150px;top:120px}
.fade{position:absolute;left:0;right:0;bottom:0;height:360px;background:linear-gradient(transparent,rgba(8,40,34,.92))}
.t{position:absolute;left:72px;top:84px;color:#fbf5e9}
.chip{display:inline-block;font:26px M;letter-spacing:1px;color:#ecd39a;border:2px solid rgba(226,196,140,.8);background:rgba(6,30,26,.45);padding:10px 26px;border-radius:40px}
.h{font:80px/1.24 S;margin-top:30px;letter-spacing:1px;color:#fbf5e9;text-shadow:0 4px 18px rgba(0,0,0,.35)}
.h b{font-weight:inherit;text-shadow:none}
.s{margin-top:32px;display:flex;flex-direction:column;gap:12px;align-items:flex-start}
.s span{font:29px M;color:#fbf5e9;border:2px solid rgba(226,196,140,.7);background:rgba(6,30,26,.5);padding:10px 24px 10px 16px;border-radius:40px}
.s i{font-style:normal;display:inline-block;width:34px;height:34px;line-height:34px;text-align:center;border-radius:50%;background:#d9b46a;color:#12463D;font-size:21px;margin-right:12px;vertical-align:2px}
</style></head><body>${room('70% 30%')}${bgimg ? '' : '<div class="ring r1"></div><div class="ring r2"></div>'}
<img class="p" src="${photo}"><div class="fade"></div>
<div class="t"><span class="chip">친근한 설계사</span>
<div class="h">보험,<br><b class="gold">어렵지 않게</b><br>풀어 드려요</div>
<div class="s">${CHIPS.map((c) => `<span><i>✔</i>${c}</span>`).join('')}</div></div>
</body></html>`;

const browser = await chromium.launch();
// 잘림에 안전한 커버 (2026-11-09 사용자 "모바일앱 배너로 만들려니까 사진이 잘려") — 앱이 위아래·양옆을 잘라도
// 얼굴·글씨가 가운데 상자(가로 200~880, 세로 170~910) 안에 남게 작게 모은다
const coverSafe = cover
  .replace('.t{position:absolute;left:72px;top:84px;color:#fbf5e9}', '.t{position:absolute;left:200px;top:190px;color:#fbf5e9}')
  .replace('.chip{display:inline-block;font:26px M', '.chip{display:inline-block;font:20px M')
  .replace('.h{font:80px/1.24 S;margin-top:30px', '.h{font:54px/1.24 S;margin-top:20px')
  .replace('.s{margin-top:32px;display:flex;flex-direction:column;gap:12px', '.s{margin-top:24px;display:flex;flex-direction:column;gap:9px')
  .replace('.s span{font:29px M', '.s span{font:21px M').replace('padding:10px 24px 10px 16px', 'padding:7px 18px 7px 11px')
  .replace('width:34px;height:34px;line-height:34px', 'width:26px;height:26px;line-height:26px').replace('font-size:21px;margin-right:12px', 'font-size:16px;margin-right:9px')
  .replace('img.p{width:820px;right:-150px;top:120px}', 'img.p{width:600px;right:110px;top:230px}')
  .replace('.fade{position:absolute;left:0;right:0;bottom:0;height:360px', '.fade{position:absolute;left:0;right:0;bottom:0;height:260px');
// 네이버 앱 실제 화면에 맞춘 커버 (2026-11-09 사용자 앱 캡처 2장 — "글씨에 묻히네", "사진이 짤려"):
// 앱은 정사각형을 약 1.18배 키워 가운데만 보여 준다(원본 가로 약 86~1000, 세로 약 123~1038). 그 위를 어둡게 덮고
// 원본 세로 약 530 아래에 방문자 수·블로그명·프로필·단추를 얹는다. → 글씨·칩·얼굴은 가로 110~980, 세로 140~520 안,
// 사람은 크게(가로 350~990) — 2026-11-09 사용자 캡처: 위쪽 약 110 은 휴대폰 상태 표시줄에 가린다.
const coverApp = cover
  .replace(".room:after{content:\'\';position:absolute;inset:0;background:linear-gradient(90deg,rgba(6,30,26,.55),rgba(6,30,26,.15) 60%,rgba(6,30,26,.25))}", ".room:after{content:\'\';position:absolute;inset:0;background:linear-gradient(90deg,rgba(6,30,26,.45),rgba(6,30,26,0) 60%)}")
  .replace('.t{position:absolute;left:72px;top:84px;color:#fbf5e9}', '.t{position:absolute;left:112px;top:142px;color:#fbf5e9}')
  .replace('.chip{display:inline-block;font:26px M', '.chip{display:inline-block;font:21px M').replace('padding:10px 26px;border-radius:40px}', 'padding:6px 20px;border-radius:40px}')
  .replace('.h{font:80px/1.24 S;margin-top:30px', '.h{font:58px/1.2 S;margin-top:16px')
  .replace('.s{margin-top:32px;display:flex;flex-direction:column;gap:12px;align-items:flex-start}', '.s{margin-top:20px;display:grid;grid-template-columns:auto auto;gap:9px 8px;justify-items:start}')
  .replace('.s span{font:29px M', '.s span{font:19px M').replace('padding:10px 24px 10px 16px', 'padding:6px 14px 6px 8px')
  .replace('width:34px;height:34px;line-height:34px', 'width:24px;height:24px;line-height:24px').replace('font-size:21px;margin-right:12px', 'font-size:14px;margin-right:7px')
  .replace('img.p{width:820px;right:-150px;top:120px}', 'img.p{width:640px;left:350px;top:150px}')
  .replace('<div class="fade"></div>', '')
  .replace('<div class="h">보험,<br><b class="gold">어렵지 않게</b><br>풀어 드려요</div>', '<div class="h">보험, <b class="gold">어렵지 않게</b><br>풀어 드려요</div>');
for (const [name, html, w, h] of [['profile.png', profile, 1000, 1000], ['cover.png', cover, 1080, 1080], ['cover-safe.png', coverSafe, 1080, 1080], ['cover-app.png', coverApp, 1080, 1080]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(OUT, name) });
  await page.close();
  console.log('만듦:', path.join(OUT, name));
}
await browser.close();
