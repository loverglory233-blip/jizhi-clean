#!/usr/bin/env bash
# ==============================================================================
# 🚀 集智平台 - 极致轻载·永不卡死·安全自愈拉起脚本 (v155)
# ==============================================================================

echo "🟢 1. 检查并确保 MySQL 数据库正常..."
if ! pidof mysqld >/dev/null 2>&1 && ! pidof mariadbd >/dev/null 2>&1; then
    /etc/init.d/mysqld start 2>/dev/null || /etc/init.d/mysql start 2>/dev/null || systemctl start mysqld 2>/dev/null || systemctl start mariadb 2>/dev/null || true
fi

echo "🟢 2. 检查并确保 PHP-FPM 正常运行..."
for p in /etc/init.d/php-fpm*; do
    if [ -x "$p" ]; then
        "$p" start 2>/dev/null || "$p" reload 2>/dev/null || true
    fi
done

echo "🟢 3. 检查并平滑重载 Nginx..."
/etc/init.d/nginx reload 2>/dev/null || nginx -s reload 2>/dev/null || systemctl reload nginx 2>/dev/null || /etc/init.d/nginx start 2>/dev/null || true

echo "🟢 4. 确保宝塔核心守护正常..."
if [ -f "/etc/init.d/bt" ]; then
    /etc/init.d/bt start 2>/dev/null || true
fi

echo "🟢 5. 启动轻量 Etherpad 9001 守护进程 (限制内存防卡死)..."
EP_DIR="/www/wwwroot/47.99.110.230/etherpad-lite"
ROOT_DIR="/www/wwwroot/47.99.110.230"
if [ -d "$EP_DIR" ]; then
    cd "$EP_DIR"
    export PATH="/www/server/nodejs/v20/bin:/www/server/nodejs/v18/bin:/www/server/nodejs/v16/bin:/usr/local/bin:/usr/bin:$PATH"
    for n in /www/server/nodejs/v*/bin; do
        if [ -d "$n" ]; then export PATH="$n:$PATH"; break; fi
    done
    
    # 仅当 9001 端口没有响应时才拉起，避免重复拉起多个实例
    if ! curl -s -I http://127.0.0.1:9001/p/test | grep -E "HTTP/(1.1|2)" >/dev/null 2>&1; then
        fuser -k 9001/tcp 2>/dev/null || true
        sleep 1
        export NODE_ENV=production
        # 限制 Node 最大内存 384MB，绝不吃满服务器内存
        export NODE_OPTIONS="--max-old-space-size=384"
        if [ -f "$EP_DIR/src/node/server.js" ]; then
            nohup node src/node/server.js > "$ROOT_DIR/etherpad.log" 2>&1 &
        elif [ -f "$EP_DIR/bin/run.sh" ]; then
            nohup bash bin/run.sh --root > "$ROOT_DIR/etherpad.log" 2>&1 &
        fi
        echo "🟢 已轻量拉起 Etherpad (最大限制 384M 内存)"
    else
        echo "🟢 Etherpad 9001 端口已处于健康运行状态，无需重复启动"
    fi
fi

echo "🟢 6. 刷新并同步 Nginx 域名与 IP 反代规则..."
cd "$ROOT_DIR"
if [ -f "./fix_domain_jizhiedu_all.sh" ]; then
    bash ./fix_domain_jizhiedu_all.sh 2>&1 || true
fi

echo ""
echo "🎉 ========================================================"
echo "✅ 服务守护与系统环境已全部检查就绪！"
echo "📊 当前服务器内存占用状态："
free -h || true
echo "🎉 ========================================================"
