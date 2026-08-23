#!/bin/bash
set -e

echo "🚀 ========================================================"
echo "⚡ 标准化宝塔 Nginx 配置并测试登录接口真实响应"
echo "🚀 ========================================================"

# 1. 启动 PHP 8.2
/etc/init.d/php-fpm-82 start 2>/dev/null || /etc/init.d/php-fpm-82 restart 2>/dev/null || true

# 2. 写入标准的宝塔 Nginx 站点配置
CONF_FILE="/www/server/panel/vhost/nginx/47.99.110.230.conf"
cat << 'CONF' > "$CONF_FILE"
server
{
    listen 80;
    server_name 47.99.110.230 localhost 127.0.0.1;
    index index.html index.htm index.php;
    root /www/wwwroot/47.99.110.230;

    # 包含宝塔标准 PHP-82 解析
    include enable-php-82.conf;

    # Etherpad 反向代理
    location ^~ /socket.io {
        proxy_pass http://127.0.0.1:9001;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_http_version 1.1;
    }

    location ^~ /p/ {
        proxy_pass http://127.0.0.1:9001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location ^~ /pluginfw/ {
        proxy_pass http://127.0.0.1:9001;
        proxy_set_header Host $host;
    }

    location ^~ /javascripts/ {
        proxy_pass http://127.0.0.1:9001;
        proxy_set_header Host $host;
    }

    location ^~ /static/ {
        proxy_pass http://127.0.0.1:9001;
        proxy_set_header Host $host;
    }

    access_log /www/wwwlogs/47.99.110.230.log;
    error_log /www/wwwlogs/47.99.110.230.error.log;
}
CONF

# 3. 测试与重载 Nginx
nginx -t
/etc/init.d/nginx restart || systemctl restart nginx

# 4. 真实测试登录接口
echo ""
echo "🔍 正在对 47.99.110.230 真实发起模拟教师登录 (sync.php?action=login)..."
RESP=$(curl -s -X POST -H "Host: 47.99.110.230" -H "Content-Type: application/json" -d '{"account":"1001","password":"123456","role":"teacher"}' "http://127.0.0.1/sync.php?action=login")

echo "📄 接口实际返回内容: $RESP"
echo ""

if echo "$RESP" | grep -q '"success":true'; then
    echo "🎉🎉🎉 恭喜！登录接口已 100% 成功连通！返回 success: true 与完整用户数据！"
else
    echo "❌ 仍然未返回预期结果，请检查上方日志。"
fi
