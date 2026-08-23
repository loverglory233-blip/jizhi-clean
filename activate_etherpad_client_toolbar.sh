#!/bin/bash
set -e

echo "🚀 ========================================================"
echo "⚡ 正在精准装配 Etherpad 客户端全部 UI 钩子与工具栏组件"
echo "🚀 ========================================================"

export PATH="/www/server/nodejs/v18.20.7/bin:$PATH"
EP_DIR="/www/wwwroot/etherpad-lite"

cd "$EP_DIR"

# 1. 释放 9001 端口并结束旧进程
fuser -k 9001/tcp 2>/dev/null || true
pkill -9 -f "node" 2>/dev/null || true
sleep 1

# 2. 深度扫描 node_modules 生成 100% 完整客户端 hooks 的 var/plugins.json
node -e '
const fs = require("fs");
const path = require("path");

if (!fs.existsSync("var")) fs.mkdirSync("var", { recursive: true });

const nm = "node_modules";
const pluginsData = {
  plugins: {
    "ep_etherpad-lite": {
      package: { name: "ep_etherpad-lite", version: "1.9.7" },
      realPath: path.resolve("src")
    }
  },
  parts: [],
  hooks: {},
  loaded: true
};

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
              if (part.client_hooks) {
                for (const [hk, fn] of Object.entries(part.client_hooks)) {
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
console.log("🎉 成功生成包含全量客户端 UI 钩子的 var/plugins.json！");
console.log("   - 注册插件总数:", Object.keys(pluginsData.plugins).length);
console.log("   - 注册组件 Parts:", pluginsData.parts.length);
console.log("   - 注册生命周期 Hooks:", Object.keys(pluginsData.hooks).length);
'

# 3. 启动 Etherpad 服务
echo "🚀 正在秒级启动 Etherpad 服务..."
export NODE_ENV=production
nohup node src/node/server.js > /var/log/etherpad.log 2>&1 &

# 4. 等待 9001 端口就绪
echo "⏳ 等待 9001 端口监听..."
SUCCESS=0
for i in {1..15}; do
    if curl -s -I http://127.0.0.1:9001/ 2>/dev/null | grep -E "200|302|HTTP" > /dev/null; then
        SUCCESS=1
        break
    fi
    echo -n "..."
    sleep 1
done
echo ""

if [ $SUCCESS -eq 1 ]; then
    echo "🎉🎉🎉 Etherpad 已成功挂载全量 UI 扩展并监听 9001 端口！"
    tail -n 10 /var/log/etherpad.log
fi

# 5. 重新载入 Nginx 配置
cd /www/wwwroot/47.99.110.230
./fix_nginx_clean_final.sh
