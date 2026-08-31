/**
 * JIZHI (集智) Multi-Agent Collaborative Writing Platform
 * Version: 20260831_v1024
 * Modern ES Module Distribution Bundle
 * (Compiled from src/*.js via build.py)
 */

(function() {

  /* ==========================================================================
     MODULE: constants.js
     ========================================================================== */
  /**
   * JIZHI (集智) Platform - Constants & Initial State
   * Standard ES Module (ESM)
   * Version: 2.1.0 (2026-08-23)
   */

  const APP_VERSION = '20260831_v1024';
  const APP_BUILD_DATE = '2026-08-26';

  const STORAGE_KEY_USER = 'jizhi_pure_v10_user';
  const STORAGE_KEY_USERS_DB = 'jizhi_pure_v10_users_db';
  const STORAGE_KEY_CLASSES = 'jizhi_pure_v10_classes_db';
  const STORAGE_KEY_TASKS = 'jizhi_pure_v10_tasks_db';
  const STORAGE_KEY_ANNOUNCEMENTS = 'jizhi_pure_v10_ann_db';

  const DefaultClasses = [];

  // 🧹 唯一种子：教师端管理账号（1001/老师）。测试学生一律不写入，教师可在教务界面自行增删学生
  const DefaultUsers = [
    { id: '1001', username: '1001', studentCode: '1001', password: '123', name: '老师', role: 'teacher', avatar: '👩‍🏫' }
  ];

  const DefaultTasks = [];
  const DefaultAnnouncements = [];
  const DefaultReferencePapers = [];

  const AgentProfiles = {
    auctioneer: { id: 'auctioneer', name: '拍卖师 Agent', roleTitle: '头脑风暴 · 学术拍卖师', avatar: '🎪', color: '#8b5cf6', stage: 'stage1', cozeBotId: '7673571806476828713' },
    managingEditor: { id: 'managingEditor', name: '责任编辑 Agent', roleTitle: '责任编辑 · 过程学伴', avatar: '🤝', color: '#10b981', stage: 'stage2', cozeBotId: '7673934462736138294' },
    reviewingEditor: { id: 'reviewingEditor', name: '审稿编辑 Agent', roleTitle: '审稿编辑 · 质量把关', avatar: '📝', color: '#3b82f6', stage: 'stage2', cozeBotId: '7673943522542141476' },
    proponent: { id: 'proponent', name: '正方委员 Agent', roleTitle: '答辩委员会 · 肯定支持者', avatar: '🟢', color: '#22c55e', stage: 'stage3', cozeBotId: '7673951703640899627' },
    opponent: { id: 'opponent', name: '反方委员 Agent', roleTitle: '答辩委员会 · 尖锐质疑者', avatar: '🔴', color: '#ef4444', stage: 'stage3', cozeBotId: '7673956980344160307' },
    neutral: { id: 'neutral', name: '中间委员 Agent', roleTitle: '答辩委员会 · 裁决引导者', avatar: '🟡', color: '#eab308', stage: 'stage3', cozeBotId: '7673955430510870580' }
  };

  const PresetMessages = {
    stage1: [],
    stage2: [],
    stage3: []
  };

  const InitialState = {
    currentStage: 'stage1',
    groupMaxStage: 'stage1',
    currentUser: null,
    isFinalSubmitted: false,
    studentViewMode: 'task_list', // 默认强制进入任务大厅，点击后再进入协作工作台
    activeTaskId: null,
    timer: {
      elapsedSeconds: 0,
      speed: 1,
      isRunning: true,
      startTimestamp: null
    },
    teacherActiveTab: 'view_architecture', // 'view_architecture', 'view_publishing', 'view_monitoring'
    activeClassId: null,
    activeMonitorGroupId: null,
    members: {},

    stage1: {
      mergedTitle: '',
      votes: {},
      hasVoted: {},
      proposals: [],
      contract: {
        isConfirmed: false,
        confirmedMembers: {},
        timeAllocations: {
          background: 25,
          literature: 30,
          questions: 25,
          method: 40,
          reflection: 20,
          references: 10
        },
        taskAssignments: {}
      }
    },

    stage2: {
      unifiedContent: '',
      memberContributions: {},
      isDraftConfirmed: false,
      confirmedMembers: {},
      actionPlan: {
        isGenerated: false,
        items: []
      }
    },

    stage3: {
      activeTab: 'defense', // 'defense' or 'editor'
      feedbackItems: [],
      isRevisionConfirmed: false,
      confirmedMembers: {}
    },

    presence: {},

    chatLogs: {
      stage1: [],
      stage2: [],
      stage3: []
    }
  };

  /* ==========================================================================
     MODULE: utils.js
     ========================================================================== */
  /**
   * JIZHI (集智) Platform - Utility Functions
   * Standard ES Module (ESM)
   */

  /**
   * 👤 全维度用户标识提取器：提取一个用户对象的全部等价唯一标识（id, studentCode, username, name）
   */
  function getUserAllKeys(user) {
    if (!user) return [];
    if (typeof user === 'string') return [user.trim()];
    const keys = new Set();
    if (user.id) keys.add(String(user.id).trim());
    if (user.userId) keys.add(String(user.userId).trim());
    if (user.studentCode) keys.add(String(user.studentCode).trim());
    if (user.username) keys.add(String(user.username).trim());
    if (user.name) keys.add(String(user.name).trim());
    return Array.from(keys);
  }

  /**
   * 🔍 判断两个用户标识/对象是否为同一个人（任意标识命中即为同一人）
   */
  function isSameUser(userA, userB) {
    if (!userA || !userB) return false;
    const keysA = getUserAllKeys(userA);
    const keysB = getUserAllKeys(userB);
    return keysA.some(ka => keysB.some(kb => ka.toLowerCase() === kb.toLowerCase()));
  }

  /**
   * 🗺️ 从状态字典（如 votes, hasVoted, confirmedMembers, presence, readStatus）中查询某用户是否存在或已确认
   */
  function isUserInMap(map, user) {
    if (!map || typeof map !== 'object' || !user) return false;
    const keys = getUserAllKeys(user);
    return keys.some(k => Boolean(map[k]));
  }

  /**
   * 🗺️ 从状态字典中获取某用户的值
   */
  function getUserFromMap(map, user) {
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
  function formatDurationHuman(mins, compact = false) {
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
  function formatChatDisplayTime(timeVal) {
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
  function formatExportDateTime(timeVal) {
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
  function formatStandardDateDash(val) {
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
  function isTaskExpired(task) {
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
  function escapeHtml(str) {
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
  function sanitizeUrl(url) {
    if (!url || typeof url !== 'string') return '#';
    const clean = url.trim();
    if (/^(?:(?:https?|mailto|tel|data):|\/|\.\/|\.\.\/|#)/i.test(clean)) {
      return clean;
    }
    return '#';
  }

  async function downloadFileBlob(filename, textContent = null, fileUrl = null) {
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

  function getUniqueMembersList(membersMap) {
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

  function smartParseStudentRow(rowItems, colIndexMap = null) {
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

  function parseCSVText(text) {
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

  function parseXLSXOrCSVFile(file, callback) {
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

  function getCaretCharacterOffsetWithin(element) {
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

  function setCaretPositionWithin(element, offset) {
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
  /**
   * 🛡️ 聊天数据安全清洗与智能体开场白去重
   * 1. 消除智能体重复开场白
   * 2. 消除相同时间戳与文本的重复气泡
   * 3. 100% 保护真实组员发言与即时输入新消息，绝不误删
   */
  function filterAndDeduplicateChatLogs(messages) {
    if (!Array.isArray(messages)) return [];
    const result = [];
    const seenAgentOpenings = new Set();
    const seenMsgIds = new Set();

    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (!m || typeof m !== 'object') continue;
      const txt = String(m.text || '').trim();
      if (!txt) continue;

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
  function showGlobalBannerNotice(title, message, type = 'info', duration = 8000) {
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
  function showResolutionBlock(reason) {
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
  function showTaskExtendedUnlockModal(task, prevDeadline, isUnlockedNow = false) {
    if (typeof document === 'undefined') return;
    const existing = document.getElementById('modal-task-extended-unlock');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'modal-task-extended-unlock';
    modal.style.cssText = 'position:fixed; inset:0; z-index:9999999; background:rgba(15,23,42,0.68); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; animation:fadeIn 0.25s ease;';

    modal.innerHTML = `
      <div style="background:#ffffff; border-radius:16px; width:90%; max-width:440px; padding:28px 24px; box-shadow:0 20px 40px rgba(15,23,42,0.25); text-align:center; border:2px solid #3b82f6; display:flex; flex-direction:column; gap:16px; animation:scaleUp 0.25s ease; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; position:relative;">
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
  function enforceEtherpadReadonly(iframe) {
    if (!iframe) return;

    // 🛡️ 1. 仅保留视觉提示遮罩：pointer-events:none 确保鼠标滚轮与触控滑动 100% 穿透到 iframe，原生滚动完全不受干扰
    const container = iframe.parentElement;
    if (container) {
      let shield = container.querySelector('.etherpad-readonly-shield');
      if (!shield) {
        shield = document.createElement('div');
        shield.className = 'etherpad-readonly-shield';
        // pointer-events:none 是关键：遮罩只做视觉提示，一切鼠标/触控/滚轮事件完全穿透给 iframe
        shield.style.cssText = 'position:absolute; inset:0; z-index:25; background:transparent; cursor:not-allowed; pointer-events:none;';
        shield.title = '🔒 只读查阅模式 (已锁定禁止编辑)';
        container.style.position = 'relative';
        container.appendChild(shield);
      } else {
        // 兼容已存在的 shield：强制覆盖为 pointer-events:none，修复旧版遮罩阻塞滚动的问题
        shield.style.pointerEvents = 'none';
      }
    }

    const tryLock = () => {
      try {
        // 仅在同源可访问时做单次静态防护，跨域时直接静默跳过，绝不高频捕获异常
        const doc = iframe.contentDocument;
        if (!doc) return;

        const toolbar = doc.querySelector('.toolbar') || doc.querySelector('#editbar') || doc.querySelector('#menu_left') || doc.querySelector('#menu_right');
        if (toolbar) toolbar.style.setProperty('display', 'none', 'important');

        const footer = doc.querySelector('#footer') || doc.querySelector('.bottom-bar') || doc.querySelector('#chatbox');
        if (footer) footer.style.setProperty('display', 'none', 'important');

        const aceOuter = doc.querySelector('iframe[name="ace_outer"]');
        if (aceOuter) {
          const outerDoc = aceOuter.contentDocument;
          if (outerDoc) {
            const aceInner = outerDoc.querySelector('iframe[name="ace_inner"]');
            if (aceInner) {
              const innerDoc = aceInner.contentDocument;
              if (innerDoc) {
                const innerBody = innerDoc.querySelector('#innerdocbody') || innerDoc.body;
                if (innerBody) {
                  innerBody.setAttribute('contenteditable', 'false');
                  innerBody.style.setProperty('cursor', 'not-allowed', 'important');
                }
              }
            }
          }
        }
      } catch(e) {
        // 官方只读 ID (r.xxxx) 已由 Etherpad 服务端完全锁死编辑，跨域时安全静默跳过
      }
    };

    iframe.addEventListener('load', tryLock, { once: true });
    tryLock();
  }

  /**
   * 🌐 全局统一教学范围匹配器 (Universal Educational Scope Matcher)
   * 彻底消除因全等与死板判定导致的通知/问卷/范文“误杀遗漏”
   */
  function isScopeMatch(target = {}, context = {}) {
    const { classId: tClassId, targetGroupId: tGroupId, taskId: tTaskId, targetClassIds: tClassIds, targetGroupIds: tGroupIds, className: tClassName } = target;
    const { userClassId, userGroupId, currentTaskId, userClassName } = context;

    // 1. 班级范围匹配 (支持 all / 空值 / 班级ID一致 / 班级名称一致 / 班级ID数组包含)
    const matchClass = !tClassId || tClassId === 'all' || tClassId === 'class_all' ||
                       (userClassId && tClassId === userClassId) ||
                       (userClassName && tClassName && tClassName === userClassName) ||
                       (Array.isArray(tClassIds) && (tClassIds.includes('all') || tClassIds.includes('class_all') || (userClassId && tClassIds.includes(userClassId))));

    // 2. 小组范围匹配 (支持 all / 空值 / 小组ID一致 / 小组ID数组包含)
    const matchGroup = !tGroupId || tGroupId === 'all' || tGroupId === 'group_all' ||
                       (userGroupId && tGroupId === userGroupId) ||
                       (Array.isArray(tGroupIds) && (tGroupIds.includes('all') || tGroupIds.includes('group_all') || (userGroupId && tGroupIds.includes(userGroupId))));

    // 3. 任务范围匹配 (支持 all / task_all / task_default / 空值 / 任务ID一致)
    const matchTask = !tTaskId || tTaskId === 'all' || tTaskId === 'task_all' || tTaskId === 'task_default' ||
                      (!currentTaskId) || (currentTaskId && tTaskId === currentTaskId);

    return !!(matchClass && matchGroup && matchTask);
  }

  /* ==========================================================================
     MODULE: agents.js
     ========================================================================== */
  /**
   * JIZHI (集智) Platform - Agent Service & Coze Client
   * Standard ES Module (ESM)
   */


  async function callCozeAgentAPI(botKey, userQuery, currentContext = {}) {
    const profile = AgentProfiles[botKey] || { name: '智能体专家', avatar: '🤖' };
    const botId = profile && profile.cozeBotId ? profile.cozeBotId : '7673571806476828713';

    // ⚡ 直接透传结构化指令，避免与服务端 PromptFactory 二次套娃
    let enrichedQuery = userQuery;

    // 🛡️ 会话凭证：从当前登录态读取 userId + session token，供服务端鉴权扣子代理
    let sessionUserId = currentContext.userId || '';
    let sessionToken = '';
    try {
      const rawUser = sessionStorage.getItem(STORAGE_KEY_USER);
      if (rawUser) {
        const u = JSON.parse(rawUser);
        sessionUserId = sessionUserId || u.id || u.username || u.studentCode || 'student_user';
        sessionToken = u.activeSessionId || u.token || '';
      }
    } catch (e) {}

    // 🛡️ 高可用调度核心：最多自动重试 3 次，化解偶发网络丢包与服务端瞬态抖动
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const resp = await fetch('sync.php?action=coze_chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bot_key: botKey,
            bot_id: botId,
            user_id: sessionUserId || 'student_user',
            userId: sessionUserId,
            token: sessionToken,
            query: enrichedQuery,
            stage: currentContext.stage || '',
            topic: currentContext.topic || '',
            actual_doc: currentContext.actualDoc || ''
          })
        });

        if (resp.ok) {
          const data = await resp.json();
          if (data && data.success && data.reply && data.reply.trim().length > 0) {
            return data.reply.trim();
          }
          // 如果后端处于生成中，采用阶梯式敏捷轮询：前 20 次 100ms 极速响应，后续 300ms 紧密等待
          if (data && data.in_progress && data.chat_id && data.conversation_id) {
            const chatId = data.chat_id;
            const convId = data.conversation_id;
            const targetBotId = data.bot_id || botId;
            const maxRetries = 60;
            for (let p = 0; p < maxRetries; p++) {
              const pollInterval = p < 20 ? 100 : 300;
              await new Promise(r => setTimeout(r, pollInterval));
              try {
                const pollRes = await fetch(`sync.php?action=coze_poll&chat_id=${encodeURIComponent(chatId)}&conversation_id=${encodeURIComponent(convId)}&bot_id=${encodeURIComponent(targetBotId)}&userId=${encodeURIComponent(sessionUserId)}&token=${encodeURIComponent(sessionToken)}&nocache=${Date.now()}`);
                if (pollRes.ok) {
                  const pollData = await pollRes.json();
                  if (pollData && pollData.completed) {
                    if (pollData.reply && pollData.reply.trim().length > 0) {
                      return pollData.reply.trim();
                    }
                    break;
                  }
                }
              } catch (err) {
                console.warn('[Coze Poll] 轮询偶发抖动 (可自愈):', err.message);
              }
            }
          }
        }
      } catch (e) {
        console.warn(`[Coze API] 第 ${attempt}/${maxAttempts} 次请求偶发异常:`, e.message);
      }

      // 若当前重试未成功且还有剩余次数，做指数退避等待后自动进行下一次重试 (600ms, 1200ms)
      if (attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, attempt * 600));
      }
    }

    return null;
  }

  /* ==========================================================================
     MODULE: auth.js
     ========================================================================== */
  /**
   * JIZHI (集智) Platform - Authentication & Database Manager
   * Standard ES Module (ESM)
   */


  class AuthManager {
    constructor() {
      this._pruneStorageQuota();
      this.initDatabase();
      this.sanitizeAndDeduplicateGroups();
      this.removeLegacyTestAccounts();
    }
    initDatabase() {
      if (!localStorage.getItem(STORAGE_KEY_USERS_DB)) localStorage.setItem(STORAGE_KEY_USERS_DB, JSON.stringify(DefaultUsers));
      if (!localStorage.getItem(STORAGE_KEY_CLASSES)) localStorage.setItem(STORAGE_KEY_CLASSES, JSON.stringify(DefaultClasses));
      if (!localStorage.getItem(STORAGE_KEY_TASKS)) localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(DefaultTasks));
      if (!localStorage.getItem(STORAGE_KEY_ANNOUNCEMENTS)) localStorage.setItem(STORAGE_KEY_ANNOUNCEMENTS, JSON.stringify(DefaultAnnouncements));
      if (!localStorage.getItem('jizhi_reference_papers_db')) localStorage.setItem('jizhi_reference_papers_db', JSON.stringify(DefaultReferencePapers));
    }

    // 🛡️ 全局小组数据自动清洗与自愈引擎 (班级之间 100% 独立，彻底清除幽灵空组与重复小组)
    sanitizeAndDeduplicateGroups() {
      try {
        const classes = this.getClasses();
        const users = this.getUsers();
        let isModified = false;

        const getMemberId = (m) => (typeof m === 'object' && m !== null) ? (m.id || m.userId || m.studentCode) : m;

        classes.forEach(cls => {
          if (!cls.groups) { cls.groups = []; isModified = true; }

          cls.groups.forEach((grp, gIdx) => {
            if (!grp.id) { grp.id = `group_${cls.id || 'class'}_${gIdx + 1}`; isModified = true; }
            if (!grp.name) { grp.name = `第 ${gIdx + 1} 协作小组`; isModified = true; }
            if (!Array.isArray(grp.members)) { grp.members = []; isModified = true; }
          });
        });

        if (isModified) {
          localStorage.setItem(STORAGE_KEY_CLASSES, JSON.stringify(classes));
        }
      } catch (e) {}
    }

    // 🧹 一次性迁移：彻底清除历史遗留的测试学生种子账号及其自动成组（李明/王芳/陈强），杜绝删除后刷新死灰复燃
    removeLegacyTestAccounts() {
      try {
        const LEGACY_IDS = new Set(['u_studentA', 'u_studentB', 'u_studentC']);
        const LEGACY_CODES = new Set(['202601', '202602', '202603']);
        const LEGACY_NAMES = new Set(['李明', '王芳', '陈强', '李明 (组长)', '王芳 (组员)', '陈强 (组员)']);

        let users = [];
        try { users = JSON.parse(localStorage.getItem(STORAGE_KEY_USERS_DB)) || []; } catch (e) { users = []; }
        if (!Array.isArray(users)) users = [];

        const removedKeys = new Set();
        const filteredUsers = [];
        let usersChanged = false;
        users.forEach(u => {
          const isLegacy = u && (
            LEGACY_IDS.has(u.id) ||
            LEGACY_CODES.has(u.username) ||
            LEGACY_CODES.has(u.studentCode) ||
            LEGACY_NAMES.has(u.name)
          );
          if (isLegacy) {
            if (u.id) removedKeys.add(u.id);
            if (u.username) removedKeys.add(u.username);
            if (u.studentCode) removedKeys.add(u.studentCode);
            usersChanged = true;
          } else {
            filteredUsers.push(u);
          }
        });

        if (usersChanged) {
          localStorage.setItem(STORAGE_KEY_USERS_DB, JSON.stringify(filteredUsers));
        }

        // 同步清理班级学生清单与小组自动成组成员，避免幽灵成员残留
        let classes = [];
        try { classes = JSON.parse(localStorage.getItem(STORAGE_KEY_CLASSES)) || []; } catch (e) { classes = []; }
        if (!Array.isArray(classes)) classes = [];
        let classesChanged = false;

        classes.forEach(cls => {
          if (cls.studentIds && Array.isArray(cls.studentIds)) {
            const before = cls.studentIds.length;
            cls.studentIds = cls.studentIds.filter(id => !removedKeys.has(id));
            if (cls.studentIds.length !== before) classesChanged = true;
          }
          (cls.groups || []).forEach(g => {
            if (g.members && Array.isArray(g.members)) {
              const before = g.members.length;
              g.members = g.members.filter(m => {
                const mid = (typeof m === 'object' && m !== null) ? (m.id || m.userId || m.studentCode) : m;
                return !removedKeys.has(mid);
              });
              if (g.members.length !== before) classesChanged = true;
            }
          });
        });

        if (classesChanged) {
          localStorage.setItem(STORAGE_KEY_CLASSES, JSON.stringify(classes));
        }
      } catch (e) {}
    }

    findUserByKey(key) {
      if (!key) return null;
      if (typeof key === 'object') {
        if (key.name && (key.studentCode || key.id)) return key;
        key = key.id || key.studentCode || key.username || key.name || '';
      }
      const cleanKey = String(key).trim().toLowerCase();
      if (!cleanKey) return null;

      const users = this.getUsers();
      // 1. 在 users 列表中全字段精准比对
      let found = users.find(u => {
        if (!u) return false;
        const uid = String(u.id || '').trim().toLowerCase();
        const code = String(u.studentCode || '').trim().toLowerCase();
        const uname = String(u.username || '').trim().toLowerCase();
        const name = String(u.name || '').trim().toLowerCase();
        return uid === cleanKey || code === cleanKey || uname === cleanKey || name === cleanKey;
      });
      if (found) return found;

      // 2. 在 classes 名册中的 student 列表中查找
      const classes = this.getClasses();
      for (const cls of classes) {
        if (cls && Array.isArray(cls.students)) {
          found = cls.students.find(s => {
            if (!s) return false;
            const sid = String(s.id || '').trim().toLowerCase();
            const scode = String(s.studentCode || '').trim().toLowerCase();
            const sname = String(s.name || '').trim().toLowerCase();
            const suname = String(s.username || '').trim().toLowerCase();
            return sid === cleanKey || scode === cleanKey || sname === cleanKey || suname === cleanKey;
          });
          if (found) return found;
        }
      }
      return null;
    }

    async pullGlobalMeta() {
      if (this._isPullingMeta) return;
      // 🛡️ 教师推送在途时挂起本次拉取，避免用过期云端数据反向覆盖本地刚写入的新数据（导入学生/建组后被清空的根因）
      if (this._pushInFlight) {
        this._pendingPull = true;
        return;
      }
      this._isPullingMeta = true;
      try {
        const currUser = this.getCurrentUser();
        const isStudent = currUser && (currUser.role === 'student' || currUser.isStudent);
        const isTeacher = currUser && (currUser.role === 'teacher' || currUser.isTeacher);

        const clientVer = this.globalMetaVersion || 0;
        const res = await fetch(`sync.php?action=get_global_meta&ver=${clientVer}&nocache=${Date.now()}`);
        if (res.ok) {
          const data = await res.json();
          if (data) {
            this.isGlobalMetaLoaded = true;
            if (data.version !== undefined) {
              this.globalMetaVersion = parseInt(data.version, 10);
            }
            if (data.unchanged) {
              return; // ⚡ 极速早退：服务端版本未变，0 开销
            }
            // 1. 账号池：直接以云端权威数据库为准
            if (Array.isArray(data.users)) {
              localStorage.setItem(STORAGE_KEY_USERS_DB, JSON.stringify(data.users));
            }

            // 2. 班级与小组：直接以云端权威数据库为准 (杜绝已删除班级/学生死灰复燃)
            if (Array.isArray(data.classes)) {
              localStorage.setItem(STORAGE_KEY_CLASSES, JSON.stringify(data.classes));
              this.sanitizeAndDeduplicateGroups();
            }

            // 3. 写作任务：直接以云端权威数据库为准 (智能继承本地更新的延期截止时间)
            if (Array.isArray(data.tasks)) {
              const localTasks = this.getTasks();
              const mergedTasks = data.tasks.map(remoteT => {
                const localT = localTasks.find(lt => lt.id === remoteT.id || (lt.title && lt.title === remoteT.title));
                if (localT && localT.lastExtension) {
                  const localExtAt = localT.lastExtension.extendedAt || 0;
                  const remoteExtAt = remoteT.lastExtension ? (remoteT.lastExtension.extendedAt || 0) : 0;
                  if (localExtAt >= remoteExtAt) {
                    return { ...remoteT, deadline: localT.deadline, durationMinutes: localT.durationMinutes, lastExtension: localT.lastExtension };
                  }
                }
                return remoteT;
              });
              localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(mergedTasks));
            }

            // 4. 课堂通知：严格以云端权威列表为准，仅智能继承本地已读标记，绝不反向复活已删除通知！
            if (Array.isArray(data.announcements)) {
              const localAnns = JSON.parse(localStorage.getItem(STORAGE_KEY_ANNOUNCEMENTS) || '[]');
              const localMap = new Map();
              localAnns.forEach(a => { if (a && a.id) localMap.set(a.id, a); });

              const mergedAnns = data.announcements.map(remoteAnn => {
                const localAnn = localMap.get(remoteAnn.id);
                if (!localAnn) return remoteAnn;

                const mergedReadStatus = { ...(remoteAnn.readStatus || {}), ...(localAnn.readStatus || {}) };
                const mergedGroupStatus = { ...(remoteAnn.readGroupStatus || {}), ...(localAnn.readGroupStatus || {}) };

                const confMembersMap = new Map();
                (remoteAnn.confirmedMembers || []).forEach(m => {
                  if (m) {
                    const k = m.id || m.studentCode || m.name;
                    if (k) confMembersMap.set(k, m);
                  }
                });
                (localAnn.confirmedMembers || []).forEach(m => {
                  if (m) {
                    const k = m.id || m.studentCode || m.name;
                    if (k) confMembersMap.set(k, m);
                  }
                });

                return {
                  ...remoteAnn,
                  readStatus: mergedReadStatus,
                  readGroupStatus: mergedGroupStatus,
                  confirmedMembers: Array.from(confMembersMap.values())
                };
              });

              localStorage.setItem(STORAGE_KEY_ANNOUNCEMENTS, JSON.stringify(mergedAnns));

              // ⚡ 异步元数据到达瞬间：纯前端 DOM 局部更新通知红点与未读弹窗（0 网络请求，0 数据上传）
              if (window.app && typeof window.app.renderHeader === 'function' && window.app.state && window.app.state.studentViewMode === 'workspace') {
                window.app.renderHeader();
              }
              if (window.app && typeof window.app.checkUnreadAnnouncements === 'function' && window.app.state && window.app.state.studentViewMode === 'workspace') {
                window.app.checkUnreadAnnouncements();
              }
            }

            // 5. 学术文献与范文：直接以云端权威数据库为准
            if (Array.isArray(data.referencePapers)) {
              localStorage.setItem('jizhi_reference_papers_db', JSON.stringify(data.referencePapers));
            }

            // 6. 课程问卷配置：直接以云端权威数据库为准
            if (Array.isArray(data.surveys)) {
              localStorage.setItem('jizhi_surveys_list_db', JSON.stringify(data.surveys));
            }
          }
        }
      } catch (e) {} finally {
        this._isPullingMeta = false;
      }
    }
    getSurveysList() {
      let list = [];
      try {
        list = JSON.parse(localStorage.getItem('jizhi_surveys_list_db')) || [];
      } catch (e) { list = []; }
      return Array.isArray(list) ? list : [];
    }
    saveSurvey(classId, taskId, url, existingId = null) {
      if (!url || !url.trim()) return null;
      let list = this.getSurveysList();
      const classes = this.getClasses();
      const tasks = this.getTasks();
      const cObj = classes.find(c => c.id === classId);
      const tObj = tasks.find(t => t.id === taskId);
      const cleanUrl = url.trim();

      if (existingId) {
        const item = list.find(s => s.id === existingId);
        if (item) {
          item.classId = classId;
          item.className = cObj ? cObj.name : '全校班级';
          item.taskId = taskId;
          item.taskTitle = tObj ? tObj.title : (taskId === 'task_default' ? '默认期末写作' : '写作任务');
          item.url = cleanUrl;
          item.updatedAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
      } else {
        const newSurvey = {
          id: 'survey_' + Date.now(),
          classId: classId || null,
          className: cObj ? cObj.name : '《现代教育技术》2026春01班',
          taskId: taskId || null,
          taskTitle: tObj ? tObj.title : (taskId === 'task_default' ? '期末协作写作 (默认测试任务)' : '写作任务'),
          url: cleanUrl,
          createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        list.unshift(newSurvey);
      }
      localStorage.setItem('jizhi_surveys_list_db', JSON.stringify(list));
      this.pushGlobalMeta();

      if ('BroadcastChannel' in window) {
        try {
          const bc = new BroadcastChannel('jizhi_global_events');
          bc.postMessage({ type: 'survey_updated', classId, taskId, url: cleanUrl });
          bc.close();
        } catch (e) {}
      }
    }
    deleteSurvey(surveyId) {
      let list = this.getSurveysList();
      list = list.filter(s => s.id !== surveyId);
      localStorage.setItem('jizhi_surveys_list_db', JSON.stringify(list));
      this.pushGlobalMeta();

      if ('BroadcastChannel' in window) {
        try {
          const bc = new BroadcastChannel('jizhi_global_events');
          bc.postMessage({ type: 'survey_deleted', surveyId });
          bc.close();
        } catch (e) {}
      }
    }
    getSurveyUrl(classId, taskId) {
      const list = this.getSurveysList();
      if (!Array.isArray(list) || list.length === 0) return '';

      // 1. 最高优先级：精准匹配 班级 + 任务
      const exactMatch = list.find(s => {
        const matchCls = !s.classId || s.classId === 'all' || s.classId === classId;
        const matchTsk = s.taskId === taskId;
        return matchCls && matchTsk && s.url && s.url.startsWith('http');
      });
      if (exactMatch) return exactMatch.url;

      // 2. 第二优先级：匹配班级全局问卷 (taskId 为 all / task_all / task_default 或为空)
      const classGlobalMatch = list.find(s => {
        const matchCls = !s.classId || s.classId === 'all' || s.classId === classId;
        const matchTsk = !s.taskId || s.taskId === 'all' || s.taskId === 'task_all' || s.taskId === 'task_default';
        return matchCls && matchTsk && s.url && s.url.startsWith('http');
      });
      if (classGlobalMatch) return classGlobalMatch.url;

      // 3. 第三优先级：全校通用兜底问卷
      const universalMatch = list.find(s => s.url && s.url.startsWith('http'));
      return universalMatch ? universalMatch.url : '';
    }
    pushGlobalMeta() {
      const currUser = this.getCurrentUser();
      const isTeacher = currUser && (currUser.role === 'teacher' || currUser.isTeacher);

      // 🛡️ 铁律：只有已登录的教师且已完成云端元数据拉取后，才允许向服务器推送配置，杜绝冷启动默认数据覆盖云端
      if (!isTeacher || !this.isGlobalMetaLoaded) {
        return Promise.resolve();
      }

      const teacherUserId = (currUser && (currUser.studentCode || currUser.username || currUser.id)) || '';
      const teacherToken = currUser?.token || currUser?.activeSessionId || '';

      // ⚡ 极速轻量化打包：剥离 referencePapers 中的大 Base64 Blob（仅传元数据与物理 URL，数据包从几兆骤降至 2KB，秒级保存！）
      const cleanPapers = this.getAllReferencePapers().map(p => {
        const { fileData, ...metaOnly } = p;
        return metaOnly;
      });

      const payload = {
        userId: teacherUserId,
        token: teacherToken,
        expectedVersion: this.globalMetaVersion || 1,
        users: this.getUsers(),
        classes: this.getClasses(),
        tasks: this.getTasks(),
        announcements: this.getAnnouncements(),
        referencePapers: cleanPapers,
        surveys: this.getSurveysList()
      };

      // 🛡️ 推送在途标记：避免随后触发的 pullGlobalMeta 抢在推送落库前拉回过期数据，反向覆盖本地新写入的学生/班级
      this._pushInFlight = true;
      const safetyTimer = setTimeout(() => {
        if (this._pushInFlight) {
          this._pushInFlight = false;
          if (this._pendingPull) { this._pendingPull = false; this.pullGlobalMeta(); }
        }
      }, 12000);

      const pushPromise = new Promise((resolve) => {
        try {
          fetch(`sync.php?action=save_global_meta&userId=${encodeURIComponent(teacherUserId)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }).then(async (res) => {
            if (res.ok) {
              const data = await res.json().catch(() => ({}));
              if (data && data.version) {
                this.globalMetaVersion = parseInt(data.version, 10);
              }
            }
          }).catch(() => {}).finally(() => {
            clearTimeout(safetyTimer);
            this._pushInFlight = false;
            if (this._pendingPull) { this._pendingPull = false; this.pullGlobalMeta(); }
            resolve();
          });
        } catch (e) {
          clearTimeout(safetyTimer);
          this._pushInFlight = false;
          resolve();
        }
      });

      return pushPromise;
    }
    getUsers() {
      let users = [];
      try {
        users = JSON.parse(localStorage.getItem(STORAGE_KEY_USERS_DB)) || [];
      } catch (e) { users = []; }
      if (!Array.isArray(users) || users.length === 0) {
        users = JSON.parse(JSON.stringify(DefaultUsers));
        localStorage.setItem(STORAGE_KEY_USERS_DB, JSON.stringify(users));
      } else {
        const seenCodes = new Set();
        const uniqueUsers = [];
        let changed = false;

        users.forEach(u => {
          if (u.role === 'teacher') {
            // 🛡️ 仅在字段缺失时补默认值，不再强制覆盖已有教师名/工号（支持多教师）
            if (!u.name) { u.name = '老师'; changed = true; }
          }

          const codeKey = (u.studentCode || u.username || u.id).trim().toLowerCase();
          if (!seenCodes.has(codeKey)) {
            seenCodes.add(codeKey);
            uniqueUsers.push(u);
          } else {
            changed = true;
          }
        });

        users = uniqueUsers;
        if (changed) {
          localStorage.setItem(STORAGE_KEY_USERS_DB, JSON.stringify(users));
        }
      }
      return users;
    }
    getClasses() { return JSON.parse(localStorage.getItem(STORAGE_KEY_CLASSES)) || DefaultClasses; }
    getTasks() {
      let tasks = [];
      try {
        const stored = localStorage.getItem(STORAGE_KEY_TASKS);
        if (stored) tasks = JSON.parse(stored);
      } catch (e) { tasks = []; }
      if (!Array.isArray(tasks)) tasks = [];
      return tasks;
    }
    getAnnouncements() {
      let announcements = [];
      try {
        announcements = JSON.parse(localStorage.getItem(STORAGE_KEY_ANNOUNCEMENTS)) || DefaultAnnouncements;
        if (Array.isArray(announcements)) {
          let changed = false;
          announcements.forEach(a => {
            if (a && a.attachment && a.attachment.fileData) {
              delete a.attachment.fileData;
              changed = true;
            }
          });
          if (changed) {
            localStorage.setItem(STORAGE_KEY_ANNOUNCEMENTS, JSON.stringify(announcements));
          }
        }
      } catch (e) {
        announcements = DefaultAnnouncements;
      }
      return (Array.isArray(announcements) ? announcements : []).filter(a => 
        !a.isSystemAction && 
        !a.isExtension && 
        !a.title?.includes('任务延期通知') && 
        !a.title?.includes('时间已延长') && 
        !a.title?.includes('指导教师已重置') && 
        !a.title?.includes('指导教师已锁定')
      );
    }
    saveAnnouncements(list) {
      if (Array.isArray(list)) {
        try { localStorage.setItem(STORAGE_KEY_ANNOUNCEMENTS, JSON.stringify(list)); } catch (e) {}
      }
    }
    saveReferencePapers(list) {
      if (Array.isArray(list)) {
        try { localStorage.setItem('jizhi_reference_papers_db', JSON.stringify(list)); } catch (e) {}
      }
    }
    getCurrentUser() {
      let cached = null;
      const sessionData = sessionStorage.getItem(STORAGE_KEY_USER);
      if (sessionData) { try { cached = JSON.parse(sessionData); } catch (e) {} }
      if (!cached) {
        const localData = localStorage.getItem(STORAGE_KEY_USER);
        if (localData) { try { cached = JSON.parse(localData); } catch (e) {} }
      }
      if (!cached) return null;

      const allUsers = this.getUsers();
      const freshUser = allUsers.find(u => (cached.id && u.id === cached.id) || (cached.username && u.username === cached.username) || (cached.studentCode && u.studentCode === cached.studentCode));
      if (freshUser) {
        return { ...cached, ...freshUser, activeSessionId: cached.activeSessionId };
      }
      return cached;
    }
    async loginAsync(accountInput, password, role) {
      const query = (accountInput || '').trim();
      const pwd = (password || '').trim();
      const loginRole = (role || '').trim();

      if (!query) return { success: false, message: '❌ 请输入工号或学号' };
      if (!pwd) return { success: false, message: '❌ 请输入登录密码' };

      try {
        const response = await fetch('sync.php?action=login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ account: query, password: pwd, role: loginRole })
        });
        let data = null;
        try {
          data = await response.json();
        } catch (parseErr) {}

        if (response.ok && data && data.success && data.user) {
          const user = data.user;
          user.token = data.token;
          user.activeSessionId = data.token;
          sessionStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
          sessionStorage.setItem('jizhi_student_view_mode', 'task_list');
          localStorage.setItem('jizhi_student_view_mode', 'task_list');
          sessionStorage.removeItem('jizhi_active_task_id');
          localStorage.removeItem('jizhi_active_task_id');
          if (window.app && window.app.state) {
            window.app.state.studentViewMode = 'task_list';
            window.app.state.activeTaskId = null;
          }
          return { success: true, user };
        } else if (data && data.message) {
          // 🔐 精准展示服务端返回的真实校验结果（账号不存在/密码错误/身份不匹配）
          return { success: false, message: data.message, suggestedRole: data.suggestedRole || null };
        } else {
          const localRes = this.login(accountInput, password, role);
          if (localRes && localRes.success) return localRes;
          return { success: false, message: (localRes && localRes.message) ? localRes.message : '❌ 账号或密码错误，请核对后重试', suggestedRole: localRes?.suggestedRole || null };
        }
      } catch (err) {
        // 仅在完全无法连通时回退
        const localRes = this.login(accountInput, password, role);
        if (localRes && localRes.success) return localRes;
        return { success: false, message: (localRes && localRes.message) ? localRes.message : '⚠️ 无法连接服务器，请检查网络连接后重试', suggestedRole: localRes?.suggestedRole || null };
      }
    }

    login(accountInput, password, role) {
      const users = this.getUsers();
      const query = (accountInput || '').trim().toLowerCase();
      const pwd = (password || '').trim();
      const loginRole = (role || '').trim();

      if (!query) {
        return { success: false, message: '❌ 请输入工号或学号' };
      }
      if (!pwd) {
        return { success: false, message: '❌ 请输入登录密码' };
      }

      const userIndex = users.findIndex(u => {
        const uCode = (u.studentCode || '').toLowerCase();
        const uName = (u.username || '').toLowerCase();
        const uNick = (u.name || '').toLowerCase();
        const uEmail = (u.email || '').toLowerCase();

        const isDirectMatch = (uCode === query || uName === query || uEmail === query || uNick === query);

        return isDirectMatch;
      });

      if (userIndex === -1) {
        return { success: false, message: '❌ 未找到该学号/工号，请核对输入或联系指导教师' };
      }

      const user = users[userIndex];
      const isPwdValid = (pwd.length > 0) && ((user.password && user.password === pwd) || (!user.password && pwd === '123'));

      if (!isPwdValid) {
        return { success: false, message: '❌ 密码错误，请核对后重试（默认初始密码为 123）' };
      }

      // 🔐 多重认证：登录界面所选身份必须与账号实际角色一致，防止跨身份误登录
      const isTeacher = (user.role === 'teacher' || user.isTeacher);
      if (loginRole === 'teacher' && !isTeacher) {
        return { success: false, message: '❌ 身份选择错误：该账号为【学生】身份，已自动为您切换为学生，请重新点击登录', suggestedRole: 'student' };
      }
      if (loginRole === 'student' && isTeacher) {
        return { success: false, message: '❌ 身份选择错误：该账号为【教师】身份，已自动为您切换为教师，请重新点击登录', suggestedRole: 'teacher' };
      }

      // 🚀 一个账号同时只能一个人登录：生成唯一的 activeSessionId 并推送到服务端会话锁
      const newSessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
      user.activeSessionId = newSessionId;
      user.token = newSessionId;
      users[userIndex] = user;
      localStorage.setItem(STORAGE_KEY_USERS_DB, JSON.stringify(users));

      sessionStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
      localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));

      try {
        fetch('sync.php?action=session_login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id || user.username, token: newSessionId, password: pwd })
        }).catch(() => {});
      } catch (e) {}

      sessionStorage.setItem('jizhi_student_view_mode', 'task_list');
      localStorage.setItem('jizhi_student_view_mode', 'task_list');
      sessionStorage.removeItem('jizhi_active_task_id');
      localStorage.removeItem('jizhi_active_task_id');
      if (window.app && window.app.state) {
        window.app.state.studentViewMode = 'task_list';
        window.app.state.activeTaskId = null;
        if (window.app.cloudSyncEngine) window.app.cloudSyncEngine.pushSnapshot();
      }

      return { success: true, user };
    }
    logout() {
      const user = this.getCurrentUser();
      if (user) {
        try {
          const token = user.activeSessionId || '';
          fetch(`sync.php?action=session_logout&userId=${encodeURIComponent(user.id || user.username)}&token=${encodeURIComponent(token)}`).catch(() => {});
        } catch (e) {}
      }
      // 🛡️ 登出时同步停止云端短轮询，杜绝登出后轮询循环继续打服务器
      if (window.app && window.app.cloudSyncEngine && typeof window.app.cloudSyncEngine.stopPolling === 'function') {
        window.app.cloudSyncEngine.stopPolling();
      }
      sessionStorage.removeItem(STORAGE_KEY_USER);
      localStorage.removeItem(STORAGE_KEY_USER);
    }

    createClass(className, classCode = null) {
      const classes = this.getClasses();
      const cleanName = (className || '').trim() || '新教学班';
      if (classes.some(c => (c.name || '').trim().toLowerCase() === cleanName.toLowerCase())) {
        throw new Error(`已存在名为【${cleanName}】的教学班级，不能重复创建！`);
      }
      const newClass = {
        id: 'class_' + Date.now(),
        name: cleanName,
        code: classCode || ('MET-2026-' + (classes.length + 1).toString().padStart(2, '0')),
        studentIds: [],
        groups: []
      };
      classes.unshift(newClass);
      localStorage.setItem(STORAGE_KEY_CLASSES, JSON.stringify(classes));
      this.pushGlobalMeta();
      if (window.app && window.app.cloudSyncEngine) window.app.cloudSyncEngine.pushSnapshot();
      return newClass;
    }

    deleteClass(classId) {
      let classes = this.getClasses();
      if (classes.length <= 1) {
        throw new Error('系统至少需要保留一个教学班级，无法删除最后一个班级！');
      }
      classes = classes.filter(c => c.id !== classId);
      localStorage.setItem(STORAGE_KEY_CLASSES, JSON.stringify(classes));

      let tasks = this.getTasks();
      const taskIdsToDelete = tasks.filter(t => t.classId === classId).map(t => t.id);
      tasks = tasks.filter(t => t.classId !== classId);
      localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(tasks));

      let announcements = this.getAnnouncements();
      announcements = announcements.filter(a => a.classId !== classId && !taskIdsToDelete.includes(a.taskId));
      localStorage.setItem(STORAGE_KEY_ANNOUNCEMENTS, JSON.stringify(announcements));

      let papers = this.getAllReferencePapers();
      papers = papers.filter(p => p.classId !== classId && !taskIdsToDelete.includes(p.taskId));
      localStorage.setItem('jizhi_reference_papers_db', JSON.stringify(papers));

      this.pushGlobalMeta();
      if (window.app && window.app.cloudSyncEngine) window.app.cloudSyncEngine.pushSnapshot();
    }

    getClassStudents(classId) {
      const users = this.getUsers();
      return users.filter(u => u.role !== 'teacher' && (
        (u.classIds && Array.isArray(u.classIds) && u.classIds.includes(classId)) ||
        u.classId === classId
      ));
    }

    addStudentToClass(name, studentCode, classId, customPassword = null, isStrictUnique = true) {
      const users = this.getUsers();
      const classes = this.getClasses();
      const cleanCode = (studentCode || '').trim();
      const cleanUsername = cleanCode.toLowerCase();

      const existingUser = users.find(u =>
        u.role !== 'teacher' &&
        ((u.studentCode && u.studentCode.trim().toLowerCase() === cleanCode.toLowerCase()) ||
        (u.username && u.username.trim().toLowerCase() === cleanUsername))
      );

      const avatars = ['👨‍🎓', '👩‍🎓', '🧑‍🎓', '🎓', '📚', '🌟'];
      const avatar = avatars[users.length % avatars.length];

      if (existingUser) {
        if (!existingUser.classIds) existingUser.classIds = [existingUser.classId || null];
        if (classId && !existingUser.classIds.includes(classId)) existingUser.classIds.push(classId);
        if (classId) existingUser.classId = classId;

        const targetClass = classes.find(c => c.id === (classId || null)) || classes[0];
        if (targetClass && targetClass.studentIds && !targetClass.studentIds.includes(existingUser.id)) {
          targetClass.studentIds.push(existingUser.id);
          localStorage.setItem(STORAGE_KEY_CLASSES, JSON.stringify(classes));
        }
        localStorage.setItem(STORAGE_KEY_USERS_DB, JSON.stringify(users));
        this.pushGlobalMeta();
        return existingUser;
      }

      const targetUser = {
        id: cleanCode,
        username: cleanCode,
        studentCode: cleanCode,
        email: `${cleanUsername}@jizhi.edu`,
        password: (customPassword && customPassword.trim()) ? customPassword.trim() : '123',
        name: name.trim(),
        role: 'student',
        avatar: avatar,
        classId: classId || null,
        classIds: classId ? [classId] : ['class_101'],
        groupId: null
      };
      users.push(targetUser);

      localStorage.setItem(STORAGE_KEY_USERS_DB, JSON.stringify(users));

      const targetClass = classes.find(c => c.id === (classId || null)) || classes[0];
      if (targetClass) {
        if (!targetClass.studentIds) targetClass.studentIds = [];
        if (!targetClass.studentIds.includes(targetUser.id)) targetClass.studentIds.push(targetUser.id);
        localStorage.setItem(STORAGE_KEY_CLASSES, JSON.stringify(classes));
      }

      this.pushGlobalMeta();
      return targetUser;
    }

    batchAddStudentsToClass(studentList, classId) {
      let createdCount = 0;
      let linkedCount = 0;
      const linkedList = [];
      const users = this.getUsers();
      const classes = this.getClasses();
      const targetClass = classes.find(c => c.id === (classId || null)) || classes[0];
      if (!targetClass.studentIds) targetClass.studentIds = [];

      const avatars = ['👨‍🎓', '👩‍🎓', '🧑‍🎓', '🎓', '📚', '🌟'];

      studentList.forEach(st => {
        const code = (st.studentCode || st.username || '').trim();
        const name = (st.name || '').trim();
        if (!code || !name) return;

        const existing = users.find(u => (u.studentCode && u.studentCode.trim().toLowerCase() === code.toLowerCase()) || (u.username && u.username.trim().toLowerCase() === code.toLowerCase()));
        if (existing) {
          existing.id = code;
          existing.name = name;
          if (!existing.classIds || !Array.isArray(existing.classIds)) {
            existing.classIds = existing.classId ? [existing.classId] : ['class_101'];
          }
          if (!existing.classIds.includes(targetClass.id)) {
            existing.classIds.push(targetClass.id);
          }
          if (!targetClass.studentIds.includes(existing.id)) {
            targetClass.studentIds.push(existing.id);
          }
          linkedList.push({ name: existing.name || name, code });
          linkedCount++;
        } else {
          const newUser = {
            id: code,
            username: code,
            studentCode: code,
            email: `${code.toLowerCase()}@jizhi.edu`,
            password: (st.customPassword && st.customPassword.trim()) ? st.customPassword.trim() : '123',
            name: name,
            role: 'student',
            avatar: avatars[users.length % avatars.length],
            classId: targetClass.id,
            classIds: [targetClass.id],
            groupId: null
          };
          users.push(newUser);
          targetClass.studentIds.push(code);
          createdCount++;
        }
      });

      localStorage.setItem(STORAGE_KEY_USERS_DB, JSON.stringify(users));
      localStorage.setItem(STORAGE_KEY_CLASSES, JSON.stringify(classes));
      this.pushGlobalMeta();
      return { createdCount, linkedCount, totalProcessed: createdCount + linkedCount, linkedList };
    }

    createGroup(classId, groupName) {
      const classes = this.getClasses();
      const cls = classes.find(c => c.id === classId) || classes[0];
      if (cls) {
        if (!cls.groups) cls.groups = [];
        const newGroup = {
          id: 'group_' + Date.now(),
          name: groupName || `第 ${cls.groups.length + 1} 协作小组`,
          members: []
        };
        cls.groups.push(newGroup);
        localStorage.setItem(STORAGE_KEY_CLASSES, JSON.stringify(classes));
        this.pushGlobalMeta();
        return newGroup;
      }
    }

    getEffectiveStudentClassId(user, activeTaskId = null) {
      const classes = this.getClasses();
      if (!Array.isArray(classes) || classes.length === 0) return 'class_101';

      // 1. 若有指定任务，以该任务绑定的班级为最高准则
      if (activeTaskId) {
        const tasks = this.getTasks();
        const curTask = tasks.find(t => t.id === activeTaskId);
        if (curTask && curTask.classId && classes.some(c => c.id === curTask.classId)) {
          return curTask.classId;
        }
      }

      // 2. 若学生账号有明确的班级属性
      if (user) {
        if (user.classId && classes.some(c => c.id === user.classId)) return user.classId;
        if (Array.isArray(user.classIds) && user.classIds.length > 0) {
          const found = classes.find(c => user.classIds.includes(c.id));
          if (found) return found.id;
        }

        // 3. 全局扫描学生真正加入的小组所属班级
        const uId = user.id;
        const uCode = user.studentCode;
        const uUsername = user.username;
        const uName = user.name;
        for (const c of classes) {
          if (!Array.isArray(c.groups)) continue;
          for (const g of c.groups) {
            const hasMember = (g.members || []).some(m => {
              if (!m) return false;
              if (typeof m === 'string') return m === uId || m === uCode || m === uUsername || m === uName;
              if (typeof m === 'object') return (m.id && m.id === uId) || (m.studentCode && m.studentCode === uCode) || (m.username && m.username === uUsername) || (m.name && m.name === uName);
              return false;
            });
            if (hasMember) return c.id;
          }
        }
      }

      // 4. 回退到第一个真实班级
      return classes[0].id;
    }

    getStudentActiveGroup(user, classId = null) {
      if (!user) return { id: 'group_1', name: '第 1 协作小组' };
      const classes = this.getClasses();
      const uId = user.id;
      const uCode = user.studentCode;
      const uName = user.name;
      const uUsername = user.username;
      const safeUserKey = uCode || uId || uUsername || 'unassigned';

      const checkMemberMatch = (m) => {
        if (!m) return false;
        if (typeof m === 'string') {
          const sm = m.trim().toLowerCase();
          return (uId && sm === String(uId).trim().toLowerCase()) ||
                 (uCode && sm === String(uCode).trim().toLowerCase()) ||
                 (uUsername && sm === String(uUsername).trim().toLowerCase()) ||
                 (uName && m.trim() === String(uName).trim());
        }
        if (typeof m === 'object') {
          const mId = m.id || m.userId;
          const mCode = m.studentCode;
          const mUser = m.username;
          const mName = m.name;
          return (mId && uId && String(mId).trim().toLowerCase() === String(uId).trim().toLowerCase()) ||
                 (mCode && uCode && String(mCode).trim().toLowerCase() === String(uCode).trim().toLowerCase()) ||
                 (mUser && uUsername && String(mUser).trim().toLowerCase() === String(uUsername).trim().toLowerCase()) ||
                 (mName && uName && String(mName).trim() === String(uName).trim());
        }
        return false;
      };

      // 1. 若指定了班级 ID，优先在该班级内检索小组
      if (classId) {
        const targetClass = classes.find(c => c.id === classId);
        if (targetClass && Array.isArray(targetClass.groups)) {
          for (let i = 0; i < targetClass.groups.length; i++) {
            const g = targetClass.groups[i];
            if ((g.members || []).some(checkMemberMatch)) return g;
          }
        }
      }

      // 2. 智能全局容错检索：若指定班级未找到（或未指定班级），在学生关联的班级或全部班级中检索真实小组
      for (const c of classes) {
        if (!Array.isArray(c.groups)) continue;
        for (const g of c.groups) {
          if ((g.members || []).some(checkMemberMatch)) return g;
        }
      }

      if (user.groupId) {
        for (const c of classes) {
          const g = (c.groups || []).find(grp => grp.id === user.groupId);
          if (g) return g;
        }
      }

      // 3. 确实未被分配到任何具体小组
      return { id: `group_unassigned_${safeUserKey}`, name: '未分组（待教师分配）' };
    }

    // 🛡️ 智能且严谨的学生当前上下文解析器（班级/小组/成员/任务）。
    // 确保真实存在的班级（含默认班级如 class_101）与真实分配的小组（含 group_1）正常通行；仅在真正未登录或未分配小组时才阻断。
    resolveStudentActiveContext(user, { classId = null, taskId = null } = {}) {
      if (!user) {
        return { ok: false, reason: '当前会话未登录或已过期，请重新登录后再操作' };
      }

      // 1) 班级解析
      const classes = this.getClasses();
      if (!Array.isArray(classes) || classes.length === 0) {
        return { ok: false, reason: '当前没有可用教学班级，请联系教师创建班级后再进入' };
      }
      const effectiveClassId = classId || this.getEffectiveStudentClassId(user, taskId);
      const activeClass = classes.find(c => c.id === effectiveClassId) || classes[0];
      if (!activeClass) {
        return { ok: false, reason: '无法解析你所在的班级，请联系教师确认分班后刷新重试' };
      }

      // 2) 小组解析
      const group = this.getStudentActiveGroup(user, activeClass.id);
      if (!group || !group.id || group.id.startsWith('group_unassigned_')) {
        return { ok: false, reason: '你尚未被分配到协作小组，请联系教师分配后再进入正文写作' };
      }

      // 3) 任务解析
      let activeTask = null;
      const tasks = this.getTasks();
      if (taskId) {
        activeTask = tasks.find(t => t.id === taskId) || null;
      }
      if (!activeTask && tasks.length > 0) {
        activeTask = tasks[0];
      }

      // 4) 成员 = 当前登录用户本身
      return {
        ok: true,
        class: activeClass,
        group,
        member: user,
        task: activeTask,
        classId: activeClass.id,
        groupId: group.id,
        taskId: activeTask ? activeTask.id : null
      };
    }

    getAvailableStudentsForGroup(classId, editingGroupId = null) {
      const allClassStudents = this.getClassStudents(classId);
      const classes = this.getClasses();
      const cls = classes.find(c => c.id === classId) || classes[0];
      if (!cls || !cls.groups) return allClassStudents;

      const getMemberId = (m) => (typeof m === 'object' && m !== null) ? (m.id || m.userId || m.studentCode) : m;

      const occupiedStudentIds = new Set();
      cls.groups.forEach(g => {
        if (g.id !== editingGroupId) {
          (g.members || []).forEach(m => {
            const mId = getMemberId(m);
            if (mId) occupiedStudentIds.add(mId);
          });
        }
      });

      return allClassStudents.filter(s => !occupiedStudentIds.has(s.id) && !occupiedStudentIds.has(s.studentCode));
    }

    updateGroupMembers(classId, groupId, groupName, selectedUserIds = [], leaderUserId = null) {
      const classes = this.getClasses();
      const cls = classes.find(c => c.id === classId) || classes[0];
      if (!cls) return;

      const cleanGroupName = (groupName || '').trim() || '新协作小组';
      if (!cls.groups) cls.groups = [];

      const duplicateGroup = cls.groups.find(g => g.id !== groupId && (g.name || '').trim().toLowerCase() === cleanGroupName.toLowerCase());
      if (duplicateGroup) {
        throw new Error(`当前班级已存在名为【${cleanGroupName}】的小组，请换一个小组名称！`);
      }

      let group = cls.groups.find(g => g.id === groupId);
      if (!group) {
        group = { id: groupId || ('group_' + Date.now()), name: cleanGroupName, members: [] };
        cls.groups.push(group);
      } else {
        group.name = cleanGroupName;
      }

      const oldMembers = group.members || [];
      group.members = selectedUserIds;
      localStorage.setItem(STORAGE_KEY_CLASSES, JSON.stringify(classes));

      const users = this.getUsers();
      oldMembers.forEach(oldUid => {
        if (!selectedUserIds.includes(oldUid)) {
          const oldU = users.find(usr => usr.id === oldUid);
          if (oldU && oldU.groupId === group.id) {
            oldU.groupId = null;
          }
        }
      });

      selectedUserIds.forEach((uid, idx) => {
        const u = users.find(usr => usr.id === uid);
        if (u) {
          u.groupId = group.id;
          u.roleCode = String.fromCharCode(65 + idx);
          u.roleTitle = '组员';
        }
      });
      localStorage.setItem(STORAGE_KEY_USERS_DB, JSON.stringify(users));

      this.pushGlobalMeta();
      return group;
    }

    deleteStudent(userId, classId = null) {
      const users = this.getUsers();
      const student = users.find(u => u.id === userId);
      const classes = this.getClasses();

      if (student && classId) {
        if (!student.classIds || !Array.isArray(student.classIds)) {
          student.classIds = student.classId ? [student.classId] : [];
        }
        student.classIds = student.classIds.filter(c => c !== classId);
        if (student.classId === classId) {
          student.classId = student.classIds.length > 0 ? student.classIds[0] : null;
        }

        const cls = classes.find(c => c.id === classId);
        if (cls) {
          if (cls.studentIds) cls.studentIds = cls.studentIds.filter(id => id !== userId);
          if (cls.groups) {
            cls.groups.forEach(g => {
              if (g.members) g.members = g.members.filter(id => id !== userId);
            });
          }
        }

        if (student.classIds.length === 0) {
          const idx = users.findIndex(u => u.id === userId);
          if (idx !== -1) users.splice(idx, 1);
        }
      } else {
        const newUsers = users.filter(u => u.id !== userId);
        users.length = 0;
        newUsers.forEach(u => users.push(u));

        classes.forEach(c => {
          if (c.studentIds) c.studentIds = c.studentIds.filter(id => id !== userId);
          if (c.groups) {
            c.groups.forEach(g => {
              if (g.members) g.members = g.members.filter(id => id !== userId);
            });
          }
        });
      }

      localStorage.setItem(STORAGE_KEY_USERS_DB, JSON.stringify(users));
      localStorage.setItem(STORAGE_KEY_CLASSES, JSON.stringify(classes));
      this.pushGlobalMeta();
    }

    autoRandomGrouping(classId, groupSize = 3, mode = 'reset_all') {
      const classes = this.getClasses();
      const cls = classes.find(c => c.id === classId) || classes[0];
      if (!cls) return 0;

      const classStudents = this.getClassStudents(cls.id);
      if (!classStudents || classStudents.length === 0) return 0;

      const users = this.getUsers();
      const size = Math.max(2, parseInt(groupSize, 10) || 3);

      // Fisher-Yates 随机乱序算法
      const shuffle = (array) => {
        const arr = [...array];
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
      };

      // 智能均分算法：优先拆成 2 人组，严禁出现单人组，严格不超过目标人数（如选3人绝不产生4人组）
      const partition = (list, targetSize) => {
        const N = list.length;
        if (N <= 0) return [];
        if (N <= 2) return [list];

        // 计算最佳组数 K：令平均每组人数最接近 targetSize，且每组至少 2 人
        let K = Math.ceil(N / targetSize);
        if (Math.floor(N / K) < 2) {
          K = Math.floor(N / 2);
        }
        if (K <= 1) return [list];

        const base = Math.floor(N / K);
        const rem = N % K;

        const chunks = [];
        let cursor = 0;
        for (let k = 0; k < K; k++) {
          const count = base + (k < rem ? 1 : 0);
          chunks.push(list.slice(cursor, cursor + count));
          cursor += count;
        }
        return chunks;
      };

      if (mode === 'reset_all') {
        cls.groups = [];
        // 将所有本班学生重置 groupId
        users.forEach(u => {
          if (cls.studentIds && cls.studentIds.includes(u.id)) {
            u.groupId = null;
          }
        });

        const shuffled = shuffle(classStudents);
        const chunks = partition(shuffled, size);

        chunks.forEach((chunk, groupIdx) => {
          const groupIndex = groupIdx + 1;
          const gId = 'group_' + Date.now() + '_' + groupIndex;
          const gName = `第 ${groupIndex} 协作小组`;
          const memberIds = chunk.map(s => s.id);

          cls.groups.push({
            id: gId,
            name: gName,
            members: memberIds
          });

          chunk.forEach((st, idx) => {
            const u = users.find(usr => usr.id === st.id);
            if (u) {
              u.groupId = gId;
              u.roleCode = String.fromCharCode(65 + idx);
              u.roleTitle = '组员';
            }
          });
        });
      } else if (mode === 'append_unassigned') {
        if (!cls.groups) cls.groups = [];
        const assignedIds = new Set();
        cls.groups.forEach(g => {
          (g.members || []).forEach(m => {
            const mId = (typeof m === 'object' && m !== null) ? (m.id || m.userId || m.studentCode) : m;
            if (mId) assignedIds.add(mId);
          });
        });

        const unassignedStudents = classStudents.filter(s => !assignedIds.has(s.id));
        if (unassignedStudents.length === 0) return cls.groups.length;

        const shuffled = shuffle(unassignedStudents);
        const chunks = partition(shuffled, size);

        const startIndex = cls.groups.length;
        chunks.forEach((chunk, groupIdx) => {
          const groupIndex = startIndex + groupIdx + 1;
          const gId = 'group_' + Date.now() + '_' + groupIndex;
          const gName = `第 ${groupIndex} 协作小组`;
          const memberIds = chunk.map(s => s.id);

          cls.groups.push({
            id: gId,
            name: gName,
            members: memberIds
          });

          chunk.forEach((st, idx) => {
            const u = users.find(usr => usr.id === st.id);
            if (u) {
              u.groupId = gId;
              u.roleCode = String.fromCharCode(65 + idx);
              u.roleTitle = '组员';
            }
          });
        });
      }

      localStorage.setItem(STORAGE_KEY_CLASSES, JSON.stringify(classes));
      localStorage.setItem(STORAGE_KEY_USERS_DB, JSON.stringify(users));
      this.pushGlobalMeta();
      return cls.groups.length;
    }

    deleteAllGroups(classId) {
      const classes = this.getClasses();
      const cls = classes.find(c => c.id === classId) || classes[0];
      if (!cls) return;

      const users = this.getUsers();
      cls.groups = [];
      users.forEach(u => {
        if (cls && cls.studentIds && cls.studentIds.includes(u.id)) {
          u.groupId = null;
        }
      });

      localStorage.setItem(STORAGE_KEY_CLASSES, JSON.stringify(classes));
      localStorage.setItem(STORAGE_KEY_USERS_DB, JSON.stringify(users));
      this.pushGlobalMeta();
    }

    deleteGroup(classId, groupId) {
      const classes = this.getClasses();
      const cls = classes.find(c => c.id === classId) || classes[0];
      if (cls && cls.groups) {
        cls.groups = cls.groups.filter(g => g.id !== groupId);
        localStorage.setItem(STORAGE_KEY_CLASSES, JSON.stringify(classes));
      }
      const users = this.getUsers();
      users.forEach(u => {
        if (u.groupId === groupId) u.groupId = null;
      });
      localStorage.setItem(STORAGE_KEY_USERS_DB, JSON.stringify(users));
      this.pushGlobalMeta();
    }

    getGroupMembersForWorkspace(groupId = 'group_1', classId = null) {
      const users = this.getUsers();
      const classes = this.getClasses();
      const colors = ['#818cf8', '#22d3ee', '#fbbf24', '#ec4899', '#34d399', '#f97316', '#a78bfa'];
      const avatars = ['👨‍🎓', '👩‍🎓', '🧑‍🎓', '🎓', '📚', '🌟'];

      // 1. 优先从指定班级真实分组中检索该小组及其成员
      let targetGrp = null;
      if (classId) {
        const cls = classes.find(c => c.id === classId);
        if (cls && Array.isArray(cls.groups)) {
          targetGrp = cls.groups.find(g => g && g.id === groupId);
        }
      }
      if (!targetGrp) {
        for (const c of classes) {
          if (Array.isArray(c.groups)) {
            const foundG = c.groups.find(g => g && g.id === groupId);
            if (foundG) { targetGrp = foundG; break; }
          }
        }
      }

      const groupUsers = [];
      if (targetGrp && Array.isArray(targetGrp.members) && targetGrp.members.length > 0) {
        targetGrp.members.forEach(m => {
          if (!m) return;
          const mKey = (typeof m === 'object') ? (m.studentCode || m.id || m.userId || m.username || m.name) : String(m);
          const cleanKey = String(mKey || '').trim().toLowerCase();
          const matchedU = users.find(u => {
            if (!u) return false;
            return String(u.studentCode || '').trim().toLowerCase() === cleanKey ||
                   String(u.id || '').trim().toLowerCase() === cleanKey ||
                   String(u.username || '').trim().toLowerCase() === cleanKey ||
                   String(u.name || '').trim().toLowerCase() === cleanKey;
          });
          if (matchedU) {
            groupUsers.push(matchedU);
          } else if (typeof m === 'object') {
            groupUsers.push(m);
          } else {
            groupUsers.push({ id: mKey, studentCode: mKey, name: mKey, role: 'student' });
          }
        });
      } else {
        // 2. 兜底：从 users 列表中按 groupId 匹配
        users.forEach(u => {
          if (u && u.groupId === groupId && u.role !== 'teacher') groupUsers.push(u);
        });
      }

      const membersObj = {};
      if (groupUsers.length > 0) {
        // 按 studentCode/id 去重
        const seen = new Set();
        groupUsers.forEach((u, idx) => {
          const studentCode = String(u.studentCode || u.username || u.id || `S${idx + 1}`).trim();
          if (seen.has(studentCode)) return;
          seen.add(studentCode);

          membersObj[studentCode] = {
            id: studentCode,
            userId: u.id || studentCode,
            name: u.name || `学生${seen.size}`,
            roleTitle: '组员 · 合作撰写',
            avatar: u.avatar || avatars[(seen.size - 1) % avatars.length],
            color: colors[(seen.size - 1) % colors.length],
            studentCode: studentCode,
            groupId: groupId,
            classId: u.classId || (targetGrp ? targetGrp.classId : 'class_101')
          };
        });
      }
      return membersObj;
    }

    createTask(title, classId, instructions, resources = [], startTime = null, deadline = null, durationMinutes = 150) {
      const tasks = this.getTasks();
      const cleanTitle = (title || '').trim();
      if (!cleanTitle) throw new Error('任务名称不能为空！');

      const duplicateTask = tasks.find(t => t.classId === classId && (t.title || '').trim().toLowerCase() === cleanTitle.toLowerCase());
      if (duplicateTask) {
        throw new Error(`当前班级已存在名为《${cleanTitle}》的写作任务，请换一个任务名称！`);
      }

      const classes = this.getClasses();
      const targetClass = classes.find(c => c.id === classId) || classes[0];
      const now = new Date();

      const formatTime = (d) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hours = String(d.getHours()).padStart(2, '0');
        const mins = String(d.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${mins}`;
      };

      const defaultStart = startTime ? startTime.replace('T', ' ') : formatTime(now);
      let defaultDeadline = deadline ? deadline.replace('T', ' ') : '';
      if (!defaultDeadline) {
        const dObj = new Date(now.getTime() + (parseInt(durationMinutes) || 150) * 60 * 1000);
        defaultDeadline = formatTime(dObj);
      }

      const newTask = {
        id: 'task_' + Date.now(),
        title, classId, className: targetClass ? targetClass.name : '教学班',
        durationMinutes: parseInt(durationMinutes) || 150,
        startTime: defaultStart,
        deadline: defaultDeadline,
        status: 'in_progress',
        createdAt: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        instructions, resources
      };
      tasks.unshift(newTask);
      localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(tasks));
      this.pushGlobalMeta();

      if ('BroadcastChannel' in window) {
        try {
          const bc = new BroadcastChannel('jizhi_global_events');
          bc.postMessage({ type: 'task_created', task: newTask });
          bc.close();
        } catch (e) {}
      }
      return newTask;
    }

    updateTask(taskId, newTitle, newInstructions, newStartTime, newDeadline, newDurationMinutes) {
      let tasks = this.getTasks();
      const taskIndex = tasks.findIndex(t => t.id === taskId);
      if (taskIndex === -1) throw new Error('任务不存在或已被删除！');

      const cleanTitle = (newTitle || '').trim();
      if (!cleanTitle) throw new Error('任务名称不能为空！');

      tasks[taskIndex].title = cleanTitle;
      if (newInstructions !== undefined) tasks[taskIndex].instructions = newInstructions;
      if (newStartTime !== undefined) tasks[taskIndex].startTime = newStartTime;
      if (newDeadline !== undefined) tasks[taskIndex].deadline = newDeadline;
      if (newDurationMinutes !== undefined) tasks[taskIndex].durationMinutes = parseInt(newDurationMinutes) || 150;

      localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(tasks));
      this.pushGlobalMeta();

      if ('BroadcastChannel' in window) {
        try {
          const bc = new BroadcastChannel('jizhi_global_events');
          bc.postMessage({ type: 'task_updated', task: tasks[taskIndex] });
          bc.close();
        } catch (e) {}
      }
      return tasks[taskIndex];
    }

    extendTaskDeadline(taskId, newDeadline, addedMinutes = 0) {
      let tasks = this.getTasks();
      let taskIndex = tasks.findIndex(t => t.id === taskId);
      if (taskIndex === -1) {
        taskIndex = tasks.findIndex(t => (t.title && t.title === taskId) || (taskId === 'task_default' && t.id.includes('default')));
      }
      if (taskIndex === -1 && tasks.length > 0) {
        taskIndex = 0; // 兜底指向首个任务
      }
      if (taskIndex === -1) throw new Error('任务不存在或已被删除！');

      const targetTask = tasks[taskIndex];
      const oldDeadline = targetTask.deadline || '';
      targetTask.deadline = newDeadline;
      if (addedMinutes > 0) {
        targetTask.durationMinutes = (parseInt(targetTask.durationMinutes, 10) || 150) + parseInt(addedMinutes, 10);
      }
      const taskTitle = targetTask.title || '写作任务';
      const targetClassId = targetTask.classId || 'all';
      const targetClassName = targetTask.className || '全校班级';
      targetTask.lastExtension = {
        extendedAt: Date.now(),
        newDeadline: newDeadline,
        addedMinutes: addedMinutes,
        extendDurationStr: formatDurationHuman(addedMinutes)
      };
      localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(tasks));
      localStorage.setItem('jizhi_pure_v10_tasks_db', JSON.stringify(tasks));

      // ⚡ 本地跨标签页 0 延迟广播
      if ('BroadcastChannel' in window) {
        try {
          const bc = new BroadcastChannel('jizhi_global_events');
          bc.postMessage({ type: 'task_extended', task: targetTask, prevDeadline: oldDeadline });
        } catch (e) {}
      }

      const currUser = this.getCurrentUser();
      const teacherUserId = (currUser && (currUser.studentCode || currUser.username || currUser.id)) || '1001';
      const teacherToken = currUser?.token || currUser?.activeSessionId || '';

      // 🛡️ 后台极速落库，绝不阻塞前端按钮
      this._pushInFlight = true;
      fetch('sync.php?action=extend_task_deadline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: targetTask.id || taskId,
          taskTitle: taskTitle,
          newDeadline: newDeadline,
          addedMinutes: addedMinutes,
          userId: teacherUserId,
          token: teacherToken
        })
      }).then(async (res) => {
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          if (data && data.version) {
            this.globalMetaVersion = parseInt(data.version, 10);
          }
        }
      }).catch(() => {}).finally(() => {
        this._pushInFlight = false;
      });

      return targetTask;
    }

    deleteTask(taskId) {
      let tasks = this.getTasks();
      const deletedTask = tasks.find(t => t.id === taskId);
      const deletedTaskTitle = deletedTask ? deletedTask.title : '写作任务';

      tasks = tasks.filter(t => t.id !== taskId);
      localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(tasks));

      let announcements = this.getAnnouncements();
      announcements = announcements.filter(a => a.taskId !== taskId);
      localStorage.setItem(STORAGE_KEY_ANNOUNCEMENTS, JSON.stringify(announcements));

      let papers = this.getAllReferencePapers();
      papers = papers.filter(p => p.taskId !== taskId);
      localStorage.setItem('jizhi_reference_papers_db', JSON.stringify(papers));

      let surveysList = this.getSurveysList();
      const origLen = surveysList.length;
      surveysList = surveysList.filter(s => s.taskId !== taskId);
      if (surveysList.length !== origLen) {
        localStorage.setItem('jizhi_surveys_list_db', JSON.stringify(surveysList));
      }

      this.pushGlobalMeta();

      if ('BroadcastChannel' in window) {
        try {
          const bc = new BroadcastChannel('jizhi_global_events');
          bc.postMessage({ type: 'task_deleted', taskId: taskId, title: deletedTaskTitle });
          bc.close();
        } catch (e) {}
      }
    }

    publishAnnouncement(taskId, title, content, attachment = null, targetGroupId = 'all', targetGroupName = '全班所有小组', classId = 'all', className = '全校班级', targetGroupIds = ['all'], isSystemAction = false) {
      let announcements = this.getAnnouncements();
      const tasks = this.getTasks();
      const task = tasks.find(t => t.id === taskId);
      const isExtension = !!(isSystemAction || title?.includes('延期通知') || title?.includes('时间已延长') || title?.includes('延长至'));

      // 🧹 智能延期合并与自动修剪：
      // 若为同一任务发布新的延期通知，自动清理该任务先前的历史延期记录，避免产生多条重复过时的时间通知
      if (isExtension && taskId && taskId !== 'task_all') {
        announcements = announcements.filter(a => !(a.taskId === taskId && (a.isExtension || a.title?.includes('延期通知') || a.title?.includes('时间已延长'))));
      }

      const newAnn = {
        id: 'ann_' + Date.now(),
        classId: classId || 'all',
        className: className || '全校班级',
        taskId: taskId || 'task_all',
        taskTitle: taskId === 'task_all' ? '全班通识广播' : (task ? task.title : '指定写作任务'),
        targetGroupId: targetGroupId || 'all',
        targetGroupIds: Array.isArray(targetGroupIds) && targetGroupIds.length > 0 ? targetGroupIds : [targetGroupId || 'all'],
        targetGroupName: targetGroupName || '全班所有小组',
        title, content, attachment,
        isSystemAction: !!isSystemAction,
        isExtension: isExtension,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        author: '老师', readStatus: {}
      };
      announcements.unshift(newAnn);

      // 🧹 最多保留最新 15 条通知，超出部分从最旧一条（末尾）自动滚动删除，保持轻量高效
      if (announcements.length > 15) {
        announcements = announcements.slice(0, 15);
      }

      localStorage.setItem(STORAGE_KEY_ANNOUNCEMENTS, JSON.stringify(announcements));
      this.pushGlobalMeta();

      if ('BroadcastChannel' in window) {
        try {
          const bc = new BroadcastChannel('jizhi_global_events');
          bc.postMessage({ type: 'announcement_created', announcement: newAnn });
          bc.close();
        } catch (e) {}
      }
      return newAnn;
    }

    deleteAnnouncement(annId) {
      let announcements = this.getAnnouncements();
      announcements = announcements.filter(a => a.id !== annId);
      localStorage.setItem(STORAGE_KEY_ANNOUNCEMENTS, JSON.stringify(announcements));
      this.pushGlobalMeta();

      if ('BroadcastChannel' in window) {
        try {
          const bc = new BroadcastChannel('jizhi_global_events');
          bc.postMessage({ type: 'announcement_deleted', annId: annId });
          bc.close();
        } catch (e) {}
      }
    }

    markAnnouncementRead(annId, groupId = 'group_1') {
      const announcements = this.getAnnouncements();
      const ann = announcements.find(a => a.id === annId);
      const currUser = this.getCurrentUser();

      // ⚡ 1. 立即持久化本地已读记录（杜绝任何时序差导致的二次弹出）
      try {
        const localMap = JSON.parse(localStorage.getItem('jizhi_locally_read_announcements') || '{}');
        localMap[annId] = true;
        localStorage.setItem('jizhi_locally_read_announcements', JSON.stringify(localMap));
        sessionStorage.setItem('jizhi_locally_read_announcements', JSON.stringify(localMap));
      } catch (e) {}

      // 2. 优先以最高优先级向服务端轻量回传已读标记（单条极速写入，绝不全量推流阻塞）
      try {
        fetch('sync.php?action=update_read_status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            annId,
            groupId,
            userId: currUser ? (currUser.id || currUser.username || currUser.studentCode) : '',
            userCode: currUser ? (currUser.studentCode || currUser.username || '') : '',
            userName: currUser ? (currUser.name || currUser.studentCode || '学生') : ''
          })
        }).catch(() => {});
      } catch (e) {}

      // 3. 本地内存与缓存安全更新
      if (ann) {
        if (!ann.readStatus) ann.readStatus = {};
        if (!ann.readGroupStatus) ann.readGroupStatus = {};
        if (!Array.isArray(ann.confirmedMembers)) ann.confirmedMembers = [];

        if (currUser) {
          if (currUser.id) ann.readStatus[currUser.id] = true;
          if (currUser.studentCode) ann.readStatus[currUser.studentCode] = true;
          if (currUser.username) ann.readStatus[currUser.username] = true;
          if (currUser.name) ann.readStatus[currUser.name] = true;

          const alreadyIn = ann.confirmedMembers.some(m => m.id === currUser.id || m.studentCode === currUser.studentCode || (currUser.name && m.name === currUser.name));
          if (!alreadyIn) {
            ann.confirmedMembers.push({
              id: currUser.id || currUser.studentCode || ('u_' + Date.now()),
              name: currUser.name || currUser.studentCode || '学生',
              studentCode: currUser.studentCode || '',
              groupId: groupId,
              time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
          }
        }

        if (groupId) {
          ann.readGroupStatus[groupId] = true;
          ann.readStatus[groupId] = true;
        }

        try {
          localStorage.setItem(STORAGE_KEY_ANNOUNCEMENTS, JSON.stringify(announcements));
        } catch (err) {
          this._pruneStorageQuota();
          try {
            localStorage.setItem(STORAGE_KEY_ANNOUNCEMENTS, JSON.stringify(announcements));
          } catch (e2) {}
        }
      }
    }

    markAnnouncementConfirmed(annId, userId, userName, groupId = 'group_1') {
      return this.markAnnouncementRead(annId, groupId);
    }

    // 🧹 存储配额守护清理器：当浏览器 5MB 配额紧张时，自动修剪冗余的历史 Base64 快照
    _pruneStorageQuota() {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && (k.startsWith('jizhi_cloud_snapshot_') || k.includes('_backup_'))) {
            localStorage.removeItem(k);
          }
        }
      } catch (e) {}
    }

    markAllTaskAnnouncementsRead(taskId, groupId = 'group_1') {
      const announcements = this.getAnnouncements();
      const relevant = announcements.filter(a => !a.taskId || a.taskId === 'task_all' || a.taskId === taskId);
      relevant.forEach(a => {
        this.markAnnouncementRead(a.id, groupId);
      });
    }

    getAllReferencePapers() {
      try {
        const data = localStorage.getItem('jizhi_reference_papers_db');
        let papers = data ? JSON.parse(data) : [];
        if (Array.isArray(papers)) {
          let changed = false;
          papers.forEach(p => {
            if (p && p.fileData) {
              delete p.fileData;
              changed = true;
            }
          });
          if (changed) {
            localStorage.setItem('jizhi_reference_papers_db', JSON.stringify(papers));
          }
        }
        return Array.isArray(papers) ? papers : [];
      } catch (e) { return []; }
    }

    getReferencePapers(groupId = null, classId = null, taskId = null) {
      const papers = this.getAllReferencePapers();
      if (!groupId && !classId && !taskId) return papers;
      return papers.filter(p => {
        return isScopeMatch(p, {
          userClassId: classId,
          userGroupId: groupId,
          currentTaskId: taskId
        });
      });
    }

    uploadReferencePaper(paper) {
      const papers = this.getAllReferencePapers();
      const paperId = 'ref_' + Date.now();

      const newPaper = {
        id: paperId,
        classId: paper.classId || 'all',
        className: paper.className || '全校班级',
        taskId: paper.taskId || 'task_all',
        title: paper.title || '未命名学术参考范文',
        abstract: paper.abstract || '',
        keyHighlights: paper.keyHighlights || '研究设计与学术论证规范',
        fileName: paper.fileName || '',
        fileSize: paper.fileSize || '',
        fileUrl: paper.fileUrl || '',
        targetGroupId: paper.targetGroupId || 'all',
        targetGroupIds: Array.isArray(paper.targetGroupIds) && paper.targetGroupIds.length > 0 ? paper.targetGroupIds : [paper.targetGroupId || 'all'],
        targetGroupName: paper.targetGroupName || '全班所有小组',
        uploadTime: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        author: '任课教师'
      };

      papers.unshift(newPaper);
      try {
        localStorage.setItem('jizhi_reference_papers_db', JSON.stringify(papers));
      } catch (e) {
        papers.splice(20);
        try { localStorage.setItem('jizhi_reference_papers_db', JSON.stringify(papers)); } catch (err) {}
      }
      this.pushGlobalMeta();
      return newPaper;
    }

    deleteReferencePaper(paperId) {
      let papers = this.getAllReferencePapers();
      papers = papers.filter(p => p.id !== paperId);
      if (window._paperMemoryBlobMap) window._paperMemoryBlobMap.delete(paperId);
      localStorage.setItem('jizhi_reference_papers_db', JSON.stringify(papers));
      this.pushGlobalMeta();
    }

    exportGroupChatLogsToExcel(groupId = 'group_1', chatLogsState = null) {
      const currentChatLogs = chatLogsState || (window.app && window.app.state && window.app.state.chatLogs) || {};
      let csvContent = '\uFEFF名字,时间,内容\n';
      const stageNames = { stage1: '阶段一：学术拍卖会', stage2: '阶段二：学术编辑部', stage3: '阶段三：答辩擂台' };
      const users = this.getUsers();
      ['stage1', 'stage2', 'stage3'].forEach(stageKey => {
        const logs = currentChatLogs[stageKey] || [];
        if (logs.length > 0) {
          csvContent += `"[${stageNames[stageKey]}]","",""\n`;
          logs.forEach(msg => {
            let senderDisplayName = msg.senderName || msg.sender;
            if (msg.sender === 'auctioneer') senderDisplayName = '拍卖师 Agent';
            else if (msg.sender === 'managingEditor') senderDisplayName = '责任编辑 Agent';
            else if (msg.sender === 'reviewingEditor') senderDisplayName = '审稿编辑 Agent';
            else if (msg.sender === 'opponent') senderDisplayName = '反方委员 Agent';
            else if (msg.sender === 'proponent') senderDisplayName = '正方委员 Agent';
            else if (msg.sender === 'neutral') senderDisplayName = '中间委员 Agent';
            else {
              const foundUser = users.find(u => u.studentCode === msg.sender || u.id === msg.sender || u.username === msg.sender || u.name === msg.sender);
              if (foundUser && foundUser.name) senderDisplayName = foundUser.name;
              else senderDisplayName = `小组成员 (${msg.sender})`;
            }
            const time = formatExportDateTime(msg._timeMs || msg.timestamp);
            const text = (msg.text || '').replace(/"/g, '""').replace(/\n/g, ' ');
            csvContent += `"${senderDisplayName}","${time}","${text}"\n`;
          });
        }
      });
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `${groupId}_学术对话与写作记录表_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    openChangePasswordModal(presetAccount = null) {
      const currentUser = this.getCurrentUser();
      const isTeacher = currentUser && (currentUser.role === 'teacher' || currentUser.isTeacher);
      const account = isTeacher ? '1001' : (presetAccount || currentUser?.studentCode || currentUser?.username || currentUser?.id || '');

      const oldModal = document.getElementById('modal-change-password');
      if (oldModal) oldModal.remove();

      const modal = document.createElement('div');
      modal.id = 'modal-change-password';
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.7);backdrop-filter:blur(4px);z-index:999999;display:flex;align-items:center;justify-content:center;padding:20px;';
      modal.innerHTML = `
        <div style="background:#fff;border-radius:16px;box-shadow:0 20px 25px -5px rgba(0,0,0,0.2);width:100%;max-width:400px;overflow:hidden;animation:fadeIn 0.2s ease;">
          <div style="background:linear-gradient(135deg,#4f46e5,#6366f1);padding:18px 24px;color:#fff;display:flex;justify-content:space-between;align-items:center;">
            <div style="font-size:16px;font-weight:700;display:flex;align-items:center;gap:8px;">🔑 修改个人登录密码</div>
            <button id="btn-close-pwd-modal" style="background:none;border:none;color:#fff;font-size:22px;cursor:pointer;line-height:1;">&times;</button>
          </div>
          <div style="padding:24px;">
            <div style="margin-bottom:14px;">
              <label style="display:block;font-size:12px;font-weight:600;color:#64748b;margin-bottom:6px;">账号 / 工号 (主键)</label>
              <input type="text" id="input-pwd-account" value="${account}" ${isTeacher ? 'readonly style="width:100%;box-sizing:border-box;padding:10px 12px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:14px;background:#f8fafc;font-weight:700;color:#64748b;cursor:not-allowed;"' : 'style="width:100%;box-sizing:border-box;padding:10px 12px;border:1.5px solid #cbd5e1;border-radius:8px;font-size:14px;background:#ffffff;font-weight:700;color:#1e293b;"'}>
            </div>
            <div style="margin-bottom:14px;">
              <label style="display:block;font-size:12px;font-weight:600;color:#64748b;margin-bottom:6px;">原密码 (初始默认密码为 123)</label>
              <input type="password" id="input-pwd-old" placeholder="请输入当前原密码" style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;">
            </div>
            <div style="margin-bottom:14px;">
              <label style="display:block;font-size:12px;font-weight:600;color:#64748b;margin-bottom:6px;">设置新密码</label>
              <input type="password" id="input-pwd-new" placeholder="请输入新密码 (不少于3位)" style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;">
            </div>
            <div style="margin-bottom:20px;">
              <label style="display:block;font-size:12px;font-weight:600;color:#64748b;margin-bottom:6px;">确认新密码</label>
              <input type="password" id="input-pwd-confirm" placeholder="请再次输入新密码" style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;">
            </div>
            <div id="pwd-modal-msg" style="display:none;padding:10px;border-radius:8px;font-size:13px;margin-bottom:16px;"></div>
            <div style="display:flex;gap:12px;justify-content:flex-end;">
              <button id="btn-cancel-pwd" style="background:#f1f5f9;color:#475569;border:none;padding:10px 18px;border-radius:8px;font-weight:600;cursor:pointer;">取消</button>
              <button id="btn-submit-pwd" style="background:#4f46e5;color:#fff;border:none;padding:10px 22px;border-radius:8px;font-weight:600;cursor:pointer;">确认修改</button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      const closeBtn = document.getElementById('btn-close-pwd-modal');
      const cancelBtn = document.getElementById('btn-cancel-pwd');
      const submitBtn = document.getElementById('btn-submit-pwd');
      const msgDiv = document.getElementById('pwd-modal-msg');

      const closeModal = () => modal.remove();
      if (closeBtn) closeBtn.onclick = closeModal;
      if (cancelBtn) cancelBtn.onclick = closeModal;

      if (submitBtn) {
        submitBtn.onclick = async () => {
          const acc = document.getElementById('input-pwd-account').value.trim();
          const oldP = document.getElementById('input-pwd-old').value.trim();
          const newP = document.getElementById('input-pwd-new').value.trim();
          const confP = document.getElementById('input-pwd-confirm').value.trim();

          if (!acc || !newP) {
            msgDiv.style.display = 'block';
            msgDiv.style.background = '#fef2f2';
            msgDiv.style.color = '#dc2626';
            msgDiv.textContent = '❌ 账号与新密码不能为空';
            return;
          }
          if (newP !== confP) {
            msgDiv.style.display = 'block';
            msgDiv.style.background = '#fef2f2';
            msgDiv.style.color = '#dc2626';
            msgDiv.textContent = '❌ 两次输入的新密码不一致';
            return;
          }
          submitBtn.disabled = true;
          submitBtn.textContent = '保存中...';

          try {
            const res = await fetch('sync.php?action=change_password', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                account: acc,
                userId: currentUser ? currentUser.id : '',
                studentCode: currentUser ? (currentUser.studentCode || currentUser.teacherCode || currentUser.code) : '',
                username: currentUser ? currentUser.username : '',
                name: currentUser ? currentUser.name : '',
                role: currentUser ? (currentUser.role || (currentUser.isTeacher ? 'teacher' : 'student')) : '',
                oldPassword: oldP,
                newPassword: newP
              })
            });
            let data = null;
            try {
              data = await res.json();
            } catch (jsonErr) {}

            if (data && data.success) {
              if (currentUser) {
                currentUser.password = newP;
                sessionStorage.setItem(STORAGE_KEY_USER, JSON.stringify(currentUser));
                localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(currentUser));
              }
              const users = this.getUsers();
              users.forEach(u => {
                if (u.id === (currentUser?.id) || u.studentCode === acc || u.username === acc) {
                  u.password = newP;
                }
              });
              localStorage.setItem(STORAGE_KEY_USERS_DB, JSON.stringify(users));

              msgDiv.style.display = 'block';
              msgDiv.style.background = '#f0fdf4';
              msgDiv.style.color = '#16a34a';
              msgDiv.textContent = '✅ ' + (data.message || '密码修改成功！');
              setTimeout(() => {
                closeModal();
                alert('🎉 密码修改成功！为了您的账号安全，请使用新密码重新登录。');
                this.logout();
                if (window.app && typeof window.app.handleLogout === 'function') {
                  window.app.handleLogout();
                } else {
                  window.location.reload();
                }
              }, 300);
            } else {
              msgDiv.style.display = 'block';
              msgDiv.style.background = '#fef2f2';
              msgDiv.style.color = '#dc2626';
              const serverMsg = (data && data.message) ? data.message : `❌ 请求失败 (HTTP ${res.status}): ${res.statusText || '服务端无响应或返回空'}`;
              msgDiv.textContent = serverMsg.startsWith('❌') ? serverMsg : ('❌ ' + serverMsg);
              submitBtn.disabled = false;
              submitBtn.textContent = '确认修改';
            }
          } catch (e) {
            msgDiv.style.display = 'block';
            msgDiv.style.background = '#fef2f2';
            msgDiv.style.color = '#dc2626';
            msgDiv.textContent = '❌ 网络请求异常: ' + (e.message || '请检查网络连接后重试');
            submitBtn.disabled = false;
            submitBtn.textContent = '确认修改';
          }
        };
      }
    }
  }

  /* ==========================================================================
     MODULE: sync.js
     ========================================================================== */
  /**
   * JIZHI (集智) Platform - Real-Time Cloud Sync Engine
   * Standard ES Module (ESM)
   */


  class CloudSyncEngine {
    constructor(app) {
      this.app = app;
      this.lastTimestamp = 0;
      this.isPushing = false;
      this.pendingPushCount = 0;
      this.isInitialPullDone = false;
      this.isLoggingOut = false;
      this.pollTimer = null;
      this._knownTaskDeadlines = {};
      this.updateScopeKeys();
      this.initPolling();
      this.initGlobalBroadcast();
    }

    getEffectiveGroupId() {
      const user = this.app.authManager ? this.app.authManager.getCurrentUser() : null;
      const isTeacher = user && (user.isTeacher || user.role === 'teacher');
      if (isTeacher) {
        return this.app.state.activeMonitorGroupId || this.app.state.activeGroupId || null;
      }
      const effectiveClassId = (this.app?.authManager ? this.app.authManager.getEffectiveStudentClassId(user, this.app?.state?.activeTaskId) : (this.app?.state?.activeStudentClassId || user?.classId || null));
      const activeGroupObj = this.app.authManager ? this.app.authManager.getStudentActiveGroup(user, effectiveClassId) : null;
      return this.app.state.activeGroupId || activeGroupObj?.id || user?.groupId || null;
    }

    updateScopeKeys() {
      const isTeacher = this.app.authManager?.getCurrentUser()?.role === 'teacher';
      const user = this.app.authManager?.getCurrentUser();
      const effectiveClassId = (isTeacher ? this.app.state.activeClassId : this.app.state.activeStudentClassId) || user?.classId || null;
      const groupId = this.getEffectiveGroupId();
      let taskId = (this.app.state.activeTaskId) ? this.app.state.activeTaskId : `task_${effectiveClassId}_default`;
      if (taskId === 'task_default' || !taskId) {
        taskId = `task_${effectiveClassId}_default`;
      }
      this.groupId = groupId;
      this.taskId = taskId;
      this.effectiveClassId = effectiveClassId;
      if (this.app && this.app.state) {
        this.app.state.activeTaskId = taskId;
        this.app.state.activeStudentClassId = effectiveClassId;
      }
      this.storageKey = `jizhi_cloud_snapshot_v10_pure_${effectiveClassId}_${taskId}_${groupId}`;
      this.syncEndpoints = [
        `sync.php?taskId=${taskId}&groupId=${groupId}&classId=${effectiveClassId}`
      ];

      if ('BroadcastChannel' in window) {
        try {
          if (this.bc) { try { this.bc.close(); } catch (e) {} }
          this.bc = new BroadcastChannel(`jizhi_bc_${effectiveClassId}_${this.taskId}_${this.groupId}`);
          this.bc.onmessage = (e) => {
            if (e.data && e.data.snapshot) this.handleRemoteSync(e.data.snapshot);
            if (e.data && e.data.chatMessage) {
              const cm = e.data.chatMessage;
              const stg = e.data.stage || this.app.state.currentStage || 'stage1';
              if (!this.app.state.chatLogs) this.app.state.chatLogs = { stage1: [], stage2: [], stage3: [] };
              if (!Array.isArray(this.app.state.chatLogs[stg])) this.app.state.chatLogs[stg] = [];
              const exists = this.app.state.chatLogs[stg].some(m => (cm.id && m.id === cm.id) || (m._timeMs === cm._timeMs && m.text === cm.text));
              if (!exists) {
                this.app.state.chatLogs[stg].push(cm);
                if (typeof window.renderChat === 'function') window.renderChat(this.app.state);
              }
            }
          };
        } catch (e) {}
      }
    }

    initGlobalBroadcast() {
      if ('BroadcastChannel' in window) {
        try {
          if (this.globalBc) { try { this.globalBc.close(); } catch (e) {} }
          this.globalBc = new BroadcastChannel('jizhi_global_events');
          this.globalBc.onmessage = (e) => {
            if (e.data && e.data.type === 'task_extended' && e.data.task) {
              const t = e.data.task;
              this._knownTaskDeadlines[t.id] = t.deadline;
              this.handleTaskDeadlineChange(t, e.data.prevDeadline);
            }
          };
        } catch (e) {}
      }
    }

    handleTaskDeadlineChange(t, prevDeadline) {
      const isTeacherPortalUI = !!document.querySelector('.app-teacher-mode') || !!document.querySelector('.teacher-portal-layout');

      // 🛡️ 仅当当前标签页正处于教师管理大屏时，才不给自己弹窗；学生端（及学生视角）100% 触发弹窗
      if (isTeacherPortalUI) return;

      let shownEvents = {};
      try { shownEvents = JSON.parse(sessionStorage.getItem('jizhi_shown_deadline_events') || '{}'); } catch (e) {}
      const eventKey = `${t.id}_${t.deadline}`;
      if (shownEvents[eventKey]) return;
      shownEvents[eventKey] = true;
      try { sessionStorage.setItem('jizhi_shown_deadline_events', JSON.stringify(shownEvents)); } catch (e) {}

      const prevExpired = isTaskExpired(prevDeadline);
      const nowExpired = isTaskExpired(t.deadline);
      const isWorkspace = (this.app.state.studentViewMode === 'workspace' || !!document.getElementById('chat-stream') || !!document.querySelector('.app-layout'));
      const badgeText = document.querySelector('.brand-badge')?.innerText || '';
      const isCurrentTask = isWorkspace && (
        !this.app.state.activeTaskId ||
        this.app.state.activeTaskId === t.id ||
        (t.title && this.app.state.activeTaskId === t.title) ||
        (t.id && t.id.includes('default')) ||
        (this.app.state.activeTaskId && this.app.state.activeTaskId.includes('default')) ||
        (t.title && badgeText.includes(t.title))
      );
      const isTaskHall = !isWorkspace || this.app.state.studentViewMode === 'task_list';
      const extDurationStr = t.lastExtension?.extendDurationStr || (t.lastExtension?.addedMinutes ? `（增加了 ${t.lastExtension.addedMinutes} 分钟）` : '');

      if (isCurrentTask) {
        // 🎯 场景 1：学生正处于该任务工作台内部
        // 🛡️ 严格保护：若小组未归档，0ms 就地解除只读锁（绝不销毁重载 iframe，0 闪烁 0 白屏）
        if (!this.app.state.isFinalSubmitted) {
          if (!nowExpired) {
            document.querySelectorAll('.etherpad-readonly-shield').forEach(s => s.remove());
            const f2 = document.getElementById('stage2-etherpad-frame');
            if (f2 && f2.src.includes('showControls=false') && (this.app.state.currentStage === 'stage2' && this.app.state.groupMaxStage !== 'stage3')) {
              f2.src = f2.src.replace('showControls=false', 'showControls=true');
            }
            const f3 = document.getElementById('stage3-etherpad-frame');
            if (f3 && f3.src.includes('showControls=false')) {
              f3.src = f3.src.replace('showControls=false', 'showControls=true');
            }
          }
        }
        // ⏱️ 仅就地刷新顶部倒计时与状态（变绿），绝不调用全页重绘
        if (typeof this.app.renderHeader === 'function') {
          this.app.renderHeader();
        } else if (typeof this.app.renderStudentWorkspace === 'function') {
          this.app.renderStudentWorkspace();
        }
        showGlobalBannerNotice(
          '⏳ 任务截止时间已延长',
          `任课教师已将当前任务《${t.title || '协作写作'}》截止时间延长至 ${t.deadline} ${extDurationStr}！协作通道已畅通。`,
          'info',
          8000
        );
      } else if (isTaskHall) {
        // 📋 场景 2：学生在任务大厅（就地刷新大厅任务卡片，滑出顶部通知横幅）
        this.app.renderMain();
        showGlobalBannerNotice(
          '⏳ 任务延期提醒',
          `班级写作任务《${t.title || '协作任务'}》截止时间已延长至 ${t.deadline} ${extDurationStr}！`,
          'info',
          8000
        );
      } else {
        // ✍️ 场景 3：学生在其他任务工作台内（当前写作 100% 保持稳定，仅顶部滑出通知横幅）
        showGlobalBannerNotice(
          '⏳ 其他任务延期',
          `您的另一项写作任务《${t.title || '写作任务'}》截止时间已延长至 ${t.deadline} ${extDurationStr}。`,
          'info',
          8000
        );
      }
    }

    initSSE() {}
    refreshScopeKeys() {
      this.updateScopeKeys();
    }

    // 🌿 独立轻量在线心跳：仅上报当前用户在线状态，物理隔离绝不触碰全量协作数据
    async sendPresencePing(userObj = null) {
      if (this.isLoggingOut) return;
      this.updateScopeKeys();
      const currentUser = userObj || (this.app.authManager ? this.app.authManager.getCurrentUser() : null);
      if (!currentUser) return;
      const userKey = String(currentUser.studentCode || currentUser.username || currentUser.id || '').trim();
      if (!userKey) return;

      try {
        const url = `sync.php?action=presence_ping&taskId=${encodeURIComponent(this.taskId)}&groupId=${encodeURIComponent(this.groupId)}&classId=${encodeURIComponent(this.effectiveClassId || null)}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: userKey,
            studentCode: currentUser.studentCode || userKey,
            name: currentUser.name || userKey,
            role: currentUser.role || 'student',
            timestamp: Date.now()
          })
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.presence && typeof data.presence === 'object') {
            this.app.state.presence = { ...(this.app.state.presence || {}), ...data.presence };
            if (typeof window.renderChat === 'function') window.renderChat(this.app.state);
            this.app.renderPresenceCursors();
          }
        }
      } catch (e) {}
    }

    _getLastChatTimeMs() {
      let maxMs = 0;
      const logs = this.app?.state?.chatLogs || {};
      ['stage1', 'stage2', 'stage3'].forEach(stg => {
        if (Array.isArray(logs[stg])) {
          logs[stg].forEach(m => {
            const t = Number(m?._timeMs || 0);
            if (t > maxMs) maxMs = t;
          });
        }
      });
      return maxMs;
    }

    initPolling() {
      this.pullFromServer();
      this.sendPresencePing(); // ⚡ 进入工作台 0ms 瞬间首发上线心跳，告别等待
      // ⚡ 动静分级智能心跳与轮询阶梯（平衡实时协同与服务器开销）：
      // • 活跃态 (< 2分钟有操作): 轮询 1.5s，心跳 8s (轻量精准，彻底杜绝 PHP 进程池拥塞)
      // • 静止态 (> 2分钟无操作): 轮询 10s，心跳 20s
      // • 息屏态 (切后台/休眠): 轮询 20s，心跳 40s
      let lastUserActivity = Date.now();
      const markActive = () => {
        const wasIdle = (Date.now() - lastUserActivity > 120000);
        lastUserActivity = Date.now();
        if (wasIdle && !this.isLoggingOut) {
          this.sendPresencePing();
          this.pullFromServer();
        }
      };
      ['mousemove', 'keydown', 'touchstart', 'scroll', 'click'].forEach(evt => {
        window.addEventListener(evt, markActive, { passive: true });
      });

      const isHidden = () => document.hidden || document.visibilityState === 'hidden';
      const isIdle = () => isHidden() || (Date.now() - lastUserActivity > 120000);
      const getPollInterval = () => (isHidden() ? 20000 : (isIdle() ? 10000 : 1500));
      const getPingInterval = () => (isHidden() ? 40000 : (isIdle() ? 20000 : 8000));

      const runPoll = () => {
        if (this.isLoggingOut) return;
        this.pullFromServer().finally(() => {
          if (this.isLoggingOut) return;
          this.pollTimer = setTimeout(runPoll, getPollInterval());
        });
      };
      this.pollTimer = setTimeout(runPoll, 100);

      let lastPingTime = Date.now();
      const runPing = () => {
        if (this.isLoggingOut) return;
        const now = Date.now();
        const pInterval = getPingInterval();
        if (now - lastPingTime >= pInterval) {
          lastPingTime = now;
          this.sendPresencePing().finally(() => {
            if (this.isLoggingOut) return;
            this.pingTimer = setTimeout(runPing, 5000);
          });
        } else {
          this.pingTimer = setTimeout(runPing, 5000);
        }
      };
      this.pingTimer = setTimeout(runPing, 8000);

      window.addEventListener('storage', (e) => {
        if (e.key === this.storageKey && e.newValue) {
          try { this.handleRemoteSync(JSON.parse(e.newValue)); } catch (err) {}
        }
      });

      // 🌟 多场景感知：当切回标签页或重新获得窗口焦点时，0毫秒瞬间发送心跳并拉取全量
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && !this.isLoggingOut) {
          markActive();
          lastPingTime = Date.now();
          this.sendPresencePing();
          this.pullFromServer();
        }
      });
      window.addEventListener('focus', () => {
        if (!this.isLoggingOut) {
          markActive();
          lastPingTime = Date.now();
          this.sendPresencePing();
          this.pullFromServer();
        }
      });

      // 🚪 页面关闭/退出时立即发送离线信标，秒级通知教师端
      window.addEventListener('beforeunload', () => {
        try {
          const currentUser = this.app.authManager ? this.app.authManager.getCurrentUser() : null;
          if (currentUser) {
            const userKey = String(currentUser.studentCode || currentUser.username || currentUser.id || '').trim();
            const effectiveClassId = this.effectiveClassId || currentUser.classId || null;
            const beaconUrl = `sync.php?action=presence_leave&taskId=${encodeURIComponent(this.taskId)}&groupId=${encodeURIComponent(this.groupId)}&classId=${encodeURIComponent(effectiveClassId)}`;
            if (navigator.sendBeacon) {
              navigator.sendBeacon(beaconUrl, JSON.stringify({ userId: userKey }));
            }
          }
        } catch (e) {}
      });
    }

    // 🛡️ 停止轮询并标记登出，供登出流程调用，彻底终止短轮询循环
    stopPolling() {
      this.isLoggingOut = true;
      if (this.pollTimer) { clearTimeout(this.pollTimer); this.pollTimer = null; }
      if (this.pingTimer) { clearTimeout(this.pingTimer); this.pingTimer = null; }
    }

    async pullFromServer() {
      if (this.isPulling || this.isLoggingOut) return;
      this.isPulling = true;
      this.updateScopeKeys();

      const currentUser = this.app.authManager ? this.app.authManager.getCurrentUser() : null;
      const userKey = currentUser ? (currentUser.studentCode || currentUser.username || currentUser.id) : '';
      const sessToken = currentUser ? (currentUser.activeSessionId || currentUser.token || currentUser.sessionToken || '') : '';
      const lastRev = this._lastKnownRevisionId || 0;
      const lastChatMs = this._getLastChatTimeMs();
      const metaVer = this._lastKnownMetaVer || 0;
      const incGlobal = this._hasPulledGlobal ? 0 : 1;

      try {
        for (const endpoint of this.syncEndpoints) {
          try {
            const sep = endpoint.includes('?') ? '&' : '?';
            const url = `${endpoint}${sep}userId=${encodeURIComponent(userKey)}&sessToken=${encodeURIComponent(sessToken)}&lastRev=${lastRev}&lastChatMs=${lastChatMs}&metaVer=${metaVer}&incGlobal=${incGlobal}&nocache=${Date.now()}`;
            const res = await fetch(url, { cache: 'no-store' });
            if (res.ok) {
              const data = await res.json();
              this.isInitialPullDone = true;
              if (data && data.kicked) {
                this.isLoggingOut = true;
                this.stopPolling();
                this.app.authManager.logout();
                alert('⚠️ 您的账号已在另一台设备登录，当前页面已自动下线。');
                this.app.renderMain();
                return;
              }
              if (data && (data.unchanged || data.timestamp !== undefined || data.chatLogs || data.stage1 || data.stage2 || data.presence || data.locks)) {
                this.handleRemoteSync(data);
                return;
              }
            }
          } catch (err) {
            console.warn('[SyncEngine] Pull endpoint warning:', err);
          }
        }
      } catch (err) {
        console.error('[SyncEngine] pullFromServer fatal error:', err);
      } finally {
        this.isPulling = false;
      }
    }

    async pushSnapshot() {
      this.updateScopeKeys();
      const groupId = this.groupId;

      // 🛡️ 严格读优先防空门禁：只有在【已完成初次拉取】时才允许推送全量快照，彻底杜绝冷启动空内存反向冲刷
      if (!this.isInitialPullDone) {
        return;
      }

      const snapshot = {
        timestamp: Date.now(),
        groupId: groupId,
        revisionId: this.lastRevisionId || 0,
        members: this.app.state.members,
        presence: this.app.state.presence || {},
        chatLogs: this.app.state.chatLogs,
        stage1: this.app.state.stage1,
        stage2: this.app.state.stage2,
        stage3: this.app.state.stage3,
        stepConfirmations: this.app.state.stepConfirmations || {},
        timer: this.app.state.timer,
        currentStage: this.app.state.groupMaxStage || this.app.state.currentStage,
        isFinalSubmitted: this.app.state.isFinalSubmitted
      };

      this.lastTimestamp = snapshot.timestamp;
      const bodyStr = JSON.stringify(snapshot);

      if (this.bc) { try { this.bc.postMessage({ snapshot }); } catch (e) {} }
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try { this.ws.send(JSON.stringify({ snapshot })); } catch (e) {}
      }

      if (this.isPushing) { this.pendingPushCount++; return; }
      this.isPushing = true;
      try {
        await Promise.allSettled(this.syncEndpoints.map(url =>
          fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: bodyStr
          }).then(r => r.json()).catch(() => null)
        ));
      } catch (e) {
      } finally {
        this.isPushing = false;
        if (this.pendingPushCount > 0) { this.pendingPushCount = 0; this.pushSnapshot(); }
      }
    }

    handleRemoteSync(remoteData) {
      if (!remoteData) return;

      // ⚡ 极速轻量处理 Delta 响应（仅更新心跳与聚焦锁，0 耗费 CPU/网络，带宽节省 99.8%）
      if (remoteData.unchanged) {
        if (remoteData.serverTimestamp) {
          this.app.state.serverTimestamp = Number(remoteData.serverTimestamp);
        }
        if (remoteData.revisionId !== undefined) {
          this._lastKnownRevisionId = remoteData.revisionId;
        }
        if (remoteData.metaVer !== undefined && remoteData.metaVer !== this._lastKnownMetaVer) {
          this._lastKnownMetaVer = remoteData.metaVer;
          if (this.app && this.app.authManager && this.app.authManager.pullGlobalMeta) {
            this.app.authManager.pullGlobalMeta().then(() => {
              if (this.app.state.studentViewMode === 'workspace' && this.app.state.activeTaskId) {
                const allTasks = this.app.authManager.getTasks();
                const isCurrentTaskAlive = allTasks.some(t => t.id === this.app.state.activeTaskId);
                if (!isCurrentTaskAlive && !this.app._isHandlingTaskRevoked) {
                  this.app.showTaskRevokedModal(this.app.state.activeTaskTitle || '当前写作任务');
                }
              }
            }).catch(() => {});
          }
        }
        this._hasPulledGlobal = true;
        if (remoteData.presence) {
          let incomingPr = (typeof remoteData.presence === 'object' && !Array.isArray(remoteData.presence)) ? remoteData.presence : {};
          this.app.state.presence = { ...(this.app.state.presence || {}), ...incomingPr };
          if (typeof window.renderChat === 'function') window.renderChat(this.app.state);
          this.app.renderPresenceCursors();
        }
        if (remoteData.locks !== undefined) {
          this.app.state.fieldLocks = remoteData.locks || {};
        }
        return;
      }

      const user = this.app.authManager ? this.app.authManager.getCurrentUser() : null;
      const myGroupId = this.getEffectiveGroupId();

      if (remoteData.groupId && remoteData.groupId !== myGroupId && user?.role === 'student') return;

      if (remoteData.metaVer !== undefined) {
        this._lastKnownMetaVer = remoteData.metaVer;
      }

      if (remoteData.users || remoteData.tasks || remoteData.referencePapers) {
        this._hasPulledGlobal = true;
      }

      // 更新本地已知的服务端 revisionId 和 metaVer（每次拉到数据都对齐，彻底打通 Delta 差量通道）
      if (remoteData.revisionId !== undefined) {
        this._lastKnownRevisionId = remoteData.revisionId;
      }
      if (remoteData.metaVer !== undefined) {
        this._lastKnownMetaVer = remoteData.metaVer;
      }
      this._hasPulledGlobal = true;

      // 🌐 服务端全局教务与文献资源同步到本地（tasks/users/classes/announcements/referencePapers）
      // 教师一旦发布新范文或公告，学生端在任务工作台内 1~2 秒内自动无感对齐更新
      if (this.app.authManager) {
        if (Array.isArray(remoteData.tasks) && remoteData.tasks.length > 0) {
          const key = 'jizhi_pure_v10_tasks_db';
          const remoteStr = JSON.stringify(remoteData.tasks);
          localStorage.setItem(key, remoteStr);

          remoteData.tasks.forEach(t => {
            if (!t || !t.id) return;
            const oldDeadline = this._knownTaskDeadlines[t.id];
            if (oldDeadline !== undefined && t.deadline && oldDeadline !== t.deadline) {
              this._knownTaskDeadlines[t.id] = t.deadline;
              this.handleTaskDeadlineChange(t, oldDeadline);
            } else if (oldDeadline === undefined && t.lastExtension && (Date.now() - (t.lastExtension.extendedAt || 0) < 180000)) {
              this._knownTaskDeadlines[t.id] = t.deadline;
              this.handleTaskDeadlineChange(t, '');
            } else if (t.deadline) {
              this._knownTaskDeadlines[t.id] = t.deadline;
            }
          });
        }
        if (Array.isArray(remoteData.users) && remoteData.users.length > 0) {
          const key = 'jizhi_pure_v10_users_db';
          const localStr = localStorage.getItem(key) || '[]';
          const remoteStr = JSON.stringify(remoteData.users);
          if (localStr !== remoteStr) localStorage.setItem(key, remoteStr);
        }
        try {
          if (Array.isArray(remoteData.classes) && remoteData.classes.length > 0) {
            const key = 'jizhi_pure_v10_classes_db';
            const localStr = localStorage.getItem(key) || '[]';
            const remoteStr = JSON.stringify(remoteData.classes);
            if (localStr !== remoteStr) localStorage.setItem(key, remoteStr);
          }
          if (Array.isArray(remoteData.announcements) && remoteData.announcements.length > 0) {
            const key = 'jizhi_pure_v10_ann_db';
            const local = JSON.parse(localStorage.getItem(key) || '[]');
            const remoteIds = new Set(remoteData.announcements.map(a => a.id));
            const merged = [...remoteData.announcements];
            local.forEach(l => { if (l && l.id && !remoteIds.has(l.id)) merged.push(l); });
            // 最多保留最新 15 条轻量通知，杜绝 Base64 塞满配额
            const trimmed = merged.slice(0, 15);
            localStorage.setItem(key, JSON.stringify(trimmed));
          }
          if (Array.isArray(remoteData.referencePapers) && remoteData.referencePapers.length > 0) {
            const key = 'jizhi_reference_papers_db';
            const local = JSON.parse(localStorage.getItem(key) || '[]');
            const remoteIds = new Set(remoteData.referencePapers.map(p => p.id));
            const merged = [...remoteData.referencePapers];
            local.forEach(l => { if (l && l.id && !remoteIds.has(l.id)) merged.push(l); });
            const trimmed = merged.slice(0, 20);
            localStorage.setItem(key, JSON.stringify(trimmed));
            localStorage.setItem('jizhi_pure_v10_ref_papers_db', JSON.stringify(trimmed));
          }
        } catch (err) {
          // 存储超限时自动修剪历史旧快照与冗余缓存
          try {
            if (this.app?.authManager?._pruneStorageQuota) this.app.authManager._pruneStorageQuota();
          } catch (e) {}
        }
      }

      // 🛡️ 教师重置功能已废除，纯净同步阶段协作数据，绝对不误踢正在协作的学生
      this._hasInitialPullCompleted = true;
      this.isInitialPullDone = true;

      if (remoteData.timestamp || remoteData.serverTimestamp) {
        this.app.state.serverTimestamp = Number(remoteData.serverTimestamp || remoteData.timestamp);
      }

      if (remoteData.presence) {
        let incomingPr = {};
        if (typeof remoteData.presence === 'object' && !Array.isArray(remoteData.presence)) {
          incomingPr = remoteData.presence;
        } else if (Array.isArray(remoteData.presence)) {
          remoteData.presence.forEach((item, idx) => {
            if (item) {
              const k = item.studentCode || item.userId || item.id || idx;
              incomingPr[k] = item;
            }
          });
        }
        this.app.state.presence = { ...(this.app.state.presence || {}), ...incomingPr };
        this.app.renderPresenceCursors();
      }

      // 🛡️ 保护本组成员名单不被后端的空数组冲刷覆盖
      if (remoteData.members && (Array.isArray(remoteData.members) ? remoteData.members.length > 0 : Object.keys(remoteData.members).length > 0)) {
        this.app.state.members = remoteData.members;
      } else if (!this.app.state.members || (Array.isArray(this.app.state.members) ? this.app.state.members.length === 0 : Object.keys(this.app.state.members).length === 0)) {
        if (this.app.authManager) {
          this.app.state.members = this.app.authManager.getGroupMembersForWorkspace(this.groupId);
        }
      }

      // ⚡ 天然随快照无缝更新通知与文献库，无损合并保留本地新增
      if (Array.isArray(remoteData.announcements) && remoteData.announcements.length > 0) {
        try {
          const key = 'jizhi_pure_v10_ann_db';
          const local = JSON.parse(localStorage.getItem(key) || '[]');
          const remoteIds = new Set(remoteData.announcements.map(a => a.id));
          const merged = [...remoteData.announcements];
          local.forEach(l => { if (l && l.id && !remoteIds.has(l.id)) merged.push(l); });
          localStorage.setItem(key, JSON.stringify(merged));
          localStorage.setItem('jizhi_announcements_db', JSON.stringify(merged));
        } catch (e) {}
      }
      if (Array.isArray(remoteData.referencePapers) && remoteData.referencePapers.length > 0) {
        try {
          const key = 'jizhi_reference_papers_db';
          const local = JSON.parse(localStorage.getItem(key) || '[]');
          const remoteIds = new Set(remoteData.referencePapers.map(p => p.id));
          const merged = [...remoteData.referencePapers];
          local.forEach(l => { if (l && l.id && !remoteIds.has(l.id)) merged.push(l); });
          localStorage.setItem(key, JSON.stringify(merged));
          localStorage.setItem('jizhi_pure_v10_ref_papers_db', JSON.stringify(merged));
        } catch (e) {}
      }

      if (remoteData.isFinalSubmitted !== undefined) {
        const oldLockState = !!this.app.state.isFinalSubmitted;
        const newLockState = !!remoteData.isFinalSubmitted;

        if (oldLockState !== newLockState) {
          this.app.state.isFinalSubmitted = newLockState;
          const currUser = this.app.authManager ? this.app.authManager.getCurrentUser() : null;
          const isStudent = currUser && (currUser.role === 'student' || currUser.isStudent);

          // 仅在已完成冷启动拉取、且处于工作台时，当教师在后台主动变更锁定时才弹出提醒
          if (this._hasInitialPullCompleted && isStudent && this.app.state.studentViewMode === 'workspace') {
            document.querySelectorAll('.lock-notify-modal').forEach(el => el.remove());
            const lockModal = document.createElement('div');
            lockModal.className = 'modal-overlay lock-notify-modal';
            lockModal.innerHTML = `
              <div style="width:460px; max-width:92vw; background:#ffffff; border-radius:14px; box-shadow:0 20px 25px -5px rgba(0,0,0,0.25); border:1px solid #e2e8f0; overflow:hidden; animation:modalFadeIn 0.25s ease;">
                <div style="background:${newLockState ? 'linear-gradient(135deg, #dc2626, #b91c1c)' : 'linear-gradient(135deg, #059669, #047857)'}; color:white; padding:16px 20px; font-size:16px; font-weight:800; display:flex; align-items:center; gap:8px;">
                  <span>${newLockState ? '🔒 写作任务已全局锁定' : '🔓 写作任务已恢复编辑权限'}</span>
                </div>
                <div style="padding:20px; font-size:13.5px; color:#334155; line-height:1.6;">
                  ${newLockState
                    ? '指导教师已将本组整个写作任务设为【全局归档锁定】！当前工作台所有阶段（阶段一公约、阶段二正文撰写、阶段三答辩矩阵）已全盘转为<b>只读模式</b>（不能继续修改编辑），如需继续修改请联系指导教师解锁。'
                    : '指导教师已【恢复本组写作任务编辑权限】！当前工作台所有阶段已重新开放，小组可以继续协作撰写与修改文稿。'}
                </div>
                <div style="padding:12px 20px; background:#f8fafc; border-top:1px solid #e2e8f0; text-align:right;">
                  <button id="btn-close-lock-modal" style="background:${newLockState ? '#dc2626' : '#059669'}; color:white; border:none; padding:8px 20px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer;">
                    我知道了
                  </button>
                </div>
              </div>
            `;
            document.body.appendChild(lockModal);
            lockModal.querySelector('#btn-close-lock-modal').addEventListener('click', () => lockModal.remove());

            this.app.renderStudentWorkspace(true);
          }
        }
        this._hasInitialPullCompleted = true;
      }

      if (remoteData.chatLogs) {
        if (!this.app.state.chatLogs) this.app.state.chatLogs = { stage1: [], stage2: [], stage3: [] };
        ['stage1', 'stage2', 'stage3'].forEach(stg => {
          let remoteLogs = Array.isArray(remoteData.chatLogs[stg]) ? remoteData.chatLogs[stg] : [];
          const localLogs = Array.isArray(this.app.state.chatLogs[stg]) ? this.app.state.chatLogs[stg] : [];

          // 🛡️ 智能保留本地未决思考气泡与 10 秒内未落库临时消息（防吞防闪烁）
          const now = Date.now();
          const localPending = localLogs.filter(m => {
            if (!m) return false;
            if (m.isThinking) return true;
            const isRecent = (now - (m._timeMs || 0) < 10000);
            if (!isRecent) return false;
            const existsInRemote = remoteLogs.some(rm => (rm.id && rm.id === m.id) || (rm._timeMs === m._timeMs && rm.text === m.text));
            return !existsInRemote;
          });

          // 🛡️ 全局过滤掉临时占位思考气泡，杜绝残留
          remoteLogs = remoteLogs.filter(m => !m || (!String(m.id).startsWith('thinking_eval') && !m.isThinking));

          let baseLogs = remoteLogs;
          if (stg === 'stage1') {
            // 🛡️ 阶段一清洗重复套娃前缀
            baseLogs = baseLogs.map(m => {
              if (!m || typeof m.text !== 'string') return m;
              let t = m.text;
              if (t.includes('【拍卖师·选题速评】') && t.includes('【学术拍卖师·提案')) {
                t = t.replace(/^(?:🎪|🏛️)?\s*【(?:学术拍卖师|拍卖师)[·\s]*(?:选题速评|提案速评|提案评估|落槌与方案研讨)?】[：:]\s*/g, '');
                t = t.replace(/^(?:🎪|🏛️)?\s*【(?:学术拍卖师|拍卖师)[·\s]*(?:选题速评|提案速评|提案评估|落槌与方案研讨)?】[：:]\s*/g, '');
                t = `🏛️ 【学术拍卖师·提案评估】：${t.trim()}`;
                return { ...m, text: t };
              }
              return m;
            });
          } else if (stg === 'stage2') {
            const deduped = [];
            let seenFirstReview = false;
            let seenMeetingCall = false;
            let seenFinalReview = false;
            let seenWelcome = false;
            remoteLogs.forEach(m => {
              if (!m) return;
              const snd = m.sender || '';
              const txt = m.text || '';
              if (snd === 'reviewingEditor' && (txt.includes('初审') || txt.includes('初审微调') || txt.includes('Research Gap'))) {
                if (seenFirstReview) return;
                seenFirstReview = true;
              }
              if (snd === 'managingEditor' && txt.includes('半程会议号召')) {
                if (seenMeetingCall) return;
                seenMeetingCall = true;
              }
              if (snd === 'reviewingEditor' && txt.includes('终稿行文扫描')) {
                if (seenFinalReview) return;
                seenFinalReview = true;
              }
              if (snd === 'managingEditor' && txt.includes('起草提示')) {
                if (seenWelcome) return;
                seenWelcome = true;
              }
              deduped.push(m);
            });
            baseLogs = deduped;
          } else if (stg === 'stage3') {
            const deduped = [];
            let seenStage3Prop = false;
            let seenStage3Opp = false;
            let seenStage3Welcome = false;
            let seenStage3ChairGuide = false;
            remoteLogs.forEach(m => {
              if (!m) return;
              const snd = m.sender || '';
              const txt = m.text || '';
              if (snd === 'proponent' && (txt.includes('正方委员') || txt.includes('立论支持') || txt.includes('通读全篇'))) {
                if (seenStage3Prop) return;
                seenStage3Prop = true;
              }
              if (snd === 'opponent' && (txt.includes('反方委员') || txt.includes('商讨质询') || txt.includes('尖锐质询'))) {
                if (seenStage3Opp) return;
                seenStage3Opp = true;
              }
              if (snd === 'neutral' && (txt.includes('中间委员开场') || txt.includes('欢迎来到【阶段三'))) {
                if (seenStage3Welcome) return;
                seenStage3Welcome = true;
              }
              if (snd === 'neutral' && (txt.includes('答辩思路引导') || txt.includes('质询 ①'))) {
                if (seenStage3ChairGuide) return;
                seenStage3ChairGuide = true;
              }
              deduped.push(m);
            });
            baseLogs = deduped;
          }

          // 合并 baseLogs 与 localPending
          const mergedList = [...baseLogs];
          localPending.forEach(lp => {
            const exists = mergedList.some(m => (lp.id && m.id === lp.id) || (m._timeMs === lp._timeMs && m.text === lp.text));
            if (!exists) mergedList.push(lp);
          });

          // 稳健补全缺省 senderName
          const allUsers = this.app.authManager ? this.app.authManager.getUsers() : [];
          const membersList = Array.isArray(this.app.state.members) ? this.app.state.members : Object.values(this.app.state.members || {});
          const _isSame = (typeof isSameUser === 'function') ? isSameUser : (a, b) => {
            if (!a || !b) return false;
            const k1 = typeof a === 'object' ? (a.studentCode || a.id || a.username || a.name) : a;
            const k2 = typeof b === 'object' ? (b.studentCode || b.id || b.username || b.name) : b;
            return k1 && k2 && String(k1).trim().toLowerCase() === String(k2).trim().toLowerCase();
          };
          mergedList.forEach(m => {
            if (!m.senderName && m.sender) {
              const matchedU = allUsers.find(u => _isSame(u, m.sender) || u.id === m.sender || u.studentCode === m.sender || u.username === m.sender);
              if (matchedU && matchedU.name) m.senderName = matchedU.name;
              else {
                const matchedM = membersList.find(mem => _isSame(mem, m.sender) || mem.id === m.sender || mem.studentCode === m.sender);
                if (matchedM && matchedM.name) m.senderName = matchedM.name;
              }
            }
          });

          mergedList.sort((a, b) => (a._timeMs || 0) - (b._timeMs || 0));
          this.app.state.chatLogs[stg] = mergedList;
        });
        if (typeof window.renderChat === 'function') window.renderChat(this.app.state);
      }

      // 🔒 渲染阶段一合约与阶段三答辩的字段级排他聚焦锁
      if (remoteData.locks !== undefined) {
        this.app.state.fieldLocks = remoteData.locks || {};
        const locks = this.app.state.fieldLocks;
        const currentUser = this.app.authManager ? this.app.authManager.getCurrentUser() : null;
        const currentUserId = currentUser ? (currentUser.studentCode || currentUser.username || currentUser.id) : '';

        // 阶段一公约与阶段三答辩矩阵字段锁更新
        document.querySelectorAll('.task-assignment-input, .contract-time-input, #contract-topic-input, .feedback-direct-input').forEach(el => {
          const fieldKey = el.dataset.lockKey || el.id || (el.dataset.mkey ? `task_${el.dataset.mkey}` : (el.dataset.key ? `time_${el.dataset.key}` : (el.dataset.id ? `fb_${el.dataset.id}` : '')));
          if (!fieldKey) return;
          el.dataset.lockKey = fieldKey;

          const lockInfo = locks[fieldKey];
          const currentUserName = currentUser ? String(currentUser.name || currentUser.username || '') : '';
          const nowMs = Date.now();
          const lockTime = lockInfo ? Number(lockInfo.timestamp || lockInfo.time || 0) : 0;
          const isLockFresh = lockInfo && (nowMs - lockTime <= 8500);
          const lockUser = lockInfo ? String(lockInfo.userId || '') : '';
          const lockName = lockInfo ? String(lockInfo.userName || '') : '';
          const isLockedByOther = isLockFresh && lockUser !== currentUserId && (!currentUserName || lockName !== currentUserName);

          // 查找所属卡片或外层容器
          const isTimeInput = el.classList.contains('contract-time-input');
          const mountContainer = isTimeInput ? (el.closest('div[style*="border-left"]') || el.parentElement.parentElement) : el.parentElement;
          let badge = mountContainer.querySelector(`.field-lock-badge[data-for="${fieldKey}"]`);

          if (isLockedByOther) {
            // 💡 实时呈现对方正在打的成型文字 (无论当前焦点在不在，只要对方锁定了，立即镜像最新内容！)
            if (lockInfo.value !== undefined && lockInfo.value !== null) {
              el.value = lockInfo.value;
            }
            // 🛡️ 如果自己当前正好在该输入框中，标记抢占并安全 blur，杜绝 blur 事件回写覆盖
            if (document.activeElement === el) {
              el._preemptedByOther = true;
              el.blur();
            }
            el.disabled = true;
            el.readOnly = true;
            el.style.pointerEvents = 'none';
            el.style.userSelect = 'none';
            el.style.opacity = '0.75';
            el.style.backgroundColor = '#fefce8';
            el.style.borderColor = '#f59e0b';
            el.title = `🔒 ${lockInfo.userName || '其他组员'} 正在编辑中...`;

            if (!badge) {
              badge = document.createElement('div');
              badge.className = 'field-lock-badge';
              badge.dataset.for = fieldKey;
              if (isTimeInput) {
                badge.style.cssText = 'font-size:11px; color:#b45309; background:#fef3c7; border:1px solid #fde68a; padding:2px 8px; border-radius:6px; margin-top:6px; font-weight:700; display:flex; align-items:center; justify-content:center; gap:4px; width:100%; flex:0 0 100%; box-sizing:border-box;';
              } else {
                badge.style.cssText = 'font-size:11px; color:#b45309; background:#fef3c7; border:1px solid #fde68a; padding:2px 8px; border-radius:6px; margin-top:4px; font-weight:700; display:inline-flex; align-items:center; gap:4px;';
              }
              badge.innerHTML = `🔒 ${lockInfo.userName || '组员'} 正在输入...`;
              mountContainer.appendChild(badge);
            } else {
              badge.innerHTML = `🔒 ${lockInfo.userName || '组员'} 正在输入...`;
            }

            // ⚡ 8.5 秒强制自毁定时器：对方若完全停手 8s 安全交接
            if (badge._selfDestructTimer) clearTimeout(badge._selfDestructTimer);
            badge._selfDestructTimer = setTimeout(() => {
              if (badge) badge.remove();
              el._preemptedByOther = false;
              if (document.activeElement !== el) {
                el.disabled = false;
                el.readOnly = false;
                el.style.pointerEvents = 'auto';
                el.style.userSelect = 'auto';
                el.style.opacity = '1';
                el.style.backgroundColor = '';
                el.style.borderColor = '';
                el.title = '';
              }
            }, 8500);
          } else {
            el._preemptedByOther = false;
            if (document.activeElement !== el) {
              el.disabled = false;
              el.readOnly = false;
              el.style.pointerEvents = 'auto';
              el.style.userSelect = 'auto';
              el.style.opacity = '1';
              el.style.backgroundColor = '';
              el.style.borderColor = '';
              el.title = '';
            }
            if (badge) {
              if (badge._selfDestructTimer) clearTimeout(badge._selfDestructTimer);
              badge.remove();
            }
          }
        });
      }

      let needWorkspaceRender = !this._hasRenderedInitialWorkspace;

      if (remoteData.stage1) {
        const localS1 = this.app.state.stage1 || { proposals: [], votes: {}, hasVoted: {}, contract: {} };
        const prevConfirmedMembersStr = JSON.stringify(this.app.state.stage1?.contract?.confirmedMembers || {});
        const prevIsConfirmed = this.app.state.stage1?.contract?.isConfirmed;
        const prevProposalsStr = JSON.stringify(this.app.state.stage1?.proposals || []);
        const prevVotesStr = JSON.stringify(this.app.state.stage1?.votes || {});
        const prevHasVotedStr = JSON.stringify(this.app.state.stage1?.hasVoted || {});
        const remoteS1 = remoteData.stage1;
        const isContractInputActive = document.activeElement && (
          document.activeElement.classList.contains('task-assignment-input') ||
          document.activeElement.classList.contains('contract-time-input') ||
          document.activeElement.id === 'contract-topic-input'
        );

        if (remoteS1.contractStep !== undefined && remoteS1.contractStep !== this.app.state.stage1.contractStep) {
          this.app.state.stage1.contractStep = remoteS1.contractStep;
          needWorkspaceRender = true;
        }
        if (remoteS1.researchOverview !== undefined) {
          this.app.state.stage1.researchOverview = remoteS1.researchOverview;
        }

        if (remoteS1.contract) {
          if (!this.app.state.stage1.contract) this.app.state.stage1.contract = {};
          if (remoteS1.contract.topic) this.app.state.stage1.contract.topic = remoteS1.contract.topic;
          if (remoteS1.contract.overview) this.app.state.stage1.contract.overview = remoteS1.contract.overview;
          if (remoteS1.contract.isDraftGenerated !== undefined) this.app.state.stage1.contract.isDraftGenerated = remoteS1.contract.isDraftGenerated;
          if (remoteS1.contract.taskAssignments) {
            this.app.state.stage1.contract.taskAssignments = {
              ...(this.app.state.stage1.contract.taskAssignments || {}),
              ...remoteS1.contract.taskAssignments
            };
          }
          if (remoteS1.contract.timeAllocations) {
            this.app.state.stage1.contract.timeAllocations = {
              ...(this.app.state.stage1.contract.timeAllocations || {}),
              ...remoteS1.contract.timeAllocations
            };
          }
          if (remoteS1.contract.confirmedMembers) {
            this.app.state.stage1.contract.confirmedMembers = {
              ...(this.app.state.stage1.contract.confirmedMembers || {}),
              ...remoteS1.contract.confirmedMembers
            };
            needWorkspaceRender = true;
          }
          if (remoteS1.contract.isConfirmed !== undefined) {
            if (remoteS1.contract.isConfirmed !== this.app.state.stage1.contract.isConfirmed) {
              this.app.state.stage1.contract.isConfirmed = remoteS1.contract.isConfirmed;
              needWorkspaceRender = true;
            }
          }
        }
        if (remoteS1.mergedTitle !== undefined) {
          this.app.state.stage1.mergedTitle = remoteS1.mergedTitle;
        }

        if (remoteS1.contract?.taskAssignments) {
          document.querySelectorAll('.task-assignment-input').forEach(inp => {
            const mKey = inp.dataset.mkey;
            const mid = inp.dataset.mid;
            let remoteVal = undefined;
            if (mKey && remoteS1.contract.taskAssignments[mKey] !== undefined) {
              remoteVal = remoteS1.contract.taskAssignments[mKey];
            } else if (mid && remoteS1.contract.taskAssignments[mid] !== undefined) {
              remoteVal = remoteS1.contract.taskAssignments[mid];
            } else {
              // 兼容性模糊匹配（如学号/用户名/ID交叉）
              for (const [k, v] of Object.entries(remoteS1.contract.taskAssignments)) {
                if (k === mKey || k === mid || (mKey && (k.endsWith(mKey) || mKey.endsWith(k)))) {
                  remoteVal = v;
                  break;
                }
              }
            }

            if (remoteVal !== undefined && document.activeElement !== inp) {
              const currentVal = inp.value;
              if (remoteVal !== '' || currentVal === '') {
                if (currentVal !== remoteVal) {
                  inp.value = remoteVal;
                }
              }
            }
          });
        }
        if (remoteS1.contract?.timeAllocations) {
          if (!this.app.state.stage1.contract.timeAllocations) this.app.state.stage1.contract.timeAllocations = {};
          Object.assign(this.app.state.stage1.contract.timeAllocations, remoteS1.contract.timeAllocations);

          document.querySelectorAll('.contract-time-input').forEach(inp => {
            const k = inp.dataset.key;
            if (k && remoteS1.contract.timeAllocations[k] !== undefined) {
              if (document.activeElement !== inp) {
                const targetVal = String(remoteS1.contract.timeAllocations[k]);
                if (targetVal !== '0' || inp.value === '' || inp.value === '0') {
                  if (inp.value !== targetVal) {
                    inp.value = targetVal;
                  }
                }
              }
            }
          });
        }
        if (remoteS1.mergedTitle !== undefined) {
          this.app.state.stage1.mergedTitle = remoteS1.mergedTitle;
          const topicInp = document.getElementById('contract-topic-input');
          if (topicInp && document.activeElement !== topicInp) {
            const remoteTitle = remoteS1.mergedTitle || '';
            if (remoteTitle !== '' || topicInp.value === '') {
              if (topicInp.value !== remoteTitle) {
                topicInp.value = remoteTitle;
              }
            }
          }
        }

        const propMap = new Map();
        (remoteS1.proposals || []).forEach(p => {
          if (p) {
            const k = String(p.id || p.author || p.authorName).trim();
            if (k) propMap.set(k, p);
          }
        });

        (localS1.proposals || []).forEach(p => {
          if (p) {
            const k = String(p.id || p.author || p.authorName).trim();
            if (!k) return;
            const remoteP = propMap.get(k);
            if (!remoteP) {
              propMap.set(k, p);
            } else {
              const remoteTime = remoteP.updatedAt || 0;
              const localTime = p.updatedAt || 0;
              if (localTime >= remoteTime) {
                propMap.set(k, p);
              }
            }
          }
        });

        const mergedProposals = Array.from(propMap.values());

        const mergedVotes = {
          ...(localS1.votes || {}),
          ...(remoteS1.votes || {})
        };
        const mergedHasVoted = {
          ...(localS1.hasVoted || {}),
          ...(remoteS1.hasVoted || {})
        };

        const isProposalChanged = JSON.stringify(mergedProposals) !== prevProposalsStr;
        const isVoteChanged = JSON.stringify(mergedVotes) !== prevVotesStr
          || JSON.stringify(mergedHasVoted) !== prevHasVotedStr;
        const isConfirmChanged = (remoteS1.contract?.isConfirmed !== prevIsConfirmed)
          || (JSON.stringify(this.app.state.stage1.contract?.confirmedMembers || {}) !== prevConfirmedMembersStr);

        this.app.state.stage1.proposals = mergedProposals;
        this.app.state.stage1.votes = mergedVotes;
        this.app.state.stage1.hasVoted = mergedHasVoted;

        if (isProposalChanged || isVoteChanged || isConfirmChanged) {
          needWorkspaceRender = true;
        }
      }

      if (remoteData.stage2) {
        if (Array.isArray(remoteData.stage2)) {
          remoteData.stage2 = { unifiedContent: '', memberContributions: {}, confirmedMembers: {}, meetingSubmissions: {} };
        }
        if (!this.app.state.stage2 || Array.isArray(this.app.state.stage2)) {
          this.app.state.stage2 = {};
        }

        if (remoteData.stage2.pendingReviewing !== undefined) {
          this.app.state.stage2.pendingReviewing = remoteData.stage2.pendingReviewing;
          this.app.state.stage2PendingReviewing = remoteData.stage2.pendingReviewing;
        }
        if (remoteData.stage2.reviewMilestone) {
          this.app.state.stage2.reviewMilestone = remoteData.stage2.reviewMilestone;
        }

        if (remoteData.stage2.unifiedContent !== undefined) {
          let remoteHtml = remoteData.stage2.unifiedContent || '';
          if (remoteHtml.includes('一、研究背景与意义') || remoteHtml.includes('请在此处撰写正文')) {
            remoteHtml = '';
          }
          this.app.state.stage2.unifiedContent = remoteHtml;
        }

        if (remoteData.stage2.memberContributions) {
          if (JSON.stringify(remoteData.stage2.memberContributions) !== JSON.stringify(this.app.state.stage2.memberContributions)) {
            this.app.state.stage2.memberContributions = remoteData.stage2.memberContributions;
            this.app.updateContributionUi();
          }
        }
        if (remoteData.stage2.meetingSubmissions) {
          const localSubs = this.app.state.stage2.meetingSubmissions || {};
          const remoteSubs = remoteData.stage2.meetingSubmissions || {};
          const mergedSubs = { ...localSubs, ...remoteSubs };
          if (JSON.stringify(mergedSubs) !== JSON.stringify(localSubs)) {
            this.app.state.stage2.meetingSubmissions = mergedSubs;
            needWorkspaceRender = true;
          }
        }
        if (remoteData.stage2.confirmedMembers) {
          const localConf = this.app.state.stage2.confirmedMembers || {};
          const mergedConf = { ...localConf, ...remoteData.stage2.confirmedMembers };
          if (JSON.stringify(mergedConf) !== JSON.stringify(localConf)) {
            this.app.state.stage2.confirmedMembers = mergedConf;
            needWorkspaceRender = true;
          }
          let memberArr = [];
          if (Array.isArray(this.app.state.members)) memberArr = this.app.state.members;
          else if (this.app.state.members && typeof this.app.state.members === 'object') memberArr = Object.values(this.app.state.members);
          if (memberArr.length > 0) {
            const isMemDone = (map, m) => !!(map && (map[m.id] || map[m.studentCode] || map[m.username] || (m.name && map[m.name])));
            const cCount = memberArr.filter(m => isMemDone(mergedConf, m)).length;
            if (cCount >= memberArr.length && memberArr.length > 0) {
              this.app.state.stage2.isDraftConfirmed = true;
              this.app.state.groupMaxStage = 'stage3';
              needWorkspaceRender = true;
            }
          }
        }
        if (remoteData.stage2.isDraftConfirmed !== undefined && remoteData.stage2.isDraftConfirmed !== this.app.state.stage2.isDraftConfirmed) {
          this.app.state.stage2.isDraftConfirmed = remoteData.stage2.isDraftConfirmed;
          if (remoteData.stage2.isDraftConfirmed) {
            this.app.state.groupMaxStage = 'stage3';
          }
          needWorkspaceRender = true;
        }
        if (remoteData.stage2.actionPlan) {
          if (remoteData.stage2.actionPlan.isGenerated && !this.app.state.stage2.actionPlan?.isGenerated) {
            this.app.state.stage2.actionPlan = remoteData.stage2.actionPlan;
            needWorkspaceRender = true;
          } else if (JSON.stringify(remoteData.stage2.actionPlan) !== JSON.stringify(this.app.state.stage2.actionPlan)) {
            this.app.state.stage2.actionPlan = remoteData.stage2.actionPlan;
            needWorkspaceRender = true;
          }
        }
      }

      if (remoteData.stage3) {
        const localS3 = this.app.state.stage3;
        const remoteS3 = remoteData.stage3;
        if (remoteS3) {
          if (remoteS3.proponentAnalysis !== undefined) this.app.state.stage3.proponentAnalysis = remoteS3.proponentAnalysis;
          if (remoteS3.opponentCritique !== undefined) this.app.state.stage3.opponentCritique = remoteS3.opponentCritique;
          if (remoteS3.neutralVerdict !== undefined) this.app.state.stage3.neutralVerdict = remoteS3.neutralVerdict;

          if (remoteS3.confirmedMembers) {
            const localConf = this.app.state.stage3.confirmedMembers || {};
            const mergedConf = { ...localConf, ...remoteS3.confirmedMembers };
            if (JSON.stringify(localConf) !== JSON.stringify(mergedConf)) {
              this.app.state.stage3.confirmedMembers = mergedConf;
              needWorkspaceRender = true;
            }
          }
          if (remoteS3.finalSubmittedMembers) {
            const localFinal = this.app.state.stage3.finalSubmittedMembers || {};
            const mergedFinal = { ...localFinal, ...remoteS3.finalSubmittedMembers };
            if (JSON.stringify(localFinal) !== JSON.stringify(mergedFinal)) {
              this.app.state.stage3.finalSubmittedMembers = mergedFinal;
              needWorkspaceRender = true;
            }
          }
          if (remoteS3.isRevisionConfirmed !== undefined && remoteS3.isRevisionConfirmed !== this.app.state.stage3.isRevisionConfirmed) {
            this.app.state.stage3.isRevisionConfirmed = remoteS3.isRevisionConfirmed;
            needWorkspaceRender = true;
          }

          const localItems = Array.isArray(localS3.feedbackItems) ? localS3.feedbackItems : [];
          const remoteItems = Array.isArray(remoteS3.feedbackItems) ? remoteS3.feedbackItems : [];
          if (remoteItems.length > 0 && localItems.length === 0) {
            this.app.state.stage3.feedbackItems = remoteItems;
            needWorkspaceRender = true;
          } else if (JSON.stringify(remoteItems) !== JSON.stringify(localItems)) {
            this.app.state.stage3.feedbackItems = remoteItems;
            remoteItems.forEach(item => {
              const textarea = document.querySelector(`.feedback-direct-input[data-id="${item.id}"]`);
              if (textarea && document.activeElement !== textarea) {
                if (textarea.value !== (item.response || '')) textarea.value = item.response || '';
                textarea.style.borderColor = item.response ? '#a7f3d0' : '#cbd5e1';
                textarea.style.background = this.app.state.isFinalSubmitted ? '#f8fafc' : (item.response ? '#f0fdf4' : '#ffffff');
              }
              const saveBtn = document.querySelector(`.btn-save-feedback-direct[data-id="${item.id}"]`);
              if (saveBtn) {
                saveBtn.innerHTML = item.response ? '🔄 更新并保存本条修改' : '💾 确认并保存本条答复';
                saveBtn.style.background = item.response ? 'linear-gradient(135deg, #059669, #047857)' : 'linear-gradient(135deg, #2563eb, #1d4ed8)';
              }
            });
            const anyCardInDom = document.querySelector('.feedback-direct-input');
            if (!anyCardInDom && this.app.state.currentStage === 'stage3') needWorkspaceRender = true;
          }
        }
      }

      if (remoteData.stepConfirmations !== undefined) {
        if (!this.app.state.stepConfirmations) this.app.state.stepConfirmations = {};
        const localStr = JSON.stringify(this.app.state.stepConfirmations);
        const remoteConfs = remoteData.stepConfirmations || {};
        for (const [stepKey, userMap] of Object.entries(remoteConfs)) {
          if (!this.app.state.stepConfirmations[stepKey]) this.app.state.stepConfirmations[stepKey] = {};
          Object.assign(this.app.state.stepConfirmations[stepKey], userMap || {});
        }
        if (JSON.stringify(this.app.state.stepConfirmations) !== localStr) {
          needWorkspaceRender = true;
        }
      }

      if (remoteData.timer && this.app.state.timer) {
        if (remoteData.timer.startTimestamp) {
          this.app.state.timer.startTimestamp = remoteData.timer.startTimestamp;
        }
        if (remoteData.timer.speed !== undefined) {
          this.app.state.timer.speed = remoteData.timer.speed;
        }
        if (remoteData.timer.isRunning !== undefined) {
          this.app.state.timer.isRunning = remoteData.timer.isRunning;
        }
      }

      const stageOrder = { stage1: 1, stage2: 2, stage3: 3 };
      const currentOrder = stageOrder[this.app.state.currentStage] || 1;
      const remoteOrder = stageOrder[remoteData.currentStage] || 1;

      if (remoteData.currentStage) {
        this.app.state.groupMaxStage = remoteData.currentStage;
      }

      this.app.saveGroupState(myGroupId);

      // 🛡️ Safari / WebKit 核心保护：如果用户正在任意输入框、富文本或 Etherpad iframe 内打字，绝对禁止重绘工作区
      const activeEl = document.activeElement;
      const isTyping = activeEl && (
        activeEl.id === 'chat-input' ||
        activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        activeEl.tagName === 'IFRAME' ||
        activeEl.isContentEditable ||
        window._isGlobalComposing
      );
      if (!isTyping) {
        if (typeof window.renderChat === 'function') window.renderChat(this.app.state);
        if (needWorkspaceRender) {
          this.app.renderStudentWorkspace();
        }
      }
      this.app.updateContributionUi();
      this.app.renderPresenceCursors();

      // 🛡️ 本地快照极速持久化：确保下次 F5 刷新时 0 毫秒秒级呈现已有全部协作数据
      try {
        const snapCache = {
          taskId: this.taskId,
          groupId: myGroupId,
          chatLogs: this.app.state.chatLogs,
          stage1: this.app.state.stage1,
          stage2: this.app.state.stage2,
          stage3: this.app.state.stage3,
          currentStage: this.app.state.currentStage,
          groupMaxStage: this.app.state.groupMaxStage,
          isFinalSubmitted: this.app.state.isFinalSubmitted
        };
        localStorage.setItem(this.storageKey, JSON.stringify(snapCache));
      } catch (e) {}

      const isFirstPull = !this._hasRenderedInitialWorkspace;
      if ((isFirstPull || needWorkspaceRender) && user?.role === 'student' && this.app.state.studentViewMode === 'workspace') {
        const activeEl = document.activeElement;
        const isTypingInWorkspace = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') && (document.getElementById('canvas-panel')?.contains(activeEl) || document.querySelector('.contract-card')?.contains(activeEl));
        if (!isTypingInWorkspace) {
          this._hasRenderedInitialWorkspace = true;
          this.app.renderStudentWorkspace();
        }
      }

      // ⚡ 首次拉取就绪：纯前端局部更新右侧聊天与未读通知检查（0 数据上传）
      if (isFirstPull && user?.role === 'student' && this.app.state.studentViewMode === 'workspace') {
        if (typeof this.app.triggerStageWelcomeSpeech === 'function') {
          this.app.triggerStageWelcomeSpeech(this.app.state.currentStage || 'stage1');
        }
        if (typeof this.app.checkUnreadAnnouncements === 'function') {
          setTimeout(() => this.app.checkUnreadAnnouncements(), 300);
        }
      }
    }
  }

  /* ==========================================================================
     MODULE: login.js
     ========================================================================== */
  function renderLoginView(container, authManager, onLoginSuccess) {
    if (authManager && authManager.pullGlobalMeta) {
      authManager.pullGlobalMeta().catch(() => {});
    }

    let savedAccount = '';
    let savedRole = 'student';
    try {
      savedAccount = localStorage.getItem('jizhi_last_login_account') || '';
      savedRole = localStorage.getItem('jizhi_last_login_role') || 'student';
    } catch (e) {}

    container.innerHTML = `
      <div style="min-height:100vh; display:flex; align-items:center; justify-content:center; padding:20px; background:linear-gradient(135deg, #f0f4f9 0%, #e2e8f0 100%);">
        <div style="background:#ffffff; border:1px solid #cbd5e1; border-radius:20px; width:440px; max-width:95vw; padding:36px; box-shadow:0 20px 40px -8px rgba(15, 23, 42, 0.08), 0 4px 12px rgba(15, 23, 42, 0.04);">
          <div style="text-align:center; margin-bottom:28px;">
            <div style="font-size:32px; font-weight:800; background:linear-gradient(135deg, #1e40af, #2563eb); -webkit-background-clip:text; -webkit-text-fill-color:transparent;">集智 JIZHI</div>
            <div style="font-size:13.5px; color:#475569; margin-top:6px; font-weight:700;">面向团队协作的多智能体人机协同写作平台</div>
          </div>
          <form id="login-form" style="display:flex; flex-direction:column; gap:16px;">
            <div style="display:flex; flex-direction:column; gap:6px;">
              <label style="font-size:13px; font-weight:700; color:#334155;">工号 / 学号</label>
              <input type="text" id="login-account" class="teacher-input" placeholder="请输入工号或者学号" value="${escapeHtml(savedAccount)}" autocomplete="off" required style="width:100%;">
            </div>
            <div style="display:flex; flex-direction:column; gap:6px;">
              <label style="font-size:13px; font-weight:700; color:#334155;">密码</label>
              <input type="password" id="login-password" class="teacher-input" placeholder="请输入密码" value="" autocomplete="off" required style="width:100%;">
            </div>
            <div style="display:flex; flex-direction:column; gap:6px;">
              <label style="font-size:13px; font-weight:700; color:#334155;">登录身份</label>
              <div id="login-role-selector" style="display:flex; gap:10px;">
                <label id="role-opt-student" style="flex:1; display:flex; align-items:center; justify-content:center; gap:6px; padding:10px; border:1.5px solid #2563eb; border-radius:8px; cursor:pointer; font-size:13px; font-weight:700; color:#1e40af; background:#eff6ff;">
                  <input type="radio" name="login-role" value="student" ${savedRole !== 'teacher' ? 'checked' : ''} style="accent-color:#2563eb;"> 🎓 学生
                </label>
                <label id="role-opt-teacher" style="flex:1; display:flex; align-items:center; justify-content:center; gap:6px; padding:10px; border:1.5px solid #cbd5e1; border-radius:8px; cursor:pointer; font-size:13px; font-weight:600; color:#334155; background:#ffffff;">
                  <input type="radio" name="login-role" value="teacher" ${savedRole === 'teacher' ? 'checked' : ''} style="accent-color:#2563eb;"> 👩‍🏫 教师
                </label>
              </div>
            </div>
            <div id="login-error-msg" style="display:none; font-size:12px; color:#dc2626; background:#fef2f2; border:1px solid #fecaca; padding:8px 12px; border-radius:8px;"></div>
            <button type="submit" class="modal-btn submit task-theme" style="width:100%; padding:14px; font-size:15px; border-radius:10px; margin-top:8px;">
              🚀 登录集智平台
            </button>
          </form>
          <div style="text-align:center; margin-top:24px; font-size:12px; color:#94a3b8; font-weight:500;">
            <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer" style="color:#94a3b8; text-decoration:none;">浙ICP备2026066047号-1</a>
          </div>
        </div>
      </div>
    `;

    const form = container.querySelector('#login-form');
    const accountInput = container.querySelector('#login-account');
    const passwordInput = container.querySelector('#login-password');
    const errorMsg = container.querySelector('#login-error-msg');
    const roleSelector = container.querySelector('#login-role-selector');
    const roleOptStudent = container.querySelector('#role-opt-student');
    const roleOptTeacher = container.querySelector('#role-opt-teacher');

    // 🎭 身份切换高亮：让所选「教师/学生」一目了然
    const highlightRole = () => {
      const selected = (container.querySelector('input[name="login-role"]:checked') || {}).value;
      const apply = (el, active) => {
        if (!el) return;
        if (active) {
          el.style.border = '1.5px solid #2563eb';
          el.style.background = '#eff6ff';
          el.style.color = '#1e40af';
          el.style.fontWeight = '700';
        } else {
          el.style.border = '1.5px solid #cbd5e1';
          el.style.background = '#ffffff';
          el.style.color = '#334155';
          el.style.fontWeight = '600';
        }
      };
      apply(roleOptStudent, selected === 'student');
      apply(roleOptTeacher, selected === 'teacher');
    };
    if (roleSelector) roleSelector.addEventListener('change', highlightRole);
    highlightRole();

    // 👨‍🏫 智能识别教师账号并自动选定「教师」身份 (教师账号唯一)
    const autoDetectTeacherRole = () => {
      const val = (accountInput ? accountInput.value : '').trim().toLowerCase();
      if (!val) return;
      const allUsers = (authManager && authManager.getUsers) ? authManager.getUsers() : [];
      const isTeacher = val === 'teacher' || val === 'admin' || allUsers.some(u => 
        (u.role === 'teacher' || u.isTeacher) && (
          (u.username && u.username.toLowerCase() === val) ||
          (u.studentCode && u.studentCode.toLowerCase() === val) ||
          (u.id && u.id.toLowerCase() === val) ||
          (u.name && u.name.toLowerCase() === val)
        )
      );
      if (isTeacher) {
        const teacherRadio = container.querySelector('input[name="login-role"][value="teacher"]');
        if (teacherRadio && !teacherRadio.checked) {
          teacherRadio.checked = true;
          highlightRole();
        }
      }
    };

    accountInput.addEventListener('input', autoDetectTeacherRole);
    accountInput.addEventListener('change', autoDetectTeacherRole);
    accountInput.addEventListener('blur', autoDetectTeacherRole);
    if (savedAccount) autoDetectTeacherRole();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorMsg.style.display = 'none';
      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) { submitBtn.disabled = true; submitBtn.innerText = '⏳ 正在验证凭证...'; }
      try {
        const selectedRole = (container.querySelector('input[name="login-role"]:checked') || {}).value || 'student';
        const res = await (authManager.loginAsync ? authManager.loginAsync(accountInput.value, passwordInput.value, selectedRole) : authManager.login(accountInput.value, passwordInput.value, selectedRole));
        if (res && res.success) {
          try {
            localStorage.setItem('jizhi_last_login_account', accountInput.value.trim());
            localStorage.setItem('jizhi_last_login_role', selectedRole);
          } catch (e) {}
          onLoginSuccess();
        } else {
          if (res && res.suggestedRole) {
            const targetRadio = container.querySelector(`input[name="login-role"][value="${res.suggestedRole}"]`);
            if (targetRadio) {
              targetRadio.checked = true;
              highlightRole();
            }
          }
          errorMsg.innerText = (res && res.message) ? res.message : '❌ 账号不存在或密码错误，请核对后重试';
          errorMsg.style.display = 'block';
        }
      } catch (err) {
        errorMsg.innerText = '❌ 登录请求失败，请检查网络连接';
        errorMsg.style.display = 'block';
      } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = '🚀 登录集智平台'; }
      }
    });

    // 💡 智能光标聚焦：若已自动回填学号，直接聚焦密码框方便输入
    if (savedAccount && passwordInput) {
      setTimeout(() => { try { passwordInput.focus(); } catch (e) {} }, 100);
    } else if (accountInput) {
      setTimeout(() => { try { accountInput.focus(); } catch (e) {} }, 100);
    }
  }

  /* ==========================================================================
     MODULE: teacher.js
     ========================================================================== */
  /**
   * JIZHI (集智) Platform - Teacher Portal & Analytics Matrix
   * Standard ES Module (ESM)
   */


  /* ==========================================================================
     7. TEACHER PORTAL RENDERER (LIVE WORKSPACE MIRROR & ANNOUNCEMENT READ MATRIX)
     ========================================================================== */
  function renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView) {
    const oldLayout = container.querySelector('.teacher-portal-layout') || document.querySelector('.teacher-portal-layout');
    const savedScrollTop = oldLayout ? oldLayout.scrollTop : (state._teacherScrollTop || 0);

    // 💬 保存当前研讨流的滚动状态与贴底标志
    const chatScrollPositions = state._chatScrollPositions || {};
    container.querySelectorAll('.teacher-chat-stream').forEach(st => {
      if (st.id) {
        const isAtBottom = (st.scrollHeight - st.scrollTop - st.clientHeight) < 40;
        const streamKey = `${st.id}_${state.activeMonitorGroupId || (activeClass?.groups?.[0]?.id) || null}`;
        chatScrollPositions[streamKey] = {
          scrollTop: st.scrollTop,
          isAtBottom: isAtBottom
        };
      }
    });
    state._chatScrollPositions = chatScrollPositions;

    if (authManager && authManager.sanitizeAndDeduplicateGroups) {
      authManager.sanitizeAndDeduplicateGroups();
    }
    const currentUser = authManager.getCurrentUser();
    const tasks = authManager.getTasks();
    const announcements = authManager.getAnnouncements();
    const refPapers = authManager.getReferencePapers();
    const classes = authManager.getClasses();
    const activeTab = state.teacherActiveTab || 'view_architecture';
    const activeClassId = state.activeClassId || (classes[0] ? classes[0].id : null);
    const activeClass = classes.find(c => c.id === activeClassId) || classes[0] || null;

    const allUsers = authManager.getUsers();
    const classStudents = authManager.getClassStudents(activeClass.id);

    // 🛡️ 严格按当前班级隔离写作任务、通知与文献（支持全校通用广播与多班级分发）
    const currentClassTasks = tasks.filter(t => !t.classId || t.classId === 'all' || t.classId === activeClass.id || (t.className && t.className === activeClass.name) || (Array.isArray(t.targetClassIds) && (t.targetClassIds.includes('all') || t.targetClassIds.includes(activeClass.id))));
    const currentClassAnnouncements = announcements.filter(a => (!a.classId || a.classId === 'all' || a.classId === activeClass.id || (a.className && a.className === activeClass.name) || (Array.isArray(a.targetClassIds) && (a.targetClassIds.includes('all') || a.targetClassIds.includes(activeClass.id)))) && !a.isSystemAction && !a.isExtension && !a.title?.includes('延期') && !a.title?.includes('延长至'));
    const currentClassPapers = refPapers.filter(p => (!p.classId || p.classId === 'all' || p.classId === activeClass.id || (p.className && p.className === activeClass.name) || (Array.isArray(p.targetClassIds) && (p.targetClassIds.includes('all') || p.targetClassIds.includes(activeClass.id)))));

    const classTaskExists = currentClassTasks.some(t => t.id === state.activeTaskId);
    let effectiveMonitorTaskId = (state.activeTaskId && classTaskExists)
      ? state.activeTaskId
      : (currentClassTasks[0] ? currentClassTasks[0].id : `task_${activeClass.id}_default`);
    if (!effectiveMonitorTaskId || effectiveMonitorTaskId === 'task_default') {
      effectiveMonitorTaskId = `task_${activeClass.id}_default`;
    }
    state.activeTaskId = effectiveMonitorTaskId;
    if (window.app && window.app.state) window.app.state.activeTaskId = effectiveMonitorTaskId;

    const classGroupExists = (activeClass.groups || []).some(g => g.id === state.activeMonitorGroupId);
    const activeMonitorGId = (state.activeMonitorGroupId && classGroupExists)
      ? state.activeMonitorGroupId
      : (activeClass.groups && activeClass.groups[0] ? activeClass.groups[0].id : 'group_1');
    state.activeMonitorGroupId = activeMonitorGId;
    if (window.app && window.app.state) window.app.state.activeMonitorGroupId = activeMonitorGId;

    const activeMonitorGroup = (activeClass.groups || []).find(g => g.id === activeMonitorGId) || (activeClass.groups && activeClass.groups[0]) || { id: 'group_1', name: '第1小组' };
    const monitorMembersObj = authManager.getGroupMembersForWorkspace(activeMonitorGId, activeClass.id);
    const monitorMembersList = Object.values(monitorMembersObj);

    const monitorStageMode = state.teacherMonitorStageMode || state.monitorStageTab || 'auto';
    const effectiveMonitorStage = monitorStageMode === 'auto' ? (state.currentStage || 'stage1') : monitorStageMode;
    const currentS3Tab = state.stage3TeacherTab || 'defense';

    // 🛡️ 教师端单例保护：若当前已经在 view_monitoring 标签下且监控同一个班级/小组/任务/阶段/模式/子页，优先执行增量就地更新
    const existingLayout = container.querySelector('.teacher-portal-layout');
    const renderedCId = container.dataset.renderedClassId;
    const renderedGId = container.dataset.renderedGroupId;
    const renderedTaskId = container.dataset.renderedTaskId;
    const renderedStage = container.dataset.renderedStage;
    const renderedMode = container.dataset.renderedMode;
    const renderedS3Tab = container.dataset.renderedS3Tab;
    const renderedTab = container.dataset.renderedTab;

    if (existingLayout && activeTab === 'view_monitoring' && renderedTab === 'view_monitoring' &&
        renderedCId === activeClassId && renderedGId === activeMonitorGId &&
        renderedTaskId === effectiveMonitorTaskId && renderedStage === effectiveMonitorStage &&
        renderedMode === monitorStageMode &&
        (effectiveMonitorStage !== 'stage3' || renderedS3Tab === currentS3Tab)) {

      // 1. Stage 2 in-place update
      if (effectiveMonitorStage === 'stage2') {
        const existingFrame = container.querySelector('#teacher-stage2-etherpad-frame');
        if (existingFrame) {
          const wc = container.querySelector('#teacher-stage2-word-count-num');
          if (wc) wc.innerText = String(((state.stage2?.unifiedContent || '').replace(/<[^>]*>/g, '').trim()).length);

          const apContainer = container.querySelector('#teacher-stage2-action-plan-container');
          if (apContainer) {
            const s2ActionPlan = state.stage2?.actionPlan;
            const s2Subs = state.stage2?.meetingSubmissions || {};
            const s2SubCount = Object.keys(s2Subs).length;
            const totalMemberCount = monitorMembersList.length || 3;
            if (s2ActionPlan && s2ActionPlan.isGenerated) {
              apContainer.innerHTML = `
                <div style="background:#ecfdf5; border:1px solid #a7f3d0; border-radius:8px; padding:8px 12px; flex-shrink:0;">
                  <div style="font-size:12px; font-weight:800; color:#059669; display:flex; justify-content:space-between; align-items:center;">
                    <span>📋 【半程修正清单】(3项修改要求)</span>
                    <span style="font-size:10.5px; background:#d1fae5; color:#065f46; padding:1px 6px; border-radius:10px;">已生成</span>
                  </div>
                  <div style="font-size:11.5px; color:#334155; display:flex; flex-direction:column; gap:2px; margin-top:4px;">
                    ${(s2ActionPlan.items || []).map(item => `<div style="line-height:1.4;">• ${escapeHtml(item)}</div>`).join('')}
                  </div>
                </div>
              `;
            } else {
              apContainer.innerHTML = `
                <div style="background:#f8fafc; border:1px dashed #cbd5e1; border-radius:8px; padding:8px 12px; flex-shrink:0;">
                  <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
                    <div style="font-size:12px; font-weight:700; color:#64748b; display:flex; align-items:center; gap:6px;">
                      <span>📋 【半程修正清单】</span>
                      <span style="font-size:10.5px; background:${s2SubCount > 0 ? '#dbeafe' : '#e2e8f0'}; color:${s2SubCount > 0 ? '#1d4ed8' : '#475569'}; padding:1px 8px; border-radius:10px; font-weight:700;">
                        ${s2SubCount > 0 ? `待解锁 (全员自查进度 ${s2SubCount}/${totalMemberCount}人)` : `待解锁 (0/${totalMemberCount}人)`}
                      </span>
                    </div>
                    <span style="font-size:11px; color:#94a3b8;">（需全组成员完成半程自查后自动生成）</span>
                  </div>
                </div>
              `;
            }
          }

          const pills = container.querySelector('#teacher-stage2-confirmed-pills');
          if (pills) {
            pills.innerHTML = monitorMembersList.map(m => {
              const isConf = state.stage2?.confirmedMembers && (state.stage2.confirmedMembers[m.id] || state.stage2.confirmedMembers[m.studentCode] || (m.name && state.stage2.confirmedMembers[m.name]));
              return `<span style="font-size:11px; padding:1px 8px; border-radius:10px; font-weight:700; background:${isConf ? '#ecfdf5' : '#f8fafc'}; color:${isConf ? '#059669' : '#94a3b8'}; border:1px solid ${isConf ? '#a7f3d0' : '#e2e8f0'};">
                ${isConf ? '✓' : '○'} ${escapeHtml(m.name)}
              </span>`;
            }).join('');
          }

          const contribs = state.stage2?.memberContributions || {};
          let rawTotal = 0;
          monitorMembersList.forEach(m => { rawTotal += (contribs[m.id] || 0) + (contribs[m.studentCode] || 0); });
          const cl = container.querySelector('#teacher-stage2-contrib-labels');
          if (cl) {
            cl.innerHTML = monitorMembersList.map((m) => {
              const rawVal = (contribs[m.id] || 0) + (contribs[m.studentCode] || 0);
              const pct = rawTotal > 0 ? Math.round((rawVal / rawTotal) * 100) : 0;
              return `<span style="color:${rawVal > 0 ? (m.color || '#2563eb') : '#94a3b8'}; font-weight:700;">● ${escapeHtml(m.name)}: ${pct}%</span>`;
            }).join('');
          }
          const cb = container.querySelector('#teacher-stage2-contrib-bars');
          if (cb) {
            cb.innerHTML = rawTotal === 0 ? `<div style="width:100%; height:10px; background:#f8fafc; border-radius:5px; display:flex; align-items:center; justify-content:center; font-size:10px; color:#94a3b8; font-weight:600;">⏳ 暂无协作投入 (组员在 Etherpad 中撰写、修改正文或研讨后将平滑累计真实贡献)</div>` : monitorMembersList.map((m) => {
              const rawVal = (contribs[m.id] || 0) + (contribs[m.studentCode] || 0);
              if (rawVal === 0) return '';
              const pct = Math.round((rawVal / rawTotal) * 100);
              return `<div style="width:${pct}%; background:${m.color || '#2563eb'}; transition:width 0.3s ease;" title="${escapeHtml(m.name)}: ${pct}% (${rawVal}字)"></div>`;
            }).join('');
          }
        }
      }

      // 2. Stage 3 in-place update
      if (effectiveMonitorStage === 'stage3') {
        if (currentS3Tab === 'doc') {
          const existingFrame = container.querySelector('#teacher-stage3-etherpad-frame');
          if (existingFrame) {
            const wc = container.querySelector('#teacher-stage3-word-count-num');
            if (wc) wc.innerText = String(((state.stage3?.finalDraft || state.stage2?.unifiedContent || '').replace(/<[^>]*>/g, '').trim()).length);

            const contribs = state.stage2?.memberContributions || {};
            let rawTotal = 0;
            monitorMembersList.forEach(m => { rawTotal += (contribs[m.id] || 0) + (contribs[m.studentCode] || 0); });
            const cl = container.querySelector('#teacher-stage3-contrib-labels');
            if (cl) {
              cl.innerHTML = monitorMembersList.map((m) => {
                const rawVal = (contribs[m.id] || 0) + (contribs[m.studentCode] || 0);
                const pct = rawTotal > 0 ? Math.round((rawVal / rawTotal) * 100) : 0;
                return `<span style="color:${rawVal > 0 ? (m.color || '#2563eb') : '#94a3b8'}; font-weight:700;">● ${escapeHtml(m.name)}: ${pct}%</span>`;
              }).join('');
            }
            const cb = container.querySelector('#teacher-stage3-contrib-bars');
            if (cb) {
              cb.innerHTML = rawTotal === 0 ? `<div style="width:100%; height:10px; background:#f8fafc; border-radius:5px; display:flex; align-items:center; justify-content:center; font-size:10px; color:#94a3b8; font-weight:600;">⏳ 暂无协作投入</div>` : monitorMembersList.map((m) => {
                const rawVal = (contribs[m.id] || 0) + (contribs[m.studentCode] || 0);
                if (rawVal === 0) return '';
                const pct = Math.round((rawVal / rawTotal) * 100);
                return `<div style="width:${pct}%; background:${m.color || '#2563eb'}; transition:width 0.3s ease;" title="${escapeHtml(m.name)}: ${pct}% (${rawVal}字)"></div>`;
              }).join('');
            }
          }
        } else {
          const fbList = container.querySelector('#teacher-stage3-feedback-list');
          if (fbList) {
            fbList.innerHTML = (state.stage3?.feedbackItems && state.stage3.feedbackItems.length > 0) ? state.stage3.feedbackItems.map((item, i) => {
              const isProp = item.role === 'proponent';
              const roleLabel = item.speaker || (isProp ? '正方委员 Agent (立论支持)' : '反方委员 Agent (学术质询)');
              const titleLabel = item.title ? ` - ${item.title}` : '';
              const questionText = item.content || item.question || item.comment || item.text || '质询内容生成中...';
              return `
              <div style="background:#ffffff; border:1.5px solid ${item.response ? '#93c5fd' : (isProp ? '#86efac' : '#fca5a5')}; border-radius:8px; padding:12px 14px; font-size:12.5px; box-shadow:0 1px 3px rgba(0,0,0,0.02);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                  <span style="font-weight:800; color:${isProp ? '#059669' : '#0f172a'}; font-size:13px;">
                    ${isProp ? '🟢 专家立论支持' : `💬 答辩质询 #${i+1}`} (${escapeHtml(roleLabel)}${escapeHtml(titleLabel)}):
                  </span>
                  <span style="font-size:11px; background:${item.response ? '#ecfdf5' : (isProp ? '#eff6ff' : '#fef3c7')}; color:${item.response ? '#059669' : (isProp ? '#2563eb' : '#b45309')}; padding:2px 8px; border-radius:4px; font-weight:700;">
                    ${item.response ? '✅ 小组已答辩并归档' : (isProp ? '🌟 专家肯定 (立论支持无需答辩)' : '⏳ 待组内研讨答辩')}
                  </span>
                </div>
                <div style="color:#1e293b; background:#f8fafc; padding:8px 10px; border-radius:6px; margin-bottom:8px; border-left:3px solid ${isProp ? '#10b981' : '#ef4444'}; line-height:1.5;">
                  ${escapeHtml(questionText)}
                </div>
                ${item.response ? `
                  <div style="color:#065f46; background:#ecfdf5; padding:8px 10px; border-radius:6px; border-left:3px solid #10b981; line-height:1.5;">
                    <b>✍️ 小组辩护陈述与修改方案:</b> ${escapeHtml(item.response)}
                  </div>
                ` : `
                  <div style="color:#94a3b8; font-style:italic; font-size:11.5px; padding:4px 8px;">
                    ${isProp ? '（立论支持默认通过，如无补充可直接留空）' : '（本小组尚未提交对该质询的答辩回应）'}
                  </div>
                `}
              </div>
            `;}).join('') : `
              <div style="text-align:center; padding:60px 16px; color:#94a3b8; font-size:13px; background:#ffffff; border-radius:8px; border:1px dashed #cbd5e1; flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px;">
                <span style="font-size:28px;">⏳</span>
                <span>答辩委员会尚未对该小组发布质询意见，或小组正处于答辩准备中</span>
              </div>
            `;
          }
        }
      }

      // 3. Update right chat stream
      const chatStream = container.querySelector('#teacher-unified-chat-stream');
      if (chatStream) {
        const allStages = ['stage1', 'stage2', 'stage3'];
        const allMsgs = [];
        const seenMsgKeys = new Set();
        allStages.forEach(stg => {
          if (state.chatLogs && Array.isArray(state.chatLogs[stg])) {
            state.chatLogs[stg].forEach(msg => {
              if (!msg) return;
              const txt = msg.text || '';
              if (txt.includes('已连续') || txt.includes('互动督促') || txt.includes('秒未研讨') || txt.includes('秒没有发言')) return;
              const rawTxtNormalized = txt.replace(/[\s\r\n]+/g, ' ').trim();
              const contentKey = `${msg.sender}_${stg}_${rawTxtNormalized}`;
              const idKey = msg.id ? `id_${msg.id}` : null;
              if (seenMsgKeys.has(contentKey) || (idKey && seenMsgKeys.has(idKey))) return;
              seenMsgKeys.add(contentKey);
              if (idKey) seenMsgKeys.add(idKey);
              allMsgs.push({ ...msg, _stageSource: stg });
            });
          }
        });
        allMsgs.sort((a, b) => (Number(a._timeMs || a.timestamp || 0) - Number(b._timeMs || b.timestamp || 0)));
        const combinedGroupChatLogs = filterAndDeduplicateChatLogs(allMsgs);

        const oldScroll = chatStream.scrollTop;
        const isAtBottom = (chatStream.scrollHeight - chatStream.scrollTop - chatStream.clientHeight) < 40;
        chatStream.innerHTML = combinedGroupChatLogs.length > 0 ? combinedGroupChatLogs.map(m => {
          const allGlobalUsers = (authManager) ? authManager.getUsers() : [];
          const isAgent = AgentProfiles[m.sender] !== undefined;
          const matchedUser = isAgent ? null : allGlobalUsers.find(u => u.id === m.sender || u.studentCode === m.sender || u.username === m.sender || u.name === m.sender);
          const senderName = isAgent ? AgentProfiles[m.sender].name : (matchedUser ? matchedUser.name : (m.senderName || (monitorMembersObj[m.sender] ? monitorMembersObj[m.sender].name : m.sender)));
          const color = isAgent ? AgentProfiles[m.sender].color : (matchedUser ? (matchedUser.color || '#2563eb') : (monitorMembersObj[m.sender] ? monitorMembersObj[m.sender].color : '#2563eb'));
          return `
            <div style="background:#ffffff; padding:8px 12px; border-radius:8px; border:1px solid #e2e8f0; border-left:3px solid ${color}; box-shadow:0 1px 2px rgba(0,0,0,0.02);">
              <div style="display:flex; justify-content:space-between; margin-bottom:3px;">
                <b style="color:${color}; font-size:12px;">${escapeHtml(senderName)}</b>
                <span style="color:#94a3b8; font-size:10px;">${escapeHtml(formatChatDisplayTime(m._timeMs || m.timestamp))}</span>
              </div>
              <div style="color:#0f172a; line-height:1.5;">${escapeHtml(m.text || '')}</div>
            </div>
          `;
        }).join('') : `
          <div style="text-align:center; padding:40px 16px; color:#94a3b8; font-size:12px;">⏳ 本小组暂无研讨发言记录</div>
        `;
        if (isAtBottom) chatStream.scrollTop = chatStream.scrollHeight;
        else chatStream.scrollTop = oldScroll;
      }

      return; // Fast in-place update completed without reloading Etherpad!
    }

    // ⚡ 教师端自动轻量轮询：自调度循环，杜绝并发拉取与 interval 重注册竞态
    const teacherPullAndRefresh = async () => {
      const curU = authManager.getCurrentUser();
      if (!curU || curU.role !== 'teacher') return; // 非教师即停止轮询
      if (document.querySelector('.modal-overlay')) {
        window._teacherPortalSyncTimer = setTimeout(teacherPullAndRefresh, 3000);
        return;
      }

      if (state.teacherActiveTab === 'view_monitoring' && window.app && window.app.cloudSyncEngine) {
        const currentCId = state.activeClassId || activeClass.id || null;
        let activeTaskId = state.activeTaskId || (currentClassTasks[0] ? currentClassTasks[0].id : `task_${currentCId}_default`);
        if (!activeTaskId || activeTaskId === 'task_default') {
          activeTaskId = `task_${currentCId}_default`;
        }
        const currentGId = state.activeMonitorGroupId || activeMonitorGId;
        window.app.cloudSyncEngine.groupId = currentGId;
        window.app.cloudSyncEngine.taskId = activeTaskId;
        window.app.cloudSyncEngine.effectiveClassId = currentCId;
        window.app.cloudSyncEngine.updateScopeKeys();

        const getPanoDigest = (p) => {
          if (!p || typeof p !== 'object') return '';
          return Object.entries(p).map(([gid, d]) => `${gid}:${d.currentStage || 'stage1'}:${d.onlineCount || 0}:${d.totalMembers || 0}:${d.isFinalSubmitted ? 1 : 0}:${(d.activeLocks || []).length}:${(d.chatLogs?.stage1 || []).length}:${(d.chatLogs?.stage2 || []).length}:${(d.chatLogs?.stage3 || []).length}:${d.stage1?.mergedTitle || ''}:${(d.stage1?.proposals || []).length}`).join('|');
        };

        const oldFingerprint = JSON.stringify({
          cStage: state.currentStage,
          s1Len: (state.stage1?.proposals || []).length,
          s1Title: state.stage1?.mergedTitle,
          s1Votes: Object.keys(state.stage1?.votes || {}).length,
          s1Conf: Object.keys(state.stage1?.contract?.confirmedMembers || {}).length,
          s2Len: (state.stage2?.unifiedContent || '').length,
          s3Len: (state.stage3?.feedbackItems || []).length,
          chat1: (state.chatLogs?.stage1 || []).length,
          chat2: (state.chatLogs?.stage2 || []).length,
          chat3: (state.chatLogs?.stage3 || []).length,
          panorama: getPanoDigest(state.monitorPanorama)
        });

        try {
          // 📝 针对阶段二/三，从 Etherpad 提取最新正文镜像（实时单源真值，支持 Hash 增量早退）
          const padName = `jizhi_${activeTaskId}_${currentGId}`;
          const lastEpHash = state._lastEpHash || '';
          const epRes = await fetch(`sync.php?action=get_pad_html&padId=${padName}&clientHash=${encodeURIComponent(lastEpHash)}`).then(r => r.json()).catch(() => null);
          if (epRes && epRes.hash) state._lastEpHash = epRes.hash;
          let latestPadText = '';
          if (epRes && epRes.success && !epRes.unchanged && (epRes.html || epRes.text)) {
            latestPadText = epRes.html || epRes.text;
            if (!state.stage2) state.stage2 = {};
            state.stage2.unifiedContent = latestPadText;
          } else if (state.stage2?.unifiedContent) {
            latestPadText = state.stage2.unifiedContent;
          }

          if (!state._readOnlyPadMap) state._readOnlyPadMap = {};
          if (!state._readOnlyPadMap[padName]) {
            fetch(`sync.php?action=get_readonly_pad_id&padId=${padName}`).then(r => r.json()).then(res => {
              if (res && res.success && res.readOnlyID) {
                state._readOnlyPadMap[padName] = res.readOnlyID;
                const f2 = document.querySelector('#teacher-stage2-etherpad-frame');
                if (f2 && !f2.src.includes(res.readOnlyID)) {
                  f2.src = `/p/${res.readOnlyID}?userName=${encodeURIComponent('教师监控')}&userColor=%237c3aed&showControls=false&showChat=false&showLineNumbers=true&lang=zh-hans`;
                }
                const f3 = document.querySelector('#teacher-stage3-etherpad-frame');
                if (f3 && !f3.src.includes(res.readOnlyID)) {
                  f3.src = `/p/${res.readOnlyID}?userName=${encodeURIComponent('教师监控')}&userColor=%237c3aed&showControls=false&showChat=false&showLineNumbers=true&lang=zh-hans`;
                }
              }
            }).catch(() => {});
          }

          const curT = authManager.getCurrentUser();
          const tToken = (curT && (curT.activeSessionId || curT.token)) || '';
          const tId = (curT && (curT.id || curT.username)) || '';
          const lastHash = state._lastMonitorHash || '';
          const panRes = await fetch(`sync.php?action=get_teacher_monitor_all_groups&activeGroupId=${encodeURIComponent(currentGId)}&taskId=${encodeURIComponent(activeTaskId)}&classId=${encodeURIComponent(currentCId)}&userId=${encodeURIComponent(tId)}&token=${encodeURIComponent(tToken)}&clientHash=${encodeURIComponent(lastHash)}`).then(r => r.json()).catch(() => null);
          if (panRes && panRes.success && panRes.groups) {
            state.monitorPanorama = panRes.groups;
            if (panRes.hash) state._lastMonitorHash = panRes.hash;

            // 🎯 核心修复：以 Etherpad 权威最新正文为主，杜绝被旧版全量快照覆盖导致字数在 5000 与 8000 间反复跳动！
            const currentGroupData = panRes.groups[currentGId];
            if (currentGroupData) {
              state.stage1 = currentGroupData.stage1 || { proposals: [], votes: {}, hasVoted: {}, contract: {} };
              const finalUnifiedText = latestPadText || state.stage2?.unifiedContent || currentGroupData.stage2?.unifiedContent || '';
              state.stage2 = {
                ...(currentGroupData.stage2 || {}),
                ...(state.stage2 || {}),
                unifiedContent: finalUnifiedText
              };
              state.stage3 = currentGroupData.stage3 || { feedbackItems: [] };
              state.chatLogs = currentGroupData.chatLogs || { stage1: [], stage2: [], stage3: [] };
              state.currentStage = currentGroupData.currentStage || 'stage1';
              state.isFinalSubmitted = !!currentGroupData.isFinalSubmitted;
            }
          }
        } catch (e) {
          console.warn('[TeacherMonitor] 监控拉取警告:', e);
        }

        const newFingerprint = JSON.stringify({
          cStage: state.currentStage,
          s1Len: (state.stage1?.proposals || []).length,
          s1Title: state.stage1?.mergedTitle,
          s1Votes: Object.keys(state.stage1?.votes || {}).length,
          s1Conf: Object.keys(state.stage1?.contract?.confirmedMembers || {}).length,
          s2Conf: Object.keys(state.stage2?.confirmedMembers || {}).length,
          s2DraftConf: !!state.stage2?.isDraftConfirmed,
          s3Len: (state.stage3?.feedbackItems || []).length,
          chat1: (state.chatLogs?.stage1 || []).length,
          chat2: (state.chatLogs?.stage2 || []).length,
          chat3: (state.chatLogs?.stage3 || []).length,
          panorama: getPanoDigest(state.monitorPanorama)
        });

        if (oldFingerprint !== newFingerprint) {
          const layout = container.querySelector('.teacher-portal-layout');
          const curScroll = layout ? layout.scrollTop : 0;
          state._teacherScrollTop = curScroll;
          renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
          const nextLayout = container.querySelector('.teacher-portal-layout');
          if (nextLayout) nextLayout.scrollTop = curScroll;
          return; // 重绘后自动重新调度
        }
      }

      if (authManager && authManager.pullGlobalMeta) {
        try {
          const oldAnnsJson = localStorage.getItem(STORAGE_KEY_ANNOUNCEMENTS) || '[]';
          await authManager.pullGlobalMeta();
          const newAnnsJson = localStorage.getItem(STORAGE_KEY_ANNOUNCEMENTS) || '[]';
          if (oldAnnsJson !== newAnnsJson) {
            // 🛡️ 若教师正打开弹窗或编辑中，绝不全量重刷页面造成闪烁与输入回退
            if (document.querySelector('.modal-overlay') || document.querySelector('#modal-extend-deadline')) {
              // 延缓至弹窗关闭后再刷
            } else {
              const layout = container.querySelector('.teacher-portal-layout');
              const curScroll = layout ? layout.scrollTop : 0;
              state._teacherScrollTop = curScroll;
              renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
              const nextLayout = container.querySelector('.teacher-portal-layout');
              if (nextLayout) nextLayout.scrollTop = curScroll;
              return; // 重渲染会重建循环
            }
          }
        } catch (e) {}
      }

      const isTeacherIdle = () => document.hidden || (Date.now() - (window._lastTeacherActivity || Date.now()) > 60000);
      const tInterval = isTeacherIdle() ? 15000 : 1800;
      window._teacherPortalSyncTimer = setTimeout(teacherPullAndRefresh, tInterval);
    };
    if (window._teacherPortalSyncTimer) clearTimeout(window._teacherPortalSyncTimer);

    window._lastTeacherActivity = Date.now();
    const markTeacherActive = () => {
      const wasIdle = (Date.now() - window._lastTeacherActivity > 60000);
      window._lastTeacherActivity = Date.now();
      if (wasIdle && state.teacherActiveTab === 'view_monitoring') {
        teacherPullAndRefresh();
      }
    };
    ['mousemove', 'keydown', 'touchstart', 'scroll', 'click'].forEach(evt => {
      window.addEventListener(evt, markTeacherActive, { passive: true });
    });

    if (!window._teacherWheelHandlerAttached) {
      window._teacherWheelHandlerAttached = true;
      window.addEventListener('wheel', (e) => {
        const layout = document.getElementById('teacher-portal-layout');
        if (!layout) return;
        const target = e.target;
        if (target && target.closest) {
          if (target.closest('#teacher-unified-chat-stream')) return;
          if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.tagName === 'SELECT') return;
        }
        if (layout.scrollHeight > layout.clientHeight) {
          layout.scrollTop += e.deltaY;
        }
      }, { passive: true });
    }

    const tInitInterval = (document.hidden ? 15000 : 1800);
    window._teacherPortalSyncTimer = setTimeout(teacherPullAndRefresh, tInitInterval);

    container.innerHTML = `
      <div class="teacher-portal-layout" id="teacher-portal-layout" style="height:100vh; overflow-y:auto !important; -webkit-overflow-scrolling:touch; background:#f0f4f9; padding:0; display:flex; flex-direction:column;">
        <!-- 全屏头部导航 -->
        <header class="teacher-header" style="padding:16px 32px; background:#ffffff; border-bottom:1px solid #e2e8f0; width:100%; flex-shrink:0; box-shadow:0 1px 3px rgba(15,23,42,0.04); display:flex; justify-content:space-between; align-items:center;">
          <div class="brand-section" style="display:flex; align-items:center; gap:14px;">
            <div class="brand-logo" style="font-size:22px; font-weight:800; background:linear-gradient(135deg, #1e40af, #2563eb); -webkit-background-clip:text; -webkit-text-fill-color:transparent;">集智 JIZHI 教师端</div>
          </div>
          <div class="teacher-info" style="display:flex; align-items:center; gap:14px;">
            <span style="font-size:13.5px; color:#334155;">当前班级: <b style="color:#2563eb;">${activeClass.name}</b></span>
            <span style="font-size:13.5px; color:#334155;">教师: <b>${currentUser.name}</b></span>
            <button id="btn-teacher-change-pwd" style="background:#f0fdf4; border:1px solid #bbf7d0; color:#16a34a; padding:6px 14px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:6px;" title="修改登录密码">
              <span>🔑 修改密码</span>
            </button>
            <button id="btn-logout" class="header-icon-btn logout" style="background:#fef2f2; color:#dc2626; border:1px solid #fecaca; padding:8px 16px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer;">🚪 退出登录</button>
          </div>
        </header>

        <!-- 三大界面导航卡片 -->
        <div style="padding:16px 32px 0 32px; background:#f0f4f9; width:100%; flex-shrink:0;">
          <div style="display:flex; gap:12px; width:100%; background:#ffffff; padding:6px; border-radius:14px; border:1px solid #e2e8f0; box-shadow:0 2px 8px rgba(15,23,42,0.04);">
            <button class="teacher-tab-nav ${activeTab === 'view_architecture' ? 'active' : ''}" data-tab="view_architecture" style="flex:1; padding:12px; border-radius:10px; font-size:14px; font-weight:800; cursor:pointer; border:none; color:${activeTab === 'view_architecture' ? 'white' : '#475569'}; background:${activeTab === 'view_architecture' ? 'linear-gradient(135deg, #1d4ed8, #2563eb)' : '#f8fafc'}; transition:all 0.2s ease;">
              🛠️ 基础架构管理
            </button>
            <button class="teacher-tab-nav ${activeTab === 'view_publishing' ? 'active' : ''}" data-tab="view_publishing" style="flex:1; padding:12px; border-radius:10px; font-size:14px; font-weight:800; cursor:pointer; border:none; color:${activeTab === 'view_publishing' ? 'white' : '#475569'}; background:${activeTab === 'view_publishing' ? 'linear-gradient(135deg, #1d4ed8, #2563eb)' : '#f8fafc'}; transition:all 0.2s ease;">
              📢 任务与通知发布
            </button>
            <button class="teacher-tab-nav ${activeTab === 'view_monitoring' ? 'active' : ''}" data-tab="view_monitoring" style="flex:1; padding:12px; border-radius:10px; font-size:14px; font-weight:800; cursor:pointer; border:none; color:${activeTab === 'view_monitoring' ? 'white' : '#475569'}; background:${activeTab === 'view_monitoring' ? 'linear-gradient(135deg, #1d4ed8, #2563eb)' : '#f8fafc'}; transition:all 0.2s ease;">
              🖥️ 学生实操实时监控
            </button>
          </div>
        </div>

        <main style="flex:1; padding:20px 32px 40px 32px; width:100%; overflow-y:visible;">

          ${activeTab === 'view_architecture' ? `
            <div style="display:flex; flex-direction:column; gap:20px; width:100%;">

              <div class="card" style="border-top:4px solid #2563eb; width:100%; padding:24px;">
                <div class="card-title" style="margin-bottom:16px;">
                  <span style="font-size:17px; font-weight:800; color:#0f172a;">🎓 教学班级管理 (${classes.length} 个班级)</span>
                  <button id="btn-v1-create-class" class="teacher-action-btn" style="background:linear-gradient(135deg, #1d4ed8, #2563eb); border:none; color:white; padding:8px 18px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; box-shadow:0 2px 8px rgba(37,99,235,0.25);">+ 创建全新教学班</button>
                </div>
                <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(360px, 1fr)); gap:16px;">
                  ${classes.map(c => {
                    const isSelected = c.id === activeClass.id;
                    const cStds = authManager.getClassStudents(c.id);
                    return `
                      <div style="background:${isSelected ? '#eff6ff' : '#ffffff'}; border:1.5px solid ${isSelected ? '#3b82f6' : '#e2e8f0'}; border-radius:12px; padding:18px 20px; display:flex; justify-content:space-between; align-items:center; box-shadow:0 1px 3px rgba(15,23,42,0.03);">
                        <div style="min-width:0; padding-right:12px;">
                          <div style="font-size:16px; font-weight:800; color:${isSelected ? '#1d4ed8' : '#0f172a'}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">🏫 ${c.name}</div>
                          <div style="font-size:12.5px; color:#64748b; margin-top:5px;">学生: <b>${cStds.length}</b> 人 | 小组: <b>${(c.groups || []).length}</b> 个</div>
                        </div>
                        <div style="display:flex; gap:8px; align-items:center; flex-shrink:0;">
                          <button class="btn-select-class" data-id="${c.id}" style="background:${isSelected ? '#ecfdf5' : '#2563eb'}; border:1px solid ${isSelected ? '#a7f3d0' : 'transparent'}; color:${isSelected ? '#059669' : 'white'}; padding:7px 14px; border-radius:8px; font-size:12.5px; font-weight:700; cursor:pointer; white-space:nowrap; display:inline-flex; align-items:center; gap:4px;">
                            ${isSelected ? '✅ 当前主班' : '切换'}
                          </button>
                          ${classes.length > 1 ? `
                            <button class="btn-delete-class" data-id="${c.id}" data-name="${c.name}" style="background:#fef2f2; border:1px solid #fecaca; color:#dc2626; padding:7px 10px; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer; flex-shrink:0;" title="删除此教学班级">
                              🗑️
                            </button>
                          ` : ''}
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>

              <div class="card" style="border-top:4px solid #2563eb; width:100%; padding:24px;">
                <div class="card-title" style="margin-bottom:16px;">
                  <span style="font-size:17px; font-weight:800; color:#0f172a;">👨‍🎓 学生账号管理 (当前班级: ${activeClass.name})</span>
                  <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                    <button id="btn-v1-add-student" class="teacher-action-btn" style="background:linear-gradient(135deg, #1d4ed8, #2563eb); border:none; color:white; padding:8px 16px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; box-shadow:0 2px 8px rgba(37,99,235,0.25);">+ 单条创建学生账号</button>
                    <button id="btn-v1-enroll-existing-student" class="teacher-action-btn" style="background:#eff6ff; border:1.5px solid #bfdbfe; color:#1d4ed8; padding:8px 16px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer;">👥 加入已有学生到班级</button>
                    <button id="btn-v1-import-file" class="teacher-action-btn" style="background:linear-gradient(135deg, #1d4ed8, #2563eb); border:none; color:white; padding:8px 16px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; box-shadow:0 2px 8px rgba(37,99,235,0.25);">
                      📥 上传 XLSX / CSV 文件导入
                    </button>
                    ${classStudents.length > 0 ? `
                      <button id="btn-clear-class-students" style="background:#fef2f2; border:1px solid #fecaca; color:#dc2626; padding:8px 14px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer;">
                        🗑️ 一键清空本班学生
                      </button>
                    ` : ''}
                  </div>
                </div>
                <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 16px; margin-bottom:14px; font-size:13px; color:#334155; display:flex; justify-content:space-between; align-items:center;">
                  <div>💡 <b>密码说明：</b> 创建学生时可指定自定义密码（留空统一定为 <code style="color:#059669; font-weight:700;">123</code>）。建立后直接放入班级学生池。</div>
                  <span style="color:#2563eb; font-weight:800; font-size:13.5px;">池内学生: ${classStudents.length} 人</span>
                </div>
                <div style="border:1px solid #e2e8f0; border-radius:10px; overflow:hidden; background:#ffffff;">
                  <table class="monitor-table" style="font-size:13px;">
                    <thead><tr><th>序号</th><th>姓名</th><th>学号</th><th>当前归属小组</th><th>密码状态</th><th>操作</th></tr></thead>
                    <tbody>
                      ${classStudents.length === 0 ? '<tr><td colspan="6" style="text-align:center; color:#64748b; padding:24px;">当前班级暂无学生账号，请点击右上角按钮创建或导入！</td></tr>' : ''}
                      ${(() => {
                        // 同名提示：本班级内姓名重复的学生加一个视觉标记，方便老师区分，绝不自动合并
                        const _nameBuckets = {};
                        classStudents.forEach(s => { const _n = (s.name || '').trim(); if (!_n) return; (_nameBuckets[_n] = _nameBuckets[_n] || []).push(s); });
                        const _escAttr = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                        return classStudents.map((s, idx) => {
                        const grp = (activeClass.groups || []).find(g => g.members && (g.members.includes(s.id) || g.members.includes(s.studentCode) || (typeof g.members[0] === 'object' && g.members.some(m => m.id === s.id || m.studentCode === s.studentCode))));
                        const stdAcc = s.studentCode || s.username || s.id;
                        const _dupPeers = (_nameBuckets[(s.name || '').trim()] || []).filter(x => x !== s);
                        const _dupBadge = _dupPeers.length > 0 ? `<span title="${_escAttr('⚠️ 有同名同学：' + _dupPeers.map(x => x.name + '（' + (x.studentCode || x.username || x.id) + '）').join(' / '))}" style="margin-left:6px; background:#fef3c7; border:1px solid #fcd34d; color:#b45309; padding:1px 7px; border-radius:999px; font-size:11px; font-weight:700; cursor:help;">⚠️ 同名 ${_dupPeers.length + 1} 人</span>` : '';
                        return `
                          <tr>
                            <td style="color:#94a3b8; font-weight:700;">${idx + 1}</td>
                            <td><b>${s.avatar || '👤'} ${s.name}</b>${_dupBadge}</td>
                            <td><span style="color:#2563eb; font-family:monospace; font-weight:700;">${stdAcc}</span></td>
                            <td>${grp ? `<span style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; padding:2px 8px; border-radius:8px; font-size:12px; font-weight:700;">${grp.name}</span>` : '<span style="color:#94a3b8;">⏳ 待划分小组</span>'}</td>
                            <td>${(!s.password || s.password === '123') ? '<span style="color:#059669; font-family:monospace; font-weight:700;">初始 123</span>' : '<span style="color:#7c3aed; font-family:monospace; font-weight:700;">已修改密码</span>'}</td>
                            <td>
                              <div style="display:flex; gap:6px; align-items:center;">
                                <button class="reset-student-pwd-btn" data-account="${stdAcc}" data-name="${s.name}" style="background:#eff6ff; border:1px solid #bfdbfe; color:#2563eb; padding:4px 10px; border-radius:6px; font-size:12px; cursor:pointer; font-weight:700;" title="将此学生登录密码重置为 123">
                                  🔑 重置为123
                                </button>
                                <button class="delete-student-btn" data-id="${s.id}" style="background:#fef2f2; border:1px solid #fecaca; color:#dc2626; padding:4px 10px; border-radius:6px; font-size:12px; cursor:pointer; font-weight:700;" title="从本班移除">
                                  移除
                                </button>
                              </div>
                            </td>
                          </tr>
                        `;
                      }).join('');})()}
                    </tbody>
                  </table>
                </div>
              </div>

              <div class="card" style="border-top:4px solid #2563eb; width:100%; padding:24px;">
                <div class="card-title" style="margin-bottom:16px;">
                  <span style="font-size:17px; font-weight:800; color:#0f172a;">👥 小组划分 (当前班级: ${activeClass.name})</span>
                  <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                    <button id="btn-v1-create-group" class="teacher-action-btn" style="background:linear-gradient(135deg, #1d4ed8, #2563eb); border:none; color:white; padding:8px 16px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; box-shadow:0 2px 8px rgba(37,99,235,0.25);">+ 新建小组</button>

                    <div style="display:flex; align-items:center; gap:6px; background:#f0fdf4; border:1px solid #bbf7d0; padding:4px 10px; border-radius:8px;">
                      <span style="font-size:12.5px; font-weight:700; color:#166534;">每组</span>
                      <select id="sel-random-group-size" style="padding:4px 8px; border:1px solid #86efac; border-radius:6px; font-size:13px; font-weight:800; color:#15803d; background:#ffffff; cursor:pointer;">
                        <option value="2">2 人</option>
                        <option value="3" selected>3 人</option>
                        <option value="4">4 人</option>
                        <option value="5">5 人</option>
                        <option value="6">6 人</option>
                      </select>
                      <button id="btn-v1-random-groups" class="teacher-action-btn" style="background:linear-gradient(135deg, #059669, #10b981); border:none; color:white; padding:6px 14px; border-radius:6px; font-size:12.5px; font-weight:700; cursor:pointer; box-shadow:0 2px 6px rgba(16,185,129,0.25);" title="按所选人数自动随机划分班级内全部学生">🎲 一键随机分组</button>
                    </div>

                    <button id="btn-v1-dissolve-all-groups" class="teacher-action-btn" style="background:linear-gradient(135deg, #dc2626, #b91c1c); border:none; color:white; padding:8px 16px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; box-shadow:0 2px 8px rgba(220,38,38,0.25);">💥 一键解散所有小组</button>
                  </div>
                </div>
                <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 16px; margin-bottom:14px; font-size:13px; color:#334155;">
                  💡 <b>班级互斥划分规则：</b>已归属于本班级其他小组的学生会自动隐藏，避免重复挂组。跨班级独立计算。
                </div>
                <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(360px, 1fr)); gap:16px;">
                  ${(() => {
                    const validGroups = (activeClass.groups || []).filter(grp => {
                      const groupMembers = classStudents.filter(s => (grp.members || []).some(m => {
                        const mId = (typeof m === 'object' && m !== null) ? (m.id || m.userId || m.studentCode) : m;
                        return mId === s.id || (mId && s.studentCode && mId.toString() === s.studentCode.toString());
                      }));
                      return groupMembers.length > 0;
                    });

                    // 自动规整命名：按顺序编号
                    validGroups.forEach((g, idx) => {
                      g.name = `第 ${idx + 1} 协作小组`;
                    });

                    if (validGroups.length !== (activeClass.groups || []).length) {
                      activeClass.groups = validGroups;
                      localStorage.setItem(STORAGE_KEY_CLASSES, JSON.stringify(classes));
                      // 🛡️ 延迟推送，避免渲染期间触发网络写操作
                      setTimeout(() => authManager.pushGlobalMeta(), 100);
                    }

                    if (validGroups.length === 0) {
                      return '<div style="color:#64748b; padding:20px; font-size:14px;">当前班级暂无小组。</div>';
                    }

                    return validGroups.map(grp => {
                      const groupMembers = classStudents.filter(s => (grp.members || []).some(m => {
                        const mId = (typeof m === 'object' && m !== null) ? (m.id || m.userId || m.studentCode) : m;
                        return mId === s.id || (mId && s.studentCode && mId.toString() === s.studentCode.toString());
                      }));
                      return `
                        <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:18px; box-shadow:0 1px 3px rgba(15,23,42,0.03);">
                          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                            <span style="font-size:15.5px; font-weight:800; color:#1d4ed8;">👥 ${grp.name} (${groupMembers.length}人)</span>
                            <div style="display:flex; gap:8px;">
                              <button class="btn-edit-group-members" data-gid="${grp.id}" style="background:#eff6ff; border:1px solid #bfdbfe; color:#1d4ed8; padding:6px 12px; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer;">⚙️ 勾选组员</button>
                              <button class="btn-delete-group" data-gid="${grp.id}" style="background:#fef2f2; border:1px solid #fecaca; color:#dc2626; padding:6px 10px; border-radius:6px; font-size:12px; cursor:pointer; font-weight:700;">✕ 解散</button>
                            </div>
                          </div>
                          <div style="display:flex; flex-wrap:wrap; gap:8px; font-size:13px;">
                            ${groupMembers.length === 0 ? '<span style="color:#94a3b8; font-size:12px;">⚠️ 暂未勾选成员</span>' : ''}
                            ${groupMembers.map(m => `
                              <span style="background:#eff6ff; border:1px solid #bfdbfe; color:#1d4ed8; padding:4px 10px; border-radius:6px; font-weight:600;">
                                ${m.avatar || '👤'} ${m.name}
                              </span>
                            `).join('')}
                          </div>
                        </div>
                      `;
                    }).join('');
                  })()}
                </div>
              </div>

            </div>
          ` : ''}

          ${activeTab === 'view_publishing' ? (() => {
            const currentClassTasks = tasks.filter(t => !t.classId || t.classId === 'all' || t.classId === activeClass.id || (t.className && t.className === activeClass.name) || (Array.isArray(t.targetClassIds) && (t.targetClassIds.includes('all') || t.targetClassIds.includes(activeClass.id))));
            const currentClassAnnouncements = announcements.filter(a => (!a.classId || a.classId === 'all' || a.classId === activeClass.id || (a.className && a.className === activeClass.name) || (Array.isArray(a.targetClassIds) && (a.targetClassIds.includes('all') || a.targetClassIds.includes(activeClass.id)))) && !a.isSystemAction && !a.isExtension && !a.title?.includes('延期') && !a.title?.includes('延长至'));
            const currentClassPapers = refPapers.filter(p => (!p.classId || p.classId === 'all' || p.classId === activeClass.id || (p.className && p.className === activeClass.name) || (Array.isArray(p.targetClassIds) && (p.targetClassIds.includes('all') || p.targetClassIds.includes(activeClass.id)))));

            const surveysList = authManager.getSurveysList();
            const currentSelectedSurveyUrl = authManager.getSurveyUrl(activeClass.id, currentClassTasks[0] ? currentClassTasks[0].id : 'task_default');

            return `
            <div style="display:flex; flex-direction:column; gap:20px; width:100%;">

              <!-- 1. 课程协作写作任务集中发布中心 (最开始) -->
              <div class="card" style="border-top:4px solid #2563eb; width:100%; padding:24px;">
                <div class="card-title" style="margin-bottom:16px;">
                  <span style="font-size:17px; font-weight:800; color:#0f172a;">📌 课程写作任务发布 (${currentClassTasks.length} 项 · 当前班级: ${activeClass.name})</span>
                  <button id="btn-v2-open-task-modal" class="teacher-action-btn indigo" style="background:#2563eb; padding:8px 18px; font-size:13px; font-weight:700;">+ 发布全新写作任务</button>
                </div>
                <div style="display:flex; flex-direction:column; gap:14px;">
                  ${currentClassTasks.length === 0 ? `
                    <div style="text-align:center; padding:32px; background:#f8fafc; border-radius:10px; border:2px dashed #cbd5e1;">
                      <div style="font-size:32px; margin-bottom:8px;">📌</div>
                      <div style="font-size:15px; font-weight:800; color:#0f172a;">当前班级暂无发布的写作任务</div>
                      <div style="font-size:12.5px; color:#64748b; margin-top:4px;">点击右上角【+ 发布全新写作任务】为本班级创建独立任务！</div>
                    </div>
                  ` : currentClassTasks.map((t, tIdx) => {
                    const isLatest = tIdx === 0;
                    const taskSeqNum = currentClassTasks.length - tIdx;
                    const isExpired = isTaskExpired(t);
                    return `
                    <div style="background:#ffffff; border:1.5px solid ${isExpired ? '#fca5a5' : '#e2e8f0'}; padding:18px; border-radius:12px; box-shadow:0 1px 3px rgba(15,23,42,0.03);">
                      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                          <span style="background:${isExpired ? 'linear-gradient(135deg, #ef4444, #dc2626)' : 'linear-gradient(135deg, #1d4ed8, #2563eb)'}; color:#ffffff; padding:3px 10px; border-radius:8px; font-size:12px; font-weight:800;">任务 ${taskSeqNum}${isLatest ? ' (最新)' : ''}</span>
                          <span style="font-size:16px; font-weight:800; color:#1e40af;">📌 ${t.title}</span>
                          <span style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; padding:2px 8px; border-radius:8px; font-size:11.5px; font-weight:700;">受众班级: ${t.className}</span>
                          ${isExpired ? `
                            <span style="background:#fef2f2; color:#dc2626; border:1px solid #fecaca; padding:2px 8px; border-radius:8px; font-size:11.5px; font-weight:800;">🛑 已截止 · 正文只读</span>
                          ` : `
                            <span style="background:#ecfdf5; color:#059669; border:1px solid #a7f3d0; padding:2px 8px; border-radius:8px; font-size:11.5px; font-weight:700;">🟢 开放撰写中</span>
                          `}
                        </div>
                        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                          <span style="font-size:12px; color:#64748b; margin-right:4px;">🕒 发布时间: <b>${formatStandardDateDash(t.createdAt || t.startTime) || '刚刚'}</b></span>
                          <button class="btn-extend-task-deadline" data-id="${t.id}" data-title="${t.title}" data-deadline="${t.deadline || ''}" data-duration="${t.durationMinutes || 150}" style="background:linear-gradient(135deg, #d97706, #f59e0b); border:none; color:white; padding:5px 12px; border-radius:6px; font-size:12.5px; font-weight:700; cursor:pointer; box-shadow:0 2px 6px rgba(217,119,6,0.25);" title="为该任务快捷延长截止时间">
                            ⏳ 延长时间
                          </button>
                          <button class="btn-edit-task" data-id="${t.id}" data-title="${t.title}" data-duration="${t.durationMinutes || 150}" data-instructions="${encodeURIComponent(t.instructions || '')}" data-start="${t.startTime || ''}" data-deadline="${t.deadline || ''}" style="background:#eff6ff; border:1px solid #bfdbfe; color:#2563eb; padding:5px 12px; border-radius:6px; font-size:12.5px; font-weight:700; cursor:pointer;" title="编辑修改此写作任务">
                            ✏️ 修改任务
                          </button>
                          <button class="btn-delete-task" data-id="${t.id}" data-title="${t.title}" style="background:#fef2f2; border:1px solid #fecaca; color:#dc2626; padding:5px 12px; border-radius:6px; font-size:12.5px; font-weight:700; cursor:pointer;" title="删除此写作任务">
                            🗑️ 删除任务
                          </button>
                        </div>
                      </div>
                      <div style="font-size:13px; color:#334155; margin:10px 0; display:flex; gap:20px; background:${isExpired ? '#fef2f2' : '#f8fafc'}; padding:10px 16px; border-radius:8px; border-left:4px solid ${isExpired ? '#dc2626' : '#2563eb'};">
                        <span>📅 <b>开始时间:</b> <span style="color:#2563eb; font-weight:700;">${formatStandardDateDash(t.startTime) || '即时开启'}</span></span>
                        <span>⌛ <b>截止时间:</b> <span style="color:#dc2626; font-weight:800;">${formatStandardDateDash(t.deadline) || '无硬性限制'}</span> ${isExpired ? '<b style="color:#dc2626;">(已过截止时间)</b>' : ''}</span>
                        <span>⏱️ <b>任务时长:</b> ${formatDurationHuman(t.durationMinutes)}</span>
                      </div>
                    </div>
                    `;
                  }).join('')}
                </div>
              </div>

              <!-- 2. 问卷链接配置 (第二个) -->
              <div class="card" style="border-top:4px solid #2563eb; width:100%; padding:24px;">
                <div class="card-title" style="margin-bottom:16px;">
                  <span style="font-size:17px; font-weight:800; color:#0f172a;">📋 课程评估问卷链接配置 (当前主班: ${activeClass.name})</span>
                </div>

                <div style="display:flex; flex-direction:column; gap:14px; background:#f8fafc; padding:18px; border-radius:12px; border:1px solid #e2e8f0;">
                  <div style="display:flex; gap:16px; flex-wrap:wrap; align-items:center;">
                    <div style="display:flex; gap:8px; align-items:center;">
                      <span style="font-size:13px; font-weight:700; color:#334155; white-space:nowrap;">🏫 目标班级:</span>
                      <select id="sel-survey-class" class="teacher-input fancy" style="min-width:220px; font-weight:700;">
                        ${classes.map(c => `<option value="${c.id}" ${c.id === activeClass.id ? 'selected' : ''}>🏫 ${c.name}</option>`).join('')}
                      </select>
                    </div>

                    <div style="display:flex; gap:8px; align-items:center;">
                      <span style="font-size:13px; font-weight:700; color:#334155; white-space:nowrap;">📌 绑定任务:</span>
                      <select id="sel-survey-task" class="teacher-input fancy" style="min-width:220px; font-weight:700;">
                        ${currentClassTasks.map((t, idx) => `<option value="${t.id}" ${idx === 0 ? 'selected' : ''}>📌 ${t.title}</option>`).join('')}
                      </select>
                    </div>
                  </div>

                  <div style="display:flex; gap:10px; align-items:center;">
                    <input type="text" id="input-survey-url" class="teacher-input fancy" placeholder="请输入问卷星或第三方问卷网址 (如: https://www.wjx.cn/vm/xxxx.aspx)" value="${currentSelectedSurveyUrl || ''}" style="flex:1;">
                    <button id="btn-save-survey-url" class="teacher-action-btn" style="background:linear-gradient(135deg, #1d4ed8, #2563eb); border:none; color:white; padding:8px 20px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; white-space:nowrap; box-shadow:0 2px 8px rgba(37,99,235,0.25);">
                      💾 保存问卷链接
                    </button>
                  </div>
                </div>

                <!-- 📊 当前班级已生效的问卷绑定总览 -->
                <div style="margin-top:16px;">
                  ${(() => {
                    const currentClassSurveys = surveysList.filter(s => s.classId === activeClass.id);
                    return `
                      <div style="font-size:13px; font-weight:800; color:#334155; margin-bottom:10px;">
                        📊 【${activeClass.name}】已绑定问卷清单 (${currentClassSurveys.length} 项已配置):
                      </div>
                      ${currentClassSurveys.length === 0 ? `
                        <div style="background:#ffffff; border:1px dashed #cbd5e1; border-radius:8px; padding:16px; font-size:13px; color:#94a3b8; text-align:center;">
                          【${activeClass.name}】暂无配置的自定义问卷链接（学生提交终稿时将使用默认问卷）
                        </div>
                      ` : `
                        <div style="display:flex; flex-direction:column; gap:8px;">
                          ${currentClassSurveys.map((s, sIdx) => {
                            const surveySeqNum = currentClassSurveys.length - sIdx;
                            const isLatestSurvey = sIdx === 0;
                            return `
                              <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center; gap:12px; box-shadow:0 1px 3px rgba(15,23,42,0.02);">
                                <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                                  <span style="background:linear-gradient(135deg, #1d4ed8, #2563eb); color:#ffffff; padding:2px 8px; border-radius:6px; font-size:11.5px; font-weight:800;">问卷 ${surveySeqNum}${isLatestSurvey ? ' (最新)' : ''}</span>
                                  <span style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; padding:2px 8px; border-radius:6px; font-size:12px; font-weight:700;">🏫 ${s.className || '指定班级'}</span>
                                  <span style="background:#f5f3ff; color:#7c3aed; border:1px solid #ddd6fe; padding:2px 8px; border-radius:6px; font-size:12px; font-weight:700;">📌 ${s.taskTitle || '指定写作任务'}</span>
                                  <a href="${s.url}" target="_blank" style="font-size:12px; color:#2563eb; text-decoration:none; font-family:monospace; max-width:320px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">🔗 ${s.url}</a>
                                </div>
                                <div style="display:flex; gap:8px;">
                                  <button class="btn-quick-fill-survey" data-id="${s.id}" data-cid="${s.classId}" data-tid="${s.taskId}" data-url="${encodeURIComponent(s.url)}" style="background:#f8fafc; border:1px solid #cbd5e1; color:#334155; padding:4px 10px; border-radius:6px; font-size:11.5px; font-weight:700; cursor:pointer;">
                                    📝 载入修改
                                  </button>
                                  <button class="btn-delete-survey-item" data-id="${s.id}" style="background:#fef2f2; border:1px solid #fecaca; color:#dc2626; padding:4px 8px; border-radius:6px; font-size:11.5px; font-weight:700; cursor:pointer;">
                                    🗑️ 清除
                                  </button>
                                </div>
                              </div>
                            `;
                          }).join('')}
                        </div>
                      `}
                    `;
                  })()}
                </div>

              </div>

              <!-- 3. 课程参考范文与文献样例库 (第三个) -->
              <div class="card" style="border-top:4px solid #2563eb; width:100%; padding:24px;">
                <div class="card-title" style="margin-bottom:16px;">
                  <span style="font-size:17px; font-weight:800; color:#0f172a;">📚 课程参考范文库 (${currentClassPapers.length} 篇 · 当前班级: ${activeClass.name})</span>
                  <button id="btn-v2-open-paper-modal" class="teacher-action-btn" style="background:linear-gradient(135deg, #1d4ed8, #2563eb); padding:8px 18px; font-size:13px; font-weight:700; border:none; color:white; border-radius:8px; cursor:pointer; box-shadow:0 2px 8px rgba(37,99,235,0.25);">
                    + 上传学术参考范文
                  </button>
                </div>

                <div class="reference-papers-list" style="display:flex; flex-direction:column; gap:14px;">
                  ${currentClassPapers.length === 0 ? `
                    <div style="text-align:center; padding:32px; background:#f8fafc; border-radius:10px; border:2px dashed #cbd5e1;">
                      <div style="font-size:32px; margin-bottom:8px;">📚</div>
                      <div style="font-size:15px; font-weight:800; color:#0f172a;">当前班级暂无上传的课程参考范文</div>
                      <div style="font-size:12.5px; color:#64748b; margin-top:4px;">点击右上角【+ 上传学术参考范文】上传论文样本，学生可在阶段二正文上方随时查阅下载！</div>
                    </div>
                  ` : currentClassPapers.map((p, pIdx) => {
                    const linkedTask = tasks.find(t => t.id === p.taskId);
                    const taskLabel = p.taskId === 'task_all' || !p.taskId ? '🌐 通用范文 (全部任务)' : (linkedTask ? `📌 ${linkedTask.title}` : '📌 专属任务范文');
                    const isLatest = pIdx === 0;
                    const paperSeqNum = currentClassPapers.length - pIdx;
                    return `
                    <div style="background:#ffffff; border:1px solid #e2e8f0; padding:18px; border-radius:12px; box-shadow:0 1px 3px rgba(15,23,42,0.03);">
                      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                          <span style="background:linear-gradient(135deg, #7c3aed, #4f46e5); color:#ffffff; padding:3px 10px; border-radius:8px; font-size:12px; font-weight:800;">范文 ${paperSeqNum}${isLatest ? ' (最新)' : ''}</span>
                          <span style="font-weight:800; color:#1e40af; font-size:16px;">📄 ${p.title}</span>
                          <span style="background:#f5f3ff; color:#7c3aed; border:1px solid #ddd6fe; padding:2px 8px; border-radius:8px; font-size:11.5px; font-weight:700;">${taskLabel}</span>
                          <span style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; padding:2px 8px; border-radius:8px; font-size:11.5px; font-weight:700;">定向受众: ${p.targetGroupName || '全班所有小组'}</span>
                        </div>
                        <span style="font-size:12px; color:#64748b;">${p.uploadTime} | 上传人: ${p.author || '教师'}</span>
                      </div>
                      ${p.keyHighlights ? `
                        <div style="font-size:13px; color:#334155; margin-bottom:10px; line-height:1.6; background:#f8fafc; padding:10px 14px; border-radius:8px; border-left:3px solid #2563eb;">
                          <b>💡 核心论证亮点与学术价值：</b>${p.keyHighlights}
                        </div>
                      ` : ''}
                      ${p.abstract ? `
                        <div style="font-size:12.5px; color:#64748b; margin-bottom:10px; line-height:1.5;">
                          <b>摘要：</b>${p.abstract}
                        </div>
                      ` : ''}
                      <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid #f1f5f9; padding-top:10px; margin-top:6px;">
                        <div>
                          ${p.fileName ? `
                            <button class="btn-download-paper-file" data-id="${p.id}" style="background:#eff6ff; border:1px solid #bfdbfe; color:#2563eb; padding:5px 12px; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
                              📥 下载随附文献: <b>${p.fileName}</b> (${p.fileSize || '附件'})
                            </button>
                          ` : '<span style="font-size:12px; color:#94a3b8;">无独立附件文件</span>'}
                        </div>
                        <div style="display:flex; gap:10px;">
                          <button class="btn-delete-paper" data-id="${p.id}" style="background:#fef2f2; border:1px solid #fecaca; color:#dc2626; padding:6px 12px; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer;">
                            🗑️ 删除
                          </button>
                        </div>
                      </div>
                    </div>
                    `;
                  }).join('')}
                </div>
              </div>

              <!-- 4. 发布课堂广播通知 (第四个) -->
              <div class="card" style="border-top:4px solid #2563eb; width:100%; padding:24px;">
                <div class="card-title" style="margin-bottom:16px;">
                  <span style="font-size:17px; font-weight:800; color:#0f172a;">📢 课堂即时广播通知发布 (${currentClassAnnouncements.length} 条 · 当前班级: ${activeClass.name})</span>
                  <button id="btn-v2-open-ann-modal" class="teacher-action-btn" style="background:linear-gradient(135deg, #1d4ed8, #2563eb); border:none; color:white; padding:8px 18px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; box-shadow:0 2px 8px rgba(37,99,235,0.25);">
                    + 发布新通知 (选择/拖拽上传资源文件)
                  </button>
                </div>
                <div class="announcement-history-list" style="display:flex; flex-direction:column; gap:16px;">
                  ${currentClassAnnouncements.length === 0 ? `
                    <div style="text-align:center; padding:32px; background:#f8fafc; border-radius:10px; border:2px dashed #cbd5e1;">
                      <div style="font-size:32px; margin-bottom:8px;">📢</div>
                      <div style="font-size:15px; font-weight:800; color:#0f172a;">当前班级暂无发布的课堂广播通知</div>
                      <div style="font-size:12.5px; color:#64748b; margin-top:4px;">点击右上角【+ 发布新通知】向本班学生发布即时指令！</div>
                    </div>
                  ` : currentClassAnnouncements.map((a, idx) => {
                    const allClassGroups = (activeClass.groups && activeClass.groups.length > 0)
                      ? activeClass.groups
                      : [{ id: 'group_1', name: '第 1 协作小组' }];

                    const seenGIds = new Set();
                    let targetGroups = [];
                    allClassGroups.forEach(g => {
                      if (!g || !g.id || seenGIds.has(g.id)) return;
                      let isMatch = false;
                      // 全班所有小组
                      if (!a.targetGroupId || a.targetGroupId === 'all') isMatch = true;
                      else if (Array.isArray(a.targetGroupIds) && a.targetGroupIds.includes('all')) isMatch = true;
                      // 定向小组 (按 ID 或名称匹配当前班级中的对应小组)
                      else if (Array.isArray(a.targetGroupIds) && (a.targetGroupIds.includes(g.id) || a.targetGroupIds.includes(g.name))) isMatch = true;
                      else if (a.targetGroupId === g.id || a.targetGroupId === g.name) isMatch = true;
                      else if (a.targetGroupName && a.targetGroupName !== '全班所有小组') {
                        const names = a.targetGroupName.split('、').map(s => s.trim());
                        if (names.includes(g.name)) isMatch = true;
                      }
                      if (isMatch) {
                        seenGIds.add(g.id);
                        targetGroups.push(g);
                      }
                    });

                    // 兜底：若受众组当前未在班级列表中找到，用通知记录的目标组名呈现，绝不呈现空白
                    if (targetGroups.length === 0) {
                      targetGroups = [{ id: a.targetGroupId || 'group_target', name: a.targetGroupName || '定向协作小组' }];
                    }
                    const targetGName = a.targetGroupName || (targetGroups.length === allClassGroups.length ? '全班所有小组' : targetGroups.map(g => g.name).join('、'));
                    const taskLabel = a.taskId === 'task_all' || !a.taskId ? '🌐 全班通识广播' : `📌 ${a.taskTitle || '专属任务'}`;
                    const isLatest = idx === 0;
                    const annSeqNum = currentClassAnnouncements.length - idx;
                    return `
                      <div style="background:#ffffff; border:1px solid #e2e8f0; padding:18px; border-radius:12px; box-shadow:0 1px 3px rgba(15,23,42,0.03);">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                            <span style="background:linear-gradient(135deg, #1d4ed8, #2563eb); color:#ffffff; padding:3px 10px; border-radius:8px; font-size:12px; font-weight:800;">通知 ${annSeqNum}${isLatest ? ' (最新)' : ''}</span>
                            <span style="font-weight:800; color:#1e40af; font-size:16px;">📢 ${a.title}</span>
                            <span style="background:#f5f3ff; color:#7c3aed; border:1px solid #ddd6fe; padding:2px 8px; border-radius:8px; font-size:11.5px; font-weight:700;">${taskLabel}</span>
                            <span style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; padding:2px 8px; border-radius:8px; font-size:11.5px; font-weight:700;">定向受众: ${targetGName}</span>
                          </div>
                          <div style="display:flex; align-items:center; gap:10px;">
                            <span style="font-size:12px; color:#64748b;">${a.time} | 发布人: ${a.author || '老师'}</span>
                            <button class="btn-delete-announcement" data-id="${a.id}" data-title="${a.title}" style="background:#fef2f2; border:1px solid #fecaca; color:#dc2626; padding:3px 8px; border-radius:6px; font-size:11.5px; font-weight:700; cursor:pointer;" title="删除此通知">
                              🗑️ 删除通知
                            </button>
                          </div>
                        </div>
                        <div style="font-size:13px; color:#334155; margin-bottom:10px; line-height:1.6;">${a.content}</div>
                        ${a.attachment ? `
                          <div style="font-size:12px; color:#1d4ed8; background:#eff6ff; border:1px solid #bfdbfe; padding:6px 12px; border-radius:8px; display:inline-flex; align-items:center; gap:8px; margin-bottom:10px; font-weight:600;">
                            <span>📎 随附资源文件: <b>${a.attachment.name}</b> (${a.attachment.size})</span>
                          </div>
                        ` : ''}

                        <!-- 📊 受众小组已读/未读实时确认追踪矩阵 (只展示实际接收到通知的受众小组) -->
                        <div style="margin-top:10px; background:#f8fafc; padding:12px 16px; border-radius:10px; border:1px solid #e2e8f0;">
                          <div style="font-size:12px; font-weight:700; color:#334155; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
                            <span>📊 定向受众小组阅读确认追踪矩阵 (${targetGroups.length} 个小组):</span>
                            <span style="font-size:11px; color:#059669; font-weight:700;">🟢 学生端确认后实时点亮</span>
                          </div>
                          <div style="display:flex; flex-wrap:wrap; gap:10px; font-size:12px;">
                            ${targetGroups.map(g => {
                              const gMembers = Array.isArray(g.members) ? g.members : [];
                              const memberConfirmedNames = [];

                              // 1. 遍历小组名册中的所有学生
                              gMembers.forEach(m => {
                                const mId = (typeof m === 'object' && m !== null) ? (m.id || m.userId || m.studentCode) : m;
                                const mName = (typeof m === 'object' && m !== null) ? m.name : null;
                                const uObj = mId ? allUsers.find(u => u.id === mId || u.studentCode === mId || u.username === mId || u.name === mId) : null;
                                const uName = (uObj ? uObj.name : null) || mName || (typeof mId === 'string' && !mId.startsWith('u_') ? mId : null);

                                const hasRead = a.readStatus && (
                                  (mId && a.readStatus[mId]) ||
                                  (uObj && uObj.id && a.readStatus[uObj.id]) ||
                                  (uObj && uObj.studentCode && a.readStatus[uObj.studentCode]) ||
                                  (uObj && uObj.username && a.readStatus[uObj.username]) ||
                                  (uObj && uObj.name && a.readStatus[uObj.name])
                                );
                                const inConfirmedList = (a.confirmedMembers || []).some(cm => cm && (
                                  (mId && cm.id === mId) ||
                                  (uObj && (cm.id === uObj.id || cm.studentCode === uObj.studentCode || cm.name === uObj.name)) ||
                                  (uName && cm.name === uName)
                                ));

                                if ((hasRead || inConfirmedList) && uName && !memberConfirmedNames.includes(uName)) {
                                  memberConfirmedNames.push(uName);
                                }
                              });

                              // 2. 遍历 confirmedMembers 中明确属于该组的学生
                              (a.confirmedMembers || []).forEach(m => {
                                if (m && (m.groupId === g.id || m.groupId === g.name || m.groupId === g.groupId)) {
                                  const showName = m.name || m.studentCode || '学生';
                                  if (!memberConfirmedNames.includes(showName)) {
                                    memberConfirmedNames.push(showName);
                                  }
                                }
                              });

                              const isRead = (a.readGroupStatus && (a.readGroupStatus[g.id] || a.readGroupStatus[g.name])) ||
                                             (a.readStatus && (a.readStatus[g.id] || a.readStatus[g.name])) ||
                                             memberConfirmedNames.length > 0;

                              const confirmedNames = memberConfirmedNames.join('、');
                              return `
                                <span style="background:${isRead ? '#ecfdf5' : '#fffbeb'}; border:1px solid ${isRead ? '#a7f3d0' : '#fde68a'}; color:${isRead ? '#059669' : '#d97706'}; padding:6px 12px; border-radius:8px; font-weight:700;">
                                  ${isRead ? '✅' : '⏳'} ${g.name}: <b>${isRead ? `已阅读确认${confirmedNames ? ` (${confirmedNames})` : ''}` : '尚未确认'}</b>
                                </span>
                              `;
                            }).join('')}
                          </div>
                        </div>

                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
            </div>
            `;
          })() : ''}

          ${activeTab === 'view_monitoring' ? (() => {
            const monitorStageMode = state.teacherMonitorStageMode || 'auto';
            const actualStage = state.currentStage || 'stage1';
            const effectiveMonitorStage = monitorStageMode === 'auto' ? actualStage : monitorStageMode;

            const currentClassId = state.activeClassId || (authManager.getClasses()[0] ? authManager.getClasses()[0].id : 'class_101');
            const activeTaskId = state.activeTaskId || (currentClassTasks[0] ? currentClassTasks[0].id : `task_${currentClassId}_default`);
            const currentMonitorTaskId = activeTaskId;
            const monitorTaskObj = currentClassTasks.find(t => t.id === currentMonitorTaskId);
            const isMonitorTaskExpired = isTaskExpired(monitorTaskObj);

            return `
              <div style="display:flex; flex-direction:column; gap:16px; width:100%;">

                ${isMonitorTaskExpired ? `
                  <div style="background:#fef2f2; border:1.5px solid #fca5a5; border-radius:12px; padding:14px 20px; font-size:13.5px; color:#991b1b; font-weight:700; display:flex; justify-content:space-between; align-items:center; box-shadow:0 2px 8px rgba(239,68,68,0.1);">
                    <div style="display:flex; align-items:center; gap:10px;">
                      <span style="font-size:22px;">🛑</span>
                      <div>
                        <div style="font-size:14.5px; font-weight:800; color:#b91c1c;">该写作任务已到截止时间（已截止锁定）</div>
                        <div style="font-size:12px; color:#7f1d1d; margin-top:2px;">任务《${escapeHtml(monitorTaskObj?.title || '当前任务')}》截止时间为 <b>${monitorTaskObj?.deadline || '未定'}</b>，学生端所有阶段正文与公约已自动转为<b>【只读查阅模式】</b>。如需继续编辑请在【任务与通知发布】中点击【⏳ 延长时间】。</div>
                      </div>
                    </div>
                    <span style="background:#dc2626; color:white; padding:5px 14px; border-radius:8px; font-size:12.5px; font-weight:800; white-space:nowrap; box-shadow:0 2px 6px rgba(220,38,38,0.3);">🛑 任务已截止 · 只读</span>
                  </div>
                ` : ''}

                <div class="card" id="card-teacher-panorama" style="border-top:4px solid #7c3aed; width:100%; padding:12px 18px; flex-shrink:0;">
                  <div style="display:flex; justify-content:space-between; align-items:center; cursor:pointer;" id="btn-toggle-teacher-panorama">
                    <div style="display:flex; align-items:center; gap:8px;">
                      <span style="font-size:14px; font-weight:800; color:#0f172a;">📡 全组实时总览</span>
                      <span style="font-size:11px; color:#64748b; font-weight:600;">
                        <span style="color:#16a34a;">🟢 正常</span>　<span style="color:#d97706;">🟡 部分离线</span>　<span style="color:#dc2626;">🔴 全员离线/字段占用</span>　<span style="color:#059669;">✅ 已终稿</span>
                      </span>
                    </div>
                    <span id="icon-toggle-teacher-panorama" style="font-size:11.5px; color:#7c3aed; font-weight:700;">${state._isPanoramaCollapsed ? '▼ 展开总览' : '▲ 收起'}</span>
                  </div>
                  <div id="body-teacher-panorama" style="display:${state._isPanoramaCollapsed ? 'none' : 'grid'}; grid-template-columns:repeat(auto-fill, minmax(170px, 1fr)); gap:10px; margin-top:10px;">
                    ${(activeClass.groups || []).map(g => {
                      const p = (state.monitorPanorama && state.monitorPanorama[g.id]) || null;
                      const total = p ? (p.totalMembers || 0) : ((g.members || []).length || 0);
                      const online = p ? (p.onlineCount || 0) : 0;
                      const locks = p ? (p.activeLocks || []).length : 0;
                      const final = p ? !!p.isFinalSubmitted : false;
                      const stage = p ? (p.currentStage || 'stage1') : 'stage1';
                      const stageLabel = stage === 'stage1' ? '🎪 阶段一' : stage === 'stage2' ? '📰 阶段二' : '🎓 阶段三';
                      const absent = Math.max(0, total - online);
                      const isSelected = g.id === activeMonitorGId;
                      let dot = '🟢', dotColor = '#16a34a', hint = '正常推进';
                      if (final) { dot = '✅'; dotColor = '#059669'; hint = '已终稿'; }
                      else if (total > 0 && online === 0) { dot = '🔴'; dotColor = '#dc2626'; hint = '全员离线'; }
                      else if (locks > 0) { dot = '🔴'; dotColor = '#dc2626'; hint = locks + ' 字段占用'; }
                      else if (absent > 0) { dot = '🟡'; dotColor = '#d97706'; hint = absent + ' 人离线'; }
                      return `
                        <button class="btn-monitor-panorama-card" data-gid="${g.id}" style="text-align:left; background:${isSelected ? '#f5f3ff' : '#ffffff'}; border:1.5px solid ${isSelected ? '#7c3aed' : '#e2e8f0'}; border-radius:10px; padding:10px 12px; cursor:pointer; display:flex; flex-direction:column; gap:6px; box-shadow:0 1px 3px rgba(15,23,42,0.03); transition:all 0.15s ease;">
                          <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span style="font-size:12.5px; font-weight:800; color:#0f172a;">👥 ${escapeHtml(g.name || g.id)}</span>
                            <span style="font-size:14px;">${dot}</span>
                          </div>
                          <div style="display:flex; justify-content:space-between; align-items:center; gap:6px;">
                            <span style="font-size:11px; font-weight:700; color:#6d28d9; background:#ede9fe; padding:2px 6px; border-radius:6px;">${stageLabel}</span>
                            <span style="font-size:11px; color:#64748b; font-weight:600;">在线 ${online}/${total}</span>
                          </div>
                          <div style="font-size:10.5px; color:${dotColor}; font-weight:700;">${hint}${locks > 0 ? ' · 锁字段' : ''}</div>
                        </button>
                      `;
                    }).join('')}
                  </div>
                </div>

                <div class="card" style="border-top:4px solid #059669; width:100%; padding:16px 20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
                  <div style="display:flex; align-items:center; gap:14px; flex-wrap:wrap;">
                    <span style="font-size:15px; font-weight:800; color:#0f172a;">🖥️ 实际操作实时监控终端:</span>
                    <div style="display:flex; align-items:center; gap:8px;">
                      <span style="font-size:13px; font-weight:700; color:#475569;">监控任务:</span>
                      <select id="sel-switch-monitor-task" class="teacher-input fancy" style="font-size:13px; font-weight:700; color:#1e40af; background:#eff6ff; border:1.5px solid #3b82f6; padding:7px 14px; border-radius:8px; cursor:pointer; min-width:180px;">
                        ${currentClassTasks.length === 0 ? '<option value="task_default">📌 默认测试写作任务</option>' : currentClassTasks.map(t => {
                          const isSel = (state.activeTaskId || null) === t.id;
                          return `<option value="${t.id}" ${isSel ? 'selected' : ''}>📌 ${t.title}${isTaskExpired(t) ? ' (🛑已截止)' : ''}</option>`;
                        }).join('')}
                      </select>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                      <span style="font-size:13px; font-weight:700; color:#475569;">监控小组:</span>
                      <select id="sel-switch-monitor-group" class="teacher-input fancy" style="font-size:13px; font-weight:700; color:#1e40af; background:#eff6ff; border:1.5px solid #3b82f6; padding:7px 14px; border-radius:8px; cursor:pointer; min-width:180px;">
                        ${(activeClass.groups || []).map(g => {
                          const isSel = g.id === activeMonitorGId;
                          return `
                            <option value="${g.id}" ${isSel ? 'selected' : ''}>
                              👥 ${g.name} ${isSel ? '(当前正在同屏实时监控 🟢)' : ''}
                            </option>
                          `;
                        }).join('')}
                      </select>
                    </div>

                    <!-- 🌟 方案 A：本组在线/离线成员状态标签 (单行优雅流线胶囊) -->
                    ${(() => {
                      const panoData = (state.monitorPanorama && state.monitorPanorama[activeMonitorGId]) || null;
                      const total = panoData ? (panoData.totalMembers || 0) : (monitorMembersList.length || 0);
                      const online = panoData ? (panoData.onlineCount || 0) : 0;
                      const absentList = (panoData && panoData.absentMembers) || [];
                      const absentCount = Math.max(0, total - online);

                      if (total > 0 && online === 0) {
                        return `
                          <span style="font-size:12px; font-weight:700; padding:5px 12px; border-radius:8px; background:#fef2f2; color:#dc2626; border:1px solid #fecaca; display:inline-flex; align-items:center; gap:5px;">
                            <span style="width:7px; height:7px; border-radius:50%; background:#dc2626;"></span>
                            🔴 全员离线 (0/${total})
                          </span>
                        `;
                      } else if (absentCount > 0 && absentList.length > 0) {
                        return `
                          <span style="font-size:12px; font-weight:700; padding:4px 10px; border-radius:8px; background:#fffbeb; color:#b45309; border:1px solid #fde68a; display:inline-flex; align-items:center; gap:6px; flex-wrap:wrap;">
                            <span style="display:inline-flex; align-items:center; gap:4px;">
                              <span style="width:7px; height:7px; border-radius:50%; background:#f59e0b;"></span>
                              🟡 离线 (${absentCount}人):
                            </span>
                            ${absentList.map(name => `
                              <span style="background:#ffffff; color:#92400e; border:1px solid #fcd34d; padding:1px 6px; border-radius:6px; font-size:11px; font-weight:700;">
                                👤 ${escapeHtml(name)}
                              </span>
                            `).join('')}
                          </span>
                        `;
                      } else {
                        return `
                          <span style="font-size:12px; font-weight:700; padding:5px 12px; border-radius:8px; background:#ecfdf5; color:#059669; border:1px solid #a7f3d0; display:inline-flex; align-items:center; gap:5px;">
                            <span style="width:7px; height:7px; border-radius:50%; background:#10b981;"></span>
                            🟢 全员在线 (${online}/${total || online})
                          </span>
                        `;
                      }
                    })()}
                  </div>

                  <!-- 任务状态感知与 Excel 导出 -->
                  <div style="display:flex; align-items:center; gap:10px;">
                    <span style="font-size:12px; font-weight:700; padding:6px 12px; border-radius:8px; background:${isMonitorTaskExpired || state.isFinalSubmitted ? '#fef2f2' : '#ecfdf5'}; color:${isMonitorTaskExpired || state.isFinalSubmitted ? '#dc2626' : '#059669'}; border:1px solid ${isMonitorTaskExpired || state.isFinalSubmitted ? '#fecaca' : '#a7f3d0'};">
                      ${isMonitorTaskExpired ? '🛑 任务已截止 (只读模式)' : (state.isFinalSubmitted ? '🔒 论文终稿已提交 (已归档)' : '🟢 任务进行中 (组员协作撰写中)')}
                    </span>
                    <button id="btn-export-all-excel" style="background:linear-gradient(135deg, #2563eb, #1d4ed8); border:none; color:white; padding:8px 16px; border-radius:8px; font-size:12.5px; font-weight:800; cursor:pointer; box-shadow:0 3px 10px rgba(37,99,235,0.3);">
                      📊 导出本组研讨 Excel
                    </button>
                  </div>
                </div>

                <!-- 📍 实时跟随指示条（清爽标准版） -->
                <div style="display:flex; justify-content:space-between; align-items:center; background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:12px 18px; width:100%; box-shadow:0 1px 3px rgba(15,23,42,0.03);">
                  <div style="display:flex; align-items:center; gap:12px;">
                    ${(() => {
                      const mNames = monitorMembersList.map(m => m.name).filter(Boolean);
                      const mStr = mNames.length > 0 ? `(${mNames.join('、')})` : '';
                      return `
                        <span style="font-size:13px; font-weight:700; color:#334155;">
                          📍 实时跟随指示: 当前【${activeMonitorGroup.name}】<span style="color:#2563eb; font-weight:700; margin-left:4px;">${mStr}</span> 实际处于: <b style="color:#2563eb;">${actualStage === 'stage1' ? '🎪 阶段一：学术拍卖会' : actualStage === 'stage2' ? '📰 阶段二：学术编辑部' : '🎓 阶段三：答辩擂台'}</b>
                        </span>
                      `;
                    })()}
                  </div>
                  <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-size:12px; color:#64748b; font-weight:600;">🔀 切换同屏切页:</span>
                    <button class="btn-monitor-stage-tab ${monitorStageMode === 'auto' ? 'active' : ''}" data-stg="auto" style="background:${monitorStageMode === 'auto' ? '#ecfdf5' : '#ffffff'}; border:${monitorStageMode === 'auto' ? '1.5px solid #10b981' : '1px solid #cbd5e1'}; color:${monitorStageMode === 'auto' ? '#059669' : '#64748b'}; padding:6px 14px; border-radius:8px; font-size:12px; font-weight:${monitorStageMode === 'auto' ? '800' : '600'}; cursor:pointer; box-shadow:${monitorStageMode === 'auto' ? '0 1px 4px rgba(16,185,129,0.2)' : 'none'};">
                      ⚡ 自动跟随 (${actualStage === 'stage1' ? '阶段一' : actualStage === 'stage2' ? '阶段二' : '阶段三'}) 🟢
                    </button>
                    <button class="btn-monitor-stage-tab ${monitorStageMode === 'stage1' ? 'active' : ''}" data-stg="stage1" style="background:${monitorStageMode === 'stage1' ? '#eff6ff' : '#ffffff'}; border:${monitorStageMode === 'stage1' ? '1.5px solid #2563eb' : '1px solid #cbd5e1'}; color:${monitorStageMode === 'stage1' ? '#1d4ed8' : '#64748b'}; padding:6px 14px; border-radius:8px; font-size:12px; font-weight:${monitorStageMode === 'stage1' ? '800' : '600'}; cursor:pointer; box-shadow:${monitorStageMode === 'stage1' ? '0 1px 4px rgba(37,99,235,0.2)' : 'none'};">
                      🎪 查看阶段一
                    </button>
                    <button class="btn-monitor-stage-tab ${monitorStageMode === 'stage2' ? 'active' : ''}" data-stg="stage2" style="background:${monitorStageMode === 'stage2' ? '#eff6ff' : '#ffffff'}; border:${monitorStageMode === 'stage2' ? '1.5px solid #2563eb' : '1px solid #cbd5e1'}; color:${monitorStageMode === 'stage2' ? '#1d4ed8' : '#64748b'}; padding:6px 14px; border-radius:8px; font-size:12px; font-weight:${monitorStageMode === 'stage2' ? '800' : '600'}; cursor:pointer; box-shadow:${monitorStageMode === 'stage2' ? '0 1px 4px rgba(37,99,235,0.2)' : 'none'};">
                      📰 查看阶段二
                    </button>
                    <button class="btn-monitor-stage-tab ${monitorStageMode === 'stage3' ? 'active' : ''}" data-stg="stage3" style="background:${monitorStageMode === 'stage3' ? '#eff6ff' : '#ffffff'}; border:${monitorStageMode === 'stage3' ? '1.5px solid #2563eb' : '1px solid #cbd5e1'}; color:${monitorStageMode === 'stage3' ? '#1d4ed8' : '#64748b'}; padding:6px 14px; border-radius:8px; font-size:12px; font-weight:${monitorStageMode === 'stage3' ? '800' : '600'}; cursor:pointer; box-shadow:${monitorStageMode === 'stage3' ? '0 1px 4px rgba(37,99,235,0.2)' : 'none'};">
                      🎓 查看阶段三
                    </button>
                  </div>
                </div>

                ${(() => {
                  // 聚合全阶段研讨聊天流 (和在一起，按时间全局排序并去重)
                  const combinedGroupChatLogs = (() => {
                    const allStages = ['stage1', 'stage2', 'stage3'];
                    const allMsgs = [];
                    const seenMsgKeys = new Set();
                    allStages.forEach(stg => {
                      if (state.chatLogs && Array.isArray(state.chatLogs[stg])) {
                        state.chatLogs[stg].forEach(msg => {
                          if (!msg) return;
                          const txt = msg.text || '';
                          if (txt.includes('已连续') || txt.includes('互动督促') || txt.includes('秒未研讨') || txt.includes('秒没有发言')) return;
                          const rawTxtNormalized = txt.replace(/[\s\r\n]+/g, ' ').trim();
                          const contentKey = `${msg.sender}_${stg}_${rawTxtNormalized}`;
                          const idKey = msg.id ? `id_${msg.id}` : null;
                          if (seenMsgKeys.has(contentKey) || (idKey && seenMsgKeys.has(idKey))) return;
                          seenMsgKeys.add(contentKey);
                          if (idKey) seenMsgKeys.add(idKey);
                          allMsgs.push({ ...msg, _stageSource: stg });
                        });
                      }
                    });
                    allMsgs.sort((a, b) => (Number(a._timeMs || a.timestamp || 0) - Number(b._timeMs || b.timestamp || 0)));
                    return filterAndDeduplicateChatLogs(allMsgs);
                  })();

                  const renderUnifiedRightChatCard = () => `
                    <!-- 右侧卡片：高度统一为 840px，与左侧绝对平齐，内部聊天流全高滚动，严密锁边防溢出 -->
                    <div class="card" style="padding:16px 18px; display:flex; flex-direction:column; min-width:0; box-sizing:border-box; height:840px; max-height:840px; border:1px solid #e2e8f0; box-shadow:0 2px 8px rgba(15,23,42,0.04); overflow:hidden;">
                      <div style="flex-shrink:0; font-size:14.5px; font-weight:800; color:#0f172a; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e2e8f0; padding-bottom:8px;">
                        <span>💬 团队全程研讨对话流 (${activeMonitorGroup.name})</span>
                        <span style="font-size:11px; background:#eff6ff; color:#2563eb; padding:2px 8px; border-radius:6px; font-weight:700;">全阶段汇总 (${combinedGroupChatLogs.length}条)</span>
                      </div>
                      <div class="teacher-chat-stream" id="teacher-unified-chat-stream" style="flex:1; min-height:0; height:100%; overflow-y:auto; overflow-x:hidden; -webkit-overflow-scrolling:touch; overscroll-behavior-y:contain; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px; font-size:12px; display:flex; flex-direction:column; gap:10px; box-sizing:border-box;">
                        ${combinedGroupChatLogs.length > 0 ? combinedGroupChatLogs.map(m => {
                          const allGlobalUsers = (authManager) ? authManager.getUsers() : [];
                          const isAgent = AgentProfiles[m.sender] !== undefined;
                          const matchedUser = isAgent ? null : allGlobalUsers.find(u => u.id === m.sender || u.studentCode === m.sender || u.username === m.sender || u.name === m.sender);
                          const senderName = isAgent ? AgentProfiles[m.sender].name : (matchedUser ? matchedUser.name : (m.senderName || (monitorMembersObj[m.sender] ? monitorMembersObj[m.sender].name : m.sender)));
                          const color = isAgent ? AgentProfiles[m.sender].color : (matchedUser ? (matchedUser.color || '#2563eb') : (monitorMembersObj[m.sender] ? monitorMembersObj[m.sender].color : '#2563eb'));
                          return `
                            <div style="background:#ffffff; padding:8px 12px; border-radius:8px; border:1px solid #e2e8f0; border-left:3px solid ${color}; box-shadow:0 1px 2px rgba(0,0,0,0.02); word-break:break-word; overflow-wrap:break-word; max-width:100%;">
                              <div style="display:flex; justify-content:space-between; margin-bottom:3px; gap:6px;">
                                <b style="color:${color}; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(senderName)}</b>
                                <span style="color:#94a3b8; font-size:10px; flex-shrink:0;">${escapeHtml(formatChatDisplayTime(m._timeMs || m.timestamp))}</span>
                              </div>
                              <div style="color:#0f172a; line-height:1.5; word-break:break-word; overflow-wrap:break-word;">${escapeHtml(m.text || '')}</div>
                            </div>
                          `;
                        }).join('') : `
                          <div style="text-align:center; padding:40px 16px; color:#94a3b8; font-size:12px;">⏳ 本小组暂无研讨发言记录</div>
                        `}
                      </div>
                    </div>
                  `;

                  if (effectiveMonitorStage === 'stage1') {
                    return `
                      <div style="display:grid; grid-template-columns: minmax(0, 1fr) 300px; gap:16px; width:100%; box-sizing:border-box; height:820px; max-height:820px; align-items:stretch;">
                        <!-- 左侧卡片：以阶段一左侧为主，高度统一为 820px，内部自适应滚动 -->
                        <div class="card" style="padding:18px 20px; display:flex; flex-direction:column; border:1px solid #bfdbfe; gap:12px; min-width:0; box-sizing:border-box; height:820px; max-height:820px; overflow-y:auto; -webkit-overflow-scrolling:touch; overscroll-behavior-y:contain;">
                          <div style="flex-shrink:0; font-size:16px; font-weight:800; color:#1e40af; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e2e8f0; padding-bottom:10px;">
                            <span>🎪 阶段一实操同屏: 初始提案与学术合作公约 (${activeMonitorGroup.name})</span>
                            <span style="background:#eff6ff; color:#1d4ed8; padding:3px 10px; border-radius:8px; font-size:12px; font-weight:700;">阶段一实况</span>
                          </div>

                          <!-- 1. 【第一步】💡 组员初始学术提案展台 -->
                          <div style="background:#f8fafc; border:1px solid #bfdbfe; border-radius:12px; padding:14px; flex-shrink:0;">
                            <div style="font-size:13.5px; font-weight:800; color:#1e40af; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
                              <span>💡 组员初始学术提案展台 (${(state.stage1?.proposals || []).length}/${monitorMembersList.length || 3} 人已提交):</span>
                              <span style="font-size:11.5px; background:#eff6ff; color:#2563eb; padding:2px 8px; border-radius:6px; font-weight:700;">
                                共投 ${monitorMembersList.filter(m => state.stage1?.hasVoted && (state.stage1.hasVoted[m.id] || state.stage1.hasVoted[m.studentCode] || (m.name && state.stage1.hasVoted[m.name]))).length} 票
                              </span>
                            </div>
                            ${(state.stage1?.proposals && state.stage1.proposals.length > 0) ? `
                              <div class="proposals-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:10px;">
                                ${state.stage1.proposals.map((p, idx) => {
                                  const allGlobalUsers = (authManager) ? authManager.getUsers() : [];
                                  const authorObj = monitorMembersList.find(m => m.id === p.author || m.studentCode === p.author || m.name === p.authorName || m.name === p.author);
                                  const authorUser = allGlobalUsers.find(u => u.id === p.author || u.studentCode === p.author || u.username === p.author || u.name === p.authorName);
                                  const authorName = authorObj ? authorObj.name : (authorUser ? authorUser.name : (p.authorName || p.author || `组员${idx+1}`));
                                  const votes = monitorMembersList.filter(m => {
                                    if (!state.stage1?.votes) return false;
                                    const v = state.stage1.votes[m.studentCode] || state.stage1.votes[m.id] || (m.name && state.stage1.votes[m.name]);
                                    return v === p.id;
                                  }).length;
                                  return `
                                    <div style="background:#ffffff; border:1.5px solid #e2e8f0; border-radius:8px; padding:10px; display:flex; flex-direction:column; justify-content:space-between; gap:6px; box-shadow:0 1px 3px rgba(0,0,0,0.02);">
                                      <div>
                                        <div style="font-size:13px; font-weight:800; color:#0f172a; line-height:1.4; margin-bottom:4px;">${escapeHtml(p.title || '未命名选题')}</div>
                                        <div style="font-size:11px; color:#64748b;">👤 提交人: <b>${escapeHtml(authorName)}</b></div>
                                      </div>
                                      <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid #f1f5f9; padding-top:6px;">
                                        <span style="font-size:11px; color:#2563eb; font-weight:700;">🗳️ 得票数: ${votes}</span>
                                      </div>
                                    </div>
                                  `;
                                }).join('')}
                              </div>
                            ` : `
                              <div style="text-align:center; padding:16px; color:#94a3b8; font-size:12px;">⏳ 本组暂无成员提交选题提案</div>
                            `}
                          </div>

                          <!-- 2. 【第二步】📜 团队协同合作学术合约 (1:1 镜像学生端结构) -->
                          <div style="background:#f8fafc; border:1px solid #bfdbfe; border-radius:12px; padding:14px; display:flex; flex-direction:column; gap:12px;">
                            <div style="font-size:13.5px; font-weight:800; color:#1e40af; display:flex; justify-content:space-between; align-items:center;">
                              <span>📜 团队协同合作学术合约 (${activeMonitorGroup.name}):</span>
                              <span style="font-size:11.5px; background:${state.stage1?.contract?.isLocked ? '#ecfdf5' : '#eff6ff'}; color:${state.stage1?.contract?.isLocked ? '#059669' : '#2563eb'}; padding:2px 8px; border-radius:6px; font-weight:700;">
                                ${state.stage1?.contract?.isLocked ? '🔒 公约已全员签署生效' : '✍️ 协作拟定中'}
                              </span>
                            </div>

                            <!-- 📌 确认融合论文研究主题 -->
                            <div style="background:#ffffff; border:1px solid #cbd5e1; border-radius:8px; padding:10px 12px; border-left:4px solid #2563eb;">
                              <div style="font-size:11.5px; font-weight:800; color:#1e40af; margin-bottom:3px;">📌 确认融合论文研究主题:</div>
                              <div style="font-size:13.5px; font-weight:800; color:#0f172a; line-height:1.4;">${escapeHtml(state.stage1?.mergedTitle || state.stage1?.contract?.topic || '（小组暂未敲定最终论题）')}</div>
                            </div>

                            <!-- 📚 6大研究方案核心模块与时间规划 (独立模块) -->
                            <div style="background:#ffffff; padding:12px; border-radius:8px; border:1px solid #e2e8f0;">
                              <div style="font-weight:800; color:#1e40af; margin-bottom:8px; font-size:12.5px;">
                                📚 研究方案核心模块与时间规划:
                              </div>
                              <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(160px, 1fr)); gap:8px;">
                                ${[
                                  { key: 'background', label: '一、研究背景与意义', def: 25, color: '#2563eb' },
                                  { key: 'literature', label: '二、文献综述', def: 30, color: '#0284c7' },
                                  { key: 'questions', label: '三、研究问题与假设', def: 25, color: '#059669' },
                                  { key: 'method', label: '四、研究设计与方法', def: 40, color: '#7c3aed' },
                                  { key: 'reflection', label: '五、研究设计的不足与反思', def: 20, color: '#d97706' },
                                  { key: 'references', label: '六、参考文献', def: 10, color: '#475569' }
                                ].map(sec => {
                                  const timeAlloc = state.stage1?.contract?.timeAllocations || {};
                                  const timeVal = (timeAlloc[sec.key] !== undefined) ? timeAlloc[sec.key] : sec.def;
                                  return `
                                    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-left:3.5px solid ${sec.color}; border-radius:6px; padding:6px 8px; display:flex; justify-content:space-between; align-items:center;">
                                      <span style="font-weight:700; color:#334155; font-size:11.5px;">${sec.label}</span>
                                      <span style="font-size:11.5px; color:#2563eb; font-weight:800;">${timeVal} 分钟</span>
                                    </div>
                                  `;
                                }).join('')}
                              </div>
                            </div>

                            <!-- 👥 小组成员具体任务分工 (与时间完全分开，按组员展示) -->
                            <div style="background:#ffffff; padding:12px; border-radius:8px; border:1px solid #e2e8f0;">
                              <div style="font-weight:800; color:#1e40af; margin-bottom:8px; font-size:12.5px;">
                                👥 本组小组成员具体任务分工 (共 ${monitorMembersList.length} 人):
                              </div>
                              <div style="display:flex; flex-direction:column; gap:6px;">
                                ${monitorMembersList.map((m, idx) => {
                                  const mKey = m.id || m.studentCode || m.username || m.name || (`mem_${idx}`);
                                  const tasks = state.stage1?.contract?.taskAssignments || {};
                                  const taskVal = tasks[mKey] !== undefined ? tasks[mKey] :
                                    (m.id && tasks[m.id] !== undefined ? tasks[m.id] :
                                    (m.studentCode && tasks[m.studentCode] !== undefined ? tasks[m.studentCode] :
                                    (m.name && tasks[m.name] !== undefined ? tasks[m.name] : '')));
                                  return `
                                    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:6px 10px; display:flex; flex-direction:column; gap:3px;">
                                      <div style="display:flex; justify-content:space-between; align-items:center;">
                                        <span style="font-weight:800; color:${m.color || '#2563eb'}; font-size:12px;">${m.avatar || '👤'} ${escapeHtml(m.name)} (${m.roleTitle || '组员'}):</span>
                                      </div>
                                      <div style="font-size:11.5px; color:${taskVal ? '#0f172a' : '#94a3b8'}; font-weight:${taskVal ? '600' : '400'};">
                                        ${taskVal ? escapeHtml(taskVal) : '（暂未在公约中录入具体分工）'}
                                      </div>
                                    </div>
                                  `;
                                }).join('')}
                              </div>
                            </div>

                            <!-- ✍️ 组员签署确认状态矩阵 -->
                            <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px;">
                              <div style="font-size:12px; font-weight:700; color:#334155; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
                                <span>✍️ 组员签署确认状态:</span>
                                <span style="font-size:11.5px; color:#2563eb; font-weight:700;">
                                  签署进度: ${monitorMembersList.filter(m => { const c = state.stage1?.contract?.confirmedMembers || {}; return c[m.id] || c[m.studentCode] || (m.name && c[m.name]); }).length}/${monitorMembersList.length}
                                </span>
                              </div>
                              <div style="display:flex; gap:6px; flex-wrap:wrap;">
                                ${monitorMembersList.map(m => {
                                  const isConf = state.stage1?.contract?.confirmedMembers && (state.stage1.contract.confirmedMembers[m.id] || state.stage1.contract.confirmedMembers[m.studentCode] || (m.name && state.stage1.contract.confirmedMembers[m.name]));
                                  return `
                                    <span style="color:${isConf ? '#059669' : '#64748b'}; border:1px solid ${isConf ? '#a7f3d0' : '#e2e8f0'}; background:${isConf ? '#ecfdf5' : '#f8fafc'}; padding:3px 8px; border-radius:6px; font-size:11.5px; font-weight:700; display:inline-flex; align-items:center; gap:4px;">
                                      ${m.avatar || '👤'} ${escapeHtml(m.name)}: <b>${isConf ? '✅ 已签署' : '⏳ 未签署'}</b>
                                    </span>
                                  `;
                                }).join('')}
                              </div>
                            </div>
                          </div>
                        </div>

                        ${renderUnifiedRightChatCard()}
                      </div>
                    `;
                  }

                  if (effectiveMonitorStage === 'stage2') {
                    const s2ActionPlan = state.stage2?.actionPlan;
                    const s2Subs = state.stage2?.meetingSubmissions || {};
                    const s2SubCount = Object.keys(s2Subs).length;
                    const totalMemberCount = monitorMembersList.length || 3;
                    const confirmedDraftCount = monitorMembersList.filter(m => state.stage2?.confirmedMembers && (state.stage2.confirmedMembers[m.id] || state.stage2.confirmedMembers[m.studentCode] || state.stage2.confirmedMembers[m.username] || (m.name && state.stage2.confirmedMembers[m.name]))).length;

                    return `
                      <div style="display:grid; grid-template-columns: minmax(0, 1fr) 300px; gap:16px; width:100%; box-sizing:border-box; height:840px; max-height:840px; align-items:stretch;">
                        <!-- 左侧卡片：1:1 镜像学生端阶段二全部结构，高度统一为 840px 纵横开阔 -->
                        <div class="card" style="padding:16px 18px; display:flex; flex-direction:column; border:1px solid #bfdbfe; min-width:0; box-sizing:border-box; height:840px; max-height:840px; gap:8px; overflow:hidden;">
                          <!-- 1. 顶部标题与字数 -->
                          <div style="flex-shrink:0; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e2e8f0; padding-bottom:8px;">
                            <div style="display:flex; align-items:center; gap:8px;">
                              <span style="font-size:15px; font-weight:800; color:#1e40af;">📝 学术协作富文本编辑器 (${activeMonitorGroup.name})</span>
                              <span style="font-size:11px; background:#ecfdf5; color:#059669; padding:2px 8px; border-radius:10px; font-weight:700; border:1px solid #a7f3d0;">🟢 实时同步中</span>
                            </div>
                            <span style="font-size:12px; color:#475569;">总字数: <b id="teacher-stage2-word-count-num" style="color:#2563eb; font-size:14px;">${(state.stage2?.unifiedContent || '').replace(/<[^>]*>/g, '').trim().length}</b> 字</span>
                          </div>

                          <!-- 2. 半程修正清单 (1:1 镜像学生端：支持折叠展开与完成状态感知) -->
                          <div id="teacher-stage2-action-plan-container">
                            ${(s2ActionPlan && s2ActionPlan.isGenerated) ? `
                              <div style="background:#ecfdf5; border:1px solid #a7f3d0; border-radius:8px; padding:6px 12px; flex-shrink:0;">
                                <div style="font-size:12px; font-weight:800; color:#059669; display:flex; justify-content:space-between; align-items:center; cursor:pointer;" id="btn-toggle-teacher-action-plan">
                                  <div style="display:flex; align-items:center; gap:6px;">
                                    <span>📋 【半程修正清单】(审稿专家 3 项修改要求)</span>
                                    <span style="font-size:10.5px; background:#d1fae5; color:#065f46; padding:1px 6px; border-radius:8px; font-weight:700;">已生成</span>
                                  </div>
                                  <span id="icon-toggle-teacher-plan" style="font-size:11px; color:#059669; font-weight:700;">▲ 收起</span>
                                </div>
                                <div id="body-teacher-action-plan" style="font-size:11.5px; color:#334155; display:flex; flex-direction:column; gap:4px; margin-top:6px;">
                                  ${(s2ActionPlan.items || []).map((item, idx) => {
                                    const isChecked = !!(s2ActionPlan.completedMap && s2ActionPlan.completedMap[idx]);
                                    return `
                                      <div style="line-height:1.4; display:flex; align-items:flex-start; gap:6px; color:${isChecked ? '#166534' : '#1e293b'};">
                                        <span>${isChecked ? '✅' : '⏳'}</span>
                                        <span style="text-decoration:${isChecked ? 'line-through' : 'none'};"><b>${idx + 1}.</b> ${escapeHtml(item)}</span>
                                      </div>
                                    `;
                                  }).join('')}
                                </div>
                              </div>
                            ` : `
                              <div style="background:#f8fafc; border:1px dashed #cbd5e1; border-radius:8px; padding:6px 12px; flex-shrink:0;">
                                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
                                  <div style="font-size:12px; font-weight:700; color:#64748b; display:flex; align-items:center; gap:6px;">
                                    <span>📋 【半程修正清单】</span>
                                    <span style="font-size:10.5px; background:${s2SubCount > 0 ? '#dbeafe' : '#e2e8f0'}; color:${s2SubCount > 0 ? '#1d4ed8' : '#475569'}; padding:1px 8px; border-radius:10px; font-weight:700;">
                                      ${s2SubCount > 0 ? `待解锁 (全员自查进度 ${s2SubCount}/${totalMemberCount}人)` : `待解锁 (0/${totalMemberCount}人)`}
                                    </span>
                                  </div>
                                  <span style="font-size:11px; color:#94a3b8;">（需全组成员完成半程自查后自动生成）</span>
                                </div>
                              </div>
                            `}
                          </div>

                          <!-- 3. 正文初稿确认进度 (1:1 镜像学生端) -->
                          <div style="flex-shrink:0; background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:8px 12px; font-size:12px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; box-shadow:0 1px 2px rgba(15,23,42,0.02);">
                            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                              <span style="font-weight:800; color:#0f172a;">✍️ 正文初稿确认进度:</span>
                              <span style="font-weight:700; color:${state.stage2?.isDraftConfirmed ? '#059669' : '#2563eb'}; background:${state.stage2?.isDraftConfirmed ? '#ecfdf5' : '#eff6ff'}; padding:2px 8px; border-radius:10px; border:1px solid ${state.stage2?.isDraftConfirmed ? '#a7f3d0' : '#bfdbfe'}; font-size:11px;">
                                ${state.stage2?.isDraftConfirmed ? '✅ 全员已确认完成初稿' : `${confirmedDraftCount}/${totalMemberCount} 人已确认`}
                              </span>
                              <div id="teacher-stage2-confirmed-pills" style="display:flex; gap:6px; flex-wrap:wrap;">
                                ${monitorMembersList.map(m => {
                                  const isConf = state.stage2?.confirmedMembers && (state.stage2.confirmedMembers[m.id] || state.stage2.confirmedMembers[m.studentCode] || (m.name && state.stage2.confirmedMembers[m.name]));
                                  return `<span style="font-size:11px; padding:1px 8px; border-radius:10px; font-weight:700; background:${isConf ? '#ecfdf5' : '#f8fafc'}; color:${isConf ? '#059669' : '#94a3b8'}; border:1px solid ${isConf ? '#a7f3d0' : '#e2e8f0'};">
                                    ${isConf ? '✓' : '○'} ${escapeHtml(m.name)}
                                  </span>`;
                                }).join('')}
                              </div>
                            </div>
                          </div>

                          <!-- 4. 协同文档视口 (未进入该阶段时显示优雅待命占位，不消耗任何带宽/CPU/内存；进入后自动实时同步) -->
                          ${state.currentStage === 'stage1' ? `
                            <div style="flex:1; min-height:560px; display:flex; flex-direction:column; align-items:center; justify-content:center; border-radius:8px; border:1.5px dashed #cbd5e1; background:#ffffff; color:#64748b; padding:24px; text-align:center; gap:8px;">
                              <span style="font-size:32px;">⏳</span>
                              <span style="font-size:14px; font-weight:700; color:#334155;">小组当前处于阶段一（学术公约拟定），尚未进入阶段二编辑部正文协作</span>
                              <span style="font-size:12px; color:#94a3b8;">待组员全员签署公约进入阶段二后，此处将自动实时同步正文协作画面</span>
                            </div>
                          ` : (() => {
                            const rawPadName = `jizhi_${activeTaskId}_${activeMonitorGId}`;
                            return `
                              <div class="teacher-etherpad-container" style="flex:1; min-height:560px; border-radius:8px; overflow:hidden; border:1.5px solid #cbd5e1; box-shadow:0 2px 8px rgba(15,23,42,0.04); background:#ffffff; position:relative; display:flex; flex-direction:column;">
                                <div style="display:flex; justify-content:space-between; align-items:center; background:#f8fafc; border-bottom:1px solid #e2e8f0; padding:6px 12px; font-size:12px; color:#475569; flex-shrink:0;">
                                  <div style="display:flex; align-items:center; gap:8px;">
                                    <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#10b981;"></span>
                                    <span style="font-weight:700; color:#1e293b;">🔒 教师端同屏镜像 (实时协同直连)</span>
                                  </div>
                                  <span style="font-size:11px; background:#ecfdf5; color:#059669; border:1px solid #a7f3d0; padding:1px 8px; border-radius:4px; font-weight:700;">实时监控</span>
                                </div>
                                <div style="position:relative; flex:1; width:100%; height:100%; min-height:520px; display:flex;">
                                  <div class="etherpad-readonly-shield" style="position:absolute; inset:0; z-index:25; background:transparent; cursor:not-allowed; pointer-events:none;" title="🔒 只读查阅模式 (已锁定禁止编辑)"></div>
                                  <iframe id="teacher-stage2-etherpad-frame" src="/p/${encodeURIComponent(rawPadName)}?userName=${encodeURIComponent('教师监控')}&userColor=%237c3aed&showControls=false&showChat=false&showLineNumbers=true&lang=zh-hans" style="flex:1; width:100%; height:100%; min-height:520px; border:none; display:block; background:#ffffff;" title="教师端实时写作同屏镜像 (只读)"></iframe>
                                </div>
                              </div>
                            `;
                          })()}

                          <!-- 5. 📊 团队协作贡献度占比 (SSRL 群体过程感知) - 真实计算，无数据为 0% -->
                          <div style="background:#ffffff; padding:10px 14px; border-radius:8px; border:1px solid #cbd5e1; flex-shrink:0; display:flex; flex-direction:column; gap:6px; box-shadow:0 1px 3px rgba(15,23,42,0.04);">
                            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
                              <span style="font-size:12px; font-weight:800; color:#1e293b;">📊 团队协作贡献度占比 (SSRL 群体过程感知):</span>
                              <div class="contrib-labels" id="teacher-stage2-contrib-labels" style="display:flex; font-size:11.5px; font-weight:700; color:#475569; gap:10px; white-space:nowrap; flex-wrap:wrap;">
                                ${(() => {
                                  const contribs = state.stage2?.memberContributions || {};
                                  let rawTotal = 0;
                                  monitorMembersList.forEach(m => { rawTotal += (contribs[m.id] || 0) + (contribs[m.studentCode] || 0); });
                                  return monitorMembersList.map((m) => {
                                    const rawVal = (contribs[m.id] || 0) + (contribs[m.studentCode] || 0);
                                    const pct = rawTotal > 0 ? Math.round((rawVal / rawTotal) * 100) : 0;
                                    return `<span style="color:${rawVal > 0 ? (m.color || '#2563eb') : '#94a3b8'}; font-weight:700;">● ${escapeHtml(m.name)}: ${pct}%</span>`;
                                  }).join('');
                                })()}
                              </div>
                            </div>
                            <div class="contrib-bars" id="teacher-stage2-contrib-bars" style="width:100%; height:10px; border-radius:5px; display:flex; overflow:hidden; background:#e2e8f0;">
                              ${(() => {
                                const contribs = state.stage2?.memberContributions || {};
                                let rawTotal = 0;
                                monitorMembersList.forEach(m => { rawTotal += (contribs[m.id] || 0) + (contribs[m.studentCode] || 0); });
                                if (rawTotal === 0) {
                                  return `<div style="width:100%; height:10px; background:#f8fafc; border-radius:5px; display:flex; align-items:center; justify-content:center; font-size:10px; color:#94a3b8; font-weight:600;">⏳ 暂无协作投入 (组员在 Etherpad 中撰写、修改正文或研讨后将平滑累计真实贡献)</div>`;
                                }
                                return monitorMembersList.map((m) => {
                                  const rawVal = (contribs[m.id] || 0) + (contribs[m.studentCode] || 0);
                                  if (rawVal === 0) return '';
                                  const pct = Math.round((rawVal / rawTotal) * 100);
                                  return `<div style="width:${pct}%; background:${m.color || '#2563eb'}; transition:width 0.3s ease;" title="${escapeHtml(m.name)}: ${pct}% (${rawVal}字)"></div>`;
                                }).join('');
                              })()}
                            </div>
                          </div>
                        </div>

                        ${renderUnifiedRightChatCard()}
                      </div>
                    `;
                  }

                  if (effectiveMonitorStage === 'stage3') {
                    const isStage3DocTab = state.stage3TeacherTab === 'doc';
                    return `
                      <div style="display:grid; grid-template-columns: minmax(0, 1fr) 300px; gap:16px; width:100%; box-sizing:border-box; height:840px; max-height:840px; align-items:stretch;">
                        <!-- 阶段三左侧卡片：高度统一为 840px；答辩页自适应内部滚动，终稿页与阶段二一样带贡献度 -->
                        <div class="card" style="padding:16px 18px; display:flex; flex-direction:column; border:1px solid #bfdbfe; min-width:0; box-sizing:border-box; height:840px; max-height:840px; gap:8px; overflow:hidden;">
                          <div style="flex-shrink:0; font-size:15.5px; font-weight:800; color:#1e40af; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e2e8f0; padding-bottom:8px;">
                            <span>🎓 阶段三实操同屏: 答辩擂台与终稿 (${activeMonitorGroup.name})</span>
                            <div style="display:flex; gap:6px;">
                              <button class="btn btn-sm ${!isStage3DocTab ? 'btn-primary' : 'btn-secondary'}" id="btn-tab-teacher-stage3-defense" style="padding:4px 12px; font-size:12px; font-weight:700; border-radius:6px; cursor:pointer;">🗣️ 答辩质询与答复</button>
                              <button class="btn btn-sm ${isStage3DocTab ? 'btn-primary' : 'btn-secondary'}" id="btn-tab-teacher-stage3-doc" style="padding:4px 12px; font-size:12px; font-weight:700; border-radius:6px; cursor:pointer;">📜 论文终稿镜像</button>
                            </div>
                          </div>

                          ${isStage3DocTab ? `
                            <!-- Tab 2: 论文终稿实时镜像 (未进入阶段三时显示待命占位，不消耗资源) -->
                            <div style="flex-shrink:0; display:flex; justify-content:space-between; align-items:center;">
                              <span style="font-size:13.5px; font-weight:800; color:#1e40af;">📜 论文终稿正文全篇镜像:</span>
                              <span style="font-size:12px; color:#64748b;">终稿字数: <b id="teacher-stage3-word-count-num" style="color:#2563eb; font-size:14px;">${((state.stage3?.finalDraft || state.stage2?.unifiedContent || '').replace(/<[^>]*>/g, '').trim()).length}</b> 字</span>
                            </div>
                            ${(state.currentStage === 'stage1' || state.currentStage === 'stage2') ? `
                              <div style="flex:1; min-height:560px; display:flex; flex-direction:column; align-items:center; justify-content:center; border-radius:8px; border:1.5px dashed #cbd5e1; background:#ffffff; color:#64748b; padding:24px; text-align:center; gap:8px;">
                                <span style="font-size:32px;">⏳</span>
                                <span style="font-size:14px; font-weight:700; color:#334155;">小组尚未进入阶段三论文终稿与答辩阶段</span>
                                <span style="font-size:12px; color:#94a3b8;">待小组进入阶段三后，此处将自动实时呈现论文终稿镜像</span>
                              </div>
                            ` : (() => {
                              const rawPadName = `jizhi_${activeTaskId}_${activeMonitorGId}`;
                              if (!state._readOnlyPadMap) state._readOnlyPadMap = {};
                              const readOnlyPadId = state._readOnlyPadMap[rawPadName];
                              if (!readOnlyPadId) {
                                fetch(`sync.php?action=get_readonly_pad_id&padId=${rawPadName}`).then(r => r.json()).then(res => {
                                  if (res && res.success && res.readOnlyID) {
                                    state._readOnlyPadMap[rawPadName] = res.readOnlyID;
                                    const f3 = document.querySelector('#teacher-stage3-etherpad-frame');
                                    if (f3 && !f3.src.includes(res.readOnlyID)) {
                                      f3.src = `/p/${res.readOnlyID}?userName=${encodeURIComponent('教师监控')}&userColor=%237c3aed&showControls=false&showChat=false&showLineNumbers=true&lang=zh-hans`;
                                    }
                                  }
                                }).catch(() => {});
                              }
                              const targetPad = readOnlyPadId || rawPadName;
                              return `
                                <div class="teacher-etherpad-container" style="flex:1; min-height:560px; border-radius:8px; overflow:hidden; border:1.5px solid #cbd5e1; box-shadow:0 2px 8px rgba(15,23,42,0.04); background:#ffffff; position:relative; display:flex; flex-direction:column;">
                                  <div style="display:flex; justify-content:space-between; align-items:center; background:#f8fafc; border-bottom:1px solid #e2e8f0; padding:6px 12px; font-size:12px; color:#475569; flex-shrink:0;">
                                    <div style="display:flex; align-items:center; gap:8px;">
                                      <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#10b981;"></span>
                                      <span style="font-weight:700; color:#1e293b;">🔒 教师端终稿镜像 (纯净只读阅卷 · 实时协同直连)</span>
                                    </div>
                                    <span style="font-size:11px; background:#ecfdf5; color:#059669; border:1px solid #a7f3d0; padding:1px 8px; border-radius:4px; font-weight:700;">只读监控</span>
                                  </div>
                                  <div style="position:relative; flex:1; width:100%; height:100%; min-height:520px; display:flex;">
                                    <div class="etherpad-readonly-shield" style="position:absolute; inset:0; z-index:25; background:transparent; cursor:not-allowed; pointer-events:none;" title="🔒 只读查阅模式 (已锁定禁止编辑)"></div>
                                    <iframe id="teacher-stage3-etherpad-frame" src="/p/${encodeURIComponent(targetPad)}?userName=${encodeURIComponent('教师监控')}&userColor=%237c3aed&showControls=false&showChat=false&showLineNumbers=true&lang=zh-hans" style="flex:1; width:100%; height:100%; min-height:520px; border:none; display:block; background:#ffffff;" title="教师端论文终稿同屏镜像 (只读)"></iframe>
                                  </div>
                                </div>
                              `;
                            })()}
                            <div style="background:#ffffff; padding:10px 14px; border-radius:8px; border:1px solid #cbd5e1; flex-shrink:0; display:flex; flex-direction:column; gap:6px; box-shadow:0 1px 3px rgba(15,23,42,0.04);">
                              <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
                                <span style="font-size:12px; font-weight:800; color:#1e293b;">📊 终稿协作贡献度占比 (SSRL 群体过程感知):</span>
                                <div class="contrib-labels" id="teacher-stage3-contrib-labels" style="display:flex; font-size:11.5px; font-weight:700; color:#475569; gap:10px; white-space:nowrap; flex-wrap:wrap;">
                                  ${(() => {
                                    const contribs = state.stage2?.memberContributions || {};
                                    let rawTotal = 0;
                                    monitorMembersList.forEach(m => { rawTotal += (contribs[m.id] || 0) + (contribs[m.studentCode] || 0); });
                                    return monitorMembersList.map((m) => {
                                      const rawVal = (contribs[m.id] || 0) + (contribs[m.studentCode] || 0);
                                      const pct = rawTotal > 0 ? Math.round((rawVal / rawTotal) * 100) : 0;
                                      return `<span style="color:${rawVal > 0 ? (m.color || '#2563eb') : '#94a3b8'}; font-weight:700;">● ${escapeHtml(m.name)}: ${pct}%</span>`;
                                    }).join('');
                                  })()}
                                </div>
                              </div>
                              <div class="contrib-bars" id="teacher-stage3-contrib-bars" style="width:100%; height:10px; border-radius:5px; display:flex; overflow:hidden; background:#e2e8f0;">
                                ${(() => {
                                  const contribs = state.stage2?.memberContributions || {};
                                  let rawTotal = 0;
                                  monitorMembersList.forEach(m => { rawTotal += (contribs[m.id] || 0) + (contribs[m.studentCode] || 0); });
                                  if (rawTotal === 0) {
                                    return `<div style="width:100%; height:10px; background:#f8fafc; border-radius:5px; display:flex; align-items:center; justify-content:center; font-size:10px; color:#94a3b8; font-weight:600;">⏳ 暂无协作投入</div>`;
                                  }
                                  return monitorMembersList.map((m) => {
                                    const rawVal = (contribs[m.id] || 0) + (contribs[m.studentCode] || 0);
                                    if (rawVal === 0) return '';
                                    const pct = Math.round((rawVal / rawTotal) * 100);
                                    return `<div style="width:${pct}%; background:${m.color || '#2563eb'}; transition:width 0.3s ease;" title="${escapeHtml(m.name)}: ${pct}% (${rawVal}字)"></div>`;
                                  }).join('');
                                })()}
                              </div>
                            </div>
                          ` : `
                            <!-- Tab 1: 答辩质询与答复 (撑满860px工作台，内部顺畅滚动) -->
                            <div style="flex:1; min-height:0; overflow-y:auto; background:#f8fafc; border:1px solid #bfdbfe; border-radius:10px; padding:14px; display:flex; flex-direction:column;">
                              <div style="flex-shrink:0; font-size:13.5px; font-weight:800; color:#1e40af; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
                                <span>🗣️ 答辩委员会质询与小组成员逐条答辩:</span>
                                <span style="font-size:11.5px; background:#eff6ff; color:#2563eb; padding:2px 8px; border-radius:6px; font-weight:700;">共 ${(state.stage3?.feedbackItems || []).length} 条质询对决</span>
                              </div>
                              <div id="teacher-stage3-feedback-list" style="display:flex; flex-direction:column; gap:12px; flex:1;">
                                ${(state.stage3?.feedbackItems && state.stage3.feedbackItems.length > 0) ? state.stage3.feedbackItems.map((item, i) => {
                                  const isProp = item.role === 'proponent';
                                  const roleLabel = item.speaker || (isProp ? '正方委员 Agent (立论支持)' : '反方委员 Agent (学术质询)');
                                  const titleLabel = item.title ? ` - ${item.title}` : '';
                                  const questionText = item.content || item.question || item.comment || item.text || '质询内容生成中...';
                                  return `
                                  <div style="background:#ffffff; border:1.5px solid ${item.response ? '#93c5fd' : (isProp ? '#86efac' : '#fca5a5')}; border-radius:8px; padding:12px 14px; font-size:12.5px; box-shadow:0 1px 3px rgba(0,0,0,0.02);">
                                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                                      <span style="font-weight:800; color:${isProp ? '#059669' : '#0f172a'}; font-size:13px;">
                                        ${isProp ? '🟢 专家立论支持' : `💬 答辩质询 #${i+1}`} (${escapeHtml(roleLabel)}${escapeHtml(titleLabel)}):
                                      </span>
                                      <span style="font-size:11px; background:${item.response ? '#ecfdf5' : (isProp ? '#eff6ff' : '#fef3c7')}; color:${item.response ? '#059669' : (isProp ? '#2563eb' : '#b45309')}; padding:2px 8px; border-radius:4px; font-weight:700;">
                                        ${item.response ? '✅ 小组已答辩并归档' : (isProp ? '🌟 专家肯定 (立论支持无需答辩)' : '⏳ 待组内研讨答辩')}
                                      </span>
                                    </div>
                                    <div style="color:#1e293b; background:#f8fafc; padding:8px 10px; border-radius:6px; margin-bottom:8px; border-left:3px solid ${isProp ? '#10b981' : '#ef4444'}; line-height:1.5;">
                                      ${escapeHtml(questionText)}
                                    </div>
                                    ${item.response ? `
                                      <div style="color:#065f46; background:#ecfdf5; padding:8px 10px; border-radius:6px; border-left:3px solid #10b981; line-height:1.5;">
                                        <b>✍️ 小组辩护陈述与修改方案:</b> ${escapeHtml(item.response)}
                                      </div>
                                    ` : `
                                      <div style="color:#94a3b8; font-style:italic; font-size:11.5px; padding:4px 8px;">
                                        ${isProp ? '（立论支持默认通过，如无补充可直接留空）' : '（本小组尚未提交对该质询的答辩回应）'}
                                      </div>
                                    `}
                                  </div>
                                `;}).join('') : `
                                  <div style="text-align:center; padding:60px 16px; color:#94a3b8; font-size:13px; background:#ffffff; border-radius:8px; border:1px dashed #cbd5e1; flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px;">
                                    <span style="font-size:28px;">⏳</span>
                                    <span>答辩委员会尚未对该小组发布质询意见，或小组正处于答辩准备中</span>
                                  </div>
                                `}
                              </div>
                            </div>
                          `}
                        </div>

                        ${renderUnifiedRightChatCard()}
                      </div>
                    `;
                  }

                  return '';
                })()}

              </div>
            `;
          })() : ''}

        </main>
      </div>
    `;

    container.dataset.renderedClassId = activeClassId;
    container.dataset.renderedGroupId = activeMonitorGId;
    container.dataset.renderedTaskId = effectiveMonitorTaskId;
    container.dataset.renderedStage = effectiveMonitorStage;
    container.dataset.renderedMode = monitorStageMode;
    container.dataset.renderedS3Tab = currentS3Tab;
    container.dataset.renderedTab = activeTab;

    // 🔒 确保教师端无论是阶段二还是阶段三的 Etherpad iframe，均被 DOM 内核层权威锁定为只读
    const tFrame2 = container.querySelector('#teacher-stage2-etherpad-frame');
    if (tFrame2) enforceEtherpadReadonly(tFrame2);
    const tFrame3 = container.querySelector('#teacher-stage3-etherpad-frame');
    if (tFrame3) enforceEtherpadReadonly(tFrame3);

    const btnLogout = container.querySelector('#btn-logout');
    if (btnLogout) btnLogout.addEventListener('click', () => onLogout());

    const btnChangePwd = container.querySelector('#btn-teacher-change-pwd');
    if (btnChangePwd) {
      btnChangePwd.addEventListener('click', () => {
        authManager.openChangePasswordModal();
      });
    }

    const btnSwitchStudent = container.querySelector('#btn-switch-student-preview');
    if (btnSwitchStudent) btnSwitchStudent.addEventListener('click', () => onSwitchToStudentView());

    container.querySelectorAll('.teacher-tab-nav').forEach(btn => {
      btn.addEventListener('click', () => {
        state.teacherActiveTab = btn.dataset.tab;
        try {
          sessionStorage.setItem('jizhi_teacher_active_tab', btn.dataset.tab);
          localStorage.setItem('jizhi_teacher_active_tab', btn.dataset.tab);
        } catch (e) {}
        if (!state.stage1) state.stage1 = { topics: [], bidLogs: [], contract: { confirmedMembers: {}, taskAssignments: {}, timeAllocations: {} } };
        if (!state.stage2) state.stage2 = { unifiedContent: '', memberContributions: {} };
        if (!state.stage3) state.stage3 = { reviews: [] };
        if (!state.chatLogs) state.chatLogs = { stage1: [], stage2: [], stage3: [] };

        if (btn.dataset.tab === 'view_monitoring' && window.app) {
          try {
            window.app.loadGroupState(state.activeMonitorGroupId || (activeClass?.groups?.[0]?.id) || null);
            if (window.app.cloudSyncEngine) {
              window.app.cloudSyncEngine.updateScopeKeys();
              window.app.cloudSyncEngine.pullFromServer().catch(() => {});
            }
          } catch (e) {}
        }
        renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
      });
    });

    container.querySelectorAll('.btn-select-class').forEach(btn => {
      btn.addEventListener('click', () => {
        const newCId = btn.dataset.id;
        state.activeClassId = newCId;
        const targetC = (authManager.getClasses() || []).find(c => c.id === newCId);
        const cTasks = (authManager.getTasks() || []).filter(t => t.classId === newCId || (targetC && t.className === targetC.name) || (!t.classId && newCId === 'class_101'));
        state.activeTaskId = cTasks[0] ? cTasks[0].id : 'task_default';
        state.activeMonitorGroupId = (targetC && targetC.groups && targetC.groups[0]) ? targetC.groups[0].id : 'group_1';
        // 🛡️ 彻底清空旧班级全景与视图缓存
        state.monitorPanorama = null;
        state._lastMonitorHash = '';
        state._lastEpHash = '';
        state.stage1 = null;
        state.stage2 = null;
        state.stage3 = null;
        state.chatLogs = null;
        if (window.app && window.app.state) {
          window.app.state.activeClassId = newCId;
          window.app.state.activeTaskId = state.activeTaskId;
          window.app.state.activeMonitorGroupId = state.activeMonitorGroupId;
        }
        try {
          sessionStorage.setItem('jizhi_teacher_active_class_id', newCId);
          localStorage.setItem('jizhi_teacher_active_class_id', newCId);
          sessionStorage.setItem('jizhi_teacher_active_group_id', state.activeMonitorGroupId);
          localStorage.setItem('jizhi_teacher_active_group_id', state.activeMonitorGroupId);
        } catch (e) {}
        renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
      });
    });

    // 🗑️ 删除班级（带弹窗二次确认）
    container.querySelectorAll('.btn-delete-class').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const cId = btn.dataset.id;
        const cName = btn.dataset.name || '此班级';
        if (confirm(`🗑️【危险操作·删除班级确认】\n\n您确定要彻底删除教学班级【${cName}】吗？\n\n⚠️ 警告：删除后属于该班级的小组、写作任务、通知与问卷将一并级联删除！`)) {
          try {
            authManager.deleteClass(cId);
            const remainingClasses = authManager.getClasses();
            const nextC = remainingClasses[0] || { id: 'class_101', groups: [] };
            state.activeClassId = nextC.id;
            const cTasks = (authManager.getTasks() || []).filter(t => t.classId === nextC.id || (!t.classId && nextC.id === 'class_101'));
            state.activeTaskId = cTasks[0] ? cTasks[0].id : 'task_default';
            state.activeMonitorGroupId = (nextC.groups && nextC.groups[0]) ? nextC.groups[0].id : 'group_1';
            state.monitorPanorama = null;
            state._lastMonitorHash = '';
            state._lastEpHash = '';
            state.stage1 = null;
            state.stage2 = null;
            state.stage3 = null;
            state.chatLogs = null;
            if (window.app && window.app.state) {
              window.app.state.activeClassId = nextC.id;
              window.app.state.activeTaskId = state.activeTaskId;
              window.app.state.activeMonitorGroupId = state.activeMonitorGroupId;
            }
            alert(`✅ 教学班级【${cName}】已成功删除！`);
            renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
          } catch (err) {
            alert('❌ ' + err.message);
          }
        }
      });
    });

    // 🗑️ 一键清空当前班级学生（带弹窗二次确认）
    const btnClearStudents = container.querySelector('#btn-clear-class-students');
    if (btnClearStudents) {
      btnClearStudents.addEventListener('click', () => {
        if (confirm(`🗑️【清空名册确认】\n\n您确定要一键清空【${activeClass.name}】下的所有学生吗？\n\n⚠️ 注：清空后将重置本班学生名册与未划分的小组成员绑定！`)) {
          // 清空当前班级的学生关联，并重置小组
          const users = authManager.getUsers();
          users.forEach(u => {
            if (u.role !== 'teacher') {
              if (u.classIds && Array.isArray(u.classIds)) {
                u.classIds = u.classIds.filter(id => id !== activeClass.id);
              }
              if (u.classId === activeClass.id) {
                u.classId = (u.classIds && u.classIds.length > 0) ? u.classIds[0] : null;
              }
            }
          });
          localStorage.setItem(STORAGE_KEY_USERS_DB, JSON.stringify(users));

          // 清空班级 studentIds 与小组分配
          const classes = authManager.getClasses();
          const targetCls = classes.find(c => c.id === activeClass.id);
          if (targetCls) {
            targetCls.studentIds = [];
            (targetCls.groups || []).forEach(g => { g.members = []; });
            localStorage.setItem(STORAGE_KEY_CLASSES, JSON.stringify(classes));
          }
          authManager.pushGlobalMeta();
          alert(`✅ 已成功清空【${activeClass.name}】的全部学生名册！`);
          renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
        }
      });
    }

    const btnCreateClass = container.querySelector('#btn-v1-create-class');
    if (btnCreateClass) {
      btnCreateClass.addEventListener('click', () => {
        const name = prompt('请输入新教学班级名称 (例如: 《现代教育技术》2026春02班):', '《现代教育技术》2026春02班');
        if (name) {
          const newC = authManager.createClass(name);
          state.activeClassId = newC.id;
          state.activeTaskId = 'task_default';
          state.activeMonitorGroupId = (newC.groups && newC.groups[0]) ? newC.groups[0].id : 'group_1';
          state.monitorPanorama = null;
          state._lastMonitorHash = '';
          state._lastEpHash = '';
          state.stage1 = null;
          state.stage2 = null;
          state.stage3 = null;
          state.chatLogs = null;
          if (window.app && window.app.state) {
            window.app.state.activeClassId = newC.id;
            window.app.state.activeTaskId = state.activeTaskId;
            window.app.state.activeMonitorGroupId = state.activeMonitorGroupId;
          }
          renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
        }
      });
    }

    // 👨‍🎓 1. 单条创建学生账号（纯粹创建面板）
    const btnAddStd = container.querySelector('#btn-v1-add-student');
    if (btnAddStd) {
      btnAddStd.addEventListener('click', () => {
        document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
          <div class="teacher-modal-card fancy-task-modal" style="width:480px; background:#ffffff; border:1px solid #e2e8f0; box-shadow:0 20px 45px rgba(15,23,42,0.12);">
            <div class="teacher-modal-header" style="background:linear-gradient(135deg, #eff6ff, #f8fafc); border-bottom:1px solid #e2e8f0; padding:18px 24px; display:flex; justify-content:space-between; align-items:center;">
              <div class="modal-header-title" style="display:flex; align-items:center; gap:10px;">
                <div class="modal-icon-badge" style="background:#dbeafe; color:#2563eb; font-size:20px; padding:6px 10px; border-radius:10px;">✏️</div>
                <div><h3 style="margin:0; font-size:17px; font-weight:800; color:#0f172a;">单条创建学生账号 (${activeClass.name})</h3></div>
              </div>
              <button class="modal-close-btn" id="btn-close-single-student" style="background:#f1f5f9; border:none; color:#64748b; font-size:16px; border-radius:8px; width:30px; height:30px; cursor:pointer;">✕</button>
            </div>

            <div class="teacher-modal-body" style="padding:22px 24px;">
              <div class="teacher-form-group" style="margin-bottom:14px;">
                <label style="font-size:13px; font-weight:700; color:#334155; margin-bottom:6px; display:block;"><span class="req" style="color:#dc2626;">*</span> 学生姓名</label>
                <input type="text" id="modal-std-name" class="teacher-input fancy" placeholder="输入学生姓名 (如: 张三)" value="" style="background:#ffffff; border:1.5px solid #cbd5e1; color:#0f172a; padding:10px 14px; border-radius:8px; width:100%; font-size:13.5px;">
              </div>
              <div class="teacher-form-group" style="margin-bottom:14px;">
                <label style="font-size:13px; font-weight:700; color:#334155; margin-bottom:6px; display:block;"><span class="req" style="color:#dc2626;">*</span> 学生学号 (登录账号)</label>
                <input type="text" id="modal-std-code" class="teacher-input fancy" placeholder="请输入学生学号或账号" value="" style="background:#ffffff; border:1.5px solid #cbd5e1; color:#0f172a; padding:10px 14px; border-radius:8px; width:100%; font-size:13.5px;">
              </div>
              <div class="teacher-form-group">
                <label style="font-size:13px; font-weight:700; color:#334155; margin-bottom:6px; display:block;">设置初始密码 (留空统一定为 123)</label>
                <input type="password" id="modal-std-password" class="teacher-input fancy" placeholder="留空默认为 123" style="background:#ffffff; border:1.5px solid #cbd5e1; color:#0f172a; padding:10px 14px; border-radius:8px; width:100%; font-size:13.5px;">
              </div>
            </div>
            <div class="teacher-modal-footer" style="background:#f8fafc; border-top:1px solid #e2e8f0; padding:14px 24px; display:flex; justify-content:flex-end; gap:10px;">
              <button class="modal-btn cancel" id="btn-cancel-single-std" style="background:#ffffff; border:1px solid #cbd5e1; color:#475569; padding:8px 18px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer;">取消</button>
              <button class="modal-btn submit task-theme" id="btn-submit-single-std" style="background:linear-gradient(135deg, #1d4ed8, #2563eb); border:none; color:white; padding:8px 20px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer;">👨‍🎓 确认创建并加入本班</button>
            </div>
          </div>
        `;
        document.body.appendChild(modal);

        const closeModal = () => { modal.remove(); };
        modal.querySelector('#btn-close-single-student').addEventListener('click', closeModal);
        modal.querySelector('#btn-cancel-single-std').addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

        modal.querySelector('#btn-submit-single-std').addEventListener('click', () => {
          const name = modal.querySelector('#modal-std-name').value.trim();
          const code = modal.querySelector('#modal-std-code').value.trim();
          const pwd = modal.querySelector('#modal-std-password').value.trim();
          if (!name || !code) { alert('⚠️ 请填齐学生姓名和学号！'); return; }
          try {
            const users = authManager.getUsers();
            const isAlreadyExist = users.some(u => (u.studentCode && u.studentCode.trim().toLowerCase() === code.toLowerCase()) || (u.username && u.username.trim().toLowerCase() === code.toLowerCase()));
            const targetUser = authManager.addStudentToClass(name, code, activeClass.id, pwd || '123');
            if (isAlreadyExist) {
              alert(`💡 学号【${code}】对应的学生【${targetUser.name}】已存在于系统中，已跳过重复创建并自动关联至本班级【${activeClass.name}】！`);
            } else {
              alert(`🎉 成功创建并添加新学生【${targetUser.name} (学号: ${code})】至当前班级！`);
            }
            closeModal();
            renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
          } catch (err) {
            alert('❌ ' + err.message);
          }
        });
      });
    }

    // 👥 2. 加入已有学生到班级（独立面板）
    const btnEnrollExisting = container.querySelector('#btn-v1-enroll-existing-student');
    if (btnEnrollExisting) {
      btnEnrollExisting.addEventListener('click', () => {
        document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
        const allUsers = authManager.getUsers();
        const currentClassStudentIds = new Set(authManager.getClassStudents(activeClass.id).map(s => s.id));
        const unenrolledStudents = allUsers.filter(u =>
          u.role !== 'teacher' && !currentClassStudentIds.has(u.id)
        );

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
          <div class="teacher-modal-card fancy-task-modal" style="width:580px; background:#ffffff; border:1px solid #e2e8f0; box-shadow:0 20px 45px rgba(15,23,42,0.12);">
            <div class="teacher-modal-header" style="background:linear-gradient(135deg, #eff6ff, #f8fafc); border-bottom:1px solid #e2e8f0; padding:18px 24px; display:flex; justify-content:space-between; align-items:center;">
              <div class="modal-header-title" style="display:flex; align-items:center; gap:10px;">
                <div class="modal-icon-badge" style="background:#dbeafe; color:#2563eb; font-size:20px; padding:6px 10px; border-radius:10px;">👥</div>
                <div><h3 style="margin:0; font-size:17px; font-weight:800; color:#0f172a;">加入已有学生到班级 (${activeClass.name})</h3></div>
              </div>
              <button class="modal-close-btn" id="btn-close-enroll-modal" style="background:#f1f5f9; border:none; color:#64748b; font-size:16px; border-radius:8px; width:30px; height:30px; cursor:pointer;">✕</button>
            </div>

            <div class="teacher-modal-body" style="padding:20px 24px;">
              <div style="font-size:12.5px; color:#1e40af; background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:10px 14px; margin-bottom:12px;">
                💡 以下学生已在平台账号库中。勾选后可将其同时分配进本班级，<b>账号和密码保持不变，绝不重复生成</b>。
              </div>
              <div style="margin-bottom:10px;">
                <input type="text" id="input-search-enroll-std" placeholder="🔍 输入姓名或学号快速搜索已有学生..." style="background:#ffffff; border:1.5px solid #cbd5e1; color:#0f172a; padding:8px 12px; border-radius:8px; width:100%; font-size:13px; outline:none;">
              </div>
              <div id="enroll-std-list-box" style="max-height:280px; overflow-y:auto; display:flex; flex-direction:column; gap:8px;">
                ${unenrolledStudents.length === 0 ? `
                  <div style="text-align:center; color:#64748b; padding:32px; font-size:13.5px;">
                    ✅ 平台内所有学生账号均已加入当前班级，无待加入学生
                  </div>
                ` : unenrolledStudents.map(s => {
                  const otherClasses = authManager.getClasses().filter(c =>
                    (s.classIds || [s.classId]).includes(c.id) && c.id !== activeClass.id
                  );
                  return `
                    <label class="enroll-std-card-item" data-search="${(s.name + ' ' + (s.studentCode || '') + ' ' + (s.username || '')).toLowerCase()}" style="display:flex; align-items:center; gap:12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px 14px; cursor:pointer; transition:all 0.15s;">
                      <input type="checkbox" class="enroll-chk" data-uid="${s.id}" style="width:17px; height:17px; cursor:pointer; accent-color:#2563eb;">
                      <div>
                        <div style="font-size:14px; font-weight:800; color:#0f172a;">${s.avatar || '👤'} ${s.name} <code style="color:#2563eb; font-family:monospace; margin-left:6px;">${s.studentCode || s.username}</code></div>
                        <div style="font-size:12px; color:#64748b; margin-top:2px;">
                          ${otherClasses.length > 0 ? `现归属班级: <b>${otherClasses.map(c => c.name).join(', ')}</b>` : '已入库学生'}
                        </div>
                      </div>
                    </label>
                  `;
                }).join('')}
              </div>
            </div>
            <div class="teacher-modal-footer" style="background:#f8fafc; border-top:1px solid #e2e8f0; padding:14px 24px; display:flex; justify-content:flex-end; gap:10px;">
              <button class="modal-btn cancel" id="btn-cancel-enroll" style="background:#ffffff; border:1px solid #cbd5e1; color:#475569; padding:8px 18px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer;">取消</button>
              <button class="modal-btn submit task-theme" id="btn-submit-enroll" style="background:linear-gradient(135deg, #1d4ed8, #2563eb); border:none; color:white; padding:8px 20px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer;">👥 确认加入本班</button>
            </div>
          </div>
        `;
        document.body.appendChild(modal);

        const closeModal = () => { modal.remove(); };
        modal.querySelector('#btn-close-enroll-modal').addEventListener('click', closeModal);
        modal.querySelector('#btn-cancel-enroll').addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

        // 🔍 模糊搜索过滤
        const searchEnrollInput = modal.querySelector('#input-search-enroll-std');
        if (searchEnrollInput) {
          searchEnrollInput.addEventListener('input', (e) => {
            const q = (e.target.value || '').trim().toLowerCase();
            modal.querySelectorAll('.enroll-std-card-item').forEach(el => {
              const str = el.dataset.search || '';
              if (!q || str.includes(q)) el.style.display = 'flex';
              else el.style.display = 'none';
            });
          });
        }

        // 提交加入本班
        modal.querySelector('#btn-submit-enroll').addEventListener('click', () => {
          const checked = modal.querySelectorAll('.enroll-chk:checked');
          if (checked.length === 0) { alert('⚠️ 请勾选至少一位学生！'); return; }
          checked.forEach(chk => {
            const users = authManager.getUsers();
            const student = users.find(u => u.id === chk.dataset.uid);
            if (student) {
              if (!student.classIds || !Array.isArray(student.classIds)) {
                student.classIds = student.classId ? [student.classId] : [];
              }
              if (!student.classIds.includes(activeClass.id)) {
                student.classIds.push(activeClass.id);
              }
            }
            localStorage.setItem(STORAGE_KEY_USERS_DB, JSON.stringify(users));

            const classes = authManager.getClasses();
            const cls = classes.find(c => c.id === activeClass.id);
            if (cls) {
              if (!cls.studentIds) cls.studentIds = [];
              if (!cls.studentIds.includes(chk.dataset.uid)) cls.studentIds.push(chk.dataset.uid);
              localStorage.setItem(STORAGE_KEY_CLASSES, JSON.stringify(classes));
            }
          });
          authManager.pushGlobalMeta();
          closeModal();
          alert(`🎉 成功将选中的 ${checked.length} 位学生加入当前班级【${activeClass.name}】！`);
          renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
        });
      });
    }

    const btnImportFile = container.querySelector('#btn-v1-import-file');
    if (btnImportFile) {
      btnImportFile.addEventListener('click', () => {
        document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
          <div class="teacher-modal-card fancy-task-modal" style="width:620px; background:#ffffff; border:1px solid #e2e8f0; box-shadow:0 20px 45px rgba(15,23,42,0.15); border-radius:16px; overflow:hidden;">
            <div class="teacher-modal-header" style="background:linear-gradient(135deg, #1d4ed8, #2563eb); color:#ffffff; padding:18px 24px; display:flex; justify-content:space-between; align-items:center;">
              <div class="modal-header-title" style="display:flex; align-items:center; gap:10px;">
                <div class="modal-icon-badge" style="background:rgba(255,255,255,0.2); color:#ffffff; font-size:20px; padding:6px 10px; border-radius:10px;">📥</div>
                <div>
                  <h3 style="margin:0; font-size:17px; font-weight:800; color:#ffffff;">上传 XLSX / CSV 文件导入学生账号 (${activeClass.name})</h3>
                  <div style="font-size:11.5px; opacity:0.9; margin-top:2px;">支持智能识别学生姓名与学号，未填密码将默认设为 123</div>
                </div>
              </div>
              <button class="modal-close-btn" id="btn-close-file-modal" style="background:rgba(255,255,255,0.2); border:none; color:#ffffff; font-size:16px; border-radius:8px; width:30px; height:30px; cursor:pointer; display:flex; align-items:center; justify-content:center;">✕</button>
            </div>
            <div class="teacher-modal-body" style="padding:22px 24px; background:#ffffff;">
              <div class="teacher-form-group">
                <label style="font-size:13px; font-weight:700; color:#334155; margin-bottom:6px; display:block;"><span class="req" style="color:#dc2626;">*</span> 选择本地 .xlsx 或 .csv 文件上传</label>
                <div id="file-dropzone" style="border:2px dashed #93c5fd; border-radius:12px; padding:22px; text-align:center; background:#eff6ff; cursor:pointer; transition:all 0.2s ease;">
                  <input type="file" id="modal-file-input" accept=".xlsx, .xls, .csv" style="display:none;">
                  <div id="dropzone-text">
                    <span style="font-size:32px;">📄</span>
                    <div style="font-size:14px; font-weight:700; color:#1d4ed8; margin-top:6px;">点击选择或拖拽本地 .xlsx / .csv 文件到此处</div>
                    <div style="font-size:11.5px; color:#3b82f6; margin-top:2px;">支持包含【姓名】、【学号】列的标准表格</div>
                  </div>
                </div>
              </div>
              <div class="teacher-form-group" style="margin-top:16px;">
                <label style="font-size:13px; font-weight:700; color:#334155; margin-bottom:6px; display:block;">或 直接粘贴名册文本 (每行一人)</label>
                <textarea id="modal-paste-textarea" class="teacher-textarea fancy" style="min-height:90px; font-family:monospace; font-size:13px; width:100%; box-sizing:border-box; padding:10px 12px; border:1.5px solid #cbd5e1; border-radius:8px; outline:none;" placeholder="每行一位学生，逗号或空格分隔：&#10;姓名, 登录账号, 学号, 初始密码(可选)"></textarea>
              </div>
            </div>
            <div class="teacher-modal-footer" style="background:#f8fafc; border-top:1px solid #e2e8f0; padding:14px 24px; display:flex; justify-content:flex-end; gap:10px;">
              <button class="modal-btn cancel" id="btn-cancel-file-modal" style="background:#ffffff; border:1px solid #cbd5e1; color:#475569; padding:8px 18px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer;">取消</button>
              <button class="modal-btn submit task-theme" id="btn-submit-file-import" style="background:linear-gradient(135deg, #1d4ed8, #2563eb); border:none; color:#ffffff; padding:8px 22px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; box-shadow:0 3px 8px rgba(37,99,235,0.25);">
                🚀 确认解析并导入学生池 (未填密码默认为 123)
              </button>
            </div>
          </div>
        `;
        document.body.appendChild(modal);

        const closeModal = () => { modal.remove(); if (typeof onEscKey !== 'undefined') document.removeEventListener('keydown', onEscKey); };
        modal.querySelector('#btn-close-file-modal').addEventListener('click', closeModal);
        modal.querySelector('#btn-cancel-file-modal').addEventListener('click', closeModal);

        modal.addEventListener('click', (e) => {
          if (e.target === modal) closeModal();
        });
        const onEscKey = (e) => {
          if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', onEscKey);
          }
        };
        document.addEventListener('keydown', onEscKey);

        const fileInput = modal.querySelector('#modal-file-input');
        const dropzone = modal.querySelector('#file-dropzone');
        const dropText = modal.querySelector('#dropzone-text');
        const textarea = modal.querySelector('#modal-paste-textarea');
        let loadedParsedStudents = null;

        dropzone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
          if (e.target.files && e.target.files[0]) {
            const f = e.target.files[0];
            dropText.innerHTML = `<span style="font-size:28px;">✅</span><div style="font-size:13px; color:#34d399; font-weight:700;">已读取文件: ${f.name}</div>`;
            parseXLSXOrCSVFile(f, (parsedList) => {
              loadedParsedStudents = parsedList;
              dropText.innerHTML = `<span style="font-size:28px;">🎉</span><div style="font-size:14px; color:#34d399; font-weight:700;">成功解析 ${parsedList.length} 名学生记录！</div>`;
            });
          }
        });

        modal.querySelector('#btn-submit-file-import').addEventListener('click', () => {
          let listToImport = loadedParsedStudents;
          if (!listToImport && textarea.value.trim()) {
            listToImport = parseCSVText(textarea.value.trim());
          }
          if (!listToImport || listToImport.length === 0) {
            alert('⚠️ 请上传 XLSX/CSV 文件或粘贴名册文本！');
            return;
          }
          const { createdCount, linkedCount, totalProcessed, linkedList } = authManager.batchAddStudentsToClass(listToImport, activeClass.id);
          let tipMsg = `🎉 名册导入完成！\n\n✅ 当前班级【${activeClass.name}】共计导入/就绪学生: ${totalProcessed} 人\n• 🆕 全新创建入库: ${createdCount} 人\n• 🔗 关联已有账号 (如跨班学生): ${linkedCount} 人`;
          if (linkedList && linkedList.length > 0) {
            tipMsg += `\n\n💡 以下 ${linkedList.length} 位学生已存在于系统数据库（同一账号数据），已直接关联至本班展示：\n` + 
              linkedList.map((s, idx) => `${idx + 1}. ${s.name} (学号: ${s.code})`).join('\n');
          }
          alert(tipMsg);
          closeModal();
          renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
        });
      });
    }

    const setupGroupModal = (editingGroupId = null) => {
      document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
      const cls = activeClass;
      const targetGroup = editingGroupId ? (cls.groups || []).find(g => g.id === editingGroupId) : null;
      const currentMembers = targetGroup ? (targetGroup.members || []) : [];
      const availableStudents = authManager.getAvailableStudentsForGroup(cls.id, editingGroupId);

      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="teacher-modal-card fancy-task-modal" style="width:600px; background:#ffffff; border:1px solid #e2e8f0; box-shadow:0 20px 45px rgba(15,23,42,0.12);">
          <div class="teacher-modal-header" style="background:linear-gradient(135deg, #eff6ff, #f8fafc); border-bottom:1px solid #e2e8f0; padding:18px 24px;">
            <div class="modal-header-title" style="display:flex; align-items:center; gap:10px;">
              <div class="modal-icon-badge" style="background:#dbeafe; color:#2563eb; font-size:20px; padding:6px 10px; border-radius:10px;">👥</div>
              <div>
                <h3 style="margin:0; font-size:17px; font-weight:800; color:#0f172a;">${targetGroup ? `编辑【${targetGroup.name}】小组成员` : '新建协作小组'} (${cls.name})</h3>
              </div>
            </div>
            <button class="modal-close-btn" id="btn-close-group-edit" style="background:#f1f5f9; border:none; color:#64748b; font-size:16px; border-radius:8px; width:30px; height:30px; cursor:pointer;">✕</button>
          </div>
          <div class="teacher-modal-body" style="padding:22px 24px;">
            <div class="teacher-form-group" style="margin-bottom:16px;">
              <label style="font-size:13px; font-weight:700; color:#334155; margin-bottom:6px; display:block;"><span class="req" style="color:#dc2626;">*</span> 小组名称</label>
              <input type="text" id="modal-grp-name" class="teacher-input fancy" value="${targetGroup ? targetGroup.name : `第 ${(cls.groups || []).length + 1} 协作小组`}" placeholder="输入小组名称" style="background:#ffffff; border:1.5px solid #cbd5e1; color:#0f172a; padding:10px 14px; border-radius:8px; width:100%; font-size:13.5px;">
            </div>

            <div class="teacher-form-group">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <label style="font-size:13px; font-weight:700; color:#334155; margin:0;"><span class="req" style="color:#dc2626;">*</span> 勾选组员 (仅显示未进组学生，共 ${availableStudents.length} 人)</label>
                <input type="text" id="modal-grp-std-search" placeholder="🔍 输入姓名或学号搜索..." style="background:#ffffff; border:1.5px solid #cbd5e1; color:#0f172a; padding:6px 12px; border-radius:6px; font-size:12.5px; width:210px; outline:none;">
              </div>
              <div id="modal-grp-candidates-container" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px; max-height:250px; overflow-y:auto; display:flex; flex-direction:column; gap:6px;">
                ${availableStudents.length === 0 ? '<div style="color:#64748b; font-size:13px; text-align:center; padding:20px;">✅ 当前班级所有学生均已进组，无空闲待分配学生。</div>' : ''}
                ${availableStudents.map(s => {
                  const isChecked = currentMembers.includes(s.id);
                  const otherGroup = (cls.groups || []).find(g => g.id !== editingGroupId && g.members && g.members.includes(s.id));
                  return `
                    <div class="grp-student-item" data-search="${(s.name + ' ' + (s.studentCode || '') + ' ' + (s.username || '')).toLowerCase()}" style="display:flex; justify-content:space-between; align-items:center; background:#ffffff; border:1px solid #e2e8f0; padding:10px 14px; border-radius:8px; transition:all 0.15s;">
                      <label style="display:flex; align-items:center; gap:10px; cursor:pointer; font-size:13.5px; color:#0f172a; font-weight:600; width:100%;">
                        <input type="checkbox" class="chk-grp-member" value="${s.id}" ${isChecked ? 'checked' : ''} style="width:17px; height:17px; cursor:pointer; accent-color:#2563eb;">
                        <span>${s.avatar || '👤'} <b>${s.name}</b> <code style="color:#2563eb; font-family:monospace; margin-left:4px;">${s.studentCode || s.username}</code></span>
                        ${otherGroup ? `<span style="background:#fef3c7; color:#b45309; border:1px solid #fde68a; font-size:11.5px; padding:1px 8px; border-radius:6px; font-weight:700; margin-left:auto;">(现归属: ${otherGroup.name})</span>` : ''}
                      </label>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          </div>
          <div class="teacher-modal-footer" style="background:#f8fafc; border-top:1px solid #e2e8f0; padding:14px 24px; display:flex; justify-content:flex-end; gap:10px;">
            <button class="modal-btn cancel" id="btn-cancel-grp-edit" style="background:#ffffff; border:1px solid #cbd5e1; color:#475569; padding:8px 18px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer;">取消</button>
            <button class="modal-btn submit task-theme" id="btn-submit-grp-edit" style="background:linear-gradient(135deg, #1d4ed8, #2563eb); border:none; color:white; padding:8px 20px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer;">
              💾 保存小组划分配置
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      const closeModal = () => { modal.remove(); if (typeof onEscKey !== 'undefined') document.removeEventListener('keydown', onEscKey); };
      modal.querySelector('#btn-close-group-edit').addEventListener('click', closeModal);
      modal.querySelector('#btn-cancel-grp-edit').addEventListener('click', closeModal);

      // 🔍 实时模糊搜索学生
      const searchInput = modal.querySelector('#modal-grp-std-search');
      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          const query = (e.target.value || '').trim().toLowerCase();
          modal.querySelectorAll('.grp-student-item').forEach(item => {
            const searchKey = item.dataset.search || '';
            if (!query || searchKey.includes(query)) {
              item.style.display = 'flex';
            } else {
              item.style.display = 'none';
            }
          });
        });
      }

      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
      });
      const onEscKey = (e) => {
        if (e.key === 'Escape') {
          closeModal();
          document.removeEventListener('keydown', onEscKey);
        }
      };
      document.addEventListener('keydown', onEscKey);

      modal.querySelector('#btn-submit-grp-edit').addEventListener('click', () => {
        const name = modal.querySelector('#modal-grp-name').value.trim();
        const selectedUserIds = Array.from(modal.querySelectorAll('.chk-grp-member:checked')).map(cb => cb.value);

        if (!name) { alert('⚠️ 请输入小组名称！'); return; }
        try {
          authManager.updateGroupMembers(cls.id, editingGroupId || ('group_' + Date.now()), name, selectedUserIds);
          closeModal();
          renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
        } catch (err) {
          alert('❌ ' + err.message);
        }
      });
    };

    const btnCreateGroupV1 = container.querySelector('#btn-v1-create-group');
    if (btnCreateGroupV1) btnCreateGroupV1.addEventListener('click', () => setupGroupModal(null));

    container.querySelectorAll('.btn-edit-group-members').forEach(btn => {
      btn.addEventListener('click', () => setupGroupModal(btn.dataset.gid));
    });

    container.querySelectorAll('.reset-student-pwd-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const account = btn.dataset.account;
        const name = btn.dataset.name || account;
        if (confirm(`🔑【教师密码重置确认】\n\n您确定要将学生【${name}】(账号: ${account}) 的登录密码重置为初始密码 123 吗？`)) {
          try {
            const currT = authManager.getCurrentUser();
            const tId = (currT && (currT.studentCode || currT.username || currT.id)) || '';
            const tToken = (currT && (currT.token || currT.activeSessionId)) || '';

            const res = await fetch('sync.php?action=reset_student_password', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ account, newPassword: '123', userId: tId, token: tToken })
            });
            const data = await res.json();
            if (data && data.success) {
              alert(`✅ ${data.message || `学生【${name}】密码已成功重置为 123！`}`);
              authManager.pullGlobalMeta().then(() => {
                renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
              });
            } else {
              alert('❌ ' + (data.message || '重置失败'));
            }
          } catch (e) {
            alert('❌ 网络请求失败，请稍后重试');
          }
        }
      });
    });

    container.querySelectorAll('.delete-student-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        authManager.deleteStudent(btn.dataset.id, activeClass.id);
        renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
      });
    });

    container.querySelectorAll('.btn-delete-group').forEach(btn => {
      btn.addEventListener('click', () => {
        authManager.deleteGroup(activeClass.id, btn.dataset.gid);
        renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
      });
    });

    // 🎲 随机分组 (按教师所选人数自动洗牌划分并指定组长)
    const btnRandomGroups = container.querySelector('#btn-v1-random-groups');
    const selRandomGroupSize = container.querySelector('#sel-random-group-size');
    if (btnRandomGroups) {
      btnRandomGroups.addEventListener('click', () => {
        if (classStudents.length === 0) {
          alert('⚠️ 当前班级学生池中暂无学生，请先添加学生账号！');
          return;
        }
        const groupSize = selRandomGroupSize ? parseInt(selRandomGroupSize.value, 10) || 3 : 3;
        const currentGroupsCount = (activeClass.groups || []).length;

        if (currentGroupsCount > 0) {
          // 当前已有小组，弹出模式选择弹窗
          document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
          const modal = document.createElement('div');
          modal.className = 'modal-overlay';
          modal.innerHTML = `
            <div class="teacher-modal-card fancy-task-modal" style="width:520px; background:#ffffff; border:1px solid #e2e8f0; box-shadow:0 20px 45px rgba(15,23,42,0.12);">
              <div class="teacher-modal-header" style="background:linear-gradient(135deg, #eff6ff, #f8fafc); border-bottom:1px solid #e2e8f0; padding:18px 24px;">
                <div class="modal-header-title" style="display:flex; align-items:center; gap:10px;">
                  <div class="modal-icon-badge" style="background:#dbeafe; color:#2563eb; font-size:20px; padding:6px 10px; border-radius:10px;">🎲</div>
                  <div><h3 style="margin:0; font-size:17px; font-weight:800; color:#0f172a;">选择随机分组模式 (${activeClass.name})</h3></div>
                </div>
                <button class="modal-close-btn" id="btn-close-rand-modal" style="background:#f1f5f9; border:none; color:#64748b; font-size:16px; border-radius:8px; width:30px; height:30px; cursor:pointer;">✕</button>
              </div>
              <div class="teacher-modal-body" style="display:flex; flex-direction:column; gap:14px; padding:22px 24px;">
                <div style="font-size:13.5px; color:#475569; font-weight:700;">当前班级已有 <b style="color:#2563eb;">${currentGroupsCount}</b> 个小组。请选择分组方式：</div>

                <button id="btn-rand-mode-append" style="background:#f0fdf4; border:1.5px solid #86efac; border-radius:12px; padding:16px; text-align:left; cursor:pointer; display:flex; flex-direction:column; gap:6px; transition:all 0.2s ease;">
                  <div style="font-size:15px; font-weight:800; color:#15803d; display:flex; align-items:center; gap:6px;">
                    <span>🧩 模式一：保留已有小组，仅将【未进组学生】随机组队</span>
                    <span style="background:#dcfce7; color:#166534; font-size:11px; padding:2px 6px; border-radius:4px;">推荐</span>
                  </div>
                  <div style="font-size:12.5px; color:#4b5563; line-height:1.5;">已有小组及组员保持不动，系统提取所有未进组的学生按每组 <b>${groupSize}</b> 人顺延建立新小组。</div>
                </button>

                <button id="btn-rand-mode-reset" style="background:#fffbeb; border:1.5px solid #fcd34d; border-radius:12px; padding:16px; text-align:left; cursor:pointer; display:flex; flex-direction:column; gap:6px; transition:all 0.2s ease;">
                  <div style="font-size:15px; font-weight:800; color:#b45309;">💥 模式二：全员打散重组 (覆盖重排)</div>
                  <div style="font-size:12.5px; color:#4b5563; line-height:1.5;">清空已有全部小组，将全班 <b>${classStudents.length}</b> 名学生重新洗牌并平均分配为每组 <b>${groupSize}</b> 人。</div>
                </button>
              </div>
              <div class="teacher-modal-footer" style="background:#f8fafc; border-top:1px solid #e2e8f0; padding:14px 24px; display:flex; justify-content:flex-end;">
                <button class="modal-btn cancel" id="btn-cancel-rand-modal" style="background:#ffffff; border:1px solid #cbd5e1; color:#475569; padding:8px 18px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer;">取消</button>
              </div>
            </div>
          `;
          document.body.appendChild(modal);

          const closeModal = () => { modal.remove(); if (typeof onEscKey !== 'undefined') document.removeEventListener('keydown', onEscKey); };
          modal.querySelector('#btn-close-rand-modal').addEventListener('click', closeModal);
          modal.querySelector('#btn-cancel-rand-modal').addEventListener('click', closeModal);

          modal.querySelector('#btn-rand-mode-append').addEventListener('click', () => {
            closeModal();
            authManager.autoRandomGrouping(activeClass.id, groupSize, 'append_unassigned');
            renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
            alert(`✅ 已成功将未进组学生随机分配完成！`);
          });

          modal.querySelector('#btn-rand-mode-reset').addEventListener('click', () => {
            if (confirm(`⚠️ 确认将全班 ${classStudents.length} 名学生全员打散重新分组？`)) {
              closeModal();
              authManager.autoRandomGrouping(activeClass.id, groupSize, 'reset_all');
              renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
              alert(`✅ 已完成全员打散重组！`);
            }
          });
        } else {
          // 当前没有小组，直接执行随机分组
          const totalGroups = authManager.autoRandomGrouping(activeClass.id, groupSize, 'reset_all');
          renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
          alert(`✅ 已完成随机分组！按每组约 ${groupSize} 人，共自动划分 ${totalGroups} 个协作小组（每组至少 2 人）。`);
        }
      });
    }

    // 💥 一键解散所有小组
    const btnDissolveAll = container.querySelector('#btn-v1-dissolve-all-groups');
    if (btnDissolveAll) {
      btnDissolveAll.addEventListener('click', () => {
        if ((activeClass.groups || []).length === 0) {
          alert('当前班级暂无小组可解散！');
          return;
        }
        if (confirm(`💥 危险操作：确认一键解散【${activeClass.name}】下的所有小组？\n\n解散后全部学生将恢复为【待划分】状态。`)) {
          authManager.deleteAllGroups(activeClass.id);
          renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
          alert('✅ 已成功解散当前班级的所有小组！');
        }
      });
    }

    // 📋 问卷按【班级 + 任务】联动切换与独立保存
    const selSurveyClass = container.querySelector('#sel-survey-class');
    const selSurveyTask = container.querySelector('#sel-survey-task');
    const surveyUrlInput = container.querySelector('#input-survey-url') || container.querySelector('#survey-url-input');

    const updateSurveyUrlInputVal = () => {
      const inputEl = container.querySelector('#input-survey-url') || container.querySelector('#survey-url-input');
      if (!inputEl) return;
      const cId = selSurveyClass ? selSurveyClass.value : activeClass.id;
      const tId = selSurveyTask ? selSurveyTask.value : (currentClassTasks[0] ? currentClassTasks[0].id : 'task_default');
      inputEl.value = authManager.getSurveyUrl(cId, tId);
    };

    if (selSurveyClass) {
      selSurveyClass.addEventListener('change', () => {
        const cId = selSurveyClass.value;
        const classSpecificTasks = tasks.filter(t => t.classId === 'all' || t.classId === cId);
        if (selSurveyTask) {
          selSurveyTask.innerHTML = classSpecificTasks.length === 0
            ? '<option value="" disabled selected>（暂无写作任务，请先创建任务）</option>'
            : classSpecificTasks.map((t, idx) => `<option value="${t.id}" ${idx === 0 ? 'selected' : ''}>📌 ${t.title}</option>`).join('');
        }
        updateSurveyUrlInputVal();
      });
    }
    if (selSurveyTask) selSurveyTask.addEventListener('change', updateSurveyUrlInputVal);

    const btnSaveSurveyUrl = container.querySelector('#btn-save-survey-url');
    if (btnSaveSurveyUrl) {
      btnSaveSurveyUrl.addEventListener('click', () => {
        const urlInput = container.querySelector('#input-survey-url') || container.querySelector('#survey-url-input');
        const targetClassId = selSurveyClass ? selSurveyClass.value : activeClass.id;
        const targetTaskId = selSurveyTask ? selSurveyTask.value : (currentClassTasks[0] ? currentClassTasks[0].id : 'task_default');
        const url = urlInput ? urlInput.value.trim() : '';
        if (!url) { alert('⚠️ 请先填入有效的问卷链接！'); return; }

        authManager.saveSurvey(targetClassId, targetTaskId, url);

        if (window.app && window.app.cloudSyncEngine) {
          window.app.cloudSyncEngine.pushSnapshot();
        }

        alert('✅ 问卷链接已成功保存并永久同步！');
        renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
      });
    }

    // 📝 载入问卷修改
    container.querySelectorAll('.btn-quick-fill-survey').forEach(btn => {
      btn.addEventListener('click', () => {
        const cId = btn.dataset.cid;
        const tId = btn.dataset.tid;
        const url = decodeURIComponent(btn.dataset.url || '');
        if (selSurveyClass) selSurveyClass.value = cId;
        if (selSurveyTask) selSurveyTask.value = tId;
        const inputEl = container.querySelector('#input-survey-url') || container.querySelector('#survey-url-input');
        if (inputEl) {
          inputEl.value = url;
          inputEl.focus();
        }
      });
    });

    // 🗑️ 清除/删除单条问卷
    container.querySelectorAll('.btn-delete-survey-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const sId = btn.dataset.id;
        if (confirm('确认从清单中清除并删除此项问卷配置？')) {
          authManager.deleteSurvey(sId);
          if (window.app && window.app.cloudSyncEngine) window.app.cloudSyncEngine.pushSnapshot();
          alert('✅ 问卷配置已成功删除！');
          renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
        }
      });
    });

    // 📝 载入问卷修改
    container.querySelectorAll('.btn-quick-fill-survey').forEach(btn => {
      btn.addEventListener('click', () => {
        const cId = btn.dataset.cid;
        const tId = btn.dataset.tid;
        const url = decodeURIComponent(btn.dataset.url || '');
        if (selSurveyClass) selSurveyClass.value = cId;
        if (selSurveyTask) selSurveyTask.value = tId;
        if (surveyUrlInput) {
          surveyUrlInput.value = url;
          surveyUrlInput.focus();
        }
      });
    });

    // 🗑️ 清除问卷配置
    // btn-delete-survey-item 已在 L1718 注册（使用 deleteSurvey(sId)），此处不再重复注册

    // ✏️ 修改写作任务按钮（弹窗支持修改：开始时间、截止时间、任务时长、任务名称、说明要求）
    container.querySelectorAll('.btn-edit-task').forEach(btn => {
      btn.addEventListener('click', () => {
        const taskId = btn.dataset.id;
        const tasks = authManager.getTasks();
        const task = tasks.find(t => t.id === taskId);
        if (!task) {
          alert('❌ 未找到该写作任务！');
          return;
        }

        document.querySelectorAll('.modal-overlay').forEach(el => el.remove());

        const formatLocalDateForInput = (val) => {
          if (!val) return '';
          let d = (val instanceof Date) ? val : null;
          if (!d) {
            if (typeof val === 'number') {
              d = new Date(val);
            } else if (typeof val === 'string') {
              const clean = val.trim();
              if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(clean)) return clean;
              if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(clean)) return clean.replace(' ', 'T');
              if (/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/.test(clean)) return clean.replace(/\//g, '-').replace(' ', 'T');
              d = new Date(clean.replace(/-/g, '/'));
              if (isNaN(d.getTime())) d = new Date(clean);
            }
          }
          if (d && !isNaN(d.getTime())) {
            const pad = (n) => String(n).padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
          }
          return '';
        };

        const currentStart = formatLocalDateForInput(task.startTime) || formatLocalDateForInput(new Date());
        const currentDeadline = formatLocalDateForInput(task.deadline) || formatLocalDateForInput(new Date(Date.now() + 150 * 60 * 1000));
        const currentDuration = task.durationMinutes || 150;

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
          <div class="teacher-modal-card fancy-task-modal" style="width:540px;">
            <div class="teacher-modal-header task-theme-gradient">
              <div class="modal-header-title">
                <div class="modal-icon-badge task">✏️</div>
                <div>
                  <h3>修改写作任务</h3>
                  <div style="font-size:11.5px; opacity:0.85; margin-top:2px;">调整任务时间与要求后将实时同步至全班学生端</div>
                </div>
              </div>
              <button class="modal-close-btn" id="btn-close-edit-task-modal">✕</button>
            </div>
            <div class="teacher-modal-body" style="padding:22px 24px; display:flex; flex-direction:column; gap:14px;">
              <div class="teacher-form-group">
                <label style="font-size:12.5px; font-weight:700; color:#334155; margin-bottom:4px; display:block;">🏫 归属教学班级</label>
                <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:8px 12px; font-size:12.5px; font-weight:700; color:#1e40af;">
                  🏫 ${task.className || activeClass.name}
                </div>
              </div>

              <div class="teacher-form-group">
                <label style="font-size:12.5px; font-weight:700; color:#334155; margin-bottom:4px; display:block;"><span class="req" style="color:#dc2626;">*</span> 写作任务名称</label>
                <input type="text" id="modal-edit-task-title" class="teacher-input fancy" value="${task.title || ''}" placeholder="输入写作任务名称" style="width:100%; font-size:13.5px; padding:9px 12px; border:1.5px solid #cbd5e1; border-radius:8px;">
              </div>

              <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                <div class="teacher-form-group">
                  <label style="font-size:12.5px; font-weight:700; color:#334155; margin-bottom:4px; display:block;"><span class="req" style="color:#dc2626;">*</span> 📅 开始时间</label>
                  <input type="datetime-local" id="modal-edit-task-start" class="teacher-input fancy" value="${currentStart}" style="width:100%; font-size:12.5px; padding:8px 10px; border:1.5px solid #cbd5e1; border-radius:8px;">
                </div>
                <div class="teacher-form-group">
                  <label style="font-size:12.5px; font-weight:700; color:#334155; margin-bottom:4px; display:block;"><span class="req" style="color:#dc2626;">*</span> ⌛ 截止时间</label>
                  <input type="datetime-local" id="modal-edit-task-deadline" class="teacher-input fancy" value="${currentDeadline}" style="width:100%; font-size:12.5px; padding:8px 10px; border:1.5px solid #cbd5e1; border-radius:8px;">
                </div>
              </div>

              <!-- ⚡ 快捷延长截止时间工具条（支持自定义数值与单位：分钟/小时/天/周） -->
              <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px;">
                <div style="font-size:12px; font-weight:700; color:#334155; margin-bottom:8px; display:flex; align-items:center; gap:6px;">
                  <span>⚡ 快捷延长截止时间:</span>
                  <span style="font-size:11px; color:#64748b; font-weight:normal;">(支持自由输入数字，选择单位快速后延)</span>
                </div>
                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
                  <span style="font-size:12.5px; color:#475569; font-weight:600;">延长数值:</span>
                  <input type="number" id="modal-edit-extend-num" value="1" min="0.1" step="any" style="width:75px; padding:6px 10px; border:1.5px solid #cbd5e1; border-radius:6px; font-size:13px; font-weight:700; text-align:center; outline:none;">
                  <select id="modal-edit-extend-unit" style="padding:6px 10px; border:1.5px solid #cbd5e1; border-radius:6px; font-size:12.5px; font-weight:700; background:#ffffff; cursor:pointer; outline:none;">
                    <option value="minute">分钟</option>
                    <option value="hour" selected>小时</option>
                    <option value="day">天 (24h)</option>
                    <option value="week">周 (7天)</option>
                  </select>
                  <button type="button" id="btn-edit-apply-custom-extend" style="background:linear-gradient(135deg, #1d4ed8, #2563eb); color:white; border:none; padding:6px 14px; border-radius:6px; font-size:12.5px; font-weight:700; cursor:pointer; box-shadow:0 2px 6px rgba(37,99,235,0.2);">
                    ⚡ 确认延长
                  </button>
                </div>
                <div style="display:flex; flex-wrap:wrap; gap:6px; align-items:center;">
                  <span style="font-size:11px; color:#64748b;">快速选择:</span>
                  <button type="button" class="btn-quick-extend" data-num="30" data-unit="minute" style="background:#ffffff; border:1px solid #cbd5e1; color:#1e293b; padding:3px 8px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer;">+30分钟</button>
                  <button type="button" class="btn-quick-extend" data-num="1" data-unit="hour" style="background:#ffffff; border:1px solid #cbd5e1; color:#1e293b; padding:3px 8px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer;">+1小时</button>
                  <button type="button" class="btn-quick-extend" data-num="2" data-unit="hour" style="background:#ffffff; border:1px solid #cbd5e1; color:#1e293b; padding:3px 8px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer;">+2小时</button>
                  <button type="button" class="btn-quick-extend" data-num="1" data-unit="day" style="background:#eff6ff; border:1px solid #bfdbfe; color:#2563eb; padding:3px 8px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer;">+1天</button>
                  <button type="button" class="btn-quick-extend" data-num="3" data-unit="day" style="background:#eff6ff; border:1px solid #bfdbfe; color:#2563eb; padding:3px 8px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer;">+3天</button>
                  <button type="button" class="btn-quick-extend" data-num="1" data-unit="week" style="background:#f0fdf4; border:1px solid #bbf7d0; color:#16a34a; padding:3px 8px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer;">+1周</button>
                </div>
              </div>

              <div class="teacher-form-group">
                <label style="font-size:12.5px; font-weight:700; color:#334155; margin-bottom:4px; display:block;">📝 任务详细说明与要求 (选填)</label>
                <textarea id="modal-edit-task-desc" class="teacher-textarea fancy" style="min-height:85px; width:100%; font-size:13px; padding:10px 12px; border:1.5px solid #cbd5e1; border-radius:8px; line-height:1.5;" placeholder="请输入任务详细说明与指导要求...">${task.instructions || ''}</textarea>
              </div>
            </div>
            <div class="teacher-modal-footer" style="background:#f8fafc; border-top:1px solid #e2e8f0; padding:14px 24px; display:flex; justify-content:flex-end; gap:10px;">
              <button class="modal-btn cancel" id="btn-cancel-edit-task" style="background:#ffffff; border:1px solid #cbd5e1; color:#475569; padding:8px 18px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer;">取消</button>
              <button class="modal-btn submit task-theme" id="btn-submit-edit-task" style="background:linear-gradient(135deg, #1d4ed8, #2563eb); border:none; color:white; padding:8px 22px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; box-shadow:0 3px 8px rgba(37,99,235,0.25);">💾 保存任务修改</button>
            </div>
          </div>
        `;
        document.body.appendChild(modal);

        const closeModal = () => { modal.remove(); if (typeof onEscKey !== 'undefined') document.removeEventListener('keydown', onEscKey); };
        modal.querySelector('#btn-close-edit-task-modal').addEventListener('click', closeModal);
        modal.querySelector('#btn-cancel-edit-task').addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

        const onEscKey = (e) => {
          if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', onEscKey);
          }
        };
        document.addEventListener('keydown', onEscKey);

        const deadlineInput = modal.querySelector('#modal-edit-task-deadline');
        const startInput = modal.querySelector('#modal-edit-task-start');

        const doExtend = (numVal, unitVal) => {
          const num = parseFloat(numVal) || 0;
          if (num <= 0) return;
          let msMultiplier = 3600 * 1000;
          if (unitVal === 'minute') msMultiplier = 60 * 1000;
          else if (unitVal === 'hour') msMultiplier = 3600 * 1000;
          else if (unitVal === 'day') msMultiplier = 24 * 3600 * 1000;
          else if (unitVal === 'week') msMultiplier = 7 * 24 * 3600 * 1000;

          let baseDate = new Date();
          if (deadlineInput && deadlineInput.value) {
            const parsed = new Date(deadlineInput.value);
            if (!isNaN(parsed.getTime())) baseDate = parsed;
          } else if (startInput && startInput.value) {
            const parsed = new Date(startInput.value);
            if (!isNaN(parsed.getTime())) baseDate = parsed;
          }
          const newDate = new Date(baseDate.getTime() + num * msMultiplier);
          const pad = (n) => String(n).padStart(2, '0');
          const newDateStr = `${newDate.getFullYear()}-${pad(newDate.getMonth() + 1)}-${pad(newDate.getDate())}T${pad(newDate.getHours())}:${pad(newDate.getMinutes())}`;
          if (deadlineInput) {
            deadlineInput.value = newDateStr;
            deadlineInput.style.borderColor = '#2563eb';
            setTimeout(() => { if (deadlineInput) deadlineInput.style.borderColor = '#cbd5e1'; }, 600);
          }
        };

        // ⚡ 确认自定义延长
        modal.querySelector('#btn-edit-apply-custom-extend')?.addEventListener('click', () => {
          const n = modal.querySelector('#modal-edit-extend-num')?.value;
          const u = modal.querySelector('#modal-edit-extend-unit')?.value;
          doExtend(n, u);
        });

        // ⚡ 点击快速选择胶囊
        modal.querySelectorAll('.btn-quick-extend').forEach(btn => {
          btn.addEventListener('click', () => {
            const n = btn.dataset.num;
            const u = btn.dataset.unit;
            const inputNum = modal.querySelector('#modal-edit-extend-num');
            const selectUnit = modal.querySelector('#modal-edit-extend-unit');
            if (inputNum) inputNum.value = n;
            if (selectUnit) selectUnit.value = u;
            doExtend(n, u);
          });
        });

        modal.querySelector('#btn-submit-edit-task').addEventListener('click', () => {
          const newTitle = modal.querySelector('#modal-edit-task-title').value.trim();
          const newStart = modal.querySelector('#modal-edit-task-start').value;
          const newDeadline = modal.querySelector('#modal-edit-task-deadline').value;
          const newDesc = modal.querySelector('#modal-edit-task-desc').value.trim();

          if (!newTitle) { alert('⚠️ 写作任务名称不能为空！'); return; }
          if (!newStart || !newDeadline) { alert('⚠️ 开始时间与截止时间均不能为空！'); return; }

          const sDate = new Date(newStart);
          const dDate = new Date(newDeadline);
          if (isNaN(sDate.getTime()) || isNaN(dDate.getTime()) || sDate >= dDate) {
            alert('⚠️ 截止时间必须晚于开始时间！');
            return;
          }

          let calculatedDuration = Math.round((dDate.getTime() - sDate.getTime()) / (60 * 1000));

          const fmtTimeStr = (v) => v ? v.replace('T', ' ') : '';

          try {
            authManager.updateTask(taskId, newTitle, newDesc, fmtTimeStr(newStart), fmtTimeStr(newDeadline), calculatedDuration);
            closeModal();
            alert(`✅ 写作任务《${newTitle}》已成功修改，时间与内容已全网即时同步！`);
            renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
          } catch (err) {
            alert('❌ ' + err.message);
          }
        });
      });
    });

    // ⏳ 延长时间快捷弹窗
    container.querySelectorAll('.btn-extend-task-deadline').forEach(btn => {
      btn.addEventListener('click', () => {
        const taskId = btn.dataset.id;
        const tasks = authManager.getTasks();
        const task = tasks.find(t => t.id === taskId);
        if (!task) {
          alert('❌ 未找到该写作任务！');
          return;
        }

        document.querySelectorAll('.modal-overlay').forEach(el => el.remove());

        const formatLocalDateForInput = (val) => {
          if (!val) return '';
          let d = (val instanceof Date) ? val : null;
          if (!d) {
            if (typeof val === 'number') {
              d = new Date(val);
            } else if (typeof val === 'string') {
              const clean = val.trim();
              if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(clean)) return clean;
              if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(clean)) return clean.replace(' ', 'T');
              if (/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/.test(clean)) return clean.replace(/\//g, '-').replace(' ', 'T');
              d = new Date(clean.replace(/-/g, '/'));
              if (isNaN(d.getTime())) d = new Date(clean);
            }
          }
          if (d && !isNaN(d.getTime())) {
            const pad = (n) => String(n).padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
          }
          return '';
        };

        const now = new Date();
        let baseDate = new Date();
        let displayCurrentDeadline = task.deadline || '无硬性限制';
        let isPastDeadline = false;

        if (task.deadline) {
          let d = null;
          if (typeof task.deadline === 'string') {
            const clean = task.deadline.trim();
            d = new Date(clean.replace(/-/g, '/'));
            if (isNaN(d.getTime())) d = new Date(clean);
          } else if (task.deadline instanceof Date) {
            d = task.deadline;
          } else if (typeof task.deadline === 'number') {
            d = new Date(task.deadline);
          }

          if (d && !isNaN(d.getTime())) {
            displayCurrentDeadline = task.deadline;
            // 比较当前时间 now 与任务截止时间 d：以两者中【更晚/更靠后】的时间作为基准进行顺延
            if (d.getTime() > now.getTime()) {
              // 任务进行中（截止时间在未来）：以【原截止时间】为基线继续延长！
              baseDate = d;
              isPastDeadline = false;
            } else {
              // 任务已过期（当前时间已超过原截止时间）：以【当前时刻】为基线重新顺延！
              baseDate = now;
              isPastDeadline = true;
            }
          }
        }

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
          <div class="teacher-modal-card fancy-task-modal" style="width:480px;">
            <div class="teacher-modal-header" style="background:linear-gradient(135deg, #d97706, #f59e0b); color:white; padding:18px 24px;">
              <div class="modal-header-title">
                <div class="modal-icon-badge" style="background:rgba(255,255,255,0.25); color:white; font-size:20px; padding:6px 10px; border-radius:10px;">⏳</div>
                <div>
                  <h3 style="margin:0; font-size:17px; font-weight:800; color:white;">延长写作任务截止时间</h3>
                  <div style="font-size:11.5px; opacity:0.9; margin-top:2px;">延期后学生端正文将瞬间解除只读锁定，恢复正常编辑</div>
                </div>
              </div>
              <button class="modal-close-btn" id="btn-close-extend-modal" style="background:rgba(255,255,255,0.2); border:none; color:white; font-size:16px; border-radius:8px; width:30px; height:30px; cursor:pointer;">✕</button>
            </div>
            <div class="teacher-modal-body" style="padding:20px 24px; display:flex; flex-direction:column; gap:14px;">
              <div style="font-size:13.5px; color:#1e293b; font-weight:700;">
                任务名称：<span style="color:#2563eb;">📌 ${escapeHtml(task.title)}</span>
              </div>
              <div style="font-size:12.5px; color:#64748b; background:#f8fafc; padding:8px 12px; border-radius:8px; border:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
                <span>当前最新截止时间：<b style="color:${isPastDeadline ? '#dc2626' : '#2563eb'};">${displayCurrentDeadline}</b></span>
                ${isPastDeadline ? '<span style="background:#fee2e2; color:#dc2626; font-size:11px; font-weight:800; padding:2px 6px; border-radius:4px;">已过期（从当前时刻顺延）</span>' : '<span style="background:#ecfdf5; color:#059669; font-size:11px; font-weight:800; padding:2px 6px; border-radius:4px;">进行中（从原截止时间顺延）</span>'}
              </div>

              <div style="display:flex; flex-direction:column; gap:6px;">
                <label style="font-size:12.5px; font-weight:700; color:#334155;">⚡ 快捷延长预设时长：</label>
                <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:8px;">
                  <button type="button" class="btn-quick-extend" data-mins="30" style="background:#f0fdf4; border:1px solid #86efac; color:#15803d; padding:8px 0; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer;">+30 分钟</button>
                  <button type="button" class="btn-quick-extend" data-mins="60" style="background:#eff6ff; border:1px solid #93c5fd; color:#1d4ed8; padding:8px 0; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer;">+1 小时</button>
                  <button type="button" class="btn-quick-extend" data-mins="120" style="background:#fef3c7; border:1px solid #fcd34d; color:#b45309; padding:8px 0; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer;">+2 小时</button>
                  <button type="button" class="btn-quick-extend" data-mins="1440" style="background:#faf5ff; border:1px solid #d8b4fe; color:#7e22ce; padding:8px 0; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer;">+1 天</button>
                </div>
              </div>

              <div style="display:flex; flex-direction:column; gap:6px;">
                <label style="font-size:12.5px; font-weight:700; color:#334155;">📅 新的截止时间：</label>
                <input type="datetime-local" id="input-extend-deadline" class="teacher-input fancy" value="${formatLocalDateForInput(new Date(baseDate.getTime() + 60 * 60 * 1000))}" style="width:100%; font-size:13px; padding:9px 12px; border:1.5px solid #cbd5e1; border-radius:8px;">
              </div>
            </div>
            <div class="teacher-modal-footer" style="background:#f8fafc; border-top:1px solid #e2e8f0; padding:14px 24px; display:flex; justify-content:flex-end; gap:10px;">
              <button class="modal-btn cancel" id="btn-cancel-extend" style="background:#ffffff; border:1px solid #cbd5e1; color:#475569; padding:8px 18px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer;">取消</button>
              <button class="modal-btn submit" id="btn-save-extend" style="background:linear-gradient(135deg, #d97706, #f59e0b); border:none; color:white; padding:8px 22px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; box-shadow:0 3px 10px rgba(217,119,6,0.25);">💾 保存新截止时间</button>
            </div>
          </div>
        `;
        document.body.appendChild(modal);

        const closeModal = () => { modal.remove(); };
        modal.querySelector('#btn-close-extend-modal').addEventListener('click', closeModal);
        modal.querySelector('#btn-cancel-extend').addEventListener('click', closeModal);

        const dlInput = modal.querySelector('#input-extend-deadline');

        let lastAddedMins = 60;
        modal.querySelectorAll('.btn-quick-extend').forEach(qBtn => {
          qBtn.addEventListener('click', () => {
            const mins = parseInt(qBtn.dataset.mins, 10);
            lastAddedMins = mins;
            const newD = new Date(baseDate.getTime() + mins * 60 * 1000);
            dlInput.value = formatLocalDateForInput(newD);
            dlInput.style.borderColor = '#d97706';
            setTimeout(() => { if (dlInput) dlInput.style.borderColor = '#cbd5e1'; }, 400);
          });
        });

        modal.querySelector('#btn-save-extend').addEventListener('click', () => {
          const val = dlInput.value;
          if (!val) {
            alert('请指定新的截止时间！');
            return;
          }
          const newDeadlineStr = val.replace('T', ' ');
          try {
            authManager.extendTaskDeadline(taskId, newDeadlineStr, lastAddedMins);
            closeModal();
            showGlobalBannerNotice('✅ 延期成功', `写作任务《${task.title}》截止时间已延长至 ${newDeadlineStr}！学生端已自动解除只读锁定。`, 'success');
            renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
          } catch (err) {
            alert('❌ ' + err.message);
          }
        });
      });
    });

    // 🗑️ 删除写作任务按钮
    container.querySelectorAll('.btn-delete-task').forEach(btn => {
      btn.addEventListener('click', () => {
        const taskId = btn.dataset.id;
        const taskTitle = btn.dataset.title || '此写作任务';
        if (confirm(`🗑️ 确认删除写作任务《${taskTitle}》？\n\n删除后该任务将从所有教师与学生端移除。`)) {
          authManager.deleteTask(taskId);
          alert(`✅ 已成功删除写作任务《${taskTitle}》！`);
          renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
        }
      });
    });

    // 🗑️ 删除课堂通知按钮
    container.querySelectorAll('.btn-delete-announcement').forEach(btn => {
      btn.addEventListener('click', () => {
        const annId = btn.dataset.id;
        const annTitle = btn.dataset.title || '此通知';
        if (confirm(`🗑️ 确认删除课堂通知《${annTitle}》？\n\n删除后该通知将从所有学生端的弹窗和通知中心中撤销。`)) {
          authManager.deleteAnnouncement(annId);
          alert(`✅ 已成功删除课堂通知《${annTitle}》！`);
          renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
        }
      });
    });

    const btnOpenTaskV2 = container.querySelector('#btn-v2-open-task-modal');
    if (btnOpenTaskV2) {
      btnOpenTaskV2.addEventListener('click', () => {
        document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
        const pad = (n) => String(n).padStart(2, '0');
        const formatLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

        const now = new Date();
        const startStr = formatLocal(now);
        const deadlineDate = new Date(now.getTime() + 120 * 60 * 1000); // 默认至少 2 小时后
        const deadlineStr = formatLocal(deadlineDate);

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
          <div class="teacher-modal-card fancy-task-modal" style="width:520px;">
            <div class="teacher-modal-header task-theme-gradient">
              <div class="modal-header-title"><div class="modal-icon-badge task">📌</div><div><h3>发布全新写作任务</h3></div></div>
              <button class="modal-close-btn" id="btn-close-task-modal">✕</button>
            </div>
            <div class="teacher-modal-body">
              <div class="teacher-form-group">
                <label>🏫 归属教学班级</label>
                <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:10px 14px; font-size:13px; font-weight:700; color:#1e40af;">
                  🏫 ${activeClass.name}
                </div>
                <input type="hidden" id="modal-task-class" value="${activeClass.id}">
              </div>

              <div class="form-grid-2" style="margin-top:8px;">
                <div class="teacher-form-group">
                  <label><span class="req">*</span> 📅 任务开始时间 (默认当前)</label>
                  <input type="datetime-local" id="modal-task-start" class="teacher-input fancy" value="${startStr}">
                </div>
                <div class="teacher-form-group">
                  <label><span class="req">*</span> ⌛ 任务截止时间 (默认2小时后)</label>
                  <input type="datetime-local" id="modal-task-deadline" class="teacher-input fancy" value="${deadlineStr}">
                </div>
              </div>

              <!-- ⚡ 快捷设定截止时间工具条（支持自定义数值与单位：分钟/小时/天/周） -->
              <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-top:8px;">
                <div style="font-size:12px; font-weight:700; color:#334155; margin-bottom:8px; display:flex; align-items:center; gap:6px;">
                  <span>⚡ 快捷设定截止时间:</span>
                  <span style="font-size:11px; color:#64748b; font-weight:normal;">(支持自由输入数字，选择单位快速后延)</span>
                </div>
                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
                  <span style="font-size:12.5px; color:#475569; font-weight:600;">延长数值:</span>
                  <input type="number" id="modal-create-extend-num" value="1" min="0.1" step="any" style="width:75px; padding:6px 10px; border:1.5px solid #cbd5e1; border-radius:6px; font-size:13px; font-weight:700; text-align:center; outline:none;">
                  <select id="modal-create-extend-unit" style="padding:6px 10px; border:1.5px solid #cbd5e1; border-radius:6px; font-size:12.5px; font-weight:700; background:#ffffff; cursor:pointer; outline:none;">
                    <option value="minute">分钟</option>
                    <option value="hour" selected>小时</option>
                    <option value="day">天 (24h)</option>
                    <option value="week">周 (7天)</option>
                  </select>
                  <button type="button" id="btn-create-apply-custom-extend" style="background:linear-gradient(135deg, #1d4ed8, #2563eb); color:white; border:none; padding:6px 14px; border-radius:6px; font-size:12.5px; font-weight:700; cursor:pointer; box-shadow:0 2px 6px rgba(37,99,235,0.2);">
                    ⚡ 确认延长
                  </button>
                </div>
                <div style="display:flex; flex-wrap:wrap; gap:6px; align-items:center;">
                  <span style="font-size:11px; color:#64748b;">快速选择:</span>
                  <button type="button" class="btn-create-quick-extend" data-num="30" data-unit="minute" style="background:#ffffff; border:1px solid #cbd5e1; color:#1e293b; padding:3px 8px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer;">+30分钟</button>
                  <button type="button" class="btn-create-quick-extend" data-num="1" data-unit="hour" style="background:#ffffff; border:1px solid #cbd5e1; color:#1e293b; padding:3px 8px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer;">+1小时</button>
                  <button type="button" class="btn-create-quick-extend" data-num="2" data-unit="hour" style="background:#ffffff; border:1px solid #cbd5e1; color:#1e293b; padding:3px 8px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer;">+2小时</button>
                  <button type="button" class="btn-create-quick-extend" data-num="1" data-unit="day" style="background:#eff6ff; border:1px solid #bfdbfe; color:#2563eb; padding:3px 8px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer;">+1天</button>
                  <button type="button" class="btn-create-quick-extend" data-num="3" data-unit="day" style="background:#eff6ff; border:1px solid #bfdbfe; color:#2563eb; padding:3px 8px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer;">+3天</button>
                  <button type="button" class="btn-create-quick-extend" data-num="1" data-unit="week" style="background:#f0fdf4; border:1px solid #bbf7d0; color:#16a34a; padding:3px 8px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer;">+1周</button>
                </div>
              </div>

              <div class="teacher-form-group" style="margin-top:8px;">
                <label><span class="req">*</span> 写作任务名称</label>
                <input type="text" id="modal-task-title" class="teacher-input fancy" value="" placeholder="输入写作任务名称">
              </div>
              <div class="teacher-form-group">
                <label>任务详细说明与要求 (选填)</label>
                <textarea id="modal-task-desc" class="teacher-textarea fancy" style="min-height:90px;" placeholder="请输入任务详细说明与指导要求 (可选)..."></textarea>
              </div>
            </div>
            <div class="teacher-modal-footer">
              <button class="modal-btn cancel" id="btn-cancel-task">取消</button>
              <button class="modal-btn submit task-theme" id="btn-submit-new-task">🚀 确认发布写作任务</button>
            </div>
          </div>
        `;
        document.body.appendChild(modal);

        const closeModal = () => { modal.remove(); if (typeof onEscKey !== 'undefined') document.removeEventListener('keydown', onEscKey); };
        modal.querySelector('#btn-close-task-modal').addEventListener('click', closeModal);
        modal.querySelector('#btn-cancel-task').addEventListener('click', closeModal);

        modal.addEventListener('click', (e) => {
          if (e.target === modal) closeModal();
        });
        const onEscKey = (e) => {
          if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', onEscKey);
          }
        };
        document.addEventListener('keydown', onEscKey);

        const deadlineInput = modal.querySelector('#modal-task-deadline');
        const startInput = modal.querySelector('#modal-task-start');

        const doCreateExtend = (numVal, unitVal) => {
          const num = parseFloat(numVal) || 0;
          if (num <= 0) return;
          let msMultiplier = 3600 * 1000;
          if (unitVal === 'minute') msMultiplier = 60 * 1000;
          else if (unitVal === 'hour') msMultiplier = 3600 * 1000;
          else if (unitVal === 'day') msMultiplier = 24 * 3600 * 1000;
          else if (unitVal === 'week') msMultiplier = 7 * 24 * 3600 * 1000;

          let baseDate = new Date();
          if (deadlineInput && deadlineInput.value) {
            const parsed = new Date(deadlineInput.value);
            if (!isNaN(parsed.getTime())) baseDate = parsed;
          } else if (startInput && startInput.value) {
            const parsed = new Date(startInput.value);
            if (!isNaN(parsed.getTime())) baseDate = parsed;
          }
          const newDate = new Date(baseDate.getTime() + num * msMultiplier);
          const pad = (n) => String(n).padStart(2, '0');
          const newDateStr = `${newDate.getFullYear()}-${pad(newDate.getMonth() + 1)}-${pad(newDate.getDate())}T${pad(newDate.getHours())}:${pad(newDate.getMinutes())}`;
          if (deadlineInput) {
            deadlineInput.value = newDateStr;
            deadlineInput.style.borderColor = '#2563eb';
            setTimeout(() => { if (deadlineInput) deadlineInput.style.borderColor = '#cbd5e1'; }, 600);
          }
        };

        // ⚡ 确认自定义延长
        modal.querySelector('#btn-create-apply-custom-extend')?.addEventListener('click', () => {
          const n = modal.querySelector('#modal-create-extend-num')?.value;
          const u = modal.querySelector('#modal-create-extend-unit')?.value;
          doCreateExtend(n, u);
        });

        // ⚡ 点击快速选择胶囊
        modal.querySelectorAll('.btn-create-quick-extend').forEach(btn => {
          btn.addEventListener('click', () => {
            const n = btn.dataset.num;
            const u = btn.dataset.unit;
            const inputNum = modal.querySelector('#modal-create-extend-num');
            const selectUnit = modal.querySelector('#modal-create-extend-unit');
            if (inputNum) inputNum.value = n;
            if (selectUnit) selectUnit.value = u;
            doCreateExtend(n, u);
          });
        });

        modal.querySelector('#btn-submit-new-task').addEventListener('click', () => {
          const classId = modal.querySelector('#modal-task-class').value;
          const title = modal.querySelector('#modal-task-title').value.trim();
          const desc = modal.querySelector('#modal-task-desc').value.trim();
          const startTime = modal.querySelector('#modal-task-start') ? modal.querySelector('#modal-task-start').value : '';
          const deadline = modal.querySelector('#modal-task-deadline') ? modal.querySelector('#modal-task-deadline').value : '';

          if (!title) { alert('⚠️ 请输入写作任务名称！'); return; }
          if (!startTime || !deadline) { alert('⚠️ 请指定任务的开始时间与截止时间！'); return; }

          const sDate = new Date(startTime);
          const dDate = new Date(deadline);
          if (isNaN(sDate.getTime()) || isNaN(dDate.getTime()) || sDate >= dDate) {
            alert('⚠️ 任务截止时间必须晚于任务开始时间（建议至少设置 2 小时）！');
            return;
          }

          let calculatedDuration = 120;
          calculatedDuration = Math.round((dDate.getTime() - sDate.getTime()) / (60 * 1000));

          try {
            authManager.createTask(title, classId, desc, [], startTime, deadline, calculatedDuration);
            closeModal();
            renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
          } catch (err) {
            alert('❌ ' + err.message);
          }
        });
      });
    }

    const btnOpenAnnV2 = container.querySelector('#btn-v2-open-ann-modal');
    if (btnOpenAnnV2) {
      btnOpenAnnV2.addEventListener('click', () => {
        document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
        const allClasses = authManager.getClasses();
        const initialCls = allClasses.find(c => c.id === activeClass.id) || activeClass;

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
          <div class="teacher-modal-card fancy-ann-modal" style="width:600px;">
            <div class="teacher-modal-header ann-theme-gradient">
              <div class="modal-header-title">
                <div class="modal-icon-badge ann">📢</div>
                <div>
                  <h3>发布课堂即时通知</h3>
                  <p style="font-size:12px; color:#cbd5e1;">选择目标班级与受众小组，可随附教学资源文件</p>
                </div>
              </div>
              <button class="modal-close-btn" id="btn-close-ann-modal">✕</button>
            </div>
            <div class="teacher-modal-body">

              <div class="form-grid-2">
                <div class="teacher-form-group">
                  <label>🏫 目标教学班级</label>
                  <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:10px 14px; font-size:13px; font-weight:700; color:#1e40af;">
                    🏫 ${activeClass.name}
                  </div>
                  <input type="hidden" id="modal-ann-class" value="${activeClass.id}">
                </div>
                <div class="teacher-form-group">
                  <label><span class="req" style="color:#dc2626;">*</span> 📌 关联写作任务 (必须锁定具体任务)</label>
                  <select id="modal-ann-task" class="teacher-input fancy">
                    ${(() => {
                      const classTasks = tasks.filter(t => t.classId === 'all' || t.classId === activeClass.id);
                      if (classTasks.length === 0) return '<option value="" disabled selected>⚠️ 当前班级暂无写作任务，请先在【写作任务】中创建！</option>';
                      return classTasks.map((t, idx) => `<option value="${t.id}" ${idx === 0 ? 'selected' : ''}>📌 ${t.title}</option>`).join('');
                    })()}
                  </select>
                </div>
              </div>

              <div class="teacher-form-group" style="margin-top:10px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                  <label style="margin:0;"><span class="req">*</span> 🎯 推送受众小组 (支持多选指定)</label>
                  <div style="display:flex; gap:8px;">
                    <button type="button" id="btn-ann-select-all-groups" style="background:#eff6ff; border:1px solid #bfdbfe; color:#1d4ed8; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:700; cursor:pointer;">一键全选</button>
                    <button type="button" id="btn-ann-clear-groups" style="background:#f8fafc; border:1px solid #cbd5e1; color:#475569; padding:2px 8px; border-radius:4px; font-size:11px; cursor:pointer;">清空</button>
                  </div>
                </div>
                <div id="modal-ann-groups-container" style="display:flex; flex-wrap:wrap; gap:8px; background:#f8fafc; padding:10px; border-radius:8px; border:1px solid #e2e8f0; max-height:120px; overflow-y:auto;">
                  ${(initialCls.groups || []).length === 0 ? '<span style="font-size:12px; color:#94a3b8;">当前班级暂无小组</span>' : (initialCls.groups || []).map(g => `
                    <label style="display:inline-flex; align-items:center; gap:5px; background:#ffffff; border:1px solid #cbd5e1; padding:4px 10px; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer; user-select:none;">
                      <input type="checkbox" name="ann-target-group" value="${g.id}" checked style="accent-color:#2563eb; cursor:pointer;">
                      <span>👥 ${g.name}</span>
                    </label>
                  `).join('')}
                </div>
              </div>

              <div class="teacher-form-group" style="margin-top:10px;">
                <label><span class="req">*</span> 通知标题</label>
                <input type="text" id="modal-ann-title" class="teacher-input fancy" value="" placeholder="输入通知标题">
              </div>
              <div class="teacher-form-group">
                <label><span class="req">*</span> 通知详细内容</label>
                <textarea id="modal-ann-content" class="teacher-textarea fancy" style="min-height:80px;" placeholder="输入推送给学生的通知正文..."></textarea>
              </div>

              <div class="teacher-form-group">
                <label>📎 随附教学资源文件上传 (支持选择/拖拽 PDF, DOCX, ZIP 等)</label>
                <div id="ann-file-dropzone" style="border:2px dashed rgba(168,85,247,0.4); border-radius:10px; padding:16px; text-align:center; background:rgba(168,85,247,0.08); cursor:pointer;">
                  <input type="file" id="modal-ann-file-input" style="display:none;">
                  <div id="ann-dropzone-text">
                    <span style="font-size:24px;">📁</span>
                    <div style="font-size:13px; font-weight:700; color:#c084fc; margin-top:4px;">点击选择或拖拽本地随附资源文件</div>
                  </div>
                </div>
              </div>

            </div>
            <div class="teacher-modal-footer">
              <button class="modal-btn cancel" id="btn-cancel-ann">取消</button>
              <button class="modal-btn submit ann-theme" id="btn-submit-new-ann">📢 广播发布并推送弹窗</button>
            </div>
          </div>
        `;
        document.body.appendChild(modal);

        const closeModal = () => { modal.remove(); if (typeof onEscKey !== 'undefined') document.removeEventListener('keydown', onEscKey); };
        modal.querySelector('#btn-close-ann-modal').addEventListener('click', closeModal);
        modal.querySelector('#btn-cancel-ann').addEventListener('click', closeModal);

        modal.addEventListener('click', (e) => {
          if (e.target === modal) closeModal();
        });
        const onEscKey = (e) => {
          if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', onEscKey);
          }
        };
        document.addEventListener('keydown', onEscKey);

        const groupsContainer = modal.querySelector('#modal-ann-groups-container');
        modal.querySelector('#btn-ann-select-all-groups').addEventListener('click', () => {
          groupsContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true);
        });
        modal.querySelector('#btn-ann-clear-groups').addEventListener('click', () => {
          groupsContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
        });

        // 班级切换联动小组
        const classSelect = modal.querySelector('#modal-ann-class');
        classSelect.addEventListener('change', (e) => {
          const selectedCId = e.target.value;
          const targetCls = allClasses.find(c => c.id === selectedCId);
          const groups = (targetCls && targetCls.groups) ? targetCls.groups : [];
          groupsContainer.innerHTML = groups.length === 0
            ? '<span style="font-size:12px; color:#94a3b8;">当前班级暂无小组</span>'
            : groups.map(g => `
              <label style="display:inline-flex; align-items:center; gap:5px; background:#ffffff; border:1px solid #cbd5e1; padding:4px 10px; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer; user-select:none;">
                <input type="checkbox" name="ann-target-group" value="${g.id}" checked style="accent-color:#2563eb; cursor:pointer;">
                <span>👥 ${g.name}</span>
              </label>
            `).join('');
        });

        const fileInput = modal.querySelector('#modal-ann-file-input');
        const dropzone = modal.querySelector('#ann-file-dropzone');
        const dropText = modal.querySelector('#ann-dropzone-text');
        let selectedAttachment = null;

        dropzone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
          if (e.target.files && e.target.files[0]) {
            const f = e.target.files[0];
            const sizeMB = (f.size / (1024 * 1024)).toFixed(1) + ' MB';
            selectedAttachment = { name: f.name, size: sizeMB, fileObj: f };
            dropText.innerHTML = `<span style="font-size:24px;">✅</span><div style="font-size:13px; color:#34d399; font-weight:700;">已选中随附文件: ${f.name} (${sizeMB})</div>`;
          }
        });

        modal.querySelector('#btn-submit-new-ann').addEventListener('click', async () => {
          const submitBtn = modal.querySelector('#btn-submit-new-ann');
          const selClassId = classSelect.value;
          const selClassObj = allClasses.find(c => c.id === selClassId);
          const selClassName = selClassId === 'all' ? '全校班级' : (selClassObj ? selClassObj.name : '指定班级');

          const taskId = modal.querySelector('#modal-ann-task').value;
          if (!taskId || taskId === 'task_all' || taskId === 'task_default') {
            alert('❌ 发布失败：请先为当前班级创建具体写作任务，通知必须锁定关联至具体任务！');
            submitBtn.disabled = false;
            submitBtn.innerText = '📢 确认发布通知';
            return;
          }
          const checkedGroupCbs = Array.from(groupsContainer.querySelectorAll('input[type="checkbox"]:checked'));
          if (checkedGroupCbs.length === 0) {
            alert('❌ 发布失败：请至少勾选一个接收通知的受众小组！');
            submitBtn.disabled = false;
            submitBtn.innerText = '📢 确认发布通知';
            return;
          }
          const allGroups = (selClassObj && selClassObj.groups) ? selClassObj.groups : [];
          const isAllSelected = checkedGroupCbs.length === allGroups.length;
          const selectedGroupIds = checkedGroupCbs.map(cb => cb.value);
          const selectedGroupNames = selectedGroupIds.map(gid => {
            const gObj = allGroups.find(g => g.id === gid);
            return gObj ? gObj.name : gid;
          });
          const targetGId = isAllSelected ? 'all' : selectedGroupIds[0];
          const targetGName = isAllSelected ? '全班所有小组' : selectedGroupNames.join('、');

          const title = modal.querySelector('#modal-ann-title').value.trim();
          const content = modal.querySelector('#modal-ann-content').value.trim();
          if (!title || !content) { alert('⚠️ 请填齐通知标题与内容！'); return; }

          submitBtn.disabled = true;
          submitBtn.innerText = '⏳ 正在上传资源并发布通知...';

          let finalAttachment = null;
          if (selectedAttachment && selectedAttachment.name) {
            finalAttachment = {
              name: selectedAttachment.name,
              size: selectedAttachment.size,
              url: ''
            };
            if (selectedAttachment.fileObj) {
              try {
                const currT = authManager.getCurrentUser();
                const tId = (currT && (currT.studentCode || currT.username || currT.id)) || '';
                const tToken = (currT && (currT.token || currT.activeSessionId)) || '';

                const formData = new FormData();
                formData.append('file', selectedAttachment.fileObj);
                formData.append('userId', tId);
                formData.append('token', tToken);
                const upRes = await fetch('sync.php?action=upload_file', {
                  method: 'POST',
                  body: formData
                });
                if (upRes.ok) {
                  const upJson = await upRes.json();
                  if (upJson.success && upJson.url) {
                    finalAttachment.url = upJson.url;
                  }
                }
              } catch (upErr) {
                console.warn('Server upload attachment warning:', upErr);
              }
            }
          }

          authManager.publishAnnouncement(taskId, title, content, finalAttachment, targetGId, targetGName, selClassId, selClassName, selectedGroupIds);
          closeModal();
          renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
        });
      });
    }

    // 📚 参考范文上传 Modal
    // 📚 参考范文上传 Modal
    const btnOpenPaperModal = container.querySelector('#btn-v2-open-paper-modal');
    if (btnOpenPaperModal) {
      btnOpenPaperModal.addEventListener('click', () => {
        document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
        const allClasses = authManager.getClasses();
        const initialCls = allClasses.find(c => c.id === activeClass.id) || activeClass;

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
          <div class="teacher-modal-card fancy-task-modal" style="width:580px;">
            <div class="teacher-modal-header task-theme-gradient" style="background:linear-gradient(135deg, #7c3aed, #4f46e5);">
              <div class="modal-header-title">
                <div class="modal-icon-badge" style="background:rgba(255,255,255,0.2); color:white;">📚</div>
                <div>
                  <h3>上传课程学术参考范文</h3>
                  <p style="font-size:12px; color:#e0e7ff;">选取目标班级与文献文件，学生可在协作正文上方查阅下载</p>
                </div>
              </div>
              <button class="modal-close-btn" id="btn-close-paper-modal">✕</button>
            </div>
            <div class="teacher-modal-body">
              <div class="teacher-form-group">
                <label><span class="req">*</span> 📎 选取本地文献文件 (PDF / Word / DOCX / Markdown / TXT)</label>
                <div id="paper-file-dropzone" style="border:2px dashed #a78bfa; border-radius:10px; padding:18px; text-align:center; background:#f5f3ff; cursor:pointer; transition:all 0.2s;">
                  <input type="file" id="modal-paper-file-input" style="display:none;" accept=".pdf,.doc,.docx,.txt,.md">
                  <div id="paper-dropzone-text">
                    <span style="font-size:30px;">📄</span>
                    <div style="font-size:13.5px; font-weight:700; color:#7c3aed; margin-top:4px;">点击选择或拖拽本地文献文件上传</div>
                    <div style="font-size:11.5px; color:#8b5cf6; margin-top:2px;">(选取后将自动识别文件名称作为文献标题)</div>
                  </div>
                </div>
              </div>

              <div class="teacher-form-group" style="margin-top:10px;">
                <label><span class="req">*</span> 范文文献标题</label>
                <input type="text" id="modal-paper-title" class="teacher-input fancy" placeholder="例如：《基于大语言模型的多智能体协同学习实证研究》" value="">
              </div>

              <div class="form-grid-2" style="margin-top:10px;">
                <div class="teacher-form-group">
                  <label>🏫 目标教学班级</label>
                  <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:10px 14px; font-size:13px; font-weight:700; color:#1e40af;">
                    🏫 ${activeClass.name}
                  </div>
                  <input type="hidden" id="modal-paper-class" value="${activeClass.id}">
                </div>
                <div class="teacher-form-group">
                  <label><span class="req" style="color:#dc2626;">*</span> 📌 关联写作任务 (必须锁定具体任务)</label>
                  <select id="modal-paper-task" class="teacher-input fancy">
                    ${(() => {
                      const classTasks = tasks.filter(t => t.classId === 'all' || t.classId === activeClass.id);
                      if (classTasks.length === 0) return '<option value="" disabled selected>⚠️ 当前班级暂无写作任务，请先在【写作任务】中创建！</option>';
                      return classTasks.map((t, idx) => `<option value="${t.id}" ${idx === 0 ? 'selected' : ''}>📌 ${t.title}</option>`).join('');
                    })()}
                  </select>
                </div>
              </div>

              <div class="teacher-form-group" style="margin-top:10px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                  <label style="margin:0;"><span class="req">*</span> 🎯 推送受众小组 (支持多选指定)</label>
                  <div style="display:flex; gap:8px;">
                    <button type="button" id="btn-paper-select-all-groups" style="background:#eff6ff; border:1px solid #bfdbfe; color:#1d4ed8; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:700; cursor:pointer;">一键全选</button>
                    <button type="button" id="btn-paper-clear-groups" style="background:#f8fafc; border:1px solid #cbd5e1; color:#475569; padding:2px 8px; border-radius:4px; font-size:11px; cursor:pointer;">清空</button>
                  </div>
                </div>
                <div id="modal-paper-groups-container" style="display:flex; flex-wrap:wrap; gap:8px; background:#f8fafc; padding:10px; border-radius:8px; border:1px solid #e2e8f0; max-height:120px; overflow-y:auto;">
                  ${(initialCls.groups || []).length === 0 ? '<span style="font-size:12px; color:#94a3b8;">当前班级暂无小组</span>' : (initialCls.groups || []).map(g => `
                    <label style="display:inline-flex; align-items:center; gap:5px; background:#ffffff; border:1px solid #cbd5e1; padding:4px 10px; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer; user-select:none;">
                      <input type="checkbox" name="paper-target-group" value="${g.id}" checked style="accent-color:#2563eb; cursor:pointer;">
                      <span>👥 ${g.name}</span>
                    </label>
                  `).join('')}
                </div>
              </div>

              <div style="margin-top:12px; background:#eff6ff; border:1px solid #bfdbfe; padding:10px 14px; border-radius:8px; display:flex; align-items:center; gap:8px;">
                <input type="checkbox" id="modal-paper-auto-push" checked style="width:16px; height:16px; cursor:pointer; accent-color:#2563eb;">
                <label for="modal-paper-auto-push" style="font-size:12.5px; color:#1e40af; font-weight:700; cursor:pointer;">
                  📢 上传后立即由【审稿编辑 Agent】向受众小组成员研讨管道推送此范文
                </label>
              </div>
            </div>
            <div class="teacher-modal-footer">
              <button class="modal-btn cancel" id="btn-cancel-paper">取消</button>
              <button class="modal-btn submit task-theme" id="btn-submit-new-paper" style="background:linear-gradient(135deg, #7c3aed, #4f46e5);">
                📚 确认上传并存入范文库
              </button>
            </div>
          </div>
        `;
        document.body.appendChild(modal);

        const closeModal = () => { modal.remove(); if (typeof onEscKey !== 'undefined') document.removeEventListener('keydown', onEscKey); };
        modal.querySelector('#btn-close-paper-modal').addEventListener('click', closeModal);
        modal.querySelector('#btn-cancel-paper').addEventListener('click', closeModal);

        modal.addEventListener('click', (e) => {
          if (e.target === modal) closeModal();
        });
        const onEscKey = (e) => {
          if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', onEscKey);
          }
        };
        document.addEventListener('keydown', onEscKey);

        const paperGroupsContainer = modal.querySelector('#modal-paper-groups-container');
        modal.querySelector('#btn-paper-select-all-groups').addEventListener('click', () => {
          paperGroupsContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true);
        });
        modal.querySelector('#btn-paper-clear-groups').addEventListener('click', () => {
          paperGroupsContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
        });

        // 班级联动小组
        const paperClassSelect = modal.querySelector('#modal-paper-class');
        paperClassSelect.addEventListener('change', (e) => {
          const selectedCId = e.target.value;
          const targetCls = allClasses.find(c => c.id === selectedCId);
          const groups = (targetCls && targetCls.groups) ? targetCls.groups : [];
          paperGroupsContainer.innerHTML = groups.length === 0
            ? '<span style="font-size:12px; color:#94a3b8;">当前班级暂无小组</span>'
            : groups.map(g => `
              <label style="display:inline-flex; align-items:center; gap:5px; background:#ffffff; border:1px solid #cbd5e1; padding:4px 10px; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer; user-select:none;">
                <input type="checkbox" name="paper-target-group" value="${g.id}" checked style="accent-color:#2563eb; cursor:pointer;">
                <span>👥 ${g.name}</span>
              </label>
            `).join('');
        });

        const fileInput = modal.querySelector('#modal-paper-file-input');
        const dropzone = modal.querySelector('#paper-file-dropzone');
        const dropText = modal.querySelector('#paper-dropzone-text');
        const titleInput = modal.querySelector('#modal-paper-title');
        let selectedFile = { name: '', size: '', data: '', fileObj: null };

        dropzone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
          if (e.target.files && e.target.files[0]) {
            const f = e.target.files[0];
            const sizeKB = (f.size / 1024).toFixed(1) + ' KB';
            // 自动将文件名（去掉扩展名）填入标题输入框
            const cleanTitle = f.name.replace(/\.[^/.]+$/, '');
            if (!titleInput.value || titleInput.value.trim() === '') {
              titleInput.value = cleanTitle;
            }
            selectedFile = { name: f.name, size: sizeKB, data: '', fileObj: f };
            dropText.innerHTML = `<span style="font-size:28px;">✅</span><div style="font-size:13.5px; color:#059669; font-weight:700; margin-top:4px;">已选取文献: ${f.name} (${sizeKB})</div><div style="font-size:11px; color:#10b981; margin-top:2px;">点击可重新更换文件</div>`;
          }
        });

        const submitBtn = modal.querySelector('#btn-submit-new-paper');
        submitBtn.addEventListener('click', async () => {
          try {
            let title = titleInput.value.trim();
            const selClassId = paperClassSelect.value;
            const selClassObj = allClasses.find(c => c.id === selClassId);
            const selClassName = selClassId === 'all' ? '全校班级' : (selClassObj ? selClassObj.name : '指定班级');

            const targetTaskId = modal.querySelector('#modal-paper-task') ? modal.querySelector('#modal-paper-task').value : '';
            if (!targetTaskId || targetTaskId === 'task_all' || targetTaskId === 'task_default') {
              alert('❌ 上传失败：请先为当前班级创建具体写作任务，参考文献必须锁定关联至具体任务！');
              submitBtn.disabled = false;
              submitBtn.innerText = '📚 确认上传并存入范文库';
              return;
            }

            const checkedGroupCbs = Array.from(paperGroupsContainer.querySelectorAll('input[type="checkbox"]:checked'));
            if (checkedGroupCbs.length === 0) {
              alert('❌ 上传失败：请至少勾选一个接收文献的受众小组！');
              submitBtn.disabled = false;
              submitBtn.innerText = '📚 确认上传并存入范文库';
              return;
            }
            const allGroups = (selClassObj && selClassObj.groups) ? selClassObj.groups : [];
            const isAllSelected = checkedGroupCbs.length === allGroups.length;
            const selectedGroupIds = checkedGroupCbs.map(cb => cb.value);
            const selectedGroupNames = selectedGroupIds.map(gid => {
              const gObj = allGroups.find(g => g.id === gid);
              return gObj ? gObj.name : gid;
            });
            const targetGId = isAllSelected ? 'all' : selectedGroupIds[0];
            const targetGName = isAllSelected ? '全班所有小组' : selectedGroupNames.join('、');

            const autoPush = modal.querySelector('#modal-paper-auto-push') ? modal.querySelector('#modal-paper-auto-push').checked : true;

            if (!selectedFile.name && !title) {
              alert('⚠️ 请先选取本地文献文件或输入范文标题！');
              return;
            }
            if (!title) {
              title = selectedFile.name ? selectedFile.name.replace(/\.[^/.]+$/, '') : '学术参考范文';
            }

            submitBtn.disabled = true;
            submitBtn.innerText = '⏳ 正在上传文献到服务器...';

            let serverFileUrl = '';
            if (selectedFile.fileObj) {
              try {
                const currT = authManager.getCurrentUser();
                const tId = (currT && (currT.studentCode || currT.username || currT.id)) || '';
                const tToken = (currT && (currT.token || currT.activeSessionId)) || '';

                const formData = new FormData();
                formData.append('file', selectedFile.fileObj);
                formData.append('userId', tId);
                formData.append('token', tToken);
                const upRes = await fetch('sync.php?action=upload_file', {
                  method: 'POST',
                  body: formData
                });
                if (upRes.ok) {
                  const upJson = await upRes.json();
                  if (upJson.success && upJson.url) {
                    serverFileUrl = upJson.url;
                  }
                }
              } catch (upErr) {
                console.warn('Server upload fallback:', upErr);
              }
            }

            submitBtn.innerText = '⏳ 正在存入范文库...';

            const newPaper = authManager.uploadReferencePaper({
              title,
              classId: selClassId,
              className: selClassName,
              taskId: targetTaskId,
              abstract: '',
              keyHighlights: '研究设计与学术论证规范',
              fileName: selectedFile.name || `${title}.pdf`,
              fileUrl: serverFileUrl,
              fileSize: selectedFile.size || '3.5 MB',
              targetGroupId: targetGId,
              targetGroupIds: selectedGroupIds,
              targetGroupName: targetGName
            });

            if (autoPush && newPaper && newPaper.id) {
              try {
                authManager.pushReferencePaperToGroupChat(newPaper.id, targetGId);
              } catch (err) {}
            }

            alert(`🎉 参考范文《${title}》已成功存入范文库！${autoPush ? '\n审稿编辑 Agent 已同步向受众小组推送！' : ''}`);
            closeModal();
            renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
          } catch (err) {
            alert('❌ 上传失败: ' + err.message);
            submitBtn.disabled = false;
            submitBtn.innerText = '📚 确认上传并存入范文库';
          }
        });
      });
    }

    // 推送范文提醒按钮
    container.querySelectorAll('.btn-push-paper-to-chat').forEach(btn => {
      btn.addEventListener('click', () => {
        const paperId = btn.dataset.id;
        const targetGId = btn.dataset.target || 'all';
        authManager.pushReferencePaperToGroupChat(paperId, targetGId);
        alert('📢 审稿编辑 Agent 已向该小组研讨管道发送范文查阅提醒！');
      });
    });

    // 下载范文随附文件
    container.querySelectorAll('.btn-download-paper-file').forEach(btn => {
      btn.addEventListener('click', () => {
        const paperId = btn.dataset.id;
        const paper = refPapers.find(p => p.id === paperId);
        if (paper) {
          const fData = paper.fileUrl || paper.fileData || (window._paperMemoryBlobMap && window._paperMemoryBlobMap.get(paperId));
          downloadFileBlob(paper.fileName || '学术参考范文.pdf', null, fData);
        }
      });
    });

    // 删除范文按钮
    container.querySelectorAll('.btn-delete-paper').forEach(btn => {
      btn.addEventListener('click', () => {
        if (confirm('确认从参考范文库中删除此篇文献？')) {
          authManager.deleteReferencePaper(btn.dataset.id);
          renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
        }
      });
    });

    const selSwitchTask = container.querySelector('#sel-switch-monitor-task');
    if (selSwitchTask) {
      selSwitchTask.addEventListener('change', async (e) => {
        const targetTId = e.target.value;
        state.activeTaskId = targetTId;
        if (window.app) {
          window.app.state.activeTaskId = targetTId;
          window.app.loadGroupState(state.activeMonitorGroupId || (activeClass?.groups?.[0]?.id) || null);
        }
        renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
      });
    }

    const syncGroupDataFromMemory = (targetGId) => {
      state.activeMonitorGroupId = targetGId;
      state._lastMonitorHash = '';
      state._lastEpHash = '';
      if (state.monitorPanorama && state.monitorPanorama[targetGId]) {
        const gData = state.monitorPanorama[targetGId];
        state.stage1 = gData.stage1 || { proposals: [], votes: {}, hasVoted: {}, contract: {} };
        state.stage2 = { ...(state.stage2 || {}), ...(gData.stage2 || {}), unifiedContent: gData.stage2?.unifiedContent || '' };
        state.stage3 = gData.stage3 || { feedbackItems: [] };
        state.chatLogs = gData.chatLogs || { stage1: [], stage2: [], stage3: [] };
        state.currentStage = gData.currentStage || 'stage1';
        state.isFinalSubmitted = !!gData.isFinalSubmitted;
      }
      if (window.app) {
        window.app.state.activeMonitorGroupId = targetGId;
        window.app.loadGroupState(targetGId);
      }
      // 🛡️ 小组切换持久化：刷新后精准恢复到此次选中的小组
      try {
        sessionStorage.setItem('jizhi_teacher_active_group_id', targetGId);
        localStorage.setItem('jizhi_teacher_active_group_id', targetGId);
      } catch (e) {}
    };

    const selSwitchGroup = container.querySelector('#sel-switch-monitor-group');
    if (selSwitchGroup) {
      selSwitchGroup.addEventListener('change', (e) => {
        syncGroupDataFromMemory(e.target.value);
        renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
      });
    }

    container.querySelectorAll('.btn-monitor-panorama-card').forEach(card => {
      card.addEventListener('click', () => {
        syncGroupDataFromMemory(card.dataset.gid);
        renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
      });
    });

    container.querySelectorAll('.btn-switch-monitor-group').forEach(btn => {
      btn.addEventListener('click', () => {
        syncGroupDataFromMemory(btn.dataset.gid);
        renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
      });
    });

    container.querySelectorAll('.btn-monitor-stage-tab').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const stg = btn.dataset.stg;
        state.teacherMonitorStageMode = stg;
        state.monitorStageTab = stg;
        renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
      });
    });

    const btnStage3Def = container.querySelector('#btn-tab-teacher-stage3-defense');
    if (btnStage3Def) {
      btnStage3Def.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        state.stage3TeacherTab = 'defense';
        renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
      });
    }
    const btnStage3Doc = container.querySelector('#btn-tab-teacher-stage3-doc');
    if (btnStage3Doc) {
      btnStage3Doc.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        state.stage3TeacherTab = 'doc';
        renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
      });
    }

    const btnTogglePanorama = container.querySelector('#btn-toggle-teacher-panorama');
    if (btnTogglePanorama) {
      btnTogglePanorama.addEventListener('click', () => {
        state._isPanoramaCollapsed = !state._isPanoramaCollapsed;
        const bodyPano = container.querySelector('#body-teacher-panorama');
        const iconPano = container.querySelector('#icon-toggle-teacher-panorama');
        if (bodyPano) {
          bodyPano.style.display = state._isPanoramaCollapsed ? 'none' : 'grid';
        }
        if (iconPano) {
          iconPano.innerText = state._isPanoramaCollapsed ? '▼ 展开总览' : '▲ 收起';
        }
      });
    }

    const btnToggleTPlan = container.querySelector('#btn-toggle-teacher-action-plan');
    if (btnToggleTPlan) {
      btnToggleTPlan.addEventListener('click', () => {
        const bodyPlan = container.querySelector('#body-teacher-action-plan');
        const iconToggle = container.querySelector('#icon-toggle-teacher-plan');
        if (bodyPlan) {
          const isHidden = bodyPlan.style.display === 'none';
          bodyPlan.style.display = isHidden ? 'flex' : 'none';
          if (iconToggle) iconToggle.innerText = isHidden ? '▲ 收起' : '▼ 展开';
        }
      });
    }

    const btnExportExcel = container.querySelector('#btn-export-all-excel');
    if (btnExportExcel) {
      btnExportExcel.addEventListener('click', () => {
        authManager.exportGroupChatLogsToExcel(activeMonitorGId, state.chatLogs);
      });
    }

    // 💬 教师端研讨流滚动位置智能恢复（默认打开/首次切换在最下面；教师向上查历史时绝不强行下拉）
    container.querySelectorAll('.teacher-chat-stream').forEach(st => {
      const streamKey = `${st.id || 'stream'}_${activeMonitorGId}`;
      const saved = state._chatScrollPositions && state._chatScrollPositions[streamKey];
      if (saved) {
        if (saved.isAtBottom) {
          st.scrollTop = st.scrollHeight;
        } else {
          st.scrollTop = saved.scrollTop;
        }
      } else {
        st.scrollTop = st.scrollHeight;
      }
    });

    // 🎯 精准保持滚动条位置（恢复原容器滚动条位置，绝不跳回最顶部）
    const newLayout = container.querySelector('.teacher-portal-layout') || document.querySelector('.teacher-portal-layout');
    if (newLayout && savedScrollTop > 0) {
      newLayout.scrollTop = savedScrollTop;
      requestAnimationFrame(() => {
        if (newLayout) newLayout.scrollTop = savedScrollTop;
      });
      setTimeout(() => {
        if (newLayout) newLayout.scrollTop = savedScrollTop;
      }, 40);
    }
  }

  /* ==========================================================================
     MODULE: student-portal.js
     ========================================================================== */
  /**
   * JIZHI (集智) Platform - Student Task Portal & Dashboard
   * Standard ES Module (ESM)
   */


  /* ==========================================================================
     10. STUDENT TASK PORTAL (CENTRALIZED HUB & COLLABORATION ENTRY)
     ========================================================================== */
  function renderStudentTaskPortal(container, authManager, state, onSelectTask, onLogout, onSwitchTeacher, onOpenAnnModal, onOpenSurveyModal) {
    // ⚡ 监听全局广播（跨标签页秒级无感热同步大厅任务卡片、新任务发布与延期通知）
    if ('BroadcastChannel' in window) {
      try {
        if (window._studentPortalBc) { try { window._studentPortalBc.close(); } catch (e) {} }
        window._studentPortalBc = new BroadcastChannel('jizhi_global_events');
        window._studentPortalBc.onmessage = (e) => {
          if (state.studentViewMode !== 'task_list') return;

          // 1. 新任务发布广播
          if (e.data && e.data.type === 'task_created' && e.data.task) {
            const t = e.data.task;
            renderStudentTaskPortal(container, authManager, state, onSelectTask, onLogout, onSwitchTeacher, onOpenAnnModal, onOpenSurveyModal);
            showGlobalBannerNotice('📢 教师发布新任务', `任课教师刚刚发布了全新写作任务《${t.title || '新协作任务'}》！`, 'info', 8000);
            return;
          }

          // 2. 任务被删除广播
          if (e.data && e.data.type === 'task_deleted') {
            renderStudentTaskPortal(container, authManager, state, onSelectTask, onLogout, onSwitchTeacher, onOpenAnnModal, onOpenSurveyModal);
            return;
          }

          // 3. 任务更新广播
          if (e.data && e.data.type === 'task_updated') {
            renderStudentTaskPortal(container, authManager, state, onSelectTask, onLogout, onSwitchTeacher, onOpenAnnModal, onOpenSurveyModal);
            return;
          }

          // 4. 任务延期广播
          if (e.data && e.data.type === 'task_extended' && e.data.task) {
            const t = e.data.task;
            renderStudentTaskPortal(container, authManager, state, onSelectTask, onLogout, onSwitchTeacher, onOpenAnnModal, onOpenSurveyModal);

            let shownEvents = {};
            try { shownEvents = JSON.parse(sessionStorage.getItem('jizhi_shown_deadline_events') || '{}'); } catch (err) {}
            const eventKey = `${t.id}_${t.deadline}`;
            if (!shownEvents[eventKey]) {
              shownEvents[eventKey] = true;
              try { sessionStorage.setItem('jizhi_shown_deadline_events', JSON.stringify(shownEvents)); } catch (err) {}
              const extDurationStr = t.lastExtension?.extendDurationStr || (t.lastExtension?.addedMinutes ? `（增加了 ${t.lastExtension.addedMinutes} 分钟）` : '');
              showGlobalBannerNotice('⏳ 任务延期提醒', `班级写作任务《${t.title || '协作任务'}》截止时间已延长至 ${t.deadline} ${extDurationStr}！`, 'info', 8000);
            }
          }
        };
      } catch (e) {}
    }

    // ⚡ 单一自调度轮询循环：杜绝“一次性 pull + interval”并行导致的并发拉取与递归重渲染
    const pullAndRefresh = async () => {
      if (state.studentViewMode !== 'task_list') return; // 离开大厅即停止轮询
      if (authManager && authManager.pullGlobalMeta) {
        try {
          const oldTasksJson = localStorage.getItem(STORAGE_KEY_TASKS) || '[]';
          const oldAnnsJson = localStorage.getItem(STORAGE_KEY_ANNOUNCEMENTS) || '[]';
          const oldClassesJson = localStorage.getItem(STORAGE_KEY_CLASSES) || '[]';
          await authManager.pullGlobalMeta();
          const newTasksJson = localStorage.getItem(STORAGE_KEY_TASKS) || '[]';
          const newAnnsJson = localStorage.getItem(STORAGE_KEY_ANNOUNCEMENTS) || '[]';
          const newClassesJson = localStorage.getItem(STORAGE_KEY_CLASSES) || '[]';
          if (oldTasksJson !== newTasksJson || oldAnnsJson !== newAnnsJson || oldClassesJson !== newClassesJson) {
            if (document.activeElement?.id !== 'sel-student-class-switch') {
              renderStudentTaskPortal(container, authManager, state, onSelectTask, onLogout, onSwitchTeacher, onOpenAnnModal, onOpenSurveyModal);
              return; // 重渲染会重建整套循环，此处无需再自行调度
            }
          }
        } catch (e) {}
      }
      const isStudentIdle = () => document.hidden || (Date.now() - (window._lastStudentPortalActivity || Date.now()) > 60000);
      const sInterval = isStudentIdle() ? 10000 : 3000;
      window._studentPortalSyncTimer = setTimeout(pullAndRefresh, sInterval);
    };
    if (window._studentPortalSyncTimer) clearTimeout(window._studentPortalSyncTimer);

    window._lastStudentPortalActivity = Date.now();
    const markStudentPortalActive = () => {
      const wasIdle = (Date.now() - window._lastStudentPortalActivity > 60000);
      window._lastStudentPortalActivity = Date.now();
      if (wasIdle && state.studentViewMode === 'task_list') {
        pullAndRefresh();
      }
    };
    ['mousemove', 'keydown', 'touchstart', 'scroll', 'click'].forEach(evt => {
      window.addEventListener(evt, markStudentPortalActive, { passive: true });
    });

    const sInitInterval = (document.hidden ? 15000 : 3000);
    window._studentPortalSyncTimer = setTimeout(pullAndRefresh, sInitInterval);

    const currentUser = authManager.getCurrentUser();
    const classes = authManager.getClasses();
    const tasks = authManager.getTasks();
    const announcements = authManager.getAnnouncements();

    // 🔔 记录已知截止时间，防止冗余计算
    (tasks || []).forEach(t => {
      if (!t || !t.id || !t.deadline) return;
      const dlKey = `jizhi_known_deadline_${t.id}`;
      const newDlMs = new Date(t.deadline.replace(/-/g, '/')).getTime();
      localStorage.setItem(dlKey, String(newDlMs));
    });

    // 🏫 1. 严格按学生实际所属/修读的班级进行过滤（不在2班的学生绝不显示2班）
    const myClasses = (classes || []).filter(c => {
      if (currentUser?.classId && c.id === currentUser.classId) return true;
      if (Array.isArray(currentUser?.classIds) && currentUser.classIds.includes(c.id)) return true;
      if (Array.isArray(c.groups)) {
        for (const g of c.groups) {
          if (Array.isArray(g.members)) {
            const found = g.members.some(m => {
              const mId = typeof m === 'object' ? (m.id || m.studentCode || m.username || m.name) : m;
              const mCode = typeof m === 'object' ? (m.studentCode || m.code) : '';
              const mName = typeof m === 'object' ? m.name : '';
              return mId === currentUser?.id || mId === currentUser?.studentCode || mId === currentUser?.username ||
                     mCode === currentUser?.studentCode || (mName && mName === currentUser?.name);
            });
            if (found) return true;
          }
        }
      }
      if (Array.isArray(c.students)) {
        const inStudents = c.students.some(s => {
          const sId = typeof s === 'object' ? (s.id || s.studentCode || s.username || s.name) : s;
          const sCode = typeof s === 'object' ? (s.studentCode || s.code) : '';
          const sName = typeof s === 'object' ? s.name : '';
          return sId === currentUser?.id || sId === currentUser?.studentCode || sId === currentUser?.username ||
                 sCode === currentUser?.studentCode || (sName && sName === currentUser?.name);
        });
        if (inStudents) return true;
      }
      return false;
    });

    const displayClasses = myClasses.length > 0 ? myClasses : (
      (classes || []).filter(c => c.id === (currentUser?.classId || null)).length > 0
        ? (classes || []).filter(c => c.id === (currentUser?.classId || null))
        : (classes || [])
    );

    const activeUserClassId = state.activeStudentClassId && displayClasses.some(c => c.id === state.activeStudentClassId)
      ? state.activeStudentClassId
      : (displayClasses.find(c => c.id === currentUser?.classId)?.id || displayClasses[0].id);
    const userClass = displayClasses.find(c => c.id === activeUserClassId) || displayClasses[0];
    state.activeStudentClassId = userClass.id;

    // 👥 2. 动态精准匹配该学生在当前选定班级里的真实小组
    const activeGroupObj = authManager.getStudentActiveGroup(currentUser, userClass.id);
    const groupId = activeGroupObj.id;
    const groupName = activeGroupObj.name || '第 1 协作小组';

    const relevantTasks = tasks.filter(t => {
      if (!t) return false;
      if (!t.classId || t.classId === 'all' || t.classId === 'class_all') return true;
      return t.classId === userClass.id || 
             (t.className && t.className === userClass.name) ||
             (Array.isArray(t.targetClassIds) && (t.targetClassIds.includes('all') || t.targetClassIds.includes(userClass.id)));
    });
    container.innerHTML = `
      <div class="student-task-portal" style="min-height:100vh; background:#f0f4f9; display:flex; flex-direction:column;">
        <header class="app-header" style="height:60px; background:#ffffff; border-bottom:1px solid #e2e8f0; display:flex; align-items:center; justify-content:space-between; padding:0 24px; box-shadow:0 1px 3px rgba(15,23,42,0.04);">
          <div class="brand-section" style="display:flex; align-items:center; gap:12px;">
            <div class="brand-logo" style="font-size:20px; font-weight:800; background:linear-gradient(135deg, #1e40af, #2563eb); -webkit-background-clip:text; -webkit-text-fill-color:transparent;">集智 JIZHI</div>
            <div class="brand-badge" style="background:#eff6ff; color:#2563eb; padding:4px 12px; border-radius:20px; font-size:12px; font-weight:700; border:1px solid #bfdbfe;">
              🎓 ${currentUser ? currentUser.name : '学生'} · ${userClass ? userClass.name : '学术写作班级'} · ${groupName}
            </div>
          </div>
          <div class="header-controls" style="display:flex; align-items:center; gap:10px;">
            <button id="btn-portal-change-pwd" style="background:#f0fdf4; color:#16a34a; border:1px solid #bbf7d0; padding:6px 14px; border-radius:18px; font-size:12px; font-weight:700; cursor:pointer;" title="修改登录密码">🔑 修改密码</button>
            <button id="btn-portal-logout" style="background:#fef2f2; color:#dc2626; border:1px solid #fecaca; padding:6px 14px; border-radius:18px; font-size:12px; font-weight:700; cursor:pointer;">🚪 退出登录</button>
          </div>
        </header>

        <main style="flex:1; padding:32px; max-width:1200px; width:100%; margin:0 auto; display:flex; flex-direction:column; gap:24px; box-sizing:border-box;">
          <div style="background:linear-gradient(135deg, #1e40af, #2563eb); border-radius:16px; padding:28px 32px; color:white; box-shadow:0 8px 24px rgba(37, 99, 235, 0.18); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:20px;">
            <div style="flex:1; min-width:300px;">
              <div style="font-size:24px; font-weight:800; letter-spacing:-0.5px; display:flex; align-items:center; gap:10px;">
                📋 我的协作写作任务大厅
              </div>
              <div style="font-size:13.5px; opacity:0.92; margin-top:8px; line-height:1.5;">
                欢迎进入集智多智能体协同写作学习系统！请选择下方教师发布的任务，点击【🚀 进入协作工作台】开展人机协同写作。
              </div>
            </div>

            <!-- 宽幅舒展拉长版班级与小组身份卡 (支持自由切换班级并实时匹配小组) -->
            <div style="background:#ffffff; border-radius:14px; padding:16px 22px; color:#0f172a; box-shadow:0 4px 16px rgba(0,0,0,0.08); display:flex; flex-direction:column; gap:10px; min-width:380px; flex:0 0 auto;">
              <div style="display:flex; justify-content:space-between; align-items:center; gap:12px;">
                <span style="font-size:12.5px; color:#64748b; font-weight:700; white-space:nowrap;">🏫 选择修读班级:</span>
                <select id="sel-student-class-switch" style="background:#eff6ff; color:#1d4ed8; border:1.5px solid #bfdbfe; padding:6px 12px; border-radius:8px; font-size:13px; font-weight:800; cursor:pointer; outline:none; flex:1; min-width:200px;">
                  ${displayClasses.map(c => `<option value="${c.id}" ${c.id === userClass.id ? 'selected' : ''}>🏫 ${c.name}</option>`).join('')}
                </select>
              </div>
              <div style="display:flex; align-items:center; justify-content:space-between; border-top:1px dashed #e2e8f0; padding-top:10px; gap:12px;">
                <span style="font-size:12.5px; color:#64748b; font-weight:700; white-space:nowrap;">👥 匹配协作小组:</span>
                <span style="background:#f0fdf4; color:#15803d; border:1px solid #bbf7d0; padding:4px 12px; border-radius:8px; font-size:13px; font-weight:800; text-align:right;">
                  ${groupName} (${currentUser ? currentUser.name : '学生'})
                </span>
              </div>
            </div>
          </div>

          <div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
              <div style="font-size:17px; font-weight:800; color:#0f172a;">📚 【${userClass.name}】协作任务清单 (${relevantTasks.length} 项)</div>
            </div>

            ${relevantTasks.length === 0 ? `
              <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:16px; padding:50px 24px; text-align:center; box-shadow:0 2px 8px rgba(15,23,42,0.04);">
                <div style="font-size:42px; margin-bottom:10px;">⏳</div>
                <div style="font-size:17px; font-weight:700; color:#1e293b;">暂无已发布的写作任务</div>
                <div style="font-size:13px; color:#64748b; margin-top:6px;">任课教师尚未发布新任务，请等待教师在教师端发布，或点击下方直接进入协作工作台体验。</div>
                <button id="btn-enter-default-workspace" style="margin-top:18px; background:#2563eb; color:white; border:none; padding:11px 24px; border-radius:10px; font-size:13.5px; font-weight:700; cursor:pointer; box-shadow:0 4px 12px rgba(37,99,235,0.25);">
                  🚀 直接进入默认协作工作台
                </button>
              </div>
            ` : `
              <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(460px, 1fr)); gap:20px;">
                ${relevantTasks.map((t, idx) => {
                  const duration = t.durationMinutes || 150;
                  const taskSeqNum = relevantTasks.length - idx;
                  const isLatest = idx === 0;
                  const isExpired = isTaskExpired(t);
                  // 仅当前进入的任务展示真实协作进度，其余任务展示中立“已发布”状态（避免全局阶段串入各卡片）
                  const isActiveTask = (t.id === state.activeTaskId);
                  const progressLabel = isExpired
                    ? '🛑 本任务已到截止时间 · 已截止'
                    : (isActiveTask
                        ? (state.isFinalSubmitted ? '🔒 终稿已全员答辩并提交归档' : (state.currentStage === 'stage1' ? '🎪 阶段一：学术拍卖会' : (state.currentStage === 'stage2' ? '📰 阶段二：学术编辑部 (撰写中)' : '🎓 阶段三：答辩擂台')))
                        : '📋 进行中 · 待进入协作');
                  const calcRemaining = (deadlineStr) => {
                    if (!deadlineStr) return null;
                    try {
                      const dMs = new Date(deadlineStr.replace(/-/g, '/')).getTime();
                      if (isNaN(dMs)) return null;
                      const diff = dMs - Date.now();
                      if (diff <= 0) return { expired: true, text: '🛑 已截止' };
                      const totalM = Math.floor(diff / 60000);
                      const h = Math.floor(totalM / 60);
                      const m = totalM % 60;
                      if (h >= 24) {
                        const days = Math.floor(h / 24);
                        return { expired: false, text: `⏰ 剩余 ${days}天${h % 24}小时` };
                      }
                      return { expired: false, text: `⏰ 剩余 ${h}小时${m}分` };
                    } catch(e) { return null; }
                  };
                  const remainInfo = calcRemaining(t.deadline);

                  return `
                    <div class="student-task-card" style="background:#ffffff; border:1.5px solid ${isExpired ? '#fca5a5' : '#e2e8f0'}; border-radius:16px; padding:22px; box-shadow:0 4px 16px -2px rgba(15,23,42,0.04); display:flex; flex-direction:column; justify-content:space-between; transition:all 0.2s ease;">
                      <div>
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:14px;">
                          <div style="font-size:17px; font-weight:800; color:#0f172a; line-height:1.4; display:flex; align-items:center; gap:8px;">
                            <span style="background:${isExpired ? 'linear-gradient(135deg, #ef4444, #dc2626)' : 'linear-gradient(135deg, #1e40af, #3b82f6)'}; color:#ffffff; padding:2.5px 9px; border-radius:6px; font-size:12px; font-weight:800; white-space:nowrap; box-shadow:0 2px 6px rgba(30,64,175,0.25);">
                              任务 ${taskSeqNum}${isLatest ? ' (最新)' : ''}
                            </span>
                            <span>📌 ${escapeHtml(t.title)}</span>
                          </div>
                          <div style="display:flex; gap:6px; align-items:center; flex-shrink:0;">
                            ${remainInfo ? `
                              <span style="background:${remainInfo.expired ? '#fef2f2' : '#f0fdf4'}; color:${remainInfo.expired ? '#dc2626' : '#16a34a'}; border:1px solid ${remainInfo.expired ? '#fecaca' : '#bbf7d0'}; font-size:11.5px; font-weight:800; padding:3px 10px; border-radius:20px;">
                                ${remainInfo.text}
                              </span>
                            ` : ''}
                            <span style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; font-size:11.5px; font-weight:700; padding:3px 10px; border-radius:20px;">
                              👥 ${escapeHtml(t.targetGroupName || groupName)}
                            </span>
                          </div>
                        </div>

                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px 12px; font-size:11.5px; color:#475569; margin-bottom:12px; background:${isExpired ? '#fef2f2' : '#f8fafc'}; padding:10px 14px; border-radius:10px; border:1px solid ${isExpired ? '#fee2e2' : '#f1f5f9'};">
                          <div>🕒 发布时间: <b style="color:#0f172a;">${formatStandardDateDash(t.createdAt || t.startTime) || '刚刚'}</b></div>
                          <div>⏱️ 任务时长: <b style="color:#2563eb;">${formatDurationHuman(duration)}</b></div>
                          <div>📅 开始时间: <b style="color:#0f172a;">${formatStandardDateDash(t.startTime) || '随时'}</b></div>
                          <div>⌛ 截止时间: <b style="color:#dc2626; font-weight:800;">${formatStandardDateDash(t.deadline) || '结课前'}</b></div>
                        </div>

                        <div style="font-size:12.5px; color:#334155; line-height:1.6; margin-bottom:12px; background:#f8fafc; border-left:3.5px solid ${isExpired ? '#dc2626' : '#2563eb'}; padding:8px 12px; border-radius:0 8px 8px 0;">
                          ${t.instructions ? escapeHtml(t.instructions.substring(0, 130)) + (t.instructions.length > 130 ? '...' : '') : '<span style="color:#94a3b8; font-style:italic;">暂无详细要求说明</span>'}
                        </div>

                        <div style="display:flex; align-items:center; gap:8px; font-size:12px; font-weight:600; color:#64748b; margin-bottom:16px;">
                          <span>协作状态:</span>
                          <span style="background:${isExpired ? '#fef2f2' : '#ecfdf5'}; color:${isExpired ? '#dc2626' : '#059669'}; border:1px solid ${isExpired ? '#fecaca' : '#a7f3d0'}; padding:2px 8px; border-radius:6px; font-size:11.5px; font-weight:700;">
                            ${progressLabel}
                          </span>
                        </div>
                      </div>

                      <div style="border-top:1px solid #f1f5f9; padding-top:14px;">
                        <button class="btn-enter-task-workspace" data-task-id="${t.id}" style="width:100%; background:${isExpired ? 'linear-gradient(135deg, #475569, #64748b)' : 'linear-gradient(135deg, #1d4ed8, #2563eb)'}; color:white; border:none; padding:11px 18px; border-radius:10px; font-size:13.5px; font-weight:700; cursor:pointer; box-shadow:0 4px 12px ${isExpired ? 'rgba(100,116,139,0.2)' : 'rgba(37,99,235,0.2)'}; display:flex; align-items:center; justify-content:center; gap:6px; transition:all 0.2s ease;">
                          ${isExpired ? '🔒 查看写作内容 (已截止只读)' : '🚀 进入协作工作台'}
                        </button>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            `}
          </div>
        </main>
      </div>
    `;

    const selClassSwitch = container.querySelector('#sel-student-class-switch');
    if (selClassSwitch) {
      selClassSwitch.addEventListener('change', (e) => {
        const newClassId = e.target.value;
        state.activeStudentClassId = newClassId;
        const newGroupObj = authManager.getStudentActiveGroup(currentUser, newClassId);
        if (window.app && newGroupObj && newGroupObj.id) {
          window.app.loadGroupState(newGroupObj.id);
        }
        renderStudentTaskPortal(container, authManager, state, onSelectTask, onLogout, onSwitchTeacher, onOpenAnnModal, onOpenSurveyModal);
      });
    }

    container.querySelector('#btn-portal-logout')?.addEventListener('click', () => onLogout());
    container.querySelector('#btn-portal-change-pwd')?.addEventListener('click', () => {
      authManager.openChangePasswordModal();
    });
    container.querySelector('#btn-portal-switch-teacher')?.addEventListener('click', () => onSwitchTeacher());
    container.querySelector('#btn-enter-default-workspace')?.addEventListener('click', () => onSelectTask(null));
    container.querySelectorAll('.btn-enter-task-workspace').forEach(btn => {
      btn.addEventListener('click', () => onSelectTask(btn.dataset.taskId));
    });
  }

  /* ==========================================================================
     MODULE: editor.js
     ========================================================================== */
  /**
   * JIZHI (集智) Platform - Collaborative Rich Text Editor & Academic Plugins
   * Standard ES Module (ESM)
   */


  /* ==========================================================================
     8. UI RENDERER (STUDENT CANVAS & HEADER)
     ========================================================================== */
  function renderHeader(state, currentUser, announcements, onStageChange, onSpeedChange, onLogout, onSwitchTeacher, onOpenAnnModal, onOpenSurveyModal, onBackToTaskList) {
    const header = document.getElementById('app-header');
    if (!header) return;
    const activeTaskId = (state && state.activeTaskId) ? state.activeTaskId : 'task_default';
    const allTasks = (window.app && window.app.authManager) ? window.app.authManager.getTasks() : [];
    const currentTask = allTasks.find(t => t.id === activeTaskId);

    let remainingMin = 150;
    if (currentTask) {
      if (currentTask.deadline) {
        const raw = String(currentTask.deadline).trim();
        if (raw && !raw.includes('无') && !raw.includes('随时') && !raw.includes('结课前') && !raw.includes('不限')) {
          const deadlineDate = new Date(raw.replace(/-/g, '/'));
          if (!isNaN(deadlineDate.getTime())) {
            const now = new Date();
            const diffMs = deadlineDate.getTime() - now.getTime();
            remainingMin = Math.max(0, Math.floor(diffMs / 60000));
          }
        }
      } else {
        const totalDurationMin = currentTask.durationMinutes ? Number(currentTask.durationMinutes) : 150;
        const elapsedMin = Math.floor((state.timer && state.timer.elapsedSeconds ? state.timer.elapsedSeconds : 0) / 60);
        remainingMin = Math.max(0, totalDurationMin - elapsedMin);
      }
    }

    const activeClassId = (window.app?.authManager ? window.app.authManager.getEffectiveStudentClassId(currentUser, state.activeTaskId) : (state.activeStudentClassId || currentUser?.classId || null));
    const activeGroupObj = (window.app && window.app.authManager) ? window.app.authManager.getStudentActiveGroup(currentUser, activeClassId) : null;
    const groupId = state.activeGroupId || (window.app && window.app.cloudSyncEngine?.groupId) || activeGroupObj?.id || currentUser?.groupId || 'group_unassigned';
    const groupName = activeGroupObj?.name || '协作小组';
    const currentTaskTitle = currentTask ? currentTask.title : '写作任务';

    // 严格按【当前班级】、【当前任务】和【当前小组】三位一体过滤教学通知（延期由瞬时大弹窗处理，不混入通知中心）
    const relevantAnnouncements = (announcements || []).filter(a => {
      if (!a || a.isExtension || a.title?.includes('延期') || a.title?.includes('延长至')) return false;
      const matchClass = !a.classId || a.classId === 'all' || (a.classId === activeClassId) || 
                         (Array.isArray(a.targetClassIds) && (a.targetClassIds.includes('all') || a.targetClassIds.includes(activeClassId)));
      const matchGroup = !a.targetGroupId || a.targetGroupId === 'all' || a.targetGroupId === groupId ||
        (Array.isArray(a.targetGroupIds) && (a.targetGroupIds.includes('all') || a.targetGroupIds.includes(groupId)));
      const matchTask = !a.taskId || a.taskId === 'task_all' || a.taskId === activeTaskId || (!a.taskId && activeTaskId === 'task_default');
      return matchClass && matchGroup && matchTask;
    });
    const isAnnRead = (a) => {
      if (!a) return false;
      try {
        const localReadMap = JSON.parse(localStorage.getItem('jizhi_locally_read_announcements') || '{}');
        if (localReadMap[a.id]) return true;
      } catch (e) {}
      if (currentUser) {
        if (currentUser.id && a.readStatus && a.readStatus[currentUser.id]) return true;
        if (currentUser.studentCode && a.readStatus && a.readStatus[currentUser.studentCode]) return true;
        if (currentUser.username && a.readStatus && a.readStatus[currentUser.username]) return true;
        if (currentUser.name && a.readStatus && a.readStatus[currentUser.name]) return true;
        if (groupId && a.readGroupStatus && a.readGroupStatus[groupId]) return true;
        if (Array.isArray(a.confirmedMembers)) {
          if (a.confirmedMembers.some(m => m && (m.id === currentUser.id || m.studentCode === currentUser.studentCode || (currentUser.name && m.name === currentUser.name)))) return true;
        }
      }
      return false;
    };
    const unreadAnnCount = relevantAnnouncements.filter(a => !isAnnRead(a)).length;
    const isTaskDeadlineExpired = isTaskExpired(currentTask);
    const isFinalSubmitted = state.isFinalSubmitted || isTaskDeadlineExpired;

    const s1 = state.stage1 || {};
    const s2 = state.stage2 || {};
    const s3 = state.stage3 || {};
    const isContractSigned = !!(
      s1.contract?.signed || 
      s1.contract?.isConfirmed || 
      (s1.contract?.confirmedMembers && (
        (Array.isArray(s1.contract.confirmedMembers) && s1.contract.confirmedMembers.length > 0) ||
        (typeof s1.contract.confirmedMembers === 'object' && Object.keys(s1.contract.confirmedMembers).length > 0)
      ))
    );
    const isDraftDone = !!(s2.isDraftConfirmed || (s2.meetingSubmissions && Object.keys(s2.meetingSubmissions).length > 0) || state.groupMaxStage === 'stage3' || state.isFinalSubmitted);
    const isStage3Active = !!(state.groupMaxStage === 'stage3' || state.isFinalSubmitted || isDraftDone || (s3.confirmedMembers && Object.keys(s3.confirmedMembers).length > 0) || (s3.finalSubmittedMembers && Object.keys(s3.finalSubmittedMembers).length > 0));

    let currentMaxStage = state.groupMaxStage || 'stage1';
    if (isStage3Active) currentMaxStage = 'stage3';
    else if (isContractSigned || currentMaxStage === 'stage2') currentMaxStage = 'stage2';

    const stageOrder = { stage1: 1, stage2: 2, stage3: 3 };
    const currentMaxOrder = stageOrder[currentMaxStage] || 1;
    // 🌟 截止后或已归档后三个阶段全部解锁，允许学生自由切换查阅回看；未截止且未归档时按协作进度阶梯式解锁
    const isS2Locked = !isTaskDeadlineExpired && !state.isFinalSubmitted && (!isContractSigned && currentMaxOrder < 2);
    const isS3Locked = !isTaskDeadlineExpired && !state.isFinalSubmitted && currentMaxOrder < 3;

    const newHeaderHtml = `
      <div class="brand-section">
        <div class="brand-logo">集智 JIZHI</div>
        <div class="brand-badge" style="background:#eff6ff; color:#1d4ed8; padding:3px 12px; border-radius:20px; font-size:12px; font-weight:700; border:1px solid #bfdbfe; display:inline-flex; align-items:center; gap:6px;">
          <span>🎓 ${escapeHtml(currentUser ? currentUser.name : '学生')}</span>
          <span style="opacity:0.35;">·</span>
          <span>👥 ${escapeHtml(groupName)}</span>
          <span style="opacity:0.35;">·</span>
          <span style="color:#1e40af; background:#ffffff; padding:1.5px 8px; border-radius:10px; border:1px solid #bfdbfe; font-weight:800;">📌 ${escapeHtml(currentTaskTitle)}</span>
          ${isFinalSubmitted ? '<span style="color:#059669; margin-left:3px;">(🔒已归档)</span>' : ''}
        </div>
        <button id="btn-header-back-tasks" style="background:#f8fafc; border:1px solid #cbd5e1; color:#334155; padding:3px 8px; border-radius:14px; font-size:11px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:3px;" title="返回我的写作任务大厅">
          📋 任务大厅
        </button>
      </div>
      <nav class="stage-nav">
        <button class="stage-btn ${state.currentStage === 'stage1' ? 'active' : ''}" data-stage="stage1" title="阶段一：学术拍卖会 (25分钟)">🎪 阶段一: 拍卖会</button>
        <button class="stage-btn ${state.currentStage === 'stage2' ? 'active' : ''} ${isS2Locked ? 'stage-locked' : ''}" data-stage="stage2" style="${isS2Locked ? 'opacity:0.65;' : ''}" title="${isS2Locked ? '🔒 待阶段一公约签署完成后解锁' : '阶段二：学术编辑部 (105分钟)'}">${isS2Locked ? '🔒 ' : ''}📰 阶段二: 编辑部</button>
        <button class="stage-btn ${state.currentStage === 'stage3' ? 'active' : ''} ${isS3Locked ? 'stage-locked' : ''}" data-stage="stage3" style="${isS3Locked ? 'opacity:0.65;' : ''}" title="${isS3Locked ? '🔒 待阶段二编辑会议与正文完成后解锁' : '阶段三：答辩擂台 (20分钟)'}">${isS3Locked ? '🔒 ' : ''}🎓 阶段三: 答辩擂台</button>
      </nav>
      <div class="header-controls">
        <button id="btn-header-survey-link" style="background:#eff6ff; border:1px solid #bfdbfe; color:#2563eb; padding:3px 8px; border-radius:14px; font-size:11px; font-weight:700; cursor:pointer;" title="课程评估问卷">
          📋 问卷
        </button>
        <button class="nav-ann-bell-btn ${unreadAnnCount > 0 ? 'has-unread' : ''}" id="btn-header-ann-bell" title="课堂教学通知与延期" style="padding:3px 10px; border-radius:14px; font-size:11.5px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:4px; background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe;">
          <span>📢 教学通知</span>${unreadAnnCount > 0 ? `<span style="background:#ef4444; color:#ffffff; font-size:10.5px; font-weight:800; padding:1px 6px; border-radius:10px; box-shadow:0 1px 4px rgba(239,68,68,0.4);">${unreadAnnCount}</span>` : ''}
        </button>
        <div class="timer-box" style="padding:2px 10px; border-radius:14px; font-size:11.5px; font-weight:700; white-space:nowrap; background:${isTaskDeadlineExpired ? '#fef2f2' : '#eff6ff'}; color:${isTaskDeadlineExpired ? '#dc2626' : '#1d4ed8'}; border:1px solid ${isTaskDeadlineExpired ? '#fecaca' : '#bfdbfe'};">
          ${isTaskDeadlineExpired ? '🛑 已截止' : `⏱️ 剩余 ${formatDurationHuman(remainingMin, true)}`}
        </div>
        <button id="btn-user-logout" style="background:#fef2f2; color:#dc2626; border:1px solid #fecaca; padding:3px 8px; border-radius:14px; font-size:11px; font-weight:700; cursor:pointer;" title="退出登录">🚪 退出</button>
      </div>
    `;

    if (header.innerHTML !== newHeaderHtml) {
      header.innerHTML = newHeaderHtml;
      header.querySelectorAll('.stage-btn').forEach(btn => {
        btn.addEventListener('click', () => onStageChange(btn.dataset.stage));
      });
      header.querySelector('#btn-user-logout').addEventListener('click', () => onLogout());
      header.querySelector('#btn-header-ann-bell').addEventListener('click', () => onOpenAnnModal());
      const btnBackTasks = header.querySelector('#btn-header-back-tasks');
      if (btnBackTasks && onBackToTaskList) {
        btnBackTasks.addEventListener('click', () => onBackToTaskList());
      }
      const surveyHeaderBtn = header.querySelector('#btn-header-survey-link');
      if (surveyHeaderBtn) surveyHeaderBtn.addEventListener('click', () => onOpenSurveyModal());
    }
  }

  function renderCanvas(state, handlers) {
    const canvas = document.getElementById('canvas-panel');
    if (!canvas) return;
    if (state.currentStage === 'stage1') renderStage1Canvas(canvas, state, handlers);
    else if (state.currentStage === 'stage2') renderStage2Canvas(canvas, state, handlers);
    else if (state.currentStage === 'stage3') renderStage3Canvas(canvas, state, handlers);
  }

  function buildWordEditorHtml(editorId, initialHtml, isReadonly) {
    return `
      <div class="word-editor-container" id="${editorId}-wrapper">
        ${!isReadonly ? `
          <div class="word-toolbar">
            <!-- 1. 历史操作与格式刷 -->
            <div class="word-toolbar-group">
              <button class="word-btn" id="${editorId}-btn-undo" title="撤销 (Ctrl+Z)">↩️ 撤销</button>
              <button class="word-btn" id="${editorId}-btn-redo" title="重做 (Ctrl+Y)">↪️ 重做</button>
              <button class="word-btn" id="${editorId}-btn-format-painter" title="格式刷 (复制选中文字格式并应用到下一段文字)">🖌️ 格式刷</button>
            </div>

            <!-- 2. 论文大纲与章节层级 (结构化标签) -->
            <div class="word-toolbar-group" title="设置当前段落的论文大纲层级">
              <span style="font-size:11px; font-weight:700; color:#64748b; margin-right:2px;">📑 层级:</span>
              <select class="word-select" id="${editorId}-sel-format" title="段落与大纲层级" style="width:130px; font-weight:600; color:#1e40af;">
                <option value="p">正文段落 (Body)</option>
                <option value="h1">论文总题目 (H1)</option>
                <option value="h2">一级章标题 (H2)</option>
                <option value="h3">二级节标题 (H3)</option>
                <option value="h4">三级小节 (H4)</option>
                <option value="blockquote">引文与摘要块</option>
              </select>
            </div>

            <!-- 3. 字体与字号设置 (丰富学术与通用字体库) -->
            <div class="word-toolbar-group" title="设置选中文字的字体与字号">
              <span style="font-size:11px; font-weight:700; color:#64748b; margin-right:2px;">🔤 字体字号:</span>
              <select class="word-select" id="${editorId}-sel-font" title="学术中英文字体" style="width:130px;">
                <option value="SimSun, 'Songti SC', serif">宋体 (学术标准)</option>
                <option value="SimHei, 'Heiti SC', sans-serif">黑体 (大标题)</option>
                <option value="FangSong, 'FangSong SC', serif">仿宋 (公文标准)</option>
                <option value="KaiTi, 'Kaiti SC', serif">楷体 (引文/致谢)</option>
                <option value="'Microsoft YaHei', 'PingFang SC', sans-serif">微软雅黑 / 苹方</option>
                <option value="'Times New Roman', serif">Times New Roman</option>
                <option value="Arial, sans-serif">Arial</option>
                <option value="Calibri, sans-serif">Calibri</option>
                <option value="'Courier New', monospace">Courier New (代码)</option>
                <option value="Georgia, serif">Georgia (英文期刊)</option>
              </select>
              <select class="word-select" id="${editorId}-sel-size" title="标准论文中英文字号" style="width:115px;">
                <option value="42px">初号 (42pt)</option>
                <option value="36px">小初 (36pt)</option>
                <option value="26px">一号 (26pt)</option>
                <option value="24px">小一 (24pt)</option>
                <option value="22px">二号 (22pt)</option>
                <option value="18px">小二 (18pt)</option>
                <option value="16px">三号 (16pt)</option>
                <option value="15px">小三 (15pt)</option>
                <option value="14px">四号 (14pt)</option>
                <option value="12px" selected>小四 (12pt / 正文)</option>
                <option value="10.5px">五号 (10.5pt)</option>
                <option value="9px">小五 (9pt)</option>
                <option value="7.5px">六号 (7.5pt)</option>
              </select>
            </div>

            <!-- 4. 文字修饰 -->
            <div class="word-toolbar-group">
              <button class="word-btn" id="${editorId}-btn-bold" title="粗体 (Ctrl+B)"><b>B</b></button>
              <button class="word-btn" id="${editorId}-btn-italic" title="斜体 (Ctrl+I)"><i>I</i></button>
              <button class="word-btn" id="${editorId}-btn-underline" title="下划线 (Ctrl+U)"><u>U</u></button>
              <button class="word-btn" id="${editorId}-btn-strike" title="删除线"><s>S</s></button>
              <button class="word-btn" id="${editorId}-btn-sup" title="上标 (文献角标 [1])">X²</button>
              <button class="word-btn" id="${editorId}-btn-sub" title="下标 (变量角标 H₁)">X₂</button>
            </div>

            <!-- 5. 排版、对齐、缩进设置与行间距 -->
            <div class="word-toolbar-group">
              <select class="word-select" id="${editorId}-sel-line-height" title="行间距 (行高)" style="width:96px;">
                <option value="1.5" selected>1.5倍 (标准)</option>
                <option value="1.0">单倍行距</option>
                <option value="1.25">1.25倍行距</option>
                <option value="1.75">1.75倍行距</option>
                <option value="2.0">双倍 (2.0倍)</option>
              </select>
              <!-- 首行缩进 (支持小数自定义填入) -->
              <div style="display:inline-flex; align-items:center; background:#f8fafc; border:1px solid #cbd5e1; border-radius:4px; padding:1px 6px; gap:2px;" title="首行缩进字符数 (可直接输入任意小数，如 2 或 1.5)">
                <span style="font-size:11px; font-weight:700; color:#475569;">首行:</span>
                <input type="number" id="${editorId}-num-indent" value="2" min="0" max="20" step="0.5" style="width:36px; padding:2px 2px; border:1px solid #cbd5e1; border-radius:3px; font-size:11.5px; font-weight:700; text-align:center; background:#ffffff;">
                <span style="font-size:11px; color:#64748b;">字符</span>
              </div>

              <!-- 悬挂缩进 (支持小数自定义填入) -->
              <div style="display:inline-flex; align-items:center; background:#f8fafc; border:1px solid #cbd5e1; border-radius:4px; padding:1px 6px; gap:2px;" title="悬挂缩进字符数 (参考文献格式，可输入任意小数，如 2 或 1.5，填 0 取消)">
                <span style="font-size:11px; font-weight:700; color:#475569;">⇤ 悬挂:</span>
                <input type="number" id="${editorId}-num-hanging-indent" value="2" min="0" max="20" step="0.5" style="width:36px; padding:2px 2px; border:1px solid #cbd5e1; border-radius:3px; font-size:11.5px; font-weight:700; text-align:center; background:#ffffff;">
                <span style="font-size:11px; color:#64748b;">字符</span>
                <button class="word-btn" id="${editorId}-btn-apply-hanging" style="padding:1px 5px; font-size:11px; margin-left:2px; background:#2563eb; color:white;" title="应用悬挂缩进">应用</button>
              </div>

              <button class="word-btn" id="${editorId}-btn-align-left" title="左对齐">⇤</button>
              <button class="word-btn" id="${editorId}-btn-align-center" title="居中对齐">☰</button>
              <button class="word-btn" id="${editorId}-btn-align-right" title="右对齐">⇥</button>
              <button class="word-btn" id="${editorId}-btn-align-justify" title="两端对齐 (学术正文标准)">☲</button>
              <button class="word-btn" id="${editorId}-btn-list-ul" title="项目符号">• 列表</button>
              <button class="word-btn" id="${editorId}-btn-list-ol" title="编号列表">1. 编号</button>
              <button class="word-btn" id="${editorId}-btn-hr" title="插入水平分隔线">― 分隔线</button>
            </div>

            <!-- 6. 颜色、荧光笔与清格式 -->
            <div class="word-toolbar-group">
              <label style="display:flex; align-items:center; gap:3px; font-size:11px; color:#94a3b8; cursor:pointer;" title="文字颜色">
                <span>🎨</span>
                <input type="color" id="${editorId}-color-text" value="#0f172a" style="width:18px; height:18px; border:none; background:transparent; cursor:pointer;">
              </label>
              <button class="word-btn" id="${editorId}-btn-hilite-yellow" title="黄色批注高亮" style="color:#facc15;">🖍️ 黄</button>
              <button class="word-btn" id="${editorId}-btn-hilite-green" title="绿色建议高亮" style="color:#4ade80;">🖍️ 绿</button>
              <button class="word-btn" id="${editorId}-btn-clear-format" title="清除格式">🧹 清格式</button>
            </div>

            <!-- 7. 学术论文插件套件 -->
            <div class="word-toolbar-group">
              <button class="word-btn plugin-btn" id="${editorId}-btn-insert-image" title="插入学术图表与图题说明">🖼️ 图表</button>
              <button class="word-btn plugin-btn" id="${editorId}-btn-insert-table" title="插入标准学术三线表">📊 三线表</button>
              <button class="word-btn plugin-btn" id="${editorId}-btn-insert-symbol" title="高阶学术公式与统计符号库">🔣 符号</button>
              <button class="word-btn plugin-btn" id="${editorId}-btn-insert-citation" title="插入文献引用角标 [n]">📑 [n]</button>
              <button class="word-btn plugin-btn" id="${editorId}-btn-insert-abstract" title="插入【摘要与关键词】学术前置卡片">📌 摘要</button>
              <button class="word-btn plugin-btn" id="${editorId}-btn-insert-ref-template" title="在文末插入标准参考文献模版">📚 文献</button>
              <button class="word-btn plugin-btn" id="${editorId}-btn-find-replace" title="文档内查找与替换">🔍 查找替换</button>
            </div>
          </div>

          <div class="search-replace-bar" id="${editorId}-search-bar" style="display:none; align-items:center; gap:8px; padding:8px 14px; background:#f8fafc; border-bottom:1px solid #e2e8f0; font-size:12px;">
            <span style="font-weight:700; color:#334155;">🔍 查找:</span>
            <input type="text" id="${editorId}-search-input" placeholder="输入要查找的关键词..." style="padding:4px 8px; border:1px solid #cbd5e1; border-radius:4px; font-size:12px; width:150px;">
            <button class="word-btn" id="${editorId}-btn-find-next" style="background:#2563eb; color:white; font-size:11.5px; padding:3px 10px;">下一个</button>
            <span id="${editorId}-find-count-tip" style="color:#64748b; font-size:11px;"></span>
            <span style="font-weight:700; color:#334155; margin-left:8px;">替换为:</span>
            <input type="text" id="${editorId}-replace-input" placeholder="替换内容..." style="padding:4px 8px; border:1px solid #cbd5e1; border-radius:4px; font-size:12px; width:130px;">
            <button class="word-btn" id="${editorId}-btn-do-replace" style="background:#0284c7; color:white; font-size:11.5px; padding:3px 10px;">替换当前</button>
            <button class="word-btn" id="${editorId}-btn-do-replace-all" style="background:#059669; color:white; font-size:11.5px; padding:3px 10px;">全部替换</button>
            <button class="word-btn" id="${editorId}-btn-close-search" style="background:none; border:none; color:#94a3b8; cursor:pointer; font-weight:700; margin-left:auto;">✕ 关闭</button>
          </div>
        ` : `
          <div class="word-toolbar" style="background:rgba(30,41,59,0.9); justify-content:space-between;">
            <div style="font-size:13px; font-weight:700; color:#34d399;">🔒 论文终稿已提交归档 · 只读查阅模式</div>
          </div>
        `}

        <div class="collab-presence-header" id="${editorId}-presence-header" style="display:flex; justify-content:space-between; align-items:center;">
          <div style="display:flex; align-items:center; gap:8px;">
            <div class="collab-presence-title">
              <span>👥 组员协同在线感知:</span>
            </div>
            <div class="collab-member-pills" id="${editorId}-presence-pills"></div>
          </div>
          <div style="font-size:11px; font-weight:700; padding:2px 8px; border-radius:12px; border:1px solid #a7f3d0; background:#ecfdf5; color:#059669; white-space:nowrap;">
            🟢 高可靠实时同步已就绪
          </div>
        </div>

        <div class="word-page-scroll">
          <div class="word-page" id="${editorId}">
            ${initialHtml}
          </div>
        </div>
      </div>
    `;
  }

  function attachWordEditorEvents(container, editorId, isReadonly, onChangeCallback, onPresenceCallback) {
    const editor = container.querySelector(`#${editorId}`);
    if (!editor) return;

    if (isReadonly) {
      editor.setAttribute('contenteditable', 'false');
      editor.contentEditable = 'false';
      editor.style.userSelect = 'text';
      editor.style.cursor = 'default';
      editor.querySelectorAll('[contenteditable]').forEach(el => {
        el.setAttribute('contenteditable', 'false');
        el.contentEditable = 'false';
      });

      const blockEdit = (e) => {
        if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C' || e.key === 'a' || e.key === 'A')) {
          return true;
        }
        e.preventDefault();
        e.stopPropagation();
        return false;
      };
      editor.addEventListener('keydown', blockEdit, true);
      editor.addEventListener('keypress', blockEdit, true);
      editor.addEventListener('paste', blockEdit, true);
      editor.addEventListener('cut', blockEdit, true);
      editor.addEventListener('drop', blockEdit, true);
    }

    if (!isReadonly) {
      // 🛡️ 核心保障：阻止工具栏按钮点击时的默认失焦事件，完美锁定用户选区
      container.querySelectorAll('.word-toolbar button').forEach(btn => {
        btn.addEventListener('mousedown', (e) => {
          e.preventDefault();
        });
      });

      const exec = (cmd, val = null) => {
        document.execCommand(cmd, false, val);
        editor.focus();
        if (onChangeCallback) onChangeCallback(editor.innerHTML);
      };

      const btnUndo = container.querySelector(`#${editorId}-btn-undo`);
      if (btnUndo) btnUndo.addEventListener('click', () => exec('undo'));
      const btnRedo = container.querySelector(`#${editorId}-btn-redo`);
      if (btnRedo) btnRedo.addEventListener('click', () => exec('redo'));

      const btnFullscreen = container.querySelector(`#${editorId}-btn-fullscreen`);
      if (btnFullscreen) {
        btnFullscreen.addEventListener('click', () => {
          const wrapper = container.querySelector(`#${editorId}-wrapper`);
          if (wrapper) {
            wrapper.classList.toggle('fullscreen');
            btnFullscreen.innerText = wrapper.classList.contains('fullscreen') ? '✖ 退出全屏' : '🔲 全屏';
          }
        });
      }

      const selFormat = container.querySelector(`#${editorId}-sel-format`);
      if (selFormat) selFormat.addEventListener('change', (e) => exec('formatBlock', e.target.value));

      const selFont = container.querySelector(`#${editorId}-sel-font`);
      if (selFont) selFont.addEventListener('change', (e) => exec('fontName', e.target.value));

      const selSize = container.querySelector(`#${editorId}-sel-size`);
      if (selSize) selSize.addEventListener('change', (e) => exec('fontSize', e.target.value));

      const btnBold = container.querySelector(`#${editorId}-btn-bold`);
      if (btnBold) btnBold.addEventListener('click', () => exec('bold'));
      const btnItalic = container.querySelector(`#${editorId}-btn-italic`);
      if (btnItalic) btnItalic.addEventListener('click', () => exec('italic'));
      const btnUnderline = container.querySelector(`#${editorId}-btn-underline`);
      if (btnUnderline) btnUnderline.addEventListener('click', () => exec('underline'));
      const btnStrike = container.querySelector(`#${editorId}-btn-strike`);
      if (btnStrike) btnStrike.addEventListener('click', () => exec('strikeThrough'));
      const btnSup = container.querySelector(`#${editorId}-btn-sup`);
      if (btnSup) btnSup.addEventListener('click', () => exec('superscript'));
      const selLineHeight = container.querySelector(`#${editorId}-sel-line-height`);
      if (selLineHeight) {
        selLineHeight.addEventListener('change', (e) => {
          editor.style.lineHeight = e.target.value;
          // 🛡️ 同步写入每个段落，使行间距持久化到 innerHTML 并同步给协同用户
          editor.querySelectorAll('p, div, h1, h2, h3, h4, li, blockquote').forEach(el => {
            el.style.lineHeight = e.target.value;
          });
          if (onChangeCallback) onChangeCallback(editor.innerHTML);
        });
      }

      const selParaMargin = container.querySelector(`#${editorId}-sel-para-margin`);
      if (selParaMargin) {
        selParaMargin.addEventListener('change', (e) => {
          const val = e.target.value;
          editor.querySelectorAll('p').forEach(p => { p.style.marginBottom = val; });
          if (onChangeCallback) onChangeCallback(editor.innerHTML);
        });
      }

      const btnAlignLeft = container.querySelector(`#${editorId}-btn-align-left`);
      if (btnAlignLeft) btnAlignLeft.addEventListener('click', () => exec('justifyLeft'));
      const btnAlignCenter = container.querySelector(`#${editorId}-btn-align-center`);
      if (btnAlignCenter) btnAlignCenter.addEventListener('click', () => exec('justifyCenter'));
      const btnAlignRight = container.querySelector(`#${editorId}-btn-align-right`);
      if (btnAlignRight) btnAlignRight.addEventListener('click', () => exec('justifyRight'));
      const btnAlignJustify = container.querySelector(`#${editorId}-btn-align-justify`);
      if (btnAlignJustify) btnAlignJustify.addEventListener('click', () => exec('justifyFull'));

      const btnIndentInc = container.querySelector(`#${editorId}-btn-indent-inc`);
      if (btnIndentInc) btnIndentInc.addEventListener('click', () => exec('indent'));
      const btnIndentDec = container.querySelector(`#${editorId}-btn-indent-dec`);
      if (btnIndentDec) btnIndentDec.addEventListener('click', () => exec('outdent'));

      // 首行缩进自定义数值（支持小数，如 1.5, 2, 2.5 字符）
      const numIndent = container.querySelector(`#${editorId}-num-indent`);
      if (numIndent) {
        const applyIndent = () => {
          const rawVal = parseFloat(numIndent.value);
          const indentVal = isNaN(rawVal) ? '2em' : `${rawVal}em`;
          const selection = window.getSelection();
          let targetP = null;
          if (selection && selection.rangeCount > 0) {
            let node = selection.anchorNode ? (selection.anchorNode.nodeType === 1 ? selection.anchorNode : selection.anchorNode.parentElement) : null;
            while (node && node !== editor && !['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'BLOCKQUOTE'].includes(node.nodeName)) {
              node = node.parentElement;
            }
            if (node && node !== editor) targetP = node;
          }
          if (targetP) {
            targetP.style.textIndent = indentVal;
            targetP.style.marginLeft = '0';
          } else {
            editor.querySelectorAll('p, div').forEach(el => { el.style.textIndent = indentVal; });
          }
          if (onChangeCallback) onChangeCallback(editor.innerHTML);
        };
        numIndent.addEventListener('input', applyIndent);
        numIndent.addEventListener('change', applyIndent);
      }

      // 悬挂缩进自定义数值（支持小数，如 1.5, 2, 2.5 字符，填 0 即取消）
      const numHangingIndent = container.querySelector(`#${editorId}-num-hanging-indent`);
      const btnApplyHanging = container.querySelector(`#${editorId}-btn-apply-hanging`);
      const applyHanging = () => {
        const rawVal = parseFloat(numHangingIndent ? numHangingIndent.value : '2');
        const selection = window.getSelection();
        let targetEl = null;
        if (selection && selection.rangeCount > 0) {
          let node = selection.anchorNode ? (selection.anchorNode.nodeType === 1 ? selection.anchorNode : selection.anchorNode.parentElement) : null;
          while (node && node !== editor && !['P', 'DIV', 'LI', 'BLOCKQUOTE'].includes(node.nodeName)) {
            node = node.parentElement;
          }
          if (node && node !== editor) targetEl = node;
        }

        if (isNaN(rawVal) || rawVal <= 0) {
          if (targetEl) {
            targetEl.style.textIndent = '0';
            targetEl.style.marginLeft = '0';
          } else {
            editor.querySelectorAll('p, div').forEach(el => {
              el.style.textIndent = '0';
              el.style.marginLeft = '0';
            });
          }
        } else {
          const val = `${rawVal}em`;
          if (targetEl) {
            targetEl.style.textIndent = `-${val}`;
            targetEl.style.marginLeft = val;
            targetEl.style.paddingLeft = '0';
          } else {
            document.execCommand('formatBlock', false, 'p');
            const newSel = window.getSelection();
            let pNode = newSel.anchorNode ? (newSel.anchorNode.nodeType === 1 ? newSel.anchorNode : newSel.anchorNode.parentElement) : null;
            while (pNode && pNode !== editor && pNode.nodeName !== 'P') { pNode = pNode.parentElement; }
            if (pNode && pNode !== editor) {
              pNode.style.textIndent = `-${val}`;
              pNode.style.marginLeft = val;
            }
          }
        }
        if (onChangeCallback) onChangeCallback(editor.innerHTML);
      };

      if (btnApplyHanging) btnApplyHanging.addEventListener('click', applyHanging);
      if (numHangingIndent) {
        numHangingIndent.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyHanging(); });
        numHangingIndent.addEventListener('change', applyHanging);
      }

      const btnListUl = container.querySelector(`#${editorId}-btn-list-ul`);
      if (btnListUl) btnListUl.addEventListener('click', () => exec('insertUnorderedList'));
      const btnListOl = container.querySelector(`#${editorId}-btn-list-ol`);
      if (btnListOl) btnListOl.addEventListener('click', () => exec('insertOrderedList'));
      const btnHr = container.querySelector(`#${editorId}-btn-hr`);
      if (btnHr) btnHr.addEventListener('click', () => exec('insertHorizontalRule'));

      const colorText = container.querySelector(`#${editorId}-color-text`);
      if (colorText) colorText.addEventListener('input', (e) => exec('foreColor', e.target.value));

      const btnHiliteY = container.querySelector(`#${editorId}-btn-hilite-yellow`);
      if (btnHiliteY) btnHiliteY.addEventListener('click', () => exec('hiliteColor', '#fef08a'));
      const btnHiliteG = container.querySelector(`#${editorId}-btn-hilite-green`);
      if (btnHiliteG) btnHiliteG.addEventListener('click', () => exec('hiliteColor', '#bbf7d0'));

      const btnClearFormat = container.querySelector(`#${editorId}-btn-clear-format`);
      if (btnClearFormat) btnClearFormat.addEventListener('click', () => exec('removeFormat'));

      // 插件 1: 插入图表与学术图题 (纯净 HTTP 文件直传 uploads/，彻底杜绝 Base64 嵌入)
      const btnInsertImg = container.querySelector(`#${editorId}-btn-insert-image`);
      if (btnInsertImg) {
        btnInsertImg.addEventListener('click', () => {
          const fileInput = document.createElement('input');
          fileInput.type = 'file';
          fileInput.accept = 'image/*';
          fileInput.onchange = (e) => {
            if (e.target.files && e.target.files[0]) {
              const file = e.target.files[0];
              const currentUser = window.app?.authManager ? window.app.authManager.getCurrentUser() : null;
              const studentCode = currentUser ? (currentUser?.name || currentUser?.studentCode || currentUser?.id) : 'A';
              const caption = prompt('请输入学术图题说明 (例如: 图 1: 研究模型与变量关系架构图):', '图 1: 研究模型与变量关系架构图');

              const fd = new FormData();
              fd.append('file', file);
              fd.append('userId', studentCode);

              fetch('sync.php?action=upload_file', {
                method: 'POST',
                body: fd
              })
              .then(res => res.json())
              .then(resData => {
                const finalUrl = (resData && resData.url) ? resData.url : '';
                if (!finalUrl) {
                  alert('图片上传失败，请检查网络后重试');
                  return;
                }
                const figureHtml = `
                  <div class="academic-figure" contenteditable="false" style="text-align:center; margin:16px 0;">
                    <img src="${finalUrl}" alt="${escapeHtml(caption || '学术图表')}" style="max-width:85%; border:1px solid #cbd5e1; border-radius:6px; box-shadow:0 2px 8px rgba(0,0,0,0.1); cursor:pointer;" onclick="window.open(this.src, '_blank')">
                    <p class="figure-caption" style="font-weight:700; color:#334155; margin-top:6px; font-size:13px; text-indent:0;">${escapeHtml(caption || '图 1: 学术模型与实证架构图')}</p>
                  </div>
                  <p><br></p>
                `;
                exec('insertHTML', figureHtml);
              })
              .catch(err => {
                alert('图表上传网络异常，请重试');
              });
            }
          };
          fileInput.click();
        });
      }

      // 插件 2: 插入标准学术三线表 (优雅弹窗配置 + 可选 p 值备注 + 完美取消)
      const btnInsertTable = container.querySelector(`#${editorId}-btn-insert-table`);
      if (btnInsertTable) {
        btnInsertTable.addEventListener('click', () => {
          document.querySelectorAll('.table-config-modal-overlay').forEach(el => el.remove());
          const modal = document.createElement('div');
          modal.className = 'modal-overlay table-config-modal-overlay';
          modal.innerHTML = `
            <div class="teacher-modal-card" style="width:480px; background:#ffffff; color:#0f172a; border-radius:12px; box-shadow:0 20px 25px -5px rgba(0,0,0,0.2);">
              <div class="teacher-modal-header" style="background:linear-gradient(135deg, #2563eb, #1d4ed8); color:white; padding:12px 18px; border-radius:12px 12px 0 0; display:flex; justify-content:space-between; align-items:center;">
                <div style="font-weight:800; font-size:15px; display:flex; align-items:center; gap:6px;">📊 插入标准学术三线表</div>
                <button id="btn-close-table-modal" style="background:none; border:none; color:white; font-size:18px; cursor:pointer;">✕</button>
              </div>
              <div style="padding:18px; display:flex; flex-direction:column; gap:12px;">
                <div>
                  <label style="font-size:12.5px; font-weight:700; color:#334155;">表格标题 (表题):</label>
                  <input type="text" id="input-table-title" class="teacher-input" style="width:100%; margin-top:4px; padding:6px 10px; font-size:13px;" value="表 1: 研究变量与测量指标汇总表">
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                  <div>
                    <label style="font-size:12.5px; font-weight:700; color:#334155;">表格行数 (含表头):</label>
                    <input type="number" id="input-table-rows" class="teacher-input" style="width:100%; margin-top:4px; padding:6px 10px; font-size:13px;" value="4" min="2" max="20">
                  </div>
                  <div>
                    <label style="font-size:12.5px; font-weight:700; color:#334155;">表格列数:</label>
                    <input type="number" id="input-table-cols" class="teacher-input" style="width:100%; margin-top:4px; padding:6px 10px; font-size:13px;" value="4" min="1" max="10">
                  </div>
                </div>
                <div style="display:flex; align-items:center; gap:8px; background:#f8fafc; padding:10px 12px; border-radius:8px; border:1px solid #e2e8f0; margin-top:4px;">
                  <input type="checkbox" id="chk-table-pvalue" style="width:16px; height:16px; cursor:pointer;">
                  <label for="chk-table-pvalue" style="font-size:12.5px; color:#475569; cursor:pointer; user-select:none;">
                    附带显著性检验标注 (<i>注：*** p < .001, ** p < .01, * p < .05</i>)
                  </label>
                </div>
              </div>
              <div class="teacher-modal-footer" style="background:#f8fafc; padding:12px 18px; border-radius:0 0 12px 12px; display:flex; justify-content:flex-end; gap:10px; border-top:1px solid #e2e8f0;">
                <button class="modal-btn cancel" id="btn-cancel-table-insert" style="padding:6px 14px; font-size:13px;">取消</button>
                <button class="modal-btn submit task-theme" id="btn-confirm-table-insert" style="background:#2563eb; color:white; border:none; padding:6px 16px; border-radius:6px; font-size:13px; font-weight:700; cursor:pointer;">✅ 确认插入</button>
              </div>
            </div>
          `;
          document.body.appendChild(modal);

          const closeModal = () => { modal.remove(); if (typeof onEscKey !== 'undefined') document.removeEventListener('keydown', onEscKey); };
          modal.querySelector('#btn-close-table-modal').addEventListener('click', closeModal);
          modal.querySelector('#btn-cancel-table-insert').addEventListener('click', closeModal);

          modal.querySelector('#btn-confirm-table-insert').addEventListener('click', () => {
            const title = modal.querySelector('#input-table-title').value.trim() || '表 1: 研究变量汇总表';
            const rows = parseInt(modal.querySelector('#input-table-rows').value) || 4;
            const cols = parseInt(modal.querySelector('#input-table-cols').value) || 4;
            const hasPValue = modal.querySelector('#chk-table-pvalue').checked;
            closeModal();

            let tableHtml = `
              <p style="text-align:center; font-weight:700; color:#334155; font-size:13px; margin-bottom:4px; text-indent:0;">${escapeHtml(title)}</p>
              <table class="academic-table" style="width:100%; border-collapse:collapse; margin:10px 0; font-size:13px;">
                <thead style="border-top:2.5px solid #0f172a; border-bottom:1.5px solid #0f172a; background:#f8fafc;">
                  <tr>${Array.from({length: cols}, (_, i) => `<th style="padding:8px; text-align:center;">变量 ${i + 1}</th>`).join('')}</tr>
                </thead>
                <tbody style="border-bottom:2.5px solid #0f172a;">
                  ${Array.from({length: Math.max(1, rows - 1)}, () => `<tr>${Array.from({length: cols}, () => `<td style="padding:8px; border-bottom:1px solid #e2e8f0; text-align:center;">—</td>`).join('')}</tr>`).join('')}
                </tbody>
              </table>
              ${hasPValue ? `<p style="font-size:11.5px; color:#64748b; margin-top:2px; text-indent:0;"><i>注：*** p < .001, ** p < .01, * p < .05</i></p>` : ''}
              <p><br></p>
            `;
            exec('insertHTML', tableHtml);
          });
        });
      }

      // 插件 3: 插入公式符号
      const btnInsertSymbol = container.querySelector(`#${editorId}-btn-insert-symbol`);
      if (btnInsertSymbol) {
        btnInsertSymbol.addEventListener('click', () => {
          document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
          const modal = document.createElement('div');
          modal.className = 'modal-overlay';
          const symbols = [
            'α', 'β', 'γ', 'δ', 'ε', 'ζ', 'η', 'θ', 'λ', 'μ', 'ν', 'ξ', 'π', 'ρ', 'σ', 'τ', 'φ', 'χ', 'ψ', 'ω',
            'Δ', 'Σ', 'Ω', '∑', '∏', '∫', '±', '≠', '≤', '≥', '≈', '≡', '∝', '∞', '√', '∈', '⊂', '∪', '∩', '→',
            'M', 'SD', 'SE', 'F(1, 148)', 't(148)', 'r', 'R²', 'ΔR²', 'χ²', 'df', 'p < .05', 'p < .01', 'p < .001', 'η²',
            'Cronbach\'s α', 'AVE', 'CR', 'H₁', 'H₂', 'H₃', 'RQ₁', 'RQ₂', 'N = 150', '95% CI'
          ];
          modal.innerHTML = `
            <div class="teacher-modal-card" style="width:520px; background:#1e293b; color:#f8fafc; border:1px solid rgba(255,255,255,0.15);">
              <div class="teacher-modal-header" style="background:linear-gradient(135deg, #6366f1, #4f46e5); color:white; display:flex; justify-content:space-between; align-items:center; padding:12px 18px;">
                <div style="font-weight:800; font-size:15px;">🔣 高阶学术统计公式与符号库</div>
                <button class="modal-close-btn" id="btn-close-symbol-modal" style="background:none; border:none; color:white; font-size:18px; cursor:pointer;">✕</button>
              </div>
              <div style="padding:18px; display:grid; grid-template-columns:repeat(auto-fill, minmax(88px, 1fr)); gap:8px;">
                ${symbols.map(s => `
                  <button class="sym-pick-btn" data-sym="${s}" style="background:rgba(15,23,42,0.8); border:1px solid rgba(255,255,255,0.15); color:#38bdf8; font-size:13px; font-weight:700; padding:10px 4px; border-radius:6px; cursor:pointer; transition:all 0.15s;">
                    ${s}
                  </button>
                `).join('')}
              </div>
            </div>
          `;
          document.body.appendChild(modal);
          const closeModal = () => { modal.remove(); if (typeof onEscKey !== 'undefined') document.removeEventListener('keydown', onEscKey); };
          modal.querySelector('#btn-close-symbol-modal').addEventListener('click', closeModal);
          modal.querySelectorAll('.sym-pick-btn').forEach(btn => {
            btn.addEventListener('click', () => {
              exec('insertText', ' ' + btn.dataset.sym + ' ');
              closeModal();
            });
          });
        });
      }

      // 插件 4: 插入引用角标
      const btnInsertCit = container.querySelector(`#${editorId}-btn-insert-citation`);
      if (btnInsertCit) {
        btnInsertCit.addEventListener('click', () => {
          const num = prompt('请输入文献引用编号 (例如: 1 或 2, 3):', '1');
          if (num) {
            exec('insertHTML', `<sup class="citation-tag" style="color:#0284c7; font-weight:700; font-size:11px; vertical-align:super;">[${num}]</sup>&nbsp;`);
          }
        });
      }

      // 插件 5: 插入【摘要与关键词】前置卡片
      const btnInsertAbstract = container.querySelector(`#${editorId}-btn-insert-abstract`);
      if (btnInsertAbstract) {
        btnInsertAbstract.addEventListener('click', () => {
          const abstractHtml = `
            <div class="academic-abstract-box" contenteditable="true">
              <p class="abstract-title"><b>【摘 要】</b></p>
              <p style="text-indent:2em; font-size:13.5px; line-height:1.75; color:#334155;">（请在此处简要概括研究目的、研究方法、主要发现与核心结论，字数建议在 200-300 字...）</p>
              <p class="keywords-row"><b>【关键词】</b> 多智能体协同；共享调节 (SSRL)；学术写作；研究设计</p>
            </div>
            <p><br></p>
          `;
          exec('insertHTML', abstractHtml);
        });
      }

      // 插件 6: 插入参考文献条目模版
      const btnInsertRef = container.querySelector(`#${editorId}-btn-insert-ref-template`);
      if (btnInsertRef) {
        btnInsertRef.addEventListener('click', () => {
          const refHtml = `
            <p style="text-indent:-2em; margin-left:2em; font-size:13px; color:#334155;">[1] 作者名. 论文题名[J]. 期刊学报名称, 2026, 32(4): 102-115.</p>
            <p style="text-indent:-2em; margin-left:2em; font-size:13px; color:#334155;">[2] 作者名. 专著专著书名[M]. 北京: 高等教育出版社, 2025: 45-68.</p>
          `;
          exec('insertHTML', refHtml);
        });
      }

      // 插件 7: 查找与替换
      const btnFindReplace = container.querySelector(`#${editorId}-btn-find-replace`);
      const searchBar = container.querySelector(`#${editorId}-search-bar`);
      if (btnFindReplace && searchBar) {
        btnFindReplace.addEventListener('click', () => {
          searchBar.style.display = searchBar.style.display === 'none' ? 'flex' : 'none';
        });
        container.querySelector(`#${editorId}-btn-close-search`).addEventListener('click', () => {
          searchBar.style.display = 'none';
        });
        // 查找下一个
        const btnFindNext = container.querySelector(`#${editorId}-btn-find-next`);
        const findCountTip = container.querySelector(`#${editorId}-find-count-tip`);
        if (btnFindNext) {
          btnFindNext.addEventListener('click', () => {
            const searchVal = container.querySelector(`#${editorId}-search-input`).value;
            if (!searchVal) return;
            const text = editor.innerText || '';
            const matches = text.split(searchVal).length - 1;
            if (findCountTip) findCountTip.textContent = matches > 0 ? `共 ${matches} 处` : '未找到';
            // 使用浏览器原生查找高亮
            if (window.find) {
              window.find(searchVal, false, false, true);
            }
          });
        }
        // 替换当前（仅替换第一个匹配）
        container.querySelector(`#${editorId}-btn-do-replace`).addEventListener('click', () => {
          const searchVal = container.querySelector(`#${editorId}-search-input`).value;
          const replaceVal = container.querySelector(`#${editorId}-replace-input`).value;
          if (!searchVal) { alert('请输入要查找的词！'); return; }
          const html = editor.innerHTML;
          const idx = html.indexOf(searchVal);
          if (idx === -1) { alert('未找到匹配内容'); return; }
          const newHtml = html.substring(0, idx) + replaceVal + html.substring(idx + searchVal.length);
          editor.innerHTML = newHtml;
          if (onChangeCallback) onChangeCallback(newHtml);
        });
        // 全部替换
        const btnReplaceAll = container.querySelector(`#${editorId}-btn-do-replace-all`);
        if (btnReplaceAll) {
          btnReplaceAll.addEventListener('click', () => {
            const searchVal = container.querySelector(`#${editorId}-search-input`).value;
            const replaceVal = container.querySelector(`#${editorId}-replace-input`).value;
            if (!searchVal) { alert('请输入要查找的词！'); return; }
            const html = editor.innerHTML;
            const newHtml = html.split(searchVal).join(replaceVal);
            editor.innerHTML = newHtml;
            if (onChangeCallback) onChangeCallback(newHtml);
            alert(`已完成对 "${searchVal}" 的批量替换！`);
          });
        }
      }

      if (!quillInstance) {
        // 仅在未载入 Quill 的原生 DOM 模式下作为备用输入监听
        let debounceTimer = null;
        let isComposing = false;

        editor.addEventListener('compositionstart', () => { isComposing = true; });
        editor.addEventListener('compositionend', () => {
          isComposing = false;
          if (onChangeCallback) onChangeCallback(editor.innerHTML);
        });
        editor.addEventListener('input', () => {
          window._jizhi_last_keypress_time = Date.now();
          if (isComposing) return;
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            if (!isComposing && onChangeCallback) {
              onChangeCallback(editor.innerHTML);
            }
          }, 300);
        });
      } else {
        // 🚀 Quill 模式：极速记录按键时间戳，供短轮询精确对齐
        editor.addEventListener('keydown', () => {
          window._jizhi_last_keypress_time = Date.now();
        }, { passive: true });
      }
    }
  }

  function renderPresencePills(editorId, state) {
    const pillsContainer = document.getElementById(`${editorId}-presence-pills`);
    if (!pillsContainer) return;

    // 🛡️ 稳健自动水合：若 state.members 为空，自动从 authManager 实时加载本组成员
    let membersObj = state.members;
    if (!membersObj || (Array.isArray(membersObj) ? membersObj.length === 0 : Object.keys(membersObj).length === 0)) {
      if (window.app && window.app.authManager) {
        const activeGroup = window.app.authManager.getStudentActiveGroup(window.app.authManager.getCurrentUser(), state.activeStudentClassId);
        const gid = activeGroup?.id || state.activeMonitorGroupId || state.activeGroupId || null;
        membersObj = window.app.authManager.getGroupMembersForWorkspace(gid);
        state.members = membersObj;
      }
    }
    const membersList = Array.isArray(membersObj) ? membersObj : Object.values(membersObj || {});
    const currUserObj = (window.app && window.app.authManager) ? window.app.authManager.getCurrentUser() : null;
    const currentUid = currUserObj ? String(currUserObj.id || currUserObj.studentCode || '').trim() : (state.currentUser || '');
    const presence = state.presence || {};
    const serverNow = (state && state.serverTimestamp) ? Number(state.serverTimestamp) : Date.now();
    const allUsers = (window.app && window.app.authManager) ? window.app.authManager.getUsers() : [];

    const newHtml = membersList.map(m => {
      const uid = String(m.id || m.studentCode || m.userId || '').trim();
      const candidateKeys = [
        String(m.id || '').trim(),
        String(m.studentCode || '').trim(),
        String(m.username || '').trim(),
        String(m.name || '').trim()
      ].filter(Boolean);

      const isSelf = (currUserObj && (
        (currUserObj.id && (m.id === currUserObj.id || uid === String(currUserObj.id))) ||
        (currUserObj.studentCode && (m.studentCode === currUserObj.studentCode || uid === String(currUserObj.studentCode))) ||
        (currUserObj.username && (m.username === currUserObj.username || uid === String(currUserObj.username))) ||
        (currUserObj.name && m.name === currUserObj.name)
      )) || (uid && uid === currentUid);

      let isOnline = isSelf;
      if (!isOnline) {
        for (const k of candidateKeys) {
          const p = presence[k];
          if (p) {
            const pTime = Number(p.lastSeen || p.updatedAt || p.timestamp || 0);
            if (pTime > 0 && Math.abs(serverNow - pTime) <= 25000) {
              isOnline = true;
              break;
            }
          }
        }
      }

      const sectionText = isSelf ? ' (我)' : (isOnline ? ' (在线)' : ' (离线)');
      const color = m.color || '#2563eb';
      let displayName = m.name || m.studentCode || uid;
      const matchedUser = allUsers.find(u => (u.id && u.id === uid) || (u.studentCode && u.studentCode === uid) || (u.username && u.username === uid));
      if (matchedUser && matchedUser.name) displayName = matchedUser.name;

      return `
        <span class="collab-presence-pill ${isOnline ? 'active' : ''}" style="${isOnline ? `border-color:${color}; color:${color}; background:#ffffff; font-weight:700;` : 'color:#94a3b8; background:#f1f5f9;'}">
          <span class="collab-presence-dot" style="background:${isOnline ? color : '#cbd5e1'};"></span>
          ${m.avatar || '👨‍🎓'} ${displayName}<span style="font-weight:normal; font-size:10px; color:${isOnline ? '#059669' : '#94a3b8'};">${sectionText}</span>
        </span>
      `;
    }).join('');

    if (pillsContainer.innerHTML !== newHtml) {
      pillsContainer.innerHTML = newHtml;
    }
  }

  function renderRemoteCursors(editorId, state) {
    renderPresencePills(editorId, state);
    const editor = document.getElementById(editorId);
    if (!editor) return;

    // 🛡️ 纯净化图层：彻底清除富文本内部的任何历史残留光标 DOM
    editor.querySelectorAll('.remote-cursor-widget').forEach(el => el.remove());
  }

  function renderStage1Canvas(canvas, state, handlers) {
    if (!canvas) return;
    // 🛡️ 焦点保护：记录当前正在打字的输入框与光标位置，防止短轮询重绘导致失焦与吞字
    const activeEl = canvas.querySelector('input:focus, textarea:focus');
    const activeKey = activeEl ? (activeEl.id || activeEl.dataset.key || activeEl.dataset.mkey) : null;
    const activeVal = activeEl ? activeEl.value : null;
    const activeCursor = activeEl ? activeEl.selectionStart : null;

    const s1 = state.stage1;
    const currentUser = state.currentUser;
    const currUserObj = (window.app && window.app.authManager) ? window.app.authManager.getCurrentUser() : null;
    const allUsers = (window.app && window.app.authManager) ? window.app.authManager.getUsers() : [];
    const membersList = Array.isArray(state.members) ? state.members : Object.values(state.members || {});
    const totalMembersCount = membersList.length;

    if (!s1.contract.taskAssignments) s1.contract.taskAssignments = {};
    if (!s1.contract.timeAllocations) s1.contract.timeAllocations = {};

    const allTasks = (window.app && window.app.authManager) ? window.app.authManager.getTasks() : [];
    const currentTask = allTasks.find(t => t.id === state.activeTaskId);
    const isTaskDeadlineExpired = isTaskExpired(currentTask);
    const taskDurMin = (currentTask && currentTask.duration) ? Number(currentTask.duration) : 150;
    const isLargeTask = currentTask && (currentTask.scale === 'large' || currentTask.type === 'large' || taskDurMin > 150 || (currentTask.targetWordCount && Number(currentTask.targetWordCount) >= 6000));

    // 🛡️ 稳健解析当前用户的真实姓名与标识
    let currentUserName = currUserObj?.name || '';
    if (!currentUserName && currentUser) {
      const matchedM = membersList.find(m => isSameUser(m, currentUser) || m.id === currentUser || m.studentCode === currentUser || m.name === currentUser);
      if (matchedM && matchedM.name) currentUserName = matchedM.name;
      else {
        const matchedU = allUsers.find(u => isSameUser(u, currentUser) || u.id === currentUser || u.studentCode === currentUser || u.name === currentUser);
        if (matchedU && matchedU.name) currentUserName = matchedU.name;
      }
    }
    if (!currentUserName) currentUserName = (typeof currentUser === 'string' && currentUser) ? currentUser : '组员';

    // 🛡️ 稳健的多标识判定辅助函数（零破坏底层存储结构，仅在名单比对时精准去重）
    const isMemberDone = (map, m) => {
      if (!map || !m) return false;
      return isUserInMap(map, m) || !!(map[m.id] || map[m.studentCode] || map[m.username] || (m.name && map[m.name]));
    };

    const confirmedMembers = s1.contract.confirmedMembers || {};
    const confirmedCount = membersList.filter(m => isMemberDone(confirmedMembers, m)).length;
    const userHasConfirmed = isMemberDone(confirmedMembers, currUserObj || { id: currentUser, studentCode: currUserObj?.studentCode, username: currUserObj?.username, name: currentUserName });

    // 🛡️ 真正的公约生效锁定判定：服务端公约已标记生效、或全员已签、或小组已进入阶段二/三、或全盘已提交/任务已截止
    const isAllConfirmed = (totalMembersCount > 0 && confirmedCount >= totalMembersCount);
    const isContractLocked = !!(s1.contract && s1.contract.isConfirmed) || isAllConfirmed || (state.groupMaxStage === 'stage2' || state.groupMaxStage === 'stage3') || state.isFinalSubmitted || isTaskDeadlineExpired;
    if (s1.contract && isAllConfirmed) s1.contract.isConfirmed = true;

    const userHasVoted = isMemberDone(s1.hasVoted, currUserObj || { id: currentUser, studentCode: currUserObj?.studentCode, username: currUserObj?.username, name: currentUserName });
    const userVotedProposalId = s1.votes ? (getUserFromMap(s1.votes, currUserObj) || s1.votes[currentUser] || (currUserObj && (s1.votes[currUserObj.id] || s1.votes[currUserObj.studentCode] || (currUserObj.name && s1.votes[currUserObj.name])))) : null;

    // 严格统计全组实际已投票人数
    const totalVotesCast = membersList.filter(m => isMemberDone(s1.hasVoted, m)).length;
    const isVotingComplete = (totalMembersCount > 0 && totalVotesCast >= totalMembersCount);

    // 严密判断当前登录学生是否已提交提案 (支持 id, studentCode, username, 姓名多重比对)
    const myKeys = new Set([...getUserAllKeys(currUserObj), ...getUserAllKeys(currentUser), currentUserName, currentUser].filter(Boolean));
    const hasSubmittedMyProposal = s1.proposals.some(p => {
      if (!p) return false;
      if (myKeys.has(p.author) || myKeys.has(p.authorName) || myKeys.has(p.authorId)) return true;
      if (currUserObj && (isSameUser(p.author, currUserObj) || isSameUser(p.authorName, currUserObj) || (p.authorName && p.authorName === currentUserName))) return true;
      return false;
    });

    canvas.innerHTML = `
      ${isTaskDeadlineExpired ? `
        <div style="background:#fef2f2; border:1.5px solid #fca5a5; border-radius:8px; padding:6px 14px; margin-bottom:12px; font-size:12.5px; color:#991b1b; font-weight:600; display:flex; justify-content:space-between; align-items:center; gap:12px; box-shadow:0 2px 6px rgba(239,68,68,0.08); height:38px; box-sizing:border-box;">
          <div style="display:flex; align-items:center; gap:8px; min-width:0; flex:1; overflow:hidden; white-space:nowrap; text-overflow:ellipsis;">
            <span style="font-size:15px; flex-shrink:0;">🔒</span>
            <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"><b>任务已截止锁定：</b> 本任务已于 <b>${currentTask?.deadline || '截止时间'}</b> 截止，阶段一【学术拍卖会】已自动转为<b>【只读查阅模式】</b>。如需修改请联系教师延长时间。</span>
          </div>
          <span style="font-size:11.5px; color:#ffffff; background:#dc2626; padding:2px 8px; border-radius:4px; font-weight:800; flex-shrink:0; letter-spacing:0.5px;">已截止</span>
        </div>
      ` : (isContractLocked ? `
        <div style="background:#ecfdf5; border:1px solid #a7f3d0; border-radius:8px; padding:6px 14px; margin-bottom:12px; font-size:12.5px; color:#059669; font-weight:700; display:flex; align-items:center; justify-content:space-between; height:38px; box-sizing:border-box;">
          <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">🔒 阶段一【学术拍卖会】合作公约已全员签署生效并锁定 (可随时查阅)</span>
          <span style="font-size:11.5px; color:#065f46; background:#ffffff; border:1px solid #a7f3d0; padding:2px 8px; border-radius:4px; flex-shrink:0;">全组 ${confirmedCount}/${totalMembersCount} 人已签署</span>
        </div>
      ` : '')}

      <div class="card">
        <div class="card-title" style="display:flex; justify-content:space-between; align-items:center;">
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="font-weight:800; font-size:15px; color:#0f172a;">💡 竞拍提案池 ${isContractLocked ? '<span style="font-size:11px; color:#059669;">🔒 已锁定</span>' : ''}</span>
            <span id="proposal-vote-progress-badge" style="font-size:12px; color:#2563eb; background:#eff6ff; padding:2px 8px; border-radius:10px; border:1px solid #bfdbfe;">
              ${isVotingComplete ? `🎉 投票已完成 (共投出 ${totalVotesCast} 票)` : `📊 投票进度: <b>${totalVotesCast}/${totalMembersCount} 人已投票</b> ${userHasVoted ? '<span style="color:#059669; font-weight:700; margin-left:4px;">(您已投票，等待其他组员)</span>' : ''}`}
            </span>
          </div>
          ${!isContractLocked ? `
            <button id="btn-open-submit-proposal" style="background:linear-gradient(135deg, #2563eb, #1d4ed8); border:none; color:white; padding:7px 16px; border-radius:8px; font-weight:700; font-size:13px; cursor:pointer; box-shadow:0 3px 10px rgba(37,99,235,0.3);">
              ${hasSubmittedMyProposal ? '✏️ 修改我的选题' : '+ 提交我的选题'}
            </button>
          ` : ''}
        </div>

        <div id="proposals-wrapper-container">
          ${s1.proposals.length === 0 ? `
            <div style="text-align:center; padding:36px; background:#f8fafc; border-radius:10px; border:2px dashed #cbd5e1; margin-top:10px;">
              <div style="font-size:32px; margin-bottom:8px;">💡</div>
              <div style="font-size:15px; font-weight:800; color:#0f172a;">目前暂无小组成员提交的选题</div>
              <div style="font-size:12.5px; color:#64748b; margin-top:4px;">请点击右上角【+ 提交我的选题】录入选题名称。</div>
            </div>
          ` : `
            <div class="proposals-grid" style="margin-top:12px;">
              ${s1.proposals.map(p => {
                // 动态聚合计算该提案的真实得票数
                const proposalVotesCount = membersList.filter(m => {
                  if (!s1.votes) return false;
                  const v = getUserFromMap(s1.votes, m) || s1.votes[m.studentCode] || s1.votes[m.id] || s1.votes[m.username] || (m.name && s1.votes[m.name]);
                  return v === p.id;
                }).length;

                const isThisVoted = userVotedProposalId === p.id;
                let btnText = '🗳️ 投票支持';
                let btnClass = 'vote-btn';
                let btnDisabled = false;
                if (isContractLocked) {
                  btnText = isThisVoted ? '🔒 已确立选题' : '🔒 公约已锁定';
                  btnClass = 'vote-btn disabled';
                  btnDisabled = true;
                } else if (isVotingComplete) {
                  if (isThisVoted) { btnText = '✅ 我的投票 (全员已完成)'; btnClass = 'vote-btn active locked'; }
                  else { btnText = '未选择'; btnClass = 'vote-btn disabled'; }
                  btnDisabled = true;
                } else if (userHasVoted) {
                  if (isThisVoted) { btnText = '✅ 我已支持此提案'; btnClass = 'vote-btn active locked'; }
                  else { btnText = '未选择'; btnClass = 'vote-btn disabled'; }
                  btnDisabled = true;
                }
                let authorName = (p.authorName && p.authorName !== '组员') ? p.authorName : null;
                if (!authorName) {
                  const authorUser = allUsers.find(u => isSameUser(u, p.author) || isSameUser(u, p.authorName) || u.id === p.author || u.studentCode === p.author || u.username === p.author || u.name === p.author || u.name === p.authorName);
                  if (authorUser && authorUser.name) authorName = authorUser.name;
                }
                if (!authorName) {
                  const authorMem = membersList.find(m => isSameUser(m, p.author) || isSameUser(m, p.authorName) || m.id === p.author || m.studentCode === p.author || m.name === p.author);
                  if (authorMem && authorMem.name) authorName = authorMem.name;
                }
                if (!authorName) authorName = p.authorName || p.author || '组员';
                return `
                  <div class="proposal-card ${isThisVoted ? 'voted' : ''}" style="display:flex; flex-direction:column; position:relative;">
                    <div class="proposal-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                      <div class="proposal-title" style="font-weight:800; font-size:14px; color:#0f172a;">💡 ${escapeHtml(p.title)}</div>
                      <span style="font-size:11.5px; background:${proposalVotesCount > 0 ? '#eff6ff' : '#f8fafc'}; color:${proposalVotesCount > 0 ? '#2563eb' : '#64748b'}; border:1px solid ${proposalVotesCount > 0 ? '#bfdbfe' : '#e2e8f0'}; padding:2px 8px; border-radius:10px; font-weight:700; flex-shrink:0;">
                        得票: <b>${proposalVotesCount}</b> 票
                      </span>
                    </div>
                    <div style="font-size:12px; color:#64748b; margin-bottom:10px;">提出人: <b style="color:#0f172a;">${escapeHtml(authorName)}</b></div>
                    <button class="${btnClass}" data-id="${p.id}" ${btnDisabled ? 'disabled' : ''} style="width:100%; margin-top:auto;">${btnText}</button>
                  </div>
                `;
              }).join('')}
            </div>
          `}
        </div>
      </div>

      <!-- 一整个统一的合作学术合约公约框架卡片 (蓝白层次风) -->
      <div class="contract-card" style="margin-top:16px; border:2px solid #3b82f6; border-radius:16px; background:#ffffff; padding:24px; box-shadow:0 10px 30px rgba(37,99,235,0.08); width:100%; box-sizing:border-box;">

        <div style="text-align:center; margin-bottom:20px; border-bottom:1px solid #e2e8f0; padding-bottom:16px;">
          <div style="font-size:20px; font-weight:800; color:#1e3a8a;">
            📜 团队协同合作学术合约
          </div>
          <div style="font-size:12.5px; color:#64748b; margin-top:4px;">
            ${isContractLocked ? `<span style="color:#059669; font-weight:700;">🔒 全员 ${confirmedCount}/${totalMembersCount} 人完成签署 · 归档生效中</span>` : '小组成员在研讨区商讨后，可按步骤一键提炼或自由微调各项内容，全员确认后签署生效'}
          </div>
          ${!isContractLocked ? `
            <div id="stage1-contract-action-bar-mount" style="margin-top:12px; display:flex; justify-content:center;">
              ${(() => {
                const confs = state.stepConfirmations || {};
                const isDoneHelper = (map) => {
                  if (!map) return 0;
                  return membersList.filter(m => map[m.id] || map[m.studentCode] || map[m.username] || (m.name && map[m.name])).length;
                };
                const isMyDoneHelper = (map) => {
                  if (!map) return false;
                  return !!(map[currUserCode] || (currUser && (map[currUser.id] || map[currUser.studentCode] || map[currUser.username] || map[currUser.name])));
                };

                if (s1.contractStep === 'completed' || s1.contract?.isDraftGenerated) {
                  return `
                    <div style="background:#f0fdf4; border:1.5px solid #86efac; color:#15803d; padding:7px 22px; border-radius:20px; font-weight:800; font-size:13px; display:inline-flex; align-items:center; gap:6px; box-shadow:0 2px 8px rgba(34,197,94,0.15);">
                      ✅ 公约草案已全部提炼生成（全组可微调修改，并在下方签署确认）
                    </div>
                  `;
                } else if (s1.contractStep === 'tasks') {
                  const count = isDoneHelper(confs.s1_tasks);
                  const isMe = isMyDoneHelper(confs.s1_tasks);
                  const isFull = count >= totalMembersCount && totalMembersCount > 0;
                  return `
                    <button id="btn-extract-tasks" style="background:${isFull ? 'linear-gradient(135deg, #d97706, #b45309)' : (isMe ? 'linear-gradient(135deg, #059669, #047857)' : 'linear-gradient(135deg, #7c3aed, #6d28d9)')}; border:none; color:white; padding:9px 24px; border-radius:20px; font-weight:800; font-size:13.5px; cursor:${isFull ? 'wait' : 'pointer'}; display:inline-flex; align-items:center; gap:6px; box-shadow:0 4px 14px rgba(124,58,237,0.3); transition:all 0.2s;" ${isFull ? 'disabled' : ''}>
                      ${isFull ? `⏳ 全员已确认 (${count}/${totalMembersCount}) · 正在生成公约草案...` : (isMe ? `✅ 您已确认提炼分工 (${count}/${totalMembersCount} 等待其他组员)` : `👥 研讨差不多了？一键提炼【任务分工】 (${count}/${totalMembersCount})`)}
                    </button>
                  `;
                } else if (s1.contractStep === 'time') {
                  const count = isDoneHelper(confs.s1_time);
                  const isMe = isMyDoneHelper(confs.s1_time);
                  const isFull = count >= totalMembersCount && totalMembersCount > 0;
                  return `
                    <button id="btn-extract-time" style="background:${isFull ? 'linear-gradient(135deg, #d97706, #b45309)' : (isMe ? 'linear-gradient(135deg, #059669, #047857)' : 'linear-gradient(135deg, #0284c7, #0369a1)')}; border:none; color:white; padding:9px 24px; border-radius:20px; font-weight:800; font-size:13.5px; cursor:${isFull ? 'wait' : 'pointer'}; display:inline-flex; align-items:center; gap:6px; box-shadow:0 4px 14px rgba(2,132,199,0.3); transition:all 0.2s;" ${isFull ? 'disabled' : ''}>
                      ${isFull ? `⏳ 全员已确认 (${count}/${totalMembersCount}) · 正在提炼时间分配...` : (isMe ? `✅ 您已确认提炼时间 (${count}/${totalMembersCount} 等待其他组员)` : `⏱️ 时间讨论差不多了？一键提炼【时间分配】 (${count}/${totalMembersCount})`)}
                    </button>
                  `;
                } else {
                  const count = isDoneHelper(confs.s1_topic);
                  const isMe = isMyDoneHelper(confs.s1_topic);
                  const isFull = count >= totalMembersCount && totalMembersCount > 0;
                  if (!isVotingComplete) {
                    return `
                      <button id="btn-extract-topic" class="locked-pending-btn" style="background:#f1f5f9; border:1px solid #cbd5e1; color:#94a3b8; padding:9px 24px; border-radius:20px; font-weight:800; font-size:13.5px; cursor:not-allowed; display:inline-flex; align-items:center; gap:6px; box-shadow:none;">
                        🔒 请先完成投票推选 (${totalVotesCast}/${totalMembersCount} 人已投)
                      </button>
                    `;
                  }
                  return `
                    <button id="btn-extract-topic" style="background:${isFull ? 'linear-gradient(135deg, #d97706, #b45309)' : (isMe ? 'linear-gradient(135deg, #059669, #047857)' : 'linear-gradient(135deg, #2563eb, #1d4ed8)')}; border:none; color:white; padding:9px 24px; border-radius:20px; font-weight:800; font-size:13.5px; cursor:${isFull ? 'wait' : 'pointer'}; display:inline-flex; align-items:center; gap:6px; box-shadow:0 4px 14px rgba(37,99,235,0.3); transition:all 0.2s;" ${isFull ? 'disabled' : ''}>
                      ${isFull ? `⏳ 全员已确认 (${count}/${totalMembersCount}) · 正在提炼【主题与研究方案】...` : (isMe ? `✅ 您已确认提炼主题与方案 (${count}/${totalMembersCount} 等待其他组员)` : `💡 讨论差不多了？一键提炼【主题与研究方案】 (${count}/${totalMembersCount})`)}
                    </button>
                  `;
                }
              })()}
            </div>
          ` : ''}
        </div>

        <!-- 槽位 1：论文主题 / 题目 -->
        <div style="display:flex; flex-direction:column; gap:8px; width:100%; margin-bottom:14px; background:#eff6ff; padding:16px; border-radius:12px; border:1px solid #bfdbfe; box-sizing:border-box;">
          <label style="font-size:14px; font-weight:800; color:#1e40af; display:flex; align-items:center; gap:6px;">
            📌 【槽位 1】确认论文主题 / 题目:
          </label>
          <input type="text" id="contract-topic-input" class="large-contract-input" data-lock-key="topic_title" value="${s1.mergedTitle || s1.contract?.topic || ''}" placeholder="${s1.mergedTitle ? '在此处输入论文规范题名...' : '投票有分歧或待定，请在讨论区商定后点击上方一键提炼生成...'}" ${isContractLocked ? 'disabled readonly style="opacity:0.8; cursor:not-allowed;"' : ''} style="width:100%; box-sizing:border-box; background:#ffffff; color:#0f172a; border:1px solid #cbd5e1; border-radius:8px; padding:12px 14px; font-size:14.5px; font-weight:700; font-family:sans-serif;">
        </div>

        <!-- 槽位 2：研究方案概述 (容纳具体情境、案例、聚焦点与方法) -->
        <div style="display:flex; flex-direction:column; gap:8px; width:100%; margin-bottom:20px; background:#f0f9ff; padding:16px; border-radius:12px; border:1px solid #bae6fd; box-sizing:border-box;">
          <label style="font-size:14px; font-weight:800; color:#0369a1; display:flex; align-items:center; gap:6px;">
            📝 【槽位 2】研究方案概述 (具体情境、案例、聚焦点与方法):
          </label>
          <textarea id="contract-overview-input" class="contract-overview-textarea" data-lock-key="research_overview" placeholder="请在讨论区围绕具体情境/案例、核心聚焦问题与拟采用方法展开研讨，点击上方按钮一键提炼生成（生成后可自由微调）..." ${isContractLocked ? 'disabled readonly style="opacity:0.8; cursor:not-allowed;"' : ''} style="width:100%; min-height:88px; box-sizing:border-box; background:#ffffff; color:#0f172a; border:1px solid #cbd5e1; border-radius:8px; padding:10px 12px; font-size:13px; line-height:1.6; font-family:sans-serif; resize:vertical;">${s1.contract?.overview || s1.researchOverview || ''}</textarea>
        </div>

        <div style="display:flex; flex-direction:column; gap:16px; width:100%;">
          <!-- 6大研究设计方案模块与时间规划 -->
          <div style="background:#f8fafc; padding:18px; border-radius:12px; border:1px solid #bfdbfe; width:100%; box-sizing:border-box;">
            <div style="font-weight:800; color:#1e40af; margin-bottom:14px; font-size:14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
              <span>📚 研究方案核心模块与时间规划 (6 大模块起草):</span>
              <span style="font-size:12px; background:#eff6ff; color:#1d4ed8; padding:2px 10px; border-radius:12px; border:1px solid #bfdbfe; font-weight:800;">⏱️ ${isLargeTask ? '大任务 (8k~1w字 · 总规划时长 300 分钟)' : '中任务 (3k~5k字 · 总规划时长 150 分钟)'}</span>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
              <!-- 模块 1 -->
              <div style="background:#ffffff; border:1px solid #e2e8f0; border-left:3.5px solid #2563eb; border-radius:8px; padding:12px 14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap;">
                <span style="font-weight:800; color:#1e40af; font-size:13.5px;">一、研究背景与意义</span>
                <label style="font-size:12px; color:#475569; display:flex; align-items:center; gap:4px;">
                  用时: <input type="number" class="contract-time-input" data-key="background" data-lock-key="time_background" value="${s1.contract.timeAllocations.background !== undefined ? s1.contract.timeAllocations.background : 25}" ${isContractLocked ? 'disabled readonly style="opacity:0.8; cursor:not-allowed;"' : ''} style="width:48px; padding:3px 4px; border:1px solid #cbd5e1; border-radius:4px; text-align:center; font-weight:700;"> 分钟
                </label>
              </div>

              <!-- 模块 2 -->
              <div style="background:#ffffff; border:1px solid #e2e8f0; border-left:3.5px solid #0284c7; border-radius:8px; padding:12px 14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap;">
                <span style="font-weight:800; color:#0369a1; font-size:13.5px;">二、文献综述</span>
                <label style="font-size:12px; color:#475569; display:flex; align-items:center; gap:4px;">
                  用时: <input type="number" class="contract-time-input" data-key="literature" data-lock-key="time_literature" value="${s1.contract.timeAllocations.literature !== undefined ? s1.contract.timeAllocations.literature : 30}" ${isContractLocked ? 'disabled readonly style="opacity:0.8; cursor:not-allowed;"' : ''} style="width:48px; padding:3px 4px; border:1px solid #cbd5e1; border-radius:4px; text-align:center; font-weight:700;"> 分钟
                </label>
              </div>

              <!-- 模块 3 -->
              <div style="background:#ffffff; border:1px solid #e2e8f0; border-left:3.5px solid #059669; border-radius:8px; padding:12px 14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap;">
                <span style="font-weight:800; color:#065f46; font-size:13.5px;">三、研究问题与假设</span>
                <label style="font-size:12px; color:#475569; display:flex; align-items:center; gap:4px;">
                  用时: <input type="number" class="contract-time-input" data-key="questions" data-lock-key="time_questions" value="${s1.contract.timeAllocations.questions !== undefined ? s1.contract.timeAllocations.questions : 25}" ${isContractLocked ? 'disabled readonly style="opacity:0.8; cursor:not-allowed;"' : ''} style="width:48px; padding:3px 4px; border:1px solid #cbd5e1; border-radius:4px; text-align:center; font-weight:700;"> 分钟
                </label>
              </div>

              <!-- 模块 4 -->
              <div style="background:#ffffff; border:1px solid #e2e8f0; border-left:3.5px solid #7c3aed; border-radius:8px; padding:12px 14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap;">
                <span style="font-weight:800; color:#6d28d9; font-size:13.5px;">四、研究设计与方法</span>
                <label style="font-size:12px; color:#475569; display:flex; align-items:center; gap:4px;">
                  用时: <input type="number" class="contract-time-input" data-key="method" data-lock-key="time_method" value="${s1.contract.timeAllocations.method !== undefined ? s1.contract.timeAllocations.method : 40}" ${isContractLocked ? 'disabled readonly style="opacity:0.8; cursor:not-allowed;"' : ''} style="width:48px; padding:3px 4px; border:1px solid #cbd5e1; border-radius:4px; text-align:center; font-weight:700;"> 分钟
                </label>
              </div>

              <!-- 模块 5 -->
              <div style="background:#ffffff; border:1px solid #e2e8f0; border-left:3.5px solid #d97706; border-radius:8px; padding:12px 14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap;">
                <span style="font-weight:800; color:#b45309; font-size:13.5px;">五、研究设计的不足与反思</span>
                <label style="font-size:12px; color:#475569; display:flex; align-items:center; gap:4px;">
                  用时: <input type="number" class="contract-time-input" data-key="reflection" data-lock-key="time_reflection" value="${s1.contract.timeAllocations.reflection !== undefined ? s1.contract.timeAllocations.reflection : 20}" ${isContractLocked ? 'disabled readonly style="opacity:0.8; cursor:not-allowed;"' : ''} style="width:48px; padding:3px 4px; border:1px solid #cbd5e1; border-radius:4px; text-align:center; font-weight:700;"> 分钟
                </label>
              </div>

              <!-- 模块 6 -->
              <div style="background:#ffffff; border:1px solid #e2e8f0; border-left:3.5px solid #475569; border-radius:8px; padding:12px 14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap;">
                <span style="font-weight:800; color:#334155; font-size:13.5px;">六、参考文献</span>
                <label style="font-size:12px; color:#475569; display:flex; align-items:center; gap:4px;">
                  用时: <input type="number" class="contract-time-input" data-key="references" data-lock-key="time_references" value="${s1.contract.timeAllocations.references !== undefined ? s1.contract.timeAllocations.references : 10}" ${isContractLocked ? 'disabled readonly style="opacity:0.8; cursor:not-allowed;"' : ''} style="width:48px; padding:3px 4px; border:1px solid #cbd5e1; border-radius:4px; text-align:center; font-weight:700;"> 分钟
                </label>
              </div>
            </div>
          </div>

          <div style="background:#f8fafc; padding:16px; border-radius:12px; border:1px solid #e2e8f0; width:100%; box-sizing:border-box;">
            <div style="font-weight:700; color:#1e40af; margin-bottom:12px; font-size:14px; display:flex; justify-content:space-between; align-items:center;">
              <span>👥 本组小组成员分工 (共 ${totalMembersCount} 人):</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:10px; width:100%;">
              ${membersList.map((m, idx) => {
                const mKey = m.id || m.studentCode || m.username || m.name || (`mem_${idx}`);
                const taskVal = (s1.contract.taskAssignments && (
                  s1.contract.taskAssignments[mKey] !== undefined ? s1.contract.taskAssignments[mKey] :
                  (m.id && s1.contract.taskAssignments[m.id] !== undefined ? s1.contract.taskAssignments[m.id] :
                  (m.studentCode && s1.contract.taskAssignments[m.studentCode] !== undefined ? s1.contract.taskAssignments[m.studentCode] :
                  (m.name && s1.contract.taskAssignments[m.name] !== undefined ? s1.contract.taskAssignments[m.name] : '')))
                )) || '';
                return `
                  <div style="display:flex; flex-direction:column; gap:6px; width:100%; background:#ffffff; padding:12px 14px; border-radius:8px; border:1px solid #e2e8f0; box-sizing:border-box;">
                    <span style="font-weight:800; color:${m.color || '#2563eb'}; font-size:13px;">${m.avatar || '👤'} ${m.name} (${m.roleTitle || '组员'}):</span>
                    <input type="text" class="large-contract-input task-assignment-input" data-mkey="${mKey}" data-lock-key="task_${mKey}" value="${taskVal}" ${isContractLocked ? 'disabled readonly style="opacity:0.8; cursor:not-allowed;"' : ''} style="width:100%; box-sizing:border-box; background:#ffffff; color:#0f172a; border:1px solid #cbd5e1; border-radius:6px; padding:10px 14px; font-size:13px; font-family:sans-serif;" placeholder="在聊天中商定或在此录入具体负责的写作章节与任务...">
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>

        <div id="stage1-contract-sign-matrix-mount" style="margin-top:16px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:14px 18px; width:100%; box-sizing:border-box;">
          <div style="font-size:13px; font-weight:700; color:#334155; margin-bottom:10px; display:flex; justify-content:space-between; flex-wrap:wrap; gap:10px;">
            <span>📌 本组全员确认签署状态矩阵 (规则：需 ${totalMembersCount}/${totalMembersCount} 人全部点击确认):</span>
            <span style="color:${confirmedCount === totalMembersCount ? '#059669' : '#d97706'}; font-weight:800;">签署进度: ${confirmedCount}/${totalMembersCount} 人已完成 ${confirmedCount === totalMembersCount ? '🎉 (合约已生效)' : ''}</span>
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:10px; font-size:13px;">
            ${membersList.map(m => {
              const isConf = isMemberDone(confirmedMembers, m);
              return `
                <span style="color:${isConf ? '#059669' : '#64748b'}; border:1px solid ${isConf ? '#a7f3d0' : '#e2e8f0'}; background:${isConf ? '#ecfdf5' : '#ffffff'}; padding:6px 12px; border-radius:8px; font-weight:600;">
                  ${m.avatar || '👤'} ${m.name}: <b>${isConf ? '✅ 已确认签署' : '⏳ 未确认'}</b>
                </span>
              `;
            }).join('')}
          </div>
        </div>

        <div id="stage1-contract-sign-action-mount" style="margin-top:20px; text-align:center; display:flex; justify-content:center; gap:12px; flex-wrap:wrap;">
          ${isContractLocked ? `
            <button id="btn-goto-stage2" style="background:linear-gradient(135deg, #2563eb, #1d4ed8); border:none; color:white; padding:13px 36px; border-radius:10px; font-weight:800; cursor:pointer; font-size:15px; box-shadow:0 4px 14px rgba(37,99,235,0.3); display:inline-flex; align-items:center; gap:8px;">
              🚀 全员已签署完毕！前往【阶段二：学术编辑部】开始论文起草 →
            </button>
          ` : `
            <button id="btn-confirm-contract" style="background:${userHasConfirmed ? '#eff6ff' : 'linear-gradient(135deg, #059669, #047857)'}; border:1px solid ${userHasConfirmed ? '#bfdbfe' : 'transparent'}; color:${userHasConfirmed ? '#1d4ed8' : 'white'}; padding:13px 32px; border-radius:10px; font-weight:800; cursor:pointer; font-size:14.5px; box-shadow:0 3px 12px rgba(5,150,105,0.25);">
              ${userHasConfirmed ? `✅ 我 (${currentUserName}) 已按键确认签署 (${confirmedCount}/${totalMembersCount} 人已完成)` : `✍️ 我以 (${currentUserName}) 身份按键确认签署合约 (已确认 ${confirmedCount}/${totalMembersCount} 人)`}
            </button>
          `}
        </div>

      </div>
    `;

    // 提案提交弹窗绑定 (支持新提交与修改已有选题，每人严格限制 1 个提案)
    const btnOpenProp = canvas.querySelector('#btn-open-submit-proposal');
    if (btnOpenProp) {
      btnOpenProp.addEventListener('click', () => {
        document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
        const existingProp = s1.proposals.find(p => {
          if (!p) return false;
          if (myKeys.has(p.author) || myKeys.has(p.authorName) || myKeys.has(p.authorId)) return true;
          if (currUserObj && (isSameUser(p.author, currUserObj) || isSameUser(p.authorName, currUserObj) || (p.authorName && p.authorName === currentUserName))) return true;
          return false;
        });
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
          <div class="teacher-modal-card fancy-task-modal" style="width:520px;">
            <div class="teacher-modal-header task-theme-gradient">
              <div class="modal-header-title">
                <div class="modal-icon-badge task">💡</div>
                <div><h3>${existingProp ? '修改我的选题提案' : '提交我的选题提案 (每人限1个)'}</h3></div>
              </div>
              <button class="modal-close-btn" id="btn-close-prop-modal">✕</button>
            </div>
            <div class="teacher-modal-body">
              <div class="teacher-form-group">
                <label><span class="req">*</span> 选题名称</label>
                <input type="text" id="prop-title-input" class="teacher-input fancy" placeholder="请输入您的选题名称..." value="${existingProp ? existingProp.title : ''}">
                <div style="font-size:12px; color:#64748b; margin-top:4px;">💡 提示：每位小组成员提交 1 份选题提案，提交后可随时修改完善。</div>
              </div>
            </div>
            <div class="teacher-modal-footer">
              <button class="modal-btn cancel" id="btn-cancel-prop">取消</button>
              <button class="modal-btn submit task-theme" id="btn-submit-prop-action">${existingProp ? '💾 保存修改' : '💡 确认提交至提案池'}</button>
            </div>
          </div>
        `;
        document.body.appendChild(modal);
        const closeModal = () => { modal.remove(); if (typeof onEscKey !== 'undefined') document.removeEventListener('keydown', onEscKey); };
        modal.querySelector('#btn-close-prop-modal').addEventListener('click', closeModal);
        modal.querySelector('#btn-cancel-prop').addEventListener('click', closeModal);

        modal.addEventListener('click', (e) => {
          if (e.target === modal) closeModal();
        });
        const onEscKey = (e) => {
          if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', onEscKey);
          }
        };
        document.addEventListener('keydown', onEscKey);

        modal.querySelector('#prop-title-input').addEventListener('input', () => {
          if (window.app) window.app.stage1LastActionTime = Date.now();
        });

        modal.querySelector('#btn-submit-prop-action').addEventListener('click', async () => {
          const title = modal.querySelector('#prop-title-input').value.trim();
          if (!title) { alert('⚠️ 请输入选题名称！'); return; }

          if (window.app) window.app.stage1LastActionTime = Date.now();

          const existingIdx = s1.proposals.findIndex(p => {
            if (!p) return false;
            if (myKeys.has(p.author) || myKeys.has(p.authorName) || myKeys.has(p.authorId)) return true;
            if (currUserObj && (isSameUser(p.author, currUserObj) || isSameUser(p.authorName, currUserObj) || (p.authorName && p.authorName === currentUserName))) return true;
            return false;
          });
          const nowMs = Date.now();
          const effectiveAuthorKey = currUserObj?.studentCode || currUserObj?.id || (typeof currentUser === 'string' ? currentUser : '') || currentUserName;
          const effectiveAuthorName = currUserObj?.name || currentUserName;
          const effectiveAuthorId = currUserObj?.id || effectiveAuthorKey;

          if (existingIdx >= 0) {
            // 已有提案：更新标题与修改时间戳（保持每人 1 份，时间戳最新）
            s1.proposals[existingIdx].title = title;
            s1.proposals[existingIdx].author = s1.proposals[existingIdx].author || effectiveAuthorKey;
            s1.proposals[existingIdx].authorName = effectiveAuthorName;
            s1.proposals[existingIdx].authorId = s1.proposals[existingIdx].authorId || effectiveAuthorId;
            s1.proposals[existingIdx].updatedAt = nowMs;
          } else {
            s1.proposals.push({
              id: 'prop_' + effectiveAuthorKey + '_' + nowMs,
              author: effectiveAuthorKey,
              authorName: effectiveAuthorName,
              authorId: effectiveAuthorId,
              title: title,
              updatedAt: nowMs
            });
          }

          const currentStage = state.currentStage;
          const authorName = effectiveAuthorName;
          const isModify = existingIdx >= 0;
          const submitNoticeMsg = {
            id: 'msg_prop_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
            sender: currentUser,
            senderName: authorName,
            text: isModify
              ? `✏️ 【选题提案修改】我 (${authorName}) 修改完善了选题提案《${title}》！`
              : `💡 【新选题提出】我 (${authorName}) 提出了新选题提案《${title}》！`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            _timeMs: Date.now()
          };
          if (!state.chatLogs[currentStage]) state.chatLogs[currentStage] = [];
          state.chatLogs[currentStage].push(submitNoticeMsg);

          closeModal();
          handlers.onRefresh();
          if (window.app) {
            window.app.syncStage1();
            if (window.app.cloudSyncEngine) {
              window.app.cloudSyncEngine.pushSnapshot();
            }
            if (typeof window.app.sendSingleChatMessage === 'function') {
              window.app.sendSingleChatMessage(submitNoticeMsg, currentStage);
            }
            window.app.renderStudentWorkspace();
            // 💡 统一异步触发学术拍卖师即时学术速评（无缝生成单条纯净速评气泡）
            if (typeof window.app.handleProposalSubmittedAIFeedback === 'function') {
              window.app.handleProposalSubmittedAIFeedback(title, authorName, isModify);
            }
          }

          // 检查全员提案集齐提醒
          const isSubstantive = (t) => {
            const str = (t || '').trim();
            if (str.length < 4) return false;
            if (/^\d+$/.test(str)) return false; 
            if (/^([a-zA-Z0-9\u4e00-\u9fa5])\1+$/.test(str)) return false; 
            return true;
          };
          const currentProps = s1.proposals || [];
          const validProps = currentProps.filter(p => isSubstantive(p.title));
          const validAuthors = new Set(validProps.map(p => p.author || p.authorName));

          if (totalMembersCount >= 2 && validAuthors.size >= totalMembersCount && !s1._allProposalsPrompted) {
            s1._allProposalsPrompted = true;
            const allCollectedMsg = {
              id: 'all_prop_' + Date.now(),
              sender: 'auctioneer',
              senderName: '头脑风暴 · 学术拍卖师',
              text: `🎪 【拍卖师·全员提案已集齐】：🎉 小组成员的选题提案已悉数亮相！👉 请大家先不要急于投票，先在右侧讨论区充分交流各个方案的研究看点与实施可行性；💬 研讨达成初步共识后，再在上方为最终认可的方案进行投票！`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              _timeMs: Date.now() + 100
            };
            state.chatLogs[currentStage].push(allCollectedMsg);
            if (window.app && typeof window.app.sendSingleChatMessage === 'function') {
              window.app.sendSingleChatMessage(allCollectedMsg, currentStage);
            }
            renderChat(state);
          }
        });
      });
    }

    const getLockPayload = (fieldKey, value = null) => {
      const currUser = (window.app && window.app.authManager) ? window.app.authManager.getCurrentUser() : null;
      const isTeacher = currUser && (currUser.role === 'teacher' || currUser.isTeacher);
      const effectiveClassId = (isTeacher ? window.app?.state.activeClassId : window.app?.state.activeStudentClassId) || (currUser?.classId || null);
      const activeGroupObj = window.app?.authManager ? window.app.authManager.getStudentActiveGroup(currUser, effectiveClassId) : null;
      const curGid = activeGroupObj?.id || (currUser?.groupId || state.activeGroupId || null);
      let curTaskId = window.app?.state.activeTaskId || (window.app?.cloudSyncEngine?.taskId || `task_${effectiveClassId}_default`);
      if (!curTaskId || curTaskId === 'task_default') {
        curTaskId = `task_${effectiveClassId}_default`;
      }
      const uId = currUser ? (currUser.studentCode || currUser.username || currUser.id) : 'u';
      const uName = currUser ? (currUser.name || currUser.username) : '组员';
      const payload = { fieldKey, userId: uId, userName: uName, groupId: curGid, taskId: curTaskId, classId: effectiveClassId };
      if (value !== null) payload.value = value;
      return payload;
    };

    const isFieldLockedByOther = (fieldKey) => {
      const currUser = (window.app && window.app.authManager) ? window.app.authManager.getCurrentUser() : null;
      const myId = currUser ? String(currUser.studentCode || currUser.username || currUser.id || '') : '';
      const myName = currUser ? String(currUser.name || currUser.username || '') : '';
      const lock = (window.app?.state?.fieldLocks || {})[fieldKey];
      if (!lock) return false;
      const isFresh = (Date.now() - Number(lock.time || lock.timestamp || 0) <= 8500);
      const lockUser = String(lock.userId || '');
      const lockName = String(lock.userName || '');
      return isFresh && lockUser !== myId && (!myName || lockName !== myName);
    };

    const sendLock = (fieldKey, val = null) => {
      const p = getLockPayload(fieldKey, val);
      try {
        if (window.app?.cloudSyncEngine?.bc) {
          const locksObj = { ...(window.app.state.fieldLocks || {}) };
          locksObj[fieldKey] = { userId: p.userId, userName: p.userName, time: Date.now(), value: val };
          window.app.cloudSyncEngine.bc.postMessage({ snapshot: { locks: locksObj } });
        }
      } catch (e) {}

      fetch(`sync.php?action=lock_field&groupId=${encodeURIComponent(p.groupId)}&taskId=${encodeURIComponent(p.taskId)}&classId=${encodeURIComponent(p.classId || null)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p)
      }).catch(() => {});
    };

    const sendUnlock = (fieldKey, val = null) => {
      const p = getLockPayload(fieldKey, val);
      try {
        if (window.app?.cloudSyncEngine?.bc) {
          const locksObj = { ...(window.app.state.fieldLocks || {}) };
          delete locksObj[fieldKey];
          window.app.cloudSyncEngine.bc.postMessage({ snapshot: { locks: locksObj } });
        }
      } catch (e) {}

      fetch(`sync.php?action=unlock_field&groupId=${encodeURIComponent(p.groupId)}&taskId=${encodeURIComponent(p.taskId)}&classId=${encodeURIComponent(p.classId || null)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p)
      }).catch(() => {});
    };

    const topicInput = canvas.querySelector('#contract-topic-input');
    if (topicInput && !isContractLocked) {
      let topicTimer = null;
      let idleTimer = null;
      let heartbeatTimer = null;

      const flushTopic = () => {
        s1.mergedTitle = topicInput.value;
        if (window.app) {
          window.app.syncStage1();
          if (window.app.cloudSyncEngine) window.app.cloudSyncEngine.pushSnapshot();
        }
      };

      const startHeartbeat = () => {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        heartbeatTimer = setInterval(() => {
          if (document.activeElement === topicInput && !isFieldLockedByOther('topic_title')) {
            sendLock('topic_title', topicInput.value);
          } else {
            clearInterval(heartbeatTimer);
          }
        }, 2000);
      };

      const resetIdleTimer = () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          // 8秒静止发呆交接：强制先入库保存，再安全释放锁
          flushTopic();
          sendUnlock('topic_title', topicInput.value);
          if (heartbeatTimer) clearInterval(heartbeatTimer);
        }, 8000);
      };

      topicInput.addEventListener('focus', (e) => {
        if (isFieldLockedByOther('topic_title')) {
          topicInput.blur();
          return;
        }
        sendLock('topic_title', topicInput.value);
        startHeartbeat();
        resetIdleTimer();
      });

      topicInput.addEventListener('compositionstart', () => {
        topicInput._isComposing = true;
        resetIdleTimer();
      });

      topicInput.addEventListener('compositionupdate', () => {
        resetIdleTimer();
      });

      topicInput.addEventListener('compositionend', (e) => {
        topicInput._isComposing = false;
        s1.mergedTitle = topicInput.value;
        sendLock('topic_title', topicInput.value);
        resetIdleTimer();
        if (topicTimer) clearTimeout(topicTimer);
        topicTimer = setTimeout(flushTopic, 300);
      });

      topicInput.addEventListener('input', (e) => {
        if (isFieldLockedByOther('topic_title')) {
          e.preventDefault();
          e.stopImmediatePropagation();
          return;
        }
        s1.mergedTitle = e.target.value;
        if (!topicInput._isComposing) {
          sendLock('topic_title', e.target.value);
        }
        resetIdleTimer();
        if (topicTimer) clearTimeout(topicTimer);
        topicTimer = setTimeout(flushTopic, 300);
      });

      topicInput.addEventListener('change', flushTopic);

      topicInput.addEventListener('blur', () => {
        if (idleTimer) clearTimeout(idleTimer);
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        if (topicInput._preemptedByOther || isFieldLockedByOther('topic_title')) {
          topicInput._preemptedByOther = false;
          return;
        }
        flushTopic();
        sendUnlock('topic_title', topicInput.value);
      });

      topicInput.addEventListener('keydown', (e) => {
        if (isFieldLockedByOther('topic_title')) {
          e.preventDefault();
          e.stopImmediatePropagation();
          return;
        }
        resetIdleTimer();
        if (e.isComposing || e.keyCode === 229) return;
        if (e.key === 'Enter') { topicInput.blur(); }
      });
    }

    const overviewInput = canvas.querySelector('#contract-overview-input');
    if (overviewInput && !isContractLocked) {
      let overviewTimer = null;
      let idleTimer = null;
      let heartbeatTimer = null;

      const flushOverview = () => {
        if (!s1.contract) s1.contract = {};
        s1.contract.overview = overviewInput.value;
        s1.researchOverview = overviewInput.value;
        if (window.app) {
          window.app.syncStage1();
          if (window.app.cloudSyncEngine) window.app.cloudSyncEngine.pushSnapshot();
        }
      };

      const startHeartbeat = () => {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        heartbeatTimer = setInterval(() => {
          if (document.activeElement === overviewInput && !isFieldLockedByOther('research_overview')) {
            sendLock('research_overview', overviewInput.value);
          } else {
            clearInterval(heartbeatTimer);
          }
        }, 2000);
      };

      const resetIdleTimer = () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          flushOverview();
          sendUnlock('research_overview', overviewInput.value);
          if (heartbeatTimer) clearInterval(heartbeatTimer);
        }, 8000);
      };

      overviewInput.addEventListener('focus', (e) => {
        if (isFieldLockedByOther('research_overview')) {
          overviewInput.blur();
          return;
        }
        sendLock('research_overview', overviewInput.value);
        startHeartbeat();
        resetIdleTimer();
      });

      overviewInput.addEventListener('compositionstart', () => {
        overviewInput._isComposing = true;
        resetIdleTimer();
      });

      overviewInput.addEventListener('compositionupdate', () => {
        resetIdleTimer();
      });

      overviewInput.addEventListener('compositionend', (e) => {
        overviewInput._isComposing = false;
        if (!s1.contract) s1.contract = {};
        s1.contract.overview = overviewInput.value;
        s1.researchOverview = overviewInput.value;
        sendLock('research_overview', overviewInput.value);
        resetIdleTimer();
        if (overviewTimer) clearTimeout(overviewTimer);
        overviewTimer = setTimeout(flushOverview, 300);
      });

      overviewInput.addEventListener('input', (e) => {
        if (isFieldLockedByOther('research_overview')) {
          e.preventDefault();
          e.stopImmediatePropagation();
          return;
        }
        if (!s1.contract) s1.contract = {};
        s1.contract.overview = e.target.value;
        s1.researchOverview = e.target.value;
        if (!overviewInput._isComposing) {
          sendLock('research_overview', e.target.value);
        }
        resetIdleTimer();
        if (overviewTimer) clearTimeout(overviewTimer);
        overviewTimer = setTimeout(flushOverview, 300);
      });

      overviewInput.addEventListener('change', flushOverview);

      overviewInput.addEventListener('blur', () => {
        if (idleTimer) clearTimeout(idleTimer);
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        if (overviewInput._preemptedByOther || isFieldLockedByOther('research_overview')) {
          overviewInput._preemptedByOther = false;
          return;
        }
        flushOverview();
        sendUnlock('research_overview', overviewInput.value);
      });
    }

    canvas.querySelectorAll('.contract-time-input').forEach(input => {
      if (!isContractLocked) {
        const key = input.dataset.key;
        const fieldKey = `time_${key}`;
        input.dataset.lockKey = fieldKey;
        let timeTimer = null;
        let idleTimer = null;
        let heartbeatTimer = null;

        const flushTime = () => {
          const numVal = Number(input.value) || 0;
          if (key && s1.contract.timeAllocations) {
            s1.contract.timeAllocations[key] = numVal;
            if (window.app) {
              window.app.syncStage1();
              const currUser = window.app.authManager ? window.app.authManager.getCurrentUser() : null;
              const effectiveClassId = window.app.state.activeStudentClassId || (currUser?.classId || null);
              const activeGroupObj = window.app.authManager ? window.app.authManager.getStudentActiveGroup(currUser, effectiveClassId) : null;
              const curGid = activeGroupObj?.id || (currUser?.groupId || state.activeGroupId || null);
              fetch('sync.php?action=patch_contract_field', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  taskId: window.app.state.activeTaskId || null,
                  groupId: curGid,
                  field: 'timeAllocations',
                  subKey: key,
                  value: numVal
                })
              }).catch(() => {});
            }
          }
        };

        const startHeartbeat = () => {
          if (heartbeatTimer) clearInterval(heartbeatTimer);
          heartbeatTimer = setInterval(() => {
            if (document.activeElement === input && !isFieldLockedByOther(fieldKey)) {
              sendLock(fieldKey, Number(input.value) || 0);
            } else {
              clearInterval(heartbeatTimer);
            }
          }, 2000);
        };

        const resetIdleTimer = () => {
          if (idleTimer) clearTimeout(idleTimer);
          idleTimer = setTimeout(() => {
            flushTime();
            sendUnlock(fieldKey, Number(input.value) || 0);
            if (heartbeatTimer) clearInterval(heartbeatTimer);
          }, 8000);
        };

        input.addEventListener('focus', () => {
          if (isFieldLockedByOther(fieldKey)) {
            input.blur();
            return;
          }
          sendLock(fieldKey, Number(input.value) || 0);
          startHeartbeat();
          resetIdleTimer();
        });

        input.addEventListener('input', (e) => {
          if (isFieldLockedByOther(fieldKey)) {
            e.preventDefault();
            e.stopImmediatePropagation();
            return;
          }
          const numVal = Number(e.target.value) || 0;
          if (key && s1.contract.timeAllocations) {
            s1.contract.timeAllocations[key] = numVal;
          }
          sendLock(fieldKey, numVal);
          resetIdleTimer();
          if (timeTimer) clearTimeout(timeTimer);
          timeTimer = setTimeout(flushTime, 300);
        });

        input.addEventListener('change', flushTime);

        input.addEventListener('blur', () => {
          if (idleTimer) clearTimeout(idleTimer);
          if (heartbeatTimer) clearInterval(heartbeatTimer);
          if (input._preemptedByOther || isFieldLockedByOther(fieldKey)) {
            input._preemptedByOther = false;
            return;
          }
          flushTime();
          sendUnlock(fieldKey, Number(input.value) || 0);
        });

        input.addEventListener('keydown', (e) => {
          if (isFieldLockedByOther(fieldKey)) {
            e.preventDefault();
            e.stopImmediatePropagation();
            return;
          }
          resetIdleTimer();
          if (e.isComposing || e.keyCode === 229) return;
          if (e.key === 'Enter') { input.blur(); }
        });
      }
    });

    canvas.querySelectorAll('.task-assignment-input').forEach(input => {
      if (!isContractLocked) {
        const mKey = input.dataset.mkey;
        const fieldKey = `task_${mKey}`;
        input.dataset.lockKey = fieldKey;
        let taskTimer = null;
        let idleTimer = null;
        let heartbeatTimer = null;

        const flushTask = () => {
          const val = input.value;
          if (!s1.contract.taskAssignments) s1.contract.taskAssignments = {};
          if (mKey) s1.contract.taskAssignments[mKey] = val;
          if (window.app) {
            window.app.syncStage1();
            const currUser = window.app.authManager ? window.app.authManager.getCurrentUser() : null;
            const effectiveClassId = window.app.state.activeStudentClassId || (currUser?.classId || null);
            const activeGroupObj = window.app.authManager ? window.app.authManager.getStudentActiveGroup(currUser, effectiveClassId) : null;
            const curGid = activeGroupObj?.id || (currUser?.groupId || state.activeGroupId || null);
            fetch('sync.php?action=patch_contract_field', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                taskId: window.app.state.activeTaskId || null,
                groupId: curGid,
                field: 'taskAssignments',
                subKey: mKey,
                value: val
              })
            }).catch(() => {});
          }
        };

        const startHeartbeat = () => {
          if (heartbeatTimer) clearInterval(heartbeatTimer);
          heartbeatTimer = setInterval(() => {
            if (document.activeElement === input && !isFieldLockedByOther(fieldKey)) {
              sendLock(fieldKey, input.value);
            } else {
              clearInterval(heartbeatTimer);
            }
          }, 2000);
        };

        const resetIdleTimer = () => {
          if (idleTimer) clearTimeout(idleTimer);
          idleTimer = setTimeout(() => {
            flushTask();
            sendUnlock(fieldKey, input.value);
            if (heartbeatTimer) clearInterval(heartbeatTimer);
          }, 8000);
        };

        input.addEventListener('focus', () => {
          if (isFieldLockedByOther(fieldKey)) {
            input.blur();
            return;
          }
          sendLock(fieldKey, input.value);
          startHeartbeat();
          resetIdleTimer();
        });

        input.addEventListener('compositionstart', () => {
          input._isComposing = true;
          resetIdleTimer();
        });

        input.addEventListener('compositionupdate', () => {
          resetIdleTimer();
        });

        input.addEventListener('compositionend', (e) => {
          input._isComposing = false;
          if (!s1.contract.taskAssignments) s1.contract.taskAssignments = {};
          if (mKey) s1.contract.taskAssignments[mKey] = input.value;
          sendLock(fieldKey, input.value);
          resetIdleTimer();
          if (taskTimer) clearTimeout(taskTimer);
          taskTimer = setTimeout(flushTask, 300);
        });

        input.addEventListener('input', (e) => {
          if (isFieldLockedByOther(fieldKey)) {
            e.preventDefault();
            e.stopImmediatePropagation();
            return;
          }
          const val = e.target.value;
          if (!s1.contract.taskAssignments) s1.contract.taskAssignments = {};
          if (mKey) s1.contract.taskAssignments[mKey] = val;
          if (!input._isComposing) {
            sendLock(fieldKey, val);
          }
          resetIdleTimer();
          if (taskTimer) clearTimeout(taskTimer);
          taskTimer = setTimeout(flushTask, 300);
        });

        input.addEventListener('change', flushTask);

        input.addEventListener('blur', () => {
          if (idleTimer) clearTimeout(idleTimer);
          if (heartbeatTimer) clearInterval(heartbeatTimer);
          if (input._preemptedByOther || isFieldLockedByOther(fieldKey)) {
            input._preemptedByOther = false;
            return;
          }
          flushTask();
          sendUnlock(fieldKey, input.value);
        });

        input.addEventListener('keydown', (e) => {
          if (isFieldLockedByOther(fieldKey)) {
            e.preventDefault();
            e.stopImmediatePropagation();
            return;
          }
          resetIdleTimer();
          if (e.isComposing || e.keyCode === 229) return;
          if (e.key === 'Enter') { input.blur(); }
        });
      }
    });
    if (!isContractLocked) {
      canvas.querySelectorAll('.vote-btn:not([disabled])').forEach(btn => {
        btn.addEventListener('click', () => handlers.onVote(btn.dataset.id));
      });
      const btnExtractTopic = canvas.querySelector('#btn-extract-topic');
      if (btnExtractTopic) {
        btnExtractTopic.addEventListener('click', () => {
          if (!isVotingComplete) {
            alert(`🔒 请先完成全员提案提交与投票推选！\n\n当前全组投票进度：${totalVotesCast}/${totalMembersCount} 人已投票。\n投票结束后拍卖师将落槌揭晓结果，随后方可开启主题与方案提炼。`);
            return;
          }
          if (handlers.onExtractTopic) handlers.onExtractTopic();
        });
      }

      const btnExtractTime = canvas.querySelector('#btn-extract-time');
      if (btnExtractTime) {
        btnExtractTime.addEventListener('click', () => {
          if (handlers.onExtractTime) handlers.onExtractTime();
        });
      }

      const btnExtractTasks = canvas.querySelector('#btn-extract-tasks');
      if (btnExtractTasks) {
        btnExtractTasks.addEventListener('click', () => {
          if (handlers.onExtractTasks) handlers.onExtractTasks();
        });
      }

      const btnGenDraft = canvas.querySelector('#btn-generate-contract-draft');
      if (btnGenDraft) {
        btnGenDraft.addEventListener('click', () => {
          if (handlers.onAiGenerateContract) handlers.onAiGenerateContract();
        });
      }

      const btnConfirm = canvas.querySelector('#btn-confirm-contract');
      if (btnConfirm) {
        btnConfirm.addEventListener('click', () => {
          s1.contract._lastSignTime = Date.now();
          const currUser = (window.app && window.app.authManager) ? window.app.authManager.getCurrentUser() : null;
          const myCode = state.currentUser || (currUser ? currUser.studentCode : 'A');
          const effectiveClassId = window.app.state.activeStudentClassId || (currUser?.classId || null);
          const activeGroupObj = window.app.authManager ? window.app.authManager.getStudentActiveGroup(currUser, effectiveClassId) : null;
          const curGid = activeGroupObj?.id || (currUser?.groupId || state.activeGroupId || null);

          fetch('sync.php?action=patch_contract_field', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              taskId: state.activeTaskId || null,
              groupId: curGid,
              field: 'sign_member',
              subKey: myCode,
              value: true
            })
          }).catch(() => {});

          handlers.onConfirmContract();
        });
      }

      const btnGotoS2 = canvas.querySelector('#btn-goto-stage2');
      if (btnGotoS2) {
        btnGotoS2.addEventListener('click', () => {
          if (window.app && typeof window.app.switchStage === 'function') {
            window.app.switchStage('stage2', true);
          }
        });
      }
    }

    if (activeKey) {
      const restoreInput = canvas.querySelector(`#${activeKey}, [data-key="${activeKey}"], [data-mkey="${activeKey}"]`);
      if (restoreInput) {
        restoreInput.value = activeVal;
        restoreInput.focus();
        try { restoreInput.setSelectionRange(activeCursor, activeCursor); } catch (e) {}
      }
    }

    renderPresencePills('stage1-canvas', state);
  }

  function renderStage2Canvas(canvas, state, handlers) {
    if (!canvas) return;
    const s2 = state.stage2;
    if (s2.unifiedContent && (s2.unifiedContent.includes('一、研究背景与意义') || s2.unifiedContent.includes('请在此处撰写正文'))) {
      s2.unifiedContent = '';
    }
    const actionPlan = s2.actionPlan;
    const currUser = (window.app && window.app.authManager) ? window.app.authManager.getCurrentUser() : null;
    let userClassId = state.activeStudentClassId || (currUser ? currUser.classId : null) || null;
    const activeGroupObj = (window.app && window.app.authManager) ? window.app.authManager.getStudentActiveGroup(currUser, userClassId) : null;
    let userGroupId = activeGroupObj?.id || (window.app?.cloudSyncEngine?.groupId) || (currUser?.groupId) || state.activeGroupId || 'group_1';
    let activeTaskId = state.activeTaskId || (window.app?.cloudSyncEngine?.taskId) || (`task_${userClassId || 'default'}_default`);
    if (!activeTaskId || activeTaskId === 'task_default') activeTaskId = `task_${userClassId || 'default'}_default`;

    // 🛡️ 班级/小组/成员/任务严格解析：任一解析不到 → 明确提示并阻止渲染正文画布（不再静默兜底 group_1 / task_default / null）
    const authMgr = (window.app && window.app.authManager) ? window.app.authManager : null;
    if (authMgr && typeof authMgr.resolveStudentActiveContext === 'function') {
      const strictCtx = authMgr.resolveStudentActiveContext(currUser, {
        classId: state.activeStudentClassId || null,
        taskId: state.activeTaskId || null
      });
      if (!strictCtx.ok) {
        canvas.innerHTML = showResolutionBlock(strictCtx.reason);
        return;
      }
      userClassId = strictCtx.classId;
      userGroupId = strictCtx.groupId;
      if (strictCtx.taskId) activeTaskId = strictCtx.taskId;
    }

    const availablePapers = (window.app && window.app.authManager) ? window.app.authManager.getReferencePapers(userGroupId, userClassId, activeTaskId) : [];
    const paperBtnLabel = availablePapers.length > 0 ? `📚 查阅参考范文 (${availablePapers.length}篇)` : '📚 查阅参考范文库';

    const allTasks = (window.app && window.app.authManager) ? window.app.authManager.getTasks() : [];
    const currentTask = allTasks.find(t => t.id === state.activeTaskId);
    const isTaskDeadlineExpired = isTaskExpired(currentTask);
    const confirmedDraftMap = s2.confirmedMembers || {};
    const isMemberDone = (map, m) => {
      if (!map || !m) return false;
      let fullUser = (typeof m === 'object') ? m : null;
      if (!fullUser && window.app && window.app.authManager && window.app.authManager.findUserByKey) {
        fullUser = window.app.authManager.findUserByKey(m);
      }
      const keys = [
        typeof m === 'string' ? m : null,
        m?.id, m?.studentCode, m?.username, m?.name,
        fullUser?.id, fullUser?.studentCode, fullUser?.username, fullUser?.name
      ].filter(Boolean).map(k => String(k).trim().toLowerCase());

      // 1. 直接通过 key 匹配
      if (keys.some(k => map[k] || map[String(k)])) return true;
      // 2. 遍历 map 对象的所有 value 进行交叉属性匹配
      const values = Object.values(map);
      return values.some(item => {
        if (!item) return false;
        const itemKeys = [
          item.user, item.name, item.id, item.studentCode, item.username,
          typeof item === 'string' ? item : null
        ].filter(Boolean).map(k => String(k).trim().toLowerCase());
        return keys.some(k => itemKeys.includes(k));
      });
    };
    const membersList = Object.values(state.members || {});
    const allGroupMembers = (activeGroupObj && Array.isArray(activeGroupObj.members) && activeGroupObj.members.length > 0) ? activeGroupObj.members : membersList;
    const actualTotalCount = allGroupMembers.length > 0 ? allGroupMembers.length : (membersList.length || 2);
    const totalCount = actualTotalCount;
    const confirmedDraftCount = allGroupMembers.filter(m => isMemberDone(confirmedDraftMap, m)).length;
    const currUserCode = state.currentUser || (currUser ? currUser.studentCode : 'A');
    const isUserDraftConfirmed = isMemberDone(confirmedDraftMap, { id: currUserCode, studentCode: currUser?.studentCode, username: currUser?.username, name: currUser?.name });
    const isDraftFullyConfirmed = !!s2.isDraftConfirmed && (confirmedDraftCount >= actualTotalCount && actualTotalCount > 0);
    const meetingSubs = s2.meetingSubmissions || {};
    const isStage2MeetingLocked = s2.isMeetingLocked || (Object.keys(meetingSubs).length >= actualTotalCount && actualTotalCount > 0);
    // 🛡️ 阶段二只读严格判定：仅在任务截止过期、全组最终提交答辩终稿、或当前处于回看历史阶段时才锁定为只读；阶段二进行中全员始终可正常协同编辑！
    const isEditorReadonly = state.isFinalSubmitted || isTaskDeadlineExpired || (state.isViewingPastStage && state.groupMaxStage === 'stage3');
    const plainTextLen = (s2.unifiedContent || '').replace(/<[^>]*>/g, '').trim().length;

    const padName = `jizhi_${activeTaskId}_${userGroupId}`;

    // 🚀 核心黑科技：同源 Etherpad iframe 内部 DOM 毫秒级直读函数
    const getEtherpadTextDirect = () => {
      try {
        const f = document.getElementById('stage2-etherpad-frame');
        if (f && f.contentDocument) {
          const aceOuter = f.contentDocument.querySelector('iframe[name="ace_outer"]');
          if (aceOuter && aceOuter.contentDocument) {
            const aceInner = aceOuter.contentDocument.querySelector('iframe[name="ace_inner"]');
            if (aceInner && aceInner.contentDocument) {
              const innerBody = aceInner.contentDocument.querySelector('.innerdocbody') || aceInner.contentDocument.body;
              if (innerBody) {
                return (innerBody.innerText || '').replace(/\r\n/g, '\n').trim();
              }
            }
          }
        }
      } catch (e) {}
      return null;
    };

    const getMemberContribVal = (contribs, m) => {
      if (!contribs || !m) return 0;
      const keys = [m.studentCode, m.id, m.username, m.name].filter(Boolean);
      let maxVal = 0;
      for (const k of keys) {
        if (contribs[k] !== undefined && Number(contribs[k]) > maxVal) {
          maxVal = Number(contribs[k]);
        }
      }
      return maxVal;
    };

    const updateContribDom = () => {
      const labelsEl = document.getElementById('stage2-contrib-labels');
      const barsEl = document.getElementById('stage2-contrib-bars');
      if (!labelsEl || !barsEl) return;

      const contribs = (state.stage2 && state.stage2.memberContributions) ? state.stage2.memberContributions : {};
      let rawTotal = 0;
      membersList.forEach(m => { rawTotal += getMemberContribVal(contribs, m); });

      const docLen = (state.stage2 && state.stage2.unifiedContent) ? state.stage2.unifiedContent.length : 0;
      const newLabelsHtml = membersList.map((m) => {
        const rawVal = getMemberContribVal(contribs, m);
        const pct = rawTotal > 0 ? Math.round((rawVal / rawTotal) * 100) : 0;
        const displayWords = (docLen > 0 && rawTotal > 0) ? Math.round((rawVal / rawTotal) * docLen) : rawVal;
        return `<span style="color:${rawVal > 0 ? (m.color || '#2563eb') : '#94a3b8'}; font-weight:700;">● ${m.name}: ${pct}% (${displayWords}字)</span>`;
      }).join('');

      if (labelsEl.innerHTML !== newLabelsHtml) {
        labelsEl.innerHTML = newLabelsHtml;
      }

      let newBarsHtml = '';
      if (rawTotal === 0) {
        newBarsHtml = `<div style="width:100%; height:8px; background:#f8fafc; border-radius:4px; display:flex; align-items:center; justify-content:center; font-size:9.5px; color:#94a3b8; font-weight:600;">⏳ 在 Etherpad 中撰写或修改正文将实时累计真实贡献</div>`;
      } else {
        newBarsHtml = membersList.map((m) => {
          const rawVal = getMemberContribVal(contribs, m);
          const pct = rawTotal > 0 ? Math.round((rawVal / rawTotal) * 100) : 0;
          return `<div class="contrib-segment" style="width:${pct}%; background:${m.color || '#2563eb'}; transition:width 0.8s ease-in-out;" title="${m.name}: ${pct}% (${rawVal}字)"></div>`;
        }).join('');
      }

      if (barsEl.innerHTML !== newBarsHtml) {
        barsEl.innerHTML = newBarsHtml;
      }
    };

    let _padContentDebounceTimer = null;
    const syncPadMetrics = async () => {
      try {
        // 1. 优先尝试同源 DOM 直读（0 延迟、0 网络开销、100% 毫秒级捕获）
        let cleanTxt = getEtherpadTextDirect();

        // 2. 若直读暂未就绪（如 iframe 仍在握手），降级为服务端代理接口
        if (cleanTxt === null) {
          const res = await fetch(`sync.php?action=get_pad_text&padId=${encodeURIComponent(padName)}`).then(r => r.json()).catch(() => null);
          if (res && res.success && typeof res.text === 'string') {
            cleanTxt = res.text.replace(/\r\n/g, '\n').trim();
          }
        }

        if (cleanTxt !== null) {
          const wordCount = cleanTxt.length;

          // 实时更新字数角标
          const countBadge = document.getElementById('stage2-word-count-num');
          if (countBadge) countBadge.innerText = String(wordCount);

          const prevContent = state.stage2.unifiedContent || '';
          const hasContentChanged = (cleanTxt !== prevContent);

          if (hasContentChanged) {
            state.stage2.unifiedContent = cleanTxt;
            if (_padContentDebounceTimer) clearTimeout(_padContentDebounceTimer);
            _padContentDebounceTimer = setTimeout(() => {
              if (window.app && typeof window.app.syncStage2 === 'function') {
                window.app.syncStage2();
              }
              if (window.app && typeof window.app.checkAgentTriggersOnContent === 'function') {
                window.app.checkAgentTriggersOnContent(cleanTxt);
              }
            }, 2000);
          }

          // 动态贡献度计算（支持乐观立即更新与服务端持久化）：
          if (!state.stage2.memberContributions) state.stage2.memberContributions = {};
          const contribs = state.stage2.memberContributions;
          let rawTotal = 0;
          membersList.forEach(m => { rawTotal += getMemberContribVal(contribs, m); });

          const prevLen = state.stage2._prevKnownLen !== undefined ? state.stage2._prevKnownLen : 0;
          state.stage2._prevKnownLen = wordCount;

          const delta = (wordCount > prevLen) ? (wordCount - prevLen) : ((wordCount > 0 && rawTotal === 0) ? wordCount : 0);
          if (delta > 0) {
            const matchedMember = membersList.find(m => {
              if (!m) return false;
              if (currUser && (m.id === currUser.id || m.studentCode === currUser.studentCode || m.username === currUser.username || (m.name && m.name === currUser.name))) return true;
              if (state.currentUser && (m.id === state.currentUser || m.studentCode === state.currentUser || m.username === state.currentUser || m.name === state.currentUser)) return true;
              return false;
            }) || membersList[0];

            const curVal = getMemberContribVal(contribs, matchedMember);
            const newVal = curVal + delta;

            const keysToUpdate = [matchedMember?.studentCode, matchedMember?.id, matchedMember?.username, matchedMember?.name, currUser?.studentCode, currUser?.id, currUserCode].filter(Boolean);
            keysToUpdate.forEach(k => {
              contribs[k] = newVal;
            });
            updateContribDom();

            // 📡 异步持久化到服务端双表
            const reportCode = matchedMember?.studentCode || matchedMember?.id || currUser?.studentCode || currUserCode;
            fetch(`sync.php?action=report_member_contrib&groupId=${encodeURIComponent(userGroupId)}&taskId=${encodeURIComponent(activeTaskId)}&classId=${encodeURIComponent(userClassId)}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                taskId: activeTaskId,
                classId: userClassId,
                groupId: userGroupId,
                userCode: reportCode,
                delta: delta
              })
            }).then(r => r.json()).then(res => {
              if (res && res.success && res.contribs) {
                keysToUpdate.forEach(k => {
                  res.contribs[k] = newVal;
                });
                state.stage2.memberContributions = res.contribs;
                updateContribDom();
              }
            }).catch(() => {});
          } else {
            updateContribDom();
          }
        }
      } catch (e) {}
    };

    // 立即启动/重置高频轮询器
    if (window._stage2WordCountTimer) clearInterval(window._stage2WordCountTimer);
    window._stage2WordCountTimer = setInterval(syncPadMetrics, 1500);
    setTimeout(syncPadMetrics, 300);

    // 🛡️ 极致单例保护：若 Etherpad 协同编辑器或富文本编辑器已经在当前画布上活跃运行，严禁 innerHTML 销毁重绘！
    const existingFrame = canvas.querySelector('#stage2-etherpad-frame') || canvas.querySelector('#stage2-word-editor.ql-container');
    if (existingFrame) {
      const wordBadge = canvas.querySelector('#stage2-word-count-num');
      if (wordBadge) wordBadge.innerText = String(plainTextLen);

      const btnShowCase = canvas.querySelector('#btn-show-case');
      if (btnShowCase) {
        btnShowCase.innerText = paperBtnLabel;
        btnShowCase.onclick = (e) => {
          if (e) { e.preventDefault(); e.stopPropagation(); }
          handlers.onOpenCaseModal();
        };
      }

      // 增量就地刷新【智能体正在分析动态横幅】
      let analyzingBanner = canvas.querySelector('#agent-analyzing-live-banner');
      if (state.activeAgentAnalyzing) {
        const bannerHtml = `
          <div id="agent-analyzing-live-banner" style="background:linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%); border:1.5px solid #93c5fd; border-radius:8px; padding:10px 16px; margin-bottom:6px; display:flex; align-items:center; justify-content:space-between; box-shadow:0 3px 12px rgba(37,99,235,0.12); flex-shrink:0;">
            <div style="display:flex; align-items:center; gap:12px;">
              <div style="width:20px; height:20px; border:2.5px solid #bfdbfe; border-top-color:#2563eb; border-radius:50%; animation:spin 0.9s linear infinite; flex-shrink:0;"></div>
              <div>
                <div style="font-size:12.5px; font-weight:800; color:#1e3a8a; display:flex; align-items:center; gap:6px;">
                  <span>${state.activeAgentAnalyzing.icon || '🤖'} ${state.activeAgentAnalyzing.title || '智能体专家正在研读中...'}</span>
                </div>
                <div style="font-size:11.5px; color:#2563eb; margin-top:2px; font-weight:600;">
                  ${state.activeAgentAnalyzing.detail || '正在通读全篇草稿并进行学术质量诊断，请稍候...'}
                </div>
              </div>
            </div>
            <span style="font-size:11px; font-weight:800; color:#1d4ed8; background:#ffffff; border:1px solid #bfdbfe; padding:3px 10px; border-radius:12px; box-shadow:0 1px 3px rgba(0,0,0,0.05); display:inline-flex; align-items:center; gap:4px;">
              ⏳ 深度质检中
            </span>
          </div>
        `;
        if (analyzingBanner) {
          analyzingBanner.outerHTML = bannerHtml;
        } else {
          const topControl = canvas.querySelector('.card > div:first-child');
          if (topControl) {
            topControl.insertAdjacentHTML('afterend', bannerHtml);
          }
        }
      } else if (analyzingBanner) {
        analyzingBanner.remove();
      }

      // 增量就地刷新【半程修正清单】
      const planCardContainer = canvas.querySelector('#stage2-action-plan-card');
      if (planCardContainer) {
        let effActionPlan = actionPlan;
        const allChatLogs = [
          ...(state.chatLogs?.stage1 || []),
          ...(state.chatLogs?.stage2 || []),
          ...(state.chatLogs?.stage3 || [])
        ];
        // 严格仅匹配审稿编辑下发的【二审修正清单】，坚决排除修改决议与讨论总结
        const revMsg = allChatLogs.find(m => m && m.text && (m.text.includes('二审修正清单') || m.text.includes('半程编辑修正清单') || m.text.includes('半程修正清单')) && !m.text.includes('修改落实决议') && !m.text.includes('修改落实要点'));

        if ((!effActionPlan || !effActionPlan.isGenerated || !effActionPlan.items || effActionPlan.items.length < 3) && (s2.meetingStep === 'discussing_checklist' || s2.meetingStep === 'completed' || !!revMsg)) {
          let parsedItems = [];
          if (revMsg && revMsg.text) {
            let body = revMsg.text;
            const headerMatch = body.match(/(?:二审修正清单|半程编辑修正清单|半程修正清单)[】:：\s]*/);
            if (headerMatch) {
              body = body.slice(headerMatch.index + headerMatch[0].length);
            }
            body = body.replace(/[👉\s]*请大家围绕.*$/s, '')
                       .replace(/[👉\s]*请全组围绕.*$/s, '')
                       .replace(/[👉\s]*讨论差不多.*$/s, '')
                       .replace(/[👉\s]*点击下方.*$/s, '')
                       .replace(/^本次修改需对齐三项要求[：:]*/s, '')
                       .trim();

            let chunks = body.split(/(?=[①②③]|\b[123]\.|(?=[一二三]是))/g).map(c => c.trim()).filter(Boolean);
            if (chunks.length < 3) {
              chunks = body.split(/[\n；;]+/g).map(c => c.trim()).filter(Boolean);
            }
            chunks.forEach(c => {
              let clean = c.replace(/^[①②③\d\.\s\(\)一二三是：:]+/, '').replace(/[；;。]\s*$/, '').trim();
              if (clean.length > 5 && !clean.includes('请全组协同') && !clean.includes('冲刺终审定稿')) {
                parsedItems.push(clean);
              }
            });
          }
          if (parsedItems.length > 0) {
            effActionPlan = {
              isGenerated: true,
              completedMap: (effActionPlan && effActionPlan.completedMap) || {},
              items: parsedItems.slice(0, 3)
            };
            if (!state.stage2.actionPlan) state.stage2.actionPlan = effActionPlan;
            state.stage2.actionPlan.isGenerated = true;
            state.stage2.actionPlan.items = effActionPlan.items;
          }
        }

        if (effActionPlan && effActionPlan.isGenerated && Array.isArray(effActionPlan.items) && effActionPlan.items.length > 0) {
          const completedCount = Object.values(effActionPlan.completedMap || {}).filter(Boolean).length;
          const totalItems = (effActionPlan.items || []).length;
          const isAllDone = completedCount >= totalItems && totalItems > 0;
          planCardContainer.outerHTML = `
            <div id="stage2-action-plan-card" style="background:#ecfdf5; border:1px solid #a7f3d0; border-radius:6px; padding:6px 12px; margin-bottom:6px; flex-shrink:0; box-shadow:0 1px 3px rgba(5,150,105,0.06);">
              <div style="display:flex; justify-content:space-between; align-items:center; cursor:pointer;" id="btn-toggle-action-plan">
                <div style="font-size:12px; font-weight:800; color:#059669; display:flex; align-items:center; gap:8px;">
                  <span>📋 【半程修正清单】(审稿专家 3 项修改要求)</span>
                  <span style="font-size:11px; background:${isAllDone ? '#d1fae5' : '#fef3c7'}; color:${isAllDone ? '#065f46' : '#b45309'}; border:1px solid ${isAllDone ? '#a7f3d0' : '#fde68a'}; padding:1px 8px; border-radius:10px; font-weight:800;">
                    ${isAllDone ? '🎉 3 项要求已全部落实' : `⏳ 已落实 ${completedCount}/${totalItems} 项`}
                  </span>
                </div>
                <span id="icon-toggle-action-plan" style="font-size:11px; color:#059669; font-weight:700; background:#ffffff; border:1px solid #a7f3d0; padding:1.5px 8px; border-radius:4px;">▲ 收起清单</span>
              </div>
              <div id="body-action-plan-items" style="font-size:11.5px; color:#1e293b; display:flex; flex-direction:column; gap:5px; margin-top:6px;">
                ${effActionPlan.items.map((item, idx) => {
                  const isChecked = !!(effActionPlan.completedMap && effActionPlan.completedMap[idx]);
                  let formattedItem = escapeHtml(item);
                  return `
                    <div class="action-plan-item-box" data-item-idx="${idx}" style="line-height:1.4; background:${isChecked ? '#f0fdf4' : '#ffffff'}; border:1px solid ${isChecked ? '#86efac' : '#cbd5e1'}; border-radius:4px; padding:5px 8px; display:flex; align-items:flex-start; gap:6px; cursor:pointer; transition:all 0.15s ease;">
                      <input type="checkbox" class="action-plan-check-input" data-idx="${idx}" ${isChecked ? 'checked' : ''} style="cursor:pointer; margin-top:2px; transform:scale(1.1);">
                      <div style="flex:1; text-decoration:${isChecked ? 'line-through' : 'none'}; color:${isChecked ? '#166534' : '#1e293b'};">
                        <b style="color:${isChecked ? '#166534' : '#0f172a'}; margin-right:4px;">${idx + 1}.</b> ${formattedItem}
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          `;

          const newPlanCard = canvas.querySelector('#stage2-action-plan-card');
          if (newPlanCard) {
            const btnToggle = newPlanCard.querySelector('#btn-toggle-action-plan');
            if (btnToggle) {
              btnToggle.onclick = (e) => {
                if (e.target.closest('.action-plan-item-box') || e.target.classList.contains('action-plan-check-input')) return;
                const bodyItems = newPlanCard.querySelector('#body-action-plan-items');
                const iconToggle = newPlanCard.querySelector('#icon-toggle-action-plan');
                if (bodyItems) {
                  const isHidden = bodyItems.style.display === 'none';
                  bodyItems.style.display = isHidden ? 'flex' : 'none';
                  if (iconToggle) iconToggle.innerText = isHidden ? '▲ 收起清单' : '▼ 展开清单';
                }
              };
            }
            newPlanCard.querySelectorAll('.action-plan-item-box').forEach(box => {
              box.onclick = (e) => {
                const idx = Number(box.dataset.itemIdx);
                if (!state.stage2.actionPlan.completedMap) state.stage2.actionPlan.completedMap = {};
                state.stage2.actionPlan.completedMap[idx] = !state.stage2.actionPlan.completedMap[idx];
                if (handlers.onActionPlanToggle) {
                  handlers.onActionPlanToggle(idx, state.stage2.actionPlan.completedMap[idx]);
                }
              };
            });
          }
        }

        // 🌟 增量就地刷新右上角【会议打卡】与【初稿确认】小药丸
        const totalCount = membersList.length || 2;
        const subs = s2.meetingSubmissions || {};
        const subCount = Object.keys(subs).length;
        const isMeetingFullyDone = subCount >= totalCount && totalCount > 0;
        const isCurrentUserSubmitted = isMemberDone(subs, { id: currUserCode, studentCode: currUser?.studentCode, username: currUser?.username, name: currUser?.name });

        const meetingTextEl = canvas.querySelector('#stage2-meeting-count-text');
        if (meetingTextEl) {
          meetingTextEl.innerText = isMeetingFullyDone ? '✅ 会议已全员打卡' : `📢 会议: ${subCount}/${totalCount}`;
          meetingTextEl.style.color = isMeetingFullyDone ? '#059669' : '#2563eb';
          meetingTextEl.style.background = isMeetingFullyDone ? '#d1fae5' : '#eff6ff';
          meetingTextEl.style.borderColor = isMeetingFullyDone ? '#a7f3d0' : '#bfdbfe';
        }

        const meetingBtnEl = canvas.querySelector('#btn-trigger-meeting-pills');
        if (meetingBtnEl) {
          meetingBtnEl.innerText = isCurrentUserSubmitted ? '✓ 查看会议' : '📢 参与会议';
          meetingBtnEl.style.background = isCurrentUserSubmitted ? '#ecfdf5' : 'linear-gradient(135deg, #2563eb, #1d4ed8)';
          meetingBtnEl.style.color = isCurrentUserSubmitted ? '#059669' : 'white';
          meetingBtnEl.style.border = isCurrentUserSubmitted ? '1px solid #a7f3d0' : 'none';
        }

        const confMembers = s2.confirmedMembers || {};
        const confirmedDraftCount = membersList.filter(m => isMemberDone(confMembers, m)).length;
        const isDraftFullyConfirmed = s2.isDraftConfirmed || (confirmedDraftCount >= totalCount && totalCount > 0);
        const isUserDraftConfirmed = isMemberDone(confMembers, { id: currUserCode, studentCode: currUser?.studentCode, username: currUser?.username, name: currUser?.name });

        const draftTextEl = canvas.querySelector('#stage2-draft-count-text');
        if (draftTextEl) {
          draftTextEl.innerText = isDraftFullyConfirmed ? '🎉 初稿已确认' : `✍️ 初稿: ${confirmedDraftCount}/${totalCount}`;
          draftTextEl.style.color = isDraftFullyConfirmed ? '#059669' : '#d97706';
          draftTextEl.style.background = isDraftFullyConfirmed ? '#d1fae5' : '#fef3c7';
          draftTextEl.style.borderColor = isDraftFullyConfirmed ? '#a7f3d0' : '#fde68a';
        }

        const draftBtnEl = canvas.querySelector('#btn-confirm-stage2-draft');
        if (draftBtnEl) {
          draftBtnEl.innerText = isDraftFullyConfirmed ? '🎉 初稿完成' : (isUserDraftConfirmed ? '✓ 已确认' : '✍️ 确认初稿');
          draftBtnEl.style.background = isUserDraftConfirmed ? '#ecfdf5' : 'linear-gradient(135deg, #059669, #047857)';
          draftBtnEl.style.color = isUserDraftConfirmed ? '#059669' : 'white';
          draftBtnEl.style.border = isUserDraftConfirmed ? '1px solid #a7f3d0' : 'none';
        }

        return;
      }

    canvas.innerHTML = `
      <div class="card" style="height:100%; flex:1; display:flex; flex-direction:column; padding:8px 12px; box-sizing:border-box; overflow:hidden;">

        <!-- 🌟 1. 顶部紧凑一体化协作控制台 (高度仅 36px，集成字数、范文、会议打卡与初稿确认) -->
        <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:6px 12px; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; flex-shrink:0; box-shadow:0 1px 3px rgba(15,23,42,0.03);">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:13.5px; font-weight:800; color:#0f172a; display:inline-flex; align-items:center; gap:4px;">📝 论文正文协同起草</span>
            <span style="font-size:11.5px; color:#2563eb; background:#eff6ff; padding:2px 8px; border-radius:10px; border:1px solid #bfdbfe; font-weight:800;">字数: <b id="stage2-word-count-num">${plainTextLen}</b> 字</span>
            <button id="btn-show-case" style="background:#ffffff; border:1px solid #cbd5e1; color:#1d4ed8; padding:2px 8px; border-radius:6px; font-size:11px; cursor:pointer; font-weight:700;">${paperBtnLabel}</button>
          </div>

          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <!-- 编辑会议打卡小药丸 -->
            ${(() => {
              const subs = s2.meetingSubmissions || {};
              const subCount = Object.keys(subs).length;
              const isMeetingFullyDone = subCount >= totalCount && totalCount > 0;
              const isCurrentUserSubmitted = isMemberDone(subs, { id: currUserCode, studentCode: currUser?.studentCode, username: currUser?.username, name: currUser?.name });
              return `
                <div style="display:flex; align-items:center; gap:4px;">
                  <span id="stage2-meeting-count-text" style="font-size:11px; font-weight:800; color:${isMeetingFullyDone ? '#059669' : '#2563eb'}; background:${isMeetingFullyDone ? '#d1fae5' : '#eff6ff'}; padding:1.5px 6px; border-radius:8px; border:1px solid ${isMeetingFullyDone ? '#a7f3d0' : '#bfdbfe'};">
                    ${isMeetingFullyDone ? '✅ 会议已全员打卡' : `📢 会议: ${subCount}/${totalCount}`}
                  </span>
                  <button id="btn-trigger-meeting-pills" style="background:${isCurrentUserSubmitted ? '#ecfdf5' : 'linear-gradient(135deg, #2563eb, #1d4ed8)'}; border:${isCurrentUserSubmitted ? '1px solid #a7f3d0' : 'none'}; color:${isCurrentUserSubmitted ? '#059669' : 'white'}; padding:2.5px 8px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer;">
                    ${isCurrentUserSubmitted ? '✓ 查看会议' : '📢 参与会议'}
                  </button>
                </div>
              `;
            })()}

            <!-- 初稿全员确认小药丸 -->
            <div style="display:flex; align-items:center; gap:4px;">
              <span id="stage2-draft-count-text" style="font-size:11px; font-weight:800; color:${isDraftFullyConfirmed ? '#059669' : '#d97706'}; background:${isDraftFullyConfirmed ? '#d1fae5' : '#fef3c7'}; padding:1.5px 6px; border-radius:8px; border:1px solid ${isDraftFullyConfirmed ? '#a7f3d0' : '#fde68a'};">
                ${isDraftFullyConfirmed ? '🎉 初稿已确认' : `✍️ 初稿: ${confirmedDraftCount}/${totalCount}`}
              </span>
              <button id="btn-confirm-stage2-draft" onclick="if(window.app && window.app.handlers && typeof window.app.handlers.onConfirmStage2Draft === 'function'){ window.app.handlers.onConfirmStage2Draft(); } else if (window.app && typeof window.app.onConfirmStage2Draft === 'function'){ window.app.onConfirmStage2Draft(); }" style="background:${isUserDraftConfirmed ? '#ecfdf5' : 'linear-gradient(135deg, #059669, #047857)'}; border:${isUserDraftConfirmed ? '1px solid #a7f3d0' : 'none'}; color:${isUserDraftConfirmed ? '#059669' : 'white'}; padding:2.5px 8px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer;">
                ${isDraftFullyConfirmed ? '🎉 初稿完成' : (isUserDraftConfirmed ? '✓ 已确认' : '✍️ 确认初稿')}
              </button>
            </div>
          </div>
        </div>

        <!-- 🚀 智能体正在深度研判/质检状态横幅 (非对话气泡专用动效框) -->
        ${state.activeAgentAnalyzing ? `
          <div id="agent-analyzing-live-banner" style="background:linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%); border:1.5px solid #93c5fd; border-radius:8px; padding:10px 16px; margin-bottom:6px; display:flex; align-items:center; justify-content:space-between; box-shadow:0 3px 12px rgba(37,99,235,0.12); flex-shrink:0;">
            <div style="display:flex; align-items:center; gap:12px;">
              <div style="width:20px; height:20px; border:2.5px solid #bfdbfe; border-top-color:#2563eb; border-radius:50%; animation:spin 0.9s linear infinite; flex-shrink:0;"></div>
              <div>
                <div style="font-size:12.5px; font-weight:800; color:#1e3a8a; display:flex; align-items:center; gap:6px;">
                  <span>${state.activeAgentAnalyzing.icon || '🤖'} ${state.activeAgentAnalyzing.title || '智能体专家正在研读中...'}</span>
                </div>
                <div style="font-size:11.5px; color:#2563eb; margin-top:2px; font-weight:600;">
                  ${state.activeAgentAnalyzing.detail || '正在通读全篇草稿并进行学术质量诊断，请稍候...'}
                </div>
              </div>
            </div>
            <span style="font-size:11px; font-weight:800; color:#1d4ed8; background:#ffffff; border:1px solid #bfdbfe; padding:3px 10px; border-radius:12px; box-shadow:0 1px 3px rgba(0,0,0,0.05); display:inline-flex; align-items:center; gap:4px;">
              ⏳ 深度质检中
            </span>
          </div>
        ` : ''}

        <!-- 🌟 2. 半程修正清单 (未下发时展示待解锁提示，下发后展示展开卡片) -->
        ${(() => {
          let effActionPlan = actionPlan;
          const allChatLogs = [
            ...(state.chatLogs?.stage1 || []),
            ...(state.chatLogs?.stage2 || []),
            ...(state.chatLogs?.stage3 || [])
          ];
          // 严格仅匹配审稿编辑下发的【二审修正清单】，坚决排除修改决议与讨论总结
          const revMsg = allChatLogs.find(m => m && m.text && (m.text.includes('二审修正清单') || m.text.includes('半程编辑修正清单') || m.text.includes('半程修正清单')) && !m.text.includes('修改落实决议') && !m.text.includes('修改落实要点'));

          if ((!effActionPlan || !effActionPlan.isGenerated || !effActionPlan.items || effActionPlan.items.length < 3) && (s2.meetingStep === 'discussing_checklist' || s2.meetingStep === 'completed' || !!revMsg)) {
            let parsedItems = [];
            if (revMsg && revMsg.text) {
              let body = revMsg.text;
              const headerMatch = body.match(/(?:二审修正清单|半程编辑修正清单|半程修正清单)[】:：\s]*/);
              if (headerMatch) {
                body = body.slice(headerMatch.index + headerMatch[0].length);
              }
              body = body.replace(/[👉\s]*请大家围绕.*$/s, '')
                         .replace(/[👉\s]*请全组围绕.*$/s, '')
                         .replace(/[👉\s]*讨论差不多.*$/s, '')
                         .replace(/[👉\s]*点击下方.*$/s, '')
                         .replace(/^本次修改需对齐三项要求[：:]*/s, '')
                         .trim();

              let chunks = body.split(/(?=[①②③]|\b[123]\.|(?=[一二三]是))/g).map(c => c.trim()).filter(Boolean);
              if (chunks.length < 3) {
                chunks = body.split(/[\n；;]+/g).map(c => c.trim()).filter(Boolean);
              }
              chunks.forEach(c => {
                let clean = c.replace(/^[①②③\d\.\s\(\)一二三是：:]+/, '').replace(/[；;。]\s*$/, '').trim();
                if (clean.length > 5 && !clean.includes('请全组协同') && !clean.includes('冲刺终审定稿')) {
                  parsedItems.push(clean);
                }
              });
            }
            if (parsedItems.length > 0) {
              effActionPlan = {
                isGenerated: true,
                completedMap: (effActionPlan && effActionPlan.completedMap) || {},
                items: parsedItems.slice(0, 3)
              };
              if (!state.stage2.actionPlan) state.stage2.actionPlan = effActionPlan;
              state.stage2.actionPlan.isGenerated = true;
              state.stage2.actionPlan.items = effActionPlan.items;
            }
          }

          if (!effActionPlan || !effActionPlan.isGenerated) {
            return `
              <div id="stage2-action-plan-card" onclick="if(window.app && window.app.forceRefreshActionPlan){ window.app.forceRefreshActionPlan(); }" title="点击可重新核对并展开最新清单" style="background:#f8fafc; border:1px dashed #cbd5e1; border-radius:6px; padding:5px 12px; margin-bottom:6px; flex-shrink:0; display:flex; justify-content:space-between; align-items:center; cursor:pointer; transition:all 0.15s ease;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='#f8fafc'">
                <div style="font-size:11.5px; font-weight:700; color:#64748b; display:flex; align-items:center; gap:6px;">
                  <span>📋 【半程修正清单】</span>
                  <span style="font-size:10.5px; background:#eff6ff; color:#2563eb; padding:1px 6px; border-radius:6px;">待解锁 (组内编辑会议自查对齐后，由审稿专家质检下发)</span>
                </div>
                <span style="font-size:10.5px; color:#64748b; background:#ffffff; border:1px solid #e2e8f0; padding:1.5px 6px; border-radius:4px; display:inline-flex; align-items:center; gap:3px;">
                  🔄 点击核对
                </span>
              </div>
            `;
          }

          const completedCount = Object.values(effActionPlan.completedMap || {}).filter(Boolean).length;
          const totalItems = (effActionPlan.items || []).length;
          const isAllDone = completedCount >= totalItems && totalItems > 0;
          return `
            <div id="stage2-action-plan-card" style="background:#ecfdf5; border:1px solid #a7f3d0; border-radius:6px; padding:6px 12px; margin-bottom:6px; flex-shrink:0; box-shadow:0 1px 3px rgba(5,150,105,0.06);">
              <div style="display:flex; justify-content:space-between; align-items:center; cursor:pointer;" id="btn-toggle-action-plan">
                <div style="font-size:12px; font-weight:800; color:#059669; display:flex; align-items:center; gap:8px;">
                  <span>📋 【半程修正清单】(审稿专家 3 项修改要求)</span>
                  <span style="font-size:11px; background:${isAllDone ? '#d1fae5' : '#fef3c7'}; color:${isAllDone ? '#065f46' : '#b45309'}; border:1px solid ${isAllDone ? '#a7f3d0' : '#fde68a'}; padding:1px 8px; border-radius:10px; font-weight:800;">
                    ${isAllDone ? '🎉 3 项要求已全部落实' : `⏳ 已落实 ${completedCount}/${totalItems} 项`}
                  </span>
                </div>
                <span id="icon-toggle-action-plan" style="font-size:11px; color:#059669; font-weight:700; background:#ffffff; border:1px solid #a7f3d0; padding:1.5px 8px; border-radius:4px;">▲ 收起清单</span>
              </div>
              <div id="body-action-plan-items" style="font-size:11.5px; color:#1e293b; display:flex; flex-direction:column; gap:5px; margin-top:6px;">
                ${effActionPlan.items.map((item, idx) => {
                  const isChecked = !!(effActionPlan.completedMap && effActionPlan.completedMap[idx]);
                  let formattedItem = escapeHtml(item);
                  return `
                    <div class="action-plan-item-box" data-item-idx="${idx}" style="line-height:1.4; background:${isChecked ? '#f0fdf4' : '#ffffff'}; border:1px solid ${isChecked ? '#86efac' : '#cbd5e1'}; border-radius:4px; padding:5px 8px; display:flex; align-items:flex-start; gap:6px; cursor:pointer; transition:all 0.15s ease;">
                      <input type="checkbox" class="action-plan-check-input" data-idx="${idx}" ${isChecked ? 'checked' : ''} style="cursor:pointer; margin-top:2px; transform:scale(1.1);">
                      <div style="flex:1; text-decoration:${isChecked ? 'line-through' : 'none'}; color:${isChecked ? '#166534' : '#1e293b'};">
                        <b style="color:${isChecked ? '#166534' : '#0f172a'}; margin-right:4px;">${idx + 1}.</b> ${formattedItem}
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          `;
        })()}

        <!-- 🌟 3. Etherpad 在线协同富文本编辑器主体 (撑满整个画布) -->
        <div style="flex:1; height:100%; min-height:480px; display:flex; flex-direction:column; margin-bottom:6px;">
          ${(() => {
            const rawPadName = `jizhi_${activeTaskId}_${userGroupId}`;
            let currUserName = currUser?.name || '';
            if (!currUserName && state.members && state.members[currUserCode]?.name) {
              currUserName = state.members[currUserCode].name;
            }
            if (!currUserName && window.app && window.app.authManager) {
              const matchedUser = window.app.authManager.getUsers().find(u => u && (u.studentCode === currUserCode || u.id === currUserCode || u.username === currUserCode || u.id === currUser?.id));
              if (matchedUser && matchedUser.name) currUserName = matchedUser.name;
            }
            if (!currUserName) currUserName = currUser?.username || currUserCode || '组员';

            const currUserColor = (state.members && state.members[currUserCode]?.color) || '#2563eb';

            const targetPad = rawPadName;
            const padUrl = `/p/${encodeURIComponent(targetPad)}?userName=${encodeURIComponent(currUserName)}&userColor=${encodeURIComponent(currUserColor)}&showChat=false&showLineNumbers=true&lang=zh-hans`;

            return `
              <div class="word-editor-container" style="display:flex; flex-direction:column; height:100%; min-height:480px; border-radius:8px; overflow:hidden; border:1px solid #cbd5e1; box-shadow:0 2px 10px rgba(15,23,42,0.05); background:#ffffff; position:relative;">
                <div id="ep-loading-helper-s2" style="display:flex; align-items:center; justify-content:space-between; background:#f8fafc; border-bottom:1px solid #e2e8f0; padding:4px 10px; font-size:11px; color:#475569;">
                  <div style="display:flex; align-items:center; gap:6px;">
                    <span id="ep-status-dot-s2" style="display:inline-block; width:7px; height:7px; border-radius:50%; background:${isEditorReadonly ? '#dc2626' : '#10b981'};"></span>
                    <span id="ep-status-text-s2" style="font-weight:600;">${isEditorReadonly ? '🔒 Etherpad 协同文档已锁定 (只读模式)' : 'Etherpad 实时协同引擎已就绪 (毫秒级 OT 协同)'}</span>
                  </div>
                  <div style="display:flex; align-items:center; gap:6px;">
                    <a id="s2-pad-popout-link" href="${padUrl}" target="_blank" style="background:#ffffff; color:#334155; border:1px solid #cbd5e1; padding:2px 8px; border-radius:4px; font-size:11px; text-decoration:none; font-weight:600; display:inline-flex; align-items:center; gap:3px;">↗️ 独立窗口</a>
                    <button onclick="const f=document.getElementById('stage2-etherpad-frame'); if(f) { f.src=f.src; document.getElementById('ep-status-text-s2').innerText='正在重新连接...'; }" style="background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe; padding:2px 8px; border-radius:4px; font-size:11px; cursor:pointer; font-weight:700;">🔄 刷新连接</button>
                  </div>
                </div>
                <div style="flex:1; height:100%; min-height:440px; position:relative; background:#ffffff;">
                  <iframe id="stage2-etherpad-frame" src="${padUrl}" style="width:100%; height:100%; min-height:440px; border:none; display:block; background:#ffffff;" allow="clipboard-read; clipboard-write; fullscreen" onload="const el=document.getElementById('ep-status-text-s2'); if(el) el.innerText='${isEditorReadonly ? '🔒 Etherpad 协同文档已锁定 (只读模式)' : 'Etherpad 实时协同引擎已就绪 (毫秒级 OT 协同)'}';"></iframe>
                  ${isEditorReadonly ? '<div style="position:absolute; top:12px; right:12px; z-index:99; pointer-events:none; display:flex; align-items:center; justify-content:center;" title="🔒 正文已截止锁定为只读模式"><div style="background:rgba(15,23,42,0.8); color:#ffffff; padding:6px 14px; border-radius:6px; font-size:12px; font-weight:700; pointer-events:none; box-shadow:0 4px 12px rgba(0,0,0,0.18);">🔒 任务已截止/初稿已锁定 (只读查阅模式)</div></div>' : ''}
                </div>
              </div>
            `;
          })()}
        </div>

        <!-- 🌟 4. 底部超薄一体化贡献度状态条 (高度仅 22px，彩色占比与进度条合一) -->
        <div style="background:#ffffff; padding:4px 10px; border-radius:6px; border:1px solid #cbd5e1; flex-shrink:0; display:flex; align-items:center; justify-content:space-between; gap:12px; box-shadow:0 1px 2px rgba(15,23,42,0.03);">
          <span style="font-size:11px; font-weight:800; color:#1e293b; white-space:nowrap;">📊 团队贡献:</span>
          <div class="contrib-bars" id="stage2-contrib-bars" style="flex:1; height:8px; border-radius:4px; display:flex; overflow:hidden; background:#e2e8f0;">
            ${(() => {
              const contribs = s2.memberContributions || {};
              let rawTotal = 0;
              membersList.forEach(m => { rawTotal += (contribs[m.id] || 0) + (contribs[m.studentCode] || 0); });
              if (rawTotal === 0) {
                return `<div style="width:100%; height:8px; background:#f8fafc; border-radius:4px; display:flex; align-items:center; justify-content:center; font-size:9.5px; color:#94a3b8; font-weight:600;">⏳ 在 Etherpad 中撰写或修改正文将实时累计真实贡献</div>`;
              }
              return membersList.map((m) => {
                const rawVal = (contribs[m.id] || 0) + (contribs[m.studentCode] || 0);
                const pct = rawTotal > 0 ? Math.round((rawVal / rawTotal) * 100) : 0;
                return `<div class="contrib-segment" style="width:${pct}%; background:${m.color || '#2563eb'}; transition:width 0.8s ease-in-out;" title="${m.name}: ${pct}%"></div>`;
              }).join('');
            })()}
          </div>
          <div class="contrib-labels" id="stage2-contrib-labels" style="display:flex; font-size:11px; font-weight:700; color:#475569; gap:8px; white-space:nowrap;">
            ${(() => {
              const contribs = s2.memberContributions || {};
              let rawTotal = 0;
              membersList.forEach(m => { rawTotal += (contribs[m.id] || 0) + (contribs[m.studentCode] || 0); });
              return membersList.map((m) => {
                const rawVal = (contribs[m.id] || 0) + (contribs[m.studentCode] || 0);
                const pct = rawTotal > 0 ? Math.round((rawVal / rawTotal) * 100) : 0;
                return `<span style="color:${rawVal > 0 ? (m.color || '#2563eb') : '#94a3b8'};">● ${m.name}: ${pct}%</span>`;
              }).join('');
            })()}
          </div>
        </div>
      </div>
    `;

    attachWordEditorEvents(canvas, 'stage2-word-editor', isEditorReadonly, (html) => handlers.onUnifiedContentChange(html), (nodeIdx, sec, charOffset) => {
      if (handlers.onPresenceChange) handlers.onPresenceChange(nodeIdx, sec, charOffset);
    });
    renderRemoteCursors('stage2-word-editor', state);

    if (isEditorReadonly) {
      const s2Frame = canvas.querySelector('#stage2-etherpad-frame');
      if (s2Frame) enforceEtherpadReadonly(s2Frame);
    }

    const btnTogglePlan = canvas.querySelector('#btn-toggle-action-plan');
    if (btnTogglePlan) {
      btnTogglePlan.addEventListener('click', (e) => {
        if (e.target.closest('.action-plan-item-box') || e.target.classList.contains('action-plan-check-input')) return;
        const bodyItems = canvas.querySelector('#body-action-plan-items');
        const iconToggle = canvas.querySelector('#icon-toggle-action-plan');
        if (bodyItems) {
          const isHidden = bodyItems.style.display === 'none';
          bodyItems.style.display = isHidden ? 'flex' : 'none';
          if (iconToggle) iconToggle.innerText = isHidden ? '▲ 收起' : '▼ 展开';
        }
      });

      canvas.querySelectorAll('.action-plan-item-box').forEach(box => {
        box.addEventListener('click', (e) => {
          const idx = Number(box.dataset.itemIdx);
          if (!state.stage2.actionPlan.completedMap) state.stage2.actionPlan.completedMap = {};
          state.stage2.actionPlan.completedMap[idx] = !state.stage2.actionPlan.completedMap[idx];
          if (handlers.onActionPlanToggle) {
            handlers.onActionPlanToggle(idx, state.stage2.actionPlan.completedMap[idx]);
          } else if (window.app) {
            window.app.syncStage2();
            if (window.app.cloudSyncEngine) window.app.cloudSyncEngine.pushSnapshot();
            window.app.renderStudentWorkspace();
          }
        });
      });
    }

    const btnShowCaseInit = canvas.querySelector('#btn-show-case');
    if (btnShowCaseInit) btnShowCaseInit.addEventListener('click', (e) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      handlers.onOpenCaseModal();
    });

    const btnTrig = canvas.querySelector('#btn-trigger-meeting');
    if (btnTrig) btnTrig.addEventListener('click', () => handlers.onOpenMeetingModal());
    const btnTrigPills = canvas.querySelector('#btn-trigger-meeting-pills');
    if (btnTrigPills) btnTrigPills.addEventListener('click', () => handlers.onOpenMeetingModal());

    const btnS2ManagingSummary = canvas.querySelector('#btn-s2-managing-summary');
    if (btnS2ManagingSummary) {
      btnS2ManagingSummary.addEventListener('click', async () => {
        btnS2ManagingSummary.disabled = true;
        btnS2ManagingSummary.innerText = '⏳ 责任编辑与审稿专家总结中...';
        if (window.app && typeof window.app.handleS2ManagingSummary === 'function') {
          await window.app.handleS2ManagingSummary();
        }
      });
    }

    const btnS2ReviewingSummary = canvas.querySelector('#btn-s2-reviewing-summary');
    if (btnS2ReviewingSummary) {
      btnS2ReviewingSummary.addEventListener('click', async () => {
        btnS2ReviewingSummary.disabled = true;
        btnS2ReviewingSummary.innerText = '⏳ 审稿编辑总结冲刺中...';
        if (window.app && typeof window.app.handleS2ReviewingSummary === 'function') {
          await window.app.handleS2ReviewingSummary();
        }
      });
    }

    const btnConfirmDraft = canvas.querySelector('#btn-confirm-stage2-draft');
    if (btnConfirmDraft) {
      btnConfirmDraft.addEventListener('click', () => {
        if (isUserDraftConfirmed) {
          alert(`✅ 您已于此前确认完成初稿！\n当前全组确认进度：${confirmedDraftCount}/${totalCount} 人。\n所有组员全部确认后将自动全组解锁阶段三。`);
          return;
        }
        if (isEditorReadonly) {
          alert('🔒 当前任务已截止或已只读锁定。');
          return;
        }
        handlers.onConfirmStage2Draft();
      });
    }

  }

  function renderStage3Canvas(canvas, state, handlers) {
    if (!canvas) return;
    const s3 = state.stage3;
    const activeTab = s3.activeTab || 'defense';
    const membersList = Object.values(state.members || {});
    const totalCount = membersList.length || 3;
    const plainTextLen = (state.stage2.unifiedContent || '').replace(/<[^>]*>/g, '').trim().length;

    const currUser = (window.app && window.app.authManager) ? window.app.authManager.getCurrentUser() : null;
    const currUserCode = state.currentUser || (currUser ? currUser.studentCode : 'A');
    const confirmedRevMap = s3.confirmedMembers || {};
    const confirmedRevCount = membersList.filter(m => confirmedRevMap[m.id] || confirmedRevMap[m.studentCode] || confirmedRevMap[m.username] || (m.name && confirmedRevMap[m.name])).length;
    const isUserRevisionConfirmed = !!(confirmedRevMap[currUserCode] || (currUser && (confirmedRevMap[currUser.id] || confirmedRevMap[currUser.studentCode])));
    const isRevisionFullyConfirmed = confirmedRevCount >= totalCount && totalCount > 0;

    const finalSubmittedMap = s3.finalSubmittedMembers || {};
    const finalSubmittedCount = membersList.filter(m => finalSubmittedMap[m.id] || finalSubmittedMap[m.studentCode] || finalSubmittedMap[m.username] || (m.name && finalSubmittedMap[m.name])).length;
    const isUserFinalSubmitted = !!(finalSubmittedMap[currUserCode] || (currUser && (finalSubmittedMap[currUser.id] || finalSubmittedMap[currUser.studentCode])));
    const isAllFinalSubmitted = state.isFinalSubmitted || (finalSubmittedCount >= totalCount && totalCount > 0);

    const allTasks = (window.app && window.app.authManager) ? window.app.authManager.getTasks() : [];
    const currentTask = allTasks.find(t => t.id === state.activeTaskId);
    const isTaskDeadlineExpired = isTaskExpired(currentTask);
    const isFinalSubmitted = state.isFinalSubmitted || isAllFinalSubmitted || isTaskDeadlineExpired;

    const isDefenseLocked = isRevisionFullyConfirmed || isFinalSubmitted;

    // 🛡️ 极致单例保护：若 Stage 3 骨架已经在当前画布上活跃运行，仅进行无感就地显示切换与状态更新，严禁 innerHTML 销毁重绘！
    const existingDefenseCard = canvas.querySelector('#stage3-defense-card');
    const existingEditorCard = canvas.querySelector('#stage3-editor-card');
    const existingFrame = canvas.querySelector('#stage3-etherpad-frame');

    if (existingDefenseCard && existingEditorCard) {
      existingDefenseCard.style.display = (activeTab === 'defense') ? 'block' : 'none';
      existingEditorCard.style.display = (activeTab === 'editor') ? 'flex' : 'none';

      const btnTabDef = canvas.querySelector('#tab-btn-defense');
      if (btnTabDef) {
        btnTabDef.style.background = activeTab === 'defense' ? 'linear-gradient(135deg, #2563eb, #1d4ed8)' : '#f1f5f9';
        btnTabDef.style.color = activeTab === 'defense' ? 'white' : '#475569';
      }
      const btnTabEd = canvas.querySelector('#tab-btn-editor');
      if (btnTabEd) {
        btnTabEd.style.background = activeTab === 'editor' ? 'linear-gradient(135deg, #059669, #047857)' : (isRevisionFullyConfirmed ? '#f1f5f9' : '#f8fafc');
        btnTabEd.style.color = activeTab === 'editor' ? 'white' : (isRevisionFullyConfirmed ? '#475569' : '#94a3b8');
      }

      if (existingFrame && isFinalSubmitted) {
        enforceEtherpadReadonly(existingFrame);
      }
      return;
    }

    canvas.innerHTML = `
      <div style="height:100%; display:flex; flex-direction:column; gap:12px; overscroll-behavior-y:contain;">
        ${isTaskDeadlineExpired ? `
          <div style="background:#fef2f2; border:1.5px solid #fca5a5; border-radius:8px; padding:6px 14px; margin-bottom:4px; font-size:12.5px; color:#991b1b; font-weight:600; display:flex; justify-content:space-between; align-items:center; gap:12px; box-shadow:0 2px 6px rgba(239,68,68,0.08); height:38px; box-sizing:border-box; flex-shrink:0;">
            <div style="display:flex; align-items:center; gap:8px; min-width:0; flex:1; overflow:hidden; white-space:nowrap; text-overflow:ellipsis;">
              <span style="font-size:15px; flex-shrink:0;">🔒</span>
              <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"><b>任务已截止锁定：</b> 本任务已于 <b>${currentTask?.deadline || '截止时间'}</b> 截止，阶段三【答辩擂台】已自动转为<b>【只读查阅模式】</b>。如需修改请联系教师延长时间。</span>
            </div>
            <span style="font-size:11.5px; color:#ffffff; background:#dc2626; padding:2px 8px; border-radius:4px; font-weight:800; flex-shrink:0; letter-spacing:0.5px;">已截止</span>
          </div>
        ` : (state.isFinalSubmitted ? `
          <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:12px; padding:14px 18px; display:flex; justify-content:space-between; align-items:center; flex-shrink:0; box-shadow:0 2px 8px rgba(37,99,235,0.08);">
            <div>
              <div style="font-size:14px; font-weight:800; color:#1e40af; display:flex; align-items:center; gap:8px;">
                <span>🔒 本组论文终稿与评估报告已全员成功归档提交至教师端！</span>
              </div>
              <div style="font-size:12px; color:#475569; margin-top:3px;">请组内每位成员点击右侧按钮进入【课程协作体验与 SSRL 效果评估问卷】填写界面。</div>
            </div>
            <button id="btn-open-survey-page" style="background:linear-gradient(135deg, #2563eb, #1d4ed8); border:none; color:white; padding:8px 18px; border-radius:8px; font-weight:700; font-size:13px; cursor:pointer; box-shadow:0 3px 10px rgba(37,99,235,0.3);">
              📋 打开问卷填写界面 ↗
            </button>
          </div>
        ` : '')}

        <div style="display:flex; justify-content:space-between; align-items:center; background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:8px 12px; flex-shrink:0; box-shadow:0 1px 3px rgba(15,23,42,0.04); flex-wrap:wrap; gap:8px;">
          <div style="gap:10px; display:flex; flex-wrap:wrap;">
            <button id="tab-btn-defense" style="background:${activeTab === 'defense' ? 'linear-gradient(135deg, #2563eb, #1d4ed8)' : '#f1f5f9'}; border:none; color:${activeTab === 'defense' ? 'white' : '#475569'}; padding:8px 16px; border-radius:8px; font-weight:700; font-size:13px; cursor:pointer;">
              🎓 答辩委员会质询与中间委员引导面板
            </button>
            <button id="tab-btn-editor" style="background:${activeTab === 'editor' ? 'linear-gradient(135deg, #059669, #047857)' : (isRevisionFullyConfirmed ? '#f1f5f9' : '#f8fafc')}; border:${isRevisionFullyConfirmed ? 'none' : '1px dashed #cbd5e1'}; color:${activeTab === 'editor' ? 'white' : (isRevisionFullyConfirmed ? '#475569' : '#94a3b8')}; padding:8px 16px; border-radius:8px; font-weight:700; font-size:13px; cursor:${isRevisionFullyConfirmed ? 'pointer' : 'not-allowed'};" title="${isRevisionFullyConfirmed ? '切换至终稿协同修改' : '需组内全员确认进入终稿修改后解锁'}">
              ${isRevisionFullyConfirmed ? '📝 修改论文终稿 (依据答辩意见完善正文)' : '📝 修改论文终稿 (🔒 需全员确认进入终稿修改后解锁)'}
            </button>
          </div>
          <div style="display:flex; gap:8px; align-items:center;">
            ${activeTab === 'defense' ? (
              isDefenseLocked ? `
                <button disabled style="background:#f1f5f9; border:1px solid #cbd5e1; color:${isFinalSubmitted ? '#94a3b8' : '#059669'}; padding:8px 16px; border-radius:8px; font-weight:700; font-size:12.5px; cursor:default;">
                  ${isFinalSubmitted ? '🔒 论文终稿已归档 (只读)' : '✅ 全员已确认进入终稿修改 (答辩已锁定)'}
                </button>
              ` : `
                <button id="btn-confirm-stage3-revision" ${isUserRevisionConfirmed ? 'disabled' : ''} style="background:${isUserRevisionConfirmed ? '#f1f5f9' : 'linear-gradient(135deg, #2563eb, #1d4ed8)'}; border:${isUserRevisionConfirmed ? '1px solid #cbd5e1' : 'none'}; color:${isUserRevisionConfirmed ? '#2563eb' : 'white'}; padding:8px 16px; border-radius:8px; font-weight:700; font-size:12.5px; cursor:${isUserRevisionConfirmed ? 'default' : 'pointer'}; box-shadow:${isUserRevisionConfirmed ? 'none' : '0 2px 8px rgba(37,99,235,0.2)'};">
                  ${isUserRevisionConfirmed ? '✅ 您已确认进入终稿修改' : '✍️ 确认进入终稿修改'}
                </button>
              `
            ) : (
              state.isFinalSubmitted ? `
                <button disabled style="background:#ecfdf5; border:1px solid #a7f3d0; color:#059669; padding:8px 18px; border-radius:8px; font-weight:700; cursor:default; font-size:13px;">
                  🔒 论文终稿已全员提交归档
                </button>
              ` : (isUserFinalSubmitted ? `
                <button disabled style="background:#f1f5f9; border:1px solid #cbd5e1; color:#059669; padding:8px 16px; border-radius:8px; font-weight:700; font-size:12.5px; cursor:default;">
                  ✅ 您已确认提交终稿 (等待组员 ${finalSubmittedCount}/${totalCount})
                </button>
              ` : `
                <button id="btn-final-submit" style="background:linear-gradient(135deg, #059669, #047857); border:none; color:white; padding:8px 18px; border-radius:8px; font-weight:700; cursor:pointer; font-size:13px; box-shadow:0 3px 10px rgba(5,150,105,0.25);">
                  🚀 确认提交论文终稿
                </button>
              `)
            )}
          </div>
        </div>

        <!-- 终稿修改确认进度提示 -->
        ${!isFinalSubmitted && activeTab === 'defense' ? `
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:6px 14px; display:flex; justify-content:space-between; align-items:center; font-size:12px;">
            <span style="color:#475569; font-weight:700;">📝 终稿修改确认进度: <b style="color:${isRevisionFullyConfirmed ? '#059669' : '#2563eb'};">${confirmedRevCount}/${totalCount}</b> 人已确认进入终稿修改 ${isRevisionFullyConfirmed ? '<span style="color:#059669; margin-left:6px;">(🎉 全员已确认，终稿修改已解锁，答辩已锁定)</span>' : '<span style="color:#d97706; margin-left:6px;">(全员确认后自动解锁终稿修改)</span>'}</span>
            <div style="display:flex; gap:6px;">
              ${membersList.map(m => {
                const isConf = confirmedRevMap[m.id] || confirmedRevMap[m.studentCode] || confirmedRevMap[m.username] || (m.name && confirmedRevMap[m.name]);
                return `<span style="font-size:11px; padding:1px 8px; border-radius:10px; font-weight:700; background:${isConf ? '#ecfdf5' : '#ffffff'}; color:${isConf ? '#059669' : '#94a3b8'}; border:1px solid ${isConf ? '#a7f3d0' : '#e2e8f0'};">
                  ${isConf ? '✓' : '○'} ${m.name}
                </span>`;
              }).join('')}
            </div>
          </div>
        ` : ''}

        <!-- 终稿提交全员确认进度提示 -->
        ${!state.isFinalSubmitted && activeTab === 'editor' ? `
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:6px 14px; display:flex; justify-content:space-between; align-items:center; font-size:12px;">
            <span style="color:#475569; font-weight:700;">🚀 终稿提交确认进度: <b style="color:${isAllFinalSubmitted ? '#059669' : '#059669'};">${finalSubmittedCount}/${totalCount}</b> 人已确认提交 ${isAllFinalSubmitted ? '<span style="color:#059669; margin-left:6px;">(🎉 全员已确认提交)</span>' : '<span style="color:#d97706; margin-left:6px;">(需全组所有成员均确认提交后正式归档入库)</span>'}</span>
            <div style="display:flex; gap:6px;">
              ${membersList.map(m => {
                const isSub = finalSubmittedMap[m.id] || finalSubmittedMap[m.studentCode] || finalSubmittedMap[m.username] || (m.name && finalSubmittedMap[m.name]);
                return `<span style="font-size:11px; padding:1px 8px; border-radius:10px; font-weight:700; background:${isSub ? '#ecfdf5' : '#ffffff'}; color:${isSub ? '#059669' : '#94a3b8'}; border:1px solid ${isSub ? '#a7f3d0' : '#e2e8f0'};">
                  ${isSub ? '✓' : '○'} ${m.name}
                </span>`;
              }).join('')}
            </div>
          </div>
        ` : ''}

        <!-- 🎓 视图 1：答辩委员会意见与裁决矩阵 -->
        <div class="card" id="stage3-defense-card" style="display:${activeTab === 'defense' ? 'block' : 'none'}; flex:1; overflow-y:auto; padding:20px; overscroll-behavior-y:contain; -webkit-overflow-scrolling:touch;">
          ${isRevisionFullyConfirmed && !isFinalSubmitted ? `
            <div style="background:#ecfdf5; border:1px solid #a7f3d0; border-radius:8px; padding:8px 14px; margin-bottom:12px; font-size:12.5px; color:#065f46; font-weight:700; display:flex; justify-content:space-between; align-items:center;">
              <span>🔒 全组已全员确认进入终稿修改！答辩裁决矩阵已锁定归档（只读查阅），请在【修改论文终稿】面板中完善正文。</span>
              <button onclick="document.getElementById('tab-btn-editor').click();" style="background:#059669; color:white; border:none; padding:4px 12px; border-radius:6px; font-size:11.5px; cursor:pointer; font-weight:700;">前往修改终稿 ➔</button>
            </div>
          ` : ''}
          <div class="card-title" style="margin-bottom:14px;">
            <span style="color:#0f172a;">📋 答辩与终稿修改清单 ${isFinalSubmitted ? '<span style="font-size:11px; color:#059669; margin-left:6px;">(🔒 已全盘提交归档)</span>' : (isRevisionFullyConfirmed ? '<span style="font-size:11px; color:#059669; margin-left:6px;">(🔒 全员已确认进入终稿修改 · 答辩清单已定案归档)</span>' : '')}</span>
          </div>
          <div style="display:flex; flex-direction:column; gap:14px;">
            ${(state.stage3CommitteeLoading || !s3.feedbackItems || s3.feedbackItems.length === 0) ? `
              <div style="background:#ffffff; border:1px solid #bfdbfe; border-radius:12px; padding:36px 24px; text-align:center; box-shadow:0 4px 12px rgba(37,99,235,0.06);">
                <div style="font-size:36px; margin-bottom:12px;">⏳</div>
                <div style="font-size:16px; font-weight:800; color:#1e40af; margin-bottom:6px;">答辩委员会专家正在审阅全篇论文初稿...</div>
                <div style="font-size:13px; color:#64748b; line-height:1.6;">正方委员正在提取立论亮点，反方委员正在研拟针对实质询。<br>【答辩与终稿修改清单】即将在此生成，并同步呈现在右侧研讨区，请稍候！</div>
              </div>
            ` : s3.feedbackItems.map((item, idx) => {
              const isProp = item.role === 'proponent';
              const hasResponse = !!(item.response && item.response.trim());
              let badgeText = '⏳ 待研讨';
              let badgeBg = '#fffbeb';
              let badgeColor = '#d97706';
              let badgeBorder = '#fde68a';

              if (hasResponse) {
                badgeText = '✅ 已定案';
                badgeBg = '#ecfdf5';
                badgeColor = '#059669';
                badgeBorder = '#a7f3d0';
              } else if (isProp) {
                badgeText = '🌟 专家肯定 (立论支持)';
                badgeBg = '#eff6ff';
                badgeColor = '#2563eb';
                badgeBorder = '#bfdbfe';
              }

              return `
              <div style="background:#ffffff; padding:16px; border-radius:12px; border:1px solid ${isProp ? '#86efac' : (hasResponse ? '#a7f3d0' : '#fca5a5')}; box-shadow:0 2px 8px rgba(15,23,42,0.04);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                  <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-size:16px;">${isProp ? '🟢' : (hasResponse ? '✅' : '🔴')}</span>
                    <span style="font-weight:800; font-size:14.5px; color:${isProp ? '#059669' : (hasResponse ? '#0f766e' : '#dc2626')};">
                      ${isProp ? '专家立论支持' : `意见 ${idx}`}: ${escapeHtml(item.speaker || (isProp ? '正方委员 Agent' : '反方委员 Agent'))} - ${escapeHtml(item.title || '')}
                    </span>
                  </div>
                  <span style="font-size:11.5px; padding:3px 10px; border-radius:12px; font-weight:700; background:${badgeBg}; color:${badgeColor}; border:1px solid ${badgeBorder};">
                    ${badgeText}
                  </span>
                </div>
                <div style="font-size:13.5px; color:#1e293b; background:#f8fafc; border:1px solid #e2e8f0; padding:12px 14px; border-radius:8px; margin-bottom:12px; line-height:1.6;">
                  <b>${escapeHtml(item.speaker)}意见原文:</b><br>${escapeHtml(item.content || '')}
                </div>

                <div style="border-top:1px dashed #e2e8f0; padding-top:10px; margin-top:10px;">
                  <div style="font-size:12.5px; font-weight:700; color:#334155; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
                    <span>✍️ ${isProp ? '本组补充说明/强化论据 (选填)：' : '本组答辩回复与修改结论：'}</span>
                    ${hasResponse ? '<span style="color:#059669; font-size:11.5px; font-weight:700;">✅ 已保存生效' + (isDefenseLocked ? ' (已锁定归档)' : ' (可随时二次修改)') + '</span>' : (isProp ? '<span style="color:#2563eb; font-size:11.5px;">(立论支持默认通过，如无补充可直接留空)</span>' : '<span style="color:#64748b; font-size:11.5px;">(请直接在下方输入框中录入答辩结论)</span>')}
                  </div>
                  <textarea 
                    class="feedback-direct-input" 
                    data-id="${item.id}" 
                    ${isDefenseLocked ? 'disabled readonly' : ''} 
                    placeholder="${isProp ? '正方已给予高度肯定！如本组有进一步想要补充强化的论据可在此记录，无补充可留空...' : '商讨后，在此直接输入本组针对该条意见的简要答复与修改结论...'}" 
                    style="width:100%; min-height:64px; padding:8px 12px; font-size:13px; line-height:1.5; border:1px solid ${hasResponse ? '#a7f3d0' : '#cbd5e1'}; background:${isDefenseLocked ? '#f8fafc' : (hasResponse ? '#f0fdf4' : '#ffffff')}; border-radius:8px; resize:vertical; box-sizing:border-box; color:#0f172a; font-family:inherit;"
                  >${escapeHtml(item.response || '')}</textarea>

                  ${!isDefenseLocked ? `
                    <div style="display:flex; justify-content:flex-end; margin-top:8px;">
                      <button class="btn-save-feedback-direct" data-id="${item.id}" style="background:${hasResponse ? 'linear-gradient(135deg, #059669, #047857)' : 'linear-gradient(135deg, #2563eb, #1d4ed8)'}; border:none; color:white; padding:6px 14px; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:4px; box-shadow:0 2px 6px rgba(0,0,0,0.12);">
                        ${hasResponse ? '🔄 更新并保存答辩记录' : (isProp ? '💾 保存补充论据' : '💾 确认并保存本条答辩')}
                      </button>
                    </div>
                  ` : ''}
                </div>
              </div>
            `;}).join('')}
          </div>
        </div>

        <!-- 📝 视图 2：论文终稿协同修改 Etherpad 引擎 -->
        <div class="card" id="stage3-editor-card" style="display:${activeTab === 'editor' ? 'flex' : 'none'}; flex:1; flex-direction:column; padding:16px; min-height:600px; overscroll-behavior-y:contain; -webkit-overflow-scrolling:touch;">
          ${(() => {
            const currUser = (window.app && window.app.authManager) ? window.app.authManager.getCurrentUser() : null;
            let userClassId = state.activeStudentClassId || (currUser ? currUser.classId : null) || null;
            const activeGroupObj = (window.app && window.app.authManager) ? window.app.authManager.getStudentActiveGroup(currUser, userClassId) : null;
            let userGroupId = activeGroupObj?.id || (window.app?.cloudSyncEngine?.groupId) || (currUser?.groupId) || state.activeGroupId || 'group_1';
            let activeTaskId = state.activeTaskId || (window.app?.cloudSyncEngine?.taskId) || (`task_${userClassId || 'default'}_default`);
            if (!activeTaskId || activeTaskId === 'task_default') activeTaskId = `task_${userClassId || 'default'}_default`;

            // 🛡️ 班级/小组/成员/任务严格解析：任一解析不到 → 明确提示并阻止渲染终稿编辑器（不再静默兜底）
            const authMgr3 = (window.app && window.app.authManager) ? window.app.authManager : null;
            if (authMgr3 && typeof authMgr3.resolveStudentActiveContext === 'function') {
              const strictCtx3 = authMgr3.resolveStudentActiveContext(currUser, {
                classId: state.activeStudentClassId || null,
                taskId: state.activeTaskId || null
              });
              if (!strictCtx3.ok) return showResolutionBlock(strictCtx3.reason);
              userClassId = strictCtx3.classId;
              userGroupId = strictCtx3.groupId;
              if (strictCtx3.taskId) activeTaskId = strictCtx3.taskId;
            }

            const rawPadName = `jizhi_${activeTaskId}_${userGroupId}`;
            const currUserName = (currUser && (currUser.name || currUser.username)) || '组员';
            const currUserColor = (state.members && state.members[currUserCode]?.color) || '#2563eb';

            const isEditorReadonly = isFinalSubmitted || isTaskDeadlineExpired;

            const targetPad = rawPadName;
            const padUrl = `/p/${encodeURIComponent(targetPad)}?userName=${encodeURIComponent(currUserName)}&userColor=${encodeURIComponent(currUserColor)}&showChat=false&showLineNumbers=true&lang=zh-hans`;

            return `
              <div class="card-title" style="margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:15px; font-weight:800; color:#0f172a;">📝 论文全篇终稿大正文 ${isEditorReadonly ? '<span style="font-size:11.5px; color:#059669; margin-left:6px; background:#ecfdf5; padding:2px 8px; border-radius:6px; border:1px solid #a7f3d0;">🔒 终稿已归档/截止锁定 · 100% 只读防篡改保护</span>' : '(依据答辩意见实时协同修改终稿 · Etherpad 毫秒级引擎)'}</span>
                <div style="display:flex; align-items:center; gap:8px;">
                  <span style="font-size:11px; background:${isEditorReadonly ? '#f1f5f9' : '#ecfdf5'}; color:${isEditorReadonly ? '#64748b' : '#059669'}; border:1px solid ${isEditorReadonly ? '#cbd5e1' : '#a7f3d0'}; padding:2px 8px; border-radius:10px; font-weight:700;">${isEditorReadonly ? '🔒 只读归档' : '🟢 Etherpad 协同就绪'}</span>
                  <button onclick="const f=document.getElementById('stage3-etherpad-frame'); if(f) f.src=f.src;" style="background:transparent; color:#2563eb; border:1px solid #cbd5e1; padding:2px 8px; border-radius:4px; font-size:11px; cursor:pointer; font-weight:600;">🔄 刷新</button>
                </div>
              </div>
              <div style="flex:1; min-height:0; position:relative; background:#f1f5f9; border-radius:8px; overflow:hidden; border:1px solid #cbd5e1;">
                <iframe id="stage3-etherpad-frame" src="${padUrl}" style="width:100%; height:100%; min-height:540px; border:none; display:block;" allow="clipboard-read; clipboard-write"></iframe>
                ${isFinalSubmitted ? `
                  <div style="position:absolute; top:12px; right:12px; z-index:99; pointer-events:none; display:flex; align-items:center; justify-content:center;" title="🔒 论文终稿已全员提交归档锁定">
                    <div style="background:rgba(15,23,42,0.85); color:#ffffff; padding:6px 14px; border-radius:6px; font-size:12px; font-weight:700; pointer-events:none; box-shadow:0 4px 12px rgba(0,0,0,0.18); display:flex; align-items:center; gap:6px;">
                      <span>🔒 论文终稿已全员提交归档 (只读查阅模式)</span>
                    </div>
                  </div>
                ` : ''}
              </div>
            `;
          })()}
        </div>
      </div>
    `;

    // 🛡️ Safari 滚动记忆防回弹：恢复用户此前的滚动高度与聚焦输入状态
    const newDefenseCard = canvas.querySelector('#stage3-defense-card');
    if (newDefenseCard && oldScrollTop > 0) {
      newDefenseCard.scrollTop = oldScrollTop;
    }
    if (activeElemDataId && document.activeElement === activeElem) {
      const newElem = canvas.querySelector(`textarea[data-id="${activeElemDataId}"]`);
      if (newElem) {
        newElem.focus();
        if (activeSelectionStart !== undefined) {
          try { newElem.setSelectionRange(activeSelectionStart, activeSelectionEnd); } catch (e) {}
        }
      }
    }

    if (isFinalSubmitted) {
      const s3Frame = canvas.querySelector('#stage3-etherpad-frame');
      if (s3Frame) enforceEtherpadReadonly(s3Frame);
    }

    const tabDefense = canvas.querySelector('#tab-btn-defense');
    const tabEditor = canvas.querySelector('#tab-btn-editor');
    if (tabDefense) tabDefense.addEventListener('click', () => handlers.onSwitchStage3Tab('defense'));
    if (tabEditor) {
      tabEditor.addEventListener('click', () => {
        if (!isRevisionFullyConfirmed) {
          alert(`⚠️ 需组内全员确认进入终稿修改后，方可解锁进入【修改论文终稿】协同编辑！\n\n当前确认进度：${confirmedRevCount}/${totalCount} 人已确认。\n请提醒组内其他同学点击右上角【✍️ 确认进入终稿修改】！`);
          return;
        }
        handlers.onSwitchStage3Tab('editor');
      });
    }

    if (!isDefenseLocked) {
      canvas.querySelectorAll('.feedback-direct-input').forEach(textarea => {
        const itemId = textarea.dataset.id;
        const fieldKey = `fb_${itemId}`;
        textarea.dataset.lockKey = fieldKey;

        textarea.addEventListener('focus', () => {
          if (isFieldLockedByOther(fieldKey)) {
            textarea.blur();
            return;
          }
          sendLock(fieldKey, textarea.value);
        });

        textarea.addEventListener('input', (e) => {
          if (isFieldLockedByOther(fieldKey)) {
            e.preventDefault();
            e.stopImmediatePropagation();
            return;
          }
          sendLock(fieldKey, e.target.value);
        });

        textarea.addEventListener('blur', () => {
          sendUnlock(fieldKey, textarea.value);
        });
      });

      canvas.querySelectorAll('.btn-save-feedback-direct').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const itemId = btn.dataset.id;
          const textarea = canvas.querySelector(`.feedback-direct-input[data-id="${itemId}"]`);
          const text = textarea ? textarea.value.trim() : '';
          if (!text) {
            alert('⚠️ 请输入本组针对该条意见的简要答复结论后再保存！');
            return;
          }
          if (handlers && handlers.onSaveDirectFeedback) {
            handlers.onSaveDirectFeedback(itemId, text);
          }
        });
      });

      const btnConfirmRev = canvas.querySelector('#btn-confirm-stage3-revision');
      if (btnConfirmRev && !isUserRevisionConfirmed) {
        btnConfirmRev.addEventListener('click', () => {
          handlers.onConfirmStage3Revision();
        });
      }
    }

    const submitBtn = canvas.querySelector('#btn-final-submit');
    if (submitBtn && !isFinalSubmitted) submitBtn.addEventListener('click', () => handlers.onFinalSubmit());

    const surveyBtn = canvas.querySelector('#btn-open-survey-page');
    if (surveyBtn) surveyBtn.addEventListener('click', () => handlers.onOpenSurveyModal());
  }

  function renderChat(state) {
    const presenceContainer = document.getElementById('chat-member-presence-pills');
    if (presenceContainer) {
      const members = Object.values(state.members || {});
      const presence = state.presence || {};
      const currUser = (window.app && window.app.authManager) ? window.app.authManager.getCurrentUser() : null;
      const myCode = state.currentUser || (currUser ? currUser.studentCode : '');
      const nowMs = Date.now();

      // 收集近期 180 秒内发言或操作的所有成员
      const recentSpeakers = new Set();
      const visibleStages = ['stage1', 'stage2', 'stage3'];
      visibleStages.forEach(stg => {
        if (state.chatLogs && state.chatLogs[stg]) {
          state.chatLogs[stg].slice(-25).forEach(msg => {
            if (msg._timeMs && (nowMs - msg._timeMs < 180000)) {
              if (msg.sender) recentSpeakers.add(msg.sender);
              if (msg.senderName) recentSpeakers.add(msg.senderName);
            }
          });
        }
      });

      let memberList = [];
      if (Array.isArray(state.members)) memberList = state.members;
      else if (state.members && typeof state.members === 'object') memberList = Object.values(state.members);
      if (memberList.length === 0 && window.app?.authManager) {
        const u = window.app.authManager.getCurrentUser();
        const effClassId = (window.app?.authManager ? window.app.authManager.getEffectiveStudentClassId(u, window.app?.state?.activeTaskId) : (window.app?.state?.activeStudentClassId || u?.classId || null));
        const effGroup = window.app.authManager.getStudentActiveGroup(u, effClassId);
        memberList = window.app.authManager.getGroupMembersForWorkspace(effGroup?.id || state.activeGroupId || null);
      }

      const newPresenceHtml = memberList.map(m => {
        const uid = String(m.id || m.studentCode || m.userId || '').trim();
        const candidateKeys = [
          String(m.id || '').trim(),
          String(m.studentCode || '').trim(),
          String(m.username || '').trim(),
          String(m.name || '').trim()
        ].filter(Boolean);

        const isMe = (currUser && (
          (currUser.id && (m.id === currUser.id || uid === String(currUser.id))) ||
          (currUser.studentCode && (m.studentCode === currUser.studentCode || uid === String(currUser.studentCode))) ||
          (currUser.username && (m.username === currUser.username || uid === String(currUser.username))) ||
          (currUser.name && m.name === currUser.name)
        )) || (uid && uid === myCode);

        let isOnline = isMe;
        if (!isOnline) {
          for (const k of candidateKeys) {
            const p = presence[k];
            if (p) {
              const pTime = Number(p.lastSeen || p.updatedAt || p.timestamp || 0);
              if (pTime > 0 && (nowMs - pTime <= 25000)) {
                isOnline = true;
                break;
              }
            }
          }
          if (!isOnline) {
            for (const k of candidateKeys) {
              if (recentSpeakers.has(k)) {
                isOnline = true;
                break;
              }
            }
          }
        }

        const dotColor = isOnline ? '#10b981' : '#cbd5e1';
        const bgStyle = isOnline
          ? 'background:#ecfdf5; color:#059669; border:1px solid #a7f3d0;'
          : 'background:#f1f5f9; color:#94a3b8; border:1px solid #e2e8f0;';

        return `
          <span style="font-size:11px; padding:2px 8px; border-radius:10px; font-weight:700; display:inline-flex; align-items:center; gap:4px; ${bgStyle}">
            <span style="width:6px; height:6px; border-radius:50%; background:${dotColor};"></span>
            ${m.avatar || '👤'} ${m.name}${isMe ? ' (我)' : ''}
          </span>
        `;
      }).join('');

      if (presenceContainer.innerHTML !== newPresenceHtml) {
        presenceContainer.innerHTML = newPresenceHtml;
      }
    }

    const stream = document.getElementById('chat-stream');
    if (!stream) return;

    const currentUser = state.currentUser;
    const allStages = ['stage1', 'stage2', 'stage3'];

    // Collect all visible messages in order across all stages, auto-purging old legacy idle spam
    const allMsgs = [];
    const seenMsgKeys = new Set();
    allStages.forEach(stg => {
      if (state.chatLogs && Array.isArray(state.chatLogs[stg])) {
        state.chatLogs[stg].forEach(msg => {
          if (!msg) return;
          const txt = msg.text || '';
          if (txt.includes('已连续') || txt.includes('互动督促') || txt.includes('秒未研讨') || txt.includes('秒没有发言')) return;

          // 🛡️ 严格去重守护：依据唯一 msg.id 去重，100% 保护人类多次发送相同词汇（如连续发好/收到/同意）绝不误杀吞掉！
          const idKey = msg.id ? `id_${msg.id}` : `fallback_${msg.sender}_${stg}_${msg._timeMs || msg.timestamp}`;
          if (seenMsgKeys.has(idKey)) {
            return;
          }
          seenMsgKeys.add(idKey);

          allMsgs.push(msg);
        });
      }
    });
    allMsgs.sort((a, b) => (Number(a._timeMs || 0) - Number(b._timeMs || 0)));
    const cleanMsgs = filterAndDeduplicateChatLogs(allMsgs);

    const msgSignature = cleanMsgs.map(m => (m.id || `${m.sender}_${m._timeMs || m.timestamp}`)).join('|');
    if (stream.dataset.msgSignature === msgSignature) {
      return; // 消息没有任何变动，绝不重绘 DOM，彻底保护打字焦点与输入法
    }
    stream.dataset.msgSignature = msgSignature;

    // 智能滚动：如果用户正在往上拉浏览历史记录，保持当前视角不被强行打断拉回底部
    const isAtBottom = (stream.scrollHeight - stream.scrollTop - stream.clientHeight) < 90;
    const prevScrollTop = stream.scrollTop;

    const allUsers = (window.app && window.app.authManager) ? window.app.authManager.getUsers() : [];

    stream.innerHTML = cleanMsgs.map(msg => {
      const isMe = msg.sender === currentUser || (window.app?.authManager?.getCurrentUser() && (msg.sender === window.app.authManager.getCurrentUser().id || msg.sender === window.app.authManager.getCurrentUser().studentCode));
      const isAgent = AgentProfiles[msg.sender] !== undefined;

      let name = msg.senderName || msg.sender;
      let avatar = '👤';
      let color = '#2563eb';

      if (isAgent) {
        const profile = AgentProfiles[msg.sender];
        name = profile.roleTitle || profile.name;
        avatar = profile.avatar;
        color = profile.color || '#7c3aed';
      } else {
        if (msg.senderName && msg.senderName !== '组员') {
          name = msg.senderName;
        }
        const u = allUsers.find(x => isSameUser(x, msg.sender) || isSameUser(x, msg.senderName) || x.id === msg.sender || x.studentCode === msg.sender || x.username === msg.sender || x.name === msg.sender || (name && x.name === name));
        if (u && u.name) {
          name = u.name;
        } else if (state.members) {
          const memList = Array.isArray(state.members) ? state.members : Object.values(state.members);
          const mem = memList.find(m => isSameUser(m, msg.sender) || isSameUser(m, msg.senderName) || m.id === msg.sender || m.studentCode === msg.sender || m.username === msg.sender || m.name === msg.sender);
          if (mem && mem.name) name = mem.name;
        }

        const memList = Array.isArray(state.members) ? state.members : Object.values(state.members || {});
        const memObj = memList.find(m => isSameUser(m, msg.sender) || m.id === msg.sender || m.studentCode === msg.sender || m.name === name) || null;
        if (memObj) {
          avatar = memObj.avatar || '👨‍🎓';
          color = memObj.color || '#2563eb';
        }
      }

      let formattedContent = '';
      if (msg.isThinking) {
        formattedContent = `
          <div class="msg-bubble thinking-bubble" style="background:#f8fafc; border:1.5px dashed ${color}88; display:inline-flex; align-items:center; gap:8px; padding:9px 15px; border-radius:12px; color:${color};">
            <span style="font-size:13px; font-weight:700;">${escapeHtml(msg.text || '正在研读并起草学术意见...')}</span>
            <span class="thinking-dots-anim" style="display:inline-flex; gap:3.5px; align-items:center; margin-left:4px;">
              <span style="width:5px; height:5px; background:${color}; border-radius:50%; display:inline-block; animation:dotPulse 1.4s infinite ease-in-out both;"></span>
              <span style="width:5px; height:5px; background:${color}; border-radius:50%; display:inline-block; animation:dotPulse 1.4s infinite ease-in-out both; animation-delay:0.2s;"></span>
              <span style="width:5px; height:5px; background:${color}; border-radius:50%; display:inline-block; animation:dotPulse 1.4s infinite ease-in-out both; animation-delay:0.4s;"></span>
            </span>
          </div>
        `;
      } else if ((msg.text || '').startsWith('[IMG_DATA]:')) {
        const imgSrc = sanitizeUrl(msg.text.replace('[IMG_DATA]:', ''));
        formattedContent = `
          <div style="margin-top:2px;">
            <img src="${imgSrc}" class="chat-attached-img" style="max-width:220px; max-height:160px; border-radius:8px; border:1px solid #cbd5e1; cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,0.1); transition:transform 0.2s; display:block;" title="点击放大查看图片">
          </div>
        `;
      } else {
        let rawText = msg.text || '';
        let safeText = escapeHtml(rawText);
        let formattedText = safeText
          .replace(/(@[^\s@]+)/g, '<span class="mention-tag">$1</span>')
          .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
        formattedContent = `<div class="msg-bubble">${formattedText}</div>`;
      }

      return `
        <div class="chat-message ${isMe ? 'me' : 'other'}">
          <div class="msg-avatar" style="background:${color}22; border:1px solid ${color}; color:${color};">${escapeHtml(avatar)}</div>
          <div class="msg-body">
            <div class="msg-meta">
              <span class="msg-sender" style="color:${color};">${escapeHtml(name)} ${isMe ? '(我)' : ''}</span>
              <span style="font-size:10px; color:#64748b; margin-left:6px;">${escapeHtml(formatChatDisplayTime(msg._timeMs || msg.timestamp))}</span>
            </div>
            ${formattedContent}
          </div>
        </div>
      `;
    }).join('') + (state.activeAgentAnalyzing ? `
      <div class="chat-message other agent-typing-message" id="agent-chat-typing-indicator" style="animation:modalFadeIn 0.2s ease;">
        <div class="msg-avatar" style="background:#eff6ff; border:1.5px solid #2563eb; color:#2563eb; font-size:16px;">
          ${state.activeAgentAnalyzing.icon || '🤖'}
        </div>
        <div class="msg-body">
          <div class="msg-meta">
            <span class="msg-sender" style="color:#2563eb; font-weight:800;">
              ${escapeHtml((state.activeAgentAnalyzing.title || '智能体专家').replace(/[【】]/g, ''))}
            </span>
            <span style="font-size:10px; color:#2563eb; background:#eff6ff; border:1px solid #bfdbfe; padding:1px 6px; border-radius:10px; margin-left:6px; font-weight:700;">
              ⏳ 正在深度研读与质检中...
            </span>
          </div>
          <div class="msg-bubble thinking-bubble" style="background:#f8fafc; border:1.5px dashed #3b82f6; display:inline-flex; align-items:center; gap:8px; padding:8px 14px; border-radius:12px; color:#1e40af; box-shadow:0 1px 3px rgba(37,99,235,0.06);">
            <span style="font-size:12.5px; font-weight:700;">${escapeHtml(state.activeAgentAnalyzing.detail || '正在通读全篇草稿并提炼学术意见...')}</span>
            <span class="thinking-dots-anim" style="display:inline-flex; gap:3.5px; align-items:center; margin-left:4px;">
              <span style="width:5px; height:5px; background:#2563eb; border-radius:50%; display:inline-block; animation:dotPulse 1.4s infinite ease-in-out both;"></span>
              <span style="width:5px; height:5px; background:#2563eb; border-radius:50%; display:inline-block; animation:dotPulse 1.4s infinite ease-in-out both; animation-delay:0.2s;"></span>
              <span style="width:5px; height:5px; background:#2563eb; border-radius:50%; display:inline-block; animation:dotPulse 1.4s infinite ease-in-out both; animation-delay:0.4s;"></span>
            </span>
          </div>
        </div>
      </div>
    ` : '');

    const lastMsgIsMine = cleanMsgs.length > 0 && (cleanMsgs[cleanMsgs.length - 1].sender === currentUser || (window.app?.authManager?.getCurrentUser() && (cleanMsgs[cleanMsgs.length - 1].sender === window.app.authManager.getCurrentUser().id || cleanMsgs[cleanMsgs.length - 1].sender === window.app.authManager.getCurrentUser().studentCode)));

    if (isAtBottom || lastMsgIsMine) {
      stream.scrollTop = stream.scrollHeight;
    } else {
      stream.scrollTop = prevScrollTop;
    }

    stream.querySelectorAll('.chat-attached-img').forEach(img => {
      img.onclick = (e) => {
        e.stopPropagation();
        document.querySelectorAll('.img-preview-lightbox').forEach(el => el.remove());

        const box = document.createElement('div');
        box.className = 'img-preview-lightbox';
        box.style.cssText = 'position:fixed; inset:0; background:rgba(15,23,42,0.85); backdrop-filter:blur(8px); display:flex; flex-direction:column; align-items:center; justify-content:center; z-index:99999; animation:modalFadeIn 0.2s ease;';

        box.innerHTML = `
          <div style="position:absolute; top:20px; right:24px; display:flex; gap:10px; z-index:100000;" onclick="event.stopPropagation()">
            <button id="btn-lightbox-open-tab" style="background:#ffffff; color:#1e293b; border:none; padding:8px 14px; border-radius:8px; font-size:12.5px; font-weight:700; cursor:pointer; box-shadow:0 4px 12px rgba(0,0,0,0.15); display:flex; align-items:center; gap:6px;">
              🔗 在新标签页打开
            </button>
            <a id="btn-lightbox-download" href="${img.src}" download="jizhi_chat_img_${Date.now()}" style="background:#2563eb; color:#ffffff; border:none; padding:8px 14px; border-radius:8px; font-size:12.5px; font-weight:700; text-decoration:none; box-shadow:0 4px 12px rgba(37,99,235,0.3); display:flex; align-items:center; gap:6px;">
              💾 下载原图
            </a>
            <button id="btn-lightbox-close" style="background:#475569; color:#ffffff; border:none; width:34px; height:34px; border-radius:50%; font-size:16px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center;">
              ✕
            </button>
          </div>
          <div style="max-width:90vw; max-height:85vh; display:flex; align-items:center; justify-content:center; cursor:default;" onclick="event.stopPropagation()">
            <img src="${img.src}" style="max-width:90vw; max-height:85vh; object-fit:contain; border-radius:10px; box-shadow:0 20px 40px rgba(0,0,0,0.5); border:1.5px solid rgba(255,255,255,0.2);">
          </div>
          <div style="margin-top:14px; font-size:12px; color:#94a3b8; letter-spacing:0.5px;">按 Esc 或点击任意空白处关闭</div>
        `;

        const closeBox = () => {
          box.remove();
          document.removeEventListener('keydown', handleKey);
        };

        const handleKey = (ev) => {
          if (ev.key === 'Escape') closeBox();
        };

        box.onclick = closeBox;
        box.querySelector('#btn-lightbox-close')?.addEventListener('click', closeBox);
        box.querySelector('#btn-lightbox-open-tab')?.addEventListener('click', () => {
          window.open(img.src, '_blank');
        });
        document.addEventListener('keydown', handleKey);
        document.body.appendChild(box);
      };
    });

    // ── 🌟 阶段二/阶段三动态协同操作栏 (在表情栏正上方) ──
    const actionBar = document.getElementById('chat-agent-action-bar');
    if (actionBar) {
      const s2 = state.stage2 || {};
      const curStage = state.currentStage;
      const membersList = Object.values(state.members || []);
      const totalCount = membersList.length || 3;
      const currUser = (window.app && window.app.authManager) ? window.app.authManager.getCurrentUser() : null;
      const myCode = state.currentUser || (currUser ? currUser.studentCode : '');
      const confs = Object.assign({}, state.stepConfirmations || {}, s2.confirmations || {});

      const isDoneHelper = (map) => {
        if (!map) return 0;
        return membersList.filter(m => {
          let fullUser = (typeof m === 'object') ? m : null;
          if (!fullUser && window.app && window.app.authManager && window.app.authManager.findUserByKey) {
            fullUser = window.app.authManager.findUserByKey(m);
          }
          const keys = [
            typeof m === 'string' ? m : null,
            m?.id, m?.studentCode, m?.username, m?.name,
            fullUser?.id, fullUser?.studentCode, fullUser?.username, fullUser?.name
          ].filter(Boolean).map(k => String(k).trim().toLowerCase());
          return keys.some(k => map[k] || map[String(k)]);
        }).length;
      };

      const isMyDoneHelper = (map) => {
        if (!map) return false;
        let fullUser = currUser;
        if (!fullUser && window.app && window.app.authManager && window.app.authManager.findUserByKey) {
          fullUser = window.app.authManager.findUserByKey(myCode);
        }
        const keys = [
          myCode, currUser?.id, currUser?.studentCode, currUser?.username, currUser?.name,
          fullUser?.id, fullUser?.studentCode, fullUser?.username, fullUser?.name
        ].filter(Boolean).map(k => String(k).trim().toLowerCase());
        return keys.some(k => map[k] || map[String(k)]);
      };

      const s2Subs = s2.meetingSubmissions || {};
      const s2SubCount = Object.keys(s2Subs).length;
      const isS2MeetingDone = s2SubCount >= totalCount && totalCount > 0;

      const s2Chats = state.chatLogs?.stage2 || [];
      const hasFinalChecklistSummary = s2Chats.some(m => m && m.text && (m.text.includes('二审修改落实决议') || m.text.includes('修改确认与写作冲刺') || m.text.includes('修改落实确认')));

      if (curStage === 'stage2') {
        if (s2.meetingStep === 'completed' || hasFinalChecklistSummary) {
          actionBar.style.display = 'none';
          actionBar.innerHTML = '';
        } else {
          actionBar.style.display = 'block';
          if (!isS2MeetingDone) {
            actionBar.innerHTML = `
              <button id="btn-s2-locked-notice" style="background:#f1f5f9; border:1px solid #cbd5e1; color:#94a3b8; padding:7px 18px; border-radius:18px; font-weight:800; font-size:12.5px; cursor:not-allowed; display:inline-flex; align-items:center; gap:6px; box-shadow:none;">
                🔒 请先全员参与【编辑会议】打卡 (${s2SubCount}/${totalCount} 人已打卡)
              </button>
            `;
            actionBar.querySelector('#btn-s2-locked-notice')?.addEventListener('click', () => {
              alert(`🔒 请先在正文上方点击【📢 参与【编辑会议】】完成半程自查打卡！\n\n当前打卡进度：${s2SubCount}/${totalCount} 人。\n全员打卡完成后，责任编辑将主持会议，届时方可点击总结。`);
            });
          } else if (!s2.meetingStep || s2.meetingStep === 'discussing_divergence' || s2.meetingStep === 'initial' || s2.meetingStep === 'discussing_agreement') {
            const count = isDoneHelper(confs.s2_managing);
            const isMe = isMyDoneHelper(confs.s2_managing);
            actionBar.innerHTML = `
              <button id="btn-s2-managing-summary" style="background:${isMe ? 'linear-gradient(135deg, #059669, #047857)' : 'linear-gradient(135deg, #d97706, #b45309)'}; border:none; color:white; padding:7px 18px; border-radius:18px; font-weight:800; font-size:12.5px; cursor:pointer; display:inline-flex; align-items:center; gap:6px; box-shadow:0 3px 10px rgba(217,119,6,0.25); transition:all 0.2s;">
                ${isMe ? `✅ 您已确认总结共识 (${count}/${totalCount} 等待组员)` : `🤝 讨论差不多了？让责任编辑总结 (${count}/${totalCount})`}
              </button>
            `;
            actionBar.querySelector('#btn-s2-managing-summary')?.addEventListener('click', () => {
              if (window.app && typeof window.app.handleS2ManagingSummary === 'function') {
                window.app.handleS2ManagingSummary();
              }
            });
          } else if (s2.meetingStep === 'discussing_checklist') {
            const count = isDoneHelper(confs.s2_reviewing);
            const isMe = isMyDoneHelper(confs.s2_reviewing);
            actionBar.innerHTML = `
              <button id="btn-s2-reviewing-summary" style="background:${isMe ? 'linear-gradient(135deg, #059669, #047857)' : 'linear-gradient(135deg, #059669, #047857)'}; border:none; color:white; padding:7px 18px; border-radius:18px; font-weight:800; font-size:12.5px; cursor:pointer; display:inline-flex; align-items:center; gap:6px; box-shadow:0 3px 10px rgba(5,150,105,0.25); transition:all 0.2s;">
                ${isMe ? `✅ 您已确认总结清单 (${count}/${totalCount} 等待组员)` : `📝 讨论差不多了？让审稿编辑总结 (${count}/${totalCount})`}
              </button>
            `;
            actionBar.querySelector('#btn-s2-reviewing-summary')?.addEventListener('click', () => {
              if (window.app && typeof window.app.handleS2ReviewingSummary === 'function') {
                window.app.handleS2ReviewingSummary();
              }
            });
          }
        }
      } else if (curStage === 'stage3') {
        const s3 = state.stage3 || {};
        const feedbacks = Array.isArray(s3.feedbackItems) ? s3.feedbackItems : [];
        const pendingInquiries = feedbacks.filter(f => f.role === 'opponent' && (!f.response || !f.response.trim()));
        const currentInquiry = pendingInquiries[0];

        if (currentInquiry) {
          const inqIndex = feedbacks.indexOf(currentInquiry);
          const inqLabel = inqIndex >= 1 ? `意见 ${inqIndex}` : '当前质询';
          const stepKey = `s3_inquiry_${inqIndex}`;
          const count = isDoneHelper(confs[stepKey]);
          const isMe = isMyDoneHelper(confs[stepKey]);

          actionBar.style.display = 'block';
          actionBar.innerHTML = `
            <button id="btn-s3-inquiry-summary" style="background:${isMe ? 'linear-gradient(135deg, #059669, #047857)' : 'linear-gradient(135deg, #d97706, #b45309)'}; border:none; color:white; padding:7px 18px; border-radius:18px; font-weight:800; font-size:12.5px; cursor:pointer; display:inline-flex; align-items:center; gap:6px; box-shadow:0 3px 10px rgba(217,119,6,0.25); transition:all 0.2s;">
              ${isMe ? `✅ 您已确认【${inqLabel}】(${count}/${totalCount} 等待组员)` : `💡 ${inqLabel} 讨论差不多了？帮我总结并填入 (${count}/${totalCount})`}
            </button>
          `;
          actionBar.querySelector('#btn-s3-inquiry-summary')?.addEventListener('click', () => {
            if (window.app && typeof window.app.handleS3InquirySummary === 'function') {
              window.app.handleS3InquirySummary(currentInquiry);
            }
          });
        } else {
          // 全部答辩定案后直接收起隐藏
          actionBar.style.display = 'none';
          actionBar.innerHTML = '';
        }
      } else {
        actionBar.style.display = 'none';
        actionBar.innerHTML = '';
      }
    }
  }

  // 🛡️ Fail-safe compatibility exports
  function renderDefenseRoom() {}
  function renderWordEditor() {}
  function renderStageNavigation() {}
  function renderStudentWorkspace() {}
  function renderSurveyModal() {}
  function setupChatAtMentionMenu() {}
  function updateContributionUi() {}
  function showSurveyModalIfApplicable() {}

  // 🚀 全局事件委托守护：确保初稿确认、范文库、编辑会议三大按钮任何时刻 100% 灵敏响应
  if (typeof document !== 'undefined' && !window._stage2GlobalClickDelegated) {
    window._stage2GlobalClickDelegated = true;
    document.addEventListener('click', (e) => {
      // 1. 初稿确认按钮
      const btnDraft = e.target.closest('#btn-confirm-stage2-draft');
      if (btnDraft) {
        e.preventDefault();
        e.stopPropagation();
        if (window.app && window.app.handlers && typeof window.app.handlers.onConfirmStage2Draft === 'function') {
          window.app.handlers.onConfirmStage2Draft();
        } else if (window.app && typeof window.app.onConfirmStage2Draft === 'function') {
          window.app.onConfirmStage2Draft();
        }
        return;
      }

      // 2. 参考范文库按钮
      const btnCase = e.target.closest('#btn-show-case');
      if (btnCase) {
        e.preventDefault();
        e.stopPropagation();
        if (window.app && window.app.handlers && typeof window.app.handlers.onOpenCaseModal === 'function') {
          window.app.handlers.onOpenCaseModal();
        } else if (window.app && typeof window.app.showReferencePapersModal === 'function') {
          window.app.showReferencePapersModal();
        }
        return;
      }

      // 3. 编辑会议打卡/查阅按钮
      const btnMeeting = e.target.closest('#btn-trigger-meeting-pills') || e.target.closest('#btn-trigger-meeting');
      if (btnMeeting) {
        e.preventDefault();
        e.stopPropagation();
        if (window.app && window.app.handlers && typeof window.app.handlers.onOpenMeetingModal === 'function') {
          window.app.handlers.onOpenMeetingModal();
        } else if (window.app && typeof window.app.showMeetingModal === 'function') {
          window.app.showMeetingModal();
        }
        return;
      }
    }, true); // Use capture phase so nothing can swallow the click!
  }

  /* ==========================================================================
     MODULE: app.js
     ========================================================================== */
  /**
   * JIZHI (集智) Platform - Main Application Coordinator & Lifecycle
   * Standard ES Module (ESM)
   */


  // Make renderChat available on window for sync callbacks and listen to global IME composition
  if (typeof window !== "undefined") {
    window.renderChat = renderChat;
    window.addEventListener('compositionstart', () => { window._isGlobalComposing = true; }, true);
    window.addEventListener('compositionend', () => { window._isGlobalComposing = false; }, true);
    // 🛡️ Safari 兜底：合成被 blur/Esc 打断时 compositionend 可能不触发，导致标志永久卡 true（进而跳过重渲染）
    window.addEventListener('blur', () => { window._isGlobalComposing = false; }, true);
  }

  /* ==========================================================================
     9. APP CONTROLLER (GROUP-SCOPED ISOLATION)
     ========================================================================== */
  class App {
    constructor() {
      this.authManager = new AuthManager();
      this.state = JSON.parse(JSON.stringify(InitialState));
      this.studentMsgCountSinceLastAgent = 0;

      const storedTaskId = sessionStorage.getItem('jizhi_active_task_id') || localStorage.getItem('jizhi_active_task_id');
      if (storedTaskId) this.state.activeTaskId = storedTaskId;

      const storedClassId = sessionStorage.getItem('jizhi_active_student_class_id') || localStorage.getItem('jizhi_active_student_class_id');
      if (storedClassId) this.state.activeStudentClassId = storedClassId;

      const storedViewMode = sessionStorage.getItem('jizhi_student_view_mode') || localStorage.getItem('jizhi_student_view_mode');
      this.state.studentViewMode = (storedViewMode === 'workspace' && storedTaskId) ? 'workspace' : 'task_list';

      // 🛡️ 教师端状态持久化恢复：刷新后精准停留在上次选中的班级/小组/Tab
      const storedTeacherClassId = sessionStorage.getItem('jizhi_teacher_active_class_id') || localStorage.getItem('jizhi_teacher_active_class_id');
      if (storedTeacherClassId) this.state.activeClassId = storedTeacherClassId;
      const storedTeacherGroupId = sessionStorage.getItem('jizhi_teacher_active_group_id') || localStorage.getItem('jizhi_teacher_active_group_id');
      if (storedTeacherGroupId) this.state.activeMonitorGroupId = storedTeacherGroupId;
      const storedTeacherTab = sessionStorage.getItem('jizhi_teacher_active_tab') || localStorage.getItem('jizhi_teacher_active_tab');
      if (storedTeacherTab) this.state.teacherActiveTab = storedTeacherTab;

      const user = this.authManager.getCurrentUser();
      const effectiveClassId = (this.authManager ? this.authManager.getEffectiveStudentClassId(user, this.state.activeTaskId) : (this.state.activeStudentClassId || user?.classId || null));
      const activeGroupObj = this.authManager.getStudentActiveGroup(user, effectiveClassId);
      const currentGroupId = activeGroupObj?.id || user?.groupId || this.state.activeGroupId || null;
      this.loadGroupState(currentGroupId);

      this.cloudSyncEngine = new CloudSyncEngine(this);
      this.initGlobalBroadcastListener();
      this.initTimer();
      this.renderMain();

      // 🛡️ 全局事件委托：确保无论阶段一如何局部刷新，点击“一键生成公约草案”/“投票”/“签署” 100% 触发
      document.addEventListener('click', (e) => {
        const genBtn = e.target.closest('#btn-generate-contract-draft');
        if (genBtn && this.handleAiGenerateContract) {
          this.handleAiGenerateContract();
          return;
        }
        const voteBtn = e.target.closest('.vote-btn:not([disabled])');
        if (voteBtn && voteBtn.dataset.id) {
          this.handleVoteCast(voteBtn.dataset.id);
          return;
        }
      });

      // 启动时立刻从 MySQL 服务器拉取最新全局教务元数据与小组协同数据
      (async () => {
        try {
          await this.authManager.pullGlobalMeta();
          if (this.cloudSyncEngine) {
            this.cloudSyncEngine.updateScopeKeys();
            this.cloudSyncEngine.pullFromServer();
          }
          if (user && (user.role === 'student' || user.isStudent)) {
            if (this.state.studentViewMode === 'task_list') {
              this.renderMain();
            } else {
              this.checkUnreadAnnouncements();
            }
          }
        } catch (e) {}
      })();
    }

    initGlobalBroadcastListener() {
      if ('BroadcastChannel' in window) {
        try {
          if (window._appGlobalBc) { try { window._appGlobalBc.close(); } catch (e) {} }
          window._appGlobalBc = new BroadcastChannel('jizhi_global_events');
          window._appGlobalBc.onmessage = (e) => {
            if (!e.data) return;
            const user = this.authManager ? this.authManager.getCurrentUser() : null;
            const isStudent = user && (user.role === 'student' || user.isStudent);
            if (!isStudent) return;

            // 1. 教师发布全新任务
            if (e.data.type === 'task_created' && e.data.task) {
              const t = e.data.task;
              showGlobalBannerNotice('📢 教师发布新任务', `任课教师刚刚发布了全新写作任务《${escapeHtml(t.title || '新任务')}》！`, 'info', 8000);
              if (this.state.studentViewMode === 'task_list') {
                this.renderMain();
              }
            }

            // 2. 教师删除/撤销任务
            if (e.data.type === 'task_deleted') {
              const delTaskId = e.data.taskId;
              const delTaskTitle = e.data.title || '写作任务';
              // 若学生刚好在被删除的任务工作台中
              if (this.state.studentViewMode === 'workspace' && this.state.activeTaskId === delTaskId) {
                this.showTaskRevokedModal(delTaskTitle);
              } else if (this.state.studentViewMode === 'task_list') {
                this.renderMain();
              }
            }

            // 3. 教师发布教学通知（秒级拉取并在工作台即时弹出）
            if (e.data.type === 'announcement_created') {
              if (this.authManager && this.authManager.pullGlobalMeta) {
                this.authManager.pullGlobalMeta().then(() => {
                  if (this.state.studentViewMode === 'workspace') {
                    this.checkUnreadAnnouncements();
                  }
                  this.renderHeader();
                }).catch(() => {});
              }
            }

            // 3.5 教师删除教学通知（秒级清除学生端本地通知与更新通知红点）
            if (e.data.type === 'announcement_deleted') {
              const delAnnId = e.data.annId;
              let localAnns = this.authManager ? this.authManager.getAnnouncements() : [];
              localAnns = localAnns.filter(a => a.id !== delAnnId);
              localStorage.setItem(STORAGE_KEY_ANNOUNCEMENTS, JSON.stringify(localAnns));
              this.renderHeader();
            }

            // 4. 教师更新问卷配置
            if (e.data.type === 'survey_updated') {
              if (this.authManager && this.authManager.pullGlobalMeta) {
                this.authManager.pullGlobalMeta().catch(() => {});
              }
            }
          };
        } catch (e) {}
      }
    }

    loadGroupState(groupId = 'group_1') {
      const defaultState = JSON.parse(JSON.stringify(InitialState));
      const user = this.authManager ? this.authManager.getCurrentUser() : null;
      const isTeacher = user && (user.isTeacher || user.role === 'teacher');
      const isStudent = user && (user.role === 'student' || user.isStudent);
      const effectiveClassId = (isTeacher ? this.state.activeClassId : this.state.activeStudentClassId) || user?.classId || null;

      // 🛡️ 核心守卫：学生处于任务大厅模式时，必须保持 activeTaskId 为 null，绝不能强塞默认任务 ID
      if (isStudent && this.state.studentViewMode === 'task_list') {
        this.state.activeTaskId = null;
        this.state.activeTaskTitle = null;
        return;
      }

      let taskId = this.state.activeTaskId || (this.cloudSyncEngine ? this.cloudSyncEngine.taskId : null);
      if (!taskId && isTeacher) {
        taskId = `task_${effectiveClassId}_default`;
      }
      this.state.activeTaskId = taskId;
      this.state.members = this.authManager.getGroupMembersForWorkspace(groupId, effectiveClassId);

      // 🛡️ 优先从单一轻量工作台快照恢复（仅记录当前组，0ms秒开上屏且绝不超5MB配额）
      let cached = null;
      try {
        const raw = sessionStorage.getItem('jizhi_active_workspace_snap') || localStorage.getItem('jizhi_active_workspace_snap');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.classId === effectiveClassId && parsed.taskId === taskId && parsed.groupId === groupId) {
            cached = parsed;
          }
        }
      } catch (e) {}

      if (cached) {
        this.state.chatLogs = cached.chatLogs || { stage1: [], stage2: [], stage3: [] };
        this.state.stage1 = cached.stage1 || JSON.parse(JSON.stringify(defaultState.stage1));
        this.state.stage2 = cached.stage2 || JSON.parse(JSON.stringify(defaultState.stage2));
        this.state.stage3 = cached.stage3 || JSON.parse(JSON.stringify(defaultState.stage3));
        this.state.presence = cached.presence || this.state.presence || {};
        this.state.currentStage = cached.currentStage || 'stage1';
        this.state.groupMaxStage = cached.currentStage || 'stage1';
        this.state.isFinalSubmitted = (cached.isFinalSubmitted !== undefined) ? !!cached.isFinalSubmitted : false;
      } else {
        // 🛡️ 切换到新组时，第1行代码立刻清空内存残留消息，彻底杜绝上一组的聊天残影
        this.state.chatLogs = { stage1: [], stage2: [], stage3: [] };
        this.state.stage1 = JSON.parse(JSON.stringify(defaultState.stage1));
        this.state.stage2 = JSON.parse(JSON.stringify(defaultState.stage2));
        this.state.stage3 = JSON.parse(JSON.stringify(defaultState.stage3));
        this.state.currentStage = 'stage1';
        this.state.groupMaxStage = 'stage1';
        this.state.isFinalSubmitted = false;
      }

      // 立即触发云端全量拉取当前任务对应小组的最新权威真实数据
      if (this.cloudSyncEngine) {
        this.cloudSyncEngine.groupId = groupId;
        this.cloudSyncEngine.taskId = taskId;
        this.cloudSyncEngine._lastKnownRevisionId = 0; // 重置 revisionId，确保拉取到当前任务真实数据
        this.cloudSyncEngine._hasPulledGlobal = false;
        this.cloudSyncEngine.isInitialPullDone = false;
        this.cloudSyncEngine.updateScopeKeys();
        this.cloudSyncEngine.pullFromServer();
      }
    }

    initPresetMessagesForGroup(groupId) {
      this.state.chatLogs = { stage1: [], stage2: [], stage3: [] };
    }

    getEffectiveGroupId() {
      const user = this.authManager ? this.authManager.getCurrentUser() : null;
      const isTeacher = user && (user.isTeacher || user.role === 'teacher');
      if (isTeacher) {
        return this.state.activeMonitorGroupId || this.state.activeGroupId || null;
      }
      const effectiveClassId = (this.authManager ? this.authManager.getEffectiveStudentClassId(user, this.state.activeTaskId) : (this.state.activeStudentClassId || user?.classId || null));
      const activeGroupObj = this.authManager ? this.authManager.getStudentActiveGroup(user, effectiveClassId) : null;
      return activeGroupObj?.id || user?.groupId || this.state.activeGroupId || null;
    }

    saveGroupState(groupId) {
      // 🛡️ 单一 Key 覆盖轻量快照：仅缓存当前正在操作的 1 个工作台，保障 0ms 秒开，绝不堆积碎片
      try {
        const user = this.authManager ? this.authManager.getCurrentUser() : null;
        const isTeacher = user && (user.isTeacher || user.role === 'teacher');
        const effectiveClassId = (isTeacher ? this.state.activeClassId : this.state.activeStudentClassId) || user?.classId || null;
        const snap = {
          classId: effectiveClassId,
          taskId: this.state.activeTaskId,
          groupId: groupId,
          chatLogs: this.state.chatLogs,
          stage1: this.state.stage1,
          stage2: this.state.stage2,
          stage3: this.state.stage3,
          currentStage: this.state.currentStage,
          groupMaxStage: this.state.groupMaxStage,
          presence: this.state.presence,
          isFinalSubmitted: this.state.isFinalSubmitted,
          updatedAt: Date.now()
        };
        const snapStr = JSON.stringify(snap);
        sessionStorage.setItem('jizhi_active_workspace_snap', snapStr);
        localStorage.setItem('jizhi_active_workspace_snap', snapStr);
      } catch (e) {}
    }

    // 💬 精准单条发信入库方法（确保任何来源的消息 100% 毫秒级写入 MySQL chat_messages 实体表）
    sendSingleChatMessage(msg, stage = null) {
      if (!msg) return;
      const targetStage = stage || this.state.currentStage || 'stage1';

      // 🛡️ 智能体阶段物理隔离铁律：
      // 阶段一仅允许 auctioneer；阶段二仅允许 managingEditor/reviewingEditor；阶段三仅允许 proponent/opponent/neutral
      const sender = msg.sender;
      if (['auctioneer', 'managingEditor', 'reviewingEditor', 'proponent', 'opponent', 'neutral'].includes(sender)) {
        if (targetStage === 'stage1' && sender !== 'auctioneer') {
          console.warn(`[Stage Guard] 拦截非阶段一智能体 ${sender} 试图在 stage1 发言`);
          return;
        }
        if (targetStage === 'stage2' && !['managingEditor', 'reviewingEditor'].includes(sender)) {
          console.warn(`[Stage Guard] 拦截非阶段二智能体 ${sender} 试图在 stage2 发言`);
          return;
        }
        if (targetStage === 'stage3' && !['proponent', 'opponent', 'neutral'].includes(sender)) {
          console.warn(`[Stage Guard] 拦截非阶段三智能体 ${sender} 试图在 stage3 发言`);
          return;
        }
      }

      const user = this.authManager ? this.authManager.getCurrentUser() : null;
      const isTeacher = user && (user.isTeacher || user.role === 'teacher');
      const effectiveClassId = (isTeacher ? this.state.activeClassId : this.state.activeStudentClassId) || user?.classId || null;
      const groupId = this.getEffectiveGroupId();
      let taskId = this.state.activeTaskId || (this.cloudSyncEngine ? this.cloudSyncEngine.taskId : `task_${effectiveClassId}_default`);
      if (!taskId || taskId === 'task_default') {
        taskId = `task_${effectiveClassId}_default`;
      }

      const payload = {
        id: msg.id || ('msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6)),
        classId: effectiveClassId,
        groupId: groupId,
        taskId: taskId,
        stage: targetStage,
        sender: msg.sender,
        senderName: msg.senderName || '',
        text: msg.text,
        timestamp: msg.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        _timeMs: msg._timeMs || Date.now()
      };

      try {
        if (this.cloudSyncEngine && this.cloudSyncEngine.bc) {
          this.cloudSyncEngine.bc.postMessage({ chatMessage: payload, stage: targetStage });
        }
      } catch (e) {}

      try {
        fetch(`sync.php?action=send_chat&groupId=${encodeURIComponent(groupId)}&taskId=${encodeURIComponent(taskId)}&classId=${encodeURIComponent(effectiveClassId)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).catch(() => {});
      } catch (e) {}
    }

    syncChatLogs(specifiedMsg = null, stage = null) {
      const targetStage = stage || this.state.currentStage || 'stage1';
      if (specifiedMsg) {
        if (Array.isArray(specifiedMsg)) {
          specifiedMsg.forEach(m => this.sendSingleChatMessage(m, targetStage));
        } else {
          this.sendSingleChatMessage(specifiedMsg, targetStage);
        }
        return;
      }
      const logs = (this.state.chatLogs && this.state.chatLogs[targetStage]) ? this.state.chatLogs[targetStage] : [];
      const latestMsg = logs[logs.length - 1];

      if (latestMsg) {
        this.sendSingleChatMessage(latestMsg, targetStage);
      }
    }

    syncStage1() {
      const groupId = this.getEffectiveGroupId();
      this.saveGroupState(groupId);
      if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
    }

    syncStage2() {
      const groupId = this.getEffectiveGroupId();
      this.saveGroupState(groupId);
      if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
    }

    syncStage3() {
      const groupId = this.getEffectiveGroupId();
      this.saveGroupState(groupId);
      if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
    }

    renderPresenceCursors() {
      const stage = this.state.currentStage || 'stage1';
      if (stage === 'stage1') renderPresencePills('stage1-canvas', this.state);
      else if (stage === 'stage2') renderRemoteCursors('stage2-word-editor', this.state);
      else if (stage === 'stage3') renderRemoteCursors('stage3-word-editor', this.state);
      try { renderChat(this.state); } catch (e) {}
    }

    updateContributionUi() {
      // 动态刷新下方 SSRL 贡献度条
      const contribLabelsContainer = document.getElementById('stage2-contrib-labels');
      const contribBarsContainer = document.getElementById('stage2-contrib-bars');
      if (contribLabelsContainer && contribBarsContainer) {
        const membersList = Object.values(this.state.members || {});
        const contribs = (this.state.stage2 && this.state.stage2.memberContributions) ? this.state.stage2.memberContributions : {};

        const getVal = (m) => {
          if (!m) return 0;
          const keys = [m.studentCode, m.id, m.username, m.name].filter(Boolean);
          let maxVal = 0;
          for (const k of keys) {
            if (contribs[k] !== undefined && Number(contribs[k]) > maxVal) {
              maxVal = Number(contribs[k]);
            }
          }
          return maxVal;
        };

        let rawTotal = 0;
        membersList.forEach(m => { rawTotal += getVal(m); });

        const docLen = (this.state.stage2 && this.state.stage2.unifiedContent) ? this.state.stage2.unifiedContent.length : 0;
        contribLabelsContainer.innerHTML = membersList.map((m) => {
          const rawVal = getVal(m);
          const pct = rawTotal > 0 ? Math.round((rawVal / rawTotal) * 100) : 0;
          const displayWords = (docLen > 0 && rawTotal > 0) ? Math.round((rawVal / rawTotal) * docLen) : rawVal;
          return `<span style="color:${rawVal > 0 ? (m.color || '#2563eb') : '#94a3b8'}; font-weight:700;">● ${m.name}: ${pct}% (${displayWords}字)</span>`;
        }).join('');

        if (rawTotal === 0) {
          contribBarsContainer.innerHTML = `<div style="width:100%; height:8px; background:#f8fafc; border-radius:4px; display:flex; align-items:center; justify-content:center; font-size:9.5px; color:#94a3b8; font-weight:600;">⏳ 在 Etherpad 中撰写或修改正文将实时累计真实贡献</div>`;
        } else {
          contribBarsContainer.innerHTML = membersList.map((m) => {
            const rawVal = getVal(m);
            const pct = rawTotal > 0 ? Math.round((rawVal / rawTotal) * 100) : 0;
            return `<div class="contrib-segment" style="width:${pct}%; background:${m.color || '#2563eb'}; transition:width 0.8s ease-in-out;" title="${m.name}: ${pct}% (${rawVal}字)"></div>`;
          }).join('');
        }
      }
      this.renderPresenceCursors();
    }

    syncStageChange(stage) {
      const user = this.authManager.getCurrentUser();
      const groupId = (user && user.groupId) ? user.groupId : (this.state.activeMonitorGroupId || this.state.activeGroupId || null);
      this.state.currentStage = stage;
      this.saveGroupState(groupId);
      if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
    }

    initGlobalPresenceHeartbeat() {
      // 🌿 实时轻量在线心跳：每 4 秒自动刷新当前在线时间戳，走专属 presence_ping 物理隔离
      const doPing = () => {
        const currentUser = this.authManager ? this.authManager.getCurrentUser() : null;
        if (currentUser && currentUser.role === 'student' && this.state.studentViewMode === 'workspace') {
          if (!this.state.presence) this.state.presence = {};
          const myKeys = [currentUser.id, currentUser.studentCode, currentUser.username, currentUser.name].filter(Boolean);
          const now = Date.now();

          myKeys.forEach(k => {
            this.state.presence[k] = { lastSeen: now, updatedAt: now };
          });
          this.renderPresenceCursors();
        }
      };
      doPing();
      setInterval(doPing, 10000);
    }

    initTimer() {
      this.initGlobalPresenceHeartbeat();
      setInterval(() => {
        // 🎧 静默期情绪安抚定时巡检（即便无人发言也按周期触发，见审查 #45）
        this.checkEmotionComfort();
        const currentUser = this.authManager.getCurrentUser();
        if (currentUser && currentUser.role === 'student' && this.state.timer.isRunning) {
          const nowMs = Date.now();
          // 统一物理时间戳计秒：全组成员按首次开启时间统一对齐，杜绝迟到成员或刷新页面导致的时间差
          if (!this.state.timer.startTimestamp) {
            this.state.timer.startTimestamp = nowMs;
          }
          const speed = this.state.timer.speed || 1;
          const physicalElapsedSec = Math.floor((nowMs - this.state.timer.startTimestamp) / 1000);
          this.state.timer.elapsedSeconds = Math.max(0, Math.floor(physicalElapsedSec * speed));

          const currentStage = this.state.currentStage || 'stage1';

          // ⏰ 全局进度与阶段间转场催促 + 阶段二智能体保底机制 (由在场学号最小的在线成员单点触发，杜绝多人并发 AI 消息风暴)
          const myCode = this.state.currentUser || (currentUser ? (currentUser.studentCode || currentUser.id) : 'A');
          const activeTaskId = this.state.activeTaskId || null;
          const currentGroupId = (currentUser && currentUser.groupId) ? currentUser.groupId : (this.state.activeMonitorGroupId || this.state.activeGroupId || null);
          const allTasks = (this.authManager) ? this.authManager.getTasks() : [];
          const curTask = allTasks.find(t => t.id === activeTaskId);
          const totalDurationMin = (curTask && curTask.durationMinutes) ? Number(curTask.durationMinutes) : 150;
          const totalDurationSec = totalDurationMin * 60;
          const elapsedSec = (this.state.timer && this.state.timer.elapsedSeconds) ? this.state.timer.elapsedSeconds : 0;
          const remainingSec = Math.max(0, totalDurationSec - elapsedSec);
          const remainingMin = remainingSec / 60;
          const totalProgress = (totalDurationSec > 0) ? (elapsedSec / totalDurationSec) : 0;

          const membersList = Object.values(this.state.members || {});
          const presenceMap = this.state.presence || {};
          const onlineMembers = membersList.filter(m => {
            const p = presenceMap[m.studentCode] || presenceMap[m.id];
            return p && (nowMs - (p.updatedAt || 0) < 180000);
          });
          const primaryMember = (onlineMembers.length > 0)
            ? [...onlineMembers].sort((a, b) => (a.studentCode || a.id || '').localeCompare(b.studentCode || b.id || ''))[0]
            : (membersList.length > 0 ? [...membersList].sort((a, b) => (a.studentCode || a.id || '').localeCompare(b.studentCode || b.id || ''))[0] : null);
          const isPrimaryGuardian = primaryMember && (primaryMember.studentCode === myCode || primaryMember.id === myCode);

          if (isPrimaryGuardian) {
            const allChatLogsList = Object.values(this.state.chatLogs || {}).flat();

            // ── 0. 【阶段一守卫：3分钟静默破冰、6分钟无提案强催促(点名)、提案全齐先交流】 ──
            const isContractConfirmed = !!(this.state.stage1 && this.state.stage1.contract && this.state.stage1.contract.isConfirmed);
            if (currentStage === 'stage1' && !isContractConfirmed) {
              const s1 = this.state.stage1 || {};
              const propList = s1.proposals || [];
              const propCount = propList.length;
              const unsubmittedMembers = membersList.filter(m => !propList.some(p => p.author === m.id || p.author === m.studentCode || p.author === m.username || (m.name && p.authorName === m.name)));
              const unsubmittedNames = unsubmittedMembers.map(m => m.name || m.username || m.studentCode).join('、');

              // ① 开场 3 分钟未动笔静默破冰（紧扣研究方向与任务要求）
              if (!this.state.s1_3minBreakSent && elapsedSec >= 180 && propCount === 0) {
                this.state.s1_3minBreakSent = true;
                const msg3Min = {
                  sender: 'auctioneer',
                  senderName: '头脑风暴 · 学术拍卖师',
                  text: `🎪 【学术拍卖师·破冰启发】：头脑风暴已经开始 3 分钟啦～请大家紧扣本次任务要求与给定的研究方向，结合具体的实践情境或核心问题拟定选题；有想法了就随时在左侧【提交提案】卡片写下你的题目与设想！`,
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  _timeMs: nowMs
                };
                if (!this.state.chatLogs.stage1) this.state.chatLogs.stage1 = [];
                this.state.chatLogs.stage1.push(msg3Min);
                this.syncChatLogs();
                renderChat(this.state);
              }

              // ② 6 分钟全组无提案强催促（精准点名）
              if (!this.state.s1_6minUrgeSent && elapsedSec >= 360 && propCount === 0 && unsubmittedNames) {
                this.state.s1_6minUrgeSent = true;
                const msg6Min = {
                  sender: 'auctioneer',
                  senderName: '头脑风暴 · 学术拍卖师',
                  text: `🎪 【学术拍卖师·提案催促】：头脑风暴时间已进行 6 分钟，当前组内尚未产生任何提案！请【${unsubmittedNames}】同学抓紧结合任务要求，在左侧卡片提交各自的初拟方案，集齐后我们将开启全组研讨！`,
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  _timeMs: nowMs
                };
                if (!this.state.chatLogs.stage1) this.state.chatLogs.stage1 = [];
                this.state.chatLogs.stage1.push(msg6Min);
                this.syncChatLogs();
                renderChat(this.state);
              }

              // ③ 提案全齐但尚未投票：提示先交流 1~2 分钟再投票
              if (!this.state.s1_allPropsGatheredSent && propCount >= membersList.length && propCount > 0) {
                this.state.s1_allPropsGatheredSent = true;
                const msgPropsAll = {
                  sender: 'auctioneer',
                  senderName: '头脑风暴 · 学术拍卖师',
                  text: `🎪 【学术拍卖师·提案集齐与研讨引导】：太棒了！全组成员的提案均已全部集齐！请大家先在讨论区围绕各自提案的创新亮点与研究可行性交流讨论 1~2 分钟，充分了解彼此想法后，点击左侧卡片为你最支持的方案投出关键的一票！`,
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  _timeMs: nowMs
                };
                if (!this.state.chatLogs.stage1) this.state.chatLogs.stage1 = [];
                this.state.chatLogs.stage1.push(msgPropsAll);
                this.syncChatLogs();
                renderChat(this.state);
              }
            }

            // ── 1. 【20% 时间节点：阶段一超时转场强通牒】(阶段一标准规划占 10%，到 20% 属于严重超时转场通牒 · 归属拍卖师 · 严格全场仅 1 次) ──
            if (!this.state.gate20TriggeredMap) this.state.gate20TriggeredMap = {};
            const s1GateMsgId = `msg_gate_s1_${activeTaskId}_${currentGroupId}_transfer`;
            const s1AlreadySent = !!this.state.gate20TriggeredMap[activeTaskId] ||
              allChatLogsList.some(m => m && (m.id === s1GateMsgId || (m.text && (m.text.includes('转场通牒') || m.text.includes('阶段一转场提示') || m.text.includes('阶段一选题研讨已达 20% 极限门限')))));

            const isS1Due = (totalProgress >= 0.20 && elapsedSec >= 120);

            if (isS1Due && currentStage === 'stage1' && !isContractConfirmed && !s1AlreadySent) {
              this.state.gate20TriggeredMap[activeTaskId] = true;
              const msgStage1 = {
                id: s1GateMsgId,
                sender: 'auctioneer',
                senderName: '学术选题 · 拍卖师',
                text: `🎪 【拍卖师·转场通牒】：全场时间已达 20% 极限节点（阶段一标准规划为 10%，当前已超时）！\n👉 请全员立刻在左侧公约卡片点击【签署确认】，全员签署后立即进入【阶段二：学术编辑部】开始动笔写作，留足写作与质检时间！`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                _timeMs: nowMs
              };
              if (!this.state.chatLogs.stage1) this.state.chatLogs.stage1 = [];
              this.state.chatLogs.stage1.push(msgStage1);
              this.syncChatLogs();
              renderChat(this.state);
            }

            // ── 2. 【90% 时间节点：阶段二到期转场答辩提示】(总时间 90% 节点 · 归属责任编辑 · 严格全场仅 1 次) ──
            if (!this.state.gate90TriggeredMap) this.state.gate90TriggeredMap = {};
            const gate90MsgId = `msg_gate_transfer_${activeTaskId}_${currentGroupId}`;
            const gate90AlreadySent = !!this.state.gate90TriggeredMap[activeTaskId] ||
              allChatLogsList.some(m => m && (m.id === gate90MsgId || (m.text && (m.text.includes('责任编辑·转场提示') || m.text.includes('正文起草时间已达 90% 节点')))));

            const isTransferDue = (totalProgress >= 0.90 || remainingMin <= 10.0);

            if (isTransferDue && !gate90AlreadySent && currentStage !== 'stage3') {
              this.state.gate90TriggeredMap[activeTaskId] = true;
              let sender90 = (currentStage === 'stage1') ? 'auctioneer' : 'managingEditor';
              let text90 = (currentStage === 'stage1')
                ? `🎪 【拍卖师·紧急转场通牒】：全场时间已达 90%（剩余最后约 ${Math.ceil(remainingMin)} 分钟）！请全员立刻在公约卡片点击【签署确认】，直接进入写作与答辩！`
                : `🤝 【责任编辑·转场提示】：阶段二正文起草时间已达 90% 节点（写作预定时间已用完，全场仅剩最后约 ${Math.ceil(remainingMin)} 分钟）！请小组成员抓紧完成【初稿确认】，进入【🎓 阶段三：答辩擂台】，留足时间完成学术答辩与终稿完善！`;

              const msg90 = {
                id: gate90MsgId,
                sender: sender90,
                senderName: (sender90 === 'auctioneer') ? '学术选题 · 拍卖师' : '协同调度 · 责任编辑',
                text: text90,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                _timeMs: nowMs
              };
              if (!this.state.chatLogs[currentStage]) this.state.chatLogs[currentStage] = [];
              this.state.chatLogs[currentStage].push(msg90);
              this.syncChatLogs();
              renderChat(this.state);
            }

            // ── 3. 【95% 时间节点：阶段三答辩收尾与进入终稿修改提示】(总时间 95% 节点 · 归属中间委员 · 严格全场仅 1 次) ──
            if (!this.state.gateFinalPolishTriggeredMap) this.state.gateFinalPolishTriggeredMap = {};
            const gatePolishMsgId = `msg_gate_final_polish_${activeTaskId}_${currentGroupId}`;
            const gatePolishAlreadySent = !!this.state.gateFinalPolishTriggeredMap[activeTaskId] ||
              allChatLogsList.some(m => m && (m.id === gatePolishMsgId || (m.text && (m.text.includes('终稿修改提示') || m.text.includes('全场时间已达 95%')))));

            const isPolishDue = (totalProgress >= 0.95 || remainingMin <= 5.0);

            if (isPolishDue && currentStage === 'stage3' && !this.state.isFinalSubmitted && !gatePolishAlreadySent) {
              this.state.gateFinalPolishTriggeredMap[activeTaskId] = true;
              const msgPolish = {
                id: gatePolishMsgId,
                sender: 'neutral',
                senderName: '答辩委员会主席 · 中间委员',
                text: `🟡 【中间委员·终稿修改提示】：全场时间已达 95%（剩余最后约 ${Math.ceil(remainingMin)} 分钟）！\n👉 请小组成员抓紧收尾答辩，把答辩商定出的修改结论落实到【修改论文终稿】正文中，做好最后的通读核对与细节润色！`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                _timeMs: nowMs
              };
              if (!this.state.chatLogs.stage3) this.state.chatLogs.stage3 = [];
              this.state.chatLogs.stage3.push(msgPolish);
              this.syncChatLogs();
              renderChat(this.state);
            }

            // ── 4. 【最后 3 分钟节点：防漏交终稿紧急警报】(全场剩余 <= 3 分钟 · 归属中间委员 · 严格全场仅 1 次) ──
            if (!this.state.gate95TriggeredMap) this.state.gate95TriggeredMap = {};
            const gate95MsgId = `msg_gate_final_submit_${activeTaskId}_${currentGroupId}`;
            const gate95AlreadySent = !!this.state.gate95TriggeredMap[activeTaskId] ||
              allChatLogsList.some(m => m && (m.id === gate95MsgId || (m.text && (m.text.includes('最后提交警报') || m.text.includes('仅剩最后 3 分钟') || m.text.includes('终稿警报')))));

            const isFinalSubmitDue = (remainingSec <= 180 || remainingMin <= 3.0);

            if (isFinalSubmitDue && !this.state.isFinalSubmitted && !gate95AlreadySent) {
              this.state.gate95TriggeredMap[activeTaskId] = true;
              const msg95 = {
                id: gate95MsgId,
                sender: 'neutral',
                senderName: '答辩委员会主席 · 中间委员',
                text: `🚨 【中间委员·最后提交警报】：距任务总截止时间仅剩最后 3 分钟！请全组立即在上方点击【📤 提交论文终稿】按钮完成最终大作业交付，防止超时漏交！`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                _timeMs: nowMs
              };
              const currentStageKey = this.state.currentStage || 'stage3';
              if (!this.state.chatLogs[currentStageKey]) this.state.chatLogs[currentStageKey] = [];
              this.state.chatLogs[currentStageKey].push(msg95);
              this.syncChatLogs();
              renderChat(this.state);
            }
          }

          if (this.state.studentViewMode === 'workspace') {
            // ⚡ 快照已每 2 秒天然同步通知与文献，此处仅保留 20 秒轻量静默兜底
            if (!this._studentWorkspacePollTick) this._studentWorkspacePollTick = 0;
            this._studentWorkspacePollTick++;
            if (this._studentWorkspacePollTick % 20 === 0) {
              if (this.authManager && this.authManager.pullGlobalMeta) {
                this.authManager.pullGlobalMeta().then(() => {
                  // 1. 若当前屏幕正打开的通知已被教师在后台删除，立即自动关闭该弹窗
                  const openAnnModal = document.querySelector('.modal-announcement-popup');
                  if (openAnnModal) {
                    const openAnnId = openAnnModal.dataset.annId;
                    const allCurrentAnns = this.authManager.getAnnouncements();
                    if (openAnnId && !allCurrentAnns.some(a => a.id === openAnnId)) {
                      openAnnModal.remove();
                    }
                  }

                  // 2. 检查是否有属于当前任务/班级/小组的新发布未读通知
                  if (!document.querySelector('.modal-overlay')) {
                    this.checkUnreadAnnouncements();
                  }
                }).catch(() => {});
              }
            }

            renderHeader(
              this.state, currentUser, this.authManager.getAnnouncements(),
              (s) => this.switchStage(s), (sp) => this.setSpeed(sp),
              () => this.handleLogout(), () => this.switchToTeacherView(),
              () => this.showAnnouncementModal(), () => this.showQuestionnaireModal(),
              () => this.backToTaskList()
            );
          }
        }
      }, 1000);
    }

    renderMain() {
      const currentUser = this.authManager.getCurrentUser();
      const appEl = document.getElementById('app');

      if (!currentUser) {
        appEl.className = 'app-login-mode';
        renderLoginView(appEl, this.authManager, async () => {
          const u = this.authManager.getCurrentUser();
          const gId = u && u.groupId ? u.groupId : 'group_1';
          this.loadGroupState(gId);
          try {
            await this.authManager.pullGlobalMeta();
          } catch (e) {}
          this.renderMain();
          if (this.cloudSyncEngine) {
            this.cloudSyncEngine.updateScopeKeys();
            this.cloudSyncEngine.pullFromServer();
          }
        });
        return;
      }

      if (currentUser.role === 'teacher') {
        appEl.className = 'app-teacher-mode';
        renderTeacherPortal(
          appEl, this.authManager, this.state,
          () => this.handleLogout(),
          () => {
            const users = this.authManager.getUsers();
            const studentA = users.find(u => (u.role === 'student' || u.isStudent) && u.studentCode);
            if (studentA) {
              sessionStorage.setItem('jizhi_current_user', JSON.stringify(studentA));
              localStorage.setItem('jizhi_current_user', JSON.stringify(studentA));
              this.renderMain();
            }
          }
        );
      } else {
        const effectiveClassId = this.authManager ? this.authManager.getEffectiveStudentClassId(currentUser, this.state.activeTaskId) : (this.state.activeStudentClassId || currentUser?.classId || null);
        const activeGroupObj = this.authManager.getStudentActiveGroup(currentUser, effectiveClassId);
        const currentGroupId = activeGroupObj.id || (currentUser && currentUser.groupId ? currentUser.groupId : 'group_1');

        if (this.state.studentViewMode === 'task_list') {
          appEl.className = 'app-student-portal-mode';
          renderStudentTaskPortal(
            appEl, this.authManager, this.state,
            (taskId) => {
              this._isHandlingTaskRevoked = false;
              const actualTaskId = taskId || null;
              this.state.activeTaskId = actualTaskId;
              const targetTaskObj = (this.authManager ? this.authManager.getTasks() : []).find(t => t.id === actualTaskId);
              const taskClassId = (targetTaskObj && targetTaskObj.classId) ? targetTaskObj.classId : (this.authManager ? this.authManager.getEffectiveStudentClassId(currentUser, this.state.activeTaskId) : (this.state.activeStudentClassId || currentUser?.classId || null));
              this.state.activeStudentClassId = taskClassId;

              try {
                sessionStorage.setItem('jizhi_active_task_id', actualTaskId);
                localStorage.setItem('jizhi_active_task_id', actualTaskId);
                sessionStorage.setItem('jizhi_active_student_class_id', taskClassId);
                localStorage.setItem('jizhi_active_student_class_id', taskClassId);
              } catch (e) {}
              this.state.studentViewMode = 'workspace';
              sessionStorage.setItem('jizhi_student_view_mode', 'workspace');
              localStorage.setItem('jizhi_student_view_mode', 'workspace');

              const latestGroupObj = this.authManager.getStudentActiveGroup(currentUser, taskClassId);
              const targetGroupId = latestGroupObj.id || (currentUser && currentUser.groupId ? currentUser.groupId : 'group_1');
              this.loadGroupState(targetGroupId);

              // 🎯 保持本组推进到的真实阶段，确保历史消息与当前工作台阶段 100% 对应
              const effectiveStage = this.state.groupMaxStage || this.state.currentStage || 'stage1';
              this.state.currentStage = effectiveStage;
              this.isViewingPastStage = false;

              if (!this.state.presence) this.state.presence = {};
              const myKeys = [currentUser?.id, currentUser?.studentCode, currentUser?.username, currentUser?.name].filter(Boolean);
              const now = Date.now();
              myKeys.forEach(k => {
                this.state.presence[k] = { nodeIndex: 0, activeSection: '在线协作', updatedAt: now };
              });

              if (this.cloudSyncEngine) {
                this.cloudSyncEngine.isLoggingOut = false;
                this.cloudSyncEngine.initPolling();
              }

              // ⚡ 0 毫秒秒切进入工作台！
              this.renderMain();
              this.checkUnreadAnnouncements();

              // 🟢 后台异步静默拉取云端权威数据，绝不阻塞用户界面跳转
              setTimeout(async () => {
                if (this.authManager && this.authManager.pullGlobalMeta) {
                  try { await this.authManager.pullGlobalMeta(); } catch (e) {}
                }
                if (this.cloudSyncEngine) {
                  this.cloudSyncEngine.groupId = targetGroupId;
                  this.cloudSyncEngine.taskId = actualTaskId;
                  this.cloudSyncEngine.updateScopeKeys();
                  await this.cloudSyncEngine.pullFromServer();
                  if (typeof window.renderChat === 'function') window.renderChat(this.state);
                }
              }, 50);
            },
            () => this.handleLogout(),
            () => this.switchToTeacherView(),
            () => this.showAnnouncementModal()
          );
          return;
        }

        const membersList = Object.values(this.state.members || {});

        appEl.className = 'app-student-mode';
        appEl.innerHTML = `
          <header class="app-header" id="app-header"></header>
          <div class="main-content">
            <main class="canvas-panel" id="canvas-panel"></main>
            <aside class="chat-panel">
              <div class="chat-header" style="display:flex; flex-direction:column; gap:6px; padding:10px 12px; border-bottom:1px solid #e2e8f0; background:#ffffff; box-sizing:border-box; width:100%; flex-shrink:0;">
                <div style="display:flex; justify-content:space-between; align-items:center; width:100%; flex-wrap:wrap; gap:6px;">
                  <div class="chat-title" style="font-size:14px; font-weight:800; color:#0f172a; display:flex; align-items:center; gap:6px;"><span>💬 协同对话研讨</span></div>
                  <div class="active-agent-pills" style="display:flex; gap:6px; align-items:center;">
                    <span class="agent-pill" style="font-size:11px; padding:2px 8px; border-radius:12px; font-weight:700; white-space:nowrap;">🎪 拍卖师</span>
                    <span class="agent-pill" style="font-size:11px; padding:2px 8px; border-radius:12px; font-weight:700; white-space:nowrap;">🤝 责任编辑</span>
                    <span class="agent-pill" style="font-size:11px; padding:2px 8px; border-radius:12px; font-weight:700; white-space:nowrap;">📝 审稿编辑</span>
                  </div>
                </div>
                <div class="chat-presence-bar" id="chat-presence-bar" style="padding:4px 8px; background:#f8fafc; border-radius:6px; border:1px solid #e2e8f0; display:flex; align-items:center; gap:6px; width:100%; box-sizing:border-box; overflow-x:auto; white-space:nowrap;">
                  <span style="font-size:11px; font-weight:800; color:#475569; flex-shrink:0;">👥 在线:</span>
                  <div id="chat-member-presence-pills" style="display:flex; align-items:center; gap:4px; flex-shrink:0;"></div>
                </div>
              </div>
              <div class="chat-stream" id="chat-stream"></div>
              <div class="at-mention-menu" id="at-mention-menu" style="display:none;">
                <div class="at-menu-header">👥 提示：选择需要 @ 的同学或 AI 智能体</div>
                <div class="at-menu-list">
                  <div class="at-group-title">👥 小组成员 (${membersList.length}人)</div>
                  ${membersList.map(m => `
                    <div class="at-item" data-mention="@${m.name}">
                      ${m.avatar || '👨‍🎓'} @${m.name} (${m.roleTitle || '组员'})
                    </div>
                  `).join('')}
                  <div class="at-group-title" style="margin-top:6px;">🤖 AI 学术智能体</div>
                  <div class="at-item agent" data-mention="@拍卖师">🎪 @拍卖师 (阶段一 选题指导)</div>
                  <div class="at-item agent" data-mention="@责任编辑">🤝 @责任编辑 (阶段二 分工协同)</div>
                  <div class="at-item agent" data-mention="@审稿编辑">📝 @审稿编辑 (阶段二 论文规范)</div>
                  <div class="at-item agent" data-mention="@中间委员">🟡 @中间委员 (阶段三 答辩裁决)</div>
                  <div class="at-item agent" data-mention="@正方委员">🟢 @正方委员 (阶段三 答辩肯定)</div>
                  <div class="at-item agent" data-mention="@反方委员">🔴 @反方委员 (阶段三 答辩质询)</div>
                </div>
              </div>
              <div id="chat-agent-action-bar" style="display:none; padding:8px 12px; background:#f8fafc; border-top:1px solid #e2e8f0; border-bottom:1px solid #e2e8f0; text-align:center; box-sizing:border-box;"></div>
              <div class="emoji-bar" id="emoji-bar">
                <span class="emoji-btn" data-emoji="😊">😊</span><span class="emoji-btn" data-emoji="😂">😂</span>
                <span class="emoji-btn" data-emoji="👍">👍</span><span class="emoji-btn" data-emoji="👏">👏</span>
                <span class="emoji-btn" data-emoji="🎉">🎉</span><span class="emoji-btn" data-emoji="💯">💯</span>
                <span class="emoji-btn" data-emoji="🔥">🔥</span><span class="emoji-btn" data-emoji="❤️">❤️</span>
                <span class="emoji-btn" data-emoji="📝">📝</span><span class="emoji-btn" data-emoji="💡">💡</span>
                <span class="emoji-btn" data-emoji="📚">📚</span><span class="emoji-btn" data-emoji="🔍">🔍</span>
                <span class="emoji-btn" data-emoji="📊">📊</span><span class="emoji-btn" data-emoji="🎓">🎓</span>
                <span class="emoji-btn" data-emoji="🎯">🎯</span><span class="emoji-btn" data-emoji="📌">📌</span>
                <span class="emoji-btn" data-emoji="❓">❓</span><span class="emoji-btn" data-emoji="🤔">🤔</span>
                <span class="emoji-btn" data-emoji="💬">💬</span><span class="emoji-btn" data-emoji="🤝">🤝</span>
                <span class="emoji-btn" data-emoji="✅">✅</span><span class="emoji-btn" data-emoji="⚠️">⚠️</span>
                <span class="emoji-btn" data-emoji="🚀">🚀</span><span class="emoji-btn" data-emoji="⚡">⚡</span>
              </div>
              <div class="chat-input-bar" style="display:flex; align-items:center; gap:8px;">
                <input type="file" id="chat-img-file-input" accept="image/*" style="display:none;">
                <button class="chat-tool-btn" id="btn-chat-upload-img" title="发送图片/图表至讨论区" style="background:#f1f5f9; border:1px solid #cbd5e1; border-radius:8px; width:38px; height:38px; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:18px; color:#475569; flex-shrink:0;">
                  🖼️
                </button>
                <input type="text" class="chat-input modern-spacious-input" id="chat-input" placeholder="输入 @ 提及同学或智能体，或输入学术讨论..." autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
                <button class="send-btn modern-send-btn" id="send-btn" title="发送消息">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                  </svg>
                </button>
              </div>
            </aside>
          </div>
        `;

        this.initStudentEvents();
        this.renderStudentWorkspace();
        this.triggerStageWelcomeSpeech(this.state.currentStage || 'stage1');
        this.checkUnreadAnnouncements();
        this.initCrossStageInactivityChecker();
      }
    }

    // 🌐 通用智能体静默/情绪提示发射器：真 AI 生成，调用期间显示 Loading 动画，失败时采用温暖兜底或提示 @智能体 重新召唤
    async queueAgentNudge(botKey, prompt, fallbackText = '', stage = 'stage2') {
      if (this._isHandlingAgentNudge) return; // 🛡️ 严格单飞并发锁，杜绝大模型双发
      this._isHandlingAgentNudge = true;

      // 1. 在聊天框推入【正在输入/思考中...】的 Loading 状态气泡
      const loadingMsgId = 'loading_' + Date.now();
      const loadingMsg = {
        id: loadingMsgId,
        sender: botKey,
        text: '🤖 正在结合当前研讨语境生成专属学术建议...',
        isLoading: true,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        _timeMs: Date.now()
      };
      if (!this.state.chatLogs[stage]) this.state.chatLogs[stage] = [];
      this.state.chatLogs[stage].push(loadingMsg);
      if (typeof window.renderChat === 'function') window.renderChat(this.state);

      try {
        let text = await callCozeAgentAPI(botKey, prompt, { stage });
        // 2. 移除 loading 气泡
        this.state.chatLogs[stage] = this.state.chatLogs[stage].filter(m => m.id !== loadingMsgId);

        let finalText = (text && text.trim().length > 0) ? text.trim() : '';
        if (!finalText) {
          if (fallbackText && fallbackText.trim().length > 0) {
            finalText = fallbackText.trim();
          } else {
            const roleName = botKey === 'auctioneer' ? '拍卖师' : (botKey === 'reviewingEditor' ? '审稿编辑' : (botKey === 'neutral' ? '中间委员' : '责任编辑'));
            finalText = `💡 【${roleName}】：网络响应稍微慢了一步～如果大家需要我的针对性指导，可以在讨论区输入 @${roleName} 重新召唤我！`;
          }
        }

        const msg = {
          sender: botKey,
          text: finalText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          _timeMs: Date.now()
        };
        this.state.chatLogs[stage].push(msg);
        this.syncChatLogs();
        if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
        renderChat(this.state);
      } catch (e) {
        console.warn('Agent nudge error:', e);
        this.state.chatLogs[stage] = this.state.chatLogs[stage].filter(m => m.id !== loadingMsgId);

        let finalText = (fallbackText && fallbackText.trim().length > 0) ? fallbackText.trim() : '';
        if (!finalText) {
          const roleName = botKey === 'auctioneer' ? '拍卖师' : (botKey === 'reviewingEditor' ? '审稿编辑' : (botKey === 'neutral' ? '中间委员' : '责任编辑'));
          finalText = `💡 【${roleName}】：网络响应稍微慢了一步～如果大家需要我的针对性指导，可以在讨论区输入 @${roleName} 重新召唤我！`;
        }
        const msg = {
          sender: botKey,
          text: finalText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          _timeMs: Date.now()
        };
        this.state.chatLogs[stage].push(msg);
        this.syncChatLogs();
        if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
        renderChat(this.state);
      } finally {
        this._isHandlingAgentNudge = false;
      }
    }

    initCrossStageInactivityChecker() {
      this._nudgeCounts = this._nudgeCounts || {};
      if (this.stageInactivityTimer) clearInterval(this.stageInactivityTimer);
      this.stageInactivityTimer = setInterval(async () => {
        const currUserObj = this.authManager ? this.authManager.getCurrentUser() : null;
        if (!currUserObj || currUserObj.role === 'teacher') return;

        // 🔄 0. 极速版本心跳同步：拉取教师端最新发布的通知、任务与延期 (基于服务端版本戳，版本未变 0 开销)
        if (this.authManager && this.authManager.pullGlobalMeta) {
          try { await this.authManager.pullGlobalMeta(); } catch (e) {}
        }

        // 🛡️ 1. 任务存在性检测：如果当前正在某个任务中，但该任务已被教师在后台删除/重置
        const allTasks = this.authManager ? this.authManager.getTasks() : [];
        if (this.state.studentViewMode === 'workspace' && this.state.activeTaskId) {
          const isCurrentTaskAlive = allTasks.some(t => t.id === this.state.activeTaskId);
          if (!isCurrentTaskAlive && !this._isHandlingTaskRevoked) {
            this.showTaskRevokedModal(this.state.activeTaskTitle || '当前写作任务');
            return;
          }
        }

        // 🛡️ 2. 全局新任务发布感知与顶部横幅通知（严格仅限实时在线期间感知的新增任务，初次登录/离线重新进入绝不弹历史提示）
        const effClassId = this.state.activeStudentClassId || currUserObj.classId || null;
        const effGroup = this.authManager ? this.authManager.getStudentActiveGroup(currUserObj, effClassId) : null;
        const visibleTasks = allTasks.filter(t => {
          if (t.classId && t.classId !== effClassId) return false;
          if (t.targetGroupId && effGroup && t.targetGroupId !== effGroup.id) return false;
          return true;
        });

        const currentTaskIds = new Set(visibleTasks.map(t => t.id));
        if (this._knownTaskIdsSet) {
          // 仅在页面已在线运行期间检测到增量新任务时才弹横幅
          const newlyAddedTasks = visibleTasks.filter(t => !this._knownTaskIdsSet.has(t.id));
          if (newlyAddedTasks.length > 0) {
            const newestTask = newlyAddedTasks[0];
            console.log('📢 实时在线感知到教师端发布了新任务:', newestTask.title);
            showGlobalBannerNotice('📢 教师发布新任务', `任课教师刚刚发布了全新写作任务《${escapeHtml(newestTask.title || '新任务')}》！`, 'info', 8000);
          }
        } else {
          // 首次加载/刚登录：直接建立基线，绝对不弹任何旧任务横幅
          this._knownTaskIdsSet = currentTaskIds;
        }
        this._knownTaskIdsSet = currentTaskIds;

        // 🛡️ 2.5 工作台任务存活检测：仅当学生当前正在该工作台内写作时，若任务被教师实时删除才弹窗引导返回
        if (this.state.studentViewMode === 'workspace' && this.state.activeTaskId) {
          const isCurrentTaskAlive = allTasks.some(t => t.id === this.state.activeTaskId);
          if (!isCurrentTaskAlive && !this._isHandlingTaskRevoked) {
            this._isHandlingTaskRevoked = true;
            this.showTaskRevokedModal(this.state.activeTaskTitle || '当前写作任务');
            return;
          }
        }

        // 若处于任务大厅，感知任务变动后自动刷新大厅卡片
        if (!this.state.activeTaskId) {
          const currentTaskHash = visibleTasks.map(t => `${t.id}_${t.updatedAt || t.createdAt || ''}`).join('|');
          if (this._lastVisibleTaskHash && this._lastVisibleTaskHash !== currentTaskHash) {
            console.log('🔄 任务大厅检测到任务列表变动，自动刷新大厅呈现');
            this._lastVisibleTaskHash = currentTaskHash;
            this.renderStudentWorkspace();
          } else {
            this._lastVisibleTaskHash = currentTaskHash;
          }
        } else {
          // 🛡️ 3. 工作台模式下：实时检查并弹出教师新下发的教学通知与延期弹窗
          this.checkUnreadAnnouncements();

          // 🛡️ 4. 组员名单变动与换组秒级无感同步：教师在后台调整分组或移除缺勤学生时，学生端瞬间同步
          if (effGroup) {
            const curGroupHash = `${effGroup.id}_${(effGroup.members || []).map(m => (typeof m === 'object' ? (m.id || m.userId || m.studentCode || m.name) : m)).join(',')}`;
            if (this._lastGroupMembersHash && this._lastGroupMembersHash !== curGroupHash) {
              console.log('🔄 检测到教师后台调整了分组或小组名单，秒级无感同步最新成员与公约签署基数');
              this._lastGroupMembersHash = curGroupHash;
              if (this.cloudSyncEngine) this.cloudSyncEngine.updateScopeKeys();
              this.renderStudentWorkspace(true);
            } else {
              this._lastGroupMembersHash = curGroupHash;
            }
          }
        }

        // ⚡ 单点守护主节点动态选举：优先由组长担当；若组长缺勤/掉线，自动由当前在场学号最小的在线成员接管，杜绝单点失效与并发重复！
        const myCode = this.state.currentUser || (currUserObj ? (currUserObj.studentCode || currUserObj.id) : 'A');
        const now = Date.now();
        const membersList = Object.values(this.state.members || {});
        const presenceMap = this.state.presence || {};

        const stage = this.state.currentStage;
        const totalMembersCount = membersList.length;

        // ======================================================================
        // 🧠 SSRL 情绪挫败检测与社会性调节支持机制 (带 45s 同伴互助留白保护)
        // ======================================================================
        const currentStageChats = (this.state.chatLogs && this.state.chatLogs[stage]) ? this.state.chatLogs[stage] : [];
        const recentStudentChats = currentStageChats.filter(m => m.sender && !AgentProfiles[m.sender] && m.sender !== 'system');
        const lastNegativeChat = [...recentStudentChats].reverse().find(m => {
          const t = m.text || '';
          return /(?:太难了|写不出来|改不动了|不知道怎么写|全废了|搞不定|来不及了|头大|想放弃|否定我们|怎么改啊)/i.test(t);
        });

        if (lastNegativeChat && (!this.lastEmotionHandledId || this.lastEmotionHandledId !== lastNegativeChat._timeMs) && !this._isHandlingEmotion) {
          const negTime = lastNegativeChat._timeMs || (now - 60000);
          const timeSinceNeg = now - negTime;
          // 观察窗口：45 秒内给同伴留出互助安慰空间
          if (timeSinceNeg >= 45000 && timeSinceNeg < 180000) {
            // 检测 45 秒内是否有其他同伴发出了安慰/支持/解法回复
            const peerResponsesAfterNeg = recentStudentChats.filter(m => (m._timeMs || 0) > negTime && m.sender !== lastNegativeChat.sender);
            const hasPeerComforted = peerResponsesAfterNeg.some(m => /(?:没事|别慌|我们可以|一起|你看|先写|参考|我来|赞同|我觉得可以)/i.test(m.text || ''));

            // 🛡️ 情绪安抚严格执行 5 分钟 (300,000ms) 冷却期：同一次情绪安抚后 5 分钟内不重复轰炸；5 分钟后若学生再次流露挫败情绪，重新触发温暖共情！
            const timeSinceLastNegative = now - (this._lastNegativeHandledTime || 0);
            if (timeSinceLastNegative < 300000) {
              return;
            }

            if (!hasPeerComforted) {
              this.lastEmotionHandledId = lastNegativeChat._timeMs;
              this._lastNegativeHandledTime = now;
              this._isHandlingEmotion = true;
              let agentSender = 'managingEditor';
              let comfortText = '';
              if (stage === 'stage1') {
                agentSender = 'auctioneer';
                comfortText = `🎪 【拍卖师·选题启发】：遇到构思瓶颈是非常正常的学术探索过程！\n💡 建议可以从大家熟悉的真实教学场景切入，先列出 1~2 个最想解决的具体痛点，再逐步完善理论框架，全组一起出谋划策！`;
              } else if (stage === 'stage2') {
                agentSender = 'managingEditor';
                comfortText = `🤝 【责任编辑·暖心护航】：感到写作卡顿或疲惫时，不妨先暂停打字深呼吸！\n💡 可以先在研讨区把卡点或困惑抛给组员，大家头脑风暴互相提供思路支架，一步一步拆解难点！`;
              } else if (stage === 'stage3') {
                agentSender = 'neutral';
                comfortText = `🟡 【中间委员·答辩启发】：学术答辩中的尖锐质询正是让方案更加严谨的宝贵契机！\n💡 反方的质询指出了可以进一步补强的空间，建议结合正方刚才提到的实践应用优势，从操作化补救的角度从容辩护！`;
              }

              const negativeRaw = (lastNegativeChat.text || '').trim();
              const comfortPrompt = `有同学在协作中流露出了挫败/疲惫情绪，原话为：「${negativeRaw}」。请以${stage === 'stage1' ? '学术拍卖师' : stage === 'stage2' ? '责任编辑' : '中间委员'}的身份，先用 2~3 句真诚安抚这份情绪（共情但不肉麻、不说教），再结合当前写作阶段给出 1 个具体、可立即照做的小建议，帮助全组重新找回节奏。80~120 字，语气温暖自然。`;

              setTimeout(async () => {
                try {
                  await this.queueAgentNudge(agentSender, comfortPrompt, comfortText, stage);
                } finally {
                  this._isHandlingEmotion = false;
                }
              }, 50);
              return;
            } else {
              // 同伴已成功出面调节，AI 默默记录并全程保持静默
              this.lastEmotionHandledId = lastNegativeChat._timeMs;
            }
          }
        }
        if (stage === 'stage1') {
          const s1 = this.state.stage1;
          if (!s1 || s1.contract?.isConfirmed) return;
          if (!this.stage1StartTime) this.stage1StartTime = now;
          const stage1DurationMs = now - this.stage1StartTime;

          const s1Chats = (this.state.chatLogs && this.state.chatLogs.stage1) ? this.state.chatLogs.stage1 : [];
          const lastStudentMsg = [...s1Chats].reverse().find(m => m.sender && m.sender !== 'auctioneer' && m.sender !== 'system');
          const lastStudentMsgTime = lastStudentMsg ? (lastStudentMsg._timeMs || 0) : this.stage1StartTime;
          const silenceDurationMs = now - lastStudentMsgTime;

          const proposals = Array.isArray(s1.proposals) ? s1.proposals : [];
          const submittedCount = proposals.length;
          const submittedAuthors = new Set(proposals.map(p => p.author));
          const votesCastCount = Object.values(s1.hasVoted || {}).filter(Boolean).length;

          // 动态自适应冷场阈值（全系统统一：3 分钟破冰，6 分钟强兜底）
          const allTasks = (this.authManager) ? this.authManager.getTasks() : [];
          const curTask = allTasks.find(t => t.id === this.state.activeTaskId);
          const taskDurMin = (curTask && curTask.durationMinutes) ? Number(curTask.durationMinutes) : 150;
          const isLargeTask = taskDurMin > 150;
          const silenceThresholdMs = 180000; // 统一 3 分钟破冰

          // 1. 【研讨互动提示】：全组长时间静默无人发言（不干活）时，温和点拨破冰（同一次连续冷场最多提醒 2 次，学生说话自动重置）！
          if (submittedCount < totalMembersCount && silenceDurationMs >= silenceThresholdMs) {
            if (lastStudentMsgTime > (this._lastNudgeActivityTime?.['s1_discussion'] || 0)) {
              this._nudgeCounts['s1_discussion'] = 0;
            }
            const count = this._nudgeCounts['s1_discussion'] || 0;
            if (count < 2 && (!this.lastDiscussionNudgeTime || now - this.lastDiscussionNudgeTime > (silenceThresholdMs + 60000))) {
              this.lastDiscussionNudgeTime = now;
              this._nudgeCounts['s1_discussion'] = count + 1;
              if (!this._lastNudgeActivityTime) this._lastNudgeActivityTime = {};
              this._lastNudgeActivityTime['s1_discussion'] = lastStudentMsgTime;
              const msg = {
                sender: 'auctioneer',
                text: `💡 【拍卖师·研讨互动提示】：关注到大家正在构思选题！可以在讨论区交流灵感与研究想法，构思成熟后点击左侧【提交我的选题】卡片进行提交～`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                _timeMs: now
              };
              if (!this.state.chatLogs.stage1) this.state.chatLogs.stage1 = [];
              this.state.chatLogs.stage1.push(msg);
              this.syncChatLogs();
              if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
              renderChat(this.state);
              return;
            }
          }

          // 2. 【选题提交引导】：开场 > 6 分钟仍 0 人提交提案（全员不干活），引导尽快动笔（最多连续 2 次，与研讨互动提示保持至少 3 分钟间隔）
          if (submittedCount === 0 && stage1DurationMs > 360000 && (!this.lastDiscussionNudgeTime || now - this.lastDiscussionNudgeTime > 180000)) {
            const count = this._nudgeCounts['s1_zero_prop'] || 0;
            if (count < 2 && (!this.lastZeroProposalNudgeTime || now - this.lastZeroProposalNudgeTime > 300000)) {
              this.lastZeroProposalNudgeTime = now;
              this._nudgeCounts['s1_zero_prop'] = count + 1;
              const msg = {
                sender: 'auctioneer',
                text: `⏳ 【拍卖师·选题提交引导】：研讨已经展开一段时间啦！\n👉 请各位组员将脑海中构思成熟的研究题目，点击左侧【提交我的选题】卡片正式提交到提案池，开启学术竞拍！`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                _timeMs: now
              };
              if (!this.state.chatLogs.stage1) this.state.chatLogs.stage1 = [];
              this.state.chatLogs.stage1.push(msg);
              this.syncChatLogs();
              if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
              renderChat(this.state);
              return;
            }
          }

          // 3. 【个别落后跟进】：有人已提交，但超过 3.5 分钟仍有个别人未交，跟进提醒未交同学（最多连续 2 次）
          if (submittedCount > 0 && submittedCount < totalMembersCount) {
            const lastProposal = proposals[proposals.length - 1];
            const lastProposalTime = lastProposal ? (lastProposal.updatedAt || this.stage1StartTime) : this.stage1StartTime;
            if (now - lastProposalTime > 210000) {
              const count = this._nudgeCounts['s1_partial_prop'] || 0;
              if (count < 2 && (!this.lastPartialProposalNudgeTime || now - this.lastPartialProposalNudgeTime > 240000)) {
                this.lastPartialProposalNudgeTime = now;
                this._nudgeCounts['s1_partial_prop'] = count + 1;
                const unsubmitted = membersList.filter(m => !submittedAuthors.has(m.studentCode) && !submittedAuthors.has(m.id));
                if (unsubmitted.length > 0) {
                  const names = unsubmitted.map(m => m.name).join('、');
                  const msg = {
                    sender: 'auctioneer',
                    text: `📢 【拍卖师·提案跟进通知】：组内已有 ${submittedCount}/${totalMembersCount} 位组员完成选题提交！\n👉 请尚未提交的同学（**${names}**）抓紧点击左侧【提交我的选题】，全员集齐后即可正式进入竞拍投票！`,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    _timeMs: now
                  };
                  if (!this.state.chatLogs.stage1) this.state.chatLogs.stage1 = [];
                  this.state.chatLogs.stage1.push(msg);
                  this.syncChatLogs();
                  if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
                  renderChat(this.state);
                  return;
                }
              }
            }
          }

          // 4. 【提案集齐但投票守护】：全员交齐后迟迟不投票，独立计算投票冷场并引导（绝不被前一阶段阻碍，最多连续 2 次）
          if (submittedCount >= totalMembersCount && votesCastCount < totalMembersCount) {
            const lastVoteTime = s1._lastVoteTime || this.stage1StartTime;
            const voteSilenceMs = now - lastVoteTime;
            const shouldVoteNudge = (votesCastCount === 0 && voteSilenceMs > 180000) || (votesCastCount > 0 && voteSilenceMs > 120000);
            if (shouldVoteNudge) {
              const count = this._nudgeCounts['s1_vote'] || 0;
              if (count < 2 && (!this.lastVoteNudgeTime || now - this.lastVoteNudgeTime > 240000)) {
                this.lastVoteNudgeTime = now;
                this._nudgeCounts['s1_vote'] = count + 1;
                const unvoted = membersList.filter(m => !s1.hasVoted || (!s1.hasVoted[m.studentCode] && !s1.hasVoted[m.id]));
                const names = unvoted.map(m => m.name).join('、');
                const text = (votesCastCount === 0)
                  ? `⏳ 【拍卖师·竞拍投票提醒】：全员选题已陈列在左侧提案池中！\n👉 请全组成员浏览提案，点击【🗳️ 投这篇】投出支持的一票！`
                  : `⏳ 【拍卖师·投票进度提醒】：目前全组已投票 ${votesCastCount}/${totalMembersCount} 人。\n👉 请尚未投票的成员（**${names || '未投票组员'}**）尽快在左侧提案卡片下方点击【🗳️ 投这篇】！`;
                const msg = {
                  sender: 'auctioneer',
                  text: text,
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  _timeMs: now
                };
                if (!this.state.chatLogs.stage1) this.state.chatLogs.stage1 = [];
                this.state.chatLogs.stage1.push(msg);
                this.syncChatLogs();
                if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
                renderChat(this.state);
                return;
              }
            }
          }

          // 5. 【阶段一 20% 超时转场强通牒】：阶段一规划占 10%，进行达 20% 属于严重超时转场门限（全场严格仅发 1 次）
          const stage1MaxBudgetMs = (totalDurationSec * 1000) * 0.20;
          const hasS1TransitionNudge = s1AllLogs.some(m => m && m.sender === 'auctioneer' && (m.text?.includes('转场通牒') || m.text?.includes('阶段一转场提醒') || m.text?.includes('已达 20% 极限节点')));
          if (stage1DurationMs >= stage1MaxBudgetMs && !s1.contract?.isConfirmed && !hasS1TransitionNudge && !s1.transitionNudgeSent) {
            s1.transitionNudgeSent = true;
            const transMsg = {
              sender: 'auctioneer',
              senderName: '学术选题 · 拍卖师',
              text: `🎪 【拍卖师·转场通牒】：全场时间已达 20% 极限节点（阶段一标准规划为 10%，当前已超时）！\n👉 请全员立刻在左侧公约卡片点击【签署确认】，全员签署后立即进入【阶段二：学术编辑部】开始动笔写作，留足写作与质检时间！`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              _timeMs: now
            };
            if (!this.state.chatLogs.stage1) this.state.chatLogs.stage1 = [];
            this.state.chatLogs.stage1.push(transMsg);
            this.syncChatLogs();
            this.syncStage1();
            if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
            renderChat(this.state);
            return;
          }

          // 4.5 【引导后静默守护与 6 分钟大模型强兜底】：智能体发出引导后，3 分钟破冰，6 分钟大模型自动提炼回填并顺推
          const s1AllLogs = this.state.chatLogs?.stage1 || [];
          const lastAgentMsg = [...s1AllLogs].reverse().find(m => m && m.sender === 'auctioneer');
          if (lastAgentMsg && (!lastStudentMsgTime || lastStudentMsgTime < (lastAgentMsg._timeMs || 0))) {
            const silenceAfterGuideMs = now - (lastAgentMsg._timeMs || now);

            // ① 挂机 3 分钟破冰提醒
            if (silenceAfterGuideMs > 180000 && silenceAfterGuideMs <= 360000) {
              const count = this._nudgeCounts['s1_guide_silence'] || 0;
              if (count < 1) {
                this._nudgeCounts['s1_guide_silence'] = 1;
                const stepName = (s1.contractStep === 'tasks') ? '任务分工' : ((s1.contractStep === 'time') ? '时间分配' : '研究主题与方案');
                const buttonText = (s1.contractStep === 'tasks') ? '一键提炼【任务分工】' : ((s1.contractStep === 'time') ? '一键提炼【时间分配】' : '一键提炼【主题与研究方案】');
                const nudgeMsg = {
                  sender: 'auctioneer',
                  senderName: '头脑风暴 · 学术拍卖师',
                  text: `💡 【拍卖师·研讨推进提示】：大家可以围绕【${stepName}】在讨论区积极交流观点～商定成熟后，请点击上方【${buttonText}】按钮，系统将为大家一键提炼研讨共识！`,
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  _timeMs: now
                };
                this.state.chatLogs.stage1.push(nudgeMsg);
                this.syncChatLogs();
                if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
                renderChat(this.state);
                return;
              }
            }

            // ② 挂机 6 分钟强兜底：大模型自动提炼生成并回填顺推，彻底杜绝流程卡死
            if (silenceAfterGuideMs > 360000 && !this._s1AutoFallbackRunning) {
              const fallbackKey = `s1_auto_fallback_${s1.contractStep || 'topic'}`;
              if (!this._nudgeCounts[fallbackKey]) {
                this._nudgeCounts[fallbackKey] = 1;
                this._s1AutoFallbackRunning = true;
                const stepName = (s1.contractStep === 'tasks') ? '任务分工' : ((s1.contractStep === 'time') ? '时间分配' : '研究主题与方案');
                const autoNoticeMsg = {
                  sender: 'auctioneer',
                  senderName: '头脑风暴 · 学术拍卖师',
                  text: `🎪 【拍卖师·研讨收拢与智能生成】：研讨时间已到，为确保选题进度，拍卖师已结合当前构想与学术规范，自动为大家生成并录入【${stepName}】！`,
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  _timeMs: now
                };
                this.state.chatLogs.stage1.push(autoNoticeMsg);
                this.syncChatLogs();

                setTimeout(async () => {
                  try {
                    if (s1.contractStep === 'tasks') {
                      await this._doExtractTasks();
                    } else if (s1.contractStep === 'time') {
                      await this._doExtractTime();
                    } else {
                      await this._doExtractTopic();
                    }
                  } finally {
                    this._s1AutoFallbackRunning = false;
                  }
                }, 1000);
                return;
              }
            }
          }

          // 5. 投票已完成且合约草案已生成 ➔ 催签守护（投票后已有大模型专属引导，此处专注催签，最多2次）
          const signedMap = (s1.contract && s1.contract.confirmedMembers) ? s1.contract.confirmedMembers : {};
          const signedCount = Object.values(signedMap).filter(Boolean).length;
          const isContractDrafted = votesCastCount >= totalMembersCount;

          if (isContractDrafted && signedCount < totalMembersCount) {
            const lastContractActionTime = Math.max(s1.contract._lastEditTime || 0, this.stage1LastActionTime || 0);
            const timeSinceContractEdit = now - lastContractActionTime;
            const contractDraftTime = s1.contract._draftedTime || this.stage1StartTime;

            // 规则 A（全员未签）：在没有修改的情况下，没有任何人签署超过 3 分钟 ➔ 拍卖师提示开始签署（最多2次）
            if (signedCount === 0 && (now - contractDraftTime > 180000) && timeSinceContractEdit > 180000) {
              const count = this._nudgeCounts['s1_zero_sign'] || 0;
              if (count < 2 && (!this.lastZeroSignNudgeTime || now - this.lastZeroSignNudgeTime > 240000)) {
                this.lastZeroSignNudgeTime = now;
                this._nudgeCounts['s1_zero_sign'] = count + 1;
                const msg = {
                  sender: 'auctioneer',
                  text: `📜 【拍卖师·公约签署提示】：公约草案已生成一段时间啦！\n👉 请组员核对左侧《学术合作公约》上的章节分工与时间规划，确认无误后点击【确认签署】，开启团队学术合作！`,
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  _timeMs: now
                };
                if (!this.state.chatLogs.stage1) this.state.chatLogs.stage1 = [];
                this.state.chatLogs.stage1.push(msg);
                this.syncChatLogs();
                if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
                renderChat(this.state);
                return;
              }
            }

            // 规则 B（部分已签）：有人已签署，但仍有成员未签超过 2 分钟 ➔ 拍卖师催签未签组员（最多2次）
            if (signedCount > 0 && signedCount < totalMembersCount) {
              const lastSignTime = s1.contract._lastSignTime || contractDraftTime;
              if (now - lastSignTime > 120000) {
                const count = this._nudgeCounts['s1_partial_sign'] || 0;
                if (count < 2 && (!this.lastSignContractNudgeTime || now - this.lastSignContractNudgeTime > 180000)) {
                  this.lastSignContractNudgeTime = now;
                  this._nudgeCounts['s1_partial_sign'] = count + 1;
                  const unsignedMembers = membersList.filter(m => !signedMap[m.studentCode] && !signedMap[m.id]);
                  const unsignedNames = unsignedMembers.map(m => m.name).join('、');
                  const msg = {
                    sender: 'auctioneer',
                    text: `📜 【拍卖师·公约签署跟进】：目前全组合约已签署 ${signedCount}/${totalMembersCount} 人。\n👉 请尚未签署的同学（**${unsignedNames || '未签署组员'}**）抓紧核对并点击左侧【确认签署】，全员完成即可正式解锁阶段二！`,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    _timeMs: now
                  };
                  if (!this.state.chatLogs.stage1) this.state.chatLogs.stage1 = [];
                  this.state.chatLogs.stage1.push(msg);
                  this.syncChatLogs();
                  if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
                  renderChat(this.state);
                  return;
                }
              }
            }
          }
        }

        // ======================================================================
        // 🤝 阶段二：责任编辑 (Managing Editor) 过程学伴守护机制
        // ======================================================================
        else if (stage === 'stage2') {
          const s2 = this.state.stage2;
          if (!s2 || this.state.isFinalSubmitted) return;
          if (!this.stage2StartTime) this.stage2StartTime = now;
          const stage2DurationMs = now - this.stage2StartTime;

          const s2Chats = (this.state.chatLogs && this.state.chatLogs.stage2) ? this.state.chatLogs.stage2 : [];
          const lastStudentMsg = [...s2Chats].reverse().find(m => m.sender && m.sender !== 'managingEditor' && m.sender !== 'reviewingEditor' && m.sender !== 'system');
          let lastMsgMs = lastStudentMsg?._timeMs;
          if (!lastMsgMs && lastStudentMsg?.timestamp) {
            const parts = String(lastStudentMsg.timestamp).split(':');
            if (parts.length >= 2) {
              const d = new Date();
              d.setHours(parseInt(parts[0], 10), parseInt(parts[1], 10), 0, 0);
              lastMsgMs = d.getTime();
            }
          }
          const lastStudentMsgTime = lastMsgMs || this.stage2StartTime || (now - 60000);
          const silenceDurationMs = Math.max(0, now - lastStudentMsgTime);

          const plainText = (s2.unifiedContent || '').replace(/<[^>]*>/g, '').trim();
          const plainTextLen = plainText.length;
          const contribs = s2.memberContributions || {};

          // 动态读取任务时长判定任务规模（全系统统一：静默 3 分钟破冰，6 分钟催促，10 分钟强兜底）
          const allTasks = (this.authManager) ? this.authManager.getTasks() : [];
          const curTask = allTasks.find(t => t.id === this.state.activeTaskId);
          const taskDurMin = (curTask && curTask.durationMinutes) ? Number(curTask.durationMinutes) : 150;
          const isLargeTask = taskDurMin > 150;
          const totalPlannedMs = taskDurMin * 60 * 1000; // 阶段二总计划时长(ms)，供 85% 时间水位线与倒计时使用
          const s2NudgeCooldownMs = isLargeTask ? 480000 : 360000;
          const s2SilenceThresholdMs = 180000; // 统一 3 分钟破冰

          // 🛡️ 通用消息毫秒时间戳解析工具（函数提升，全局安全访问）
          function parseMsgTime(m) {
            if (!m) return 0;
            if (m._timeMs && Number(m._timeMs) > 0) return Number(m._timeMs);
            if (m.timestamp) {
              const parts = String(m.timestamp).split(':');
              if (parts.length >= 2) {
                const d = new Date();
                d.setHours(parseInt(parts[0], 10), parseInt(parts[1], 10), parseInt(parts[2] || '0', 10), 0);
                return d.getTime();
              }
            }
            return 0;
          }

          // 1. 阶段二开场起草提示：开场达到 3 分钟完全静默且正文字数 < 50 字（最多2次）
          if (silenceDurationMs >= s2SilenceThresholdMs && plainTextLen < 50) {
            const count = this._nudgeCounts['s2_silence'] || 0;
            if (count < 2 && (!this.lastS2SilenceNudgeTime || now - this.lastS2SilenceNudgeTime > (s2SilenceThresholdMs + 60000))) {
              this.lastS2SilenceNudgeTime = now;
              this._nudgeCounts['s2_silence'] = count + 1;
              const msg = {
                sender: 'managingEditor',
                text: `🤝 【责任编辑·起草提示】：大家已进入阶段二正文协作！\n👉 请组员按照阶段一公约分工开始撰写各自负责的内容；撰写同时多阅读同伴段落，在研讨区互相交流衔接，协同推进！`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                _timeMs: now
              };
              if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
              this.state.chatLogs.stage2.push(msg);
              this.syncChatLogs();
              this.syncStage2();
              if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
              renderChat(this.state);
              return;
            }
          }

          // 2. 责任编辑过程守护：周期性读取【实际贡献百分比】与【研讨发言投入】（全场严格最多 2 次，两次间隔 >= 6分钟）
          const minContribThreshold = isLargeTask ? 600 : 300;
          const existContribNudges = s2Chats.filter(m => m && (m.text?.includes('进度关怀') || m.text?.includes('协同关怀')));
          const lastContribMsg = existContribNudges.length > 0 ? existContribNudges[existContribNudges.length - 1] : null;
          const lastContribTime = parseMsgTime(lastContribMsg) || this.lastS2ContribNudgeTime || 0;
          const isContribCooldownPassed = (now - lastContribTime) >= s2NudgeCooldownMs;

          if (existContribNudges.length < 2 && isContribCooldownPassed) {
            // 1. 计算总投入与每位成员的实际贡献百分比（100% 依据 Etherpad 真实写作字数贡献）
            let totalContrib = 0;
            membersList.forEach(m => {
              totalContrib += (contribs[m.id] || contribs[m.studentCode] || 0);
            });

            // 2. 找出“写作贡献百分比显著滞后（<= 15%）”的同学
            const severeInactiveMembers = [];
            if (totalContrib >= minContribThreshold) {
              membersList.forEach(m => {
                const memContrib = (contribs[m.id] || contribs[m.studentCode] || 0);
                const pct = totalContrib > 0 ? Math.round((memContrib / totalContrib) * 100) : 33;

                if (pct <= 15) {
                  severeInactiveMembers.push(m.name);
                }
              });
            }

            if (severeInactiveMembers.length > 0) {
              this.lastS2ContribNudgeTime = now;
              this._nudgeCounts['s2_contrib'] = existContribNudges.length + 1;
              const targetName = severeInactiveMembers[0];
              const tasks = (this.state.stage1 && this.state.stage1.contract && this.state.stage1.contract.taskAssignments) ? this.state.stage1.contract.taskAssignments : {};
              let targetChapter = '负责的章节';
              membersList.forEach(m => {
                if (m.name === targetName) {
                  targetChapter = tasks[m.id] || tasks[m.studentCode] || tasks[m.name] || '负责的章节';
                }
              });

              const msg = {
                sender: 'managingEditor',
                text: `🤝 【责任编辑·进度关怀】：大家都在按节奏推进，看到组员们已经起草了部分板块！负责【${targetChapter}】的 ${targetName} 同学也可以逐步动笔啦。建议可以先从该章节的核心切入点着手拟写，遇到难点随时在研讨区抛出来，全组一起协同保持良好节奏！`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                _timeMs: now
              };
              if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
              this.state.chatLogs.stage2.push(msg);
              this.syncChatLogs();
              if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
              renderChat(this.state);
              return;
            }
          }

          // ======================================================================
          // 📝 审稿编辑一审后静默跟进（严格 3 分钟冷场静默提示，全场严格仅 1 次）
          // ======================================================================
          const existReviewFollow = s2Chats.some(m => m && m.text?.includes('初审跟进提示'));
          const lastReviewMsgObj = [...s2Chats].reverse().find(m => m && m.sender === 'reviewingEditor' && !m.text?.includes('初审跟进提示') && !m.text?.includes('终稿') && !m.text?.includes('终审'));
          const isFirstReviewIssued = !!lastReviewMsgObj || s2.reviewMilestone === 'first_review_done' || !!s2.firstReviewText;
          const hasPassedToSubsequentStages = s2Chats.some(m => m && (
            m.text?.includes('半程研讨号召') || 
            m.text?.includes('半程会议号召') || 
            m.text?.includes('半程自查') || 
            m.text?.includes('半程修正清单') || 
            m.text?.includes('终稿行文扫描') || 
            m.text?.includes('终审定稿总评')
          )) || !!s2.meetingStep || !!s2.isDraftConfirmed;

          if (!existReviewFollow && isFirstReviewIssued && !hasPassedToSubsequentStages) {
            const reviewTime = parseMsgTime(lastReviewMsgObj) || this.stage2StartTime || (now - 60000);
            const reviewElapsed = Math.max(0, now - reviewTime);
            const studentMsgAfterReview = s2Chats.filter(m => m && m.sender && m.sender !== 'managingEditor' && m.sender !== 'reviewingEditor' && m.sender !== 'system' && parseMsgTime(m) > reviewTime);
            const lastStudentMsgAfterReview = studentMsgAfterReview.length > 0 ? studentMsgAfterReview[studentMsgAfterReview.length - 1] : null;
            const lastStudentMsgAfterReviewTime = parseMsgTime(lastStudentMsgAfterReview);
            const silenceAfterReview = lastStudentMsgAfterReviewTime ? Math.max(0, now - lastStudentMsgAfterReviewTime) : reviewElapsed;

            // ── 一审后冷场满 3 分钟：初审跟进提示（全场严格仅 1 次） ──
            if (silenceAfterReview >= 180000) {
              this._nudgeCounts['s2_first_review_silence'] = 1;
              const followMsg = {
                sender: 'reviewingEditor',
                senderName: '学术质量 · 审稿编辑',
                text: `📝 【审稿编辑·初审跟进提示】：初审微调建议已送达！大家若对概念界定、文献引向或后续章节衔接有疑问，随时在讨论区 @审稿编辑 咨询，全组继续稳步协同推进！`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                _timeMs: now
              };
              if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
              this.state.chatLogs.stage2.push(followMsg);
              this.syncChatLogs();
              if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
              renderChat(this.state);
              return;
            }
          }

          // ======================================================================
          // 📌 质检/讨论梯度 B：半程会议自查打卡（3 分钟未打卡静默提醒，全场严格仅 1 次）
          // ======================================================================
          const existMeetingCheckinNudge = s2Chats.some(m => m && m.text?.includes('半程会议参与提示'));
          const lastMeetingMsg = [...s2Chats].reverse().find(m => m && m.sender === 'managingEditor' && (m.text?.includes('半程研讨号召') || m.text?.includes('半程会议号召') || m.text?.includes('半程自查') || m.text?.includes('半程会议')));
          const isMeetingActive = (lastMeetingMsg || s2.meetingStep) && s2.meetingStep !== 'completed' && !s2.isDraftConfirmed;

          if (isMeetingActive) {
            const meetingMsgTime = parseMsgTime(lastMeetingMsg) || s2.meetingCalledTime || this.stage2StartTime || (now - 60000);
            const meetingElapsed = Math.max(0, now - meetingMsgTime);

            const subs = s2.meetingSubmissions || {};
            const effClassId = this.state.activeStudentClassId || currUserObj.classId || null;
            const effGroup = this.authManager ? this.authManager.getStudentActiveGroup(currUserObj, effClassId) : null;
            const allGroupMembers = (effGroup && Array.isArray(effGroup.members) && effGroup.members.length > 0) ? effGroup.members : membersList;
            const totalCount = allGroupMembers.length || 2;

            const isMemberSubmitted = (m) => {
              if (!m) return false;
              let fullUser = (typeof m === 'object') ? m : null;
              if (!fullUser && this.authManager) {
                fullUser = this.authManager.findUserByKey ? this.authManager.findUserByKey(m) : null;
              }
              const keys = [
                typeof m === 'string' ? m : null,
                m?.id, m?.studentCode, m?.username, m?.name,
                fullUser?.id, fullUser?.studentCode, fullUser?.username, fullUser?.name
              ].filter(Boolean).map(k => String(k).trim().toLowerCase());

              // 1. 直接按 key 索引检索
              if (keys.some(k => subs[k] || subs[String(k)])) return true;
              // 2. 遍历 submissions 内部对象的 user / name 属性检索
              const subList = Object.values(subs);
              return subList.some(item => {
                if (!item) return false;
                const subKeys = [item.user, item.name, item.id, item.studentCode].filter(Boolean).map(k => String(k).trim().toLowerCase());
                return keys.some(k => subKeys.includes(k));
              });
            };

            const unsubmittedMembers = (Object.keys(subs).length >= totalCount) ? [] : allGroupMembers.filter(m => !isMemberSubmitted(m));
            const submittedCount = totalCount - unsubmittedMembers.length;
            const hasUnsubmitted = unsubmittedMembers.length > 0;

            const unsubmittedNames = unsubmittedMembers.map(m => {
              let fullUser = (typeof m === 'object') ? m : null;
              if (!fullUser && this.authManager && this.authManager.findUserByKey) {
                fullUser = this.authManager.findUserByKey(m);
              }
              return fullUser?.name || m?.name || m?.username || m?.studentCode || m;
            }).join('、');

            // ── 半程打卡：仅 3 分钟（180,000ms）单次点名催促（全场严格仅发 1 次，且仅在真有人未打卡时触发）──
            if (!existMeetingCheckinNudge && hasUnsubmitted && meetingElapsed >= 180000) {
              this._nudgeCounts['s2_meeting_checkin_3m'] = 1;
              const msg = {
                sender: 'managingEditor',
                senderName: '协同调度 · 责任编辑',
                text: `🤝 【责任编辑·半程会议参与提示】：半程学术审计会议已号召发起 3 分钟啦！目前组内打卡进度为【${submittedCount}/${totalCount} 人】，看到 ${unsubmittedNames} 同学尚未完成打卡。请尚未打卡的同学点击上方【📢 发起会议 / 打卡】按钮通读全篇完成自查，全员打卡后系统将自动为大家汇总生成《半程修正清单》！`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                _timeMs: now
              };
              if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
              this.state.chatLogs.stage2.push(msg);
              this.syncChatLogs();
              if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
              renderChat(this.state);
              return;
            }

            // ======================================================================
            // 📌 质检/讨论梯度 C：针对《二审修正清单》的修改方案商定（审稿编辑负责学术研讨引导与静默守护）
            // ======================================================================
            if (!hasUnsubmitted) {
              const checklistMsg = [...s2Chats].reverse().find(m => m && (m.text?.includes('二审修正清单') || m.text?.includes('半程修正清单') || m.text?.includes('半程编辑修正清单')));
              const checklistTime = parseMsgTime(checklistMsg) || meetingMsgTime || this.stage2StartTime || (now - 60000);
              const checklistElapsed = Math.max(0, now - checklistTime);
              const studentMsgAfterChecklist = s2Chats.filter(m => m && m.sender && m.sender !== 'managingEditor' && m.sender !== 'reviewingEditor' && m.sender !== 'system' && parseMsgTime(m) > checklistTime);
              const lastStudentMsgAfterChecklist = studentMsgAfterChecklist.length > 0 ? studentMsgAfterChecklist[studentMsgAfterChecklist.length - 1] : null;
              const lastStudentMsgAfterChecklistTime = parseMsgTime(lastStudentMsgAfterChecklist);
              const silenceAfterChecklist = lastStudentMsgAfterChecklistTime ? Math.max(0, now - lastStudentMsgAfterChecklistTime) : checklistElapsed;

              // 🛡️ 学生有发言即解除静默，重置讨论计数
              if (lastStudentMsgAfterChecklistTime > (this._lastNudgeActivityTime?.['s2_consistency'] || 0)) {
                this._nudgeCounts['s2_consistency_silence_3m'] = 0;
                this._nudgeCounts['s2_consistency_silence_6m'] = 0;
                if (!this._lastNudgeActivityTime) this._lastNudgeActivityTime = {};
                this._lastNudgeActivityTime['s2_consistency'] = lastStudentMsgAfterChecklistTime;
              }

              // ── ① 3 分钟没讨论：审稿编辑学术破冰点拨 ──
              const exist3mNudge = s2Chats.some(m => m && (m.text?.includes('清单修改研讨点拨') || m.text?.includes('一致性研讨点拨')));
              if (!exist3mNudge && silenceAfterChecklist >= 180000 && s2.meetingStep === 'discussing_checklist') {
                this._nudgeCounts['s2_consistency_silence_3m'] = 1;
                const msg = {
                  sender: 'reviewingEditor',
                  senderName: '学术质量 · 审稿编辑',
                  text: `📝 【审稿编辑·清单修改研讨点拨】：二审修正清单已下发！请大家对照清单中指出的学术诊断要点，在讨论区充分商定具体的修改对策与落实方案哦～`,
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  _timeMs: now
                };
                if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
                this.state.chatLogs.stage2.push(msg);
                this.syncChatLogs();
                this.syncStage2();
                if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
                renderChat(this.state);
                return;
              }

              // ── ② 6 分钟仍没讨论：审稿编辑强化收拢催促 ──
              const exist6mNudge = s2Chats.some(m => m && (m.text?.includes('修改对策收拢提醒') || m.text?.includes('研讨收拢提醒')));
              if (!exist6mNudge && silenceAfterChecklist >= 360000 && s2.meetingStep === 'discussing_checklist') {
                this._nudgeCounts['s2_consistency_silence_6m'] = 1;
                const msg = {
                  sender: 'reviewingEditor',
                  senderName: '学术质量 · 审稿编辑',
                  text: `⏳ 【审稿编辑·修改对策收拢提醒】：针对清单的修改研讨已进行 6 分钟！请全组同学抓紧对齐修改落实方案。商量差不多后，请点击聊天框上方的【📝 讨论差不多了？让审稿编辑总结】按钮，我将为大家提炼修改要点并指导回到正文继续撰写！`,
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  _timeMs: now
                };
                if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
                this.state.chatLogs.stage2.push(msg);
                this.syncChatLogs();
                this.syncStage2();
                if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
                renderChat(this.state);
                return;
              }

              // ── ③ 强兜底智能提炼回填并顺推：讨论持续满 10 分钟（长任务 20 分钟）自动触发 ──
              const existFallback = s2Chats.some(m => m && (m.text?.includes('二审修改决议') || m.text?.includes('二审修改落实要点')));
              const consistencyFallbackMs = isLargeTask ? 1200000 : 600000;
              const consistencyFallbackMinText = isLargeTask ? '20' : '10';
              if (!existFallback && checklistElapsed >= consistencyFallbackMs && s2.meetingStep === 'discussing_checklist' && !this._s2MeetingAutoFallbackRunning) {
                const nudgeKey = 's2_consistency_auto_fallback';
                if (!this._nudgeCounts[nudgeKey]) {
                  this._nudgeCounts[nudgeKey] = 1;
                  this._s2MeetingAutoFallbackRunning = true;
                  s2.meetingStep = 'completed';
                  this.syncStage2();

                  try {
                    const topic = (this.state.stage1 && this.state.stage1.mergedTitle) ? this.state.stage1.mergedTitle : '本组课题';
                    const userLogs = [...s2Chats].filter(m => m && m.sender && !AgentProfiles[m.sender] && m.sender !== 'system');
                    const chatSnippet = userLogs.map(m => `${m.senderName || m.sender}: ${m.text}`).join('\n') || '全组已针对修正清单展开讨论';
                    const fallbackPrompt = `全组已收到《二审修正清单》，针对清单的修改方案讨论已持续 ${consistencyFallbackMinText} 分钟。
  【论文题目】: ${topic}
  【正文草稿参考】: ${plainText.slice(0, 1500)}
  【组内讨论记录】: ${chatSnippet}

  请作为审稿编辑，结合学术规范代为提炼形成【二审修改落实决议】（120~150字，严禁出现“分工”字眼）：
  ① 明确全篇修改要点与章节对齐要求；
  ② 提示全组回到正文集中修改落实，冲刺定稿！（纯自然语言，120~150字，严禁输出代码块）`;

                    const resp = await callCozeAgentAPI('reviewingEditor', fallbackPrompt, { stage: 'stage2', topic });
                    let fallbackText = (resp && resp.trim().length > 0)
                      ? resp.trim()
                      : `📝 【审稿编辑·二审修改落实决议】：讨论时间已满 ${consistencyFallbackMinText} 分钟，为确保正文推进节奏，审稿编辑已为大家自动提炼【二审修改落实决议】：① 统领各章节核心术语，消除口语化表述；② 集中细化研究方法操作化步骤与测量工具；③ 补全未完成章节。请全组成员回到左侧正文集中修改落实，冲刺终审定稿！`;
                    if (!fallbackText.startsWith('📝')) fallbackText = `📝 【审稿编辑·二审修改落实决议】：${fallbackText}`;

                    const autoNoticeMsg = {
                      sender: 'reviewingEditor',
                      senderName: '学术质量 · 审稿编辑',
                      text: fallbackText,
                      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                      _timeMs: now
                    };
                    if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
                    this.state.chatLogs.stage2.push(autoNoticeMsg);
                    this.syncChatLogs();
                    this.syncStage2();
                    if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
                    renderChat(this.state);
                  } catch (e) {
                    console.warn('s2_consistency_auto_fallback error:', e);
                  } finally {
                    this._s2MeetingAutoFallbackRunning = false;
                  }
                  return;
                }
              }
            }
          }

          // ── 🛡️ 阶段二三次质检水位线标准与教学时序守卫 ──
          // 核心规则：三审绝不能在半程会议刚结束就秒弹！必须在审稿编辑二审总结后，至少经过 10 分钟（大任务 15 分钟）的集中修改，或者组员主动点击【✍️ 确认初稿】时方可触发！
          const defaultWordTarget = isLargeTask ? 9000 : 4300;
          const targetWordCount = (curTask && curTask.targetWordCount) ? Number(curTask.targetWordCount) : defaultWordTarget;
          const wordProgress = targetWordCount > 0 ? (plainTextLen / targetWordCount) : (plainTextLen / 4300);
          const timeProgress = totalPlannedMs > 0 ? (stage2DurationMs / totalPlannedMs) : 0;

          // 1. 寻找审稿编辑二审清单或决议发言时间
          const secondReviewMsg = [...s2Chats].reverse().find(m => m && m.sender === 'reviewingEditor' && (
            m.text?.includes('二审修正清单') || 
            m.text?.includes('二审修改落实决议') || 
            m.text?.includes('二审修改要点提炼') || 
            m.text?.includes('修改确认与写作冲刺')
          ));
          const secondReviewTime = parseMsgTime(secondReviewMsg);
          const hasPassedSecondReview = !!secondReviewMsg || s2.meetingStep === 'completed';
          const postSecondReviewElapsedMs = secondReviewTime > 0 ? Math.max(0, now - secondReviewTime) : 0;
          const minPostReviewModCooldownMs = isLargeTask ? 900000 : 600000; // 统一 10 分钟（大任务 15 分钟）修改沉淀期

          // 2. 判定三审触发条件：只要组员点击了初稿确认，或者经过 10 分钟修改期且字数达到成文标准
          const isUserConfirmingDraft = !!s2.isDraftConfirmed || (s2.confirmedMembers && Object.keys(s2.confirmedMembers).length > 0);
          const isTimeAndWordMature = postSecondReviewElapsedMs >= minPostReviewModCooldownMs && (wordProgress >= 0.85 || timeProgress >= 0.80 || plainTextLen >= 3000);
          const isFinalReviewDue = isUserConfirmingDraft || (hasPassedSecondReview && isTimeAndWordMature);

          const hasFinalReviewInLogs = s2Chats.some(m => m && m.sender === 'reviewingEditor' && (m.text?.includes('终稿行文扫描') || m.text?.includes('终审定稿总评') || m.text?.includes('审稿编辑·终审')));

          // 1. 审稿编辑【第三次质检·终审定稿扫描】（大模型深度质检，全场严格仅 1 次）
          if (!hasFinalReviewInLogs && isFinalReviewDue && !this._isTriggeringFinalReview) {
            this._isTriggeringFinalReview = true;
            s2.reviewMilestone = 'final_review_done';

            const topic = (this.state.stage1 && this.state.stage1.mergedTitle) ? this.state.stage1.mergedTitle : '本组课题';
            const contentSnippet = plainText.slice(0, 2500);

            // 🌟 挂载审稿编辑三审正在分析动态状态框
            this.state.activeAgentAnalyzing = {
              icon: '📝',
              title: '【审稿编辑】正在进行终审定稿与学术规范扫描...',
              detail: '正在对终稿全文进行学术语体、论述逻辑与文献规范终审质检...'
            };
            renderChat(this.state);
            this.renderStudentWorkspace();

            setTimeout(async () => {
              try {
                const finalPrompt = `【课题】：《${topic}》
  【终稿草稿全文节选】：
  ${contentSnippet}

  请发表 120~150 字终审定稿学术总评与行文扫描意见（包含【诊断问题 + 改进建议】双结构，严禁代码块，严禁出现“分工”字眼）：
  ①【学术语体与逻辑完整性】
  - 诊断问题：指出全篇逻辑闭环与语体严谨度；
  - 改进建议：给出具体优化建议。
  ②【学术规范与参考文献】
  - 诊断问题：核对术语一致性与文献著录；
  - 改进建议：给出答辩准备要求。
  👉 末尾必须提示：“请全组成员通读终审建议并做最后润色，修改完成后请点击上方导航进入【阶段三：答辩擂台】！”`;

                const resp = await callCozeAgentAPI('reviewingEditor', finalPrompt, { stage: 'stage2', topic });
                let finalTxt = (resp && resp.trim().length > 0)
                  ? resp.trim()
                  : `📝 【审稿编辑·终审定稿总评与行文扫描】：看到全组已进入最后成文冲刺阶段，整体框架完整！我对全文质量与学术规范进行了终审扫描：\n①【学术语体与逻辑完整性】\n· 诊断问题：整体论述连贯，需核对消除残留的口语化表述；\n· 改进建议：通读全篇统一学术语言基调。\n②【学术规范与参考文献】\n· 诊断问题：前后核心概念表述保持高度统一；\n· 改进建议：核对著录规范。\n👉 请全组成员通读终审建议并做最后润色，修改完成后请点击上方导航进入【阶段三：答辩擂台】！`;
                if (!finalTxt.startsWith('📝')) finalTxt = `📝 【审稿编辑·终审定稿总评与行文扫描】：${finalTxt}`;

                const refReviewMsg = {
                  sender: 'reviewingEditor',
                  senderName: '学术质量 · 审稿编辑',
                  text: finalTxt,
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  _timeMs: Date.now()
                };

                if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
                this.state.chatLogs.stage2.push(refReviewMsg);
                this.syncChatLogs();
                this.syncStage2();
                if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
                renderChat(this.state);
              } catch (e) {
                console.warn('final review error:', e);
              } finally {
                this.state.activeAgentAnalyzing = null;
                this._isTriggeringFinalReview = false;
                this.renderStudentWorkspace();
              }
            }, 300);
            return;
          }

          // 2. 责任编辑【85% 时间写作倒计时提醒】（全场严格仅 1 次）
          const hasCountdownInLogs = s2Chats.some(m => m && m.sender === 'managingEditor' && m.text?.includes('写作阶段倒计时提醒'));
          if (timeProgress >= 0.85 && !hasCountdownInLogs && !s2.countdown85Sent) {
            s2.countdown85Sent = true;
            const remainingStage2Min = Math.max(1, Math.ceil((totalPlannedMs - stage2DurationMs) / 60000));
            const countdownMsg = {
              sender: 'managingEditor',
              senderName: '协同调度 · 责任编辑',
              text: `🤝 【责任编辑·写作阶段倒计时提醒】：阶段二写作时间已过 85%（本阶段仅剩最后约 ${remainingStage2Min} 分钟）！请大家抓紧完成最后段落的撰写与通读，在上方逐一完成【初稿确认】，准备迎接阶段三学术答辩！`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              _timeMs: now
            };
            if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
            this.state.chatLogs.stage2.push(countdownMsg);
            this.syncChatLogs();
            this.syncStage2();
            if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
            renderChat(this.state);
          }

          // 3. 【三审后静默跟进】：三审发出后若讨论区冷场超 3 分钟且尚未全员初稿确认，提示通读润色与初稿打卡（全场严格仅 1 次）
          const hasFinalReviewMsgInChat = s2Chats.some(m => m && m.sender === 'reviewingEditor' && (m.text?.includes('终审定稿总评') || m.text?.includes('终稿行文扫描') || m.text?.includes('审稿编辑·终审')));
          const hasFinalSilenceFollowed = s2Chats.some(m => m && m.sender === 'reviewingEditor' && m.text?.includes('终稿润色提示'));

          if (hasFinalReviewMsgInChat && !hasFinalSilenceFollowed && !s2.finalReviewSilenceSent && !s2.isDraftConfirmed) {
            const finalReviewMsgObj = [...s2Chats].reverse().find(m => m && m.sender === 'reviewingEditor' && (m.text?.includes('终审定稿总评') || m.text?.includes('终稿行文扫描') || m.text?.includes('审稿编辑·终审')));
            const fMsgTime = parseMsgTime(finalReviewMsgObj) || (now - 60000);
            const fReviewElapsed = Math.max(0, now - fMsgTime);
            const studentMsgAfterFinal = s2Chats.filter(m => m && m.sender && m.sender !== 'managingEditor' && m.sender !== 'reviewingEditor' && m.sender !== 'system' && parseMsgTime(m) > fMsgTime);
            const lastStudentMsgAfterFinal = studentMsgAfterFinal.length > 0 ? studentMsgAfterFinal[studentMsgAfterFinal.length - 1] : null;
            const lastStudentMsgAfterFinalTime = parseMsgTime(lastStudentMsgAfterFinal);
            const silenceAfterFinal = lastStudentMsgAfterFinalTime ? Math.max(0, now - lastStudentMsgAfterFinalTime) : fReviewElapsed;

            if (silenceAfterFinal >= 180000) { // 严格 3 分钟静默
              s2.finalReviewSilenceSent = true;
              const followMsg3 = {
                sender: 'reviewingEditor',
                senderName: '学术质量 · 审稿编辑',
                text: `📝 【审稿编辑·终稿润色提示】：终稿语言与规范扫描诊断已下发！请大家对照指出的细节逐一润色订正，通读确认无误后在上方完成【初稿确认】，准备迎接答辩！`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                _timeMs: now
              };
              if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
              this.state.chatLogs.stage2.push(followMsg3);
              this.syncChatLogs();
              this.syncStage2();
              if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
              renderChat(this.state);
              return;
            }
          }

          // ── 阶段二终审行文扫描已严格统归由 checkStage2Milestones() 权威单向状态机统一仲裁 ──
        }

        // ======================================================================
        // 🎓 阶段三：中间委员 (Neutral Committee Member) 裁决引导机制
        // ======================================================================
        else if (stage === 'stage3') {
          const s3 = this.state.stage3;
          if (!s3 || this.state.isFinalSubmitted) return;
          if (!this.stage3StartTime) this.stage3StartTime = now;

          // 🛡️ 答辩委员会尚未全部就绪或正在生成评审时，严禁静默定时器抢跑插话！
          if (this.state.stage3CommitteeLoading || this.state.stage3CommitteeEvaluating || !s3.feedbackItems || s3.feedbackItems.length === 0) {
            return;
          }

          const stage3DurationMs = now - this.stage3StartTime;
          const s3Chats = (this.state.chatLogs && this.state.chatLogs.stage3) ? this.state.chatLogs.stage3 : [];
          const lastStudentMsg = [...s3Chats].reverse().find(m => m.sender && !['neutral', 'proponent', 'opponent', 'system', 'managingEditor', 'reviewingEditor'].includes(m.sender));

          // 🛡️ 以中间委员下发答辩思路引导的时间为静默计时基准，预留充分的通读思考时间
          const lastChairGuide = [...s3Chats].reverse().find(m => m.sender === 'neutral' && m.text?.includes('答辩思路引导'));
          const baselineTime = lastStudentMsg ? (lastStudentMsg._timeMs || now) : (lastChairGuide ? (lastChairGuide._timeMs || now) : now);
          const silenceDurationMs = now - baselineTime;

          const feedbacks = Array.isArray(s3.feedbackItems) ? s3.feedbackItems : [];
          const pendingFeedbacks = feedbacks.filter(f => !f.response || f.response.trim().length === 0);

          // ── 🎓 阶段三静默守护与 6 分钟强兜底：中间委员引导后，3 分钟破冰，6 分钟自动提炼定案顺推
          if (pendingFeedbacks.length > 0) {
            const currentPending = pendingFeedbacks[0];
            const inqIndex = feedbacks.indexOf(currentPending);
            const inqLabel = inqIndex >= 1 ? `意见 ${inqIndex}` : '当前质询';

            // ① 挂机 3 分钟破冰启发
            if (silenceDurationMs > 180000 && silenceDurationMs <= 360000) {
              const count = this._nudgeCounts[`s3_silence_${currentPending.id}`] || 0;
              if (count < 1) {
                this._nudgeCounts[`s3_silence_${currentPending.id}`] = 1;
                const s3SilenceMsg = {
                  sender: 'neutral',
                  senderName: '答辩委员会主席 · 中间委员',
                  text: `🟡 【中间委员·答辩思考启发】：关于【${inqLabel}】，大家可以从研究情境限制、样本选取的现实考量或操作化补救措施切入辩护；商定好思路后，随时点击上方按钮帮大家一键提炼定案！`,
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  _timeMs: now
                };
                if (!this.state.chatLogs.stage3) this.state.chatLogs.stage3 = [];
                this.state.chatLogs.stage3.push(s3SilenceMsg);
                this.syncChatLogs();
                if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
                renderChat(this.state);
                return;
              }
            }

            // ② 挂机 6 分钟强兜底：大模型自动提炼基础答辩词回填定案并顺推下一项
            if (silenceDurationMs > 360000 && !this._s3AutoFallbackRunning) {
              const fallbackKey = `s3_auto_fallback_${currentPending.id}`;
              if (!this._nudgeCounts[fallbackKey]) {
                this._nudgeCounts[fallbackKey] = 1;
                this._s3AutoFallbackRunning = true;

                const autoNoticeMsg = {
                  sender: 'neutral',
                  senderName: '答辩委员会主席 · 中间委员',
                  text: `🟡 【中间委员·答辩收拢与自动定案】：本题研讨时间已到，为推进答辩进度，委员会已结合正文优势为【${inqLabel}】生成基础辩护方案并定案！`,
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  _timeMs: now
                };
                if (!this.state.chatLogs.stage3) this.state.chatLogs.stage3 = [];
                this.state.chatLogs.stage3.push(autoNoticeMsg);
                this.syncChatLogs();

                setTimeout(async () => {
                  try {
                    if (typeof this._doExtractDefenseStep === 'function') {
                      await this._doExtractDefenseStep(currentPending.id, inqIndex);
                    }
                  } finally {
                    this._s3AutoFallbackRunning = false;
                  }
                }, 1000);
                return;
              }
            }
          }
        }
      }, 10000);
    }

    async checkUnreadAnnouncements() {
      if (this.authManager && this.authManager.pullGlobalMeta) {
        try { await this.authManager.pullGlobalMeta(); } catch (e) {}
      }
      // 🛡️ 任务大厅模式下绝不弹窗打扰学生，仅在进入具体任务工作台后针对该任务精准匹配
      if (this.state.studentViewMode !== 'workspace') return;

      const currentUser = this.authManager.getCurrentUser();
      if (!currentUser || currentUser.isTeacher || currentUser.role === 'teacher') return;
      const activeTaskId = this.state.activeTaskId;
      if (!activeTaskId) return;

      const effectiveClassId = this.authManager ? this.authManager.getEffectiveStudentClassId(currentUser, this.state.activeTaskId) : (this.state.activeStudentClassId || currentUser?.classId || null);
      const classes = this.authManager.getClasses();
      const currentClassObj = classes.find(c => c.id === effectiveClassId);
      const effectiveClassName = currentClassObj ? currentClassObj.name : '';
      const activeGroupObj = this.authManager.getStudentActiveGroup(currentUser, effectiveClassId);
      const groupId = this.state.activeGroupId || this.cloudSyncEngine?.groupId || activeGroupObj.id || (currentUser && currentUser.groupId ? currentUser.groupId : 'group_1');
      const allTasks = this.authManager.getTasks();

      const isAnnRead = (a) => {
        if (!a) return false;
        try {
          const localReadMap = JSON.parse(localStorage.getItem('jizhi_locally_read_announcements') || '{}');
          if (localReadMap[a.id]) return true;
        } catch (e) {}
        if (currentUser) {
          if (currentUser.id && a.readStatus && a.readStatus[currentUser.id]) return true;
          if (currentUser.studentCode && a.readStatus && a.readStatus[currentUser.studentCode]) return true;
          if (currentUser.username && a.readStatus && a.readStatus[currentUser.username]) return true;
          if (currentUser.name && a.readStatus && a.readStatus[currentUser.name]) return true;
          if (Array.isArray(a.confirmedMembers)) {
            if (a.confirmedMembers.some(m => m && (m.id === currentUser.id || m.studentCode === currentUser.studentCode || (currentUser.name && m.name === currentUser.name)))) return true;
          }
        }
        return false;
      };

      const allAnns = this.authManager.getAnnouncements();

      // 过滤出严格属于【当前任务 + 当前班级 + 当前小组】且未读的通知
      const unreadList = allAnns
        .filter(a => {
          if (!a) return false;
          // 延期通知仅通过工作台顶部红点提示，不主动弹窗打扰
          if (a.isExtension || a.title?.includes('延期通知') || a.title?.includes('时间已延长')) return false;

          if (a.taskId && a.taskId !== 'task_all' && a.taskId !== 'all') {
            const tObj = allTasks.find(t => t.id === a.taskId);
            if (tObj && isTaskExpired(tObj)) return false;
          }

          const isMatched = isScopeMatch(a, {
            userClassId: effectiveClassId || currentUser?.classId,
            userGroupId: groupId,
            currentTaskId: activeTaskId,
            userClassName: effectiveClassName
          });

          return isMatched && !isAnnRead(a);
        })
        .sort((a, b) => (b.id > a.id ? 1 : -1));

      // 📢 教师发布的教学指示/课堂通知在工作台自动弹窗提示学生阅读并确认
      if (unreadList.length > 0) {
        this.showAnnouncementModal(unreadList[0], true);
      }
    }

    showAnnouncementModal(targetAnn = null, isSequentialFlow = false) {
      document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
      const currentUser = this.authManager.getCurrentUser();
      const effectiveClassId = this.authManager ? this.authManager.getEffectiveStudentClassId(currentUser, this.state.activeTaskId) : (this.state.activeStudentClassId || currentUser?.classId || null);
      const classes = this.authManager.getClasses();
      const currentClassObj = classes.find(c => c.id === effectiveClassId);
      const effectiveClassName = currentClassObj ? currentClassObj.name : '';
      const activeGroupObj = this.authManager.getStudentActiveGroup(currentUser, effectiveClassId);
      const groupId = this.state.activeGroupId || this.cloudSyncEngine?.groupId || activeGroupObj.id || (currentUser && currentUser.groupId ? currentUser.groupId : 'group_1');
      const isTaskListMode = (this.state && this.state.studentViewMode === 'task_list');
      const activeTaskId = this.state.activeTaskId || null;
      const allAnns = this.authManager.getAnnouncements();

      const isAnnRead = (a) => {
        if (!a) return false;
        try {
          const localReadMap = JSON.parse(localStorage.getItem('jizhi_locally_read_announcements') || '{}');
          if (localReadMap[a.id]) return true;
        } catch (e) {}
        if (currentUser) {
          if (currentUser.id && a.readStatus && a.readStatus[currentUser.id]) return true;
          if (currentUser.studentCode && a.readStatus && a.readStatus[currentUser.studentCode]) return true;
          if (currentUser.username && a.readStatus && a.readStatus[currentUser.username]) return true;
          if (currentUser.name && a.readStatus && a.readStatus[currentUser.name]) return true;
          if (Array.isArray(a.confirmedMembers)) {
            if (a.confirmedMembers.some(m => m && (m.id === currentUser.id || m.studentCode === currentUser.studentCode || (currentUser.name && m.name === currentUser.name)))) return true;
          }
        }
        return false;
      };

      const isExtensionNotice = (a) => !!(a && (a.isExtension || a.title?.includes('延期通知') || a.title?.includes('时间已延长') || a.title?.includes('延长至')));

      // 🎯 教学通知中心展示与统计纯正的【教学任务与作业通知】（延期由瞬时大弹窗处理）
      const myAnns = allAnns
        .filter(a => {
          if (!a) return false;
          if (isExtensionNotice(a)) return false; // 🚫 彻底屏蔽延期通知混入通知中心
          return isScopeMatch(a, {
            userClassId: effectiveClassId || currentUser?.classId,
            userGroupId: groupId,
            currentTaskId: activeTaskId,
            userClassName: effectiveClassName
          });
        })
        .sort((a, b) => (b.id > a.id ? 1 : -1));

      if (myAnns.length === 0) {
        if (!isSequentialFlow) {
          alert('📢 暂无针对当前写作任务的教学通知！');
        }
        return;
      }

      // 选中的通知：仅在传入 targetAnn 时直接进入详情卡片，否则默认展示优雅清晰的竖排通知列表
      const unreadList = myAnns.filter(a => !isAnnRead(a));
      const showDetailDirectly = !!targetAnn;
      const selectedAnn = targetAnn || (unreadList.length > 0 ? unreadList[0] : myAnns[0]);

      const isSelectedRead = selectedAnn ? isAnnRead(selectedAnn) : true;
      const isSelectedExtension = selectedAnn ? isExtensionNotice(selectedAnn) : false;

      const allTasks = this.authManager.getTasks();
      const annTaskObj = selectedAnn ? allTasks.find(t => t.id === selectedAnn.taskId) : null;
      const isAnnTaskExpired = isTaskExpired(annTaskObj);

      const modal = document.createElement('div');
      modal.className = 'modal-overlay modal-announcement-popup';

      const renderListHtml = () => `
        <div style="width:680px; max-width:94vw; background:#ffffff; border-radius:16px; box-shadow:0 25px 50px -12px rgba(15,23,42,0.25); overflow:hidden; border:1px solid #e2e8f0; animation:modalFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);">
          <!-- 渐变高颜值头部 -->
          <div style="background:linear-gradient(135deg, #1d4ed8, #2563eb); padding:20px 24px; display:flex; justify-content:space-between; align-items:center; color:#ffffff;">
            <div style="display:flex; align-items:center; gap:12px;">
              <div style="width:42px; height:42px; border-radius:12px; background:rgba(255,255,255,0.2); display:flex; align-items:center; justify-content:center; font-size:22px; flex-shrink:0;">
                ${isTaskListMode ? '⏳' : '📢'}
              </div>
              <div>
                <div style="display:flex; align-items:center; gap:8px;">
                  <h3 style="margin:0; font-size:17.5px; font-weight:800; color:#ffffff; letter-spacing:0.3px;">${isTaskListMode ? '班级任务延期通知中心' : '班级教学通知中心'}</h3>
                  ${unreadList.length > 0 ? `<span style="background:#ef4444; color:#ffffff; font-size:11px; font-weight:800; padding:2px 8px; border-radius:12px; box-shadow:0 2px 6px rgba(239,68,68,0.4);">${unreadList.length} 条未读</span>` : '<span style="background:rgba(255,255,255,0.2); color:#ffffff; font-size:11px; font-weight:700; padding:2px 8px; border-radius:12px;">全部已读</span>'}
                </div>
                <div style="font-size:12px; color:#e0e7ff; margin-top:3px;">${effectiveClassName ? `🏫 归属班级: ${escapeHtml(effectiveClassName)}` : '任课教师发布的教学指示与任务延期'} · 共 ${myAnns.length} 条通知</div>
              </div>
            </div>
            <button id="btn-close-ann-popup" style="background:rgba(255,255,255,0.15); border:1px solid rgba(255,255,255,0.3); width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:#ffffff; font-size:14px; transition:all 0.15s ease;">✕</button>
          </div>

          <!-- 竖排通知卡片列表 -->
          <div style="padding:20px 24px; max-height:62vh; overflow-y:auto; display:flex; flex-direction:column; gap:12px; background:#f8fafc;">
            ${myAnns.map((a, idx) => {
              const read = isAnnRead(a);
              const ext = isExtensionNotice(a);
              return `
                <div class="btn-open-ann-item" data-id="${a.id}" style="background:#ffffff; border:1.5px solid ${read ? '#e2e8f0' : '#bfdbfe'}; border-radius:12px; padding:15px 18px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; gap:14px; transition:all 0.15s ease; box-shadow:${read ? '0 1px 3px rgba(15,23,42,0.02)' : '0 4px 12px rgba(37,99,235,0.08)'};">
                  <div style="display:flex; align-items:flex-start; gap:12px; min-width:0; flex:1;">
                    <div style="width:36px; height:36px; border-radius:10px; background:${ext ? '#fef3c7' : '#eff6ff'}; display:flex; align-items:center; justify-content:center; font-size:18px; flex-shrink:0; margin-top:2px;">
                      ${ext ? '⏳' : '📢'}
                    </div>
                    <div style="min-width:0; flex:1;">
                      <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px; flex-wrap:wrap;">
                        <span style="font-weight:800; font-size:14.5px; color:#0f172a; line-height:1.4;">${escapeHtml(a.title)}</span>
                        ${read 
                          ? '<span style="background:#ecfdf5; color:#059669; font-size:11px; font-weight:700; padding:1.5px 8px; border-radius:10px; border:1px solid #a7f3d0;">✅ 已读</span>' 
                          : '<span style="background:#fef2f2; color:#dc2626; font-size:11px; font-weight:800; padding:1.5px 8px; border-radius:10px; border:1px solid #fecaca;">🔴 待查看</span>'}
                        ${idx === 0 ? '<span style="background:#eff6ff; color:#2563eb; font-size:10.5px; font-weight:800; padding:1.5px 6px; border-radius:6px; border:1px solid #bfdbfe;">最新</span>' : ''}
                      </div>
                      <div style="font-size:12px; color:#64748b; margin-bottom:6px; display:flex; gap:10px; flex-wrap:wrap;">
                        <span>📌 关联任务: <b>${escapeHtml(a.taskTitle || '写作任务')}</b></span>
                        <span>👨‍🏫 <b>${escapeHtml(a.author || '任课教师')}</b></span>
                        <span>🕒 ${escapeHtml(a.time || '')}</span>
                      </div>
                      <div style="font-size:12.5px; color:#475569; line-height:1.5; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                        ${escapeHtml((a.content || '').substring(0, 75))}${a.content && a.content.length > 75 ? '...' : ''}
                      </div>
                    </div>
                  </div>
                  <div style="background:${read ? '#f1f5f9' : 'linear-gradient(135deg, #1d4ed8, #2563eb)'}; color:${read ? '#475569' : '#ffffff'}; padding:7px 14px; border-radius:8px; font-size:12px; font-weight:700; white-space:nowrap; flex-shrink:0; display:inline-flex; align-items:center; gap:4px;">
                    查看详情 ➔
                  </div>
                </div>
              `;
            }).join('')}
          </div>

          <!-- 底部关闭栏 -->
          <div style="padding:14px 24px; background:#f8fafc; border-top:1px solid #f1f5f9; display:flex; justify-content:flex-end; align-items:center;">
            <button id="btn-close-ann-bottom" style="background:#ffffff; border:1px solid #cbd5e1; color:#475569; padding:9px 22px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer;">
              关闭
            </button>
          </div>
        </div>
      `;

      const renderDetailHtml = (ann) => {
        const isRead = isAnnRead(ann);
        const isExt = isExtensionNotice(ann);
        const annTask = allTasks.find(t => t.id === ann.taskId);
        const isExpired = isTaskExpired(annTask);
        const unreadIdx = unreadList.findIndex(a => a.id === ann.id);

        return `
          <div style="width:640px; max-width:94vw; background:#ffffff; border-radius:16px; box-shadow:0 25px 50px -12px rgba(15,23,42,0.25); overflow:hidden; border:1px solid #e2e8f0; animation:modalFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);">
            <!-- 渐变高颜值头部 -->
            <div style="background:linear-gradient(135deg, ${isExpired ? '#991b1b, #dc2626' : '#1d4ed8, #2563eb'}); padding:18px 22px; display:flex; justify-content:space-between; align-items:center; color:#ffffff;">
              <div style="display:flex; align-items:center; gap:10px;">
                <button id="btn-back-to-list" style="background:rgba(255,255,255,0.2); border:1px solid rgba(255,255,255,0.35); color:#ffffff; padding:5px 12px; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:4px;">
                  ⬅️ 全部通知
                </button>
                <h3 style="margin:0; font-size:16.5px; font-weight:800; color:#ffffff; letter-spacing:0.3px;">${isExt ? '⏳ 任务时间延期通知' : '📢 班级教学指示'}</h3>
              </div>
              <button id="btn-close-ann-popup" style="background:rgba(255,255,255,0.15); border:1px solid rgba(255,255,255,0.3); width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:#ffffff; font-size:14px; transition:all 0.15s ease;">✕</button>
            </div>

            <!-- 通知内容主体 -->
            <div style="padding:20px 24px; max-height:60vh; overflow-y:auto; display:flex; flex-direction:column; gap:16px;">
              <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:14px; padding:18px; box-shadow:0 2px 8px rgba(15,23,42,0.03);">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px; margin-bottom:12px;">
                  <h4 style="margin:0; font-size:16.5px; font-weight:800; color:#0f172a; line-height:1.4;">
                    📌 ${escapeHtml(ann.title)}
                  </h4>
                  <span style="font-size:11.5px; color:#64748b; white-space:nowrap;">${escapeHtml(ann.time || '')}</span>
                </div>

                <!-- 标签栏 -->
                <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:14px;">
                  <span style="background:#f8fafc; color:#475569; border:1px solid #e2e8f0; padding:3px 10px; border-radius:6px; font-size:11.5px; font-weight:700;">
                    👨‍🏫 发布教师: <b>${escapeHtml(ann.author || '任课教师')}</b>
                  </span>
                  <span style="background:#f5f3ff; color:#7c3aed; border:1px solid #ddd6fe; padding:3px 10px; border-radius:6px; font-size:11.5px; font-weight:700;">
                    📌 关联任务: <b>${escapeHtml(ann.taskTitle || '写作任务')}</b>
                  </span>
                  <span style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; padding:3px 10px; border-radius:6px; font-size:11.5px; font-weight:700;">
                    🎯 受众: <b>${escapeHtml(ann.targetGroupName || '全班小组')}</b>
                  </span>
                  ${isExt ? `
                    <span style="background:#fef3c7; color:#b45309; border:1px solid #fde68a; padding:3px 10px; border-radius:6px; font-size:11.5px; font-weight:700;">
                      ⏳ 延期信息
                    </span>
                  ` : (isRead ? `
                    <span style="background:#ecfdf5; color:#059669; border:1px solid #a7f3d0; padding:3px 10px; border-radius:6px; font-size:11.5px; font-weight:700;">
                      ✅ 本组已确认阅读
                    </span>
                  ` : `
                    <span style="background:#fef2f2; color:#dc2626; border:1px solid #fecaca; padding:3px 10px; border-radius:6px; font-size:11.5px; font-weight:700;">
                      🔴 待确认阅读
                    </span>
                  `)}
                </div>

                <!-- 正文卡片 -->
                <div style="background:#f8fafc; border:1px solid #f1f5f9; border-radius:10px; padding:14px 16px; font-size:13.5px; color:#334155; line-height:1.7; white-space:pre-wrap; word-break:break-word;">
                  ${escapeHtml(ann.content || '')}
                </div>

                <!-- 附件卡片 (如有) -->
                ${ann.attachment ? `
                  <div style="margin-top:14px; background:#faf5ff; border:1px solid #e9d5ff; border-radius:10px; padding:12px 16px; display:flex; justify-content:space-between; align-items:center; gap:12px;">
                    <div style="display:flex; align-items:center; gap:10px;">
                      <span style="font-size:24px;">📎</span>
                      <div>
                        <div style="font-size:13px; font-weight:700; color:#6b21a8;">${ann.attachment.name}</div>
                        <div style="font-size:11px; color:#9333ea; margin-top:2px;">教学随附资源文献 (${ann.attachment.size || '附件'})</div>
                      </div>
                    </div>
                    <button id="btn-download-ann-file" style="background:linear-gradient(135deg, #7c3aed, #6366f1); border:none; color:white; padding:7px 16px; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:6px; box-shadow:0 2px 6px rgba(124,58,237,0.25); white-space:nowrap;">
                      📥 下载资源文件
                    </button>
                  </div>
                ` : ''}
              </div>
            </div>

            <!-- 底部操作栏 -->
            <div style="padding:14px 24px; background:#f8fafc; border-top:1px solid #f1f5f9; display:flex; justify-content:space-between; align-items:center; gap:12px;">
              <button id="btn-close-ann-bottom" style="background:#ffffff; border:1px solid #cbd5e1; color:#475569; padding:10px 20px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer;">
                关闭
              </button>
              ${(isTaskListMode || isExt) ? `
                <button id="btn-ext-got-it" style="flex:1; background:linear-gradient(135deg, #1d4ed8, #2563eb); color:#ffffff; border:none; padding:11px 24px; border-radius:8px; font-size:13.5px; font-weight:700; cursor:pointer; box-shadow:0 3px 10px rgba(37,99,235,0.25);">
                  我知道了 (关闭)
                </button>
              ` : `
                <button id="btn-read-confirm" style="flex:1; background:${isRead ? '#e2e8f0' : 'linear-gradient(135deg, #059669, #047857)'}; color:${isRead ? '#64748b' : '#ffffff'}; border:none; padding:11px 24px; border-radius:8px; font-size:13.5px; font-weight:700; cursor:pointer; box-shadow:${isRead ? 'none' : '0 3px 10px rgba(5,150,105,0.2)'}; display:inline-flex; align-items:center; justify-content:center; gap:6px;">
                  ${isRead ? '✅ 本条已确认已读 (点击关闭)' : (unreadList.length > 1 ? `✅ 确认本条已读并看下一条 (${unreadIdx + 1}/${unreadList.length}) ➔` : '✅ 我已阅读并确认 (已同步至教师端)')}
                </button>
              `}
            </div>
          </div>
        `;
      };

      const closeModal = () => {
        modal.remove();
        document.removeEventListener('keydown', onEsc);
        // ⚡ 0 延迟即时刷新右上角【教学通知】红点角标
        const bellBtn = document.getElementById('btn-header-ann-bell');
        if (bellBtn) {
          const curAllAnns = this.authManager.getAnnouncements();
          const curUnread = curAllAnns.filter(a => {
            if (!a || isExtensionNotice(a)) return false;
            const mClass = !a.classId || a.classId === 'all' || a.classId === effectiveClassId;
            const mTask = !a.taskId || a.taskId === 'task_all' || a.taskId === activeTaskId;
            return mClass && mTask && !isAnnRead(a);
          });
          if (curUnread.length === 0) {
            bellBtn.classList.remove('has-unread');
            const badge = bellBtn.querySelector('span:not(:first-child)');
            if (badge) badge.remove();
          } else {
            bellBtn.classList.add('has-unread');
            let badge = bellBtn.querySelector('span:not(:first-child)');
            if (badge) {
              badge.innerText = curUnread.length;
            } else {
              const newBadge = document.createElement('span');
              newBadge.style.cssText = 'background:#ef4444; color:#ffffff; font-size:10.5px; font-weight:800; padding:1px 6px; border-radius:10px; box-shadow:0 1px 4px rgba(239,68,68,0.4);';
              newBadge.innerText = curUnread.length;
              bellBtn.appendChild(newBadge);
            }
          }
        }
        if (this.state.studentViewMode === 'task_list') {
          this.renderMain();
        }
      };

      const onEsc = (e) => {
        if (e.key === 'Escape') {
          closeModal();
        }
      };
      document.addEventListener('keydown', onEsc);

      const attachListEvents = () => {
        modal.querySelector('#btn-close-ann-popup')?.addEventListener('click', closeModal);
        modal.querySelector('#btn-close-ann-bottom')?.addEventListener('click', closeModal);
        modal.querySelectorAll('.btn-open-ann-item').forEach(card => {
          card.addEventListener('click', () => {
            const annId = card.dataset.id;
            const target = myAnns.find(a => a.id === annId);
            if (target) {
              showDetail(target);
            }
          });
        });
      };

      const showDetail = (ann) => {
        // 查阅即自动消除红点，无需强制二次确认
        try {
          this.authManager.markAnnouncementRead(ann.id, groupId);
        } catch (e) {}

        modal.innerHTML = renderDetailHtml(ann);
        attachDetailEvents(ann);
      };

      const attachDetailEvents = (ann) => {
        modal.querySelector('#btn-close-ann-popup')?.addEventListener('click', closeModal);
        modal.querySelector('#btn-close-ann-bottom')?.addEventListener('click', closeModal);
        modal.querySelector('#btn-back-to-list')?.addEventListener('click', () => {
          modal.innerHTML = renderListHtml();
          attachListEvents();
        });

        modal.querySelector('#btn-ext-got-it')?.addEventListener('click', () => {
          this.authManager.markAnnouncementRead(ann.id, groupId);
          closeModal();
        });

        modal.querySelector('#btn-read-confirm')?.addEventListener('click', () => {
          this.authManager.markAnnouncementRead(ann.id, groupId);
          const myName = currentUser ? currentUser.name : '学生';
          this.authManager.markAnnouncementConfirmed(ann.id, currentUser ? (currentUser.id || currentUser.studentCode || currentUser.name) : (currentUser?.studentCode || currentUser?.id || ''), myName, groupId);

          const remainingUnread = unreadList.filter(a => a.id !== ann.id && !a.isExtension && !a.title?.includes('延期通知'));
          if (remainingUnread.length > 0) {
            showDetail(remainingUnread[0]);
          } else {
            closeModal();
          }
        });

        const downloadBtn = modal.querySelector('#btn-download-ann-file');
        if (downloadBtn && ann.attachment) {
          downloadBtn.onclick = (e) => {
            if (e) { e.preventDefault(); e.stopPropagation(); }
            const att = ann.attachment;
            const attObj = typeof att === 'string' ? (JSON.parse(att) || { url: att, name: '随附教学文献.pdf' }) : att;
            const attName = attObj.name || attObj.fileName || `${ann.title || '教学随附文献'}.pdf`;
            const attUrl = attObj.url || attObj.fileUrl || attObj.fileData || attObj.path;
            downloadFileBlob(attName, null, attUrl);
          };
        }
      };

      if (showDetailDirectly && selectedAnn) {
        modal.innerHTML = renderDetailHtml(selectedAnn);
        attachDetailEvents(selectedAnn);
      } else {
        modal.innerHTML = renderListHtml();
        attachListEvents();
      }

      modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
      document.body.appendChild(modal);
    }

    showQuestionnaireModal() {
      document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
      const currentUser = this.authManager.getCurrentUser();
      const currentClassId = currentUser && currentUser.classId ? currentUser.classId : 'class_101';
      const currentTaskId = this.state.activeTaskId || null;
      const tasks = this.authManager.getTasks();
      const currTaskObj = tasks.find(t => t.id === currentTaskId);
      const taskTitle = currTaskObj ? currTaskObj.title : '指定写作任务';
      const surveyUrl = this.authManager.getSurveyUrl(currentClassId, currentTaskId);
      const isConfigured = surveyUrl && surveyUrl.startsWith('http');
      const surveyDoneKey = `jizhi_survey_completed_${currentClassId}_${currentTaskId}`;

      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div style="width:520px; max-width:92vw; background:#ffffff; border-radius:16px; box-shadow:0 20px 45px rgba(15,23,42,0.18); overflow:hidden; border:1px solid #e2e8f0; animation:modalFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);">

          <!-- 优雅明亮头部 -->
          <div style="padding:22px 24px 18px 24px; border-bottom:1px solid #f1f5f9; display:flex; justify-content:space-between; align-items:center; background:#ffffff;">
            <div style="display:flex; align-items:center; gap:12px;">
              <div style="width:40px; height:40px; border-radius:10px; background:#eff6ff; border:1px solid #bfdbfe; display:flex; align-items:center; justify-content:center; font-size:20px; color:#2563eb; flex-shrink:0;">
                📋
              </div>
              <div>
                <h3 style="margin:0; font-size:17px; font-weight:800; color:#0f172a;">课程协作学习与体验问卷</h3>
                <div style="font-size:12px; color:#64748b; margin-top:2px;">📌 当前任务: <b style="color:#2563eb;">${taskTitle}</b></div>
              </div>
            </div>
            <button id="btn-close-survey-modal" style="background:#f8fafc; border:1px solid #e2e8f0; width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:#64748b; font-size:14px; transition:all 0.15s ease;">✕</button>
          </div>

          <!-- 内容主体 -->
          <div style="padding:24px; display:flex; flex-direction:column; gap:18px;">

            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:14px 16px; font-size:13px; color:#334155; line-height:1.6;">
              为评估本任务（<b>${taskTitle}</b>）的协作效果，请同学们点击下方按钮前往填写匿名问卷。
            </div>

            <!-- 跳转按钮区域 -->
            <div style="background:#ffffff; border:1.5px dashed #bfdbfe; border-radius:12px; padding:22px 18px; text-align:center;">
              ${isConfigured ? `
                <a href="${surveyUrl}" target="_blank" id="btn-go-survey" style="display:inline-flex; align-items:center; justify-content:center; gap:8px; background:linear-gradient(135deg, #1d4ed8, #2563eb); color:#ffffff; padding:12px 32px; border-radius:10px; font-size:14px; font-weight:700; text-decoration:none; box-shadow:0 4px 12px rgba(37,99,235,0.25); transition:transform 0.15s ease;">
                  🚀 打开本任务问卷页面 ↗
                </a>
                <div style="font-size:11.5px; color:#94a3b8; margin-top:10px; word-break:break-all;">
                  问卷地址: <span style="color:#2563eb;">${surveyUrl}</span>
                </div>
              ` : `
                <div style="color:#d97706; font-size:13px; font-weight:600;">
                  ⚠️ 任课教师暂未为【${taskTitle}】配置独立问卷链接。
                </div>
              `}
            </div>

            <!-- 勾选确认 -->
            <div style="display:flex; align-items:center; gap:10px; background:#eff6ff; border:1px solid #bfdbfe; border-radius:10px; padding:12px 16px;">
              <input type="checkbox" id="chk-survey-done" style="width:17px; height:17px; cursor:pointer; accent-color:#2563eb;" ${localStorage.getItem(surveyDoneKey) === 'true' ? 'checked' : ''}>
              <label for="chk-survey-done" style="font-size:13px; font-weight:700; color:#1e40af; cursor:pointer; user-select:none;">
                我已完成【${taskTitle}】的问卷填写并提交
              </label>
            </div>

          </div>

          <!-- 底部确认关闭 -->
          <div style="padding:16px 24px; background:#f8fafc; border-top:1px solid #f1f5f9; display:flex; justify-content:flex-end;">
            <button id="btn-finish-survey" style="width:100%; background:linear-gradient(135deg, #1d4ed8, #2563eb); color:#ffffff; border:none; padding:11px 24px; border-radius:10px; font-size:13.5px; font-weight:700; cursor:pointer; box-shadow:0 2px 8px rgba(37,99,235,0.2);">
              完成并返回工作台
            </button>
          </div>

        </div>
      `;
      document.body.appendChild(modal);

      const closeModal = () => modal.remove();
      modal.querySelector('#btn-close-survey-modal').addEventListener('click', closeModal);
      modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
      modal.querySelector('#chk-survey-done').addEventListener('change', (e) => {
        localStorage.setItem(surveyDoneKey, e.target.checked ? 'true' : 'false');
      });
      modal.querySelector('#btn-finish-survey').addEventListener('click', () => {
        closeModal();
        this.renderStudentWorkspace();
      });
    }

    showReferencePapersModal() {
      document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
      const user = this.authManager.getCurrentUser();
      const groupId = user && user.groupId ? user.groupId : (this.state.activeMonitorGroupId || this.state.activeGroupId || null);
      const classId = user ? user.classId : null;
      const activeTaskId = (this.state && this.state.activeTaskId) ? this.state.activeTaskId : 'task_default';
      const papers = this.authManager.getReferencePapers(groupId, classId, activeTaskId);

      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div style="width:720px; max-width:95vw; background:#ffffff; border-radius:16px; box-shadow:0 25px 50px -12px rgba(15,23,42,0.25); overflow:hidden; border:1px solid #e2e8f0; animation:modalFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);">

          <!-- 渐变典雅头部 -->
          <div style="background:linear-gradient(135deg, #1e40af, #2563eb); padding:20px 24px; display:flex; justify-content:space-between; align-items:center; color:#ffffff;">
            <div style="display:flex; align-items:center; gap:12px;">
              <div style="width:42px; height:42px; border-radius:12px; background:rgba(255,255,255,0.2); display:flex; align-items:center; justify-content:center; font-size:22px; flex-shrink:0;">
                📚
              </div>
              <div>
                <h3 style="margin:0; font-size:17.5px; font-weight:800; color:#ffffff;">课程学术参考范文库 (${papers.length} 篇)</h3>
                <div style="font-size:12px; color:#bfdbfe; margin-top:2px;">任课教师下发的高水平学术论文样例与审稿编辑重点推荐文献</div>
              </div>
            </div>
            <button id="btn-close-ref-modal" style="background:rgba(255,255,255,0.15); border:1px solid rgba(255,255,255,0.3); width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:#ffffff; font-size:14px; transition:all 0.15s ease;">✕</button>
          </div>

          <div style="padding:20px 24px; max-height:62vh; overflow-y:auto;">
            ${papers.length === 0 ? `
              <div style="text-align:center; padding:36px; background:#f8fafc; border-radius:12px; border:2px dashed #cbd5e1;">
                <div style="font-size:36px; margin-bottom:8px;">📚</div>
                <div style="font-size:15px; font-weight:800; color:#0f172a;">暂无任课教师下发的参考范文</div>
                <div style="font-size:12.5px; color:#64748b; margin-top:4px;">教师在教师端上传范文后将自动在此呈现，审稿编辑 Agent 亦会在研讨管道中实时推荐！</div>
              </div>
            ` : `
              <div style="display:flex; flex-direction:column; gap:16px;">
                ${papers.map(p => `
                  <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:18px; box-shadow:0 2px 6px rgba(15,23,42,0.03); transition:all 0.2s ease;">

                    <!-- 标题与标签行 -->
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:10px;">
                      <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                        <span style="font-size:16px; font-weight:800; color:#0f172a; line-height:1.4;">📄 ${p.title}</span>
                        <span style="background:#f5f3ff; color:#7c3aed; border:1px solid #ddd6fe; padding:2px 8px; border-radius:6px; font-size:11px; font-weight:700;">
                          ${p.targetGroupName || '全员可见'}
                        </span>
                      </div>
                      <span style="font-size:11.5px; color:#94a3b8; white-space:nowrap;">${p.uploadTime || ''}</span>
                    </div>

                    <!-- 论证亮点引言框 -->
                    <div style="background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; padding:10px 14px; font-size:12.5px; color:#0369a1; line-height:1.6; margin-bottom:12px;">
                      <b>💡 核心论证亮点与学术价值（审稿编辑重点推荐）：</b><br>
                      ${p.keyHighlights || '论文整体架构严谨，包含完整三线表规范与严密的学术论证逻辑。'}
                    </div>

                    ${p.abstract ? `
                      <div style="font-size:12px; color:#64748b; line-height:1.6; margin-bottom:12px;">
                        <b>摘要要点：</b>${p.abstract}
                      </div>
                    ` : ''}

                    <!-- 底部通栏：上传人与下载按钮 -->
                    <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid #f1f5f9; padding-top:12px; margin-top:4px;">
                      <div style="font-size:12px; color:#64748b; display:flex; align-items:center; gap:12px;">
                        <span>上传人: <b style="color:#334155;">${p.author || '任课教师'}</b></span>
                        ${p.fileSize ? `<span style="color:#cbd5e1;">|</span><span>文件大小: <b>${p.fileSize}</b></span>` : ''}
                      </div>
                      ${(p.fileName || p.fileUrl || p.fileData || p.title) ? `
                        <button class="btn-download-ref-item" data-id="${p.id}" style="background:linear-gradient(135deg, #1d4ed8, #2563eb); border:none; color:white; padding:7px 18px; border-radius:8px; font-size:12.5px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:6px; box-shadow:0 2px 6px rgba(37,99,235,0.2);">
                          📥 下载并查阅随附文献
                        </button>
                      ` : '<span style="font-size:12px; color:#94a3b8;">无附件文件 (仅查阅重点指引)</span>'}
                    </div>

                  </div>
                `).join('')}
              </div>
            `}
          </div>

          <div style="background:#f8fafc; border-top:1px solid #e2e8f0; padding:14px 24px; display:flex; justify-content:flex-end;">
            <button class="modal-btn submit task-theme" id="btn-finish-ref-modal" style="width:100%; padding:11px 24px; font-size:14px; font-weight:700; border-radius:8px;">返回协作写作界面</button>
          </div>

        </div>
      `;
      document.body.appendChild(modal);

      const closeModal = () => modal.remove();
      modal.querySelector('#btn-close-ref-modal').addEventListener('click', closeModal);
      modal.querySelector('#btn-finish-ref-modal').addEventListener('click', closeModal);
      modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

      modal.querySelectorAll('.btn-download-ref-item').forEach(btn => {
        btn.onclick = (e) => {
          if (e) { e.preventDefault(); e.stopPropagation(); }
          const paperId = btn.dataset.id;
          const paper = papers.find(p => p.id === paperId);
          if (paper) {
            const fileName = paper.fileName || `${paper.title || '学术参考范文'}.pdf`;
            const fileData = paper.fileUrl || paper.fileData || (window._paperMemoryBlobMap && window._paperMemoryBlobMap.get(paperId));
            downloadFileBlob(fileName, null, fileData);
          }
        };
      });
    }

    handleLogout() { 
      const user = this.authManager.getCurrentUser();
      if (user) {
        const uCode = user.studentCode || user.id || user.username;
        if (this.state.presence) {
          delete this.state.presence[uCode];
          if (user.id) delete this.state.presence[user.id];
          if (user.studentCode) delete this.state.presence[user.studentCode];
        }
        if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
      }
      this.authManager.logout(); 
      this.state.studentViewMode = 'task_list';
      sessionStorage.removeItem('jizhi_student_view_mode');
      localStorage.removeItem('jizhi_student_view_mode');
      this.renderMain(); 
    }

    backToTaskList() {
      this.state.studentViewMode = 'task_list';
      this.state.activeTaskId = null;
      this.state.activeTaskTitle = null;
      sessionStorage.setItem('jizhi_student_view_mode', 'task_list');
      sessionStorage.removeItem('jizhi_active_task_id');
      localStorage.setItem('jizhi_student_view_mode', 'task_list');
      localStorage.removeItem('jizhi_active_task_id');
      if (this.cloudSyncEngine) this.cloudSyncEngine.stopPolling();
      this.renderMain();
    }

    showTaskRevokedModal(taskTitle = '写作任务') {
      // 🛡️ 立即锁定撤销状态，并把全局状态直接切回任务大厅模式，终止工作台同步
      this._isHandlingTaskRevoked = true;
      this.state.studentViewMode = 'task_list';
      this.state.activeTaskId = null;
      this.state.activeTaskTitle = null;
      sessionStorage.setItem('jizhi_student_view_mode', 'task_list');
      sessionStorage.removeItem('jizhi_active_task_id');
      localStorage.setItem('jizhi_student_view_mode', 'task_list');
      localStorage.removeItem('jizhi_active_task_id');
      if (this.cloudSyncEngine) this.cloudSyncEngine.stopPolling();

      // 立即切回大厅底层视图
      this.renderMain();

      // 确保弹窗在最顶层且全场仅保留 1 个
      document.querySelectorAll('.modal-task-deleted-overlay').forEach(el => el.remove());
      const modal = document.createElement('div');
      modal.className = 'modal-overlay modal-task-deleted-overlay';
      modal.style.cssText = 'z-index:999999; display:flex; align-items:center; justify-content:center; position:fixed; inset:0; background:rgba(15,23,42,0.65); backdrop-filter:blur(4px);';
      modal.innerHTML = `
        <div class="modal-card" style="background:#fff; border-radius:14px; max-width:440px; width:90%; padding:28px 24px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.25); text-align:center; animation:modalPop 0.25s cubic-bezier(0.16,1,0.3,1);">
          <div style="width:54px; height:54px; border-radius:50%; background:#fee2e2; color:#ef4444; display:flex; align-items:center; justify-content:center; margin:0 auto 16px; font-size:26px;">⚠️</div>
          <h3 style="margin:0 0 10px; font-size:19px; color:#0f172a; font-weight:700;">任务已被教师撤销</h3>
          <p style="margin:0 0 24px; font-size:14px; color:#475569; line-height:1.65;">
            当前协作任务《<b>${escapeHtml(taskTitle)}</b>》已被任课教师从系统撤销或删除。<br/>
            系统已为你安全返回任务大厅。
          </p>
          <button id="btn-return-portal-revoked" class="btn btn-primary" style="width:100%; padding:12px 18px; font-size:15px; font-weight:600; border-radius:8px; background:#2563eb; color:#fff; border:none; cursor:pointer;">我知道了</button>
        </div>
      `;
      document.body.appendChild(modal);

      const closeModal = () => {
        if (document.body.contains(modal)) {
          modal.remove();
        }
      };

      modal.querySelector('#btn-return-portal-revoked')?.addEventListener('click', closeModal);
      // 4 秒自动淡出关闭弹窗
      setTimeout(closeModal, 4000);
    }

    renderHeader() {
      const currentUser = this.authManager.getCurrentUser();
      const headerEl = document.querySelector('.header-wrapper') || document.querySelector('.header');
      if (!headerEl) return;
      renderHeader(
        this.state, currentUser, this.authManager.getAnnouncements(),
        (s) => this.switchStage(s), (sp) => this.setSpeed(sp),
        () => this.handleLogout(), () => this.switchToTeacherView(),
        () => this.showAnnouncementModal(), () => this.showQuestionnaireModal(),
        () => this.backToTaskList()
      );
    }

    switchToTeacherView() {
      const users = this.authManager.getUsers();
      const teacher = users.find(u => u.role === 'teacher') || users[0];
      sessionStorage.setItem('jizhi_current_user', JSON.stringify(teacher));
      localStorage.setItem('jizhi_current_user', JSON.stringify(teacher));
      this.renderMain();
    }

    initStudentEvents() {
      const input = document.getElementById('chat-input');
      const sendBtn = document.getElementById('send-btn');
      const emojiBar = document.getElementById('emoji-bar');
      const atMentionMenu = document.getElementById('at-mention-menu');
      if (!input || !sendBtn) return;

      if (emojiBar) {
        emojiBar.querySelectorAll('.emoji-btn').forEach(btn => {
          btn.addEventListener('click', () => { input.value += btn.dataset.emoji; input.focus(); });
        });
      }

      const btnUploadImg = document.getElementById('btn-chat-upload-img');
      const fileInputImg = document.getElementById('chat-img-file-input');
      if (btnUploadImg && fileInputImg) {
        btnUploadImg.addEventListener('click', () => fileInputImg.click());
        fileInputImg.addEventListener('change', (e) => {
          if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const currentUser = this.authManager.getCurrentUser();
            const studentCode = currentUser ? (currentUser?.name || currentUser?.studentCode || currentUser?.id) : 'A';
            const currentStage = this.state.currentStage || 'stage1';

            // 🛡️ 纯正文件上传：直传服务端 uploads/ 目录获取物理 HTTP URL，彻底杜绝 Base64 膨胀
            const fd = new FormData();
            fd.append('file', file);
            fd.append('userId', studentCode);

            fetch('sync.php?action=upload_file', {
              method: 'POST',
              body: fd
            })
            .then(res => res.json())
            .then(resData => {
              const finalUrl = (resData && resData.url) ? resData.url : '';
              if (!finalUrl) {
                alert('图片上传失败，请检查网络或文件格式');
                return;
              }
              const msgObj = {
                id: 'msg_img_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
                sender: studentCode,
                senderName: currentUser ? currentUser.name : studentCode,
                text: `[IMG_DATA]:${finalUrl}`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                _timeMs: Date.now()
              };
              if (!this.state.chatLogs[currentStage]) this.state.chatLogs[currentStage] = [];
              this.state.chatLogs[currentStage].push(msgObj);
              this.sendSingleChatMessage(msgObj, currentStage);
              renderChat(this.state);
            })
            .catch(err => {
              alert('图片上传网络异常，请重试');
            })
            .finally(() => {
              fileInputImg.value = '';
            });
          }
        });
      }

      let isComposing = false;
      input.addEventListener('compositionstart', () => { isComposing = true; });
      input.addEventListener('compositionend', () => { isComposing = false; });
      input.addEventListener('blur', () => { isComposing = false; });

      input.addEventListener('input', (e) => {
        const val = input.value;
        const lastChar = val.slice(-1);
        if (lastChar === '@' || (val.includes('@') && !val.includes(' '))) atMentionMenu.style.display = 'block';
        else if (!val.includes('@')) atMentionMenu.style.display = 'none';
      });

      atMentionMenu.querySelectorAll('.at-item').forEach(item => {
        item.addEventListener('click', () => {
          const mentionTag = item.dataset.mention;
          const lastAtIndex = input.value.lastIndexOf('@');
          if (lastAtIndex !== -1) input.value = input.value.substring(0, lastAtIndex) + mentionTag + ' ';
          else input.value += mentionTag + ' ';
          atMentionMenu.style.display = 'none';
          input.focus();
        });
      });

      const handleSend = () => {
        const text = input.value.trim();
        if (!text) return;
        const currentUser = this.authManager.getCurrentUser();
        const studentCode = currentUser ? (currentUser.studentCode || currentUser.id || 'student') : 'student';
        const studentName = currentUser ? currentUser.name : '组员';
        const currentStage = this.state.currentStage;
        const msgObj = { 
          id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
          sender: studentCode, 
          senderName: studentName,
          text, 
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          _timeMs: Date.now()
        };
        if (!this.state.chatLogs[currentStage]) this.state.chatLogs[currentStage] = [];
        this.state.chatLogs[currentStage].push(msgObj);
        input.value = '';
        atMentionMenu.style.display = 'none';
        this.studentMsgCountSinceLastAgent += 1;

        // 仅在后台记录发言条数供智能体认知使用，绝对不混入页面写作字数贡献比中
        if (!this.state.studentChatCounts) this.state.studentChatCounts = {};
        this.state.studentChatCounts[studentCode] = (this.state.studentChatCounts[studentCode] || 0) + 1;

        this.syncChatLogs();
        renderChat(this.state);

        // ── 智能体答疑：仅当学生在聊天中显式 @智能体 时才触发大模型定向即时答疑 ──
        this.triggerAgentReplyIfNeeded(text);
        // 记录发送历史供极速双击防重
        input._lastSendTime = Date.now();
        input._lastSendText = text;
      };

      sendBtn.onclick = handleSend;
      input.onkeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          // 🛡️ Safari / WebKit 中文输入法合成防吞字：若处于输入法选词状态或 keyCode 229，绝对禁止触发发送与清空
          if (isComposing || e.isComposing || e.keyCode === 229 || window._isGlobalComposing || (e.nativeEvent && e.nativeEvent.isComposing)) return;
          const now = Date.now();
          if (input._lastSendTime && (now - input._lastSendTime < 80) && input._lastSendText === input.value.trim()) {
            return;
          }
          e.preventDefault();
          handleSend();
        }
      };
    }

    // updateContributionUi() 已在 L258 定义（含 getElementById 精确选择器），此处不再重复覆盖

    // 🎧 情绪安抚定时巡检：即便无人发言也按固定周期检查是否存在未安抚的负向情绪并介入（审查 #45）
    checkEmotionComfort(currentStage) {
      if (!this.pendingNegativeEmotion) return;
      const now = Date.now();
      if ((now - this.pendingNegativeEmotion.time) <= 60000) return;
      if (this.lastEmotionNudgeTime && (now - this.lastEmotionNudgeTime) <= 180000) return;

      this.lastEmotionNudgeTime = now;
      const stage = currentStage || this.state.currentStage;
      let targetAgent = 'managingEditor';
      let emotionText = '';

      if (stage === 'stage1') {
        targetAgent = 'auctioneer';
        emotionText = `🎪 【拍卖师·选题启发与支持】：关注到大家在选题确定上有些纠结或顾虑～头脑风暴期思路碰撞非常正常，建议大家先放平心态，多看看彼此提案里最感兴趣的亮点，求同存异、相互融合，共同商定一个大家都认可的研究方向！`;
      } else if (stage === 'stage2') {
        targetAgent = 'managingEditor';
        emotionText = `🤝 【责任编辑·协同支持】：关注到大家在正文起草中遇到了难点！学术写作本身就是一个不断推敲和修改的过程，遇到卡点非常正常。大家可以在群里沟通具体哪个环节需要支持，全组协同探讨、相互补强，稳步推进！`;
      } else {
        targetAgent = 'neutral';
        emotionText = `🟡 【中间委员·学术答辩启发】：学术答辩中的尖锐质询正是让方案更加严谨的宝贵契机！反方的质询指出了可以进一步强化的空间，建议结合正方刚才提到的优势，从具体操作化补救的角度从容辩护！`;
      }

      const emotionPromptMsg = {
        sender: targetAgent,
        text: emotionText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        _timeMs: now
      };
      this.pendingNegativeEmotion = null;
      setTimeout(() => {
        if (!this.state.chatLogs[stage]) this.state.chatLogs[stage] = [];
        this.state.chatLogs[stage].push(emotionPromptMsg);
        this.syncChatLogs();
        if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
        renderChat(this.state);
      }, 1500);
    }

    async triggerAgentReplyIfNeeded(userMsg) {
      // 🛡️ 并发锁：防止快速发送多条 @消息 导致 AI 回复乱序
      if (this._isAgentReplyInProgress) return;
      this._isAgentReplyInProgress = true;
      const stage = this.state.currentStage;
      const isExplicitMention = userMsg.includes('@');

      if (!isExplicitMention) {
        this._isAgentReplyInProgress = false;
        return;
      }

      let replyAgent = null;

      if (userMsg.includes('@中间委员') || userMsg.includes('@中间委员 Agent')) {
        replyAgent = 'neutral';
      } else if (userMsg.includes('@正方委员') || userMsg.includes('@正方委员 Agent')) {
        replyAgent = 'proponent';
      } else if (userMsg.includes('@反方委员') || userMsg.includes('@反方委员 Agent')) {
        replyAgent = 'opponent';
      } else if (userMsg.includes('@审稿编辑') || userMsg.includes('@审稿编辑 Agent')) {
        replyAgent = 'reviewingEditor';
      } else if (userMsg.includes('@责任编辑') || userMsg.includes('@责任编辑 Agent')) {
        replyAgent = 'managingEditor';
      } else if (userMsg.includes('@拍卖师') || userMsg.includes('@拍卖师 Agent')) {
        replyAgent = 'auctioneer';
      }

      if (!replyAgent) {
        this._isAgentReplyInProgress = false;
        return;
      }

      this.studentMsgCountSinceLastAgent = 0;
      const currentUser = this.authManager.getCurrentUser();
      const currentTopic = this.state.stage1 ? this.state.stage1.mergedTitle : '';
      const actualDocContent = (this.state.stage2 && this.state.stage2.unifiedContent) ? this.state.stage2.unifiedContent.replace(/<[^>]*>/g, '').trim() : '';

      // 💡 异步非阻塞体验：立即插入动态思考气泡，学生无需干等，可自由打字与交流！
      const agentProfile = AgentProfiles[replyAgent] || { name: '智能体' };
      const tempThinkingId = 'thinking_' + Date.now();
      const thinkingMsg = {
        id: tempThinkingId,
        sender: replyAgent,
        text: `⏳ 【${agentProfile.name}】：正在通读小组论文并起草学术意见...`,
        isThinking: true,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        _timeMs: Date.now()
      };
      if (!this.state.chatLogs[stage]) this.state.chatLogs[stage] = [];
      this.state.chatLogs[stage].push(thinkingMsg);
      renderChat(this.state);

      try {
        // 异步直连 Coze API 获得真实大模型智能体深度审阅回复
        let replyText = await callCozeAgentAPI(replyAgent, userMsg, {
          stage: stage,
          topic: currentTopic,
          actualDoc: actualDocContent,
          userId: currentUser ? (currentUser.id || currentUser.username) : 'student_user'
        });

        if (!replyText || replyText.trim().length === 0) {
          thinkingMsg.text = `⚠️ 【${agentProfile.name}提示】：大模型生成超时或网络稍有延迟，可随时在讨论区再次 @ 发送提问。`;
        } else {
          thinkingMsg.text = replyText.trim();
        }
        delete thinkingMsg.isThinking;
        this.syncChatLogs();
        renderChat(this.state);
      } catch (err) {
        thinkingMsg.text = `⚠️ 【${agentProfile.name}提示】：网络连接波动，请稍后重试。`;
        delete thinkingMsg.isThinking;
        this.syncChatLogs();
        renderChat(this.state);
      } finally {
        this._isAgentReplyInProgress = false;
      }
    }

    /**
     * 💡 阶段一：学生提交/修改提案时，拍卖师调用大模型给出学术亮点速评与探究启发
     */
    async handleProposalSubmittedAIFeedback(title, authorName, isModify = false) {
      const currentStage = this.state.currentStage || 'stage1';
      if (!this.state.chatLogs[currentStage]) this.state.chatLogs[currentStage] = [];

      const taskPrompt = `小组成员【${authorName}】在选题池${isModify ? '修改完善了' : '提出了新'}研究提案《${title}》。
  请作为资深学术拍卖师，发表 60~80 字的【选题学术亮点速评与启发】：
  ① 精准肯定该选题的研究切入点或实践价值；
  ② 给出 1 点前瞻性探究启发，鼓励全组在研讨区就此交流！纯自然语言，60~80字，严禁代码块。`;

      try {
        const resp = await callCozeAgentAPI('auctioneer', taskPrompt, { stage: 'stage1', topic: title });
        let speech = (resp && resp.trim().length > 0) ? resp.trim() : `收到 ${authorName} ${isModify ? '修改后的' : '提交的'}《${title}》！切入点明确，建议组员在研讨区就具体的研究对象与实施情境交流补充！`;

        // 🛡️ 智能清洗并统一前缀，彻底杜绝重复套娃（如 🎪 【拍卖师·选题速评】：🏛️ 【学术拍卖师·提案速评】）
        speech = speech.replace(/^(?:🎪|🏛️)?\s*【(?:学术拍卖师|拍卖师)[·\s]*(?:选题速评|提案速评|提案评估|落槌与方案研讨)?】[：:]\s*/g, '');
        speech = speech.replace(/^(?:🎪|🏛️)?\s*【(?:学术拍卖师|拍卖师)[·\s]*(?:选题速评|提案速评|提案评估|落槌与方案研讨)?】[：:]\s*/g, '');
        speech = `🏛️ 【学术拍卖师·提案评估】：${speech.trim()}`;

        const finalAiMsg = {
          id: 'eval_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
          sender: 'auctioneer',
          senderName: '头脑风暴 · 学术拍卖师',
          text: speech,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          _timeMs: Date.now()
        };

        // 🛡️ 彻底清除历史残留的 thinking_eval 占位气泡
        this.state.chatLogs[currentStage] = (this.state.chatLogs[currentStage] || []).filter(m => !m || (!String(m.id).startsWith('thinking_eval') && !m.isThinking));
        this.state.chatLogs[currentStage].push(finalAiMsg);

        if (typeof this.sendSingleChatMessage === 'function') {
          this.sendSingleChatMessage(finalAiMsg, currentStage);
        }
        this.syncChatLogs();
        if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
        renderChat(this.state);
        this.renderStudentWorkspace();
      } catch (e) {
        console.warn('handleProposalSubmittedAIFeedback error:', e);
        const fallbackAiMsg = {
          id: 'eval_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
          sender: 'auctioneer',
          senderName: '头脑风暴 · 学术拍卖师',
          text: `🏛️ 【学术拍卖师·提案评估】：收到 ${authorName} ${isModify ? '修改后的' : '提交的'}《${title}》！建议组员在研讨区就具体的研究对象与实施情境交流补充！`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          _timeMs: Date.now()
        };
        this.state.chatLogs[currentStage] = (this.state.chatLogs[currentStage] || []).filter(m => !m || (!String(m.id).startsWith('thinking_eval') && !m.isThinking));
        this.state.chatLogs[currentStage].push(fallbackAiMsg);
        if (typeof this.sendSingleChatMessage === 'function') {
          this.sendSingleChatMessage(fallbackAiMsg, currentStage);
        }
        this.syncChatLogs();
        renderChat(this.state);
        this.renderStudentWorkspace();
      }
    }

    handleVoteCast(proposalId) {
      if (this.state.stage1.contract.isConfirmed || this.state.isFinalSubmitted) {
        alert('🔒 学术合作合约已签署锁定，不可再更改投票。');
        return;
      }
      const user = this.state.currentUser;
      const s1 = this.state.stage1;
      const currUserObj = this.authManager.getCurrentUser();

      // 🛡️ 稳健的多标识判定辅助函数
      const isMemberDone = (map, m) => {
        if (!map || !m) return false;
        return !!(map[m.id] || map[m.studentCode] || map[m.username] || (m.name && map[m.name]));
      };

      const isAlreadyVoted = isMemberDone(s1.hasVoted, { id: user, studentCode: currUserObj?.studentCode, username: currUserObj?.username, name: currUserObj?.name });
      if (isAlreadyVoted) {
        alert('💡 您已经完成投票啦！每位成员仅有一次投票机会，请耐心等待其他组员完成投票。');
        return;
      }
      if (!s1.hasVoted) s1.hasVoted = {};
      if (!s1.votes) s1.votes = {};

      // 兼容写入多键，保证底层依赖绝对不破坏
      s1.votes[user] = proposalId;
      s1.hasVoted[user] = true;
      if (currUserObj) {
        if (currUserObj.id) { s1.votes[currUserObj.id] = proposalId; s1.hasVoted[currUserObj.id] = true; }
        if (currUserObj.studentCode) { s1.votes[currUserObj.studentCode] = proposalId; s1.hasVoted[currUserObj.studentCode] = true; }
        if (currUserObj.name) { s1.votes[currUserObj.name] = proposalId; s1.hasVoted[currUserObj.name] = true; }
      }

      s1._lastVoteTime = Date.now();
      const proposal = (s1.proposals || []).find(p => p.id === proposalId);
      const membersList = Object.values(this.state.members || {});
      const totalMembersCount = membersList.length || 3;
      const votesCastCount = membersList.filter(m => isMemberDone(s1.hasVoted, m)).length;
      const proposalTitle = proposal ? proposal.title : proposalId;

      this.syncStage1();
      if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
      // 💡 0ms 立即局部重绘视图，按钮变为【已投此提案】且得票数和进度条毫秒级跳动
      this.renderStudentWorkspace();

      if (typeof showGlobalBannerNotice === 'function') {
        showGlobalBannerNotice(`🎉 投票成功！您已支持《${proposalTitle}》`, `📊 当前全组投票进度：${votesCastCount}/${totalMembersCount} 人已完成，等待全员投票揭晓结果。`);
      }

      if (votesCastCount >= totalMembersCount) {
        // ── 全员投票完成：立即提示并调用大模型拍卖师 API 动态生成专业落槌播报与研讨引导 ──
        const progressBadge = document.getElementById('proposal-vote-progress-badge');
        if (progressBadge) {
          progressBadge.innerHTML = `🎉 全员已投完 (共投出 ${votesCastCount} 票) · 正在呼叫拍卖师落槌...`;
        }
        setTimeout(async () => {
          s1._voteCompletedTime = Date.now();
          const tally = {};
          membersList.forEach(m => {
            const pId = s1.votes[m.studentCode] || s1.votes[m.id] || s1.votes[m.username] || (m.name && s1.votes[m.name]);
            if (pId) tally[pId] = (tally[pId] || 0) + 1;
          });
          const proposalSummaryList = (s1.proposals || []).map(p => `《${p.title}》(${tally[p.id] || 0}票)`).join('，');

          let maxVotes = -1;
          let winningProposal = null;
          (s1.proposals || []).forEach(p => {
            const count = tally[p.id] || 0;
            if (count > maxVotes) {
              maxVotes = count;
              winningProposal = p;
            }
          });

          const isUnanimous = (winningProposal && maxVotes === totalMembersCount && totalMembersCount > 0);

          // 🛡️ 严格学术铁律：只有【全票一致】才自动确立课题；只要不是全票一致（无论 2:1 还是平票），一律算【存在分歧】，留由组员在讨论区协商确定！
          if (isUnanimous && winningProposal) {
            s1.mergedTitle = winningProposal.title;
            s1.flowStep = 'refining';
            this.state.stage1PendingRefinement = true;
          } else {
            s1.flowStep = 'divergence';
            this.state.stage1PendingDivergence = true;
          }
          this.syncStage1();

          if (!s1.contract.timeAllocations) {
            s1.contract.timeAllocations = { background: 25, literature: 30, questions: 25, method: 40, reflection: 20, references: 10 };
          }

          // ── 🌟 拍卖师引导逻辑与槽位初始状态（调用大模型动态生成深度学术方案引导） ──
          s1.contractStep = 'topic'; // 初始锁定第一步：主题与研究方案提炼

          if (isUnanimous && winningProposal) {
            // 情境 A：投票全票一致（N 票一致）
            // 左侧槽位表现：系统预填选出的主题名称至【论文主题】框（暂不锁定），【研究方案概述】框为空。
            s1.mergedTitle = winningProposal.title;
            if (!s1.contract) s1.contract = {};
            s1.contract.topic = winningProposal.title;
            s1.contract.overview = '';
            s1.researchOverview = '';

            const unanimousPrompt = `全组成员全票一致推选了研究课题《${winningProposal.title}》（共 ${totalMembersCount} 票）。
  【获胜提案内容/设想】: ${winningProposal.description || '暂无详细描述'}

  请作为资深学术拍卖师：
  发表 100~130 字的单条全票通过祝贺与方案细化研讨引导：
  ① 宣布全员一致通过该主题《${winningProposal.title}》（${totalMembersCount} 票）；
  ② 顺势引导大家在群里进一步商量具体的研究设计与切入角度（如结合什么具体情境/案例、聚焦什么核心问题、采用什么方法等）；
  ③ 末尾提示：“商量好后，请点击左侧公约看板中的【💡 讨论差不多了？一键提炼【主题与研究方案】】按钮！”
  （纯自然语言输出，100~130字，严禁拆分成多条）`;

            let guideText = `恭喜全员一致通过选题《${winningProposal.title}》（${totalMembersCount} 票）！请大家在群里进一步商量具体的研究设计与切入角度（如结合什么具体情境/案例、聚焦什么核心问题、采用什么方法等）。商量好后，请点击左侧公约看板中的【💡 讨论差不多了？一键提炼【主题与研究方案】】按钮！`;

            try {
              const aiResp = await callCozeAgentAPI('auctioneer', unanimousPrompt, { stage: 'stage1', topic: winningProposal.title });
              if (aiResp && aiResp.trim().length > 0) {
                guideText = aiResp.trim();
              }
            } catch (e) {
              console.warn('Auctioneer unanimous prompt fallback', e);
            }

            // 🛡️ 智能清洗并统一前缀为标准的单层格式
            guideText = guideText.replace(/^(?:🤖|🎪|🏛️)?\s*【(?:学术拍卖师|拍卖师)[·\s]*(?:全票通过|落槌与方案研讨|分歧指引|定名指引)?】[：:]\s*/g, '');
            guideText = `🏛️ 【学术拍卖师·落槌与方案研讨】：${guideText.trim()}`;

            const guideMsg = {
              id: 'vote_unanimous_' + Date.now(),
              sender: 'auctioneer',
              senderName: '头脑风暴 · 学术拍卖师',
              text: guideText,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              _timeMs: Date.now()
            };
            this.state.chatLogs.stage1.push(guideMsg);
            if (typeof this.sendSingleChatMessage === 'function') {
              this.sendSingleChatMessage(guideMsg, 'stage1');
            }
          } else {
            // 情境 B：投票存在分歧（有不同票数）
            s1.mergedTitle = '';
            if (!s1.contract) s1.contract = {};
            s1.contract.topic = '';
            s1.contract.overview = '';
            s1.researchOverview = '';

            // 结构化整理各方向票数与提案内容（严禁点名，只报票数与方向）
            const directionSummaries = (s1.proposals || []).map((p, idx) => {
              const vCount = tally[p.id] || 0;
              return `【方案${idx + 1}：《${p.title}》】(${vCount}票)`;
            }).join('，');

            const divergencePrompt = `小组成员完成了选题投票，投票结果出炉（存在分歧）：
  各方案得票分布: ${directionSummaries}

  请作为资深学术拍卖师：
  发表 100~130 字的单条投票揭晓与方案研讨引导（严禁点名任何组员）：
  ① 客观播报各方案得票分布（如《方案A》(X票)，《方案B》(Y票)）；
  ② 客观分析不同得票方向的侧重点与互补性，引导全组商量确定一个统一或融合的方向，并进一步细化具体的研究情境与方案；
  ③ 末尾提示：“商量好后，请点击左侧公约看板中的【💡 讨论差不多了？一键提炼【主题与研究方案】】按钮！”
  （纯自然语言输出，100~130字，严禁拆分成多条）`;

            let guideText = `投票结果已出炉：${directionSummaries}！各方案各有千秋，建议大家在讨论区交流融合，重点商定核心问题与具体实施路径。商量好后，请点击左侧公约看板中的【💡 讨论差不多了？一键提炼【主题与研究方案】】按钮！`;

            try {
              const aiResp = await callCozeAgentAPI('auctioneer', divergencePrompt, { stage: 'stage1', topic: '方案分歧融合' });
              if (aiResp && aiResp.trim().length > 0) {
                guideText = aiResp.trim();
              }
            } catch (e) {
              console.warn('Auctioneer divergence prompt fallback', e);
            }

            // 🛡️ 智能清洗并统一前缀为标准的单层格式
            guideText = guideText.replace(/^(?:🤖|🎪|🏛️)?\s*【(?:学术拍卖师|拍卖师)[·\s]*(?:全票通过|落槌与方案研讨|分歧指引|定名指引)?】[：:]\s*/g, '');
            guideText = `🏛️ 【学术拍卖师·落槌与方案研讨】：${guideText.trim()}`;

            const guideMsg = {
              id: 'vote_divergence_' + Date.now(),
              sender: 'auctioneer',
              senderName: '头脑风暴 · 学术拍卖师',
              text: guideText,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              _timeMs: Date.now()
            };
            this.state.chatLogs.stage1.push(guideMsg);
            if (typeof this.sendSingleChatMessage === 'function') {
              this.sendSingleChatMessage(guideMsg, 'stage1');
            }
          }

          this.syncStage1();
          this.syncChatLogs();
          if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
          renderChat(this.state);
          this.renderStudentWorkspace();
        }, 800);
      }
    }

    /**
     * 🌟 通用全员协同确认包装器：需组内全员点击确认后才真正触发大模型生成并推进（原子后端 API 驱动，零覆盖）
     */
    async handleStepConfirmation(stepKey, onCompleteCallback, stepLabel) {
      if (!this.state.stepConfirmations) this.state.stepConfirmations = {};
      if (!this.state.stepConfirmations[stepKey]) this.state.stepConfirmations[stepKey] = {};

      const user = this.state.currentUser;
      const currUserObj = this.authManager ? this.authManager.getCurrentUser() : null;
      const primaryKey = String(currUserObj?.studentCode || currUserObj?.id || user || 'A').trim();
      const userKeys = [primaryKey, user, currUserObj?.id, currUserObj?.studentCode, currUserObj?.username, currUserObj?.name].filter(Boolean);

      let members = [];
      if (Array.isArray(this.state.members)) members = this.state.members;
      else if (this.state.members && typeof this.state.members === 'object') members = Object.values(this.state.members);
      const totalCount = members.length || 2;

      const isMemberDone = (map, m) => {
        if (!map || !m) return false;
        return !!(map[m.id] || map[m.studentCode] || map[m.username] || (m.name && map[m.name]));
      };

      const isAlreadyDone = userKeys.some(k => this.state.stepConfirmations[stepKey][k]);
      if (isAlreadyDone) {
        const currentCount = members.filter(m => isMemberDone(this.state.stepConfirmations[stepKey], m)).length;
        if (currentCount < totalCount) {
          alert(`💡 您已经确认过【${stepLabel}】啦！\n当前全组确认进度：${currentCount}/${totalCount} 人。\n请提醒组内其他同学点击确认，全员确认后将自动提炼并推进！`);
          return;
        }
      }

      // 1. 0ms 本地即时记录并重绘视图
      userKeys.forEach(k => { this.state.stepConfirmations[stepKey][k] = true; });
      this.renderStudentWorkspace();
      if (typeof window.renderChat === 'function') window.renderChat(this.state);

      // 2. ⚡ 原子提交至服务端 confirm_step 接口，合并全组成员点击
      const activeTaskId = this.state.activeTaskId || null;
      const effectiveClassId = this.state.activeStudentClassId || (currUserObj?.classId || null);
      const activeGroupObj = this.authManager ? this.authManager.getStudentActiveGroup(currUserObj, effectiveClassId) : null;
      const currentGroupId = activeGroupObj?.id || (currUserObj && currUserObj.groupId ? currUserObj.groupId : (this.state.activeGroupId || 'group_1'));

      try {
        const res = await fetch('sync.php?action=confirm_step', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskId: activeTaskId,
            groupId: currentGroupId,
            stepKey: stepKey,
            userKey: primaryKey,
            userName: currUserObj?.name || primaryKey
          })
        });
        const resData = await res.json();
        if (resData && resData.success && resData.stepConfirmations) {
          this.state.stepConfirmations = resData.stepConfirmations;
        }
      } catch (e) {
        console.warn('confirm_step API network error:', e);
      }

      // 3. 重新聚合计算全组确认达成人数
      const finalCount = members.filter(m => isMemberDone(this.state.stepConfirmations[stepKey], m)).length;
      this.renderStudentWorkspace();
      if (typeof window.renderChat === 'function') window.renderChat(this.state);

      // 4. 达成全员确认：清空服务端确认记录并触发后续大模型提炼
      if (finalCount >= totalCount) {
        try {
          fetch('sync.php?action=clear_step_confirmation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskId: activeTaskId, groupId: currentGroupId, stepKey: stepKey })
          }).catch(() => {});
        } catch (e) {}

        delete this.state.stepConfirmations[stepKey];
        if (typeof onCompleteCallback === 'function') {
          onCompleteCallback();
        }
      }
    }

    /**
     * 💡 阶段一公约第一步：一键提炼【主题与研究方案】
     */
    async handleExtractTopic() {
      this.handleStepConfirmation('s1_topic', () => this._doExtractTopic(), '主题与研究方案');
    }

    async _doExtractTopic() {
      const s1 = this.state.stage1 || {};
      const s1ChatLogs = (this.state.chatLogs && this.state.chatLogs.stage1) ? this.state.chatLogs.stage1 : [];
      const voteNoticeIdx = s1ChatLogs.findIndex(m => m && m.text && (m.text.includes('投票结果出炉') || m.text.includes('全票通过') || m.text.includes('计票结果') || m.text.includes('落槌')));
      const relevantLogs = (voteNoticeIdx >= 0) ? s1ChatLogs.slice(voteNoticeIdx) : s1ChatLogs;
      const userLogs = relevantLogs.filter(m => m && m.sender && !AgentProfiles[m.sender] && m.sender !== 'system');
      const chatSnippet = userLogs.map(m => `${m.senderName || m.sender}: ${m.text}`).join('\n') || '组员正在商讨具体情境、案例与研究方法';

      const currentCandidate = s1.mergedTitle || s1.contract?.topic || s1.proposals?.[0]?.title || '学术协同研究课题';
      const allPropTitles = (s1.proposals || []).map(p => `《${p.title}》`).join('、');

      const extractPrompt = `小组成员已在讨论区就论文研究主题及具体的研究方案展开了研讨。
  【候选提案参考】: ${allPropTitles || '多方提案'}
  【组内关于主题与方案的真实讨论记录】:
  ${chatSnippet}

  请通读研讨，作为资深学术拍卖师：
  1. 【规范论文题目】：提炼或规范化润色全组最终商定的严谨学术论文题名（20~35字，极具学术规范性，无书名号）；
  2. 【研究方案概述】：根据学生讨论的具体情境、案例载体、核心科学问题与拟采用的方法，结构化生成 120~200 字的【研究方案概述】；
  3. 【顺承引导】：给出 1 句简明点拨，顺承引导全组在讨论区商讨 6 大章节的时间预算分配！
  输出格式必须为合法 JSON（严禁代码块以外的多余废话）：
  {
    "topic": "提炼后的规范论文题目",
    "overview": "提炼后的研究方案概述，涵盖情境案例、核心问题与方法",
    "guideText": "论文主题与研究方案概述已成功生成并录入公约！接下来请全组在讨论区商讨 6 大章节的时间预算分配，商定后点击【⏱️ 时间讨论差不多了？一键提炼【时间分配】】！"
  }`;

      try {
        const resp = await callCozeAgentAPI('auctioneer', extractPrompt, { stage: 'stage1', topic: currentCandidate });
        let finalTopic = currentCandidate;
        let finalOverview = '本研究围绕具体实践情境展开，聚焦核心问题，采用定性与定量相结合的研究方法进行深入探讨。';
        let guideSpeech = `🎪 【拍卖师·方案确立】：主题《${finalTopic}》与研究方案概述已成功确立并录入公约！👉 接下来请全组在讨论区商讨 6 大章节的时间预算分配，商定完成后点击【⏱️ 时间讨论差不多了？一键提炼【时间分配】】！`;

        if (resp && resp.trim().length > 0) {
          try {
            const jsonMatch = resp.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              if (parsed.topic) finalTopic = parsed.topic;
              if (parsed.overview) finalOverview = parsed.overview;
              if (parsed.guideText) guideSpeech = parsed.guideText;
            }
          } catch (je) {
            console.warn('Parse topic & overview JSON fail, fallback', je);
          }
        }

        s1.mergedTitle = finalTopic;
        if (!s1.contract) s1.contract = {};
        s1.contract.topic = finalTopic;
        s1.contract.overview = finalOverview;
        s1.researchOverview = finalOverview;
        s1.contractStep = 'time'; // 顺推至时间分配阶段

        guideSpeech = guideSpeech.replace(/^(?:🎪|🏛️)?\s*【(?:学术拍卖师|拍卖师)[·\s]*(?:方案确立|主题与方案确立|方案提炼)?】[：:]\s*/g, '');
        const noticeText = `🏛️ 【学术拍卖师·主题与方案确立】：全组研究论题《${finalTopic}》与方案概述已成功提炼并录入公约看板！👉 接下来请全组在讨论区商讨 6 大章节的时间预算分配，商定完成后点击左侧【⏱️ 时间讨论差不多了？一键提炼【时间分配】】！`;

        const noticeMsg = {
          id: 'msg_topic_done_' + Date.now(),
          sender: 'auctioneer',
          senderName: '头脑风暴 · 学术拍卖师',
          text: noticeText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          _timeMs: Date.now()
        };
        s1ChatLogs.push(noticeMsg);
        if (typeof this.sendSingleChatMessage === 'function') {
          this.sendSingleChatMessage(noticeMsg, 'stage1');
        }

        this.syncStage1();
        this.syncChatLogs();
        if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
        this.renderStudentWorkspace();
        renderChat(this.state);
      } catch (e) {
        console.warn('Extract topic & overview error:', e);
        s1.mergedTitle = currentCandidate;
        if (!s1.contract) s1.contract = {};
        s1.contract.topic = currentCandidate;
        s1.contractStep = 'time';

        const fallbackNotice = {
          id: 'msg_topic_done_' + Date.now(),
          sender: 'auctioneer',
          senderName: '头脑风暴 · 学术拍卖师',
          text: `🏛️ 【学术拍卖师·主题与方案确立】：全组研究论题《${currentCandidate}》已成功确立并录入公约看板！👉 接下来请全组在讨论区商讨 6 大章节的时间预算分配，商定完成后点击左侧【⏱️ 时间讨论差不多了？一键提炼【时间分配】】！`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          _timeMs: Date.now()
        };
        s1ChatLogs.push(fallbackNotice);
        if (typeof this.sendSingleChatMessage === 'function') {
          this.sendSingleChatMessage(fallbackNotice, 'stage1');
        }

        this.syncStage1();
        this.syncChatLogs();
        if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
        this.renderStudentWorkspace();
        renderChat(this.state);
      }
    }

    /**
     * ⏱️ 阶段一公约第二步：一键提炼【时间分配】
     */
    async handleExtractTime() {
      this.handleStepConfirmation('s1_time', () => this._doExtractTime(), '时间分配');
    }

    async _doExtractTime() {
      const s1 = this.state.stage1 || {};
      const s1ChatLogs = (this.state.chatLogs && this.state.chatLogs.stage1) ? this.state.chatLogs.stage1 : [];
      const topicNoticeIdx = s1ChatLogs.findIndex(m => m && m.text && (m.text.includes('主题确立') || m.text.includes('时间分配') || m.text.includes('时间规划')));
      const relevantLogs = (topicNoticeIdx >= 0) ? s1ChatLogs.slice(topicNoticeIdx) : s1ChatLogs;
      const userLogs = relevantLogs.filter(m => m && m.sender && !AgentProfiles[m.sender] && m.sender !== 'system');
      const chatSnippet = userLogs.map(m => `${m.senderName || m.sender}: ${m.text}`).join('\n') || '组员正在商讨时间规划';

      const allTasks = (this.authManager) ? this.authManager.getTasks() : [];
      const curTask = allTasks.find(t => t.id === this.state.activeTaskId);
      const totalDurationMin = (curTask && curTask.durationMinutes) ? Number(curTask.durationMinutes) : 150;

      const timePrompt = `小组成员已就学术论文 6 大章节的时间预算规划在讨论区展开了充分研讨。
  【组内关于时间规划与各章节侧重的真实研讨记录】:
  ${chatSnippet}
  【参考论文写作总时长】: ${totalDurationMin} 分钟

  请通读上述真实讨论记录，作为资深学术拍卖师：
  1. 深度分析小组成员的研讨意向与侧重：
     - 若组员明确提到了某章节分配多少分钟，严格按照组员商定的时间分配；
     - 若组员提到各章节“平分”或“均分”，则将总时长平分给各章；
     - 若组员提到“重点在方法/重点在综述”，则显著增加对应章节的时间权重；
     - 若组员未明确提及某章节具体数值，依据学术论文标准黄金比例（重点强化研究设计与方法）智能补齐，使 6 大章节总和约为 ${totalDurationMin} 分钟；
  2. 给出 1 句专业且亲切的学术点拨（结合组员的研讨侧重点），宣布时间分配已录入公约，并顺承引导全组在讨论区商定各自负责的写作章节与任务分工！

  输出格式必须为合法 JSON（严禁代码块以外的多余文字）：
  {
    "background": 25,
    "literature": 30,
    "questions": 25,
    "method": 40,
    "reflection": 20,
    "references": 10,
    "guideText": "全篇 6 大章节时间预算已成功配置并录入公约看板！接下来请全组在讨论区商定各自负责认领的写作章节与任务分工！商定完成后点击左侧【👥 一键提炼任务分工】！"
  }`;

      try {
        const resp = await callCozeAgentAPI('auctioneer', timePrompt, { stage: 'stage1', topic: s1.mergedTitle || '论文' });
        let timeAlloc = { background: 25, literature: 30, questions: 25, method: 40, reflection: 20, references: 10 };
        let guideSpeech = `全篇 6 大章节时间预算已成功配置并录入公约看板！👉 接下来请全组在讨论区商定各自负责认领的写作章节与任务分工！商定完成后点击左侧【👥 研讨差不多了？一键提炼任务分工】！`;

        if (resp && resp.trim().length > 0) {
          try {
            const jsonMatch = resp.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              if (parsed.background !== undefined && !isNaN(Number(parsed.background))) timeAlloc.background = Math.max(5, Math.round(Number(parsed.background)));
              if (parsed.literature !== undefined && !isNaN(Number(parsed.literature))) timeAlloc.literature = Math.max(5, Math.round(Number(parsed.literature)));
              if (parsed.questions !== undefined && !isNaN(Number(parsed.questions))) timeAlloc.questions = Math.max(5, Math.round(Number(parsed.questions)));
              if (parsed.method !== undefined && !isNaN(Number(parsed.method))) timeAlloc.method = Math.max(5, Math.round(Number(parsed.method)));
              if (parsed.reflection !== undefined && !isNaN(Number(parsed.reflection))) timeAlloc.reflection = Math.max(5, Math.round(Number(parsed.reflection)));
              if (parsed.references !== undefined && !isNaN(Number(parsed.references))) timeAlloc.references = Math.max(5, Math.round(Number(parsed.references)));
              if (parsed.guideText && parsed.guideText.trim().length > 0) guideSpeech = parsed.guideText.trim();
            }
          } catch (e) {
            console.warn('Parse time allocation JSON fail, keep default', e);
          }
        }

        if (!s1.contract) s1.contract = {};
        s1.contract.timeAllocations = timeAlloc;
        s1.contractStep = 'tasks'; // 推进至第三步：任务分工

        guideSpeech = guideSpeech.replace(/^(?:🎪|🏛️)?\s*【(?:学术拍卖师|拍卖师)[·\s]*(?:时间预算确立|时间分配)?】[：:]\s*/g, '');
        const noticeText = `🏛️ 【学术拍卖师·时间预算确立】：${guideSpeech}`;

        const noticeMsg = {
          id: 'msg_time_done_' + Date.now(),
          sender: 'auctioneer',
          senderName: '头脑风暴 · 学术拍卖师',
          text: noticeText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          _timeMs: Date.now()
        };
        s1ChatLogs.push(noticeMsg);
        if (typeof this.sendSingleChatMessage === 'function') {
          this.sendSingleChatMessage(noticeMsg, 'stage1');
        }

        this.syncStage1();
        this.syncChatLogs();
        if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
        this.renderStudentWorkspace();
        renderChat(this.state);
      } catch (e) {
        console.warn('Extract time error:', e);
        if (!s1.contract) s1.contract = {};
        s1.contract.timeAllocations = { background: 25, literature: 30, questions: 25, method: 40, reflection: 20, references: 10 };
        s1.contractStep = 'tasks';

        const fallbackNotice = {
          id: 'msg_time_done_' + Date.now(),
          sender: 'auctioneer',
          senderName: '头脑风暴 · 学术拍卖师',
          text: `🏛️ 【学术拍卖师·时间预算确立】：全篇 6 大章节时间预算已成功配置并录入公约看板！👉 接下来请全组在讨论区商定各自负责认领的写作章节与任务分工！商定完成后点击左侧【👥 研讨差不多了？一键提炼任务分工】！`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          _timeMs: Date.now()
        };
        s1ChatLogs.push(fallbackNotice);
        if (typeof this.sendSingleChatMessage === 'function') {
          this.sendSingleChatMessage(fallbackNotice, 'stage1');
        }

        this.syncStage1();
        this.syncChatLogs();
        if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
        this.renderStudentWorkspace();
        renderChat(this.state);
      }
    }

    /**
     * 👥 阶段一公约第三步：一键提炼【任务分工】并生成完整草案
     */
    async handleExtractTasks() {
      this.handleStepConfirmation('s1_tasks', () => this._doExtractTasks(), '任务分工');
    }

    async _doExtractTasks() {
      const s1 = this.state.stage1 || {};
      let members = [];
      if (Array.isArray(this.state.members)) members = this.state.members;
      else if (this.state.members && typeof this.state.members === 'object') members = Object.values(this.state.members);

      const s1ChatLogs = (this.state.chatLogs && this.state.chatLogs.stage1) ? this.state.chatLogs.stage1 : [];
      const timeNoticeIdx = s1ChatLogs.findIndex(m => m && m.text && (m.text.includes('时间预算确立') || m.text.includes('分工')));
      const relevantLogs = (timeNoticeIdx >= 0) ? s1ChatLogs.slice(timeNoticeIdx) : s1ChatLogs;
      const userLogs = relevantLogs.filter(m => m && m.sender && !AgentProfiles[m.sender] && m.sender !== 'system');
      const chatSnippet = userLogs.map(m => `${m.senderName || m.sender}: ${m.text}`).join('\n') || '组员正在商定分工';

      const membersInfo = members.map(m => `- ${m.name || m.studentCode || m.id}`).join('\n');

      const taskPrompt = `小组成员已在讨论区就 6 大章节的分工认领展开了商议。
  【小组成员名单】:
  ${membersInfo}
  【组内关于任务分工的真实研讨记录】:
  ${chatSnippet}

  请通读研讨，作为资深学术拍卖师：
  1. 提炼出每位组员具体负责的写作章节与任务描述（如“负责研究设计与方法、文献综述”）；
  2. 给出 1 句恭喜小结，宣布公约草案已全部生成就绪，提醒全组在下方点击【✍️ 签署确认学术公约】！
  输出格式必须为合法 JSON（严禁多余废话）：
  {
    "assignments": {
      "组员姓名1": "负责章节描述",
      "组员姓名2": "负责章节描述"
    },
    "guideText": "太棒了！全组成员分工已全部生成就绪！请全员核对左侧公约并在下方点击【✍️ 签署确认学术公约】！全员签署后将正式解锁【阶段二：学术编辑部】！"
  }`;

      try {
        const resp = await callCozeAgentAPI('auctioneer', taskPrompt, { stage: 'stage1', topic: s1.mergedTitle || '论文' });
        let taskAssignments = {};
        let guideSpeech = `📜 【拍卖师·公约生成完毕】：🎉 太棒了！全组成员分工与公约内容已全部生成就绪！👉 请全组成员核对左侧公约内容，并在下方点击【✍️ 签署确认学术公约】！全员签署后将正式解锁【阶段二：学术编辑部】！`;

        const defaultTasks = [
          '负责“一、研究背景与意义”及“二、文献综述”起草',
          '负责“三、研究问题与假设”及“四、研究设计与方法”方案制定',
          '负责“五、不足与反思”撰写及全篇“六、参考文献”引文校对',
          '负责数据分析模型构建与研究工具问卷设计'
        ];

        members.forEach((m, idx) => {
          const mKey = m.id || m.studentCode || m.username || m.name;
          taskAssignments[mKey] = defaultTasks[idx % defaultTasks.length];
        });

        if (resp && resp.trim().length > 0) {
          try {
            const jsonMatch = resp.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              if (parsed.assignments && typeof parsed.assignments === 'object') {
                members.forEach((m, idx) => {
                  const mKey = m.id || m.studentCode || m.username || m.name;
                  const matchedVal = parsed.assignments[m.name] || parsed.assignments[m.studentCode] || parsed.assignments[m.id];
                  if (matchedVal) taskAssignments[mKey] = matchedVal;
                });
              }
              if (parsed.guideText) guideSpeech = parsed.guideText;
            }
          } catch (e) {}
        }

        if (!s1.contract) s1.contract = {};
        s1.contract.taskAssignments = taskAssignments;
        s1.contract.isDraftGenerated = true;
        s1.contract._draftedTime = Date.now();
        s1.contractStep = 'completed'; // 提炼全部完成

        guideSpeech = guideSpeech.replace(/^(?:📜|🎪|🏛️)?\s*【(?:学术拍卖师|拍卖师)[·\s]*(?:公约生成完毕|任务分工|草案就绪)?】[：:]\s*/g, '');
        const noticeText = `🏛️ 【学术拍卖师·公约草案就绪】：全组成员写作分工已成功配置，公约草案已全部生成就绪！👉 请全员在左侧下方点击【✍️ 签署确认学术公约】，全员签署后开启阶段二！`;

        const noticeMsg = {
          id: 'msg_tasks_done_' + Date.now(),
          sender: 'auctioneer',
          senderName: '头脑风暴 · 学术拍卖师',
          text: noticeText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          _timeMs: Date.now()
        };
        s1ChatLogs.push(noticeMsg);
        if (typeof this.sendSingleChatMessage === 'function') {
          this.sendSingleChatMessage(noticeMsg, 'stage1');
        }

        this.syncStage1();
        this.syncChatLogs();
        if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
        this.renderStudentWorkspace();
        renderChat(this.state);
      } catch (e) {
        console.warn('Extract tasks error:', e);
        if (!s1.contract) s1.contract = {};
        s1.contract.isDraftGenerated = true;
        s1.contractStep = 'completed';

        const fallbackNotice = {
          id: 'msg_tasks_done_' + Date.now(),
          sender: 'auctioneer',
          senderName: '头脑风暴 · 学术拍卖师',
          text: `🏛️ 【学术拍卖师·公约草案就绪】：全组成员写作分工已成功配置，公约草案已全部生成就绪！👉 请全员在左侧下方点击【✍️ 签署确认学术公约】，全员签署后开启阶段二！`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          _timeMs: Date.now()
        };
        s1ChatLogs.push(fallbackNotice);
        if (typeof this.sendSingleChatMessage === 'function') {
          this.sendSingleChatMessage(fallbackNotice, 'stage1');
        }

        this.syncStage1();
        this.syncChatLogs();
        if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
        this.renderStudentWorkspace();
        renderChat(this.state);
      }
    }

    /**
     * ✍️ 阶段一：小组成员点击签署确认学术合作公约
     */
    handleConfirmContract() {
      const user = this.state.currentUser;
      const s1 = this.state.stage1 || {};
      if (!s1.contract) s1.contract = {};
      if (!s1.contract.confirmedMembers) s1.contract.confirmedMembers = {};

      let memberArr = [];
      if (Array.isArray(this.state.members)) memberArr = this.state.members;
      else if (this.state.members && typeof this.state.members === 'object') memberArr = Object.values(this.state.members);
      if (memberArr.length === 0 && this.authManager) {
        const u = this.authManager.getCurrentUser();
        const effClassId = (this.authManager ? this.authManager.getEffectiveStudentClassId(u, this.state.activeTaskId) : (this.state.activeStudentClassId || u?.classId || null));
        const effGroup = this.authManager.getStudentActiveGroup(u, effClassId);
        memberArr = this.authManager.getGroupMembersForWorkspace(effGroup?.id || this.state.activeGroupId || null, effClassId);
      }
      const currMemObj = memberArr.find(m => m && (m.id === user || m.studentCode === user || m.username === user || m.name === user));
      const memberName = currMemObj ? currMemObj.name : user;
      const totalMembersCount = Math.max(memberArr.length, 2);

      const userAlreadySigned = !!(s1.contract.confirmedMembers[user] || (currMemObj && (s1.contract.confirmedMembers[currMemObj.id] || s1.contract.confirmedMembers[currMemObj.studentCode] || (currMemObj.name && s1.contract.confirmedMembers[currMemObj.name]))));

      if (userAlreadySigned && s1.contract.isConfirmed) {
        this.switchStage('stage2');
        return;
      }
      if (userAlreadySigned) {
        alert(`✅ 您 (${memberName}) 此前已完成签署确认！正在等待组内其他同学签署。`);
        return;
      }

      // 写入当前用户的签署记录（兼容写入多标识键）
      s1.contract.confirmedMembers[user] = true;
      if (currMemObj) {
        if (currMemObj.id) s1.contract.confirmedMembers[currMemObj.id] = true;
        if (currMemObj.studentCode) s1.contract.confirmedMembers[currMemObj.studentCode] = true;
        if (currMemObj.name) s1.contract.confirmedMembers[currMemObj.name] = true;
        if (currMemObj.username) s1.contract.confirmedMembers[currMemObj.username] = true;
      }

      // 🌐 原子同步给后端数据库
      const activeGroupObj = this.authManager ? this.authManager.getStudentActiveGroup(currMemObj, this.state.activeStudentClassId || currMemObj?.classId || null) : null;
      const curGid = activeGroupObj?.id || (currMemObj?.groupId || this.state.activeGroupId || null);
      fetch('sync.php?action=patch_contract_field', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: this.state.activeTaskId || null,
          groupId: curGid,
          field: 'sign_member',
          subKey: currMemObj?.studentCode || currMemObj?.id || user,
          value: true
        })
      }).catch(() => {});

      const confirmedCount = memberArr.filter(m => m && (s1.contract.confirmedMembers[m.id] || s1.contract.confirmedMembers[m.studentCode] || (m.name && s1.contract.confirmedMembers[m.name]))).length;

      if (confirmedCount >= totalMembersCount) {
        s1.contract.isConfirmed = true;
        this.state.groupMaxStage = 'stage2';
        const finalMsg = {
          id: 'msg_contract_signed_' + Date.now(),
          sender: 'auctioneer',
          senderName: '头脑风暴 · 学术拍卖师',
          text: `🏛️ 【学术拍卖师宣布】：🎉 恭喜！组内全员 ${totalMembersCount}/${totalMembersCount} 名成员已全部完成公约签署确认！学术合作公约正式生效锁定，阶段一圆满结束！请同学们开启阶段二开始正文协同撰写！`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          _timeMs: Date.now()
        };
        if (!this.state.chatLogs.stage1) this.state.chatLogs.stage1 = [];
        this.state.chatLogs.stage1.push(finalMsg);
        if (typeof this.sendSingleChatMessage === 'function') {
          this.sendSingleChatMessage(finalMsg, 'stage1');
        }
        this.syncStage1();
        this.syncChatLogs();
        this.syncStageChange('stage2');
        if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
        if (typeof showGlobalBannerNotice === 'function') {
          showGlobalBannerNotice(`🎉 全员公约签署完毕 (${totalMembersCount}/${totalMembersCount})`, `学术公约正式锁定生效！正在为您无缝进入【阶段二：学术编辑部】开启 Etherpad 实时协同写作！`);
        }
        // 🚀 直接无缝切换到阶段二，Etherpad 立即呈现！
        this.switchStage('stage2');
      } else {
        this.syncStage1();
        this.syncChatLogs();
        if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
        if (typeof showGlobalBannerNotice === 'function') {
          showGlobalBannerNotice(`✅ 签署成功！您 (${memberName}) 已完成公约确认`, `当前全组签署进度：${confirmedCount}/${totalMembersCount} 人已签署。需全员签署后开启阶段二。`);
        }
        this.renderStudentWorkspace();
      }
    }

    /**
     * 💡 阶段二半程会议第一步：责任编辑提炼分歧并引出审稿专家修正清单
     */
    async handleS2ManagingSummary() {
      const s2 = this.state.stage2 || {};
      if (!this.state.stage2) this.state.stage2 = s2;
      if (!s2.confirmations) s2.confirmations = {};
      if (!s2.confirmations.s2_managing) s2.confirmations.s2_managing = {};

      const currUser = this.authManager ? this.authManager.getCurrentUser() : null;
      const currUserCode = this.state.currentUser || currUser?.studentCode || currUser?.name || 'A';

      // 1. 记录当前用户的确认
      s2.confirmations.s2_managing[currUserCode] = true;
      if (currUser?.studentCode) s2.confirmations.s2_managing[currUser.studentCode] = true;
      if (currUser?.name) s2.confirmations.s2_managing[currUser.name] = true;

      // 计算总组员人数
      const effClassId = this.state.activeStudentClassId || currUser?.classId || null;
      const effGroup = this.authManager ? this.authManager.getStudentActiveGroup(currUser, effClassId) : null;
      const membersList = (effGroup && Array.isArray(effGroup.members) && effGroup.members.length > 0) 
        ? effGroup.members 
        : Object.values(this.state.members || {});
      const totalCount = membersList.length || 2;

      const isDoneHelper = (map) => {
        if (!map) return 0;
        return membersList.filter(m => {
          let fullUser = (typeof m === 'object') ? m : null;
          if (!fullUser && this.authManager && this.authManager.findUserByKey) {
            fullUser = this.authManager.findUserByKey(m);
          }
          const keys = [
            typeof m === 'string' ? m : null,
            m?.id, m?.studentCode, m?.username, m?.name,
            fullUser?.id, fullUser?.studentCode, fullUser?.username, fullUser?.name
          ].filter(Boolean).map(k => String(k).trim().toLowerCase());
          return keys.some(k => map[k] || map[String(k)]);
        }).length;
      };

      const confirmedCount = isDoneHelper(s2.confirmations.s2_managing);

      // 立即同步并更新聊天框底栏按钮展示
      this.syncStage2();
      if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
      renderChat(this.state);

      // 若尚未全员确认，提示等待其他组员
      if (confirmedCount < totalCount) {
        return;
      }

      // 2. 全员已确认：开始让责任编辑与审稿编辑提炼共识并下发《二审修正清单》
      if (this._isGeneratingManagingSummary) return;
      this._isGeneratingManagingSummary = true;

      const s2ChatLogs = (this.state.chatLogs && this.state.chatLogs.stage2) ? this.state.chatLogs.stage2 : [];
      const meetingNoticeIdx = s2ChatLogs.findIndex(m => m && m.text && (m.text.includes('半程会议') || m.text.includes('自查') || m.text.includes('修改思路')));
      const relevantLogs = (meetingNoticeIdx >= 0) ? s2ChatLogs.slice(meetingNoticeIdx) : s2ChatLogs;
      const userLogs = relevantLogs.filter(m => m && m.sender && !AgentProfiles[m.sender] && m.sender !== 'system' && !m.sender.includes('Editor'));
      const chatSnippet = userLogs.map(m => `${m.senderName || m.sender}: ${m.text}`).join('\n') || '组员正在围绕论文前后脱节与论证方法深化讨论修改思路';

      // 🌟 提取全组在【编辑会议自查打卡】中填写的真实瓶颈与聚焦痛点
      const subs = s2.meetingSubmissions || {};
      const subValues = Object.values(subs);
      const bottlenecks = [...new Set(subValues.map(v => v.bAcademic).filter(Boolean))].join('；') || '方法设计操作化不足与理论文献支撑单薄';
      const focusIssues = [...new Set(subValues.map(v => v.userText).filter(Boolean))].join('；') || '核心概念统领与章节逻辑过渡';
      const transIssues = [...new Set(subValues.flatMap(v => v.transSections || []).filter(Boolean))].join('、') || '第一至二章、第三至四章';
      const styleIssues = [...new Set(subValues.flatMap(v => v.styleSections || []).filter(Boolean))].join('、') || '文献综述与方法章节';

      const topic = (this.state.stage1 && this.state.stage1.mergedTitle) ? this.state.stage1.mergedTitle : '本组课题';
      const rawDoc = (s2.unifiedContent || '').replace(/<[^>]*>/g, '').trim();

      // 责任编辑发言提炼研讨共识并交棒（严禁套话，紧扣自查瓶颈、研讨与正文实质）
      const managingPrompt = `小组成员已在讨论区就论文《${topic}》的前序修改方向展开了半程研讨。
  【组员自查打卡反映的自查瓶颈】: ${bottlenecks}
  【组员一句话修改聚焦】: ${focusIssues}
  【组内关于修改思路的讨论记录】:
  ${chatSnippet}
  【正文草稿节选】:
  ${rawDoc.slice(0, 1000)}

  请作为责任编辑，发表 90~120 字的【半程研讨共识小结与交棒】：
  ① 明确呼应小组成员在自查与研讨中聚焦的痛点（如：${focusIssues.slice(0, 50)}），提炼出 1~2 个实质性的修改共识点（严禁假大空套话，严禁出现“分工”字眼）；
  ② 隆重引出审稿专家下发《二审修正清单》，指导全组对齐落实！
  （纯自然语言，90~120字，严禁输出代码块）`;

      try {
        // 🌟 1. 挂载责任编辑正在分析中动态状态框
        this.state.activeAgentAnalyzing = {
          icon: '🤝',
          title: '【责任编辑】正在提炼半程研讨共识...',
          detail: '正在深度整合全组自查痛点与研讨记录，提炼修改共识要点并交棒审稿专家...'
        };
        this.renderStudentWorkspace();

        const respManaging = await callCozeAgentAPI('managingEditor', managingPrompt, { stage: 'stage2', topic, chatSnippet, bottlenecks, focusIssues });
        let managingText = (respManaging && respManaging.trim().length > 0) 
          ? respManaging.trim() 
          : `🤝 【责任编辑·研讨共识小结】：结合大家在自查打卡与讨论区指出的【${focusIssues.slice(0, 30)}】等核心诉求，全组已在研究问题聚焦与方法设计细化上形成了明确共识。👉 接下来正式有请 @审稿编辑 结合全篇草稿为大家下发具体的《二审修正清单》，指导全组深入修改与对齐落实！`;
        if (!managingText.startsWith('🤝')) managingText = `🤝 【责任编辑·研讨共识小结】：${managingText}`;

        const msgManaging = {
          sender: 'managingEditor',
          senderName: '协同调度 · 责任编辑',
          text: managingText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          _timeMs: Date.now()
        };
        s2ChatLogs.push(msgManaging);
        this.syncChatLogs();
        renderChat(this.state);

        // 🌟 2. 切换为审稿编辑二审质检正在分析中动态状态框
        this.state.activeAgentAnalyzing = {
          icon: '📝',
          title: '【审稿编辑】正在下发《二审修正清单》...',
          detail: '正在深度审阅正文草稿并结合自查瓶颈，生成包含【诊断问题+改进建议】的双结构清单...'
        };
        this.renderStudentWorkspace();

        // 审稿专家结合自查瓶颈、讨论与正文下发【诊断问题 + 改进建议】双结构《二审修正清单》
        const reviewingPrompt = `针对课题《${topic}》，结合小组成员自查瓶颈【${bottlenecks}】、聚焦关注点【${focusIssues}】及下方正文草稿，作为资深审稿编辑给出包含【诊断问题 + 改进建议】双结构的学术质检《二审修正清单》（150~180字）：
  【正文草稿参考】:
  ${rawDoc.slice(0, 2000)}
  【小组成员商定的修改思路】:
  ${chatSnippet}

  请严格按以下 3 个维度下发《二审修正清单》（每项必须同时包含“诊断问题”与“改进建议”，严禁出现“分工”字眼）：
  ①【核心概念对齐】
  - 诊断问题：结合引言与文献综述，指出具体概念界定不清或脱节之处；
  - 改进建议：给出具体的学术概念统领与问题锚定要求；
  ②【研究方法深化】
  - 诊断问题：结合组员自查瓶颈（${bottlenecks}），指出正文中具体缺失的操作化步骤、样本抽样或测量工具；
  - 改进建议：给出具体的补全与深化建议；
  ③【行文衔接规范】
  - 诊断问题：结合自查脱节章节（${transIssues}），指出具体逻辑生硬或口语化表达；
  - 改进建议：给出具体的润色与过渡规范要求。
  末尾必须明确提示：“请大家围绕清单协同商定修改对策与落实方案，讨论差不多后点击下方【📝 讨论差不多了？让审稿编辑总结】！”（纯自然语言，150~180字）`;

        const respReviewing = await callCozeAgentAPI('reviewingEditor', reviewingPrompt, { stage: 'stage2', topic, actualDoc: rawDoc, bottlenecks, focusIssues });
        let reviewingText = (respReviewing && respReviewing.trim().length > 0)
          ? respReviewing.trim()
          : `📝 【审稿编辑·二审修正清单】：结合全组自查打卡反映的痛点与正文审阅，提出以下 3 项【诊断问题与改进建议】：\n①【核心概念对齐】\n· 诊断问题：引言中“有效社会共享调节”缺乏操作性界定，文献述评未充分支撑核心研究问题；\n· 改进建议：补充明确的操作性定义，使文献综述直接呼应研究假设。\n②【研究方法深化】\n· 诊断问题：认知网络分析（ENA）缺乏具体实施步骤与编码维度对应逻辑，操作化论证单薄；\n· 改进建议：细化编码维度与测量工具的具体操作步骤，增强方法严密性。\n③【行文衔接规范】\n· 诊断问题：部分章节存在口语化表述，引言末尾与方法开头过渡较为生硬；\n· 改进建议：统一全篇学术术语命名，补全逻辑过渡句。\n👉 请大家围绕清单协同商定修改对策与落实方案，讨论差不多后点击下方【📝 讨论差不多了？让审稿编辑总结】！`;
        if (!reviewingText.startsWith('📝')) reviewingText = `📝 【审稿编辑·二审修正清单】：${reviewingText}`;

        const msgReviewing = {
          sender: 'reviewingEditor',
          senderName: '学术质量 · 审稿编辑',
          text: reviewingText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          _timeMs: Date.now() + 100
        };
        s2ChatLogs.push(msgReviewing);

        // 🌟 核心突破：立即解析并动态生成左侧【半程修正清单】卡片 (全面解锁)
        let parsedItems = [];
        let bodyText = reviewingText;
        const headerMatch = bodyText.match(/二审修正清单[】:：\s]*/);
        if (headerMatch) {
          bodyText = bodyText.slice(headerMatch.index + headerMatch[0].length);
        }
        bodyText = bodyText.replace(/[👉\s]*请大家围绕.*$/s, '')
                           .replace(/[👉\s]*请全组围绕.*$/s, '')
                           .replace(/[👉\s]*讨论差不多.*$/s, '')
                           .replace(/[👉\s]*点击下方.*$/s, '')
                           .trim();

        const chunks = bodyText.split(/(?=[①②③]|\b[123]\.)/g).map(c => c.trim()).filter(Boolean);
        chunks.forEach(c => {
          let clean = c.replace(/^[①②③\d\.\s\(\)]+/, '').replace(/[；;。]\s*$/, '').trim();
          if (clean.length > 5) {
            parsedItems.push(clean);
          }
        });

        s2.actionPlan = {
          isGenerated: true,
          completedMap: (s2.actionPlan && s2.actionPlan.completedMap) || {},
          items: parsedItems.slice(0, 3)
        };

        s2.meetingStep = 'discussing_checklist'; // 变形为第二态按钮
        s2.meetingChecklistTime = Date.now();

        this.syncStage2();
        this.syncChatLogs();
        if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
      } catch (e) {
        console.warn('handleS2ManagingSummary error:', e);
      } finally {
        this.state.activeAgentAnalyzing = null; // 🌟 研判完毕，清除动态分析框
        this._isGeneratingManagingSummary = false;
        renderChat(this.state);
        this.renderStudentWorkspace(); // 🌟 立即解锁并展开左侧正文上方的【半程修正清单】卡片！
      }
    }

    /**
     * 📝 阶段二半程会议第二步：审稿专家提炼终版要点并指导回到正文继续撰写
     */
    async handleS2ReviewingSummary() {
      const s2 = this.state.stage2 || {};
      if (!this.state.stage2) this.state.stage2 = s2;
      if (!s2.confirmations) s2.confirmations = {};
      if (!s2.confirmations.s2_reviewing) s2.confirmations.s2_reviewing = {};

      const currUser = this.authManager ? this.authManager.getCurrentUser() : null;
      const currUserCode = this.state.currentUser || currUser?.studentCode || currUser?.name || 'A';

      // 1. 记录当前用户的确认
      s2.confirmations.s2_reviewing[currUserCode] = true;
      if (currUser?.studentCode) s2.confirmations.s2_reviewing[currUser.studentCode] = true;
      if (currUser?.name) s2.confirmations.s2_reviewing[currUser.name] = true;

      // 计算总组员人数
      const effClassId = this.state.activeStudentClassId || currUser?.classId || null;
      const effGroup = this.authManager ? this.authManager.getStudentActiveGroup(currUser, effClassId) : null;
      const membersList = (effGroup && Array.isArray(effGroup.members) && effGroup.members.length > 0) 
        ? effGroup.members 
        : Object.values(this.state.members || {});
      const totalCount = membersList.length || 2;

      const isDoneHelper = (map) => {
        if (!map) return 0;
        return membersList.filter(m => {
          let fullUser = (typeof m === 'object') ? m : null;
          if (!fullUser && this.authManager && this.authManager.findUserByKey) {
            fullUser = this.authManager.findUserByKey(m);
          }
          const keys = [
            typeof m === 'string' ? m : null,
            m?.id, m?.studentCode, m?.username, m?.name,
            fullUser?.id, fullUser?.studentCode, fullUser?.username, fullUser?.name
          ].filter(Boolean).map(k => String(k).trim().toLowerCase());
          return keys.some(k => map[k] || map[String(k)]);
        }).length;
      };

      const confirmedCount = isDoneHelper(s2.confirmations.s2_reviewing);

      // 立即同步并更新聊天框底栏按钮展示
      this.syncStage2();
      if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
      renderChat(this.state);

      // 若尚未全员确认，提示等待其他组员
      if (confirmedCount < totalCount) {
        return;
      }

      // 2. 全员已确认：开始让审稿编辑提炼终版要点并指导回到正文冲刺
      const s2ChatLogs = (this.state.chatLogs && this.state.chatLogs.stage2) ? this.state.chatLogs.stage2 : [];
      const checklistIdx = s2ChatLogs.findIndex(m => m && m.text && m.text.includes('二审修正清单'));
      const relevantLogs = (checklistIdx >= 0) ? s2ChatLogs.slice(checklistIdx) : s2ChatLogs;
      const userLogs = relevantLogs.filter(m => m && m.sender && !AgentProfiles[m.sender] && m.sender !== 'system');
      const chatSnippet = userLogs.map(m => `${m.senderName || m.sender}: ${m.text}`).join('\n') || '组员已商定修改落实对策';

      const topic = (this.state.stage1 && this.state.stage1.mergedTitle) ? this.state.stage1.mergedTitle : '本组课题';

      const summaryPrompt = `小组成员已就《二审修正清单》在讨论区明确了各自的修改落实分工与计划。
  【组内关于清单落实的讨论记录】:
  ${chatSnippet}

  请作为审稿编辑，发表 90~120 字的【修改落实确认与终审冲刺寄语】：
  ① 肯定大家清晰务实的修改分工与严谨态度；
  ② 鼓励全组回到左侧正文继续高效撰写与修改，冲刺最终高质量学术成文！（纯自然语言，90~120字）`;

      try {
        // 🌟 挂载审稿编辑三审正在分析中动态状态框
        this.state.activeAgentAnalyzing = {
          icon: '📝',
          title: '【审稿编辑】正在审查清单落实与定稿冲刺...',
          detail: '正在评估全组修改对策与落实方案，起草学术成稿与答辩冲刺寄语...'
        };
        this.renderStudentWorkspace();

        const respSummary = await callCozeAgentAPI('reviewingEditor', summaryPrompt, { stage: 'stage2', topic });
        let summaryText = (respSummary && respSummary.trim().length > 0)
          ? respSummary.trim()
          : `📝 【审稿编辑·修改确认与写作冲刺】：太棒了！看到全组已明确了针对各项修正清单的具体落实分工！修改思路非常清晰。👉 请大家回到左侧正文写作区，将商定好的修改对策落实到位，继续推进后续章节，冲刺终审定稿！`;
        if (!summaryText.startsWith('📝')) summaryText = `📝 【审稿编辑·修改确认与写作冲刺】：${summaryText}`;

        const msgSummary = {
          sender: 'reviewingEditor',
          senderName: '学术质量 · 审稿编辑',
          text: summaryText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          _timeMs: Date.now()
        };
        s2ChatLogs.push(msgSummary);

        s2.meetingStep = 'completed'; // 完成半程会议，收起按钮
        s2.reviewMilestone = 'second_review_done';

        this.syncStage2();
        this.syncChatLogs();
        if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
      } catch (e) {
        console.warn('handleS2ReviewingSummary error:', e);
      } finally {
        this.state.activeAgentAnalyzing = null; // 🌟 研判完毕，清除动态分析框
        renderChat(this.state);
        this.renderStudentWorkspace();
      }
    }

    /**
     * 🎓 阶段三队列式逐条研讨：一键提炼当前质询答辩词，自动回填左侧矩阵，并顺推下一题/终审裁决
     */
    async handleS3InquirySummary(targetInquiry) {
      const s3 = this.state.stage3 || {};
      const feedbacks = Array.isArray(s3.feedbackItems) ? s3.feedbackItems : [];
      const currentInquiry = targetInquiry || feedbacks.find(f => f.role === 'opponent' && (!f.response || !f.response.trim()));
      if (!currentInquiry) return;

      const inqIndex = feedbacks.indexOf(currentInquiry);
      const inqLabel = inqIndex >= 1 ? `意见 ${inqIndex}` : '当前质询';

      const s3ChatLogs = (this.state.chatLogs && this.state.chatLogs.stage3) ? this.state.chatLogs.stage3 : [];
      const lastChairIdx = s3ChatLogs.map(m => m.sender).lastIndexOf('neutral');
      const msgsForInquiry = s3ChatLogs.slice(lastChairIdx + 1).filter(m => m.sender && !AgentProfiles[m.sender] && m.sender !== 'system');
      const chatSnippet = msgsForInquiry.map(m => `${m.senderName || m.sender}: ${m.text}`).join('\n') || '组员正在商讨辩护思路与修改对策';

      const remainingOppCount = feedbacks.filter(f => f.role === 'opponent' && f !== currentInquiry && (!f.response || !f.response.trim())).length;
      const nextInquiry = feedbacks.find(f => f.role === 'opponent' && f !== currentInquiry && (!f.response || !f.response.trim()));
      const nextIndex = nextInquiry ? feedbacks.indexOf(nextInquiry) : -1;
      const nextLabel = nextIndex >= 1 ? `意见 ${nextIndex}` : '下一项质询';

      const topic = (this.state.stage1 && this.state.stage1.mergedTitle) ? this.state.stage1.mergedTitle : '论文方案';

      const evalInquiryPrompt = `小组成员已就核心课题《${topic}》针对【反方质询 ${inqLabel}】在研讨区展开了辩护与修改商议。
  【反方原始质询】: ${currentInquiry.comment || currentInquiry.content}
  【小组成员的真实辩护讨论记录】:
  ${chatSnippet}

  请作为答辩委员会主席（中间委员），发表【答辩审阅定案与顺推裁决】：
  1. 【提炼答辩共识】：精准提炼全组成员达成的核心辩护陈述与修改方案要点（用于回填归档）；
  2. 【委员会定案与推进】：
     ${remainingOppCount > 0
       ? `① 宣布【${inqLabel}】辩护有效并予以采纳，答辩陈述已定案回填入库；\n② 【单题顺推】：顺承引导全组将焦点转向【${nextLabel}】展开深入研讨，并给出 1 条启发性思路点拨！`
       : `① 宣布全部质询辩护完毕且均获委员会全票认可，已全部定案；\n② 发表答辩终审裁决总结，祝贺团队圆满通过学术答辩，提醒全组点击左侧【修改论文终稿】面板，将答辩修改落实到正文中准备最终归档！`}
  请按以下格式输出：
  答辩陈述：[提取的 60~90 字精准答辩词，用于回填左侧矩阵]
  主席发言：[100~130 字自然语言点评与顺推裁决]`;

      try {
        const resp = await callCozeAgentAPI('neutral', evalInquiryPrompt, { stage: 'stage3', topic });
        let extractedResponse = chatSnippet.slice(0, 150);
        let chairSpeech = (remainingOppCount > 0)
          ? `🟡 【中间委员·答辩定案与顺推】：【${inqLabel}】辩护方案已定案归档！👉 请全组将研讨焦点转向【${nextLabel}】，继续在讨论区商定对策！商定后点击上方【💡 ${nextLabel} 讨论差不多了？帮我总结并填入】！`
          : `🟡 【中间委员·答辩终审总结与裁决】：🎉 各位研究者，全部质询均已辩护定案并获委员会全票认可！答辩圆满顺利通过！👉 请全组成员点击左侧【修改论文终稿】面板，将答辩中的修改共识落实到论文终稿正文中，准备最终归档！`;

        if (resp && resp.trim().length > 0) {
          const lines = resp.trim().split('\n');
          const respLine = lines.find(l => l.includes('答辩陈述：') || l.includes('答辩陈述:'));
          const speechLine = lines.find(l => l.includes('主席发言：') || l.includes('主席发言:'));
          if (respLine) extractedResponse = respLine.replace(/^.*答辩陈述[：:]\s*/, '').trim() || extractedResponse;
          if (speechLine) chairSpeech = speechLine.replace(/^.*主席发言[：:]\s*/, '').trim() || chairSpeech;
          else if (!respLine && lines.length > 0) chairSpeech = resp.trim();
        }

        // 自动回填至左侧当前卡片并标记定案
        currentInquiry.response = extractedResponse;
        currentInquiry.isFinalized = true;
        currentInquiry.status = 'finalized';

        if (!chairSpeech.startsWith('🟡')) {
          chairSpeech = `🟡 【中间委员·答辩定案与顺推】：${chairSpeech}`;
        }

        const chairMsgObj = {
          sender: 'neutral',
          senderName: '答辩委员会主席 · 中间委员',
          text: chairSpeech,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          _timeMs: Date.now()
        };
        s3ChatLogs.push(chairMsgObj);

        this.syncStage3();
        this.syncChatLogs();
        if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
        this.renderStudentWorkspace();
        renderChat(this.state);
      } catch (e) {
        console.warn('handleS3InquirySummary error:', e);
        currentInquiry.response = msgsForInquiry.map(m => m.text).join('；').slice(0, 150) || '全组已达成辩护共识并落实修改。';
        currentInquiry.isFinalized = true;
        this.syncStage3();
        this.renderStudentWorkspace();
        renderChat(this.state);
      }
    }

    async handleAiGenerateContract() {
      await this.handleExtractTasks();
    }

    async triggerStageWelcomeSpeech(stage) {
      const currUser = this.authManager ? this.authManager.getCurrentUser() : null;
      const isTeacher = currUser && (currUser.role === 'teacher' || currUser.isTeacher);
      // 🛡️ 铁律：教师端监控或尚未完成初次云端拉取前绝不触发开场白生成（防止刷新时冷启动空内存抢跑生成假新开场白）
      if (isTeacher || this.state.isTeacherMonitorView || this.state.isTeacherView) {
        return;
      }
      if (this.cloudSyncEngine && !this.cloudSyncEngine.isInitialPullDone) {
        return;
      }

      const effectiveClassId = (isTeacher ? this.state.activeClassId : this.state.activeStudentClassId) || currUser?.classId || null;
      const groupId = this.getEffectiveGroupId();
      let taskId = this.state.activeTaskId || (this.cloudSyncEngine ? this.cloudSyncEngine.taskId : `task_${effectiveClassId}_default`);
      if (!taskId || taskId === 'task_default') {
        taskId = `task_${effectiveClassId}_default`;
      }

      const welcomeFlagKey = `jizhi_welcomed_${taskId}_${groupId}_${stage}`;
      if (sessionStorage.getItem(welcomeFlagKey)) return;

      if (!this.state.chatLogs[stage]) this.state.chatLogs[stage] = [];
      const logs = this.state.chatLogs[stage];
      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      // 🎪 阶段一：拍卖师欢迎开场白
      if (stage === 'stage1') {
        const hasAuctioneerIntro = logs.some(m => m && (m.sender === 'auctioneer' || (m.id && String(m.id).includes('auctioneer'))) && (m.text?.includes('阶段一') || m.text?.includes('拍卖会') || m.text?.includes('拍卖师开场')));
        if (!hasAuctioneerIntro) {
          sessionStorage.setItem(welcomeFlagKey, '1');
          const welcomeMsg = {
            id: `msg_welcome_${taskId}_${groupId}_stage1`,
            classId: effectiveClassId,
            groupId: groupId,
            taskId: taskId,
            stage: 'stage1',
            sender: 'auctioneer',
            senderName: '学术拍卖师',
            text: `🎪 【拍卖师开场】：欢迎来到【阶段一：学术拍卖会】！我是本阶段的选题顾问拍卖师。\n请全组成员点击左侧【提交我的选题】提出各自的研究构想，并在研讨区充分交流。我们将通过拍卖投票遴选最佳提案，并在下方《学术合作公约》中商定分工与时间分配！`,
            timestamp: now,
            _timeMs: Date.now()
          };
          logs.unshift(welcomeMsg);
          this.sendSingleChatMessage(welcomeMsg, 'stage1');
          if (typeof window.renderChat === 'function') window.renderChat(this.state);
        } else {
          sessionStorage.setItem(welcomeFlagKey, '1');
        }
      }

      // 🤝 阶段二：必须小组真实已推进至阶段二（groupMaxStage 为 stage2/3 或公约已确认）时才触发
      else if (stage === 'stage2' && (this.state.groupMaxStage === 'stage2' || this.state.groupMaxStage === 'stage3' || this.state.stage1?.contract?.isConfirmed)) {
        const hasManagingIntro = logs.some(m => m && m.sender === 'managingEditor' && (m.text?.includes('欢迎来到【阶段二：学术编辑部】') || m.text?.includes('责任编辑开场')));
        if (!hasManagingIntro) {
          const s1 = this.state.stage1 || {};
          const topic = s1.mergedTitle || '未定课题';
          const tasks = s1.contract && s1.contract.taskAssignments ? s1.contract.taskAssignments : {};
          const times = s1.contract && s1.contract.timeAllocations ? s1.contract.timeAllocations : {};

          let assignSummary = [];
          let memberArr = Array.isArray(this.state.members) ? this.state.members : Object.values(this.state.members || {});
          memberArr.forEach(m => {
            if (!m) return;
            const t = tasks[m.id] || tasks[m.studentCode] || tasks[m.name] || '待认领';
            assignSummary.push(`${m.name}: ${t}`);
          });

          let timeSummary = [];
          if (times.background) timeSummary.push(`背景 ${times.background}m`);
          if (times.questions) timeSummary.push(`问题 ${times.questions}m`);
          if (times.literature) timeSummary.push(`文献 ${times.literature}m`);
          if (times.method) timeSummary.push(`方法 ${times.method}m`);
          if (times.reflection) timeSummary.push(`反思 ${times.reflection}m`);
          if (times.references) timeSummary.push(`文献表 ${times.references}m`);

          const managingWelcome = {
            id: `msg_welcome_${taskId}_${groupId}_stage2_managing`,
            sender: 'managingEditor',
            senderName: '责任编辑 · 过程学伴',
            text: `🤝 【责任编辑·开场欢迎】：各位研究者，欢迎来到【阶段二：学术编辑部】！全组已锁定研究主题《${topic}》。请大家根据公约设想展开协同起草，主动研读同伴起草的段落，共同打通前后逻辑！请进入左侧富文本编辑器开启深度协作！`,
            timestamp: now,
            _timeMs: Date.now()
          };
          logs.unshift(managingWelcome);
          this.sendSingleChatMessage(managingWelcome, 'stage2');
          if (typeof window.renderChat === 'function') window.renderChat(this.state);

          setTimeout(() => {
            const reviewingWelcome = {
              id: `msg_welcome_${taskId}_${groupId}_stage2_reviewing`,
              sender: 'reviewingEditor',
              senderName: '审稿编辑 · 质量把关',
              text: `📝 【审稿编辑·开场寄语】：大家好！我是本阶段的审稿编辑。在大家的写作过程中，我将分别在开篇破题、半程研讨与终审定稿三个关键节点为大家提供质检把脉与修改清单，护航全篇学术质量！👉 写作遇到瓶颈时，建议大家参考顶部【学术范文】与参考文献支架，学习规范的学术行文与章节论述架构！`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              _timeMs: Date.now()
            };
            logs.push(reviewingWelcome);
            this.sendSingleChatMessage(reviewingWelcome, 'stage2');
            if (typeof window.renderChat === 'function') window.renderChat(this.state);
          }, 1800);
        }
      }

      // 🎓 阶段三：严格按时序：① 中间委员开场 ➔ ② 正方肯定 ➔ ③ 反方质询 ➔ ④ 平台写入矩阵 ➔ ⑤ 中间委员抛题引导
      else if (stage === 'stage3') {
        const membersList = Object.values(this.state.members || {});
        const isLeaderClient = !membersList.length || (this.state.currentUser === membersList[0]?.studentCode || this.state.currentUser === membersList[0]?.id || this.state.currentUser === membersList[0]?.username);

        const hasProp = logs.some(m => m && m.sender === 'proponent');
        const hasOpp = logs.some(m => m && m.sender === 'opponent');
        const needsCommitteeReview = !hasProp || !hasOpp || !this.state.stage3.feedbackItems || this.state.stage3.feedbackItems.length === 0;

        if (needsCommitteeReview && isLeaderClient && !this._isStage3PipelineRunning) {
          this.runStage3CommitteePipeline();
        }
      }
    }

    async runStage3CommitteePipeline() {
      if (this._isStage3PipelineRunning) return;
      this._isStage3PipelineRunning = true;
      this.state.stage3CommitteeLoading = true;
      this.renderStudentWorkspace();

      try {
        if (!this.state.chatLogs.stage3) this.state.chatLogs.stage3 = [];
        const logs = this.state.chatLogs.stage3;
        const topic = (this.state.stage1 && this.state.stage1.mergedTitle) ? this.state.stage1.mergedTitle : '本组研究设计';
        let rawContent = (this.state.stage2 && this.state.stage2.unifiedContent) ? this.state.stage2.unifiedContent.replace(/<[^>]*>/g, '').trim() : '';
        if (!rawContent || rawContent.length < 50) {
          rawContent = `课题名称: ${topic}。正文涵盖背景意义、文献综述、问题与假设、研究设计与方法、反思等完整初稿。`;
        }

        // 1. 中间委员开场（如果尚未开场）
        const hasNeutralIntro = logs.some(m => m && m.sender === 'neutral' && (m.text?.includes('欢迎来到【阶段三') || m.text?.includes('中间委员开场')));
        if (!hasNeutralIntro) {
          const neutralWelcome = {
            id: `msg_welcome_${this.state.activeTaskId}_${this.state.currentUser}_stage3_neutral`,
            sender: 'neutral',
            senderName: '中间委员 · 裁决引导',
            text: `🟡 【中间委员开场】：各位研究者，欢迎来到【阶段三：答辩擂台】！初稿撰写完毕，答辩委员会已就位。正反两方评审专家正在通读审阅全篇论文，请大家稍候！`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            _timeMs: Date.now()
          };
          logs.push(neutralWelcome);
          this.sendSingleChatMessage(neutralWelcome, 'stage3');
          this.syncChatLogs();
          if (typeof window.renderChat === 'function') window.renderChat(this.state);
          // ⏱️ 预留 2.5 秒，让全组看清中间委员开场
          await new Promise(r => setTimeout(r, 2500));
        }

        // 2. 正方委员发表肯定意见
        const hasProp = logs.some(m => m && m.sender === 'proponent');
        let propText = '';
        if (!hasProp) {
          const propPrompt = `针对小组论文《${topic}》，请通读下方【小组当前真实正文草稿】全文，作为答辩委员会正方评审教授发表 130~150 字的肯定支持评审意见：
  【基于真实正文的动态赞赏原则】：通读正文草稿全文，从 5 大赞赏维度（①行文风格与语言通顺、②选题与立意创新、③设计与方法严密、④实践落地与推广价值、⑤规范与术语统一）中，根据本篇论文的真实闪光点，动态灵活挑选 2~3 个最契合的核心亮点（必须至少 2 个，最多 3 个，严禁死板固化在某两个固定维度），紧扣具体学科与章节展开具体赞赏，为全组提供充实的正面论据支架！纯自然语言输出，130~150字。`;

          propText = await callCozeAgentAPI('proponent', propPrompt, { stage: 'stage3', topic, actualDoc: rawContent });
          if (!propText || propText.trim().length === 0) {
            propText = `🟢 【正方委员评审意见】：通读全篇，该研究展现出了极高的学术价值与实践意义！最出彩的地方体现在两点：①【选题与立意创新】：针对教学痛点提出的干预切口非常新颖独特；②【实践落地与推广价值】：方案在真实课堂中的教学活动设计可操作性极强，论据充分，为全组的深度协同点赞！`;
          }
          const propMsg = {
            sender: 'proponent',
            text: propText,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            _timeMs: Date.now()
          };
          logs.push(propMsg);
          this.sendSingleChatMessage(propMsg, 'stage3');
          this.syncChatLogs();
          if (typeof window.renderChat === 'function') window.renderChat(this.state);
          // ⏱️ 预留 5.5 秒通读时间，让组员充分领会正方的肯定亮点
          await new Promise(r => setTimeout(r, 5500));
        } else {
          const existingProp = logs.find(m => m && m.sender === 'proponent');
          propText = existingProp ? existingProp.text : '';
        }

        // 3. 反方委员发表尖锐质询意见
        const hasOpp = logs.some(m => m && m.sender === 'opponent');
        let oppText = '';
        if (!hasOpp) {
          const oppPrompt = `针对小组论文《${topic}》，请通读下方【小组当前真实正文草稿】全文，结合正方委员刚才的肯定意见，作为答辩委员会反方评审教授发表 130~150 字的温和学术商榷质询意见：

  【正方委员刚才的肯定意见参考】:
  ${propText}

  【全局学术博弈红线与动态质询原则】：
  1. 正方明确夸赞的具体局部段落与具体事实严禁唱反调；顺着正方赞赏的创新构想，可辩证审视其在真实教学中“落地可行性与实施挑战”；
  2. 从 5 大质询维度（①具体设计落地的可行性与实施挑战、②行文风格割裂与语言表达通顺度、③变量操作化与测量工具严密性、④实验对照与变量控制逻辑、⑤正方未夸赞章节的行文与术语规范）中，根据本篇论文的真实薄弱处，动态灵活挑选 2~3 个最切中要害的质询点（必须至少 2 个，最多 3 个，严禁死板固化在某两个固定维度）；
  3. 必须以清晰的序号 ① ② 分条呈现质询焦点；
  4. 态度务必温和客气、极具建设性（多用“商讨/请教/小细节/落地可行性”）。纯自然语言输出，130~150字。`;

          oppText = await callCozeAgentAPI('opponent', oppPrompt, { stage: 'stage3', topic, actualDoc: rawContent });
          if (!oppText || oppText.trim().length === 0) {
            oppText = `🔴 【反方委员·商讨质询】：仔细研读了大家的成果，正方对该选题创新价值的肯定我非常赞同！在此基础上，我想从实证落地与行文严谨性的角度请教团队两个具体细节：①【具体设计/实施挑战】：在相关章节中，常态化教学中具体干预周期的落地性与认知负荷如何防范？②【行文风格/方法严密性】：在后续论述中，部分测量工具的信效度检验与前后行文风格需进一步规范。期待听听大家的从容思考与答辩~`;
          }
          const oppMsg = {
            sender: 'opponent',
            text: oppText,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            _timeMs: Date.now()
          };
          logs.push(oppMsg);
          this.sendSingleChatMessage(oppMsg, 'stage3');
          this.syncChatLogs();
          if (typeof window.renderChat === 'function') window.renderChat(this.state);
          // ⏱️ 反方发言后微留 2 秒让组员看一眼反方要点
          await new Promise(r => setTimeout(r, 2000));
        } else {
          const existingOpp = logs.find(m => m && m.sender === 'opponent');
          oppText = existingOpp ? existingOpp.text : '';
        }

        // 4. 平台自动将正反评审意见【即刻同步写入】左侧【答辩裁决矩阵】
        const oppBody = (oppText || '').replace(/^[^\n]*?【[^】]+】[：:]?\s*/, '').trim();
        const oppMatches = oppBody.match(/[①②③④⑤][^①②③④⑤]*/g);
        const oppQueries = (oppMatches && oppMatches.length > 0)
          ? oppMatches.map(s => s.trim()).filter(s => s.length > 0)
          : [oppBody];
        this.state.stage3.feedbackItems = [
          { id: 'fb_prop', role: 'proponent', speaker: '正方委员 Agent (肯定支持)', title: '立论支持', content: propText.replace(/^[^\n]*?【[^】]+】[：:]?\s*/, ''), response: '', status: 'pending' }
        ];
        oppQueries.forEach((q, i) => {
          this.state.stage3.feedbackItems.push({
            id: 'fb_opp_' + (i + 1),
            role: 'opponent',
            speaker: '反方委员 Agent (尖锐质询)',
            title: '质询 ' + (i + 1),
            content: q,
            response: '',
            status: 'pending'
          });
        });
        this.state.stage3CommitteeLoading = false;
        this.syncStage3();
        this.syncChatLogs();
        if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
        renderChat(this.state);
        this.renderStudentWorkspace();
        // ⏱️ 矩阵就位后预留 3 秒通读思考，中间委员再出场下发第 1 题思路引导
        await new Promise(r => setTimeout(r, 3000));

        // 5. 中间委员独立调用 Coze API，引导第 1 题辩护
        const hasChairGuide = logs.some(m => m && m.sender === 'neutral' && (m.text?.includes('答辩思路引导') || m.text?.includes('质询 ①')));
        if (!hasChairGuide) {
          const chairPrompt = `答辩正反两方评审意见已入驻左侧矩阵。
  【正方意见】: ${propText}
  【反方质询】: ${oppText}

  请作为答辩委员会主席（中间委员），发表 130~150 字的【针对质询 ① 独立答辩思路引导】：
  ① 宣布正反方评审已正式送达并生成【答辩与终稿修改清单】，肯定正方的创新与实践价值，明确指出反方提出了针对实质询；
  ② 【单题独立引导·核心铁律】：本次只聚焦【意见 1 / 质询 ①】，结合反方质询①的具体内容给出清晰的答辩破局/操作化补救思路支架（严禁提及或剧透后续质询！）；
  ③ 引导全组在讨论区充分商讨，商定差不多后点击聊天框上方【💡 意见 1 讨论差不多了？帮我总结并填入】按钮！纯自然语言输出，130~150字。`;

          let chairText = await callCozeAgentAPI('neutral', chairPrompt, { stage: 'stage3', topic, prop: propText, opp: oppText, queryPoint: 1 });
          if (!chairText || chairText.trim().length === 0) {
            chairText = `🟡 【中间委员·针对意见 1 答辩思路引导】：正反方评审已正式送达并生成修改清单！请大家通读意见，首先聚焦【意见 1】：建议结合正方提到的优势，在答辩中阐明针对意见1的具体破局与操作化补救思路！请全组在讨论区商定对策，商定后点击上方【💡 意见 1 讨论差不多了？帮我总结并填入】按钮！`;
          }

          const chairMsg = {
            sender: 'neutral',
            senderName: '答辩委员会主席 · 中间委员',
            text: chairText,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            _timeMs: Date.now()
          };
          logs.push(chairMsg);
          this.sendSingleChatMessage(chairMsg, 'stage3');
          this.syncChatLogs();
          if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
          if (typeof window.renderChat === 'function') window.renderChat(this.state);
        }
      } catch (err) {
        console.error('Stage 3 committee pipeline error:', err);
      } finally {
        this.state.stage3CommitteeLoading = false;
        this._isStage3PipelineRunning = false;
        this.renderStudentWorkspace();
      }
    }

    switchStage(newStage, isMilestoneAdvance = false) {
      this.lastLocalStageChangeTime = Date.now();
      const stageOrder = { stage1: 1, stage2: 2, stage3: 3 };

      const s1 = this.state.stage1 || {};
      const s2 = this.state.stage2 || {};
      const s3 = this.state.stage3 || {};

      const isContractSigned = !!(
        s1.contract?.signed || 
        s1.contract?.isConfirmed || 
        (s1.contract?.confirmedMembers && (
          (Array.isArray(s1.contract.confirmedMembers) && s1.contract.confirmedMembers.length > 0) ||
          (typeof s1.contract.confirmedMembers === 'object' && Object.keys(s1.contract.confirmedMembers).length > 0)
        ))
      );
      const isDraftDone = !!(s2.isDraftConfirmed || (s2.meetingSubmissions && Object.keys(s2.meetingSubmissions).length > 0) || this.state.groupMaxStage === 'stage3' || this.state.isFinalSubmitted);
      const isStage3Active = !!(this.state.groupMaxStage === 'stage3' || this.state.isFinalSubmitted || isDraftDone || (s3.confirmedMembers && Object.keys(s3.confirmedMembers).length > 0) || (s3.finalSubmittedMembers && Object.keys(s3.finalSubmittedMembers).length > 0));

      let currentGroupMax = this.state.groupMaxStage || 'stage1';
      if (isStage3Active) {
        currentGroupMax = 'stage3';
        this.state.groupMaxStage = 'stage3';
      } else if (isContractSigned || currentGroupMax === 'stage2') {
        currentGroupMax = 'stage2';
        this.state.groupMaxStage = 'stage2';
      }

      const currentGroupOrder = stageOrder[currentGroupMax] || 1;
      const targetOrder = stageOrder[newStage] || 1;

      const allTasks = (this.authManager) ? this.authManager.getTasks() : [];
      const currentTaskObj = allTasks.find(t => t.id === this.state.activeTaskId);
      const isTaskDeadlineExpired = isTaskExpired(currentTaskObj);

      // 🛡️ 阶段防越权门禁：未达成里程碑解锁时，禁止学生随意点击跳级（截止只读查阅模式下或已归档时全阶段自由放行浏览）
      if (!isTaskDeadlineExpired && !this.state.isFinalSubmitted && newStage === 'stage2' && !isMilestoneAdvance && !isContractSigned && currentGroupOrder < 2) {
        alert('⚠️ 暂未解锁【阶段二：学术编辑部】！\n请先在阶段一完成学术公约的签署与分工确认，方可进入阶段二。');
        return;
      }

      if (!isTaskDeadlineExpired && !this.state.isFinalSubmitted && targetOrder > currentGroupOrder && !isMilestoneAdvance) {
        const stageTitles = { stage2: '【阶段二：学术编辑部】', stage3: '【阶段三：答辩擂台】' };
        alert(`⚠️ 暂未解锁 ${stageTitles[newStage] || newStage}！\n必须先在当前阶段完成公约签署与阶段任务后，系统将自动全组解锁推进。`);
        return;
      }

      // 🛡️ 阶段一公约草案锁存：离开阶段一前，主动收集当前 DOM 上所有最新输入框值并立即持久化落盘
      if (this.state.currentStage === 'stage1') {
        const topicInp = document.getElementById('contract-topic-input');
        if (topicInp) {
          if (!this.state.stage1) this.state.stage1 = {};
          this.state.stage1.mergedTitle = topicInp.value;
        }
        const overviewInp = document.getElementById('contract-overview-input');
        if (overviewInp) {
          if (!this.state.stage1) this.state.stage1 = {};
          if (!this.state.stage1.contract) this.state.stage1.contract = {};
          this.state.stage1.contract.overview = overviewInp.value;
          this.state.stage1.researchOverview = overviewInp.value;
        }
        const timeInps = document.querySelectorAll('.contract-time-input');
        if (timeInps.length > 0) {
          if (!this.state.stage1.contract) this.state.stage1.contract = {};
          if (!this.state.stage1.contract.timeAllocations) this.state.stage1.contract.timeAllocations = {};
          timeInps.forEach(inp => {
            const k = inp.dataset.key;
            if (k) this.state.stage1.contract.timeAllocations[k] = Number(inp.value) || 0;
          });
        }
        const taskInps = document.querySelectorAll('.task-assignment-input');
        if (taskInps.length > 0) {
          if (!this.state.stage1.contract) this.state.stage1.contract = {};
          if (!this.state.stage1.contract.taskAssignments) this.state.stage1.contract.taskAssignments = {};
          taskInps.forEach(inp => {
            const mk = inp.dataset.mkey;
            if (mk) this.state.stage1.contract.taskAssignments[mk] = inp.value;
          });
        }
        this.syncStage1();
        if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
      }

      // 🛡️ 正文草稿锁存：切换前从 Etherpad 实时提取最新全文存入内存与快照，绝不丢字，并供阶段三智能体深度分析
      if (this.state.currentStage === 'stage2') {
        const currentUser = this.authManager ? this.authManager.getCurrentUser() : null;
        const strictCtx = (this.authManager && typeof this.authManager.resolveStudentActiveContext === 'function')
          ? this.authManager.resolveStudentActiveContext(currentUser, {
              classId: this.state.activeStudentClassId || null,
              taskId: this.state.activeTaskId || null
            })
          : null;
        // 解析不到时不构建 pad 名、不发起任何请求（彻底消除 jizhi_..._null 这类空 pad）
        if (strictCtx && strictCtx.ok) {
          const padName = `jizhi_${strictCtx.taskId}_${strictCtx.groupId}`;
          try {
            fetch(`sync.php?action=get_pad_text&padId=${padName}`)
              .then(res => res.json())
              .then(data => {
                if (data && data.success && data.text) {
                  if (!this.state.stage2) this.state.stage2 = {};
                  this.state.stage2.unifiedContent = data.text;
                }
              })
              .catch(() => {});
          } catch (e) {}
        }
      }

      this.isViewingPastStage = (targetOrder < currentGroupOrder);
      this.state.currentStage = newStage;
      if (isMilestoneAdvance && targetOrder > currentGroupOrder) {
        this.state.groupMaxStage = newStage;
        this.isViewingPastStage = false;
      }
      if (newStage === 'stage2' && (!this.state.stage2 || !this.state.stage2.stageStartTime)) {
        if (!this.state.stage2) this.state.stage2 = {};
        this.state.stage2.stageStartTime = Date.now();
      }
      if (newStage === 'stage3' && (!this.state.stage3 || !this.state.stage3.stageStartTime)) {
        if (!this.state.stage3) this.state.stage3 = {};
        this.state.stage3.stageStartTime = Date.now();
      }
      this.syncStageChange(newStage);
      this.triggerStageWelcomeSpeech(newStage);
      this.renderStudentWorkspace(true);
    }

    setSpeed(newSpeed) {
      this.state.timer.speed = newSpeed;
      const currentUser = this.authManager.getCurrentUser();
      renderHeader(
        this.state, currentUser, this.authManager.getAnnouncements(),
        (s) => this.switchStage(s), (sp) => this.setSpeed(sp),
        () => this.handleLogout(), () => this.switchToTeacherView(),
        () => this.showAnnouncementModal(), () => this.showQuestionnaireModal(),
        () => this.backToTaskList()
      );
    }

    renderStudentWorkspace(isForced = false) {
      if (this.state.studentViewMode === 'task_list') {
        this.renderMain();
        return;
      }
      const isStageTransition = (this._lastRenderedStage !== this.state.currentStage);
      this._lastRenderedStage = this.state.currentStage;
      if (isStageTransition) isForced = true;

      const currentUser = this.authManager.getCurrentUser();
      const effectiveClassId = this.state.activeStudentClassId || (currentUser?.classId || null);
      const activeGroupObj = this.authManager.getStudentActiveGroup(currentUser, effectiveClassId);
      let currentGroupId = activeGroupObj.id || (currentUser && currentUser.groupId ? currentUser.groupId : 'group_1');

      // 🛡️ 班级/小组/成员/任务严格解析：任一解析不到 → 明确提示并阻止进入学生工作区（不再静默兜底）
      if (this.authManager && typeof this.authManager.resolveStudentActiveContext === 'function') {
        const strictCtx = this.authManager.resolveStudentActiveContext(currentUser, {
          classId: this.state.activeStudentClassId || null,
          taskId: this.state.activeTaskId || null
        });
        if (!strictCtx.ok) {
          const appEl = document.getElementById('app');
          if (appEl) appEl.innerHTML = showResolutionBlock(strictCtx.reason);
          return;
        }
        currentGroupId = strictCtx.groupId;
        this.state.activeStudentClassId = strictCtx.classId;
      }

      this.state.members = this.authManager.getGroupMembersForWorkspace(currentGroupId);
      this.state.currentUser = currentUser ? (currentUser.name || currentUser.studentCode || currentUser.id) : null;

      renderHeader(
        this.state, currentUser, this.authManager.getAnnouncements(),
        (s) => this.switchStage(s), (sp) => this.setSpeed(sp),
        () => this.handleLogout(), () => this.switchToTeacherView(),
        () => this.showAnnouncementModal(), () => this.showQuestionnaireModal(),
        () => this.backToTaskList()
      );

      // 🔔 检查并通知当前任务的延期
      if (this.authManager) {
        const allTasks = this.authManager.getTasks();
        const currentTask = allTasks.find(t => t.id === this.state.activeTaskId);
        if (currentTask && currentTask.deadline) {
          const dlKey = `jizhi_known_deadline_${currentTask.id}`;
          const unreadKey = `jizhi_unread_deadline_ext_${currentTask.id}`;
          const prevDl = localStorage.getItem(dlKey);
          const newDlMs = new Date(currentTask.deadline.replace(/-/g, '/')).getTime();
          let shouldNotify = false;
          if (localStorage.getItem(unreadKey)) {
            shouldNotify = true;
            localStorage.removeItem(unreadKey);
          } else if (prevDl) {
            const prevDlMs = Number(prevDl);
            if (newDlMs > prevDlMs + 60000) {
              shouldNotify = true;
            }
          }
          localStorage.setItem(dlKey, String(newDlMs));

          if (shouldNotify) {
            showGlobalBannerNotice(
              `指导教师已延长本任务写作时间！`,
              `截止时间已自动更新至：${formatStandardDateDash(currentTask.deadline)}，剩余时间已增加。`
            );
          }
        }
        // 记录其他任务的未读延期标记
        allTasks.forEach(t => {
          if (!t || !t.id || t.id === this.state.activeTaskId || !t.deadline) return;
          const dlKey = `jizhi_known_deadline_${t.id}`;
          const prevDl = localStorage.getItem(dlKey);
          const newDlMs = new Date(t.deadline.replace(/-/g, '/')).getTime();
          if (prevDl && newDlMs > Number(prevDl) + 60000) {
            localStorage.setItem(`jizhi_unread_deadline_ext_${t.id}`, '1');
            localStorage.setItem(dlKey, String(newDlMs));
          }
        });
      }

      // 默认自动触发当前阶段对应智能体的开场白（如果尚未发送）
      this.triggerStageWelcomeSpeech(this.state.currentStage || 'stage1');

      // ── 核心保护：全场景输入法与活动输入框智能保护 ──
      const activeEl = document.activeElement;
      const isTagInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);
      const isComposingActive = !!(window._isGlobalComposing || activeEl?.dataset?.isComposing === 'true');
      const isInputFocused = isTagInput || isComposingActive;

      const isEditorTyping = !isForced && isInputFocused;

      // 如果用户在阶段一且画布已存在，且非强制重置，做局部精准 Patch
      const existingContractCard = document.querySelector('.contract-card');
      if (!isForced && this.state.currentStage === 'stage1' && existingContractCard) {
        // 局部更新提案池卡片与投票按钮
        const proposalsWrapper = document.getElementById('proposals-wrapper-container');
        const s1 = this.state.stage1 || { proposals: [], votes: {}, hasVoted: {}, contract: {} };
        const membersList = Array.isArray(this.state.members) ? this.state.members : Object.values(this.state.members || {});
        const currentUserObj = this.authManager ? this.authManager.getCurrentUser() : null;
        const myKeys = new Set([...getUserAllKeys(currentUserObj), this.state.currentUser, currentUserObj?.id, currentUserObj?.studentCode].filter(Boolean));
        const userVotedProposalId = s1.votes ? (getUserFromMap(s1.votes, currentUserObj) || s1.votes[this.state.currentUser]) : null;
        const userHasVoted = s1.hasVoted ? (isUserInMap(s1.hasVoted, currentUserObj) || s1.hasVoted[this.state.currentUser]) : false;
        const isContractLocked = s1.contract?.isConfirmed || this.state.isFinalSubmitted;

        const allUsers = this.authManager ? this.authManager.getUsers() : [];
        const hasSubmittedMyProposal = (s1.proposals || []).some(p => {
          if (!p) return false;
          if (myKeys.has(p.author) || myKeys.has(p.authorName) || myKeys.has(p.authorId)) return true;
          if (currentUserObj && (isSameUser(p.author, currentUserObj) || isSameUser(p.authorName, currentUserObj) || (p.authorName && p.authorName === currentUserObj.name))) return true;
          return false;
        });

        const btnOpenProp = document.getElementById('btn-open-submit-proposal');
        if (btnOpenProp) {
          btnOpenProp.innerText = hasSubmittedMyProposal ? '✏️ 修改我的选题' : '+ 提交我的选题';
        }

        // 🛡️ 实时动态更新顶部投票进度条 Badge (解决多端投票进度滞后未同步问题)
        const progressBadge = document.getElementById('proposal-vote-progress-badge');
        if (progressBadge) {
          const totalVotesCast = membersList.filter(m => (isUserInMap(s1.hasVoted, m) || (m && (s1.hasVoted[m.id] || s1.hasVoted[m.studentCode] || s1.hasVoted[m.username] || (m.name && s1.hasVoted[m.name]))))).length;
          const totalMembersCount = membersList.length || 2;
          const isVotingComplete = (totalMembersCount > 0 && totalVotesCast >= totalMembersCount);
          progressBadge.innerHTML = isVotingComplete
            ? `🎉 投票已完成 (共投出 ${totalVotesCast} 票)`
            : `📊 投票进度: <b>${totalVotesCast}/${totalMembersCount} 人已投票</b> ${userHasVoted ? '<span style="color:#059669; font-weight:700; margin-left:4px;">(您已投票，等待其他组员)</span>' : ''}`;
        }

        if (proposalsWrapper) {
          if (Array.isArray(s1.proposals) && s1.proposals.length > 0) {
            proposalsWrapper.innerHTML = `
              <div class="proposals-grid" style="margin-top:12px;">
                ${s1.proposals.map(p => {
                  // 动态聚合计算该提案的真实得票数
                  const proposalVotesCount = membersList.filter(m => {
                    if (!s1.votes) return false;
                    const v = getUserFromMap(s1.votes, m) || s1.votes[m.studentCode] || s1.votes[m.id] || s1.votes[m.username] || (m.name && s1.votes[m.name]);
                    return v === p.id;
                  }).length;

                  const isThisVoted = userVotedProposalId === p.id;
                  let btnText = '🗳️ 投票支持';
                  let btnClass = 'vote-btn';
                  if (isContractLocked || userHasVoted) {
                    if (isThisVoted) { btnText = '🔒 已投此提案'; btnClass = 'vote-btn active locked'; }
                    else { btnText = '🔒 投票已锁定'; btnClass = 'vote-btn disabled'; }
                  }
                  let authorName = (p.authorName && p.authorName !== '组员') ? p.authorName : null;
                  if (!authorName) {
                    const authorUser = allUsers.find(u => isSameUser(u, p.author) || isSameUser(u, p.authorName) || u.id === p.author || u.studentCode === p.author || u.username === p.author || u.name === p.author || u.name === p.authorName);
                    if (authorUser && authorUser.name) authorName = authorUser.name;
                  }
                  if (!authorName) {
                    const authorMem = membersList.find(m => isSameUser(m, p.author) || isSameUser(m, p.authorName) || m.id === p.author || m.studentCode === p.author || m.name === p.author);
                    if (authorMem && authorMem.name) authorName = authorMem.name;
                  }
                  if (!authorName) authorName = p.authorName || p.author || '组员';
                  // 判断是否为当前用户自己的提案
                  const isMyProposal = myKeys.has(p.author) || myKeys.has(p.authorName) || myKeys.has(p.authorId) ||
                    (currentUserObj && (isSameUser(p.author, currentUserObj) || isSameUser(p.authorName, currentUserObj)));
                  return `
                    <div class="proposal-card ${isThisVoted ? 'voted' : ''}" style="display:flex; flex-direction:column; position:relative;">
                      <div class="proposal-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <div class="proposal-title" style="font-weight:800; font-size:14px; color:#0f172a;">💡 ${escapeHtml(p.title)}</div>
                        <span style="font-size:11.5px; background:${proposalVotesCount > 0 ? '#eff6ff' : '#f8fafc'}; color:${proposalVotesCount > 0 ? '#2563eb' : '#64748b'}; border:1px solid ${proposalVotesCount > 0 ? '#bfdbfe' : '#e2e8f0'}; padding:2px 8px; border-radius:10px; font-weight:700; flex-shrink:0;">
                          得票: <b>${proposalVotesCount}</b> 票
                        </span>
                      </div>
                      <div style="font-size:12px; color:#64748b; margin-bottom:8px;">提出人: <b style="color:#0f172a;">${escapeHtml(authorName)}</b></div>
                      ${isMyProposal ? `<button class="btn-retry-eval" data-title="${escapeHtml(p.title)}" data-author="${escapeHtml(authorName)}" style="width:100%; margin-bottom:6px; padding:5px 0; font-size:12px; background:#f0fdf4; color:#16a34a; border:1px solid #86efac; border-radius:6px; cursor:pointer;">🔄 重新请求速评</button>` : ''}
                      <button class="${btnClass}" data-id="${p.id}" ${isContractLocked || userHasVoted ? 'disabled' : ''} style="width:100%; margin-top:auto;">${btnText}</button>
                    </div>
                  `;
                }).join('')}
              </div>
            `;
            proposalsWrapper.querySelectorAll('.vote-btn:not([disabled])').forEach(btn => {
              btn.addEventListener('click', () => this.handleVoteCast(btn.dataset.id));
            });
            proposalsWrapper.querySelectorAll('.btn-retry-eval').forEach(btn => {
              btn.addEventListener('click', async () => {
                btn.disabled = true;
                btn.textContent = '⏳ 请求中...';
                try {
                  await this.handleProposalSubmittedAIFeedback(btn.dataset.title, btn.dataset.author, false);
                } catch(e) {}
                btn.disabled = false;
                btn.textContent = '🔄 重新请求速评';
              });
            });
          } else {
            proposalsWrapper.innerHTML = `
              <div style="text-align:center; padding:36px; background:#f8fafc; border-radius:10px; border:2px dashed #cbd5e1; margin-top:10px;">
                <div style="font-size:32px; margin-bottom:8px;">💡</div>
                <div style="font-size:15px; font-weight:800; color:#0f172a;">目前暂无小组成员提交的选题</div>
                <div style="font-size:12.5px; color:#64748b; margin-top:4px;">请点击右上角【+ 提交我的选题】录入选题名称。</div>
              </div>
            `;
          }
        }

        // 🛡️ 实时动态更新公约顶部操作提炼按钮及协同确认计数
        const contractActionBarMount = document.getElementById('stage1-contract-action-bar-mount');
        if (contractActionBarMount && !isContractLocked) {
          const confs = this.state.stepConfirmations || {};
          const totalMembersCount = membersList.length || 2;
          const totalVotesCast = membersList.filter(m => (isUserInMap(s1.hasVoted, m) || (m && (s1.hasVoted[m.id] || s1.hasVoted[m.studentCode] || s1.hasVoted[m.username] || (m.name && s1.hasVoted[m.name]))))).length;
          const isVotingComplete = (totalMembersCount > 0 && totalVotesCast >= totalMembersCount);
          const currUserCode = this.state.currentUser;

          const isDoneHelper = (map) => {
            if (!map) return 0;
            return membersList.filter(m => map[m.id] || map[m.studentCode] || map[m.username] || (m.name && map[m.name])).length;
          };
          const isMyDoneHelper = (map) => {
            if (!map) return false;
            return !!(map[currUserCode] || (currentUserObj && (map[currentUserObj.id] || map[currentUserObj.studentCode] || map[currentUserObj.username] || map[currentUserObj.name])));
          };

          if (s1.contractStep === 'completed' || s1.contract?.isDraftGenerated) {
            contractActionBarMount.innerHTML = `
              <div style="background:#f0fdf4; border:1.5px solid #86efac; color:#15803d; padding:7px 22px; border-radius:20px; font-weight:800; font-size:13px; display:inline-flex; align-items:center; gap:6px; box-shadow:0 2px 8px rgba(34,197,94,0.15);">
                ✅ 公约草案已全部提炼生成（全组可微调修改，并在下方签署确认）
              </div>
            `;
          } else if (s1.contractStep === 'tasks') {
            const count = isDoneHelper(confs.s1_tasks);
            const isMe = isMyDoneHelper(confs.s1_tasks);
            const isFull = count >= totalMembersCount && totalMembersCount > 0;
            contractActionBarMount.innerHTML = `
              <button id="btn-extract-tasks" style="background:${isFull ? 'linear-gradient(135deg, #d97706, #b45309)' : (isMe ? 'linear-gradient(135deg, #059669, #047857)' : 'linear-gradient(135deg, #7c3aed, #6d28d9)')}; border:none; color:white; padding:9px 24px; border-radius:20px; font-weight:800; font-size:13.5px; cursor:${isFull ? 'wait' : 'pointer'}; display:inline-flex; align-items:center; gap:6px; box-shadow:0 4px 14px rgba(124,58,237,0.3); transition:all 0.2s;" ${isFull ? 'disabled' : ''}>
                ${isFull ? `⏳ 全员已确认 (${count}/${totalMembersCount}) · 正在生成公约草案...` : (isMe ? `✅ 您已确认提炼分工 (${count}/${totalMembersCount} 等待其他组员)` : `👥 研讨差不多了？一键提炼【任务分工】 (${count}/${totalMembersCount})`)}
              </button>
            `;
            if (!isFull) {
              contractActionBarMount.querySelector('#btn-extract-tasks')?.addEventListener('click', () => this.handleExtractTasks());
            }
          } else if (s1.contractStep === 'time') {
            const count = isDoneHelper(confs.s1_time);
            const isMe = isMyDoneHelper(confs.s1_time);
            const isFull = count >= totalMembersCount && totalMembersCount > 0;
            contractActionBarMount.innerHTML = `
              <button id="btn-extract-time" style="background:${isFull ? 'linear-gradient(135deg, #d97706, #b45309)' : (isMe ? 'linear-gradient(135deg, #059669, #047857)' : 'linear-gradient(135deg, #0284c7, #0369a1)')}; border:none; color:white; padding:9px 24px; border-radius:20px; font-weight:800; font-size:13.5px; cursor:${isFull ? 'wait' : 'pointer'}; display:inline-flex; align-items:center; gap:6px; box-shadow:0 4px 14px rgba(2,132,199,0.3); transition:all 0.2s;" ${isFull ? 'disabled' : ''}>
                ${isFull ? `⏳ 全员已确认 (${count}/${totalMembersCount}) · 正在提炼时间分配...` : (isMe ? `✅ 您已确认提炼时间 (${count}/${totalMembersCount} 等待其他组员)` : `⏱️ 时间讨论差不多了？一键提炼【时间分配】 (${count}/${totalMembersCount})`)}
              </button>
            `;
            if (!isFull) {
              contractActionBarMount.querySelector('#btn-extract-time')?.addEventListener('click', () => this.handleExtractTime());
            }
          } else {
            const count = isDoneHelper(confs.s1_topic);
            const isMe = isMyDoneHelper(confs.s1_topic);
            const isFull = count >= totalMembersCount && totalMembersCount > 0;
            if (!isVotingComplete) {
              contractActionBarMount.innerHTML = `
                <button id="btn-extract-topic" class="locked-pending-btn" style="background:#f1f5f9; border:1px solid #cbd5e1; color:#94a3b8; padding:9px 24px; border-radius:20px; font-weight:800; font-size:13.5px; cursor:not-allowed; display:inline-flex; align-items:center; gap:6px; box-shadow:none;">
                  🔒 请先完成投票推选 (${totalVotesCast}/${totalMembersCount} 人已投)
                </button>
              `;
              contractActionBarMount.querySelector('#btn-extract-topic')?.addEventListener('click', () => {
                alert(`🔒 请先完成全员提案提交与投票推选！\n\n当前全组投票进度：${totalVotesCast}/${totalMembersCount} 人已投票。\n投票结束后拍卖师将落槌揭晓结果，随后方可开启主题与方案提炼。`);
              });
            } else {
              contractActionBarMount.innerHTML = `
                <button id="btn-extract-topic" style="background:${isFull ? 'linear-gradient(135deg, #d97706, #b45309)' : (isMe ? 'linear-gradient(135deg, #059669, #047857)' : 'linear-gradient(135deg, #2563eb, #1d4ed8)')}; border:none; color:white; padding:9px 24px; border-radius:20px; font-weight:800; font-size:13.5px; cursor:${isFull ? 'wait' : 'pointer'}; display:inline-flex; align-items:center; gap:6px; box-shadow:0 4px 14px rgba(37,99,235,0.3); transition:all 0.2s;" ${isFull ? 'disabled' : ''}>
                  ${isFull ? `⏳ 全员已确认 (${count}/${totalMembersCount}) · 正在提炼【主题与研究方案】...` : (isMe ? `✅ 您已确认提炼主题与方案 (${count}/${totalMembersCount} 等待其他组员)` : `💡 讨论差不多了？一键提炼【主题与研究方案】 (${count}/${totalMembersCount})`)}
                </button>
              `;
              if (!isFull) {
                contractActionBarMount.querySelector('#btn-extract-topic')?.addEventListener('click', () => this.handleExtractTopic());
              }
            }
          }
        }

        // 🛡️ 实时动态更新公约底部签署矩阵与确认操作按钮
        const signMatrixMount = document.getElementById('stage1-contract-sign-matrix-mount');
        const signActionMount = document.getElementById('stage1-contract-sign-action-mount');
        if (signMatrixMount || signActionMount) {
          const totalMembersCount = membersList.length || 2;
          const currUserCode = this.state.currentUser;
          const confirmedMembers = s1.contract?.confirmedMembers || {};
          const confirmedCount = membersList.filter(m => (confirmedMembers[m.id] || confirmedMembers[m.studentCode] || confirmedMembers[m.username] || (m.name && confirmedMembers[m.name]))).length;
          const userHasConfirmed = !!(confirmedMembers[currUserCode] || (currentUserObj && (confirmedMembers[currentUserObj.id] || confirmedMembers[currentUserObj.studentCode] || confirmedMembers[currentUserObj.username] || confirmedMembers[currentUserObj.name])));

          if (signMatrixMount) {
            signMatrixMount.innerHTML = `
              <div style="font-size:13px; font-weight:700; color:#334155; margin-bottom:10px; display:flex; justify-content:space-between; flex-wrap:wrap; gap:10px;">
                <span>📌 本组全员确认签署状态矩阵 (规则：需 ${totalMembersCount}/${totalMembersCount} 人全部点击确认):</span>
                <span style="color:${confirmedCount === totalMembersCount ? '#059669' : '#d97706'}; font-weight:800;">签署进度: ${confirmedCount}/${totalMembersCount} 人已完成 ${confirmedCount === totalMembersCount ? '🎉 (合约已生效)' : ''}</span>
              </div>
              <div style="display:flex; flex-wrap:wrap; gap:10px; font-size:13px;">
                ${membersList.map(m => {
                  const isConf = !!(confirmedMembers[m.id] || confirmedMembers[m.studentCode] || confirmedMembers[m.username] || (m.name && confirmedMembers[m.name]));
                  return `
                    <span style="color:${isConf ? '#059669' : '#64748b'}; border:1px solid ${isConf ? '#a7f3d0' : '#e2e8f0'}; background:${isConf ? '#ecfdf5' : '#ffffff'}; padding:6px 12px; border-radius:8px; font-weight:600;">
                      ${m.avatar || '👤'} ${m.name}: <b>${isConf ? '✅ 已确认签署' : '⏳ 未确认'}</b>
                    </span>
                  `;
                }).join('')}
              </div>
            `;
          }

          if (signActionMount) {
            if (isContractLocked) {
              signActionMount.innerHTML = `
                <button id="btn-goto-stage2" style="background:linear-gradient(135deg, #2563eb, #1d4ed8); border:none; color:white; padding:13px 36px; border-radius:10px; font-weight:800; cursor:pointer; font-size:15px; box-shadow:0 4px 14px rgba(37,99,235,0.3); display:inline-flex; align-items:center; gap:8px;">
                  🚀 全员已签署完毕！前往【阶段二：学术编辑部】开始论文起草 →
                </button>
              `;
              signActionMount.querySelector('#btn-goto-stage2')?.addEventListener('click', () => {
                this.switchStage('stage2');
              });
            } else {
              signActionMount.innerHTML = `
                <button id="btn-confirm-contract" style="background:${userHasConfirmed ? '#eff6ff' : 'linear-gradient(135deg, #059669, #047857)'}; border:1px solid ${userHasConfirmed ? '#bfdbfe' : 'transparent'}; color:${userHasConfirmed ? '#1d4ed8' : 'white'}; padding:13px 32px; border-radius:10px; font-weight:800; cursor:pointer; font-size:14.5px; box-shadow:0 3px 12px rgba(5,150,105,0.25);">
                  ${userHasConfirmed ? `✅ 我 (${currentUserName}) 已按键确认签署 (${confirmedCount}/${totalMembersCount} 人已完成)` : `✍️ 我以 (${currentUserName}) 身份按键确认签署合约 (已确认 ${confirmedCount}/${totalMembersCount} 人)`}
                </button>
              `;
              signActionMount.querySelector('#btn-confirm-contract')?.addEventListener('click', () => {
                this.handleConfirmContract();
              });
            }
          }
        }
      } else if (!isEditorTyping) {
        const handlers = {
          onVote: (propId) => { this.handleVoteCast(propId); },
          onRefresh: () => { this.renderStudentWorkspace(); },
          onContractChange: () => { this.syncStage1(); },
          onExtractTopic: () => { this.handleExtractTopic(); },
          onExtractTime: () => { this.handleExtractTime(); },
          onExtractTasks: () => { this.handleExtractTasks(); },
          onAiGenerateContract: () => { this.handleAiGenerateContract(); },
          onConfirmContract: () => { this.handleConfirmContract(); },
          onActionPlanToggle: (idx, isCompleted) => {
            if (!this.state.stage2) this.state.stage2 = {};
            if (!this.state.stage2.actionPlan) this.state.stage2.actionPlan = { items: [], completedMap: {} };
            if (!this.state.stage2.actionPlan.completedMap) this.state.stage2.actionPlan.completedMap = {};
            this.state.stage2.actionPlan.completedMap[idx] = !!isCompleted;
            this.syncStage2();
            if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
            this.renderStudentWorkspace();
          },
          onPresenceChange: (nodeIdx, sectionTitle, charOffset) => {
            const user = this.state.currentUser;
            if (!this.state.presence) this.state.presence = {};
            this.state.presence[user] = {
              nodeIndex: nodeIdx,
              activeSection: sectionTitle || '正文',
              charOffset: typeof charOffset === 'number' ? charOffset : null,
              updatedAt: Date.now()
            };
            if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
          },
        onUnifiedContentChange: (newContent) => {
          if (this.state.isFinalSubmitted) return;
          const cleanHtml = (newContent || '').replace(/<span class="remote-cursor-widget"[\s\S]*?<\/span>/gi, '');
          this.state.stage2.unifiedContent = cleanHtml;
          const user = this.state.currentUser;
          const plain = cleanHtml.replace(/<[^>]*>/g, '').trim();

          if (!this.state.stage2.memberContributions) this.state.stage2.memberContributions = {};

          if (plain.length === 0) {
            this.lastPlainTextLength = 0;
            Object.keys(this.state.members || {}).forEach(mId => {
              this.state.stage2.memberContributions[mId] = 0;
            });
          } else {
            const prevLen = (this.lastPlainTextLength === undefined) ? plain.length : this.lastPlainTextLength;
            const delta = plain.length - prevLen;
            this.lastPlainTextLength = plain.length;
            if (delta > 0) {
              this.state.stage2.memberContributions[user] = (this.state.stage2.memberContributions[user] || 0) + delta;
            }
          }

          const currUserObj = (this.authManager) ? this.authManager.getCurrentUser() : null;
          if (!this.state.presence) this.state.presence = {};
          const myKeys = [user, currUserObj?.id, currUserObj?.studentCode, currUserObj?.username, currUserObj?.name].filter(Boolean);
          const nowMs = Date.now();
          myKeys.forEach(k => {
            this.state.presence[k] = {
              nodeIndex: 0,
              activeSection: '正在撰写正文',
              updatedAt: nowMs
            };
          });

          // 🚀 稳健极速同步：打字期间防抖 500ms 自动保存并推送到云端数据库
          if (this._contentSyncDebounceTimer) {
            clearTimeout(this._contentSyncDebounceTimer);
          }
          this._contentSyncDebounceTimer = setTimeout(() => {
            this.updateContributionUi();
            this.syncStage2();
            if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
            this.checkAgentTriggersOnContent(cleanHtml);
          }, 500);
        },
        onOpenCaseModal: () => {
          this.showReferencePapersModal();
        },
        onOpenMeetingModal: () => { 
          if (this.state.currentStage === 'stage3' || this.state.isFinalSubmitted) {
            alert('🔒 阶段二半程编辑会议已结束并归档，不可再次发起。你可随时查阅已锁定的【半程编辑修正清单】！');
            return;
          }
          this.showMeetingModal(); 
        },
        onConfirmStage2Draft: () => {
          if (!this.state.stage2) this.state.stage2 = {};
          const s2 = this.state.stage2;
          if (s2.isDraftConfirmed) {
            alert('🔒 正文初稿已被组内全员确认！已解锁阶段三。');
            return;
          }
          const user = this.state.currentUser;

          let memberArr = [];
          if (Array.isArray(this.state.members)) memberArr = this.state.members;
          else if (this.state.members && typeof this.state.members === 'object') memberArr = Object.values(this.state.members);
          if (memberArr.length === 0 && this.authManager) {
            const u = this.authManager.getCurrentUser();
            const effClassId = (this.authManager ? this.authManager.getEffectiveStudentClassId(u, this.state.activeTaskId) : (this.state.activeStudentClassId || u?.classId || null));
            const effGroup = this.authManager.getStudentActiveGroup(u, effClassId);
            memberArr = this.authManager.getGroupMembersForWorkspace(effGroup?.id || this.state.activeGroupId || null);
          }
          const totalMembersCount = memberArr.length > 0 ? memberArr.length : 3;

          // 🛡️ 极速状态合并：提取本地持久化与内存中已有所有确认记录，防止并发冲刷
          const groupId = (typeof this.getEffectiveGroupId === 'function') ? this.getEffectiveGroupId() : (this.state.activeGroupId || this.state.activeGroupId || null);
          const cachedRaw = localStorage.getItem(`jizhi_group_state_${groupId}`);
          if (cachedRaw) {
            try {
              const cachedState = JSON.parse(cachedRaw);
              if (cachedState && cachedState.stage2 && cachedState.stage2.confirmedMembers) {
                s2.confirmedMembers = { ...(cachedState.stage2.confirmedMembers || {}), ...(s2.confirmedMembers || {}) };
              }
            } catch(e) {}
          }
          if (!s2.confirmedMembers) s2.confirmedMembers = {};

          const isMemDone = (map, m) => {
            if (!map || !m) return false;
            return !!(map[m.id] || map[m.studentCode] || map[m.username] || (m.name && map[m.name]));
          };
          const currMemObj = memberArr.find(m => m && (m.id === user || m.studentCode === user || m.username === user || m.name === user));
          if (currMemObj) {
            if (currMemObj.id) s2.confirmedMembers[currMemObj.id] = true;
            if (currMemObj.studentCode) s2.confirmedMembers[currMemObj.studentCode] = true;
            if (currMemObj.username) s2.confirmedMembers[currMemObj.username] = true;
            if (currMemObj.name) s2.confirmedMembers[currMemObj.name] = true;
          } else {
            s2.confirmedMembers[user] = true;
          }

          const confirmedCount = memberArr.filter(m => isMemDone(s2.confirmedMembers, m)).length;
          const memberName = currMemObj ? currMemObj.name : user;

          this.syncStage2();
          this.syncChatLogs();
          if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
          renderChat(this.state);
          this.renderStudentWorkspace();
          this.checkStage2Milestones();

          // 🛡️ 严格要求：必须全组成员每一个人都点击确认初稿后，才解锁推进至阶段三
          if (confirmedCount < totalMembersCount) {
            alert(`✅ 您 (${memberName}) 已成功确认正文初稿！\n\n当前组内确认进度：${confirmedCount}/${totalMembersCount} 人已确认。\n⚠️ 必须全组所有成员均完成确认后，系统才会正式解锁【阶段三：答辩擂台】！请提醒组内其他同学尽快确认。`);
          } else {
            s2.isDraftConfirmed = true;
            this.state.groupMaxStage = 'stage3';
            const currentUserObj = this.authManager ? this.authManager.getCurrentUser() : null;
            const activeTaskId = this.state.activeTaskId || null;
            const userGroupId = (currentUserObj && currentUserObj.groupId) ? currentUserObj.groupId : 'group_1';
            if (this.authManager && this.authManager.markAllTaskAnnouncementsRead) {
              this.authManager.markAllTaskAnnouncementsRead(activeTaskId, userGroupId);
            }

            // 责任编辑立即在阶段二聊天记录中正式宣布全员确认完毕
            const finalMsg = {
              sender: 'managingEditor',
              senderName: '责任编辑 · 过程学伴',
              text: `🎉 【责任编辑宣布】：恭喜！组内全员 ${totalMembersCount}/${totalMembersCount} 名成员已全部确认正文初稿定稿！阶段二圆满结束，系统已全员解锁【阶段三：答辩擂台】！请大家点击顶部导航进入阶段三开始答辩！`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              _timeMs: Date.now() + 50
            };
            if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
            this.state.chatLogs.stage2.push(finalMsg);
            this.syncStage2();
            this.syncChatLogs();
            if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
            renderChat(this.state);
            this.renderStudentWorkspace();

            alert(`🎉 恭喜！组内全员 (${totalMembersCount}/${totalMembersCount} 人) 已全部完成初稿确认！\n\n系统已全组解锁【阶段三：答辩擂台】！请随时点击顶部导航栏中的【阶段三：答辩擂台】进入答辩。`);
          }
          this.renderStudentWorkspace();
        },
        onConfirmStage3Revision: () => {
          const user = this.state.currentUser;
          const s3 = this.state.stage3;
          let memberArr = [];
          if (Array.isArray(this.state.members)) memberArr = this.state.members;
          else if (this.state.members && typeof this.state.members === 'object') memberArr = Object.values(this.state.members);
          if (memberArr.length === 0 && this.authManager) {
            const u = this.authManager.getCurrentUser();
            const effClassId = (this.authManager ? this.authManager.getEffectiveStudentClassId(u, this.state.activeTaskId) : (this.state.activeStudentClassId || u?.classId || null));
            const effGroup = this.authManager.getStudentActiveGroup(u, effClassId);
            memberArr = this.authManager.getGroupMembersForWorkspace(effGroup?.id || this.state.activeGroupId || null);
          }
          const totalMembersCount = memberArr.length > 0 ? memberArr.length : 3;

          if (!s3.confirmedMembers) s3.confirmedMembers = {};
          s3.confirmedMembers[user] = true;
          const currMemObj = memberArr.find(m => m && (m.id === user || m.studentCode === user || m.username === user || m.name === user));
          if (currMemObj) {
            if (currMemObj.id) s3.confirmedMembers[currMemObj.id] = true;
            if (currMemObj.studentCode) s3.confirmedMembers[currMemObj.studentCode] = true;
            if (currMemObj.username) s3.confirmedMembers[currMemObj.username] = true;
            if (currMemObj.name) s3.confirmedMembers[currMemObj.name] = true;
          }

          const confirmedCount = memberArr.filter(m => m && (s3.confirmedMembers[m.id] || s3.confirmedMembers[m.studentCode] || s3.confirmedMembers[m.username] || (m.name && s3.confirmedMembers[m.name]))).length;
          const memberName = currMemObj ? currMemObj.name : user;

          if (confirmedCount >= totalMembersCount) {
            s3.isRevisionConfirmed = true;
            const promptMsg = {
              sender: 'neutral',
              text: `🎉 【中间委员宣布】：恭喜！组内全员 ${totalMembersCount}/${totalMembersCount} 人已全部确认完成答辩！【修改论文终稿】面板已正式解锁！请组员切换至【📝 修改论文终稿】面板完善正文，修改完毕后由代表点击【🚀 提交论文终稿】完成归档！`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              _timeMs: Date.now() + 50
            };
            this.state.chatLogs.stage3.push(promptMsg);
            this.syncStage3();
            this.syncChatLogs();
            if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
            this.renderStudentWorkspace();
            renderChat(this.state);
            alert(`🎉 恭喜！组内全员 (${totalMembersCount}/${totalMembersCount} 人) 已全部完成答辩确认！\n\n【修改论文终稿】面板已正式解锁！请切换至终稿面板协同修改并提交。`);
          } else {
            this.syncStage3();
            this.syncChatLogs();
            if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
            this.renderStudentWorkspace();
            renderChat(this.state);
            alert(`✅ 您 (${memberName}) 已成功确认完成答辩！\n\n当前组内答辩确认进度：${confirmedCount}/${totalMembersCount} 人已确认。\n⚠️ 必须全组所有成员均完成确认后，系统才会正式解锁【修改论文终稿】面板！请提醒组内其他同学尽快确认。`);
          }
        },
        onSwitchStage3Tab: (tabKey) => {
          this.state.stage3.activeTab = tabKey;
          this.syncStage3();
          this.renderStudentWorkspace();
        },
        onSaveDirectFeedback: async (id, respText) => {
          if (this.state.isFinalSubmitted || this.state.stage3?.isRevisionConfirmed) {
            alert('🔒 全组已全员确认进入终稿修改或已提交终稿，答辩裁决矩阵已处于锁定归档模式！无法再修改答辩结论。');
            return;
          }
          if (this._isSavingDirectFeedback) return;
          this._isSavingDirectFeedback = true;

          try {
            const items = this.state.stage3.feedbackItems || [];
            const currentIndex = items.findIndex(f => f.id === id);
            const item = items[currentIndex];

            if (item) {
              item.status = 'adopted';
              item.response = respText;
              const currentStage = this.state.currentStage || 'stage3';
              const currentUser = this.state.currentUser;

              const isProp = item.role === 'proponent';
              const labelTitle = isProp ? '专家立论支持' : (item.title || `质询 ${currentIndex}`);
              const discMsg = {
                sender: currentUser,
                text: `📢 [答辩质询研讨结论]: 组内已对【${item.speaker} - ${labelTitle}】完成答辩并达成共识：“${respText}”！`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                _timeMs: Date.now()
              };
              if (!this.state.chatLogs[currentStage]) this.state.chatLogs[currentStage] = [];
              this.state.chatLogs[currentStage].push(discMsg);
              this.syncStage3();
              this.syncChatLogs();
              if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
              this.renderStudentWorkspace();
              renderChat(this.state);

              // 只有反方质询且有未完成项时才顺推
              const unadoptedOppCount = items.filter(f => f.role === 'opponent' && (!f.response || f.response.trim().length === 0)).length;
              const topic = (this.state.stage1 && this.state.stage1.mergedTitle) ? this.state.stage1.mergedTitle : '论文方案';

              const adoptedSummaries = items.map((f, i) => `• 质询${i + 1}【${f.speaker}】: ${f.response || '待录入'}`).join('\n');

              let queryPrompt = '';
              if (unadoptedOppCount > 0) {
                const nextItem = items.find(f => f.role === 'opponent' && (!f.response || f.response.trim().length === 0));
                const nextIndex = items.indexOf(nextItem);
                queryPrompt = `小组成员刚对已完成的质询录入并达成了答辩共识：“${respText}”。
  请作为答辩委员会主席（中间委员），发表 130~150 字的【针对质询 ${nextIndex} 独立答辩思路顺推】：
  ① 肯定前序答辩词已成功录入；
  ② 【单题独立顺推·核心铁律】：独立引导全组将焦点转向下一项【质询 ${nextIndex}（${nextItem.content || nextItem.title}）】，结合其具体内容给出针对性的答辩思路支架（如补强措施/量表信度说明/补救预案）；
  ③ 引导全组继续在讨论区商定思路，由代表录入矩阵，并同步将修改落实到论文终稿中！纯自然语言输出，130~150字。`;
              } else {
                queryPrompt = `恭喜！小组成员已对全部答辩质询完成研讨并录入全部答辩陈述！
  全组答辩共识汇总：\n${adoptedSummaries}

  请作为答辩委员会主席（中间委员），发表 130~150 字的【答辩终审总结裁决与交卷指引】：
  ① 宣布答辩委员会已审阅全组提交的全部答辩陈述与终稿，肯定全组面对质询展现出的学术反思与严谨论证逻辑；
  ② 隆重宣布答辩全票顺利通过，祝贺大家圆满完成研究任务；
  ③ 明确指引全组成员点击左侧【提交终稿】锁定入库！纯自然语言输出，130~150字。`;
              }

              let neutralReply = await callCozeAgentAPI('neutral', queryPrompt, { stage: 'stage3', topic });
              if (!neutralReply || neutralReply.trim().length === 0) {
                if (unadoptedOppCount > 0) {
                  const nextItem = items.find(f => f.role === 'opponent' && (!f.response || f.response.trim().length === 0));
                  const nextIndex = items.indexOf(nextItem);
                  neutralReply = `🟡 【中间委员·针对质询 ${nextIndex} 答辩思路顺推】：前序答辩词已成功录入！👉 接下来请全组将焦点转向【质询 ${nextIndex}】：建议在答辩中明确阐述针对该质询的具体补强措施与设计说明！请全组继续在讨论区商定思路，由代表录入矩阵，并同步将修改落实到论文终稿中！`;
                } else {
                  neutralReply = `🟡 【中间委员·答辩终审总结与裁决】：各位研究者，答辩委员会已审阅了全组提交的全部答辩陈述与终稿！团队在面对质询时展现出了扎实的学术反思与严谨的论证逻辑。答辩全票顺利通过，祝贺大家圆满完成研究任务！请全组成员点击左侧【提交终稿】锁定入库！`;
                }
              }

              const neutralMsgObj = {
                sender: 'neutral',
                text: neutralReply,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                _timeMs: Date.now()
              };
              this.state.chatLogs[currentStage].push(neutralMsgObj);
              this.syncChatLogs();
              if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
              renderChat(this.state);
            }
          } finally {
            this._isSavingDirectFeedback = false;
          }
        },

        onFinalSubmit: () => { 
          if (this.state.isFinalSubmitted) {
            alert('🔒 论文终稿已于此前成功全员提交！目前处于全盘只读归档模式，可随时切页查阅各阶段记录。');
            return;
          }
          const user = this.state.currentUser;
          const s3 = this.state.stage3;
          let memberArr = [];
          if (Array.isArray(this.state.members)) memberArr = this.state.members;
          else if (this.state.members && typeof this.state.members === 'object') memberArr = Object.values(this.state.members);
          if (memberArr.length === 0 && this.authManager) {
            const u = this.authManager.getCurrentUser();
            const effClassId = (this.authManager ? this.authManager.getEffectiveStudentClassId(u, this.state.activeTaskId) : (this.state.activeStudentClassId || u?.classId || null));
            const effGroup = this.authManager.getStudentActiveGroup(u, effClassId);
            memberArr = this.authManager.getGroupMembersForWorkspace(effGroup?.id || this.state.activeGroupId || null);
          }
          const totalMembersCount = memberArr.length > 0 ? memberArr.length : 3;

          if (!s3.finalSubmittedMembers) s3.finalSubmittedMembers = {};
          s3.finalSubmittedMembers[user] = true;
          const currMemObj = memberArr.find(m => m && (m.id === user || m.studentCode === user || m.username === user || m.name === user));
          if (currMemObj) {
            if (currMemObj.id) s3.finalSubmittedMembers[currMemObj.id] = true;
            if (currMemObj.studentCode) s3.finalSubmittedMembers[currMemObj.studentCode] = true;
            if (currMemObj.username) s3.finalSubmittedMembers[currMemObj.username] = true;
            if (currMemObj.name) s3.finalSubmittedMembers[currMemObj.name] = true;
          }

          const finalSubmittedCount = memberArr.filter(m => m && (s3.finalSubmittedMembers[m.id] || s3.finalSubmittedMembers[m.studentCode] || s3.finalSubmittedMembers[m.username] || (m.name && s3.finalSubmittedMembers[m.name]))).length;
          const memberName = currMemObj ? currMemObj.name : user;
          const currentStage = this.state.currentStage || 'stage3';

          const submitMsg = {
            sender: user,
            senderName: memberName,
            text: `📢 [终稿提交确认]: 我 (${memberName}) 已确认提交论文终稿！（全组终稿提交确认进度: ${finalSubmittedCount}/${totalMembersCount} 人）`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            _timeMs: Date.now()
          };
          if (!this.state.chatLogs[currentStage]) this.state.chatLogs[currentStage] = [];
          this.state.chatLogs[currentStage].push(submitMsg);

          if (finalSubmittedCount >= totalMembersCount) {
            this.state.isFinalSubmitted = true;
            s3.isRevisionConfirmed = true;
            const currentUserObj = this.authManager ? this.authManager.getCurrentUser() : null;
            const activeTaskId = this.state.activeTaskId || null;
            const userGroupId = (currentUserObj && currentUserObj.groupId) ? currentUserObj.groupId : 'group_1';

            if (this.authManager && this.authManager.markAllTaskAnnouncementsRead) {
              this.authManager.markAllTaskAnnouncementsRead(activeTaskId, userGroupId);
            }

            const neutralFinalMsg = {
              sender: 'neutral',
              text: `🏆 【中间委员·答辩终审总结与祝贺】：热烈祝贺全组成员 (${totalMembersCount}/${totalMembersCount} 人) 已全部确认提交论文终稿！本组正文与答辩成果已正式全盘锁定归档呈递至教师端！请各位同学点击上方【📋 打开问卷填写界面】完成问卷！`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              _timeMs: Date.now() + 50
            };
            this.state.chatLogs[currentStage].push(neutralFinalMsg);

            this.syncStage3();
            this.syncChatLogs();
            if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
            this.renderStudentWorkspace();
            renderChat(this.state);

            alert(`🎉 恭喜！组内全员 (${totalMembersCount}/${totalMembersCount} 人) 已全部确认提交论文终稿！\n\n本组期末论文与答辩成果已正式归档提交至教师端！请每位同学填写课程体验评估问卷。`);
            setTimeout(() => {
              this.showQuestionnaireModal();
            }, 500);
          } else {
            this.syncStage3();
            this.syncChatLogs();
            if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
            this.renderStudentWorkspace();
            renderChat(this.state);

            alert(`✅ 您 (${memberName}) 已成功确认提交论文终稿！\n\n当前组内终稿提交确认进度：${finalSubmittedCount}/${totalMembersCount} 人已确认。\n⚠️ 必须全组所有成员均完成确认提交后，系统才会正式将终稿归档提交至教师端！请提醒组内其他同学尽快确认提交。`);
          }
        }
      };
      this.handlers = handlers;
      this.onConfirmStage2Draft = handlers.onConfirmStage2Draft;
      renderCanvas(this.state, handlers);
    } // end if (!isEditingStage2)

      renderChat(this.state);

      // 动态根据当前阶段更新右侧研讨区顶部的【当前阶段常驻智能体药丸】
      const pillsContainer = document.querySelector('.active-agent-pills');
      if (pillsContainer) {
        const curStage = this.state.currentStage;
        if (curStage === 'stage1') {
          pillsContainer.innerHTML = `<span class="agent-pill">🎪 拍卖师</span>`;
        } else if (curStage === 'stage2') {
          pillsContainer.innerHTML = `<span class="agent-pill">🤝 责任编辑</span><span class="agent-pill">📝 审稿编辑</span>`;
        } else if (curStage === 'stage3') {
          pillsContainer.innerHTML = `<span class="agent-pill">🟡 中间委员</span><span class="agent-pill">🟢 正方委员</span><span class="agent-pill">🔴 反方委员</span>`;
        }
      }
    }

    checkAgentTriggersOnContent(newContent) {
      if (!newContent || this.state.isFinalSubmitted) return;
      const currentStage = this.state.currentStage;
      if (currentStage !== 'stage2') return;

      if (!this.state.stage2) this.state.stage2 = {};
      const s2 = this.state.stage2;
      if (!s2.reviewMilestone) s2.reviewMilestone = 'none';

      const membersList = Object.values(this.state.members || {});
      const logs = this.state.chatLogs[currentStage] || [];
      const now = Date.now();
      const lastReviewingMsg = logs.slice().reverse().find(m => m.sender === 'reviewingEditor');
      const timeSinceLastReviewing = lastReviewingMsg ? (now - (lastReviewingMsg._timeMs || 0)) : 999999;

      // ⏱️ 计算阶段二物理时间与字数水位线（中任务 0~150 分钟 / 4300 字，大任务 >150 分钟 / 9000 字）
      const allTasks = (this.authManager) ? this.authManager.getTasks() : [];
      const curTask = allTasks.find(t => t.id === this.state.activeTaskId);
      const times = (this.state.stage1 && this.state.stage1.contract && this.state.stage1.contract.timeAllocations) ? this.state.stage1.contract.timeAllocations : {};
      const totalPlannedMin = (times.background || 25) + (times.literature || 30) + (times.questions || 25) + (times.method || 40) + (times.reflection || 20) + (times.references || 10);
      const taskDurMin = (curTask && curTask.duration) ? Number(curTask.duration) : totalPlannedMin;
      const isLargeTask = curTask && (curTask.scale === 'large' || curTask.type === 'large' || taskDurMin > 150 || (curTask.targetWordCount && Number(curTask.targetWordCount) >= 6000));
      const defaultWordTarget = isLargeTask ? 9000 : 4300;

      const targetWordCount = (curTask && curTask.targetWordCount) ? Number(curTask.targetWordCount) : defaultWordTarget;
      const rawDoc = newContent.replace(/<[^>]*>/g, '').trim();
      const wordProgress = targetWordCount > 0 ? (rawDoc.length / targetWordCount) : (rawDoc.length / 4300);

      const totalPlannedMs = totalPlannedMin * 60 * 1000;
      const stage2DurationMs = s2.startTime ? (now - s2.startTime) : 0;
      const timeProgress = totalPlannedMs > 0 ? (stage2DurationMs / totalPlannedMs) : 0;

      const s2ChatList = this.state.chatLogs?.stage2 || [];

      // ═══════════════════════════════════════════════════════════════
      // 🛡️ 第一次学术质检（目标字数的 30% / 35% 时间 · 破题把脉）
      // ═══════════════════════════════════════════════════════════════
      const isReview1Due = (wordProgress >= 0.30 || timeProgress >= 0.35 || rawDoc.length >= (targetWordCount * 0.3));
      const hasFirstReviewInLogs = s2ChatList.some(m => m.sender === 'reviewingEditor' && (m.text.includes('初审') || m.text.includes('破题把脉') || m.text.includes('Research Gap')));
      if (hasFirstReviewInLogs && (s2.reviewMilestone === 'none' || s2.reviewMilestone === 'first_review_in_progress')) {
        s2.reviewMilestone = 'first_review_done';
        this.syncStage2();
      }

      if (!hasFirstReviewInLogs && (s2.reviewMilestone === 'none' || s2.reviewMilestone === undefined) && isReview1Due && !this._isTriggeringFirstReview) {
        this._isTriggeringFirstReview = true;
        s2.reviewMilestone = 'first_review_in_progress';
        this.syncStage2();
        if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();

        const topic = (this.state.stage1 && this.state.stage1.mergedTitle) ? this.state.stage1.mergedTitle : '本组课题';
        const contentSnippet = rawDoc.slice(0, 1500);

        // 🌟 1. 立即挂载审稿编辑一审正在质检中动态状态框
        this.state.activeAgentAnalyzing = {
          icon: '📝',
          title: '【审稿编辑】正在进行初审破题把脉质检...',
          detail: '正在通读已起草的引言与文献综述正文切片，审查研究问题界定与学术规范...'
        };
        this.renderStudentWorkspace();

        setTimeout(async () => {
          try {
            const firstReviewPrompt = `【课题】：《${topic}》
  【当前正文草稿（写到哪审到哪）】：
  ${contentSnippet}

  请发表 120~150 字一审破题把脉学术质检意见（严格遵循【诊断问题 + 改进建议】双结构，严禁代码块，严禁出现“分工”字眼）：
  ①【立意与问题聚焦】
  - 诊断问题：审查引言与文献综述，指出 Research Gap 是否找准、研究问题是否明确；
  - 改进建议：给出具体的破题聚焦与微调对策；
  ②【学术语体与术语口径】
  - 诊断问题：指出草稿中口语化表述或术语不一致之处；
  - 改进建议：给出统一规范建议。
  （纯自然语言，120~150字）`;
            let firstReviewText = await callCozeAgentAPI('reviewingEditor', firstReviewPrompt, { stage: 'stage2', topic, actualDoc: contentSnippet });
            if (!firstReviewText || firstReviewText.trim().length === 0) {
              firstReviewText = `📝 【审稿编辑·一审破题把脉】：通读了全组目前起草的正文草稿，提出以下初审质检意见：\n①【立意与问题聚焦】\n· 诊断问题：文献综述梳理充分，但末尾未精准聚焦初中数学课例操作化的核心缺口（Research Gap）；\n· 改进建议：收拢综述结论，直接引出核心研究问题与假设。\n②【学术语体与术语口径】\n· 诊断问题：部分段落出现第一人称口语化表述，术语叫法略有出入；\n· 改进建议：统一全篇学术术语口径，采用规范学术第三人称。请全组参考后继续稳步撰写！`;
            }
            s2.firstReviewText = firstReviewText;
            s2.reviewMilestone = 'first_review_done';

            const firstReviewMsg = {
              sender: 'reviewingEditor',
              senderName: '学术质量 · 审稿编辑',
              text: firstReviewText.startsWith('📝') ? firstReviewText : `📝 【审稿编辑·一审破题把脉】：${firstReviewText}`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              _timeMs: Date.now()
            };
            if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
            this.state.chatLogs.stage2.push(firstReviewMsg);
            this.syncChatLogs();
            this.syncStage2();
            if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
          } finally {
            this.state.activeAgentAnalyzing = null; // 🌟 研判完毕，清除动态分析框
            this._isTriggeringFirstReview = false;
            renderChat(this.state);
            this.renderStudentWorkspace();
          }
        }, 500);
        return;
      }

      // ═══════════════════════════════════════════════════════════════
      // 🛡️ 第二次学术质检与半程会议（目标字数的 65%~70% / 60% 时间 · 深度研讨）
      // ═══════════════════════════════════════════════════════════════
      const isMeetingDue = (wordProgress >= 0.65 || timeProgress >= 0.60 || rawDoc.length >= (targetWordCount * 0.65));
      const hasMeetingCalledInLogs = s2ChatList.some(m => m.sender === 'managingEditor' && (m.text.includes('半程会议号召') || m.text.includes('半程研讨号召')));
      if (hasMeetingCalledInLogs && s2.reviewMilestone !== 'meeting_called' && s2.reviewMilestone !== 'action_plan_generated') {
        s2.reviewMilestone = 'meeting_called';
        this.syncStage2();
      }

      if (!hasMeetingCalledInLogs && isMeetingDue && !this._isTriggeringMeetingCall) {
        this._isTriggeringMeetingCall = true;
        s2.reviewMilestone = 'meeting_called';
        s2.meetingStep = 'discussing_divergence';
        s2.meetingCalledTime = Date.now();

        const meetingCallMsg = {
          sender: 'managingEditor',
          senderName: '协同调度 · 责任编辑',
          text: `🤝 【责任编辑·半程研讨号召】：关注到全组论文撰写已推进过半！请大家先暂停打字，花 1~2 分钟通读当前全篇草稿。重点审查：各章节逻辑是否连贯？前后构思是否存在脱节或分歧？\n👉 请大家在讨论区充分交流修改思路；商定差不多后，点击聊天框上方【💡 讨论差不多了？让责任编辑总结】按钮，我们将为大家提炼共识并下发《半程修正清单》！`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          _timeMs: now
        };
        if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
        this.state.chatLogs.stage2.push(meetingCallMsg);
        this.syncChatLogs();
        this.syncStage2();
        if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
        renderChat(this.state);
        this._isTriggeringMeetingCall = false;
        return;
      }

      // ═══════════════════════════════════════════════════════════════
      // 🛡️ 第三次质检（90% 字数 / 85% 时间 / 确认初稿 · 审稿编辑终审定稿）
      // ═══════════════════════════════════════════════════════════════
      const isFinalReviewDue = (wordProgress >= 0.90 || timeProgress >= 0.85 || s2.isDraftConfirmed || rawDoc.length >= (targetWordCount * 0.9));
      const hasFinalReviewInLogs = s2ChatList.some(m => m.sender === 'reviewingEditor' && (m.text.includes('终稿行文扫描') || m.text.includes('终审定稿总评')));
      if (hasFinalReviewInLogs && (s2.reviewMilestone === 'second_review_done' || s2.reviewMilestone === 'meeting_called')) {
        s2.reviewMilestone = 'final_review_done';
        this.syncStage2();
      }

      if (!hasFinalReviewInLogs && (s2.reviewMilestone === 'second_review_done' || s2.reviewMilestone === 'meeting_called' || s2.meetingStep === 'completed') && isFinalReviewDue && timeSinceLastReviewing > 30000 && !this._isTriggeringFinalReview) {
        this._isTriggeringFinalReview = true;
        s2.reviewMilestone = 'final_review_done';

        const topic = (this.state.stage1 && this.state.stage1.mergedTitle) ? this.state.stage1.mergedTitle : '本组课题';
        const contentSnippet = rawDoc.slice(0, 2500);

        // 🌟 挂载审稿编辑三审正在分析动态状态框
        this.state.activeAgentAnalyzing = {
          icon: '📝',
          title: '【审稿编辑】正在进行终审定稿与学术规范扫描...',
          detail: '正在对终稿全文进行学术语体、论述逻辑与文献规范终审质检...'
        };
        this.renderStudentWorkspace();

        setTimeout(async () => {
          try {
            const finalPrompt = `【课题】：《${topic}》
  【终稿草稿全文节选】：
  ${contentSnippet}

  请发表 120~150 字终审定稿学术总评与行文扫描意见（包含【诊断问题 + 改进建议】双结构，严禁代码块，严禁出现“分工”字眼）：
  ①【学术语体与逻辑完整性】
  - 诊断问题：指出全篇逻辑闭环与语体严谨度；
  - 改进建议：给出定稿润色建议；
  ②【规范与答辩准备】
  - 诊断问题：核对参考文献著录与图表命名规范；
  - 改进建议：提示完成初稿确认，准备答辩冲刺。`;
            let finalReviewText = await callCozeAgentAPI('reviewingEditor', finalPrompt, { stage: 'stage2', topic, actualDoc: contentSnippet });
            if (!finalReviewText || finalReviewText.trim().length === 0) {
              finalReviewText = `📝 【审稿编辑·终审定稿总评与行文扫描】：看到全组已进入最后成文冲刺阶段，整体框架完整！终审质检意见如下：\n①【学术语体与逻辑】\n· 诊断问题：全篇论证逻辑基本闭环，局部段落仍有少量口语化过渡词；\n· 改进建议：进行最后一次通读润色，确保学术第三人称严谨性。\n②【规范与答辩准备】\n· 诊断问题：需仔细核对参考文献著录格式与图表编号对应；\n· 改进建议：请全组成员完成最终核对后，在上方逐一完成【初稿确认】，准备迎接阶段三学术答辩！`;
            }

            const refReviewMsg = {
              sender: 'reviewingEditor',
              senderName: '学术质量 · 审稿编辑',
              text: finalReviewText.startsWith('📝') ? finalReviewText : `📝 【审稿编辑·终审定稿总评与行文扫描】：${finalReviewText}`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              _timeMs: Date.now()
            };
            if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
            this.state.chatLogs.stage2.push(refReviewMsg);
            this.syncChatLogs();
            this.syncStage2();
            if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
          } finally {
            this.state.activeAgentAnalyzing = null;
            this._isTriggeringFinalReview = false;
            renderChat(this.state);
            this.renderStudentWorkspace();
          }
        }, 500);
        return;
      }

      // 3. 🤝 责任编辑 Agent: 字数贡献比严重偏斜提醒 (SSRL 共享调节)
      const plainLen = newContent.replace(/<[^>]*>/g, '').trim().length;
      const lastWarnTime = this.state.lastSSRLWarnTimeMs || 0;
      const lastWarnLen = this.state.lastSSRLWarnLen || 0;
      const ssrlCooldownMs = isLargeTask ? 600000 : 480000;
      const minNewProgressLen = isLargeTask ? 200 : 100;
      const minContribThreshold = isLargeTask ? 800 : 500;
      const cooldownPassed = (now - lastWarnTime) >= ssrlCooldownMs;
      const hasMeaningfulProgress = (plainLen - lastWarnLen) >= minNewProgressLen;

      // 🛡️ 严格聊天流去重：若最近 8 分钟内已有协同关怀记录，绝对禁止重复下发！
      const recentSsrlMsg = [...logs].reverse().find(m => m && m.sender === 'managingEditor' && m.text?.includes('协同关怀'));
      const isRecentSsrlSent = recentSsrlMsg && (now - Number(recentSsrlMsg._timeMs || 0) < ssrlCooldownMs);

      if (!isRecentSsrlSent && plainLen >= minContribThreshold && membersList.length >= 2 && cooldownPassed && (lastWarnTime === 0 || hasMeaningfulProgress)) {
        const contribs = this.state.stage2.memberContributions || {};
        const getVal = (m) => {
          if (!m) return 0;
          const keys = [m.studentCode, m.id, m.username, m.name].filter(Boolean);
          let maxVal = 0;
          for (const k of keys) {
            if (contribs[k] !== undefined && Number(contribs[k]) > maxVal) {
              maxVal = Number(contribs[k]);
            }
          }
          return maxVal;
        };

        let totalContrib = 0;
        membersList.forEach(m => { totalContrib += getVal(m); });

        if (totalContrib >= minContribThreshold || plainLen >= minContribThreshold) {
          // 严格原定规则：仅当组内出现失衡（某位成员占比 >= 55% 且有成员 <= 15%）时才介入
          const pcts = membersList.map(m => {
            const val = getVal(m);
            return (totalContrib > 0) ? Math.round((val / totalContrib) * 100) : 0;
          });
          const hasMaxSkew = Math.max(...pcts) >= 55;
          const hasZeroMember = Math.min(...pcts) <= 15;

          if (hasMaxSkew && hasZeroMember) {
            this.state.lastSSRLWarnTimeMs = now;
            this.state.lastSSRLWarnLen = plainLen;
            const ssrlWarningMsg = {
              sender: 'managingEditor',
              senderName: '协同调度 · 责任编辑',
              text: `🤝 【责任编辑·协同关怀】：关注到当前正文撰写推进中，各成员的投入占比出现了一定程度的分化。建议全组同学在讨论区适度协调分工，鼓励尚未充分动笔的同学认领后续章节，共同推进高质量学术成稿哦~`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              _timeMs: now
            };
            logs.push(ssrlWarningMsg);
            this.syncChatLogs();
            if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
            renderChat(this.state);
          }
        }
      }
    }

    showMeetingModal() {
      const currUser = this.authManager ? this.authManager.getCurrentUser() : null;
      const userKey = currUser ? (currUser.name || currUser.studentCode || currUser.id) : this.state.currentUser;
      let actualGroupMembers = [];
      if (this.authManager) {
        const effClassId = this.state.activeStudentClassId || currUser?.classId || null;
        const effGroup = this.authManager.getStudentActiveGroup(currUser, effClassId);
        actualGroupMembers = this.authManager.getGroupMembersForWorkspace(effGroup?.id || this.state.activeGroupId || this.state.activeGroupId || null);
      }
      const membersList = actualGroupMembers.length > 0 ? actualGroupMembers : Object.values(this.state.members || {});
      const subs = this.state.stage2?.meetingSubmissions || {};
      const subCount = Object.keys(subs).length;
      const totalCount = membersList.length || 2;

      const existingSub = subs[userKey] || (currUser?.name && subs[currUser.name]) || (currUser?.studentCode && subs[currUser.studentCode]) || (currUser?.id && subs[currUser.id]) || (this.state.currentUser && subs[this.state.currentUser]);
      const isCurrentUserSubmitted = !!existingSub;

      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="teacher-modal-card" style="width:660px; max-height:85vh; display:flex; flex-direction:column;">
          <div class="teacher-modal-header ann-theme">
            <div class="modal-header-title"><span class="modal-icon">📢</span><div><h3>学术编辑部 ·【半程全篇综合学术审计会议】</h3><p>全篇互阅 · 构思对齐 · 前后贯通 · 文风统一 · 攻克瓶颈</p></div></div>
            <button class="modal-close-btn" id="btn-close-meeting">✕</button>
          </div>
          <div class="teacher-modal-body" style="overflow-y:auto; padding:16px 20px; display:flex; flex-direction:column; gap:12px;">
            <!-- 全组成员打卡状态矩阵胶囊 -->
            <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:8px 14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
              <span style="font-size:12px; font-weight:800; color:#1e40af;">👥 全组打卡进度 (${subCount}/${totalCount}人):</span>
              <div style="display:flex; gap:6px; flex-wrap:wrap;">
                ${membersList.map(m => {
                  const uid = String(m.id || m.studentCode || m.userId || '').trim();
                  const isSub = !!(subs[uid] || subs[m.name] || subs[m.studentCode] || subs[m.id]);
                  return `<span style="font-size:11px; padding:2px 8px; border-radius:10px; font-weight:700; background:${isSub ? '#ecfdf5' : '#ffffff'}; color:${isSub ? '#059669' : '#64748b'}; border:1px solid ${isSub ? '#a7f3d0' : '#cbd5e1'};">
                    ${isSub ? '✅' : '⏳'} ${escapeHtml(m.name)}: ${isSub ? '已打卡' : '待打卡'}
                  </span>`;
                }).join('')}
              </div>
            </div>

            <!-- 1. 全篇综合自查审计 -->
            <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:10px; padding:14px 16px; display:flex; flex-direction:column; gap:12px;">
              <div style="font-size:13px; font-weight:800; color:#1e40af;">📋 一、全篇跨作者交叉审视自查（请跳出单一分工，通读全篇后打卡）</div>

              <!-- Q1: 个人构思契合度 (3档) -->
              <div style="background:#ffffff; padding:10px 14px; border-radius:8px; border:1px solid #e2e8f0; display:flex; flex-direction:column; gap:6px;">
                <label style="font-size:12.5px; color:#1e293b; font-weight:700;">🎯 1. 【个人构思契合度】目前全组写出来的方案，和你自己最初预想的构思是否一致？</label>
                <select id="meeting-ideation-select" class="teacher-input" style="width:100%; padding:6px 10px; font-size:12px; border-radius:6px; border:1px solid #cbd5e1; background:#ffffff;">
                  <option value="完全符合最初构思">✅ 完全符合最初构思（目前的推进方向和我的设想完全契合）</option>
                  <option value="局部偏离最初构思">🔄 局部偏离最初构思（部分章节的切入角度或深度和我最初想的有些不一样）</option>
                  <option value="明显偏离最初构思">⚠️ 明显偏离最初构思（整体方案与我最初的构想差异很大，需全组重新对齐）</option>
                </select>
                <div id="meeting-ideation-sections-box" style="background:#fffbeb; padding:8px 12px; border-radius:6px; border:1px solid #fef3c7; display:none; flex-direction:column; gap:4px; margin-top:4px;">
                  <label style="font-size:11.5px; color:#92400e; font-weight:700;">📌 针对第 1 题：您觉得具体是哪些章节偏离了您最初的设想？(可多选)</label>
                  <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:2px;">
                    <label style="font-size:11.5px; color:#451a03; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="ideation-sec" value="一、背景与意义"> 【一、背景意义】</label>
                    <label style="font-size:11.5px; color:#451a03; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="ideation-sec" value="二、文献综述"> 【二、文献综述】</label>
                    <label style="font-size:11.5px; color:#451a03; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="ideation-sec" value="三、研究问题与假设"> 【三、问题假设】</label>
                    <label style="font-size:11.5px; color:#451a03; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="ideation-sec" value="四、研究设计与方法"> 【四、设计方法】</label>
                    <label style="font-size:11.5px; color:#451a03; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="ideation-sec" value="五、不足与反思"> 【五、不足反思】</label>
                  </div>
                </div>
              </div>

              <!-- Q2: 全篇前后连贯度 (3档) -->
              <div style="background:#ffffff; padding:10px 14px; border-radius:8px; border:1px solid #e2e8f0; display:flex; flex-direction:column; gap:6px;">
                <label style="font-size:12.5px; color:#1e293b; font-weight:700;">🔗 2. 【全篇前后连贯度】目前各章节写出来的内容，前后是否衔接一致？</label>
                <select id="meeting-transition-select" class="teacher-input" style="width:100%; padding:6px 10px; font-size:12px; border-radius:6px; border:1px solid #cbd5e1; background:#ffffff;">
                  <option value="前后衔接非常自然">✅ 前后衔接非常自然（各章节环环相扣，逻辑自然连贯）</option>
                  <option value="存在局部脱节衔接不顺">🔄 存在局部脱节衔接不顺（部分章节之间过渡生硬，前后内容未能完全呼应）</option>
                  <option value="前后多处严重脱节矛盾">⚠️ 前后多处严重脱节矛盾（多处章节脱节，前后论述自相矛盾）</option>
                </select>
                <div id="meeting-transition-sections-box" style="background:#eff6ff; padding:8px 12px; border-radius:6px; border:1px solid #dbeafe; display:none; flex-direction:column; gap:4px; margin-top:4px;">
                  <label style="font-size:11.5px; color:#1e40af; font-weight:700;">🔗 针对第 2 题：具体是哪几处之间衔接脱节？(可多选多处)</label>
                  <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:2px;">
                    <label style="font-size:11.5px; color:#1e3a8a; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="trans-div-sec" value="背景到综述 (第一至二章)"> 【第一至二章 (背景➔综述)】</label>
                    <label style="font-size:11.5px; color:#1e3a8a; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="trans-div-sec" value="综述到假设 (第二至三章)"> 【第二至三章 (综述➔假设)】</label>
                    <label style="font-size:11.5px; color:#1e3a8a; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="trans-div-sec" value="假设到方法 (第三至四章)"> 【第三至四章 (假设➔方法)】</label>
                    <label style="font-size:11.5px; color:#1e3a8a; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="trans-div-sec" value="方法到反思 (第四至五章)"> 【第四至五章 (方法➔反思)】</label>
                  </div>
                </div>
              </div>

              <!-- Q3: 文风与专业术语 (3档) -->
              <div style="background:#ffffff; padding:10px 14px; border-radius:8px; border:1px solid #e2e8f0; display:flex; flex-direction:column; gap:6px;">
                <label style="font-size:12.5px; color:#1e293b; font-weight:700;">🎨 3. 【文风与专业术语】全篇语言文风与专业词汇是否统一？</label>
                <select id="meeting-style-select" class="teacher-input" style="width:100%; padding:6px 10px; font-size:12px; border-radius:6px; border:1px solid #cbd5e1; background:#ffffff;">
                  <option value="文风严谨术语统一">✅ 文风严谨术语统一（全篇均采用规范客观的学术第三人称，术语命名一致）</option>
                  <option value="局部存在文风/术语割裂">🔄 局部存在文风/术语割裂（部分章节偏口语化，或同一术语前后叫法不同）</option>
                  <option value="文风口语化严重/术语混乱">⚠️ 文风口语化严重/术语混乱（多处章节使用“我们觉得”等第一人称口语，术语冲突多）</option>
                </select>
                <div id="meeting-style-sections-box" style="background:#f5f3ff; padding:8px 12px; border-radius:6px; border:1px solid #ddd6fe; display:none; flex-direction:column; gap:4px; margin-top:4px;">
                  <label style="font-size:11.5px; color:#6d28d9; font-weight:700;">🎨 针对第 3 题：您觉得哪些章节需要重点润色文风或统一术语？(可多选)</label>
                  <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:2px;">
                    <label style="font-size:11.5px; color:#4c1d95; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="style-div-sec" value="一、背景与意义"> 【一、背景意义】</label>
                    <label style="font-size:11.5px; color:#4c1d95; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="style-div-sec" value="二、文献综述"> 【二、文献综述】</label>
                    <label style="font-size:11.5px; color:#4c1d95; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="style-div-sec" value="三、研究问题与假设"> 【三、问题假设】</label>
                    <label style="font-size:11.5px; color:#4c1d95; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="style-div-sec" value="四、研究设计与方法"> 【四、设计方法】</label>
                    <label style="font-size:11.5px; color:#4c1d95; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="style-div-sec" value="五、不足与反思"> 【五、不足反思】</label>
                  </div>
                </div>
              </div>
            </div>

            <!-- Q4: 核心通俗瓶颈自查 -->
            <div style="background:#ffffff; border:1px solid #cbd5e1; border-radius:10px; padding:12px 16px; display:flex; flex-direction:column; gap:6px;">
              <label style="font-size:12.5px; font-weight:700; color:#0f172a;">💡 4. 【核心瓶颈自查】当前全篇最让大家卡壳、最难写的是什么？(单选)</label>
              <select id="meeting-bottleneck-academic" class="teacher-input" style="width:100%; padding:6px 10px; font-size:12px; border-radius:6px; border:1px solid #cbd5e1; background:#ffffff;">
                <option value="方法与问题不搭：不知道该怎么设计方法/量表来回答前面的研究问题">方法与问题不搭：不知道该怎么设计方法/量表来回答前面的研究问题</option>
                <option value="理论与文献不足：找不到足够的文献依据，理论支撑单薄">理论与文献不足：找不到足够的文献依据，理论支撑单薄</option>
                <option value="方案步骤不清晰：不知道具体的研究对象、实施过程该怎么写具体">方案步骤不清晰：不知道具体的研究对象、实施过程该怎么写具体</option>
                <option value="局限与反思卡壳：不知道该怎么客观分析方案的不足和潜在问题">局限与反思卡壳：不知道该怎么客观分析方案的不足和潜在问题</option>
              </select>
            </div>

            <!-- Q5: 整体质量打星 -->
            <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:12px 16px; display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:12.5px; font-weight:700; color:#0f172a;">🌟 5. 【整体质量自评】全篇整体学术质量与严谨度打分：</span>
              <div class="rating-stars" id="star-rating-logic" style="font-size:22px; cursor:pointer; user-select:none;">
                <span class="star" data-val="1" style="color:#f59e0b;">★</span>
                <span class="star" data-val="2" style="color:#f59e0b;">★</span>
                <span class="star" data-val="3" style="color:#f59e0b;">★</span>
                <span class="star" data-val="4" style="color:#f59e0b;">★</span>
                <span class="star" data-val="5" style="color:#475569;">★</span>
              </div>
            </div>

            <!-- Q6: 一句话修改聚焦 -->
            <div class="teacher-form-group" style="margin:0;">
              <label style="font-size:12.5px; font-weight:700; color:#0f172a;">📝 6. 【一句话修改聚焦】写下一处你认为全组目前最急需合力修改的具体问题：</label>
              <input id="meeting-input-text" class="teacher-input" style="width:100%; padding:6px 10px; font-size:12px; border-radius:6px; border:1px solid #cbd5e1; box-sizing:border-box;" placeholder="例如：在第4章方法中补齐针对第3章假设的测量维度，并统一第1章口语化表述...">
            </div>
          </div>
          <div class="teacher-modal-footer" style="padding:12px 20px; border-top:1px solid #e2e8f0; display:flex; justify-content:flex-end; gap:10px;">
            <button class="modal-btn cancel" id="btn-cancel-meeting">关闭</button>
            <button class="modal-btn submit ann-theme" id="btn-submit-meeting" ${isCurrentUserSubmitted ? 'disabled style="background:#ecfdf5; border:1px solid #a7f3d0; color:#059669; font-weight:800; cursor:default; box-shadow:none;"' : ''}>
              ${isCurrentUserSubmitted ? '✅ 您已完成打卡 (已提交)' : '🚀 提交打卡并生成【半程编辑修正清单】'}
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      // 🛡️ 若已提交过，回填历史选择数据供查阅
      if (existingSub) {
        if (existingSub.ideationConsistency) modal.querySelector('#meeting-ideation-select').value = existingSub.ideationConsistency;
        if (existingSub.transitionState) modal.querySelector('#meeting-transition-select').value = existingSub.transitionState;
        if (existingSub.styleState) modal.querySelector('#meeting-style-select').value = existingSub.styleState;
        if (existingSub.bAcademic) modal.querySelector('#meeting-bottleneck-academic').value = existingSub.bAcademic;
        if (existingSub.userText) modal.querySelector('#meeting-input-text').value = existingSub.userText;
        if (Array.isArray(existingSub.ideationSections)) {
          modal.querySelectorAll('input[name="ideation-sec"]').forEach(cb => { cb.checked = existingSub.ideationSections.includes(cb.value); });
        }
        if (Array.isArray(existingSub.transSections)) {
          modal.querySelectorAll('input[name="trans-div-sec"]').forEach(cb => { cb.checked = existingSub.transSections.includes(cb.value); });
        }
        if (Array.isArray(existingSub.styleSections)) {
          modal.querySelectorAll('input[name="style-div-sec"]').forEach(cb => { cb.checked = existingSub.styleSections.includes(cb.value); });
        }
      }

      const closeModal = () => document.body.removeChild(modal);
      modal.querySelector('#btn-close-meeting').addEventListener('click', closeModal);
      modal.querySelector('#btn-cancel-meeting').addEventListener('click', closeModal);

      // 联动展开逻辑
      const ideationSel = modal.querySelector('#meeting-ideation-select');
      const ideationBox = modal.querySelector('#meeting-ideation-sections-box');
      ideationSel.addEventListener('change', () => {
        ideationBox.style.display = ideationSel.value.includes('偏离') ? 'flex' : 'none';
      });

      const transSel = modal.querySelector('#meeting-transition-select');
      const transBox = modal.querySelector('#meeting-transition-sections-box');
      transSel.addEventListener('change', () => {
        transBox.style.display = transSel.value.includes('脱节') ? 'flex' : 'none';
      });

      const styleSel = modal.querySelector('#meeting-style-select');
      const styleBox = modal.querySelector('#meeting-style-sections-box');
      styleSel.addEventListener('change', () => {
        styleBox.style.display = (styleSel.value.includes('割裂') || styleSel.value.includes('混乱') || styleSel.value.includes('口语')) ? 'flex' : 'none';
      });

      let overallRating = 4;
      modal.querySelectorAll('#star-rating-logic .star').forEach(s => {
        s.addEventListener('click', (e) => {
          overallRating = Number(e.target.dataset.val);
          modal.querySelectorAll('#star-rating-logic .star').forEach(st => {
            const v = Number(st.dataset.val);
            st.style.color = v <= overallRating ? '#f59e0b' : '#475569';
          });
        });
      });

      modal.querySelector('#btn-submit-meeting').addEventListener('click', async () => {
        const ideationConsistency = modal.querySelector('#meeting-ideation-select')?.value || '完全符合最初构思';
        const transitionState = modal.querySelector('#meeting-transition-select')?.value || '前后衔接非常自然';
        const styleState = modal.querySelector('#meeting-style-select')?.value || '文风严谨术语统一';
        const bAcademic = modal.querySelector('#meeting-bottleneck-academic')?.value || '';
        const userText = modal.querySelector('#meeting-input-text')?.value.trim() || '';
        const ideationSections = Array.from(modal.querySelectorAll('input[name="ideation-sec"]:checked')).map(cb => cb.value);
        const transSections = Array.from(modal.querySelectorAll('input[name="trans-div-sec"]:checked')).map(cb => cb.value);
        const styleSections = Array.from(modal.querySelectorAll('input[name="style-div-sec"]:checked')).map(cb => cb.value);
        const currUser = this.authManager ? this.authManager.getCurrentUser() : null;
        const userKey = currUser ? (currUser.name || currUser.studentCode || currUser.id) : this.state.currentUser;
        const memberName = currUser ? currUser.name : (this.state.members[userKey]?.name || userKey);

        // 🛡️ 真实组员人数：从 authManager 严格获取当前工作区绑定的组内真实学生列表
        let actualGroupMembers = [];
        if (this.authManager) {
          const effClassId = this.state.activeStudentClassId || currUser?.classId || null;
          const effGroup = this.authManager.getStudentActiveGroup(currUser, effClassId);
          actualGroupMembers = this.authManager.getGroupMembersForWorkspace(effGroup?.id || this.state.activeGroupId || this.state.activeGroupId || null);
        }
        const totalMembersCount = Math.max(actualGroupMembers.length, Object.keys(this.state.members || {}).length, 2);

        if (!this.state.stage2.meetingSubmissions) this.state.stage2.meetingSubmissions = {};
        this.state.stage2.meetingSubmissions[userKey] = {
          user: userKey,
          name: memberName,
          ideationConsistency,
          transitionState,
          styleState,
          ideationSections,
          transSections,
          styleSections,
          bAcademic,
          overallRating,
          userText,
          submittedAt: Date.now()
        };

        const submissions = this.state.stage2.meetingSubmissions;
        const submittedCount = Object.keys(submissions).length;

        // 仅当全组所有成员全部打卡完毕时，才解锁并生成【半程编辑修正清单】
        if (submittedCount < totalMembersCount) {
          this.syncStage2();
          if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
          closeModal();
          this.renderStudentWorkspace();
          alert(`✅ 你 (${memberName}) 已成功提交半程自查与互阅打卡！\n\n目前组内已打卡：${submittedCount}/${totalMembersCount} 人。\n需组内所有 ${totalMembersCount} 名成员全部完成打卡后，将自动为全组汇总生成【半程修正清单】！`);
          return;
        }

        // 🛡️ 严格单次幂等门禁：若全组已播报过分歧，绝对不再重复调起
        if (this.state.stage2.hasBroadcastedMeetingDivergence) {
          this.syncStage2();
          if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
          this.renderStudentWorkspace();
          return;
        }
        this.state.stage2.hasBroadcastedMeetingDivergence = true;

        // ── 全员打卡完毕：汇聚全组数据并由责任编辑播报分歧（匿名宏观，不点具体人名） ──
        const topic = (this.state.stage1 && this.state.stage1.mergedTitle) ? this.state.stage1.mergedTitle : '本组课题';
        const allSubs = Object.values(submissions);

        const allIdeationSecs = Array.from(new Set(allSubs.flatMap(s => s.ideationSections || [])));
        const allTransSecs = Array.from(new Set(allSubs.flatMap(s => s.transSections || [])));
        const allStyleSecs = Array.from(new Set(allSubs.flatMap(s => s.styleSections || [])));

        const hasIdeationDev = allSubs.some(s => (s.ideationConsistency || '').includes('偏离'));
        const hasTransDev = allSubs.some(s => (s.transitionState || '').includes('脱节'));
        const hasStyleDev = allSubs.some(s => (s.styleState || '').includes('割裂') || (s.styleState || '').includes('混乱') || (s.styleState || '').includes('口语'));

        const primaryAcademicB = allSubs[0].bAcademic || '方法与问题对齐与实施设计';
        const questionsList = allSubs.filter(s => s.userText).map(s => `“${s.userText}”`).join('；') || '暂无补充提问';

        let transFocusText = allTransSecs.length > 0 ? allTransSecs.map(s => `【${s}】`).join('、') : '【假设 ↔ 方法】';
        let ideationFocusText = allIdeationSecs.length > 0 ? allIdeationSecs.map(s => `【${s}】`).join('、') : '部分核心章节';
        let styleFocusText = allStyleSecs.length > 0 ? allStyleSecs.map(s => `【${s}】`).join('、') : '【一、背景与意义】与【三、研究问题与假设】';

        this.syncStage2();
        if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
        this.renderStudentWorkspace();

        alert(`✅ 你 (${memberName}) 已成功提交半程自查与互阅打卡！\n\n目前组内已打卡：${submittedCount}/${totalMembersCount} 人。\n全组成员已集齐！责任编辑正在右侧研讨区梳理全组自查认知分歧，请稍候...`);

        // 2. 异步调用扣子【责任编辑】Coze API: 挂载聊天区思考气泡
        this.state.activeAgentAnalyzing = {
          icon: '🤝',
          title: '【责任编辑】正在分析全组自查打卡与一致性分歧...',
          detail: '正在深度整合全组自查反馈、偏离脱节章节与瓶颈诉求，梳理研讨对齐焦点...'
        };
        renderChat(this.state);

        const avgOverallRating = (allSubs.reduce((sum, s) => sum + (s.overallRating || 5), 0) / (allSubs.length || 1)).toFixed(1);
        const managingPrompt = `【全员自查打卡汇总数据】：
  - 构思偏离章节：${hasIdeationDev ? ideationFocusText : '无'}
  - 前后脱节章节：${hasTransDev ? transFocusText : '无'}
  - 口语化/文风章节：${hasStyleDev ? styleFocusText : '无'}
  - 核心瓶颈：${primaryAcademicB}
  - 质量自评均分：${avgOverallRating} 星

  请依据责任编辑自查研判分流规则（A1/A2/B/C分支），发表 120~150 字自查研判与对齐引导（纯自然语言，严禁学术结论，严禁点名指责；有分歧末尾提示点击【💡 讨论差不多了？让责任编辑总结】，无分歧直接交棒@审稿编辑）。`;

        let managingText = '';
        try {
          managingText = await callCozeAgentAPI('managingEditor', managingPrompt, { stage: 'stage2', topic, bottleneck: primaryAcademicB });
        } catch (e) {
          console.warn('managingEditor divergence analysis error:', e);
        } finally {
          this.state.activeAgentAnalyzing = null;
          renderChat(this.state);
        }
        if (!managingText || managingText.trim().length === 0) {
          managingText = `🤝 【责任编辑·自查研判与对齐引导】：全员自查打卡已完成！汇总全组反馈，提炼出核心焦点：
    1. 🎯 构思与脱节焦点：${hasIdeationDev ? `部分成员反馈 ${ideationFocusText} 偏离了最初设想；` : ''}${hasTransDev ? `多数成员明确指出了前后脱节（重点涉及 ${transFocusText}）；` : '全篇前后衔接顺畅；'}
    2. 🎨 文风与术语规范：${hasStyleDev ? `组内指出 ${styleFocusText} 存在口语化表述与术语混用；` : '全篇文风严谨规范，'}整体质量自评给出了 ${avgOverallRating} 星的高分！
    3. 💡 核心瓶颈：全组聚焦在『${primaryAcademicB}』。
  💡 请小组成员先在讨论区围绕上述脱节章节商量对齐修改思路。商量差不多后，请点击【💡 讨论差不多了？让责任编辑总结】按钮！`;
        }

        const managingMsg = {
          sender: 'managingEditor',
          text: managingText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          _timeMs: Date.now(),
          stage: 'stage2'
        };
        if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
        this.state.chatLogs.stage2.push(managingMsg);
        this.syncChatLogs();
        renderChat(this.state);

        // 3. 平台接管调控：设置【等待组内商讨对齐】状态 (写入 stage2.pendingReviewing 全端持久化)
        this.state.stage2.pendingReviewing = {
          topic,
          bAcademic: primaryAcademicB,
          userText: questionsList,
          transFocus: transFocusText,
          styleFocus: styleFocusText,
          timeSubmitted: Date.now(),
          studentMsgCount: 0
        };
        this.state.stage2PendingReviewing = this.state.stage2.pendingReviewing;
        this.syncStage2();
        if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
      });
    }

    async triggerReviewingEditorAfterDiscussion(customManagingSummary = '') {
      if (this._isTriggeringSecondReview) return;
      const ctx = this.state.stage2?.pendingReviewing || this.state.stage2PendingReviewing;
      if (!ctx) return;
      this._isTriggeringSecondReview = true;
      if (this.state.stage2) this.state.stage2.pendingReviewing = null;
      this.state.stage2PendingReviewing = null;
      this.syncStage2();

      // 1. 责任编辑出场做【一致性研讨小结】并交棒 (支持大模型针对具体讨论内容的深度研判总结)
      const managingText = customManagingSummary || `🤝 【责任编辑·一致性研讨小结】：太好了，看到全组已经在讨论区对齐了修改主线！下面有请审稿编辑通读全文草稿，为大家进行深度学术质检，并下发【3 项半程修正清单】！`;
      const consensusMsg = {
        sender: 'managingEditor',
        text: managingText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        _timeMs: Date.now(),
        stage: 'stage2'
      };
      if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
      this.state.chatLogs.stage2.push(consensusMsg);
      this.syncChatLogs();
      if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
      renderChat(this.state);

      const fullDoc = (this.state.stage2 && this.state.stage2.unifiedContent) ? this.state.stage2.unifiedContent.replace(/<[^>]*>/g, '').trim() : '论文初稿方案';
      const priorFirstReview = this.state.stage2FirstReviewText || (this.state.chatLogs.stage2 || []).find(m => m.sender === 'reviewingEditor')?.text || '前期初审已肯定研究背景立意与文献归纳';

      const reviewingPrompt = `【全篇正文草稿】：
  ${fullDoc.slice(0, 2000)}

  【半程会议研讨与暴露的瓶颈】：
  - 核心卡壳瓶颈：『${ctx.bAcademic}』
  - 前后脱节焦点：${ctx.transFocus}
  - 口语化/文风章节：${ctx.styleFocus}

  请依据审稿编辑角色与审查红线（顺应已有框架、绝不推翻大改、方案形态绝不索要数据图表），发表 120~150 字【二审修正清单】（必须包含 3 项具体可执行要点，纯自然语言，末尾提示商定后点击下方【📝 讨论差不多了？让审稿编辑总结】）。`;

      let reviewingText = await callCozeAgentAPI('reviewingEditor', reviewingPrompt, { stage: 'stage2', topic: ctx.topic, bottleneck: ctx.bAcademic, actualDoc: fullDoc, priorReview: priorFirstReview });
      if (!reviewingText || reviewingText.trim().length === 0) {
        reviewingText = `📝 【审稿编辑·二审修正清单】：通读了大家的方案草稿，结合大家在半程会议中汇报的核心瓶颈与攻克点：
  ①【前后闭环】：第三章提出的核心假设，在第四章测量工具中缺少对应题目，请补齐对应的测量题目或实施指标，别让假设悬空；
  ②【润色文风】：通读 ${ctx.styleFocus}，消除“我们觉得”等口语，统一润色为规范客观的第三人称学术语体；
  ③【预判不足】：在第五章实事求是地反思方案在样本抽样与实施工具上的潜在局限。
  👉 3 项【修正清单】已在正文上方就位！请全组商定落实策略，讨论差不多后点击下方【📝 讨论差不多了？让审稿编辑总结】！`;
      }
      this.state.stage2SecondReviewText = reviewingText;
      this.state.stage2.reviewMilestone = 'checklist_issued';
      this.state.stage2PendingReviewing = null;
      if (this.state.stage2) this.state.stage2.pendingReviewing = null;

      // 🌟 动态生成包含三大高含金量支柱的【半程修正清单】(支持交互勾选)
      this.state.stage2.actionPlan = {
        isGenerated: true,
        completedMap: {},
        items: [
          `🎯【消除前后脱节与构思分歧】(重点关注: ${ctx.transFocus}): 完善第四章方法与测量工具，确保能有效检验前文提出的全部核心假设，消除“两张皮”脱节硬伤，使主线一贯到底！`,
          `✍️【统一语言文风与专业术语】(重点关注: ${ctx.styleFocus}): 通读全篇，消除口语化表达与第一人称叙述，润色为规范严谨的客观学术语体，统一全篇核心概念命名。`,
          `💡【攻克瓶颈与局限反思冲刺】: 按照自查瓶颈（${ctx.bAcademic}），细化实施设计，并在即将起草的第五章深入剖析方案潜在局限，把控节奏，准备初稿定稿！`
        ]
      };

      // 开启第 2 轮研讨监听（讨论具体怎么修）
      this.state.stage2PendingRevisionDiscussion = true;
      this.state.stage2ReviewingFinishedTime = Date.now();

      const reviewingMsg = {
        sender: 'reviewingEditor',
        text: reviewingText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        _timeMs: Date.now(),
        stage: 'stage2'
      };
      if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
      this.state.chatLogs.stage2.push(reviewingMsg);
      this.syncStage2();
      this.syncChatLogs();
      if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
      renderChat(this.state);
      this.renderStudentWorkspace();
      this._isTriggeringSecondReview = false;
    }

    /**
     * 🔄 强制刷新并即时解锁【半程修正清单】卡片 (从全量聊天记录智能提取 3 项清单)
     */
    forceRefreshActionPlan() {
      if (!this.state.stage2) this.state.stage2 = {};
      const s2 = this.state.stage2;
      const allChatLogs = [
        ...(this.state.chatLogs?.stage1 || []),
        ...(this.state.chatLogs?.stage2 || []),
        ...(this.state.chatLogs?.stage3 || [])
      ];
      // 严格仅匹配审稿编辑下发的【二审修正清单】，坚决排除修改决议与讨论总结
      const revMsg = allChatLogs.find(m => m && m.text && (m.text.includes('二审修正清单') || m.text.includes('半程编辑修正清单') || m.text.includes('半程修正清单')) && !m.text.includes('修改落实决议') && !m.text.includes('修改落实要点'));

      let parsedItems = [];
      if (revMsg && revMsg.text) {
        let bodyText = revMsg.text;
        const headerMatch = bodyText.match(/(?:二审修正清单|半程编辑修正清单|半程修正清单)[】:：\s]*/);
        if (headerMatch) {
          bodyText = bodyText.slice(headerMatch.index + headerMatch[0].length);
        }
        bodyText = bodyText.replace(/[👉\s]*请大家围绕.*$/s, '')
                           .replace(/[👉\s]*请全组围绕.*$/s, '')
                           .replace(/[👉\s]*讨论差不多.*$/s, '')
                           .replace(/[👉\s]*点击下方.*$/s, '')
                           .trim();

        const chunks = bodyText.split(/(?=[①②③]|\b[123]\.|(?=[一二三]是))/g).map(c => c.trim()).filter(Boolean);
        chunks.forEach(c => {
          let clean = c.replace(/^[①②③\d\.\s\(\)一二三是]+/, '').replace(/[；;。]\s*$/, '').trim();
          if (clean.length > 5) {
            parsedItems.push(clean);
          }
        });
      }
      if (parsedItems.length > 0) {
        s2.actionPlan = {
          isGenerated: true,
          completedMap: (s2.actionPlan && s2.actionPlan.completedMap) || {},
          items: parsedItems.slice(0, 3)
        };
        s2.meetingStep = 'discussing_checklist';
        this.syncStage2();
        if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
        this.renderStudentWorkspace();
      }
    }

    // handleLogout() 已在 L1648 定义（含 presence 清理与云端推送），此处不再重复
  }

  // Global Launch (Native ESM Support)
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', () => {
        window.app = new App();
      });
    } else {
      window.app = new App();
    }
  }

})();
