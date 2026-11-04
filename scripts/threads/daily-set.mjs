#!/usr/bin/env node
/**
 * 스레드 일상 글 묶음 검사 (규칙 정본: content/threads/daily.md — 2026-11-02 사용자 "아침 러닝·응원, 저녁 마무리")
 *
 *   node scripts/threads/daily-set.mjs content/threads/daily/2026-11-03.md
 *
 * errors 가 하나라도 있으면 종료 코드 1 — 올리지 않는다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { isMain } from './config.mjs';
import { guard, similarity } from './guard.mjs';
import { parseSet } from './blog-set.mjs';

export const DAILY_SLOTS_OLD = ['07:00', '19:00'];
// 2026-11-03 사용자 "블로그 유입 글 3, 일상 글 4, 보험 심의글 3 — 하루 10편": 11/4 묶음부터 07:00 러닝·응원 · 12:30 점심 · 18:30 퇴근길 · 23:00 하루 마무리
export const DAILY_SLOTS = ['07:00', '12:30', '18:30', '23:00'];
// 2026-11-04 사용자 "긍정 일상글 2개 더 — 아침 출근길 '모두 힘내자', 퇴근 뒤 '모두 수고했다, 푹 쉬자'": 11/5 묶음부터 08:30 출근길 응원 · 19:30 퇴근 수고 추가 (하루 6편). 11/4 는 19:30 만 더함
export const DAILY_SLOTS6 = ['07:00', '08:30', '12:30', '18:30', '19:30', '23:00'];
export const dailySlots = (date) => (date >= '2026-11-05' ? DAILY_SLOTS6 : date === '2026-11-04' ? ['07:00', '12:30', '18:30', '19:30', '23:00'] : date >= '2026-11-04' ? DAILY_SLOTS : DAILY_SLOTS_OLD);
const MIN_CHARS = 15; // 2026-11-04 사용자 "너무 AI 같다" — 한두 줄짜리 글도 된다 (daily.md 🤖)
const MAX_CHARS = 250;
const MAX_LINE = 26;
const MAX_EMOJI = 2; // 2026-11-02 사용자 "너무 쓰지 말고 1~2개만"
// 일상 글에 보험·광고 이야기를 넣지 않는다 (daily.md "지키는 것")
const OFF_TOPIC = /보험|실손|실비|보장|청구|상담|가입|설계사|블로그|링크|구매|할인|광고|협찬/;

// 2026-11-04 사용자 "너무 AI 같지 않냐?" — 매끈한 정리 말 (daily.md 🤖)
const AI_WORDS = /의외로|어느새|그제야|은근 힐링|소소한|하루 피로|하는 시간|사실상|왜 이제|이게 행복/;

export function checkDaily(file) {
  const errors = [];
  const notes = [];
  const items = parseSet(fs.readFileSync(file, 'utf8'));
  const slots = dailySlots(path.basename(file).slice(0, 10));
  if (slots !== DAILY_SLOTS_OLD && items.length !== slots.length) errors.push(`${items.length}편 — 하루 ${slots.length}편(${slots.join('·')})입니다.`);
  if (!items.length) errors.push('글이 없습니다 (## 1 … 형식).');
  const times = new Set();
  // 지난 묶음 글과 너무 비슷하면 막는다 (같은 농담 반복 금지)
  const dir = path.dirname(file);
  const others = fs.readdirSync(dir).filter((x) => /^\d{4}-\d{2}-\d{2}\.md$/.test(x) && x !== path.basename(file))
    .flatMap((x) => parseSet(fs.readFileSync(path.join(dir, x), 'utf8')).map((it) => ({ f: x, body: it.body })));

  for (const it of items) {
    const tag = `[${it.no}]`;
    const err = (s) => errors.push(`${tag} ${s}`);
    const body = it.body || '';
    if (!slots.includes(it['시각'])) err(`시각 ${it['시각'] || '(없음)'} — ${slots.join('·')} 중 하나로.`);
    if (times.has(it['시각'])) err(`같은 시각(${it['시각']})에 두 편입니다.`);
    times.add(it['시각']);
    if (body.length < MIN_CHARS || body.length > MAX_CHARS) err(`${body.length}자 — ${MIN_CHARS}~${MAX_CHARS}자로.`);
    for (const line of body.split('\n')) if ([...line].length > MAX_LINE) err(`한 줄 ${[...line].length}자 (최대 ${MAX_LINE}): "${line}"`);
    const paras = body.split(/\n\s*\n/);
    for (const para of paras) {
      const n = para.split('\n').filter(Boolean).length;
      if (n > 4) err(`문단이 ${n}줄입니다 (최대 4).`);
    }
    const ai = path.basename(file).slice(0, 10) >= '2026-11-05' && body.match(AI_WORDS); // 이미 올린 11/4 앞 글은 그대로
    if (ai) err(`"${ai[0]}" — AI 티 나는 말입니다 (daily.md 🤖). 다른 말로.`);
    const emoji = (body.match(/\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}\uFE0F?)*/gu) || []).length; // 🏃‍♂️ 같은 이어 붙인 그림은 하나로
    if (emoji > MAX_EMOJI) err(`이모지 ${emoji}개 (최대 ${MAX_EMOJI}).`);
    if (/https?:\/\/|#[^\s#]+/.test(body)) err('링크·해시태그는 쓰지 않습니다.');
    const off = body.match(OFF_TOPIC);
    if (off) err(`일상 글에 "${off[0]}" — 보험·광고·블로그 이야기는 넣지 않습니다.`);
    for (const o of others) {
      const sim = similarity(body, o.body);
      if (sim >= 0.5) err(`${o.f} 의 글과 ${Math.round(sim * 100)}% 비슷합니다 — 다른 말로.`);
    }
    const g = guard(body, { kind: 'daily' });
    for (const e of g.errors) err(`안전장치: ${e}`);
  }
  // 하루 4편이 같은 모양이면 찍어 낸 글로 보인다 (daily.md 🤖) — 11/5 묶음부터
  if (slots !== DAILY_SLOTS_OLD && items.length && path.basename(file).slice(0, 10) >= '2026-11-05') {
    const bodies = items.map((it) => (it.body || '').trim());
    if (!bodies.some((b) => b.length <= 50)) errors.push('한두 줄짜리(50자 이하) 글이 하루 1편 이상 있어야 합니다 (daily.md 🤖).');
    const three = bodies.filter((b) => b.split(/\n\s*\n/).length >= 3).length;
    if (three > 1) errors.push(`3문단 글이 ${three}편 — 하루 1편까지 (daily.md 🤖).`);
    const emo = /\p{Extended_Pictographic}/u;
    const withEmoji = bodies.filter((b) => emo.test(b)).length;
    if (withEmoji > 2) errors.push(`이모지 쓴 글이 ${withEmoji}편 — 하루 1~2편만 (daily.md 🤖).`);
  }
  return { errors, notes, items };
}

const file = process.argv[2];
if (file && isMain(import.meta.url)) {
  const { errors, notes, items } = checkDaily(file);
  console.log(`스레드 일상 묶음: ${path.basename(file)} — ${items.length}편`);
  for (const n of notes) console.log(`  참고 ${n}`);
  for (const e of errors) console.log(`  ✗ ${e}`);
  console.log(errors.length ? `불통과 (${errors.length})` : '통과');
  process.exit(errors.length ? 1 : 0);
}
