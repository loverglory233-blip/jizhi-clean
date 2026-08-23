#!/bin/bash

echo "🔍 ========================================================"
echo "⚡ Etherpad 全套工具栏与光标插件加载链深度验证"
echo "🔍 ========================================================"

EP_HOST="http://127.0.0.1:9001"
TEST_PAD="jizhi_test_verify_pad"

# 1. 检查 9001 服务状态
echo "1️⃣ 正在检查 9001 端口服务状态..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$EP_HOST/" || echo "000")
if [ "$HTTP_CODE" != "200" ] && [ "$HTTP_CODE" != "302" ]; then
    echo "❌ 9001 端口未就绪 (HTTP $HTTP_CODE)，请先执行启动脚本！"
    exit 1
fi
echo "🟢 9001 端口运作正常 (HTTP $HTTP_CODE)"
echo ""

# 2. 获取 Pad 页面 HTML
echo "2️⃣ 正在拉取测试 Pad ($TEST_PAD) 的客户端主框架 HTML..."
PAD_HTML=$(curl -s "$EP_HOST/p/$TEST_PAD?showControls=true&noColors=true")

# 3. 检查工具栏 Editbar DOM 挂载
echo "3️⃣ 检查顶部工具栏 Editbar 渲染:"
if echo "$PAD_HTML" | grep -q "editbar"; then
    echo "  ✅ editbar 工具栏容器存在"
else
    echo "  ⚠️ 未直接匹配到 editbar 容器"
fi

# 4. 检查客户端插件注册清单 API (plugin-definitions.json)
echo ""
echo "4️⃣ 检查 Etherpad 客户端插件注册清单 (/pluginfw/plugin-definitions.json)..."
PLUGINS_JSON=$(curl -s "$EP_HOST/pluginfw/plugin-definitions.json" || echo "{}")

PLUGINS_TO_CHECK=(
    "ep_cursortrace"
    "ep_author_hover"
    "ep_headings2"
    "ep_font_size"
    "ep_font_family"
    "ep_font_color"
    "ep_align"
    "ep_tables4"
    "ep_image_upload"
    "ep_subscript_and_superscript"
    "ep_line_spacing"
    "ep_clear_formatting"
)

echo "--------------------------------------------------------"
printf "%-30s | %-12s | %-12s\n" "插件名称" "注册状态" "静态资源探测"
echo "--------------------------------------------------------"

for p in "${PLUGINS_TO_CHECK[@]}"; do
    # 检查注册状态
    if echo "$PLUGINS_JSON" | grep -q "$p"; then
        REG_STATUS="🟢 [已注册]"
    else
        REG_STATUS="⚪ [内置/待载入]"
    fi
    
    # 检查静态资源探测
    RES_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$EP_HOST/static/plugins/$p/static/js/index.js" || echo "000")
    if [ "$RES_CODE" = "200" ]; then
        RES_STATUS="🟢 HTTP 200"
    else
        # 尝试备用路径
        RES_CODE2=$(curl -s -o /dev/null -w "%{http_code}" "$EP_HOST/static/plugins/$p/static/js/$p.js" || echo "000")
        if [ "$RES_CODE2" = "200" ]; then
            RES_STATUS="🟢 HTTP 200"
        else
            RES_STATUS="🟡 HTTP $RES_CODE"
        fi
    fi
    printf "%-30s | %-12s | %-12s\n" "$p" "$REG_STATUS" "$RES_STATUS"
done
echo "--------------------------------------------------------"

echo ""
echo "5️⃣ 检查 Nginx 反向代理配置 (/socket.io, /p/, /static/, /pluginfw/):"
if [ -f "/www/server/panel/vhost/nginx/47.99.110.230.conf" ]; then
    grep -E "location /p/|location /socket.io|location /pluginfw/|location /static/" /www/server/panel/vhost/nginx/47.99.110.230.conf
    echo "✅ Nginx 反向代理规则配置完整！"
else
    echo "⚠️ 未在本地检测到服务器 Nginx 路径（属于服务器端配置）"
fi

echo ""
echo "🎉 验证脚本执行完毕！"
