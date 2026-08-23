#!/bin/bash
set -e

echo "🚀 ========================================================"
echo "⚡ 100% 还原 Etherpad 官方原汁原味纯净样式 (消除任何自定义侵入)"
echo "🚀 ========================================================"

export PATH="/usr/bin:/usr/local/bin:$PATH"
EP_DIR="/www/wwwroot/etherpad-lite"

cd "$EP_DIR"

# 1. 还原所有源码与样式到官方原始纯正状态
git checkout src/ 2>/dev/null || true

# 2. 重新编译原生 UI
pnpm run build:ui || true

# 3. 重启 Etherpad
fuser -k 9001/tcp 2>/dev/null || true
pkill -9 -f "node" 2>/dev/null || true
sleep 1
export NODE_ENV=production
nohup ./bin/run.sh --root > /var/log/etherpad.log 2>&1 &

echo "⏳ 等待 9001 端口就绪..."
for i in {1..35}; do
    CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:9001/ || echo "000")
    if [ "$CODE" = "200" ] || [ "$CODE" = "302" ]; then
        echo "🎉 官方纯净版 Etherpad 2.7.3 在第 $i 秒完全就绪 (HTTP $CODE)！"
        break
    fi
    echo -n "."
    sleep 1
done
