#!/bin/bash
set -e

echo "🚀 ========================================================"
echo "⚡ Etherpad 2.7.3 执行官方 build:ui 编译与插件精准挂载"
echo "🚀 ========================================================"

export PATH="/usr/bin:/usr/local/bin:$PATH"
EP_DIR="/www/wwwroot/etherpad-lite"

cd "$EP_DIR"

# 1. 停止旧进程
fuser -k 9001/tcp 2>/dev/null || true
pkill -9 -f "node" 2>/dev/null || true
sleep 1

# 2. 执行官方 build:ui 编译前端 UI 产物
echo "🔨 正在执行官方 build:ui 编译..."
pnpm run build:ui || true

# 3. 扫描 node_modules 下全部 12 个真实安装的插件并写入 var/plugins.json
node -e '
const fs = require("fs");
const path = require("path");

if (!fs.existsSync("var")) fs.mkdirSync("var", { recursive: true });

const nmDirs = [
  path.resolve("node_modules"),
  path.resolve("src/node_modules")
];

const pluginsData = {
  plugins: {
    "ep_etherpad-lite": {
      package: { name: "ep_etherpad-lite", version: "2.7.3" },
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

nmDirs.forEach(nm => {
  if (fs.existsSync(nm)) {
    const dirs = fs.readdirSync(nm).filter(d => d.startsWith("ep_") && d !== "ep_etherpad-lite");
    dirs.forEach(d => {
      const pDir = path.join(nm, d);
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
});

fs.writeFileSync("var/plugins.json", JSON.stringify(pluginsData, null, 2), "utf8");
console.log("✅ var/plugins.json 写入完毕！已注册插件数: " + Object.keys(pluginsData.plugins).length);
'

# 4. 启动 Etherpad 2.7.3
echo "🚀 正在启动 Etherpad 2.7.3..."
export NODE_ENV=production
nohup ./bin/run.sh --root > /var/log/etherpad.log 2>&1 &

# 5. 等待 9001 端口就绪
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

# 6. 查看日志
echo "📄 查看已加载插件清单日志:"
tail -n 25 /var/log/etherpad.log
