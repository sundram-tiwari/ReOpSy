@echo off
title ReOpSy - run all tests
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install it from https://nodejs.org first.
  pause
  exit /b 1
)

echo ============================================
echo   Backend tests  (zero dependencies)
echo ============================================
pushd backend
call npm test
popd

echo.
echo ============================================
echo   App logic tests  (strict TypeScript)
echo ============================================
pushd app
if not exist node_modules (
  echo node_modules missing - run run.bat first to install dependencies.
  popd
  pause
  exit /b 1
)
call npm test
popd

echo.
pause
