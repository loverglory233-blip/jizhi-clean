<?php
// ==============================================================================
// 🧹 集智平台 - 清空历史测试学生与数据·保留唯一教师 1001·纯净重新开始
// ==============================================================================

require_once __DIR__ . '/api/db_config.php';
$pdo = getDbConnection();

if (!$pdo) {
    echo "❌ 数据库连接失败！\n";
    exit(1);
}

echo "========================================================\n";
echo "🧹 1. 正在清空所有历史测试学生记录 (仅保留教师工号 1001)...\n";
echo "========================================================\n";

// 1. 删除所有学生
$pdo->exec("DELETE FROM users WHERE role != 'teacher' OR student_code != '1001'");

// 2. 确保唯一教师 1001 存在且密码为 123
$hash123 = password_hash('123', PASSWORD_DEFAULT);
$stmtT = $pdo->prepare("INSERT INTO users (id, username, student_code, name, password, role) 
    VALUES ('1001', '1001', '1001', '老师', :p, 'teacher') 
    ON DUPLICATE KEY UPDATE username='1001', student_code='1001', name='老师', password=:p2, role='teacher'");
$stmtT->execute([':p' => $hash123, ':p2' => $hash123]);

// 3. 清理历史测试班级与分组
$pdo->exec("DELETE FROM classes");
$stmtC = $pdo->prepare("INSERT INTO classes (id, name, code, student_ids, groups_data) VALUES ('class_101', '《现代教育技术》2026春01班', 'ET2026-01', '[]', '[]')");
$stmtC->execute();

// 4. 清理历史任务、通知、范文与聊天记录
$pdo->exec("DELETE FROM tasks");
$pdo->exec("DELETE FROM announcements");
$pdo->exec("DELETE FROM reference_papers");
$pdo->exec("DELETE FROM group_states");
$pdo->exec("DELETE FROM chat_messages");

// 5. 生成纯净初始 main_meta
$freshMeta = [
    'users' => [
        [
            'id' => '1001',
            'username' => '1001',
            'studentCode' => '1001',
            'name' => '老师',
            'role' => 'teacher',
            'avatar' => '👩‍🏫'
        ]
    ],
    'classes' => [
        [
            'id' => 'class_101',
            'name' => '《现代教育技术》2026春01班',
            'code' => 'ET2026-01',
            'studentIds' => [],
            'groups' => []
        ]
    ],
    'tasks' => [],
    'announcements' => [],
    'referencePapers' => [],
    'surveys' => []
];

$jsonStr = json_encode($freshMeta, JSON_UNESCAPED_UNICODE);
$stmtMeta = $pdo->prepare("INSERT INTO global_meta (meta_key, meta_value) VALUES ('main_meta', :v) ON DUPLICATE KEY UPDATE meta_value = :v2");
$stmtMeta->execute([':v' => $jsonStr, ':v2' => $jsonStr]);

@file_put_contents(__DIR__ . '/global_db.json', $jsonStr);

echo "✅ 历史测试学生与数据已全部彻底清空！\n";
echo "👩‍🏫 当前系统仅保留唯一教师管理账号：工号 1001 (初始密码 123)\n";
echo "🎉 平台已恢复至最纯净的全新起跑状态，您可以自由重新录入班级、学生与任务！\n";
