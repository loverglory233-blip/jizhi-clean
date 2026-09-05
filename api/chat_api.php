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

global $RAW_INPUT, $REQ_DATA;
$rawInput = !empty($RAW_INPUT) ? $RAW_INPUT : @file_get_contents('php://input');
$req = !empty($REQ_DATA) ? $REQ_DATA : (@json_decode($rawInput, true) ?: []);
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
    curl_setopt($ch, CURLOPT_IPRESOLVE, CURL_IPRESOLVE_V4);
    curl_setopt($ch, CURLOPT_TCP_NODELAY, 1);
    curl_setopt($ch, CURLOPT_ENCODING, '');
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 4);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);
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
$taskType = isset($req['task_type']) ? $req['task_type'] : (isset($req['taskType']) ? $req['taskType'] : 'experiment');

$scopeKey = isset($req['scope_key']) ? trim($req['scope_key']) : (isset($req['scopeKey']) ? trim($req['scopeKey']) : '');
$milestoneKey = isset($req['milestone_key']) ? trim($req['milestone_key']) : (isset($req['milestoneKey']) ? trim($req['milestoneKey']) : '');

$lockFile = null;
$lockFp = null;
$isMilestone = (!empty($milestoneKey) && !empty($scopeKey));

if ($isMilestone) {
    $lockDir = sys_get_temp_dir() . '/jizhi_coze_milestones';
    if (!is_dir($lockDir)) {
        @mkdir($lockDir, 0777, true);
    }
    $safeScope = preg_replace('/[^a-zA-Z0-9_-]/', '_', $scopeKey);
    $safeMilestone = preg_replace('/[^a-zA-Z0-9_-]/', '_', $milestoneKey);
    $lockFile = $lockDir . "/ms_{$safeScope}_{$safeMilestone}.json";

    // 1. 检查是否存在 10 分钟内的成功完成缓存（0 Token 消耗秒级返回）
    if (file_exists($lockFile)) {
        $existingRaw = @file_get_contents($lockFile);
        if (!empty($existingRaw)) {
            $existingData = @json_decode($existingRaw, true);
            if ($existingData && isset($existingData['status']) && $existingData['status'] === 'completed' && !empty($existingData['reply'])) {
                $completedAt = isset($existingData['completed_at']) ? intval($existingData['completed_at']) : 0;
                if (time() - $completedAt < 600) {
                    echo json_encode([
                        'success' => true,
                        'completed' => true,
                        'reply' => $existingData['reply'],
                        'bot_id' => $botId,
                        'cached' => true
                    ]);
                    exit;
                }
            }
        }
    }

    // 2. 获取文件排他锁，防止同组多学生同时请求大模型
    $lockFp = @fopen($lockFile . '.lock', 'c+');
    if ($lockFp) {
        $acquired = false;
        $waitStart = microtime(true);
        // 最多非阻塞重试等待 15 秒（等待同组首个同学的大模型返回）
        while ((microtime(true) - $waitStart) < 15.0) {
            if (@flock($lockFp, LOCK_EX | LOCK_NB)) {
                $acquired = true;
                break;
            }
            // 未拿到锁：说明同组有其他同学正在请求生成中，休眠 300ms 后探测缓存
            usleep(300000);
            if (file_exists($lockFile)) {
                $checkRaw = @file_get_contents($lockFile);
                if (!empty($checkRaw)) {
                    $checkData = @json_decode($checkRaw, true);
                    if ($checkData && isset($checkData['status']) && $checkData['status'] === 'completed' && !empty($checkData['reply'])) {
                        @fclose($lockFp);
                        echo json_encode([
                            'success' => true,
                            'completed' => true,
                            'reply' => $checkData['reply'],
                            'bot_id' => $botId,
                            'cached' => true
                        ]);
                        exit;
                    }
                }
            }
        }

        if ($acquired) {
            // 再次复检缓存，避免拿到锁前一瞬间首个同学刚写完
            if (file_exists($lockFile)) {
                $postAcquireRaw = @file_get_contents($lockFile);
                if (!empty($postAcquireRaw)) {
                    $postAcquireData = @json_decode($postAcquireRaw, true);
                    if ($postAcquireData && isset($postAcquireData['status']) && $postAcquireData['status'] === 'completed' && !empty($postAcquireData['reply'])) {
                        if (time() - intval($postAcquireData['completed_at'] ?? 0) < 600) {
                            @flock($lockFp, LOCK_UN);
                            @fclose($lockFp);
                            echo json_encode([
                                'success' => true,
                                'completed' => true,
                                'reply' => $postAcquireData['reply'],
                                'bot_id' => $botId,
                                'cached' => true
                            ]);
                            exit;
                        }
                    }
                }
            }
            // 标记生成中
            @file_put_contents($lockFile, json_encode([
                'status' => 'in_progress',
                'started_at' => time()
            ]));
        }
    }
}

