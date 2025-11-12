@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在保存答卷，请稍等...
node save-answersheets.js "2025anserssheets-steps.txt"
echo.
echo 答卷保存完成！
echo.
pause
