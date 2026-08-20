# 매일 자동 실행 런북

매일 오전 9시(KST) Claude 세션이 새로 시작되어 이 문서대로 작업합니다.

## 0. 작업 브랜치 확보

콘텐츠 시스템 파일(`data/topics.json`)이 있는 브랜치에서 작업해야 합니다.

```bash
git fetch origin
# main 에 이미 병합되었으면 main 사용
git checkout main && git pull origin main
# main 에 data/topics.json 이 없으면 작업 브랜치로 전환
[ -f data/topics.json ] || git checkout claude/daily-content-update-tracker-gmlxrw
```

이후 모든 커밋·푸시는 **그 브랜치 하나**에만 합니다.

## 1. 주제 배정

```bash
python3 scripts/tracker.py assign
```

- 아직 쓰지 않은 주제를 채널별로 1건씩 배정합니다.
- 이미 배정된 주제는 절대 다시 나오지 않습니다.
- "주제 풀이 소진되었습니다" 경고가 뜨면 → **3-B** 참고.

## 2. 상태를 작성중으로

```bash
for c in blog tistory cardnews; do
  python3 scripts/tracker.py set --channel $c --status wip
done
```

## 3. 원고 작성

`content/<오늘날짜>/` 아래에 `assign` 이 지정한 파일명 그대로 작성합니다.

### 채널별 규격

| 채널 | 파일 | 분량 | 구성 |
|---|---|---|---|
| 블로그 | `blog-B###.md` | 2,000~2,500자 | 도입 → 근거 있는 부분 / 과장된 부분 → 실천법 → 주의 대상 → 요약 |
| 티스토리 | `tistory-T###.md` | 2,000~3,000자 | 절차·비교 중심, 표·체크리스트·FAQ 포함 |
| 카드뉴스 | `cardnews-C###.md` | 8~9컷 | 컷별 카피 + 디자인 노트 + 해시태그 + 대체 텍스트 |

### 공통 규칙

- 모든 파일 상단에 YAML 프론트매터(`date`, `channel`, `topic_id`, `title`, `keywords`)
- 모든 파일 하단에 **의료 정보 면책 문구**
- 수치·제도 정보는 단정하지 말고 **공식 출처 확인 안내**를 덧붙일 것
- 응급 상황을 다루면 **119 안내를 반드시 포함**
- 이전 날짜 원고와 **소재·예시·표현이 겹치지 않게** 할 것
  (`content/` 하위를 훑어 최근 원고 제목을 먼저 확인)

### 3-B. 주제 풀이 소진된 경우

`data/topics.json` 의 해당 채널 배열에 **새 주제 10개 이상**을 추가합니다.
기존 `id` 규칙(`B###` / `T###` / `C###`)을 이어서 부여하고,
기존 제목과 중복되지 않는지 확인한 뒤 다시 `assign` 을 실행합니다.

## 4. 완료 처리 및 현황판 갱신

```bash
for c in blog tistory cardnews; do
  python3 scripts/tracker.py set --channel $c --status done
done
python3 scripts/tracker.py render
```

## 5. 커밋 & 푸시

```bash
git add -A
git commit -m "<날짜> 원고 3건: <블로그 제목> / <티스토리 제목> / <카드뉴스 제목>"
git push -u origin <현재 브랜치>
```

푸시가 네트워크 오류로 실패하면 2s → 4s → 8s → 16s 간격으로 최대 4회 재시도합니다.

## 6. 알림

작업이 끝나면 오늘 작성한 3건의 제목과 현재 진행 현황
(🟥 미완료 / 🟨 작성중 / 🟩 완료 개수, 남은 주제 수)을 한눈에 보고합니다.

## 실패 시 처리

중간에 막히면 **거기까지의 상태를 그대로 커밋**하세요.
작성 못 한 채널은 🟨 작성중 으로 남겨두면 됩니다.
다음 날 실행 시 그 항목이 현황판에 그대로 보이므로 이어서 작업할 수 있습니다.
(`assign` 은 이미 배정된 날짜·채널을 다시 배정하지 않습니다.)
