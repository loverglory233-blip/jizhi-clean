#!/bin/bash
# ==============================================================================
# 集智平台一键更新脚本 - 恢复正常同步
# ==============================================================================

echo "🔍 [1/4] 定位网站目录..."

TARGET_DIRS=()
for d in /www/wwwroot/*; do
  if [ -d "$d" ] && { [ -f "$d/index.html" ] || [ -f "$d/server.py" ]; }; then
    TARGET_DIRS+=("$d")
  fi
done
[ -d "/root/jizhi-clean" ] && TARGET_DIRS+=("/root/jizhi-clean")
TARGET_DIRS=($(printf "%s\n" "${TARGET_DIRS[@]}" | sort -u))
[ ${#TARGET_DIRS[@]} -eq 0 ] && TARGET_DIRS+=("/www/wwwroot/47.99.110.230")

echo "📁 目标目录: ${TARGET_DIRS[*]}"

echo "⚡ [2/4] 下载最新代码..."
TMP=/tmp/jizhi_update
rm -rf "$TMP" && mkdir -p "$TMP/css" "$TMP/js"

dl() {
  local f=$1
  curl -s -L "https://ghfast.top/https://raw.githubusercontent.com/loverglory233-blip/jizhi-clean/main/$f" -o "$TMP/$f" \
  || curl -s -L "https://raw.gitmirror.com/loverglory233-blip/jizhi-clean/main/$f" -o "$TMP/$f"
}

dl index.html
dl css/styles.css
dl js/bundle.js
dl sync.php
dl server.py

for dir in "${TARGET_DIRS[@]}"; do
  mkdir -p "$dir/css" "$dir/js"
  cp -rf "$TMP/"* "$dir/"
  chmod -R 755 "$dir"
  chown -R www:www "$dir" 2>/dev/null || true
  echo "   ✅ 已更新: $dir"
done
rm -rf "$TMP"

echo "🔄 [3/4] 配置 Nginx 反向代理 (80端口 -> Python 8088)..."

PROXY_BLOCK='
    location ~ ^/(sync\.php|api/) {
        proxy_pass http://127.0.0.1:8088;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_connect_timeout 5s;
        proxy_read_timeout 30s;
    }'

for cdir in /www/server/panel/vhost/nginx /www/server/nginx/conf/vhost; do
  [ -d "$cdir" ] || continue
  for conf in "$cdir"/*.conf; do
    [ -f "$conf" ] || continue
    # 清理旧的代理规则（防止重复）
    sed -i '/location ~ \^\/(sync\\\.php\|api\/)/,/^[[:space:]]*}/d' "$conf" 2>/dev/null || true
    sed -i '/proxy_pass http:\/\/127.0.0.1:8088/d' "$conf" 2>/dev/null || true
    # 在第一个 location 块前插入代理规则
    if grep -q "location /" "$conf" && ! grep -q "127.0.0.1:8088" "$conf"; then
      sed -i "s|location /|$PROXY_BLOCK\n    location /|" "$conf" 2>/dev/null || true
      echo "   ✅ 已注入代理规则: $conf"
    fi
  done
done

# 重载 Nginx
if nginx -t 2>/dev/null; then
  nginx -s reload 2>/dev/null && echo "   ✅ Nginx 重载成功"
else
  echo "   ⚠️  Nginx 配置有误，跳过代理注入，使用纯 8088 端口模式"
fi

echo "🚀 [4/4] 启动同步服务端 (端口 8088)..."
kill -9 $(lsof -t -i:8088 2>/dev/null) 2>/dev/null || true
pkill -9 -f "server.py" 2>/dev/null || true
sleep 1

for dir in "${TARGET_DIRS[@]}"; do
  if [ -f "$dir/server.py" ]; then
    cd "$dir"
    nohup python3 server.py > server.log 2>&1 &
    sleep 1
    if lsof -i:8088 >/dev/null 2>&1; then
      echo "   ✅ 同步服务端已启动 ($dir, 端口 8088)"
    else
      echo "   ❌ 服务端启动失败，请检查 server.log"
    fi
    break
  fi
done

echo ""
echo "======================================================"
echo "🎉 更新完成！"
echo ""
echo "📋 同步验证方法（任选一条在浏览器地址栏访问）："
echo "   http://47.99.110.230/sync.php?groupId=group_1"
echo "   http://47.99.110.230:8088/sync.php?groupId=group_1"
echo ""
echo "✅ 能看到 JSON 数据 = 同步正常"
echo "======================================================"
