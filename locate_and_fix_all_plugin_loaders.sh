#!/bin/bash
set -e

echo "🚀 ========================================================"
echo "⚡ 精准定位 Etherpad 内核插件加载文件并彻底挂载 13 个插件"
echo "🚀 ========================================================"

export PATH="/www/server/nodejs/v18.20.7/bin:$PATH"
EP_DIR="/www/wwwroot/etherpad-lite"

cd "$EP_DIR"

# 1. 释放 9001 端口并结束旧进程
fuser -k 9001/tcp 2>/dev/null || true
pkill -9 -f "node" 2>/dev/null || true
sleep 1

# 2. 全量递归搜索包含 "Loading plugin" 或 "Loaded %d plugins" 或 "Installed plugins" 的核心源码
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

const jsFiles = walk("src");
console.log("🔍 扫描到 " + jsFiles.length + " 个源码文件，正在定位插件加载核心...");

const matchedFiles = [];
jsFiles.forEach(f => {
  try {
    const code = fs.readFileSync(f, "utf8");
    if (code.includes("Loading plugin") || code.includes("Installed plugins:") || code.includes("plugin-definitions.json")) {
      console.log("  🎯 命中插件核心文件:", f);
      matchedFiles.push(f);
    }
  } catch(e) {}
});

// 获取所有已安装的 ep_ 插件
const nm = path.resolve("node_modules");
const allPlugins = fs.existsSync(nm) ? fs.readdirSync(nm).filter(d => d.startsWith("ep_") && d !== "ep_etherpad-lite") : [];
console.log("📦 待挂载插件总数 (" + allPlugins.length + " 个):", allPlugins.join(", "));

// 深度修补命中的核心文件中的 getPlugins / getPackages
matchedFiles.forEach(f => {
  let code = fs.readFileSync(f, "utf8");
  let modified = false;

  // 1. 如果包含 getPackages
  if (code.includes("exports.getPackages") || code.includes("getPackages =")) {
    console.log("  ✏️ 正在重构 " + f + " 中的 getPackages...");
    const directGetPkgs = `
exports.getPackages = async () => {
  const nmPath = path.resolve(__dirname, "${path.relative(path.dirname(f), nm)}");
  const pkgs = {
    "ep_etherpad-lite": {
      name: "ep_etherpad-lite",
      version: "1.9.7",
      path: path.resolve(__dirname, "${path.relative(path.dirname(f), path.resolve("src"))}")
    }
  };
  try {
    if (fs.existsSync(nmPath)) {
      const dirs = fs.readdirSync(nmPath);
      dirs.forEach(d => {
        if (d.startsWith("ep_") && d !== "ep_etherpad-lite") {
          const pDir = path.join(nmPath, d);
          let pkg = { name: d, version: "1.0.0" };
          try { pkg = JSON.parse(fs.readFileSync(path.join(pDir, "package.json"), "utf8")); } catch(e) {}
          pkgs[d] = {
            name: d,
            version: pkg.version || "1.0.0",
            path: pDir
          };
        }
      });
    }
  } catch(e) { console.error(e); }
  return pkgs;
};
`;
    // 注入替换
    code = code.replace(/exports\.getPackages\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{[\s\S]*?\n\};/, directGetPkgs);
    modified = true;
  }

  // 2. 如果包含 getPlugins
  if (code.includes("exports.getPlugins") || code.includes("getPlugins =")) {
    console.log("  ✏️ 正在重构 " + f + " 中的 getPlugins...");
    const directGetPlugins = `
exports.getPlugins = async () => {
  const nmPath = path.resolve(__dirname, "${path.relative(path.dirname(f), nm)}");
  const plugins = {
    "ep_etherpad-lite": {
      package: { name: "ep_etherpad-lite", version: "1.9.7" },
      realPath: path.resolve(__dirname, "${path.relative(path.dirname(f), path.resolve("src"))}")
    }
  };
  try {
    if (fs.existsSync(nmPath)) {
      const dirs = fs.readdirSync(nmPath);
      dirs.forEach(d => {
        if (d.startsWith("ep_") && d !== "ep_etherpad-lite") {
          const pDir = path.join(nmPath, d);
          let pkg = { name: d, version: "1.0.0" };
          try { pkg = JSON.parse(fs.readFileSync(path.join(pDir, "package.json"), "utf8")); } catch(e) {}
          plugins[d] = {
            package: pkg,
            realPath: pDir
          };
        }
      });
    }
  } catch(e) { console.error(e); }
  return plugins;
};
`;
    code = code.replace(/exports\.getPlugins\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{[\s\S]*?\n\};/, directGetPlugins);
    modified = true;
  }

  if (modified) {
    fs.writeFileSync(f, code, "utf8");
    console.log("  ✅ 已成功写入修补代码: " + f);
  }
});
'

# 3. 清理旧缓存
rm -rf var/plugins.json var/minified_* 2>/dev/null || true

# 4. 启动 Etherpad
echo "🚀 正在启动 Etherpad 服务..."
export NODE_ENV=production
nohup node src/node/server.js > /var/log/etherpad.log 2>&1 &

# 5. 等待端口就绪
echo "⏳ 等待 9001 端口启动..."
for i in {1..20}; do
    if curl -s -I http://127.0.0.1:9001/ 2>/dev/null | grep -E "200|302|HTTP" > /dev/null; then
        break
    fi
    echo -n "..."
    sleep 1
done
echo ""

echo "📄 查看 Etherpad 启动日志中加载的插件列表:"
tail -n 25 /var/log/etherpad.log

# 6. 重新载入 Nginx 配置
cd /www/wwwroot/47.99.110.230
./fix_nginx_clean_final.sh
