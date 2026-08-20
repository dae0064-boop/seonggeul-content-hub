/**
 * 원고 서식 규칙
 * 화면 표시와 scripts/validate-content.mjs 검수의 공통 기준이다.
 * 이 파일을 고치면 검수 기준도 함께 바뀐다.
 */
const FORMAT_RULES = {
  naver: {
    label: "네이버 블로그",
    postsPerDay: 3,
    bodyChars: { min: 3200, max: 3500 },
    imagePlansPerPost: 8,
    greeting: "안녕하세요, 성글벙글입니다",
    requiredEmoji: [
      { char: "😊", exactCount: 1 },
      { char: "💙", exactCount: 1 },
      { char: "😎", exactCount: 1 }
    ],
    tone: "친근하고 자연스러운 정보형 문체",
    notes: [
      "지정 인사말로 시작한다.",
      "이모지는 지정된 3종만 각각 1회 사용한다.",
      "티스토리와 문장을 공유하지 않는다."
    ]
  },

  tistory: {
    label: "티스토리",
    postsPerDay: 3,
    bodyChars: { min: 2501, max: 3000 },
    imagePlansPerPost: 8,
    requiresMetaDescription: true,
    tone: "Google 검색형 SEO 정보 문서",
    notes: [
      "네이버와 다른 제목·도입·구성을 쓴다.",
      "H2/H3 구조와 FAQ 블록을 포함한다.",
      "메타 설명을 반드시 작성한다."
    ]
  },

  cardnews: {
    label: "카드뉴스",
    setsPerDay: 6,
    slidesPerSet: 7,
    tone: "모바일에서 빠르게 읽히는 핵심 정보형",
    notes: [
      "1장은 후킹, 7장은 마무리·행동 유도로 구성한다.",
      "한 장에 한 메시지만 담는다."
    ]
  },

  common: {
    notes: [
      "날짜·금액·대상·조건은 MASTER FACT와 일치해야 한다.",
      "공식 발표와 예상 정보를 구분해 표기한다.",
      "플랫폼 사이 문장 복사를 금지한다.",
      "기존 원고는 참고만 하고 새 검색 의도로 재구성한다.",
      "제목은 과거 이력과 중복될 수 없다."
    ]
  },

  // 사용량 절약 규칙 (CONTENT_HUB.md 4장과 동일)
  budget: {
    historyOnly: true,            // 과거 원고 본문 읽기 금지
    maxSources: 3,                // 기본 자료 조사 상한
    masterFactOncePerDay: true,
    validateRuns: 1,              // 실패 항목만 1회 재검사
    deployRuns: 1,
    linkChecks: 1
  }
};

if (typeof module !== "undefined" && module.exports) module.exports = FORMAT_RULES;
