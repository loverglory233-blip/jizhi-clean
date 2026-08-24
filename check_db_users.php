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

// 2. classes 班级与分组表
echo "<h3>② classes 班级表（各教学班与小组成员分组实时落库）</h3>";
$stmtClasses = $pdo->query("SELECT id, name, code, student_ids, groups_data FROM classes ORDER BY id ASC");
$cRows = $stmtClasses ? $stmtClasses->fetchAll(PDO::FETCH_ASSOC) : [];
if ($cRows) {
    echo "<table><tr><th>class_id</th><th>班级名称</th><th>班级邀请码</th><th>学生人数</th><th>小组数</th></tr>";
    foreach ($cRows as $c) {
        $sidsArr = json_decode($c['student_ids'] ?? '[]', true) ?: [];
        $grpArr = json_decode($c['groups_data'] ?? '[]', true) ?: [];
        echo "<tr><td>{$c['id']}</td><td><b>" . htmlspecialchars($c['name']) . "</b></td><td>{$c['code']}</td><td>" . count($sidsArr) . " 人</td><td class='ok'>" . count($grpArr) . " 个组</td></tr>";
    }
    echo "</table><p class='ok'>✅ classes 表共 " . count($cRows) . " 个班级</p>";
} else {
    echo "<p style='color:#666;'>暂无 classes 表记录。</p>";
}

// 3. tasks 任务表
echo "<h3>③ tasks 任务表（数据库中已发布的协作任务）</h3>";
$stmtTasks = $pdo->query("SELECT id, title, created_at_str, status FROM tasks ORDER BY id DESC");
$tRows = $stmtTasks ? $stmtTasks->fetchAll(PDO::FETCH_ASSOC) : [];
if ($tRows) {
    echo "<table><tr><th>task_id</th><th>任务标题</th><th>创建时间</th><th>状态</th></tr>";
    foreach ($tRows as $t) {
        echo "<tr><td>{$t['id']}</td><td><b>" . htmlspecialchars($t['title']) . "</b></td><td>{$t['created_at_str']}</td><td class='ok'>{$t['status']}</td></tr>";
    }
    echo "</table><p class='ok'>✅ tasks 表共 " . count($tRows) . " 个任务</p>";
} else {
    echo "<p style='color:#666;'>暂无单独 tasks 表记录。</p>";
}

// 3. group_states 协同状态表 (公约、正文、阶段)
echo "<h3>③ group_states 协同状态表（各小组协同正文与公约实时落库记录）</h3>";
$stmtStates = $pdo->query("SELECT scope_key, task_id, group_id, current_stage, is_final_submitted, last_timestamp, LENGTH(stage1_data) as s1_len, LENGTH(stage2_data) as s2_len FROM group_states ORDER BY last_timestamp DESC");
$sRows = $stmtStates ? $stmtStates->fetchAll(PDO::FETCH_ASSOC) : [];
if ($sRows) {
    echo "<table><tr><th>scope_key (房间唯一标识)</th><th>任务ID</th><th>小组ID</th><th>当前阶段</th><th>最后更新时间</th><th>正文字节数</th></tr>";
    foreach ($sRows as $s) {
        $upTime = $s['last_timestamp'] ? date('Y-m-d H:i:s', $s['last_timestamp'] / 1000) : '-';
        echo "<tr><td><b>{$s['scope_key']}</b></td><td>{$s['task_id']}</td><td>{$s['group_id']}</td><td class='ok'>{$s['current_stage']}</td><td>{$upTime}</td><td>{$s['s2_len']} 字节</td></tr>";
    }
    echo "</table><p class='ok'>✅ group_states 表共 " . count($sRows) . " 个房间记录</p>";
} else {
    echo "<p class='err'>❌ group_states 表暂无协作记录！</p>";
}

// 4. chat_messages 聊天消息表
echo "<h3>④ chat_messages 聊天消息表（最新 20 条讨论记录）</h3>";
$stmtMsgs = $pdo->query("SELECT id, scope_key, stage, sender, text, timestamp_str, time_ms FROM chat_messages ORDER BY time_ms DESC LIMIT 20");
$mRows = $stmtMsgs ? $stmtMsgs->fetchAll(PDO::FETCH_ASSOC) : [];
if ($mRows) {
    echo "<table><tr><th>房间 scope_key</th><th>阶段</th><th>发送人学号</th><th>内容</th><th>发送时间</th></tr>";
    foreach ($mRows as $m) {
        echo "<tr><td>{$m['scope_key']}</td><td>{$m['stage']}</td><td><b>{$m['sender']}</b></td><td>" . htmlspecialchars($m['text']) . "</td><td>{$m['timestamp_str']}</td></tr>";
    }
    echo "</table><p class='ok'>✅ chat_messages 表共显示最新 " . count($mRows) . " 条消息</p>";
} else {
    echo "<p class='err'>❌ chat_messages 表暂无消息！</p>";
}

echo "<hr><p style='color:gray;'>⚠️ 查看完毕后请执行 rm /www/wwwroot/47.99.110.230/check_db_users.php 删除此文件</p>";
