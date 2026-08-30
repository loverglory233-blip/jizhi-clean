#!/bin/bash
set -e

echo "🔧 正在为宝塔所有域名站点（包括 jizhiedu.top）批量注入 Etherpad 反向代理规则..."

NGINX_CONF_DIR="/www/server/panel/vhost/nginx"

PROXY_BLOCK='
    # ETHERPAD_PROXY_START
    location /socket.io {
        proxy_pass http://127.0.0.1:9001/socket.io;
        proxy_set_header Host $host;
        proxy_buffering off;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        # ⚡ WebSocket 实时通道：绝不缓存，0 延迟
    }
    location /static/ {
        proxy_pass http://127.0.0.1:9001/static/;
        proxy_set_header Host $host;
        # ⚡ 静态外壳资源：开启 Gzip 压缩 + 6 小时浏览器强缓存，带宽消耗降低 90%+
        gzip on;
        gzip_types text/javascript application/javascript text/css;
        gzip_min_length 1024;
        expires 6h;
        add_header Cache-Control "public, max-age=21600";
    }
    location /javascripts/ {
        proxy_pass http://127.0.0.1:9001/javascripts/;
        proxy_set_header Host $host;
        gzip on;
        gzip_types text/javascript application/javascript;
        gzip_min_length 1024;
        expires 6h;
        add_header Cache-Control "public, max-age=21600";
    }
    location /pluginfw/ {
        proxy_pass http://127.0.0.1:9001/pluginfw/;
        proxy_set_header Host $host;
        gzip on;
        gzip_types text/javascript application/javascript text/css;
        gzip_min_length 1024;
        expires 6h;
        add_header Cache-Control "public, max-age=21600";
    }
    location /locales/ {
        proxy_pass http://127.0.0.1:9001/locales/;
        proxy_set_header Host $host;
        expires 6h;
        add_header Cache-Control "public, max-age=21600";
    }
    location /p/ {
        proxy_pass http://127.0.0.1:9001/p/;
        proxy_set_header Host $host;
        proxy_buffering off;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        # ⚡ Pad 实时文档页：不缓存，保障实时协同 0 破坏
    }
    location /etherpad/ {
        proxy_pass http://127.0.0.1:9001/;
        proxy_set_header Host $host;
        proxy_buffering off;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
    # ETHERPAD_PROXY_END
'

for CONF_FILE in "$NGINX_CONF_DIR"/*.conf; do
    if [ -f "$CONF_FILE" ]; then
        echo "📝 处理配置文件: $CONF_FILE"
        # 清除旧规则
        sed -i '/# ETHERPAD_PROXY_START/,/# ETHERPAD_PROXY_END/d' "$CONF_FILE" || true
        
        # 寻找 location / 或 root / 进行插入
        if grep -q "location / {" "$CONF_FILE"; then
            sed -i '/location \/ {/i \
    # ETHERPAD_PROXY_START\
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
            echo "   ✅ 成功注入: $CONF_FILE"
        fi
    fi
done

nginx -t && nginx -s reload
echo "🎉🎉🎉 全站 Nginx 反向代理已全量批量生效！"
