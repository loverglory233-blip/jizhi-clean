<?php
/**
 * SSE 实时推送端点 (长连接)
 * 参数: task_id + group_id, 或直接传 scope_key
 * 行为: 建立连接后周期性探测 group_states 表的 revision_id 变更，有更新即推送，无更新发送心跳保活
 */
require_once __DIR__ . '/db_config.php';

header('Content-Type: text/event-stream; charset=utf-8');
header('Cache-Control: no-cache');
header('Connection: keep-alive');
header('X-Accel-Buffering: no'); // 关闭 nginx 缓冲，确保事件即时下发

@set_time_limit(0);
@ignore_user_abort(true);

$taskId   = isset($_GET['task_id'])  ? preg_replace('/[^a-zA-Z0-9_\-]/', '', $_GET['task_id'])  : '';
$groupId  = isset($_GET['group_id']) ? preg_replace('/[^a-zA-Z0-9_\-]/', '', $_GET['group_id']) : '';
$scopeKey = isset($_GET['scope_key']) ? preg_replace('/[^a-zA-Z0-9_\-:]/', '', $_GET['scope_key']) : '';
if ($scopeKey === '' && $taskId !== '' && $groupId !== '') {
    $scopeKey = $taskId . '_' . $groupId;
}
if ($scopeKey === '') {
    echo "event: error\ndata: {\"error\":\"missing scope\"}\n\n";
    exit;
}

echo ": connected\n\n";
@ob_flush();
@flush();

$pdo = getDbConnection();
$lastRevision = null;
$heartbeat = 0;

// 最长维持 300 次探测 (约 5 分钟)，前端断开后由浏览器自动重连
for ($i = 0; $i < 300; $i++) {
    if (connection_aborted()) {
        break;
    }

    $snapshot = null;
    if ($pdo) {
        try {
            $stmt = $pdo->prepare("SELECT `revision_id`, `last_timestamp`, `current_stage` FROM `group_states` WHERE `scope_key` = :sk LIMIT 1");
            $stmt->execute([':sk' => $scopeKey]);
            $row = $stmt->fetch();
            if ($row) {
                $revision = intval($row['revision_id']);
                if ($lastRevision === null) {
                    $lastRevision = $revision; // 首轮仅校准基线，不推送历史
                } elseif ($revision !== $lastRevision) {
                    $lastRevision = $revision;
                    $snapshot = [
                        'scope_key'      => $scopeKey,
                        'revision_id'    => $revision,
                        'last_timestamp' => intval($row['last_timestamp']),
                        'current_stage'  => $row['current_stage']
                    ];
                }
            }
        } catch (Exception $e) {
            error_log('stream.php poll: ' . $e->getMessage());
        }
    }

    if ($snapshot !== null) {
        echo "event: snapshot\n";
        echo "data: " . json_encode($snapshot, JSON_UNESCAPED_UNICODE) . "\n\n";
        @ob_flush();
        @flush();
    }

    if (++$heartbeat >= 15) {
        echo ": ping\n\n";
        @ob_flush();
        @flush();
        $heartbeat = 0;
    }

    sleep(1);
}
