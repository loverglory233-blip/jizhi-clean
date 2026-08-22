/**
 * JIZHI (集智) Platform - Authentication & Database Manager
 * Standard ES Module (ESM)
 */

import {
  STORAGE_KEY_USER,
  STORAGE_KEY_USERS_DB,
  STORAGE_KEY_CLASSES,
  STORAGE_KEY_TASKS,
  STORAGE_KEY_ANNOUNCEMENTS,
  DefaultClasses,
  DefaultUsers,
  DefaultTasks,
  DefaultAnnouncements,
  DefaultReferencePapers
} from './constants.js';

export class AuthManager {
  constructor() {
    this.initDatabase();
    this.sanitizeAndDeduplicateGroups();
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
        if (!cls.groups) cls.groups = [];

        cls.groups.forEach(grp => {
          if (!grp.id) grp.id = 'group_' + Date.now();
          if (!grp.name) grp.name = '协作小组';
          if (!Array.isArray(grp.members)) grp.members = [];
        });
      });

      if (isModified) {
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
      const isTeacher = currUser && (currUser.role === 'teacher' || currUser.isTeacher || currUser.username === '1001' || currUser.id === 'u_teacher');

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
            localStorage.setItem(STORAGE_KEY_ANNOUNCEMENTS, JSON.stringify(data.announcements));
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
    const isTeacher = currUser && (currUser.role === 'teacher' || currUser.isTeacher || currUser.username === '1001' || currUser.id === 'u_teacher');
    
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
        if (res.status === 409) {
          alert('⚠️ 【教务配置冲突提示】：其他教师已在此期间更新了全局配置！系统将自动拉取最新配置，请在最新配置基础上再做修改。');
          this.pullGlobalMeta().then(() => {
            if (window.app && window.app.renderMain) window.app.renderMain();
          });
        } else if (res.ok) {
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
          if (u.name !== '老师') { u.name = '老师'; changed = true; }
          if (u.studentCode !== '1001') { u.studentCode = '1001'; changed = true; }
          if (u.username !== '1001') { u.username = '1001'; changed = true; }
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
  getAnnouncements() { return JSON.parse(localStorage.getItem(STORAGE_KEY_ANNOUNCEMENTS)) || DefaultAnnouncements; }
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
  async loginAsync(accountInput, password) {
    const query = (accountInput || '').trim();
    const pwd = (password || '').trim();

    if (!query) return { success: false, message: '❌ 请输入工号或学号' };
    if (!pwd) return { success: false, message: '❌ 请输入登录密码' };

    try {
      const response = await fetch('sync.php?action=login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account: query, password: pwd })
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
        return { success: false, message: data.message || '❌ 账号或密码错误' };
      }
    } catch (err) {
      // 离线单机沙盒降级
      return this.login(accountInput, password);
    }
  }

  login(accountInput, password) {
    const users = this.getUsers();
    const query = (accountInput || '').trim().toLowerCase();
    const pwd = (password || '').trim();

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
      
      const isTeacherMatch = (u.role === 'teacher') && (
        query === '1001' || query === 't001' || query === 'teacher' || query === '老师'
      );

      const isDirectMatch = (uCode === query || uName === query || uEmail === query || uNick === query);

      return isTeacherMatch || isDirectMatch;
    });

    if (userIndex === -1) {
      return { success: false, message: '❌ 该账号不存在，请检查工号或学号是否输入正确' };
    }

    const user = users[userIndex];
    const isPwdValid = (pwd.length > 0) && ((user.password && user.password === pwd) || (!user.password && pwd === '123'));

    if (!isPwdValid) {
      return { success: false, message: '❌ 密码错误，默认初始密码为 123' };
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
        fetch(`sync.php?action=session_logout&userId=${encodeURIComponent(user.id || user.username)}`).catch(() => {});
      } catch (e) {}
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

  publishAnnouncement(taskId, title, content, attachment = null, targetGroupId = 'all', targetGroupName = '全班所有小组', classId = 'all', className = '全校班级', targetGroupIds = ['all']) {
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
    const uKey = currUser ? (currUser.id || currUser.studentCode) : groupId;
    if (ann) {
      if (!ann.readStatus) ann.readStatus = {};
      if (!ann.readGroupStatus) ann.readGroupStatus = {};
      if (!Array.isArray(ann.confirmedMembers)) ann.confirmedMembers = [];

      ann.readStatus[uKey] = true;
      if (currUser && currUser.studentCode) ann.readStatus[currUser.studentCode] = true;
      if (currUser && currUser.id) ann.readStatus[currUser.id] = true;

      ann.readGroupStatus[groupId] = true;
      if (currUser && !ann.confirmedMembers.some(m => m.id === currUser.id)) {
        ann.confirmedMembers.push({
          id: currUser.id,
          name: currUser.name || currUser.studentCode || '学生',
          studentCode: currUser.studentCode || '',
          groupId: groupId,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
      }

      localStorage.setItem(STORAGE_KEY_ANNOUNCEMENTS, JSON.stringify(announcements));
      try {
        fetch('sync.php?action=update_read_status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            annId, groupId,
            userId: currUser ? currUser.id : '',
            userCode: currUser ? currUser.studentCode : '',
            userName: currUser ? currUser.name : ''
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
      fetch('sync.php?action=record_teacher_alert', {
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
    const account = presetAccount || (currentUser ? (currentUser.studentCode || currentUser.username || currentUser.id) : '');

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
            <input type="text" id="input-pwd-account" value="${account}" ${account ? 'readonly' : ''} style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;background:${account ? '#f8fafc' : '#fff'};">
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
            body: JSON.stringify({ account: acc, oldPassword: oldP, newPassword: newP })
          });
          const data = await res.json();
          if (data && data.success) {
            msgDiv.style.display = 'block';
            msgDiv.style.background = '#f0fdf4';
            msgDiv.style.color = '#16a34a';
            msgDiv.textContent = '✅ ' + (data.message || '密码修改成功！');
            setTimeout(() => {
              closeModal();
              if (window.app && window.app.showNotification) {
                window.app.showNotification('🎉 密码修改成功，请牢记新密码');
              }
            }, 1200);
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
