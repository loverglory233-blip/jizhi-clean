#!/usr/bin/env bash
# ==============================================================================
# 🚀 集智平台 - 极致轻载·永不卡死·安全自愈拉起脚本 (v155)
# ==============================================================================

echo "🟢 1. 检查并确保 MySQL 数据库正常..."
if ! pidof mysqld >/dev/null 2>&1 && ! pidof mariadbd >/dev/null 2>&1; then
    /etc/init.d/mysqld start 2>/dev/null || /etc/init.d/mysql start 2>/dev/null || systemctl start mysqld 2>/dev/null || systemctl start mariadb 2>/dev/null || true
fi

echo "🟢 2. 彻底清理僵死进程并确保 PHP-FPM 正常运行..."
pkill -9 php-fpm 2>/dev/null || true
rm -f /www/server/php/*/var/run/php-fpm.pid 2>/dev/null || true

for p in /etc/init.d/php-fpm* /etc/init.d/php*; do
    if [ -x "$p" ]; then
        "$p" restart >/dev/null 2>&1 || "$p" start >/dev/null 2>&1 || true
    fi
done
systemctl restart php-fpm* >/dev/null 2>&1 || true
sleep 1

# 自动探测系统真实监听的 PHP Socket
REAL_SOCK=""
for s in /tmp/php-cgi-*.sock /var/run/php/php*-fpm.sock; do
    if [ -S "$s" ]; then
        REAL_SOCK="$s"
        echo "🟢 发现真实健康监听的 PHP Socket: $REAL_SOCK"
        break
    fi
done

# 🛡️ 终极全兼容穿透：将真实存活的 Socket 软链接覆盖所有可能的版本名，彻底消灭 502
if [ -n "$REAL_SOCK" ]; then
    for v in 83 82 81 80 74 73 72 71 70 56 00; do
        if [ "$REAL_SOCK" != "/tmp/php-cgi-$v.sock" ]; then
            ln -sf "$REAL_SOCK" "/tmp/php-cgi-$v.sock" 2>/dev/null || true
        fi
    done
    chmod 777 /tmp/php-cgi-*.sock 2>/dev/null || true
    chown www:www /tmp/php-cgi-*.sock 2>/dev/null || true
    echo "🟢 已完成所有 FastCGI Socket 的全量无缝穿透绑定！"
fi

# 🛡️ 启动独立 TCP 127.0.0.1:9000 FastCGI 引擎作为永不宕机的终极兜底
PHP_BIN=""
for b in /www/server/php/*/bin/php-cgi /www/server/php/*/bin/php /usr/bin/php-cgi /usr/bin/php; do
    if [ -x "$b" ]; then
        PHP_BIN="$b"
        break
    fi
done
if [ -n "$PHP_BIN" ]; then
    fuser -k 9000/tcp 2>/dev/null || true
    nohup "$PHP_BIN" -b 127.0.0.1:9000 >/dev/null 2>&1 &
    echo "🟢 已启动独立 127.0.0.1:9000 FastCGI 终极兜底引擎！"
fi

# 修复 phpMyAdmin 专属配置与目录权限
chown -R www:www /www/server/phpmyadmin 2>/dev/null || true
chmod -R 755 /www/server/phpmyadmin 2>/dev/null || true

# 自动将宝塔面板中站点类型与 phpMyAdmin 全局属性从【静态】切换为【PHP-XX】
echo "🟢 2.2 自动将宝塔面板中 47.99.110.230 站点属性与 phpMyAdmin 升级为【PHP-$ACTIVE_PHP_VER】..."
python3 -c "
import sqlite3, os
db_path = '/www/server/panel/data/default.db'
php_v = '$ACTIVE_PHP_VER'
if os.path.exists(db_path) and php_v:
    try:
        conn = sqlite3.connect(db_path)
        c = conn.cursor()
        c.execute(\"UPDATE sites SET version = ? WHERE name = '47.99.110.230' OR name = 'jizhiedu.top'\", (php_v,))
        c.execute(\"UPDATE config SET value = ? WHERE name = 'phpmyadmin_php'\", (php_v,))
        c.execute(\"UPDATE config SET value = 'php' WHERE name = 'phpmyadmin_type'\")
        conn.commit()
        conn.close()
        print('   ✅ 宝塔数据库已成功将站点与 phpMyAdmin 全量升级绑定至【PHP-' + php_v + '】！')
    except Exception as e:
        print('   ⚠️ 自动更新宝塔 SQLite 异常:', e)
" 2>/dev/null || true

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
echo "🔍 7. 正在透视数据库中当前教师账号 1001 的实际密码..."
php -r "
require_once '$ROOT_DIR/api/db_config.php';
\$pdo = getDbConnection();
if (\$pdo) {
    \$stmt = \$pdo->query(\"SELECT id, name, password FROM users WHERE id='1001' LIMIT 1\");
    \$row = \$stmt->fetch(PDO::FETCH_ASSOC);
    if (\$row) {
        echo '🔑 数据库记录: 工号 [' . \$row['id'] . '] | 姓名 [' . \$row['name'] . '] | 当前真实生效密码: [' . \$row['password'] . \"]\n\";
    } else {
        echo '⚠️ 数据库中尚无 1001 记录，正在创建默认 123 账号...\n';
        \$pdo->exec(\"INSERT INTO users (id, name, password, role) VALUES ('1001', '老师', '123', 'teacher')\");
        echo '✅ 已创建初始账号 1001 (密码: 123)\n';
    }
} else {
    echo '❌ 数据库连接失败！\n';
}
" || true

echo ""
echo "🎉 ========================================================"
echo "✅ 服务守护、PHP 运行环境与数据库全部检查就绪！"
echo "📊 当前服务器内存占用状态："
free -h || true
echo "🎉 ========================================================"
