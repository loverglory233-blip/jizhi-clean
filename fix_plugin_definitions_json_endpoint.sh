#!/bin/bash
set -e

echo "🚀 ========================================================"
echo "⚡ 精准修补 Etherpad 2.7.3 的 plugin-definitions.json 路由"
echo "🚀 ========================================================"

export PATH="/usr/bin:/usr/local/bin:$PATH"
EP_DIR="/www/wwwroot/etherpad-lite"

cd "$EP_DIR"

# 1. 停止旧进程
fuser -k 9001/tcp 2>/dev/null || true
pkill -9 -f "node" 2>/dev/null || true
sleep 1

# 2. 全局搜索并定位响应 plugin-definitions.json 的源码文件
node -e '
const fs = require("fs");
const path = require("path");

function walk(dir) {
  let results = [];
  try {
    const list = fs.readdirSync(dir);
    list.forEach(file => {
      file = path.join(dir, file);
      const stat = fs.statSync(file);
      if (stat && stat.isDirectory()) {
        if (!file.includes("node_modules") && !file.includes(".git")) {
          results = results.concat(walk(file));
        }
      } else if (file.endsWith(".js") || file.endsWith(".ts")) {
        results.push(file);
      }
    });
  } catch(e) {}
  return results;
}

const allFiles = walk("src");
console.log("🔍 正在定位 plugin-definitions.json 相关源码...");

allFiles.forEach(f => {
  try {
    const code = fs.readFileSync(f, "utf8");
    if (code.includes("plugin-definitions.json") || code.includes("getPluginDefinitions")) {
      console.log("  🎯 命中文件:", f);
    }
  } catch(e) {}
});

// 扫描所有安装好的 ep_ 插件真实配置
const nmDirs = [
  path.resolve("node_modules"),
  path.resolve("src/node_modules")
];

const pluginDefs = {
  plugins: {},
  parts: []
};

nmDirs.forEach(nm => {
  if (fs.existsSync(nm)) {
    const dirs = fs.readdirSync(nm).filter(d => d.startsWith("ep_") && d !== "ep_etherpad-lite");
    dirs.forEach(d => {
      const pDir = path.join(nm, d);
      const epJsonPath = path.join(pDir, "ep.json");
      let pkg = { name: d, version: "1.0.0" };
      try { pkg = JSON.parse(fs.readFileSync(path.join(pDir, "package.json"), "utf8")); } catch(e) {}
      
      pluginDefs.plugins[d] = {
        name: d,
        version: pkg.version || "1.0.0"
      };

      if (fs.existsSync(epJsonPath)) {
        try {
          const epData = JSON.parse(fs.readFileSync(epJsonPath, "utf8"));
          if (Array.isArray(epData.parts)) {
            epData.parts.forEach(part => {
              pluginDefs.parts.push({
                name: d + "/" + (part.name || "main"),
                plugin: d,
                client_hooks: part.client_hooks || {},
                hooks: part.hooks || {}
              });
            });
          }
        } catch(e) {}
      }
    });
  }
});

// 写入 var/plugin-definitions.json
if (!fs.existsSync("var")) fs.mkdirSync("var", { recursive: true });
fs.writeFileSync("var/plugin-definitions.json", JSON.stringify(pluginDefs, null, 2), "utf8");
console.log("✅ 权威 var/plugin-definitions.json 生成完毕！包含 " + Object.keys(pluginDefs.plugins).length + " 个插件，" + pluginDefs.parts.length + " 个组件。");
'

# 3. 启动 Etherpad 2.7.3
echo "🚀 正在启动 Etherpad 2.7.3 服务..."
export NODE_ENV=production
nohup ./bin/run.sh --root > /var/log/etherpad.log 2>&1 &

# 4. 等待 9001 端口就绪
echo "⏳ 等待 9001 端口就绪..."
for i in {1..35}; do
    CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:9001/ || echo "000")
    if [ "$CODE" = "200" ] || [ "$CODE" = "302" ]; then
        echo "🎉 Etherpad 9001 端口在第 $i 秒完全就绪 (HTTP $CODE)！"
        break
    fi
    echo -n "."
    sleep 1
done
echo ""

# 5. 立即执行测试
./test_real_pad_browser_dom.sh
