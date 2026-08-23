#!/bin/bash
set -e

echo "🔧 正在自动配置 Nginx 的 /etherpad/ HTTPS 反向代理规则..."

NGINX_CONF_DIR="/www/server/panel/vhost/nginx"
CONF_FILE=$(find "$NGINX_CONF_DIR" -type f -name "*47.99.110.230*.conf" -o -name "*jizhiedu.top*.conf" | head -n 1)

if [ -z "$CONF_FILE" ]; then
    CONF_FILE="/www/server/panel/vhost/nginx/47.99.110.230.conf"
fi

if [ -f "$CONF_FILE" ]; then
    if ! grep -q "location /etherpad/" "$CONF_FILE"; then
        echo "📝 写入反向代理规则到: $CONF_FILE"
        sed -i '/location \/ {/i \
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
' "$CONF_FILE"
        nginx -t && nginx -s reload
        echo "🎉🎉🎉 Nginx 反向代理配置成功并已平滑重载！"
    else
        echo "✅ Nginx 反向代理规则已存在！"
        nginx -s reload || true
    fi
else
    echo "⚠️ 未找到默认 Nginx 配置文件，请在宝塔面板网站设置中添加反向代理规则！"
fi
