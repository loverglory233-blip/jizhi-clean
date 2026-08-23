#!/bin/bash
set -e

echo "🚀 [Etherpad Installer] 正在使用高速国内镜像与 --legacy-peer-deps 安装 Etherpad..."

INSTALL_DIR="/www/wwwroot/etherpad-lite"

# 1. 确保目录存在
if [ ! -d "$INSTALL_DIR" ]; then
    echo "📥 下载 Etherpad-Lite 源码..."
    git clone --depth 1 https://github.com/ether/etherpad-lite.git "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# 2. 写入 settings.json 配置 (允许 iframe 嵌入，端口 9001)
echo "⚙️ 配置 Etherpad settings.json..."
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
  "importExportRateLimiting": {
    "windowMs": 60000,
    "max": 100
  },
  "commitRateLimiting": {
    "windowMs": 1000,
    "max": 50
  },
  "exposeVersion": false
}
SETTING_EOF

# 3. 生成固定 APIKey
mkdir -p var
echo "jizhi_academic_secret_key_2026" > APIKEY.txt

# 4. 设置国内极速镜像并以 --legacy-peer-deps 方式秒级安装
echo "⚡ 配置国内极速 npm 镜像源..."
npm config set registry https://registry.npmmirror.com

echo "📦 执行 Etherpad 依赖安装 (--legacy-peer-deps)..."
cd src
npm install --legacy-peer-deps --no-audit
cd ..

# 5. 后台拉起守护进程
echo "🔄 拉起 Etherpad 9001 端口协同进程..."
pkill -f "src/node/server.js" || true
pkill -f "etherpad" || true
nohup node src/node/server.js > /var/log/etherpad.log 2>&1 &

sleep 4

# 6. 健康检查
if curl -s "http://127.0.0.1:9001/api" | grep -q "1."; then
    echo "🎉🎉🎉 [Success] Etherpad-Lite 实时协同引擎已 100% 成功运行在 9001 端口！"
    echo "🔑 API Key: $(cat APIKEY.txt)"
else
    echo "⏳ Etherpad 正在后台初始化中，请查看日志: cat /var/log/etherpad.log"
fi
