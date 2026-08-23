#!/bin/bash
set -e

echo "🔧 正在彻底恢复主站与清除宝塔冲突反代，确保 sync.php 与 Etherpad 静态资源 100% 畅通..."

NGINX_CONF_DIR="/www/server/panel/vhost/nginx"

for CONF_FILE in "$NGINX_CONF_DIR"/*.conf; do
    if [ -f "$CONF_FILE" ]; then
        echo "📝 净化配置文件: $CONF_FILE"
        
        # 1. 清除宝塔自动生成的全局反代 proxy 引入
        sed -i '/proxy\/.*\.conf/d' "$CONF_FILE" || true
        # 2. 清除旧的冲突代理标记
        sed -i '/# ETHERPAD_PROXY_START/,/# ETHERPAD_PROXY_END/d' "$CONF_FILE" || true
        sed -i '/location \/p\//,/}/d' "$CONF_FILE" || true
        sed -i '/location \/socket\.io/,/}/d' "$CONF_FILE" || true
        sed -i '/location \/etherpad\//,/}/d' "$CONF_FILE" || true
        sed -i '/location \/static\//,/}/d' "$CONF_FILE" || true
        sed -i '/location \/javascripts\//,/}/d' "$CONF_FILE" || true
        sed -i '/location \/pluginfw\//,/}/d' "$CONF_FILE" || true
        sed -i '/location \/locales\//,/}/d' "$CONF_FILE" || true
        
        # 3. 仅在 location ~ \.php 之前精准注入仅针对 /p/ 的轻量反代与全量静态资源
        if grep -q "location ~ \\\.php" "$CONF_FILE"; then
            sed -i '/location ~ \\\.php/i \
    # ETHERPAD_PROXY_START\
    location ^~ /p/ {\
        proxy_pass http://127.0.0.1:9001/p/;\
        proxy_set_header Host $host;\
        proxy_buffering off;\
        proxy_http_version 1.1;\
        proxy_set_header Upgrade $http_upgrade;\
        proxy_set_header Connection "upgrade";\
    }\
    location ^~ /socket.io/ {\
        proxy_pass http://127.0.0.1:9001/socket.io/;\
        proxy_set_header Host $host;\
        proxy_buffering off;\
        proxy_http_version 1.1;\
        proxy_set_header Upgrade $http_upgrade;\
        proxy_set_header Connection "upgrade";\
    }\
    location ^~ /static/ {\
        proxy_pass http://127.0.0.1:9001/static/;\
        proxy_set_header Host $host;\
    }\
    location ^~ /javascripts/ {\
        proxy_pass http://127.0.0.1:9001/javascripts/;\
        proxy_set_header Host $host;\
    }\
    location ^~ /pluginfw/ {\
        proxy_pass http://127.0.0.1:9001/pluginfw/;\
        proxy_set_header Host $host;\
    }\
    location ^~ /locales/ {\
        proxy_pass http://127.0.0.1:9001/locales/;\
        proxy_set_header Host $host;\
    }\
    # ETHERPAD_PROXY_END\
' "$CONF_FILE"
        fi
    fi
done

nginx -t && nginx -s reload
echo "🎉🎉🎉 Nginx 净化成功！sync.php 与 Etherpad 全套静态资源已 100% 满血就绪！"
