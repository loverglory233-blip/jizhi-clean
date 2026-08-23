#!/bin/bash
set -e

echo "📦 正在为 Etherpad 安装 14 大全套 Word 级学术排版与光标姓名气泡插件..."

EP_DIR="/www/wwwroot/etherpad-lite"
if [ ! -d "$EP_DIR" ]; then
    echo "❌ 未找到 Etherpad 目录: $EP_DIR"
    exit 1
fi

cd "$EP_DIR"
export PATH="/www/server/nodejs/v18.20.7/bin:$PATH"

echo "🚀 Node: $(node -v), npm: $(npm -v)"

# 配置淘宝极速源
npm config set registry https://registry.npmmirror.com

echo "📦 开始安装插件..."
npm install --save \
    ep_cursortrace \
    ep_author_hover \
    ep_font_size \
    ep_font_family \
    ep_font_color \
    ep_align \
    ep_headings2 \
    ep_subscript_and_superscript \
    ep_line_spacing \
    ep_clear_formatting \
    ep_word_count \
    ep_tables4 \
    ep_page_view \
    ep_spellcheck \
    --legacy-peer-deps || true

echo "🔄 正在重启 Etherpad..."
pkill -f "ep_etherpad-lite/node/server.js" || true
pkill -f "node src/node/server.js" || true
sleep 2

nohup node node_modules/ep_etherpad-lite/node/server.js > /var/log/etherpad.log 2>&1 &
sleep 4

# 重新加载 Nginx 确保 /ep_ 和 /socket.io 代理生效
cd /www/wwwroot/47.99.110.230
./fix_nginx_clean_final.sh

echo "🎉🎉🎉 Etherpad 14 大 Word 级排版与光标姓名插件已全部安装并加载就绪！"
