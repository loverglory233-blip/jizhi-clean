#!/bin/bash
set -e

echo "🔧 正在精准探测并启动 Etherpad 服务 (解决 502 Bad Gateway)..."

EP_DIR="/www/wwwroot/etherpad-lite"
if [ ! -d "$EP_DIR" ]; then
    echo "❌ 未找到 Etherpad 目录: $EP_DIR"
    exit 1
fi

cd "$EP_DIR"
export PATH="/www/server/nodejs/v18.20.7/bin:$PATH"

# 1. 杀掉旧的残留进程
pkill -9 -f "server.js" || true
pkill -9 -f "etherpad" || true
sleep 1

# 2. 探测真正的启动入口
START_CMD=""
if [ -f "src/node/server.js" ]; then
    START_CMD="node src/node/server.js"
elif [ -f "node_modules/ep_etherpad-lite/node/server.js" ]; then
    START_CMD="node node_modules/ep_etherpad-lite/node/server.js"
elif [ -f "bin/run.sh" ]; then
    START_CMD="./bin/run.sh"
fi

echo "🚀 使用启动入口: $START_CMD"

# 3. 启动 Etherpad
nohup $START_CMD > /var/log/etherpad.log 2>&1 &
sleep 3

# 4. 检查 9001 端口是否成功监听
if curl -s http://127.0.0.1:9001 >/dev/null; then
    echo "🎉🎉🎉 Etherpad (端口 9001) 已成功启动并恢复正常响应！"
else
    echo "📄 查看最近 20 行启动日志:"
    tail -n 20 /var/log/etherpad.log || true
fi
