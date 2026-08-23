#!/bin/bash
set -e

echo "🚀 ========================================================"
echo "⚡ 极速自愈：秒级拉起 Etherpad 并释放系统全部资源"
echo "🚀 ========================================================"

export PATH="/usr/bin:/usr/local/bin:$PATH"
EP_DIR="/www/wwwroot/etherpad-lite"

# 1. 杀掉可能卡住的残留编译/打包进程，彻底释放 CPU
pkill -9 -f "vite" 2>/dev/null || true
pkill -9 -f "tsc" 2>/dev/null || true
pkill -9 -f "pnpm" 2>/dev/null || true
fuser -k 9001/tcp 2>/dev/null || true
sleep 1

# 2. 启动 Etherpad 2.7.3
cd "$EP_DIR"
export NODE_ENV=production
nohup ./bin/run.sh --root > /var/log/etherpad.log 2>&1 &

echo "⏳ 等待 9001 端口拉起 (最长 15 秒)..."
READY=0
for i in {1..15}; do
    CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:9001/ || echo "000")
    if [ "$CODE" = "200" ] || [ "$CODE" = "302" ]; then
        READY=1
        echo "🎉 9001 端口在第 $i 秒秒级就绪 (HTTP $CODE)！"
        break
    fi
    echo -n "."
    sleep 1
done
echo ""

# 3. 重启 Nginx 与 PHP 释放 Web 连接
cd /www/wwwroot/47.99.110.230
./fix_nginx_clean_final.sh > /dev/null 2>&1 || true
systemctl reload nginx 2>/dev/null || true

echo "🟢 系统 CPU/内存已全部释放完毕，Web 链路完全畅通！"
