/**
 * GOMS 휴대폰 인증(2차 인증)을 사용자가 Claude 에게 알려 준 인증번호로 넘는다 (2026-11-03 사용자 —
 * "너가 [인증번호 받기]를 누르고, 내가 문자로 받은 번호를 Claude 에 입력하면 인증까지 되는지 확인해 보자, 아침 9시").
 *
 * 순서
 *   1) 로그인 화면의 「사용자 인증」 칸에서 [인증번호받기] 를 누른다 → GOMS 가 곰스에 등록된 사용자 휴대폰으로 문자를 보낸다.
 *   2) Drive ClaudeWorkspace/goms-otp/waiting.txt 를 남긴다 (Claude 가 "PC 가 기다리는 중" 을 알 수 있게).
 *   3) 사용자가 Claude 대화에 번호를 적으면 Claude 가 Drive goms-otp/code.txt 로 저장한다 (CLAUDE.md "GOMS 인증번호").
 *      Drive 가 PC 로 내려 주면(보통 수십 초) 그 번호를 「인증번호 입력」 칸에 넣고 그 칸 옆 [확인] 을 누른다.
 *   4) code*.txt 는 쓰고 나면 바로 지운다. 결과는 goms-otp/result.txt. 기록에는 번호를 남기지 않는다 (끝 두 자리만).
 *
 * 번호는 사용자 본인이 자기 휴대폰으로 받아 직접 알려 준 것만 쓴다. 프로그램이 문자를 읽거나 번호를 짐작하지 않는다.
 */
import fs from 'node:fs';
import path from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** 화면에 「인증번호」 칸이 보이는가 */
export async function otpScreen(page) {
  const r = await Promise.all(page.frames().map((f) => f.evaluate(() => /인증\s*번호\s*받기|인증\s*번호\s*입력|사용자\s*인증/.test(document.body?.innerText || '')).catch(() => false)));
  return r.some(Boolean);
}

/** 보이는 버튼 중 글자(띄어쓰기 빼고)가 want 인 것을 사람처럼 누른다. near 가 있으면 그 글이 든 작은 칸(400자 안) 안의 버튼만. */
async function clickButton(page, want, near = '') {
  for (const f of page.frames()) {
    const p = await f.evaluate(({ want, near }) => {
      const vis = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length) && getComputedStyle(e).visibility !== 'hidden';
      const btns = [...document.querySelectorAll('button, a, [role=button], input[type=button], input[type=submit]')]
        .filter((b) => vis(b) && ((b.innerText || b.value || '').replace(/\s/g, '') === want));
      for (const b of btns) {
        if (near) {
          let box = b; let ok = false;
          for (let i = 0; i < 5 && box.parentElement; i++) {
            box = box.parentElement;
            const t = (box.innerText || '').replace(/\s/g, '');
            if (t.length > 400) break;
            if (t.includes(near)) { ok = true; break; }
          }
          if (!ok) continue;
        }
        const r = b.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
      return null;
    }, { want, near }).catch(() => null);
    if (p) {
      const fr = f.parentFrame() ? await f.frameElement().then((el) => el.boundingBox()).catch(() => null) : null;
      await page.mouse.click(p.x + (fr?.x || 0), p.y + (fr?.y || 0));
      return true;
    }
  }
  return false;
}

/** 「인증번호 입력」 칸 찾기 — 안내 글(placeholder·이름표)에 '인증' 이 든 칸, 없으면 아이디·비밀번호 칸이 아닌 마지막 글 칸 */
async function codeInput(page) {
  for (const f of page.frames()) {
    const ok = await f.evaluate(() => {
      const vis = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length) && getComputedStyle(e).visibility !== 'hidden';
      const inputs = [...document.querySelectorAll('input')].filter((i) => vis(i) && !/password|hidden|checkbox|radio|button|submit|file/i.test(i.type || 'text'));
      const own = (i) => [i.placeholder, i.getAttribute('aria-label'), i.name, i.id].join(' ');
      const near = (i) => (i.closest('.v-input, .v-text-field, label, td, li') || i.parentElement)?.innerText || '';
      let hit = inputs.find((i) => /인증/.test(own(i))) || inputs.find((i) => /인증\s*번호/.test(near(i)));
      if (!hit) hit = inputs.filter((i) => !/id|user/i.test(`${i.name} ${i.id}`) && !/아이디|^ID$/i.test(own(i).trim())).pop();
      if (!hit) return false;
      document.querySelectorAll('[data-sg-otp]').forEach((e) => e.removeAttribute('data-sg-otp'));
      hit.setAttribute('data-sg-otp', '1');
      return true;
    }).catch(() => false);
    if (ok) return f.locator('[data-sg-otp="1"]').first();
  }
  return null;
}

