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

// 1. 全局教务元数据 (用户池/班级/任务/通知/范文库)
if ($action === 'get_global_meta') {
    if ($pdo) {
        $stmt = $pdo->prepare("SELECT meta_value FROM global_meta WHERE meta_key = 'main_meta'");
        $stmt->execute();
        $row = $stmt->fetch();
        if ($row && !empty($row['meta_value'])) {
            echo $row['meta_value'];
            exit;
        }
    }
    // 降级兼容本地文件
    $globalDbFile = __DIR__ . '/global_db.json';
    if (file_exists($globalDbFile) && filesize($globalDbFile) > 0) {
        echo file_get_contents($globalDbFile);
    } else {
        echo json_encode(['users' => [], 'classes' => [], 'tasks' => [], 'announcements' => [], 'referencePapers' => []]);
    }
    exit;
}

if ($action === 'save_global_meta' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $rawInput = file_get_contents('php://input');
    if (!empty($rawInput)) {
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
    echo json_encode(['success' => true]);
    exit;
}

// 2. 账号唯一在线会话锁 (单账号单设备互斥)
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

// 4. 数据快照持久化 (MySQL 主存储)
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $rawInput = file_get_contents('php://input');
    if (!empty($rawInput)) {
        $data = json_decode($rawInput, true) ?: [];
        $ts = isset($data['timestamp']) ? intval($data['timestamp']) : round(microtime(true) * 1000);
        
        if ($pdo) {
            // 4a. 保存小组协作快照 (stage1/2/3, presence, members, chatLogs)
            $stmt = $pdo->prepare("INSERT INTO group_states 
                (scope_key, task_id, group_id, current_stage, stage1_data, stage2_data, stage3_data, presence_data, members_data, is_final_submitted, last_timestamp)
                VALUES (:sk, :tid, :gid, :cstg, :s1, :s2, :s3, :pr, :mb, :fin, :ts)
                ON DUPLICATE KEY UPDATE 
                current_stage = :cstg2, stage1_data = :s12, stage2_data = :s22, stage3_data = :s32,
                presence_data = :pr2, members_data = :mb2, is_final_submitted = :fin2, last_timestamp = :ts2");
            
            $stmt->execute([
                ':sk'    => $scopeKey,
                ':tid'   => $taskId,
                ':gid'   => $groupId,
                ':cstg'  => isset($data['currentStage']) ? $data['currentStage'] : 'stage1',
                ':s1'    => isset($data['stage1']) ? json_encode($data['stage1'], JSON_UNESCAPED_UNICODE) : '',
                ':s2'    => isset($data['stage2']) ? json_encode($data['stage2'], JSON_UNESCAPED_UNICODE) : '',
                ':s3'    => isset($data['stage3']) ? json_encode($data['stage3'], JSON_UNESCAPED_UNICODE) : '',
                ':pr'    => isset($data['presence']) ? json_encode($data['presence'], JSON_UNESCAPED_UNICODE) : '',
                ':mb'    => isset($data['members']) ? json_encode($data['members'], JSON_UNESCAPED_UNICODE) : '',
                ':fin'   => !empty($data['isFinalSubmitted']) ? 1 : 0,
                ':ts'    => $ts,
                ':cstg2' => isset($data['currentStage']) ? $data['currentStage'] : 'stage1',
                ':s12'   => isset($data['stage1']) ? json_encode($data['stage1'], JSON_UNESCAPED_UNICODE) : '',
                ':s22'   => isset($data['stage2']) ? json_encode($data['stage2'], JSON_UNESCAPED_UNICODE) : '',
                ':s32'   => isset($data['stage3']) ? json_encode($data['stage3'], JSON_UNESCAPED_UNICODE) : '',
                ':pr2'   => isset($data['presence']) ? json_encode($data['presence'], JSON_UNESCAPED_UNICODE) : '',
                ':mb2'   => isset($data['members']) ? json_encode($data['members'], JSON_UNESCAPED_UNICODE) : '',
                ':fin2'  => !empty($data['isFinalSubmitted']) ? 1 : 0,
                ':ts2'   => $ts
            ]);

            // 4b. 保存 chatLogs 到 global_meta 快速读取通道，并入库 chat_messages 表进行学术日志归档
            if (isset($data['chatLogs']) && is_array($data['chatLogs'])) {
                $stmtSaveChats = $pdo->prepare("INSERT INTO global_meta (meta_key, meta_value) VALUES (:k, :v) ON DUPLICATE KEY UPDATE meta_value = :v2");
                $chatJson = json_encode($data['chatLogs'], JSON_UNESCAPED_UNICODE);
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
                if (!empty($data['users']))           $existingMeta['users']           = $data['users'];
                if (!empty($data['classes']))         $existingMeta['classes']         = $data['classes'];
                if (isset($data['tasks']))            $existingMeta['tasks']           = $data['tasks'];
                if (isset($data['announcements']))    $existingMeta['announcements']   = $data['announcements'];
                if (isset($data['referencePapers']))  $existingMeta['referencePapers'] = $data['referencePapers'];

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
