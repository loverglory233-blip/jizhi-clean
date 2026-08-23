#!/bin/bash

echo "🚀 正在启动 Etherpad 服务进程..."

EP_DIR="/www/wwwroot/etherpad-lite"
if [ ! -d "$EP_DIR" ]; then
    echo "❌ 未找到 Etherpad 目录: $EP_DIR"
    exit 1
fi

cd "$EP_DIR"
export PATH="/www/server/nodejs/v18.20.7/bin:$PATH"

# 1. 仅精准释放 9001 端口 (严禁 pkill 误杀脚本自身)
fuser -k 9001/tcp 2>/dev/null || true
sleep 1

# 2. 启动 Etherpad
echo "🚀 正在后台拉起 Node 引擎..."
nohup node src/node/server.js > /var/log/etherpad.log 2>&1 &
sleep 4

# 3. 校验 9001 端口响应
if curl -s -I http://127.0.0.1:9001/ | grep -E "200|302|HTTP"; then
    echo "🎉🎉🎉 Etherpad (9001 端口) 已经 100% 满血复活并正常响应！"
else
    echo "⚠️ 尝试备用入口..."
    nohup node node_modules/ep_etherpad-lite/node/server.js > /var/log/etherpad.log 2>&1 &
    sleep 4
    if curl -s -I http://127.0.0.1:9001/ | grep -E "200|302|HTTP"; then
        echo "🎉🎉🎉 Etherpad 备用入口启动成功！"
    else
        echo "📄 最近 20 行运行日志:"
        tail -n 20 /var/log/etherpad.log || true
    fi
fi

# 4. 重新载入 Nginx 配置
cd /www/wwwroot/47.99.110.230
./fix_nginx_clean_final.sh
