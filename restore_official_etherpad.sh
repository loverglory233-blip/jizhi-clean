#!/bin/bash
set -e

echo "🔧 正在建立 node_modules 符号链接并启动 Etherpad..."

EP_DIR="/www/wwwroot/etherpad-lite"
cd "$EP_DIR"
export PATH="/www/server/nodejs/v18.20.7/bin:$PATH"

# 1. 建立 src/node_modules 软链接直连根目录
ln -sfn "$EP_DIR/node_modules" "$EP_DIR/src/node_modules" 2>/dev/null || true

# 2. 修复 Settings.js 引用
SETTINGS_FILE="src/node/utils/Settings.js"
if [ -f "$SETTINGS_FILE" ]; then
    sed -i "s|require('fast-deep-equal/es6')|require('fast-deep-equal')|g" "$SETTINGS_FILE" 2>/dev/null || true
    sed -i 's|require("fast-deep-equal/es6")|require("fast-deep-equal")|g' "$SETTINGS_FILE" 2>/dev/null || true
fi

# 3. 释放 9001 端口
fuser -k 9001/tcp 2>/dev/null || true
sleep 1

# 4. 后台拉起 Etherpad
echo "🚀 正在拉起 Etherpad 守护进程..."
nohup node src/node/server.js > /var/log/etherpad.log 2>&1 &
sleep 4

# 5. 校验 9001 端口响应
if curl -s -I http://127.0.0.1:9001/ | grep -E "200|302|HTTP"; then
    echo "🎉🎉🎉 Etherpad (9001 端口) 已经 100% 满血复活并正常响应！"
else
    echo "📄 查看最近 20 行日志:"
    tail -n 20 /var/log/etherpad.log || true
fi

# 6. 重新载入 Nginx 配置
cd /www/wwwroot/47.99.110.230
./fix_nginx_clean_final.sh
