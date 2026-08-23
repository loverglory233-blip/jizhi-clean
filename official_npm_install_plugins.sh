#!/bin/bash
set -e

echo "🚀 ========================================================"
echo "⚡ 通过官方 npm mirror 机制彻底正规化固化 12 个 Etherpad 插件"
echo "🚀 ========================================================"

export PATH="/www/server/nodejs/v18.20.7/bin:$PATH"
EP_DIR="/www/wwwroot/etherpad-lite"

cd "$EP_DIR"

# 1. 释放 9001 端口并结束旧进程
fuser -k 9001/tcp 2>/dev/null || true
pkill -9 -f "node" 2>/dev/null || true
sleep 1

# 2. 100% 还原所有 src 源码为官方原版
git checkout src/ 2>/dev/null || true

# 3. 彻底正规化安装全部 12 个插件（使用淘宝 npm 极速镜像，几秒完成）
echo "📦 正在通过 npmmirror 极速正规化固化安装 12 个核心插件..."
npm install --save --no-audit --no-fund --registry=https://registry.npmmirror.com \
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

echo "✅ 12 个插件已成功写入 package.json dependencies 并正规固化！"

# 4. 清理旧缓存
rm -rf var/plugins.json var/minified_* 2>/dev/null || true

# 5. 启动 Etherpad 服务
echo "🚀 正在启动 Etherpad 服务..."
export NODE_ENV=production
nohup node src/node/server.js > /var/log/etherpad.log 2>&1 &

# 6. 等待 9001 端口就绪
echo "⏳ 等待 9001 端口监听与官方插件树自动装配..."
READY=0
for i in {1..30}; do
    CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:9001/ || echo "000")
    if [ "$CODE" = "200" ] || [ "$CODE" = "302" ]; then
        READY=1
        echo "🎉 9001 端口已成功就绪 (HTTP $CODE)！"
        break
    fi
    echo -n "."
    sleep 1
done
echo ""

if [ $READY -eq 1 ]; then
    echo "📄 查看 Etherpad 启动日志中官方加载的插件列表:"
    tail -n 25 /var/log/etherpad.log
else
    echo "❌ 启动日志:"
    tail -n 25 /var/log/etherpad.log
    exit 1
fi

# 7. 重新载入 Nginx 配置
cd /www/wwwroot/47.99.110.230
./fix_nginx_clean_final.sh > /dev/null 2>&1 || true

# 8. 立即执行端到端插件验证
./e2e_verify_etherpad_active.sh
