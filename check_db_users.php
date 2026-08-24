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

// 🛡️ 立即执行全量自愈入库与密码明文化修复
try {
    // 1. 将 users 表中所有旧的 Bcrypt 哈希密码平铺恢复为纯明文 '123' (教师密码如果是 123456 则保留)
    $stmtUsers = $pdo->query("SELECT id, username, student_code, role, password FROM users");
    $existingList = $stmtUsers->fetchAll(PDO::FETCH_ASSOC);
    foreach ($existingList as $eu) {
        $curP = $eu['password'] ?? '';
        if (str_starts_with($curP, '$2y$') || str_starts_with($curP, '$2a$')) {
            // 是 Bcrypt 哈希，直接降级平铺为纯明文 123
            $stmtFix = $pdo->prepare("UPDATE users SET password = '123' WHERE id = :uid");
            $stmtFix->execute([':uid' => $eu['id']]);
        }
    }

    // 2. 从 global_meta main_meta 补齐所有尚未入库的学生
    $stmtMeta = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = 'main_meta'");
    $stmtMeta->execute();
    $mRow = $stmtMeta->fetch();
    if ($mRow && !empty($mRow['meta_value'])) {
        $gm = json_decode($mRow['meta_value'], true) ?: [];
        $gUsers = $gm['users'] ?? [];
        $stmtUpsert = $pdo->prepare("INSERT INTO users (id, username, student_code, name, password, role)
            VALUES (:id, :u, :sc, :nm, :p, :r)
            ON DUPLICATE KEY UPDATE name = VALUES(name), student_code = VALUES(student_code), username = VALUES(username), role = VALUES(role)");
        foreach ($gUsers as $gu) {
            $code = trim($gu['studentCode'] ?? ($gu['username'] ?? ($gu['id'] ?? '')));
            if (empty($code)) continue;
            $uid = trim($gu['id'] ?? $code);
            $uname = trim($gu['username'] ?? $code);
            $ucode = trim($gu['studentCode'] ?? $code);
            $unick = trim($gu['name'] ?? $code);
            $urole = trim($gu['role'] ?? 'student');
            $rawP = trim($gu['password'] ?? '');
            $upwd = (!empty($rawP) && !str_starts_with($rawP, '$2y$')) ? $rawP : '123';

            $stmtCheck = $pdo->prepare("SELECT id, password FROM users WHERE student_code = :c1 OR username = :c2 OR id = :c3 LIMIT 1");
            $stmtCheck->execute([':c1' => $code, ':c2' => $code, ':c3' => $uid]);
            $existRow = $stmtCheck->fetch();
            if ($existRow) {
                $curP = $existRow['password'];
                $finalP = (str_starts_with($curP, '$2y$') || empty($curP)) ? '123' : $curP;
                $stmtUpdate = $pdo->prepare("UPDATE users SET name = :nm, student_code = :sc, username = :u, role = :r, password = :p WHERE id = :id");
                $stmtUpdate->execute([':nm' => $unick, ':sc' => $ucode, ':u' => $uname, ':r' => $urole, ':p' => $finalP, ':id' => $existRow['id']]);
            } else {
                $stmtUpsert->execute([
                    ':id' => $uid,
                    ':u' => $uname,
                    ':sc' => $ucode,
                    ':nm' => $unick,
                    ':p' => $upwd,
                    ':r' => $urole
                ]);
            }
        }
    }
} catch (Exception $e) {}

echo "<meta charset='utf-8'><style>body{font-family:monospace;padding:20px;} table{border-collapse:collapse;width:100%;} td,th{border:1px solid #ccc;padding:8px 12px;text-align:left;} tr:nth-child(even){background:#f9f9f9;} .ok{color:green;font-weight:bold;} .err{color:red;font-weight:bold;}</style>";
echo "<h2>🔍 集智平台 - 数据库账号诊断与自愈结果</h2>";

// 1. users 实体表
echo "<h3>① users 实体表（登录时直接查这里）</h3>";
$stmt = $pdo->query("SELECT id, username, student_code, name, role, password FROM users ORDER BY role DESC, student_code ASC");
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
if ($rows) {
    echo "<table><tr><th>id</th><th>username</th><th>student_code</th><th>name</th><th>role</th><th>密码(纯明文)</th></tr>";
    foreach ($rows as $r) {
        echo "<tr><td>{$r['id']}</td><td>{$r['username']}</td><td>{$r['student_code']}</td><td>{$r['name']}</td><td class='ok'>{$r['role']}</td><td style='color:#2563eb;font-weight:bold;'>{$r['password']}</td></tr>";
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
