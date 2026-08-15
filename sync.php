<?php
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

$groupId = isset($_GET['groupId']) ? preg_replace('/[^a-zA-Z0-9_-]/', '', $_GET['groupId']) : 'group_1';
if (empty($groupId)) {
    $groupId = 'group_1';
}

$taskId = isset($_GET['taskId']) ? preg_replace('/[^a-zA-Z0-9_-]/', '', $_GET['taskId']) : 'default';
if (empty($taskId)) {
    $taskId = 'default';
}

$scopeKey = $taskId . '_' . $groupId;
$localFile = __DIR__ . '/db_' . $scopeKey . '.json';
$tmpFile = sys_get_temp_dir() . '/jizhi_db_' . $scopeKey . '.json';

$action = isset($_GET['action']) ? $_GET['action'] : '';

// 1. 账号唯一在线会话锁 (单账号单设备，后登录顶掉前登录)
$sessionFile = __DIR__ . '/sessions.json';
if ($action === 'session_login' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $rawInput = file_get_contents('php://input');
    $req = json_decode($rawInput, true) ?: [];
    $userId = isset($req['userId']) ? $req['userId'] : '';
    $token = isset($req['token']) ? $req['token'] : '';
    
    $sessions = [];
    if (file_exists($sessionFile)) {
        $sessions = json_decode(@file_get_contents($sessionFile), true) ?: [];
    }
    if (!empty($userId) && !empty($token)) {
        $sessions[$userId] = [
            'token' => $token,
            'lastActive' => time()
        ];
        @file_put_contents($sessionFile, json_encode($sessions));
        @chmod($sessionFile, 0666);
    }
    echo json_encode(['success' => true]);
    exit;
}

if ($action === 'session_check') {
    $userId = isset($_GET['userId']) ? $_GET['userId'] : '';
    $token = isset($_GET['token']) ? $_GET['token'] : '';
    
    $sessions = [];
    if (file_exists($sessionFile)) {
        $sessions = json_decode(@file_get_contents($sessionFile), true) ?: [];
    }
    
    if (!empty($userId) && isset($sessions[$userId])) {
        $current = $sessions[$userId];
        if ($current['token'] !== $token) {
            // 被后来的设备顶掉了
            echo json_encode(['valid' => false, 'kicked' => true]);
            exit;
        }
    }
    echo json_encode(['valid' => true, 'kicked' => false]);
    exit;
}

if ($action === 'session_logout') {
    $userId = isset($_GET['userId']) ? $_GET['userId'] : '';
    if (file_exists($sessionFile)) {
        $sessions = json_decode(@file_get_contents($sessionFile), true) ?: [];
        if (isset($sessions[$userId])) {
            unset($sessions[$userId]);
            @file_put_contents($sessionFile, json_encode($sessions));
        }
    }
    echo json_encode(['success' => true]);
    exit;
}

