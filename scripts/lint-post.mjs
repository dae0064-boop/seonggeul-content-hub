#!/usr/bin/env node
/**
 * 원고 검사기 — 발행 여부를 정하는 유일한 게이트.
 *
 *   node scripts/lint-post.mjs content/posts/*.md
 *   node scripts/lint-post.mjs --full content/posts/<원고>.md   # 측정값 표까지
 *
 * 출력은 "행 번호 · 무엇 · 현재값 → 목표값" 한 줄로 짧게 낸다.
 * 원고 전문을 다시 읽지 않고 그 자리만 고칠 수 있어야 한다.
 */
import fs from 'node:fs';
import { parsePost, flatLines } from './lib/parse-post.mjs';

// 실제 발행글(119 안심콜) 실측치에 맞춰 잡은 기준
//   3,066자 / 평균 줄 19.8자 / 최장 29자 / 덩어리당 3.4줄
const MAX_LINE = 30;          // 한 줄 최대 글자수(공백 포함)
const AVG_LINE = [21, 27];    // 평균 줄 길이 권장 구간
const MIN_BLOCK_LINES = 2.2;  // 덩어리당 평균 줄 수 하한
const MIN_CHARS = 2300;       // 본문 최소 (공백 포함)
const MAX_CHARS = 2500;       // 본문 최대
const MIN_MAIN = 10;          // 메인 키워드 최소 등장 횟수
const MIN_SUB = 5;            // 서브 키워드 각각 최소 등장 횟수
const MIN_TAGS = 15;          // 해시태그 최소 개수
const TITLE_LEN = [20, 30];   // 제목 길이 권장 구간 (공백 포함)
const IMAGES = [8, 10];       // 이미지 자리 권장 장수
const MAX_EMPHASIS = 0.15;    // 강조(빨강+노랑) 줄 비율 상한

// 단정적·과장 표현 — 쓰면 안 된다 (memory/CLAUDE.md "금지 표현")
const BAN = ['무조건', '100%', '단언컨대', '절대로', '손실 없음', '공짜', '반드시'];
// 문맥에 따라 괜찮을 수 있어 경고만 한다 ("가장 먼저" 처럼 순서를 뜻하는 경우)
const WARN_WORDS = ['최고', '최저', '제일', '가장', '확실히'];

// 고정 인사말 — 모든 글이 이걸로 열고 닫는다
const OPEN = ['안녕하세요', '매일매일 좋은 날을 나누는 성글벙글입니다😊'];
const CLOSE_1 = '좋아요·공감과 이웃추가 부탁드려요💙';
const CLOSE_RE = /^이상 성글벙글의 .+ 포스팅이었습니다😎$/;
// 닫는 인사 앞에 오는 출처·기준일
const SOURCE_RE = /기준으로 (정리|작성)했습니다/;
// 번호를 붙인 소제목 — "1단계 ·", "2. ", "(3)" 처럼 시작하는 것
const NUMBERED_RE = /^[(\[]?\d+[)\].·]?\s*(단계)?[\s.·)]/;

const args = process.argv.slice(2);
const full = args.includes('--full');
const files = args.filter((a) => !a.startsWith('--'));
if (!files.length) {
  console.error('사용법: node scripts/lint-post.mjs [--full] <원고.md> [...]');
  process.exit(1);
}

let failed = 0;

