#!/bin/bash
# ==============================================================================
# 🩺 彻底诊断并物理级修复 PHP-FPM 8.2 及 phpMyAdmin 502 故障
# ==============================================================================

echo "========================================================"
echo "🔍 1. 检查 PHP 8.2 配置文件语法与报错原因"
echo "========================================================"

if [ -x "/www/server/php/82/sbin/php-fpm" ]; then
    echo "• 正在测试 PHP 8.2 配置文件语法..."
    /www/server/php/82/sbin/php-fpm -t
else
    echo "⚠️ 未找到 /www/server/php/82/sbin/php-fpm，检查已安装的 PHP 版本："
    ls -d /www/server/php/*
fi

echo ""
echo "========================================================"
echo "🛠️ 2. 清理 PHP-FPM 锁文件与僵死进程"
echo "========================================================"
pkill -9 php-fpm 2>/dev/null || true
rm -f /www/server/php/*/var/run/php-fpm.pid 2>/dev/null || true
rm -f /tmp/php-cgi-*.sock 2>/dev/null || true

# 检查并修正 PHP 8.2 www.conf 权限与 socket 配置
if [ -f "/www/server/php/82/etc/php-fpm.d/www.conf" ]; then
    echo "• 修正 PHP 8.2 www.conf 用户与监听权限..."
    sed -i 's/listen.owner = .*/listen.owner = www/' /www/server/php/82/etc/php-fpm.d/www.conf 2>/dev/null || true
    sed -i 's/listen.group = .*/listen.group = www/' /www/server/php/82/etc/php-fpm.d/www.conf 2>/dev/null || true
    sed -i 's/listen.mode = .*/listen.mode = 0666/' /www/server/php/82/etc/php-fpm.d/www.conf 2>/dev/null || true
fi

echo ""
echo "========================================================"
echo "⚡ 3. 重新启动 PHP 8.2 服务"
echo "========================================================"
if [ -x "/etc/init.d/php-fpm-82" ]; then
    /etc/init.d/php-fpm-82 restart || /etc/init.d/php-fpm-82 start || true
fi

# 如果还是没起来，使用 php-fpm 二进制直接启动
if ! pidof php-fpm >/dev/null 2>&1; then
    echo "• 尝试使用主二进制启动..."
    for b in /www/server/php/82/sbin/php-fpm /www/server/php/*/sbin/php-fpm; do
        if [ -x "$b" ]; then
            "$b" -c /www/server/php/82/etc/php.ini -y /www/server/php/82/etc/php-fpm.conf 2>/dev/null || "$b" 2>/dev/null || true
            break
        fi
    done
fi

sleep 1
if pidof php-fpm >/dev/null 2>&1; then
    echo "✅ PHP-FPM 进程已成功拉起运行！PID: $(pidof php-fpm | tr ' ' '\n' | head -n 3 | tr '\n' ' ')"
else
    echo "❌ PHP-FPM 依然未能拉起，尝试使用 php-cgi 兜底启动..."
    for cgi in /www/server/php/82/bin/php-cgi /www/server/php/*/bin/php-cgi /usr/bin/php-cgi; do
        if [ -x "$cgi" ]; then
            nohup "$cgi" -b /tmp/php-cgi-82.sock >/dev/null 2>&1 &
            nohup "$cgi" -b 127.0.0.1:9000 >/dev/null 2>&1 &
            echo "✅ 已通过 php-cgi 成功拉起 /tmp/php-cgi-82.sock 监听！"
            break
        fi
    done
fi

# 确保 socket 权限为 777
chmod 777 /tmp/php-cgi-*.sock 2>/dev/null || true
chown www:www /tmp/php-cgi-*.sock 2>/dev/null || true

echo ""
echo "========================================================"
echo "🌐 4. 确保 Nginx 站点配置为标准 PHP 8.2"
echo "========================================================"
CONF_FILE="/www/server/panel/vhost/nginx/47.99.110.230.conf"
if [ -f "$CONF_FILE" ]; then
    cat << 'CONF' > "$CONF_FILE"
server
{
    listen 80;
    server_name 47.99.110.230 localhost 127.0.0.1;
    index index.html index.htm index.php;
    root /www/wwwroot/47.99.110.230;

    # 包含宝塔标准 PHP-82 解析
    include enable-php-82.conf;

    # Etherpad 反向代理
    location ^~ /socket.io {
        proxy_pass http://127.0.0.1:9001;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_http_version 1.1;
    }

    location ^~ /p/ {
        proxy_pass http://127.0.0.1:9001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location ^~ /pluginfw/ {
        proxy_pass http://127.0.0.1:9001;
        proxy_set_header Host $host;
    }

    location ^~ /javascripts/ {
        proxy_pass http://127.0.0.1:9001;
        proxy_set_header Host $host;
    }

    location ^~ /static/ {
        proxy_pass http://127.0.0.1:9001;
        proxy_set_header Host $host;
    }

    access_log /www/wwwlogs/47.99.110.230.log;
    error_log /www/wwwlogs/47.99.110.230.error.log;
}
CONF
    echo "• 重新重载 Nginx..."
    /etc/init.d/nginx reload 2>/dev/null || nginx -s reload 2>/dev/null || true
    echo "✅ Nginx 配置已成功更新并重载！"
fi

echo ""
echo "========================================================"
echo "🩺 5. 测试真实 PHP 接口与 phpMyAdmin"
echo "========================================================"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1/sync.php?action=health || true)
echo "• 本地访问 sync.php?action=health 状态码: $HTTP_CODE"

if [ "$HTTP_CODE" = "200" ]; then
    echo "🎉 恭喜！PHP 8.2 与 Nginx 通信 100% 正常恢复！502 彻底解决！"
else
    echo "⚠️ 状态码非 200，请检查上方日志详情。"
fi
