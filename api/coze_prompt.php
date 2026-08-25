<?php
/**
 * 提示词组装工厂 (Prompt Factory)
 * 将前端写作阶段、正文真实草稿、字数与用户提问组装为结构化 Prompt
 */

class CozePromptFactory {
    public static function buildPrompt($stage, $topic, $userQuery, $actualDoc = '') {
        $stageNames = [
            'stage1' => '阶段一 (课题协商与分工公约)',
            'stage2' => '阶段二 (富文本正文协同撰写)',
            'stage3' => '阶段三 (答辩擂台与质询裁决)'
        ];
        $stageText = isset($stageNames[$stage]) ? $stageNames[$stage] : '写作研讨';
        $topicText = !empty($topic) ? $topic : '暂未确定课题';
        
        $prompt = "【当前协作阶段】: {$stageText}\n";
        $prompt .= "【小组研究课题】: 《{$topicText}》\n";

        if (!empty($actualDoc)) {
            // 🛡️ 全文直传不做截断：审稿编辑多轮质检需内容递增、正反方委员需全文审查，
            // 切片决策完全由调用方在 actualDoc 字段里控制（如一审截取至方法章节之前），此处不再硬截 1200 字
            $docLen = mb_strlen($actualDoc, 'UTF-8');
            $prompt .= "【小组当前真实正文草稿（全文，共 {$docLen} 字）】:\n{$actualDoc}\n";
        }

        $prompt .= "【审阅/对话指令】: {$userQuery}";
        return $prompt;
    }
}
