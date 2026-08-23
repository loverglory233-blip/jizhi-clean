#!/bin/bash
set -e

echo "🔧 正在全面深度排查并重构 Etherpad 启动环境 (彻底根治 502)..."

EP_DIR="/www/wwwroot/etherpad-lite"
if [ ! -d "$EP_DIR" ]; then
    echo "❌ 未找到 Etherpad 目录: $EP_DIR"
    exit 1
fi

cd "$EP_DIR"
export PATH="/www/server/nodejs/v18.20.7/bin:$PATH"

echo "🚀 Node.js 路径: $(which node)"
echo "🚀 Node.js 版本: $(node -v)"

# 1. 彻底杀掉所有可能占用 9001 端口或残留的进程
pkill -9 -f "server.js" || true
pkill -9 -f "etherpad" || true
fuser -k 9001/tcp || true
sleep 1

# 2. 清理可能有问题的插件
rm -rf node_modules/ep_page_view node_modules/ep_spellcheck node_modules/ep_tables4 node_modules/ep_word_count || true

# 3. 确保核心黄金插件安装（官方极速镜像）
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
    --legacy-peer-deps --registry=https://registry.npmmirror.com || true

# 4. 精确启动 Etherpad
echo "🚀 正在启动 Etherpad 守护进程..."
nohup node src/node/server.js > /var/log/etherpad.log 2>&1 &
sleep 4

# 5. 校验 9001 端口响应
if curl -s -I http://127.0.0.1:9001/ | grep -E "200|302|HTTP"; then
    echo "🎉🎉🎉 Etherpad (9001 端口) 已经 100% 满血复活并正常响应！"
else
    echo "⚠️ 9001 端口未直接响应，尝试备用入口 node_modules/ep_etherpad-lite/node/server.js..."
    nohup node node_modules/ep_etherpad-lite/node/server.js > /var/log/etherpad.log 2>&1 &
    sleep 4
    if curl -s -I http://127.0.0.1:9001/ | grep -E "200|302|HTTP"; then
        echo "🎉🎉🎉 Etherpad 备用入口启动成功！"
    else
        echo "📄 查看最近 30 行日志以定位错误:"
        tail -n 30 /var/log/etherpad.log || true
    fi
fi

# 6. 重新载入 Nginx 配置
cd /www/wwwroot/47.99.110.230
./fix_nginx_clean_final.sh
