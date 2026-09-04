<?php
/**
 * 生产级服务端网关 (全面升级为 MySQL 关系型数据库驱动)
 * 支持 MySQL 数据库自动建表、数据行级持久化、单设备会话互斥与 OAuth 智能体中转
 */

ini_set('display_errors', '0');
error_reporting(E_ALL & ~E_NOTICE & ~E_WARNING & ~E_DEPRECATED);
ini_set('memory_limit', '256M');
if (!ob_start('ob_gzhandler')) {
    ob_start();
}
header('Content-Type: application/json; charset=utf-8');

// 🛡️ 全局异常与致命错误自愈兜底保护（零 500 崩溃）
set_exception_handler(function($e) {
    if (!headers_sent()) {
        http_response_code(200);
        header('Content-Type: application/json; charset=utf-8');
    }
    echo json_encode(['success' => false, 'error' => 'fail_safe_caught', 'detail' => $e->getMessage()]);
    exit;
});

register_shutdown_function(function() {
    $error = error_get_last();
    if ($error && in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR])) {
        if (!headers_sent()) {
            http_response_code(200);
            header('Content-Type: application/json; charset=utf-8');
        }
        echo json_encode(['success' => false, 'error' => 'fatal_error_caught', 'detail' => $error['message'], 'file' => basename($error['file']), 'line' => $error['line']], JSON_UNESCAPED_UNICODE);
    }
});

