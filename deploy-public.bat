@echo off
chcp 65001 >nul
echo ============================================
echo   学生信息管理系统 - 公网部署脚本
echo ============================================
echo.
echo [1/3] 启动服务器...
start /B node server.js
timeout /t 3 /nobreak >nul
echo 服务器已启动 (端口 3456)
echo.

echo [2/3] 打开 Windows 防火墙端口...
netsh advfirewall firewall add rule name="StudentSystem-3456" dir=in action=allow protocol=TCP localport=3456
echo 防火墙端口已开放
echo.

echo [3/3] 启动公网隧道...
echo 正在获取公网地址，请稍候...
npx localtunnel --port 3456
echo.
pause
