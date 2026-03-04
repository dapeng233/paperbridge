@echo off
chcp 65001 >nul
echo.
echo 正在启动 Word Add-in 配置向导...
echo.
PowerShell -ExecutionPolicy Bypass -File "%~dp0setup-word-addin.ps1"
