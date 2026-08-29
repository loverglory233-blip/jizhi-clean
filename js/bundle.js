/**
 * JIZHI (集智) Multi-Agent Collaborative Writing Platform
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

  const APP_VERSION = '20260829_v651';
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
    currentUser: 'A',
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
    activeClassId: 'class_101',
    activeMonitorGroupId: 'group_1',
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

  function downloadFileBlob(filename, textContent = null) {
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
      const isAgent = (sender.startsWith('agent_') || ['auctioneer', 'architect', 'analyst', 'editor', 'challenger', 'chair'].includes(sender));

      // 1. 智能体重复开场白去重：相同开场白如果重复，只保留最新 1 条
      if (isAgent) {
        if (txt.includes('【拍卖师开场】') || txt.includes('【架构师开场】') || txt.includes('【主笔人开场】') || txt.includes('【辩论主席开场】')) {
          const opKey = `${sender}_${txt}`;
          if (seenAgentOpenings.has(opKey)) {
            continue;
          }
          seenAgentOpenings.add(opKey);
        }
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
  function showGlobalBannerNotice(title, message, type = 'info') {
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

  /* ==========================================================================
     MODULE: agents.js
     ========================================================================== */
  /**
   * JIZHI (集智) Platform - Agent Service & Coze Client
   * Standard ES Module (ESM)
   */


  async function callCozeAgentAPI(botKey, userQuery, currentContext = {}) {
    const profile = AgentProfiles[botKey];
    const botId = profile && profile.cozeBotId ? profile.cozeBotId : '7673571806476828713';

    // 构建针对当前写作阶段的提示词上下文（正文草稿由后端 coze_prompt.php 统一从 actual_doc 拼入，前端不再重复切片，避免正文被嵌两次）
    let enrichedQuery = userQuery;
    if (currentContext.stage) {
      enrichedQuery = `【协作写作阶段: ${currentContext.stage === 'stage1' ? '阶段一 (选题与公约)' : currentContext.stage === 'stage2' ? '阶段二 (正文撰写)' : '阶段三 (答辩与质询)'}】\n【课题: ${currentContext.topic || '未定'}】\n【用户对话/审阅指令】: ${userQuery}`;
    }

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
        // 如果后端处于生成中，采用阶梯式敏捷轮询：前 10 次 300ms 极速响应，后续 600ms 平稳等待
        if (data && data.in_progress && data.chat_id && data.conversation_id) {
          const chatId = data.chat_id;
          const convId = data.conversation_id;
          const targetBotId = data.bot_id || botId;
          const maxRetries = 45; // 阶梯敏捷轮询：前 10 次 300ms 极速响应，其后 600ms 平稳等待，最长容忍 ~24 秒（给上课高峰并发排队留余量）
          for (let p = 0; p < maxRetries; p++) {
            const pollInterval = p < 10 ? 300 : 600;
            await new Promise(r => setTimeout(r, pollInterval));
            try {
              const pollRes = await fetch(`sync.php?action=coze_poll&chat_id=${encodeURIComponent(chatId)}&conversation_id=${encodeURIComponent(convId)}&bot_id=${encodeURIComponent(targetBotId)}&userId=${encodeURIComponent(sessionUserId)}&token=${encodeURIComponent(sessionToken)}&nocache=${Date.now()}`);
              if (pollRes.ok) {
                const pollData = await pollRes.json();
                if (pollData && pollData.completed) {
                  if (pollData.reply && pollData.reply.trim().length > 0) {
                    return pollData.reply.trim(); // 一旦生成完毕立刻秒回，绝不多等 1 毫秒！
                  }
                  break;
                }
              }
            } catch (err) {
              console.warn('[Coze Poll] 轮询请求异常:', err.message);
            }
          }
        }
      }
    } catch (e) {
      console.warn('Coze API fallback:', e);
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
            if (Array.isArray(data.users) && data.users.length > 0) {
              localStorage.setItem(STORAGE_KEY_USERS_DB, JSON.stringify(data.users));
            }

            // 2. 班级与小组：直接以云端权威数据库为准 (杜绝已删除班级/学生死灰复燃)
            if (Array.isArray(data.classes) && data.classes.length > 0) {
              localStorage.setItem(STORAGE_KEY_CLASSES, JSON.stringify(data.classes));
              this.sanitizeAndDeduplicateGroups();
            }
            if (Array.isArray(data.tasks) && data.tasks.length > 0) {
              localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(data.tasks));
            }
            if (Array.isArray(data.announcements)) {
              const localAnns = JSON.parse(localStorage.getItem(STORAGE_KEY_ANNOUNCEMENTS) || '[]');
              if (data.announcements.length === 0 && localAnns.length > 0) {
                // 🛡️ 云端返回空而本地有数据时，保留本地通知，杜绝误清空
              } else {
                const localMap = new Map();
                localAnns.forEach(a => { if (a && a.id) localMap.set(a.id, a); });

                const mergedAnns = data.announcements.map(remoteAnn => {
                  const localAnn = localMap.get(remoteAnn.id);
                  if (!localAnn) return remoteAnn;

                  // 🛡️ 智能合并已读状态与确认成员，绝不反向冲刷本地已读标记！
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

                // 🛡️ 确保本地最新创建的通知合并保留，绝不被较旧的云端列表冲刷丢弃
                const remoteAnnIds = new Set(data.announcements.map(a => a.id));
                localAnns.forEach(la => {
                  if (la && la.id && !remoteAnnIds.has(la.id)) {
                    mergedAnns.push(la);
                  }
                });

                localStorage.setItem(STORAGE_KEY_ANNOUNCEMENTS, JSON.stringify(mergedAnns));
              }
            }
            if (Array.isArray(data.referencePapers)) {
              const localPapers = JSON.parse(localStorage.getItem('jizhi_reference_papers_db') || '[]');
              if (data.referencePapers.length === 0 && localPapers.length > 0) {
                // 🛡️ 保留本地文献
              } else {
                const remotePaperIds = new Set(data.referencePapers.map(p => p.id));
                const mergedPapers = [...data.referencePapers];
                localPapers.forEach(lp => {
                  if (lp && lp.id && !remotePaperIds.has(lp.id)) {
                    mergedPapers.push(lp);
                  }
                });
                localStorage.setItem('jizhi_reference_papers_db', JSON.stringify(mergedPapers));
              }
            }
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
          classId: classId || 'class_101',
          className: cObj ? cObj.name : '《现代教育技术》2026春01班',
          taskId: taskId || 'task_default',
          taskTitle: tObj ? tObj.title : (taskId === 'task_default' ? '期末协作写作 (默认测试任务)' : '写作任务'),
          url: cleanUrl,
          createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        list.unshift(newSurvey);
      }
      localStorage.setItem('jizhi_surveys_list_db', JSON.stringify(list));
      this.pushGlobalMeta();
    }
    deleteSurvey(surveyId) {
      let list = this.getSurveysList();
      list = list.filter(s => s.id !== surveyId);
      localStorage.setItem('jizhi_surveys_list_db', JSON.stringify(list));
      this.pushGlobalMeta();
    }
    getSurveyUrl(classId, taskId) {
      const list = this.getSurveysList();
      if (!classId) return '';
      const exactMatch = list.find(s => s.classId === classId && s.taskId === taskId);
      if (exactMatch) return exactMatch.url;
      const classDefaultMatch = list.find(s => s.classId === classId && (s.taskId === 'task_default' || s.taskId === 'task_all'));
      return classDefaultMatch ? classDefaultMatch.url : '';
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
      const payload = {
        userId: teacherUserId,
        token: teacherToken,
        expectedVersion: this.globalMetaVersion || 1,
        users: this.getUsers(),
        classes: this.getClasses(),
        tasks: this.getTasks(),
        announcements: this.getAnnouncements(),
        referencePapers: this.getAllReferencePapers(),
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
      } catch (e) {
        announcements = DefaultAnnouncements;
      }
      return (Array.isArray(announcements) ? announcements : []).filter(a => !a.isSystemAction && !a.title?.includes('指导教师已重置') && !a.title?.includes('指导教师已锁定'));
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
          localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
          if (window.app && window.app.state) {
            window.app.state.studentViewMode = 'task_list';
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

      if (window.app && window.app.state) {
        window.app.state.studentViewMode = 'task_list';
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
        if (!existingUser.classIds) existingUser.classIds = [existingUser.classId || 'class_101'];
        if (classId && !existingUser.classIds.includes(classId)) existingUser.classIds.push(classId);
        if (classId) existingUser.classId = classId;

        const targetClass = classes.find(c => c.id === (classId || 'class_101')) || classes[0];
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
        classId: classId || 'class_101',
        classIds: classId ? [classId] : ['class_101'],
        groupId: null
      };
      users.push(targetUser);

      localStorage.setItem(STORAGE_KEY_USERS_DB, JSON.stringify(users));

      const targetClass = classes.find(c => c.id === (classId || 'class_101')) || classes[0];
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
      const targetClass = classes.find(c => c.id === (classId || 'class_101')) || classes[0];
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

    getStudentActiveGroup(user, classId = null) {
      if (!user) return { id: 'group_1', name: '第 1 协作小组' };
      const classes = this.getClasses();
      const uId = user.id;
      const uCode = user.studentCode;
      const uName = user.name;
      const uUsername = user.username;
      const safeUserKey = uCode || uId || uUsername || 'temp';

      // 1. 若指定了班级 ID，严格在该班级内检索小组，未分组绝不跨班级误串
      if (classId) {
        const targetClass = classes.find(c => c.id === classId);
        if (targetClass && Array.isArray(targetClass.groups)) {
          for (let i = 0; i < targetClass.groups.length; i++) {
            const g = targetClass.groups[i];
            const hasMember = (g.members || []).some(m => {
              if (!m) return false;
              if (typeof m === 'string') return m.trim().toLowerCase() === String(uId).trim().toLowerCase() || m.trim().toLowerCase() === String(uCode).trim().toLowerCase() || m.trim().toLowerCase() === String(uUsername).trim().toLowerCase() || m.trim() === String(uName).trim();
              if (typeof m === 'object') {
                const mId = m.id || m.userId;
                const mCode = m.studentCode;
                const mUser = m.username;
                const mName = m.name;
                return (mId && String(mId).trim().toLowerCase() === String(uId).trim().toLowerCase()) ||
                       (mCode && String(mCode).trim().toLowerCase() === String(uCode).trim().toLowerCase()) ||
                       (mUser && String(mUser).trim().toLowerCase() === String(uUsername).trim().toLowerCase()) ||
                       (mName && String(mName).trim() === String(uName).trim());
              }
              return false;
            });
            if (hasMember) return g;
          }
        }
        // 🛡️ 指定班级下若未分配小组，直接返回专属隔离态，严禁跨班级回退
        return { id: `group_unassigned_${safeUserKey}`, name: '未分组（待教师分配）' };
      }

      // 2. 未指定班级时的自适应检索
      const targetClass = classes.find(c => (Array.isArray(user.classIds) && user.classIds.includes(c.id)) || c.id === user.classId) || classes[0];

      if (targetClass && Array.isArray(targetClass.groups)) {
        for (let i = 0; i < targetClass.groups.length; i++) {
          const g = targetClass.groups[i];
          const hasMember = (g.members || []).some(m => {
            if (!m) return false;
            if (typeof m === 'string') return m.trim().toLowerCase() === String(uId).trim().toLowerCase() || m.trim().toLowerCase() === String(uCode).trim().toLowerCase() || m.trim().toLowerCase() === String(uUsername).trim().toLowerCase() || m.trim() === String(uName).trim();
            if (typeof m === 'object') {
              const mId = m.id || m.userId;
              const mCode = m.studentCode;
              const mUser = m.username;
              const mName = m.name;
              return (mId && String(mId).trim().toLowerCase() === String(uId).trim().toLowerCase()) ||
                     (mCode && String(mCode).trim().toLowerCase() === String(uCode).trim().toLowerCase()) ||
                     (mUser && String(mUser).trim().toLowerCase() === String(uUsername).trim().toLowerCase()) ||
                     (mName && String(mName).trim() === String(uName).trim());
            }
            return false;
          });
          if (hasMember) return g;
        }
      }

      for (const c of classes) {
        if (!Array.isArray(c.groups)) continue;
        for (const g of c.groups) {
          const hasMember = (g.members || []).some(m => {
            if (!m) return false;
            if (typeof m === 'string') return m === uId || m === uCode || m === uUsername || m === uName;
            if (typeof m === 'object') return m.id === uId || m.userId === uId || m.studentCode === uCode || m.username === uUsername || m.name === uName;
            return false;
          });
          if (hasMember) return g;
        }
      }

      if (user.groupId) {
        for (const c of classes) {
          const g = (c.groups || []).find(grp => grp.id === user.groupId);
          if (g) return g;
        }
      }

      // 🛡️ 严格隔离：未被分配到具体小组的学生，赋予独立的隔离空间，绝不默认塞进第 1 小组造成跨组串味
      return { id: `group_unassigned_${safeUserKey}`, name: '未分组（待教师分配）' };
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
      return tasks[taskIndex];
    }

    extendTaskDeadline(taskId, newDeadline, addedMinutes = 0) {
      let tasks = this.getTasks();
      const taskIndex = tasks.findIndex(t => t.id === taskId);
      if (taskIndex === -1) throw new Error('任务不存在或已被删除！');
      tasks[taskIndex].deadline = newDeadline;
      if (addedMinutes > 0) {
        tasks[taskIndex].durationMinutes = (parseInt(tasks[taskIndex].durationMinutes, 10) || 150) + parseInt(addedMinutes, 10);
      }
      localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(tasks));

      // 📢 自动发布全校/全班广播教学通知，通知所有学生端任务已延期
      this.publishAnnouncement(
        taskId,
        `⏳ 任务延期通知：截止时间已延长至 ${newDeadline}`,
        `任课教师已将写作任务《${tasks[taskIndex].title}》截止时间延长至 ${newDeadline}。各小组写作工作台已自动解除只读锁定，请同学们抓紧时间推进完成！`,
        null, 'all', '全班所有小组', 'all', '全校班级', ['all'], true
      );

      this.pushGlobalMeta();
      return tasks[taskIndex];
    }

    deleteTask(taskId) {
      let tasks = this.getTasks();
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
    }

    publishAnnouncement(taskId, title, content, attachment = null, targetGroupId = 'all', targetGroupName = '全班所有小组', classId = 'all', className = '全校班级', targetGroupIds = ['all'], isSystemAction = false) {
      const announcements = this.getAnnouncements();
      const tasks = this.getTasks();
      const task = tasks.find(t => t.id === taskId);
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
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        author: '老师', readStatus: {}
      };
      announcements.unshift(newAnn);
      localStorage.setItem(STORAGE_KEY_ANNOUNCEMENTS, JSON.stringify(announcements));
      this.pushGlobalMeta();
      return newAnn;
    }

    deleteAnnouncement(annId) {
      let announcements = this.getAnnouncements();
      announcements = announcements.filter(a => a.id !== annId);
      localStorage.setItem(STORAGE_KEY_ANNOUNCEMENTS, JSON.stringify(announcements));
      this.pushGlobalMeta();
    }

    markAnnouncementRead(annId, groupId = 'group_1') {
      const announcements = this.getAnnouncements();
      const ann = announcements.find(a => a.id === annId);
      const currUser = this.getCurrentUser();

      // 1. 优先以最高优先级向服务端轻量回传已读标记（0 依赖本地 localStorage，绝不受 Quota 影响）
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

      // 2. 本地内存与缓存安全更新 (带 QuotaExceeded 自动熔断与大对象修剪保护)
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
          console.warn('[Storage] QuotaExceeded on save announcements, cleaning legacy heavy items...', err);
          this._pruneStorageQuota();
          try {
            localStorage.setItem(STORAGE_KEY_ANNOUNCEMENTS, JSON.stringify(announcements));
          } catch (e2) {}
        }
      }
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
        return data ? JSON.parse(data) : [];
      } catch (e) { return []; }
    }

    getReferencePapers(groupId = null, classId = null, taskId = null) {
      const papers = this.getAllReferencePapers();
      if (!groupId && !classId && !taskId) return papers;
      return papers.filter(p => {
        const matchClass = !classId || classId === 'all' || p.classId === classId || (!p.classId && classId === 'class_101') || (Array.isArray(p.targetClassIds) && p.targetClassIds.includes(classId));
        const matchGroup = !groupId || groupId === 'all' || 
          (Array.isArray(p.targetGroupIds) ? (p.targetGroupIds.includes('all') || p.targetGroupIds.includes(groupId)) : (!p.targetGroupId || p.targetGroupId === 'all' || p.targetGroupId === groupId));
        const matchTask = !taskId ? true : (p.taskId === taskId || (!p.taskId && taskId === 'task_default'));
        return matchClass && matchGroup && matchTask;
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

      if (paper.fileData && !paper.fileUrl) {
        if (!window._paperMemoryBlobMap) window._paperMemoryBlobMap = new Map();
        window._paperMemoryBlobMap.set(paperId, paper.fileData);
      }

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
      this.updateScopeKeys();
      this.initPolling();
    }

    getEffectiveGroupId() {
      const user = this.app.authManager ? this.app.authManager.getCurrentUser() : null;
      const isTeacher = user && (user.isTeacher || user.role === 'teacher');
      if (isTeacher) {
        return this.app.state.activeMonitorGroupId || 'group_1';
      }
      const effectiveClassId = this.app.state.activeStudentClassId || user?.classId || 'class_101';
      const activeGroupObj = this.app.authManager ? this.app.authManager.getStudentActiveGroup(user, effectiveClassId) : null;
      return activeGroupObj?.id || user?.groupId || 'group_1';
    }

    updateScopeKeys() {
      const isTeacher = this.app.authManager?.getCurrentUser()?.role === 'teacher';
      const user = this.app.authManager?.getCurrentUser();
      const effectiveClassId = (isTeacher ? this.app.state.activeClassId : this.app.state.activeStudentClassId) || user?.classId || 'class_101';
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
        const url = `sync.php?action=presence_ping&taskId=${encodeURIComponent(this.taskId)}&groupId=${encodeURIComponent(this.groupId)}&classId=${encodeURIComponent(this.effectiveClassId || 'class_101')}`;
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
      // ⚡ 动静分级智能心跳与轮询阶梯：
      // • 活跃态 (< 2分钟有操作): 轮询 800ms，心跳 5s (单次50字节，秒亮在线绿点)
      // • 静止态 (> 2分钟无操作): 轮询 15s，心跳 30s
      // • 息屏态 (切后台/休眠): 轮询 30s，心跳 60s
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
      const getPollInterval = () => (isHidden() ? 30000 : (isIdle() ? 15000 : 800));
      const getPingInterval = () => (isHidden() ? 60000 : (isIdle() ? 30000 : 5000));

      const runPoll = () => {
        if (this.isLoggingOut) return;
        this.pullFromServer().finally(() => {
          if (this.isLoggingOut) return;
          this.pollTimer = setTimeout(runPoll, getPollInterval());
        });
      };
      this.pollTimer = setTimeout(runPoll, 1000);

      let lastPingTime = Date.now();
      const runPing = () => {
        if (this.isLoggingOut) return;
        const now = Date.now();
        const pInterval = getPingInterval();
        if (now - lastPingTime >= pInterval) {
          lastPingTime = now;
          this.sendPresencePing().finally(() => {
            if (this.isLoggingOut) return;
            this.pingTimer = setTimeout(runPing, 3000);
          });
        } else {
          this.pingTimer = setTimeout(runPing, 3000);
        }
      };
      this.pingTimer = setTimeout(runPing, 5000);

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
            const effectiveClassId = this.effectiveClassId || currentUser.classId || 'class_101';
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
        if (remoteData.metaVer !== undefined) {
          this._lastKnownMetaVer = remoteData.metaVer;
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
          const localStr = localStorage.getItem(key) || '[]';
          const remoteStr = JSON.stringify(remoteData.tasks);
          if (localStr !== remoteStr) localStorage.setItem(key, remoteStr);
        }
        if (Array.isArray(remoteData.users) && remoteData.users.length > 0) {
          const key = 'jizhi_pure_v10_users_db';
          const localStr = localStorage.getItem(key) || '[]';
          const remoteStr = JSON.stringify(remoteData.users);
          if (localStr !== remoteStr) localStorage.setItem(key, remoteStr);
        }
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
          localStorage.setItem(key, JSON.stringify(merged));
        }
        if (Array.isArray(remoteData.referencePapers) && remoteData.referencePapers.length > 0) {
          const key = 'jizhi_reference_papers_db';
          const local = JSON.parse(localStorage.getItem(key) || '[]');
          const remoteIds = new Set(remoteData.referencePapers.map(p => p.id));
          const merged = [...remoteData.referencePapers];
          local.forEach(l => { if (l && l.id && !remoteIds.has(l.id)) merged.push(l); });
          localStorage.setItem(key, JSON.stringify(merged));
          localStorage.setItem('jizhi_pure_v10_ref_papers_db', JSON.stringify(merged));
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
          const remoteLogs = Array.isArray(remoteData.chatLogs[stg]) ? remoteData.chatLogs[stg] : [];
          // 🛡️ 严格按组隔离：直接使用云端针对本组真实返回的消息列表，严禁在前端与上一组内存混淆
          this.app.state.chatLogs[stg] = remoteLogs;
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
        needWorkspaceRender = true;
        const localS1 = this.app.state.stage1 || { proposals: [], votes: {}, hasVoted: {}, contract: {} };
        const remoteS1 = remoteData.stage1;
        const isContractInputActive = document.activeElement && (
          document.activeElement.classList.contains('task-assignment-input') ||
          document.activeElement.classList.contains('contract-time-input') ||
          document.activeElement.id === 'contract-topic-input'
        );

        if (remoteS1.contract) {
          if (!this.app.state.stage1.contract) this.app.state.stage1.contract = {};
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
          }
          if (remoteS1.contract.isConfirmed !== undefined) {
            this.app.state.stage1.contract.isConfirmed = remoteS1.contract.isConfirmed;
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

        const localProps = Array.isArray(localS1.proposals) ? localS1.proposals : [];
        const remoteProps = Array.isArray(remoteS1.proposals) ? remoteS1.proposals : [];
        const propByAuthor = new Map();

        // 建立作者标识归一化映射
        const normalizeAuthorKey = (authorId, authorName) => {
          if (authorName && typeof authorName === 'string' && authorName.trim()) return authorName.trim();
          return String(authorId || '').trim();
        };

        localProps.forEach(p => {
          if (p && (p.author || p.authorName)) {
            const k = normalizeAuthorKey(p.author, p.authorName);
            propByAuthor.set(k, p);
          }
        });

        remoteProps.forEach(remoteP => {
          if (remoteP && (remoteP.author || remoteP.authorName)) {
            const k = normalizeAuthorKey(remoteP.author, remoteP.authorName);
            const localP = propByAuthor.get(k);
            if (!localP) {
              propByAuthor.set(k, remoteP);
            } else {
              const remoteTime = remoteP.updatedAt || 0;
              const localTime = localP.updatedAt || 0;
              if (remoteTime >= localTime) {
                propByAuthor.set(k, remoteP);
              }
            }
          }
        });
        // 🛡️ 严格小组白名单过滤：仅保留属于本组成员的提案，剔除历史跨组残留的脏数据
        let allowedMemberKeys = new Set();
        const currentMembers = this.app.state.members;
        if (currentMembers) {
          const memList = Array.isArray(currentMembers) ? currentMembers : Object.values(currentMembers);
          memList.forEach(m => {
            if (m) {
              if (m.id) allowedMemberKeys.add(String(m.id).trim());
              if (m.studentCode) allowedMemberKeys.add(String(m.studentCode).trim());
              if (m.username) allowedMemberKeys.add(String(m.username).trim());
              if (m.name) allowedMemberKeys.add(String(m.name).trim());
            }
          });
        }
        if (allowedMemberKeys.size === 0 && this.app.authManager) {
          const currU = this.app.authManager.getCurrentUser();
          const effClassId = this.app.state.activeStudentClassId || currU?.classId || 'class_101';
          const effGroup = this.app.authManager.getStudentActiveGroup(currU, effClassId);
          const groupMembers = this.app.authManager.getGroupMembersForWorkspace(effGroup?.id || 'group_1');
          Object.values(groupMembers).forEach(m => {
            if (m) {
              if (m.id) allowedMemberKeys.add(String(m.id).trim());
              if (m.studentCode) allowedMemberKeys.add(String(m.studentCode).trim());
              if (m.username) allowedMemberKeys.add(String(m.username).trim());
              if (m.name) allowedMemberKeys.add(String(m.name).trim());
            }
          });
        }

        const allMerged = Array.from(propByAuthor.values());
        const mergedProposals = allowedMemberKeys.size > 0
          ? allMerged.filter(p => {
              const authorId = String(p.author || '').trim();
              const authorName = String(p.authorName || '').trim();
              return allowedMemberKeys.has(authorId) || (authorName && allowedMemberKeys.has(authorName));
            })
          : allMerged;

        const mergedVotes = {
          ...(localS1.votes || {}),
          ...(remoteS1.votes || {})
        };
        const mergedHasVoted = {
          ...(localS1.hasVoted || {}),
          ...(remoteS1.hasVoted || {})
        };

        const isProposalChanged = JSON.stringify(mergedProposals) !== JSON.stringify(localProps);
        const isVoteChanged = JSON.stringify(mergedVotes) !== JSON.stringify(localS1.votes || {})
          || JSON.stringify(mergedHasVoted) !== JSON.stringify(localS1.hasVoted || {});
        const isConfirmChanged = remoteS1.contract?.isConfirmed !== localS1.contract?.isConfirmed
          || JSON.stringify(remoteS1.contract?.confirmedMembers) !== JSON.stringify(localS1.contract?.confirmedMembers);

        this.app.state.stage1.proposals = mergedProposals;
        this.app.state.stage1.votes = mergedVotes;
        this.app.state.stage1.hasVoted = mergedHasVoted;

        if (isProposalChanged || isVoteChanged || isConfirmChanged) {
          needWorkspaceRender = true;
        }
      }

      if (remoteData.stage2) {
        if (remoteData.stage2.unifiedContent !== undefined) {
          const remoteHtml = remoteData.stage2.unifiedContent || '';
          if (!this.app.state.stage2) this.app.state.stage2 = {};
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
          if (JSON.stringify(remoteData.stage2.confirmedMembers) !== JSON.stringify(this.app.state.stage2.confirmedMembers)) {
            this.app.state.stage2.confirmedMembers = remoteData.stage2.confirmedMembers;
            needWorkspaceRender = true;
          }
        }
        if (remoteData.stage2.isDraftConfirmed !== undefined && remoteData.stage2.isDraftConfirmed !== this.app.state.stage2.isDraftConfirmed) {
          this.app.state.stage2.isDraftConfirmed = remoteData.stage2.isDraftConfirmed;
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
        // 🎯 如果用户当前正在自主浏览阶段一/过往阶段，则不强制跳走，保留学生知情权与自主切换权
        if (!this.app.isViewingPastStage && remoteOrder > currentOrder && !this.app.state.isFinalSubmitted) {
          this.app.state.currentStage = remoteData.currentStage;
          needWorkspaceRender = true;
        }
      }

      this.app.saveGroupState(myGroupId);
      if (typeof window.renderChat === 'function') window.renderChat(this.app.state);
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
        const streamKey = `${st.id}_${state.activeMonitorGroupId || 'group_1'}`;
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
    const activeClassId = state.activeClassId || (classes[0] ? classes[0].id : 'class_101');
    const activeClass = classes.find(c => c.id === activeClassId) || classes[0] || { id: 'class_101', name: '默认班级', groups: [] };

    const allUsers = authManager.getUsers();
    const classStudents = authManager.getClassStudents(activeClass.id);

    // 🛡️ 严格按当前班级隔离写作任务、通知与文献（绝不串出其他班级数据）
    const currentClassTasks = tasks.filter(t => t.classId === activeClass.id || (t.className && t.className === activeClass.name) || (!t.classId && activeClass.id === 'class_101'));
    const currentClassAnnouncements = announcements.filter(a => (a.classId === activeClass.id || (a.className && a.className === activeClass.name) || (!a.classId && activeClass.id === 'class_101') || (Array.isArray(a.targetClassIds) && a.targetClassIds.includes(activeClass.id))) && !a.isSystemAction);
    const currentClassPapers = refPapers.filter(p => p.classId === activeClass.id || (p.className && p.className === activeClass.name) || (!p.classId && activeClass.id === 'class_101') || (Array.isArray(p.targetClassIds) && p.targetClassIds.includes(activeClass.id)));

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

    // ⚡ 教师端自动轻量轮询：自调度循环，杜绝并发拉取与 interval 重注册竞态
    const teacherPullAndRefresh = async () => {
      const curU = authManager.getCurrentUser();
      if (!curU || curU.role !== 'teacher') return; // 非教师即停止轮询
      if (document.querySelector('.modal-overlay')) {
        window._teacherPortalSyncTimer = setTimeout(teacherPullAndRefresh, 3000);
        return;
      }

      if (state.teacherActiveTab === 'view_monitoring' && window.app && window.app.cloudSyncEngine) {
        const currentCId = state.activeClassId || activeClass.id || 'class_101';
        let activeTaskId = state.activeTaskId || (currentClassTasks[0] ? currentClassTasks[0].id : `task_${currentCId}_default`);
        if (!activeTaskId || activeTaskId === 'task_default') {
          activeTaskId = `task_${currentCId}_default`;
        }
        const currentGId = state.activeMonitorGroupId || activeMonitorGId;
        window.app.cloudSyncEngine.groupId = currentGId;
        window.app.cloudSyncEngine.taskId = activeTaskId;
        window.app.cloudSyncEngine.effectiveClassId = currentCId;
        window.app.cloudSyncEngine.updateScopeKeys();

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
          panorama: state.monitorPanorama ? JSON.stringify(state.monitorPanorama) : '{}'
        });

        try {
          // 📝 针对阶段二，同时从 Etherpad 提取最新正文镜像（支持 Hash 增量早退）
          const padName = `jizhi_${activeTaskId}_${currentGId}`;
          const lastEpHash = state._lastEpHash || '';
          const epRes = await fetch(`sync.php?action=get_pad_html&padId=${padName}&clientHash=${encodeURIComponent(lastEpHash)}`).then(r => r.json()).catch(() => null);
          if (epRes && epRes.hash) state._lastEpHash = epRes.hash;
          if (epRes && epRes.success && !epRes.unchanged && (epRes.html || epRes.text)) {
            if (!state.stage2) state.stage2 = {};
            state.stage2.unifiedContent = epRes.html || epRes.text;
          }
          const curT = authManager.getCurrentUser();
          const tToken = (curT && (curT.activeSessionId || curT.token)) || '';
          const tId = (curT && (curT.id || curT.username)) || '';
          const lastHash = state._lastMonitorHash || '';
          const panRes = await fetch(`sync.php?action=get_teacher_monitor_all_groups&taskId=${encodeURIComponent(activeTaskId)}&classId=${encodeURIComponent(currentCId)}&userId=${encodeURIComponent(tId)}&token=${encodeURIComponent(tToken)}&clientHash=${encodeURIComponent(lastHash)}`).then(r => r.json()).catch(() => null);
          if (panRes && panRes.success && panRes.groups) {
            state.monitorPanorama = panRes.groups;
            if (panRes.hash) state._lastMonitorHash = panRes.hash;

            // 🎯 核心修复：将当前正在同屏监控的小组真实数据精准同步到 state
            const currentGroupData = panRes.groups[currentGId];
            if (currentGroupData) {
              state.stage1 = currentGroupData.stage1 || { proposals: [], votes: {}, hasVoted: {}, contract: {} };
              state.stage2 = {
                ...(state.stage2 || {}),
                ...(currentGroupData.stage2 || {}),
                unifiedContent: (state.stage2 && state.stage2.unifiedContent) ? state.stage2.unifiedContent : (currentGroupData.stage2?.unifiedContent || '')
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
          panorama: state.monitorPanorama ? JSON.stringify(state.monitorPanorama) : '{}'
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
            const layout = container.querySelector('.teacher-portal-layout');
            const curScroll = layout ? layout.scrollTop : 0;
            state._teacherScrollTop = curScroll;
            renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
            const nextLayout = container.querySelector('.teacher-portal-layout');
            if (nextLayout) nextLayout.scrollTop = curScroll;
            return; // 重渲染会重建循环
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
            const currentClassTasks = tasks.filter(t => t.classId === activeClass.id || (t.className && t.className === activeClass.name) || (!t.classId && activeClass.id === 'class_101'));
            const currentClassAnnouncements = announcements.filter(a => (a.classId === activeClass.id || (a.className && a.className === activeClass.name) || (!a.classId && activeClass.id === 'class_101') || (Array.isArray(a.targetClassIds) && a.targetClassIds.includes(activeClass.id))) && !a.isSystemAction);
            const currentClassPapers = refPapers.filter(p => p.classId === activeClass.id || (p.className && p.className === activeClass.name) || (!p.classId && activeClass.id === 'class_101') || (Array.isArray(p.targetClassIds) && p.targetClassIds.includes(activeClass.id)));

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

                <div class="card" style="border-top:4px solid #7c3aed; width:100%; padding:16px 20px;">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
                    <span style="font-size:15px; font-weight:800; color:#0f172a;">📡 全组实时总览</span>
                    <span style="font-size:11.5px; color:#64748b; font-weight:600;">
                      <span style="color:#16a34a;">🟢 正常</span>　<span style="color:#d97706;">🟡 部分离线</span>　<span style="color:#dc2626;">🔴 全员离线/字段占用</span>　<span style="color:#059669;">✅ 已终稿</span>
                    </span>
                  </div>
                  <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(170px, 1fr)); gap:10px;">
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
                          const isSel = (state.activeTaskId || 'task_default') === t.id;
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
                    <button class="btn-monitor-stage-tab ${monitorStageMode === 'auto' ? 'active' : ''}" data-stg="auto" style="background:${monitorStageMode === 'auto' ? '#ecfdf5' : '#f8fafc'}; border:1px solid ${monitorStageMode === 'auto' ? '#a7f3d0' : '#e2e8f0'}; color:${monitorStageMode === 'auto' ? '#059669' : '#475569'}; padding:6px 12px; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer;">
                      ⚡ 自动跟随 (${actualStage === 'stage1' ? '阶段一' : actualStage === 'stage2' ? '阶段二' : '阶段三'}) 🟢
                    </button>
                    <button class="btn-monitor-stage-tab ${monitorStageMode === 'stage1' ? 'active' : ''}" data-stg="stage1" style="background:${monitorStageMode === 'stage1' ? '#eff6ff' : '#f8fafc'}; border:1px solid ${monitorStageMode === 'stage1' ? '#bfdbfe' : '#e2e8f0'}; color:${monitorStageMode === 'stage1' ? '#1d4ed8' : '#475569'}; padding:6px 12px; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer;">
                      🎪 查看阶段一
                    </button>
                    <button class="btn-monitor-stage-tab ${monitorStageMode === 'stage2' ? 'active' : ''}" data-stg="stage2" style="background:${monitorStageMode === 'stage2' ? '#eff6ff' : '#f8fafc'}; border:1px solid ${monitorStageMode === 'stage2' ? '#bfdbfe' : '#e2e8f0'}; color:${monitorStageMode === 'stage2' ? '#1d4ed8' : '#475569'}; padding:6px 12px; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer;">
                      📰 查看阶段二
                    </button>
                    <button class="btn-monitor-stage-tab ${monitorStageMode === 'stage3' ? 'active' : ''}" data-stg="stage3" style="background:${monitorStageMode === 'stage3' ? '#eff6ff' : '#f8fafc'}; border:1px solid ${monitorStageMode === 'stage3' ? '#bfdbfe' : '#e2e8f0'}; color:${monitorStageMode === 'stage3' ? '#1d4ed8' : '#475569'}; padding:6px 12px; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer;">
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
                    <!-- 右侧卡片：高度锁定 860px，与左侧绝对平齐，内部聊天流全高滚动 -->
                    <div class="card" style="padding:18px 20px; display:flex; flex-direction:column; min-width:0; box-sizing:border-box; height:100%; max-height:860px; overflow:hidden; border:1px solid #e2e8f0; box-shadow:0 2px 8px rgba(15,23,42,0.04);">
                      <div style="flex-shrink:0; font-size:14.5px; font-weight:800; color:#0f172a; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e2e8f0; padding-bottom:8px;">
                        <span>💬 团队全程研讨对话流 (${activeMonitorGroup.name})</span>
                        <span style="font-size:11px; background:#eff6ff; color:#2563eb; padding:2px 8px; border-radius:6px; font-weight:700;">全阶段汇总 (${combinedGroupChatLogs.length}条)</span>
                      </div>
                      <div class="teacher-chat-stream" style="flex:1; min-height:0; height:100%; max-height:100%; overflow-y:auto; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px; font-size:12px; display:flex; flex-direction:column; gap:10px; box-sizing:border-box;">
                        ${combinedGroupChatLogs.length > 0 ? combinedGroupChatLogs.map(m => {
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
                        `}
                      </div>
                    </div>
                  `;

                  if (effectiveMonitorStage === 'stage1') {
                    return `
                      <div style="display:grid; grid-template-columns: minmax(0, 1fr) 380px; gap:16px; width:100%; box-sizing:border-box; height:860px; max-height:860px; overflow:hidden; align-items:stretch;">
                        <!-- 左侧卡片：以阶段一左侧为主，860px 高度自适应滚动，呈现完整结构 -->
                        <div class="card" style="padding:20px; display:flex; flex-direction:column; border:1px solid #bfdbfe; gap:14px; min-width:0; box-sizing:border-box; height:100%; max-height:860px; overflow-y:auto;">
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
                    const confirmedDraftCount = Object.values(state.stage2?.confirmedMembers || {}).filter(Boolean).length;

                    return `
                      <div style="display:grid; grid-template-columns: minmax(0, 1fr) 380px; gap:16px; width:100%; box-sizing:border-box; height:860px; max-height:860px; overflow:hidden; align-items:stretch;">
                        <!-- 左侧卡片：1:1 镜像学生端阶段二全部结构，高度绝对统一为 860px -->
                        <div class="card" style="padding:18px 20px; display:flex; flex-direction:column; border:1px solid #bfdbfe; min-width:0; box-sizing:border-box; height:100%; max-height:860px; gap:10px; overflow:hidden;">
                          <!-- 1. 顶部标题与字数 -->
                          <div style="flex-shrink:0; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e2e8f0; padding-bottom:8px;">
                            <div style="display:flex; align-items:center; gap:8px;">
                              <span style="font-size:15px; font-weight:800; color:#1e40af;">📝 学术协作富文本编辑器 (${activeMonitorGroup.name})</span>
                              <span style="font-size:11px; background:#ecfdf5; color:#059669; padding:2px 8px; border-radius:10px; font-weight:700; border:1px solid #a7f3d0;">🟢 实时同步中</span>
                            </div>
                            <span style="font-size:12px; color:#475569;">总字数: <b style="color:#2563eb; font-size:14px;">${(state.stage2?.unifiedContent || '').replace(/<[^>]*>/g, '').trim().length}</b> 字</span>
                          </div>

                          <!-- 2. 半程修正清单 (1:1 镜像学生端：已生成显示绿色卡片，未生成显示虚线占位卡片) -->
                          ${(s2ActionPlan && s2ActionPlan.isGenerated) ? `
                            <div style="background:#ecfdf5; border:1px solid #a7f3d0; border-radius:8px; padding:8px 12px; flex-shrink:0;">
                              <div style="font-size:12px; font-weight:800; color:#059669; display:flex; justify-content:space-between; align-items:center;">
                                <span>📋 【半程修正清单】(3项修改要求)</span>
                                <span style="font-size:10.5px; background:#d1fae5; color:#065f46; padding:1px 6px; border-radius:10px;">已生成</span>
                              </div>
                              <div style="font-size:11.5px; color:#334155; display:flex; flex-direction:column; gap:2px; margin-top:4px;">
                                ${(s2ActionPlan.items || []).map(item => `<div style="line-height:1.4;">• ${escapeHtml(item)}</div>`).join('')}
                              </div>
                            </div>
                          ` : `
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
                          `}

                          <!-- 3. 正文初稿确认进度 (1:1 镜像学生端) -->
                          <div style="flex-shrink:0; background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:8px 12px; font-size:12px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; box-shadow:0 1px 2px rgba(15,23,42,0.02);">
                            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                              <span style="font-weight:800; color:#0f172a;">✍️ 正文初稿确认进度:</span>
                              <span style="font-weight:700; color:${state.stage2?.isDraftConfirmed ? '#059669' : '#2563eb'}; background:${state.stage2?.isDraftConfirmed ? '#ecfdf5' : '#eff6ff'}; padding:2px 8px; border-radius:10px; border:1px solid ${state.stage2?.isDraftConfirmed ? '#a7f3d0' : '#bfdbfe'}; font-size:11px;">
                                ${state.stage2?.isDraftConfirmed ? '✅ 全员已确认完成初稿' : `${confirmedDraftCount}/${totalMemberCount} 人已确认`}
                              </span>
                              <div style="display:flex; gap:6px; flex-wrap:wrap;">
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
                            <div style="flex:1; min-height:420px; display:flex; flex-direction:column; align-items:center; justify-content:center; border-radius:8px; border:1.5px dashed #cbd5e1; background:#ffffff; color:#64748b; padding:24px; text-align:center; gap:8px;">
                              <span style="font-size:32px;">⏳</span>
                              <span style="font-size:14px; font-weight:700; color:#334155;">小组当前处于阶段一（学术公约拟定），尚未进入阶段二编辑部正文协作</span>
                              <span style="font-size:12px; color:#94a3b8;">待组员全员签署公约进入阶段二后，此处将自动实时同步正文协作画面</span>
                            </div>
                          ` : `
                            <div style="flex:1; min-height:420px; border-radius:8px; overflow:hidden; border:1.5px solid #cbd5e1; box-shadow:0 2px 8px rgba(15,23,42,0.04); background:#ffffff; position:relative;">
                              <iframe id="teacher-stage2-etherpad-frame" src="/p/jizhi_${encodeURIComponent(activeTaskId)}_${encodeURIComponent(activeMonitorGId)}?userName=${encodeURIComponent('教师监控')}&userColor=%237c3aed&showControls=false&showChat=false&showLineNumbers=true" style="width:100%; height:100%; border:none; display:block; background:#ffffff;" title="教师端实时写作同屏镜像"></iframe>
                            </div>
                          `}

                          <!-- 5. 📊 团队协作贡献度占比 (SSRL 群体过程感知) - 真实计算，无数据为 0% -->
                          <div style="background:#ffffff; padding:10px 14px; border-radius:8px; border:1px solid #cbd5e1; flex-shrink:0; display:flex; flex-direction:column; gap:6px; box-shadow:0 1px 3px rgba(15,23,42,0.04);">
                            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
                              <span style="font-size:12px; font-weight:800; color:#1e293b;">📊 团队协作贡献度占比 (SSRL 群体过程感知):</span>
                              <div class="contrib-labels" style="display:flex; font-size:11.5px; font-weight:700; color:#475569; gap:10px; white-space:nowrap; flex-wrap:wrap;">
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
                            <div class="contrib-bars" style="width:100%; height:10px; border-radius:5px; display:flex; overflow:hidden; background:#e2e8f0;">
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
                      <div style="display:grid; grid-template-columns: minmax(0, 1fr) 380px; gap:16px; width:100%; box-sizing:border-box; height:860px; max-height:860px; overflow:hidden; align-items:stretch;">
                        <!-- 阶段三左侧卡片：总高 860px；答辩页自适应内部滚动，终稿页与阶段二一样带贡献度 -->
                        <div class="card" style="padding:18px 20px; display:flex; flex-direction:column; border:1px solid #bfdbfe; min-width:0; box-sizing:border-box; height:100%; max-height:860px; gap:10px; overflow:hidden;">
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
                              <span style="font-size:12px; color:#64748b;">终稿字数: <b style="color:#2563eb; font-size:14px;">${((state.stage3?.finalDraft || state.stage2?.unifiedContent || '').replace(/<[^>]*>/g, '').trim()).length}</b> 字</span>
                            </div>
                            ${(state.currentStage === 'stage1' || state.currentStage === 'stage2') ? `
                              <div style="flex:1; min-height:420px; display:flex; flex-direction:column; align-items:center; justify-content:center; border-radius:8px; border:1.5px dashed #cbd5e1; background:#ffffff; color:#64748b; padding:24px; text-align:center; gap:8px;">
                                <span style="font-size:32px;">⏳</span>
                                <span style="font-size:14px; font-weight:700; color:#334155;">小组尚未进入阶段三论文终稿与答辩阶段</span>
                                <span style="font-size:12px; color:#94a3b8;">待小组进入阶段三后，此处将自动实时呈现论文终稿镜像</span>
                              </div>
                            ` : `
                              <div style="flex:1; min-height:420px; border-radius:8px; overflow:hidden; border:1.5px solid #cbd5e1; box-shadow:0 2px 8px rgba(15,23,42,0.04); background:#ffffff; position:relative;">
                                <iframe id="teacher-stage3-etherpad-frame" src="/p/jizhi_${encodeURIComponent(activeTaskId)}_${encodeURIComponent(activeMonitorGId)}?userName=${encodeURIComponent('教师监控')}&userColor=%237c3aed&showControls=false&showChat=false&showLineNumbers=true" style="width:100%; height:100%; border:none; display:block; background:#ffffff;" title="教师端论文终稿同屏镜像"></iframe>
                              </div>
                            `}
                            <div style="background:#ffffff; padding:10px 14px; border-radius:8px; border:1px solid #cbd5e1; flex-shrink:0; display:flex; flex-direction:column; gap:6px; box-shadow:0 1px 3px rgba(15,23,42,0.04);">
                              <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
                                <span style="font-size:12px; font-weight:800; color:#1e293b;">📊 终稿协作贡献度占比 (SSRL 群体过程感知):</span>
                                <div class="contrib-labels" style="display:flex; font-size:11.5px; font-weight:700; color:#475569; gap:10px; white-space:nowrap; flex-wrap:wrap;">
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
                              <div class="contrib-bars" style="width:100%; height:10px; border-radius:5px; display:flex; overflow:hidden; background:#e2e8f0;">
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
                              <div style="display:flex; flex-direction:column; gap:12px; flex:1;">
                                ${(state.stage3?.feedbackItems && state.stage3.feedbackItems.length > 0) ? state.stage3.feedbackItems.map((item, i) => `
                                  <div style="background:#ffffff; border:1.5px solid ${item.response ? '#93c5fd' : '#fde68a'}; border-radius:8px; padding:12px 14px; font-size:12.5px; box-shadow:0 1px 3px rgba(0,0,0,0.02);">
                                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                                      <span style="font-weight:800; color:#0f172a; font-size:13px;">💬 答辩质询 #${i+1} (${escapeHtml(item.fromGroupName || item.roleName || '答辩委员会')}):</span>
                                      <span style="font-size:11px; background:${item.response ? '#ecfdf5' : '#fef3c7'}; color:${item.response ? '#059669' : '#b45309'}; padding:2px 8px; border-radius:4px; font-weight:700;">
                                        ${item.response ? '✅ 小组已答复' : '⏳ 待答辩回复'}
                                      </span>
                                    </div>
                                    <div style="color:#1e293b; background:#f8fafc; padding:8px 10px; border-radius:6px; margin-bottom:8px; border-left:3px solid #3b82f6; line-height:1.5;">
                                      ${escapeHtml(item.question || item.comment || item.text || '质询内容生成中...')}
                                    </div>
                                    ${item.response ? `
                                      <div style="color:#065f46; background:#ecfdf5; padding:8px 10px; border-radius:6px; border-left:3px solid #10b981; line-height:1.5;">
                                        <b>✍️ 小组辩护陈述与修改方案:</b> ${escapeHtml(item.response)}
                                      </div>
                                    ` : `
                                      <div style="color:#94a3b8; font-style:italic; font-size:11.5px; padding:4px 8px;">
                                        （本小组尚未提交对该质询的答辩回应）
                                      </div>
                                    `}
                                  </div>
                                `).join('') : `
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
        if (!state.stage1) state.stage1 = { topics: [], bidLogs: [], contract: { confirmedMembers: {}, taskAssignments: {}, timeAllocations: {} } };
        if (!state.stage2) state.stage2 = { unifiedContent: '', memberContributions: {} };
        if (!state.stage3) state.stage3 = { reviews: [] };
        if (!state.chatLogs) state.chatLogs = { stage1: [], stage2: [], stage3: [] };

        if (btn.dataset.tab === 'view_monitoring' && window.app) {
          try {
            window.app.loadGroupState(state.activeMonitorGroupId || 'group_1');
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
            alert(`✅ 写作任务《${task.title}》截止时间已延长至 ${newDeadlineStr}！\n\n学生端工作台已自动解除只读锁定，可正常协同编辑。`);
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
            selectedAttachment = { name: f.name, size: sizeMB };
            dropText.innerHTML = `<span style="font-size:24px;">✅</span><div style="font-size:13px; color:#34d399; font-weight:700;">已选中随附文件: ${f.name} (${sizeMB})</div>`;
          }
        });

        modal.querySelector('#btn-submit-new-ann').addEventListener('click', () => {
          const selClassId = classSelect.value;
          const selClassObj = allClasses.find(c => c.id === selClassId);
          const selClassName = selClassId === 'all' ? '全校班级' : (selClassObj ? selClassObj.name : '指定班级');

          const taskId = modal.querySelector('#modal-ann-task').value;
          if (!taskId || taskId === 'task_all' || taskId === 'task_default') {
            alert('⚠️ 请先为当前班级创建具体写作任务，通知必须锁定关联至具体任务！');
            return;
          }
          const checkedGroupCbs = Array.from(groupsContainer.querySelectorAll('input[type="checkbox"]:checked'));
          if (checkedGroupCbs.length === 0) {
            alert('⚠️ 请至少勾选一个接收通知的受众小组！');
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
          authManager.publishAnnouncement(taskId, title, content, selectedAttachment, targetGId, targetGName, selClassId, selClassName, selectedGroupIds);
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
              alert('⚠️ 请先为当前班级创建具体写作任务，参考文献必须锁定关联至具体任务！');
              submitBtn.disabled = false;
              submitBtn.innerText = '📚 确认上传并存入范文库';
              return;
            }

            const checkedGroupCbs = Array.from(paperGroupsContainer.querySelectorAll('input[type="checkbox"]:checked'));
            if (checkedGroupCbs.length === 0) {
              alert('⚠️ 请至少勾选一个接收文献的受众小组！');
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
          if (paper.fileUrl) {
            const a = document.createElement('a');
            a.href = paper.fileUrl;
            a.download = paper.fileName || '学术参考范文.pdf';
            a.target = '_blank';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          } else if (paper.fileData || (window._paperMemoryBlobMap && window._paperMemoryBlobMap.get(paperId))) {
            const fData = paper.fileData || window._paperMemoryBlobMap.get(paperId);
            const a = document.createElement('a');
            a.href = fData;
            a.download = paper.fileName || '学术参考范文.pdf';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          } else {
            downloadFileBlob(paper.fileName);
          }
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
          window.app.loadGroupState(state.activeMonitorGroupId || 'group_1');
        }
        renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
      });
    }

    const syncGroupDataFromMemory = (targetGId) => {
      state.activeMonitorGroupId = targetGId;
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
      btn.addEventListener('click', () => {
        state.teacherMonitorStageMode = btn.dataset.stg;
        renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
      });
    });

    const btnStage3Def = container.querySelector('#btn-tab-teacher-stage3-defense');
    if (btnStage3Def) {
      btnStage3Def.addEventListener('click', () => {
        state.stage3TeacherTab = 'defense';
        renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
      });
    }
    const btnStage3Doc = container.querySelector('#btn-tab-teacher-stage3-doc');
    if (btnStage3Doc) {
      btnStage3Doc.addEventListener('click', () => {
        state.stage3TeacherTab = 'doc';
        renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
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
     7.5 STUDENT TASK PORTAL / DASHBOARD (我的写作任务大厅)
     ========================================================================== */
  function renderStudentTaskPortal(container, authManager, state, onSelectTask, onLogout, onSwitchTeacher, onOpenAnnModal, onOpenSurveyModal) {
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
      const sInterval = isStudentIdle() ? 15000 : 3000;
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

    const sInitInterval = (document.hidden ? 5000 : 50);
    window._studentPortalSyncTimer = setTimeout(pullAndRefresh, sInitInterval);

    const currentUser = authManager.getCurrentUser();
    const classes = authManager.getClasses();
    const tasks = authManager.getTasks();
    const announcements = authManager.getAnnouncements();

    // 🔔 检查并播报任务时长延长通知
    (tasks || []).forEach(t => {
      if (!t || !t.id || !t.deadline) return;
      const dlKey = `jizhi_known_deadline_${t.id}`;
      const unreadKey = `jizhi_unread_deadline_ext_${t.id}`;
      const prevDl = localStorage.getItem(dlKey);
      const newDlMs = new Date(t.deadline.replace(/-/g, '/')).getTime();

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
          `任务【${t.title}】写作时间已延长！`,
          `指导教师已为您延长写作截止时间至：${formatStandardDateDash(t.deadline)}，倒计时已同步更新。`
        );
      }
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
      (classes || []).filter(c => c.id === (currentUser?.classId || 'class_101')).length > 0
        ? (classes || []).filter(c => c.id === (currentUser?.classId || 'class_101'))
        : [(classes && classes[0]) || { id: 'class_101', name: '教学班级', groups: [] }]
    );

    const activeUserClassId = state.activeStudentClassId && displayClasses.some(c => c.id === state.activeStudentClassId)
      ? state.activeStudentClassId
      : (displayClasses.find(c => c.id === currentUser?.classId)?.id || displayClasses[0].id);
    const userClass = displayClasses.find(c => c.id === activeUserClassId) || displayClasses[0];
    state.activeStudentClassId = userClass.id;

    // 👥 2. 动态精准匹配该学生在当前选定班级里的真实小组
    const activeGroupObj = authManager.getStudentActiveGroup(currentUser, userClass.id);
    const groupId = activeGroupObj.id || 'group_1';
    const groupName = activeGroupObj.name || '第 1 协作小组';

    // 📋 3. 严格按当前选定班级和小组过滤通知（杜绝外班通知串入导致未读数虚高）
    const relevantAnnouncements = (announcements || []).filter(a => {
      const matchClass = a.classId === userClass.id || (a.className && a.className === userClass.name) || (!a.classId && userClass.id === 'class_101') || (Array.isArray(a.targetClassIds) && a.targetClassIds.includes(userClass.id));
      const matchGroup = !a.targetGroupId || a.targetGroupId === 'all' || a.targetGroupId === groupId ||
        (Array.isArray(a.targetGroupIds) && (a.targetGroupIds.includes('all') || a.targetGroupIds.includes(groupId)));
      return matchClass && matchGroup;
    });

    const isAnnRead = (a) => {
      if (!a || !a.readStatus) return false;
      if (currentUser) {
        if (currentUser.id && a.readStatus[currentUser.id]) return true;
        if (currentUser.studentCode && a.readStatus[currentUser.studentCode]) return true;
        if (currentUser.username && a.readStatus[currentUser.username]) return true;
        if (currentUser.name && a.readStatus[currentUser.name]) return true;
        if (Array.isArray(a.confirmedMembers)) {
          if (a.confirmedMembers.some(m => m && (m.id === currentUser.id || m.studentCode === currentUser.studentCode || (currentUser.name && m.name === currentUser.name)))) return true;
        }
      }
      return false;
    };

    const unreadAnnCount = relevantAnnouncements.filter(a => {
      if (a.taskId && a.taskId !== 'task_all') {
        const tObj = tasks.find(t => t.id === a.taskId);
        if (tObj && isTaskExpired(tObj)) return false;
      }
      return !isAnnRead(a);
    }).length;

    const relevantTasks = tasks.filter(t => {
      return t.classId === userClass.id || (t.className && t.className === userClass.name) || (!t.classId && userClass.id === 'class_101');
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
    container.querySelector('#btn-portal-ann-bell')?.addEventListener('click', () => onOpenAnnModal());
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

    const activeClassId = state.activeStudentClassId || currentUser?.classId || 'class_101';
    const activeGroupObj = (window.app && window.app.authManager) ? window.app.authManager.getStudentActiveGroup(currentUser, activeClassId) : { id: 'group_1', name: '第 1 协作小组' };
    const groupId = activeGroupObj.id || (currentUser && currentUser.groupId ? currentUser.groupId : 'group_1');
    const groupName = activeGroupObj.name || '第 1 协作小组';
    const currentTaskTitle = currentTask ? currentTask.title : (activeTaskId === 'task_default' ? '默认写作任务' : '协作写作任务');

    // 严格按【当前班级】、【当前任务】和【当前小组】三位一体过滤通知，彻底杜绝跨任务/跨小组干扰
    const relevantAnnouncements = (announcements || []).filter(a => {
      const matchClass = !a.classId || a.classId === 'all' || a.classId === activeClassId;
      const matchGroup = !a.targetGroupId || a.targetGroupId === 'all' || a.targetGroupId === groupId ||
        (Array.isArray(a.targetGroupIds) && (a.targetGroupIds.includes('all') || a.targetGroupIds.includes(groupId)));
      const matchTask = a.taskId === 'task_all' || a.taskId === activeTaskId || (!a.taskId && activeTaskId === 'task_default');
      return matchClass && matchGroup && matchTask;
    });
    const isAnnRead = (a) => {
      if (!a || !a.readStatus) return false;
      if (currentUser) {
        if (currentUser.id && a.readStatus[currentUser.id]) return true;
        if (currentUser.studentCode && a.readStatus[currentUser.studentCode]) return true;
        if (currentUser.username && a.readStatus[currentUser.username]) return true;
        if (currentUser.name && a.readStatus[currentUser.name]) return true;
        if (Array.isArray(a.confirmedMembers)) {
          if (a.confirmedMembers.some(m => m && (m.id === currentUser.id || m.studentCode === currentUser.studentCode || (currentUser.name && m.name === currentUser.name)))) return true;
        }
      }
      return false;
    };
    const unreadAnnCount = relevantAnnouncements.filter(a => !isAnnRead(a)).length;
    const isTaskDeadlineExpired = isTaskExpired(currentTask);
    const isFinalSubmitted = state.isFinalSubmitted || isTaskDeadlineExpired;

    const stageOrder = { stage1: 1, stage2: 2, stage3: 3 };
    const currentMaxOrder = stageOrder[state.groupMaxStage || 'stage1'] || 1;
    const isContractSigned = !!(state.stage1?.contract?.signed || (Array.isArray(state.stage1?.contract?.confirmedMembers) && state.stage1.contract.confirmedMembers.length > 0));
    // 🌟 截止后三个阶段全部解锁，允许学生自由切换查阅回看；未截止时必须签署公约才解锁阶段二
    const isS2Locked = !isTaskDeadlineExpired && (!isContractSigned && currentMaxOrder < 2);
    const isS3Locked = !isTaskDeadlineExpired && currentMaxOrder < 3;

    header.innerHTML = `
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
        <button class="nav-ann-bell-btn ${unreadAnnCount > 0 ? 'has-unread' : ''}" id="btn-header-ann-bell" title="课堂通知" style="padding:3px 8px; border-radius:14px; font-size:11px;">
          🔔 消息 ${unreadAnnCount > 0 ? `<span class="unread-count">${unreadAnnCount}</span>` : ''}
        </button>
        <div class="timer-box" style="padding:2px 10px; border-radius:14px; font-size:11.5px; font-weight:700; white-space:nowrap; background:${isTaskDeadlineExpired ? '#fef2f2' : '#eff6ff'}; color:${isTaskDeadlineExpired ? '#dc2626' : '#1d4ed8'}; border:1px solid ${isTaskDeadlineExpired ? '#fecaca' : '#bfdbfe'};">
          ${isTaskDeadlineExpired ? '🛑 已截止' : `⏱️ 剩余 ${formatDurationHuman(remainingMin, true)}`}
        </div>
        <button id="btn-user-logout" style="background:#fef2f2; color:#dc2626; border:1px solid #fecaca; padding:3px 8px; border-radius:14px; font-size:11px; font-weight:700; cursor:pointer;" title="退出登录">🚪 退出</button>
      </div>
    `;

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

  function renderCanvas(state, handlers) {
    const canvas = document.getElementById('canvas-panel');
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

    let quillInstance = null;
    const QuillClass = window.Quill;

    if (QuillClass) {
      try {
        // 🔤 注册 Inline Style Attributors，完美支持任意中文字体与像素字号
        const FontStyle = QuillClass.import('attributors/style/font');
        if (FontStyle) { FontStyle.whitelist = null; QuillClass.register(FontStyle, true); }
        const SizeStyle = QuillClass.import('attributors/style/size');
        if (SizeStyle) { SizeStyle.whitelist = null; QuillClass.register(SizeStyle, true); }
        const AlignStyle = QuillClass.import('attributors/style/align');
        if (AlignStyle) { QuillClass.register(AlignStyle, true); }
        const ColorStyle = QuillClass.import('attributors/style/color');
        if (ColorStyle) { QuillClass.register(ColorStyle, true); }
        const BgStyle = QuillClass.import('attributors/style/background');
        if (BgStyle) { QuillClass.register(BgStyle, true); }
      } catch (e) {}
    }

    if (QuillClass && !isReadonly) {
      try {
        if (!editor.classList.contains('ql-container')) {
          quillInstance = new QuillClass(editor, {
            theme: 'snow',
            modules: {
              toolbar: false
            }
          });

          window._jizhi_quill = quillInstance;

          quillInstance.on('text-change', (delta, oldDelta, source) => {
            const cleanHtml = quillInstance.root.innerHTML;
            if (onChangeCallback) onChangeCallback(cleanHtml);
          });
        }
      } catch (err) {
        console.warn('[Quill Initialization Error]:', err);
      }
    }

    if (!isReadonly) {
      let lastSavedRange = null;
      if (quillInstance) {
        quillInstance.on('selection-change', (range) => {
          if (range) lastSavedRange = range;
        });
      }

      // 🛡️ 核心保障：阻止工具栏按钮点击时的默认失焦事件，完美锁定用户选区
      container.querySelectorAll('.word-toolbar button').forEach(btn => {
        btn.addEventListener('mousedown', (e) => {
          e.preventDefault();
        });
      });

      const exec = (cmd, val = null) => {
        if (quillInstance) {
          let range = quillInstance.getSelection() || lastSavedRange;
          if (!range) {
            quillInstance.focus();
            range = quillInstance.getSelection() || { index: Math.max(0, quillInstance.getLength() - 1), length: 0 };
          }

          if (range) {
            quillInstance.setSelection(range.index, range.length);
          }

          const currentFormat = (range ? quillInstance.getFormat(range) : {}) || {};
          if (cmd === 'bold') quillInstance.format('bold', !currentFormat.bold);
          else if (cmd === 'italic') quillInstance.format('italic', !currentFormat.italic);
          else if (cmd === 'underline') quillInstance.format('underline', !currentFormat.underline);
          else if (cmd === 'strikeThrough') quillInstance.format('strike', !currentFormat.strike);
          else if (cmd === 'superscript') quillInstance.format('script', currentFormat.script === 'super' ? false : 'super');
          else if (cmd === 'subscript') quillInstance.format('script', currentFormat.script === 'sub' ? false : 'sub');
          else if (cmd === 'justifyLeft') quillInstance.format('align', false);
          else if (cmd === 'justifyCenter') quillInstance.format('align', 'center');
          else if (cmd === 'justifyRight') quillInstance.format('align', 'right');
          else if (cmd === 'justifyFull') quillInstance.format('align', 'justify');
          else if (cmd === 'indent') quillInstance.format('indent', '+1');
          else if (cmd === 'outdent') quillInstance.format('indent', '-1');
          else if (cmd === 'insertUnorderedList') quillInstance.format('list', currentFormat.list === 'bullet' ? false : 'bullet');
          else if (cmd === 'insertOrderedList') quillInstance.format('list', currentFormat.list === 'ordered' ? false : 'ordered');
          else if (cmd === 'formatBlock') {
            const level = (val || '').toLowerCase().replace('h', '');
            quillInstance.format('header', isNaN(level) || level === '' ? false : parseInt(level, 10));
          }
          else if (cmd === 'fontName') quillInstance.format('font', val || false);
          else if (cmd === 'fontSize') quillInstance.format('size', val || false);
          else if (cmd === 'foreColor') quillInstance.format('color', val || false);
          else if (cmd === 'hiliteColor') quillInstance.format('background', val || false);
          else if (cmd === 'undo') quillInstance.history.undo();
          else if (cmd === 'redo') quillInstance.history.redo();
          else if (cmd === 'removeFormat') {
            if (range && range.length > 0) quillInstance.removeFormat(range.index, range.length);
          }
          else if (cmd === 'insertHTML') {
            quillInstance.clipboard.dangerouslyPasteHTML(range ? range.index : quillInstance.getLength(), val);
          }
          quillInstance.focus();
          if (onChangeCallback) onChangeCallback(quillInstance.root.innerHTML);
        } else {
          document.execCommand(cmd, false, val);
          editor.focus();
          if (onChangeCallback) onChangeCallback(editor.innerHTML);
        }
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
              const studentCode = currentUser ? (currentUser.studentCode || currentUser.id || 'A') : 'A';
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
        const gid = activeGroup?.id || state.activeMonitorGroupId || 'group_1';
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
    // 🛡️ 焦点保护：记录当前正在打字的输入框与光标位置，防止短轮询重绘导致失焦与吞字
    const activeEl = canvas.querySelector('input:focus, textarea:focus');
    const activeKey = activeEl ? (activeEl.id || activeEl.dataset.key || activeEl.dataset.mkey) : null;
    const activeVal = activeEl ? activeEl.value : null;
    const activeCursor = activeEl ? activeEl.selectionStart : null;

    const s1 = state.stage1;
    const currentUser = state.currentUser;
    const currUserObj = (window.app && window.app.authManager) ? window.app.authManager.getCurrentUser() : null;
    const allUsers = (window.app && window.app.authManager) ? window.app.authManager.getUsers() : [];
    const membersList = Object.values(state.members || {});
    const totalMembersCount = membersList.length;

    if (!s1.contract.taskAssignments) s1.contract.taskAssignments = {};
    if (!s1.contract.timeAllocations) s1.contract.timeAllocations = {};

    const allTasks = (window.app && window.app.authManager) ? window.app.authManager.getTasks() : [];
    const currentTask = allTasks.find(t => t.id === state.activeTaskId);
    const isTaskDeadlineExpired = isTaskExpired(currentTask);

    // 🛡️ 稳健的多标识判定辅助函数（零破坏底层存储结构，仅在名单比对时精准去重）
    const isMemberDone = (map, m) => {
      if (!map || !m) return false;
      return !!(map[m.id] || map[m.studentCode] || map[m.username] || (m.name && map[m.name]));
    };

    const confirmedMembers = s1.contract.confirmedMembers || {};
    const confirmedCount = membersList.filter(m => isMemberDone(confirmedMembers, m)).length;
    const userHasConfirmed = isMemberDone(confirmedMembers, { id: currentUser, studentCode: currUserObj?.studentCode, username: currUserObj?.username, name: currUserObj?.name });

    // 🛡️ 真正的公约生效锁定判定：必须是真实签署人数 >= 组员总人数（且总人数 > 0），或全盘已提交/任务已截止
    const isAllConfirmed = (totalMembersCount > 0 && confirmedCount >= totalMembersCount);
    const isContractLocked = isAllConfirmed || state.isFinalSubmitted || isTaskDeadlineExpired;
    if (s1.contract) s1.contract.isConfirmed = isAllConfirmed;

    const userHasVoted = isMemberDone(s1.hasVoted, { id: currentUser, studentCode: currUserObj?.studentCode, username: currUserObj?.username, name: currUserObj?.name });
    const userVotedProposalId = s1.votes ? (s1.votes[currentUser] || (currUserObj && (s1.votes[currUserObj.id] || s1.votes[currUserObj.studentCode] || (currUserObj.name && s1.votes[currUserObj.name])))) : null;

    // 严格统计全组实际已投票人数
    const totalVotesCast = membersList.filter(m => isMemberDone(s1.hasVoted, m)).length;
    const isVotingComplete = (totalMembersCount > 0 && totalVotesCast >= totalMembersCount);

    // 严密判断当前登录学生是否已提交提案 (支持 id, studentCode, username, 姓名多重比对)
    const myIds = new Set([currentUser, currUserObj?.id, currUserObj?.studentCode, currUserObj?.username, currUserObj?.name].filter(Boolean));
    const hasSubmittedMyProposal = s1.proposals.some(p => myIds.has(p.author) || (currUserObj && (p.authorName === currUserObj.name || p.author === currUserObj.name)));
    const currentUserName = currUserObj ? currUserObj.name : (state.members[currentUser] ? state.members[currentUser].name : '组员');

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
            <span style="font-size:12px; color:#2563eb; background:#eff6ff; padding:2px 8px; border-radius:10px; border:1px solid #bfdbfe;">
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
                  const v = s1.votes[m.studentCode] || s1.votes[m.id] || s1.votes[m.username] || (m.name && s1.votes[m.name]);
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
                const authorUser = allUsers.find(u => u.id === p.author || u.studentCode === p.author || u.username === p.author || u.name === p.author || u.name === p.authorName);
                const authorName = (authorUser ? authorUser.name : null) || p.authorName || (state.members[p.author] ? state.members[p.author].name : p.author);
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
            ${isContractLocked ? `<span style="color:#059669; font-weight:700;">🔒 全员 ${confirmedCount}/${totalMembersCount} 人完成签署 · 归档生效中</span>` : '小组成员在研讨区商讨后，可提炼生成或自由微调各项内容，全员确认后签署生效'}
          </div>
          ${!isContractLocked ? `
            <div style="margin-top:12px; display:flex; justify-content:center;">
              <button id="btn-generate-contract-draft" style="background:linear-gradient(135deg, #7c3aed, #6d28d9); border:none; color:white; padding:8px 20px; border-radius:20px; font-weight:700; font-size:13px; cursor:pointer; display:inline-flex; align-items:center; gap:6px; box-shadow:0 3px 12px rgba(124,58,237,0.25);">
                🤖 研讨差不多了？一键提炼研讨共识生成公约草案
              </button>
            </div>
          ` : ''}
        </div>

        <div style="display:flex; flex-direction:column; gap:8px; width:100%; margin-bottom:20px; background:#eff6ff; padding:16px; border-radius:12px; border:1px solid #bfdbfe; box-sizing:border-box;">
          <label style="font-size:14px; font-weight:800; color:#1e40af;">📌 确认融合论文研究主题:</label>
          <input type="text" id="contract-topic-input" class="large-contract-input" data-lock-key="topic_title" value="${s1.mergedTitle || ''}" placeholder="在此处输入研究方案最终主题..." ${isContractLocked ? 'disabled readonly style="opacity:0.8; cursor:not-allowed;"' : ''} style="width:100%; box-sizing:border-box; background:#ffffff; color:#0f172a; border:1px solid #cbd5e1; border-radius:8px; padding:12px 14px; font-size:14px; font-weight:700; font-family:sans-serif;">
        </div>

        <div style="display:flex; flex-direction:column; gap:16px; width:100%;">
          <!-- 6大研究设计方案模块与时间规划 -->
          <div style="background:#f8fafc; padding:18px; border-radius:12px; border:1px solid #bfdbfe; width:100%; box-sizing:border-box;">
            <div style="font-weight:800; color:#1e40af; margin-bottom:14px; font-size:14px;">
              📚 研究方案核心模块与时间规划:
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

        <div style="margin-top:16px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:14px 18px; width:100%; box-sizing:border-box;">
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

        <div style="margin-top:20px; text-align:center;">
          <button id="btn-confirm-contract" ${isContractLocked ? 'disabled' : ''} style="background:${isContractLocked ? '#ecfdf5' : userHasConfirmed ? '#eff6ff' : 'linear-gradient(135deg, #059669, #047857)'}; border:1px solid ${isContractLocked ? '#a7f3d0' : userHasConfirmed ? '#bfdbfe' : 'transparent'}; color:${isContractLocked ? '#059669' : userHasConfirmed ? '#1d4ed8' : 'white'}; padding:13px 32px; border-radius:10px; font-weight:800; cursor:${isContractLocked ? 'not-allowed' : 'pointer'}; font-size:14.5px; box-shadow:0 3px 12px rgba(5,150,105,0.25);">
            ${isContractLocked ? '🔒 学术合作合约已全员签署生效并锁定 (只读归档查阅)' : userHasConfirmed ? `✅ 我 (${currentUserName}) 已按键确认签署 (${confirmedCount}/${totalMembersCount} 人已完成)` : `✍️ 我以 (${currentUserName}) 身份按键确认签署合约 (已确认 ${confirmedCount}/${totalMembersCount} 人)`}
          </button>
        </div>

      </div>
    `;

    // 提案提交弹窗绑定 (支持新提交与修改已有选题，每人严格限制 1 个提案)
    const btnOpenProp = canvas.querySelector('#btn-open-submit-proposal');
    if (btnOpenProp) {
      btnOpenProp.addEventListener('click', () => {
        document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
        const existingProp = s1.proposals.find(p => myIds.has(p.author) || (currUserObj && (p.authorName === currUserObj.name || p.author === currUserObj.name)));
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

          const existingIdx = s1.proposals.findIndex(p => myIds.has(p.author) || (currUserObj && (p.authorName === currUserObj.name || p.author === currUserObj.name)));
          const nowMs = Date.now();
          if (existingIdx >= 0) {
            // 已有提案：更新标题与修改时间戳（保持每人 1 份，时间戳最新）
            s1.proposals[existingIdx].title = title;
            s1.proposals[existingIdx].authorName = currentUserName;
            s1.proposals[existingIdx].updatedAt = nowMs;
          } else {
            s1.proposals.push({
              id: 'prop_' + currentUser + '_' + nowMs,
              author: currentUser,
              authorName: currentUserName,
              title: title,
              updatedAt: nowMs
            });
          }

          const currentStage = state.currentStage;
          let memberArr = [];
          if (Array.isArray(state.members)) {
            memberArr = state.members;
          } else if (state.members && typeof state.members === 'object') {
            memberArr = Object.values(state.members);
          }
          if (memberArr.length === 0 && window.app?.authManager) {
            const u = window.app.authManager.getCurrentUser();
            const effClassId = window.app.state.activeStudentClassId || u?.classId || 'class_101';
            const effGroup = window.app.authManager.getStudentActiveGroup(u, effClassId);
            memberArr = window.app.authManager.getGroupMembersForWorkspace(effGroup?.id || 'group_1');
          }

          const memObj = memberArr.find(m => m && (m.id === currentUser || m.studentCode === currentUser || m.realStudentCode === currentUser || m.username === currentUser || m.name === currentUser));
          const authorName = memObj ? memObj.name : (currentUser || '组员');
          const totalMembersCount = memberArr.length > 0 ? memberArr.length : 0;
          const submittedAuthorsCount = new Set((s1.proposals || []).map(p => p.author || p.authorName)).size;

          const submitNoticeMsg = {
            sender: currentUser,
            senderName: authorName,
            text: `💡 【新选题提出】我 (${authorName}) 提出了新选题提案《${title}》！`,
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
          }

          setTimeout(async () => {
            const isModify = existingIdx >= 0;
            const evalPrompt = isModify
              ? `小组成员【${authorName}】在学术拍卖会上修改了选题提案，最新题目为《${title}》。请作为资深学术拍卖师，通读其学科场景与研究构想，给出 120~150 字充实针对性的学术点评：若提案内容充实，先明确肯定其最出彩的 1~2 个具体优点，再顺势提出 1 个具体启发性落地建议；若提案仅有无意义字符、重复堆砌或过于空泛（无法体现研究问题/方法设想/预期价值），严禁盲目肯定，应如实指出「内容还需再充实」并引导补充至少一个具体的研究问题或方法设想（严禁空泛套话，纯自然语言输出）！`
              : `小组成员【${authorName}】在学术拍卖会上提交了新选题提案《${title}》。请作为资深学术拍卖师，通读其学科场景与研究构想，给出 120~150 字充实针对性的学术点评：若提案内容充实，先明确肯定其最出彩的 1~2 个具体优点，再顺势提出 1 个具体启发性落地建议；若提案仅有无意义字符、重复堆砌或过于空泛（无法体现研究问题/方法设想/预期价值），严禁盲目肯定，应如实指出「内容还需再充实」并引导补充至少一个具体的研究问题或方法设想（严禁空泛套话，纯自然语言输出）！`;

            let evalText = await callCozeAgentAPI('auctioneer', evalPrompt, { stage: 'stage1', proposalTitle: title, author: authorName, topic: title });
            if (!evalText || evalText.trim().length === 0) {
              evalText = `⚠️ 【拍卖师提示】：大模型提案评估生成超时或网络稍有延迟，可稍后在讨论区发送"@拍卖师 请评估选题《${title}》"重新获取。`;
            }

            const auctioneerEvalMsg = {
              sender: 'auctioneer',
              senderName: '头脑风暴 · 学术拍卖师',
              text: evalText,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              _timeMs: Date.now()
            };
            state.chatLogs[currentStage].push(auctioneerEvalMsg);

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
                sender: 'auctioneer',
                senderName: '头脑风暴 · 学术拍卖师',
                text: `🎪 【拍卖师·全员提案已集齐】：🎉 小组全部 ${totalMembersCount} 位成员的选题提案已悉数亮相并完成评估！\n👉 请大家先不要急于投票，先在右侧协同对话区商讨交流各个方案的研究切入点与创新亮点；\n💬 充分研讨达成初步共识后，再在上方为最终认可的方案进行投票！`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                _timeMs: Date.now() + 100
              };
              state.chatLogs[currentStage].push(allCollectedMsg);
            }

            if (window.app) {
              window.app.syncChatLogs();
              if (window.app.cloudSyncEngine) window.app.cloudSyncEngine.pushSnapshot();
              renderChat(state);
            }
          }, 500);
        });
      });
    }

    const getLockPayload = (fieldKey, value = null) => {
      const currUser = (window.app && window.app.authManager) ? window.app.authManager.getCurrentUser() : null;
      const isTeacher = currUser && (currUser.role === 'teacher' || currUser.isTeacher);
      const effectiveClassId = (isTeacher ? window.app?.state.activeClassId : window.app?.state.activeStudentClassId) || (currUser?.classId || 'class_101');
      const activeGroupObj = window.app?.authManager ? window.app.authManager.getStudentActiveGroup(currUser, effectiveClassId) : null;
      const curGid = activeGroupObj?.id || (currUser?.groupId || 'group_1');
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

      fetch(`sync.php?action=lock_field&groupId=${encodeURIComponent(p.groupId)}&taskId=${encodeURIComponent(p.taskId)}&classId=${encodeURIComponent(p.classId || 'class_101')}`, {
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

      fetch(`sync.php?action=unlock_field&groupId=${encodeURIComponent(p.groupId)}&taskId=${encodeURIComponent(p.taskId)}&classId=${encodeURIComponent(p.classId || 'class_101')}`, {
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
              const effectiveClassId = window.app.state.activeStudentClassId || (currUser?.classId || 'class_101');
              const activeGroupObj = window.app.authManager ? window.app.authManager.getStudentActiveGroup(currUser, effectiveClassId) : null;
              const curGid = activeGroupObj?.id || (currUser?.groupId || 'group_1');
              fetch('sync.php?action=patch_contract_field', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  taskId: window.app.state.activeTaskId || 'task_default',
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
            const effectiveClassId = window.app.state.activeStudentClassId || (currUser?.classId || 'class_101');
            const activeGroupObj = window.app.authManager ? window.app.authManager.getStudentActiveGroup(currUser, effectiveClassId) : null;
            const curGid = activeGroupObj?.id || (currUser?.groupId || 'group_1');
            fetch('sync.php?action=patch_contract_field', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                taskId: window.app.state.activeTaskId || 'task_default',
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
      const btnGenDraft = canvas.querySelector('#btn-generate-contract-draft');
      if (btnGenDraft) {
        btnGenDraft.addEventListener('click', () => {
          if (handlers.onAiGenerateContract) handlers.onAiGenerateContract();
        });
      }

      canvas.querySelector('#btn-confirm-contract').addEventListener('click', () => {
        s1.contract._lastSignTime = Date.now();
        const currUser = (window.app && window.app.authManager) ? window.app.authManager.getCurrentUser() : null;
        const myCode = state.currentUser || (currUser ? currUser.studentCode : 'A');
        const effectiveClassId = window.app.state.activeStudentClassId || (currUser?.classId || 'class_101');
        const activeGroupObj = window.app.authManager ? window.app.authManager.getStudentActiveGroup(currUser, effectiveClassId) : null;
        const curGid = activeGroupObj?.id || (currUser?.groupId || 'group_1');

        fetch('sync.php?action=patch_contract_field', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskId: state.activeTaskId || 'task_default',
            groupId: curGid,
            field: 'sign_member',
            subKey: myCode,
            value: true
          })
        }).catch(() => {});

        handlers.onConfirmContract();
      });
    }

    // 🛡️ 恢复之前正在打字的输入框焦点与光标，平滑无感
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
    const s2 = state.stage2;
    const actionPlan = s2.actionPlan;
    const isStage2MeetingLocked = state.currentStage === 'stage3' || state.isFinalSubmitted;
    const allTasks = (window.app && window.app.authManager) ? window.app.authManager.getTasks() : [];
    const currentTask = allTasks.find(t => t.id === state.activeTaskId);
    const isTaskDeadlineExpired = isTaskExpired(currentTask);
    const isEditorReadonly = state.isFinalSubmitted || isTaskDeadlineExpired;
    const membersList = Object.values(state.members || {});
    const plainTextLen = (s2.unifiedContent || '').replace(/<[^>]*>/g, '').trim().length;

    const currUser = (window.app && window.app.authManager) ? window.app.authManager.getCurrentUser() : null;
    const userClassId = state.activeStudentClassId || (currUser ? currUser.classId : null) || 'class_101';
    const activeGroupObj = (window.app && window.app.authManager) ? window.app.authManager.getStudentActiveGroup(currUser, userClassId) : null;
    const userGroupId = activeGroupObj?.id || (window.app?.cloudSyncEngine?.groupId) || (currUser?.groupId) || 'group_1';
    let activeTaskId = state.activeTaskId || (window.app?.cloudSyncEngine?.taskId) || (`task_${userClassId}_default`);
    if (!activeTaskId || activeTaskId === 'task_default') activeTaskId = `task_${userClassId}_default`;
    const availablePapers = (window.app && window.app.authManager) ? window.app.authManager.getReferencePapers(userGroupId, userClassId, activeTaskId) : [];
    const paperBtnLabel = availablePapers.length > 0 ? `📚 查阅参考范文 (${availablePapers.length}篇)` : '📚 查阅参考范文库';

    const confirmedDraftMap = s2.confirmedMembers || {};
    const confirmedDraftCount = membersList.filter(m => confirmedDraftMap[m.id] || confirmedDraftMap[m.studentCode]).length;
    const totalCount = membersList.length || 3;
    const currUserCode = state.currentUser || (currUser ? currUser.studentCode : 'A');
    const isUserDraftConfirmed = !!(confirmedDraftMap[currUserCode] || (currUser && confirmedDraftMap[currUser.id]));
    const isDraftFullyConfirmed = s2.isDraftConfirmed || (confirmedDraftCount >= totalCount && totalCount > 0);

    // 🛡️ 极致单例保护：若富文本编辑器已经在当前画布上活跃运行，严禁 innerHTML 销毁重绘！
    const existingEditorEl = canvas.querySelector('#stage2-word-editor.ql-container');
    if (existingEditorEl) {
      renderPresencePills('stage2-word-editor', state);
      const draftCountBadge = canvas.querySelector('#stage2-draft-count-text');
      if (draftCountBadge) {
        draftCountBadge.innerText = isDraftFullyConfirmed ? '✅ 全员已确认完成初稿' : `${confirmedDraftCount}/${totalCount} 人已确认`;
        draftCountBadge.style.color = isDraftFullyConfirmed ? '#059669' : '#2563eb';
      }
      const btnDraft = canvas.querySelector('#btn-confirm-stage2-draft');
      if (btnDraft) {
        btnDraft.disabled = isUserDraftConfirmed || isEditorReadonly;
        btnDraft.innerText = isUserDraftConfirmed ? '✅ 您已确认完成初稿' : '✍️ 确认完成正文初稿';
        btnDraft.style.background = isUserDraftConfirmed ? '#f1f5f9' : 'linear-gradient(135deg, #059669, #047857)';
      }
      return;
    }

    canvas.innerHTML = `
      ${isTaskDeadlineExpired ? `
        <div style="background:#fef2f2; border:1.5px solid #fca5a5; border-radius:8px; padding:6px 14px; margin-bottom:12px; font-size:12.5px; color:#991b1b; font-weight:600; display:flex; justify-content:space-between; align-items:center; gap:12px; box-shadow:0 2px 6px rgba(239,68,68,0.08); height:38px; box-sizing:border-box; flex-shrink:0;">
          <div style="display:flex; align-items:center; gap:8px; min-width:0; flex:1; overflow:hidden; white-space:nowrap; text-overflow:ellipsis;">
            <span style="font-size:15px; flex-shrink:0;">🔒</span>
            <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"><b>任务已截止锁定：</b> 本任务已于 <b>${currentTask?.deadline || '截止时间'}</b> 截止，写作正文已自动转为<b>【只读模式】</b>。如需继续编辑请联系教师延长时间。</span>
          </div>
          <span style="font-size:11.5px; color:#ffffff; background:#dc2626; padding:2px 8px; border-radius:4px; font-weight:800; flex-shrink:0; letter-spacing:0.5px;">已截止</span>
        </div>
      ` : ''}

      ${isStage2MeetingLocked ? `
        <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:10px 14px; margin-bottom:10px; font-size:13px; color:#1d4ed8; font-weight:700; display:flex; justify-content:space-between; align-items:center; flex-shrink:0;">
          <span>🔒 阶段二【半程编辑会议】打分与修正清单已完成并锁定 ${isEditorReadonly ? '· 全盘终稿已提交只读查阅' : '· 可随时回看'}</span>
          <span style="font-size:11.5px; color:#1e40af; background:#ffffff; border:1px solid #bfdbfe; padding:4px 8px; border-radius:4px;">归档只读</span>
        </div>
      ` : ''}

      <div class="card" style="height:100%; display:flex; flex-direction:column; padding:16px 18px 24px 18px; box-sizing:border-box; overflow-y:auto;">
        <div class="card-title" style="margin-bottom:10px; display:flex; justify-content:space-between; align-items:center; flex-shrink:0;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:15px; font-weight:800; color:#0f172a;">📝 学术协作富文本编辑器 (对标 Word 学术论文规范)</span>
            <span style="font-size:12px; color:#2563eb; background:#eff6ff; padding:2px 8px; border-radius:10px; border:1px solid #bfdbfe;">字数: <b id="stage2-word-count-num">${plainTextLen}</b> 字</span>
          </div>
          <div style="display:flex; gap:8px;">
            <button id="btn-show-case" style="background:#eff6ff; border:1px solid #bfdbfe; color:#1d4ed8; padding:6px 12px; border-radius:6px; font-size:12px; cursor:pointer; font-weight:700;">${paperBtnLabel}</button>
            <button id="btn-trigger-meeting" ${isStage2MeetingLocked ? 'disabled' : ''} style="background:${isStage2MeetingLocked ? '#f1f5f9' : 'linear-gradient(135deg, #2563eb, #1d4ed8)'}; border:${isStage2MeetingLocked ? '1px solid #cbd5e1' : 'none'}; color:${isStage2MeetingLocked ? '#94a3b8' : 'white'}; padding:6px 14px; border-radius:6px; font-size:12px; cursor:${isStage2MeetingLocked ? 'not-allowed' : 'pointer'}; font-weight:700; box-shadow:${isStage2MeetingLocked ? 'none' : '0 3px 10px rgba(37,99,235,0.25)'};">
              ${isStage2MeetingLocked ? '🔒 编辑会议已结束' : '📢 发起【编辑会议】'}
            </button>
          </div>
        </div>

        ${actionPlan && actionPlan.isGenerated ? `
          <div id="stage2-action-plan-card" style="background:#ecfdf5; border:1px solid #a7f3d0; border-radius:10px; padding:10px 16px; margin-bottom:10px; transition:all 0.2s ease; flex-shrink:0; box-shadow:0 2px 6px rgba(5,150,105,0.06);">
            <div style="display:flex; justify-content:space-between; align-items:center; cursor:pointer;" id="btn-toggle-action-plan">
              <div style="font-size:13px; font-weight:800; color:#059669; display:flex; align-items:center; gap:6px;">
                <span>📋 【半程修正清单】(审稿专家下发 3 项修改要求)</span>
                <span style="font-size:11px; background:#d1fae5; color:#065f46; padding:1px 8px; border-radius:10px; font-weight:700;">已生成</span>
              </div>
              <span id="icon-toggle-action-plan" style="font-size:11.5px; color:#059669; font-weight:700;">▲ 收起</span>
            </div>
            <div id="body-action-plan-items" style="font-size:12.5px; color:#1e293b; display:flex; flex-direction:column; gap:8px; margin-top:8px;">
              ${actionPlan.items.map((item, idx) => {
                // 针对第 2 项如果含有多子项（理论/假设/方法），进行结构化美化渲染
                let formattedItem = escapeHtml(item);
                formattedItem = formattedItem
                  .replace(/(?:•\s*|【)?理论与综述层(?:】)?[:：]?/g, '<span style="display:inline-block; background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe; padding:1px 6px; border-radius:4px; font-weight:700; font-size:11.5px; margin-right:4px;">📚 理论与综述层</span>')
                  .replace(/(?:•\s*|【)?假设与(?:问题|机制)层(?:】)?[:：]?/g, '<span style="display:inline-block; background:#faf5ff; color:#7c3aed; border:1px solid #e9d5ff; padding:1px 6px; border-radius:4px; font-weight:700; font-size:11.5px; margin-right:4px;">🔗 假设与机制层</span>')
                  .replace(/(?:•\s*|【)?方法与量表层(?:】)?[:：]?/g, '<span style="display:inline-block; background:#ecfdf5; color:#059669; border:1px solid #a7f3d0; padding:1px 6px; border-radius:4px; font-weight:700; font-size:11.5px; margin-right:4px;">📐 方法与量表层</span>');

                return `
                  <div style="line-height:1.6; background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:8px 12px; box-shadow:0 1px 3px rgba(0,0,0,0.02);">
                    <b style="color:#0f172a; margin-right:4px;">${idx + 1}.</b> ${formattedItem}
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        ` : (() => {
          const subs = s2.meetingSubmissions || {};
          const subCount = Object.keys(subs).length;
          const isSelfDone = subCount >= totalCount;
          return `
            <div id="stage2-action-plan-card" style="background:#f8fafc; border:1px dashed #cbd5e1; border-radius:8px; padding:8px 14px; margin-bottom:8px; flex-shrink:0;">
              <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
                <div style="font-size:12px; font-weight:700; color:#64748b; display:flex; align-items:center; gap:6px;">
                  <span>📋 【半程修正清单】</span>
                  <span style="font-size:10.5px; background:${isSelfDone ? '#ecfdf5' : subCount > 0 ? '#dbeafe' : '#e2e8f0'}; color:${isSelfDone ? '#059669' : subCount > 0 ? '#1d4ed8' : '#475569'}; padding:1px 8px; border-radius:10px; font-weight:700;">
                    ${isSelfDone ? `待解锁: 组内针对自查分歧研讨对齐中 (审稿专家质检后生成)` : (subCount > 0 ? `待解锁 (全员自查进度 ${subCount}/${totalCount}人)` : `待解锁 (0/${totalCount}人)`)}
                  </span>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                  <span style="font-size:11px; color:#94a3b8;">（全员自查并完成分歧研讨后，由审稿专家质检下发）</span>
                </div>
              </div>
            </div>
          `;
        })()}

        <!-- 全员确认完成初稿状态条 -->
        <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:8px 14px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; box-shadow:0 1px 3px rgba(15,23,42,0.04); flex-wrap:wrap; gap:8px;">
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <span style="font-size:12.5px; font-weight:800; color:#0f172a;">✍️ 正文初稿确认进度:</span>
            <span style="font-size:11.5px; font-weight:800; color:${isDraftFullyConfirmed ? '#059669' : '#2563eb'}; background:${isDraftFullyConfirmed ? '#d1fae5' : '#eff6ff'}; padding:2px 10px; border-radius:12px; border:1px solid ${isDraftFullyConfirmed ? '#a7f3d0' : '#bfdbfe'};">
              ${isDraftFullyConfirmed ? '✅ 全员已确认完成初稿' : `${confirmedDraftCount}/${totalCount} 人已确认`}
            </span>
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
              ${membersList.map(m => {
                const isConf = confirmedDraftMap[m.id] || confirmedDraftMap[m.studentCode];
                return `<span style="font-size:11px; padding:1px 8px; border-radius:10px; font-weight:700; background:${isConf ? '#ecfdf5' : '#f1f5f9'}; color:${isConf ? '#059669' : '#94a3b8'}; border:1px solid ${isConf ? '#a7f3d0' : '#e2e8f0'};">
                  ${isConf ? '✓' : '○'} ${m.name}
                </span>`;
              }).join('')}
            </div>
          </div>
          <div>
            <button id="btn-confirm-stage2-draft" ${isUserDraftConfirmed || isEditorReadonly ? 'disabled' : ''} style="background:${isUserDraftConfirmed ? '#f1f5f9' : 'linear-gradient(135deg, #059669, #047857)'}; border:${isUserDraftConfirmed ? '1px solid #cbd5e1' : 'none'}; color:${isUserDraftConfirmed ? '#059669' : 'white'}; padding:6px 14px; border-radius:6px; font-size:12px; font-weight:700; cursor:${isUserDraftConfirmed || isEditorReadonly ? 'default' : 'pointer'}; box-shadow:${isUserDraftConfirmed ? 'none' : '0 2px 8px rgba(5,150,105,0.25)'};">
              ${isUserDraftConfirmed ? '✅ 您已确认完成初稿' : '✍️ 确认完成正文初稿'}
            </button>
          </div>
        </div>

        <!-- Word-grade Academic Collaborative Etherpad OT Engine Body -->
        <div style="flex:1; min-height:480px; height:calc(100vh - 380px); display:flex; flex-direction:column; margin-bottom:12px;">
          ${(() => {
            const padName = `jizhi_${activeTaskId}_${userGroupId}`;
            const currUserName = (currUser && (currUser.name || currUser.username)) || '组员';
            const currUserColor = (state.members && state.members[currUserCode]?.color) || '#2563eb';
            const padUrl = `/p/${padName}?userName=${encodeURIComponent(currUserName)}&userColor=${encodeURIComponent(currUserColor)}&showChat=false&showLineNumbers=true&showControls=true`;

            return `
              <div class="word-editor-container" style="display:flex; flex-direction:column; height:100%; min-height:480px; border-radius:10px; overflow:hidden; border:1px solid #cbd5e1; box-shadow:0 4px 16px rgba(15,23,42,0.06); background:#ffffff;">
                <div id="ep-loading-helper-s2" style="display:flex; align-items:center; justify-content:space-between; background:#f8fafc; border-bottom:1px solid #e2e8f0; padding:4px 12px; font-size:11.5px; color:#64748b;">
                  <span>🟢 Etherpad 协同文档已就绪</span>
                  <button onclick="const f=document.getElementById('stage2-etherpad-frame'); if(f) f.src=f.src;" style="background:transparent; color:#2563eb; border:1px solid #cbd5e1; padding:2px 8px; border-radius:4px; font-size:11px; cursor:pointer; font-weight:600;">🔄 刷新编辑器</button>
                </div>
                <div style="flex:1; min-height:0; position:relative; background:#ffffff;">
                  <iframe id="stage2-etherpad-frame" src="${padUrl}" style="width:100%; height:100%; border:none; display:block; background:#ffffff;" allow="clipboard-read; clipboard-write"></iframe>
                </div>
              </div>
            `;
          })()}
        </div>

        <div style="background:#ffffff; padding:10px 16px; border-radius:8px; border:1px solid #cbd5e1; flex-shrink:0; display:flex; flex-direction:column; gap:6px; box-shadow:0 1px 3px rgba(15,23,42,0.04); margin-bottom:12px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:12px; font-weight:800; color:#1e293b;">📊 团队协作贡献度占比 (SSRL 群体过程感知):</span>
            <div class="contrib-labels" id="stage2-contrib-labels" style="display:flex; font-size:11.5px; font-weight:700; color:#475569; gap:12px; white-space:nowrap;">
              ${(() => {
                const contribs = s2.memberContributions || {};
                let rawTotal = 0;
                membersList.forEach(m => { rawTotal += (contribs[m.id] || 0) + (contribs[m.studentCode] || 0); });
                return membersList.map((m) => {
                  const rawVal = (contribs[m.id] || 0) + (contribs[m.studentCode] || 0);
                  const pct = rawTotal > 0 ? Math.round((rawVal / rawTotal) * 100) : 0;
                  return `<span style="color:${rawVal > 0 ? (m.color || '#2563eb') : '#94a3b8'}; font-weight:700;">● ${m.name}: ${pct}%</span>`;
                }).join('');
              })()}
            </div>
          </div>
          <div class="contrib-bars" id="stage2-contrib-bars" style="width:100%; height:10px; border-radius:5px; display:flex; overflow:hidden; background:#e2e8f0;">
            ${(() => {
              const contribs = s2.memberContributions || {};
              let rawTotal = 0;
              membersList.forEach(m => { rawTotal += (contribs[m.id] || 0) + (contribs[m.studentCode] || 0); });
              if (rawTotal === 0) {
                return `<div style="width:100%; height:10px; background:#f8fafc; border-radius:5px; display:flex; align-items:center; justify-content:center; font-size:10px; color:#94a3b8; font-weight:600;">⏳ 暂无协作投入 (组员在 Etherpad 中撰写、修改正文或研讨后将平滑累计真实贡献)</div>`;
              }
              return membersList.map((m) => {
                const rawVal = (contribs[m.id] || 0) + (contribs[m.studentCode] || 0);
                const pct = rawTotal > 0 ? Math.round((rawVal / rawTotal) * 100) : 0;
                return `<div class="contrib-segment" style="width:${pct}%; background:${m.color || '#2563eb'}; transition:width 0.8s ease-in-out;" title="${m.name}: ${pct}% (基于正文撰写与修改累计工作量)"></div>`;
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

    const btnTogglePlan = canvas.querySelector('#btn-toggle-action-plan');
    if (btnTogglePlan) {
      btnTogglePlan.addEventListener('click', () => {
        const bodyItems = canvas.querySelector('#body-action-plan-items');
        const iconToggle = canvas.querySelector('#icon-toggle-action-plan');
        if (bodyItems) {
          const isHidden = bodyItems.style.display === 'none';
          bodyItems.style.display = isHidden ? 'flex' : 'none';
          if (iconToggle) iconToggle.innerText = isHidden ? '▲ 收起' : '▼ 展开';
        }
      });
    }

    canvas.querySelector('#btn-show-case').addEventListener('click', () => handlers.onOpenCaseModal());
    if (!isStage2MeetingLocked) {
      canvas.querySelector('#btn-trigger-meeting').addEventListener('click', () => handlers.onOpenMeetingModal());
    }

    const btnConfirmDraft = canvas.querySelector('#btn-confirm-stage2-draft');
    if (btnConfirmDraft && !isUserDraftConfirmed && !isEditorReadonly) {
      btnConfirmDraft.addEventListener('click', () => {
        handlers.onConfirmStage2Draft();
      });
    }

    // 🚀 实时 Etherpad 真实字数提取与贡献比动态平滑更新
    if (window._stage2WordCountTimer) clearTimeout(window._stage2WordCountTimer);
    const padName = `jizhi_${activeTaskId}_${userGroupId}`;

    const updateContribDom = () => {
      const labelsEl = document.getElementById('stage2-contrib-labels');
      const barsEl = document.getElementById('stage2-contrib-bars');
      if (!labelsEl || !barsEl) return;

      const contribs = s2.memberContributions || {};
      let rawTotal = 0;
      membersList.forEach(m => { rawTotal += (contribs[m.id] || 0) + (contribs[m.studentCode] || 0); });

      labelsEl.innerHTML = membersList.map((m) => {
        const rawVal = (contribs[m.id] || 0) + (contribs[m.studentCode] || 0);
        const pct = rawTotal > 0 ? Math.round((rawVal / rawTotal) * 100) : 0;
        return `<span style="color:${rawVal > 0 ? (m.color || '#2563eb') : '#94a3b8'}; font-weight:700;">● ${m.name}: ${pct}%</span>`;
      }).join('');

      if (rawTotal === 0) {
        barsEl.innerHTML = `<div style="width:100%; height:10px; background:#f8fafc; border-radius:5px; display:flex; align-items:center; justify-content:center; font-size:10px; color:#94a3b8; font-weight:600;">⏳ 暂无协作投入 (组员在 Etherpad 中撰写、修改正文或研讨后将平滑累计真实贡献)</div>`;
      } else {
        barsEl.innerHTML = membersList.map((m) => {
          const rawVal = (contribs[m.id] || 0) + (contribs[m.studentCode] || 0);
          const pct = rawTotal > 0 ? Math.round((rawVal / rawTotal) * 100) : 0;
          return `<div class="contrib-segment" style="width:${pct}%; background:${m.color || '#2563eb'}; transition:width 0.8s ease-in-out;" title="${m.name}: ${pct}% (基于正文撰写与修改累计工作量)"></div>`;
        }).join('');
      }
    };

    let _padContentDebounceTimer = null;
    const syncPadMetrics = async () => {
      try {
        // 🚀 极轻量纯文本提取：耗时 < 0.1ms，体积 1KB，彻底杜绝服务器 Node.js CPU 波动
        const txtRes = await fetch(`/p/${padName}/export/txt`);
        if (txtRes.ok) {
          const cleanTxt = (await txtRes.text()).replace(/\r\n/g, '\n').trim();
          const wordCount = cleanTxt.length;

          // 实时更新字数角标
          const countBadge = document.getElementById('stage2-word-count-num');
          if (countBadge) countBadge.innerText = String(wordCount);

          const prevContent = state.stage2.unifiedContent || '';
          const hasContentChanged = (cleanTxt && cleanTxt !== prevContent);

          if (hasContentChanged) {
            state.stage2.unifiedContent = cleanTxt;
            if (_padContentDebounceTimer) clearTimeout(_padContentDebounceTimer);
            _padContentDebounceTimer = setTimeout(() => {
              if (window.app && typeof window.app.syncStage2 === 'function') {
                window.app.syncStage2();
              }
            }, 1500);
          }

          // 动态贡献度计算（仅当本人正在打字时向上报增量 delta）
          const prevLen = state.stage2._prevKnownLen !== undefined ? state.stage2._prevKnownLen : wordCount;
          state.stage2._prevKnownLen = wordCount;

          const isInputFocused = document.activeElement && document.activeElement.tagName === 'IFRAME';
          if (wordCount !== prevLen && isInputFocused) {
            const delta = Math.abs(wordCount - prevLen);
            if (delta > 0) {
              fetch(`sync.php?action=report_member_contrib&groupId=${encodeURIComponent(userGroupId)}&taskId=${encodeURIComponent(activeTaskId)}&classId=${encodeURIComponent(userClassId)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  taskId: activeTaskId,
                  classId: userClassId,
                  groupId: userGroupId,
                  userCode: currUserCode,
                  delta: delta
                })
              }).then(r => r.json()).then(res => {
                if (res.success && res.contribs) {
                  state.stage2.memberContributions = res.contribs;
                  updateContribDom();
                }
              }).catch(() => {});
            }
          } else {
            updateContribDom();
          }
        }
      } catch (e) {}
    };

    syncPadMetrics();
    if (window._stage2WordCountTimer) clearTimeout(window._stage2WordCountTimer);
    const getPadMetricInterval = () => (document.hidden ? 60000 : 15000);
    const scheduleNextPadMetric = () => {
      window._stage2WordCountTimer = setTimeout(() => {
        syncPadMetrics().finally(scheduleNextPadMetric);
      }, getPadMetricInterval());
    };
    scheduleNextPadMetric();
  }

  function renderStage3Canvas(canvas, state, handlers) {
    const s3 = state.stage3;
    const activeTab = s3.activeTab || 'defense';
    const membersList = Object.values(state.members || {});
    const totalCount = membersList.length || 3;
    const plainTextLen = (state.stage2.unifiedContent || '').replace(/<[^>]*>/g, '').trim().length;

    const currUser = (window.app && window.app.authManager) ? window.app.authManager.getCurrentUser() : null;
    const currUserCode = state.currentUser || (currUser ? currUser.studentCode : 'A');
    const confirmedRevMap = s3.confirmedMembers || {};
    const confirmedRevCount = membersList.filter(m => confirmedRevMap[m.id] || confirmedRevMap[m.studentCode]).length;
    const isUserRevisionConfirmed = !!(confirmedRevMap[currUserCode] || (currUser && confirmedRevMap[currUser.id]));
    const isRevisionFullyConfirmed = confirmedRevCount >= totalCount && totalCount > 0;
    const allTasks = (window.app && window.app.authManager) ? window.app.authManager.getTasks() : [];
    const currentTask = allTasks.find(t => t.id === state.activeTaskId);
    const isTaskDeadlineExpired = isTaskExpired(currentTask);
    const isFinalSubmitted = state.isFinalSubmitted || isTaskDeadlineExpired;

    canvas.innerHTML = `
      <div style="height:100%; display:flex; flex-direction:column; gap:12px;">
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
                <span>🔒 本组论文终稿与评估报告已成功归档提交至教师端！</span>
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
            <button id="tab-btn-editor" style="background:${activeTab === 'editor' ? 'linear-gradient(135deg, #059669, #047857)' : '#f1f5f9'}; border:none; color:${activeTab === 'editor' ? 'white' : '#475569'}; padding:8px 16px; border-radius:8px; font-weight:700; font-size:13px; cursor:pointer;">
              📝 修改论文终稿 (依据答辩意见完善正文)
            </button>
          </div>
          <div style="display:flex; gap:8px; align-items:center;">
            <button id="btn-confirm-stage3-revision" ${isUserRevisionConfirmed || isFinalSubmitted ? 'disabled' : ''} style="background:${isUserRevisionConfirmed ? '#f1f5f9' : 'linear-gradient(135deg, #2563eb, #1d4ed8)'}; border:${isUserRevisionConfirmed ? '1px solid #cbd5e1' : 'none'}; color:${isUserRevisionConfirmed ? '#2563eb' : 'white'}; padding:8px 14px; border-radius:8px; font-weight:700; font-size:12px; cursor:${isUserRevisionConfirmed || isFinalSubmitted ? 'default' : 'pointer'};">
              ${isUserRevisionConfirmed ? '✅ 您已确认修改终稿' : '📝 确认完成终稿修改'}
            </button>
            <button id="btn-final-submit" ${isFinalSubmitted ? 'disabled' : ''} style="background:${isFinalSubmitted ? '#ecfdf5' : 'linear-gradient(135deg, #059669, #047857)'}; border:${isFinalSubmitted ? '1px solid #a7f3d0' : 'none'}; color:${isFinalSubmitted ? '#059669' : 'white'}; padding:8px 18px; border-radius:8px; font-weight:700; cursor:${isFinalSubmitted ? 'not-allowed' : 'pointer'}; font-size:13px; box-shadow:${isFinalSubmitted ? 'none' : '0 3px 10px rgba(5,150,105,0.25)'};">
              ${isFinalSubmitted ? '🔒 论文终稿已成功提交 (归档只读)' : '🚀 提交论文终稿'}
            </button>
          </div>
        </div>

        <!-- 终稿修改确认进度提示 -->
        ${!isFinalSubmitted ? `
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:6px 14px; display:flex; justify-content:space-between; align-items:center; font-size:12px;">
            <span style="color:#475569; font-weight:700;">📝 终稿修改确认进度: <b style="color:${isRevisionFullyConfirmed ? '#059669' : '#2563eb'};">${confirmedRevCount}/${totalCount}</b> 人已确认修改完毕</span>
            <div style="display:flex; gap:6px;">
              ${membersList.map(m => {
                const isConf = confirmedRevMap[m.id] || confirmedRevMap[m.studentCode];
                return `<span style="font-size:11px; padding:1px 8px; border-radius:10px; font-weight:700; background:${isConf ? '#ecfdf5' : '#ffffff'}; color:${isConf ? '#059669' : '#94a3b8'}; border:1px solid ${isConf ? '#a7f3d0' : '#e2e8f0'};">
                  ${isConf ? '✓' : '○'} ${m.name}
                </span>`;
              }).join('')}
            </div>
          </div>
        ` : ''}

        ${activeTab === 'defense' ? `
          <div class="card" style="flex:1; overflow-y:auto; padding:20px;">
            <div class="card-title" style="margin-bottom:14px;">
              <span style="color:#0f172a;">🎓 答辩委员会改进意见与组内裁决矩阵 ${isFinalSubmitted ? '<span style="font-size:11px; color:#059669; margin-left:6px;">(🔒 已提交归档)</span>' : ''}</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:14px;">
              ${s3.feedbackItems.length === 0 ? `
                <div style="text-align:center; color:#64748b; padding:32px; font-size:14px;">
                  ⏳ 答辩委员会专家正在审阅初稿，请在右侧研讨区与委员开展交流答辩！
                </div>
              ` : s3.feedbackItems.map((item, idx) => `
                <div style="background:#ffffff; padding:16px; border-radius:12px; border:1px solid ${item.role === 'opponent' ? '#fca5a5' : '#86efac'}; box-shadow:0 2px 8px rgba(15,23,42,0.04);">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <div style="display:flex; align-items:center; gap:8px;">
                      <span style="font-size:16px;">${item.role === 'opponent' ? '🔴' : '🟢'}</span>
                      <span style="font-weight:800; font-size:14.5px; color:${item.role === 'opponent' ? '#dc2626' : '#059669'};">质询点 ${idx + 1}: ${escapeHtml(item.speaker || (item.role === 'opponent' ? '反方委员 Agent' : '正方委员 Agent'))} - ${escapeHtml(item.title || '')}</span>
                    </div>
                    <span style="font-size:11.5px; padding:3px 10px; border-radius:12px; font-weight:700; background:${item.status === 'adopted' ? '#ecfdf5' : '#fffbeb'}; color:${item.status === 'adopted' ? '#059669' : '#d97706'}; border:1px solid ${item.status === 'adopted' ? '#a7f3d0' : '#fde68a'};">
                      ${item.status === 'adopted' ? '✅ 已研讨并归档' : '⏳ 待组内研讨裁决'}
                    </span>
                  </div>
                  <div style="font-size:13.5px; color:#1e293b; background:#f8fafc; border:1px solid #e2e8f0; padding:12px 14px; border-radius:8px; margin-bottom:12px; line-height:1.6;">
                    <b>${escapeHtml(item.speaker)}意见原文:</b><br>${escapeHtml(item.content || '')}
                  </div>

                  <div style="border-top:1px dashed #e2e8f0; padding-top:10px; margin-top:10px;">
                    <div style="font-size:12.5px; font-weight:700; color:#334155; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
                      <span>✍️ 本组答辩回复与修改结论：</span>
                      ${item.response ? '<span style="color:#059669; font-size:11.5px; font-weight:700;">✅ 已保存生效 (可随时二次修改)</span>' : '<span style="color:#64748b; font-size:11.5px;">(请直接在下方输入框中录入简要答复)</span>'}
                    </div>
                    <textarea 
                      class="feedback-direct-input" 
                      data-id="${item.id}" 
                      ${isFinalSubmitted ? 'disabled readonly' : ''} 
                      placeholder="商讨后，在此直接输入本组针对该条意见的简要答复与修改结论..." 
                      style="width:100%; min-height:64px; padding:8px 12px; font-size:13px; line-height:1.5; border:1px solid ${item.response ? '#a7f3d0' : '#cbd5e1'}; background:${isFinalSubmitted ? '#f8fafc' : (item.response ? '#f0fdf4' : '#ffffff')}; border-radius:8px; resize:vertical; box-sizing:border-box; color:#0f172a; font-family:inherit;"
                    >${escapeHtml(item.response || '')}</textarea>

                    ${!isFinalSubmitted ? `
                      <div style="display:flex; justify-content:flex-end; margin-top:8px;">
                        <button class="btn-save-feedback-direct" data-id="${item.id}" style="background:${item.response ? 'linear-gradient(135deg, #059669, #047857)' : 'linear-gradient(135deg, #2563eb, #1d4ed8)'}; border:none; color:white; padding:6px 14px; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:4px; box-shadow:0 2px 6px rgba(0,0,0,0.12);">
                          ${item.response ? '🔄 更新并保存本条修改' : '💾 确认并保存本条答复'}
                        </button>
                      </div>
                    ` : ''}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : (() => {
          const currUser = (window.app && window.app.authManager) ? window.app.authManager.getCurrentUser() : null;
          const userClassId = state.activeStudentClassId || (currUser ? currUser.classId : null) || 'class_101';
          const activeGroupObj = (window.app && window.app.authManager) ? window.app.authManager.getStudentActiveGroup(currUser, userClassId) : null;
          const userGroupId = activeGroupObj?.id || (window.app?.cloudSyncEngine?.groupId) || (currUser?.groupId) || 'group_1';
          let activeTaskId = state.activeTaskId || (window.app?.cloudSyncEngine?.taskId) || (`task_${userClassId}_default`);
          if (!activeTaskId || activeTaskId === 'task_default') activeTaskId = `task_${userClassId}_default`;
          const padName = `jizhi_${activeTaskId}_${userGroupId}`;
          const currUserName = (currUser && (currUser.name || currUser.username)) || '组员';
          const currUserColor = (state.members && state.members[currUserCode]?.color) || '#2563eb';
          const padUrl = `/p/${padName}?userName=${encodeURIComponent(currUserName)}&userColor=${encodeURIComponent(currUserColor)}&showChat=false&showLineNumbers=true&showControls=true`;

          return `
            <div class="card" style="flex:1; display:flex; flex-direction:column; padding:16px; min-height:600px;">
              <div class="card-title" style="margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:15px; font-weight:800; color:#0f172a;">📝 论文全篇大正文 ${isFinalSubmitted ? '<span style="font-size:11px; color:#059669; margin-left:6px;">(🔒 终稿已提交 · 归档只读查阅)</span>' : '(依据答辩意见实时协同修改终稿 · Etherpad 毫秒级引擎)'}</span>
                <div style="display:flex; align-items:center; gap:8px;">
                  <span style="font-size:11px; background:#ecfdf5; color:#059669; border:1px solid #a7f3d0; padding:2px 8px; border-radius:10px; font-weight:700;">🟢 Etherpad 协同就绪</span>
                  <button onclick="const f=document.getElementById('stage3-etherpad-frame'); if(f) f.src=f.src;" style="background:transparent; color:#2563eb; border:1px solid #cbd5e1; padding:2px 8px; border-radius:4px; font-size:11px; cursor:pointer; font-weight:600;">🔄 刷新</button>
                </div>
              </div>
              <div style="flex:1; min-height:0; position:relative; background:#f1f5f9; border-radius:8px; overflow:hidden; border:1px solid #cbd5e1;">
                <iframe id="stage3-etherpad-frame" src="${padUrl}" style="width:100%; height:100%; min-height:540px; border:none; display:block;" allow="clipboard-read; clipboard-write"></iframe>
              </div>
            </div>
          `;
        })()}
      </div>
    `;

    const tabDefense = canvas.querySelector('#tab-btn-defense');
    const tabEditor = canvas.querySelector('#tab-btn-editor');
    if (tabDefense) tabDefense.addEventListener('click', () => handlers.onSwitchStage3Tab('defense'));
    if (tabEditor) tabEditor.addEventListener('click', () => handlers.onSwitchStage3Tab('editor'));

    if (!isFinalSubmitted) {
      canvas.querySelectorAll('.feedback-direct-input').forEach(textarea => {
        let fbTimer = null;
        let idleTimer = null;
        let heartbeatTimer = null;
        const itemId = textarea.dataset.id;
        const fieldKey = `fb_${itemId}`;
        textarea.dataset.lockKey = fieldKey;

        const autoSave = () => {
          const text = textarea.value.trim();
          if (itemId && text && handlers.onSaveDirectFeedback) {
            handlers.onSaveDirectFeedback(itemId, text);
          }
        };

        const startHeartbeat = () => {
          if (heartbeatTimer) clearInterval(heartbeatTimer);
          heartbeatTimer = setInterval(() => {
            if (document.activeElement === textarea && !isFieldLockedByOther(fieldKey)) {
              sendLock(fieldKey, textarea.value);
            } else {
              clearInterval(heartbeatTimer);
            }
          }, 2000);
        };

        const resetIdleTimer = () => {
          if (idleTimer) clearTimeout(idleTimer);
          idleTimer = setTimeout(() => {
            autoSave();
            sendUnlock(fieldKey, textarea.value);
            if (heartbeatTimer) clearInterval(heartbeatTimer);
          }, 8000);
        };

        textarea.addEventListener('focus', () => {
          if (isFieldLockedByOther(fieldKey)) {
            textarea.blur();
            return;
          }
          sendLock(fieldKey, textarea.value);
          startHeartbeat();
          resetIdleTimer();
        });

        textarea.addEventListener('compositionstart', () => {
          textarea._isComposing = true;
          resetIdleTimer();
        });

        textarea.addEventListener('compositionupdate', () => {
          resetIdleTimer();
        });

        textarea.addEventListener('compositionend', () => {
          textarea._isComposing = false;
          sendLock(fieldKey, textarea.value);
          resetIdleTimer();
          if (fbTimer) clearTimeout(fbTimer);
          fbTimer = setTimeout(autoSave, 300);
        });

        textarea.addEventListener('input', (e) => {
          if (isFieldLockedByOther(fieldKey)) {
            e.preventDefault();
            e.stopImmediatePropagation();
            return;
          }
          if (!textarea._isComposing) {
            sendLock(fieldKey, e.target.value);
          }
          resetIdleTimer();
          if (fbTimer) clearTimeout(fbTimer);
          fbTimer = setTimeout(autoSave, 300);
        });

        textarea.addEventListener('change', autoSave);

        textarea.addEventListener('blur', () => {
          if (idleTimer) clearTimeout(idleTimer);
          if (heartbeatTimer) clearInterval(heartbeatTimer);
          if (textarea._preemptedByOther || isFieldLockedByOther(fieldKey)) {
            textarea._preemptedByOther = false;
            return;
          }
          autoSave();
          sendUnlock(fieldKey, textarea.value);
        });

        textarea.addEventListener('keydown', (e) => {
          if (isFieldLockedByOther(fieldKey)) {
            e.preventDefault();
            e.stopImmediatePropagation();
            return;
          }
          resetIdleTimer();
        });
      });

      canvas.querySelectorAll('.btn-save-feedback-direct').forEach(btn => {
        btn.addEventListener('click', () => {
          const itemId = btn.dataset.id;
          const textarea = canvas.querySelector(`.feedback-direct-input[data-id="${itemId}"]`);
          const text = textarea ? textarea.value.trim() : '';
          if (!text) {
            alert('⚠️ 请输入本组针对该条意见的简要答复结论后再保存！');
            return;
          }
          handlers.onSaveDirectFeedback(itemId, text);
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
        const effClassId = window.app.state.activeStudentClassId || u?.classId || 'class_101';
        const effGroup = window.app.authManager.getStudentActiveGroup(u, effClassId);
        memberList = window.app.authManager.getGroupMembersForWorkspace(effGroup?.id || 'group_1');
      }

      presenceContainer.innerHTML = memberList.map(m => {
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

          // 🛡️ 严格去重守护：同一阶段同一发送者同一文本内容（或相同 msg.id）绝不重复渲染
          const rawTxtNormalized = txt.replace(/[\s\r\n]+/g, ' ').trim();
          const contentKey = `${msg.sender}_${stg}_${rawTxtNormalized}`;
          const idKey = msg.id ? `id_${msg.id}` : null;
          if (seenMsgKeys.has(contentKey) || (idKey && seenMsgKeys.has(idKey))) {
            return;
          }
          seenMsgKeys.add(contentKey);
          if (idKey) seenMsgKeys.add(idKey);

          allMsgs.push(msg);
        });
      }
    });
    allMsgs.sort((a, b) => (Number(a._timeMs || 0) - Number(b._timeMs || 0)));
    const cleanMsgs = filterAndDeduplicateChatLogs(allMsgs);

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
        const u = allUsers.find(x => x.id === msg.sender || x.studentCode === msg.sender || x.username === msg.sender || x.name === msg.sender);
        if (u && u.name) {
          name = u.name;
        } else if (state.members) {
          const mem = Object.values(state.members).find(m => m.id === msg.sender || m.studentCode === msg.sender || m.username === msg.sender || m.name === msg.sender);
          if (mem && mem.name) name = mem.name;
        }

        const memObj = state.members ? (state.members[msg.sender] || Object.values(state.members).find(m => m.id === msg.sender || m.studentCode === msg.sender || m.name === name)) : null;
        if (memObj) {
          avatar = memObj.avatar || '👨‍🎓';
          color = memObj.color || '#2563eb';
        }
      }

      let formattedContent = '';
      if ((msg.text || '').startsWith('[IMG_DATA]:')) {
        const imgSrc = sanitizeUrl(msg.text.replace('[IMG_DATA]:', ''));
        formattedContent = `
          <div style="margin-top:2px;">
            <img src="${imgSrc}" class="chat-attached-img" style="max-width:220px; max-height:160px; border-radius:8px; border:1px solid #cbd5e1; cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,0.1); transition:transform 0.2s; display:block;" title="点击放大查看图片">
          </div>
        `;
      } else {
        let rawText = msg.text || '';
        let safeText = escapeHtml(rawText);
        let formattedText = safeText.replace(/(@[^\s@]+)/g, '<span class="mention-tag">$1</span>');
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
    }).join('');

    if (isAtBottom) {
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

  /* ==========================================================================
     MODULE: app.js
     ========================================================================== */
  /**
   * JIZHI (集智) Platform - Main Application Coordinator & Lifecycle
   * Standard ES Module (ESM)
   */


  // Make renderChat available on window for sync callbacks
  if (typeof window !== "undefined") {
    window.renderChat = renderChat;
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
      if (storedViewMode) this.state.studentViewMode = storedViewMode;

      const user = this.authManager.getCurrentUser();
      const effectiveClassId = this.state.activeStudentClassId || user?.classId || 'class_101';
      const activeGroupObj = this.authManager.getStudentActiveGroup(user, effectiveClassId);
      const currentGroupId = activeGroupObj?.id || user?.groupId || 'group_1';
      this.loadGroupState(currentGroupId);

      this.cloudSyncEngine = new CloudSyncEngine(this);
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

    loadGroupState(groupId = 'group_1') {
      const defaultState = JSON.parse(JSON.stringify(InitialState));
      const user = this.authManager ? this.authManager.getCurrentUser() : null;
      const isTeacher = user && (user.isTeacher || user.role === 'teacher');
      const effectiveClassId = (isTeacher ? this.state.activeClassId : this.state.activeStudentClassId) || user?.classId || 'class_101';
      let taskId = this.state.activeTaskId || (this.cloudSyncEngine ? this.cloudSyncEngine.taskId : `task_${effectiveClassId}_default`);
      if (!taskId || taskId === 'task_default') {
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
        return this.state.activeMonitorGroupId || 'group_1';
      }
      const effectiveClassId = this.state.activeStudentClassId || user?.classId || 'class_101';
      const activeGroupObj = this.authManager ? this.authManager.getStudentActiveGroup(user, effectiveClassId) : null;
      return activeGroupObj?.id || user?.groupId || 'group_1';
    }

    saveGroupState(groupId) {
      // 🛡️ 单一 Key 覆盖轻量快照：仅缓存当前正在操作的 1 个工作台，保障 0ms 秒开，绝不堆积碎片
      try {
        const user = this.authManager ? this.authManager.getCurrentUser() : null;
        const isTeacher = user && (user.isTeacher || user.role === 'teacher');
        const effectiveClassId = (isTeacher ? this.state.activeClassId : this.state.activeStudentClassId) || user?.classId || 'class_101';
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
      const user = this.authManager ? this.authManager.getCurrentUser() : null;
      const isTeacher = user && (user.isTeacher || user.role === 'teacher');
      const effectiveClassId = (isTeacher ? this.state.activeClassId : this.state.activeStudentClassId) || user?.classId || 'class_101';
      const groupId = this.getEffectiveGroupId();
      let taskId = this.state.activeTaskId || (this.cloudSyncEngine ? this.cloudSyncEngine.taskId : `task_${effectiveClassId}_default`);
      if (!taskId || taskId === 'task_default') {
        taskId = `task_${effectiveClassId}_default`;
      }
      const targetStage = stage || this.state.currentStage || 'stage1';

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

    syncChatLogs() {
      const user = this.authManager ? this.authManager.getCurrentUser() : null;
      const isTeacher = user && (user.isTeacher || user.role === 'teacher');
      const effectiveClassId = (isTeacher ? this.state.activeClassId : this.state.activeStudentClassId) || user?.classId || 'class_101';
      const groupId = this.getEffectiveGroupId();
      let taskId = this.state.activeTaskId || (this.cloudSyncEngine ? this.cloudSyncEngine.taskId : `task_${effectiveClassId}_default`);
      if (!taskId || taskId === 'task_default') {
        taskId = `task_${effectiveClassId}_default`;
      }
      const stage = this.state.currentStage || 'stage1';
      const logs = (this.state.chatLogs && this.state.chatLogs[stage]) ? this.state.chatLogs[stage] : [];
      const latestMsg = logs[logs.length - 1];

      if (latestMsg) {
        this.sendSingleChatMessage(latestMsg, stage);
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
      const editor = document.getElementById('stage2-word-editor');
      if (editor) {
        // 更新字数与协同状态
        const countBadge = document.getElementById('stage2-word-count-num');
        const cleanText = editor.innerText.replace(/[\s\r\n]+/g, '');
        if (countBadge) {
          countBadge.innerText = `${cleanText.length}`;
        }

        // 动态刷新下方 SSRL 贡献度条 (纯百分比模式)
        const contribLabelsContainer = document.getElementById('stage2-contrib-labels');
        const contribBarsContainer = document.getElementById('stage2-contrib-bars');
        if (contribLabelsContainer && contribBarsContainer) {
          const membersList = Object.values(this.state.members || {});
          const contribs = this.state.stage2.memberContributions || {};
          let rawTotal = 0;
          membersList.forEach(m => { rawTotal += (contribs[m.id] || contribs[m.studentCode] || 0); });

          contribLabelsContainer.innerHTML = membersList.map((m) => {
            const rawVal = (contribs[m.id] || contribs[m.studentCode] || 0);
            const pct = rawTotal > 0 ? Math.round((rawVal / rawTotal) * 100) : 0;
            return `<span style="color:${m.color || '#2563eb'}; font-weight:700;">● ${m.name}: ${pct}%</span>`;
          }).join('');

          if (rawTotal === 0) {
            contribBarsContainer.innerHTML = `<div style="width:100%; height:10px; background:#f1f5f9; border-radius:5px; display:flex; align-items:center; justify-content:center; font-size:10.5px; color:#94a3b8;">暂无协作投入 (开始编辑正文或研讨后将自动呈现贡献占比)</div>`;
          } else {
            contribBarsContainer.innerHTML = membersList.map((m) => {
              const rawVal = (contribs[m.id] || contribs[m.studentCode] || 0);
              const pct = Math.round((rawVal / rawTotal) * 100);
              return `<div class="contrib-segment" style="width:${pct}%; background:${m.color || '#2563eb'}; transition:width 0.3s ease;" title="${m.name}: ${pct}% (基于写作与修改累计工作量)"></div>`;
            }).join('');
          }
        }
      }
      this.renderPresenceCursors();
    }

    syncStageChange(stage) {
      const user = this.authManager.getCurrentUser();
      const groupId = (user && user.groupId) ? user.groupId : (this.state.activeMonitorGroupId || 'group_1');
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

          const min = this.state.timer.elapsedSeconds / 60;
          const currentStage = this.state.currentStage || 'stage1';
          const logs = (this.state.chatLogs && this.state.chatLogs[currentStage]) || [];

          // ⏰ 全局进度与阶段间转场催促 + 阶段二智能体保底机制 (由在场学号最小的在线成员单点触发，杜绝多人并发 AI 消息风暴)
          const myCode = this.state.currentUser || (currentUser ? (currentUser.studentCode || currentUser.id) : 'A');
          const activeTaskId = this.state.activeTaskId || 'task_default';
          const currentGroupId = (currentUser && currentUser.groupId) ? currentUser.groupId : (this.state.activeMonitorGroupId || 'group_1');
          const allTasks = (this.authManager) ? this.authManager.getTasks() : [];
          const curTask = allTasks.find(t => t.id === activeTaskId);
          const totalDurationMin = (curTask && curTask.durationMinutes) ? Number(curTask.durationMinutes) : 150;
          const totalDurationSec = totalDurationMin * 60;
          const totalProgress = (totalDurationSec > 0) ? (this.state.timer.elapsedSeconds / totalDurationSec) : 0;

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
            // 1. 【20% 节点】阶段一 ➔ 阶段二防卡关 (总时间 20%)
            const isContractConfirmed = !!(this.state.stage1 && this.state.stage1.contract && this.state.stage1.contract.isConfirmed);
            const s1GateMsgId = `msg_gate_s1_${activeTaskId}_${currentGroupId}_20pct`;
            const s1AlreadySent = (this.state.chatLogs.stage1 || []).some(m => m.id === s1GateMsgId || (m.text && m.text.includes('已消耗总时间 20%')));

          if (totalProgress >= 0.20 && currentStage === 'stage1' && !isContractConfirmed && !s1AlreadySent) {
            const msgStage1 = {
              id: s1GateMsgId,
              sender: 'auctioneer',
              text: `🎪 【拍卖师·进度提示】：选题研讨的时间已经走过 20% 啦，大家的想法也越来越清晰了～\n👉 如果研究方向已经基本确定，可以在公约卡片点击【签署确认】，随时进入【阶段二：学术编辑部】开始动笔；如果还有想补充的点子，也欢迎继续在讨论区交流！`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              _timeMs: nowMs
            };
            if (!this.state.chatLogs.stage1) this.state.chatLogs.stage1 = [];
            this.state.chatLogs.stage1.push(msgStage1);
            this.syncChatLogs();
            renderChat(this.state);
          }

          // 2. 【阶段二智能体保底机制】(S2 经历 60% 正常轨 + 全局 75% 极端保底轨)
          if (currentStage === 'stage2') {
            const s2MeetingMsgId = `msg_s2_meeting_${activeTaskId}_${currentGroupId}`;
            const isMeetingDone = !!(this.state.stage2 && this.state.stage2.actionPlan && this.state.stage2.actionPlan.isGenerated) ||
                                  (this.state.chatLogs.stage2 || []).some(m => m.id === s2MeetingMsgId || (m.text && m.text.includes('半程会议号召')));

            if (!isMeetingDone) {
              const s2StartTime = (this.state.stage2 && this.state.stage2.stageStartTime) ? this.state.stage2.stageStartTime : null;
              const s2ElapsedMin = s2StartTime ? Math.max(0, (nowMs - s2StartTime) / 60000) : Math.max(0, min - (totalDurationMin * 0.10));
              const s2TargetMin = totalDurationMin * 0.70;

              const isNormalDue = (s2TargetMin > 0) && (s2ElapsedMin >= (s2TargetMin * 0.60));
              const isEmergencyDue = (totalProgress >= 0.75);

              if (isNormalDue || isEmergencyDue) {
                this.state.stage2MeetingTimeTriggered = true;
                const meetingCallMsg = {
                  id: s2MeetingMsgId,
                  sender: 'managingEditor',
                  text: `🤝 【责任编辑·半程会议号召】：阶段二协作时间已达到 60%（正文骨架已搭建）！请全体小组成员点击上方【📢 发起编辑会议】完成 4 维自查打卡，稍后审稿编辑将结合全组情况进行深度学术质检与清单生成！`,
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  _timeMs: nowMs
                };
                if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
                this.state.chatLogs.stage2.push(meetingCallMsg);
                this.syncChatLogs();
                renderChat(this.state);
              }
            }
          }

          // 3. 【90% 节点】阶段二 ➔ 阶段三防卡关 (总时间 90%) - 动态由当前所处阶段智能体接管
          const gate90MsgId = `msg_gate_90pct_${activeTaskId}_${currentGroupId}`;
          const gate90AlreadySent = (this.state.chatLogs[currentStage] || []).some(m => m.id === gate90MsgId || (m.text && m.text.includes('已消耗 90%')));

          if (totalProgress >= 0.90 && !gate90AlreadySent) {
            let sender90 = null;
            let text90 = '';
            if (currentStage === 'stage1') {
              sender90 = 'auctioneer';
              text90 = `🎪 【拍卖师·紧急通牒】：全场时间已消耗 90%！本组严重滞后，请全员立刻在公约卡片点击【签署确认】，一秒都不能再耽误了！`;
            } else if (currentStage === 'stage2') {
              sender90 = 'reviewingEditor';
              text90 = `📝 【审稿编辑·转场指令】：正文起草时间已达上限（总时间已消耗 90%）！请小组成员立即停止新增段落，点击上方导航栏进入【🎓 阶段三：答辩擂台】，留足时间完成答辩质询！`;
            }
            if (sender90) {
              const msg90 = {
                id: gate90MsgId,
                sender: sender90,
                text: text90,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                _timeMs: nowMs
              };
              if (!this.state.chatLogs[currentStage]) this.state.chatLogs[currentStage] = [];
              this.state.chatLogs[currentStage].push(msg90);
              this.syncChatLogs();
              renderChat(this.state);
            }
          }

          // 4. 【95% 节点】阶段三 ➔ 终稿提交防漏交 (总时间 95%) - 动态由当前所处阶段智能体接管
          const gate95MsgId = `msg_gate_95pct_${activeTaskId}_${currentGroupId}`;
          const gate95AlreadySent = (this.state.chatLogs[currentStage] || []).some(m => m.id === gate95MsgId || (m.text && m.text.includes('最后 5%')));

          if (totalProgress >= 0.95 && !this.state.isFinalSubmitted && !gate95AlreadySent) {
            let sender95 = 'neutral';
            let text95 = `🟡 【中间委员·终稿警报】：距离全盘任务锁定仅剩最后 5% 时间！请组内确认答辩修改无误，立即点击左侧【🚀 提交论文终稿】完成归档！`;
            if (currentStage === 'stage1') {
              sender95 = 'auctioneer';
              text95 = `🚨 【拍卖师·最后通牒】：距离全盘任务锁定仅剩最后 5% 时间！请组内立刻签署公约并提交终稿，否则本次作业将被强制归档！`;
            } else if (currentStage === 'stage2') {
              sender95 = 'reviewingEditor';
              text95 = `🚨 【审稿编辑·最后通牒】：距离全盘任务锁定仅剩最后 5% 时间！请立即停止修改正文，快速提交终稿归档！`;
            }
            const msg95 = {
              id: gate95MsgId,
              sender: sender95,
              text: text95,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              _timeMs: nowMs
            };
              if (!this.state.chatLogs[currentStage]) this.state.chatLogs[currentStage] = [];
              this.state.chatLogs[currentStage].push(msg95);
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
              () => {
                this.state.studentViewMode = 'task_list';
                this.renderMain();
              }
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
        const effectiveClassId = this.state.activeStudentClassId || currentUser?.classId || 'class_101';
        const activeGroupObj = this.authManager.getStudentActiveGroup(currentUser, effectiveClassId);
        const currentGroupId = activeGroupObj.id || (currentUser && currentUser.groupId ? currentUser.groupId : 'group_1');

        if (this.state.studentViewMode === 'task_list') {
          appEl.className = 'app-student-portal-mode';
          renderStudentTaskPortal(
            appEl, this.authManager, this.state,
            (taskId) => {
              const actualTaskId = taskId || 'task_default';
              this.state.activeTaskId = actualTaskId;
              const targetTaskObj = (this.authManager ? this.authManager.getTasks() : []).find(t => t.id === actualTaskId);
              const taskClassId = (targetTaskObj && targetTaskObj.classId) ? targetTaskObj.classId : (this.state.activeStudentClassId || currentUser?.classId || 'class_101');
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
                <input type="text" class="chat-input modern-spacious-input" id="chat-input" placeholder="输入 @ 提及同学或智能体，或输入学术讨论..." autocomplete="off">
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

    // 🌐 通用智能体静默/情绪提示发射器：真 AI 生成，超时/失败自动降级为写死兜底文案
    async queueAgentNudge(botKey, prompt, fallbackText, stage) {
      let text = null;
      try { text = await callCozeAgentAPI(botKey, prompt, { stage }); } catch (e) {}
      const finalText = (text && text.trim().length > 0) ? text.trim() : fallbackText;
      const msg = {
        sender: botKey,
        text: finalText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        _timeMs: Date.now()
      };
      if (!this.state.chatLogs[stage]) this.state.chatLogs[stage] = [];
      this.state.chatLogs[stage].push(msg);
      this.syncChatLogs();
      if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
      renderChat(this.state);
    }

    initCrossStageInactivityChecker() {
      if (this.stageInactivityTimer) clearInterval(this.stageInactivityTimer);
      this.stageInactivityTimer = setInterval(() => {
        // ⚡ 单点守护主节点动态选举：优先由组长担当；若组长缺勤/掉线，自动由当前在场学号最小的在线成员接管，杜绝单点失效与并发重复！
        const currUserObj = this.authManager.getCurrentUser();
        const myCode = this.state.currentUser || (currUserObj ? (currUserObj.studentCode || currUserObj.id) : 'A');
        const now = Date.now();
        const membersList = Object.values(this.state.members || {});
        const presenceMap = this.state.presence || {};

        const onlineMembers = membersList.filter(m => {
          const p = presenceMap[m.studentCode] || presenceMap[m.id];
          return p && (now - (p.updatedAt || 0) < 180000); // 放宽到 3 分钟：后台标签页心跳会被浏览器节流（约 1 分钟 1 次），60 秒窗口会误判在场同学为离线
        });

        let primaryMember = (onlineMembers.length > 0)
          ? [...onlineMembers].sort((a, b) => (a.studentCode || a.id || '').localeCompare(b.studentCode || b.id || ''))[0]
          : (membersList.length > 0 ? [...membersList].sort((a, b) => (a.studentCode || a.id || '').localeCompare(b.studentCode || b.id || ''))[0] : null);

        const isPrimaryGuardian = primaryMember && (primaryMember.studentCode === myCode || primaryMember.id === myCode);
        if (!isPrimaryGuardian) return;

        const stage = this.state.currentStage;
        const totalMembersCount = membersList.length;
        const activeMembersCount = onlineMembers.length;
        if (activeMembersCount < 2) return; // 基础前提：至少 2 人在线才触发主动关心（不必全员在线，否则一人心跳掉线全组智能体就集体沉默）

        // ======================================================================
        // 🌟 全阶段 SSRL 情绪与挫败感智能守护（同伴优先调节 45~60 秒观察窗）
        // ======================================================================
        const currentStageChats = (this.state.chatLogs && this.state.chatLogs[stage]) ? this.state.chatLogs[stage] : [];
        const recentStudentChats = currentStageChats.filter(m => m.sender && !AgentProfiles[m.sender] && m.sender !== 'system');
        const lastNegativeChat = [...recentStudentChats].reverse().find(m => {
          const t = m.text || '';
          return /(?:太难了|写不出来|改不动了|不知道怎么写|全废了|搞不定|来不及了|头大|想放弃|否定我们|怎么改啊)/i.test(t);
        });

        if (lastNegativeChat && (!this.lastEmotionHandledId || this.lastEmotionHandledId !== lastNegativeChat._timeMs)) {
          const negTime = lastNegativeChat._timeMs || (now - 60000);
          const timeSinceNeg = now - negTime;
          // 观察窗口：45 秒内给同伴留出互助安慰空间
          if (timeSinceNeg >= 45000 && timeSinceNeg < 180000) {
            // 检测 45 秒内是否有其他同伴发出了安慰/支持/解法回复
            const peerResponsesAfterNeg = recentStudentChats.filter(m => (m._timeMs || 0) > negTime && m.sender !== lastNegativeChat.sender);
            const hasPeerComforted = peerResponsesAfterNeg.some(m => /(?:没事|别慌|我们可以|一起|你看|先写|参考|我来|赞同|我觉得可以)/i.test(m.text || ''));

            if (!hasPeerComforted) {
              this.lastEmotionHandledId = lastNegativeChat._timeMs;
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

              // 情绪托底转真 AI：基于学生真实情绪原话 + 当前阶段生成个性化安抚与破局建议（写死文案降级为超时兜底）
              const negativeRaw = (lastNegativeChat.text || '').trim();
              const comfortPrompt = `有同学在协作中流露出了挫败/疲惫情绪，原话为：「${negativeRaw}」。请以${stage === 'stage1' ? '学术拍卖师' : stage === 'stage2' ? '责任编辑' : '中间委员'}的身份，先用 2~3 句真诚安抚这份情绪（共情但不肉麻、不说教），再结合当前写作阶段给出 1 个具体、可立即照做的小建议，帮助全组重新找回节奏。80~120 字，语气温暖自然。`;
              this.queueAgentNudge(agentSender, comfortPrompt, comfortText, stage);
              return;
            } else {
              // 同伴已成功出面调节，AI 默默记录并全程保持静默
              this.lastEmotionHandledId = lastNegativeChat._timeMs;
            }
          }
        }

        // 🌐 全局静默防轰炸：取最近一次任意静默提示时间，5 分钟内不再追加（冷场只做一次精准破冰，避免连环打扰）
        const _lastSilenceMs = Math.max(
          0,
          this.lastDiscussionNudgeTime || 0,
          this.lastZeroProposalNudgeTime || 0,
          this.lastPartialProposalNudgeTime || 0,
          this.lastVoteNudgeTime || 0,
          this.lastS2SilenceNudgeTime || 0,
          this.lastS2ContribNudgeTime || 0,
          this.lastS2MeetingNudgeTime || 0,
          this.lastS2PostMeetingSilenceNudgeTime || 0,
          this.lastS3SilenceNudgeTime || 0
        );
        if (_lastSilenceMs && (now - _lastSilenceMs < 300000)) return;

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

          // 核心守护保护：同时检测【讨论区发言】与【左侧提案操作活跃态】
          const lastProposalTime = proposals.length > 0 ? Math.max(...proposals.map(p => p.updatedAt || 0)) : 0;
          const lastLeftActionTime = Math.max(lastProposalTime, this.stage1LastActionTime || 0);
          const timeSinceLastLeftAction = now - lastLeftActionTime;

          // 1. 【提案阶段研讨静默守护】：只有当【讨论区无人发言 > 3min】且【左侧也无人在操作/撰写提案 > 3min】时，才判定为真正冷场并破冰！
          if (submittedCount < totalMembersCount && silenceDurationMs > 180000 && timeSinceLastLeftAction > 180000) {
            if (!this.lastDiscussionNudgeTime || now - this.lastDiscussionNudgeTime > 240000) {
              this.lastDiscussionNudgeTime = now;
              const s1SilenceFallback = `💡 【拍卖师·研讨互动提示】：大家在构思选题的过程中，可以在讨论区互相交流灵感、探讨研究问题的价值与可行性，共同激发更好的提案！`;
              this.queueAgentNudge('auctioneer', `全组进入选题研讨后已静默一段时间（讨论区无人发言、左侧也无人撰写提案）。请以学术拍卖师身份，用一句轻松的话破冰，再给出 1~2 个能立刻激发大家发言的开放式问题（例如引导从真实教学场景或研究兴趣切入）。80~120 字，热情但不催促。`, s1SilenceFallback, 'stage1');
              return;
            }
          }

          // 2. 【零提案超时引导】：开场 > 6 分钟仍 0 人提交提案，引导尽快动笔
          if (submittedCount === 0 && stage1DurationMs > 360000) {
            if (!this.lastZeroProposalNudgeTime || now - this.lastZeroProposalNudgeTime > 300000) {
              this.lastZeroProposalNudgeTime = now;
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

          // 3. 【个别落后跟进】：有人已提交，但超过 3 分钟仍有个别人未交，跟进提醒未交同学
          if (submittedCount > 0 && submittedCount < totalMembersCount) {
            const lastProposal = proposals[proposals.length - 1];
            const lastProposalTime = lastProposal ? (lastProposal.updatedAt || this.stage1StartTime) : this.stage1StartTime;
            if (now - lastProposalTime > 180000) {
              if (!this.lastPartialProposalNudgeTime || now - this.lastPartialProposalNudgeTime > 180000) {
                this.lastPartialProposalNudgeTime = now;
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

          // 4. 提案集齐但投票守护（0人投 3min，部分人投 2min）
          if (submittedCount >= totalMembersCount && votesCastCount < totalMembersCount) {
            const lastVoteTime = s1._lastVoteTime || this.stage1StartTime;
            const voteSilenceMs = now - lastVoteTime;
            const shouldVoteNudge = (votesCastCount === 0 && voteSilenceMs > 180000) || (votesCastCount > 0 && voteSilenceMs > 120000);
            if (shouldVoteNudge) {
              if (!this.lastVoteNudgeTime || now - this.lastVoteNudgeTime > 180000) {
                this.lastVoteNudgeTime = now;
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

          // 5. 投票已完成且合约草案已生成 ➔ 公约协商与催签精密三层守护
          const signedMap = (s1.contract && s1.contract.confirmedMembers) ? s1.contract.confirmedMembers : {};
          const signedCount = Object.values(signedMap).filter(Boolean).length;
          const isContractDrafted = votesCastCount >= totalMembersCount;

          if (isContractDrafted && signedCount < totalMembersCount) {
            const lastContractActionTime = Math.max(s1.contract._lastEditTime || 0, this.stage1LastActionTime || 0);
            const timeSinceContractEdit = now - lastContractActionTime;
            const contractDraftTime = s1.contract._draftedTime || this.stage1StartTime;

            // 规则 A（双静默）：左侧分工/时间无修改 > 3min，且右侧讨论区静默 > 3min ➔ 提示协商分工与时间
            if (timeSinceContractEdit > 180000 && silenceDurationMs > 180000) {
              if (!this.lastContractSilenceNudgeTime || now - this.lastContractSilenceNudgeTime > 240000) {
                this.lastContractSilenceNudgeTime = now;
                const msg = {
                  sender: 'auctioneer',
                  text: `💡 【拍卖师·分工与时间协商提示】：全组已完成选题竞拍！\n👉 如果对左侧各成员的章节分工或时间预算有想法，大家可以在讨论区充分交流，达成共识后在卡片中直接修改确认！`,
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

            // 规则 B（全员未签）：在没有修改的情况下，没有任何人签署超过 3 分钟 ➔ 拍卖师提示开始签署
            if (signedCount === 0 && (now - contractDraftTime > 180000) && timeSinceContractEdit > 180000) {
              if (!this.lastZeroSignNudgeTime || now - this.lastZeroSignNudgeTime > 240000) {
                this.lastZeroSignNudgeTime = now;
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

            // 规则 C（部分已签）：有人已签署，但仍有成员未签超过 2 分钟 ➔ 拍卖师催签未签组员
            if (signedCount > 0 && signedCount < totalMembersCount) {
              const lastSignTime = s1.contract._lastSignTime || contractDraftTime;
              if (now - lastSignTime > 120000) {
                if (!this.lastSignContractNudgeTime || now - this.lastSignContractNudgeTime > 180000) {
                  this.lastSignContractNudgeTime = now;
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
          const lastStudentMsgTime = lastStudentMsg ? (lastStudentMsg._timeMs || 0) : this.stage2StartTime;
          const silenceDurationMs = now - lastStudentMsgTime;

          const plainText = (s2.unifiedContent || '').replace(/<[^>]*>/g, '').trim();
          const plainTextLen = plainText.length;
          const contribs = s2.memberContributions || {};

          // 1. 阶段二开场超过 4 分钟完全静默且正文字数 < 50 字：提示开始起草与交叉研讨
          if (silenceDurationMs > 240000 && plainTextLen < 50) {
            if (!this.lastS2SilenceNudgeTime || now - this.lastS2SilenceNudgeTime > 300000) {
              this.lastS2SilenceNudgeTime = now;
              const s2SilenceFallback = `🤝 【责任编辑·起草提示】：大家已进入协作工作区！\n• 建议组员按照阶段一公约分工开始撰写各自负责的内容；\n• 撰写同时，多阅读同伴已写好的段落，在研讨区互相提出优化建议或协助润色，共同打磨全篇！`;
              this.queueAgentNudge('managingEditor', `全组进入正文协作后已静默一段时间、正文尚未动笔。请以责任编辑身份，温柔提醒大家按阶段一公约分工开始起草，并给 1 条具体的起步建议（如先各自写自己负责章节的开头两三句、再交叉阅读）。80~120 字，鼓励不施压。`, s2SilenceFallback, 'stage2');
              return;
            }
          }

          // ── 责任编辑过程守护：周期性读取【实际贡献百分比】与【研讨发言投入】 ──
          // 规则：开场给充分起草时间；写作推进中（> 6分钟）每隔约 6 分钟做一次全面评估
          if (stage2DurationMs > 360000) {
            if (!this.lastS2ContribNudgeTime || now - this.lastS2ContribNudgeTime > 360000) {
              // 1. 计算总投入与每位成员的实际贡献百分比
              let totalContrib = 0;
              membersList.forEach(m => {
                totalContrib += (contribs[m.id] || contribs[m.studentCode] || 0);
              });

              // 2. 统计每位成员在阶段二的发言条数
              const memberChatCounts = {};
              s2Chats.forEach(c => {
                if (c.sender && c.sender !== 'managingEditor' && c.sender !== 'reviewingEditor' && c.sender !== 'system') {
                  memberChatCounts[c.sender] = (memberChatCounts[c.sender] || 0) + 1;
                }
              });

              // 3. 找出“写作贡献百分比特别低（< 10%）且发言也极少”的严重脱节同学
              // （注：如果只是差一点如 25% vs 35% 则绝不打扰）
              const severeInactiveMembers = [];
              membersList.forEach(m => {
                const userKey = m.studentCode || m.id;
                const memContrib = (contribs[m.id] || contribs[m.studentCode] || 0);
                const pct = totalContrib > 0 ? Math.round((memContrib / totalContrib) * 100) : 33;
                const chats = (memberChatCounts[userKey] || 0) + (memberChatCounts[m.id] || 0);

                // 判定门槛：总字数已有一定规模且其占比特别低（< 10% 且发言 < 2 条）
                if (totalContrib >= 150 && pct < 10 && chats < 2) {
                  severeInactiveMembers.push(m.name);
                }
              });

              if (severeInactiveMembers.length > 0) {
                this.lastS2ContribNudgeTime = now;
                const names = severeInactiveMembers.join('、');
                const msg = {
                  sender: 'managingEditor',
                  text: `🤝 【责任编辑·进度关怀】：全组正文撰写正在稳步推进中！\n👉 请（**${names}**）同学也逐步加入进来，在负责的章节栏目开始起草撰写，共同保持团队协同节奏！`,
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
          }

          // 3. 🎯 半程编辑会议发起号召（严格按流程图双轨制：推进到【五、不足与反思】或阶段二任务时间已过 60%）
          const times = (this.state.stage1 && this.state.stage1.contract && this.state.stage1.contract.timeAllocations) ? this.state.stage1.contract.timeAllocations : {};
          const totalPlannedMin = (times.background || 25) + (times.literature || 30) + (times.questions || 25) + (times.method || 40) + (times.reflection || 20) + (times.references || 10);
          const totalPlannedMs = totalPlannedMin * 60 * 1000;
          const isTimeOver60Pct = stage2DurationMs >= (totalPlannedMs * 0.6); // 任务时间已过 60%
          const hasReachedReflection = /(?:五、|第5章|第五部分|不足与反思|研究反思|反思与不足|总结与反思|研究局限)/i.test(s2.unifiedContent || '');

          if ((hasReachedReflection || isTimeOver60Pct) && !s2.actionPlan && !this.state.stage2MeetingPrompted) {
            if (!this.lastS2MeetingNudgeTime || now - this.lastS2MeetingNudgeTime > 300000) {
              this.lastS2MeetingNudgeTime = now;
              this.state.stage2MeetingPrompted = true;
              const reasonText = hasReachedReflection 
                ? '关注到团队已推进撰写至【研究设计的不足与反思】章节，全篇初稿框架已基本成型' 
                : '关注到阶段二撰写时间已达规划总用时的 60%';
              const msg = {
                sender: 'managingEditor',
                text: `📢 【责任编辑·半程会议号召】：${reasonText}！\n💡 **现在是全组交叉研读、分析同伴内容的最佳契机**：请大家暂停单独起草，点击左上角【📢 发起编辑会议】，全员自查并阅读同伴撰写的段落，在讨论区交流立意一致性，共同获取审稿专家诊断清单！`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                _timeMs: now
              };
              if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
              this.state.chatLogs.stage2.push(msg);
              this.syncChatLogs();
              if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
              renderChat(this.state);
            }
          }

          // ── 阶段二修改期静默守护（严格在审稿编辑发表学术质检开方之后正式开启计时） ──
          if (this.state.stage2ReviewingFinishedTime) {
            const timeSinceReview = now - this.state.stage2ReviewingFinishedTime;
            const isFirstNudgeSent = !!this.state.stage2FirstPostReviewNudgeSent;

            // ① 第一次提醒：审稿编辑讲完后，讨论区静默达到 3 分钟（180s）
            if (!isFirstNudgeSent && timeSinceReview >= 180000 && silenceDurationMs >= 180000) {
              this.state.stage2FirstPostReviewNudgeSent = true;
              this.lastS2PostMeetingSilenceNudgeTime = now;
              const s2ModifyFallback = `💡 【责任编辑·协同修改交流提示】：审稿专家的诊断清单与修改处方已给出一段时间啦！\n👉 建议大家在讨论区交流一下各部分修改的进展与衔接情况，遇到瓶颈互相出谋划策，共同加速完成终稿完善！`;
              this.queueAgentNudge('managingEditor', `审稿编辑已给出诊断清单与修改处方，但讨论区已静默一段时间。请以责任编辑身份，引导大家就各部分修改进展与段落衔接交流，并给 1 条具体建议（如按清单逐条认领修改点）。80~120 字。`, s2ModifyFallback, 'stage2');
              return;
            }

            // ② 后续周期性提醒：第一次提醒发出后，后续每隔 5~8 分钟（动态自适应阈值）做一次跟进提示
            const dynamicPostMeetingSilenceMs = 360000; // 固定每 6 分钟一次（原 5~8 分钟动态区间过于细碎，改为单一节奏）
            if (isFirstNudgeSent && silenceDurationMs >= dynamicPostMeetingSilenceMs) {
              if (!this.lastS2PostMeetingSilenceNudgeTime || now - this.lastS2PostMeetingSilenceNudgeTime >= dynamicPostMeetingSilenceMs) {
                this.lastS2PostMeetingSilenceNudgeTime = now;
                const msg = {
                  sender: 'managingEditor',
                  text: `💡 【责任编辑·协同修改推进跟进】：全组正文修改正在稳步推进！\n👉 建议大家继续在讨论区同步各章节的修改进度与段落衔接，保持全篇逻辑的一体化！`,
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  _timeMs: now,
                  stage: 'stage2'
                };
                if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
                this.state.chatLogs.stage2.push(msg);
                this.syncChatLogs();
                if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
                renderChat(this.state);
                return;
              }
            }
          }

          // 5. 🎯 终审收尾雷达：阶段二自身时长达到 85% 或 参考文献录入完毕全文闭环
          const hasReachedReferences = /(?:六、|第6章|第六部分|参考文献|References)/i.test(s2.unifiedContent || '') && (s2.unifiedContent || '').length > 1500;
          const isTimeOver85Pct = stage2DurationMs >= (totalPlannedMs * 0.85);
          const hasMeetingDone = !!(s2.actionPlan && s2.actionPlan.isGenerated);
          if ((hasReachedReferences || isTimeOver85Pct) && !this.state.stage2FinalNudgeSent && hasMeetingDone) {
            this.state.stage2FinalNudgeSent = true;
            const msg1 = {
              sender: 'managingEditor',
              text: `🤝 【责任编辑·收尾自查提醒】：时间已推进至阶段二最后冲刺阶段，全篇方案已基本成型！\n👉 请组员先**不要大改核心框架**，重点在研讨区协同分工：对全篇段落衔接与前后逻辑进行快速自查自校，做好收尾！`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              _timeMs: now
            };
            if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
            this.state.chatLogs.stage2.push(msg1);
            this.syncChatLogs();
            if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
            renderChat(this.state);

            // 🤖 动态调用审稿编辑 API：终审专注文字润色与内容把关（错别字/通顺/文风统一 + 内容逻辑），不再做格式排版检查
            setTimeout(async () => {
              const rawDoc = (s2.unifiedContent || '').replace(/<[^>]*>/g, '').trim();
              const topic = (this.state.stage1 && this.state.stage1.mergedTitle) ? this.state.stage1.mergedTitle : '本组课题';
              const sprintReviewPrompt = `团队课题《${topic}》已进入收尾冲刺阶段，请通读下方【小组当前真实正文草稿】全文，作为审稿编辑进行终审定稿把关，发表 130~150 字的微调建议：先肯定论证框架与内容完整度，再重点从 ①错别字与标点、②语句通顺与表达精准、③全篇文风与专业术语统一 三方面指出 1~2 处具体可改点，并顺带对内容逻辑或论证严密性给出 1 条把关提示；明确强调这是定稿前润色、不要推翻既有结构！`;

              let sprintReviewText = await callCozeAgentAPI('reviewingEditor', sprintReviewPrompt, { stage: 'stage2', topic, actualDoc: rawDoc });
              if (!sprintReviewText || sprintReviewText.trim().length === 0) {
                sprintReviewText = `⚠️ 【审稿编辑提示】：大模型终审质检生成超时或网络稍有延迟，请在讨论区发送"@审稿编辑 请对当前论文正文进行终审质检"重新获取真实终审报告。`;
              }

              const msg2 = {
                sender: 'reviewingEditor',
                text: sprintReviewText,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                _timeMs: Date.now()
              };
              if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
              this.state.chatLogs.stage2.push(msg2);
              this.syncChatLogs();
              if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
              renderChat(this.state);
            }, 1200);
          }
        }

        // ======================================================================
        // 🎓 阶段三：中间委员 (Neutral Committee Member) 裁决引导机制
        // ======================================================================
        else if (stage === 'stage3') {
          const s3 = this.state.stage3;
          if (!s3 || this.state.isFinalSubmitted) return;
          if (!this.stage3StartTime) this.stage3StartTime = now;
          const stage3DurationMs = now - this.stage3StartTime;

          const s3Chats = (this.state.chatLogs && this.state.chatLogs.stage3) ? this.state.chatLogs.stage3 : [];
          const lastStudentMsg = [...s3Chats].reverse().find(m => m.sender && m.sender !== 'neutral' && m.sender !== 'proponent' && m.sender !== 'opponent' && m.sender !== 'system');
          const lastStudentMsgTime = lastStudentMsg ? (lastStudentMsg._timeMs || 0) : this.stage3StartTime;
          const silenceDurationMs = now - lastStudentMsgTime;

          const feedbacks = Array.isArray(s3.feedbackItems) ? s3.feedbackItems : [];
          const pendingFeedbacks = feedbacks.filter(f => !f.response || f.response.trim().length === 0);

          // 1. 阶段三开场或讨论中静默超过 3 分钟：提示展开答辩研讨
          if (silenceDurationMs > 180000 && pendingFeedbacks.length > 0) {
            if (!this.lastS3SilenceNudgeTime || now - this.lastS3SilenceNudgeTime > 240000) {
              this.lastS3SilenceNudgeTime = now;
              const s3SilenceFallback = `🟡 【中间委员·答辩协商提示】：正反两方委员的评审意见已送达！\n• 请先回顾中间委员此前在聊天框给出的引导建议，再就反方质询点展开辩护讨论；\n• 商定好共识后，**推选一位组员代表全组**录入裁决矩阵，其余成员同步在正文中落实修改！`;
              this.queueAgentNudge('neutral', `正反两方评审意见已送达，但讨论区已静默一段时间。请以中间委员身份，引导大家先回看你此前在聊天框给出的引导建议，再就反方质询点展开辩护讨论，并给 1 条具体建议。80~120 字。`, s3SilenceFallback, 'stage3');
              return;
            }
          }

          // 2. 学生讨论活跃但左侧裁决矩阵答辩仍有未填写项：适时提示将答辩共识录入矩阵并修改终稿
          if (stage3DurationMs > 240000 && pendingFeedbacks.length > 0) {
            if (!this.lastS3MatrixNudgeTime || now - this.lastS3MatrixNudgeTime > 240000) {
              this.lastS3MatrixNudgeTime = now;
              const msg = {
                sender: 'neutral',
                text: `💡 【中间委员·矩阵录入与终稿落实提醒】：看到大家在讨论区已展开充分辩护交流！\n👉 请组员将商定好的辩护共识，**推选一位同学录入**到左侧【答辩裁决矩阵】对应质询下方并保存，同时点击【返回富文本协作大正文】将修改落实到论文终稿中！`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                _timeMs: now
              };
              if (!this.state.chatLogs.stage3) this.state.chatLogs.stage3 = [];
              this.state.chatLogs.stage3.push(msg);
              this.syncChatLogs();
              if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
              renderChat(this.state);
            }
          }
        }
      }, 10000);
    }

    async checkUnreadAnnouncements() {
      if (this.authManager && this.authManager.pullGlobalMeta) {
        try { await this.authManager.pullGlobalMeta(); } catch (e) {}
      }
      const currentUser = this.authManager.getCurrentUser();
      if (!currentUser || currentUser.isTeacher || currentUser.role === 'teacher') return;
      const effectiveClassId = this.state.activeStudentClassId || currentUser?.classId || 'class_101';
      const activeGroupObj = this.authManager.getStudentActiveGroup(currentUser, effectiveClassId);
      const groupId = activeGroupObj.id || (currentUser && currentUser.groupId ? currentUser.groupId : 'group_1');
      const myClassIds = new Set([effectiveClassId, currentUser?.classId, ...(currentUser?.classIds || [])].filter(Boolean));
      const activeTaskId = (this.state && this.state.activeTaskId) ? this.state.activeTaskId : 'task_default';
      const allTasks = this.authManager.getTasks();

      // 🛡️ 已经截止的任务通知不论看没看都不要再弹窗骚扰学生！
      const currentTask = allTasks.find(t => t.id === activeTaskId);
      if (currentTask && isTaskExpired(currentTask)) {
        return;
      }

      const allAnns = this.authManager.getAnnouncements();

      const isAnnRead = (a) => {
        if (!a) return false;
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

      // 过滤出本班/本组/本任务且未读的通知，且排除已截止任务的通知
      const unreadList = allAnns
        .filter(a => {
          if (a.taskId && a.taskId !== 'task_all') {
            const tObj = allTasks.find(t => t.id === a.taskId);
            if (tObj && isTaskExpired(tObj)) return false;
          }
          const matchClass = !a.classId || a.classId === 'all' || myClassIds.has(a.classId);
          const matchGroup = !a.targetGroupId || a.targetGroupId === 'all' || a.targetGroupId === groupId ||
            (Array.isArray(a.targetGroupIds) && (a.targetGroupIds.includes('all') || a.targetGroupIds.includes(groupId)));
          const matchTask = a.taskId === 'task_all' || a.taskId === activeTaskId || (!a.taskId && activeTaskId === 'task_default');
          return matchClass && matchGroup && matchTask && !isAnnRead(a);
        })
        .sort((a, b) => (b.id > a.id ? 1 : -1));

      // 🔔 实时感知任务延期并自动弹出专属弹窗通知（在线即时 + 离线下次登录补弹）
      if (currentTask && currentTask.deadline) {
        const uKey = currentUser.studentCode || currentUser.username || currentUser.id || 'u';
        const extAckKey = `jizhi_ack_ext_${uKey}_${activeTaskId}_${currentTask.deadline}`;
        const isExtAcknowledged = localStorage.getItem(extAckKey) === '1';

        if (!this._lastKnownDeadlineMap) this._lastKnownDeadlineMap = {};
        const prevDl = this._lastKnownDeadlineMap[activeTaskId];

        // 判定延期场景：① 在线时截止时间发生后移；② 离线首次登录感知到未读的延期记录
        const isOnlineExtended = prevDl && prevDl !== currentTask.deadline && (new Date(currentTask.deadline.replace(/-/g, '/')).getTime() > new Date(prevDl.replace(/-/g, '/')).getTime());
        const isOfflineExtensionUnread = !isExtAcknowledged && currentTask.lastExtension && (new Date(currentTask.deadline.replace(/-/g, '/')).getTime() > Date.now());

        if (isOnlineExtended || isOfflineExtensionUnread) {
          localStorage.setItem(extAckKey, '1');
          this.showTaskExtensionModal(currentTask, currentTask.lastExtension);
        }
        this._lastKnownDeadlineMap[activeTaskId] = currentTask.deadline;
      }

      if (unreadList.length > 0) {
        this.showAnnouncementModal(unreadList[0], true);
      }
    }

    showTaskExtensionModal(task, extInfo = null) {
      document.querySelectorAll('.task-ext-modal').forEach(el => el.remove());
      const durationDesc = extInfo?.extendDurationStr || '指定时长';
      const newDl = task.deadline || '未定';

      const modal = document.createElement('div');
      modal.className = 'modal-overlay task-ext-modal';
      modal.innerHTML = `
        <div style="width:480px; max-width:92vw; background:#ffffff; border-radius:16px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.25); border:1px solid #e2e8f0; overflow:hidden; animation:modalFadeIn 0.25s ease;">
          <div style="background:linear-gradient(135deg, #1d4ed8, #2563eb); color:white; padding:18px 24px; display:flex; justify-content:space-between; align-items:center;">
            <div style="display:flex; align-items:center; gap:10px;">
              <span style="font-size:24px; background:rgba(255,255,255,0.2); border-radius:10px; padding:4px 8px;">⏳</span>
              <div>
                <h3 style="margin:0; font-size:17px; font-weight:800; color:white;">写作任务时间已延长</h3>
                <div style="font-size:11.5px; opacity:0.9; margin-top:2px;">任课教师最新发布的教学时间调整通知</div>
              </div>
            </div>
            <button id="btn-close-ext-x" style="background:rgba(255,255,255,0.2); border:none; color:white; font-size:16px; border-radius:8px; width:30px; height:30px; cursor:pointer;">✕</button>
          </div>
          <div style="padding:24px; background:#ffffff;">
            <div style="background:#eff6ff; border:1.5px solid #bfdbfe; border-radius:12px; padding:16px 18px; margin-bottom:18px;">
              <div style="font-size:14px; font-weight:800; color:#1e40af; margin-bottom:8px; display:flex; align-items:center; gap:6px;">
                <span>📌 任务名称：</span>
                <span>《${task.title}》</span>
              </div>
              <div style="font-size:13.5px; color:#1e3a8a; display:flex; align-items:center; gap:6px; margin-bottom:6px;">
                <span>⚡ 延长时长：</span>
                <span style="font-weight:800; color:#2563eb;">延长了 ${durationDesc}</span>
              </div>
              <div style="font-size:13.5px; color:#1e3a8a; display:flex; align-items:center; gap:6px;">
                <span>📅 最新截止时间：</span>
                <span style="font-weight:800; color:#059669; font-size:14px;">${newDl}</span>
              </div>
            </div>
            <div style="font-size:13px; color:#475569; line-height:1.6; margin-bottom:6px;">
              📢 各写作小组工作台已自动恢复正常编辑权限。请各位同学相互配合，在新的截止时间前高质量完成协同论文撰写与答辩！
            </div>
          </div>
          <div style="padding:14px 24px; background:#f8fafc; border-top:1px solid #e2e8f0; text-align:right;">
            <button id="btn-confirm-task-ext-ok" style="background:linear-gradient(135deg, #1d4ed8, #2563eb); color:white; border:none; padding:10px 26px; border-radius:8px; font-size:13.5px; font-weight:700; cursor:pointer; box-shadow:0 3px 10px rgba(37,99,235,0.25);">
              📋 我知道了，继续协作
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      const closeExtModal = () => {
        modal.remove();
        this.renderStudentWorkspace(true);
      };

      modal.querySelector('#btn-close-ext-x').addEventListener('click', closeExtModal);
      modal.querySelector('#btn-confirm-task-ext-ok').addEventListener('click', closeExtModal);
      modal.addEventListener('click', (e) => { if (e.target === modal) closeExtModal(); });
    }

    showAnnouncementModal(targetAnn = null, isSequentialFlow = false) {
      document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
      const currentUser = this.authManager.getCurrentUser();
      const effectiveClassId = this.state.activeStudentClassId || currentUser?.classId || 'class_101';
      const activeGroupObj = this.authManager.getStudentActiveGroup(currentUser, effectiveClassId);
      const groupId = activeGroupObj.id || (currentUser && currentUser.groupId ? currentUser.groupId : 'group_1');
      const activeTaskId = (this.state && this.state.activeTaskId) ? this.state.activeTaskId : 'task_default';
      const allAnns = this.authManager.getAnnouncements();

      const isAnnRead = (a) => {
        if (!a) return false;
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

      // 严格过滤当前班级、小组、当前任务可见的通知，按最新发布倒序排
      const myAnns = allAnns
        .filter(a => {
          const matchClass = !a.classId || a.classId === 'all' || a.classId === effectiveClassId;
          const matchGroup = !a.targetGroupId || a.targetGroupId === 'all' || a.targetGroupId === groupId ||
            (Array.isArray(a.targetGroupIds) && (a.targetGroupIds.includes('all') || a.targetGroupIds.includes(groupId)));
          const matchTask = a.taskId === 'task_all' || a.taskId === activeTaskId || (!a.taskId && activeTaskId === 'task_default');
          return matchClass && matchGroup && matchTask;
        })
        .sort((a, b) => (b.id > a.id ? 1 : -1));

      if (myAnns.length === 0) {
        if (!isSequentialFlow) alert('📢 暂无课堂教学通知！');
        return;
      }

      // 计算当前学生个人的未读列表（从新到旧）
      const unreadList = myAnns.filter(a => !isAnnRead(a));

      // 如果当前是自动弹出流且已无任何未读通知，直接静默退出
      if (isSequentialFlow && unreadList.length === 0) {
        return;
      }

      // 选中的通知：优先 targetAnn，若无则取最新未读，再无则取最新一条通知
      const selectedAnn = targetAnn || (unreadList.length > 0 ? unreadList[0] : myAnns[0]);
      const isSelectedRead = isAnnRead(selectedAnn);

      // 计算当前在未读流中的序号
      const unreadIndex = unreadList.findIndex(a => a.id === selectedAnn.id);
      const queueBadge = unreadList.length > 0 && !isSelectedRead
        ? `<span style="background:rgba(239,68,68,0.25); border:1px solid #f87171; color:#ffffff; padding:2px 8px; border-radius:10px; font-size:11px; margin-left:6px;">待确认 ${unreadIndex >= 0 ? unreadIndex + 1 : 1}/${unreadList.length}</span>`
        : '';

      const allTasks = this.authManager.getTasks();
      const annTaskObj = allTasks.find(t => t.id === selectedAnn.taskId);
      const isAnnTaskExpired = isTaskExpired(annTaskObj);

      const modal = document.createElement('div');
      modal.className = 'modal-overlay modal-announcement-popup';
      modal.dataset.annId = selectedAnn.id;
      modal.innerHTML = `
        <div style="width:620px; max-width:94vw; background:#ffffff; border-radius:16px; box-shadow:0 25px 50px -12px rgba(15,23,42,0.25); overflow:hidden; border:1px solid #e2e8f0; animation:modalFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);">

          <!-- 渐变高颜值头部 -->
          <div style="background:linear-gradient(135deg, ${isAnnTaskExpired ? '#991b1b, #dc2626' : '#4338ca, #6366f1'}); padding:20px 24px; display:flex; justify-content:space-between; align-items:center; color:#ffffff;">
            <div style="display:flex; align-items:center; gap:12px;">
              <div style="width:42px; height:42px; border-radius:12px; background:rgba(255,255,255,0.2); display:flex; align-items:center; justify-content:center; font-size:22px; flex-shrink:0;">
                ${isAnnTaskExpired ? '🛑' : '🔔'}
              </div>
              <div>
                <div style="display:flex; align-items:center;">
                  <h3 style="margin:0; font-size:17.5px; font-weight:800; color:#ffffff; letter-spacing:0.3px;">课堂教学通知</h3>
                  ${queueBadge}
                </div>
                <div style="font-size:12px; color:#e0e7ff; margin-top:2px;">${isAnnTaskExpired ? '⚠️ 该通知关联任务已截止，仅供查阅历史教学指示' : '任课教师即时推送的教学指示与随附教学资源'}</div>
              </div>
            </div>
            <button id="btn-close-ann-popup" style="background:rgba(255,255,255,0.15); border:1px solid rgba(255,255,255,0.3); width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:#ffffff; font-size:14px; transition:all 0.15s ease;">✕</button>
          </div>

          <!-- 通知内容主体 (带历史通知切换 TAB) -->
          <div style="padding:20px 24px; max-height:65vh; overflow-y:auto; display:flex; flex-direction:column; gap:16px;">

            ${myAnns.length > 1 ? `
              <!-- 多条通知从新到旧快捷切换栏 -->
              <div style="display:flex; gap:8px; overflow-x:auto; padding-bottom:6px;">
                ${myAnns.map((a, idx) => {
                  const isRead = isAnnRead(a);
                  const isCurrent = a.id === selectedAnn.id;
                  return `
                    <button class="btn-switch-ann-tab" data-id="${a.id}" style="padding:6px 12px; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer; border:1px solid ${isCurrent ? '#6366f1' : '#e2e8f0'}; background:${isCurrent ? '#eef2ff' : '#ffffff'}; color:${isCurrent ? '#4338ca' : '#64748b'}; white-space:nowrap; display:inline-flex; align-items:center; gap:6px;">
                      ${isRead ? '✅' : '🔴'} 通知 ${idx + 1}${idx === 0 ? ' (最新)' : ''}
                    </button>
                  `;
                }).join('')}
              </div>
            ` : ''}

            <!-- 选中的通知卡片详情 -->
            <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:14px; padding:18px; box-shadow:0 2px 8px rgba(15,23,42,0.03);">

              <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px; margin-bottom:12px;">
                <h4 style="margin:0; font-size:16.5px; font-weight:800; color:#0f172a; line-height:1.4;">
                  📢 ${escapeHtml(selectedAnn.title)}
                </h4>
                <span style="font-size:11.5px; color:#64748b; white-space:nowrap;">${escapeHtml(selectedAnn.time || '')}</span>
              </div>

              <!-- 标签栏 -->
              <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:14px;">
                <span style="background:#f8fafc; color:#475569; border:1px solid #e2e8f0; padding:3px 10px; border-radius:6px; font-size:11.5px; font-weight:700;">
                  👨‍🏫 发布教师: <b>${escapeHtml(selectedAnn.author || '任课教师')}</b>
                </span>
                <span style="background:#f5f3ff; color:#7c3aed; border:1px solid #ddd6fe; padding:3px 10px; border-radius:6px; font-size:11.5px; font-weight:700;">
                  📌 关联任务: <b>${escapeHtml(selectedAnn.taskTitle || '全流程写作')}</b>
                </span>
                <span style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; padding:3px 10px; border-radius:6px; font-size:11.5px; font-weight:700;">
                  🎯 受众: <b>${escapeHtml(selectedAnn.targetGroupName || '全班所有小组')}</b>
                </span>
                ${isAnnTaskExpired ? `
                  <span style="background:#fef2f2; color:#dc2626; border:1px solid #fecaca; padding:3px 10px; border-radius:6px; font-size:11.5px; font-weight:800;">
                    🛑 任务已截止 · 只读查阅
                  </span>
                ` : (isSelectedRead ? `
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
                ${escapeHtml(selectedAnn.content || '')}
              </div>

              <!-- 附件卡片 (如有) -->
              ${selectedAnn.attachment ? `
                <div style="margin-top:14px; background:#faf5ff; border:1px solid #e9d5ff; border-radius:10px; padding:12px 16px; display:flex; justify-content:space-between; align-items:center; gap:12px;">
                  <div style="display:flex; align-items:center; gap:10px;">
                    <span style="font-size:24px;">📎</span>
                    <div>
                      <div style="font-size:13px; font-weight:700; color:#6b21a8;">${selectedAnn.attachment.name}</div>
                      <div style="font-size:11px; color:#9333ea; margin-top:2px;">教学随附资源文献 (${selectedAnn.attachment.size || '附件'})</div>
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
            <button id="btn-read-confirm" style="flex:1; background:${isSelectedRead ? '#e2e8f0' : 'linear-gradient(135deg, #059669, #047857)'}; color:${isSelectedRead ? '#64748b' : '#ffffff'}; border:none; padding:11px 24px; border-radius:8px; font-size:13.5px; font-weight:700; cursor:pointer; box-shadow:${isSelectedRead ? 'none' : '0 3px 10px rgba(5,150,105,0.2)'}; display:inline-flex; align-items:center; justify-content:center; gap:6px;">
              ${isSelectedRead ? '✅ 本条已确认已读 (点击关闭/下一条)' : (unreadList.length > 1 ? `✅ 确认本条已读并看下一条 (${unreadIndex + 1}/${unreadList.length}) ➔` : '✅ 我已阅读并确认 (已同步至教师端)')}
            </button>
          </div>

        </div>
      `;
      document.body.appendChild(modal);

      const closeModal = () => modal.remove();
      modal.querySelector('#btn-close-ann-popup').addEventListener('click', closeModal);
      modal.querySelector('#btn-close-ann-bottom').addEventListener('click', closeModal);
      modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

      // TAB 切换
      modal.querySelectorAll('.btn-switch-ann-tab').forEach(btn => {
        btn.addEventListener('click', () => {
          const annId = btn.dataset.id;
          const target = myAnns.find(a => a.id === annId);
          if (target) {
            closeModal();
            this.showAnnouncementModal(target, false);
          }
        });
      });

      const downloadBtn = modal.querySelector('#btn-download-ann-file');
      if (downloadBtn && selectedAnn.attachment) {
        downloadBtn.addEventListener('click', () => {
          downloadFileBlob(selectedAnn.attachment.name);
        });
      }

      const confirmBtn = modal.querySelector('#btn-read-confirm');
      if (confirmBtn) {
        confirmBtn.addEventListener('click', () => {
          confirmBtn.style.pointerEvents = 'none';
          confirmBtn.textContent = '✅ 已确认';

          // 1. 标记本条为已读 (个人独立已读 + 小组聚合)
          this.authManager.markAnnouncementRead(selectedAnn.id, groupId);
          closeModal();

          const allTasks = this.authManager.getTasks();

          // 2. 重新获取严格属于【当前班级 + 当前任务 + 当前小组】的未读通知列表（排除刚刚已确认的本条与已截止任务）
          const updatedAllAnns = this.authManager.getAnnouncements();
          const nextUnreads = updatedAllAnns
            .filter(a => {
              if (a.id === selectedAnn.id) return false;
              if (a.taskId && a.taskId !== 'task_all') {
                const tObj = allTasks.find(t => t.id === a.taskId);
                if (tObj && isTaskExpired(tObj)) return false;
              }
              const matchClass = !a.classId || a.classId === 'all' || a.classId === effectiveClassId;
              const matchGroup = !a.targetGroupId || a.targetGroupId === 'all' || a.targetGroupId === groupId ||
                (Array.isArray(a.targetGroupIds) && (a.targetGroupIds.includes('all') || a.targetGroupIds.includes(groupId)));
              const matchTask = a.taskId === 'task_all' || a.taskId === activeTaskId || (!a.taskId && activeTaskId === 'task_default');
              return matchClass && matchGroup && matchTask && !isAnnRead(a);
            })
            .sort((a, b) => (b.id > a.id ? 1 : -1));

          // 3. 如果当前任务还有未读通知，自动连续弹出下一条让学生一一确认；如果全确认完则刷新当前视图
          if (nextUnreads.length > 0) {
            setTimeout(() => this.showAnnouncementModal(nextUnreads[0], true), 200);
          } else {
            if (window.app && window.app.showNotification) {
              window.app.showNotification('🎉 所有课堂通知已确认已读');
            }
            if (this.state.studentViewMode === 'task_list') {
              this.renderMain();
            } else {
              this.renderStudentWorkspace();
            }
          }
        });
      }
    }

    showQuestionnaireModal() {
      document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
      const currentUser = this.authManager.getCurrentUser();
      const currentClassId = currentUser && currentUser.classId ? currentUser.classId : 'class_101';
      const currentTaskId = this.state.activeTaskId || 'task_default';
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
      const groupId = user && user.groupId ? user.groupId : (this.state.activeMonitorGroupId || 'group_1');
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
                      ${p.fileName ? `
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
        btn.addEventListener('click', () => {
          const paperId = btn.dataset.id;
          const paper = papers.find(p => p.id === paperId);
          if (paper) {
            if (paper.fileUrl) {
              const a = document.createElement('a');
              a.href = paper.fileUrl;
              a.download = paper.fileName || '学术参考范文.pdf';
              a.target = '_blank';
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
            } else if (paper.fileData || (window._paperMemoryBlobMap && window._paperMemoryBlobMap.get(paperId))) {
              const fileData = paper.fileData || window._paperMemoryBlobMap.get(paperId);
              const a = document.createElement('a');
              a.href = fileData;
              a.download = paper.fileName || '学术参考范文.pdf';
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
            } else {
              downloadFileBlob(paper.fileName);
            }
          }
        });
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
            const studentCode = currentUser ? (currentUser.studentCode || currentUser.id || 'A') : 'A';
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

        // ── 🧠 【研讨语义认知与共识判定引擎】：三阶段动态监听与智能体精准自适应介入 ──

        // 🎪 阶段一（学术拍卖会）多轮共识流转
        if (currentStage === 'stage1' && !this.state.stage1.contract.isDraftGenerated && !this.state.stage1.contract.isConfirmed) {
          const s1 = this.state.stage1;
          // 1. 若处于【分歧协商】状态，识别组员是否讨论并收敛出了融合选题
          if (this.state.stage1PendingDivergence) {
            const isTopicConsensusSignal = /(?:结合|融合|就定|赞成|同意|按照|定这个|选题|题目|基于|好主意|没问题|支持|统一)/i.test(text);
            if (isTopicConsensusSignal) {
              this.state.stage1PendingDivergence = false;
              this.state.stage1PendingRefinement = true;
              setTimeout(async () => {
                const refinePrompt = `小组成员已在讨论区就融合研究论题达成初步共识。
  请作为资深学术拍卖师，发表 130~150 字的【课题深度细化建议】：
  ① 肯定该融合选题的学术价值与实践创新点；
  ② 给出 2~3 个具体的研究落脚点建议（如核心变量界定、具体实证情境或测量视角），启发组员深度推敲；
  ③ 鼓励组员就细化方案继续交流，暂时不要急于填表！`;

                let refineText = await callCozeAgentAPI('auctioneer', refinePrompt, { stage: 'stage1', topic: s1.mergedTitle || '本组融合课题' });
                if (!refineText || refineText.trim().length === 0) {
                  refineText = `🤖 【拍卖师·课题细化建议】：小组成员已就融合论题达成共识！为了让方案更加扎实，建议大家围绕以下几点进一步推敲：① 明确核心自变量与因变量的具体界定；② 细化实证研究的具体对象与实验情境；③ 初步构想测量工具与数据收集方式。请大家在讨论区继续交流细化！`;
                }
                const promptMsg = {
                  sender: 'auctioneer',
                  text: refineText,
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  _timeMs: Date.now()
                };
                if (!this.state.chatLogs.stage1) this.state.chatLogs.stage1 = [];
                this.state.chatLogs.stage1.push(promptMsg);
                this.syncChatLogs();
                if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
                renderChat(this.state);
              }, 1200);
            }
          }
          // 2. 若处于【方案细化】状态，识别组员是否讨论了具体方案细节并准备分工
          else if (this.state.stage1PendingRefinement) {
            const isRefineDoneSignal = /(?:变量|情境|对象|方法|问卷|量表|实验|设计|理论|框架|差不多|定好|开始分工|怎么分)/i.test(text);
            if (isRefineDoneSignal) {
              this.state.stage1PendingRefinement = false;
              this.state.stage1PendingTasks = true;
              setTimeout(async () => {
                const taskPromptMsg = {
                  sender: 'auctioneer',
                  text: `🤖 【拍卖师·分工与时间规划提示】：课题细化方向已基本成型！建议大家在讨论区根据具体研究内容（如谁负责文献理论推导、谁设计实证量表与实验流程）自然商定各自的分工认领与时间分配；商定完成后，点击左侧【🤖 AI 辅助生成公约草案】即可一键生成！`,
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  _timeMs: Date.now()
                };
                if (!this.state.chatLogs.stage1) this.state.chatLogs.stage1 = [];
                this.state.chatLogs.stage1.push(taskPromptMsg);
                this.syncChatLogs();
                if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
                renderChat(this.state);
              }, 1200);
            }
          }
        }

        // 📰 阶段二（学术编辑部）双研讨闭环
        if (currentStage === 'stage2') {
          // Loop 1: 半程自查播报后，监听学生针对分歧商讨达成共识 -> 唤醒审稿编辑下发清单
          if (this.state.stage2PendingReviewing) {
            this.state.stage2PendingReviewing.studentMsgCount = (this.state.stage2PendingReviewing.studentMsgCount || 0) + 1;
            const isConsensusSignal = /(?:对齐|同意|商量好了|商定好了|修改|明白了|收到|按这个改|@审稿编辑|统一了|没问题|行|结合)/i.test(text);
            const hasSufficientChat = this.state.stage2PendingReviewing.studentMsgCount >= 2;
            if (isConsensusSignal || hasSufficientChat) {
              setTimeout(() => {
                this.triggerReviewingEditorAfterDiscussion();
              }, 1200);
              return;
            }
          }
          // Loop 2: 清单下发后，监听学生针对具体正文修改策略进行讨论
          if (this.state.stage2PendingRevisionDiscussion) {
            const isRevisionStrategySignal = /(?:文献|量表|改|加|写|段落|引言|方法|反思|我来|你来|章节|修改|补充|润色|动笔)/i.test(text);
            if (isRevisionStrategySignal) {
              this.state.stage2PendingRevisionDiscussion = false;
              this.state.stage2DualActivityActive = true; // 激活动笔双静默守护
            }
          }
        }

        // 🎓 阶段三（答辩擂台）逐条推进与主席精准总结
        if (currentStage === 'stage3' && this.state.stage3ActivePoint === 1) {
          this.state.stage3Point1ChatCount = (this.state.stage3Point1ChatCount || 0) + 1;
          const isDefenseSignal = /(?:前测|控制|效度|协变量|样本|反思|辩护|采纳|解释|指标|修改|针对|理由|补充|同意)/i.test(text);
          if (this.state.stage3Point1ChatCount >= 2 || isDefenseSignal) {
            this.state.stage3ActivePoint = 'summarized_1';
            setTimeout(async () => {
              const topic = (this.state.stage1 && this.state.stage1.mergedTitle) ? this.state.stage1.mergedTitle : '本组研究设计';
              const chairSummaryPrompt = `小组成员已就反方委员的【第 1 条质询】在讨论区展开了充分的学术辩护研讨。
  请通读组内最新讨论发言，作为答辩委员会主席（中间委员），发表 100~130 字的【全组辩护决断精准总结】：
  ① 简明扼要提炼全组商定出的核心辩护理由与正文落地修改动作；
  ② 提示组员推选一位代表将本条总结结论录入左侧【答辩裁决矩阵】对应项并保存，随后推进至下一条质询！`;

              let chairSummaryText = await callCozeAgentAPI('neutral', chairSummaryPrompt, { stage: 'stage3', topic, queryPoint: 1 });
              if (!chairSummaryText || chairSummaryText.trim().length === 0) {
                chairSummaryText = `🟡 【中间委员·辩护共识提炼】：全组针对质询 1 的辩护思路已非常清晰！主要共识：采纳反方建设性意见，在对应章节补充前测同质性检验与协变量控制说明。👉 请推选一位组员代表全组将本条总结录入左侧【答辩裁决矩阵】保存，完成后我们继续推进第 2 条质询！`;
              }
              const chairMsg = {
                sender: 'neutral',
                text: chairSummaryText,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                _timeMs: Date.now()
              };
              if (!this.state.chatLogs.stage3) this.state.chatLogs.stage3 = [];
              this.state.chatLogs.stage3.push(chairMsg);
              this.syncChatLogs();
              if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
              renderChat(this.state);
            }, 1500);
          }
        }

        // ── 情绪与同伴安抚感知：检测负向情绪与同伴是否进行安抚 ──
        const isNegativeEmotion = /(?:太难了|写不出来|不想写|没意义|烦死了|吵什么|凭什么|搞不懂|放弃了|头疼)/i.test(text);
        const isPeerSupportSignal = /(?:没事|我来写|我来帮|我们一起|别急|慢慢来|别慌|大家商量|赞同你|没关系)/i.test(text);

        if (isNegativeEmotion) {
          this.pendingNegativeEmotion = { sender: studentCode, time: Date.now(), text: text };
        } else if (isPeerSupportSignal && this.pendingNegativeEmotion) {
          // 同伴已主动给出暖心安抚，智能体保持安静，让学生自主发挥同伴互助
          this.pendingNegativeEmotion = null;
        }

        // 若同伴在 60 秒内未予回应或继续出现消极，对应阶段智能体精准介入安抚（提取为方法，发送与静默轮询共用，见审查 #45）
        this.checkEmotionComfort(currentStage);

        this.triggerAgentReplyIfNeeded(text);
      };

      sendBtn.addEventListener('click', handleSend);
      input.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSend(); });
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
      const targetAgent = (stage === 'stage1') ? 'auctioneer' : ((stage === 'stage2') ? 'managingEditor' : 'neutral');
      const agentTitle = (stage === 'stage1') ? '拍卖师' : ((stage === 'stage2') ? '责任编辑' : '中间委员');
      const emotionPromptMsg = {
        sender: targetAgent,
        text: `🤝 【${agentTitle}·协同支持】：关注到大家在协作中遇到了难点！学术方案设计本身就是一个不断推敲和迭代的过程，遇到卡点非常正常。建议大家在讨论区交流具体哪个环节需要支持，团队分工互助、取长补短，稳步推进！`,
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
      // 阶段一专属里程碑：学生在研讨中商定好分工/时间并确认时触发拍卖师生成合约
      const isContractFinalizeSignal = stage === 'stage1' && /(?:分工确定|确定分工|商定好了|分工好了|确定主题|生成合约|确认分工|时间分配好了|分配完毕|达成共识)/i.test(userMsg);

      if (!isExplicitMention && !isContractFinalizeSignal) {
        this._isAgentReplyInProgress = false;
        return;
      }

      let replyAgent = null;

      if (isContractFinalizeSignal) {
        replyAgent = 'auctioneer';
      } else if (userMsg.includes('@中间委员') || userMsg.includes('@中间委员 Agent')) {
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

      const voteMsg = { 
        sender: user, 
        text: `📢 [投票告知]: 我已确认投票支持提案《${proposalTitle}》！（当前全组已集齐 ${votesCastCount}/${totalMembersCount} 票）`, 
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        _timeMs: Date.now()
      };
      if (!this.state.chatLogs.stage1) this.state.chatLogs.stage1 = [];
      this.state.chatLogs.stage1.push(voteMsg);
      this.syncStage1();
      this.syncChatLogs();
      if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();

      // 🌟 弹出温和、清晰、带有进度告知的友好弹窗
      alert(`🎉 投票成功！\n\n您已成功投票支持提案《${proposalTitle}》！\n\n📊 当前全组投票进度：${votesCastCount}/${totalMembersCount} 人已完成。\n💡 每位成员仅有一次投票机会，请耐心等待组内其他同学完成投票，全员投完后拍卖师将揭晓竞拍结果！`);

      if (votesCastCount >= totalMembersCount) {
        // ── 全员投票完成：调用大模型拍卖师 API 动态生成专业落槌播报与研讨引导 ──
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
            this.state.stage1PendingTasks = true;
          } else {
            this.state.stage1PendingDivergence = true;
          }

          if (!s1.contract.timeAllocations) {
            s1.contract.timeAllocations = { background: 25, literature: 30, questions: 25, method: 40, reflection: 20, references: 10 };
          }

          let voteContextPrompt = '';
          if (isUnanimous) {
            voteContextPrompt = `全组投票已全部完成！计票结果清单：${proposalSummaryList}。全组成员 ${totalMembersCount}/${totalMembersCount} 全票一致推选《${winningProposal.title}》！
  请作为资深学术拍卖师发表 130~150 字的【全票一致落槌定题与细化建议】：
  ① 隆重宣布竞拍落槌结果，肯定《${winningProposal.title}》获得全票一致认同，正式确立为全组研究课题；
  ② 针对该选题给出 2~3 条具体的细化方向建议（【核心铁律】：此时绝对不提及分工与时间！）；
  ③ 引导组员在讨论区发起交流，全组共同商议完善具体实施方案。`;
          } else {
            voteContextPrompt = `全组投票已全部完成！计票结果清单：${proposalSummaryList}。投票存在分歧（未达成全票一致）！
  请作为资深学术拍卖师发表 130~150 字的【分歧协商破冰引导】：
  ① 客观播报票数分布清单（【严格铁律】：严禁指名道姓批评，严禁提及谁投了谁）；
  ② 引导各提案作者在讨论区简要阐述各自构想的核心亮点，商讨如何取长补短、求同存异；
  ③ 引导全组在讨论区深入协商，确定一个兼具理论深度与实践可行性的最终统一主题（既可选用多数人看好的主题，亦可融合各方亮点）。`;
          }

          let summaryText = await callCozeAgentAPI('auctioneer', voteContextPrompt, {
            stage: 'stage1',
            isUnanimous,
            winningTopic: winningProposal ? winningProposal.title : '',
            tallySummary: proposalSummaryList
          });

          if (!summaryText || summaryText.trim().length === 0) {
            if (isUnanimous) {
              summaryText = `🎉 【拍卖师·课题敲定告知】：全员投票已完成，计票结果：${proposalSummaryList}。《${winningProposal.title}》获得全票一致推选，正式确立为全组研究课题！\n⚠️ 拍卖师智能体发言生成超时，组员可直接在讨论区发起交流、组织全组细化研究方案与分工。`;
            } else {
              summaryText = `⚖️ 【拍卖师·分歧协商告知】：投票已落槌，计票结果：${proposalSummaryList}。组内对选题存在票数分歧，请各提案作者在讨论区阐明设计亮点，全组共同商讨确定最终课题。\n⚠️ 拍卖师智能体发言生成超时，如需智能引导可在讨论区 @拍卖师。`;
            }
          }

          const summaryMsg = { sender: 'auctioneer', text: summaryText, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), _timeMs: Date.now() };
          this.state.chatLogs.stage1.push(summaryMsg);
          this.syncStage1();
          this.syncChatLogs();
          if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
          renderChat(this.state);
          this.renderStudentWorkspace();
        }, 800);
      }
      this.renderStudentWorkspace();
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

      const effectiveClassId = (isTeacher ? this.state.activeClassId : this.state.activeStudentClassId) || currUser?.classId || 'class_101';
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
            text: `🤝 【责任编辑开场】：欢迎来到【阶段二：学术编辑部】！我是过程学伴责任编辑。\n全组已锁定研究主题《${topic}》。\n\n📜 【阶段一公约执行与协同提醒】\n• 基础分工: ${assignSummary.join(' | ') || '全员协作'}\n• 规划时间: ${timeSummary.join(' / ') || '按需推进'}\n\n💡 **真正的协同不仅是分工起草，更要主动研读同伴写下的段落，在研讨区互评互修、打通前后逻辑！**请大家进入左侧编辑器开启深度协作！`,
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
              text: `📝 【审稿编辑提醒】：为辅助各位高效产出高质量学术论文，已为本组匹配并推送了《课程学术参考范文库》！请大家点击上方【📚 查阅参考范文】查阅学习，注意正文三线表规范与研究设计严谨度！`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              _timeMs: Date.now()
            };
            logs.push(reviewingWelcome);
            this.sendSingleChatMessage(reviewingWelcome, 'stage2');
            if (typeof window.renderChat === 'function') window.renderChat(this.state);
          }, 3200);
        }
      }

      // 🎓 阶段三：严格按时序：① 中间委员开场 ➔ ② 正方肯定 ➔ ③ 反方质询 ➔ ④ 平台写入矩阵 ➔ ⑤ 中间委员抛题引导
      else if (stage === 'stage3') {
        const hasNeutralIntro = logs.some(m => m && m.sender === 'neutral' && (m.text?.includes('欢迎来到【阶段三：答辩擂台】') || m.text?.includes('中间委员开场')));
        if (!hasNeutralIntro && !this.state.stage3IntroStarted) {
          this.state.stage3IntroStarted = true;
          const neutralWelcome = {
            id: `msg_welcome_${taskId}_${groupId}_stage3_neutral`,
            sender: 'neutral',
            senderName: '中间委员 · 裁决引导',
            text: `🟡 【中间委员开场】：各位研究者，欢迎来到【阶段三：答辩擂台】！初稿撰写完毕，答辩委员会已就位，接下来将由正方委员与反方委员分别发表评审意见！`,
            timestamp: now,
            _timeMs: Date.now()
          };
          logs.unshift(neutralWelcome);
          this.sendSingleChatMessage(neutralWelcome, 'stage3');
          if (typeof window.renderChat === 'function') window.renderChat(this.state);

          const topic = (this.state.stage1 && this.state.stage1.mergedTitle) ? this.state.stage1.mergedTitle : '本组研究设计';
          const rawContent = (this.state.stage2 && this.state.stage2.unifiedContent) ? this.state.stage2.unifiedContent.replace(/<[^>]*>/g, '').trim() : '';

          // 2. 依次异步调用【正方】与【反方】
          setTimeout(async () => {
            const propPrompt = `针对小组论文《${topic}》，请通读下方【小组当前真实正文草稿】全文，作为答辩正方委员，发表 130~150 字的评审意见：
  ① 至少提炼 2 个具体优点（既包含学术层面的立意与设计亮点，也包含行文风格与结构规范亮点）；
  ② 明确指出具体段落（如【一、研究背景】或【二、文献综述】）的论证优势，给予具体肯定的学术支持！`;

            let propText = await callCozeAgentAPI('proponent', propPrompt, { stage: 'stage3', topic, actualDoc: rawContent });
            if (!propText || propText.trim().length === 0) {
              propText = `⚠️ 【正方委员提示】：大模型生成超时或网络稍有延迟，可在讨论区发送"@正方委员 请发表立论支持"重新获取。`;
            }
            logs.push({
              sender: 'proponent',
              text: propText,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              _timeMs: Date.now()
            });
            this.syncChatLogs();
            renderChat(this.state);

            setTimeout(async () => {
              const oppPrompt = `针对小组论文《${topic}》，请通读下方【小组当前真实正文草稿】全文，结合正方委员意见，作为答辩反方委员，发表 130~150 字的辩证审视与质询意见：

  【正方委员刚才的肯定意见参考】:
  ${propText}

  【最高原则与正反博弈边界】：正方明确夸赞的具体局部段落与具体事实严禁唱反调；但对于未被明确夸赞的具体内容维度（即使在同一章节，例如正方夸了背景立意新颖，你仍可质询其具体实证数据支撑不足），以及全篇方案的落地可行性、样本控制、量表信效度检验、行文通顺与测量严密性等，提出至少 2 个具体的学术质询点（用 ①② 分条呈现）！`;

              let oppText = await callCozeAgentAPI('opponent', oppPrompt, { stage: 'stage3', topic, actualDoc: rawContent });
              const oppSucceeded = !!(oppText && oppText.trim().length > 0);
              if (!oppSucceeded) {
                oppText = `⚠️ 【反方委员提示】：大模型生成超时或网络稍有延迟，可在讨论区发送"@反方委员 请发表辩证质询"重新获取。`;
              }
              logs.push({
                sender: 'opponent',
                text: oppText,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                _timeMs: Date.now()
              });

              // 平台自动将正反评审意见写入左侧【答辩裁决矩阵】；仅当反方调用成功时才自动解析，失败时留空待学生手动录入，绝不把"超时提示"当成质询写入
              if (oppSucceeded && (!this.state.stage3.feedbackItems || this.state.stage3.feedbackItems.length === 0)) {
                // 🛡️ 反方质询必须从 Coze 反方委员真实发言中解析，绝不写死；有多少条质询就写入多少条，确保矩阵与讨论区内容完全一致
                const oppBody = (oppText || '').replace(/^[^\n]*?【[^】]+】[：:]?\s*/, '').trim();
                const oppMatches = oppBody.match(/[①②③④⑤][^①②③④⑤]*/g);
                const oppQueries = (oppMatches && oppMatches.length > 0)
                  ? oppMatches.map(s => s.trim()).filter(s => s.length > 0)
                  : [oppBody];
                this.state.stage3.feedbackItems = [
                  { id: 'fb_prop', role: 'proponent', speaker: '正方委员 Agent (肯定支持)', title: '立论支持', content: propText.replace(/^[^\n]*?【[^】]+】[：:]?\s*/, ''), response: '', status: 'adopted' }
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
                this.syncStage3();
                this.renderStudentWorkspace();
              }

              this.syncChatLogs();
              renderChat(this.state);

              // 5. 中间委员独立调用 Coze API，引导第 1 题辩护
              setTimeout(async () => {
                const chairPrompt = `答辩正反两方意见已发表完毕。
  【正方意见】: ${propText}
  【反方质询】: ${oppText}

  请作为答辩委员会主席（中间委员），发表 130~150 字的主持引导：
  ① 肯定正反双方的交锋为方案完善提供了宝贵契机；
  ② 【逐条推进】：引导全组开场首先聚焦反方【第 1 条质询】，在讨论区先充分商讨辩护共识；
  ③ 【同伴分工】：提醒达成共识后推选一位组员代表录入左侧【答辩裁决矩阵】，其余组员同步落实终稿！`;

                let chairText = await callCozeAgentAPI('neutral', chairPrompt, { stage: 'stage3', topic, prop: propText, opp: oppText });
                if (!chairText || chairText.trim().length === 0) {
                  chairText = `🟡 【中间委员·答辩推进引导】：正反两方意见已入驻左侧【答辩裁决矩阵】！答辩是完善方案的绝佳契机。👉 开场请全组首先聚焦反方【第 1 条质询】在讨论区充分商讨辩护思路；达成共识后，建议推选一位组员代表全组录入矩阵对应框中，其余组员同步落实终稿！`;
                }

                logs.push({
                  sender: 'neutral',
                  text: chairText,
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  _timeMs: Date.now()
                });
                this.syncChatLogs();
                renderChat(this.state);
              }, 2500);

            }, 2500);
          }, 2000);
        }
      }
    }

    switchStage(newStage, isMilestoneAdvance = false) {
      this.lastLocalStageChangeTime = Date.now();
      const stageOrder = { stage1: 1, stage2: 2, stage3: 3 };
      const currentGroupMax = this.state.groupMaxStage || 'stage1';
      const currentGroupOrder = stageOrder[currentGroupMax] || 1;
      const targetOrder = stageOrder[newStage] || 1;

      const allTasks = (this.authManager) ? this.authManager.getTasks() : [];
      const currentTaskObj = allTasks.find(t => t.id === this.state.activeTaskId);
      const isTaskDeadlineExpired = isTaskExpired(currentTaskObj);

      // 🛡️ 阶段防越权门禁：未达成里程碑解锁时，禁止学生随意点击跳级（截止只读查阅模式下全阶段自由放行浏览）
      const isContractSigned = !!(this.state.stage1?.contract?.signed || (Array.isArray(this.state.stage1?.contract?.confirmedMembers) && this.state.stage1.contract.confirmedMembers.length > 0));
      if (!isTaskDeadlineExpired && newStage === 'stage2' && !isMilestoneAdvance && !isContractSigned && currentGroupOrder < 2) {
        alert('⚠️ 暂未解锁【阶段二：学术编辑部】！\n请先在阶段一完成学术公约的签署与分工确认，方可进入阶段二。');
        return;
      }

      if (!isTaskDeadlineExpired && targetOrder > currentGroupOrder && !isMilestoneAdvance) {
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
        const activeTaskId = this.state.activeTaskId || 'task_default';
        const currentUser = this.authManager ? this.authManager.getCurrentUser() : null;
        const effectiveClassId = this.state.activeStudentClassId || (currentUser?.classId || 'class_101');
        const activeGroupObj = this.authManager ? this.authManager.getStudentActiveGroup(currentUser, effectiveClassId) : null;
        const currentGroupId = activeGroupObj?.id || (currentUser?.groupId || 'group_1');
        const padName = `jizhi_${activeTaskId}_${currentGroupId}`;
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
      this.renderStudentWorkspace();
    }

    setSpeed(newSpeed) {
      this.state.timer.speed = newSpeed;
      const currentUser = this.authManager.getCurrentUser();
      renderHeader(
        this.state, currentUser, this.authManager.getAnnouncements(),
        (s) => this.switchStage(s), (sp) => this.setSpeed(sp),
        () => this.handleLogout(), () => this.switchToTeacherView(),
        () => this.showAnnouncementModal(), () => this.showQuestionnaireModal(),
        () => {
          this.state.studentViewMode = 'task_list';
          sessionStorage.setItem('jizhi_student_view_mode', 'task_list');
          localStorage.setItem('jizhi_student_view_mode', 'task_list');
          if (this.cloudSyncEngine) this.cloudSyncEngine.stopPolling();
          this.renderMain();
        }
      );
    }

    renderStudentWorkspace(isForced = false) {
      const currentUser = this.authManager.getCurrentUser();
      const effectiveClassId = this.state.activeStudentClassId || (currentUser?.classId || 'class_101');
      const activeGroupObj = this.authManager.getStudentActiveGroup(currentUser, effectiveClassId);
      const currentGroupId = activeGroupObj.id || (currentUser && currentUser.groupId ? currentUser.groupId : 'group_1');

      this.state.members = this.authManager.getGroupMembersForWorkspace(currentGroupId);
      this.state.currentUser = currentUser ? (currentUser.studentCode || 'A') : 'A';

      renderHeader(
        this.state, currentUser, this.authManager.getAnnouncements(),
        (s) => this.switchStage(s), (sp) => this.setSpeed(sp),
        () => this.handleLogout(), () => this.switchToTeacherView(),
        () => this.showAnnouncementModal(), () => this.showQuestionnaireModal(),
        () => {
          this.state.studentViewMode = 'task_list';
          sessionStorage.setItem('jizhi_student_view_mode', 'task_list');
          localStorage.setItem('jizhi_student_view_mode', 'task_list');
          if (this.cloudSyncEngine) this.cloudSyncEngine.stopPolling();
          this.renderMain();
        }
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

      // ── 核心保护：智能局部 Patch 与非冲突渲染 ──
      const stage2Editor = document.getElementById('stage2-word-editor');
      const stage3Editor = document.getElementById('stage3-word-editor');
      const activeEl = document.activeElement;
      const isEditorTyping = !isForced && activeEl && (
        activeEl === stage2Editor ||
        activeEl === stage3Editor ||
        (stage2Editor && stage2Editor.contains(activeEl)) ||
        (stage3Editor && stage3Editor.contains(activeEl)) ||
        (stage2Editor && stage2Editor.dataset.isComposing === 'true') ||
        (stage3Editor && stage3Editor.dataset.isComposing === 'true')
      );

      // 如果用户在阶段一且画布已存在，且非强制重置，做局部精准 Patch
      const existingContractCard = document.querySelector('.contract-card');
      if (!isForced && this.state.currentStage === 'stage1' && existingContractCard) {
        // 局部更新提案池卡片与投票按钮
        const proposalsWrapper = document.getElementById('proposals-wrapper-container');
        const s1 = this.state.stage1;
        const currentUser = this.state.currentUser;
        const userVotedProposalId = s1.votes ? s1.votes[currentUser] : null;
        const userHasVoted = s1.hasVoted && s1.hasVoted[currentUser];
        const isContractLocked = s1.contract.isConfirmed || this.state.isFinalSubmitted;

        const allUsers = this.authManager ? this.authManager.getUsers() : [];
        const myIds = new Set([this.state.currentUser, currentUser?.id, currentUser?.studentCode, currentUser?.username].filter(Boolean));
        const hasSubmittedMyProposal = s1.proposals.some(p => myIds.has(p.author) || (currentUser && (p.authorName === currentUser.name || p.author === currentUser.name)));

        const btnOpenProp = document.getElementById('btn-open-submit-proposal');
        if (btnOpenProp) {
          btnOpenProp.innerText = hasSubmittedMyProposal ? '✏️ 修改我的选题' : '+ 提交我的选题';
        }

        if (proposalsWrapper) {
          if (Array.isArray(s1.proposals) && s1.proposals.length > 0) {
            proposalsWrapper.innerHTML = `
              <div class="proposals-grid" style="margin-top:12px;">
                ${s1.proposals.map(p => {
                  const isThisVoted = userVotedProposalId === p.id;
                  let btnText = '🗳️ 投票支持';
                  let btnClass = 'vote-btn';
                  if (isContractLocked || userHasVoted) {
                    if (isThisVoted) { btnText = '🔒 已投此提案'; btnClass = 'vote-btn active locked'; }
                    else { btnText = '🔒 投票已锁定'; btnClass = 'vote-btn disabled'; }
                  }
                  const authorUser = allUsers.find(u => u.id === p.author || u.studentCode === p.author || u.username === p.author || u.name === p.author || u.name === p.authorName);
                  const authorName = (authorUser ? authorUser.name : null) || p.authorName || (this.state.members[p.author] ? this.state.members[p.author].name : p.author);
                  return `
                    <div class="proposal-card ${isThisVoted ? 'voted' : ''}" style="display:flex; flex-direction:column;">
                      <div class="proposal-header">
                        <div class="proposal-title">💡 ${p.title}</div>
                      </div>
                      <div style="font-size:12px; color:#64748b; margin-bottom:8px;">提出人: <b style="color:#0f172a;">${authorName}</b></div>
                      <button class="${btnClass}" data-id="${p.id}" ${isContractLocked || userHasVoted ? 'disabled' : ''} style="width:100%; margin-top:auto;">${btnText}</button>
                    </div>
                  `;
                }).join('')}
              </div>
            `;
            proposalsWrapper.querySelectorAll('.vote-btn:not([disabled])').forEach(btn => {
              btn.addEventListener('click', () => this.handleVoteCast(btn.dataset.id));
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
      } else if (!isEditorTyping) {
        renderCanvas(this.state, {
          onVote: (propId) => { this.handleVoteCast(propId); },
          onRefresh: () => { this.renderStudentWorkspace(); },
          onContractChange: () => { this.syncStage1(); },
          onAiGenerateContract: async () => {
            const s1 = this.state.stage1 || {};
          const proposals = s1.proposals || [];
          const logs = (this.state.chatLogs && this.state.chatLogs.stage1) || [];
          const userLogs = logs.filter(m => m.sender && !['auctioneer', 'editor', 'system', 'neutral'].includes(m.sender));
          const members = Object.values(this.state.members || {});
          const totalMembersCount = members.length || 3;

          // 1. 严格计算跨成员研讨交互轮数（发言者交替次数）与参与人数
          const voteTime = s1._voteCompletedTime || 0;
          const postVoteLogs = voteTime > 0
            ? userLogs.filter(m => (m._timeMs || 0) >= (voteTime - 3000))
            : userLogs;

          let interactionTurns = 0;
          let lastSpeaker = null;
          const participantSet = new Set();

          postVoteLogs.forEach(msg => {
            const spk = msg.sender || msg.senderName;
            if (spk) {
              participantSet.add(spk);
              if (lastSpeaker !== null && lastSpeaker !== spk) {
                interactionTurns++; // 发言人交替换人，才计为 1 轮有效交互！
              }
              lastSpeaker = spk;
            }
          });

          // 拼接学生研讨文本
          const chatSnippet = userLogs.map(m => `${m.senderName || m.sender}: ${m.text}`).join('\n');

          // 🛡️ 严格学术协同门禁：必须提交了提案，且投票后组内交互至少达到 2 轮（跨成员交替研讨）
          if (proposals.length === 0 || interactionTurns < 2 || participantSet.size < 2) {
            document.querySelectorAll('.jizhi-custom-modal').forEach(m => m.remove());
            const hintModal = document.createElement('div');
            hintModal.className = 'modal-overlay jizhi-custom-modal';
            hintModal.innerHTML = `
              <div style="width:460px; max-width:92vw; background:#ffffff; border-radius:16px; box-shadow:0 20px 40px rgba(15,23,42,0.22); overflow:hidden; border:1px solid #e2e8f0; animation:modalFadeIn 0.25s ease;">
                <div style="background:linear-gradient(135deg, #d97706, #f59e0b); padding:18px 24px; color:#ffffff; display:flex; align-items:center; gap:12px;">
                  <span style="font-size:24px;">💡</span>
                  <div>
                    <h3 style="margin:0; font-size:16px; font-weight:800; color:#ffffff;">研讨协商提示</h3>
                    <div style="font-size:11.5px; opacity:0.9; margin-top:2px;">学术合作公约需由小组成员共同研讨商定</div>
                  </div>
                </div>
                <div style="padding:22px 24px; font-size:13.5px; color:#334155; line-height:1.65; display:flex; flex-direction:column; gap:12px;">
                  <div>
                    建议小组成员在<b>右侧协同研讨区</b>先就具体的研究细化构思、各章节分工与时间规划展开充分交流，达成共识后再点击提炼公约草案！
                  </div>
                  <div style="font-size:12px; color:#64748b; background:#f8fafc; padding:8px 12px; border-radius:8px; border:1px solid #e2e8f0;">
                    👉 <b>提示</b>：小组成员也可不点击智能提炼，直接在左侧输入框中自主分工录入与修改。
                  </div>
                </div>
                <div style="background:#f8fafc; border-top:1px solid #e2e8f0; padding:14px 24px; display:flex; justify-content:flex-end;">
                  <button class="modal-btn submit" id="btn-close-hint-modal" style="background:linear-gradient(135deg, #d97706, #f59e0b); border:none; color:white; padding:8px 22px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer;">去讨论</button>
                </div>
              </div>
            `;
            document.body.appendChild(hintModal);
            hintModal.querySelector('#btn-close-hint-modal').addEventListener('click', () => hintModal.remove());
            hintModal.addEventListener('click', (e) => { if (e.target === hintModal) hintModal.remove(); });
            return;
          }

          // 1. 提炼融合研究主题（区分【全票一致】与【分歧协商】）
          const tally = {};
          Object.values(s1.votes || {}).forEach(pId => { if (pId) tally[pId] = (tally[pId] || 0) + 1; });
          let winningP = null;
          let maxV = 0;
          let isUnanimous = false;
          let isTieOrDivergence = false;

          proposals.forEach(p => {
            const cnt = tally[p.id] || 0;
            if (cnt > maxV) {
              maxV = cnt;
              winningP = p;
              isTieOrDivergence = false;
            } else if (cnt === maxV && maxV > 0) {
              isTieOrDivergence = true;
            }
          });

          if (winningP && maxV >= totalMembersCount && totalMembersCount > 0) {
            isUnanimous = true;
          }

          let determinedTopic = '';
          let topicDecisionReason = '';

          if (isUnanimous && winningP) {
            // 🏆 模式一：全票一致达成共识
            determinedTopic = winningP.title;
            topicDecisionReason = `🎉 小组成员以 ${maxV}/${totalMembersCount} 全票一致通过该选题！`;
          } else {
            // ⚖️ 模式二：存在分歧/平票 ➔ 深度读取研讨流中大家最终协商达成一致的题目
            const matchedFromChat = proposals.find(p => chatSnippet.includes(p.title));
            determinedTopic = matchedFromChat ? matchedFromChat.title : (winningP ? winningP.title : (proposals[0] ? proposals[0].title : ''));
            topicDecisionReason = `⚖️ 投票存在不同意见，已深度读取研讨记录中大家最终商定的共识选题。`;
          }

          if (!s1.mergedTitle || s1.mergedTitle.trim().length === 0) {
            s1.mergedTitle = determinedTopic || '待组员协商填入融合主题';
          }

          // 2. 深度读取研讨流，支持 3 大真实语言模式提取分工
          s1.contract.isDraftGenerated = true;
          s1.contract._draftedTime = Date.now();
          if (!s1.contract.taskAssignments) s1.contract.taskAssignments = {};

          const defaultChapterTasks = [
            '负责“一、研究背景与意义”及“二、文献综述”起草与资料整理',
            '负责“三、研究问题与假设”及“四、研究设计与方法”方案制定',
            '负责“五、不足与反思”撰写及全篇“六、参考文献”引文校对',
            '负责数据分析模型构建与研究工具问卷设计'
          ];

          members.forEach((m, idx) => {
            let assignedTask = '';
            const myName = m.name || '';
            const myCode = m.studentCode || m.id || '';

            // 模式 A：本人主动认领发言 ("蒋诚真: 我来写背景和综述")
            const myMsgs = userLogs.filter(msg => msg.sender === m.id || msg.sender === myCode || (myName && msg.senderName === myName));
            const myText = myMsgs.map(msg => msg.text || '').join(' ');

            // 模式 B：同伴统筹分配/总结发言 ("杨欣如: 诚真负责第二章，我负责设计")
            const mentionPattern = new RegExp(`(?:${myName}|${myCode})[\\s:：负责来做写]*(?:“|【)?([^，。,.\n]+)`, 'g');
            let mentionMatch = null;
            if (myName) {
              userLogs.forEach(msg => {
                if (msg.text && msg.text.includes(myName)) {
                  if (msg.text.includes('背景') || msg.text.includes('综述') || msg.text.includes('前言')) {
                    assignedTask = '负责“一、研究背景与意义”及“二、文献综述”起草与资料整理';
                  } else if (msg.text.includes('假设') || msg.text.includes('方法') || msg.text.includes('设计') || msg.text.includes('问卷')) {
                    assignedTask = '负责“三、研究问题与假设”及“四、研究设计与方法”方案制定';
                  } else if (msg.text.includes('反思') || msg.text.includes('不足') || msg.text.includes('文献') || msg.text.includes('校对')) {
                    assignedTask = '负责“五、不足与反思”撰写及全篇“六、参考文献”引文校对';
                  } else if (msg.text.includes('数据') || msg.text.includes('量表') || msg.text.includes('模型')) {
                    assignedTask = '负责数据分析模型构建与研究工具问卷设计';
                  }
                }
              });
            }

            if (!assignedTask) {
              if (myText.includes('背景') || myText.includes('综述') || myText.includes('前言')) {
                assignedTask = '负责“一、研究背景与意义”及“二、文献综述”起草与资料整理';
              } else if (myText.includes('假设') || myText.includes('方法') || myText.includes('设计') || myText.includes('实验')) {
                assignedTask = '负责“三、研究问题与假设”及“四、研究设计与方法”方案制定';
              } else if (myText.includes('反思') || myText.includes('不足') || myText.includes('文献') || myText.includes('校对')) {
                assignedTask = '负责“五、不足与反思”撰写及全篇“六、参考文献”引文校对';
              } else if (myText.includes('数据') || myText.includes('问卷') || myText.includes('量表') || myText.includes('模型')) {
                assignedTask = '负责数据分析模型构建与研究工具问卷设计';
              }
            }

            if (!assignedTask) {
              assignedTask = defaultChapterTasks[idx % defaultChapterTasks.length] || '协作撰写与统稿';
            }

            s1.contract.taskAssignments[m.id] = assignedTask;
            if (m.studentCode) s1.contract.taskAssignments[m.studentCode] = assignedTask;
          });

          // 3. 时间规划：优先从研讨记录提取（支持 小时/分钟/半小时 等单位换算），未提及章节回退默认值
          if (!s1.contract.timeAllocations) {
            s1.contract.timeAllocations = { background: 25, literature: 30, questions: 25, method: 40, reflection: 20, references: 10 };
          }
          // 中文/阿拉伯数字 → 数值（含「三十」→30、「二十五」→25）
          const cnNumToInt = (s) => {
            if (/^\d/.test(s)) return parseFloat(s);
            const d = { '零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
            const i = s.indexOf('十');
            if (i >= 0) {
              const tens = s.slice(0, i), ones = s.slice(i + 1);
              return (tens ? (d[tens] ?? 1) : 1) * 10 + (ones ? (d[ones] ?? 0) : 0);
            }
            return d[s] ?? 1;
          };
          // 时间表达 → 分钟数（半小时/一刻钟/一个半小时/小时/分钟 等单位统一换算）
          const timeToMinutes = (text) => {
            if (/一个半小时|1个半小时|一个半钟|1\.5\s*小时/i.test(text)) return 90;
            if (/半小时|半个钟/.test(text)) return 30;
            if (/一刻钟/.test(text)) return 15;
            let m = text.match(/(\d+(?:\.\d+)?|[一二两三四五六七八九十]+)\s*个?\s*(小时|钟|h)/i);
            if (m) return Math.round(cnNumToInt(m[1]) * 60);
            m = text.match(/(\d+(?:\.\d+)?|[一二两三四五六七八九十]+)\s*个?\s*(分钟|分|min)/i);
            if (m) return Math.round(cnNumToInt(m[1]));
            return null;
          };
          const timeChapterKeys = [
            { key: 'background', kw: ['背景', '前言', '意义'] },
            { key: 'literature', kw: ['文献综述', '综述'] },
            { key: 'questions', kw: ['问题', '假设'] },
            { key: 'method', kw: ['方法', '设计', '问卷', '量表', '数据', '模型', '实验'] },
            { key: 'reflection', kw: ['反思', '不足', '结论'] },
            { key: 'references', kw: ['参考文献', '引用', '校对'] }
          ];
          userLogs.forEach(lm => {
            const text = lm.text || '';
            // 按标点切段，逐段匹配「章节关键词 + 时间表达」，避免一条消息里多个章节共用一个时间
            const segments = text.split(/[，。、；;,\n]+/);
            for (const seg of segments) {
              const mins = timeToMinutes(seg);
              if (mins === null) continue;
              for (const tc of timeChapterKeys) {
                if (tc.kw.some(k => seg.includes(k))) {
                  s1.contract.timeAllocations[tc.key] = mins; // 讨论值覆盖默认
                }
              }
            }
          });

          this.syncStage1();
          if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
          this.renderStudentWorkspace(true);

          // 4. 拍卖师在聊天区发布权威引导播报
          const draftNoticeMsg = {
            sender: 'auctioneer',
            text: `✨ 【拍卖师·已基于研讨记录深度提炼公约草案】\n已深度读取大家的学术研讨发言与选题投票结果，生成《团队协同合作学术合约草案》！\n\n📌 **融合研究主题**：《${s1.mergedTitle}》\n💡 **决策依据**：${topicDecisionReason}\n👉 **请组员仔细核查左侧分工与时间预算**：\n• 若与实际商议有出入，每位同学均可**直接在输入框中自主微调修改**；\n• 小组成员也可以不依赖提炼，完全自主在左侧分工填写；\n✍️ 确认无误后，全员点击【确认签署公约】即可正式生效并解锁阶段二！`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            _timeMs: Date.now()
          };
          const curStage = this.state.currentStage || 'stage1';
          if (!this.state.chatLogs[curStage]) this.state.chatLogs[curStage] = [];
          this.state.chatLogs[curStage].push(draftNoticeMsg);
          this.syncChatLogs();
          document.querySelectorAll('.jizhi-custom-modal').forEach(m => m.remove());
          const succModal = document.createElement('div');
          succModal.className = 'modal-overlay jizhi-custom-modal';
          succModal.innerHTML = `
            <div style="width:460px; max-width:92vw; background:#ffffff; border-radius:16px; box-shadow:0 20px 40px rgba(15,23,42,0.22); overflow:hidden; border:1px solid #e2e8f0; animation:modalFadeIn 0.25s ease;">
              <div style="background:linear-gradient(135deg, #059669, #10b981); padding:18px 24px; color:#ffffff; display:flex; align-items:center; gap:12px;">
                <span style="font-size:24px;">🎉</span>
                <div>
                  <h3 style="margin:0; font-size:16px; font-weight:800; color:#ffffff;">学术合作公约草案已生成</h3>
                  <div style="font-size:11.5px; opacity:0.9; margin-top:2px;">已自动填入左侧公约区域</div>
                </div>
              </div>
              <div style="padding:22px 24px; font-size:13.5px; color:#334155; line-height:1.65; display:flex; flex-direction:column; gap:12px;">
                <div>
                  系统已根据全组研讨记录自动在左侧填入<b>融合研究主题、各章节分工与时间规划</b>。
                </div>
                <div style="font-size:12.5px; color:#065f46; background:#ecfdf5; border:1px solid #a7f3d0; padding:10px 14px; border-radius:8px; font-weight:600;">
                  👉 请小组成员仔细检查左侧公约内容（可直接在输入框微调修改），确认无误后点击下方【✍️ 确认签署公约】生效！
                </div>
              </div>
              <div style="background:#f8fafc; border-top:1px solid #e2e8f0; padding:14px 24px; display:flex; justify-content:flex-end;">
                <button class="modal-btn submit" id="btn-close-succ-modal" style="background:linear-gradient(135deg, #059669, #10b981); border:none; color:white; padding:8px 22px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer;">立即检查公约</button>
              </div>
            </div>
          `;
          document.body.appendChild(succModal);
          succModal.querySelector('#btn-close-succ-modal').addEventListener('click', () => succModal.remove());
          succModal.addEventListener('click', (e) => { if (e.target === succModal) succModal.remove(); });
        },
        onConfirmContract: () => {
          if (this.state.stage1.contract.isConfirmed) {
            alert('🔒 学术合作公约已被全员确认签署并锁定！');
            return;
          }
          const user = this.state.currentUser;
          const s1 = this.state.stage1;

          let memberArr = [];
          if (Array.isArray(this.state.members)) memberArr = this.state.members;
          else if (this.state.members && typeof this.state.members === 'object') memberArr = Object.values(this.state.members);
          if (memberArr.length === 0 && this.authManager) {
            const u = this.authManager.getCurrentUser();
            const effClassId = this.state.activeStudentClassId || u?.classId || 'class_101';
            const effGroup = this.authManager.getStudentActiveGroup(u, effClassId);
            memberArr = this.authManager.getGroupMembersForWorkspace(effGroup?.id || 'group_1');
          }
          const totalMembersCount = memberArr.length > 0 ? memberArr.length : 3;

          if (!s1.contract.confirmedMembers) s1.contract.confirmedMembers = {};
          // 同时写入 studentCode 与 member.id，彻底杜绝 ID 不一致
          s1.contract.confirmedMembers[user] = true;
          const currMemObj = memberArr.find(m => m && (m.id === user || m.studentCode === user || m.username === user || m.name === user));
          if (currMemObj) {
            if (currMemObj.id) s1.contract.confirmedMembers[currMemObj.id] = true;
            if (currMemObj.studentCode) s1.contract.confirmedMembers[currMemObj.studentCode] = true;
            if (currMemObj.name) s1.contract.confirmedMembers[currMemObj.name] = true;
          }

          const confirmedCount = memberArr.filter(m => m && (s1.contract.confirmedMembers[m.id] || s1.contract.confirmedMembers[m.studentCode] || (m.name && s1.contract.confirmedMembers[m.name]))).length;
          const memberName = currMemObj ? currMemObj.name : user;
          const confirmMsg = {
            sender: user,
            senderName: memberName,
            text: `📢 [公约签署告知]: 我 (${memberName}) 已按键确认签署合作学术公约！（全组确认进度: ${confirmedCount}/${totalMembersCount} 人）`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            _timeMs: Date.now()
          };
          if (!this.state.chatLogs.stage1) this.state.chatLogs.stage1 = [];
          this.state.chatLogs.stage1.push(confirmMsg);
          this.syncStage1();
          this.syncChatLogs();
          if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();

          // 🛡️ 严格要求：必须小组所有成员（每一个人）都确认签署后，才解锁推进到阶段二
          if (confirmedCount < totalMembersCount || totalMembersCount < 2) {
            alert(`✅ 您 (${memberName}) 已成功签署学术合作公约！\n\n当前全组签署进度：${confirmedCount}/${totalMembersCount} 人已签署。\n⚠️ 必须全组所有成员均完成签署确认后，系统才会正式解锁并自动推进至【阶段二：学术编辑部】！请提醒组内其他同学尽快签署。`);
          } else {
            s1.contract.isConfirmed = true;
            this.state.groupMaxStage = 'stage2';
            this.syncStage1();
            this.syncStageChange('stage2');
            if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
            setTimeout(() => {
              const finalMsg = {
                sender: 'auctioneer',
                senderName: '头脑风暴 · 学术拍卖师',
                text: `🎪 【拍卖师宣布】：🎉 恭喜！组内全员 ${totalMembersCount}/${totalMembersCount} 名成员已全部完成公约签署确认！学术合作公约正式生效，阶段一圆满结束，系统自动全员解锁推进至【阶段二：学术编辑部】！`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                _timeMs: Date.now()
              };
              if (!this.state.chatLogs.stage1) this.state.chatLogs.stage1 = [];
              this.state.chatLogs.stage1.push(finalMsg);
              this.syncChatLogs();
              if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
              alert(`🎉 恭喜！组内全部 ${totalMembersCount} 位成员已全部完成公约签署！\n\n学术合作公约正式生效，系统自动全组解锁并推进至【阶段二：学术编辑部】！`);
              this.switchStage('stage2', true);
            }, 600);
          }
          this.renderStudentWorkspace();
        },
        onPresenceChange: (nodeIdx, sectionTitle, charOffset) => {
          const user = this.state.currentUser || 'A';
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
          const user = this.state.currentUser || 'A';
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
          if (this.state.stage2.isDraftConfirmed) {
            alert('🔒 正文初稿已被组内全员确认！已解锁阶段三。');
            return;
          }
          const user = this.state.currentUser || 'A';
          const s2 = this.state.stage2;

          let memberArr = [];
          if (Array.isArray(this.state.members)) memberArr = this.state.members;
          else if (this.state.members && typeof this.state.members === 'object') memberArr = Object.values(this.state.members);
          if (memberArr.length === 0 && this.authManager) {
            const u = this.authManager.getCurrentUser();
            const effClassId = this.state.activeStudentClassId || u?.classId || 'class_101';
            const effGroup = this.authManager.getStudentActiveGroup(u, effClassId);
            memberArr = this.authManager.getGroupMembersForWorkspace(effGroup?.id || 'group_1');
          }
          const totalMembersCount = memberArr.length > 0 ? memberArr.length : 3;

          if (!s2.confirmedMembers) s2.confirmedMembers = {};
          s2.confirmedMembers[user] = true;
          const currMemObj = memberArr.find(m => m && (m.id === user || m.studentCode === user || m.username === user || m.name === user));
          if (currMemObj) {
            if (currMemObj.id) s2.confirmedMembers[currMemObj.id] = true;
            if (currMemObj.studentCode) s2.confirmedMembers[currMemObj.studentCode] = true;
            if (currMemObj.name) s2.confirmedMembers[currMemObj.name] = true;
          }

          const confirmedCount = memberArr.filter(m => m && (s2.confirmedMembers[m.id] || s2.confirmedMembers[m.studentCode] || (m.name && s2.confirmedMembers[m.name]))).length;
          const memberName = currMemObj ? currMemObj.name : user;
          const confirmMsg = {
            sender: user,
            senderName: memberName,
            text: `📢 [初稿确认告知]: 我 (${memberName}) 已确认完成正文初稿！（全组初稿确认进度: ${confirmedCount}/${totalMembersCount} 人）`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            _timeMs: Date.now()
          };
          if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
          this.state.chatLogs.stage2.push(confirmMsg);
          this.syncStage2();
          this.syncChatLogs();
          if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();

          // 🛡️ 严格要求：必须全组成员每一个人都点击确认初稿后，才解锁推进至阶段三
          if (confirmedCount < totalMembersCount || totalMembersCount < 2) {
            alert(`✅ 您 (${memberName}) 已成功确认正文初稿！\n\n当前组内确认进度：${confirmedCount}/${totalMembersCount} 人已确认。\n⚠️ 必须全组所有成员均完成确认后，系统才会正式解锁并自动推进至【阶段三：答辩擂台】！请提醒组内其他同学尽快确认。`);
          } else {
            s2.isDraftConfirmed = true;
            this.state.groupMaxStage = 'stage3';
            const currentUserObj = this.authManager.getCurrentUser();
            const activeTaskId = this.state.activeTaskId || 'task_default';
            const userGroupId = (currentUserObj && currentUserObj.groupId) ? currentUserObj.groupId : 'group_1';
            if (this.authManager.markAllTaskAnnouncementsRead) {
              this.authManager.markAllTaskAnnouncementsRead(activeTaskId, userGroupId);
            }
            this.syncStage2();
            this.syncStageChange('stage3');
            if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
            setTimeout(() => {
              const finalMsg = {
                sender: 'managingEditor',
                senderName: '责任编辑 · 过程学伴',
                text: `🎉 【责任编辑宣布】：恭喜！组内全员 ${totalMembersCount}/${totalMembersCount} 名成员已全部确认正文初稿定稿！阶段二圆满结束，系统自动全员解锁推进至【阶段三：答辩擂台】！`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                _timeMs: Date.now()
              };
              if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
              this.state.chatLogs.stage2.push(finalMsg);
              this.syncChatLogs();
              if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
              alert(`🎉 恭喜！组内全部 ${totalMembersCount} 位成员已全部完成初稿确认！\n\n系统自动全组解锁并推进至【阶段三：答辩擂台】！`);
              this.switchStage('stage3', true);
            }, 600);
          }
          this.renderStudentWorkspace();
        },
        onConfirmStage3Revision: () => {
          const user = this.state.currentUser || 'A';
          const s3 = this.state.stage3;
          let memberArr = [];
          if (Array.isArray(this.state.members)) memberArr = this.state.members;
          else if (this.state.members && typeof this.state.members === 'object') memberArr = Object.values(this.state.members);
          if (memberArr.length === 0 && this.authManager) {
            const u = this.authManager.getCurrentUser();
            const effClassId = this.state.activeStudentClassId || u?.classId || 'class_101';
            const effGroup = this.authManager.getStudentActiveGroup(u, effClassId);
            memberArr = this.authManager.getGroupMembersForWorkspace(effGroup?.id || 'group_1');
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
          const confirmMsg = {
            sender: user,
            senderName: memberName,
            text: `📢 [终稿修改确认]: 我 (${memberName}) 已确认完成终稿修改！（全组修改确认进度: ${confirmedCount}/${totalMembersCount} 人）`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            _timeMs: Date.now()
          };
          if (!this.state.chatLogs.stage3) this.state.chatLogs.stage3 = [];
          this.state.chatLogs.stage3.push(confirmMsg);
          this.syncStage3();
          this.syncChatLogs();
          if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();

          if (confirmedCount >= totalMembersCount) {
            s3.isRevisionConfirmed = true;
            const promptMsg = {
              sender: 'neutral',
              text: `🏆 【中间委员·终稿就绪】：组内全员已确认终稿修改完毕！请组员或代表点击右上方【🚀 提交论文终稿】完成全盘归档！`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              _timeMs: Date.now()
            };
            this.state.chatLogs.stage3.push(promptMsg);
            this.syncChatLogs();
            if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
            alert(`🎉 组内全员 (${totalMembersCount}/${totalMembersCount} 人) 已完成终稿修改确认！请点击【🚀 提交论文终稿】归档呈递至教师端！`);
          } else {
            alert(`✅ 你 (${memberName}) 已成功确认终稿修改完毕！\n\n目前组内确认进度：${confirmedCount}/${totalMembersCount} 人。`);
          }
          this.renderStudentWorkspace();
        },
        onSwitchStage3Tab: (tabKey) => {
          this.state.stage3.activeTab = tabKey;
          this.syncStage3();
          this.renderStudentWorkspace();
        },
        onSaveDirectFeedback: async (id, respText) => {
          if (this.state.isFinalSubmitted) {
            alert('🔒 论文终稿已提交，处于全盘只读归档模式！无法再修改研讨结论。');
            return;
          }
          const items = this.state.stage3.feedbackItems || [];
          const currentIndex = items.findIndex(f => f.id === id);
          const item = items[currentIndex];

          if (item) {
            item.status = 'adopted';
            item.response = respText;
            const currentStage = this.state.currentStage;
            const currentUser = this.state.currentUser;
            const memberName = this.state.members[currentUser] ? this.state.members[currentUser].name : currentUser;

            const discMsg = {
              sender: currentUser,
              text: `📢 [答辩质询研讨结论]: 组内已对质询点 ${currentIndex + 1}【${item.speaker}】完成裁决并达成共识：“${respText}”！`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              _timeMs: Date.now()
            };
            if (!this.state.chatLogs[currentStage]) this.state.chatLogs[currentStage] = [];
            this.state.chatLogs[currentStage].push(discMsg);
            this.syncStage3();
            this.syncChatLogs();
            this.renderStudentWorkspace();

            // 异步调用扣子中间委员 Bot 进行点评与后续引导
            const unadoptedCount = items.filter(f => f.status !== 'adopted').length;
            const topic = (this.state.stage1 && this.state.stage1.mergedTitle) ? this.state.stage1.mergedTitle : '论文方案';

            // 汇总全组已录入的所有答辩裁决
            const adoptedSummaries = items.map((f, i) => `• 质询${i + 1}【${f.speaker}】: ${f.response || '待录入'}`).join('\n');

            let queryPrompt = '';
            if (unadoptedCount > 0) {
              const nextItem = items.find(f => f.status !== 'adopted');
              queryPrompt = `小组成员刚对质询点【${item.speaker}】达成答辩共识：“${respText}”。请对该条共识做简要肯定点评，并自然引导全组针对下一条质询【${nextItem.speaker}】展开研讨。`;
            } else {
              queryPrompt = `恭喜！小组成员已对全部答辩质询完成研讨与答复！\n全组答辩共识清单如下：\n${adoptedSummaries}\n\n请代表答辩主席对全组的修改想法做一份结构化总结与肯定，并清晰引导全组成员点击上方【📝 返回富文本协作大正文】将这些想法落实到正文中，完成终稿修改并提交！`;
            }

            let neutralReply = await callCozeAgentAPI('neutral', queryPrompt, { stage: 'stage3', topic });
            if (!neutralReply || neutralReply.trim().length === 0) {
              if (unadoptedCount > 0) {
                const nextItem = items.find(f => f.status !== 'adopted');
                neutralReply = `🟡 【中间委员·答辩裁决推进】：已成功记录本条裁决结论：“${respText}”！\n\n👉 **接下来请全组研讨攻克**【${nextItem.speaker}】：请全组成员商讨修改方案，达成共识后**由一位组员代表录入**并同步修改终稿！`;
              } else {
                neutralReply = `🎉 【中间委员·答辩共识总评与终稿修改引导】\n各位研究者，答辩委员会已审阅全组针对所有质询给出的答复方案！\n\n📋 **【全组修改思路精要汇总】**：\n${adoptedSummaries}\n\n💡 **终稿修改指引**：大家的辩护逻辑严密且具有高度可行性！现在请全组点击上方【📝 返回富文本协作大正文】，将上述修改想法落实到对应章节，润色完毕后点击【🚀 提交期末论文终稿】完成项目！`;
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
            renderChat(this.state);
          }
        },

        onFinalSubmit: () => { 
          if (this.state.isFinalSubmitted) {
            alert('🔒 论文终稿已于此前成功提交！目前处于全盘只读归档模式，可随时切页查阅各阶段记录。');
            return;
          }
          const topicTitle = this.state.stage1.mergedTitle || '本组研究设计方案';
          const confirmSub = confirm(`🚀 确认提交《${topicTitle}》期末方案终稿？\n\n提交后本组的方案与研讨矩阵将锁定归档呈递至教师端，其他小组不受影响！提交后将自动标记所有前置通知已读，并弹窗引导进入课程评估问卷！`);
          if (confirmSub) {
            this.state.isFinalSubmitted = true;
            const currentStage = this.state.currentStage;
            const currentUser = this.state.currentUser;
            const currentUserObj = this.authManager.getCurrentUser();
            const activeTaskId = this.state.activeTaskId || 'task_default';
            const userGroupId = (currentUserObj && currentUserObj.groupId) ? currentUserObj.groupId : 'group_1';

            // ⚡ 提交终稿后：自动将当前任务的所有前置通知/问卷标记为已读
            if (this.authManager && this.authManager.markAllTaskAnnouncementsRead) {
              this.authManager.markAllTaskAnnouncementsRead(activeTaskId, userGroupId);
            }

            const submitMsg = {
              sender: currentUser,
              text: `🎉 【期末论文终稿成功提交告知】全组已完成论文终稿与答辩质询归档，方案已锁定并提交至教师端！大家可以随时返回各阶段查阅！`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              _timeMs: Date.now()
            };
            if (!this.state.chatLogs[currentStage]) this.state.chatLogs[currentStage] = [];
            this.state.chatLogs[currentStage].push(submitMsg);

            const neutralFinalMsg = {
              sender: 'neutral',
              text: `🏆 【中间委员 Agent 祝贺】热烈祝贺小组圆满完成本期写作任务与答辩！终稿已全盘锁入云端归档库。请全组成员点击弹窗填写课程评估问卷！`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              _timeMs: Date.now()
            };
            this.state.chatLogs[currentStage].push(neutralFinalMsg);

            this.syncStage3();
            this.syncChatLogs();
            this.renderStudentWorkspace();

            setTimeout(() => {
              this.showQuestionnaireModal();
            }, 500);
          }
        }
      }); // end renderCanvas
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
      // 审稿编辑与责任编辑的正文规范检查仅在【阶段二】生效
      if (currentStage !== 'stage2') return;

      const logs = this.state.chatLogs[currentStage] || [];
      const now = Date.now();
      const lastReviewingMsg = logs.slice().reverse().find(m => m.sender === 'reviewingEditor');
      const timeSinceLastReviewing = lastReviewingMsg ? (now - (lastReviewingMsg._timeMs || 0)) : 999999;



      // 1. 🎯 审稿编辑第一次动态质检（检测到正文推进到【二、文献综述】或【三、研究问题与假设】写完时触发一次）
      const hasLitOrQuestionSection = /(?:二、|第2章|第二部分|文献综述|三、|第3章|第三部分|研究问题|研究假设)/i.test(newContent);
      if (hasLitOrQuestionSection && !this.state.stage2FirstReviewDone && timeSinceLastReviewing > 60000) {
        this.state.stage2FirstReviewDone = true;
        const topic = (this.state.stage1 && this.state.stage1.mergedTitle) ? this.state.stage1.mergedTitle : '本组课题';

        // 智能提取完整的【研究背景】+【文献综述】+【研究问题与假设】章节草稿
        const rawDoc = newContent.replace(/<[^>]*>/g, '').trim();
        // 若已推进至第四部分研究方法，则智能截取至方法之前，确保审阅完整的背景与文献综述全貌
        const methodIndex = rawDoc.search(/(?:四、|第4章|第四部分|研究方法|研究设计)/i);
        // 一审聚焦「背景+综述+问题」三章：若已推进至方法章节则截取至方法之前，否则（篇幅尚短）直接全文
        const contentSnippet = (methodIndex > 200) ? rawDoc.slice(0, methodIndex).trim() : rawDoc;

        setTimeout(async () => {
          const firstReviewPrompt = `团队正在撰写课题《${topic}》，目前已写完研究背景、文献综述与研究问题章节，请通读下方【小组当前真实正文草稿】，作为审稿编辑进行实质性学术质检，发表 130~150 字的针对性指导：肯定其背景立意与文献归纳亮点，结合正文中写到的具体概念与变量，指出文献综述与研究问题推导中的 1 处具体对应衔接建议（确保后续方法能呼应问题），绝不讲空泛套话，鼓励团队继续推进！`;
          let firstReviewText = await callCozeAgentAPI('reviewingEditor', firstReviewPrompt, { stage: 'stage2', topic, actualDoc: contentSnippet });
          if (!firstReviewText || firstReviewText.trim().length === 0) {
            firstReviewText = `⚠️ 【审稿编辑提示】：大模型学术质检生成超时或网络稍有延迟，请在讨论区发送"@审稿编辑 请对当前论文正文进行学术质检"重新获取真实质检报告。`;
          }

          const firstReviewMsg = {
            sender: 'reviewingEditor',
            text: firstReviewText,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            _timeMs: Date.now()
          };
          if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
          this.state.chatLogs.stage2.push(firstReviewMsg);
          this.syncChatLogs();
          if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
          renderChat(this.state);
        }, 800);
      }

      // 2. 🎯 章节语义里程碑雷达：推进到【总结反思】时号召发起【半程编辑会议】
      const hasReflectionSection = /(?:五、|第5章|第五部分|不足与反思|研究反思|反思与不足|总结与反思|研究局限)/i.test(newContent);
      const isStage2MeetingLocked = this.state.stage2 && this.state.stage2.actionPlan && this.state.stage2.actionPlan.isGenerated;
      const lastManagingMsg = logs.slice().reverse().find(m => m.sender === 'managingEditor');
      const timeSinceLastManaging = lastManagingMsg ? (now - (lastManagingMsg._timeMs || 0)) : 999999;

      if (hasReflectionSection && !isStage2MeetingLocked && !this.state.stage2MeetingCallSent && timeSinceLastManaging > 60000) {
        this.state.stage2MeetingCallSent = true;
        const meetingCallMsg = {
          sender: 'managingEditor',
          text: `🤝 【责任编辑·半程会议号召】：关注到小组成员已推进撰写至【研究设计的不足与反思】章节，全篇实证方案已基本成型！请组员点击上方【📢 发起编辑会议】完成 4 维自查打卡，稍后审稿编辑将结合全组情况为大家进行深度内容质检与清单生成！`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          _timeMs: now
        };
        logs.push(meetingCallMsg);
        this.syncChatLogs();
        renderChat(this.state);
      }

      // 4. 🎯 终审里程碑雷达：推进到【六、参考文献】时触发终审定稿润色提醒
      const hasReferenceSection = /(?:六、|第6章|第六部分|参考文献|References)/i.test(newContent);
      if (hasReferenceSection && !this.state.stage2RefFormatReviewed && timeSinceLastReviewing > 60000) {
        this.state.stage2RefFormatReviewed = true;
        const refReviewMsg = {
          sender: 'reviewingEditor',
          text: `📝 【审稿编辑·终审定稿提醒】：关注到团队已推进至【参考文献】收尾部分，全篇已基本成型！在最终冲刺阶段，请大家通读全文做定稿润色：① 检查错别字与标点；② 理顺语句通顺与表达精准；③ 统一全篇文风与专业术语。做好细节润色，准备迎接阶段三答辩！`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          _timeMs: now
        };
        logs.push(refReviewMsg);
        this.syncChatLogs();
        renderChat(this.state);
      }

      // 3. 🤝 责任编辑 Agent: 字数贡献比严重偏斜提醒 (SSRL 共享调节)
      // 智能全维度过滤：
      // ① 必须至少有 2 名及以上组员【当前真实在线活跃】（30秒内有心跳/操作），如果人都不在线则绝不自言自语汇报！
      // ② 每次提醒后至少间隔 15 分钟 (900秒) 冷却期；
      // ③ 正文相比上次提醒至少新增推进了 150 字；
      const membersList = Object.values(this.state.members || {});
      const presence = this.state.presence || {};
      const activeOnlineCount = membersList.filter(m => {
        const p = presence[m.studentCode] || presence[m.id];
        return p && (now - (p.updatedAt || 0) < 30000); // 30秒内有活跃操作判定为在线
      }).length;

      const plainLen = newContent.replace(/<[^>]*>/g, '').trim().length;
      const lastWarnTime = this.state.lastSSRLWarnTimeMs || 0;
      const lastWarnLen = this.state.lastSSRLWarnLen || 0;
      const cooldownPassed = (now - lastWarnTime) >= 900000; // 15 分钟冷却
      const hasMeaningfulProgress = (plainLen - lastWarnLen) >= 150; // 且写了新内容

      if (plainLen >= 300 && membersList.length >= 2 && cooldownPassed && (lastWarnTime === 0 || hasMeaningfulProgress)) {
        const contribs = this.state.stage2.memberContributions || {};
        let totalContrib = 0;
        membersList.forEach(m => { totalContrib += (contribs[m.id] || contribs[m.studentCode] || 0); });

        if (totalContrib >= 200 || plainLen >= 300) {
          // 检查是否存在显著失衡：某位成员占比超过 70%，且有成员贡献率低于 10%
          const pcts = membersList.map(m => {
            const val = (contribs[m.id] || contribs[m.studentCode] || 0);
            return (totalContrib > 0) ? Math.round((val / totalContrib) * 100) : 0;
          });
          const hasMaxSkew = Math.max(...pcts) >= 70;
          const hasZeroMember = Math.min(...pcts) <= 10;

          if (hasMaxSkew && hasZeroMember) {
            this.state.lastSSRLWarnTimeMs = now; // 记录本次提醒时间，开启 15 分钟静默期
            this.state.lastSSRLWarnLen = plainLen;
            const ssrlWarningMsg = {
              sender: 'managingEditor',
              text: `🤝 【责任编辑·协同关怀】：关注到当前正文撰写推进中，各成员的投入占比出现了一定程度的分化。建议全组同学在讨论区适度协调分工，鼓励尚未充分动笔的同学认领后续章节，共同推进高质量学术成稿哦~`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              _timeMs: now
            };
            logs.push(ssrlWarningMsg);
            this.syncChatLogs();
            renderChat(this.state);
          }
        }
      }
    }

    showMeetingModal() {
      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="teacher-modal-card" style="width:640px;">
          <div class="teacher-modal-header ann-theme">
            <div class="modal-header-title"><span class="modal-icon">📢</span><div><h3>学术编辑部【半程编辑会议】</h3><p>全篇互阅、思想碰撞与半程修正清单生成</p></div></div>
            <button class="modal-close-btn" id="btn-close-meeting">✕</button>
          </div>
          <div class="teacher-modal-body">
            <!-- 1. 全篇通读与思想碰撞 -->
            <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:10px; padding:14px 16px;">
              <div style="font-size:13px; font-weight:800; color:#1e40af; margin-bottom:12px;">📋 一、全篇通读与思想碰撞</div>

              <div style="display:flex; flex-direction:column; gap:10px;">
                <div style="background:#ffffff; padding:10px 14px; border-radius:8px; border:1px solid #e2e8f0; display:flex; flex-direction:column; gap:6px;">
                  <label style="font-size:12.5px; color:#1e293b; font-weight:700;">1. 负责章节自查：目前自己所写部分的论述情况？</label>
                  <select id="meeting-theme-consistency-select" class="teacher-input" style="width:100%; padding:6px 10px; font-size:12.5px; border-radius:6px; border:1px solid #cbd5e1; background:#ffffff;">
                    <option value="紧扣研究主旨，论点明确且论据充实">✅ 紧扣研究主旨，论点明确且论据充实</option>
                    <option value="基本契合主旨，局部论述需深化拓展">🔄 基本契合主旨，局部论述需深化拓展</option>
                    <option value="存在论证发散或核心概念界定不清">⚠️ 论据不够充分，或感觉有些偏离初衷</option>
                  </select>
                </div>

                <div style="background:#ffffff; padding:10px 14px; border-radius:8px; border:1px solid #e2e8f0; display:flex; flex-direction:column; gap:6px;">
                  <label style="font-size:12.5px; color:#1e293b; font-weight:700;">2. 同伴内容互阅：通读其他成员撰写内容后的想法？</label>
                  <select id="meeting-peer-review-select" class="teacher-input" style="width:100%; padding:6px 10px; font-size:12.5px; border-radius:6px; border:1px solid #cbd5e1; background:#ffffff;">
                    <option value="逻辑严密连贯，高度认同同伴思路与论述">✅ 逻辑严密连贯，高度认同同伴思路与论述</option>
                    <option value="启发新思路，建议为同伴补充论据">💡 启发了新思路，想在讨论区为同伴补充论据视角</option>
                    <option value="存在不同看法，部分论证需要商榷">⚖️ 存在不同看法，对部分论据推导想和同伴商榷</option>
                    <option value="衔接非常自然，很好支撑了后续章节">🔗 章节衔接自然，很好地支撑呼应了后续研究设计</option>
                  </select>
                  <!-- 第2题专属子项：对同伴具体哪些章节提出商榷 -->
                  <div id="meeting-peer-divergence-box" style="background:#fffbeb; padding:8px 12px; border-radius:6px; border:1px solid #fef3c7; display:none; flex-direction:column; gap:4px; margin-top:4px;">
                    <label style="font-size:12px; color:#92400e; font-weight:700;">📌 针对第 2 题：您对同伴所写的哪些具体章节想提出商榷或补充？</label>
                    <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:2px;">
                      <label style="font-size:11.5px; color:#451a03; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="peer-div-sec" value="一、研究背景与意义"> 【一、背景与意义】</label>
                      <label style="font-size:11.5px; color:#451a03; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="peer-div-sec" value="二、文献综述与前沿"> 【二、文献综述】</label>
                      <label style="font-size:11.5px; color:#451a03; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="peer-div-sec" value="三、研究问题与假设"> 【三、问题与假设】</label>
                      <label style="font-size:11.5px; color:#451a03; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="peer-div-sec" value="四、研究设计与方法"> 【四、设计与方法】</label>
                      <label style="font-size:11.5px; color:#451a03; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="peer-div-sec" value="五、不足与反思"> 【五、不足与反思】</label>
                    </div>
                  </div>
                </div>

                <div style="background:#ffffff; padding:10px 14px; border-radius:8px; border:1px solid #e2e8f0; display:flex; flex-direction:column; gap:6px;">
                  <label style="font-size:12.5px; color:#1e293b; font-weight:700;">3. 全篇衔接与贯通：各章节之间的逻辑连贯性？</label>
                  <select id="meeting-transition-select" class="teacher-input" style="width:100%; padding:6px 10px; font-size:12.5px; border-radius:6px; border:1px solid #cbd5e1; background:#ffffff;">
                    <option value="环环相扣，前后呼应非常自然顺畅">✅ 环环相扣，前后呼应非常自然顺畅</option>
                    <option value="局部章节过渡稍显生硬，需商定衔接句">🔄 局部章节过渡稍显生硬，需商定衔接句</option>
                    <option value="各章节相对独立，需进一步统一主线">⚠️ 各章节相对独立，需进一步统一核心主线</option>
                  </select>
                  <!-- 第3题专属子项：哪些相邻章节之间需要打通衔接 -->
                  <div id="meeting-transition-sections-box" style="background:#eff6ff; padding:8px 12px; border-radius:6px; border:1px solid #dbeafe; display:none; flex-direction:column; gap:4px; margin-top:4px;">
                    <label style="font-size:12px; color:#1e40af; font-weight:700;">🔗 针对第 3 题：您认为哪些相邻章节之间的过渡需要重点打通与统一？</label>
                    <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:2px;">
                      <label style="font-size:11.5px; color:#1e3a8a; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="trans-div-sec" value="背景到综述 (第一至二章)"> 【第一至二章 (背景➔综述)】</label>
                      <label style="font-size:11.5px; color:#1e3a8a; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="trans-div-sec" value="综述到假设 (第二至三章)"> 【第二至三章 (综述➔假设)】</label>
                      <label style="font-size:11.5px; color:#1e3a8a; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="trans-div-sec" value="假设到设计 (第三至四章)"> 【第三至四章 (假设➔方法)】</label>
                      <label style="font-size:11.5px; color:#1e3a8a; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="trans-div-sec" value="设计到反思 (第四至五章)"> 【第四至五章 (方法➔反思)】</label>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 2. 团队共享调节 3 维打星自评 -->
            <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:12px 16px; margin-top:12px; display:flex; flex-direction:column; gap:10px;">
              <div style="font-size:13px; font-weight:800; color:#0f172a;">🌟 二、团队共享调节 3 维打星自评</div>

              <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px dashed #f1f5f9; padding-bottom:6px;">
                <span style="font-size:12.5px; font-weight:600; color:#334155;">① 内容逻辑与学术严谨度：</span>
                <div class="rating-stars" id="star-rating-logic" style="font-size:22px; cursor:pointer; user-select:none;">
                  <span class="star" data-val="1" style="color:#f59e0b;">★</span>
                  <span class="star" data-val="2" style="color:#f59e0b;">★</span>
                  <span class="star" data-val="3" style="color:#f59e0b;">★</span>
                  <span class="star" data-val="4" style="color:#f59e0b;">★</span>
                  <span class="star" data-val="5" style="color:#475569;">★</span>
                </div>
              </div>

              <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px dashed #f1f5f9; padding-bottom:6px;">
                <span style="font-size:12.5px; font-weight:600; color:#334155;">② 团队分工与参与平衡度：</span>
                <div class="rating-stars" id="star-rating-balance" style="font-size:22px; cursor:pointer; user-select:none;">
                  <span class="star" data-val="1" style="color:#f59e0b;">★</span>
                  <span class="star" data-val="2" style="color:#f59e0b;">★</span>
                  <span class="star" data-val="3" style="color:#f59e0b;">★</span>
                  <span class="star" data-val="4" style="color:#f59e0b;">★</span>
                  <span class="star" data-val="5" style="color:#f59e0b;">★</span>
                </div>
              </div>

              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:12.5px; font-weight:600; color:#334155;">③ 组内沟通协同与信心状态：</span>
                <div class="rating-stars" id="star-rating-confidence" style="font-size:22px; cursor:pointer; user-select:none;">
                  <span class="star" data-val="1" style="color:#f59e0b;">★</span>
                  <span class="star" data-val="2" style="color:#f59e0b;">★</span>
                  <span class="star" data-val="3" style="color:#f59e0b;">★</span>
                  <span class="star" data-val="4" style="color:#f59e0b;">★</span>
                  <span class="star" data-val="5" style="color:#f59e0b;">★</span>
                </div>
              </div>
            </div>

            <!-- 3. 三维难点瓶颈全面自评 -->
            <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:10px; padding:12px 16px; margin-top:12px; display:flex; flex-direction:column; gap:10px;">
              <div style="font-size:13px; font-weight:800; color:#0f172a;">⚠️ 三、团队 3 维瓶颈自查</div>

              <div>
                <label style="font-size:12px; font-weight:700; color:#1e40af;">📚 维度 ① 学术内容难点：</label>
                <select id="meeting-bottleneck-academic" class="teacher-input" style="width:100%; margin-top:3px; padding:4px 8px; font-size:12px;">
                  <option value="假设与研究设计测量工具对应不明确">假设与研究设计测量工具对应不明确</option>
                  <option value="国内外文献综述支撑力度与权威性不足">国内外文献综述支撑力度与权威性不足</option>
                  <option value="核心变量的操作化测量量表不够完善">核心变量的操作化测量量表不够完善</option>
                </select>
              </div>

              <div>
                <label style="font-size:12px; font-weight:700; color:#047857;">👥 维度 ② 团队协作难点：</label>
                <select id="meeting-bottleneck-collab" class="teacher-input" style="width:100%; margin-top:3px; padding:4px 8px; font-size:12px;">
                  <option value="各成员撰写风格不一致，章节过渡衔接缺乏逻辑">各成员撰写风格不一致，章节过渡衔接缺乏逻辑</option>
                  <option value="对部分核心观点的论证存在组内争议尚未统一">对部分核心观点的论证存在组内争议尚未统一</option>
                  <option value="分工执行存在部分脱节，需加强同步沟通">分工执行存在部分脱节，需加强同步沟通</option>
                </select>
              </div>

              <div>
                <label style="font-size:12px; font-weight:700; color:#b45309;">⏳ 维度 ③ 进度与心理难点：</label>
                <select id="meeting-bottleneck-rhythm" class="teacher-input" style="width:100%; margin-top:3px; padding:4px 8px; font-size:12px;">
                  <option value="时间分配偏紧，担心后半程收尾仓促">时间分配偏紧，担心后半程收尾仓促</option>
                  <option value="写作遇到思路卡顿，感到有些焦虑">写作遇到思路卡顿，感到有些焦虑</option>
                  <option value="篇幅与精简把控困难，精力消耗较大">篇幅与精简把控困难，精力消耗较大</option>
                </select>
              </div>
            </div>

            <div class="teacher-form-group" style="margin-top:10px;">
              <label style="font-size:13px; font-weight:700;">✍️ 向审稿专家提问 / 组内核心困惑说明 (选填)</label>
              <textarea id="meeting-input-text" class="teacher-textarea" style="min-height:55px;" placeholder="请输入组内最想向审稿编辑请教的学术问题或论证困惑..."></textarea>
            </div>
          </div>
          <div class="teacher-modal-footer">
            <button class="modal-btn cancel" id="btn-cancel-meeting">取消</button>
            <button class="modal-btn submit ann-theme" id="btn-submit-meeting">🚀 提交打分并生成【半程编辑修正清单】</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      const closeModal = () => document.body.removeChild(modal);
      modal.querySelector('#btn-close-meeting').addEventListener('click', closeModal);
      modal.querySelector('#btn-cancel-meeting').addEventListener('click', closeModal);

      // ── 第 2 题与第 3 题独立子项条件动态展开 ──
      const peerSelect = modal.querySelector('#meeting-peer-review-select');
      const peerDivBox = modal.querySelector('#meeting-peer-divergence-box');
      const transitionSelect = modal.querySelector('#meeting-transition-select');
      const transDivBox = modal.querySelector('#meeting-transition-sections-box');

      const updatePeerBox = () => {
        const pVal = peerSelect ? peerSelect.value : '';
        const needShow = pVal.includes('不同看法') || pVal.includes('商榷');
        if (peerDivBox) {
          peerDivBox.style.display = needShow ? 'flex' : 'none';
          if (!needShow) peerDivBox.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
        }
      };

      const updateTransBox = () => {
        const tVal = transitionSelect ? transitionSelect.value : '';
        const needShow = tVal.includes('生硬') || tVal.includes('独立');
        if (transDivBox) {
          transDivBox.style.display = needShow ? 'flex' : 'none';
          if (!needShow) transDivBox.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
        }
      };

      if (peerSelect) {
        peerSelect.addEventListener('change', updatePeerBox);
        updatePeerBox();
      }
      if (transitionSelect) {
        transitionSelect.addEventListener('change', updateTransBox);
        updateTransBox();
      }

      let logicRating = 4;
      let balanceRating = 5;
      let confidenceRating = 5;

      modal.querySelectorAll('#star-rating-logic .star').forEach(s => {
        s.addEventListener('click', (e) => {
          logicRating = Number(e.target.dataset.val);
          modal.querySelectorAll('#star-rating-logic .star').forEach(st => {
            const v = Number(st.dataset.val);
            st.style.color = v <= logicRating ? '#f59e0b' : '#475569';
          });
        });
      });

      modal.querySelectorAll('#star-rating-balance .star').forEach(s => {
        s.addEventListener('click', (e) => {
          balanceRating = Number(e.target.dataset.val);
          modal.querySelectorAll('#star-rating-balance .star').forEach(st => {
            const v = Number(st.dataset.val);
            st.style.color = v <= balanceRating ? '#f59e0b' : '#475569';
          });
        });
      });

      modal.querySelectorAll('#star-rating-confidence .star').forEach(s => {
        s.addEventListener('click', (e) => {
          confidenceRating = Number(e.target.dataset.val);
          modal.querySelectorAll('#star-rating-confidence .star').forEach(st => {
            const v = Number(st.dataset.val);
            st.style.color = v <= confidenceRating ? '#f59e0b' : '#475569';
          });
        });
      });

      modal.querySelector('#btn-submit-meeting').addEventListener('click', async () => {
        const themeConsistency = modal.querySelector('#meeting-theme-consistency-select').value;
        const peerReviewState = modal.querySelector('#meeting-peer-review-select').value;
        const transitionState = modal.querySelector('#meeting-transition-select') ? modal.querySelector('#meeting-transition-select').value : '环环相扣';
        const checkedSections = Array.from(modal.querySelectorAll('input[name="peer-div-sec"]:checked')).map(cb => cb.value);
        const bAcademic = modal.querySelector('#meeting-bottleneck-academic').value;
        const bCollab = modal.querySelector('#meeting-bottleneck-collab').value;
        const bRhythm = modal.querySelector('#meeting-bottleneck-rhythm').value;
        const userText = modal.querySelector('#meeting-input-text').value.trim();
        closeModal();

        const user = this.state.currentUser || 'A';
        const memberName = this.state.members[user] ? this.state.members[user].name : user;
        const totalMembersCount = Object.keys(this.state.members || {}).length;

        if (!this.state.stage2.meetingSubmissions) this.state.stage2.meetingSubmissions = {};
        this.state.stage2.meetingSubmissions[user] = {
          user,
          name: memberName,
          themeConsistency,
          peerReviewState,
          transitionState,
          checkedSections,
          bAcademic,
          bCollab,
          bRhythm,
          userText,
          logicRating,
          balanceRating,
          confidenceRating,
          submittedAt: Date.now()
        };

        const submissions = this.state.stage2.meetingSubmissions;
        const submittedCount = Object.keys(submissions).length;

        // 仅当全组所有成员全部打卡完毕时，才解锁并生成【半程编辑修正清单】
        if (submittedCount < totalMembersCount) {
          this.syncStage2();
          if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
          this.renderStudentWorkspace();
          alert(`✅ 你 (${memberName}) 已成功提交半程自查与互阅打卡！\n\n目前组内已打卡：${submittedCount}/${totalMembersCount} 人。\n需组内所有 ${totalMembersCount} 名成员全部完成打卡后，将自动为全组汇总生成【半程修正清单】！`);
          return;
        }

        // ── 全员打卡完毕：汇聚全组数据并由责任编辑播报分歧 ──
        const topic = (this.state.stage1 && this.state.stage1.mergedTitle) ? this.state.stage1.mergedTitle : '本组课题';
        const allSubs = Object.values(submissions);
        const hasDivergence = allSubs.some(s => s.themeConsistency.includes('偏离') || s.themeConsistency.includes('不够充分') || s.peerReviewState.includes('不同看法') || s.peerReviewState.includes('商榷') || (s.checkedSections && s.checkedSections.length > 0));

        // 汇总全组自查状态
        const consistencySummary = allSubs.map(s => `${s.name}: ${s.themeConsistency.slice(0, 10)}`).join('；');
        const peerSummary = allSubs.map(s => `${s.name}: ${s.peerReviewState.slice(0, 10)}`).join('；');
        const transitionSummary = allSubs.map(s => `${s.name}: ${(s.transitionState || '连贯').slice(0, 10)}`).join('；');
        const allCheckedSecs = Array.from(new Set(allSubs.flatMap(s => s.checkedSections || [])));
        const sectionsFocusText = allCheckedSecs.length > 0 ? allCheckedSecs.map(sec => `【${sec}】`).join(' 与 ') : '【一、研究背景】与【四、研究设计】';

        const primaryAcademicB = allSubs[0].bAcademic;
        const primaryCollabB = allSubs[0].bCollab;
        const primaryRhythmB = allSubs[0].bRhythm;
        const questionsList = allSubs.filter(s => s.userText).map(s => `${s.name}提问：“${s.userText}”`).join('；') || '暂无补充提问';

        // 暂不提前点亮清单，等待组内完成分歧商讨后由审稿专家质检下发
        this.syncStage2();
        if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
        this.renderStudentWorkspace();

        alert(`✅ 你 (${memberName}) 已成功提交半程自查与互阅打卡！\n\n目前组内已打卡：${submittedCount}/${totalMembersCount} 人。\n全组成员已集齐！责任编辑已在右侧研讨区梳理出本组自查认知分歧，请组员先在讨论区针对分歧商讨对齐，稍后审稿专家将为大家深度质检并下发【半程修正清单】！`);

        // 2. 异步调用扣子【责任编辑】Coze API: 全景研判 (客观呈现分歧章节 80% 主线，协作时间 20% 顺带；全员一致则全面具体赞扬)
        const managingPrompt = `全组成员已全部完成半程编辑会议自查打卡（共 ${totalMembersCount} 人）：
  • 课题: 《${topic}》
  • 组内重点关注/产生认知差异的具体章节: ${sectionsFocusText}
  • 全组负责章节自查汇总: ${consistencySummary}
  • 全组通读同伴思想研判: ${peerSummary}
  • 全篇过渡与衔接感知汇总: ${transitionSummary}
  • 组内核心学术瓶颈: ${primaryAcademicB} | 协作瓶颈: ${primaryCollabB} | 进度瓶颈: ${primaryRhythmB}
  • 组内说明与提问汇总: ${questionsList}
  • 判定状态: ${hasDivergence ? '【存在显著分歧/不同看法】' : '【全员高度一致认同】'}

  请作为学术编辑部责任编辑（协同主持人与学伴）发表一段充实、真诚、富有启发性的发言（字数控制在 130~150 字，严禁简略敷衍）：
  ${hasDivergence 
  ? `【分歧引导主线】：
  1. 肯定全组认真通读了彼此撰写的段落；明确说明：通读对比后发现目前初稿中写出的部分内容，与组内部分同学在自查中提出的思路构想存在认知差异与不同看法；
  2. 逐一分条列出所涉及的章节（若有多个用 ① ② 客观列出 ${sectionsFocusText} 各自想商榷的思路焦点）；
  3. 针对上述内容分歧给出具体的【分步协商建议】（例如建议大家：先不要急于单打独斗改字，在讨论区按照“先对齐背景的核心概念界定，再商定设计中的具体干预任务与量表指标”的步骤分步商讨，把修改方案达成全组共识；【核心铁律】：责任编辑只客观呈现分歧并给出协商建议，严禁擅自下负面优劣结论！学术对错交由审稿编辑）；
  4. 末尾顺带评价时间/协作：若自查中反映了时间紧张则给 1 句调适建议；若时间把控良好/无顾虑，则真诚给予明确夸赞（如夸赞大家推进节奏很稳健）！并预告审稿专家随后将进行正文深度学术质检！`
  : '【高度默契赞扬】：旗帜鲜明地给予具体肯定，大力赞扬全组对论文核心立意的高度默契与良好写作节奏，引导大家针对学术难点交流，并预告审稿专家马上为大家做正文深度学术质检！'
  }`;

        let managingText = await callCozeAgentAPI('managingEditor', managingPrompt, { stage: 'stage2', topic, bottleneck: bAcademic, peerReview: peerReviewState });
        if (!managingText || managingText.trim().length === 0) {
          managingText = `⚠️ 【责任编辑提示】：大模型生成超时或网络稍有延迟，请组员在讨论区发送“@责任编辑 请对当前自查分歧进行指导”重新获取分析。`;
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

        // 3. 平台接管调控：设置【等待组内商讨对齐】状态，全景汇聚全组所有难点与提问
        this.state.stage2PendingReviewing = {
          topic,
          bAcademic: primaryAcademicB,
          userText: questionsList,
          sectionsFocus: sectionsFocusText,
          hasDivergence,
          timeSubmitted: Date.now(),
          studentMsgCount: 0
        };
        this.syncStage2();
      });
    }

    async triggerReviewingEditorAfterDiscussion() {
      if (!this.state.stage2PendingReviewing) return;
      const ctx = this.state.stage2PendingReviewing;
      this.state.stage2PendingReviewing = null;
      this.syncStage2();

      const fullDoc = (this.state.stage2 && this.state.stage2.unifiedContent) ? this.state.stage2.unifiedContent.replace(/<[^>]*>/g, '').trim() : '论文初稿方案';
      const reviewingPrompt = `小组已针对责任编辑提出的自查分歧在讨论区达成了对齐共识。
  【课题】: 《${ctx.topic}》
  【自查勾选难点】: “${ctx.bAcademic}”
  【手填开放提问/困惑】: “${ctx.userText || '无手填提问'}”
  【重点关注章节】: ${ctx.sectionsFocus}

  请通读下方【小组当前真实正文草稿】全文，作为国家级教育类核心期刊资深审稿编辑，发表 130~150 字的深度学术质检（继承前期初审记忆，前后一致，绝不推翻前文）：
  ① 具体难点破解与立意对齐：结合讨论共识，明确统一核心概念界定与理论支撑；
  ② 正文具体学术质检：通读全文，肯定已有框架亮点，精准指出 2~3 处实际存在的具体章节与实证设计薄弱点；
  ③ 正式下发【半程修正清单】：给出具体操作处方，引导全组对照上方点亮的修正清单开展协同修改！`;

      let reviewingText = await callCozeAgentAPI('reviewingEditor', reviewingPrompt, { stage: 'stage2', topic: ctx.topic, bottleneck: ctx.bAcademic, actualDoc: fullDoc });
      if (!reviewingText || reviewingText.trim().length === 0) {
        reviewingText = `🔍 【审稿编辑·半程深度质检】：小组成员已就修改方向形成良好共识！通读正文初稿，研究背景与文献综述框架清晰；为进一步提升论证严密性，重点给出以下诊断：① 核心主线层面消除概念分歧；② 实证设计层面补充前测同质性检验与具体测量量表；③ 协同修改层面合理分工修改。请全组对照上方【半程修正清单】开展修改！`;
      }

      // 🌟 动态生成包含三大高含金量支柱的【半程修正清单】
      this.state.stage2.actionPlan = {
        isGenerated: true,
        items: [
          `【核心主线·消除立意与逻辑不一致】(重点关注: ${ctx.sectionsFocus}): 结合研讨共识，统一前后章节核心概念界定与研究假设，消除思路矛盾，确保主线一贯到底。`,
          `【学术论证与方法瓶颈深度突破】: • 理论与综述层: 深化核心理论推导与近三年顶刊文献支撑； • 假设与机制层: 明确中介/调节效应逻辑传导链条； • 方法与量表层: 补充操作化测量工具与信效度检验。`,
          `【协同修改落地与反思冲刺】: 组员分工协同修改正文，重点完善第五节【研究设计的不足与反思】，把控后半程进度节奏！`
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
