#!/usr/bin/env node
/**
 * 원고 검사기 — 모바일 가독성 규칙을 자동으로 확인한다.
 *
 *   node scripts/lint-post.mjs content/posts/*.md
 */
import fs from 'node:fs';
import { parsePost, flatLines } from './lib/parse-post.mjs';

// 실제 발행글(119 안심콜) 실측치에 맞춰 잡은 기준
//   3,066자 / 평균 줄 19.8자 / 최장 29자 / 덩어리당 3.4줄
const MAX_LINE = 30;          // 한 줄 최대 글자수(공백 포함)
const AVG_LINE = [17, 23];    // 평균 줄 길이 권장 구간
const MIN_BLOCK_LINES = 2.6;  // 덩어리당 평균 줄 수 하한 (너무 잘게 쪼개지 않기)
const MIN_CHARS = 2800;       // 본문 최소 (공백 포함)
const MAX_CHARS = 3400;       // 본문 최대
const MIN_MAIN = 10;          // 메인 키워드 최소 등장 횟수
const MIN_SUB = 5;            // 서브 키워드 각각 최소 등장 횟수
const MIN_TAGS = 15;          // 해시태그 최소 개수

// 단정적 우위 표현 — 쓰면 안 된다
const BAN = ['무조건', '100%', '단언컨대', '절대로', '손실 없음', '공짜'];

// 고정 인사말 — 모든 글이 이걸로 열고 닫는다
const OPEN = ['안녕하세요', '매일매일 좋은 날을 나누는 성글벙글입니다😊'];
const CLOSE_1 = '좋아요·공감과 이웃추가 부탁드려요💙';
const CLOSE_RE = /^이상 성글벙글의 .+ 포스팅이었습니다😎$/;
// 문맥에 따라 괜찮을 수 있어 경고만 한다 ("가장 먼저" 처럼 순서를 뜻하는 경우)
const WARN_WORDS = ['최고', '최저', '제일', '가장', '확실히', '반드시'];

const files = process.argv.slice(2);
if (!files.length) {
  console.error('사용법: node scripts/lint-post.mjs <원고.md> [...]');
  process.exit(1);
}

let failed = 0;

for (const file of files) {
  const post = parsePost(fs.readFileSync(file, 'utf8'));
  const lines = flatLines(post).filter((l) => l.block !== 'image');
  const images = post.blocks.filter((b) => b.type === 'image');
  const texts = lines.map((l) => l.t);
  const chars = texts.join('').length;
  const errors = [];
  const notes = [];

  if (!post.title) errors.push('title 이 없습니다.');
  if (!post.mainKeyword) errors.push('main_keyword 가 없습니다.');
  if (post.title.length > 30) notes.push(`제목이 깁니다 (${post.title.length}자). 모바일에서 잘릴 수 있습니다.`);


  lines.forEach((l, i) => {
    if (l.t.length > MAX_LINE) errors.push(`${MAX_LINE}자 초과 (${l.t.length}자): "${l.t}"`);
  });

  const body = texts.join('');
  for (const w of BAN) if (body.includes(w)) errors.push(`단정적 표현 사용: "${w}"`);
  for (const w of WARN_WORDS) if (body.includes(w)) notes.push(`"${w}" — 우위를 단정하는 뜻이면 고치세요.`);
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
  for (const [k, n] of subN)
    if (n < MIN_SUB) errors.push(`서브 키워드 "${k}" ${n}회 — ${MIN_SUB}회 이상 필요`);

  // 제목은 메인 키워드로 시작해야 한다 (타깃 키워드를 첫 어절에)
  if (post.mainKeyword) {
    const t = post.title.replace(/\s/g, ''), k = post.mainKeyword.replace(/\s/g, '');
    if (!t.startsWith(k)) errors.push(`제목이 메인 키워드로 시작하지 않습니다: "${post.title}"`);
  }
  if (post.tags.length < MIN_TAGS) errors.push(`해시태그 ${post.tags.length}개 — ${MIN_TAGS}개 이상 필요`);

  if (images.length && images.length !== 10)
    notes.push(`이미지 자리 ${images.length}개 — 10개 기준입니다.`);

  // 고정 인사말
  if (texts[0] !== OPEN[0] || texts[1] !== OPEN[1])
    errors.push(`오프닝이 고정 문구와 다릅니다. "${OPEN[0]} / ${OPEN[1]}" 로 시작해야 합니다.`);
  if (texts[texts.length - 2] !== CLOSE_1 || !CLOSE_RE.test(texts[texts.length - 1]))
    errors.push(`클로징이 고정 문구와 다릅니다. "${CLOSE_1} / 이상 성글벙글의 OO 포스팅이었습니다😎" 로 끝나야 합니다.`);

  // 덩어리를 너무 잘게 쪼개면 글이 툭툭 끊긴다
  const textBlocks = post.blocks.filter((b) => b.type !== 'image');
  const perBlock = lines.length / textBlocks.length;
  if (perBlock < MIN_BLOCK_LINES)
    errors.push(`덩어리가 잘게 쪼개졌습니다: 덩어리당 ${perBlock.toFixed(1)}줄 (최소 ${MIN_BLOCK_LINES})`);
  const avgLine = texts.reduce((a, t) => a + t.length, 0) / texts.length;
  if (avgLine < AVG_LINE[0] || avgLine > AVG_LINE[1])
    notes.push(`평균 줄 길이 ${avgLine.toFixed(1)}자 — 권장 ${AVG_LINE[0]}~${AVG_LINE[1]}자`);

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
  console.log(`  줄 길이     : 평균 ${avg}자 (권장 ${AVG_LINE[0]}~${AVG_LINE[1]}), 최장 ${max}자 (한도 ${MAX_LINE})`);
  console.log(`  덩어리당    : ${perBlock.toFixed(1)}줄 (최소 ${MIN_BLOCK_LINES})`);
  console.log(`  인용구      : ${quotes}개`);
  console.log(`  이미지 자리 : ${images.length}개`);
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
