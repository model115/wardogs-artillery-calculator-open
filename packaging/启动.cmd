@echo off
title WARDOGS Artillery Calculator
pushd "%~dp0"

echo.
echo   WARDOGS Artillery Calculator  -  starting...
echo   by model115  -  https://github.com/model115
echo.

if not exist "%~dp0WardogsArtillery.exe" (
  echo   [ERROR] WardogsArtillery.exe not found.
  echo           Please extract the whole zip before running this.
  echo.
  pause
  exit /b 1
)

start "" "%~dp0WardogsArtillery.exe" --urls http://127.0.0.1:5188
timeout /t 3 /nobreak >nul
start "" http://127.0.0.1:5188

echo   Browser opened at http://127.0.0.1:5188
echo   Closing this window does NOT stop the server.
echo   To stop it, close WardogsArtillery.exe.
echo.
pause