// 블로그 사이드 위젯용 카카오톡 1:1 상담 단추 그림 (2026-11-09 사용자 — http://pf.kakao.com/_xixlxkxeX/chat)
// node content/consult/widget/kakao.mjs → content/consult/widget/kakao-chat.png (340×400, 위젯에는 170×200 으로 넣어 선명하게)
import { chromium } from 'playwright';
import fs from 'node:fs';
const font = (f) => `data:font/otf;base64,${fs.readFileSync(f).toString('base64')}`;
const BOLD = font('scripts/threads/fonts/Pretendard-Bold.otf');
const SEMI = font('scripts/threads/fonts/Pretendard-SemiBold.otf');
const html = `<html><head><style>
@font-face{font-family:B;src:url(${BOLD})}@font-face{font-family:M;src:url(${SEMI})}
*{margin:0;padding:0;box-sizing:border-box}
body{width:170px;height:200px;background:transparent;font-family:B}
.c{position:absolute;inset:0;border-radius:18px;overflow:hidden;
  background:linear-gradient(160deg,#FEE500 0%,#FFD600 100%);border:2px solid #d9b46a;display:flex;flex-direction:column;align-items:center;padding-top:16px}
.ic{width:58px;height:50px;position:relative}
.ic .b{position:absolute;left:0;top:0;width:58px;height:44px;border-radius:50%;background:#3A1D1D}
.ic .t{position:absolute;left:8px;top:34px;width:0;height:0;border-left:7px solid transparent;border-right:9px solid transparent;border-top:14px solid #3A1D1D;transform:rotate(25deg)}
.ic span{position:absolute;left:0;right:0;top:13px;text-align:center;color:#FEE500;font:15px B;letter-spacing:.5px}
.h{margin-top:8px;color:#3A1D1D;font:20px/1.15 B;letter-spacing:-.3px;text-align:center}
.s{margin-top:6px;color:#5a3a2a;font:12px/1.3 M;text-align:center}
.go{position:absolute;left:14px;right:14px;bottom:14px;height:26px;border-radius:12px;background:#3A1D1D;color:#FEE500;font:12px/26px B;text-align:center}
</style></head><body><div class="c">
<div class="ic"><div class="b"></div><div class="t"></div><span>1:1</span></div>
<div class="h">카카오톡<br>보험 상담</div>
<div class="s">궁금한 점, 편하게 물어보세요</div>
<div class="go">채팅 바로 열기 ›</div>
</div></body></html>`;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 170, height: 200 }, deviceScaleFactor: 2 });
await p.setContent(html); await p.evaluate(() => document.fonts.ready);
await p.screenshot({ path: 'content/consult/widget/kakao-chat.png', omitBackground: true });
await b.close(); console.log('만듦: content/consult/widget/kakao-chat.png');
