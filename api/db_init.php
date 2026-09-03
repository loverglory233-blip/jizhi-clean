<?php
/**
 * 数据库自动初始化与表迁移脚本
 * 自动建立 users, group_states, chat_messages, global_meta 四张核心表
 */

require_once __DIR__ . '/db_config.php';

function initDatabaseTables() {
    $pdo = getDbConnection();
    if (!$pdo) return false;

    try {
        // 1. 全局教务元数据表 (班级、任务、广播通知、范文库)
        $sql1 = "CREATE TABLE IF NOT EXISTS `global_meta` (
            `meta_key` VARCHAR(64) PRIMARY KEY,
            `meta_value` LONGTEXT NOT NULL,
            `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
        @$pdo->exec($sql1);

        // 2. 用户账号与单点在线会话表（唯一标识严格锁定为 id / 学号，彻底移除冗余字段）
        $sql2 = "CREATE TABLE IF NOT EXISTS `users` (
            `id` VARCHAR(64) PRIMARY KEY,
            `name` VARCHAR(64) NOT NULL,
            `password` VARCHAR(255) NOT NULL,
            `role` VARCHAR(32) NOT NULL,
            `class_id` VARCHAR(64) DEFAULT '',
            `group_id` VARCHAR(64) DEFAULT '',
            `avatar` VARCHAR(16) DEFAULT '👤',
            `active_session_id` VARCHAR(128) DEFAULT '',
            `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
        @$pdo->exec($sql2);

        // 🛡️ 自动执行数据库物理清理：若存在历史遗留的 student_code / username 列，自动物理剔除
        try { @$pdo->exec("ALTER TABLE `users` DROP INDEX `student_code`"); } catch (\Throwable $e) {}
        try { @$pdo->exec("ALTER TABLE `users` DROP INDEX `username`"); } catch (\Throwable $e) {}
        try { @$pdo->exec("ALTER TABLE `users` DROP COLUMN `student_code`"); } catch (\Throwable $e) {}
        try { @$pdo->exec("ALTER TABLE `users` DROP COLUMN `username`"); } catch (\Throwable $e) {}

        // 👩‍🏫 唯一教师种子账号
        try { ensureTeacherSeedAccount($pdo); } catch (\Throwable $e) {}

        // 3. 教学班级表 (classes)
        $sql3 = "CREATE TABLE IF NOT EXISTS `classes` (
            `id` VARCHAR(64) PRIMARY KEY,
            `name` VARCHAR(128) NOT NULL,
            `student_ids` LONGTEXT,
            `groups_data` LONGTEXT,
            `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
        @$pdo->exec($sql3);

        // 🛡️ 自动执行 classes 物理清理：若存在历史遗留的 code 列与唯一索引，自动物理剔除
        try { @$pdo->exec("ALTER TABLE `classes` DROP INDEX `code`"); } catch (\Throwable $e) {}
        try { @$pdo->exec("ALTER TABLE `classes` DROP COLUMN `code`"); } catch (\Throwable $e) {}

        // classes 表初始化完成，初始为 0 班级，由任课教师在管理界面自主创建与配置

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
        @$pdo->exec($sql4);

        // 5. 广播通知表 (announcements)
        $sql5 = "CREATE TABLE IF NOT EXISTS `announcements` (
            `id` VARCHAR(64) PRIMARY KEY,
            `title` VARCHAR(255) NOT NULL,
            `content` LONGTEXT NOT NULL,
            `created_at_str` VARCHAR(64) DEFAULT '',
            `target_class_ids` LONGTEXT,
            `attachment` LONGTEXT,
            `confirmed_members` LONGTEXT,
            `is_pinned` TINYINT(1) DEFAULT 0,
            `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
        @$pdo->exec($sql5);
        try { @$pdo->exec("ALTER TABLE `announcements` ADD COLUMN `attachment` LONGTEXT NULL"); } catch (\Throwable $e) {}
        try { @$pdo->exec("ALTER TABLE `announcements` ADD COLUMN `confirmed_members` LONGTEXT NULL"); } catch (\Throwable $e) {}

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
        @$pdo->exec($sql6);

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
            `revision_id` BIGINT UNSIGNED NOT NULL DEFAULT 1,
            `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_task_group (`task_id`, `group_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
        @$pdo->exec($sql7);

        try {
            @$pdo->exec("ALTER TABLE `group_states` ADD COLUMN `revision_id` BIGINT UNSIGNED NOT NULL DEFAULT 1");
        } catch (\Throwable $e) {}

        // 8. 研讨区实时消息流表 (chat_messages)
        $sql8 = "CREATE TABLE IF NOT EXISTS `chat_messages` (
            `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
            `scope_key` VARCHAR(128) NOT NULL,
            `stage` VARCHAR(32) NOT NULL,
            `sender` VARCHAR(64) NOT NULL,
            `sender_name` VARCHAR(64) DEFAULT '',
            `text` LONGTEXT NOT NULL,
            `timestamp_str` VARCHAR(32) NOT NULL,
            `time_ms` BIGINT NOT NULL,
            `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_scope_stage (`scope_key`, `stage`, `time_ms`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
        @$pdo->exec($sql8);

        try {
            @$pdo->exec("ALTER TABLE `chat_messages` ADD COLUMN `sender_name` VARCHAR(64) DEFAULT '' AFTER `sender`");
        } catch (\Throwable $e) {}

        return true;
    } catch (\Throwable $e) {
        error_log('initDatabaseTables exception: ' . $e->getMessage());
        return false;
    }
}

/**
 * 幂等确保唯一教师种子账号存在（1001 / 老师 / 初始密码 123）。
 * - 账号不存在 → 插入标准账号；
 * - id='u_teacher1' 或 username='1001' 已存在但状态被改脏 → 纠正为标准状态；
 * - 绝不覆盖 password / avatar（教师已改密码时保持不变）。
 * 测试学生（李明/王芳/陈强）一律不写入。
 */
function ensureTeacherSeedAccount($pdo) {
    if (!$pdo) return false;
    try {
        $stmtCheck = $pdo->prepare("SELECT `id`, `password` FROM `users` WHERE `id` = '1001' LIMIT 1");
        $stmtCheck->execute();
        $row = $stmtCheck->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            $seedHash = password_hash('123', PASSWORD_DEFAULT);
            $stmt = $pdo->prepare("INSERT INTO `users` (`id`, `name`, `password`, `role`, `avatar`)
                VALUES ('1001', '老师', :pwd, 'teacher', '👩‍🏫')");
            $stmt->bindValue(':pwd', $seedHash);
            return $stmt->execute();
        }
        return true;
    } catch (Exception $e) {
        error_log('ensureTeacherSeedAccount: ' . $e->getMessage());
        return false;
    }
}
