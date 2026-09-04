#!/bin/bash

echo "🔧 正在净化并启动 Etherpad..."

EP_DIR="/www/wwwroot/etherpad-lite"
if [ ! -d "$EP_DIR" ]; then
    echo "❌ 未找到 Etherpad 目录: $EP_DIR"
    exit 1
fi

cd "$EP_DIR"
export PATH="/www/server/nodejs/v18.20.7/bin:/www/server/nodejs/v20.18.0/bin:/www/server/nodejs/v16.20.2/bin:$PATH:/usr/local/bin:/usr/bin"

# 1. 净化 settings.json，将 defaultPadText 置为空白
node -e '
  const fs = require("fs");
  const p = "settings.json";
  if (fs.existsSync(p)) {
    try {
      let s = JSON.parse(fs.readFileSync(p, "utf8"));
      s.defaultPadText = "";
      fs.writeFileSync(p, JSON.stringify(s, null, 2), "utf8");
      console.log("✅ defaultPadText 已设置为纯白空字符");
    } catch(e) {}
  }
' 2>/dev/null || true

# 2. 仅精准释放 9001 端口并清理旧进程
fuser -k 9001/tcp 2>/dev/null || true
pkill -9 -f "node.*etherpad" 2>/dev/null || true
pkill -9 -f "node src/node/server.js" 2>/dev/null || true
sleep 1

# 3. 修复 Settings.js fast-deep-equal/es6 兼容
if [ -f "src/node/utils/Settings.js" ]; then
    sed -i "s|require('fast-deep-equal/es6')|require('fast-deep-equal')|g" src/node/utils/Settings.js 2>/dev/null || true
    sed -i 's|require("fast-deep-equal/es6")|require("fast-deep-equal")|g' src/node/utils/Settings.js 2>/dev/null || true
fi

# 4. 启动 Etherpad
echo "🚀 正在拉起 Etherpad 守护进程..."
if [ -f "src/node/server.js" ]; then
    NODE_OPTIONS="--max-old-space-size=768" nohup node src/node/server.js > /var/log/etherpad.log 2>&1 &
elif [ -f "./bin/run.sh" ]; then
    nohup ./bin/run.sh --root > /var/log/etherpad.log 2>&1 &
fi
sleep 4

# 5. 校验 9001 端口响应
if curl -s -I http://127.0.0.1:9001/ | grep -E "200|302|HTTP"; then
    echo "🎉🎉🎉 Etherpad (9001 端口) 已经 100% 满血复活并正常响应！"
else
    echo "📄 查看最近 20 行日志:"
    tail -n 20 /var/log/etherpad.log || true
fi

# 6. 重新载入 Nginx 配置
cd /www/wwwroot/47.99.110.230 2>/dev/null || true
nginx -s reload 2>/dev/null || systemctl reload nginx 2>/dev/null || true
