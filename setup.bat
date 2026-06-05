@echo off
title ChaoSeed TRNG - Quick Setup
echo.
echo   ========================================
echo    ChaoSeed - True Random Number Generator
echo    Randomness from chaos
echo   ========================================
echo.

:: Check for Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo         Download it from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: Show Node version
for /f "tokens=*" %%v in ('node --version') do echo [OK] Node.js %%v found.

:: Check for npm
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] npm is not installed or not in PATH.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('npm --version') do echo [OK] npm %%v found.
echo.

:: Install dependencies
echo [1/2] Installing dependencies...
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
)
echo [OK] Dependencies installed.
echo.

:: Launch dev server
echo [2/2] Starting local dev server...
echo.
echo   ============================================
echo    ChaoSeed is starting at http://localhost:5173
echo    Open this URL in your browser.
echo    Press Ctrl+C to stop the server.
echo   ============================================
echo.
echo   NOTE: This runs entirely on your machine.
echo         No data is sent to any external server.
echo.

call npm run dev
