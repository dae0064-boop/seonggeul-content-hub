#!/usr/bin/env node
/**
 * 네이버 클립 올리기 (2026-11-05 사용자 — "네이버 클립부터 진행해줘"). 자동화용 크롬(9222)에 붙는다. 크롬은 끄지 않는다.
 *
 *   node scripts/clip/upload-clip.mjs --look --shots <폴더>
 *       클립 크리에이터 웹(clipcreators.naver.com)을 열어 화면·글자·단추·입력 칸을 기록만 한다. 아무것도 올리지 않는다.
 *       실제 화면을 아직 본 적이 없어서(클라우드는 naver.com 이 막혀 있다) 첫 며칠은 이것만 돈다 → Claude 가 기록을 보고 올리기를 맞춘다.
 *   node scripts/clip/upload-clip.mjs --video <mp4> --meta <json> --shots <폴더> [--post]
 *       '+ 업로드' → 영상 파일 → 설명(300자) 까지 채운다. --post 가 없으면 마지막 [올리기/게시] 를 누르지 않고 멈춘다(기록만).
 *       --post 는 화면이 확인된 뒤에만 켠다 (clip-day.ps1 이 content/clip/POST-OK 파일이 있을 때만 붙인다).
 *
 * 종료 코드: 0 = 끝까지(또는 look 끝), 2 = 화면이 예상과 달라 멈춤, 3 = 로그인 필요, 1 = 크롬에 못 붙음
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : ''; };
const look = argv.includes('--look');
const post = argv.includes('--post');
const shots = path.resolve(opt('--shots') || 'dumps/clip-upload');
fs.mkdirSync(shots, { recursive: true });
const HOME = process.env.CLIP_URL || 'https://clipcreators.naver.com';
const log = (s) => { console.log(s); fs.appendFileSync(path.join(shots, 'log.txt'), s + '\n'); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0;
async function snap(page, name) {
  n++;
  const base = path.join(shots, `${String(n).padStart(2, '0')}-${name}`);
  await page.screenshot({ path: base + '.png', fullPage: false }).catch(() => {});
  // 화면 구조: 눈에 보이는 단추·링크·입력 칸 글자 (선택자를 맞추는 근거)
  const info = await page.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2 && getComputedStyle(el).visibility !== 'hidden'; };
    const pick = (sel) => [...document.querySelectorAll(sel)].filter(vis).slice(0, 80).map((el) => ({
      tag: el.tagName.toLowerCase(), text: (el.innerText || el.value || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim().slice(0, 60),
      cls: (el.className && String(el.className).slice(0, 80)) || '', type: el.getAttribute('type') || '', name: el.getAttribute('name') || '', href: el.getAttribute('href') || '' }));
    return { url: location.href, title: document.title, buttons: pick('button,a,[role=button]'), inputs: pick('input,textarea,[contenteditable=true]'), files: document.querySelectorAll('input[type=file]').length, text: document.body.innerText.slice(0, 3000) };
  }).catch((e) => ({ error: e.message }));
  fs.writeFileSync(base + '.json', JSON.stringify(info, null, 1));
  fs.writeFileSync(base + '.html', (await page.content().catch(() => '')).slice(0, 400000));
  log(`📸 ${name}: ${info.url || ''} · 단추 ${info.buttons?.length ?? '?'} · 입력 ${info.inputs?.length ?? '?'} · 파일칸 ${info.files ?? '?'}`);
  return info;
}
const onLogin = (page) => /nid\.naver\.com|nidlogin/.test(page.url());

let browser;
try { browser = await chromium.connectOverCDP(process.env.CDP_URL || 'http://localhost:9222', { timeout: 15000 }); }
catch (e) { log(`❌ 자동화용 크롬(9222)에 붙지 못했어요: ${e.message.split('\n')[0]}`); process.exit(1); }
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
page.setDefaultTimeout(20000);
let code = 0;
try {
  await page.goto(HOME, { waitUntil: 'domcontentloaded' });
  await sleep(4000);
  let info = await snap(page, 'home');
  if (onLogin(page)) { log('❌ 네이버 로그인 화면으로 갔어요 — 자동화용 크롬의 네이버 로그인이 필요해요'); code = 3; throw 0; }
  // '+ 업로드' 같은 단추 찾기 (글자 기준 — 클래스 이름은 수시로 바뀐다)
  const up = page.locator('button, a, [role=button]').filter({ hasText: /업로드|올리기|만들기/ }).first();
  if (!(await up.count())) { log('⚠ 업로드 단추를 못 찾았어요 — 기록만 남겨요'); code = look ? 0 : 2; throw 0; }
  log(`업로드 단추: "${(await up.innerText().catch(() => '')).trim()}"`);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 8000 }).catch(() => null), up.click().catch(() => {})]);
  await sleep(3000);
  info = await snap(page, 'after-upload-click');
  if (look) {
    log(`살펴보기 끝 — 파일 선택 창 ${chooser ? '뜸' : '안 뜸'} (아무것도 올리지 않음)`);
    throw 0;
  }
  const video = path.resolve(opt('--video'));
  const meta = JSON.parse(fs.readFileSync(opt('--meta'), 'utf8'));
  if (chooser) await chooser.setFiles(video);
  else {
    const fi = page.locator('input[type=file]').first();
    if (!(await fi.count())) { log('⚠ 영상 파일 칸을 못 찾았어요'); code = 2; throw 0; }
    await fi.setInputFiles(video);
  }
  log(`영상 넣음: ${path.basename(video)}`);
  await sleep(15000);
  await snap(page, 'after-file');
  const box = page.locator('textarea, [contenteditable=true]').first();
  if (await box.count()) { await box.click().catch(() => {}); await box.fill(meta.description).catch(async () => { await page.keyboard.type(meta.description); }); log(`설명 넣음 (${meta.description.length}자)`); }
  else log('⚠ 설명 칸을 못 찾았어요');
  await sleep(1500);
  await snap(page, 'filled');
  if (!post) { log('여기서 멈춤 (--post 없음) — 올리지 않았어요'); throw 0; }
  const go = page.locator('button').filter({ hasText: /^\s*(올리기|게시|업로드|등록|완료)\s*$/ }).last();
  if (!(await go.count())) { log('⚠ 마지막 올리기 단추를 못 찾았어요'); code = 2; throw 0; }
  await go.click();
  await sleep(8000);
  await snap(page, 'posted');
  log('✅ 클립 올림');
} catch (e) { if (e !== 0) { log(`❌ ${e.message?.split('\n')[0]}`); await snap(page, 'error'); code = code || 2; } }
finally { await page.close().catch(() => {}); await browser.close().catch(() => {}); }   // connectOverCDP 의 close 는 연결만 끊는다
process.exit(code);
