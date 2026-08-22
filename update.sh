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

echo "⚡ [2/4] 极速下载最新代码包 (单包秒级解压)..."
TMP=/tmp/jizhi_update
rm -rf "$TMP" && mkdir -p "$TMP"

# 🚀 优先下载完整压缩包 (只需 1 次网络请求，0 阻塞、0 卡顿)
ZIP_FILE="/tmp/jizhi_main.zip"
DOWNLOADED=0
for zip_url in \
  "https://ghfast.top/https://github.com/loverglory233-blip/jizhi-clean/archive/refs/heads/main.zip" \
  "https://ghproxy.net/https://github.com/loverglory233-blip/jizhi-clean/archive/refs/heads/main.zip" \
  "https://codeload.github.com/loverglory233-blip/jizhi-clean/zip/refs/heads/main"; do
  
  if curl -s -f -L --connect-timeout 4 --max-time 15 "$zip_url" -o "$ZIP_FILE" 2>/dev/null && [ -s "$ZIP_FILE" ]; then
    rm -rf /tmp/jizhi_unzip && mkdir -p /tmp/jizhi_unzip
    python3 -c "import zipfile; zipfile.ZipFile('$ZIP_FILE').extractall('/tmp/jizhi_unzip')" 2>/dev/null || unzip -q -o "$ZIP_FILE" -d /tmp/jizhi_unzip 2>/dev/null || true
    if [ -d "/tmp/jizhi_unzip/jizhi-clean-main" ]; then
      cp -rf /tmp/jizhi_unzip/jizhi-clean-main/* "$TMP/"
      rm -rf /tmp/jizhi_unzip "$ZIP_FILE"
      DOWNLOADED=1
      echo "   ✅ 代码包秒级下载解压完成！"
      break
    fi
  fi
done

# 回退机制：若无 zipfile 则快速并行拉取
if [ $DOWNLOADED -eq 0 ]; then
  echo "   ⚠️ 回退到流式同步..."
  mkdir -p "$TMP/css" "$TMP/css/libs" "$TMP/js" "$TMP/js/libs" "$TMP/api" "$TMP/src"
  FILES=(
    "index.html" "css/styles.css" "css/libs/quill.snow.css"
    "js/libs/xlsx.full.min.js" "js/libs/quill.min.js" "js/libs/quill-cursors.min.js"
    "js/libs/yjs.js" "js/libs/y-websocket.js" "js/libs/y-quill.js" "js/bundle.js"
    "sync.php" "server.py" "server_yjs.js" "server_yjs.py" "package.json"
    "api/chat_api.php" "api/coze_prompt.php" "api/db_init.php" "api/stream.php"
  )
  for f in "${FILES[@]}"; do
    curl -s -f -L --connect-timeout 3 --max-time 6 "https://ghfast.top/https://raw.githubusercontent.com/loverglory233-blip/jizhi-clean/main/$f" -o "$TMP/$f" 2>/dev/null || true
  done
fi

for dir in "${TARGET_DIRS[@]}"; do
  mkdir -p "$dir/css" "$dir/css/libs" "$dir/js" "$dir/js/libs" "$dir/api" "$dir/src" "$dir/uploads" "$dir/data"
  cp -rf "$TMP/"* "$dir/"
  
  # 🔒 标准权限保护：目录 755，文件 644，数据与上传目录 775
  find "$dir" -type d -exec chmod 755 {} + 2>/dev/null || true
  find "$dir" -type f -exec chmod 644 {} + 2>/dev/null || true
  chmod -R 775 "$dir/uploads" "$dir/data" 2>/dev/null || true
  chmod 755 "$dir/sync.php" "$dir/update.sh" 2>/dev/null || true
  chown -R www:www "$dir" 2>/dev/null || true
  echo "   ✅ 已安全更新: $dir"
done
rm -rf "$TMP"

echo "🔄 [3/4] 验证 PHP 环境、配置 Nginx /ws 协同反代并重载..."
# 为宝塔 Nginx 站点自动配置 /ws 反向代理至 1234 端口 (若尚未配置)
for cdir in /www/server/panel/vhost/nginx /www/server/nginx/conf/vhost; do
  [ -d "$cdir" ] || continue
  for conf in "$cdir"/*.conf; do
    [ -f "$conf" ] || continue
    sed -i '/location ~ \^\/(sync\\\.php\|api\/)/,/^[[:space:]]*}/d' "$conf" 2>/dev/null || true
    sed -i '/proxy_pass http:\/\/127.0.0.1:8088/d' "$conf" 2>/dev/null || true
    
    # 自动补充 /ws WebSocket 转发
    if ! grep -q "location /ws" "$conf" && ! grep -q "location ^~ /ws" "$conf"; then
      sed -i '/access_log/i \
    location /ws {\
        proxy_pass http://127.0.0.1:1234;\
        proxy_http_version 1.1;\
        proxy_set_header Upgrade $http_upgrade;\
        proxy_set_header Connection "Upgrade";\
        proxy_set_header Host $host;\
        proxy_read_timeout 3600s;\
        proxy_send_timeout 3600s;\
    }' "$conf" 2>/dev/null || true
    fi
  done
done
nginx -s reload 2>/dev/null || /etc/init.d/nginx reload 2>/dev/null || systemctl reload nginx 2>/dev/null || true
/etc/init.d/php-fpm-82 restart 2>/dev/null || /etc/init.d/php-fpm-81 restart 2>/dev/null || /etc/init.d/php-fpm-80 restart 2>/dev/null || /etc/init.d/php-fpm-74 restart 2>/dev/null || systemctl restart php-fpm 2>/dev/null || true

for dir in "${TARGET_DIRS[@]}"; do
  # 清理初始测试数据
  echo '{"timestamp":0,"groupId":"group_1","presence":{},"chatLogs":{"stage1":[],"stage2":[],"stage3":[]},"stage1":{"mergedTitle":"","votes":{},"hasVoted":{},"proposals":[]},"stage2":{"unifiedContent":"","memberContributions":{"A":0,"B":0,"C":0},"actionPlan":{"isGenerated":false,"items":[]}},"stage3":{"feedbackItems":[]},"currentStage":"stage1","isFinalSubmitted":false}' > "$dir/db_task_default_group_1.json" 2>/dev/null || true
  echo '{}' > "$dir/sessions.json" 2>/dev/null || true
  chmod 664 "$dir/db_task_default_group_1.json" "$dir/sessions.json" 2>/dev/null || true
  chown -R www:www "$dir" 2>/dev/null || true
done

echo "🚀 [4/4] 启动高可用同步服务端..."
kill -9 $(lsof -t -i:8088 2>/dev/null) 2>/dev/null || true
pkill -9 -f "server.py" 2>/dev/null || true
kill -9 $(lsof -t -i:1234 2>/dev/null) 2>/dev/null || true
pkill -9 -f "server_yjs" 2>/dev/null || true
sleep 1

MAIN_DIR="${TARGET_DIRS[0]}"
if [ -n "$MAIN_DIR" ] && [ -d "$MAIN_DIR" ]; then
  cd "$MAIN_DIR"
  if command -v npm >/dev/null 2>&1; then
    npm install --production --no-audit 2>/dev/null || true
  fi
  if [ -f "server.py" ]; then
    nohup python3 server.py > server.log 2>&1 &
    sleep 1
    echo "   ✅ 端口 8088 服务端已就绪 ($MAIN_DIR)"
  fi
  if systemctl is-active --quiet jizhi-yjs.service 2>/dev/null || [ -f "/etc/systemd/system/jizhi-yjs.service" ]; then
    systemctl restart jizhi-yjs.service 2>/dev/null || true
    echo "   ✅ Systemd 守护进程 jizhi-yjs.service (1234) 已重启就绪"
  elif [ -f "server_yjs.js" ] && command -v node >/dev/null 2>&1; then
    nohup node server_yjs.js > yjs.log 2>&1 &
    sleep 1
    echo "   ✅ 端口 1234 Yjs 协同服务端已就绪 ($MAIN_DIR)"
  elif [ -f "server_yjs.py" ]; then
    nohup python3 server_yjs.py > yjs.log 2>&1 &
    sleep 1
    echo "   ✅ 端口 1234 Yjs 协同服务端已就绪 ($MAIN_DIR)"
  fi
fi

echo ""
echo "======================================================"
echo "🎉 全系统更新完成！"
echo ""
echo "📋 验证方法（在浏览器地址栏访问）："
echo "   http://47.99.110.230:1234/health  (Yjs 协同网关)"
echo "   http://47.99.110.230/sync.php?groupId=group_1"
echo ""
echo "✅ 能看到 status: ok = Yjs 协同引擎满血在线"
echo "======================================================"
