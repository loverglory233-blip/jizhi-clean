<?php
/**
 * Coze API 集中配置文件 (OAuth 2.0 自动续期架构)
 */

// OAuth 服务应用凭据 (长期免维护自动刷新)
$COZE_APP_ID = '117674722513984684072';
$COZE_KEY_ID = 'EdvxCTETZES-C-m32CsULVkKR_psKeP-J7HwpQnANuk';
$COZE_PRIVATE_KEY_FILE = __DIR__ . '/private_key.pem';

// API 请求基础地址 (中国区)
$COZE_API_BASE_URL = 'https://api.coze.cn/v3';
$COZE_OAUTH_TOKEN_URL = 'https://api.coze.cn/api/permission/oauth2/token';

// 6 大智能体 Bot ID 映射表
$COZE_BOTS = [
    'auctioneer'      => '7673571806476828713', // 阶段一：学术拍卖师
    'managingEditor'  => '7673934462736138294', // 阶段二：责任编辑（过程学伴）
    'reviewingEditor' => '7673943522542141476', // 阶段二：审稿编辑（专家指导）
    'proponent'       => '7673951703640899627', // 阶段三：正方委员（答辩肯定）
    'opponent'        => '7673956980344160307', // 阶段三：反方委员（答辩质询）
    'neutral'         => '7673955430510870580'  // 阶段三：中间委员（裁决引导）
];
