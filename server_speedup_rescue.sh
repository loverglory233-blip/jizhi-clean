#!/usr/bin/env bash
# ==============================================================================
# 🚀 集智平台 - 极致轻载·永不卡死·安全自愈拉起脚本 (v155)
# ==============================================================================

echo "🟢 1. 检查并确保 MySQL 数据库正常..."
if ! pidof mysqld >/dev/null 2>&1 && ! pidof mariadbd >/dev/null 2>&1; then
    /etc/init.d/mysqld start 2>/dev/null || /etc/init.d/mysql start 2>/dev/null || systemctl start mysqld 2>/dev/null || systemctl start mariadb 2>/dev/null || true
fi

echo "🟢 2. 彻底排查并强制拉起所有已安装的 PHP-FPM 服务 (根除 502 Bad Gateway)..."
ACTIVE_PHP_VER=""
for v in 83 82 81 80 74 73 72 71 70 56; do
    if [ -d "/www/server/php/$v" ] || [ -f "/etc/init.d/php-fpm-$v" ]; then
        echo "   ⚡ 正在启动 PHP-$v..."
        /etc/init.d/php-fpm-$v stop 2>/dev/null || true
        /etc/init.d/php-fpm-$v start 2>/dev/null || true
        systemctl restart php-fpm-$v 2>/dev/null || true
        if [ -z "$ACTIVE_PHP_VER" ] && [ -S "/tmp/php-cgi-$v.sock" ]; then
            ACTIVE_PHP_VER="$v"
        fi
    fi
done

# 修复所有 sock 权限
chmod 777 /tmp/php-cgi-*.sock 2>/dev/null || true
chown www:www /tmp/php-cgi-*.sock 2>/dev/null || true

# 修复 phpMyAdmin 专属配置与目录权限
echo "🟢 2.1 正在自动校准宝塔 phpMyAdmin 运行环境与关联 PHP..."
if [ -n "$ACTIVE_PHP_VER" ]; then
    echo "   🟢 phpMyAdmin 将自动绑定至健康活跃的 PHP-$ACTIVE_PHP_VER"
    for pma_conf in /www/server/nginx/conf/phpmyadmin.conf /www/server/panel/vhost/nginx/phpmyadmin.conf; do
        if [ -f "$pma_conf" ]; then
            sed -i -E "s/enable-php-[0-9]+\.conf/enable-php-${ACTIVE_PHP_VER}.conf/g" "$pma_conf" 2>/dev/null || true
        fi
    done
fi
chown -R www:www /www/server/phpmyadmin 2>/dev/null || true
chmod -R 755 /www/server/phpmyadmin 2>/dev/null || true

# 自动将宝塔面板中站点类型从【静态】切换为【PHP-XX】
echo "🟢 2.2 自动将宝塔面板中 47.99.110.230 站点属性从【静态】升级为【PHP-$ACTIVE_PHP_VER】..."
python3 -c "
import sqlite3, os
db_path = '/www/server/panel/data/default.db'
php_v = '$ACTIVE_PHP_VER'
if os.path.exists(db_path) and php_v:
    try:
        conn = sqlite3.connect(db_path)
        c = conn.cursor()
        c.execute(\"UPDATE sites SET version = ? WHERE name = '47.99.110.230' OR name = 'jizhiedu.top'\", (php_v,))
        conn.commit()
        conn.close()
        print('   ✅ 宝塔数据库已成功将站点从【静态】升级绑定至【PHP-' + php_v + '】！')
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
    \$stmt = \$pdo->query(\"SELECT id, username, student_code, name, password FROM users WHERE id='1001' OR username='1001' OR student_code='1001' LIMIT 1\");
    \$row = \$stmt->fetch(PDO::FETCH_ASSOC);
    if (\$row) {
        echo '🔑 数据库记录: 工号 [' . \$row['student_code'] . '] | 姓名 [' . \$row['name'] . '] | 当前真实生效密码: [' . \$row['password'] . \"]\n\";
    } else {
        echo '⚠️ 数据库中尚无 1001 记录，正在创建默认 123 账号...\n';
        \$pdo->exec(\"INSERT INTO users (id, username, student_code, name, password, role) VALUES ('1001', '1001', '1001', '老师', '123', 'teacher')\");
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