// 2. 扣子 (Coze v3) API 代理转发 (纯净无额外输出，直连官方 API)
if ($action === 'coze_chat' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $rawInput = file_get_contents('php://input');
    $req = json_decode($rawInput, true) ?: [];
    $botId = isset($req['bot_id']) ? $req['bot_id'] : '7673571806476828713';
    $userId = isset($req['user_id']) ? $req['user_id'] : 'student_user';
    $query = isset($req['query']) ? $req['query'] : '';
    $patToken = 'cztei_l9Cd0Wwe0Dacblzw7dIcIqwwvz4EFpANbGEww3yaUMTzVl0zKaOZ2Ad0Zc2u3rLJo';

    if (empty($query)) {
        echo json_encode(['success' => false, 'message' => 'Query is empty']);
        exit;
    }

    $cozeUrl = 'https://api.coze.cn/v3/chat';
    $headers = [
        'Authorization: Bearer ' . $patToken,
        'Content-Type: application/json'
    ];

    $payload = [
        'bot_id' => $botId,
        'user_id' => $userId,
        'stream' => false,
        'auto_save_history' => true,
        'additional_messages' => [
            [
                'role' => 'user',
                'content' => $query,
                'content_type' => 'text'
            ]
        ]
    ];

    $ch = curl_init($cozeUrl);
    curl_setopt($ch, CURLOPT_POST, 1);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
    curl_setopt($ch, CURLOPT_TIMEOUT, 20);

    $initResp = curl_exec($ch);
    curl_close($ch);

    $initData = json_decode($initResp, true) ?: [];
    $chatId = isset($initData['data']['id']) ? $initData['data']['id'] : null;
    $convId = isset($initData['data']['conversation_id']) ? $initData['data']['conversation_id'] : null;

    $answerText = '';
    if ($chatId && $convId) {
        for ($i = 0; $i < 15; $i++) {
            usleep(800000); // 800ms
            $pollUrl = "https://api.coze.cn/v3/chat/retrieve?chat_id={$chatId}&conversation_id={$convId}";
            $ch2 = curl_init($pollUrl);
            curl_setopt($ch2, CURLOPT_HTTPHEADER, $headers);
            curl_setopt($ch2, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch2, CURLOPT_SSL_VERIFYPEER, false);
            curl_setopt($ch2, CURLOPT_SSL_VERIFYHOST, false);
            curl_setopt($ch2, CURLOPT_TIMEOUT, 10);
            $pollResp = curl_exec($ch2);
            curl_close($ch2);

            $pData = json_decode($pollResp, true) ?: [];
            $status = isset($pData['data']['status']) ? $pData['data']['status'] : '';
            if ($status === 'completed') {
                $msgUrl = "https://api.coze.cn/v3/chat/message/list?chat_id={$chatId}&conversation_id={$convId}";
                $ch3 = curl_init($msgUrl);
                curl_setopt($ch3, CURLOPT_HTTPHEADER, $headers);
                curl_setopt($ch3, CURLOPT_RETURNTRANSFER, true);
                curl_setopt($ch3, CURLOPT_SSL_VERIFYPEER, false);
                curl_setopt($ch3, CURLOPT_SSL_VERIFYHOST, false);
                curl_setopt($ch3, CURLOPT_TIMEOUT, 10);
                $msgResp = curl_exec($ch3);
                curl_close($ch3);

                $mData = json_decode($msgResp, true) ?: [];
                $msgs = isset($mData['data']) ? $mData['data'] : [];
                foreach ($msgs as $m) {
                    if (isset($m['type']) && $m['type'] === 'answer') {
                        $answerText = isset($m['content']) ? $m['content'] : '';
                        break;
                    }
                }
                break;
            } elseif ($status === 'failed' || $status === 'requires_action' || $status === 'canceled') {
                break;
            }
        }
    }

    if (!empty($answerText)) {
        echo json_encode(['success' => true, 'reply' => $answerText]);
    } else {
        echo json_encode(['success' => false, 'message' => 'No answer from Coze']);
    }
    exit;
}

// 3. 数据快照持久化
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $rawInput = file_get_contents('php://input');
    if (!empty($rawInput)) {
        $ok1 = @file_put_contents($localFile, $rawInput);
        if ($ok1 !== false) {
            @chmod($localFile, 0666);
        }
        $ok2 = @file_put_contents($tmpFile, $rawInput);
        if ($ok2 !== false) {
            @chmod($tmpFile, 0666);
        }

        echo json_encode([
            'success' => true,
            'timestamp' => round(microtime(true) * 1000),
            'groupId' => $groupId,
            'written' => ($ok1 !== false || $ok2 !== false)
        ]);
        exit;
    }
    echo json_encode(['success' => false, 'message' => 'Empty payload']);
    exit;
}

// GET snapshot
if (file_exists($localFile) && filesize($localFile) > 0) {
    echo file_get_contents($localFile);
} elseif (file_exists($tmpFile) && filesize($tmpFile) > 0) {
    echo file_get_contents($tmpFile);
} else {
    echo json_encode([
        'timestamp' => 0,
        'groupId' => $groupId,
        'chatLogs' => ['stage1' => [], 'stage2' => [], 'stage3' => []],
        'stage2' => ['unifiedContent' => '']
    ]);
}
