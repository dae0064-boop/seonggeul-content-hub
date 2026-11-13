#!/usr/bin/env node
/**
 * 스레드 웹 '예약' 화면 살펴보기 — 글을 올리지 않는다 (2026-11-01 사용자: "아침 10시에 하루 모든 글을 예약발행, 내가 보고 고치도록").
 * 공식 API 에는 예약이 확인되지 않아, 스레드 앱 자체 예약에 넣기로 했다. 클라우드에서는 threads.com 이 막혀 화면을 볼 수 없으므로
 * PC 의 자동화용 크롬(9222, 스레드 로그인 상태)에 붙어 단계마다 화면·글자·버튼 목록을 남긴다 → 그걸 보고 진짜 예약 스크립트를 만든다.
 *
 *   node scripts/threads/web-probe.mjs [--out dumps/threads-web/<날짜>] [--cdp http://localhost:9222]
 *
 * 순서: threads.com 새 탭 → 글쓰기 창 열기 → 시험 글자 넣기(올리지 않음) → 글쓰기 창의 더 보기(…) 메뉴 → '예약' → 날짜·시각 고르는 화면을 찍기
 *       → Esc 로 닫고 '삭제(버리기)'로 시험 글을 버린다 → 연 탭만 닫는다 (브라우저는 닫지 않는다).
 * 지키는 것: '게시'·'올리기'·'Post'·'공유'·'예약하기 확정' 같은 버튼은 절대 누르지 않는다(POST_DENY). 로그인 화면이면 찍고 종료 코드 3.
 * 남기는 것: <out>/NN-*.jpg·txt (화면·글자), NN-*-el.json (보이는 버튼·메뉴·입력칸의 글자·aria-label·role), result.json
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const OUT = opt('--out', `dumps/threads-web/${today}`);
const CDP = opt('--cdp', 'http://localhost:9222');
if (argv.includes('--help')) { console.log(fs.readFileSync(new URL(import.meta.url)).toString().split('*/')[0]); process.exit(0); }

// '예약' 글자를 넣지 않는다 — 2026-11-14 첫 실행에서 메뉴 대신 이 글자를 눌렀다
const TEST_TEXT = '화면 시험 (올리지 않는 글)';
// 절대 누르지 않는 버튼 — 게시·올리기·공유·확정
const POST_DENY = /^(게시|게시하기|올리기|공유|Post|Share|Publish|예약하기|완료|Done|확인|Confirm)$|게시|Post$/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (s) => console.log(s);
fs.mkdirSync(OUT, { recursive: true });
const result = { date: today, steps: [] };
const step = (name, ok, note = '') => { result.steps.push({ name, ok, note }); log(`${ok ? '✓' : '✗'} ${name}${note ? ' — ' + note : ''}`); };

let shotN = 0;
async function dump(page, name) {
  const base = path.join(OUT, `${String(++shotN).padStart(2, '0')}-${name}`);
  const body = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
  fs.writeFileSync(`${base}.txt`, `${page.url()}\n\n${body}`);
  const els = await page.evaluate(() => {
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const pick = 'button, a, input, textarea, select, [role="button"], [role="menuitem"], [role="option"], [role="dialog"], [role="textbox"], [contenteditable="true"], [aria-label]';
    return [...document.querySelectorAll(pick)].filter(vis).slice(0, 400).map((e) => ({
      tag: e.tagName.toLowerCase(), role: e.getAttribute('role'), aria: e.getAttribute('aria-label'),
      text: (e.innerText || '').trim().slice(0, 80), type: e.getAttribute('type'), placeholder: e.getAttribute('placeholder'),
      editable: e.getAttribute('contenteditable'), inDialog: !!e.closest('[role="dialog"]'),
    }));
  }).catch(() => []);
  fs.writeFileSync(`${base}-el.json`, JSON.stringify(els, null, 1));
  await page.screenshot({ path: `${base}.jpg`, type: 'jpeg', quality: 60 }).catch(() => {});
}

/** 보이는 것 중 글자나 aria-label 이 맞는 것을 누른다. POST_DENY 는 절대 안 누른다 */
async function clickBy(scope, patterns, { allow = null } = {}) {
  const cands = scope.locator('button, a, [role="button"], [role="menuitem"], [role="option"], div[tabindex], span');
  const n = await cands.count().catch(() => 0);
  for (const re of patterns) {
    for (let i = 0; i < n; i++) {
      const el = cands.nth(i);
      if (!(await el.isVisible().catch(() => false))) continue;
      const txt = ((await el.innerText().catch(() => '')) || '').trim();
      const aria = ((await el.getAttribute('aria-label').catch(() => '')) || '').trim();
      const label = txt || aria;
      if (!label || label.length > 40) continue;
      if (!(re.test(txt) || re.test(aria))) continue;
      if (POST_DENY.test(label) && !(allow && allow.test(label))) continue;
      await el.click({ timeout: 5000 }).catch(() => {});
      await sleep(2500);
      return label;
    }
  }
  return null;
}

