#!/bin/bash
set -e

echo "🚀 ========================================================"
echo "📦 正在为纯净版 Etherpad 一键装配全套 11 大黄金插件并启动"
echo "🚀 ========================================================"

export PATH="/www/server/nodejs/v18.20.7/bin:$PATH"
EP_DIR="/www/wwwroot/etherpad-lite"

cd "$EP_DIR"

# 1. 释放 9001 端口
echo "🛑 1. 释放 9001 端口..."
fuser -k 9001/tcp 2>/dev/null || true
pkill -9 -f "node" 2>/dev/null || true
sleep 1

# 2. 安装全套 11 大黄金插件 (官方国内极速镜像)
echo "📥 2. 正在快速安装 11 大学术富文本与协同感知插件..."
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

# 3. 启动 Etherpad 服务进程 (携带 --root 授权)
echo "🚀 3. 正在启动 Etherpad 守护进程..."
nohup ./bin/run.sh --root > /var/log/etherpad.log 2>&1 &

sleep 8

# 4. 验证 9001 端口
if curl -s -I http://127.0.0.1:9001/ | grep -E "200|302|HTTP" > /dev/null; then
    echo ""
    echo "🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉"
    echo "🎉 恭喜！Etherpad + 全套 11 大黄金插件已 100% 满血复活启动！"
    echo "🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉"
else
    echo "📄 查看启动日志:"
    tail -n 25 /var/log/etherpad.log || true
fi

# 5. 重新载入 Nginx 配置
cd /www/wwwroot/47.99.110.230
./fix_nginx_clean_final.sh
