#!/usr/bin/env bash
# ========================================================
# 集智平台 (JIZHI) 全维系统资源与 Etherpad 异常消耗深度巡检工具
# ========================================================
set -e

echo "🔍 ========================================================"
echo "📊 开始深度巡检 CPU、内存、网络带宽与 Etherpad 性能消耗"
echo "🔍 ========================================================"

# 1. 总体系统负载与 CPU / 内存概况
echo ""
echo "1️⃣ 【系统整体负载与内存开销】:"
LOAD_AVG=$(uptime | awk -F'load average:' '{print $2}')
echo "   ⚡ 系统负载 (Load Average): $LOAD_AVG"

FREE_MEM=$(free -m 2>/dev/null || free -h 2>/dev/null || true)
echo "   🧠 内存占用概况 (MB):"
echo "$FREE_MEM" | sed 's/^/      /'

# 2. 关键核心服务（Node.js / Etherpad / Nginx / PHP / Python）资源占用排序
echo ""
echo "2️⃣ 【关键进程 CPU 与 内存 实时消耗】:"
printf "   %-10s %-8s %-8s %-10s %-12s %s\n" "用户" "PID" "CPU(%)" "内存(%)" "常驻内存(RSS)" "命令"
ps aux | grep -E "node|etherpad|nginx|php-fpm|server.py" | grep -v "grep" | grep -v "check_system" | sort -nrk 3,3 | head -n 12 | while read -r user pid cpu mem vsz rss tty stat start time cmd; do
    RSS_MB=$(echo "$rss / 1024" | bc 2>/dev/null || awk "BEGIN {printf \"%.1f\", $rss/1024}" 2>/dev/null || echo "${rss}KB")
    SHORT_CMD=$(echo "$cmd" | awk '{print $1" "$2" "$3}' | cut -c 1-45)
    printf "   %-10s %-8s %-8s %-10s %-12s %s\n" "$user" "$pid" "$cpu%" "$mem%" "${RSS_MB}MB" "$SHORT_CMD"
done

# 3. Etherpad 专项目标进程体检
echo ""
echo "3️⃣ 【Etherpad (Node.js 9001) 专项体检】:"
EP_PID=$(lsof -t -i:9001 2>/dev/null | head -n 1 || echo "")
if [ -n "$EP_PID" ]; then
    EP_INFO=$(ps -p "$EP_PID" -o %cpu,%mem,rss,vsz,etime,cmd --no-headers 2>/dev/null || echo "")
    EP_CPU=$(echo "$EP_INFO" | awk '{print $1}')
    EP_MEM=$(echo "$EP_INFO" | awk '{print $2}')
    EP_RSS=$(echo "$EP_INFO" | awk '{print $3}')
    EP_RSS_MB=$(awk "BEGIN {printf \"%.1f\", $EP_RSS/1024}" 2>/dev/null || echo "${EP_RSS}KB")
    EP_TIME=$(echo "$EP_INFO" | awk '{print $5}')
    
    echo "   🟢 Etherpad 进程 PID: $EP_PID (持续运行时间: $EP_TIME)"
    echo "   📊 CPU 占用率: $EP_CPU%"
    echo "   🧠 物理内存占用 (RSS): ${EP_RSS_MB} MB (占比: $EP_MEM%)"
    
    # 评判
    if (( $(echo "$EP_CPU > 50.0" | bc -l 2>/dev/null || echo 0) )); then
        echo "   ⚠️ 警告: Etherpad CPU 占用偏高 ($EP_CPU%)，可能存在死循环或密集运算！"
    else
        echo "   ✅ CPU 状态健康 (消耗极低)"
    fi
    
    if [ "$EP_RSS" -gt 614400 ] 2>/dev/null; then
        echo "   ⚠️ 警告: Etherpad 内存占用超过 600MB，需观察是否有内存泄漏！"
    else
        echo "   ✅ 内存状态健康 (处于正常工作区间)"
    fi
else
    echo "   ⚪ 当前 9001 端口未检测到运行中的进程"
fi

# 4. 网络连接与并发通道分析 (带宽/连接数)
echo ""
echo "4️⃣ 【网络连接与并发通道分析 (带宽/连接数)】:"
TOTAL_CONNS=$(ss -ant 2>/dev/null | wc -l || netstat -ant 2>/dev/null | wc -l || echo "0")
EP_CONNS=$(ss -ant 2>/dev/null | grep ":9001" | wc -l || netstat -ant 2>/dev/null | grep ":9001" | wc -l || echo "0")
HTTP_CONNS=$(ss -ant 2>/dev/null | grep -E ":80|:443" | wc -l || echo "0")

