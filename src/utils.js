/**
 * JIZHI (集智) Platform - Utility Functions
 * Standard ES Module (ESM)
 */

/**
 * ⏱️ 智能人性化时长格式化：将分钟数自动转换为 天 / 小时 / 分钟
 * 例：3081 -> "2天3小时21分", 150 -> "2小时30分", 60 -> "1小时", 45 -> "45分钟"
 */
export function formatDurationHuman(mins, compact = false) {
  const m = parseInt(mins, 10);
  if (isNaN(m) || m <= 0) return '不限时';
  if (m < 60) return `${m}分钟`;
  
  const days = Math.floor(m / 1440);
  const remainMinsAfterDays = m % 1440;
  const hours = Math.floor(remainMinsAfterDays / 60);
  const minutes = remainMinsAfterDays % 60;

  if (days > 0) {
    if (compact) {
      return hours > 0 ? `${days}天${hours}小时` : `${days}天`;
    }
    let res = `${days}天`;
    if (hours > 0) res += `${hours}小时`;
    if (minutes > 0 && days < 3) res += `${minutes}分`;
    return res;
  }
  
  if (compact) {
    return minutes > 0 ? `${hours}小时${minutes}分` : `${hours}小时`;
  }
  return minutes > 0 ? `${hours}小时${minutes}分` : `${hours}小时`;
}

/**
 * 💬 研讨聊天区时间智能格式化：
 * - 今天：HH:mm (如 14:30)
 * - 昨天：昨天 HH:mm (如 昨天 21:05)
 * - 跨天（当年）：MM-DD HH:mm (如 08-23 15:40)
 * - 跨年：YYYY-MM-DD HH:mm
 */
export function formatChatDisplayTime(timeVal) {
  if (!timeVal) return '';
  let d = null;
  if (typeof timeVal === 'number') {
    d = new Date(timeVal);
  } else if (typeof timeVal === 'string') {
    if (/^\d{1,2}:\d{2}/.test(timeVal) && !timeVal.includes('-') && !timeVal.includes('/')) {
      return timeVal; // 已经是 HH:mm
    }
    d = new Date(timeVal.replace(/-/g, '/'));
  }
  if (!d || isNaN(d.getTime())) return String(timeVal || '');

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const oneDayMs = 24 * 60 * 60 * 1000;

  const pad = (n) => String(n).padStart(2, '0');
  const timePart = `${pad(d.getHours())}:${pad(d.getMinutes())}`;

  if (msgDay === today) {
    return timePart;
  } else if (msgDay === today - oneDayMs) {
    return `昨天 ${timePart}`;
  } else if (d.getFullYear() === now.getFullYear()) {
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${timePart}`;
  } else {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${timePart}`;
  }
}

/**
 * 📊 教师端导出 Excel 严谨时间格式：一律 YYYY-MM-DD HH:mm:ss
 */
