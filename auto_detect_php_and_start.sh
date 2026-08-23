#!/bin/bash
set -e

echo "🚀 ========================================================"
echo "⚡ 全量自适应探测并启动 PHP 与 Web 登录全链路"
echo "🚀 ========================================================"

# 1. 扫描宝塔安装的所有 PHP 版本
PHP_BASE="/www/server/php"
if [ -d "$PHP_BASE" ]; then
    echo "🔍 扫描宝塔已安装的 PHP 版本:"
    ls -d $PHP_BASE/* 2>/dev/null || true
    
    for p in $PHP_BASE/*; do
        if [ -d "$p" ]; then
            vName=$(basename "$p")
            echo "  ▶ 正在启动 PHP $vName (/etc/init.d/php-fpm-$vName)..."
            /etc/init.d/php-fpm-$vName start 2>/dev/null || /etc/init.d/php-fpm-$vName restart 2>/dev/null || true
        fi
    done
fi

# 2. 检查系统 php-fpm
systemctl start php8.2-fpm 2>/dev/null || true
systemctl start php8.1-fpm 2>/dev/null || true
systemctl start php-fpm 2>/dev/null || true

# 3. 寻找活动的 php sock
ACTIVE_SOCK=""
for s in /tmp/php-cgi-*.sock /run/php/php*.sock; do
    if [ -S "$s" ]; then
        ACTIVE_SOCK="$s"
        echo "🟢 找到可用活动的 PHP Socket: $s"
        break
    fi
done

if [ -z "$ACTIVE_SOCK" ]; then
    echo "⚠️ 未找到 Unix Socket，尝试通过 127.0.0.1:9000 转发"
fi

# 4. 重载 Nginx
cd /www/wwwroot/47.99.110.230
./fix_nginx_clean_final.sh

# 5. 模拟真实的教师与学生登录请求
echo ""
echo "🔍 模拟发送真实登录 POST 请求到 login.php:"
RESP=$(curl -s -X POST -d "action=login&username=1001&password=123456&role=teacher" "http://127.0.0.1/login.php")
echo "返回结果: $RESP"

if echo "$RESP" | grep -q "success"; then
    echo "🎉🎉🎉 登录接口 100% 成功连通！响应正常！"
else
    echo "📄 查看 HTTP 完整响应头:"
    curl -i -X POST -d "action=login&username=1001&password=123456&role=teacher" "http://127.0.0.1/login.php" | head -n 15
fi
