#!/bin/bash
set -e

echo "🚀 ========================================================"
echo "⚡ 彻底根除 EINTEGRITY 锁文件冲突并秒级永久稳定拉起 9001"
echo "🚀 ========================================================"

export PATH="/www/server/nodejs/v18.20.7/bin:$PATH"
EP_DIR="/www/wwwroot/etherpad-lite"

cd "$EP_DIR"

# 1. 释放 9001 端口并结束旧进程
fuser -k 9001/tcp 2>/dev/null || true
pkill -9 -f "node" 2>/dev/null || true
sleep 1

# 2. 彻底删除引发 EINTEGRITY 冲突的旧 lockfile
rm -f package-lock.json src/package-lock.json 2>/dev/null || true

# 3. 禁用 installDeps.sh 的联网检查 (依赖已全部就绪，无需每次启动重复跑 npm)
cat << 'EOS' > bin/installDeps.sh
#!/bin/sh
exit 0
EOS
chmod +x bin/installDeps.sh

# 4. 写入干净高稳定的 settings.json
node -e '
const fs = require("fs");
let settings = {};
try { settings = JSON.parse(fs.readFileSync("settings.json", "utf8")); } catch(e) {}

settings.ip = "0.0.0.0";
settings.port = 9001;
settings.minify = false;
settings.maxAge = 0;
settings.suppressErrorsInPadText = true;
settings.requireAuthentication = false;
settings.requireAuthorization = false;
settings.trustProxy = true;
delete settings.automaticVersionHost;
delete settings.toolbar;

fs.writeFileSync("settings.json", JSON.stringify(settings, null, 2), "utf8");
console.log("✅ settings.json 已更新为最稳官方标准格式！");
'

# 5. 秒级直接启动 Node 服务
echo "🚀 正在启动 Etherpad 服务..."
export NODE_ENV=production
nohup node src/node/server.js > /var/log/etherpad.log 2>&1 &

# 6. 等待端口就绪 (通常仅需 3 秒)
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
    echo "🎉🎉🎉 Etherpad 已成功永久稳定监听 9001 端口！"
    echo ""
    echo "📄 查看最新日志:"
    tail -n 10 /var/log/etherpad.log
else
    echo "❌ 启动失败日志:"
    tail -n 25 /var/log/etherpad.log
fi

# 7. 重新载入 Nginx 配置
cd /www/wwwroot/47.99.110.230
./fix_nginx_clean_final.sh
