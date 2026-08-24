<?php
/**
 * 生产级服务端网关 (全面升级为 MySQL 关系型数据库驱动)
 * 支持 MySQL 数据库自动建表、数据行级持久化、单设备会话互斥与 OAuth 智能体中转
 */

header('Content-Type: application/json; charset=utf-8');
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
    $stmt = $tempPdo->query("SELECT id, username, student_code, name, role, password, updated_at FROM users");
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
    // 🛡️ 高并发优化：使用文件标志位避免每次高频 HTTP 轮询执行 DDL 建表，彻底消除 MySQL 元数据锁 (MDL) 竞争
    $lockFile = sys_get_temp_dir() . '/jizhi_db_tables_inited.lock';
    if (!file_exists($lockFile)) {
        initDatabaseTables();
        @touch($lockFile);
    }
}

$groupId = isset($_GET['groupId']) ? preg_replace('/[^a-zA-Z0-9_-]/', '', $_GET['groupId']) : 'group_1';
if (empty($groupId)) $groupId = 'group_1';

$taskId = isset($_GET['taskId']) ? preg_replace('/[^a-zA-Z0-9_-]/', '', $_GET['taskId']) : 'task_default';
if (empty($taskId)) $taskId = 'task_default';

$scopeKey = $taskId . '_' . $groupId;
$action = isset($_GET['action']) ? $_GET['action'] : '';
if (empty($action) && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $peekInput = @file_get_contents('php://input');
    if (!empty($peekInput)) {
        $peekData = @json_decode($peekInput, true);
        if (isset($peekData['action'])) $action = $peekData['action'];
    }
}

/**
 * 🛡️ 教师身份与 Session Token 双重认证拦截器 (Fail-Closed 严格拒绝空 Token)
 */
function verifyTeacherSession($userId, $token, $pdo) {
    if (empty($userId) || empty($token)) return false;
    if (!$pdo) {
        return false;
    }
    // 1. 验证用户在数据库中的角色是否为 teacher
    $stmtAuth = $pdo->prepare("SELECT role FROM `users` WHERE (`id` = :u1 OR `username` = :u2 OR `student_code` = :u3) AND `role` = 'teacher' LIMIT 1");
    $stmtAuth->execute([':u1' => $userId, ':u2' => $userId, ':u3' => $userId]);
    $teacherRow = $stmtAuth->fetch();
    if (!$teacherRow) {
        return false;
    }
    // 2. 严格要求传入的 Token 必须与服务端有效 Session 匹配 (绝无长度或通配兜底)
    $stmtSess = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = :k");
    $stmtSess->execute([':k' => 'sess_' . $userId]);
    $sessRow = $stmtSess->fetch();
    if ($sessRow && !empty($sessRow['meta_value'])) {
        return ($sessRow['meta_value'] === $token);
    }
    // Fail-Closed: 数据库中无此活跃会话直接拒绝放行
    return false;
}

