/**
 * 안전장치 — 사람이 보지 않는 상태로 나가는 글을 막는 마지막 문.
 *
 * 여기서 errors 가 하나라도 나오면 발행하지 않는다. notes 는 기록만 한다.
 * 금지 표현은 memory/CLAUDE.md [4] 광고심의 + scripts/check_post.py 의 목록을
 * 스레드 길이에 맞게 옮겨온 것이다. 한쪽만 고치지 말 것.
 */
import { cfg } from './config.mjs';

// 무조건 막는다
const HARD_BANNED = ['100%', '손실 없음', '손실없음', '공짜', '단언컨대', '절대로'];

// 최상급 — 뒤따르는 말에 따라 괜찮을 수 있다
const SUPERLATIVES = ['최고', '최저', '제일', '가장'];
const SUPERLATIVE_OK_AFTER = ['먼저', '많이', '가까운', '중요한 건', '큰 문제는', '흔한', '자주'];
// 최상급 + 우위 단정이 붙으면 광고심의에 걸린다
const SUPERLATIVE_BAD_AFTER = /^\s*(의|좋|싸|저렴|빠르|효과|추천|낫|유리)/;

// "무조건 좋은 건 아니에요" 처럼 부정이 따라오면 오히려 규칙을 지키는 문장이다
const NEGATION_NEAR = /(아니|않|없|말고|보다는|같지만|일까요|할까요|거나)/;

// 진단·처방·수익 단정. 생활관리 수준을 넘으면 막는다
const ASSERTION = [
  /완치(된다|됩니다|돼요)/, /치료(된다|됩니다|돼요)/, /부작용(이)?\s*없/,
  /원금\s*보장/, /수익(률)?\s*보장/, /무조건\s*받/, /세금\s*안\s*냅/,
  /보장(합니다|해\s*드립니다|해드립니다|해\s*줍니다|해줍니다)/,
  /반드시\s*(나|낫|좋아|효과)/, /꼭\s*(낫|완치)/,
];

// 영업·광고 느낌. 성글벙글 페르소나가 쓰지 않는 말이다
const SALESY = [
  /DM\s*(주세요|남겨)/i, /디엠\s*(주세요|남겨)/, /상담\s*(신청|문의|받아)/,
  /문의\s*(주세요|주시면)/, /지금\s*바로\s*(신청|구매|클릭)/, /쿠팡\s*파트너스/,
  /수수료를?\s*제공받/, /최저가\s*구매/, /링크\s*클릭/,
];

// 공포 자극
const FEAR = [/큰일\s*(납니다|나요)/, /위험합니다/, /늦으면\s*끝/, /후회합니다/];

// 2차 가공 출처 — 인용하지 않는다 (memory/CLAUDE.md [5])
const SECONDARY_SOURCES = [
  'blog.naver.com', 'm.blog.naver.com', 'tistory.com', 'brunch.co.kr',
  'cafe.naver.com', 'post.naver.com', 'news.naver.com', 'n.news.naver.com',
  'namu.wiki', 'wikipedia.org', 'velog.io', 'medium.com',
];

// 단축 URL — 어디로 가는지 알 수 없는 링크는 올리지 않는다
const SHORTENERS = /(bit\.ly|goo\.gl|t\.co|tinyurl\.com|is\.gd|han\.gl|vo\.la|buly\.kr)/i;

// 연락처·식별정보
const PII = [
  { re: /\b01[016-9][-\s.]?\d{3,4}[-\s.]?\d{4}\b/, what: '휴대폰 번호' },
  { re: /\b\d{6}\s?[-]\s?[1-4]\d{6}\b/, what: '주민등록번호 형태' },
  { re: /\b\d{2,3}-\d{2,6}-\d{2,6}\b/, what: '계좌번호 형태' },
  { re: /[\w.+-]+@[\w-]+\.[\w.]+/, what: '이메일 주소' },
];

// 블로그 전용 양식이 스레드에 섞여 들어오는 것을 잡는다
const BLOG_ONLY = ['매일매일 좋은 날을 나누는 성글벙글입니다', '이웃추가', '[빨간글씨]', '[노란배경]'];

const URL_RE = /https?:\/\/[^\s)]+/g;

