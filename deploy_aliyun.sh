#!/bin/bash
# ==============================================================================
# 集智 (JIZHI) 阿里云一键全自动部署与替换脚本
# ==============================================================================

echo "🚀 [1/4] 正在停止旧版进程并释放 8088 端口..."
kill -9 $(lsof -t -i:8088) 2>/dev/null || true
pkill -9 -f "python3 server.py" 2>/dev/null || true

echo "🚀 [2/4] 正在备份旧版项目..."
cd /root
if [ -d "jizhiplatform" ]; then
    mv jizhiplatform jizhiplatform_old_bak 2>/dev/null || true
fi
if [ -d "jizhi-clean" ]; then
    mv jizhi-clean jizhi-clean_old_bak 2>/dev/null || true
fi

echo "🚀 [3/4] 正在创建全新纯净版项目结构..."
mkdir -p /root/jizhi-clean/css /root/jizhi-clean/js

echo "🚀 [4/4] 启动后台持久化实时多智能体服务 (端口 8088)..."
cd /root/jizhi-clean
nohup python3 server.py > server.log 2>&1 &

sleep 1
if ps aux | grep "[p]ython3 server.py" > /dev/null; then
    echo "======================================================================"
    echo "🎉 部署成功！全新纯净版【集智平台】已在阿里云服务器后台运行！"
    echo "👉 浏览器直接访问: http://47.99.110.230:8088"
    echo "======================================================================"
else
    echo "❌ 启动异常，请查看 /root/jizhi-clean/server.log 日志文件。"
fi
