// 인스타용 그림 — 사람 사진 없이 (2026-11-09 사용자 "인스타용 이미지도 하나 만들어줘 사람사진 없애고")
// node content/consult/banner/insta.mjs [--out 폴더] → insta-post.png(1080×1350 피드) · insta-profile.png(1080×1080 프로필, 동그랗게 잘려도 되게)
// 색·글씨는 블로그 배너·커버와 같게: 딥그린 #12463D · 크림 · 샴페인 골드. 정보 주제만, 상담·가입 권유 말 없음.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const A = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = A('--out', '.');
const font = (f) => `data:font/${f.endsWith('otf') ? 'otf' : 'ttf'};base64,${fs.readFileSync(f).toString('base64')}`;
const SERIF = font('scripts/lib/fonts/NotoSerifKR-Black.ttf');
const BOLD = font('scripts/threads/fonts/Pretendard-Bold.otf');
const SEMI = font('scripts/threads/fonts/Pretendard-SemiBold.otf');
const CHIPS = ['실비·보험금 청구', '수술비·진단비', '병원비·간병·요양', '지원금·건강보험 제도'];

const base = `
@font-face{font-family:S;src:url(${SERIF})}
@font-face{font-family:B;src:url(${BOLD})}
@font-face{font-family:M;src:url(${SEMI})}
*{margin:0;padding:0;box-sizing:border-box}
body{width:var(--w);height:var(--h);overflow:hidden;position:relative;color:#fbf5e9;
  background:radial-gradient(110% 80% at 75% 15%,#21695a 0%,#12463D 55%,#0b332c 100%)}
.glow{position:absolute;inset:0;background:linear-gradient(115deg,transparent 0 38%,rgba(255,236,190,.07) 38% 46%,transparent 46% 60%,rgba(255,236,190,.05) 60% 64%,transparent 64%)}
.ring{position:absolute;border-radius:50%;border:2px solid rgba(226,196,140,.32)}
.gold{background:linear-gradient(180deg,#f6e2b0 0%,#d9b46a 55%,#b88a3c 100%);-webkit-background-clip:text;color:transparent}
.frame{position:absolute;inset:36px;border:2px solid rgba(226,196,140,.45);border-radius:28px}
`;

const post = `<html><head><style>${base}
:root{--w:1080px;--h:1350px}
.ring.r1{width:820px;height:820px;right:-260px;top:-180px}
.ring.r2{width:620px;height:620px;right:-160px;top:-80px;border-color:rgba(226,196,140,.18)}
.t{position:absolute;left:100px;right:100px;top:150px}
.chip{display:inline-block;font:30px M;letter-spacing:1px;color:#ecd39a;border:2px solid rgba(226,196,140,.8);background:rgba(6,30,26,.45);padding:12px 32px;border-radius:44px}
.h{font:104px/1.22 S;margin-top:44px;letter-spacing:1px;text-shadow:0 4px 18px rgba(0,0,0,.3)}
.h b{font-weight:inherit;text-shadow:none}
.line{width:120px;height:5px;border-radius:3px;background:#d9b46a;margin:52px 0 46px}
.s{display:flex;flex-direction:column;gap:20px}
.s span{font:40px M;display:flex;align-items:center}
.s i{font-style:normal;flex:none;width:52px;height:52px;line-height:52px;text-align:center;border-radius:50%;background:#d9b46a;color:#12463D;font:30px B;margin-right:22px}
.f{position:absolute;left:100px;right:100px;bottom:110px;font:32px M;color:#ecd39a;letter-spacing:1px}
.f small{display:block;font:26px M;color:rgba(251,245,233,.7);margin-top:10px}
</style></head><body><div class="glow"></div><div class="ring r1"></div><div class="ring r2"></div><div class="frame"></div>
<div class="t"><span class="chip">친근한 설계사의 보험 이야기</span>
<div class="h">보험,<br><b class="gold">어렵지 않게</b><br>풀어 드려요</div>
<div class="line"></div>
<div class="s">${CHIPS.map((c) => `<span><i>✔</i>${c}</span>`).join('')}</div></div>
<div class="f">공식 자료로 쉽게 정리합니다<small>병원비·보험금, 혼자 헤매지 않게</small></div>
</body></html>`;

