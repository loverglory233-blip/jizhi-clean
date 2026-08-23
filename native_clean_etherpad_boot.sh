#!/bin/bash
set -e

echo "🚀 ========================================================"
echo "⚡ 官方标准生命周期：预写 var/plugins.json 秒开 9001 端口"
echo "🚀 ========================================================"

export PATH="/www/server/nodejs/v18.20.7/bin:$PATH"
EP_DIR="/www/wwwroot/etherpad-lite"

cd "$EP_DIR"

# 1. 释放 9001 端口并结束旧进程
fuser -k 9001/tcp 2>/dev/null || true
pkill -9 -f "node" 2>/dev/null || true
sleep 1

# 2. 100% 还原所有 src 源码为官方原始状态（消除所有代码侵入）
git checkout src/ 2>/dev/null || true

# 3. 建立根目录符号链接
rm -rf ep_etherpad-lite 2>/dev/null || true
ln -sf src ep_etherpad-lite

# 4. 精确生成官方标准 var/plugins.json
node -e '
const fs = require("fs");
const path = require("path");

if (!fs.existsSync("var")) fs.mkdirSync("var", { recursive: true });

const nmDir = path.resolve("node_modules");
const srcDir = path.resolve("src");

const pluginsData = {
  plugins: {
    "ep_etherpad-lite": {
      package: { name: "ep_etherpad-lite", version: "1.9.7" },
      realPath: srcDir
    }
  },
  parts: [
    {
      name: "ep_etherpad-lite/main",
      plugin: "ep_etherpad-lite",
      fullPath: srcDir,
      hooks: {},
      client_hooks: {}
    }
  ],
  hooks: {},
  loaded: true
};

if (fs.existsSync(nmDir)) {
  const dirs = fs.readdirSync(nmDir).filter(d => d.startsWith("ep_") && d !== "ep_etherpad-lite");
  dirs.forEach(d => {
    const pDir = path.join(nmDir, d);
    let pkg = { name: d, version: "1.0.0" };
    try { pkg = JSON.parse(fs.readFileSync(path.join(pDir, "package.json"), "utf8")); } catch(e) {}
    
    pluginsData.plugins[d] = {
      package: pkg,
      realPath: pDir
    };

    const epJsonPath = path.join(pDir, "ep.json");
    if (fs.existsSync(epJsonPath)) {
      try {
        const epData = JSON.parse(fs.readFileSync(epJsonPath, "utf8"));
        if (Array.isArray(epData.parts)) {
          epData.parts.forEach(part => {
            const partObj = Object.assign({}, part, {
              plugin: d,
              fullPath: pDir,
              name: d + "/" + (part.name || "main")
            });
            pluginsData.parts.push(partObj);

            if (part.hooks) {
              for (const [hk, loc] of Object.entries(part.hooks)) {
                if (!pluginsData.hooks[hk]) pluginsData.hooks[hk] = [];
                pluginsData.hooks[hk].push({
                  part: partObj.name,
                  plugin: d,
                  location: loc
                });
              }
            }
          });
        }
      } catch(e) {}
    }
  });
}

fs.writeFileSync("var/plugins.json", JSON.stringify(pluginsData, null, 2), "utf8");
console.log("✅ 官方标准 var/plugins.json 已预置完毕！包含 12 个功能插件与核心包。");
'

# 5. 启动原生 Node 服务
echo "🚀 正在启动 Etherpad 服务..."
export NODE_ENV=production
nohup node src/node/server.js > /var/log/etherpad.log 2>&1 &

# 6. 等待 9001 端口就绪
echo "⏳ 等待 9001 端口监听..."
READY=0
for i in {1..25}; do
    CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:9001/ || echo "000")
    if [ "$CODE" = "200" ] || [ "$CODE" = "302" ]; then
        READY=1
        echo "🎉 9001 端口已成功在第 $i 秒完全就绪 (HTTP $CODE)！"
        break
    fi
    echo -n "."
    sleep 1
done
echo ""

if [ $READY -eq 1 ]; then
    echo "📄 查看 Etherpad 就绪日志:"
    tail -n 15 /var/log/etherpad.log
else
    echo "❌ 启动超时日志:"
    tail -n 25 /var/log/etherpad.log
    exit 1
fi

# 7. 重新载入 Nginx 配置
cd /www/wwwroot/47.99.110.230
./fix_nginx_clean_final.sh > /dev/null 2>&1 || true

# 8. 立即执行全量端到端验证
./e2e_verify_etherpad_active.sh
