<?php
/**
 * 扣子 (Coze V3) 核心通信引擎
 * 职责：接收请求 -> Prompt 组装 -> 发起 Chat -> 轮询 Retrieve -> 获取 Message/List -> 返回真实回答
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit(0);
}

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/coze_prompt.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'message' => 'Only POST allowed']);
    exit;
}

$rawInput = file_get_contents('php://input');
$req = json_decode($rawInput, true) ?: [];

$botKey = isset($req['bot_key']) ? $req['bot_key'] : '';
$botId = isset($req['bot_id']) ? $req['bot_id'] : '';
if (empty($botId) && !empty($botKey) && isset($COZE_BOTS[$botKey])) {
    $botId = $COZE_BOTS[$botKey];
}
if (empty($botId)) {
    $botId = '7673571806476828713';
}

$userId = isset($req['user_id']) ? $req['user_id'] : 'student_user';
$userQuery = isset($req['query']) ? $req['query'] : '';
$stage = isset($req['stage']) ? $req['stage'] : '';
$topic = isset($req['topic']) ? $req['topic'] : '';
$actualDoc = isset($req['actual_doc']) ? $req['actual_doc'] : '';

if (empty($userQuery)) {
    echo json_encode(['success' => false, 'message' => 'Query is empty']);
    exit;
}

// 1. 使用 Prompt 工厂进行结构化组装
$assembledPrompt = CozePromptFactory::buildPrompt($stage, $topic, $userQuery, $actualDoc);

// 2. 发起 Chat 请求
$cozeUrl = $COZE_API_BASE_URL . '/chat';
$headers = [
    'Authorization: Bearer ' . $COZE_API_KEY,
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
            'content' => $assembledPrompt,
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
    // 3. 轮询 Retrieve 状态
    for ($i = 0; $i < 15; $i++) {
        usleep(800000); // 800ms
        $pollUrl = $COZE_API_BASE_URL . "/chat/retrieve?chat_id={$chatId}&conversation_id={$convId}";
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
            // 4. 拉取 Message 列表中的最新回复
            $msgUrl = $COZE_API_BASE_URL . "/chat/message/list?chat_id={$chatId}&conversation_id={$convId}";
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
    echo json_encode([
        'success' => true,
        'reply' => $answerText,
        'bot_id' => $botId
    ]);
} else {
    echo json_encode([
        'success' => false,
        'message' => 'No answer from Coze API',
        'raw_init' => $initData
    ]);
}
