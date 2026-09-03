<?php
// ==============================================================================
// 🔍 集智平台 - MySQL 数据库用户与密码真实存储全景透视脚本
// ==============================================================================

require_once __DIR__ . '/api/db_config.php';
$pdo = getDbConnection();

if (!$pdo) {
    echo "❌ 数据库连接失败！\n";
    exit(1);
}

echo "========================================================\n";
echo "📊 1. 正在审查 users 数据表中的所有用户记录与密码哈希：\n";
echo "========================================================\n";

$stmt = $pdo->query("SELECT id, name, role, password FROM users");
$users = $stmt->fetchAll(PDO::FETCH_ASSOC);

if (empty($users)) {
    echo "⚠️ users 表中目前没有任何记录！\n";
} else {
    foreach ($users as $idx => $u) {
        $p = $u['password'];
        $isHash = (strlen($p) >= 50 && substr($p, 0, 4) === '$2y$');
        $verify123 = password_verify('123', $p) ? '✅ 通过' : ($p === '123' ? '✅ 明文123' : '❌ 不匹配');
        
        echo "[$idx] 账号/学号: {$u['id']} | 姓名: {$u['name']} | 角色: {$u['role']}\n";
        echo "    🔑 当前密码值: " . (strlen($p) > 20 ? substr($p, 0, 15) . '... (Bcrypt哈希)' : "'$p'") . "\n";
        echo "    🧪 用'123'校验结果: $verify123\n";
        echo "--------------------------------------------------------\n";
    }
}

echo "\n========================================================\n";
echo "🛠️ 2. 自动校准：将教师工号 1001 与初始用户密码全部统一重置为纯明文 '123' (彻底告别哈希)\n";
echo "========================================================\n";

// 确保 1001 记录存在且密码为明文 '123'
$stmtFix = $pdo->prepare("INSERT INTO users (id, name, password, role) 
    VALUES ('1001', '老师', '123', 'teacher') 
    ON DUPLICATE KEY UPDATE password = '123', name = '老师', role = 'teacher'");
$stmtFix->execute();

// 将所有学生的密码也全部统一为明文
$pdo->exec("UPDATE users SET password = '123' WHERE password LIKE '$2y$%' OR password = '' OR password IS NULL");

// 同步更新 global_meta 中的 main_meta
$stmtMeta = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = 'main_meta'");
$stmtMeta->execute();
$row = $stmtMeta->fetch();
if ($row && !empty($row['meta_value'])) {
    $gm = json_decode($row['meta_value'], true) ?: [];
    if (isset($gm['users']) && is_array($gm['users'])) {
        foreach ($gm['users'] as &$gu) {
            $sc = $gu['studentCode'] ?? ($gu['username'] ?? ($gu['id'] ?? ''));
            if ($sc === '1001') {
                $gu['password'] = '123';
            }
        }
        $encodedGm = json_encode($gm, JSON_UNESCAPED_UNICODE);
        $stmtSave = $pdo->prepare("UPDATE global_meta SET meta_value = :v WHERE meta_key = 'main_meta'");
        $stmtSave->execute([':v' => $encodedGm]);
    }
}

echo "✅ 教师 1001 密码已 100% 成功校准重置为 123！\n";
echo "🎉 数据库审查与自动校准完成！\n";
