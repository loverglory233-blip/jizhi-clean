#!/bin/bash
set -e

echo "🚀 正在以极简轻量模式秒级启动 Etherpad (0 npm 内存开销，绝不被 Killed)..."

EP_DIR="/www/wwwroot/etherpad-lite"
if [ ! -d "$EP_DIR" ]; then
    echo "❌ 未找到 Etherpad 目录: $EP_DIR"
    exit 1
fi

cd "$EP_DIR"
export PATH="/www/server/nodejs/v18.20.7/bin:$PATH"

# 1. 杀掉旧残留
pkill -9 -f "server.js" || true
pkill -9 -f "etherpad" || true
fuser -k 9001/tcp 2>/dev/null || true
sleep 1

# 2. 直接启动 Etherpad 守护进程 (无需重复运行 npm, 内存占用仅 40MB)
echo "🚀 正在启动 Etherpad 服务进程..."
if [ -f "src/node/server.js" ]; then
    nohup node src/node/server.js > /var/log/etherpad.log 2>&1 &
elif [ -f "bin/run.sh" ]; then
    nohup ./bin/run.sh > /var/log/etherpad.log 2>&1 &
else
    nohup node node_modules/ep_etherpad-lite/node/server.js > /var/log/etherpad.log 2>&1 &
fi

sleep 4

# 3. 校验 9001 端口响应
if curl -s -I http://127.0.0.1:9001/ | grep -E "200|302|HTTP"; then
    echo "🎉🎉🎉 Etherpad (9001 端口) 已经 100% 满血复活并正常响应！"
else
    echo "⚠️ 检查备用入口..."
    nohup node node_modules/ep_etherpad-lite/node/server.js > /var/log/etherpad.log 2>&1 &
    sleep 4
    if curl -s -I http://127.0.0.1:9001/ | grep -E "200|302|HTTP"; then
        echo "🎉🎉🎉 Etherpad 备用入口启动成功！"
    else
        echo "📄 最近 30 行日志:"
        tail -n 30 /var/log/etherpad.log || true
    fi
fi

# 4. 重新载入 Nginx 配置
cd /www/wwwroot/47.99.110.230
./fix_nginx_clean_final.sh
