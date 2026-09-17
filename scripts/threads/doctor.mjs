#!/usr/bin/env node
/**
 * 스레드 자동화 점검 — 아무것도 올리지 않고 연결 상태만 확인한다.
 *
 *   node scripts/threads/doctor.mjs
 *
 * 설정을 처음 끝냈을 때, 그리고 뭔가 안 돌 때 제일 먼저 돌린다.
 */
import fs from 'node:fs';
import {
  cfg, loadEnv, pausedReason, kstDayStartUnix, kstStamp,
  VOICE_FILE, TOPICS_FILE, isMain, log, step, warn,
} from './config.mjs';
import { threadsApi } from './api.mjs';

const ok = (m) => console.log(`   [정상] ${m}`);
const bad = (m) => console.log(`   [문제] ${m}`);

if (isMain(import.meta.url)) {
  loadEnv();
  let problems = 0;

  step(`점검 — ${kstStamp()}`);

  // 1. 멈춤 스위치
  const stop = pausedReason();
  if (stop) warn(`멈춤 상태입니다 — ${stop}`);
  else ok('멈춤 스위치 꺼져 있음');

  // 2. 규칙 파일
  for (const [label, file] of [['말투 규칙 voice.md', VOICE_FILE], ['글감 topics.txt', TOPICS_FILE]]) {
    if (fs.existsSync(file)) {
      const n = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.trim()).length;
      ok(`${label} — ${n}줄`);
    } else {
      bad(`${label} 가 없습니다: ${file}`);
      problems++;
    }
  }

  // 3. 키
  for (const name of ['THREADS_ACCESS_TOKEN', 'ANTHROPIC_API_KEY']) {
    if (process.env[name]) ok(`${name} 있음`);
    else { bad(`${name} 없음`); problems++; }
  }

  // 4. 스레드 연결
  if (process.env.THREADS_ACCESS_TOKEN) {
    try {
      const api = threadsApi(process.env.THREADS_ACCESS_TOKEN);
      const me = await api.me();
      ok(`스레드 연결됨 — @${me.username} (${me.id})`);

      const today = await api.countPostsSince(kstDayStartUnix());
      ok(`오늘 발행 ${today}/${cfg.maxPostsPerDay}`);

      const recent = await api.myPosts({ limit: 5 });
      ok(`최근 글 ${recent.length}개 읽음`);
      for (const p of recent.slice(0, 3)) {
        log(`  · ${String(p.text || '').replace(/\s+/g, ' ').slice(0, 44)} (${p.timestamp?.slice(0, 10)})`);
      }
    } catch (e) {
      bad(`스레드 연결 실패 — ${e.message}`);
      problems++;
    }
  }

  // 5. Anthropic 연결
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const res = await fetch(`${process.env.ANTHROPIC_API_BASE || 'https://api.anthropic.com'}/v1/models`, {
        headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      });
      if (res.ok) ok(`Anthropic 연결됨 — 모델 ${cfg.model}`);
      else { bad(`Anthropic ${res.status} — 키를 확인하세요`); problems++; }
    } catch (e) {
      bad(`Anthropic 연결 실패 — ${e.message}`);
      problems++;
    }
  }

  step('설정값');
  log(`하루 상한 ${cfg.maxPostsPerDay}편 · 한 번에 답글 ${cfg.maxRepliesPerRun}개 · 글 ${cfg.minChars}~${cfg.maxChars}자`);

  console.log('');
  if (problems) {
    console.log(`문제 ${problems}개. docs/THREADS.md 를 보고 고치세요.`);
    process.exit(1);
  }
  console.log('모두 정상입니다.');
}
