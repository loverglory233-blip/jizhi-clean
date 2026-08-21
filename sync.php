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

require_once __DIR__ . '/api/db_config.php';
require_once __DIR__ . '/api/db_init.php';

$pdo = getDbConnection();
if ($pdo) {
    initDatabaseTables();
}

$groupId = isset($_GET['groupId']) ? preg_replace('/[^a-zA-Z0-9_-]/', '', $_GET['groupId']) : 'group_1';
if (empty($groupId)) $groupId = 'group_1';

$taskId = isset($_GET['taskId']) ? preg_replace('/[^a-zA-Z0-9_-]/', '', $_GET['taskId']) : 'task_default';
if (empty($taskId)) $taskId = 'task_default';

$scopeKey = $taskId . '_' . $groupId;
$action = isset($_GET['action']) ? $_GET['action'] : '';

// 0. 教师附件文件上传（存服务器磁盘，返回可访问 URL）
if ($action === 'upload_file' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    header('Content-Type: application/json; charset=utf-8');
    $uploadDir = __DIR__ . '/uploads/';
    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0755, true);
    }
    if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
        echo json_encode(['success' => false, 'message' => '未接收到有效文件']);
        exit;
    }
    $originalName = basename($_FILES['file']['name']);
    $ext = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
    $allowed = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'png', 'jpg', 'jpeg', 'gif', 'zip'];
    if (!in_array($ext, $allowed)) {
        echo json_encode(['success' => false, 'message' => '不支持的文件类型']);
        exit;
    }
    $safeName = 'jizhi_' . time() . '_' . preg_replace('/[^a-zA-Z0-9._-]/', '_', $originalName);
    $destPath = $uploadDir . $safeName;
    if (!move_uploaded_file($_FILES['file']['tmp_name'], $destPath)) {
        echo json_encode(['success' => false, 'message' => '文件保存失败']);
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
    if ($pdo) {
        $stmt = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = 'main_meta'");
        $stmt->execute();
        $row = $stmt->fetch();
        if ($row && !empty($row['meta_value'])) {
            $parsed = json_decode($row['meta_value'], true);
            // 🛡️ 严格检验：只有当解析出来是包含教务字段（classes/tasks/users）的对象时才返回
            if (is_array($parsed) && (isset($parsed['classes']) || isset($parsed['tasks']) || isset($parsed['users']))) {
                echo $row['meta_value'];
                exit;
            }
        }
    }
    // 降级兼容本地文件
    $globalDbFile = __DIR__ . '/global_db.json';
    if (file_exists($globalDbFile) && filesize($globalDbFile) > 0) {
        $fileContent = file_get_contents($globalDbFile);
        $parsedFile = json_decode($fileContent, true);
        if (is_array($parsedFile) && (isset($parsedFile['classes']) || isset($parsedFile['tasks']) || isset($parsedFile['users']))) {
            echo $fileContent;
            exit;
        }
    }
        $defaultMeta = [
            'users' => [
                ['id' => 'u_teacher1', 'username' => '1001', 'studentCode' => '1001', 'password' => '123', 'name' => '老师', 'role' => 'teacher', 'avatar' => '👩‍🏫'],
                ['id' => 'u_studentA', 'username' => '202601', 'studentCode' => '202601', 'password' => '123', 'name' => '李明 (组长)', 'role' => 'student', 'avatar' => '👨‍🎓', 'classId' => 'class_101', 'groupId' => 'group_1'],
                ['id' => 'u_studentB', 'username' => '202602', 'studentCode' => '202602', 'password' => '123', 'name' => '王芳 (组员)', 'role' => 'student', 'avatar' => '👩‍🎓', 'classId' => 'class_101', 'groupId' => 'group_1'],
                ['id' => 'u_studentC', 'username' => '202603', 'studentCode' => '202603', 'password' => '123', 'name' => '陈强 (组员)', 'role' => 'student', 'avatar' => '🧑‍🎓', 'classId' => 'class_101', 'groupId' => 'group_1']
            ],
            'classes' => [
                [
                    'id' => 'class_101',
                    'name' => '《现代教育技术》2026春01班',
                    'code' => 'ET2026-01',
                    'studentIds' => ['u_studentA', 'u_studentB', 'u_studentC'],
                    'groups' => [
                        [
                            'id' => 'group_1',
                            'name' => '第 1 协作小组 (测试组)',
                            'members' => [
                                ['id' => 'u_studentA', 'name' => '李明', 'studentCode' => '202601', 'role' => '组长', 'roleTitle' => '组长', 'avatar' => '👨‍🎓', 'color' => '#2563eb'],
                                ['id' => 'u_studentB', 'name' => '王芳', 'studentCode' => '202602', 'role' => '组员', 'roleTitle' => '组员', 'avatar' => '👩‍🎓', 'color' => '#10b981'],
                                ['id' => 'u_studentC', 'name' => '陈强', 'studentCode' => '202603', 'role' => '组员', 'roleTitle' => '组员', 'avatar' => '🧑‍🎓', 'color' => '#f59e0b']
                            ]
                        ]
                    ]
                ]
            ],
            'tasks' => [
                [
                    'id' => 'task_default',
                    'title' => '期末协作写作 (默认测试任务)',
                    'classId' => 'class_101',
                    'className' => '《现代教育技术》2026春01班',
                    'durationMinutes' => 150,
                    'startTime' => '2026/08/01 08:00',
                    'deadline' => '2026/08/30 23:59',
                    'status' => 'in_progress',
                    'createdAt' => '2026/08/01',
                    'instructions' => '请各小组成员协同完成多智能体学术论文研讨与写作。',
                    'resources' => []
                ]
            ],
            'announcements' => [],
            'referencePapers' => [],
            'surveys' => []
        ];
        
        $jsonStr = json_encode($defaultMeta, JSON_UNESCAPED_UNICODE);
        if ($pdo) {
            $healStmt = $pdo->prepare("INSERT INTO global_meta (meta_key, meta_value) VALUES ('main_meta', :v) ON DUPLICATE KEY UPDATE meta_value = :v2");
            $healStmt->execute([':v' => $jsonStr, ':v2' => $jsonStr]);
        }
        @file_put_contents(__DIR__ . '/global_db.json', $jsonStr);
        echo $jsonStr;
        exit;
}