export function formatExportDateTime(timeVal) {
  if (!timeVal) return new Date().toLocaleString();
  let d = null;
  if (typeof timeVal === 'number') {
    d = new Date(timeVal);
  } else if (typeof timeVal === 'string') {
    d = new Date(timeVal.replace(/-/g, '/'));
  }
  if (!d || isNaN(d.getTime())) {
    return String(timeVal);
  }
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * 🕒 统一标准时间格式化（严格使用横杠 - 分隔）：YYYY-MM-DD HH:mm
 */
export function formatStandardDateDash(val) {
  if (!val) return '';
  const str = String(val).trim();
  if (str.includes('无') || str.includes('随时') || str.includes('结课前') || str.includes('刚刚') || str.includes('不限')) return str;
  const d = new Date(str.replace(/-/g, '/'));
  if (isNaN(d.getTime())) return str.replace(/\//g, '-');
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * 🛡️ 任务截止状态判定：如果当前本地时间已超过截止时间，判定为已截止 (过期)
 */
export function isTaskExpired(task) {
  if (!task || !task.deadline) return false;
  try {
    const raw = String(task.deadline).trim();
    if (!raw || raw.includes('无') || raw.includes('随时') || raw.includes('结课前') || raw.includes('不限')) return false;
    const deadlineStr = raw.replace(/-/g, '/');
    const deadlineTime = new Date(deadlineStr).getTime();
    if (isNaN(deadlineTime)) return false;
    return Date.now() > deadlineTime;
  } catch (e) {
    return false;
  }
}

/**
 * 🛡️ XSS 防护：HTML 字符实体安全转义
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * 🛡️ 安全链接过滤：仅允许 http/https/mailto/tel/相对路径，阻断 javascript: 伪协议
 */
export function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') return '#';
  const clean = url.trim();
  if (/^(?:(?:https?|mailto|tel|data):|\/|\.\/|\.\.\/|#)/i.test(clean)) {
    return clean;
  }
  return '#';
}

export function downloadFileBlob(filename, textContent = null) {
  const defaultContent = `====================================================\n【集智 JIZHI 平台 - 教学资源文件】\n文件名: ${filename}\n下载时间: ${new Date().toLocaleString()}\n课程名称: 《现代教育技术》期末协作写作研究设计\n====================================================\n\n【文件核心规范摘要】\n1. 结构完整性：论文方案需具备研究背景、问题假设、文献综述、研究设计、反思及参考文献。\n2. 变量操作化：研究假设 H1、H2 需在第四章给出对应的测量量表与操作化说明。\n3. 群体感知：通过可视化字数贡献比与同伴互动进行自律与共享调节 (SSRL)。`;
  const content = textContent || defaultContent;
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function getUniqueMembersList(membersMap) {
  if (!membersMap || typeof membersMap !== 'object') return [];
  const seen = new Set();
  const list = [];
  Object.values(membersMap).forEach(m => {
    if (m && m.id && !seen.has(m.id)) {
      seen.add(m.id);
      list.push(m);
    }
  });
  return list;
}

export function smartParseStudentRow(rowItems, colIndexMap = null) {
  if (!Array.isArray(rowItems) || rowItems.length === 0) return null;
  const cleanItems = rowItems.map(c => String(c !== undefined && c !== null ? c : '').trim()).filter(Boolean);
  if (cleanItems.length === 0) return null;

  // 1. 如果有明确的表头映射表，按映射取值
  if (colIndexMap && (colIndexMap.nameIdx !== undefined || colIndexMap.codeIdx !== undefined)) {
    const name = colIndexMap.nameIdx !== undefined && rowItems[colIndexMap.nameIdx] ? String(rowItems[colIndexMap.nameIdx]).trim() : '';
    const code = colIndexMap.codeIdx !== undefined && rowItems[colIndexMap.codeIdx] ? String(rowItems[colIndexMap.codeIdx]).trim() : '';
    const pwd = colIndexMap.pwdIdx !== undefined && rowItems[colIndexMap.pwdIdx] ? String(rowItems[colIndexMap.pwdIdx]).trim() : '123';
    if (name && code) {
      return { name, studentCode: code, username: code, customPassword: pwd || '123' };
    }
  }

  // 2. 启发式内容特征识别（无表头或格式不规则）
  let name = '';
  let studentCode = '';
  let password = '123';

  // 优先寻找纯数字或典型学号 (长度 >= 3 的数字或字母数字组合)
  const codeCandidates = cleanItems.filter(item => /^[a-zA-Z0-9_-]{2,20}$/.test(item));
  // 寻找姓名 (中文汉字或带空格的常规姓名)
  const nameCandidates = cleanItems.filter(item => /^[\u4e00-\u9fa5a-zA-Z\s·•]{2,20}$/.test(item) && !/^\d+$/.test(item));

  if (nameCandidates.length > 0 && codeCandidates.length > 0) {
    name = nameCandidates[0];
    studentCode = codeCandidates.find(c => c !== name) || codeCandidates[0];
    const remaining = cleanItems.filter(c => c !== name && c !== studentCode);
    if (remaining.length > 0) password = remaining[0];
  } else if (cleanItems.length >= 2) {
    name = cleanItems[0];
    studentCode = cleanItems[1];
    if (cleanItems.length >= 3) password = cleanItems[2];
  }

  if (name && studentCode) {
    return { name, studentCode, username: studentCode, customPassword: password || '123' };
  }
  return null;
}

export function parseCSVText(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  
  let colIndexMap = null;
  const result = [];

  lines.forEach((line, idx) => {
    let parts = [];
    if (line.includes('\t')) parts = line.split('\t').map(p => p.trim());
    else if (line.includes(',')) parts = line.split(',').map(p => p.trim());
    else if (line.includes('，')) parts = line.split('，').map(p => p.trim());
    else parts = line.split(/\s+/).map(p => p.trim());

    if (idx === 0) {
      const lowerParts = parts.map(p => p.toLowerCase());
      const hasHeader = lowerParts.some(p => p.includes('姓名') || p.includes('学号') || p.includes('工号') || p.includes('name') || p.includes('code'));
      if (hasHeader) {
        colIndexMap = {};
        lowerParts.forEach((p, i) => {
          if (p.includes('姓名') || p.includes('名字') || p.includes('name')) colIndexMap.nameIdx = i;
          else if (p.includes('学号') || p.includes('工号') || p.includes('code') || p.includes('账号')) colIndexMap.codeIdx = i;
          else if (p.includes('密码') || p.includes('pwd') || p.includes('pass')) colIndexMap.pwdIdx = i;
        });
        return;
      }
    }

    const std = smartParseStudentRow(parts, colIndexMap);
    if (std) result.push(std);
  });
  return result;
}

export function parseXLSXOrCSVFile(file, callback) {
  if (file.name.endsWith('.csv') || file.type.includes('csv')) {
    const reader = new FileReader();
    reader.onload = (e) => callback(parseCSVText(e.target.result));
    reader.readAsText(file);
  } else {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        if (window.XLSX) {
          const data = new Uint8Array(e.target.result);
          const workbook = window.XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const json = window.XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
          const students = [];
          let colIndexMap = null;

          json.forEach((row, idx) => {
            if (!row || row.length === 0) return;
            const strRow = row.map(cell => String(cell !== undefined && cell !== null ? cell : '').trim());
            
            if (idx === 0) {
              const lowerRow = strRow.map(s => s.toLowerCase());
              const hasHeader = lowerRow.some(p => p.includes('姓名') || p.includes('学号') || p.includes('工号') || p.includes('name') || p.includes('code'));
              if (hasHeader) {
                colIndexMap = {};
                lowerRow.forEach((p, i) => {
                  if (p.includes('姓名') || p.includes('名字') || p.includes('name')) colIndexMap.nameIdx = i;
                  else if (p.includes('学号') || p.includes('工号') || p.includes('code') || p.includes('账号')) colIndexMap.codeIdx = i;
                  else if (p.includes('密码') || p.includes('pwd') || p.includes('pass')) colIndexMap.pwdIdx = i;
                });
                return;
              }
            }

            const std = smartParseStudentRow(strRow, colIndexMap);
            if (std) students.push(std);
          });
          callback(students);
        } else {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
          script.onload = () => parseXLSXOrCSVFile(file, callback);
          script.onerror = () => {
            const fallbackScript = document.createElement('script');
            fallbackScript.src = 'https://cdn.bootcdn.net/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
            fallbackScript.onload = () => parseXLSXOrCSVFile(file, callback);
            fallbackScript.onerror = () => alert('⚠️ 无法加载 Excel 解析引擎，请尝试将表格保存为 .csv 格式后直接上传！');
            document.head.appendChild(fallbackScript);
          };
          document.head.appendChild(script);
        }
      } catch (err) {
        alert('⚠️ XLSX 文件解析异常，请另存为 CSV 文件后导入！');
      }
    };
    reader.readAsArrayBuffer(file);
  }
}

export function getCaretCharacterOffsetWithin(element) {
  let caretOffset = 0;
  const doc = element.ownerDocument || element.document;
  const win = doc.defaultView || window;
  const sel = win.getSelection();
  if (sel && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(element);
    preCaretRange.setEnd(range.endContainer, range.endOffset);
    caretOffset = preCaretRange.toString().length;
  }
  return caretOffset;
}

export function setCaretPositionWithin(element, offset) {
  const doc = element.ownerDocument || element.document;
  const win = doc.defaultView || window;
  const sel = win.getSelection();
  if (!sel) return;
  let charIndex = 0;
  const range = doc.createRange();
  range.setStart(element, 0);
  range.collapse(true);

  const nodeStack = [element];
  let node, found = false;

  while (!found && (node = nodeStack.pop())) {
    if (node.nodeType === 3) {
      const nextCharIndex = charIndex + node.length;
      if (offset >= charIndex && offset <= nextCharIndex) {
        range.setStart(node, offset - charIndex);
        range.collapse(true);
        found = true;
        break;
      }
      charIndex = nextCharIndex;
    } else {
      let i = node.childNodes.length;
      while (i--) {
        nodeStack.push(node.childNodes[i]);
      }
    }
  }

  if (found) {
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

/**
 * 🛡️ 聊天数据智能清洗与名单白名单过滤器（方案 A）
 * 1. 过滤不在当前班级/当前组名单内的早期历史联调测试游离数据 (如 001、梁亦缘)
 * 2. 智能体开场白去重：重复的开场白仅保留最新 1 条
 */
export function filterAndDeduplicateChatLogs(messages, validMembersList = null) {
  if (!Array.isArray(messages)) return [];
  const validUserIds = new Set();
  if (validMembersList && Array.isArray(validMembersList)) {
    validMembersList.forEach(m => {
      if (m.id) validUserIds.add(String(m.id).toLowerCase());
      if (m.studentCode) validUserIds.add(String(m.studentCode).toLowerCase());
      if (m.username) validUserIds.add(String(m.username).toLowerCase());
      if (m.name) validUserIds.add(String(m.name).toLowerCase());
    });
  }

  const result = [];
  const seenAgentOpenings = new Set();

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (!m || typeof m !== 'object') continue;
    const sender = String(m.sender || '');
    const isAgent = (m.sender && (m.sender.startsWith('agent_') || ['auctioneer', 'architect', 'analyst', 'editor', 'challenger', 'chair'].includes(m.sender)));

    // 1. 如果不是智能体，检查发言者是否为当前班级/小组的有效成员（过滤早期游离测试账号）
    if (!isAgent && validMembersList && validMembersList.length > 0) {
      const senderKey = sender.toLowerCase();
      const senderName = String(m.senderName || '').toLowerCase();
      if (!validUserIds.has(senderKey) && !validUserIds.has(senderName)) {
        continue;
      }
    }

    // 2. 智能体重复开场白去重
    if (isAgent && m.text) {
      const textTrim = m.text.trim();
      if (textTrim.includes('【拍卖师开场】') || textTrim.includes('【架构师开场】') || textTrim.includes('【主笔人开场】') || textTrim.includes('【辩论主席开场】')) {
        const opKey = `${sender}_${textTrim}`;
        if (seenAgentOpenings.has(opKey)) {
          continue;
        }
        seenAgentOpenings.add(opKey);
      }
    }

    result.push(m);
  }

  return result;
}

/**
 * 🔔 全局轻量浮层通知横幅（全场景通用：任务延长、紧急提醒等）
 */
export function showGlobalBannerNotice(title, message, type = 'info') {
  if (typeof document === 'undefined') return;
  const existing = document.getElementById('jizhi-global-banner-notice');
  if (existing) existing.remove();

  const banner = document.createElement('div');
  banner.id = 'jizhi-global-banner-notice';
  banner.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 9999999;
    background: linear-gradient(135deg, #1e293b, #0f172a);
    color: #ffffff;
    padding: 12px 22px;
    border-radius: 12px;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.15);
    display: flex;
    align-items: center;
    gap: 12px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 13.5px;
    pointer-events: auto;
  `;

  banner.innerHTML = `
    <div style="font-size: 20px;">🔔</div>
    <div>
      <div style="font-weight: 800; color: #60a5fa; font-size: 14px;">${escapeHtml(title)}</div>
      <div style="color: #e2e8f0; font-size: 12.5px; margin-top: 2px;">${escapeHtml(message)}</div>
    </div>
    <button style="background: none; border: none; color: #94a3b8; font-size: 18px; cursor: pointer; margin-left: 12px; padding: 0 4px; line-height: 1;" onclick="this.parentElement.remove()">×</button>
  `;

  document.body.appendChild(banner);
  setTimeout(() => {
    if (banner && banner.parentElement) {
      banner.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      banner.style.opacity = '0';
      banner.style.transform = 'translateX(-50%) translateY(-10px)';
      setTimeout(() => banner.remove(), 300);
    }
  }, 6000);
}
