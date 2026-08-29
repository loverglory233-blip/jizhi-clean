#!/bin/bash
# ========================================================
# 🔍 集智平台 - Etherpad 逐项深度排查与健康诊断脚本
# ========================================================

echo "🔍 ========================================================"
echo "📋 开始逐项排查 Etherpad 协同文档与 12 大插件运行状态"
echo "🔍 ========================================================"

# 1. 检查 Node 进程与 9001 端口
echo "1️⃣ [底座排查] 检查 Node.js 进程与 9001 端口:"
if lsof -i:9001 >/dev/null 2>&1 || netstat -tuln 2>/dev/null | grep -q ":9001 "; then
    echo "   🟢 9001 端口正在监听！"
else
    echo "   🔴 9001 端口未监听！请检查 Etherpad 是否启动。"
fi

# 2. 检查本地直连响应
echo ""
echo "2️⃣ [内核排查] 测试 Etherpad 内核 HTTP 响应:"
LOCAL_ROOT=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:9001/ 2>/dev/null || echo "000")
LOCAL_PAD=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:9001/p/test_diag_pad 2>/dev/null || echo "000")
echo "   📄 本地根路径 http://127.0.0.1:9001/ 状态码: $LOCAL_ROOT"
echo "   📄 本地文档路径 http://127.0.0.1:9001/p/test_diag_pad 状态码: $LOCAL_PAD"

# 3. 检查 Nginx 协同路由代理
echo ""
echo "3️⃣ [Nginx 排查] 测试 Nginx 代理路由 (/p/ 与 /socket.io):"
NGINX_PAD_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1/p/test_diag_pad 2>/dev/null || echo "000")
echo "   📄 Nginx /p/test_diag_pad 状态码: $NGINX_PAD_STATUS"

echo ""
echo "3.5️⃣ [静态资源排查] 检查 Etherpad pad.html 引入的所有前端静态文件连通性:"
PAD_HTML=$(curl -s http://127.0.0.1:9001/p/test_diag_pad 2>/dev/null || echo "")
echo "$PAD_HTML" | grep -oE '(src|href)="([^"]+\.(js|css|json)[^"]*)"' | while read -r line; do
    URI=$(echo "$line" | sed -E 's/(src|href)="([^"]+)"/\2/')
    CLEAN_URI=$(echo "$URI" | sed 's|^/||; s|^\.\./||; s|^\.\./||')
    CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1/$CLEAN_URI" 2>/dev/null || echo "000")
    echo "   - [资源] /$CLEAN_URI => HTTP $CODE"
done

# 4. 检查 Socket.IO 握手 (关键：如果这个失败就会导致永久 loading)
echo ""
echo "4️⃣ [协同握手排查] 测试 Socket.io 传输通道:"
SOCKET_RES=$(curl -s "http://127.0.0.1/socket.io/?EIO=4&transport=polling" 2>/dev/null || curl -s "http://127.0.0.1/socket.io/?EIO=3&transport=polling" 2>/dev/null || echo "")
if echo "$SOCKET_RES" | grep -E "sid|upgrades|0\{" > /dev/null; then
    echo "   🟢 Socket.IO 握手成功！(返回了实时会话令牌)"
else
    echo "   ⚠️ Socket.IO 响应内容: $SOCKET_RES"
fi

# 5. 检查 12 大插件的客户端文件与工具栏挂载
echo ""
echo "5️⃣ [插件逐一排查] 检查 12 大学术插件的静态资源与挂载:"
PLUGINS=(
    "ep_cursortrace:static/js/cursortrace.js:光标追踪与同伴姓名气泡"
    "ep_headings2:static/js/headings.js:H1~H6大纲标题下拉框"
    "ep_font_size:static/js/index.js:字号大小调节"
    "ep_font_family:static/js/index.js:中英文字体切换"
    "ep_font_color:static/js/index.js:文字颜色与高亮画笔"
    "ep_align:static/js/index.js:文字对齐与段落排版"
    "ep_tables4:static/js/index.js:学术表格插入与编辑"
    "ep_image_upload:static/js/upload.js:论文插图与截图上传"
    "ep_author_hover:static/js/index.js:作者段落悬停感知"
    "ep_subscript_and_superscript:static/js/index.js:上下标学术公式"
    "ep_line_spacing:static/js/index.js:行间距调节"
    "ep_clear_formatting:static/js/clear_formatting.js:一键清除多余格式"
)

for item in "${PLUGINS[@]}"; do
    IFS=":" read -r pName pRelPath pDesc <<< "$item"
    P_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:9001/static/plugins/$pName/$pRelPath" 2>/dev/null || echo "000")
    if [ "$P_CODE" = "000" ] || [ "$P_CODE" = "404" ]; then
        P_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:9001/static/plugins/$pName/static/js/index.js" 2>/dev/null || echo "000")
    fi
    echo "   - [$pName] ($pDesc) => HTTP $P_CODE"
done

echo ""
echo "========================================================"
echo "🎉 诊断完毕！"
echo "========================================================"
