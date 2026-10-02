#!/usr/bin/env node
/**
 * 티스토리 원고 검사기. 네이버 검사기(lint-post.mjs)와 기준이 다르다 — 채널이 다른 게임이다.
 *
 *   node scripts/lint-tistory.mjs content/tistory/*.md
 *
 * 근거
 *   standards/발행-운영기준.md  티스토리: 강제 줄바꿈 금지, 문단 2~3문장, H2·H3 구조, 표, 1,500자+
 *   memory/CLAUDE.md [8]         경어체(~합니다), Summary Box 필수, 유사문서 회피 최우선, 해시태그 10개
 *
 * 유사문서 검사 (2026-10-02 사용자 지시: 티스토리는 네이버와 다른 내용·다른 제목으로 간다)
 *   content/posts/ 의 네이버 원고 전부와 견준다.
 *   - 메인 키워드: 네이버 글의 메인 키워드와 같거나, 제목에 그 키워드가 그대로 들어 있으면 불통과
 *   - 제목: 글자 2개 조각 유사도(Dice) 0.4 이상이면 불통과
 *   - 본문: 10글자 조각이 15% 이상 겹치면 불통과
 *   source_post 는 같은 묶음(클러스터)의 네이버 글을 적는 칸일 뿐, 그 글을 고쳐 쓰라는 뜻이 아니다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseTistory, blockTexts, plain } from './lib/parse-tistory.mjs';
import { parsePost, flatLines } from './lib/parse-post.mjs';

const MIN_CHARS = { 롱폼: 2500, 가이드: 1500, 비교: 1500, '': 1500 }; // 공백 제외
const MIN_H2 = 3;
const MAX_TAGS = 10;
const MAX_SENTENCES = 5;      // 문단당. 넘으면 오류 (6줄 이상 문단 금지)
const SOFT_SENTENCES = 3;     // 넘으면 알림 (권장 2~3문장)
const HAEYO_MAX = 0.1;        // 평서문 중 ~요. 로 끝나는 비율 상한 (경어체로 바꾼다)
const OVERLAP = { err: 0.15, note: 0.08 }; // 네이버 글과 겹치는 본문 10글자 조각 비율
const TITLE_SIM = { err: 0.4, note: 0.25 }; // 네이버 제목과의 글자 2개 조각 유사도(Dice)
const MIN_MAIN = 4;           // 구글은 반복을 세지 않는다. 너무 적은 것만 잡는다

const BAN = ['무조건', '100%', '단언컨대', '절대로', '손실 없음', '공짜'];
// 네이버 전용 표기가 섞여 들어오면 안 된다
const NAVER_ONLY = [
  [/\[\/?(빨간글씨|파란글씨|노란배경)\]/, '네이버 강조 태그'],
  [/인용구\(소제목\)/, '네이버 인용구 표기'],
  [/매일매일 좋은 날을 나누는/, '네이버 고정 인사말'],
  [/이웃추가|서이추|좋아요·공감/, '네이버 이웃·공감 문구'],
];

const files = process.argv.slice(2);
if (!files.length) {
  console.error('사용법: node scripts/lint-tistory.mjs <원고.md> [...]');
  process.exit(1);
}

const count = (text, kw) => (kw ? text.split(kw).length - 1 : 0);
const norm = (s) => s.replace(/[\s.,!?·~'"“”‘’()\[\]:;\-–—*|#>]/g, '');
const sentences = (s) => s.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);

function dice(a, b) {
  const A = shingles(norm(a), 2), B = shingles(norm(b), 2);
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const x of A) if (B.has(x)) hit++;
  return (2 * hit) / (A.size + B.size);
}

// 네이버 원고 전부 (한 번만 읽는다)
const NAVER = fs.existsSync(path.join('content', 'posts'))
  ? fs.readdirSync(path.join('content', 'posts')).filter((f) => f.endsWith('.md')).map((f) => {
    const p = parsePost(fs.readFileSync(path.join('content', 'posts', f), 'utf8'));
    const text = norm(flatLines(p).filter((l) => l.block !== 'image').map((l) => l.t).join(''));
    return { slug: f.replace(/\.md$/, ''), title: p.title, main: p.mainKeyword, grams: shingles(text) };
  })
  : [];

function shingles(s, n = 10) {
  const set = new Set();
  for (let i = 0; i + n <= s.length; i++) set.add(s.slice(i, i + n));
  return set;
}

let failed = 0;
for (const file of files) {
  const raw = fs.readFileSync(file, 'utf8');
  const post = parseTistory(raw);
  const texts = blockTexts(post);
  const all = texts.join(' ');
  const charsNS = all.replace(/\s/g, '').length;
  const errors = [...post.warnings];
  const notes = [];

  // 앞머리
  if (!post.title) errors.push('title 이 없습니다.');
  if (!post.mainKeyword) errors.push('main_keyword 가 없습니다.');
  else if (!post.title.includes(post.mainKeyword)) errors.push(`제목에 메인 키워드("${post.mainKeyword}")가 없습니다.`);
  else if (!post.title.startsWith(post.mainKeyword)) notes.push('메인 키워드를 제목 앞쪽에 두면 검색결과에서 잘리지 않습니다 (권장).');
  if (post.title.length > 40) notes.push(`제목이 깁니다 (${post.title.length}자).`);
  if (post.type && !(post.type in MIN_CHARS)) errors.push(`type 은 롱폼·가이드·비교 중 하나입니다: "${post.type}"`);
  if (!post.tags.length) errors.push('tags 가 없습니다.');
  if (post.tags.length > MAX_TAGS) errors.push(`태그는 ${MAX_TAGS}개 이하입니다 (${post.tags.length}개).`);

  // 분량
  const min = MIN_CHARS[post.type] ?? 1500;
  if (charsNS < min) errors.push(`본문이 짧습니다: 공백 제외 ${charsNS}자 (${post.type || '기본'} 기준 ${min}자 이상).`);

  // 구조
  const by = (t) => post.blocks.filter((b) => b.type === t);
  if (by('h2').length < MIN_H2) errors.push(`H2(## 큰 제목)가 ${by('h2').length}개입니다. ${MIN_H2}개 이상으로 나눕니다.`);
  if (!by('table').length) errors.push('표가 없습니다. 비교·준비물·기간을 표로 하나 이상 정리합니다.');
  if (!by('summary').length) errors.push('Summary Box(:::summary)가 없습니다. 글 맨 앞에 핵심 요약을 둡니다.');
  else if (post.blocks.findIndex((b) => b.type === 'summary') > 1) notes.push('Summary Box 는 글 맨 앞(첫 문단 앞뒤)에 두는 게 좋습니다.');
  if (!post.blocks.some((b) => b.type === 'h2' && /Q&A|자주 묻는|FAQ/i.test(b.text))) notes.push('자주 묻는 질문(H2) 섹션이 없습니다.');
  if (!/출처|기준으로 정리/.test(all)) errors.push('출처와 기준일이 없습니다 ("…을 YYYY년 M월 D일 기준으로 정리했습니다").');
  if (!/\]\(https?:/.test(raw)) notes.push('본문에 링크가 없습니다. 1차 출처 링크나 관련 글 내부링크를 넣으면 좋습니다.');

  // 문단: 강제 줄바꿈·길이
  const wrapped = by('p').filter((b) => b.wrapped);
  if (wrapped.length) errors.push(`문단 ${wrapped.length}곳에서 줄을 바꿨습니다 — 티스토리는 강제 줄바꿈을 하지 않습니다. 첫 곳: "${plain(wrapped[0].text).slice(0, 24)}…"`);
  for (const b of by('p')) {
    const head = plain(b.text).slice(0, 24);
    const n = sentences(plain(b.text)).length;
    if (n > MAX_SENTENCES) errors.push(`문단이 깁니다 (${n}문장): "${head}…"`);
    else if (n > SOFT_SENTENCES) notes.push(`문단 ${n}문장 — 2~3문장 권장: "${head}…"`);
  }

  // 경어체: 평서문(마침표로 끝나는 문장)만 본다. 질문(~나요?)은 그대로 둔다
  const decl = by('p').flatMap((b) => sentences(plain(b.text))).filter((s) => s.endsWith('.'));
  const haeyo = decl.filter((s) => /요\.$/.test(s));
  if (decl.length && haeyo.length / decl.length > HAEYO_MAX) {
    errors.push(`~요 체 문장이 ${haeyo.length}/${decl.length}개입니다. 티스토리는 ~합니다 체로 씁니다. 예: "${haeyo[0].slice(-30)}"`);
  }

  // 금지어·네이버 표기
  for (const w of BAN) if (all.includes(w)) errors.push(`금지 표현: "${w}"`);
  for (const [re, what] of NAVER_ONLY) if (re.test(raw)) errors.push(`${what} 표기가 남아 있습니다 — 티스토리용으로 바꿉니다.`);

  // 키워드
  const main = count(all, post.mainKeyword);
  if (post.mainKeyword && main < MIN_MAIN) errors.push(`메인 키워드 "${post.mainKeyword}" ${main}회 (${MIN_MAIN}회 이상).`);
  const subs = post.subKeywords.map((k) => `${k} ${count(all, k)}`).join(', ');

  // 유사문서: 네이버 글 전부와 견준다 — 키워드·제목·본문이 모두 달라야 한다
  if (post.sourcePost && !NAVER.some((n) => n.slug === post.sourcePost)) errors.push(`source_post 원고가 없습니다: content/posts/${post.sourcePost}.md`);
  const mine = shingles(norm(all));
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

  const ok = !errors.length;
  if (!ok) failed++;
  console.log(`\n${ok ? '✅' : '❌'} ${file}`);
  console.log(`   ${post.type || '유형 미지정'} · 공백 제외 ${charsNS}자 · H2 ${by('h2').length} · H3 ${by('h3').length} · 표 ${by('table').length} · 태그 ${post.tags.length}`);
  console.log(`   키워드: ${post.mainKeyword} ${main}${subs ? ` / ${subs}` : ''} · 경어체 ${decl.length - haeyo.length}/${decl.length}`
    + ` · 네이버 대비 제목 ${pct(worst.title)} / 본문 ${pct(worst.body)}`);
  for (const e of errors) console.log(`   ✗ ${e}`);
  for (const n of notes) console.log(`   · ${n}`);
}

process.exit(failed ? 1 : 0);
