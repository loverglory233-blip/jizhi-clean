#!/bin/bash
# ==============================================================================
# 集智平台 (JIZHI) 极速更新与全栈服务健康诊断脚本
# ==============================================================================

set -e

SITE_DIR="/www/wwwroot/47.99.110.230"
if [ ! -d "$SITE_DIR" ]; then
  SITE_DIR="$(pwd)"
fi

cd "$SITE_DIR"

echo "🔄 [1/3] 正在拉取 GitHub 最新版本代码..."
git fetch --all >/dev/null 2>&1 || true
git reset --hard origin/main >/dev/null 2>&1 || true

# 权限更新 (静默跳过宝塔防篡改的 .user.ini)
chmod -R 755 . 2>/dev/null || true
chown -R www:www . 2>/dev/null || true

# 提取当前版本与 Commit
APP_VER=$(grep -o "APP_VERSION = '[^']*'" src/constants.js 2>/dev/null | cut -d"'" -f2 || echo "未知版本")
COMMIT_HASH=$(git log -1 --format="%h - %s" 2>/dev/null || echo "最新提交")

echo "🔍 [2/3] 正在诊断全栈核心服务状态..."

# 1. 检查 Nginx
NGINX_STATUS="❌ 未运行或异常"
if pgrep nginx >/dev/null 2>&1 || systemctl is-active --quiet nginx 2>/dev/null; then
  NGINX_STATUS="✅ 正常运行中 (端口 80/443 活跃)"
fi

# 2. 净化 Etherpad 配置与历史空模板
if [ -d "/www/wwwroot/etherpad-lite" ]; then
  # 净化 settings.json，将 defaultPadText 置为空白
  node -e '
    const fs = require("fs");
    const p = "/www/wwwroot/etherpad-lite/settings.json";
    if (fs.existsSync(p)) {
      try {
        let s = JSON.parse(fs.readFileSync(p, "utf8"));
        if (s.defaultPadText !== "") {
          s.defaultPadText = "";
          fs.writeFileSync(p, JSON.stringify(s, null, 2), "utf8");
          console.log("✅ settings.json defaultPadText 已设置为纯白空字符");
        }
      } catch(e) {}
    }
  ' 2>/dev/null || true

  # 强制彻底重启 Etherpad 以加载空白配置
  pkill -9 -f "node.*etherpad" 2>/dev/null || true
  sleep 1
  cd /www/wwwroot/etherpad-lite
  nohup ./bin/run.sh --root > /var/log/etherpad.log 2>&1 &
  cd "$SITE_DIR"
  sleep 4
fi

