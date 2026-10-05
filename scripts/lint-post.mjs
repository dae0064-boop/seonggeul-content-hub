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
// 소제목 바로 아래 덩어리는 3줄까지 (사용자 지시 2026-10-02). 발행하면 소제목과 첫 덩어리가 빈 줄 없이
// 붙어서, 소제목 + 4줄이 5줄짜리 덩어리로 보인다. 넘으면 문장이 끝나는 자리에서 1·3 이나 2·2 로 끊는다.
const MAX_AFTER_QUOTE = 3;
const AFTER_QUOTE_FROM = '2026-10-02';
// 그림은 소제목(인용구) 바로 아래에만 둔다 (사용자 지시 2026-10-03 — 소제목 → 그림 → 글, 일정한 패턴이 깔끔하다).
// 대표사진(이미지 1)은 도입 뒤 첫 소제목 앞이라 뺀다. 소제목마다 그림이 있어야 하는 것은 아니다.
const IMAGE_UNDER_QUOTE_FROM = '2026-10-05';
const MAX_QUOTES = 9; // 2026-10-05 원고부터 (2026-10-03 사용자 지시)
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

// 티스토리 원고도 네이버와 같은 서식 기준으로 본다 (2026-10-02 사용자 지시 — 줄바꿈·색·인용구·해요체·인사말 동일).
// 다른 점은 둘: 닫는 인사의 '이웃추가' 대신 '구독'(티스토리에는 이웃이 없다), 고정 태그(서이추 등)를 붙이지 않는다.
// --tistory 를 붙이거나 content/tistory/ 아래 파일이면 티스토리로 본다. 네이버와 겹침 검사는 lint-tistory.mjs 가 한다.
const TISTORY_CLOSE_1 = '좋아요·공감과 구독 부탁드려요💙';
const argv = process.argv.slice(2);
const forceTistory = argv.includes('--tistory');
const files = argv.filter((a) => a !== '--tistory');
if (!files.length) {
  console.error('사용법: node scripts/lint-post.mjs [--tistory] <원고.md> [...]');
  process.exit(1);
}

let failed = 0;

// 메인 키워드 월간 검색량 (2026-10-03 사용자 승인 — 키워드를 실제 검색량으로 고른다).
// content/calendar/title-keywords/*.txt (PC 가 조회해 Drive 로 올린 결과를 Routine 이 옮겨 둔 것)에서 찾는다.
// 2026-10-06 원고부터: 100 미만이면 불통과, 자료가 없으면 알림.
const VOLUME_FROM = '2026-10-06';
const MIN_VOLUME = 100;
let VOLUMES = null;
function volumeOf(kw) {
  if (!VOLUMES) {
    VOLUMES = new Map();
    const dir = 'content/calendar/title-keywords';
    for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter((x) => x.endsWith('.txt')) : []) {
      for (const line of fs.readFileSync(`${dir}/${f}`, 'utf8').split(/\r?\n/)) {
        const m = /^\s*(\d+)\s+(.+?)\s+\[/.exec(line);
        if (!m) continue;
        const k = m[2].replace(/\s+/g, ''), v = +m[1];
        if (!VOLUMES.has(k) || VOLUMES.get(k) < v) VOLUMES.set(k, v);
      }
    }
  }
  return VOLUMES.get(kw.replace(/\s+/g, ''));
}

