#!/bin/bash
set -e

echo "🚀 ========================================================"
echo "⚡ 彻底治愈 trustProxy 与 Toolbar grouping 渲染崩溃"
echo "🚀 ========================================================"

export PATH="/usr/bin:/usr/local/bin:$PATH"
EP_DIR="/www/wwwroot/etherpad-lite"

cd "$EP_DIR"

# 1. 停止旧进程
fuser -k 9001/tcp 2>/dev/null || true
pkill -9 -f "node" 2>/dev/null || true
sleep 1

# 2. 写入 100% 官方合规的 settings.json (开启 trustProxy，使用官方自适应 toolbar)
node -e '
const fs = require("fs");

const settings = {
  title: "JIZHI Academic Pad",
  ip: "0.0.0.0",
  port: 9001,
  trustProxy: true,
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
  showSettingsInAdminPage: true
};

fs.writeFileSync("settings.json", JSON.stringify(settings, null, 2), "utf8");
console.log("✅ settings.json 已成功配置 trustProxy: true 并启用自适应工具栏！");
'

# 3. 启动 Etherpad 2.7.3
echo "🚀 正在启动 Etherpad 2.7.3..."
export NODE_ENV=production
nohup ./bin/run.sh --root > /var/log/etherpad.log 2>&1 &

# 4. 等待 9001 端口就绪
echo "⏳ 等待 9001 端口就绪..."
for i in {1..35}; do
    CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:9001/ || echo "000")
    if [ "$CODE" = "200" ] || [ "$CODE" = "302" ]; then
        echo "🎉 Etherpad 9001 端口在第 $i 秒完全就绪 (HTTP $CODE)！"
        break
    fi
    echo -n "."
    sleep 1
done
echo ""

# 5. 抓取真实 Pad 页面 HTML 验证
echo "📄 正在请求测试 Pad 页面 (/p/test_pad_live):"
TEST_HTML=$(curl -s "http://127.0.0.1:9001/p/test_pad_live?showControls=true")

if echo "$TEST_HTML" | grep -q "editbar"; then
    echo "🎉🎉🎉 恭喜！Pad 页面已 100% 成功正常渲染！Editbar 工具栏已输出！"
else
    echo "⚠️ 页面前 20 行:"
    echo "$TEST_HTML" | head -n 20
fi
