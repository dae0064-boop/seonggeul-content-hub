#!/usr/bin/env node
// 자동화용 크롬(9222)이 실제로 대답하는지 본다 (2026-11-07 고장 고침).
//   11/7 아침: http://localhost:9222/json/version 은 대답하는데 connectOverCDP 가 30초를 넘겨
//   네이버 20편·티스토리 5편이 하나도 예약되지 않았다. 지킴이·draft-day 는 /json/version 만 봐서
//   "크롬 켜져 있음"으로 넘어갔다. 이 검사는 실제로 붙어 페이지 목록까지 읽어 본다.
//   종료 코드: 0 = 대답함, 1 = 멈춤(붙지 못함), 2 = 꺼져 있음.
//   붙은 뒤 크롬을 닫지 않는다 — 연결만 놓고 끝낸다.
import { chromium } from 'playwright';

const port = process.argv[2] || '9222';
const timeout = Number(process.argv[3] || 20000);
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
  const pages = browser.contexts().flatMap((c) => c.pages()).length;
  clearTimeout(timer);
  console.log(`대답함: 탭 ${pages}개`);
  process.exit(0); // browser.close() 를 부르지 않는다 — 사용자의 크롬을 닫지 않게
} catch (e) {
  clearTimeout(timer);
  console.log(`멈춤: ${String(e.message).split('\n')[0]}`);
  process.exit(1);
}
