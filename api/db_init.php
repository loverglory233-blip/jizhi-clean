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
        `password` VARCHAR(255) NOT NULL,
        `role` VARCHAR(32) NOT NULL,
        `student_code` VARCHAR(32) DEFAULT '' UNIQUE,
        `class_id` VARCHAR(64) DEFAULT '',
        `group_id` VARCHAR(64) DEFAULT '',
        `avatar` VARCHAR(16) DEFAULT '👤',
        `active_session_id` VARCHAR(128) DEFAULT '',
        `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    $pdo->exec($sql2);

    // 👩‍🏫 唯一教师种子账号：由独立幂等函数 ensureTeacherSeedAccount 保证（见文件末尾），
    // 建表与登录时都会调用，纠正历史脏记录；测试学生一律不写入
    ensureTeacherSeedAccount($pdo);

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

    // 仅在 classes 表完全为空时写入初始空班级
    $chkClassCount = $pdo->query("SELECT COUNT(*) FROM `classes`")->fetchColumn();
    if (intval($chkClassCount) === 0) {
        $seedClassGroups = json_encode([], JSON_UNESCAPED_UNICODE);
        $seedClassStudents = json_encode([], JSON_UNESCAPED_UNICODE);
        $stmtClass = $pdo->prepare("INSERT INTO `classes` (`id`, `name`, `code`, `student_ids`, `groups_data`) 
            VALUES ('class_101', '《现代教育技术》2026春01班', 'ET2026-01', :sids, :gdata)");
        $stmtClass->execute([':sids' => $seedClassStudents, ':gdata' => $seedClassGroups]);
    }

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
        `attachment` LONGTEXT,
        `confirmed_members` LONGTEXT,
        `is_pinned` TINYINT(1) DEFAULT 0,
        `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    $pdo->exec($sql5);
    @$pdo->exec("ALTER TABLE `announcements` ADD COLUMN `attachment` LONGTEXT NULL");
    @$pdo->exec("ALTER TABLE `announcements` ADD COLUMN `confirmed_members` LONGTEXT NULL");

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
        `revision_id` BIGINT UNSIGNED NOT NULL DEFAULT 1,
        `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_task_group (`task_id`, `group_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    $pdo->exec($sql7);

    // 自动表迁移：确保已存在的 group_states 表包含 revision_id 字段
    try {
        $pdo->exec("ALTER TABLE `group_states` ADD COLUMN `revision_id` BIGINT UNSIGNED NOT NULL DEFAULT 1");
    } catch (Exception $e) {
        // 重复执行迁移时字段已存在属预期情况，仅记录非预期异常
        if (strpos($e->getMessage(), 'Duplicate column') === false) {
            error_log('db_init.php ALTER group_states: ' . $e->getMessage());
        }
    }

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
    $pdo->exec($sql8);

    try {
        $pdo->exec("ALTER TABLE `chat_messages` ADD COLUMN `sender_name` VARCHAR(64) DEFAULT '' AFTER `sender`");
    } catch (Exception $e) {
        if (strpos($e->getMessage(), 'Duplicate column') === false) {
            error_log('db_init.php ALTER chat_messages: ' . $e->getMessage());
        }
    }

    return true;
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
        // 清理可能存在的历史重复记录，保持全库唯一
        $pdo->exec("DELETE FROM `users` WHERE `id` != '1001' AND (`username` = '1001' OR `student_code` = '1001')");
        
        $stmtCheck = $pdo->prepare("SELECT `id`, `password` FROM `users` WHERE `id` = '1001' LIMIT 1");
        $stmtCheck->execute();
        $row = $stmtCheck->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            $seedHash = password_hash('123', PASSWORD_DEFAULT);
            $stmt = $pdo->prepare("INSERT INTO `users` (`id`, `username`, `name`, `password`, `role`, `student_code`, `avatar`)
                VALUES ('1001', '1001', '老师', :pwd, 'teacher', '1001', '👩‍🏫')");
            $stmt->bindValue(':pwd', $seedHash);
            return $stmt->execute();
        }
        return true;
    } catch (Exception $e) {
        error_log('ensureTeacherSeedAccount: ' . $e->getMessage());
        return false;
    }
}