for (const file of files) {
  const post = parsePost(fs.readFileSync(file, 'utf8'));
  const lines = flatLines(post).filter((l) => l.block !== 'image');
  const images = post.blocks.filter((b) => b.type === 'image');
  const texts = lines.map((l) => l.t);
  const chars = texts.join('').length;
  const body = texts.join('');
  const errors = [];
  const notes = [];
  const err = (where, msg) => errors.push({ where, msg });
  const note = (where, msg) => notes.push({ where, msg });

  // --- front matter
  if (!post.title) err('앞머리', 'title 이 없습니다');
  if (!post.mainKeyword) err('앞머리', 'main_keyword 가 없습니다');
  if (post.title && post.mainKeyword) {
    const t = post.title.replace(/\s/g, ''), k = post.mainKeyword.replace(/\s/g, '');
    if (!t.startsWith(k)) err('제목', `메인 키워드로 시작하지 않습니다: "${post.title}"`);
  }
  if (post.title && (post.title.length < TITLE_LEN[0] || post.title.length > TITLE_LEN[1]))
    note('제목', `${post.title.length}자 → ${TITLE_LEN[0]}~${TITLE_LEN[1]}자`);
  if (post.tags.length < MIN_TAGS)
    err('태그', `${post.tags.length}개 → ${MIN_TAGS}개 이상`);

  // --- 파서가 잡은 표기 오류
  for (const w of post.warnings) err(w.ln ? `${w.ln}행` : '본문', w.msg);

  // --- 줄 단위
  for (const l of lines) {
    if (l.t.length > MAX_LINE)
      err(`${l.ln}행`, `${l.t.length}자 → ${MAX_LINE}자 이하: "${l.t}"`);
    for (const w of BAN) if (l.t.includes(w)) err(`${l.ln}행`, `금지 표현 "${w}"`);
    for (const w of WARN_WORDS)
      if (l.t.includes(w)) note(`${l.ln}행`, `"${w}" — 우위를 단정하는 뜻이면 고치세요`);
  }

  // --- 소제목
  for (const q of post.blocks.filter((b) => b.type === 'quote')) {
    if (NUMBERED_RE.test(q.lines[0].t))
      err(`${q.ln}행`, `소제목에 번호를 붙이지 않습니다: "${q.lines[0].t}"`);
  }

  // --- 분량·키워드 (띄어쓰기 차이를 흡수하려고 양쪽 공백을 제거하고 센다)
  const flat = (post.title + body).replace(/\s/g, '');
  const countOf = (kw) => {
    const k = kw.replace(/\s/g, '');
    if (!k) return 0;
    let n = 0, i = 0;
    while ((i = flat.indexOf(k, i)) !== -1) { n++; i += k.length; }
    return n;
  };
  const mainN = countOf(post.mainKeyword);
  const subN = post.subKeywords.map((k) => [k, countOf(k)]);

  if (chars < MIN_CHARS) err('본문', `${chars}자 → ${MIN_CHARS}자 이상`);
  if (chars > MAX_CHARS) err('본문', `${chars}자 → ${MAX_CHARS}자 이하`);
  if (post.mainKeyword && mainN < MIN_MAIN)
    err('메인 키워드', `"${post.mainKeyword}" ${mainN}회 → ${MIN_MAIN}회 이상`);
  for (const [k, n] of subN)
    if (n < MIN_SUB) err('서브 키워드', `"${k}" ${n}회 → ${MIN_SUB}회 이상`);

  // --- 고정 인사말
  if (texts[0] !== OPEN[0] || texts[1] !== OPEN[1])
    err('1~2행', `오프닝이 고정 문구와 달라요 → "${OPEN[0]} / ${OPEN[1]}"`);
  if (texts[texts.length - 2] !== CLOSE_1 || !CLOSE_RE.test(texts[texts.length - 1]))
    err('마지막', `클로징이 고정 문구와 달라요 → "${CLOSE_1} / 이상 성글벙글의 OO 포스팅이었습니다😎"`);
  if (!SOURCE_RE.test(body))
    note('마지막', '닫는 인사 앞 출처·기준일이 없습니다 ("~를 (연월일) 기준으로 정리했습니다")');

  // --- 덩어리·가독성
  const textBlocks = post.blocks.filter((b) => b.type !== 'image');
  const perBlock = lines.length / textBlocks.length;
  if (perBlock < MIN_BLOCK_LINES)
    err('전체', `덩어리당 ${perBlock.toFixed(1)}줄 → ${MIN_BLOCK_LINES}줄 이상 (잘게 쪼개짐)`);
  const avgLine = texts.reduce((a, t) => a + t.length, 0) / texts.length;
  if (avgLine < AVG_LINE[0] || avgLine > AVG_LINE[1])
    note('전체', `평균 줄 길이 ${avgLine.toFixed(1)}자 → ${AVG_LINE[0]}~${AVG_LINE[1]}자`);

  // --- 이미지·강조
  if (images.length && (images.length < IMAGES[0] || images.length > IMAGES[1]))
    note('이미지', `${images.length}개 → ${IMAGES[0]}~${IMAGES[1]}개`);
  const red = lines.filter((l) => l.s === 'red');
  const yellow = lines.filter((l) => l.s === 'yellow');
  const ratio = (red.length + yellow.length) / lines.length;
  if (ratio > MAX_EMPHASIS)
    note('강조', `${(ratio * 100).toFixed(0)}% → ${MAX_EMPHASIS * 100}% 이하 (다 칠하면 강조가 안 보인다)`);
  if (red.length) {
    const idx = red.map((r) => lines.indexOf(r));
    const third = lines.length / 3;
    if (idx[0] > third || idx[idx.length - 1] < third * 2)
      note('강조', '빨간글씨는 글의 처음(문제)과 끝(결론)에 걸어 둔다');
  }

  // --- 출력
  if (full) {
    const max = Math.max(...texts.map((t) => t.length));
    console.log(`\n${file}`);
    console.log(`  제목        : ${post.title} (${post.title.length}자)`);
    console.log(`  본문        : ${chars}자 (기준 ${MIN_CHARS}~${MAX_CHARS})`);
    console.log(`  메인 키워드 : "${post.mainKeyword}" ${mainN}회 (최소 ${MIN_MAIN})`);
    if (subN.length) console.log(`  서브 키워드 : ${subN.map(([k, n]) => `${k} ${n}회`).join(' / ')}`);
    console.log(`  줄/덩어리   : ${lines.length}줄 / ${post.blocks.length}덩어리 (덩어리당 ${perBlock.toFixed(1)}줄)`);
    console.log(`  줄 길이     : 평균 ${avgLine.toFixed(1)}자 (권장 ${AVG_LINE[0]}~${AVG_LINE[1]}), 최장 ${max}자 (한도 ${MAX_LINE})`);
    console.log(`  인용구      : ${post.blocks.filter((b) => b.type === 'quote').length}개`);
    console.log(`  이미지 자리 : ${images.length}개`);
    console.log(`  강조        : 빨강 ${red.length}줄 / 노랑 ${yellow.length}줄`);
    console.log(`  태그        : ${post.tags.join(', ') || '(없음)'}`);
  } else {
    const head = errors.length ? `❌ ${errors.length}건` : '✅ 통과';
    console.log(`${file}  ${head}  ${chars}자 · 메인 ${mainN}회 · ${lines.length}줄 · 평균 ${avgLine.toFixed(1)}자 · 태그 ${post.tags.length}개`);
  }
  for (const e of errors) console.log(`   ${e.where}  ${e.msg}`);
  for (const n of notes) console.log(`   · ${n.where}  ${n.msg}`);
  if (errors.length) failed++;
}

process.exit(failed ? 1 : 0);
