#!/usr/bin/env bash
# ========================================================
# 🚀 集智平台 - Etherpad 全链路自愈与 0 延迟极速就绪脚本
# ========================================================

set -e

EP_DIR="/www/wwwroot/47.99.110.230/etherpad-lite"
ROOT_DIR="/www/wwwroot/47.99.110.230"

echo "🔍 1. 检查 Etherpad 目录与环境..."
if [ ! -d "$EP_DIR" ]; then
    echo "❌ Etherpad 目录不存在: $EP_DIR"
    exit 1
fi

cd "$EP_DIR"

echo "📝 2. 优化 settings.json 配置 (确保无认证拦截、支持 iframe 反代与 WebSocket)..."
cat << 'SETTINGSEOF' > "$EP_DIR/settings.json"
{
  "title": "JIZHI Academic Etherpad",
  "ip": "0.0.0.0",
  "port": 9001,
  "dbType": "dirty",
  "dbSettings": {
    "filename": "var/dirty.db"
  },
  "defaultPadText": "一、研究背景与意义\n\n二、文献综述\n\n三、研究问题与假设\n\n四、研究设计与方法\n\n五、研究设计的不足与反思\n\n六、参考文献\n",
  "padOptions": {
    "noColors": true,
    "showControls": true,
    "showChat": false,
    "showLineNumbers": true,
    "useMonospaceFont": false,
    "userName": "学术组员"
  },
  "suppressErrorsInPadText": true,
  "requireAuthentication": false,
  "requireAuthorization": false,
  "trustProxy": true,
  "socketTransportProtocols": ["websocket", "polling"],
  "loadTest": false,
  "exposeVersion": false,
  "minify": true,
  "maxAge": 21600000
}
SETTINGSEOF

echo "🔑 3. 固化 APIKEY.txt..."
mkdir -p "$EP_DIR"
echo "jizhi_academic_secret_key_2026" > "$EP_DIR/APIKEY.txt"
chmod 644 "$EP_DIR/APIKEY.txt"

echo "🔄 4. 强制杀死旧的 9001 / node 僵尸进程..."
fuser -k 9001/tcp 2>/dev/null || true
pkill -f "etherpad" 2>/dev/null || true
sleep 1

echo "🚀 5. 在后台重新启动 Etherpad 服务..."
mkdir -p "$EP_DIR/var"
export NODE_ENV=production
nohup bin/run.sh --root > "$ROOT_DIR/etherpad.log" 2>&1 &

echo "⏳ 等待 Etherpad 9001 端口就绪..."
for i in {1..30}; do
    if curl -s -I http://127.0.0.1:9001/p/test | grep -E "HTTP/1.1 (200|302|404)" > /dev/null; then
        echo "🟢 Etherpad 9001 端口在第 $i 秒成功就绪响应！"
        break
    fi
    sleep 1
done

echo "🔄 6. 重载 Nginx 代理与静态资源..."
cd "$ROOT_DIR"
if [ -f "./fix_domain_jizhiedu_all.sh" ]; then
    bash ./fix_domain_jizhiedu_all.sh
fi

echo "🔍 7. 测试经过 Nginx 后的 Etherpad 接口..."
CURL_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1/p/test || true)
echo "📄 Nginx /p/test 响应 HTTP 状态码: $CURL_STATUS"

if [ "$CURL_STATUS" = "200" ] || [ "$CURL_STATUS" = "302" ]; then
    echo "🎉 ========================================================"
    echo "✅ Etherpad 全链路自愈成功！9001 端口在线，Nginx 反代 100% 畅通！"
    echo "🎉 ========================================================"
else
    echo "⚠️ 状态码为 $CURL_STATUS，请查看 $ROOT_DIR/etherpad.log 排查原因"
fi
