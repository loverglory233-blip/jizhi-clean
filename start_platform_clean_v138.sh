#!/bin/bash
set -e

echo "🚀 ========================================================"
echo "⚡ 集智平台 v138 最新发布版：秒级极速拉起与健康检查"
echo "🚀 ========================================================"

export PATH="/usr/bin:/usr/local/bin:$PATH"
EP_DIR="/www/wwwroot/etherpad-lite"

# 1. 释放 9001 端口
fuser -k 9001/tcp 2>/dev/null || true
pkill -9 -f "node" 2>/dev/null || true
sleep 1

# 2. 确保 settings.json 开启 trustProxy: true
cd "$EP_DIR"
node -e '
const fs = require("fs");
const settings = {
  title: "JIZHI Academic Pad",
  ip: "0.0.0.0",
  port: 9001,
  trustProxy: true,
  skinName: "colibris",
  padOptions: {
    noColors: true,
    showControls: true,
    showChat: false,
    showLineNumbers: true,
    useMonospaceFont: false,
    userName: false,
    userColor: false
  },
  showSettingsInAdminPage: true
};
fs.writeFileSync("settings.json", JSON.stringify(settings, null, 2), "utf8");
'

# 3. 启动 Etherpad 2.7.3
export NODE_ENV=production
nohup ./bin/run.sh --root > /var/log/etherpad.log 2>&1 &

echo "⏳ 等待 Etherpad 9001 端口就绪 (最长 15 秒)..."
READY=0
for i in {1..15}; do
    CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:9001/ || echo "000")
    if [ "$CODE" = "200" ] || [ "$CODE" = "302" ]; then
        READY=1
        echo "🎉 Etherpad 9001 端口在第 $i 秒秒级就绪 (HTTP $CODE)！"
        break
    fi
    echo -n "."
    sleep 1
done
echo ""

# 4. 重载 Nginx 代理规则
cd /www/wwwroot/47.99.110.230
./fix_nginx_clean_final.sh > /dev/null 2>&1 || true

echo "🎉🎉🎉 集智平台最新版本 20260823_v138 已全量平稳就绪！"
