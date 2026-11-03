@echo off
REM Photo search keys (Flickr + Pixabay) setup. Just double-click.
REM ASCII only on purpose: Korean text in a .cmd breaks on code page 949. Korean messages live in tools\photo-key.ps1.
title Photo keys setup
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\photo-key.ps1"
echo.
pause
