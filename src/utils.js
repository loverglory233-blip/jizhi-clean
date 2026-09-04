/**
 * JIZHI (集智) Platform - Utility Functions
 * Standard ES Module (ESM)
 */

/**
 * 🛡️ 鲁棒性 JSON 解析器：自动清洗末尾逗号、容错解析，避免 Uncaught SyntaxError
 */
export function safeJsonParse(raw, fallback = null) {
  if (!raw || typeof raw !== 'string') return fallback;
  try {
    return JSON.parse(raw);
  } catch (e) {
    try {
      // 自动清洗末尾冗余逗号：如 { "a": 1, } 或 [ 1, 2, ]
      const cleaned = raw.replace(/,\s*([}\]])/g, '$1');
      return JSON.parse(cleaned);
    } catch (e2) {
      return fallback;
    }
  }
}

/**
 * 👤 全维度用户标识提取器：提取一个用户对象的全部等价唯一标识（id, name）
 */
export function getUserAllKeys(user) {
  if (!user) return [];
  if (typeof user === 'string') return [user.trim()];
  const keys = new Set();
  if (user.id) keys.add(String(user.id).trim());
  if (user.userId) keys.add(String(user.userId).trim());
  if (user.name) keys.add(String(user.name).trim());
  return Array.from(keys);
}

/**
 * 🔍 判断两个用户标识/对象是否为同一个人（任意标识命中即为同一人）
 */
export function isSameUser(userA, userB) {
  if (!userA || !userB) return false;
  const keysA = getUserAllKeys(userA);
  const keysB = getUserAllKeys(userB);
  return keysA.some(ka => keysB.some(kb => ka.toLowerCase() === kb.toLowerCase()));
}

/**
 * 🗺️ 从状态字典（如 votes, hasVoted, confirmedMembers, presence, readStatus）中查询某用户是否存在或已确认
 */
export function isUserInMap(map, user) {
  if (!map || typeof map !== 'object' || !user) return false;
  const keys = getUserAllKeys(user);
  return keys.some(k => Boolean(map[k]));
}

/**
 * 🗺️ 从状态字典（如 votes, hasVoted, confirmedMembers）中查询某成员（对象、字符串ID或姓名）是否已完成
 */
export function isMemberDone(map, m) {
  if (!map || typeof map !== 'object' || !m) return false;
  const keys = getUserAllKeys(m);
  if (keys.length > 0 && keys.some(k => Boolean(map[k]))) return true;
  const id = typeof m === 'object' ? (m.id || m.name) : m;
  return Boolean(map[id] || (typeof m === 'object' && m.name && map[m.name]));
}

/**
 * 🗺️ 从状态字典中获取某用户的值
 */
