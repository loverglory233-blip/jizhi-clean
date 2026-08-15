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

$localFile = __DIR__ . '/db_' . $groupId . '.json';
$tmpFile = sys_get_temp_dir() . '/jizhi_db_' . $groupId . '.json';

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

// 2. 数据快照持久化
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