// 프로필: 인스타는 동그랗게 잘리고 아주 작게(약 110px) 보인다 → 글씨는 크게 두 줄만, 가운데
const profile = `<html><head><style>${base}
:root{--w:1080px;--h:1080px}
.c{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:900px;height:900px;border-radius:50%;
  border:6px solid rgba(226,196,140,.75);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
.c .a{font:150px/1.1 S;letter-spacing:4px}
.c .b{font:150px/1.1 S;letter-spacing:4px}
.c .d{width:110px;height:6px;border-radius:3px;background:#d9b46a;margin:34px 0 30px}
.c .e{font:46px M;color:#ecd39a;letter-spacing:3px}
</style></head><body><div class="glow"></div>
<div class="c"><div class="a">친근한</div><div class="b gold">보험</div><div class="d"></div><div class="e">이야기</div></div>
</body></html>`;


// 프로필 원형판 (2026-11-09 사용자 캡처 — 게시물 그림을 프로필에 넣으니 원 밖이 잘림, 위쪽은 '메모' 말풍선이 가림)
// → 모든 글씨를 원 안(지름 1080)에, 가운데보다 조금 아래로 모은다
const round = `<html><head><style>${base}
:root{--w:1080px;--h:1080px}
.w{position:absolute;left:0;right:0;top:300px;text-align:center}
.h{font:96px/1.2 S;letter-spacing:1px;text-shadow:0 4px 18px rgba(0,0,0,.3)}
.h b{font-weight:inherit;text-shadow:none}
.line{width:100px;height:5px;border-radius:3px;background:#d9b46a;margin:34px auto 30px}
.s{display:grid;grid-template-columns:auto auto;gap:16px 26px;justify-content:center}
.s span{font:33px M;display:flex;align-items:center;white-space:nowrap}
.s i{font-style:normal;flex:none;width:40px;height:40px;line-height:40px;text-align:center;border-radius:50%;background:#d9b46a;color:#12463D;font:24px B;margin-right:12px}
.rim{position:absolute;inset:14px;border-radius:50%;border:5px solid rgba(226,196,140,.7)}
</style></head><body><div class="glow"></div><div class="rim"></div>
<div class="w"><div class="h">보험,<br><b class="gold">어렵지 않게</b><br>풀어 드려요</div>
<div class="line"></div>
<div class="s">${CHIPS.map((c) => `<span><i>✔</i>${c}</span>`).join('')}</div></div>
</body></html>`;

// 이름판 (같은 날 사용자 "친근한 설계사라는 이름으로도 하나 — 인스타 이름") — 원 안, 이름을 크게
const named = round
  .replace('.w{position:absolute;left:0;right:0;top:300px;text-align:center}', '.w{position:absolute;left:0;right:0;top:250px;text-align:center}.sub{font:40px M;color:#ecd39a;letter-spacing:2px;margin-top:22px}')
  .replace('.h{font:96px/1.2 S', '.h{font:128px/1.15 S')
  .replace('<div class="h">보험,<br><b class="gold">어렵지 않게</b><br>풀어 드려요</div>', '<div class="h">친근한<br><b class="gold">설계사</b></div><div class="sub">보험, 어렵지 않게 풀어 드려요</div>');

const browser = await chromium.launch();
for (const [name, html, w, h] of [['insta-post.png', post, 1080, 1350], ['insta-profile.png', profile, 1080, 1080], ['insta-profile-round.png', round, 1080, 1080], ['insta-profile-name.png', named, 1080, 1080]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(OUT, name) });
  await page.close();
  console.log('만듦:', path.join(OUT, name));
}
await browser.close();
