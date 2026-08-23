#!/bin/bash
set -e

echo "🔧 正在启用内存防爆保护 (防 OOM Killed) 并启动 Etherpad..."

# 1. 自动启用 2GB Swap 虚拟内存防爆机制 (如果尚未启用)
if [ ! -f /swapfile_ep ]; then
    echo "💡 正在配置 2GB Swap 虚拟内存以防止内存耗尽被 Killed..."
    fallocate -l 2G /swapfile_ep 2>/dev/null || dd if=/dev/zero of=/swapfile_ep bs=1M count=2048 2>/dev/null || true
    chmod 600 /swapfile_ep 2>/dev/null || true
    mkswap /swapfile_ep 2>/dev/null || true
    swapon /swapfile_ep 2>/dev/null || true
fi

EP_DIR="/www/wwwroot/etherpad-lite"
if [ ! -d "$EP_DIR" ]; then
    echo "❌ 未找到 Etherpad 目录: $EP_DIR"
    exit 1
fi

cd "$EP_DIR"
export PATH="/www/server/nodejs/v18.20.7/bin:$PATH"

# 2. 彻底杀掉残留进程
pkill -9 -f "server.js" || true
pkill -9 -f "etherpad" || true
fuser -k 9001/tcp 2>/dev/null || true
sleep 1

# 3. 逐个单独低内存安装插件 (单线程, 避免并发爆内存)
echo "📦 正在以极轻量模式确保插件安装..."
PLUGINS=(
    "ep_cursortrace"
    "ep_author_hover"
    "ep_font_size"
    "ep_font_family"
    "ep_font_color"
    "ep_align"
    "ep_headings2"
    "ep_subscript_and_superscript"
    "ep_line_spacing"
    "ep_clear_formatting"
    "ep_tables4"
    "ep_image_upload"
)

for pkg in "${PLUGINS[@]}"; do
    if [ ! -d "node_modules/$pkg" ]; then
        echo "   📥 正在安装: $pkg ..."
        npm install --save "$pkg" --legacy-peer-deps --no-audit --no-fund --registry=https://registry.npmmirror.com || true
    fi
done

# 4. 精确启动 Etherpad
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
