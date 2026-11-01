// 국가법령정보센터 조문 원문 읽기 (클라우드에서도 됨 — law.go.kr 은 본문을 JS 로 불러와 WebFetch 로는 안 읽힘).
// 쓰는 법: NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node scripts/threads/law-fetch.mjs 상법 제658조 제651조
import { chromium } from 'playwright';
const [law, ...arts] = process.argv.slice(2);
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
const b = await chromium.launch({ proxy });
const ctx = await b.newContext({ ignoreHTTPSErrors: false });
const p = await ctx.newPage();
for (const a of arts) {
  const url = `https://www.law.go.kr/법령/${law}/${a}`;
  let txt = '';
  for (let k = 0; k < 3 && txt.length < 80; k++) {
    try { await p.goto(url, { waitUntil: 'networkidle', timeout: 45000 }); await p.waitForTimeout(2500);
      for (const f of p.frames()) { const t = await f.evaluate(() => document.body?.innerText || '').catch(() => ''); if (t.includes(a.replace('제','제').slice(0,4))) txt += '\n' + t; }
    } catch (e) { txt = ''; console.error('retry', a, e.message.slice(0, 80)); }
  }
  const i = txt.indexOf(a + '(');
  console.log(`=== ${law} ${a} (${url})\n` + (i >= 0 ? txt.slice(i, i + 900) : txt.slice(0, 400)));
}
await b.close();
