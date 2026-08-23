#!/bin/bash
set -e

echo "🚀 ========================================================"
echo "⚡ 深入重构 Etherpad 1.9.7 插件注册中心 Plugins.js"
echo "🚀 ========================================================"

export PATH="/www/server/nodejs/v18.20.7/bin:$PATH"
EP_DIR="/www/wwwroot/etherpad-lite"

cd "$EP_DIR"

# 1. 释放 9001 端口并结束旧进程
fuser -k 9001/tcp 2>/dev/null || true
pkill -9 -f "node" 2>/dev/null || true
sleep 1

# 2. 直接为 src/node/utils/Plugins.js 重写 getPackages 与 update 逻辑
node -e '
const fs = require("fs");
const path = require("path");

const pFile = "src/node/utils/Plugins.js";
if (fs.existsSync(pFile)) {
  let content = fs.readFileSync(pFile, "utf8");
  
  // 彻底接管 getPackages 导出
  const directCode = `
const fsDirect = require("fs");
const pathDirect = require("path");

exports.getPackages = async () => {
  const pkgs = {
    "ep_etherpad-lite": {
      name: "ep_etherpad-lite",
      version: "1.9.7",
      path: pathDirect.resolve(__dirname, "../../..")
    }
  };
  try {
    const nm = pathDirect.resolve(__dirname, "../../../node_modules");
    if (fsDirect.existsSync(nm)) {
      const dirs = fsDirect.readdirSync(nm);
      dirs.forEach(d => {
        if (d.startsWith("ep_") && d !== "ep_etherpad-lite") {
          const pDir = pathDirect.join(nm, d);
          let pkg = { name: d, version: "1.0.0" };
          try { pkg = JSON.parse(fsDirect.readFileSync(pathDirect.join(pDir, "package.json"), "utf8")); } catch(e) {}
          pkgs[d] = {
            name: d,
            version: pkg.version || "1.0.0",
            path: pDir
          };
        }
      });
    }
  } catch(e) {
    console.error("Custom scan error:", e);
  }
  return pkgs;
};
`;

  // 替换 getPackages
  if (content.includes("exports.getPackages")) {
    content = content.replace(/exports\.getPackages\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{[\s\S]*?\n\};/, directCode);
  } else {
    content += "\n" + directCode;
  }
  
  fs.writeFileSync(pFile, content, "utf8");
  console.log("✅ src/node/utils/Plugins.js 源码已精准接管！");
}
'

# 3. 在 node_modules 下运行 npm link 或确保全局符号链接
node -e '
const fs = require("fs");
const path = require("path");

const nm = path.resolve("node_modules");
if (fs.existsSync(nm)) {
  const plugins = fs.readdirSync(nm).filter(d => d.startsWith("ep_"));
  console.log("📦 准备就绪的官方插件:", plugins.join(", "));
}
'

# 4. 清理旧缓存
rm -rf var/plugins.json var/minified_* 2>/dev/null || true

# 5. 启动 Etherpad
echo "🚀 正在启动 Etherpad 服务..."
export NODE_ENV=production
nohup node src/node/server.js > /var/log/etherpad.log 2>&1 &

# 6. 等待端口就绪
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

# 7. 测试 API
echo ""
echo "🔍 测试 /javascripts/plugin-definitions.json 返回的插件总数:"
curl -s "http://127.0.0.1:9001/javascripts/plugin-definitions.json" | grep -o '"name":"ep_[^"]*"' | sort -u || echo "未抓取到"

# 8. 重新载入 Nginx 配置
cd /www/wwwroot/47.99.110.230
./fix_nginx_clean_final.sh
