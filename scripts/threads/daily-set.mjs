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

export const DAILY_SLOTS = ['07:00', '19:00'];
const MIN_CHARS = 60;
const MAX_CHARS = 250;
const MAX_LINE = 26;
const MAX_EMOJI = 2; // 2026-11-02 사용자 "너무 쓰지 말고 1~2개만"
// 일상 글에 보험·광고 이야기를 넣지 않는다 (daily.md "지키는 것")
const OFF_TOPIC = /보험|실손|실비|보장|청구|상담|가입|설계사|블로그|링크|구매|할인|광고|협찬/;

export function checkDaily(file) {
  const errors = [];
  const notes = [];
  const items = parseSet(fs.readFileSync(file, 'utf8'));
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
    if (!DAILY_SLOTS.includes(it['시각'])) err(`시각 ${it['시각'] || '(없음)'} — ${DAILY_SLOTS.join('·')} 중 하나로.`);
    if (times.has(it['시각'])) err(`같은 시각(${it['시각']})에 두 편입니다.`);
    times.add(it['시각']);
    if (body.length < MIN_CHARS || body.length > MAX_CHARS) err(`${body.length}자 — ${MIN_CHARS}~${MAX_CHARS}자로.`);
    for (const line of body.split('\n')) if ([...line].length > MAX_LINE) err(`한 줄 ${[...line].length}자 (최대 ${MAX_LINE}): "${line}"`);
    const paras = body.split(/\n\s*\n/);
    if (paras.length < 2) err('문단 사이에 빈 줄이 없습니다 — 2~4줄마다 한 칸 띄웁니다.');
    for (const para of paras) {
      const n = para.split('\n').filter(Boolean).length;
      if (n > 4) err(`문단이 ${n}줄입니다 (최대 4).`);
      if (n === 1) err(`한 줄짜리 문단 — 2~4줄로 묶어 주세요: "${para.trim()}"`);
    }
    const emoji = (body.match(/\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}\uFE0F?)*/gu) || []).length; // 🏃‍♂️ 같은 이어 붙인 그림은 하나로
    if (emoji > MAX_EMOJI) err(`이모지 ${emoji}개 (최대 ${MAX_EMOJI}).`);
    if (!emoji) notes.push(`${tag} 이모지가 없습니다 (사용자 — 1~2개 넣기).`);
    if (/https?:\/\/|#[^\s#]+/.test(body)) err('링크·해시태그는 쓰지 않습니다.');
    const off = body.match(OFF_TOPIC);
    if (off) err(`일상 글에 "${off[0]}" — 보험·광고·블로그 이야기는 넣지 않습니다.`);
    for (const o of others) {
      const sim = similarity(body, o.body);
      if (sim >= 0.5) err(`${o.f} 의 글과 ${Math.round(sim * 100)}% 비슷합니다 — 다른 말로.`);
    }
    const g = guard(body);
    for (const e of g.errors) err(`안전장치: ${e}`);
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
