# 자동 작업(Routine) 지시문

매일·매월 클라우드에서 도는 작업의 **지시문 정본**이다. 지시를 바꿀 때는 여기 파일을 고쳐 `main` 에 합친다.
Routine 설정을 다시 만들 필요가 없다.

## 구조 (2026-10-03 사용자 결정 — 사용량 줄이기)

예전에는 Routine 이 긴 대화(블로그 자동화·티스토리 자동화·스레드 심의글)에 이어 붙어 돌았다.
대화가 60만 토큰을 넘으면서 한 번 움직일 때마다 그 대화 전체를 다시 읽어 사용량이 빨리 닳았다.
그리고 사용자는 다 본 대화를 바로 지우는 편이다.

그래서 이렇게 바꿨다:

```
Routine (정해진 시각)
  → "⚙ 자동 작업 출발점" 대화 (작게 유지, 지우지 않는다)
      → create_session 으로 새 작업 대화를 하나 만든다 (저장소·Google Drive 연결, Opus)
          → 새 대화가 routines/<작업>.md 를 읽고 끝까지 한다
```

- 작업 대화는 매번 새로 시작한다. 이전 대화 기억은 없다. **필요한 기억은 저장소 문서에만 있다** —
  `CLAUDE.md`, `memory/CLAUDE.md`, `docs/STATUS.md`. 결정하거나 바꾼 것은 끝내기 전에 STATUS 에 남긴다.
- 작업 대화는 결과를 확인한 뒤 지워도 된다. **"⚙ 자동 작업 출발점" 대화만 지우면 안 된다** — 지우면 Routine 이 멈춘다.
- `create_trigger` 로 바로 "매번 새 대화" Routine 을 만들면 저장소·Drive 가 붙지 않고 모델도 Sonnet 이 된다
  (2026-10-03 시험). 그래서 출발점 대화가 `create_session` 으로 대신 만든다.

| 파일 | 언제 | 하는 일 |
|---|---|---|
| `naver-daily.md` | 매일 20:53 | 다음 날 네이버 원고 5편 |
| `threads-insurance-daily.md` | 일~금 21:41 | 다음 날 스레드 보험글 10편 |
| `tistory-daily.md` | 매일 22:37 | 다음 날 티스토리 원고 5편 |
| `morning-check.md` | 매일 10:47 | 예약 결과 확인 + 통계 판단 |
| `monthly-calendar.md` | 매월 28일 21:23 | 다음 달 발행 캘린더 |
| `once/*.md` | 한 번씩 | 날짜가 정해진 점검·준비 작업 |

## 공통 시작 (모든 작업 대화가 먼저 한다)

1. 저장소는 이미 작업 폴더에 받아져 있다. `git fetch origin main` 후 지금 브랜치(`git branch --show-current`,
   이 대화 전용 `claude/routine-*`)를 `origin/main` 으로 맞춘다: `git checkout -B <그 브랜치> origin/main`. `npm install`.
2. `docs/STATUS.md` 를 먼저 읽는다.
3. Google Drive 도구는 이름이 `mcp__Google_Drive__*` 가 아니라 `mcp__<영문·숫자>__search_files` 처럼 나올 수 있다.
   ToolSearch 에 `drive` 로 찾는다.
4. 사람이 중간에 보지 않는다. 규칙을 정확히 지키고, 사용자에게 할 일을 넘기지 않는다.
   네이버·티스토리·스레드·OpenAI 에는 접속하지 않으며 "발행했다/예약했다"고 말하지 않는다.
5. 커밋 → 푸시 → `main` 으로 PR → `검사` 통과 → merge. 실패하면 고쳐서 다시. 끝내 안 되면 merge 하지 말고 이유를 말한다.
6. 마지막 메시지가 사용자에게 가는 보고다. 짧게 쓴다 (사용자는 개발자가 아니다 — CLAUDE.md "사용자에게 PC 작업을 안내할 때").
