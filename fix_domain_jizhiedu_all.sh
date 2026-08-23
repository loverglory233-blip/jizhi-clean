#!/bin/bash
set -e

echo "🚀 ========================================================"
echo "⚡ 配置 jizhiedu.top 域名与 IP 全量 Nginx HTTP/HTTPS + Etherpad 反代"
echo "🚀 ========================================================"

# 1. 自动探测系统生效的 PHP 配置与 FastCGI Sock
PHP_CONF="enable-php-82.conf"
PHP_SOCK="/tmp/php-cgi-82.sock"
for s in /tmp/php-cgi-*.sock; do
    if [ -S "$s" ]; then
        PHP_SOCK="$s"
        echo "🟢 发现有效 PHP Socket: $PHP_SOCK"
        break
    fi
done
for p in /www/server/nginx/conf/enable-php-*.conf; do
    if [ -f "$p" ]; then
        PHP_CONF=$(basename "$p")
        echo "🟢 发现有效 PHP 配置: $PHP_CONF"
        break
    fi
done

# 2. 检查是否存在 SSL 证书
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

# 3. 生成标准的 Nginx 配置模板 (包含完整的 Etherpad 反代与 3秒极速连接超时)
generate_nginx_conf() {
    local target_file="$1"
    local s_name="$2"

    cat << CONF > "$target_file"
server
{
    listen 80;
    server_name $s_name;
    index index.html index.htm index.php;
    root /www/wwwroot/47.99.110.230;

    # 彻底解决 POST 请求被 Nginx 报 405 Not Allowed 的问题
    error_page 405 =200 \$uri;

    # 显式 FastCGI 处理所有 PHP 请求
    location ~ [^/]\.php(/|$) {
        try_files \$uri =404;
        fastcgi_pass unix:$PHP_SOCK;
        fastcgi_index index.php;
        fastcgi_param SCRIPT_FILENAME \$document_root\$fastcgi_script_name;
        include fastcgi_params;
        include fastcgi.conf;
    }

    include $PHP_CONF;

    # Etherpad 反向代理全套路径 (设置 3s 连接超时，避免死等超时)
    location ^~ /socket.io {
        proxy_pass http://127.0.0.1:9001;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_http_version 1.1;
        proxy_connect_timeout 3s;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }

    location ^~ /p/ {
        proxy_pass http://127.0.0.1:9001;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_connect_timeout 3s;
        proxy_read_timeout 60s;
    }

    location ^~ /pluginfw/ {
        proxy_pass http://127.0.0.1:9001;
        proxy_set_header Host \$host;
        proxy_connect_timeout 3s;
    }

    location ^~ /javascripts/ {
        proxy_pass http://127.0.0.1:9001;
        proxy_set_header Host \$host;
        proxy_connect_timeout 3s;
    }

    location ^~ /static/ {
        proxy_pass http://127.0.0.1:9001;
        proxy_set_header Host \$host;
        proxy_connect_timeout 3s;
    }

    location ^~ /locales/ {
        proxy_pass http://127.0.0.1:9001;
        proxy_set_header Host \$host;
        proxy_connect_timeout 3s;
    }

    location = /locales.json {
        proxy_pass http://127.0.0.1:9001;
        proxy_set_header Host \$host;
        proxy_connect_timeout 3s;
    }

    location ^~ /ep_ {
        proxy_pass http://127.0.0.1:9001;
        proxy_set_header Host \$host;
        proxy_connect_timeout 3s;
    }

    access_log /www/wwwlogs/jizhi_access.log;
    error_log /www/wwwlogs/jizhi_error.log;
}
CONF

    if [ -n "$SSL_CERT" ] && [ -n "$SSL_KEY" ]; then
    cat << SSL_CONF >> "$target_file"

server
{
    listen 443 ssl http2;
    server_name $s_name;
    index index.html index.htm index.php;
    root /www/wwwroot/47.99.110.230;

    ssl_certificate $SSL_CERT;
    ssl_certificate_key $SSL_KEY;
    ssl_protocols TLSv1.1 TLSv1.2 TLSv1.3;
    ssl_ciphers EECDH+CHACHA20:EECDH+CHACHA20-draft:EECDH+AES128:RSA+AES128:EECDH+AES256:RSA+AES256:EECDH+3DES:RSA+3DES:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # 彻底解决 POST 请求被 Nginx 报 405 Not Allowed 的问题
    error_page 405 =200 \$uri;

    # 显式 FastCGI 处理所有 PHP 请求
    location ~ [^/]\.php(/|$) {
        try_files \$uri =404;
        fastcgi_pass unix:$PHP_SOCK;
        fastcgi_index index.php;
        fastcgi_param SCRIPT_FILENAME \$document_root\$fastcgi_script_name;
        include fastcgi_params;
        include fastcgi.conf;
    }

    include $PHP_CONF;

    location ^~ /socket.io {
        proxy_pass http://127.0.0.1:9001;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_http_version 1.1;
        proxy_connect_timeout 3s;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }

    location ^~ /p/ {
        proxy_pass http://127.0.0.1:9001;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_connect_timeout 3s;
        proxy_read_timeout 60s;
    }

    location ^~ /pluginfw/ {
        proxy_pass http://127.0.0.1:9001;
        proxy_set_header Host \$host;
        proxy_connect_timeout 3s;
    }

    location ^~ /javascripts/ {
        proxy_pass http://127.0.0.1:9001;
        proxy_set_header Host \$host;
        proxy_connect_timeout 3s;
    }

    location ^~ /static/ {
        proxy_pass http://127.0.0.1:9001;
        proxy_set_header Host \$host;
        proxy_connect_timeout 3s;
    }

    location ^~ /locales/ {
        proxy_pass http://127.0.0.1:9001;
        proxy_set_header Host \$host;
        proxy_connect_timeout 3s;
    }

    location = /locales.json {
        proxy_pass http://127.0.0.1:9001;
        proxy_set_header Host \$host;
        proxy_connect_timeout 3s;
    }

    location ^~ /ep_ {
        proxy_pass http://127.0.0.1:9001;
        proxy_set_header Host \$host;
        proxy_connect_timeout 3s;
    }

    access_log /www/wwwlogs/jizhi_access.log;
    error_log /www/wwwlogs/jizhi_error.log;
}
SSL_CONF
    fi
    echo "✅ 已同步生成配置: $target_file"
}

# 4. 同步写入 47.99.110.230.conf 和 jizhiedu.top.conf
mkdir -p /www/server/panel/vhost/nginx
generate_nginx_conf "/www/server/panel/vhost/nginx/47.99.110.230.conf" "47.99.110.230 jizhiedu.top www.jizhiedu.top localhost 127.0.0.1"
generate_nginx_conf "/www/server/panel/vhost/nginx/jizhiedu.top.conf" "jizhiedu.top www.jizhiedu.top 47.99.110.230 localhost 127.0.0.1"

# 5. 测试与重载 Nginx
nginx -t
/etc/init.d/nginx reload || nginx -s reload || systemctl reload nginx

echo ""
echo "🎉 ========================================================"
echo "✅ jizhiedu.top 域名与 IP 的 Nginx 反代配置已全部 100% 刷新生效！"
echo "🎉 ========================================================"
