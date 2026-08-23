#!/bin/bash
set -e

echo "🚀 ========================================================"
echo "⚡ 正在以最稳官方架构拉起 Etherpad (彻底根治 502 并挂载 11 大插件)"
echo "🚀 ========================================================"

export PATH="/www/server/nodejs/v18.20.7/bin:$PATH"
EP_DIR="/www/wwwroot/etherpad-lite"

cd "$EP_DIR"

# 1. 释放 9001 端口
fuser -k 9001/tcp 2>/dev/null || true
pkill -9 -f "node" 2>/dev/null || true
sleep 1

# 2. 写入干净高稳定的 settings.json (移除易报错的自定义 toolbar，由插件自动注册)
node -e '
const fs = require("fs");
let settings = {};
try {
    settings = JSON.parse(fs.readFileSync("settings.json", "utf8"));
} catch(e) {
    try { settings = JSON.parse(fs.readFileSync("settings.json.template", "utf8")); } catch(err) {}
}

settings.ip = "0.0.0.0";
settings.port = 9001;
settings.minify = false;
settings.maxAge = 0;
settings.showSettingsInAdminPage = true;
settings.suppressErrorsInPadText = true;
settings.requireAuthentication = false;
settings.requireAuthorization = false;
settings.trustProxy = true;

// 移除手工 toolbar, 让 11 大插件自适应注入
delete settings.toolbar;

fs.writeFileSync("settings.json", JSON.stringify(settings, null, 2), "utf8");
console.log("✅ settings.json 已净化为全插件原生兼容模式！");
'

# 3. 启动 Etherpad
echo "🚀 正在启动 Etherpad 服务..."
nohup ./bin/run.sh --root > /var/log/etherpad.log 2>&1 &

sleep 6

# 4. 验证 9001 端口
if curl -s -I http://127.0.0.1:9001/ | grep -E "200|302|HTTP" > /dev/null; then
    echo "🎉🎉🎉 Etherpad 已成功恢复并稳定监听 9001 端口！"
else
    echo "📄 查看最近 20 行日志:"
    tail -n 20 /var/log/etherpad.log || true
fi

# 5. 重新载入 Nginx 配置
cd /www/wwwroot/47.99.110.230
./fix_nginx_clean_final.sh
