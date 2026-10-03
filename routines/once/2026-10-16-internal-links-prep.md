# 2026-10-16 15:00 — 내부 링크·출처 링크 준비 (10/19 원고부터 시험)

0. `routines/README.md` 의 "공통 시작"을 먼저 한다.

10/2 사용자 결정, docs/STATUS.md "시험 순서". 오늘 할 일:
1. 발행된 내 글의 주소 목록 만들기 — 아침 PC 실행(blog-snapshot 의 seongdaeeyo 목록 읽기 또는 blog-stats)으로 글 번호·제목을 모아
   Drive 로 올리고, 저장소에 content/research/published.json(제목·주소·메인 키워드)로 쌓는 흐름.
2. 원고에 "같이 보면 좋은 글" 1~2줄(같은 묶음의 이미 발행된 글 제목 + 주소)을 넣는 규칙과, publish-naver.mjs 가 주소 줄을
   링크로 넣을 수 있는지 확인·구현(네이버 에디터 링크 붙여넣기 시 생기는 미리보기 카드 처리 포함 — 안전하게 안 되면 글자 주소만).
3. 기관 자료 글(출처 ①)은 출처 줄 아래에 원문 주소 한 줄.
4. lint-post 에 2026-10-19 원고부터 검사, CLAUDE.md 규칙, routines/naver-daily.md 지시문 갱신, PR → 검사 → merge, STATUS.
실제 네이버에서 확인 못 한 부분은 사용자에게 그렇게 말한다.
