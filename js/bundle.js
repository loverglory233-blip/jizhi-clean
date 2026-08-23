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

  const APP_VERSION = '2.1.0';
  const APP_BUILD_DATE = '2026-08-23';

  const STORAGE_KEY_USER = 'jizhi_pure_v10_user';
  const STORAGE_KEY_USERS_DB = 'jizhi_pure_v10_users_db';
  const STORAGE_KEY_CLASSES = 'jizhi_pure_v10_classes_db';
  const STORAGE_KEY_TASKS = 'jizhi_pure_v10_tasks_db';
  const STORAGE_KEY_ANNOUNCEMENTS = 'jizhi_pure_v10_ann_db';

  const DefaultClasses = [];

  // 🧹 唯一种子：教师端管理账号（1001/老师）。测试学生一律不写入，教师可在教务界面自行增删学生
  const DefaultUsers = [
    { id: 'u_teacher1', username: '1001', studentCode: '1001', password: '123', name: '老师', role: 'teacher', avatar: '👩‍🏫' }
  ];

  const DefaultTasks = [];
  const DefaultAnnouncements = [];
  const DefaultReferencePapers = [];

  const AgentProfiles = {
    auctioneer: { id: 'auctioneer', name: '拍卖师 Agent', roleTitle: '头脑风暴 · 学术拍卖师', avatar: '🎪', color: '#8b5cf6', stage: 'stage1', cozeBotId: '7673571806476828713' },
    managingEditor: { id: 'managingEditor', name: '责任编辑 Agent', roleTitle: '学术编辑部 · 过程学伴', avatar: '🤝', color: '#10b981', stage: 'stage2', cozeBotId: '7673934462736138294' },
    reviewingEditor: { id: 'reviewingEditor', name: '审稿编辑 Agent', roleTitle: '学术编辑部 · 专家指导', avatar: '📝', color: '#3b82f6', stage: 'stage2', cozeBotId: '7673943522542141476' },
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
    if (/^(?:(?:https?|mailto|tel):|\/|\.\/|\.\.\/|#)/i.test(clean)) {
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

    // 构建针对当前写作阶段的提示词上下文
    let enrichedQuery = userQuery;
    const docSnippet = currentContext.actualDoc ? `\n【小组当前正文真实草稿（字数：${currentContext.actualDoc.length}）】：\n${currentContext.actualDoc.slice(0, 1200)}` : '';
    if (currentContext.stage) {
      enrichedQuery = `【协作写作阶段: ${currentContext.stage === 'stage1' ? '阶段一 (选题与公约)' : currentContext.stage === 'stage2' ? '阶段二 (正文撰写)' : '阶段三 (答辩与质询)'}】\n【课题: ${currentContext.topic || '未定'}】${docSnippet}\n【用户对话/审阅指令】: ${userQuery}`;
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
          const maxRetries = 30; // 阶梯敏捷轮询：最长容忍 ~15 秒黄金响应区间，绝不让学生长时间干等！
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

          cls.groups.forEach(grp => {
            if (!grp.id) { grp.id = 'group_' + Date.now(); isModified = true; }
            if (!grp.name) { grp.name = '协作小组'; isModified = true; }
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
      this._isPullingMeta = true;
      try {
        const currUser = this.getCurrentUser();
        const isStudent = currUser && (currUser.role === 'student' || currUser.isStudent);
        const isTeacher = currUser && (currUser.role === 'teacher' || currUser.isTeacher);

        const res = await fetch(`sync.php?action=get_global_meta&nocache=${Date.now()}`);
        if (res.ok) {
          const data = await res.json();
          if (data) {
            this.isGlobalMetaLoaded = true;
            if (data.version) {
              this.globalMetaVersion = parseInt(data.version, 10);
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
              localStorage.setItem(STORAGE_KEY_ANNOUNCEMENTS, JSON.stringify(mergedAnns));
            }
            if (Array.isArray(data.referencePapers)) {
              localStorage.setItem('jizhi_reference_papers_db', JSON.stringify(data.referencePapers));
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
        return;
      }

      const teacherUserId = (currUser && (currUser.id || currUser.username || currUser.studentCode)) || 'u_teacher';
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
        }).catch(() => {});
      } catch (e) {}
      if (window.app && window.app.cloudSyncEngine) window.app.cloudSyncEngine.pushSnapshot();
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
        const data = await response.json();
        if (data && data.success && data.user) {
          const user = data.user;
          user.token = data.token;
          user.activeSessionId = data.token;
          sessionStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
          localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
          if (window.app) {
            window.app.state.studentViewMode = 'task_list';
            if (window.app.cloudSyncEngine) window.app.cloudSyncEngine.pushSnapshot();
          }
          return { success: true, user };
        } else {
          // 🔐 服务端权威鉴权：服务端明确返回密码错误或账号不存在时，必须严格拒绝，严禁绕过放行！
          return { success: false, message: (data && data.message) ? data.message : '❌ 账号或密码错误' };
        }
      } catch (err) {
        // 仅在网络完全断开等异常时，才回退本地单机沙盒离线验证
        const localRes = this.login(accountInput, password, role);
        if (localRes && localRes.success) return localRes;
        return { success: false, message: '⚠️ 无法连接服务器，请检查网络后重试登录' };
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
        return { success: false, message: '❌ 该账号不存在，请检查工号或学号是否输入正确' };
      }

      const user = users[userIndex];
      const isPwdValid = (pwd.length > 0) && ((user.password && user.password === pwd) || (!user.password && pwd === '123'));

      if (!isPwdValid) {
        return { success: false, message: '❌ 密码错误，默认初始密码为 123' };
      }

      // 🔐 多重认证：登录界面所选身份必须与账号实际角色一致，防止跨身份误登录
      const isTeacher = (user.role === 'teacher' || user.isTeacher);
      if (loginRole === 'teacher' && !isTeacher) {
        return { success: false, message: '❌ 所选登录身份与账号角色不匹配，请选择【教师】或核对工号' };
      }
      if (loginRole === 'student' && isTeacher) {
        return { success: false, message: '❌ 所选登录身份与账号角色不匹配，请选择【学生】或核对学号' };
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

      if (window.app) {
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
        (u.studentCode && u.studentCode.trim().toLowerCase() === cleanCode.toLowerCase()) || 
        (u.username && u.username.trim().toLowerCase() === cleanUsername)
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
        id: 'u_student_' + Date.now() + Math.floor(Math.random() * 1000),
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
          const newUid = 'u_student_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
          const newUser = {
            id: newUid,
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
          targetClass.studentIds.push(newUid);
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

      const targetClass = (classId ? classes.find(c => c.id === classId) : null) ||
                          classes.find(c => (Array.isArray(user.classIds) && user.classIds.includes(c.id)) || c.id === user.classId) ||
                          classes[0];

      if (targetClass && Array.isArray(targetClass.groups)) {
        for (let i = 0; i < targetClass.groups.length; i++) {
          const g = targetClass.groups[i];
          const hasMember = (g.members || []).some(m => {
            if (!m) return false;
            if (typeof m === 'string') return m === uId || m === uCode || m === uUsername || m === uName;
            if (typeof m === 'object') return m.id === uId || m.userId === uId || m.studentCode === uCode || m.username === uUsername || m.name === uName;
            return false;
          });
          if (hasMember) return g;
        }

        if (user.groupId) {
          const directG = targetClass.groups.find(g => g.id === user.groupId);
          if (directG) return directG;
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

      if (targetClass && Array.isArray(targetClass.groups) && targetClass.groups.length > 0) {
        return targetClass.groups[0];
      }
      return { id: 'group_1', name: '第 1 协作小组' };
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
          if (uid === leaderUserId) {
            u.roleCode = 'A';
            u.roleTitle = '组长';
          } else {
            u.roleCode = String.fromCharCode(66 + idx);
            u.roleTitle = '组员';
          }
        }
      });
      if (!leaderUserId && selectedUserIds.length > 0) {
        const uFirst = users.find(usr => usr.id === selectedUserIds[0]);
        if (uFirst) {
          uFirst.roleCode = 'A';
          uFirst.roleTitle = '组长';
        }
      }
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
              if (idx === 0) {
                u.roleCode = 'A';
                u.roleTitle = '组长';
              } else {
                u.roleCode = String.fromCharCode(66 + idx);
                u.roleTitle = '组员';
              }
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
              if (idx === 0) {
                u.roleCode = 'A';
                u.roleTitle = '组长';
              } else {
                u.roleCode = String.fromCharCode(66 + idx);
                u.roleTitle = '组员';
              }
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

    getGroupMembersForWorkspace(groupId = 'group_1') {
      const users = this.getUsers();
      const groupUsers = users.filter(u => u.groupId === groupId && u.role !== 'teacher');
      const colors = ['#818cf8', '#22d3ee', '#fbbf24', '#ec4899', '#34d399', '#f97316', '#a78bfa'];
      const avatars = ['👨‍🎓', '👩‍🎓', '🧑‍🎓', '🎓', '📚', '🌟'];

      const membersObj = {};
      if (groupUsers.length > 0) {
        groupUsers.forEach((u, idx) => {
          const studentCode = (u.studentCode || u.username || u.id || `S${idx + 1}`).trim();
          const letterCode = String.fromCharCode(65 + idx);
          membersObj[studentCode] = {
            id: studentCode,
            userId: u.id || studentCode,
            name: u.name || `学生${idx + 1}`,
            roleTitle: (u.role === 'leader' || idx === 0 || u.roleTitle?.includes('组长') || studentCode === 'A') ? '组长 · 论文结构' : `组员 · 合作撰写`,
            avatar: u.avatar || avatars[idx % avatars.length],
            color: colors[idx % colors.length],
            studentCode: studentCode,
            realStudentCode: studentCode,
            letterCode: letterCode,
            groupId: groupId,
            classId: u.classId || 'class_101'
          };
        });
      } else {
        // 真实无成员小组直接返回空集合，绝不自动注入测试学生
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

        localStorage.setItem(STORAGE_KEY_ANNOUNCEMENTS, JSON.stringify(announcements));

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
      }
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
        const matchClass = !classId || classId === 'all' || !p.classId || p.classId === 'all' || p.classId === classId;
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

    setGroupFinalSubmitted(groupId, isSubmitted) {
      if (window.app && window.app.state) {
        window.app.state.isFinalSubmitted = isSubmitted;
      }
      if (window.app && window.app.cloudSyncEngine) {
        window.app.cloudSyncEngine.pushSnapshot();
      }
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
            const time = msg.timestamp || '';
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

    getTeacherAlerts() {
      try {
        const data = localStorage.getItem('jizhi_teacher_alerts_db');
        return data ? JSON.parse(data) : [];
      } catch (e) { return []; }
    }

    recordTeacherAlert(alertObj) {
      const alerts = this.getTeacherAlerts();
      const taskId = alertObj.taskId || 'task_default';
      const groupId = alertObj.groupId || 'group_1';

      const stageNameMap = {
        stage1: '阶段一公约',
        stage2: (alertObj.type === 'proxy_meeting' ? '阶段二会议' : '阶段二初稿'),
        stage3: '阶段三终稿'
      };
      const curStage = stageNameMap[alertObj.stage] || '协同流程';
      let combinedAbsent = Array.isArray(alertObj.absentMembers) ? [...alertObj.absentMembers] : [];

      // ⚡ 单一收拢：同一个小组在同一任务下只保留 1 条汇总记录，绝不生成多条重复卡片骚扰老师！
      const existingIdx = alerts.findIndex(a => (a.taskId === taskId || !a.taskId) && a.groupId === groupId);
      let targetAlert = null;

      if (existingIdx >= 0) {
        const existing = alerts[existingIdx];
        const prevStages = existing.stagesList || [existing.stageLabel || stageNameMap[existing.stage] || '阶段一公约'];
        const allStages = Array.from(new Set([...prevStages, curStage]));
        const prevAbsent = Array.isArray(existing.absentMembers) ? existing.absentMembers : [];
        combinedAbsent = Array.from(new Set([...prevAbsent, ...combinedAbsent]));
        const absentStr = combinedAbsent.length > 0 ? `（缺勤组员: ${combinedAbsent.join('、')}）` : '';

        targetAlert = {
          ...existing,
          ...alertObj,
          id: existing.id,
          stagesList: allStages,
          absentMembers: combinedAbsent,
          title: `⚠️ 【协同代签记录】${alertObj.groupName || '第 1 协作小组'} 曾发生代签`,
          text: `【${alertObj.className || '班级'}】· 任务《${alertObj.taskTitle || '学术协作写作'}》\n【${alertObj.groupName || '第 1 协作小组'}】组长【${alertObj.leaderName || '组长'}】已代签推进【${allStages.join('、')}】${absentStr}。`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          date: new Date().toLocaleDateString(),
          timeMs: Date.now(),
          read: false
        };
        alerts[existingIdx] = targetAlert;
      } else {
        const absentStr = combinedAbsent.length > 0 ? `（缺勤组员: ${combinedAbsent.join('、')}）` : '';
        targetAlert = {
          id: 'alert_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
          read: false,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          date: new Date().toLocaleDateString(),
          timeMs: Date.now(),
          stagesList: [curStage],
          ...alertObj,
          title: `⚠️ 【协同代签记录】${alertObj.groupName || '第 1 协作小组'} 曾发生代签`,
          text: `【${alertObj.className || '班级'}】· 任务《${alertObj.taskTitle || '学术协作写作'}》\n【${alertObj.groupName || '第 1 协作小组'}】组长【${alertObj.leaderName || '组长'}】已代签推进【${curStage}】${absentStr}。`
        };
        alerts.unshift(targetAlert);
      }

      if (alerts.length > 60) alerts.length = 60;
      localStorage.setItem('jizhi_teacher_alerts_db', JSON.stringify(alerts));
      try {
        const cu = this.getCurrentUser();
        const uid = cu ? (cu.id || cu.username || '') : '';
        const tok = cu ? (cu.activeSessionId || '') : '';
        fetch(`sync.php?action=record_teacher_alert&userId=${encodeURIComponent(uid)}&token=${encodeURIComponent(tok)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(targetAlert)
        }).catch(() => {});
      } catch (e) {}
      return targetAlert;
    }

    markTeacherAlertsRead() {
      const alerts = this.getTeacherAlerts();
      alerts.forEach(a => { a.read = true; });
      localStorage.setItem('jizhi_teacher_alerts_db', JSON.stringify(alerts));
    }

    openChangePasswordModal(presetAccount = null) {
      const currentUser = this.getCurrentUser();
      // 教师与学生账号精准提取：教师统一规范显示标准工号 1001，学生显示其真实学号
      let account = presetAccount || '';
      if (!account && currentUser) {
        const isTeacher = (currentUser.role === 'teacher' || currentUser.isTeacher);
        if (isTeacher) {
          const tCode = currentUser.studentCode || currentUser.teacherCode || currentUser.code || currentUser.username;
          if (tCode && !tCode.includes('teacher') && !tCode.startsWith('u_')) {
            account = tCode;
          } else {
            account = '1001';
          }
        } else {
          if (currentUser.studentCode) account = currentUser.studentCode;
          else if (currentUser.code) account = currentUser.code;
          else if (currentUser.username && !currentUser.username.startsWith('u_')) account = currentUser.username;
          else if (currentUser.id) {
            account = currentUser.id.startsWith('u_') ? currentUser.id.replace(/^u_/, '') : currentUser.id;
          } else {
            account = (currentUser.username || '').replace(/^u_/, '');
          }
        }
      }

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
              <label style="display:block;font-size:12px;font-weight:600;color:#64748b;margin-bottom:6px;">账号 / 学号 / 工号</label>
              <input type="text" id="input-pwd-account" value="${account}" placeholder="请输入您的工号或学号..." style="width:100%;box-sizing:border-box;padding:10px 12px;border:1.5px solid #cbd5e1;border-radius:8px;font-size:14px;background:#ffffff;font-weight:700;color:#1e293b;outline:none;">
            </div>
            <div style="margin-bottom:14px;">
              <label style="display:block;font-size:12px;font-weight:600;color:#64748b;margin-bottom:6px;">原密码 (默认初始密码为 123)</label>
              <input type="password" id="input-pwd-old" placeholder="请输入原密码" style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;">
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
            const data = await res.json();
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
              msgDiv.textContent = '❌ ' + (data.message || '修改失败，请检查原密码');
              submitBtn.disabled = false;
              submitBtn.textContent = '确认修改';
            }
          } catch (e) {
            msgDiv.style.display = 'block';
            msgDiv.style.background = '#fef2f2';
            msgDiv.style.color = '#dc2626';
            msgDiv.textContent = '❌ 网络请求失败，请稍后重试';
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
      const groupId = this.getEffectiveGroupId();
      const taskId = (this.app.state.activeTaskId) ? this.app.state.activeTaskId : 'task_default';
      this.groupId = groupId;
      this.taskId = taskId;
      this.storageKey = `jizhi_cloud_snapshot_v10_pure_${taskId}_${groupId}`;
      this.syncEndpoints = [
        `sync.php?taskId=${taskId}&groupId=${groupId}`
      ];

      if ('BroadcastChannel' in window) {
        try {
          if (this.bc) { try { this.bc.close(); } catch (e) {} }
          this.bc = new BroadcastChannel(`jizhi_bc_${this.taskId}_${this.groupId}`);
          this.bc.onmessage = (e) => {
            if (e.data && e.data.snapshot) this.handleRemoteSync(e.data.snapshot);
          };
        } catch (e) {}
      }
    }

    initSSE() {}
    refreshScopeKeys() {
      this.updateScopeKeys();
    }

    initPolling() {
      this.pullFromServer();
      const getInterval = () => (document.hidden ? 3500 : 1200);
      const runPoll = () => {
        // 🛡️ 已登出则彻底停止轮询，杜绝登出后轮询循环死灰复燃
        if (this.isLoggingOut) return;
        this.pullFromServer().finally(() => {
          if (this.isLoggingOut) return;
          this.pollTimer = setTimeout(runPoll, getInterval());
        });
      };
      this.pollTimer = setTimeout(runPoll, 1200);

      if ('BroadcastChannel' in window) {
        try {
          if (this.bc) { try { this.bc.close(); } catch (e) {} }
          this.bc = new BroadcastChannel(`jizhi_bc_${this.taskId}_${this.groupId}`);
          this.bc.onmessage = (e) => {
            if (e.data && e.data.snapshot) this.handleRemoteSync(e.data.snapshot);
          };
        } catch (e) {}
      }

      window.addEventListener('storage', (e) => {
        if (e.key === this.storageKey && e.newValue) {
          try { this.handleRemoteSync(JSON.parse(e.newValue)); } catch (err) {}
        }
      });
    }

    // 🛡️ 停止轮询并标记登出，供登出流程调用，彻底终止短轮询循环
    stopPolling() {
      this.isLoggingOut = true;
      if (this.pollTimer) { clearTimeout(this.pollTimer); this.pollTimer = null; }
    }

    async pullFromServer() {
      this.updateScopeKeys();

      const nowMs = Date.now();
      if (!this.lastSessionCheckTime || nowMs - this.lastSessionCheckTime > 2000) {
        this.lastSessionCheckTime = nowMs;
        const currentUser = this.app.authManager.getCurrentUser();
        const userKey = currentUser ? (currentUser.studentCode || currentUser.username || currentUser.id) : '';
        if (currentUser && currentUser.activeSessionId && userKey && !this.isLoggingOut) {
          try {
            const chkRes = await fetch(`sync.php?action=session_check&userId=${encodeURIComponent(userKey)}&token=${encodeURIComponent(currentUser.activeSessionId)}`);
            if (chkRes.ok) {
              const chkData = await chkRes.json();
              if (chkData && chkData.kicked) {
                this.isLoggingOut = true;
                if (this.pollTimer) { clearTimeout(this.pollTimer); this.pollTimer = null; }
                this.app.authManager.logout();

                document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
                const kickModal = document.createElement('div');
                kickModal.className = 'modal-overlay';
                kickModal.innerHTML = `
                  <div class="teacher-modal-card" style="width:420px; text-align:center; padding:28px 24px;">
                    <div style="font-size:48px; margin-bottom:12px;">⚠️</div>
                    <div style="font-size:18px; font-weight:800; color:#0f172a; margin-bottom:8px;">账号已在其他设备登录</div>
                    <div style="font-size:13.5px; color:#64748b; line-height:1.6; margin-bottom:24px;">
                      您的账号【<b>${currentUser.name || currentUser.username}</b>】已在另一台设备/浏览器上登录，当前设备已自动下线。
                    </div>
                    <button id="btn-confirm-kicked-ok" style="background:linear-gradient(135deg, #1d4ed8, #2563eb); color:white; border:none; padding:12px 28px; border-radius:10px; font-size:14px; font-weight:700; cursor:pointer; width:100%; box-shadow:0 4px 12px rgba(37,99,235,0.25);">
                      我知道了 (返回登录)
                    </button>
                  </div>
                `;
                document.body.appendChild(kickModal);
                const handleDismiss = () => {
                  kickModal.remove();
                  this.app.renderMain();
                };
                kickModal.querySelector('#btn-confirm-kicked-ok').addEventListener('click', handleDismiss);
                kickModal.addEventListener('click', (e) => { if (e.target === kickModal) handleDismiss(); });
                return;
              }
            }
          } catch (e) {}
        }
      }

      for (const endpoint of this.syncEndpoints) {
        try {
          const sep = endpoint.includes('?') ? '&' : '?';
          const url = `${endpoint}${sep}nocache=${Date.now()}`;
          const res = await fetch(url, { cache: 'no-store' });
          if (res.ok) {
            const data = await res.json();
            this.isInitialPullDone = true;
            if (data && (data.timestamp !== undefined || data.chatLogs || data.stage1 || data.stage2)) {
              this.handleRemoteSync(data);
              return;
            }
          }
        } catch (e) {}
      }
    }

    async pushSnapshot() {
      this.updateScopeKeys();
      const groupId = this.groupId;
      const isReset = !!this.isResetBroadcast;
      this.isResetBroadcast = false;

      const localResetSeqKey = `jizhi_reset_seq_${this.storageKey}`;
      let localResetSeq = parseInt(localStorage.getItem(localResetSeqKey) || '0', 10);
      if (isReset) {
        localResetSeq += 1;
        try { localStorage.setItem(localResetSeqKey, String(localResetSeq)); } catch (e) {}
      }

      const snapshot = {
        timestamp: Date.now(),
        groupId: groupId,
        isReset: isReset,
        resetSeq: localResetSeq,
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
        const results = await Promise.allSettled(this.syncEndpoints.map(url =>
          fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: bodyStr
          }).then(r => r.json()).catch(() => null)
        ));
        for (const result of results) {
          if (result.status === 'fulfilled' && result.value && result.value.stale) {
            const serverResetSeq = result.value.resetSeq || 0;
            if (serverResetSeq > localResetSeq) {
              this._applyReset(serverResetSeq);
            }
            break;
          }
        }
      } catch (e) {
      } finally {
        this.isPushing = false;
        if (this.pendingPushCount > 0) { this.pendingPushCount = 0; this.pushSnapshot(); }
      }
    }

    _applyReset(newResetSeq) {
      const user = this.app.authManager.getCurrentUser();
      const myGroupId = (user && user.groupId) ? user.groupId : (this.app.state.activeMonitorGroupId || 'group_1');
      const taskId = this.app.state.activeTaskId || 'task_default';
      const localResetSeqKey = `jizhi_reset_seq_${this.storageKey}`;

      localStorage.setItem(localResetSeqKey, String(newResetSeq));

      try {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('jizhi_sync_') && (k.endsWith(`_${myGroupId}`) || k.includes(`_${myGroupId}`))) {
            keysToRemove.push(k);
          }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
      } catch (e) {}

      try {
        const hasContent = (this.app.state.stage2 && this.app.state.stage2.unifiedContent) || 
                           (this.app.state.stage1 && this.app.state.stage1.proposals && this.app.state.stage1.proposals.length > 0);
        if (hasContent) {
          const emergencyDraft = {
            savedAt: new Date().toLocaleString(),
            groupId: myGroupId,
            taskId: taskId,
            stage1: this.app.state.stage1,
            stage2: this.app.state.stage2,
            stage3: this.app.state.stage3,
            chatLogs: this.app.state.chatLogs
          };
          localStorage.setItem('jizhi_lost_and_found_draft', JSON.stringify(emergencyDraft));
        }
      } catch (e) {}

      this.app.state.stage1 = JSON.parse(JSON.stringify(InitialState.stage1));
      this.app.state.stage2 = JSON.parse(JSON.stringify(InitialState.stage2));
      this.app.state.stage3 = JSON.parse(JSON.stringify(InitialState.stage3));
      this.app.state.chatLogs = { stage1: [], stage2: [], stage3: [] };
      this.app.state.currentStage = 'stage1';
      this.app.state.isFinalSubmitted = false;
      this.app.state.presence = {};

      this.lastTimestamp = 0;

      const oldContractCard = document.querySelector('.contract-card');
      if (oldContractCard) oldContractCard.remove();
      const editor = document.getElementById('stage2-word-editor') || document.getElementById('stage3-word-editor');
      if (editor) editor.innerHTML = '';

      this.app.saveGroupState(myGroupId);
      if (typeof window.renderChat === 'function') window.renderChat(this.app.state);
      this.app.updateContributionUi();
      this.app.renderPresenceCursors();

      this.updateScopeKeys();
      const userKey = user ? (user.id || user.studentCode || user.username || 'u') : 'u';
      const ackResetSeqKey = `jizhi_ack_reset_seq_${userKey}_${this.storageKey}`;
      const localAckSeq = parseInt(localStorage.getItem(ackResetSeqKey) || '0', 10);

      // 仅在首次感知到该版本重置时，才向学生弹窗提示 1 次
      if (newResetSeq > localAckSeq) {
        localStorage.setItem(ackResetSeqKey, String(newResetSeq));

        if (user?.role === 'student' || user?.isStudent) {
          document.querySelectorAll('.reset-notify-modal').forEach(m => m.remove());
          const resetModal = document.createElement('div');
          resetModal.className = 'modal-overlay reset-notify-modal';
          const isCurrentlyInWorkspace = this.app && this.app.state.studentViewMode === 'workspace';

          resetModal.innerHTML = `
            <div class="teacher-modal-card" style="width:440px; text-align:center; padding:32px 24px; background:#ffffff; border-radius:14px; box-shadow:0 20px 25px -5px rgba(0,0,0,0.25); border:1px solid #e2e8f0; animation:modalFadeIn 0.25s ease;">
              <div style="font-size:44px; margin-bottom:12px;">🔄</div>
              <div style="font-size:18px; font-weight:800; color:#0f172a; margin-bottom:8px;">课堂协同数据已重置</div>
              <div style="font-size:13.5px; color:#475569; line-height:1.6; margin-bottom:22px;">
                ${isCurrentlyInWorkspace 
                  ? '指导教师已清空重置本组在当前写作任务中的分工公约、正文草稿与讨论记录。小组成员已自动安全返回【任务大厅】。' 
                  : '指导教师已清空重置本组在当前写作任务中的协同数据，已为您开启全新一轮协作写作！'}
              </div>
              <button id="btn-confirm-reset-ok" style="background:linear-gradient(135deg, #2563eb, #1d4ed8); color:white; border:none; padding:12px 28px; border-radius:8px; font-size:14px; font-weight:700; cursor:pointer; width:100%; box-shadow:0 3px 10px rgba(37,99,235,0.25);">
                ${isCurrentlyInWorkspace ? '📋 我知道了 (返回任务大厅)' : '✍️ 我知道了 (开始协作)'}
              </button>
            </div>
          `;
          document.body.appendChild(resetModal);

          const handleDismiss = () => {
            resetModal.remove();
            if (isCurrentlyInWorkspace && this.app) {
              this.app.state.studentViewMode = 'task_list';
              this.app.renderMain();
            } else if (this.app) {
              this.app.renderStudentWorkspace();
            }
          };

          resetModal.querySelector('#btn-confirm-reset-ok').addEventListener('click', handleDismiss);
          resetModal.addEventListener('click', (e) => { if (e.target === resetModal) handleDismiss(); });
        }
      }
    }

    // 📡 仅向本机其他标签页广播一条本地消息（不触达服务端）；供教师重置成功后就地同步 resetSeq（修复 broadcastLocal 未定义，见审查 #43 配套）
    broadcastLocal(data) {
      if (this.bc) { try { this.bc.postMessage({ snapshot: data }); } catch (e) {} }
    }

    handleRemoteSync(remoteData) {
      if (!remoteData) return;

      const user = this.app.authManager ? this.app.authManager.getCurrentUser() : null;
      const myGroupId = this.getEffectiveGroupId();

      if (remoteData.groupId && remoteData.groupId !== myGroupId && user?.role === 'student') return;

      // 🛡️ 仅接受 resetSeq 严格递增的重置广播；废除无/过期 resetSeq 的裸 isReset 分支（防任意客户端伪造重置，见审查 #43）
      if (remoteData.resetSeq !== undefined) {
        const localResetSeqKey = `jizhi_reset_seq_${this.storageKey}`;
        const localResetSeq = parseInt(localStorage.getItem(localResetSeqKey) || '0', 10);
        if (remoteData.resetSeq > localResetSeq) {
          this._applyReset(remoteData.resetSeq);
          return;
        }
      }

      if (remoteData.presence) {
        this.app.state.presence = { ...(this.app.state.presence || {}), ...remoteData.presence };
        this.app.renderPresenceCursors();
      }

      if (remoteData.members) {
        this.app.state.members = remoteData.members;
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
        let chatChanged = false;
        ['stage1', 'stage2', 'stage3'].forEach(stg => {
          const remoteLogs = Array.isArray(remoteData.chatLogs[stg]) ? remoteData.chatLogs[stg] : [];
          const localLogs = Array.isArray(this.app.state.chatLogs[stg]) ? this.app.state.chatLogs[stg] : [];

          const mergedLogs = [];
          const seenKeys = new Set();
          const allCandidate = [...localLogs, ...remoteLogs];
          allCandidate.sort((a, b) => {
            const ta = a?._timeMs ? Number(a._timeMs) : 0;
            const tb = b?._timeMs ? Number(b._timeMs) : 0;
            return ta - tb;
          });
          allCandidate.forEach(m => {
            if (!m) return;
            const idKey = m.id ? `id_${m.id}` : null;
            const contentKey = `${m.sender || ''}_${(m.text || '').trim()}_${m._timeMs ? Math.floor(Number(m._timeMs) / 3000) : (m.timestamp || '')}`;
            if (idKey && seenKeys.has(idKey)) return;
            if (seenKeys.has(contentKey)) return;
            if (idKey) seenKeys.add(idKey);
            seenKeys.add(contentKey);
            mergedLogs.push(m);
          });

          if (mergedLogs.length !== localLogs.length || JSON.stringify(mergedLogs) !== JSON.stringify(localLogs)) {
            this.app.state.chatLogs[stg] = mergedLogs;
            chatChanged = true;
          }
        });
        if (chatChanged && typeof window.renderChat === 'function') window.renderChat(this.app.state);
      }

      let needWorkspaceRender = false;

      if (remoteData.stage1) {
        const localS1 = this.app.state.stage1 || { proposals: [], votes: {}, hasVoted: {}, contract: {} };
        const remoteS1 = remoteData.stage1;
        const isContractInputActive = document.activeElement && (
          document.activeElement.classList.contains('task-assignment-input') ||
          document.activeElement.classList.contains('contract-time-input') ||
          document.activeElement.id === 'contract-topic-input'
        );

        if (remoteS1.contract) {
          if (!this.app.state.stage1.contract) this.app.state.stage1.contract = {};
          if (!isContractInputActive) {
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
        if (!isContractInputActive && remoteS1.mergedTitle !== undefined) {
          this.app.state.stage1.mergedTitle = remoteS1.mergedTitle;
        }

        if (remoteS1.contract?.taskAssignments) {
          if (!this.app.state.stage1.contract.taskAssignments) this.app.state.stage1.contract.taskAssignments = {};
          Object.assign(this.app.state.stage1.contract.taskAssignments, remoteS1.contract.taskAssignments);

          document.querySelectorAll('.task-assignment-input').forEach(inp => {
            const mKey = inp.dataset.mkey;
            const remoteVal = (mKey && remoteS1.contract.taskAssignments[mKey] !== undefined)
              ? remoteS1.contract.taskAssignments[mKey]
              : (inp.dataset.mid && remoteS1.contract.taskAssignments[inp.dataset.mid] !== undefined ? remoteS1.contract.taskAssignments[inp.dataset.mid] : undefined);

            if (remoteVal !== undefined && document.activeElement !== inp) {
              if (inp.value !== remoteVal) {
                inp.value = remoteVal;
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
                if (inp.value !== targetVal) {
                  inp.value = targetVal;
                }
              }
            }
          });
        }
        if (remoteS1.mergedTitle !== undefined) {
          this.app.state.stage1.mergedTitle = remoteS1.mergedTitle;
          const topicInp = document.getElementById('contract-topic-input');
          if (topicInp && document.activeElement !== topicInp) {
            if (topicInp.value !== (remoteS1.mergedTitle || '')) {
              topicInp.value = remoteS1.mergedTitle || '';
            }
          }
        }

        const localProps = Array.isArray(localS1.proposals) ? localS1.proposals : [];
        const remoteProps = Array.isArray(remoteS1.proposals) ? remoteS1.proposals : [];
        const propByAuthor = new Map();
        localProps.forEach(p => { if (p && p.author) propByAuthor.set(p.author, p); });
        remoteProps.forEach(remoteP => {
          if (remoteP && remoteP.author) {
            const localP = propByAuthor.get(remoteP.author);
            if (!localP) {
              propByAuthor.set(remoteP.author, remoteP);
            } else {
              const remoteTime = remoteP.updatedAt || 0;
              const localTime = localP.updatedAt || 0;
              if (remoteTime >= localTime) {
                propByAuthor.set(remoteP.author, remoteP);
              }
            }
          }
        });
        const mergedProposals = Array.from(propByAuthor.values());

        const isProposalChanged = JSON.stringify(mergedProposals) !== JSON.stringify(localProps);
        const isVoteChanged = JSON.stringify(remoteS1.votes || {}) !== JSON.stringify(localS1.votes || {})
          || JSON.stringify(remoteS1.hasVoted || {}) !== JSON.stringify(localS1.hasVoted || {});
        const isConfirmChanged = remoteS1.contract?.isConfirmed !== localS1.contract?.isConfirmed
          || JSON.stringify(remoteS1.contract?.confirmedMembers) !== JSON.stringify(localS1.contract?.confirmedMembers);

        this.app.state.stage1.proposals = mergedProposals;
        if (remoteS1.votes) this.app.state.stage1.votes = remoteS1.votes;
        if (remoteS1.hasVoted) this.app.state.stage1.hasVoted = remoteS1.hasVoted;

        if (isProposalChanged || isVoteChanged || isConfirmChanged) {
          needWorkspaceRender = true;
        }
      }

      if (remoteData.stage2) {
        // 🚀 100% 绝对可靠同步：当远端组员有新内容、且本地当前未在输入时，平滑呈现最新正文
        if (remoteData.stage2.unifiedContent !== undefined) {
          const remoteHtml = remoteData.stage2.unifiedContent || '';
          const localHtml = this.app.state.stage2?.unifiedContent || '';

          const stage2Editor = document.getElementById('stage2-word-editor');
          const qlEditor = stage2Editor ? stage2Editor.querySelector('.ql-editor') : null;
          const activeEl = document.activeElement;
          const isLocalTyping = activeEl && (
            activeEl === stage2Editor ||
            activeEl === qlEditor ||
            (stage2Editor && stage2Editor.contains(activeEl))
          );

          if (!isLocalTyping && remoteHtml && remoteHtml !== localHtml) {
            if (!this.app.state.stage2) this.app.state.stage2 = {};
            this.app.state.stage2.unifiedContent = remoteHtml;

            if (window._jizhi_quill && window._jizhi_quill.root) {
              if (window._jizhi_quill.root.innerHTML !== remoteHtml) {
                window._jizhi_quill.root.innerHTML = remoteHtml;
              }
            }
          }
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
          // 🛡️ 修复计时器重置：接受服务端权威时间戳（无论新旧），教师重置后所有客户端同步
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
      const groupMaxOrder = stageOrder[this.app.state.groupMaxStage || 'stage1'] || 1;

      if (remoteData.currentStage) {
        if (remoteOrder > groupMaxOrder) {
          this.app.state.groupMaxStage = remoteData.currentStage;
          this.app.isViewingPastStage = false;
          this.app.state.currentStage = remoteData.currentStage;
          needWorkspaceRender = true;
        } else {
          this.app.state.groupMaxStage = remoteData.currentStage;
          if (!this.app.isViewingPastStage && remoteOrder > currentOrder && !this.app.state.isFinalSubmitted) {
            this.app.state.currentStage = remoteData.currentStage;
            needWorkspaceRender = true;
          }
        }
      }

      this.app.saveGroupState(myGroupId);
      if (typeof window.renderChat === 'function') window.renderChat(this.app.state);
      this.app.updateContributionUi();
      this.app.renderPresenceCursors();

      // 👨‍🏫 教师端实时同屏刷新 (当教师正在监控该小组时，实时同屏反映最新进度)
      const isTeacher = user && (user.isTeacher || user.role === 'teacher');
      if (isTeacher) {
        const teacherContainer = document.getElementById('teacher-portal-panel') || document.querySelector('.teacher-portal-layout');
        if (teacherContainer && typeof renderTeacherPortal === 'function') {
          renderTeacherPortal(teacherContainer, this.app.authManager, this.app.state, () => this.app.handleLogout(), () => {});
        }
      }

      if (needWorkspaceRender && user?.role === 'student' && this.app.state.studentViewMode === 'workspace') {
        const activeEl = document.activeElement;
        const isTypingInWorkspace = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') && (document.getElementById('canvas-panel')?.contains(activeEl) || document.querySelector('.contract-card')?.contains(activeEl));
        if (!isTypingInWorkspace) {
          this.app.renderStudentWorkspace();
        }
      }
    }
  }

  /* ==========================================================================
     MODULE: login.js
     ========================================================================== */
  /**
   * JIZHI (集智) Platform - Login View Renderer
   * Standard ES Module (ESM)
   */

  function renderLoginView(container, authManager, onLoginSuccess) {
    if (authManager && authManager.pullGlobalMeta) {
      authManager.pullGlobalMeta().catch(() => {});
    }
    container.innerHTML = `
      <div style="min-height:100vh; display:flex; align-items:center; justify-content:center; padding:20px; background:linear-gradient(135deg, #f0f4f9 0%, #e2e8f0 100%);">
        <div style="background:#ffffff; border:1px solid #cbd5e1; border-radius:20px; width:440px; max-width:95vw; padding:36px; box-shadow:0 20px 40px -8px rgba(15, 23, 42, 0.08), 0 4px 12px rgba(15, 23, 42, 0.04);">
          <div style="text-align:center; margin-bottom:28px;">
            <div style="font-size:32px; font-weight:800; background:linear-gradient(135deg, #1e40af, #2563eb); -webkit-background-clip:text; -webkit-text-fill-color:transparent;">集智 JIZHI</div>
            <div style="font-size:13px; color:#64748b; margin-top:6px; font-weight:600;">多智能体协同写作与人机共存学习平台</div>
          </div>
          <form id="login-form" style="display:flex; flex-direction:column; gap:16px;">
            <div style="display:flex; flex-direction:column; gap:6px;">
              <label style="font-size:13px; font-weight:700; color:#334155;">工号 / 学号</label>
              <input type="text" id="login-account" class="teacher-input" placeholder="请输入工号或者学号" value="" required style="width:100%;">
            </div>
            <div style="display:flex; flex-direction:column; gap:6px;">
              <label style="font-size:13px; font-weight:700; color:#334155;">密码</label>
              <input type="password" id="login-password" class="teacher-input" placeholder="请输入密码" value="" required style="width:100%;">
            </div>
            <div style="display:flex; flex-direction:column; gap:6px;">
              <label style="font-size:13px; font-weight:700; color:#334155;">登录身份</label>
              <div id="login-role-selector" style="display:flex; gap:10px;">
                <label id="role-opt-student" style="flex:1; display:flex; align-items:center; justify-content:center; gap:6px; padding:10px; border:1.5px solid #2563eb; border-radius:8px; cursor:pointer; font-size:13px; font-weight:700; color:#1e40af; background:#eff6ff;">
                  <input type="radio" name="login-role" value="student" checked style="accent-color:#2563eb;"> 🎓 学生
                </label>
                <label id="role-opt-teacher" style="flex:1; display:flex; align-items:center; justify-content:center; gap:6px; padding:10px; border:1.5px solid #cbd5e1; border-radius:8px; cursor:pointer; font-size:13px; font-weight:600; color:#334155; background:#ffffff;">
                  <input type="radio" name="login-role" value="teacher" style="accent-color:#2563eb;"> 👩‍🏫 教师
                </label>
              </div>
            </div>
            <div id="login-error-msg" style="display:none; font-size:12px; color:#dc2626; background:#fef2f2; border:1px solid #fecaca; padding:8px 12px; border-radius:8px;"></div>
            <button type="submit" class="modal-btn submit task-theme" style="width:100%; padding:14px; font-size:15px; border-radius:10px; margin-top:8px;">
              🚀 登录集智平台
            </button>
          </form>
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

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorMsg.style.display = 'none';
      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) { submitBtn.disabled = true; submitBtn.innerText = '⏳ 正在验证凭证...'; }
      try {
        const selectedRole = (container.querySelector('input[name="login-role"]:checked') || {}).value || 'student';
        const res = await (authManager.loginAsync ? authManager.loginAsync(accountInput.value, passwordInput.value, selectedRole) : authManager.login(accountInput.value, passwordInput.value, selectedRole));
        if (res && res.success) {
          onLoginSuccess();
        } else {
          errorMsg.innerText = (res && res.message) ? res.message : '❌ 账号或密码错误';
          errorMsg.style.display = 'block';
        }
      } catch (err) {
        errorMsg.innerText = '❌ 登录请求失败，请检查网络连接';
        errorMsg.style.display = 'block';
      } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = '🚀 登录集智平台'; }
      }
    });
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

    // ⚡ 教师端自动轻量轮询：自调度循环，杜绝并发拉取与 interval 重注册竞态
    const teacherPullAndRefresh = async () => {
      const curU = authManager.getCurrentUser();
      if (!curU || curU.role !== 'teacher') return; // 非教师即停止轮询
      if (document.querySelector('.modal-overlay')) {
        window._teacherPortalSyncTimer = setTimeout(teacherPullAndRefresh, 3000);
        return;
      }

      if (state.teacherActiveTab === 'view_monitoring' && window.app && window.app.cloudSyncEngine) {
        const activeMonitorGId = state.activeMonitorGroupId || (activeClass.groups && activeClass.groups[0] ? activeClass.groups[0].id : 'group_1');
        const activeTaskId = state.activeTaskId || (currentClassTasks[0] ? currentClassTasks[0].id : 'task_default');
        window.app.cloudSyncEngine.groupId = activeMonitorGId;
        window.app.cloudSyncEngine.taskId = activeTaskId;
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
          chat3: (state.chatLogs?.stage3 || []).length
        });

        try {
          await window.app.cloudSyncEngine.pullFromServer();
          // 📝 针对阶段二，同时从 Etherpad 提取最新正文镜像
          const padName = `jizhi_${activeTaskId}_${activeMonitorGId}`;
          const epRes = await fetch(`sync.php?action=get_pad_text&padId=${padName}`).then(r => r.json()).catch(() => null);
          if (epRes && epRes.success && epRes.text) {
            if (!state.stage2) state.stage2 = {};
            state.stage2.unifiedContent = epRes.text;
          }
        } catch (e) {}

        const newFingerprint = JSON.stringify({
          cStage: state.currentStage,
          s1Len: (state.stage1?.proposals || []).length,
          s1Title: state.stage1?.mergedTitle,
          s1Votes: Object.keys(state.stage1?.votes || {}).length,
          s1Conf: Object.keys(state.stage1?.contract?.confirmedMembers || {}).length,
          s2Len: (state.stage2?.unifiedContent || '').length,
          s3Len: (state.stage3?.feedbackItems || []).length,
          chat1: (state.chatLogs?.stage1 || []).length,
          chat2: (state.chatLogs?.stage2 || []).length,
          chat3: (state.chatLogs?.stage3 || []).length
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
      window._teacherPortalSyncTimer = setTimeout(teacherPullAndRefresh, 3000);
    };
    if (window._teacherPortalSyncTimer) clearTimeout(window._teacherPortalSyncTimer);
    window._teacherPortalSyncTimer = setTimeout(teacherPullAndRefresh, 3000);

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

    // 🛡️ 严格按当前主班过滤写作任务（绝不串出其他班级或历史游离任务）
    const currentClassTasks = tasks.filter(t => t.classId === activeClass.id || (t.className && t.className === activeClass.name) || (!t.classId && activeClass.id === 'class_101'));
    const currentClassAnnouncements = announcements.filter(a => (a.classId === 'all' || !a.classId || a.classId === activeClass.id) && !a.isSystemAction);
    const currentClassPapers = refPapers.filter(p => p.classId === 'all' || !p.classId || p.classId === activeClass.id);

    const classGroupExists = (activeClass.groups || []).some(g => g.id === state.activeMonitorGroupId);
    const activeMonitorGId = (state.activeMonitorGroupId && classGroupExists)
      ? state.activeMonitorGroupId
      : (activeClass.groups && activeClass.groups[0] ? activeClass.groups[0].id : 'group_1');
    state.activeMonitorGroupId = activeMonitorGId;
    const activeMonitorGroup = (activeClass.groups || []).find(g => g.id === activeMonitorGId) || (activeClass.groups && activeClass.groups[0]) || { id: 'group_1', name: '第1小组' };
    const monitorMembersObj = authManager.getGroupMembersForWorkspace(activeMonitorGId);
    const monitorMembersList = Object.values(monitorMembersObj);

    const teacherAlerts = authManager.getTeacherAlerts ? authManager.getTeacherAlerts() : [];
    const unreadAlerts = teacherAlerts.filter(a => !a.read);
    const unreadAlertCount = unreadAlerts.length;

    container.innerHTML = `
      <div class="teacher-portal-layout" id="teacher-portal-layout" style="height:100vh; overflow-y:auto !important; -webkit-overflow-scrolling:touch; background:#f0f4f9; padding:0; display:flex; flex-direction:column;">
        <!-- 全屏头部导航 -->
        <header class="teacher-header" style="padding:16px 32px; background:#ffffff; border-bottom:1px solid #e2e8f0; width:100%; flex-shrink:0; box-shadow:0 1px 3px rgba(15,23,42,0.04);">
          <div class="brand-section">
            <div class="brand-logo" style="font-size:22px; font-weight:800; background:linear-gradient(135deg, #1e40af, #2563eb); -webkit-background-clip:text; -webkit-text-fill-color:transparent;">集智 JIZHI 教师端</div>
            <div class="brand-badge teacher-badge" style="background:#ecfdf5; color:#059669; border:1px solid #a7f3d0; padding:4px 12px; border-radius:12px; font-size:12px; font-weight:700;">👩‍🏫 全局实时教务控制中心 🟢</div>
          </div>
          <div class="teacher-info" style="display:flex; align-items:center; gap:14px;">
            <span style="font-size:13.5px; color:#334155;">当前班级: <b style="color:#2563eb;">${activeClass.name}</b></span>
            <span style="font-size:13.5px; color:#334155;">教师: <b>${currentUser.name}</b></span>
            <button id="btn-teacher-change-pwd" style="background:#f0fdf4; border:1px solid #bbf7d0; color:#16a34a; padding:6px 14px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:6px;" title="修改登录密码">
              <span>🔑 修改密码</span>
            </button>
            <button id="btn-teacher-alerts" style="background:#fffbeb; border:1px solid #fde68a; color:#b45309; padding:6px 14px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:6px; box-shadow:0 1px 3px rgba(0,0,0,0.05);" title="查看小组代签与重要协同提醒">
              <span>🔔 协同动态提醒</span>
              ${unreadAlertCount > 0 ? `<span style="background:#dc2626; color:white; font-size:11px; padding:1px 6px; border-radius:10px; font-weight:800;">${unreadAlertCount}</span>` : ''}
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
                  <div style="display:flex; gap:10px; align-items:center;">
                    <button id="btn-v1-add-student" class="teacher-action-btn" style="background:linear-gradient(135deg, #1d4ed8, #2563eb); border:none; color:white; padding:8px 18px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; box-shadow:0 2px 8px rgba(37,99,235,0.25);">+ 单条创建学生账号</button>
                    <button id="btn-v1-import-file" class="teacher-action-btn" style="background:linear-gradient(135deg, #1d4ed8, #2563eb); border:none; color:white; padding:8px 18px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; box-shadow:0 2px 8px rgba(37,99,235,0.25);">
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
                      ${classStudents.map((s, idx) => {
                        const grp = (activeClass.groups || []).find(g => g.members && (g.members.includes(s.id) || g.members.includes(s.studentCode) || (typeof g.members[0] === 'object' && g.members.some(m => m.id === s.id || m.studentCode === s.studentCode))));
                        const stdAcc = s.studentCode || s.username || s.id;
                        return `
                          <tr>
                            <td style="color:#94a3b8; font-weight:700;">${idx + 1}</td>
                            <td><b>${s.avatar || '👤'} ${s.name}</b></td>
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
                      }).join('')}
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
                                ${m.avatar || '👤'} ${m.name} ${(m.role === 'leader' || m.roleTitle?.includes('组长') || m.studentCode === 'A') ? '<b style="color:#d97706;">(组长)</b>' : ''}
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
            const currentClassTasks = tasks.filter(t => t.classId === 'all' || t.classId === activeClass.id);
            const currentClassAnnouncements = announcements.filter(a => (a.classId === 'all' || !a.classId || a.classId === activeClass.id) && !a.isSystemAction);
            const currentClassPapers = refPapers.filter(p => p.classId === 'all' || !p.classId || p.classId === activeClass.id);

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
                          <span style="font-size:12px; color:#64748b; margin-right:4px;">🕒 发布时间: <b>${t.createdAt || t.startTime || '刚刚'}</b></span>
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
                        <span>📅 <b>开始时间:</b> <span style="color:#2563eb; font-weight:700;">${t.startTime || '即时开启'}</span></span>
                        <span>⌛ <b>截止时间:</b> <span style="color:#dc2626; font-weight:800;">${t.deadline || '无硬性限制'}</span> ${isExpired ? '<b style="color:#dc2626;">(已过截止时间)</b>' : ''}</span>
                        <span>⏱️ <b>任务时长:</b> ${t.durationMinutes} 分钟</span>
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

            const currentMonitorTaskId = state.activeTaskId || 'task_default';
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

                <div class="card" style="border-top:4px solid #059669; width:100%; padding:18px 22px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
                  <div style="display:flex; align-items:center; gap:14px; flex-wrap:wrap;">
                    <span style="font-size:16px; font-weight:800; color:#0f172a;">🖥️ 实际操作实时监控终端:</span>
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
                  </div>

                  <!-- 全局只读不可修改状态控制与 Excel 导出 -->
                  <div style="display:flex; align-items:center; gap:10px;">
                    <span style="font-size:12px; font-weight:700; padding:6px 12px; border-radius:8px; background:${isMonitorTaskExpired || state.isFinalSubmitted ? '#fef2f2' : '#ecfdf5'}; color:${isMonitorTaskExpired || state.isFinalSubmitted ? '#dc2626' : '#059669'}; border:1px solid ${isMonitorTaskExpired || state.isFinalSubmitted ? '#fecaca' : '#a7f3d0'};">
                      ${isMonitorTaskExpired ? '🛑 任务已截止锁定 (学生端全盘只读)' : (state.isFinalSubmitted ? '🔒 全局锁定中 (学生端全盘只读·仅保留聊天)' : '✍️ 学生端可自由协作编辑')}
                    </span>
                    <button id="btn-toggle-final-submitted" style="background:${state.isFinalSubmitted ? 'linear-gradient(135deg, #059669, #047857)' : 'linear-gradient(135deg, #dc2626, #b91c1c)'}; border:none; color:white; padding:8px 16px; border-radius:8px; font-size:12.5px; font-weight:700; cursor:pointer; box-shadow:0 2px 6px rgba(0,0,0,0.15);">
                      ${state.isFinalSubmitted ? '🔓 解除全局锁定 (恢复学生编辑权限)' : '🔒 手动全局锁定 (设为全盘只读)'}
                    </button>
                    <button id="btn-export-all-excel" style="background:linear-gradient(135deg, #2563eb, #1d4ed8); border:none; color:white; padding:8px 16px; border-radius:8px; font-size:12.5px; font-weight:800; cursor:pointer; box-shadow:0 3px 10px rgba(37,99,235,0.3);">
                      📊 导出本组研讨 Excel
                    </button>
                  </div>
                </div>

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

                ${effectiveMonitorStage === 'stage1' ? `
                  <div style="display:grid; grid-template-columns: 1.6fr 1fr; gap:16px; width:100%;">
                    <div class="card" style="padding:20px; display:flex; flex-direction:column; border:1px solid #bfdbfe; gap:12px;">
                      <div style="font-size:15px; font-weight:800; color:#1e40af; display:flex; justify-content:space-between; align-items:center;">
                        <span>🎪 阶段一实操同屏: 学术合作合约与提案 (${activeMonitorGroup.name})</span>
                        <span style="background:#eff6ff; color:#1d4ed8; padding:2px 8px; border-radius:8px; font-size:11px; font-weight:700;">阶段一实况</span>
                      </div>

                      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px;">
                        <div style="font-size:12.5px; font-weight:700; color:#1e40af; margin-bottom:4px;">📌 确认融合论文研究主题:</div>
                        <div style="font-size:14px; font-weight:800; color:#0f172a;">${state.stage1?.mergedTitle || '【尚待确定】'}</div>
                      </div>

                      <!-- 教师端同屏展现 6 大模块时间规划 -->
                      <div style="background:#f8fafc; border:1px solid #bfdbfe; border-radius:10px; padding:12px 14px;">
                        <div style="font-size:13px; font-weight:800; color:#1e40af; margin-bottom:8px;">📚 6 大研究方案模块与时间规划:</div>
                        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:8px; font-size:12px;">
                          <div style="background:#ffffff; border:1px solid #e2e8f0; border-left:3px solid #2563eb; padding:6px 10px; border-radius:6px; display:flex; justify-content:space-between;">
                            <span style="font-weight:700; color:#1e40af;">一、研究背景与意义</span>
                            <span style="color:#2563eb; font-weight:800;">${state.stage1?.contract?.timeAllocations?.background || 25}m</span>
                          </div>
                          <div style="background:#ffffff; border:1px solid #e2e8f0; border-left:3px solid #0284c7; padding:6px 10px; border-radius:6px; display:flex; justify-content:space-between;">
                            <span style="font-weight:700; color:#0369a1;">二、文献综述</span>
                            <span style="color:#0284c7; font-weight:800;">${state.stage1?.contract?.timeAllocations?.literature || 30}m</span>
                          </div>
                          <div style="background:#ffffff; border:1px solid #e2e8f0; border-left:3px solid #059669; padding:6px 10px; border-radius:6px; display:flex; justify-content:space-between;">
                            <span style="font-weight:700; color:#065f46;">三、研究问题与假设</span>
                            <span style="color:#059669; font-weight:800;">${state.stage1?.contract?.timeAllocations?.questions || 25}m</span>
                          </div>
                          <div style="background:#ffffff; border:1px solid #e2e8f0; border-left:3px solid #7c3aed; padding:6px 10px; border-radius:6px; display:flex; justify-content:space-between;">
                            <span style="font-weight:700; color:#6d28d9;">四、研究设计与方法</span>
                            <span style="color:#7c3aed; font-weight:800;">${state.stage1?.contract?.timeAllocations?.method || 40}m</span>
                          </div>
                          <div style="background:#ffffff; border:1px solid #e2e8f0; border-left:3px solid #d97706; padding:6px 10px; border-radius:6px; display:flex; justify-content:space-between;">
                            <span style="font-weight:700; color:#b45309;">五、研究设计的不足与反思</span>
                            <span style="color:#d97706; font-weight:800;">${state.stage1?.contract?.timeAllocations?.reflection || 20}m</span>
                          </div>
                          <div style="background:#ffffff; border:1px solid #e2e8f0; border-left:3px solid #475569; padding:6px 10px; border-radius:6px; display:flex; justify-content:space-between;">
                            <span style="font-weight:700; color:#334155;">六、参考文献</span>
                            <span style="color:#475569; font-weight:800;">${state.stage1?.contract?.timeAllocations?.references || 10}m</span>
                          </div>
                        </div>
                      </div>

                      <!-- 教师端同屏展现组员具体章节分工 -->
                      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; font-size:12.5px;">
                        <div style="font-weight:700; color:#1e40af; margin-bottom:6px;">👥 组员具体章节分工:</div>
                        <div style="display:flex; flex-direction:column; gap:4px;">
                          ${monitorMembersList.map(m => {
                            const task = state.stage1?.contract?.taskAssignments?.[m.id] || '尚未录入分工';
                            return `
                              <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:6px; padding:6px 10px; display:flex; justify-content:space-between;">
                                <span style="font-weight:700; color:${m.color || '#2563eb'};">${m.avatar || '👤'} ${m.name}:</span>
                                <span style="color:#334155;">${task}</span>
                              </div>
                            `;
                          }).join('')}
                        </div>
                      </div>

                      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; font-size:12.5px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; flex-wrap:wrap; gap:6px;">
                          <span style="font-weight:700; color:#1e40af;">👥 公约签署进度与审计矩阵:</span>
                        </div>
                        <div style="display:flex; flex-wrap:wrap; gap:8px;">
                          ${monitorMembersList.map(m => {
                            const isConf = state.stage1?.contract?.confirmedMembers && (state.stage1.contract.confirmedMembers[m.id] || state.stage1.contract.confirmedMembers[m.studentCode] || (m.name && state.stage1.contract.confirmedMembers[m.name]));
                            return `
                              <span style="color:${isConf ? '#059669' : '#64748b'}; border:1px solid ${isConf ? '#a7f3d0' : '#e2e8f0'}; background:${isConf ? '#ecfdf5' : '#ffffff'}; padding:4px 10px; border-radius:6px; font-size:12px; font-weight:600;">
                                ${m.avatar || '👤'} ${m.name} (${m.roleTitle || '组员'}): <b>${isConf ? '✅ 已签署' : '⏳ 未签署'}</b>
                              </span>
                            `;
                          }).join('')}
                        </div>
                      </div>
                    </div>
                    <div class="card" style="padding:20px; display:flex; flex-direction:column;">
                      <div style="font-size:15px; font-weight:800; color:#0f172a; margin-bottom:12px;">💬 阶段一研讨对话流 (${activeMonitorGroup.name})</div>
                      <div style="flex:1; max-height:420px; overflow-y:auto; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px; font-size:12px; display:flex; flex-direction:column; gap:10px;">
                        ${((state.chatLogs && state.chatLogs['stage1']) || []).map(m => {
                          const isAgent = AgentProfiles[m.sender] !== undefined;
                          const senderName = isAgent ? AgentProfiles[m.sender].name : (monitorMembersObj[m.sender] ? monitorMembersObj[m.sender].name : m.sender);
                          const color = isAgent ? AgentProfiles[m.sender].color : (monitorMembersObj[m.sender] ? monitorMembersObj[m.sender].color : '#2563eb');
                          return `
                            <div style="background:#ffffff; padding:8px 12px; border-radius:8px; border:1px solid #e2e8f0; border-left:3px solid ${color};">
                              <div style="display:flex; justify-content:space-between; margin-bottom:3px;">
                                <b style="color:${color}; font-size:12px;">${escapeHtml(senderName)}</b>
                                <span style="color:#94a3b8; font-size:10px;">${escapeHtml(m.timestamp || '')}</span>
                              </div>
                              <div style="color:#0f172a; line-height:1.5;">${escapeHtml(m.text || '')}</div>
                            </div>
                          `;
                        }).join('')}
                      </div>
                    </div>
                  </div>
                ` : ''}

                ${effectiveMonitorStage === 'stage2' ? `
                  <div style="display:grid; grid-template-columns: 1.6fr 1fr; gap:16px; width:100%;">
                    <div class="card" style="padding:20px; display:flex; flex-direction:column; border:1px solid #bfdbfe;">
                      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                        <div style="display:flex; align-items:center; gap:8px;">
                          <span style="font-size:15px; font-weight:800; color:#1e40af;">📝 实时写作大正文镜像 (${activeMonitorGroup.name})</span>
                          <span style="font-size:11px; background:#ecfdf5; color:#059669; padding:2px 8px; border-radius:10px; font-weight:700; border:1px solid #a7f3d0;">🟢 实时同步中</span>
                        </div>
                        <span style="font-size:12.5px; color:#475569;">总字数: <b style="color:#2563eb; font-size:14px;">${(state.stage2?.unifiedContent || '').length}</b> 字</span>
                      </div>
                      <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:10px 14px; margin-bottom:12px; font-size:12px; color:#1d4ed8; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                        <div>
                          <span>⚡ <b>当前【${activeMonitorGroup.name}】初稿进度:</b></span>
                          ${state.stage2?.isDraftConfirmed ? '<span style="color:#059669; font-weight:700; margin-left:6px;">✅ 全员已确认完成初稿</span>' : '<span style="color:#2563eb; margin-left:6px;">✍️ 组员协作撰写中</span>'}
                        </div>
                        <div style="display:flex; gap:6px; flex-wrap:wrap;">
                          ${monitorMembersList.map(m => {
                            const isConf = state.stage2?.confirmedMembers && (state.stage2.confirmedMembers[m.id] || state.stage2.confirmedMembers[m.studentCode]);
                            return `<span style="font-size:11px; padding:1px 8px; border-radius:10px; font-weight:700; background:${isConf ? '#ecfdf5' : '#ffffff'}; color:${isConf ? '#059669' : '#94a3b8'}; border:1px solid ${isConf ? '#a7f3d0' : '#cbd5e1'};">
                              ${m.avatar || '👤'} ${m.name}: ${isConf ? '✅ 已确认' : '⏳ 撰写中'}
                            </span>`;
                          }).join('')}
                        </div>
                      </div>
                      <div id="teacher-live-doc-mirror" style="flex:1; min-height:340px; max-height:480px; overflow-y:auto; font-family:'SimSun', 'Times New Roman', serif; font-size:13.5px; line-height:1.75; background:#ffffff; color:#0f172a; border:1px solid #cbd5e1; border-radius:6px; padding:16px 20px; box-shadow:inset 0 1px 3px rgba(0,0,0,0.02);">
                        ${(state.stage2?.unifiedContent || '').replace(/<span class="remote-cursor-widget"[\s\S]*?<\/span>/gi, '').trim() || '<span style="color:#94a3b8; font-family:sans-serif; font-style:italic;">（小组成员尚未开始撰写正文）</span>'}
                      </div>
                      <div style="margin-top:14px; background:#f8fafc; padding:12px; border-radius:8px; border:1px solid #e2e8f0;">
                        <div style="font-size:12px; font-weight:700; color:#334155; margin-bottom:6px;">📊 本组 SSRL 成员字数与互动贡献比率 (${monitorMembersList.length} 位成员)</div>
                        <div style="height:10px; background:#e2e8f0; border-radius:6px; overflow:hidden; display:flex;">
                          ${(() => {
                            const contribs = state.stage2?.memberContributions || {};
                            let totalContrib = 0;
                            monitorMembersList.forEach(m => { totalContrib += (contribs[m.id] || 0) + (contribs[m.studentCode] || 0); });
                            if (totalContrib === 0) {
                              return `<div style="width:100%; height:10px; background:#e2e8f0; border-radius:6px; display:flex; align-items:center; justify-content:center; font-size:10px; color:#94a3b8;">暂无写作与研讨贡献数据 (各成员贡献均为 0%)</div>`;
                            }
                            return monitorMembersList.map((m) => {
                              const val = (contribs[m.id] || 0) + (contribs[m.studentCode] || 0);
                              if (val === 0) return '';
                              const pct = Math.round((val / totalContrib) * 100);
                              return `<div style="width:${pct}%; background:${m.color || '#2563eb'}; transition:width 0.3s ease;" title="${m.name}: ${pct}% (${val}字)"></div>`;
                            }).join('');
                          })()}
                        </div>
                        <div style="display:flex; justify-content:space-between; font-size:11px; color:#475569; margin-top:6px; flex-wrap:wrap; gap:8px;">
                          ${(() => {
                            const contribs = state.stage2?.memberContributions || {};
                            let totalContrib = 0;
                            monitorMembersList.forEach(m => { totalContrib += (contribs[m.id] || 0) + (contribs[m.studentCode] || 0); });
                            return monitorMembersList.map(m => {
                              const val = (contribs[m.id] || 0) + (contribs[m.studentCode] || 0);
                              const pct = (totalContrib === 0 || val === 0) ? (monitorMembersList.length > 0 ? Math.round(100 / monitorMembersList.length) : 0) : Math.round((val / totalContrib) * 100);
                              return `<span style="color:${m.color || '#2563eb'}; font-weight:700;">● ${m.name}: ${pct}%</span>`;
                            }).join('');
                          })()}
                        </div>
                      </div>
                    </div>
                    <div class="card" style="padding:20px; display:flex; flex-direction:column;">
                      <div style="font-size:15px; font-weight:800; color:#0f172a; margin-bottom:12px;">💬 阶段二编辑部研讨流 (${activeMonitorGroup.name})</div>
                      <div style="flex:1; max-height:460px; overflow-y:auto; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px; font-size:12px; display:flex; flex-direction:column; gap:10px;">
                        ${((state.chatLogs && state.chatLogs['stage2']) || []).map(m => {
                          const isAgent = AgentProfiles[m.sender] !== undefined;
                          const senderName = isAgent ? AgentProfiles[m.sender].name : (monitorMembersObj[m.sender] ? monitorMembersObj[m.sender].name : m.sender);
                          const color = isAgent ? AgentProfiles[m.sender].color : (monitorMembersObj[m.sender] ? monitorMembersObj[m.sender].color : '#2563eb');
                          return `
                            <div style="background:#ffffff; padding:8px 12px; border-radius:8px; border:1px solid #e2e8f0; border-left:3px solid ${color};">
                              <div style="display:flex; justify-content:space-between; margin-bottom:3px;">
                                <b style="color:${color}; font-size:12px;">${escapeHtml(senderName)}</b>
                                <span style="color:#94a3b8; font-size:10px;">${escapeHtml(m.timestamp || '')}</span>
                              </div>
                              <div style="color:#0f172a; line-height:1.5;">${escapeHtml(m.text || '')}</div>
                            </div>
                          `;
                        }).join('')}
                      </div>
                    </div>
                  </div>
                ` : ''}

                ${effectiveMonitorStage === 'stage3' ? `
                  <div style="display:grid; grid-template-columns: 1.6fr 1fr; gap:16px; width:100%; min-height:500px;">
                    <div class="card" style="padding:20px; display:flex; flex-direction:column; border:1px solid #bfdbfe; min-width:0; overflow:hidden;">
                      <div style="font-size:15px; font-weight:800; color:#1e40af; margin-bottom:12px;">🎓 答辩擂台与成员裁决 (${activeMonitorGroup.name})</div>
                      <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:10px; padding:12px 14px; flex:1; display:flex; flex-direction:column; overflow:hidden;">
                        <div style="font-size:13px; font-weight:700; color:#1e40af; margin-bottom:8px;">⚖️ 成员辩护裁决与正文状态:</div>
                        <div style="flex:1; overflow-y:auto; font-family:'SimSun', 'Times New Roman', serif; font-size:13.5px; line-height:1.75; background:#ffffff; color:#0f172a; border:1px solid #cbd5e1; border-radius:6px; padding:16px 20px; box-shadow:inset 0 1px 3px rgba(0,0,0,0.02);">
                          ${(state.stage2?.unifiedContent || '').replace(/<span class="remote-cursor-widget"[\s\S]*?<\/span>/gi, '').trim() || '<span style="color:#94a3b8; font-family:sans-serif; font-style:italic;">（小组成员尚未开始撰写正文）</span>'}
                        </div>
                      </div>
                    </div>
                    <div class="card" style="padding:20px; display:flex; flex-direction:column; min-width:0; overflow:hidden;">
                      <div style="font-size:15px; font-weight:800; color:#0f172a; margin-bottom:12px;">💬 阶段三答辩对话流 (${activeMonitorGroup.name})</div>
                      <div style="flex:1; overflow-y:auto; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px; font-size:12px; display:flex; flex-direction:column; gap:10px;">
                        ${((state.chatLogs && state.chatLogs['stage3']) || []).map(m => {
                          const isAgent = AgentProfiles[m.sender] !== undefined;
                          const senderName = isAgent ? AgentProfiles[m.sender].name : (monitorMembersObj[m.sender] ? monitorMembersObj[m.sender].name : m.sender);
                          const color = isAgent ? AgentProfiles[m.sender].color : (monitorMembersObj[m.sender] ? monitorMembersObj[m.sender].color : '#2563eb');
                          return `
                            <div style="background:#ffffff; padding:8px 12px; border-radius:8px; border:1px solid #e2e8f0; border-left:3px solid ${color};">
                              <div style="display:flex; justify-content:space-between; margin-bottom:3px;">
                                <b style="color:${color}; font-size:12px;">${escapeHtml(senderName)}</b>
                                <span style="color:#94a3b8; font-size:10px;">${escapeHtml(m.timestamp || '')}</span>
                              </div>
                              <div style="color:#0f172a; line-height:1.5;">${escapeHtml(m.text || '')}</div>
                            </div>
                          `;
                        }).join('')}
                      </div>
                    </div>
                ` : ''}

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

    const btnAlerts = container.querySelector('#btn-teacher-alerts');
    if (btnAlerts) {
      btnAlerts.addEventListener('click', () => {
        authManager.markTeacherAlertsRead();
        const currentAlerts = authManager.getTeacherAlerts();

        document.querySelectorAll('.teacher-alerts-modal').forEach(m => m.remove());
        const modal = document.createElement('div');
        modal.className = 'modal-overlay teacher-alerts-modal';
        modal.innerHTML = `
          <div class="teacher-modal-card" style="width:680px; max-width:92vw; max-height:85vh; display:flex; flex-direction:column; padding:0; overflow:hidden; border-radius:14px; box-shadow:0 20px 25px -5px rgba(0,0,0,0.25);">
            <div style="background:linear-gradient(135deg, #1e40af, #2563eb); color:white; padding:18px 24px; display:flex; justify-content:space-between; align-items:center;">
              <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:20px;">🔔</span>
                <div>
                  <div style="font-size:16px; font-weight:800;">课堂协同动态与组长代签提醒中心</div>
                  <div style="font-size:11.5px; opacity:0.85;">实时捕获各小组在各班级、各任务下的公约签署、缺勤代签与阶段推进</div>
                </div>
              </div>
              <button id="btn-close-alerts-modal" style="background:rgba(255,255,255,0.2); border:none; color:white; width:28px; height:28px; border-radius:50%; font-size:16px; cursor:pointer; display:flex; align-items:center; justify-content:center;">✕</button>
            </div>
            <div style="padding:20px 24px; overflow-y:auto; flex:1; display:flex; flex-direction:column; gap:12px; background:#f8fafc;">
              ${(() => {
                return `
                  <div style="text-align:center; color:#64748b; padding:48px 20px; font-size:13.5px; background:#ffffff; border-radius:10px; border:1px dashed #cbd5e1;">
                    <div style="font-size:32px; margin-bottom:8px;">✨</div>
                    <div style="font-weight:700; color:#0f172a;">当前各班级教学协作状态正常</div>
                    <div style="font-size:12px; color:#94a3b8; margin-top:4px;">全员均按教学规范自主推进各阶段协作任务。</div>
                  </div>
                `;
              })()}
            </div>
            <div style="padding:12px 24px; background:#ffffff; border-top:1px solid #e2e8f0; text-align:right;">
              <button id="btn-close-alerts-modal-footer" style="background:#2563eb; color:white; border:none; padding:8px 20px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer;">我知道了</button>
            </div>
          </div>
        `;
        document.body.appendChild(modal);
        const closeModal = () => { modal.remove(); renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView); };
        modal.querySelector('#btn-close-alerts-modal').addEventListener('click', closeModal);
        modal.querySelector('#btn-close-alerts-modal-footer').addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
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
        state.activeClassId = btn.dataset.id;
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
            state.activeClassId = remainingClasses[0] ? remainingClasses[0].id : 'class_101';
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
          renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
        }
      });
    }

    const btnAddStd = container.querySelector('#btn-v1-add-student');
    if (btnAddStd) {
      btnAddStd.addEventListener('click', () => {
        document.querySelectorAll('.modal-overlay').forEach(el => el.remove());

        // 计算当前班级未包含的学生（在其他班但不在本班的学生）
        const allUsers = authManager.getUsers();
        const currentClassStudentIds = new Set(authManager.getClassStudents(activeClass.id).map(s => s.id));
        const unenrolledStudents = allUsers.filter(u =>
          u.role !== 'teacher' && !currentClassStudentIds.has(u.id)
        );

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
          <div class="teacher-modal-card fancy-task-modal" style="width:560px; background:#ffffff; border:1px solid #e2e8f0; box-shadow:0 20px 45px rgba(15,23,42,0.12);">
            <div class="teacher-modal-header" style="background:linear-gradient(135deg, #eff6ff, #f8fafc); border-bottom:1px solid #e2e8f0; padding:18px 24px;">
              <div class="modal-header-title" style="display:flex; align-items:center; gap:10px;">
                <div class="modal-icon-badge" style="background:#dbeafe; color:#2563eb; font-size:20px; padding:6px 10px; border-radius:10px;">👨‍🎓</div>
                <div><h3 style="margin:0; font-size:17px; font-weight:800; color:#0f172a;">添加学生账号 (${activeClass.name})</h3></div>
              </div>
              <button class="modal-close-btn" id="btn-close-single-student" style="background:#f1f5f9; border:none; color:#64748b; font-size:16px; border-radius:8px; width:30px; height:30px; cursor:pointer;">✕</button>
            </div>

            <!-- 双标签切换 -->
            <div style="display:flex; border-bottom:1px solid #e2e8f0; background:#f8fafc;">
              <button id="tab-new-student" style="flex:1; padding:12px; font-size:13.5px; font-weight:800; border:none; cursor:pointer; background:#ffffff; color:#2563eb; border-bottom:3px solid #2563eb;">
                ✏️ 新建学生账号
              </button>
              <button id="tab-enroll-student" style="flex:1; padding:12px; font-size:13.5px; font-weight:800; border:none; cursor:pointer; background:transparent; color:#64748b; border-bottom:3px solid transparent;">
                🔗 加入已有学生 (${unenrolledStudents.length}人)
              </button>
            </div>

            <!-- 面板1: 新建学生 -->
            <div id="panel-new-student">
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

            <!-- 面板2: 加入已有学生 -->
            <div id="panel-enroll-student" style="display:none;">
              <div class="teacher-modal-body" style="padding:20px 24px;">
                <div style="font-size:12.5px; color:#1e40af; background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:10px 14px; margin-bottom:12px;">
                  💡 以下学生已在其他班级中存在。勾选后可将其同时关联进本班，<b>账号不会重复创建</b>。
                </div>
                <div style="margin-bottom:10px;">
                  <input type="text" id="input-search-enroll-std" placeholder="🔍 输入姓名或学号快速搜索已有学生..." style="background:#ffffff; border:1.5px solid #cbd5e1; color:#0f172a; padding:8px 12px; border-radius:8px; width:100%; font-size:13px; outline:none;">
                </div>
                <div id="enroll-std-list-box" style="max-height:260px; overflow-y:auto; display:flex; flex-direction:column; gap:8px;">
                  ${unenrolledStudents.length === 0 ? `
                    <div style="text-align:center; color:#64748b; padding:32px; font-size:13.5px;">
                      ✅ 当前所有学生账号已加入本班，无可选学生
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
                <button class="modal-btn submit task-theme" id="btn-submit-enroll" style="background:linear-gradient(135deg, #1d4ed8, #2563eb); border:none; color:white; padding:8px 20px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer;">🔗 确认加入本班</button>
              </div>
            </div>
          </div>
        `;
        document.body.appendChild(modal);

        const closeModal = () => { modal.remove(); if (typeof onEscKey !== 'undefined') document.removeEventListener('keydown', onEscKey); };
        modal.querySelector('#btn-close-single-student').addEventListener('click', closeModal);
        modal.querySelector('#btn-cancel-single-std').addEventListener('click', closeModal);
        const cancelEnrollBtn = modal.querySelector('#btn-cancel-enroll');
        if (cancelEnrollBtn) cancelEnrollBtn.addEventListener('click', closeModal);

        // 🔍 加入已有学生选项卡实时模糊搜索
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

        // 点击背景遮罩或按 ESC 键均可便捷关闭弹窗
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

        // 标签切换逻辑
        const tabNew = modal.querySelector('#tab-new-student');
        const tabEnroll = modal.querySelector('#tab-enroll-student');
        const panelNew = modal.querySelector('#panel-new-student');
        const panelEnroll = modal.querySelector('#panel-enroll-student');
        tabNew.addEventListener('click', () => {
          tabNew.style.background = 'rgba(99,102,241,0.25)'; tabNew.style.color = '#a5b4fc'; tabNew.style.borderBottom = '3px solid #6366f1';
          tabEnroll.style.background = 'transparent'; tabEnroll.style.color = '#64748b'; tabEnroll.style.borderBottom = '3px solid transparent';
          panelNew.style.display = ''; panelEnroll.style.display = 'none';
        });
        tabEnroll.addEventListener('click', () => {
          tabEnroll.style.background = 'rgba(99,102,241,0.25)'; tabEnroll.style.color = '#a5b4fc'; tabEnroll.style.borderBottom = '3px solid #6366f1';
          tabNew.style.background = 'transparent'; tabNew.style.color = '#64748b'; tabNew.style.borderBottom = '3px solid transparent';
          panelEnroll.style.display = ''; panelNew.style.display = 'none';
        });

        // 新建账号提交
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

        // 加入已有学生提交
        const submitEnrollBtn = modal.querySelector('#btn-submit-enroll');
        if (submitEnrollBtn) {
          submitEnrollBtn.addEventListener('click', () => {
            const checked = modal.querySelectorAll('.enroll-chk:checked');
            if (checked.length === 0) { alert('⚠️ 请勾选至少一位学生！'); return; }
            checked.forEach(chk => {
              // 直接把该学生的 classIds 追加当前班级
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
              // 同时把 student.id 加入班级 studentIds
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
            renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
          });
        }
      });
    }

    const btnImportFile = container.querySelector('#btn-v1-import-file');
    if (btnImportFile) {
      btnImportFile.addEventListener('click', () => {
        document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
          <div class="teacher-modal-card fancy-task-modal" style="width:620px; background:radial-gradient(circle at 50% 10%, #1e1b4b 0%, #0f172a 80%);">
            <div class="teacher-modal-header" style="background:linear-gradient(135deg, rgba(236,72,153,0.3), rgba(139,92,246,0.3));">
              <div class="modal-header-title">
                <div class="modal-icon-badge" style="background:rgba(236,72,153,0.3); color:#f472b6;">📥</div>
                <div>
                  <h3>上传 XLSX / CSV 文件导入学生账号 (${activeClass.name})</h3>
                </div>
              </div>
              <button class="modal-close-btn" id="btn-close-file-modal">✕</button>
            </div>
            <div class="teacher-modal-body">
              <div class="teacher-form-group">
                <label><span class="req">*</span> 选择本地 .xlsx 或 .csv 文件上传</label>
                <div id="file-dropzone" style="border:2px dashed rgba(236,72,153,0.4); border-radius:12px; padding:20px; text-align:center; background:rgba(236,72,153,0.08); cursor:pointer;">
                  <input type="file" id="modal-file-input" accept=".xlsx, .xls, .csv" style="display:none;">
                  <div id="dropzone-text">
                    <span style="font-size:32px;">📄</span>
                    <div style="font-size:14px; font-weight:700; color:#f472b6; margin-top:6px;">点击选择或拖拽本地 .xlsx / .csv 文件到此处</div>
                  </div>
                </div>
              </div>
              <div class="teacher-form-group" style="margin-top:14px;">
                <label>或 直接粘贴名册文本 (每行一人)</label>
                <textarea id="modal-paste-textarea" class="teacher-textarea fancy" style="min-height:90px; font-family:monospace; font-size:13px;" placeholder="每行一位学生，逗号或空格分隔：&#10;姓名, 登录账号, 学号, 初始密码(可选)"></textarea>
              </div>
            </div>
            <div class="teacher-modal-footer">
              <button class="modal-btn cancel" id="btn-cancel-file-modal">取消</button>
              <button class="modal-btn submit task-theme" id="btn-submit-file-import" style="background:linear-gradient(135deg, #ec4899, #8b5cf6);">
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
                  const isLeader = s.studentCode === 'A';
                  const otherGroup = (cls.groups || []).find(g => g.id !== editingGroupId && g.members && g.members.includes(s.id));
                  return `
                    <div class="grp-student-item" data-search="${(s.name + ' ' + (s.studentCode || '') + ' ' + (s.username || '')).toLowerCase()}" style="display:flex; justify-content:space-between; align-items:center; background:#ffffff; border:1px solid #e2e8f0; padding:10px 14px; border-radius:8px; transition:all 0.15s;">
                      <label style="display:flex; align-items:center; gap:10px; cursor:pointer; font-size:13.5px; color:#0f172a; font-weight:600;">
                        <input type="checkbox" class="chk-grp-member" value="${s.id}" ${isChecked ? 'checked' : ''} style="width:17px; height:17px; cursor:pointer; accent-color:#2563eb;">
                        <span>${s.avatar || '👤'} <b>${s.name}</b> <code style="color:#2563eb; font-family:monospace; margin-left:4px;">${s.studentCode || s.username}</code></span>
                        ${otherGroup ? `<span style="background:#fef3c7; color:#b45309; border:1px solid #fde68a; font-size:11.5px; padding:1px 8px; border-radius:6px; font-weight:700; margin-left:6px;">(现归属: ${otherGroup.name})</span>` : ''}
                      </label>
                      <label style="font-size:12px; color:#b45309; cursor:pointer; display:flex; align-items:center; gap:4px; font-weight:700; background:#fffbeb; border:1px solid #fde68a; padding:3px 8px; border-radius:6px;">
                        <input type="radio" name="grp-leader-radio" value="${s.id}" ${isLeader || (isChecked && currentMembers[0] === s.id) ? 'checked' : ''} style="cursor:pointer; accent-color:#d97706;">
                        设为组长
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
        const leaderRadio = modal.querySelector('input[name="grp-leader-radio"]:checked');
        const leaderUserId = leaderRadio ? leaderRadio.value : (selectedUserIds[0] || null);

        if (!name) { alert('⚠️ 请输入小组名称！'); return; }
        try {
          authManager.updateGroupMembers(cls.id, editingGroupId || ('group_' + Date.now()), name, selectedUserIds, leaderUserId);
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
            const tId = (currT && (currT.id || currT.username || currT.studentCode)) || 'u_teacher';
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
            ? '<option value="task_default">📌 默认写作任务</option>'
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

        const formatForInput = (val) => {
          if (!val) return '';
          const clean = val.trim().replace(' ', 'T');
          if (clean.length === 16) return clean;
          if (clean.length > 16) return clean.slice(0, 16);
          const d = new Date(val);
          if (!isNaN(d.getTime())) {
            const pad = (n) => String(n).padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
          }
          return '';
        };

        const currentStart = formatForInput(task.startTime) || new Date().toISOString().slice(0, 16);
        const currentDeadline = formatForInput(task.deadline) || new Date(Date.now() + 150 * 60 * 1000).toISOString().slice(0, 16);
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

        const formatForInput = (val) => {
          if (!val) return '';
          const clean = val.trim().replace(' ', 'T');
          if (clean.length === 16) return clean;
          if (clean.length > 16) return clean.slice(0, 16);
          const d = new Date(val);
          if (!isNaN(d.getTime())) {
            const pad = (n) => String(n).padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
          }
          return '';
        };

        const now = new Date();
        let baseDate = new Date();
        if (task.deadline) {
          const d = new Date(task.deadline.replace(/-/g, '/'));
          if (!isNaN(d.getTime()) && d.getTime() > now.getTime()) {
            baseDate = d;
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
              <div style="font-size:12.5px; color:#64748b; background:#f8fafc; padding:8px 12px; border-radius:8px; border:1px solid #e2e8f0;">
                当前截止时间：<b style="color:#dc2626;">${task.deadline || '无硬性限制'}</b>
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
                <input type="datetime-local" id="input-extend-deadline" class="teacher-input fancy" value="${formatForInput(new Date(baseDate.getTime() + 60 * 60 * 1000).toISOString())}" style="width:100%; font-size:13px; padding:9px 12px; border:1.5px solid #cbd5e1; border-radius:8px;">
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
            dlInput.value = formatForInput(newD.toISOString());
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
                  <label><span class="req">*</span> 📌 关联写作任务 (必选指定任务)</label>
                  <select id="modal-ann-task" class="teacher-input fancy">
                    ${(() => {
                      const classTasks = tasks.filter(t => t.classId === 'all' || t.classId === activeClass.id);
                      if (classTasks.length === 0) return '<option value="task_default">📌 默认写作任务</option>';
                      return classTasks.map(t => `<option value="${t.id}">📌 ${t.title}</option>`).join('');
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
                  <label><span class="req">*</span> 📌 关联写作任务 (必选指定任务)</label>
                  <select id="modal-paper-task" class="teacher-input fancy">
                    ${(() => {
                      const classTasks = tasks.filter(t => t.classId === 'all' || t.classId === activeClass.id);
                      if (classTasks.length === 0) return '<option value="task_default">📌 默认写作任务</option>';
                      return classTasks.map(t => `<option value="${t.id}">📌 ${t.title}</option>`).join('');
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

            const targetTaskId = modal.querySelector('#modal-paper-task') ? modal.querySelector('#modal-paper-task').value : 'task_all';

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
                const tId = (currT && (currT.id || currT.username || currT.studentCode)) || 'u_teacher';
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

    // 终稿不可修改状态控制 (教师一键解除锁定 / 重新锁定)
    const btnToggleFinalSubmitted = container.querySelector('#btn-toggle-final-submitted');
    if (btnToggleFinalSubmitted) {
      btnToggleFinalSubmitted.addEventListener('click', () => {
        const currentSub = state.isFinalSubmitted;
        const newSub = !currentSub;
        state.isFinalSubmitted = newSub;
        authManager.setGroupFinalSubmitted(activeMonitorGId, newSub);

        const currentTaskId = window.app ? (window.app.state.activeTaskId || 'task_default') : 'task_default';
        const curTaskObj = tasks.find(t => t.id === currentTaskId) || { title: '当前写作任务' };
        const lockTitle = newSub ? `🔒 指导教师已锁定【${activeMonitorGroup.name}】写作任务` : `🔓 指导教师已恢复【${activeMonitorGroup.name}】写作任务编辑权限`;
        const lockContent = newSub
        // 立即同步写入小组状态并向全组学生端推送最新权限快照
        if (window.app) {
          window.app.state.isFinalSubmitted = newSub;
          window.app.state.activeMonitorGroupId = activeMonitorGId;
          const selTaskBox = container.querySelector('#sel-switch-monitor-task');
          if (selTaskBox && selTaskBox.value) {
            window.app.state.activeTaskId = selTaskBox.value;
          }
          window.app.saveGroupState(activeMonitorGId);
          if (window.app.cloudSyncEngine) {
            window.app.cloudSyncEngine.groupId = activeMonitorGId;
            window.app.cloudSyncEngine.taskId = window.app.state.activeTaskId || 'task_default';
            window.app.cloudSyncEngine.updateScopeKeys();
            window.app.cloudSyncEngine.pushSnapshot();
          }
        }

        renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
        if (newSub) {
          alert(`🔒 已全局锁定【${activeMonitorGroup.name}】整个写作任务！\n\n学生端所有阶段（阶段一公约、阶段二正文、阶段三答辩）已全盘转为【只读归档模式】。`);
        } else {
          alert(`🔓 已解除【${activeMonitorGroup.name}】写作任务锁定！\n\n学生端所有写作阶段已全面恢复自由协作与编辑修改权限！`);
        }
      });
    }



    const selSwitchTask = container.querySelector('#sel-switch-monitor-task');
    if (selSwitchTask) {
      selSwitchTask.addEventListener('change', async (e) => {
        const targetTId = e.target.value;
        state.activeTaskId = targetTId;
        if (window.app) {
          window.app.state.activeTaskId = targetTId;
          window.app.loadGroupState(state.activeMonitorGroupId || 'group_1');
          if (window.app.cloudSyncEngine) {
            window.app.cloudSyncEngine.groupId = state.activeMonitorGroupId || 'group_1';
            window.app.cloudSyncEngine.taskId = targetTId;
            window.app.cloudSyncEngine.updateScopeKeys();
            try {
              await window.app.cloudSyncEngine.pullFromServer();
            } catch (err) {}
          }
        }
        renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
      });
    }

    const selSwitchGroup = container.querySelector('#sel-switch-monitor-group');
    if (selSwitchGroup) {
      selSwitchGroup.addEventListener('change', async (e) => {
        const targetGId = e.target.value;
        state.activeMonitorGroupId = targetGId;
        if (window.app) {
          window.app.state.activeMonitorGroupId = targetGId;
          window.app.loadGroupState(targetGId);
          if (window.app.cloudSyncEngine) {
            window.app.cloudSyncEngine.groupId = targetGId;
            window.app.cloudSyncEngine.taskId = state.activeTaskId || (currentClassTasks[0] ? currentClassTasks[0].id : 'task_default');
            window.app.cloudSyncEngine.updateScopeKeys();
            try {
              await window.app.cloudSyncEngine.pullFromServer();
            } catch (err) {}
          }
        }
        renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
      });
    }

    container.querySelectorAll('.btn-switch-monitor-group').forEach(btn => {
      btn.addEventListener('click', () => {
        state.activeMonitorGroupId = btn.dataset.gid;
        if (window.app) window.app.loadGroupState(btn.dataset.gid);
        renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
      });
    });

    container.querySelectorAll('.btn-monitor-stage-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        state.teacherMonitorStageMode = btn.dataset.stg;
        renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
      });
    });

    const btnExportExcel = container.querySelector('#btn-export-all-excel');
    if (btnExportExcel) {
      btnExportExcel.addEventListener('click', () => {
        authManager.exportGroupChatLogsToExcel(activeMonitorGId, state.chatLogs);
      });
    }

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
      window._studentPortalSyncTimer = setTimeout(pullAndRefresh, 3000);
    };
    if (window._studentPortalSyncTimer) clearTimeout(window._studentPortalSyncTimer);
    window._studentPortalSyncTimer = setTimeout(pullAndRefresh, 3000);

    const currentUser = authManager.getCurrentUser();
    const classes = authManager.getClasses();
    const tasks = authManager.getTasks();
    const announcements = authManager.getAnnouncements();

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
      const matchClass = !a.classId || a.classId === 'all' || a.classId === userClass.id || (a.className && a.className === userClass.name);
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
      if (!t.classId || t.classId === 'all') return true;
      return t.classId === userClass.id || (t.className && t.className === userClass.name);
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
                            ${isExpired ? `
                              <span style="background:#fef2f2; color:#dc2626; border:1px solid #fecaca; font-size:11.5px; font-weight:800; padding:3px 10px; border-radius:20px;">
                                🛑 已截止
                              </span>
                            ` : `
                              <span style="background:#ecfdf5; color:#059669; border:1px solid #a7f3d0; font-size:11.5px; font-weight:700; padding:3px 10px; border-radius:20px;">
                                🟢 进行中
                              </span>
                            `}
                            <span style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; font-size:11.5px; font-weight:700; padding:3px 10px; border-radius:20px;">
                              👥 ${escapeHtml(t.targetGroupName || groupName)}
                            </span>
                          </div>
                        </div>

                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px 12px; font-size:11.5px; color:#475569; margin-bottom:12px; background:${isExpired ? '#fef2f2' : '#f8fafc'}; padding:10px 14px; border-radius:10px; border:1px solid ${isExpired ? '#fee2e2' : '#f1f5f9'};">
                          <div>🕒 发布时间: <b style="color:#0f172a;">${t.createdAt || t.startTime || '刚刚'}</b></div>
                          <div>⏱️ 任务时长: <b style="color:#2563eb;">${duration} 分钟</b></div>
                          <div>📅 开始时间: <b style="color:#0f172a;">${t.startTime || '随时'}</b></div>
                          <div>⌛ 截止时间: <b style="color:#dc2626; font-weight:800;">${t.deadline || '结课前'}</b></div>
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
    const totalDurationMin = (currentTask && currentTask.durationMinutes) ? Number(currentTask.durationMinutes) : 150;
    const elapsedMin = Math.floor((state.timer && state.timer.elapsedSeconds ? state.timer.elapsedSeconds : 0) / 60);
    const remainingMin = Math.max(0, totalDurationMin - elapsedMin);
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
        <div class="timer-box" style="padding:2px 8px; border-radius:14px; font-size:11.5px;">⏱️ ${remainingMin}m</div>
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
      editor.addEventListener('beforeinput', blockEdit, true);
    }

    // 🛡️ 禁止外部内容粘贴/拖放进正文：强制学生手动撰写，杜绝直接粘贴 AI/范例内容糊弄（保留 Ctrl+C 复制出去用于互评引用）
    const blockPasteIntoEditor = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      let tip = document.querySelector('.jizhi-paste-block-tip');
      if (!tip) {
        tip = document.createElement('div');
        tip.className = 'jizhi-paste-block-tip';
        tip.style.cssText = 'position:fixed; top:18px; left:50%; transform:translateX(-50%); background:linear-gradient(135deg,#dc2626,#b91c1c); color:#fff; padding:11px 22px; border-radius:10px; font-size:13.5px; font-weight:700; box-shadow:0 10px 24px rgba(0,0,0,0.28); z-index:2147483647; white-space:nowrap; transition:opacity .3s ease; pointer-events:none;';
        document.body.appendChild(tip);
      }
      tip.textContent = '🔒 已禁止粘贴：请手动输入正文（可 Ctrl+C 复制，不可 Ctrl+V 粘贴）';
      tip.style.opacity = '1';
      clearTimeout(blockPasteIntoEditor._hideTimer);
      blockPasteIntoEditor._hideTimer = setTimeout(() => {
        if (tip && tip.parentNode) {
          tip.style.opacity = '0';
          setTimeout(() => { if (tip && tip.parentNode) tip.remove(); }, 300);
        }
      }, 2200);
      return false;
    };
    editor.addEventListener('paste', blockPasteIntoEditor, true);
    editor.addEventListener('drop', blockPasteIntoEditor, true);

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

      // 插件 1: 插入图表与学术图题
      const btnInsertImg = container.querySelector(`#${editorId}-btn-insert-image`);
      if (btnInsertImg) {
        btnInsertImg.addEventListener('click', () => {
          const fileInput = document.createElement('input');
          fileInput.type = 'file';
          fileInput.accept = 'image/*';
          fileInput.onchange = (e) => {
            if (e.target.files && e.target.files[0]) {
              const file = e.target.files[0];
              const reader = new FileReader();
              reader.onload = (ev) => {
                const imgData = ev.target.result;
                const caption = prompt('请输入学术图题说明 (例如: 图 1: 研究模型与变量关系架构图):', '图 1: 研究模型与变量关系架构图');
                const figureHtml = `
                  <div class="academic-figure" contenteditable="false">
                    <img src="${imgData}" alt="${escapeHtml(caption || '学术图表')}" style="max-width:85%; border:1px solid #cbd5e1; border-radius:4px; box-shadow:0 2px 8px rgba(0,0,0,0.1);">
                    <p class="figure-caption" style="font-weight:700; color:#334155; margin-top:6px; font-size:13px; text-indent:0;">${escapeHtml(caption || '图 1: 学术模型与实证架构图')}</p>
                  </div>
                  <p><br></p>
                `;
                exec('insertHTML', figureHtml);
              };
              reader.readAsDataURL(file);
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
    const membersList = Object.values(state.members || {});
    const currentUserCode = state.currentUser || 'A';
    const currUserObj = (window.app && window.app.authManager) ? window.app.authManager.getCurrentUser() : null;
    const presence = state.presence || {};
    const now = Date.now();

    const allUsers = (window.app && window.app.authManager) ? window.app.authManager.getUsers() : [];

    const newHtml = membersList.map(m => {
      // 全方位检索组员心跳数据
      const p = presence[m.studentCode] || presence[m.id] || presence[m.student_code] || presence[m.realStudentCode] || (m.name && presence[m.name]) || (m.username && presence[m.username]);
      const isSelf = m.studentCode === currentUserCode || m.id === currentUserCode || (currUserObj && (m.id === currUserObj.id || m.studentCode === currUserObj.studentCode || m.name === currUserObj.name || m.username === currUserObj.username));

      // 🛡️ 稳健在线判定：免疫客户端系统时间正负偏差，90秒内有心跳即视为在线
      const timeDiff = p ? Math.abs(now - (p.updatedAt || 0)) : 999999;
      const isOnline = isSelf || (p && timeDiff < 90000);
      const sectionText = isSelf ? ' (我)' : (isOnline ? ' (在线)' : ' (离线)');
      const color = m.color || '#2563eb';
      let displayName = m.name || m.studentCode;
      const matchedUser = allUsers.find(u => (m.realStudentCode && u.studentCode === m.realStudentCode) || (m.studentCode && u.studentCode === m.studentCode) || (m.id && u.id === m.id) || (m.username && u.username === m.username));
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

    const confirmedMembers = s1.contract.confirmedMembers || {};
    const confirmedCount = membersList.filter(m => confirmedMembers[m.id] || confirmedMembers[m.studentCode] || (m.name && confirmedMembers[m.name])).length;
    const userHasConfirmed = confirmedMembers[currentUser] || (currUserObj && (confirmedMembers[currUserObj.id] || confirmedMembers[currUserObj.studentCode] || confirmedMembers[currUserObj.name]));
    const isContractLocked = s1.contract.isConfirmed || state.isFinalSubmitted || isTaskDeadlineExpired;

    const userHasVoted = s1.hasVoted && (s1.hasVoted[currentUser] || (currUserObj && (s1.hasVoted[currUserObj.id] || s1.hasVoted[currUserObj.studentCode])));
    const userVotedProposalId = s1.votes ? (s1.votes[currentUser] || (currUserObj && (s1.votes[currUserObj.id] || s1.votes[currUserObj.studentCode]))) : null;
    const totalVotesCast = Object.values(s1.hasVoted || {}).filter(Boolean).length;

    // 严密判断当前登录学生是否已提交提案 (支持 id, studentCode, username, 姓名多重比对)
    const myIds = new Set([currentUser, currUserObj?.id, currUserObj?.studentCode, currUserObj?.username].filter(Boolean));
    const hasSubmittedMyProposal = s1.proposals.some(p => myIds.has(p.author) || (currUserObj && (p.authorName === currUserObj.name || p.author === currUserObj.name)));
    const currentUserName = currUserObj ? currUserObj.name : (state.members[currentUser] ? state.members[currentUser].name : '组员');

    canvas.innerHTML = `
      <!-- 全局本组在线组员协同胶囊栏 -->
      <div class="collab-presence-header" id="stage1-canvas-presence-header" style="background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:8px 14px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; box-shadow:0 1px 3px rgba(15,23,42,0.03);">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:12.5px; font-weight:800; color:#1e293b;">👥 本组在线组员:</span>
          <div class="collab-member-pills" id="stage1-canvas-presence-pills"></div>
        </div>
        <div style="font-size:11px; font-weight:700; color:#059669; background:#ecfdf5; border:1px solid #a7f3d0; padding:2px 8px; border-radius:10px;">
          🟢 实时在线感知已激活
        </div>
      </div>

      ${isTaskDeadlineExpired ? `
        <div style="background:#fef2f2; border:1.5px solid #fca5a5; border-radius:10px; padding:12px 18px; margin-bottom:12px; font-size:13px; color:#991b1b; font-weight:700; display:flex; justify-content:space-between; align-items:center; box-shadow:0 2px 8px rgba(239,68,68,0.1);">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:18px;">🔒</span>
            <span><b>任务已截止锁定：</b> 本任务已于 <b>${currentTask?.deadline || '截止时间'}</b> 截止，阶段一【学术拍卖会】已自动转为<b>【只读查阅模式】</b>不可再修改。如需修改请联系任课教师延长时间。</span>
          </div>
          <span style="font-size:12px; color:#ffffff; background:#dc2626; padding:3px 10px; border-radius:6px; font-weight:800;">已截止</span>
        </div>
      ` : (isContractLocked ? `
        <div style="background:#ecfdf5; border:1px solid #a7f3d0; border-radius:8px; padding:10px 14px; margin-bottom:12px; font-size:13px; color:#059669; font-weight:700; display:flex; align-items:center; justify-content:space-between;">
          <span>🔒 阶段一【学术拍卖会】合作合约已全员签署生效并锁定 (可随时返回查阅)</span>
          <span style="font-size:11.5px; color:#065f46; background:#ffffff; border:1px solid #a7f3d0; padding:4px 8px; border-radius:4px;">全组 ${confirmedCount}/${totalMembersCount} 人已签署</span>
        </div>
      ` : '')}

      <div class="card">
        <div class="card-title" style="display:flex; justify-content:space-between; align-items:center;">
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="font-weight:800; font-size:15px; color:#0f172a;">💡 竞拍提案池 ${isContractLocked ? '<span style="font-size:11px; color:#059669;">🔒 已锁定</span>' : ''}</span>
            <span style="font-size:12px; color:#2563eb; background:#eff6ff; padding:2px 8px; border-radius:10px; border:1px solid #bfdbfe;">📊 投票进度: <b>${totalVotesCast}/${totalMembersCount} 人已投票</b></span>
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
                const isThisVoted = userVotedProposalId === p.id;
                let btnText = '🗳️ 投票支持';
                let btnClass = 'vote-btn';
                if (isContractLocked || userHasVoted) {
                  if (isThisVoted) { btnText = '🔒 已投此提案'; btnClass = 'vote-btn active locked'; }
                  else { btnText = '🔒 投票已锁定'; btnClass = 'vote-btn disabled'; }
                }
                const authorUser = allUsers.find(u => u.id === p.author || u.studentCode === p.author || u.username === p.author || u.name === p.author || u.name === p.authorName);
                const authorName = (authorUser ? authorUser.name : null) || p.authorName || (state.members[p.author] ? state.members[p.author].name : p.author);
                return `
                  <div class="proposal-card ${isThisVoted ? 'voted' : ''}" style="display:flex; flex-direction:column;">
                    <div class="proposal-header">
                      <div class="proposal-title">💡 ${escapeHtml(p.title)}</div>
                    </div>
                    <div style="font-size:12px; color:#64748b; margin-bottom:8px;">提出人: <b style="color:#0f172a;">${escapeHtml(authorName)}</b></div>
                    <button class="${btnClass}" data-id="${p.id}" ${isContractLocked || userHasVoted ? 'disabled' : ''} style="width:100%; margin-top:auto;">${btnText}</button>
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
          <input type="text" id="contract-topic-input" class="large-contract-input" value="${s1.mergedTitle || ''}" placeholder="在此处输入研究方案最终主题..." ${isContractLocked ? 'disabled readonly style="opacity:0.8; cursor:not-allowed;"' : ''} style="width:100%; box-sizing:border-box; background:#ffffff; color:#0f172a; border:1px solid #cbd5e1; border-radius:8px; padding:12px 14px; font-size:14px; font-weight:700; font-family:sans-serif;">
        </div>

        <div style="display:flex; flex-direction:column; gap:16px; width:100%;">
          <!-- 6大研究设计方案模块与时间规划 -->
          <div style="background:#f8fafc; padding:18px; border-radius:12px; border:1px solid #bfdbfe; width:100%; box-sizing:border-box;">
            <div style="font-weight:800; color:#1e40af; margin-bottom:14px; font-size:14px;">
              📚 研究方案核心模块与时间规划:
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
              <!-- 模块 1 -->
              <div style="background:#ffffff; border:1px solid #e2e8f0; border-left:3.5px solid #2563eb; border-radius:8px; padding:12px 14px; display:flex; justify-content:space-between; align-items:center;">
                <span style="font-weight:800; color:#1e40af; font-size:13.5px;">一、研究背景与意义</span>
                <label style="font-size:12px; color:#475569; display:flex; align-items:center; gap:4px;">
                  用时: <input type="number" class="contract-time-input" data-key="background" value="${s1.contract.timeAllocations.background !== undefined ? s1.contract.timeAllocations.background : 25}" ${isContractLocked ? 'disabled readonly style="opacity:0.8; cursor:not-allowed;"' : ''} style="width:48px; padding:3px 4px; border:1px solid #cbd5e1; border-radius:4px; text-align:center; font-weight:700;"> 分钟
                </label>
              </div>

              <!-- 模块 2 -->
              <div style="background:#ffffff; border:1px solid #e2e8f0; border-left:3.5px solid #0284c7; border-radius:8px; padding:12px 14px; display:flex; justify-content:space-between; align-items:center;">
                <span style="font-weight:800; color:#0369a1; font-size:13.5px;">二、文献综述</span>
                <label style="font-size:12px; color:#475569; display:flex; align-items:center; gap:4px;">
                  用时: <input type="number" class="contract-time-input" data-key="literature" value="${s1.contract.timeAllocations.literature !== undefined ? s1.contract.timeAllocations.literature : 30}" ${isContractLocked ? 'disabled readonly style="opacity:0.8; cursor:not-allowed;"' : ''} style="width:48px; padding:3px 4px; border:1px solid #cbd5e1; border-radius:4px; text-align:center; font-weight:700;"> 分钟
                </label>
              </div>

              <!-- 模块 3 -->
              <div style="background:#ffffff; border:1px solid #e2e8f0; border-left:3.5px solid #059669; border-radius:8px; padding:12px 14px; display:flex; justify-content:space-between; align-items:center;">
                <span style="font-weight:800; color:#065f46; font-size:13.5px;">三、研究问题与假设</span>
                <label style="font-size:12px; color:#475569; display:flex; align-items:center; gap:4px;">
                  用时: <input type="number" class="contract-time-input" data-key="questions" value="${s1.contract.timeAllocations.questions !== undefined ? s1.contract.timeAllocations.questions : 25}" ${isContractLocked ? 'disabled readonly style="opacity:0.8; cursor:not-allowed;"' : ''} style="width:48px; padding:3px 4px; border:1px solid #cbd5e1; border-radius:4px; text-align:center; font-weight:700;"> 分钟
                </label>
              </div>

              <!-- 模块 4 -->
              <div style="background:#ffffff; border:1px solid #e2e8f0; border-left:3.5px solid #7c3aed; border-radius:8px; padding:12px 14px; display:flex; justify-content:space-between; align-items:center;">
                <span style="font-weight:800; color:#6d28d9; font-size:13.5px;">四、研究设计与方法</span>
                <label style="font-size:12px; color:#475569; display:flex; align-items:center; gap:4px;">
                  用时: <input type="number" class="contract-time-input" data-key="method" value="${s1.contract.timeAllocations.method !== undefined ? s1.contract.timeAllocations.method : 40}" ${isContractLocked ? 'disabled readonly style="opacity:0.8; cursor:not-allowed;"' : ''} style="width:48px; padding:3px 4px; border:1px solid #cbd5e1; border-radius:4px; text-align:center; font-weight:700;"> 分钟
                </label>
              </div>

              <!-- 模块 5 -->
              <div style="background:#ffffff; border:1px solid #e2e8f0; border-left:3.5px solid #d97706; border-radius:8px; padding:12px 14px; display:flex; justify-content:space-between; align-items:center;">
                <span style="font-weight:800; color:#b45309; font-size:13.5px;">五、研究设计的不足与反思</span>
                <label style="font-size:12px; color:#475569; display:flex; align-items:center; gap:4px;">
                  用时: <input type="number" class="contract-time-input" data-key="reflection" value="${s1.contract.timeAllocations.reflection !== undefined ? s1.contract.timeAllocations.reflection : 20}" ${isContractLocked ? 'disabled readonly style="opacity:0.8; cursor:not-allowed;"' : ''} style="width:48px; padding:3px 4px; border:1px solid #cbd5e1; border-radius:4px; text-align:center; font-weight:700;"> 分钟
                </label>
              </div>

              <!-- 模块 6 -->
              <div style="background:#ffffff; border:1px solid #e2e8f0; border-left:3.5px solid #475569; border-radius:8px; padding:12px 14px; display:flex; justify-content:space-between; align-items:center;">
                <span style="font-weight:800; color:#334155; font-size:13.5px;">六、参考文献</span>
                <label style="font-size:12px; color:#475569; display:flex; align-items:center; gap:4px;">
                  用时: <input type="number" class="contract-time-input" data-key="references" value="${s1.contract.timeAllocations.references !== undefined ? s1.contract.timeAllocations.references : 10}" ${isContractLocked ? 'disabled readonly style="opacity:0.8; cursor:not-allowed;"' : ''} style="width:48px; padding:3px 4px; border:1px solid #cbd5e1; border-radius:4px; text-align:center; font-weight:700;"> 分钟
                </label>
              </div>
            </div>
          </div>

          <div style="background:#f8fafc; padding:16px; border-radius:12px; border:1px solid #e2e8f0; width:100%; box-sizing:border-box;">
            <div style="font-weight:700; color:#1e40af; margin-bottom:12px; font-size:14px; display:flex; justify-content:space-between; align-items:center;">
              <span>👥 本组小组成员分工 (共 ${totalMembersCount} 人 · 自动适配全宽展现):</span>
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
                    <input type="text" class="large-contract-input task-assignment-input" data-mkey="${mKey}" value="${taskVal}" ${isContractLocked ? 'disabled readonly style="opacity:0.8; cursor:not-allowed;"' : ''} style="width:100%; box-sizing:border-box; background:#ffffff; color:#0f172a; border:1px solid #cbd5e1; border-radius:6px; padding:10px 14px; font-size:13px; font-family:sans-serif;" placeholder="在聊天中商定或在此录入具体负责的写作章节与任务...">
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
              const isConf = confirmedMembers[m.id] || confirmedMembers[m.studentCode];
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
            // 新提案：加入提案池（带时间戳与真实姓名）
            s1.proposals.push({
              id: 'prop_' + currentUser + '_' + nowMs,
              author: currentUser,
              authorName: currentUserName,
              title: title,
              updatedAt: nowMs
            });
          }

          // 提交提案时不自动给公约融合主题赋值，必须等待全组投票与讨论协商后确立

          const currentStage = state.currentStage;
          const memObj = Object.values(state.members || {}).find(m => m.id === currentUser || m.studentCode === currentUser || m.realStudentCode === currentUser);
          const authorName = memObj ? memObj.name : (currentUser || '组员');
          const totalMembersCount = Object.keys(state.members || {}).length;
          const submittedAuthorsCount = new Set((s1.proposals || []).map(p => p.author)).size;

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

          // 1. 异步调用扣子拍卖师 API，对该提案做针对性学术评估与全组播报 (120~180字)
          setTimeout(async () => {
            const isModify = existingIdx >= 0;
            const evalPrompt = isModify
              ? `小组成员【${authorName}】在学术拍卖会上修改了选题提案，最新题目为《${title}》。请作为学术拍卖师，直接针对《${title}》的具体字面含义与研究切入点，从【🔥 研究看点】、【💡 独特视角】、【🏷️ 竞拍吸睛建议】三个维度发表 100~130 字的真实深度点评，必须具体联系题目字面内容，严禁使用通用模板套话！`
              : `小组成员【${authorName}】在学术拍卖会上提交了新选题提案《${title}》。请作为学术拍卖师，直接针对《${title}》的具体字面含义与研究切入点，从【🔥 研究看点】、【💡 独特视角】、【🏷️ 竞拍吸睛建议】三个维度发表 100~130 字的真实深度点评，必须具体联系题目字面内容，严禁使用通用模板套话！`;

            let evalText = await callCozeAgentAPI('auctioneer', evalPrompt, { stage: 'stage1', proposalTitle: title, author: authorName, topic: title });
            if (!evalText || evalText.trim().length === 0) {
              evalText = `🎪 【拍卖师·选题竞拍看点评估】：收到 ${authorName} 提交的《${title}》！\n🔥 **研究看点**：聚焦于《${title}》所涉及的核心议题；\n💡 **独特视角**：切入视角鲜明，具有探讨与论证空间；\n🏷️ **竞拍建议**：建议全组结合《${title}》深入讨论具体的实施方法，在接下来的投票竞拍中争取更高支持率！`;
            }

            const auctioneerEvalMsg = {
              sender: 'auctioneer',
              senderName: '头脑风暴 · 学术拍卖师',
              text: evalText,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              _timeMs: Date.now()
            };
            state.chatLogs[currentStage].push(auctioneerEvalMsg);

            // 2. 如果全员都已提交提案（3/3），拍卖师主动发话引导全员进入投票环节
            if (submittedAuthorsCount >= totalMembersCount) {
              setTimeout(() => {
                const allSubmittedList = (s1.proposals || []).map((p, idx) => `${idx + 1}. 《${p.title}》(${state.members[p.author] ? state.members[p.author].name : p.author})`).join('\n');
                const votePromptMsg = {
                  sender: 'auctioneer',
                  text: `🗳️ 【拍卖师·全员提案集齐 ➔ 开启竞拍投票】\n全组 ${totalMembersCount} 位成员的选题提案已全部陈列在左侧提案池中：\n${allSubmittedList}\n\n👉 **请全组成员点击左侧提案下方的【🗳️ 投这篇】按钮**，投出你宝贵的一票！全员投完后系统将落槌公布计票结果！`,
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  _timeMs: Date.now()
                };
                state.chatLogs[currentStage].push(votePromptMsg);
                if (window.app) {
                  window.app.syncChatLogs();
                  if (window.app.cloudSyncEngine) window.app.cloudSyncEngine.pushSnapshot();
                  renderChat(state);
                }
              }, 1000);
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

    // ── 方案一实施：解耦实时打字与网络同步，彻底根除时间回弹与打字被吃问题 ──
    // 1. input 事件：纯本地更新内存，绝对不向网络发包，打字改时间 100% 顺畅
    // 2. blur / change / Enter 事件：用户输入完成离开或敲回车时，立即一次性完整同步上云！

    const topicInput = canvas.querySelector('#contract-topic-input');
    if (topicInput && !isContractLocked) {
      let topicTimer = null;
      const flushTopic = () => {
        s1.mergedTitle = topicInput.value;
        if (window.app) {
          window.app.syncStage1();
          if (window.app.cloudSyncEngine) window.app.cloudSyncEngine.pushSnapshot();
        }
      };
      topicInput.addEventListener('input', (e) => {
        s1.mergedTitle = e.target.value;
        if (topicTimer) clearTimeout(topicTimer);
        topicTimer = setTimeout(flushTopic, 300);
      });
      topicInput.addEventListener('change', flushTopic);
      topicInput.addEventListener('blur', flushTopic);
      topicInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { topicInput.blur(); } });
    }

    canvas.querySelectorAll('.contract-time-input').forEach(input => {
      if (!isContractLocked) {
        let timeTimer = null;
        const flushTime = () => {
          const key = input.dataset.key;
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
        input.addEventListener('input', (e) => {
          const key = e.target.dataset.key;
          const numVal = Number(e.target.value) || 0;
          if (key && s1.contract.timeAllocations) {
            s1.contract.timeAllocations[key] = numVal;
          }
          if (timeTimer) clearTimeout(timeTimer);
          timeTimer = setTimeout(flushTime, 300);
        });
        input.addEventListener('change', flushTime);
        input.addEventListener('blur', flushTime);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { input.blur(); } });
      }
    });

    canvas.querySelectorAll('.task-assignment-input').forEach(input => {
      if (!isContractLocked) {
        let taskTimer = null;
        const flushTask = () => {
          const mKey = input.dataset.mkey;
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
        input.addEventListener('input', (e) => {
          const mKey = e.target.dataset.mkey;
          const val = e.target.value;
          if (!s1.contract.taskAssignments) s1.contract.taskAssignments = {};
          if (mKey) s1.contract.taskAssignments[mKey] = val;
          if (taskTimer) clearTimeout(taskTimer);
          taskTimer = setTimeout(flushTask, 300);
        });
        input.addEventListener('change', flushTask);
        input.addEventListener('blur', flushTask);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { input.blur(); } });
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

    const userGroupId = state.currentUser && state.members[state.currentUser] ? state.members[state.currentUser].groupId : 'group_1';
    const currUser = (window.app && window.app.authManager) ? window.app.authManager.getCurrentUser() : null;
    const userClassId = currUser ? currUser.classId : null;
    const activeTaskId = state.activeTaskId || 'task_default';
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
        <div style="background:#fef2f2; border:1.5px solid #fca5a5; border-radius:10px; padding:12px 18px; margin-bottom:12px; font-size:13px; color:#991b1b; font-weight:700; display:flex; justify-content:space-between; align-items:center; box-shadow:0 2px 8px rgba(239,68,68,0.1);">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:18px;">🔒</span>
            <span><b>任务已截止锁定：</b> 本任务已于 <b>${currentTask?.deadline || '截止时间'}</b> 截止，写作正文已自动转为<b>【只读模式】</b>不可再编辑。如需修改请联系任课教师延长时间。</span>
          </div>
          <span style="font-size:12px; color:#ffffff; background:#dc2626; padding:3px 10px; border-radius:6px; font-weight:800;">已截止</span>
        </div>
      ` : ''}

      ${isStage2MeetingLocked ? `
        <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:10px 14px; margin-bottom:10px; font-size:13px; color:#1d4ed8; font-weight:700; display:flex; justify-content:space-between; align-items:center;">
          <span>🔒 阶段二【半程编辑会议】打分与修正清单已完成并锁定 ${isEditorReadonly ? '· 全盘终稿已提交只读查阅' : '· 可随时回看'}</span>
          <span style="font-size:11.5px; color:#1e40af; background:#ffffff; border:1px solid #bfdbfe; padding:4px 8px; border-radius:4px;">归档只读</span>
        </div>
      ` : ''}

      <div class="card" style="height:100%; display:flex; flex-direction:column; padding:16px;">
        <div class="card-title" style="margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
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
          <div id="stage2-action-plan-card" style="background:#ecfdf5; border:1px solid #a7f3d0; border-radius:8px; padding:8px 14px; margin-bottom:8px; transition:all 0.2s ease;">
            <div style="display:flex; justify-content:space-between; align-items:center; cursor:pointer;" id="btn-toggle-action-plan">
              <div style="font-size:12.5px; font-weight:800; color:#059669; display:flex; align-items:center; gap:6px;">
                <span>📋 【半程修正清单】(3项修改要求)</span>
                <span style="font-size:11px; background:#d1fae5; color:#065f46; padding:1px 6px; border-radius:10px;">已生成</span>
              </div>
              <span id="icon-toggle-action-plan" style="font-size:11.5px; color:#059669; font-weight:700;">▲ 收起</span>
            </div>
            <div id="body-action-plan-items" style="font-size:12px; color:#334155; display:flex; flex-direction:column; gap:3px; margin-top:6px;">
              ${actionPlan.items.map(item => `<div style="line-height:1.5;">• ${item}</div>`).join('')}
            </div>
          </div>
        ` : (() => {
          const subs = s2.meetingSubmissions || {};
          const subCount = Object.keys(subs).length;
          return `
            <div id="stage2-action-plan-card" style="background:#f8fafc; border:1px dashed #cbd5e1; border-radius:8px; padding:8px 14px; margin-bottom:8px;">
              <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
                <div style="font-size:12px; font-weight:700; color:#64748b; display:flex; align-items:center; gap:6px;">
                  <span>📋 【半程修正清单】</span>
                  <span style="font-size:10.5px; background:${subCount > 0 ? '#dbeafe' : '#e2e8f0'}; color:${subCount > 0 ? '#1d4ed8' : '#475569'}; padding:1px 8px; border-radius:10px; font-weight:700;">
                    ${subCount > 0 ? `待解锁 (全员自查进度 ${subCount}/${totalCount}人)` : `待解锁 (0/${totalCount}人)`}
                  </span>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                  <span style="font-size:11px; color:#94a3b8;">（需全组成员完成半程自查后自动生成）</span>
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
        <div style="flex:1; min-height:0; display:flex; flex-direction:column;">
          ${(() => {
            const protocol = window.location.protocol;
            const host = window.location.hostname || '47.99.110.230';
            const padName = `jizhi_${activeTaskId}_${userGroupId}`;
            const currUserName = (currUser && (currUser.name || currUser.username)) || '组员';
            const currUserColor = (state.members && state.members[currUserCode]?.color) || '#2563eb';
            const padUrl = `/p/${padName}?userName=${encodeURIComponent(currUserName)}&userColor=${encodeURIComponent(currUserColor)}&showChat=false&showLineNumbers=true&showControls=true`;

            return `
              <div class="word-editor-container" style="display:flex; flex-direction:column; height:100%; min-height:580px; border-radius:10px; overflow:hidden; border:1px solid #cbd5e1; box-shadow:0 4px 16px rgba(15,23,42,0.06); background:#ffffff;">
                <div class="collab-presence-header" id="stage2-word-editor-presence-header" style="display:flex; justify-content:space-between; align-items:center; padding:8px 16px; background:#f8fafc; border-bottom:1px solid #e2e8f0;">
                  <div style="display:flex; align-items:center; gap:8px;">
                    <div class="collab-presence-title" style="font-size:12.5px; font-weight:800; color:#334155;">
                      <span>👥 组员协同在线感知 (Etherpad OT 毫秒级字对字引擎):</span>
                    </div>
                    <div class="collab-member-pills" id="stage2-word-editor-presence-pills"></div>
                  </div>
                  <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-size:11px; background:#ecfdf5; color:#059669; border:1px solid #a7f3d0; padding:2px 8px; border-radius:10px; font-weight:700;">🟢 Etherpad 毫秒协同已就绪</span>
                  </div>
                </div>
                <div style="flex:1; min-height:0; position:relative; background:#f1f5f9;">
                  <iframe id="stage2-etherpad-frame" src="${padUrl}" style="width:100%; height:100%; min-height:540px; border:none; display:block;" allow="clipboard-read; clipboard-write"></iframe>
                </div>
              </div>
            `;
          })()}
        </div>

        <div style="margin-top:8px; background:#ffffff; padding:8px 14px; border-radius:8px; border:1px solid #cbd5e1; flex-shrink:0; display:flex; flex-direction:column; gap:6px; box-shadow:0 1px 3px rgba(15,23,42,0.04);">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:12px; font-weight:800; color:#1e293b;">📊 团队协作贡献度占比 (SSRL 群体过程感知):</span>
            <div class="contrib-labels" id="stage2-contrib-labels" style="display:flex; font-size:11.5px; font-weight:700; color:#475569; gap:12px; white-space:nowrap;">
              ${(() => {
                const contribs = s2.memberContributions || {};
                let rawTotal = 0;
                membersList.forEach(m => { rawTotal += (contribs[m.id] || 0) + (contribs[m.studentCode] || 0); });
                return membersList.map((m) => {
                  const rawVal = (contribs[m.id] || 0) + (contribs[m.studentCode] || 0);
                  const pct = (rawTotal === 0 || rawVal === 0) ? (membersList.length > 0 ? Math.round(100 / membersList.length) : 0) : Math.round((rawVal / rawTotal) * 100);
                  return `<span style="color:${m.color || '#2563eb'}; font-weight:700;">● ${m.name}: ${pct}%</span>`;
                }).join('');
              })()}
            </div>
          </div>
          <div class="contrib-bars" id="stage2-contrib-bars" style="width:100%; height:10px; border-radius:5px; display:flex; overflow:hidden; background:#e2e8f0;">
            ${(() => {
              const contribs = s2.memberContributions || {};
              let rawTotal = 0;
              membersList.forEach(m => { rawTotal += (contribs[m.id] || 0) + (contribs[m.studentCode] || 0); });
              if (rawTotal === 0 && plainTextLen === 0) {
                return `<div style="width:100%; height:10px; background:#f1f5f9; border-radius:5px; display:flex; align-items:center; justify-content:center; font-size:10.5px; color:#94a3b8;">暂无协作投入 (开始编辑正文或研讨后将自动呈现贡献占比)</div>`;
              }
              return membersList.map((m) => {
                const rawVal = (contribs[m.id] || 0) + (contribs[m.studentCode] || 0);
                const pct = (rawTotal === 0) ? Math.round(100 / (membersList.length || 1)) : Math.round((rawVal / rawTotal) * 100);
                return `<div class="contrib-segment" style="width:${pct}%; background:${m.color || '#2563eb'}; transition:width 0.3s ease;" title="${m.name}: ${pct}% (基于写作与修改累计工作量)"></div>`;
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
    const allTasks = (window.app && window.app.authManager) ? window.app.authManager.getTasks() : [];
    const currentTask = allTasks.find(t => t.id === state.activeTaskId);
    const isTaskDeadlineExpired = isTaskExpired(currentTask);
    const isFinalSubmitted = state.isFinalSubmitted || isTaskDeadlineExpired;

    canvas.innerHTML = `
      <div style="height:100%; display:flex; flex-direction:column; gap:12px;">
        ${isTaskDeadlineExpired ? `
          <div style="background:#fef2f2; border:1.5px solid #fca5a5; border-radius:10px; padding:12px 18px; margin-bottom:4px; font-size:13px; color:#991b1b; font-weight:700; display:flex; justify-content:space-between; align-items:center; box-shadow:0 2px 8px rgba(239,68,68,0.1);">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:18px;">🔒</span>
              <span><b>任务已截止锁定：</b> 本任务已于 <b>${currentTask?.deadline || '截止时间'}</b> 截止，阶段三【答辩擂台】已自动转为<b>【只读查阅模式】</b>不可再修改终稿。如需修改请联系任课教师延长时间。</span>
            </div>
            <span style="font-size:12px; color:#ffffff; background:#dc2626; padding:3px 10px; border-radius:6px; font-weight:800;">已截止</span>
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
          const activeTaskId = state.activeTaskId || 'task_default';
          const userGroupId = state.currentUser ? (state.currentUser.groupId || 'group_1') : 'group_1';
          const padName = `jizhi_${activeTaskId}_${userGroupId}`;
          const currUserName = (currUser && (currUser.name || currUser.username)) || '组员';
          const currUserColor = (state.members && state.members[currUserCode]?.color) || '#2563eb';
          const padUrl = `/p/${padName}?userName=${encodeURIComponent(currUserName)}&userColor=${encodeURIComponent(currUserColor)}&showChat=false&showLineNumbers=true&showControls=true`;

          return `
            <div class="card" style="flex:1; display:flex; flex-direction:column; padding:16px; min-height:600px;">
              <div class="card-title" style="margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:15px; font-weight:800; color:#0f172a;">📝 论文全篇大正文 ${isFinalSubmitted ? '<span style="font-size:11px; color:#059669; margin-left:6px;">(🔒 终稿已提交 · 归档只读查阅)</span>' : '(依据答辩意见实时协同修改终稿 · Etherpad 毫秒级引擎)'}</span>
                <span style="font-size:11px; background:#ecfdf5; color:#059669; border:1px solid #a7f3d0; padding:2px 8px; border-radius:10px; font-weight:700;">🟢 Etherpad 协同就绪</span>
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
    const stream = document.getElementById('chat-stream');
    if (!stream) return;

    const currentUser = state.currentUser;
    // 🌟 全局持久化聊天流：保留阶段一、阶段二、阶段三所有研讨历史，随时回看绝不清空
    const visibleStages = ['stage1', 'stage2', 'stage3'];

    // Collect all visible messages in order, auto-purging old legacy idle spam
    const allMsgs = [];
    visibleStages.forEach(stg => {
      if (state.chatLogs && state.chatLogs[stg]) {
        // 渲染时仅过滤展示，绝不改写 state.chatLogs（渲染函数不应有数据副作用，避免快速重渲染丢消息，见审查 #38）
        state.chatLogs[stg].forEach(msg => {
          const txt = msg.text || '';
          if (txt.includes('已连续') || txt.includes('互动督促') || txt.includes('秒未研讨') || txt.includes('秒没有发言')) return;
          allMsgs.push(msg);
        });
      }
    });

    // 智能滚动：如果用户正在往上拉浏览历史记录，保持当前视角不被强行打断拉回底部
    const isAtBottom = (stream.scrollHeight - stream.scrollTop - stream.clientHeight) < 90;
    const prevScrollTop = stream.scrollTop;

    const allUsers = (window.app && window.app.authManager) ? window.app.authManager.getUsers() : [];

    stream.innerHTML = allMsgs.map(msg => {
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
            <img src="${imgSrc}" style="max-width:240px; max-height:180px; border-radius:8px; border:1px solid #cbd5e1; cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,0.1); transition:transform 0.2s;" onclick="window.open('${imgSrc}')" title="点击查看原图">
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
              <span style="font-size:10px; color:#64748b; margin-left:6px;">${escapeHtml(msg.timestamp || '')}</span>
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
  }

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

      const user = this.authManager.getCurrentUser();
      const currentGroupId = user && user.groupId ? user.groupId : 'group_1';
      this.loadGroupState(currentGroupId);

      this.cloudSyncEngine = new CloudSyncEngine(this);
      this.initTimer();
      this.renderMain();

      // 启动时立刻从 MySQL 服务器拉取最新全局教务元数据与小组协同数据
      (async () => {
        try {
          await this.authManager.pullGlobalMeta();
          this.loadGroupState(currentGroupId);
          this.renderMain();
          if (this.cloudSyncEngine) {
            this.cloudSyncEngine.updateScopeKeys();
            this.cloudSyncEngine.pullFromServer();
          }
          if (user && user.role === 'student' && this.state.studentViewMode === 'workspace') {
            this.checkUnreadAnnouncements();
          }
        } catch (e) {}
      })();
    }

    loadGroupState(groupId = 'group_1') {
      const defaultState = JSON.parse(JSON.stringify(InitialState));
      const taskId = this.state.activeTaskId || 'task_default';
      this.state.members = this.authManager.getGroupMembersForWorkspace(groupId);

      // 纯净初始内存状态，杜绝本地历史脏读
      this.state.chatLogs = { stage1: [], stage2: [], stage3: [] };
      this.state.stage1 = JSON.parse(JSON.stringify(defaultState.stage1));
      this.state.stage2 = JSON.parse(JSON.stringify(defaultState.stage2));
      this.state.stage3 = JSON.parse(JSON.stringify(defaultState.stage3));
      this.state.currentStage = 'stage1';
      this.state.isFinalSubmitted = false;

      // 立即触发云端拉取最新真实数据
      if (this.cloudSyncEngine) {
        this.cloudSyncEngine.groupId = groupId;
        this.cloudSyncEngine.taskId = taskId;
        this.cloudSyncEngine.updateScopeKeys();
        this.cloudSyncEngine.pullFromServer();
      }
    }

    initPresetMessagesForGroup(groupId) {
      this.state.chatLogs = { stage1: [], stage2: [], stage3: [] };
    }

    resetTestGroupState(groupId = 'group_1', taskId = null) {
      if (taskId) this.state.activeTaskId = taskId;
      const targetTaskId = this.state.activeTaskId || 'task_default';
      const defaultState = JSON.parse(JSON.stringify(InitialState));
      this.state.activeMonitorGroupId = groupId;
      this.state.stage1 = defaultState.stage1;
      this.state.stage2 = defaultState.stage2;
      this.state.stage3 = defaultState.stage3;
      this.state.currentStage = 'stage1';
      this.state.isFinalSubmitted = false;
      this.state.presence = {};
      this.initPresetMessagesForGroup(groupId);
      this.saveGroupState(groupId);

      // 🔔 同步清空该小组在当前任务下的通知已读与教师端追踪矩阵确认状态 (方便反复演练测试)
      try {
        const announcements = this.authManager.getAnnouncements();
        const classes = this.authManager.getClasses();
        const allUsers = this.authManager.getUsers();
        let changed = false;

        // 严格只收集当前被重置小组及其组员的标识，绝不波及其他小组
        const groupMembersKeys = new Set();
        if (groupId) groupMembersKeys.add(groupId);
        classes.forEach(c => {
          (c.groups || []).forEach(g => {
            if (g && ((g.id && g.id === groupId) || (g.name && g.name === groupId))) {
              if (g.id) groupMembersKeys.add(g.id);
              (g.members || []).forEach(m => {
                const mId = (typeof m === 'object' && m !== null) ? (m.id || m.userId || m.studentCode) : m;
                if (mId) {
                  groupMembersKeys.add(mId);
                  const uObj = allUsers.find(u => (u.id === mId || u.studentCode === mId || u.username === mId || u.name === mId));
                  if (uObj) {
                    if (uObj.id) groupMembersKeys.add(uObj.id);
                    if (uObj.studentCode) groupMembersKeys.add(uObj.studentCode);
                    if (uObj.username) groupMembersKeys.add(uObj.username);
                  }
                }
              });
            }
          });
        });

        announcements.forEach(ann => {
          const matchTask = !ann.taskId || ann.taskId === 'task_all' || ann.taskId === targetTaskId || (targetTaskId === 'task_default' && !ann.taskId);
          if (matchTask) {
            if (ann.readGroupStatus) {
              if (groupId && ann.readGroupStatus[groupId]) { delete ann.readGroupStatus[groupId]; changed = true; }
            }
            if (ann.readStatus) {
              groupMembersKeys.forEach(k => {
                if (ann.readStatus[k]) { delete ann.readStatus[k]; changed = true; }
              });
            }
            if (Array.isArray(ann.confirmedMembers)) {
              const origLen = ann.confirmedMembers.length;
              ann.confirmedMembers = ann.confirmedMembers.filter(m => {
                if (!m) return false;
                if (m.groupId === groupId) return false;
                if (m.id && groupMembersKeys.has(m.id)) return false;
                if (m.studentCode && groupMembersKeys.has(m.studentCode)) return false;
                return true;
              });
              if (ann.confirmedMembers.length !== origLen) changed = true;
            }
          }
        });

        if (changed) {
          localStorage.setItem(STORAGE_KEY_ANNOUNCEMENTS, JSON.stringify(announcements));
          this.authManager.pushGlobalMeta();
        }
      } catch (e) {}

      const currUser = this.authManager ? this.authManager.getCurrentUser() : null;
      const teacherUserId = (currUser && (currUser.id || currUser.username || currUser.studentCode)) || 'u_teacher';
      const teacherToken = (currUser && (currUser.token || currUser.activeSessionId)) || '';

      // 发送原子重置请求直达服务端 (独立通道，100% 必达，彻底清空服务端数据库与缓存)
      fetch(`sync.php?action=reset_group&groupId=${encodeURIComponent(groupId)}&taskId=${encodeURIComponent(targetTaskId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isReset: true, userId: teacherUserId, token: teacherToken })
      }).then(r => r.json()).then(res => {
        if (this.cloudSyncEngine) {
          this.cloudSyncEngine.groupId = groupId;
          this.cloudSyncEngine.taskId = targetTaskId;
          this.cloudSyncEngine.updateScopeKeys();
          this.cloudSyncEngine.isResetBroadcast = true;
          this.cloudSyncEngine.broadcastLocal({ isReset: true, resetSeq: (res && res.resetSeq) ? res.resetSeq : Date.now() });
        }
      }).catch(() => {
        if (this.cloudSyncEngine) {
          this.cloudSyncEngine.groupId = groupId;
          this.cloudSyncEngine.taskId = targetTaskId;
          this.cloudSyncEngine.updateScopeKeys();
          this.cloudSyncEngine.isResetBroadcast = true;
          this.cloudSyncEngine.pushSnapshot();
        }
      });
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
      // 彻底废除 LocalStorage 冗余脏备份，状态完全由内存状态机和云端 MySQL 统一权威托管
    }

    syncChatLogs() {
      const groupId = this.getEffectiveGroupId();
      const taskId = this.state.activeTaskId || 'task_default';
      const stage = this.state.currentStage || 'stage1';
      const logs = (this.state.chatLogs && this.state.chatLogs[stage]) ? this.state.chatLogs[stage] : [];
      const latestMsg = logs[logs.length - 1];

      if (latestMsg) {
        try {
          fetch(`sync.php?action=send_chat&groupId=${encodeURIComponent(groupId)}&taskId=${encodeURIComponent(taskId)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: latestMsg.id,
              groupId: groupId,
              taskId: taskId,
              stage: stage,
              sender: latestMsg.sender,
              senderName: latestMsg.senderName || '',
              text: latestMsg.text,
              timestamp: latestMsg.timestamp,
              _timeMs: latestMsg._timeMs || Date.now()
            })
          }).catch(() => {});
        } catch (e) {}
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
      // 🌿 自然轻量在线：心跳在普通网络交互与阶段流转时随路携带，避免每2.5秒高频强推造成界面抖动
      setInterval(() => {
        const currentUser = this.authManager ? this.authManager.getCurrentUser() : null;
        if (currentUser && currentUser.role === 'student' && this.state.studentViewMode === 'workspace') {
          if (!this.state.presence) this.state.presence = {};
          const myKeys = [currentUser.id, currentUser.studentCode, currentUser.username, currentUser.name].filter(Boolean);
          const now = Date.now();
          myKeys.forEach(k => {
            this.state.presence[k] = {
              nodeIndex: (this.state.presence[k] && this.state.presence[k].nodeIndex) || 0,
              activeSection: (this.state.presence[k] && this.state.presence[k].activeSection) || '在线协作',
              updatedAt: now
            };
          });
        }
      }, 10000);
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

          // 📝 自动从 Etherpad 实时提取当前论文最新切片，供审稿编辑/责任编辑深度分析
          if (currentStage === 'stage2') {
            const activeTaskId = this.state.activeTaskId || 'task_default';
            const effectiveClassId = this.state.activeStudentClassId || (currentUser?.classId || 'class_101');
            const activeGroupObj = this.authManager ? this.authManager.getStudentActiveGroup(currentUser, effectiveClassId) : null;
            const currentGroupId = activeGroupObj?.id || (currentUser?.groupId || 'group_1');
            const padName = `jizhi_${activeTaskId}_${currentGroupId}`;
            fetch(`sync.php?action=get_pad_text&padId=${padName}`)
              .then(res => res.json())
              .then(data => {
                if (data && data.success && data.text) {
                  if (this.state.stage2 && this.state.stage2.unifiedContent !== data.text) {
                    this.state.stage2.unifiedContent = data.text;
                  }
                }
              })
              .catch(() => {});
          }

          // ⏰ 全局进度与阶段间转场催促 + 阶段二智能体保底机制 (仅由组长单点触发，杜绝多人并发 AI 消息风暴)
          const isGroupLeader = !!(currentUser && (currentUser.role === 'leader' || (currentUser.roleTitle || '').includes('组长')));
          const activeTaskId = this.state.activeTaskId || 'task_default';
          const currentGroupId = (currentUser && currentUser.groupId) ? currentUser.groupId : (this.state.activeMonitorGroupId || 'group_1');
          const allTasks = (this.authManager) ? this.authManager.getTasks() : [];
          const curTask = allTasks.find(t => t.id === activeTaskId);
          const totalDurationMin = (curTask && curTask.durationMinutes) ? Number(curTask.durationMinutes) : 150;
          const totalDurationSec = totalDurationMin * 60;
          const totalProgress = (totalDurationSec > 0) ? (this.state.timer.elapsedSeconds / totalDurationSec) : 0;

          if (isGroupLeader) {
            // 1. 【20% 节点】阶段一 ➔ 阶段二防卡关 (总时间 20%)
            const isContractConfirmed = !!(this.state.stage1 && this.state.stage1.contract && this.state.stage1.contract.isConfirmed);
            const s1GateMsgId = `msg_gate_s1_${activeTaskId}_${currentGroupId}_20pct`;
            const s1AlreadySent = (this.state.chatLogs.stage1 || []).some(m => m.id === s1GateMsgId || (m.text && m.text.includes('已消耗总时间 20%')));

          if (totalProgress >= 0.20 && currentStage === 'stage1' && !isContractConfirmed && !s1AlreadySent) {
            const msgStage1 = {
              id: s1GateMsgId,
              sender: 'auctioneer',
              text: `🎪 【拍卖师·进度提示】：阶段一选题时间已达上限（已消耗总时间 20%）！请全组成员停止讨论，立即在公约卡片点击【签署确认】，马上解锁进入【阶段二：学术编辑部】开启正文写作！`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              _timeMs: nowMs
            };
            if (!this.state.chatLogs.stage1) this.state.chatLogs.stage1 = [];
            this.state.chatLogs.stage1.push(msgStage1);
            this.syncChatLogs();
            renderChat(this.state);
          }

          // 2. 【阶段二智能体保底机制】(S2 经历 65% 正常轨 + 全局 75% 极端保底轨)
          if (currentStage === 'stage2') {
            const s2MeetingMsgId = `msg_s2_meeting_${activeTaskId}_${currentGroupId}`;
            const isMeetingDone = !!(this.state.stage2 && this.state.stage2.actionPlan && this.state.stage2.actionPlan.isGenerated) ||
                                  (this.state.chatLogs.stage2 || []).some(m => m.id === s2MeetingMsgId || (m.text && m.text.includes('半程会议号召')));

            if (!isMeetingDone) {
              const s2StartTime = (this.state.stage2 && this.state.stage2.stageStartTime) ? this.state.stage2.stageStartTime : null;
              const s2ElapsedMin = s2StartTime ? Math.max(0, (nowMs - s2StartTime) / 60000) : Math.max(0, min - (totalDurationMin * 0.10));
              const s2TargetMin = totalDurationMin * 0.70;

              const isNormalDue = (s2TargetMin > 0) && (s2ElapsedMin >= (s2TargetMin * 0.65));
              const isEmergencyDue = (totalProgress >= 0.75);

              if (isNormalDue || isEmergencyDue) {
                this.state.stage2MeetingTimeTriggered = true;
                const meetingCallMsg = {
                  id: s2MeetingMsgId,
                  sender: 'managingEditor',
                  text: `🤝 【责任编辑·半程会议号召】：阶段二协作时间已达到 65%（正文骨架已搭建）！请全体小组成员点击上方【📢 发起编辑会议】完成 4 维自查打卡，稍后审稿编辑将结合全组情况进行深度学术质检与清单生成！`,
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
            // ⚡ 学生在工作台协作时：每 3 秒后台静默拉取云端，实时感知教师发布的新通知或删除的通知/文献/问卷
            if (!this._studentWorkspacePollTick) this._studentWorkspacePollTick = 0;
            this._studentWorkspacePollTick++;
            if (this._studentWorkspacePollTick % 3 === 0) {
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
        renderLoginView(appEl, this.authManager, () => {
          const u = this.authManager.getCurrentUser();
          const gId = u && u.groupId ? u.groupId : 'group_1';
          this.loadGroupState(gId);
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
        this.loadGroupState(currentGroupId);

        if (this.state.studentViewMode === 'task_list') {
          appEl.className = 'app-student-portal-mode';
          renderStudentTaskPortal(
            appEl, this.authManager, this.state,
            async (taskId) => {
              this.state.activeTaskId = taskId || 'task_default';
              this.state.studentViewMode = 'workspace';
              if (this.authManager && this.authManager.pullGlobalMeta) {
                try { await this.authManager.pullGlobalMeta(); } catch (e) {}
              }
              const latestClassId = this.state.activeStudentClassId || currentUser?.classId || 'class_101';
              const latestGroupObj = this.authManager.getStudentActiveGroup(currentUser, latestClassId);
              const targetGroupId = latestGroupObj.id || (currentUser && currentUser.groupId ? currentUser.groupId : 'group_1');
              this.loadGroupState(targetGroupId);

              // 🟢 进入任务工作台第 0 毫秒：立即广播在线心跳
              if (!this.state.presence) this.state.presence = {};
              const myKeys = [currentUser?.id, currentUser?.studentCode, currentUser?.username, currentUser?.name].filter(Boolean);
              const now = Date.now();
              myKeys.forEach(k => {
                this.state.presence[k] = { nodeIndex: 0, activeSection: '在线协作', updatedAt: now };
              });

              this.renderMain();
              if (this.cloudSyncEngine) {
                this.cloudSyncEngine.updateScopeKeys();
                this.cloudSyncEngine.pushSnapshot();
                this.cloudSyncEngine.pullFromServer();
              }
              this.checkUnreadAnnouncements();
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
              <div class="chat-header">
                <div class="chat-title"><span>💬 协同对话研讨</span></div>
                <div class="active-agent-pills">
                  <span class="agent-pill">🎪 拍卖师</span>
                  <span class="agent-pill">🤝 责任编辑</span>
                  <span class="agent-pill">📝 审稿编辑</span>
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
          return p && (now - (p.updatedAt || 0) < 60000);
        });

        let primaryMember = onlineMembers.find(m => m.studentCode === 'A' || m.roleTitle?.includes('组长') || m.role === 'leader');
        if (!primaryMember && onlineMembers.length > 0) {
          primaryMember = [...onlineMembers].sort((a, b) => (a.studentCode || a.id || '').localeCompare(b.studentCode || b.id || ''))[0];
        }

        const isPrimaryGuardian = primaryMember && (primaryMember.studentCode === myCode || primaryMember.id === myCode);
        if (!isPrimaryGuardian) return;

        const stage = this.state.currentStage;
        const totalMembersCount = membersList.length;
        const activeMembersCount = onlineMembers.length;
        if (activeMembersCount < totalMembersCount) return; // 基础前提：在场成员活跃才触发情绪/冷场提醒！

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

              const comfortMsg = {
                sender: agentSender,
                text: comfortText,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                _timeMs: now
              };
              if (!this.state.chatLogs[stage]) this.state.chatLogs[stage] = [];
              this.state.chatLogs[stage].push(comfortMsg);
              this.syncChatLogs();
              if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
              renderChat(this.state);
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

          // 核心守护保护：同时检测【讨论区发言】与【左侧提案操作活跃态】
          const lastProposalTime = proposals.length > 0 ? Math.max(...proposals.map(p => p.updatedAt || 0)) : 0;
          const lastLeftActionTime = Math.max(lastProposalTime, this.stage1LastActionTime || 0);
          const timeSinceLastLeftAction = now - lastLeftActionTime;

          // 1. 【提案阶段研讨静默守护】：只有当【讨论区无人发言 > 3min】且【左侧也无人在操作/撰写提案 > 3min】时，才判定为真正冷场并破冰！
          if (submittedCount < totalMembersCount && silenceDurationMs > 180000 && timeSinceLastLeftAction > 180000) {
            if (!this.lastDiscussionNudgeTime || now - this.lastDiscussionNudgeTime > 240000) {
              this.lastDiscussionNudgeTime = now;
              const msg = {
                sender: 'auctioneer',
                text: `💡 【拍卖师·研讨互动提示】：大家在构思选题的过程中，可以在讨论区互相交流灵感、探讨研究问题的价值与可行性，共同激发更好的提案！`,
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
              const msg = {
                sender: 'managingEditor',
                text: `🤝 【责任编辑·起草提示】：大家已进入协作工作区！\n• 建议组员按照阶段一公约分工开始撰写各自负责的内容；\n• 撰写同时，多阅读同伴已写好的段落，在研讨区互相提出优化建议或协助润色，共同打磨全篇！`,
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

          // 2. 🎯 进度雷达 1：正文写到【二、文献综述】或【三、研究问题与假设】➔ 审稿编辑第一次初稿微调质检
          const hasReachedLitOrHypo = /(?:二、|第二章|第二部分|文献综述|三、|第三章|第三部分|研究问题|研究假设)/i.test(s2.unifiedContent || '');
          if (hasReachedLitOrHypo && !this.state.stage2FirstQualityChecked && plainTextLen >= 120) {
            this.state.stage2FirstQualityChecked = true;
            setTimeout(() => {
              const msg = {
                sender: 'reviewingEditor',
                text: `📝 【审稿编辑·初稿立意微调建议】：关注到团队已初步搭起前置文献与研究假设框架！\n💡 **初稿质检小提示**：文献综述要紧扣研究核心变量的关联性展开述评，研究假设表述建议更加聚焦、具有可验证性，为后续实验/问卷工具设计打好坚实基础！`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                _timeMs: Date.now()
              };
              if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
              this.state.chatLogs.stage2.push(msg);
              this.syncChatLogs();
              if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
              renderChat(this.state);
            }, 1500);
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
              const msg = {
                sender: 'managingEditor',
                text: `💡 【责任编辑·协同修改交流提示】：审稿专家的诊断清单与修改处方已给出一段时间啦！\n👉 建议大家在讨论区交流一下各部分修改的进展与衔接情况，遇到瓶颈互相出谋划策，共同加速完成终稿完善！`,
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

            // ② 后续周期性提醒：第一次提醒发出后，后续每隔 5~8 分钟（动态自适应阈值）做一次跟进提示
            const dynamicPostMeetingSilenceMs = Math.min(Math.max(totalPlannedMs * 0.12, 300000), 480000);
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

            // 🤖 动态调用审稿编辑 API：基于真实正文尾部切片与参考文献进行针对性格式与细节微调审查
            setTimeout(async () => {
              const rawDoc = (s2.unifiedContent || '').replace(/<[^>]*>/g, '').trim();
              const tailSnippet = rawDoc.slice(-800); // 截取尾部 800 字真实参考文献与收尾段落
              const topic = (this.state.stage1 && this.state.stage1.mergedTitle) ? this.state.stage1.mergedTitle : '本组课题';
              const sprintReviewPrompt = `团队课题《${topic}》已进入收尾冲刺阶段，当前正文尾部与参考文献切片如下：\n${tailSnippet}\n请作为审稿编辑对该切片进行具体的学术格式与排版审查，发表 130~150 字的终审微调建议：肯定论证框架完整，针对切片中的参考文献规范（GB/T 7714 格式、作者/年份/刊名完整度）、各级标题序号或表格三线表，指出 1~2 点具体微调自查细节，明确强调不要大改结构、只做细节打磨！`;

              let sprintReviewText = await callCozeAgentAPI('reviewingEditor', sprintReviewPrompt, { stage: 'stage2', topic, actualDoc: tailSnippet });
              if (!sprintReviewText || sprintReviewText.trim().length === 0) {
                sprintReviewText = `📝 【审稿编辑·终审格式与细节微调建议】：通读全文，整体论证框架已非常完整！在最后冲刺阶段，请大家重点微调排版与格式规范：\n① 参考文献是否符合标准 GB/T 7714 格式（含著者、题目、刊名、年份）；\n② 各级标题层级序号是否规范统一；\n③ 表格是否采用标准学术三线表。\n做好细节打磨，准备进入阶段三答辩！`;
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
              const msg = {
                sender: 'neutral',
                text: `🟡 【中间委员·答辩协商提示】：正反两方委员的评审意见已送达左侧矩阵！\n• 建议全组在研讨区就反方提出的质询点展开辩护讨论，商定好共识后，**推选一位组员代表全组**录入裁决矩阵，其余成员同步在正文中落实修改！`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                _timeMs: now
              };
              if (!this.state.chatLogs.stage3) this.state.chatLogs.stage3 = [];
              this.state.chatLogs.stage3.push(msg);
              this.syncChatLogs();
              if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
              renderChat(this.state);
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

      if (unreadList.length > 0) {
        this.showAnnouncementModal(unreadList[0], true);
      }
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
            const reader = new FileReader();
            reader.onload = (ev) => {
              const imgData = ev.target.result;
              const currentUser = this.authManager.getCurrentUser();
              const studentCode = currentUser ? (currentUser.studentCode || 'A') : 'A';
              const currentStage = this.state.currentStage;
              const msgObj = {
                sender: studentCode,
                text: `[IMG_DATA]:${imgData}`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                _timeMs: Date.now()
              };
              if (!this.state.chatLogs[currentStage]) this.state.chatLogs[currentStage] = [];
              this.state.chatLogs[currentStage].push(msgObj);
              this.syncChatLogs();
              renderChat(this.state);
            };
            reader.readAsDataURL(file);
            fileInputImg.value = '';
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

        // ── 流程图节点：阶段一全员投票完成后，检测到组内讨论差不多了，拍卖师提示学生去点击生成公约 ──
        if (currentStage === 'stage1' && !this.state.stage1.contract.isDraftGenerated && !this.state.stage1.contract.isConfirmed) {
          const s1 = this.state.stage1;
          const votesCastCount = Object.values(s1.hasVoted || {}).filter(Boolean).length;
          const totalMembersCount = Object.keys(this.state.members || {}).length || 3;

          if (votesCastCount >= totalMembersCount && !this.state.stage1DraftPromptSent) {
            this.stage1StudentChatCount = (this.stage1StudentChatCount || 0) + 1;
            const isDiscussionSignal = /(?:分工|我负责|负责|时间|写第|公约|章节|选题|主题|草案|生成|差不多|定下来|同意|好的|没问题|对齐)/i.test(text);
            if (this.stage1StudentChatCount >= 2 || isDiscussionSignal) {
              this.state.stage1DraftPromptSent = true;
              setTimeout(() => {
                const promptMsg = {
                  sender: 'auctioneer',
                  text: `🤖 【拍卖师提示】：小组成员已就研究主题、方案内容、写作分工与时间安排展开了充分研讨！\n👉 请点击左侧【🤖 研讨差不多了？一键提炼研讨共识生成公约草案】按钮，AI 将自动提炼生成公约草案。\n🔍 **草案生成后请全组成员认真检查各项分工与时间安排，并按需进行自主修改微调**，确认无误后全员签署生效！`,
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  _timeMs: Date.now()
                };
                this.state.chatLogs.stage1.push(promptMsg);
                this.syncChatLogs();
                if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
                renderChat(this.state);
              }, 1200);
            }
          }
        }

        // ── 智能感知：如果处于【半程会议后等待组内商讨】状态，当学生在研讨区完成交流后触发审稿编辑 ──
        if (currentStage === 'stage2' && this.state.stage2PendingReviewing) {
          this.state.stage2PendingReviewing.studentMsgCount = (this.state.stage2PendingReviewing.studentMsgCount || 0) + 1;
          const isConsensusSignal = /(?:对齐|同意|商量好了|商定好了|修改|明白了|收到|按这个改|@审稿编辑|统一了|没问题)/i.test(text);
          const hasSufficientChat = this.state.stage2PendingReviewing.studentMsgCount >= 2; // 至少进行了 2 轮发言
          if (isConsensusSignal || hasSufficientChat) {
            setTimeout(() => {
              this.triggerReviewingEditorAfterDiscussion();
            }, 1200);
            return;
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
      const isAlreadyVoted = (s1.hasVoted && (s1.hasVoted[user] || (currUserObj && (s1.hasVoted[currUserObj.id] || s1.hasVoted[currUserObj.studentCode]))));
      if (isAlreadyVoted) { alert('⚠️ 投票已被锁定！每位成员首次投票后不能再修改选项。'); return; }
      if (!s1.hasVoted) s1.hasVoted = {};
      if (!s1.votes) s1.votes = {};
      // 单一规范 key 写入，避免 id/studentCode 三键冗余导致的去重与调试混乱
      s1.votes[user] = proposalId;
      s1.hasVoted[user] = true;
      s1._lastVoteTime = Date.now();
      const proposal = (s1.proposals || []).find(p => p.id === proposalId);
      const membersList = Object.values(this.state.members || {});
      const totalMembersCount = membersList.length || 3;
      const votesCastCount = membersList.filter(m => s1.hasVoted[m.id] || s1.hasVoted[m.studentCode]).length;
      const voteMsg = { sender: user, text: `📢 [投票告知]: 我已确认投票支持提案《${proposal ? proposal.title : proposalId}》！（当前全组已集齐 ${votesCastCount}/${totalMembersCount} 票）`, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
      this.state.chatLogs.stage1.push(voteMsg);
      this.syncStage1();
      this.syncChatLogs();
      if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();

      if (votesCastCount >= totalMembersCount) {
        // ── 全员投票完成：调用大模型拍卖师 API 动态生成专业落槌播报与研讨引导 ──
        setTimeout(async () => {
          const tally = {};
          membersList.forEach(m => {
            const pId = s1.votes[m.id] || s1.votes[m.studentCode];
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

          if (!s1.mergedTitle && winningProposal) {
            s1.mergedTitle = winningProposal.title;
          }
          if (!s1.contract.timeAllocations) {
            s1.contract.timeAllocations = { background: 25, literature: 30, questions: 25, method: 40, reflection: 20, references: 10 };
          }

          const isUnanimous = (maxVotes === totalMembersCount);
          const voteContextPrompt = `全组投票已全部完成！计票结果：${proposalSummaryList}。${isUnanimous ? '全员一致投出最高票《' + (winningProposal ? winningProposal.title : '') + '》' : '投票存在分歧，最高票为《' + (winningProposal ? winningProposal.title : '') + '》'}。
  请作为拍卖师发表 130~160 字的落槌定题与选题推进引导：
  ① 宣布竞拍落槌结果，肯定课题《${winningProposal ? winningProposal.title : ''}》的理论与实践价值；
  ② 给出 1~2 点具体的研究深化构思建议，启发组员将选题细化为具体研究方案；
  ③ 引导组长带头在讨论区组织全组围绕该选题展开深度研讨（【核心铁律】：绝不提前包揽提醒分工与时间规划！）。`;

          let summaryText = await callCozeAgentAPI('auctioneer', voteContextPrompt, {
            stage: 'stage1',
            isUnanimous,
            winningTopic: winningProposal ? winningProposal.title : '',
            tallySummary: proposalSummaryList
          });

          if (!summaryText || summaryText.trim().length === 0) {
            summaryText = `🎪 【拍卖师·落槌定题播报】\n全员投票已全部完成！计票结果：${proposalSummaryList}。\n${isUnanimous ? '🎉 全员一致推选《' + winningProposal.title + '》为本组最终研究课题！' : '⚖️ 组内存在不同视角，当前最高票为《' + winningProposal.title + '》！'}\n\n💡 该课题立意新颖且切中教学实践需求！建议组长带头在研讨区发起交流，大家共同头脑风暴细化具体的研究目标与核心切入点！`;
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
      // 🛡️ 铁律：教师端后台监控绝不触发智能体开场白生成；仅允许真实学生进入该阶段时生成
      if (isTeacher || this.state.isTeacherMonitorView || this.state.isTeacherView) {
        return;
      }

      if (!this.state.chatLogs[stage]) this.state.chatLogs[stage] = [];
      const logs = this.state.chatLogs[stage];
      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      // 🎪 阶段一：拍卖师欢迎开场白
      if (stage === 'stage1') {
        const hasAuctioneerIntro = logs.some(m => m.sender === 'auctioneer' && m.text.includes('欢迎来到【阶段一：学术拍卖会】'));
        if (!hasAuctioneerIntro) {
          const welcomeMsg = {
            sender: 'auctioneer',
            text: `🎪 【拍卖师开场】：欢迎来到【阶段一：学术拍卖会】！我是本阶段的选题顾问拍卖师。\n请全组成员点击左侧【提交我的选题】提出各自的研究构想，并在研讨区充分交流。我们将通过拍卖投票遴选最佳提案，并在下方《学术合作公约》中商定分工与时间分配！`,
            timestamp: now,
            _timeMs: Date.now()
          };
          logs.unshift(welcomeMsg);
          this.syncChatLogs();
          renderChat(this.state);
        }
      }

      // 🤝 阶段二：责任编辑欢迎 + 重复上轮分工时间分配 ➔ 审稿编辑提醒推送范文
      else if (stage === 'stage2') {
        const hasManagingIntro = logs.some(m => m.sender === 'managingEditor' && m.text.includes('欢迎来到【阶段二：学术编辑部】'));
        if (!hasManagingIntro) {
          const s1 = this.state.stage1 || {};
          const topic = s1.mergedTitle || '未定课题';
          const tasks = s1.contract && s1.contract.taskAssignments ? s1.contract.taskAssignments : {};
          const times = s1.contract && s1.contract.timeAllocations ? s1.contract.timeAllocations : {};

          let assignSummary = [];
          Object.keys(this.state.members || {}).forEach(mId => {
            const m = this.state.members[mId];
            const t = tasks[mId] || '待认领';
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
            sender: 'managingEditor',
            text: `🤝 【责任编辑开场】：欢迎来到【阶段二：学术编辑部】！我是过程学伴责任编辑。\n全组已锁定研究主题《${topic}》。\n\n📜 【阶段一公约执行与协同提醒】\n• 基础分工: ${assignSummary.join(' | ') || '全员协作'}\n• 规划时间: ${timeSummary.join(' / ') || '按需推进'}\n\n💡 **真正的协同不仅是分工起草，更要主动研读同伴写下的段落，在研讨区互评互修、打通前后逻辑！**请大家进入左侧编辑器开启深度协作！`,
            timestamp: now,
            _timeMs: Date.now()
          };
          logs.unshift(managingWelcome);
          this.syncChatLogs();
          renderChat(this.state);

          setTimeout(() => {
            const reviewingWelcome = {
              sender: 'reviewingEditor',
              text: `📝 【审稿编辑提醒】：为辅助各位高效产出高质量学术论文，已为本组匹配并推送了《课程学术参考范文库》！请大家点击上方【📚 查阅参考范文】查阅学习，注意正文三线表规范与研究设计严谨度！`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              _timeMs: Date.now()
            };
            logs.push(reviewingWelcome);
            this.syncChatLogs();
            renderChat(this.state);
          }, 3200);
        }
      }

      // 🎓 阶段三：严格按时序：① 中间委员开场 ➔ ② 正方肯定 ➔ ③ 反方质询 ➔ ④ 平台写入矩阵 ➔ ⑤ 中间委员抛题引导
      else if (stage === 'stage3') {
        const hasNeutralIntro = logs.some(m => m.sender === 'neutral' && m.text.includes('欢迎来到【阶段三：答辩擂台】'));
        if (!hasNeutralIntro && !this.state.stage3IntroStarted) {
          this.state.stage3IntroStarted = true;
          const neutralWelcome = {
            sender: 'neutral',
            text: `🟡 【中间委员开场】：各位研究者，欢迎来到【阶段三：答辩擂台】！初稿撰写完毕，答辩委员会已就位，接下来将由正方委员与反方委员分别发表评审意见！`,
            timestamp: now,
            _timeMs: Date.now()
          };
          logs.unshift(neutralWelcome);
          this.syncChatLogs();
          renderChat(this.state);

          const topic = (this.state.stage1 && this.state.stage1.mergedTitle) ? this.state.stage1.mergedTitle : '本组研究设计';
          const rawContent = (this.state.stage2 && this.state.stage2.unifiedContent) ? this.state.stage2.unifiedContent.replace(/<[^>]*>/g, '').trim() : '';

          // 2. 依次异步调用【正方】与【反方】
          setTimeout(async () => {
            const propPrompt = `针对小组论文《${topic}》，请通读其真实正文切片：
  ${rawContent.slice(0, 1000)}

  请作为答辩正方委员，发表 130~160 字的评审意见：
  ① 至少提炼 2 个具体优点（既包含学术层面的立意与设计亮点，也包含行文风格与结构规范亮点）；
  ② 明确指出具体段落（如【一、研究背景】或【二、文献综述】）的论证优势，给予具体肯定的学术支持！`;

            let propText = await callCozeAgentAPI('proponent', propPrompt, { stage: 'stage3', topic, actualDoc: rawContent });
            if (!propText || propText.trim().length === 0) {
              propText = `🟢 【正方委员·立论支持】：通读全篇，该研究《${topic}》立意新颖，【研究背景】对核心概念阐述清晰，行文流畅严谨。同时【研究设计】结构完整，理论与实践结合紧密，具备较高的学术探讨价值与实践应用前景，值得充分肯定！`;
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
              const oppPrompt = `针对小组论文《${topic}》，请通读其真实正文切片：
  ${rawContent.slice(0, 1000)}

  【正方委员刚才的肯定意见参考】:
  ${propText}

  请作为答辩反方委员，发表 130~160 字的辩证审视与质询意见：
  【最高原则与正反博弈边界】：正方明确夸赞的具体局部段落与具体事实严禁唱反调；但对于未被明确夸赞的具体内容维度（即使在同一章节，例如正方夸了背景立意新颖，你仍可质询其具体实证数据支撑不足），以及全篇方案的落地可行性、样本控制、量表信效度检验、行文通顺与测量严密性等，提出至少 2 个具体的学术质询点（用 ①② 分条呈现）！`;

              let oppText = await callCozeAgentAPI('opponent', oppPrompt, { stage: 'stage3', topic, actualDoc: rawContent });
              if (!oppText || oppText.trim().length === 0) {
                oppText = `🔴 【反方委员·辩证质询】：构想虽具前瞻性，但立足落地性提出两点质询：① 【四、研究设计】中样本量与平行班对照的具体控制变量未详述，外部推广度存疑；② 核心量表未交代信效度检验流程，行文中的变量测量论据略显单薄，需说明补救方案！`;
              }
              logs.push({
                sender: 'opponent',
                text: oppText,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                _timeMs: Date.now()
              });

              // 平台自动将正反评审意见写入左侧【答辩裁决矩阵】
              if (!this.state.stage3.feedbackItems || this.state.stage3.feedbackItems.length === 0) {
                this.state.stage3.feedbackItems = [
                  { id: 'fb_prop', role: 'proponent', speaker: '正方委员 Agent (肯定支持)', title: '立论支持', content: propText.replace(/^[^\n]*【[^】]+】\s*/, ''), response: '', status: 'adopted' },
                  { id: 'fb_opp_1', role: 'opponent', speaker: '反方委员 Agent (尖锐质询)', title: '质询 1', content: '质询 1：研究设计的落地实施中控制变量与外推效度说明不足，需明确具体控制方案。', response: '', status: 'pending' },
                  { id: 'fb_opp_2', role: 'opponent', speaker: '反方委员 Agent (尖锐质询)', title: '质询 2', content: '质询 2：测量工具与核心变量论据支撑略显单薄，需补充信效度检验与操作化依据。', response: '', status: 'pending' }
                ];
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

  请作为答辩委员会主席（中间委员），发表 130~160 字的主持引导：
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

      // 🛡️ 正文草稿锁存：切换前将富文本当前内容完整持久化存入内存与快照，绝不丢字
      if (this.state.currentStage === 'stage2' && window._jizhi_quill && window._jizhi_quill.root) {
        const liveHtml = window._jizhi_quill.root.innerHTML.replace(/<span class="remote-cursor-widget"[\s\S]*?<\/span>/gi, '');
        if (liveHtml && liveHtml.trim() !== '<p><br></p>') {
          if (!this.state.stage2) this.state.stage2 = {};
          this.state.stage2.unifiedContent = liveHtml;
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
          this.renderMain();
        }
      );

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
        onContractChange: () => {
          this.syncStage1();
        },
        onAiGenerateContract: () => {
          const s1 = this.state.stage1;
          s1.contract.isDraftGenerated = true;
          s1.contract._draftedTime = Date.now();
          if (!s1.contract.taskAssignments) s1.contract.taskAssignments = {};

          // 1. 提炼最高票选题作为融合研究主题
          if (!s1.mergedTitle || s1.mergedTitle.trim().length === 0) {
            const tally = {};
            Object.values(s1.votes || {}).forEach(pId => { if (pId) tally[pId] = (tally[pId] || 0) + 1; });
            let winningP = null;
            let maxV = -1;
            (s1.proposals || []).forEach(p => {
              const cnt = tally[p.id] || 0;
              if (cnt > maxV) { maxV = cnt; winningP = p; }
            });
            s1.mergedTitle = winningP ? winningP.title : ((s1.proposals && s1.proposals[0]) ? s1.proposals[0].title : '基于多智能体协同的学术论文写作与研究设计方案');
          }

          // 2. 提炼 6 大章节的分工安排
          const defaultTasks = [
            '负责“一、研究背景与意义”及“二、文献综述”起草与资料整理',
            '负责“三、研究问题与假设”及“四、研究设计与方法”方案制定',
            '负责“五、不足与反思”撰写及全篇“六、参考文献”引文校对',
            '负责数据分析模型构建与研究工具问卷设计'
          ];
          Object.values(this.state.members || {}).forEach((m, idx) => {
            const taskStr = defaultTasks[idx % defaultTasks.length] || '协作撰写与统稿';
            s1.contract.taskAssignments[m.id] = taskStr;
            if (m.studentCode) s1.contract.taskAssignments[m.studentCode] = taskStr;
          });

          // 3. 提炼各模块时间规划
          s1.contract.timeAllocations = { background: 25, literature: 30, questions: 25, method: 40, reflection: 20, references: 10 };

          // 4. 局部填入输入框，绝不暴力销毁 DOM
          const topicInp = document.getElementById('contract-topic-input');
          if (topicInp) topicInp.value = s1.mergedTitle;

          document.querySelectorAll('.task-assignment-input').forEach(inp => {
            const mId = inp.dataset.mid;
            const code = inp.dataset.code;
            const val = s1.contract.taskAssignments[mId] || s1.contract.taskAssignments[code] || '';
            inp.value = val;
          });
          document.querySelectorAll('.contract-time-input').forEach(inp => {
            const k = inp.dataset.key;
            if (k && s1.contract.timeAllocations[k] !== undefined) {
              inp.value = s1.contract.timeAllocations[k];
            }
          });

          // 5. 拍卖师在聊天区提示学生去检查并微调修改
          const draftNoticeMsg = {
            sender: 'auctioneer',
            text: `✨ 【拍卖师·公约草案已生成】\n已基于大家的研讨共识与投票结果生成《团队协同合作学术合约草案》！\n\n👉 **请各位组员在左侧仔细检查确认各项研究模块的分工与时间预算，可直接在输入框中自主微调修改**；\n✍️ 确认无误后，请每位成员点击【确认签署公约】，全员签署后公约正式生效并解锁阶段二！`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            _timeMs: Date.now()
          };
          if (!this.state.chatLogs.stage1) this.state.chatLogs.stage1 = [];
          this.state.chatLogs.stage1.push(draftNoticeMsg);
          this.syncStage1();
          this.syncChatLogs();
          if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
          renderChat(this.state);
        },
        onConfirmContract: () => {
          if (this.state.stage1.contract.isConfirmed) {
            alert('🔒 学术合作合约已被全员确认签署并锁定！无法二次修改。');
            return;
          }
          const user = this.state.currentUser;
          const s1 = this.state.stage1;
          const totalMembersCount = Object.keys(this.state.members).length;
          if (!s1.contract.confirmedMembers) s1.contract.confirmedMembers = {};
          // 同时写入 studentCode 与 member.id，彻底杜绝 ID 不一致
          s1.contract.confirmedMembers[user] = true;
          if (this.state.members[user]) {
            s1.contract.confirmedMembers[this.state.members[user].id] = true;
          }
          const confirmedCount = Object.values(this.state.members).filter(m => s1.contract.confirmedMembers[m.id] || s1.contract.confirmedMembers[m.studentCode]).length;
          const memberName = this.state.members[user] ? this.state.members[user].name : user;
          const confirmMsg = { sender: user, text: `📢 [合约签署告知]: 我 (${memberName}) 已按键确认签署合作学术合约！（全组确认进度: ${confirmedCount}/${totalMembersCount} 人）`, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
          this.state.chatLogs.stage1.push(confirmMsg);
          this.syncStage1();
          this.syncChatLogs();
          if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
          if (confirmedCount < totalMembersCount) {
            alert(`✅ 您 (${memberName}) 已成功签署学术合作公约！\n\n当前签署进度：${confirmedCount}/${totalMembersCount} 人已签署。\n请提醒组内其他同学尽快签署，全员签署完毕后全组将自动解锁并推进至【阶段二：学术编辑部】！`);
          } else {
            s1.contract.isConfirmed = true;
            this.state.groupMaxStage = 'stage2';
            this.syncStage1();
            this.syncStageChange('stage2');
            if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
            setTimeout(() => {
              const finalMsg = { sender: 'auctioneer', text: `🎪 【拍卖师宣布】：恭喜！组内全员 ${totalMembersCount}/${totalMembersCount} 名成员已全部完成公约签署！学术合作公约正式生效，阶段一圆满结束，系统自动解锁【阶段二：学术编辑部】！`, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
              this.state.chatLogs.stage1.push(finalMsg);
              this.syncChatLogs();
              if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
              alert(`🎉 恭喜！组内全员完成公约签署！学术合作公约生效，系统自动解锁【阶段二：学术编辑部】！`);
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
        onProxyGenerateActionPlan: () => {
          this.onProxyGenerateActionPlan();
        },
        onConfirmStage2Draft: () => {
          if (this.state.stage2.isDraftConfirmed) {
            alert('🔒 正文初稿已被组内确认！已解锁阶段三。');
            return;
          }
          const user = this.state.currentUser || 'A';
          const s2 = this.state.stage2;
          const membersList = Object.values(this.state.members || {});
          const totalMembersCount = membersList.length || 3;
          if (!s2.confirmedMembers) s2.confirmedMembers = {};
          s2.confirmedMembers[user] = true;
          if (this.state.members[user]) {
            s2.confirmedMembers[this.state.members[user].id] = true;
          }
          const confirmedCount = membersList.filter(m => s2.confirmedMembers[m.id] || s2.confirmedMembers[m.studentCode]).length;
          const memberName = this.state.members[user] ? this.state.members[user].name : user;
          const confirmMsg = {
            sender: user,
            text: `📢 [初稿确认告知]: 我 (${memberName}) 已确认完成正文初稿！（全组初稿确认进度: ${confirmedCount}/${totalMembersCount} 人）`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            _timeMs: Date.now()
          };
          if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
          this.state.chatLogs.stage2.push(confirmMsg);
          this.syncStage2();
          this.syncChatLogs();
          if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();

          if (confirmedCount < totalMembersCount) {
            alert(`✅ 您 (${memberName}) 已成功确认正文初稿！\n\n当前组内确认进度：${confirmedCount}/${totalMembersCount} 人已确认。\n请提醒组内其他同学尽快确认，全员确认完毕后全组将自动解锁并推进至【阶段三：答辩擂台】！`);
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
                sender: 'reviewingEditor',
                text: `🎉 【审稿编辑宣布】：恭喜！组内全员 ${totalMembersCount}/${totalMembersCount} 名成员已全部确认正文初稿定稿！阶段二圆满结束，系统自动解锁【阶段三：答辩擂台】！`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                _timeMs: Date.now()
              };
              if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
              this.state.chatLogs.stage2.push(finalMsg);
              this.syncChatLogs();
              if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
              alert(`🎉 恭喜！组内全员完成初稿确认！系统自动解锁【阶段三：答辩擂台】！`);
              this.switchStage('stage3', true);
            }, 600);
          }
          this.renderStudentWorkspace();
        },
        onConfirmStage3Revision: () => {
          const user = this.state.currentUser || 'A';
          const s3 = this.state.stage3;
          const membersList = Object.values(this.state.members || {});
          const totalMembersCount = membersList.length || 3;
          if (!s3.confirmedMembers) s3.confirmedMembers = {};
          s3.confirmedMembers[user] = true;
          if (this.state.members[user]) {
            s3.confirmedMembers[this.state.members[user].id] = true;
          }
          const confirmedCount = membersList.filter(m => s3.confirmedMembers[m.id] || s3.confirmedMembers[m.studentCode]).length;
          const memberName = this.state.members[user] ? this.state.members[user].name : user;
          const confirmMsg = {
            sender: user,
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
              text: `🏆 【中间委员·终稿就绪】：组内全员已确认终稿修改完毕！请组长或代表点击右上方【🚀 提交论文终稿】完成全盘归档！`,
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
        const contentSnippet = (methodIndex > 200) ? rawDoc.slice(0, methodIndex).trim() : rawDoc.slice(0, 1200);

        setTimeout(async () => {
          const firstReviewPrompt = `团队正在撰写课题《${topic}》，目前已写完研究背景、文献综述与研究问题章节，完整切片如下：\n${contentSnippet}\n请作为审稿编辑对该切片进行实质性学术质检，发表 130~160 字的针对性指导：肯定其背景立意与文献归纳亮点，结合切片中写到的具体概念与变量，指出文献综述与研究问题推导中的 1 处具体对应衔接建议（确保后续方法能呼应问题），绝不讲空泛套话，鼓励团队继续推进！`;
          let firstReviewText = await callCozeAgentAPI('reviewingEditor', firstReviewPrompt, { stage: 'stage2', topic, actualDoc: contentSnippet });
          if (!firstReviewText || firstReviewText.trim().length === 0) {
            firstReviewText = `📝 【审稿编辑·初稿进展建议】：通读了大家撰写的背景与文献综述部分，论证框架清晰！针对切片中梳理的文献与提出的研究问题，建议对核心变量的操作化定义再做细微补充，确保文献综述的理论依据能精准支撑后续的研究方法设计，大家在讨论区交流一下，继续稳步推进！`;
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

      // 4. 🎯 终审里程碑雷达：推进到【六、参考文献】时触发终审排版与格式规范提醒
      const hasReferenceSection = /(?:六、|第6章|第六部分|参考文献|References|gb\/t\s*7714)/i.test(newContent);
      if (hasReferenceSection && !this.state.stage2RefFormatReviewed && timeSinceLastReviewing > 60000) {
        this.state.stage2RefFormatReviewed = true;
        const refReviewMsg = {
          sender: 'reviewingEditor',
          text: `📝 【审稿编辑·终审格式与参考文献规范提醒】：关注到团队已推进至【参考文献】收尾部分，全篇已基本成型！在最终冲刺阶段，请大家重点自查排版细节：① 参考文献是否符合标准 GB/T 7714 格式（含著者、题目、刊名、年份、期卷、页码）；② 各级标题序号是否统一；③ 表格是否采用标准学术三线表。做好细节润色，准备迎接阶段三答辩！`,
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
            const leaderName = membersList[0] ? membersList[0].name : '组长';
            const ssrlWarningMsg = {
              sender: 'managingEditor',
              text: `🤝 【责任编辑·协同关怀】：关注到当前正文撰写推进中，各成员的投入占比出现了一定程度的分化。建议组长（${leaderName}）与组员在讨论区适度协调分工，鼓励尚未充分动笔的同学认领后续章节，共同推进高质量学术成稿哦~`,
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
                </div>

                <div style="background:#ffffff; padding:10px 14px; border-radius:8px; border:1px solid #e2e8f0; display:flex; flex-direction:column; gap:6px;">
                  <label style="font-size:12.5px; color:#1e293b; font-weight:700;">3. 全篇衔接与贯通：各章节之间的逻辑连贯性？</label>
                  <select id="meeting-transition-select" class="teacher-input" style="width:100%; padding:6px 10px; font-size:12.5px; border-radius:6px; border:1px solid #cbd5e1; background:#ffffff;">
                    <option value="环环相扣，前后呼应非常自然顺畅">✅ 环环相扣，前后呼应非常自然顺畅</option>
                    <option value="局部章节过渡稍显生硬，需商定衔接句">🔄 局部章节过渡稍显生硬，需商定衔接句</option>
                    <option value="各章节相对独立，需进一步统一主线">⚠️ 各章节相对独立，需进一步统一核心主线</option>
                  </select>
                </div>

                <!-- 第4题：条件展开章节勾选框（仅在选了不同看法/商榷/生硬时展开） -->
                <div id="meeting-divergence-sections-box" style="background:#fffbeb; padding:10px 14px; border-radius:8px; border:1px solid #fef3c7; display:none; flex-direction:column; gap:6px;">
                  <label style="font-size:12.5px; color:#92400e; font-weight:700;">4. 重点关注定位：组内哪些具体章节需要重点商讨或打通衔接？</label>
                  <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:4px;">
                    <label style="font-size:12px; color:#451a03; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="div-sec" value="一、研究背景与意义"> 【一、研究背景与意义】</label>
                    <label style="font-size:12px; color:#451a03; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="div-sec" value="二、文献综述与前沿"> 【二、文献综述与前沿】</label>
                    <label style="font-size:12px; color:#451a03; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="div-sec" value="三、研究问题与假设"> 【三、研究问题与假设】</label>
                    <label style="font-size:12px; color:#451a03; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="div-sec" value="四、研究设计与方法"> 【四、研究设计与方法】</label>
                    <label style="font-size:12px; color:#451a03; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="div-sec" value="五、不足与反思"> 【五、不足与反思】</label>
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

      // ── 条件动态显隐监听器（只有在选了不同看法/商榷/生硬时平滑展开第4题） ──
      const peerSelect = modal.querySelector('#meeting-peer-review-select');
      const transitionSelect = modal.querySelector('#meeting-transition-select');
      const themeSelect = modal.querySelector('#meeting-theme-consistency-select');
      const divSecBox = modal.querySelector('#meeting-divergence-sections-box');

      const checkShowSections = () => {
        const pVal = peerSelect ? peerSelect.value : '';
        const tVal = transitionSelect ? transitionSelect.value : '';
        const mVal = themeSelect ? themeSelect.value : '';
        const needShow = pVal.includes('不同看法') || pVal.includes('商榷') || tVal.includes('生硬') || tVal.includes('独立') || mVal.includes('不够充分');
        if (divSecBox) {
          divSecBox.style.display = needShow ? 'flex' : 'none';
          if (!needShow) {
            divSecBox.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
          }
        }
      };

      if (peerSelect) peerSelect.addEventListener('change', checkShowSections);
      if (transitionSelect) transitionSelect.addEventListener('change', checkShowSections);
      if (themeSelect) themeSelect.addEventListener('change', checkShowSections);

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
        const checkedSections = Array.from(modal.querySelectorAll('input[name="div-sec"]:checked')).map(cb => cb.value);
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

        // ── 全员打卡完毕：汇聚全组数据生成【半程编辑修正清单】 ──
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

        this.state.stage2.actionPlan = {
          isGenerated: true,
          items: [
            `【学术构想与论证修正】(重点关注: ${sectionsFocusText}): 针对核心学术瓶颈【${primaryAcademicB}】与组内提问(${questionsList})，在对应章节中补齐操作化测量量表与理论依据。`,
            `【团队协同与分工平衡】: 针对协作难点【${primaryCollabB}】，统一各章节论述用词风格与逻辑过渡，落实 Equal Participation 均等参与。`,
            `【时间节奏与反思深化】: 针对进度难点【${primaryRhythmB}】，把控后半程节奏，优先完成五、研究设计的不足与反思。`
          ]
        };
        this.syncStage2();
        if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
        this.renderStudentWorkspace();

        alert(`🎉 恭喜！组内 ${totalMembersCount} 位成员已全部完成半程自查与互阅打卡！【审稿编辑·半程修正清单】已正式解锁并生成！`);

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

  请作为学术编辑部责任编辑（协同主持人与学伴）发表一段充实、真诚、富有启发性的发言（字数控制在 180~230 字，严禁简略敷衍）：
  ${hasDivergence 
  ? `【分歧引导主线】：
  1. 肯定全组认真通读了彼此撰写的段落；明确说明：通读对比后发现目前初稿中写出的部分内容，与组内部分同学在自查中提出的思路构想存在认知差异与不同看法；
  2. 逐一分条列出所涉及的章节（若有多个用 📌 ① 📌 ② 客观列出 ${sectionsFocusText} 各自想商榷的思路焦点）；
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

      const contentSnippet = (this.state.stage2 && this.state.stage2.unifiedContent) ? this.state.stage2.unifiedContent.replace(/<[^>]*>/g, '').slice(0, 1000) : '论文初稿方案';
      const reviewingPrompt = `小组已针对责任编辑提出的自查分歧在讨论区达成了对齐共识。
  【课题】: 《${ctx.topic}》
  【自查勾选难点】: “${ctx.bAcademic}”
  【手填开放提问/困惑】: “${ctx.userText || '无手填提问'}”
  【当前真实正文切片】:
  ${contentSnippet}

  请作为国家级核心教育期刊资深审稿编辑，发表 130~160 字的学术内容审查（严格基于上述具体内容展开）：
  ① 具体难点破解与开放答疑：针对勾选的难点『${ctx.bAcademic}』及手填提问，给出切中该学科具体场景的破解思路；
  ② 正文切片具体学术质检：通读正文切片，肯定已有框架亮点，精准指出 1 处实际存在的具体章节、具体变量/案例论据薄弱点；
  ③ 具体修改处方与清单落地：给出具体操作建议（如三线表指标/测量来源），引导全组对照左侧【半程修正清单】分工加速完善！（严禁空泛套话，语气专业严谨）。`;

      let reviewingText = await callCozeAgentAPI('reviewingEditor', reviewingPrompt, { stage: 'stage2', topic: ctx.topic, bottleneck: ctx.bAcademic, actualDoc: contentSnippet });
      if (!reviewingText || reviewingText.trim().length === 0) {
        reviewingText = `⚠️ 【审稿编辑提示】：大模型学术质检生成超时或网络稍有延迟，请在讨论区发送“@审稿编辑 请对当前论文正文进行学术质检”重新获取真实质检报告。`;
      }

      const reviewingMsg = {
        sender: 'reviewingEditor',
        text: reviewingText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        _timeMs: Date.now(),
        stage: 'stage2'
      };
      if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
      this.state.chatLogs.stage2.push(reviewingMsg);
      this.state.stage2ReviewingFinishedTime = Date.now();
      this.syncStage2();
      this.syncChatLogs();
      if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
      renderChat(this.state);
    }

    async onProxyGenerateActionPlan() {
      if (this.state.stage2.actionPlan && this.state.stage2.actionPlan.isGenerated) return;
      const user = this.state.currentUser || 'A';
      const currUser = this.authManager.getCurrentUser();
      const isLeader = (user === 'A' || currUser?.role === 'leader' || currUser?.roleTitle?.includes('组长'));
      if (!isLeader) {
        alert('⚠️ 仅组长有权限代表全组一键生成行动清单。');
        return;
      }

      const membersList = Object.values(this.state.members || {});
      const totalCount = membersList.length || 3;
      if (!this.state.stage2.meetingSubmissions) this.state.stage2.meetingSubmissions = {};
      const submissions = this.state.stage2.meetingSubmissions;
      const submittedCount = Object.keys(submissions).length;

      const absentMembers = membersList.filter(m => !submissions[m.id] && !submissions[m.studentCode]);
      const absentNames = absentMembers.map(m => m.name).join('、') || '部分缺勤组员';

      const confirmed = confirm(
        `⚡ 【组长一键代推进】确认：\n\n` +
        `目前在场已打卡人数：${submittedCount}/${totalCount} 人。\n` +
        `未打卡成员（${absentNames}）将被系统记录为缺勤并豁免。\n\n` +
        `是否代表全组立即生成【半程编辑修正清单】并推送提醒给教师端？`
      );
      if (!confirmed) return;

      // 为未打卡的缺勤成员填充默认自查占位
      absentMembers.forEach(m => {
        submissions[m.studentCode] = {
          user: m.studentCode,
          name: m.name,
          themeConsistency: '符合核心假设 (组长代填)',
          peerReviewState: '基本认同 (组长代填)',
          transitionState: '基本连贯 (组长代填)',
          checkedSections: [],
          bAcademic: '理论框架深化',
          bCollab: '章节逻辑衔接',
          bRhythm: '后半程时间掌控',
          userText: '（组长代推进）',
          submittedAt: Date.now(),
          isProxy: true
        };
      });

      this.state.stage2.isProxyMeetingActionPlan = true;

      // 生成修正清单
      const topic = (this.state.stage1 && this.state.stage1.mergedTitle) ? this.state.stage1.mergedTitle : '本组课题';
      const allSubs = Object.values(submissions);
      const hasDivergence = allSubs.some(s => (s.themeConsistency || '').includes('偏离') || (s.peerReviewState || '').includes('不同看法') || ((s.checkedSections || []).length > 0));
      const allCheckedSecs = Array.from(new Set(allSubs.flatMap(s => s.checkedSections || [])));
      const sectionsFocusText = allCheckedSecs.length > 0 ? allCheckedSecs.map(sec => `【${sec}】`).join(' 与 ') : '【一、研究背景】与【四、研究设计】';
      const primaryAcademicB = allSubs[0]?.bAcademic || '理论框架与测量量表';
      const primaryCollabB = allSubs[0]?.bCollab || '章节论述过渡衔接';
      const primaryRhythmB = allSubs[0]?.bRhythm || '后半程推进把控';

      this.state.stage2.actionPlan = {
        isGenerated: true,
        items: [
          `【学术构想与论证修正】(重点关注: ${sectionsFocusText}): 针对核心学术瓶颈【${primaryAcademicB}】，在对应章节中补齐操作化测量量表与理论依据。`,
          `【团队协同与分工平衡】: 针对协作难点【${primaryCollabB}】，统一各章节论述用词风格与逻辑过渡，落实 Equal Participation 均等参与。`,
          `【时间节奏与反思深化】: 针对进度难点【${primaryRhythmB}】，把控后半程节奏，优先完成五、研究设计的不足与反思。`
        ]
      };

      // 记录教师端告警
      const activeClass = this.authManager.getClasses().find(c => c.id === this.state.activeClassId) || { name: '当前班级' };
      const task = this.authManager.getTasks().find(t => t.id === this.state.activeTaskId) || { title: '写作任务' };
      const groupName = this.state.activeMonitorGroupId || '第 1 协作小组';
      const leaderName = currUser?.name || '组长';
      const alertObj = {
        id: 'alert_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        type: 'proxy_meeting',
        stage: 'stage2',
        classId: this.state.activeClassId,
        className: activeClass.name,
        taskId: this.state.activeTaskId,
        taskTitle: task.title,
        groupId: this.state.activeMonitorGroupId,
        groupName: groupName,
        leaderName: leaderName,
        confirmedCount: submittedCount,
        totalCount: totalCount,
        absentMembers: absentMembers.map(m => m.name),
        title: '⚠️ 【阶段二：半程编辑会议】组长一键代推进提醒',
        text: `【${activeClass.name}】· 任务《${task.title}》\n【${groupName}】组长【${leaderName}】已代表全组一键生成【半程修正清单】（在场打卡: ${submittedCount}/${totalCount} 人，已豁免未到场缺勤组员 ${absentNames}）。`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        date: new Date().toLocaleDateString(),
        read: false
      };
      this.authManager.recordTeacherAlert(alertObj);

      // 责任编辑提示消息
      const managingMsg = {
        sender: 'managingEditor',
        text: `🤝 【责任编辑·半程修正清单已生成】：组长【${leaderName}】已代表全组完成半程自查与修正清单生成！请全组重点关注 ${sectionsFocusText}，对照左侧【半程修正清单】分工推进，审稿专家马上为大家进行正文深度学术质检！`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        _timeMs: Date.now(),
        stage: 'stage2'
      };
      if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
      this.state.chatLogs.stage2.push(managingMsg);

      this.state.stage2PendingReviewing = {
        topic,
        bAcademic: primaryAcademicB,
        userText: '组长代推进',
        triggeredTime: Date.now()
      };

      this.syncStage2();
      this.syncChatLogs();
      if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
      renderChat(this.state);
      this.renderStudentWorkspace();
    }

    // handleLogout() 已在 L1648 定义（含 presence 清理与云端推送），此处不再重复
  }

  // Global Launch (Native ESM Support)
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', () => {
      window.app = new App();
    });
  } else {
    window.app = new App();
  }

})();
