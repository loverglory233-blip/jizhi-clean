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

$stmt = $pdo->query("SELECT id, username, student_code, name, role, password FROM users");
$users = $stmt->fetchAll(PDO::FETCH_ASSOC);

if (empty($users)) {
    echo "⚠️ users 表中目前没有任何记录！\n";
} else {
    foreach ($users as $idx => $u) {
        $p = $u['password'];
        $isHash = (strlen($p) >= 50 && substr($p, 0, 4) === '$2y$');
        $verify123 = password_verify('123', $p) ? '✅ 通过' : ($p === '123' ? '✅ 明文123' : '❌ 不匹配');
        
        echo "[$idx] 工号/学号: {$u['student_code']} | 用户名: {$u['username']} | 姓名: {$u['name']} | 角色: {$u['role']}\n";
        echo "    🔑 当前密码值: " . (strlen($p) > 20 ? substr($p, 0, 15) . '... (Bcrypt哈希)' : "'$p'") . "\n";
        echo "    🧪 用'123'校验结果: $verify123\n";
        echo "--------------------------------------------------------\n";
    }
}

echo "\n========================================================\n";
echo "🛠️ 2. 自动校准：将教师工号 1001 与初始用户密码全部统一重置为 123 (双向兼容)\n";
echo "========================================================\n";

// 强制为教师 1001 写入最纯净的标准密码哈希
$hash123 = password_hash('123', PASSWORD_DEFAULT);

// 确保 1001 记录存在且密码为 123
$stmtFix = $pdo->prepare("INSERT INTO users (id, username, student_code, name, password, role) 
    VALUES ('1001', '1001', '1001', '指导教师', :p, 'teacher') 
    ON DUPLICATE KEY UPDATE password = :p2, student_code = '1001', username = '1001', role = 'teacher'");
$stmtFix->execute([':p' => $hash123, ':p2' => $hash123]);

// 同时更新可能存在的 u_teacher1 历史主键记录
$pdo->exec("UPDATE users SET password = '$hash123' WHERE id = 'u_teacher1' OR username = '1001' OR student_code = '1001'");

// 同步更新 global_meta 中的 main_meta
$stmtMeta = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = 'main_meta'");
$stmtMeta->execute();
$row = $stmtMeta->fetch();
if ($row && !empty($row['meta_value'])) {
    $gm = json_decode($row['meta_value'], true) ?: [];
    if (isset($gm['users']) && is_array($gm['users'])) {
        foreach ($gm['users'] as &$gu) {
            $sc = $gu['studentCode'] ?? ($gu['username'] ?? ($gu['id'] ?? ''));
            if ($sc === '1001' || $sc === 'u_teacher1') {
                $gu['password'] = $hash123;
            }
        }
        $encodedGm = json_encode($gm, JSON_UNESCAPED_UNICODE);
        $stmtSave = $pdo->prepare("UPDATE global_meta SET meta_value = :v WHERE meta_key = 'main_meta'");
        $stmtSave->execute([':v' => $encodedGm]);
    }
}

echo "✅ 教师 1001 密码已 100% 成功校准重置为 123！\n";
echo "🎉 数据库审查与自动校准完成！\n";
