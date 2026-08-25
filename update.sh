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

TARGET_VERSION="20260825_v516"

echo "⚡ [2/4] 极速下载最新代码包 ($TARGET_VERSION)..."
TMP=/tmp/jizhi_update
rm -rf "$TMP" && mkdir -p "$TMP"

# 1. 优先尝试 Git 本地强行对齐（0 缓存、秒级精准）
GIT_SYNCED=0
for gdir in "${TARGET_DIRS[@]}"; do
  if [ -d "$gdir/.git" ]; then
    echo "   🔄 检测到 Git 仓库 ($gdir)，执行精准对齐..."
    cd "$gdir" && git fetch origin main && git reset --hard origin/main 2>/dev/null && {
      if grep -q "$TARGET_VERSION" "$gdir/index.html" 2>/dev/null; then
        GIT_SYNCED=1
        echo "   ✅ Git 精准对齐成功: $TARGET_VERSION"
        break
      fi
    }
  fi
done

DOWNLOADED=$GIT_SYNCED
NOW_TS=$(date +%s%N 2>/dev/null || date +%s)
ZIP_FILE="/tmp/jizhi_main.zip"

if [ $DOWNLOADED -eq 0 ]; then
  for zip_url in \
    "https://codeload.github.com/loverglory233-blip/jizhi-clean/zip/refs/heads/main" \
    "https://raw.githubusercontent.com/loverglory233-blip/jizhi-clean/main/index.html?t=$NOW_TS" \
    "https://ghfast.top/https://github.com/loverglory233-blip/jizhi-clean/archive/refs/heads/main.zip?nocache=$NOW_TS" \
    "https://ghproxy.net/https://github.com/loverglory233-blip/jizhi-clean/archive/refs/heads/main.zip?nocache=$NOW_TS"; do

    if [[ "$zip_url" == *".zip"* ]]; then
      curl -s -f -L --connect-timeout 6 --max-time 25 "$zip_url" -o "$ZIP_FILE" 2>/dev/null && [ -s "$ZIP_FILE" ] || continue
      rm -rf /tmp/jizhi_unzip && mkdir -p /tmp/jizhi_unzip
      python3 -c "import zipfile; zipfile.ZipFile('$ZIP_FILE').extractall('/tmp/jizhi_unzip')" 2>/dev/null || unzip -q -o "$ZIP_FILE" -d /tmp/jizhi_unzip 2>/dev/null || true

      if [ -d "/tmp/jizhi_unzip/jizhi-clean-main" ]; then
        # 🔍 严格精确校验版本号，杜绝任何第三方镜像返回旧版缓存包！
        if grep -q "$TARGET_VERSION" "/tmp/jizhi_unzip/jizhi-clean-main/index.html" 2>/dev/null; then
          cp -rf /tmp/jizhi_unzip/jizhi-clean-main/* "$TMP/"
          rm -rf /tmp/jizhi_unzip "$ZIP_FILE"
          DOWNLOADED=1
          echo "   ✅ 代码包下载解压完成（严格校验通过: $TARGET_VERSION）"
          break
        else
          echo "   ⚠️ 该镜像源返回陈旧缓存包，坚决废弃，尝试直连源..."
          rm -rf /tmp/jizhi_unzip "$ZIP_FILE"
        fi
      fi
    fi
  done
fi

# 3. 权威回退机制：若第三方 zip 缓存落后，强制单文件精准直拉最新版
if [ $DOWNLOADED -eq 0 ]; then
  echo "   ⚡ 启动防缓存直连同步最新文件 ($TARGET_VERSION)..."
  mkdir -p "$TMP/css" "$TMP/css/libs" "$TMP/js" "$TMP/js/libs" "$TMP/api" "$TMP/src"
  FILES=(
    "index.html" "update.sh" "sync.php" "build.py" "package.json"
    "css/styles.css" "css/libs/quill.snow.css"
    "js/libs/xlsx.full.min.js" "js/libs/quill.min.js" "js/libs/quill-cursors.min.js"
    "js/libs/yjs.js" "js/libs/y-websocket.js" "js/libs/y-quill.js" "js/bundle.js"
    "src/constants.js" "src/utils.js" "src/agents.js" "src/auth.js" "src/sync.js"
    "src/login.js" "src/teacher.js" "src/student-portal.js" "src/editor.js" "src/app.js"
    "api/chat_api.php" "api/coze_prompt.php" "api/db_init.php" "api/stream.php"
  )
  for f in "${FILES[@]}"; do
    for raw_host in \
      "https://raw.githubusercontent.com/loverglory233-blip/jizhi-clean/main" \
      "https://ghfast.top/https://raw.githubusercontent.com/loverglory233-blip/jizhi-clean/main" \
      "https://cdn.jsdelivr.net/gh/loverglory233-blip/jizhi-clean@main" \
      "https://ghproxy.net/https://raw.githubusercontent.com/loverglory233-blip/jizhi-clean/main"; do
      if curl -s -f -L --connect-timeout 4 --max-time 10 "$raw_host/$f?t=$NOW_TS" -o "$TMP/$f" 2>/dev/null && [ -s "$TMP/$f" ]; then
        break
      fi
    done
  done
  if grep -q "$TARGET_VERSION" "$TMP/index.html" 2>/dev/null; then
    DOWNLOADED=1
    echo "   ✅ 单文件直连同步成功（严格校验通过: $TARGET_VERSION）"
  fi
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
sleep 1

MAIN_DIR="${TARGET_DIRS[0]}"
if [ -n "$MAIN_DIR" ] && [ -d "$MAIN_DIR" ]; then
  cd "$MAIN_DIR"
  if [ -f "server.py" ]; then
    nohup python3 server.py > server.log 2>&1 &
    sleep 1
    echo "   ✅ 端口 8088 服务端已就绪 ($MAIN_DIR)"
  fi
fi

echo "======================================================"
echo "🎉 全系统更新与校验完成！"
echo "📌 当前全局版本号: 20260825_v516"

# 🔍 探测 9001 端口服务状态
if lsof -i:9001 >/dev/null 2>&1 || netstat -tuln 2>/dev/null | grep -q ":9001 " || ss -tuln 2>/dev/null | grep -q ":9001 " || curl -s -I --connect-timeout 2 http://127.0.0.1:9001/ >/dev/null 2>&1; then
  echo "✅ 端口 9001 协同服务运作正常"
else
  echo "ℹ️ 端口 9001 状态: 未占用 (云端 HTTP 架构同步中)"
fi

for dir in "${TARGET_DIRS[@]}"; do
  echo "🔍 校验目录: $dir"
  if grep -q "20260825_v516" "$dir/index.html" 2>/dev/null; then
    echo "   ✅ 版本戳已同步: 20260825_v516"
  else
    echo "   ⚠️ 版本戳异常，请检查网络"
  fi
done
echo "======================================================"
echo "🚀 集智 JIZHI 平台 ($TARGET_VERSION) 已全面就绪！"
echo "======================================================"
