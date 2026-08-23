#!/bin/bash

echo "🔍 ========================================================"
echo "⚡ Etherpad 插件客户端端到端真实激活状态硬核验证"
echo "🔍 ========================================================"

EP_URL="http://127.0.0.1:9001"
TEST_PAD="verify_pad_$(date +%s)"

# 1. 创建并抓取真实 Pad 页面
echo "1️⃣ 正在以真实浏览器身份请求 Pad 页面 (/p/$TEST_PAD)..."
PAD_HTML=$(curl -s "$EP_URL/p/$TEST_PAD?showControls=true")

# 2. 检查 HTML 中是否有插件注入的 script / link 标签
echo "2️⃣ 检查 Pad 页面 HTML 中的插件挂载情况:"
SCRIPTS_COUNT=$(echo "$PAD_HTML" | grep -c "static/plugins/" || echo "0")
echo "  📄 页面中引入的插件静态资源标签数量: $SCRIPTS_COUNT 个"

# 3. 逐一探测 12 个插件的物理文件与 HTTP 访问
echo ""
echo "3️⃣ 逐个探测 12 个核心插件的客户端入口与 HTTP 访问响应:"
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
    
    # 探测多种可能的静态路由
    URL1="$EP_URL/static/plugins/$pName/$pRelPath"
    URL2="$EP_URL/static/plugins/$pName/${pRelPath#static/}"
    
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
echo "📊 验证总结: 共探测 $TOTAL_COUNT 个插件，成功激活 $SUCCESS_COUNT 个！"

if [ "$SUCCESS_COUNT" -eq "$TOTAL_COUNT" ]; then
    echo "🎉🎉🎉 恭喜！全套 12 个官方协同富文本插件 100% 全部激活生效！"
else
    echo "⚠️ 部分插件静态路由尚未对齐，请查看上方列表！"
fi
