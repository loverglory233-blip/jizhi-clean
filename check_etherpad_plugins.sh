#!/bin/bash
set -e

EP_DIR="/www/wwwroot/etherpad-lite"
if [ ! -d "$EP_DIR" ]; then
    echo "❌ 未找到 Etherpad 目录: $EP_DIR"
    exit 1
fi

cd "$EP_DIR"
export PATH="/www/server/nodejs/v18.20.7/bin:$PATH"

echo "========================================================"
echo "🔍 Etherpad 官方插件加载与运行状态全面核查报告"
echo "========================================================"

echo "📊 1. 检查 9001 端口服务状态:"
if curl -s -I http://127.0.0.1:9001/ | grep -E "200|302|HTTP" > /dev/null; then
    echo "   🟢 状态: 正常运行 (9001 端口监听中)"
else
    echo "   🔴 状态: 未运行 (请运行 ./restart_etherpad.sh 重启)"
fi

echo ""
echo "📦 2. 检查已安装并生效的官方插件清单:"
CORE_PLUGINS=(
    "ep_cursortrace:实时光标浮动作者姓名与专属颜色气泡 (协同感知)"
    "ep_author_hover:鼠标悬停文字显示作者姓名 (作者溯源)"
    "ep_font_size:字号选择器 (小四/四号/三号/像素)"
    "ep_font_family:字体选择器 (宋体/黑体/楷体/学术字体)"
    "ep_font_color:字体颜色与荧光高亮笔 (标红/划重点)"
    "ep_align:段落对齐 (左/居中/右/两端对齐)"
    "ep_headings2:规范学术多级大纲标题 (H1~H6/正文)"
    "ep_subscript_and_superscript:上下标 (公式平方/参考文献引用[1])"
    "ep_line_spacing:学术规范行间距 (1.0/1.5/2.0倍)"
    "ep_clear_formatting:一键清除格式橡皮擦"
    "ep_tables4:富文本学术表格 (插入表格/增删行列/合并单元格)"
    "ep_image_upload:图片插入与剪贴板直接粘贴 (Ctrl+V上传图表)"
)

for item in "${CORE_PLUGINS[@]}"; do
    pkg="${item%%:*}"
    desc="${item#*:}"
    if [ -d "node_modules/$pkg" ]; then
        ver=$(node -p "try{require('./node_modules/$pkg/package.json').version}catch(e){'已安装'}" 2>/dev/null || echo "已安装")
        echo "   ✅ $pkg (v$ver) ➔ $desc"
    else
        echo "   ❌ $pkg (未安装)"
    fi
done

echo ""
echo "🌐 3. 检查 Nginx 反向代理配置:"
if grep -q "location /ep_" /www/server/panel/vhost/nginx/47.99.110.230.conf 2>/dev/null; then
    echo "   ✅ Nginx /ep_ 插件资源代理已就绪"
else
    echo "   ⚠️ Nginx /ep_ 插件资源代理待补全"
fi

if grep -q "location /socket.io" /www/server/panel/vhost/nginx/47.99.110.230.conf 2>/dev/null; then
    echo "   ✅ Nginx /socket.io WebSocket 协同代理已就绪"
else
    echo "   ⚠️ Nginx /socket.io WebSocket 协同代理待补全"
fi

echo "========================================================"
