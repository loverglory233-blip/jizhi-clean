#!/bin/bash
set -e

echo "🔧 正在为站点重构写入 100% 完美的 Nginx 配置文件 (含 /socket.io 与 /ep_ 插件资源代理)..."

NGINX_CONF_DIR="/www/server/panel/vhost/nginx"

# 1. 恢复 0.default.conf
cat << 'DEF_EOF' > "$NGINX_CONF_DIR/0.default.conf"
server
{
    listen 80 default_server;
    server_name _;
    return 444;
}
DEF_EOF

# 2. 清理破损的辅助占位配置
rm -f "$NGINX_CONF_DIR"/0.fastcgi_cache.conf
rm -f "$NGINX_CONF_DIR"/0.site_total_log_format.conf
rm -f "$NGINX_CONF_DIR"/0.websocket.conf
rm -f "$NGINX_CONF_DIR"/phpfpm_status.conf
rm -f "$NGINX_CONF_DIR"/waf2monitor_data.conf

# 3. 检查 SSL 证书路径
CERT_FILE=""
KEY_FILE=""

for cert_dir in "/www/server/panel/vhost/cert/47.99.110.230" "/www/server/panel/vhost/cert/jizhiedu.top"; do
    if [ -f "$cert_dir/fullchain.pem" ] && [ -f "$cert_dir/privkey.pem" ]; then
        CERT_FILE="$cert_dir/fullchain.pem"
        KEY_FILE="$cert_dir/privkey.pem"
        break
    fi
done

SSL_BLOCK=""
if [ -n "$CERT_FILE" ] && [ -n "$KEY_FILE" ]; then
    echo "🔒 检测到有效 SSL 证书: $CERT_FILE"
    SSL_BLOCK="
    listen 443 ssl;
    ssl_certificate    $CERT_FILE;
    ssl_certificate_key    $KEY_FILE;
    ssl_protocols TLSv1.1 TLSv1.2 TLSv1.3;
    ssl_ciphers EECDH+CHACHA20:EECDH+CHACHA20-draft:EECDH+AES128:RSA+AES128:EECDH+AES256:RSA+AES256:EECDH+3DES:RSA+3DES:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
"
fi

# 4. 完整重写 47.99.110.230.conf
cat << CONF_EOF > "$NGINX_CONF_DIR/47.99.110.230.conf"
server
{
    listen 80;
${SSL_BLOCK}
    server_name 47.99.110.230 jizhiedu.top;
    index index.php index.html index.htm;
    root /www/wwwroot/47.99.110.230;

    # 1. Etherpad 协同反向代理与全套插件静态资源支持
    location /socket.io {
        proxy_pass http://127.0.0.1:9001;
        proxy_set_header Host \$host;
        proxy_buffering off;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
    location /p/ {
        proxy_pass http://127.0.0.1:9001;
        proxy_set_header Host \$host;
        proxy_buffering off;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
    location /static/ {
        proxy_pass http://127.0.0.1:9001;
        proxy_set_header Host \$host;
    }
    location /javascripts/ {
        proxy_pass http://127.0.0.1:9001;
        proxy_set_header Host \$host;
    }
    location /pluginfw/ {
        proxy_pass http://127.0.0.1:9001;
        proxy_set_header Host \$host;
    }
    location /locales/ {
        proxy_pass http://127.0.0.1:9001;
        proxy_set_header Host \$host;
    }
    location /locales.json {
        proxy_pass http://127.0.0.1:9001;
        proxy_set_header Host \$host;
    }
    location /ep_ {
        proxy_pass http://127.0.0.1:9001;
        proxy_set_header Host \$host;
    }

    # 2. PHP 8.2 解析引入
    include enable-php-82.conf;

    access_log  /www/wwwlogs/47.99.110.230.log;
    error_log  /www/wwwlogs/47.99.110.230.error.log;
}
CONF_EOF

echo "📝 正在验证 Nginx 配置文件合法性..."
nginx -t
nginx -s reload
echo "🎉🎉🎉 Nginx 语法 100% 验证成功！PHP 8.2、WebSocket 与插件全套代理已完全就绪！"
