#!/bin/bash
echo "📄 ===== /var/log/etherpad.log 最新 30 行日志 ====="
tail -n 30 /var/log/etherpad.log || true
echo "📄 ================================================"
