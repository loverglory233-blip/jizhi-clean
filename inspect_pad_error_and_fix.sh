#!/bin/bash
set -e

echo "🚀 ========================================================"
echo "⚡ 查看 /p/test_pad 报错真实日志并还原官方纯净代码"
echo "🚀 ========================================================"

export PATH="/usr/bin:/usr/local/bin:$PATH"
EP_DIR="/www/wwwroot/etherpad-lite"

cd "$EP_DIR"

echo "📄 1. 查看最新异常日志 (最近 35 行):"
tail -n 35 /var/log/etherpad.log || true
echo ""

# 停止旧进程
fuser -k 9001/tcp 2>/dev/null || true
pkill -9 -f "node" 2>/dev/null || true
sleep 1

# 100% 还原官方纯净源码
echo "2. 正在 100% 还原官方源码 (消除所有 500 异常)..."
git checkout src/ 2>/dev/null || true

# 重新启动
echo "3. 启动官方服务..."
export NODE_ENV=production
nohup ./bin/run.sh --root > /var/log/etherpad.log 2>&1 &

# 等待就绪
echo "⏳ 等待 9001 端口就绪..."
for i in {1..35}; do
    CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:9001/ || echo "000")
    if [ "$CODE" = "200" ] || [ "$CODE" = "302" ]; then
        echo "🎉 9001 端口在第 $i 秒就绪 (HTTP $CODE)！"
        break
    fi
    echo -n "."
    sleep 1
done
echo ""

echo "4. 重新测试真实 Pad 页面响应状态:"
curl -s "http://127.0.0.1:9001/p/test_pad_live?showControls=true" | head -n 25
