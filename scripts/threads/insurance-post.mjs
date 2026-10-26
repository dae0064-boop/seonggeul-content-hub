#!/usr/bin/env node
/**
 * 스레드 보험 심의글 올리기 — 심의 '적격' 받은 편을 1편부터 차례로, 그 편의 심의필 배너를 붙여 올린다.
 *
 * 2026-10-26 사용자: "스레드 1편부터 스레드에 게시", 배너 맨 아래 줄에 그 편의 준법심의필번호·유효기간을 넣어서.
 * 같은 날 결정: 하루 4편(08:30·12:30·18:30·21:30) + 일상글, 배너는 저장소(공개)에, 사무실 PC·노트북 둘 다.
 *
 *   node scripts/threads/insurance-post.mjs --word-dir <Drive 보험글> --approved <goms-approved.tsv>          시험: 올릴 글만 보여 줌
 *   node scripts/threads/insurance-post.mjs --word-dir <Drive 보험글> --approved <goms-approved.tsv> --post   실제로 한 편 올림
 *
 * 한 번 실행 = 많아야 한 편. 올리기 전에 모두 확인하고, 하나라도 어긋나면 올리지 않는다:
 *   - 멈춤 스위치(content/threads/PAUSE, THREADS_PAUSED)가 꺼져 있다
 *   - goms-approved.tsv 에 그 편이 '적격'이고 오늘이 유효기간 안이다
 *   - 글은 심의받은 Word(Drive 보험글/스레드 N편.docx)에서 사진 앞까지 그대로 읽는다 — 원고(sets/*.md)가 아니라 Word 가 정본
 *   - 배너(저장소 main 의 content/threads/insurance/banners/thread-N.jpg)가 공개 주소에서 열린다
 *   - 이미 올린 편이 아니다 — 상태 파일 없이 내 스레드 최근 글을 되읽어 본다 (두 PC 가 함께 돌아도 두 번 올리지 않게)
 *   - 오늘(한국시간) 사진 글이 하루 상한(기본 4)보다 적고, 마지막 사진 글이 40분보다 오래됐다 (노트북은 사무실 PC 5분 뒤에 돈다)
 *
 * 종료 코드: 0 = 올림 또는 올릴 것 없음, 1 = 설정 문제(토큰·파일), 2 = 올리다 실패
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadEnv, pausedReason, kstDayStartUnix, kstStamp, log, step, warn } from './config.mjs';
import { threadsApi } from './api.mjs';
import { wordText } from './word-fix.mjs';

const argv = process.argv.slice(2);
const arg = (n, d = '') => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const doPost = argv.includes('--post');
const wordDir = arg('--word-dir');
const approvedTsv = arg('--approved');
const maxPerDay = Number(arg('--max-per-day', process.env.THREADS_INSURANCE_PER_DAY || '4'));
const gapMin = Number(arg('--gap-min', '40'));
const RAW = process.env.THREADS_BANNER_BASE
  || 'https://raw.githubusercontent.com/dae0064-boop/seonggeul-content-hub/main/content/threads/insurance/banners';

const norm = (t) => (t || '').replace(/\s/g, '');
/** 올린 글인지 볼 때 쓰는 머리 — 첫 두 줄 (제목 + 따옴표 질문). 스레드가 앞뒤 공백을 바꿔도 같게 본다. */
const head = (text) => norm(text.split('\n').filter((l) => l.trim()).slice(0, 2).join(''));
const today = kstStamp().slice(0, 10);

