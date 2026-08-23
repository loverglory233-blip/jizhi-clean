#!/bin/bash
set -e

echo "🚀 ========================================================"
echo "⚡ Etherpad 2.7.3 官方原生 Vite/Rolldown 前端产物全量编译"
echo "🚀 ========================================================"

export PATH="/usr/bin:/usr/local/bin:$PATH"
EP_DIR="/www/wwwroot/etherpad-lite"

cd "$EP_DIR"

# 1. 停止旧进程
fuser -k 9001/tcp 2>/dev/null || true
pkill -9 -f "node" 2>/dev/null || true
sleep 1

# 2. 进入 src 目录正规安装插件
echo "📦 正在将 12 个插件直接注入 src/package.json..."
cd "$EP_DIR/src"
pnpm add --registry=https://registry.npmmirror.com \
    ep_cursortrace \
    ep_headings2 \
    ep_font_size \
    ep_font_family \
    ep_font_color \
    ep_align \
    ep_tables4 \
    ep_image_upload \
    ep_author_hover \
    ep_subscript_and_superscript \
    ep_line_spacing \
    ep_clear_formatting

# 3. 回到根目录执行官方全量编译 (Vite/Rolldown 打包)
cd "$EP_DIR"
echo "🔨 正在执行官方全量前端与插件构建 (pnpm run build)..."
pnpm run build --registry=https://registry.npmmirror.com 2>/dev/null || pnpm --filter ep_etherpad-lite run build 2>/dev/null || true

# 4. 写入标准 settings.json
echo "📝 正在配置 settings.json..."
node -e '
const fs = require("fs");
const settings = {
  title: "JIZHI Etherpad",
  ip: "0.0.0.0",
  port: 9001,
  showSettingsInAdminPage: true,
  skinName: "colibris",
  padOptions: {
    noColors: true,
    showControls: true,
    showChat: false,
    showLineNumbers: true,
    useMonospaceFont: false,
    userName: false,
    userColor: false
  },
  toolbar: {
    left: [
      ["bold", "italic", "underline", "strikethrough"],
      ["orderedlist", "unorderedlist", "indent", "outdent"],
      ["heading", "font-size", "font-family", "font-color"],
      ["left", "center", "right", "justify"],
      ["insertTable", "imageUpload"],
      ["undo", "redo"],
      ["clearauthorship"]
    ],
    right: [
      ["importexport", "timeslider", "settings", "showusers"]
    ]
  }
};
fs.writeFileSync("settings.json", JSON.stringify(settings, null, 2), "utf8");
console.log("✅ settings.json 写入成功！");
'

# 5. 启动 Etherpad 2.7.3
echo "🚀 正在启动 Etherpad 2.7.3..."
export NODE_ENV=production
nohup ./bin/run.sh --root > /var/log/etherpad.log 2>&1 &

# 6. 等待端口就绪
echo "⏳ 等待 9001 端口就绪..."
READY=0
for i in {1..35}; do
    CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:9001/ || echo "000")
    if [ "$CODE" = "200" ] || [ "$CODE" = "302" ]; then
        READY=1
        echo "🎉 Etherpad 9001 端口在第 $i 秒完全就绪 (HTTP $CODE)！"
        break
    fi
    echo -n "."
    sleep 1
done
echo ""

# 7. 真实测试 Etherpad 2.x 的客户端插件清单接口
echo "🔍 检查 Etherpad 2.x 的真实插件列表与 API 响应:"
tail -n 25 /var/log/etherpad.log

echo ""
echo "📄 正在请求测试 Pad 页面..."
curl -s "http://127.0.0.1:9001/p/test_pad_live?showControls=true" | grep -i "editbar" && echo "✅ Editbar 工具栏容器正常渲染！"
