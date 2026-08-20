# 성글벙글 콘텐츠 허브

매일 오전 9시(한국시간)에 새 원고를 만들어 **고정 링크 하나**를 갱신하는 저장소다.
새 링크를 만들지 않는다. 항상 같은 주소를 덮어쓴다.

## 매일 만들어지는 것

| 항목 | 수량 | 분량 |
|---|---|---|
| 네이버 블로그 원고 | 3편 | 편당 3,200~3,500자 |
| 티스토리 원고 | 3편 | 편당 2,501~3,000자 |
| 카드뉴스 | 6세트 | 세트당 7장 |
| 이미지 기획 | 48개 | 원고당 8개 |

## 명령어

```bash
npm run serve      # 로컬 미리보기 (http://localhost:8099)
npm run rotate     # 기존 원고 보관 + 경량 이력 추가
npm run validate   # 문법·분량·구성·중복 일괄 검수
```

`npm run validate`가 실패하면 배포하지 않는다. GitHub Actions도 같은 검사를 통과해야 배포된다.

## 매일 실행 순서

1. `content-history.json`만 읽는다. **과거 원고 본문은 읽지 않는다.**
2. 겹치지 않는 주제를 고르고 공식 자료를 최대 3개까지 확인한다.
3. MASTER FACT를 한 번 작성한다.
4. 원고와 카드뉴스를 만든다.
5. `npm run rotate` → `content-data.js` 교체 → `npm run validate`
6. 검수 통과 시에만 커밋·푸시한다. 배포와 링크 확인은 각각 한 번씩만 한다.

자세한 규칙은 [CONTENT_HUB.md](./CONTENT_HUB.md)에 있다.

## 고정 링크

| 링크 | 갱신 주체 |
|---|---|
| https://dae0064-boop.github.io/seonggeul-content-hub/ | **이 저장소.** 푸시하면 검수 → 배포가 자동으로 돈다 |
| https://seonggeul-content-hub-dae0064-1422s-projects.vercel.app/ | 기존 ChatGPT 자동화 |

같은 Vercel 프로젝트에 CLI 배포와 Git 연동을 함께 붙이면 서로 덮어쓴다.
그래서 비교 기간에는 링크를 나눠 쓴다. 합치는 절차는 [CONTENT_HUB.md](./CONTENT_HUB.md) 5장에 있다.

## 사용량 절약 설계

과거 원고 전체(약 47,000자)를 매일 다시 읽던 방식을 없앴다.
지금은 `content-history.json` 약 1,000자만 읽는다. 확인 분량이 약 98% 줄었다.
