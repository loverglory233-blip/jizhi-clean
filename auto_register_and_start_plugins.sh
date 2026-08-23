#!/bin/bash
set -e

echo "🚀 ========================================================"
echo "⚡ 正在高可靠注册 Etherpad 插件并全量激活工具栏"
echo "🚀 ========================================================"

export PATH="/www/server/nodejs/v18.20.7/bin:$PATH"
EP_DIR="/www/wwwroot/etherpad-lite"

cd "$EP_DIR"

# 1. 释放 9001 端口并结束旧进程
fuser -k 9001/tcp 2>/dev/null || true
pkill -9 -f "node" 2>/dev/null || true
sleep 1

# 2. 写入 settings.json
node -e '
const fs = require("fs");
let settings = {};
try { settings = JSON.parse(fs.readFileSync("settings.json", "utf8")); } catch(e) {}

settings.ip = "0.0.0.0";
settings.port = 9001;
settings.minify = false;
settings.maxAge = 0;
settings.suppressErrorsInPadText = true;
settings.requireAuthentication = false;
settings.requireAuthorization = false;
settings.trustProxy = true;
settings.automaticVersionHost = null;
delete settings.toolbar;

fs.writeFileSync("settings.json", JSON.stringify(settings, null, 2), "utf8");
console.log("✅ settings.json 已更新！");
'

# 3. 扫描 node_modules 并生成 var/plugins.json
echo "📦 正在扫描 node_modules 并注册所有 ep_* 插件..."
node -e '
const fs = require("fs");
const path = require("path");

if (!fs.existsSync("var")) fs.mkdirSync("var", { recursive: true });

// 寻找 plugins.js 的真实路径
let pluginfw = null;
const possiblePaths = [
  "./src/static/js/pluginfw/plugins.js",
  "./src/node/pluginfw/plugins.js",
  "./src/pluginfw/plugins.js"
];

for (const p of possiblePaths) {
  if (fs.existsSync(p)) {
    try {
      pluginfw = require(p);
      console.log("Found plugin manager at:", p);
      break;
    } catch(e) {}
  }
}

if (pluginfw && typeof pluginfw.update === "function") {
  pluginfw.update(() => {
    console.log("✅ 原生插件管理器已完成注册！");
    finish();
  });
} else {
  // 手工精准构建 var/plugins.json
  const nm = "node_modules";
  const pluginsData = { plugins: {}, parts: [], hooks: {}, loaded: true };
  
  if (fs.existsSync(nm)) {
    const dirs = fs.readdirSync(nm);
    dirs.forEach(d => {
      if (d.startsWith("ep_")) {
        const pDir = path.join(nm, d);
        let pkg = { name: d, version: "1.0.0" };
        try { pkg = JSON.parse(fs.readFileSync(path.join(pDir, "package.json"), "utf8")); } catch(e) {}
        
        pluginsData.plugins[d] = {
          package: pkg,
          realPath: path.resolve(pDir)
        };
        
        // 读取 ep.json 中的 parts 和 hooks
        const epPath = path.join(pDir, "ep.json");
        if (fs.existsSync(epPath)) {
          try {
            const ep = JSON.parse(fs.readFileSync(epPath, "utf8"));
            if (Array.isArray(ep.parts)) {
              ep.parts.forEach(part => {
                part.plugin = d;
                part.fullPath = path.resolve(pDir);
                pluginsData.parts.push(part);
                if (part.hooks) {
                  for (const [hk, fn] of Object.entries(part.hooks)) {
                    if (!pluginsData.hooks[hk]) pluginsData.hooks[hk] = [];
                    pluginsData.hooks[hk].push({
                      part: part.name || d,
                      plugin: d,
                      location: fn
                    });
                  }
                }
              });
            }
          } catch(e) {}
        }
      }
    });
  }
  
  fs.writeFileSync("var/plugins.json", JSON.stringify(pluginsData, null, 2), "utf8");
  console.log("✅ 已成功写入 var/plugins.json，共注册 " + Object.keys(pluginsData.plugins).length + " 个插件！");
  finish();
}

function finish() {
  process.exit(0);
}
'

# 4. 启动 Etherpad 服务
echo "🚀 正在启动 Etherpad..."
nohup ./bin/run.sh --root > /var/log/etherpad.log 2>&1 &

sleep 6

# 5. 再次自检
cd /www/wwwroot/47.99.110.230
./check_etherpad_plugins_status.sh
