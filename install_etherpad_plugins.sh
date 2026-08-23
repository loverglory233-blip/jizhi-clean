#!/bin/bash
set -e

echo "📦 正在为 Etherpad 一键安装官方富文本与光标作者姓名插件包..."

EP_DIR="/www/wwwroot/etherpad-lite"
if [ ! -d "$EP_DIR" ]; then
    echo "❌ 未找到 Etherpad 目录: $EP_DIR"
    exit 1
fi

cd "$EP_DIR"
export PATH="/www/server/nodejs/v18.20.7/bin:$PATH"

echo "🚀 当前 Node 版本: $(node -v)"
echo "🚀 当前 npm 版本: $(npm -v)"

# 配置淘宝国内极速源
npm config set registry https://registry.npmmirror.com

echo "📦 开始安装官方插件: ep_cursortrace (光标姓名气泡), ep_font_size (字号), ep_font_family (字体), ep_align (对齐), ep_headings2 (标题)..."
npm install --save ep_cursortrace ep_font_size ep_font_family ep_align ep_headings2 --legacy-peer-deps || true

echo "🔄 正在重启 Etherpad 引擎以加载新插件..."
pkill -f "ep_etherpad-lite/node/server.js" || true
pkill -f "node src/node/server.js" || true
sleep 2

nohup node node_modules/ep_etherpad-lite/node/server.js > /var/log/etherpad.log 2>&1 &
sleep 4

if curl -s http://127.0.0.1:9001/api >/dev/null; then
    echo "🎉🎉🎉 Etherpad 官方富文本工具栏与光标作者姓名气泡已全部成功就绪！"
else
    echo "⚠️ 正在启动中，请稍候 3 秒..."
fi
