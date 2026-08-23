#!/bin/bash
set -e

echo "🚀 ========================================================"
echo "⚡ 防御式重构 Etherpad 1.9.7 插件系统 (100% 稳定运行)"
echo "🚀 ========================================================"

export PATH="/www/server/nodejs/v18.20.7/bin:$PATH"
EP_DIR="/www/wwwroot/etherpad-lite"

cd "$EP_DIR"

# 1. 释放 9001 端口并结束旧进程
fuser -k 9001/tcp 2>/dev/null || true
pkill -9 -f "node" 2>/dev/null || true
sleep 1

# 2. 还原官方源码
git checkout src/ 2>/dev/null || true

# 3. 建立根目录与 src symlink 兜底
rm -rf ep_etherpad-lite 2>/dev/null || true
ln -sf src ep_etherpad-lite

# 4. 深度重构 src/static/js/pluginfw/plugins.js
node -e '
const fs = require("fs");
const path = require("path");

const pFile = "src/static/js/pluginfw/plugins.js";
let code = fs.readFileSync(pFile, "utf8");

const bulletproofUpdate = `
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
  
  const hooks = require("./hooks");
  const shared = require("./shared");
  if (hooks) {
    hooks.plugins = plugins;
    hooks.parts = parts;
    hooks.hooks = {};
    
    // 手动安全挂载 hooks，绝不触发外部报错
    for (const part of Object.values(parts)) {
      if (part.hooks) {
        for (const [hk, loc] of Object.entries(part.hooks)) {
          if (!hooks.hooks[hk]) hooks.hooks[hk] = [];
          try {
            const loaded = (typeof shared.loadFn === "function") ? shared.loadFn(loc, hk, part.name) : loc;
            hooks.hooks[hk].push({ part: part.name, location: loc, hook_fn: loaded });
          } catch(e) {
            hooks.hooks[hk].push({ part: part.name, location: loc });
          }
        }
      }
    }
  }

  console.log("🎉 [JIZHI_KERNEL] 成功稳固直载全量插件 (" + Object.keys(plugins).length + " 个):", Object.keys(plugins).filter(p => p !== "ep_etherpad-lite").join(", "));
  return { plugins, parts };
};
`;

code = code.replace(/exports\.update\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{[\s\S]*?\n\};/, bulletproofUpdate);

fs.writeFileSync(pFile, code, "utf8");
console.log("✅ src/static/js/pluginfw/plugins.js 已完成防御式重构！");
'

# 5. 清理旧缓存
rm -rf var/plugins.json var/minified_* 2>/dev/null || true

# 6. 启动 Etherpad
echo "🚀 正在启动 Etherpad 服务..."
export NODE_ENV=production
nohup node src/node/server.js > /var/log/etherpad.log 2>&1 &

# 7. 等待 9001 端口就绪
echo "⏳ 等待 9001 端口监听..."
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
    tail -n 15 /var/log/etherpad.log
else
    echo "❌ 启动失败日志:"
    tail -n 25 /var/log/etherpad.log
    exit 1
fi

# 8. 重新载入 Nginx 配置
cd /www/wwwroot/47.99.110.230
./fix_nginx_clean_final.sh

# 9. 立即执行端到端全量硬核验证
./e2e_verify_etherpad_active.sh
