#!/bin/bash
set -e

echo "🔧 正在净化插件依赖并启动 Etherpad (彻底根治 502)..."

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
sleep 1

# 2. 卸载已知有兼容崩溃风险的废弃包
npm uninstall ep_page_view ep_spellcheck || true

# 3. 确保核心黄金插件正常安装
npm install --save ep_cursortrace ep_author_hover ep_font_size ep_font_family ep_font_color ep_align ep_headings2 ep_subscript_and_superscript ep_line_spacing ep_clear_formatting --legacy-peer-deps --registry=https://registry.npmmirror.com || true

# 4. 启动 Etherpad (优先使用官方标准启动脚本)
if [ -f "src/node/server.js" ]; then
    nohup node src/node/server.js > /var/log/etherpad.log 2>&1 &
elif [ -f "bin/run.sh" ]; then
    nohup ./bin/run.sh > /var/log/etherpad.log 2>&1 &
else
    nohup node node_modules/ep_etherpad-lite/node/server.js > /var/log/etherpad.log 2>&1 &
fi

sleep 4

# 5. 检查是否正常监听
if curl -s -I http://127.0.0.1:9001/ | grep -E "200|302|HTTP" ; then
    echo "🎉🎉🎉 Etherpad (9001 端口) 已经 100% 满血复活并正常响应！"
else
    echo "📄 查看最近 25 行日志:"
    tail -n 25 /var/log/etherpad.log || true
fi

# 6. 重新载入 Nginx 配置
cd /www/wwwroot/47.99.110.230
./fix_nginx_clean_final.sh
