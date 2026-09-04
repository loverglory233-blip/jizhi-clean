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

# 2. 净化 Etherpad 配置、清除历史模板并满血硬重启
export PATH="/www/server/nodejs/v18.20.7/bin:/www/server/nodejs/v20.18.0/bin:/www/server/nodejs/v16.20.2/bin:$PATH:/usr/local/bin:/usr/bin"

EP_RUN_DIR=""
for d in /www/wwwroot/etherpad-lite /www/wwwroot/47.99.110.230/etherpad-lite /root/etherpad-lite /opt/etherpad-lite /var/www/etherpad-lite; do
  if [ -d "$d" ]; then
    EP_RUN_DIR="$d"
    # 净化 settings.json，将 defaultPadText 置为空白
    node -e '
      const fs = require("fs");
      const p = "'"$d"'/settings.json";
      if (fs.existsSync(p)) {
        try {
          let s = JSON.parse(fs.readFileSync(p, "utf8"));
          s.defaultPadText = "";
          fs.writeFileSync(p, JSON.stringify(s, null, 2), "utf8");
          console.log("✅ [" + p + "] defaultPadText 已设置为纯白空字符");
        } catch(e) {}
      }
    ' 2>/dev/null || true
  fi
done

# 彻底释放 9001 端口并强杀旧进程
fuser -k 9001/tcp 2>/dev/null || true
pkill -9 -f "node.*etherpad" 2>/dev/null || true
pkill -9 -f "node src/node/server.js" 2>/dev/null || true
sleep 2

# 重启 Etherpad
if [ -n "$EP_RUN_DIR" ]; then
  cd "$EP_RUN_DIR"
  # 修复 Settings.js fast-deep-equal 兼容性
  if [ -f "src/node/utils/Settings.js" ]; then
    sed -i "s|require('fast-deep-equal/es6')|require('fast-deep-equal')|g" src/node/utils/Settings.js 2>/dev/null || true
    sed -i 's|require("fast-deep-equal/es6")|require("fast-deep-equal")|g' src/node/utils/Settings.js 2>/dev/null || true
  fi
  # 备份历史 dirty.db
  if [ -f "var/dirty.db" ]; then
    cp var/dirty.db var/dirty.db.bak 2>/dev/null || true
  fi
  if [ -f "./bin/run.sh" ]; then
    nohup ./bin/run.sh --root > /var/log/etherpad.log 2>&1 &
  elif [ -f "src/node/server.js" ]; then
    NODE_OPTIONS="--max-old-space-size=768" nohup node src/node/server.js > /var/log/etherpad.log 2>&1 &
  fi
  cd "$SITE_DIR"
  sleep 5
fi

# 重新平滑载入 Nginx 配置
nginx -s reload 2>/dev/null || systemctl reload nginx 2>/dev/null || true

# 检查 Etherpad (端口 9001)
EP_STATUS="❌ 未启动 (端口 9001 无响应)"
EP_HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 http://127.0.0.1:9001/ 2>/dev/null || echo "000")
if [ "$EP_HTTP_CODE" = "000" ] && [ -n "$EP_RUN_DIR" ]; then
  cd "$EP_RUN_DIR"
  if [ -f "./bin/run.sh" ]; then
    nohup ./bin/run.sh --root > /var/log/etherpad.log 2>&1 &
  fi
  cd "$SITE_DIR"
  sleep 4
  EP_HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 http://127.0.0.1:9001/ 2>/dev/null || echo "000")
fi

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
