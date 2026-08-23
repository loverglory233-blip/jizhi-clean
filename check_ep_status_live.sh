#!/bin/bash

echo "📊 ========================================================"
echo "⚡ Etherpad 实时进程与 9001 端口状态探测"
echo "📊 ========================================================"

# 1. 检查 Node.js 进程
echo "1️⃣ 正在检查 Etherpad 进程 PID:"
ps aux | grep "src/node/server.js" | grep -v grep || echo "⚠️ 未找到运行中的 server.js 进程"
echo ""

# 2. 检查 9001 端口
echo "2️⃣ 正在探测 9001 端口响应:"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:9001/ || echo "000")
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "302" ]; then
    echo "🎉 9001 端口已成功启动并就绪 (HTTP $HTTP_CODE)！"
else
    echo "⏳ 9001 端口目前状态: HTTP $HTTP_CODE"
fi
echo ""

# 3. 打印最新 25 行 Etherpad 日志
echo "3️⃣ 查看 /var/log/etherpad.log 最新 25 行日志:"
echo "--------------------------------------------------------"
if [ -f "/var/log/etherpad.log" ]; then
    tail -n 25 /var/log/etherpad.log
else
    echo "⚠️ 日志文件不存在"
fi
echo "--------------------------------------------------------"
