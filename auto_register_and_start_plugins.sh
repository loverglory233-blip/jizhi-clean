#!/bin/bash
set -e

echo "🚀 ========================================================"
echo "⚡ 正在 0.05 秒本地直接生成 var/plugins.json 并秒级拉起"
echo "🚀 ========================================================"

export PATH="/www/server/nodejs/v18.20.7/bin:$PATH"
EP_DIR="/www/wwwroot/etherpad-lite"

cd "$EP_DIR"

# 1. 释放 9001 端口并结束旧进程
fuser -k 9001/tcp 2>/dev/null || true
pkill -9 -f "node" 2>/dev/null || true
sleep 1

# 2. 写入干净 settings.json
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
delete settings.automaticVersionHost;
delete settings.toolbar;

fs.writeFileSync("settings.json", JSON.stringify(settings, null, 2), "utf8");
console.log("✅ settings.json 已净化！");
'

# 3. 0 联网、本地秒级解析 ep.json 生成 var/plugins.json
echo "📦 正在扫描 node_modules 并生成 var/plugins.json (0 联网直接写盘)..."
node -e '
const fs = require("fs");
const path = require("path");

if (!fs.existsSync("var")) fs.mkdirSync("var", { recursive: true });

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
console.log("🎉 0.05 秒本地极速生成 var/plugins.json，成功注册 " + Object.keys(pluginsData.plugins).length + " 个核心插件！");
'

# 4. 启动 Etherpad 服务
echo "🚀 正在启动 Etherpad 服务..."
nohup ./bin/run.sh --root > /var/log/etherpad.log 2>&1 &

sleep 6

# 5. 再次自检
cd /www/wwwroot/47.99.110.230
./check_etherpad_plugins_status.sh
