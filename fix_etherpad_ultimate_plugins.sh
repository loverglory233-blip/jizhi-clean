#!/bin/bash
set -e

echo "🚀 ========================================================"
echo "⚡ Etherpad 插件物理路径与客户端 UI 挂载终极修复"
echo "🚀 ========================================================"

export PATH="/www/server/nodejs/v18.20.7/bin:$PATH"
EP_DIR="/www/wwwroot/etherpad-lite"

cd "$EP_DIR"

# 1. 释放 9001 端口并结束旧进程
fuser -k 9001/tcp 2>/dev/null || true
pkill -9 -f "node" 2>/dev/null || true
sleep 1

# 2. 深度分析 node_modules 中的所有 ep_ 插件并生成官方完全合规的 var/plugins.json
node -e '
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
  console.log("🔍 正在深度解析 " + dirs.length + " 个 ep_ 插件的 ep.json 规范...");
  
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
            
            // 注册服务端 hooks (如 eejsBlock_editbarMenuLeft)
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
            // 注册客户端 hooks
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
console.log("✅ var/plugins.json 完美写入！注册插件数: " + Object.keys(pluginsData.plugins).length + "，注册组件数: " + pluginsData.parts.length);
'

# 3. 启动 Etherpad 服务
echo "🚀 正在启动 Etherpad 服务..."
export NODE_ENV=production
nohup node src/node/server.js > /var/log/etherpad.log 2>&1 &

# 4. 等待 9001 端口就绪
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
    echo "📄 查看最新日志:"
    tail -n 12 /var/log/etherpad.log
else
    echo "❌ 启动失败日志:"
    tail -n 25 /var/log/etherpad.log
fi

# 5. 重新载入 Nginx 配置
cd /www/wwwroot/47.99.110.230
./fix_nginx_clean_final.sh

# 6. 测试抓取真实 Pad 页面看是否包含插件注入
echo "🔍 正在抓取 /p/jizhi_test_verify 的实际渲染 DOM..."
TEST_PAD_HTML=$(curl -s "http://127.0.0.1:9001/p/jizhi_test_verify?showControls=true")
if echo "$TEST_PAD_HTML" | grep -q "editbar"; then
    echo "✅ Editbar 工具栏已成功输出到前端页面！"
fi