// 2026-10-03 원고부터 카테고리를 검사한다. 제목·메인 키워드로 정한다.
// 보험 → 생활보장 (반드시), 음식·카페·맛집 말이 있으면 → 맛집 (반드시), 그 밖은 생활정보 (요리·제철 글은 맛집도 허용).
// 글 모양 돌려 쓰기 (2026-10-02 사용자 승인 — 하루 5편이 모두 같은 틀이면 "찍어 낸 글"로 보인다).
// 2026-10-05 원고부터 프런트매터 format 이 필요하고, 같은 날 원고끼리 같은 모양은 2편까지, 모양은 3가지 이상.
const FORMAT_FROM = '2026-10-05';
const FORMATS = {
  기본: { qa: [3], need: [] },
  순서형: { qa: [0, 3], need: [[/^[①②③④⑤⑥⑦⑧]/, 4, '①②③④ 로 시작하는 단계 줄']] },
  체크리스트형: { qa: [0, 3], need: [[/^✔/, 5, '✔ 로 시작하는 확인 줄']] },
  비교형: { qa: [0, 3], need: [[/^⭕/, 2, '⭕ 로 시작하는 줄 (되는 경우)'], [/^❌/, 2, '❌ 로 시작하는 줄 (안 되는 경우)']] },
  질문형: { qa: [5], need: [] },
};
const CATEGORY_FROM = '2026-10-03';
function allowedCategories(post) {
  const t = `${post.title} ${post.mainKeyword}`;
  if (/보험/.test(t)) return ['생활보장'];
  if (/맛집|카페|식당|음식|메뉴|디저트|빵집|브런치/.test(t)) return ['맛집·카페'];
  return ['생활정보', '맛집·카페'];
}
// 블로그 보험 글은 광고 심의가 필요 없는 비상업 정보글만 (2026-10-02 사용자 결정). 모든 블로그 원고에 적용한다.
const COMMERCIAL = [
  [/상담\s*(해\s*드|신청|문의|가능|예약)|무료\s*(상담|분석|진단|점검)|보험\s*(상담|점검)\s*받/, '상담 권유'],
  [/연락\s*(주세요|주시면|부탁|드릴게)|문의\s*(주세요|주시면|남겨)|카톡|카카오톡|오픈\s*채팅|DM|쪽지\s*(주|보내)|댓글\s*(남겨|주시)면\s*(알려|상담|연락|보내)/, '연락 권유'],
  [/가입\s*(하세요|해\s*보세요|을\s*권|을\s*추천|하시길)|갈아타(세요|시길|는\s*게\s*좋)|해지\s*(하세요|하시길)/, '가입·해지 권유'],
  [/(삼성|한화|교보|흥국|동양|미래에셋|신한|KB|케이비|NH|농협|DB|디비|현대|메리츠|롯데|라이나|AIA|메트라이프|처브|ABL|푸본|KDB|하나|IBK|DGB|BNK|MG|캐롯)\s*(생명|손해|손보|화재|해상|라이프|보험)/, '보험사 이름'],
  [/보험료[^\n]{0,12}\d[\d,]*\s*(원|만\s*원)|월\s*\d[\d,]*\s*원(대|짜리)?\s*(보험|으로\s*가입)/, '보험료 금액'],
  [/설계사(입니다|예요|로\s*일하|로\s*활동)|010-?\d{3,4}-?\d{4}/, '설계사 신분·연락처'],
];
for (const file of files) {
  const post = parsePost(fs.readFileSync(file, 'utf8'));
  const lines = flatLines(post).filter((l) => l.block !== 'image');
  const images = post.blocks.filter((b) => b.type === 'image');
  const texts = lines.map((l) => l.t);
  const chars = texts.join('').length;
  const charsNS = texts.join('').replace(/\s/g, '').length;
  const dated = (/(\d{4}-\d{2}-\d{2})/.exec(file.split(/[\\/]/).pop()) || [])[1] || '9999-99-99';
  const newRules = dated >= NEW_RULES_FROM;
  const tistory = forceTistory || /(^|[\\/])content[\\/]tistory[\\/]/.test(file);
  const close1 = tistory ? TISTORY_CLOSE_1 : CLOSE_1;
  const errors = [];
  const notes = [];

  if (!post.title) errors.push('title 이 없습니다.');
  if (!post.mainKeyword) errors.push('main_keyword 가 없습니다.');
  // 티스토리 카테고리 (2026-10-05 사용자 지시): 생활보장·생활정보 두 개만. 보험 → 생활보장, 나머지 → 생활정보
  if (tistory && dated >= '2026-10-06') {
    const want = /보험/.test(`${post.title} ${post.mainKeyword}`) ? '생활보장' : '생활정보';
    if (post.category !== want) errors.push(`티스토리 category 는 "${want}" 여야 합니다 (지금 "${post.category || '없음'}") — 티스토리는 생활보장·생활정보 두 개만 씁니다`);
  }
  // 네이버 카테고리 (2026-10-02 사용자 지시): 보험 → 생활보장, 음식·카페·맛집 → 맛집, 나머지는 생활정보.
  if (!tistory && dated >= CATEGORY_FROM) {
    const ok = allowedCategories(post);
    if (!ok.includes(post.category)) errors.push(`category 는 "${ok.join('" 또는 "')}" 여야 합니다 (지금 "${post.category || '없음'}") — 보험은 생활보장, 음식·카페·맛집은 맛집·카페, 나머지는 생활정보`);
    const all = `${post.title}\n${texts.join('\n')}`;
    for (const [re, name] of COMMERCIAL) {
      const m = re.exec(all);
      if (m) errors.push(`상업적으로 보이는 표현(${name}): "${m[0]}" — 블로그 글은 심의가 필요 없는 정보글로만 씁니다`);
    }
  }
  // 운전자보험 글 필수 문장 (2026-10-05 사용자 지시) — 네이버·티스토리 모두, 줄바꿈·띄어쓰기는 상관없이 글자 그대로
  {
    const NOTE = '음주, 무면허, 도주 사고는 보상에서 제외됩니다.';
    const all = `${post.title} ${post.mainKeyword}\n${texts.join('\n')}`;
    const plain = texts.join('').replace(/\[\/?(빨간글씨|파란글씨|노란배경)\]/g, '').replace(/\s/g, '');
    if (/운전자\s*보험/.test(all) && !plain.includes(NOTE.replace(/\s/g, ''))) errors.push(`운전자보험 글에는 "${NOTE}" 를 글자 그대로 넣습니다`);
  }
  if (!tistory && dated >= VOLUME_FROM && post.mainKeyword) {
    const v = volumeOf(post.mainKeyword);
    if (v == null) notes.push(`메인 키워드 "${post.mainKeyword}" 검색량 자료가 없어요 — keyword-queue.txt 에 넣어 조회해 두세요`);
    else if (v < MIN_VOLUME) errors.push(`메인 키워드 "${post.mainKeyword}" 월 검색량 ${v} — ${MIN_VOLUME} 이상인 말로 바꾸세요 (1,000~10,000 우선)`);
    else notes.push(`메인 키워드 "${post.mainKeyword}" 월 검색량 ${v.toLocaleString()}`);
  }
  if (post.title.length > (newRules ? 40 : 30)) notes.push(`제목이 깁니다 (${post.title.length}자). 모바일에서 잘릴 수 있습니다.`);


  lines.forEach((l, i) => {
    if (l.t.length > MAX_LINE) errors.push(`${MAX_LINE}자 초과 (${l.t.length}자): "${l.t}"`);
  });

  const body = texts.join('');
  for (const w of BAN) if (body.includes(w)) errors.push(`단정적 표현 사용: "${w}"`);
  for (const w of WARN_WORDS) if (body.includes(w)) notes.push(`"${w}" — 우위를 단정하는 뜻이면 고치세요.`);
  for (const w of post.warnings) errors.push(w);

  // Q&A 형식 (2026-10-01 사용자 지시): 인용구 소제목 아래 "Q1: 질문" / "A1: 답변" 3쌍. 글 모양에 따라 0·3·5쌍.
  {
    const all = post.blocks.flatMap((b) => b.lines.map((l) => l.t));
    const qs = all.filter((t) => /^Q\d+:/.test(t)).length;
    const as = all.filter((t) => /^A\d+:/.test(t)).length;
    // 티스토리도 같은 글 모양 규칙을 따른다 (routines/tistory-daily.md — 2026-10-05 원고부터)
    const useFormat = dated >= FORMAT_FROM;
    const fmt = useFormat ? FORMATS[post.format] : FORMATS.기본;
    if (useFormat && !fmt) errors.push(`format 이 없거나 모르는 값입니다 ("${post.format}") — ${Object.keys(FORMATS).join(' / ')} 중 하나`);
    if (fmt) {
      if (qs !== as || !fmt.qa.includes(qs)) errors.push(`Q&A 는 "Q1: 질문" / "A1: 답변" 형식으로 ${fmt.qa.join(' 또는 ')}쌍이어야 합니다 (${post.format || '기본'}, 지금 Q ${qs}개 / A ${as}개)`);
      for (const [re, min, what] of fmt.need) {
        const n = all.filter((t) => re.test(t.replace(/^\[[^\]]+\]/, ''))).length;
        if (n < min) errors.push(`${post.format}: ${what}이 ${min}개 이상 필요합니다 (지금 ${n}개)`);
      }
    }
    // 같은 날 원고끼리 모양이 겹치지 않게
    if (useFormat && fmt) {
      const dir = file.replace(/[^\\/]+$/, '') || './';
      const sib = fs.readdirSync(dir).filter((f) => f.startsWith(dated) && f.endsWith('.md'));
      const fmts = sib.map((f) => { try { return parsePost(fs.readFileSync(dir + f, 'utf8')).format; } catch { return ''; } });
      const same = fmts.filter((x) => x === post.format).length;
      if (same > 2) errors.push(`같은 날(${dated}) "${post.format}" 모양이 ${same}편 — 2편까지만 (모양을 돌려 쓰세요)`);
      if (sib.length >= 5 && new Set(fmts.filter(Boolean)).size < 3) notes.push(`같은 날 글 모양이 ${new Set(fmts).size}가지뿐이에요 — 3가지 이상 섞으세요`);
    }
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
  if (tistory) {
    const fixedIn = FIXED_TAGS.filter((t) => post.tags.includes(t));
    if (fixedIn.length) errors.push(`티스토리에는 네이버 고정 태그를 붙이지 않습니다: ${fixedIn.join(', ')}`);
  } else {
    const noFixed = FIXED_TAGS.filter((t) => !post.tags.includes(t));
    if (noFixed.length) errors.push(`고정 해시태그 빠짐: ${noFixed.join(', ')} — 주제 태그 뒤에 붙이세요`);
  }

  // standards/이미지-기준.md — 한 글에 8장 (대표 1 + 본문 7)
  if (images.length && images.length !== 8)
    notes.push(`이미지 자리 ${images.length}개 — 8개 기준입니다.`);

  // 고정 인사말
  if (texts[0] !== OPEN[0] || texts[1] !== OPEN[1])
    errors.push(`오프닝이 고정 문구와 다릅니다. "${OPEN[0]} / ${OPEN[1]}" 로 시작해야 합니다.`);
  if (texts[texts.length - 2] !== close1 || !CLOSE_RE.test(texts[texts.length - 1]))
    errors.push(`클로징이 고정 문구와 다릅니다. "${close1} / 이상 성글벙글의 OO 포스팅이었습니다😎" 로 끝나야 합니다.`);

  // 덩어리를 너무 잘게 쪼개면 글이 툭툭 끊긴다
  const textBlocks = post.blocks.filter((b) => b.type !== 'image');
  // 평균은 본문 덩어리만으로 낸다. 소제목(한 줄)을 덩어리로 세면 소제목이 많은 글이 잘게 쪼갠 글처럼 보인다
  const bodyBlocks = textBlocks.filter((b) => b.type !== 'quote');
  const perBlock = bodyBlocks.reduce((a, b) => a + b.lines.length, 0) / (bodyBlocks.length || 1);
  for (const b of textBlocks) if (b.lines.length > MAX_BLOCK)
    errors.push(`덩어리가 ${b.lines.length}줄 — ${MAX_BLOCK}줄 이하로 끊으세요 (2·2·3, 4·3 처럼): "${b.lines[0].t}"`);
  if (dated >= AFTER_QUOTE_FROM) {
    post.blocks.forEach((b, i) => {
      // 소제목 → (이미지) → 본문 순서여도 그림이 사이에 끼면 붙어 보이지 않으므로 바로 다음 덩어리만 본다
      if (b.type !== 'quote') return;
      const next = post.blocks[i + 1];
      if (next && next.type === 'p' && next.lines.length > MAX_AFTER_QUOTE)
        errors.push(`소제목 바로 아래 덩어리가 ${next.lines.length}줄 — ${MAX_AFTER_QUOTE}줄 이하로 끊으세요 (소제목과 붙어 보입니다, 1·3 이나 2·2 로): "${next.lines[0].t}"`);
    });
  }
  if (dated >= IMAGE_UNDER_QUOTE_FROM) {
    post.blocks.forEach((b, i) => {
      if (b.type !== 'image' || b.n === 1) return;
      const prev = post.blocks[i - 1];
      if (!prev || prev.type !== 'quote')
        errors.push(`[이미지 ${b.n}] 은 소제목(인용구) 바로 아래에 두세요 — 소제목 → 그림 → 글 순서: "${b.lines[0].t}"`);
    });
    const quotes = post.blocks.filter((b) => b.type === 'quote').length;
    const under = post.blocks.filter((b, i) => b.type === 'image' && b.n !== 1 && post.blocks[i - 1]?.type === 'quote').length;
    if (quotes - under > 3) notes.push(`그림 없는 소제목이 ${quotes - under}개예요 — 소제목 수를 그림 수(7)에 가깝게 맞추면 패턴이 더 고르게 보여요`);
    // 인용구 소제목이 너무 많다 (2026-10-03 사용자 지시 — 10~12개에서 2~3개 빼기). 그림 7 + Q&A + 정리 = 9개까지
    if (quotes > MAX_QUOTES) errors.push(`인용구(소제목)가 ${quotes}개 — ${MAX_QUOTES}개 이하로 줄이세요 (그림 7개 자리 + Q&A + 정리). 그림 없는 소제목은 앞 덩어리와 합칩니다`);
  }
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

  console.log(`\n${file}${tistory ? '  [티스토리]' : ''}`);
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
