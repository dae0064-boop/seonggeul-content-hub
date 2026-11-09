/**
 * 네이버 블로그 하위 카테고리 고르기 (2026-11-04 사용자 — 카테고리 화면 캡처 "여기에 맞춰서 넣어 달라").
 * 이름은 블로그에 만든 글자 그대로다 (가운뎃점·띄어쓰기까지 — 다르면 publish-naver 가 못 찾고 위 카테고리로 간다).
 * 원고 프런트매터 subcategory: 가 있으면 그것, 없으면 아래 규칙으로 고른다.
 */
export const SUBCATEGORIES = {
  '생활·정보': ['살림·청소', '제철 음식·보관', '계절 준비', '우리말 맞춤법'],
  // 2026-11-09 사용자 — 생활·보장을 위 카테고리 3개로 나눔 (배너 위젯 3칸이 이 셋을 가리킨다). 하위 이름·글은 그대로
  '보험금·실비': ['실비·보험금청구', '건강검진·질병정보'],
  '병원비·돌봄': ['의료비·건강보험', '돌봄·요양'],
  '지원금·제도': ['생활 지원 제도', '바뀌는 제도'],
  '이슈·뉴스': ['오늘의 정책', '경제·사회 이슈'],
  '연예·방송': ['드라마', '예능', '영화·OTT', '스타 소식'],
  '맛집·나들이': ['맛집·카페 후기', '여행·숙소', '명소·축제 시기'],
};
export const ALL_SUBCATEGORIES = Object.values(SUBCATEGORIES).flat();
export const parentOf = (sub) => Object.keys(SUBCATEGORIES).find((k) => SUBCATEGORIES[k].includes(sub)) || '';

export function subcategoryFor(post) {
  if (post.subcategory) return post.subcategory;
  const t = `${post.title || ''} ${post.mainKeyword || ''} ${(post.subKeywords || []).join(' ')}`;
  const topic = post.topic || '';
  if (post.issue === '연예') {
    if (topic === '드라마') return /넷플릭스|디즈니|티빙|웨이브|쿠팡플레이|OTT/.test(t) && !/드라마/.test(t) ? '영화·OTT' : '드라마';
    if (topic === '영화') return '영화·OTT';
    if (topic === '방송') return /넷플릭스|디즈니|티빙|웨이브|OTT/.test(t) ? '영화·OTT' : '예능';
    return '스타 소식'; // 스타·음악 등
  }
  if (post.issue === '정책') {
    return /정책|제도|정부|부처|시행|개편|법안|법 |국회|지원금|연금|수당|신청|발표/.test(t) ? '오늘의 정책' : '경제·사회 이슈';
  }
  if (post.category === '생활보장') {
    if (/실비|실손|보험금|청구|진단비|수술비|입원비/.test(t)) return '실비·보험금청구';
    if (/요양|돌봄|간병|호스피스|치매|장기요양|복지용구/.test(t)) return '돌봄·요양';
    if (/바뀌|달라지|개편|올해부터|내년부터|새로 시행/.test(t) && /제도|정책|지원|연금|수당|급여|건강보험/.test(t)) return '바뀌는 제도';
    if (/수급|기초연금|복지|바우처|지원 제도|지원금|생계|수당|정책/.test(t)) return '생활 지원 제도';
    if (/건강보험|본인부담|비급여|급여|의료비|병원비|산정특례|비용/.test(t)) return '의료비·건강보험';
    if (/보험/.test(t)) return '실비·보험금청구'; // 화재·운전자 보험 같은 증권 확인 글
    return '건강검진·질병정보';
  }
  if (post.category === '생활정보' || !post.category) {
    if (topic === '교육·학문' || /맞춤법|띄어쓰기|구분/.test(t)) return '우리말 맞춤법';
    if (topic === '국내여행' || /명소|축제|단풍|억새|절정|꽃놀이|나들이/.test(t)) return '명소·축제 시기';
    if (/김장 준비|이불|난방|보일러|월동|단열|외풍|가습기|환절기|겨울 준비|제습|결로/.test(t)) return '계절 준비';
    if (topic === '요리·레시피' || /제철|보관|손질|레시피|만들기|김치|장아찌|반찬|볶음|국\b|탕|무침|청 /.test(t)) return '제철 음식·보관';
    return '살림·청소';
  }
  return '';
}
