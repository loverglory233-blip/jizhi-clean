<?php
/**
 * Coze API 集中配置模板文件 (已脱敏)
 * 真实运行环境请自行配置真实密钥，切勿提交到公开 Git 仓库
 */

// OAuth 服务应用凭据 (已脱敏占位符)
$COZE_APP_ID = 'your_coze_app_id_here';
$COZE_KEY_ID = 'your_coze_key_id_here';
$COZE_PRIVATE_KEY_FILE = __DIR__ . '/private_key.pem';

// API 请求基础地址 (中国区)
$COZE_API_BASE_URL = 'https://api.coze.cn/v3';
$COZE_OAUTH_TOKEN_URL = 'https://api.coze.cn/api/permission/oauth2/token';

// 6 大智能体 Bot ID 映射表
$COZE_BOTS = [
    'auctioneer'      => '7673571806476828713',
    'managingEditor'  => '7673934462736138294',
    'reviewingEditor' => '7673943522542141476',
    'proponent'       => '7673951703640899627',
    'opponent'        => '7673956980344160307',
    'neutral'         => '7673955430510870580'
];
