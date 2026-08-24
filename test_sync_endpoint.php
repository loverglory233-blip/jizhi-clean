<?php
/**
 * 集智平台 - 真实多端同步全链路诊断脚本
 * 访问：http://47.99.110.230/test_sync_endpoint.php
 */
header('Content-Type: text/html; charset=utf-8');
require_once __DIR__ . '/api/db_config.php';
$pdo = getDbConnection();
if (!$pdo) {
    die("❌ 数据库连接失败: 请检查 MySQL 服务与 api/db_config.php 配置");
}

echo "<h2>🧪 集智平台 - 多端同步全链路真实诊断</h2>";

$testTaskId = 'task_default';
$testGroupId = 'group_1';
$scopeKey = $testTaskId . '_' . $testGroupId;

echo "<h3>1. 检查数据库中当前房间 [{$scopeKey}] 的状态</h3>";
$stmt = $pdo->prepare("SELECT * FROM group_states WHERE scope_key = :sk");
$stmt->execute([':sk' => $scopeKey]);
$stateRow = $stmt->fetch(PDO::FETCH_ASSOC);

if ($stateRow) {
    echo "✅ group_states 表中已存在该房间记录：<br>";
    echo "• scope_key: <b>{$stateRow['scope_key']}</b><br>";
    echo "• current_stage: <b>{$stateRow['current_stage']}</b><br>";
    echo "• last_timestamp: <b>{$stateRow['last_timestamp']}</b> (" . date('Y-m-d H:i:s', $stateRow['last_timestamp']/1000) . ")<br>";
    echo "• stage1_data 长度: " . strlen($stateRow['stage1_data']) . " 字节<br>";
    echo "• stage2_data 长度: " . strlen($stateRow['stage2_data']) . " 字节<br>";
} else {
    echo "⚠️ group_states 表中尚未存在 [{$scopeKey}]。<br>";
}

echo "<h3>2. 检查聊天消息库 (chat_messages 表)</h3>";
$stmtChats = $pdo->prepare("SELECT * FROM chat_messages WHERE scope_key = :sk ORDER BY time_ms DESC LIMIT 10");
$stmtChats->execute([':sk' => $scopeKey]);
$chatRows = $stmtChats->fetchAll(PDO::FETCH_ASSOC);

echo "当前 [{$scopeKey}] 共有 " . count($chatRows) . " 条最新消息：<br>";
if ($chatRows) {
    echo "<table border='1' cellpadding='6' style='border-collapse:collapse;'><tr><th>ID</th><th>阶段</th><th>发送者</th><th>内容</th><th>时间</th></tr>";
    foreach ($chatRows as $c) {
        echo "<tr><td>{$c['id']}</td><td>{$c['stage']}</td><td>{$c['sender']}</td><td>" . htmlspecialchars($c['text']) . "</td><td>{$c['timestamp_str']}</td></tr>";
    }
    echo "</table>";
} else {
    echo "📭 目前暂无聊天消息。<br>";
}

echo "<h3>3. 模拟【设备 A】发送一条测试协作消息</h3>";
$simMsgTime = round(microtime(true) * 1000);
$simMsg = [
    'action' => 'send_chat_message',
    'stage' => 'stage1',
    'message' => [
        'id' => 'msg_sim_' . $simMsgTime,
        'sender' => '202601',
        'senderName' => '测试学生A',
        'text' => '【自动诊断测试】这是一条来自设备A的实时同步测试消息 - ' . date('H:i:s'),
        'timestamp' => date('H:i'),
        '_timeMs' => $simMsgTime
    ]
];

// 直接调用本地 sync.php 写入逻辑
$ch = curl_init("http://127.0.0.1/sync.php?taskId={$testTaskId}&groupId={$testGroupId}&action=send_chat_message");
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($simMsg));
$resA = curl_exec($ch);
curl_close($ch);
echo "设备 A 发送响应: <code>" . htmlspecialchars($resA) . "</code><br>";

echo "<h3>4. 模拟【设备 B】轮询拉取当前房间数据</h3>";
$ch2 = curl_init("http://127.0.0.1/sync.php?taskId={$testTaskId}&groupId={$testGroupId}&userId=202602&sessToken=test_b&nocache=" . time());
curl_setopt($ch2, CURLOPT_RETURNTRANSFER, true);
$resB = curl_exec($ch2);
curl_close($ch2);

$dataB = json_decode($resB, true);
if ($dataB && isset($dataB['chatLogs'])) {
    $stage1Chats = $dataB['chatLogs']['stage1'] ?? [];
    echo "✅ 设备 B 成功从服务端 GET 到了 " . count($stage1Chats) . " 条 stage1 聊天消息！<br>";
    $foundSim = false;
    foreach ($stage1Chats as $m) {
        if (isset($m['id']) && $m['id'] === $simMsg['message']['id']) {
            $foundSim = true;
            break;
        }
    }
    if ($foundSim) {
        echo "<b style='color:green;font-size:16px;'>🎉 完美闭环：设备 B 成功拉到了设备 A 刚刚发出的测试消息！服务端数据读写通道 100% 畅通无阻！</b><br>";
    } else {
        echo "<b style='color:red;'>❌ 未在返回结果中找到设备 A 的消息！</b><br>";
    }
} else {
    echo "❌ 设备 B 拉取失败或返回格式异常: <code>" . htmlspecialchars($resB) . "</code><br>";
}
