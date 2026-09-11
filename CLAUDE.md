# CLAUDE.md

생활정보 콘텐츠 원고를 쓰고, 네이버 블로그에 예약발행하는 저장소.

## 저장소 구조

```
content/posts/   원고. <날짜>-<슬러그>.md (사람이 읽는 원고) + .json (스크립트 입력)
scripts/         발행 자동화
```

원고는 항상 **`.md` 와 `.json` 한 쌍**으로 둔다. `.md` 가 정본이고, `.json` 은 거기서 변환한 스크립트 입력이다. 내용을 고칠 땐 둘 다 고쳐야 한다.

## 실행 환경에 대한 중요한 전제

이 저장소를 다루는 Claude 세션은 **Anthropic 클라우드 컨테이너**에서 돌 수 있다. 그 경우:

- 사용자 PC의 크롬에 접근할 수 없다. `localhost` 는 컨테이너 자신이다.
- `naver.com` 은 egress 정책에서 차단된다 (`connect_rejected`).

따라서 **네이버에 직접 붙는 작업은 클라우드 세션에서 수행할 수 없다.** 스크립트를 만들어 커밋하고, 실행은 사용자가 본인 PC에서 한다. 이 전제를 무시하고 "발행했습니다"라고 보고하지 말 것.

세션이 어디서 도는지는 `get_session` 의 `environment_kind` 로 확인한다. `origin: desktop_app` 이어도 `environment_kind: anthropic_cloud` 면 클라우드다.

## 글쓰기 규칙

주제는 **시기성 + 꾸준한 유입**이 겹치는 지점으로 잡는다. 특정 시즌에 검색이 몰리되, 매년 반복되어 재사용 가능한 것.

문체:

- 문단은 짧게. 모바일에서 읽는다는 전제.
- 소제목으로 끊어준다.
- 과장된 표현("무조건", "100%")을 쓰지 않는다.
- 근거 없는 수치를 지어내지 않는다. 확인하지 못한 건 쓰지 않는다.

건강·금융·법률 등 민감 주제는 **진단·처방·단정이 아닌 생활관리 수준**으로 쓰고, 글 끝에 전문가 상담 안내를 넣는다.

## 자동화 규칙

`scripts/publish-naver.mjs` 는 CDP로 기존 크롬에 attach 한다.

- **attach 한 브라우저를 절대 종료하지 않는다.** 사용자의 브라우저다. 연결만 해제한다.
- 네이버 에디터의 클래스명에는 해시가 붙어 수시로 바뀐다. 선택자는 항상 **텍스트 기반 + 클래스 fallback 배열**로 작성한다 (`findFirst` 헬퍼).
- 실패하면 스크린샷과 HTML을 `dumps/` 에 남긴다. 선택자 수정은 이 덤프를 근거로 한다.
- 최종 발행은 되돌릴 수 없다. `--dry-run` 을 기본 권장 경로로 유지한다.

## 검증

네이버에 접근할 수 없는 환경에서는 다음까지만 검증할 수 있고, 그 이상을 검증했다고 말하지 않는다.

```bash
node --check scripts/publish-naver.mjs      # 문법
node scripts/publish-naver.mjs --help       # 인자 처리
npm install                                  # 의존성
```

CDP attach 자체는 로컬 크로미움을 디버깅 포트로 띄워 확인할 수 있다:

```bash
/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
  --headless=new --remote-debugging-port=9222 --no-sandbox \
  --user-data-dir=/tmp/cdp-profile about:blank &
```

종료할 땐 `pkill -f "[r]emote-debugging-port=9222"` 처럼 패턴이 자기 명령줄에 매칭되지 않게 한다. 그러지 않으면 셸 자신이 죽는다.

## 브랜치

작업 브랜치는 `claude/*`. `main` 에 직접 푸시하지 않는다.
