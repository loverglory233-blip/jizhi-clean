#!/bin/bash
set -e

echo "🚀 ========================================================"
echo "⚡ 在源头函数 client_plugins.ts 注入权威定义"
echo "🚀 ========================================================"

export PATH="/usr/bin:/usr/local/bin:$PATH"
EP_DIR="/www/wwwroot/etherpad-lite"

cd "$EP_DIR"

# 1. 停止旧进程
fuser -k 9001/tcp 2>/dev/null || true
pkill -9 -f "node" 2>/dev/null || true
sleep 1

# 2. 直接为 src/static/js/pluginfw/client_plugins.ts 修补 getPluginDefinitions
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
    if (code.includes("getPluginDefinitions") && (code.includes("plugins: plugins.plugins") || code.includes("export const getPluginDefinitions") || code.includes("exports.getPluginDefinitions"))) {
      console.log("  🎯 找到客户端插件定义源头文件:", f);
      
      const injectPatch = `
const fsDirectSource = require("fs");
const pathDirectSource = require("path");

exports.getPluginDefinitions = () => {
  const customDef = pathDirectSource.resolve(__dirname, "${path.relative(path.dirname(f), path.resolve("var/plugin-definitions.json"))}");
  if (fsDirectSource.existsSync(customDef)) {
    try {
      const data = JSON.parse(fsDirectSource.readFileSync(customDef, "utf8"));
      if (data && data.plugins && Object.keys(data.plugins).length > 0) {
        return data;
      }
    } catch(e) {}
  }
  return { plugins: (typeof plugins !== "undefined" && plugins.plugins) ? plugins.plugins : {}, parts: (typeof plugins !== "undefined" && plugins.parts) ? plugins.parts : [] };
};
`;
      code = injectPatch + "\n" + code;
      fs.writeFileSync(f, code, "utf8");
      console.log("  ✅ 成功在源头函数注入:", f);
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

# 5. 立即打印返回的插件名字列表
echo "🔍 正在测试 /pluginfw/plugin-definitions.json 输出的插件列表:"
curl -s "http://127.0.0.1:9001/pluginfw/plugin-definitions.json" | grep -o '"ep_[^"]*"' | sort -u
echo ""
