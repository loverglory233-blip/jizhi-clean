#!/bin/bash
set -e

echo "🔍 ========================================================"
echo "📋 正在全面自检 Etherpad 官方协同插件的运行与加载状态"
echo "🔍 ========================================================"

export PATH="/www/server/nodejs/v18.20.7/bin:$PATH"
EP_DIR="/www/wwwroot/etherpad-lite"

if [ ! -d "$EP_DIR" ]; then
    echo "❌ Etherpad 目录不存在: $EP_DIR"
    exit 1
fi

cd "$EP_DIR"

echo "1️⃣ 正在检查 9001 端口服务状态..."
if curl -s -I http://127.0.0.1:9001/ | grep -E "200|302|HTTP" > /dev/null; then
    echo "   ✅ 9001 端口正常监听并响应 HTTP 请求！"
else
    echo "   ❌ 9001 端口未响应，请先启动 Etherpad！"
fi

echo ""
echo "2️⃣ 正在检查各个核心插件的物理安装与内核注册状态:"
node -e '
const fs = require("fs");
const path = require("path");

const targetPlugins = [
  { name: "ep_cursortrace", desc: "光标追踪与同伴浮动姓名气泡" },
  { name: "ep_author_hover", desc: "作者段落悬停信息感知" },
  { name: "ep_headings2", desc: "H1~H6 学术大纲标题样式" },
  { name: "ep_font_size", desc: "字号大小调节" },
  { name: "ep_font_family", desc: "中英文字体切换" },
  { name: "ep_font_color", desc: "文字颜色与高亮标记" },
  { name: "ep_align", desc: "左对齐/居中/右对齐/两端对齐" },
  { name: "ep_tables4", desc: "三线表学术表格插入与编辑" },
  { name: "ep_image_upload", desc: "论文插图上传与粘贴" },
  { name: "ep_subscript_and_superscript", desc: "学术公式上下标" },
  { name: "ep_line_spacing", desc: "行间距调节" },
  { name: "ep_clear_formatting", desc: "一键清除多余格式" }
];

let pluginsJson = {};
try {
  pluginsJson = JSON.parse(fs.readFileSync("var/plugins.json", "utf8"));
} catch(e) {}

const loadedPlugins = (pluginsJson.plugins ? Object.keys(pluginsJson.plugins) : []);

targetPlugins.forEach((p, idx) => {
  const modPath = path.join("node_modules", p.name);
  const exists = fs.existsSync(modPath);
  const isLoaded = loadedPlugins.includes(p.name);
  
  let statusIcon = "🟢 [正常运作]";
  if (!exists) {
    statusIcon = "🔴 [未安装]";
  } else if (!isLoaded) {
    statusIcon = "🟡 [已安装待重启加载]";
  }
  
  console.log(`   ${idx + 1}. ${p.name.padEnd(30, " ")} | ${p.desc.padEnd(20, " ")} | ${statusIcon}`);
});

console.log("\n📦 内核已成功注册的全部插件清单 (plugins.json):");
console.log(loadedPlugins.length > 0 ? loadedPlugins.join(", ") : "暂无 (需要重启 Etherpad 扫描)");
'

echo ""
echo "3️⃣ 正在查看 Etherpad 最近 15 行启动日志:"
tail -n 15 /var/log/etherpad.log 2>/dev/null || echo "无日志文件"

echo ""
echo "🏁 ========================================================"
echo "✅ 自检完成！"
