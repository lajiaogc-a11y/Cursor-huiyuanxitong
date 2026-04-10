@echo off
title WhatsApp Companion
cd /d "%~dp0"

:: Check Node.js
where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js not found. Please install Node.js first: https://nodejs.org/
    pause
    exit /b 1
)

:: Install dependencies if needed
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install --production
    echo.
)

:: Start Companion
echo Starting WhatsApp Companion...
echo.
npx tsx start.ts
pause
