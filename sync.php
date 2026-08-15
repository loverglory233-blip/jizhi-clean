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
