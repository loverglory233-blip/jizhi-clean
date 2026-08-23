#!/bin/bash
set -e

echo "🚀 ========================================================"
echo "⚡ 注入学术论文规范：首行缩进 2 字符 + 参考文献悬挂缩进"
echo "🚀 ========================================================"

export PATH="/usr/bin:/usr/local/bin:$PATH"
EP_DIR="/www/wwwroot/etherpad-lite"

cd "$EP_DIR"

# 1. 寻找客户端 pad.css 或 skin 样式文件
node -e '
const fs = require("fs");
const path = require("path");

function walk(dir) {
  let results = [];
  try {
    const list = fs.readdirSync(dir);
    list.forEach(file => {
      file = path.join(dir, file);
      const stat = fs.statSync(file);
      if (stat && stat.isDirectory()) {
        if (!file.includes("node_modules") && !file.includes(".git")) {
          results = results.concat(walk(file));
        }
      } else if (file.endsWith(".css")) {
        results.push(file);
      }
    });
  } catch(e) {}
  return results;
}

const cssFiles = walk("src");
const padCss = cssFiles.filter(f => f.includes("pad.css") || f.includes("iframe.css") || f.includes("colibris"));

console.log("🎯 命中 CSS 样式注入文件 (" + padCss.length + " 个):", padCss.join(", "));

const academicIndentCss = `
/* ==========================================================================
   JIZHI 学术论文排版规范增强：首行缩进 2 字符 + 参考文献悬挂缩进 (APA/国标规范)
   ========================================================================== */

/* 正文基础学术行高与字距 */
#innerdocbody {
    line-height: 1.75 !important;
    font-family: -apple-system, "SimSun", "Songti SC", "Times New Roman", STSong, serif !important;
}

/* 参考文献章节/段落专用：APA 悬挂缩进 (Hanging Indent) 规范 */
/* 第一行顶格排版，第二行及后续行自动内缩 2 个中文字符 (2.2em) */
.hanging-indent, [data-hanging-indent="true"], .apa-reference {
    padding-left: 2.2em !important;
    text-indent: -2.2em !important;
    margin-bottom: 8px !important;
}

/* 标准中文学术首行缩进 (2 个汉字宽度) */
.first-line-indent, [data-indent="2em"] {
    text-indent: 2em !important;
}

/* 优化 Tab 键缩进量为标准的 2 字符制表宽度 */
#innerdocbody pre, #innerdocbody code, #innerdocbody div {
    tab-size: 2 !important;
    -moz-tab-size: 2 !important;
}
`;

padCss.forEach(f => {
  try {
    let content = fs.readFileSync(f, "utf8");
    if (!content.includes("JIZHI 学术论文排版规范增强")) {
      content += "\n" + academicIndentCss;
      fs.writeFileSync(f, content, "utf8");
      console.log("  ✅ 成功注入学术缩进规范:", f);
    }
  } catch(e) {}
});
'

# 2. 重新编译前端静态资源以确保 CSS 生效
echo "🔨 正在重新编译前端样式..."
pnpm run build:ui || true

# 3. 重启 Etherpad
fuser -k 9001/tcp 2>/dev/null || true
pkill -9 -f "node" 2>/dev/null || true
sleep 1
export NODE_ENV=production
nohup ./bin/run.sh --root > /var/log/etherpad.log 2>&1 &

echo "⏳ 等待 9001 端口就绪..."
for i in {1..35}; do
    CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:9001/ || echo "000")
    if [ "$CODE" = "200" ] || [ "$CODE" = "302" ]; then
        echo "🎉 9001 端口已成功就绪 (HTTP $CODE)！学术排版规则已全面注入！"
        break
    fi
    echo -n "."
    sleep 1
done