/** 문자 3-gram 자카드 유사도 (0~1). 같은 주제를 또 쓰는 것을 막는 데 쓴다 */
export function similarity(a, b) {
  const grams = (s) => {
    const t = String(s).replace(/\s+/g, '');
    const out = new Set();
    for (let i = 0; i + 3 <= t.length; i++) out.add(t.slice(i, i + 3));
    return out;
  };
  const A = grams(a), B = grams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return inter / (A.size + B.size - inter);
}

/**
 * 나가기 직전 검사.
 * @param {string} text 올릴 글
 * @param {{kind?: 'post'|'reply', recentTexts?: string[]}} opts
 * @returns {{ok: boolean, errors: string[], notes: string[]}}
 */
export function guard(text, { kind = 'post', recentTexts = [] } = {}) {
  const errors = [];
  const notes = [];
  const body = String(text || '').trim();

  // ---- 길이
  if (!body) errors.push('본문이 비었습니다.');
  if (body.length > cfg.maxChars) {
    errors.push(`${cfg.maxChars}자를 넘습니다 (${body.length}자). 스레드는 한 글에 500자까지입니다.`);
  }
  const floor = kind === 'reply' ? 10 : cfg.minChars;
  if (body && body.length < floor) errors.push(`너무 짧습니다 (${body.length}자, 최소 ${floor}자).`);

  // ---- 금지 표현
  for (const w of HARD_BANNED) {
    if (body.includes(w)) errors.push(`금지 표현: "${w}"`);
  }

  for (const m of body.matchAll(/무조건/g)) {
    const window = body.slice(m.index + 3, m.index + 33);
    if (!NEGATION_NEAR.test(window)) errors.push('"무조건" 단정 — 부정 없이 쓰였습니다.');
  }

  for (const w of SUPERLATIVES) {
    for (const m of body.matchAll(new RegExp(w, 'g'))) {
      const after = body.slice(m.index + w.length, m.index + w.length + 12);
      if (SUPERLATIVE_OK_AFTER.some((ok) => after.trimStart().startsWith(ok))) continue;
      if (SUPERLATIVE_BAD_AFTER.test(after)) errors.push(`최상급 단정: "${w}${after.slice(0, 6)}"`);
      else notes.push(`최상급 "${w}" — 순서를 뜻하는 것이 맞는지 확인.`);
    }
  }

  for (const re of ASSERTION) if (re.test(body)) errors.push(`단정 표현: ${re.source}`);
  for (const re of SALESY) if (re.test(body)) errors.push(`영업·광고 느낌: ${re.source}`);
  for (const re of FEAR) if (re.test(body)) errors.push(`공포 자극: ${re.source}`);

  // ---- 개인정보
  for (const { re, what } of PII) if (re.test(body)) errors.push(`${what} 가 들어 있습니다.`);

  // ---- 링크
  const urls = body.match(URL_RE) || [];
  if (urls.length > 1) errors.push(`링크가 ${urls.length}개입니다. 한 글에 하나까지만 답니다.`);
  for (const u of urls) {
    if (SHORTENERS.test(u)) errors.push(`단축 URL: ${u}`);
    const host = u.replace(/^https?:\/\//, '').split('/')[0].toLowerCase();
    if (SECONDARY_SOURCES.some((s) => host.endsWith(s))) errors.push(`2차 가공 출처 링크: ${host}`);
  }

  // ---- 양식 오적용
  for (const w of BLOG_ONLY) {
    if (body.includes(w)) errors.push(`블로그 전용 양식이 섞였습니다: "${w}"`);
  }

  // ---- 해시태그·이모지
  const tags = body.match(/#[^\s#]+/g) || [];
  if (tags.length > 5) errors.push(`해시태그가 ${tags.length}개입니다. 스레드는 3개 안팎이면 충분합니다.`);
  const emoji = (body.match(/\p{Extended_Pictographic}/gu) || []).length;
  if (emoji > 6) notes.push(`이모지 ${emoji}개 — 과해 보일 수 있습니다.`);

  // ---- 중복
  if (kind === 'post') {
    for (const prev of recentTexts) {
      const s = similarity(body, prev);
      if (s >= cfg.dupThreshold) {
        errors.push(`최근 글과 너무 비슷합니다 (유사도 ${s.toFixed(2)}): "${String(prev).slice(0, 40)}..."`);
        break;
      }
    }
  }

  return { ok: errors.length === 0, errors, notes };
}