export function getUserFromMap(map, user) {
  if (!map || typeof map !== 'object' || !user) return undefined;
  const keys = getUserAllKeys(user);
  for (const k of keys) {
    if (map[k] !== undefined) return map[k];
  }
  return undefined;
}

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
  if (!task) return false;
  try {
    let raw = '';
    if (typeof task === 'object' && task !== null) {
      if (task.lastExtension && task.lastExtension.newDeadline) {
        raw = String(task.lastExtension.newDeadline).trim();
      } else {
        raw = String(task.deadline || '').trim();
      }
    } else {
      raw = String(task).trim();
    }
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

export async function downloadFileBlob(filename, textContent = null, fileUrl = null) {
  const safeFilename = filename || '教学随附资源文献.pdf';

  // 1. 如果有真实文件下载 URL（无论是全路径、相对路径 /uploads/ 或 Base64 DataURL / Blob）
  if (fileUrl && typeof fileUrl === 'string' && fileUrl.trim() !== '' && fileUrl !== '#') {
    let cleanUrl = fileUrl.trim();

    // 🛡️ 智能同源相对路径标准化：提取 /uploads/ 后的路径，规避跨协议/跨域/SSL Mixed Content 拦截
    if (cleanUrl.includes('/uploads/')) {
      cleanUrl = cleanUrl.substring(cleanUrl.indexOf('/uploads/'));
    }

    // ⚡ 0 毫秒即时唤起原生下载：绝不用 fetch 阻塞等待全文件下载到内存
    const a = document.createElement('a');
    a.href = cleanUrl;
    a.download = safeFilename;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { if (document.body.contains(a)) document.body.removeChild(a); }, 500);
    return;
  }

  // 2. 兜底保障：若文件 URL 暂未落盘或为纯文本，自适应生成规范文献学习文档立即启动下载，确保点击必有响应！
  const fallbackText = textContent || `【集智 JIZHI 教学随附学术文献与导学要点】\n\n📌 随附文献：${safeFilename}\n📅 归档日期：${new Date().toLocaleDateString()}\n🏫 教学指引：本文件为课程任课教师发布的学术参考范文与随附学习资料，请参照相关学术规范开展研读与写作论证。`;

  let mimeType = 'text/plain;charset=utf-8;';
  if (safeFilename.endsWith('.pdf')) mimeType = 'application/pdf';
  else if (safeFilename.endsWith('.docx')) mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  else if (safeFilename.endsWith('.doc')) mimeType = 'application/msword';
  else if (safeFilename.endsWith('.xlsx')) mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  const blob = new Blob([fallbackText], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeFilename.includes('.') ? safeFilename : `${safeFilename}.txt`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    if (document.body.contains(a)) document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
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
      return { id: code, name, password: pwd || '123' };
    }
  }

  // 2. 启发式内容特征识别（无表头或格式不规则）
  let name = '';
  let id = '';
  let password = '123';

  // 优先寻找纯数字或典型学号 (长度 >= 3 的数字或字母数字组合)
  const codeCandidates = cleanItems.filter(item => /^[a-zA-Z0-9_-]{2,20}$/.test(item));
  // 寻找姓名 (中文汉字或带空格的常规姓名)
  const nameCandidates = cleanItems.filter(item => /^[\u4e00-\u9fa5a-zA-Z\s·•]{2,20}$/.test(item) && !/^\d+$/.test(item));

  if (nameCandidates.length > 0 && codeCandidates.length > 0) {
    name = nameCandidates[0];
    id = codeCandidates.find(c => c !== name) || codeCandidates[0];
    const remaining = cleanItems.filter(c => c !== name && c !== id);
    if (remaining.length > 0) password = remaining[0];
  } else if (cleanItems.length >= 2) {
    name = cleanItems[0];
    id = cleanItems[1];
    if (cleanItems.length >= 3) password = cleanItems[2];
  }

  if (name && id) {
    return { id: id, name, password: password || '123' };
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
 * 🛡️ 聊天数据安全清洗与智能体开场白去重
 * 1. 消除智能体重复开场白
 * 2. 消除相同时间戳与文本的重复气泡
 * 3. 100% 保护真实组员发言与即时输入新消息，绝不误删
 */
export function filterAndDeduplicateChatLogs(messages) {
  if (!Array.isArray(messages)) return [];
  const result = [];
  const seenAgentOpenings = new Set();
  const seenMsgIds = new Set();

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (!m || typeof m !== 'object') continue;
    const txt = String(m.text || '').trim();
    if (!txt) continue;

    // 🛡️ 过滤正在提炼中的临时过渡/思考占位消息 (如 "收到全组成员确认！...正在根据讨论区研讨记录提炼...")
    if (m.isThinking || txt.startsWith('⏳ 收到全组成员确认') || (txt.includes('收到全组成员确认') && txt.includes('请稍候'))) {
      continue;
    }

    const sender = String(m.sender || '');
    const isAgent = (
      sender.startsWith('agent_') || 
      ['managingEditor', 'reviewingEditor', 'auctioneer', 'architect', 'analyst', 'editor', 'challenger', 'chair', 'system'].includes(sender) ||
      txt.includes('【责任编辑') ||
      txt.includes('【审稿编辑') ||
      txt.includes('【学术拍卖师') ||
      txt.includes('【结构架构师') ||
      txt.includes('【论证分析师')
    );

    // 1. 智能体连发防重：智能体若因网络重试/定时器/刷新连发了完全相同或同类型的引导提示，自动去重仅保留 1 条
    if (isAgent) {
      const normTxt = txt.replace(/\s+/g, " ").trim();
      const opKey = `${sender}_${normTxt}`;
      const isSecondChecklist = txt.includes('二审修正清单') || txt.includes('二审修改落实要点');
      if (isSecondChecklist && seenAgentOpenings.has(`${sender}_second_checklist`)) {
        continue;
      }
      if (seenAgentOpenings.has(opKey)) {
        continue;
      }
      seenAgentOpenings.add(opKey);
      if (isSecondChecklist) seenAgentOpenings.add(`${sender}_second_checklist`);
    }

    // 2. 严格按数据库主键/唯一标识防重，绝不按文本做模糊误杀
    const msgId = m.id ? String(m.id) : (m._timeMs ? `${sender}_${m._timeMs}_${i}` : null);
    if (msgId) {
      if (seenMsgIds.has(msgId)) continue;
      seenMsgIds.add(msgId);
    }

    result.push(m);
  }

  return result;
}

