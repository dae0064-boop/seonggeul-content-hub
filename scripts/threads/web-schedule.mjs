#!/usr/bin/env node
/**
 * 스레드 웹 예약 — 일상 묶음(content/threads/daily/<날짜>.md)의 글을 스레드 자체 '예약'으로 걸어 둔다.
 * (2026-11-14 사용자 "스레드도 20일까지 예약 진행해줘" — PC 가 그 시각에 깨어 있지 않아도 스레드 서버가 올린다)
 *
 *   node scripts/threads/web-schedule.mjs --daily 2026-11-15[,2026-11-16…] [--dry] [--out dumps/threads-sched/<시각>]
 *        [--marks <Drive ClaudeWorkspace\threads-scheduled>] [--cdp http://localhost:9222]
 *
 * 한 편마다: 새 탭 → '새로운 스레드' → 글 넣기 → 글이 원고와 같은지 다시 읽기 → (주제 칸) → 더 보기 → '예약...'
 *   → 달력에서 날짜 칸('2026년 11월 15일') → 시·분 칸 → 다시 읽어 확인 → '완료' → 창에 그 날짜·시각이 보이는지 확인
 *   → 그때만 마지막 버튼(예약)을 누른다 → 예약 표시(marks/<날짜>.tsv)에 한 줄. daily-post.mjs 는 이 표에 있는 글을 올리지 않는다.
 * 지키는 것: 날짜·시각 확인이 하나라도 안 되면 마지막 버튼을 누르지 않고 '취소 → 삭제'로 버린다(지금 바로 게시가 되면 되돌릴 수 없다).
 *   --dry 는 '완료'까지 하고 화면을 찍은 뒤 버린다. 시각이 지금부터 30분 안쪽인 글은 걸지 않는다.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const DRY = argv.includes('--dry');
const CDP = opt('--cdp', 'http://localhost:9222');
const stamp = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 16).replace(/[T:]/g, (c) => (c === 'T' ? '_' : ''));
const OUT = opt('--out', `dumps/threads-sched/${stamp}`);
const MARKS = opt('--marks', '');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const dates = (opt('--daily', '') || '').split(',').map((s) => s.trim()).filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s));
if (!dates.length || argv.includes('--help')) { console.log(fs.readFileSync(new URL(import.meta.url)).toString().split('*/')[0]); process.exit(dates.length ? 0 : 1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (s) => console.log(s);
fs.mkdirSync(OUT, { recursive: true });
const norm = (s) => String(s || '').replace(/\s+/g, '');

