#!/usr/bin/env node
/**
 * 원고 검사기 — 모바일 가독성 규칙을 자동으로 확인한다.
 *
 *   node scripts/lint-post.mjs content/posts/*.md
 */
import fs from 'node:fs';
import { soloOk } from './lib/official-photo.mjs';
import { stillHostOk } from './lib/broadcast-still.mjs';
import { parsePost, flatLines } from './lib/parse-post.mjs';
import { normTitle } from './lib/naver-related.mjs';
import { checkCard } from './lib/overlay.mjs';
import * as BC from './lib/brandconnect.mjs';
import { topicFor, guessTopic } from './lib/naver-topic.mjs';
import { ALL_SUBCATEGORIES } from './lib/naver-subcategory.mjs';
// 맞춤법 시험 (2026-11-02 사용자 승인) — 2026-11-04~11-17 네이버 원고, 하루 1편 (routines/naver-daily.md ⓓ-2)
const SPELL_TEST = ['2026-11-04', '2026-11-17'];
// 장면·경험·대화 (2026-11-02 사용자 승인 — CLAUDE.md "장면·경험·대화") — 2026-11-06 원고부터 네이버·티스토리
const SCENE_FROM = '2026-11-06';
// 2026-11-03 — 채팅 카드의 질문 말풍선(card.ask)이 11/5 계획서까지 모두 비어 "받을 수 있나요 알려 줘!" 처럼 어색하게 그려졌다. 11/6 원고부터 꼭 적는다.
const ASK_FROM = '2026-11-06';
const SCENE_RE = /(라면|예를 들어|이맘때|이런 분|하기 쉬워요|경우가 많아요)/;
const QUOTE_RE = /["“][^"”]{4,40}[?？.!요]["”]/;
const NAMED_RE = /[A-Z]씨|[가-힣]{1,3}\s?(어머니|아버지|할머니|할아버지)께서|(?:지인|친구|이웃)(?:이|가) 실제로/;

// 10/12 변경 묶음 (2026-10-02·10-03 사용자 결정) — 2026-10-12 원고부터
//   ① 고정 인사말 앞 첫 덩어리 = 확인된 사실 한 문장(1~2줄)
//   ② 제목 끝 괄호에 구체 숫자·기준 "(중불 20~30분)" — 괄호 속 숫자는 본문에 있어야 한다
//   ③ 정보 카드: 이미지 계획서 8장 중 2~3장이 kind "card", 카드 글자는 본문에 있는 말
//   ④ 대표사진 카드 틀(frame "card"): 네이버 하루 5편 중 2편, 티스토리는 쓰지 않는다
// 같은 날 원고 목록 — 하루 5편 밖의 추가 글(프런트매터 extra:, 사용자가 따로 부탁한 시험 글)은 하루 배분·모양·쇼핑 1편 검사에 넣지 않는다
function daySibs(dir, dated) {
  return fs.readdirSync(dir).filter((f) => f.startsWith(dated) && f.endsWith('.md') && !/^extra:\s*\S/m.test(fs.readFileSync(dir + f, 'utf8').split(/^---\s*$/m)[1] || ''));
}
const BUNDLE_FROM = '2026-10-12';
const CARDS = [2, 3];
const FRAME_CARDS_PER_DAY = 2;
// 한 주 시험 (2026-10-18 사용자 승인 — "조회수가 무조건 1순위", 10/19~10/25 원고, 10/25 일요일에 결과를 보고 의논) — 네이버만.
//   ① 대표사진 카드 틀 시험을 일찍 끝낸다: 모두 지금 방식(frame "card" 없음). 홈판에 걸린 글은 모두 지금 방식이었다
//   ② 정보 카드는 8장 중 1~2장
//   ③ 제목 = 메인 키워드 + 그 말을 친 사람의 질문 하나 + (숫자). 서브 키워드를 제목에 늘어놓지 않는다 (비율 50~60% 규칙을 쉰다)
const WEEK_TEST_FROM = '2026-10-19';
const CARDS_WEEK_TEST = [1, 2];
const TITLE_QUESTION = /(\?|까요?|[나가]요)$/;
// 주제 전환 (2026-10-19 사용자 대화 — 한다팀장 600~700 과 차이가 너무 크다, "보험·국가정책·복지로 결을 맞추자") — 2026-10-20 네이버 원고부터.
//   ① 하루 5편 = 생활정보 4편 + 생활보장 1편 — 같은 날 저녁 사용자 최종 결정 "생활정보로 꾸준히 밀고 가자"
//      (3+2·5편 모두 생활보장 안은 버림. 생활보장 1편은 보험 정보글 또는 부모님 세대 의료비·돌봄 제도)
//   ② 사무실에서 같이 운영하는 한다팀장 블로그와 같은 메인 키워드는 쓰지 않는다 (두 블로그가 서로 자리를 뺏는다)
//      목록: content/research/hande-keywords.txt (아침 확인이 Drive blog-snapshot 의 rich_grandmom 제목에서 채운다)
//   ③ 그림은 생활보장·살림 모두 8장 그대로 (같은 날 사용자 — "그대로 8장씩 진행"). 정보 카드 1~2장
const TOPIC_SHIFT_FROM = '2026-10-20';
const SHIFT_SPLIT = { 생활정보: 4, 생활보장: 1 };
// 2026-10-24 사용자 결정 — "생활보장 쪽으로 몰아서" (우리 자료: 10/12 이후 생활보장 글 25% 가 조회 상위 20, 생활정보 15%).
//   ① 2026-10-26 원고부터 하루 생활정보 3 + 생활보장 2 (한 주 시험, 11/1 아침 확인이 판정)
//   ② 생활정보 3편 중 2편은 홈판형(slot: 홈판) — 제목을 "키워드, 질문 (숫자)" 대신 공감형으로. 홈판에 걸린 글(억새·관엽식물·식단·소풍 도시락·귤)은 모두 괄호 없는 제목이었다
const SPLIT2_FROM = '2026-10-26';
const SPLIT2 = { 생활정보: 2, 생활보장: 3 };   // 2026-10-24 같은 날 다시 — 사용자 "생활보장 3편, 생활정보 2편으로" (처음엔 3+2 반대)
// 2026-10-26 사용자 — 2026-10-27 원고부터 하루 5편 = 생활보장 4 + 생활정보 1 (생활정보 1편이 홈판형). 나머지 5편은 철거 블로그(content/chulgeo)로 따로.
//   (같은 날 낮에 '10편 = 생활보장 7 + 생활정보 3'으로 정했다가 바로 바꿈.) 5편이 다 모이기 전에는 '넘지 않는지'만 본다.
const SPLIT3_FROM = '2026-10-27';
const SPLIT3 = { 생활정보: 1, 생활보장: 4 };
const DAY_TOTAL3 = 5;
const HOMEFEED3 = 1;
// 2026-11-01 사용자 — "홈판 비중을 늘려보고 홈판 잘 타는 블로그들이 공통으로 하는 대로". 2026-11-03 원고부터 하루 5편 중 3편 홈판형
//   = 생활정보 1(12:00) + 생활보장 2(17:00·21:00). 카테고리 배분(생활보장 4 + 생활정보 1)은 그대로, 생활보장 글에도 slot: 홈판 을 붙인다.
//   2026-11-01 같은 날 다시 — "11월 1일부터 14일까지 2주 테스트": 11/2 남은 칸(17·21시)부터 홈판형. 판정 11/15(일) 아침.
//   홈판형은 고정 인사 없이 첫 문장(인용구) → 바로 본론 (사용자: 홈판형만 빼기), 대표사진은 사람 얼굴이 보이는 구도(face·duo). 둘 다 11/3 원고부터 검사(11/2 12시 글은 이미 예약됨).
const HOMEFEED4_FROM = '2026-11-02';
const HOMEFEED4 = 3;
const HF_STYLE_FROM = '2026-11-03';
const HF_SHOTS = ['face', 'duo'];
// 2026-11-01 사용자 — "하루 20편, 생활정보(리빙·푸드) 10 + 생활보장 10". 2026-11-03 원고부터.
//   홈판형 14(생활정보 8 + 생활보장 6) · 검색형 6. 같은 주제라도 말투(tone)·내용을 글마다 다르게, 겹치지 않게 (같은 날 사용자).
const TWENTY_FROM = '2026-11-03';
// 2026-11-02 사용자 — "11월 2일도 15편 더 추가해서 20편, 티스토리도 10편". 그날 먼저 쓴 글(아래 LEGACY_DAY20)은 옛 기준 그대로,
//   새로 더한 글은 11/3 기준(분량·그림·말투·홈판 인사 없음)으로 본다 — 하루 배분·겹침은 20편 날로.
const TWENTY_EXTRA = new Set(['2026-11-02']);
const LEGACY_DAY20 = new Set([
  '2026-11-02-chimae-chogi-jeungsang', '2026-11-02-daejang-naesigyeong-biyong', '2026-11-02-eunhaengnamu-myeongso',
  '2026-11-02-gapsangseon-gyeoljeol', '2026-11-02-yoyangbohosa-haneunil',
  '2026-11-02-aiseupaek-beorineun-beop', '2026-11-02-han-geun-myeot-geuram', '2026-11-02-hwassi-seopssi-byeonhwan',
  '2026-11-02-pyesigyongyu-beorineun-beop', '2026-11-02-yul-ryul-gubun',
]);
const isTwenty = (d) => d >= TWENTY_FROM || TWENTY_EXTRA.has(d);
// 2026-11-01 사용자 — "20편·10편은 그대로, 이미지랑 글 분량을 조금 줄여서" (비용·아침 그림 시간·밤 작업 사용량). 2026-11-03 원고부터.
//   그림: 네이버 6장(대표 1 + 장면 3 + 정보 카드 2), 티스토리 4장(대표 1 + 장면 1 + 정보 카드 2)
//   분량(공백 제외)·키워드 횟수: 네이버 홈판형 1,500~1,800자·메인 7·서브 3 / 검색형 1,900~2,100자·메인 9·서브 4 / 티스토리 1,600~1,900자·메인 8·서브 4
//   Q&A 한 쌍씩 줄임(3→2, 질문형 5→4), 소제목 7개까지
const SLIM_FROM = '2026-11-03';
// 카드 6모양 돌려 쓰기 (2026-11-04 사용자) — 한 글 2장은 서로 다른 모양, 하루 카드의 한 모양은 30%까지
const CARD_MIX_FROM = '2026-11-07';
const CARD_MIX_MAX = 0.3;
const cardDesign = (c) => (['lead', 'number', 'quiz', 'selfcheck'].includes(c?.type) ? c.type : c?.style === 'memo' ? 'memo' : c?.style === 'classic' ? 'classic' : 'chat');
// 2026-11-04 사용자 "따라해보자" — 한다팀장 모양 (2026-11-07 네이버 원고부터, 생활보장만): 홈판형 칸 없이 모두 검색형,
//   제목 "큰 검색어, 결과지·진단 상황 + 꼭 ~해야 하나요 (기준 · 2026년)", 분량 1,900~2,300자, 인용구 10개까지 (routines/naver-daily.md 🩺👩‍💼 상자)
const HANDE_FROM = '2026-11-07';
function slimOf(dated, tistory, slot, category) {
  if (dated < SLIM_FROM) return null;
  if (!tistory && category === '생활보장' && dated >= HANDE_FROM) return { imgs: 6, cards: [2, 2], chars: [1900, 2300], main: 9, sub: 4, quotes: 10 };
  if (tistory) return { imgs: 4, cards: [2, 2], chars: [1600, 1900], main: 8, sub: 4, quotes: 7 };
  if (slot === '홈판') return { imgs: 6, cards: [2, 2], chars: [1500, 1800], main: 7, sub: 3, quotes: 7 };
  return { imgs: 6, cards: [2, 2], chars: [1900, 2100], main: 9, sub: 4, quotes: 7 };
}
const SLIM_QA = { 기본: [2], 순서형: [0, 2], 체크리스트형: [0, 2], 비교형: [0, 2], 질문형: [4] };
const SPLIT_TWENTY = { 생활정보: 10, 생활보장: 10 };
const HF_TWENTY = { 생활정보: 8, 생활보장: 6 };
// 2026-11-03 사용자 — 제철·나들이 홈판형 2편(10:40·20:00). 한때 생활보장 홈판 2칸을 돌렸다가 같은 날 "생활보장을 늘리고 생활정보를 줄이자"로
// 생활보장 10 그대로, 20:00 생활정보 검색형만 홈판형으로 (routines/naver-daily.md 🍂)
// 2026-11-05 원고부터 하루 20편 = 생활보장 5 · 생활정보 3 · 이슈·뉴스 6 · 연예·방송 6 (2026-11-04 사용자 — 발행된 글 맛집·나들이 237 · 생활정보 170 · 생활보장 76
// 에 비해 이슈·연예가 너무 적다, "점차 같은 숫자가 되도록"). 이슈 글 category 는 생활정보라 생활정보 15 · 생활보장 5 로 센다. 홈판형 칸 수는 세지 않는다.
const ISSUE12_FROM = '2026-11-05';
const SPLIT_ISSUE12 = { 생활정보: 15, 생활보장: 5 };
const ISSUE12 = { 연예: 6, 정책: 6 };
const SEASON_FROM = '2026-11-06';
// 2026-11-11 원고부터 하루 10편 = 생활보장 10 (생활정보·이슈·연예 0) — 2026-11-09 사용자 "상담 손님이 더 중요해", "생활정보도 빼고 생활보장으로만"
//   (standards/상담-유입-계획.md). 이슈 글은 쓰지 않고, 보장과 이어지는 제도 소식은 생활보장 글로 쓴다.
const CARE10_FROM = '2026-11-10'; // 11/9 사용자가 생활보장 밖 카테고리를 모두 비공개로 → 하루 앞당김
const SPLIT_CARE10 = { 생활정보: 0, 생활보장: 10 };
const SPLIT_SEASON = { 생활정보: 10, 생활보장: 10 };
const HF_SEASON = { 생활정보: 9, 생활보장: 6 };
// 같은 날 같은 값 몇 편까지 (20편 날)
const TW = { format: 5, tone: 5, mood: 3, shot: 4, shotHf: 8, theme: 2, person: 1, papers: 4, olds: 8, brandconnect: 5 };
const TONES = {
  수다형: '옆집 언니·이웃처럼 편하게 — "~더라구요", "그쵸?" 가 많고 문장이 짧다',
  설명형: '차분하게 하나씩 — "~예요", "~거든요", 이유를 먼저 짚고 순서대로',
  정리형: '꼼꼼한 메모처럼 — 짧은 문장, 숫자·기준을 앞에, 군더더기 없이',
  이야기형: '흔한 장면 하나로 시작해 따라가는 — "이맘때 이런 분 많죠" (지어낸 실화 금지, 일반화한 장면)',
  공감형: '마음을 먼저 알아주는 — 걱정·번거로움을 짚고 "괜찮아요, 이것만 보면 돼요"로 이어 간다',
};
// 2026-10-26 사용자 다시 — "10월 말까지는 하루 10편(생활보장 7 + 생활정보 3), 11월 1일부터 생활보장 4 + 생활정보 1 총 5편". 10편 날은 홈판형 2편, 같은 모양 3편까지.
const TEN_UNTIL = '2026-10-31';
const SPLIT_TEN = { 생활정보: 3, 생활보장: 7 };
// 2026-11-01 사용자 — "오늘 날짜로 블로그 10편" (주말 하루 10편, 같은 10편 배분: 생활보장 7 + 생활정보 3, 홈판 2)
const TEN_EXTRA = new Set(['2026-11-01']);
const isTen = (d) => (d >= SPLIT3_FROM && d <= TEN_UNTIL) || TEN_EXTRA.has(d);
// 그림체 바꾸는 날 (2026-10-24 사용자 — "생활보장은 클레이로 30편까지, 31편부터 실사풍 / 생활정보는 지금 126편, 150편이 되면 실사풍". 같은 날 다시 센 숫자: 생활보장 19·생활정보 131).
// 실제 편수로 센다: 이 글이 그 카테고리 몇 번째 네이버 글인가 = 더할 수(OFFSET) + published.tsv 의 같은 카테고리 줄 + content/posts 에서 이 글보다 앞선(날짜·publish_at) 같은 카테고리 글 + 1.
// OFFSET: 2026-10-24 10:40 사용자가 보낸 블로그 카테고리 화면 — "생활정보 125개의 글"·"생활보장 19개의 글" (발행된 글만, 10/24 10:00 세탁기 배수구 글까지).
//   저장소 기록은 같은 때 생활보장 19(맞음)·생활정보 90 → 생활정보 차이 35 (자동화 전 옛 글·사용자가 직접 올린 글). 앞서 말로 들은 126·131 로 33·41 을 썼다가 화면 숫자로 고침.
// 예상 날짜: 생활보장 31번째 = 10/28 원고 세 번째 생활보장 글 (10/27 원고부터 하루 4편 — 처음 예상은 하루 3편 기준 10/29).
// 생활정보는 클레이 3D 그대로 (2026-10-25 사용자 "3D 로 쭉 밀고 가는 게 낫다던데" → Claude 추천: 홈판에 걸린 글이 모두 클레이라 151번째 전환을 뺌).
// 2026-10-26 사용자 — 시험 그림(실사·클레이)을 보고 "클레이 3D 그대로" → 생활보장 31번째 실사풍 전환도 취소. 모두 클레이.
// 2026-11-01 사용자 다시 — "생활보장은 현재 49개야 51개부터는 실사풍, 생활정보는 146개인데 151개부터는 실사풍" (10/31 원고까지 발행된 수).
const REAL_AFTER = { 생활보장: 50, 생활정보: 150 };
// 대표사진 새 모양 (2026-10-26 사용자 — 시험 그림 close4-02 "이 느낌으로", 2026-10-27 네이버 원고부터):
//   1번 = 한 사람 얼굴 가까이(thumbnail_closeup)·생각하는 표정·강조색, 글씨는 위쪽 남색 띠(look "band") 두 줄 — 첫 줄 메인 키워드, 둘째 줄 질문(숫자 없음).
//   그림 장면은 style_v2(파스텔보다 진한 색 + 강조색 하나). 검색 결과에서 크림색 빈 벽·작은 두 사람·키워드 반복 글씨가 눈에 안 띄었다.
const THUMB2_FROM = '2026-10-27';
// 대표사진 구도 섞기 (2026-10-28 사용자 — "사람이 너무 똑같다. 글씨 배치(위쪽 색 띠)는 그대로, 그림 구도만", 2026-10-29 원고부터 네이버·티스토리 모두):
//   1번에 thumb_shot(얼굴·두 사람·손·사물·탁자·방 전체). 같은 날 겹치지 않게, 종이 든 장면·60대 이상만 나오는 장면은 하루 몇 편까지.
//   티스토리도 같은 날부터 네이버와 같은 대표사진 규칙(위쪽 색 띠·테마·새 사람·표정·style_v2)을 따른다 ("티스토리도 그림체가 너무 비슷하다").
const THUMB3_FROM = '2026-10-29';
const PAPER = /\b(paper|papers|letter|brochure|document|leaflet|notice|pamphlet|booklet|form)\b/i;
// 공통 끝 문장("…signs, labels, screens and papers stay blank…")은 빼고 본다
const hasPaper = (prompt) => PAPER.test(String(prompt || '').replace(/Do not draw any written words[^.]*\./gi, ''));
const OLD_ONLY = (p) => /[6-9]0대|할머니|할아버지|어르신|노인/.test(p || '') && !/[1-5]0대|아이|딸|아들|손주|며느리|사위|자녀|보호자/.test(p || '');
// 2026-11-01 사용자 숫자(생활정보 146 — 저장소 기록 145)에 맞춰 35 → 36
const COUNT_OFFSET = { 생활보장: 0, 생활정보: 36 };
function categoryOrdinal(file, post, dated) {
  let n = COUNT_OFFSET[post.category] || 0;
  try {
    for (const row of fs.readFileSync('content/archive/published.tsv', 'utf8').split(/\r?\n/).slice(1)) {
      const c = row.split('\t');
      if (c[1] === 'naver' && c[5] === post.category) n++;
    }
  } catch { /* 목록이 없으면 0 */ }
  const dir = file.replace(/[^\\/]+$/, '') || './';
  const me = `${dated} ${post.publishAt || ''}`;
  for (const f of fs.readdirSync(dir).filter((x) => /^\d{4}-\d{2}-\d{2}-.+\.md$/.test(x))) {
    if (dir + f === file || f === file.split(/[\\/]/).pop()) continue;
    try {
      const p = parsePost(fs.readFileSync(dir + f, 'utf8'));
      if (p.category === post.category && `${f.slice(0, 10)} ${p.publishAt || ''}` < me) n++;
    } catch { /* 깨진 원고는 세지 않는다 */ }
  }
  return n + 1;
}
const HOMEFEED_PER_DAY = 2;
// 메인 키워드 상한 (같은 날 우리 자료 분석 — 10/6~10/17 메인 12,000 넘는 말 7개(밤 찌는 시간 18,470·전어 제철 24,750·굴 제철 18,200·
// 드럼세탁기 청소 13,070·에어프라이어 고구마 14,710·생밤 보관법 26,520·에어컨 청소 28,170)는 검색 유입이 거의 없었다 — 최적화 블로그가 차지한 말.
// 유입이 꾸준했던 말은 1,000~10,000 (은행 까는법 1,350·고등어 제철 2,410·귤 보관법 4,990·되 돼 구분 8,780·초파리 없애는 법 10,580)
const MAIN_MAX = 12000;
// 생활보장 글은 2026-10-26 원고부터 30,000 까지 (2026-10-24 한다팀장 비교 — 그쪽은 본인부담상한제 18,410·사망신고·CT비용 같은 제도 이름 큰 말을 메인으로 써서 잘 된다.
// 12,000 상한은 살림 큰 말(레시피·조리 시간) 자료에서 나온 것이라 의료비·돌봄 제도 말에는 근거가 없다. 우리 생활보장 메인은 복지용구 품목 40 처럼 너무 작았다)
const MAIN_MAX_CARE = 30000;
// 한다팀장 블로그와 30일 안 같은 질병·제도 이름 금지 (2026-11-10 네이버 원고부터, 2026-11-09 Claude 판단 — 사용자 위임 "원인 찾고 해결방안까지").
//   근거: 11/6 우리 생활보장 5편이 이틀 내리 검색에서 빠졌는데, 그중 3편(장애인 등록·골다공증·안구건조증)을 한다팀장이 11/5~11/8 에
//   같은 제목 모양("~하나요 (… · 2026년)")·같은 발행 시각(10·12·15·17·21시)으로 썼다. 같은 사무실 두 블로그가 같은 말·같은 틀이면
//   네이버가 비슷한 문서로 묶어 한쪽(신뢰가 낮은 우리)을 뺀다. 10/24 사용자 "겹쳐도 의미 없다"로 풀었던 것을 다시 막는다(되돌릴 수 있음).
//   비교: 띄어쓰기 뺀 메인 키워드와 한다팀장 키워드가 서로 포함되거나 앞 4글자 이상이 같으면 같은 말로 본다.
const HANDE2_FROM = '2026-11-10';
const HANDE2_DAYS = 30;
const HANDE2_ON = false;
export function handeClash(mainKeyword, entries, dated) {
  const mk = String(mainKeyword || '').replace(/\s+/g, '');
  if (!mk) return null;
  const from = new Date(`${dated}T00:00:00Z`); from.setUTCDate(from.getUTCDate() - HANDE2_DAYS);
  const lo = from.toISOString().slice(0, 10);
  for (const { date, kw } of entries) {
    if (!date || date < lo || date > dated) continue;
    let pre = 0; while (pre < mk.length && pre < kw.length && mk[pre] === kw[pre]) pre++;
    if (mk.includes(kw) || kw.includes(mk) || pre >= 4) return { date, kw };
  }
  return null;
}
function handeDated() {
  try {
    return fs.readFileSync('content/research/hande-keywords.txt', 'utf8').split(/\r?\n/)
      .map((l) => /^(\d{4}-\d{2}-\d{2})\t(.+)$/.exec(l.replace(/#.*/, '').trim()))
      .filter(Boolean).map((m) => ({ date: m[1], kw: m[2].replace(/\s+/g, '') }));
  } catch { return []; }
}
function handeKeywords() {
  try {
    return fs.readFileSync('content/research/hande-keywords.txt', 'utf8').split(/\r?\n/)
      .map((l) => l.replace(/#.*/, '').replace(/\s+/g, '')).filter(Boolean);
  } catch { return []; }
}
// 첫 인용구 키워드 (2026-10-13 사용자 지시) — 2026-10-15 원고부터.
// 인사말 앞 사실 한 문장은 발행 때 인용구 1번으로 들어간다. 그 안에 제목·메인·서브 키워드와 다른, 같은 주제의 검색어
// (lead_keyword)를 넣어 노출되는 검색어를 넓힌다. 예: 제목 "도시락 싸는 법" → 인용구 "어린이집 점심 도시락은 …"
const LEAD_KW_FROM = '2026-10-15';
// 출처 원문 링크 (2026-10-02 사용자 결정 "시험 순서" 10/19~) — 2026-10-19 네이버 원고부터.
// 출처 ①(기관 자료) 글은 프런트매터 source_url 에 실제로 확인한 1차 원문 주소 1~2개. 발행 때 출처 줄 아래 링크 카드로 들어간다.
// 출처 ②(생활 노하우) 글에는 달지 않는다. 블로그·카페·뉴스·영상 주소는 1차 원문이 아니다.
const SOURCE_URL_FROM = '2026-10-19';
// 이슈 글 (2026-11-02 사용자 — "연예·오늘 이슈·정책 변경으로 홈판 조회수, 무조건 진행") — 2026-11-03 네이버 원고부터(11/3 시험 1편 extra, 정식 하루 4편은 11/6 원고부터).
// issue: 연예 | 정책 + slot: 홈판. 출처는 언론 보도·소속사·정부 발표 주소(뉴스 주소 허용), 2개 이상 매체로 확인한 사실만.
// 메인 키워드 검색량 상한(12,000)·네 기둥은 보지 않는다. 사람 이름이 그림 계획서 프롬프트에 들어가면 막는다(실존 인물 얼굴을 AI 로 만들지 않는다).
const ISSUE_FROM = '2026-11-02';
const ISSUE_KINDS = ['연예', '정책'];
// 홈판형 제목 반전형 시험 (2026-11-02 사용자 — "반전형으로 바꾸는 거 몇 개, 바꾸지 않는 거 몇 개 나눠서 테스트").
// 2026-11-06 ~ 11-19 네이버 원고의 생활 홈판형(slot: 홈판, 이슈 글 빼고)에 title_test: 반전 | 기본. 같은 날 두 쪽 차이 1편 이하.
// 반전 = 흔한 생각을 뒤집는 말이 제목에 있다 ("~인 줄 알았는데", "알고 보니", "오히려", "사실은", "아니었"…). 기본 = 그 말 없이 지금 홈판형(호기심·감정).
// 둘 다 메인 키워드로 시작·본문에 있는 사실만(낚시 금지)은 같다. 판정 11/20(금) 아침 확인 (routines/morning-check.md).
const TITLE_TEST = { from: '2026-11-06', to: '2026-11-19' };
const TWIST_RE = /줄\s*알았(는데|지만|다)|알고\s*보니|오히려|사실은|아니었|아니라고|반대(였|로|라)|거꾸로|착각|의외로|뜻밖|정반대|잘못\s*알고/;
const ISSUE_TOPICS = { 연예: ['스타·연예인', '방송', '드라마', '영화', '음악'], 정책: ['사회·정치', '비즈니스·경제', '건강·의학'] };
const ISSUE_NOT_SOURCE = /(^|\.)(blog\.naver\.com|m\.blog\.naver\.com|cafe\.naver\.com|post\.naver\.com|tistory\.com|brunch\.co\.kr|youtube\.com|youtu\.be|namu\.wiki|wikipedia\.org|instagram\.com|threads\.net|search\.naver\.com|google\.com|x\.com|twitter\.com|theqoo\.net|dcinside\.com|fmkorea\.com|instiz\.net)$/i;
const SOURCE_ONE = /확인한 정보를 바탕으로/;
const FILE_DOWNLOAD = /(flDownload|fileDown|[Dd]ownload\.do|\.(pdf|hwpx?|docx?|xlsx?|zip)(\?|$))/i;
const NOT_PRIMARY = /(^|\.)(blog\.naver\.com|m\.blog\.naver\.com|cafe\.naver\.com|post\.naver\.com|n\.news\.naver\.com|news\.naver\.com|tistory\.com|brunch\.co\.kr|youtube\.com|youtu\.be|namu\.wiki|wikipedia\.org|instagram\.com|threads\.net|search\.naver\.com|google\.com|daum\.net)$/i;
const plain = (s) => String(s).replace(/\[\/?(빨간글씨|파란글씨|노란배경)\]/g, '').replace(/[\s①-⑧✔⭕❌·,.!?()~\-]/g, '');
const titleBracket = (t) => /\s\(([^()]*)\)\s*$/.exec(t);
let imageStyleCache;
function imageStyle() {
  if (imageStyleCache === undefined) {
    try { imageStyleCache = JSON.parse(fs.readFileSync(new URL('../standards/image-style.json', import.meta.url), 'utf8')); }
    catch { imageStyleCache = {}; }
  }
  return imageStyleCache;
}
function planOf(file) {
  const slug = file.split(/[\\/]/).pop().replace(/\.md$/, '');
  try { return JSON.parse(fs.readFileSync(`content/image-plans/${slug}.json`, 'utf8')); } catch { return null; }
}

// 겹침 검사 (2026-11-03 원고부터, 하루 20편) — lint-tistory.mjs 와 같은 방법
const DUP = { mainDays: 14, title: 0.6, titleNote: 0.45, body: 0.12, bodyNote: 0.06 };
const DUP_FIXED = /^(안녕하세요|매일매일 좋은 날을 나누는 성글벙글입니다😊|보험이 쉬워지는 이야기, 오늘도 시작할게요😊|이상 친근한 보험 이야기, .+ 편이었습니다😎|좋아요·공감과 (구독|이웃추가) 부탁드려요💙|이상 성글벙글의 .+ 포스팅이었습니다😎|이 포스팅은 .+|판매 발생 시 .+)$/;
const dupNorm = (x) => String(x || '').replace(/[\s.,!?·~'"“”‘’()\[\]:;\-–—*|#>]/g, '');
function gramsOf(text, n = 10) {
  const set = new Set();
  for (let i = 0; i + n <= text.length; i++) set.add(text.slice(i, i + n));
  return set;
}
function dice(a, b) {
  const A = gramsOf(dupNorm(a), 2), B = gramsOf(dupNorm(b), 2);
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const x of A) if (B.has(x)) hit++;
  return (2 * hit) / (A.size + B.size);
}
function overlap(A, B) {
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const x of A) if (B.has(x)) hit++;
  return hit / Math.min(A.size, B.size);
}
const bodyOf = (p) => dupNorm(flatLines(p).filter((l) => l.block !== 'image' && !DUP_FIXED.test(l.t)).map((l) => l.t.replace(/\[\/?[^\]]+\]/g, '')).join(''));
let naverPostsCache = null;
function allNaverPosts() {
  if (naverPostsCache) return naverPostsCache;
  naverPostsCache = [];
  try {
    for (const f of fs.readdirSync('content/posts').filter((x) => x.endsWith('.md'))) {
      try {
        const p = parsePost(fs.readFileSync(`content/posts/${f}`, 'utf8'));
        naverPostsCache.push({ slug: f.replace(/\.md$/, ''), title: p.title, main: p.mainKeyword, grams: gramsOf(bodyOf(p)) });
      } catch { /* 깨진 원고는 그 원고 검사에서 잡힌다 */ }
    }
  } catch { /* 폴더가 없으면 비교할 글이 없다 */ }
  return naverPostsCache;
}
let pubRowsCache = null;
function publishedNaverRows() {
  if (pubRowsCache) return pubRowsCache;
  pubRowsCache = [];
  try {
    for (const row of fs.readFileSync('content/archive/published.tsv', 'utf8').split(/\r?\n/).slice(1)) {
      const c = row.split('\t');
      // status=deleted (2026-11-04 사용자가 블로그에서 지운 글) 는 겹침 검사에서 빼고, 링크로도 쓰지 않는다
      if (c[1] === 'naver' && c[3] && c[6] !== 'deleted') pubRowsCache.push({ date: c[0], main: c[3], title: c[4] || c[2] });
    }
  } catch { /* 없으면 건너뛴다 */ }
  return pubRowsCache;
}

let publishedCache = null;
// 2026-11-09 사용자: 생활보장 밖 네이버 카테고리(생활·정보·이슈·연예·맛집)를 모두 비공개로 돌림 → 그 글은 링크·겹침·누락 검사에서 뺀다
export const naverHidden = (c) => c[1] === 'naver' && (c[5] || '') !== '생활보장';
function publishedNaverTitles(channel = 'naver') {
  publishedCache ||= {};
  if (publishedCache[channel]) return publishedCache[channel];
  const set = publishedCache[channel] = new Set();
  try {
    for (const row of fs.readFileSync('content/archive/published.tsv', 'utf8').split(/\r?\n/).slice(1)) {
      const c = row.split('\t');
      if (c[1] === channel && c[4] && c[6] !== 'deleted' && c[6] !== 'private' && !naverHidden(c)) set.add(normTitle(c[4]));
    }
  } catch { /* 목록이 없으면 모두 못 찾음으로 나온다 */ }
  return set;
}

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
const OPEN_OLD = ['안녕하세요', '매일매일 좋은 날을 나누는 성글벙글입니다😊'];
const CLOSE_1 = '좋아요·공감과 이웃추가 부탁드려요💙';
const CLOSE_RE_OLD = /^이상 성글벙글의 .+ 포스팅이었습니다😎$/;
// 2026-11-10 네이버 원고부터 새 인사 (2026-11-09 사용자 — 블로그명 "친근한 설계사의 보험 이야기", 별명 "친근한 설계사"로 바꿈.
// 본문에는 설계사 신분을 넣지 않는다 — 정보글 규칙, 사용자가 "설계사 빼고 친근하게"를 고름). 티스토리는 그대로.
const GREET2_FROM = '2026-11-10';
const OPEN_NEW = ['안녕하세요', '보험이 쉬워지는 이야기, 오늘도 시작할게요😊'];
const CLOSE_RE_NEW = /^이상 친근한 보험 이야기, .+ 편이었습니다😎$/;
const CLOSE_2_HINT = (newGreet) => newGreet ? '이상 친근한 보험 이야기, OO 편이었습니다😎' : '이상 성글벙글의 OO 포스팅이었습니다😎';
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
// 2026-10-15 원고부터 500 미만 불통과 (2026-10-14 사용자 승인 — 280·340·490 같은 작은 말이 검색 유입을 못 만들었다).
const VOLUME_FROM = '2026-10-06';
const MIN_VOLUME_STEPS = [['2026-10-15', 500], [VOLUME_FROM, 100]];
const minVolume = (dated) => MIN_VOLUME_STEPS.find(([from]) => dated >= from)[1];
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
// 2026-10-07 사용자 지시: 맛집·카페는 사용자가 직접 쓴다 → 자동 원고는 보험 → 생활보장, 나머지 전부 → 생활정보
const TWO_CATEGORIES_FROM = '2026-10-08';
function allowedCategories(post, dated) {
  const t = `${post.title} ${post.mainKeyword}`;
  if (dated >= TOPIC_SHIFT_FROM) return /보험/.test(t) ? ['생활보장'] : ['생활정보', '생활보장'];
  if (/보험/.test(t)) return ['생활보장'];
  if (dated >= TWO_CATEGORIES_FROM) return ['생활정보'];
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
  const legacyDay20 = LEGACY_DAY20.has(file.split(/[\\/]/).pop().replace(/\.md$/, ''));
  // 글 하나에만 걸리는 기준(분량·그림·말투·홈판 인사)을 고를 때 쓰는 날짜 — 20편으로 늘린 날의 새 글은 11/3 기준
  const ruleDated = TWENTY_EXTRA.has(dated) && !legacyDay20 ? TWENTY_FROM : dated;
  // 다른 날에서 옮긴 원고 (프런트매터 moved_from: YYYY-MM-DD — 2026-11-04 사용자 배분 변경으로 11/5 생활보장 5편을 11/6 로) 는 쓴 날 기준의 글 하나 규칙(제목 시험·장면·카드 ask)을 쓴다
  const writtenFor = /^\d{4}-\d{2}-\d{2}$/.test(post.movedFrom || '') ? post.movedFrom : dated;
  const newRules = dated >= NEW_RULES_FROM;
  const tistory = forceTistory || /(^|[\\/])content[\\/]tistory[\\/]/.test(file);
  const close1 = tistory ? TISTORY_CLOSE_1 : CLOSE_1;
  const newGreet = !tistory && dated >= GREET2_FROM;
  const OPEN = newGreet ? OPEN_NEW : OPEN_OLD;
  const CLOSE_RE = newGreet ? CLOSE_RE_NEW : CLOSE_RE_OLD;
  const slim = slimOf(ruleDated, tistory, post.slot, post.category);
  const nsChars = slim ? slim.chars : NS_CHARS;
  const minMain = slim ? slim.main : MIN_MAIN;
  const minSub = slim ? slim.sub : MIN_SUB;
  const maxQuotes = slim ? slim.quotes : MAX_QUOTES;
  const errors = [];
  // 한다팀장 모양 (HANDE_FROM) — 생활보장은 홈판형 칸 없이 검색형, 제목은 질문 + 괄호 기준
  if (!tistory && post.category === '생활보장' && dated >= HANDE_FROM && !post.issue) {
    if (post.slot === '홈판') errors.push('2026-11-07 원고부터 생활보장은 홈판형(slot: 홈판)을 쓰지 않습니다 — slot 줄을 지우고 검색형으로 (한다팀장 모양, routines/naver-daily.md 🩺👩‍💼)');
    const t = String(post.title || '');
    if (!/\([^)]*\)\s*$/.test(t)) errors.push('생활보장 제목 끝에 괄호 기준이 없습니다 — "(크기별 추적 기준 · 2026년)"처럼 답의 기준을 괄호로 (한다팀장 모양)');
    if (!/(나요|까요|될까|할까|일까|인가요)\s*(\(|$)/.test(t)) errors.push('생활보장 제목 가운데에 걱정 질문이 없습니다 — "꼭 ~해야 하나요", "~되나요"처럼 (한다팀장 모양)');
  }
  // 하위 카테고리 (2026-11-04 사용자) — 적었으면 블로그에 있는 이름이어야 한다 (scripts/lib/naver-subcategory.mjs)
  if (post.subcategory && !ALL_SUBCATEGORIES.includes(post.subcategory)) errors.push(`subcategory "${post.subcategory}" 는 블로그에 없는 이름 — ${ALL_SUBCATEGORIES.join(' / ')} 중 하나 (비우면 저절로 고른다)`);
  const notes = [];

  if (!post.title) errors.push('title 이 없습니다.');
  if (!post.mainKeyword) errors.push('main_keyword 가 없습니다.');
  // 함께 보면 좋은 글 (2026-10-07 사용자 승인): 발행이 끝난 내 네이버 글 제목 1~2개. 발행 때 주소로 바뀐다
  if (post.related.length) {
    // 티스토리 (2026-11-03 사용자 승인): 발행된 티스토리 글 1~3개 — 색인 안 된 옛 글로 가는 길
    const maxRel = tistory ? 3 : 2, ch = tistory ? 'tistory' : 'naver', chName = tistory ? '티스토리' : '네이버';
    if (post.related.length > maxRel) errors.push(`related 는 ${maxRel}개까지 (지금 ${post.related.length}개) — 정말 관련 있는 글만`);
    const done = publishedNaverTitles(ch);
    for (const t of post.related) {
      if (normTitle(t) === normTitle(post.title)) errors.push(`related 에 자기 글 제목이 있습니다: ${t}`);
      else if (!done.has(normTitle(t))) errors.push(`related 제목이 content/archive/published.tsv 의 ${chName} 글에 없습니다: "${t}" — 발행이 끝난 글의 제목을 그대로 쓰세요`);
    }
  }
  // 제휴 링크 채널 (2026-10-17 사용자 결정): 네이버 = 브랜드커넥트, 쿠팡 파트너스 = 티스토리만
  if (!tistory && (post.coupang || /쿠팡\s*파트너스|\[쿠팡 링크\]|coupang\.com/.test(texts.join("\n")))) errors.push('네이버 원고에는 쿠팡 링크를 넣지 않습니다 (쿠팡 파트너스는 티스토리만 — content/affiliate/README.md)');
  // 네이버 쇼핑 커넥트 (2026-10-26 사용자): 생활정보 글 하루 1편까지, 대가성 문구는 고정 인사말 바로 다음, [쇼핑 링크] 한 곳
  {
    const hasDisc = post.blocks.some(BC.isDisclosure), markers = post.blocks.filter(BC.isMarker).length;
    if (BC.LINK_IN_TEXT.test(texts.join('\n'))) errors.push('본문에 쇼핑 커넥트 주소를 직접 쓰지 않습니다 — [쇼핑 링크] 자리만 두면 발행 때 링크 카드로 들어갑니다');
    if (post.brandconnect || hasDisc || markers) {
      if (tistory) errors.push('쇼핑 커넥트(brandconnect)는 네이버 원고에만 씁니다 (티스토리는 쿠팡 파트너스 — content/affiliate/README.md)');
      else if (!post.brandconnect) errors.push(`대가성 문구나 ${BC.MARKER} 가 있는데 프런트매터 brandconnect: 가 없습니다`);
      else {
        if (post.category === '생활보장' || /보험/.test(`${post.title} ${post.mainKeyword}`)) errors.push('생활보장(보험·의료비·돌봄) 글에는 쇼핑 링크를 넣지 않습니다');
        let gi = post.blocks.findIndex((b) => b.type === 'p' && b.lines[0]?.t === OPEN[0] && b.lines[1]?.t === OPEN[1]);
        if (gi < 0 && post.slot === '홈판' && dated >= HOMEFEED4_FROM) gi = 0; // 인사 없는 홈판형 — 첫 문장 바로 다음
        if (!(gi >= 0 && BC.isDisclosure(post.blocks[gi + 1] || {}))) errors.push(`고정 인사말(인사 없는 홈판형은 첫 문장) 바로 다음 덩어리에 대가성 문구 두 줄을 그대로: "${BC.DISCLOSURE.join(' / ')}"`);
        if (markers !== 1) errors.push(`${BC.MARKER} 한 줄짜리 덩어리가 정확히 1곳 있어야 합니다 (지금 ${markers}곳) — 정리 소제목 아래 끝쪽`);
        const dir = file.replace(/[^\\/]+$/, '') || './', me = file.split(/[\\/]/).pop();
        const same = daySibs(dir, dated).filter((f) => f !== me)
          .filter((f) => /^brandconnect:\s*\S/m.test(fs.readFileSync(dir + f, 'utf8')));
        const bcMax = isTwenty(dated) ? TW.brandconnect : 1;
        if (same.length >= bcMax) errors.push(`쇼핑 커넥트 글은 하루 ${bcMax}편까지 — 같은 날 ${same.join(', ')}`);
        const l = BC.loadLinks().get(post.brandconnect);
        notes.push(`쇼핑 커넥트 글: ${post.brandconnect} ${l ? '(링크 있음)' : '— 발행하는 날 아침 PC 가 이 말로 링크를 만들어 넣어요. 못 만들면 쇼핑 부분을 빼고 보통 글로 나갑니다'}`);
      }
    }
  }
  // 출처 원문 링크 (2026-10-19 원고부터, 네이버)
  {
    const srcOne = texts.some((t) => SOURCE_ONE.test(t));
    const issuePost = !tistory && post.issue && dated >= ISSUE_FROM;
    if (issuePost && !post.sourceUrls.length) errors.push('이슈 글은 프런트매터 source_url 에 실제로 읽은 보도·발표 주소 1~2개를 적습니다 (언론사 기사·소속사·정부 보도자료)');
    if (post.sourceUrls.length && tistory) errors.push('source_url 은 네이버 원고에만 씁니다 (티스토리는 아직 지원하지 않음)');
    else if (post.sourceUrls.length && !srcOne) errors.push('source_url 은 출처 ①(기관 자료 — "…에서 확인한 정보를 바탕으로 정리했어요") 글에만 답니다');
    else if (!tistory && srcOne && dated >= SOURCE_URL_FROM && !post.sourceUrls.length)
      errors.push(`출처 ① 글은 프런트매터 source_url 에 실제로 확인한 원문 주소 1~2개를 적습니다 (${SOURCE_URL_FROM} 원고부터) — 확인한 원문 주소가 없으면 그 기관 이름을 출처로 쓰지 않습니다`);
    if (post.sourceUrls.length > 2) errors.push(`source_url 은 2개까지 (지금 ${post.sourceUrls.length}개)`);
    for (const u of post.sourceUrls) {
      let url = null;
      try { url = new URL(u); } catch { /* 아래에서 잡는다 */ }
      if (!url || url.protocol !== 'https:' && url.protocol !== 'http:') errors.push(`source_url 이 주소 형식이 아닙니다: ${u}`);
      else if (issuePost ? ISSUE_NOT_SOURCE.test(url.hostname) : NOT_PRIMARY.test(url.hostname)) errors.push(issuePost ? `이슈 글 source_url 은 언론사 기사·소속사·정부 발표 주소여야 합니다 — 블로그·카페·커뮤니티·SNS·영상·나무위키 안 됨: ${u}` : `source_url 은 1차 원문(기관·법령·학술지) 주소여야 합니다 — 블로그·카페·뉴스·영상·검색 주소 안 됨: ${u}`);
      // 파일 내려받기 주소는 링크 카드가 안 만들어져 발행 때 빠진다 (2026-10-26 law.go.kr flDownload.do 2편 모두 빠짐)
      else if (dated >= '2026-10-27' && FILE_DOWNLOAD.test(url.pathname + url.search))
        errors.push(`source_url 에 파일 내려받기 주소(PDF·HWP·flDownload)는 링크 카드가 안 만들어져 빠집니다 — 그 자료를 보여 주는 웹 화면 주소(법령 본문·보도자료 화면)로 바꾸세요: ${u}`);
    }
    if (post.sourceUrls.length) notes.push(`출처 원문 링크(발행 때 출처 줄 아래 카드): ${post.sourceUrls.join(' , ')}`);
  }
  // 티스토리 카테고리 (2026-10-05 사용자 지시): 생활보장·생활정보 두 개만. 보험 → 생활보장, 나머지 → 생활정보
  if (tistory && dated >= '2026-10-06') {
    // 2026-11-03 원고부터 티스토리 생활보장 하루 2편 = 의료비·돌봄 제도 글도 (2026-11-01 사용자, routines/tistory-daily.md 🔟 ⓑ) — 네이버처럼 보험 글만 생활보장으로 못 박고 나머지는 둘 다 허용
    const insur = /보험/.test(`${post.title} ${post.mainKeyword}`);
    const want = insur ? '생활보장' : '생활정보';
    const okCat = isTwenty(dated) && !insur ? ['생활정보', '생활보장'].includes(post.category) : post.category === want;
    if (!okCat) errors.push(`티스토리 category 는 "${want}" 여야 합니다 (지금 "${post.category || '없음'}") — 티스토리는 생활보장·생활정보 두 개만 씁니다`);
  }
  // 네이버 카테고리: 보험 → 생활보장, 나머지(음식·제철 글 포함) → 생활정보 (2026-10-07 사용자 지시 — 맛집·카페는 사용자가 직접 쓴다).
  // 2026-10-07 원고까지는 예전 기준(음식·카페·맛집 → 맛집·카페)
  if (!tistory && dated >= CATEGORY_FROM) {
    const ok = allowedCategories(post, dated);
    const why = dated >= TOPIC_SHIFT_FROM ? '보험·의료비·돌봄 제도 글은 생활보장, 살림 글은 생활정보' : dated >= TWO_CATEGORIES_FROM ? '보험은 생활보장, 나머지는 전부 생활정보 (맛집·카페는 사용자가 직접 씁니다)' : '보험은 생활보장, 음식·카페·맛집은 맛집·카페, 나머지는 생활정보';
    if (!ok.includes(post.category)) errors.push(`category 는 "${ok.join('" 또는 "')}" 여야 합니다 (지금 "${post.category || '없음'}") — ${why}`);
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
    else if (v < minVolume(dated)) errors.push(`메인 키워드 "${post.mainKeyword}" 월 검색량 ${v} — ${minVolume(dated)} 이상인 말로 바꾸세요 (1,000~10,000 우선)`);
    else if (post.issue && dated >= ISSUE_FROM) notes.push(`이슈 글 메인 키워드 "${post.mainKeyword}" 월 검색량 ${v.toLocaleString()} (상한 없음)`);
    else if (dated >= TOPIC_SHIFT_FROM && v > (!tistory && dated >= SPLIT2_FROM && post.category === '생활보장' ? MAIN_MAX_CARE : MAIN_MAX)) errors.push(`메인 키워드 "${post.mainKeyword}" 월 검색량 ${v.toLocaleString()} — ${(!tistory && dated >= SPLIT2_FROM && post.category === '생활보장' ? MAIN_MAX_CARE : MAIN_MAX).toLocaleString()} 넘는 말은 최적화 블로그가 차지해 우리 글이 유입을 못 받았습니다. 서브로 쓰고, 메인은 그 말의 자동완성·연관 중 1,000~10,000 인 구체적인 말로`);
    else notes.push(`메인 키워드 "${post.mainKeyword}" 월 검색량 ${v.toLocaleString()}`);
  }
  const bundle = dated >= BUNDLE_FROM;
  if (post.title.length > (bundle ? 45 : newRules ? 40 : 30)) notes.push(`제목이 깁니다 (${post.title.length}자). 모바일에서 잘릴 수 있습니다.`);


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
    const fmt0 = useFormat ? FORMATS[post.format] : FORMATS.기본;
    const fmt = fmt0 && slim ? { ...fmt0, qa: SLIM_QA[post.format] || fmt0.qa } : fmt0;
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
      const sib = daySibs(dir, dated);
      const fmts = sib.map((f) => { try { return parsePost(fs.readFileSync(dir + f, 'utf8')).format; } catch { return ''; } });
      const same = fmts.filter((x) => x === post.format).length;
      // 티스토리는 2026-11-03 원고부터 하루 10편 (2026-11-01 사용자) — 10편 날처럼 같은 모양 3편까지
      const maxSame = !tistory && isTwenty(dated) ? TW.format : (tistory && isTwenty(dated)) || isTen(dated) ? 3 : 2;
      if (same > maxSame) errors.push(`같은 날(${dated}) "${post.format}" 모양이 ${same}편 — ${maxSame}편까지만 (모양을 돌려 쓰세요)`);
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
    if (charsNS < nsChars[0]) errors.push(`본문이 짧습니다: 공백 제외 ${charsNS}자 (최소 ${nsChars[0]})`);
    if (charsNS > nsChars[1]) errors.push(`본문이 깁니다: 공백 제외 ${charsNS}자 (최대 ${nsChars[1]})`);
  } else {
    if (chars < MIN_CHARS) errors.push(`본문이 짧습니다: ${chars}자 (최소 ${MIN_CHARS})`);
    if (chars > MAX_CHARS) errors.push(`본문이 깁니다: ${chars}자 (최대 ${MAX_CHARS})`);
  }
  if (post.mainKeyword && mainN < minMain)
    errors.push(`메인 키워드 "${post.mainKeyword}" ${mainN}회 — ${minMain}회 이상 필요`);
  for (const [k, n] of subN)
    if (n < minSub) errors.push(`서브 키워드 "${k}" ${n}회 — ${minSub}회 이상 필요`);

  // 제목은 메인 키워드로 시작해야 한다 (타깃 키워드를 첫 어절에)
  if (post.mainKeyword) {
    const t = post.title.replace(/\s/g, ''), k = post.mainKeyword.replace(/\s/g, '');
    if (!t.startsWith(k)) errors.push(`제목이 메인 키워드로 시작하지 않습니다: "${post.title}"`);
  }
  // 제목 키워드 비율: 제목(공백 제외) 글자 중 메인·서브 키워드가 덮는 비율
  let titleKw = null;
  {
    // 끝 괄호(숫자·기준)는 키워드 비율에서 뺀다 (10/12 변경 묶음)
    const tb = titleBracket(post.title);
    const t = (tb ? post.title.slice(0, tb.index) : post.title).replace(/\s/g, '');
    const cover = new Array(t.length).fill(false);
    for (const kw of [post.mainKeyword, ...post.subKeywords]) {
      const k = (kw || '').replace(/\s/g, ''); if (!k) continue;
      for (let i = t.indexOf(k); i !== -1; i = t.indexOf(k, i + 1)) for (let j = i; j < i + k.length; j++) cover[j] = true;
    }
    const subsIn = post.subKeywords.filter((kw) => t.includes(kw.replace(/\s/g, '')));
    titleKw = { ratio: t.length ? cover.filter(Boolean).length / t.length : 0, subs: subsIn };
    const homefeedSlot = !tistory && dated >= SPLIT2_FROM && post.slot === '홈판';
    if (homefeedSlot) {
      if (tb) notes.push(`홈판형(slot: 홈판) 제목은 괄호 숫자 없이 공감형으로 씁니다: "${post.title}"`);
      if (!post.issue && !post.extra && writtenFor >= TITLE_TEST.from && writtenFor <= TITLE_TEST.to) {
        const twist = TWIST_RE.test(post.title);
        if (!['반전', '기본'].includes(post.titleTest)) errors.push(`홈판형 제목 시험(${TITLE_TEST.from}~${TITLE_TEST.to} 원고) — 프런트매터 title_test: 반전 | 기본 을 적으세요 (routines/naver-daily.md 🔀 상자)`);
        else if (post.titleTest === '반전' && !twist) errors.push(`title_test: 반전 인데 제목에 뒤집는 말("~인 줄 알았는데"·"알고 보니"·"오히려"·"사실은"…)이 없습니다: "${post.title}"`);
        else if (post.titleTest === '기본' && twist) errors.push(`title_test: 기본 인데 제목에 반전 말이 있습니다 — 기본 쪽은 반전 없이 써야 비교가 됩니다: "${post.title}"`);
      }
    } else if (!tistory && dated >= WEEK_TEST_FROM) {
      const head = (tb ? post.title.slice(0, tb.index) : post.title).trim();
      if (!TITLE_QUESTION.test(head)) errors.push(`제목은 "메인 키워드, 질문 (숫자)" 모양으로 — 괄호 앞이 질문(…나요/…까/…?)으로 끝나야 합니다: "${post.title}"`);
      if (subsIn.length > 1) notes.push(`제목에 서브 키워드가 ${subsIn.length}개 — 키워드를 늘어놓지 말고 질문 하나로`);
    } else if (newRules) {
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

  if (writtenFor >= SCENE_FROM) {
    const bodyText = texts.join('\n');
    if (!SCENE_RE.test(bodyText)) errors.push("'예를 들면' 장면이 없습니다 — 독자가 겪을 법한 장면을 \"~라면\", \"예를 들어\", \"이맘때\", \"~하기 쉬워요\" 로 하나 이상 (CLAUDE.md 장면·경험·대화)");
    if (!QUOTE_RE.test(bodyText)) errors.push('따옴표 대화 장면이 없습니다 — 독자가 할 법한 말 한 줄을 "…?" 처럼 따옴표로 (CLAUDE.md 장면·경험·대화)');
    const nm = NAMED_RE.exec(bodyText);
    if (nm) errors.push(`이름 붙인 인물·실화처럼 보이는 표현 "${nm[0]}" — 사용자 실제 경험(content/experience/notes.md)이 아니면 쓰지 않습니다`);
    const exp = (/^experience:\s*(\S+)/m.exec(fs.readFileSync(file, 'utf8').split(/^---\s*$/m)[1] || '') || [])[1];
    if (exp) {
      let notes = ''; try { notes = fs.readFileSync('content/experience/notes.md', 'utf8'); } catch { /* 없음 */ }
      if (!new RegExp('^' + exp + '\\s*\\|', 'm').test(notes)) errors.push(`experience: ${exp} 가 content/experience/notes.md 에 없습니다 — 사용자 실제 경험 메모만 실화로 씁니다`);
    }
  }
  // 네이버 글 주제 (발행 패널) — 프런트매터 topic 이 네이버 목록에 없는 이름이면 발행 때 고르지 못한다
  // 이슈 글 (2026-11-06 원고부터)
  if (post.issue) {
    if (tistory) errors.push('issue: 는 네이버 원고에만 씁니다');
    else if (dated < ISSUE_FROM) errors.push(`이슈 글은 ${ISSUE_FROM} 원고부터입니다`);
    else {
      if (!ISSUE_KINDS.includes(post.issue)) errors.push(`issue 는 "${ISSUE_KINDS.join('" 또는 "')}" 입니다 (지금 "${post.issue}")`);
      if (post.slot !== '홈판') errors.push('이슈 글은 slot: 홈판 과 함께 씁니다');
      if (post.category !== '생활정보') errors.push('이슈 글 카테고리는 생활정보입니다 (블로그 카테고리가 생활정보·생활보장 두 개뿐)');
      const okT = ISSUE_TOPICS[post.issue] || [];
      if (okT.length && !okT.includes(post.topic)) errors.push(`이슈(${post.issue}) 글은 topic: 을 ${okT.join('·')} 중 하나로 적습니다 (지금 "${post.topic || '없음'}")`);
      // 실존 인물 얼굴을 AI 그림으로 만들지 않는다 — 그림 계획서 프롬프트에 인물 이름(people:)이 들어가면 막는다
      const people = String(post.people || '').split(/[|,]/).map((x) => x.trim()).filter(Boolean);
      if (post.issue === '연예' && !people.length) errors.push('연예 이슈 글은 프런트매터 people: 에 글에 나오는 실존 인물 이름을 적습니다 (그림 프롬프트에 들어가지 않게 검사)');
      const plan = planOf(file);
      if (plan) {
        const txt = (plan.images || []).map((im) => `${im.prompt || ''} ${im.kind === 'photo' ? '' : im.title || ''} ${im.thumb_person || ''}`).join(' ');
        for (const n of people) if (n.length >= 2 && txt.includes(n)) errors.push(`그림 계획서에 실존 인물 이름 "${n}" 이 있습니다 — 실존 인물 얼굴·닮은 그림은 만들지 않습니다. 장소·물건·글자 카드로 바꾸세요 (대표사진 글씨(overlay)·정보 카드 글자에 이름을 넣는 것은 괜찮습니다)`);
      }
      notes.push(`이슈 글(${post.issue}) — 출처 매체 2곳 이상으로 확인한 사실만, 추측·지어낸 말 없이`);
      { const g = guessTopic({ title: post.title, mainKeyword: post.mainKeyword, issue: post.issue }); if (post.issue === '연예' && g !== '스타·연예인' && post.topic && post.topic !== g) notes.push(`주제 확인: 제목으로는 "${g}" 같은데 topic 은 "${post.topic}" — 드라마=드라마, 예능=방송, 영화=영화, 가요=음악, 사람 소식=스타·연예인`); }
    }
  }
  // 공식 사진 (2026-11-02, 이슈 글) — kind: "photo" 그림은 photo.query/page + 대신 그릴 prompt, 원고에 [사진 출처 N] 줄
  {
    const plan = planOf(file);
    const photos = (plan?.images || []).filter((im) => im.kind === 'photo');
    const raw = fs.readFileSync(file, 'utf8');
    for (const im of photos) {
      // 티스토리는 장면 사진(대표사진 아닌 칸)에 무료 고화질 사진을 쓸 수 있다 (2026-11-04 사용자 — "티스토리도 사진 고화질로", 비용은 늘리지 않음)
      if (!post.issue && !(tistory && im.n !== 1)) errors.push(`${im.n}번 공식 사진(kind: photo)은 이슈 글(issue:)·티스토리 장면 칸에만 씁니다`);
      if (tistory && !post.issue && (im.photo?.person || im.photo?.still)) errors.push(`${im.n}번: 티스토리 생활 글 사진은 사람 이름·방송 장면 없이 장면·사물(photo.scene_en·query_en)로만 찾습니다`);
      if (!im.photo || !(im.photo.file || im.photo.query || im.photo.query_en || im.photo.scene_en || im.photo.person || im.photo.page || im.photo.still)) errors.push(`${im.n}번 공식 사진: photo.query(이름·장소) 또는 photo.page(정책브리핑 기사 주소)를 적습니다`);
      // 방송사 장면 사진 인용 (2026-11-03 사용자) — 저작권법 28조 인용 조건: 본문 1~2장, 대표사진 아님, 방송사 공식 사이트, 출처 줄
      if (im.photo?.still) {
        const st = im.photo.still;
        if (post.issue !== '연예') errors.push(`${im.n}번 장면 사진(photo.still)은 연예 이슈 글에만 씁니다`);
        if (st.youtube && !/^[\w-]{11}$/.test(String(st.youtube))) errors.push(`${im.n}번 still.youtube 는 방송사 공식 채널 영상 ID 11자리`);
        if (st.youtube_search && (!st.youtube_search.query || !(st.youtube_search.must || []).length)) errors.push(`${im.n}번 still.youtube_search 에 query 와 must(제목에 꼭 있을 말)를 적습니다`);
        if (!st.youtube && !st.youtube_search && !stillHostOk(st.page)) errors.push(`${im.n}번 still.page 는 방송사·OTT 공식 사이트만 (scripts/lib/broadcast-still.mjs STILL_HOSTS): ${st.page || '없음'}`);
        if (!st.owner || !st.program) errors.push(`${im.n}번 still 에 owner(방송사)·program(프로그램 이름)을 적습니다 — 출처 줄에 들어갑니다`);
      }
      if (im.photo?.page && !/^https:\/\/(www\.)?korea\.kr\//.test(im.photo.page)) errors.push(`${im.n}번 photo.page 는 정책브리핑(korea.kr) 주소만 — 언론사 사진은 쓰지 않습니다`);
      if (!im.prompt) errors.push(`${im.n}번 공식 사진: 못 찾을 때 대신 그릴 prompt 를 적습니다 (실존 인물 없이)`);
      // 인물 사진은 그 사람 혼자 (2026-11-03 사용자 — 소연 글에 티아라 단체 사진). 연예 글의 사진엔 photo.person(영문·한글 이름들)을 적고, file 을 적었으면 제목에 그 이름이 있어야
      if (post.issue === '연예' && dated >= '2026-11-04') {
        const person = [].concat(im.photo?.person || []).filter(Boolean);
        if (!person.length && !im.photo?.still) errors.push(`${im.n}번 공식 사진: 연예 글은 photo.person 에 그 사람 이름을 적습니다 (예: ["Soyeon", "So-yeon", "소연"]) — 혼자 나온 그 사람 사진만 고릅니다`);
        else for (const f of [].concat(im.photo?.file || [])) if (!soloOk(String(f).replace(/^File:/, ''), person)) errors.push(`${im.n}번 photo.file "${f}" — 제목에 ${person.join('/')} 이름이 없거나 단체 사진으로 보입니다. 그 사람 혼자 나온 사진 파일로`);
      }
      if (!new RegExp(`^\\[이미지 ${im.n}\\][^\\n]*\\n\\[사진 출처 ${im.n}\\]\\s*$`, 'm').test(raw)) errors.push(`${im.n}번 공식 사진: 원고의 [이미지 ${im.n}] 바로 다음 줄에 "[사진 출처 ${im.n}]" 을 둡니다 (발행 때 출처 글자로 바뀜)`);
    }
    const stills = photos.filter((im) => im.photo?.still).length;
    // 2026-11-03 사용자 — 대표사진도 그 프로그램 공식 사진으로 (닥터X 글을 SBS 사진 대표로 직접 발행). 대표 1 + 본문 2 = 3장까지
    if (stills > 3) errors.push(`방송사 장면 사진이 ${stills}장 — 한 글에 3장까지(대표 1 + 본문 2, 글이 주인공)`);
    for (const m of raw.matchAll(/^\[사진 출처 (\d+)\]/gm)) if (!photos.some((im) => im.n === Number(m[1]))) errors.push(`[사진 출처 ${m[1]}] 줄이 있는데 계획서 ${m[1]}번이 kind: photo 가 아닙니다`);
  }
  if (!tistory && post.topic && topicFor(post) === null) errors.push(`topic "${post.topic}" 은 네이버 주제 목록에 없습니다 (scripts/lib/naver-topic.mjs NAVER_TOPICS)`);
  if (!tistory && dated >= SPELL_TEST[0] && topicFor(post) === '교육·학문') {
    if (dated > SPELL_TEST[1]) errors.push('맞춤법 시험은 2026-11-17 원고까지입니다 — 11/18 판정 전에는 쓰지 않습니다 (routines/naver-daily.md ⓓ-2)');
    else {
      const dir = file.replace(/[^\\/]+$/, '') || './';
      const n = daySibs(dir, dated).filter((f) => { try { return topicFor(parsePost(fs.readFileSync(dir + f, 'utf8'))) === '교육·학문'; } catch { return false; } }).length;
      if (n > 1) errors.push(`같은 날(${dated}) 맞춤법 글이 ${n}편 — 시험은 하루 1편(14:40 칸)`);
      if (post.category !== '생활정보') errors.push('맞춤법 글 카테고리는 생활정보입니다');
    }
  }
  // standards/이미지-기준.md — 한 글에 8장 (대표 1 + 본문 7). 네이버는 2026-10-20 원고부터 빠지면 막는다
  // 2026-11-03 원고부터 네이버 6장·티스토리 4장 (위 SLIM_FROM) — 둘 다 맞지 않으면 막는다
  const imgWant = slim ? slim.imgs : 8;
  if ((images.length || slim) && images.length !== imgWant)
    (slim || (!tistory && dated >= TOPIC_SHIFT_FROM) ? errors : notes).push(`이미지 자리 ${images.length}개 — ${imgWant}개 기준입니다.`);
  // 하루 배분: 2026-10-20 생활정보 4 + 생활보장 1 → 10-26 생활보장 3 + 생활정보 2 → 10-27 생활보장 4 + 생활정보 1
  if (!tistory && dated >= TOPIC_SHIFT_FROM) {
    const dir = file.replace(/[^\\/]+$/, '') || './';
    const sib = daySibs(dir, dated);
    const split3 = dated >= SPLIT3_FROM;
    const twenty = isTwenty(dated);
    const care10 = dated >= CARE10_FROM;
    const full = care10 ? 10 : twenty ? 20 : isTen(dated) ? 10 : split3 ? DAY_TOTAL3 : 5;
    if (sib.length >= (split3 ? 1 : 5)) {
      const sibs = sib.map((f) => { try { return parsePost(fs.readFileSync(dir + f, 'utf8')); } catch { return {}; } });
      const cats = sibs.map((p) => p.category || '');
      const season = twenty && dated >= SEASON_FROM;
      const i12 = twenty && dated >= ISSUE12_FROM && !care10;
      const split = care10 ? SPLIT_CARE10 : i12 ? SPLIT_ISSUE12 : season ? SPLIT_SEASON : twenty ? SPLIT_TWENTY : isTen(dated) ? SPLIT_TEN : split3 ? SPLIT3 : dated >= SPLIT2_FROM ? SPLIT2 : SHIFT_SPLIT;
      const why = care10 ? '2026-11-09 사용자 결정 — 생활보장만 하루 10편 (standards/상담-유입-계획.md)' : i12 ? '2026-11-04 사용자 결정 — 생활보장 5 · 생활정보 3 · 이슈·뉴스 6 · 연예·방송 6' : season ? '2026-11-03 사용자 결정 — 생활보장 10 그대로, 제철·나들이 홈판형 2편' : twenty ? '2026-11-01 사용자 결정 — 하루 20편' : split3 ? '2026-10-26 사용자 결정' : dated >= SPLIT2_FROM ? '2026-10-24 사용자 결정' : '2026-10-19 사용자 결정';
      const done = sib.length >= full;
      if (split3 && sib.length > full) errors.push(`같은 날(${dated}) 네이버 원고 ${sib.length}편 — 하루 ${full}편까지 (${why})`);
      for (const [c, n] of Object.entries(split)) {
        const got = cats.filter((x) => x === c).length;
        if (done ? got !== n : got > n) errors.push(`같은 날(${dated}) ${c} ${got}편 — 하루 생활정보 ${split.생활정보} + 생활보장 ${split.생활보장} (${why})`);
      }
      if (twenty) {
        // 홈판형 14 = 생활정보 8 + 생활보장 6, 검색형 6 (2026-11-01 사용자 — 홈판 비중을 늘린다)
        if (i12) for (const [k, n] of Object.entries(ISSUE12)) {
          const got = sibs.filter((p) => p.issue === k).length;
          if (done ? got !== n : got > n) errors.push(`같은 날(${dated}) 이슈 ${k} ${got}편 — 하루 연예·방송 ${ISSUE12.연예} + 이슈·뉴스 ${ISSUE12.정책} (${why})`);
        }
        const hf = season ? HF_SEASON : HF_TWENTY;
        if (!i12) for (const [c, n] of Object.entries(hf)) {
          const got = sibs.filter((p) => p.category === c && p.slot === '홈판').length;
          if (done ? got !== n : got > n) errors.push(`같은 날(${dated}) ${c} 홈판형(slot: 홈판) ${got}편 — 하루 생활정보 ${hf.생활정보} + 생활보장 ${hf.생활보장}편 (나머지는 검색형)`);
        }
        // 홈판형 제목 시험 — 같은 날 반전·기본 차이 1편 이하 (2026-11-02 사용자)
        if (dated >= TITLE_TEST.from && dated <= TITLE_TEST.to) {
          const tt = sibs.filter((p) => p.slot === '홈판' && !p.issue && !p.extra);
          const nT = tt.filter((p) => p.titleTest === '반전').length, nB = tt.filter((p) => p.titleTest === '기본').length;
          if (done && Math.abs(nT - nB) > 1) errors.push(`같은 날(${dated}) 홈판형 제목 시험 반전 ${nT} · 기본 ${nB}편 — 두 쪽 차이는 1편까지`);
          else if (!done && Math.max(nT, nB) > Math.ceil(tt.length / 2) + 1) errors.push(`같은 날(${dated}) 홈판형 제목 시험 반전 ${nT} · 기본 ${nB}편 — 한쪽으로 몰렸습니다`);
        }
        // 말투 돌려 쓰기 — 같은 주제라도 다른 느낌으로 (2026-11-01 사용자)
        const tones = sibs.map((p) => p.tone || '');
        const sameTone = tones.filter((x) => x && x === post.tone).length;
        if (sameTone > TW.tone) errors.push(`같은 날(${dated}) 말투 "${post.tone}" ${sameTone}편 — ${TW.tone}편까지 (말투를 돌려 쓰세요)`);
      } else if (dated >= SPLIT2_FROM) {
        const hf = sibs.filter((p) => p.slot === '홈판');
        const hf4 = !isTen(dated) && dated >= HOMEFEED4_FROM;
        const hfWant = isTen(dated) ? 2 : hf4 ? HOMEFEED4 : split3 ? HOMEFEED3 : HOMEFEED_PER_DAY;
        if (done ? hf.length !== hfWant : hf.length > hfWant) errors.push(`같은 날(${dated}) 홈판형(slot: 홈판) ${hf.length}편 — 하루 ${hfWant}편 (${hf4 ? '생활정보 1 + 생활보장 2' : '생활정보 글에'})`);
        if (hf4) {
          const life = sibs.filter((p) => p.category === '생활정보');
          if (life.some((p) => p.slot !== '홈판')) errors.push(`같은 날(${dated}) 생활정보 글은 홈판형(slot: 홈판)으로 씁니다 (2026-11-03 원고부터)`);
          if (hf.filter((p) => p.category === '생활보장').length > HOMEFEED4 - 1) errors.push(`같은 날(${dated}) 생활보장 홈판형 — 하루 ${HOMEFEED4 - 1}편까지`);
        } else if (hf.some((p) => p.category !== '생활정보')) errors.push(`홈판형(slot: 홈판)은 생활정보 글에만 붙입니다`);
      }
    }
  }
  // 그림 계획서 slug 는 원고 이름과 같아야 한다 (2026-11-03 — 과천 글을 -v2 로 바꿨는데 계획서 slug 가 옛 이름이라 PC 가 옛 그림 폴더를 썼다)
  { const pl = planOf(file); const me = file.split(/[\\/]/).pop().replace(/\.md$/, '');
    if (pl && pl.slug && pl.slug !== me) errors.push(`그림 계획서 slug "${pl.slug}" 가 원고 이름 "${me}" 와 다릅니다 — content/image-plans/${me}.json 의 slug 를 고치세요`); }
  // 그림체: 클레이 3D → 실사풍 (카테고리 편수 REAL_AFTER 를 넘은 글부터). 정보 카드(kind: card)는 보지 않는다
  if (!tistory && dated >= SPLIT2_FROM && REAL_AFTER[post.category]) {
    const plan = planOf(file);
    if (plan && Array.isArray(plan.images)) {
      const nth = categoryOrdinal(file, post, dated);
      const real = nth > REAL_AFTER[post.category];
      notes.push(`${post.category} ${nth}번째 네이버 글 → 그림 ${real ? '실사풍' : '클레이 3D'} (${Number.isFinite(REAL_AFTER[post.category]) ? REAL_AFTER[post.category] + '편까지 클레이' : '계속 클레이'})`);
      const scenes = plan.images.filter((im) => im.kind !== 'card' && im.prompt);
      const clay = scenes.filter((im) => /clay|plasticine/i.test(im.prompt)).map((im) => im.n);
      if (real && clay.length) errors.push(`${post.category} ${nth}번째 글이라 실사풍입니다 — 이미지 계획서 ${clay.join(', ')}번에 clay 문구가 있습니다 (standards/image-style.json ${post.category === '생활보장' ? 'style_care' : 'style_life'})`);
      const notClay = scenes.filter((im) => !/clay|plasticine/i.test(im.prompt)).map((im) => im.n);
      if (!real && notClay.length) errors.push(`${post.category} ${nth}번째 글이라 ${Number.isFinite(REAL_AFTER[post.category]) ? `아직 클레이 3D 입니다(${REAL_AFTER[post.category]}편까지)` : '클레이 3D 입니다'} — 이미지 계획서 ${notClay.join(', ')}번에 clay 문구가 없습니다 (standards/image-style.json style)`);
    }
  }
  // 대표사진 새 모양·진한 색 (THUMB2_FROM 네이버 원고부터, 티스토리는 THUMB3_FROM 부터)
  if (dated >= (tistory ? THUMB3_FROM : THUMB2_FROM)) {
    const plan = planOf(file);
    if (plan && Array.isArray(plan.images)) {
      const t = plan.images.find((im) => im.n === 1);
      const ov = t?.overlay || {};
      const tl = String(ov.title || '').split('\n');
      const ns = (x) => x.replace(/\s/g, '');
      if (!t) errors.push('대표사진(1번)이 이미지 계획서에 없습니다');
      else {
        const v3 = dated >= THUMB3_FROM;
        const st0 = imageStyle();
        const shot = st0.thumb_shots?.[t.thumb_shot];
        // 이슈 글 + 실제 사진(kind: photo)은 사진을 꽉 채우고 아래 작은 글씨 한 줄(look: news) — 2026-11-02 사용자
        const newsThumb = !!post.issue && t.kind === 'photo' && ov.look === 'news';
        if (newsThumb) { if (ns(String(ov.title || '')).length > 18) errors.push(`이슈 대표사진 아래 글씨는 한 줄 18자 안쪽 (지금 ${ns(String(ov.title || '')).length}자)`); }
        else if (ov.kind !== 'thumb' || ov.look !== 'band') errors.push('대표사진 글씨는 위쪽 띠 모양입니다 — 1번 overlay 에 "kind": "thumb", "look": "band" (standards/이미지-기준.md "대표사진 제목")');
        if (v3) {
          if (!shot) errors.push(`대표사진(1번)에 thumb_shot 이 없거나 목록 밖입니다 (${Object.keys(st0.thumb_shots || {}).join('·')}) — standards/이미지-기준.md "대표사진 구도 섞기"`);
          else if (!(t.prompt || '').includes(shot.prompt)) errors.push(`대표사진 프롬프트에 구도 문구가 없습니다 — "${shot.prompt}"`);
          if (!tistory && post.slot === '홈판' && dated >= HF_STYLE_FROM && !(post.issue && t.kind === 'photo') && !HF_SHOTS.includes(t.thumb_shot))
            errors.push(`홈판형 대표사진은 사람 얼굴이 보이는 구도(${HF_SHOTS.join('·')})로 — 지금 ${t.thumb_shot || '없음'} (2026-11-01 사용자)`);
          if (st0.thumb_band_space && !(t.prompt || '').includes(st0.thumb_band_space)) errors.push(`대표사진 프롬프트에 위쪽 띠 자리 문구가 없습니다 — "${st0.thumb_band_space}"`);
        }
        if (newsThumb) { /* 한 줄, 질문·10자 규칙 없음 */ }
        else if (tl.length !== 2) errors.push(`대표사진 글씨는 두 줄입니다 (지금 ${tl.length}줄) — 첫 줄 메인 키워드, 둘째 줄 질문`);
        else {
          if (post.mainKeyword && !ns(tl[0]).includes(ns(post.mainKeyword)) && !ns(post.mainKeyword).startsWith(ns(tl[0]))) errors.push(`대표사진 첫 줄 "${tl[0]}" 에 메인 키워드 "${post.mainKeyword}" 가 없습니다`);
          if (!/\?$/.test(tl[1].trim())) errors.push(`대표사진 둘째 줄 "${tl[1]}" 은 질문(?로 끝남)으로 씁니다 — 예: "하루 얼마?", "누가 받을까?"`);
          for (const l of tl) if (ns(l).length > 10) errors.push(`대표사진 한 줄 "${l}" 이 ${ns(l).length}자 — 10자 안쪽 (길면 글씨가 작아진다)`);
        }
        if (/\d/.test(ov.title || '')) errors.push('대표사진 글씨에 숫자를 넣지 않습니다 (2026-10-02 사용자 — 숫자 꼬리표 없음)');
        if (!v3 && !/close-up/i.test(t.prompt || '')) errors.push('대표사진 그림은 한 사람 얼굴 가까이입니다 — 1번 프롬프트에 standards/image-style.json thumbnail_closeup 문구를 넣으세요');
        if (/top third of the image as plain/i.test(t.prompt || '')) errors.push('대표사진 그림에 "위쪽 3분의 1 비우기"(thumbnail_space)를 쓰지 않습니다 — thumbnail_closeup 으로');
        // 대표사진마다 사람·색·표정·글씨가 달라 보이게 (2026-10-26 사용자 — 블로그 첫 화면이 모두 민트 목도리 성글이·크림색이라 눈에 안 띄었다)
        const st = imageStyle();
        const theme = st.thumb_themes?.[t.thumb_theme];
        if (!theme) errors.push(`대표사진(1번)에 thumb_theme 이 없거나 목록 밖입니다 (${Object.keys(st.thumb_themes || {}).join('·')})`);
        else {
          if (ov.theme !== t.thumb_theme) errors.push(`대표사진 overlay "theme" 을 thumb_theme 과 같게 ("${t.thumb_theme}")`);
          // 2026-11-04 사용자 "대표사진도 성글벙글 색으로" — 11/7 원고부터 새 장면 색 문구, 그 전 원고는 예전 문구(scene_before)도 통과
          const oldOk = writtenFor < '2026-11-07' && theme.scene_before && (t.prompt || '').includes(theme.scene_before);
          if (!(t.prompt || '').includes(theme.scene) && !oldOk) errors.push(`대표사진 프롬프트에 테마 색 문구가 없습니다 — "${theme.scene}"`);
        }
        const people = !v3 || !shot || shot.사람;
        if (!t.thumb_person) errors.push(`대표사진(1번)에 thumb_person(예: "60대 남성", "30대 엄마와 아이"${v3 ? ', 사람 없는 구도는 "없음"' : ''})이 없습니다 — 글 상황에 맞는 사람`);
        if (!people) { if (t.thumb_mood) errors.push('사람이 없는 구도(object·overhead)에는 thumb_mood 를 적지 않습니다'); }
        else if (!st.thumb_moods?.[t.thumb_mood]) errors.push(`대표사진(1번)에 thumb_mood 가 없거나 목록 밖입니다 (${Object.keys(st.thumb_moods || {}).join('·')})`);
        else if (!(t.prompt || '').includes(st.thumb_moods[t.thumb_mood])) errors.push(`대표사진 프롬프트에 표정 문구가 없습니다 — "${st.thumb_moods[t.thumb_mood]}"`);
        if (/Seonggeul|mint (green )?scarf|apricot knit cardigan|mint green vest/i.test(t.prompt || '')) errors.push('대표사진에는 고정 캐릭터(성글이·할머니·할아버지·자녀)를 쓰지 않습니다 — 글 상황에 맞는 사람을 새로');
        if (ov.font && !['jua', 'ptd'].includes(ov.font)) errors.push('대표사진 overlay "font" 는 jua 또는 ptd');
        // 같은 날 네이버 글끼리 테마·사람·표정이 겹치지 않게, 전날 같은 시각 글과 테마가 겹치지 않게
        const dir = file.replace(/[^\\/]+$/, '') || './';
        const prev = new Date(Date.parse(dated) - 864e5).toISOString().slice(0, 10);
        const me = file.split(/[\\/]/).pop();
        const moodSame = [];
        const shotSame = [];
        const themeSame = [];
        let papers = hasPaper(t.prompt) ? 1 : 0, olds = people && OLD_ONLY(t.thumb_person) ? 1 : 0;
        for (const f of [...daySibs(dir, dated), ...daySibs(dir, prev)]) {
          if (f === me) continue;
          const o1 = planOf(dir + f)?.images?.find((im) => im.n === 1);
          if (!o1) continue;
          const same = f.startsWith(dated);
          let pa = '';
          try { pa = parsePost(fs.readFileSync(dir + f, 'utf8')).publishAt?.slice(11) || ''; } catch { /* 없으면 시각 비교 안 함 */ }
          if (same) {
            if (o1.thumb_theme && o1.thumb_theme === t.thumb_theme) themeSame.push(f);
            if (o1.thumb_person && o1.thumb_person !== '없음' && o1.thumb_person === t.thumb_person) errors.push(`같은 날 ${f} 와 대표사진 사람(${t.thumb_person})이 같습니다`);
            if (o1.thumb_mood && o1.thumb_mood === t.thumb_mood) moodSame.push(f);
            if (v3) {
              if (o1.thumb_shot && o1.thumb_shot === t.thumb_shot) shotSame.push(f);
              if (hasPaper(o1.prompt)) papers++;
              if (o1.thumb_person && OLD_ONLY(o1.thumb_person) && st.thumb_shots?.[o1.thumb_shot]?.사람 !== false) olds++;
            }
          } else if (pa && pa === (post.publishAt || '').slice(11)) {
            if (o1.thumb_theme === t.thumb_theme) errors.push(`전날 같은 시각 글 ${f} 와 대표사진 테마(${t.thumb_theme})가 같습니다`);
            if (v3 && o1.thumb_shot && o1.thumb_shot === t.thumb_shot) errors.push(`전날 같은 시각 글 ${f} 와 대표사진 구도(${t.thumb_shot})가 같습니다`);
          }
        }
        // 표정은 7가지라 10편 날은 같은 표정 2편까지 (5편 날은 모두 다르게)
        const tw = !tistory && isTwenty(dated);
        const ten = (!tistory && isTen(dated)) || (tistory && isTwenty(dated)); // 티스토리 하루 10편 (2026-11-03 원고부터)
        // 테마는 10가지라 20편 날은 같은 테마 2편까지 (그 전은 모두 다르게)
        // 하루 배분 밖 추가 글(extra:)은 같은 날 한도에 넣지 않는다 — 다른 글들은 이 글을 세지 않으므로 이 글도 다른 글 수로 막지 않는다
        if (!post.extra && themeSame.length >= (tw ? TW.theme : 1)) errors.push(`같은 날 ${themeSame.join(', ')} 와 대표사진 테마(${t.thumb_theme})가 같습니다${tw ? ` — 20편 날은 같은 테마 ${TW.theme}편까지` : ''}`);
        if (post.extra) { /* 위와 같은 이유 */ }
        else if (tw && moodSame.length >= TW.mood) errors.push(`같은 날 ${moodSame.join(', ')} 와 대표사진 표정(${t.thumb_mood})이 같습니다 — 20편 날은 같은 표정 ${TW.mood}편까지`);
        else if (!tw && moodSame.length >= (ten ? 2 : 1)) errors.push(`같은 날 ${moodSame.join(', ')} 와 대표사진 표정(${t.thumb_mood})이 같습니다 — ${ten ? '10편 날은 같은 표정 2편까지' : '모두 다르게'}`);
        // 구도·종이·나이도 섞는다 (2026-10-28 사용자 — 사람이 너무 똑같다)
        if (v3) {
          // 홈판형 3편 날은 얼굴 구도(face·duo)가 모자라 같은 구도 2편까지
          const hfFace = !tistory && post.slot === '홈판' && ruleDated >= HF_STYLE_FROM && HF_SHOTS.includes(t.thumb_shot);
          const lim = tw ? (hfFace ? TW.shotHf : TW.shot) : ten || hfFace ? 2 : 1;
          if (shotSame.length >= lim) errors.push(`같은 날 ${shotSame.join(', ')} 와 대표사진 구도(${t.thumb_shot})가 같습니다 — ${tw ? `20편 날은 같은 구도 ${lim}편까지` : ten ? '10편 날은 같은 구도 2편까지' : hfFace ? '홈판형 얼굴 구도는 2편까지' : '5편 모두 다르게'}`);
          const pLim = tw ? TW.papers : ten ? 2 : 1, oLim = tw ? TW.olds : ten ? 4 : 2;
          if (papers > pLim) errors.push(`같은 날 종이·안내문을 든 대표사진이 ${papers}편 — ${pLim}편까지 (주제 사물을 바꾸세요)`);
          if (olds > oLim) errors.push(`같은 날 60대 이상만 나오는 대표사진이 ${olds}편 — ${oLim}편까지 (자녀·보호자·젊은 층이나 사람 없는 구도로)`);
        }
      }
      // 실사풍 글(REAL_AFTER 넘은 편)은 style_care·style_life 라 style_v2 문구를 보지 않는다 (2026-11-01 사용자 — 실사풍 전환)
      const realPost = !tistory && Number.isFinite(REAL_AFTER[post.category]) && categoryOrdinal(file, post, dated) > REAL_AFTER[post.category];
      const flat = realPost ? [] : plan.images.filter((im) => im.kind !== 'card' && im.prompt && !/saturated/i.test(im.prompt)).map((im) => im.n);
      if (flat.length) errors.push(`그림 ${flat.join(', ')}번에 style_v2(파스텔보다 진한 색) 문구가 없습니다 — standards/image-style.json style_v2·palette_v2`);
    }
  }
  // 한다팀장 블로그와 같은 메인 키워드 금지 (2026-10-20 ~ 10-25 네이버 원고). 2026-10-26 원고부터 푼다 —
  // 2026-10-24 사용자: "같은 주제로 써도 돼. 각자 개인 능력으로 하는 블로그라 겹쳐도 의미 없어"
  if (!tistory && dated >= TOPIC_SHIFT_FROM && dated < SPLIT2_FROM && post.mainKeyword) {
    const mk = post.mainKeyword.replace(/\s+/g, '');
    const hit = handeKeywords().find((k) => k === mk);
    if (hit) errors.push(`메인 키워드 "${post.mainKeyword}" 는 한다팀장 블로그가 이미 쓴 말입니다 (content/research/hande-keywords.txt) — 같은 묶음의 다른 질문으로`);
  }

  // 2026-11-09 같은 날 사용자: "이제 같은 사무실에서 일 안 하니까 신경 안 써도 돼" → 끔 (HANDE2_ON). 제목 틀은 그대로 다르게 쓴다(naver-daily 🤝)
  if (HANDE2_ON && !tistory && dated >= HANDE2_FROM && post.mainKeyword && !post.issue) {
    const c = handeClash(post.mainKeyword, handeDated(), dated);
    if (c) errors.push(`메인 키워드 "${post.mainKeyword}" 가 한다팀장 글(${c.date} "${c.kw}")과 같은 말입니다 — 30일 안에는 같은 질병·제도 이름을 쓰지 않습니다. 우리 쪽 몫인 청구·보장 확인 질문(예: "○○ 실비 청구", "○○ 진단비")으로 바꾸거나 다른 글감으로 (content/research/hande-keywords.txt)`);
  }

  if (!tistory && dated >= CARE10_FROM && post.category !== '생활보장' && !post.extra) errors.push(`${CARE10_FROM} 원고부터 네이버는 생활보장 글만 씁니다 (category: 생활보장 — 2026-11-09 사용자 "생활보장으로만", standards/상담-유입-계획.md)`);
  if (!tistory && dated >= CARE10_FROM && post.issue) errors.push(`${CARE10_FROM} 원고부터 이슈·연예 글(issue:)은 쓰지 않습니다 — 보장과 이어지는 제도 소식은 생활보장 글로`);

  // 하루 20편 (2026-11-03 원고부터) — 말투 돌려 쓰기 + 다른 네이버 글과 겹치지 않게 (2026-11-01 사용자:
  //   "같은 주제여도 다른 느낌 다른 말투 다른 내용으로… 최대한 겹치지 않고 중복 컨텐츠가 되지 않도록")
  if (!tistory && isTwenty(dated)) {
    if (!TONES[post.tone] && !legacyDay20) errors.push(`프런트매터 tone(말투)이 없거나 모르는 값입니다 ("${post.tone}") — ${Object.keys(TONES).join(' / ')} 중 하나 (routines/naver-daily.md 🔟 상자)`);
    const me = file.split(/[\\/]/).pop().replace(/\.md$/, '');
    const myGrams = gramsOf(bodyOf(post));
    const sq = (x) => (x || '').replace(/\s+/g, '');
    const days = (a, b) => Math.round(Math.abs(Date.parse(a) - Date.parse(b)) / 864e5);
    for (const o of allNaverPosts()) {
      if (o.slug === me) continue;
      const od = o.slug.slice(0, 10);
      if (post.mainKeyword && sq(o.main) === sq(post.mainKeyword)) {
        if (days(od, dated) <= DUP.mainDays) errors.push(`메인 키워드 "${post.mainKeyword}" 를 ${o.slug} 도 씁니다 — ${DUP.mainDays}일 안에는 같은 메인 키워드를 다시 쓰지 않습니다 (같은 묶음의 다른 질문으로)`);
      }
      const ts = dice(post.title, o.title);
      if (ts >= DUP.title) errors.push(`제목이 ${o.slug} 와 너무 비슷합니다 (유사도 ${Math.round(ts * 100)}%) — 다른 질문·다른 장면으로`);
      else if (ts >= DUP.titleNote) notes.push(`제목이 ${o.slug} 와 비슷한 편이에요 (${Math.round(ts * 100)}%)`);
      const ov = overlap(myGrams, o.grams);
      if (ov >= DUP.body) errors.push(`본문이 ${o.slug} 와 ${Math.round(ov * 100)}% 겹칩니다 (10글자 조각) — ${Math.round(DUP.body * 100)}% 아래로, 다른 내용·다른 말투로`);
      else if (ov >= DUP.bodyNote) notes.push(`본문이 ${o.slug} 와 ${Math.round(ov * 100)}% 겹쳐요`);
    }
    // 이미 발행해 지운 글 (published.tsv) — 같은 메인 키워드
    for (const r of publishedNaverRows()) {
      if (!post.mainKeyword || sq(r.main) !== sq(post.mainKeyword)) continue;
      const d = days(r.date, dated);
      if (d <= DUP.mainDays) errors.push(`메인 키워드 "${post.mainKeyword}" 는 ${r.date} 에 이미 썼습니다 (${r.title}) — ${DUP.mainDays}일 안에는 다시 쓰지 않습니다`);
      else notes.push(`메인 키워드 "${post.mainKeyword}" 는 ${r.date} 에 쓴 말이에요 (${r.title}) — 그 글과 다른 질문·다른 내용인지 확인`);
    }
  }

  // 고정 인사말. 2026-10-12 원고부터는 그 앞에 사실 한 문장(1~2줄) 덩어리가 먼저 온다
  if (bundle) {
    const [first, second] = post.blocks;
    const greet = second?.lines.map((l) => l.t) || [];
    const greetOk = greet.length === 2 && greet[0] === OPEN[0] && greet[1] === OPEN[1];
    // 홈판형은 고정 인사 없이 바로 본론 (2026-11-01 사용자 — 11/2 원고부터 빼도 되고, 11/3 원고부터는 빼야 한다)
    const hfNoGreet = !tistory && post.slot === '홈판' && dated >= HOMEFEED4_FROM;
    if (!first || first.type !== 'p' || first.lines.length > 2 || first.lines[0].t === OPEN[0])
      errors.push(`첫 덩어리는 ${hfNoGreet ? '' : '고정 인사말 앞의 '}"확인된 사실 한 문장"(1~2줄)이어야 합니다 (2026-10-12 원고부터)${hfNoGreet ? '' : ` — 빈 줄 다음에 "${OPEN[0]} / ${OPEN[1]}"`}`);
    else if (!greetOk && !hfNoGreet)
      errors.push(`사실 한 문장 다음 덩어리가 고정 인사말 "${OPEN[0]} / ${OPEN[1]}" 이어야 합니다`);
    else if (greetOk && hfNoGreet && ruleDated >= HF_STYLE_FROM)
      errors.push(`홈판형(slot: 홈판)은 고정 인사말 없이 첫 문장 다음 바로 본론으로 씁니다 (2026-11-03 원고부터) — "${OPEN[0]} / ${OPEN[1]}" 두 줄을 빼세요 (닫는 인사는 그대로)`);
    else {
      const lead = first.lines.map((l) => l.t).join(' ');
      notes.push(`첫 줄 사실(발행 때 인용구): ${lead}`);
      if (dated >= LEAD_KW_FROM) {
        const sq = (x) => x.replace(/\s+/g, '');
        const lk = post.leadKeyword;
        if (first.lines.some((l) => l.s || l.segs)) errors.push('첫 인용구(사실 한 문장)에는 색 강조를 넣지 않습니다');
        if (!lk) errors.push(`프런트매터에 lead_keyword 가 없습니다 (${LEAD_KW_FROM} 원고부터) — 첫 인용구에 넣을, 제목·메인·서브와 다른 같은 주제 검색어`);
        else {
          if (!sq(lead).includes(sq(lk))) errors.push(`첫 인용구에 lead_keyword "${lk}" 가 없습니다: "${lead}"`);
          const taken = [post.mainKeyword, ...post.subKeywords].filter(Boolean).map(sq);
          const clash = taken.filter((k) => k.includes(sq(lk)) || sq(lk).includes(k));
          if (clash.length) errors.push(`lead_keyword "${lk}" 가 메인·서브 키워드와 겹칩니다 — 같은 주제의 다른 검색어로`);
          else if (sq(post.title).includes(sq(lk))) errors.push(`lead_keyword "${lk}" 가 제목에 이미 있습니다 — 제목에 없는 검색어로`);
          const v = volumeOf(lk);
          notes.push(v == null ? `첫 인용구 키워드 "${lk}" 검색량 자료 없음 — keyword-queue.txt 에 넣어 두세요` : `첫 인용구 키워드 "${lk}" 월 검색량 ${v.toLocaleString()}`);
        }
      }
    }
  } else if (texts[0] !== OPEN[0] || texts[1] !== OPEN[1])
    errors.push(`오프닝이 고정 문구와 다릅니다. "${OPEN[0]} / ${OPEN[1]}" 로 시작해야 합니다.`);

  // 제목 끝 괄호에 구체 숫자·기준 (2026-10-12 원고부터). 원고에서 확인한 숫자만 — 괄호 속 숫자가 본문에 있어야 한다
  if (bundle && !(!tistory && dated >= SPLIT2_FROM && post.slot === '홈판')) {
    const tb = titleBracket(post.title);
    if (!tb || !/\d/.test(tb[1])) errors.push(`제목 끝에 숫자·기준을 담은 괄호를 붙입니다 (2026-10-12 원고부터, 예: "… (중불 20~30분)"): "${post.title}"`);
    else {
      const bodyNums = new Set((texts.join(' ').match(/\d+(\.\d+)?/g) || []));
      const miss = (tb[1].match(/\d+(\.\d+)?/g) || []).filter((n) => !bodyNums.has(n));
      if (miss.length) errors.push(`제목 괄호의 숫자 ${miss.join(', ')} 가 본문에 없습니다 — 본문에서 확인한 숫자만 씁니다`);
    }
  }

  // 정보 카드·대표사진 카드 틀 (2026-10-12 원고부터) — 이미지 계획서를 본다
  if (bundle) {
    const plan = planOf(file);
    if (!plan) notes.push('이미지 계획서가 아직 없어 정보 카드 검사를 건너뜁니다 — 계획서를 쓴 뒤 다시 돌리세요');
    else {
      const cards = plan.images.filter((im) => im.kind === 'card');
      const want = slim ? slim.cards : !tistory && dated >= WEEK_TEST_FROM ? CARDS_WEEK_TEST : CARDS;
      if (slim && plan.images.length !== slim.imgs) errors.push(`이미지 계획서가 ${plan.images.length}장 — ${slim.imgs}장이어야 합니다 (원고 [이미지 N] 자리와 같게)`);
      if (cards.length < want[0] || cards.length > want[1]) errors.push(`정보 카드(kind "card")는 ${plan.images.length}장 중 ${want[0]}~${want[1]}장 (지금 ${cards.length}장)`);
      const bodyPlain = plain(texts.join(''));
      for (const im of cards) {
        if (im.n === 1) errors.push('1번(대표사진)은 정보 카드로 만들지 않습니다');
        for (const b of checkCard(im.card)) errors.push(`${im.n}번 카드: ${b}`);
        if (writtenFor >= ASK_FROM && !['classic', 'memo'].includes(im.card?.style) && !['number', 'quiz', 'selfcheck'].includes(im.card?.type) && !String(im.card?.ask || '').trim()) errors.push(`${im.n}번 카드: card.ask(질문 말풍선, 18자 안쪽 — 독자가 칠 법한 질문)가 없습니다. 없으면 "<제목> 알려 줘!" 로 어색하게 그려집니다`);
        // ④ number 는 큰 숫자만, ⑤ quiz 문장은 본문을 짧게 바꾼 말이라 글자 그대로 보지 않는다 (answers 로 본문에 답이 있는지 사람이 확인)
        const items = im.card?.type === 'number' ? (im.card.items || []).map((r) => r?.[0]).filter(Boolean)
          : im.card?.type === 'quiz' ? [] : (im.card?.items || []).flat();
        if (im.card?.type === 'lead' && !bodyPlain.includes(plain(im.card.keyword || ''))) errors.push(`${im.n}번 lead 카드 keyword "${im.card.keyword}" 가 본문에 없습니다`);
        const miss = items.filter((x) => !bodyPlain.includes(plain(x)));
        if (miss.length) errors.push(`${im.n}번 카드 글자가 본문에 없습니다: ${miss.map((x) => `"${x}"`).join(', ')} — 카드 글자는 원고 내용과 같게`);
      }
      // 카드 모양 돌려 쓰기 (2026-11-04 사용자 "1~6번을 원고에 맞춰 다양하게, 너무 같은 것만 쓰지 말고") — CARD_MIX_FROM 원고부터
      if (writtenFor >= CARD_MIX_FROM && cards.length) {
        const ds = cards.map((im) => cardDesign(im.card));
        if (new Set(ds).size < ds.length) errors.push(`한 글의 카드 ${ds.length}장이 같은 모양(${ds.join('·')})입니다 — 서로 다른 모양으로 (채팅·메모·첫머리·숫자·퀴즈·자가체크, standards/이미지-기준.md)`);
        const dir = file.replace(/[^\\/]+$/, '') || './';
        const count = {}; let total = 0;
        for (const f of fs.readdirSync(dir).filter((f) => f.startsWith(dated) && f.endsWith('.md'))) {
          for (const im of planOf(dir + f)?.images || []) if (im.kind === 'card') { count[cardDesign(im.card)] = (count[cardDesign(im.card)] || 0) + 1; total++; }
        }
        if (total >= 10) {
          const cap = Math.ceil(total * CARD_MIX_MAX);
          for (const d of ds) if (count[d] > cap) errors.push(`${dated} 카드 ${total}장 중 '${d}' 모양이 ${count[d]}장 — ${cap}장까지 (${Math.round(CARD_MIX_MAX * 100)}%). 원고에 맞는 다른 모양으로`);
          if (total >= 20 && Object.keys(count).length < 5) notes.push(`${dated} 카드 모양이 ${Object.keys(count).length}가지예요 — 5가지 이상 섞어 주세요 (${JSON.stringify(count)})`);
        }
      }
      const framed = plan.images.some((im) => im.n === 1 && im.frame === 'card');
      if (tistory && framed) errors.push('티스토리 대표사진은 지금 방식으로 둡니다 (frame "card" 는 네이버만)');
      if (!tistory && dated >= WEEK_TEST_FROM) {
        if (framed) errors.push('대표사진 카드 틀 시험은 끝났습니다 (2026-10-18) — 1번에 "frame": "card" 를 빼고 지금 방식으로');
      } else if (!tistory) {
        const dir = file.replace(/[^\\/]+$/, '') || './';
        const sib = daySibs(dir, dated);
        if (sib.length >= 5) {
          const n = sib.filter((f) => planOf(dir + f)?.images?.some((im) => im.n === 1 && im.frame === 'card')).length;
          if (n !== FRAME_CARDS_PER_DAY) errors.push(`같은 날(${dated}) 대표사진 카드 틀이 ${n}편 — 하루 ${FRAME_CARDS_PER_DAY}편(정보성 1 + 홈판 1)만 "frame": "card"`);
        }
      }
    }
  }
  if (tistory && dated >= "2026-11-06") {
    // 2026-11-06 원고부터 티스토리 마지막 줄은 고정 "이상 성글벙글의 OO 포스팅" 이 아니라 그 글의 키워드가 든 한 문장
    // (2026-11-06 사용자 — 애드센스 "가치가 별로 없는 콘텐츠": 150편이 같은 닫는 줄로 끝났다)
    const last = texts[texts.length - 1] || "";
    const kws = [post.mainKeyword, ...(post.subKeywords || [])].filter(Boolean).map((k) => plain(k));
    if (texts[texts.length - 2] !== close1) errors.push(`마지막에서 두 번째 줄은 "${close1}" 이어야 합니다.`);
    if (CLOSE_RE.test(last)) errors.push(`티스토리 닫는 줄을 "이상 성글벙글의 OO 포스팅이었습니다😎" 로 쓰지 않습니다 — 그 글에만 맞는 한 문장으로 바꿉니다.`);
    else if (!kws.some((k) => k && plain(last).includes(k))) errors.push("마지막 줄에 이 글의 메인 또는 서브 키워드를 넣어 그 글에만 맞는 한 문장으로 끝냅니다.");
  } else if (texts[texts.length - 2] !== close1 || !CLOSE_RE.test(texts[texts.length - 1]))
    errors.push(`클로징이 고정 문구와 다릅니다. "${close1} / ${CLOSE_2_HINT(newGreet)}" 로 끝나야 합니다.`);

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
    if (!slim && quotes - under > 3) notes.push(`그림 없는 소제목이 ${quotes - under}개예요 — 소제목 수를 그림 수(7)에 가깝게 맞추면 패턴이 더 고르게 보여요`);
    // 인용구 소제목이 너무 많다 (2026-10-03 사용자 지시 — 10~12개에서 2~3개 빼기). 그림 7 + Q&A + 정리 = 9개까지
    if (quotes > maxQuotes) errors.push(`인용구(소제목)가 ${quotes}개 — ${maxQuotes}개 이하로 줄이세요${slim ? ' (2026-11-03 원고부터 6~7개 — 일부 소제목에만 그림)' : ' (그림 7개 자리 + Q&A + 정리)'}. 그림 없는 소제목은 앞 덩어리와 합칩니다`);
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
    const range = charsNS < nsChars[0] ? '짧음' : charsNS > nsChars[1] ? '김' : 'OK';
    console.log(`  본문        : 공백 제외 ${charsNS}자 (기준 ${nsChars[0]}~${nsChars[1]}) ${range} · 공백 포함 ${chars}자`);
    console.log(`  제목 키워드 : ${Math.round(titleKw.ratio * 100)}% (${!tistory && dated >= WEEK_TEST_FROM ? '비율 규칙 쉼 — 10/19 시험' : `권장 ${TITLE_KW[0] * 100}~${TITLE_KW[1] * 100}%`}) · 서브 ${titleKw.subs.join(', ') || '없음'}`);
  } else {
    const range = chars < MIN_CHARS ? '짧음' : chars > MAX_CHARS ? '김' : 'OK';
    console.log(`  본문        : ${chars}자 (기준 ${MIN_CHARS}~${MAX_CHARS}) ${range} · 공백 제외 ${charsNS}자`);
  }
  console.log(`  메인 키워드 : "${post.mainKeyword}" ${mainN}회 (최소 ${minMain}${slim ? ` · 서브 각 ${minSub}` : ''})`);
  if (subN.length) console.log(`  서브 키워드 : ${subN.map(([k, n]) => `${k} ${n}회`).join(' / ')}`);
  console.log(`  줄/덩어리   : ${lines.length}줄 / ${post.blocks.length}덩어리`);
  console.log(`  줄 길이     : 평균 ${avg}자 (권장 ${AVG_LINE[0]}~${AVG_LINE[1]}), 최장 ${max}자 (한도 ${MAX_LINE})`);
  console.log(`  덩어리당    : ${perBlock.toFixed(1)}줄 (최소 ${MIN_BLOCK_LINES})`);
  console.log(`  인용구      : ${quotes}개`);
  console.log(`  이미지 자리 : ${images.length}개`);
  console.log(`  강조        : 빨강 ${red}곳 / 파랑 ${blue}곳 / 노랑 ${yellow}곳`);
  console.log(`  태그        : ${post.tags.join(', ') || '(없음)'}`);
  if (post.publishAt) console.log(`  예약발행    : ${post.publishAt}`);

  // 20편으로 늘린 날의 먼저 쓴 글(이미 예약됨 — 고치지 않는다)은 뒤에 더한 글 때문에 생긴 하루 한도·그림체 순번 오류를 알림으로만
  if (legacyDay20) {
    for (let i = errors.length - 1; i >= 0; i--) {
      if (/대표사진 구도|실사풍입니다|클레이/.test(errors[i])) notes.push(`(이미 예약된 글 — 알림만) ${errors.splice(i, 1)[0]}`);
    }
  }
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