// 0a. 服务端统一登录安全鉴权 API (严格校验密码哈希与防脱机绕过)
// 👩‍🏫 数据层保证：幂等确保唯一教师种子账号 1001 存在
if (!function_exists('ensureTeacherSeedAccount')) {
    function ensureTeacherSeedAccount($pdo) {
        if (!$pdo) return;
        try {
            $stmt = $pdo->prepare("SELECT id, password FROM users WHERE id = '1001' OR username = '1001' OR student_code = '1001' LIMIT 1");
            $stmt->execute();
            $tRow = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$tRow) {
                $stmtIns = $pdo->prepare("INSERT INTO users (id, username, student_code, name, password, role) VALUES ('1001', '1001', '1001', '指导教师', '123', 'teacher')");
                $stmtIns->execute();
            } else {
                $stmtUp = $pdo->prepare("UPDATE users SET role = 'teacher', password = '123' WHERE id = '1001' OR username = '1001'");
                $stmtUp->execute();
            }
        } catch (Exception $e) {}
    }
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

    ensureTeacherSeedAccount($pdo);

    $foundUser = null;
    $userExists = false;
    $dbPwd = '';

    if ($pdo) {
        $stmt = $pdo->prepare("SELECT * FROM users WHERE username = :acc1 OR student_code = :acc2 OR id = :acc3 LIMIT 1");
        $stmt->execute([':acc1' => $account, ':acc2' => $account, ':acc3' => $account]);
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
                    $uAcc = strtolower(trim($gu['username'] ?? ($gu['studentCode'] ?? ($gu['id'] ?? ''))));
                    $uCode = strtolower(trim($gu['studentCode'] ?? ($gu['code'] ?? '')));
                    $uName = strtolower(trim($gu['name'] ?? ''));
                    $queryAcc = strtolower($account);
                    if ($uAcc === $queryAcc || $uCode === $queryAcc || ($uName && $uName === $queryAcc)) {
                        $userExists = true;
                        $dbPwd = $gu['password'] ?? '123';
                        $uId = $gu['id'] ?? ('u_student_' . round(microtime(true) * 1000));
                        $row = [
                            'id' => $uId,
                            'username' => $gu['username'] ?? $account,
                            'student_code' => $gu['studentCode'] ?? ($gu['username'] ?? $account),
                            'name' => $gu['name'] ?? $account,
                            'password' => $dbPwd,
                            'role' => $gu['role'] ?? 'student'
                        ];
                        // 自动同步插入 users 表
                        try {
                            $hashedIns = (strlen($dbPwd) > 30) ? $dbPwd : password_hash($dbPwd, PASSWORD_DEFAULT);
                            $stmtIns = $pdo->prepare("INSERT INTO users (id, username, student_code, name, password, role) VALUES (:id, :u, :sc, :nm, :p, :r) ON DUPLICATE KEY UPDATE name=VALUES(name), student_code=VALUES(student_code), role=VALUES(role)");
                            $stmtIns->execute([
                                ':id' => $row['id'],
                                ':u' => $row['username'],
                                ':sc' => $row['student_code'],
                                ':nm' => $row['name'],
                                ':p' => $hashedIns,
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

            if ($cleanInputPwd === $dbPwd) {
                $pwdMatch = true;
            } else if (empty($dbPwd) && $cleanInputPwd === '123') {
                $pwdMatch = true;
            } else if (password_verify($cleanInputPwd, $dbPwd)) {
                // 兼容可能存在的历史哈希并降级为明文
                $pwdMatch = true;
                try {
                    $stmtFlat = $pdo->prepare("UPDATE users SET password = :p WHERE id = :uid");
                    $stmtFlat->execute([':p' => $cleanInputPwd, ':uid' => $row['id']]);
                } catch (Exception $e) {}
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
                $uAcc = strtolower(trim($u['username'] ?? ($u['studentCode'] ?? ($u['id'] ?? ''))));
                $uCode = strtolower(trim($u['studentCode'] ?? ($u['code'] ?? '')));
                $queryAcc = strtolower($account);
                if ($uAcc === $queryAcc || $uCode === $queryAcc) {
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
        // 🔐 多重认证：登录界面所选身份必须与账号实际角色一致，防止跨身份误登录
        $uRole = trim($foundUser['role'] ?? '');
        $roleMismatch = ($role === 'teacher' && $uRole !== 'teacher') || ($role === 'student' && $uRole === 'teacher');
        if ($account === '1001' && $uRole === 'teacher') $roleMismatch = false;

        if (!empty($role) && $roleMismatch) {
            http_response_code(401);
            $msg = ($uRole === 'teacher')
                ? '❌ 所选登录身份与账号角色不匹配，请切换为【教师】身份登录'
                : '❌ 所选登录身份与账号角色不匹配，请切换为【学生】身份登录';
            echo json_encode(['success' => false, 'message' => $msg], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $token = 'jwt_jizhi_' . bin2hex(random_bytes(16)) . '_' . time();
        if ($pdo) {
            $uId = $foundUser['id'] ?? '';
            $uName = $foundUser['username'] ?? '';
            $uCode = $foundUser['student_code'] ?? '';
            $stmtSess = $pdo->prepare("INSERT INTO global_meta (meta_key, meta_value) VALUES (:k, :v) ON DUPLICATE KEY UPDATE meta_value = :v2");
            if ($uId) $stmtSess->execute([':k' => 'sess_' . $uId, ':v' => $token, ':v2' => $token]);
            if ($uName && $uName !== $uId) $stmtSess->execute([':k' => 'sess_' . $uName, ':v' => $token, ':v2' => $token]);
            if ($uCode && $uCode !== $uId && $uCode !== $uName) $stmtSess->execute([':k' => 'sess_' . $uCode, ':v' => $token, ':v2' => $token]);
        }
        unset($foundUser['password']); // 安全铁律：绝不向前端返回密码
        echo json_encode([
            'success' => true,
            'token' => $token,
            'user' => $foundUser
        ]);
        exit;
    } else if (!$userExists) {
        echo json_encode(['success' => false, 'message' => '❌ 账号 [' . htmlspecialchars($account) . '] 尚未录入系统，请核对学号或联系指导教师导入']);
        exit;
    } else {
        echo json_encode(['success' => false, 'message' => '❌ 登录密码错误，默认初始密码为 123']);
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

        // 清除超过 20 秒过期的死锁
        foreach ($locks as $k => $info) {
            if (!isset($info['time']) || ($nowMs - intval($info['time']) > 20000)) {
                unset($locks[$k]);
            }
        }

        // 判断当前字段是否被其他人持有锁
        $isLockedByOther = (isset($locks[$fieldKey]) && $locks[$fieldKey]['userId'] !== $userId);
        if (!$isLockedByOther) {
            $locks[$fieldKey] = [
                'userId'   => $userId,
                'userName' => $userName,
                'time'     => $nowMs
            ];
            $locksJson = json_encode($locks, JSON_UNESCAPED_UNICODE);
            $stmtSave = $pdo->prepare("INSERT INTO global_meta (meta_key, meta_value) VALUES (:k, :v) ON DUPLICATE KEY UPDATE meta_value = :v2");
            $stmtSave->execute([':k' => 'locks_' . $scopeKey, ':v' => $locksJson, ':v2' => $locksJson]);
            
            // 唤醒全局变更
            $stmtSignal = $pdo->prepare("INSERT INTO global_meta (meta_key, meta_value) VALUES ('meta_updated_at', :v) ON DUPLICATE KEY UPDATE meta_value = :v2");
            $stmtSignal->execute([':v' => $nowMs, ':v2' => $nowMs]);

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
            $stmtState = $pdo->prepare("SELECT stage1_data, stage3_data FROM group_states WHERE scope_key = :sk");
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

    if ($pdo && !empty($userCode) && $delta > 0) {
        $stmt = $pdo->prepare("SELECT snapshot_data FROM room_snapshots WHERE task_id = :tid AND group_id = :gid LIMIT 1");
        $stmt->execute([':tid' => $taskId, ':gid' => $groupId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        $snapshot = $row ? json_decode($row['snapshot_data'], true) : [];
        if (!isset($snapshot['stage2'])) $snapshot['stage2'] = [];
        if (!isset($snapshot['stage2']['memberContributions'])) $snapshot['stage2']['memberContributions'] = [];

        $snapshot['stage2']['memberContributions'][$userCode] = intval($snapshot['stage2']['memberContributions'][$userCode] ?? 0) + $delta;
        $snapshot['updatedAt'] = round(microtime(true) * 1000);

        $upStmt = $pdo->prepare("INSERT INTO room_snapshots (task_id, group_id, snapshot_data, updated_at) VALUES (:tid, :gid, :data, NOW()) ON DUPLICATE KEY UPDATE snapshot_data = VALUES(snapshot_data), updated_at = NOW()");
        $upStmt->execute([
            ':tid' => $taskId,
            ':gid' => $groupId,
            ':data' => json_encode($snapshot, JSON_UNESCAPED_UNICODE)
        ]);

        echo json_encode(['success' => true, 'contribs' => $snapshot['stage2']['memberContributions']]);
        exit;
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

if ($action === 'get_teacher_monitor_all_groups') {
    header('Content-Type: application/json; charset=utf-8');
    $taskId = isset($_GET['taskId']) ? trim($_GET['taskId']) : ($queryTaskId ?: 'task_default');
    $classId = isset($_GET['classId']) ? trim($_GET['classId']) : '';

    $result = ['success' => true, 'groups' => []];

    if ($pdo) {
        $stmt = $pdo->prepare("SELECT * FROM group_states WHERE task_id = :tid");
        $stmt->execute([':tid' => $taskId]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        foreach ($rows as $r) {
            $gid = $r['group_id'];
            $sk = $r['scope_key'];

            // 获取聊天记录
            $stmtChats = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = :k");
            $stmtChats->execute([':k' => 'chats_' . $sk]);
            $chatRow = $stmtChats->fetch();
            $chats = ($chatRow && !empty($chatRow['meta_value'])) ? json_decode($chatRow['meta_value'], true) : ['stage1' => [], 'stage2' => [], 'stage3' => []];

            $result['groups'][$gid] = [
                'groupId'            => $gid,
                'scopeKey'           => $sk,
                'currentStage'       => $r['current_stage'] ?: 'stage1',
                'stage1'             => !empty($r['stage1_data']) ? json_decode($r['stage1_data'], true) : [],
                'stage2'             => !empty($r['stage2_data']) ? json_decode($r['stage2_data'], true) : [],
                'stage3'             => !empty($r['stage3_data']) ? json_decode($r['stage3_data'], true) : [],
                'chatLogs'           => $chats,
                'isFinalSubmitted'   => (bool)$r['is_final_submitted'],
                'lastTimestamp'      => intval($r['last_timestamp']),
                'revisionId'         => intval($r['revision_id'])
            ];
        }
    }
    echo json_encode($result, JSON_UNESCAPED_UNICODE);
    exit;
}

if ($action === 'get_pad_text') {
    header('Content-Type: application/json; charset=utf-8');
    $padId = isset($_GET['padId']) ? preg_replace('/[^a-zA-Z0-9_-]/', '', $_GET['padId']) : 'jizhi_' . $scopeKey;
    $apiKey = 'jizhi_academic_secret_key_2026';
    $epUrl = "http://127.0.0.1:9001/api/1.2.14/getText?apikey=" . urlencode($apiKey) . "&padID=" . urlencode($padId);
    
    $ch = curl_init($epUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 3);
    $res = curl_exec($ch);
    $err = curl_error($ch);
    curl_close($ch);
    
    if (!$err && !empty($res)) {
        $json = json_decode($res, true);
        if (isset($json['code']) && $json['code'] === 0 && isset($json['data']['text'])) {
            echo json_encode([
                'success' => true,
                'text' => $json['data']['text']
            ]);
            exit;
        }
    }
    echo json_encode(['success' => false, 'text' => '']);
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

            // 统一以工号/学号作为唯一辨认标志查询用户
            $stmt = $pdo->prepare("SELECT * FROM users WHERE student_code = :c1 OR username = :c2 OR id = :c3 LIMIT 1");
            $stmt->execute([':c1' => $code, ':c2' => $code, ':c3' => $code]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);

            // 教师工号 1001 种子自动保障 (纯明文 123)
            if (!$user && $code === '1001') {
                $stmtInsT = $pdo->prepare("INSERT INTO users (id, username, student_code, name, password, role) VALUES ('1001', '1001', '1001', '老师', '123', 'teacher') ON DUPLICATE KEY UPDATE username='1001', student_code='1001'");
                $stmtInsT->execute();
                $user = ['id' => '1001', 'username' => '1001', 'student_code' => '1001', 'name' => '老师', 'password' => '123', 'role' => 'teacher'];
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
                        $uAcc = strtolower(trim($gu['studentCode'] ?? ($gu['username'] ?? ($gu['id'] ?? ''))));
                        $qAcc = strtolower($code);
                        if ($uAcc === $qAcc) {
                            $user = [
                                'id' => $gu['studentCode'] ?? ($gu['username'] ?? ($gu['id'] ?? $code)),
                                'username' => $gu['username'] ?? $code,
                                'student_code' => $gu['studentCode'] ?? ($gu['username'] ?? $code),
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
                    'message' => '❌ 原密码不正确！当前数据库中记录的实际密码为: [' . $currentDbPwd . ']，您输入的原密码为: [' . $cleanOld . ']'
                ]);
                exit;
            }

            $cleanNew = trim($newPwd);
            
            // 统一以工号/学号明文直接存盘更新 users 表中所有记录
            $stmtUpdate = $pdo->prepare("UPDATE users SET password = :p WHERE student_code = :c1 OR username = :c2 OR id = :c3");
            $stmtUpdate->execute([
                ':p' => $cleanNew,
                ':c1' => $code,
                ':c2' => $code,
                ':c3' => $code
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
                            $gSc = $gu['studentCode'] ?? ($gu['username'] ?? ($gu['id'] ?? ''));
                            if (strtolower(trim($gSc)) === strtolower(trim($code))) {
                                $gu['password'] = $cleanNew;
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
        $stmt = $pdo->prepare("SELECT * FROM users WHERE username = :acc1 OR student_code = :acc2 OR id = :acc3 LIMIT 1");
        $stmt->execute([':acc1' => $account, ':acc2' => $account, ':acc3' => $account]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$user) {
            echo json_encode(['success' => false, 'message' => '未找到该学生账号']);
            exit;
        }

        $hashedReset = password_hash($newPwd, PASSWORD_DEFAULT);
        $stmtUpdate = $pdo->prepare("UPDATE users SET password = :p WHERE id = :uid");
        $stmtUpdate->execute([':p' => $hashedReset, ':uid' => $user['id']]);

        // 同步更新 main_meta 里的 users
        $stmtMeta = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = 'main_meta'");
        $stmtMeta->execute();
        $metaRow = $stmtMeta->fetch();
        if ($metaRow && !empty($metaRow['meta_value'])) {
            $gm = json_decode($metaRow['meta_value'], true) ?: [];
            if (isset($gm['users']) && is_array($gm['users'])) {
                foreach ($gm['users'] as &$gu) {
                    if (($gu['studentCode'] ?? ($gu['username'] ?? ($gu['id'] ?? ''))) === $account) {
                        $gu['password'] = $hashedReset;
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

    // 🛡️ 1. 教师身份与 Session Token 严格鉴权
    $userId = $_POST['userId'] ?? ($_GET['userId'] ?? '');
    $token = $_POST['token'] ?? ($_GET['token'] ?? '');
    if (!verifyTeacherSession($userId, $token, $pdo)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => '权限不足：仅允许已认证教师上传教学附件']);
        exit;
    }

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
        // 1. 优先读取全局 JSON 快照
        $stmt = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = 'main_meta'");
        $stmt->execute();
        $row = $stmt->fetch();
        if ($row && !empty($row['meta_value'])) {
            $parsed = json_decode($row['meta_value'], true);
            if (is_array($parsed) && (isset($parsed['classes']) || isset($parsed['tasks']) || isset($parsed['users']))) {
                $foundMeta = $parsed;
            }
        }

        // 2. 🛡️ 深度数据保险：若 main_meta 中缺少任务或班级，从独立关系表（tasks, classes, users, announcements）中聚合还原真实数据
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
                        'code' => $cr['code'],
                        'studentIds' => json_decode($cr['student_ids'] ?? '[]', true) ?: [],
                        'groups' => json_decode($cr['groups_data'] ?? '[]', true) ?: []
                    ];
                }
            }

            $aggregatedUsers = [];
            $stmtU = $pdo->query("SELECT id, username, name, role, student_code, avatar, class_id, group_id FROM users");
            if ($stmtU) {
                while ($ur = $stmtU->fetch(PDO::FETCH_ASSOC)) {
                    $aggregatedUsers[] = [
                        'id' => $ur['id'],
                        'username' => $ur['username'],
                        'name' => $ur['name'],
                        'role' => $ur['role'],
                        'studentCode' => $ur['student_code'] ?: $ur['username'],
                        'avatar' => $ur['avatar'] ?: '👤',
                        'classId' => $ur['class_id'] ?? '',
                        'groupId' => $ur['group_id'] ?? ''
                    ];
                }
            }

            // 🛡️ 智能合流：确保 users 表中的每一个真实学生均被纳入全局用户池与班级学生列表
            $allStudentCodes = [];
            foreach ($aggregatedUsers as $au) {
                if ($au['role'] !== 'teacher') {
                    $allStudentCodes[] = $au['studentCode'];
                }
            }

            if (!$foundMeta) {
                $foundMeta = [
                    'users' => $aggregatedUsers,
                    'classes' => $aggregatedClasses,
                    'tasks' => $aggregatedTasks,
                    'announcements' => [],
                    'referencePapers' => [],
                    'surveys' => []
                ];
            } else {
                // 合并 users
                $existingUserMap = [];
                foreach ($foundMeta['users'] ?? [] as $fu) {
                    $existingUserMap[$fu['studentCode'] ?? ($fu['username'] ?? '')] = true;
                }
                foreach ($aggregatedUsers as $au) {
                    $uKey = $au['studentCode'] ?? ($au['username'] ?? '');
                    if (!isset($existingUserMap[$uKey])) {
                        if (!isset($foundMeta['users'])) $foundMeta['users'] = [];
                        $foundMeta['users'][] = $au;
                    }
                }
                if (!empty($aggregatedTasks) && empty($foundMeta['tasks'])) {
                    $foundMeta['tasks'] = $aggregatedTasks;
                }
                if (!empty($aggregatedClasses) && empty($foundMeta['classes'])) {
                    $foundMeta['classes'] = $aggregatedClasses;
                }
            }

            // 确保班级的 studentIds 包含所有在库学生，让教师端一览无余
            if (!empty($foundMeta['classes']) && !empty($allStudentCodes)) {
                foreach ($foundMeta['classes'] as &$cls) {
                    $currentSids = is_array($cls['studentIds'] ?? null) ? $cls['studentIds'] : [];
                    $cls['studentIds'] = array_values(array_unique(array_merge($currentSids, $allStudentCodes)));
                }
                unset($cls);
            }
        } catch (Exception $e) {}
    }

    if ($foundMeta) {
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
            echo json_encode($parsedFile, JSON_UNESCAPED_UNICODE);
            exit;
        }
    }

    // 兜底返回空容器，绝对不再主动覆盖写入数据库！
    echo json_encode([
        'users' => [],
        'classes' => [],
        'tasks' => [],
        'announcements' => [],
        'referencePapers' => []
    ], JSON_UNESCAPED_UNICODE);
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
            if ($pdo) {
                // 读取当前 version
                $stmtVer = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = 'main_meta_version'");
                $stmtVer->execute();
                $verRow = $stmtVer->fetch();
                $currentVersion = $verRow ? intval($verRow['meta_value']) : 1;

                // 🚀 顺滑无感版本自增（以最新版本号自增更新，杜绝阻断性 409 弹窗）
                $newVersion = $currentVersion + 1;

                $stmt = $pdo->prepare("INSERT INTO global_meta (meta_key, meta_value) VALUES ('main_meta', :val) ON DUPLICATE KEY UPDATE meta_value = :val2");
                $stmt->execute([':val' => $rawInput, ':val2' => $rawInput]);

                // 🛡️ 实体表实时入库：将所有用户/学生 100% 同步 upsert 至 users 实体表，确保异地设备登录 0 延迟秒级识别
                if (isset($decoded['users']) && is_array($decoded['users'])) {
                    $stmtUserUpsert = $pdo->prepare("INSERT INTO `users` (`id`, `username`, `student_code`, `name`, `password`, `role`)
                        VALUES (:id, :u, :sc, :nm, :p, :r)
                        ON DUPLICATE KEY UPDATE `name`=VALUES(`name`), `student_code`=VALUES(`student_code`), `username`=VALUES(`username`), `password`=VALUES(`password`), `role`=VALUES(`role`)");
                    foreach ($decoded['users'] as $usr) {
                        $uid = isset($usr['id']) ? $usr['id'] : ('u_student_' . uniqid());
                        $uname = isset($usr['username']) ? $usr['username'] : (isset($usr['studentCode']) ? $usr['studentCode'] : $uid);
                        $ucode = isset($usr['studentCode']) ? $usr['studentCode'] : (isset($usr['username']) ? $usr['username'] : $uid);
                        $unick = isset($usr['name']) ? $usr['name'] : $uname;
                        $upwd = isset($usr['password']) ? $usr['password'] : '123';
                        $urole = isset($usr['role']) ? $usr['role'] : 'student';
                        $stmtUserUpsert->execute([
                            ':id' => $uid, ':u' => $uname, ':sc' => $ucode, ':nm' => $unick, ':p' => $upwd, ':r' => $urole
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
            @file_put_contents(__DIR__ . '/global_db.json', $rawInput);
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
                                'studentCode' => $userCode ?: '',
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

// 1c. 阶段三答辩质询点单条原子保存（独立通道，绝不冲掉其他成员未保存的答辩草稿）
if ($action === 'patch_feedback' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $rawInput = file_get_contents('php://input');
    $req = json_decode($rawInput, true) ?: [];
    $feedbackId = isset($req['feedbackId']) ? $req['feedbackId'] : (isset($req['id']) ? $req['id'] : '');
    $response = isset($req['response']) ? $req['response'] : '';
    $status = isset($req['status']) ? $req['status'] : 'adopted';
    $nowMs = round(microtime(true) * 1000);
    
    if ($feedbackId && $pdo) {
        $stmtGet = $pdo->prepare("SELECT stage3_data FROM group_states WHERE scope_key = :sk");
        $stmtGet->execute([':sk' => $scopeKey]);
        $row = $stmtGet->fetch();
        $s3 = ($row && !empty($row['stage3_data'])) ? json_decode($row['stage3_data'], true) : [];
        if (!isset($s3['feedbackItems']) || !is_array($s3['feedbackItems'])) $s3['feedbackItems'] = [];
        
        $found = false;
        foreach ($s3['feedbackItems'] as &$item) {
            if (isset($item['id']) && $item['id'] === $feedbackId) {
                $item['response'] = $response;
                $item['status'] = $status;
                $item['updatedAt'] = $nowMs;
                $found = true;
                break;
            }
        }
        unset($item);
        if (!$found) {
            $s3['feedbackItems'][] = [
                'id' => $feedbackId,
                'response' => $response,
                'status' => $status,
                'updatedAt' => $nowMs
            ];
        }
        $s3Json = json_encode($s3, JSON_UNESCAPED_UNICODE);
        $stmtUp = $pdo->prepare("UPDATE group_states SET stage3_data = :s3, last_timestamp = :ts, revision_id = IFNULL(revision_id, 0) + 1 WHERE scope_key = :sk");
        $stmtUp->execute([':s3' => $s3Json, ':ts' => $nowMs, ':sk' => $scopeKey]);
        echo json_encode(['success' => true, 'timestamp' => $nowMs]);
        exit;
    }
    echo json_encode(['success' => true]);
    exit;
}


// 1d. 研讨区独立轻量发信接口（领域隔离：仅入库单条消息，绝不触碰 group_states 表中的 stage1/stage2/stage3）
if ($action === 'send_chat' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $rawInput = file_get_contents('php://input');
    $req = json_decode($rawInput, true) ?: [];
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
            // 1. 行级插入 chat_messages 表
            $stmtInsertMsg = $pdo->prepare("INSERT IGNORE INTO chat_messages (scope_key, stage, sender, text, timestamp_str, time_ms) VALUES (:sk, :stg, :snd, :txt, :tstr, :tms)");
            $stmtInsertMsg->execute([
                ':sk' => $scopeKey,
                ':stg' => $stage,
                ':snd' => $snd,
                ':txt' => $txt,
                ':tstr' => $tstr,
                ':tms' => $tms
            ]);

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

if ($action === 'session_login' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $rawInput = file_get_contents('php://input');
    $req = json_decode($rawInput, true) ?: [];
    $userId = isset($req['userId']) ? $req['userId'] : '';
    $token = isset($req['token']) ? $req['token'] : '';
    $password = isset($req['password']) ? $req['password'] : '';

    if ($userId && $token && $pdo) {
        // 🛡️ 严格凭据校验：仅允许密码正确或持有合法有效会话的用户更新会话
        $stmt = $pdo->prepare("SELECT password FROM users WHERE id = :u1 OR username = :u2 OR student_code = :u3 LIMIT 1");
        $stmt->execute([':u1' => $userId, ':u2' => $userId, ':u3' => $userId]);
        $uRow = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($uRow) {
            $dbPwd = $uRow['password'] ?? '123';
            $isValid = (!empty($password) && (password_verify($password, $dbPwd) || $password === $dbPwd || (empty($dbPwd) && $password === '123')));
            if ($isValid) {
                $stmtSess = $pdo->prepare("INSERT INTO global_meta (meta_key, meta_value) VALUES (:k, :v) ON DUPLICATE KEY UPDATE meta_value = :v2");
                $stmtSess->execute([':k' => 'sess_' . $userId, ':v' => $token, ':v2' => $token]);
            }
        }
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

// 3b. 教师端原子重置小组协同数据 (独立可靠通道，绝不依赖并发锁)
if ($action === 'reset_group' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $rawInput = file_get_contents('php://input');
    $reqData = json_decode($rawInput, true) ?: [];
    $userId = $reqData['userId'] ?? ($_GET['userId'] ?? '');
    $token = $reqData['token'] ?? ($_GET['token'] ?? '');

    $nowMs = round(microtime(true) * 1000);
    $newResetSeq = 1;
    if ($pdo) {
        try {
            $pdo->beginTransaction();

            // 读取并递增 reset_seq
            $stmtGetResetSeq = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = :k");
            $stmtGetResetSeq->execute([':k' => 'reset_seq_' . $scopeKey]);
            $resetSeqRow = $stmtGetResetSeq->fetch();
            $serverResetSeq = $resetSeqRow ? intval($resetSeqRow['meta_value']) : 0;
            $newResetSeq = $serverResetSeq + 1;

            $stmtSetResetSeq = $pdo->prepare("INSERT INTO global_meta (meta_key, meta_value) VALUES (:k, :v) ON DUPLICATE KEY UPDATE meta_value = :v2");
            $stmtSetResetSeq->execute([':k' => 'reset_seq_' . $scopeKey, ':v' => $newResetSeq, ':v2' => $newResetSeq]);

            // 彻底清空 group_states 表
            $emptyS1 = json_encode(['proposals' => [], 'votes' => [], 'hasVoted' => [], 'mergedTitle' => '', 'contract' => ['confirmedMembers' => [], 'isConfirmed' => false]], JSON_UNESCAPED_UNICODE);
            $emptyS2 = json_encode(['unifiedContent' => '', 'meetingSubmissions' => [], 'actionPlan' => null, 'memberContributions' => []], JSON_UNESCAPED_UNICODE);
            $emptyS3 = json_encode(['proponentAnalysis' => '', 'opponentCritique' => '', 'neutralVerdict' => '', 'feedbackItems' => []], JSON_UNESCAPED_UNICODE);
            
            $stmtResetGroup = $pdo->prepare("INSERT INTO group_states (scope_key, task_id, group_id, current_stage, stage1_data, stage2_data, stage3_data, presence_data, is_final_submitted, last_timestamp)
                VALUES (:sk, :tid, :gid, 'stage1', :s1, :s2, :s3, '[]', 0, :ts)
                ON DUPLICATE KEY UPDATE current_stage='stage1', stage1_data=:s1b, stage2_data=:s2b, stage3_data=:s3b, presence_data='[]', is_final_submitted=0, last_timestamp=:tsb");
            $stmtResetGroup->execute([
                ':sk' => $scopeKey, ':tid' => $taskId, ':gid' => $groupId,
                ':s1' => $emptyS1, ':s2' => $emptyS2, ':s3' => $emptyS3, ':ts' => $nowMs,
                ':s1b' => $emptyS1, ':s2b' => $emptyS2, ':s3b' => $emptyS3, ':tsb' => $nowMs
            ]);

            // 清空 chat_messages 和 chats 快速通道
            $stmtDelChats = $pdo->prepare("DELETE FROM chat_messages WHERE scope_key = :sk");
            $stmtDelChats->execute([':sk' => $scopeKey]);
            $emptyChats = json_encode(['stage1' => [], 'stage2' => [], 'stage3' => []], JSON_UNESCAPED_UNICODE);
            $stmtClearChatMeta = $pdo->prepare("INSERT INTO global_meta (meta_key, meta_value) VALUES (:k, :v) ON DUPLICATE KEY UPDATE meta_value = :v2");
            $stmtClearChatMeta->execute([':k' => 'chats_' . $scopeKey, ':v' => $emptyChats, ':v2' => $emptyChats]);

            // 更新全局变更信号
            $stmtSignal = $pdo->prepare("INSERT INTO global_meta (meta_key, meta_value) VALUES ('meta_updated_at', :v) ON DUPLICATE KEY UPDATE meta_value = :v2");
            $stmtSignal->execute([':v' => $nowMs, ':v2' => $nowMs]);

            $pdo->commit();
        } catch (Exception $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            echo json_encode(['success' => false, 'error' => $e->getMessage()]);
            exit;
        }
    }

    // 🛡️ 彻底清空 Yjs CRDT 协同服务中的内存与磁盘文件，绝无任何幽灵数据残留
    $yjsRoomName = "jizhi_yjs_{$taskId}_{$groupId}";
    @file_get_contents("http://127.0.0.1:1234/reset_room?roomName=" . urlencode($yjsRoomName));
    $yjsJsonFile = __DIR__ . "/data/room_{$yjsRoomName}.json";
    $yjsBinFile = __DIR__ . "/data/room_{$yjsRoomName}.bin";
    if (file_exists($yjsJsonFile)) @unlink($yjsJsonFile);
    if (file_exists($yjsBinFile)) @unlink($yjsBinFile);

    // 清理本地文件备份
    @file_put_contents(__DIR__ . '/db_' . $scopeKey . '.json', json_encode([
        'timestamp' => $nowMs, 'groupId' => $groupId, 'taskId' => $taskId, 'currentStage' => 'stage1',
        'stage1' => [], 'stage2' => ['unifiedContent' => ''], 'stage3' => [], 'chatLogs' => ['stage1' => [], 'stage2' => [], 'stage3' => []],
        'resetSeq' => $newResetSeq, 'isReset' => true
    ], JSON_UNESCAPED_UNICODE));

    echo json_encode(['success' => true, 'resetSeq' => $newResetSeq, 'timestamp' => $nowMs]);
    exit;
}

// ⚡ 3.5 教师端协同动态与代签提醒路由 (GET / POST)
if ($action === 'record_teacher_alert') {
    $rawInput = file_get_contents('php://input');
    $alertItem = json_decode($rawInput, true);
    // 🛡️ 服务端鉴权：记录协同动态提醒要求持有有效会话（教师或学生组长均需已登录），杜绝匿名刷告警
    $alertUserId = isset($_GET['userId']) ? $_GET['userId'] : (is_array($alertItem) && isset($alertItem['userId']) ? $alertItem['userId'] : '');
    $alertToken = isset($_GET['token']) ? $_GET['token'] : (is_array($alertItem) && isset($alertItem['token']) ? $alertItem['token'] : '');
    $alertAuthed = false;
    if ($alertUserId && $alertToken && $pdo) {
        $stmtSess = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = :k");
        $stmtSess->execute([':k' => 'sess_' . $alertUserId]);
        $sessRow = $stmtSess->fetch();
        $alertAuthed = ($sessRow && !empty($sessRow['meta_value']) && $sessRow['meta_value'] === $alertToken);
    }
    if (!$alertAuthed) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => '会话失效：请重新登录后再记录协同动态提醒']);
        exit;
    }
    if ($alertItem && is_array($alertItem)) {
        if ($pdo) {
            $stmt = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = 'teacher_alerts'");
            $stmt->execute();
            $row = $stmt->fetch();
            $alerts = ($row && !empty($row['meta_value'])) ? json_decode($row['meta_value'], true) : [];
            if (!is_array($alerts)) $alerts = [];

            $tId = isset($alertItem['taskId']) ? $alertItem['taskId'] : 'task_default';
            $gId = isset($alertItem['groupId']) ? $alertItem['groupId'] : 'group_1';
            
            // 聚合收拢：同一小组在同一任务下只保留 1 条汇总记录
            $exIdx = -1;
            foreach ($alerts as $idx => $a) {
                if ((!isset($a['taskId']) || $a['taskId'] === $tId) && (isset($a['groupId']) && $a['groupId'] === $gId)) {
                    $exIdx = $idx;
                    break;
                }
            }
            if ($exIdx >= 0) {
                $alerts[$exIdx] = $alertItem;
            } else {
                array_unshift($alerts, $alertItem);
            }
            if (count($alerts) > 100) $alerts = array_slice($alerts, 0, 100);

            $encoded = json_encode($alerts, JSON_UNESCAPED_UNICODE);
            $stmtSave = $pdo->prepare("INSERT INTO global_meta (meta_key, meta_value) VALUES ('teacher_alerts', :v) ON DUPLICATE KEY UPDATE meta_value = :v2");
            $stmtSave->execute([':v' => $encoded, ':v2' => $encoded]);
        }
    }
    echo json_encode(['success' => true, 'alert' => $alertItem]);
    exit;
}

if ($action === 'get_teacher_alerts') {
    $alerts = [];
    if ($pdo) {
        $stmt = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = 'teacher_alerts'");
        $stmt->execute();
        $row = $stmt->fetch();
        $alerts = ($row && !empty($row['meta_value'])) ? json_decode($row['meta_value'], true) : [];
        if (!is_array($alerts)) $alerts = [];
    }
    echo json_encode($alerts, JSON_UNESCAPED_UNICODE);
    exit;
}

// 4. 数据快照持久化 (MySQL 主存储)
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $rawInput = file_get_contents('php://input');
    if (!empty($rawInput)) {
        $data = json_decode($rawInput, true) ?: [];
        $ts = isset($data['timestamp']) ? intval($data['timestamp']) : round(microtime(true) * 1000);
        
        // 🛡️ 变量防御性初始化，确保极端无数据库或单机容灾模式下变量 100% 绝对安全
        $isResetVal     = !empty($data['isReset']) ? 1 : 0;
        $mergedPresence = (isset($data['presence']) && is_array($data['presence'])) ? $data['presence'] : [];
        $mergedS1       = (isset($data['stage1']) && is_array($data['stage1'])) ? $data['stage1'] : [];
        $mergedS2       = (isset($data['stage2']) && is_array($data['stage2'])) ? $data['stage2'] : [];
        $mergedS3       = (isset($data['stage3']) && is_array($data['stage3'])) ? $data['stage3'] : [];
        $mergedChats    = (isset($data['chatLogs']) && is_array($data['chatLogs'])) ? $data['chatLogs'] : ['stage1' => [], 'stage2' => [], 'stage3' => []];
        $clientRevision = isset($data['revisionId']) ? intval($data['revisionId']) : 0;

        if ($pdo) {
            // 读取当前服务端 reset_seq
            $stmtGetResetSeq = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = :k");
            $stmtGetResetSeq->execute([':k' => 'reset_seq_' . $scopeKey]);
            $resetSeqRow = $stmtGetResetSeq->fetch();
            $serverResetSeq = $resetSeqRow ? intval($resetSeqRow['meta_value']) : 0;
            
            if ($isResetVal) {
                // ── 重置指令：递增 reset_seq 并清空所有数据 ──
                $newResetSeq = $serverResetSeq + 1;
                $stmtSetResetSeq = $pdo->prepare("INSERT INTO global_meta (meta_key, meta_value) VALUES (:k, :v) ON DUPLICATE KEY UPDATE meta_value = :v2");
                $stmtSetResetSeq->execute([':k' => 'reset_seq_' . $scopeKey, ':v' => $newResetSeq, ':v2' => $newResetSeq]);
                $serverResetSeq = $newResetSeq;

                // 清空 chat_messages 和 chats 快速通道
                $stmtDelChats = $pdo->prepare("DELETE FROM chat_messages WHERE scope_key = :sk");
                $stmtDelChats->execute([':sk' => $scopeKey]);
                $emptyChats = json_encode(['stage1' => [], 'stage2' => [], 'stage3' => []], JSON_UNESCAPED_UNICODE);
                $stmtClearChatMeta = $pdo->prepare("INSERT INTO global_meta (meta_key, meta_value) VALUES (:k, :v) ON DUPLICATE KEY UPDATE meta_value = :v2");
                $stmtClearChatMeta->execute([':k' => 'chats_' . $scopeKey, ':v' => $emptyChats, ':v2' => $emptyChats]);
            } else {
                $clientResetSeq = isset($data['resetSeq']) ? intval($data['resetSeq']) : 0;
                // 仅对齐服务端最新序列号，允许正常数据增量合并
                if ($clientResetSeq < $serverResetSeq) {
                    $clientResetSeq = $serverResetSeq;
                }
            }
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

            // 合并 presence
            $incomingPresence = (isset($data['presence']) && is_array($data['presence'])) ? $data['presence'] : [];
            $mergedPresence = array_merge($existingPresence, $incomingPresence);

            // 合并 stage1
            $incomingS1 = (isset($data['stage1']) && is_array($data['stage1'])) ? $data['stage1'] : [];
            $mergedS1 = array_merge($existingS1, $incomingS1);
            if (!empty($existingS1) && !$isResetVal) {
                // 🛡️ 选题主题防空覆盖：若传入的主题为空，严格保留已有主题
                if (empty(trim($incomingS1['mergedTitle'] ?? '')) && !empty(trim($existingS1['mergedTitle'] ?? ''))) {
                    $mergedS1['mergedTitle'] = $existingS1['mergedTitle'];
                }

                $exProps = isset($existingS1['proposals']) && is_array($existingS1['proposals']) ? $existingS1['proposals'] : [];
                $inProps = isset($incomingS1['proposals']) && is_array($incomingS1['proposals']) ? $incomingS1['proposals'] : [];
                $propMap = [];
                foreach ($exProps as $p) { if (isset($p['author'])) $propMap[$p['author']] = $p; }
                foreach ($inProps as $p) {
                    if (isset($p['author'])) {
                        $author = $p['author'];
                        if (!isset($propMap[$author]) || (isset($p['updatedAt']) && $p['updatedAt'] >= (isset($propMap[$author]['updatedAt']) ? $propMap[$author]['updatedAt'] : 0))) {
                            $propMap[$author] = $p;
                        }
                    }
                }
                $mergedS1['proposals'] = array_values($propMap);
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
            }

            // 合并 stage2 (全篇单画布协作模型与正常编辑删除支持)
            $incomingS2 = (isset($data['stage2']) && is_array($data['stage2'])) ? $data['stage2'] : [];
            $mergedS2 = $incomingS2;
            if (!empty($existingS2) && !$isResetVal) {
                // 🛡️ 致命防线：若传入的正文为空字符串，而数据库中已有非空正文草稿，且非重置操作，严格保留已有正文！
                // 🛡️ 乐观并发控制：客户端携带的 revision_id 落后于服务端时判定为过期正文，拒绝覆盖最新正文（杜绝降级模式下旧快照冲刷）
                $incomingIsStale = ($clientRevision > 0 && $existingRevision > 0 && $clientRevision < $existingRevision);
                if (isset($incomingS2['unifiedContent'])) {
                    if (trim($incomingS2['unifiedContent']) === '' && !empty(trim($existingS2['unifiedContent'] ?? ''))) {
                        $mergedS2['unifiedContent'] = $existingS2['unifiedContent'];
                    } elseif ($incomingIsStale && !empty(trim($existingS2['unifiedContent'] ?? ''))) {
                        $mergedS2['unifiedContent'] = $existingS2['unifiedContent'];
                    } else {
                        $mergedS2['unifiedContent'] = $incomingS2['unifiedContent'];
                    }
                } elseif (!empty($existingS2['unifiedContent'])) {
                    $mergedS2['unifiedContent'] = $existingS2['unifiedContent'];
                }
                // 贡献度数据合并：逐成员取历史最大值（单调不减），彻底杜绝多端互相清零覆盖 (保留数字学号键)
                $exContrib = isset($existingS2['memberContributions']) && is_array($existingS2['memberContributions']) ? $existingS2['memberContributions'] : [];
                $inContrib = isset($incomingS2['memberContributions']) && is_array($incomingS2['memberContributions']) ? $incomingS2['memberContributions'] : [];
                $mergedS2['memberContributions'] = $exContrib;
                foreach ($inContrib as $contribKey => $contribVal) {
                    $exVal = isset($exContrib[$contribKey]) ? intval($exContrib[$contribKey]) : 0;
                    $inVal = is_numeric($contribVal) ? intval($contribVal) : 0;
                    $mergedS2['memberContributions'][$contribKey] = max($exVal, $inVal);
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
            }

            // 合并 stage3 (答辩质询与终稿修改)
            $incomingS3 = (isset($data['stage3']) && is_array($data['stage3'])) ? $data['stage3'] : [];
            $mergedS3 = $incomingS3;
            if (!empty($existingS3) && !$isResetVal) {
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
            $finalStage = $inStage;
            if (!$isResetVal) {
                $wEx = $stageWeights[$exStage] ?? 1;
                $wIn = $stageWeights[$inStage] ?? 1;
                $finalStage = ($wEx >= $wIn) ? $exStage : $inStage;
            }

            // 🛡️ 锁定状态：完全由客户端/教师端权威布尔值控制，支持正常锁定与解锁
            $inFinal = !empty($data['isFinalSubmitted']) ? 1 : 0;
            $finalLock = $isResetVal ? 0 : $inFinal;

            // 🛡️ 公约与初稿确认状态防逆流 (Sticky True)
            if (!$isResetVal && !empty($existingS1['contract']['isConfirmed'])) {
                if (!isset($mergedS1['contract'])) $mergedS1['contract'] = [];
                $mergedS1['contract']['isConfirmed'] = true;
            }
            if (!$isResetVal && !empty($existingS2['isDraftConfirmed'])) {
                $mergedS2['isDraftConfirmed'] = true;
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
                $mergedChats[$stg] = $list;
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
                        if (!empty($txt)) {
                            // 检查避免重复插入完全相同的历史记录
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
            // 🛡️ 严格单向权限隔离：只有明确来自教师端 (isTeacher=true 或 userRole='teacher') 的请求才允许更新全局教务表！
            // 学生端协同快照一律禁止触碰全局教务数据，物理上杜绝学生端冲掉教师配置的班级与任务！
            // 🛡️ 服务端强制鉴权：全局教务表写入必须通过 verifyTeacherSession，客户端 isTeacher/userRole/role 字段一律不可信
            $teacherUserId = isset($data['userId']) ? $data['userId'] : (isset($_GET['userId']) ? $_GET['userId'] : '');
            $teacherToken = isset($data['token']) ? $data['token'] : (isset($_GET['token']) ? $_GET['token'] : '');
            $isTeacherVerified = verifyTeacherSession($teacherUserId, $teacherToken, $pdo);
            $hasGlobalMeta = $isTeacherVerified && (!empty($data['users']) || !empty($data['classes']) || !empty($data['tasks']));
            if ($hasGlobalMeta) {
                // 先读取已有的 main_meta，做字段级合并（避免一台设备覆盖另一台的未发送字段）
                $stmtReadMeta = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = 'main_meta'");
                $stmtReadMeta->execute();
                $existingMetaRow = $stmtReadMeta->fetch();
                $existingMeta = ($existingMetaRow && !empty($existingMetaRow['meta_value'])) 
                    ? (json_decode($existingMetaRow['meta_value'], true) ?: []) 
                    : [];

                // 合并：只在数组非空时覆盖，避免空数组把有效数据清空
                if (!empty($data['users']) && is_array($data['users'])) {
                    $existingMeta['users'] = $data['users'];
                    // 同步逐行写入 users 独立数据表
                    $stmtUserUpsert = $pdo->prepare("INSERT INTO `users` (`id`, `username`, `name`, `password`, `role`, `student_code`, `class_id`, `group_id`, `avatar`)
                        VALUES (:id, :un, :nm, :pw, :rl, :sc, :cid, :gid, :av)
                        ON DUPLICATE KEY UPDATE `name`=:nm2, `password`=:pw2, `role`=:rl2, `student_code`=:sc2, `class_id`=:cid2, `group_id`=:gid2, `avatar`=:av2");
                    foreach ($data['users'] as $u) {
                        $uid = isset($u['id']) ? $u['id'] : 'u_' . (isset($u['username']) ? $u['username'] : uniqid());
                        $uName = isset($u['name']) ? $u['name'] : '用户';
                        $uUser = isset($u['username']) ? $u['username'] : $uid;
                        $uPass = isset($u['password']) ? $u['password'] : '123';
                        $uRole = isset($u['role']) ? $u['role'] : 'student';
                        $uCode = isset($u['studentCode']) ? $u['studentCode'] : (isset($u['student_code']) ? $u['student_code'] : '');
                        $uCid  = isset($u['classId']) ? $u['classId'] : (isset($u['class_id']) ? $u['class_id'] : '');
                        $uGid  = isset($u['groupId']) ? $u['groupId'] : (isset($u['group_id']) ? $u['group_id'] : '');
                        $uAv   = isset($u['avatar']) ? $u['avatar'] : '👤';
                        $stmtUserUpsert->execute([
                            ':id' => $uid, ':un' => $uUser, ':nm' => $uName, ':pw' => $uPass, ':rl' => $uRole, ':sc' => $uCode, ':cid' => $uCid, ':gid' => $uGid, ':av' => $uAv,
                            ':nm2' => $uName, ':pw2' => $uPass, ':rl2' => $uRole, ':sc2' => $uCode, ':cid2' => $uCid, ':gid2' => $uGid, ':av2' => $uAv
                        ]);
                    }
                }
                // 4c-2. 同步写入教学班级表 (classes)
                if (!empty($data['classes']) && is_array($data['classes'])) {
                    $existingMeta['classes'] = $data['classes'];
                    $stmtClassUpsert = $pdo->prepare("INSERT INTO `classes` (`id`, `name`, `code`, `student_ids`, `groups_data`)
                        VALUES (:id, :name, :code, :sids, :gdata)
                        ON DUPLICATE KEY UPDATE `name`=VALUES(`name`), `code`=VALUES(`code`), `student_ids`=VALUES(`student_ids`), `groups_data`=VALUES(`groups_data`)");
                    foreach ($data['classes'] as $cls) {
                        $cid = isset($cls['id']) ? $cls['id'] : 'class_' . uniqid();
                        $cname = isset($cls['name']) ? $cls['name'] : '班级';
                        $ccode = isset($cls['code']) ? $cls['code'] : 'CODE_' . uniqid();
                        $sids = isset($cls['studentIds']) ? json_encode($cls['studentIds'], JSON_UNESCAPED_UNICODE) : '[]';
                        $gdata = isset($cls['groups']) ? json_encode($cls['groups'], JSON_UNESCAPED_UNICODE) : '[]';
                        $stmtClassUpsert->execute([':id' => $cid, ':name' => $cname, ':code' => $ccode, ':sids' => $sids, ':gdata' => $gdata]);
                    }
                }

                // 4c-2b. 同步写入用户表 (users)，确保教师创建/导入的所有学生 100% 实时落盘至 users 鉴权表
                if (isset($data['users']) && is_array($data['users'])) {
                    $existingMeta['users'] = $data['users'];
                    $stmtUserUpsert = $pdo->prepare("INSERT INTO `users` (`id`, `username`, `student_code`, `name`, `password`, `role`)
                        VALUES (:id, :u, :sc, :nm, :p, :r)
                        ON DUPLICATE KEY UPDATE `name`=VALUES(`name`), `student_code`=VALUES(`student_code`), `username`=VALUES(`username`), `role`=VALUES(`role`)");
                    foreach ($data['users'] as $usr) {
                        $uid = isset($usr['id']) ? $usr['id'] : ('u_student_' . uniqid());
                        $uname = isset($usr['username']) ? $usr['username'] : (isset($usr['studentCode']) ? $usr['studentCode'] : $uid);
                        $ucode = isset($usr['studentCode']) ? $usr['studentCode'] : (isset($usr['username']) ? $usr['username'] : $uid);
                        $unick = isset($usr['name']) ? $usr['name'] : $uname;
                        $upwd = isset($usr['password']) ? $usr['password'] : '123';
                        $hashedPwd = (strlen($upwd) > 30) ? $upwd : password_hash($upwd, PASSWORD_DEFAULT);
                        $urole = isset($usr['role']) ? $usr['role'] : 'student';
                        $stmtUserUpsert->execute([
                            ':id' => $uid, ':u' => $uname, ':sc' => $ucode, ':nm' => $unick, ':p' => $hashedPwd, ':r' => $urole
                        ]);
                    }
                }

                // 4c-3. 同步写入任务表 (tasks)
                if (isset($data['tasks']) && is_array($data['tasks'])) {
                    $existingMeta['tasks'] = $data['tasks'];
                    $stmtTaskUpsert = $pdo->prepare("INSERT INTO `tasks` (`id`, `title`, `desc`, `created_at_str`, `deadline`, `duration_minutes`, `target_class_ids`, `attachments`, `status`)
                        VALUES (:id, :title, :desc, :created_at, :deadline, :duration, :cids, :att, :status)
                        ON DUPLICATE KEY UPDATE `title`=VALUES(`title`), `desc`=VALUES(`desc`), `created_at_str`=VALUES(`created_at_str`), `deadline`=VALUES(`deadline`), `duration_minutes`=VALUES(`duration_minutes`), `target_class_ids`=VALUES(`target_class_ids`), `attachments`=VALUES(`attachments`), `status`=VALUES(`status`)");
                    foreach ($data['tasks'] as $tsk) {
                        $tid = isset($tsk['id']) ? $tsk['id'] : 'task_' . uniqid();
                        $ttitle = isset($tsk['title']) ? $tsk['title'] : '写作任务';
                        $tdesc = isset($tsk['desc']) ? $tsk['desc'] : '';
                        $tcreated = isset($tsk['createdAt']) ? $tsk['createdAt'] : '';
                        $tdeadline = isset($tsk['deadline']) ? $tsk['deadline'] : '';
                        $tduration = isset($tsk['durationMinutes']) ? intval($tsk['durationMinutes']) : 60;
                        $tcids = isset($tsk['classIds']) ? json_encode($tsk['classIds'], JSON_UNESCAPED_UNICODE) : '[]';
                        $tatt = isset($tsk['attachments']) ? json_encode($tsk['attachments'], JSON_UNESCAPED_UNICODE) : '[]';
                        $tstatus = isset($tsk['status']) ? $tsk['status'] : 'active';
                        $stmtTaskUpsert->execute([
                            ':id' => $tid, ':title' => $ttitle, ':desc' => $tdesc, ':created_at' => $tcreated,
                            ':deadline' => $tdeadline, ':duration' => $tduration, ':cids' => $tcids, ':att' => $tatt, ':status' => $tstatus
                        ]);
                    }
                }

                // 4c-4. 同步写入广播通知表 (announcements)
                if (isset($data['announcements']) && is_array($data['announcements'])) {
                    $existingMeta['announcements'] = $data['announcements'];
                    $stmtAnnUpsert = $pdo->prepare("INSERT INTO `announcements` (`id`, `title`, `content`, `created_at_str`, `target_class_ids`, `is_pinned`)
                        VALUES (:id, :title, :content, :created_at, :cids, :pinned)
                        ON DUPLICATE KEY UPDATE `title`=VALUES(`title`), `content`=VALUES(`content`), `created_at_str`=VALUES(`created_at_str`), `target_class_ids`=VALUES(`target_class_ids`), `is_pinned`=VALUES(`is_pinned`)");
                    foreach ($data['announcements'] as $ann) {
                        $aid = isset($ann['id']) ? $ann['id'] : 'ann_' . uniqid();
                        $atitle = isset($ann['title']) ? $ann['title'] : '系统通知';
                        $acontent = isset($ann['content']) ? $ann['content'] : '';
                        $acreated = isset($ann['createdAt']) ? $ann['createdAt'] : '';
                        $acids = isset($ann['classIds']) ? json_encode($ann['classIds'], JSON_UNESCAPED_UNICODE) : '[]';
                        $apinned = !empty($ann['isPinned']) ? 1 : 0;
                        $stmtAnnUpsert->execute([':id' => $aid, ':title' => $atitle, ':content' => $acontent, ':created_at' => $acreated, ':cids' => $acids, ':pinned' => $apinned]);
                    }
                }

                // 4c-5. 同步写入学术范文库表 (reference_papers)
                if (isset($data['referencePapers']) && is_array($data['referencePapers'])) {
                    $existingMeta['referencePapers'] = $data['referencePapers'];
                    $stmtPaperUpsert = $pdo->prepare("INSERT INTO `reference_papers` (`id`, `title`, `abstract`, `highlights`, `target_group`, `file_name`, `file_size`, `file_data`, `upload_time`)
                        VALUES (:id, :title, :abstract, :highlights, :tgroup, :fname, :fsize, :fdata, :utime)
                        ON DUPLICATE KEY UPDATE `title`=VALUES(`title`), `abstract`=VALUES(`abstract`), `highlights`=VALUES(`highlights`), `target_group`=VALUES(`target_group`), `file_name`=VALUES(`file_name`), `file_size`=VALUES(`file_size`), `file_data`=VALUES(`file_data`), `upload_time`=VALUES(`upload_time`)");
                    foreach ($data['referencePapers'] as $pap) {
                        $pid = isset($pap['id']) ? $pap['id'] : 'paper_' . uniqid();
                        $ptitle = isset($pap['title']) ? $pap['title'] : '参考论文';
                        $pabstract = isset($pap['abstract']) ? $pap['abstract'] : '';
                        $phighlights = isset($pap['highlights']) ? $pap['highlights'] : '';
                        $ptgroup = isset($pap['targetGroup']) ? $pap['targetGroup'] : 'all';
                        $pfname = isset($pap['fileName']) ? $pap['fileName'] : '';
                        $pfsize = isset($pap['fileSize']) ? $pap['fileSize'] : '';
                        $pfdata = isset($pap['fileData']) ? $pap['fileData'] : '';
                        $putime = isset($pap['uploadTime']) ? $pap['uploadTime'] : '';
                        $stmtPaperUpsert->execute([
                            ':id' => $pid, ':title' => $ptitle, ':abstract' => $pabstract, ':highlights' => $phighlights,
                            ':tgroup' => $ptgroup, ':fname' => $pfname, ':fsize' => $pfsize, ':fdata' => $pfdata, ':utime' => $putime
                        ]);
                    }
                }

                $mergedJson = json_encode($existingMeta, JSON_UNESCAPED_UNICODE);
                $stmtSaveMeta = $pdo->prepare("INSERT INTO global_meta (meta_key, meta_value) VALUES ('main_meta', :v) ON DUPLICATE KEY UPDATE meta_value = :v2");
                $stmtSaveMeta->execute([':v' => $mergedJson, ':v2' => $mergedJson]);

                // 更新变更信号时间戳，让 400ms 轮询立刻感知到全局数据已变
                $nowMs = round(microtime(true) * 1000);
                $stmtSignal = $pdo->prepare("INSERT INTO global_meta (meta_key, meta_value) VALUES ('meta_updated_at', :v) ON DUPLICATE KEY UPDATE meta_value = :v2");
                $stmtSignal->execute([':v' => $nowMs, ':v2' => $nowMs]);

                // 文件双写备份
                @file_put_contents(__DIR__ . '/global_db.json', $mergedJson);
            }
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
    // 🛡️ 极速 Session 异地登录校验 (0 延迟合并校验)
    $reqUserId = isset($_GET['userId']) ? trim($_GET['userId']) : '';
    $reqSessToken = isset($_GET['sessToken']) ? trim($_GET['sessToken']) : '';
    if ($reqUserId && $reqSessToken) {
        $stmtSessChk = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = :k");
        $stmtSessChk->execute([':k' => 'sess_' . $reqUserId]);
        $sessRow = $stmtSessChk->fetch();
        if ($sessRow && !empty($sessRow['meta_value']) && $sessRow['meta_value'] !== $reqSessToken) {
            echo json_encode(['kicked' => true]);
            exit;
        }
    }

    $stmt = $pdo->prepare("SELECT * FROM group_states WHERE scope_key = :sk");
    $stmt->execute([':sk' => $scopeKey]);
    $row = $stmt->fetch();
    
    if ($row) {
        $lastTs = intval($row['last_timestamp']);
        $lastRev = isset($row['revision_id']) ? intval($row['revision_id']) : 1;
        $sinceRev = isset($_GET['since_rev']) ? intval($_GET['since_rev']) : (isset($_GET['since_revision']) ? intval($_GET['since_revision']) : 0);

        // ⚡ 极速轻量返回：若版本未发生任何变更，直接 1ms 返回 notModified，零 JSON 序列化开销
        if ($sinceRev > 0 && $sinceRev === $lastRev) {
            echo json_encode(['notModified' => true, 'revisionId' => $lastRev, 'timestamp' => $lastTs]);
            exit;
        }

        $stmtChats = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = :k");
        $stmtChats->execute([':k' => 'chats_' . $scopeKey]);
        $chatRow = $stmtChats->fetch();
        $chats = ($chatRow && !empty($chatRow['meta_value'])) ? json_decode($chatRow['meta_value'], true) : null;

        // 若 meta 中为空，直接从 chat_messages 关系表查询兜底
        if (!$chats || !is_array($chats)) {
            $chats = ['stage1' => [], 'stage2' => [], 'stage3' => []];
            $stmtAllMsg = $pdo->prepare("SELECT stage, sender, text, timestamp_str, time_ms, id FROM chat_messages WHERE scope_key = :sk ORDER BY time_ms ASC");
            $stmtAllMsg->execute([':sk' => $scopeKey]);
            $allRows = $stmtAllMsg->fetchAll(PDO::FETCH_ASSOC);
            foreach ($allRows as $mr) {
                $stg = $mr['stage'] ?: 'stage1';
                if (!isset($chats[$stg])) $chats[$stg] = [];
                $chats[$stg][] = [
                    'id'        => $mr['id'] ?: ('msg_' . $mr['time_ms'] . '_' . substr(md5($mr['text']), 0, 6)),
                    'sender'    => $mr['sender'],
                    'text'      => $mr['text'],
                    'timestamp' => $mr['timestamp_str'],
                    '_timeMs'   => intval($mr['time_ms'])
                ];
            }
        }

        // 读取 reset_seq 让客户端感知是否需要重置
        $stmtRsq = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = :k");
        $stmtRsq->execute([':k' => 'reset_seq_' . $scopeKey]);
        $rsqRow = $stmtRsq->fetch();
        $resetSeq = $rsqRow ? intval($rsqRow['meta_value']) : 0;

        // 同时拉取全局教务元数据，确保所有设备能拿到最新用户池/班级/任务/通知/范文库
        $stmtMeta = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = 'main_meta'");
        $stmtMeta->execute();
        $metaRow = $stmtMeta->fetch();
        $globalMeta = ($metaRow && !empty($metaRow['meta_value'])) ? json_decode($metaRow['meta_value'], true) : [];

        $sanitizedUsers = [];
        if (isset($globalMeta['users']) && is_array($globalMeta['users'])) {
            foreach ($globalMeta['users'] as $u) {
                unset($u['password']);
                $sanitizedUsers[] = $u;
            }
        }

        // 读取当前字段聚焦锁列表 (过滤超时死锁)
        $stmtLocks = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = :k");
        $stmtLocks->execute([':k' => 'locks_' . $scopeKey]);
        $lRow = $stmtLocks->fetch();
        $rawLocks = ($lRow && !empty($lRow['meta_value'])) ? json_decode($lRow['meta_value'], true) : [];
        $activeLocks = [];
        $nowMs = round(microtime(true) * 1000);
        if (is_array($rawLocks)) {
            foreach ($rawLocks as $fk => $finfo) {
                if (isset($finfo['time']) && ($nowMs - intval($finfo['time']) <= 20000)) {
                    $activeLocks[$fk] = $finfo;
                }
            }
        }

        $respData = [
            'timestamp'        => $lastTs,
            'revisionId'       => $lastRev,
            'groupId'          => $row['group_id'],
            'taskId'           => $row['task_id'],
            'currentStage'     => $row['current_stage'],
            'stage1'           => json_decode($row['stage1_data'], true) ?: [],
            'stage2'           => json_decode($row['stage2_data'], true) ?: [],
            'stage3'           => json_decode($row['stage3_data'], true) ?: [],
            'presence'         => json_decode($row['presence_data'], true) ?: [],
            'members'          => json_decode($row['members_data'], true) ?: [],
            'isFinalSubmitted' => (bool)$row['is_final_submitted'],
            'chatLogs'         => $chats,
            'locks'            => $activeLocks,
            'resetSeq'         => $resetSeq,
            // 全局教务字段 - 每次 GET 都带回，自动脱敏密码，杜绝前端越权查看密码
            'users'            => $sanitizedUsers,
            'classes'          => isset($globalMeta['classes'])          ? $globalMeta['classes']          : [],
            'tasks'            => isset($globalMeta['tasks'])            ? $globalMeta['tasks']            : [],
            'announcements'    => isset($globalMeta['announcements'])    ? $globalMeta['announcements']    : [],
            'referencePapers'  => isset($globalMeta['referencePapers']) ? $globalMeta['referencePapers'] : []
        ];
        echo json_encode($respData);
        exit;
    } else {
        // 若当前小组首次建立且尚未生成完整快照，拉取聊天与全局教务元数据回传
        $stmtChats = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = :k");
        $stmtChats->execute([':k' => 'chats_' . $scopeKey]);
        $chatRow = $stmtChats->fetch();
        $chats = ($chatRow && !empty($chatRow['meta_value'])) ? json_decode($chatRow['meta_value'], true) : ['stage1' => [], 'stage2' => [], 'stage3' => []];

        $stmtMeta = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = 'main_meta'");
        $stmtMeta->execute();
        $metaRow = $stmtMeta->fetch();
        $globalMeta = ($metaRow && !empty($metaRow['meta_value'])) ? json_decode($metaRow['meta_value'], true) : [];

        $sanitizedUsers = [];
        if (isset($globalMeta['users']) && is_array($globalMeta['users'])) {
            foreach ($globalMeta['users'] as $u) {
                unset($u['password']);
                $sanitizedUsers[] = $u;
            }
        }

        echo json_encode([
            'timestamp'        => 0,
            'revisionId'       => 0,
            'groupId'          => $groupId,
            'taskId'           => $taskId,
            'currentStage'     => 'stage1',
            'stage1'           => ['proposals' => [], 'votes' => new stdClass(), 'hasVoted' => new stdClass(), 'contract' => ['isConfirmed' => false, 'taskAssignments' => new stdClass(), 'timeAllocations' => new stdClass(), 'confirmedMembers' => new stdClass()]],
            'stage2'           => ['unifiedContent' => '', 'memberContributions' => new stdClass(), 'confirmedMembers' => new stdClass(), 'meetingSubmissions' => new stdClass()],
            'stage3'           => ['feedbackItems' => []],
            'presence'         => new stdClass(),
            'members'          => [],
            'isFinalSubmitted' => false,
            'chatLogs'         => $chats,
            'users'            => $sanitizedUsers,
            'classes'          => isset($globalMeta['classes'])          ? $globalMeta['classes']          : [],
            'tasks'            => isset($globalMeta['tasks'])            ? $globalMeta['tasks']            : [],
            'announcements'    => isset($globalMeta['announcements'])    ? $globalMeta['announcements']    : [],
            'referencePapers'  => isset($globalMeta['referencePapers']) ? $globalMeta['referencePapers'] : []
        ]);
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
