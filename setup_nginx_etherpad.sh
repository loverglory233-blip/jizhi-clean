#!/bin/bash
set -e

echo "🔧 正在自动配置 Nginx 完整的 Etherpad HTTPS 反向代理规则..."

NGINX_CONF_DIR="/www/server/panel/vhost/nginx"
CONF_FILE=$(find "$NGINX_CONF_DIR" -type f -name "*47.99.110.230*.conf" -o -name "*jizhiedu.top*.conf" | head -n 1)

if [ -z "$CONF_FILE" ]; then
    CONF_FILE="/www/server/panel/vhost/nginx/47.99.110.230.conf"
fi

if [ -f "$CONF_FILE" ]; then
    echo "📝 清理旧规则并注入完整反向代理规则到: $CONF_FILE"
    
    # 清除旧的单个 location /etherpad/ 规则
    sed -i '/# ETHERPAD_PROXY_START/,/# ETHERPAD_PROXY_END/d' "$CONF_FILE"
    sed -i '/location \/etherpad\//,/}/d' "$CONF_FILE"
    
    # 注入包含 socket.io、static、javascripts 的全套代理规则
    sed -i '/location \/ {/i \
    # ETHERPAD_PROXY_START\
    location /etherpad/ {\
        proxy_pass http://127.0.0.1:9001/;\
        proxy_set_header Host $host;\
        proxy_buffering off;\
        proxy_http_version 1.1;\
        proxy_set_header Upgrade $http_upgrade;\
        proxy_set_header Connection "upgrade";\
        proxy_set_header X-Real-IP $remote_addr;\
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\
    }\
    location /socket.io {\
        proxy_pass http://127.0.0.1:9001/socket.io;\
        proxy_set_header Host $host;\
        proxy_buffering off;\
        proxy_http_version 1.1;\
        proxy_set_header Upgrade $http_upgrade;\
        proxy_set_header Connection "upgrade";\
    }\
    location /static/ {\
        proxy_pass http://127.0.0.1:9001/static/;\
        proxy_set_header Host $host;\
    }\
    location /javascripts/ {\
        proxy_pass http://127.0.0.1:9001/javascripts/;\
        proxy_set_header Host $host;\
    }\
    location /pluginfw/ {\
        proxy_pass http://127.0.0.1:9001/pluginfw/;\
        proxy_set_header Host $host;\
    }\
    location /locales/ {\
        proxy_pass http://127.0.0.1:9001/locales/;\
        proxy_set_header Host $host;\
    }\
    location /p/ {\
        proxy_pass http://127.0.0.1:9001/p/;\
        proxy_set_header Host $host;\
        proxy_buffering off;\
        proxy_http_version 1.1;\
        proxy_set_header Upgrade $http_upgrade;\
        proxy_set_header Connection "upgrade";\
    }\
    # ETHERPAD_PROXY_END\
' "$CONF_FILE"

    nginx -t && nginx -s reload
    echo "🎉🎉🎉 Nginx 全套 Etherpad 代理规则已成功生效！"
else
    echo "⚠️ 未找到默认 Nginx 配置文件！"
fi
