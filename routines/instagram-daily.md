# 인스타 카드뉴스 하루 3편 (심의만 받아 두기)

2026-11-05 사용자 — "인스타 카드뉴스는 게시하지 않지만 심의는 하루에 3개씩 받아 놓으려고 한다".
게시는 지금처럼 멈춤(`content/instagram/PAUSE-POST`). 이 작업은 **원고·그림·Word 를 매일 3편 만들어 PC 가 GOMS 에 등록하게** 하는 것까지다.
`routines/tistory-daily.md` 작업 대화가 티스토리 원고를 끝낸 뒤 이어서 한다 (따로 Routine 을 만들지 않았다). `content/instagram/PAUSE` 가 있으면 하지 않는다.

## 흐름 (하루에 두 가지를 같이 한다)

```
D 밤   이 작업: ① 어제 쓴 편의 AI 바탕 사진을 Drive 에서 받아 그림·Word 를 다시 그림  ② 새 3편 원고(임시 바탕)
D+1    PC catchup(10·13·16·19·22시) → make-bg 로 새 3편 바탕 사진 → Drive 인스타카드뉴스/bg/
D+1 밤 이 작업 ① 로 그 3편 Word 완성 → main
D+2    아침 PC insta-goms.ps1 이 Word 를 모아 GOMS 에 하루 3편 등록 (바탕 사진이 없는 편은 모으지 않는다)
```

## ① 바탕 사진 받아 다시 그리기

1. `content/instagram/sets/*.json` 에서 `bg_prompt` 가 있는데 `content/instagram/bg/<slug>.png` 가 없는 편을 찾는다.
2. Drive 에서 `인스타카드뉴스` 폴더 안 `bg/<slug>.png` 를 찾아(`search_files` title = '<slug>.png') 내려받아 `content/instagram/bg/<slug>.png` 로 둔다.
   없으면 그 편은 건너뛴다(다음 날 다시) — 임시 바탕 그대로 Word 를 확정하지 않는다.
3. `node scripts/instagram/render-cards.mjs` → `python3 scripts/instagram/word-cards.py` (README "만드는 법" 2·3).
   이미 GOMS 에 등록한 편(Drive `goms-done-insta/인스타 카드뉴스 N편.done`)의 Word 는 다시 만들지 않는다 — 심의받은 Word 가 정본이다.

## ② 새 3편

1. 번호는 지난 편 다음부터 이어 붙인다 (반려 번호 다시 쓰지 않음). 새 파일 `content/instagram/sets/<내일 날짜>.json`.
2. 모양·말투·금지는 **`content/instagram/README.md` 그대로** — "최종 모양"(style magazine, 카드 6장 + 고지), "따라 하지 않을 것", "심의 반려 사례",
   "쓰기 전 다른 설계사 반박 점검". 설계안(`type: plan`)은 사용자가 보낸 것이 있을 때만 넣는다 — 없으면 1~6편처럼 법·제도 정보형으로 쓴다.
3. 글감: 지금까지의 편(`sets/*.json` 의 slug·제목)과 겹치지 않는, 보험 계약·청구에서 사람들이 실제로 헷갈리는 법 조항 하나씩
   (예: 보험수익자 지정·변경, 계약자와 피보험자가 다를 때, 중복 실손 비례보상, 보험료 납입 면제, 약관 교부·설명 의무, 계약 전 알릴 의무의 질문표 범위,
   해지환급금, 보험금 청구 서류·지급 기한 등). 사실은 **law.go.kr 조문·금융위·금감원 1차 원문만**, `원문확인:` 에 출처와 확인 날짜.
   보험사·상품 이름, 보험료 금액(설계안 없을 때), 가입·해지·승환 권유, 연락 권유는 쓰지 않는다. 운전자보험이면 "음주, 무면허, 도주 사고는 보상에서 제외됩니다." 를 그대로.
4. 편마다 `bg_prompt` (실사 사진, 사람 없음, 글자 없음, 끝에 `no money, no coins, no banknotes, no currency symbols`).
5. `render-cards.mjs` 가 통과할 때까지 고친다(반려 표현·넘침을 막는다). Word 는 바탕 사진이 생긴 다음 날 ① 에서 확정된다.

## 끝내기

- docs/STATUS.md 에 "📸 인스타 심의 준비: 새 N~N+2편(<제목 줄임>) · 바탕 받아 Word 완성 M편" 한 줄. 티스토리와 같은 PR 에 넣는다.
- 보고(티스토리 보고 끝에 한 줄): 새 편 번호·주제, Word 완성된 편 번호, 바탕 사진을 못 받아 미룬 편.
