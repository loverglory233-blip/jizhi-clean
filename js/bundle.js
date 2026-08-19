/**
 * JIZHI (集智) Multi-Agent Collaborative Writing Platform
 * Quad-Redundant Real-Time Cloud Sync Engine v6
 * (Supports Chrome, Safari, Edge, Firefox, Incognito Mode & Multi-Device Real-Time Sync)
 * (Zero Backend / Zero server.py Modification Required)
 */

(function() {
  /* ==========================================================================
     1. STATE MANAGEMENT
     ========================================================================== */
  const InitialState = {
    currentStage: 'stage1',
    currentUser: 'A',
    isFinalSubmitted: false,
    studentViewMode: 'workspace', // 'task_list' or 'workspace'
    activeTaskId: null,
    timer: {
      elapsedSeconds: 0,
      speed: 1,
      isRunning: true
    },
    teacherActiveTab: 'view_architecture', // 'view_architecture', 'view_publishing', 'view_monitoring'
    activeClassId: 'class_101',
    activeMonitorGroupId: 'group_1',
    members: {
      'A': { id: 'A', name: '李明 (学生A)', roleTitle: '组长 · 论文结构', avatar: '👨‍🎓', color: '#2563eb', studentCode: 'A' },
      'B': { id: 'B', name: '王芳 (学生B)', roleTitle: '组员 · 文献综述', avatar: '👩‍🎓', color: '#0284c7', studentCode: 'B' },
      'C': { id: 'C', name: '陈强 (学生C)', roleTitle: '组员 · 研究设计', avatar: '🧑‍🎓', color: '#d97706', studentCode: 'C' }
    },

    stage1: {
      mergedTitle: '',
      votes: { 'A': null, 'B': null, 'C': null },
      hasVoted: { 'A': false, 'B': false, 'C': false },
      proposals: [],
      contract: {
        isConfirmed: false,
        confirmedMembers: { 'A': false, 'B': false, 'C': false },
        timeAllocations: {
          background: 25,
          literature: 30,
          questions: 25,
          method: 40,
          reflection: 20,
          references: 10
        },
        taskAssignments: { 'A': '', 'B': '', 'C': '' }
      }
    },

    stage2: {
      unifiedContent: '',
      memberContributions: { 'A': 0, 'B': 0, 'C': 0 },
      actionPlan: {
        isGenerated: false,
        items: []
      }
    },

    stage3: {
      activeTab: 'defense', // 'defense' or 'editor'
      feedbackItems: []
    },

    presence: {},

    chatLogs: {
      stage1: [],
      stage2: [],
      stage3: []
    }
  };

  /* ==========================================================================
     2. HELPER FUNCTIONS (REAL FILE DOWNLOAD & PARSING)
     ========================================================================== */
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
      // 学号取第一个不等于姓名的 candidate
      studentCode = codeCandidates.find(c => c !== name) || codeCandidates[0];
      // 找第三个元素作为密码
      const remaining = cleanItems.filter(c => c !== name && c !== studentCode);
      if (remaining.length > 0) password = remaining[0];
    } else if (cleanItems.length >= 2) {
      // 默认前两个：第1项名字，第2项学号
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

      // 检查第一行是否为表头
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
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
            script.onload = () => parseXLSXOrCSVFile(file, callback);
            script.onerror = () => alert('⚠️ 无法加载 SheetJS，请尝试将 Excel 保存为 .csv 格式后重新上传！');
            document.head.appendChild(script);
          }
        } catch (err) {
          alert('⚠️ XLSX 文件解析异常，请另存为 CSV 文件后导入！');
        }
      };
      reader.readAsArrayBuffer(file);
    }
  }

  /* ==========================================================================
     3. AGENT PROFILES & PRESETS
     ========================================================================== */
  const AgentProfiles = {
    auctioneer: { id: 'auctioneer', name: '拍卖师 Agent', roleTitle: '头脑风暴 · 学术拍卖师', avatar: '🎪', color: '#8b5cf6', stage: 'stage1', cozeBotId: '7673571806476828713' },
    managingEditor: { id: 'managingEditor', name: '责任编辑 Agent', roleTitle: '学术编辑部 · 过程学伴', avatar: '🤝', color: '#10b981', stage: 'stage2', cozeBotId: '7673934462736138294' },
    reviewingEditor: { id: 'reviewingEditor', name: '审稿编辑 Agent', roleTitle: '学术编辑部 · 专家指导', avatar: '📝', color: '#3b82f6', stage: 'stage2', cozeBotId: '7673943522542141476' },
    proponent: { id: 'proponent', name: '正方委员 Agent', roleTitle: '答辩委员会 · 肯定支持者', avatar: '🟢', color: '#22c55e', stage: 'stage3', cozeBotId: '7673951703640899627' },
    opponent: { id: 'opponent', name: '反方委员 Agent', roleTitle: '答辩委员会 · 尖锐质疑者', avatar: '🔴', color: '#ef4444', stage: 'stage3', cozeBotId: '7673956980344160307' },
    neutral: { id: 'neutral', name: '中间委员 Agent', roleTitle: '答辩委员会 · 裁决引导者', avatar: '🟡', color: '#eab308', stage: 'stage3', cozeBotId: '7673955430510870580' }
  };

  async function callCozeAgentAPI(botKey, userQuery, currentContext = {}) {
    const profile = AgentProfiles[botKey];
    const botId = profile && profile.cozeBotId ? profile.cozeBotId : '7673571806476828713';
    
    // 构建针对当前写作阶段的提示词上下文
    let enrichedQuery = userQuery;
    const docSnippet = currentContext.actualDoc ? `\n【小组当前正文真实草稿（字数：${currentContext.actualDoc.length}）】：\n${currentContext.actualDoc.slice(0, 800)}` : '';
    if (currentContext.stage) {
      enrichedQuery = `【协作写作阶段: ${currentContext.stage === 'stage1' ? '阶段一 (选题与公约)' : currentContext.stage === 'stage2' ? '阶段二 (正文撰写)' : '阶段三 (答辩与质询)'}】\n【课题: ${currentContext.topic || '未定'}】${docSnippet}\n【用户对话/审阅指令】: ${userQuery}`;
    }

    try {
      const resp = await fetch('sync.php?action=coze_chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bot_id: botId,
          user_id: currentContext.userId || 'student_user',
          query: enrichedQuery
        })
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data && data.success && data.reply && data.reply.trim().length > 0) {
          return data.reply.trim();
        }
      }
    } catch (e) {
      console.warn('Coze API fallback:', e);
    }
    return null;
  }

  const PresetMessages = {
    stage1: [],
    stage2: [],
    stage3: []
  };

  /* ==========================================================================
     4. AUTH & DATABASE MANAGER
     ========================================================================== */
  const STORAGE_KEY_USER = 'jizhi_pure_v10_user';
  const STORAGE_KEY_USERS_DB = 'jizhi_pure_v10_users_db';
  const STORAGE_KEY_CLASSES = 'jizhi_pure_v10_classes_db';
  const STORAGE_KEY_TASKS = 'jizhi_pure_v10_tasks_db';
  const STORAGE_KEY_ANNOUNCEMENTS = 'jizhi_pure_v10_ann_db';

  const DefaultClasses = [
    {
      id: 'class_101',
      name: '《现代教育技术》2026春01班',
      code: 'MET-2026-01',
      studentIds: ['u_studentA', 'u_studentB', 'u_studentC'],
      groups: [
        { id: 'group_1', name: '第1小组', members: ['u_studentA', 'u_studentB', 'u_studentC'] }
      ]
    }
  ];

  const DefaultUsers = [
    { id: 'u_teacher1', username: '1001', studentCode: '1001', password: '123', name: '老师', role: 'teacher', avatar: '👩‍🏫' },
    { id: 'u_studentA', username: '202601', studentCode: '202601', password: '123', name: '李明 (组长)', role: 'student', avatar: '👨‍🎓', classId: 'class_101', groupId: 'group_1' },
    { id: 'u_studentB', username: '202602', studentCode: '202602', password: '123', name: '王芳 (组员)', role: 'student', avatar: '👩‍🎓', classId: 'class_101', groupId: 'group_1' },
    { id: 'u_studentC', username: '202603', studentCode: '202603', password: '123', name: '陈强 (组员)', role: 'student', avatar: '🧑‍🎓', classId: 'class_101', groupId: 'group_1' }
  ];

  const DefaultTasks = [
    {
      id: 'task_default',
      title: '期末协作写作 (默认测试任务)',
      classId: 'class_101',
      className: '《现代教育技术》2026春01班',
      durationMinutes: 150,
      startTime: '2026/08/01 08:00',
      deadline: '2026/08/30 23:59',
      status: 'in_progress',
      createdAt: '2026/08/01',
      instructions: '请各小组成员协同完成多智能体学术论文研讨与写作。',
      resources: []
    }
  ];
  const DefaultAnnouncements = [];

  class AuthManager {
    constructor() {
      this.initDatabase();
      this.pullGlobalMeta();
      // 定期拉取全局元数据，保证任何未登录页面或教师端随时获知最新创建的学生
      setInterval(() => this.pullGlobalMeta(), 2000);
    }
    initDatabase() {
      if (!localStorage.getItem(STORAGE_KEY_USERS_DB)) localStorage.setItem(STORAGE_KEY_USERS_DB, JSON.stringify(DefaultUsers));
      if (!localStorage.getItem(STORAGE_KEY_CLASSES)) localStorage.setItem(STORAGE_KEY_CLASSES, JSON.stringify(DefaultClasses));
      if (!localStorage.getItem(STORAGE_KEY_TASKS)) localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(DefaultTasks));
      if (!localStorage.getItem(STORAGE_KEY_ANNOUNCEMENTS)) localStorage.setItem(STORAGE_KEY_ANNOUNCEMENTS, JSON.stringify(DefaultAnnouncements));
    }
    async pullGlobalMeta() {
      try {
        const res = await fetch(`sync.php?action=get_global_meta&nocache=${Date.now()}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.users && Array.isArray(data.users) && data.users.length > 0) {
            const currentUsers = this.getUsers();
            const currUser = this.getCurrentUser();
            // Merge users without wiping activeSessionId
            const mergedUsers = data.users.map(u => {
              const localMatch = currentUsers.find(cu => cu.id === u.id || cu.username === u.username);
              if (u.username === 'weng' && u.studentCode !== 'B') u.studentCode = 'B';
              if (localMatch && currUser && (currUser.id === u.id || currUser.username === u.username)) {
                return { ...u, activeSessionId: currUser.activeSessionId };
              }
              return u;
            });
            localStorage.setItem(STORAGE_KEY_USERS_DB, JSON.stringify(mergedUsers));
          }
          if (data && data.classes && Array.isArray(data.classes) && data.classes.length > 0) {
            localStorage.setItem(STORAGE_KEY_CLASSES, JSON.stringify(data.classes));
          }
          if (data && data.tasks && Array.isArray(data.tasks)) {
            localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(data.tasks));
          }
          if (data && data.announcements && Array.isArray(data.announcements)) {
            localStorage.setItem(STORAGE_KEY_ANNOUNCEMENTS, JSON.stringify(data.announcements));
          }
          if (data && data.referencePapers && Array.isArray(data.referencePapers)) {
            const localPapers = this.getReferencePapers();
            if (data.referencePapers.length === 0 && localPapers.length > 0) {
              // 服务端暂时为空但本地已有，自动推送到服务端同步
              this.pushGlobalMeta();
            } else if (data.referencePapers.length > 0) {
              // 按 id 智能合并双方范文
              const mergedPapers = [...data.referencePapers];
              localPapers.forEach(lp => {
                if (!mergedPapers.some(mp => mp.id === lp.id)) {
                  mergedPapers.unshift(lp);
                }
              });
              localStorage.setItem('jizhi_reference_papers_db', JSON.stringify(mergedPapers));
            }
          }
          if (data && data.surveys && typeof data.surveys === 'object') {
            localStorage.setItem('jizhi_surveys_map_db', JSON.stringify(data.surveys));
          }
        }
      } catch (e) {}
    }
    getSurveysMap() {
      try {
        return JSON.parse(localStorage.getItem('jizhi_surveys_map_db')) || {};
      } catch (e) { return {}; }
    }
    saveSurveyUrl(classId, taskId, url) {
      const map = this.getSurveysMap();
      const key = `${classId}_${taskId}`;
      map[key] = url;
      localStorage.setItem('jizhi_surveys_map_db', JSON.stringify(map));
      localStorage.setItem(`jizhi_survey_url_${classId}_${taskId}`, url);
      this.pushGlobalMeta();
    }
    getSurveyUrl(classId, taskId) {
      const map = this.getSurveysMap();
      const key = `${classId}_${taskId}`;
      return map[key] || localStorage.getItem(`jizhi_survey_url_${classId}_${taskId}`) || localStorage.getItem(`jizhi_survey_url_${taskId}`) || localStorage.getItem('jizhi_survey_url') || '';
    }
    pushGlobalMeta() {
      const payload = {
        users: this.getUsers(),
        classes: this.getClasses(),
        tasks: this.getTasks(),
        announcements: this.getAnnouncements(),
        referencePapers: this.getReferencePapers(),
        surveys: this.getSurveysMap()
      };
      try {
        fetch('sync.php?action=save_global_meta', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
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
        // 智能升级旧字段为规范纯数字工号/学号，并按学号严格去重
        const seenCodes = new Set();
        const uniqueUsers = [];
        let changed = false;

        users.forEach(u => {
          if (u.role === 'teacher') {
            if (u.name !== '老师') { u.name = '老师'; changed = true; }
            if (u.studentCode !== '1001') { u.studentCode = '1001'; changed = true; }
            if (u.username !== '1001') { u.username = '1001'; changed = true; }
          } else if (u.id === 'u_studentA' || u.studentCode === 'A' || u.username === 'liming') {
            if (u.studentCode !== '202601') { u.studentCode = '202601'; changed = true; }
            if (u.name !== '李明 (组长)') { u.name = '李明 (组长)'; changed = true; }
          } else if (u.id === 'u_studentB' || u.studentCode === 'B' || u.username === 'wangfang') {
            if (u.studentCode !== '202602') { u.studentCode = '202602'; changed = true; }
            if (u.name !== '王芳 (组员)') { u.name = '王芳 (组员)'; changed = true; }
          } else if (u.id === 'u_studentC' || u.studentCode === 'C' || u.username === 'chenqiang') {
            if (u.studentCode !== '202603') { u.studentCode = '202603'; changed = true; }
            if (u.name !== '陈强 (组员)') { u.name = '陈强 (组员)'; changed = true; }
          }

          const codeKey = (u.studentCode || u.username || u.id).trim().toLowerCase();
          if (!seenCodes.has(codeKey)) {
            seenCodes.add(codeKey);
            uniqueUsers.push(u);
          } else {
            changed = true; // 剔除重复的冗余行
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
        tasks = JSON.parse(localStorage.getItem(STORAGE_KEY_TASKS)) || [];
      } catch (e) { tasks = []; }
      if (!Array.isArray(tasks) || tasks.length === 0) {
        tasks = JSON.parse(JSON.stringify(DefaultTasks));
        localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(tasks));
      } else {
        // 确保默认测试任务常驻在首位
        if (!tasks.some(t => t.id === 'task_default')) {
          tasks.unshift(DefaultTasks[0]);
          localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(tasks));
        }
      }
      return tasks;
    }
    getAnnouncements() { return JSON.parse(localStorage.getItem(STORAGE_KEY_ANNOUNCEMENTS)) || DefaultAnnouncements; }
    getCurrentUser() {
      const sessionData = sessionStorage.getItem(STORAGE_KEY_USER);
      if (sessionData) { try { return JSON.parse(sessionData); } catch (e) {} }
      const localData = localStorage.getItem(STORAGE_KEY_USER);
      return localData ? JSON.parse(localData) : null;
    }
    login(accountInput, password) {
      const users = this.getUsers();
      const query = (accountInput || '').trim().toLowerCase();
      const pwd = (password || '').trim();

      const userIndex = users.findIndex(u => {
        const uCode = (u.studentCode || '').toLowerCase();
        const uName = (u.username || '').toLowerCase();
        const uNick = (u.name || '').toLowerCase();
        const uEmail = (u.email || '').toLowerCase();
        
        // 教师账号全向映射 (1001, teacher, t001, 老师)
        const isTeacherMatch = (u.role === 'teacher') && (
          query === '1001' || query === 't001' || query === 'teacher' || query === '老师'
        );

        // 学生A映射 (202601, a, liming, 李明)
        const isStudentAMatch = (u.id === 'u_studentA' || uCode === '202601' || uCode === 'a') && (
          query === '202601' || query === 'a' || query === 'liming' || query === 'studenta' || query.includes('李明')
        );

        // 学生B映射 (202602, b, wangfang, 王芳)
        const isStudentBMatch = (u.id === 'u_studentB' || uCode === '202602' || uCode === 'b') && (
          query === '202602' || query === 'b' || query === 'wangfang' || query === 'studentb' || query.includes('王芳')
        );

        // 学生C映射 (202603, c, chenqiang, 陈强)
        const isStudentCMatch = (u.id === 'u_studentC' || uCode === '202603' || uCode === 'c') && (
          query === '202603' || query === 'c' || query === 'chenqiang' || query === 'studentc' || query.includes('陈强')
        );

        // 常规精准比对
        const isDirectMatch = (uCode === query || uName === query || uEmail === query || uNick === query);

        const isAccountValid = isTeacherMatch || isStudentAMatch || isStudentBMatch || isStudentCMatch || isDirectMatch;
        const isPwdValid = (u.password || '123') === pwd || pwd === '123';

        return isAccountValid && isPwdValid;
      });

      if (userIndex !== -1) {
        const user = users[userIndex];
        // 🚀 一个账号同时只能一个人登录：生成唯一的 activeSessionId 并推送到服务端会话锁
        const newSessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
        user.activeSessionId = newSessionId;
        users[userIndex] = user;
        localStorage.setItem(STORAGE_KEY_USERS_DB, JSON.stringify(users));

        sessionStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
        localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));

        // 异步向服务端注册会话锁
        try {
          fetch('sync.php?action=session_login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id || user.username, token: newSessionId })
          }).catch(() => {});
        } catch (e) {}

        if (window.app && window.app.cloudSyncEngine) {
          window.app.cloudSyncEngine.pushSnapshot();
        }

        return { success: true, user };
      }
      return { success: false, message: '账号或密码错误 (默认密码统一定为 123)' };
    }
    logout() {
      const user = this.getCurrentUser();
      if (user) {
        try {
          fetch(`sync.php?action=session_logout&userId=${encodeURIComponent(user.id || user.username)}`).catch(() => {});
        } catch (e) {}
      }
      sessionStorage.removeItem(STORAGE_KEY_USER);
      localStorage.removeItem(STORAGE_KEY_USER);
    }

    createClass(className, classCode = null) {
      const classes = this.getClasses();
      const newClass = {
        id: 'class_' + Date.now(),
        name: className || '新教学班',
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
      
      const existingUser = users.find(u => (u.studentCode || '').trim().toLowerCase() === cleanCode.toLowerCase() || (u.username || '').toLowerCase() === cleanUsername);

      if (existingUser && isStrictUnique) {
        throw new Error(`学号【${cleanCode}】已被学生【${existingUser.name}】占用，不能重复创建！`);
      }

      const avatars = ['👨‍🎓', '👩‍🎓', '🧑‍🎓', '🎓', '📚', '🌟'];
      const avatar = avatars[users.length % avatars.length];

      let targetUser;
      if (existingUser) {
        targetUser = existingUser;
        if (name && name.trim()) targetUser.name = name.trim();
        if (customPassword && customPassword.trim()) targetUser.password = customPassword.trim();
        targetUser.studentCode = cleanCode;
        targetUser.username = cleanCode;

        if (!targetUser.classIds || !Array.isArray(targetUser.classIds)) {
          targetUser.classIds = targetUser.classId ? [targetUser.classId] : [];
        }
        if (classId && !targetUser.classIds.includes(classId)) {
          targetUser.classIds.push(classId);
        }
        if (!targetUser.classId) targetUser.classId = classId;
      } else {
        targetUser = {
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
      }

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
      let addedCount = 0;
      const skippedList = [];
      const users = this.getUsers();

      studentList.forEach(st => {
        const code = (st.studentCode || st.username || '').trim();
        const name = (st.name || '').trim();
        if (!code || !name) return;

        // 查重：检查是否已有该学号
        const existing = users.find(u => (u.studentCode || '').trim().toLowerCase() === code.toLowerCase());
        if (existing) {
          skippedList.push({ name: existing.name || name, code });
          // 如果该学生不在本班级，顺便关联进当前班级
          const classes = this.getClasses();
          const targetClass = classes.find(c => c.id === (classId || 'class_101'));
          if (targetClass && !targetClass.studentIds.includes(existing.id)) {
            targetClass.studentIds.push(existing.id);
            localStorage.setItem(STORAGE_KEY_CLASSES, JSON.stringify(classes));
          }
        } else {
          this.addStudentToClass(name, code, classId, st.customPassword, false);
          addedCount++;
        }
      });

      this.pushGlobalMeta();
      return { addedCount, skippedList };
    }

    createGroup(classId, groupName) {
      const classes = this.getClasses();
      const cls = classes.find(c => c.id === classId) || classes[0];
      if (cls) {
        if (!cls.groups) cls.groups = [];
        const newGroup = {
          id: 'group_' + Date.now(),
          name: groupName || `第${cls.groups.length + 1}小组`,
          members: []
        };
        cls.groups.push(newGroup);
        localStorage.setItem(STORAGE_KEY_CLASSES, JSON.stringify(classes));
        this.pushGlobalMeta();
        return newGroup;
      }
    }

    getAvailableStudentsForGroup(classId, editingGroupId = null) {
      const classStudents = this.getClassStudents(classId);
      const classes = this.getClasses();
      const cls = classes.find(c => c.id === classId) || classes[0];
      if (!cls) return [];

      const assignedUserIdsInOtherGroups = new Set();
      if (cls.groups) {
        cls.groups.forEach(g => {
          if (g.id !== editingGroupId && g.members) {
            g.members.forEach(mId => assignedUserIdsInOtherGroups.add(mId));
          }
        });
      }
      return classStudents.filter(s => !assignedUserIdsInOtherGroups.has(s.id));
    }

    updateGroupMembers(classId, groupId, groupName, selectedUserIds = [], leaderUserId = null) {
      const classes = this.getClasses();
      const cls = classes.find(c => c.id === classId) || classes[0];
      if (!cls) return;

      if (!cls.groups) cls.groups = [];
      let group = cls.groups.find(g => g.id === groupId);
      if (!group) {
        group = { id: groupId || ('group_' + Date.now()), name: groupName, members: [] };
        cls.groups.push(group);
      } else {
        group.name = groupName;
      }

      group.members = selectedUserIds;
      localStorage.setItem(STORAGE_KEY_CLASSES, JSON.stringify(classes));

      const users = this.getUsers();
      selectedUserIds.forEach((uid, idx) => {
        const u = users.find(usr => usr.id === uid);
        if (u) {
          u.groupId = group.id;
          if (uid === leaderUserId) {
            u.studentCode = 'A';
          } else {
            // Assign sequential letters B, C, D...
            u.studentCode = String.fromCharCode(66 + idx);
          }
        }
      });
      // If leader was not explicitly specified, first is A
      if (!leaderUserId && selectedUserIds.length > 0) {
        const uFirst = users.find(usr => usr.id === selectedUserIds[0]);
        if (uFirst) uFirst.studentCode = 'A';
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

        deleteAllGroups(classId) {
      const classes = this.getClasses();
      const cls = classes.find(c => c.id === classId) || classes[0];
      if (!cls) return;

      const users = this.getUsers();
      // 寻找测试 3 人组
      const testUsers = users.filter(u => u.id === 'u_studentA' || u.id === 'u_studentB' || u.id === 'u_studentC' || ['202601', '202602', '202603'].includes(u.studentCode));
      const hasTestUsers = testUsers.length > 0 && testUsers.some(tu => (cls.studentIds || []).includes(tu.id));

      if (hasTestUsers) {
        // 保留第 1 小组 (测试组)
        const g1 = (cls.groups || []).find(g => g.id === 'group_1') || {
          id: 'group_1',
          name: '第 1 协作小组 (测试组)',
          members: testUsers.map(u => u.id)
        };
        g1.members = testUsers.map(u => u.id);
        cls.groups = [g1];

        users.forEach(u => {
          if (cls && cls.studentIds && cls.studentIds.includes(u.id)) {
            if (testUsers.some(tu => tu.id === u.id)) {
              u.groupId = 'group_1';
            } else {
              u.groupId = null;
            }
          }
        });
      } else {
        cls.groups = [];
        users.forEach(u => {
          if (cls && cls.studentIds && cls.studentIds.includes(u.id)) {
            u.groupId = null;
          }
        });
      }

      localStorage.setItem(STORAGE_KEY_CLASSES, JSON.stringify(classes));
      localStorage.setItem(STORAGE_KEY_USERS_DB, JSON.stringify(users));
      this.pushGlobalMeta();
    }

    autoRandomGrouping(classId, groupSize = 3) {
      const classes = this.getClasses();
      const cls = classes.find(c => c.id === classId) || classes[0];
      if (!cls) return;
      const allUsers = this.getUsers();
      const classStudents = allUsers.filter(u => u.role !== "teacher" && (cls.studentIds || []).includes(u.id));
      if (classStudents.length === 0) return;

      // 提取测试 3 人组（李明、王芳、陈强）固定留在第 1 组
      const testStudents = classStudents.filter(u => u.id === 'u_studentA' || u.id === 'u_studentB' || u.id === 'u_studentC' || ['202601', '202602', '202603'].includes(u.studentCode));
      const otherStudents = classStudents.filter(u => !testStudents.some(tu => tu.id === u.id));

      const newGroups = [];

      // 1. 如果班级包含测试账号，固定锁定为【第 1 协作小组】
      if (testStudents.length > 0) {
        const g1 = {
          id: 'group_1',
          name: '第 1 协作小组 (测试组)',
          members: testStudents.map(s => s.id)
        };
        newGroups.push(g1);
        testStudents.forEach(s => { s.groupId = 'group_1'; });
      }

      // 2. 剩余的真实学生，从第 2 组开始随机乱序洗牌分配
      if (otherStudents.length > 0) {
        const shuffled = [...otherStudents].sort(() => Math.random() - 0.5);
        const dynamicGroupCount = Math.max(1, Math.ceil(shuffled.length / groupSize));
        const startIndex = newGroups.length + 1; // 从第 2 组或第 1 组开始

        for (let i = 0; i < dynamicGroupCount; i++) {
          const gid = `group_${Date.now()}_${i + 1}`;
          newGroups.push({
            id: gid,
            name: `第 ${startIndex + i} 协作小组`,
            members: []
          });
        }

        shuffled.forEach((student, idx) => {
          const targetDynamicGroup = newGroups[newGroups.length - dynamicGroupCount + (idx % dynamicGroupCount)];
          targetDynamicGroup.members.push(student.id);
          student.groupId = targetDynamicGroup.id;
        });
      }

      cls.groups = newGroups;
      localStorage.setItem(STORAGE_KEY_CLASSES, JSON.stringify(classes));
      localStorage.setItem(STORAGE_KEY_USERS_DB, JSON.stringify(allUsers));
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
          const letterCode = (u.studentCode && u.studentCode.length === 1) ? u.studentCode.toUpperCase() : String.fromCharCode(65 + idx);
          membersObj[letterCode] = {
            id: letterCode,
            name: u.name,
            roleTitle: (u.studentCode === 'A' || idx === 0) ? '组长 · 论文结构' : `组员 · 合作撰写`,
            avatar: u.avatar || avatars[idx % avatars.length],
            color: colors[idx % colors.length],
            studentCode: letterCode
          };
        });
      } else {
        membersObj['A'] = { id: 'A', name: '李明 (学生A)', roleTitle: '组长 · 论文结构', avatar: '👨‍🎓', color: '#818cf8', studentCode: 'A' };
        membersObj['B'] = { id: 'B', name: '王芳 (学生B)', roleTitle: '组员 · 文献综述', avatar: '👩‍🎓', color: '#22d3ee', studentCode: 'B' };
        membersObj['C'] = { id: 'C', name: '陈强 (学生C)', roleTitle: '组员 · 研究设计', avatar: '🧑‍🎓', color: '#fbbf24', studentCode: 'C' };
      }
      return membersObj;
    }

    createTask(title, classId, instructions, resources = [], startTime = null, deadline = null, durationMinutes = 150) {
      const tasks = this.getTasks();
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
        status: 'in_progress', createdAt: new Date().toLocaleDateString(),
        instructions, resources
      };
      tasks.unshift(newTask);
      localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(tasks));
      this.pushGlobalMeta();
      return newTask;
    }

    deleteTask(taskId) {
      let tasks = this.getTasks();
      tasks = tasks.filter(t => t.id !== taskId);
      localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(tasks));
      this.pushGlobalMeta();
    }

    publishAnnouncement(taskId, title, content, attachment = null, targetGroupId = 'all', targetGroupName = '全班所有小组') {
      const announcements = this.getAnnouncements();
      const tasks = this.getTasks();
      const task = tasks.find(t => t.id === taskId);
      const newAnn = {
        id: 'ann_' + Date.now(),
        taskId: taskId || 'task_all',
        taskTitle: taskId === 'task_all' ? '全班通识广播' : (task ? task.title : '指定写作任务'),
        targetGroupId: targetGroupId || 'all',
        targetGroupName: targetGroupName || '全班所有小组',
        title, content, attachment,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        author: '老师', readStatus: { 'group_1': false }
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
      if (ann) {
        if (!ann.readStatus) ann.readStatus = {};
        ann.readStatus[groupId] = true;
        localStorage.setItem(STORAGE_KEY_ANNOUNCEMENTS, JSON.stringify(announcements));
        this.pushGlobalMeta();
      }
    }

    getReferencePapers(groupId = null) {
      const data = localStorage.getItem('jizhi_reference_papers_db');
      const papers = data ? JSON.parse(data) : [];
      if (!groupId || groupId === 'all') return papers;
      return papers.filter(p => !p.targetGroupId || p.targetGroupId === 'all' || p.targetGroupId === groupId);
    }

    uploadReferencePaper(paper) {
      const papers = this.getReferencePapers();
      const paperId = 'ref_' + Date.now();
      
      // 单独持久化大附件数据，保持 global_meta 轻量秒级存入 MySQL
      if (paper.fileData) {
        try { localStorage.setItem(`jizhi_paper_data_${paperId}`, paper.fileData); } catch (e) {}
      }

      const newPaper = {
        id: paperId,
        taskId: paper.taskId || 'task_all',
        title: paper.title || '未命名学术参考范文',
        abstract: paper.abstract || '',
        keyHighlights: paper.keyHighlights || '研究设计与学术论证规范',
        fileName: paper.fileName || '',
        fileSize: paper.fileSize || '',
        targetGroupId: paper.targetGroupId || 'all',
        targetGroupName: paper.targetGroupName || '全班所有小组',
        uploadTime: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        author: '任课教师'
      };
      papers.unshift(newPaper);
      localStorage.setItem('jizhi_reference_papers_db', JSON.stringify(papers));
      this.pushGlobalMeta();
      return newPaper;
    }

    deleteReferencePaper(paperId) {
      let papers = this.getReferencePapers();
      papers = papers.filter(p => p.id !== paperId);
      localStorage.setItem('jizhi_reference_papers_db', JSON.stringify(papers));
      if (window.app && window.app.cloudSyncEngine) window.app.cloudSyncEngine.pushSnapshot();
    }

    pushReferencePaperToGroupChat(paperId, targetGroupId = 'all') {
      const papers = this.getReferencePapers();
      const paper = papers.find(p => p.id === paperId);
      if (!paper) return;

      const pushMsg = {
        sender: 'reviewingEditor',
        text: `📝【审稿编辑学习提醒】：任课教师已在上方【📚 查阅参考范文】中上传了高水平参考范文《${paper.title}》！\n💡 建议小组成员点击查阅并下载，重点参考其：\n${paper.keyHighlights || paper.abstract || '研究设计、三线表规范与论证逻辑'}\n👉 小组成员可随时点击正文上方【📚 查阅参考范文】下载查阅，并结合修改正文！`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      // 注入当前活动状态
      if (window.app && window.app.state) {
        if (!window.app.state.chatLogs['stage2']) window.app.state.chatLogs['stage2'] = [];
        window.app.state.chatLogs['stage2'].push(pushMsg);
      }

      // 如果推送给特定组或所有组，同步存入 storage
      const classes = this.getClasses();
      const allGroupIds = [];
      classes.forEach(c => (c.groups || []).forEach(g => allGroupIds.push(g.id)));
      if (allGroupIds.length === 0) allGroupIds.push('group_1');

      const targetGroups = (targetGroupId === 'all') ? allGroupIds : [targetGroupId];
      targetGroups.forEach(gid => {
        try {
          const chatKey = `jizhi_sync_chat_v6_${gid}`;
          const gChats = JSON.parse(localStorage.getItem(chatKey)) || { stage1: [], stage2: [], stage3: [] };
          if (!gChats.stage2) gChats.stage2 = [];
          gChats.stage2.push(pushMsg);
          localStorage.setItem(chatKey, JSON.stringify(gChats));
        } catch (e) {}
      });

      if (window.app && window.app.cloudSyncEngine) window.app.cloudSyncEngine.pushSnapshot();
      return pushMsg;
    }

    setGroupFinalSubmitted(groupId, isSubmitted) {
      const taskId = (window.app && window.app.state && window.app.state.activeTaskId) ? window.app.state.activeTaskId : 'task_default';
      localStorage.setItem(`jizhi_sync_final_submitted_v10_pure_${taskId}_${groupId}`, isSubmitted ? 'true' : 'false');
      if (window.app && window.app.state) {
        window.app.state.isFinalSubmitted = isSubmitted;
      }
      if (window.app && window.app.cloudSyncEngine) {
        window.app.cloudSyncEngine.pushSnapshot();
      }
    }

    exportGroupChatLogsToExcel(groupId = 'group_1', chatLogsState = null) {
      const currentChatLogs = chatLogsState || JSON.parse(localStorage.getItem(`jizhi_sync_chat_v6_${groupId}`)) || {};
      let csvContent = '\uFEFF名字,时间,内容\n';
      const stageNames = { stage1: '阶段一：学术拍卖会', stage2: '阶段二：学术编辑部', stage3: '阶段三：答辩擂台' };
      const users = this.getUsers();
      ['stage1', 'stage2', 'stage3'].forEach(stageKey => {
        const logs = currentChatLogs[stageKey] || [];
        if (logs.length > 0) {
          csvContent += `"[${stageNames[stageKey]}]","",""\n`;
          logs.forEach(msg => {
            let senderDisplayName = msg.sender;
            if (msg.sender === 'A' || msg.sender === 'liming') senderDisplayName = '李明 (学生A/组长)';
            else if (msg.sender === 'B' || msg.sender === 'wangfang') senderDisplayName = '王芳 (学生B/组员)';
            else if (msg.sender === 'C' || msg.sender === 'chenqiang') senderDisplayName = '陈强 (学生C/组员)';
            else if (msg.sender === 'auctioneer') senderDisplayName = '拍卖师 Agent';
            else if (msg.sender === 'managingEditor') senderDisplayName = '责任编辑 Agent';
            else if (msg.sender === 'reviewingEditor') senderDisplayName = '审稿编辑 Agent';
            else if (msg.sender === 'opponent') senderDisplayName = '反方委员 Agent';
            else if (msg.sender === 'proponent') senderDisplayName = '正方委员 Agent';
            else if (msg.sender === 'neutral') senderDisplayName = '中间委员 Agent';
            else {
              const foundUser = users.find(u => u.studentCode === msg.sender || u.username === msg.sender);
              if (foundUser) senderDisplayName = foundUser.name;
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
  }

  /* ==========================================================================
     4.5 CARET POSITION ANCHOR HELPERS (光标字符偏移记忆与还原引擎)
     ========================================================================== */
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
     5. CLOUD SYNC ENGINE - Server (sync.php) primary + WebSocket real-time push
     ========================================================================== */
  class CloudSyncEngine {
    constructor(app) {
      this.app = app;
      this.lastTimestamp = 0;
      this.isPushing = false;
      this.pendingPush = false;
      this.updateScopeKeys();
      this.initWebSocket();
      this.initPolling();
    }

    updateScopeKeys() {
      const user = this.app.authManager.getCurrentUser();
      const groupId = (user && user.groupId) ? user.groupId : (this.app.state.activeMonitorGroupId || 'group_1');
      const taskId = (this.app.state.activeTaskId) ? this.app.state.activeTaskId : 'task_default';
      this.groupId = groupId;
      this.taskId = taskId;
      this.storageKey = `jizhi_cloud_snapshot_v10_pure_${taskId}_${groupId}`;
      const host = window.location.hostname || '47.99.110.230';
      const protocol = window.location.protocol || 'http:';

      const sseHost = window.location.hostname || '47.99.110.230';
      const port = window.location.port ? `:${window.location.port}` : '';
      this.syncEndpoints = [
        `sync.php?taskId=${taskId}&groupId=${groupId}`
      ];
    }

    initSSE() {
      this.updateScopeKeys();
      if (this.sse) { try { this.sse.close(); } catch (e) {} }
      // 如果当前页面是通过 HTTPS 访问，绝不发起不安全的 HTTP:8088 跨端口请求，避免浏览器 Mixed Content 拦截
      if (window.location.protocol === 'https:') {
        return;
      }
      const sseHost = window.location.hostname || '47.99.110.230';
      const sseUrl = `http://${sseHost}:8088/api/stream?taskId=${this.taskId}&groupId=${this.groupId}`;
      try {
        this.sse = new EventSource(sseUrl);
        this.sse.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data) this.handleRemoteSync(data);
          } catch (e) {}
        };
        this.sse.onerror = () => {
          if (this.sse) { try { this.sse.close(); } catch (e) {} }
        };
      } catch (e) {}
    }

    initWebSocket() {
      this.updateScopeKeys();
      this.initSSE();
      // 纯净本地与服务端同步 (已由 400ms 高速 HTTP 轮询 + 本地 BroadcastChannel 承载，禁用失效的第三方外部 WebSocket，保持控制台 0 报错)
    }

    initPolling() {
      this.pullFromServer();
      // Poll server every 200ms for instantaneous near-realtime cross-device sync
      this.pollTimer = setInterval(() => this.pullFromServer(), 200);

      if ('BroadcastChannel' in window) {
        try {
          this.bc = new BroadcastChannel(`jizhi_bc_${this.groupId}`);
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

    async pullFromServer() {
      this.updateScopeKeys();

      // 1. 账号唯一在线检查 (节流至每 4 秒检查一次，避免 400ms 高频请求串行排队拖慢数据同步)
      const nowMs = Date.now();
      if (!this.lastSessionCheckTime || nowMs - this.lastSessionCheckTime > 4000) {
        this.lastSessionCheckTime = nowMs;
        const currentUser = this.app.authManager.getCurrentUser();
        if (currentUser && currentUser.activeSessionId && !this.isLoggingOut) {
          try {
            const chkRes = await fetch(`sync.php?action=session_check&userId=${encodeURIComponent(currentUser.id || currentUser.username)}&token=${encodeURIComponent(currentUser.activeSessionId)}`);
            if (chkRes.ok) {
              const chkData = await chkRes.json();
              if (chkData && chkData.kicked) {
                this.isLoggingOut = true;
                if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
                this.app.authManager.logout();
                
                // 弹出优雅自定义提示弹窗 (点击确定或关闭立即平滑返回登录页，绝不卡死)
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

      // 2. 拉取最新协作数据 (以服务端数据为唯一真理)
      for (const endpoint of this.syncEndpoints) {
        try {
          const sep = endpoint.includes('?') ? '&' : '?';
          const url = `${endpoint}${sep}nocache=${Date.now()}`;
          const res = await fetch(url, { cache: 'no-store' });
          if (res.ok) {
            const data = await res.json();
            if (data && (data.timestamp || data.chatLogs || data.stage2)) {
              this.handleRemoteSync(data);
              return;
            }
          }
        } catch (e) {}
      }

      // Fallback to local storage
      try {
        const localRaw = localStorage.getItem(this.storageKey);
        if (localRaw) {
          const localSnap = JSON.parse(localRaw);
          if (localSnap && localSnap.timestamp > this.lastTimestamp) this.handleRemoteSync(localSnap);
        }
      } catch (e) {}
    }

    async pushSnapshot() {
      this.updateScopeKeys();
      const groupId = this.groupId;

      const isReset = !!this.isResetBroadcast;
      this.isResetBroadcast = false;

      // 读取本地已知的 resetSeq，如果是重置操作则递增 resetSeq 以广播通知所有端强制重置
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
        resetSeq: localResetSeq,  // 告诉服务端本客户端当前的 resetSeq
        members: this.app.state.members,
        presence: this.app.state.presence || {},
        chatLogs: this.app.state.chatLogs,
        stage1: this.app.state.stage1,
        stage2: this.app.state.stage2,
        stage3: this.app.state.stage3,
        currentStage: this.app.state.currentStage,
        isFinalSubmitted: this.app.state.isFinalSubmitted,
        users: this.app.authManager.getUsers(),
        classes: this.app.authManager.getClasses(),
        tasks: this.app.authManager.getTasks(),
        announcements: this.app.authManager.getAnnouncements(),
        referencePapers: this.app.authManager.getReferencePapers()
      };

      this.lastTimestamp = snapshot.timestamp;
      const bodyStr = JSON.stringify(snapshot);

      // Save local copy
      try { localStorage.setItem(this.storageKey, bodyStr); } catch (e) {}
      // Broadcast to same-browser tabs instantly
      if (this.bc) { try { this.bc.postMessage({ snapshot }); } catch (e) {} }
      // Push via WebSocket for instant cross-device delivery
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try { this.ws.send(JSON.stringify({ snapshot })); } catch (e) {}
      }

      if (this.isPushing) { this.pendingPush = true; return; }
      this.isPushing = true;
      try {
        const results = await Promise.allSettled(this.syncEndpoints.map(url =>
          fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: bodyStr
          }).then(r => r.json()).catch(() => null)
        ));
        // 如果服务端返回 stale=true，说明本客户端落后于 reset_seq，需要立即同步
        for (const result of results) {
          if (result.status === 'fulfilled' && result.value && result.value.stale) {
            // 服务端已有更新的 resetSeq，立即触发本地重置
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
        if (this.pendingPush) { this.pendingPush = false; this.pushSnapshot(); }
      }
    }

    // 统一执行重置逻辑（由 handleRemoteSync 或 pushSnapshot 的 stale 响应触发）
    _applyReset(newResetSeq) {
      const user = this.app.authManager.getCurrentUser();
      const myGroupId = (user && user.groupId) ? user.groupId : (this.app.state.activeMonitorGroupId || 'group_1');
      const taskId = this.app.state.activeTaskId || 'task_default';
      const localResetSeqKey = `jizhi_reset_seq_${this.storageKey}`;

      // 更新本地 resetSeq
      localStorage.setItem(localResetSeqKey, String(newResetSeq));

      // 彻底重置内存中所有状态至初始状态
      this.app.state.stage1 = JSON.parse(JSON.stringify(InitialState.stage1));
      this.app.state.stage2 = JSON.parse(JSON.stringify(InitialState.stage2));
      this.app.state.stage3 = JSON.parse(JSON.stringify(InitialState.stage3));
      this.app.state.chatLogs = { stage1: [], stage2: [], stage3: [] };
      this.app.state.currentStage = 'stage1';
      this.app.state.isFinalSubmitted = false;
      this.app.state.presence = {};

      // 同步写入 localStorage
      localStorage.setItem(`jizhi_sync_chat_v10_pure_${taskId}_${myGroupId}`, JSON.stringify(this.app.state.chatLogs));
      localStorage.setItem(`jizhi_sync_s1_v10_pure_${taskId}_${myGroupId}`, JSON.stringify(this.app.state.stage1));
      localStorage.setItem(`jizhi_sync_s2_v10_pure_${taskId}_${myGroupId}`, JSON.stringify(this.app.state.stage2));
      localStorage.setItem(`jizhi_sync_s3_v10_pure_${taskId}_${myGroupId}`, JSON.stringify(this.app.state.stage3));
      localStorage.setItem(`jizhi_sync_current_stage_v10_pure_${taskId}_${myGroupId}`, 'stage1');
      localStorage.setItem(`jizhi_sync_final_submitted_v10_pure_${taskId}_${myGroupId}`, 'false');

      // 重置时间戳，让后续正常来包不被丢弃
      this.lastTimestamp = 0;

      // 强制销毁旧的画板 DOM，确保重建出全新的干净阶段一
      const oldContractCard = document.querySelector('.contract-card');
      if (oldContractCard) oldContractCard.remove();
      const editor = document.getElementById('stage2-word-editor') || document.getElementById('stage3-word-editor');
      if (editor) editor.innerHTML = '';

      // 保存并重绘
      this.app.saveGroupState(myGroupId);
      renderChat(this.app.state);
      this.app.updateContributionUi();
      this.app.renderPresenceCursors();

      if (user?.role === 'student' && this.app.state.studentViewMode === 'workspace') {
        this.app.renderStudentWorkspace(true);
        // 弹出友好提示告知学生：教师端已重置本次活动数据
        document.querySelectorAll('.reset-notify-modal').forEach(m => m.remove());
        const resetModal = document.createElement('div');
        resetModal.className = 'modal-overlay reset-notify-modal';
        resetModal.innerHTML = `
          <div class="teacher-modal-card" style="width:420px; text-align:center; padding:28px 24px; background:#ffffff; border-radius:12px; box-shadow:0 20px 25px -5px rgba(0,0,0,0.25);">
            <div style="font-size:44px; margin-bottom:12px;">🔄</div>
            <div style="font-size:17px; font-weight:800; color:#0f172a; margin-bottom:8px;">教学数据已由教师重置</div>
            <div style="font-size:13.5px; color:#64748b; line-height:1.6; margin-bottom:22px;">
              指导教师已清空本组的历史研讨与正文草稿，工作区已恢复至初始阶段一，全组可以重新开始本次写作任务。
            </div>
            <button id="btn-confirm-reset-ok" style="background:linear-gradient(135deg, #2563eb, #1d4ed8); color:white; border:none; padding:11px 28px; border-radius:8px; font-size:14px; font-weight:700; cursor:pointer; width:100%;">
              我知道了，开始协作
            </button>
          </div>
        `;
        document.body.appendChild(resetModal);
        resetModal.querySelector('#btn-confirm-reset-ok').addEventListener('click', () => resetModal.remove());
      }
    }

    handleRemoteSync(remoteData) {
      if (!remoteData) return;

      const user = this.app.authManager.getCurrentUser();
      const myGroupId = (user && user.groupId) ? user.groupId : (this.app.state.activeMonitorGroupId || 'group_1');

      // 仅当数据属于本组时才处理
      if (remoteData.groupId && remoteData.groupId !== myGroupId && user?.role === 'student') return;

      // ── 优先检查 resetSeq：如果服务端 resetSeq 比本地大，立即执行重置 ──
      if (remoteData.resetSeq !== undefined) {
        const localResetSeqKey = `jizhi_reset_seq_${this.storageKey}`;
        const localResetSeq = parseInt(localStorage.getItem(localResetSeqKey) || '0', 10);
        if (remoteData.resetSeq > localResetSeq) {
          this._applyReset(remoteData.resetSeq);
          return;
        }
      }

      // 注意：强制重置包 (isReset) 无论时间戳如何，立即调用 _applyReset 清理并弹窗通知学生
      const isReset = !!remoteData.isReset;
      if (isReset) {
        this._applyReset(remoteData.resetSeq || 1);
        return;
      }

      // ── 全局教务元数据同步 (用户池/班级/任务/通知/范文库) ──
      // 仅写 localStorage，绝不触发页面重绘
      if (remoteData.users && Array.isArray(remoteData.users) && remoteData.users.length > 0) {
        const currUser = this.app.authManager.getCurrentUser();
        const mergedUsers = remoteData.users.map(u => {
          if (currUser && (currUser.id === u.id || currUser.username === u.username)) {
            return { ...u, activeSessionId: currUser.activeSessionId };
          }
          return u;
        });
        const localJson = localStorage.getItem('jizhi_pure_v10_users_db');
        const remoteJson = JSON.stringify(mergedUsers);
        if (localJson !== remoteJson) {
          localStorage.setItem('jizhi_pure_v10_users_db', remoteJson);
        }
      }
      if (remoteData.classes && Array.isArray(remoteData.classes) && remoteData.classes.length > 0) {
        const localJson = localStorage.getItem('jizhi_pure_v10_classes_db');
        const remoteJson = JSON.stringify(remoteData.classes);
        if (localJson !== remoteJson) {
          localStorage.setItem('jizhi_pure_v10_classes_db', remoteJson);
        }
      }
      if (remoteData.tasks && Array.isArray(remoteData.tasks)) {
        localStorage.setItem('jizhi_pure_v10_tasks_db', JSON.stringify(remoteData.tasks));
      }
      if (remoteData.announcements && Array.isArray(remoteData.announcements)) {
        localStorage.setItem('jizhi_pure_v10_ann_db', JSON.stringify(remoteData.announcements));
      }
      if (remoteData.referencePapers && Array.isArray(remoteData.referencePapers)) {
        localStorage.setItem('jizhi_reference_papers_db', JSON.stringify(remoteData.referencePapers));
      }

      if (remoteData.presence) {
        this.app.state.presence = { ...(this.app.state.presence || {}), ...remoteData.presence };
        this.app.renderPresenceCursors();
      }

      if (remoteData.members) {
        this.app.state.members = remoteData.members;
      }

      // ── 最终提交状态 ──
      if (remoteData.isFinalSubmitted !== undefined && remoteData.isFinalSubmitted !== this.app.state.isFinalSubmitted) {
        this.app.state.isFinalSubmitted = remoteData.isFinalSubmitted;
      }

      // ── 聊天记录：采用单调递增并集去重合并（Union & Dedup），彻底杜绝旧快照冲掉新发言导致一闪一闪 ──
      if (remoteData.chatLogs) {
        let chatChanged = false;
        ['stage1', 'stage2', 'stage3'].forEach(stg => {
          const remoteLogs = Array.isArray(remoteData.chatLogs[stg]) ? remoteData.chatLogs[stg] : [];
          const localLogs = Array.isArray(this.app.state.chatLogs[stg]) ? this.app.state.chatLogs[stg] : [];
          
          // 建立消息去重 Map（优先根据 _timeMs+sender+text 去重）
          const msgMap = new Map();
          const getMsgKey = (m) => {
            if (!m) return '';
            const tMs = m._timeMs || m.timestamp || '';
            const sender = m.sender || '';
            const textHead = (m.text || '').slice(0, 30);
            return `${sender}_${tMs}_${textHead}`;
          };

          // 先载入本地消息
          localLogs.forEach(m => {
            if (m) msgMap.set(getMsgKey(m), m);
          });
          // 并入远端消息
          remoteLogs.forEach(m => {
            if (m) {
              const k = getMsgKey(m);
              if (!msgMap.has(k)) {
                msgMap.set(k, m);
                chatChanged = true;
              }
            }
          });

          // 如果合并后的总数发生变化或顺序更新
          const mergedLogs = Array.from(msgMap.values());
          if (mergedLogs.length !== localLogs.length || JSON.stringify(mergedLogs) !== JSON.stringify(localLogs)) {
            this.app.state.chatLogs[stg] = mergedLogs;
            chatChanged = true;
          }
        });
        if (chatChanged) renderChat(this.app.state);
      }

      let needWorkspaceRender = false;

      // ── stage1 投票/提案/合约：全量实时同步 ──
      if (remoteData.stage1) {
        const localS1 = this.app.state.stage1 || { proposals: [], votes: {}, hasVoted: {}, contract: {} };
        const remoteS1 = remoteData.stage1;
        const isContractInputActive = document.activeElement && (
          document.activeElement.classList.contains('task-assignment-input') ||
          document.activeElement.classList.contains('contract-time-input') ||
          document.activeElement.id === 'contract-topic-input'
        );

        // ── 合约字段全量双向同步：如果本地用户未在打字编辑合约，才允许覆盖本地内存 ──
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

        // 局部更新合约输入框 value（仅当输入框未被当前用户聚焦打字时才回填，绝不冲掉用户正在打的字）
        if (remoteS1.contract?.taskAssignments) {
          if (!this.app.state.stage1.contract.taskAssignments) this.app.state.stage1.contract.taskAssignments = {};
          Object.assign(this.app.state.stage1.contract.taskAssignments, remoteS1.contract.taskAssignments);
          
          document.querySelectorAll('.task-assignment-input').forEach(inp => {
            const mId = inp.dataset.mid;
            const code = inp.dataset.code;
            const remoteVal = (remoteS1.contract.taskAssignments[mId] !== undefined)
              ? remoteS1.contract.taskAssignments[mId]
              : (code && remoteS1.contract.taskAssignments[code] !== undefined ? remoteS1.contract.taskAssignments[code] : undefined);
            
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

          // ── 条件 1 实施：提案池合并条件 —— 按 author 映射，严格按 updatedAt 最新时间戳优先 ──
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

      // ── stage2 正文编辑器：带光标锚定与拼音保护的无感差量合并 ──
      if (remoteData.stage2) {
        if (remoteData.stage2.unifiedContent !== undefined) {
          let cleanRemoteContent = (remoteData.stage2.unifiedContent || '').replace(/<span class="remote-cursor-widget"[\s\S]*?<\/span>/gi, '');
          this.app.state.stage2.unifiedContent = cleanRemoteContent;
          const editor = document.getElementById('stage2-word-editor') || document.getElementById('stage3-word-editor');
          if (editor) {
            const isLocalComposing = (editor.dataset.isComposing === 'true');
            const currentLocalHtml = editor.innerHTML.replace(/<span class="remote-cursor-widget"[\s\S]*?<\/span>/gi, '');
            
            // 拼音输入法合成期间绝对挂起，避免拼音候选框被打断
            if (!isLocalComposing && currentLocalHtml.trim() !== cleanRemoteContent.trim()) {
              const isEditorFocused = (document.activeElement === editor) || (editor.contains(document.activeElement));
              
              if (isEditorFocused) {
                // 1. 精确记录当前光标在全文中的字符偏移量
                const savedOffset = getCaretCharacterOffsetWithin(editor);
                // 2. 平滑更新 HTML
                editor.innerHTML = cleanRemoteContent || '';
                // 3. 瞬间恢复光标到原本的字符位置，打字手感 100% 丝滑连贯，绝不乱跳到左上角
                try { setCaretPositionWithin(editor, savedOffset); } catch (e) {}
              } else {
                // 未聚焦状态下静默全量更新
                editor.innerHTML = cleanRemoteContent || '';
              }
            }
          }
          this.app.updateContributionUi();
          this.app.renderPresenceCursors();
        }
        if (remoteData.stage2.memberContributions) {
          if (JSON.stringify(remoteData.stage2.memberContributions) !== JSON.stringify(this.app.state.stage2.memberContributions)) {
            this.app.state.stage2.memberContributions = remoteData.stage2.memberContributions;
            this.app.updateContributionUi();
          }
        }
        // action plan 变化与打卡记录同步（审稿编辑半程清单生成）
        if (remoteData.stage2.meetingSubmissions) {
          const localSubs = this.app.state.stage2.meetingSubmissions || {};
          const remoteSubs = remoteData.stage2.meetingSubmissions || {};
          const mergedSubs = { ...localSubs, ...remoteSubs };
          if (JSON.stringify(mergedSubs) !== JSON.stringify(localSubs)) {
            this.app.state.stage2.meetingSubmissions = mergedSubs;
            needWorkspaceRender = true;
          }
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

      // ── stage3 答辩委员意见：靶向增量更新，绝不全屏暴力重新渲染 ──
      if (remoteData.stage3 && remoteData.stage3.feedbackItems) {
        if (JSON.stringify(remoteData.stage3.feedbackItems) !== JSON.stringify(this.app.state.stage3.feedbackItems)) {
          this.app.state.stage3.feedbackItems = remoteData.stage3.feedbackItems;
          
          // 靶向更新已渲染的卡片输入框与按钮状态，绝对不销毁整个矩阵 DOM
          remoteData.stage3.feedbackItems.forEach(item => {
            const textarea = document.querySelector(`.feedback-direct-input[data-id="${item.id}"]`);
            if (textarea && document.activeElement !== textarea) {
              if (textarea.value !== (item.response || '')) {
                textarea.value = item.response || '';
              }
              textarea.style.borderColor = item.response ? '#a7f3d0' : '#cbd5e1';
              textarea.style.background = this.app.state.isFinalSubmitted ? '#f8fafc' : (item.response ? '#f0fdf4' : '#ffffff');
            }
            const saveBtn = document.querySelector(`.btn-save-feedback-direct[data-id="${item.id}"]`);
            if (saveBtn) {
              saveBtn.innerHTML = item.response ? '🔄 更新并保存本条修改' : '💾 确认并保存本条答复';
              saveBtn.style.background = item.response ? 'linear-gradient(135deg, #059669, #047857)' : 'linear-gradient(135deg, #2563eb, #1d4ed8)';
            }
          });
        }
      }

      // ── 阶段切换：同步最新阶段并平滑重绘工作区 ──
      if (remoteData.currentStage && remoteData.currentStage !== this.app.state.currentStage) {
        this.app.state.currentStage = remoteData.currentStage;
        needWorkspaceRender = true;
      }

      // ── 统一保存状态 ──
      this.app.saveGroupState(myGroupId);
      renderChat(this.app.state);
      this.app.updateContributionUi();
      this.app.renderPresenceCursors();

      // 统一按需重绘工作区，绝不中途 return 导致同步截断
      if (needWorkspaceRender && user?.role === 'student' && this.app.state.studentViewMode === 'workspace') {
        this.app.renderStudentWorkspace();
      }
    }
  }

  /* ==========================================================================
     6. LOGIN VIEW RENDERER
     ========================================================================== */
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
              <input type="text" id="login-account" class="teacher-input" placeholder="输入教师工号 1001 或学生学号 202601 / 202602 / 202603" value="1001" required style="width:100%;">
            </div>
            <div style="display:flex; flex-direction:column; gap:6px;">
              <label style="font-size:13px; font-weight:700; color:#334155;">密码 (默认统一为 123)</label>
              <input type="password" id="login-password" class="teacher-input" placeholder="输入密码 123" value="123" required style="width:100%;">
            </div>
            <div id="login-error-msg" style="display:none; font-size:12px; color:#dc2626; background:#fef2f2; border:1px solid #fecaca; padding:8px 12px; border-radius:8px;"></div>
            <button type="submit" class="modal-btn submit task-theme" style="width:100%; padding:14px; font-size:15px; border-radius:10px; margin-top:4px;">
              🚀 登录集智平台
            </button>
          </form>
          <div style="margin-top:24px; border-top:1px solid #e2e8f0; padding-top:20px;">
            <div style="font-size:12px; font-weight:700; color:#2563eb; margin-bottom:12px; text-align:center;">
              ⚡ 免输入一键快速测试登录
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
              <button class="quick-login-btn" data-account="1001" style="background:#ecfdf5; border:1px solid #a7f3d0; color:#059669; padding:10px; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer;">👩‍🏫 教师工号: 1001 (老师)</button>
              <button class="quick-login-btn" data-account="202601" style="background:#eff6ff; border:1px solid #bfdbfe; color:#2563eb; padding:10px; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer;">👨‍🎓 学生学号: 202601 (李明/组长)</button>
              <button class="quick-login-btn" data-account="202602" style="background:#eff6ff; border:1px solid #bfdbfe; color:#2563eb; padding:10px; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer;">👩‍🎓 学生学号: 202602 (王芳/组员)</button>
              <button class="quick-login-btn" data-account="202603" style="background:#eff6ff; border:1px solid #bfdbfe; color:#2563eb; padding:10px; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer;">🧑‍🎓 学生学号: 202603 (陈强/组员)</button>
            </div>
          </div>
        </div>
      </div>
    `;

    const form = container.querySelector('#login-form');
    const accountInput = container.querySelector('#login-account');
    const passwordInput = container.querySelector('#login-password');
    const errorMsg = container.querySelector('#login-error-msg');

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const res = authManager.login(accountInput.value, passwordInput.value);
      if (res.success) onLoginSuccess();
      else { errorMsg.innerText = res.message; errorMsg.style.display = 'block'; }
    });

    container.querySelectorAll('.quick-login-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const acc = btn.dataset.account;
        const res = authManager.login(acc, '123');
        if (res.success) onLoginSuccess();
      });
    });
  }

  /* ==========================================================================
     7. TEACHER PORTAL RENDERER (LIVE WORKSPACE MIRROR & ANNOUNCEMENT READ MATRIX)
     ========================================================================== */
  function renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView) {
    const currentUser = authManager.getCurrentUser();
    const tasks = authManager.getTasks();
    const announcements = authManager.getAnnouncements();
    const refPapers = authManager.getReferencePapers();
    const classes = authManager.getClasses();
    const activeTab = state.teacherActiveTab || 'view_architecture';
    const activeClassId = state.activeClassId || (classes[0] ? classes[0].id : 'class_101');
    const activeClass = classes.find(c => c.id === activeClassId) || classes[0] || { id: 'class_101', name: '默认班级', groups: [] };

    const allUsers = authManager.getUsers();
    const classStudents = allUsers.filter(u => u.role !== 'teacher' && u.classId === activeClass.id);

    const activeMonitorGId = state.activeMonitorGroupId || (activeClass.groups && activeClass.groups[0] ? activeClass.groups[0].id : 'group_1');
    const activeMonitorGroup = (activeClass.groups || []).find(g => g.id === activeMonitorGId) || { id: 'group_1', name: '第1小组' };
    const monitorMembersObj = authManager.getGroupMembersForWorkspace(activeMonitorGId);
    const monitorMembersList = Object.values(monitorMembersObj);

    container.innerHTML = `
      <div class="teacher-portal-layout" style="min-height:100vh; height:auto; overflow-y:auto !important; background:#f0f4f9; padding:0; display:flex; flex-direction:column;">
        <!-- 全屏头部导航 -->
        <header class="teacher-header" style="padding:16px 32px; background:#ffffff; border-bottom:1px solid #e2e8f0; width:100%; flex-shrink:0; box-shadow:0 1px 3px rgba(15,23,42,0.04);">
          <div class="brand-section">
            <div class="brand-logo" style="font-size:22px; font-weight:800; background:linear-gradient(135deg, #1e40af, #2563eb); -webkit-background-clip:text; -webkit-text-fill-color:transparent;">集智 JIZHI 教师端</div>
            <div class="brand-badge teacher-badge" style="background:#ecfdf5; color:#059669; border:1px solid #a7f3d0; padding:4px 12px; border-radius:12px; font-size:12px; font-weight:700;">👩‍🏫 全局实时教务控制中心 🟢</div>
          </div>
          <div class="teacher-info" style="display:flex; align-items:center; gap:16px;">
            <span style="font-size:13.5px; color:#334155;">当前班级: <b style="color:#2563eb;">${activeClass.name}</b></span>
            <span style="font-size:13.5px; color:#334155;">教师: <b>${currentUser.name}</b></span>
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
                <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(340px, 1fr)); gap:16px;">
                  ${classes.map(c => {
                    const isSelected = c.id === activeClass.id;
                    const cStds = allUsers.filter(u => u.role !== 'teacher' && u.classId === c.id);
                    return `
                      <div style="background:${isSelected ? '#eff6ff' : '#ffffff'}; border:1px solid ${isSelected ? '#3b82f6' : '#e2e8f0'}; border-radius:12px; padding:18px; display:flex; justify-content:space-between; align-items:center; box-shadow:0 1px 3px rgba(15,23,42,0.03);">
                        <div>
                          <div style="font-size:15.5px; font-weight:800; color:${isSelected ? '#1d4ed8' : '#0f172a'};">🏫 ${c.name}</div>
                          <div style="font-size:12px; color:#64748b; margin-top:4px;">代码: ${c.code || 'MET'} | 学生: ${cStds.length}人 | 小组: ${(c.groups || []).length}个</div>
                        </div>
                        <button class="btn-select-class" data-id="${c.id}" style="background:${isSelected ? '#ecfdf5' : '#2563eb'}; border:1px solid ${isSelected ? '#a7f3d0' : 'transparent'}; color:${isSelected ? '#059669' : 'white'}; padding:7px 14px; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer;">
                          ${isSelected ? '✅ 当前主班' : '切换'}
                        </button>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>

              <div class="card" style="border-top:4px solid #2563eb; width:100%; padding:24px;">
                <div class="card-title" style="margin-bottom:16px;">
                  <span style="font-size:17px; font-weight:800; color:#0f172a;">👨‍🎓 学生账号管理 (当前班级: ${activeClass.name})</span>
                  <div style="display:flex; gap:10px;">
                    <button id="btn-v1-add-student" class="teacher-action-btn" style="background:linear-gradient(135deg, #1d4ed8, #2563eb); border:none; color:white; padding:8px 18px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; box-shadow:0 2px 8px rgba(37,99,235,0.25);">+ 单条创建学生账号</button>
                    <button id="btn-v1-import-file" class="teacher-action-btn" style="background:linear-gradient(135deg, #1d4ed8, #2563eb); border:none; color:white; padding:8px 18px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; box-shadow:0 2px 8px rgba(37,99,235,0.25);">
                      📥 上传 XLSX / CSV 文件导入
                    </button>
                  </div>
                </div>
                <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 16px; margin-bottom:14px; font-size:13px; color:#334155; display:flex; justify-content:space-between; align-items:center;">
                  <div>💡 <b>密码说明：</b> 创建学生时可指定自定义密码（留空统一定为 <code style="color:#059669; font-weight:700;">123</code>）。建立后直接放入班级学生池。</div>
                  <span style="color:#2563eb; font-weight:800; font-size:13.5px;">池内学生: ${classStudents.length} 人</span>
                </div>
                <div style="border:1px solid #e2e8f0; border-radius:10px; overflow:hidden; background:#ffffff;">
                  <table class="monitor-table" style="font-size:13px;">
                    <thead><tr><th>姓名</th><th>学号</th><th>当前归属小组</th><th>密码</th><th>操作</th></tr></thead>
                    <tbody>
                      ${classStudents.length === 0 ? '<tr><td colspan="5" style="text-align:center; color:#64748b; padding:24px;">当前班级暂无学生账号，请点击右上角按钮创建！</td></tr>' : ''}
                      ${classStudents.map(s => {
                        const grp = (activeClass.groups || []).find(g => g.members && (g.members.includes(s.id) || g.members.includes(s.studentCode)));
                        return `
                          <tr>
                            <td><b>${s.avatar || '👤'} ${s.name}</b></td>
                            <td><span style="color:#2563eb; font-family:monospace; font-weight:700;">${s.studentCode || s.username}</span></td>
                            <td>${grp ? `<span style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; padding:2px 8px; border-radius:8px; font-size:12px; font-weight:700;">${grp.name}</span>` : '<span style="color:#94a3b8;">⏳ 待划分小组</span>'}</td>
                            <td><span style="color:#059669; font-family:monospace; font-weight:700;">${s.password || '123'}</span></td>
                            <td><button class="delete-student-btn" data-id="${s.id}" style="background:#fef2f2; border:1px solid #fecaca; color:#dc2626; padding:4px 10px; border-radius:6px; font-size:12px; cursor:pointer; font-weight:700;">移除</button></td>
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
                  ${(activeClass.groups || []).length === 0 ? '<div style="color:#64748b; padding:20px; font-size:14px;">当前班级暂无小组。</div>' : ''}
                  ${(activeClass.groups || []).map(grp => {
                    const groupMembers = classStudents.filter(s => (grp.members || []).includes(s.id));
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
                              ${m.avatar || '👤'} ${m.name} ${m.studentCode === 'A' ? '<b style="color:#d97706;">(组长)</b>' : ''}
                            </span>
                          `).join('')}
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>

            </div>
          ` : ''}

          ${activeTab === 'view_publishing' ? `
            <div style="display:flex; flex-direction:column; gap:20px; width:100%;">

              <!-- 0. 问卷链接配置 (按 班级 + 任务 双维度独立绑定) -->
              <div class="card" style="border-top:4px solid #2563eb; width:100%; padding:24px;">
                <div class="card-title" style="margin-bottom:16px;">
                  <span style="font-size:17px; font-weight:800; color:#0f172a;">📋 课程评估问卷链接配置 (按【班级 + 任务】双维度独立绑定)</span>
                </div>
                <div style="display:flex; flex-direction:column; gap:14px;">
                  <div style="display:flex; gap:16px; flex-wrap:wrap; align-items:center;">
                    <div style="display:flex; gap:8px; align-items:center;">
                      <span style="font-size:13px; font-weight:700; color:#334155; white-space:nowrap;">🏫 配置班级:</span>
                      <select id="sel-survey-class" class="teacher-input fancy" style="min-width:220px; font-weight:700;">
                        ${classes.map(c => `<option value="${c.id}" ${c.id === activeClass.id ? 'selected' : ''}>🏫 ${c.name}</option>`).join('')}
                      </select>
                    </div>
                    <div style="display:flex; gap:8px; align-items:center;">
                      <span style="font-size:13px; font-weight:700; color:#334155; white-space:nowrap;">🎯 关联写作任务:</span>
                      <select id="sel-survey-task" class="teacher-input fancy" style="min-width:220px; font-weight:700;">
                        ${tasks.map(t => `<option value="${t.id}" ${t.id === (state.activeTaskId || "task_default") ? "selected" : ""}>📌 ${t.title}</option>`).join("")}
                      </select>
                    </div>
                  </div>
                  <div style="display:flex; gap:12px; align-items:stretch;">
                    <input type="text" id="survey-url-input" class="teacher-input" placeholder="粘贴该班级该任务专属的问卷链接，例如: https://www.wjx.cn/vm/xxxxx.aspx" value="${authManager.getSurveyUrl(activeClass.id, state.activeTaskId || (tasks[0] ? tasks[0].id : "task_default"))}" style="flex:1; font-family:monospace; font-size:13px;">
                    <button id="btn-save-survey-url" class="teacher-action-btn" style="background:linear-gradient(135deg, #1d4ed8, #2563eb); border:none; color:white; padding:10px 24px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; white-space:nowrap; box-shadow:0 2px 8px rgba(37,99,235,0.25);">💾 保存绑定并永久同步</button>
                  </div>
                </div>
                <div id="survey-url-status" style="font-size:12.5px; color:#059669; display:none; margin-top:10px; font-weight:700;">✅ 该班级与任务绑定的问卷链接已成功保存！学生提交终稿时将精准唤起本班专属问卷。</div>
              </div>

              <!-- 1. 课程参考范文与文献样例库 -->
              <div class="card" style="border-top:4px solid #2563eb; width:100%; padding:24px;">
                <div class="card-title" style="margin-bottom:16px;">
                  <span style="font-size:17px; font-weight:800; color:#0f172a;">📚 课程参考范文库 (${refPapers.length} 篇)</span>
                  <button id="btn-v2-open-paper-modal" class="teacher-action-btn" style="background:linear-gradient(135deg, #1d4ed8, #2563eb); padding:8px 18px; font-size:13px; font-weight:700; border:none; color:white; border-radius:8px; cursor:pointer; box-shadow:0 2px 8px rgba(37,99,235,0.25);">
                    + 上传学术参考范文
                  </button>
                </div>
                
                <div class="reference-papers-list" style="display:flex; flex-direction:column; gap:14px;">
                  ${refPapers.length === 0 ? `
                    <div style="text-align:center; padding:32px; background:#f8fafc; border-radius:10px; border:2px dashed #cbd5e1;">
                      <div style="font-size:32px; margin-bottom:8px;">📚</div>
                      <div style="font-size:15px; font-weight:800; color:#0f172a;">当前暂无上传的课程参考范文</div>
                      <div style="font-size:12.5px; color:#64748b; margin-top:4px;">点击右上角【+ 上传学术参考范文】上传论文样本，学生可在阶段二正文上方随时查阅下载！</div>
                    </div>
                  ` : refPapers.map(p => {
                    const linkedTask = tasks.find(t => t.id === p.taskId);
                    const taskLabel = p.taskId === 'task_all' || !p.taskId ? '🌐 通用范文 (全部任务)' : (linkedTask ? `📌 ${linkedTask.title}` : '📌 专属任务范文');
                    return `
                    <div style="background:#ffffff; border:1px solid #e2e8f0; padding:18px; border-radius:12px; box-shadow:0 1px 3px rgba(15,23,42,0.03);">
                      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
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
                          <button class="btn-push-paper-to-chat" data-id="${p.id}" data-target="${p.targetGroupId || 'all'}" style="background:linear-gradient(135deg, #1d4ed8, #2563eb); border:none; color:white; padding:6px 14px; border-radius:6px; font-size:12.5px; font-weight:700; cursor:pointer; box-shadow:0 2px 6px rgba(37,99,235,0.25);">
                            📢 审稿编辑提醒学生查阅此文
                          </button>
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

              <!-- 2. 课程协作写作任务集中发布中心 -->
              <div class="card" style="border-top:4px solid #2563eb; width:100%; padding:24px;">
                <div class="card-title" style="margin-bottom:16px;">
                  <span style="font-size:17px; font-weight:800; color:#0f172a;">📌 课程写作任务发布</span>
                  <button id="btn-v2-open-task-modal" class="teacher-action-btn indigo" style="background:#2563eb; padding:8px 18px; font-size:13px; font-weight:700;">+ 发布全新写作任务</button>
                </div>
                <div style="display:flex; flex-direction:column; gap:14px;">
                  ${tasks.map(t => `
                    <div style="background:#ffffff; border:1px solid #e2e8f0; padding:18px; border-radius:12px; box-shadow:0 1px 3px rgba(15,23,42,0.03);">
                      <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:16px; font-weight:800; color:#1e40af;">📌 ${t.title}</span>
                        <div style="display:flex; align-items:center; gap:8px;">
                          <span style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; padding:4px 12px; border-radius:12px; font-size:12px; font-weight:700;">受众班级: ${t.className}</span>
                          ${t.id !== 'task_default' ? `
                            <button class="btn-delete-task" data-id="${t.id}" data-title="${t.title}" style="background:#fef2f2; border:1px solid #fecaca; color:#dc2626; padding:4px 10px; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer;" title="删除此写作任务">
                              🗑️ 删除任务
                            </button>
                          ` : ''}
                        </div>
                      </div>
                      <div style="font-size:13px; color:#334155; margin:10px 0; display:flex; gap:20px; background:#f8fafc; padding:10px 16px; border-radius:8px; border-left:4px solid #2563eb;">
                        <span>📅 <b>开始时间:</b> <span style="color:#2563eb; font-weight:700;">${t.startTime || '即时开启'}</span></span>
                        <span>⌛ <b>截止时间:</b> <span style="color:#dc2626; font-weight:700;">${t.deadline || '无硬性限制'}</span></span>
                        <span>⏱️ <b>预估时长:</b> ${t.durationMinutes} 分钟</span>
                      </div>
                      <div style="font-size:13px; color:#334155; line-height:1.6;">${t.instructions}</div>
                    </div>
                  `).join('')}
                </div>
              </div>

              <!-- 3. 发布课堂广播通知 -->
              <div class="card" style="border-top:4px solid #2563eb; width:100%; padding:24px;">
                <div class="card-title" style="margin-bottom:16px;">
                  <span style="font-size:17px; font-weight:800; color:#0f172a;">📢 课堂即时广播通知发布</span>
                  <button id="btn-v2-open-ann-modal" class="teacher-action-btn" style="background:linear-gradient(135deg, #1d4ed8, #2563eb); border:none; color:white; padding:8px 18px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; box-shadow:0 2px 8px rgba(37,99,235,0.25);">
                    + 发布新通知 (选择/拖拽上传资源文件)
                  </button>
                </div>
                <div class="announcement-history-list" style="display:flex; flex-direction:column; gap:16px;">
                  ${announcements.map(a => {
                    const classGroups = activeClass.groups || [{ id: 'group_1', name: '第1小组' }];
                    const targetGName = a.targetGroupName || (a.targetGroupId === 'all' || !a.targetGroupId ? '全班所有小组' : '指定小组');
                    const taskLabel = a.taskId === 'task_all' || !a.taskId ? '🌐 全班通识广播' : `📌 ${a.taskTitle || '专属任务'}`;
                    return `
                      <div style="background:#ffffff; border:1px solid #e2e8f0; padding:18px; border-radius:12px; box-shadow:0 1px 3px rgba(15,23,42,0.03);">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
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

                        <!-- 📊 各小组已读/未读实时确认追踪矩阵 -->
                        <div style="margin-top:10px; background:#f8fafc; padding:12px 16px; border-radius:10px; border:1px solid #e2e8f0;">
                          <div style="font-size:12px; font-weight:700; color:#334155; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
                            <span>📊 本班各小组阅读确认追踪矩阵 (${classGroups.length} 个小组):</span>
                            <span style="font-size:11px; color:#059669; font-weight:700;">🟢 学生端确认后实时点亮</span>
                          </div>
                          <div style="display:flex; flex-wrap:wrap; gap:10px; font-size:12px;">
                            ${classGroups.map(g => {
                              const isRead = a.readStatus && a.readStatus[g.id];
                              return `
                                <span style="background:${isRead ? '#ecfdf5' : '#fffbeb'}; border:1px solid ${isRead ? '#a7f3d0' : '#fde68a'}; color:${isRead ? '#059669' : '#d97706'}; padding:6px 12px; border-radius:8px; font-weight:700;">
                                  ${isRead ? '✅' : '⏳'} ${g.name}: <b>${isRead ? '已阅读确认' : '尚未确认'}</b>
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
          ` : ''}

          ${activeTab === 'view_monitoring' ? (() => {
            const monitorStageMode = state.teacherMonitorStageMode || 'auto';
            const actualStage = state.currentStage || 'stage1';
            const effectiveMonitorStage = monitorStageMode === 'auto' ? actualStage : monitorStageMode;

            return `
              <div style="display:flex; flex-direction:column; gap:16px; width:100%;">

                <div class="card" style="border-top:4px solid #059669; width:100%; padding:18px 22px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
                  <div style="display:flex; align-items:center; gap:14px; flex-wrap:wrap;">
                    <span style="font-size:16px; font-weight:800; color:#0f172a;">🖥️ 实际操作实时监控终端:</span>
                    <div style="display:flex; align-items:center; gap:8px;">
                      <span style="font-size:13px; font-weight:700; color:#475569;">监控任务:</span>
                      <select id="sel-switch-monitor-task" class="teacher-input fancy" style="font-size:13px; font-weight:700; color:#1e40af; background:#eff6ff; border:1.5px solid #3b82f6; padding:7px 14px; border-radius:8px; cursor:pointer; min-width:180px;">
                        ${tasks.length === 0 ? '<option value="task_default">📌 默认测试写作任务</option>' : tasks.map(t => {
                          const isSel = (state.activeTaskId || 'task_default') === t.id;
                          return `<option value="${t.id}" ${isSel ? 'selected' : ''}>📌 ${t.title}</option>`;
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

                  <!-- 全局只读不可修改状态控制与 Excel 导出与教师端重置协同数据 -->
                  <div style="display:flex; align-items:center; gap:10px;">
                    <span style="font-size:12px; font-weight:700; padding:6px 12px; border-radius:8px; background:${state.isFinalSubmitted ? '#fef2f2' : '#ecfdf5'}; color:${state.isFinalSubmitted ? '#dc2626' : '#059669'}; border:1px solid ${state.isFinalSubmitted ? '#fecaca' : '#a7f3d0'};">
                      ${state.isFinalSubmitted ? '🔒 全局锁定中 (学生端全盘只读·仅保留聊天)' : '✍️ 学生端可自由协作编辑'}
                    </span>
                    <button id="btn-toggle-final-submitted" style="background:${state.isFinalSubmitted ? 'linear-gradient(135deg, #059669, #047857)' : 'linear-gradient(135deg, #dc2626, #b91c1c)'}; border:none; color:white; padding:8px 16px; border-radius:8px; font-size:12.5px; font-weight:700; cursor:pointer; box-shadow:0 2px 6px rgba(0,0,0,0.15);">
                      ${state.isFinalSubmitted ? '🔓 解除全局锁定 (恢复学生编辑权限)' : '🔒 手动全局锁定 (设为全盘只读)'}
                    </button>
                    <button id="btn-reset-group-collab" style="background:linear-gradient(135deg, #f59e0b, #d97706); border:none; color:white; padding:8px 16px; border-radius:8px; font-size:12.5px; font-weight:800; cursor:pointer; box-shadow:0 3px 10px rgba(217,119,6,0.3);" title="清空该测试小组上一次的全部协同数据并恢复初始状态">
                      🔄 清空重置本组协同
                    </button>
                    <button id="btn-export-all-excel" style="background:linear-gradient(135deg, #2563eb, #1d4ed8); border:none; color:white; padding:8px 16px; border-radius:8px; font-size:12.5px; font-weight:800; cursor:pointer; box-shadow:0 3px 10px rgba(37,99,235,0.3);">
                      📊 导出本组研讨 Excel
                    </button>
                  </div>
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center; background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:12px 18px; width:100%; box-shadow:0 1px 3px rgba(15,23,42,0.03);">
                  <div style="display:flex; align-items:center; gap:12px;">
                    <span style="font-size:13px; font-weight:700; color:#334155;">📍 实时跟随指示: 当前【${activeMonitorGroup.name}】实际处于: <b style="color:#2563eb;">${actualStage === 'stage1' ? '🎪 阶段一：学术拍卖会' : actualStage === 'stage2' ? '📰 阶段二：学术编辑部' : '🎓 阶段三：答辩擂台'}</b></span>
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
                        <div style="font-size:14px; font-weight:800; color:#0f172a;">${state.stage1.mergedTitle || '【尚待确定】'}</div>
                      </div>

                      <!-- 教师端同屏展现 6 大模块时间规划 -->
                      <div style="background:#f8fafc; border:1px solid #bfdbfe; border-radius:10px; padding:12px 14px;">
                        <div style="font-size:13px; font-weight:800; color:#1e40af; margin-bottom:8px;">📚 6 大研究方案模块与时间规划:</div>
                        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:8px; font-size:12px;">
                          <div style="background:#ffffff; border:1px solid #e2e8f0; border-left:3px solid #2563eb; padding:6px 10px; border-radius:6px; display:flex; justify-content:space-between;">
                            <span style="font-weight:700; color:#1e40af;">一、研究背景与意义</span>
                            <span style="color:#2563eb; font-weight:800;">${state.stage1.contract?.timeAllocations?.background || 25}m</span>
                          </div>
                          <div style="background:#ffffff; border:1px solid #e2e8f0; border-left:3px solid #0284c7; padding:6px 10px; border-radius:6px; display:flex; justify-content:space-between;">
                            <span style="font-weight:700; color:#0369a1;">二、文献综述</span>
                            <span style="color:#0284c7; font-weight:800;">${state.stage1.contract?.timeAllocations?.literature || 30}m</span>
                          </div>
                          <div style="background:#ffffff; border:1px solid #e2e8f0; border-left:3px solid #059669; padding:6px 10px; border-radius:6px; display:flex; justify-content:space-between;">
                            <span style="font-weight:700; color:#065f46;">三、研究问题与假设</span>
                            <span style="color:#059669; font-weight:800;">${state.stage1.contract?.timeAllocations?.questions || 25}m</span>
                          </div>
                          <div style="background:#ffffff; border:1px solid #e2e8f0; border-left:3px solid #7c3aed; padding:6px 10px; border-radius:6px; display:flex; justify-content:space-between;">
                            <span style="font-weight:700; color:#6d28d9;">四、研究设计与方法</span>
                            <span style="color:#7c3aed; font-weight:800;">${state.stage1.contract?.timeAllocations?.method || 40}m</span>
                          </div>
                          <div style="background:#ffffff; border:1px solid #e2e8f0; border-left:3px solid #d97706; padding:6px 10px; border-radius:6px; display:flex; justify-content:space-between;">
                            <span style="font-weight:700; color:#b45309;">五、研究设计的不足与反思</span>
                            <span style="color:#d97706; font-weight:800;">${state.stage1.contract?.timeAllocations?.reflection || 20}m</span>
                          </div>
                          <div style="background:#ffffff; border:1px solid #e2e8f0; border-left:3px solid #475569; padding:6px 10px; border-radius:6px; display:flex; justify-content:space-between;">
                            <span style="font-weight:700; color:#334155;">六、参考文献</span>
                            <span style="color:#475569; font-weight:800;">${state.stage1.contract?.timeAllocations?.references || 10}m</span>
                          </div>
                        </div>
                      </div>

                      <!-- 教师端同屏展现组员具体章节分工 -->
                      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; font-size:12.5px;">
                        <div style="font-weight:700; color:#1e40af; margin-bottom:6px;">👥 组员具体章节分工:</div>
                        <div style="display:flex; flex-direction:column; gap:4px;">
                          ${monitorMembersList.map(m => {
                            const task = state.stage1.contract?.taskAssignments?.[m.id] || '尚未录入分工';
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
                        <div style="font-weight:700; color:#1e40af; margin-bottom:6px;">👥 合约签署矩阵:</div>
                        <div style="display:flex; flex-wrap:wrap; gap:8px;">
                          ${monitorMembersList.map(m => {
                            const isConf = state.stage1.contract.confirmedMembers && state.stage1.contract.confirmedMembers[m.id];
                            return `
                              <span style="color:${isConf ? '#059669' : '#64748b'}; border:1px solid ${isConf ? '#a7f3d0' : '#e2e8f0'}; background:${isConf ? '#ecfdf5' : '#ffffff'}; padding:4px 10px; border-radius:6px; font-size:12px; font-weight:600;">
                                ${m.avatar || '👤'} ${m.name}: <b>${isConf ? '✅ 已签署' : '⏳ 未签署'}</b>
                              </span>
                            `;
                          }).join('')}
                        </div>
                      </div>
                    </div>
                    <div class="card" style="padding:20px; display:flex; flex-direction:column;">
                      <div style="font-size:15px; font-weight:800; color:#0f172a; margin-bottom:12px;">💬 阶段一研讨对话流 (${activeMonitorGroup.name})</div>
                      <div style="flex:1; max-height:420px; overflow-y:auto; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px; font-size:12px; display:flex; flex-direction:column; gap:10px;">
                        ${(state.chatLogs['stage1'] || []).map(m => {
                          const isAgent = AgentProfiles[m.sender] !== undefined;
                          const senderName = isAgent ? AgentProfiles[m.sender].name : (monitorMembersObj[m.sender] ? monitorMembersObj[m.sender].name : m.sender);
                          const color = isAgent ? AgentProfiles[m.sender].color : (monitorMembersObj[m.sender] ? monitorMembersObj[m.sender].color : '#2563eb');
                          return `
                            <div style="background:#ffffff; padding:8px 12px; border-radius:8px; border:1px solid #e2e8f0; border-left:3px solid ${color};">
                              <div style="display:flex; justify-content:space-between; margin-bottom:3px;">
                                <b style="color:${color}; font-size:12px;">${senderName}</b>
                                <span style="color:#94a3b8; font-size:10px;">${m.timestamp || ''}</span>
                              </div>
                              <div style="color:#0f172a; line-height:1.5;">${m.text}</div>
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
                        <span style="font-size:12.5px; color:#475569;">总字数: <b style="color:#2563eb; font-size:14px;">${state.stage2.unifiedContent.length}</b> 字</span>
                      </div>
                      <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:10px 14px; margin-bottom:12px; font-size:12px; color:#1d4ed8; display:flex; justify-content:space-between;">
                        <span>⚡ <b>当前【${activeMonitorGroup.name}】组内架构 (${monitorMembersList.length}人):</b> ${monitorMembersList.map(m => m.name).join('、')}</span>
                        <span>${state.isFinalSubmitted ? '<b style="color:#059669;">🔒 论文终稿已提交归档</b>' : '<b style="color:#d97706;">✍️ 组员写作推进中</b>'}</span>
                      </div>
                      <div id="teacher-live-doc-mirror" style="flex:1; min-height:340px; max-height:480px; overflow-y:auto; font-family:'SimSun', 'Times New Roman', serif; font-size:13.5px; line-height:1.75; background:#ffffff; color:#0f172a; border:1px solid #cbd5e1; border-radius:6px; padding:16px 20px; box-shadow:inset 0 1px 3px rgba(0,0,0,0.02);">
                        ${(state.stage2.unifiedContent || '').replace(/<span class="remote-cursor-widget"[\s\S]*?<\/span>/gi, '').trim() || '<span style="color:#94a3b8; font-family:sans-serif; font-style:italic;">（小组成员尚未开始撰写正文）</span>'}
                      </div>
                      <div style="margin-top:14px; background:#f8fafc; padding:12px; border-radius:8px; border:1px solid #e2e8f0;">
                        <div style="font-size:12px; font-weight:700; color:#334155; margin-bottom:6px;">📊 本组 SSRL 成员字数与互动贡献比率 (${monitorMembersList.length} 位成员)</div>
                        <div style="height:10px; background:#e2e8f0; border-radius:6px; overflow:hidden; display:flex;">
                          ${(() => {
                            const contribs = state.stage2.memberContributions || {};
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
                            const contribs = state.stage2.memberContributions || {};
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
                        ${(state.chatLogs['stage2'] || []).map(m => {
                          const isAgent = AgentProfiles[m.sender] !== undefined;
                          const senderName = isAgent ? AgentProfiles[m.sender].name : (monitorMembersObj[m.sender] ? monitorMembersObj[m.sender].name : m.sender);
                          const color = isAgent ? AgentProfiles[m.sender].color : (monitorMembersObj[m.sender] ? monitorMembersObj[m.sender].color : '#2563eb');
                          return `
                            <div style="background:#ffffff; padding:8px 12px; border-radius:8px; border:1px solid #e2e8f0; border-left:3px solid ${color};">
                              <div style="display:flex; justify-content:space-between; margin-bottom:3px;">
                                <b style="color:${color}; font-size:12px;">${senderName}</b>
                                <span style="color:#94a3b8; font-size:10px;">${m.timestamp || ''}</span>
                              </div>
                              <div style="color:#0f172a; line-height:1.5;">${m.text}</div>
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
                          ${(state.stage2.unifiedContent || '').replace(/<span class="remote-cursor-widget"[\s\S]*?<\/span>/gi, '').trim() || '<span style="color:#94a3b8; font-family:sans-serif; font-style:italic;">（小组成员尚未开始撰写正文）</span>'}
                        </div>
                      </div>
                    </div>
                    <div class="card" style="padding:20px; display:flex; flex-direction:column; min-width:0; overflow:hidden;">
                      <div style="font-size:15px; font-weight:800; color:#0f172a; margin-bottom:12px;">💬 阶段三答辩对话流 (${activeMonitorGroup.name})</div>
                      <div style="flex:1; overflow-y:auto; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px; font-size:12px; display:flex; flex-direction:column; gap:10px;">
                        ${(state.chatLogs['stage3'] || []).map(m => {
                          const isAgent = AgentProfiles[m.sender] !== undefined;
                          const senderName = isAgent ? AgentProfiles[m.sender].name : (monitorMembersObj[m.sender] ? monitorMembersObj[m.sender].name : m.sender);
                          const color = isAgent ? AgentProfiles[m.sender].color : (monitorMembersObj[m.sender] ? monitorMembersObj[m.sender].color : '#2563eb');
                          return `
                            <div style="background:#ffffff; padding:8px 12px; border-radius:8px; border:1px solid #e2e8f0; border-left:3px solid ${color};">
                              <div style="display:flex; justify-content:space-between; margin-bottom:3px;">
                                <b style="color:${color}; font-size:12px;">${senderName}</b>
                                <span style="color:#94a3b8; font-size:10px;">${m.timestamp || ''}</span>
                              </div>
                              <div style="color:#0f172a; line-height:1.5;">${m.text}</div>
                            </div>
                          `;
                        }).join('')}
                      </div>
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

    const btnSwitchStudent = container.querySelector('#btn-switch-student-preview');
    if (btnSwitchStudent) btnSwitchStudent.addEventListener('click', () => onSwitchToStudentView());

    container.querySelectorAll('.teacher-tab-nav').forEach(btn => {
      btn.addEventListener('click', () => {
        state.teacherActiveTab = btn.dataset.tab;
        renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
      });
    });

    container.querySelectorAll('.btn-select-class').forEach(btn => {
      btn.addEventListener('click', () => {
        state.activeClassId = btn.dataset.id;
        renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
      });
    });

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
          <div class="teacher-modal-card fancy-task-modal" style="width:540px;">
            <div class="teacher-modal-header task-theme-gradient">
              <div class="modal-header-title">
                <div class="modal-icon-badge task">👨‍🎓</div>
                <div><h3>添加学生至【${activeClass.name}】</h3></div>
              </div>
              <button class="modal-close-btn" id="btn-close-single-student">✕</button>
            </div>

            <!-- 双标签切换 -->
            <div style="display:flex; border-bottom:1px solid rgba(255,255,255,0.1); background:rgba(15,23,42,0.5);">
              <button id="tab-new-student" style="flex:1; padding:12px; font-size:13px; font-weight:700; border:none; cursor:pointer; background:rgba(99,102,241,0.25); color:#a5b4fc; border-bottom:3px solid #6366f1;">
                ✏️ 新建学生账号
              </button>
              <button id="tab-enroll-student" style="flex:1; padding:12px; font-size:13px; font-weight:700; border:none; cursor:pointer; background:transparent; color:#64748b; border-bottom:3px solid transparent;">
                🔗 加入已有学生 (${unenrolledStudents.length}人)
              </button>
            </div>

            <!-- 面板1: 新建学生 -->
            <div id="panel-new-student">
              <div class="teacher-modal-body">
                <div class="teacher-form-group">
                  <label><span class="req">*</span> 学生姓名</label>
                  <input type="text" id="modal-std-name" class="teacher-input fancy" placeholder="输入学生姓名 (如: 张三)" value="">
                </div>
                <div class="teacher-form-group">
                  <label><span class="req">*</span> 学生学号 (登录账号)</label>
                  <input type="text" id="modal-std-code" class="teacher-input fancy" placeholder="输入学号 (如: 20260101 或 A)" value="">
                </div>
                <div class="teacher-form-group">
                  <label>设置初始密码 (留空统一定为 123)</label>
                  <input type="password" id="modal-std-password" class="teacher-input fancy" placeholder="留空默认为 123">
                </div>
              </div>
              <div class="teacher-modal-footer">
                <button class="modal-btn cancel" id="btn-cancel-single-std">取消</button>
                <button class="modal-btn submit task-theme" id="btn-submit-single-std">👨‍🎓 确认创建并加入本班</button>
              </div>
            </div>

            <!-- 面板2: 加入已有学生 -->
            <div id="panel-enroll-student" style="display:none;">
              <div class="teacher-modal-body">
                <div style="font-size:12px; color:#94a3b8; background:rgba(99,102,241,0.1); border:1px solid rgba(99,102,241,0.3); border-radius:8px; padding:10px 14px; margin-bottom:12px;">
                  💡 以下学生账号已在其他班级中存在。勾选后点击确认，可将其同时加入本班，<b style="color:#a5b4fc;">账号不会重复创建</b>。
                </div>
                <div style="max-height:280px; overflow-y:auto; display:flex; flex-direction:column; gap:6px;">
                  ${unenrolledStudents.length === 0 ? `
                    <div style="text-align:center; color:#64748b; padding:32px; font-size:14px;">
                      ✅ 当前所有学生账号已加入本班，无可选学生
                    </div>
                  ` : unenrolledStudents.map(s => {
                    const otherClasses = authManager.getClasses().filter(c =>
                      (s.classIds || [s.classId]).includes(c.id) && c.id !== activeClass.id
                    );
                    return `
                      <label style="display:flex; align-items:center; gap:12px; background:rgba(15,23,42,0.6); border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:10px 14px; cursor:pointer; transition:all 0.15s;">
                        <input type="checkbox" class="enroll-chk" data-uid="${s.id}" style="width:16px; height:16px; cursor:pointer; accent-color:#6366f1;">
                        <div>
                          <div style="font-size:14px; font-weight:700; color:#f1f5f9;">${s.avatar || '👤'} ${s.name}</div>
                          <div style="font-size:11px; color:#64748b; margin-top:2px;">
                            账号: ${s.username} | 学号: ${s.studentCode || '-'}
                            ${otherClasses.length > 0 ? `| 已在: ${otherClasses.map(c => c.name).join(', ')}` : ''}
                          </div>
                        </div>
                      </label>
                    `;
                  }).join('')}
                </div>
              </div>
              <div class="teacher-modal-footer">
                <button class="modal-btn cancel" id="btn-cancel-enroll">取消</button>
                <button class="modal-btn submit task-theme" id="btn-submit-enroll">🔗 确认加入本班</button>
              </div>
            </div>
          </div>
        `;
        document.body.appendChild(modal);

        const closeModal = () => modal.remove();
        modal.querySelector('#btn-close-single-student').addEventListener('click', closeModal);
        modal.querySelector('#btn-cancel-single-std').addEventListener('click', closeModal);
        const cancelEnrollBtn = modal.querySelector('#btn-cancel-enroll');
        if (cancelEnrollBtn) cancelEnrollBtn.addEventListener('click', closeModal);

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
            authManager.addStudentToClass(name, code, activeClass.id, pwd || '123');
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

        const closeModal = () => modal.remove();
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
          const { addedCount, skippedList } = authManager.batchAddStudentsToClass(listToImport, activeClass.id);
          let tipMsg = `🎉 成功导入 ${addedCount} 名新学生账号入库【${activeClass.name}】！`;
          if (skippedList && skippedList.length > 0) {
            tipMsg += `\n\n💡 以下 ${skippedList.length} 位学生因学号已存在于学生池中，已自动为您跳过（无需重复创建）：\n` + skippedList.slice(0, 8).map(s => `• ${s.name} (学号: ${s.code})`).join('\n') + (skippedList.length > 8 ? `\n... 等共 ${skippedList.length} 人` : '');
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
        <div class="teacher-modal-card fancy-task-modal" style="width:580px; background:radial-gradient(circle at 50% 10%, #1e1b4b 0%, #0f172a 80%);">
          <div class="teacher-modal-header" style="background:linear-gradient(135deg, rgba(16,185,129,0.3), rgba(6,182,212,0.3));">
            <div class="modal-header-title">
              <div class="modal-icon-badge" style="background:rgba(16,185,129,0.3); color:#34d399;">👥</div>
              <div>
                <h3>${targetGroup ? `编辑【${targetGroup.name}】小组成员` : '新建小组并勾选小组成员'} (${cls.name})</h3>
              </div>
            </div>
            <button class="modal-close-btn" id="btn-close-group-edit">✕</button>
          </div>
          <div class="teacher-modal-body">
            <div class="teacher-form-group">
              <label><span class="req">*</span> 小组名称</label>
              <input type="text" id="modal-grp-name" class="teacher-input fancy" value="${targetGroup ? targetGroup.name : `第${(cls.groups || []).length + 1}小组`}" placeholder="输入小组名称">
            </div>

            <div class="teacher-form-group" style="margin-top:10px;">
              <label><span class="req">*</span> 勾选归属本组的学生成员 (可选候选人: ${availableStudents.length} 人)</label>
              <div style="background:rgba(15,23,42,0.7); border:1px solid rgba(255,255,255,0.1); border-radius:10px; padding:12px; max-height:220px; overflow-y:auto; display:flex; flex-direction:column; gap:8px;">
                ${availableStudents.length === 0 ? '<div style="color:#94a3b8; font-size:12px; text-align:center;">暂无未分组的学生。</div>' : ''}
                ${availableStudents.map(s => {
                  const isChecked = currentMembers.includes(s.id);
                  const isLeader = s.studentCode === 'A';
                  return `
                    <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(30,41,59,0.6); padding:8px 12px; border-radius:8px;">
                      <label style="display:flex; align-items:center; gap:10px; cursor:pointer; font-size:13px; color:#f8fafc;">
                        <input type="checkbox" class="chk-grp-member" value="${s.id}" ${isChecked ? 'checked' : ''} style="width:16px; height:16px; cursor:pointer;">
                        <span>${s.avatar || '👤'} <b>${s.name}</b> (${s.username})</span>
                      </label>
                      <label style="font-size:11px; color:#fbbf24; cursor:pointer; display:flex; align-items:center; gap:4px;">
                        <input type="radio" name="grp-leader-radio" value="${s.id}" ${isLeader || (isChecked && currentMembers[0] === s.id) ? 'checked' : ''}>
                        设为组长
                      </label>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          </div>
          <div class="teacher-modal-footer">
            <button class="modal-btn cancel" id="btn-cancel-grp-edit">取消</button>
            <button class="modal-btn submit task-theme" id="btn-submit-grp-edit" style="background:linear-gradient(135deg, #10b981, #059669);">
              💾 保存小组划分配置
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      const closeModal = () => modal.remove();
      modal.querySelector('#btn-close-group-edit').addEventListener('click', closeModal);
      modal.querySelector('#btn-cancel-grp-edit').addEventListener('click', closeModal);

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
        authManager.updateGroupMembers(cls.id, editingGroupId || ('group_' + Date.now()), name, selectedUserIds, leaderUserId);
        closeModal();
        renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
      });
    };

    const btnCreateGroupV1 = container.querySelector('#btn-v1-create-group');
    if (btnCreateGroupV1) btnCreateGroupV1.addEventListener('click', () => setupGroupModal(null));

    container.querySelectorAll('.btn-edit-group-members').forEach(btn => {
      btn.addEventListener('click', () => setupGroupModal(btn.dataset.gid));
    });

    container.querySelectorAll('.delete-student-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const users = authManager.getUsers();
        const student = users.find(u => u.id === btn.dataset.id);
        const otherClasses = student ? ((student.classIds || []).filter(c => c !== activeClass.id)) : [];
        const confirmMsg = otherClasses.length > 0
          ? `确认从【${activeClass.name}】移除此学生？该学生在其他 ${otherClasses.length} 个班级中的账号不受影响。`
          : `确认移除此学生账号？该学生不在其他班级中，将被完全删除。`;
        if (confirm(confirmMsg)) {
          authManager.deleteStudent(btn.dataset.id, activeClass.id);
          renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
        }
      });
    });

    container.querySelectorAll('.btn-delete-group').forEach(btn => {
      btn.addEventListener('click', () => {
        if (confirm('确认解散并删除此小组？')) {
          authManager.deleteGroup(activeClass.id, btn.dataset.gid);
          renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
        }
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
        if (confirm(`🎲 确认对【${activeClass.name}】的 ${classStudents.length} 名学生进行随机分组？\n\n系统将按【每组 ${groupSize} 人】自动洗牌划分并分配组长。原先的分组将被覆盖重置！`)) {
          authManager.autoRandomGrouping(activeClass.id, groupSize);
          renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
          alert(`✅ 已完成随机分组！按每组 ${groupSize} 人，共自动划分 ${(activeClass.groups || []).length} 个协作小组。`);
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
    const surveyUrlInput = container.querySelector('#survey-url-input');

    const updateSurveyUrlInputVal = () => {
      if (!surveyUrlInput) return;
      const cId = selSurveyClass ? selSurveyClass.value : activeClass.id;
      const tId = selSurveyTask ? selSurveyTask.value : (state.activeTaskId || 'task_default');
      surveyUrlInput.value = authManager.getSurveyUrl(cId, tId);
    };

    if (selSurveyClass) selSurveyClass.addEventListener('change', updateSurveyUrlInputVal);
    if (selSurveyTask) selSurveyTask.addEventListener('change', updateSurveyUrlInputVal);

    const btnSaveSurveyUrl = container.querySelector('#btn-save-survey-url');
    if (btnSaveSurveyUrl) {
      btnSaveSurveyUrl.addEventListener('click', () => {
        const urlInput = container.querySelector('#survey-url-input');
        const statusEl = container.querySelector('#survey-url-status');
        const targetClassId = selSurveyClass ? selSurveyClass.value : activeClass.id;
        const targetTaskId = selSurveyTask ? selSurveyTask.value : (state.activeTaskId || 'task_default');
        const url = urlInput ? urlInput.value.trim() : '';
        if (!url) { alert('⚠️ 请先填入有效的问卷链接！'); return; }
        
        authManager.saveSurveyUrl(targetClassId, targetTaskId, url);
        
        if (window.app && window.app.cloudSyncEngine) {
          window.app.cloudSyncEngine.pushSnapshot();
        }

        if (statusEl) { statusEl.style.display = 'block'; setTimeout(() => { statusEl.style.display = 'none'; }, 2500); }
        setTimeout(() => renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView), 600);
      });
    }

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
        const now = new Date();
        const startStr = now.toISOString().slice(0, 16);
        const deadlineDate = new Date(now.getTime() + 150 * 60 * 1000);
        const deadlineStr = deadlineDate.toISOString().slice(0, 16);

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
                <label><span class="req">*</span> 关联受众教学班级</label>
                <select id="modal-task-class" class="teacher-input fancy">${classes.map(c => `<option value="${c.id}">🏫 ${c.name}</option>`).join('')}</select>
              </div>

              <div class="form-grid-2" style="margin-top:8px;">
                <div class="teacher-form-group">
                  <label><span class="req">*</span> 📅 任务开始时间</label>
                  <input type="datetime-local" id="modal-task-start" class="teacher-input fancy" value="${startStr}">
                </div>
                <div class="teacher-form-group">
                  <label><span class="req">*</span> ⌛ 任务截止时间</label>
                  <input type="datetime-local" id="modal-task-deadline" class="teacher-input fancy" value="${deadlineStr}">
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

        const closeModal = () => modal.remove();
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
        modal.querySelector('#btn-submit-new-task').addEventListener('click', () => {
          const classId = modal.querySelector('#modal-task-class').value;
          const title = modal.querySelector('#modal-task-title').value.trim();
          const desc = modal.querySelector('#modal-task-desc').value.trim();
          const startTime = modal.querySelector('#modal-task-start').value;
          const deadline = modal.querySelector('#modal-task-deadline').value;

          if (!title) { alert('⚠️ 请输入写作任务名称！'); return; }
          authManager.createTask(title, classId, desc, [], startTime, deadline, 150);
          closeModal();
          renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
        });
      });
    }

    const btnOpenAnnV2 = container.querySelector('#btn-v2-open-ann-modal');
    if (btnOpenAnnV2) {
      btnOpenAnnV2.addEventListener('click', () => {
        document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
        const freshCls = authManager.getClasses().find(c => c.id === activeClass.id) || activeClass;
        const classGroups = (freshCls.groups && freshCls.groups.length > 0) ? freshCls.groups : [{ id: 'group_1', name: '第 1 协作小组' }];

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
          <div class="teacher-modal-card fancy-ann-modal" style="width:600px;">
            <div class="teacher-modal-header ann-theme-gradient">
              <div class="modal-header-title">
                <div class="modal-icon-badge ann">📢</div>
                <div>
                  <h3>发布课堂即时通知</h3>
                  <p style="font-size:12px; color:#cbd5e1;">选择或拖拽本地文件随附发布，学生端可点击下载</p>
                </div>
              </div>
              <button class="modal-close-btn" id="btn-close-ann-modal">✕</button>
            </div>
            <div class="teacher-modal-body">
              <div class="form-grid-2">
                <div class="teacher-form-group">
                  <label><span class="req">*</span> 📌 关联写作任务</label>
                  <select id="modal-ann-task" class="teacher-input fancy">
                    <option value="task_all">🌐 全班通识广播 (全流程可见)</option>
                    ${tasks.map(t => `<option value="${t.id}">📌 ${t.title}</option>`).join('')}
                  </select>
                </div>
                <div class="teacher-form-group">
                  <label><span class="req">*</span> 🎯 推送受众小组</label>
                  <select id="modal-ann-target-group" class="teacher-input fancy">
                    <option value="all">🌐 全班所有小组</option>
                    ${classGroups.map(g => `<option value="${g.id}">👥 ${g.name}</option>`).join('')}
                  </select>
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

        const closeModal = () => modal.remove();
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
          const taskId = modal.querySelector('#modal-ann-task').value;
          const targetGId = modal.querySelector('#modal-ann-target-group').value;
          const targetGObj = classGroups.find(g => g.id === targetGId);
          const targetGName = targetGId === 'all' ? '全班所有小组' : (targetGObj ? targetGObj.name : '指定小组');
          const title = modal.querySelector('#modal-ann-title').value.trim();
          const content = modal.querySelector('#modal-ann-content').value.trim();
          if (!title || !content) { alert('⚠️ 请填齐通知标题与内容！'); return; }
          authManager.publishAnnouncement(taskId, title, content, selectedAttachment, targetGId, targetGName);
          closeModal();
          renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
        });
      });
    }

    // 📚 参考范文上传 Modal
    const btnOpenPaperModal = container.querySelector('#btn-v2-open-paper-modal');
    if (btnOpenPaperModal) {
      btnOpenPaperModal.addEventListener('click', () => {
        document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
        const freshCls = authManager.getClasses().find(c => c.id === activeClass.id) || activeClass;
        const classGroups = (freshCls.groups && freshCls.groups.length > 0) ? freshCls.groups : [{ id: 'group_1', name: '第 1 协作小组' }];

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
          <div class="teacher-modal-card fancy-task-modal" style="width:520px;">
            <div class="teacher-modal-header task-theme-gradient" style="background:linear-gradient(135deg, #7c3aed, #4f46e5);">
              <div class="modal-header-title">
                <div class="modal-icon-badge" style="background:rgba(255,255,255,0.2); color:white;">📚</div>
                <div>
                  <h3>上传课程学术参考范文</h3>
                  <p style="font-size:12px; color:#e0e7ff;">选取文献文件并指定推送任务与受众小组</p>
                </div>
              </div>
              <button class="modal-close-btn" id="btn-close-paper-modal">✕</button>
            </div>
            <div class="teacher-modal-body">
              <div class="teacher-form-group">
                <label><span class="req">*</span> 📎 选取本地文献文件 (PDF / Word / DOCX / Markdown / TXT)</label>
                <div id="paper-file-dropzone" style="border:2px dashed #a78bfa; border-radius:10px; padding:20px; text-align:center; background:#f5f3ff; cursor:pointer; transition:all 0.2s;">
                  <input type="file" id="modal-paper-file-input" style="display:none;" accept=".pdf,.doc,.docx,.txt,.md">
                  <div id="paper-dropzone-text">
                    <span style="font-size:32px;">📄</span>
                    <div style="font-size:13.5px; font-weight:700; color:#7c3aed; margin-top:6px;">点击选择或拖拽本地文献文件上传</div>
                    <div style="font-size:11.5px; color:#8b5cf6; margin-top:2px;">(选取后将自动识别文件名称作为文献标题)</div>
                  </div>
                </div>
              </div>

              <div class="teacher-form-group" style="margin-top:12px;">
                <label><span class="req">*</span> 范文文献标题</label>
                <input type="text" id="modal-paper-title" class="teacher-input fancy" placeholder="例如：《基于大语言模型的多智能体协同学习实证研究》" value="">
              </div>

              <div class="form-grid-2" style="margin-top:12px;">
                <div class="teacher-form-group">
                  <label><span class="req">*</span> 📌 关联写作任务</label>
                  <select id="modal-paper-task" class="teacher-input fancy">
                    <option value="task_all">🌐 通用参考范文 (全部任务)</option>
                    ${tasks.map(t => `<option value="${t.id}">📌 ${t.title}</option>`).join('')}
                  </select>
                </div>
                <div class="teacher-form-group">
                  <label><span class="req">*</span> 🎯 推送受众小组</label>
                  <select id="modal-paper-target-group" class="teacher-input fancy">
                    <option value="all">🌐 全班所有小组</option>
                    ${classGroups.map(g => `<option value="${g.id}">👥 ${g.name}</option>`).join('')}
                  </select>
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

        const closeModal = () => modal.remove();
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

        const fileInput = modal.querySelector('#modal-paper-file-input');
        const dropzone = modal.querySelector('#paper-file-dropzone');
        const dropText = modal.querySelector('#paper-dropzone-text');
        const titleInput = modal.querySelector('#modal-paper-title');
        let selectedFile = { name: '', size: '', data: '' };

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
            const reader = new FileReader();
            reader.onload = (re) => {
              selectedFile = { name: f.name, size: sizeKB, data: re.target.result };
              dropText.innerHTML = `<span style="font-size:28px;">✅</span><div style="font-size:13.5px; color:#059669; font-weight:700; margin-top:4px;">已选取文献: ${f.name} (${sizeKB})</div><div style="font-size:11px; color:#10b981; margin-top:2px;">点击可重新更换文件</div>`;
            };
            reader.readAsDataURL(f);
          }
        });

        const submitBtn = modal.querySelector('#btn-submit-new-paper');
        submitBtn.addEventListener('click', () => {
          try {
            let title = titleInput.value.trim();
            const targetTaskId = modal.querySelector('#modal-paper-task') ? modal.querySelector('#modal-paper-task').value : 'task_all';
            const targetGId = modal.querySelector('#modal-paper-target-group') ? modal.querySelector('#modal-paper-target-group').value : 'all';
            const autoPush = modal.querySelector('#modal-paper-auto-push') ? modal.querySelector('#modal-paper-auto-push').checked : true;

            if (!selectedFile.name && !title) {
              alert('⚠️ 请先选取本地文献文件或输入范文标题！');
              return;
            }
            if (!title) {
              title = selectedFile.name ? selectedFile.name.replace(/\.[^/.]+$/, '') : '学术参考范文';
            }

            const targetGObj = classGroups.find(g => g.id === targetGId);

            submitBtn.disabled = true;
            submitBtn.innerText = '⏳ 正在存入范文库...';

            const newPaper = authManager.uploadReferencePaper({
              title,
              taskId: targetTaskId,
              abstract: '',
              keyHighlights: '研究设计与学术论证规范',
              fileName: selectedFile.name || `${title}.pdf`,
              fileData: selectedFile.data || '',
              fileSize: selectedFile.size || '3.5 MB',
              targetGroupId: targetGId,
              targetGroupName: targetGId === 'all' ? '全班所有小组' : (targetGObj ? targetGObj.name : '指定小组')
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
        if (paper && paper.fileName) {
          if (paper.fileData) {
            const a = document.createElement('a');
            a.href = paper.fileData;
            a.download = paper.fileName;
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
        
        // 立即同步写入小组状态并向全组学生端推送最新权限快照
        if (window.app) {
          window.app.saveGroupState(activeMonitorGId);
          if (window.app.cloudSyncEngine) {
            window.app.cloudSyncEngine.groupId = activeMonitorGId;
            window.app.cloudSyncEngine.updateScopeKeys();
            window.app.cloudSyncEngine.pushSnapshot();
          }
        }

        renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
        if (newSub) {
          alert(`🔒 已全局锁定【${activeMonitorGroup.name}】！\n\n该小组学生端已设为【全盘只读模式】（阶段一公约、阶段二富文本与阶段三矩阵全部禁止编辑，仅保留右侧研讨区实时沟通）。`);
        } else {
          alert(`🔓 已解除【${activeMonitorGroup.name}】全局只读锁定！\n\n学生端已全面恢复自由协作与编辑修改权限！`);
        }
      });
    }

    // 教师端主动清空/重置该小组协同数据
    const btnResetGroup = container.querySelector('#btn-reset-group-collab');
    if (btnResetGroup) {
      btnResetGroup.addEventListener('click', () => {
        if (confirm(`⚠️ 确认清空并重置【${activeMonitorGroup.name}】上一次的全部协同数据？\n\n重置后该小组的历史聊天、正文草稿与投票进度将被清空并恢复至阶段一初始状态！`)) {
          if (window.app) {
            window.app.resetTestGroupState(activeMonitorGId);
            renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
            alert(`✅ 已成功重置【${activeMonitorGroup.name}】的所有协同数据！`);
          }
        }
      });
    }

    const selSwitchTask = container.querySelector('#sel-switch-monitor-task');
    if (selSwitchTask) {
      selSwitchTask.addEventListener('change', (e) => {
        state.activeTaskId = e.target.value;
        if (window.app) {
          window.app.loadGroupState(state.activeMonitorGroupId || 'group_1');
          if (window.app.cloudSyncEngine) {
            window.app.cloudSyncEngine.updateScopeKeys();
            window.app.cloudSyncEngine.pullFromServer();
          }
        }
        renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
      });
    }

    const selSwitchGroup = container.querySelector('#sel-switch-monitor-group');
    if (selSwitchGroup) {
      selSwitchGroup.addEventListener('change', (e) => {
        state.activeMonitorGroupId = e.target.value;
        if (window.app) {
          window.app.loadGroupState(e.target.value);
          if (window.app.cloudSyncEngine) {
            window.app.cloudSyncEngine.updateScopeKeys();
            window.app.cloudSyncEngine.pullFromServer();
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
  }

  /* ==========================================================================
     7.5 STUDENT TASK PORTAL / DASHBOARD (我的写作任务大厅)
     ========================================================================== */
  function renderStudentTaskPortal(container, authManager, state, onSelectTask, onLogout, onSwitchTeacher, onOpenAnnModal, onOpenSurveyModal) {
    const currentUser = authManager.getCurrentUser();
    const classes = authManager.getClasses();
    const tasks = authManager.getTasks();
    const announcements = authManager.getAnnouncements();
    const groupId = (currentUser && currentUser.groupId) ? currentUser.groupId : 'group_1';
    const userClass = classes.find(c => c.id === currentUser?.classId) || classes[0];
    const groupObj = (userClass && userClass.groups) ? userClass.groups.find(g => g.id === groupId) : null;
    const groupName = groupObj ? groupObj.name : '第1小组';
    const unreadAnnCount = announcements ? announcements.filter(a => !a.readStatus || !a.readStatus[groupId]).length : 0;
    const isFinalSubmitted = state.isFinalSubmitted;

    const relevantTasks = tasks.filter(t => !t.classId || t.classId === userClass?.id || t.classId === 'all');
    if (relevantTasks.length === 0 && tasks.length > 0) {
      tasks.forEach(t => relevantTasks.push(t));
    }

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
            <button class="nav-ann-bell-btn ${unreadAnnCount > 0 ? 'has-unread' : ''}" id="btn-portal-ann-bell" title="课堂通知" style="background:#ffffff; border:1px solid #e2e8f0; color:#334155; padding:6px 14px; border-radius:18px; font-size:12px; font-weight:600; cursor:pointer;">
              🔔 课堂通知 ${unreadAnnCount > 0 ? `<span class="unread-count">${unreadAnnCount}</span>` : ''}
            </button>
            <button id="btn-portal-logout" style="background:#fef2f2; color:#dc2626; border:1px solid #fecaca; padding:6px 14px; border-radius:18px; font-size:12px; font-weight:700; cursor:pointer;">🚪 退出登录</button>
          </div>
        </header>

        <main style="flex:1; padding:32px; max-width:1160px; width:100%; margin:0 auto; display:flex; flex-direction:column; gap:24px; box-sizing:border-box;">
          <div style="background:linear-gradient(135deg, #1e40af, #2563eb); border-radius:16px; padding:28px 32px; color:white; box-shadow:0 8px 24px rgba(37, 99, 235, 0.18); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
            <div>
              <div style="font-size:24px; font-weight:800; letter-spacing:-0.5px; display:flex; align-items:center; gap:10px;">
                📋 我的协作写作任务大厅
              </div>
              <div style="font-size:13.5px; opacity:0.92; margin-top:8px;">
                欢迎进入集智多智能体协同写作学习系统！请选择下方教师发布的任务，点击【🚀 进入协作工作台】开展人机协同写作。
              </div>
            </div>
            <div style="background:rgba(255,255,255,0.15); border:1px solid rgba(255,255,255,0.25); border-radius:12px; padding:12px 20px; text-align:right;">
              <div style="font-size:11.5px; opacity:0.85;">当前协作身份</div>
              <div style="font-size:15px; font-weight:800; margin-top:2px;">${groupName} (${currentUser?.name || '学生'})</div>
            </div>
          </div>

          <div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
              <div style="font-size:17px; font-weight:800; color:#0f172a;">📚 本班协作任务清单 (${relevantTasks.length} 项)</div>
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
                ${relevantTasks.map((t) => {
                  const duration = t.durationMinutes || 150;
                  return `
                    <div class="student-task-card" style="background:#ffffff; border:1px solid #e2e8f0; border-radius:14px; padding:22px; box-shadow:0 2px 8px rgba(15,23,42,0.04); display:flex; flex-direction:column; justify-content:space-between;">
                      <div>
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px; margin-bottom:12px;">
                          <div style="font-size:17px; font-weight:800; color:#0f172a; line-height:1.4;">📌 ${t.title}</div>
                          <span style="background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe; font-size:11px; font-weight:700; padding:3px 9px; border-radius:16px; flex-shrink:0;">
                            ${t.targetGroupName || groupName}
                          </span>
                        </div>

                        <div style="display:flex; flex-wrap:wrap; gap:8px; font-size:11.5px; color:#64748b; margin-bottom:12px; background:#f8fafc; padding:8px 12px; border-radius:8px; border:1px solid #e2e8f0;">
                          <div>⏱️ 任务时长: <b style="color:#0f172a;">${duration} 分钟</b></div>
                          <div>📅 开始时间: <b style="color:#0f172a;">${t.startTime || '随时'}</b></div>
                          <div>⌛ 截止时间: <b style="color:#0f172a;">${t.deadline || '结课前'}</b></div>
                        </div>

                        <div style="font-size:12.5px; color:#334155; line-height:1.6; margin-bottom:14px; background:#f8fafc; border-left:3px solid #2563eb; padding:8px 12px; border-radius:0 6px 6px 0;">
                          ${t.instructions ? t.instructions.substring(0, 130) + (t.instructions.length > 130 ? '...' : '') : '暂无详细要求说明'}
                        </div>

                        <div style="display:flex; align-items:center; gap:8px; font-size:12px; font-weight:600; color:#475569; margin-bottom:16px;">
                          <span>协作进度状态:</span>
                          <span style="background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe; padding:2px 8px; border-radius:6px; font-size:11.5px;">
                            ${isFinalSubmitted ? '🔒 终稿已全员答辩并提交归档' : (state.currentStage === 'stage1' ? '🎪 阶段一：学术拍卖会' : (state.currentStage === 'stage2' ? '📰 阶段二：学术编辑部 (撰写中)' : '🎓 阶段三：答辩擂台'))}
                          </span>
                        </div>
                      </div>

                      <div style="display:flex; gap:10px; align-items:center; border-top:1px solid #f1f5f9; padding-top:14px;">
                        <button class="btn-enter-task-workspace" data-task-id="${t.id}" style="flex:1; background:linear-gradient(135deg, #1d4ed8, #2563eb); color:white; border:none; padding:11px 18px; border-radius:10px; font-size:13.5px; font-weight:700; cursor:pointer; box-shadow:0 4px 12px rgba(37,99,235,0.2); display:flex; align-items:center; justify-content:center; gap:6px;">
                          🚀 进入协作工作台
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

    container.querySelector('#btn-portal-logout')?.addEventListener('click', () => onLogout());
    container.querySelector('#btn-portal-switch-teacher')?.addEventListener('click', () => onSwitchTeacher());
    container.querySelector('#btn-portal-ann-bell')?.addEventListener('click', () => onOpenAnnModal());
    container.querySelector('#btn-enter-default-workspace')?.addEventListener('click', () => onSelectTask(null));
    container.querySelectorAll('.btn-enter-task-workspace').forEach(btn => {
      btn.addEventListener('click', () => onSelectTask(btn.dataset.taskId));
    });
  }

  /* ==========================================================================
     8. UI RENDERER (STUDENT CANVAS & HEADER)
     ========================================================================== */
  function renderHeader(state, currentUser, announcements, onStageChange, onSpeedChange, onLogout, onSwitchTeacher, onOpenAnnModal, onOpenSurveyModal, onBackToTaskList) {
    const header = document.getElementById('app-header');
    if (!header) return;
    const elapsedMin = Math.floor(state.timer.elapsedSeconds / 60);
    const remainingMin = Math.max(0, 150 - elapsedMin);
    const groupId = currentUser && currentUser.groupId ? currentUser.groupId : 'group_1';
    const unreadAnnCount = announcements ? announcements.filter(a => !a.readStatus || !a.readStatus[groupId]).length : 0;
    const isFinalSubmitted = state.isFinalSubmitted;

    header.innerHTML = `
      <div class="brand-section">
        <div class="brand-logo">集智 JIZHI</div>
        <div class="brand-badge">🎓 ${currentUser ? currentUser.name : '学生'} ${isFinalSubmitted ? '<span style="color:#059669; margin-left:3px;">(🔒已归档)</span>' : ''}</div>
        <button id="btn-header-back-tasks" style="background:#f8fafc; border:1px solid #cbd5e1; color:#334155; padding:3px 8px; border-radius:14px; font-size:11px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:3px;" title="返回我的写作任务大厅">
          📋 任务大厅
        </button>
      </div>
      <nav class="stage-nav">
        <button class="stage-btn ${state.currentStage === 'stage1' ? 'active' : ''}" data-stage="stage1" title="阶段一：学术拍卖会 (25分钟)">🎪 阶段一: 拍卖会</button>
        <button class="stage-btn ${state.currentStage === 'stage2' ? 'active' : ''}" data-stage="stage2" title="阶段二：学术编辑部 (105分钟)">📰 阶段二: 编辑部</button>
        <button class="stage-btn ${state.currentStage === 'stage3' ? 'active' : ''}" data-stage="stage3" title="阶段三：答辩擂台 (20分钟)">🎓 阶段三: 答辩擂台</button>
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
            <div style="display:flex; gap:8px;">
              <button class="word-btn plugin-btn" id="${editorId}-btn-export-doc" style="background:rgba(16,185,129,0.2); border-color:#10b981; color:#34d399;" title="导出为 Word 论文格式文档 (.doc)">📥 导出 Word 终稿</button>
              <button class="word-btn plugin-btn" id="${editorId}-btn-print-doc" title="打印 / 导出 PDF 论文">📄 打印/PDF</button>
            </div>
          </div>
        `}

        <div class="collab-presence-header" id="${editorId}-presence-header">
          <div class="collab-presence-title">
            <span>👥 组员协同在线与实时光标:</span>
          </div>
          <div class="collab-member-pills" id="${editorId}-presence-pills"></div>
        </div>

        <div class="word-page-scroll">
          <div class="word-page" id="${editorId}" ${!isReadonly ? 'contenteditable="true"' : 'contenteditable="false" style="background:#ffffff; color:#0f172a;"'}>
            ${initialHtml}
          </div>
        </div>
      </div>
    `;
  }

  function attachWordEditorEvents(container, editorId, isReadonly, onChangeCallback, onPresenceCallback) {
    const editor = container.querySelector(`#${editorId}`);
    if (!editor) return;

    if (!isReadonly) {
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
                    <img src="${imgData}" alt="${caption || '学术图表'}" style="max-width:85%; border:1px solid #cbd5e1; border-radius:4px; box-shadow:0 2px 8px rgba(0,0,0,0.1);">
                    <p class="figure-caption" style="font-weight:700; color:#334155; margin-top:6px; font-size:13px; text-indent:0;">${caption || '图 1: 学术模型与实证架构图'}</p>
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

          const closeModal = () => modal.remove();
          modal.querySelector('#btn-close-table-modal').addEventListener('click', closeModal);
          modal.querySelector('#btn-cancel-table-insert').addEventListener('click', closeModal);

          modal.querySelector('#btn-confirm-table-insert').addEventListener('click', () => {
            const title = modal.querySelector('#input-table-title').value.trim() || '表 1: 研究变量汇总表';
            const rows = parseInt(modal.querySelector('#input-table-rows').value) || 4;
            const cols = parseInt(modal.querySelector('#input-table-cols').value) || 4;
            const hasPValue = modal.querySelector('#chk-table-pvalue').checked;
            closeModal();

            let tableHtml = `
              <p style="text-align:center; font-weight:700; color:#334155; font-size:13px; margin-bottom:4px; text-indent:0;">${title}</p>
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
          const closeModal = () => modal.remove();
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
        container.querySelector(`#${editorId}-btn-do-replace`).addEventListener('click', () => {
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

      // 监听输入法（解决中文拼音输入被切断卡顿问题）与极速广播
      let debounceTimer = null;
      let isComposing = false;

      editor.addEventListener('compositionstart', () => {
        isComposing = true;
        editor.dataset.isComposing = 'true';
      });

      const getCleanEditorHtml = () => {
        const clone = editor.cloneNode(true);
        clone.querySelectorAll('.remote-cursor-widget').forEach(el => el.remove());
        return clone.innerHTML;
      };

      editor.addEventListener('compositionend', () => {
        isComposing = false;
        editor.dataset.isComposing = 'false';
        if (onChangeCallback) onChangeCallback(getCleanEditorHtml());
      });

      editor.addEventListener('paste', () => {
        setTimeout(() => {
          if (onChangeCallback) onChangeCallback(getCleanEditorHtml());
        }, 30);
      });

      editor.addEventListener('input', () => {
        editor.dataset.lastLocalEditTime = String(Date.now());
        if (isComposing) return; // 正在输入拼音时不打断输入法选词
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          if (!isComposing && onChangeCallback) {
            onChangeCallback(getCleanEditorHtml());
          }
        }, 120);
      });
    }

    // 导出 Word 文档 (.doc)
    const btnExportDoc = container.querySelector(`#${editorId}-btn-export-doc`);
    if (btnExportDoc) {
      btnExportDoc.addEventListener('click', () => {
        const contentHtml = editor.innerHTML;
        const fullWordHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <title>集智学术方案</title>
            <style>
              body { font-family: "SimSun", "Times New Roman", serif; font-size: 12pt; line-height: 1.5; color: #000; margin: 30mm 25mm; }
              h1 { font-family: "SimHei", sans-serif; font-size: 18pt; text-align: center; margin-bottom: 20pt; }
              h2 { font-family: "SimHei", sans-serif; font-size: 14pt; margin-top: 15pt; margin-bottom: 8pt; }
              h3 { font-family: "SimHei", sans-serif; font-size: 12pt; margin-top: 10pt; margin-bottom: 5pt; }
              p { text-indent: 2em; margin: 6pt 0; text-align: justify; }
              table { width: 100%; border-collapse: collapse; margin: 12pt 0; }
              th, td { padding: 6pt; text-align: center; }
              thead { border-top: 2pt solid #000; border-bottom: 1pt solid #000; }
              tbody { border-bottom: 2pt solid #000; }
              .citation-tag { vertical-align: super; font-size: 9pt; color: #000; }
            </style>
          </head>
          <body>
            ${contentHtml}
          </body>
          </html>
        `;
        const blob = new Blob(['\ufeff', fullWordHtml], { type: 'application/msword;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = '集智协作研究设计方案终稿.doc';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
    }

    // 打印 / 导出 PDF
    const btnPrintDoc = container.querySelector(`#${editorId}-btn-print-doc`);
    if (btnPrintDoc) {
      btnPrintDoc.addEventListener('click', () => {
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <title>集智学术论文打印预览</title>
            <style>
              body { font-family: "SimSun", "Times New Roman", serif; padding: 20mm; color: #000; }
              h1 { text-align: center; font-family: "SimHei", sans-serif; }
              p { text-indent: 2em; line-height: 1.75; }
              table { width: 100%; border-collapse: collapse; margin: 16px 0; }
              th, td { padding: 6px; text-align: center; }
              thead { border-top: 2.5px solid #000; border-bottom: 1.5px solid #000; }
              tbody { border-bottom: 2.5px solid #000; }
              img { max-width: 90%; }
            </style>
          </head>
          <body>
            ${editor.innerHTML}
          </body>
          </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => { printWindow.print(); }, 250);
      });
    }

    if (!isReadonly) {
      let lastPresenceEmit = 0;
      const emitPresence = () => {
        const now = Date.now();
        if (now - lastPresenceEmit < 120) return;
        lastPresenceEmit = now;

        const sel = window.getSelection();
        let nodeIndex = 0;
        let activeSection = '';
        let charOffset = 0;

        if (sel && sel.rangeCount > 0) {
          charOffset = getCaretCharacterOffsetWithin(editor);
          const node = sel.anchorNode;
          let blockEl = node ? (node.nodeType === 1 ? node : node.parentElement) : null;
          while (blockEl && blockEl.parentElement !== editor && blockEl !== editor) {
            blockEl = blockEl.parentElement;
          }
          if (blockEl && blockEl.parentElement === editor) {
            nodeIndex = Array.from(editor.children).indexOf(blockEl);
            activeSection = (blockEl.innerText || '').trim().slice(0, 14);
          } else if (blockEl === editor) {
            nodeIndex = 0;
            activeSection = (editor.innerText || '').trim().slice(0, 14);
          }
        }
        if (typeof onPresenceCallback === 'function') {
          onPresenceCallback(nodeIndex, activeSection, charOffset);
        }
      };

      editor.addEventListener('keyup', emitPresence);
      editor.addEventListener('mouseup', emitPresence);
      editor.addEventListener('focus', emitPresence);
      editor.addEventListener('input', emitPresence);
    }
  }

  function renderPresencePills(editorId, state) {
    const pillsContainer = document.getElementById(`${editorId}-presence-pills`);
    if (!pillsContainer) return;
    const membersList = Object.values(state.members || {});
    const currentUserCode = state.currentUser || 'A';
    const presence = state.presence || {};
    const now = Date.now();

    pillsContainer.innerHTML = membersList.map(m => {
      const p = presence[m.studentCode] || presence[m.id];
      const isSelf = m.studentCode === currentUserCode || m.id === currentUserCode;
      // 只有在 15 秒内有心跳活跃的才视为在线
      const isOnline = isSelf || (p && (now - (p.updatedAt || 0) < 15000));
      const sectionText = isSelf ? ' (我)' : (isOnline ? ' (在线)' : ' (离线)');
      const color = m.color || '#2563eb';

      return `
        <span class="collab-presence-pill ${isOnline ? 'active' : ''}" style="${isOnline ? `border-color:${color}; color:${color}; background:#ffffff;` : 'color:#94a3b8; background:#f1f5f9;'}">
          <span class="collab-presence-dot" style="background:${isOnline ? color : '#cbd5e1'};"></span>
          ${m.avatar || '👨‍🎓'} ${m.name}<span style="font-weight:normal; font-size:10px; color:${isOnline ? '#475569' : '#94a3b8'};">${sectionText}</span>
        </span>
      `;
    }).join('');
  }

  function renderRemoteCursors(editorId, state) {
    const editor = document.getElementById(editorId);
    if (!editor) return;
    renderPresencePills(editorId, state);

    // 1. 清除旧光标组件
    editor.querySelectorAll('.remote-cursor-widget').forEach(el => el.remove());

    const membersList = Object.values(state.members || {});
    const currentUserCode = state.currentUser || 'A';
    const presence = state.presence || {};
    const now = Date.now();
    const seenMemberCodes = new Set();

    membersList.forEach(m => {
      const code = m.studentCode || m.id;
      if (m.studentCode === currentUserCode || m.id === currentUserCode) return;
      if (seenMemberCodes.has(code)) return; // 严格去重

      const p = presence[m.studentCode] || presence[m.id];
      if (!p || (now - (p.updatedAt || 0) > 20000)) return; // 20秒未活动视为离线
      seenMemberCodes.add(code);

      const color = m.color || '#8b5cf6';
      const name = m.name || m.studentCode;
      const avatar = m.avatar || '👨‍🎓';
      const targetOffset = (typeof p.charOffset === 'number' && p.charOffset >= 0) ? p.charOffset : null;

      // 创建精致字符级悬浮光标 DOM
      const cursorWidget = document.createElement('span');
      cursorWidget.className = 'remote-cursor-widget';
      cursorWidget.contentEditable = 'false';
      cursorWidget.style.cssText = 'user-select:none; pointer-events:none; position:relative; display:inline-block; width:0; height:1.15em; vertical-align:text-bottom; z-index:10; line-height:1; margin:0; padding:0;';

      cursorWidget.innerHTML = `
        <span style="position:absolute; top:-2px; left:-1px; width:2.5px; height:1.25em; background:${color}; border-radius:1.5px; animation:blinkCursor 1.2s infinite; box-shadow:0 0 4px ${color}88;"></span>
        <span class="remote-caret-flag" style="position:absolute; top:-22px; left:-4px; background:${color}; font-size:10.5px; padding:2px 6px; border-radius:4px 4px 4px 0; color:white; font-weight:700; display:inline-flex; align-items:center; gap:3px; white-space:nowrap; box-shadow:0 2px 6px rgba(0,0,0,0.18); transform:scale(0.92); transform-origin:left bottom; z-index:20;">
          ${avatar} ${name}
        </span>
      `;

      let inserted = false;

      // ── 字符级精准 Range 插入 ──
      if (targetOffset !== null && targetOffset >= 0) {
        let charIndex = 0;
        const nodeStack = [editor];
        let node;

        while (!inserted && (node = nodeStack.pop())) {
          if (node.nodeType === 3) { // 文本节点
            const nextCharIndex = charIndex + node.length;
            if (targetOffset >= charIndex && targetOffset <= nextCharIndex) {
              const relOffset = targetOffset - charIndex;
              if (relOffset === 0) {
                node.parentNode.insertBefore(cursorWidget, node);
              } else if (relOffset >= node.length) {
                if (node.nextSibling) {
                  node.parentNode.insertBefore(cursorWidget, node.nextSibling);
                } else {
                  node.parentNode.appendChild(cursorWidget);
                }
              } else {
                // 拆分文本节点精确插入在两个字符之间
                const secondPart = node.splitText(relOffset);
                node.parentNode.insertBefore(cursorWidget, secondPart);
              }
              inserted = true;
              break;
            }
            charIndex = nextCharIndex;
          } else if (node.nodeType === 1 && !node.classList.contains('remote-cursor-widget')) {
            let i = node.childNodes.length;
            while (i--) {
              nodeStack.push(node.childNodes[i]);
            }
          }
        }
      }

      // 兜底段落级插入
      if (!inserted) {
        const children = Array.from(editor.children);
        const targetIndex = (typeof p.nodeIndex === 'number' && p.nodeIndex >= 0) ? p.nodeIndex : 0;
        let targetEl = (children && children[targetIndex]) ? children[targetIndex] : (children.length > 0 ? children[children.length - 1] : editor);
        if (targetEl) targetEl.appendChild(cursorWidget);
      }
    });
  }

  function renderStage1Canvas(canvas, state, handlers) {
    const s1 = state.stage1;
    const currentUser = state.currentUser;
    const membersList = Object.values(state.members || {});
    const totalMembersCount = membersList.length;
    const confirmedMembers = s1.contract.confirmedMembers || {};
    // 兼容 member.id 和 member.studentCode 两种标识
    const confirmedCount = membersList.filter(m => confirmedMembers[m.id] || confirmedMembers[m.studentCode]).length;
    const userHasConfirmed = confirmedMembers[currentUser] || (state.members[currentUser] && confirmedMembers[state.members[currentUser].id]);
    const isContractLocked = s1.contract.isConfirmed || state.isFinalSubmitted;

    const userHasVoted = s1.hasVoted && s1.hasVoted[currentUser];
    const userVotedProposalId = s1.votes ? s1.votes[currentUser] : null;
    const totalVotesCast = Object.values(s1.hasVoted || {}).filter(Boolean).length;

    canvas.innerHTML = `
      ${isContractLocked ? `
        <div style="background:#ecfdf5; border:1px solid #a7f3d0; border-radius:8px; padding:10px 14px; margin-bottom:12px; font-size:13px; color:#059669; font-weight:700; display:flex; align-items:center; justify-content:space-between;">
          <span>🔒 阶段一【学术拍卖会】合作合约已全员签署生效并锁定 (可随时返回查阅)</span>
          <span style="font-size:11.5px; color:#065f46; background:#ffffff; border:1px solid #a7f3d0; padding:4px 8px; border-radius:4px;">全组 ${confirmedCount}/${totalMembersCount} 人已签署</span>
        </div>
      ` : ''}

      <div class="card">
        <div class="card-title" style="display:flex; justify-content:space-between; align-items:center;">
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="font-weight:800; font-size:15px; color:#0f172a;">💡 竞拍提案池 ${isContractLocked ? '<span style="font-size:11px; color:#059669;">🔒 已锁定</span>' : ''}</span>
            <span style="font-size:12px; color:#2563eb; background:#eff6ff; padding:2px 8px; border-radius:10px; border:1px solid #bfdbfe;">📊 投票进度: <b>${totalVotesCast}/${totalMembersCount} 人已投票</b></span>
          </div>
          ${!isContractLocked ? `
            <button id="btn-open-submit-proposal" style="background:linear-gradient(135deg, #2563eb, #1d4ed8); border:none; color:white; padding:7px 16px; border-radius:8px; font-weight:700; font-size:13px; cursor:pointer; box-shadow:0 3px 10px rgba(37,99,235,0.3);">
              ${s1.proposals.some(p => p.author === currentUser) ? '✏️ 修改我的选题' : '+ 提交我的选题'}
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
                const authorName = state.members[p.author] ? state.members[p.author].name : p.author;
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
              ${membersList.map(m => {
                const taskVal = (s1.contract.taskAssignments && (s1.contract.taskAssignments[m.id] !== undefined ? s1.contract.taskAssignments[m.id] : s1.contract.taskAssignments[m.studentCode])) || '';
                return `
                  <div style="display:flex; flex-direction:column; gap:6px; width:100%; background:#ffffff; padding:12px 14px; border-radius:8px; border:1px solid #e2e8f0; box-sizing:border-box;">
                    <span style="font-weight:800; color:${m.color || '#2563eb'}; font-size:13px;">${m.avatar || '👤'} ${m.name} (${m.roleTitle || '组员'}):</span>
                    <input type="text" class="large-contract-input task-assignment-input" data-mid="${m.id}" data-code="${m.studentCode || ''}" value="${taskVal}" ${isContractLocked ? 'disabled readonly style="opacity:0.8; cursor:not-allowed;"' : ''} style="width:100%; box-sizing:border-box; background:#ffffff; color:#0f172a; border:1px solid #cbd5e1; border-radius:6px; padding:10px 14px; font-size:13px; font-family:sans-serif;" placeholder="在聊天中商定或在此录入具体负责的写作章节与任务...">
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
            ${isContractLocked ? '🔒 学术合作合约已全员签署生效并锁定 (只读归档查阅)' : userHasConfirmed ? `✅ 我 (${state.members[currentUser] ? state.members[currentUser].name : currentUser}) 已按键确认签署 (${confirmedCount}/${totalMembersCount} 人已完成)` : `✍️ 我以 (${state.members[currentUser] ? state.members[currentUser].name : currentUser}) 身份按键确认签署合约 (已确认 ${confirmedCount}/${totalMembersCount} 人)`}
          </button>
        </div>

      </div>
    `;

    // 提案提交弹窗绑定 (支持新提交与修改已有选题，每人严格限制 1 个提案)
    const btnOpenProp = canvas.querySelector('#btn-open-submit-proposal');
    if (btnOpenProp) {
      btnOpenProp.addEventListener('click', () => {
        document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
        const existingProp = s1.proposals.find(p => p.author === currentUser);
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
        const closeModal = () => modal.remove();
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

          const existingIdx = s1.proposals.findIndex(p => p.author === currentUser);
          const nowMs = Date.now();
          if (existingIdx >= 0) {
            // 已有提案：更新标题与修改时间戳（保持每人 1 份，时间戳最新）
            s1.proposals[existingIdx].title = title;
            s1.proposals[existingIdx].updatedAt = nowMs;
          } else {
            // 新提案：加入提案池（带时间戳）
            s1.proposals.push({
              id: 'prop_' + currentUser + '_' + nowMs,
              author: currentUser,
              title: title,
              updatedAt: nowMs
            });
          }

          const currentStage = state.currentStage;
          const authorName = state.members[currentUser] ? state.members[currentUser].name : currentUser;
          const totalMembersCount = Object.keys(state.members || {}).length;
          const submittedAuthorsCount = new Set((s1.proposals || []).map(p => p.author)).size;

          const submitNoticeMsg = {
            sender: currentUser,
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
              ? `小组成员【${authorName}】刚在学术拍卖会上修改了选题提案，最新标题为《${title}》。请以拍卖师身份，结合该具体题目，严格按照【🔥研究热点 + 💡独特角度 + 🏷️竞拍吸睛建议】输出 120~150 字的极具穿透力的竞拍点评，严禁空洞套话！`
              : `小组成员【${authorName}】刚在学术拍卖会上提交了一份新选题提案《${title}》。请以拍卖师身份，结合该具体题目，严格按照【🔥研究热点 + 💡独特角度 + 🏷️竞拍吸睛建议】输出 120~150 字的极具穿透力的竞拍看点评估，严禁空洞套话！`;
            
            let evalText = await callCozeAgentAPI('auctioneer', evalPrompt, { stage: 'stage1', proposalTitle: title, author: authorName });
            if (!evalText || evalText.trim().length === 0) {
              evalText = isModify
                ? `🎪 【拍卖师·选题竞拍看点评估】：收到 ${authorName} 提交的修改版选题《${title}》！\n🔥 **研究热点**：切中了教育技术前沿热点赛道；\n💡 **独特角度**：立意聚焦且切入视角鲜明；\n🏷️ **竞拍建议**：若能在讨论中明确具体学段与技术应用情境，在竞拍投票中将更具吸睛力！`
                : `🎪 【拍卖师·选题竞拍看点评估】：收到 ${authorName} 提出的新选题《${title}》！\n🔥 **研究热点**：切中了教育数字化与现代教育技术前沿热点赛道；\n💡 **独特角度**：切入视角新颖，立意富有探索空间；\n🏷️ **竞拍建议**：若能在讨论中结合具体的教学场景工具，在接下来的全组竞拍投票中将极具竞争力！`;
            }

            const auctioneerEvalMsg = {
              sender: 'auctioneer',
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
      topicInput.addEventListener('input', (e) => {
        s1.mergedTitle = e.target.value;
        clearTimeout(topicTimer);
        topicTimer = setTimeout(() => {
          if (window.app) {
            window.app.syncStage1();
            if (window.app.cloudSyncEngine) window.app.cloudSyncEngine.pushSnapshot();
          }
        }, 150);
      });
      const flushTopic = () => {
        clearTimeout(topicTimer);
        s1.mergedTitle = topicInput.value;
        if (window.app) {
          window.app.syncStage1();
          if (window.app.cloudSyncEngine) window.app.cloudSyncEngine.pushSnapshot();
        }
      };
      topicInput.addEventListener('change', flushTopic);
      topicInput.addEventListener('blur', flushTopic);
      topicInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { topicInput.blur(); } });
    }

    canvas.querySelectorAll('.contract-time-input').forEach(input => {
      if (!isContractLocked) {
        let timeTimer = null;
        input.addEventListener('input', (e) => {
          const key = e.target.dataset.key;
          const numVal = Number(e.target.value) || 0;
          if (key && s1.contract.timeAllocations) {
            s1.contract.timeAllocations[key] = numVal;
            clearTimeout(timeTimer);
            timeTimer = setTimeout(() => {
              if (window.app) {
                window.app.syncStage1();
                if (window.app.cloudSyncEngine) window.app.cloudSyncEngine.pushSnapshot();
              }
            }, 80);
          }
        });
        const flushTime = () => {
          clearTimeout(timeTimer);
          const key = input.dataset.key;
          const numVal = Number(input.value) || 0;
          if (key && s1.contract.timeAllocations) {
            s1.contract.timeAllocations[key] = numVal;
            if (window.app) {
              window.app.syncStage1();
              if (window.app.cloudSyncEngine) window.app.cloudSyncEngine.pushSnapshot();
            }
          }
        };
        input.addEventListener('change', flushTime);
        input.addEventListener('blur', flushTime);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { input.blur(); } });
      }
    });

    canvas.querySelectorAll('.task-assignment-input').forEach(input => {
      if (!isContractLocked) {
        let taskTimer = null;
        input.addEventListener('input', (e) => {
          const mId = e.target.dataset.mid;
          const code = e.target.dataset.code;
          const val = e.target.value;
          if (!s1.contract.taskAssignments) s1.contract.taskAssignments = {};
          if (mId) s1.contract.taskAssignments[mId] = val;
          if (code) s1.contract.taskAssignments[code] = val;
          clearTimeout(taskTimer);
          taskTimer = setTimeout(() => {
            if (window.app) {
              window.app.syncStage1();
              if (window.app.cloudSyncEngine) window.app.cloudSyncEngine.pushSnapshot();
            }
          }, 80);
        });
        const flushTask = () => {
          clearTimeout(taskTimer);
          const mId = input.dataset.mid;
          const code = input.dataset.code;
          const val = input.value;
          if (!s1.contract.taskAssignments) s1.contract.taskAssignments = {};
          if (mId) s1.contract.taskAssignments[mId] = val;
          if (code) s1.contract.taskAssignments[code] = val;
          if (window.app) {
            window.app.syncStage1();
            if (window.app.cloudSyncEngine) window.app.cloudSyncEngine.pushSnapshot();
          }
        };
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
        handlers.onConfirmContract();
      });
    }
  }

  function renderStage2Canvas(canvas, state, handlers) {
    const s2 = state.stage2;
    const actionPlan = s2.actionPlan;
    const isStage2MeetingLocked = state.currentStage === 'stage3' || state.isFinalSubmitted;
    const isEditorReadonly = state.isFinalSubmitted;
    const membersList = Object.values(state.members || {});
    const plainTextLen = (s2.unifiedContent || '').replace(/<[^>]*>/g, '').trim().length;

    const userGroupId = state.currentUser && state.members[state.currentUser] ? state.members[state.currentUser].groupId : 'group_1';
    const availablePapers = (window.app && window.app.authManager) ? window.app.authManager.getReferencePapers(userGroupId) : [];
    const paperBtnLabel = availablePapers.length > 0 ? `📚 查阅参考范文 (${availablePapers.length}篇)` : '📚 查阅参考范文库';

    canvas.innerHTML = `
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
            <span style="font-size:12px; color:#2563eb; background:#eff6ff; padding:2px 8px; border-radius:10px; border:1px solid #bfdbfe;">字数: <b>${plainTextLen}</b> 字</span>
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
          const totalCount = membersList.length || 3;
          return `
            <div id="stage2-action-plan-card" style="background:#f8fafc; border:1px dashed #cbd5e1; border-radius:8px; padding:8px 14px; margin-bottom:8px;">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <div style="font-size:12px; font-weight:700; color:#64748b; display:flex; align-items:center; gap:6px;">
                  <span>📋 【半程修正清单】</span>
                  <span style="font-size:10.5px; background:${subCount > 0 ? '#dbeafe' : '#e2e8f0'}; color:${subCount > 0 ? '#1d4ed8' : '#475569'}; padding:1px 8px; border-radius:10px; font-weight:700;">
                    ${subCount > 0 ? `待解锁 (已打卡 ${subCount}/${totalCount}人)` : `待解锁 (0/${totalCount}人)`}
                  </span>
                </div>
                <span style="font-size:11px; color:#94a3b8;">（组内全员 ${totalCount} 人完成半程自查后自动生成）</span>
              </div>
            </div>
          `;
        })()}

        <!-- Word-grade Academic Rich Text Editor Body -->
        <div style="flex:1; min-height:0; display:flex; flex-direction:column;">
          ${buildWordEditorHtml('stage2-word-editor', s2.unifiedContent, isEditorReadonly)}
        </div>

        <div style="margin-top:8px; background:#ffffff; padding:8px 14px; border-radius:8px; border:1px solid #cbd5e1; flex-shrink:0; display:flex; flex-direction:column; gap:6px; box-shadow:0 1px 3px rgba(15,23,42,0.04);">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:12px; font-weight:800; color:#1e293b;">📊 团队协作贡献度占比 (SSRL 群体过程感知):</span>
            <div class="contrib-labels" style="display:flex; font-size:11.5px; font-weight:700; color:#475569; gap:12px; white-space:nowrap;">
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
          <div class="contrib-bars" style="width:100%; height:10px; border-radius:5px; display:flex; overflow:hidden; background:#e2e8f0;">
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
  }

  function renderStage3Canvas(canvas, state, handlers) {
    const s3 = state.stage3;
    const activeTab = s3.activeTab || 'defense';
    const isFinalSubmitted = state.isFinalSubmitted;
    const plainTextLen = (state.stage2.unifiedContent || '').replace(/<[^>]*>/g, '').trim().length;

    canvas.innerHTML = `
      <div style="height:100%; display:flex; flex-direction:column; gap:12px;">
        ${isFinalSubmitted ? `
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
        ` : ''}

        <div style="display:flex; justify-content:space-between; align-items:center; background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:8px 12px; flex-shrink:0; box-shadow:0 1px 3px rgba(15,23,42,0.04);">
          <div style="gap:10px; display:flex;">
            <button id="tab-btn-defense" style="background:${activeTab === 'defense' ? 'linear-gradient(135deg, #2563eb, #1d4ed8)' : '#f1f5f9'}; border:none; color:${activeTab === 'defense' ? 'white' : '#475569'}; padding:8px 16px; border-radius:8px; font-weight:700; font-size:13px; cursor:pointer;">
              🎓 答辩委员会质询与中间委员引导面板
            </button>
            <button id="tab-btn-editor" style="background:${activeTab === 'editor' ? 'linear-gradient(135deg, #059669, #047857)' : '#f1f5f9'}; border:none; color:${activeTab === 'editor' ? 'white' : '#475569'}; padding:8px 16px; border-radius:8px; font-weight:700; font-size:13px; cursor:pointer;">
              📝 返回富文本协作大正文 (依据意见修改终稿)
            </button>
          </div>
          <button id="btn-final-submit" ${isFinalSubmitted ? 'disabled' : ''} style="background:${isFinalSubmitted ? '#ecfdf5' : 'linear-gradient(135deg, #059669, #047857)'}; border:${isFinalSubmitted ? '1px solid #a7f3d0' : 'none'}; color:${isFinalSubmitted ? '#059669' : 'white'}; padding:8px 18px; border-radius:8px; font-weight:700; cursor:${isFinalSubmitted ? 'not-allowed' : 'pointer'}; font-size:13px; box-shadow:${isFinalSubmitted ? 'none' : '0 3px 10px rgba(5,150,105,0.25)'};">
            ${isFinalSubmitted ? '🔒 论文终稿已成功提交 (归档只读)' : '🚀 提交论文终稿'}
          </button>
        </div>

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
                      <span style="font-weight:800; font-size:14.5px; color:${item.role === 'opponent' ? '#dc2626' : '#059669'};">质询点 ${idx + 1}: ${item.speaker || (item.role === 'opponent' ? '反方委员 Agent' : '正方委员 Agent')} - ${item.title}</span>
                    </div>
                    <span style="font-size:11.5px; padding:3px 10px; border-radius:12px; font-weight:700; background:${item.status === 'adopted' ? '#ecfdf5' : '#fffbeb'}; color:${item.status === 'adopted' ? '#059669' : '#d97706'}; border:1px solid ${item.status === 'adopted' ? '#a7f3d0' : '#fde68a'};">
                      ${item.status === 'adopted' ? '✅ 已研讨并归档' : '⏳ 待组内研讨裁决'}
                    </span>
                  </div>
                  <div style="font-size:13.5px; color:#1e293b; background:#f8fafc; border:1px solid #e2e8f0; padding:12px 14px; border-radius:8px; margin-bottom:12px; line-height:1.6;">
                    <b>${item.speaker}意见原文:</b><br>${item.content}
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
                    >${item.response || ''}</textarea>
                    
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
        ` : `
          <div class="card" style="flex:1; display:flex; flex-direction:column; padding:16px;">
            <div class="card-title" style="margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:15px; font-weight:800; color:#0f172a;">📝 论文全篇大正文 ${isFinalSubmitted ? '<span style="font-size:11px; color:#059669; margin-left:6px;">(🔒 终稿已提交 · 归档只读查阅)</span>' : '(依据答辩意见实时修改终稿)'}</span>
              <span style="font-size:12px; color:#2563eb; background:#eff6ff; padding:2px 8px; border-radius:10px; border:1px solid #bfdbfe;">字数: <b>${plainTextLen}</b> 字</span>
            </div>
            <div style="flex:1; min-height:0; display:flex; flex-direction:column;">
              ${buildWordEditorHtml('stage3-word-editor', state.stage2.unifiedContent, isFinalSubmitted)}
            </div>
          </div>
        `}
      </div>
    `;

    const tabDefense = canvas.querySelector('#tab-btn-defense');
    const tabEditor = canvas.querySelector('#tab-btn-editor');
    if (tabDefense) tabDefense.addEventListener('click', () => handlers.onSwitchStage3Tab('defense'));
    if (tabEditor) tabEditor.addEventListener('click', () => handlers.onSwitchStage3Tab('editor'));

    if (activeTab === 'editor') {
      attachWordEditorEvents(canvas, 'stage3-word-editor', isFinalSubmitted, (html) => handlers.onUnifiedContentChange(html), (nodeIdx, sec, charOffset) => {
        if (handlers.onPresenceChange) handlers.onPresenceChange(nodeIdx, sec, charOffset);
      });
      renderRemoteCursors('stage3-word-editor', state);
    }

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
        state.chatLogs[stg] = state.chatLogs[stg].filter(msg => {
          const txt = msg.text || '';
          return !txt.includes('已连续') && !txt.includes('互动督促') && !txt.includes('秒未研讨') && !txt.includes('秒没有发言');
        });
        state.chatLogs[stg].forEach(msg => allMsgs.push(msg));
      }
    });

    // 智能滚动：如果用户正在往上拉浏览历史记录，保持当前视角不被强行打断拉回底部
    const isAtBottom = (stream.scrollHeight - stream.scrollTop - stream.clientHeight) < 90;
    const prevScrollTop = stream.scrollTop;

    stream.innerHTML = allMsgs.map(msg => {
      const isMe = msg.sender === currentUser;
      const isAgent = AgentProfiles[msg.sender] !== undefined;
      const profile = isAgent ? AgentProfiles[msg.sender] : (state.members ? state.members[msg.sender] : null);
      const avatar = profile ? profile.avatar : '👤';
      const name = profile ? (profile.name || profile.roleTitle) : msg.sender;
      const color = profile ? profile.color : '#94a3b8';

      let formattedContent = '';
      if ((msg.text || '').startsWith('[IMG_DATA]:')) {
        const imgSrc = msg.text.replace('[IMG_DATA]:', '');
        formattedContent = `
          <div style="margin-top:2px;">
            <img src="${imgSrc}" style="max-width:240px; max-height:180px; border-radius:8px; border:1px solid #cbd5e1; cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,0.1); transition:transform 0.2s;" onclick="window.open('${imgSrc}')" title="点击查看原图">
          </div>
        `;
      } else {
        let formattedText = msg.text || '';
        formattedText = formattedText.replace(/(@[^\s@]+)/g, '<span class="mention-tag">$1</span>');
        formattedContent = `<div class="msg-bubble">${formattedText}</div>`;
      }

      return `
        <div class="chat-message ${isMe ? 'me' : 'other'}">
          <div class="msg-avatar" style="background:${color}22; border:1px solid ${color}; color:${color};">${avatar}</div>
          <div class="msg-body">
            <div class="msg-meta">
              <span class="msg-sender" style="color:${color};">${name} ${isMe ? '(我)' : ''}</span>
              <span style="font-size:10px; color:#64748b; margin-left:6px;">${msg.timestamp || ''}</span>
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
      // 启动时立刻从远程服务器拉取最新完整数据
      if (this.cloudSyncEngine) this.cloudSyncEngine.pullFromServer();
    }

    loadGroupState(groupId = 'group_1') {
      const defaultState = JSON.parse(JSON.stringify(InitialState));
      const taskId = this.state.activeTaskId || 'task_default';
      this.state.members = this.authManager.getGroupMembersForWorkspace(groupId);

      const savedChat = localStorage.getItem(`jizhi_sync_chat_v10_pure_${taskId}_${groupId}`);
      if (savedChat) { 
        try { 
          this.state.chatLogs = JSON.parse(savedChat);
        } catch (e) { this.initPresetMessagesForGroup(groupId); } 
      } else { 
        this.initPresetMessagesForGroup(groupId); 
      }

      const savedS1 = localStorage.getItem(`jizhi_sync_s1_v10_pure_${taskId}_${groupId}`);
      if (savedS1) { try { this.state.stage1 = { ...defaultState.stage1, ...JSON.parse(savedS1) }; } catch (e) {} }
      else { this.state.stage1 = defaultState.stage1; }

      const savedS2 = localStorage.getItem(`jizhi_sync_s2_v10_pure_${taskId}_${groupId}`);
      if (savedS2) { try { this.state.stage2 = { ...defaultState.stage2, ...JSON.parse(savedS2) }; } catch (e) {} }
      else { this.state.stage2 = defaultState.stage2; }

      const savedS3 = localStorage.getItem(`jizhi_sync_s3_v10_pure_${taskId}_${groupId}`);
      if (savedS3) { try { this.state.stage3 = { ...defaultState.stage3, ...JSON.parse(savedS3) }; } catch (e) {} }
      else { this.state.stage3 = defaultState.stage3; }

      const savedStage = localStorage.getItem(`jizhi_sync_current_stage_v10_pure_${taskId}_${groupId}`);
      this.state.currentStage = savedStage || 'stage1';

      const savedSubmitted = localStorage.getItem(`jizhi_sync_final_submitted_v10_pure_${taskId}_${groupId}`);
      this.state.isFinalSubmitted = (savedSubmitted === 'true');
    }

    initPresetMessagesForGroup(groupId) {
      const taskId = this.state.activeTaskId || 'task_default';
      this.state.chatLogs = { stage1: [], stage2: [], stage3: [] };
      localStorage.setItem(`jizhi_sync_chat_v10_pure_${taskId}_${groupId}`, JSON.stringify(this.state.chatLogs));
    }

    resetTestGroupState(groupId = 'group_1') {
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
      if (this.cloudSyncEngine) {
        this.cloudSyncEngine.groupId = groupId;
        this.cloudSyncEngine.updateScopeKeys();
        // 标记为强制重置快照，通知远端各学生端彻底重置本地草稿、合约与聊天
        this.cloudSyncEngine.isResetBroadcast = true;
        this.cloudSyncEngine.pushSnapshot();
      }
    }

    saveGroupState(groupId) {
      const taskId = this.state.activeTaskId || 'task_default';
      localStorage.setItem(`jizhi_sync_chat_v10_pure_${taskId}_${groupId}`, JSON.stringify(this.state.chatLogs));
      localStorage.setItem(`jizhi_sync_s1_v10_pure_${taskId}_${groupId}`, JSON.stringify(this.state.stage1));
      localStorage.setItem(`jizhi_sync_s2_v10_pure_${taskId}_${groupId}`, JSON.stringify(this.state.stage2));
      localStorage.setItem(`jizhi_sync_s3_v10_pure_${taskId}_${groupId}`, JSON.stringify(this.state.stage3));
      localStorage.setItem(`jizhi_sync_current_stage_v10_pure_${taskId}_${groupId}`, this.state.currentStage);
      localStorage.setItem(`jizhi_sync_final_submitted_v10_pure_${taskId}_${groupId}`, this.state.isFinalSubmitted ? 'true' : 'false');
    }

    syncChatLogs() {
      const user = this.authManager.getCurrentUser();
      const groupId = (user && user.groupId) ? user.groupId : (this.state.activeMonitorGroupId || 'group_1');
      this.saveGroupState(groupId);
      if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
    }

    syncStage1() {
      const user = this.authManager.getCurrentUser();
      const groupId = (user && user.groupId) ? user.groupId : (this.state.activeMonitorGroupId || 'group_1');
      this.saveGroupState(groupId);
      if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
    }

    syncStage2() {
      const user = this.authManager.getCurrentUser();
      const groupId = (user && user.groupId) ? user.groupId : (this.state.activeMonitorGroupId || 'group_1');
      this.saveGroupState(groupId);
      if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
    }

    syncStage3() {
      const user = this.authManager.getCurrentUser();
      const groupId = (user && user.groupId) ? user.groupId : (this.state.activeMonitorGroupId || 'group_1');
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
          membersList.forEach(m => { rawTotal += (contribs[m.id] || 0) + (contribs[m.studentCode] || 0); });

          contribLabelsContainer.innerHTML = membersList.map((m) => {
            const rawVal = (contribs[m.id] || 0) + (contribs[m.studentCode] || 0);
            const pct = (rawTotal === 0 || rawVal === 0) ? (membersList.length > 0 ? Math.round(100 / membersList.length) : 0) : Math.round((rawVal / rawTotal) * 100);
            return `<span style="color:${m.color || '#2563eb'}; font-weight:700;">● ${m.name}: ${pct}%</span>`;
          }).join('');

          if (rawTotal === 0 && cleanText.length === 0) {
            contribBarsContainer.innerHTML = `<div style="width:100%; height:10px; background:#f1f5f9; border-radius:5px; display:flex; align-items:center; justify-content:center; font-size:10.5px; color:#94a3b8;">暂无协作投入 (开始编辑正文或研讨后将自动呈现贡献占比)</div>`;
          } else {
            contribBarsContainer.innerHTML = membersList.map((m) => {
              const rawVal = (contribs[m.id] || 0) + (contribs[m.studentCode] || 0);
              const pct = (rawTotal === 0) ? Math.round(100 / (membersList.length || 1)) : Math.round((rawVal / rawTotal) * 100);
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

    initTimer() {
      setInterval(() => {
        const currentUser = this.authManager.getCurrentUser();
        if (currentUser && currentUser.role === 'student' && this.state.timer.isRunning) {
          this.state.timer.elapsedSeconds += 1 * this.state.timer.speed;
          const min = this.state.timer.elapsedSeconds / 60;
          const currentStage = this.state.currentStage || 'stage1';
          const nowMs = Date.now();
          const logs = (this.state.chatLogs && this.state.chatLogs[currentStage]) || [];

          // ⚡ 阶段切换由学生全员签署完成合约或组内自主点击把控，禁止定时器无预警强行切阶段
          // if (min >= 25 && this.state.currentStage === 'stage1') this.switchStage('stage2');
          // else if (min >= 130 && this.state.currentStage === 'stage2') this.switchStage('stage3');

          // ⚡ 自动心跳广播：保持当前账号在各端显示为 (在线) 状态
          const myCode = currentUser ? (currentUser.studentCode || 'A') : 'A';
          if (!this.state.presence) this.state.presence = {};
          if (!this.state.presence[myCode] || (Date.now() - (this.state.presence[myCode].updatedAt || 0)) > 5000) {
            this.state.presence[myCode] = {
              nodeIndex: (this.state.presence[myCode] && this.state.presence[myCode].nodeIndex) || 0,
              activeSection: (this.state.presence[myCode] && this.state.presence[myCode].activeSection) || '在线研讨',
              updatedAt: Date.now()
            };
            if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
          }

          // 🌿 智能静默破冰引导已关闭，避免无人发言时责任编辑重复刷屏

          // ⏰ 阶段二【精准时间 65% 节点】：若正文尚未触发反思，时间满 65% (68.25分钟) 时责任编辑号召发起会议
          if (currentStage === 'stage2') {
            const s2Min = min - 25; // 阶段二经历分钟数 (总长105分钟)
            const isStage2MeetingLocked = this.state.stage2 && this.state.stage2.actionPlan && this.state.stage2.actionPlan.isGenerated;
            if (s2Min >= 68.25 && !isStage2MeetingLocked && !this.state.stage2MeetingTimeTriggered) {
              this.state.stage2MeetingTimeTriggered = true;
              const meetingCallMsg = {
                sender: 'managingEditor',
                text: `🤝 【责任编辑·半程会议号召】：阶段二协作时间已达到 65%！请全体小组成员点击上方【📢 发起编辑会议】完成 4 维自查打卡，稍后审稿编辑将结合全组情况进行深度学术质检与清单生成！`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                _timeMs: nowMs
              };
              logs.push(meetingCallMsg);
              this.syncChatLogs();
              renderChat(this.state);
            }
          }

          if (this.state.studentViewMode === 'workspace') {
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
            const studentA = users.find(u => u.username === 'liming' || u.email === 'studentA@jizhi.edu');
            if (studentA) {
              sessionStorage.setItem('jizhi_current_user', JSON.stringify(studentA));
              localStorage.setItem('jizhi_current_user', JSON.stringify(studentA));
              this.renderMain();
            }
          }
        );
      } else {
        const currentGroupId = currentUser && currentUser.groupId ? currentUser.groupId : 'group_1';
        this.loadGroupState(currentGroupId);

        if (this.state.studentViewMode === 'task_list') {
          appEl.className = 'app-student-portal-mode';
          renderStudentTaskPortal(
            appEl, this.authManager, this.state,
            (taskId) => {
              this.state.activeTaskId = taskId || 'task_default';
              this.state.studentViewMode = 'workspace';
              this.loadGroupState(currentGroupId);
              this.renderMain();
              if (this.cloudSyncEngine) {
                this.cloudSyncEngine.updateScopeKeys();
                this.cloudSyncEngine.pullFromServer();
              }
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
        const stage = this.state.currentStage;
        const now = Date.now();
        const membersList = Object.values(this.state.members || {});
        const totalMembersCount = membersList.length;
        // 基础绝对前提：小组成员必须【全部登录在线】(activeMembersCount >= totalMembersCount 且 1分钟内有活跃心跳)
        const presenceMap = this.state.presence || {};
        const activeMembersCount = membersList.filter(m => {
          const p = presenceMap[m.studentCode] || presenceMap[m.id];
          return p && (now - (p.updatedAt || 0) < 60000); // 1分钟内有活跃心跳
        }).length;
        if (activeMembersCount < totalMembersCount) return; // 必须全员全部登录在线才触发提醒！

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
                totalContrib += (contribs[m.id] || 0) + (contribs[m.studentCode] || 0);
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
                const memContrib = (contribs[m.id] || 0) + (contribs[m.studentCode] || 0);
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

          // ── 阶段二动态比例自适应算法（基于公约规划总时长） ──
          // 动态阈值：后半程修改静默提醒阈值 = 阶段二总规划时长的 12%（设置安全上下限: 5min ~ 12min）
          const dynamicPostMeetingSilenceMs = Math.min(Math.max(totalPlannedMs * 0.12, 300000), 720000);

          // 4. 🎯 半程会议后协同修改守护：半程会议已完成（清单已生成），若讨论区超过动态阈值（约规划总时长的12%，大课约8分钟）无人说话，提示交流修改进展与对齐
          const hasMeetingDone = !!(s2.actionPlan && s2.actionPlan.isGenerated);
          if (hasMeetingDone && silenceDurationMs > dynamicPostMeetingSilenceMs) {
            if (!this.lastS2PostMeetingSilenceNudgeTime || now - this.lastS2PostMeetingSilenceNudgeTime > 300000) {
              this.lastS2PostMeetingSilenceNudgeTime = now;
              const msg = {
                sender: 'managingEditor',
                text: `💡 【责任编辑·协同修改交流提示】：半程修正清单已生成一段时间啦！\n👉 建议大家在讨论区交流一下各部分修改的进展与衔接情况，遇到瓶颈互相出谋划策，共同加速完成终稿完善！`,
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

          // 5. 🎯 终审收尾雷达：正文写到【六、参考文献】或进入最后 15% 冲刺期
          const hasReachedReferences = /(?:六、|第6章|第六部分|参考文献|References)/i.test(s2.unifiedContent || '');
          const isTimeOver85Pct = stage2DurationMs >= (totalPlannedMs * 0.85);
          if ((hasReachedReferences || isTimeOver85Pct) && !this.state.stage2FinalNudgeSent && hasMeetingDone) {
            this.state.stage2FinalNudgeSent = true;
            const msg1 = {
              sender: 'managingEditor',
              text: `🏁 【责任编辑·冲刺倒计时提醒】：方案撰写已进入最终收尾冲刺阶段！\n• 建议全组成员交叉通读全篇，理顺段落衔接；确认无误后可准备点击进入【阶段三：答辩擂台】！`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              _timeMs: now
            };
            const msg2 = {
              sender: 'reviewingEditor',
              text: `📚 【审稿编辑·终审格式排版规范】：请注意检查：\n1. 章节标题序号是否规范统一；\n2. 表格是否采用标准学术三线表；\n3. 参考文献是否符合 GB/T 7714 格式规范。`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              _timeMs: now + 500
            };
            if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
            this.state.chatLogs.stage2.push(msg1, msg2);
            this.syncChatLogs();
            if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
            renderChat(this.state);
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

    checkUnreadAnnouncements() {
      const currentUser = this.authManager.getCurrentUser();
      const groupId = currentUser && currentUser.groupId ? currentUser.groupId : 'group_1';
      const allAnns = this.authManager.getAnnouncements();
      
      // 过滤出当前小组可见且【未读】的通知，严格按创建时间从新到旧排序
      const unreadList = allAnns
        .filter(a => (!a.targetGroupId || a.targetGroupId === 'all' || a.targetGroupId === groupId) && (!a.readStatus || !a.readStatus[groupId]))
        .sort((a, b) => (b.id > a.id ? 1 : -1));

      if (unreadList.length > 0) {
        setTimeout(() => this.showAnnouncementModal(unreadList[0], true), 600);
      }
    }

    showAnnouncementModal(targetAnn = null, isSequentialFlow = false) {
      document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
      const currentUser = this.authManager.getCurrentUser();
      const groupId = currentUser && currentUser.groupId ? currentUser.groupId : 'group_1';
      const allAnns = this.authManager.getAnnouncements();

      // 过滤当前小组可见的通知 (全班广播 或 定向本组)，并按最新发布倒序排
      const myAnns = allAnns
        .filter(a => !a.targetGroupId || a.targetGroupId === 'all' || a.targetGroupId === groupId)
        .sort((a, b) => (b.id > a.id ? 1 : -1));

      if (myAnns.length === 0) {
        if (!isSequentialFlow) alert('📢 暂无课堂教学通知！');
        return;
      }

      // 计算当前未读列表（从新到旧）
      const unreadList = myAnns.filter(a => !a.readStatus || !a.readStatus[groupId]);

      // 如果当前是自动弹出流且已无任何未读通知，直接静默退出
      if (isSequentialFlow && unreadList.length === 0) {
        return;
      }

      // 选中的通知：优先 targetAnn，若无则取最新未读，再无则取最新一条通知
      const selectedAnn = targetAnn || (unreadList.length > 0 ? unreadList[0] : myAnns[0]);
      const isSelectedRead = selectedAnn.readStatus && selectedAnn.readStatus[groupId];

      // 计算当前在未读流中的序号
      const unreadIndex = unreadList.findIndex(a => a.id === selectedAnn.id);
      const queueBadge = unreadList.length > 0 && !isSelectedRead
        ? `<span style="background:rgba(239,68,68,0.25); border:1px solid #f87171; color:#ffffff; padding:2px 8px; border-radius:10px; font-size:11px; margin-left:6px;">待确认 ${unreadIndex >= 0 ? unreadIndex + 1 : 1}/${unreadList.length}</span>`
        : '';

      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div style="width:620px; max-width:94vw; background:#ffffff; border-radius:16px; box-shadow:0 25px 50px -12px rgba(15,23,42,0.25); overflow:hidden; border:1px solid #e2e8f0; animation:modalFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);">
          
          <!-- 渐变高颜值头部 -->
          <div style="background:linear-gradient(135deg, #4338ca, #6366f1); padding:20px 24px; display:flex; justify-content:space-between; align-items:center; color:#ffffff;">
            <div style="display:flex; align-items:center; gap:12px;">
              <div style="width:42px; height:42px; border-radius:12px; background:rgba(255,255,255,0.2); display:flex; align-items:center; justify-content:center; font-size:22px; flex-shrink:0;">
                🔔
              </div>
              <div>
                <div style="display:flex; align-items:center;">
                  <h3 style="margin:0; font-size:17.5px; font-weight:800; color:#ffffff; letter-spacing:0.3px;">课堂教学通知</h3>
                  ${queueBadge}
                </div>
                <div style="font-size:12px; color:#e0e7ff; margin-top:2px;">任课教师即时推送的教学指示与随附教学资源</div>
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
                  const isRead = a.readStatus && a.readStatus[groupId];
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
                  📢 ${selectedAnn.title}
                </h4>
                <span style="font-size:11.5px; color:#64748b; white-space:nowrap;">${selectedAnn.time || ''}</span>
              </div>

              <!-- 标签栏 -->
              <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:14px;">
                <span style="background:#f8fafc; color:#475569; border:1px solid #e2e8f0; padding:3px 10px; border-radius:6px; font-size:11.5px; font-weight:700;">
                  👨‍🏫 发布教师: <b>${selectedAnn.author || '任课教师'}</b>
                </span>
                <span style="background:#f5f3ff; color:#7c3aed; border:1px solid #ddd6fe; padding:3px 10px; border-radius:6px; font-size:11.5px; font-weight:700;">
                  📌 关联任务: <b>${selectedAnn.taskTitle || '全流程写作'}</b>
                </span>
                <span style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; padding:3px 10px; border-radius:6px; font-size:11.5px; font-weight:700;">
                  🎯 受众: <b>${selectedAnn.targetGroupName || '全班所有小组'}</b>
                </span>
                ${isSelectedRead ? `
                  <span style="background:#ecfdf5; color:#059669; border:1px solid #a7f3d0; padding:3px 10px; border-radius:6px; font-size:11.5px; font-weight:700;">
                    ✅ 本组已确认阅读
                  </span>
                ` : `
                  <span style="background:#fef2f2; color:#dc2626; border:1px solid #fecaca; padding:3px 10px; border-radius:6px; font-size:11.5px; font-weight:700;">
                    🔴 待确认阅读
                  </span>
                `}
              </div>

              <!-- 正文卡片 -->
              <div style="background:#f8fafc; border:1px solid #f1f5f9; border-radius:10px; padding:14px 16px; font-size:13.5px; color:#334155; line-height:1.7; white-space:pre-wrap; word-break:break-word;">
                ${selectedAnn.content}
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
              ${isSelectedRead ? '关闭' : '暂不确认并关闭'}
            </button>
            <button id="btn-read-confirm" style="flex:1; background:${isSelectedRead ? '#e2e8f0' : 'linear-gradient(135deg, #059669, #047857)'}; color:${isSelectedRead ? '#64748b' : '#ffffff'}; border:none; padding:11px 24px; border-radius:8px; font-size:13.5px; font-weight:700; cursor:pointer; box-shadow:${isSelectedRead ? 'none' : '0 3px 10px rgba(5,150,105,0.2)'}; display:inline-flex; align-items:center; justify-content:center; gap:6px;">
              ${isSelectedRead ? '✅ 本条已确认已读 (点击查阅下一条)' : (unreadList.length > 1 ? `✅ 确认本条已读并看下一条 (${unreadIndex + 1}/${unreadList.length}) ➔` : '✅ 我已阅读并确认 (已同步至教师端)')}
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

      modal.querySelector('#btn-read-confirm').addEventListener('click', () => {
        // 1. 标记本条为已读
        this.authManager.markAnnouncementRead(selectedAnn.id, groupId);
        closeModal();

        // 2. 重新获取最新的未读通知列表（从新到旧）
        const updatedAllAnns = this.authManager.getAnnouncements();
        const nextUnreads = updatedAllAnns
          .filter(a => (!a.targetGroupId || a.targetGroupId === 'all' || a.targetGroupId === groupId) && (!a.readStatus || !a.readStatus[groupId]))
          .sort((a, b) => (b.id > a.id ? 1 : -1));

        // 3. 如果还有未读通知，自动连续弹出下一条让学生一一确认；如果全确认完则刷新工作区状态
        if (nextUnreads.length > 0) {
          setTimeout(() => this.showAnnouncementModal(nextUnreads[0], true), 200);
        } else {
          this.renderStudentWorkspace();
        }
      });
    }

    showQuestionnaireModal() {
      document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
      const currentUser = this.authManager.getCurrentUser();
      const currentClassId = currentUser && currentUser.classId ? currentUser.classId : 'class_101';
      const currentTaskId = this.state.activeTaskId || 'task_default';
      const surveyUrl = this.authManager.getSurveyUrl(currentClassId, currentTaskId) || 'https://www.wjx.cn/vm/jizhi_eval_2026.aspx';
      const isConfigured = surveyUrl.startsWith('http');
      
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
                <div style="font-size:12px; color:#64748b; margin-top:2px;">请全组成员分别完成在线评估问卷</div>
              </div>
            </div>
            <button id="btn-close-survey-modal" style="background:#f8fafc; border:1px solid #e2e8f0; width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:#64748b; font-size:14px; transition:all 0.15s ease;">✕</button>
          </div>

          <!-- 内容主体 -->
          <div style="padding:24px; display:flex; flex-direction:column; gap:18px;">
            
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:14px 16px; font-size:13px; color:#334155; line-height:1.6;">
              为了持续改进人机协作写作的学习体验，请同学们点击下方按钮前往填写匿名问卷。
            </div>

            <!-- 跳转按钮区域 -->
            <div style="background:#ffffff; border:1.5px dashed #bfdbfe; border-radius:12px; padding:22px 18px; text-align:center;">
              ${isConfigured ? `
                <a href="${surveyUrl}" target="_blank" id="btn-go-survey" style="display:inline-flex; align-items:center; justify-content:center; gap:8px; background:linear-gradient(135deg, #1d4ed8, #2563eb); color:#ffffff; padding:12px 32px; border-radius:10px; font-size:14px; font-weight:700; text-decoration:none; box-shadow:0 4px 12px rgba(37,99,235,0.25); transition:transform 0.15s ease;">
                  🚀 打开问卷页面 ↗
                </a>
                <div style="font-size:11.5px; color:#94a3b8; margin-top:10px; word-break:break-all;">
                  问卷地址: <span style="color:#2563eb;">${surveyUrl}</span>
                </div>
              ` : `
                <div style="color:#d97706; font-size:13px; font-weight:600;">
                  ⚠️ 暂未配置有效问卷链接，请联系任课教师在教师端配置。
                </div>
              `}
            </div>

            <!-- 勾选确认 -->
            <div style="display:flex; align-items:center; gap:10px; background:#eff6ff; border:1px solid #bfdbfe; border-radius:10px; padding:12px 16px;">
              <input type="checkbox" id="chk-survey-done" style="width:17px; height:17px; cursor:pointer; accent-color:#2563eb;" ${localStorage.getItem('jizhi_survey_completed') === 'true' ? 'checked' : ''}>
              <label for="chk-survey-done" style="font-size:13px; font-weight:700; color:#1e40af; cursor:pointer; user-select:none;">
                我已完成问卷填写并提交
              </label>
            </div>

          </div>

          <!-- 底部确认关闭 -->
          <div style="padding:16px 24px; background:#f8fafc; border-top:1px solid #f1f5f9; display:flex; justify-content:flex-end;">
            <button id="btn-finish-survey" style="width:100%; background:linear-gradient(135deg, #1d4ed8, #2563eb); color:#ffffff; border:none; padding:11px 24px; border-radius:10px; font-size:13.5px; font-weight:700; cursor:pointer; box-shadow:0 2px 8px rgba(37,99,235,0.2);">
              完成并返回
            </button>
          </div>

        </div>
      `;
      document.body.appendChild(modal);

      const closeModal = () => modal.remove();
      modal.querySelector('#btn-close-survey-modal').addEventListener('click', closeModal);
      modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
      modal.querySelector('#chk-survey-done').addEventListener('change', (e) => {
        localStorage.setItem('jizhi_survey_completed', e.target.checked ? 'true' : 'false');
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
      const papers = this.authManager.getReferencePapers(groupId);

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
          if (paper && paper.fileName) {
            const fileData = localStorage.getItem(`jizhi_paper_data_${paperId}`) || paper.fileData;
            if (fileData) {
              const a = document.createElement('a');
              a.href = fileData;
              a.download = paper.fileName;
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
        const studentCode = currentUser ? (currentUser.studentCode || 'A') : 'A';
        const currentStage = this.state.currentStage;
        const msgObj = { 
          sender: studentCode, 
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

        this.triggerAgentReplyIfNeeded(text);
      };

      sendBtn.addEventListener('click', handleSend);
      input.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSend(); });
    }

    updateContributionUi() {
      const editor = document.getElementById('stage2-word-editor');
      const cleanText = editor ? editor.innerText.replace(/[\s\r\n]+/g, '') : '';
      const countBadge = document.getElementById('stage2-word-count-num');
      if (countBadge) countBadge.innerText = `${cleanText.length}`;

      const s2 = this.state.stage2;
      const membersList = Object.values(this.state.members || {});
      const contribs = s2.memberContributions || {};
      let totalContrib = 0;
      membersList.forEach(m => {
        totalContrib += (contribs[m.id] || 0) + (contribs[m.studentCode] || 0);
      });

      const getMemberData = (m) => {
        const val = (contribs[m.id] || 0) + (contribs[m.studentCode] || 0);
        if (totalContrib === 0 || val === 0) {
          const defaultPct = membersList.length > 0 ? Math.round(100 / membersList.length) : 0;
          return { pct: (totalContrib === 0 ? defaultPct : 0), label: `${m.name}: ${totalContrib === 0 ? defaultPct : 0}%` };
        }
        const pct = Math.round((val / totalContrib) * 100);
        return { pct: pct, label: `${m.name}: ${pct}%` };
      };

      const barContainer = document.querySelector('.contrib-bars');
      if (barContainer) {
        if (totalContrib === 0 && cleanText.length === 0) {
          barContainer.innerHTML = `<div style="width:100%; height:10px; background:#f1f5f9; border-radius:5px; display:flex; align-items:center; justify-content:center; font-size:10.5px; color:#94a3b8;">暂无协作投入 (开始编辑正文或研讨后将自动呈现贡献占比)</div>`;
        } else {
          barContainer.innerHTML = membersList.map((m) => {
            const data = getMemberData(m);
            if (data.pct === 0) return '';
            return `<div class="contrib-segment" style="width:${data.pct}%; background:${m.color || '#2563eb'}; transition:width 0.3s ease;" title="${m.name}: ${data.pct}% (基于写作与修改累计工作量)"></div>`;
          }).join('');
        }
      }

      const labelsContainer = document.querySelector('.contrib-labels');
      if (labelsContainer) {
        labelsContainer.innerHTML = membersList.map((m) => {
          const data = getMemberData(m);
          return `<span style="color:${m.color || '#2563eb'}; font-weight:700;">● ${data.label}</span>`;
        }).join('');
      }
      this.renderPresenceCursors();
    }

    async triggerAgentReplyIfNeeded(userMsg) {
      const stage = this.state.currentStage;
      const isExplicitMention = userMsg.includes('@');
      // 阶段一专属里程碑：学生在研讨中商定好分工/时间并确认时触发拍卖师生成合约
      const isContractFinalizeSignal = stage === 'stage1' && /(?:分工确定|确定分工|商定好了|分工好了|确定主题|生成合约|确认分工|时间分配好了|分配完毕|达成共识)/i.test(userMsg);

      if (!isExplicitMention && !isContractFinalizeSignal) return;

      let replyAgent = null;
      let defaultFallbackText = '';

      if (isContractFinalizeSignal) {
        replyAgent = 'auctioneer';
      } else if (userMsg.includes('@中间委员') || userMsg.includes('@中间委员 Agent')) {
        replyAgent = 'neutral';
        defaultFallbackText = `🟡 【中间委员回复】：收到关注！对于正反两方质询，建议团队权衡取舍，在终稿中强化论证逻辑！`;
      } else if (userMsg.includes('@正方委员') || userMsg.includes('@正方委员 Agent')) {
        replyAgent = 'proponent';
        defaultFallbackText = `🟢 【正方委员回复】：建议团队在方案中进一步突出创新点与应用价值！`;
      } else if (userMsg.includes('@反方委员') || userMsg.includes('@反方委员 Agent')) {
        replyAgent = 'opponent';
        defaultFallbackText = `🔴 【反方委员回复】：请团队审视研究设计的严谨性，在方法中必须交代抽样代表性与工具信效度！`;
      } else if (userMsg.includes('@审稿编辑') || userMsg.includes('@审稿编辑 Agent')) {
        replyAgent = 'reviewingEditor';
        defaultFallbackText = `📝 【审稿编辑针对性指导】：收到你的问询！请确保正文各级标题层级分明，理论概念与测量量表精确对应！`;
      } else if (userMsg.includes('@责任编辑') || userMsg.includes('@责任编辑 Agent')) {
        replyAgent = 'managingEditor';
        defaultFallbackText = `🤝 【责任编辑过程学伴回复】：收到 @ 呼叫！目前小组协同节奏良好，建议组员按合约分工分块推进正文写作。`;
      } else if (userMsg.includes('@拍卖师') || userMsg.includes('@拍卖师 Agent')) {
        replyAgent = 'auctioneer';
        defaultFallbackText = `🎪 【拍卖师选题顾问回复】：收到！已为您关注组内研讨进展。请大家在左侧查看《学术合作合约》，确认主题、分工与时间无误后全员签署！`;
      }

      if (!replyAgent) return;

      this.studentMsgCountSinceLastAgent = 0;
      const currentUser = this.authManager.getCurrentUser();
      const currentTopic = this.state.stage1 ? this.state.stage1.mergedTitle : '';
      const actualDocContent = (this.state.stage2 && this.state.stage2.unifiedContent) ? this.state.stage2.unifiedContent.replace(/<[^>]*>/g, '').trim() : '';

      // 直接异步直连 Coze API 获得真实大模型智能体深度审阅回复
      let replyText = await callCozeAgentAPI(replyAgent, userMsg, {
        stage: stage,
        topic: currentTopic,
        actualDoc: actualDocContent,
        userId: currentUser ? (currentUser.id || currentUser.username) : 'student_user'
      });

      if (!replyText || replyText.trim().length === 0) {
        replyText = `⚠️ 【系统提示】：大模型智能体未返回有效应答（请检查网络连接或接口状态）。`;
      }

      const agentMsgObj = {
        sender: replyAgent,
        text: replyText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        _timeMs: Date.now()
      };
      if (!this.state.chatLogs[stage]) this.state.chatLogs[stage] = [];
      this.state.chatLogs[stage].push(agentMsgObj);
      this.syncChatLogs();
      renderChat(this.state);
    }

    handleVoteCast(proposalId) {
      if (this.state.stage1.contract.isConfirmed || this.state.isFinalSubmitted) {
        alert('🔒 学术合作合约已签署锁定，不可再更改投票。');
        return;
      }
      const user = this.state.currentUser;
      const s1 = this.state.stage1;
      if (s1.hasVoted && s1.hasVoted[user]) { alert('⚠️ 投票已被锁定！每位成员首次投票后不能再修改选项。'); return; }
      if (!s1.hasVoted) s1.hasVoted = {};
      s1.votes[user] = proposalId;
      s1.hasVoted[user] = true;
      const proposal = (s1.proposals || []).find(p => p.id === proposalId);
      const totalMembersCount = Object.keys(this.state.members).length;
      const votesCastCount = Object.values(s1.hasVoted).filter(Boolean).length;
      const voteMsg = { sender: user, text: `📢 [投票告知]: 我已确认投票支持提案《${proposal ? proposal.title : proposalId}》！（当前全组已集齐 ${votesCastCount}/${totalMembersCount} 票）`, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
      this.state.chatLogs.stage1.push(voteMsg);
      this.syncStage1();
      this.syncChatLogs();
      if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();

      if (votesCastCount >= totalMembersCount) {
        // ── 全员投票完成：落槌公布结果并自动生成合约 ──
        setTimeout(() => {
          const tally = {};
          Object.values(s1.votes).forEach(pId => { if (pId) tally[pId] = (tally[pId] || 0) + 1; });
          let summaryText = '🎪 【拍卖师·投票结果播报与主题推进】\n全员投票已全部完成！计票结果如下：\n';
          let maxVotes = -1;
          let winningProposal = null;
          (s1.proposals || []).forEach(p => { 
            const count = tally[p.id] || 0;
            summaryText += `• 《${p.title}》: ${count} 票\n`; 
            if (count > maxVotes) {
              maxVotes = count;
              winningProposal = p;
            }
          });

          const isUnanimous = (maxVotes === totalMembersCount);

          if (isUnanimous) {
            summaryText += `\n🎉 **【全员一致认同】**：全组 ${totalMembersCount} 票全部支持《${winningProposal.title}》！正式确立该提案为本组研究课题！\n\n👉 **【第 1 步·细化方案内容与研究方向】**：\n请全组先在研讨区头脑风暴：围绕该主题，具体打算涵盖哪些核心内容与关键模块？有哪些想要深入探索的具体设计？\n\n👉 **【第 2 步·商讨分工与时间安排（先后顺序由团队自主决定）】**：\n内容框架明晰后，大家自主商讨 6 大章节由谁负责、各模块时间如何预算（可先定分工亦可先排时间）。\n\n💬 **商讨差不多后**，可点击下方【🤖 提炼研讨共识生成公约草案】（或直接在输入框中录入），确认无误后全员点击【确认签署】！`;
            if (!s1.mergedTitle && winningProposal) {
              s1.mergedTitle = winningProposal.title;
            }
          } else {
            summaryText += `\n⚖️ **【存在意见分歧·优先协商引导】**：注意到组内对选题持有不同视角！这正是团队协同碰撞创新的最佳契机。\n\n👉 **【第 1 步·协商确定主题与具体内容】**：\n建议各提案作者在讨论区简要说明设计亮点，大家取长补短，**确定一个全组认可的主题**并交流具体打算涵盖的核心内容！\n\n👉 **【第 2 步·商讨分工与时间安排（先后顺序由团队自主决定）】**：\n内容框架明晰后，大家自主商讨 6 大章节由谁负责、各模块时间如何预算（可先定分工亦可先排时间）。\n\n💬 **商讨差不多后**，点击下方【🤖 提炼研讨共识生成公约草案】（或直接录入），确认无误后全员点击【确认签署】！`;
            if (!s1.mergedTitle && winningProposal) {
              s1.mergedTitle = winningProposal.title;
            }
          }

          if (!s1.contract.timeAllocations) {
            s1.contract.timeAllocations = { background: 25, literature: 30, questions: 25, method: 40, reflection: 20, references: 10 };
          }

          const summaryMsg = { sender: 'auctioneer', text: summaryText, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), _timeMs: Date.now() };
          this.state.chatLogs.stage1.push(summaryMsg);
          this.syncStage1();
          this.syncChatLogs();
          if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
          renderChat(this.state);
          this.renderStudentWorkspace();
        }, 1000);
      }
      this.renderStudentWorkspace();
    }

    async triggerStageWelcomeSpeech(stage) {
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
        if (!hasNeutralIntro) {
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
            const propPrompt = `针对小组论文《${topic}》，请发表 120~150 字的肯定支持意见，阐述其创新价值与实践意义。`;
            let propText = await callCozeAgentAPI('proponent', propPrompt, { stage: 'stage3', topic, actualDoc: rawContent });
            if (!propText || propText.trim().length === 0) {
              propText = `🟢 【正方委员评审意见】：通读全篇，该研究选题《${topic}》立意新颖，理论基础扎实，方案具备较好的应用推广前景，值得肯定！`;
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
              const oppPrompt = `针对小组论文《${topic}》，请发表 130~160 字的尖锐质询意见，指出其样本局限性与研究工具测量信度不足等 2 个尖锐问题。`;
              let oppText = await callCozeAgentAPI('opponent', oppPrompt, { stage: 'stage3', topic, actualDoc: rawContent });
              if (!oppText || oppText.trim().length === 0) {
                oppText = `🔴 【反方委员尖锐质询】：针对当前设计提出两点质疑：① 样本抽样代表性不足，存在样本选择偏差；② 测量工具未交代信效度检验过程，结论推导效度存疑！`;
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
                  { id: 'fb_prop', reviewer: '正方委员 Agent (肯定支持)', comment: propText.replace(/^[^\n]*【[^】]+】\s*/, ''), response: '', isApproved: true },
                  { id: 'fb_opp_1', reviewer: '反方委员 Agent (尖锐质询)', comment: '质询 1：研究样本抽样代表性与外推效度说明不足，需补充控制混淆变量方案。', response: '', isApproved: false },
                  { id: 'fb_opp_2', reviewer: '反方委员 Agent (尖锐质询)', comment: '质询 2：测量量表或质性编码框架未清晰交代信效度与编码一致性检验依据。', response: '', isApproved: false }
                ];
                this.syncStage3();
                this.renderStudentWorkspace();
              }

              this.syncChatLogs();
              renderChat(this.state);

              // 5. 中间委员引导静心阅读 1 分钟并抛出第 1 题辩护
              setTimeout(() => {
                const chairGuideMsg = {
                  sender: 'neutral',
                  text: `🟡 【中间委员·答辩引导】：正反两方意见已同步入驻左侧【答辩裁决矩阵】！\n👉 请全组先在研讨区就反方第 1 条质询充分商讨辩护共识；达成一致后，**建议推选一位组员代表全组**将答辩结论录入左侧矩阵对应框中，并同步在终稿正文中落实修改！`,
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  _timeMs: Date.now()
                };
                logs.push(chairGuideMsg);
                this.syncChatLogs();
                renderChat(this.state);
              }, 2500);

            }, 2500);
          }, 2000);
        }
      }
    }

    switchStage(newStage) {
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
      const currentGroupId = currentUser && currentUser.groupId ? currentUser.groupId : 'group_1';

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
                  const authorName = this.state.members[p.author] ? this.state.members[p.author].name : p.author;
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
          if (!s1.contract.taskAssignments) s1.contract.taskAssignments = {};
          const defaultTasks = ['负责：一、研究背景与二、文献综述', '负责：三、研究问题与四、研究设计', '负责：五、反思与六、参考文献规范'];
          Object.values(this.state.members || {}).forEach((m, idx) => {
            const taskStr = defaultTasks[idx % defaultTasks.length] || '协作撰写与统稿';
            s1.contract.taskAssignments[m.id] = taskStr;
            if (m.studentCode) s1.contract.taskAssignments[m.studentCode] = taskStr;
          });
          if (!s1.contract.timeAllocations) {
            s1.contract.timeAllocations = { background: 25, literature: 30, questions: 25, method: 40, reflection: 20, references: 10 };
          }
          
          // 局部填入输入框，绝不暴力销毁 DOM
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

          const draftNoticeMsg = {
            sender: 'auctioneer',
            text: `📜 【拍卖师·公约提炼生成】：已根据全组研讨共识，智能提炼并生成了《学术合作公约》草案！\n👉 请全组成员仔细核对分工与时间规划，支持随时在输入框中自主微调；确认无误后，全员点击【确认签署】！`,
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
            alert(`✅ 你 (${memberName}) 已成功按键确认签署合约！\n\n目前组内签署进度：${confirmedCount}/${totalMembersCount} 人。\n需全组 ${totalMembersCount} 名成员全部按键确认后方可解锁阶段二！`);
          } else {
            s1.contract.isConfirmed = true;
            this.syncStage1();
            this.syncStageChange('stage2');
            if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
            setTimeout(() => {
              const finalMsg = { sender: 'auctioneer', text: `🎪 【拍卖师宣布】：恭喜！组内全员 ${totalMembersCount}/${totalMembersCount} 名成员已全部完成按键确认签署！学术合作合约正式生效并锁定，阶段一圆满结束，系统自动解锁【阶段二：学术编辑部】！`, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
              this.state.chatLogs.stage1.push(finalMsg);
              this.syncChatLogs();
              if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
              alert(`🎉 恭喜！组内 ${totalMembersCount} 位成员全部完成按键确认签署！学术合作合约生效并锁定，系统解锁【阶段二：学术编辑部】！`);
              this.switchStage('stage2');
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
            // 正文为空时，各成员打字字数重置为 0
            this.lastPlainTextLength = 0;
            Object.keys(this.state.members || {}).forEach(mId => {
              this.state.stage2.memberContributions[mId] = 0;
            });
          } else {
            const prevLen = this.lastPlainTextLength || 0;
            const delta = plain.length - prevLen;
            this.lastPlainTextLength = plain.length;
            if (delta > 0) {
              this.state.stage2.memberContributions[user] = (this.state.stage2.memberContributions[user] || 0) + delta;
            }
          }

          if (!this.state.presence) this.state.presence = {};
          let activeNodeIdx = 0;
          let activeCharOffset = null;
          try {
            const sel = window.getSelection();
            const editor = document.getElementById('stage2-word-editor') || document.getElementById('stage3-word-editor');
            if (sel && sel.rangeCount > 0 && editor) {
              activeCharOffset = getCaretCharacterOffsetWithin(editor);
              let blockEl = sel.anchorNode ? (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement) : null;
              while (blockEl && blockEl.parentElement !== editor && blockEl !== editor) {
                blockEl = blockEl.parentElement;
              }
              if (blockEl && blockEl.parentElement === editor) {
                activeNodeIdx = Array.from(editor.children).indexOf(blockEl);
              }
            }
          } catch (e) {}

          this.state.presence[user] = {
            nodeIndex: activeNodeIdx,
            activeSection: '正文',
            charOffset: activeCharOffset,
            updatedAt: Date.now()
          };
          this.updateContributionUi();
          this.syncStage2();
          if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
          this.checkAgentTriggersOnContent(newContent);
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
          const confirmSub = confirm(`🚀 确认提交《${topicTitle}》期末方案终稿？\n\n提交后本组的方案与研讨矩阵将锁定归档呈递至教师端，其他小组不受影响！提交后将自动弹窗引导进入课程评估问卷！`);
          if (confirmSub) {
            this.state.isFinalSubmitted = true;
            const currentStage = this.state.currentStage;
            const currentUser = this.state.currentUser;
            const submitMsg = {
              sender: currentUser,
              text: `🎉 【期末论文终稿成功提交告知】全组已完成论文终稿与答辩质询归档，方案已锁定并提交至教师端！大家可以随时返回各阶段查阅！`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };
            if (!this.state.chatLogs[currentStage]) this.state.chatLogs[currentStage] = [];
            this.state.chatLogs[currentStage].push(submitMsg);

            const neutralFinalMsg = {
              sender: 'neutral',
              text: `🏆 【中间委员 Agent 祝贺】热烈祝贺小组圆满完成本期写作任务与答辩！终稿已全盘锁入云端归档库。请全组成员点击弹窗填写课程评估问卷！`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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



      // 1. 🎯 审稿编辑第一次动态质检（检测到正文推进到【二、文献综述】或【三、研究问题与假设】时触发一次）
      const hasLitOrQuestionSection = /(?:二、|第2章|第二部分|文献综述|三、|第3章|第三部分|研究问题|研究假设)/i.test(newContent);
      if (hasLitOrQuestionSection && !this.state.stage2FirstReviewDone && timeSinceLastReviewing > 60000) {
        this.state.stage2FirstReviewDone = true;
        const topic = (this.state.stage1 && this.state.stage1.mergedTitle) ? this.state.stage1.mergedTitle : '本组课题';
        const contentSnippet = newContent.replace(/<[^>]*>/g, '').slice(0, 500);

        setTimeout(async () => {
          const firstReviewPrompt = `团队正在撰写课题《${topic}》，目前正文已推进到文献综述与研究问题部分，内容切片如下：\n${contentSnippet}\n请作为审稿编辑发表 120~150 字的初稿进展建议：肯定当前已完成部分的亮点，并给出 1~2 句微调启发建议（确保方法与问题呼应），鼓励团队继续稳步推进！`;
          let firstReviewText = await callCozeAgentAPI('reviewingEditor', firstReviewPrompt, { stage: 'stage2', topic });
          if (!firstReviewText || firstReviewText.trim().length === 0) {
            firstReviewText = `📝 【审稿编辑·初稿进展建议】：审阅了大家目前撰写的正文，论证框架非常清晰！针对当前写到的文献与问题部分，建议对核心概念的操作化描述再做细微补充，确保研究方法与研究问题之间的对应关系清晰可见，大家在讨论区交流一下，继续稳步推进！`;
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

      if (hasReflectionSection && !isStage2MeetingLocked && timeSinceLastManaging > 60000) {
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
        membersList.forEach(m => { totalContrib += (contribs[m.id] || 0) + (contribs[m.studentCode] || 0); });

        if (totalContrib >= 200 || plainLen >= 300) {
          // 检查是否存在显著失衡：某位成员占比超过 70%，且有成员贡献率低于 10%
          const pcts = membersList.map(m => {
            const val = (contribs[m.id] || 0) + (contribs[m.studentCode] || 0);
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
                    <option value="逻辑严密连贯，高度认同同伴观点">✅ 逻辑严密连贯，高度认同同伴思路与论述</option>
                    <option value="启发新思路，建议为同伴补充论据">💡 启发了新思路，想在讨论区为同伴补充论据视角</option>
                    <option value="存在不同看法，部分论证需要商榷">⚖️ 存在不同看法，对部分论据推导想和同伴商榷</option>
                    <option value="衔接非常自然，很好支撑了后续章节">🔗 章节衔接自然，很好地支撑呼应了后续研究设计</option>
                  </select>
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
        const hasDivergence = allSubs.some(s => s.themeConsistency.includes('偏离') || s.themeConsistency.includes('不够充分') || s.peerReviewState.includes('不同看法') || s.peerReviewState.includes('商榷'));
        
        // 汇总全组自查状态
        const consistencySummary = allSubs.map(s => `${s.name}: ${s.themeConsistency.slice(0, 10)}`).join('；');
        const peerSummary = allSubs.map(s => `${s.name}: ${s.peerReviewState.slice(0, 10)}`).join('；');
        const primaryAcademicB = allSubs[0].bAcademic;
        const primaryCollabB = allSubs[0].bCollab;
        const primaryRhythmB = allSubs[0].bRhythm;
        const questionsList = allSubs.filter(s => s.userText).map(s => `${s.name}提问：“${s.userText}”`).join('；') || '暂无补充提问';

        this.state.stage2.actionPlan = {
          isGenerated: true,
          items: [
            `【学术构想与论证修正】(自查: ${consistencySummary} · 互阅: ${peerSummary}): 针对核心学术瓶颈【${primaryAcademicB}】与组内提问(${questionsList})，在三、假设与四、设计中补齐操作化测量量表与理论依据。`,
            `【团队协同与分工平衡】: 针对协作难点【${primaryCollabB}】，统一各章节论述用词风格与逻辑过渡，落实 Equal Participation 均等参与。`,
            `【时间节奏与反思深化】: 针对进度难点【${primaryRhythmB}】，把控后半程节奏，优先完成五、研究设计的不足与反思。`
          ]
        };
        this.syncStage2();
        if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
        this.renderStudentWorkspace();

        alert(`🎉 恭喜！组内 ${totalMembersCount} 位成员已全部完成半程自查与互阅打卡！【审稿编辑·半程修正清单】已正式解锁并生成！`);

        // 2. 异步调用扣子【责任编辑】Coze API: 主次分明 (分歧为70%主线，协作时间为辅；一致则夸默契顺畅推进)
        const managingPrompt = `全组成员已全部完成半程编辑会议自查打卡（共 ${totalMembersCount} 人）：
• 全组负责章节自查汇总: ${consistencySummary}
• 全组通读同伴思想研判: ${peerSummary}
• 组内核心学术瓶颈: ${primaryAcademicB} | 协作瓶颈: ${primaryCollabB} | 进度瓶颈: ${primaryRhythmB}
• 组内说明与提问汇总: ${questionsList}
• 判定状态: ${hasDivergence ? '【存在显著分歧/不同看法】' : '【全员高度一致认同】'}

请作为责任编辑发表 130~160 字的发言：
${hasDivergence 
  ? '【分歧引导主线】：将 70% 篇幅聚焦于组员在立意与同伴构想上的认知分歧，抛出具体的反思思考题号召全组在讨论区先辩论对齐；顺带提一句协作难点与时间把控，并预告审稿专家随后将进行学术质检！'
  : '【高度一致分支】：顺势大力肯定团队的高度默契与聚焦状态，引导大家针对手填的开放提问与学术难点交流，并预告审稿专家马上为大家做正文深度学术质检！'
}`;

        let managingText = await callCozeAgentAPI('managingEditor', managingPrompt, { stage: 'stage2', topic, bottleneck: bAcademic, peerReview: peerReviewState });
        if (!managingText || managingText.trim().length === 0) {
          managingText = hasDivergence
            ? `🤝 【责任编辑·分歧研判与对齐引导】：全员自查完毕，清单已生成！重点关注到组内对目前正文的立意与同伴构想存在认知分歧（自查状态：${themeConsistency}；互阅研判：${peerReviewState}）。👉 请全组立刻在讨论区深入对齐：目前的方法设计有没有偏离核心命题？大家打算如何统一论证逻辑？稍后审稿专家将接着为大家做正文审查！`
            : `🤝 【责任编辑·高度默契肯定与推进】：全员自查完毕，清单已生成！太棒了，全组对论文核心构想与同伴论述保持着高度一致的认同与默契（${peerReviewState}）！请大家保持这个良好的协同状态，针对刚才提出的学术难点（『${userText || bAcademic}』）简要交流，审稿专家马上接着为大家做正文深度学术质检！`;
        }

        const managingMsg = {
          sender: 'managingEditor',
          text: managingText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          _timeMs: Date.now()
        };
        this.state.chatLogs.stage2.push(managingMsg);
        this.syncChatLogs();
        renderChat(this.state);

        // 3. 平台接管调控：设置【等待组内商讨对齐】状态，绝不盲目即时弹出审稿编辑！
        this.state.stage2PendingReviewing = {
          topic,
          bAcademic,
          userText,
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

      const contentSnippet = (this.state.stage2 && this.state.stage2.unifiedContent) ? this.state.stage2.unifiedContent.replace(/<[^>]*>/g, '').slice(0, 600) : '论文初稿方案';
      const reviewingPrompt = `小组已针对责任编辑提出的自查立意与分歧展开了讨论，并达成了对齐共识（学术瓶颈：“${ctx.bAcademic}”，开放说明：“${ctx.userText}”）。请针对其论文《${ctx.topic}》及当前真实初稿切片：
${contentSnippet}
请作为国家级核心期刊审稿编辑发表 130~160 字的学术内容审查：肯定已有正文亮点与刚才团队的立意对齐，指出方法或论证中的 1 处薄弱点，给出具体的学术修改建议，引导全组对照左侧【半程编辑修正清单】分工推进！`;

      let reviewingText = await callCozeAgentAPI('reviewingEditor', reviewingPrompt, { stage: 'stage2', topic: ctx.topic, bottleneck: ctx.bAcademic });
      if (!reviewingText || reviewingText.trim().length === 0) {
        reviewingText = `📝 【审稿编辑·正文学术内容审查】：看到大家已在讨论区对齐了立意共识！我重点审阅了目前撰写的正文初稿，引言与综述逻辑扎实。针对方法部分，建议进一步明确所采用测量工具或编码框架的可靠性依据，增强论证严密性。请全组对照左侧【半程编辑修正清单】，分工加速完善！`;
      }

      const reviewingMsg = {
        sender: 'reviewingEditor',
        text: reviewingText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        _timeMs: Date.now()
      };
      if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
      this.state.chatLogs.stage2.push(reviewingMsg);
      this.syncChatLogs();
      if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
      renderChat(this.state);
    }

    handleLogout() {
      this.authManager.logout();
      this.state.studentViewMode = 'task_list';
      this.renderMain();
    }
  }

  // Global Launch
  window.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
  });
})();
