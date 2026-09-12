#!/usr/bin/env node
/**
 * 원고 검사기 — 모바일 가독성 규칙을 자동으로 확인한다.
 *
 *   node scripts/lint-post.mjs content/posts/*.md
 */
import fs from 'node:fs';
import { parsePost, flatLines } from './lib/parse-post.mjs';

const MAX_LINE = 22;          // 한 줄 최대 글자수(공백 포함)
const MIN_CHARS = 2200;       // 본문 최소 (공백 포함)
const MAX_CHARS = 2500;       // 본문 최대
const MIN_MAIN = 10;          // 메인 키워드 최소 등장 횟수
const BAN = ['무조건', '100%', '절대로', '확실히', '반드시'];

const files = process.argv.slice(2);
if (!files.length) {
  console.error('사용법: node scripts/lint-post.mjs <원고.md> [...]');
  process.exit(1);
}

let failed = 0;

for (const file of files) {
  const post = parsePost(fs.readFileSync(file, 'utf8'));
  const lines = flatLines(post);
  const texts = lines.map((l) => l.t);
  const chars = texts.join('').length;
  const errors = [];
  const notes = [];

  if (!post.title) errors.push('title 이 없습니다.');
  if (!post.mainKeyword) errors.push('main_keyword 가 없습니다.');
  if (post.title.length > 30) notes.push(`제목이 깁니다 (${post.title.length}자). 모바일에서 잘릴 수 있습니다.`);
  if (!post.tags.length) notes.push('태그가 없습니다.');

  lines.forEach((l, i) => {
    if (l.t.length > MAX_LINE) errors.push(`${MAX_LINE}자 초과 (${l.t.length}자): "${l.t}"`);
  });

  for (const w of BAN) if (texts.join('').includes(w)) errors.push(`과장 표현 사용: "${w}"`);
  for (const w of post.warnings) errors.push(w);

  // 키워드 세기: 띄어쓰기 차이를 흡수하려고 양쪽 공백을 제거하고 센다
  const flat = (post.title + texts.join('')).replace(/\s/g, '');
  const countOf = (kw) => {
    const k = kw.replace(/\s/g, '');
    if (!k) return 0;
    let n = 0, i = 0;
    while ((i = flat.indexOf(k, i)) !== -1) { n++; i += k.length; }
    return n;
  };
  const mainN = countOf(post.mainKeyword);
  const subN = post.subKeywords.map((k) => [k, countOf(k)]);

  if (chars < MIN_CHARS) errors.push(`본문이 짧습니다: ${chars}자 (최소 ${MIN_CHARS})`);
  if (chars > MAX_CHARS) errors.push(`본문이 깁니다: ${chars}자 (최대 ${MAX_CHARS})`);
  if (post.mainKeyword && mainN < MIN_MAIN)
    errors.push(`메인 키워드 "${post.mainKeyword}" ${mainN}회 — ${MIN_MAIN}회 이상 필요`);
  for (const [k, n] of subN) if (n === 0) notes.push(`서브 키워드 "${k}" 가 본문에 없습니다.`);

  const quotes = post.blocks.filter((b) => b.type === 'quote').length;
  const red = lines.filter((l) => l.s === 'red').length;
  const yellow = lines.filter((l) => l.s === 'yellow').length;
  const avg = (texts.reduce((a, t) => a + t.length, 0) / texts.length).toFixed(1);
  const max = Math.max(...texts.map((t) => t.length));

  console.log(`\n${file}`);
  console.log(`  제목        : ${post.title} (${post.title.length}자)`);
  const range = chars < MIN_CHARS ? '짧음' : chars > MAX_CHARS ? '김' : 'OK';
  console.log(`  본문        : ${chars}자 (기준 ${MIN_CHARS}~${MAX_CHARS}) ${range}`);
  console.log(`  메인 키워드 : "${post.mainKeyword}" ${mainN}회 (최소 ${MIN_MAIN})`);
  if (subN.length) console.log(`  서브 키워드 : ${subN.map(([k, n]) => `${k} ${n}회`).join(' / ')}`);
  console.log(`  줄/덩어리   : ${lines.length}줄 / ${post.blocks.length}덩어리`);
  console.log(`  줄 길이     : 평균 ${avg}자, 최장 ${max}자 (기준 ${MAX_LINE}자)`);
  console.log(`  인용구      : ${quotes}개`);
  console.log(`  강조        : 빨강 ${red}줄 / 노랑 ${yellow}줄`);
  console.log(`  태그        : ${post.tags.join(', ') || '(없음)'}`);

  for (const n of notes) console.log(`  · ${n}`);
  if (errors.length) {
    failed++;
    console.log(`  ❌ ${errors.length}건`);
    for (const e of errors) console.log(`     - ${e}`);
  } else {
    console.log('  ✅ 통과');
  }
}

process.exit(failed ? 1 : 0);
