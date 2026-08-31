<?php
/**
 * 扣子 (Coze V3) 核心通信引擎 (支持 OAuth 2.0 静默自动续期)
 * 职责：检查并自动获取 OAuth Access Token -> Prompt 组装 -> 发起 Chat -> 轮询 Retrieve -> 获取 Message -> 返回纯净回答
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/coze_prompt.php';

header('Content-Type: application/json; charset=utf-8');
// 🛡️ 仅允许同源或配置的受信来源，杜绝任意域跨站读取 OAuth Token 与学生数据
if (!empty($CORS_ALLOWED_ORIGIN)) {
    header('Access-Control-Allow-Origin: ' . $CORS_ALLOWED_ORIGIN);
}
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit(0);
}

$isPoll = (isset($_GET['action']) && $_GET['action'] === 'coze_poll') || isset($_GET['poll']) || isset($_GET['chat_id']) || isset($_GET['chatId']);
if ($_SERVER['REQUEST_METHOD'] !== 'POST' && !$isPoll) {
    echo json_encode(['success' => false, 'message' => 'Only POST or Poll allowed']);
    exit;
}

$rawInput = file_get_contents('php://input');
$req = json_decode($rawInput, true) ?: [];
$action = isset($_GET['action']) ? $_GET['action'] : (isset($req['action']) ? $req['action'] : '');

/**
 * 自动获取或刷新 OAuth Access Token (带本地文件缓存与排他锁并发保护)
 */
function getCozeAccessToken($forceRefresh = false) {
    global $COZE_APP_ID, $COZE_KEY_ID, $COZE_PRIVATE_KEY_FILE, $COZE_OAUTH_TOKEN_URL;
    
    $cacheFile = __DIR__ . '/token_cache.json';
    if (!$forceRefresh && file_exists($cacheFile)) {
        $fp = @fopen($cacheFile, 'r');
        if ($fp) {
            @flock($fp, LOCK_SH);
            $raw = @stream_get_contents($fp);
            @flock($fp, LOCK_UN);
            @fclose($fp);
            if (!empty($raw)) {
                $cached = json_decode($raw, true);
                if ($cached && isset($cached['access_token']) && isset($cached['expires_at'])) {
                    // 提前 5 分钟换新，确保绝对不失效
                    if (time() < ($cached['expires_at'] - 300)) {
                        return $cached['access_token'];
                    }
                }
            }
        }
    }

    if (!file_exists($COZE_PRIVATE_KEY_FILE)) {
        return null;
    }

    $privateKeyContent = file_get_contents($COZE_PRIVATE_KEY_FILE);
    $now = time();

    // 1. 构造 JWT Header 与 Payload
    $header = ['alg' => 'RS256', 'typ' => 'JWT', 'kid' => $COZE_KEY_ID];
    $payload = [
        'iss' => $COZE_APP_ID,
        'aud' => 'api.coze.cn',
        'iat' => $now,
        'exp' => $now + 3600,
        'jti' => (string)$now . '_' . mt_rand(1000, 9999)
    ];

    $b64Url = function($data) {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    };

    $seg1 = $b64Url(json_encode($header));
    $seg2 = $b64Url(json_encode($payload));
    $toSign = $seg1 . '.' . $seg2;

    // 2. 使用 OpenSSL 进行 SHA256WithRSA 签名
    $privateKey = openssl_pkey_get_private($privateKeyContent);
    if (!$privateKey) {
        return null;
    }

    $signature = '';
    $ok = openssl_sign($toSign, $signature, $privateKey, OPENSSL_ALGO_SHA256);
    if (!$ok) {
        return null;
    }

    $jwtToken = $seg1 . '.' . $seg2 . '.' . $b64Url($signature);

    // 3. POST 请求获取 Access Token
    $ch = curl_init($COZE_OAUTH_TOKEN_URL);
    curl_setopt($ch, CURLOPT_POST, 1);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
        'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        'duration_seconds' => 86399
    ]));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Authorization: Bearer ' . $jwtToken,
        'Content-Type: application/json'
    ]);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);
    curl_setopt($ch, CURLOPT_TIMEOUT, 15);
    $resp = curl_exec($ch);
    curl_close($ch);

    $resData = json_decode($resp, true);
    if ($resData && isset($resData['access_token'])) {
        $expiresIn = isset($resData['expires_in']) ? intval($resData['expires_in']) : 0;
        $expiresAt = ($expiresIn > $now) ? $expiresIn : ($now + ($expiresIn > 0 ? $expiresIn : 86400));
        $cachedData = [
            'access_token' => $resData['access_token'],
            'expires_at' => $expiresAt
        ];
        @file_put_contents($cacheFile, json_encode($cachedData), LOCK_EX);
        @chmod($cacheFile, 0600);
        return $resData['access_token'];
    }

    return null;
}

