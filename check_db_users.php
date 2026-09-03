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
    $stmtUsers = $pdo->query("SELECT id, name, role, password FROM users");
    $existingList = $stmtUsers->fetchAll(PDO::FETCH_ASSOC);
    foreach ($existingList as $eu) {
        $curP = $eu['password'] ?? '';
        if (str_starts_with($curP, '$2y$') || str_starts_with($curP, '$2a$')) {
            // 是 Bcrypt 哈希，直接降级平铺为纯明文 123
            $stmtFix = $pdo->prepare("UPDATE users SET password = '123' WHERE id = :uid");
            $stmtFix->execute([':uid' => $eu['id']]);
        }
    }

    // 2. 从 global_meta main_meta 补齐所有尚未入库的学生与班级
    $stmtMeta = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = 'main_meta'");
    $stmtMeta->execute();
    $mRow = $stmtMeta->fetch();
    if ($mRow && !empty($mRow['meta_value'])) {
        $gm = json_decode($mRow['meta_value'], true) ?: [];
        $gUsers = $gm['users'] ?? [];
        $stmtUpsert = $pdo->prepare("INSERT INTO users (id, name, password, role)
            VALUES (:id, :nm, :p, :r)
            ON DUPLICATE KEY UPDATE name = VALUES(name), role = VALUES(role)");
        foreach ($gUsers as $gu) {
            $uid = trim($gu['id'] ?? ($gu['studentCode'] ?? ($gu['username'] ?? '')));
            if (empty($uid)) continue;
            $unick = trim($gu['name'] ?? $uid);
            $urole = trim($gu['role'] ?? 'student');
            $rawP = trim($gu['password'] ?? '');
            $upwd = (!empty($rawP) && !str_starts_with($rawP, '$2y$')) ? $rawP : '123';

            $stmtCheck = $pdo->prepare("SELECT id, password FROM users WHERE id = :id LIMIT 1");
            $stmtCheck->execute([':id' => $uid]);
            $existRow = $stmtCheck->fetch();
            if ($existRow) {
                $curP = $existRow['password'];
                $finalP = (str_starts_with($curP, '$2y$') || empty($curP)) ? '123' : $curP;
                $stmtUpdate = $pdo->prepare("UPDATE users SET name = :nm, role = :r, password = :p WHERE id = :id");
                $stmtUpdate->execute([':nm' => $unick, ':r' => $urole, ':p' => $finalP, ':id' => $existRow['id']]);
            } else {
                $stmtUpsert->execute([
                    ':id' => $uid,
                    ':nm' => $unick,
                    ':p' => $upwd,
                    ':r' => $urole
                ]);
            }
        }
        // 🛡️ 彻底物理清除已从 main_meta 注销删除的学生账号
        $validUids = ['1001'];
        foreach ($gUsers as $gu) {
            $uid = trim($gu['id'] ?? ($gu['studentCode'] ?? ($gu['username'] ?? '')));
            if (!empty($uid)) $validUids[] = $uid;
        }
        if (!empty($validUids)) {
            $inClause = implode(',', array_fill(0, count($validUids), '?'));
            $stmtCleanUsers = $pdo->prepare("DELETE FROM `users` WHERE `role` != 'teacher' AND `id` NOT IN ($inClause)");
            $stmtCleanUsers->execute($validUids);
        } else {
            $pdo->exec("DELETE FROM `users` WHERE `role` != 'teacher'");
        }

        // 3. 深度自愈 classes 班级表
        $gClasses = $gm['classes'] ?? [];
        if (!empty($gClasses) && is_array($gClasses)) {
            $validCids = [];
            $stmtClsUpsert = $pdo->prepare("INSERT INTO `classes` (`id`, `name`, `student_ids`, `groups_data`)
                VALUES (:id, :nm, :sids, :gdata)
                ON DUPLICATE KEY UPDATE `name`=VALUES(`name`), `student_ids`=VALUES(`student_ids`), `groups_data`=VALUES(`groups_data`)");
            foreach ($gClasses as $cls) {
                if (empty($cls['id'])) continue;
                $cid = $cls['id'];
                $validCids[] = $cid;
                $cname = $cls['name'] ?? '教学班';
                $sids = is_array($cls['studentIds'] ?? null) ? $cls['studentIds'] : [];
                $gdata = is_array($cls['groups'] ?? null) ? $cls['groups'] : [];
                
                $sidsJson = json_encode($sids, JSON_UNESCAPED_UNICODE);
                $gdataJson = json_encode($gdata, JSON_UNESCAPED_UNICODE);
                $stmtClsUpsert->execute([':id' => $cid, ':nm' => $cname, ':sids' => $sidsJson, ':gdata' => $gdataJson]);
            }
            if (!empty($validCids)) {
                $inClause = implode(',', array_fill(0, count($validCids), '?'));
                $stmtCleanCls = $pdo->prepare("DELETE FROM `classes` WHERE `id` NOT IN ($inClause)");
                $stmtCleanCls->execute($validCids);
            }
        }

        // 4. 深度自愈 tasks 任务表
        $gTasks = $gm['tasks'] ?? [];
        if (!empty($gTasks) && is_array($gTasks)) {
            $stmtTaskUpsert = $pdo->prepare("INSERT INTO `tasks` (`id`, `title`, `desc`, `created_at_str`, `deadline`, `duration_minutes`, `target_class_ids`, `attachments`, `status`)
                VALUES (:id, :title, :desc, :created_at, :deadline, :duration, :cids, :att, :status)
                ON DUPLICATE KEY UPDATE `title`=VALUES(`title`), `desc`=VALUES(`desc`), `created_at_str`=VALUES(`created_at_str`), `deadline`=VALUES(`deadline`), `duration_minutes`=VALUES(`duration_minutes`), `target_class_ids`=VALUES(`target_class_ids`), `attachments`=VALUES(`attachments`), `status`=VALUES(`status`)");
            foreach ($gTasks as $tsk) {
                $tid = $tsk['id'] ?? 'task_default';
                $ttitle = $tsk['title'] ?? '写作任务';
                $tdesc = $tsk['instructions'] ?? ($tsk['desc'] ?? '');
                $tcreated = $tsk['createdAt'] ?? date('Y-m-d H:i:s');
                $tdeadline = $tsk['deadline'] ?? '';
                $tduration = intval($tsk['durationMinutes'] ?? 150);
                $tcids = json_encode($tsk['targetClassIds'] ?? (isset($tsk['classId']) ? [$tsk['classId']] : ['class_101']), JSON_UNESCAPED_UNICODE);
                $tatt = json_encode($tsk['resources'] ?? ($tsk['attachments'] ?? []), JSON_UNESCAPED_UNICODE);
                $tstatus = $tsk['status'] ?? 'in_progress';
                $stmtTaskUpsert->execute([
                    ':id' => $tid, ':title' => $ttitle, ':desc' => $tdesc, ':created_at' => $tcreated,
                    ':deadline' => $tdeadline, ':duration' => $tduration, ':cids' => $tcids, ':att' => $tatt, ':status' => $tstatus
                ]);
            }
        }
    }
} catch (Exception $e) {}

$isCli = (php_sapi_name() === 'cli');

if ($isCli) {
    echo "========================================================\n";
    echo "🔍 集智平台 - MySQL 数据库用户与班级查询诊断\n";
    echo "========================================================\n\n";

    // 1. users 表
    echo "① users 表数据 (物理持久化账号):\n";
    $stmt = $pdo->query("SELECT id, name, role, password FROM users ORDER BY role DESC, id ASC");
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    if ($rows) {
        printf("%-15s | %-12s | %-10s | %-10s\n", "ID (学号/工号)", "姓名", "角色", "密码");
        echo str_repeat("-", 55) . "\n";
        foreach ($rows as $r) {
            printf("%-15s | %-12s | %-10s | %-10s\n", $r['id'], $r['name'], $r['role'], $r['password']);
        }
        echo "\n✅ users 表共 " . count($rows) . " 条记录\n\n";
    } else {
        echo "⚠️ users 表中暂无记录\n\n";
    }

    // 2. classes 表
    echo "② classes 班级表:\n";
    $stmtC = $pdo->query("SELECT id, name, student_ids FROM classes");
    $cRows = $stmtC->fetchAll(PDO::FETCH_ASSOC);
    if ($cRows) {
        foreach ($cRows as $c) {
            $sids = json_decode($c['student_ids'] ?: '[]', true) ?: [];
            echo "  • 班级 [{$c['name']}] (ID: {$c['id']}) - 本班学生: " . count($sids) . " 人\n";
        }
    } else {
        echo "  暂无班级\n";
    }
    echo "\n========================================================\n";
    exit(0);
}

echo "<meta charset='utf-8'><style>body{font-family:monospace;padding:20px;} table{border-collapse:collapse;width:100%;} td,th{border:1px solid #ccc;padding:8px 12px;text-align:left;} tr:nth-child(even){background:#f9f9f9;} .ok{color:green;font-weight:bold;} .err{color:red;font-weight:bold;}</style>";
echo "<h2>🔍 集智平台 - 数据库全景诊断与实时自愈结果</h2>";

// 1. users 实体表
echo "<h3>① users 实体表（登录时直接查这里）</h3>";
$stmt = $pdo->query("SELECT id, name, role, password FROM users ORDER BY role DESC, id ASC");
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
if ($rows) {
    echo "<table><tr><th>id (学号/工号)</th><th>name (姓名)</th><th>role (角色)</th><th>密码(纯明文)</th></tr>";
    foreach ($rows as $r) {
        echo "<tr><td>{$r['id']}</td><td>{$r['name']}</td><td class='ok'>{$r['role']}</td><td style='color:#2563eb;font-weight:bold;'>{$r['password']}</td></tr>";
    }
    echo "</table><p class='ok'>✅ users 表共 " . count($rows) . " 条记录</p>";
} else {
    echo "<p class='err'>⚠️ users 表中暂无任何学生账号记录（只有种子账号或为空）！</p>";
}

// 2. classes 班级与分组表
echo "<h3>② classes 班级表（各教学班与小组成员分组实时落库）</h3>";
$stmtClasses = $pdo->query("SELECT id, name, student_ids, groups_data FROM classes ORDER BY id ASC");
$cRows = $stmtClasses ? $stmtClasses->fetchAll(PDO::FETCH_ASSOC) : [];
if ($cRows) {
    echo "<table><tr><th>class_id</th><th>班级名称</th><th>学生人数</th><th>小组数</th></tr>";
    foreach ($cRows as $c) {
        $sidsArr = json_decode($c['student_ids'] ?? '[]', true) ?: [];
        $grpArr = json_decode($c['groups_data'] ?? '[]', true) ?: [];
        echo "<tr><td>{$c['id']}</td><td><b>" . htmlspecialchars($c['name']) . "</b></td><td>" . count($sidsArr) . " 人</td><td class='ok'>" . count($grpArr) . " 个组</td></tr>";
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
        $upTime = $s['last_timestamp'] ? date('Y-m-d H:i:s', intval($s['last_timestamp'] / 1000)) : '-';
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
