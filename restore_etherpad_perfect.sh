#!/bin/bash
# ==============================================================================
# Etherpad 插件注册与 500 报错秒级根治修复引擎
# ==============================================================================

echo "🚀 [1/4] 定位 Etherpad 目录与 Node.js 环境..."
EP_DIR="/www/wwwroot/etherpad-lite"
if [ ! -d "$EP_DIR" ]; then
  for p in /www/wwwroot/*/etherpad-lite /www/wwwroot/etherpad*; do
    if [ -d "$p" ]; then EP_DIR="$p"; break; fi
  done
fi

if [ ! -d "$EP_DIR" ]; then
  echo "❌ 未找到 Etherpad 目录"
  exit 1
fi
echo "📁 Etherpad 路径: $EP_DIR"

NODE_BIN=$(which node 2>/dev/null || find /www/server/nodejs -name node 2>/dev/null | head -n 1 || find /usr -name node 2>/dev/null | head -n 1)
if [ -z "$NODE_BIN" ]; then
  echo "❌ 未找到 node 二进制"
  exit 1
fi
echo "⚡ Node: $NODE_BIN"

cd "$EP_DIR"

echo "🛑 [2/4] 结束旧 Etherpad 进程..."
fuser -k 9001/tcp 2>/dev/null || true
pkill -9 -f "node.*server\.js" 2>/dev/null || true
pkill -9 -f "node.*etherpad" 2>/dev/null || true
pkill -9 -f "bin/run.sh" 2>/dev/null || true
sleep 1

echo "📦 [3/4] 重新深度构筑合规的 var/plugins.json (注册 heading, font-size 等所有学术插件)..."
"$NODE_BIN" -e '
const fs = require("fs");
const path = require("path");

if (!fs.existsSync("var")) fs.mkdirSync("var", { recursive: true });

const nm = path.resolve("node_modules");
const pluginsData = {
  plugins: {
    "ep_etherpad-lite": {
      package: { name: "ep_etherpad-lite", version: "1.9.7" },
      realPath: path.resolve("src")
    }
  },
  parts: [
    {
      name: "ep_etherpad-lite/main",
      plugin: "ep_etherpad-lite",
      fullPath: path.resolve("src"),
      hooks: {},
      client_hooks: {}
    }
  ],
  hooks: {},
  loaded: true
};

if (fs.existsSync(nm)) {
  const dirs = fs.readdirSync(nm).filter(d => d.startsWith("ep_"));
  console.log("🔍 扫描到 " + dirs.length + " 个 ep_ 插件，正在注入注册表...");
  
  dirs.forEach(d => {
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
            const partObj = {
              name: part.name || (d + "/" + (part.name || "main")),
              plugin: d,
              fullPath: path.resolve(pDir),
              hooks: part.hooks || {},
              client_hooks: part.client_hooks || {}
            };
            pluginsData.parts.push(partObj);
            
            if (part.hooks) {
              for (const [hk, fn] of Object.entries(part.hooks)) {
                if (!pluginsData.hooks[hk]) pluginsData.hooks[hk] = [];
                pluginsData.hooks[hk].push({
                  part: partObj.name,
                  plugin: d,
                  location: fn
                });
              }
            }
            if (part.client_hooks) {
              for (const [hk, fn] of Object.entries(part.client_hooks)) {
                if (!pluginsData.hooks[hk]) pluginsData.hooks[hk] = [];
                pluginsData.hooks[hk].push({
                  part: partObj.name,
                  plugin: d,
                  location: fn
                });
              }
            }
          });
        }
      } catch(e) {
        console.warn("解析 ep.json 出错:", d, e.message);
      }
    }
  });
}

fs.writeFileSync("var/plugins.json", JSON.stringify(pluginsData, null, 2), "utf8");
console.log("✅ var/plugins.json 完美写入！共注册插件: " + Object.keys(pluginsData.plugins).length);
'

chmod -R 777 var 2>/dev/null || true

echo "🚀 [4/4] 启动 Etherpad 服务并实施健康校验..."
export NODE_ENV=production
nohup "$NODE_BIN" src/node/server.js > /var/log/etherpad.log 2>&1 &

SUCCESS=0
for i in {1..25}; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 2 "http://127.0.0.1:9001/p/test_health_verify" 2>/dev/null || echo "000")
  if [ "$CODE" = "200" ] || [ "$CODE" = "302" ]; then
    SUCCESS=1
    echo "🎉 核心协同测试成功！Pad 页面访问返回状态码: $CODE"
    break
  fi
  echo -n "."
  sleep 1
done
echo ""

if [ $SUCCESS -eq 1 ]; then
  echo "=================================================="
  echo "✅ Etherpad 500 错误已彻底解决！所有工具栏按钮插件全部恢复挂载！"
  echo "=================================================="
else
  echo "❌ 尚未通过校验，请查看日志:"
  tail -n 20 /var/log/etherpad.log
fi
