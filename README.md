# seonggeul-content-hub

성글벙글 콘텐츠의 단일 저장소. 세 갈래로 흩어져 있던 작업을 하나로 합친 것입니다.

| 무엇 | 어디 |
|---|---|
| 길잡이 — 어디서 무엇을 읽나 | `CLAUDE.md` |
| 브랜드 기준(말투·금지표현·출처) | `memory/CLAUDE.md` — 각 PC 의 `~/.claude/CLAUDE.md` 가 됩니다 |
| 원고 작성 실무 기준 | `.claude/skills/write-post/` — 원고를 쓸 때 자동으로 로드됩니다 |
| 보험 글 규칙 (현재 중단) | `standards/보험글-규칙.md` |
| 원고 | `content/posts/` — `.md`(정본) + `.json`(스크립트 입력) 한 쌍 |
| 발행 캘린더 · 작업판 | `content/calendar/`, `content/board/` (아티팩트 소스) |
| 발행 · 검수 자동화 | `scripts/*.mjs` |
| 여러 PC 워크스페이스 도구 | `scripts/*.py`, `launchers/`, `docs/SETUP.md` |
| 2026-08 작업물 아카이브 | `work/` — 과거 기록이며 갱신하지 않습니다 |

새 세션을 시작할 때는 `CLAUDE.md` 부터 읽으면 됩니다. 규칙은 한 곳에만 두었으니
같은 내용을 여러 문서에서 찾을 필요가 없습니다.

---

## 두 가지 사용 흐름

**A. 원고를 쓰고 발행한다** → 아래 "네이버 예약발행" 절차를 따릅니다.

**B. 다른 컴퓨터에서 이어서 작업한다** → `docs/SETUP.md` 를 보고 워크스페이스를 연결합니다.
컴퓨터마다 한 번씩만 하면 되고, Windows 는 `내 드라이브\ClaudeWorkspace\connect.cmd`
더블클릭이 전부입니다.

---

# 네이버 예약발행

생활정보 콘텐츠 원고 관리 + 네이버 블로그 **예약발행 자동화**.

이미 네이버에 로그인된 크롬에 CDP로 붙어서 동작하므로 **재로그인·캡차가 없습니다.**

---
## 준비 (최초 1회)

```bash
npm install
```

> Playwright 브라우저를 따로 받을 필요 없습니다. 기존 크롬에 attach 하는 방식이라 본인 크롬을 그대로 씁니다.

---

## 1단계 — 크롬을 디버깅 포트로 실행

**중요: 실행 중인 크롬을 먼저 완전히 종료하세요.** 작업관리자에서 `chrome.exe` 가 하나도 남아 있지 않아야 합니다. 하나라도 살아 있으면 디버깅 포트가 열리지 않고 기존 창만 하나 더 뜹니다.

**Windows** — 실행창(Win+R)에 붙여넣기:

```
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%LOCALAPPDATA%\Google\Chrome\User Data"
```

**macOS**:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/Library/Application Support/Google/Chrome"
```

`--user-data-dir` 을 기존 프로필로 지정해야 **로그인 세션이 그대로 유지**됩니다.

### 포트가 열렸는지 확인

브라우저에서 <http://localhost:9222/json/version> 접속 → JSON이 보이면 성공.

---

## 2단계 — 먼저 DRY-RUN

최종 발행 버튼 직전까지만 진행하고 멈춥니다. **처음엔 반드시 이걸 먼저 돌리세요.**

```bash
node scripts/publish-naver.mjs \
  --post content/posts/2026-09-11-hwanjeolgi-gamgi.json \
  --blog-id 내블로그아이디 \
  --at "2026-09-12 07:30" \
  --dry-run --dump
```

크롬 화면에서 제목·본문·예약시각이 제대로 들어갔는지 눈으로 확인하세요.

---

## 3단계 — 실제 예약발행

DRY-RUN 결과가 멀쩡하면 `--dry-run` 만 빼고 다시 실행합니다.

```bash
node scripts/publish-naver.mjs \
  --post content/posts/2026-09-11-hwanjeolgi-gamgi.json \
  --blog-id 내블로그아이디 \
  --at "2026-09-12 07:30"
```

---

## 옵션

| 옵션 | 설명 |
|---|---|
| `--post <파일>` | 발행할 글 JSON (필수) |
| `--blog-id <id>` | 네이버 블로그 아이디 (필수) |
| `--at "Y-M-D H:M"` | 예약 시각. 생략하면 즉시 발행 |
| `--dry-run` | 최종 발행 직전에 정지 |
| `--dump` | 단계별 스크린샷/HTML을 `dumps/` 에 저장 |
| `--cdp <url>` | CDP 주소 (기본 `http://localhost:9222`) |
| `--slow <ms>` | 동작 간 지연 |

---

## 잘 안 될 때

