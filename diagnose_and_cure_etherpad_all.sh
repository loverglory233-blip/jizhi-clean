#!/usr/bin/env bash
# ========================================================
# 🚀 集智平台 - Etherpad 全链路自愈与 0 延迟极速就绪脚本
# ========================================================

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

# 自动寻找 Node.js 环境变量
export PATH="/www/server/nodejs/v20/bin:/www/server/nodejs/v18/bin:/www/server/nodejs/v16/bin:/usr/local/bin:/usr/bin:$PATH"
for n in /www/server/nodejs/v*/bin; do
    if [ -d "$n" ]; then
        export PATH="$n:$PATH"
        break
    fi
done

echo "🔍 Node.js 探测版本: $(node -v 2>/dev/null || echo '未找到系统全局 node')"

echo "🔄 4. 强制杀死旧的 9001 / node 僵尸进程..."
fuser -k 9001/tcp 2>/dev/null || true
pkill -9 -f "etherpad" 2>/dev/null || true
sleep 1

echo "🚀 5. 在后台重新启动 Etherpad 服务..."
mkdir -p "$EP_DIR/var"
export NODE_ENV=production
if [ -f "$EP_DIR/src/node/server.js" ]; then
    nohup node src/node/server.js > "$ROOT_DIR/etherpad.log" 2>&1 &
elif [ -f "$EP_DIR/bin/run.sh" ]; then
    nohup bash bin/run.sh --root > "$ROOT_DIR/etherpad.log" 2>&1 &
fi

echo "⏳ 等待 Etherpad 9001 端口就绪..."
EP_OK=0
for i in {1..30}; do
    if curl -s -I http://127.0.0.1:9001/p/test | grep -E "HTTP/(1.1|2) (200|302|404)" > /dev/null; then
        echo "🟢 Etherpad 9001 端口在第 $i 秒成功就绪响应！"
        EP_OK=1
        break
    fi
    sleep 1
done

if [ $EP_OK -eq 0 ]; then
    echo "⚠️ 9001 端口响应超时，查看日志最后 20 行："
    tail -n 20 "$ROOT_DIR/etherpad.log" || true
fi

echo "🔄 6. 重载 Nginx 代理与静态资源..."
cd "$ROOT_DIR"
if [ -f "./fix_domain_jizhiedu_all.sh" ]; then
    bash ./fix_domain_jizhiedu_all.sh 2>&1 || true
else
    nginx -s reload 2>/dev/null || true
fi

echo "🔍 7. 测试经过 Nginx 后的 Etherpad 接口..."
CURL_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1/p/test || true)
echo "📄 Nginx /p/test 响应 HTTP 状态码: $CURL_STATUS"

if [ "$CURL_STATUS" = "200" ] || [ "$CURL_STATUS" = "302" ]; then
    echo "🎉 ========================================================"
    echo "✅ Etherpad 全链路自愈成功！9001 端口在线，Nginx 反代 100% 畅通！"
    echo "🎉 ========================================================"
else
    echo "⚠️ Nginx 反代状态码为 $CURL_STATUS，尝试直接通过 9001 访问或检查 Nginx 配置"
fi
