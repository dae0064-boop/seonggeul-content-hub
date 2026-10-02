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
const AVG_LINE = [21, 27];    // 평균 줄 길이 권장 구간
const MIN_BLOCK_LINES = 2.2;  // 덩어리당 평균 줄 수 하한
const MAX_BLOCK = 4;          // 한 덩어리 최대 줄 수. 넘으면 2·2·3 이나 4·3 으로 끊는다 (사용자 지시 2026-10-01)
const MIN_CHARS = 2300;       // 본문 최소 (공백 포함) — 2026-10-01 발행분까지
const MAX_CHARS = 2500;       // 본문 최대
// 2026-10-02 발행분부터 (사용자 지시 10/1): 공백 제외로 세고, 제목에 서브 키워드를 넣는다
const NEW_RULES_FROM = '2026-10-02';
const NS_CHARS = [2100, 2300]; // 본문 공백 제외 글자수
const TITLE_KW = [0.5, 0.6];   // 제목에서 메인·서브 키워드가 차지하는 비율 (공백 제외)
const MIN_MAIN = 10;          // 메인 키워드 최소 등장 횟수
const MIN_SUB = 5;            // 서브 키워드 각각 최소 등장 횟수
const MIN_TAGS = 15;          // 해시태그 최소 개수 (주제 태그)
const FIXED_TAGS = ['서이추', '이웃추가', '서이추환영']; // 모든 글 끝에 붙이는 태그 (사용자 지시 2026-10-01)
const MARKS = { red: [3, 5], blue: [6, 10], yellow: [3, 5] }; // 강조 색별 권장 개수 (한 편 기준)

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
  const charsNS = texts.join('').replace(/\s/g, '').length;
  const dated = (/(\d{4}-\d{2}-\d{2})/.exec(file.split(/[\\/]/).pop()) || [])[1] || '9999-99-99';
  const newRules = dated >= NEW_RULES_FROM;
  const errors = [];
  const notes = [];

  if (!post.title) errors.push('title 이 없습니다.');
  if (!post.mainKeyword) errors.push('main_keyword 가 없습니다.');
  if (post.title.length > (newRules ? 40 : 30)) notes.push(`제목이 깁니다 (${post.title.length}자). 모바일에서 잘릴 수 있습니다.`);


  lines.forEach((l, i) => {
    if (l.t.length > MAX_LINE) errors.push(`${MAX_LINE}자 초과 (${l.t.length}자): "${l.t}"`);
  });

  const body = texts.join('');
  for (const w of BAN) if (body.includes(w)) errors.push(`단정적 표현 사용: "${w}"`);
  for (const w of WARN_WORDS) if (body.includes(w)) notes.push(`"${w}" — 우위를 단정하는 뜻이면 고치세요.`);
  for (const w of post.warnings) errors.push(w);

  // Q&A 형식 (2026-10-01 사용자 지시): 인용구 소제목 아래 "Q1: 질문" / "A1: 답변" 3쌍
  {
    const all = post.blocks.flatMap((b) => b.lines.map((l) => l.t));
    const qs = all.filter((t) => /^Q\d+:/.test(t)).length;
    const as = all.filter((t) => /^A\d+:/.test(t)).length;
    if (qs !== 3 || as !== 3) errors.push(`Q&A 는 "Q1: 질문" / "A1: 답변" 형식으로 3쌍이어야 합니다 (지금 Q ${qs}개 / A ${as}개)`);
  }

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

  if (newRules) {
    if (charsNS < NS_CHARS[0]) errors.push(`본문이 짧습니다: 공백 제외 ${charsNS}자 (최소 ${NS_CHARS[0]})`);
    if (charsNS > NS_CHARS[1]) errors.push(`본문이 깁니다: 공백 제외 ${charsNS}자 (최대 ${NS_CHARS[1]})`);
  } else {
    if (chars < MIN_CHARS) errors.push(`본문이 짧습니다: ${chars}자 (최소 ${MIN_CHARS})`);
    if (chars > MAX_CHARS) errors.push(`본문이 깁니다: ${chars}자 (최대 ${MAX_CHARS})`);
  }
  if (post.mainKeyword && mainN < MIN_MAIN)
    errors.push(`메인 키워드 "${post.mainKeyword}" ${mainN}회 — ${MIN_MAIN}회 이상 필요`);
  for (const [k, n] of subN)
    if (n < MIN_SUB) errors.push(`서브 키워드 "${k}" ${n}회 — ${MIN_SUB}회 이상 필요`);

  // 제목은 메인 키워드로 시작해야 한다 (타깃 키워드를 첫 어절에)
  if (post.mainKeyword) {
    const t = post.title.replace(/\s/g, ''), k = post.mainKeyword.replace(/\s/g, '');
    if (!t.startsWith(k)) errors.push(`제목이 메인 키워드로 시작하지 않습니다: "${post.title}"`);
  }
  // 제목 키워드 비율: 제목(공백 제외) 글자 중 메인·서브 키워드가 덮는 비율
  let titleKw = null;
  {
    const t = post.title.replace(/\s/g, '');
    const cover = new Array(t.length).fill(false);
    for (const kw of [post.mainKeyword, ...post.subKeywords]) {
      const k = (kw || '').replace(/\s/g, ''); if (!k) continue;
      for (let i = t.indexOf(k); i !== -1; i = t.indexOf(k, i + 1)) for (let j = i; j < i + k.length; j++) cover[j] = true;
    }
    const subsIn = post.subKeywords.filter((kw) => t.includes(kw.replace(/\s/g, '')));
    titleKw = { ratio: t.length ? cover.filter(Boolean).length / t.length : 0, subs: subsIn };
    if (newRules) {
      if (!subsIn.length) errors.push(`제목에 서브 키워드가 없습니다 — 1~2개 넣으세요: "${post.title}"`);
      if (titleKw.ratio < TITLE_KW[0] || titleKw.ratio > TITLE_KW[1])
        notes.push(`제목 키워드 비율 ${Math.round(titleKw.ratio * 100)}% — 권장 ${TITLE_KW[0] * 100}~${TITLE_KW[1] * 100}%`);
    }
  }
  // 예약발행 시각: 파일 날짜와 같은 날, 10분 단위 (draft-day -Reserve 가 이 값으로 예약한다)
  if (post.publishAt) {
    const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2})$/.exec(post.publishAt);
    if (!m) errors.push(`publish_at 형식이 잘못됐습니다: "${post.publishAt}" (예: 2026-10-02 09:00)`);
    else {
      if (m[1] !== dated) errors.push(`publish_at 날짜(${m[1]})가 파일 날짜(${dated})와 다릅니다`);
      if (+m[3] % 10) errors.push(`publish_at 은 10분 단위여야 합니다 (네이버 예약): ${post.publishAt}`);
    }
  }
  const topicTags = post.tags.filter((t) => !FIXED_TAGS.includes(t));
  if (topicTags.length < MIN_TAGS) errors.push(`주제 해시태그 ${topicTags.length}개 — ${MIN_TAGS}개 이상 필요`);
  const noFixed = FIXED_TAGS.filter((t) => !post.tags.includes(t));
  if (noFixed.length) errors.push(`고정 해시태그 빠짐: ${noFixed.join(', ')} — 주제 태그 뒤에 붙이세요`);

  // standards/이미지-기준.md — 한 글에 8장 (대표 1 + 본문 7)
  if (images.length && images.length !== 8)
    notes.push(`이미지 자리 ${images.length}개 — 8개 기준입니다.`);

  // 아직 채우지 않은 자리 (matjip-draft.mjs 가 남긴다). 이미지 설명 줄까지 본다
  {
    const raw = post.blocks.flatMap((b) => b.lines.map((l) => l.t)).join('\n');
    const holes = raw.match(/\[채우기:[^\]]*\]/g) || [];
    if (holes.length) errors.push(`채우지 않은 자리 ${holes.length}곳: ${holes.slice(0, 3).join(' / ')}${holes.length > 3 ? ' …' : ''}`);
  }

  // 맛집 후기 (category: 맛집) — CLAUDE.md "맛집 원고"
  if (post.category === '맛집') {
    const m = post.meta || {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(m.visited || '')) errors.push('맛집 글은 visited: 방문일(YYYY-MM-DD)이 필요합니다');
    else if (m.visited > dated) errors.push(`방문일(${m.visited})이 발행일(${dated})보다 늦습니다`);
    if (!m.sponsored) errors.push('맛집 글은 sponsored: 를 적어야 합니다 (없음 / 제공받은 내용)');
    else if (m.sponsored !== '없음') {
      // 공정위 추천·보증 심사지침 — 대가를 받았으면 첫 소제목 전에 밝힌다
      const head = [];
      for (const b of post.blocks) { if (b.type === 'quote') break; if (b.type === 'p') head.push(...b.lines.map((l) => l.t)); }
      if (!/제공받|협찬|원고료|광고/.test(head.join(''))) errors.push('협찬 글인데 첫 소제목 전에 "제공받아 작성" 같은 표기가 없습니다');
      if (post.tags.includes('내돈내산')) errors.push('협찬 글에 #내돈내산 태그가 있습니다');
    }
    for (const w of ['주소', '영업시간']) if (!body.includes(w)) errors.push(`맛집 글에 ${w} 정보가 없습니다`);
    if (!body.includes('직접 방문')) errors.push('출처 줄에 "직접 방문한 내용" 과 방문일을 적으세요');
    for (const w of ['인생맛집', '역대급', '존맛', 'JMT', '미쳤', '꼭 가야']) if (body.includes(w)) notes.push(`"${w}" — 과장 표현입니다. 메모에 적은 느낌 그대로 쓰세요.`);
  }

  // 맛집 정보글 (category: 맛집정보) — 가 보지 않고 공개 정보로 정리한 "방문 전 정보". CLAUDE.md "맛집 정보글"
  if (post.category === '맛집정보') {
    const m = post.meta || {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(m.checked || '')) errors.push('맛집 정보글은 checked: 정보 확인일(YYYY-MM-DD)이 필요합니다');
    else if (m.checked > dated) errors.push(`정보 확인일(${m.checked})이 발행일(${dated})보다 늦습니다`);
    if (!m.sources) errors.push('맛집 정보글은 sources: 확인한 출처(가게 공식 사이트·SNS·지도 URL)를 적어야 합니다');
    if (!m.sponsored) errors.push('맛집 정보글은 sponsored: 를 적어야 합니다 (없음 / 제공받은 내용)');
    else if (m.sponsored !== '없음') {
      const head = [];
      for (const b of post.blocks) { if (b.type === 'quote') break; if (b.type === 'p') head.push(...b.lines.map((l) => l.t)); }
      if (!/제공받|협찬|원고료|광고/.test(head.join(''))) errors.push('협찬 글인데 첫 소제목 전에 "제공받아 작성" 같은 표기가 없습니다');
    }
    if (post.tags.includes('내돈내산')) errors.push('가 보지 않은 글에 #내돈내산 태그가 있습니다');
    for (const w of ['주소', '영업시간']) if (!body.includes(w)) errors.push(`맛집 정보글에 ${w} 정보가 없습니다`);
    if (!body.includes('방문 전')) errors.push('"방문 전에 가게에 확인해 보세요" 안내가 없습니다 (공개 정보는 바뀔 수 있다)');
    if (body.includes('직접 방문')) errors.push('맛집 정보글에 "직접 방문" 이 있습니다 — 가 보지 않은 글입니다');
    // 다녀온 것처럼 읽히는 말 — 가 보지 않은 글에 쓰면 독자를 속인다
    for (const w of ['다녀왔', '다녀온', '먹어 보니', '먹어보니', '먹어 봤', '먹어봤', '맛있었', '맛있더라', '방문했', '가 봤', '가봤', '웨이팅했', '기다렸'])
      if (body.includes(w)) errors.push(`"${w}" — 다녀온 것처럼 읽힙니다. 가게가 안내하는 내용으로 바꾸세요`);
    for (const w of ['인생맛집', '역대급', '존맛', 'JMT', '미쳤', '꼭 가야']) if (body.includes(w)) notes.push(`"${w}" — 과장 표현입니다.`);
  }

  // 고정 인사말
  if (texts[0] !== OPEN[0] || texts[1] !== OPEN[1])
    errors.push(`오프닝이 고정 문구와 다릅니다. "${OPEN[0]} / ${OPEN[1]}" 로 시작해야 합니다.`);
  if (texts[texts.length - 2] !== CLOSE_1 || !CLOSE_RE.test(texts[texts.length - 1]))
    errors.push(`클로징이 고정 문구와 다릅니다. "${CLOSE_1} / 이상 성글벙글의 OO 포스팅이었습니다😎" 로 끝나야 합니다.`);

  // 덩어리를 너무 잘게 쪼개면 글이 툭툭 끊긴다
  const textBlocks = post.blocks.filter((b) => b.type !== 'image');
  const perBlock = lines.length / textBlocks.length;
  for (const b of textBlocks) if (b.lines.length > MAX_BLOCK)
    errors.push(`덩어리가 ${b.lines.length}줄 — ${MAX_BLOCK}줄 이하로 끊으세요 (2·2·3, 4·3 처럼): "${b.lines[0].t}"`);
  if (perBlock < MIN_BLOCK_LINES)
    errors.push(`덩어리가 잘게 쪼개졌습니다: 덩어리당 ${perBlock.toFixed(1)}줄 (최소 ${MIN_BLOCK_LINES})`);
  const avgLine = texts.reduce((a, t) => a + t.length, 0) / texts.length;
  if (avgLine < AVG_LINE[0] || avgLine > AVG_LINE[1])
    notes.push(`평균 줄 길이 ${avgLine.toFixed(1)}자 — 권장 ${AVG_LINE[0]}~${AVG_LINE[1]}자`);

  const quotes = post.blocks.filter((b) => b.type === 'quote').length;
  // 강조 색 개수 (2026-10-01 사용자 지시): 색마다 역할이 있다
  //   빨강 = 결론·주의(처음과 끝), 파랑 = 날짜·나이·기관명·숫자 같은 사실, 노랑 배경 = 꼭 기억할 한 문장
  const marks = post.marks || { red: 0, yellow: 0, blue: 0 };
  const { red, yellow, blue } = marks;
  for (const [name, n, [lo, hi]] of [['빨간글씨', red, MARKS.red], ['파란글씨', blue, MARKS.blue], ['노란배경', yellow, MARKS.yellow]]) {
    if (n < lo) errors.push(`${name} ${n}곳 — ${lo}곳 이상 필요 (권장 ${lo}~${hi})`);
    else if (n > hi) notes.push(`${name} ${n}곳 — 권장 ${lo}~${hi}곳보다 많아요. 다 칠하면 강조가 안 보입니다`);
  }
  const avg = (texts.reduce((a, t) => a + t.length, 0) / texts.length).toFixed(1);
  const max = Math.max(...texts.map((t) => t.length));

  console.log(`\n${file}`);
  console.log(`  제목        : ${post.title} (${post.title.length}자)`);
  if (newRules) {
    const range = charsNS < NS_CHARS[0] ? '짧음' : charsNS > NS_CHARS[1] ? '김' : 'OK';
    console.log(`  본문        : 공백 제외 ${charsNS}자 (기준 ${NS_CHARS[0]}~${NS_CHARS[1]}) ${range} · 공백 포함 ${chars}자`);
    console.log(`  제목 키워드 : ${Math.round(titleKw.ratio * 100)}% (권장 ${TITLE_KW[0] * 100}~${TITLE_KW[1] * 100}%) · 서브 ${titleKw.subs.join(', ') || '없음'}`);
  } else {
    const range = chars < MIN_CHARS ? '짧음' : chars > MAX_CHARS ? '김' : 'OK';
    console.log(`  본문        : ${chars}자 (기준 ${MIN_CHARS}~${MAX_CHARS}) ${range} · 공백 제외 ${charsNS}자`);
  }
  console.log(`  메인 키워드 : "${post.mainKeyword}" ${mainN}회 (최소 ${MIN_MAIN})`);
  if (subN.length) console.log(`  서브 키워드 : ${subN.map(([k, n]) => `${k} ${n}회`).join(' / ')}`);
  console.log(`  줄/덩어리   : ${lines.length}줄 / ${post.blocks.length}덩어리`);
  console.log(`  줄 길이     : 평균 ${avg}자 (권장 ${AVG_LINE[0]}~${AVG_LINE[1]}), 최장 ${max}자 (한도 ${MAX_LINE})`);
  console.log(`  덩어리당    : ${perBlock.toFixed(1)}줄 (최소 ${MIN_BLOCK_LINES})`);
  console.log(`  인용구      : ${quotes}개`);
  console.log(`  이미지 자리 : ${images.length}개`);
  console.log(`  강조        : 빨강 ${red}곳 / 파랑 ${blue}곳 / 노랑 ${yellow}곳`);
  console.log(`  태그        : ${post.tags.join(', ') || '(없음)'}`);
  if (post.publishAt) console.log(`  예약발행    : ${post.publishAt}`);

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
