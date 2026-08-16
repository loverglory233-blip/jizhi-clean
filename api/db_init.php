<?php
/**
 * 数据库自动初始化与表迁移脚本
 * 自动建立 users, group_states, chat_messages, global_meta 四张核心表
 */

require_once __DIR__ . '/db_config.php';

function initDatabaseTables() {
    $pdo = getDbConnection();
    if (!$pdo) return false;

    // 1. 全局教务元数据表 (班级、任务、广播通知、范文库)
    $sql1 = "CREATE TABLE IF NOT EXISTS `global_meta` (
        `meta_key` VARCHAR(64) PRIMARY KEY,
        `meta_value` LONGTEXT NOT NULL,
        `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    $pdo->exec($sql1);

    // 2. 用户账号与单点在线会话表
    $sql2 = "CREATE TABLE IF NOT EXISTS `users` (
        `id` VARCHAR(64) PRIMARY KEY,
        `username` VARCHAR(64) UNIQUE NOT NULL,
        `name` VARCHAR(64) NOT NULL,
        `password` VARCHAR(64) NOT NULL,
        `role` VARCHAR(32) NOT NULL,
        `student_code` VARCHAR(32) DEFAULT '',
        `class_id` VARCHAR(64) DEFAULT '',
        `group_id` VARCHAR(64) DEFAULT '',
        `avatar` VARCHAR(16) DEFAULT '👤',
        `active_session_id` VARCHAR(128) DEFAULT '',
        `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    $pdo->exec($sql2);

    // 写入默认种子用户 (教师与预设学生)，若不存在则自动插入
    $seedUsers = [
        ['id' => 'u_teacher1', 'username' => 'teacher',   'name' => '张教授 (教师)',        'password' => '123', 'role' => 'teacher', 'student_code' => '',  'class_id' => '',          'group_id' => '',        'avatar' => '👩‍🏫'],
        ['id' => 'u_studentA', 'username' => 'liming',    'name' => '李明 (学生A/组长)',    'password' => '123', 'role' => 'student', 'student_code' => 'A', 'class_id' => 'class_101', 'group_id' => 'group_1', 'avatar' => '👨‍🎓'],
        ['id' => 'u_studentB', 'username' => 'wangfang',  'name' => '王芳 (学生B/组员)',    'password' => '123', 'role' => 'student', 'student_code' => 'B', 'class_id' => 'class_101', 'group_id' => 'group_1', 'avatar' => '👩‍🎓'],
        ['id' => 'u_studentC', 'username' => 'chenqiang', 'name' => '陈强 (学生C/组员)',    'password' => '123', 'role' => 'student', 'student_code' => 'C', 'class_id' => 'class_101', 'group_id' => 'group_1', 'avatar' => '🧑‍🎓']
    ];
    $stmtUser = $pdo->prepare("INSERT INTO `users` (`id`, `username`, `name`, `password`, `role`, `student_code`, `class_id`, `group_id`, `avatar`) 
        VALUES (:id, :un, :nm, :pw, :rl, :sc, :cid, :gid, :av)
        ON DUPLICATE KEY UPDATE `name`=:nm2, `password`=:pw2, `role`=:rl2, `student_code`=:sc2, `class_id`=:cid2, `group_id`=:gid2, `avatar`=:av2");
    foreach ($seedUsers as $su) {
        $stmtUser->execute([
            ':id' => $su['id'], ':un' => $su['username'], ':nm' => $su['name'], ':pw' => $su['password'],
            ':rl' => $su['role'], ':sc' => $su['student_code'], ':cid' => $su['class_id'], ':gid' => $su['group_id'], ':av' => $su['avatar'],
            ':nm2' => $su['name'], ':pw2' => $su['password'], ':rl2' => $su['role'], ':sc2' => $su['student_code'], ':cid2' => $su['class_id'], ':gid2' => $su['group_id'], ':av2' => $su['avatar']
        ]);
    }

    // 3. 教学班级表 (classes)
    $sql3 = "CREATE TABLE IF NOT EXISTS `classes` (
        `id` VARCHAR(64) PRIMARY KEY,
        `name` VARCHAR(128) NOT NULL,
        `code` VARCHAR(64) UNIQUE NOT NULL,
        `student_ids` LONGTEXT,
        `groups_data` LONGTEXT,
        `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    $pdo->exec($sql3);

    // 写入默认班级 (MET-2026-01)
    $seedClassGroups = json_encode([['id' => 'group_1', 'name' => '第1小组', 'members' => ['u_studentA', 'u_studentB', 'u_studentC']]], JSON_UNESCAPED_UNICODE);
    $seedClassStudents = json_encode(['u_studentA', 'u_studentB', 'u_studentC'], JSON_UNESCAPED_UNICODE);
    $stmtClass = $pdo->prepare("INSERT INTO `classes` (`id`, `name`, `code`, `student_ids`, `groups_data`) 
        VALUES ('class_101', '《现代教育技术》2026春01班', 'MET-2026-01', :sids, :gdata)
        ON DUPLICATE KEY UPDATE `name`=VALUES(`name`), `code`=VALUES(`code`), `student_ids`=VALUES(`student_ids`), `groups_data`=VALUES(`groups_data`)");
    $stmtClass->execute([':sids' => $seedClassStudents, ':gdata' => $seedClassGroups]);

    // 4. 发布的教学任务表 (tasks)
    $sql4 = "CREATE TABLE IF NOT EXISTS `tasks` (
        `id` VARCHAR(64) PRIMARY KEY,
        `title` VARCHAR(255) NOT NULL,
        `desc` LONGTEXT,
        `created_at_str` VARCHAR(64) DEFAULT '',
        `deadline` VARCHAR(64) DEFAULT '',
        `duration_minutes` INT DEFAULT 60,
        `target_class_ids` LONGTEXT,
        `attachments` LONGTEXT,
        `status` VARCHAR(32) DEFAULT 'active',
        `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    $pdo->exec($sql4);

    // 5. 广播通知表 (announcements)
    $sql5 = "CREATE TABLE IF NOT EXISTS `announcements` (
        `id` VARCHAR(64) PRIMARY KEY,
        `title` VARCHAR(255) NOT NULL,
        `content` LONGTEXT NOT NULL,
        `created_at_str` VARCHAR(64) DEFAULT '',
        `target_class_ids` LONGTEXT,
        `is_pinned` TINYINT(1) DEFAULT 0,
        `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    $pdo->exec($sql5);

    // 6. 学术参考范文库表 (reference_papers)
    $sql6 = "CREATE TABLE IF NOT EXISTS `reference_papers` (
        `id` VARCHAR(64) PRIMARY KEY,
        `title` VARCHAR(255) NOT NULL,
        `abstract` LONGTEXT,
        `highlights` LONGTEXT,
        `target_group` VARCHAR(64) DEFAULT 'all',
        `file_name` VARCHAR(255) DEFAULT '',
        `file_size` VARCHAR(64) DEFAULT '',
        `file_data` LONGTEXT,
        `upload_time` VARCHAR(64) DEFAULT '',
        `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    $pdo->exec($sql6);

    // 7. 小组实时协作快照与阶段状态表 (group_states)
    $sql7 = "CREATE TABLE IF NOT EXISTS `group_states` (
        `scope_key` VARCHAR(128) PRIMARY KEY,
        `task_id` VARCHAR(64) NOT NULL,
        `group_id` VARCHAR(64) NOT NULL,
        `current_stage` VARCHAR(32) DEFAULT 'stage1',
        `stage1_data` LONGTEXT,
        `stage2_data` LONGTEXT,
        `stage3_data` LONGTEXT,
        `presence_data` LONGTEXT,
        `members_data` LONGTEXT,
        `is_final_submitted` TINYINT(1) DEFAULT 0,
        `last_timestamp` BIGINT NOT NULL DEFAULT 0,
        `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_task_group (`task_id`, `group_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    $pdo->exec($sql7);

    // 8. 研讨区实时消息流表 (chat_messages)
    $sql8 = "CREATE TABLE IF NOT EXISTS `chat_messages` (
        `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
        `scope_key` VARCHAR(128) NOT NULL,
        `stage` VARCHAR(32) NOT NULL,
        `sender` VARCHAR(64) NOT NULL,
        `text` LONGTEXT NOT NULL,
        `timestamp_str` VARCHAR(32) NOT NULL,
        `time_ms` BIGINT NOT NULL,
        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_scope_stage (`scope_key`, `stage`, `time_ms`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    $pdo->exec($sql8);

    return true;
}
