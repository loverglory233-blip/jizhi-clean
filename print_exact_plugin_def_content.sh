#!/bin/bash

echo "🔍 ========================================================"
echo "⚡ 打印 /pluginfw/plugin-definitions.json 完整原始内容"
echo "🔍 ========================================================"

echo "1️⃣ 完整 HTTP 响应头与 Body:"
curl -i "http://127.0.0.1:9001/pluginfw/plugin-definitions.json"
echo ""
echo ""

echo "2️⃣ 检查磁盘上的 /www/wwwroot/etherpad-lite/var/plugin-definitions.json 内容:"
if [ -f "/www/wwwroot/etherpad-lite/var/plugin-definitions.json" ]; then
    head -n 25 /www/wwwroot/etherpad-lite/var/plugin-definitions.json
else
    echo "文件不存在"
fi
echo ""

echo "3️⃣ 检查真实 Pad 页面 (/p/test_pad) 的 HTML:"
curl -s "http://127.0.0.1:9001/p/test_pad?showControls=true" | head -n 40
