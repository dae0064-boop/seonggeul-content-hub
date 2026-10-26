#!/usr/bin/env node
/**
 * 스레드 보험 심의글 올리기 — 심의 '적격' 받은 편을 1편부터 차례로, 그 편의 심의필 배너를 붙여 올린다.
 *
 * 2026-10-26 사용자: "스레드 1편부터 스레드에 게시", 배너 맨 아래 줄에 그 편의 준법심의필번호·유효기간을 넣어서.
 * 같은 날 결정: 배너는 저장소(공개)에, 사무실 PC·노트북 둘 다. 같은 날 저녁 바꿈 — **하루 5편(2026-10-27~),
 * 한 편을 두 개로 나눠 올린다: 1/2 = 글 앞 절반, 2/2 = 뒤 절반 + 심의필 배너 (1/2 아래 답글로 이어 붙임)** ("글이 기니까").
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
 *   - 오늘(한국시간) 올린 보험글이 하루 상한(기본 5)보다 적고, 마지막 보험글이 40분보다 오래됐다 (노트북은 사무실 PC 5분 뒤에 돈다)
 *   - 1/2 만 올라가고 2/2 가 빠진 편이 있으면 새 편보다 그 2/2 를 먼저 붙인다
 *
 * 종료 코드: 0 = 올림 또는 올릴 것 없음, 1 = 설정 문제(토큰·파일), 2 = 올리다 실패
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv, pausedReason, kstDayStartUnix, kstStamp, log, step, warn } from './config.mjs';
import { threadsApi } from './api.mjs';
import { wordText } from './word-fix.mjs';

const argv = process.argv.slice(2);
const arg = (n, d = '') => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const doPost = argv.includes('--post');
const wordDir = arg('--word-dir');
const approvedTsv = arg('--approved');
const fixesTsv = arg('--fixes'); // 반려(수정요구)된 편 번호 — 순서 확인에 쓴다
const maxPerDay = Number(arg('--max-per-day', process.env.THREADS_INSURANCE_PER_DAY || '5'));
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

  // 2) 내 스레드를 되읽어 이미 올린 편·오늘 올린 수를 본다 (1/2 는 첫 두 줄이 Word 첫 두 줄과 같다)
  const api = threadsApi(token);
  const me = await api.me();
  const posts = await api.myPosts({ limit: 100 });
  const byHead = new Map(ready.map((r) => [head(r.text), r]));
  const ours = posts.filter((p) => byHead.has(head(p.text || '')));
  const dayStart = kstDayStartUnix();
  const todayOurs = ours.filter((p) => Date.parse(p.timestamp) / 1000 >= dayStart);
  const last = ours.map((p) => Date.parse(p.timestamp)).sort((a, b) => b - a)[0];
  log(`계정 @${me.username} · 최근 글 ${posts.length}개 · 오늘 보험글 ${todayOurs.length}/${maxPerDay}`);

  // 2-1) 1/2 만 올라간 편 — 2/2(사진 답글)를 먼저 붙인다
  const recent = ours.filter((p) => Date.now() - Date.parse(p.timestamp) < 3 * 86400000);
  if (recent.length) {
    const replies = await api.myReplies({ limit: 50 }).catch(() => null);
    if (replies) {
      for (const p of recent) {
        const has = replies.some((r) => (r.replied_to?.id === p.id || r.root_post?.id === p.id) && r.media_type === 'IMAGE');
        if (has) continue;
        const r = byHead.get(head(p.text || ''));
        if (!r) continue;
        const [, second] = split(r.text);
        warn(`스레드 ${r.n}편: 1/2 만 올라가 있어요 — 2/2 를 붙여요`);
        if (!doPost) { log('시험이라 붙이지 않아요'); return 0; }
        const url = `${RAW}/thread-${r.n}.jpg`;
        if (!(await opens(url))) { log(`배너가 아직 공개 주소에 없어요: ${url}`); return 0; }
        try {
          const q = await api.postImage(second, url, { replyToId: p.id });
          log(`✅ 2/2 붙임: 스레드 ${r.n}편 → ${q.permalink || q.id}`);
          return 0;
        } catch (e) { log(`❌ 2/2 를 붙이지 못했어요: ${e.message}`); return 2; }
      }
    } else warn('내 답글 목록을 읽지 못해 2/2 빠진 편은 이번에 확인하지 못했어요');
  }

  const postedHeads = new Set(ours.map((p) => head(p.text || '')));
  const todo = ready.filter((r) => !postedHeads.has(head(r.text)));
  log(`아직 안 올린 편: ${todo.map((r) => r.n).join(', ') || '없음'}`);
  if (!todo.length) { log('올릴 편이 없어요 — 다음 승인을 기다려요'); return 0; }
  if (todayOurs.length >= maxPerDay) { log(`오늘 ${maxPerDay}편을 다 올렸어요 — 내일 이어서`); return 0; }
  if (last && Date.now() - last < gapMin * 60000) {
    log(`마지막 보험글이 ${Math.round((Date.now() - last) / 60000)}분 전이라 이번엔 쉬어요 (다른 PC 가 막 올렸을 수 있어요)`);
    return 0;
  }

  // 3) 다음 편 — 앞 번호 중 심의 결과를 아직 못 읽은 편이 있으면 기다린다 (1편부터 차례로 — 2026-10-26 사용자)
  const next = todo[0];
  const rejected = new Set();
  if (fixesTsv && fs.existsSync(fixesTsv)) for (const l of fs.readFileSync(fixesTsv, 'utf8').split(/\r?\n/)) { const k = Number((l.split('\t')[0] || '').trim()); if (k) rejected.add(k); }
  const unknown = [];
  for (let k = 1; k < next.n; k++) if (!approved.has(k) && !rejected.has(k) && fs.existsSync(path.join(wordDir, `스레드 ${k}편.docx`))) unknown.push(k);
  if (unknown.length) {
    log(`${unknown.join(', ')}편의 심의 결과를 아직 못 읽었어요 — ${next.n}편을 먼저 올리지 않고 기다려요 (goms-approved 를 다시 돌리면 풀려요)`);
    return 0;
  }
  const url = `${RAW}/thread-${next.n}.jpg`;
  const [first, second] = split(next.text);
  step(`다음: 스레드 ${next.n}편 (${next.a.no}, ${next.a.start} ~ ${next.a.end})`);
  console.log(['   ── 1/2 ──', ...first.split('\n').map((l) => `   │ ${l}`), '   ── 2/2 (+ 심의필 배너) ──', ...second.split('\n').map((l) => `   │ ${l}`)].join('\n'));
  if (!second) { log('글이 짧아 둘로 나눌 수 없어요 — 올리지 않아요'); return 2; }
  if (norm(first + second) !== norm(next.text)) { log('나눈 글을 합치니 Word 글과 달라요 — 올리지 않아요'); return 2; }
  for (const [i, t] of [[1, first], [2, second]]) if ([...t].length > 500) { log(`${i}/2 가 ${[...t].length}자라 스레드 한도(500자)를 넘어요 — 올리지 않아요`); return 2; }
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

  let p1;
  try {
    p1 = await api.postText(first);
    log(`✅ 1/2 올림: 스레드 ${next.n}편 (${p1.id})`);
  } catch (e) { log(`❌ 1/2 를 올리지 못했어요: ${e.message}`); return 2; }
  try {
    const p2 = await api.postImage(second, url, { replyToId: p1.id });
    log(`✅ 2/2 올림 (배너 포함): ${p2.permalink || p2.id}`);
    return 0;
  } catch (e) {
    log(`❌ 2/2 를 올리지 못했어요: ${e.message} — 다음 실행이 2/2 를 먼저 붙여요`);
    return 2;
  }
}

const ENDS = (l) => /(요|다|죠|까|고요|[?!.~…]|\p{Extended_Pictographic}[\uFE0F\u200D]*|\)|”)\s*$/u.test(l.trim());

/**
 * 줄을 2~4줄 덩어리로 묶는다 (2026-10-26 사용자 — "유도리 있게 2~4줄 사이로 끊어서, 너무 딱딱 붙어 있으면 의미가 없다").
 * 글자는 그대로 두고 덩어리 사이에 빈 줄만 넣는다. 끊는 자리는 문장이 끝나는 줄 뒤.
 * 첫 세 줄(제목 · “따옴표 말” · 공감 한 줄)은 한 덩어리. Word 에 이미 있는 빈 줄(수정 문구 앞)은 그대로 끊는다.
 */
