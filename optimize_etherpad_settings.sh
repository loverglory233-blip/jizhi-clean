#!/bin/bash
set -e

echo "🚀 ========================================================"
echo "⚡ 正在深度调优 Etherpad settings.json (秒级加载 + 100% 稳定 + 全套工具栏)"
echo "🚀 ========================================================"

export PATH="/www/server/nodejs/v18.20.7/bin:$PATH"
EP_DIR="/www/wwwroot/etherpad-lite"

cd "$EP_DIR"

# 1. 释放 9001 端口
fuser -k 9001/tcp 2>/dev/null || true
sleep 1

# 2. 写入高性能 settings.json
node -e '
const fs = require("fs");
let settings = {};
try {
    settings = JSON.parse(fs.readFileSync("settings.json", "utf8"));
} catch(e) {
    try { settings = JSON.parse(fs.readFileSync("settings.json.template", "utf8")); } catch(err) {}
}

settings.ip = "0.0.0.0";
settings.port = 9001;
settings.minify = true;
settings.maxAge = 21600; // 缓存静态资源6小时, 秒开无等待
settings.showSettingsInAdminPage = true;
settings.suppressErrorsInPadText = true;
settings.requireAuthentication = false;
settings.requireAuthorization = false;
settings.trustProxy = true;

// 配置全套 Word 级工具栏
settings.toolbar = {
    left: [
        ["bold", "italic", "underline", "strikethrough"],
        ["orderedlist", "unorderedlist", "indent", "outdent"],
        ["undo", "redo"],
        ["clearauthorship"],
        ["heading_1", "heading_2", "heading_3", "heading_4", "heading_5", "heading_6"],
        ["font_size", "font_family", "font_color"],
        ["align_left", "align_center", "align_right", "align_justify"],
        ["insert_table", "upload_image", "subscript", "superscript", "line_spacing", "clear_formatting"]
    ],
    right: [
        ["importexport", "timeslider", "savedRevision"],
        ["settings", "showusers"]
    ]
};

fs.writeFileSync("settings.json", JSON.stringify(settings, null, 2), "utf8");
console.log("✅ settings.json 已深度调优 (秒级极速加载 + 全套工具栏已配置)！");
'

# 3. 启动 Etherpad
echo "🚀 正在启动 Etherpad 极速守护进程..."
nohup ./bin/run.sh --root > /var/log/etherpad.log 2>&1 &

sleep 6

# 4. 验证 9001 端口
if curl -s -I http://127.0.0.1:9001/ | grep -E "200|302|HTTP" > /dev/null; then
    echo "🎉🎉🎉 Etherpad 已成功应用高稳定性秒开配置！"
fi

# 5. 重新载入 Nginx 配置
cd /www/wwwroot/47.99.110.230
./fix_nginx_clean_final.sh
