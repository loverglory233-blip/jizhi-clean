<?php
/**
 * 提示词组装工厂 (Prompt Factory) - 极速轻量化版
 * 剥离冗余静态角色设定（由 Coze 平台后台自主承载），仅动态装配真实课题、正文草稿与即时指令
 */

class CozePromptFactory {
    public static function buildPrompt($stage, $topic, $userQuery, $actualDoc = '', $botKey = '', $priorReview = '', $taskType = 'experiment') {
        // ⚡ 若指令本身已高度结构化（包含 JSON 约束或研讨记录上下文），直接透传，确保大模型零干扰极速响应
        if (mb_strpos($userQuery, 'JSON') !== false || mb_strpos($userQuery, '小组成员已') !== false || mb_strpos($userQuery, '【组内') !== false || mb_strpos($userQuery, '【当前任务') !== false) {
            return $userQuery;
        }

        $isInst = ($taskType === 'instructional');
        $stageNames = [
            'stage1' => $isInst ? '阶段一 (备课工作坊与备课公约)' : '阶段一 (课题协商与分工公约)',
            'stage2' => $isInst ? '阶段二 (集体备课室协同备课)' : '阶段二 (富文本正文协同撰写)',
            'stage3' => $isInst ? '阶段三 (答辩评审会与终稿打磨)' : '阶段三 (答辩擂台与质询裁决)'
        ];
        $stageText = isset($stageNames[$stage]) ? $stageNames[$stage] : ($isInst ? '备课研讨' : '写作研讨');
        $topicLabel = $isInst ? '教学课题' : '课题';
        $topicText = !empty($topic) ? $topic : ($isInst ? '暂未确定教学主题' : '暂未确定课题');
        
        $prompt = "【协作阶段】: {$stageText} | 【{$topicLabel}】: 《{$topicText}》\n";
        $prompt .= "【全局红线】: 严格聚焦" . ($isInst ? '教学设计与教学逻辑' : '学术内容与研究逻辑') . "；遇到无实质乱码空洞内容时简短提醒补充，有实质内容时给出针对性具体建议；投票结果由系统单独播报，智能体发言中严禁重复报票数数字，严禁点名组员，仅负责定性分析一致性/分歧互补并引导研讨。\n";

        if (!empty($priorReview)) {
            $prompt .= "【前序审查记录】:\n{$priorReview}\n";
        }

        if (!empty($actualDoc)) {
            $docLen = mb_strlen($actualDoc, 'UTF-8');
            $docNoun = $isInst ? '教学设计草稿' : '正文草稿';
            $trimmedDoc = ($docLen > 2200) ? (mb_substr($actualDoc, 0, 2000, 'UTF-8') . "\n...(正文核心主体节选)...") : $actualDoc;
            $prompt .= "【{$docNoun}(共{$docLen}字)】:\n{$trimmedDoc}\n";
        }

        $prompt .= "【本次指令】: {$userQuery}";
        return $prompt;
    }
}
