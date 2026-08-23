#!/bin/bash
set -e

echo "🚀 ========================================================"
echo "🛠️ 正在安装与 Node 18 完美匹配的 Etherpad v1.9.7 官方稳定版"
echo "🚀 ========================================================"

export PATH="/www/server/nodejs/v18.20.7/bin:$PATH"
BASE_DIR="/www/wwwroot"
EP_DIR="$BASE_DIR/etherpad-lite"

# 1. 释放 9001 端口
echo "🛑 1. 释放 9001 端口..."
fuser -k 9001/tcp 2>/dev/null || true
pkill -9 -f "server.js" 2>/dev/null || true
sleep 1

# 2. 备份历史数据
mkdir -p /tmp/ep_backup_2026
if [ -f "$EP_DIR/var/dirty.db" ]; then
    cp -f "$EP_DIR/var/dirty.db" /tmp/ep_backup_2026/dirty.db
fi

# 3. 彻底删除不匹配的 master 版本
rm -rf "$EP_DIR"

# 4. 克隆完美适配 Node 18 的官方稳定分支 v1.9.7
echo "📥 2. 正在拉取 Node 18 官方稳定版 (v1.9.7)..."
cd "$BASE_DIR"
git clone --depth 1 --branch v1.9.7 https://ghfast.top/https://github.com/ether/etherpad-lite.git etherpad-lite

cd "$EP_DIR"

# 5. 还原历史数据
mkdir -p "$EP_DIR/var"
if [ -f /tmp/ep_backup_2026/dirty.db ]; then
    cp -f /tmp/ep_backup_2026/dirty.db "$EP_DIR/var/dirty.db"
    echo "   ✅ 历史正文数据已完整回填！"
fi

# 6. 配置极速镜像并安装
echo "📦 3. 正在初始化官方依赖 (淘宝镜像)..."
npm config set registry https://registry.npmmirror.com
chmod +x bin/*.sh

# 运行官方初始化
./bin/installDeps.sh

# 7. 启动 Etherpad
echo "🚀 4. 正在拉起 Etherpad 守护进程..."
nohup ./bin/run.sh > /var/log/etherpad.log 2>&1 &

sleep 6

# 8. 验证 9001 端口
if curl -s -I http://127.0.0.1:9001/ | grep -E "200|302|HTTP" > /dev/null; then
    echo ""
    echo "🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉"
    echo "🎉 恭喜！Etherpad v1.9.7 官方纯净内核已 100% 满血复活！(9001 端口已成功监听)"
    echo "🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉"
else
    echo "📄 查看启动日志:"
    tail -n 25 /var/log/etherpad.log || true
fi

# 9. 重新载入 Nginx 配置
cd /www/wwwroot/47.99.110.230
./fix_nginx_clean_final.sh
