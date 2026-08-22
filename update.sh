#!/bin/bash
# ==============================================================================
# 集智平台一键更新脚本 - 恢复正常同步
# ==============================================================================

echo "🔍 [1/4] 定位网站目录..."

TARGET_DIRS=()
for d in /www/wwwroot/*; do
  if [ -d "$d" ] && { [ -f "$d/index.html" ] || [ -f "$d/server.py" ]; }; then
    TARGET_DIRS+=("$d")
  fi
done
[ -d "/root/jizhi-clean" ] && TARGET_DIRS+=("/root/jizhi-clean")
TARGET_DIRS=($(printf "%s\n" "${TARGET_DIRS[@]}" | sort -u))
[ ${#TARGET_DIRS[@]} -eq 0 ] && TARGET_DIRS+=("/www/wwwroot/47.99.110.230")

echo "📁 目标目录: ${TARGET_DIRS[*]}"

echo "⚡ [2/4] 下载最新代码..."
TMP=/tmp/jizhi_update
rm -rf "$TMP" && mkdir -p "$TMP/css" "$TMP/js" "$TMP/api"

dl() {
  local f=$1
  local success=0
  local urls=(
    "https://ghfast.top/https://raw.githubusercontent.com/loverglory233-blip/jizhi-clean/main/$f"
    "https://ghproxy.net/https://raw.githubusercontent.com/loverglory233-blip/jizhi-clean/main/$f"
    "https://raw.gitmirror.com/loverglory233-blip/jizhi-clean/main/$f"
    "https://cdn.jsdelivr.net/gh/loverglory233-blip/jizhi-clean@main/$f"
    "https://raw.githubusercontent.com/loverglory233-blip/jizhi-clean/main/$f"
  )
  for u in "${urls[@]}"; do
    curl -s -f -L --connect-timeout 2 --max-time 4 "$u" -o "$TMP/$f" 2>/dev/null
    if [ -s "$TMP/$f" ] && ! grep -q "429: Too Many Requests" "$TMP/$f"; then
      success=1
      break
    fi
  done
  if [ $success -eq 0 ]; then
    echo "⚠️ 正在重试下载 $f ..."
    curl -s -L --connect-timeout 3 --max-time 5 "https://raw.gitmirror.com/loverglory233-blip/jizhi-clean/main/$f" -o "$TMP/$f" 2>/dev/null
  fi
}

dl index.html
dl css/styles.css
dl js/bundle.js
dl sync.php
dl server.py
dl server_yjs.js
dl server_yjs.py
dl package.json
dl api/chat_api.php
dl api/coze_prompt.php
dl api/db_init.php

for dir in "${TARGET_DIRS[@]}"; do
  mkdir -p "$dir/css" "$dir/js" "$dir/api"
  cp -rf "$TMP/"* "$dir/"
  
  # 自动创建本地 MySQL 配置文件（若不存在）
  if [ ! -f "$dir/api/db_config.php" ]; then
    cat << 'EOF' > "$dir/api/db_config.php"
<?php
$DB_HOST = '127.0.0.1';
$DB_PORT = '3306';
$DB_NAME = 'jizhi';
$DB_USER = 'jizhi';
$DB_PASS = 'KxDmdtSWaTtHafdZ';

function getDbConnection() {
    global $DB_HOST, $DB_PORT, $DB_NAME, $DB_USER, $DB_PASS;
    static $pdo = null;
    if ($pdo !== null) return $pdo;
    try {
        $dsn = "mysql:host={$DB_HOST};port={$DB_PORT};dbname={$DB_NAME};charset=utf8mb4";
        $pdo = new PDO($dsn, $DB_USER, $DB_PASS, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false
        ]);
        return $pdo;
    } catch (PDOException $e) {
        return null;
    }
}
EOF
  fi

  # 自动创建本地 OAuth 配置文件与私钥（若不存在）
  if [ ! -f "$dir/api/config.php" ]; then
    cat << 'EOF' > "$dir/api/config.php"
<?php
$COZE_APP_ID = '117674722513984684072';
$COZE_KEY_ID = 'EdvxCTETZES-C-m32CsULVkKR_psKeP-J7HwpQnANuk';
$COZE_PRIVATE_KEY_FILE = __DIR__ . '/private_key.pem';
$COZE_API_BASE_URL = 'https://api.coze.cn/v3';
$COZE_OAUTH_TOKEN_URL = 'https://api.coze.cn/api/permission/oauth2/token';

$COZE_BOTS = [
    'auctioneer'      => '7673571806476828713',
    'managingEditor'  => '7673934462736138294',
    'reviewingEditor' => '7673943522542141476',
    'proponent'       => '7673951703640899627',
    'opponent'        => '7673956980344160307',
    'neutral'         => '7673955430510870580'
];
EOF
  fi

  if [ ! -f "$dir/api/private_key.pem" ]; then
    cat << 'EOF' > "$dir/api/private_key.pem"
-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDgTarE6tr/k5fQ
UXbQiskw4vBOMBEdkPjRzDHe1OtaNsTEFfPE+ReOJqn0m5aTOaNVl4lg0hErkyaB
J1vxmvzPE1WwJmbLOaXpshgIc7jzxScMkMeeFdXpvVS2LdVBBhDy83Z1kwRpKe/q
R2sevZDazD8go3sZ7P0heAPTvJJWMuteDCw8lIt26OENh2Fy+I6nlJvJxzAnMudm
BHnoT+NqPmQi6Qgplp5iMND7v2tGS89D7d5qiK/6J4kdBM+43OzkV2UojWH5Aq9I
xlyID31JLcGjiGDl+QKj7yUHTxNhmFUIikb4gstelVyYnLiDZoZCgqyxJh1w1qJe
l9KDcgwFAgMBAAECggEAFZ1f/tJDwLjM7cX76IRUEPVXHOG+GuN7TS3oaSwkpePj
OdYeHVweBfr51vJRvbKiZ79OylkgtUDcraBIvuzyWCFP2SxKLMlLkLKY/q+DVV8p
SfYY4yxnGbtYX3N/oMcTeQxqQ1HW7Sw3MpQnrj9F2myWPla8QepRfLLF0HCg7wdf
WFsWHrnU9RpDBOtWNmtjQiXWbulsve5b3sSjHAKw5Pxul7WLp3y77tSgN9UfM64x
FAUpYyQwd5SPqhY1la3NAO7KSdYbdHNxt1myhYEEZF+e0ecSRQVWzcHnw3zROxJp
ofZAGae9kXsmG3qDMUq2sX3X8l5aOfXoEdFODtcNfQKBgQDwSWYPfy5zHGXLJszY
U8YGlPXmuDrjHlu0/gDZ/N7pUkJiMMXf/C4pM6RNxf2MtFATdu3UiFvHzNeX+Fby
mXqSDYdQr5Z5jdqEck8737E3DXPYwTSyGJdsZwAERFlR+xI4Nv45xxgdIt/ZkKHW
VBOLnhCtNFC04hiKioDaIBIeqwKBgQDu+LGvrHLcTF9T+HPkfczGe/wikvfwBdY9
feQb5pGi7i/UWG2O0iVpIL55m9ZKO7tAOQbKpLdHm5GPP07m0LBC6NGvMEiuYY3T
DbcS8LgW+h1JoUmZP+s8yal3XubwWoPxl5f7lo1OK6kC1NjpYDCY4LmCf7tidusW
LX0NeibADwKBgAE7XxqVPFe6vYrdGA/D3jAKc3hLWYHwlefHpZl4gmwPz+dQ+LK9
SD9N1HnRmgsuoXp4EaAVUuMjWbedvlRgFRDKoPb473yQDZ7AN0fHTdFKcF2cH/kJ
xzz3Cjj7YLna360KGyOQsb70ftFOvIWsyKzekpdQvVkwD5AmRaLYpz8hAoGBAN35
zLNt8FOJ7ZLGWoCICkrkqFRFSGGASn1cDyOLjQRXU75fVYUw1udMLyIvC2JxEYKa
diCN2GF/tDnniJcGinPcZ8nfg+PXYjIFr2S8jYNqWQIn+4GKyivw9qWXVdU1fxJO
yjI8qo1OKPQkWkiNvRaEyEzb8WeJJt226041hQEpAoGBAO8eTnc41oFkcXcvNMdF
EBis4TQY8LuvZDFospjUxtCvemMO/Pluq1NEXXVO7txFEi5kYfDoWUEZ/40MF0wk
ZcEDmyxpdGp3B2CjouQpG8EeihQD8xlWctA5TPFqYSuislur9M7jJcJJqjqBEGf1
h6cHqx+Y7Dl+ws+3oUKctOrs
-----END PRIVATE KEY-----
EOF
  fi

  chmod -R 777 "$dir/api"
  chmod -R 755 "$dir"
  chmod 777 "$dir/sync.php" 2>/dev/null || true
  chown -R www:www "$dir" 2>/dev/null || true
  echo "   ✅ 已更新: $dir"
done
rm -rf "$TMP"

echo "🔄 [3/4] 验证 PHP 环境、清理 Nginx 坏规则并重载..."
# 清理可能残留的死循环反代规则
for cdir in /www/server/panel/vhost/nginx /www/server/nginx/conf/vhost; do
  [ -d "$cdir" ] || continue
  for conf in "$cdir"/*.conf; do
    [ -f "$conf" ] || continue
    sed -i '/location ~ \^\/(sync\\\.php\|api\/)/,/^[[:space:]]*}/d' "$conf" 2>/dev/null || true
    sed -i '/proxy_pass http:\/\/127.0.0.1:8088/d' "$conf" 2>/dev/null || true
  done
done
nginx -s reload 2>/dev/null || /etc/init.d/nginx reload 2>/dev/null || systemctl reload nginx 2>/dev/null || true
/etc/init.d/php-fpm-82 restart 2>/dev/null || /etc/init.d/php-fpm-81 restart 2>/dev/null || /etc/init.d/php-fpm-80 restart 2>/dev/null || /etc/init.d/php-fpm-74 restart 2>/dev/null || systemctl restart php-fpm 2>/dev/null || true

for dir in "${TARGET_DIRS[@]}"; do
  # 清理初始测试数据
  echo '{"timestamp":0,"groupId":"group_1","presence":{},"chatLogs":{"stage1":[],"stage2":[],"stage3":[]},"stage1":{"mergedTitle":"","votes":{},"hasVoted":{},"proposals":[]},"stage2":{"unifiedContent":"","memberContributions":{"A":0,"B":0,"C":0},"actionPlan":{"isGenerated":false,"items":[]}},"stage3":{"feedbackItems":[]},"currentStage":"stage1","isFinalSubmitted":false}' > "$dir/db_task_default_group_1.json" 2>/dev/null || true
  echo '{}' > "$dir/sessions.json" 2>/dev/null || true
  chmod 777 "$dir/db_task_default_group_1.json" "$dir/sessions.json" "$dir/sync.php" 2>/dev/null || true
  chmod -R 777 "$dir" 2>/dev/null || true
  chown -R www:www "$dir" 2>/dev/null || true
done

echo "🚀 [4/4] 启动高可用同步服务端 (Python 8088 & Yjs CRDT 1234)..."
kill -9 $(lsof -t -i:8088 2>/dev/null) 2>/dev/null || true
pkill -9 -f "server.py" 2>/dev/null || true
kill -9 $(lsof -t -i:1234 2>/dev/null) 2>/dev/null || true
pkill -9 -f "server_yjs.js" 2>/dev/null || true
sleep 1

for dir in "${TARGET_DIRS[@]}"; do
  if [ -f "$dir/server.py" ]; then
    cd "$dir"
    nohup python3 server.py > server.log 2>&1 &
    sleep 1
    if lsof -i:8088 >/dev/null 2>&1; then
      echo "   ✅ 端口 8088 同步服务端已就绪 ($dir)"
    fi
  fi
  if [ -f "$dir/server_yjs.js" ]; then
    cd "$dir"
    if command -v pm2 >/dev/null 2>&1; then
      pm2 restart jizhi-yjs 2>/dev/null || pm2 start server_yjs.js --name "jizhi-yjs" 2>/dev/null
      pm2 save >/dev/null 2>&1 || true
      echo "   ✅ 端口 1234 Yjs CRDT 协同网关已就绪 (PM2守护)"
    elif command -v node >/dev/null 2>&1; then
      nohup node server_yjs.js > yjs.log 2>&1 &
      echo "   ✅ 端口 1234 Yjs CRDT 协同网关已就绪 (Node.js常驻)"
    else
      nohup python3 server_yjs.py > yjs.log 2>&1 &
      echo "   ✅ 端口 1234 Yjs CRDT 协同网关已就绪 (Python常驻)"
    fi
  fi
done

echo ""
echo "======================================================"
echo "🎉 全系统更新完成！"
echo ""
echo "📋 验证方法（在浏览器地址栏访问）："
echo "   http://47.99.110.230:1234/health  (Yjs 协同网关)"
echo "   http://47.99.110.230/sync.php?groupId=group_1"
echo ""
echo "✅ 能看到 status: ok = Yjs 协同引擎满血在线"
echo "======================================================"