function readApproved(file) {
  const map = new Map();
  for (const line of fs.readFileSync(file, 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
    const c = line.split('\t').map((x) => x.trim());
    if (/^\d+$/.test(c[0] || '') && c.length >= 5) map.set(Number(c[0]), { no: c[1], start: c[2], end: c[3], result: c[4] });
  }
  return map;
}

async function opens(url) {
  try { const r = await fetch(url, { method: 'HEAD' }); return r.ok && /image\//.test(r.headers.get('content-type') || 'image/'); }
  catch { return false; }
}

async function main() {
  loadEnv();
  step(`스레드 보험글 ${doPost ? '올리기' : '시험 (올리지 않음)'} — ${kstStamp()}`);
  const paused = pausedReason();
  if (paused) { log(`멈춤 스위치가 켜져 있어 올리지 않아요: ${paused}`); return 0; }
  if (!wordDir || !approvedTsv) { log('--word-dir 와 --approved 가 필요해요'); return 1; }
  if (!fs.existsSync(approvedTsv)) { log(`심의 승인 표가 아직 없어요 (${path.basename(approvedTsv)}) — GOMS 승인 결과 읽기를 먼저 돌려요`); return 0; }
  const token = process.env.THREADS_ACCESS_TOKEN;
  if (!token) { log('스레드 연결 키(THREADS_ACCESS_TOKEN)가 이 PC 에 없어요 — launchers\\threads-key.cmd 를 더블클릭해 넣어 주세요'); return 1; }

  // 1) 올릴 수 있는 편 — 적격 + 유효기간 안 + Word 있음
  const approved = readApproved(approvedTsv);
  const ready = [];
  for (const [n, a] of [...approved].sort((x, y) => x[0] - y[0])) {
    if (a.result !== '적격') continue;
    if (!(a.start <= today && today <= a.end)) { warn(`스레드 ${n}편: 유효기간(${a.start} ~ ${a.end}) 밖이라 올리지 않아요`); continue; }
    const file = path.join(wordDir, `스레드 ${n}편.docx`);
    if (!fs.existsSync(file)) { warn(`스레드 ${n}편.docx 가 없어요`); continue; }
    const text = wordText(file);
    if (!text) { warn(`스레드 ${n}편.docx 에서 글을 읽지 못했어요`); continue; }
    ready.push({ n, a, text });
  }
  log(`심의 적격·유효기간 안: ${ready.length}편 (${ready.map((r) => r.n).join(', ') || '없음'})`);
  if (!ready.length) return 0;

  // 2) 내 스레드를 되읽어 이미 올린 편·오늘 올린 수를 본다
  const api = threadsApi(token);
  const me = await api.me();
  const posts = await api.myPosts({ limit: 100 });
  const postedHeads = new Set(posts.map((p) => head(p.text || '')));
  const dayStart = kstDayStartUnix();
  const images = posts.filter((p) => p.media_type === 'IMAGE');
  const todayImages = images.filter((p) => Date.parse(p.timestamp) / 1000 >= dayStart);
  const last = images.map((p) => Date.parse(p.timestamp)).sort((a, b) => b - a)[0];
  log(`계정 @${me.username} · 최근 글 ${posts.length}개 · 오늘 사진 글 ${todayImages.length}/${maxPerDay}`);

  const todo = ready.filter((r) => !postedHeads.has(head(r.text)));
  log(`아직 안 올린 편: ${todo.map((r) => r.n).join(', ') || '없음'}`);
  if (!todo.length) { log('올릴 편이 없어요 — 다음 승인을 기다려요'); return 0; }
  if (todayImages.length >= maxPerDay) { log(`오늘 ${maxPerDay}편을 다 올렸어요 — 내일 이어서`); return 0; }
  if (last && Date.now() - last < gapMin * 60000) {
    log(`마지막 보험글이 ${Math.round((Date.now() - last) / 60000)}분 전이라 이번엔 쉬어요 (다른 PC 가 막 올렸을 수 있어요)`);
    return 0;
  }

  // 3) 다음 편 — 글 길이·배너 주소 확인
  const next = todo[0];
  const url = `${RAW}/thread-${next.n}.jpg`;
  step(`다음: 스레드 ${next.n}편 (${next.a.no}, ${next.a.start} ~ ${next.a.end})`);
  console.log(next.text.split('\n').map((l) => `   │ ${l}`).join('\n'));
  if ([...next.text].length > 500) { log(`글이 ${[...next.text].length}자라 스레드 한도(500자)를 넘어요 — 올리지 않아요`); return 2; }
  if (!(await opens(url))) {
    log(`배너가 아직 공개 주소에 없어요: ${url}`);
    log('Claude 가 아침 확인 때 배너를 만들어 넣어요 — 그 뒤 다음 시각에 올라가요');
    return 0;
  }
  log(`배너: ${url} ✓`);
  if (!doPost) { log('시험이라 여기서 멈춰요 (--post 를 붙이면 올라가요)'); return 0; }

  // 4) 올리기 직전 한 번 더 — 그 사이 다른 PC 가 올렸는지
  const again = await api.myPosts({ limit: 25, since: dayStart - 86400 });
  if (again.some((p) => head(p.text || '') === head(next.text))) { log('방금 다른 PC 가 이 편을 올렸어요 — 올리지 않아요'); return 0; }

  try {
    const p = await api.postImage(next.text, url);
    log(`✅ 올림: 스레드 ${next.n}편 → ${p.permalink || p.id}`);
    return 0;
  } catch (e) {
    log(`❌ 올리지 못했어요: ${e.message}`);
    return 2;
  }
}

process.exitCode = await main().catch((e) => { console.error(`❌ ${e.message}`); return 2; });