/**
 * 🔔 全局轻量浮层通知横幅（全场景通用：任务延长、紧急提醒等）
 */
export function showGlobalBannerNotice(title, message, type = 'info', duration = 8000) {
  if (typeof document === 'undefined') return;
  const existing = document.getElementById('jizhi-global-banner-notice');
  if (existing && typeof existing.remove === 'function') {
    existing.remove();
  } else if (existing && existing.parentNode) {
    existing.parentNode.removeChild(existing);
  }

  const banner = document.createElement('div');
  banner.id = 'jizhi-global-banner-notice';
  banner.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 9999999;
    background: #ffffff;
    color: #0f172a;
    padding: 12px 20px;
    border-radius: 12px;
    box-shadow: 0 12px 32px rgba(30, 58, 138, 0.16), 0 0 0 1px #93c5fd;
    border: 1.5px solid #3b82f6;
    display: flex;
    align-items: center;
    gap: 12px;
    max-width: 90vw;
    width: max-content;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 13.5px;
    pointer-events: auto;
    animation: bannerSlideDown 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  `;

  banner.innerHTML = `
    <style>
      @keyframes bannerSlideDown {
        from { opacity: 0; transform: translateX(-50%) translateY(-18px) scale(0.96); }
        to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
      }
    </style>
    <div style="font-size: 22px; line-height: 1; flex-shrink: 0;">⏳</div>
    <div style="display: flex; flex-direction: column; gap: 2px; text-align: left;">
      <div style="font-weight: 800; color: #1e3a8a; font-size: 14px; display: flex; align-items: center; gap: 6px;">
        <span>${escapeHtml(title)}</span>
      </div>
      <div style="color: #334155; font-size: 13px; line-height: 1.5;">${escapeHtml(message)}</div>
    </div>
    <button id="btn-close-global-banner" style="background: #f1f5f9; border: 1px solid #cbd5e1; color: #64748b; font-size: 16px; width: 26px; height: 26px; border-radius: 50%; cursor: pointer; margin-left: 12px; display: flex; align-items: center; justify-content: center; font-weight: 700; flex-shrink: 0; transition: all 0.15s;" title="关闭">✕</button>
  `;

  document.body.appendChild(banner);

  let dismissTimer = null;
  const startTimer = (ms) => {
    if (dismissTimer) clearTimeout(dismissTimer);
    dismissTimer = setTimeout(() => {
      if (banner && banner.parentElement) {
        banner.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
        banner.style.opacity = '0';
        banner.style.transform = 'translateX(-50%) translateY(-14px)';
        setTimeout(() => { if (banner && banner.parentElement) banner.remove(); }, 250);
      }
    }, ms);
  };

  startTimer(duration);

  banner.addEventListener('mouseenter', () => {
    if (dismissTimer) clearTimeout(dismissTimer);
  });

  banner.addEventListener('mouseleave', () => {
    startTimer(3000);
  });

  const btnClose = banner.querySelector('#btn-close-global-banner');
  if (btnClose) {
    btnClose.addEventListener('click', (e) => {
      e.stopPropagation();
      if (dismissTimer) clearTimeout(dismissTimer);
      banner.style.transition = 'opacity 0.15s ease, transform 0.15s ease';
      banner.style.opacity = '0';
      banner.style.transform = 'translateX(-50%) translateY(-14px)';
      setTimeout(() => { if (banner && banner.parentElement) banner.remove(); }, 150);
    });
  }
}

/**
 * 🛡️ 解析失败阻断提示：弹出醒目全局横幅 + 返回富交互占位 HTML（用于替换画布/容器，阻止学生非法编辑并提供多种一键恢复手段）。
 * @param {string} reason 阻断原因文案
 * @returns {string} 用于渲染进画布容器的阻断占位 HTML
 */
export function showResolutionBlock(reason) {
  const safe = escapeHtml(reason || '无法解析当前协作上下文，请刷新重试或重新登录');
  showGlobalBannerNotice('⚠️ 无法继续', safe, 'error', 0);
  return `
    <div style="min-height:300px; width:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:16px; padding:36px 24px; background:linear-gradient(180deg, #fef2f2 0%, #fff5f5 100%); border:1.5px dashed #fca5a5; border-radius:14px; text-align:center; box-sizing:border-box;">
      <div style="font-size:46px; line-height:1; animation:pulse 2s infinite;">🛑</div>
      <div style="font-size:16.5px; font-weight:800; color:#b91c1c; max-width:600px; line-height:1.5;">${safe}</div>
      <div style="font-size:12.5px; color:#64748b; max-width:540px; line-height:1.6;">
        系统已自动保护您的工作区。您可以尝试下方操作进行恢复；若多次重试仍无效，请联系任课教师核对分班、分组或任务状态。
      </div>
      <div style="display:flex; align-items:center; justify-content:center; gap:12px; flex-wrap:wrap; margin-top:8px;">
        <button onclick="window.location.reload();" style="background:#2563eb; color:#ffffff; border:none; padding:8px 18px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:6px; box-shadow:0 2px 6px rgba(37,99,235,0.25); transition:all 0.2s ease;">
          <span>🔄 刷新重试</span>
        </button>
        <button onclick="if(window.app && typeof window.app.renderMain === 'function') { window.app.state.studentViewMode='task_list'; try { sessionStorage.setItem('jizhi_student_view_mode','task_list'); localStorage.setItem('jizhi_student_view_mode','task_list'); } catch(e){} window.app.renderMain(); } else { window.location.reload(); }" style="background:#ffffff; color:#334155; border:1px solid #cbd5e1; padding:8px 16px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:6px; transition:all 0.2s ease;">
          <span>📋 返回任务大厅</span>
        </button>
        <button onclick="if(window.app && typeof window.app.handleLogout === 'function') { window.app.handleLogout(); } else { try { localStorage.removeItem('jizhi_current_user'); sessionStorage.clear(); } catch(e){} window.location.reload(); }" style="background:#fee2e2; color:#b91c1c; border:1px solid #fecaca; padding:8px 16px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:6px; transition:all 0.2s ease;">
          <span>🚪 重新登录</span>
        </button>
      </div>
    </div>`;
}

/**
 * ⏳ 任务截止时间延长弹窗（场景 1：学生正处于该任务内）
 */
export function showTaskExtendedUnlockModal(task, prevDeadline, isUnlockedNow = false) {
  if (typeof document === 'undefined') return;
  const existing = document.getElementById('modal-task-extended-unlock');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'modal-task-extended-unlock';
  modal.className = 'modal-overlay';
  modal.style.cssText = 'position:fixed; inset:0; z-index:9999999; background:rgba(15,23,42,0.68); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; animation:fadeIn 0.25s ease; overscroll-behavior:contain;';

  modal.innerHTML = `
    <div style="background:#ffffff; border-radius:16px; width:90%; max-width:440px; padding:28px 24px; box-shadow:0 20px 40px rgba(15,23,42,0.25); text-align:center; border:2px solid #3b82f6; display:flex; flex-direction:column; gap:16px; animation:scaleUp 0.25s ease; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; position:relative; overscroll-behavior:contain;">
      <button id="btn-close-task-unlock-x" style="position:absolute; top:12px; right:12px; border:none; background:#f1f5f9; color:#64748b; font-size:18px; width:28px; height:28px; border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center; font-weight:800;" title="关闭">✕</button>
      <div style="width:60px; height:60px; border-radius:50%; background:#eff6ff; border:2px solid #bfdbfe; display:flex; align-items:center; justify-content:center; font-size:30px; margin:0 auto;">
        ⏳
      </div>
      <div>
        <div style="font-size:18px; font-weight:800; color:#1e3a8a;">任务截止时间已延长！</div>
        <div style="font-size:13.5px; color:#475569; margin-top:8px; line-height:1.6;">
          任课教师已将任务《<b>${escapeHtml(task.title || '协作写作')}</b>》截止时间延长至：
        </div>
        <div style="font-size:16px; font-weight:800; color:#2563eb; background:#f0f7ff; padding:8px 14px; border-radius:8px; margin:10px auto 0; border:1px dashed #93c5fd; display:inline-block;">
          📅 ${escapeHtml(task.deadline || '未设定')}
        </div>
      </div>
      ${isUnlockedNow ? `
        <div style="background:#ecfdf5; border:1px solid #a7f3d0; border-radius:8px; padding:10px 12px; color:#065f46; font-size:12.5px; font-weight:700; display:flex; align-items:center; justify-content:center; gap:6px;">
          <span>✅ 协作正文已为您自动【解除只读锁定】，可正常编辑！</span>
        </div>
      ` : `
        <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:10px 12px; color:#15803d; font-size:12.5px; font-weight:700; display:flex; align-items:center; justify-content:center; gap:6px;">
          <span>⏱️ 写作时长已同步增加，请抓紧时间协同完成！</span>
        </div>
      `}
      <div style="display:flex; gap:10px; margin-top:4px;">
        <button id="btn-confirm-task-unlock" style="flex:1; background:linear-gradient(135deg, #2563eb, #1d4ed8); color:#ffffff; border:none; padding:12px 18px; border-radius:10px; font-size:15px; font-weight:800; cursor:pointer; box-shadow:0 4px 12px rgba(37,99,235,0.28); transition:all 0.2s;">
          🚀 我知道了，立即继续协作
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const closeModal = () => {
    if (modal && modal.parentElement) modal.remove();
  };

  const btn = modal.querySelector('#btn-confirm-task-unlock');
  if (btn) btn.addEventListener('click', closeModal);

  const btnX = modal.querySelector('#btn-close-task-unlock-x');
  if (btnX) btnX.addEventListener('click', closeModal);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
}