// 0. 单独的非阻塞状态轮询通道 (coze_poll)
$pollChatId = $_GET['chat_id'] ?? ($req['chat_id'] ?? ($_GET['chatId'] ?? ($req['chatId'] ?? '')));
$pollConvId = $_GET['conversation_id'] ?? ($req['conversation_id'] ?? ($_GET['conversationId'] ?? ($req['conversationId'] ?? '')));
$pollBotId  = $_GET['bot_id'] ?? ($req['bot_id'] ?? (isset($COZE_BOTS['auctioneer']) ? $COZE_BOTS['auctioneer'] : ''));

if (!empty($pollChatId) && !empty($pollConvId) && ($action === 'coze_poll' || isset($_GET['poll']))) {
    $accessToken = getCozeAccessToken();
    if (!$accessToken) {
        echo json_encode(['success' => false, 'completed' => true, 'message' => 'OAuth token error']);
        exit;
    }
    $headers = ['Authorization: Bearer ' . $accessToken, 'Content-Type: application/json'];
    $pollUrl = $COZE_API_BASE_URL . "/chat/retrieve?chat_id={$pollChatId}&conversation_id={$pollConvId}";
    $ch = curl_init($pollUrl);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);
    curl_setopt($ch, CURLOPT_TIMEOUT, 6);
    $pollResp = curl_exec($ch);
    curl_close($ch);

    $pData = json_decode($pollResp, true) ?: [];
    $status = isset($pData['data']['status']) ? $pData['data']['status'] : '';

    if ($status === 'completed') {
        $msgUrl = $COZE_API_BASE_URL . "/chat/message/list?chat_id={$pollChatId}&conversation_id={$pollConvId}";
        $ch3 = curl_init($msgUrl);
        curl_setopt($ch3, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch3, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch3, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch3, CURLOPT_SSL_VERIFYHOST, 0);
        curl_setopt($ch3, CURLOPT_TIMEOUT, 6);
        $msgResp = curl_exec($ch3);
        curl_close($ch3);

        $mData = json_decode($msgResp, true) ?: [];
        $msgs = isset($mData['data']) ? $mData['data'] : [];
        $answerText = '';
        foreach ($msgs as $m) {
            if (isset($m['type']) && $m['type'] === 'answer') {
                $answerText = isset($m['content']) ? $m['content'] : '';
                break;
            }
        }
        echo json_encode(['success' => true, 'completed' => true, 'reply' => $answerText, 'bot_id' => $pollBotId]);
        exit;
    } else if ($status === 'failed' || $status === 'canceled') {
        echo json_encode(['success' => false, 'completed' => true, 'message' => 'Coze chat ' . $status]);
        exit;
    } else {
        echo json_encode(['success' => true, 'completed' => false, 'status' => $status]);
        exit;
    }
}

$botKey = isset($req['bot_key']) ? $req['bot_key'] : '';
$botId = isset($req['bot_id']) ? $req['bot_id'] : '';
if (empty($botId) && !empty($botKey) && isset($COZE_BOTS[$botKey])) {
    $botId = $COZE_BOTS[$botKey];
}
if (empty($botId)) {
    $botId = isset($COZE_BOTS['auctioneer']) ? $COZE_BOTS['auctioneer'] : '';
}

$userId = isset($req['user_id']) ? $req['user_id'] : 'student_user';
$userQuery = isset($req['query']) ? $req['query'] : '';
$stage = isset($req['stage']) ? $req['stage'] : '';
$topic = isset($req['topic']) ? $req['topic'] : '';
$actualDoc = isset($req['actual_doc']) ? $req['actual_doc'] : '';
$priorReview = isset($req['prior_review']) ? $req['prior_review'] : '';

if (empty($userQuery)) {
    echo json_encode(['success' => false, 'message' => 'Query is empty']);
    exit;
}

// 1. 获取持久自动续期的 Token
$accessToken = getCozeAccessToken();
if (!$accessToken) {
    echo json_encode([
        'success' => false,
        'message' => 'OAuth token generation failed'
    ]);
    exit;
}

