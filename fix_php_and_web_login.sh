#!/bin/bash
set -e

echo "🚀 ========================================================"
echo "⚡ 正在修复 PHP-FPM 与登录后端接口 (恢复秒级登录)"
echo "🚀 ========================================================"

# 1. 尝试启动所有可能的 PHP-FPM 服务 (宝塔与系统)
echo "1️⃣ 正在拉起 PHP-FPM 服务..."
/etc/init.d/php-fpm-82 start 2>/dev/null || /etc/init.d/php-fpm-82 restart 2>/dev/null || true
/etc/init.d/php-fpm-81 start 2>/dev/null || true
systemctl start php8.2-fpm 2>/dev/null || systemctl restart php8.2-fpm 2>/dev/null || true
systemctl start php-fpm 2>/dev/null || true

# 2. 检查可用的 PHP Socket
PHP_SOCK=""
if [ -S "/tmp/php-cgi-82.sock" ]; then
    PHP_SOCK="/tmp/php-cgi-82.sock"
elif [ -S "/run/php/php8.2-fpm.sock" ]; then
    PHP_SOCK="/run/php/php8.2-fpm.sock"
elif [ -S "/tmp/php-cgi-81.sock" ]; then
    PHP_SOCK="/tmp/php-cgi-81.sock"
fi

echo "🟢 检测到活动的 PHP-FPM Socket: $PHP_SOCK"

# 3. 重新写入并载入 Nginx 配置
cd /www/wwwroot/47.99.110.230
./fix_nginx_clean_final.sh

# 4. 测试本地登录接口响应
echo ""
echo "🔍 正在测试 login.php 接口状态:"
curl -i "http://127.0.0.1/login.php" | head -n 12

echo ""
echo "🎉 PHP 与登录接口已完全自愈就绪！"
