#!/bin/bash
# ==============================================================================
# 集智平台极速镜像同步与更新脚本 (解决国内服务器 GitHub 连接超时与多路径部署问题)
# ==============================================================================

echo "🔍 [1/3] 正在全盘定位宝塔网站与集智项目路径..."

TARGET_DIRS=()

# 1. 检查宝塔标准网站目录
if [ -d "/www/wwwroot/47.99.110.230" ]; then
    TARGET_DIRS+=("/www/wwwroot/47.99.110.230")
fi
if [ -d "/www/wwwroot/jizhi-clean" ]; then
    TARGET_DIRS+=("/www/wwwroot/jizhi-clean")
fi
if [ -d "/root/jizhi-clean" ]; then
    TARGET_DIRS+=("/root/jizhi-clean")
fi

# 2. 遍历 /www/wwwroot 下所有包含 bundle.js 或 index.html 的目录
if [ -d "/www/wwwroot" ]; then
    for d in /www/wwwroot/*; do
        if [ -d "$d" ]; then
            if [ -f "$d/index.html" ] || [ -f "$d/js/bundle.js" ] || [ -f "$d/server.py" ]; then
                TARGET_DIRS+=("$d")
            fi
        fi
    done
fi

# 去重
TARGET_DIRS=($(printf "%s\n" "${TARGET_DIRS[@]}" | sort -u))

if [ ${#TARGET_DIRS[@]} -eq 0 ]; then
    TARGET_DIRS+=("/www/wwwroot/47.99.110.230" "/root/jizhi-clean")
fi

echo "📁 找到待更新的目标目录 (${#TARGET_DIRS[@]} 个):"
for dir in "${TARGET_DIRS[@]}"; do
    echo "   - $dir"
done

echo "⚡ [2/3] 正在从高速镜像下载最新蓝白极简主题与学术编辑器代码..."

TMP_DIR="/tmp/jizhi_latest_update"
rm -rf "$TMP_DIR"
mkdir -p "$TMP_DIR/css" "$TMP_DIR/js"

# 下载到临时目录
download_file() {
    local url1="https://ghfast.top/https://raw.githubusercontent.com/loverglory233-blip/jizhi-clean/main/$1"
    local url2="https://raw.gitmirror.com/loverglory233-blip/jizhi-clean/main/$1"
    local dest="$TMP_DIR/$1"
    curl -s -L "$url1" -o "$dest" || curl -s -L "$url2" -o "$dest"
}

download_file "index.html"
download_file "css/styles.css"
download_file "js/bundle.js"
download_file "sync.php"
download_file "server.py"

# 同步到所有目标目录
for dir in "${TARGET_DIRS[@]}"; do
    mkdir -p "$dir/css" "$dir/js"
    cp -rf "$TMP_DIR/"* "$dir/"
    chmod -R 755 "$dir"
    echo "   ✅ 已成功更新: $dir"
done

rm -rf "$TMP_DIR"

echo "🔄 [3/3] 正在重启后台服务与清理缓存..."
kill -9 $(lsof -t -i:8088) 2>/dev/null || true
pkill -9 -f "python3 server.py" 2>/dev/null || true
sleep 1

# 如果存在 server.py 则后台启动
for dir in "${TARGET_DIRS[@]}"; do
    if [ -f "$dir/server.py" ]; then
        cd "$dir"
        nohup python3 server.py > server.log 2>&1 &
        break
    fi
done

echo "======================================================"
echo "🎉 更新全部完成！最新代码已成功同步写入所有网站目录！"
echo "👉 请按 Ctrl+F5 (或 command+shift+R) 强制刷新浏览器"
echo "======================================================"
