@echo off
chcp 65001 >nul
title 学生信息管理系统 - 公网部署

echo.
echo   ╔══════════════════════════════════════╗
echo   ║   🎓 人工智能学院学生信息管理系统   ║
echo   ║        公网一键部署 v1.0            ║
echo   ╚══════════════════════════════════════╝
echo.

:: Step 1: Open Firewall
echo [1/3] 正在开放防火墙端口 3456...
echo 如果弹出 UAC 提示，请点击"是"
netsh advfirewall firewall add rule name="StudentSystem-3456" dir=in action=allow protocol=TCP localport=3456 >nul 2>&1
if %errorlevel%==0 (
    echo   [√] 防火墙端口已开放（局域网可访问）
) else (
    echo   [!] 防火墙配置失败，请以管理员身份运行此脚本
    echo   [!] 局域网访问可能被阻止
)
echo.

:: Step 2: Kill old processes
echo [2/3] 正在启动服务器...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 1 /nobreak >nul

:: Start server in background
start /B node server.js > server.log 2>&1
timeout /t 3 /nobreak >nul

:: Verify server is running
curl -s http://localhost:3456/login.html >nul 2>&1
if %errorlevel%==0 (
    echo   [√] 服务器已启动 http://localhost:3456
) else (
    echo   [!] 服务器可能未成功启动，请检查 server.log
)
echo.

:: Step 3: Start public tunnel
echo [3/3] 正在获取公网地址...
echo.
echo   请稍等，正在连接隧道服务器...
echo.
npx localtunnel --port 3456 --local-host 0.0.0.0

pause
