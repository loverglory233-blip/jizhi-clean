#!/bin/bash
set -e

echo "🚀 ========================================================"
echo "⚡ 直接在内核 update() 注入全量插件 ep.json 内存树"
echo "🚀 ========================================================"

export PATH="/www/server/nodejs/v18.20.7/bin:$PATH"
EP_DIR="/www/wwwroot/etherpad-lite"

cd "$EP_DIR"

# 1. 释放 9001 端口并结束旧进程
fuser -k 9001/tcp 2>/dev/null || true
pkill -9 -f "node" 2>/dev/null || true
sleep 1

# 2. 还原 git 修改
git checkout src/ 2>/dev/null || true

# 3. 深入重构 src/static/js/pluginfw/plugins.js 中的 exports.update
node -e '
const fs = require("fs");
const path = require("path");

const pFile = "src/static/js/pluginfw/plugins.js";
let code = fs.readFileSync(pFile, "utf8");

const directUpdateFn = `
exports.update = async () => {
  const fsDirect = require("fs");
  const pathDirect = require("path");

  const rootDir = pathDirect.resolve(__dirname, "../../../..");
  const srcDir = pathDirect.join(rootDir, "src");
  const nmDir = pathDirect.join(rootDir, "node_modules");

  const packages = {
    "ep_etherpad-lite": {
      name: "ep_etherpad-lite",
      version: "1.9.7",
      path: srcDir
    }
  };

  try {
    if (fsDirect.existsSync(nmDir)) {
      const dirs = fsDirect.readdirSync(nmDir);
      dirs.forEach(d => {
        if (d.startsWith("ep_") && d !== "ep_etherpad-lite") {
          const pDir = pathDirect.join(nmDir, d);
          let pkg = { name: d, version: "1.0.0" };
          try { pkg = JSON.parse(fsDirect.readFileSync(pathDirect.join(pDir, "package.json"), "utf8")); } catch(e) {}
          packages[d] = {
            name: d,
            version: pkg.version || "1.0.0",
            path: pDir
          };
        }
      });
    }
  } catch(e) {
    console.error("Scan error:", e);
  }

  const parts = {};
  const plugins = {};
  const defs = {};

  for (const [pluginName, pkg] of Object.entries(packages)) {
    plugins[pluginName] = {
      package: pkg,
      realPath: pkg.path
    };
    defs[pluginName] = {
      package: pkg,
      parts: []
    };

    const epJsonPath = pathDirect.join(pkg.path, "ep.json");
    if (fsDirect.existsSync(epJsonPath)) {
      try {
        const epData = JSON.parse(fsDirect.readFileSync(epJsonPath, "utf8"));
        if (Array.isArray(epData.parts)) {
          epData.parts.forEach(part => {
            const partObj = Object.assign({}, part, {
              plugin: pluginName,
              fullPath: pkg.path
            });
            const partName = pluginName + "/" + (part.name || "main");
            partObj.name = partName;
            parts[partName] = partObj;
            defs[pluginName].parts.push(partObj);
          });
        }
      } catch(err) {
        console.warn("Parse ep.json error for " + pluginName + ":", err.message);
      }
    }
  }

  exports.packages = packages;
  exports.plugins = plugins;
  exports.parts = parts;
  exports.definitions = defs;
  
  if (typeof exports.loadPluginDefinitions === "function") {
    try { exports.loadPluginDefinitions(); } catch(e) {}
  }
  
  const hooks = require("./hooks");
  const shared = require("./shared");
  if (hooks && shared) {
    hooks.plugins = plugins;
    hooks.parts = parts;
    hooks.hooks = {};
    try {
      shared.extractHooks(Object.values(parts), "hooks", hooks.hooks);
    } catch(err) {
      console.warn("extractHooks error:", err.message);
    }
  }

  console.log("🎉 [JIZHI_KERNEL] 成功直载全量插件:", Object.keys(plugins).join(", "));
  return { plugins, parts };
};
`;

code = code.replace(/exports\.update\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{[\s\S]*?\n\};/, directUpdateFn);

fs.writeFileSync(pFile, code, "utf8");
console.log("✅ src/static/js/pluginfw/plugins.js 中的 update() 已完成直载注入！");
'

# 4. 清理旧缓存
rm -rf var/plugins.json var/minified_* 2>/dev/null || true

# 5. 启动 Etherpad 服务
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

echo "📄 查看 Etherpad 启动日志:"
tail -n 25 /var/log/etherpad.log

# 7. 重新载入 Nginx 配置
cd /www/wwwroot/47.99.110.230
./fix_nginx_clean_final.sh

# 8. 检查已激活插件列表
echo ""
echo "🔍 检查 Etherpad API 输出的已激活插件清单:"
curl -s "http://127.0.0.1:9001/javascripts/plugin-definitions.json" | grep -o '"name":"ep_[^"]*"' | sort -u || echo "未获取到"
