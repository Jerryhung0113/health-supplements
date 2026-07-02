@echo off
title 保健食品庫存管理系統
chcp 65001 > null

echo ==================================================
echo 正在為您啟動「保健食品庫存管理系統」...
echo ==================================================

:: Get current folder path
cd /d "%~dp0"

:: Start default browser to URL
start http://localhost:8000

:: Run python server
python server.py

pause