// 2. 使用 Prompt 工厂进行结构化组装
$assembledPrompt = CozePromptFactory::buildPrompt($stage, $topic, $userQuery, $actualDoc, $botKey, $priorReview);

// 3. 发起 Chat 请求
$cozeUrl = $COZE_API_BASE_URL . '/chat';
$headers = [
    'Authorization: Bearer ' . $accessToken,
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
curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);
curl_setopt($ch, CURLOPT_TIMEOUT, 12);

$initResp = curl_exec($ch);
curl_close($ch);

$initData = json_decode($initResp, true) ?: [];
$chatId = isset($initData['data']['id']) ? $initData['data']['id'] : null;
$convId = isset($initData['data']['conversation_id']) ? $initData['data']['conversation_id'] : null;

// 🛡️ 智能 Token 4100/4001 失效自愈：自动清除缓存、换新 Token 并重试一次
if (!$chatId && isset($initData['code']) && in_array(intval($initData['code']), [4100, 4001, 4000, 4002, 4003, 401])) {
    $cacheFile = __DIR__ . '/token_cache.json';
    @unlink($cacheFile);
    $accessToken = getCozeAccessToken(true);
    if ($accessToken) {
        $headers = ['Authorization: Bearer ' . $accessToken, 'Content-Type: application/json'];
        $chRetry = curl_init($cozeUrl);
        curl_setopt($chRetry, CURLOPT_POST, 1);
        curl_setopt($chRetry, CURLOPT_POSTFIELDS, json_encode($payload));
        curl_setopt($chRetry, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($chRetry, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($chRetry, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($chRetry, CURLOPT_SSL_VERIFYHOST, 0);
        curl_setopt($chRetry, CURLOPT_TIMEOUT, 12);
        $initResp = curl_exec($chRetry);
        curl_close($chRetry);
        $initData = json_decode($initResp, true) ?: [];
        $chatId = isset($initData['data']['id']) ? $initData['data']['id'] : null;
        $convId = isset($initData['data']['conversation_id']) ? $initData['data']['conversation_id'] : null;
    }
}

$answerText = '';
if ($chatId && $convId) {
    // 4. 极速阶梯探测 40 轮 (前 10 轮 100ms 快速捕获，后 30 轮 200ms 紧密等待)，95% 请求在单次秒级内完成直出
    for ($i = 0; $i < 40; $i++) {
        usleep($i < 10 ? 100000 : 200000); // 100ms / 200ms
        $pollUrl = $COZE_API_BASE_URL . "/chat/retrieve?chat_id={$chatId}&conversation_id={$convId}";
        $ch2 = curl_init($pollUrl);
        curl_setopt($ch2, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch2, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch2, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch2, CURLOPT_SSL_VERIFYHOST, 0);
        curl_setopt($ch2, CURLOPT_TIMEOUT, 6);
        $pollResp = curl_exec($ch2);
        curl_close($ch2);

        $pData = json_decode($pollResp, true) ?: [];
        $status = isset($pData['data']['status']) ? $pData['data']['status'] : '';
        
        if ($status === 'completed') {
            $msgUrl = $COZE_API_BASE_URL . "/chat/message/list?chat_id={$chatId}&conversation_id={$convId}";
            $ch3 = curl_init($msgUrl);
            curl_setopt($ch3, CURLOPT_HTTPHEADER, $headers);
            curl_setopt($ch3, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch3, CURLOPT_SSL_VERIFYPEER, false);
            curl_setopt($ch3, CURLOPT_SSL_VERIFYHOST, 0);
            curl_setopt($ch3, CURLOPT_TIMEOUT, 6);
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
        } elseif ($status === 'failed' || $status === 'canceled') {
            break;
        }
    }
}

if (!empty($answerText)) {
    echo json_encode([
        'success' => true,
        'completed' => true,
        'reply' => $answerText,
        'bot_id' => $botId
    ]);
} else if ($chatId && $convId) {
    // 释放 PHP 进程，让前端以轻量单次请求继续非阻塞轮询，彻底杜绝 PHP 进程池耗尽卡死
    echo json_encode([
        'success' => true,
        'completed' => false,
        'in_progress' => true,
        'chat_id' => $chatId,
        'conversation_id' => $convId,
        'bot_id' => $botId
    ]);
} else {
    echo json_encode([
        'success' => false,
        'message' => 'No answer from Coze API',
        'raw_init' => $initData
    ]);
}
