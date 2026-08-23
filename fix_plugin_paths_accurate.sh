#!/bin/bash
set -e

echo "🚀 ========================================================"
echo "⚡ 精确校准 Etherpad 插件路径映射并秒级拉起全部插件"
echo "🚀 ========================================================"

export PATH="/www/server/nodejs/v18.20.7/bin:$PATH"
EP_DIR="/www/wwwroot/etherpad-lite"

cd "$EP_DIR"

# 1. 释放 9001 端口并结束旧进程
fuser -k 9001/tcp 2>/dev/null || true
pkill -9 -f "node" 2>/dev/null || true
sleep 1

# 2. 还原 git 修改并精准重写 src/static/js/pluginfw/plugins.js
git checkout src/static/js/pluginfw/ 2>/dev/null || true
git checkout src/node/ 2>/dev/null || true

node -e '
const fs = require("fs");
const path = require("path");

const targetFile = "src/static/js/pluginfw/plugins.js";
if (!fs.existsSync(targetFile)) {
  console.error("❌ 找不到", targetFile);
  process.exit(1);
}

let code = fs.readFileSync(targetFile, "utf8");

// 注入权威 getPackages
const patch = `
/* JIZHI_ACCURATE_PLUGIN_SCAN */
exports.getPackages = async () => {
  const rootDir = path.resolve(__dirname, "../../../..");
  const srcDir = path.join(rootDir, "src");
  const nmDir = path.join(rootDir, "node_modules");

  const packages = {
    "ep_etherpad-lite": {
      name: "ep_etherpad-lite",
      version: "1.9.7",
      path: srcDir
    }
  };

  try {
    if (fs.existsSync(nmDir)) {
      const dirs = fs.readdirSync(nmDir);
      dirs.forEach(d => {
        if (d.startsWith("ep_") && d !== "ep_etherpad-lite") {
          const pDir = path.join(nmDir, d);
          let pkg = { name: d, version: "1.0.0" };
          try { pkg = JSON.parse(fs.readFileSync(path.join(pDir, "package.json"), "utf8")); } catch(e) {}
          packages[d] = {
            name: d,
            version: pkg.version || "1.0.0",
            path: pDir
          };
        }
      });
    }
  } catch(e) {
    console.error("Plugin scan error:", e);
  }
  return packages;
};
`;

if (code.includes("exports.getPackages =")) {
  code = code.replace(/exports\.getPackages\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{[\s\S]*?\n\};/, patch);
} else {
  code += "\n" + patch;
}

fs.writeFileSync(targetFile, code, "utf8");
console.log("✅ src/static/js/pluginfw/plugins.js 已精准打入补丁！");
'

# 3. 清理缓存
rm -rf var/plugins.json var/minified_* 2>/dev/null || true

# 4. 启动 Etherpad
echo "🚀 正在启动 Etherpad 服务..."
export NODE_ENV=production
nohup node src/node/server.js > /var/log/etherpad.log 2>&1 &

# 5. 等待端口就绪
echo "⏳ 等待 9001 端口启动..."
for i in {1..20}; do
    if curl -s -I http://127.0.0.1:9001/ 2>/dev/null | grep -E "200|302|HTTP" > /dev/null; then
        break
    fi
    echo -n "..."
    sleep 1
done
echo ""

echo "📄 查看 Etherpad 启动日志中加载的插件列表:"
tail -n 25 /var/log/etherpad.log

# 6. 重新载入 Nginx 配置
cd /www/wwwroot/47.99.110.230
./fix_nginx_clean_final.sh
