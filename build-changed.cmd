@echo off
setlocal
cd /d "%~dp0"

set "NODE_EXE=node"
where node >nul 2>&1
if errorlevel 1 (
  if exist "C:\Program Files\nodejs\node.exe" (
    set "NODE_EXE=C:\Program Files\nodejs\node.exe"
  ) else (
    echo Node.js not found. Install Node.js LTS first.
    exit /b 1
  )
)

set "PATH=%PATH%;C:\Program Files\nodejs"
"%NODE_EXE%" scripts\build-changed.mjs
exit /b %ERRORLEVEL%
