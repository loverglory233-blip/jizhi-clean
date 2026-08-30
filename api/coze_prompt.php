<?php
/**
 * 提示词组装工厂 (Prompt Factory) - 极速轻量化版
 * 剥离冗余静态角色设定（由 Coze 平台后台自主承载），仅动态装配真实课题、正文草稿与即时指令
 */

class CozePromptFactory {
    public static function buildPrompt($stage, $topic, $userQuery, $actualDoc = '', $botKey = '', $priorReview = '') {
        $stageNames = [
            'stage1' => '阶段一 (课题协商与分工公约)',
            'stage2' => '阶段二 (富文本正文协同撰写)',
            'stage3' => '阶段三 (答辩擂台与质询裁决)'
        ];
        $stageText = isset($stageNames[$stage]) ? $stageNames[$stage] : '写作研讨';
        $topicText = !empty($topic) ? $topic : '暂未确定课题';
        
        $prompt = "【协作阶段】: {$stageText} | 【课题】: 《{$topicText}》
";
        $prompt .= "【全局红线】: 严格聚焦学术内容与研究逻辑；遇到无实质乱码空洞内容时简短提醒补充，有实质内容时给出针对性具体建议。
";

        if (!empty($priorReview)) {
            $prompt .= "【前序审查记录】:
{$priorReview}
";
        }

        if (!empty($actualDoc)) {
            $docLen = mb_strlen($actualDoc, 'UTF-8');
            $prompt .= "【正文草稿(共{$docLen}字)】:
{$actualDoc}
";
        }

        $prompt .= "【本次指令】: {$userQuery}";
        return $prompt;
    }
}
