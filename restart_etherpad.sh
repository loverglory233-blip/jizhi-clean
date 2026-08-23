#!/bin/bash

echo "🔧 正在修复 fast-deep-equal 核心依赖并启动 Etherpad..."

EP_DIR="/www/wwwroot/etherpad-lite"
if [ ! -d "$EP_DIR" ]; then
    echo "❌ 未找到 Etherpad 目录: $EP_DIR"
    exit 1
fi

cd "$EP_DIR"
export PATH="/www/server/nodejs/v18.20.7/bin:$PATH"

# 1. 修复缺失的 fast-deep-equal 模块 (支持 /es6 路径)
echo "📥 正在补全核心依赖 fast-deep-equal..."
npm install fast-deep-equal@2.0.1 --save --no-audit --no-fund --registry=https://registry.npmmirror.com || true
cd src && npm install fast-deep-equal@2.0.1 --save --no-audit --no-fund --registry=https://registry.npmmirror.com 2>/dev/null || true
cd "$EP_DIR"

# 1. 仅精准释放 9001 端口 (严禁 pkill 误杀脚本自身)
fuser -k 9001/tcp 2>/dev/null || true
sleep 1

# 修复 Settings.js fast-deep-equal/es6 兼容
if [ -f "src/node/utils/Settings.js" ]; then
    sed -i "s|require('fast-deep-equal/es6')|require('fast-deep-equal')|g" src/node/utils/Settings.js 2>/dev/null || true
    sed -i 's|require("fast-deep-equal/es6")|require("fast-deep-equal")|g' src/node/utils/Settings.js 2>/dev/null || true
fi

# 2. 启动 Etherpad
echo "🚀 正在拉起 Etherpad 守护进程..."
nohup node src/node/server.js > /var/log/etherpad.log 2>&1 &
sleep 4

# 4. 校验 9001 端口响应
if curl -s -I http://127.0.0.1:9001/ | grep -E "200|302|HTTP"; then
    echo "🎉🎉🎉 Etherpad (9001 端口) 已经 100% 满血复活并正常响应！"
else
    echo "📄 查看最近 20 行日志:"
    tail -n 20 /var/log/etherpad.log || true
fi

# 5. 重新载入 Nginx 配置
cd /www/wwwroot/47.99.110.230
./fix_nginx_clean_final.sh
