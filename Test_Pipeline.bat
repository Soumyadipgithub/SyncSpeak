@echo off
title SyncSpeak Pipeline Test
chcp 65001 > nul
echo.
echo  ==========================================
echo   SyncSpeak - Pipeline Diagnostic
echo  ==========================================
echo.
echo  This will test all 3 layers of the new
echo  streaming pipeline and show you timing
echo  numbers. TEST 7 asks you to speak Hindi.
echo.
pause

cd /d "%~dp0"
venv\Scripts\python.exe python\test_pipeline.py

echo.
pause
