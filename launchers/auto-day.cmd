@echo off
chcp 65001 >nul
REM 작업 스케줄러가 매일 아침 부르는 실행기. 사람이 누를 키가 없으므로 pause 를 두지 않는다.
REM 최신 원고를 받고, 오늘 원고 전부 이미지 → 예약발행(publish_at 시각)까지 한다.
cd /d "%~dp0.."
REM Same PC: wait while another morning run (manual double-click or retry) is still going, so images are never made twice at once       
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\wait-turn.ps1" || exit /b 0
REM Generated .json/.html are rebuilt on this PC. Drop local copies so pull never stops (2026-10-03).
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" 2>nul
git checkout -q main
git pull -q
REM 2026-10-05: the lines above must keep the same byte length (cmd keeps reading this file at the same offset after git pull updates it).
REM Threads insurance posts: save new Word files to Drive (fast, before the blog run)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\insurance-word.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\draft-day.ps1" -Reserve %*
REM Tistory: same day, 30 minutes after each Naver slot (publish_at in content\tistory). Skips if no posts.
REM -RetryDrafts: posts that were only saved as drafts last time are reserved again (was tistory-reserve.cmd)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\tistory-day.ps1" -Reserve -RetryDrafts
REM 내 블로그 통계(유입 검색어·글별 조회수)를 읽기만 하고 Drive 로 올린다
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\blog-stats.ps1"
REM 다음 원고 키워드 후보의 월간 검색량을 조회해 Drive 로 올린다 (content\calendar\keyword-queue.txt)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\keyword-volume.ps1"
REM 다른 블로그 살펴보기 요청이 있으면 (content\research\blog-snapshot.txt) 읽기만 하고 Drive 로 올린다
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\blog-snapshot.ps1"
REM 지난 날짜 그림·화면 기록을 이 PC 에서 지운다 (2026-10-05 사용자: 발행이 끝난 지난 것은 삭제)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\cleanup.ps1"
REM 예전에 등록한 PC 라도 "다시 시도" 시각이 생기게 한다 (한 번만 바뀐다)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\ensure-retry.ps1"
