#!/bin/bash
set -e

echo "🚀 ========================================================"
echo "🛠️ 正在以 root 权限启动 Etherpad 官方守护进程..."
echo "🚀 ========================================================"

export PATH="/www/server/nodejs/v18.20.7/bin:$PATH"
BASE_DIR="/www/wwwroot"
EP_DIR="$BASE_DIR/etherpad-lite"

cd "$EP_DIR"

# 1. 释放 9001 端口
echo "🛑 1. 释放 9001 端口..."
fuser -k 9001/tcp 2>/dev/null || true
sleep 1

# 2. 启动 Etherpad (携带 --root 授权参数)
echo "🚀 2. 正在启动 Etherpad 服务进程 (授权 root 运行)..."
nohup ./bin/run.sh --root > /var/log/etherpad.log 2>&1 &

sleep 6

# 3. 验证 9001 端口
if curl -s -I http://127.0.0.1:9001/ | grep -E "200|302|HTTP" > /dev/null; then
    echo ""
    echo "🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉"
    echo "🎉 恭喜！Etherpad 已经 100% 满血复活并成功监听 9001 端口！"
    echo "🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉"
else
    echo "📄 查看启动日志:"
    tail -n 25 /var/log/etherpad.log || true
fi

# 4. 重新载入 Nginx 配置
cd /www/wwwroot/47.99.110.230
./fix_nginx_clean_final.sh
