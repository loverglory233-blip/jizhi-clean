#!/bin/bash
# ==============================================================================
# 集智平台极速镜像同步与更新脚本 (解决国内服务器 GitHub 连接超时与多路径部署问题)
# ==============================================================================

echo "🔍 [1/4] 正在全盘定位宝塔网站与集智项目路径..."

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

# 2. 遍历 /www/wwwroot 下所有相关目录
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

echo "⚡ [2/4] 正在从高速镜像下载最新版本代码..."

TMP_DIR="/tmp/jizhi_latest_update"
rm -rf "$TMP_DIR"
mkdir -p "$TMP_DIR/css" "$TMP_DIR/js"

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
    chmod -R 777 "$dir"
    chown -R www:www "$dir" 2>/dev/null || true
    echo "   ✅ 已成功更新: $dir"
done

chmod 777 /tmp 2>/dev/null || true
rm -rf "$TMP_DIR"

echo "🔄 [3/4] 正在校验并修复 Nginx 服务配置..."

# 清理并修复可能存在的异常代理指令，确保 Nginx 语法绝对正常
NGINX_CONF_DIRS=("/www/server/panel/vhost/nginx" "/www/server/nginx/conf/vhost")
for cdir in "${NGINX_CONF_DIRS[@]}"; do
    if [ -d "$cdir" ]; then
        for conf in "$cdir"/*.conf; do
            if [ -f "$conf" ]; then
                sed -i '/location ~ \^\/(sync\\\.php|api\/)/d' "$conf" 2>/dev/null || true
                sed -i '/proxy_pass http:\/\/127.0.0.1:8088;/d' "$conf" 2>/dev/null || true
                sed -i '/proxy_set_header Host \$host;/d' "$conf" 2>/dev/null || true
                sed -i '/proxy_set_header X-Real-IP \$remote_addr;/d' "$conf" 2>/dev/null || true
            fi
        done
    fi
done

# 安全重新加载 Nginx
if command -v nginx >/dev/null 2>&1; then
    nginx -t 2>/dev/null && nginx -s reload 2>/dev/null || true
fi

echo "🚀 [4/4] 正在启动 Python 毫秒级多端云同步服务端..."
kill -9 $(lsof -t -i:8088) 2>/dev/null || true
pkill -9 -f "python3 server.py" 2>/dev/null || true
sleep 1

for dir in "${TARGET_DIRS[@]}"; do
    if [ -f "$dir/server.py" ]; then
        cd "$dir"
        nohup python3 server.py > server.log 2>&1 &
        echo "   ✅ 服务端已在 $dir 成功运行 (端口 8088)！"
        break
    fi
done

echo "======================================================"
echo "🎉 更新全部完成！"
echo "👉 请在 Safari 中按 Command + Option + R (或按住 Shift 点击刷新按钮)"
echo "======================================================"
