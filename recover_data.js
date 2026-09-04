const fs = require('fs');
const http = require('http');
const { execSync } = require('child_process');

console.log('🔍 [1/3] 正在全盘搜索 Etherpad API Key 与 MySQL 数据库...');

let apiKey = 'jizhi_academic_secret_key_2026';
const possibleKeyFiles = [
  '/www/wwwroot/etherpad-lite/APIKEY.txt',
  '/root/etherpad-lite/APIKEY.txt',
  'APIKEY.txt',
  'var/APIKEY.txt'
];

for (const kf of possibleKeyFiles) {
  if (fs.existsSync(kf)) {
    const k = fs.readFileSync(kf, 'utf8').trim();
    if (k) { apiKey = k; break; }
  }
}
console.log('🔑 使用 API Key:', apiKey.slice(0, 10) + '...');

function epSetText(padID, text) {
  return new Promise((resolve) => {
    const postData = 'apikey=' + encodeURIComponent(apiKey) + '&padID=' + encodeURIComponent(padID) + '&text=' + encodeURIComponent(text);
    const req = http.request({
      hostname: '127.0.0.1',
      port: 9001,
      path: '/api/1.2.14/setText',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch (e) { resolve({ raw: d }); }
      });
    });
    req.on('error', (e) => resolve(null));
    req.write(postData);
    req.end();
  });
}

// 2. 深度扫描数据库与备份
const foundTexts = [];

// A. 扫描 MySQL
try {
  const mysqlOut = execSync('mysql -uroot -p$(cat /www/server/data/default.pl 2>/dev/null || cat /root/.mysql_root_password 2>/dev/null || echo "root") -e "SELECT scope_key, stage2_data FROM jizhi.group_states; SELECT task_id, group_id, snapshot_data FROM jizhi.room_snapshots;" 2>/dev/null').toString();
  const matches = mysqlOut.match(/\{.*?\}/g) || [];
  for (const m of matches) {
    try {
      const obj = JSON.parse(m);
      if (obj.unifiedContent && obj.unifiedContent.length > 20) {
        foundTexts.push({ src: 'MySQL group_states', text: obj.unifiedContent, len: obj.unifiedContent.length });
      }
      if (obj.stage2 && obj.stage2.unifiedContent && obj.stage2.unifiedContent.length > 20) {
        foundTexts.push({ src: 'MySQL room_snapshots', text: obj.stage2.unifiedContent, len: obj.stage2.unifiedContent.length });
      }
    } catch (e) {}
  }
} catch (e) {}

// B. 扫描 dirty.db
try {
  const dbFiles = execSync('find /www /root /opt /var /tmp -name "*dirty.db*" 2>/dev/null').toString().trim().split('\n');
  for (const db of dbFiles) {
    if (!db || !fs.existsSync(db)) continue;
    try {
      const lines = fs.readFileSync(db, 'utf8').split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line);
          if (obj.val && obj.val.atext && obj.val.atext.text) {
            const txt = obj.val.atext.text.trim();
            if (txt.length > 15 && !txt.startsWith('一、研究背景与意义\n\n二、文献综述')) {
              foundTexts.push({ src: `${db} -> ${obj.key}`, text: txt, len: txt.length });
            }
          }
        } catch (e) {}
      }
    } catch (e) {}
  }
} catch (e) {}

foundTexts.sort((a, b) => b.len - a.len);

console.log(`\n📋 [2/3] 全盘扫描结果：找到 ${foundTexts.length} 条有效历史文本`);
foundTexts.slice(0, 5).forEach((item, idx) => {
  console.log(`\n  [#${idx + 1}] 来源: ${item.src} (${item.len} 字)`);
  console.log(`  正文预览: ${JSON.stringify(item.text.slice(0, 120))}...`);
});

async function run() {
  if (foundTexts.length === 0) {
    console.log('\n⚠️ 未在数据库或文件备份中找到可恢复的历史长文。');
    return;
  }
  const best = foundTexts[0];
  console.log(`\n🚀 [3/3] 正在将最佳正文 (#1, 共 ${best.len} 字) 自动同步写入各小组 Pad...`);
  
  const targetPads = [
    'jizhi_task_1788425432337_group_1788425352640_6',
    'jizhi_task_1788425432337_group_1788425352640_10',
    'jizhi_task_1788425432337_group_6',
    'jizhi_task_1788425432337_group_10'
  ];

  for (const pid of targetPads) {
    const res = await epSetText(pid, best.text);
    console.log(`   ✅ 写入 Pad [${pid}] ->`, res && res.code === 0 ? '成功' : JSON.stringify(res));
  }

  console.log('\n🎉🎉🎉 正文恢复写入完成！请在浏览器按 Ctrl+F5 刷新查看。');
}

run();
