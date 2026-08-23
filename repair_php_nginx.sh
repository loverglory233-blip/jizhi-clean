#!/bin/bash
set -e

echo "🔧 正在全面检查并修复 Nginx 的 PHP-FPM 解析与 Etherpad 反向代理..."

NGINX_CONF_DIR="/www/server/panel/vhost/nginx"
PHP_CONF=$(find /www/server/nginx/conf/ -type f -name "enable-php-*.conf" | head -n 1)

if [ -z "$PHP_CONF" ]; then
    PHP_CONF="/www/server/nginx/conf/enable-php.conf"
fi

PHP_INC_NAME=$(basename "$PHP_CONF")
echo "📦 检测到宝塔 PHP 配置文件: $PHP_INC_NAME"

for CONF_FILE in "$NGINX_CONF_DIR"/*.conf; do
    if [ -f "$CONF_FILE" ]; then
        echo "📝 正在彻底修复站点配置: $CONF_FILE"
        
        # 1. 彻底清除之前可能污染的残留规则
        sed -i '/# ETHERPAD_PROXY_START/,/# ETHERPAD_PROXY_END/d' "$CONF_FILE" || true
        sed -i '/location \^~ \/p\//,/}/d' "$CONF_FILE" || true
        sed -i '/location \^~ \/socket\.io\//,/}/d' "$CONF_FILE" || true
        sed -i '/location \^~ \/static\//,/}/d' "$CONF_FILE" || true
        sed -i '/location \^~ \/javascripts\//,/}/d' "$CONF_FILE" || true
        sed -i '/location \^~ \/pluginfw\//,/}/d' "$CONF_FILE" || true
        sed -i '/location \^~ \/locales\//,/}/d' "$CONF_FILE" || true
        sed -i '/location \/p\//,/}/d' "$CONF_FILE" || true
        sed -i '/location \/socket\.io/,/}/d' "$CONF_FILE" || true
        sed -i '/location \/etherpad\//,/}/d' "$CONF_FILE" || true
        
        # 2. 确保必须包含 PHP 解析
        if ! grep -q "enable-php" "$CONF_FILE"; then
            echo "   ➕ 注入 PHP-FPM 解析: include $PHP_INC_NAME;"
            sed -i "/root /a \    include $PHP_INC_NAME;" "$CONF_FILE"
        fi
        
        # 3. 注入无冲突的 Etherpad 反代（放在 server 块内部最上方）
        sed -i "/server_name/a \
    # ETHERPAD_PROXY_START\
    location ^~ /p/ {\
        proxy_pass http://127.0.0.1:9001/p/;\
        proxy_set_header Host \$host;\
        proxy_buffering off;\
        proxy_http_version 1.1;\
        proxy_set_header Upgrade \$http_upgrade;\
        proxy_set_header Connection \"upgrade\";\
    }\
    location ^~ /socket.io/ {\
        proxy_pass http://127.0.0.1:9001/socket.io/;\
        proxy_set_header Host \$host;\
        proxy_buffering off;\
        proxy_http_version 1.1;\
        proxy_set_header Upgrade \$http_upgrade;\
        proxy_set_header Connection \"upgrade\";\
    }\
    location ^~ /static/ {\
        proxy_pass http://127.0.0.1:9001/static/;\
        proxy_set_header Host \$host;\
    }\
    location ^~ /javascripts/ {\
        proxy_pass http://127.0.0.1:9001/javascripts/;\
        proxy_set_header Host \$host;\
    }\
    location ^~ /pluginfw/ {\
        proxy_pass http://127.0.0.1:9001/pluginfw/;\
        proxy_set_header Host \$host;\
    }\
    location ^~ /locales/ {\
        proxy_pass http://127.0.0.1:9001/locales/;\
        proxy_set_header Host \$host;\
    }\
    # ETHERPAD_PROXY_END\
" "$CONF_FILE"
    fi
done

nginx -t
nginx -s reload
echo "🎉🎉🎉 Nginx 与 PHP-FPM 解析与 Etherpad 代理已 100% 满血复活！"