// 1. 获取持久自动续期的 Token
$accessToken = getCozeAccessToken();
if (!$accessToken) {
    if ($lockFp) { @flock($lockFp, LOCK_UN); @fclose($lockFp); }
    echo json_encode([
        'success' => false,
        'message' => 'OAuth token generation failed'
    ]);
    exit;
}

/**
 * 解析 Coze V3 SSE 流式响应，精准提取最终回复文本 (支持 auto_save_history=false 零记忆超低 Token 消耗)
 */
function parseCozeSseStream($rawResp) {
    $lines = explode("\n", $rawResp);
    $currentEvent = '';
    $completedAnswer = '';
    $deltaAnswer = '';

    foreach ($lines as $line) {
        $line = trim($line);
        if (strpos($line, 'event:') === 0) {
            $currentEvent = trim(substr($line, 6));
        } else if (strpos($line, 'data:') === 0) {
            $dataStr = trim(substr($line, 5));
            if (!empty($dataStr) && $dataStr !== '[DONE]') {
                $d = @json_decode($dataStr, true);
                if ($d && is_array($d)) {
                    if ($currentEvent === 'conversation.message.completed' && isset($d['type']) && $d['type'] === 'answer') {
                        $completedAnswer = isset($d['content']) ? $d['content'] : '';
                    } else if ($currentEvent === 'conversation.message.delta' && isset($d['type']) && $d['type'] === 'answer') {
                        $deltaAnswer .= isset($d['content']) ? $d['content'] : '';
                    }
                }
            }
        }
    }
    return !empty($completedAnswer) ? $completedAnswer : $deltaAnswer;
}

// 2. 使用 Prompt 工厂进行结构化组装
$assembledPrompt = CozePromptFactory::buildPrompt($stage, $topic, $userQuery, $actualDoc, $botKey, $priorReview, $taskType);

// 3. 发起 Chat 请求 (采用 stream=true + auto_save_history=false 强制关闭云端对话记忆，杜绝历史 Token 累积)
$cozeUrl = $COZE_API_BASE_URL . '/chat';
$headers = [
    'Authorization: Bearer ' . $accessToken,
    'Content-Type: application/json'
];

$payload = [
    'bot_id' => $botId,
    'user_id' => $userId,
    'stream' => true,
    'auto_save_history' => false,
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
curl_setopt($ch, CURLOPT_IPRESOLVE, CURL_IPRESOLVE_V4);
curl_setopt($ch, CURLOPT_TCP_NODELAY, 1);
curl_setopt($ch, CURLOPT_ENCODING, '');
curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 4);
curl_setopt($ch, CURLOPT_TIMEOUT, 30);

$resp = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

// 🛡️ 智能 Token 4100/4001 失效自愈：自动清除缓存、换新 Token 并重试一次
$answerText = '';
if ($httpCode === 401 || (strpos($resp, '4100') !== false || strpos($resp, '4001') !== false)) {
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
        curl_setopt($chRetry, CURLOPT_IPRESOLVE, CURL_IPRESOLVE_V4);
        curl_setopt($chRetry, CURLOPT_TCP_NODELAY, 1);
        curl_setopt($chRetry, CURLOPT_ENCODING, '');
        curl_setopt($chRetry, CURLOPT_CONNECTTIMEOUT, 4);
        curl_setopt($chRetry, CURLOPT_TIMEOUT, 30);
        $resp = curl_exec($chRetry);
        curl_close($chRetry);
    }
}

$answerText = parseCozeSseStream($resp);

if (!empty($answerText)) {
    if ($isMilestone && !empty($lockFile)) {
        @file_put_contents($lockFile, json_encode([
            'status' => 'completed',
            'reply' => $answerText,
            'completed_at' => time()
        ]));
    }
    if ($lockFp) {
        @flock($lockFp, LOCK_UN);
        @fclose($lockFp);
    }
    echo json_encode([
        'success' => true,
        'completed' => true,
        'reply' => $answerText,
        'bot_id' => $botId
    ]);
} else {
    if ($lockFp) {
        @flock($lockFp, LOCK_UN);
        @fclose($lockFp);
    }
    // 🛡️ 失败时立即清除排他锁与缓存标记，避免第二次点击陷入死锁快速失效
    if ($isMilestone && !empty($lockFile) && file_exists($lockFile)) {
        @unlink($lockFile);
    }

    $errCode = 0;
    $errMsg = 'No answer from Coze API';
    if (strpos($resp, '4028') !== false || strpos($resp, 'quota') !== false) {
        $errCode = 4028;
        $errMsg = 'Your free quota has been used up. Please upgrade to a paid plan.';
    }

    $errJson = @json_decode($resp, true);
    if ($errJson && isset($errJson['msg'])) {
        $errMsg = $errJson['msg'];
        if (isset($errJson['code'])) $errCode = $errJson['code'];
    }

    echo json_encode([
        'success' => false,
        'error_code' => $errCode,
        'message' => $errMsg,
        'raw_response' => (strlen($resp) > 500 ? substr($resp, 0, 500) : $resp)
    ]);
}
