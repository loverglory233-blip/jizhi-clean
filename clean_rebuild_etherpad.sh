#!/bin/bash
set -e

echo "🚀 ========================================================"
echo "🛠️ 正在执行 Etherpad 物理级纯净重置 (保留全部历史协同数据)"
echo "🚀 ========================================================"

export PATH="/www/server/nodejs/v18.20.7/bin:$PATH"
BASE_DIR="/www/wwwroot"
EP_DIR="$BASE_DIR/etherpad-lite"

# 1. 彻底停止旧进程与释放 9001 端口
echo "🛑 1. 释放 9001 端口..."
fuser -k 9001/tcp 2>/dev/null || true
pkill -9 -f "server.js" 2>/dev/null || true
sleep 1

# 2. 备份原有的协同数据库与配置文件
echo "💾 2. 备份已有历史正文数据与配置..."
mkdir -p /tmp/ep_backup_2026
if [ -f "$EP_DIR/var/dirty.db" ]; then
    cp -f "$EP_DIR/var/dirty.db" /tmp/ep_backup_2026/dirty.db
    echo "   ✅ 成功备份 dirty.db 协同数据库"
fi
if [ -f "$EP_DIR/settings.json" ]; then
    cp -f "$EP_DIR/settings.json" /tmp/ep_backup_2026/settings.json
fi
if [ -f "$EP_DIR/APIKEY.txt" ]; then
    cp -f "$EP_DIR/APIKEY.txt" /tmp/ep_backup_2026/APIKEY.txt
fi

# 3. 移走污染的旧目录
mv "$EP_DIR" "$BASE_DIR/etherpad-lite-broken-$(date +%s)" 2>/dev/null || rm -rf "$EP_DIR"

# 4. 极速拉取官方最稳定纯净原装版本
echo "📥 3. 正在拉取官方纯净原装 Etherpad 引擎..."
cd "$BASE_DIR"
git clone --depth 1 https://ghfast.top/https://github.com/ether/etherpad-lite.git etherpad-lite

cd "$EP_DIR"

# 5. 还原历史数据与配置
mkdir -p "$EP_DIR/var"
if [ -f /tmp/ep_backup_2026/dirty.db ]; then
    cp -f /tmp/ep_backup_2026/dirty.db "$EP_DIR/var/dirty.db"
    echo "   ✅ 历史正文数据已完整回填！"
fi
if [ -f /tmp/ep_backup_2026/settings.json ]; then
    cp -f /tmp/ep_backup_2026/settings.json "$EP_DIR/settings.json"
fi
if [ -f /tmp/ep_backup_2026/APIKEY.txt ]; then
    cp -f /tmp/ep_backup_2026/APIKEY.txt "$EP_DIR/APIKEY.txt"
fi

# 6. 配置极速镜像并安装原装依赖
echo "📦 4. 正在初始化官方原装依赖 (淘宝镜像)..."
npm config set registry https://registry.npmmirror.com
chmod +x bin/*.sh

# 运行官方初始化脚本
./bin/installDeps.sh

# 7. 启动官方守护进程
echo "🚀 5. 正在启动官方 Etherpad 服务..."
nohup ./bin/run.sh > /var/log/etherpad.log 2>&1 &

sleep 6

# 8. 验证 9001 端口
if curl -s -I http://127.0.0.1:9001/ | grep -E "200|302|HTTP" > /dev/null; then
    echo ""
    echo "🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉"
    echo "🎉 恭喜！Etherpad 官方纯净内核已 100% 满血复活！(9001 端口已成功监听)"
    echo "🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉"
else
    echo "📄 查看启动日志:"
    tail -n 25 /var/log/etherpad.log || true
fi

# 9. 重新载入 Nginx 配置
cd /www/wwwroot/47.99.110.230
./fix_nginx_clean_final.sh
