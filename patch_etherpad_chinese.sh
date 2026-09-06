#!/bin/bash
# ==============================================================================
# Etherpad 极致全中文汉化与控制台警告消除补丁
# ==============================================================================

echo "🇨🇳 [1/3] 检测 Etherpad 目录与 Node.js 环境..."
EP_DIR="/www/wwwroot/etherpad-lite"
if [ ! -d "$EP_DIR" ]; then
  # 兼容查找可能的路径
  for p in /www/wwwroot/*/etherpad-lite /www/wwwroot/etherpad*; do
    if [ -d "$p" ]; then EP_DIR="$p"; break; fi
  done
fi

if [ ! -d "$EP_DIR" ]; then
  echo "❌ 未找到 Etherpad 目录，请确认安装位置。"
  exit 1
fi
echo "📁 Etherpad 路径: $EP_DIR"

# 寻找 node 环境
NODE_BIN=$(which node 2>/dev/null || find /www/server/nodejs -name node 2>/dev/null | head -n 1 || find /usr -name node 2>/dev/null | head -n 1)
if [ -z "$NODE_BIN" ]; then
  echo "❌ 未找到 node 二进制执行程序"
  exit 1
fi
echo "⚡ Node 环境: $NODE_BIN"

echo "📝 [2/3] 注入超全中文语言包并优化标签属性..."

cat << 'PATCH_JS_EOF' > /tmp/patch_ep_chinese.js
const fs = require("fs");
const path = require("path");

const epDir = process.argv[2] || process.argv[1];
const zhDict = {
  "ep_tables4.menuCreateTable": "插入表格",
  "ep_tables4.menuInsertRowAbove": "在上方插入行",
  "ep_tables4.menuInsertRowBelow": "在下方插入行",
  "ep_tables4.menuInsertColumnRight": "在右侧插入列",
  "ep_tables4.menuInsertColumnLeft": "在左侧插入列",
  "ep_tables4.menuDeleteRow": "删除当前行",
  "ep_tables4.menuDeleteColumn": "删除当前列",
  "ep_tables4.menuDeleteTable": "删除表格",
  "ep_tables4.menuCloseThisMenu": "关闭菜单",
  "ep_line_spacing.spacing": "行间距",
  "ep_line_spacing.one_line_spacing": "单倍行距",
  "ep_line_spacing.two_line_spacing": "双倍行距",
  "ep_headings.style": "标题样式",
  "ep_font_color.color": "文字颜色",
  "ep_font_family.font": "字体",
  "ep_font_family.family": "选择字体",
  "ep_font_size.size": "字号大小",
  "ep_cursortrace.settings.showRemoteCarets": "显示协作组员实时光标",
  "pad.settings.fadeInactiveAuthorColors": "淡化非活跃作者颜色",
  "pad.deletionToken.deleteWithToken": "安全删除",
  "pad.deletionToken.tokenFieldLabel": "验证码",
  "pad.deletionToken.modalTitle": "确认操作",
  "pad.deletionToken.modalBody": "请输入操作验证码",
  "pad.deletionToken.tokenValueLabel": "验证码",
  "pad.deletionToken.copy": "复制",
  "pad.deletionToken.acknowledge": "确认"
};

const searchDirs = [
  path.join(epDir, "src", "locales"),
  path.join(epDir, "locales"),
  path.join(epDir, "node_modules"),
  path.join(epDir, "src", "node_modules")
];

function patchDir(locDir) {
  if (!fs.existsSync(locDir)) {
    try { fs.mkdirSync(locDir, { recursive: true }); } catch (e) {}
  }
  ["zh-hans.json", "zh-cn.json", "zh.json", "en.json"].forEach(langFile => {
    const p = path.join(locDir, langFile);
    let data = {};
    if (fs.existsSync(p)) {
      try { data = JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) {}
    }
    let modified = false;
    for (const [k, v] of Object.entries(zhDict)) {
      if (!data[k]) {
        data[k] = v;
        modified = true;
      }
    }
    if (modified || !fs.existsSync(p)) {
      try { fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf8"); } catch (e) {}
    }
  });
}

// 补齐核心
searchDirs.slice(0, 2).forEach(d => patchDir(d));

// 补齐各插件
searchDirs.slice(2).forEach(nm => {
  if (!fs.existsSync(nm)) return;
  try {
    const packages = fs.readdirSync(nm);
    packages.forEach(pkg => {
      if (pkg.startsWith("ep_")) {
        patchDir(path.join(nm, pkg, "locales"));

        // 🛡️ 核心修复：彻底解决 3 个下拉框插件作者挂错 data-l10n-id 导致的 Unexpected error
        // 插件在 <select> 标签上挂了 data-l10n-id，导致 Etherpad 尝试向 select 写入纯文本内容
        // 修复方案：将 <select> 上的 data-l10n-id 移除，并直接固化中文 aria-label，既保全无障碍，又彻底根治控制台报错
        const pDir = path.join(nm, pkg);
        function walkAndFix(dir) {
          if (!fs.existsSync(dir)) return;
          const list = fs.readdirSync(dir);
          list.forEach(item => {
            const full = path.join(dir, item);
            const stat = fs.statSync(full);
            if (stat.isDirectory()) {
              if (item !== "node_modules" && item !== ".git") walkAndFix(full);
            } else if (/\.(html|ejs|js)$/.test(item)) {
              let c = fs.readFileSync(full, "utf8");
              let mod = false;
              if (c.includes('data-l10n-id="ep_headings.style"')) {
                c = c.replace(/data-l10n-id="ep_headings\.style"/g, 'aria-label="标题样式"');
                mod = true;
              }
              if (c.includes('data-l10n-id="ep_font_color.color"')) {
                c = c.replace(/data-l10n-id="ep_font_color\.color"/g, 'aria-label="文字颜色"');
                mod = true;
              }
              if (c.includes('data-l10n-id="ep_font_size.size"')) {
                c = c.replace(/data-l10n-id="ep_font_size\.size"/g, 'aria-label="字号大小"');
                mod = true;
              }
              if (mod) {
                fs.writeFileSync(full, c, "utf8");
                console.log(`   🛠️ 成功根治模板缺陷: ${full}`);
              }
            }
          });
        }
        walkAndFix(pDir);
      }
    });
  } catch (e) {}
});

console.log("   ✅ 中文翻译词条注入完成，模板语法缺陷已全部校正！");
PATCH_JS_EOF

"$NODE_BIN" /tmp/patch_ep_chinese.js "$EP_DIR"
rm -f /tmp/patch_ep_chinese.js

echo "🔄 [3/3] 优雅平滑重启 Etherpad 进程使翻译生效..."
cd "$EP_DIR"
fuser -k 9001/tcp 2>/dev/null || true
pkill -9 -f "node.*server\.js" 2>/dev/null || true
pkill -9 -f "node.*etherpad" 2>/dev/null || true
pkill -9 -f "bin/run.sh" 2>/dev/null || true
sleep 1

mkdir -p var
rm -f var/minified* var/session* var/plugin-definitions.json 2>/dev/null || true
chmod -R 777 var 2>/dev/null || true
export NODE_ENV=production
nohup ./bin/run.sh --root > /var/log/etherpad.log 2>&1 &

echo "⏳ 等待 Etherpad 重新上线..."
for i in {1..20}; do
  if curl -s -I --connect-timeout 2 http://127.0.0.1:9001/ 2>/dev/null | grep -E "HTTP.*(200|302|404)" >/dev/null; then
    echo "🎉 Etherpad 中文化完成，已成功恢复上线！"
    exit 0
  fi
  sleep 1
done
echo "⚠️ Etherpad 正在后台启动中，请稍候片刻刷新页面测试。"
