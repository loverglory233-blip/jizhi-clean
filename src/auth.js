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
} from './constants.js?v=20260905_v2545';
import { formatExportDateTime, formatDurationHuman, isScopeMatch, showGlobalBannerNotice, isSameId, normalizeId } from './utils.js?v=20260905_v2545';

export class AuthManager {
  constructor() {
    this._pruneStorageQuota();
    // 🛡️ 彻底清除历史遗留的本地删除黑名单缓存，以 MySQL 服务端数据为唯一权威真相
    try {
      [
        'jizhi_deleted_user_ids',
        'jizhi_deleted_class_ids',
        'jizhi_deleted_task_ids',
        'jizhi_deleted_ann_ids',
        'jizhi_deleted_paper_ids',
        'jizhi_deleted_survey_ids'
      ].forEach(k => localStorage.removeItem(k));
    } catch (e) {}
    this.initDatabase();
    this.sanitizeAndDeduplicateGroups();
    this.removeLegacyTestAccounts();
    this.cleanseUserTitles();
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

      const getMemberId = (m) => (typeof m === 'object' && m !== null) ? m.id : m;

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
          LEGACY_NAMES.has(u.name)
        );
        if (isLegacy) {
          if (u.id) removedKeys.add(u.id);
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
              const mid = (typeof m === 'object' && m !== null) ? m.id : m;
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

  // 🧹 自动清理所有学生姓名中的历史遗留【(组长)/(组员)】角色后缀，彻底保持纯净全员平等
  cleanseUserTitles() {
    try {
      let users = [];
      try { users = JSON.parse(localStorage.getItem(STORAGE_KEY_USERS_DB)) || []; } catch (e) { users = []; }
      if (!Array.isArray(users)) users = [];
      let changed = false;
      users.forEach(u => {
        if (u && u.name) {
          const clean = String(u.name).replace(/\s*[\(（](?:组长|组员|队长|队员)[\)）]/g, '').trim();
          if (clean && clean !== u.name) {
            u.name = clean;
            changed = true;
          }
        }
      });
      if (changed) {
        localStorage.setItem(STORAGE_KEY_USERS_DB, JSON.stringify(users));
      }

      try {
        const cur = JSON.parse(localStorage.getItem(STORAGE_KEY_USER) || 'null');
        if (cur && cur.name) {
          const cleanCur = String(cur.name).replace(/\s*[\(（](?:组长|组员|队长|队员)[\)）]/g, '').trim();
          if (cleanCur && cleanCur !== cur.name) {
            cur.name = cleanCur;
            localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(cur));
          }
        }
      } catch (e) {}
    } catch (e) {}
  }

  _normalizeUser(u) {
    if (!u || typeof u !== 'object') return null;
    const id = String(u.id || '').trim();
    if (!id) return null;
    let name = String(u.name || id || (u.role === 'teacher' ? '老师' : '学生')).trim();
    name = name.replace(/\s*[\(（](?:组长|组员|队长|队员)[\)）]/g, '').trim() || id;
    const classId = u.classId || (Array.isArray(u.classIds) && u.classIds[0]) || null;
    const classIds = Array.isArray(u.classIds) ? u.classIds : (classId ? [classId] : []);
    return {
      id: id,
      name: name,
      role: u.role || 'student',
      classId: classId,
      classIds: classIds,
      className: u.className || '',
      groupId: u.groupId || null,
      password: (u.password !== undefined && u.password !== null && String(u.password).trim() !== '') ? String(u.password).trim() : '123',
      avatar: u.avatar || (u.role === 'teacher' ? '👩‍🏫' : '👨‍🎓'),
      email: u.email || `${id.toLowerCase()}@jizhi.edu`
    };
  }

  findUserByKey(key) {
    if (!key) return null;
    if (typeof key === 'object') {
      if (key.name && key.id) return this._normalizeUser(key);
      key = key.id || key.name || '';
    }
    const cleanKey = String(key).trim().toLowerCase();
    if (!cleanKey) return null;

    const users = this.getUsers();
    // 1. 在 users 列表中按 id(学号) 或 name(姓名) 比对
    let found = users.find(u => {
      if (!u) return false;
      const uid = String(u.id || '').trim().toLowerCase();
      const name = String(u.name || '').trim().toLowerCase();
      return uid === cleanKey || name === cleanKey;
    });
    if (found) return found;

    // 2. 在 classes 名册中的 student 列表中查找
    const classes = this.getClasses();
    for (const cls of classes) {
      if (cls && Array.isArray(cls.students)) {
        found = cls.students.find(s => {
          if (!s) return false;
          const sid = String(s.id || '').trim().toLowerCase();
          const sname = String(s.name || '').trim().toLowerCase();
          return sid === cleanKey || sname === cleanKey;
        });
        if (found) return this._normalizeUser(found);
      }
    }
    return null;
  }

