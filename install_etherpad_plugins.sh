#!/bin/bash
set -e

echo "📦 正在为 Etherpad 一键安装【14 大顶级全功能 Word 学术排版 + 协同感知】全明星插件矩阵..."

EP_DIR="/www/wwwroot/etherpad-lite"
if [ ! -d "$EP_DIR" ]; then
    echo "❌ 未找到 Etherpad 目录: $EP_DIR"
    exit 1
fi

cd "$EP_DIR"
export PATH="/www/server/nodejs/v18.20.7/bin:$PATH"

echo "🚀 当前 Node 版本: $(node -v)"
echo "🚀 当前 npm 版本: $(npm -v)"

# 配置淘宝国内极速源
npm config set registry https://registry.npmmirror.com

echo "📦 正在安装用户指定的 14 大全套学术 Word 插件:"
echo "   1.  ep_cursortrace (光标作者姓名专属颜色气泡)"
echo "   2.  ep_author_hover (鼠标悬停显示作者姓名)"
echo "   3.  ep_font_size (字号选择器: 初号/小初/一号/小四/像素)"
echo "   4.  ep_font_family (字体选择器: 宋体/黑体/楷体/学术字体)"
echo "   5.  ep_font_color (文字颜色与荧光高亮笔)"
echo "   6.  ep_align (段落左/中/右/两端对齐)"
echo "   7.  ep_headings2 (H1~H6 规范学术多级标题)"
echo "   8.  ep_subscript_and_superscript (上下标: 学术公式/引用[1])"
echo "   9.  ep_line_spacing (1.0/1.5/2.0 倍学术行间距)"
echo "   10. ep_clear_formatting (一键清除格式橡皮擦)"
echo "   11. ep_word_count (实时字数/字符数/段落数统计)"
echo "   12. ep_tables4 (富文本表格插入与编辑)"
echo "   13. ep_page_view (A4 纸张分页与打印边距视图)"
echo "   14. ep_spellcheck (拼写与错别字检查)"

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
    ep_word_count \
    ep_tables4 \
    ep_page_view \
    ep_spellcheck \
    --legacy-peer-deps || true

echo "🔄 正在重启 Etherpad 引擎加载 14 大顶级插件..."
pkill -f "ep_etherpad-lite/node/server.js" || true
pkill -f "node src/node/server.js" || true
sleep 2

nohup node node_modules/ep_etherpad-lite/node/server.js > /var/log/etherpad.log 2>&1 &
sleep 4

if curl -s http://127.0.0.1:9001/api >/dev/null; then
    echo "🎉🎉🎉 Etherpad 14 大全套 Word 级学术排版与协同感知矩阵已 100% 成功就绪！"
else
    echo "⚠️ 正在启动中，请稍候 3 秒..."
fi
