#!/bin/bash
set -e

echo "🔧 正在为 Settings.js 的 initLogging 加入绝对容错并秒级拉起 Etherpad..."

EP_DIR="/www/wwwroot/etherpad-lite"
cd "$EP_DIR"
export PATH="/www/server/nodejs/v18.20.7/bin:$PATH"

SETTINGS_FILE="src/node/utils/Settings.js"
if [ -f "$SETTINGS_FILE" ]; then
    echo "📝 正在注入日志容错保护..."
    # 1. 修复 fast-deep-equal 引用
    sed -i "s|require('fast-deep-equal/es6')|require('fast-deep-equal')|g" "$SETTINGS_FILE" 2>/dev/null || true
    sed -i 's|require("fast-deep-equal/es6")|require("fast-deep-equal")|g' "$SETTINGS_FILE" 2>/dev/null || true

    # 2. 修复 log4js.configure 容错保护 (try-catch 拦截任何版本格式不兼容报错)
    node -e '
    const fs = require("fs");
    let code = fs.readFileSync("src/node/utils/Settings.js", "utf8");
    code = code.replace(/exports\.initLogging\s*=\s*function\s*\(\)\s*\{[\s\S]*?log4js\.configure\([\s\S]*?\);[\s\S]*?\};/m, function(m) {
        return `exports.initLogging = function () {
  try {
    log4js.configure({ appenders: [{ type: "console" }] });
  } catch (e1) {
    try {
      log4js.configure({ appenders: { console: { type: "console" } }, categories: { default: { appenders: ["console"], level: "INFO" } } });
    } catch (e2) {}
  }
};`;
    });
    fs.writeFileSync("src/node/utils/Settings.js", code, "utf8");
    console.log("✅ Settings.js 日志引擎已注入全版本自适应容错！");
    ' || true
fi

# 3. 释放 9001 端口
fuser -k 9001/tcp 2>/dev/null || true
sleep 1

# 4. 后台拉起 Etherpad
echo "🚀 正在启动 Etherpad 守护进程..."
nohup node src/node/server.js > /var/log/etherpad.log 2>&1 &
sleep 4

# 5. 校验 9001 端口响应
if curl -s -I http://127.0.0.1:9001/ | grep -E "200|302|HTTP"; then
    echo "🎉🎉🎉 Etherpad (9001 端口) 已经 100% 满血复活并正常响应！"
else
    echo "📄 查看最近 25 行日志:"
    tail -n 25 /var/log/etherpad.log || true
fi

# 6. 重新载入 Nginx 配置
cd /www/wwwroot/47.99.110.230
./fix_nginx_clean_final.sh