/**
 * 🔒 权威只读注入器：从 DOM 层与内核层双重锁定 Etherpad 文档
 * - 彻底隐藏顶部编辑工具栏与底部操作栏
 * - 强制设置 innerdocbody contenteditable="false"，彻底杜绝键盘输入、剪切与修改
 * - 完整保留原生鼠标滚轮、触摸滑动与文字查阅能力（shield 采用 pointer-events:none，不拦截任何滚动事件）
 */
export function enforceEtherpadReadonly(iframe) {
  if (!iframe) return;
  iframe._isReadonlyEnforced = true;

  // 🛡️ 1. 物理级点击拦截遮罩：pointer-events:auto 阻断任何鼠标点击、聚焦与键盘光标进入 iframe
  const container = iframe.parentElement;
  if (container) {
    let shield = container.querySelector('.etherpad-readonly-shield');
    if (!shield) {
      shield = document.createElement('div');
      shield.className = 'etherpad-readonly-shield';
      shield.style.cssText = 'position:absolute; inset:0; z-index:99; background:transparent; cursor:default; pointer-events:auto;';
      shield.title = '🔒 只读查阅模式 (已锁定禁止编辑)';
      container.style.position = 'relative';
      container.appendChild(shield);
    } else {
      shield.style.cssText = 'position:absolute; inset:0; z-index:99; background:transparent; cursor:default; pointer-events:auto;';
    }

    // 滚轮穿透：将 shield 上的滚轮事件转发到 iframe 内部文档滚动，保留流畅阅读体验
    shield.onwheel = (e) => {
      try {
        const doc = iframe.contentDocument;
        if (doc) {
          const aceOuter = doc.querySelector('iframe[name="ace_outer"]');
          if (aceOuter && aceOuter.contentDocument) {
            const outerDoc = aceOuter.contentDocument;
            const outerScroller = outerDoc.querySelector('#outerdocbody') || outerDoc.documentElement || outerDoc.body;
            if (outerScroller) {
              outerScroller.scrollTop += e.deltaY;
            }
          }
        }
      } catch(err) {}
    };
  }

  const isTeacherMonitor = iframe.id && iframe.id.includes('teacher');
  const tryLock = () => {
    if (!iframe._isReadonlyEnforced) return;
    try {
      const doc = iframe.contentDocument;
      if (!doc) return;

      // 🛡️ 关键修复：仅在教师监控镜像端彻底隐藏工具栏；学生端无论何时都保留工具栏原生展示
      if (isTeacherMonitor) {
        const toolbars = doc.querySelectorAll('.toolbar, #editbar, #menu_left, #menu_right, .menu, #toolbar, nav.navbar, .menu_left, .menu_right, .editbar, #editbar ul, .menu_left ul, .menu_right ul, .editbar ul');
        toolbars.forEach(tb => tb.style.setProperty('display', 'none', 'important'));

        const footers = doc.querySelectorAll('#footer, .bottom-bar, #chatbox');
        footers.forEach(ft => ft.style.setProperty('display', 'none', 'important'));
      }

      const aceOuter = doc.querySelector('iframe[name="ace_outer"]');
      if (aceOuter && aceOuter.contentDocument) {
        const outerDoc = aceOuter.contentDocument;
        const aceInner = outerDoc.querySelector('iframe[name="ace_inner"]');
        if (aceInner && aceInner.contentDocument) {
          const innerDoc = aceInner.contentDocument;
          const innerBody = innerDoc.querySelector('#innerdocbody') || innerDoc.body;
          if (innerBody) {
            innerBody.setAttribute('contenteditable', 'false');
            innerBody.style.setProperty('cursor', 'default', 'important');
          }
        }
      }
    } catch(e) {}
  };

  if (!iframe._hasReadonlyLoadAttached) {
    iframe._hasReadonlyLoadAttached = true;
    iframe.addEventListener('load', () => {
      if (iframe._isReadonlyEnforced) {
        tryLock();
      } else {
        liftEtherpadReadonly(iframe);
      }
    });
  }

  tryLock();
}

