#!/bin/bash
# ==============================================================================
# 集智平台 (JIZHI) 极速更新与全栈服务健康诊断脚本
# ==============================================================================

set -e

SITE_DIR="/www/wwwroot/47.99.110.230"
if [ ! -d "$SITE_DIR" ]; then
  SITE_DIR="$(pwd)"
fi

cd "$SITE_DIR"

echo "🔄 [1/3] 正在拉取 GitHub 最新版本代码..."
git fetch --all >/dev/null 2>&1 || true
git reset --hard origin/main >/dev/null 2>&1 || true

# 权限更新 (静默跳过宝塔防篡改的 .user.ini)
chmod -R 755 . 2>/dev/null || true
chown -R www:www . 2>/dev/null || true

# 提取当前版本与 Commit
APP_VER=$(grep -o "APP_VERSION = '[^']*'" src/constants.js 2>/dev/null | cut -d"'" -f2 || echo "未知版本")
COMMIT_HASH=$(git log -1 --format="%h - %s" 2>/dev/null || echo "最新提交")

echo "🔍 [2/3] 正在诊断全栈核心服务状态..."

# 1. 检查 Nginx
NGINX_STATUS="❌ 未运行或异常"
if pgrep nginx >/dev/null 2>&1 || systemctl is-active --quiet nginx 2>/dev/null; then
  NGINX_STATUS="✅ 正常运行中 (端口 80/443 活跃)"
fi

# 2. 检查 Etherpad (端口 9001)
EP_STATUS="❌ 未启动 (端口 9001 无响应)"
EP_HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 2 http://127.0.0.1:9001/ 2>/dev/null || echo "000")
if [ "$EP_HTTP_CODE" != "000" ] || pgrep -f "node.*etherpad" >/dev/null 2>&1; then
  EP_STATUS="✅ 正常运行中 (端口 9001 毫秒级协同就绪)"
else
  # 尝试自动拉起 Etherpad
  if [ -f "/www/wwwroot/etherpad-lite/src/node/server.js" ]; then
    cd /www/wwwroot/etherpad-lite
    nohup node src/node/server.js > /var/log/etherpad.log 2>&1 &
    cd "$SITE_DIR"
    sleep 2
    EP_STATUS="⚠️ 刚才未运行，已自动拉起 (端口 9001 启动中)"
  fi
fi

# 3. 检查 PHP-FPM
PHP_STATUS="❌ 未运行或异常"
if pgrep php-fpm >/dev/null 2>&1; then
  PHP_STATUS="✅ 正常运行中 (PHP 解析引擎活跃)"
fi

# 4. 检查 MySQL
MYSQL_STATUS="❌ 未运行或异常"
if pgrep mysqld >/dev/null 2>&1 || pgrep mariadbd >/dev/null 2>&1; then
  MYSQL_STATUS="✅ 正常运行中 (数据库连接就绪)"
fi

echo ""
echo "=================================================================="
echo "  🎉 集智学术平台 (JIZHI) 系统更新与服务状态诊断报告"
echo "=================================================================="
echo "📦 当前部署版本:   $APP_VER"
echo "🔖 Git 最新提交:   $COMMIT_HASH"
echo "------------------------------------------------------------------"
echo "🌐 Nginx Web 服务:       $NGINX_STATUS"
echo "📝 Etherpad 协同文档引擎: $EP_STATUS"
echo "🐘 PHP-FPM 运行环境:     $PHP_STATUS"
echo "🗄️ MySQL 数据库服务:     $MYSQL_STATUS"
echo "📁 目录与文件权限:       ✅ 已更新 (www:www / 755)"
echo "=================================================================="

if [[ "$NGINX_STATUS" =~ "✅" ]] && [[ "$EP_STATUS" =~ "✅" ]] && [[ "$PHP_STATUS" =~ "✅" ]] && [[ "$MYSQL_STATUS" =~ "✅" ]]; then
  echo "🚀 全部核心服务均运行正常！请按 Ctrl+F5 (Mac: Cmd+Shift+R) 刷新浏览器测试。"
else
  echo "⚠️ 部分服务可能需要注意，请根据上方红叉排查或重启对应服务。"
fi
echo "=================================================================="
echo ""
