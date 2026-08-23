<?php
require_once __DIR__ . '/api/config.php';
require_once __DIR__ . '/api/chat_api.php';

echo "=======================================================\n";
echo "🚀 [Coze 真实智能体端到端连通性与回复质量实测]\n";
echo "=======================================================\n\n";

// 1. 测试 OAuth Token 自动生成与获取
echo "👉 [Step 1] 正在请求 Coze 中国区 OAuth 2.0 鉴权服务...\n";
$token = getCozeAccessToken();
if (!$token) {
    echo "❌ OAuth Token 获取失败！请检查 private_key.pem 与 Key ID！\n";
    exit(1);
}
echo "✅ OAuth Access Token 获取成功 (前15位): " . substr($token, 0, 15) . "...\n\n";

// 2. 真实测试 责任编辑 Agent (managingEditor)
echo "👉 [Step 2] 正在向【责任编辑 Agent】(Bot ID: " . $COZE_BOTS['managingEditor'] . ") 发起真实对话测试...\n";
$testTopic = "基于大语言模型的协同写作认知负荷调控机制研究";
$testQuery = "【协作写作阶段: 阶段二 (正文撰写)】\n【课题: {$testTopic}】\n【用户对话/审阅指令】: 责任编辑老师，我们小组在写方法部分时遇到卡点，不知道该先写实验设计还是先写问卷量表，请指导我们如何分工推进！";

$res1 = executeCozeChat($token, $COZE_BOTS['managingEditor'], $testQuery, 'student_test_1001');
echo "-------------------------------------------------------\n";
echo "🤖 【责任编辑 Agent 真实大模型输出】：\n";
if (!empty($res1['reply'])) {
    echo trim($res1['reply']) . "\n";
    echo "✅ 耗时: " . ($res1['duration'] ?? 'N/A') . "s | Chat ID: " . ($res1['chat_id'] ?? 'N/A') . "\n";
} else {
    echo "⚠️ 响应状态: " . json_encode($res1, JSON_UNESCAPED_UNICODE) . "\n";
}
echo "-------------------------------------------------------\n\n";

// 3. 真实测试 审稿编辑 Agent (reviewingEditor)
echo "👉 [Step 3] 正在向【审稿编辑 Agent】(Bot ID: " . $COZE_BOTS['reviewingEditor'] . ") 发起真实学术质检测试...\n";
$testDraft = "引言：随着AI技术的发展，协同学习越来越重要。本研究采用问卷调查法对120名学生进行了调查。结果表明，AI辅助显著提高了学生的协作效率。";
$testQuery2 = "【协作写作阶段: 阶段二 (正文撰写)】\n【课题: {$testTopic}】\n【小组当前正文真实草稿（字数：" . mb_strlen($testDraft) . "）】：\n{$testDraft}\n【用户对话/审阅指令】: 请审稿编辑老师对我们当前正文进行学术规范质检，指出不足并给出3项落地修改建议！";

$res2 = executeCozeChat($token, $COZE_BOTS['reviewingEditor'], $testQuery2, 'student_test_1002');
echo "-------------------------------------------------------\n";
echo "🤖 【审稿编辑 Agent 真实大模型输出】：\n";
if (!empty($res2['reply'])) {
    echo trim($res2['reply']) . "\n";
    echo "✅ 耗时: " . ($res2['duration'] ?? 'N/A') . "s | Chat ID: " . ($res2['chat_id'] ?? 'N/A') . "\n";
} else {
    echo "⚠️ 响应状态: " . json_encode($res2, JSON_UNESCAPED_UNICODE) . "\n";
}
echo "-------------------------------------------------------\n";
