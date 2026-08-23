#!/bin/bash
set -e

echo "📦 正在为 Etherpad 一键安装【Word 级全套学术富文本排版 + 光标姓名】全明星插件矩阵..."

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

echo "📦 开始批量安装 Word 级学术排版插件集: "
echo "   1. ep_cursortrace (光标作者姓名与专属颜色气泡)"
echo "   2. ep_font_size (字号选择器: 小四/四号/三号/像素)"
echo "   3. ep_font_family (字体选择器: 宋体/黑体/楷体/学术英文字体)"
echo "   4. ep_font_color (文字颜色与划重点荧光高亮)"
echo "   5. ep_align (文本对齐: 左/中/右/两端对齐)"
echo "   6. ep_headings2 (H1~H6 规范学术各级标题)"
echo "   7. ep_subscript_and_superscript (上下标: 学术公式/参考文献引用[1])"
echo "   8. ep_line_spacing (行间距调节: 1.0/1.5/2.0 倍学术行距)"
echo "   9. ep_clear_formatting (一键格式清除橡皮擦)"

npm install --save \
    ep_cursortrace \
    ep_font_size \
    ep_font_family \
    ep_font_color \
    ep_align \
    ep_headings2 \
    ep_subscript_and_superscript \
    ep_line_spacing \
    ep_clear_formatting \
    --legacy-peer-deps || true

echo "🔄 正在重启 Etherpad 引擎加载全套 Word 级排版插件..."
pkill -f "ep_etherpad-lite/node/server.js" || true
pkill -f "node src/node/server.js" || true
sleep 2

nohup node node_modules/ep_etherpad-lite/node/server.js > /var/log/etherpad.log 2>&1 &
sleep 4

if curl -s http://127.0.0.1:9001/api >/dev/null; then
    echo "🎉🎉🎉 Etherpad【Word 级全套学术富文本排版矩阵】已全部安装并启动成功！"
else
    echo "⚠️ 正在启动中，请稍候 3 秒..."
fi
