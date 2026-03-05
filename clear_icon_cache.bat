@echo off
ie4uinit.exe -show
taskkill /IM explorer.exe /F
DEL /A /Q "%localappdata%\IconCache.db"
DEL /A /F /Q "%localappdata%\Microsoft\Windows\Explorer\iconcache*"
start explorer.exe
echo 图标缓存已清除
pause
