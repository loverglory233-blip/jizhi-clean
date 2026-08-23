#!/bin/bash
set -e

echo "🚀 [Etherpad Fast Installer] 正在配置并启动 Etherpad-Lite 实时协同引擎..."

INSTALL_DIR="/www/wwwroot/etherpad-lite"

if [ ! -d "$INSTALL_DIR" ]; then
    echo "📥 下载 Etherpad-Lite 源码..."
    git clone --depth 1 https://github.com/ether/etherpad-lite.git "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# 写入配置
echo "⚙️ 写入 settings.json 配置..."
cat << 'SETTING_EOF' > settings.json
{
  "title": "集智 JIZHI 学术协作编辑器",
  "favicon": "favicon.ico",
  "ip": "0.0.0.0",
  "port": 9001,
  "showSettingsInAdminPage": true,
  "dbType": "dirty",
  "dbSettings": {
    "filename": "var/dirty.db"
  },
  "defaultPadText": "# 学术论文写作初稿\n\n请在此处展开各章节的撰写与协同研讨...\n",
  "padOptions": {
    "noColors": false,
    "showControls": true,
    "showChat": false,
    "showLineNumbers": true,
    "useMonospaceFont": false,
    "userName": "组员",
    "userColor": "#2563eb",
    "alwaysShowChat": false,
    "chatAndUsers": false,
    "lang": "zh-cn"
  },
  "suppressErrorsInPadText": true,
  "requireAuthentication": false,
  "requireAuthorization": false,
  "trustProxy": true,
  "socketTransportProtocols": ["websocket", "polling"],
  "loadTest": false,
  "exposeVersion": false
}
SETTING_EOF

mkdir -p var
echo "jizhi_academic_secret_key_2026" > APIKEY.txt

echo "🔄 精确重启 Etherpad 9001 端口协同进程..."
pkill -f "src/node/server.js" || true

nohup node src/node/server.js > /var/log/etherpad.log 2>&1 &

sleep 3

# 健康检查
if curl -s "http://127.0.0.1:9001/api" | grep -q "1."; then
    echo "🎉🎉🎉 [Success] Etherpad-Lite 实时协同引擎已 100% 成功运行在 9001 端口！"
    echo "🔑 API Key: $(cat APIKEY.txt)"
else
    echo "⏳ Etherpad 服务已拉起，正在初始化，查看日志: cat /var/log/etherpad.log"
fi
