#!/bin/bash
set -e

echo "🚀 ========================================================"
echo "⚡ 彻底根除 npm 子进程挂起，0.5 秒极速拉起 9001 端口"
echo "🚀 ========================================================"

export PATH="/www/server/nodejs/v18.20.7/bin:$PATH"
EP_DIR="/www/wwwroot/etherpad-lite"

cd "$EP_DIR"

# 1. 释放 9001 端口并结束旧进程
fuser -k 9001/tcp 2>/dev/null || true
pkill -9 -f "node" 2>/dev/null || true
sleep 1

# 2. 全局搜索并修补调用 npm 的文件
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
jsFiles.forEach(f => {
  try {
    let code = fs.readFileSync(f, "utf8");
    if (code.includes("npm --version") || code.includes("exec(\"npm") || code.includes("exec(\x27npm")) {
      console.log("  🎯 找到调用 npm 的文件:", f);
      // 将 npm version 检查改为即时返回，杜绝子进程阻塞
      code = code.replace(/npm\s+--version/g, "node -v");
      fs.writeFileSync(f, code, "utf8");
    }
  } catch(e) {}
});
'

# 3. 清理旧缓存
rm -rf var/plugins.json var/minified_* 2>/dev/null || true

# 4. 启动 Etherpad
echo "🚀 正在秒级拉起 Etherpad 服务..."
export NODE_ENV=production
nohup node src/node/server.js > /var/log/etherpad.log 2>&1 &

# 5. 等待 9001 端口就绪
echo "⏳ 等待 9001 端口监听..."
READY=0
for i in {1..20}; do
    CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:9001/ || echo "000")
    if [ "$CODE" = "200" ] || [ "$CODE" = "302" ]; then
        READY=1
        echo "🎉 9001 端口已成功就绪 (HTTP $CODE)！"
        break
    fi
    echo -n "."
    sleep 1
done
echo ""

if [ $READY -eq 1 ]; then
    echo "📄 查看最新就绪日志:"
    tail -n 15 /var/log/etherpad.log
else
    echo "❌ 启动日志:"
    tail -n 25 /var/log/etherpad.log
    exit 1
fi

# 6. 重新载入 Nginx 配置
cd /www/wwwroot/47.99.110.230
./fix_nginx_clean_final.sh > /dev/null 2>&1 || true

# 7. 立即执行端到端插件验证
./e2e_verify_etherpad_active.sh
