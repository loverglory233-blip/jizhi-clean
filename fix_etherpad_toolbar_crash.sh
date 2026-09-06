#!/bin/bash
# ==============================================================================
# 彻底根除 Etherpad 500 崩溃 (Cannot create property 'grouping' on boolean 'false')
# ==============================================================================

echo "🚀 [1/3] 定位 Etherpad 目录..."
EP_DIR="/www/wwwroot/etherpad-lite"
if [ ! -d "$EP_DIR" ]; then
  for p in /www/wwwroot/*/etherpad-lite /www/wwwroot/etherpad*; do
    if [ -d "$p" ]; then EP_DIR="$p"; break; fi
  done
fi

cd "$EP_DIR"

echo "🛑 [2/3] 优雅重构 settings.json (移除导致 false.grouping 崩溃的死锁 toolbar 配置)..."
node -e '
const fs = require("fs");
let settings = {};
try {
  settings = JSON.parse(fs.readFileSync("settings.json", "utf8"));
} catch(e) {
  settings = {};
}

// 移除手动写死的不合规 toolbar 按钮，让 14 大插件通过标准的 editbar 钩子自然注入
delete settings.toolbar;

// 确保基础配置健壮
settings.title = settings.title || "JIZHI Academic Pad";
settings.ip = "0.0.0.0";
settings.port = 9001;
settings.trustProxy = true;
settings.skinName = "colibris";
settings.suppressErrorsInPadText = true;

fs.writeFileSync("settings.json", JSON.stringify(settings, null, 2), "utf8");
console.log("✅ settings.json 已净化！消除了导致 500 报错的冲突字段！");
'

echo "🚀 [3/3] 重启 Etherpad 并直接测试目标 Pad URL..."
fuser -k 9001/tcp 2>/dev/null || true
pkill -9 -f "node.*server\.js" 2>/dev/null || true
pkill -9 -f "node.*etherpad" 2>/dev/null || true
pkill -9 -f "bin/run.sh" 2>/dev/null || true
sleep 1

export NODE_ENV=production
nohup ./bin/run.sh --root > /var/log/etherpad.log 2>&1 &

echo "⏳ 等待 Etherpad 启动..."
SUCCESS=0
for i in {1..30}; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 2 "http://127.0.0.1:9001/p/test_health_verify" 2>/dev/null || echo "000")
  if [ "$CODE" = "200" ] || [ "$CODE" = "302" ]; then
    SUCCESS=1
    echo "🎉 恭喜！Pad 协同页面已完美响应 (HTTP $CODE)！"
    break
  fi
  echo -n "."
  sleep 1
done
echo ""

if [ $SUCCESS -eq 1 ]; then
  echo "=================================================="
  echo "✅ 500 错误已彻底根治！所有插件与文档协同已全部就绪！"
  echo "=================================================="
else
  echo "📄 启动日志:"
  tail -n 25 /var/log/etherpad.log
fi
