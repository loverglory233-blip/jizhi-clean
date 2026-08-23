#!/bin/bash
set -e

echo "🔧 正在永久修复 Etherpad Settings.js 依赖路径并启动..."

EP_DIR="/www/wwwroot/etherpad-lite"
cd "$EP_DIR"
export PATH="/www/server/nodejs/v18.20.7/bin:$PATH"

# 1. 修复 Settings.js 中的 fast-deep-equal/es6 引用为通用 fast-deep-equal
SETTINGS_FILE="src/node/utils/Settings.js"
if [ -f "$SETTINGS_FILE" ]; then
    echo "📝 正在修复 $SETTINGS_FILE 引用..."
    sed -i "s|require('fast-deep-equal/es6')|require('fast-deep-equal')|g" "$SETTINGS_FILE" || true
    sed -i 's|require("fast-deep-equal/es6")|require("fast-deep-equal")|g' "$SETTINGS_FILE" || true
fi

# 2. 确保 fast-deep-equal 存在
npm install fast-deep-equal --no-package-lock --ignore-scripts --no-audit --no-fund --registry=https://registry.npmmirror.com 2>/dev/null || true

# 3. 释放 9001 端口
fuser -k 9001/tcp 2>/dev/null || true
sleep 1

# 4. 启动 Etherpad
echo "🚀 正在拉起 Etherpad 守护进程..."
nohup node src/node/server.js > /var/log/etherpad.log 2>&1 &
sleep 4

# 5. 校验 9001 端口
if curl -s -I http://127.0.0.1:9001/ | grep -E "200|302|HTTP"; then
    echo "🎉🎉🎉 Etherpad (9001 端口) 已经 100% 满血复活并正常响应！"
else
    echo "📄 查看最近 20 行日志:"
    tail -n 20 /var/log/etherpad.log || true
fi

# 6. 重新载入 Nginx 配置
cd /www/wwwroot/47.99.110.230
./fix_nginx_clean_final.sh
