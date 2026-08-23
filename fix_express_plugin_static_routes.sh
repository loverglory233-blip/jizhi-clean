#!/bin/bash
set -e

echo "🚀 ========================================================"
echo "⚡ 彻底根除 404：在 Express 内核直接为全部插件挂载静态路由"
echo "🚀 ========================================================"

export PATH="/www/server/nodejs/v18.20.7/bin:$PATH"
EP_DIR="/www/wwwroot/etherpad-lite"

cd "$EP_DIR"

# 1. 释放 9001 端口并结束旧进程
fuser -k 9001/tcp 2>/dev/null || true
pkill -9 -f "node" 2>/dev/null || true
sleep 1

# 2. 还原官方源码
git checkout src/ 2>/dev/null || true

# 3. 建立根目录与 src 符号链接
rm -rf ep_etherpad-lite 2>/dev/null || true
ln -sf src ep_etherpad-lite

# 4. 在 Express 创建核心处注入全部插件的静态资源 Express 路由
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
      } else if (file.endsWith(".js")) {
        results.push(file);
      }
    });
  } catch(e) {}
  return results;
}

// 查找 expressCreateServer 钩子文件
const jsFiles = walk("src");
let expressHookFile = jsFiles.find(f => {
  try {
    const c = fs.readFileSync(f, "utf8");
    return c.includes("expressCreateServer") && c.includes("args.app");
  } catch(e) { return false; }
});

if (!expressHookFile) {
  expressHookFile = "src/node/hooks/express/specialpages.js";
}

console.log("🎯 命中 Express 路由挂载核心文件:", expressHookFile);

let code = fs.readFileSync(expressHookFile, "utf8");

// 注入 Express 静态路由
const staticInject = `
  /* JIZHI_DIRECT_PLUGIN_EXPRESS_STATIC_MOUNT */
  try {
    const expressMod = require("express");
    const nmDir = path.resolve(__dirname, "../../../node_modules");
    if (fs.existsSync(nmDir)) {
      const pDirs = fs.readdirSync(nmDir).filter(d => d.startsWith("ep_"));
      pDirs.forEach(d => {
        const fullDir = path.join(nmDir, d);
        const sDir = path.join(fullDir, "static");
        if (fs.existsSync(sDir)) {
          args.app.use("/static/plugins/" + d, expressMod.static(sDir));
        }
        args.app.use("/static/plugins/" + d, expressMod.static(fullDir));
      });
      console.log("🎉 [EXPRESS_ROUTER] 成功为 " + pDirs.length + " 个插件挂载 /static/plugins/ 路由！");
    }
  } catch(e) {
    console.error("Static mount error:", e);
  }
`;

if (!code.includes("JIZHI_DIRECT_PLUGIN_EXPRESS_STATIC_MOUNT")) {
  code = code.replace(/exports\.expressCreateServer\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{/, "exports.expressCreateServer = async (hookName, args, cb) => {\n" + staticInject);
  fs.writeFileSync(expressHookFile, code, "utf8");
  console.log("✅ Express 静态路由挂载补丁注入成功！");
}
'

# 5. 写入干净的 var/plugins.json
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
console.log("✅ var/plugins.json 生成完毕！");
'

# 6. 启动 Etherpad 服务
echo "🚀 正在启动 Etherpad 服务..."
export NODE_ENV=production
nohup node src/node/server.js > /var/log/etherpad.log 2>&1 &

# 7. 等待 9001 端口就绪
echo "⏳ 等待 9001 端口就绪..."
for i in {1..25}; do
    CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:9001/ || echo "000")
    if [ "$CODE" = "200" ] || [ "$CODE" = "302" ]; then
        echo "🎉 9001 端口已就绪 (HTTP $CODE)！"
        break
    fi
    echo -n "."
    sleep 1
done
echo ""

# 8. 重新载入 Nginx 配置
cd /www/wwwroot/47.99.110.230
./fix_nginx_clean_final.sh > /dev/null 2>&1 || true

# 9. 立即执行端到端全量硬核验证
./e2e_verify_etherpad_active.sh