/** 일상 묶음 읽기: '## N' 아래 '시각: HH:MM', '주제: …', 빈 줄 뒤 본문 */
function readDaily(d) {
  const f = path.join(ROOT, 'content', 'threads', 'daily', `${d}.md`);
  if (!fs.existsSync(f)) return [];
  const parts = fs.readFileSync(f, 'utf8').replace(/\r/g, '').split(/^## \d+\s*$/m).slice(1);
  return parts.map((p) => {
    const lines = p.split('\n');
    const meta = {}; let i = 0;
    for (; i < lines.length; i++) { const m = lines[i].match(/^(시각|주제):\s*(.*)$/); if (m) meta[m[1]] = m[2].trim(); else if (lines[i].trim() && Object.keys(meta).length) break; }
    const body = lines.slice(i).join('\n').trim();
    return { date: d, time: meta['시각'], topic: meta['주제'] || '', text: body };
  }).filter((x) => /^\d{2}:\d{2}$/.test(x.time || '') && x.text);
}

const marksFile = (d) => (MARKS ? path.join(MARKS, `${d}.tsv`) : '');
function marked(it) {
  const f = marksFile(it.date); if (!f || !fs.existsSync(f)) return false;
  const first = norm(it.text.split('\n')[0]);
  return fs.readFileSync(f, 'utf8').split(/\r?\n/).some((l) => { const [t, fl] = l.split('\t'); return t === it.time && norm(fl) === first; });
}
function mark(it) {
  const f = marksFile(it.date); if (!f) return;
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.appendFileSync(f, `${it.time}\t${it.text.split('\n')[0]}\t${new Date().toISOString()}\n`);
}

let shotN = 0;
async function shot(page, name) {
  const base = path.join(OUT, `${String(++shotN).padStart(3, '0')}-${name}`);
  await page.screenshot({ path: `${base}.jpg`, type: 'jpeg', quality: 55 }).catch(() => {});
  const t = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"]')].map((d) => d.innerText).join('\n---\n')).catch(() => '');
  fs.writeFileSync(`${base}.txt`, t);
}

async function clickText(scope, re) {
  const c = scope.locator('[role="button"], button, [role="menuitem"], [role="option"], a');
  const n = await c.count().catch(() => 0);
  for (let i = 0; i < n; i++) {
    const el = c.nth(i);
    if (!(await el.isVisible().catch(() => false))) continue;
    const label = ((await el.innerText().catch(() => '')) || '').trim() || ((await el.getAttribute('aria-label').catch(() => '')) || '').trim();
    if (label && label.length <= 30 && re.test(label)) { await el.click({ timeout: 5000 }); await sleep(1500); return label; }
  }
  return null;
}

async function discard(page) {
  // 취소 → '삭제'(버리기). 게시 버튼은 누르지 않는다
  const dlg = page.locator('[role="dialog"]').first();
  await clickText(dlg, /^취소$/).catch(() => {});
  await sleep(1200);
  const d2 = page.locator('[role="dialog"], [role="alertdialog"]').last();
  await clickText(d2, /^(삭제|버리기|Discard|Delete)$/i).catch(() => {});
  await sleep(1000);
}

async function scheduleOne(ctx, it) {
  const tag = `${it.date} ${it.time}`;
  const when = Date.parse(`${it.date}T${it.time}:00+09:00`);
  if (when - Date.now() < 30 * 60000) return { ok: false, why: '시각이 30분 안쪽이거나 지났어요' };
  const page = await ctx.newPage();
  try {
    await page.setViewportSize({ width: 1280, height: 900 }).catch(() => {});
    await page.goto('https://www.threads.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(5000);
    if (!(await clickText(page, /^새로운 스레드$/))) return { ok: false, why: "'새로운 스레드' 버튼 못 찾음" };
    await sleep(1500);
    const dlg = page.locator('[role="dialog"]').first();
    const box = dlg.locator('[role="textbox"][contenteditable="true"]').first();
    if (!(await box.isVisible().catch(() => false))) return { ok: false, why: '글 칸 못 찾음' };
    await box.click();
    const lines = it.text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]) await page.keyboard.insertText(lines[i]);
      if (i < lines.length - 1) { await page.keyboard.press('Shift+Enter'); await sleep(80); }
    }
    await sleep(800);
    const typed = await box.innerText().catch(() => '');
    if (norm(typed) !== norm(it.text)) { await shot(page, `${it.time.replace(':', '')}-text-mismatch`); await discard(page); return { ok: false, why: '넣은 글이 원고와 달라요' }; }

    // 주제(커뮤니티 또는 주제) — 안 되면 주제 없이 간다
    let topicOk = false;
    if (it.topic) {
      const tf = dlg.locator('input').first();
      if (await tf.isVisible().catch(() => false)) {
        await tf.click().catch(() => {}); await tf.fill(it.topic).catch(() => {}); await sleep(2000);
        const opt1 = page.locator('[role="option"], [role="listbox"] [role="button"]').first();
        if (await opt1.isVisible().catch(() => false)) { await opt1.click().catch(() => {}); await sleep(1000); }
        else { await page.keyboard.press('Enter').catch(() => {}); await sleep(1000); }
        topicOk = norm(await dlg.innerText().catch(() => '')).includes(norm(it.topic));
      }
    }

    if (!(await clickText(dlg, /^더 보기$/))) { await discard(page); return { ok: false, why: "'더 보기' 못 찾음" }; }
    if (!(await clickText(page, /^예약(\.{3}|…)?$/))) { await shot(page, `${it.time.replace(':', '')}-no-sched`); await discard(page); return { ok: false, why: "'예약...' 메뉴 못 찾음" }; }
    await sleep(1200);
    const [Y, M, D] = it.date.split('-').map(Number);
    const label = `${Y}년 ${M}월 ${D}일`;
    // 달력 — 그 달이 보일 때까지 '다음 달' (최대 2번)
    let cell = null;
    for (let k = 0; k < 3 && !cell; k++) {
      const cells = page.locator('[role="grid"][aria-label="날짜 선택"] [role="gridcell"]');
      const n = await cells.count();
      for (let i = 0; i < n; i++) { const t = (await cells.nth(i).innerText().catch(() => '')) || ''; if (t.startsWith(label + ' ')) { cell = cells.nth(i); break; } }
      if (!cell) { const nx = page.locator('button[aria-label="다음 달"]'); if (await nx.isVisible().catch(() => false)) { await nx.click(); await sleep(800); } }
    }
    if (!cell) { await shot(page, `${it.time.replace(':', '')}-no-date`); await discard(page); return { ok: false, why: `달력에서 ${label} 못 찾음` }; }
    await cell.click(); await sleep(800);
    const tIn = [];
    for (let i = 0; i < await page.locator('input[type="text"]').count(); i++) { const el = page.locator('input[type="text"]').nth(i); if (await el.isVisible().catch(() => false) && !(await el.evaluate((e) => !!e.closest('[role="dialog"]')))) tIn.push(el); }
    if (tIn.length < 2) { await shot(page, `${it.time.replace(':', '')}-no-time`); await discard(page); return { ok: false, why: '시·분 칸 못 찾음' }; }
    const [hh, mm] = it.time.split(':');
    for (const [el, v] of [[tIn[0], hh], [tIn[1], mm]]) { await el.click(); await page.keyboard.press('Control+A'); await page.keyboard.type(v, { delay: 60 }); await sleep(400); }
    await page.keyboard.press('Tab').catch(() => {}); await sleep(500);
    const hv = await tIn[0].inputValue().catch(() => ''); const mv = await tIn[1].inputValue().catch(() => '');
    const selOk = await cell.evaluate((e) => e.getAttribute('aria-selected') === 'true' || /selected|checked/i.test(e.className) || !!e.querySelector('[aria-selected="true"]')).catch(() => false);
    await shot(page, `${it.time.replace(':', '')}-picker`);
    if (hv.padStart(2, '0') !== hh || mv.padStart(2, '0') !== mm) { await page.keyboard.press('Escape'); await discard(page); return { ok: false, why: `시각 칸이 ${hv}:${mv} 로 읽혀요` }; }
    if (!(await clickText(page, /^완료$/))) { await page.keyboard.press('Escape'); await discard(page); return { ok: false, why: "'완료' 못 찾음" }; }
    await sleep(1500);
    await shot(page, `${it.time.replace(':', '')}-after-done`);
    const dtext = (await dlg.innerText().catch(() => '')) || '';
    // 창 위쪽 줄에 예약 날짜·시각이 나온다 — 2026-11-14 실제: '내일 오전 7:00 GMT+9에 게시 예정'
    const h12 = String(((Number(hh) + 11) % 12) + 1);
    const ampm = Number(hh) < 12 ? '오전' : '오후';
    const kstToday = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
    const kstTomorrow = new Date(Date.now() + 33 * 3600000).toISOString().slice(0, 10);
    const dayWords = [`${M}\\s*월\\s*${D}\\s*일`]; if (it.date === kstTomorrow) dayWords.push('내일'); if (it.date === kstToday) dayWords.push('오늘');
    // 2~6일 뒤는 요일로 나온다 — 실제: '월요일 오후 7:30 GMT+9에 게시 예정' (11/14 에 11/16 글)
    const ahead = Math.round((Date.parse(`${it.date}T00:00:00Z`) - Date.parse(`${kstToday}T00:00:00Z`)) / 86400000);
    if (ahead >= 2 && ahead <= 6) dayWords.push(['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'][new Date(`${it.date}T12:00:00Z`).getUTCDay()]);
    const bar = (dtext.split('\n').find((l) => /게시 예정/.test(l)) || '');
    const seesDate = new RegExp(`(${dayWords.join('|')})`).test(bar);
    const seesTime = new RegExp(`${ampm}\\s*${h12}\\s*:\\s*${mm}`).test(bar);
    if (!seesDate || !seesTime) log(`  예약 줄: '${bar}'`);
    const btns = [];
    const cb = dlg.locator('[role="button"], button');
    for (let i = 0; i < await cb.count(); i++) { const t = ((await cb.nth(i).innerText().catch(() => '')) || '').trim(); if (t) btns.push(t); }
    const finalBtn = btns.find((t) => /^(예약|예약하기|Schedule)$/i.test(t));
    topicOk = !it.topic || norm(dtext).includes(norm(it.topic));
    const info = { seesDate, seesTime, selOk, topicOk, finalBtn: finalBtn || null, buttons: btns.slice(-6) };
    if (DRY) { await discard(page); return { ok: true, dry: true, info }; }
    if (!(seesDate && seesTime && finalBtn)) { await discard(page); return { ok: false, why: `예약 확인 안 됨 ${JSON.stringify(info)}` }; }
    await clickText(dlg, new RegExp(`^${finalBtn}$`));
    await sleep(4000);
    await shot(page, `${it.time.replace(':', '')}-sent`);
    const still = await page.locator('[role="dialog"]').first().isVisible().catch(() => false);
    if (still) return { ok: false, why: '예약 버튼 뒤에도 창이 남아 있어요 — 화면 확인 필요', info };
    mark(it);
    return { ok: true, info };
  } finally {
    await page.close().catch(() => {});
    log(`  (${tag} 탭 닫음)`);
  }
}

