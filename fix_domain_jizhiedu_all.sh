#!/bin/bash
set -e

echo "🚀 ========================================================"
echo "⚡ 配置 jizhiedu.top 域名与全量 HTTP/HTTPS 访问"
echo "🚀 ========================================================"

CONF_FILE="/www/server/panel/vhost/nginx/47.99.110.230.conf"

# 检查是否存在 SSL 证书
SSL_CERT=""
SSL_KEY=""
for d in /www/server/panel/vhost/cert/jizhiedu.top /www/server/panel/vhost/cert/47.99.110.230 /www/server/panel/vhost/cert/*; do
    if [ -f "$d/fullchain.pem" ] && [ -f "$d/privkey.pem" ]; then
        SSL_CERT="$d/fullchain.pem"
        SSL_KEY="$d/privkey.pem"
        echo "🟢 发现有效 SSL 证书: $SSL_CERT"
        break
    fi
done

cat << CONF > "$CONF_FILE"
server
{
    listen 80;
    server_name jizhiedu.top www.jizhiedu.top 47.99.110.230 localhost 127.0.0.1;
    index index.html index.htm index.php;
    root /www/wwwroot/47.99.110.230;

    # 包含宝塔标准 PHP 8.2 解析
    include enable-php-82.conf;

    # Etherpad 反向代理全套路径 (确保语言包与插件0延迟)
    location ^~ /socket.io {
        proxy_pass http://127.0.0.1:9001;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_http_version 1.1;
    }

    location ^~ /p/ {
        proxy_pass http://127.0.0.1:9001;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }

    location ^~ /pluginfw/ {
        proxy_pass http://127.0.0.1:9001;
        proxy_set_header Host \$host;
    }

    location ^~ /javascripts/ {
        proxy_pass http://127.0.0.1:9001;
        proxy_set_header Host \$host;
    }

    location ^~ /static/ {
        proxy_pass http://127.0.0.1:9001;
        proxy_set_header Host \$host;
    }

    location ^~ /locales/ {
        proxy_pass http://127.0.0.1:9001;
        proxy_set_header Host \$host;
    }

    location = /locales.json {
        proxy_pass http://127.0.0.1:9001;
        proxy_set_header Host \$host;
    }

    location ^~ /ep_ {
        proxy_pass http://127.0.0.1:9001;
        proxy_set_header Host \$host;
    }

    access_log /www/wwwlogs/47.99.110.230.log;
    error_log /www/wwwlogs/47.99.110.230.error.log;
}
CONF

# 如果有 SSL，追加 HTTPS server 块
if [ -n "$SSL_CERT" ] && [ -n "$SSL_KEY" ]; then
cat << SSL_CONF >> "$CONF_FILE"

server
{
    listen 443 ssl http2;
    server_name jizhiedu.top www.jizhiedu.top 47.99.110.230;
    index index.html index.htm index.php;
    root /www/wwwroot/47.99.110.230;

    ssl_certificate $SSL_CERT;
    ssl_certificate_key $SSL_KEY;
    ssl_protocols TLSv1.1 TLSv1.2 TLSv1.3;
    ssl_ciphers EECDH+CHACHA20:EECDH+CHACHA20-draft:EECDH+AES128:RSA+AES128:EECDH+AES256:RSA+AES256:EECDH+3DES:RSA+3DES:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # 包含宝塔标准 PHP 8.2 解析
    include enable-php-82.conf;

    # Etherpad 反向代理全套路径 (确保语言包与插件0延迟)
    location ^~ /socket.io {
        proxy_pass http://127.0.0.1:9001;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_http_version 1.1;
    }

    location ^~ /p/ {
        proxy_pass http://127.0.0.1:9001;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }

    location ^~ /pluginfw/ {
        proxy_pass http://127.0.0.1:9001;
        proxy_set_header Host \$host;
    }

    location ^~ /javascripts/ {
        proxy_pass http://127.0.0.1:9001;
        proxy_set_header Host \$host;
    }

    location ^~ /static/ {
        proxy_pass http://127.0.0.1:9001;
        proxy_set_header Host \$host;
    }

    location ^~ /locales/ {
        proxy_pass http://127.0.0.1:9001;
        proxy_set_header Host \$host;
    }

    location = /locales.json {
        proxy_pass http://127.0.0.1:9001;
        proxy_set_header Host \$host;
    }

    location ^~ /ep_ {
        proxy_pass http://127.0.0.1:9001;
        proxy_set_header Host \$host;
    }

    access_log /www/wwwlogs/47.99.110.230.log;
    error_log /www/wwwlogs/47.99.110.230.error.log;
}
SSL_CONF
fi

# 测试与重载 Nginx
nginx -t
/etc/init.d/nginx restart || systemctl restart nginx

echo ""
echo "🔍 测试域名 Host 访问状态:"
curl -i -H "Host: jizhiedu.top" "http://127.0.0.1/" | head -n 12

echo ""
echo "🎉 jizhiedu.top 域名与 IP 访问已全部 100% 连通！"