/** GOMS 알림 창(대화상자 안의 [확인])만 읽고 닫는다 — 「사용자 인증」 칸의 [확인] 은 누르지 않는다. 브라우저 알림(alert)은 seen 에서. */
async function popups(page, seen) {
  const texts = seen.splice(0);
  for (let k = 0; k < 3; k++) {
    let hit = null;
    for (const f of page.frames()) {
      hit = await f.evaluate(() => {
        const vis = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length) && getComputedStyle(e).visibility !== 'hidden';
        const boxes = [...document.querySelectorAll('[role=dialog], [role=alertdialog], .v-dialog, .modal, .swal2-popup, [class*=dialog], [class*=modal], [class*=alert]')].filter(vis);
        for (const box of boxes) {
          if (/인증\s*번호\s*받기/.test(box.innerText || '')) continue; // 로그인 칸 자체
          const b = [...box.querySelectorAll('button, a, [role=button]')].filter(vis).find((x) => /^(확인|예|OK|닫기)$/i.test((x.innerText || '').trim()));
          if (!b) continue;
          const r = b.getBoundingClientRect();
          return { text: (box.innerText || '').replace(/\s+/g, ' ').replace(/(확인|예|OK|닫기)\s*$/i, '').trim().slice(0, 160), x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }
        return null;
      }).catch(() => null);
      if (hit) { await page.mouse.click(hit.x, hit.y).catch(() => {}); break; }
    }
    if (!hit) break;
    texts.push(hit.text);
    await sleep(800);
  }
  return texts.filter(Boolean);
}

function codeFiles(dir) {
  try { return fs.readdirSync(dir).filter((n) => /^code.*\.txt$/i.test(n)).map((n) => path.join(dir, n)); } catch { return []; }
}
function clearCodes(dir) { for (const f of codeFiles(dir)) { try { fs.unlinkSync(f); } catch {} } }
const stamp = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' });

/**
 * 인증번호로 로그인을 마친다. 성공하면 true.
 * opts: dir(Drive goms-otp 폴더), log, shot(page, name), stillLogin() — 아직 로그인 화면인가, waitMin(기본 6)
 */
