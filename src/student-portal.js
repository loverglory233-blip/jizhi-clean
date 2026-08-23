/**
 * JIZHI (集智) Platform - Student Task Portal & Dashboard
 * Standard ES Module (ESM)
 */

import {
  STORAGE_KEY_TASKS,
  STORAGE_KEY_ANNOUNCEMENTS,
  STORAGE_KEY_CLASSES
} from "./constants.js?v=20260823_v51";
import { escapeHtml, isTaskExpired } from "./utils.js?v=20260823_v51";

/* ==========================================================================
   7.5 STUDENT TASK PORTAL / DASHBOARD (我的写作任务大厅)
   ========================================================================== */
export function renderStudentTaskPortal(container, authManager, state, onSelectTask, onLogout, onSwitchTeacher, onOpenAnnModal, onOpenSurveyModal) {
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

