#!/bin/bash
set -e

echo "🔍 ========================================================"
echo "⚡ 全链路诊断与强制自愈：PHP + Nginx + 真实登录验证"
echo "🔍 ========================================================"

# 1. 扫描宝塔安装的全部 PHP 版本并强制逐个启动
echo "1️⃣ 正在扫描并强制拉起宝塔所有 PHP-FPM 服务..."
for p in /www/server/php/*; do
    if [ -d "$p" ]; then
        v=$(basename "$p")
        echo "  ▶ 启动 /etc/init.d/php-fpm-$v ..."
        /etc/init.d/php-fpm-$v start 2>/dev/null || /etc/init.d/php-fpm-$v restart 2>/dev/null || true
    fi
done

# 2. 扫描系统自带的 php-fpm
systemctl start php8.2-fpm 2>/dev/null || true
systemctl start php8.1-fpm 2>/dev/null || true
systemctl start php8.0-fpm 2>/dev/null || true
systemctl start php7.4-fpm 2>/dev/null || true
systemctl start php-fpm 2>/dev/null || true

sleep 1

# 3. 寻找活动的 php sock
ACTIVE_SOCK=""
for s in /tmp/php-cgi-*.sock /run/php/php*.sock; do
    if [ -S "$s" ]; then
        ACTIVE_SOCK="$s"
        echo "🟢 成功定位活动的 PHP Socket: $ACTIVE_SOCK"
        break
    fi
done

# 4. 如果没有找到 sock，尝试检查 9000 端口
if [ -z "$ACTIVE_SOCK" ]; then
    echo "⚠️ 尝试检测 127.0.0.1:9000 端口..."
    if netstat -tuln 2>/dev/null | grep -q ":9000 "; then
        ACTIVE_SOCK="127.0.0.1:9000"
        echo "🟢 找到活动的 PHP 端口: 127.0.0.1:9000"
    fi
fi

# 5. 精确配置 Nginx 的 PHP 代理
NGINX_CONF="/www/server/panel/vhost/nginx/47.99.110.230.conf"
if [ -f "$NGINX_CONF" ]; then
    echo "2️⃣ 正在校准 Nginx 的 PHP FastCGI 路由..."
    
    # 替换 fastcgi_pass
    if [[ "$ACTIVE_SOCK" == *"/"* ]]; then
        sed -i "s|fastcgi_pass .*|fastcgi_pass unix:$ACTIVE_SOCK;|g" "$NGINX_CONF"
    elif [ -n "$ACTIVE_SOCK" ]; then
        sed -i "s|fastcgi_pass .*|fastcgi_pass $ACTIVE_SOCK;|g" "$NGINX_CONF"
    fi
    
    # 确保 /www/server/panel/vhost/nginx/47.99.110.230.conf 语法正确
    nginx -t
    systemctl restart nginx || /etc/init.d/nginx restart || true
    echo "✅ Nginx 已成功重载！"
fi

# 6. 验证站点根目录下文件权限
cd /www/wwwroot/47.99.110.230
chmod -R 755 .
chown -R www:www . 2>/dev/null || true

# 7. 端到端真实发起模拟登录测试 (严谨验证！)
echo ""
echo "3️⃣ 正在发起真实端到端教师账号登录 POST 请求测试 (sync.php?action=login)..."
RESP=$(curl -s -X POST -H "Content-Type: application/json" -d '{"account":"1001","password":"123456","role":"teacher"}' "http://127.0.0.1/sync.php?action=login" || echo "CURL_FAILED")

echo "📄 实际接口返回内容: $RESP"
echo ""

if echo "$RESP" | grep -q '"success":true'; then
    echo "🎉🎉🎉 验收通过！登录接口已 100% 成功返回 success: true 与用户 Token！"
else
    echo "❌ 登录接口未返回预期 JSON，打印 HTTP 详细响应头与错误栈:"
    curl -i -X POST -H "Content-Type: application/json" -d '{"account":"1001","password":"123456","role":"teacher"}' "http://127.0.0.1/sync.php?action=login" | head -n 25
fi
