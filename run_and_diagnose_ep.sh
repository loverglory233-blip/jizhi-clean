#!/bin/bash

EP_DIR="/www/wwwroot/etherpad-lite"
cd "$EP_DIR"
export PATH="/www/server/nodejs/v18.20.7/bin:$PATH"

echo "📦 正在安装图片上传与粘贴插件 ep_image_upload..."
npm install --save ep_image_upload --legacy-peer-deps --no-audit --no-fund --registry=https://registry.npmmirror.com || true

echo "🔍 1. 释放 9001 端口..."
fuser -k 9001/tcp 2>/dev/null || true
sleep 1

echo "🔍 2. 直接前台运行捕获错误输出..."
node src/node/server.js || true

echo "📄 3. 打印 /var/log/etherpad.log 最新 30 行:"
tail -n 30 /var/log/etherpad.log || true
