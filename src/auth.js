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
} from './constants.js?v=20260901_v1121';
import { formatExportDateTime, formatDurationHuman, isScopeMatch } from './utils.js?v=20260901_v1121';

export class AuthManager {
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

  createTask(title, classId, instructions, resources = [], startTime = null, deadline = null, durationMinutes = 150, taskType = 'experiment') {
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
      taskType: taskType || 'experiment',
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