export function blocks(text) {
  const all = text.split('\n').map((l) => l.trimEnd());
  // Word 의 빈 줄로 먼저 나눈 뒤, 조각마다 다시 묶는다
  const parts = [];
  let cur = [];
  for (const l of all) { if (l.trim()) cur.push(l); else if (cur.length) { parts.push(cur); cur = []; } }
  if (cur.length) parts.push(cur);
  const out = [];
  parts.forEach((lines, pi) => {
    let start = 0;
    if (pi === 0 && lines.length > 4 && /^[“"]/.test((lines[1] || '').trim())) { out.push(lines.slice(0, 3)); start = 3; }
    out.push(...group(lines.slice(start)));
  });
  return out;
}

/** 줄 묶기 — 덩어리 크기 3·4 를 좋아하고 2 도 되며, 문장 중간에서 끊으면 벌점. 같은 점수면 먼저 끊는 쪽. */
function group(lines) {
  const n = lines.length;
  if (n <= 4) return n ? [lines] : [];
  const sizeCost = (k) => ({ 1: 10, 2: 1, 3: 0, 4: 0.3, 5: 6 })[k] ?? 20;
  const cutCost = (i) => (i === n - 1 || ENDS(lines[i]) ? 0 : /,\s*$/.test(lines[i]) ? 3 : 8);
  const best = new Array(n + 1).fill(Infinity), prev = new Array(n + 1).fill(-1);
  best[0] = 0;
  for (let j = 1; j <= n; j++) {
    for (let i = Math.max(0, j - 6); i < j; i++) {
      const c = best[i] + sizeCost(j - i) + cutCost(j - 1);
      if (c < best[j] - 1e-9) { best[j] = c; prev[j] = i; }
    }
  }
  const cuts = [];
  for (let j = n; j > 0; j = prev[j]) cuts.unshift([prev[j], j]);
  return cuts.map(([i, j]) => lines.slice(i, j));
}

/**
 * 글을 두 개로 나눈다 — 덩어리 경계 중 글자 수 절반에 가장 가까운 곳. 1/2·2/2 모두 덩어리 사이에 빈 줄이 들어간다.
 * 빈 줄로 나뉜 수정 문구(반려 뒤 넣은 빨간 문구)는 뒤쪽에 남는다.
 */
export function split(text) {
  const bs = blocks(text);
  const len = (b) => [...b.join('').replace(/\s/g, '')].length;
  const total = bs.reduce((a, b) => a + len(b), 0);
  let best = 1, bestScore = Infinity, acc = 0;
  for (let k = 1; k < bs.length; k++) {
    acc += len(bs[k - 1]);
    const score = Math.abs(acc - total / 2);
    if (score < bestScore) { bestScore = score; best = k; }
  }
  const join = (arr) => arr.map((b) => b.join('\n')).join('\n\n');
  if (bs.length < 2) return [join(bs), ''];
  return [join(bs.slice(0, best)), join(bs.slice(best))];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main().catch((e) => { console.error(`❌ ${e.message}`); return 2; });
