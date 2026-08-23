#!/bin/bash
set -e

echo "🚀 ========================================================"
echo "⚡ 直接在 Express 路由拦截并返回权威 plugin-definitions.json"
echo "🚀 ========================================================"

export PATH="/usr/bin:/usr/local/bin:$PATH"
EP_DIR="/www/wwwroot/etherpad-lite"

cd "$EP_DIR"

# 1. 停止旧进程
fuser -k 9001/tcp 2>/dev/null || true
pkill -9 -f "node" 2>/dev/null || true
sleep 1

# 2. 找到 static.ts 或处理 plugin-definitions 的文件并注入 res.sendFile
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
allFiles.forEach(f => {
  try {
    let code = fs.readFileSync(f, "utf8");
    if (code.includes("plugin-definitions.json") && (code.includes("app.get") || code.includes("expressCreateServer") || code.includes("getPluginDefinitions"))) {
      console.log("  🎯 正在修补路由处理文件:", f);
      // 注入权威 definitions 发送
      if (!code.includes("/* JIZHI_DIRECT_PLUGIN_DEF_SEND */")) {
        const inject = `
/* JIZHI_DIRECT_PLUGIN_DEF_SEND */
const fsDirectDef = require("fs");
const pathDirectDef = require("path");
const customDefPath = pathDirectDef.resolve(__dirname, "${path.relative(path.dirname(f), path.resolve("var/plugin-definitions.json"))}");
`;
        code = inject + "\n" + code;
        code = code.replace(/res\.json\s*\(\s*[^)]*getPluginDefinitions[^)]*\)/g, `(fsDirectDef.existsSync(customDefPath) ? res.sendFile(customDefPath) : res.json(client_plugins.getPluginDefinitions()))`);
        fs.writeFileSync(f, code, "utf8");
        console.log("  ✅ 成功注入 res.sendFile(var/plugin-definitions.json):", f);
      }
    }
  } catch(e) {}
});
'

# 3. 启动 Etherpad
echo "🚀 正在启动 Etherpad 2.7.3..."
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

# 5. 立即打印 curl 返回的内容
echo "🔍 正在直接请求 /pluginfw/plugin-definitions.json:"
curl -s "http://127.0.0.1:9001/pluginfw/plugin-definitions.json"
echo ""
