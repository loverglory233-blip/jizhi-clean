#!/bin/bash
set -e

echo "🚀 ========================================================"
echo "⚡ 通过标准 Symlink 符号链接完美挂载 Etherpad 全量插件"
echo "🚀 ========================================================"

export PATH="/www/server/nodejs/v18.20.7/bin:$PATH"
EP_DIR="/www/wwwroot/etherpad-lite"

cd "$EP_DIR"

# 1. 释放 9001 端口并结束旧进程
fuser -k 9001/tcp 2>/dev/null || true
pkill -9 -f "node" 2>/dev/null || true
sleep 1

# 2. 还原所有可能被误改的 src 源码到官方原始状态
git checkout src/ 2>/dev/null || true

# 3. 创建核心 symlink（彻底解决 Cannot find module ep_etherpad-lite 报错）
rm -rf ep_etherpad-lite 2>/dev/null || true
ln -sf src ep_etherpad-lite
echo "✅ 成功创建符号链接: ep_etherpad-lite -> src"

# 4. 在根目录下为所有 ep_ 插件建立同级软链接
for p in node_modules/ep_*; do
    if [ -d "$p" ]; then
        pname=$(basename "$p")
        rm -rf "$pname" 2>/dev/null || true
        ln -sf "$p" "$pname"
    fi
done
echo "✅ 成功为所有 ep_ 插件创建根目录直通符号链接！"

# 5. 确保 package.json 中正确列出 dependencies
node -e '
const fs = require("fs");
let pkg = { name: "etherpad-lite", dependencies: {} };
try { pkg = JSON.parse(fs.readFileSync("package.json", "utf8")); } catch(e) {}
if (!pkg.dependencies) pkg.dependencies = {};

const plugins = fs.readdirSync("node_modules").filter(d => d.startsWith("ep_"));
plugins.forEach(p => {
  pkg.dependencies[p] = "*";
});
fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2), "utf8");
console.log("✅ package.json 已同步注册全部 " + plugins.length + " 个插件！");
'

# 6. 清理旧缓存
rm -rf var/plugins.json var/minified_* 2>/dev/null || true

# 7. 启动 Etherpad 服务
echo "🚀 正在启动 Etherpad 服务..."
export NODE_ENV=production
nohup node src/node/server.js > /var/log/etherpad.log 2>&1 &

# 8. 等待 9001 端口就绪
echo "⏳ 等待 9001 端口监听与插件树初始化..."
for i in {1..20}; do
    if curl -s -I http://127.0.0.1:9001/ 2>/dev/null | grep -E "200|302|HTTP" > /dev/null; then
        break
    fi
    echo -n "..."
    sleep 1
done
echo ""

echo "📄 查看 Etherpad 启动日志:"
tail -n 25 /var/log/etherpad.log

# 9. 重新载入 Nginx 配置
cd /www/wwwroot/47.99.110.230
./fix_nginx_clean_final.sh

# 10. 检查已激活插件列表
echo ""
echo "🔍 检查 Etherpad API 输出的已激活插件清单:"
curl -s "http://127.0.0.1:9001/javascripts/plugin-definitions.json" | grep -o '"name":"ep_[^"]*"' | sort -u || echo "未获取到"
