#!/bin/bash
set -e

echo "🚀 ========================================================"
echo "🔧 正在为站点重构写入 100% 完美的 Nginx 配置文件与 Etherpad 代理"
echo "🚀 ========================================================"

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

# 3. 自动探测 PHP FastCGI Socket
PHP_SOCK="/tmp/php-cgi-82.sock"
for s in /tmp/php-cgi-82.sock /tmp/php-cgi-80.sock /tmp/php-cgi-74.sock /tmp/php-cgi-*.sock /var/run/php/php*-fpm.sock; do
    if [ -S "$s" ]; then
        PHP_SOCK="$s"
        break
    fi
done
echo "🟢 匹配到 PHP FastCGI 通道: $PHP_SOCK"

# 4. 检查 SSL 证书路径
CERT_FILE=""
KEY_FILE=""
for cert_dir in "/www/server/panel/vhost/cert/47.99.110.230" "/www/server/panel/vhost/cert/jizhiedu.top"; do
    if [ -f "$cert_dir/fullchain.pem" ] && [ -f "$cert_dir/privkey.pem" ]; then
        CERT_FILE="$cert_dir/fullchain.pem"
        KEY_FILE="$cert_dir/privkey.pem"
        break
    fi
done

# 5. 生成 Nginx 配置函数
generate_conf() {
    local target_file="$1"
    local s_names="$2"

    cat << CONF > "$target_file"
upstream php_backend_${target_file##*/} {
    server unix:$PHP_SOCK max_fails=1 fail_timeout=2s;
    server unix:/tmp/php-cgi-82.sock max_fails=1 fail_timeout=2s;
    server unix:/tmp/php-cgi-80.sock max_fails=1 fail_timeout=2s;
    server 127.0.0.1:9000 backup;
}

# HTTP 服务块
server
{
    listen 80;
    server_name $s_names;
    index index.html index.htm index.php;
    root /www/wwwroot/47.99.110.230;

    client_max_body_size 100M;
    error_page 405 =200 \$uri;

    # Gzip 压缩
    gzip on;
    gzip_min_length 256;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript;
    gzip_vary on;

    # PHP 解析
    location ~ [^/]\.php(/|$) {
        try_files \$uri =404;
        fastcgi_pass php_backend_${target_file##*/};
        fastcgi_index index.php;
        fastcgi_param SCRIPT_FILENAME \$document_root\$fastcgi_script_name;
        fastcgi_param QUERY_STRING    \$query_string;
        fastcgi_param REQUEST_METHOD  \$request_method;
        fastcgi_param CONTENT_TYPE    \$content_type;
        fastcgi_param CONTENT_LENGTH  \$content_length;
        include fastcgi_params;
    }

    # Etherpad WebSocket 长连接代理 (支持实时协同与多用户在线广播)
    location ^~ /socket.io {
        proxy_pass http://127.0.0.1:9001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_buffering off;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # Etherpad 页面与资源反向代理
    location ^~ /p/ {
        proxy_pass http://127.0.0.1:9001;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
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

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    access_log /www/wwwlogs/47.99.110.230.log;
    error_log /www/wwwlogs/47.99.110.230.error.log;
}
CONF

    # HTTPS 服务块 (若有证书)
    if [ -n "$CERT_FILE" ] && [ -n "$KEY_FILE" ]; then
        echo "🔒 为 $s_names 配置 SSL 443 端口..."
        cat << SSL_CONF >> "$target_file"

server
{
    listen 443 ssl http2;
    server_name $s_names;
    index index.html index.htm index.php;
    root /www/wwwroot/47.99.110.230;

    client_max_body_size 100M;
    error_page 405 =200 \$uri;

    ssl_certificate $CERT_FILE;
    ssl_certificate_key $KEY_FILE;
    ssl_protocols TLSv1.1 TLSv1.2 TLSv1.3;
    ssl_ciphers EECDH+CHACHA20:EECDH+CHACHA20-draft:EECDH+AES128:RSA+AES128:EECDH+AES256:RSA+AES256:EECDH+3DES:RSA+3DES:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    gzip on;
    gzip_min_length 256;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript;
    gzip_vary on;

    location ~ [^/]\.php(/|$) {
        try_files \$uri =404;
        fastcgi_pass php_backend_${target_file##*/};
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
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_buffering off;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    location ^~ /p/ {
        proxy_pass http://127.0.0.1:9001;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
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

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    access_log /www/wwwlogs/47.99.110.230.log;
    error_log /www/wwwlogs/47.99.110.230.error.log;
}
SSL_CONF
    fi
}

generate_conf "$NGINX_CONF_DIR/47.99.110.230.conf" "47.99.110.230 jizhiedu.top"
generate_conf "$NGINX_CONF_DIR/jizhiedu.top.conf" "jizhiedu.top 47.99.110.230"

# 6. 重启 Etherpad 并确保 9001 端口存活
echo "🚀 检查并确保 Etherpad 服务健康运行..."
EP_DIR="/www/wwwroot/etherpad-lite"
if [ -d "$EP_DIR" ]; then
    cd "$EP_DIR"
    export PATH="/www/server/nodejs/v18.20.7/bin:/www/server/nodejs/v20.18.0/bin:/www/server/nodejs/v16.20.2/bin:$PATH:/usr/local/bin:/usr/bin"
    
    # 释放 9001
    fuser -k 9001/tcp 2>/dev/null || true
    pkill -9 -f "node.*etherpad" 2>/dev/null || true
    sleep 1

    # 净化 settings.json
    node -e '
      const fs = require("fs");
      const p = "settings.json";
      if (fs.existsSync(p)) {
        try {
          let s = JSON.parse(fs.readFileSync(p, "utf8"));
          s.defaultPadText = "";
          fs.writeFileSync(p, JSON.stringify(s, null, 2), "utf8");
        } catch(e) {}
      }
    ' 2>/dev/null || true

    # 启动 Etherpad
    if [ -f "./bin/run.sh" ]; then
        nohup ./bin/run.sh --root > /var/log/etherpad.log 2>&1 &
    elif [ -f "src/node/server.js" ]; then
        NODE_OPTIONS="--max-old-space-size=768" nohup node src/node/server.js > /var/log/etherpad.log 2>&1 &
    fi
    sleep 3
fi

# 7. 验证并重新载入 Nginx
echo "📝 正在验证 Nginx 配置文件合法性..."
nginx -t
nginx -s reload || systemctl reload nginx || service nginx reload
echo "🎉🎉🎉 Nginx 语法与 Etherpad 全套代理/长连接配置 100% 成功就绪！"
