@echo off
title WhatsApp Bot - All-in-One Launcher
cd /d "%~dp0"

echo ====================================================================
echo   LAUNCHING WHATSAPP BOT + PUBLIC WEBSITE (ALL-IN-ONE)
echo ====================================================================
echo.
echo [1/2] Starting WhatsApp Bot & Web Server...
start "1. WhatsApp Bot Server" cmd /k "cd /d \"%~dp0\" && node server.js"

echo Waiting 5 seconds for WhatsApp Web & server to initialize...
timeout /t 5 /nobreak >nul

echo [2/2] Publishing Website Globally (Cloudflare)...
start "2. Cloudflare Live Website Link" cmd /k "cd /d \"%~dp0\" && node share.js"

echo.
echo ====================================================================
echo   SUCCESS: Both services have been launched in separate windows!
echo   
echo   - Window 1: Server and WhatsApp Bot
echo   - Window 2: Cloudflare Live Public Website Link (auto-copies link)
echo
echo   IMPORTANT: Keep both windows open while testing or using the bot.
echo ====================================================================
echo.
pause