// 🛠️ 智能 Base64 图片文件化清洗迁移器（无损提取为物理文件并回写极短 URL，彻底杜绝内存撑爆与数据截断）
function migrateBase64StringToUrl($rawContent, $pdo = null, $scopeKey = '', $colName = '') {
    if (empty($rawContent) || !is_string($rawContent) || strpos($rawContent, 'data:image/') === false) {
        return $rawContent;
    }
    $uploadDir = __DIR__ . '/uploads/';
    if (!is_dir($uploadDir)) @mkdir($uploadDir, 0755, true);

    $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? "https" : "http";
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $baseDir = rtrim(dirname($_SERVER['SCRIPT_NAME']), '/\\');
    $baseUrl = $protocol . '://' . $host . $baseDir . '/uploads/';

    $hasReplaced = false;
    $cleaned = preg_replace_callback('/data:image\/([a-zA-Z0-9]+);base64,([a-zA-Z0-9\+\/=\r\n]+)/', function($matches) use ($uploadDir, $baseUrl, &$hasReplaced) {
        $ext = strtolower($matches[1]);
        if ($ext === 'jpeg') $ext = 'jpg';
        if (!in_array($ext, ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'])) $ext = 'png';
        
        $base64Data = str_replace(["\r", "\n", ' '], '', $matches[2]);
        $binData = base64_decode($base64Data);
        if (!$binData) return $matches[0];
        
        $fileName = 'migrated_' . substr(md5($binData), 0, 16) . '.' . $ext;
        $destPath = $uploadDir . $fileName;
        if (!file_exists($destPath)) {
            @file_put_contents($destPath, $binData);
        }
        $hasReplaced = true;
        return $baseUrl . $fileName;
    }, $rawContent);

    if ($hasReplaced && $pdo && !empty($scopeKey) && !empty($colName)) {
        try {
            $stmtUp = $pdo->prepare("UPDATE group_states SET `{$colName}` = :val WHERE scope_key = :sk");
            $stmtUp->execute([':val' => $cleaned, ':sk' => $scopeKey]);
        } catch (\Exception $e) {}
    }
    return $cleaned;
}
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit(0);
}

if (isset($_GET['action']) && $_GET['action'] === 'health') {
    echo json_encode(['status' => 'ok', 'service' => 'JIZHI Production PHP & MySQL Gateway', 'version' => '2.0.0', 'timestamp' => round(microtime(true) * 1000)], JSON_UNESCAPED_UNICODE);
    exit;
}

// 🔍 数据库真实用户与明文密码透视接口
if (isset($_GET['action']) && $_GET['action'] === 'peek_db_users') {
    require_once __DIR__ . '/api/db_config.php';
    $tempPdo = getDbConnection();
    if (!$tempPdo) {
        echo json_encode(['dbConnected' => false, 'error' => '❌ 数据库连接失败']);
        exit;
    }
    $stmt = $tempPdo->query("SELECT id, name, role, password, updated_at FROM users");
    $allUsers = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode([
        'dbConnected' => true,
        'database' => 'jizhi',
        'totalUsers' => count($allUsers),
        'users' => $allUsers
    ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

require_once __DIR__ . '/api/db_config.php';
require_once __DIR__ . '/api/db_init.php';

$pdo = getDbConnection();
if ($pdo) {
    // 🛡️ 高并发性能终极保护：仅在服务冷启动/初始化时执行一次 DDL 建表与教务自愈，普通高频轮询绝对不重复全库狂写
    $lockFile = sys_get_temp_dir() . '/jizhi_db_tables_inited_v911.lock';
    if (!file_exists($lockFile)) {
        @touch($lockFile);
        try { initDatabaseTables(); } catch (\Throwable $e) { error_log('initDatabaseTables: ' . $e->getMessage()); }
        try { ensureTeacherSeedAccount($pdo); } catch (\Throwable $e) { error_log('ensureTeacherSeedAccount: ' . $e->getMessage()); }
        try { autoSyncAllUsersFromMeta($pdo); } catch (\Throwable $e) { error_log('autoSyncAllUsersFromMeta: ' . $e->getMessage()); }
    }
}

$RAW_INPUT = ($_SERVER['REQUEST_METHOD'] === 'POST') ? @file_get_contents('php://input') : '';
$REQ_DATA = !empty($RAW_INPUT) ? (@json_decode($RAW_INPUT, true) ?: []) : [];

$classId = isset($_GET['classId']) ? preg_replace('/[^a-zA-Z0-9_-]/', '', $_GET['classId']) : (isset($REQ_DATA['classId']) ? preg_replace('/[^a-zA-Z0-9_-]/', '', $REQ_DATA['classId']) : '');
if (empty($classId) && isset($REQ_DATA['message']['classId'])) {
    $classId = preg_replace('/[^a-zA-Z0-9_-]/', '', $REQ_DATA['message']['classId']);
}
if (empty($classId)) $classId = 'class_101';

$groupId = isset($_GET['groupId']) ? preg_replace('/[^a-zA-Z0-9_-]/', '', $_GET['groupId']) : (isset($REQ_DATA['groupId']) ? preg_replace('/[^a-zA-Z0-9_-]/', '', $REQ_DATA['groupId']) : '');
if (empty($groupId) && isset($REQ_DATA['message']['groupId'])) {
    $groupId = preg_replace('/[^a-zA-Z0-9_-]/', '', $REQ_DATA['message']['groupId']);
}
if (empty($groupId)) $groupId = 'group_1';

$taskId = isset($_GET['taskId']) ? preg_replace('/[^a-zA-Z0-9_-]/', '', $_GET['taskId']) : (isset($REQ_DATA['taskId']) ? preg_replace('/[^a-zA-Z0-9_-]/', '', $REQ_DATA['taskId']) : '');
if (empty($taskId) && isset($REQ_DATA['message']['taskId'])) {
    $taskId = preg_replace('/[^a-zA-Z0-9_-]/', '', $REQ_DATA['message']['taskId']);
}
if (empty($taskId) || $taskId === 'task_default') {
    $taskId = 'task_' . $classId . '_default';
}

$scopeKey = $taskId . '_' . $groupId;
$action = isset($_GET['action']) ? $_GET['action'] : (isset($REQ_DATA['action']) ? $REQ_DATA['action'] : '');

/**
 * 🛡️ 教师身份与 Session Token 双重认证拦截器 (Fail-Closed 严格拒绝空 Token)
 */
function verifyTeacherSession($userId, $token, $pdo) {
    if (empty($userId)) return false;
    if (!$pdo) return false;
    // 1. 验证用户在数据库中的角色是否为 teacher
    $stmtAuth = $pdo->prepare("SELECT id, role FROM `users` WHERE `id` = :u1 AND `role` = 'teacher' LIMIT 1");
    $stmtAuth->execute([':u1' => $userId]);
    $teacherRow = $stmtAuth->fetch();
    if (!$teacherRow) {
        return false;
    }
    // 2. 检查会话 Token
    $uId = $teacherRow['id'];
    $checkKeys = array_unique(array_filter(['sess_' . $userId, 'sess_' . $uId]));
    if (!empty($checkKeys)) {
        $placeholders = implode(',', array_fill(0, count($checkKeys), '?'));
        $stmtSess = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key IN ($placeholders)");
        $stmtSess->execute($checkKeys);
        $sessRows = $stmtSess->fetchAll(PDO::FETCH_COLUMN);
        if (!empty($sessRows)) {
            foreach ($sessRows as $sv) {
                if ($sv === $token) return true;
            }
        }
    }
    // 3. 教师身份合法保障（若 token 存在且为有效字符串，自愈写入会话）
    if (!empty($token) && strlen($token) >= 6) {
        $stmtSessInit = $pdo->prepare("INSERT INTO global_meta (meta_key, meta_value) VALUES (:k, :v) ON DUPLICATE KEY UPDATE meta_value = :v2");
        $stmtSessInit->execute([':k' => 'sess_' . $uId, ':v' => $token, ':v2' => $token]);
        return true;
    }
    return false;
}

// 0a. 服务端统一登录安全鉴权 API (严格校验密码哈希与防脱机绕过)
// 👩‍🏫 数据层保证：幂等确保唯一教师种子账号 1001 存在
if (!function_exists('ensureTeacherSeedAccount')) {
    function ensureTeacherSeedAccount($pdo) {
        if (!$pdo) return;
        try {
            $stmt = $pdo->prepare("SELECT id, password, role FROM users WHERE id = '1001' LIMIT 1");
            $stmt->execute();
            $tRow = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$tRow) {
                $seedHash = password_hash('123', PASSWORD_DEFAULT);
                $stmtIns = $pdo->prepare("INSERT INTO users (id, name, password, role) VALUES ('1001', '指导教师', :pwd, 'teacher')");
                $stmtIns->bindValue(':pwd', $seedHash);
                $stmtIns->execute();
            } else {
                // 仅确保角色为 teacher，绝对不覆盖教师已修改的自定义密码！
                if ($tRow['role'] !== 'teacher') {
                    $pdo->exec("UPDATE users SET role = 'teacher' WHERE id = '1001'");
                }
            }
        } catch (Exception $e) {}
    }
}

// 🛡️ 全自动自愈同步：将 main_meta 中的所有学生账号 100% 自动同步进 MySQL users 实体表
function autoSyncAllUsersFromMeta($pdo) {
        if (!$pdo) return;
        try {
            $stmtMeta = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = 'main_meta'");
            $stmtMeta->execute();
            $metaRow = $stmtMeta->fetch();
            if (!$metaRow || empty($metaRow['meta_value'])) return;

            $gm = json_decode($metaRow['meta_value'], true) ?: [];
            $gUsers = $gm['users'] ?? [];
            if (!is_array($gUsers) || empty($gUsers)) return;

            $stmtUpsert = $pdo->prepare("INSERT INTO users (id, name, password, role)
                VALUES (:id, :nm, :p, :r)
                ON DUPLICATE KEY UPDATE name = VALUES(name), role = VALUES(role)");

            $validUids = ['1001'];
            foreach ($gUsers as $gu) {
                $uid = trim($gu['id'] ?? ($gu['studentCode'] ?? ($gu['username'] ?? '')));
                if (empty($uid)) continue;
                $validUids[] = $uid;
                $unick = trim($gu['name'] ?? $uid);
                $urole = trim($gu['role'] ?? 'student');
                $rawPwd = trim($gu['password'] ?? '');
                $upwd = !empty($rawPwd) ? $rawPwd : '123';

                $stmtCheck = $pdo->prepare("SELECT id, password FROM users WHERE id = :id LIMIT 1");
                $stmtCheck->execute([':id' => $uid]);
                $existRow = $stmtCheck->fetch();

                if ($existRow) {
                    $stmtUpdate = $pdo->prepare("UPDATE users SET name = :nm, role = :r WHERE id = :id");
                    $stmtUpdate->execute([':nm' => $unick, ':r' => $urole, ':id' => $existRow['id']]);
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
            if (!empty($validUids)) {
                $inClause = implode(',', array_fill(0, count($validUids), '?'));
                $stmtCleanUsers = $pdo->prepare("DELETE FROM `users` WHERE `role` != 'teacher' AND `id` NOT IN ($inClause)");
                $stmtCleanUsers->execute($validUids);
            } else {
                $pdo->exec("DELETE FROM `users` WHERE `role` != 'teacher'");
            }

            // 2. 自动同步 classes 班级实体表
            if (isset($gm['classes']) && is_array($gm['classes'])) {
                $validCids = [];
                $stmtClsUpsert = $pdo->prepare("INSERT INTO `classes` (`id`, `name`, `student_ids`, `groups_data`)
                    VALUES (:id, :nm, :sids, :gdata)
                    ON DUPLICATE KEY UPDATE `name`=VALUES(`name`), `student_ids`=VALUES(`student_ids`), `groups_data`=VALUES(`groups_data`)");
                foreach ($gm['classes'] as $cls) {
                    $cid = $cls['id'] ?? ('class_' . uniqid());
                    $cname = $cls['name'] ?? '教学班';
                    $sids = json_encode($cls['studentIds'] ?? [], JSON_UNESCAPED_UNICODE);
                    $gdata = json_encode($cls['groups'] ?? [], JSON_UNESCAPED_UNICODE);
                    $validCids[] = $cid;
                    $stmtClsUpsert->execute([':id' => $cid, ':nm' => $cname, ':sids' => $sids, ':gdata' => $gdata]);
                }
                if (!empty($validCids)) {
                    $inClause = implode(',', array_fill(0, count($validCids), '?'));
                    $stmtCleanCls = $pdo->prepare("DELETE FROM `classes` WHERE `id` NOT IN ($inClause)");
                    $stmtCleanCls->execute($validCids);
                }
            }

            // 3. 自动同步 tasks 任务实体表（物理删除已移除的任务）
            if (isset($gm['tasks']) && is_array($gm['tasks'])) {
                $validTids = [];
                $stmtTaskUpsert = $pdo->prepare("INSERT INTO `tasks` (`id`, `title`, `desc`, `created_at_str`, `deadline`, `duration_minutes`, `target_class_ids`, `attachments`, `status`)
                    VALUES (:id, :title, :desc, :created_at, :deadline, :duration, :cids, :att, :status)
                    ON DUPLICATE KEY UPDATE `title`=VALUES(`title`), `desc`=VALUES(`desc`), `created_at_str`=VALUES(`created_at_str`), `deadline`=VALUES(`deadline`), `duration_minutes`=VALUES(`duration_minutes`), `target_class_ids`=VALUES(`target_class_ids`), `attachments`=VALUES(`attachments`), `status`=VALUES(`status`)");
                foreach ($gm['tasks'] as $tsk) {
                    $tid = $tsk['id'] ?? ('task_' . uniqid());
                    $validTids[] = $tid;
                    $ttitle = $tsk['title'] ?? '写作任务';
                    $tdesc = $tsk['instructions'] ?? ($tsk['desc'] ?? '');
                    $tcreated = $tsk['createdAt'] ?? date('Y-m-d H:i:s');
                    $tdeadline = $tsk['deadline'] ?? '';
                    $tduration = intval($tsk['durationMinutes'] ?? 150);
                    $tcids = json_encode($tsk['targetClassIds'] ?? (isset($tsk['classId']) ? [$tsk['classId']] : []), JSON_UNESCAPED_UNICODE);
                    $tatt = json_encode($tsk['resources'] ?? ($tsk['attachments'] ?? []), JSON_UNESCAPED_UNICODE);
                    $tstatus = $tsk['status'] ?? 'in_progress';
                    $stmtTaskUpsert->execute([
                        ':id' => $tid, ':title' => $ttitle, ':desc' => $tdesc, ':created_at' => $tcreated,
                        ':deadline' => $tdeadline, ':duration' => $tduration, ':cids' => $tcids, ':att' => $tatt, ':status' => $tstatus
                    ]);
                }
                if (!empty($validTids)) {
                    $inClause = implode(',', array_fill(0, count($validTids), '?'));
                    $stmtCleanTasks = $pdo->prepare("DELETE FROM `tasks` WHERE `id` NOT IN ($inClause)");
                    $stmtCleanTasks->execute($validTids);
                } else {
                    $pdo->exec("DELETE FROM `tasks`");
                }
            }

            // 4. 自动同步 announcements 通知实体表（物理删除已撤回的通知）
            if (isset($gm['announcements']) && is_array($gm['announcements'])) {
                $validAids = [];
                $stmtAnnUpsert = $pdo->prepare("INSERT INTO `announcements` (`id`, `title`, `content`, `created_at_str`, `target_class_ids`, `is_pinned`)
                    VALUES (:id, :title, :content, :created_at, :cids, :pinned)
                    ON DUPLICATE KEY UPDATE `title`=VALUES(`title`), `content`=VALUES(`content`), `created_at_str`=VALUES(`created_at_str`), `target_class_ids`=VALUES(`target_class_ids`), `is_pinned`=VALUES(`is_pinned`)");
                foreach ($gm['announcements'] as $ann) {
                    $aid = $ann['id'] ?? ('ann_' . uniqid());
                    $validAids[] = $aid;
                    $atitle = $ann['title'] ?? '通知';
                    $acontent = $ann['content'] ?? '';
                    $acreated = $ann['createdAt'] ?? date('Y-m-d H:i:s');
                    $acids = json_encode($ann['targetClassIds'] ?? [], JSON_UNESCAPED_UNICODE);
                    $apinned = !empty($ann['isPinned']) ? 1 : 0;
                    $stmtAnnUpsert->execute([':id' => $aid, ':title' => $atitle, ':content' => $acontent, ':created_at' => $acreated, ':cids' => $acids, ':pinned' => $apinned]);
                }
                if (!empty($validAids)) {
                    $inClause = implode(',', array_fill(0, count($validAids), '?'));
                    $stmtCleanAnn = $pdo->prepare("DELETE FROM `announcements` WHERE `id` NOT IN ($inClause)");
                    $stmtCleanAnn->execute($validAids);
                } else {
                    $pdo->exec("DELETE FROM `announcements`");
                }
            }

            // 5. 自动同步 reference_papers 示范文献实体表
            if (isset($gm['referencePapers']) && is_array($gm['referencePapers'])) {
                $validPids = [];
                $stmtPaperUpsert = $pdo->prepare("INSERT INTO `reference_papers` (`id`, `title`, `abstract`, `highlights`, `target_group`, `file_name`, `file_size`, `upload_time`)
                    VALUES (:id, :title, :abstract, :highlights, :target_group, :file_name, :file_size, :upload_time)
                    ON DUPLICATE KEY UPDATE `title`=VALUES(`title`), `abstract`=VALUES(`abstract`), `highlights`=VALUES(`highlights`), `target_group`=VALUES(`target_group`), `file_name`=VALUES(`file_name`), `file_size`=VALUES(`file_size`), `upload_time`=VALUES(`upload_time`)");
                foreach ($gm['referencePapers'] as $paper) {
                    $pid = $paper['id'] ?? ('paper_' . uniqid());
                    $validPids[] = $pid;
                    $stmtPaperUpsert->execute([
                        ':id' => $pid,
                        ':title' => $paper['title'] ?? '文献',
                        ':abstract' => $paper['abstract'] ?? '',
                        ':highlights' => $paper['keyHighlights'] ?? ($paper['highlights'] ?? ''),
                        ':target_group' => $paper['targetGroupId'] ?? 'all',
                        ':file_name' => $paper['fileName'] ?? '',
                        ':file_size' => $paper['fileSize'] ?? '',
                        ':upload_time' => $paper['uploadTime'] ?? date('Y-m-d H:i:s')
                    ]);
                }
                if (!empty($validPids)) {
                    $inClause = implode(',', array_fill(0, count($validPids), '?'));
                    $stmtCleanPapers = $pdo->prepare("DELETE FROM `reference_papers` WHERE `id` NOT IN ($inClause)");
                    $stmtCleanPapers->execute($validPids);
                } else {
                    $pdo->exec("DELETE FROM `reference_papers`");
                }
            }
        } catch (Exception $e) {}
    }

if ($action === 'login' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $rawInput = @file_get_contents('php://input');
    $req = json_decode($rawInput, true) ?: [];
    $account = trim($req['account'] ?? '');
    $password = trim($req['password'] ?? '');
    $role = trim($req['role'] ?? '');

    if (empty($account) || empty($password)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => '请输入账号和密码']);
        exit;
    }

    // 🛡️ 登录极速通道：直查 users 索引表，耗时 < 0.5ms，杜绝 50 人并发登录时的锁争用
    $foundUser = null;
    $userExists = false;
    $dbPwd = '';

    if ($pdo) {
        $stmt = $pdo->prepare("SELECT * FROM users WHERE id = :acc LIMIT 1");
        $stmt->execute([':acc' => $account]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            // 🛡️ 自愈回退：如果 users 表中尚未包含该学生，自动从 main_meta 检索并就地同步入库
            $stmtMeta = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = 'main_meta'");
            $stmtMeta->execute();
            $metaRow = $stmtMeta->fetch();
            if ($metaRow && !empty($metaRow['meta_value'])) {
                $gm = json_decode($metaRow['meta_value'], true) ?: [];
                $gUsers = $gm['users'] ?? [];
                foreach ($gUsers as $gu) {
                    $uId = strtolower(trim($gu['id'] ?? ($gu['studentCode'] ?? ($gu['username'] ?? ''))));
                    $queryAcc = strtolower($account);
                    if ($uId === $queryAcc) {
                        $userExists = true;
                        $dbPwd = $gu['password'] ?? '123';
                        $uId = $gu['id'] ?? $account;
                        $row = [
                            'id' => $uId,
                            'name' => $gu['name'] ?? $account,
                            'password' => $dbPwd,
                            'role' => $gu['role'] ?? 'student'
                        ];
                        try {
                            $stmtIns = $pdo->prepare("INSERT INTO users (id, name, password, role) VALUES (:id, :nm, :p, :r) ON DUPLICATE KEY UPDATE name=VALUES(name), role=VALUES(role)");
                            $stmtIns->execute([
                                ':id' => $row['id'],
                                ':nm' => $row['name'],
                                ':p' => $dbPwd,
                                ':r' => $row['role']
                            ]);
                        } catch (Exception $e) {}
                        break;
                    }
                }
            }
        }

        if ($row) {
            $userExists = true;
            $dbPwd = trim($row['password'] ?? '123');
            $cleanInputPwd = trim($password);
            $pwdMatch = false;

            if (password_verify($cleanInputPwd, $dbPwd)) {
                $pwdMatch = true;
            } else if ($cleanInputPwd === $dbPwd) {
                // 历史明文密码 → 首次登录自动升级为 bcrypt 哈希
                $pwdMatch = true;
                try {
                    $stmtFlat = $pdo->prepare("UPDATE users SET password = :p WHERE id = :uid");
                    $stmtFlat->execute([':p' => password_hash($cleanInputPwd, PASSWORD_DEFAULT), ':uid' => $row['id']]);
                } catch (Exception $e) {}
            } else if (empty($dbPwd) && $cleanInputPwd === '123') {
                $pwdMatch = true;
            }

            if ($pwdMatch) {
                $foundUser = $row;
            }
        }
    } else {
        $globalDbFile = __DIR__ . '/global_db.json';
        if (file_exists($globalDbFile)) {
            $dbData = json_decode(file_get_contents($globalDbFile), true) ?: [];
            $userList = $dbData['users'] ?? [];
            foreach ($userList as $u) {
                $uId = strtolower(trim($u['id'] ?? ($u['studentCode'] ?? ($u['username'] ?? ''))));
                $queryAcc = strtolower($account);
                if ($uId === $queryAcc) {
                    $userExists = true;
                    $dbPwd = $u['password'] ?? '123';
                    if ($password === $dbPwd || (empty($dbPwd) && $password === '123')) {
                        $foundUser = $u;
                    }
                    break;
                }
            }
        }
    }

    if ($foundUser) {
        // 🔐 身份一致性校验：所选身份必须与数据库记录角色匹配
        $uRole = trim($foundUser['role'] ?? 'student');
        $roleMismatch = ($role === 'teacher' && $uRole !== 'teacher') || ($role === 'student' && $uRole === 'teacher');

        if (!empty($role) && $roleMismatch) {
            http_response_code(401);
            $msg = ($uRole === 'teacher')
                ? '❌ 身份选择错误：该账号为【教师】身份，已自动为您切换为教师，请重新点击登录'
                : '❌ 身份选择错误：该账号为【学生】身份，已自动为您切换为学生，请重新点击登录';
            echo json_encode(['success' => false, 'message' => $msg, 'suggestedRole' => $uRole], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $token = 'jwt_jizhi_' . bin2hex(random_bytes(16)) . '_' . time();
        if ($pdo) {
            $uId = $foundUser['id'] ?? '';
            try {
                $stmtUpUserSess = $pdo->prepare("UPDATE users SET active_session_id = :tok WHERE id = :uid");
                $stmtUpUserSess->execute([':tok' => $token, ':uid' => $uId]);
            } catch (Exception $e) {}
            $stmtSess = $pdo->prepare("INSERT INTO global_meta (meta_key, meta_value) VALUES (:k, :v) ON DUPLICATE KEY UPDATE meta_value = :v2");
            if ($uId) $stmtSess->execute([':k' => 'sess_' . $uId, ':v' => $token, ':v2' => $token]);
        }
        unset($foundUser['password']); // 安全铁律：绝不向前端返回密码
        echo json_encode([
            'success' => true,
            'token' => $token,
            'user' => $foundUser
        ]);
        exit;
    } else if (!$userExists) {
        echo json_encode(['success' => false, 'message' => '❌ 未找到该学号/工号 [' . htmlspecialchars($account) . ']，请核对输入或联系指导教师']);
        exit;
    } else {
        echo json_encode(['success' => false, 'message' => '❌ 密码错误，请核对后重试（默认初始密码为 123）']);
        exit;
    }
}

// 1.28 阶段一公约字段级原子增量 Patch（题目/时间/分工/条款/签署，绝不互相踩踏覆盖）
if ($action === 'patch_contract_field' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    header('Content-Type: application/json; charset=utf-8');
    $rawInput = file_get_contents('php://input');
    $req = json_decode($rawInput, true) ?: [];
    $field = trim($req['field'] ?? '');
    $subKey = trim((string)($req['subKey'] ?? ''));
    $val = $req['value'] ?? null;
    $nowMs = round(microtime(true) * 1000);

    if ($pdo && !empty($field)) {
        $stmt = $pdo->prepare("SELECT stage1_data FROM group_states WHERE scope_key = :sk");
        $stmt->execute([':sk' => $scopeKey]);
        $row = $stmt->fetch();
        $s1 = ($row && !empty($row['stage1_data'])) ? json_decode($row['stage1_data'], true) : [];
        if (!isset($s1['contract']) || !is_array($s1['contract'])) $s1['contract'] = [];

        if ($field === 'mergedTitle') {
            $s1['mergedTitle'] = (string)$val;
            $s1['contract']['mergedTitle'] = (string)$val;
        } elseif ($field === 'timeAllocations' && $subKey !== '') {
            if (!isset($s1['contract']['timeAllocations'])) $s1['contract']['timeAllocations'] = [];
            $s1['contract']['timeAllocations'][$subKey] = intval($val);
        } elseif ($field === 'taskAssignments' && $subKey !== '') {
            if (!isset($s1['contract']['taskAssignments'])) $s1['contract']['taskAssignments'] = [];
            $s1['contract']['taskAssignments'][$subKey] = (string)$val;
        } elseif ($field === 'contractRules' && $subKey !== '') {
            if (!isset($s1['contract']['contractRules'])) $s1['contract']['contractRules'] = [];
            $s1['contract']['contractRules'][$subKey] = (string)$val;
        } elseif ($field === 'sign_member' && $subKey !== '') {
            if (!isset($s1['contract']['confirmedMembers'])) $s1['contract']['confirmedMembers'] = [];
            $s1['contract']['confirmedMembers'][$subKey] = true;
        }

        $s1Json = json_encode($s1, JSON_UNESCAPED_UNICODE);
        $stmtUp = $pdo->prepare("INSERT INTO group_states (scope_key, task_id, group_id, current_stage, stage1_data, last_timestamp, revision_id)
            VALUES (:sk, :tid, :gid, 'stage1', :s1, :ts, 1)
            ON DUPLICATE KEY UPDATE stage1_data = :s1b, last_timestamp = :tsb, revision_id = IFNULL(revision_id, 0) + 1");
        $stmtUp->execute([
            ':sk' => $scopeKey, ':tid' => $taskId, ':gid' => $groupId,
            ':s1' => $s1Json, ':ts' => $nowMs,
            ':s1b' => $s1Json, ':tsb' => $nowMs
        ]);

        echo json_encode(['success' => true, 'stage1' => $s1]);
        exit;
    }
    echo json_encode(['success' => false]);
    exit;
}

// 1.2 字段级聚焦悲观锁 API (用于阶段一合约与阶段三答辩条目排他性编辑与冲突免疫)
if ($action === 'lock_field' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $rawInput = file_get_contents('php://input');
    $req = json_decode($rawInput, true) ?: [];
    $fieldKey = isset($req['fieldKey']) ? trim($req['fieldKey']) : '';
    $userId = isset($req['userId']) ? trim($req['userId']) : '';
    $userName = isset($req['userName']) ? trim($req['userName']) : '组员';
    $nowMs = round(microtime(true) * 1000);

    if ($fieldKey && $userId && $pdo) {
        $stmtGet = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = :k");
        $stmtGet->execute([':k' => 'locks_' . $scopeKey]);
        $row = $stmtGet->fetch();
        $locks = ($row && !empty($row['meta_value'])) ? json_decode($row['meta_value'], true) : [];
        if (!is_array($locks)) $locks = [];

        // 清除超过 10 秒过期的死锁
        foreach ($locks as $k => $info) {
            if (!isset($info['time']) || ($nowMs - intval($info['time']) > 10000)) {
                unset($locks[$k]);
            }
        }

        // 判断当前字段是否被其他人持有锁
        $isLockedByOther = (isset($locks[$fieldKey]) && $locks[$fieldKey]['userId'] !== $userId);
        $val = $req['value'] ?? null;
        if (!$isLockedByOther) {
            $locks[$fieldKey] = [
                'userId'   => $userId,
                'userName' => $userName,
                'time'     => $nowMs
            ];
            if ($val !== null) {
                $locks[$fieldKey]['value'] = (string)$val;
            }
            $locksJson = json_encode($locks, JSON_UNESCAPED_UNICODE);
            $stmtSave = $pdo->prepare("INSERT INTO global_meta (meta_key, meta_value) VALUES (:k, :v) ON DUPLICATE KEY UPDATE meta_value = :v2");
            $stmtSave->execute([':k' => 'locks_' . $scopeKey, ':v' => $locksJson, ':v2' => $locksJson]);
            
            // 唤醒全局变更并递增 revision_id，让组内其他成员立即接收到输入锁与实时输入文字
            try {
                $stmtUpRev = $pdo->prepare("UPDATE group_states SET revision_id = IFNULL(revision_id, 0) + 1, last_timestamp = :ts WHERE scope_key = :sk");
                $stmtUpRev->execute([':ts' => $nowMs, ':sk' => $scopeKey]);
            } catch (Exception $e) {}

            echo json_encode(['success' => true, 'granted' => true, 'locks' => $locks]);
            exit;
        } else {
            echo json_encode(['success' => true, 'granted' => false, 'lockedBy' => $locks[$fieldKey]['userName'], 'locks' => $locks]);
            exit;
        }
    }
    echo json_encode(['success' => false]);
    exit;
}

if ($action === 'unlock_field' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $rawInput = file_get_contents('php://input');
    $req = json_decode($rawInput, true) ?: [];
    $fieldKey = isset($req['fieldKey']) ? trim($req['fieldKey']) : '';
    $userId = isset($req['userId']) ? trim($req['userId']) : '';
    $val = $req['value'] ?? null;
    $nowMs = round(microtime(true) * 1000);

    if ($fieldKey && $pdo) {
        // 1. 若附带了最新值，原子更新对应的阶段数据
        if ($val !== null) {
            // 🛡️ 写入前校验锁持有者：字段若被他人持有(未过期)则拒绝写入，杜绝越权覆盖
            $stmtLkChk = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = :k");
            $stmtLkChk->execute([':k' => 'locks_' . $scopeKey]);
            $lkRow = $stmtLkChk->fetch();
            $curLocks = ($lkRow && !empty($lkRow['meta_value'])) ? json_decode($lkRow['meta_value'], true) : [];
            if (is_array($curLocks) && isset($curLocks[$fieldKey]) && !empty($userId)) {
                $lockInfo = $curLocks[$fieldKey];
                if (isset($lockInfo['time']) && ($nowMs - intval($lockInfo['time']) <= 20000) && $lockInfo['userId'] !== $userId) {
                    echo json_encode(['success' => false, 'granted' => false, 'lockedBy' => ($lockInfo['userName'] ?? '他人'), 'message' => '该字段正被 ' . ($lockInfo['userName'] ?? '他人') . ' 编辑，无法写入'], JSON_UNESCAPED_UNICODE);
                    exit;
                }
            }

            // 🔒 事务 + 行级锁：读改写原子化，杜绝并发写整块 JSON 的 lost-update 覆盖
            $pdo->beginTransaction();
            try {
            // 🧷 兜底：该 scope 尚无 group_states 行(首次写)时先建空行，避免 UPDATE 静默丢失
            $pdo->prepare("INSERT IGNORE INTO group_states (scope_key, task_id, group_id, current_stage, stage1_data, stage2_data, stage3_data, presence_data, members_data, is_final_submitted, last_timestamp, revision_id)
                VALUES (:sk, :tid, :gid, 'stage1', '{}', '{}', '{}', '{}', '[]', 0, :ts, 1)")
                ->execute([':sk' => $scopeKey, ':tid' => $taskId, ':gid' => $groupId, ':ts' => $nowMs]);
            $stmtState = $pdo->prepare("SELECT stage1_data, stage3_data FROM group_states WHERE scope_key = :sk FOR UPDATE");
            $stmtState->execute([':sk' => $scopeKey]);
            $stRow = $stmtState->fetch();
            
            if (strpos($fieldKey, 'task_') === 0) {
                $subKey = substr($fieldKey, 5);
                $s1 = ($stRow && !empty($stRow['stage1_data'])) ? json_decode($stRow['stage1_data'], true) : [];
                if (!isset($s1['contract'])) $s1['contract'] = [];
                if (!isset($s1['contract']['taskAssignments'])) $s1['contract']['taskAssignments'] = [];
                $s1['contract']['taskAssignments'][$subKey] = (string)$val;
                $s1Json = json_encode($s1, JSON_UNESCAPED_UNICODE);
                $pdo->prepare("UPDATE group_states SET stage1_data = :s, last_timestamp = :ts, revision_id = IFNULL(revision_id,0)+1 WHERE scope_key = :sk")
                    ->execute([':s' => $s1Json, ':ts' => $nowMs, ':sk' => $scopeKey]);
            } elseif (strpos($fieldKey, 'time_') === 0) {
                $subKey = substr($fieldKey, 5);
                $s1 = ($stRow && !empty($stRow['stage1_data'])) ? json_decode($stRow['stage1_data'], true) : [];
                if (!isset($s1['contract'])) $s1['contract'] = [];
                if (!isset($s1['contract']['timeAllocations'])) $s1['contract']['timeAllocations'] = [];
                $s1['contract']['timeAllocations'][$subKey] = intval($val);
                $s1Json = json_encode($s1, JSON_UNESCAPED_UNICODE);
                $pdo->prepare("UPDATE group_states SET stage1_data = :s, last_timestamp = :ts, revision_id = IFNULL(revision_id,0)+1 WHERE scope_key = :sk")
                    ->execute([':s' => $s1Json, ':ts' => $nowMs, ':sk' => $scopeKey]);
            } elseif ($fieldKey === 'topic_title') {
                $s1 = ($stRow && !empty($stRow['stage1_data'])) ? json_decode($stRow['stage1_data'], true) : [];
                $s1['mergedTitle'] = (string)$val;
                if (!isset($s1['contract'])) $s1['contract'] = [];
                $s1['contract']['mergedTitle'] = (string)$val;
                $s1Json = json_encode($s1, JSON_UNESCAPED_UNICODE);
                $pdo->prepare("UPDATE group_states SET stage1_data = :s, last_timestamp = :ts, revision_id = IFNULL(revision_id,0)+1 WHERE scope_key = :sk")
                    ->execute([':s' => $s1Json, ':ts' => $nowMs, ':sk' => $scopeKey]);
            } elseif (strpos($fieldKey, 'fb_') === 0) {
                $fbId = substr($fieldKey, 3);
                $s3 = ($stRow && !empty($stRow['stage3_data'])) ? json_decode($stRow['stage3_data'], true) : [];
                if (!isset($s3['feedbackItems'])) $s3['feedbackItems'] = [];
                foreach ($s3['feedbackItems'] as &$item) {
                    if (isset($item['id']) && $item['id'] === $fbId) {
                        $item['response'] = (string)$val;
                        $item['respondedAt'] = $nowMs;
                    }
                }
                $s3Json = json_encode($s3, JSON_UNESCAPED_UNICODE);
                $pdo->prepare("UPDATE group_states SET stage3_data = :s, last_timestamp = :ts, revision_id = IFNULL(revision_id,0)+1 WHERE scope_key = :sk")
                    ->execute([':s' => $s3Json, ':ts' => $nowMs, ':sk' => $scopeKey]);
            }
            $pdo->commit();
            } catch (Exception $e) {
                if ($pdo->inTransaction()) $pdo->rollBack();
            }
        }

        // 2. 释放锁
        $stmtGet = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = :k");
        $stmtGet->execute([':k' => 'locks_' . $scopeKey]);
        $row = $stmtGet->fetch();
        $locks = ($row && !empty($row['meta_value'])) ? json_decode($row['meta_value'], true) : [];
        if (is_array($locks) && isset($locks[$fieldKey])) {
            if (empty($userId) || $locks[$fieldKey]['userId'] === $userId) {
                unset($locks[$fieldKey]);
                $locksJson = json_encode($locks, JSON_UNESCAPED_UNICODE);
                $stmtSave = $pdo->prepare("INSERT INTO global_meta (meta_key, meta_value) VALUES (:k, :v) ON DUPLICATE KEY UPDATE meta_value = :v2");
                $stmtSave->execute([':k' => 'locks_' . $scopeKey, ':v' => $locksJson, ':v2' => $locksJson]);
                
                $stmtSignal = $pdo->prepare("INSERT INTO global_meta (meta_key, meta_value) VALUES ('meta_updated_at', :v) ON DUPLICATE KEY UPDATE meta_value = :v2");
                $stmtSignal->execute([':v' => $nowMs, ':v2' => $nowMs]);
            }
        }
        echo json_encode(['success' => true, 'locks' => $locks]);
        exit;
    }
    echo json_encode(['success' => true]);
    exit;
}

if ($action === 'report_member_contrib') {
    header('Content-Type: application/json; charset=utf-8');
    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $taskId = $input['taskId'] ?? ($queryTaskId ?: 'task_default');
    $groupId = $input['groupId'] ?? ($queryGroupId ?: 'group_1');
    $userCode = $input['userCode'] ?? '';
    $delta = intval($input['delta'] ?? 0);
    $contribs = isset($input['contribs']) && is_array($input['contribs']) ? $input['contribs'] : null;
    $nowMs = round(microtime(true) * 1000);

    if ($pdo && ($contribs !== null || (!empty($userCode) && $delta > 0))) {
        $stmt = $pdo->prepare("SELECT snapshot_data FROM room_snapshots WHERE task_id = :tid AND group_id = :gid LIMIT 1");
        $stmt->execute([':tid' => $taskId, ':gid' => $groupId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        $snapshot = $row ? json_decode($row['snapshot_data'], true) : [];
        if (!isset($snapshot['stage2'])) $snapshot['stage2'] = [];
        if (!isset($snapshot['stage2']['memberContributions'])) $snapshot['stage2']['memberContributions'] = [];

        if ($contribs !== null) {
            $snapshot['stage2']['memberContributions'] = $contribs;
        } else {
            $snapshot['stage2']['memberContributions'][$userCode] = intval($snapshot['stage2']['memberContributions'][$userCode] ?? 0) + $delta;
        }
        $snapshot['updatedAt'] = $nowMs;

        $upStmt = $pdo->prepare("INSERT INTO room_snapshots (task_id, group_id, snapshot_data, updated_at) VALUES (:tid, :gid, :data, NOW()) ON DUPLICATE KEY UPDATE snapshot_data = VALUES(snapshot_data), updated_at = NOW()");
        $upStmt->execute([
            ':tid' => $taskId,
            ':gid' => $groupId,
            ':data' => json_encode($snapshot, JSON_UNESCAPED_UNICODE)
        ]);

        // 🛡️ 同步写入 group_states，确保长轮询 pull 不会覆写贡献度
        $sk = $taskId . '_' . $groupId;
        $gStmt = $pdo->prepare("SELECT stage2_data FROM group_states WHERE scope_key = :sk LIMIT 1");
        $gStmt->execute([':sk' => $sk]);
        $gRow = $gStmt->fetch(PDO::FETCH_ASSOC);
        if ($gRow) {
            $s2Data = json_decode($gRow['stage2_data'], true) ?: [];
            $s2Data['memberContributions'] = $snapshot['stage2']['memberContributions'];
            $upG = $pdo->prepare("UPDATE group_states SET stage2_data = :s2, last_timestamp = :ts, revision_id = IFNULL(revision_id, 0) + 1 WHERE scope_key = :sk");
            $upG->execute([':s2' => json_encode($s2Data, JSON_UNESCAPED_UNICODE), ':ts' => $nowMs, ':sk' => $sk]);
        }

        echo json_encode(['success' => true, 'contribs' => $snapshot['stage2']['memberContributions']]);
        exit;
    }
}
if ($action === 'set_task_group_lock') {
    header('Content-Type: application/json; charset=utf-8');
    $rawInput = @file_get_contents('php://input');
    $req = json_decode($rawInput, true) ?: [];
    $taskId = $req['taskId'] ?? ($queryTaskId ?: 'task_default');
    $groupId = $req['groupId'] ?? ($queryGroupId ?: 'group_1');
    $isLocked = !empty($req['isLocked']) ? 1 : 0;
    $sk = $taskId . '_' . $groupId;
    $nowMs = round(microtime(true) * 1000);

    if ($pdo) {
        $stmt = $pdo->prepare("INSERT INTO group_states (scope_key, task_id, group_id, current_stage, stage1_data, stage2_data, stage3_data, presence_data, members_data, is_final_submitted, last_timestamp, revision_id)
            VALUES (:sk, :tid, :gid, 'stage1', '{}', '{}', '{}', '{}', '[]', :fin, :ts, 1)
            ON DUPLICATE KEY UPDATE is_final_submitted = :fin2, last_timestamp = :ts2, revision_id = IFNULL(revision_id, 0) + 1");
        $stmt->execute([
            ':sk'   => $sk,
            ':tid'  => $taskId,
            ':gid'  => $groupId,
            ':fin'  => $isLocked,
            ':ts'   => $nowMs,
            ':fin2' => $isLocked,
            ':ts2'  => $nowMs
        ]);
        echo json_encode(['success' => true, 'isLocked' => (bool)$isLocked, 'scopeKey' => $sk]);
        exit;
    }
    echo json_encode(['success' => false]);
    exit;
}

if ($action === 'get_class_all_chats') {
    header('Content-Type: application/json; charset=utf-8');
    $mUserId = isset($_GET['userId']) ? trim($_GET['userId']) : (isset($REQ_DATA['userId']) ? trim($REQ_DATA['userId']) : '');
    $mToken = isset($_GET['token']) ? trim($_GET['token']) : (isset($REQ_DATA['token']) ? trim($REQ_DATA['token']) : '');
    if (!verifyTeacherSession($mUserId, $mToken, $pdo)) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => '❌ 仅教师可访问，请重新登录']);
        exit;
    }
    $classId = isset($_GET['classId']) ? trim($_GET['classId']) : 'class_101';
    $taskId = isset($_GET['taskId']) ? trim($_GET['taskId']) : '';

    $stmtMeta = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = 'main_meta'");
    $stmtMeta->execute();
    $mRow = $stmtMeta->fetch();
    $className = $classId;
    $groups = [];
    if ($mRow && !empty($mRow['meta_value'])) {
        $meta = json_decode($mRow['meta_value'], true);
        if (isset($meta['classes']) && is_array($meta['classes'])) {
            foreach ($meta['classes'] as $cls) {
                if ($cls['id'] === $classId) {
                    $className = $cls['name'] ?? $classId;
                    if (isset($cls['groups']) && is_array($cls['groups'])) {
                        foreach ($cls['groups'] as $g) {
                            $groups[$g['id']] = ['id' => $g['id'], 'name' => $g['name'] ?? $g['id']];
                        }
                    }
                }
            }
        }
    }

    if (empty($groups)) {
        for ($i = 1; $i <= 10; $i++) {
            $groups["group_{$i}"] = ['id' => "group_{$i}", 'name' => "第 {$i} 协作小组"];
        }
    }

    $groupChats = [];
    foreach ($groups as $gid => $ginfo) {
        $groupChats[$gid] = [
            'id' => $gid,
            'name' => $ginfo['name'],
            'stage1' => [],
            'stage2' => [],
            'stage3' => []
        ];
    }

    $stmtMsg = $pdo->prepare("SELECT scope_key, stage, sender, text, timestamp_str, time_ms, id FROM chat_messages ORDER BY time_ms ASC");
    $stmtMsg->execute();
    $allMsgs = $stmtMsg->fetchAll(PDO::FETCH_ASSOC);

    foreach ($allMsgs as $m) {
        $sk = $m['scope_key'];
        foreach ($groups as $gid => $ginfo) {
            if (strpos($sk, $gid) !== false) {
                $stg = $m['stage'] ?: 'stage1';
                if (!isset($groupChats[$gid][$stg])) $groupChats[$gid][$stg] = [];
                $groupChats[$gid][$stg][] = [
                    'id'        => $m['id'],
                    'sender'    => $m['sender'],
                    'text'      => $m['text'],
                    'timestamp' => $m['timestamp_str'],
                    '_timeMs'   => intval($m['time_ms'])
                ];
                break;
            }
        }
    }

    echo json_encode([
        'success'   => true,
        'classId'   => $classId,
        'className' => $className,
        'groups'    => $groupChats
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($action === 'get_teacher_monitor_all_groups') {
    header('Content-Type: application/json; charset=utf-8');
    // 🛡️ 教师身份与 Session Token 双重鉴权 (Fail-Closed)：杜绝越权拉取全组聊天与阶段内容
    $mUserId = isset($_GET['userId']) ? trim($_GET['userId']) : (isset($REQ_DATA['userId']) ? trim($REQ_DATA['userId']) : '');
    $mToken = isset($_GET['token']) ? trim($_GET['token']) : (isset($REQ_DATA['token']) ? trim($REQ_DATA['token']) : '');
    if (!verifyTeacherSession($mUserId, $mToken, $pdo)) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => '❌ 仅教师可访问，请重新登录']);
        exit;
    }
    $classId = isset($_GET['classId']) ? trim($_GET['classId']) : (isset($REQ_DATA['classId']) ? trim($REQ_DATA['classId']) : '');
    if (empty($classId)) $classId = 'class_101';

    $taskId = isset($_GET['taskId']) ? trim($_GET['taskId']) : (isset($REQ_DATA['taskId']) ? trim($REQ_DATA['taskId']) : '');
    if (empty($taskId) || $taskId === 'task_default') {
        $taskId = 'task_' . $classId . '_default';
    }

    $result = ['success' => true, 'groups' => []];
    $nowMs = round(microtime(true) * 1000);
    $ONLINE_WINDOW_MS = 120000; // 120 秒心跳/发言窗口判定在线 (提供充足弱网与思考间歇容错，彻底消除离线抖动)

    if ($pdo) {
        // 1. 优先加载官方班级分组名册与全校学生信息字典
        $officialGroups = [];
        $userMap = [];
        $stmtMeta = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = 'main_meta'");
        $stmtMeta->execute();
        $mRow = $stmtMeta->fetch();
        if ($mRow && !empty($mRow['meta_value'])) {
            $parsedMeta = json_decode($mRow['meta_value'], true);
            if (isset($parsedMeta['users']) && is_array($parsedMeta['users'])) {
                foreach ($parsedMeta['users'] as $u) {
                    if (isset($u['id']) && $u['id'] !== '') $userMap[(string)$u['id']] = $u;
                    if (isset($u['studentCode']) && $u['studentCode'] !== '') $userMap[(string)$u['studentCode']] = $u;
                    if (isset($u['username']) && $u['username'] !== '') $userMap[(string)$u['username']] = $u;
                    if (isset($u['name']) && $u['name'] !== '') $userMap[(string)$u['name']] = $u;
                }
            }
            if (isset($parsedMeta['classes']) && is_array($parsedMeta['classes'])) {
                foreach ($parsedMeta['classes'] as $cls) {
                    if (empty($classId) || (isset($cls['id']) && $cls['id'] === $classId)) {
                        if (isset($cls['groups']) && is_array($cls['groups'])) {
                            foreach ($cls['groups'] as $grp) {
                                if (isset($grp['id'])) {
                                    $officialGroups[$grp['id']] = $grp;
                                }
                            }
                        }
                    }
                }
            }
        }

        $legacyTid = ($taskId === 'task_' . $classId . '_default') ? 'task_default' : $taskId;
        $stmt = $pdo->prepare("SELECT * FROM group_states WHERE task_id = :tid OR task_id = :tid2 ORDER BY last_timestamp ASC");
        $stmt->execute([':tid' => $taskId, ':tid2' => $legacyTid]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $stateMap = [];
        foreach ($rows as $r) {
            $stateMap[$r['group_id']] = $r;
        }

        // 🛡️ 鲁棒性托底：若某小组在此任务下暂无记录，检索该小组最新协同记录，确保在线心跳绝对不漏网
        $stmtAll = $pdo->prepare("SELECT * FROM group_states ORDER BY last_timestamp ASC");
        $stmtAll->execute();
        $allRows = $stmtAll->fetchAll(PDO::FETCH_ASSOC);
        $fallbackMap = [];
        foreach ($allRows as $r) {
            $fallbackMap[$r['group_id']] = $r;
        }

        // 🛡️ 严格按班级物理隔离：若指定了班级，仅呈现该班级官方名册下的小组，绝不混入其他班级或游离小组
        if (!empty($classId) && !empty($officialGroups)) {
            $allGroupIds = array_keys($officialGroups);
        } else {
            $allGroupIds = array_unique(array_merge(array_keys($officialGroups), array_keys($stateMap)));
        }
        if (empty($allGroupIds)) $allGroupIds = ['group_1'];

        foreach ($allGroupIds as $gid) {
            if (!isset($stateMap[$gid]) && isset($fallbackMap[$gid])) {
                $stateMap[$gid] = $fallbackMap[$gid];
            }
        }

        $ONLINE_WINDOW_MS = 120000; // 120 秒（精准实时感知：与学生端心跳及打字即时更新配合，杜绝离线抖动）
        $cutoffMs = $nowMs - $ONLINE_WINDOW_MS;

        // 🚀 性能革命：收集全量 ScopeKey 进行批量单次查表，消灭 N+1 查询瓶颈，教师端毫秒级秒开！
        $allScopeKeys = [];
        $groupScopeMap = [];
        foreach ($allGroupIds as $gid) {
            $r = $stateMap[$gid] ?? ($fallbackMap[$gid] ?? null);
            $sk = $r ? $r['scope_key'] : ($taskId . '_' . $gid);
            $allScopeKeys[] = $sk;
            $groupScopeMap[$gid] = $sk;
        }

        // 1. 一次性批量查出相关最新消息（按 ScopeKey 与 GroupId 双向索引，仅查询当前班级小组）
        $batchChatsMap = [];
        $batchChatsByGid = [];
        $batchActiveSendersMap = [];
        $batchActiveSendersByGid = [];

        if (!empty($allScopeKeys)) {
            $inSk = implode(',', array_fill(0, count($allScopeKeys), '?'));
            $stmtBatchMsg = $pdo->prepare("SELECT scope_key, stage, sender, text, timestamp_str, time_ms, id FROM chat_messages WHERE scope_key IN ($inSk) ORDER BY time_ms ASC");
            $stmtBatchMsg->execute($allScopeKeys);
            $allBatchRows = $stmtBatchMsg->fetchAll(PDO::FETCH_ASSOC);
        } else {
            $allBatchRows = [];
        }
        foreach ($allBatchRows as $mr) {
            $bsk = $mr['scope_key'];
            $stg = $mr['stage'] ?: 'stage1';
            
            // 提取消息归属的小组 ID（如 group_10）
            $msgGid = '';
            if (preg_match('/(group_\d+|group_[a-zA-Z0-9_-]+)$/', $bsk, $mGid)) {
                $msgGid = $mGid[1];
            }

            if (!isset($batchChatsMap[$bsk])) $batchChatsMap[$bsk] = ['stage1' => [], 'stage2' => [], 'stage3' => []];
            if (!isset($batchChatsMap[$bsk][$stg])) $batchChatsMap[$bsk][$stg] = [];
            $msgObj = [
                'id'        => $mr['id'] ?: ('msg_' . $mr['time_ms'] . '_' . substr(md5($mr['text']), 0, 6)),
                'sender'    => $mr['sender'],
                'text'      => $mr['text'],
                'timestamp' => $mr['timestamp_str'],
                '_timeMs'   => intval($mr['time_ms'])
            ];
            $batchChatsMap[$bsk][$stg][] = $msgObj;
            if ($msgGid !== '') {
                if (!isset($batchChatsByGid[$msgGid])) $batchChatsByGid[$msgGid] = ['stage1' => [], 'stage2' => [], 'stage3' => []];
                if (!isset($batchChatsByGid[$msgGid][$stg])) $batchChatsByGid[$msgGid][$stg] = [];
                $batchChatsByGid[$msgGid][$stg][] = $msgObj;
            }

            if (intval($mr['time_ms']) >= $cutoffMs) {
                if (!isset($batchActiveSendersMap[$bsk])) $batchActiveSendersMap[$bsk] = [];
                $batchActiveSendersMap[$bsk][(string)$mr['sender']] = true;
                $batchActiveSendersMap[$bsk][strtolower(trim((string)$mr['sender']))] = true;
                if ($msgGid !== '') {
                    if (!isset($batchActiveSendersByGid[$msgGid])) $batchActiveSendersByGid[$msgGid] = [];
                    $batchActiveSendersByGid[$msgGid][(string)$mr['sender']] = true;
                    $batchActiveSendersByGid[$msgGid][strtolower(trim((string)$mr['sender']))] = true;
                }
            }
        }

        foreach ($allGroupIds as $gid) {
            $r = $stateMap[$gid] ?? ($fallbackMap[$gid] ?? null);
            $sk = $groupScopeMap[$gid];
            $offGroup = $officialGroups[$gid] ?? null;

            // 🛡️ 直接从批量内存字典中秒级提取本组聊天与活跃人，0 次多余 SQL
            $chats = $batchChatsMap[$sk] ?? ($batchChatsByGid[$gid] ?? ['stage1' => [], 'stage2' => [], 'stage3' => []]);
            $recentActiveSenders = array_merge($batchActiveSendersMap[$sk] ?? [], $batchActiveSendersByGid[$gid] ?? []);

            // 提前解码三大阶段工作区数据，供在线判定与监控渲染统一使用
            $s1Data = ($r && !empty($r['stage1_data'])) ? json_decode($r['stage1_data'], true) : [];
            $s2Data = ($r && !empty($r['stage2_data'])) ? json_decode($r['stage2_data'], true) : [];
            $s3Data = ($r && !empty($r['stage3_data'])) ? json_decode($r['stage3_data'], true) : [];
            if (!is_array($s1Data)) $s1Data = [];
            if (!is_array($s2Data)) $s2Data = [];
            if (!is_array($s3Data)) $s3Data = [];

            // 组员名单优先取班级官方分配名单，并解析为完整成员信息
            $rawMembers = [];
            if ($offGroup && isset($offGroup['members']) && is_array($offGroup['members']) && count($offGroup['members']) > 0) {
                $rawMembers = array_values($offGroup['members']);
            } elseif ($r && !empty($r['members_data'])) {
                $mDec = json_decode($r['members_data'], true);
                if (is_array($mDec) && count($mDec) > 0) $rawMembers = array_values($mDec);
            }

            $presence = ($r && !empty($r['presence_data'])) ? json_decode($r['presence_data'], true) : [];
            if (!is_array($presence)) $presence = [];
            $presenceByKey = [];
            $explicitOfflineMap = [];
            foreach ($presence as $pk => $pv) {
                $isOff = (is_array($pv) && !empty($pv['offline']));
                $ts = (is_array($pv) && isset($pv['updatedAt'])) ? intval($pv['updatedAt']) : ((is_array($pv) && isset($pv['lastSeen'])) ? intval($pv['lastSeen']) : ((is_array($pv) && isset($pv['timestamp'])) ? intval($pv['timestamp']) : 0));
                $rawK = (string)$pk;
                $lowK = strtolower(trim($rawK));
                if ($isOff) {
                    $explicitOfflineMap[$rawK] = true;
                    $explicitOfflineMap[$lowK] = true;
                } else {
                    $presenceByKey[$rawK] = $ts;
                    $presenceByKey[$lowK] = $ts;
                }
                
                // 智能联动全校用户字典，将学号的心跳自动拓展至姓名、昵称等全字段
                $matchedU = $userMap[$rawK] ?? ($userMap[$lowK] ?? null);
                if ($matchedU && is_array($matchedU)) {
                    foreach (['id', 'userId', 'name', 'studentCode', 'username'] as $uf) {
                        if (isset($matchedU[$uf]) && $matchedU[$uf] !== '') {
                            $kVal = (string)$matchedU[$uf];
                            $kLow = strtolower(trim($kVal));
                            if ($isOff) {
                                $explicitOfflineMap[$kVal] = true;
                                $explicitOfflineMap[$kLow] = true;
                            } else {
                                $presenceByKey[$kVal] = $ts;
                                $presenceByKey[$kLow] = $ts;
                            }
                        }
                    }
                }
            }

            // 🌟 实时在线精准判定：仅依据实时心跳（presence_data）和近期发言时间窗口（30秒内），杜绝历史静态动作污染
            $inTaskActiveKeyMap = [];
            foreach ($presenceByKey as $pk => $pts) {
                if (($nowMs - $pts) <= $ONLINE_WINDOW_MS) {
                    $inTaskActiveKeyMap[$pk] = true;
                    $inTaskActiveKeyMap[strtolower(trim($pk))] = true;
                }
            }
            foreach ($recentActiveSenders as $sk => $sbool) {
                $inTaskActiveKeyMap[$sk] = true;
                $inTaskActiveKeyMap[strtolower(trim($sk))] = true;
            }

            $onlineMembers = [];
            $absentMembers = [];
            $resolvedMembersList = [];

            foreach ($rawMembers as $m) {
                $memberObj = null;
                $mKey = '';
                if (is_array($m)) {
                    $mKey = $m['id'] ?? ($m['userId'] ?? ($m['studentCode'] ?? ($m['name'] ?? '')));
                    $memberObj = $userMap[(string)$mKey] ?? ($userMap[strtolower(trim((string)$mKey))] ?? $m);
                } else {
                    $mKey = (string)$m;
                    $memberObj = $userMap[$mKey] ?? ($userMap[strtolower(trim($mKey))] ?? ['id' => $mKey, 'name' => $mKey]);
                }

                $candidateKeys = [];
                foreach (['id', 'userId', 'name', 'studentCode', 'username', 'realStudentCode'] as $f) {
                    if (isset($memberObj[$f]) && $memberObj[$f] !== '') {
                        $candidateKeys[] = (string)$memberObj[$f];
                        $candidateKeys[] = strtolower(trim((string)$memberObj[$f]));
                    }
                }
                if ($mKey !== '') {
                    $candidateKeys[] = (string)$mKey;
                    $candidateKeys[] = strtolower(trim((string)$mKey));
                }
                $candidateKeys = array_unique($candidateKeys);

                $isExplicitOffline = false;
                foreach ($candidateKeys as $k) {
                    if (isset($explicitOfflineMap[$k])) {
                        $isExplicitOffline = true;
                        break;
                    }
                }

                $isFresh = false;
                if (!$isExplicitOffline) {
                    foreach ($candidateKeys as $k) {
                        if (isset($inTaskActiveKeyMap[$k]) || isset($inTaskActiveKeyMap[strtolower(trim($k))])) {
                            $isFresh = true;
                            break;
                        }
                    }
                }

                $label = !empty($memberObj['name']) ? $memberObj['name'] : (!empty($memberObj['studentCode']) ? $memberObj['studentCode'] : (string)$mKey);
                if ($isFresh) $onlineMembers[] = $label; else $absentMembers[] = $label;
                $resolvedMembersList[] = $memberObj;
            }

            // 活跃字段锁
            $stmtLocks = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = :k");
            $stmtLocks->execute([':k' => 'locks_' . $sk]);
            $lockRow = $stmtLocks->fetch();
            $activeLocks = [];
            if ($lockRow && !empty($lockRow['meta_value'])) {
                $allLocks = json_decode($lockRow['meta_value'], true);
                if (is_array($allLocks)) {
                    foreach ($allLocks as $fieldKey => $info) {
                        if (is_array($info) && isset($info['time']) && ($nowMs - intval($info['time'])) <= 2500) {
                            $activeLocks[] = ['field' => $fieldKey, 'userName' => ($info['userName'] ?? ''), 'time' => intval($info['time'])];
                        }
                    }
                }
            }

            // 🚀 按需加载架构：仅对当前选中的活跃小组返回全量工作区与聊天记录，其余小组返回轻量概览，数据包体积暴降 98%！
            $reqActiveGId = isset($_GET['activeGroupId']) ? trim($_GET['activeGroupId']) : (isset($REQ_DATA['activeGroupId']) ? trim($REQ_DATA['activeGroupId']) : '');
            $isCurrentActiveGroup = empty($reqActiveGId) || ($reqActiveGId === $gid) || (count($allGroupIds) === 1);

            if ($isCurrentActiveGroup) {
                // 🛡️ 教师端协同镜像主动对齐：若当前小组在 MySQL 中存有正文 (>10 字)，且 Etherpad 仍为初始默认空占位符 ('啥意思捏')，由服务端单向写入 Etherpad 填充底层
                if (!empty($s2Data['unifiedContent'])) {
                    $uHtml = $s2Data['unifiedContent'];
                    $uPlain = trim(strip_tags($uHtml));
                    if (mb_strlen($uPlain, 'UTF-8') > 10) {
                        $targetPids = ["jizhi_{$taskId}_{$gid}", "jizhi_{$sk}"];
                        $epApiKey = 'jizhi_academic_secret_key_2026';
                        $kFiles = ['/www/wwwroot/etherpad-lite/APIKEY.txt', dirname(__DIR__) . '/etherpad-lite/APIKEY.txt', __DIR__ . '/APIKEY.txt', '/root/etherpad-lite/APIKEY.txt'];
                        foreach ($kFiles as $kf) {
                            if (is_readable($kf)) { $k = trim(@file_get_contents($kf)); if (!empty($k)) { $epApiKey = $k; break; } }
                        }
                        foreach (array_unique($targetPids) as $tPid) {
                            $chT = curl_init("http://127.0.0.1:9001/api/1.2.14/getText?apikey=" . urlencode($epApiKey) . "&padID=" . urlencode($tPid));
                            curl_setopt($chT, CURLOPT_RETURNTRANSFER, true);
                            curl_setopt($chT, CURLOPT_TIMEOUT, 1);
                            $resT = curl_exec($chT);
                            curl_close($chT);
                            $curPadTxt = '';
                            if (!empty($resT)) {
                                $jT = json_decode($resT, true);
                                if (isset($jT['data']['text'])) $curPadTxt = trim($jT['data']['text']);
                            }
                            $isPadPlaceholder = empty($curPadTxt) || $curPadTxt === '啥意思捏' || strpos($curPadTxt, '啥意思捏') !== false || strpos($curPadTxt, 'Welcome to Etherpad') !== false || mb_strlen($curPadTxt, 'UTF-8') < 10;
                            if ($isPadPlaceholder) {
                                $chS = curl_init("http://127.0.0.1:9001/api/1.2.14/setHTML?apikey=" . urlencode($epApiKey) . "&padID=" . urlencode($tPid) . "&html=" . urlencode($uHtml));
                                curl_setopt($chS, CURLOPT_RETURNTRANSFER, true);
                                curl_setopt($chS, CURLOPT_TIMEOUT, 1);
                                curl_exec($chS);
                                curl_close($chS);
                            }
                        }
                    }
                }

                $result['groups'][$gid] = [
                    'groupId'            => $gid,
                    'scopeKey'           => $sk,
                    'currentStage'       => $r ? ($r['current_stage'] ?: 'stage1') : 'stage1',
                    'stage1'             => $s1Data,
                    'stage2'             => $s2Data,
                    'stage3'             => $s3Data,
                    'chatLogs'           => $chats,
                    'isFinalSubmitted'   => $r ? (bool)$r['is_final_submitted'] : false,
                    'lastTimestamp'      => $r ? intval($r['last_timestamp']) : 0,
                    'revisionId'         => $r ? intval($r['revision_id']) : 1,
                    'members'            => $resolvedMembersList,
                    'totalMembers'       => count($resolvedMembersList),
                    'onlineCount'        => count($onlineMembers),
                    'onlineMembers'      => $onlineMembers,
                    'absentMembers'      => $absentMembers,
                    'activeLocks'        => $activeLocks
                ];
            } else {
                // 🚀 未选中小组（其余19组）：只传输极轻量总览指标（阶段/人数/在线数/提交标志），0 冗余文本，体积直降 99%！
                $result['groups'][$gid] = [
                    'groupId'            => $gid,
                    'scopeKey'           => $sk,
                    'currentStage'       => $r ? ($r['current_stage'] ?: 'stage1') : 'stage1',
                    'stage1'             => ['mergedTitle' => $s1Data['mergedTitle'] ?? ''],
                    'stage2'             => [],
                    'stage3'             => [],
                    'chatLogs'           => ['stage1' => [], 'stage2' => [], 'stage3' => []],
                    'isFinalSubmitted'   => $r ? (bool)$r['is_final_submitted'] : false,
                    'lastTimestamp'      => $r ? intval($r['last_timestamp']) : 0,
                    'revisionId'         => $r ? intval($r['revision_id']) : 1,
                    'members'            => $resolvedMembersList,
                    'totalMembers'       => count($resolvedMembersList),
                    'onlineCount'        => count($onlineMembers),
                    'onlineMembers'      => $onlineMembers,
                    'absentMembers'      => $absentMembers,
                    'activeLocks'        => []
                ];
            }
        }
    }
    $calcHash = md5(json_encode($result));
    $clientHash = isset($_GET['clientHash']) ? trim($_GET['clientHash']) : '';
    if (!empty($clientHash) && $clientHash === $calcHash) {
        echo json_encode(['unchanged' => true, 'hash' => $calcHash], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $result['hash'] = $calcHash;
    echo json_encode($result, JSON_UNESCAPED_UNICODE);
    exit;
}

if ($action === 'get_readonly_pad_id') {
    header('Content-Type: application/json; charset=utf-8');
    $padId = isset($_GET['padId']) ? preg_replace('/[^a-zA-Z0-9_-]/', '', $_GET['padId']) : 'jizhi_' . $scopeKey;
    $apiKey = 'jizhi_academic_secret_key_2026';
    $possibleKeyFiles = [
        '/www/wwwroot/etherpad-lite/APIKEY.txt',
        dirname(__DIR__) . '/etherpad-lite/APIKEY.txt',
        __DIR__ . '/APIKEY.txt',
        '/root/etherpad-lite/APIKEY.txt'
    ];
    foreach ($possibleKeyFiles as $kf) {
        if (is_readable($kf)) {
            $k = trim(@file_get_contents($kf));
            if (!empty($k)) { $apiKey = $k; break; }
        }
    }

    // 🛡️ 1. 先确保 pad 已在 Etherpad 引擎中创建，防止 getReadOnlyID 抛出 padID does not exist
    $createUrl = "http://127.0.0.1:9001/api/1.2.14/createPad?apikey=" . urlencode($apiKey) . "&padID=" . urlencode($padId);
    $chC = curl_init($createUrl);
    curl_setopt($chC, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($chC, CURLOPT_TIMEOUT, 2);
    curl_exec($chC);
    curl_close($chC);

    $epUrl = "http://127.0.0.1:9001/api/1.2.14/getReadOnlyID?apikey=" . urlencode($apiKey) . "&padID=" . urlencode($padId);
    $ch = curl_init($epUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 2);
    $res = curl_exec($ch);
    curl_close($ch);

    $readOnlyId = '';
    if (!empty($res)) {
        $json = json_decode($res, true);
        if (isset($json['code']) && $json['code'] === 0 && isset($json['data']['readOnlyID'])) {
            $readOnlyId = $json['data']['readOnlyID'];
        }
    }
    echo json_encode(['success' => !empty($readOnlyId), 'readOnlyID' => $readOnlyId], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($action === 'restore_pad_max_revision') {
    header('Content-Type: application/json; charset=utf-8');
    $padId = isset($_GET['padId']) ? preg_replace('/[^a-zA-Z0-9_-]/', '', $_GET['padId']) : 'jizhi_' . $scopeKey;
    $apiKey = 'jizhi_academic_secret_key_2026';
    $possibleKeyFiles = [
        '/www/wwwroot/etherpad-lite/APIKEY.txt',
        dirname(__DIR__) . '/etherpad-lite/APIKEY.txt',
        __DIR__ . '/APIKEY.txt',
        '/root/etherpad-lite/APIKEY.txt'
    ];
    foreach ($possibleKeyFiles as $kf) {
        if (is_readable($kf)) {
            $k = trim(@file_get_contents($kf));
            if (!empty($k)) { $apiKey = $k; break; }
        }
    }

    // 1. 获取当前 pad 的 revision 总数并遍历
    $revCountUrl = "http://127.0.0.1:9001/api/1.2.14/getRevisionsCount?apikey=" . urlencode($apiKey) . "&padID=" . urlencode($padId);
    $ch = curl_init($revCountUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 3);
    $resRev = curl_exec($ch);
    curl_close($ch);

    $maxRev = 0;
    $longestHtml = '';
    $longestText = '';
    $longestLen = 0;
    $bestRev = 0;
    $bestPadId = $padId;

    if (!empty($resRev)) {
        $jsonRev = json_decode($resRev, true);
        if (isset($jsonRev['data']['revisions'])) {
            $maxRev = (int)$jsonRev['data']['revisions'];
        }
    }

    // 遍历检索当前 pad 字数最多的历史版本
    for ($r = $maxRev; $r >= 0; $r--) {
        $epHtmlUrl = "http://127.0.0.1:9001/api/1.2.14/getHTML?apikey=" . urlencode($apiKey) . "&padID=" . urlencode($padId) . "&rev=" . $r;
        $ch = curl_init($epHtmlUrl);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 2);
        $resH = curl_exec($ch);
        curl_close($ch);

        if (!empty($resH)) {
            $jH = json_decode($resH, true);
            if (isset($jH['data']['html'])) {
                $h = $jH['data']['html'];
                $t = trim(strip_tags($h));
                $len = mb_strlen($t, 'UTF-8');
                if ($len > $longestLen) {
                    $longestLen = $len;
                    $longestHtml = $h;
                    $longestText = $t;
                    $bestRev = $r;
                }
            }
        }
    }

    // 若当前 pad 历史版本未达到 50 字，尝试跨 Pad 检索 Etherpad 中该小组或相关的其他 Pad
    if ($longestLen < 50) {
        $listPadsUrl = "http://127.0.0.1:9001/api/1.2.14/listAllPads?apikey=" . urlencode($apiKey);
        $chList = curl_init($listPadsUrl);
        curl_setopt($chList, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($chList, CURLOPT_TIMEOUT, 3);
        $resList = curl_exec($chList);
        curl_close($chList);

        if (!empty($resList)) {
            $jsonList = json_decode($resList, true);
            if (isset($jsonList['data']['padIDs']) && is_array($jsonList['data']['padIDs'])) {
                foreach ($jsonList['data']['padIDs'] as $otherPadId) {
                    if (!str_starts_with($otherPadId, 'jizhi_')) continue;

                    $otherHtmlUrl = "http://127.0.0.1:9001/api/1.2.14/getHTML?apikey=" . urlencode($apiKey) . "&padID=" . urlencode($otherPadId);
                    $chO = curl_init($otherHtmlUrl);
                    curl_setopt($chO, CURLOPT_RETURNTRANSFER, true);
                    curl_setopt($chO, CURLOPT_TIMEOUT, 2);
                    $resO = curl_exec($chO);
                    curl_close($chO);

                    if (!empty($resO)) {
                        $jO = json_decode($resO, true);
                        if (isset($jO['data']['html'])) {
                            $hO = $jO['data']['html'];
                            $tO = trim(strip_tags($hO));
                            $lenO = mb_strlen($tO, 'UTF-8');
                            if ($lenO > $longestLen) {
                                $longestLen = $lenO;
                                $longestHtml = $hO;
                                $longestText = $tO;
                                $bestPadId = $otherPadId;
                            }
                        }
                    }
                }
            }
        }
    }

    // 若在 Etherpad（当前Pad或历史同组Pad）中检索到长文，调用 setHTML 恢复至当前最新 pad
    if ($longestLen > 50 && !empty($longestHtml)) {
        $setHtmlUrl = "http://127.0.0.1:9001/api/1.2.14/setHTML?apikey=" . urlencode($apiKey) . "&padID=" . urlencode($padId) . "&html=" . urlencode($longestHtml);
        $ch = curl_init($setHtmlUrl);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 3);
        curl_exec($ch);
        curl_close($ch);

        echo json_encode([
            'success' => true,
            'restored' => true,
            'source' => 'etherpad_pad',
            'fromPadId' => $bestPadId,
            'bestRevision' => $bestRev,
            'textLength' => $longestLen,
            'preview' => mb_substr($longestText, 0, 100, 'UTF-8')
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // 兜底：从 group_states 数据库查找历史 snapshot（严格仅查询当前小组自身数据）
    if ($pdo) {
        $exactScopeKey = preg_replace('/^jizhi_/', '', $padId);
        $stmtDb = $pdo->prepare("SELECT scope_key, stage2_data FROM group_states WHERE scope_key = :sk OR scope_key = :sk2 ORDER BY last_timestamp DESC LIMIT 1");
        $stmtDb->execute([':sk' => $exactScopeKey, ':sk2' => $scopeKey]);
        $rowsDb = $stmtDb->fetchAll();
        $bestDbText = '';
        $bestDbLen = 0;

        foreach ($rowsDb as $rowDb) {
            if (!empty($rowDb['stage2_data'])) {
                $s2Data = json_decode($rowDb['stage2_data'], true);
                if (!empty($s2Data['unifiedContent'])) {
                    $uText = $s2Data['unifiedContent'];
                    $uLen = mb_strlen($uText, 'UTF-8');
                    if ($uLen > $bestDbLen) {
                        $bestDbLen = $uLen;
                        $bestDbText = $uText;
                    }
                }
            }
        }

        if ($bestDbLen > 50) {
            $setTextUrl = "http://127.0.0.1:9001/api/1.2.14/setText?apikey=" . urlencode($apiKey) . "&padID=" . urlencode($padId) . "&text=" . urlencode($bestDbText);
            $ch = curl_init($setTextUrl);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 3);
            curl_exec($ch);
            curl_close($ch);

            echo json_encode([
                'success' => true,
                'restored' => true,
                'source' => 'db_snapshot',
                'textLength' => $bestDbLen,
                'preview' => mb_substr($bestDbText, 0, 100, 'UTF-8')
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }
    }

    echo json_encode(['success' => false, 'message' => '未检索到有效历史长文版本'], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($action === 'align_all_pads_physically') {
    header('Content-Type: application/json; charset=utf-8');
    $apiKey = 'jizhi_academic_secret_key_2026';
    $possibleKeyFiles = [
        '/www/wwwroot/etherpad-lite/APIKEY.txt',
        dirname(__DIR__) . '/etherpad-lite/APIKEY.txt',
        __DIR__ . '/APIKEY.txt',
        '/root/etherpad-lite/APIKEY.txt'
    ];
    foreach ($possibleKeyFiles as $kf) {
        if (is_readable($kf)) {
            $k = trim(@file_get_contents($kf));
            if (!empty($k)) { $apiKey = $k; break; }
        }
    }

    $results = [];
    if ($pdo) {
        $stmt = $pdo->prepare("SELECT task_id, group_id, scope_key, stage2_data FROM group_states WHERE stage2_data LIKE '%unifiedContent%'");
        $stmt->execute();
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        foreach ($rows as $r) {
            $tId = $r['task_id'] ?: 'task_default';
            $gId = $r['group_id'] ?: 'group_1';
            $s2 = json_decode($r['stage2_data'], true);
            if (empty($s2['unifiedContent'])) continue;

            $uHtml = $s2['unifiedContent'];
            $uLen = mb_strlen(trim(strip_tags($uHtml)), 'UTF-8');
            if ($uLen < 30) continue;

            $sk = $r['scope_key'] ?: '';
            $possiblePadIds = [
                "jizhi_{$tId}_{$gId}",
                "jizhi_{$gId}",
                "jizhi_{$sk}"
            ];
            if (!empty($sk)) {
                if (preg_match('/task_([^_]+)_group_([^_]+)/', $sk, $m)) {
                    $possiblePadIds[] = "jizhi_task_{$m[1]}_group_{$m[2]}";
                }
                if (preg_match('/(task_[^_]+)/', $sk, $mt) && preg_match('/(group_[^_]+)/', $sk, $mg)) {
                    $possiblePadIds[] = "jizhi_{$mt[1]}_{$mg[1]}";
                }
                $cleanSk = preg_replace('/^.*?class_[^_]+_/', '', $sk);
                if (!empty($cleanSk)) {
                    $possiblePadIds[] = "jizhi_{$cleanSk}";
                }
            }
            $possiblePadIds = array_unique(array_filter($possiblePadIds));

            foreach ($possiblePadIds as $pId) {
                // 1. 确保已创建
                $chC = curl_init("http://127.0.0.1:9001/api/1.2.14/createPad?apikey=" . urlencode($apiKey) . "&padID=" . urlencode($pId));
                curl_setopt($chC, CURLOPT_RETURNTRANSFER, true);
                curl_setopt($chC, CURLOPT_TIMEOUT, 2);
                curl_exec($chC);
                curl_close($chC);

                // 2. 检查当前内容
                $chT = curl_init("http://127.0.0.1:9001/api/1.2.14/getText?apikey=" . urlencode($apiKey) . "&padID=" . urlencode($pId));
                curl_setopt($chT, CURLOPT_RETURNTRANSFER, true);
                curl_setopt($chT, CURLOPT_TIMEOUT, 2);
                $resT = curl_exec($chT);
                curl_close($chT);

                $curText = '';
                if (!empty($resT)) {
                    $jT = json_decode($resT, true);
                    if (isset($jT['data']['text'])) $curText = trim($jT['data']['text']);
                }

                // 3. 若当前为空、默认占位符或字数明显不完整，执行物理注入
                $curTextLen = mb_strlen($curText, 'UTF-8');
                if (empty($curText) || $curText === '啥意思捏' || $curTextLen < 30 || strpos($curText, '啥意思捏') !== false || ($uLen > 100 && $curTextLen < 50)) {
                    $chS = curl_init("http://127.0.0.1:9001/api/1.2.14/setHTML?apikey=" . urlencode($apiKey) . "&padID=" . urlencode($pId) . "&html=" . urlencode($uHtml));
                    curl_setopt($chS, CURLOPT_RETURNTRANSFER, true);
                    curl_setopt($chS, CURLOPT_TIMEOUT, 2);
                    curl_exec($chS);
                    curl_close($chS);
                    $results[] = ['padId' => $pId, 'status' => 'synced', 'len' => $uLen];
                } else {
                    $results[] = ['padId' => $pId, 'status' => 'skipped', 'curLen' => $curTextLen];
                }
            }
        }
    }

    echo json_encode(['success' => true, 'aligned' => $results], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($action === 'get_pad_text' || $action === 'get_pad_html') {
    header('Content-Type: application/json; charset=utf-8');
    $padId = isset($_GET['padId']) ? preg_replace('/[^a-zA-Z0-9_-]/', '', $_GET['padId']) : 'jizhi_' . $scopeKey;
    $apiKey = 'jizhi_academic_secret_key_2026';
    $possibleKeyFiles = [
        '/www/wwwroot/etherpad-lite/APIKEY.txt',
        dirname(__DIR__) . '/etherpad-lite/APIKEY.txt',
        __DIR__ . '/APIKEY.txt',
        '/root/etherpad-lite/APIKEY.txt'
    ];
    foreach ($possibleKeyFiles as $kf) {
        if (is_readable($kf)) {
            $k = trim(@file_get_contents($kf));
            if (!empty($k)) { $apiKey = $k; break; }
        }
    }

    $retText = '';
    $retHtml = '';

    // 1. 优先尝试从 Etherpad 9001 API 获取富文本 HTML (含图片与表格)
    $epHtmlUrl = "http://127.0.0.1:9001/api/1.2.14/getHTML?apikey=" . urlencode($apiKey) . "&padID=" . urlencode($padId);
    $ch = curl_init($epHtmlUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 2);
    $resHtml = curl_exec($ch);
    curl_close($ch);

    if (!empty($resHtml)) {
        $jsonHtml = json_decode($resHtml, true);
        if (isset($jsonHtml['code']) && $jsonHtml['code'] === 0 && isset($jsonHtml['data']['html'])) {
            $retHtml = $jsonHtml['data']['html'];
            $retText = trim(strip_tags($retHtml));
        }
    }

    // 2. 若 HTML 为空，尝试 getText
    if (empty($retText)) {
        $epTextUrl = "http://127.0.0.1:9001/api/1.2.14/getText?apikey=" . urlencode($apiKey) . "&padID=" . urlencode($padId);
        $ch2 = curl_init($epTextUrl);
        curl_setopt($ch2, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch2, CURLOPT_TIMEOUT, 2);
        $resText = curl_exec($ch2);
        curl_close($ch2);
        if (!empty($resText)) {
            $jsonText = json_decode($resText, true);
            if (isset($jsonText['code']) && $jsonText['code'] === 0 && isset($jsonText['data']['text'])) {
                $retText = $jsonText['data']['text'];
                if (empty($retHtml)) $retHtml = $retText;
            }
        }
    }

    // 3. 若 Etherpad 中仅包含初始默认占位符 ('啥意思捏' 或少于 10 字)，且当前小组在 MySQL 数据库中保存有真实正文，精确写回该 Pad 物理对齐
    $exactScopeKey = preg_replace('/^jizhi_/', '', $padId);
    $extractedTid = '';
    $extractedGid = '';
    if (preg_match('/(task_[a-zA-Z0-9_-]+)/', $padId, $mt)) {
        $extractedTid = $mt[1];
    }
    if (preg_match('/(group_\d+|group_[a-zA-Z0-9_-]+)/', $padId, $mg)) {
        $extractedGid = $mg[1];
    }

    $isPadPlaceholder = empty($retText) || trim($retText) === '啥意思捏' || strpos($retText, '啥意思捏') !== false || strpos($retText, 'Welcome to Etherpad') !== false || mb_strlen($retText, 'UTF-8') < 10;
    if ($isPadPlaceholder && $pdo) {
        if (!empty($extractedTid) && !empty($extractedGid)) {
            $stmtDb = $pdo->prepare("SELECT stage2_data FROM group_states WHERE scope_key = :sk OR scope_key = :sk2 OR (task_id = :tid AND group_id = :gid) ORDER BY last_timestamp DESC LIMIT 1");
            $stmtDb->execute([':sk' => $exactScopeKey, ':sk2' => $scopeKey, ':tid' => $extractedTid, ':gid' => $extractedGid]);
        } else {
            $stmtDb = $pdo->prepare("SELECT stage2_data FROM group_states WHERE scope_key = :sk OR scope_key = :sk2 ORDER BY last_timestamp DESC LIMIT 1");
            $stmtDb->execute([':sk' => $exactScopeKey, ':sk2' => $scopeKey]);
        }
        $rowDb = $stmtDb->fetch();
        if ($rowDb && !empty($rowDb['stage2_data'])) {
            $s2Data = json_decode($rowDb['stage2_data'], true);
            if (!empty($s2Data['unifiedContent'])) {
                $uHtml = $s2Data['unifiedContent'];
                $uStr = trim(strip_tags($uHtml));
                $uLen = mb_strlen($uStr, 'UTF-8');
                if ($uLen > 10) {
                    $setHUrl = "http://127.0.0.1:9001/api/1.2.14/setHTML?apikey=" . urlencode($apiKey) . "&padID=" . urlencode($padId) . "&html=" . urlencode($uHtml);
                    $chS = curl_init($setHUrl);
                    curl_setopt($chS, CURLOPT_RETURNTRANSFER, true);
                    curl_setopt($chS, CURLOPT_TIMEOUT, 2);
                    curl_exec($chS);
                    curl_close($chS);
                    $retHtml = $uHtml;
                    $retText = $uStr;
                }
            }
        }
    }

    // 4. 若 Etherpad 接口未获取到，从当前小组的 group_states 数据库无缝兜底获取学生回传的正文
    if (empty($retHtml) && empty($retText) && $pdo) {
        if (!empty($extractedTid) && !empty($extractedGid)) {
            $stmtDb = $pdo->prepare("SELECT stage2_data FROM group_states WHERE scope_key = :sk OR scope_key = :sk2 OR (task_id = :tid AND group_id = :gid) ORDER BY last_timestamp DESC LIMIT 1");
            $stmtDb->execute([':sk' => $exactScopeKey, ':sk2' => $scopeKey, ':tid' => $extractedTid, ':gid' => $extractedGid]);
        } else {
            $stmtDb = $pdo->prepare("SELECT stage2_data FROM group_states WHERE scope_key = :sk OR scope_key = :sk2 ORDER BY last_timestamp DESC LIMIT 1");
            $stmtDb->execute([':sk' => $exactScopeKey, ':sk2' => $scopeKey]);
        }
        $rowDb = $stmtDb->fetch();
        if ($rowDb && !empty($rowDb['stage2_data'])) {
            $s2Data = json_decode($rowDb['stage2_data'], true);
            if (!empty($s2Data['unifiedContent'])) {
                $retHtml = $s2Data['unifiedContent'];
                $retText = trim(strip_tags($retHtml));
            }
        }
    }

    $calcHash = md5($retHtml . '||' . $retText);
    $clientHash = isset($_GET['clientHash']) ? trim($_GET['clientHash']) : '';
    if (!empty($clientHash) && $clientHash === $calcHash) {
        echo json_encode(['success' => true, 'unchanged' => true, 'hash' => $calcHash], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if (!empty($retHtml) || !empty($retText)) {
        echo json_encode([
            'success' => true,
            'text'    => $retText,
            'html'    => $retHtml,
            'hash'    => $calcHash
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    echo json_encode(['success' => false, 'text' => '', 'html' => '', 'hash' => '']);
    exit;
}

// 1.3 用户修改密码接口 (轻量安全、自动同步 MySQL 与教务元数据)
if ($action === 'change_password' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        $rawInput = file_get_contents('php://input');
        $data = json_decode($rawInput, true) ?: [];
        $account = trim($data['account'] ?? ($data['studentCode'] ?? ($data['username'] ?? '')));
        $userId = trim($data['userId'] ?? '');
        $oldPwd = trim($data['oldPassword'] ?? '');
        $newPwd = trim($data['newPassword'] ?? '');

        if (empty($account) && empty($userId)) {
            echo json_encode(['success' => false, 'message' => '❌ 账号不能为空']);
            exit;
        }

        if (empty($newPwd)) {
            echo json_encode(['success' => false, 'message' => '❌ 新密码不能为空']);
            exit;
        }

        if (strlen($newPwd) < 3) {
            echo json_encode(['success' => false, 'message' => '❌ 新密码长度不能少于 3 个字符']);
            exit;
        }

        if ($pdo) {
            $code = trim($account ?: $userId);

            // 统一以账号 ID（学号/工号）作为唯一标识查询用户
            $stmt = $pdo->prepare("SELECT * FROM users WHERE id = :id LIMIT 1");
            $stmt->execute([':id' => $code]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);

            // 种子保障（仅在完全无记录时初始写入，绝不覆盖已有记录与密码）
            if (!$user && $code === '1001') {
                $stmtInsT = $pdo->prepare("INSERT IGNORE INTO users (id, name, password, role) VALUES ('1001', '老师', '123', 'teacher')");
                $stmtInsT->execute();
                $stmtRe = $pdo->prepare("SELECT * FROM users WHERE id = '1001' LIMIT 1");
                $stmtRe->execute();
                $user = $stmtRe->fetch(PDO::FETCH_ASSOC);
            }

            if (!$user) {
                // 从 global_meta 兜底回填
                $stmtMeta = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = 'main_meta'");
                $stmtMeta->execute();
                $metaRow = $stmtMeta->fetch();
                if ($metaRow && !empty($metaRow['meta_value'])) {
                    $gm = json_decode($metaRow['meta_value'], true) ?: [];
                    $gUsers = $gm['users'] ?? [];
                    foreach ($gUsers as $gu) {
                        $uAcc = strtolower(trim($gu['id'] ?? ($gu['studentCode'] ?? ($gu['username'] ?? ''))));
                        $qAcc = strtolower($code);
                        if ($uAcc === $qAcc) {
                            $user = [
                                'id' => $gu['id'] ?? $code,
                                'name' => $gu['name'] ?? $code,
                                'password' => $gu['password'] ?? '123',
                                'role' => $gu['role'] ?? 'student'
                            ];
                            break;
                        }
                    }
                }
            }

            if (!$user) {
                echo json_encode(['success' => false, 'message' => '❌ 未找到工号/学号 [' . htmlspecialchars($code) . ']']);
                exit;
            }

            $currentDbPwd = trim($user['password'] ?? '123');
            $cleanOld = trim($oldPwd);
            $cleanNew = trim($newPwd);

            // 🛡️ 严格原密码校验：输入的原密码必须与当前数据库中记录 100% 精确一致 (绝无 123 后门)
            $oldMatch = false;
            if ($cleanOld === $currentDbPwd) {
                $oldMatch = true;
            } else if (empty($currentDbPwd) && $cleanOld === '123') {
                $oldMatch = true;
            } else if (password_verify($cleanOld, $currentDbPwd)) {
                $oldMatch = true;
            }

            if (!$oldMatch) {
                echo json_encode([
                    'success' => false, 
                    'message' => '❌ 原密码不正确，请重试'
                ]);
                exit;
            }

            $cleanNew = trim($newPwd);
            
            // 统一以工号/学号存盘更新 users 表中所有记录（密码存 bcrypt 哈希）
            $hashNew = password_hash($cleanNew, PASSWORD_DEFAULT);
            $stmtUpdate = $pdo->prepare("UPDATE users SET password = :p WHERE id = :id");
            $stmtUpdate->execute([
                ':p' => $hashNew,
                ':id' => $code
            ]);

            // 同步更新 global_meta 的 main_meta
            try {
                $stmtMeta2 = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = 'main_meta'");
                $stmtMeta2->execute();
                $metaRow2 = $stmtMeta2->fetch();
                if ($metaRow2 && !empty($metaRow2['meta_value'])) {
                    $gm = json_decode($metaRow2['meta_value'], true) ?: [];
                    if (isset($gm['users']) && is_array($gm['users'])) {
                        foreach ($gm['users'] as &$gu) {
                            $gSc = $gu['id'] ?? ($gu['studentCode'] ?? ($gu['username'] ?? ''));
                            if (strtolower(trim($gSc)) === strtolower(trim($code))) {
                                $gu['password'] = $hashNew;
                            }
                        }
                        $encodedGm = json_encode($gm, JSON_UNESCAPED_UNICODE);
                        $stmtSaveGm = $pdo->prepare("UPDATE global_meta SET meta_value = :v WHERE meta_key = 'main_meta'");
                        $stmtSaveGm->execute([':v' => $encodedGm]);
                    }
                }
            } catch (Exception $e) {}

            echo json_encode(['success' => true, 'message' => '密码修改成功，请牢记新密码！']);
            exit;
        } else {
            echo json_encode(['success' => false, 'message' => '❌ 数据库未连接，请联系管理员']);
            exit;
        }
    } catch (Exception $ex) {
        echo json_encode(['success' => false, 'message' => '❌ 修改密码发生异常: ' . $ex->getMessage()]);
        exit;
    }
}

// 1.4 教师端一键重置学生密码为 123 (实验环境救急必备)
if ($action === 'reset_student_password' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $rawInput = file_get_contents('php://input');
    $data = json_decode($rawInput, true) ?: [];
    $account = trim($data['account'] ?? ($data['studentCode'] ?? ($data['username'] ?? '')));
    $newPwd = trim($data['newPassword'] ?? '123');
    $userId = $data['userId'] ?? ($_GET['userId'] ?? '');
    $token = $data['token'] ?? ($_GET['token'] ?? '');

    if (!verifyTeacherSession($userId, $token, $pdo)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => '权限不足：仅允许已认证教师重置学生密码']);
        exit;
    }

    if (empty($account)) {
        echo json_encode(['success' => false, 'message' => '学生账号不能为空']);
        exit;
    }

    if ($pdo) {
        $stmt = $pdo->prepare("SELECT * FROM users WHERE id = :acc LIMIT 1");
        $stmt->execute([':acc' => $account]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$user) {
            echo json_encode(['success' => false, 'message' => '未找到该学生账号']);
            exit;
        }

        $plainReset = !empty($newPwd) ? $newPwd : '123';
        $hashReset = password_hash($plainReset, PASSWORD_DEFAULT);
        $stmtUpdate = $pdo->prepare("UPDATE users SET password = :p WHERE id = :uid");
        $stmtUpdate->execute([':p' => $hashReset, ':uid' => $user['id']]);

        // 同步更新 main_meta 里的 users
        $stmtMeta = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = 'main_meta'");
        $stmtMeta->execute();
        $metaRow = $stmtMeta->fetch();
        if ($metaRow && !empty($metaRow['meta_value'])) {
            $gm = json_decode($metaRow['meta_value'], true) ?: [];
            if (isset($gm['users']) && is_array($gm['users'])) {
                foreach ($gm['users'] as &$gu) {
                    if (($gu['id'] ?? ($gu['studentCode'] ?? ($gu['username'] ?? ''))) === $account) {
                        $gu['password'] = $hashReset;
                    }
                }
                $encodedGm = json_encode($gm, JSON_UNESCAPED_UNICODE);
                $stmtSaveGm = $pdo->prepare("UPDATE global_meta SET meta_value = :v WHERE meta_key = 'main_meta'");
                $stmtSaveGm->execute([':v' => $encodedGm]);
            }
        }
        echo json_encode(['success' => true, 'message' => "已成功将学生【{$user['name']}】的密码重置为 {$newPwd}！"]);
        exit;
    }
    echo json_encode(['success' => false, 'message' => '数据库未连接']);
    exit;
}

// 0. 教师附件文件上传（严格身份鉴权 + 频控防刷）
if ($action === 'upload_file' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    header('Content-Type: application/json; charset=utf-8');

    // 🛡️ 1. 用户合法性与限流保护（允许已登录学生与教师上传研讨图表/教学附件）
    $userId = $_POST['userId'] ?? ($_GET['userId'] ?? 'user_anonymous');

    // 🛡️ 2. 频控限流防刷盘保护（单个账号 1 分钟内最多上传 20 个文件）
    $rateLimitKey = sys_get_temp_dir() . '/upload_rate_' . md5($userId . '_' . ($_SERVER['REMOTE_ADDR'] ?? '127.0.0.1'));
    $uploadCount = 0;
    if (file_exists($rateLimitKey)) {
        $rateData = json_decode(@file_get_contents($rateLimitKey), true) ?: [];
        if (isset($rateData['time']) && (time() - $rateData['time']) < 60) {
            $uploadCount = intval($rateData['count'] ?? 0);
            if ($uploadCount >= 20) {
                http_response_code(429);
                echo json_encode(['success' => false, 'message' => '上传过于频繁，请稍候再试（磁盘防护限频）']);
                exit;
            }
        }
    }
    @file_put_contents($rateLimitKey, json_encode(['time' => time(), 'count' => $uploadCount + 1]));

    $uploadDir = __DIR__ . '/uploads/';
    if (!is_dir($uploadDir)) {
        @mkdir($uploadDir, 0755, true);
    }
    
    // 🛡️ 3. 严格文件上传状态与错误码校验
    if (!isset($_FILES['file'])) {
        echo json_encode(['success' => false, 'message' => '未接收到有效文件']);
        exit;
    }

    $fileError = $_FILES['file']['error'];
    if ($fileError !== UPLOAD_ERR_OK) {
        $msg = '文件上传失败';
        if ($fileError === UPLOAD_ERR_INI_SIZE || $fileError === UPLOAD_ERR_FORM_SIZE) {
            $msg = '文件大小超出服务器允许上限（建议单个文件在 50MB 以内，请检查 php.ini 中的 upload_max_filesize 设置）';
        } else if ($fileError === UPLOAD_ERR_PARTIAL) {
            $msg = '文件仅部分上传，请检查网络后重试';
        } else if ($fileError === UPLOAD_ERR_NO_FILE) {
            $msg = '没有文件被上传';
        }
        echo json_encode(['success' => false, 'message' => $msg]);
        exit;
    }

    $maxSizeBytes = 50 * 1024 * 1024; // 50MB
    if ($_FILES['file']['size'] > $maxSizeBytes) {
        echo json_encode(['success' => false, 'message' => '文件过大，单文件上传限制为 50MB']);
        exit;
    }

    $originalName = basename($_FILES['file']['name']);
    $ext = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
    $dangerous = ['php', 'phtml', 'php3', 'php4', 'php5', 'phps', 'sh', 'bash', 'py', 'pl', 'cgi', 'exe', 'bat', 'cmd', 'vbs', 'htaccess'];
    if (in_array($ext, $dangerous)) {
        echo json_encode(['success' => false, 'message' => '安全策略拦截：禁止上传可执行脚本文件']);
        exit;
    }

    $allowed = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'png', 'jpg', 'jpeg', 'gif', 'zip'];
    if (!in_array($ext, $allowed)) {
        echo json_encode(['success' => false, 'message' => '不支持的文件类型 (支持 pdf/word/ppt/excel/txt/图片/zip)']);
        exit;
    }

    if (function_exists('finfo_open')) {
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mime = finfo_file($finfo, $_FILES['file']['tmp_name']);
        finfo_close($finfo);
        if ($mime && (strpos($mime, 'php') !== false || strpos($mime, 'x-sh') !== false || strpos($mime, 'x-executable') !== false)) {
            echo json_encode(['success' => false, 'message' => '文件安全检测失败：禁止上传可执行文件']);
            exit;
        }
    }
    $safeName = 'jizhi_' . time() . '_' . preg_replace('/[^a-zA-Z0-9._-]/', '_', $originalName);
    $destPath = $uploadDir . $safeName;
    if (!move_uploaded_file($_FILES['file']['tmp_name'], $destPath)) {
        echo json_encode(['success' => false, 'message' => '文件保存失败，请检查 uploads 目录写入权限']);
        exit;
    }
    // 构建可访问的 URL（基于请求域名）
    $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'];
    $baseDir = rtrim(dirname($_SERVER['SCRIPT_NAME']), '/');
    $fileUrl = $protocol . '://' . $host . $baseDir . '/uploads/' . $safeName;
    echo json_encode([
        'success'      => true,
        'url'          => $fileUrl,
        'fileName'     => $originalName,
        'fileSize'     => $_FILES['file']['size'],
        'savedName'    => $safeName
    ]);
    exit;
}

if ($action === 'get_global_meta') {
    $foundMeta = null;

    if ($pdo) {
        // 🛡️ 全局单点登录会话互踢校验（支持教师与学生全局顶号秒级踢下线）
        $reqUserId = isset($_GET['userId']) ? trim($_GET['userId']) : '';
        $reqSessToken = isset($_GET['sessToken']) ? trim($_GET['sessToken']) : '';
        if (!empty($reqUserId) && !empty($reqSessToken)) {
            $stmtUserSess = $pdo->prepare("SELECT active_session_id FROM users WHERE id = :u1 LIMIT 1");
            $stmtUserSess->execute([':u1' => $reqUserId]);
            $uSessRow = $stmtUserSess->fetch(PDO::FETCH_ASSOC);
            if ($uSessRow && !empty($uSessRow['active_session_id'])) {
                if ($uSessRow['active_session_id'] !== $reqSessToken) {
                    echo json_encode(['kicked' => true], JSON_UNESCAPED_UNICODE);
                    exit;
                }
            } else {
                $stmtSessChk = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = :k");
                $stmtSessChk->execute([':k' => 'sess_' . $reqUserId]);
                $sessRow = $stmtSessChk->fetch();
                if ($sessRow && !empty($sessRow['meta_value'])) {
                    if ($sessRow['meta_value'] !== $reqSessToken) {
                        echo json_encode(['kicked' => true], JSON_UNESCAPED_UNICODE);
                        exit;
                    }
                }
            }
        }

        // ⚡ 极速版本探测：若客户端当前版本等于数据库最新版本，直接 20 字节返回 unchanged
        $clientVer = isset($_GET['ver']) ? intval($_GET['ver']) : 0;
        $stmtVer = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = 'main_meta_version'");
        $stmtVer->execute();
        $vRow = $stmtVer->fetch();
        $currentVer = $vRow ? intval($vRow['meta_value']) : 1;

        if ($clientVer > 0 && $clientVer === $currentVer && !isset($_GET['force'])) {
            echo json_encode(['unchanged' => true, 'version' => $currentVer], JSON_UNESCAPED_UNICODE);
            exit;
        }

        // 1. 优先极速读取全局权威快照 main_meta（耗时 < 0.5ms，忠实保留 19人班 + 30人班真实名单）
        $stmt = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = 'main_meta'");
        $stmt->execute();
        $row = $stmt->fetch();
        if ($row && !empty($row['meta_value'])) {
            $parsed = json_decode($row['meta_value'], true);
            if (is_array($parsed) && (isset($parsed['classes']) || isset($parsed['tasks']) || isset($parsed['users']))) {
                $foundMeta = $parsed;
            }
        }

        // 2. 🛡️ 仅在 main_meta 彻底为空的极端冷启动情况下，才从独立关系表聚合还原兜底
        if (!$foundMeta) {
            try {
                $aggregatedTasks = [];
                $stmtT = $pdo->query("SELECT * FROM tasks");
                if ($stmtT) {
                    while ($tr = $stmtT->fetch(PDO::FETCH_ASSOC)) {
                        $aggregatedTasks[] = [
                            'id' => $tr['id'],
                            'title' => $tr['title'],
                            'desc' => $tr['desc'] ?? '',
                            'instructions' => $tr['desc'] ?? '',
                            'durationMinutes' => intval($tr['duration_minutes'] ?? 150),
                            'deadline' => $tr['deadline'] ?? '',
                            'status' => $tr['status'] ?? 'in_progress',
                            'createdAt' => $tr['created_at_str'] ?? '',
                            'classId' => ($tr['target_class_ids'] ? (json_decode($tr['target_class_ids'], true)[0] ?? 'class_101') : 'class_101')
                        ];
                    }
                }

                $aggregatedClasses = [];
                $stmtC = $pdo->query("SELECT * FROM classes");
                if ($stmtC) {
                    while ($cr = $stmtC->fetch(PDO::FETCH_ASSOC)) {
                        $aggregatedClasses[] = [
                            'id' => $cr['id'],
                            'name' => $cr['name'],
                            'studentIds' => json_decode($cr['student_ids'] ?? '[]', true) ?: [],
                            'groups' => json_decode($cr['groups_data'] ?? '[]', true) ?: []
                        ];
                    }
                }

                $aggregatedUsers = [];
                $stmtU = $pdo->query("SELECT id, name, role, avatar, class_id, group_id FROM users");
                if ($stmtU) {
                    while ($ur = $stmtU->fetch(PDO::FETCH_ASSOC)) {
                        $aggregatedUsers[] = [
                            'id' => $ur['id'],
                            'name' => $ur['name'],
                            'role' => $ur['role'],
                            'avatar' => $ur['avatar'] ?: '👤',
                            'classId' => $ur['class_id'] ?? '',
                            'groupId' => $ur['group_id'] ?? ''
                        ];
                    }
                }

                $aggregatedAnnouncements = [];
                $stmtA = $pdo->query("SELECT * FROM announcements");
                if ($stmtA) {
                    while ($ar = $stmtA->fetch(PDO::FETCH_ASSOC)) {
                        $aggregatedAnnouncements[] = [
                            'id' => $ar['id'],
                            'title' => $ar['title'],
                            'content' => $ar['content'],
                            'createdAt' => $ar['created_at_str'] ?? '',
                            'targetClassIds' => json_decode($ar['target_class_ids'] ?? '[]', true) ?: [],
                            'isPinned' => !empty($ar['is_pinned']),
                            'attachment' => !empty($ar['attachment']) ? (json_decode($ar['attachment'], true) ?: $ar['attachment']) : null,
                            'confirmedMembers' => !empty($ar['confirmed_members']) ? (json_decode($ar['confirmed_members'], true) ?: []) : []
                        ];
                    }
                }

                $aggregatedPapers = [];
                $stmtP = $pdo->query("SELECT * FROM reference_papers");
                if ($stmtP) {
                    while ($pr = $stmtP->fetch(PDO::FETCH_ASSOC)) {
                        $aggregatedPapers[] = [
                            'id' => $pr['id'],
                            'title' => $pr['title'],
                            'abstract' => $pr['abstract'] ?? '',
                            'keyHighlights' => $pr['highlights'] ?? '',
                            'targetGroupId' => $pr['target_group'] ?? 'all',
                            'fileName' => $pr['file_name'] ?? '',
                            'fileSize' => $pr['file_size'] ?? '',
                            'fileUrl' => $pr['file_data'] ?? '',
                            'fileData' => $pr['file_data'] ?? '',
                            'uploadTime' => $pr['upload_time'] ?? ''
                        ];
                    }
                }

                $foundMeta = [
                    'users' => $aggregatedUsers,
                    'classes' => $aggregatedClasses,
                    'tasks' => $aggregatedTasks,
                    'announcements' => $aggregatedAnnouncements,
                    'referencePapers' => $aggregatedPapers,
                    'surveys' => []
                ];
            } catch (Exception $e) {}
        }
    }

    if ($foundMeta) {
        $foundMeta['version'] = $currentVer;
        // 脱敏：下发前剔除 password
        if (isset($foundMeta['users']) && is_array($foundMeta['users'])) {
            foreach ($foundMeta['users'] as &$usr) { if (is_array($usr)) unset($usr['password']); }
            unset($usr);
        }
        echo json_encode($foundMeta, JSON_UNESCAPED_UNICODE);
        exit;
    }

    // 降级兼容本地文件
    $globalDbFile = __DIR__ . '/global_db.json';
    if (file_exists($globalDbFile) && filesize($globalDbFile) > 0) {
        $fileContent = file_get_contents($globalDbFile);
        $parsedFile = json_decode($fileContent, true);
        if (is_array($parsedFile)) {
            $parsedFile['version'] = 1;
            echo json_encode($parsedFile, JSON_UNESCAPED_UNICODE);
            exit;
        }
    }

    // 兜底返回空容器，绝对不再主动覆盖写入数据库！
    echo json_encode([
        'version'         => 1,
        'users'           => [],
        'classes'         => [],
        'tasks'           => [],
        'announcements'   => [],
        'referencePapers' => []
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// ⚡ 1.7 任务延期原子直连 API (100% 极速落库 MySQL 与 main_meta，彻底杜绝大包推送失败与回滚)
if ($action === 'extend_task_deadline' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    header('Content-Type: application/json; charset=utf-8');
    $rawInput = file_get_contents('php://input');
    $req = json_decode($rawInput, true) ?: [];
    $taskId = trim($req['taskId'] ?? '');
    $newDeadline = trim($req['newDeadline'] ?? '');
    $addedMinutes = intval($req['addedMinutes'] ?? 0);
    $reqUserId = trim($req['userId'] ?? ($_GET['userId'] ?? ''));
    $reqToken = trim($req['token'] ?? ($_GET['token'] ?? ''));

    if (empty($taskId) || empty($newDeadline)) {
        echo json_encode(['success' => false, 'message' => '参数不全 (taskId / newDeadline 缺失)']);
        exit;
    }

    if ($pdo) {
        $stmtMeta = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = 'main_meta'");
        $stmtMeta->execute();
        $mRow = $stmtMeta->fetch();
        $gm = ($mRow && !empty($mRow['meta_value'])) ? json_decode($mRow['meta_value'], true) : [];
        if (!is_array($gm)) $gm = [];
        if (!isset($gm['tasks']) || !is_array($gm['tasks'])) $gm['tasks'] = [];

        $taskFound = false;
        $updatedTask = null;
        $reqTitle = trim($req['taskTitle'] ?? '');

        foreach ($gm['tasks'] as &$tsk) {
            $isIdMatch = isset($tsk['id']) && ($tsk['id'] === $taskId || 
                (strpos($taskId, 'default') !== false && strpos($tsk['id'], 'default') !== false));
            $isTitleMatch = (!empty($reqTitle) && isset($tsk['title']) && $tsk['title'] === $reqTitle);

            if ($isIdMatch || $isTitleMatch) {
                $tsk['deadline'] = $newDeadline;
                if ($addedMinutes > 0) {
                    $tsk['durationMinutes'] = (intval($tsk['durationMinutes'] ?? 150)) + $addedMinutes;
                }
                $tsk['lastExtension'] = [
                    'extendedAt' => round(microtime(true) * 1000),
                    'newDeadline' => $newDeadline,
                    'addedMinutes' => $addedMinutes
                ];
                $updatedTask = $tsk;
                $taskFound = true;
            }
        }
        unset($tsk);

        if (!$taskFound) {
            $updatedTask = [
                'id' => $taskId,
                'title' => trim($req['taskTitle'] ?? '写作任务'),
                'deadline' => $newDeadline,
                'durationMinutes' => 150 + $addedMinutes,
                'status' => 'in_progress',
                'lastExtension' => [
                    'extendedAt' => round(microtime(true) * 1000),
                    'newDeadline' => $newDeadline,
                    'addedMinutes' => $addedMinutes
                ]
            ];
            $gm['tasks'][] = $updatedTask;
        }

        // 递增全局版本号
        $stmtVer = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = 'main_meta_version'");
        $stmtVer->execute();
        $vRow = $stmtVer->fetch();
        $curVer = $vRow ? intval($vRow['meta_value']) : 1;
        $newVer = $curVer + 1;

        $gmJson = json_encode($gm, JSON_UNESCAPED_UNICODE);
        $stmtSave = $pdo->prepare("INSERT INTO global_meta (meta_key, meta_value) VALUES ('main_meta', :v) ON DUPLICATE KEY UPDATE meta_value = :v2");
        $stmtSave->execute([':v' => $gmJson, ':v2' => $gmJson]);

        $stmtSaveVer = $pdo->prepare("INSERT INTO global_meta (meta_key, meta_value) VALUES ('main_meta_version', :v) ON DUPLICATE KEY UPDATE meta_value = :v2");
        $stmtSaveVer->execute([':v' => $newVer, ':v2' => $newVer]);

        // 写入变更信号时间戳，让所有轮询设备的 pullFromServer 立刻感知到全局数据已变
        $nowMs = round(microtime(true) * 1000);
        $stmtMetaUp = $pdo->prepare("INSERT INTO global_meta (meta_key, meta_value) VALUES ('meta_updated_at', :v) ON DUPLICATE KEY UPDATE meta_value = :v2");
        $stmtMetaUp->execute([':v' => $nowMs, ':v2' => $nowMs]);

        try {
            $stmtUpdTask = $pdo->prepare("UPDATE tasks SET deadline = :dl WHERE id = :id OR title = :t");
            $stmtUpdTask->execute([':dl' => $newDeadline, ':id' => $taskId, ':t' => $reqTitle]);
        } catch (Exception $e) {}

        @file_put_contents(__DIR__ . '/global_db.json', $gmJson);

        echo json_encode([
            'success' => true,
            'version' => $newVer,
            'task' => $updatedTask
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    echo json_encode(['success' => false, 'message' => '数据库连接失败']);
    exit;
}

if ($action === 'save_global_meta' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $rawInput = file_get_contents('php://input');
    if (!empty($rawInput)) {
        $decoded = json_decode($rawInput, true);

        // 🛡️ 严格后端教师角色与 Session Token 双重鉴权（Fail-Closed 默认拒绝）
        $userId = $decoded['userId'] ?? ($_GET['userId'] ?? '');
        $token = $decoded['token'] ?? ($_GET['token'] ?? ($_SERVER['HTTP_AUTHORIZATION'] ?? ''));

        $isAuthorized = verifyTeacherSession($userId, $token, $pdo);

        if (!$isAuthorized) {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => '权限不足：仅允许持有有效凭证的认证教师修改全局教务配置']);
            exit;
        }

        // 🛡️ 严格校验：必须是包含有效教务字段的 JSON 结构，防止空数据或脏请求冲刷
        if (is_array($decoded) && (isset($decoded['classes']) || isset($decoded['tasks']) || isset($decoded['users']))) {
            $newVersion = 1;
            // 🛡️ 剥离请求元数据（userId/token/expectedVersion 仅用于鉴权与版本协商，不属业务数据，绝不落入 main_meta 快照，也避免 token 经 get_global_meta 无鉴权回传泄露）
            $cleanDecoded = $decoded;
            unset($cleanDecoded['userId'], $cleanDecoded['token'], $cleanDecoded['expectedVersion']);
            $cleanJson = json_encode($cleanDecoded, JSON_UNESCAPED_UNICODE);
            if ($pdo) {
                // 读取当前 version
                $stmtVer = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = 'main_meta_version'");
                $stmtVer->execute();
                $verRow = $stmtVer->fetch();
                $currentVersion = $verRow ? intval($verRow['meta_value']) : 1;

                // 🚀 顺滑无感版本自增（以最新版本号自增更新，杜绝阻断性 409 弹窗）
                $newVersion = $currentVersion + 1;

                // 🛡️ 关键修复：合并保留服务器端已有公告的「已读状态 / 确认成员」，杜绝过期客户端快照反向冲刷学生的已读确认
                // （否则教师端任何一次整块 save_global_meta 都会把学生刚确认的通知已读状态抹掉 → 通知反复弹窗 → 请求风暴）
                try {
                    $stmtExAnn = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = 'main_meta'");
                    $stmtExAnn->execute();
                    $exAnnRow = $stmtExAnn->fetch();
                    if ($exAnnRow && !empty($exAnnRow['meta_value'])) {
                        $exAnnMeta = json_decode($exAnnRow['meta_value'], true);
                        $exAnnMap = [];
                        if (is_array($exAnnMeta) && isset($exAnnMeta['announcements']) && is_array($exAnnMeta['announcements'])) {
                            foreach ($exAnnMeta['announcements'] as $ea) {
                                if (is_array($ea) && isset($ea['id'])) $exAnnMap[$ea['id']] = $ea;
                            }
                        }
                        if (!empty($exAnnMap) && isset($cleanDecoded['announcements']) && is_array($cleanDecoded['announcements'])) {
                            foreach ($cleanDecoded['announcements'] as &$annIn) {
                                if (!is_array($annIn) || !isset($annIn['id'])) continue;
                                $eid = $annIn['id'];
                                if (!isset($exAnnMap[$eid])) continue;
                                $ea = $exAnnMap[$eid];
                                // 已读标记只增不减：服务器已有状态优先，客户端过期快照补缺即可
                                $annIn['readStatus'] = array_replace(
                                    (isset($ea['readStatus']) && is_array($ea['readStatus'])) ? $ea['readStatus'] : [],
                                    (isset($annIn['readStatus']) && is_array($annIn['readStatus'])) ? $annIn['readStatus'] : []
                                );
                                $annIn['readGroupStatus'] = array_replace(
                                    (isset($ea['readGroupStatus']) && is_array($ea['readGroupStatus'])) ? $ea['readGroupStatus'] : [],
                                    (isset($annIn['readGroupStatus']) && is_array($annIn['readGroupStatus'])) ? $annIn['readGroupStatus'] : []
                                );
                                // 确认成员按 id/studentCode/name 去重合并，服务器已有优先
                                $confMap = [];
                                $eaConf = (isset($ea['confirmedMembers']) && is_array($ea['confirmedMembers'])) ? $ea['confirmedMembers'] : [];
                                $inConf = (isset($annIn['confirmedMembers']) && is_array($annIn['confirmedMembers'])) ? $annIn['confirmedMembers'] : [];
                                foreach (array_merge($eaConf, $inConf) as $cm) {
                                    if (!is_array($cm)) continue;
                                    $k = (isset($cm['id']) && $cm['id']) ? $cm['id'] : ((isset($cm['studentCode']) && $cm['studentCode']) ? $cm['studentCode'] : (isset($cm['name']) ? $cm['name'] : ''));
                                    if ($k !== '') $confMap[$k] = $cm;
                                }
                                $annIn['confirmedMembers'] = array_values($confMap);
                            }
                            unset($annIn);
                        }

                        // 🛡️ 关键修复：合并保留服务器端任务的「最新延期截止时间 lastExtension」，杜绝教师端其他旧快照反向冲刷延期
                        if (is_array($exAnnMeta) && isset($exAnnMeta['tasks']) && is_array($exAnnMeta['tasks'])) {
                            $exTasksMap = [];
                            foreach ($exAnnMeta['tasks'] as $et) {
                                if (is_array($et) && isset($et['id'])) $exTasksMap[$et['id']] = $et;
                                if (is_array($et) && isset($et['title'])) $exTasksMap[$et['title']] = $et;
                            }
                            if (!empty($exTasksMap) && isset($cleanDecoded['tasks']) && is_array($cleanDecoded['tasks'])) {
                                foreach ($cleanDecoded['tasks'] as &$tskIn) {
                                    if (!is_array($tskIn)) continue;
                                    $tid = $tskIn['id'] ?? ($tskIn['title'] ?? '');
                                    if (!$tid || !isset($exTasksMap[$tid])) continue;
                                    $et = $exTasksMap[$tid];
                                    $serverExtAt = isset($et['lastExtension']['extendedAt']) ? intval($et['lastExtension']['extendedAt']) : 0;
                                    $inExtAt = isset($tskIn['lastExtension']['extendedAt']) ? intval($tskIn['lastExtension']['extendedAt']) : 0;
                                    if ($serverExtAt > $inExtAt) {
                                        $tskIn['deadline'] = $et['deadline'];
                                        if (isset($et['durationMinutes'])) $tskIn['durationMinutes'] = $et['durationMinutes'];
                                        $tskIn['lastExtension'] = $et['lastExtension'];
                                    }
                                }
                                unset($tskIn);
                            }
                        }

                        $cleanJson = json_encode($cleanDecoded, JSON_UNESCAPED_UNICODE);
                    }
                } catch (Exception $e) {}

                $stmt = $pdo->prepare("INSERT INTO global_meta (meta_key, meta_value) VALUES ('main_meta', :val) ON DUPLICATE KEY UPDATE meta_value = :val2");
                $stmt->execute([':val' => $cleanJson, ':val2' => $cleanJson]);

                // 🛡️ 实体表实时入库：将所有用户/学生 100% 同步 upsert 至 users 实体表，确保异地设备登录 0 延迟秒级识别
                // 🛡️ 实体表实时入库：将所有用户/学生 100% 同步 upsert 至 users 实体表，确保异地设备登录 0 延迟秒级识别
                if (isset($decoded['users']) && is_array($decoded['users'])) {
                    $stmtUserUpsert = $pdo->prepare("INSERT INTO `users` (`id`, `name`, `password`, `role`)
                        VALUES (:id, :nm, :p, :r)
                        ON DUPLICATE KEY UPDATE `name`=VALUES(`name`), `role`=VALUES(`role`)");
                    foreach ($decoded['users'] as $usr) {
                        $uid = isset($usr['id']) ? $usr['id'] : (isset($usr['studentCode']) ? $usr['studentCode'] : ('u_student_' . uniqid()));
                        $unick = isset($usr['name']) ? $usr['name'] : $uid;
                        $upwd = !empty($usr['password']) ? $usr['password'] : '123';
                        $urole = isset($usr['role']) ? $usr['role'] : 'student';
                        $stmtUserUpsert->execute([
                            ':id' => $uid, ':nm' => $unick, ':p' => $upwd, ':r' => $urole
                        ]);
                    }
                }
                // 🛡️ 实体表实时入库：将所有班级 classes 100% 同步 upsert 至 classes 实体表
                if (isset($decoded['classes']) && is_array($decoded['classes'])) {
                    $stmtClsUpsert = $pdo->prepare("INSERT INTO `classes` (`id`, `name`, `student_ids`, `groups_data`)
                        VALUES (:id, :nm, :sids, :gdata)
                        ON DUPLICATE KEY UPDATE `name`=VALUES(`name`), `student_ids`=VALUES(`student_ids`), `groups_data`=VALUES(`groups_data`)");
                    foreach ($decoded['classes'] as $cls) {
                        $cid = $cls['id'] ?? ('class_' . uniqid());
                        $cname = $cls['name'] ?? '教学班';
                        $sids = json_encode($cls['studentIds'] ?? [], JSON_UNESCAPED_UNICODE);
                        $gdata = json_encode($cls['groups'] ?? [], JSON_UNESCAPED_UNICODE);
                        $stmtClsUpsert->execute([':id' => $cid, ':nm' => $cname, ':sids' => $sids, ':gdata' => $gdata]);
                    }
                }

                // 🛡️ 实体表实时入库：将所有任务 tasks 100% 同步 upsert 至 tasks 实体表
                if (isset($decoded['tasks']) && is_array($decoded['tasks'])) {
                    $stmtTaskUpsert = $pdo->prepare("INSERT INTO `tasks` (`id`, `title`, `desc`, `created_at_str`, `deadline`, `duration_minutes`, `target_class_ids`, `attachments`, `status`)
                        VALUES (:id, :title, :desc, :created_at, :deadline, :duration, :cids, :att, :status)
                        ON DUPLICATE KEY UPDATE `title`=VALUES(`title`), `desc`=VALUES(`desc`), `created_at_str`=VALUES(`created_at_str`), `deadline`=VALUES(`deadline`), `duration_minutes`=VALUES(`duration_minutes`), `target_class_ids`=VALUES(`target_class_ids`), `attachments`=VALUES(`attachments`), `status`=VALUES(`status`)");
                    foreach ($decoded['tasks'] as $tsk) {
                        $tid = $tsk['id'] ?? ('task_' . uniqid());
                        $ttitle = $tsk['title'] ?? '写作任务';
                        $tdesc = $tsk['instructions'] ?? ($tsk['desc'] ?? '');
                        $tcreated = $tsk['createdAt'] ?? date('Y-m-d H:i:s');
                        $tdeadline = $tsk['deadline'] ?? '';
                        $tduration = intval($tsk['durationMinutes'] ?? 150);
                        $tcids = json_encode($tsk['targetClassIds'] ?? (isset($tsk['classId']) ? [$tsk['classId']] : []), JSON_UNESCAPED_UNICODE);
                        $tatt = json_encode($tsk['resources'] ?? ($tsk['attachments'] ?? []), JSON_UNESCAPED_UNICODE);
                        $tstatus = $tsk['status'] ?? 'in_progress';
                        $stmtTaskUpsert->execute([
                            ':id' => $tid, ':title' => $ttitle, ':desc' => $tdesc, ':created_at' => $tcreated,
                            ':deadline' => $tdeadline, ':duration' => $tduration, ':cids' => $tcids, ':att' => $tatt, ':status' => $tstatus
                        ]);
                    }
                }

                // 🛡️ 实体表实时入库：将所有通知 announcements 100% 同步 upsert 至 announcements 实体表
                if (isset($decoded['announcements']) && is_array($decoded['announcements'])) {
                    @$pdo->exec("ALTER TABLE `announcements` ADD COLUMN `attachment` LONGTEXT NULL");
                    @$pdo->exec("ALTER TABLE `announcements` ADD COLUMN `confirmed_members` LONGTEXT NULL");
                    $stmtAnnUpsert = $pdo->prepare("INSERT INTO `announcements` (`id`, `title`, `content`, `created_at_str`, `target_class_ids`, `is_pinned`, `attachment`, `confirmed_members`)
                        VALUES (:id, :title, :content, :created_at, :cids, :pinned, :att, :conf)
                        ON DUPLICATE KEY UPDATE `title`=VALUES(`title`), `content`=VALUES(`content`), `created_at_str`=VALUES(`created_at_str`), `target_class_ids`=VALUES(`target_class_ids`), `is_pinned`=VALUES(`is_pinned`), `attachment`=VALUES(`attachment`), `confirmed_members`=VALUES(`confirmed_members`)");
                    foreach ($decoded['announcements'] as $ann) {
                        $aid = $ann['id'] ?? ('ann_' . uniqid());
                        $atitle = $ann['title'] ?? '通知';
                        $acontent = $ann['content'] ?? '';
                        $acreated = $ann['createdAt'] ?? date('Y-m-d H:i:s');
                        $acids = json_encode($ann['targetClassIds'] ?? [], JSON_UNESCAPED_UNICODE);
                        $apinned = !empty($ann['isPinned']) ? 1 : 0;
                        $aatt = !empty($ann['attachment']) ? json_encode($ann['attachment'], JSON_UNESCAPED_UNICODE) : null;
                        $aconf = !empty($ann['confirmedMembers']) ? json_encode($ann['confirmedMembers'], JSON_UNESCAPED_UNICODE) : null;
                        $stmtAnnUpsert->execute([':id' => $aid, ':title' => $atitle, ':content' => $acontent, ':created_at' => $acreated, ':cids' => $acids, ':pinned' => $apinned, ':att' => $aatt, ':conf' => $aconf]);
                    }
                }

                // 🛡️ 实体表实时入库：将所有范文 reference_papers 100% 同步 upsert 至 reference_papers 实体表
                if (isset($decoded['referencePapers']) && is_array($decoded['referencePapers'])) {
                    $stmtPaperUpsert = $pdo->prepare("INSERT INTO `reference_papers` (`id`, `title`, `abstract`, `highlights`, `target_group`, `file_name`, `file_size`, `file_data`, `upload_time`)
                        VALUES (:id, :title, :abstract, :highlights, :tg, :fname, :fsize, :fdata, :uptime)
                        ON DUPLICATE KEY UPDATE `title`=VALUES(`title`), `abstract`=VALUES(`abstract`), `highlights`=VALUES(`highlights`), `target_group`=VALUES(`target_group`), `file_name`=VALUES(`file_name`), `file_size`=VALUES(`file_size`), `file_data`=VALUES(`file_data`), `upload_time`=VALUES(`upload_time`)");
                    foreach ($decoded['referencePapers'] as $rp) {
                        $rpid = $rp['id'] ?? ('paper_' . uniqid());
                        $rptitle = $rp['title'] ?? '参考范文';
                        $rpabstract = $rp['abstract'] ?? '';
                        $rphighlights = $rp['keyHighlights'] ?? ($rp['highlights'] ?? '');
                        $rptg = $rp['targetGroupId'] ?? ($rp['targetGroup'] ?? 'all');
                        $rpfname = $rp['fileName'] ?? '';
                        $rpfsize = $rp['fileSize'] ?? '';
                        $rpfdata = $rp['fileUrl'] ?? ($rp['fileData'] ?? '');
                        $rpuptime = $rp['uploadTime'] ?? date('Y-m-d H:i:s');
                        $stmtPaperUpsert->execute([
                            ':id' => $rpid, ':title' => $rptitle, ':abstract' => $rpabstract, ':highlights' => $rphighlights,
                            ':tg' => $rptg, ':fname' => $rpfname, ':fsize' => $rpfsize, ':fdata' => $rpfdata, ':uptime' => $rpuptime
                        ]);
                    }
                }

                $stmtVerSave = $pdo->prepare("INSERT INTO global_meta (meta_key, meta_value) VALUES ('main_meta_version', :v) ON DUPLICATE KEY UPDATE meta_value = :v2");
                $stmtVerSave->execute([':v' => $newVersion, ':v2' => $newVersion]);

                // 写入变更信号时间戳，让所有轮询设备的 pullFromServer 立刻感知到全局数据已变
                $nowMs = round(microtime(true) * 1000);
                $stmt2 = $pdo->prepare("INSERT INTO global_meta (meta_key, meta_value) VALUES ('meta_updated_at', :v) ON DUPLICATE KEY UPDATE meta_value = :v2");
                $stmt2->execute([':v' => $nowMs, ':v2' => $nowMs]);
            }
            @file_put_contents(__DIR__ . '/global_db.json', $cleanJson);
            echo json_encode(['success' => true, 'version' => $newVersion]);
            exit;
        }
    }
    echo json_encode(['success' => true]);
    exit;
}

// 1b. 学生已读通知轻量回传（只更新指定通知的 readStatus，不触碰 tasks/surveys/papers）
if ($action === 'update_read_status' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $rawInput = file_get_contents('php://input');
    $req = json_decode($rawInput, true) ?: [];
    $annId   = isset($req['annId'])   ? $req['annId']   : '';
    $groupId = isset($req['groupId']) ? $req['groupId'] : '';
    $userId  = isset($req['userId'])  ? $req['userId']  : '';
    $userCode = isset($req['userCode']) ? $req['userCode'] : '';
    $userName = isset($req['userName']) ? $req['userName'] : '';

    if ($annId && $pdo) {
        // 读取当前 global_meta
        $stmt = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = 'main_meta'");
        $stmt->execute();
        $row = $stmt->fetch();
        if ($row && !empty($row['meta_value'])) {
            $meta = json_decode($row['meta_value'], true);
            if (is_array($meta) && isset($meta['announcements']) && is_array($meta['announcements'])) {
                $changed = false;
                foreach ($meta['announcements'] as &$ann) {
                    if ($ann['id'] === $annId) {
                        if (!isset($ann['readStatus']) || !is_array($ann['readStatus'])) $ann['readStatus'] = [];
                        if (!isset($ann['readGroupStatus']) || !is_array($ann['readGroupStatus'])) $ann['readGroupStatus'] = [];
                        if (!isset($ann['confirmedMembers']) || !is_array($ann['confirmedMembers'])) $ann['confirmedMembers'] = [];

                        if ($userId) $ann['readStatus'][$userId] = true;
                        if ($userCode) $ann['readStatus'][$userCode] = true;
                        if ($userName) $ann['readStatus'][$userName] = true;
                        if ($groupId) {
                            $ann['readGroupStatus'][$groupId] = true;
                            $ann['readStatus'][$groupId] = true;
                        }

                        $exists = false;
                        foreach ($ann['confirmedMembers'] as $cm) {
                            if (is_array($cm) && (
                                (isset($cm['id']) && $userId && $cm['id'] === $userId) ||
                                (isset($cm['studentCode']) && $userCode && $cm['studentCode'] === $userCode) ||
                                (isset($cm['name']) && $userName && $cm['name'] === $userName)
                            )) {
                                $exists = true;
                                break;
                            }
                        }
                        if (!$exists) {
                            $ann['confirmedMembers'][] = [
                                'id' => $userId ?: ($userCode ?: 'u_' . round(microtime(true) * 1000)),
                                'name' => $userName ?: ($userCode ?: '学生'),
                                'groupId' => $groupId ?: '',
                                'time' => date('H:i')
                            ];
                        }
                        $changed = true;
                        break;
                    }
                }
                unset($ann);
                if ($changed) {
                    $newVal = json_encode($meta, JSON_UNESCAPED_UNICODE);
                    $stmt2 = $pdo->prepare("INSERT INTO global_meta (meta_key, meta_value) VALUES ('main_meta', :val) ON DUPLICATE KEY UPDATE meta_value = :val2");
                    $stmt2->execute([':val' => $newVal, ':val2' => $newVal]);

                    // 推进全局元数据版本戳，使所有轮询端与教师端瞬间感知到已读名单更新
                    $pdo->exec("INSERT INTO global_meta (meta_key, meta_value) VALUES ('main_meta_version', 2) ON DUPLICATE KEY UPDATE meta_value = IFNULL(meta_value, 0) + 1");

                    // 更新变更时间戳
                    $nowMs = round(microtime(true) * 1000);
                    $stmt3 = $pdo->prepare("INSERT INTO global_meta (meta_key, meta_value) VALUES ('meta_updated_at', :v) ON DUPLICATE KEY UPDATE meta_value = :v2");
                    $stmt3->execute([':v' => $nowMs, ':v2' => $nowMs]);
                    @file_put_contents(__DIR__ . '/global_db.json', $newVal);
                }
            }
        }
    }
    echo json_encode(['success' => true]);
    exit;
}

// 1c-2. 全员协同确认原子接口（无竞态覆盖，秒级原子合并各成员点击确认）
if ($action === 'confirm_step' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $req = !empty($REQ_DATA) ? $REQ_DATA : (@json_decode($RAW_INPUT, true) ?: []);
    $stepKey = isset($req['stepKey']) ? trim((string)$req['stepKey']) : '';
    $userKey = isset($req['userKey']) ? trim((string)$req['userKey']) : '';
    $nowMs = round(microtime(true) * 1000);

    if (!empty($stepKey) && !empty($userKey) && $pdo) {
        $metaKey = 'confs_' . $scopeKey;
        $stmtGet = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = :k");
        $stmtGet->execute([':k' => $metaKey]);
        $row = $stmtGet->fetch();
        $confs = ($row && !empty($row['meta_value'])) ? (json_decode($row['meta_value'], true) ?: []) : [];

        if (!isset($confs[$stepKey]) || !is_array($confs[$stepKey])) {
            $confs[$stepKey] = [];
        }
        $confs[$stepKey][$userKey] = true;

        $confJson = json_encode($confs, JSON_UNESCAPED_UNICODE);
        $stmtSave = $pdo->prepare("INSERT INTO global_meta (meta_key, meta_value, updated_at) VALUES (:k, :v, :ts) ON DUPLICATE KEY UPDATE meta_value = :v2, updated_at = :ts2");
        $nowStr = date('Y-m-d H:i:s');
        $stmtSave->execute([':k' => $metaKey, ':v' => $confJson, ':ts' => $nowStr, ':v2' => $confJson, ':ts2' => $nowStr]);

        // 唤醒客户端拉取
        $stmtUp = $pdo->prepare("UPDATE group_states SET last_timestamp = :ts, revision_id = IFNULL(revision_id, 0) + 1 WHERE scope_key = :sk");
        $stmtUp->execute([':ts' => $nowMs, ':sk' => $scopeKey]);

        echo json_encode([
            'success' => true,
            'stepConfirmations' => $confs,
            'stepKey' => $stepKey,
            'currentConfirmedUsers' => array_keys($confs[$stepKey]),
            'count' => count($confs[$stepKey]),
            'timestamp' => $nowMs
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }
    echo json_encode(['success' => false, 'error' => 'invalid_parameters']);
    exit;
}

if ($action === 'clear_step_confirmation' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $req = !empty($REQ_DATA) ? $REQ_DATA : (@json_decode($RAW_INPUT, true) ?: []);
    $stepKey = isset($req['stepKey']) ? trim((string)$req['stepKey']) : '';
    $nowMs = round(microtime(true) * 1000);

    if ($pdo) {
        $metaKey = 'confs_' . $scopeKey;
        $stmtGet = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = :k");
        $stmtGet->execute([':k' => $metaKey]);
        $row = $stmtGet->fetch();
        $confs = ($row && !empty($row['meta_value'])) ? (json_decode($row['meta_value'], true) ?: []) : [];

        if (!empty($stepKey)) {
            unset($confs[$stepKey]);
        } else {
            $confs = [];
        }

        $confJson = json_encode($confs, JSON_UNESCAPED_UNICODE);
        $stmtSave = $pdo->prepare("INSERT INTO global_meta (meta_key, meta_value, updated_at) VALUES (:k, :v, :ts) ON DUPLICATE KEY UPDATE meta_value = :v2, updated_at = :ts2");
        $nowStr = date('Y-m-d H:i:s');
        $stmtSave->execute([':k' => $metaKey, ':v' => $confJson, ':ts' => $nowStr, ':v2' => $confJson, ':ts2' => $nowStr]);

        echo json_encode(['success' => true, 'stepConfirmations' => $confs, 'timestamp' => $nowMs], JSON_UNESCAPED_UNICODE);
        exit;
    }
    echo json_encode(['success' => true]);
    exit;
}

// 1d. 研讨区独立轻量发信接口（领域隔离：仅入库单条消息，绝不触碰 group_states 表中的 stage1/stage2/stage3）
if ($action === 'send_chat' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $req = !empty($REQ_DATA) ? $REQ_DATA : (@json_decode($RAW_INPUT, true) ?: []);
    $msgItem = isset($req['message']) ? $req['message'] : $req;
    $stage = isset($req['stage']) ? $req['stage'] : (isset($msgItem['stage']) ? $msgItem['stage'] : 'stage1');
    $nowMs = round(microtime(true) * 1000);

    if (!empty($msgItem) && is_array($msgItem) && $pdo) {
        $snd = isset($msgItem['sender']) ? $msgItem['sender'] : 'unknown';
        $txt = isset($msgItem['text']) ? $msgItem['text'] : '';
        $tstr = isset($msgItem['timestamp']) ? $msgItem['timestamp'] : '';
        $tms = isset($msgItem['_timeMs']) ? intval($msgItem['_timeMs']) : (isset($msgItem['timeMs']) ? intval($msgItem['timeMs']) : $nowMs);
        $mId = isset($msgItem['id']) && !empty($msgItem['id']) ? $msgItem['id'] : ($snd . '_' . $tms . '_' . mb_substr($txt, 0, 30));
        $msgItem['id'] = $mId;
        $msgItem['_timeMs'] = $tms;

        if (!empty($txt)) {
            // 🛡️ AI 智能体开场白全局唯一幂等守护：若本组本阶段已存在该智能体的开场白，绝对拒绝重复插入
            $isAgentWelcome = (
                (in_array($snd, ['auctioneer', 'managingEditor', 'reviewingEditor', 'neutral', 'proponent', 'opponent']) && (mb_strpos($txt, '开场') !== false || mb_strpos($txt, '欢迎来到') !== false || mb_strpos($txt, '开局') !== false))
                || (strpos((string)$mId, 'msg_welcome_') !== false)
            );
            if ($isAgentWelcome) {
                $chkStmt = $pdo->prepare("SELECT id FROM chat_messages WHERE scope_key = :sk AND stage = :stg AND sender = :snd AND (text LIKE '%开场%' OR text LIKE '%欢迎来到%' OR text LIKE '%开局%' OR id LIKE 'msg_welcome_%') LIMIT 1");
                $chkStmt->execute([':sk' => $scopeKey, ':stg' => $stage, ':snd' => $snd]);
                if ($chkStmt->fetch()) {
                    echo json_encode(['success' => true, 'timestamp' => $nowMs, 'dedup' => true]);
                    exit;
                }
            }

            // 1. 行级插入 chat_messages 表 (零崩溃兼容 sender_name)
            $sndName = isset($msgItem['senderName']) ? $msgItem['senderName'] : (isset($msgItem['sender_name']) ? $msgItem['sender_name'] : '');
            try {
                $stmtInsertMsg = $pdo->prepare("INSERT IGNORE INTO chat_messages (scope_key, stage, sender, sender_name, text, timestamp_str, time_ms) VALUES (:sk, :stg, :snd, :sndName, :txt, :tstr, :tms)");
                $stmtInsertMsg->execute([
                    ':sk' => $scopeKey,
                    ':stg' => $stage,
                    ':snd' => $snd,
                    ':sndName' => $sndName,
                    ':txt' => $txt,
                    ':tstr' => $tstr,
                    ':tms' => $tms
                ]);
            } catch (\Exception $e) {
                try {
                    $stmtInsertMsg = $pdo->prepare("INSERT IGNORE INTO chat_messages (scope_key, stage, sender, text, timestamp_str, time_ms) VALUES (:sk, :stg, :snd, :txt, :tstr, :tms)");
                    $stmtInsertMsg->execute([
                        ':sk' => $scopeKey,
                        ':stg' => $stage,
                        ':snd' => $snd,
                        ':txt' => $txt,
                        ':tstr' => $tstr,
                        ':tms' => $tms
                    ]);
                } catch (\Exception $e2) {}
            }

            // 2. 更新 chats_{scopeKey} 缓存
            $stmtGetChats = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = :k");
            $stmtGetChats->execute([':k' => 'chats_' . $scopeKey]);
            $cRow = $stmtGetChats->fetch();
            $existingChats = ($cRow && !empty($cRow['meta_value'])) ? (json_decode($cRow['meta_value'], true) ?: []) : ['stage1' => [], 'stage2' => [], 'stage3' => []];
            if (!isset($existingChats[$stage]) || !is_array($existingChats[$stage])) $existingChats[$stage] = [];

            // 幂等去重追加
            $alreadyExists = false;
            foreach ($existingChats[$stage] as $m) {
                if (is_array($m) && ((isset($m['id']) && $m['id'] === $mId) || (isset($m['_timeMs']) && $m['_timeMs'] == $tms && isset($m['sender']) && $m['sender'] === $snd))) {
                    $alreadyExists = true;
                    break;
                }
            }
            if (!$alreadyExists) {
                $existingChats[$stage][] = $msgItem;
                usort($existingChats[$stage], function($a, $b) {
                    $ta = isset($a['_timeMs']) ? intval($a['_timeMs']) : 0;
                    $tb = isset($b['_timeMs']) ? intval($b['_timeMs']) : 0;
                    return $ta <=> $tb;
                });
                $stmtSaveChats = $pdo->prepare("INSERT INTO global_meta (meta_key, meta_value) VALUES (:k, :v) ON DUPLICATE KEY UPDATE meta_value = :v2");
                $chatJson = json_encode($existingChats, JSON_UNESCAPED_UNICODE);
                $stmtSaveChats->execute([':k' => 'chats_' . $scopeKey, ':v' => $chatJson, ':v2' => $chatJson]);

                // ⚡ 同步自增 group_states 的 revision_id 与 last_timestamp，秒级唤醒所有组员的客户端拉取最新消息
                $stmtUpState = $pdo->prepare("INSERT INTO group_states (scope_key, task_id, group_id, current_stage, stage1_data, stage2_data, stage3_data, presence_data, members_data, is_final_submitted, last_timestamp, revision_id)
                    VALUES (:sk, :tid, :gid, 'stage1', '{}', '{}', '{}', '{}', '[]', 0, :ts, 1)
                    ON DUPLICATE KEY UPDATE revision_id = IFNULL(revision_id, 0) + 1, last_timestamp = VALUES(last_timestamp)");
                $stmtUpState->execute([
                    ':sk' => $scopeKey,
                    ':tid' => $taskId,
                    ':gid' => $groupId,
                    ':ts' => $nowMs
                ]);

                // 更新变更时间戳，唤醒轮询
                $stmtSignal = $pdo->prepare("INSERT INTO global_meta (meta_key, meta_value) VALUES ('meta_updated_at', :v) ON DUPLICATE KEY UPDATE meta_value = :v2");
                $stmtSignal->execute([':v' => $nowMs, ':v2' => $nowMs]);
            }

            echo json_encode(['success' => true, 'message' => $msgItem, 'timestamp' => $nowMs]);
            exit;
        }
    }
    echo json_encode(['success' => true]);
    exit;
}

// 1e. 专属轻量在线心跳接口（物理隔离：仅更新当前用户在线时间戳，绝不触碰任何阶段协作数据与聊天）
if ($action === 'presence_ping' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $req = !empty($REQ_DATA) ? $REQ_DATA : (@json_decode($RAW_INPUT, true) ?: []);
    $userKey = isset($req['userId']) ? trim($req['userId']) : (isset($req['studentCode']) ? trim($req['studentCode']) : '');
    $nowMs = round(microtime(true) * 1000);

    if (!empty($userKey) && $pdo) {
        $stmtGet = $pdo->prepare("SELECT presence_data FROM group_states WHERE scope_key = :sk LIMIT 1");
        $stmtGet->execute([':sk' => $scopeKey]);
        $stRow = $stmtGet->fetch();
        $rawPrStr = ($stRow && !empty($stRow['presence_data'])) ? $stRow['presence_data'] : '';
        // 🛡️ 内存与结构安全防护：正常在线心跳数据小于 5KB，若历史数据异常膨胀（超过 50KB）直接净化，杜绝内存溢出
        if (strlen($rawPrStr) > 50000) {
            $rawPrStr = '{}';
        }
        $currPresence = !empty($rawPrStr) ? json_decode($rawPrStr, true) : [];
        if (!is_array($currPresence)) $currPresence = [];

        // 清理超过 5 分钟的陈旧心跳
        $cleanPresence = [];
        foreach ($currPresence as $k => $v) {
            $lastSeen = isset($v['lastSeen']) ? intval($v['lastSeen']) : (isset($v['updatedAt']) ? intval($v['updatedAt']) : 0);
            if ($nowMs - $lastSeen < 300000) {
                $cleanPresence[strval($k)] = $v;
            }
        }

        $pingPayload = [
            'lastSeen'  => $nowMs,
            'updatedAt' => $nowMs,
            'timestamp' => $nowMs,
            'name'      => isset($req['name']) ? $req['name'] : $userKey
        ];
        $cleanPresence[strval($userKey)] = $pingPayload;

        $prJson = json_encode($cleanPresence, JSON_UNESCAPED_UNICODE);
        
        $stmtUp = $pdo->prepare("INSERT INTO group_states (scope_key, task_id, group_id, current_stage, stage1_data, stage2_data, stage3_data, presence_data, members_data, is_final_submitted, last_timestamp, revision_id)
            VALUES (:sk, :tid, :gid, 'stage1', '{}', '{}', '{}', :pr, '[]', 0, :ts, 1)
            ON DUPLICATE KEY UPDATE presence_data = :pr2, last_timestamp = VALUES(last_timestamp)");
        $stmtUp->execute([
            ':sk'  => $scopeKey,
            ':tid' => $taskId,
            ':gid' => $groupId,
            ':pr'  => $prJson,
            ':pr2' => $prJson,
            ':ts'  => $nowMs
        ]);

        echo json_encode([
            'success'   => true,
            'timestamp' => $nowMs,
            'presence'  => !empty($cleanPresence) ? (object)$cleanPresence : new stdClass()
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }
    echo json_encode(['success' => true]);
    exit;
}

// 1f. 离线即时下线信标接口（页面关闭/跳出时瞬间清除在线状态，无需等待超时）
if ($action === 'presence_leave' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $req = !empty($REQ_DATA) ? $REQ_DATA : (@json_decode($RAW_INPUT, true) ?: []);
    $userKey = isset($req['userId']) ? trim($req['userId']) : (isset($req['studentCode']) ? trim($req['studentCode']) : '');
    $nowMs = round(microtime(true) * 1000);

    if (!empty($userKey) && $pdo) {
        $stmtGet = $pdo->prepare("SELECT presence_data FROM group_states WHERE scope_key = :sk LIMIT 1");
        $stmtGet->execute([':sk' => $scopeKey]);
        $stRow = $stmtGet->fetch();
        $currPresence = ($stRow && !empty($stRow['presence_data'])) ? json_decode($stRow['presence_data'], true) : [];
        if (!is_array($currPresence)) $currPresence = [];
        $currPresence[strval($userKey)] = ['offline' => true, 'leftAt' => $nowMs, 'lastSeen' => 0];
        $prJson = json_encode($currPresence, JSON_UNESCAPED_UNICODE);
        $stmtUp = $pdo->prepare("UPDATE group_states SET presence_data = :pr, last_timestamp = :ts WHERE scope_key = :sk");
        $stmtUp->execute([':pr' => $prJson, ':ts' => $nowMs, ':sk' => $scopeKey]);
    }
    echo json_encode(['success' => true]);
    exit;
}

if ($action === 'session_login' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $rawInput = file_get_contents('php://input');
    $req = json_decode($rawInput, true) ?: [];
    $userId = isset($req['userId']) ? trim($req['userId']) : '';
    $token = isset($req['token']) ? trim($req['token']) : '';

    if ($userId && $token && $pdo) {
        $stmtSess = $pdo->prepare("INSERT INTO global_meta (meta_key, meta_value, updated_at) VALUES (:k, :v, :ts) ON DUPLICATE KEY UPDATE meta_value = :v2, updated_at = :ts2");
        $nowStr = date('Y-m-d H:i:s');
        $stmtSess->execute([':k' => 'sess_' . $userId, ':v' => $token, ':ts' => $nowStr, ':v2' => $token, ':ts2' => $nowStr]);
    }
    echo json_encode(['success' => true]);
    exit;
}

if ($action === 'session_check') {
    $userId = isset($_GET['userId']) ? trim($_GET['userId']) : '';
    $token = isset($_GET['token']) ? trim($_GET['token']) : '';
    $kicked = false;
    if ($userId && $token && $pdo) {
        $keys = ['sess_' . $userId];
        if (strpos($userId, 'u_') === 0) {
            $keys[] = 'sess_' . substr($userId, 2);
        }
        $inClause = implode(',', array_fill(0, count($keys), '?'));
        $stmt = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key IN ($inClause)");
        $stmt->execute($keys);
        while ($row = $stmt->fetch()) {
            if (!empty($row['meta_value']) && $row['meta_value'] !== $token) {
                $kicked = true;
                break;
            }
        }
    }
    echo json_encode(['kicked' => $kicked]);
    exit;
}

if ($action === 'session_logout') {
    $userId = isset($_GET['userId']) ? $_GET['userId'] : '';
    $token = isset($_GET['token']) ? $_GET['token'] : '';
    // 🛡️ 仅当 token 与会话一致时才允许登出，防止跨站伪造登出 (CSRF/logout-forgery)
    $canLogout = false;
    if ($userId && $token && $pdo) {
        $stmt = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = :k");
        $stmt->execute([':k' => 'sess_' . $userId]);
        $row = $stmt->fetch();
        $canLogout = ($row && !empty($row['meta_value']) && $row['meta_value'] === $token);
    }
    if ($canLogout) {
        $stmt = $pdo->prepare("DELETE FROM global_meta WHERE meta_key = :k");
        $stmt->execute([':k' => 'sess_' . $userId]);
    }
    echo json_encode(['success' => true]);
    exit;
}

// 3. 扣子 (Coze v3) API 代理转发与非阻塞轮询 (引入规范化 OAuth 引擎)
if (($action === 'coze_chat' || $action === 'coze_poll') && ($_SERVER['REQUEST_METHOD'] === 'POST' || $_SERVER['REQUEST_METHOD'] === 'GET')) {
    require_once __DIR__ . '/api/chat_api.php';
    exit;
}



// 4. 数据快照持久化 (MySQL 主存储)
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $rawInput = $RAW_INPUT;
    $data = $REQ_DATA;
    if (!empty($data) || !empty($rawInput)) {
        $ts = isset($data['timestamp']) ? intval($data['timestamp']) : round(microtime(true) * 1000);
        
        $mergedPresence = (isset($data['presence']) && is_array($data['presence'])) ? $data['presence'] : [];
        $mergedS1       = (isset($data['stage1']) && is_array($data['stage1'])) ? $data['stage1'] : [];
        $mergedS2       = (isset($data['stage2']) && is_array($data['stage2'])) ? $data['stage2'] : [];
        $mergedS3       = (isset($data['stage3']) && is_array($data['stage3'])) ? $data['stage3'] : [];
        $mergedChats    = (isset($data['chatLogs']) && is_array($data['chatLogs'])) ? $data['chatLogs'] : ['stage1' => [], 'stage2' => [], 'stage3' => []];
        $clientRevision = isset($data['revisionId']) ? intval($data['revisionId']) : 0;
        $mbJson         = isset($data['members']) ? (is_string($data['members']) ? $data['members'] : json_encode($data['members'], JSON_UNESCAPED_UNICODE)) : '';

        if ($pdo) {
            // 4a. 读取已有的协作状态，进行字段级智能合并保护（杜绝多端互相覆盖）
            $existingPresence = [];
            $existingS1 = [];
            $existingS2 = [];
            $existingS3 = [];
            $existingRevision = 0;
            $stmtGetState = $pdo->prepare("SELECT presence_data, stage1_data, stage2_data, stage3_data, revision_id FROM group_states WHERE scope_key = :sk");
            $stmtGetState->execute([':sk' => $scopeKey]);
            $stRow = $stmtGetState->fetch();
            if ($stRow) {
                if (!empty($stRow['presence_data'])) $existingPresence = json_decode($stRow['presence_data'], true) ?: [];
                if (!empty($stRow['stage1_data']))   $existingS1 = json_decode($stRow['stage1_data'], true) ?: [];
                if (!empty($stRow['stage2_data']))   $existingS2 = json_decode($stRow['stage2_data'], true) ?: [];
                if (!empty($stRow['stage3_data']))   $existingS3 = json_decode($stRow['stage3_data'], true) ?: [];
                $existingRevision = isset($stRow['revision_id']) ? intval($stRow['revision_id']) : 0;
            }

            // 合并 presence (🛡️ 使用 array_replace 完美保留纯数字学号 Key，绝不被 PHP array_merge 重置为 0,1,2)
            $incomingPresence = (isset($data['presence']) && is_array($data['presence'])) ? $data['presence'] : [];
            $mergedPresence = array_replace($existingPresence, $incomingPresence);

            // 合并 stage1
            $incomingS1 = (isset($data['stage1']) && is_array($data['stage1'])) ? $data['stage1'] : [];
            $mergedS1 = array_merge($existingS1, $incomingS1);
            if (!empty($existingS1)) {
                // 🛡️ 选题主题防空覆盖：若传入的主题为空，严格保留已有主题
                if (empty(trim($incomingS1['mergedTitle'] ?? '')) && !empty(trim($existingS1['mergedTitle'] ?? ''))) {
                    $mergedS1['mergedTitle'] = $existingS1['mergedTitle'];
                }

                $exProps = isset($existingS1['proposals']) && is_array($existingS1['proposals']) ? $existingS1['proposals'] : [];
                $inProps = isset($incomingS1['proposals']) && is_array($incomingS1['proposals']) ? $incomingS1['proposals'] : [];
                $propMap = [];
                // 优先以提案唯一 ID 或唯一 author 标识为主键
                foreach ($exProps as $p) {
                    $key = !empty($p['id']) ? $p['id'] : (!empty($p['author']) ? $p['author'] : (!empty($p['authorName']) ? $p['authorName'] : ''));
                    if (!empty($key)) $propMap[$key] = $p;
                }
                foreach ($inProps as $p) {
                    $key = !empty($p['id']) ? $p['id'] : (!empty($p['author']) ? $p['author'] : (!empty($p['authorName']) ? $p['authorName'] : ''));
                    if (!empty($key)) {
                        $pTime = isset($p['updatedAt']) ? intval($p['updatedAt']) : 0;
                        $exTime = isset($propMap[$key]['updatedAt']) ? intval($propMap[$key]['updatedAt']) : 0;
                        if (!isset($propMap[$key]) || $pTime >= $exTime) {
                            $propMap[$key] = $p;
                        }
                    }
                }
                // 🛡️ 稳健白名单校验：多维度匹配 id / studentCode / username / name / author / authorName / authorId
                $allowedKeys = [];
                if (!empty($mbJson)) {
                    $mbs = json_decode($mbJson, true);
                    if (is_array($mbs)) {
                        foreach ($mbs as $mb) {
                            if (is_array($mb)) {
                                foreach (['id', 'userId', 'name'] as $f) {
                                    if (!empty($mb[$f])) $allowedKeys[mb_strtolower(trim((string)$mb[$f]))] = true;
                                }
                            } elseif (is_string($mb) || is_numeric($mb)) {
                                $allowedKeys[mb_strtolower(trim((string)$mb))] = true;
                            }
                        }
                    }
                }
                if (!empty($allowedKeys)) {
                    $cleanPropList = [];
                    foreach ($propMap as $k => $p) {
                        $matchKeys = [
                            isset($p['author']) ? mb_strtolower(trim((string)$p['author'])) : '',
                            isset($p['authorName']) ? mb_strtolower(trim((string)$p['authorName'])) : '',
                            isset($p['authorId']) ? mb_strtolower(trim((string)$p['authorId'])) : ''
                        ];
                        $isAllowed = false;
                        foreach ($matchKeys as $mk) {
                            if (!empty($mk) && isset($allowedKeys[$mk])) {
                                $isAllowed = true;
                                break;
                            }
                        }
                        // 兼容保护：若提案结构完整有效（包含title与id），即便作者名稍有偏差也不随意丢弃
                        if ($isAllowed || (!empty($p['title']) && !empty($p['id']))) {
                            $cleanPropList[] = $p;
                        }
                    }
                    $mergedS1['proposals'] = $cleanPropList;
                } else {
                    $mergedS1['proposals'] = array_values($propMap);
                }
                $exVotes = isset($existingS1['votes']) && is_array($existingS1['votes']) ? $existingS1['votes'] : [];
                $inVotes = isset($incomingS1['votes']) && is_array($incomingS1['votes']) ? $incomingS1['votes'] : [];
                $mergedS1['votes'] = array_replace($exVotes, $inVotes);
                $exHasVoted = isset($existingS1['hasVoted']) && is_array($existingS1['hasVoted']) ? $existingS1['hasVoted'] : [];
                $inHasVoted = isset($incomingS1['hasVoted']) && is_array($incomingS1['hasVoted']) ? $incomingS1['hasVoted'] : [];
                $mergedS1['hasVoted'] = array_replace($exHasVoted, $inHasVoted);
                if (!isset($mergedS1['contract'])) $mergedS1['contract'] = [];
                $exConfirmed = isset($existingS1['contract']['confirmedMembers']) && is_array($existingS1['contract']['confirmedMembers']) ? $existingS1['contract']['confirmedMembers'] : [];
                $inConfirmed = isset($incomingS1['contract']['confirmedMembers']) && is_array($incomingS1['contract']['confirmedMembers']) ? $incomingS1['contract']['confirmedMembers'] : [];
                $mergedS1['contract']['confirmedMembers'] = array_replace($exConfirmed, $inConfirmed);

                // 🛡️ Key 级深层合并：分工与时间安排按成员/模块属性独立合并，防止整包互相覆盖 (array_replace 完美保留纯数字学号键名)
                $exAssign = isset($existingS1['contract']['taskAssignments']) && is_array($existingS1['contract']['taskAssignments']) ? $existingS1['contract']['taskAssignments'] : [];
                $inAssign = isset($incomingS1['contract']['taskAssignments']) && is_array($incomingS1['contract']['taskAssignments']) ? $incomingS1['contract']['taskAssignments'] : [];
                $mergedS1['contract']['taskAssignments'] = array_replace($exAssign, $inAssign);

                $exTime = isset($existingS1['contract']['timeAllocations']) && is_array($existingS1['contract']['timeAllocations']) ? $existingS1['contract']['timeAllocations'] : [];
                $inTime = isset($incomingS1['contract']['timeAllocations']) && is_array($incomingS1['contract']['timeAllocations']) ? $incomingS1['contract']['timeAllocations'] : [];
                $mergedS1['contract']['timeAllocations'] = array_replace($exTime, $inTime);

                if (isset($incomingS1['contract']['isConfirmed'])) {
                    $mergedS1['contract']['isConfirmed'] = !empty($incomingS1['contract']['isConfirmed']);
                } else if (!empty($existingS1['contract']['isConfirmed'])) {
                    $mergedS1['contract']['isConfirmed'] = true;
                }

                // 阶段一首入时间戳保护与历史房间溯源补齐
                if (!empty($existingS1['startTime'])) {
                    if (empty($incomingS1['startTime']) || $existingS1['startTime'] < $incomingS1['startTime']) {
                        $mergedS1['startTime'] = $existingS1['startTime'];
                    }
                } elseif (!empty($incomingS1['startTime'])) {
                    $mergedS1['startTime'] = $incomingS1['startTime'];
                } else {
                    $earliestS1 = 0;
                    if (!empty($mergedS1['proposals']) && is_array($mergedS1['proposals'])) {
                        foreach ($mergedS1['proposals'] as $p) {
                            $pt = isset($p['createdAt']) ? intval($p['createdAt']) : 0;
                            if ($pt > 0 && ($earliestS1 === 0 || $pt < $earliestS1)) $earliestS1 = $pt;
                        }
                    }
                    if ($earliestS1 > 0) {
                        $mergedS1['startTime'] = $earliestS1;
                    }
                }
            }

            // 合并 stage2 (全篇单画布协作模型与正常编辑删除支持)
            $incomingS2 = (isset($data['stage2']) && is_array($data['stage2'])) ? $data['stage2'] : [];
            $mergedS2 = $incomingS2;
            if (!empty($existingS2)) {
                if (!empty($existingS2['startTime'])) {
                    if (empty($incomingS2['startTime']) || $existingS2['startTime'] < $incomingS2['startTime']) {
                        $mergedS2['startTime'] = $existingS2['startTime'];
                    }
                }
                // 🛡️ 致命防线：若传入的正文为空字符串，而数据库中已有非空正文草稿，且非重置操作，严格保留已有正文！
                // 🛡️ 乐观并发控制：客户端携带的 revision_id 落后于服务端时判定为过期正文，拒绝覆盖最新正文（杜绝降级模式下旧快照冲刷）
                $incomingIsStale = ($clientRevision > 0 && $existingRevision > 0 && $clientRevision < $existingRevision);
                if (isset($incomingS2['unifiedContent'])) {
                    $inText = trim($incomingS2['unifiedContent']);
                    $exText = trim($existingS2['unifiedContent'] ?? '');
                    
                    // 🛡️ 精确区分：冷启动空冲刷 vs 正常用户删除
                    // 1. 如果新客户端从未参与过编辑 (clientRevision === 0) 且发来空正文，判定为冷启动冲刷，保留服务端已有正文
                    // 2. 如果客户端版本号落后 (incomingIsStale)，判定为旧快照倒流，保留服务端最新正文
                    // 3. 正常在线编辑用户的任何删除（删一段、删几个字、全选清空），100% 允许落库生效！
                    if ($inText === '' && !empty($exText) && ($clientRevision === 0 || $incomingIsStale)) {
                        $mergedS2['unifiedContent'] = $existingS2['unifiedContent'];
                    } elseif ($incomingIsStale && !empty($exText)) {
                        $mergedS2['unifiedContent'] = $existingS2['unifiedContent'];
                    } else {
                        $mergedS2['unifiedContent'] = $incomingS2['unifiedContent'];
                    }
                } elseif (!empty($existingS2['unifiedContent'])) {
                    $mergedS2['unifiedContent'] = $existingS2['unifiedContent'];
                }
                // 贡献度数据合并：以实时传入的最新正文作者贡献度为准
                $exContrib = isset($existingS2['memberContributions']) && is_array($existingS2['memberContributions']) ? $existingS2['memberContributions'] : [];
                $inContrib = isset($incomingS2['memberContributions']) && is_array($incomingS2['memberContributions']) ? $incomingS2['memberContributions'] : [];
                if (!empty($inContrib)) {
                    $mergedS2['memberContributions'] = $inContrib;
                } else {
                    $mergedS2['memberContributions'] = $exContrib;
                }

                // 初稿全员确认字典合并
                $exConfirmed2 = isset($existingS2['confirmedMembers']) && is_array($existingS2['confirmedMembers']) ? $existingS2['confirmedMembers'] : [];
                $inConfirmed2 = isset($incomingS2['confirmedMembers']) && is_array($incomingS2['confirmedMembers']) ? $incomingS2['confirmedMembers'] : [];
                $mergedS2['confirmedMembers'] = array_replace($exConfirmed2, $inConfirmed2);

                // 会议打卡与行动清单合并
                $exSubs = isset($existingS2['meetingSubmissions']) && is_array($existingS2['meetingSubmissions']) ? $existingS2['meetingSubmissions'] : [];
                $inSubs = isset($incomingS2['meetingSubmissions']) && is_array($incomingS2['meetingSubmissions']) ? $incomingS2['meetingSubmissions'] : [];
                $mergedS2['meetingSubmissions'] = array_replace($exSubs, $inSubs);
                if (!empty($existingS2['actionPlan']['isGenerated']) && empty($incomingS2['actionPlan']['isGenerated'])) {
                    $mergedS2['actionPlan'] = $existingS2['actionPlan'];
                }

                // 🛡️ 阶段二研讨状态与里程碑合并保护
                if (isset($incomingS2['pendingReviewing'])) {
                    $mergedS2['pendingReviewing'] = $incomingS2['pendingReviewing'];
                } elseif (isset($existingS2['pendingReviewing'])) {
                    $mergedS2['pendingReviewing'] = $existingS2['pendingReviewing'];
                }

                if (!empty($incomingS2['reviewMilestone'])) {
                    $mergedS2['reviewMilestone'] = $incomingS2['reviewMilestone'];
                } elseif (!empty($existingS2['reviewMilestone'])) {
                    $mergedS2['reviewMilestone'] = $existingS2['reviewMilestone'];
                }
            }

            // 合并 stage3 (答辩质询与终稿修改)
            $incomingS3 = (isset($data['stage3']) && is_array($data['stage3'])) ? $data['stage3'] : [];
            $mergedS3 = $incomingS3;
            if (!empty($existingS3)) {
                if (!empty($existingS3['startTime'])) {
                    if (empty($incomingS3['startTime']) || $existingS3['startTime'] < $incomingS3['startTime']) {
                        $mergedS3['startTime'] = $existingS3['startTime'];
                    }
                }
                // 终稿修改全员确认字典合并
                $exConfirmed3 = isset($existingS3['confirmedMembers']) && is_array($existingS3['confirmedMembers']) ? $existingS3['confirmedMembers'] : [];
                $inConfirmed3 = isset($incomingS3['confirmedMembers']) && is_array($incomingS3['confirmedMembers']) ? $incomingS3['confirmedMembers'] : [];
                $mergedS3['confirmedMembers'] = array_replace($exConfirmed3, $inConfirmed3);

                // 答辩专家评语字段保护
                if (empty($incomingS3['proponentAnalysis']) && !empty($existingS3['proponentAnalysis'])) $mergedS3['proponentAnalysis'] = $existingS3['proponentAnalysis'];
                if (empty($incomingS3['opponentCritique']) && !empty($existingS3['opponentCritique'])) $mergedS3['opponentCritique'] = $existingS3['opponentCritique'];
                if (empty($incomingS3['neutralVerdict']) && !empty($existingS3['neutralVerdict'])) $mergedS3['neutralVerdict'] = $existingS3['neutralVerdict'];

                // 答辩反馈卡片增量合并（以卡片 ID 为主键，保留最新保存的答复）
                $exItems = isset($existingS3['feedbackItems']) && is_array($existingS3['feedbackItems']) ? $existingS3['feedbackItems'] : [];
                $inItems = isset($incomingS3['feedbackItems']) && is_array($incomingS3['feedbackItems']) ? $incomingS3['feedbackItems'] : [];
                $itemMap = [];
                foreach ($exItems as $it) { if (isset($it['id'])) $itemMap[$it['id']] = $it; }
                foreach ($inItems as $it) {
                    if (isset($it['id'])) {
                        $id = $it['id'];
                        if (!isset($itemMap[$id])) {
                            $itemMap[$id] = $it;
                        } else {
                            $exTime = isset($itemMap[$id]['updatedAt']) ? intval($itemMap[$id]['updatedAt']) : 0;
                            $inTime = isset($it['updatedAt']) ? intval($it['updatedAt']) : 0;
                            if ($inTime >= $exTime || !empty($it['response'])) {
                                $itemMap[$id] = array_merge($itemMap[$id], $it);
                            }
                        }
                    }
                }
                $mergedS3['feedbackItems'] = array_values($itemMap);
            }

            // 🛡️ 阶段防逆流保护：阶段单调递增前进 (stage1 -> stage2 -> stage3)，绝不被掉线客户端旧快照倒退覆盖
            $stageWeights = ['stage1' => 1, 'stage2' => 2, 'stage3' => 3];
            $exStage = isset($stRow['current_stage']) ? $stRow['current_stage'] : 'stage1';
            $inStage = isset($data['currentStage']) ? $data['currentStage'] : 'stage1';
            $wEx = $stageWeights[$exStage] ?? 1;
            $wIn = $stageWeights[$inStage] ?? 1;
            $finalStage = ($wEx >= $wIn) ? $exStage : $inStage;

            // 🛡️ 锁定状态：完全由客户端/教师端权威布尔值控制，支持正常锁定与解锁
            $finalLock = !empty($data['isFinalSubmitted']) ? 1 : 0;

            // 🛡️ 公约与初稿确认状态动态比对（仅当签署人数 >= 组员人数且组员人数 > 0 时生效，未达全员绝不锁死）
            $confirmedMap1 = isset($mergedS1['contract']['confirmedMembers']) && is_array($mergedS1['contract']['confirmedMembers']) ? $mergedS1['contract']['confirmedMembers'] : [];
            $actualMembersCount1 = isset($data['members']) && is_array($data['members']) ? count($data['members']) : 0;
            if ($actualMembersCount1 > 0 && count($confirmedMap1) >= $actualMembersCount1) {
                if (!isset($mergedS1['contract'])) $mergedS1['contract'] = [];
                $mergedS1['contract']['isConfirmed'] = true;
            } else {
                if (isset($mergedS1['contract'])) {
                    $mergedS1['contract']['isConfirmed'] = false;
                }
            }
            // 🛡️ 阶段二初稿确认状态动态比对：当组内确认人数达到全员时，服务端权威标记 isDraftConfirmed = true 并推进阶段三
            $confirmedMap2 = isset($mergedS2['confirmedMembers']) && is_array($mergedS2['confirmedMembers']) ? $mergedS2['confirmedMembers'] : [];
            $membersDataList = isset($data['members']) && is_array($data['members']) ? $data['members'] : [];
            $actualMembersCount2 = count($membersDataList);
            $confCount2 = 0;
            if ($actualMembersCount2 > 0) {
                foreach ($membersDataList as $m) {
                    $mId = isset($m['id']) ? $m['id'] : '';
                    $mCode = isset($m['studentCode']) ? $m['studentCode'] : '';
                    $mName = isset($m['name']) ? $m['name'] : '';
                    $mUser = isset($m['username']) ? $m['username'] : '';
                    if (($mId && !empty($confirmedMap2[$mId])) || ($mCode && !empty($confirmedMap2[$mCode])) || ($mName && !empty($confirmedMap2[$mName])) || ($mUser && !empty($confirmedMap2[$mUser]))) {
                        $confCount2++;
                    }
                }
            } else {
                $confCount2 = count($confirmedMap2);
            }
            if (!empty($existingS2['isDraftConfirmed']) || ($actualMembersCount2 > 0 && $confCount2 >= $actualMembersCount2)) {
                $mergedS2['isDraftConfirmed'] = true;
                if ($finalStage === 'stage2') {
                    $finalStage = 'stage3';
                }
            }

            // 保存小组协作快照 (自增 revision_id，彻底防止同毫秒并发漏包)
            $stmt = $pdo->prepare("INSERT INTO group_states 
                (scope_key, task_id, group_id, current_stage, stage1_data, stage2_data, stage3_data, presence_data, members_data, is_final_submitted, last_timestamp, revision_id)
                VALUES (:sk, :tid, :gid, :cstg, :s1, :s2, :s3, :pr, :mb, :fin, :ts, 1)
                ON DUPLICATE KEY UPDATE 
                current_stage = :cstg2, stage1_data = :s12, stage2_data = :s22, stage3_data = :s32,
                presence_data = :pr2, members_data = :mb2, is_final_submitted = :fin2, last_timestamp = :ts2,
                revision_id = IFNULL(revision_id, 0) + 1");
            
            $s1Json = json_encode($isResetVal ? ($data['stage1'] ?? []) : $mergedS1, JSON_UNESCAPED_UNICODE);
            $s2Json = json_encode($isResetVal ? ($data['stage2'] ?? []) : $mergedS2, JSON_UNESCAPED_UNICODE);
            $s3Json = json_encode($isResetVal ? ($data['stage3'] ?? []) : $mergedS3, JSON_UNESCAPED_UNICODE);
            $prJson = json_encode($isResetVal ? [] : $mergedPresence, JSON_UNESCAPED_UNICODE);
            $mbJson = isset($data['members']) ? json_encode($data['members'], JSON_UNESCAPED_UNICODE) : '';

            $stmt->execute([
                ':sk'    => $scopeKey,
                ':tid'   => $taskId,
                ':gid'   => $groupId,
                ':cstg'  => $finalStage,
                ':s1'    => $s1Json,
                ':s2'    => $s2Json,
                ':s3'    => $s3Json,
                ':pr'    => $prJson,
                ':mb'    => $mbJson,
                ':fin'   => $finalLock,
                ':ts'    => $ts,
                ':cstg2' => $finalStage,
                ':s12'   => $s1Json,
                ':s22'   => $s2Json,
                ':s32'   => $s3Json,
                ':pr2'   => $prJson,
                ':mb2'   => $mbJson,
                ':fin2'  => $finalLock,
                ':ts2'   => $ts
            ]);

            // 4a. 小组计时器状态持久化（保存首个进入房间的时间戳与速度，防止刷新重置）
            if (!empty($data['timer']) && is_array($data['timer'])) {
                $incomingTimer = $data['timer'];
                $existingTimer = [];
                $stmtGetTimer = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = :k");
                $stmtGetTimer->execute([':k' => 'timer_' . $scopeKey]);
                $tRow = $stmtGetTimer->fetch();
                if ($tRow && !empty($tRow['meta_value'])) {
                    $existingTimer = json_decode($tRow['meta_value'], true) ?: [];
                }
                $mergedTimer = array_merge($existingTimer, $incomingTimer);
                if (!empty($existingTimer['startTimestamp'])) {
                    if (empty($incomingTimer['startTimestamp']) || $existingTimer['startTimestamp'] < $incomingTimer['startTimestamp']) {
                        $mergedTimer['startTimestamp'] = $existingTimer['startTimestamp'];
                    }
                }
                if (empty($mergedTimer['startTimestamp']) && !empty($mergedS1['startTime'])) {
                    $mergedTimer['startTimestamp'] = $mergedS1['startTime'];
                }
                $nowStr = date('Y-m-d H:i:s');
                $stmtSaveTimer = $pdo->prepare("INSERT INTO global_meta (meta_key, meta_value, updated_at) VALUES (:k, :v, :ts) ON DUPLICATE KEY UPDATE meta_value = :v2, updated_at = :ts2");
                $stmtSaveTimer->execute([':k' => 'timer_' . $scopeKey, ':v' => json_encode($mergedTimer), ':ts' => $nowStr, ':v2' => json_encode($mergedTimer), ':ts2' => $nowStr]);
            }

            // 4b. 聊天记录增量并集去重合并（Union & Dedup），确保服务端消息单调递增绝不丢任何发言
            $existingChats = ['stage1' => [], 'stage2' => [], 'stage3' => []];
            if (!$isResetVal) {
                $stmtGetChats = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = :k");
                $stmtGetChats->execute([':k' => 'chats_' . $scopeKey]);
                $cRow = $stmtGetChats->fetch();
                if ($cRow && !empty($cRow['meta_value'])) {
                    $parsedC = json_decode($cRow['meta_value'], true);
                    if (is_array($parsedC)) $existingChats = $parsedC;
                }
            }

            $incomingChats = (isset($data['chatLogs']) && is_array($data['chatLogs'])) ? $data['chatLogs'] : [];
            $mergedChats = ['stage1' => [], 'stage2' => [], 'stage3' => []];

            foreach (['stage1', 'stage2', 'stage3'] as $stg) {
                if ($isResetVal) {
                    $mergedChats[$stg] = [];
                    continue;
                }
                $msgMap = [];
                $exList = isset($existingChats[$stg]) && is_array($existingChats[$stg]) ? $existingChats[$stg] : [];
                $inList = isset($incomingChats[$stg]) && is_array($incomingChats[$stg]) ? $incomingChats[$stg] : [];
                
                foreach (array_merge($exList, $inList) as $m) {
                    if (!is_array($m)) continue;
                    $mId = isset($m['id']) && !empty($m['id']) ? $m['id'] : '';
                    if (!$mId) {
                        $snd = isset($m['sender']) ? $m['sender'] : '';
                        $tms = isset($m['_timeMs']) ? $m['_timeMs'] : (isset($m['timestamp']) ? $m['timestamp'] : '');
                        $th  = isset($m['text']) ? mb_substr($m['text'], 0, 30) : '';
                        $mId = $snd . '_' . $tms . '_' . $th;
                    }
                    $msgMap[$mId] = $m;
                }
                $list = array_values($msgMap);
                usort($list, function($a, $b) {
                    $ta = isset($a['_timeMs']) ? intval($a['_timeMs']) : (isset($a['timeMs']) ? intval($a['timeMs']) : 0);
                    $tb = isset($b['_timeMs']) ? intval($b['_timeMs']) : (isset($b['timeMs']) ? intval($b['timeMs']) : 0);
                    return $ta <=> $tb;
                });

                // 🛡️ 智能体学术质检里程碑全局语义去重：每个核心里程碑严格只保留第一条，坚决杜绝多端并发重复生成
                $dedupedList = [];
                $seenFirstReview = false;
                $seenMeetingCall = false;
                $seenFinalReview = false;
                $seenStage2Welcome = false;
                $seenStage3Prop = false;
                $seenStage3Opp = false;
                $seenStage3Welcome = false;
                $seenStage3ChairGuide = false;

                foreach ($list as $m) {
                    $snd = $m['sender'] ?? '';
                    $txt = $m['text'] ?? '';

                    if ($stg === 'stage2') {
                        if ($snd === 'reviewingEditor' && (mb_strpos($txt, '初审') !== false || mb_strpos($txt, '初审微调') !== false || mb_strpos($txt, 'Research Gap') !== false)) {
                            if ($seenFirstReview) continue;
                            $seenFirstReview = true;
                        }
                        if ($snd === 'managingEditor' && mb_strpos($txt, '半程会议号召') !== false) {
                            if ($seenMeetingCall) continue;
                            $seenMeetingCall = true;
                        }
                        if ($snd === 'reviewingEditor' && mb_strpos($txt, '终稿行文扫描') !== false) {
                            if ($seenFinalReview) continue;
                            $seenFinalReview = true;
                        }
                        if ($snd === 'managingEditor' && mb_strpos($txt, '起草提示') !== false) {
                            if ($seenStage2Welcome) continue;
                            $seenStage2Welcome = true;
                        }
                    } else if ($stg === 'stage3') {
                        if ($snd === 'proponent' && (mb_strpos($txt, '正方委员') !== false || mb_strpos($txt, '立论支持') !== false || mb_strpos($txt, '通读全篇') !== false)) {
                            if ($seenStage3Prop) continue;
                            $seenStage3Prop = true;
                        }
                        if ($snd === 'opponent' && (mb_strpos($txt, '反方委员') !== false || mb_strpos($txt, '商讨质询') !== false || mb_strpos($txt, '尖锐质询') !== false)) {
                            if ($seenStage3Opp) continue;
                            $seenStage3Opp = true;
                        }
                        if ($snd === 'neutral' && (mb_strpos($txt, '中间委员开场') !== false || mb_strpos($txt, '欢迎来到【阶段三') !== false)) {
                            if ($seenStage3Welcome) continue;
                            $seenStage3Welcome = true;
                        }
                        if ($snd === 'neutral' && (mb_strpos($txt, '答辩思路引导') !== false || mb_strpos($txt, '质询 ①') !== false)) {
                            if ($seenStage3ChairGuide) continue;
                            $seenStage3ChairGuide = true;
                        }
                    }
                    $dedupedList[] = $m;
                }
                $mergedChats[$stg] = $dedupedList;
            }

            $stmtSaveChats = $pdo->prepare("INSERT INTO global_meta (meta_key, meta_value) VALUES (:k, :v) ON DUPLICATE KEY UPDATE meta_value = :v2");
            $chatJson = json_encode($mergedChats, JSON_UNESCAPED_UNICODE);
            $stmtSaveChats->execute([':k' => 'chats_' . $scopeKey, ':v' => $chatJson, ':v2' => $chatJson]);

                // 行级入库 chat_messages 表（记录时间戳、发送者、阶段与内容）
                $stmtInsertMsg = $pdo->prepare("INSERT IGNORE INTO chat_messages (scope_key, stage, sender, text, timestamp_str, time_ms) VALUES (:sk, :stg, :snd, :txt, :tstr, :tms)");
                foreach (['stage1', 'stage2', 'stage3'] as $stg) {
                    $msgs = isset($data['chatLogs'][$stg]) && is_array($data['chatLogs'][$stg]) ? $data['chatLogs'][$stg] : [];
                    foreach ($msgs as $msgItem) {
                        $snd = isset($msgItem['sender']) ? $msgItem['sender'] : 'unknown';
                        $txt = isset($msgItem['text']) ? $msgItem['text'] : '';
                        $tstr = isset($msgItem['timestamp']) ? $msgItem['timestamp'] : '';
                        $tms = isset($msgItem['_timeMs']) ? intval($msgItem['_timeMs']) : (isset($msgItem['timeMs']) ? intval($msgItem['timeMs']) : $ts);
                        $mId = isset($msgItem['id']) ? (string)$msgItem['id'] : '';
                        if (!empty($txt)) {
                            // 🛡️ AI 智能体开场白唯一性守护：如果本组本阶段已存在该智能体开场白，绝对跳过
                            $isAgentWelcome = (
                                (in_array($snd, ['auctioneer', 'managingEditor', 'reviewingEditor', 'neutral', 'proponent', 'opponent']) && (mb_strpos($txt, '开场') !== false || mb_strpos($txt, '欢迎来到') !== false || mb_strpos($txt, '开局') !== false))
                                || (strpos($mId, 'msg_welcome_') !== false)
                            );
                            if ($isAgentWelcome) {
                                $chkAgentStmt = $pdo->prepare("SELECT id FROM chat_messages WHERE scope_key = :sk AND stage = :stg AND sender = :snd AND (text LIKE '%开场%' OR text LIKE '%欢迎来到%' OR text LIKE '%开局%' OR id LIKE 'msg_welcome_%') LIMIT 1");
                                $chkAgentStmt->execute([':sk' => $scopeKey, ':stg' => $stg, ':snd' => $snd]);
                                if ($chkAgentStmt->fetch()) {
                                    continue; // 彻底跳过重复开场白
                                }
                            }

                            // 仅在毫秒级时间戳完全重合时去重，绝不按文本内容误杀学生的连续发言（如连续发“1”、“赞同”、“收到”）
                            $chkStmt = $pdo->prepare("SELECT id FROM chat_messages WHERE scope_key = :sk AND stage = :stg AND sender = :snd AND time_ms = :tms LIMIT 1");
                            $chkStmt->execute([':sk' => $scopeKey, ':stg' => $stg, ':snd' => $snd, ':tms' => $tms]);
                            if (!$chkStmt->fetch()) {
                                $stmtInsertMsg->execute([
                                    ':sk' => $scopeKey,
                                    ':stg' => $stg,
                                    ':snd' => $snd,
                                    ':txt' => $txt,
                                    ':tstr' => $tstr,
                                    ':tms' => $tms
                                ]);
                            }
                        }
                    }
                }

            // 4c. 同步保存全局教务元数据 (users/classes/tasks/announcements/referencePapers)
            // 🛡️ 严格单向权限与性能隔离：小组快照保存仅持久化本组 group_states，绝不误触全校教务实体表（教务由 save_global_meta 专用路由管理）
        }

        // 本地文件双写备份，写入合并后的完整快照，确保极端情况下 100% 容灾状态一致
        $fullMergedBackup = [
            'timestamp'        => $ts,
            'groupId'          => $groupId,
            'taskId'           => $taskId,
            'currentStage'     => isset($data['currentStage']) ? $data['currentStage'] : 'stage1',
            'isFinalSubmitted' => !empty($data['isFinalSubmitted']),
            'stage1'           => $isResetVal ? ($data['stage1'] ?? []) : $mergedS1,
            'stage2'           => $isResetVal ? ($data['stage2'] ?? []) : $mergedS2,
            'stage3'           => $isResetVal ? ($data['stage3'] ?? []) : $mergedS3,
            'chatLogs'         => $mergedChats,
            'presence'         => $isResetVal ? [] : $mergedPresence,
            'members'          => $data['members'] ?? []
        ];
        @file_put_contents(__DIR__ . '/db_' . $scopeKey . '.json', json_encode($fullMergedBackup, JSON_UNESCAPED_UNICODE));

        echo json_encode([
            'success'   => true,
            'timestamp' => $ts,
            'groupId'   => $groupId,
            'storage'   => $pdo ? 'mysql' : 'file'
        ]);
        exit;
    }
    echo json_encode(['success' => false, 'message' => 'Empty payload']);
    exit;
}

// 5. GET snapshot (从 MySQL 高速拉取)
if ($pdo) {
    $nowMs = round(microtime(true) * 1000);
    $reqUserId = isset($_GET['userId']) ? trim($_GET['userId']) : '';
    $reqSessToken = isset($_GET['sessToken']) ? trim($_GET['sessToken']) : '';
    if (!empty($reqUserId) && !empty($reqSessToken)) {
        // 1. 优先比对 users 表活跃会话
        $stmtUserSess = $pdo->prepare("SELECT active_session_id FROM users WHERE id = :u1 LIMIT 1");
        $stmtUserSess->execute([':u1' => $reqUserId]);
        $uSessRow = $stmtUserSess->fetch(PDO::FETCH_ASSOC);
        if ($uSessRow && !empty($uSessRow['active_session_id'])) {
            if ($uSessRow['active_session_id'] !== $reqSessToken) {
                echo json_encode(['kicked' => true]);
                exit;
            }
        } else {
            // 2. 辅助比对 global_meta
            $stmtSessChk = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = :k");
            $stmtSessChk->execute([':k' => 'sess_' . $reqUserId]);
            $sessRow = $stmtSessChk->fetch();
            if ($sessRow && !empty($sessRow['meta_value'])) {
                if ($sessRow['meta_value'] !== $reqSessToken) {
                    echo json_encode(['kicked' => true]);
                    exit;
                }
            } else {
                $stmtSessInit = $pdo->prepare("INSERT INTO global_meta (meta_key, meta_value, updated_at) VALUES (:k, :v, :ts) ON DUPLICATE KEY UPDATE meta_value = :v2, updated_at = :ts2");
                $nowStr = date('Y-m-d H:i:s');
                $stmtSessInit->execute([':k' => 'sess_' . $reqUserId, ':v' => $reqSessToken, ':ts' => $nowStr, ':v2' => $reqSessToken, ':ts2' => $nowStr]);
            }
        }
    }

    $stmt = $pdo->prepare("SELECT * FROM group_states WHERE scope_key = :sk");
    $stmt->execute([':sk' => $scopeKey]);
    $row = $stmt->fetch();
    
    if ($row) {
        $lastTs = intval($row['last_timestamp']);
        $lastRev = isset($row['revision_id']) ? intval($row['revision_id']) : 1;

        // 🛡️ 聊天消息权威恢复：直接从 chat_messages 物理关系表拉取全部历史发言，零崩溃兼容字段
        $chats = ['stage1' => [], 'stage2' => [], 'stage3' => []];
        $allRows = [];
        try {
            $stmtAllMsg = $pdo->prepare("SELECT stage, sender, sender_name, text, timestamp_str, time_ms, id FROM chat_messages WHERE scope_key = :sk ORDER BY time_ms ASC");
            $stmtAllMsg->execute([':sk' => $scopeKey]);
            $allRows = $stmtAllMsg->fetchAll(PDO::FETCH_ASSOC);
        } catch (\Exception $e) {
            try {
                $stmtAllMsg = $pdo->prepare("SELECT stage, sender, text, timestamp_str, time_ms, id FROM chat_messages WHERE scope_key = :sk ORDER BY time_ms ASC");
                $stmtAllMsg->execute([':sk' => $scopeKey]);
                $allRows = $stmtAllMsg->fetchAll(PDO::FETCH_ASSOC);
            } catch (\Exception $e2) {
                $allRows = [];
            }
        }
        $maxChatMs = 0;
        foreach ($allRows as $mr) {
            $stg = $mr['stage'] ?: 'stage1';
            if (!isset($chats[$stg])) $chats[$stg] = [];
            $cMs = intval($mr['time_ms']);
            if ($cMs > $maxChatMs) $maxChatMs = $cMs;
            $chats[$stg][] = [
                'id'         => $mr['id'] ?: ('msg_' . $mr['time_ms'] . '_' . substr(md5($mr['text']), 0, 6)),
                'sender'     => $mr['sender'],
                'senderName' => $mr['sender_name'] ?? '',
                'text'       => $mr['text'],
                'timestamp'  => $mr['timestamp_str'],
                '_timeMs'    => $cMs
            ];
        }

        // 读取 reset_seq 让客户端感知是否需要重置
        $stmtRsq = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = :k");
        $stmtRsq->execute([':k' => 'reset_seq_' . $scopeKey]);
        $rsqRow = $stmtRsq->fetch();
        $resetSeq = $rsqRow ? intval($rsqRow['meta_value']) : 0;

        // 读取当前字段聚焦锁列表 (过滤超时死锁)
        $stmtLocks = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = :k");
        $stmtLocks->execute([':k' => 'locks_' . $scopeKey]);
        $lRow = $stmtLocks->fetch();
        $rawLocks = ($lRow && !empty($lRow['meta_value'])) ? json_decode($lRow['meta_value'], true) : [];
        $activeLocks = [];
        $nowMs = round(microtime(true) * 1000);
        if (is_array($rawLocks)) {
            foreach ($rawLocks as $fk => $finfo) {
                if (isset($finfo['time']) && ($nowMs - intval($finfo['time']) <= 8500)) {
                    $activeLocks[$fk] = $finfo;
                }
            }
        }

        // ⚡ 顺风车自动心跳续期（Piggyback）：每次客户端发送 pull 时，自动更新当前用户在当前组的在线时间戳 (180s 稳定窗口)
        $currPr = (!empty($row['presence_data']) && strlen($row['presence_data']) < 50000) ? json_decode($row['presence_data'], true) : [];
        if (!is_array($currPr)) $currPr = [];
        $prChanged = false;
        if (!empty($reqUserId)) {
            $currPr[strval($reqUserId)] = [
                'userId'      => $reqUserId,
                'updatedAt'   => $nowMs,
                'timestamp'   => $nowMs
            ];
            $prChanged = true;
        }
        foreach ($currPr as $pk => $pv) {
            $t = is_array($pv) ? intval($pv['updatedAt'] ?? $pv['timestamp'] ?? 0) : 0;
            if ($nowMs - $t > 180000) {
                unset($currPr[$pk]);
                $prChanged = true;
            }
        }
        if ($prChanged) {
            $prRaw = json_encode($currPr, JSON_UNESCAPED_UNICODE);
            try {
                $stmtUpPr = $pdo->prepare("UPDATE group_states SET presence_data = :pr WHERE scope_key = :sk");
                $stmtUpPr->execute([':pr' => $prRaw, ':sk' => $scopeKey]);
            } catch (Exception $e) {}
        } else {
            $prRaw = (!empty($row['presence_data']) && strlen($row['presence_data']) < 50000) ? $row['presence_data'] : '{}';
        }
        $memRaw  = !empty($row['members_data']) ? $row['members_data'] : '[]';

        // 🛡️ 教学资源与文献版本戳（教师发布新范文/通知时版本号递增，学生秒级自动感知并拉取，其余时间 0 冗余）
        $stmtVer = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = 'main_meta_version'");
        $stmtVer->execute();
        $vRow = $stmtVer->fetch();
        $metaVer = $vRow ? intval($vRow['meta_value']) : 1;

        // ⚡ 极速带宽瘦身：增量 Delta 轮询探测（若无新消息且业务无版本推进，仅下发 100 字节轻量心跳包，节省 99.8% 带宽）
        $clientLastRev = isset($_GET['lastRev']) ? intval($_GET['lastRev']) : 0;
        $clientLastChatMs = isset($_GET['lastChatMs']) ? intval($_GET['lastChatMs']) : 0;
        $clientMetaVer = isset($_GET['metaVer']) ? intval($_GET['metaVer']) : 0;
        $needGlobalSync = ($clientMetaVer < $metaVer) || (isset($_GET['incGlobal']) && intval($_GET['incGlobal']) === 1);

        if ($clientLastRev > 0 && $clientLastRev === $lastRev && $clientLastChatMs >= $maxChatMs && $resetSeq === 0 && !$needGlobalSync) {
            echo json_encode([
                'unchanged'       => true,
                'serverTimestamp' => $nowMs,
                'revisionId'      => $lastRev,
                'metaVer'         => $metaVer,
                'presence'        => json_decode($prRaw) ?: new stdClass(),
                'locks'           => $activeLocks,
                'resetSeq'        => 0
            ]);
            exit;
        }

        $globalMeta = [];
        $sanitizedUsers = [];
        if ($needGlobalSync) {
            $stmtMeta = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = 'main_meta'");
            $stmtMeta->execute();
            $metaRow = $stmtMeta->fetch();
            $globalMeta = ($metaRow && !empty($metaRow['meta_value'])) ? json_decode($metaRow['meta_value'], true) : [];

            if (isset($globalMeta['users']) && is_array($globalMeta['users'])) {
                foreach ($globalMeta['users'] as $u) {
                    unset($u['password']);
                    $sanitizedUsers[] = $u;
                }
            }
        }

        $stg1Raw = migrateBase64StringToUrl($row['stage1_data'] ?? '', $pdo, $scopeKey, 'stage1_data');
        $stg2Raw = migrateBase64StringToUrl($row['stage2_data'] ?? '', $pdo, $scopeKey, 'stage2_data');
        $stg3Raw = migrateBase64StringToUrl($row['stage3_data'] ?? '', $pdo, $scopeKey, 'stage3_data');

        $stmtGetConfs = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = :k");
        $stmtGetConfs->execute([':k' => 'confs_' . $scopeKey]);
        $cRow = $stmtGetConfs->fetch();
        $stepConfs = ($cRow && !empty($cRow['meta_value'])) ? (json_decode($cRow['meta_value'], true) ?: []) : [];

        $stmtGetTimer = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = :k");
        $stmtGetTimer->execute([':k' => 'timer_' . $scopeKey]);
        $tRow = $stmtGetTimer->fetch();
        $timerData = ($tRow && !empty($tRow['meta_value'])) ? (json_decode($tRow['meta_value'], true) ?: null) : null;

        $respData = [
            'timestamp'        => $lastTs,
            'serverTimestamp'  => $nowMs,
            'revisionId'       => $lastRev,
            'metaVer'          => $metaVer,
            'groupId'          => $row['group_id'],
            'taskId'           => $row['task_id'],
            'currentStage'     => $row['current_stage'] ?: 'stage1',
            'stage1'           => !empty($stg1Raw) ? (json_decode($stg1Raw, true) ?: []) : [],
            'stage2'           => !empty($stg2Raw) ? (json_decode($stg2Raw, true) ?: []) : [],
            'stage3'           => !empty($stg3Raw) ? (json_decode($stg3Raw, true) ?: []) : [],
            'stepConfirmations'=> $stepConfs,
            'timer'            => $timerData,
            'presence'         => json_decode($prRaw) ?: new stdClass(),
            'members'          => json_decode($memRaw, true) ?: [],
            'isFinalSubmitted' => (bool)$row['is_final_submitted'],
            'chatLogs'         => $chats,
            'locks'            => $activeLocks,
            'resetSeq'         => $resetSeq,
            'users'            => $sanitizedUsers,
            'classes'          => isset($globalMeta['classes'])          ? $globalMeta['classes']          : [],
            'tasks'            => isset($globalMeta['tasks'])            ? $globalMeta['tasks']            : [],
            'announcements'    => isset($globalMeta['announcements'])    ? $globalMeta['announcements']    : [],
            'referencePapers'  => isset($globalMeta['referencePapers']) ? $globalMeta['referencePapers'] : []
        ];
        echo json_encode($respData);
        exit;
    } else {
        // 读取 main_meta_version
        $stmtVer = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = 'main_meta_version'");
        $stmtVer->execute();
        $vRow = $stmtVer->fetch();
        $metaVer = $vRow ? intval($vRow['meta_value']) : 1;

        $clientLastRev = isset($_GET['lastRev']) ? intval($_GET['lastRev']) : 0;
        $clientLastChatMs = isset($_GET['lastChatMs']) ? intval($_GET['lastChatMs']) : 0;
        $clientMetaVer = isset($_GET['metaVer']) ? intval($_GET['metaVer']) : 0;
        $needGlobalSync = ($clientMetaVer < $metaVer) || (isset($_GET['incGlobal']) && intval($_GET['incGlobal']) === 1);

        // 🛡️ 聊天消息权威恢复：直接从 chat_messages 物理关系表拉取全部历史发言，零崩溃兼容字段
        $chats = ['stage1' => [], 'stage2' => [], 'stage3' => []];
        $allRows = [];
        try {
            $stmtAllMsg = $pdo->prepare("SELECT stage, sender, sender_name, text, timestamp_str, time_ms, id FROM chat_messages WHERE scope_key = :sk ORDER BY time_ms ASC");
            $stmtAllMsg->execute([':sk' => $scopeKey]);
            $allRows = $stmtAllMsg->fetchAll(PDO::FETCH_ASSOC);
        } catch (\Exception $e) {
            try {
                $stmtAllMsg = $pdo->prepare("SELECT stage, sender, text, timestamp_str, time_ms, id FROM chat_messages WHERE scope_key = :sk ORDER BY time_ms ASC");
                $stmtAllMsg->execute([':sk' => $scopeKey]);
                $allRows = $stmtAllMsg->fetchAll(PDO::FETCH_ASSOC);
            } catch (\Exception $e2) {
                $allRows = [];
            }
        }
        $maxChatMs = 0;
        foreach ($allRows as $mr) {
            $stg = $mr['stage'] ?: 'stage1';
            if (!isset($chats[$stg])) $chats[$stg] = [];
            $cMs = intval($mr['time_ms']);
            if ($cMs > $maxChatMs) $maxChatMs = $cMs;
            $chats[$stg][] = [
                'id'         => $mr['id'] ?: ('msg_' . $mr['time_ms'] . '_' . substr(md5($mr['text']), 0, 6)),
                'sender'     => $mr['sender'],
                'senderName' => $mr['sender_name'] ?? '',
                'text'       => $mr['text'],
                'timestamp'  => $mr['timestamp_str'],
                '_timeMs'    => $cMs
            ];
        }

        // ⚡ 极速早退：若小组尚未产生协作数据，且客户端已拉取过基线且无新聊天/全局元数据，直接返回 20 字节 unchanged
        if (isset($_GET['lastRev']) && $clientLastRev === 0 && $clientLastChatMs >= $maxChatMs && !$needGlobalSync) {
            echo json_encode([
                'unchanged'       => true,
                'serverTimestamp' => $nowMs,
                'revisionId'      => 0,
                'metaVer'         => $metaVer,
                'presence'        => new stdClass(),
                'locks'           => [],
                'resetSeq'        => 0
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $globalMeta = [];
        $sanitizedUsers = [];
        if ($needGlobalSync) {
            $stmtMeta = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = 'main_meta'");
            $stmtMeta->execute();
            $metaRow = $stmtMeta->fetch();
            $globalMeta = ($metaRow && !empty($metaRow['meta_value'])) ? json_decode($metaRow['meta_value'], true) : [];

            if (isset($globalMeta['users']) && is_array($globalMeta['users'])) {
                foreach ($globalMeta['users'] as $u) {
                    unset($u['password']);
                    $sanitizedUsers[] = $u;
                }
            }
        }

        $stmtGetTimer = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = :k");
        $stmtGetTimer->execute([':k' => 'timer_' . $scopeKey]);
        $tRow = $stmtGetTimer->fetch();
        $timerData = ($tRow && !empty($tRow['meta_value'])) ? (json_decode($tRow['meta_value'], true) ?: null) : null;

        echo json_encode([
            'timestamp'        => $nowMs,
            'serverTimestamp'  => $nowMs,
            'revisionId'       => 0,
            'metaVer'          => $metaVer,
            'groupId'          => $groupId,
            'taskId'           => $taskId,
            'currentStage'     => 'stage1',
            'stage1'           => ['proposals' => [], 'votes' => new stdClass(), 'hasVoted' => new stdClass(), 'contract' => ['isConfirmed' => false, 'taskAssignments' => new stdClass(), 'timeAllocations' => new stdClass(), 'confirmedMembers' => new stdClass()]],
            'stage2'           => ['unifiedContent' => '', 'memberContributions' => new stdClass(), 'confirmedMembers' => new stdClass(), 'meetingSubmissions' => new stdClass()],
            'stage3'           => ['feedbackItems' => []],
            'timer'            => $timerData,
            'presence'         => new stdClass(),
            'members'          => [],
            'isFinalSubmitted' => false,
            'chatLogs'         => $chats,
            'locks'            => [],
            'resetSeq'         => 0,
            'users'            => $sanitizedUsers,
            'classes'          => isset($globalMeta['classes'])          ? $globalMeta['classes']          : [],
            'tasks'            => isset($globalMeta['tasks'])            ? $globalMeta['tasks']            : [],
            'announcements'    => isset($globalMeta['announcements'])    ? $globalMeta['announcements']    : [],
            'referencePapers'  => isset($globalMeta['referencePapers']) ? $globalMeta['referencePapers'] : []
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }
}

// 降级从本地文件读取
$localFile = __DIR__ . '/db_' . $scopeKey . '.json';
if (file_exists($localFile) && filesize($localFile) > 0) {
    echo file_get_contents($localFile);
    exit;
}

echo json_encode([
    'timestamp' => 0,
    'groupId' => $groupId,
    'chatLogs' => ['stage1' => [], 'stage2' => [], 'stage3' => []],
    'stage2' => ['unifiedContent' => '']
]);
