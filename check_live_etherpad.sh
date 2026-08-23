#!/bin/bash

echo "🔍 正在检测 9001 端口与 Etherpad 实时进程..."

# 1. 检查是否有 node 进程在运行
ps aux | grep -E "server.js|etherpad" | grep -v grep || true

# 2. 检查 9001 端口监听情况
netstat -tulpn 2>/dev/null | grep 9001 || lsof -i :9001 2>/dev/null || ss -tulpn 2>/dev/null | grep 9001 || true

# 3. 实时 curl 验证
echo "🌐 正在请求 http://127.0.0.1:9001/ ..."
curl -I -s http://127.0.0.1:9001/ || echo "⚠️ 端口响应超时"

# 4. 打印最新 20 行日志
echo "📄 ===== 最新日志 ====="
tail -n 20 /var/log/etherpad.log || true
