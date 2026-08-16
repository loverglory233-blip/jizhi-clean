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
