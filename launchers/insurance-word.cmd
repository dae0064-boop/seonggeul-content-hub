@echo off
chcp 65001 >nul
title 성글벙글 - 보험글 Word 만들어 Drive 에 저장
REM 더블클릭하면 최신 원고를 받아 보험글을 한 편씩 Word 로 만들어 Drive 보험글 폴더에 넣는다.
cd /d "%~dp0.."
echo.
echo [1/2] 최신 원고 받는 중...
git fetch -q origin || (echo   인터넷이나 GitHub 연결을 확인해 주세요. & pause & exit /b 1)
git checkout -q main || (echo   이 PC 에서 고친 파일이 있어 main 으로 바꾸지 못했어요. 이 창을 캡처해서 Claude 에게 보여주세요. & pause & exit /b 1)
git pull -q --ff-only || (echo   받아오지 못했어요. 이 창을 캡처해서 Claude 에게 보여주세요. & pause & exit /b 1)
echo   완료
echo.
echo [2/2] Word 만드는 중...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0insurance-word.ps1" %*
echo.
pause
