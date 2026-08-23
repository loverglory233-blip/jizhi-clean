#!/bin/bash

echo "🔍 ========================================================"
echo "⚡ 正在以真实客户端浏览器身份请求 Pad 页面与工具栏 DOM..."
echo "🔍 ========================================================"

PAD_URL="http://127.0.0.1:9001/p/test_real_browser_pad?showControls=true&noColors=true"
PAD_HTML=$(curl -s "$PAD_URL")

echo "1️⃣ 检查页面基础 DOM:"
if echo "$PAD_HTML" | grep -q "editbar"; then
    echo "  🟢 editbar 工具栏容器存在！"
fi

if echo "$PAD_HTML" | grep -q "pad.js"; then
    echo "  🟢 pad.js 客户端核心 Bundle 已注入！"
fi

echo ""
echo "2️⃣ 检查 /pluginfw/plugin-definitions.json 客户端插件注册清单 API:"
PLUGINS_DEF=$(curl -s "http://127.0.0.1:9001/pluginfw/plugin-definitions.json" 2>/dev/null || curl -s "http://127.0.0.1:9001/javascripts/plugin-definitions.json" 2>/dev/null || echo "{}")

echo "API 返回长度: $(echo "$PLUGINS_DEF" | wc -c) 字节"
echo "包含的插件列表:"
echo "$PLUGINS_DEF" | grep -o '"name":"ep_[^"]*"' | sort -u || echo "$PLUGINS_DEF"

