/**
 * 티스토리 로그인 화면이 떴을 때 "카카오계정으로 로그인" 버튼만 눌러 다시 들어간다 (2026-10-05).
 *
 * 10/5 로그인 시험: 네이버는 유지됐는데 티스토리는 노트북 자동화 크롬에서 로그인 화면이 떴다.
 * 티스토리 세션이 끊겨도 카카오 계정 로그인(로그인 상태 유지)이 살아 있으면 이 버튼 하나로 비밀번호 없이 돌아온다.
 * 비밀번호는 넣지 않는다 — 크롬이 저장해 둔 값이 칸에 채워져 있을 때만 [로그인] 을 누르고(2026-11-05), 아니면 사람에게 맡기고 실패로 돌려준다.
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
  // 2026-11-05 사용자 "집에 없어도 작업 가능하도록": 자동화용 크롬이 다시 켜지면 카카오 로그인이 풀려(11/5 06:59·09:19) 티스토리 10편이 멈췄다.
  // GOMS 와 같은 방식 — 비밀번호는 우리가 넣지 않는다. 크롬이 저장해 둔 아이디·비밀번호가 칸에 채워져 있을 때만 [로그인] 을 누른다.
  // 크롬 자동 채움은 실제 클릭이 있어야 사이트에 전달되므로 칸을 한 번씩 누른다. '로그인 상태 유지'가 있으면 켠다.
  // 칸이 비어 있거나(저장된 비밀번호 없음) 보안 문자·추가 인증이 나오면 사람에게 맡긴다.
  if (onLoginPage(page) && /accounts\.kakao\.com\/login/.test(page.url())) {
    const id = page.locator('input[name="loginId"], input#loginId--1, input[type="email"], input[name="email"]').first();
    const pw = page.locator('input[type="password"]').first();
    if (await pw.isVisible().catch(() => false)) {
      await id.click({ timeout: 3000 }).catch(() => {});
      await sleep(400);
      await pw.click({ timeout: 3000 }).catch(() => {});
      await sleep(800);
      let filled = await pw.evaluate((el) => (el.value || '').length > 0).catch(() => false);
      let idFilled = await id.evaluate((el) => (el.value || '').length > 0).catch(() => false);
      if (!(filled && idFilled)) {
        // 2026-11-05 사용자 화면: 아이디 칸을 누르면 크롬의 저장된 계정 목록(dae0064@daum.net ••••)이 뜬다 — 사람이 그걸 누르면 채워진다.
        // 목록은 크롬 화면이라 글자로 못 찾으므로 키보드로 고른다: 아이디 칸에서 ↓ → Enter (첫 저장 계정)
        log('카카오 로그인 칸이 비어 있음 → 크롬 저장 계정 목록에서 첫 계정 고름 (↓ Enter)');
        await id.click({ timeout: 3000 }).catch(() => {});
        await sleep(700);
        await page.keyboard.press('ArrowDown').catch(() => {});
        await sleep(300);
        await page.keyboard.press('Enter').catch(() => {});
        await sleep(1200);
        await pw.click({ timeout: 3000 }).catch(() => {});
        await sleep(600);
        filled = await pw.evaluate((el) => (el.value || '').length > 0).catch(() => false);
        idFilled = await id.evaluate((el) => (el.value || '').length > 0).catch(() => false);
      }
      await page.keyboard.press('Escape').catch(() => {}); // 계정 목록이 '간편로그인 정보 저장'·[로그인] 을 가리지 않게 닫는다
      if (filled && idFilled) {
        // '간편로그인 정보 저장'을 켜 두면 다음부터는 계정 선택 화면에서 계정만 누르면 된다 (10:15 시험에서 통한 길)
        const keep = page.locator('input[type="checkbox"][name="saveSignedIn"], input#saveSignedIn--4, input[type="checkbox"]').first();
        if (await keep.count().catch(() => 0) && !(await keep.isChecked().catch(() => true))) await keep.check({ force: true }).catch(() => {});
        log('카카오 로그인 칸에 크롬이 저장한 아이디·비밀번호가 채워져 있음 → [로그인] 누름 (비밀번호는 넣지 않음)');
        const btn = page.locator('button[type="submit"], button').filter({ hasText: /^\s*로그인\s*$/ }).first();
        await btn.click({ timeout: 5000 }).catch(() => {});
        for (let i = 0; i < 25 && onLoginPage(page); i++) {
          await sleep(1000);
          const go = page.locator('button').filter({ hasText: /^\s*(계속하기|동의하고 계속하기)\s*$/ }).first();
          if (await go.count().catch(() => 0)) await go.click().catch(() => {});
        }
      } else log(`카카오 로그인 칸이 비어 있음 (크롬에 저장된 비밀번호 없음 — 아이디 ${idFilled ? '있음' : '없음'})`);
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
