<?php
/**
 * Coze API 集中配置文件
 */

// 个人访问令牌 (PAT Token)
$COZE_API_KEY = 'cztei_lQvEBuui0NBG0PwfwGCI2BOAUupEKDEWylO8LaqHT3zZ7vTwSwPh3XXzPmHWUcPny';

// API 请求基础地址 (中国区)
$COZE_API_BASE_URL = 'https://api.coze.cn/v3';

// 6 大智能体 Bot ID 映射表
$COZE_BOTS = [
    'auctioneer'      => '7673571806476828713', // 阶段一：学术拍卖师
    'managingEditor'  => '7673934462736138294', // 阶段二：责任编辑（过程学伴）
    'reviewingEditor' => '7673943522542141476', // 阶段二：审稿编辑（专家指导）
    'proponent'       => '7673951703640899627', // 阶段三：正方委员（答辩肯定）
    'opponent'        => '7673956980344160307', // 阶段三：反方委员（答辩质询）
    'neutral'         => '7673955430510870580'  // 阶段三：中间委员（裁决引导）
];
