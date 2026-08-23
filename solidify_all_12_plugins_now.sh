#!/bin/bash
set -e

echo "🚀 ========================================================"
echo "⚡ 正在将 12 个核心插件正规固化进 src/package.json (2秒完成)"
echo "🚀 ========================================================"

export PATH="/usr/bin:/usr/local/bin:$PATH"
EP_DIR="/www/wwwroot/etherpad-lite"

cd "$EP_DIR"

# 1. 停止旧进程
fuser -k 9001/tcp 2>/dev/null || true
pkill -9 -f "node" 2>/dev/null || true
sleep 1

# 2. 将 12 个插件正式写入 src/package.json 的 dependencies
echo "📦 正在执行 pnpm add..."
pnpm --filter ep_etherpad-lite add --registry=https://registry.npmmirror.com \
    ep_cursortrace \
    ep_headings2 \
    ep_font_size \
    ep_font_family \
    ep_font_color \
    ep_align \
    ep_tables4 \
    ep_image_upload \
    ep_author_hover \
    ep_subscript_and_superscript \
    ep_line_spacing \
    ep_clear_formatting

# 3. 启动 Etherpad 2.7.3
echo "🚀 正在启动 Etherpad 2.7.3..."
export NODE_ENV=production
nohup ./bin/run.sh --root > /var/log/etherpad.log 2>&1 &

# 4. 等待 9001 端口就绪
echo "⏳ 等待 9001 端口就绪..."
for i in {1..35}; do
    CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:9001/ || echo "000")
    if [ "$CODE" = "200" ] || [ "$CODE" = "302" ]; then
        echo "🎉 Etherpad 9001 端口在第 $i 秒完全就绪 (HTTP $CODE)！"
        break
    fi
    echo -n "."
    sleep 1
done
echo ""

# 5. 立即打印插件清单
./show_installed_plugins_list.sh
