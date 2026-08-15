@echo off
setlocal enabledelayedexpansion
title ReOpSy - install and start
cd /d "%~dp0"

set NODE_VERSION=22.14.0
set NODE_DIST=node-v%NODE_VERSION%-win-x64
set TOOLS_DIR=%~dp0tools
set PORTABLE_NODE_DIR=%TOOLS_DIR%\%NODE_DIST%

echo ============================================
echo   ReOpSy
echo ============================================
echo.

rem ----------------------------------------------------------------
rem Decide which Node to use. The system Node (if any) is checked
rem first; if it is missing or older than 20, a portable copy of
rem Node 22 is downloaded straight from nodejs.org onto THIS machine
rem (no installer, no admin rights - just a zip extracted locally)
rem and used instead, without touching the system install at all.
rem ----------------------------------------------------------------

set USE_NODE_DIR=

where node >nul 2>nul
if not errorlevel 1 (
  for /f "tokens=*" %%v in ('node --version') do set SYS_NODE_VER=%%v
  echo Found system Node: !SYS_NODE_VER!
  for /f "tokens=1 delims=." %%a in ("!SYS_NODE_VER:v=!") do set SYS_NODE_MAJOR=%%a
  if !SYS_NODE_MAJOR! GEQ 20 (
    echo System Node is new enough. Using it.
    set USE_NODE_DIR=SYSTEM
  ) else (
    echo System Node is too old for this project ^(needs 20+^). Will use a portable Node 22 instead.
  )
) else (
  echo No system Node found. Will use a portable Node 22 instead.
)

if not "!USE_NODE_DIR!"=="SYSTEM" (
  if exist "%PORTABLE_NODE_DIR%\node.exe" (
    echo Portable Node 22 already present at %PORTABLE_NODE_DIR%
  ) else (
    echo.
    echo Downloading a portable copy of Node.js %NODE_VERSION% ^(about 30 MB^)...
    echo This is extracted next to the project only - it does not touch your
    echo system Node install and needs no admin rights.
    echo.
    if not exist "%TOOLS_DIR%" mkdir "%TOOLS_DIR%"
    curl -L --fail -o "%TOOLS_DIR%\node.zip" "https://nodejs.org/dist/v%NODE_VERSION%/%NODE_DIST%.zip"
    if errorlevel 1 (
      echo.
      echo Download failed. Check your internet connection and try again,
      echo or install Node.js 20+ yourself from https://nodejs.org.
      echo.
      pause
      exit /b 1
    )
    echo Extracting...
    powershell -NoProfile -Command "Expand-Archive -Path '%TOOLS_DIR%\node.zip' -DestinationPath '%TOOLS_DIR%' -Force"
    del /q "%TOOLS_DIR%\node.zip"
    if not exist "%PORTABLE_NODE_DIR%\node.exe" (
      echo.
      echo Extraction did not produce node.exe where expected. Aborting.
      echo.
      pause
      exit /b 1
    )
    echo Done.
  )
  set "PATH=%PORTABLE_NODE_DIR%;%PORTABLE_NODE_DIR%\node_modules\npm\bin;!PATH!"
  set "USE_NODE_DIR=%PORTABLE_NODE_DIR%"
)

cd /d "%~dp0app"

echo.
for /f "tokens=*" %%v in ('node --version') do echo Using Node %%v
for /f "tokens=*" %%v in ('npm --version') do echo Using npm %%v
echo Node location:
where node
echo.

del /q install-done.txt install-failed.txt install.log expo-exited.txt >nul 2>nul
if exist expo2.log del /q expo2.log >nul 2>nul

if exist node_modules\babel-preset-expo\package.json (
  echo node_modules already has babel-preset-expo hoisted correctly - skipping reinstall.
  set NPM_EXIT=0
) else (
  if exist node_modules (
    echo Removing existing node_modules for a clean install...
    rmdir /s /q node_modules
  )
  if exist package-lock.json del /q package-lock.json

  echo Installing dependencies. This is logged to app\install.log so it can be
  echo checked even if this window closes. First run takes a few minutes.
  echo.

  call npm install --no-audit --no-fund --loglevel=verbose --force > install.log 2>&1
  set NPM_EXIT=!errorlevel!
)

echo.
echo npm install finished with exit code %NPM_EXIT%
echo Last 40 lines of install.log:
echo ----------------------------------------
powershell -NoProfile -Command "Get-Content install.log -Tail 40"
echo ----------------------------------------
echo.

if not "%NPM_EXIT%"=="0" (
  echo INSTALL FAILED > install-failed.txt
  echo npm install failed with exit code %NPM_EXIT%. See app\install.log for the full log.
  echo.
  pause
  exit /b 1
)

echo INSTALL OK > install-done.txt

echo.
echo ============================================
echo   Starting Expo
echo ============================================
echo.
echo Scan the QR code below with the Expo Go app on your phone.
echo Output is also mirrored to app\expo.log.
echo Press Ctrl+C in this window to stop.
echo.

set EXPO_NO_TELEMETRY=1
set CI=false

call npx expo start --clear --port 8090 --non-interactive 2>&1 | powershell -NoProfile -Command "$input | Tee-Object -FilePath expo2.log"
set EXPO_EXIT=%errorlevel%

echo.
echo expo start exited with code %EXPO_EXIT%
echo EXITED > expo-exited.txt
echo.
pause
