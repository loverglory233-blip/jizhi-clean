#!/bin/bash
set -e

echo "🚀 ========================================================"
echo "⚡ 正在配置 settings.json (关闭境外版本探测+注册 var/plugins.json)"
echo "🚀 ========================================================"

export PATH="/www/server/nodejs/v18.20.7/bin:$PATH"
EP_DIR="/www/wwwroot/etherpad-lite"

cd "$EP_DIR"

# 1. 释放 9001 端口并结束旧进程
fuser -k 9001/tcp 2>/dev/null || true
pkill -9 -f "node" 2>/dev/null || true
sleep 1

# 2. 写入纯净 settings.json 并彻底关闭境外 update check
echo "⚙️ 正在关闭境外版本检查，消除 ETIMEDOUT 报错..."
node -e '
const fs = require("fs");
let settings = {};
try { settings = JSON.parse(fs.readFileSync("settings.json", "utf8")); } catch(e) {}

settings.ip = "0.0.0.0";
settings.port = 9001;
settings.minify = false;
settings.maxAge = 0;
settings.suppressErrorsInPadText = true;
settings.requireAuthentication = false;
settings.requireAuthorization = false;
settings.trustProxy = true;

// 彻底关闭境外版本检查请求，根治 5.75.249.160:443 ETIMEDOUT 报错
settings.automaticVersionHost = null;

delete settings.toolbar;

fs.writeFileSync("settings.json", JSON.stringify(settings, null, 2), "utf8");
console.log("✅ settings.json 已更新：境外版本探测已永久关闭！");
'

# 3. 强制调用 Etherpad 插件管理器生成 var/plugins.json
echo "📦 正在扫描 node_modules 并生成 var/plugins.json..."
node -e '
const plugins = require("./src/node/pluginfw/plugins.js");
plugins.update(() => {
  const fs = require("fs");
  try {
    const data = JSON.parse(fs.readFileSync("var/plugins.json", "utf8"));
    const list = Object.keys(data.plugins || {});
    console.log("🎉 成功注册插件清单 (" + list.length + " 个):", list.join(", "));
  } catch(e) {
    console.error("写入 plugins.json 失败:", e);
  }
  process.exit(0);
});
'

# 4. 启动 Etherpad 服务
echo "🚀 正在以后台模式启动 Etherpad..."
nohup ./bin/run.sh --root > /var/log/etherpad.log 2>&1 &

sleep 6

# 5. 重新自检
cd /www/wwwroot/47.99.110.230
./check_etherpad_plugins_status.sh
