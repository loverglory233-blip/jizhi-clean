#!/bin/bash
# ==============================================================================
# 集智平台极速镜像同步与更新脚本 (解决国内服务器 GitHub 连接超时/失败问题)
# ==============================================================================

echo "🔍 [1/3] 正在定位项目路径..."
WORK_DIR=""
if [ -d "/root/jizhi-clean" ]; then
    WORK_DIR="/root/jizhi-clean"
elif [ -d "/www/wwwroot/jizhi-clean" ]; then
    WORK_DIR="/www/wwwroot/jizhi-clean"
elif [ -d "/www/wwwroot" ]; then
    # 查找包含 server.py 或 bundle.js 的目录
    FOUND=$(find /www/wwwroot -name "bundle.js" 2>/dev/null | head -n 1)
    if [ -n "$FOUND" ]; then
        WORK_DIR=$(dirname $(dirname "$FOUND"))
    fi
fi

if [ -z "$WORK_DIR" ]; then
    WORK_DIR="/root/jizhi-clean"
    mkdir -p "$WORK_DIR/css" "$WORK_DIR/js"
fi

echo "📁 工作目录: $WORK_DIR"
cd "$WORK_DIR"

echo "⚡ [2/3] 正在从高速镜像下载最新蓝白极简主题与学术编辑器代码..."
mkdir -p css js

# 使用高速镜像下载
curl -s -L "https://ghfast.top/https://raw.githubusercontent.com/loverglory233-blip/jizhi-clean/main/index.html" -o index.html || \
curl -s -L "https://raw.gitmirror.com/loverglory233-blip/jizhi-clean/main/index.html" -o index.html

curl -s -L "https://ghfast.top/https://raw.githubusercontent.com/loverglory233-blip/jizhi-clean/main/css/styles.css" -o css/styles.css || \
curl -s -L "https://raw.gitmirror.com/loverglory233-blip/jizhi-clean/main/css/styles.css" -o css/styles.css

curl -s -L "https://ghfast.top/https://raw.githubusercontent.com/loverglory233-blip/jizhi-clean/main/js/bundle.js" -o js/bundle.js || \
curl -s -L "https://raw.gitmirror.com/loverglory233-blip/jizhi-clean/main/js/bundle.js" -o js/bundle.js

curl -s -L "https://ghfast.top/https://raw.githubusercontent.com/loverglory233-blip/jizhi-clean/main/server.py" -o server.py || \
curl -s -L "https://raw.gitmirror.com/loverglory233-blip/jizhi-clean/main/server.py" -o server.py

echo "🔄 [3/3] 正在重启后台服务..."
kill -9 $(lsof -t -i:8088) 2>/dev/null || true
pkill -9 -f "python3 server.py" 2>/dev/null || true
sleep 1
nohup python3 server.py > server.log 2>&1 &

echo "======================================================"
echo "🎉 更新完成！最新代码已成功载入！"
echo "👉 请按 Ctrl+F5 强制刷新浏览器查看蓝白学术极简界面"
echo "======================================================"
