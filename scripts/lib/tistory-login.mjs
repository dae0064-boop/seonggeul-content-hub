/**
 * 티스토리 로그인 화면이 떴을 때 "카카오계정으로 로그인" 버튼만 눌러 다시 들어간다 (2026-10-05).
 *
 * 10/5 로그인 시험: 네이버는 유지됐는데 티스토리는 노트북 자동화 크롬에서 로그인 화면이 떴다.
 * 티스토리 세션이 끊겨도 카카오 계정 로그인(로그인 상태 유지)이 살아 있으면 이 버튼 하나로 비밀번호 없이 돌아온다.
 * 비밀번호는 넣지 않는다 — 카카오 로그인 칸이 나오면 사람에게 맡기고 실패로 돌려준다.
 *
 * 반환: { ok: true } 이면 지금 page 가 로그인 뒤의 티스토리 화면(처음 가려던 주소)이다.
 */
const LOGIN_URL = /auth\/login|accounts\.kakao\.com|\/login/;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function onLoginPage(page) {
  return LOGIN_URL.test(page.url());
}

export async function tistoryRelogin(page, targetUrl, log = () => {}) {
  if (!onLoginPage(page)) return { ok: true };
  if (/\/auth\/login/.test(page.url())) {
    const btn = page.locator('a, button').filter({ hasText: '카카오계정으로 로그인' }).first();
    await btn.waitFor({ timeout: 10000 }).catch(() => {});
    if (!(await btn.count())) return { ok: false, why: `"카카오계정으로 로그인" 버튼을 찾지 못함 (${page.url()})` };
    log('티스토리 로그인 화면 → "카카오계정으로 로그인" 누름 (비밀번호는 넣지 않음)');
    await btn.click().catch(() => {});
    // 카카오가 기억하고 있으면 몇 초 안에 티스토리로 돌아온다
    for (let i = 0; i < 20 && onLoginPage(page); i++) await sleep(1000);
  }
  // 카카오 "로그인할 카카오계정 선택" (간편로그인 정보가 저장된 계정) — 저장된 계정을 누르면 비밀번호 없이 들어간다
  // 2026-10-05 로그인 시험: 노트북에서 이 화면에 dae0064@daum.net 계정이 떠 있었다
  if (/accounts\.kakao\.com\/login\/simple/.test(page.url())) {
    const acct = page.locator('li a, li button, a, button').filter({ hasText: /@/ }).first();
    await acct.waitFor({ timeout: 10000 }).catch(() => {});
    if (await acct.count()) {
      log('카카오 계정 선택 화면 → 저장된 계정 누름 (비밀번호는 넣지 않음)');
      await acct.click().catch(() => {});
      for (let i = 0; i < 20 && onLoginPage(page); i++) {
        await sleep(1000);
        // 동의 화면이 나오면 "계속하기"만 누른다
        const go = page.locator('button').filter({ hasText: /^\s*(계속하기|동의하고 계속하기)\s*$/ }).first();
        if (await go.count().catch(() => 0)) await go.click().catch(() => {});
      }
    }
  }
  if (onLoginPage(page)) {
    return { ok: false, why: `카카오 로그인 화면에서 멈춤 — 사람이 한 번 로그인해야 함 (${page.url()})` };
  }
  if (targetUrl) {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await sleep(3000);
    if (onLoginPage(page)) return { ok: false, why: `다시 열었더니 또 로그인 화면 (${page.url()})` };
  }
  log('티스토리 다시 로그인됨');
  return { ok: true };
}
