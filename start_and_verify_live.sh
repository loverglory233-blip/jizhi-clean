#!/bin/bash

echo "🚀 ========================================================"
echo "⚡ Etherpad 智能就绪探测与全量插件端到端实时验收"
echo "🚀 ========================================================"

export PATH="/www/server/nodejs/v18.20.7/bin:$PATH"
EP_DIR="/www/wwwroot/etherpad-lite"

cd "$EP_DIR"

# 1. 检查当前是否已经在运行
echo "1️⃣ 正在检查 9001 端口当前存活状态..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:9001/ || echo "000")

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "302" ]; then
    echo "🟢 9001 端口当前已在正常监听运作中 (HTTP $HTTP_CODE)！无需重启！"
else
    echo "🔄 9001 端口尚未就绪，正在后台启动 Etherpad..."
    fuser -k 9001/tcp 2>/dev/null || true
    pkill -9 -f "node" 2>/dev/null || true
    sleep 1
    
    export NODE_ENV=production
    nohup node src/node/server.js > /var/log/etherpad.log 2>&1 &
    
    echo "⏳ 等待 Etherpad Express 路由与 HTTP 端口完全就绪 (最多等待 35 秒)..."
    READY=0
    for i in {1..35}; do
        CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:9001/ || echo "000")
        if [ "$CODE" = "200" ] || [ "$CODE" = "302" ]; then
            READY=1
            echo ""
            echo "🎉 9001 端口在第 $i 秒完全就绪 (HTTP $CODE)！"
            break
        fi
        echo -n "."
        sleep 1
    done
    echo ""
    
    if [ $READY -eq 0 ]; then
        echo "❌ 启动超时，查看最新日志:"
        tail -n 25 /var/log/etherpad.log
        exit 1
    fi
fi

# 2. 重新加载 Nginx
cd /www/wwwroot/47.99.110.230
./fix_nginx_clean_final.sh > /dev/null 2>&1 || true

# 3. 运行端到端插件静态探测
echo ""
echo "2️⃣ 正在进行 12 个官方插件端到端实时 HTTP 探测:"
echo "----------------------------------------------------------------------------------"
printf "%-30s | %-12s | %-15s | %-15s\n" "插件名称" "HTTP状态" "文件大小" "功能说明"
echo "----------------------------------------------------------------------------------"

PLUGINS=(
    "ep_cursortrace:static/js/cursortrace.js:光标追踪与同伴姓名气泡"
    "ep_headings2:static/js/headings.js:H1~H6大纲标题下拉框"
    "ep_font_size:static/js/index.js:字号大小调节"
    "ep_font_family:static/js/index.js:字体切换"
    "ep_font_color:static/js/index.js:文字颜色选择器"
    "ep_align:static/js/index.js:文字居中对齐"
    "ep_tables4:static/js/index.js:学术表格插入"
    "ep_image_upload:static/js/index.js:插图与截图上传"
    "ep_author_hover:static/js/index.js:作者悬停感知"
    "ep_subscript_and_superscript:static/js/index.js:上下标数学公式"
    "ep_line_spacing:static/js/index.js:行间距调节"
    "ep_clear_formatting:static/js/index.js:一键清除格式"
)

SUCCESS_COUNT=0
TOTAL_COUNT=${#PLUGINS[@]}

for item in "${PLUGINS[@]}"; do
    IFS=":" read -r pName pRelPath pDesc <<< "$item"
    
    URL1="http://127.0.0.1:9001/static/plugins/$pName/$pRelPath"
    URL2="http://127.0.0.1:9001/static/plugins/$pName/${pRelPath#static/}"
    
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$URL1")
    TARGET_URL="$URL1"
    if [ "$HTTP_CODE" != "200" ]; then
        HTTP_CODE2=$(curl -s -o /dev/null -w "%{http_code}" "$URL2")
        if [ "$HTTP_CODE2" = "200" ]; then
            HTTP_CODE="200"
            TARGET_URL="$URL2"
        fi
    fi
    
    if [ "$HTTP_CODE" = "200" ]; then
        SIZE=$(curl -s "$TARGET_URL" | wc -c | awk '{print $1" bytes"}')
        STATUS="🟢 HTTP 200"
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    else
        SIZE="0 bytes"
        STATUS="🔴 HTTP $HTTP_CODE"
    fi
    
    printf "%-30s | %-12s | %-15s | %-15s\n" "$pName" "$STATUS" "$SIZE" "$pDesc"
done
echo "----------------------------------------------------------------------------------"
echo ""
echo "📊 探测总结: 共探测 $TOTAL_COUNT 个插件，成功激活 $SUCCESS_COUNT 个！"
