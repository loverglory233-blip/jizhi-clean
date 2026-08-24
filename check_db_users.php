<?php
/**
 * 集智平台 - 数据库账号诊断脚本
 * 访问：http://47.99.110.230/check_db_users.php
 * 查看完毕后请删除此文件！
 */
require_once __DIR__ . '/api/db_config.php';
$pdo = getDbConnection();
if (!$pdo) {
    die("❌ 数据库连接失败: 请检查 MySQL 服务与 api/db_config.php 配置");
}

echo "<meta charset='utf-8'><style>body{font-family:monospace;padding:20px;} table{border-collapse:collapse;width:100%;} td,th{border:1px solid #ccc;padding:8px 12px;text-align:left;} tr:nth-child(even){background:#f9f9f9;} .ok{color:green;font-weight:bold;} .err{color:red;font-weight:bold;}</style>";
echo "<h2>🔍 集智平台 - 数据库账号诊断</h2>";

// 1. users 实体表
echo "<h3>① users 实体表（登录时直接查这里）</h3>";
$stmt = $pdo->query("SELECT id, username, student_code, name, role, LEFT(password,20) as pwd_preview FROM users ORDER BY role DESC, id ASC");
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
if ($rows) {
    echo "<table><tr><th>id</th><th>username</th><th>student_code</th><th>name</th><th>role</th><th>密码(前20位)</th></tr>";
    foreach ($rows as $r) {
        echo "<tr><td>{$r['id']}</td><td>{$r['username']}</td><td>{$r['student_code']}</td><td>{$r['name']}</td><td class='ok'>{$r['role']}</td><td>{$r['pwd_preview']}</td></tr>";
    }
    echo "</table><p class='ok'>✅ users 表共 " . count($rows) . " 条记录</p>";
} else {
    echo "<p class='err'>❌ users 表为空！学生账号没有写入实体表！</p>";
}

// 2. global_meta main_meta 里的用户
echo "<h3>② global_meta 的 main_meta 中的用户（教师在前端创建账号存这里）</h3>";
$stmt2 = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = 'main_meta'");
$stmt2->execute();
$metaRow = $stmt2->fetch();
if ($metaRow && !empty($metaRow['meta_value'])) {
    $gm = json_decode($metaRow['meta_value'], true) ?: [];
    $gUsers = $gm['users'] ?? [];
    if ($gUsers) {
        echo "<table><tr><th>id</th><th>studentCode/username</th><th>name</th><th>role</th><th>password</th></tr>";
        foreach ($gUsers as $u) {
            $sc = htmlspecialchars($u['studentCode'] ?? $u['username'] ?? $u['id'] ?? '-');
            $id = htmlspecialchars($u['id'] ?? '-');
            $nm = htmlspecialchars($u['name'] ?? '-');
            $ro = htmlspecialchars($u['role'] ?? '-');
            $pw = htmlspecialchars($u['password'] ?? '-');
            echo "<tr><td>{$id}</td><td>{$sc}</td><td>{$nm}</td><td>{$ro}</td><td>{$pw}</td></tr>";
        }
        echo "</table><p class='ok'>✅ main_meta 中共 " . count($gUsers) . " 个用户</p>";
    } else {
        echo "<p class='err'>❌ main_meta 存在但 users 字段为空！</p>";
    }
} else {
    echo "<p class='err'>❌ global_meta 中没有 main_meta！教师数据从未推送到服务器！</p>";
}

// 3. 教师 session
echo "<h3>③ 教师 Session 状态（影响 save_global_meta 能否鉴权通过）</h3>";
$stmt3 = $pdo->query("SELECT meta_key, LEFT(meta_value,40) as val FROM global_meta WHERE meta_key LIKE 'sess_%'");
$sessRows = $stmt3->fetchAll(PDO::FETCH_ASSOC);
if ($sessRows) {
    echo "<table><tr><th>key</th><th>token(前40位)</th></tr>";
    foreach ($sessRows as $s) {
        echo "<tr><td>" . htmlspecialchars($s['meta_key']) . "</td><td class='ok'>" . htmlspecialchars($s['val']) . "</td></tr>";
    }
    echo "</table>";
} else {
    echo "<p class='err'>❌ 没有教师 session！这会导致 save_global_meta 直接 403 拒绝，学生账号无法写入数据库！<br>请在宝塔服务器上重新用教师账号登录一次。</p>";
}

echo "<hr><p style='color:gray;'>⚠️ 查看完毕后请执行 rm /www/wwwroot/47.99.110.230/check_db_users.php 删除此文件</p>";
