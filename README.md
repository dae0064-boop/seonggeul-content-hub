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

## 검증 상태

정직하게 적어둡니다.

- **검증 완료** — CDP attach, 탭 생성, 인자 검증, 실패 시 자동 덤프. 실제 크롬 인스턴스로 확인했습니다.
- **미검증** — 네이버 에디터 내부 선택자(제목/본문/카테고리/태그/예약 UI). 네이버 접근이 차단된 환경에서 작성했기 때문입니다.

그래서 첫 실행은 반드시 `--dry-run --dump` 로 하세요. 선택자가 어긋나면 스크립트가 알아서 덤프를 남깁니다.
