/**
 * JIZHI (集智) 现代化 ES Module 构建装配器 (Node.js 版本)
 * 运行方式: node build.js
 */

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, 'src');
const BUNDLE_FILE = path.join(__dirname, 'js', 'bundle.js');

const MODULE_ORDER = [
  'constants.js',
  'utils.js',
  'agents.js',
  'auth.js',
  'sync.js',
  'login.js',
  'teacher.js',
  'student-portal.js',
  'editor.js',
  'app.js'
];

function cleanEsmForBundle(content) {
  const lines = content.split('\n');
  const cleaned = [];
  let inImport = false;

  for (let line of lines) {
    const stripped = line.trim();
    if (stripped.startsWith('import ') || inImport) {
      if (stripped.includes(';') || stripped.includes('}') || stripped.includes('from ')) {
        inImport = false;
        continue;
      } else {
        inImport = true;
        continue;
      }
    }
    if (stripped.startsWith('export {') && stripped.endsWith('};')) {
      continue;
    }
    if (line.startsWith('export ')) {
      line = line.substring(7);
    } else if (line.startsWith('  export ')) {
      line = '  ' + line.substring(9);
    }
    cleaned.push(line);
  }
  return cleaned.join('\n');
}

function build() {
  console.log('🚀 [ESM Build] 开始组装 JIZHI 现代化模块 (Node.js)...');

  if (!fs.existsSync(SRC_DIR)) {
    console.error('❌ [Build Error] src/ 目录不存在！');
    process.exit(1);
  }

  let bundleContent = `/**\n * JIZHI (集智) Multi-Agent Collaborative Writing Platform\n * Modern ES Module Distribution Bundle\n * (Compiled from src/*.js via build.js)\n */\n\n(function() {\n`;

  for (const filename of MODULE_ORDER) {
    const filePath = path.join(SRC_DIR, filename);
    if (!fs.existsSync(filePath)) {
      console.error(`❌ [Build Error] 缺失必要模块: ${filename}`);
      process.exit(1);
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    const cleaned = cleanEsmForBundle(raw).trim();
    const indented = cleaned.split('\n').map(l => l.trim() ? '  ' + l : '').join('\n');

    bundleContent += `\n  /* ==========================================================================\n     MODULE: ${filename}\n     ========================================================================== */\n`;
    bundleContent += indented + '\n';
    console.log(`   ✅ [ESM Module Loaded] ${filename}`);
  }

  bundleContent += '\n})();\n';

  const jsDir = path.dirname(BUNDLE_FILE);
  if (!fs.existsSync(jsDir)) fs.mkdirSync(jsDir, { recursive: true });

  fs.writeFileSync(BUNDLE_FILE, bundleContent, 'utf8');
  console.log(`🎉 [Build Success] 成功编译生成: ${BUNDLE_FILE} (共 ${MODULE_ORDER.length} 个现代 ES 模块)`);
}

build();
