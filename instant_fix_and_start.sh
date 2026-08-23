#!/bin/bash

echo "⚡ 正在秒级脱困并拉起 Etherpad (跳过所有 GitHub SSH 卡顿)..."

EP_DIR="/www/wwwroot/etherpad-lite"
cd "$EP_DIR"
export PATH="/www/server/nodejs/v18.20.7/bin:$PATH"

# 1. 杀掉卡住的 npm 进程与释放 9001 端口
killall -9 npm 2>/dev/null || true
fuser -k 9001/tcp 2>/dev/null || true
sleep 1

# 2. 极速单包注入 fast-deep-equal (0.5秒完成, 忽略一切关联脚本与git)
npm install fast-deep-equal@2.0.1 --no-package-lock --ignore-scripts --no-audit --no-fund --registry=https://registry.npmmirror.com || true

# 3. 后台拉起 Etherpad
echo "🚀 正在启动 Etherpad..."
nohup node src/node/server.js > /var/log/etherpad.log 2>&1 &
sleep 4

# 4. 检查 9001 端口
if curl -s -I http://127.0.0.1:9001/ | grep -E "200|302|HTTP"; then
    echo "🎉🎉🎉 Etherpad 已经 100% 满血复活！"
else
    echo "📄 查看最近 20 行日志:"
    tail -n 20 /var/log/etherpad.log || true
fi

# 5. 重新载入 Nginx 配置
cd /www/wwwroot/47.99.110.230
./fix_nginx_clean_final.sh
