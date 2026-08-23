#!/bin/bash
set -e

echo "🔍 正在探测服务器上正在运行的真实 PHP-FPM 服务..."

# 1. 查找正在运行的 php-fpm 进程或 sock 文件
RUNNING_PHP_SOCK=$(ls -1 /tmp/php-cgi-*.sock 2>/dev/null | head -n 1)
RUNNING_PHP_VER=""

if [ -n "$RUNNING_PHP_SOCK" ]; then
    RUNNING_PHP_VER=$(basename "$RUNNING_PHP_SOCK" | sed 's/php-cgi-//' | sed 's/\.sock//')
    echo "✅ 探测到运行中的 PHP Sock: $RUNNING_PHP_SOCK (版本: $RUNNING_PHP_VER)"
else
    # 从进程中探测
    RUNNING_PHP_BIN=$(ps aux | grep php-fpm | grep -v grep | awk '{print $11}' | head -n 1)
    if [ -n "$RUNNING_PHP_BIN" ]; then
        echo "✅ 探测到运行中的 PHP 二进制: $RUNNING_PHP_BIN"
    fi
fi

# 2. 查找宝塔中实际有效的 enable-php-*.conf
PHP_CONFS=$(ls -1 /www/server/nginx/conf/enable-php-*.conf 2>/dev/null)
echo "📦 找到以下 PHP 配置文件:"
echo "$PHP_CONFS"

BEST_PHP_CONF=""
if [ -n "$RUNNING_PHP_VER" ] && [ -f "/www/server/nginx/conf/enable-php-${RUNNING_PHP_VER}.conf" ]; then
    BEST_PHP_CONF="enable-php-${RUNNING_PHP_VER}.conf"
else
    # 优先找 74, 80, 81, 73, 72 等现代版本
    for v in 74 80 81 82 73 72 71 70 56 55; do
        if [ -f "/www/server/nginx/conf/enable-php-${v}.conf" ]; then
            BEST_PHP_CONF="enable-php-${v}.conf"
            break
        fi
    done
fi

if [ -z "$BEST_PHP_CONF" ]; then
    BEST_PHP_CONF="enable-php.conf"
fi

echo "🎯 最终锁定的黄金 PHP 配置文件: $BEST_PHP_CONF"

# 3. 彻底修复所有站点配置文件
NGINX_CONF_DIR="/www/server/panel/vhost/nginx"
for CONF_FILE in "$NGINX_CONF_DIR"/*.conf; do
    if [ -f "$CONF_FILE" ]; then
        echo "📝 正在配置站点: $CONF_FILE"
        
        # 移除旧的 enable-php 引用与旧代理标记
        sed -i '/enable-php.*\.conf/d' "$CONF_FILE" || true
        sed -i '/# ETHERPAD_PROXY_START/,/# ETHERPAD_PROXY_END/d' "$CONF_FILE" || true
        sed -i '/location \^~ \/p\//,/}/d' "$CONF_FILE" || true
        sed -i '/location \^~ \/socket\.io\//,/}/d' "$CONF_FILE" || true
        sed -i '/location \^~ \/static\//,/}/d' "$CONF_FILE" || true
        sed -i '/location \^~ \/javascripts\//,/}/d' "$CONF_FILE" || true
        sed -i '/location \^~ \/pluginfw\//,/}/d' "$CONF_FILE" || true
        sed -i '/location \^~ \/locales\//,/}/d' "$CONF_FILE" || true
        
        # 在 server 块起始位置插入 Etherpad 反向代理
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

        # 在 root 或 index 之后注入正确的 PHP 解析规则
        if grep -q "root " "$CONF_FILE"; then
            sed -i "/root /a \    include $BEST_PHP_CONF;" "$CONF_FILE"
        elif grep -q "index " "$CONF_FILE"; then
            sed -i "/index /a \    include $BEST_PHP_CONF;" "$CONF_FILE"
        fi
    fi
done

# 4. 检查 PHP-FPM 是否处于存活状态，若未存活尝试重启
if [ -n "$RUNNING_PHP_VER" ]; then
    /etc/init.d/php-fpm-${RUNNING_PHP_VER} restart || /etc/init.d/php-fpm restart || true
fi

nginx -t
nginx -s reload
echo "🎉🎉🎉 PHP-FPM 与 Nginx 已彻底精准修复并重载成功！"
