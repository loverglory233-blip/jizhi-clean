#!/bin/bash
set -e

echo "🚀 [Etherpad Installer] 正在自动清理旧版 Node 冲突并部署 Etherpad-Lite..."

# 1. 彻底解决 Ubuntu 系统的 libnode-dev 包文件冲突
if command -v apt-get &> /dev/null; then
    echo "🧹 清理旧版 libnode-dev 依赖冲突..."
    apt-get remove -y libnode-dev libnode72 || true
    dpkg --remove --force-all libnode-dev libnode72 || true
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y -o Dpkg::Options::="--force-overwrite" nodejs
elif command -v yum &> /dev/null; then
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
    yum install -y nodejs
fi

NODE_VER=$(node -v)
NPM_VER=$(npm -v)
echo "✅ Node.js 20 环境已成功安装: $NODE_VER (npm $NPM_VER)"

INSTALL_DIR="/www/wwwroot/etherpad-lite"

# 2. 清理旧目录并克隆稳定源码
rm -rf "$INSTALL_DIR"
echo "📥 下载 Etherpad-Lite 稳定源码..."
git clone --depth 1 https://github.com/ether/etherpad-lite.git "$INSTALL_DIR"

cd "$INSTALL_DIR"

# 3. 写入 settings.json 配置 (允许 iframe 嵌入，端口 9001)
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

# 5. 官方自动化构建安装依赖
echo "📦 执行 Etherpad 依赖安装..."
export NODE_ENV=production
npm install --no-audit

# 6. 后台拉起守护进程
echo "🔄 拉起 Etherpad 9001 端口协同进程..."
pkill -f "src/node/server.js" || true
pkill -f "etherpad" || true
nohup node src/node/server.js > /var/log/etherpad.log 2>&1 &

sleep 4

# 7. 健康检查
if curl -s "http://127.0.0.1:9001/api" | grep -q "1."; then
    echo "🎉🎉🎉 [Success] Etherpad-Lite 实时协同引擎已 100% 成功运行在 9001 端口！"
    echo "🔑 API Key: $(cat APIKEY.txt)"
else
    echo "⏳ Etherpad 正在后台初始化中，请查看日志: cat /var/log/etherpad.log"
fi