let browser;
const result = [];
try {
  browser = await chromium.connectOverCDP(CDP);
  const ctx = browser.contexts()[0];
  for (const d of dates) {
    const only = opt('--only', '');
    const items = readDaily(d).filter((x) => !only || x.time === only);
    log(`${d} 일상 ${items.length}편`);
    for (const it of items) {
      if (marked(it)) { log(`  ${it.time} 이미 예약됨`); result.push({ ...it, ok: true, skip: true }); continue; }
      let r;
      try { r = await scheduleOne(ctx, it); } catch (e) { r = { ok: false, why: String(e.message || e).split('\n')[0] }; }
      log(`  ${r.ok ? '✓' : '✗'} ${it.time} ${it.text.split('\n')[0].slice(0, 20)}${r.dry ? ' (시험)' : ''}${r.why ? ' — ' + r.why : ''}${r.info ? ' ' + JSON.stringify(r.info) : ''}`);
      result.push({ date: it.date, time: it.time, first: it.text.split('\n')[0], ...r });
      if (!r.ok && !r.dry) break; // 하나 실패하면 멈춘다 — 화면을 보고 고친다
      if (DRY) break;             // 시험은 한 편만
    }
    if (DRY || result.some((r) => !r.ok)) break;
  }
} catch (e) {
  log(`✗ 오류 — ${String(e.message || e).split('\n')[0]}`);
  process.exitCode = 1;
} finally {
  fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(result, null, 1));
  if (browser) await browser.close().catch(() => {}); // CDP 연결만 끊는다
  log(`기록: ${OUT}`);
  if (result.some((r) => !r.ok)) process.exitCode = 2;
}
