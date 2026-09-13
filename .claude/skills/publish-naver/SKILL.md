---
name: publish-naver
description: 네이버 블로그 발행 자동화 스크립트를 다룰 때 쓴다. CDP attach 규칙, 선택자 작성 방식, 덤프, dry-run, 클라우드 환경에서 어디까지 검증할 수 있는지가 들어 있다. 사용자가 "발행 스크립트", "publish-naver 고쳐줘", "선택자가 안 맞는다", "예약발행", "dry-run"이라고 할 때 로드한다.
---

# 네이버 발행 자동화

`scripts/publish-naver.mjs` 는 CDP로 **기존 크롬에 attach** 한다. 새로 띄우지 않는다.

## 지킬 것

- **attach 한 브라우저를 절대 종료하지 않는다.** 사용자의 브라우저다. 연결만 해제한다.
- 네이버 에디터의 클래스명에는 해시가 붙어 수시로 바뀐다. 선택자는 항상
  **텍스트 기반 + 클래스 fallback 배열**로 작성한다 (`findFirst` 헬퍼).
- 실패하면 스크린샷과 HTML을 `dumps/` 에 남긴다. 선택자 수정은 이 덤프를 근거로 한다.
  추측으로 선택자를 바꾸지 않는다.
- 최종 발행은 되돌릴 수 없다. `--dry-run` 을 기본 권장 경로로 유지한다.

## 클라우드 세션에서는 발행이 안 된다

이 저장소의 Claude 세션은 Anthropic 클라우드 컨테이너에서 돌 수 있다. 그 경우
사용자 PC의 크롬에 접근할 수 없고(`localhost` 는 컨테이너 자신), `naver.com` 은
egress 정책에서 차단된다(`connect_rejected`).

**스크립트를 만들어 커밋하고, 실행은 사용자가 본인 PC에서 한다.**
이 전제를 무시하고 "발행했습니다"라고 보고하지 않는다.

세션 위치는 `get_session` 의 `environment_kind` 로 확인한다.
`origin: desktop_app` 이어도 `environment_kind: anthropic_cloud` 면 클라우드다.

## 어디까지 검증할 수 있는가

네이버에 접근할 수 없는 환경에서는 다음까지만이고, 그 이상을 검증했다고 말하지 않는다.

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

종료할 땐 `pkill -f "[r]emote-debugging-port=9222"` 처럼 패턴이 자기 명령줄에
매칭되지 않게 한다. 그러지 않으면 셸 자신이 죽는다.

## 검수기는 하나만 게이트다

발행 여부는 **`scripts/lint-post.mjs` 로만 판단한다.**

```bash
npm run check content/posts/<원고>.md    # build-post + lint-post
```

`scripts/check_post.py` 도 있지만 지금은 돌지 않는다. 한글 앞머리(제목/타겟/목적)
규격을 전제로 쓰였는데 현재 원고가 그 형식이 아니고, 분량 세는 법도 달라 같은 원고를
2,310자 / 2,854자로 다르게 센다. 남겨둔 이유는 아직 옮기지 못한 검사 두 개
(출처 URL 유무, Q&A 개수) 때문이고, 사정은 `docs/OPEN-ISSUES.md` 에 적어두었다.

**두 검수기를 동시에 신뢰하지 않는다.**

## 키워드 조회도 사용자 PC에서

`scripts/naver-keywords.mjs` 도 네이버 차단 때문에 클라우드 세션에서는 실행되지 않는다.
조회 대상은 `content/calendar/keywords.txt`.
사용자가 PC에서 돌린 `keyword-report.csv` 를 받아 반영한다.

글감 우선순위는 감으로 정하지 말고 이 실제 검색량으로 정한다.
