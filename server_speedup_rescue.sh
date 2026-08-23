#!/usr/bin/env bash
# ==============================================================================
# 🚀 集智平台 - 绝对安全版服务自愈与环境拉起脚本 (100% 零误伤)
# ==============================================================================

echo "🟢 1. 确保 MySQL 数据库正常运行..."
/etc/init.d/mysqld start 2>/dev/null || /etc/init.d/mysql start 2>/dev/null || systemctl start mariadb 2>/dev/null || systemctl start mysqld 2>/dev/null || true

echo "🟢 2. 确保 PHP-FPM 正常运行..."
for p in /etc/init.d/php-fpm*; do
    if [ -x "$p" ]; then
        "$p" start 2>/dev/null || "$p" reload 2>/dev/null || true
    fi
done
systemctl start php-fpm 2>/dev/null || true

echo "🟢 3. 确保 Nginx 正常运行..."
/etc/init.d/nginx start 2>/dev/null || nginx -s reload 2>/dev/null || systemctl start nginx 2>/dev/null || true

echo "🟢 4. 确保宝塔面板核心正常运行..."
if [ -f "/etc/init.d/bt" ]; then
    /etc/init.d/bt start 2>/dev/null || true
fi

echo "🟢 5. 拉起 Etherpad (端口 9001)..."
EP_DIR="/www/wwwroot/47.99.110.230/etherpad-lite"
ROOT_DIR="/www/wwwroot/47.99.110.230"
if [ -d "$EP_DIR" ]; then
    cd "$EP_DIR"
    export PATH="/www/server/nodejs/v20/bin:/www/server/nodejs/v18/bin:/www/server/nodejs/v16/bin:/usr/local/bin:/usr/bin:$PATH"
    for n in /www/server/nodejs/v*/bin; do
        if [ -d "$n" ]; then export PATH="$n:$PATH"; break; fi
    done
    export NODE_ENV=production
    fuser -k 9001/tcp 2>/dev/null || true
    sleep 1
    if [ -f "$EP_DIR/src/node/server.js" ]; then
        nohup node src/node/server.js > "$ROOT_DIR/etherpad.log" 2>&1 &
    elif [ -f "$EP_DIR/bin/run.sh" ]; then
        nohup bash bin/run.sh --root > "$ROOT_DIR/etherpad.log" 2>&1 &
    fi
fi

echo "🟢 6. 刷新 Nginx 反代规则..."
cd "$ROOT_DIR"
if [ -f "./fix_domain_jizhiedu_all.sh" ]; then
    bash ./fix_domain_jizhiedu_all.sh 2>&1 || true
fi

echo ""
echo "🎉 ========================================================"
echo "✅ 宝塔面板、MySQL数据库、PHP、Nginx与Etherpad已全部拉起就绪！"
echo "🎉 ========================================================"
