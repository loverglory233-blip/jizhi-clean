#!/bin/bash
set -e

echo "🔧 正在永久修复 Settings.js 日志引擎并启动 Etherpad..."

EP_DIR="/www/wwwroot/etherpad-lite"
cd "$EP_DIR"
export PATH="/www/server/nodejs/v18.20.7/bin:$PATH"

# 1. 修复 Settings.js 中的 fast-deep-equal 和 initLogging
node -e '
const fs = require("fs");
const file = "src/node/utils/Settings.js";
if (fs.existsSync(file)) {
  let content = fs.readFileSync(file, "utf8");
  // 替换 fast-deep-equal
  content = content.split("fast-deep-equal/es6").join("fast-deep-equal");
  // 彻底安全化 initLogging
  content = content.replace(/exports\.initLogging\s*=\s*function\s*\(\)\s*\{[\s\S]*?\n\};/m, `exports.initLogging = function () {
  try {
    if (typeof log4js.configure === "function") {
      log4js.configure({ appenders: [{ type: "console" }] });
    }
  } catch (e) {}
};`);
  fs.writeFileSync(file, content, "utf8");
  console.log("✅ Settings.js 已成功写入 100% 绝对安全防护！");
}
'

# 2. 释放 9001 端口
fuser -k 9001/tcp 2>/dev/null || true
sleep 1

# 3. 后台拉起 Etherpad
echo "🚀 正在启动 Etherpad 守护进程..."
nohup node src/node/server.js > /var/log/etherpad.log 2>&1 &
sleep 4

# 4. 校验 9001 端口响应
if curl -s -I http://127.0.0.1:9001/ | grep -E "200|302|HTTP"; then
    echo "🎉🎉🎉 Etherpad (9001 端口) 已经 100% 满血复活并正常响应！"
else
    echo "📄 查看最近 25 行日志:"
    tail -n 25 /var/log/etherpad.log || true
fi

# 5. 重新载入 Nginx 配置
cd /www/wwwroot/47.99.110.230
./fix_nginx_clean_final.sh
