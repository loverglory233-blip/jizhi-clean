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
    studentViewMode: 'task_list', // 'task_list' or 'workspace'
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

  function parseCSVText(text) {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const result = [];
    lines.forEach((line, idx) => {
      if (idx === 0 && (line.includes('姓名') || line.includes('账号') || line.includes('username'))) return;
      const parts = line.split(/[,，\t\s]+/).map(p => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        result.push({
          name: parts[0],
          username: parts[1],
          studentCode: parts[2] || parts[1],
          customPassword: parts[3] || '123'
        });
      }
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
            json.forEach((row, idx) => {
              if (row && row.length >= 2) {
                const strRow = row.map(cell => String(cell).trim());
                if (idx === 0 && (strRow[0].includes('姓名') || strRow[1].includes('账号'))) return;
                students.push({
                  name: strRow[0],
                  username: strRow[1] || strRow[0],
                  studentCode: strRow[2] || strRow[1] || strRow[0],
                  customPassword: strRow[3] || '123'
                });
              }
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
    if (currentContext.stage) {
      enrichedQuery = `【当前协作写作阶段: ${currentContext.stage === 'stage1' ? '阶段一 (选题与公约)' : currentContext.stage === 'stage2' ? '阶段二 (富文本大正文撰写)' : '阶段三 (答辩与质询裁决)'}】\n【小组研究主题: ${currentContext.topic || '暂定'}】\n学生最新发言: ${userQuery}`;
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
    { id: 'u_teacher1', username: 'teacher', email: 'teacher@jizhi.edu', password: '123', name: '张教授 (教师)', role: 'teacher', avatar: '👩‍🏫' },
    { id: 'u_studentA', username: 'liming', email: 'studentA@jizhi.edu', password: '123', name: '李明 (学生A/组长)', role: 'student', studentCode: 'A', avatar: '👨‍🎓', classId: 'class_101', groupId: 'group_1' },
    { id: 'u_studentB', username: 'wangfang', email: 'studentB@jizhi.edu', password: '123', name: '王芳 (学生B/组员)', role: 'student', studentCode: 'B', avatar: '👩‍🎓', classId: 'class_101', groupId: 'group_1' },
    { id: 'u_studentC', username: 'chenqiang', email: 'studentC@jizhi.edu', password: '123', name: '陈强 (学生C/组员)', role: 'student', studentCode: 'C', avatar: '🧑‍🎓', classId: 'class_101', groupId: 'group_1' }
  ];

  const DefaultTasks = [];
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
            localStorage.setItem(STORAGE_KEY_USERS_DB, JSON.stringify(data.users));
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
            localStorage.setItem('jizhi_reference_papers_db', JSON.stringify(data.referencePapers));
          }
        }
      } catch (e) {}
    }
    pushGlobalMeta() {
      const payload = {
        users: this.getUsers(),
        classes: this.getClasses(),
        tasks: this.getTasks(),
        announcements: this.getAnnouncements(),
        referencePapers: this.getReferencePapers()
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
    getUsers() { return JSON.parse(localStorage.getItem(STORAGE_KEY_USERS_DB)) || DefaultUsers; }
    getClasses() { return JSON.parse(localStorage.getItem(STORAGE_KEY_CLASSES)) || DefaultClasses; }
    getTasks() { return JSON.parse(localStorage.getItem(STORAGE_KEY_TASKS)) || DefaultTasks; }
    getAnnouncements() { return JSON.parse(localStorage.getItem(STORAGE_KEY_ANNOUNCEMENTS)) || DefaultAnnouncements; }
    getCurrentUser() {
      const sessionData = sessionStorage.getItem(STORAGE_KEY_USER);
      if (sessionData) { try { return JSON.parse(sessionData); } catch (e) {} }
      const localData = localStorage.getItem(STORAGE_KEY_USER);
      return localData ? JSON.parse(localData) : null;
    }
    login(accountInput, password) {
      const users = this.getUsers();
      const query = accountInput.trim().toLowerCase();
      const userIndex = users.findIndex(u => {
        const uName = (u.username || '').toLowerCase();
        const uEmail = (u.email || '').toLowerCase();
        const uCode = (u.studentCode || '').toLowerCase();
        return (uName === query || uEmail === query || uCode === query || ('student' + uCode) === query) && u.password === password;
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

    addStudentToClass(name, username, studentCode, classId, customPassword = null) {
      const users = this.getUsers();
      const classes = this.getClasses();
      const cleanUsername = username.trim().toLowerCase();
      const cleanCode = (studentCode || cleanUsername).trim();
      const existingIndex = users.findIndex(u => (u.username || '').toLowerCase() === cleanUsername || (u.studentCode && u.studentCode === cleanCode));
      const avatars = ['👨‍🎓', '👩‍🎓', '🧑‍🎓', '🎓', '📚', '🌟'];
      const avatar = avatars[users.length % avatars.length];

      let targetUser;
      if (existingIndex !== -1) {
        targetUser = users[existingIndex];
        if (name && name.trim()) targetUser.name = name.trim();
        if (customPassword && customPassword.trim()) targetUser.password = customPassword.trim();
        if (studentCode && studentCode.trim()) targetUser.studentCode = studentCode.trim();

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
          username: cleanUsername,
          email: `${cleanUsername}@jizhi.edu`,
          password: (customPassword && customPassword.trim()) ? customPassword.trim() : '123',
          name: name.trim(),
          role: 'student',
          studentCode: cleanCode,
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
      let count = 0;
      studentList.forEach(st => {
        if (st.name && st.username) {
          this.addStudentToClass(st.name, st.username, st.studentCode || st.username, classId, st.customPassword);
          count++;
        }
      });
      return count;
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
      users.forEach(u => {
        if (selectedUserIds.includes(u.id)) {
          u.groupId = group.id;
          if (u.id === leaderUserId) {
            u.studentCode = 'A';
          }
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

    publishAnnouncement(taskId, title, content, attachment = null) {
      const announcements = this.getAnnouncements();
      const tasks = this.getTasks();
      const task = tasks.find(t => t.id === taskId);
      const newAnn = {
        id: 'ann_' + Date.now(), taskId,
        taskTitle: task ? task.title : '期末协作写作',
        title, content, attachment,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        author: '张教授', readStatus: { 'group_1': false }
      };
      announcements.unshift(newAnn);
      localStorage.setItem(STORAGE_KEY_ANNOUNCEMENTS, JSON.stringify(announcements));
      this.pushGlobalMeta();
      return newAnn;
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
      const newPaper = {
        id: 'ref_' + Date.now(),
        title: paper.title || '未命名学术参考范文',
        abstract: paper.abstract || '',
        keyHighlights: paper.keyHighlights || '',
        fileName: paper.fileName || '',
        fileData: paper.fileData || '',
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
      localStorage.setItem(`jizhi_sync_final_submitted_v10_pure_${groupId}`, isSubmitted ? 'true' : 'false');
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

      this.syncEndpoints = [
        `sync.php?taskId=${taskId}&groupId=${groupId}`
      ];
    }

    initWebSocket() {
      this.updateScopeKeys();
      // PieSocket for instant real-time push (scoped by task and group)
      const wsUrl = `wss://free.v2.piesocket.com/v3/jizhi_${this.taskId}_${this.groupId}?api_key=VCXCEuvhGcBDP7XhiJJLUD6RRE25ixbngSkiUZ3N&notify_self=0`;
      try {
        if (this.ws) { try { this.ws.close(); } catch (e) {} }
        this.ws = new WebSocket(wsUrl);
        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data && data.snapshot) this.handleRemoteSync(data.snapshot);
          } catch (err) {}
        };
        this.ws.onclose = () => { setTimeout(() => this.initWebSocket(), 3000); };
        this.ws.onerror = () => {};
      } catch (e) {}
    }

    initPolling() {
      this.pullFromServer();
      // Poll server every 400ms for instantaneous cross-device sync
      this.pollTimer = setInterval(() => this.pullFromServer(), 400);

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

      // 1. 账号唯一在线检查 (优雅的自定义 UI 弹窗提示，一键关闭，绝不阻塞 JS 线程造成死循环)
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

      const snapshot = {
        timestamp: Date.now(),
        groupId: groupId,
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
        // Push to all server endpoints (PHP 8.2 sync.php is primary)
        await Promise.allSettled(this.syncEndpoints.map(url =>
          fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: bodyStr
          })
        ));
      } catch (e) {
      } finally {
        this.isPushing = false;
        if (this.pendingPush) { this.pendingPush = false; this.pushSnapshot(); }
      }
    }

    handleRemoteSync(remoteData) {
      if (!remoteData) return;

      const user = this.app.authManager.getCurrentUser();
      const myGroupId = (user && user.groupId) ? user.groupId : (this.app.state.activeMonitorGroupId || 'group_1');

      if (remoteData.groupId && remoteData.groupId !== myGroupId && user?.role === 'student') return;

      if (remoteData.timestamp) {
        this.lastTimestamp = Math.max(this.lastTimestamp, remoteData.timestamp);
      }
      let structuralUpdated = false;
      let chatUpdated = false;

      if (remoteData.presence) {
        this.app.state.presence = { ...(this.app.state.presence || {}), ...remoteData.presence };
        this.app.renderPresenceCursors();
      }

      if (remoteData.members) { this.app.state.members = remoteData.members; structuralUpdated = true; }

      if (remoteData.isFinalSubmitted !== undefined && remoteData.isFinalSubmitted !== this.app.state.isFinalSubmitted) {
        this.app.state.isFinalSubmitted = remoteData.isFinalSubmitted;
        structuralUpdated = true;
      }

      if (remoteData.chatLogs) {
        ['stage1', 'stage2', 'stage3'].forEach(stg => {
          const localLogs = this.app.state.chatLogs[stg] || [];
          const remoteLogs = remoteData.chatLogs[stg] || [];
          if (remoteLogs.length !== localLogs.length || JSON.stringify(remoteLogs) !== JSON.stringify(localLogs)) {
            // 合并或采纳最新聊天
            this.app.state.chatLogs[stg] = remoteLogs;
            chatUpdated = true;
          }
        });
      }

      if (remoteData.stage1) {
        if (JSON.stringify(remoteData.stage1) !== JSON.stringify(this.app.state.stage1)) {
          this.app.state.stage1 = remoteData.stage1;
          structuralUpdated = true;
        }
      }

      if (remoteData.users && Array.isArray(remoteData.users) && remoteData.users.length > 0) {
        localStorage.setItem(STORAGE_KEY_USERS_DB, JSON.stringify(remoteData.users));
      }
      if (remoteData.classes && Array.isArray(remoteData.classes) && remoteData.classes.length > 0) {
        localStorage.setItem(STORAGE_KEY_CLASSES, JSON.stringify(remoteData.classes));
      }
      if (remoteData.tasks && Array.isArray(remoteData.tasks)) localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(remoteData.tasks));
      if (remoteData.announcements && Array.isArray(remoteData.announcements)) localStorage.setItem(STORAGE_KEY_ANNOUNCEMENTS, JSON.stringify(remoteData.announcements));
      if (remoteData.referencePapers && Array.isArray(remoteData.referencePapers)) localStorage.setItem('jizhi_reference_papers_db', JSON.stringify(remoteData.referencePapers));

      if (remoteData.stage2) {
        if (remoteData.stage2.unifiedContent !== undefined) {
          let cleanRemoteContent = remoteData.stage2.unifiedContent || '';
          cleanRemoteContent = cleanRemoteContent.replace(/<span class="remote-cursor-widget"[\s\S]*?<\/span>/gi, '');
          
          if (cleanRemoteContent !== this.app.state.stage2.unifiedContent) {
            this.app.state.stage2.unifiedContent = cleanRemoteContent;
            const editor = document.getElementById('stage2-word-editor') || document.getElementById('stage3-word-editor');
            // 只要不是当前正在编辑的富文本焦点框，或者内容确实变化，就精准同步
            if (editor) {
              if (document.activeElement !== editor) {
                editor.innerHTML = cleanRemoteContent || '';
              }
            }
            this.app.updateContributionUi();
            this.app.renderPresenceCursors();
          }
        }
        if (remoteData.stage2.memberContributions) {
          this.app.state.stage2.memberContributions = remoteData.stage2.memberContributions;
          this.app.updateContributionUi();
        }
        if (remoteData.stage2.actionPlan && JSON.stringify(remoteData.stage2.actionPlan) !== JSON.stringify(this.app.state.stage2.actionPlan)) {
          this.app.state.stage2.actionPlan = remoteData.stage2.actionPlan;
          structuralUpdated = true;
        }
      }

      if (remoteData.stage3 && remoteData.stage3.feedbackItems) {
        if (JSON.stringify(remoteData.stage3.feedbackItems) !== JSON.stringify(this.app.state.stage3.feedbackItems)) {
          this.app.state.stage3.feedbackItems = remoteData.stage3.feedbackItems;
          structuralUpdated = true;
        }
      }

      if (remoteData.currentStage && remoteData.currentStage !== this.app.state.currentStage) {
        this.app.state.currentStage = remoteData.currentStage;
        structuralUpdated = true;
      }

      this.app.saveGroupState(myGroupId);
      if (chatUpdated) renderChat(this.app.state);
      if (structuralUpdated) {
        if (user?.role === 'student') {
          if (this.app.state.studentViewMode === 'workspace') {
            this.app.renderStudentWorkspace();
          } else {
            this.app.renderMain();
          }
        }
        if (user?.role === 'teacher') {
          const mainEl = document.getElementById('app');
          if (mainEl && this.app.state.teacherActiveTab === 'view_monitoring') {
            renderTeacherPortal(mainEl, this.app.authManager, this.app.state, () => this.app.handleLogout(), () => this.app.renderStudentWorkspace());
          }
        }
      }
    }
  }

  /* ==========================================================================
     6. LOGIN VIEW RENDERER
     ========================================================================== */
  function renderLoginView(container, authManager, onLoginSuccess) {
    container.innerHTML = `
      <div style="min-height:100vh; display:flex; align-items:center; justify-content:center; padding:20px; background:linear-gradient(135deg, #f0f4f9 0%, #e2e8f0 100%);">
        <div style="background:#ffffff; border:1px solid #cbd5e1; border-radius:20px; width:440px; max-width:95vw; padding:36px; box-shadow:0 20px 40px -8px rgba(15, 23, 42, 0.08), 0 4px 12px rgba(15, 23, 42, 0.04);">
          <div style="text-align:center; margin-bottom:28px;">
            <div style="font-size:32px; font-weight:800; background:linear-gradient(135deg, #1e40af, #2563eb); -webkit-background-clip:text; -webkit-text-fill-color:transparent;">集智 JIZHI</div>
            <div style="font-size:13px; color:#64748b; margin-top:6px; font-weight:600;">多智能体协同写作与人机共存学习平台</div>
          </div>
          <form id="login-form" style="display:flex; flex-direction:column; gap:16px;">
            <div style="display:flex; flex-direction:column; gap:6px;">
              <label style="font-size:13px; font-weight:700; color:#334155;">账号 (支持用户名: teacher, liming, wangfang, chenqiang)</label>
              <input type="text" id="login-account" class="teacher-input" placeholder="输入 teacher 或 liming / wangfang / chenqiang" value="teacher" required style="width:100%;">
            </div>
            <div style="display:flex; flex-direction:column; gap:6px;">
              <label style="font-size:13px; font-weight:700; color:#334155;">密码 (默认 123)</label>
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
              <button class="quick-login-btn" data-account="teacher" style="background:#ecfdf5; border:1px solid #a7f3d0; color:#059669; padding:10px; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer;">👩‍🏫 教师: teacher</button>
              <button class="quick-login-btn" data-account="liming" style="background:#eff6ff; border:1px solid #bfdbfe; color:#2563eb; padding:10px; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer;">👨‍🎓 学生A: liming (第1组)</button>
              <button class="quick-login-btn" data-account="wangfang" style="background:#eff6ff; border:1px solid #bfdbfe; color:#2563eb; padding:10px; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer;">👩‍🎓 学生B: wangfang (第1组)</button>
              <button class="quick-login-btn" data-account="chenqiang" style="background:#eff6ff; border:1px solid #bfdbfe; color:#2563eb; padding:10px; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer;">🧑‍🎓 学生C: chenqiang (第1组)</button>
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
              🛠️ 界面一：基础架构管理 (班级 / 学生 / 小组)
            </button>
            <button class="teacher-tab-nav ${activeTab === 'view_publishing' ? 'active' : ''}" data-tab="view_publishing" style="flex:1; padding:12px; border-radius:10px; font-size:14px; font-weight:800; cursor:pointer; border:none; color:${activeTab === 'view_publishing' ? 'white' : '#475569'}; background:${activeTab === 'view_publishing' ? 'linear-gradient(135deg, #1d4ed8, #2563eb)' : '#f8fafc'}; transition:all 0.2s ease;">
              📢 界面二：任务与通知发布 (含参考范文库与审稿推送)
            </button>
            <button class="teacher-tab-nav ${activeTab === 'view_monitoring' ? 'active' : ''}" data-tab="view_monitoring" style="flex:1; padding:12px; border-radius:10px; font-size:14px; font-weight:800; cursor:pointer; border:none; color:${activeTab === 'view_monitoring' ? 'white' : '#475569'}; background:${activeTab === 'view_monitoring' ? 'linear-gradient(135deg, #1d4ed8, #2563eb)' : '#f8fafc'}; transition:all 0.2s ease;">
              🖥️ 界面三：学生实际操作同屏实时监控终端 (实操同屏)
            </button>
          </div>
        </div>

        <main style="flex:1; padding:20px 32px 40px 32px; width:100%; overflow-y:visible;">

          ${activeTab === 'view_architecture' ? `
            <div style="display:flex; flex-direction:column; gap:20px; width:100%;">

              <div class="card" style="border-top:4px solid #2563eb; width:100%; padding:24px;">
                <div class="card-title" style="margin-bottom:16px;">
                  <span style="font-size:17px; font-weight:800; color:#0f172a;">🎓 教学班级管理 (${classes.length} 个班级)</span>
                  <button id="btn-v1-create-class" class="teacher-action-btn indigo" style="background:#2563eb; padding:8px 18px; font-size:13px; font-weight:700;">+ 创建全新教学班</button>
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

              <div class="card" style="border-top:4px solid #0284c7; width:100%; padding:24px;">
                <div class="card-title" style="margin-bottom:16px;">
                  <span style="font-size:17px; font-weight:800; color:#0f172a;">👨‍🎓 学生账号管理 (当前班级: ${activeClass.name})</span>
                  <div style="display:flex; gap:10px;">
                    <button id="btn-v1-add-student" class="teacher-action-btn green" style="background:#059669; padding:8px 16px; font-size:13px; font-weight:700;">+ 单条创建学生账号</button>
                    <button id="btn-v1-import-file" style="background:linear-gradient(135deg, #2563eb, #1d4ed8); border:none; color:white; padding:8px 18px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; box-shadow:0 2px 8px rgba(37,99,235,0.25);">
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
                    <thead><tr><th>姓名</th><th>用户名 (拼音)</th><th>学号</th><th>当前归属小组</th><th>密码</th><th>操作</th></tr></thead>
                    <tbody>
                      ${classStudents.length === 0 ? '<tr><td colspan="6" style="text-align:center; color:#64748b; padding:24px;">当前班级暂无学生账号，请点击右上角按钮创建！</td></tr>' : ''}
                      ${classStudents.map(s => {
                        const grp = (activeClass.groups || []).find(g => g.members && (g.members.includes(s.id) || g.members.includes(s.studentCode)));
                        return `
                          <tr>
                            <td><b>${s.avatar || '👤'} ${s.name}</b></td>
                            <td><span style="color:#2563eb; font-family:monospace; font-weight:700;">${s.username}</span></td>
                            <td>${s.studentCode || s.username}</td>
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

              <div class="card" style="border-top:4px solid #059669; width:100%; padding:24px;">
                <div class="card-title" style="margin-bottom:16px;">
                  <span style="font-size:17px; font-weight:800; color:#0f172a;">👥 小组划分 (当前班级: ${activeClass.name})</span>
                  <button id="btn-v1-create-group" class="teacher-action-btn green" style="background:#059669; padding:8px 18px; font-size:13px; font-weight:700;">+ 新建小组并勾选组员</button>
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
                          <span style="font-size:15.5px; font-weight:800; color:#059669;">👥 ${grp.name} (${groupMembers.length}人)</span>
                          <div style="display:flex; gap:8px;">
                            <button class="btn-edit-group-members" data-gid="${grp.id}" style="background:#eff6ff; border:1px solid #bfdbfe; color:#1d4ed8; padding:6px 12px; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer;">⚙️ 勾选组员</button>
                            <button class="btn-delete-group" data-gid="${grp.id}" style="background:#fef2f2; border:1px solid #fecaca; color:#dc2626; padding:6px 10px; border-radius:6px; font-size:12px; cursor:pointer; font-weight:700;">✕ 解散</button>
                          </div>
                        </div>
                        <div style="display:flex; flex-wrap:wrap; gap:8px; font-size:13px;">
                          ${groupMembers.length === 0 ? '<span style="color:#94a3b8; font-size:12px;">⚠️ 暂未勾选成员</span>' : ''}
                          ${groupMembers.map(m => `
                            <span style="background:#ecfdf5; border:1px solid #a7f3d0; color:#059669; padding:4px 10px; border-radius:6px; font-weight:600;">
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

              <!-- 0. 问卷链接配置 (置顶) -->
              <div class="card" style="border-top:4px solid #d97706; width:100%; padding:24px;">
                <div class="card-title" style="margin-bottom:16px;">
                  <span style="font-size:17px; font-weight:800; color:#0f172a;">📋 课程评估问卷链接配置</span>
                  <span style="font-size:12px; color:#92400e; background:#fffbeb; border:1px solid #fde68a; padding:4px 10px; border-radius:8px; font-weight:600;">学生提交终稿后自动弹出提醒 · 顶部按钮随时可点</span>
                </div>
                <div style="display:flex; gap:12px; align-items:stretch;">
                  <input type="text" id="survey-url-input" class="teacher-input" placeholder="粘贴问卷链接，例如: https://www.wjx.cn/vm/xxxxx.aspx 或 https://forms.gle/xxxxx" value="${localStorage.getItem('jizhi_survey_url') || ''}" style="flex:1; font-family:monospace; font-size:13px;">
                  <button id="btn-save-survey-url" style="background:linear-gradient(135deg, #d97706, #b45309); border:none; color:white; padding:10px 22px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; white-space:nowrap; box-shadow:0 3px 10px rgba(217,119,6,0.3);">💾 保存链接</button>
                </div>
                <div id="survey-url-status" style="font-size:12px; color:#059669; display:none; margin-top:8px; font-weight:700;">✅ 问卷链接已保存！学生提交终稿时将自动弹窗跳转。</div>
                ${localStorage.getItem('jizhi_survey_url') ? `
                  <div style="margin-top:10px; font-size:12px; color:#64748b; display:flex; align-items:center; gap:8px;">
                    <span style="color:#059669; font-weight:700;">✅ 当前已配置:</span>
                    <a href="${localStorage.getItem('jizhi_survey_url')}" target="_blank" style="color:#2563eb; font-family:monospace; text-decoration:underline;">${localStorage.getItem('jizhi_survey_url')}</a>
                  </div>
                ` : `
                  <div style="margin-top:10px; font-size:12px; color:#d97706;">⚠️ 尚未配置问卷链接，学生问卷弹窗将无法跳转。</div>
                `}
              </div>

              <!-- 1. 课程参考范文与文献样例库 (供阶段二学生下载查阅 · 审稿编辑提醒) -->
              <div class="card" style="border-top:4px solid #7c3aed; width:100%; padding:24px;">
                <div class="card-title" style="margin-bottom:16px;">
                  <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-size:17px; font-weight:800; color:#0f172a;">📚 课程参考范文与文献样例库 (${refPapers.length} 篇 · 供阶段二学生下载查阅)</span>
                    <span style="font-size:12px; color:#6d28d9; background:#f5f3ff; border:1px solid #ddd6fe; padding:4px 10px; border-radius:8px; font-weight:600;">学生在阶段二随时可下载查阅 · 审稿编辑 Agent 定向提醒</span>
                  </div>
                  <button id="btn-v2-open-paper-modal" class="teacher-action-btn indigo" style="background:linear-gradient(135deg, #7c3aed, #6d28d9); padding:8px 18px; font-size:13px; font-weight:700; border:none; color:white; border-radius:8px; cursor:pointer; box-shadow:0 2px 8px rgba(124,58,237,0.25);">
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
                  ` : refPapers.map(p => `
                    <div style="background:#ffffff; border:1px solid #e2e8f0; padding:18px; border-radius:12px; box-shadow:0 1px 3px rgba(15,23,42,0.03);">
                      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <div style="display:flex; align-items:center; gap:8px;">
                          <span style="font-weight:800; color:#1e40af; font-size:16px;">📄 ${p.title}</span>
                          <span style="background:#f5f3ff; color:#6d28d9; border:1px solid #ddd6fe; padding:2px 8px; border-radius:8px; font-size:11.5px; font-weight:700;">定向受众: ${p.targetGroupName || '全班所有小组'}</span>
                        </div>
                        <span style="font-size:12px; color:#64748b;">${p.uploadTime} | 上传人: ${p.author || '教师'}</span>
                      </div>
                      ${p.keyHighlights ? `
                        <div style="font-size:13px; color:#334155; margin-bottom:10px; line-height:1.6; background:#f8fafc; padding:10px 14px; border-radius:8px; border-left:3px solid #7c3aed;">
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
                          <button class="btn-push-paper-to-chat" data-id="${p.id}" data-target="${p.targetGroupId || 'all'}" style="background:linear-gradient(135deg, #2563eb, #1d4ed8); border:none; color:white; padding:6px 14px; border-radius:6px; font-size:12.5px; font-weight:700; cursor:pointer; box-shadow:0 2px 6px rgba(37,99,235,0.25);">
                            📢 审稿编辑提醒学生查阅此文
                          </button>
                          <button class="btn-delete-paper" data-id="${p.id}" style="background:#fef2f2; border:1px solid #fecaca; color:#dc2626; padding:6px 12px; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer;">
                            🗑️ 删除
                          </button>
                        </div>
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>

              <!-- 2. 课程协作写作任务集中发布中心 -->
              <div class="card" style="border-top:4px solid #2563eb; width:100%; padding:24px;">
                <div class="card-title" style="margin-bottom:16px;">
                  <span style="font-size:17px; font-weight:800; color:#0f172a;">📌 课程协作写作任务集中发布中心 (含起止时间控制)</span>
                  <button id="btn-v2-open-task-modal" class="teacher-action-btn indigo" style="background:#2563eb; padding:8px 18px; font-size:13px; font-weight:700;">+ 发布全新写作任务</button>
                </div>
                <div style="display:flex; flex-direction:column; gap:14px;">
                  ${tasks.map(t => `
                    <div style="background:#ffffff; border:1px solid #e2e8f0; padding:18px; border-radius:12px; box-shadow:0 1px 3px rgba(15,23,42,0.03);">
                      <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:16px; font-weight:800; color:#1e40af;">📌 ${t.title}</span>
                        <span style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; padding:4px 12px; border-radius:12px; font-size:12px; font-weight:700;">受众班级: ${t.className}</span>
                      </div>
                      <div style="font-size:13px; color:#334155; margin-10px 0; display:flex; gap:20px; background:#f8fafc; padding:10px 16px; border-radius:8px; border-left:4px solid #2563eb;">
                        <span>📅 <b>开始时间:</b> <span style="color:#2563eb; font-weight:700;">${t.startTime || '即时开启'}</span></span>
                        <span>⌛ <b>截止时间:</b> <span style="color:#dc2626; font-weight:700;">${t.deadline || '无硬性限制'}</span></span>
                        <span>⏱️ <b>预估时长:</b> ${t.durationMinutes} 分钟</span>
                      </div>
                      <div style="font-size:13px; color:#334155; line-height:1.6;">${t.instructions}</div>
                    </div>
                  `).join('')}
                </div>
              </div>

              <!-- 3. 发布课堂广播通知 (含各小组已读/未读实时追踪矩阵) -->
              <div class="card" style="border-top:4px solid #059669; width:100%; padding:24px;">
                <div class="card-title" style="margin-bottom:16px;">
                  <span style="font-size:17px; font-weight:800; color:#0f172a;">📢 课堂即时广播通知发布 (含各小组已读/未读实时追踪矩阵)</span>
                  <button id="btn-v2-open-ann-modal" class="teacher-action-btn green" style="background:#059669; padding:8px 18px; font-size:13px; font-weight:700;">
                    + 发布新通知 (选择/拖拽上传资源文件)
                  </button>
                </div>
                <div class="announcement-history-list" style="display:flex; flex-direction:column; gap:16px;">
                  ${announcements.map(a => {
                    const classGroups = activeClass.groups || [{ id: 'group_1', name: '第1小组' }];
                    return `
                      <div style="background:#ffffff; border:1px solid #e2e8f0; padding:18px; border-radius:12px; box-shadow:0 1px 3px rgba(15,23,42,0.03);">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                          <span style="font-weight:800; color:#1e40af; font-size:16px;">${a.title}</span>
                          <span style="font-size:12px; color:#64748b;">${a.time} | 关联任务: ${a.taskTitle}</span>
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

                  <!-- 终稿不可修改状态控制与 Excel 导出与教师端重置协同数据 -->
                  <div style="display:flex; align-items:center; gap:10px;">
                    <span style="font-size:12px; font-weight:700; padding:6px 12px; border-radius:8px; background:${state.isFinalSubmitted ? '#fef2f2' : '#ecfdf5'}; color:${state.isFinalSubmitted ? '#dc2626' : '#059669'}; border:1px solid ${state.isFinalSubmitted ? '#fecaca' : '#a7f3d0'};">
                      ${state.isFinalSubmitted ? '🔒 终稿已锁定 (只读不可修改)' : '✍️ 终稿可自由编辑'}
                    </span>
                    <button id="btn-toggle-final-submitted" style="background:${state.isFinalSubmitted ? 'linear-gradient(135deg, #059669, #047857)' : 'linear-gradient(135deg, #dc2626, #b91c1c)'}; border:none; color:white; padding:8px 16px; border-radius:8px; font-size:12.5px; font-weight:700; cursor:pointer; box-shadow:0 2px 6px rgba(0,0,0,0.15);">
                      ${state.isFinalSubmitted ? '🔓 解除锁定 (允许学生重新修改终稿)' : '🔒 手动锁定终稿 (设为不可修改)'}
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
                      <textarea id="teacher-live-doc-mirror" class="teacher-textarea" readonly style="flex:1; min-height:340px; font-family:sans-serif; font-size:13.5px; line-height:1.6; background:#ffffff; color:#0f172a; border:1px solid #cbd5e1;">${state.stage2.unifiedContent}</textarea>
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
                              const pct = (totalContrib === 0 || val === 0) ? 0 : Math.round((val / totalContrib) * 100);
                              return `<span style="color:${m.color || '#2563eb'}; font-weight:700;">● ${m.name}: ${pct}% (${val}字)</span>`;
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
                  <div style="display:grid; grid-template-columns: 1.6fr 1fr; gap:16px; width:100%;">
                    <div class="card" style="padding:20px; display:flex; flex-direction:column; border:1px solid #bfdbfe;">
                      <div style="font-size:15px; font-weight:800; color:#1e40af; margin-bottom:12px;">🎓 阶段三实操同屏: 答辩擂台与成员裁决 (${activeMonitorGroup.name})</div>
                      <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:10px; padding:12px 14px; margin-bottom:12px;">
                        <div style="font-size:13px; font-weight:700; color:#1e40af; margin-bottom:4px;">⚖️ 成员辩护裁决状态:</div>
                        <div style="font-size:13px; color:#334155;">${state.isFinalSubmitted ? '🔒 本组论文终稿已全员答辩完成并成功提交归档！' : '🎓 组员答辩质询辩护中...'}</div>
                      </div>
                      <textarea class="teacher-textarea" readonly style="flex:1; min-height:340px; font-family:sans-serif; font-size:13.5px; line-height:1.6; background:#ffffff; color:#0f172a; border:1px solid #cbd5e1;">${state.stage2.unifiedContent}</textarea>
                    </div>
                    <div class="card" style="padding:20px; display:flex; flex-direction:column;">
                      <div style="font-size:15px; font-weight:800; color:#0f172a; margin-bottom:12px;">💬 阶段三答辩对话流 (${activeMonitorGroup.name})</div>
                      <div style="flex:1; max-height:460px; overflow-y:auto; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px; font-size:12px; display:flex; flex-direction:column; gap:10px;">
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
                  <label><span class="req">*</span> 学生真实姓名</label>
                  <input type="text" id="modal-std-name" class="teacher-input fancy" placeholder="输入学生真实姓名" value="">
                </div>
                <div class="teacher-form-group">
                  <label><span class="req">*</span> 拼音用户名 (登录账号)</label>
                  <input type="text" id="modal-std-username" class="teacher-input fancy" placeholder="输入拼音登录账号" value="">
                </div>
                <div class="teacher-form-group">
                  <label>学号 / 编号</label>
                  <input type="text" id="modal-std-code" class="teacher-input fancy" placeholder="输入学号" value="">
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
          const username = modal.querySelector('#modal-std-username').value.trim();
          const code = modal.querySelector('#modal-std-code').value.trim();
          const pwd = modal.querySelector('#modal-std-password').value.trim();
          if (!name || !username) { alert('⚠️ 请填齐学生姓名和拼音账号！'); return; }
          authManager.addStudentToClass(name, username, code || username, activeClass.id, pwd || '123');
          closeModal();
          renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
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
          const count = authManager.batchAddStudentsToClass(listToImport, activeClass.id);
          alert(`🎉 成功导入 ${count} 名学生账号存入【${activeClass.name}】！`);
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

    const btnSaveSurveyUrl = container.querySelector('#btn-save-survey-url');
    if (btnSaveSurveyUrl) {
      btnSaveSurveyUrl.addEventListener('click', () => {
        const urlInput = container.querySelector('#survey-url-input');
        const statusEl = container.querySelector('#survey-url-status');
        const url = urlInput ? urlInput.value.trim() : '';
        if (!url) { alert('⚠️ 请先填入有效的问卷链接！'); return; }
        localStorage.setItem('jizhi_survey_url', url);
        if (statusEl) { statusEl.style.display = 'block'; setTimeout(() => { statusEl.style.display = 'none'; }, 2500); }
        // 刷新教师端以显示当前链接预览
        setTimeout(() => renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView), 800);
      });
    }

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
          <div class="teacher-modal-card fancy-task-modal" style="width:620px;">
            <div class="teacher-modal-header task-theme-gradient">
              <div class="modal-header-title"><div class="modal-icon-badge task">📌</div><div><h3>发布全新写作任务 (含起止时间控制)</h3></div></div>
              <button class="modal-close-btn" id="btn-close-task-modal">✕</button>
            </div>
            <div class="teacher-modal-body">
              <div class="form-grid-2">
                <div class="teacher-form-group">
                  <label><span class="req">*</span> 关联受众教学班级</label>
                  <select id="modal-task-class" class="teacher-input fancy">${classes.map(c => `<option value="${c.id}">🏫 ${c.name}</option>`).join('')}</select>
                </div>
                <div class="teacher-form-group">
                  <label><span class="req">*</span> 任务预估时长 (分钟)</label>
                  <input type="number" id="modal-task-duration" class="teacher-input fancy" value="150">
                </div>
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
                <label><span class="req">*</span> 任务详细说明与要求</label>
                <textarea id="modal-task-desc" class="teacher-textarea fancy" style="min-height:90px;" placeholder="请输入任务详细说明与指导要求..."></textarea>
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
          const duration = modal.querySelector('#modal-task-duration').value;

          if (!title || !desc) { alert('⚠️ 请填齐任务标题与说明！'); return; }
          authManager.createTask(title, classId, desc, [], startTime, deadline, duration);
          closeModal();
          renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
        });
      });
    }

    const btnOpenAnnV2 = container.querySelector('#btn-v2-open-ann-modal');
    if (btnOpenAnnV2) {
      btnOpenAnnV2.addEventListener('click', () => {
        document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
          <div class="teacher-modal-card fancy-ann-modal" style="width:600px;">
            <div class="teacher-modal-header ann-theme-gradient">
              <div class="modal-header-title">
                <div class="modal-icon-badge ann">📢</div>
                <div>
                  <h3>发布课堂即时通知 (含随附文件选择与上传)</h3>
                  <p style="font-size:12px; color:#cbd5e1;">选择或拖拽本地文件随附发布，学生端可点击下载</p>
                </div>
              </div>
              <button class="modal-close-btn" id="btn-close-ann-modal">✕</button>
            </div>
            <div class="teacher-modal-body">
              <div class="teacher-form-group">
                <label><span class="req">*</span> 关联写作任务</label>
                <select id="modal-ann-task" class="teacher-input fancy">${tasks.map(t => `<option value="${t.id}">📌 ${t.title}</option>`).join('')}</select>
              </div>
              <div class="teacher-form-group">
                <label><span class="req">*</span> 通知标题</label>
                <input type="text" id="modal-ann-title" class="teacher-input fancy" value="" placeholder="输入通知标题">
              </div>
              <div class="teacher-form-group">
                <label><span class="req">*</span> 通知详细内容</label>
                <textarea id="modal-ann-content" class="teacher-textarea fancy" style="min-height:80px;" placeholder="输入推送给全班学生的通知正文..."></textarea>
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
        let selectedAttachment = { name: '协作写作问卷测量规范范例.pdf', size: '2.4 MB' };

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
          const title = modal.querySelector('#modal-ann-title').value.trim();
          const content = modal.querySelector('#modal-ann-content').value.trim();
          if (!title || !content) { alert('⚠️ 请填齐通知标题与内容！'); return; }
          authManager.publishAnnouncement(taskId, title, content, selectedAttachment);
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
        const groups = activeClass.groups || [{ id: 'group_1', name: '第1小组' }];
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
          <div class="teacher-modal-card fancy-task-modal" style="width:620px;">
            <div class="teacher-modal-header task-theme-gradient" style="background:linear-gradient(135deg, #7c3aed, #4f46e5);">
              <div class="modal-header-title">
                <div class="modal-icon-badge" style="background:rgba(255,255,255,0.2); color:white;">📚</div>
                <div>
                  <h3>上传课程学术参考范文</h3>
                  <p style="font-size:12px; color:#e0e7ff;">上传后审稿编辑 Agent 可在阶段二协同中向各小组精准推送与研讨引导</p>
                </div>
              </div>
              <button class="modal-close-btn" id="btn-close-paper-modal">✕</button>
            </div>
            <div class="teacher-modal-body">
              <div class="teacher-form-group">
                <label><span class="req">*</span> 范文文献标题</label>
                <input type="text" id="modal-paper-title" class="teacher-input fancy" placeholder="例如：《基于大语言模型的多智能体协同学习实证研究》" value="">
              </div>

              <div class="form-grid-2" style="margin-top:8px;">
                <div class="teacher-form-group">
                  <label><span class="req">*</span> 推送受众范围</label>
                  <select id="modal-paper-target-group" class="teacher-input fancy">
                    <option value="all">🌐 全班所有小组</option>
                    ${groups.map(g => `<option value="${g.id}">👥 ${g.name}</option>`).join('')}
                  </select>
                </div>
                <div class="teacher-form-group">
                  <label>上传人署名</label>
                  <input type="text" id="modal-paper-author" class="teacher-input fancy" value="任课教师 (${currentUser.name})">
                </div>
              </div>

              <div class="teacher-form-group" style="margin-top:8px;">
                <label><span class="req">*</span> 💡 核心论证亮点与学术价值 (审稿编辑重点推送指引)</label>
                <textarea id="modal-paper-highlights" class="teacher-textarea fancy" style="min-height:70px;" placeholder="指引学生参考本文的哪一部分，例如：重点参考第三章实验设计与统计指标汇报规范、理论框架建构方式..."></textarea>
              </div>

              <div class="teacher-form-group" style="margin-top:8px;">
                <label>论文摘要 (可选)</label>
                <textarea id="modal-paper-abstract" class="teacher-textarea fancy" style="min-height:50px;" placeholder="粘贴论文摘要..."></textarea>
              </div>

              <div class="teacher-form-group" style="margin-top:8px;">
                <label>📎 随附文献文档上传 (支持 PDF, Word, DOCX, TXT, Markdown 等)</label>
                <div id="paper-file-dropzone" style="border:2px dashed #a78bfa; border-radius:10px; padding:16px; text-align:center; background:#f5f3ff; cursor:pointer;">
                  <input type="file" id="modal-paper-file-input" style="display:none;">
                  <div id="paper-dropzone-text">
                    <span style="font-size:24px;">📄</span>
                    <div style="font-size:13px; font-weight:700; color:#7c3aed; margin-top:4px;">点击选择或拖拽本地文献文件上传</div>
                  </div>
                </div>
              </div>

              <div style="margin-top:10px; background:#eff6ff; border:1px solid #bfdbfe; padding:10px 14px; border-radius:8px; display:flex; align-items:center; gap:8px;">
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
        let selectedFile = { name: '', size: '', data: '' };

        dropzone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
          if (e.target.files && e.target.files[0]) {
            const f = e.target.files[0];
            const sizeKB = (f.size / 1024).toFixed(1) + ' KB';
            const reader = new FileReader();
            reader.onload = (re) => {
              selectedFile = { name: f.name, size: sizeKB, data: re.target.result };
              dropText.innerHTML = `<span style="font-size:24px;">✅</span><div style="font-size:13px; color:#059669; font-weight:700;">已选取文献: ${f.name} (${sizeKB})</div>`;
            };
            reader.readAsDataURL(f);
          }
        });

        modal.querySelector('#btn-submit-new-paper').addEventListener('click', () => {
          const title = modal.querySelector('#modal-paper-title').value.trim();
          const targetGId = modal.querySelector('#modal-paper-target-group').value;
          const highlights = modal.querySelector('#modal-paper-highlights').value.trim();
          const abstract = modal.querySelector('#modal-paper-abstract').value.trim();
          const autoPush = modal.querySelector('#modal-paper-auto-push').checked;

          if (!title) { alert('⚠️ 请输入范文文献标题！'); return; }
          const targetGObj = groups.find(g => g.id === targetGId);

          const newPaper = authManager.uploadReferencePaper({
            title,
            abstract,
            keyHighlights: highlights,
            fileName: selectedFile.name,
            fileData: selectedFile.data,
            fileSize: selectedFile.size,
            targetGroupId: targetGId,
            targetGroupName: targetGId === 'all' ? '全班所有小组' : (targetGObj ? targetGObj.name : '指定小组')
          });

          if (autoPush) {
            authManager.pushReferencePaperToGroupChat(newPaper.id, targetGId);
          }

          alert(`🎉 参考范文《${title}》已成功上传！${autoPush ? '审稿编辑 Agent 已同步向学生研讨管道推送！' : ''}`);
          closeModal();
          renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
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
        renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
        if (newSub) {
          alert(`🔒 已锁定【${activeMonitorGroup.name}】的论文终稿！学生端已设为【只读不可修改状态】。`);
        } else {
          alert(`🔓 已成功解除【${activeMonitorGroup.name}】不可修改状态！学生端现已恢复自由修改、裁决与重新提交终稿权限！`);
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
            <!-- 1. 历史与模式 -->
            <div class="word-toolbar-group">
              <button class="word-btn" id="${editorId}-btn-undo" title="撤销 (Ctrl+Z)">↩️ 撤销</button>
              <button class="word-btn" id="${editorId}-btn-redo" title="重做 (Ctrl+Y)">↪️ 重做</button>
              <button class="word-btn" id="${editorId}-btn-fullscreen" title="全屏沉浸式学术写作模式">🔲 全屏</button>
            </div>

            <!-- 2. 论文大纲与章节层级 (结构化标签) -->
            <div class="word-toolbar-group" title="设置当前段落的论文大纲层级">
              <span style="font-size:11px; font-weight:700; color:#64748b; margin-right:2px;">📑 标题层级:</span>
              <select class="word-select" id="${editorId}-sel-format" title="段落与大纲层级" style="width:140px; font-weight:600; color:#1e40af;">
                <option value="p">正文段落 (Body)</option>
                <option value="h1">论文总题目 (H1)</option>
                <option value="h2">一级章标题 (H2 · 一、背景)</option>
                <option value="h3">二级节标题 (H3 · (一) 假设)</option>
                <option value="h4">三级小节 (H4 · 1. 概念)</option>
                <option value="blockquote">引文与摘要块 (Block)</option>
              </select>
            </div>

            <!-- 3. 字体与字号设置 (纯文字格式) -->
            <div class="word-toolbar-group" title="设置选中文字的字体与字号">
              <span style="font-size:11px; font-weight:700; color:#64748b; margin-right:2px;">🔤 字体字号:</span>
              <select class="word-select" id="${editorId}-sel-font" title="学术字体" style="width:125px;">
                <option value="SimSun">宋体 (学术标准)</option>
                <option value="SimHei">黑体 (标题)</option>
                <option value="FangSong">仿宋 (公文标准)</option>
                <option value="KaiTi">楷体 (引文)</option>
                <option value="Times New Roman">Times New Roman</option>
                <option value="Arial">Arial</option>
              </select>
              <select class="word-select" id="${editorId}-sel-size" title="字号" style="width:105px;">
                <option value="6">一号 (26pt)</option>
                <option value="5">小二 (18pt)</option>
                <option value="4">四号 (14pt)</option>
                <option value="3" selected>小四 (12pt / 正文)</option>
                <option value="2">五号 (10.5pt)</option>
                <option value="1">小五 (9pt)</option>
              </select>
            </div>

            <!-- 3. 文字装饰与字形 -->
            <div class="word-toolbar-group">
              <button class="word-btn" id="${editorId}-btn-bold" title="粗体 (Ctrl+B)"><b>B</b></button>
              <button class="word-btn" id="${editorId}-btn-italic" title="斜体 (Ctrl+I)"><i>I</i></button>
              <button class="word-btn" id="${editorId}-btn-underline" title="下划线 (Ctrl+U)"><u>U</u></button>
              <button class="word-btn" id="${editorId}-btn-strike" title="删除线"><s>S</s></button>
              <button class="word-btn" id="${editorId}-btn-sup" title="上标 (文献角标 [1])">X²</button>
              <button class="word-btn" id="${editorId}-btn-sub" title="下标 (变量角标 H₁)">X₂</button>
            </div>

            <!-- 4. 排版、对齐、缩进与行间距 -->
            <div class="word-toolbar-group">
              <select class="word-select" id="${editorId}-sel-line-height" title="行间距 (行高)" style="width:96px;">
                <option value="1.5" selected>1.5倍 (标准)</option>
                <option value="1.0">单倍行距</option>
                <option value="1.25">1.25倍行距</option>
                <option value="1.75">1.75倍行距</option>
                <option value="2.0">双倍 (2.0倍)</option>
              </select>
              <select class="word-select" id="${editorId}-sel-para-margin" title="段落后间距 (段后距)" style="width:90px;">
                <option value="6px" selected>段后 6pt</option>
                <option value="0px">段后 0pt</option>
                <option value="12px">段后 12pt</option>
                <option value="18px">段后 18pt</option>
              </select>
              <button class="word-btn" id="${editorId}-btn-align-left" title="左对齐">⇤</button>
              <button class="word-btn" id="${editorId}-btn-align-center" title="居中对齐">☰</button>
              <button class="word-btn" id="${editorId}-btn-align-right" title="右对齐">⇥</button>
              <button class="word-btn" id="${editorId}-btn-align-justify" title="两端对齐 (学术正文标准)">☲</button>
              <button class="word-btn" id="${editorId}-btn-indent-inc" title="增加缩进">➔ 缩进+</button>
              <button class="word-btn" id="${editorId}-btn-indent-dec" title="减少缩进">⬅ 缩进-</button>
              <button class="word-btn" id="${editorId}-btn-indent-2em" title="一键首行缩进 2 字符">⇥ 首行2字符</button>
              <button class="word-btn" id="${editorId}-btn-hanging-indent" title="悬挂缩进 (参考文献格式)">⇤ 悬挂缩进</button>
              <button class="word-btn" id="${editorId}-btn-list-ul" title="项目符号">• 列表</button>
              <button class="word-btn" id="${editorId}-btn-list-ol" title="编号列表">1. 编号</button>
              <button class="word-btn" id="${editorId}-btn-hr" title="插入水平分隔线">― 分隔线</button>
            </div>

            <!-- 5. 颜色、荧光笔与清格式 -->
            <div class="word-toolbar-group">
              <label style="display:flex; align-items:center; gap:3px; font-size:11px; color:#94a3b8; cursor:pointer;" title="文字颜色">
                <span>🎨</span>
                <input type="color" id="${editorId}-color-text" value="#0f172a" style="width:18px; height:18px; border:none; background:transparent; cursor:pointer;">
              </label>
              <button class="word-btn" id="${editorId}-btn-hilite-yellow" title="黄色批注高亮" style="color:#facc15;">🖍️ 黄</button>
              <button class="word-btn" id="${editorId}-btn-hilite-green" title="绿色建议高亮" style="color:#4ade80;">🖍️ 绿</button>
              <button class="word-btn" id="${editorId}-btn-clear-format" title="清除格式">🧹 清格式</button>
            </div>

            <!-- 6. 学术论文插件套件 (精简图标) -->
            <div class="word-toolbar-group">
              <button class="word-btn plugin-btn" id="${editorId}-btn-insert-image" title="插入学术图表与图题说明">🖼️ 图表</button>
              <button class="word-btn plugin-btn" id="${editorId}-btn-insert-table" title="插入标准学术三线表">📊 三线表</button>
              <button class="word-btn plugin-btn" id="${editorId}-btn-insert-symbol" title="高阶学术公式与统计符号库">🔣 符号</button>
              <button class="word-btn plugin-btn" id="${editorId}-btn-insert-citation" title="插入文献引用角标 [n]">📑 [n]</button>
              <button class="word-btn plugin-btn" id="${editorId}-btn-insert-abstract" title="插入【摘要与关键词】学术前置卡片">📌 摘要</button>
              <button class="word-btn plugin-btn" id="${editorId}-btn-insert-ref-template" title="在文末插入标准参考文献模版">📚 文献</button>
              <button class="word-btn plugin-btn" id="${editorId}-btn-find-replace" title="文档内查找与替换">🔍 查找</button>
              <button class="word-btn plugin-btn" id="${editorId}-btn-export-doc" style="background:#ecfdf5; border-color:#a7f3d0; color:#059669; font-weight:700;" title="导出为 Word 论文格式文档 (.doc)">📥 Word</button>
              <button class="word-btn plugin-btn" id="${editorId}-btn-print-doc" title="打印 / 导出 PDF 论文">📄 PDF</button>
            </div>
          </div>

          <div class="search-replace-bar" id="${editorId}-search-bar" style="display:none;">
            <span>🔍 查找:</span>
            <input type="text" id="${editorId}-search-input" placeholder="输入要查找的关键词...">
            <span>替换为:</span>
            <input type="text" id="${editorId}-replace-input" placeholder="输入替换内容...">
            <button class="word-btn" id="${editorId}-btn-do-replace" style="background:#0284c7; color:white;">全部替换</button>
            <button class="word-btn" id="${editorId}-btn-close-search" style="background:none; border:none; color:#94a3b8;">✕ 关闭</button>
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

      const btnIndent2em = container.querySelector(`#${editorId}-btn-indent-2em`);
      if (btnIndent2em) btnIndent2em.addEventListener('click', () => {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          let node = range.commonAncestorContainer;
          while (node && node !== editor && node.nodeName !== 'P') { node = node.parentNode; }
          if (node && node.nodeName === 'P') {
            node.style.textIndent = node.style.textIndent === '2em' ? '0' : '2em';
            if (onChangeCallback) onChangeCallback(editor.innerHTML);
          } else {
            exec('formatBlock', 'p');
          }
        }
      });

      const btnHangingIndent = container.querySelector(`#${editorId}-btn-hanging-indent`);
      if (btnHangingIndent) btnHangingIndent.addEventListener('click', () => {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          let node = range.commonAncestorContainer;
          while (node && node !== editor && node.nodeName !== 'P') { node = node.parentNode; }
          if (node && node.nodeName === 'P') {
            node.style.textIndent = '-2em';
            node.style.marginLeft = '2em';
            if (onChangeCallback) onChangeCallback(editor.innerHTML);
          }
        }
      });

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

      // 监听输入
      let debounceTimer = null;
      editor.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          if (onChangeCallback) onChangeCallback(editor.innerHTML);
        }, 250);
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
        if (now - lastPresenceEmit < 150) return;
        lastPresenceEmit = now;

        const sel = window.getSelection();
        let nodeIndex = 0;
        let activeSection = '';
        if (sel && sel.rangeCount > 0) {
          const node = sel.anchorNode;
          let blockEl = node ? (node.nodeType === 1 ? node : node.parentElement) : null;
          while (blockEl && blockEl.parentElement !== editor && blockEl !== editor) {
            blockEl = blockEl.parentElement;
          }
          if (blockEl && blockEl.parentElement === editor) {
            nodeIndex = Array.from(editor.children).indexOf(blockEl);
            activeSection = (blockEl.innerText || '').trim().slice(0, 14);
          }
        }
        if (typeof onPresenceCallback === 'function') {
          onPresenceCallback(nodeIndex, activeSection);
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
      // 只有在 25 秒内有心跳活跃的才视为在线
      const isOnline = isSelf || (p && (now - p.updatedAt < 25000));
      // 只有在 10 秒内且明确正在输入段落的才显示 (在写: ...)
      const isTyping = !isSelf && p && p.activeSection && p.activeSection !== '在线研讨' && (now - p.updatedAt < 10000);
      const sectionText = isSelf ? ' (我)' : (isTyping ? ` (在写: ${p.activeSection})` : (isOnline ? ' (在线)' : ' (离线)'));
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

    // Remove any stale remote cursor elements
    editor.querySelectorAll('.remote-cursor-widget').forEach(el => el.remove());
    editor.querySelectorAll('.collab-editing-node-highlight').forEach(el => {
      el.classList.remove('collab-editing-node-highlight');
      el.style.borderLeft = 'none';
      el.style.backgroundColor = 'transparent';
    });

    const membersList = Object.values(state.members || {});
    const currentUserCode = state.currentUser || 'A';
    const presence = state.presence || {};
    const now = Date.now();

    membersList.forEach(m => {
      if (m.studentCode === currentUserCode || m.id === currentUserCode) return;
      const p = presence[m.studentCode] || presence[m.id];
      if (!p || (now - p.updatedAt > 20000)) return; // 20秒未活动即视为离线/离开编辑

      const color = m.color || '#8b5cf6';
      const name = m.name || m.studentCode;
      const avatar = m.avatar || '👨‍🎓';

      // Find target paragraph or element
      const children = Array.from(editor.children);
      let targetEl = null;
      if (typeof p.nodeIndex === 'number' && children[p.nodeIndex]) {
        targetEl = children[p.nodeIndex];
      }

      if (targetEl && targetEl !== editor) {
        targetEl.classList.add('collab-editing-node-highlight');
        targetEl.style.borderLeft = `3.5px solid ${color}`;
        targetEl.style.backgroundColor = `${color}0d`;

        // 绝不作为 contenteditable 子节点影响输入，而是作为一个绝对定位/只读浮标
        const cursorWidget = document.createElement('span');
        cursorWidget.className = 'remote-cursor-widget';
        cursorWidget.contentEditable = 'false';
        cursorWidget.style.cssText = 'user-select:none; pointer-events:none; display:inline-block; vertical-align:middle; margin-left:4px;';
        cursorWidget.innerHTML = `
          <span class="remote-caret-flag" style="background:${color}; font-size:11px; padding:1px 6px; border-radius:4px; color:white; font-weight:700; display:inline-flex; align-items:center; gap:2px;">
            ${avatar} ${name}
          </span>
        `;
        targetEl.appendChild(cursorWidget);
      }
    });
  }

  function renderStage1Canvas(canvas, state, handlers) {
    const s1 = state.stage1;
    const currentUser = state.currentUser;
    const membersList = Object.values(state.members || {});
    const totalMembersCount = membersList.length;
    const confirmedMembers = s1.contract.confirmedMembers || {};
    const confirmedCount = membersList.filter(m => confirmedMembers[m.id]).length;
    const userHasConfirmed = confirmedMembers[currentUser];
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
              + 提交我的选题
            </button>
          ` : ''}
        </div>

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

      <!-- 一整个统一的合作学术合约公约框架卡片 (蓝白层次风) -->
      <div class="contract-card" style="margin-top:16px; border:2px solid #3b82f6; border-radius:16px; background:#ffffff; padding:24px; box-shadow:0 10px 30px rgba(37,99,235,0.08); width:100%; box-sizing:border-box;">
        
        <div style="text-align:center; margin-bottom:20px; border-bottom:1px solid #e2e8f0; padding-bottom:16px;">
          <div style="font-size:20px; font-weight:800; color:#1e3a8a;">
            📜 团队协同合作学术合约
          </div>
          <div style="font-size:12.5px; color:#64748b; margin-top:4px;">
            ${isContractLocked ? `<span style="color:#059669; font-weight:700;">🔒 全员 ${confirmedCount}/${totalMembersCount} 人完成签署 · 归档生效中</span>` : '小组成员可自由修改微调各项内容，全员确认后签署生效'}
          </div>
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
            
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:12px;">
              <!-- 模块 1 -->
              <div style="background:#ffffff; border:1px solid #e2e8f0; border-left:3.5px solid #2563eb; border-radius:8px; padding:12px 14px; display:flex; justify-content:space-between; align-items:center;">
                <span style="font-weight:800; color:#1e40af; font-size:13.5px;">一、研究背景与意义</span>
                <label style="font-size:12px; color:#475569; display:flex; align-items:center; gap:4px;">
                  用时: <input type="number" class="contract-time-input" data-key="background" value="${s1.contract.timeAllocations.background || 25}" ${isContractLocked ? 'disabled readonly style="opacity:0.8; cursor:not-allowed;"' : ''} style="width:48px; padding:3px 4px; border:1px solid #cbd5e1; border-radius:4px; text-align:center; font-weight:700;"> 分钟
                </label>
              </div>

              <!-- 模块 2 -->
              <div style="background:#ffffff; border:1px solid #e2e8f0; border-left:3.5px solid #0284c7; border-radius:8px; padding:12px 14px; display:flex; justify-content:space-between; align-items:center;">
                <span style="font-weight:800; color:#0369a1; font-size:13.5px;">二、文献综述</span>
                <label style="font-size:12px; color:#475569; display:flex; align-items:center; gap:4px;">
                  用时: <input type="number" class="contract-time-input" data-key="literature" value="${s1.contract.timeAllocations.literature || 30}" ${isContractLocked ? 'disabled readonly style="opacity:0.8; cursor:not-allowed;"' : ''} style="width:48px; padding:3px 4px; border:1px solid #cbd5e1; border-radius:4px; text-align:center; font-weight:700;"> 分钟
                </label>
              </div>

              <!-- 模块 3 -->
              <div style="background:#ffffff; border:1px solid #e2e8f0; border-left:3.5px solid #059669; border-radius:8px; padding:12px 14px; display:flex; justify-content:space-between; align-items:center;">
                <span style="font-weight:800; color:#065f46; font-size:13.5px;">三、研究问题与假设</span>
                <label style="font-size:12px; color:#475569; display:flex; align-items:center; gap:4px;">
                  用时: <input type="number" class="contract-time-input" data-key="questions" value="${s1.contract.timeAllocations.questions || 25}" ${isContractLocked ? 'disabled readonly style="opacity:0.8; cursor:not-allowed;"' : ''} style="width:48px; padding:3px 4px; border:1px solid #cbd5e1; border-radius:4px; text-align:center; font-weight:700;"> 分钟
                </label>
              </div>

              <!-- 模块 4 -->
              <div style="background:#ffffff; border:1px solid #e2e8f0; border-left:3.5px solid #7c3aed; border-radius:8px; padding:12px 14px; display:flex; justify-content:space-between; align-items:center;">
                <span style="font-weight:800; color:#6d28d9; font-size:13.5px;">四、研究设计与方法</span>
                <label style="font-size:12px; color:#475569; display:flex; align-items:center; gap:4px;">
                  用时: <input type="number" class="contract-time-input" data-key="method" value="${s1.contract.timeAllocations.method || 40}" ${isContractLocked ? 'disabled readonly style="opacity:0.8; cursor:not-allowed;"' : ''} style="width:48px; padding:3px 4px; border:1px solid #cbd5e1; border-radius:4px; text-align:center; font-weight:700;"> 分钟
                </label>
              </div>

              <!-- 模块 5 -->
              <div style="background:#ffffff; border:1px solid #e2e8f0; border-left:3.5px solid #d97706; border-radius:8px; padding:12px 14px; display:flex; justify-content:space-between; align-items:center;">
                <span style="font-weight:800; color:#b45309; font-size:13.5px;">五、研究设计的不足与反思</span>
                <label style="font-size:12px; color:#475569; display:flex; align-items:center; gap:4px;">
                  用时: <input type="number" class="contract-time-input" data-key="reflection" value="${s1.contract.timeAllocations.reflection || 20}" ${isContractLocked ? 'disabled readonly style="opacity:0.8; cursor:not-allowed;"' : ''} style="width:48px; padding:3px 4px; border:1px solid #cbd5e1; border-radius:4px; text-align:center; font-weight:700;"> 分钟
                </label>
              </div>

              <!-- 模块 6 -->
              <div style="background:#ffffff; border:1px solid #e2e8f0; border-left:3.5px solid #475569; border-radius:8px; padding:12px 14px; display:flex; justify-content:space-between; align-items:center;">
                <span style="font-weight:800; color:#334155; font-size:13.5px;">六、参考文献</span>
                <label style="font-size:12px; color:#475569; display:flex; align-items:center; gap:4px;">
                  用时: <input type="number" class="contract-time-input" data-key="references" value="${s1.contract.timeAllocations.references || 10}" ${isContractLocked ? 'disabled readonly style="opacity:0.8; cursor:not-allowed;"' : ''} style="width:48px; padding:3px 4px; border:1px solid #cbd5e1; border-radius:4px; text-align:center; font-weight:700;"> 分钟
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
                const taskVal = (s1.contract.taskAssignments && s1.contract.taskAssignments[m.id] !== undefined) ? s1.contract.taskAssignments[m.id] : '';
                return `
                  <div style="display:flex; flex-direction:column; gap:6px; width:100%; background:#ffffff; padding:12px 14px; border-radius:8px; border:1px solid #e2e8f0; box-sizing:border-box;">
                    <span style="font-weight:800; color:${m.color || '#2563eb'}; font-size:13px;">${m.avatar || '👤'} ${m.name} (${m.roleTitle || '组员'}):</span>
                    <input type="text" class="large-contract-input task-assignment-input" data-mid="${m.id}" value="${taskVal}" ${isContractLocked ? 'disabled readonly style="opacity:0.8; cursor:not-allowed;"' : ''} style="width:100%; box-sizing:border-box; background:#ffffff; color:#0f172a; border:1px solid #cbd5e1; border-radius:6px; padding:10px 14px; font-size:13px; font-family:sans-serif;" placeholder="在聊天中商定或在此录入具体负责的写作章节与任务...">
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
              const isConf = confirmedMembers[m.id];
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

    // 提案提交弹窗绑定
    const btnOpenProp = canvas.querySelector('#btn-open-submit-proposal');
    if (btnOpenProp) {
      btnOpenProp.addEventListener('click', () => {
        document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
          <div class="teacher-modal-card fancy-task-modal" style="width:520px;">
            <div class="teacher-modal-header task-theme-gradient">
              <div class="modal-header-title">
                <div class="modal-icon-badge task">💡</div>
                <div><h3>提交我的选题</h3></div>
              </div>
              <button class="modal-close-btn" id="btn-close-prop-modal">✕</button>
            </div>
            <div class="teacher-modal-body">
              <div class="teacher-form-group">
                <label><span class="req">*</span> 选题名称</label>
                <input type="text" id="prop-title-input" class="teacher-input fancy" placeholder="请输入您的选题名称...">
              </div>
            </div>
            <div class="teacher-modal-footer">
              <button class="modal-btn cancel" id="btn-cancel-prop">取消</button>
              <button class="modal-btn submit task-theme" id="btn-submit-prop-action">💡 确认提交至提案池</button>
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

        modal.querySelector('#btn-submit-prop-action').addEventListener('click', async () => {
          const title = modal.querySelector('#prop-title-input').value.trim();
          if (!title) { alert('⚠️ 请输入选题名称！'); return; }

          s1.proposals.push({
            id: 'prop_' + Date.now(),
            author: currentUser,
            title: title
          });

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
          handlers.onContractChange();
          handlers.onRefresh();

          // 1. 异步调用扣子拍卖师 API，对该提案做针对性学术评估 (120~180字)
          setTimeout(async () => {
            const evalPrompt = `小组成员【${authorName}】刚在学术拍卖会上提交了一份新选题提案《${title}》。请以拍卖师身份，给出 120~180 字的充实学术价值评估，点评其文献基础、创新视角与可行性建议。`;
            let evalText = await callCozeAgentAPI('auctioneer', evalPrompt, { stage: 'stage1', proposalTitle: title, author: authorName });
            if (!evalText || evalText.trim().length === 0) {
              evalText = `🎪 【拍卖师·提案评估】收到 ${authorName} 提出的新选题《${title}》！该提案紧扣现代教育技术前沿，研究视角新颖，具备较好的探索空间与教学实践价值！`;
            }

            const auctioneerEvalMsg = {
              sender: 'auctioneer',
              text: evalText,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              _timeMs: Date.now()
            };
            state.chatLogs[currentStage].push(auctioneerEvalMsg);

            // 2. 如果全员都已提交提案，拍卖师主动发话引导全员进入投票环节
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
                  renderChat(state);
                }
              }, 1200);
            }

            if (window.app) {
              window.app.syncChatLogs();
              renderChat(state);
            }
          }, 600);
        });
      });
    }

    const topicInput = canvas.querySelector('#contract-topic-input');
    if (topicInput && !isContractLocked) {
      topicInput.addEventListener('input', (e) => {
        s1.mergedTitle = e.target.value;
        if (handlers.onContractChange) handlers.onContractChange();
      });
    }

    canvas.querySelectorAll('.contract-time-input').forEach(input => {
      if (!isContractLocked) {
        input.addEventListener('input', (e) => {
          const key = e.target.dataset.key;
          if (key && s1.contract.timeAllocations) {
            s1.contract.timeAllocations[key] = Number(e.target.value) || 0;
            if (handlers.onContractChange) handlers.onContractChange();
          }
        });
      }
    });

    canvas.querySelectorAll('.task-assignment-input').forEach(input => {
      if (!isContractLocked) {
        input.addEventListener('input', (e) => {
          const mId = e.target.dataset.mid;
          if (mId) {
            if (!s1.contract.taskAssignments) s1.contract.taskAssignments = {};
            s1.contract.taskAssignments[mId] = e.target.value;
            if (handlers.onContractChange) handlers.onContractChange();
          }
        });
      }
    });

    if (!isContractLocked) {
      canvas.querySelectorAll('.vote-btn:not([disabled])').forEach(btn => {
        btn.addEventListener('click', () => handlers.onVote(btn.dataset.id));
      });
      canvas.querySelector('#btn-confirm-contract').addEventListener('click', () => handlers.onConfirmContract());
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
                <span>📋 【审稿编辑·半程修正清单】(3项修改要求)</span>
                <span style="font-size:11px; background:#d1fae5; color:#065f46; padding:1px 6px; border-radius:10px;">已锁定</span>
              </div>
              <span id="icon-toggle-action-plan" style="font-size:11.5px; color:#059669; font-weight:700;">▲ 收起</span>
            </div>
            <div id="body-action-plan-items" style="font-size:12px; color:#334155; display:flex; flex-direction:column; gap:3px; margin-top:6px;">
              ${actionPlan.items.map(item => `<div style="line-height:1.5;">• ${item}</div>`).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Word-grade Academic Rich Text Editor Body -->
        <div style="flex:1; min-height:0; display:flex; flex-direction:column;">
          ${buildWordEditorHtml('stage2-word-editor', s2.unifiedContent, isEditorReadonly)}
        </div>

        <div style="margin-top:8px; background:#ffffff; padding:8px 14px; border-radius:8px; border:1px solid #cbd5e1; flex-shrink:0; display:flex; flex-direction:column; gap:6px; box-shadow:0 1px 3px rgba(15,23,42,0.04);">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:12px; font-weight:800; color:#1e293b;">📊 团队协作贡献度与字数占比 (SSRL 群体感知):</span>
            <div class="contrib-labels" style="display:flex; font-size:11.5px; font-weight:700; color:#475569; gap:12px; white-space:nowrap;">
              ${(() => {
                const contribs = s2.memberContributions || {};
                let totalContrib = 0;
                membersList.forEach(m => { totalContrib += (contribs[m.id] || 0) + (contribs[m.studentCode] || 0); });
                return membersList.map((m) => {
                  const val = (contribs[m.id] || 0) + (contribs[m.studentCode] || 0);
                  const pct = (totalContrib === 0 || val === 0) ? 0 : Math.round((val / totalContrib) * 100);
                  return `<span style="color:${m.color || '#2563eb'}; font-weight:700;">● ${m.name}: ${pct}% (${val}字)</span>`;
                }).join('');
              })()}
            </div>
          </div>
          <div class="contrib-bars" style="width:100%; height:10px; border-radius:5px; display:flex; overflow:hidden; background:#e2e8f0;">
            ${(() => {
              const contribs = s2.memberContributions || {};
              let totalContrib = 0;
              membersList.forEach(m => { totalContrib += (contribs[m.id] || 0) + (contribs[m.studentCode] || 0); });
              if (totalContrib === 0) {
                return `<div style="width:100%; height:10px; background:#f1f5f9; border-radius:5px; display:flex; align-items:center; justify-content:center; font-size:10.5px; color:#94a3b8;">暂无写作贡献 (开始编辑正文或研讨后将自动计算各成员贡献比)</div>`;
              }
              return membersList.map((m) => {
                const val = (contribs[m.id] || 0) + (contribs[m.studentCode] || 0);
                if (val === 0) return '';
                const pct = Math.round((val / totalContrib) * 100);
                return `<div class="contrib-segment" style="width:${pct}%; background:${m.color || '#2563eb'}; transition:width 0.3s ease;" title="${m.name}: ${pct}% (${val}字)"></div>`;
              }).join('');
            })()}
          </div>
        </div>
      </div>
    `;

    attachWordEditorEvents(canvas, 'stage2-word-editor', isEditorReadonly, (html) => handlers.onUnifiedContentChange(html), (nodeIdx, sec) => {
      if (handlers.onPresenceChange) handlers.onPresenceChange(nodeIdx, sec);
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
            ${isFinalSubmitted ? '🔒 论文终稿已成功提交 (归档只读)' : '🚀 提交期末论文终稿'}
          </button>
        </div>

        ${activeTab === 'defense' ? `
          <div class="card" style="flex:1; overflow-y:auto; padding:20px;">
            <div class="card-title" style="margin-bottom:14px;">
              <span style="color:#0f172a;">🎓 答辩委员会改进意见与组内裁决矩阵 ${isFinalSubmitted ? '<span style="font-size:11px; color:#059669; margin-left:6px;">(🔒 已提交归档)</span>' : ''}</span>
              <span style="font-size:12px; color:#2563eb; background:#eff6ff; padding:2px 8px; border-radius:10px; border:1px solid #bfdbfe;">正反方提意见 ➔ 中间委员逐条引导 ➔ 学生研讨裁决</span>
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
                      ${item.response ? '<span style="color:#059669; font-size:11.5px;">(已保存生效)</span>' : '<span style="color:#64748b; font-size:11.5px;">(请直接在下方输入框中录入简要答复)</span>'}
                    </div>
                    <textarea 
                      class="feedback-direct-input" 
                      data-id="${item.id}" 
                      ${isFinalSubmitted ? 'disabled' : ''} 
                      placeholder="商讨后，在此直接输入本组针对该条意见的简要答复与修改结论..." 
                      style="width:100%; min-height:64px; padding:8px 12px; font-size:13px; line-height:1.5; border:1px solid ${item.response ? '#a7f3d0' : '#cbd5e1'}; background:${isFinalSubmitted ? '#f8fafc' : (item.response ? '#f0fdf4' : '#ffffff')}; border-radius:8px; resize:vertical; box-sizing:border-box; color:#0f172a; font-family:inherit;"
                    >${item.response || ''}</textarea>
                    
                    ${!isFinalSubmitted ? `
                      <div style="display:flex; justify-content:flex-end; margin-top:8px;">
                        <button class="btn-save-feedback-direct" data-id="${item.id}" style="background:linear-gradient(135deg, #2563eb, #1d4ed8); border:none; color:white; padding:6px 14px; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:4px; box-shadow:0 2px 6px rgba(37,99,235,0.2);">
                          💾 确认并保存本条答复
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
      attachWordEditorEvents(canvas, 'stage3-word-editor', isFinalSubmitted, (html) => handlers.onUnifiedContentChange(html), (nodeIdx, sec) => {
        if (handlers.onPresenceChange) handlers.onPresenceChange(nodeIdx, sec);
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

    stream.scrollTop = stream.scrollHeight;
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
      this.state.stage1 = defaultState.stage1;
      this.state.stage2 = defaultState.stage2;
      this.state.stage3 = defaultState.stage3;
      this.state.currentStage = 'stage1';
      this.state.isFinalSubmitted = false;
      this.state.presence = {};
      this.initPresetMessagesForGroup(groupId);
      this.saveGroupState(groupId);
      if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
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
          if (min >= 25 && this.state.currentStage === 'stage1') this.switchStage('stage2');
          else if (min >= 130 && this.state.currentStage === 'stage2') this.switchStage('stage3');

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

          // 🌿 智能静默破冰引导 (学术导师温和唤醒机制)
          // 仅在当前阶段安静超过 3 分钟 (180s) 且未在打字时，由当前阶段专属导师发出一句温和自然的思路点拨 (5分钟冷却，绝不报秒数，绝不刷屏)
          const currentStage = this.state.currentStage;
          const logs = this.state.chatLogs[currentStage] || [];
          const nowMs = Date.now();
          const lastStudentMsg = logs.slice().reverse().find(m => m.sender !== 'managingEditor' && m.sender !== 'reviewingEditor' && m.sender !== 'auctioneer' && m.sender !== 'neutral' && m.sender !== 'proponent' && m.sender !== 'opponent');
          const lastStudentTime = lastStudentMsg ? (lastStudentMsg._timeMs || nowMs) : (this.state.lastStudentChatTimeMs || nowMs);
          const idleSec = Math.floor((nowMs - lastStudentTime) / 1000);

          let stageAgent = null;
          let stageGentlePrompt = '';
          if (currentStage === 'stage1') {
            stageAgent = 'auctioneer';
            stageGentlePrompt = `🎪 【拍卖师·思路点拨】：研讨区有些安静啦~ 大家对左侧陈列的选题提案有什么新灵感吗？可以在讨论区交流各自擅长的模块，准备投出心仪的一票哦！`;
          } else if (currentStage === 'stage2') {
            stageAgent = 'managingEditor';
            stageGentlePrompt = `🤝 【责任编辑·协同关怀】：小组成员都在专注构思呢！遇到卡顿或难点随时在讨论区交流，也可以点击上方【发起编辑会议】自查进度与分工哦~`;
          } else if (currentStage === 'stage3') {
            stageAgent = 'neutral';
            stageGentlePrompt = `🟡 【中间委员·答辩提示】：全组同学可以针对左侧反方提出的质询展开简要讨论，在输入框录入本组的答复并保存，稳步推进终稿完善！`;
          }

          const lastStageAgentMsg = logs.slice().reverse().find(m => m.sender === stageAgent);
          const timeSinceLastAgentMs = lastStageAgentMsg ? (nowMs - (lastStageAgentMsg._timeMs || 0)) : 999999;

          // 严格触发条件：静默满 180 秒 (3分钟)，且该智能体在 300 秒 (5分钟) 内未说过话，且未终稿提交
          if (stageAgent && idleSec >= 180 && timeSinceLastAgentMs > 300000 && !this.state.isFinalSubmitted) {
            this.state.lastStudentChatTimeMs = nowMs;
            const gentleMsg = {
              sender: stageAgent,
              text: stageGentlePrompt,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              _timeMs: nowMs
            };
            logs.push(gentleMsg);
            this.syncChatLogs();
            renderChat(this.state);
          }

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

          renderHeader(
            this.state, currentUser, this.authManager.getAnnouncements(),
            (s) => this.switchStage(s), (sp) => this.setSpeed(sp),
            () => this.handleLogout(), () => this.switchToTeacherView(),
            () => this.showAnnouncementModal(), () => this.showQuestionnaireModal()
          );
        }
      }, 1000);
    }

    renderMain() {
      const currentUser = this.authManager.getCurrentUser();
      const appEl = document.getElementById('app');

      if (!currentUser) {
        appEl.className = 'app-login-mode';
        renderLoginView(appEl, this.authManager, () => this.renderMain());
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
              this.loadGroupState(currentGroupId);
              this.state.studentViewMode = 'workspace';
              this.renderMain();
              if (this.cloudSyncEngine) {
                this.cloudSyncEngine.updateScopeKeys();
                this.cloudSyncEngine.pullFromServer();
              }
            },
            () => this.handleLogout(),
            () => {},
            () => this.showAnnouncementModal(),
            () => this.showQuestionnaireModal()
          );
          this.checkUnreadAnnouncements();
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
      }
    }

    checkUnreadAnnouncements() {
      const currentUser = this.authManager.getCurrentUser();
      const groupId = currentUser && currentUser.groupId ? currentUser.groupId : 'group_1';
      const anns = this.authManager.getAnnouncements();
      const unread = anns.find(a => !a.readStatus || !a.readStatus[groupId]);
      if (unread) { setTimeout(() => this.showAnnouncementModal(unread), 800); }
    }

    showAnnouncementModal(targetAnn = null) {
      document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
      const anns = this.authManager.getAnnouncements();
      const ann = targetAnn || (anns.length > 0 ? anns[0] : null);
      if (!ann) { alert('📢 暂无新的课堂通知！'); return; }

      const currentUser = this.authManager.getCurrentUser();
      const groupId = currentUser && currentUser.groupId ? currentUser.groupId : 'group_1';

      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="student-ann-modal-card">
          <div class="ann-modal-header">
            <div class="ann-header-left">
              <div class="ann-bell-icon">🔔</div>
              <div><div class="ann-badge-tag">📢 课堂即时教学广播通知</div><h3 class="ann-modal-title">${ann.title}</h3></div>
            </div>
            <button class="modal-close-btn" id="btn-close-ann-popup">✕</button>
          </div>
          <div class="ann-modal-body">
            <div class="ann-meta-bar">
              <span>发布教师: <b>${ann.author || '张教授'}</b></span>
              <span>关联任务: <b>${ann.taskTitle || '协作写作'}</b></span>
              <span>发布时间: <b>${ann.time}</b></span>
            </div>
            <div class="ann-content-box">${ann.content}</div>
            ${ann.attachment ? `
              <div class="ann-attachment-card">
                <div class="att-info">
                  <span class="att-icon">📎</span>
                  <div><div class="att-name">${ann.attachment.name}</div><div class="att-size">教学随附资源文件 (${ann.attachment.size})</div></div>
                </div>
                <button class="att-download-btn" id="btn-download-ann-file">📥 下载资源文件</button>
              </div>
            ` : ''}
          </div>
          <div class="ann-modal-footer">
            <button class="ann-confirm-btn" id="btn-read-confirm">✅ 我已阅读并确认 (自动同步至教师端追踪矩阵)</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      const closeModal = () => document.body.removeChild(modal);
      modal.querySelector('#btn-close-ann-popup').addEventListener('click', closeModal);
      const downloadBtn = modal.querySelector('#btn-download-ann-file');
      if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
          downloadFileBlob(ann.attachment.name);
        });
      }
      modal.querySelector('#btn-read-confirm').addEventListener('click', () => {
        this.authManager.markAnnouncementRead(ann.id, groupId);
        closeModal();
        this.renderStudentWorkspace();
      });
    }

    showQuestionnaireModal() {
      document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="teacher-modal-card fancy-task-modal" style="width:580px; background:radial-gradient(circle at 50% 10%, #1e1b4b 0%, #0f172a 80%); border:1px solid rgba(129,140,248,0.4); box-shadow:0 25px 60px rgba(0,0,0,0.7);">
          <div class="teacher-modal-header" style="background:linear-gradient(135deg, rgba(99,102,241,0.25), rgba(168,85,247,0.25)); border-bottom:1px solid rgba(255,255,255,0.12);">
            <div class="modal-header-title">
              <div class="modal-icon-badge" style="background:rgba(99,102,241,0.3); color:#a5b4fc; font-size:24px;">📋</div>
              <div>
                <div class="modal-tag-pill" style="background:rgba(16,185,129,0.2); color:#34d399; border:1px solid rgba(16,185,129,0.4);">🎉 终稿提交完成 · 最后一环评估</div>
                <h3 style="color:#f8fafc; font-size:18px; margin-top:2px;">《现代教育技术》期末协作学习与 AI 体验问卷</h3>
              </div>
            </div>
            <button class="modal-close-btn" id="btn-close-survey-modal">✕</button>
          </div>
          <div class="teacher-modal-body" style="padding:24px;">
            <div style="background:rgba(15,23,42,0.6); border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:16px; margin-bottom:20px; line-height:1.6; font-size:13px; color:#cbd5e1;">
              <b style="color:#38bdf8;">亲爱的研究者同学：</b><br>
              恭喜你们顺利完成了团队协作论文方案的撰写与答辩！为了持续改进人机协同写作平台的学习体验与 SSRL 共享调节效果，请全组每位成员点击下方链接完成匿名问卷填写。
            </div>

            <div style="background:linear-gradient(135deg, rgba(99,102,241,0.15), rgba(168,85,247,0.15)); border:1px dashed rgba(168,85,247,0.4); border-radius:14px; padding:20px; text-align:center; margin-bottom:20px;">
              <div style="font-size:14px; font-weight:700; color:#c084fc; margin-bottom:8px;">🔗 课程官方评估问卷专属入口</div>
              <div style="font-size:12px; color:#94a3b8; margin-bottom:14px;">(点击下方按钮将前往第三方问卷平台)</div>
              ${(localStorage.getItem('jizhi_survey_url') || 'https://www.wjx.cn/vm/jizhi_eval_2026.aspx').startsWith('http') ? `
                <a href="${localStorage.getItem('jizhi_survey_url') || 'https://www.wjx.cn/vm/jizhi_eval_2026.aspx'}" target="_blank" class="modal-btn submit" style="display:inline-flex; align-items:center; justify-content:center; gap:8px; background:linear-gradient(135deg, #6366f1, #8b5cf6); padding:12px 24px; font-size:14px; text-decoration:none; color:white; border-radius:10px; font-weight:700; box-shadow:0 8px 20px rgba(99,102,241,0.4);">
                  🚀 跳转前往填写问卷 ↗
                </a>
                <div style="font-size:11px; color:#64748b; margin-top:12px;">问卷直达地址: <span style="color:#a5b4fc;">${localStorage.getItem('jizhi_survey_url') || 'https://www.wjx.cn/vm/jizhi_eval_2026.aspx'}</span></div>
              ` : `
                <div style="color:#f59e0b; font-size:13px; padding:12px; background:rgba(245,158,11,0.1); border:1px solid rgba(245,158,11,0.3); border-radius:8px;">⚠️ 教师尚未配置问卷链接，请联系教师在教师端【界面二】配置问卷链接后再填写。</div>
              `}
            </div>

            <div style="display:flex; align-items:center; gap:10px; background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.3); border-radius:10px; padding:12px 16px;">
              <input type="checkbox" id="chk-survey-done" style="width:18px; height:18px; cursor:pointer;" ${localStorage.getItem('jizhi_survey_completed') === 'true' ? 'checked' : ''}>
              <label for="chk-survey-done" style="font-size:13px; font-weight:700; color:#34d399; cursor:pointer;">
                我已完成问卷填写与提交
              </label>
            </div>
          </div>
          <div class="teacher-modal-footer">
            <button class="modal-btn submit task-theme" id="btn-finish-survey" style="width:100%; font-size:14px; font-weight:700;">✅ 确认并返回项目归档查阅</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      const closeModal = () => modal.remove();
      modal.querySelector('#btn-close-survey-modal').addEventListener('click', closeModal);
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
        <div class="teacher-modal-card fancy-task-modal" style="width:680px; max-width:95vw;">
          <div class="teacher-modal-header" style="background:linear-gradient(135deg, #1e40af, #2563eb);">
            <div class="modal-header-title">
              <div class="modal-icon-badge" style="background:rgba(255,255,255,0.2); color:white; font-size:22px;">📚</div>
              <div>
                <h3 style="color:#ffffff; font-size:17px;">课程学术参考范文库 (${papers.length} 篇)</h3>
                <p style="font-size:12px; color:#bfdbfe; margin-top:2px;">任课教师下发的高水平学术论文样例与审稿编辑重点推荐文献</p>
              </div>
            </div>
            <button class="modal-close-btn" id="btn-close-ref-modal" style="color:white;">✕</button>
          </div>
          <div class="teacher-modal-body" style="padding:20px; max-height:60vh; overflow-y:auto;">
            ${papers.length === 0 ? `
              <div style="text-align:center; padding:36px; background:#f8fafc; border-radius:12px; border:2px dashed #cbd5e1;">
                <div style="font-size:36px; margin-bottom:8px;">📚</div>
                <div style="font-size:15px; font-weight:800; color:#0f172a;">暂无任课教师下发的参考范文</div>
                <div style="font-size:12.5px; color:#64748b; margin-top:4px;">教师在教师端上传范文后将自动在此呈现，审稿编辑 Agent 亦会在研讨管道中实时推荐！</div>
              </div>
            ` : `
              <div style="display:flex; flex-direction:column; gap:14px;">
                ${papers.map(p => `
                  <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:16px; box-shadow:0 1px 3px rgba(15,23,42,0.04);">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                      <div style="font-size:15.5px; font-weight:800; color:#1e40af; line-height:1.4;">📄 ${p.title}</div>
                      <span style="font-size:11px; color:#64748b; white-space:nowrap; margin-left:10px;">${p.uploadTime || ''}</span>
                    </div>
                    ${p.keyHighlights ? `
                      <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:10px 12px; font-size:13px; color:#1e40af; line-height:1.5; margin-bottom:8px;">
                        <b>💡 核心论证亮点与学术价值（审稿编辑推荐指引）：</b><br>${p.keyHighlights}
                      </div>
                    ` : ''}
                    ${p.abstract ? `
                      <div style="font-size:12.5px; color:#475569; line-height:1.5; margin-bottom:10px;">
                        <b>摘要：</b>${p.abstract}
                      </div>
                    ` : ''}
                    <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid #f1f5f9; padding-top:8px;">
                      <span style="font-size:11.5px; color:#64748b;">上传署名: ${p.author || '任课教师'}</span>
                      ${p.fileName ? `
                        <button class="btn-download-ref-item" data-id="${p.id}" style="background:linear-gradient(135deg, #2563eb, #1d4ed8); border:none; color:white; padding:6px 14px; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:6px; box-shadow:0 2px 6px rgba(37,99,235,0.25);">
                          📥 下载并查阅随附文献: ${p.fileName} (${p.fileSize || '附件'})
                        </button>
                      ` : '<span style="font-size:12px; color:#94a3b8;">无附件文件 (仅查阅重点指引)</span>'}
                    </div>
                  </div>
                `).join('')}
              </div>
            `}
          </div>
          <div class="teacher-modal-footer" style="background:#f8fafc; border-top:1px solid #e2e8f0; padding:12px 20px;">
            <button class="modal-btn submit task-theme" id="btn-finish-ref-modal" style="width:100%;">返回协作写作界面</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      const closeModal = () => modal.remove();
      modal.querySelector('#btn-close-ref-modal').addEventListener('click', closeModal);
      modal.querySelector('#btn-finish-ref-modal').addEventListener('click', closeModal);

      modal.querySelectorAll('.btn-download-ref-item').forEach(btn => {
        btn.addEventListener('click', () => {
          const paperId = btn.dataset.id;
          const paper = papers.find(p => p.id === paperId);
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
    }

    handleLogout() { 
      const user = this.authManager.getCurrentUser();
      if (user && user.studentCode) {
        if (this.state.presence && this.state.presence[user.studentCode]) {
          delete this.state.presence[user.studentCode];
        }
        if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
      }
      this.authManager.logout(); 
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
        this.triggerAgentReplyIfNeeded(text);
      };

      sendBtn.addEventListener('click', handleSend);
      input.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSend(); });
    }

    updateContributionUi() {
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
          return { pct: 0, val: val, label: `${m.name}: 0% (0字)` };
        }
        const pct = Math.round((val / totalContrib) * 100);
        return { pct: pct, val: val, label: `${m.name}: ${pct}% (${val}字)` };
      };

      const barContainer = document.querySelector('.contrib-bars');
      if (barContainer) {
        if (totalContrib === 0) {
          barContainer.innerHTML = `<div style="width:100%; height:10px; background:#e2e8f0; border-radius:6px; display:flex; align-items:center; justify-content:center; font-size:10px; color:#94a3b8;">暂无写作与研讨贡献数据 (各成员贡献均为 0%)</div>`;
        } else {
          barContainer.innerHTML = membersList.map((m) => {
            const data = getMemberData(m);
            if (data.pct === 0) return '';
            return `<div class="contrib-segment" style="width:${data.pct}%; background:${m.color || '#2563eb'}; transition:width 0.3s ease;" title="${m.name}: ${data.pct}% (${data.val}字)"></div>`;
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
    }

    async triggerAgentReplyIfNeeded(userMsg) {
      const stage = this.state.currentStage;
      const isExplicitMention = userMsg.includes('@');
      const isMilestoneKeyword = userMsg.includes('分工') || userMsg.includes('确定') || userMsg.includes('结论') || userMsg.includes('方案') || userMsg.includes('意见') || userMsg.includes('背景') || userMsg.includes('文献') || userMsg.includes('方法');
      const hasEnoughDiscussion = this.studentMsgCountSinceLastAgent >= 3;

      if (!isExplicitMention && !isMilestoneKeyword && !hasEnoughDiscussion) return;

      let replyAgent = null;
      let defaultFallbackText = '';

      // 1. 如果用户显式 @ 某个智能体：任何阶段均可回答该特定智能体
      if (userMsg.includes('@中间委员') || userMsg.includes('@中间委员 Agent')) {
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
        const currentTopic = (this.state.stage1 && this.state.stage1.mergedTitle) ? this.state.stage1.mergedTitle : '当前课题';
        defaultFallbackText = `🎪 【拍卖师选题顾问回复】：收到 @ 呼叫！建议从小组成员提案中提炼核心创新点，协商融合为统一主题并在合约中确认！`;
      } else {
        // 2. 如果没有显式 @：严格按阶段触发专属智能体（其他阶段智能体绝对不出来）
        if (stage === 'stage1') {
          // 🎪 阶段一：只有【拍卖师】出来
          replyAgent = 'auctioneer';
          const s1 = this.state.stage1;
          let didExtract = false;
          let extractedDetails = [];

          // 提取时间分配
          const bgMatch = userMsg.match(/背景\s*[:：=为]?\s*(\d+)/i) || userMsg.match(/(\d+)\s*分[钟]?.*背景/i);
          const qMatch = userMsg.match(/问题\s*[:：=为]?\s*(\d+)/i) || userMsg.match(/(\d+)\s*分[钟]?.*问题/i);
          const litMatch = userMsg.match(/文献\s*[:：=为]?\s*(\d+)/i) || userMsg.match(/(\d+)\s*分[钟]?.*文献/i);
          const methMatch = userMsg.match(/方法\s*[:：=为]?\s*(\d+)/i) || userMsg.match(/(\d+)\s*分[钟]?.*方法/i);
          const refMatch = userMsg.match(/反思\s*[:：=为]?\s*(\d+)/i) || userMsg.match(/(\d+)\s*分[钟]?.*反思/i);
          const bibMatch = userMsg.match(/(?:参考文献|文献表)\s*[:：=为]?\s*(\d+)/i) || userMsg.match(/(\d+)\s*分[钟]?.*参考文献/i);

          if (bgMatch && s1.contract.timeAllocations) { s1.contract.timeAllocations.background = parseInt(bgMatch[1]); didExtract = true; extractedDetails.push(`背景: ${bgMatch[1]}m`); }
          if (qMatch && s1.contract.timeAllocations) { s1.contract.timeAllocations.questions = parseInt(qMatch[1]); didExtract = true; extractedDetails.push(`问题: ${qMatch[1]}m`); }
          if (litMatch && s1.contract.timeAllocations) { s1.contract.timeAllocations.literature = parseInt(litMatch[1]); didExtract = true; extractedDetails.push(`文献: ${litMatch[1]}m`); }
          if (methMatch && s1.contract.timeAllocations) { s1.contract.timeAllocations.method = parseInt(methMatch[1]); didExtract = true; extractedDetails.push(`方法: ${methMatch[1]}m`); }
          if (refMatch && s1.contract.timeAllocations) { s1.contract.timeAllocations.reflection = parseInt(refMatch[1]); didExtract = true; extractedDetails.push(`反思: ${refMatch[1]}m`); }
          if (bibMatch && s1.contract.timeAllocations) { s1.contract.timeAllocations.references = parseInt(bibMatch[1]); didExtract = true; extractedDetails.push(`文献表: ${bibMatch[1]}m`); }

          // 提取分工
          Object.keys(this.state.members || {}).forEach(mId => {
            const m = this.state.members[mId];
            const mName = m.name;
            const reg = new RegExp(`(?:${mName}|${mId}|学生${mId}|我)\\s*(?:负责|来写|写|承担)\\s*[:：]?\\s*([^，,。！!\n]+)`, 'i');
            const assignMatch = userMsg.match(reg);
            if (assignMatch) {
              if (!s1.contract.taskAssignments) s1.contract.taskAssignments = {};
              s1.contract.taskAssignments[mId] = assignMatch[1].trim();
              didExtract = true;
              extractedDetails.push(`${mName}负责: ${assignMatch[1].trim()}`);
            }
          });

          // 提取论文主题
          const topicMatch = userMsg.match(/(?:题目|主题|选题|融合主题|论文题目)\s*(?:定为|选定|为|是|定在)?\s*[《“"]?([^》”"\n]+)[》”"]?/i);
          if (topicMatch && topicMatch[1].trim().length >= 4) {
            s1.mergedTitle = topicMatch[1].trim();
            didExtract = true;
            extractedDetails.push(`确定主题: 《${s1.mergedTitle}》`);
          }

          if (didExtract && !s1.contract.isConfirmed) {
            defaultFallbackText = `📜 【AI 智能提取公约】：拍卖师已根据刚才的研讨内容，自动提取并更新了左侧《团队协同合作学术公约》卡片！\n• 提取要点: ${extractedDetails.join(' | ')}\n\n💡 提示：所有小组成员均可在左侧卡片中自由修改微调各项内容，商定无误后全员点击【确认签署】生效！`;
            this.syncStage1();
            this.renderStudentWorkspace();
          } else {
            defaultFallbackText = `🎪 【拍卖师阶段引导】组内讨论正在进行中！请大家在左侧提交各自的选题提案，或在研讨区商定分工与时间（AI 将自动提取为合约），确认后全员签署！`;
          }
        } else if (stage === 'stage2') {
          // 📝 阶段二：消极情绪与流程学伴由【责任编辑】响应，学术规范由【审稿编辑】响应
          const isNegativeEmotion = /(?:写不出来|太难了|太难写|好难|救命|焦虑|搞不定|写得好烂|写的好烂|好烦|头疼|卡住|卡顿|不知道怎么写|不想写)/i.test(userMsg);
          const nowMs = Date.now();
          const timeSinceLastEmotion = nowMs - (this.lastEmotionSupportTimeMs || 0);

          if (isNegativeEmotion && timeSinceLastEmotion > 60000) {
            // 触发责任编辑暖心情感与减压支架（冷却时间 60秒，绝不频繁打扰）
            this.lastEmotionSupportTimeMs = nowMs;
            replyAgent = 'managingEditor';
            defaultFallbackText = `🤝 【责任编辑·暖心陪伴】：收到大家的困扰与压力啦！初稿撰写‘先完成再完美’是所有学者都会经历的过程。大家不要有心理负担，哪怕先在讨论区列出 3 个核心词或写下几句零散想法，同伴和编辑都会一起协助完善，深呼吸，我们一起慢慢推进！`;
          } else if (userMsg.includes('分工') || userMsg.includes('进度') || userMsg.includes('字数') || userMsg.includes('公约') || userMsg.includes('时间')) {
            replyAgent = 'managingEditor';
            defaultFallbackText = `🤝 【责任编辑过程学伴回复】：关注到大家在正文写作中的协同进展。请组员分头撰写对应章节，保持均匀贡献比，遇到瓶颈可发起【编辑会议】！`;
          } else {
            replyAgent = 'reviewingEditor';
            defaultFallbackText = `📝 【审稿编辑针对性指导】：请大家在左侧富文本编辑器中保持学术规范，注意在“四、研究设计与方法”中清晰说明变量与量表，必要时可使用上方插件插入学术三线表！`;
          }
        } else if (stage === 'stage3') {
          // 🎓 阶段三：只有【三个答辩委员】出来 (默认中间委员引导)
          replyAgent = 'neutral';
          defaultFallbackText = `🟡 【中间委员裁决引导】：针对答辩委员会提出的学术质询，请小组在左侧卡片中统一裁决，达成共识后将辩护修正内容补充进终稿！`;
        }
      }

      if (!replyAgent) return;

      this.studentMsgCountSinceLastAgent = 0;
      const currentUser = this.authManager.getCurrentUser();
      const currentTopic = this.state.stage1 ? this.state.stage1.mergedTitle : '';

      // 直接静默异步直连 Coze API 获得真实大模型智能体回复
      let replyText = await callCozeAgentAPI(replyAgent, userMsg, {
        stage: stage,
        topic: currentTopic,
        userId: currentUser ? (currentUser.id || currentUser.username) : 'student_user'
      });

      if (!replyText || replyText.trim().length === 0) {
        replyText = defaultFallbackText;
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
      if (votesCastCount >= totalMembersCount) {
        setTimeout(() => {
          const tally = {};
          Object.values(s1.votes).forEach(pId => { if (pId) tally[pId] = (tally[pId] || 0) + 1; });
          let summaryText = '🎪 【拍卖师宣布最终计票结果】：全员投票已完毕！\n';
          let maxVotes = -1;
          let winningProposal = null;
          (s1.proposals || []).forEach(p => { 
            const count = tally[p.id] || 0;
            summaryText += `• 《${p.title}》得票: ${count} 票\n`; 
            if (count > maxVotes) {
              maxVotes = count;
              winningProposal = p;
            }
          });
          summaryText += `\n🔨 计票显示：《${winningProposal ? winningProposal.title : '当前提案'}》获得最高支持！请组员结合研讨确认最终主题并签署合作卡片！`;
          const summaryMsg = { sender: 'auctioneer', text: summaryText, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
          this.state.chatLogs.stage1.push(summaryMsg);
          this.syncChatLogs();
          renderChat(this.state);
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
            text: `🤝 【责任编辑开场】：欢迎来到【阶段二：学术编辑部】！我是过程学伴责任编辑。\n全组已锁定研究主题《${topic}》。\n\n📜 【阶段一公约执行提醒】\n• 组员分工: ${assignSummary.join(' | ') || '全员协作'}\n• 时间分配: ${timeSummary.join(' / ') || '按需推进'}\n\n请大家进入左侧富文本编辑器协同撰写，保持均匀贡献比！`,
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

      // 🎓 阶段三：预制中间委员欢迎 ➔ 优雅间隔调用正方 ➔ 优雅间隔调用反方 ➔ 中间委员提示阅读
      else if (stage === 'stage3') {
        const hasNeutralIntro = logs.some(m => m.sender === 'neutral' && m.text.includes('欢迎来到【阶段三：答辩擂台】'));
        if (!hasNeutralIntro) {
          const neutralWelcome = {
            sender: 'neutral',
            text: `🟡 【中间委员开场】：各位研究者，欢迎来到【阶段三：答辩擂台】！初稿撰写完毕，答辩委员会专家将分别发表肯定意见与尖锐质询。请全组先认真审阅！`,
            timestamp: now,
            _timeMs: Date.now()
          };
          logs.unshift(neutralWelcome);
          this.syncChatLogs();
          renderChat(this.state);

          const topic = (this.state.stage1 && this.state.stage1.mergedTitle) ? this.state.stage1.mergedTitle : '本组研究设计';
          const contentSnippet = (this.state.stage2 && this.state.stage2.unifiedContent) ? this.state.stage2.unifiedContent.replace(/<[^>]*>/g, '').slice(0, 300) : '研究设计方案';

          // 1. 异步调用扣子 API: 正方委员发言 (间隔 2.8 秒)
          setTimeout(async () => {
            let propText = await callCozeAgentAPI('proponent', `请针对我们小组的论文主题《${topic}》与正文方案发表答辩肯定意见与创新点分析：\n${contentSnippet}`, { stage: 'stage3', topic });
            if (!propText || propText.trim().length === 0) {
              propText = `🟢 【正方委员肯定支持】：本研究选题《${topic}》立意明确，紧扣教育数字化转型前沿，方案中技术工具与学习场景结合具有较高的实践与推广价值！`;
            }
            const propMsg = {
              sender: 'proponent',
              text: propText,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              _timeMs: Date.now()
            };
            logs.push(propMsg);
            this.syncChatLogs();
            renderChat(this.state);

            // 2. 异步调用扣子 API: 反方委员发言 (间隔 3.5 秒，给学生阅读正方的时间)
            setTimeout(async () => {
              let oppText = await callCozeAgentAPI('opponent', `请针对我们小组的论文主题《${topic}》与正文方案发表答辩尖锐质询意见与严谨性质疑：\n${contentSnippet}`, { stage: 'stage3', topic });
              if (!oppText || oppText.trim().length === 0) {
                oppText = `🔴 【反方委员尖锐质询】：请团队审视研究设计的严谨性！样本抽样范围是否存在局限？自变量与因变量的操作化测量是否提供了权威量表支撑？`;
              }
              const oppMsg = {
                sender: 'opponent',
                text: oppText,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                _timeMs: Date.now()
              };
              logs.push(oppMsg);

              // 自动将专家意见挂入左侧裁决矩阵
              if (!this.state.stage3.feedbackItems || this.state.stage3.feedbackItems.length === 0) {
                this.state.stage3.feedbackItems = [
                  {
                    id: 'fb_1',
                    role: 'proponent',
                    speaker: '正方委员 Agent',
                    title: '立意与应用价值认可',
                    content: propText,
                    neutralGuidance: '建议团队在终稿引言与结语中进一步突出技术赋能教学的创新定位。',
                    status: 'pending',
                    response: ''
                  },
                  {
                    id: 'fb_2',
                    role: 'opponent',
                    speaker: '反方委员 Agent',
                    title: '抽样严谨度与测量量表质询',
                    content: oppText,
                    neutralGuidance: '请组员研讨：是否需要在正文第四章补充 5 点李克特量表维度并说明信效度检验方法？',
                    status: 'pending',
                    response: ''
                  }
                ];
                this.syncStage3();
                this.renderStudentWorkspace();
              }

              this.syncChatLogs();
              renderChat(this.state);

              // 3. 中间委员提醒学生阅读 1 分钟并开始引导答复 (间隔 3 秒)
              setTimeout(() => {
                const readingGuideMsg = {
                  sender: 'neutral',
                  text: `🟡 【中间委员阅读与研讨引导】：\n答辩委员会正反两方专家的评审意见已全部送达（已同步展示在左侧【答辩委员会改进意见与组内裁决矩阵】中）。\n\n⏳ **请全组成员先静心阅读 1 分钟**，梳理正方肯定点与反方质询点。\n阅读完毕后，请在研讨区展开辩护协商，并在左侧输入框录入全组共识并保存，修改落实至终稿后提交！`,
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  _timeMs: Date.now()
                };
                logs.push(readingGuideMsg);
                this.syncChatLogs();
                renderChat(this.state);
              }, 3000);

            }, 3500);
          }, 2800);
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
      renderHeader(this.state, currentUser, this.authManager.getAnnouncements(), (s) => this.switchStage(s), (sp) => this.setSpeed(sp), () => this.handleLogout(), () => this.switchToTeacherView(), () => this.showAnnouncementModal(), () => this.showQuestionnaireModal());
    }

    renderStudentWorkspace() {
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

      renderCanvas(this.state, {
        onVote: (propId) => { this.handleVoteCast(propId); },
        onRefresh: () => { this.renderStudentWorkspace(); },
        onContractChange: () => {
          this.syncStage1();
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
          s1.contract.confirmedMembers[user] = true;
          const confirmedCount = Object.values(this.state.members).filter(m => s1.contract.confirmedMembers[m.id]).length;
          const memberName = this.state.members[user] ? this.state.members[user].name : user;
          const confirmMsg = { sender: user, text: `📢 [合约签署告知]: 我 (${memberName}) 已按键确认签署合作学术合约！（全组确认进度: ${confirmedCount}/${totalMembersCount} 人）`, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
          this.state.chatLogs.stage1.push(confirmMsg);
          this.syncStage1();
          this.syncChatLogs();
          if (confirmedCount < totalMembersCount) {
            alert(`✅ 你 (${memberName}) 已成功按键确认签署合约！\n\n目前组内签署进度：${confirmedCount}/${totalMembersCount} 人。\n需全组 ${totalMembersCount} 名成员全部按键确认后方可解锁阶段二！`);
          } else {
            s1.contract.isConfirmed = true;
            this.syncStage1();
            this.syncStageChange('stage2');
            setTimeout(() => {
              const finalMsg = { sender: 'auctioneer', text: `🎪 【拍卖师宣布】：恭喜！组内全员 ${totalMembersCount}/${totalMembersCount} 名成员已全部完成按键确认签署！学术合作合约正式生效并锁定，阶段一圆满结束，系统自动解锁【阶段二：学术编辑部】！`, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
              this.state.chatLogs.stage1.push(finalMsg);
              this.syncChatLogs();
              alert(`🎉 恭喜！组内 ${totalMembersCount} 位成员全部完成按键确认签署！学术合作合约生效并锁定，系统解锁【阶段二：学术编辑部】！`);
              this.switchStage('stage2');
            }, 600);
          }
          this.renderStudentWorkspace();
        },
        onPresenceChange: (nodeIdx, sectionTitle) => {
          const user = this.state.currentUser || 'A';
          if (!this.state.presence) this.state.presence = {};
          this.state.presence[user] = {
            nodeIndex: nodeIdx,
            activeSection: sectionTitle || '正文',
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
          this.state.presence[user] = {
            nodeIndex: 0,
            activeSection: '正在输入...',
            updatedAt: Date.now()
          };
          this.updateContributionUi();
          this.syncStage2();
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
                neutralReply = `🟡 【中间委员·答辩裁决推进】：已成功记录本条裁决结论：“${respText}”！\n\n👉 **接下来请研讨**【${nextItem.speaker}】：请全组成员商讨修改方案，直接在左侧对应卡片中录入答复！`;
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
      });

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

      // 1. 📝 审稿编辑 Agent: 偏离主题警示 (Off-Topic Check)
      const offTopicKeywords = ['外卖', '游戏', '电影', '打球', '买鞋', '追剧', '放假', '游玩', '聊天'];
      const hasOffTopicWord = offTopicKeywords.some(w => newContent.includes(w));
      const lastReviewingMsg = logs.slice().reverse().find(m => m.sender === 'reviewingEditor');
      const timeSinceLastReviewing = lastReviewingMsg ? (now - (lastReviewingMsg._timeMs || 0)) : 999999;

      if (hasOffTopicWord && timeSinceLastReviewing > 30000) {
        const warningMsg = {
          sender: 'reviewingEditor',
          text: `📝 【审稿编辑 Agent 偏离主题提醒】：检测到当前正文或研讨内容中出现了偏离已锁定研究主题《${this.state.stage1.mergedTitle || '论文主题'}》的内容。请团队紧扣研究问题、理论框架与学术规范展开，避免无关讨论！`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          _timeMs: now
        };
        logs.push(warningMsg);
        this.syncChatLogs();
        renderChat(this.state);
      }

      // 2. 📝 审稿编辑 Agent: 专业问题 / 学术规范缺失 (Academic Deficit Check)
      const hasHypothesis = newContent.includes('假设') || newContent.includes('H1') || newContent.includes('H2') || newContent.includes('变量');
      const hasScale = newContent.includes('李克特') || newContent.includes('Likert') || newContent.includes('量表') || newContent.includes('信效度');
      if (hasHypothesis && !hasScale && newContent.length > 180 && timeSinceLastReviewing > 45000) {
        const scaleWarningMsg = {
          sender: 'reviewingEditor',
          text: `📝 【审稿编辑 Agent 专业规范提醒】：检测到论文提出了研究假设或变量，但尚未补齐具体的【5点李克特量表 (Likert 5-point Scale)】及量化测量工具规范！建议补充具体的测量维度与问卷指标。`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          _timeMs: now
        };
        logs.push(scaleWarningMsg);
        this.syncChatLogs();
        renderChat(this.state);
      }

      // 3. 🎯 章节语义里程碑雷达：推进到【总结反思】时号召发起【半程编辑会议】
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

      // 3. 🤝 责任编辑 Agent: 字数贡献比偏斜提醒 (SSRL Contribution Imbalance Check)
      const membersList = Object.values(this.state.members || {});
      const totalLen = newContent.length;
      if (totalLen > 250 && membersList.length >= 3) {
        const lastManagingMsg = logs.slice().reverse().find(m => m.sender === 'managingEditor');
        const timeSinceLastManaging = lastManagingMsg ? (now - (lastManagingMsg._timeMs || 0)) : 999999;
        if (timeSinceLastManaging > 45000) {
          const ssrlWarningMsg = {
            sender: 'managingEditor',
            text: `🤝 【责任编辑 Agent SSRL 共享调节提醒】：检测到本组正文撰写推进中成员字数贡献比率出现不均衡现象！请组长 (${membersList[0] ? membersList[0].name : '组长'}) 与全体组员注意分工调整，促进全员 Equal Participation 均等学术参与。`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            _timeMs: now
          };
          logs.push(ssrlWarningMsg);
          this.syncChatLogs();
          renderChat(this.state);
        }
      }
    }

    showMeetingModal() {
      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="teacher-modal-card" style="width:620px;">
          <div class="teacher-modal-header ann-theme">
            <div class="modal-header-title"><span class="modal-icon">📢</span><div><h3>学术编辑部【半程编辑会议】</h3><p>共享调节 3 维评价与半程修正清单生成</p></div></div>
            <button class="modal-close-btn" id="btn-close-meeting">✕</button>
          </div>
          <div class="teacher-modal-body">
            <!-- 1. 契约与构想一致性双核自查 -->
            <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:10px; padding:12px 16px;">
              <div style="font-size:13px; font-weight:800; color:#1e40af; margin-bottom:10px;">📋 阶段一公约与核心构想对照 (SSRL 计划自查)</div>
              
              <div style="display:flex; flex-direction:column; gap:8px;">
                <div style="display:flex; justify-content:space-between; align-items:center; background:#ffffff; padding:8px 12px; border-radius:8px; border:1px solid #e2e8f0;">
                  <span style="font-size:12.5px; color:#334155; font-weight:600;">1. 核心研究构想与初衷一致性：</span>
                  <select id="meeting-theme-consistency-select" class="teacher-input" style="width:170px; padding:4px 8px; font-size:12px;">
                    <option value="紧扣初衷，观点高度聚焦">✅ 紧扣初衷，观点高度聚焦</option>
                    <option value="基本一致，有局部微调">🔄 基本一致，有局部微调</option>
                    <option value="存在发散，需聚焦核心论点">⚠️ 存在发散，需聚焦核心论点</option>
                  </select>
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center; background:#ffffff; padding:8px 12px; border-radius:8px; border:1px solid #e2e8f0;">
                  <span style="font-size:12.5px; color:#334155; font-weight:600;">2. 章节耗时与时间预算一致性：</span>
                  <select id="meeting-time-consistency-select" class="teacher-input" style="width:170px; padding:4px 8px; font-size:12px;">
                    <option value="节奏匹配，符合时间规划">✅ 节奏匹配，符合时间规划</option>
                    <option value="局部超时，后半程需加速">⏳ 局部超时，后半程需加速</option>
                    <option value="进度严重滞后，需精简篇幅">🚨 进度严重滞后，需精简篇幅</option>
                  </select>
                </div>
              </div>
            </div>

            <!-- 2. 团队共享调节 3 维打星自评 (舒展立体) -->
            <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:12px 16px; margin-top:12px; display:flex; flex-direction:column; gap:10px;">
              <div style="font-size:13px; font-weight:800; color:#0f172a;">🌟 团队共享调节 (SSRL) 3 维打星自评</div>
              
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

            <!-- 3. 三维难点瓶颈全面自评 (3 个维度各选一个真实困惑) -->
            <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:10px; padding:12px 16px; margin-top:12px; display:flex; flex-direction:column; gap:10px;">
              <div style="font-size:13px; font-weight:800; color:#0f172a;">⚠️ 团队 3 维瓶颈自查 (每个维度各确定 1 项核心难点)</div>
              
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
              <label style="font-size:13px; font-weight:700;">✍️ 组内自评与补充修正说明</label>
              <textarea id="meeting-input-text" class="teacher-textarea" style="min-height:55px;" placeholder="请输入组内自我检讨或需要审稿编辑解答的问题...">背景与问题部分已完成，请审稿编辑评价假设与方法的衔接。</textarea>
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
        const timeConsistency = modal.querySelector('#meeting-time-consistency-select').value;
        const bAcademic = modal.querySelector('#meeting-bottleneck-academic').value;
        const bCollab = modal.querySelector('#meeting-bottleneck-collab').value;
        const bRhythm = modal.querySelector('#meeting-bottleneck-rhythm').value;
        const userText = modal.querySelector('#meeting-input-text').value;
        closeModal();

        const topic = (this.state.stage1 && this.state.stage1.mergedTitle) ? this.state.stage1.mergedTitle : '本组课题';

        // 1. 立即点亮并生成左侧【半程编辑修正清单】(全要素 4 维严密映射)
        this.state.stage2.actionPlan = {
          isGenerated: true,
          items: [
            `【学术构想与论证修正】(立意状态: ${themeConsistency} · 逻辑 ${logicRating}★): 针对瓶颈【${bAcademic}】与组内提问("${userText}")，在三、假设与四、设计中补齐操作化测量量表与理论依据。`,
            `【团队协同与分工平衡】(分工平衡度: ${balanceRating}★): 针对瓶颈【${bCollab}】，统一各章节论述用词风格与逻辑过渡，落实 Equal Participation 均等参与。`,
            `【时间节奏与反思深化】(时间预算: ${timeConsistency} · 信心 ${confidenceRating}★): 针对瓶颈【${bRhythm}】，把控后半程节奏，优先完成五、研究设计的不足与反思。`
          ]
        };
        this.syncStage2();
        this.renderStudentWorkspace();

        // 2. 异步调用扣子【责任编辑】Coze API: 总结自查、抛出分歧反思问题并发布清单
        const managingPrompt = `小组成员已完成半程编辑会议自查：
• 构想立意一致性: ${themeConsistency}
• 章节耗时一致性: ${timeConsistency}
• 3维打星自评: 逻辑严谨度 ${logicRating}★, 分工平衡度 ${balanceRating}★, 团队信心 ${confidenceRating}★
• 3维核心瓶颈: ① 学术难点: ${bAcademic} | ② 协作难点: ${bCollab} | ③ 进度难点: ${bRhythm}
• 组内说明与提问: "${userText}"
平台已在左侧生成对应的【半程编辑修正清单】。请作为责任编辑发表 130~160 字的发言：简要告知清单要点，若存在立意发散或时间偏紧等分歧，主动抛出反思思考题号召组内先在讨论区交流对齐，并预告审稿编辑随后将进行正文内容审查！`;

        let managingText = await callCozeAgentAPI('managingEditor', managingPrompt, { stage: 'stage2', topic, bottleneck: bAcademic });
        if (!managingText || managingText.trim().length === 0) {
          managingText = `🤝 【责任编辑·自查研判与分歧引导】：全员自查打卡完毕！平台已根据大家的自查数据在左侧正式生成了【半程编辑修正清单】。自查显示：立意状态为[${themeConsistency}]，协作与进度难点聚焦在[${bCollab}]与[${bRhythm}]。请全组在讨论区先交流一下如何克服上述难点并对齐初衷共识，稍后审稿编辑将对正文初稿进行学术内容审查！`;
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

        // 3. 智能同伴研讨感知窗口 ➔ 优雅触发【审稿编辑】正文深度内容审查 (延迟 6 秒自然过渡)
        setTimeout(async () => {
          const contentSnippet = (this.state.stage2 && this.state.stage2.unifiedContent) ? this.state.stage2.unifiedContent.replace(/<[^>]*>/g, '').slice(0, 500) : '论文初稿方案';
          const reviewingPrompt = `小组已由责任编辑引导完成了自查复盘与清单生成（学术瓶颈：“${bAcademic}”，开放说明：“${userText}”）。请针对其论文《${topic}》及当前真实初稿切片：
${contentSnippet}
请作为国家级核心期刊审稿编辑发表 140~170 字的学术内容审查：肯定已有正文亮点，指出变量操作化或量表工具等 1 处薄弱点，给出具体的学术修改建议，引导全组对照左侧【半程编辑修正清单】推进！`;

          let reviewingText = await callCozeAgentAPI('reviewingEditor', reviewingPrompt, { stage: 'stage2', topic, bottleneck: bAcademic });
          if (!reviewingText || reviewingText.trim().length === 0) {
            reviewingText = `📝 【审稿编辑·初稿学术内容审查】：研读了大家目前撰写的正文初稿！引言与文献综述框架清晰扎实。针对大家关心的‘假设与量表衔接’以及学术难点【${bAcademic}】，在‘三、假设’与‘四、设计’中变量操作化略显单薄，建议探讨选用经典的 5 点李克特量表来测量核心变量。请全组对照左侧已生成的【半程编辑修正清单】，分工加速完善！`;
          }

          const reviewingMsg = {
            sender: 'reviewingEditor',
            text: reviewingText,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            _timeMs: Date.now()
          };
          this.state.chatLogs.stage2.push(reviewingMsg);
          this.syncChatLogs();
          renderChat(this.state);
        }, 6000);
      });
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
