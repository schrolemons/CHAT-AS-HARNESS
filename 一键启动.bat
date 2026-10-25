@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo [CHAT AS HARNESS] 一键启动
if not exist node_modules (
  echo 首次运行：安装依赖...
  call npm install
)
if not exist config.json (
  echo 未找到 config.json，从模板复制...
  copy config.example.json config.json
  echo 请先编辑 config.json 填 ownerQQ / 白名单 / SnowLuma 连接，再重新运行本脚本。
  pause
  exit /b
)
echo 启动桥接...
node src\bridge.js
pause
