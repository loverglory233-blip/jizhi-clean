#!/bin/bash
set -e

echo "🚀 [Etherpad Installer] 开始在宝塔服务器上安装并部署 Etherpad-Lite 实时协同引擎..."

INSTALL_DIR="/www/wwwroot/etherpad-lite"

# 1. 检测 Node.js 环境
if ! command -v node &> /dev/null; then
    echo "📦 安装 Node.js 与 npm..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs || yum install -y nodejs || true
fi

NODE_VER=$(node -v)
echo "✅ Node.js 环境就绪: $NODE_VER"

# 2. 下载 / 克隆 Etherpad-Lite
if [ ! -d "$INSTALL_DIR" ]; then
    echo "📥 下载 Etherpad-Lite 源码..."
    git clone --depth 1 https://github.com/ether/etherpad-lite.git "$INSTALL_DIR" || {
        echo "⚠️ Git clone 失败，尝试 Zip 镜像下载..."
        curl -sL "https://github.com/ether/etherpad-lite/archive/refs/heads/master.zip" -o /tmp/ep.zip
        unzip -q /tmp/ep.zip -d /www/wwwroot/
        mv /www/wwwroot/etherpad-lite-master "$INSTALL_DIR"
    }
fi

cd "$INSTALL_DIR"

# 3. 配置 settings.json (允许 iframe 嵌入，配置端口 9001)
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

# 4. 生成或固定 APIKey
mkdir -p var
echo "jizhi_academic_secret_key_2026" > APIKEY.txt

# 5. 安装依赖并启动后台守护
echo "📦 安装 Etherpad 依赖包..."
npm install --production --no-audit || true

echo "🔄 重启 Etherpad 协同进程..."
pkill -f "src/node/server.js" || true
nohup node src/node/server.js > /var/log/etherpad.log 2>&1 &

sleep 3

# 6. 检测服务健康
if curl -s "http://127.0.0.1:9001/api" | grep -q "1."; then
    echo "🎉 [Success] Etherpad-Lite 实时协同引擎已成功运行在 9001 端口！"
    echo "🔑 API Key: $(cat APIKEY.txt)"
else
    echo "⏳ Etherpad 正在后台初始化启动中，请查看日志: /var/log/etherpad.log"
fi
