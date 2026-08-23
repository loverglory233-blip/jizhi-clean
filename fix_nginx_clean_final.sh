#!/bin/bash
set -e

echo "🔧 正在彻底修复 Nginx 配置语法与注入 PHP 8.2 解析..."

# 1. 恢复 0.default.conf 为干净的默认占位
cat << 'DEF_EOF' > /www/server/panel/vhost/nginx/0.default.conf
server
{
    listen 80 default_server;
    server_name _;
    return 444;
}
DEF_EOF

# 2. 找到主站配置文件
MAIN_CONF="/www/server/panel/vhost/nginx/47.99.110.230.conf"
if [ ! -f "$MAIN_CONF" ]; then
    MAIN_CONF=$(find /www/server/panel/vhost/nginx/ -type f -name "*47.99.110.230*.conf" -o -name "*jizhiedu.top*.conf" | head -n 1)
fi

echo "📝 正在精准配置主站: $MAIN_CONF"

# 3. 清理主站配置文件中的旧代理与旧规则
sed -i '/# ETHERPAD_PROXY_START/,/# ETHERPAD_PROXY_END/d' "$MAIN_CONF" || true
sed -i '/location \^~ \/p\//,/}/d' "$MAIN_CONF" || true
sed -i '/location \^~ \/socket\.io\//,/}/d' "$MAIN_CONF" || true
sed -i '/location \^~ \/static\//,/}/d' "$MAIN_CONF" || true
sed -i '/location \^~ \/javascripts\//,/}/d' "$MAIN_CONF" || true
sed -i '/location \^~ \/pluginfw\//,/}/d' "$MAIN_CONF" || true
sed -i '/location \^~ \/locales\//,/}/d' "$MAIN_CONF" || true
sed -i '/location \/p\//,/}/d' "$MAIN_CONF" || true
sed -i '/location \/socket\.io/,/}/d' "$MAIN_CONF" || true
sed -i '/location \/etherpad\//,/}/d' "$MAIN_CONF" || true
sed -i '/enable-php.*\.conf/d' "$MAIN_CONF" || true

# 4. 在 server_name 之后精准注入 Etherpad 反代与 PHP 8.2 解析
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
    include enable-php-82.conf;\
    # ETHERPAD_PROXY_END\
" "$MAIN_CONF"

# 5. 测试并重载 Nginx
nginx -t
nginx -s reload
echo "🎉🎉🎉 Nginx 语法测试 100% 通过，PHP 8.2 与 Etherpad 已完美上线！"
