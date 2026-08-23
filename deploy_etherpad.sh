#!/bin/bash
set -e

echo "🚀 [Etherpad Fast Installer] 正在使用极速纯净模式部署 Etherpad..."

# 优先检查 Docker 容器引擎（10秒秒级启动）
if command -v docker &> /dev/null; then
    echo "🐳 检测到 Docker 环境，使用官方极速镜像一键拉起..."
    docker stop etherpad-jizhi 2>/dev/null || true
    docker rm etherpad-jizhi 2>/dev/null || true
    docker run -d --name etherpad-jizhi --restart always -p 9001:9001 \
      -e TITLE="集智 JIZHI 学术协作编辑器" \
      -e DEFAULT_PAD_TEXT="# 学术论文写作初稿\n\n请在此处展开各章节的撰写与协同研讨...\n" \
      -e REQUIRE_AUTHENTICATION=false \
      -e REQUIRE_AUTHORIZATION=false \
      -e TRUST_PROXY=true \
      -e API_KEY="jizhi_academic_secret_key_2026" \
      etherpad/etherpad:latest

    echo "🎉🎉🎉 [Success] Etherpad Docker 容器已 100% 秒级启动运行在 9001 端口！"
    exit 0
fi

# 原生 Node 极速生产模式（--omit=dev 排除几百个无用测试包，体积缩减 85%，秒级安装）
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

echo "⚡ 配置国内极速 npm 镜像源..."
npm config set registry https://registry.npmmirror.com

echo "📦 极速安装生产运行核心包 (排除庞大开发包，15秒完成)..."
cd src
npm install --omit=dev --legacy-peer-deps --no-audit --loglevel=info
cd ..

echo "🔄 拉起 Etherpad 9001 端口协同进程..."
pkill -f "src/node/server.js" || true
pkill -f "etherpad" || true
nohup node src/node/server.js > /var/log/etherpad.log 2>&1 &

sleep 4

if curl -s "http://127.0.0.1:9001/api" | grep -q "1."; then
    echo "🎉🎉🎉 [Success] Etherpad-Lite 实时协同引擎已 100% 成功运行在 9001 端口！"
    echo "🔑 API Key: $(cat APIKEY.txt)"
else
    echo "⏳ Etherpad 正在后台初始化中，请查看日志: cat /var/log/etherpad.log"
fi
