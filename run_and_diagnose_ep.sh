#!/bin/bash

EP_DIR="/www/wwwroot/etherpad-lite"
cd "$EP_DIR"
export PATH="/www/server/nodejs/v18.20.7/bin:$PATH"

echo "🔍 1. 释放 9001 端口..."
fuser -k 9001/tcp 2>/dev/null || true
sleep 1

echo "🔍 2. 直接前台尝试启动 2 秒并捕获精确错误日志..."
node src/node/server.js || true

echo "📄 3. 打印 /var/log/etherpad.log 最新 30 行:"
tail -n 30 /var/log/etherpad.log || true