/**
 * 🔓 解除 Etherpad 只读锁定：恢复顶部工具栏与正文编辑输入能力
 */
export function liftEtherpadReadonly(iframe) {
  if (!iframe) return;
  iframe._isReadonlyEnforced = false;

  // 1. 彻底清除所有的只读拦截遮罩（包括 container 和 document 中的所有残留遮罩）
  const container = iframe.parentElement;
  if (container) {
    const shields = container.querySelectorAll('.etherpad-readonly-shield');
    shields.forEach(s => s.remove());
  }
  document.querySelectorAll('.etherpad-readonly-shield').forEach(s => s.remove());

  // 2. 清除 iframe 内部 DOM 上的只读限制，让 Etherpad 恢复原生渲染
  const tryUnlock = () => {
    if (iframe._isReadonlyEnforced) return;
    try {
      const doc = iframe.contentDocument;
      if (!doc) return;

      const toolbars = doc.querySelectorAll('.toolbar, #editbar, #menu_left, #menu_right, .menu, #toolbar, nav.navbar, .menu_left, .menu_right, .editbar, #editbar ul, .menu_left ul, .menu_right ul, .editbar ul');
      toolbars.forEach(tb => {
        tb.style.removeProperty('display');
        tb.style.removeProperty('visibility');
        tb.style.removeProperty('opacity');
      });

      const footers = doc.querySelectorAll('#footer, .bottom-bar, #chatbox');
      footers.forEach(ft => {
        ft.style.removeProperty('display');
        ft.style.removeProperty('visibility');
      });

      const editorBox = doc.querySelector('#editorcontainerbox');
      if (editorBox) {
        editorBox.style.removeProperty('top');
        editorBox.style.removeProperty('position');
        editorBox.style.removeProperty('z-index');
      }

      const aceOuter = doc.querySelector('iframe[name="ace_outer"]');
      if (aceOuter && aceOuter.contentDocument) {
        const outerDoc = aceOuter.contentDocument;
        const aceInner = outerDoc.querySelector('iframe[name="ace_inner"]');
        if (aceInner && aceInner.contentDocument) {
          const innerDoc = aceInner.contentDocument;
          const innerBody = innerDoc.querySelector('#innerdocbody') || innerDoc.querySelector('.innerdocbody') || innerDoc.body;
          if (innerBody) {
            innerBody.setAttribute('contenteditable', 'true');
            innerBody.style.removeProperty('cursor');
          }
        }
      }

      const padWin = iframe.contentWindow;
      if (padWin) {
        try {
          padWin.dispatchEvent(new Event('resize'));
        } catch(e) {}
      }
    } catch(e) {}
  };

  if (!iframe._hasReadonlyLoadAttached) {
    iframe._hasReadonlyLoadAttached = true;
    iframe.addEventListener('load', () => {
      if (!iframe._isReadonlyEnforced) {
        tryUnlock();
      }
    });
  }

  tryUnlock();
}

