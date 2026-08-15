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

echo "🔄 [3/4] 验证 PHP 环境与数据文件权限..."
for dir in "${TARGET_DIRS[@]}"; do
  touch "$dir/db_task_default_group_1.json" "$dir/sessions.json" 2>/dev/null || true
  chmod 777 "$dir/db_task_default_group_1.json" "$dir/sessions.json" "$dir/sync.php" 2>/dev/null || true
  chmod -R 777 "$dir" 2>/dev/null || true
  chown -R www:www "$dir" 2>/dev/null || true
done

echo "🚀 [4/4] 启动高可用同步服务端 (Python 端口 8088)..."
kill -9 $(lsof -t -i:8088 2>/dev/null) 2>/dev/null || true
pkill -9 -f "server.py" 2>/dev/null || true
sleep 1

for dir in "${TARGET_DIRS[@]}"; do
  if [ -f "$dir/server.py" ]; then
    cd "$dir"
    nohup python3 server.py > server.log 2>&1 &
    sleep 1
    if lsof -i:8088 >/dev/null 2>&1; then
      echo "   ✅ 端口 8088 服务端已就绪 ($dir)"
    else
      echo "   ⚠️  端口 8088 启动中，将由 PHP 80 端口承接主通信"
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
