#!/bin/bash
set -e

echo "🚀 ========================================================"
echo "⚡ 正在通过 Etherpad 官方内核机制全量激活插件与静态路由"
echo "🚀 ========================================================"

export PATH="/www/server/nodejs/v18.20.7/bin:$PATH"
EP_DIR="/www/wwwroot/etherpad-lite"

cd "$EP_DIR"

# 1. 释放 9001 端口并结束旧进程
fuser -k 9001/tcp 2>/dev/null || true
pkill -9 -f "node" 2>/dev/null || true
sleep 1

# 2. 确保 package.json 包含全部已安装的 ep_ 插件
node -e '
const fs = require("fs");
const path = require("path");

const nm = "node_modules";
if (!fs.existsSync(nm)) {
  console.error("❌ node_modules 不存在！");
  process.exit(1);
}

const epPlugins = fs.readdirSync(nm).filter(d => d.startsWith("ep_"));
console.log("📦 扫描到 " + epPlugins.length + " 个 ep_ 插件:", epPlugins.join(", "));

// 更新根目录 package.json
let rootPkg = { name: "etherpad-lite", dependencies: {} };
try { rootPkg = JSON.parse(fs.readFileSync("package.json", "utf8")); } catch(e) {}
if (!rootPkg.dependencies) rootPkg.dependencies = {};
epPlugins.forEach(p => {
  rootPkg.dependencies[p] = "*";
});
fs.writeFileSync("package.json", JSON.stringify(rootPkg, null, 2), "utf8");

// 更新 src/package.json
let srcPkg = { name: "ep_etherpad-lite", dependencies: {} };
try { srcPkg = JSON.parse(fs.readFileSync("src/package.json", "utf8")); } catch(e) {}
if (!srcPkg.dependencies) srcPkg.dependencies = {};
epPlugins.forEach(p => {
  srcPkg.dependencies[p] = "*";
});
fs.writeFileSync("src/package.json", JSON.stringify(srcPkg, null, 2), "utf8");

console.log("✅ package.json 与 src/package.json 依赖表已同步更新！");
'

# 3. 清理旧缓存，强迫 Etherpad 启动时重新扫描生成插件树与客户端挂载路由
rm -rf var/plugins.json var/minified_* var/sessionstorage.json 2>/dev/null || true

# 4. 禁用 installDeps.sh 的联网检查
cat << 'EOS' > bin/installDeps.sh
#!/bin/sh
exit 0
EOS
chmod +x bin/installDeps.sh

# 5. 启动 Etherpad 服务（让官方内核自动扫描）
echo "🚀 正在启动 Etherpad 官方服务..."
export NODE_ENV=production
nohup node src/node/server.js > /var/log/etherpad.log 2>&1 &

# 6. 等待 9001 端口就绪
echo "⏳ 等待 9001 端口监听与插件树编译..."
SUCCESS=0
for i in {1..20}; do
    if curl -s -I http://127.0.0.1:9001/ 2>/dev/null | grep -E "200|302|HTTP" > /dev/null; then
        SUCCESS=1
        break
    fi
    echo -n "..."
    sleep 1
done
echo ""

if [ $SUCCESS -eq 1 ]; then
    echo "🎉🎉🎉 Etherpad 已成功永久稳定监听 9001 端口！"
    echo "📄 查看最新日志:"
    tail -n 15 /var/log/etherpad.log
else
    echo "❌ 启动失败日志:"
    tail -n 25 /var/log/etherpad.log
fi

# 7. 重新载入 Nginx 配置
cd /www/wwwroot/47.99.110.230
./fix_nginx_clean_final.sh

# 8. 立即执行验证
./verify_etherpad_toolbar_and_cursor.sh
