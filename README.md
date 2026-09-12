# seonggeul-content-hub

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

## 이미지 생성

작업판에 적어둔 프롬프트로 이미지를 만든다. 유료 API 다.

### 1. 키 발급

<https://platform.openai.com/api-keys> 에서 발급한 뒤 `.env` 에 넣는다.

```
OPENAI_API_KEY=sk-...
```

결제 수단 등록이 필요하다. <https://platform.openai.com/settings/organization/billing>
에서 **사용 한도(Usage limit)** 를 걸어두면 사고를 막을 수 있다.

### 2. 프롬프트부터 확인 (무료)

```bash
node scripts/gen-images.mjs --post 2026-09-12-aircon-cover --dry-run
```

몇 장에 얼마가 드는지와 프롬프트 전문을 보여준다. 호출하지 않으므로 비용이 없다.

### 3. 생성

```bash
node scripts/gen-images.mjs --post 2026-09-12-aircon-cover --yes
```

`content/images/<슬러그>/01.png` … `10.png` 로 저장된다.

| 옵션 | 설명 |
|---|---|
| `--dry-run` | 프롬프트만 확인, 호출 안 함 |
| `--yes` | 확인 없이 생성 (없으면 예상 비용만 보여주고 멈춘다) |
| `--only 3,7` | 해당 번호만 |
| `--quality` | `low`(기본) / `medium` / `high` |
| `--force` | 이미 있는 파일도 다시 만든다. **돈이 다시 든다** |

### 비용

1024×1024 한 장 기준 추정 단가다. 공식 가격표에서 확인하고 쓴다.

| 품질 | 1장 | 10장(글 1개) | 월 1,100장 |
|---|---|---|---|
| low | $0.006 | $0.06 | 약 $6.6 |
| medium | $0.053 | $0.53 | 약 $58 |
| high | $0.211 | $2.11 | 약 $232 |

### 돈이 새지 않게 한 것

- **이미 있는 파일은 건너뛴다.** 중간에 실패해도 다시 돌리면 남은 것만 만든다.
- **`--yes` 없이는 호출하지 않는다.** 예상 비용만 보여주고 멈춘다.
- 한 장이 실패해도 나머지는 계속 만든다. 실패한 것만 다시 돌리면 된다.

### 이 저장소의 클라우드 세션에서는 실행되지 않는다

`api.openai.com` 이 egress 정책에서 차단된다. 네이버 스크립트와 마찬가지로
**사용자 PC에서 실행**하는 도구다.

---

## 검증 상태

정직하게 적어둡니다.

**발행 스크립트**

- **검증 완료** — CDP attach, 탭 생성, 인자 검증, 실패 시 자동 덤프. 실제 크롬 인스턴스로 확인. 네이버 에디터 DOM을 모사한 로컬 목업에 붙여 38줄 입력이 원고와 전부 일치함을 확인했습니다.
- **미검증** — 네이버 에디터 내부 선택자(제목/본문/카테고리/태그/예약 UI). 네이버 접근이 차단된 환경에서 작성했기 때문입니다.

**이미지 생성 스크립트**

- **검증 완료** — 프롬프트 읽기, 예상 비용 계산, `--dry-run`, 이미 만든 파일 건너뛰기,
  한 장 실패 시 나머지 진행, 재실행으로 실패분만 복구. OpenAI 응답 형태를 모사한
  목 서버로 확인했다. 3번째 호출을 일부러 429 로 떨어뜨려 9장 생성 후,
  재실행에서 빠진 1장만 만드는 것까지 확인.
- **미검증** — 실제 OpenAI API 의 응답 필드와 오류 코드. 접근이 차단돼 있다.
  첫 실행에서 어긋나면 오류 메시지에 응답 본문 앞 500자가 찍히므로 그걸 보내주면 맞춘다.

**키워드 조회 스크립트**

- **검증 완료** — HMAC-SHA256 서명 생성(문서 규격과 독립 계산으로 대조), 5개씩 배치 분할, 연관키워드 필터링, `"< 10"` 문자열 파싱, 기회점수 계산, CSV/JSON 출력. 네이버 응답 형태를 모사한 목 서버로 확인했습니다.
- **미검증** — 실제 네이버 API 의 응답 필드와 오류 코드. 첫 실행에서 어긋나면 오류 메시지에 응답 본문 앞 400자가 찍히므로 그걸 보내주시면 맞추겠습니다.

그래서 첫 실행은 반드시 `--dry-run --dump` 로 하세요. 선택자가 어긋나면 스크립트가 알아서 덤프를 남깁니다.
