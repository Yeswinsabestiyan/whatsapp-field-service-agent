@echo off
title Service Request Server (Port 8786)
cd /d "%~dp0"
echo ========================================================
echo   Starting Automated Service Request Backend Server...
echo   Local Web Access: http://localhost:8786
echo   Same Wi-Fi Access: http://192.168.0.105:8786
echo   Global Public Link: Double-click share_website.bat
echo   Keep this window open while using the website.
echo ========================================================
echo.
node server.js
pause
