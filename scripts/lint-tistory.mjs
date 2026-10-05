#!/usr/bin/env node
/**
 * 티스토리 원고 검사기 — 두 단계를 모두 통과해야 한다.
 *
 *   node scripts/lint-tistory.mjs content/tistory/*.md
 *
 * 1) 서식: 네이버 검사기(lint-post.mjs --tistory)를 그대로 돌린다.
 *    2026-10-02 사용자 지시 — 티스토리도 네이버와 같은 지침으로 쓴다: 의미 단위 줄바꿈·2~4줄 덩어리,
 *    빨강·파랑·노랑 배경 강조, 인용구 소제목, ~해요 체, 같은 여는 인사, 분량·키워드 횟수·Q&A 3쌍.
 *    다른 점은 닫는 인사의 '구독'(이웃추가 대신)과 고정 태그(서이추 등) 없음뿐이다.
 *
 * 2) 네이버와 다른 글인가 (2026-10-02 사용자 지시: 같은 내용·제목이면 유사문서에 걸린다)
 *    content/posts/ 의 네이버 원고 전부와 견준다.
 *    - 메인 키워드: 네이버 글의 메인 키워드와 같거나, 제목에 그 키워드가 그대로 들어 있으면 불통과
 *    - 제목: 글자 2개 조각 유사도(Dice) 0.4 이상이면 불통과
 *    - 본문: 10글자 조각이 15% 이상 겹치면 불통과
 *    고정 인사말·닫는 인사는 두 채널이 같으므로 겹침 계산에서 뺀다.
 *    source_post 는 같은 묶음(클러스터)의 네이버 글을 적는 칸일 뿐, 그 글을 고쳐 쓰라는 뜻이 아니다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parsePost, flatLines } from './lib/parse-post.mjs';

const OVERLAP = { err: 0.15, note: 0.08 };   // 네이버 글과 겹치는 본문 10글자 조각 비율
const TITLE_SIM = { err: 0.4, note: 0.25 };  // 네이버 제목과의 글자 2개 조각 유사도(Dice)
// 두 채널에 똑같이 들어가는 고정 문구 — 겹침에서 뺀다
const FIXED_LINE = /^(안녕하세요|매일매일 좋은 날을 나누는 성글벙글입니다😊|좋아요·공감과 (구독|이웃추가) 부탁드려요💙|이상 성글벙글의 .+ 포스팅이었습니다😎)$/;

const files = process.argv.slice(2);
if (!files.length) {
  console.error('사용법: node scripts/lint-tistory.mjs <원고.md> [...]');
  process.exit(1);
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const norm = (s) => s.replace(/[\s.,!?·~'"“”‘’()\[\]:;\-–—*|#>]/g, '');
function shingles(s, n = 10) {
  const set = new Set();
  for (let i = 0; i + n <= s.length; i++) set.add(s.slice(i, i + n));
  return set;
}
function dice(a, b) {
  const A = shingles(norm(a), 2), B = shingles(norm(b), 2);
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const x of A) if (B.has(x)) hit++;
  return (2 * hit) / (A.size + B.size);
}
const bodyText = (post) => norm(flatLines(post).filter((l) => l.block !== 'image' && !FIXED_LINE.test(l.t)).map((l) => l.t).join(''));

// 네이버 원고 전부 (한 번만 읽는다)
const POSTS = path.join('content', 'posts');
const NAVER = fs.existsSync(POSTS)
  ? fs.readdirSync(POSTS).filter((f) => f.endsWith('.md')).map((f) => {
    const p = parsePost(fs.readFileSync(path.join(POSTS, f), 'utf8'));
    return { slug: f.replace(/\.md$/, ''), title: p.title, main: p.mainKeyword, grams: shingles(bodyText(p)) };
  })
  : [];
// 발행이 끝나 지운 네이버 글 (scripts/clean-published.mjs 가 남긴 목록) — 메인 키워드·제목만 견준다 (2026-10-05)
const ARCHIVE = path.join('content', 'archive', 'published.tsv');
if (fs.existsSync(ARCHIVE)) {
  for (const line of fs.readFileSync(ARCHIVE, 'utf8').split('\n').slice(1)) {
    const [, channel, slug, main, title] = line.split('\t');
    if (channel === 'naver' && slug && !NAVER.some((n) => n.slug === slug)) NAVER.push({ slug, title: title || '', main: main || '', grams: new Set() });
  }
}

// 1) 서식 — 네이버 검사기
const fmt = spawnSync(process.execPath, [path.join(HERE, 'lint-post.mjs'), '--tistory', ...files], { stdio: 'inherit' });
let failed = fmt.status ? 1 : 0;

// 2) 네이버와 다른 글인가
console.log('\n── 네이버 글과 겹침 ──');
for (const file of files) {
  const raw = fs.readFileSync(file, 'utf8');
  const post = parsePost(raw);
  const source = (/^source_post:\s*(.+)$/m.exec(raw) || [])[1]?.trim();
  const errors = [];
  const notes = [];

  if (source && !NAVER.some((n) => n.slug === source)) errors.push(`source_post 원고가 없습니다: content/posts/${source}.md`);
  if (!source) notes.push('source_post(같은 묶음의 네이버 글)가 없습니다.');

  const mine = shingles(bodyText(post));
  let worst = { body: 0, bodyOf: '', title: 0, titleOf: '' };
  for (const n of NAVER) {
    if (n.main && post.mainKeyword && norm(n.main) === norm(post.mainKeyword)) {
      errors.push(`메인 키워드가 네이버 글과 같습니다 ("${n.main}", ${n.slug}). 다른 키워드를 잡습니다.`);
    } else if (n.main && norm(post.title).includes(norm(n.main))) {
      errors.push(`제목에 네이버 글의 메인 키워드 "${n.main}" 가 그대로 들어 있습니다 (${n.slug}).`);
    }
    const t = dice(post.title, n.title);
    if (t > worst.title) worst = { ...worst, title: t, titleOf: n.slug };
    let hit = 0;
    for (const g of mine) if (n.grams.has(g)) hit++;
    const b = mine.size ? hit / mine.size : 0;
    if (b > worst.body) worst = { ...worst, body: b, bodyOf: n.slug };
  }
  const pct = (x) => `${Math.round(x * 100)}%`;
  if (worst.title >= TITLE_SIM.err) errors.push(`제목이 네이버 글(${worst.titleOf})과 ${pct(worst.title)} 비슷합니다 (${pct(TITLE_SIM.err)} 미만).`);
  else if (worst.title >= TITLE_SIM.note) notes.push(`제목이 네이버 글(${worst.titleOf})과 ${pct(worst.title)} 비슷합니다.`);
  if (worst.body >= OVERLAP.err) errors.push(`본문이 네이버 글(${worst.bodyOf})과 ${pct(worst.body)} 겹칩니다 (${pct(OVERLAP.err)} 미만). 다른 내용으로 씁니다.`);
  else if (worst.body >= OVERLAP.note) notes.push(`본문이 네이버 글(${worst.bodyOf})과 ${pct(worst.body)} 겹칩니다.`);

  if (errors.length) failed = 1;
  console.log(`\n${errors.length ? '❌' : '✅'} ${file}`);
  console.log(`   네이버 대비 제목 ${pct(worst.title)} / 본문 ${pct(worst.body)}${source ? ` · 같은 묶음: ${source}` : ''}`);
  for (const e of errors) console.log(`   ✗ ${e}`);
  for (const n of notes) console.log(`   · ${n}`);
}

process.exit(failed);
