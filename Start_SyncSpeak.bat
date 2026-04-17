@echo off
title SyncSpeak Launcher
chcp 65001 > nul
echo.
echo  ==========================================
echo   SyncSpeak - Real-time Voice Translator
echo  ==========================================
echo.

echo [1/3] Setting up environment...
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"

echo [2/3] Checking Python engine...
venv\Scripts\python.exe -c "from sarvamai import AsyncSarvamAI; print('  Engine OK')" 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo   Installing missing dependencies...
    venv\Scripts\pip install -r requirements.txt -q
    echo   Done.
)
echo.

echo [3/3] Starting SyncSpeak...
echo.
npm run dev
pause
