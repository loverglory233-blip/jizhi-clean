/**
 * JIZHI (集智) Platform - Student Task Portal & Dashboard
 * Standard ES Module (ESM)
 */

import {
  STORAGE_KEY_TASKS,
  STORAGE_KEY_ANNOUNCEMENTS,
  STORAGE_KEY_CLASSES,
  TASK_GENRE_CONFIGS
} from "./constants.js?v=20260905_v2635";
import { escapeHtml, isTaskExpired, formatDurationHuman, formatStandardDateDash, showGlobalBannerNotice } from "./utils.js?v=20260905_v2635";

/* ==========================================================================
   10. STUDENT TASK PORTAL (CENTRALIZED HUB & COLLABORATION ENTRY)
   ========================================================================== */
export function renderStudentTaskPortal(container, authManager, state, onSelectTask, onLogout, onOpenAnnModal, onOpenSurveyModal) {
  const savedWinY = window.scrollY || window.pageYOffset || (document.documentElement && document.documentElement.scrollTop) || 0;
  const oldPortal = container.querySelector('.student-task-portal') || document.querySelector('.student-task-portal');
  const savedPortalY = oldPortal ? oldPortal.scrollTop : 0;
  if ('BroadcastChannel' in window) {
    try {
      if (window._studentPortalBc) { try { window._studentPortalBc.close(); } catch (e) {} }
      window._studentPortalBc = new BroadcastChannel('jizhi_global_events');
      window._studentPortalBc.onmessage = (e) => {
        if (state.studentViewMode !== 'task_list') return;
        
        // 1. 新任务发布广播
        if (e.data && e.data.type === 'task_created' && e.data.task) {
          const t = e.data.task;
          renderStudentTaskPortal(container, authManager, state, onSelectTask, onLogout, onOpenAnnModal, onOpenSurveyModal);
          showGlobalBannerNotice('📢 教师发布新任务', `任课教师刚刚发布了全新写作任务《${t.title || '新协作任务'}》！`, 'info', 8000);
          return;
        }

        // 2. 任务被删除广播
        if (e.data && e.data.type === 'task_deleted') {
          renderStudentTaskPortal(container, authManager, state, onSelectTask, onLogout, onOpenAnnModal, onOpenSurveyModal);
          return;
        }

        // 3. 任务更新广播
        if (e.data && e.data.type === 'task_updated') {
          renderStudentTaskPortal(container, authManager, state, onSelectTask, onLogout, onOpenAnnModal, onOpenSurveyModal);
          return;
        }

        // 4. 任务延期广播
        if (e.data && e.data.type === 'task_extended' && e.data.task) {
          const t = e.data.task;
          if (authManager) {
            const localTasks = authManager.getTasks();
            const idx = localTasks.findIndex(lt => lt && (lt.id === t.id || (lt.title && lt.title === t.title)));
            if (idx >= 0) {
              localTasks[idx] = { ...localTasks[idx], ...t, deadline: t.deadline, durationMinutes: t.durationMinutes || localTasks[idx].durationMinutes, lastExtension: t.lastExtension };
            } else {
              localTasks.push(t);
            }
            try { localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(localTasks)); } catch (err) {}
          }
          renderStudentTaskPortal(container, authManager, state, onSelectTask, onLogout, onOpenAnnModal, onOpenSurveyModal);
          
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
            renderStudentTaskPortal(container, authManager, state, onSelectTask, onLogout, onOpenAnnModal, onOpenSurveyModal);
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

  // 🏫 1. 严格且全方位解析当前学生所属/修读的所有班级（支持跨班级修读与无缝选班）
  const curUserId = String(currentUser?.id || '').trim().toLowerCase();
  const curUserName = String(currentUser?.name || '').trim().toLowerCase();
  const userClassIdSet = new Set(
    [
      currentUser?.classId,
      ...(Array.isArray(currentUser?.classIds) ? currentUser.classIds : [])
    ].filter(Boolean)
  );

  const myClasses = (classes || []).filter(c => {
    if (!c || !c.id) return false;

    // A. 用户对象自身绑定的 classId / classIds
    if (userClassIdSet.has(c.id)) return true;

    // B. 班级学生名册匹配 (studentIds) - 解决跨班级导入/添加时选班缺失的核心通道！
    if (Array.isArray(c.studentIds) && curUserId) {
      const inStudentIds = c.studentIds.some(sid => String(sid || '').trim().toLowerCase() === curUserId);
      if (inStudentIds) return true;
    }

    // C. 班级学生对象列表匹配 (students)
    if (Array.isArray(c.students)) {
      const inStudents = c.students.some(s => {
        const sId = String(typeof s === 'object' ? (s.id || s.name || '') : s).trim().toLowerCase();
        const sName = String(typeof s === 'object' ? (s.name || '') : '').trim().toLowerCase();
        return (curUserId && sId === curUserId) || (curUserName && sName === curUserName);
      });
      if (inStudents) return true;
    }

    // D. 班级协作小组组员匹配 (groups.members)
    if (Array.isArray(c.groups)) {
      for (const g of c.groups) {
        if (Array.isArray(g.members)) {
          const found = g.members.some(m => {
            const mId = String(typeof m === 'object' ? (m.id || m.name || '') : m).trim().toLowerCase();
            const mName = String(typeof m === 'object' ? (m.name || '') : '').trim().toLowerCase();
            return (curUserId && mId === curUserId) || (curUserName && mName === curUserName);
          });
          if (found) return true;
        }
      }
    }

    return false;
  });

  const displayClasses = myClasses.length > 0 ? myClasses : (
    (classes || []).filter(c => c.id === (currentUser?.classId || null)).length > 0
      ? (classes || []).filter(c => c.id === (currentUser?.classId || null))
      : (classes || [])
  );

  if (displayClasses.length === 0) {
    container.innerHTML = `
      <div class="student-task-portal" style="min-height:100vh; background:#f0f4f9; display:flex; flex-direction:column;">
        <header class="app-header" style="height:60px; background:#ffffff; border-bottom:1px solid #e2e8f0; display:flex; align-items:center; justify-content:space-between; padding:0 24px; box-shadow:0 1px 3px rgba(15,23,42,0.04);">
          <div class="brand-section" style="display:flex; align-items:center; gap:12px;">
            <div class="brand-logo" style="font-size:20px; font-weight:800; background:linear-gradient(135deg, #1e40af, #2563eb); -webkit-background-clip:text; -webkit-text-fill-color:transparent;">集智 JIZHI</div>
            <div class="brand-badge" style="background:#eff6ff; color:#2563eb; padding:4px 12px; border-radius:20px; font-size:12px; font-weight:700; border:1px solid #bfdbfe;">
              🎓 ${currentUser ? currentUser.name : '学生'} · 暂未加入班级
            </div>
          </div>
          <div class="header-controls" style="display:flex; align-items:center; gap:10px;">
            <button id="btn-portal-change-pwd" style="background:#f0fdf4; color:#16a34a; border:1px solid #bbf7d0; padding:6px 14px; border-radius:18px; font-size:12px; font-weight:700; cursor:pointer;" title="修改登录密码">🔑 修改密码</button>
            <button id="btn-portal-logout" style="background:#fef2f2; color:#dc2626; border:1px solid #fecaca; padding:6px 14px; border-radius:18px; font-size:12px; font-weight:700; cursor:pointer;">🚪 退出登录</button>
          </div>
        </header>

        <main style="flex:1; padding:48px 32px; max-width:800px; width:100%; margin:0 auto; display:flex; flex-direction:column; align-items:center; justify-content:center; box-sizing:border-box;">
          <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:16px; padding:48px 32px; text-align:center; width:100%; box-shadow:0 4px 20px rgba(15,23,42,0.06);">
            <div style="font-size:52px; margin-bottom:16px;">👋</div>
            <h2 style="margin:0 0 12px 0; font-size:20px; font-weight:800; color:#0f172a;">您好，${currentUser ? currentUser.name : '同学'}！</h2>
            <p style="font-size:14px; color:#64748b; line-height:1.7; margin:0 auto 24px; max-width:480px;">
              您目前尚未被分配至任何教学班级中。<br/>请联系任课教师，由教师在教师端将您加入至对应的教学班级及协作小组后，刷新本页面即可参与协作写作任务。
            </p>
            <div style="display:inline-flex; gap:12px;">
              <button onclick="window.location.reload()" style="background:linear-gradient(135deg, #1d4ed8, #2563eb); border:none; color:white; padding:10px 24px; border-radius:10px; font-size:14px; font-weight:800; cursor:pointer; box-shadow:0 4px 12px rgba(37,99,235,0.25);">
                🔄 刷新状态
              </button>
            </div>
          </div>
        </main>
      </div>
    `;
    const btnLogout = container.querySelector('#btn-portal-logout');
    if (btnLogout && onLogout) btnLogout.addEventListener('click', onLogout);
    const btnPwd = container.querySelector('#btn-portal-change-pwd');
    if (btnPwd) {
      btnPwd.addEventListener('click', () => {
        authManager.openChangePasswordModal();
      });
    }
    return;
  }

  const activeUserClassId = state.activeStudentClassId && displayClasses.some(c => c.id === state.activeStudentClassId)
    ? state.activeStudentClassId
    : (displayClasses.find(c => c.id === currentUser?.classId)?.id || (displayClasses[0] ? displayClasses[0].id : null));
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
                const genreCfg = TASK_GENRE_CONFIGS[t.taskType || 'experiment'] || TASK_GENRE_CONFIGS.experiment;
                const wordTarget = t.targetWordCount || 3000;
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
                      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:12px;">
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

                      <!-- 🎯 任务核心指标胶囊 (目标字数与文体) -->
                      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:10px;">
                        <span style="background:#ecfdf5; color:#059669; border:1.5px solid #a7f3d0; padding:3px 10px; border-radius:6px; font-size:12px; font-weight:800; display:inline-flex; align-items:center; gap:4px; box-shadow:0 1px 2px rgba(16,185,129,0.08);">
                          🎯 目标字数: <b style="font-size:13px; color:#047857;">${wordTarget} 字</b>
                        </span>
                        <span style="background:#f5f3ff; color:#7c3aed; border:1.5px solid #ddd6fe; padding:3px 10px; border-radius:6px; font-size:12px; font-weight:800; display:inline-flex; align-items:center; gap:4px; box-shadow:0 1px 2px rgba(124,58,237,0.08);">
                          ${genreCfg.icon} 任务文体: <b>${genreCfg.label}</b>
                        </span>
                        <span style="background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe; padding:3px 10px; border-radius:6px; font-size:11.5px; font-weight:700; display:inline-flex; align-items:center; gap:4px;">
                          ⏱️ 任务时长: <b>${formatDurationHuman(duration)}</b>
                        </span>
                      </div>

                      <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px 12px; font-size:11.5px; color:#475569; margin-bottom:12px; background:${isExpired ? '#fef2f2' : '#f8fafc'}; padding:10px 14px; border-radius:10px; border:1px solid ${isExpired ? '#fee2e2' : '#f1f5f9'};">
                        <div>🕒 发布时间: <b style="color:#0f172a;">${formatStandardDateDash(t.createdAt || t.startTime) || '刚刚'}</b></div>
                        <div>⏱️ 任务时长: <b style="color:#2563eb; font-weight:700;">${formatDurationHuman(duration)}</b></div>
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
      renderStudentTaskPortal(container, authManager, state, onSelectTask, onLogout, onOpenAnnModal, onOpenSurveyModal);
    });
  }

  container.querySelector('#btn-portal-logout')?.addEventListener('click', () => onLogout());
  container.querySelector('#btn-portal-change-pwd')?.addEventListener('click', () => {
    authManager.openChangePasswordModal();
  });
  container.querySelector('#btn-enter-default-workspace')?.addEventListener('click', () => onSelectTask(null));
  container.querySelectorAll('.btn-enter-task-workspace').forEach(btn => {
    btn.addEventListener('click', () => onSelectTask(btn.dataset.taskId));
  });

  // 🎯 精准保持滚动条位置（恢复 window 与容器滚动条位置，彻底杜绝跳回最顶部）
  if (savedWinY > 0) {
    window.scrollTo(0, savedWinY);
    requestAnimationFrame(() => window.scrollTo(0, savedWinY));
    setTimeout(() => window.scrollTo(0, savedWinY), 30);
  }
  const newPortal = container.querySelector('.student-task-portal') || document.querySelector('.student-task-portal');
  if (newPortal && savedPortalY > 0) {
    newPortal.scrollTop = savedPortalY;
    requestAnimationFrame(() => {
      if (newPortal) newPortal.scrollTop = savedPortalY;
    });
    setTimeout(() => {
      if (newPortal) newPortal.scrollTop = savedPortalY;
    }, 30);
  }
}

