#!/usr/bin/env bash
# ==============================================================================
# 🚀 集智平台 - 云服务器极速降压、清理僵尸进程与性能自愈拯救脚本
# ==============================================================================

echo "🔍 1. 正在排查系统当前资源消耗状况 (CPU/内存/高负载进程)..."
echo "--------------------------------------------------------"
free -h || true
echo "--------------------------------------------------------"
echo "📊 CPU 占用前 5 的进程:"
ps aux --sort=-%cpu | head -n 6 || true
echo "--------------------------------------------------------"
echo "📊 内存占用前 5 的进程:"
ps aux --sort=-%mem | head -n 6 || true
echo "--------------------------------------------------------"

echo "🧹 2. 强力清理所有僵尸/残留的 Node.js 与 Etherpad 孤儿进程..."
fuser -k 9001/tcp 2>/dev/null || true
pkill -9 -f "etherpad" 2>/dev/null || true
pkill -9 -f "server.js" 2>/dev/null || true
sleep 1

echo "⚡ 3. 优化 PHP-FPM 进程池与超时控制 (防止并发堵塞导致服务器卡死)..."
for conf in /www/server/php/*/etc/php-fpm.d/www.conf /www/server/php/*/etc/php-fpm.conf; do
    if [ -f "$conf" ]; then
        sed -i 's/^request_terminate_timeout = .*/request_terminate_timeout = 15s/g' "$conf" 2>/dev/null || true
        sed -i 's/^pm.max_children = .*/pm.max_children = 60/g' "$conf" 2>/dev/null || true
        sed -i 's/^pm.max_requests = .*/pm.max_requests = 1000/g' "$conf" 2>/dev/null || true
    fi
done

echo "🔄 4. 平滑重启核心服务 (释放锁与连接池)..."
/etc/init.d/php-fpm-82 restart 2>/dev/null || /etc/init.d/php-fpm restart 2>/dev/null || systemctl restart php-fpm 2>/dev/null || true
/etc/init.d/mysqld restart 2>/dev/null || systemctl restart mysqld 2>/dev/null || true
/etc/init.d/nginx restart 2>/dev/null || systemctl restart nginx 2>/dev/null || true

echo "📝 5. 重新拉起唯一定制的轻量化 Etherpad 守护进程..."
EP_DIR="/www/wwwroot/47.99.110.230/etherpad-lite"
ROOT_DIR="/www/wwwroot/47.99.110.230"
if [ -d "$EP_DIR" ]; then
    cd "$EP_DIR"
    export PATH="/www/server/nodejs/v20/bin:/www/server/nodejs/v18/bin:/www/server/nodejs/v16/bin:/usr/local/bin:/usr/bin:$PATH"
    for n in /www/server/nodejs/v*/bin; do
        if [ -d "$n" ]; then export PATH="$n:$PATH"; break; fi
    done
    export NODE_ENV=production
    if [ -f "$EP_DIR/src/node/server.js" ]; then
        nohup node src/node/server.js > "$ROOT_DIR/etherpad.log" 2>&1 &
    elif [ -f "$EP_DIR/bin/run.sh" ]; then
        nohup bash bin/run.sh --root > "$ROOT_DIR/etherpad.log" 2>&1 &
    fi
    echo "🟢 已重新拉起单一轻量 Etherpad 服务"
fi

echo "🔄 6. 刷新全量 Nginx 反代配置..."
cd "$ROOT_DIR"
if [ -f "./fix_domain_jizhiedu_all.sh" ]; then
    bash ./fix_domain_jizhiedu_all.sh 2>&1 || true
fi

echo ""
echo "🎉 ========================================================"
echo "✅ 云服务器降压与自愈完成！当前系统资源状态："
free -h || true
echo "🎉 ========================================================"