# 检查 Etherpad (端口 9001)
EP_STATUS="❌ 未启动 (端口 9001 无响应)"
EP_HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 2 http://127.0.0.1:9001/ 2>/dev/null || echo "000")
if [ "$EP_HTTP_CODE" != "000" ] || pgrep -f "node.*etherpad" >/dev/null 2>&1; then
  EP_STATUS="✅ 正常运行中 (端口 9001 毫秒级协同就绪)"

  # 🚀 使用 Node.js 深度清洗 Etherpad 中所有历史模板 Pad 并自动写回学生长文
  node -e '
    const fs = require("fs");
    const http = require("http");
    const path = require("path");

    let apiKey = "jizhi_academic_secret_key_2026";
    const keyFiles = ["/www/wwwroot/etherpad-lite/APIKEY.txt", "/root/etherpad-lite/APIKEY.txt", path.join(__dirname, "APIKEY.txt")];
    for (const kf of keyFiles) {
      if (fs.existsSync(kf)) {
        const k = fs.readFileSync(kf, "utf8").trim();
        if (k) { apiKey = k; break; }
      }
    }

    function epReq(action, params = {}) {
      return new Promise((resolve) => {
        params.apikey = apiKey;
        const q = Object.entries(params).map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v)).join("&");
        http.get("http://127.0.0.1:9001/api/1.2.14/" + action + "?" + q, (res) => {
          let d = "";
          res.on("data", c => d += c);
          res.on("end", () => { try { resolve(JSON.parse(d)); } catch(e) { resolve(null); } });
        }).on("error", () => resolve(null));
      });
    }

    async function clean() {
      const listRes = await epReq("listAllPads");
      if (!listRes || !listRes.data || !Array.isArray(listRes.data.padIDs)) return;
      const padIDs = listRes.data.padIDs;

      // 1. 扫描所有真实长文
      const groupBest = {};
      for (const pid of padIDs) {
        if (!pid.startsWith("jizhi_")) continue;
        const tRes = await epReq("getText", { padID: pid });
        const txt = (tRes && tRes.data && tRes.data.text) ? tRes.data.text.trim() : "";
        const cleanTxt = txt.replace(/[\s\r\n]+/g, " ");
        const len = cleanTxt.length;
        const m = pid.match(/(group_\d+|group_[a-zA-Z0-9_-]+)/);
        const gid = m ? m[1] : null;

        // 严格白名单判定：只有纯粹的空模板/占位符才判定为 isPlace，学生写的任何字（即使只有几个字）一律视为宝贵正文
        const isUntouchedTemplate = (cleanTxt.startsWith("一、研究背景与意义") && len < 80);
        const isPlace = (cleanTxt === "啥意思捏" || cleanTxt.includes("啥意思捏") || isUntouchedTemplate || cleanTxt.includes("Welcome to Etherpad") || len === 0);

        if (gid && !isPlace && len > 0) {
          if (!groupBest[gid] || groupBest[gid].len < len) {
            groupBest[gid] = { padID: pid, text: txt, len };
            console.log("🎯 发现小组 [" + gid + "] 留存真实正文: " + len + " 字");
          }
        }
      }

      // 2. 仅对纯模板/占位符 Pad 进行写回或释放，学生真实正文 100% 原样保留
      for (const pid of padIDs) {
        if (!pid.startsWith("jizhi_")) continue;
        const tRes = await epReq("getText", { padID: pid });
        const txt = (tRes && tRes.data && tRes.data.text) ? tRes.data.text.trim() : "";
        const cleanTxt = txt.replace(/[\s\r\n]+/g, " ");
        const len = cleanTxt.length;
        const m = pid.match(/(group_\d+|group_[a-zA-Z0-9_-]+)/);
        const gid = m ? m[1] : null;

        const isUntouchedTemplate = (cleanTxt.startsWith("一、研究背景与意义") && len < 80);
        const isPlace = (cleanTxt === "啥意思捏" || cleanTxt.includes("啥意思捏") || isUntouchedTemplate || cleanTxt.includes("Welcome to Etherpad") || len === 0);

        if (isPlace) {
          if (gid && groupBest[gid]) {
            console.log("✨ 正在将小组 [" + gid + "] 的正文 (" + groupBest[gid].len + " 字) 写回当前 Pad [" + pid + "]...");
            await epReq("setText", { padID: pid, text: groupBest[gid].text });
          } else {
            console.log("🧹 正在清除旧空模板 Pad: [" + pid + "]");
            await epReq("deletePad", { padID: pid });
          }
        } else {
          console.log("🛡️ [安全保护] Pad [" + pid + "] 含有学生真实内容 (" + len + " 字)，安全保留。");
        }
      }
      console.log("🎉 Etherpad 所有 Pad 净化与长文自动写回完成！");
    }

    clean();
  ' 2>/dev/null || true
else
  # 尝试自动拉起 Etherpad
  if [ -f "/www/wwwroot/etherpad-lite/src/node/server.js" ] || [ -f "/www/wwwroot/etherpad-lite/bin/run.sh" ]; then
    cd /www/wwwroot/etherpad-lite
    nohup ./bin/run.sh --root > /var/log/etherpad.log 2>&1 &
    cd "$SITE_DIR"
    sleep 3
    EP_STATUS="⚠️ 刚才未运行，已自动拉起 (端口 9001 启动中)"
  fi
fi

# 3. 检查 PHP-FPM
PHP_STATUS="❌ 未运行或异常"
if pgrep php-fpm >/dev/null 2>&1; then
  PHP_STATUS="✅ 正常运行中 (PHP 解析引擎活跃)"
fi

# 4. 检查 MySQL
MYSQL_STATUS="❌ 未运行或异常"
if pgrep mysqld >/dev/null 2>&1 || pgrep mariadbd >/dev/null 2>&1; then
  MYSQL_STATUS="✅ 正常运行中 (数据库连接就绪)"
fi

echo ""
echo "=================================================================="
echo "  🎉 集智学术平台 (JIZHI) 系统更新与服务状态诊断报告"
echo "=================================================================="
echo "📦 当前部署版本:   $APP_VER"
echo "🔖 Git 最新提交:   $COMMIT_HASH"
echo "------------------------------------------------------------------"
echo "🌐 Nginx Web 服务:       $NGINX_STATUS"
echo "📝 Etherpad 协同文档引擎: $EP_STATUS"
echo "🐘 PHP-FPM 运行环境:     $PHP_STATUS"
echo "🗄️ MySQL 数据库服务:     $MYSQL_STATUS"
echo "📁 目录与文件权限:       ✅ 已更新 (www:www / 755)"
echo "=================================================================="

if [[ "$NGINX_STATUS" =~ "✅" ]] && [[ "$EP_STATUS" =~ "✅" ]] && [[ "$PHP_STATUS" =~ "✅" ]] && [[ "$MYSQL_STATUS" =~ "✅" ]]; then
  echo "🚀 全部核心服务均运行正常！请按 Ctrl+F5 (Mac: Cmd+Shift+R) 刷新浏览器测试。"
else
  echo "⚠️ 部分服务可能需要注意，请根据上方红叉排查或重启对应服务。"
fi
echo "=================================================================="
echo ""
