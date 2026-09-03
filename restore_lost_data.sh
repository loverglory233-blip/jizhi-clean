#!/usr/bin/env bash
# ==============================================================================
# 🔍 集智平台 - 历史任务与教务数据全盘深度抢救恢复脚本
# ==============================================================================

echo "🔍 1. 正在全盘扫描历史数据库备份与 JSON 快照文件..."
BACKUP_FILES=$(find /www/backup /www/wwwroot -name "*.sql" -o -name "*global_db*.json" -o -name "*db_*.json" 2>/dev/null)

echo "📄 扫描到的潜在备份文件列表:"
echo "$BACKUP_FILES"
echo "--------------------------------------------------------"

echo "🔍 2. 检查 MySQL 数据库中各关系表（tasks, classes, users）现有记录数..."
php -r "
require_once '/www/wwwroot/47.99.110.230/api/db_config.php';
\$pdo = getDbConnection();
if (\$pdo) {
    echo '📊 数据库连接成功！正在统计记录：\n';
    try {
        \$tCount = \$pdo->query('SELECT COUNT(*) FROM tasks')->fetchColumn();
        echo '  - tasks 任务表记录数: ' . \$tCount . '\n';
        \$stmtT = \$pdo->query('SELECT id, title, created_at_str FROM tasks');
        while (\$r = \$stmtT->fetch(PDO::FETCH_ASSOC)) {
            echo '    👉 [任务] ' . \$r['id'] . ': ' . \$r['title'] . ' (' . (\$r['created_at_str'] ?? '') . ')\n';
        }
    } catch(Exception \$e) { echo '  - tasks 表读取异常: ' . \$e->getMessage() . '\n'; }

    try {
        \$cCount = \$pdo->query('SELECT COUNT(*) FROM classes')->fetchColumn();
        echo '  - classes 班级表记录数: ' . \$cCount . '\n';
        \$stmtC = \$pdo->query('SELECT id, name, code FROM classes');
        while (\$r = \$stmtC->fetch(PDO::FETCH_ASSOC)) {
            echo '    👉 [班级] ' . \$r['id'] . ': ' . \$r['name'] . ' (' . \$r['code'] . ')\n';
        }
    } catch(Exception \$e) { echo '  - classes 表读取异常: ' . \$e->getMessage() . '\n'; }

    try {
        \$uCount = \$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
        echo '  - users 用户表记录数: ' . \$uCount . '\n';
        \$stmtU = \$pdo->query('SELECT id, username, name, role FROM users LIMIT 15');
        while (\$r = \$stmtU->fetch(PDO::FETCH_ASSOC)) {
            echo '    👉 [用户] ' . \$r['username'] . ' (' . \$r['name'] . ', ' . \$r['role'] . ')\n';
        }
    } catch(Exception \$e) { echo '  - users 表读取异常: ' . \$e->getMessage() . '\n'; }
} else {
    echo '❌ MySQL 数据库无法连接！\n';
}
"

echo "--------------------------------------------------------"
echo "🛠️ 3. 正在将所有独立实体表（tasks/classes/users）中的真实数据重新聚合写入 main_meta 快照..."
php -r "
require_once '/www/wwwroot/47.99.110.230/api/db_config.php';
\$pdo = getDbConnection();
if (\$pdo) {
    \$tasks = [];
    \$stmtT = \$pdo->query('SELECT * FROM tasks');
    if (\$stmtT) {
        while (\$tr = \$stmtT->fetch(PDO::FETCH_ASSOC)) {
            \$tasks[] = [
                'id' => \$tr['id'],
                'title' => \$tr['title'],
                'desc' => \$tr['desc'] ?? '',
                'instructions' => \$tr['desc'] ?? '',
                'durationMinutes' => intval(\$tr['duration_minutes'] ?? 150),
                'deadline' => \$tr['deadline'] ?? '',
                'status' => \$tr['status'] ?? 'in_progress',
                'createdAt' => \$tr['created_at_str'] ?? '',
                'classId' => (\$tr['target_class_ids'] ? (json_decode(\$tr['target_class_ids'], true)[0] ?? 'class_101') : 'class_101')
            ];
        }
    }

    \$classes = [];
    \$stmtC = \$pdo->query('SELECT * FROM classes');
    if (\$stmtC) {
        while (\$cr = \$stmtC->fetch(PDO::FETCH_ASSOC)) {
            \$classes[] = [
                'id' => \$cr['id'],
                'name' => \$cr['name'],
                'code' => \$cr['code'],
                'studentIds' => json_decode(\$cr['student_ids'] ?? '[]', true) ?: [],
                'groups' => json_decode(\$cr['groups_data'] ?? '[]', true) ?: []
            ];
        }
    }

    \$users = [];
    \$stmtU = \$pdo->query('SELECT id, name, role, avatar, class_id, group_id FROM users');
    if (\$stmtU) {
        while (\$ur = \$stmtU->fetch(PDO::FETCH_ASSOC)) {
            \$users[] = [
                'id' => \$ur['id'],
                'name' => \$ur['name'],
                'role' => \$ur['role'],
                'avatar' => \$ur['avatar'] ?: '👤',
                'classId' => \$ur['class_id'] ?? '',
                'groupId' => \$ur['group_id'] ?? ''
            ];
        }
    }

    \$meta = [
        'users' => \$users,
        'classes' => \$classes,
        'tasks' => \$tasks,
        'announcements' => [],
        'referencePapers' => []
    ];
    \$json = json_encode(\$meta, JSON_UNESCAPED_UNICODE);
    \$stmtSave = \$pdo->prepare('INSERT INTO global_meta (meta_key, meta_value) VALUES (\'main_meta\', :v) ON DUPLICATE KEY UPDATE meta_value = :v2');
    \$stmtSave->execute([':v' => \$json, ':v2' => \$json]);
    @file_put_contents('/www/wwwroot/47.99.110.230/global_db.json', \$json);
    echo '✅ 已成功将所有数据库实体表数据重新聚合恢复至 main_meta 快照！\n';
}
"

echo "🎉 数据抢救扫描与聚合恢复执行完毕！"
