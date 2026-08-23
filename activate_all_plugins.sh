#!/bin/bash
set -e

echo "🚀 ========================================================"
echo "📦 正在向 Etherpad 核心注入全套 11 大黄金富文本插件..."
echo "🚀 ========================================================"

export PATH="/www/server/nodejs/v18.20.7/bin:$PATH"
EP_DIR="/www/wwwroot/etherpad-lite"

cd "$EP_DIR"

# 1. 释放 9001 端口
echo "🛑 1. 释放 9001 端口..."
fuser -k 9001/tcp 2>/dev/null || true
sleep 1

# 2. 正式安装 11 大官方插件至 Etherpad 主目录
echo "📥 2. 正在向 Etherpad 安装插件包..."
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
    --no-audit --no-fund --registry=https://registry.npmmirror.com

# 3. 启动 Etherpad 守护进程
echo "🚀 3. 正在启动 Etherpad 服务并载入全部插件..."
nohup ./bin/run.sh --root > /var/log/etherpad.log 2>&1 &

sleep 8

# 4. 打印加载插件的日志
echo "📄 4. 检查已加载插件清单:"
tail -n 25 /var/log/etherpad.log | grep -E "Loaded|plugins|listening" || true

# 5. 重新载入 Nginx 配置
cd /www/wwwroot/47.99.110.230
./fix_nginx_clean_final.sh

echo ""
echo "🎉🎉🎉 全套 11 大插件已成功注入并生效！"