async function isLoggedOut(page) {
  const body = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
  return /Instagram으로 계속|Continue with Instagram|사용자 이름, 전화번호 또는 이메일|Log in or sign up|로그인 또는 가입/.test(body)
    && !/새로운 소식이 있나요|What's new/.test(body);
}

let browser, page;
try {
  browser = await chromium.connectOverCDP(CDP);
  const ctx = browser.contexts()[0];
  page = await ctx.newPage();
  await page.setViewportSize({ width: 1280, height: 900 }).catch(() => {});
  await page.goto('https://www.threads.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(6000);
  await dump(page, 'home');
  if (await isLoggedOut(page)) { step('로그인', false, '스레드 로그인이 안 돼 있어요'); result.loggedOut = true; throw Object.assign(new Error('logged out'), { code: 3 }); }
  step('로그인', true);

  // 글쓰기 창 열기: 위쪽 '새로운 소식이 있나요?' 칸 또는 왼쪽 + (만들기)
  // 2026-11-14 화면: 위쪽 칸 글자 '새로운 소식을 공유해보세요.', 위쪽 + 버튼 aria '새로운 스레드'
  let opened = await clickBy(page, [/^새로운 스레드$/, /^새로운 소식(이 있나요\??|을 공유해보세요\.?)$/, /^What's new\??$/i, /^(만들기|Create|새 스레드|New thread)$/i]);
  await sleep(1500);
  let dialog = page.locator('[role="dialog"]').last();
  if (!(await dialog.isVisible().catch(() => false))) {
    opened = (await clickBy(page, [/새로운 스레드|새로운 소식을 공유|만들기|Create|새 스레드|New thread/i])) || opened;
    await sleep(1500);
    dialog = page.locator('[role="dialog"]').last();
  }
  await dump(page, 'compose');
  const hasDialog = await dialog.isVisible().catch(() => false);
  step('글쓰기 창', hasDialog, opened ? `누른 것: ${opened}` : '누를 것을 못 찾음');
  if (!hasDialog) throw new Error('글쓰기 창을 못 엶');

  const box = dialog.locator('[contenteditable="true"], [role="textbox"], textarea').first();
  if (await box.isVisible().catch(() => false)) {
    await box.click().catch(() => {});
    await page.keyboard.type(TEST_TEXT, { delay: 30 });
    await sleep(1000);
    step('시험 글자 넣기', true);
  } else step('시험 글자 넣기', false, '글 칸을 못 찾음');
  await dump(page, 'typed');

  // 더 보기(…) → 예약
  const more = await clickBy(dialog, [/^(더 보기|더보기|More|옵션 더 보기|More options|추가 옵션)$/i, /더 보기|More/i]);
  await dump(page, 'more-menu');
  step('더 보기 메뉴', !!more, more || '못 찾음');
  const sched = await clickBy(page, [/^예약(\.{3}|…)?$/, /^Schedule(\.{3}|…)?$/i]);
  await sleep(1500);
  await dump(page, 'schedule');
  step('예약 메뉴', !!sched, sched || '못 찾음 — 화면을 보고 위치를 찾는다');
  result.found = { opened, more, sched };

  // 날짜·시각 고르는 칸을 한 번 더 자세히 (열려 있으면)
  if (sched) {
    const pickers = await page.evaluate(() => [...document.querySelectorAll('input, select, [role="spinbutton"], [role="combobox"], [role="grid"], [role="gridcell"]')]
      .filter((e) => e.getBoundingClientRect().width > 0)
      .slice(0, 120).map((e) => ({ tag: e.tagName.toLowerCase(), role: e.getAttribute('role'), aria: e.getAttribute('aria-label'), type: e.getAttribute('type'), value: e.value ?? null, text: (e.innerText || '').trim().slice(0, 30) }))).catch(() => []);
    fs.writeFileSync(path.join(OUT, 'schedule-pickers.json'), JSON.stringify(pickers, null, 1));
  }
} catch (e) {
  if (!result.steps.length || e.code !== 3) step('오류', false, String(e.message || e));
  if (page) await dump(page, 'error').catch(() => {});
  process.exitCode = e.code || 1;
} finally {
  // 시험 글 버리기: Esc → '삭제'(버리기) 확인. 게시 버튼은 누르지 않는다
  if (page) {
    for (let k = 0; k < 3; k++) {
      await page.keyboard.press('Escape').catch(() => {});
      await sleep(1200);
      // 버리기 확인 창 안에서만 누른다 (피드의 다른 '삭제'를 누르지 않게)
      const d = await clickBy(page.locator('[role="dialog"], [role="alertdialog"]').last(), [/^(삭제|버리기|Discard|Delete)$/i]);
      if (d) { result.discarded = d; break; }
    }
    await dump(page, 'closed').catch(() => {});
    await page.close().catch(() => {});
  }
  fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(result, null, 1));
  if (browser) await browser.close().catch(() => {}); // connectOverCDP 의 close 는 연결만 끊는다 (사용자 크롬은 그대로)
  log(`기록: ${OUT}`);
}
