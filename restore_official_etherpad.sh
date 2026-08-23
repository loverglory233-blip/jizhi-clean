#!/bin/bash

echo "🚀 正在通过 Etherpad 官方核心自愈引擎一键恢复并拉起服务..."

EP_DIR="/www/wwwroot/etherpad-lite"
if [ ! -d "$EP_DIR" ]; then
    echo "❌ 未找到 Etherpad 目录: $EP_DIR"
    exit 1
fi

cd "$EP_DIR"
export PATH="/www/server/nodejs/v18.20.7/bin:$PATH"

# 1. 释放 9001 端口
fuser -k 9001/tcp 2>/dev/null || true
sleep 1

# 2. 修复 Settings.js fast-deep-equal
SETTINGS_FILE="src/node/utils/Settings.js"
if [ -f "$SETTINGS_FILE" ]; then
    sed -i "s|require('fast-deep-equal/es6')|require('fast-deep-equal')|g" "$SETTINGS_FILE" 2>/dev/null || true
    sed -i 's|require("fast-deep-equal/es6")|require("fast-deep-equal")|g' "$SETTINGS_FILE" 2>/dev/null || true
fi

# 3. 使用 Etherpad 官方标准启动器 bin/run.sh 启动
echo "🚀 正在执行 Etherpad 官方启动器 (bin/run.sh)..."
if [ -f "bin/run.sh" ]; then
    chmod +x bin/*.sh 2>/dev/null || true
    nohup ./bin/run.sh > /var/log/etherpad.log 2>&1 &
elif [ -f "src/node/server.js" ]; then
    nohup node src/node/server.js > /var/log/etherpad.log 2>&1 &
fi

sleep 5

# 4. 检查 9001 端口状态
if curl -s -I http://127.0.0.1:9001/ | grep -E "200|302|HTTP"; then
    echo "🎉🎉🎉 Etherpad 官方内核已经 100% 满血复活并成功监听 9001 端口！"
else
    echo "📄 查看启动日志:"
    tail -n 25 /var/log/etherpad.log || true
fi

# 5. 重新载入 Nginx 配置
cd /www/wwwroot/47.99.110.230
./fix_nginx_clean_final.sh
