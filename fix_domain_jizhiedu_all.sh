#!/bin/bash
set -e

echo "🚀 ========================================================"
echo "⚡ 配置 jizhiedu.top 域名与 IP 全量 Nginx HTTP/HTTPS + Etherpad 反代"
echo "🚀 ========================================================"

# 1. 自动探测系统生效的宝塔官方 PHP FastCGI
PHP_SOCK="/tmp/php-cgi-82.sock"
for s in /tmp/php-cgi-*.sock /var/run/php/php*-fpm.sock; do
    if [ -S "$s" ]; then
        PHP_SOCK="$s"
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

# 3. 生成标准的 Nginx 配置模板 (包含多重容灾 FastCGI、Etherpad 反代与 405 防护)
generate_nginx_conf() {
    local target_file="$1"
    local s_name="$2"

    cat << CONF > "$target_file"
upstream php_backend_${s_name//[^a-zA-Z0-9]/_} {
    server unix:$PHP_SOCK max_fails=1 fail_timeout=2s;
    server unix:/tmp/php-cgi-82.sock max_fails=1 fail_timeout=2s;
    server unix:/tmp/php-cgi-80.sock max_fails=1 fail_timeout=2s;
    server unix:/tmp/php-cgi-74.sock max_fails=1 fail_timeout=2s;
    server 127.0.0.1:9000 backup;
}

server
{
    listen 80;
    server_name $s_name;
    index index.html index.htm index.php;
    root /www/wwwroot/47.99.110.230;

    client_max_body_size 100M;
    error_page 405 =200 \$uri;

    # ⚡ 启用极速 Gzip 压缩（显著降低带宽消耗）
    gzip on;
    gzip_min_length 256;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript;
    gzip_vary on;

    # ⚡ 多重容灾 PHP FastCGI 解析 (永不 502)
    location ~ [^/]\.php(/|$) {
        try_files \$uri =404;
        fastcgi_pass php_backend_${s_name//[^a-zA-Z0-9]/_};
        fastcgi_index index.php;
        fastcgi_param SCRIPT_FILENAME \$document_root\$fastcgi_script_name;
        fastcgi_param QUERY_STRING    \$query_string;
        fastcgi_param REQUEST_METHOD  \$request_method;
        fastcgi_param CONTENT_TYPE    \$content_type;
        fastcgi_param CONTENT_LENGTH  \$content_length;
        include fastcgi_params;
    }

    # Etherpad 协同编辑器反向代理全套路径 (设置 3s 连接超时，避免死等超时)
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

    # 默认静态资源与单页应用路由
    location / {
        try_files \$uri \$uri/ /index.html;
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

    client_max_body_size 100M;
    error_page 405 =200 \$uri;

    ssl_certificate $SSL_CERT;
    ssl_certificate_key $SSL_KEY;
    ssl_protocols TLSv1.1 TLSv1.2 TLSv1.3;
    ssl_ciphers EECDH+CHACHA20:EECDH+CHACHA20-draft:EECDH+AES128:RSA+AES128:EECDH+AES256:RSA+AES256:EECDH+3DES:RSA+3DES:!MD5;

    # ⚡ 启用极速 Gzip 压缩（显著降低带宽消耗）
    gzip on;
    gzip_min_length 256;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript;
    gzip_vary on;

    # ⚡ 多重容灾 PHP FastCGI 解析 (永不 502)
    location ~ [^/]\.php(/|$) {
        try_files \$uri =404;
        fastcgi_pass php_backend_${s_name//[^a-zA-Z0-9]/_};
        fastcgi_index index.php;
        fastcgi_param SCRIPT_FILENAME \$document_root\$fastcgi_script_name;
        fastcgi_param QUERY_STRING    \$query_string;
        fastcgi_param REQUEST_METHOD  \$request_method;
        fastcgi_param CONTENT_TYPE    \$content_type;
        fastcgi_param CONTENT_LENGTH  \$content_length;
        include fastcgi_params;
    }

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

    location / {
        try_files \$uri \$uri/ /index.html;
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
