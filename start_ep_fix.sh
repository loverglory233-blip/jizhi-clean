#!/bin/bash
set -e

echo "🚀 ========================================================"
echo "⚡ 直接秒级拉起 Etherpad 协同文档引擎 (9001 端口)"
echo "🚀 ========================================================"

export PATH="/www/server/nodejs/v18.20.7/bin:/www/server/nodejs/v22/bin:/www/server/nodejs/v20/bin:/www/server/nodejs/v18/bin:/www/server/nodejs/v16/bin:/usr/local/bin:/usr/bin:$PATH"

EP_DIR="/www/wwwroot/etherpad-lite"
if [ ! -d "$EP_DIR" ]; then
  for d in /www/wwwroot/47.99.110.230/etherpad-lite /opt/etherpad-lite /root/etherpad-lite /var/www/etherpad-lite /www/server/etherpad; do
    if [ -d "$d" ]; then
      EP_DIR="$d"
      break
    fi
  done
fi

cd "$EP_DIR"

fuser -k 9001/tcp 2>/dev/null || true
kill -9 $(lsof -t -i:9001 2>/dev/null) 2>/dev/null || true
pkill -9 -f "node.*server\.js" 2>/dev/null || true
sleep 1

rm -f var/*.lock var/dirty.db.lock 2>/dev/null || true
> /var/log/etherpad.log
export NODE_ENV=production

NODE_BIN=""
for nb in /www/server/nodejs/v18.20.7/bin/node /www/server/nodejs/v22*/bin/node /www/server/nodejs/v20*/bin/node /www/server/nodejs/v18*/bin/node /www/server/nodejs/v*/bin/node /usr/local/bin/node /usr/bin/node; do
  if [ -x "$nb" ]; then
    NODE_BIN="$nb"
    break
  fi
done
[ -z "$NODE_BIN" ] && NODE_BIN=$(which node 2>/dev/null || echo "node")

echo "🚀 使用 Node: $NODE_BIN 启动 src/node/server.js ..."
nohup "$NODE_BIN" src/node/server.js > /var/log/etherpad.log 2>&1 &

echo "⏳ 正在检测 9001 端口监听..."
READY=0
for i in {1..15}; do
  if curl -s -I --connect-timeout 2 --max-time 3 http://127.0.0.1:9001/ 2>/dev/null | grep -E "HTTP/(1.1|2) (200|302|404)" >/dev/null; then
    READY=1
    echo "🎉 Etherpad (9001 端口) 已在第 $i 秒就绪！"
    break
  fi
  echo -n "."
  sleep 1
done
echo ""

if [ $READY -eq 1 ]; then
  nginx -t 2>/dev/null && (nginx -s reload 2>/dev/null || systemctl reload nginx 2>/dev/null || true)
  echo "✅ Nginx 反代已同步重载！"
else
  echo "❌ 启动未就绪，输出最新日志:"
  tail -n 25 /var/log/etherpad.log || true
fi
