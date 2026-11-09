#!/usr/bin/env node
// 자동화용 크롬(9222)이 실제로 대답하는지 본다 (2026-11-07 고장 고침).
//   11/7 아침: http://localhost:9222/json/version 은 대답하는데 connectOverCDP 가 30초를 넘겨
//   네이버 20편·티스토리 5편이 하나도 예약되지 않았다. 지킴이·draft-day 는 /json/version 만 봐서
//   "크롬 켜져 있음"으로 넘어갔다. 이 검사는 실제로 붙어 페이지 목록까지 읽어 본다.
//   종료 코드: 0 = 대답함, 1 = 멈춤(붙지 못함), 2 = 꺼져 있음.
//   붙은 뒤 크롬을 닫지 않는다 — 연결만 놓고 끝낸다.
//   --trim N (2026-11-09): 탭이 N개보다 많으면 남은 탭을 정리한다 — 첫 탭과 로그인 화면 탭만 두고 닫는다.
//     11/8 13시 멈춘 크롬을 다시 켤 때 창이 72개였다(발행 프로그램이 글마다 탭을 남김). 다른 작업이 돌지 않을 때만 부른다.
import { chromium } from 'playwright';

const port = process.argv[2] || '9222';
const timeout = Number(process.argv[3] || 20000);
const ti = process.argv.indexOf('--trim');
const trimOver = ti > 0 ? Number(process.argv[ti + 1] || 15) : 0;
const KEEP = /nid\.naver\.com|nidlogin|accounts\.kakao\.com|tistory\.com\/auth\/login|goms|accounts\.google\.com/i;

/** 정리할 탭 고르기: 첫 탭과 로그인 화면은 둔다 (사람이 로그인하는 중일 수 있다) */
export function pickTabsToClose(urls) {
  return urls.map((u, i) => ({ u, i })).filter(({ u, i }) => i > 0 && !KEEP.test(u)).map(({ i }) => i);
}
if (process.argv.includes('--selftest')) {
  const r = pickTabsToClose(['about:blank', 'https://blog.naver.com/x/postwrite', 'https://nid.naver.com/nidlogin.login', 'https://x.tistory.com/manage/newpost', 'https://accounts.kakao.com/login']);
  console.log(JSON.stringify(r) === '[1,3]' ? 'selftest ok' : `selftest FAIL ${JSON.stringify(r)}`);
  process.exit(JSON.stringify(r) === '[1,3]' ? 0 : 1);
}
const url = `http://localhost:${port}`;

try {
  const r = await fetch(`${url}/json/version`, { signal: AbortSignal.timeout(3000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
} catch (e) {
  // 시간 초과 = 창은 떠 있는데 대답이 없음(멈춤). 연결 거부 = 꺼져 있음.
  if (e.name === 'TimeoutError' || e.name === 'AbortError') { console.log(`멈춤: /json/version 이 3초 안에 대답하지 않음`); process.exit(1); }
  console.log(`꺼져 있음: ${e.cause?.code || e.message}`);
  process.exit(2);
}

const timer = setTimeout(() => { console.log(`멈춤: ${timeout / 1000}초 안에 붙지 못함`); process.exit(1); }, timeout + 5000);
try {
  const browser = await chromium.connectOverCDP(url, { timeout });
  const all = browser.contexts().flatMap((c) => c.pages());
  const pages = all.length;
  clearTimeout(timer);
  if (trimOver && pages > trimOver) {
    const idx = pickTabsToClose(all.map((p) => p.url()));
    let closed = 0;
    for (const i of idx) {
      const ok = await Promise.race([all[i].close({ runBeforeUnload: false }).then(() => true, () => false), new Promise((r) => setTimeout(() => r(false), 5000))]);
      if (ok) closed++;
    }
    console.log(`대답함: 탭 ${pages}개 → ${closed}개 정리 (남김 ${pages - closed}개)`);
    process.exit(0);
  }
  console.log(`대답함: 탭 ${pages}개`);
  process.exit(0); // browser.close() 를 부르지 않는다 — 사용자의 크롬을 닫지 않게
} catch (e) {
  clearTimeout(timer);
  console.log(`멈춤: ${String(e.message).split('\n')[0]}`);
  process.exit(1);
}
