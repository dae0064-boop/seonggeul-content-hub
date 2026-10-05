@echo off
chcp 65001 >nul
REM 작업 스케줄러가 매일 아침 부르는 실행기. 사람이 누를 키가 없으므로 pause 를 두지 않는다.
REM 최신 원고를 받고, 오늘 원고 전부 이미지 → 예약발행(publish_at 시각)까지 한다.
cd /d "%~dp0.."
REM Same PC: wait while another morning run (manual double-click or retry) is still going, so images are never made twice at once (2026-10-05)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0wait-turn.ps1" || exit /b 0
REM Generated .json/.html are rebuilt on this PC. Drop local copies so pull never stops (2026-10-03).
git checkout -q -- "content/posts/*.json" "content/tistory/*.json" "content/tistory/*.html" 2>nul
git checkout -q main
git pull -q
REM Threads insurance posts: save new Word files to Drive (fast, before the blog run)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0insurance-word.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0draft-day.ps1" -Reserve %*
REM Tistory: same day, 30 minutes after each Naver slot (publish_at in content\tistory). Skips if no posts.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tistory-day.ps1" -Reserve
REM 내 블로그 통계(유입 검색어·글별 조회수)를 읽기만 하고 Drive 로 올린다
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0blog-stats.ps1"
REM 다음 원고 키워드 후보의 월간 검색량을 조회해 Drive 로 올린다 (content\calendar\keyword-queue.txt)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0keyword-volume.ps1"
REM 다른 블로그 살펴보기 요청이 있으면 (content\research\blog-snapshot.txt) 읽기만 하고 Drive 로 올린다
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0blog-snapshot.ps1"
REM 예전에 등록한 PC 라도 "다시 시도" 시각이 생기게 한다 (한 번만 바뀐다)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ensure-retry.ps1"