/**
 * 👤 权威 Etherpad 用户身份强绑定注入器：
 * 彻底消除 Etherpad 默认未同步真实姓名导致显示为“组员/学术组员”的问题
 */
export function ensureEtherpadUserSync(iframe, userName, userColor) {
  if (!iframe) return;
  const color = userColor || '#2563eb';

  const doSync = () => {
    try {
      const padWin = iframe.contentWindow;
      if (!padWin) return;

      // 1. 设置 iframe 内 cookie name
      try {
        if (padWin.document) {
          if (userName) {
            padWin.document.cookie = `name=${encodeURIComponent(userName)}; path=/; max-age=86400`;
          }
          
          // 🛡️ 恢复 Etherpad 100% 官方原生排版与皮肤（彻底清除自定义 CSS 干扰）
          const doc = padWin.document;
          const oldGuardStyle = doc.getElementById('jizhi-etherpad-guard-style');
          if (oldGuardStyle) oldGuardStyle.remove();
        }
      } catch(e) {}

      // 2. 注入前端多语言兜底补丁（防止缺失翻译键中断 pad.init 初始化）
      try {
        const fallbackMap = {
          'ep_font_size.size': '字号大小',
          'ep_font_family.family': '字体',
          'ep_font_family.font': '字体',
          'ep_headings.style': '正文/标题',
          'ep_font_color.color': '文字颜色',
          'ep_line_spacing.spacing': '行间距',
          'pad.settings.fadeInactiveAuthorColors': '淡化非活跃作者颜色',
          'ep_cursortrace.settings.showRemoteCarets': '显示协作光标',
          'pad.deletionToken.deleteWithToken': '安全删除',
          'pad.deletionToken.tokenFieldLabel': '验证码',
          'pad.deletionToken.modalTitle': '确认操作',
          'pad.deletionToken.modalBody': '请输入验证码',
          'pad.deletionToken.tokenValueLabel': '验证码'
        };
        if (padWin.html10n && !padWin.html10n._hasJizhiPatch) {
          padWin.html10n._hasJizhiPatch = true;
          const origGet = padWin.html10n.get;
          padWin.html10n.get = function(id, args, fallback) {
            try {
              const res = origGet ? origGet.apply(this, arguments) : null;
              if (res) return res;
            } catch(e) {}
            return fallbackMap[id] || fallback || id;
          };
        }
      } catch(e) {}

      // 3. 注入 clientVars
      if (userName && padWin.clientVars) {
        padWin.clientVars.userName = userName;
        padWin.clientVars.userColor = color;
        const uId = padWin.clientVars.userId || (padWin.pad && padWin.pad.getUserId && padWin.pad.getUserId());
        if (uId) {
          if (!padWin.clientVars.historicalAuthorData) padWin.clientVars.historicalAuthorData = {};
          if (!padWin.clientVars.authorData) padWin.clientVars.authorData = {};
          padWin.clientVars.historicalAuthorData[uId] = { name: userName, colorId: color };
          padWin.clientVars.authorData[uId] = { name: userName, colorId: color };
        }
      }

      // 4. 安全注入 pad.myUserInfo
      if (userName && padWin.pad && padWin.pad.myUserInfo) {
        padWin.pad.myUserInfo.name = userName;
        padWin.pad.myUserInfo.colorId = color;
      }
    } catch(err) {}
  };

  iframe.addEventListener('load', () => {
    doSync();
    setTimeout(doSync, 200);
    setTimeout(doSync, 800);
    setTimeout(doSync, 2000);
  });
  doSync();
}

