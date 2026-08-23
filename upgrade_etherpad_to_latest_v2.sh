#!/bin/bash
set -e

echo "🚀 ========================================================"
echo "⚡ 全量升级 Etherpad-lite 至官方现代版本并安装原生插件体系"
echo "🚀 ========================================================"

export PATH="/www/server/nodejs/v18.20.7/bin:$PATH"
EP_DIR="/www/wwwroot/etherpad-lite"

cd "$EP_DIR"

# 1. 释放 9001 端口并结束旧进程
echo "1️⃣ 正在停止旧版 Etherpad 进程..."
fuser -k 9001/tcp 2>/dev/null || true
pkill -9 -f "node" 2>/dev/null || true
sleep 1

# 2. 备份核心配置与 APIKEY
echo "2️⃣ 正在备份当前设置与 APIKEY..."
cp settings.json settings.json.bak 2>/dev/null || true
cp APIKEY.txt APIKEY.txt.bak 2>/dev/null || true

# 3. 还原代码并拉取官方最新 Tags
echo "3️⃣ 正在从官方仓库拉取最新版本分支..."
git reset --hard HEAD
git clean -fd
git fetch --tags origin || true

# 尝试切换到最新的 2.x 或 master/develop 最新稳定分支
LATEST_TAG=$(git tag -l "v2.*" | sort -V | tail -n 1)
if [ -n "$LATEST_TAG" ]; then
    echo "🎯 发现官方最新 2.x 稳定版本: $LATEST_TAG，正在切换..."
    git checkout "$LATEST_TAG"
else
    echo "🎯 正在切换到官方最新主分支 develop..."
    git checkout develop 2>/dev/null || git checkout master 2>/dev/null || git checkout main 2>/dev/null || true
    git pull origin $(git branch --show-current) || true
fi

echo "📄 当前 Etherpad 版本源码 commit: $(git log -1 --oneline)"

# 4. 运行官方依赖安装
echo "4️⃣ 正在安装现代版 Etherpad 核心依赖..."
npm install --no-audit --no-fund --registry=https://registry.npmmirror.com

# 5. 安装官方认证的 12 个协同与富文本插件
echo "5️⃣ 正在正规安装 12 个官方认证插件..."
npm install --save --no-audit --no-fund --registry=https://registry.npmmirror.com \
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

# 6. 恢复并写入现代标准 settings.json
echo "6️⃣ 正在生成现代标准 settings.json..."
node -e '
const fs = require("fs");
let settings = {};
if (fs.existsSync("settings.json.template")) {
  try {
    const raw = fs.readFileSync("settings.json.template", "utf8");
    // 移除注释后解析或直接读取
    settings = {
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
  } catch(e) {}
}
if (!settings.port) settings.port = 9001;
if (!settings.ip) settings.ip = "0.0.0.0";
fs.writeFileSync("settings.json", JSON.stringify(settings, null, 2), "utf8");
console.log("✅ settings.json 现代标准配置生成完毕！");
'

# 7. 启动现代版 Etherpad 服务
echo "7️⃣ 正在启动现代版 Etherpad 服务..."
export NODE_ENV=production
nohup node src/node/server.js > /var/log/etherpad.log 2>&1 &

# 8. 等待 9001 端口就绪
echo "⏳ 等待 9001 端口启动与官方插件树自编译..."
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

if [ $READY -eq 1 ]; then
    echo "📄 查看最新日志:"
    tail -n 25 /var/log/etherpad.log
else
    echo "❌ 启动日志:"
    tail -n 25 /var/log/etherpad.log
    exit 1
fi

# 9. 重新载入 Nginx 配置
cd /www/wwwroot/47.99.110.230
./fix_nginx_clean_final.sh > /dev/null 2>&1 || true

# 10. 立即执行全量端到端验证
./e2e_verify_etherpad_active.sh
