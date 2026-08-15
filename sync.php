<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

$groupId = isset($_GET['groupId']) ? preg_replace('/[^a-zA-Z0-9_-]/', '', $_GET['groupId']) : 'group_1';
if (empty($groupId)) {
    $groupId = 'group_1';
}
$dbFile = __DIR__ . '/db_' . $groupId . '.json';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $rawInput = file_get_contents('php://input');
    if (!empty($rawInput)) {
        file_put_contents($dbFile, $rawInput);
        echo json_encode(['success' => true, 'timestamp' => time() * 1000]);
        exit;
    }
    echo json_encode(['success' => false, 'message' => 'Empty payload']);
    exit;
}

if (file_exists($dbFile)) {
    echo file_get_contents($dbFile);
} else {
    echo json_encode(['timestamp' => 0]);
}