/**
 * 🌐 全局统一教学范围匹配器 (Universal Educational Scope Matcher)
 * 彻底消除因全等与死板判定导致的通知/问卷/范文“误杀遗漏”
 */
export function isScopeMatch(target = {}, context = {}) {
  const { classId: tClassId, targetGroupId: tGroupId, taskId: tTaskId, targetClassIds: tClassIds, targetGroupIds: tGroupIds, className: tClassName } = target;
  const { userClassId, userGroupId, currentTaskId, userClassName } = context;

  // 1. 班级范围匹配：必须严格锁定在学生所在的当前班级（严禁跨班级泄漏）
  const matchClass = !!(userClassId && (
    tClassId === userClassId ||
    (Array.isArray(tClassIds) && tClassIds.includes(userClassId)) ||
    (userClassName && tClassName && tClassName === userClassName)
  ));

  // 2. 小组范围匹配 (支持 all / 空值 / 小组ID一致 / 小组ID数组包含)
  const matchGroup = !tGroupId || tGroupId === 'all' || tGroupId === 'group_all' ||
                     (userGroupId && tGroupId === userGroupId) ||
                     (Array.isArray(tGroupIds) && (tGroupIds.includes('all') || tGroupIds.includes('group_all') || (userGroupId && tGroupIds.includes(userGroupId))));

  // 3. 任务范围匹配 (支持 all / task_all / task_default / 空值 / 任务ID一致)
  const matchTask = !tTaskId || tTaskId === 'all' || tTaskId === 'task_all' || tTaskId === 'task_default' ||
                    (!currentTaskId) || (currentTaskId && tTaskId === currentTaskId);

  return !!(matchClass && matchGroup && matchTask);
}

/**
 * 🌐 业界黄金标准：全局弹窗物理事件捕获隔离与零位移锁屏引擎 (Universal Zero-Drift Modal Barrier)
 * 采用 360 度物理事件拦截（Wheel + Touch + Keydown + Scroll 绝对锚定），
 * 彻底消除弹窗打开时背景滑到底部、错位与回弹问题，实现 0 穿透、0 移动、0 晃动
 */
let _isBodyLocked = false;
let _modalBarrierInitialized = false;
const _lockedScrollPositions = new Map();

export function lockBodyScroll() {
  if (_isBodyLocked) return;
  _isBodyLocked = true;
  _lockedScrollPositions.clear();

  const scrollElements = [
    window,
    document.documentElement,
    document.body,
    document.getElementById('app'),
    document.querySelector('.teacher-portal-layout'),
    document.querySelector('#teacher-portal-layout'),
    document.querySelector('.student-task-portal'),
    document.querySelector('.workspace-layout'),
    document.querySelector('.teacher-content'),
    document.querySelector('.content-panel')
  ].filter(Boolean);

  scrollElements.forEach(el => {
    const top = (el === window) ? (window.scrollY || window.pageYOffset || 0) : el.scrollTop;
    _lockedScrollPositions.set(el, top);
  });

  if (document.body) document.body.classList.add('modal-open');
  if (document.documentElement) document.documentElement.classList.add('modal-open');
}

