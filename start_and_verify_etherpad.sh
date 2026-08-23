#!/bin/bash
set -e

echo "🚀 ========================================================"
echo "⚡ 正在启动 Etherpad 并等待 9001 端口就绪"
echo "🚀 ========================================================"

export PATH="/www/server/nodejs/v18.20.7/bin:$PATH"
EP_DIR="/www/wwwroot/etherpad-lite"

cd "$EP_DIR"

# 1. 释放 9001 端口并结束旧进程
fuser -k 9001/tcp 2>/dev/null || true
pkill -9 -f "node" 2>/dev/null || true
sleep 1

# 2. 后台启动 Etherpad
echo "🚀 正在启动 Etherpad (后台运行)..."
export NODE_ENV=production
nohup ./bin/run.sh --root > /var/log/etherpad.log 2>&1 &

# 3. 循环探测 9001 端口就绪 (最多等待 20 秒)
echo "⏳ 正在等待 9001 端口监听就绪..."
SUCCESS=0
for i in {1..20}; do
    if curl -s -I http://127.0.0.1:9001/ 2>/dev/null | grep -E "200|302|HTTP" > /dev/null; then
        SUCCESS=1
        break
    fi
    echo -n "..."
    sleep 1
done
echo ""

if [ $SUCCESS -eq 1 ]; then
    echo "🎉🎉🎉 Etherpad 9001 端口已成功就绪并开始服务！"
    echo ""
    echo "📄 查看最近 10 行运行日志:"
    tail -n 10 /var/log/etherpad.log
else
    echo "❌ 启动超时，查看日志:"
    tail -n 25 /var/log/etherpad.log
fi

# 4. 重新载入 Nginx 配置
cd /www/wwwroot/47.99.110.230
./fix_nginx_clean_final.sh
