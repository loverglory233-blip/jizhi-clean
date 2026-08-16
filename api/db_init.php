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

    // 3. 小组实时协作快照与阶段状态表 (正文、协同光标、各阶段决策)
    $sql3 = "CREATE TABLE IF NOT EXISTS `group_states` (
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
    $pdo->exec($sql3);

    // 4. 研讨区实时消息流表 (行级存储，并发安全，便于学术统计)
    $sql4 = "CREATE TABLE IF NOT EXISTS `chat_messages` (
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
    $pdo->exec($sql4);

    return true;
}
