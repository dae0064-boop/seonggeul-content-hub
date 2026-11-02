#!/usr/bin/env node
/**
 * 스레드 일상 글 올리기 — 오늘 묶음(content/threads/daily/<오늘>.md)에서 시각이 지난 글 한 편 (링크·답글 없음).
 * 규칙 정본: content/threads/daily.md (2026-11-02 사용자 — 07:00 러닝·응원, 19:00 하루 마무리).
 *
 *   node scripts/threads/daily-post.mjs           시험: 올릴 글만 보여 줌
 *   node scripts/threads/daily-post.mjs --post    실제로 올림
 *
 * 멈춤: content/threads/PAUSE-DAILY, THREADS_PAUSED. 이미 올린 글은 내 스레드를 되읽어 첫 줄로 본다 (상태 파일 없음).
 * 시각에서 3시간이 넘게 지난 글은 올리지 않는다 (아침 인사가 오후에 올라가지 않게).
 * 종료 코드: 0 = 올림 또는 올릴 것 없음, 1 = 설정 문제, 2 = 올리다 실패
 */
import fs from 'node:fs';
import path from 'node:path';
import { DIR, loadEnv, kstStamp, kstDayStartUnix, isMain, log, step } from './config.mjs';
import { threadsApi } from './api.mjs';
import { checkDaily } from './daily-set.mjs';

const argv = process.argv.slice(2);
const arg = (n, d = '') => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const doPost = argv.includes('--post');
const head = (t) => String(t || '').normalize('NFC').split('\n').filter((l) => l.trim())[0]?.replace(/[^\p{L}\p{N}]/gu, '') || '';
const mins = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

async function main() {
  loadEnv();
  const now = arg('--now') || kstStamp();
  const today = now.slice(0, 10), hhmm = now.slice(11, 16);
  step(`스레드 일상 글 ${doPost ? '올리기' : '시험 (올리지 않음)'} — ${now}`);
  const pause = path.join(DIR, 'PAUSE-DAILY');
  if (fs.existsSync(pause)) { log(`멈춤: PAUSE-DAILY — ${fs.readFileSync(pause, 'utf8').trim()}`); return 0; }
  if (['1', 'true', 'yes', 'on'].includes(String(process.env.THREADS_PAUSED || '').toLowerCase())) { log('멈춤: THREADS_PAUSED'); return 0; }
  const file = path.join(DIR, 'daily', `${today}.md`);
  if (!fs.existsSync(file)) { log(`오늘 일상 묶음이 없어요 (content/threads/daily/${today}.md)`); return 0; }
  const { errors, items } = checkDaily(file);
  if (errors.length) { log(`묶음 검사 불통과 — 올리지 않아요:\n     ${errors.join('\n     ')}`); return 1; }
  const due = items.filter((it) => it['시각'] <= hhmm && mins(hhmm) - mins(it['시각']) <= 180);
  log(`오늘 일상 ${items.length}편 · 지금 올릴 차례 ${due.length}편`);
  if (!due.length) return 0;

  const token = process.env.THREADS_ACCESS_TOKEN;
  if (!token) { log('스레드 연결 키(THREADS_ACCESS_TOKEN)가 이 PC 에 없어요 — launchers\\threads-key.cmd'); return 1; }
  const api = threadsApi(token);
  const posts = await api.myPosts({ limit: 50, since: kstDayStartUnix() - 86400 });
  const done = new Set(posts.map((p) => head(p.text)));
  const next = due.find((it) => !done.has(head(it.body)));
  if (!next) { log('이미 올렸어요'); return 0; }
  step(`다음: ${next['시각']} 일상 글`);
  console.log(next.body.split('\n').map((l) => `   │ ${l}`).join('\n'));
  if (!doPost) { log('시험이라 여기서 멈춰요 (--post 를 붙이면 올라가요)'); return 0; }
  try {
    const p = await api.postText(next.body);
    const full = await api.getPost(p.id).catch(() => ({}));
    log(`✅ 일상 글 올림 → ${full.permalink || p.id}`);
    return 0;
  } catch (e) { log(`❌ 일상 글을 올리지 못했어요: ${e.message}`); return 2; }
}

if (isMain(import.meta.url)) setTimeout(() => { console.error('❌ 7분이 넘도록 끝나지 않아 멈춰요 — 다음 실행이 다시 해요'); process.exit(2); }, 7 * 60000).unref();
if (isMain(import.meta.url)) process.exitCode = await main().catch((e) => { console.error(`❌ ${e.message}`); return 2; });
