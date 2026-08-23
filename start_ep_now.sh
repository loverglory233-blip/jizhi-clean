#!/bin/bash

echo "🚀 正在直接拉起 Etherpad 生产服务进程..."

EP_DIR="/www/wwwroot/etherpad-lite"
cd "$EP_DIR"
export PATH="/www/server/nodejs/v18.20.7/bin:$PATH"
export NODE_ENV=production

# 1. 释放 9001 端口
fuser -k 9001/tcp 2>/dev/null || true
sleep 1

# 2. 直接启动 node server
echo "🚀 正在后台拉起 Node 引擎..."
nohup node node_modules/ep_etherpad-lite/node/server.js --root > /var/log/etherpad.log 2>&1 &

sleep 4

# 3. 校验 9001 端口响应
if curl -s -I http://127.0.0.1:9001/ | grep -E "200|302|HTTP"; then
    echo "🎉🎉🎉 Etherpad 已经 100% 满血复活并成功监听 9001 端口！"
else
    echo "📄 查看最近 20 行日志:"
    tail -n 20 /var/log/etherpad.log || true
fi
