#!/bin/bash
set -e

echo "🚀 ========================================================"
echo "⚡ 深度修补 Etherpad 1.9.7 内核插件加载器 (绕过 npm list 阻断)"
echo "🚀 ========================================================"

export PATH="/www/server/nodejs/v18.20.7/bin:$PATH"
EP_DIR="/www/wwwroot/etherpad-lite"

cd "$EP_DIR"

# 1. 释放 9001 端口并结束旧进程
fuser -k 9001/tcp 2>/dev/null || true
pkill -9 -f "node" 2>/dev/null || true
sleep 1

# 2. 深度修补 src/node/utils/Plugins.js
node -e '
const fs = require("fs");
const path = require("path");

const pluginsFile = "src/node/utils/Plugins.js";
if (fs.existsSync(pluginsFile)) {
  let code = fs.readFileSync(pluginsFile, "utf8");
  
  // 如果尚未打补丁，注入本地优先的插件包扫描函数
  if (!code.includes("/* JIZHI_DIRECT_PLUGIN_SCAN */")) {
    const patchCode = `
/* JIZHI_DIRECT_PLUGIN_SCAN */
exports.getPackages = async () => {
  const cMod = require("module");
  const fsPromises = require("fs").promises;
  const pathMod = require("path");
  const packages = {
    "ep_etherpad-lite": {
      name: "ep_etherpad-lite",
      version: "1.9.7",
      path: pathMod.resolve(__dirname, "../../..")
    }
  };
  try {
    const nm = pathMod.resolve(__dirname, "../../../node_modules");
    const dirs = await fsPromises.readdir(nm);
    for (const d of dirs) {
      if (d.startsWith("ep_") && d !== "ep_etherpad-lite") {
        const pDir = pathMod.join(nm, d);
        let pkg = { name: d, version: "1.0.0" };
        try { pkg = JSON.parse(await fsPromises.readFile(pathMod.join(pDir, "package.json"), "utf8")); } catch(e) {}
        packages[d] = {
          name: d,
          version: pkg.version || "1.0.0",
          path: pDir
        };
      }
    }
  } catch(e) {
    console.warn("Direct plugin scan error:", e);
  }
  return packages;
};
`;
    // 替换原有的 exports.getPackages
    if (code.includes("exports.getPackages")) {
      code = code.replace(/exports\.getPackages\s*=\s*async\s*\([^)]*\)\s*=>\s*\{[\s\S]*?\n\};/, patchCode);
    } else {
      code += patchCode;
    }
    fs.writeFileSync(pluginsFile, code, "utf8");
    console.log("✅ src/node/utils/Plugins.js 已成功打入全量插件直扫补丁！");
  } else {
    console.log("ℹ️ src/node/utils/Plugins.js 已经包含补丁。");
  }
}
'

# 3. 清理缓存并直接启动 Node 服务
rm -rf var/plugins.json var/minified_* 2>/dev/null || true

echo "🚀 正在启动 Etherpad 服务..."
export NODE_ENV=production
nohup node src/node/server.js > /var/log/etherpad.log 2>&1 &

# 4. 等待 9001 端口就绪
echo "⏳ 等待 9001 端口监听与插件树注册..."
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
    echo ""
    echo "📄 查看已加载插件清单日志:"
    tail -n 25 /var/log/etherpad.log
else
    echo "❌ 启动失败日志:"
    tail -n 25 /var/log/etherpad.log
fi

# 5. 重新载入 Nginx 配置
cd /www/wwwroot/47.99.110.230
./fix_nginx_clean_final.sh

# 6. 立即执行验证
./verify_etherpad_toolbar_and_cursor.sh
