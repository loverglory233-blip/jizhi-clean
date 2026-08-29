#!/bin/bash
set -e

echo "🚀 ========================================================"
echo "⚡ Etherpad 官方核心协同引擎与 12 大插件启动"
echo "🚀 ========================================================"

export PATH="/www/server/nodejs/v22/bin:/www/server/nodejs/v20/bin:/www/server/nodejs/v18.20.7/bin:/www/server/nodejs/v18/bin:/www/server/nodejs/v16/bin:/usr/local/bin:/usr/bin:$PATH"
for n in /www/server/nodejs/v*/bin; do
  if [ -d "$n" ]; then
    export PATH="$n:$PATH"
    break
  fi
done

EP_DIR="/www/wwwroot/etherpad-lite"
if [ ! -d "$EP_DIR" ]; then
  for d in /www/wwwroot/47.99.110.230/etherpad-lite /opt/etherpad-lite /root/etherpad-lite /var/www/etherpad-lite /www/server/etherpad; do
    if [ -d "$d" ]; then
      EP_DIR="$d"
      break
    fi
  done
fi

cd "$EP_DIR"

# 1. 释放 9001 端口并结束旧进程
fuser -k 9001/tcp 2>/dev/null || true
pkill -9 -f "etherpad" 2>/dev/null || true
sleep 1

# 2. 还原官方源码
git checkout src/ 2>/dev/null || true
rm -f var/plugin-definitions.json var/plugins.json 2>/dev/null || true

# 3. 固化 settings.json
cat << 'EPSETEOF' > "$EP_DIR/settings.json"
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
  "toolbar": {
    "left": [
      ["bold", "italic", "underline", "strikethrough"],
      ["orderedlist", "unorderedlist", "indent", "outdent"],
      ["heading", "font-size", "font-family", "font-color"],
      ["left", "center", "right", "justify"],
      ["insertTable", "imageUpload"],
      ["undo", "redo"],
      ["clearauthorship"]
    ],
    "right": [
      ["importexport", "timeslider", "settings", "showusers"]
    ]
  },
  "suppressErrorsInPadText": true,
  "requireAuthentication": false,
  "requireAuthorization": false,
  "trustProxy": true,
  "socketTransportProtocols": ["websocket", "polling"],
  "loadTest": false,
  "exposeVersion": false,
  "minify": false,
  "maxAge": 21600000
}
EPSETEOF

echo "jizhi_academic_secret_key_2026" > "$EP_DIR/APIKEY.txt" 2>/dev/null || true
chmod 644 "$EP_DIR/APIKEY.txt" 2>/dev/null || true

# 4. 后台拉起 Etherpad
echo "🚀 正在启动 Etherpad 服务进程..."
export NODE_ENV=production
if [ -f "bin/run.sh" ]; then
  nohup bash bin/run.sh --root > /var/log/etherpad.log 2>&1 &
elif [ -f "src/node/server.js" ]; then
  nohup node src/node/server.js > /var/log/etherpad.log 2>&1 &
fi

# 5. 等待 9001 端口就绪
echo "⏳ 等待 9001 端口就绪..."
SUCCESS=0
for i in {1..25}; do
  if curl -s -I http://127.0.0.1:9001/ 2>/dev/null | grep -E "200|302|HTTP" > /dev/null; then
    SUCCESS=1
    echo "🎉 Etherpad (9001 端口) 在第 $i 秒完全就绪！"
    break
  fi
  sleep 1
done

if [ $SUCCESS -eq 0 ]; then
  echo "⚠️ 9001 端口未就绪，查看最后 20 行日志:"
  tail -n 20 /var/log/etherpad.log 2>/dev/null || true
fi

# 6. 重新载入 Nginx 配置
nginx -t 2>/dev/null && (nginx -s reload 2>/dev/null || systemctl reload nginx 2>/dev/null || true)