if ($action === 'save_global_meta' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $rawInput = file_get_contents('php://input');
    if (!empty($rawInput)) {
        $decoded = json_decode($rawInput, true);
        // 🛡️ 严格校验：必须是包含有效教务字段的 JSON 结构，防止空数据或脏请求冲刷
        if (is_array($decoded) && (isset($decoded['classes']) || isset($decoded['tasks']) || isset($decoded['users']))) {
            if ($pdo) {
                $stmt = $pdo->prepare("INSERT INTO global_meta (meta_key, meta_value) VALUES ('main_meta', :val) ON DUPLICATE KEY UPDATE meta_value = :val2");
                $stmt->execute([':val' => $rawInput, ':val2' => $rawInput]);
                // 写入变更信号时间戳，让所有轮询设备的 pullFromServer 在下次 400ms 时立刻感知到全局数据已变
                $nowMs = round(microtime(true) * 1000);
                $stmt2 = $pdo->prepare("INSERT INTO global_meta (meta_key, meta_value) VALUES ('meta_updated_at', :v) ON DUPLICATE KEY UPDATE meta_value = :v2");
                $stmt2->execute([':v' => $nowMs, ':v2' => $nowMs]);
            }
            @file_put_contents(__DIR__ . '/global_db.json', $rawInput);
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
                        if ($groupId) $ann['readGroupStatus'][$groupId] = true;

                        $exists = false;
                        foreach ($ann['confirmedMembers'] as $cm) {
                            if (is_array($cm) && isset($cm['id']) && $cm['id'] === $userId) {
                                $exists = true;
                                break;
                            }
                        }
                        if (!$exists && $userId) {
                            $ann['confirmedMembers'][] = [
                                'id' => $userId,
                                'name' => $userName ?: ($userCode ?: '学生'),
                                'studentCode' => $userCode ?: '',
                                'groupId' => $groupId ?: ''
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


if ($action === 'session_login' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $rawInput = file_get_contents('php://input');
    $req = json_decode($rawInput, true) ?: [];
    $userId = isset($req['userId']) ? $req['userId'] : '';
    $token = isset($req['token']) ? $req['token'] : '';
    if ($userId && $token && $pdo) {
        $stmt = $pdo->prepare("INSERT INTO global_meta (meta_key, meta_value) VALUES (:k, :v) ON DUPLICATE KEY UPDATE meta_value = :v2");
        $stmt->execute([':k' => 'sess_' . $userId, ':v' => $token, ':v2' => $token]);
    }
    echo json_encode(['success' => true]);
    exit;
}

if ($action === 'session_check') {
    $userId = isset($_GET['userId']) ? $_GET['userId'] : '';
    $token = isset($_GET['token']) ? $_GET['token'] : '';
    $kicked = false;
    if ($userId && $token && $pdo) {
        $stmt = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = :k");
        $stmt->execute([':k' => 'sess_' . $userId]);
        $row = $stmt->fetch();
        if ($row && !empty($row['meta_value'])) {
            if ($row['meta_value'] !== $token) {
                $kicked = true;
            }
        }
    }
    echo json_encode(['kicked' => $kicked]);
    exit;
}

if ($action === 'session_logout') {
    $userId = isset($_GET['userId']) ? $_GET['userId'] : '';
    if ($userId && $pdo) {
        $stmt = $pdo->prepare("DELETE FROM global_meta WHERE meta_key = :k");
        $stmt->execute([':k' => 'sess_' . $userId]);
    }
    echo json_encode(['success' => true]);
    exit;
}

// 3. 扣子 (Coze v3) API 代理转发 (引入规范化 OAuth 引擎)
if ($action === 'coze_chat' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    require_once __DIR__ . '/api/chat_api.php';
    exit;
}

// 3b. 教师端原子重置小组协同数据 (独立可靠通道，绝不依赖并发锁)
if ($action === 'reset_group' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $nowMs = round(microtime(true) * 1000);
    $newResetSeq = 1;
    if ($pdo) {
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
    }

    // 清理本地文件备份
    @file_put_contents(__DIR__ . '/db_' . $scopeKey . '.json', json_encode([
        'timestamp' => $nowMs, 'groupId' => $groupId, 'taskId' => $taskId, 'currentStage' => 'stage1',
        'stage1' => [], 'stage2' => ['unifiedContent' => ''], 'stage3' => [], 'chatLogs' => ['stage1' => [], 'stage2' => [], 'stage3' => []],
        'resetSeq' => $newResetSeq, 'isReset' => true
    ], JSON_UNESCAPED_UNICODE));

    echo json_encode(['success' => true, 'resetSeq' => $newResetSeq, 'timestamp' => $nowMs]);
    exit;
}

// 4. 数据快照持久化 (MySQL 主存储)
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $rawInput = file_get_contents('php://input');
    if (!empty($rawInput)) {
        $data = json_decode($rawInput, true) ?: [];
        $ts = isset($data['timestamp']) ? intval($data['timestamp']) : round(microtime(true) * 1000);
        
        if ($pdo) {
            $isResetVal = !empty($data['isReset']) ? 1 : 0;
            
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
                // ── 普通推送：如果客户端 reset_seq 落后于服务端，说明该客户端还没处理重置，拒绝本次推送 ──
                $clientResetSeq = isset($data['resetSeq']) ? intval($data['resetSeq']) : 0;
                if ($clientResetSeq < $serverResetSeq) {
                    // 客户端数据是重置前的旧数据，拒绝写入，返回当前服务端 reset_seq 提醒客户端同步
                    echo json_encode([
                        'success'    => false,
                        'stale'      => true,
                        'resetSeq'   => $serverResetSeq,
                        'message'    => 'Client is behind reset sequence, please sync first'
                    ]);
                    exit;
                }
            }
            // 4a. 读取已有的协作状态，进行字段级智能合并保护（杜绝多端互相覆盖）
            $existingPresence = [];
            $existingS1 = [];
            $existingS2 = [];
            $existingS3 = [];
            $stmtGetState = $pdo->prepare("SELECT presence_data, stage1_data, stage2_data, stage3_data FROM group_states WHERE scope_key = :sk");
            $stmtGetState->execute([':sk' => $scopeKey]);
            $stRow = $stmtGetState->fetch();
            if ($stRow) {
                if (!empty($stRow['presence_data'])) $existingPresence = json_decode($stRow['presence_data'], true) ?: [];
                if (!empty($stRow['stage1_data']))   $existingS1 = json_decode($stRow['stage1_data'], true) ?: [];
                if (!empty($stRow['stage2_data']))   $existingS2 = json_decode($stRow['stage2_data'], true) ?: [];
                if (!empty($stRow['stage3_data']))   $existingS3 = json_decode($stRow['stage3_data'], true) ?: [];
            }

            // 合并 presence
            $incomingPresence = (isset($data['presence']) && is_array($data['presence'])) ? $data['presence'] : [];
            $mergedPresence = array_merge($existingPresence, $incomingPresence);

            // 合并 stage1
            $incomingS1 = (isset($data['stage1']) && is_array($data['stage1'])) ? $data['stage1'] : [];
            $mergedS1 = $incomingS1;
            if (!empty($existingS1) && !$isResetVal) {
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
                $mergedS1['votes'] = array_merge($exVotes, $inVotes);
                $exHasVoted = isset($existingS1['hasVoted']) && is_array($existingS1['hasVoted']) ? $existingS1['hasVoted'] : [];
                $inHasVoted = isset($incomingS1['hasVoted']) && is_array($incomingS1['hasVoted']) ? $incomingS1['hasVoted'] : [];
                $mergedS1['hasVoted'] = array_merge($exHasVoted, $inHasVoted);
                $exConfirmed = isset($existingS1['contract']['confirmedMembers']) && is_array($existingS1['contract']['confirmedMembers']) ? $existingS1['contract']['confirmedMembers'] : [];
                $inConfirmed = isset($incomingS1['contract']['confirmedMembers']) && is_array($incomingS1['contract']['confirmedMembers']) ? $incomingS1['contract']['confirmedMembers'] : [];
                if (!isset($mergedS1['contract'])) $mergedS1['contract'] = [];
                $mergedS1['contract']['confirmedMembers'] = array_merge($exConfirmed, $inConfirmed);
                if (!empty($existingS1['contract']['isConfirmed']) || !empty($incomingS1['contract']['isConfirmed'])) {
                    $mergedS1['contract']['isConfirmed'] = true;
                }
            }

            // 合并 stage2
            $incomingS2 = (isset($data['stage2']) && is_array($data['stage2'])) ? $data['stage2'] : [];
            $mergedS2 = $incomingS2;
            if (!empty($existingS2) && !$isResetVal) {
                if (empty($incomingS2['unifiedContent']) && !empty($existingS2['unifiedContent'])) {
                    $mergedS2['unifiedContent'] = $existingS2['unifiedContent'];
                }
                $exSubs = isset($existingS2['meetingSubmissions']) && is_array($existingS2['meetingSubmissions']) ? $existingS2['meetingSubmissions'] : [];
                $inSubs = isset($incomingS2['meetingSubmissions']) && is_array($incomingS2['meetingSubmissions']) ? $incomingS2['meetingSubmissions'] : [];
                $mergedS2['meetingSubmissions'] = array_merge($exSubs, $inSubs);
                if (!empty($existingS2['actionPlan']['isGenerated']) && empty($incomingS2['actionPlan']['isGenerated'])) {
                    $mergedS2['actionPlan'] = $existingS2['actionPlan'];
                }
            }

            // 合并 stage3
            $incomingS3 = (isset($data['stage3']) && is_array($data['stage3'])) ? $data['stage3'] : [];
            $mergedS3 = $incomingS3;
            if (!empty($existingS3) && !$isResetVal) {
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
                            if (!empty($it['response']) || (isset($it['status']) && $it['status'] === 'adopted')) {
                                $itemMap[$id] = array_merge($itemMap[$id], $it);
                            }
                        }
                    }
                }
                $mergedS3['feedbackItems'] = array_values($itemMap);
            }

            // 保存小组协作快照
            $stmt = $pdo->prepare("INSERT INTO group_states 
                (scope_key, task_id, group_id, current_stage, stage1_data, stage2_data, stage3_data, presence_data, members_data, is_final_submitted, last_timestamp)
                VALUES (:sk, :tid, :gid, :cstg, :s1, :s2, :s3, :pr, :mb, :fin, :ts)
                ON DUPLICATE KEY UPDATE 
                current_stage = :cstg2, stage1_data = :s12, stage2_data = :s22, stage3_data = :s32,
                presence_data = :pr2, members_data = :mb2, is_final_submitted = :fin2, last_timestamp = :ts2");
            
            $s1Json = json_encode($isResetVal ? ($data['stage1'] ?? []) : $mergedS1, JSON_UNESCAPED_UNICODE);
            $s2Json = json_encode($isResetVal ? ($data['stage2'] ?? []) : $mergedS2, JSON_UNESCAPED_UNICODE);
            $s3Json = json_encode($isResetVal ? ($data['stage3'] ?? []) : $mergedS3, JSON_UNESCAPED_UNICODE);
            $prJson = json_encode($isResetVal ? [] : $mergedPresence, JSON_UNESCAPED_UNICODE);
            $mbJson = isset($data['members']) ? json_encode($data['members'], JSON_UNESCAPED_UNICODE) : '';

            $stmt->execute([
                ':sk'    => $scopeKey,
                ':tid'   => $taskId,
                ':gid'   => $groupId,
                ':cstg'  => isset($data['currentStage']) ? $data['currentStage'] : 'stage1',
                ':s1'    => $s1Json,
                ':s2'    => $s2Json,
                ':s3'    => $s3Json,
                ':pr'    => $prJson,
                ':mb'    => $mbJson,
                ':fin'   => !empty($data['isFinalSubmitted']) ? 1 : 0,
                ':ts'    => $ts,
                ':cstg2' => isset($data['currentStage']) ? $data['currentStage'] : 'stage1',
                ':s12'   => $s1Json,
                ':s22'   => $s2Json,
                ':s32'   => $s3Json,
                ':pr2'   => $prJson,
                ':mb2'   => $mbJson,
                ':fin2'  => !empty($data['isFinalSubmitted']) ? 1 : 0,
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
            }

            // 4c. 同步保存全局教务元数据 (users/classes/tasks/announcements/referencePapers)
            // pushSnapshot 每次都携带这些字段，服务端必须持久化，GET 时才能带给其他设备
            $hasGlobalMeta = !empty($data['users']) || !empty($data['classes']) || !empty($data['tasks']);
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

        // 本地文件双写备份，确保极端情况下 100% 容灾
        @file_put_contents(__DIR__ . '/db_' . $scopeKey . '.json', $rawInput);

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
    $stmt = $pdo->prepare("SELECT * FROM group_states WHERE scope_key = :sk");
    $stmt->execute([':sk' => $scopeKey]);
    $row = $stmt->fetch();
    
    if ($row) {
        $stmtChats = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = :k");
        $stmtChats->execute([':k' => 'chats_' . $scopeKey]);
        $chatRow = $stmtChats->fetch();
        $chats = ($chatRow && !empty($chatRow['meta_value'])) ? json_decode($chatRow['meta_value'], true) : ['stage1' => [], 'stage2' => [], 'stage3' => []];

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

        $respData = [
            'timestamp'        => intval($row['last_timestamp']),
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
            'resetSeq'         => $resetSeq,
            // 全局教务字段 - 每次 GET 都带回，让前端 handleRemoteSync 能同步用户池和班级
            'users'            => isset($globalMeta['users'])            ? $globalMeta['users']            : [],
            'classes'          => isset($globalMeta['classes'])          ? $globalMeta['classes']          : [],
            'tasks'            => isset($globalMeta['tasks'])            ? $globalMeta['tasks']            : [],
            'announcements'    => isset($globalMeta['announcements'])    ? $globalMeta['announcements']    : [],
            'referencePapers'  => isset($globalMeta['referencePapers']) ? $globalMeta['referencePapers'] : []
        ];
        echo json_encode($respData);
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
