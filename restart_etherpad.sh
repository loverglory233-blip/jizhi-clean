#!/bin/bash
set -e

echo "🔧 正在为 Etherpad 安装【学术表格 + 图片上传粘贴】与全套 Word 黄金插件..."

EP_DIR="/www/wwwroot/etherpad-lite"
if [ ! -d "$EP_DIR" ]; then
    echo "❌ 未找到 Etherpad 目录: $EP_DIR"
    exit 1
fi

cd "$EP_DIR"
export PATH="/www/server/nodejs/v18.20.7/bin:$PATH"

# 1. 杀掉旧残留
pkill -9 -f "server.js" || true
pkill -9 -f "etherpad" || true
fuser -k 9001/tcp || true
sleep 1

# 2. 清理废弃不兼容包
rm -rf node_modules/ep_page_view node_modules/ep_spellcheck node_modules/ep_word_count || true

# 3. 完整安装：表格 + 图片 + 10 大黄金富文本插件
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
    ep_tables4 \
    ep_image_upload \
    --legacy-peer-deps --registry=https://registry.npmmirror.com || true

# 4. 启动 Etherpad
echo "🚀 正在启动 Etherpad 守护进程..."
nohup node src/node/server.js > /var/log/etherpad.log 2>&1 &
sleep 4

# 5. 校验 9001 端口响应
if curl -s -I http://127.0.0.1:9001/ | grep -E "200|302|HTTP"; then
    echo "🎉🎉🎉 Etherpad (9001 端口) 已经 100% 满血复活并正常响应！"
else
    echo "⚠️ 尝试备用入口 node_modules/ep_etherpad-lite/node/server.js..."
    nohup node node_modules/ep_etherpad-lite/node/server.js > /var/log/etherpad.log 2>&1 &
    sleep 4
    if curl -s -I http://127.0.0.1:9001/ | grep -E "200|302|HTTP"; then
        echo "🎉🎉🎉 Etherpad 备用入口启动成功！"
    else
        echo "📄 最近 30 行日志:"
        tail -n 30 /var/log/etherpad.log || true
    fi
fi

# 6. 重新载入 Nginx 配置
cd /www/wwwroot/47.99.110.230
./fix_nginx_clean_final.sh