**`ECONNREFUSED 127.0.0.1:9222`**
크롬이 디버깅 포트로 안 떠 있습니다. 기존 크롬을 전부 종료하고 1단계를 다시 하세요.

**로그인 페이지로 튕김**
`--user-data-dir` 이 실제 로그인된 프로필을 가리키는지 확인하세요.

**"요소를 찾지 못했습니다"**
네이버가 에디터 DOM을 바꾼 경우입니다. `--dump` 를 붙여 다시 실행하면 `dumps/` 에 스크린샷과 HTML이 남습니다. 그 파일을 공유하면 선택자를 맞춰 고칠 수 있습니다.

---

## 글 추가하기

`content/posts/` 에 JSON을 만듭니다.

```jsonc
{
  "title": "글 제목",
  "category": "생활정보",
  "tags": ["태그1", "태그2"],
  "blocks": [
    { "type": "h", "text": "소제목" },
    { "type": "p", "text": "문단 내용" },
    { "type": "p", "text": "" }
  ]
}
```

사람이 읽는 원고는 같은 이름의 `.md` 로 함께 두면 관리가 편합니다.

---

## 키워드 검색량 조회

캘린더 글감의 우선순위를 감이 아니라 **실제 검색량**으로 정하기 위한 도구.

네이버가 무료로 공개하는 두 API를 쓴다.

| API | 주는 것 |
|---|---|
| 검색광고 `/keywordstool` | **절대 월간검색수** (PC/모바일 분리), 연관키워드, 경쟁정도 |
| 검색 `search/blog` | 블로그 문서수 → 경쟁강도 근사치 |

### 1. 키 발급 (무료, 최초 1회)

**검색광고 API** — <https://searchad.naver.com> 로그인 → 도구 → API 사용 관리
→ 액세스 라이선스, 비밀키, CUSTOMER_ID 세 가지를 발급받는다.

**검색 API** — <https://developers.naver.com/apps> 애플리케이션 등록
→ 사용 API 에서 "검색" 선택 → Client ID, Client Secret.

`.env.example` 을 `.env` 로 복사해 채운다. `.env` 는 커밋되지 않는다.

```bash
cp .env.example .env
```

### 2. 조회

```bash
node scripts/naver-keywords.mjs \
  --keywords content/calendar/keywords.txt \
  --with-competition
```

결과가 `content/calendar/keyword-report.csv` / `.json` 으로 저장된다.
CSV 는 BOM 을 붙여 저장하므로 엑셀에서 한글이 깨지지 않는다.

| 열 | 뜻 |
|---|---|
| PC / 모바일 / 합계 | 최근 30일 검색수 |
| 추정 | `Y` 면 10 미만이라 네이버가 정확한 값을 주지 않음 |
| 경쟁정도 | 검색광고 기준 (높음/중간/낮음) |
| 문서수 | 해당 키워드 블로그 문서 수 |
| 기회점수 | 합계 ÷ 문서수. **높을수록 검색은 많은데 글은 적다** |

### 읽을 때 주의

- 월간검색수는 **최근 30일 합계**다. 달력상 지난달이 아니다.
- 검색광고 API 수치는 **광고 노출 기준**이라 실제 유입과 완전히 같지 않다. 순위 판단용으로 쓴다.
- 기회점수는 문서수를 경쟁도로 삼은 **근사치**다. 상위 노출 글의 품질은 반영하지 못한다.

### 이 저장소의 클라우드 세션에서는 실행되지 않는다

`naver.com` 전 도메인이 egress 정책에서 차단된다(API 엔드포인트 포함).
발행 스크립트와 마찬가지로 **사용자 PC에서 실행**하는 도구다.

---

## 검증 상태

정직하게 적어둡니다.

**발행 스크립트**

- **검증 완료** — CDP attach, 탭 생성, 인자 검증, 실패 시 자동 덤프. 실제 크롬 인스턴스로 확인. 네이버 에디터 DOM을 모사한 로컬 목업에 붙여 38줄 입력이 원고와 전부 일치함을 확인했습니다.
- **미검증** — 네이버 에디터 내부 선택자(제목/본문/카테고리/태그/예약 UI). 네이버 접근이 차단된 환경에서 작성했기 때문입니다.

**키워드 조회 스크립트**

- **검증 완료** — HMAC-SHA256 서명 생성(문서 규격과 독립 계산으로 대조), 5개씩 배치 분할, 연관키워드 필터링, `"< 10"` 문자열 파싱, 기회점수 계산, CSV/JSON 출력. 네이버 응답 형태를 모사한 목 서버로 확인했습니다.
- **미검증** — 실제 네이버 API 의 응답 필드와 오류 코드. 첫 실행에서 어긋나면 오류 메시지에 응답 본문 앞 400자가 찍히므로 그걸 보내주시면 맞추겠습니다.

그래서 첫 실행은 반드시 `--dry-run --dump` 로 하세요. 선택자가 어긋나면 스크립트가 알아서 덤프를 남깁니다.
