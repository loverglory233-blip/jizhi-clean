#!/bin/bash
set -e

echo "🚀 ========================================================"
echo "🔧 正在强制刷新 Etherpad 插件注册表并激活全部 Word 级工具栏"
echo "🚀 ========================================================"

export PATH="/www/server/nodejs/v18.20.7/bin:$PATH"
EP_DIR="/www/wwwroot/etherpad-lite"

cd "$EP_DIR"

# 1. 释放 9001 端口
fuser -k 9001/tcp 2>/dev/null || true
pkill -9 -f "node" 2>/dev/null || true
sleep 1

# 2. 清理旧的编译缓存与插件锁
rm -rf var/minified* var/plugins.json 2>/dev/null || true

# 3. 强制在 package.json 声明所有插件依赖
echo "📦 正在向 package.json 注入 11 大黄金插件声明..."
node -e '
const fs = require("fs");
let pkg = {};
try { pkg = JSON.parse(fs.readFileSync("package.json", "utf8")); } catch(e) {}
if (!pkg.dependencies) pkg.dependencies = {};

const corePlugins = [
  "ep_cursortrace",
  "ep_author_hover",
  "ep_font_size",
  "ep_font_family",
  "ep_font_color",
  "ep_align",
  "ep_headings2",
  "ep_subscript_and_superscript",
  "ep_line_spacing",
  "ep_clear_formatting",
  "ep_tables4",
  "ep_image_upload"
];

corePlugins.forEach(p => {
  if (!pkg.dependencies[p]) pkg.dependencies[p] = "*";
});

fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2), "utf8");
console.log("✅ package.json 已完成插件依赖声明！");
'

# 4. 执行原装插件依赖安装
npm install --no-audit --no-fund --registry=https://registry.npmmirror.com

# 5. 启动 Etherpad
echo "🚀 正在启动 Etherpad (重新编译并注入全部工具栏)..."
nohup ./bin/run.sh --root > /var/log/etherpad.log 2>&1 &

sleep 8

# 6. 检查已加载插件清单
echo "📄 已加载插件清单:"
tail -n 30 /var/log/etherpad.log | grep -E "Loaded|plugins|listening" || true

# 7. 重新载入 Nginx 配置
cd /www/wwwroot/47.99.110.230
./fix_nginx_clean_final.sh

echo ""
echo "🎉🎉🎉 Etherpad 扩展工具栏已完成强制激活！"