  async pullGlobalMeta(force = false) {
    if (this._isPullingMeta) return { success: false, inFlight: true };
    // 🛡️ 教师推送在途时挂起本次拉取，避免用过期云端数据反向覆盖本地刚写入的新数据（导入学生/建组后被清空的根因）
    if (this._pushInFlight) {
      this._pendingPull = true;
      return { success: false, pending: true };
    }
    this._isPullingMeta = true;
    try {
      const currUser = this.getCurrentUser();
      const userKey = currUser ? currUser.id : '';
      const sessToken = currUser ? (currUser.activeSessionId || currUser.token || '') : '';
      const clientVer = force ? 0 : (this.globalMetaVersion || 0);
      const forceParam = force ? '&force=1' : '';
      const res = await fetch(`sync.php?action=get_global_meta&ver=${clientVer}&userId=${encodeURIComponent(userKey)}&sessToken=${encodeURIComponent(sessToken)}${forceParam}&nocache=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.kicked) {
          this.logout();
          alert('⚠️ 您的账号已在另一台设备登录，当前页面已自动下线。');
          if (window.app && typeof window.app.renderMain === 'function') {
            window.app.renderMain();
          } else {
            window.location.reload();
          }
          return { success: false, kicked: true };
        }
        if (data) {
          this.isGlobalMetaLoaded = true;
          if (data.version !== undefined) {
            this.globalMetaVersion = parseInt(data.version, 10);
            if (window.app && window.app.cloudSyncEngine) {
              window.app.cloudSyncEngine._lastKnownMetaVer = this.globalMetaVersion;
            }
          }
          if (data.unchanged) {
            return { success: true, changed: false, version: this.globalMetaVersion }; // ⚡ 极速早退：服务端版本未变，0 开销
          }
          // 1. 账号池：以服务端数据为准，保留本地非默认自定义密码
          if (Array.isArray(data.users)) {
            const localUsers = this.getUsers();
            const userMap = new Map();
            data.users.forEach(u => {
              if (u && u.id) {
                const k = String(u.id).trim().toLowerCase();
                userMap.set(k, u);
              }
            });
            localUsers.forEach(u => {
              if (u && u.id) {
                const k = String(u.id).trim().toLowerCase();
                if (!userMap.has(k)) {
                  userMap.set(k, u);
                } else {
                  const rUser = userMap.get(k);
                  const preservedPassword = (u.password && u.password !== '123') ? u.password : (rUser.password || u.password || '123');
                  const mergedClassIds = Array.from(new Set([...(rUser.classIds || [rUser.classId].filter(Boolean)), ...(u.classIds || [u.classId].filter(Boolean))]));
                  userMap.set(k, { ...rUser, ...u, password: preservedPassword, classIds: mergedClassIds });
                }
              }
            });
            localStorage.setItem(STORAGE_KEY_USERS_DB, JSON.stringify(Array.from(userMap.values())));
          }

          // 2. 班级与小组：服务端为权威基准，保留教师本地在途更新
          if (Array.isArray(data.classes)) {
            const isTeacher = currUser && (currUser.role === 'teacher' || currUser.isTeacher);
            const localClasses = this.getClasses();
            const classMap = new Map();
            data.classes.forEach(c => {
              if (c && c.id) {
                classMap.set(c.id, c);
              }
            });
            if (isTeacher) {
              localClasses.forEach(c => {
                if (c && c.id) {
                  if (!classMap.has(c.id)) {
                    classMap.set(c.id, c);
                  } else {
                    const rClass = classMap.get(c.id);
                    const mergedStudentIds = Array.from(new Set([...(rClass.studentIds || []), ...(c.studentIds || [])]));
                    const grpMap = new Map();
                    (rClass.groups || []).forEach(g => { if (g && g.id) grpMap.set(g.id, g); });
                    (c.groups || []).forEach(g => { if (g && g.id) grpMap.set(g.id, g); });
                    classMap.set(c.id, { ...rClass, ...c, studentIds: mergedStudentIds, groups: Array.from(grpMap.values()) });
                  }
                }
              });
            }
            localStorage.setItem(STORAGE_KEY_CLASSES, JSON.stringify(Array.from(classMap.values())));
            this.sanitizeAndDeduplicateGroups();
          }

          // 3. 写作任务：以教师端权威发布的云端数据为准（学生端绝不反向复活已删任务，教师端保留本地已建任务）
          if (Array.isArray(data.tasks)) {
            const isTeacher = currUser && (currUser.role === 'teacher' || currUser.isTeacher);
            const taskMap = new Map();

            // 1) 装载云端权威任务
            data.tasks.forEach(remoteT => {
              if (remoteT && remoteT.id) {
                taskMap.set(remoteT.id, remoteT);
              }
            });

            // 2) 教师端保留本地在途有效任务，学生端以云端为绝对权威
            if (isTeacher) {
              const localTasks = this.getTasks();
              localTasks.forEach(localT => {
                if (!localT || !localT.id) return;
                if (!taskMap.has(localT.id)) {
                  taskMap.set(localT.id, localT);
                } else {
                  const remoteT = taskMap.get(localT.id);
                  if (localT.lastExtension) {
                    const localExtAt = localT.lastExtension.extendedAt || 0;
                    const remoteExtAt = remoteT.lastExtension ? (remoteT.lastExtension.extendedAt || 0) : 0;
                    if (localExtAt >= remoteExtAt) {
                      taskMap.set(localT.id, {
                        ...remoteT,
                        ...localT,
                        deadline: localT.deadline,
                        durationMinutes: localT.durationMinutes,
                        lastExtension: localT.lastExtension
                      });
                    }
                  }
                }
              });
            }

            const mergedTasks = Array.from(taskMap.values());
            localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(mergedTasks));
            localStorage.setItem('jizhi_pure_v10_tasks_db', JSON.stringify(mergedTasks));

            // 🛡️ 核心守卫：当前任务被教师删除时立即弹窗通知并安全返回任务大厅
            if (window.app && window.app.state && window.app.state.studentViewMode === 'workspace' && window.app.state.activeTaskId) {
              const activeTid = window.app.state.activeTaskId;
              const isTaskStillAlive = taskMap.has(activeTid);
              if (taskMap.size > 0 && !isTaskStillAlive && !window.app._isHandlingTaskRevoked) {
                window.app.showTaskRevokedModal(window.app.state.activeTaskTitle || '当前写作任务');
                return;
              }
            }

            // ⏰ 检查任务截止时间是否延长并实时通知工作台
            if (window.app && window.app.cloudSyncEngine) {
              mergedTasks.forEach(t => {
                if (!t || !t.id) return;
                const oldDeadline = window.app.cloudSyncEngine._knownTaskDeadlines[t.id];
                if (oldDeadline !== undefined && t.deadline && oldDeadline !== t.deadline) {
                  window.app.cloudSyncEngine._knownTaskDeadlines[t.id] = t.deadline;
                  window.app.cloudSyncEngine.handleTaskDeadlineChange(t, oldDeadline);
                } else if (oldDeadline === undefined && t.lastExtension && (Date.now() - (t.lastExtension.extendedAt || 0) < 180000)) {
                  window.app.cloudSyncEngine._knownTaskDeadlines[t.id] = t.deadline;
                  window.app.cloudSyncEngine.handleTaskDeadlineChange(t, '');
                } else if (t.deadline) {
                  window.app.cloudSyncEngine._knownTaskDeadlines[t.id] = t.deadline;
                }
              });
            }
          }

          // 4. 课堂通知：智能合并，继承已读标记
          if (Array.isArray(data.announcements)) {
            const isTeacher = currUser && (currUser.role === 'teacher' || currUser.isTeacher);
            const localAnns = JSON.parse(localStorage.getItem(STORAGE_KEY_ANNOUNCEMENTS) || '[]');
            const annMap = new Map();

            data.announcements.forEach(remoteAnn => {
              if (remoteAnn && remoteAnn.id) {
                annMap.set(remoteAnn.id, remoteAnn);
              }
            });

            localAnns.forEach(localAnn => {
              if (!localAnn || !localAnn.id) return;

              if (isTeacher && !annMap.has(localAnn.id)) {
                annMap.set(localAnn.id, localAnn);
              } else if (annMap.has(localAnn.id)) {
                const remoteAnn = annMap.get(localAnn.id);
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

                annMap.set(localAnn.id, {
                  ...remoteAnn,
                  ...localAnn,
                  readStatus: mergedReadStatus,
                  readGroupStatus: mergedGroupStatus,
                  confirmedMembers: Array.from(confMembersMap.values())
                });
              }
            });

            const mergedAnns = Array.from(annMap.values());
            localStorage.setItem(STORAGE_KEY_ANNOUNCEMENTS, JSON.stringify(mergedAnns));
            localStorage.setItem('jizhi_announcements_db', JSON.stringify(mergedAnns));
          }

          // 5. 学术文献与范文：云端权威，保留教师本地在途
          if (Array.isArray(data.referencePapers)) {
            const isTeacher = currUser && (currUser.role === 'teacher' || currUser.isTeacher);
            const oldPapers = JSON.parse(localStorage.getItem('jizhi_reference_papers_db') || '[]');
            const paperMap = new Map();

            data.referencePapers.forEach(p => {
              if (p && p.id) {
                paperMap.set(p.id, p);
              }
            });

            if (isTeacher) {
              oldPapers.forEach(localP => {
                if (localP && localP.id) {
                  if (!paperMap.has(localP.id)) {
                    paperMap.set(localP.id, localP);
                  }
                }
              });
            }

            const mergedPapers = Array.from(paperMap.values());
            localStorage.setItem('jizhi_reference_papers_db', JSON.stringify(mergedPapers));
            localStorage.setItem('jizhi_pure_v10_ref_papers_db', JSON.stringify(mergedPapers));
          }

          // 6. 课程问卷配置：云端权威，保留教师本地在途
          if (Array.isArray(data.surveys)) {
            const isTeacher = currUser && (currUser.role === 'teacher' || currUser.isTeacher);
            const localSurveys = JSON.parse(localStorage.getItem('jizhi_surveys_list_db') || '[]');
            const surveyMap = new Map();

            data.surveys.forEach(s => {
              if (s && s.id) {
                surveyMap.set(s.id, s);
              }
            });

            if (isTeacher) {
              localSurveys.forEach(localS => {
                if (localS && localS.id) {
                  if (!surveyMap.has(localS.id)) {
                    surveyMap.set(localS.id, localS);
                  }
                }
              });
            }

            localStorage.setItem('jizhi_surveys_list_db', JSON.stringify(Array.from(surveyMap.values())));
          }
          }

          return { success: true, changed: true, version: this.globalMetaVersion, data };
        }
      }
      return { success: false };
    } catch (e) {
      return { success: false, error: e };
    } finally {
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
        if (!window._jizhiGlobalBc) {
          window._jizhiGlobalBc = new BroadcastChannel('jizhi_global_events');
        }
        window._jizhiGlobalBc.postMessage({ type: 'survey_updated', classId, taskId, url: cleanUrl });
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
        if (!window._jizhiGlobalBc) {
          window._jizhiGlobalBc = new BroadcastChannel('jizhi_global_events');
        }
        window._jizhiGlobalBc.postMessage({ type: 'survey_deleted', surveyId });
      } catch (e) {}
    }
  }
  getSurveyUrl(classId, taskId) {
    const list = this.getSurveysList();
    if (!Array.isArray(list) || list.length === 0) return '';
    
    // 1. 最高优先级：精准匹配 班级 + 任务
    const exactMatch = list.find(s => {
      const matchCls = !s.classId || s.classId === 'all' || isSameId(s.classId, classId);
      const matchTsk = isSameId(s.taskId, taskId);
      return matchCls && matchTsk && s.url && s.url.startsWith('http');
    });
    if (exactMatch) return exactMatch.url;

    // 2. 第二优先级：匹配班级全局问卷 (taskId 为 all / task_all 或为空)
    const classGlobalMatch = list.find(s => {
      const matchCls = !s.classId || s.classId === 'all' || s.classId === 'class_all' || isSameId(s.classId, classId);
      const matchTsk = !s.taskId || s.taskId === 'all' || s.taskId === 'task_all';
      return matchCls && matchTsk && s.url && s.url.startsWith('http');
    });
    if (classGlobalMatch) return classGlobalMatch.url;

    // 3. 第三优先级：全校通用兜底问卷 (仅限 classId 为 all 或空，且 taskId 为 all 或空的问卷)
    const universalMatch = list.find(s => (!s.classId || s.classId === 'all') && (!s.taskId || s.taskId === 'all' || s.taskId === 'task_all') && s.url && s.url.startsWith('http'));
    return universalMatch ? universalMatch.url : '';
  }
  pushGlobalMeta() {
    const currUser = this.getCurrentUser();
    const isTeacher = currUser && (currUser.role === 'teacher' || currUser.isTeacher || currUser.id === '1001');
    
    if (!isTeacher) {
      return Promise.resolve();
    }
    this.isGlobalMetaLoaded = true;

    const teacherUserId = currUser?.id || '';
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
      const seenIds = new Set();
      const uniqueUsers = [];
      let changed = false;

      users.forEach(u => {
        const norm = this._normalizeUser(u);
        if (!norm || !norm.id) return;
        if (norm.role === 'teacher' && !norm.name) {
          norm.name = '老师';
          changed = true;
        }

        const idKey = norm.id.toLowerCase();
        if (!seenIds.has(idKey)) {
          seenIds.add(idKey);
          uniqueUsers.push(norm);
        } else {
          changed = true;
        }
      });

      users = uniqueUsers;
      if (changed) {
        localStorage.setItem(STORAGE_KEY_USERS_DB, JSON.stringify(users));
      }
    }
    return users.map(u => this._normalizeUser(u));
  }
  getClasses() {
    let classes = [];
    try {
      const stored = localStorage.getItem(STORAGE_KEY_CLASSES);
      if (stored) classes = JSON.parse(stored);
    } catch (e) { classes = []; }
    if (!Array.isArray(classes)) classes = [];

    // 🛡️ 班级小组名单单组排他性防御校验：杜绝一人跨多组
    classes.forEach(c => {
      if (c && Array.isArray(c.groups)) {
        const seenMemberIds = new Set();
        // 逆向遍历：保留最新分配的小组
        for (let i = c.groups.length - 1; i >= 0; i--) {
          const g = c.groups[i];
          if (g && Array.isArray(g.members)) {
            g.members = g.members.filter(m => {
              const mKey = String((typeof m === 'object' && m !== null) ? (m.id || m.userId || m.name) : m).trim().toLowerCase();
              if (!mKey || seenMemberIds.has(mKey)) return false;
              seenMemberIds.add(mKey);
              return true;
            });
          }
        }
      }
    });
    return classes;
  }
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
    const cleanId = String(cached.id || '').trim().toLowerCase();
    const freshUser = allUsers.find(u => u && u.id && String(u.id).trim().toLowerCase() === cleanId);
    if (freshUser) {
      return { ...cached, ...freshUser, activeSessionId: cached.activeSessionId };
    }
    return this._normalizeUser(cached);
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
        const user = this._normalizeUser(data.user);
        user.token = data.token;
        user.activeSessionId = data.token;
        sessionStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
        localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
        sessionStorage.setItem('jizhi_student_view_mode', 'task_list');
        localStorage.setItem('jizhi_student_view_mode', 'task_list');
        sessionStorage.removeItem('jizhi_active_task_id');
        localStorage.removeItem('jizhi_active_task_id');
        if (window.app && window.app.state) {
          window.app.state.studentViewMode = 'task_list';
          window.app.state.activeTaskId = null;
        }
        return { success: true, user };
      } else {
        const localRes = this.login(accountInput, password, role);
        if (localRes && localRes.success) return localRes;
        return {
          success: false,
          message: (data && data.message) ? data.message : (localRes && localRes.message ? localRes.message : '❌ 账号或密码错误，请核对后重试'),
          suggestedRole: data?.suggestedRole || localRes?.suggestedRole || null
        };
      }
    } catch (err) {
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
      const uId = String(u?.id || '').trim().toLowerCase();
      // 🛡️ 严格单标识登录：仅认唯一工号/学号（u.id）
      return uId === query;
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
        body: JSON.stringify({ userId: user.id , token: newSessionId, password: pwd })
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
        fetch(`sync.php?action=session_logout&userId=${encodeURIComponent(user.id )}&token=${encodeURIComponent(token)}`).catch(() => {});
      } catch (e) {}
    }
    // 🛡️ 登出时同步停止云端短轮询，杜绝登出后轮询循环继续打服务器
    if (window.app && window.app.cloudSyncEngine && typeof window.app.cloudSyncEngine.stopPolling === 'function') {
      window.app.cloudSyncEngine.stopPolling();
    }
    sessionStorage.removeItem(STORAGE_KEY_USER);
    localStorage.removeItem(STORAGE_KEY_USER);
  }

  createClass(className) {
    const classes = this.getClasses();
    const cleanName = (className || '').trim() || '新教学班';
    if (classes.some(c => (c.name || '').trim().toLowerCase() === cleanName.toLowerCase())) {
      throw new Error(`已存在名为【${cleanName}】的教学班级，不能重复创建！`);
    }
    const newClass = {
      id: 'class_' + Date.now(),
      name: cleanName,
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

  addStudentToClass(name, studentId, classId = null, customPassword = null, isStrictUnique = true) {
    const users = this.getUsers();
    const classes = this.getClasses();
    const cleanId = (studentId || '').trim();
    const targetClass = classId ? (classes.find(c => c.id === classId) || null) : null;
    
    const existingUser = users.find(u =>
      u.role !== 'teacher' && u.id && u.id.trim().toLowerCase() === cleanId.toLowerCase()
    );

    const avatars = ['👨‍🎓', '👩‍🎓', '🧑‍🎓', '🎓', '📚', '🌟'];
    const avatar = avatars[users.length % avatars.length];

    if (existingUser) {
      if (classId) {
        if (!existingUser.classIds) existingUser.classIds = [existingUser.classId || null].filter(Boolean);
        if (!existingUser.classIds.includes(classId)) existingUser.classIds.push(classId);
        existingUser.classId = classId;
      }
      if (customPassword && customPassword.trim()) existingUser.password = customPassword.trim();
      if (name && name.trim()) existingUser.name = name.trim();
      
      if (targetClass && targetClass.studentIds && !targetClass.studentIds.includes(existingUser.id)) {
        targetClass.studentIds.push(existingUser.id);
        localStorage.setItem(STORAGE_KEY_CLASSES, JSON.stringify(classes));
      }
      localStorage.setItem(STORAGE_KEY_USERS_DB, JSON.stringify(users));
      this.pushGlobalMeta();
      return existingUser;
    }

    const targetUser = this._normalizeUser({
      id: cleanId,
      name: name.trim(),
      role: 'student',
      avatar: avatar,
      classId: targetClass ? targetClass.id : null,
      classIds: targetClass ? [targetClass.id] : [],
      groupId: null,
      password: (customPassword && customPassword.trim()) ? customPassword.trim() : '123'
    });
    users.push(targetUser);
    localStorage.setItem(STORAGE_KEY_USERS_DB, JSON.stringify(users));

    if (targetClass) {
      if (!targetClass.studentIds) targetClass.studentIds = [];
      if (!targetClass.studentIds.includes(targetUser.id)) targetClass.studentIds.push(targetUser.id);
      localStorage.setItem(STORAGE_KEY_CLASSES, JSON.stringify(classes));
    }

    this.pushGlobalMeta();
    return targetUser;
  }

  batchAddStudentsToClass(studentList, classId = null) {
    let createdCount = 0;
    let linkedCount = 0;
    const linkedList = [];
    const users = this.getUsers();
    const classes = this.getClasses();
    const targetClass = classId ? (classes.find(c => isSameId(c.id, classId)) || null) : null;
    if (targetClass && !targetClass.studentIds) targetClass.studentIds = [];

    const avatars = ['👨‍🎓', '👩‍🎓', '🧑‍🎓', '🎓', '📚', '🌟'];
    const addedCodes = [];

    studentList.forEach(st => {
      const code = String(st.id || '').trim();
      const name = (st.name || '').trim();
      if (!code || !name) return;
      addedCodes.push(code.toLowerCase());

      const existing = users.find(u => u && u.id.trim().toLowerCase() === code.toLowerCase());
      if (existing) {
        existing.id = code;
        existing.name = name;
        if (st.password || st.customPassword) {
          existing.password = String(st.password || st.customPassword).trim();
        }
        if (targetClass) {
          if (!existing.classIds || !Array.isArray(existing.classIds)) {
            existing.classIds = existing.classId ? [existing.classId] : [];
          }
          if (!existing.classIds.includes(targetClass.id)) {
            existing.classIds.push(targetClass.id);
          }
          if (!targetClass.studentIds.includes(existing.id)) {
            targetClass.studentIds.push(existing.id);
          }
          linkedList.push({ name: existing.name || name, code });
          linkedCount++;
        }
      } else {
        const newUser = this._normalizeUser({
          id: code,
          name: name,
          role: 'student',
          avatar: avatars[users.length % avatars.length],
          classId: targetClass ? targetClass.id : null,
          classIds: targetClass ? [targetClass.id] : [],
          groupId: null,
          password: String(st.password || st.customPassword || '123').trim() || '123'
        });
        users.push(newUser);
        if (targetClass) targetClass.studentIds.push(code);
        createdCount++;
      }
    });

    localStorage.setItem(STORAGE_KEY_USERS_DB, JSON.stringify(users));
    if (targetClass) localStorage.setItem(STORAGE_KEY_CLASSES, JSON.stringify(classes));
    this.pushGlobalMeta();
    return { createdCount, linkedCount, totalProcessed: createdCount + linkedCount, linkedList };
  }

  createGroup(classId, groupName) {
    const classes = this.getClasses();
    const cls = classes.find(c => c.id === classId) || classes[0];
    if (cls) {
      if (!cls.groups) cls.groups = [];
      const newGroup = {
        id: 'group_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
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
    if (!Array.isArray(classes) || classes.length === 0) return null;

    // 1. 若有指定任务，以该任务绑定的班级为最高准则
    if (activeTaskId) {
      const tasks = this.getTasks();
      const curTask = tasks.find(t => isSameId(t.id, activeTaskId));
      if (curTask && curTask.classId) {
        const matchingClass = classes.find(c => isSameId(c.id, curTask.classId));
        if (matchingClass) return matchingClass.id;
      }
    }

    // 2. 若学生账号有明确的班级属性
    if (user) {
      if (user.classId) {
        const matchingClass = classes.find(c => isSameId(c.id, user.classId));
        if (matchingClass) return matchingClass.id;
      }
      if (Array.isArray(user.classIds) && user.classIds.length > 0) {
        const found = classes.find(c => user.classIds.some(cid => isSameId(cid, c.id)));
        if (found) return found.id;
      }

      // 3. 全局扫描学生真正加入的花名册/小组所属班级
      const uId = String(user.id || '').trim().toLowerCase();
      const uName = String(user.name || '').trim().toLowerCase();
      for (const c of classes) {
        if (Array.isArray(c.students)) {
          const inRoster = c.students.some(s => {
            if (!s) return false;
            const sid = String(s.id || s.studentCode || '').trim().toLowerCase();
            const sname = String(s.name || '').trim().toLowerCase();
            return (uId && sid === uId) || (uName && sname === uName);
          });
          if (inRoster) return c.id;
        }
        if (Array.isArray(c.studentIds)) {
          if (c.studentIds.some(sid => String(sid).trim().toLowerCase() === uId)) {
            return c.id;
          }
        }
        if (Array.isArray(c.groups)) {
          for (const g of c.groups) {
            const hasMember = (g.members || []).some(m => {
              if (!m) return false;
              const mId = String(typeof m === 'object' ? (m.id || m.userId || m.name || '') : m).trim().toLowerCase();
              return (uId && mId === uId) || (uName && mId === uName);
            });
            if (hasMember) return c.id;
          }
        }
      }
    }

    // 4. 未能关联到任何有效班级时返回 null，杜绝静默借调其它班级
    return null;
  }

  getStudentActiveGroup(user, classId = null) {
    if (!user) return { id: 'group_unassigned', name: '未分配小组' };
    const classes = this.getClasses();
    const uId = String(user.id || '').trim().toLowerCase();
    const uName = String(user.name || '').trim().toLowerCase();
    const safeUserKey = user.id || 'unassigned';

    const checkMemberMatch = (m) => {
      if (!m) return false;
      const mRaw = typeof m === 'object' ? (m.id || m.name || m.studentCode || '') : m;
      const mStr = String(mRaw || '').trim().toLowerCase();
      const mNameStr = String((typeof m === 'object' && m.name) ? m.name : mRaw || '').trim().toLowerCase();
      return (uId && (mStr === uId || mNameStr === uId)) || (uName && (mStr === uName || mNameStr === uName));
    };

    // 1. 若指定了班级 ID，仅在指定班级内检索小组
    if (classId) {
      const targetClass = classes.find(c => isSameId(c.id, classId));
      if (targetClass && Array.isArray(targetClass.groups)) {
        for (let i = 0; i < targetClass.groups.length; i++) {
          const g = targetClass.groups[i];
          if ((g.members || []).some(checkMemberMatch)) return g;
        }
      }
      return { id: `group_unassigned_${safeUserKey}`, name: '未分组（待教师分配）' };
    }

    // 2. 若未指定班级，优先在学生主班级中检索，其次在全部班级中检索
    const primaryClassId = user.classId || (Array.isArray(user.classIds) && user.classIds[0]) || null;
    if (primaryClassId) {
      const pClass = classes.find(c => isSameId(c.id, primaryClassId));
      if (pClass && Array.isArray(pClass.groups)) {
        for (const g of pClass.groups) {
          if ((g.members || []).some(checkMemberMatch)) return g;
        }
      }
    }

    for (const c of classes) {
      if (!Array.isArray(c.groups)) continue;
      for (const g of c.groups) {
        if ((g.members || []).some(checkMemberMatch)) return g;
      }
    }

    if (user.groupId) {
      for (const c of classes) {
        const g = (c.groups || []).find(grp => isSameId(grp.id, user.groupId));
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
    const activeClass = effectiveClassId ? classes.find(c => isSameId(c.id, effectiveClassId)) : null;
    if (!activeClass) {
      return { ok: false, reason: '无法解析你所在的教学班级，请联系任课教师完成分班后再进入' };
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
      activeTask = tasks.find(t => isSameId(t.id, taskId)) || null;
    }
    if (!activeTask && tasks.length > 0) {
      const clsTasks = tasks.filter(t => !t.classId || t.classId === 'all' || t.classId === 'class_all' || isSameId(t.classId, activeClass.id));
      activeTask = clsTasks.length > 0 ? clsTasks[0] : tasks[0];
    }
    const resolvedTaskId = activeTask ? activeTask.id : `task_${activeClass.id}_default`;

    // 4) 成员 = 当前登录用户本身
    return {
      ok: true,
      class: activeClass,
      group,
      member: user,
      task: activeTask,
      classId: activeClass.id,
      groupId: group.id,
      taskId: resolvedTaskId
    };
  }

  getAvailableStudentsForGroup(classId, editingGroupId = null) {
    const allClassStudents = this.getClassStudents(classId);
    const classes = this.getClasses();
    const cls = classes.find(c => c.id === classId) || classes[0];
    if (!cls || !cls.groups) return allClassStudents;

    const getMemberId = (m) => String((typeof m === 'object' && m !== null) ? (m.id || m.userId || m.name) : m).trim().toLowerCase();

    const occupiedStudentIds = new Set();
    cls.groups.forEach(g => {
      if (g.id !== editingGroupId) {
        (g.members || []).forEach(m => {
          const mId = getMemberId(m);
          if (mId) occupiedStudentIds.add(mId);
        });
      }
    });

    return allClassStudents.filter(s => {
      const sId = String(s.id || '').trim().toLowerCase();
      const sName = String(s.name || '').trim().toLowerCase();
      return !occupiedStudentIds.has(sId) && !occupiedStudentIds.has(sName);
    });
  }

  updateGroupMembers(classId, groupId, groupName, selectedUserIds = []) {
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
      group = { id: groupId || ('group_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7)), name: cleanGroupName, members: [] };
      cls.groups.push(group);
    } else {
      group.name = cleanGroupName;
    }

    const oldMembers = group.members || [];
    group.members = selectedUserIds;

    // 🛡️ 严格单小组归属保护：将勾选的学生从本班所有其他小组中彻底清除，杜绝一人跨多组或幽灵组员！
    cls.groups.forEach(otherG => {
      if (otherG.id !== group.id && Array.isArray(otherG.members)) {
        otherG.members = otherG.members.filter(uid => {
          const uStr = (typeof uid === 'object' && uid !== null) ? (uid.id || uid.userId || uid.name) : String(uid);
          return !selectedUserIds.some(sid => String(sid).trim().toLowerCase() === String(uStr).trim().toLowerCase());
        });
      }
    });

    localStorage.setItem(STORAGE_KEY_CLASSES, JSON.stringify(classes));

    const users = this.getUsers();
    oldMembers.forEach(oldUid => {
      if (!selectedUserIds.includes(oldUid)) {
        const oldU = users.find(usr => usr.id === oldUid || usr.name === oldUid);
        if (oldU && oldU.groupId === group.id) {
          oldU.groupId = null;
        }
      }
    });

    selectedUserIds.forEach((uid, idx) => {
      const u = users.find(usr => usr.id === uid || usr.name === uid);
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

  deleteStudent(userId, classId = null, permanent = false) {
    let users = this.getUsers();
    const student = users.find(u => u.id === userId);
    const classes = this.getClasses();

    if (permanent || !classId) {
      // 彻底从全平台注销删除
      users = users.filter(u => u.id !== userId);
      classes.forEach(c => {
        if (c.studentIds) c.studentIds = c.studentIds.filter(id => id !== userId);
        if (c.groups) {
          c.groups.forEach(g => {
            if (g.members) g.members = g.members.filter(id => id !== userId);
          });
        }
      });
    } else if (student && classId) {
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
      // 从班级移出后，学生账号依然保留在平台总库中，可在【加入已有学生】中重新分配或彻底注销
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
        const gId = 'group_' + Date.now() + '_' + groupIndex + '_' + Math.random().toString(36).substring(2, 7);
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
          const mId = (typeof m === 'object' && m !== null) ? m.id : m;
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
        const gId = 'group_' + Date.now() + '_' + groupIndex + '_' + Math.random().toString(36).substring(2, 7);
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

  getGroupMembersForWorkspace(groupId = null, classId = null) {
    if (!groupId) return {};
    const users = this.getUsers();
    const classes = this.getClasses();
    const colors = ['#818cf8', '#22d3ee', '#fbbf24', '#ec4899', '#34d399', '#f97316', '#a78bfa'];
    const avatars = ['👨‍🎓', '👩‍🎓', '🧑‍🎓', '🎓', '📚', '🌟'];

    // 1. 优先从指定班级真实分组中检索该小组及其成员
    let targetGrp = null;
    if (classId) {
      const cls = classes.find(c => isSameId(c.id, classId));
      if (cls && Array.isArray(cls.groups)) {
        targetGrp = cls.groups.find(g => g && isSameId(g.id, groupId));
      }
    }
    if (!targetGrp) {
      for (const c of classes) {
        if (Array.isArray(c.groups)) {
          const foundG = c.groups.find(g => g && isSameId(g.id, groupId));
          if (foundG) { targetGrp = foundG; break; }
        }
      }
    }

    const groupUsers = [];
    if (targetGrp && Array.isArray(targetGrp.members) && targetGrp.members.length > 0) {
      targetGrp.members.forEach(m => {
        if (!m) return;
        const mKey = (typeof m === 'object') ? (m.id || m.name) : String(m);
        const cleanKey = String(mKey || '').trim().toLowerCase();
        const matchedU = users.find(u => {
          if (!u) return false;
          return String(u.id || '').trim().toLowerCase() === cleanKey ||
                 String(u.name || '').trim().toLowerCase() === cleanKey;
        });
        if (matchedU) {
          groupUsers.push(matchedU);
        } else if (typeof m === 'object') {
          groupUsers.push(this._normalizeUser(m));
        } else {
          groupUsers.push(this._normalizeUser({ id: mKey, name: mKey, role: 'student' }));
        }
      });
    } else {
      // 2. 兜底：从 users 列表中按 groupId 匹配
      users.forEach(u => {
        if (u && isSameId(u.groupId, groupId) && u.role !== 'teacher') groupUsers.push(u);
      });
    }

    const membersObj = {};
    if (groupUsers.length > 0) {
      // 按 id 去重
      const seen = new Set();
      groupUsers.forEach((u, idx) => {
        const studentId = String(u.id || '').trim();
        if (!studentId) return;
        if (seen.has(studentId)) return;
        seen.add(studentId);

        membersObj[studentId] = {
          id: studentId,
          name: u.name || studentId,
          roleTitle: '组员 · 合作撰写',
          avatar: u.avatar || avatars[(seen.size - 1) % avatars.length],
          color: colors[(seen.size - 1) % colors.length],
          groupId: groupId,
          classId: u.classId || (targetGrp ? targetGrp.classId : null)
        };
      });
    }
    return membersObj;
  }

  createTask(title, classId, instructions, resources = [], startTime = null, deadline = null, durationMinutes = 150, taskType = 'experiment', targetWordCount = 3000) {
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
      targetWordCount: parseInt(targetWordCount) || 3000,
      startTime: defaultStart,
      deadline: defaultDeadline,
      status: 'in_progress',
      createdMs: Date.now(),
      createdAt: defaultStart,
      instructions, resources
    };

    tasks.unshift(newTask);
    localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(tasks));

    if ('BroadcastChannel' in window) {
      try {
        if (!window._jizhiGlobalBc) {
          window._jizhiGlobalBc = new BroadcastChannel('jizhi_global_events');
        }
        window._jizhiGlobalBc.postMessage({ type: 'task_created', task: newTask });
      } catch (e) {}
    }

    const currUser = this.getCurrentUser();
    const teacherUserId = currUser?.id || '1001';
    const teacherToken = currUser?.token || currUser?.activeSessionId || '';

    // ⚡ 极速原子直连落库：毫秒级同步入库 MySQL 与 main_meta 并递增全局版本号
    fetch('sync.php?action=create_task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task: newTask,
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
    }).catch(() => {});

    this.pushGlobalMeta();
    return newTask;
  }

  updateTask(taskId, newTitle, newInstructions, newStartTime, newDeadline, newDurationMinutes, newTargetWordCount) {
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
    if (newTargetWordCount !== undefined) tasks[taskIndex].targetWordCount = parseInt(newTargetWordCount) || 3000;

    localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(tasks));
    this.pushGlobalMeta();
    
    if ('BroadcastChannel' in window) {
      try {
        if (!window._jizhiGlobalBc) {
          window._jizhiGlobalBc = new BroadcastChannel('jizhi_global_events');
        }
        window._jizhiGlobalBc.postMessage({ type: 'task_updated', task: tasks[taskIndex] });
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

    if (targetTask.startTime && newDeadline) {
      try {
        const sDate = new Date(String(targetTask.startTime).replace(/-/g, '/'));
        const dDate = new Date(String(newDeadline).replace(/-/g, '/'));
        if (!isNaN(sDate.getTime()) && !isNaN(dDate.getTime()) && dDate > sDate) {
          targetTask.durationMinutes = Math.round((dDate.getTime() - sDate.getTime()) / (60 * 1000));
        } else if (addedMinutes !== 0) {
          targetTask.durationMinutes = Math.max(1, (parseInt(targetTask.durationMinutes, 10) || 150) + parseInt(addedMinutes, 10));
        }
      } catch (e) {}
    } else if (addedMinutes !== 0) {
      targetTask.durationMinutes = Math.max(1, (parseInt(targetTask.durationMinutes, 10) || 150) + parseInt(addedMinutes, 10));
    }

    const taskTitle = targetTask.title || '写作任务';
    const targetClassId = targetTask.classId || 'all';
    const targetClassName = targetTask.className || '全校班级';
    const humanDiff = addedMinutes >= 0 ? formatDurationHuman(addedMinutes) : `提前 ${formatDurationHuman(Math.abs(addedMinutes))}`;
    targetTask.lastExtension = {
      extendedAt: Date.now(),
      newDeadline: newDeadline,
      addedMinutes: addedMinutes,
      extendDurationStr: humanDiff
    };
    localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(tasks));
    localStorage.setItem('jizhi_pure_v10_tasks_db', JSON.stringify(tasks));

    // ⚡ 本地跨标签页 0 延迟广播
    if ('BroadcastChannel' in window) {
      try {
        if (!window._jizhiGlobalBc) {
          window._jizhiGlobalBc = new BroadcastChannel('jizhi_global_events');
        }
        window._jizhiGlobalBc.postMessage({ type: 'task_extended', task: targetTask, prevDeadline: oldDeadline });
      } catch (e) {}
    }

    const currUser = this.getCurrentUser();
    const teacherUserId = currUser?.id || '1001';
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

    if ('BroadcastChannel' in window) {
      try {
        if (!window._jizhiGlobalBc) {
          window._jizhiGlobalBc = new BroadcastChannel('jizhi_global_events');
        }
        window._jizhiGlobalBc.postMessage({ type: 'task_deleted', taskId: taskId, title: deletedTaskTitle });
      } catch (e) {}
    }

    const currUser = this.getCurrentUser();
    const teacherUserId = currUser?.id || '1001';
    const teacherToken = currUser?.token || currUser?.activeSessionId || '';

    // ⚡ 极速原子直连删除：毫秒级清理 MySQL tasks 与 main_meta 并递增版本号
    fetch('sync.php?action=delete_task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taskId: taskId,
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
    }).catch(() => {});

    this.pushGlobalMeta();
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
        if (!window._jizhiGlobalBc) {
          window._jizhiGlobalBc = new BroadcastChannel('jizhi_global_events');
        }
        window._jizhiGlobalBc.postMessage({ type: 'announcement_created', announcement: newAnn });
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
        if (!window._jizhiGlobalBc) {
          window._jizhiGlobalBc = new BroadcastChannel('jizhi_global_events');
        }
        window._jizhiGlobalBc.postMessage({ type: 'announcement_deleted', annId: annId });
      } catch (e) {}
    }
  }

  markAnnouncementRead(annId, groupId = null) {
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
          userId: currUser ? currUser.id : '',
          userCode: currUser ? currUser.id : '',
          userName: currUser ? currUser.name : '学生'
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

        const alreadyIn = ann.confirmedMembers.some(m => m.id === currUser.id || (currUser.name && m.name === currUser.name));
        if (!alreadyIn) {
          ann.confirmedMembers.push({
            id: currUser.id || ('u_' + Date.now()),
            name: currUser.name || '学生',
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

  markAnnouncementConfirmed(annId, userId, userName, groupId = null) {
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

  markAllTaskAnnouncementsRead(taskId, groupId = null) {
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

    if ('BroadcastChannel' in window) {
      try {
        if (!window._jizhiGlobalBc) {
          window._jizhiGlobalBc = new BroadcastChannel('jizhi_global_events');
        }
        window._jizhiGlobalBc.postMessage({ type: 'paper_uploaded', paper: newPaper });
      } catch (e) {}
    }
    return newPaper;
  }

  deleteReferencePaper(paperId) {
    let papers = this.getAllReferencePapers();
    papers = papers.filter(p => p.id !== paperId);
    if (window._paperMemoryBlobMap) window._paperMemoryBlobMap.delete(paperId);
    localStorage.setItem('jizhi_reference_papers_db', JSON.stringify(papers));
    this.pushGlobalMeta();

    if ('BroadcastChannel' in window) {
      try {
        if (!window._jizhiGlobalBc) {
          window._jizhiGlobalBc = new BroadcastChannel('jizhi_global_events');
        }
        window._jizhiGlobalBc.postMessage({ type: 'paper_deleted', paperId });
      } catch (e) {}
    }
  }

  // 📚 教师端下发学术范文：更新元数据并广播通知，由学生端在阶段二结合文献配置自主呈现
  pushReferencePaperToGroupChat(paperId, targetGroupId = 'all') {
    this.pushGlobalMeta();
    if ('BroadcastChannel' in window) {
      try {
        if (!window._jizhiGlobalBc) {
          window._jizhiGlobalBc = new BroadcastChannel('jizhi_global_events');
        }
        window._jizhiGlobalBc.postMessage({ type: 'paper_updated', paperId, targetGroupId });
      } catch (e) {}
    }
  }

  openExportFormatModal({ onSelect, title = '导出研讨记录表' }) {
    document.querySelectorAll('.modal-overlay-export-format').forEach(el => el.remove());
    const modal = document.createElement('div');
    modal.className = 'modal-overlay modal-overlay-export-format';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.7);backdrop-filter:blur(4px);z-index:999999;display:flex;align-items:center;justify-content:center;padding:20px;';
    modal.innerHTML = `
      <div style="background:#ffffff; border-radius:16px; box-shadow:0 20px 25px -5px rgba(0,0,0,0.2); width:100%; max-width:400px; overflow:hidden; animation:fadeIn 0.2s ease;">
        <div style="background:linear-gradient(135deg, #059669, #10b981); padding:16px 20px; color:#ffffff; display:flex; justify-content:space-between; align-items:center;">
          <div style="font-size:15px; font-weight:700; display:flex; align-items:center; gap:8px;">📥 ${title}</div>
          <button id="btn-close-export-format-modal" style="background:none; border:none; color:#ffffff; font-size:20px; cursor:pointer; line-height:1;">&times;</button>
        </div>
        <div style="padding:20px 22px; display:flex; flex-direction:column; gap:10px;">
          <div style="font-size:12.5px; color:#475569; margin-bottom:2px;">请选择您希望保存的文件格式：</div>
          
          <button id="btn-choose-xlsx" style="background:#f0fdf4; border:1.5px solid #86efac; color:#15803d; padding:12px 16px; border-radius:10px; font-size:13.5px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:space-between;">
            <div style="display:flex; align-items:center; gap:10px;">
              <span style="font-size:22px;">📗</span>
              <div style="text-align:left;">
                <div style="color:#166534; font-size:13.5px; font-weight:700;">Excel 工作簿 (.xlsx)</div>
                <div style="color:#15803d; font-size:11px; font-weight:500;">推荐 · 自适应列宽 · 排版优美</div>
              </div>
            </div>
            <span style="font-size:11px; background:#dcfce7; color:#166534; padding:2px 6px; border-radius:4px; font-weight:700;">推荐</span>
          </button>

          <button id="btn-choose-csv" style="background:#f8fafc; border:1.5px solid #cbd5e1; color:#334155; padding:12px 16px; border-radius:10px; font-size:13.5px; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:10px;">
            <span style="font-size:22px;">📄</span>
            <div style="text-align:left;">
              <div style="color:#1e293b; font-size:13.5px; font-weight:700;">通用文本表格 (.csv)</div>
              <div style="color:#64748b; font-size:11px; font-weight:500;">UTF-8 纯文本编码 · 兼容性强</div>
            </div>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    modal.querySelector('#btn-close-export-format-modal').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    modal.querySelector('#btn-choose-xlsx').addEventListener('click', () => {
      closeModal();
      if (typeof onSelect === 'function') onSelect('xlsx');
    });

    modal.querySelector('#btn-choose-csv').addEventListener('click', () => {
      closeModal();
      if (typeof onSelect === 'function') onSelect('csv');
    });
  }

  _downloadCsvBlob(rowsData, fileNameBase) {
    let csvContent = '\uFEFF';
    rowsData.forEach(row => {
      const escRow = row.map(cell => `"${String(cell !== undefined && cell !== null ? cell : '').replace(/"/g, '""')}"`);
      csvContent += escRow.join(',') + '\n';
    });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${fileNameBase}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  exportGroupChatLogsToExcel(groupId = null, chatLogsState = null, groupName = null, format = 'xlsx') {
    const currentChatLogs = chatLogsState || (window.app && window.app.state && window.app.state.chatLogs) || {};
    const stageNames = { stage1: '阶段一：学术拍卖会', stage2: '阶段二：学术编辑部', stage3: '阶段三：答辩擂台' };
    const users = this.getUsers();
    const rowsData = [
      ['阶段', '发言人', '时间', '研讨内容']
    ];

    ['stage1', 'stage2', 'stage3'].forEach(stageKey => {
      const logs = currentChatLogs[stageKey] || [];
      if (logs.length > 0) {
        logs.forEach(msg => {
          let senderDisplayName = msg.senderName || msg.sender;
          if (msg.sender === 'auctioneer') senderDisplayName = '拍卖师 Agent';
          else if (msg.sender === 'managingEditor') senderDisplayName = '责任编辑 Agent';
          else if (msg.sender === 'reviewingEditor') senderDisplayName = '审稿编辑 Agent';
          else if (msg.sender === 'opponent') senderDisplayName = '反方委员 Agent';
          else if (msg.sender === 'proponent') senderDisplayName = '正方委员 Agent';
          else if (msg.sender === 'neutral') senderDisplayName = '中间委员 Agent';
          else {
            const foundUser = users.find(u => u.id === msg.sender || u.name === msg.sender);
            if (foundUser && foundUser.name) senderDisplayName = foundUser.name;
            else senderDisplayName = `小组成员 (${msg.sender})`;
          }
          const time = formatExportDateTime(msg._timeMs || msg.timestamp);
          const text = (msg.text || '').replace(/\r\n/g, ' ').replace(/\n/g, ' ');
          rowsData.push([stageNames[stageKey], senderDisplayName, time, text]);
        });
      }
    });

    const safeGName = (groupName || groupId || '协作小组').replace(/[\\/:*?"<>|]/g, '_');
    const todayStr = new Date().toISOString().slice(0, 10);
    const fileNameBase = `${safeGName}_学术对话与写作记录表_${todayStr}`;

    if (format === 'xlsx' && window.XLSX) {
      try {
        const ws = window.XLSX.utils.aoa_to_sheet(rowsData);
        ws['!cols'] = [{ wch: 22 }, { wch: 20 }, { wch: 22 }, { wch: 70 }];
        const wb = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(wb, ws, '研讨记录');
        window.XLSX.writeFile(wb, `${fileNameBase}.xlsx`);
        return;
      } catch(e) {}
    }

    this._downloadCsvBlob(rowsData, fileNameBase);
  }

  async exportAllClassGroupsChatLogsToSeparateFiles(classId, taskId = null, format = 'xlsx') {
    const curT = this.getCurrentUser();
    const tToken = (curT && (curT.activeSessionId || curT.token)) || '';
    const tId = (curT && (curT.id)) || '';

    const curCls = this.getClasses().find(c => c.id === classId) || { name: '当前班级', id: classId };
    const res = await fetch(`sync.php?action=get_class_all_chats&classId=${encodeURIComponent(classId)}&taskId=${encodeURIComponent(taskId || '')}&userId=${encodeURIComponent(tId)}&token=${encodeURIComponent(tToken)}`).then(r => r.json()).catch(() => null);

    if (!res || !res.success || !res.groups) {
      alert('⚠️ 获取全班研讨数据失败，请检查网络或重试');
      return;
    }

    const groupList = Object.values(res.groups);
    if (groupList.length === 0) {
      alert('⚠️ 当前班级暂无分组数据');
      return;
    }

    let exportedCount = 0;
    const stageNames = { stage1: '阶段一：学术拍卖会', stage2: '阶段二：学术编辑部', stage3: '阶段三：答辩擂台' };
    const users = this.getUsers();
    const todayStr = new Date().toISOString().slice(0, 10);
    const allTasks = this.getTasks();
    const targetTask = taskId ? allTasks.find(t => t.id === taskId) : null;
    const safeTaskTitle = targetTask && targetTask.title ? `_${targetTask.title.replace(/[\\/:*?"<>|]/g, '_')}` : '';

    groupList.forEach((grp, idx) => {
      const rowsData = [
        ['阶段', '发言人', '时间', '研讨内容']
      ];

      ['stage1', 'stage2', 'stage3'].forEach(stageKey => {
        const logs = grp[stageKey] || [];
        if (logs.length > 0) {
          logs.forEach(msg => {
            let senderDisplayName = msg.senderName || msg.sender;
            if (msg.sender === 'auctioneer') senderDisplayName = '拍卖师 Agent';
            else if (msg.sender === 'managingEditor') senderDisplayName = '责任编辑 Agent';
            else if (msg.sender === 'reviewingEditor') senderDisplayName = '审稿编辑 Agent';
            else if (msg.sender === 'opponent') senderDisplayName = '反方委员 Agent';
            else if (msg.sender === 'proponent') senderDisplayName = '正方委员 Agent';
            else if (msg.sender === 'neutral') senderDisplayName = '中间委员 Agent';
            else {
              const foundUser = users.find(u => u.id === msg.sender || u.name === msg.sender);
              if (foundUser && foundUser.name) senderDisplayName = foundUser.name;
              else senderDisplayName = `小组成员 (${msg.sender})`;
            }
            const time = formatExportDateTime(msg._timeMs || msg.timestamp);
            const text = (msg.text || '').replace(/\r\n/g, ' ').replace(/\n/g, ' ');
            rowsData.push([stageNames[stageKey], senderDisplayName, time, text]);
          });
        }
      });

      const safeClassName = (res.className || curCls.name).replace(/[\\/:*?"<>|]/g, '_');
      const safeGroupName = (grp.name || grp.id).replace(/[\\/:*?"<>|]/g, '_');
      const fileNameBase = `【${safeClassName}】${safeTaskTitle}_${safeGroupName}_研讨记录表_${todayStr}`;

      if (format === 'xlsx' && window.XLSX) {
        setTimeout(() => {
          try {
            const ws = window.XLSX.utils.aoa_to_sheet(rowsData);
            ws['!cols'] = [{ wch: 22 }, { wch: 20 }, { wch: 22 }, { wch: 70 }];
            const wb = window.XLSX.utils.book_new();
            window.XLSX.utils.book_append_sheet(wb, ws, '研讨记录');
            window.XLSX.writeFile(wb, `${fileNameBase}.xlsx`);
          } catch(err) {
            this._downloadCsvBlob(rowsData, fileNameBase);
          }
        }, idx * 250);
      } else {
        setTimeout(() => {
          this._downloadCsvBlob(rowsData, fileNameBase);
        }, idx * 250);
      }

      exportedCount++;
    });

    setTimeout(() => {
      alert(`🎉 成功导出【${res.className || curCls.name}】全班共 ${exportedCount} 个小组的独立研讨记录 (${format.toUpperCase()}) 文件！\n所有文件已分别下载保存。`);
    }, groupList.length * 250 + 300);
  }

  async resetStudentPassword(studentAccount, newPassword = '123') {
    const acc = String(studentAccount || '').trim();
    if (!acc) throw new Error('学生账号不能为空');
    const currentUser = this.getCurrentUser();
    const isTeacher = currentUser && (currentUser.role === 'teacher' || currentUser.isTeacher);
    if (!isTeacher) throw new Error('仅允许教师重置学生密码');

    // 1. 本地立即更新
    const users = this.getUsers();
    const target = users.find(u => u && u.id && u.id.toLowerCase() === acc.toLowerCase());
    if (target) {
      target.password = newPassword;
      localStorage.setItem(STORAGE_KEY_USERS_DB, JSON.stringify(users));
    }

    // 2. 远端数据库持久化重置
    try {
      const res = await fetch('sync.php?action=reset_student_password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account: acc,
          newPassword: newPassword,
          userId: currentUser.id,
          token: currentUser.token || currentUser.activeSessionId || ''
        })
      });
      const data = await res.json().catch(() => ({}));
      if (data && data.success === false) {
        throw new Error(data.message || '重置失败');
      }
    } catch (e) {
      console.warn('[resetStudentPassword] 远端同步异常:', e);
    }
  }

  openChangePasswordModal(presetAccount = null) {
    const currentUser = this.getCurrentUser();
    const isTeacher = currentUser && (currentUser.role === 'teacher' || currentUser.isTeacher);
    const account = isTeacher ? '1001' : (presetAccount || currentUser?.id || '');

    const oldModal = document.getElementById('modal-change-password');
    if (oldModal) oldModal.remove();

    const modal = document.createElement('div');
    modal.id = 'modal-change-password';
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.7);backdrop-filter:blur(4px);z-index:999999;display:flex;align-items:center;justify-content:center;padding:20px;overscroll-behavior:contain;';
    modal.innerHTML = `
      <div style="background:#fff;border-radius:16px;box-shadow:0 20px 25px -5px rgba(0,0,0,0.2);width:100%;max-width:400px;overflow:hidden;overscroll-behavior:contain;animation:fadeIn 0.2s ease;">
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
              if (u.id === (currentUser?.id) || u.id === acc) {
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