export async function otpLogin(page, { dir, log, shot, stillLogin, waitMin = 6 }) {
  const seen = [];
  page.on('dialog', (d) => seen.push(d.message()));
  const messages = () => popups(page, seen);
  fs.mkdirSync(dir, { recursive: true });
  const write = (name, lines) => fs.writeFileSync(path.join(dir, name), `${lines.join('\n')}\n`, 'utf8');
  const result = (ok, why) => { write('result.txt', [`${ok ? '성공' : '실패'} — ${why}`, `시각: ${stamp()}`, `PC: ${process.env.COMPUTERNAME || ''}`]); try { fs.unlinkSync(path.join(dir, 'waiting.txt')); } catch {} };

  clearCodes(dir); // 지난번 남은 번호는 쓰지 않는다
  try { fs.unlinkSync(path.join(dir, 'result.txt')); } catch {}
  if (!(await clickButton(page, '인증번호받기')) && !(await clickButton(page, '인증번호요청'))) {
    await shot(page, 'otp-no-button');
    result(false, '[인증번호받기] 버튼을 찾지 못했어요');
    log('  ❌ [인증번호받기] 버튼을 찾지 못했어요');
    return false;
  }
  const askedAt = Date.now();
  log('  📱 [인증번호받기] 누름 — 곰스에 등록된 휴대폰으로 문자가 가요');
  await sleep(1500);
  const said = await messages().catch(() => []);
  await shot(page, 'otp-requested');
  const bad = said.find((t) => /(실패|오류|등록된\s*휴대폰.*없|초과|잠시\s*후)/.test(t));
  if (bad) { result(false, `GOMS 알림: ${bad}`); log(`  ❌ GOMS 알림: ${bad}`); return false; }
  const until = askedAt + waitMin * 60000;
  write('waiting.txt', [
    `PC 가 GOMS 인증번호를 기다리는 중이에요.`,
    `문자 요청 시각: ${stamp()}`,
    `기다리는 시간: ${waitMin}분 (${new Date(until).toLocaleTimeString('sv-SE', { timeZone: 'Asia/Seoul' })} 까지)`,
    `Claude 에게 "GOMS 인증번호 123456" 처럼 알려 주세요.`,
  ]);
  log(`  ⏳ 인증번호를 기다려요 (최대 ${waitMin}분) — Claude 가 Drive goms-otp/code.txt 로 넣어 줘요`);

  let tries = 0;
  while (Date.now() < until && tries < 3) {
    const files = codeFiles(dir).filter((f) => { try { return fs.statSync(f).mtimeMs >= askedAt - 60000; } catch { return false; } });
    if (!files.length) {
      // 2026-11-13 사용자가 PC 크롬에서 직접 인증해 로그인했는데 번호 파일만 기다리다 6분을 넘겼다 — 로그인 화면이 사라졌으면 통과로 본다
      if (stillLogin && !(await stillLogin().catch(() => true))) { result(true, '사용자가 화면에서 직접 로그인'); log('  ✅ 화면에서 직접 로그인됨 — GOMS 로그인 ✓'); return true; }
      await sleep(3000); continue;
    }
    let code = '';
    for (const f of files) { try { code = (fs.readFileSync(f, 'utf8').match(/\d{4,8}/) || [''])[0] || code; } catch {} }
    clearCodes(dir);
    if (!code) { log('  ⚠ code.txt 에 숫자가 없어요 — 다시 기다려요'); continue; }
    tries++;
    log(`  🔢 인증번호 받음 (끝 두 자리 ${code.slice(-2)}, 요청 ${Math.round((Date.now() - askedAt) / 1000)}초 뒤) — 넣어요`);
    const box = await codeInput(page);
    if (!box) { await shot(page, 'otp-no-input'); result(false, '「인증번호 입력」 칸을 찾지 못했어요'); log('  ❌ 「인증번호 입력」 칸을 찾지 못했어요'); return false; }
    await box.click().catch(() => {});
    await box.fill('').catch(() => {});
    await box.type(code, { delay: 60 });
    await sleep(400);
    if (!(await clickButton(page, '확인', '인증번호'))) { await shot(page, 'otp-no-confirm'); result(false, '인증 칸의 [확인] 버튼을 찾지 못했어요'); log('  ❌ 인증 칸의 [확인] 버튼을 찾지 못했어요'); return false; }
    log('  [확인] 누름');
    await sleep(2500);
    const after = await messages().catch(() => []);
    for (let i = 0; i < 16 && await stillLogin(); i++) await sleep(500);
    await shot(page, `otp-after-${tries}`);
    if (!(await stillLogin())) { result(true, `인증번호로 GOMS 로그인 (요청 ${Math.round((Date.now() - askedAt) / 1000)}초 뒤)`); log('  ✅ 휴대폰 인증 통과 — GOMS 로그인 ✓'); return true; }
    // 인증은 됐는데 LOGIN 을 한 번 더 눌러야 하는 화면일 수 있다
    if (after.some((t) => /(인증\s*(완료|되었|성공))/.test(t)) || !(await otpScreen(page))) {
      log('  인증 완료 알림 — LOGIN 을 다시 눌러요');
      await page.locator('input[type=password]').first().click({ timeout: 5000 }).catch(() => {});
      await clickButton(page, 'LOGIN');
      for (let i = 0; i < 20 && await stillLogin(); i++) await sleep(500);
      if (!(await stillLogin())) { result(true, '인증번호 + LOGIN 으로 GOMS 로그인'); log('  ✅ GOMS 로그인 ✓'); return true; }
    }
    const why = after.join(' / ') || '화면이 그대로예요';
    log(`  ⚠ 아직 로그인 화면이에요 (${why.slice(0, 80)})`);
    write('waiting.txt', [`인증번호가 맞지 않았거나 시간이 지났어요: ${why.slice(0, 120)}`, `남은 시간 안에 새 번호를 다시 알려 주세요 (${tries}/3번째).`, `기다리는 시간: ${new Date(until).toLocaleTimeString('sv-SE', { timeZone: 'Asia/Seoul' })} 까지`]);
  }
  clearCodes(dir);
  await shot(page, 'otp-timeout');
  result(false, tries ? `번호를 ${tries}번 넣었지만 로그인되지 않았어요` : `${waitMin}분 안에 인증번호가 오지 않았어요 (Drive 가 PC 로 늦게 내려왔을 수도)`);
  log(tries ? '  ❌ 인증번호로 로그인하지 못했어요' : `  ❌ ${waitMin}분 안에 인증번호가 Drive 로 오지 않았어요`);
  return false;
}