echo "   🌐 服务器总 TCP 连接数: $TOTAL_CONNS"
echo "   🔌 Etherpad (9001) 协同连接数: $EP_CONNS"
echo "   🌐 Web (80/443) 网页连接数: $HTTP_CONNS"

# TCP 状态分布
echo "   📊 连接状态分布:"
ss -ant 2>/dev/null | awk '{print $1}' | sort | uniq -c | sed 's/^/      /' || true

# 5. 实时网络吞吐量 (采样 1 秒)
echo ""
echo "5️⃣ 【实时网络 I/O 吞吐速率 (1秒瞬时采样)】:"
DEV=$(ip route get 8.8.8.8 2>/dev/null | awk '{print $5; exit}' || echo "eth0")
if [ -f /proc/net/dev ] && grep -q "$DEV" /proc/net/dev; then
    R1=$(grep "$DEV" /proc/net/dev | awk '{print $2}')
    T1=$(grep "$DEV" /proc/net/dev | awk '{print $10}')
    sleep 1
    R2=$(grep "$DEV" /proc/net/dev | awk '{print $2}')
    T2=$(grep "$DEV" /proc/net/dev | awk '{print $10}')
    
    RX_SPEED=$(( (R2 - R1) / 1024 ))
    TX_SPEED=$(( (T2 - T1) / 1024 ))
    
    echo "   📡 网卡 [$DEV] 入站流量 (下载): ${RX_SPEED} KB/s"
    echo "   📡 网卡 [$DEV] 出站流量 (上传/带宽消耗): ${TX_SPEED} KB/s"
    
    if [ "$TX_SPEED" -gt 2048 ]; then
        echo "   ⚠️ 注意: 出站带宽速率较高 (${TX_SPEED} KB/s)，请排查是否有大文件下载或流量突发"
    else
        echo "   ✅ 带宽消耗处于正常极低范围 (无异常跑流量现象)"
    fi
else
    echo "   ℹ️ 未能探测到特定虚拟网卡，无法进行瞬时采样"
fi

# 6. Etherpad 持久化数据库 (dirty.db) 体积与磁盘 I/O 检查
echo ""
echo "6️⃣ 【Etherpad 本地存储与数据库体积】:"
DIRTY_DB="/www/wwwroot/etherpad-lite/var/dirty.db"
if [ -f "$DIRTY_DB" ]; then
    DB_SIZE=$(du -h "$DIRTY_DB" | awk '{print $1}')
    DB_LINES=$(wc -l < "$DIRTY_DB" 2>/dev/null || echo "未知")
    echo "   💾 dirty.db 文件大小: $DB_SIZE (历史操作记录条数: $DB_LINES)"
    if [ "$(du -m "$DIRTY_DB" 2>/dev/null | awk '{print $1}')" -gt 100 ] 2>/dev/null; then
        echo "   ⚠️ 建议定期备份或清理 dirty.db (超过 100MB)"
    else
        echo "   ✅ 数据库体积小巧健康"
    fi
else
    echo "   ℹ️ 未发现 /www/wwwroot/etherpad-lite/var/dirty.db"
fi

# 7. 日志异常错误与循环告警扫描
echo ""
echo "7️⃣ 【Etherpad 错误与死循环告警扫描 (最近 10 行关键日志)】:"
for logf in /www/wwwroot/etherpad-lite/etherpad.log /tmp/etherpad_*.log /www/wwwroot/etherpad-lite/var/log.log; do
    if [ -f "$logf" ]; then
        echo "   📄 检查日志: $logf"
        ERR_CNT=$(grep -iE "error|exception|fatal|unhandled" "$logf" 2>/dev/null | tail -n 100 | wc -l || echo "0")
        echo "      近期异常错误记录数: $ERR_CNT"
        if [ "$ERR_CNT" -gt 0 ]; then
            echo "      🔍 最近异常片段:"
            grep -iE "error|exception|fatal|unhandled" "$logf" 2>/dev/null | tail -n 5 | sed 's/^/         /' || true
        fi
    fi
done

echo ""
echo "========================================================"
echo "🎉 资源巡检完毕！"
echo "========================================================"
