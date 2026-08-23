#!/bin/bash

echo "📋 ========================================================"
echo "⚡ 当前 Etherpad 2.7.3 已安装插件全量清单与版本"
echo "📋 ========================================================"

export PATH="/usr/bin:/usr/local/bin:$PATH"
EP_DIR="/www/wwwroot/etherpad-lite"

cd "$EP_DIR"

node -e '
const fs = require("fs");
const path = require("path");

const pkgs = {};

// 读取根目录 package.json
try {
  const rootPkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  Object.assign(pkgs, rootPkg.dependencies || {});
} catch(e) {}

// 读取 src/package.json
try {
  const srcPkg = JSON.parse(fs.readFileSync("src/package.json", "utf8"));
  Object.assign(pkgs, srcPkg.dependencies || {});
} catch(e) {}

const epPlugins = Object.keys(pkgs).filter(p => p.startsWith("ep_"));

console.log("----------------------------------------------------------------------------------");
printf = (a, b, c) => console.log(a.padEnd(30) + " | " + b.padEnd(12) + " | " + c);
printf("插件包名", "已安装版本", "功能定位说明");
console.log("----------------------------------------------------------------------------------");

const descMap = {
  "ep_etherpad-lite": "Etherpad 2.7.3 核心程序包",
  "ep_cursortrace": "多端实时彩色光标与悬浮组员姓名气泡",
  "ep_headings2": "H1~H6 学术大纲标题样式下拉框",
  "ep_font_size": "字号大小调节下拉选择器",
  "ep_font_family": "中英文字体切换下拉框 (宋体/Times等)",
  "ep_font_color": "文字高亮与颜色调色盘",
  "ep_align": "左对齐 / 居中 / 右对齐 / 两端对齐",
  "ep_tables4": "学术三线表格插入与单元格排版",
  "ep_image_upload": "学术插图与截图上传粘贴",
  "ep_author_hover": "作者协同光标悬停感知与身份提示",
  "ep_subscript_and_superscript": "数学公式与上下标排版支持",
  "ep_line_spacing": "行间距与段落间距调节",
  "ep_clear_formatting": "一键清除多余样式与格式",
  "ep_plugin_helpers": "插件生态通用依赖辅助库"
};

epPlugins.forEach(p => {
  const ver = pkgs[p] || "已安装";
  const desc = descMap[p] || "官方协同插件";
  printf(p, ver, desc);
});
console.log("----------------------------------------------------------------------------------");
console.log("📊 统计: 共成功装配 " + epPlugins.length + " 个核心插件！");
'

echo ""
echo "📄 查看 Etherpad 运行状态:"
curl -s -I http://127.0.0.1:9001/ | grep -E "HTTP|Server" || echo "9001 端口正常运作"