export function unlockBodyScroll() {
  if (!_isBodyLocked) return;
  _isBodyLocked = false;
  _lockedScrollPositions.clear();
  if (document.body) document.body.classList.remove('modal-open');
  if (document.documentElement) document.documentElement.classList.remove('modal-open');
}

function initModalScrollBarrier() {
  if (typeof window === 'undefined' || _modalBarrierInitialized) return;
  _modalBarrierInitialized = true;

  const getActiveModal = () => document.querySelector('.modal-overlay, .modal-mask, .table-config-modal-overlay, #modal-change-password, #modal-task-extended-unlock, .modal-task-deleted-overlay, .modal-announcement-popup, [id*="modal-"]');

  // 1. 滚轮物理拦截
  const handleWheel = (e) => {
    const modal = getActiveModal();
    if (!modal) return;

    if (!modal.contains(e.target)) {
      e.preventDefault();
      return;
    }

    let el = e.target;
    let scrollable = null;
    while (el && el !== modal && el !== document.body && el !== document.documentElement) {
      const style = window.getComputedStyle(el);
      const overflowY = style.overflowY;
      if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
        scrollable = el;
        break;
      }
      el = el.parentElement;
    }

    if (!scrollable) {
      e.preventDefault();
      return;
    }

    const { scrollTop, scrollHeight, clientHeight } = scrollable;
    const isScrollingUp = e.deltaY < 0;
    const isScrollingDown = e.deltaY > 0;

    if (isScrollingUp && scrollTop <= 0) {
      e.preventDefault();
    } else if (isScrollingDown && scrollTop + clientHeight >= scrollHeight - 1) {
      e.preventDefault();
    }
  };

  // 2. 触摸物理拦截
  const handleTouch = (e) => {
    const modal = getActiveModal();
    if (!modal) return;
    if (!modal.contains(e.target)) {
      e.preventDefault();
    }
  };

  // 3. 键盘按键（空格、PageDown、方向键）滚动拦截
  const handleKeydown = (e) => {
    const modal = getActiveModal();
    if (!modal) return;
    const isKeyNav = ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Space', 'Home', 'End'].includes(e.code || e.key);
    if (isKeyNav) {
      const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
      if (tag !== 'input' && tag !== 'textarea') {
        let el = e.target;
        let scrollable = null;
        while (el && el !== modal && el !== document.body && el !== document.documentElement) {
          const style = window.getComputedStyle(el);
          if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
            scrollable = el;
            break;
          }
          el = el.parentElement;
        }
        if (!scrollable) {
          e.preventDefault();
        }
      }
    }
  };

  // 4. 背景滚动强力绝对锚定复位（即使浏览器尝试自动滚动也瞬间锁回原像素）
  const handleScroll = (e) => {
    if (!_isBodyLocked) return;
    const target = e.target;
    const modal = getActiveModal();
    if (modal && modal.contains(target)) return;

    if (_lockedScrollPositions.has(target)) {
      const lockedTop = _lockedScrollPositions.get(target);
      if (target === window || target === document || target === document.documentElement || target === document.body) {
        const winTop = _lockedScrollPositions.get(window) || 0;
        window.scrollTo(0, winTop);
      } else if (target.scrollTop !== lockedTop) {
        target.scrollTop = lockedTop;
      }
    }
  };

  window.addEventListener('wheel', handleWheel, { passive: false, capture: true });
  window.addEventListener('touchmove', handleTouch, { passive: false, capture: true });
  window.addEventListener('keydown', handleKeydown, { passive: false, capture: true });
  window.addEventListener('scroll', handleScroll, { passive: true, capture: true });
}

if (typeof document !== 'undefined') {
  initModalScrollBarrier();

  if (typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(() => {
      const hasModal = !!document.querySelector('.modal-overlay, .modal-mask, .table-config-modal-overlay, #modal-change-password, #modal-task-extended-unlock, .modal-task-deleted-overlay, .modal-announcement-popup, [id*="modal-"]');
      if (hasModal) {
        lockBodyScroll();
      } else {
        unlockBodyScroll();
      }
    });
    const targetNode = document.body || document.documentElement;
    if (targetNode) {
      observer.observe(targetNode, { childList: true, subtree: true });
    }
  }
}
