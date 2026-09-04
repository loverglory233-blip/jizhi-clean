/**
 * JIZHI (集智) Platform - Collaborative Rich Text Editor & Academic Plugins
 * Standard ES Module (ESM)
 */

import { AgentProfiles, TASK_GENRE_CONFIGS, getAgentDisplayName, APP_VERSION } from "./constants.js?v=20260905_v2666";
import { callCozeAgentAPI } from "./agents.js?v=20260905_v2666";
import { downloadFileBlob, getCaretCharacterOffsetWithin, setCaretPositionWithin, escapeHtml, sanitizeUrl, isTaskExpired, formatDurationHuman, formatChatDisplayTime, filterAndDeduplicateChatLogs, enforceEtherpadReadonly, liftEtherpadReadonly, ensureEtherpadUserSync, getUserAllKeys, isSameUser, isUserInMap, getUserFromMap, isMemberDone, showResolutionBlock } from "./utils.js?v=20260905_v2666";

/* ==========================================================================
   8. UI RENDERER (STUDENT CANVAS & HEADER)
   ========================================================================== */
export function renderHeader(state, currentUser, announcements, onStageChange, onLogout, onOpenAnnModal, onOpenSurveyModal, onBackToTaskList) {
  const header = document.getElementById('app-header');
  if (!header) return;
  const activeTaskId = (state && state.activeTaskId) ? state.activeTaskId : null;
  const allTasks = (window.app && window.app.authManager) ? window.app.authManager.getTasks() : [];
  const currentTask = allTasks.find(t => t.id === activeTaskId);
  const taskGenreKey = currentTask?.taskType || 'experiment';
  
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
      if (currentUser.name && a.readStatus && a.readStatus[currentUser.name]) return true;
      if (groupId && a.readGroupStatus && a.readGroupStatus[groupId]) return true;
      if (Array.isArray(a.confirmedMembers)) {
        if (a.confirmedMembers.some(m => m && (m.id === currentUser.id || (currentUser.name && m.name === currentUser.name)))) return true;
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
    s1.contract?.isConfirmed || 
    s1.contract?.isLocked || 
    state.groupMaxStage === 'stage2' || 
    state.groupMaxStage === 'stage3'
  );
  const isDraftDone = !!(s2.isDraftConfirmed || state.groupMaxStage === 'stage3' || state.isFinalSubmitted);
  const isStage3Active = !!(state.groupMaxStage === 'stage3' || state.isFinalSubmitted || isDraftDone);

  let currentMaxStage = state.groupMaxStage || 'stage1';
  if (isStage3Active) currentMaxStage = 'stage3';
  else if (isContractSigned || currentMaxStage === 'stage2') currentMaxStage = 'stage2';

  const stageOrder = { stage1: 1, stage2: 2, stage3: 3 };
  const currentMaxOrder = stageOrder[currentMaxStage] || 1;
  // 🌟 截止后或已归档后三个阶段全部解锁，允许学生自由切换查阅回看；未截止且未归档时按协作进度阶梯式解锁
  const isS2Locked = !isTaskDeadlineExpired && !state.isFinalSubmitted && (!isContractSigned && currentMaxOrder < 2);
  const isS3Locked = !isTaskDeadlineExpired && !state.isFinalSubmitted && currentMaxOrder < 3;

  const genreCfg = TASK_GENRE_CONFIGS[taskGenreKey] || TASK_GENRE_CONFIGS.experiment;

  const newHeaderHtml = `
    <div class="brand-section">
      <div class="brand-logo">集智 JIZHI</div>
      <div class="brand-badge" style="background:#eff6ff; color:#1d4ed8; padding:3px 12px; border-radius:20px; font-size:12px; font-weight:700; border:1px solid #bfdbfe; display:inline-flex; align-items:center; gap:6px;">
        <span>🎓 ${escapeHtml(currentUser ? currentUser.name : '学生')}</span>
        <span style="opacity:0.35;">·</span>
        <span>👥 ${escapeHtml(groupName)}</span>
        <span style="opacity:0.35;">·</span>
        <span style="color:#1e40af; background:#ffffff; padding:1.5px 8px; border-radius:10px; border:1px solid #bfdbfe; font-weight:800;">📌 ${escapeHtml(currentTaskTitle)}</span>
        <span style="color:${taskGenreKey === 'instructional' ? '#15803d' : '#1e40af'}; background:#ffffff; padding:1.5px 8px; border-radius:10px; border:1px solid ${taskGenreKey === 'instructional' ? '#86efac' : '#bfdbfe'}; font-weight:800;">${genreCfg.icon} ${genreCfg.label}</span>
        <span style="color:#6366f1; background:#ffffff; padding:1.5px 8px; border-radius:10px; border:1px solid #c7d2fe; font-weight:800;" title="本任务建议目标撰写字数">🎯 目标 ${(currentTask && currentTask.targetWordCount) ? Number(currentTask.targetWordCount) : 3000}字</span>
        ${isFinalSubmitted ? '<span style="color:#059669; margin-left:3px;">(🔒已归档)</span>' : ''}
      </div>
      <button id="btn-header-back-tasks" style="background:#f8fafc; border:1px solid #cbd5e1; color:#334155; padding:3px 8px; border-radius:14px; font-size:11px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:3px;" title="返回我的写作任务大厅">
        📋 任务大厅
      </button>
    </div>
    <nav class="stage-nav">
      <button class="stage-btn ${state.currentStage === 'stage1' ? 'active' : ''}" data-stage="stage1" title="${genreCfg.stage1Title}">🎪 阶段一: ${taskGenreKey === 'instructional' ? '工作坊' : '拍卖会'}</button>
      <button class="stage-btn ${state.currentStage === 'stage2' ? 'active' : ''} ${isS2Locked ? 'stage-locked' : ''}" data-stage="stage2" style="${isS2Locked ? 'opacity:0.65;' : ''}" title="${isS2Locked ? `🔒 待阶段一${taskGenreKey === 'instructional' ? '备课' : ''}公约签署完成后解锁` : genreCfg.stage2Title}">${isS2Locked ? '🔒 ' : ''}📰 阶段二: ${taskGenreKey === 'instructional' ? '备课室' : '编辑部'}</button>
      <button class="stage-btn ${state.currentStage === 'stage3' ? 'active' : ''} ${isS3Locked ? 'stage-locked' : ''}" data-stage="stage3" style="${isS3Locked ? 'opacity:0.65;' : ''}" title="${isS3Locked ? `🔒 待阶段二${taskGenreKey === 'instructional' ? '磨课会议' : '编辑会议'}与正文完成后解锁` : genreCfg.stage3Title}">${isS3Locked ? '🔒 ' : ''}🎓 阶段三: ${taskGenreKey === 'instructional' ? '评审会' : '答辩擂台'}</button>
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

export function renderCanvas(state, handlers) {
  const canvas = document.getElementById('canvas-panel');
  if (!canvas) return;

  // 🛡️ 极致架构升级：采用多阶段独立持久化容器，切换阶段时保留 DOM 与 iframe，彻底根治 Etherpad 闪烁白屏与状态丢失问题
  let s1Container = canvas.querySelector('#stage-canvas-s1');
  let s2Container = canvas.querySelector('#stage-canvas-s2');
  let s3Container = canvas.querySelector('#stage-canvas-s3');

  if (!s1Container || !s2Container || !s3Container) {
    canvas.innerHTML = `
      <div id="stage-canvas-s1" style="display:none; flex-direction:column; width:100%; gap:12px; padding-bottom:36px;"></div>
      <div id="stage-canvas-s2" style="display:none; flex-direction:column; height:100%; width:100%; overflow:hidden;"></div>
      <div id="stage-canvas-s3" style="display:none; flex-direction:column; width:100%; gap:12px; padding-bottom:36px;"></div>
    `;
    s1Container = canvas.querySelector('#stage-canvas-s1');
    s2Container = canvas.querySelector('#stage-canvas-s2');
    s3Container = canvas.querySelector('#stage-canvas-s3');
  }

  const curStage = state.currentStage || 'stage1';
  s1Container.style.display = (curStage === 'stage1') ? 'flex' : 'none';
  s2Container.style.display = (curStage === 'stage2') ? 'flex' : 'none';
  s3Container.style.display = (curStage === 'stage3') ? 'flex' : 'none';

  if (curStage === 'stage1') renderStage1Canvas(s1Container, state, handlers);
  else if (curStage === 'stage2') renderStage2Canvas(s2Container, state, handlers);
  else if (curStage === 'stage3') renderStage3Canvas(s3Container, state, handlers);
}

export function renderPresencePills(editorId, state) {
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
  const currentUid = currUserObj ? String(currUserObj.id || '').trim() : (state.currentUser || '');
  const presence = state.presence || {};
  const serverNow = (state && state.serverTimestamp) ? Number(state.serverTimestamp) : Date.now();
  const allUsers = (window.app && window.app.authManager) ? window.app.authManager.getUsers() : [];

  const newHtml = membersList.map(m => {
    const uid = String(m.id || m.userId || '').trim();
    const candidateKeys = [
      String(m.id || '').trim(),
      String(m.name || '').trim()
    ].filter(Boolean);

    const isSelf = (currUserObj && (
      (currUserObj.id && (m.id === currUserObj.id || uid === String(currUserObj.id))) ||
      (currUserObj.name && m.name === currUserObj.name)
    )) || (uid && uid === currentUid);
    
    let isOnline = isSelf;
    if (!isOnline) {
      for (const k of candidateKeys) {
        const p = presence[k];
        if (p) {
          const pTime = Number(p.lastSeen || p.updatedAt || p.timestamp || 0);
          if (pTime > 0 && ((serverNow - pTime <= 120000) || (pTime - serverNow <= 60000))) {
            isOnline = true;
            break;
          }
        }
      }
    }

    const sectionText = isSelf ? ' (我)' : (isOnline ? ' (在线)' : ' (离线)');
    const color = m.color || '#2563eb';
    let displayName = m.name || uid;
    const matchedUser = allUsers.find(u => u && u.id === uid);
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

export function renderRemoteCursors(editorId, state) {
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
  const taskGenreKey = currentTask?.taskType || 'experiment';
  const isTaskDeadlineExpired = isTaskExpired(currentTask);
  const genreCfg = TASK_GENRE_CONFIGS[taskGenreKey] || TASK_GENRE_CONFIGS.experiment;
  const taskDurMin = Number(currentTask?.durationMinutes) || 150;

  // 🛡️ 稳健解析当前用户的真实姓名与标识
  let currentUserName = currUserObj?.name || '';
  if (!currentUserName && currentUser) {
    const matchedM = membersList.find(m => m && (m.id === currentUser || m.name === currentUser));
    if (matchedM && matchedM.name) currentUserName = matchedM.name;
    else {
      const matchedU = allUsers.find(u => u && (u.id === currentUser || u.name === currentUser));
      if (matchedU && matchedU.name) currentUserName = matchedU.name;
    }
  }
  if (!currentUserName) currentUserName = (typeof currentUser === 'string' && currentUser) ? currentUser : '组员';

  // 🛡️ 稳健的单标识判定辅助函数
  const confirmedMembers = s1.contract.confirmedMembers || {};
  const confirmedCount = membersList.filter(m => isMemberDone(confirmedMembers, m)).length;
  const userHasConfirmed = isMemberDone(confirmedMembers, currUserObj || { id: currentUser, name: currentUserName });
  
  // 🛡️ 真正的公约生效锁定判定：服务端公约已标记生效、或全员已签、或小组已进入阶段二/三、或全盘已提交/任务已截止
  const isAllConfirmed = (totalMembersCount > 0 && confirmedCount >= totalMembersCount);
  const isContractLocked = !!(s1.contract && s1.contract.isConfirmed) || isAllConfirmed || (state.groupMaxStage === 'stage2' || state.groupMaxStage === 'stage3') || state.isFinalSubmitted || isTaskDeadlineExpired;
  const isDraftDone = !!(s1.contractStep === 'completed' || s1.contract?.isDraftGenerated);
  const isInputDisabled = isContractLocked || isDraftDone;
  if (s1.contract && isAllConfirmed) s1.contract.isConfirmed = true;

  const userHasVoted = isMemberDone(s1.hasVoted, currUserObj || { id: currentUser, name: currentUserName });
  const userVotedProposalId = s1.votes ? (getUserFromMap(s1.votes, currUserObj) || s1.votes[currentUser] || (currUserObj && (s1.votes[currUserObj.id] || (currUserObj.name && s1.votes[currUserObj.name])))) : null;
  
  // 严格统计全组实际已投票人数
  const totalVotesCast = membersList.filter(m => isMemberDone(s1.hasVoted, m)).length;
  const isVotingComplete = (totalMembersCount > 0 && totalVotesCast >= totalMembersCount);

  // 严密判断当前登录学生是否已提交提案（过滤掉模糊的 '我' 与 '组员'，严格按当前用户唯一ID与姓名匹配）
  const myProposalKeys = new Set(
    [...getUserAllKeys(currUserObj), currentUser, currentUserName, currUserObj?.id]
      .filter(k => k && k !== '我' && k !== '组员')
      .map(k => String(k).trim().toLowerCase())
  );

  const checkIsMyProposal = (p) => {
    if (!p) return false;
    const pKeys = [p.author, p.authorId, p.authorName]
      .filter(k => k && k !== '我' && k !== '组员')
      .map(k => String(k).trim().toLowerCase());
    if (pKeys.length === 0) return false;
    return pKeys.some(pk => myProposalKeys.has(pk));
  };

  const hasSubmittedMyProposal = (s1.proposals || []).some(p => checkIsMyProposal(p));

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
                const v = getUserFromMap(s1.votes, m) || s1.votes[m.id]  || (m.name && s1.votes[m.name]);
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
              let authorName = '';
              if (p.authorName && p.authorName !== '我' && p.authorName !== '组员' && p.authorName !== p.author) {
                authorName = p.authorName;
              }
              if (!authorName) {
                const authorUser = allUsers.find(u => u && (u.id === p.author || u.id === p.authorId || (u.name && u.name !== '我' && (u.name === p.author || u.name === p.authorName))));
                if (authorUser && authorUser.name && authorUser.name !== '我') authorName = authorUser.name;
              }
              if (!authorName) {
                const authorMem = membersList.find(m => m && (m.id === p.author || m.id === p.authorId || (m.name && m.name !== '我' && (m.name === p.author || m.name === p.authorName))));
                if (authorMem && authorMem.name && authorMem.name !== '我') authorName = authorMem.name;
              }
              if (!authorName) {
                authorName = (p.authorName && p.authorName !== '我' && p.authorName !== p.author) ? p.authorName : (p.author && p.author !== '我' ? p.author : '组员');
              }
              return `
                <div class="proposal-card ${isThisVoted ? 'voted' : ''}" style="display:flex; flex-direction:column; position:relative;">
                  <div class="proposal-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <div class="proposal-title" style="font-weight:800; font-size:14px; color:#0f172a;">💡 ${escapeHtml(p.title)}</div>
                    <span style="font-size:11.5px; background:${proposalVotesCount > 0 ? '#eff6ff' : '#f8fafc'}; color:${proposalVotesCount > 0 ? '#2563eb' : '#64748b'}; border:1px solid ${proposalVotesCount > 0 ? '#bfdbfe' : '#e2e8f0'}; padding:2px 8px; border-radius:10px; font-weight:700; flex-shrink:0;">
                      得票: <b>${proposalVotesCount}</b> 票
                    </span>
                  </div>
                  <div style="font-size:12px; color:#64748b; margin-bottom:8px;">提出人: <b style="color:#0f172a;">${escapeHtml(authorName)}</b></div>
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
                return membersList.filter(m => map[m.id]  || (m.name && map[m.name])).length;
              };
              const isMyDoneHelper = (map) => {
                if (!map) return false;
                return isMemberDone(map, currUserObj || { id: currentUser, name: currentUserName });
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
                const extractName = (taskGenreKey === 'instructional') ? '课题与教学构想' : '主题与研究方案';
                return `
                  <button id="btn-extract-topic" style="background:${isFull ? 'linear-gradient(135deg, #d97706, #b45309)' : (isMe ? 'linear-gradient(135deg, #059669, #047857)' : 'linear-gradient(135deg, #2563eb, #1d4ed8)')}; border:none; color:white; padding:9px 24px; border-radius:20px; font-weight:800; font-size:13.5px; cursor:${isFull ? 'wait' : 'pointer'}; display:inline-flex; align-items:center; gap:6px; box-shadow:0 4px 14px rgba(37,99,235,0.3); transition:all 0.2s;" ${isFull ? 'disabled' : ''}>
                    ${isFull ? `⏳ 全员已确认 (${count}/${totalMembersCount}) · 正在提炼【${extractName}】...` : (isMe ? `✅ 您已确认提炼${extractName} (${count}/${totalMembersCount} 等待其他组员)` : `💡 讨论差不多了？一键提炼【${extractName}】 (${count}/${totalMembersCount})`)}
                  </button>
                `;
              }
            })()}
          </div>
        ` : ''}
      </div>

      <!-- 槽位 1：论文主题 / 教学设计课题 -->
      <div style="display:flex; flex-direction:column; gap:8px; width:100%; margin-bottom:14px; background:#eff6ff; padding:16px; border-radius:12px; border:1px solid #bfdbfe; box-sizing:border-box;">
        <label style="font-size:14px; font-weight:800; color:#1e40af; display:flex; align-items:center; gap:6px;">
          📌 【槽位 1】确认${(taskGenreKey === 'instructional') ? '教学设计课题 / 主题' : '研究方案课题 / 题目'}:
        </label>
        <input type="text" id="contract-topic-input" class="large-contract-input" data-lock-key="topic_title" value="${s1.mergedTitle || s1.contract?.topic || ''}" placeholder="${s1.mergedTitle ? '在此处输入定案课题规范名称...' : '投票有分歧或待定，请在讨论区商定后点击上方一键提炼生成...'}" ${isInputDisabled ? 'disabled readonly style="opacity:0.8; cursor:not-allowed; background:#f8fafc;"' : ''} style="width:100%; box-sizing:border-box; background:#ffffff; color:#0f172a; border:1px solid #cbd5e1; border-radius:8px; padding:12px 14px; font-size:14.5px; font-weight:700; font-family:sans-serif;">
      </div>

      <!-- 槽位 2：方案概述 / 教学构思与主线 -->
      <div style="display:flex; flex-direction:column; gap:8px; width:100%; margin-bottom:20px; background:#f0f9ff; padding:16px; border-radius:12px; border:1px solid #bae6fd; box-sizing:border-box;">
        <label style="font-size:14px; font-weight:800; color:#0369a1; display:flex; align-items:center; gap:6px;">
          📝 【槽位 2】${(taskGenreKey === 'instructional') ? '教学设计整体构想与主线 (核心情境、活动主线与重难点突破)' : '研究方案概述 (具体情境、案例、聚焦点与方法)'}:
        </label>
        <textarea id="contract-overview-input" class="contract-overview-textarea" data-lock-key="research_overview" placeholder="请在讨论区围绕核心主线、关键活动/方法展开研讨，点击上方按钮一键提炼生成（生成后可自由微调）..." ${isInputDisabled ? 'disabled readonly style="opacity:0.8; cursor:not-allowed; background:#f8fafc;"' : ''} style="width:100%; min-height:88px; box-sizing:border-box; background:#ffffff; color:#0f172a; border:1px solid #cbd5e1; border-radius:8px; padding:10px 12px; font-size:13px; line-height:1.6; font-family:sans-serif; resize:vertical;">${s1.contract?.overview || s1.researchOverview || ''}</textarea>
      </div>

      <div style="display:flex; flex-direction:column; gap:16px; width:100%;">
        <!-- 6大研究设计方案模块与时间规划 (文体自适应) -->
        <div style="background:#f8fafc; padding:18px; border-radius:12px; border:1px solid #bfdbfe; width:100%; box-sizing:border-box;">
          <div style="font-weight:800; color:#1e40af; margin-bottom:14px; font-size:14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span>📚 方案核心模块与时间规划 (6 大模块起草):</span>
              <span style="font-size:11.5px; background:#eff6ff; color:#1d4ed8; padding:2px 8px; border-radius:8px; border:1px solid #bfdbfe; font-weight:700;">${genreCfg.icon} ${genreCfg.label}</span>
            </div>
          </div>
          
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            ${genreCfg.modules.map((mod) => {
              const currentVal = s1.contract.timeAllocations[mod.key] !== undefined ? s1.contract.timeAllocations[mod.key] : mod.defaultMinutes;
              return `
                <div style="background:#ffffff; border:1px solid #e2e8f0; border-left:3.5px solid ${mod.color || '#2563eb'}; border-radius:8px; padding:12px 14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap;">
                  <span style="font-weight:800; color:#1e40af; font-size:13.5px;">${escapeHtml(mod.title)}</span>
                  <label style="font-size:12px; color:#475569; display:flex; align-items:center; gap:4px;">
                    用时: <input type="number" class="contract-time-input" data-key="${mod.key}" data-lock-key="time_${mod.key}" value="${currentVal}" ${isInputDisabled ? 'disabled readonly style="opacity:0.8; cursor:not-allowed; background:#f8fafc;"' : ''} style="width:48px; padding:3px 4px; border:1px solid #cbd5e1; border-radius:4px; text-align:center; font-weight:700;"> 分钟
                  </label>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <div style="background:#f8fafc; padding:16px; border-radius:12px; border:1px solid #e2e8f0; width:100%; box-sizing:border-box;">
          <div style="font-weight:700; color:#1e40af; margin-bottom:12px; font-size:14px; display:flex; justify-content:space-between; align-items:center;">
            <span>👥 本组小组成员分工 (共 ${totalMembersCount} 人):</span>
          </div>
          <div style="display:flex; flex-direction:column; gap:10px; width:100%;">
            ${membersList.map((m, idx) => {
              const mKey = m.id   || m.name || (`mem_${idx}`);
              const taskVal = (s1.contract.taskAssignments && (
                s1.contract.taskAssignments[mKey] !== undefined ? s1.contract.taskAssignments[mKey] :
                (m.id && s1.contract.taskAssignments[m.id] !== undefined ? s1.contract.taskAssignments[m.id] :
                (m.name && s1.contract.taskAssignments[m.name] !== undefined ? s1.contract.taskAssignments[m.name] : ''))
              )) || '';
              return `
                <div style="display:flex; flex-direction:column; gap:6px; width:100%; background:#ffffff; padding:12px 14px; border-radius:8px; border:1px solid #e2e8f0; box-sizing:border-box;">
                  <span style="font-weight:800; color:${m.color || '#2563eb'}; font-size:13px;">${m.avatar || '👤'} ${m.name}:</span>
                  <input type="text" class="large-contract-input task-assignment-input" data-mkey="${mKey}" data-lock-key="task_${mKey}" value="${taskVal}" ${isInputDisabled ? 'disabled readonly style="opacity:0.8; cursor:not-allowed; background:#f8fafc;"' : ''} style="width:100%; box-sizing:border-box; background:#ffffff; color:#0f172a; border:1px solid #cbd5e1; border-radius:6px; padding:10px 14px; font-size:13px; font-family:sans-serif;" placeholder="在聊天中商定或在此录入具体负责的写作章节与任务...">
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
            🚀 全员已签署完毕！前往【${genreCfg.stage2Title}】开始${taskGenreKey === 'instructional' ? '教学设计' : '论文'}起草 →
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
      const existingProp = s1.proposals.find(p => checkIsMyProposal(p));
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

        const existingIdx = s1.proposals.findIndex(p => checkIsMyProposal(p));
        const nowMs = Date.now();
        const effectiveAuthorKey = currUserObj?.id || (typeof currentUser === 'string' && currentUser && currentUser !== '我' ? currentUser : '') || currentUserName;
        const effectiveAuthorName = currUserObj?.name || (currentUserName && currentUserName !== '我' ? currentUserName : '') || currentUser || '组员';
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
      });
    });
  };

  const getLockPayload = (fieldKey, value = null) => {
    const currUser = (window.app && window.app.authManager) ? window.app.authManager.getCurrentUser() : null;
    const isTeacher = currUser && (currUser.role === 'teacher' || currUser.isTeacher);
    const effectiveClassId = (isTeacher ? window.app?.state.activeClassId : window.app?.state.activeStudentClassId) || (currUser?.classId || null);
    const activeGroupObj = window.app?.authManager ? window.app.authManager.getStudentActiveGroup(currUser, effectiveClassId) : null;
    const curGid = activeGroupObj?.id || (currUser?.groupId || state.activeGroupId || null);
    let curTaskId = window.app?.state.activeTaskId || (window.app?.cloudSyncEngine?.taskId || '');
    const uId = currUser ? (currUser.id) : 'u';
    const uName = currUser ? (currUser.name ) : '组员';
    const payload = { fieldKey, userId: uId, userName: uName, groupId: curGid, taskId: curTaskId, classId: effectiveClassId };
    if (value !== null) payload.value = value;
    return payload;
  };

  const isFieldLockedByOther = (fieldKey) => {
    const currUser = (window.app && window.app.authManager) ? window.app.authManager.getCurrentUser() : null;
    const myId = currUser ? String(currUser.id || '') : '';
    const myName = currUser ? String(currUser.name  || '') : '';
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
        const myCode = currUser?.id || state.currentUser || '';
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
  const actionPlan = s2.actionPlan;
  const currUser = (window.app && window.app.authManager) ? window.app.authManager.getCurrentUser() : null;
  let userClassId = state.activeStudentClassId || (currUser ? currUser.classId : null) || null;
  const activeGroupObj = (window.app && window.app.authManager) ? window.app.authManager.getStudentActiveGroup(currUser, userClassId) : null;
  let userGroupId = activeGroupObj?.id || (window.app?.cloudSyncEngine?.groupId) || (currUser?.groupId) || state.activeGroupId || null;
  let activeTaskId = state.activeTaskId || (window.app?.cloudSyncEngine?.taskId) || '';

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

  const currUserCode = currUser?.id || currUser?.studentCode || state.currentUser || '';
  let currUserName = currUser?.name || '';
  if (!currUserName && state.members && (state.members[currUserCode]?.name || state.members[state.currentUser]?.name)) {
    currUserName = state.members[currUserCode]?.name || state.members[state.currentUser]?.name || '';
  }
  if (!currUserName && window.app && window.app.authManager) {
    const matchedUser = window.app.authManager.findUserByKey ? window.app.authManager.findUserByKey(currUserCode) : window.app.authManager.getUsers().find(u => u && (u.id === currUserCode || u.studentCode === currUserCode));
    if (matchedUser && matchedUser.name) currUserName = matchedUser.name;
  }
  if (!currUserName) currUserName = currUserCode || '组员';
  const currUserColor = (state.members && state.members[currUserCode]?.color) || '#2563eb';
  const allTasks = (window.app && window.app.authManager) ? window.app.authManager.getTasks() : [];
  const currentTask = allTasks.find(t => t.id === state.activeTaskId || (t.title && t.title === state.activeTaskId)) || (allTasks.length > 0 ? allTasks[0] : null);
  const taskGenreKey = currentTask?.taskType || 'experiment';
  const isTaskDeadlineExpired = isTaskExpired(currentTask);
  const isFinalSubmitted = !!state.isFinalSubmitted;
  const isEditorReadonly = isTaskDeadlineExpired || isFinalSubmitted;

  if (!userGroupId || userGroupId === 'null' || userGroupId.startsWith('group_unassigned')) {
    canvas.innerHTML = showResolutionBlock('未检测到您被分配的具体协作小组，请联系教师在教务空间分配小组后再进入');
    return;
  }

  const rawPadName = `jizhi_${activeTaskId}_${userGroupId}`;
  const padUrl = `/p/${encodeURIComponent(rawPadName)}?userName=${encodeURIComponent(currUserName)}&userColor=${encodeURIComponent(currUserColor)}&showControls=${isEditorReadonly ? 'false' : 'true'}&showChat=false&showLineNumbers=true&lang=zh-hans${isEditorReadonly ? '&readOnly=true' : ''}`;

  const availablePapers = (window.app && window.app.authManager) ? window.app.authManager.getReferencePapers(userGroupId, userClassId, activeTaskId) : [];
  const paperBtnLabel = availablePapers.length > 0 ? `📚 查阅参考范文 (${availablePapers.length}篇)` : '📚 查阅参考范文库';

  const confirmedDraftMap = s2.confirmedMembers || {};
  const membersList = Object.values(state.members || {});
  const allGroupMembers = (activeGroupObj && Array.isArray(activeGroupObj.members) && activeGroupObj.members.length > 0) ? activeGroupObj.members : membersList;
  const actualTotalCount = allGroupMembers.length > 0 ? allGroupMembers.length : (membersList.length || 2);
  const totalCount = actualTotalCount;
  const confirmedDraftCount = allGroupMembers.filter(m => isMemberDone(confirmedDraftMap, m)).length;
  const isUserDraftConfirmed = isMemberDone(confirmedDraftMap, currUser || { id: currUserCode, name: currUserName });
  const isDraftFullyConfirmed = !!s2.isDraftConfirmed && (confirmedDraftCount >= actualTotalCount && actualTotalCount > 0);
  const meetingSubs = s2.meetingSubmissions || {};
  const isStage2MeetingLocked = s2.isMeetingLocked || (Object.keys(meetingSubs).length >= actualTotalCount && actualTotalCount > 0);
  const livePadText = (typeof getEtherpadTextDirect === 'function') ? getEtherpadTextDirect() : null;
  const actualContent = (livePadText !== null) ? livePadText : (s2.unifiedContent || '');
  const plainTextLen = actualContent.replace(/<[^>]*>/g, '').trim().length;
  const targetWordCount = (currentTask && currentTask.targetWordCount) ? Number(currentTask.targetWordCount) : 3000;

  const padName = `jizhi_${activeTaskId}_${userGroupId}`;

  // 🚀 核心黑科技：扫描 Etherpad 内部 DOM 获取实际留存正文及各成员真实的撰写字数与贡献
  function getEtherpadAuthorStats() {
    try {
      const f = document.getElementById('stage2-etherpad-frame');
      if (!f || !f.contentDocument) return null;

      const padWin = f.contentWindow;
      let authorData = {};
      if (padWin && padWin.clientVars) {
        if (padWin.clientVars.collab_client_vars && padWin.clientVars.collab_client_vars.historicalAuthorData) {
          authorData = Object.assign({}, padWin.clientVars.collab_client_vars.historicalAuthorData);
        }
        if (padWin.clientVars.historicalAuthorData) {
          authorData = Object.assign(authorData, padWin.clientVars.historicalAuthorData);
        }
        if (padWin.clientVars.authorData) {
          authorData = Object.assign(authorData, padWin.clientVars.authorData);
        }
      }
      if (padWin && padWin.pad) {
        if (typeof padWin.pad.getAuthorData === 'function') {
          try { authorData = Object.assign(authorData, padWin.pad.getAuthorData()); } catch(e){}
        }
        if (padWin.pad.myUserInfo) {
          if (!padWin.pad.myUserInfo.name || padWin.pad.myUserInfo.name === '组员' || padWin.pad.myUserInfo.name === 'unnamed') {
            padWin.pad.myUserInfo.name = currUserName;
          }
          if (padWin.pad.myUserInfo.userId) {
            authorData[padWin.pad.myUserInfo.userId] = Object.assign({}, authorData[padWin.pad.myUserInfo.userId] || {}, padWin.pad.myUserInfo);
          }
        }
        if (Array.isArray(padWin.pad.userList)) {
          padWin.pad.userList.forEach(u => {
            if (u && u.userId) {
              authorData[u.userId] = Object.assign({}, authorData[u.userId] || {}, u);
            }
          });
        }
      }

      const aceOuter = f.contentDocument.querySelector('iframe[name="ace_outer"]');
      if (!aceOuter || !aceOuter.contentDocument) return null;
      const aceInner = aceOuter.contentDocument.querySelector('iframe[name="ace_inner"]');
      if (!aceInner || !aceInner.contentDocument) return null;

      const innerDoc = aceInner.contentDocument;
      const innerBody = innerDoc.querySelector('.innerdocbody') || innerDoc.body;
      if (!innerBody) return null;

      if (!innerBody._jizhiInputBound) {
        innerBody._jizhiInputBound = true;
        const markLocalTyping = () => {
          window._lastLocalPadInputTime = Date.now();
          if (typeof syncPadMetrics === 'function') {
            setTimeout(syncPadMetrics, 100);
          }
        };
        innerBody.addEventListener('input', markLocalTyping, true);
        innerBody.addEventListener('keydown', markLocalTyping, true);
        innerBody.addEventListener('keyup', markLocalTyping, true);
        innerBody.addEventListener('paste', markLocalTyping, true);
        innerBody.addEventListener('compositionend', markLocalTyping, true);
      }

      const rawText = (innerBody.innerText || '').replace(/\r\n/g, '\n').trim();
      const totalLen = rawText.length;

      // ⚡ 极速缓存保护：若正文内容未发生变动，直接返回上次解析结果，0 DOM 遍历开销
      if (window._lastPadScannedText === rawText && window._lastPadScannedStats) {
        return window._lastPadScannedStats;
      }

      const memberCounts = {};
      membersList.forEach(m => {
        memberCounts[m.id] = 0;
        if (m.name) memberCounts[m.name] = 0;
      });

      if (totalLen === 0) {
        const emptyRes = { total: 0, memberCounts, cleanText: '' };
        window._lastPadScannedText = '';
        window._lastPadScannedStats = emptyRes;
        return emptyRes;
      }

      const getAuthorClass = (el) => {
        let cur = el;
        while (cur && cur !== innerBody) {
          if (cur.className && typeof cur.className === 'string') {
            const classes = cur.className.split(/\s+/);
            for (const cls of classes) {
              const m = cls.match(/^(?:author[-_])?(a[._-][a-zA-Z0-9_\-]+)$/i) || cls.match(/^author[-_]([a-zA-Z0-9_.\-]+)$/i);
              if (m) return m[1];
            }
          }
          cur = cur.parentElement;
        }
        return null;
      };

      const walker = innerDoc.createTreeWalker(innerBody, NodeFilter.SHOW_TEXT, null, false);
      const rawCounts = {};
      let node;
      let walkTotal = 0;

      while ((node = walker.nextNode())) {
        const txt = (node.nodeValue || '').replace(/[\r\n\t]/g, '');
        const len = txt.length;
        if (len === 0) continue;
        walkTotal += len;
        const aClass = getAuthorClass(node.parentElement) || 'unassigned';
        rawCounts[aClass] = (rawCounts[aClass] || 0) + len;
      }

      // 匹配每个 authorClass 到真实的 membersList 成员
      const localAuthorId = (padWin && padWin.clientVars && (padWin.clientVars.userId || (padWin.pad && padWin.pad.getUserId && padWin.pad.getUserId()))) || (padWin && padWin.pad && padWin.pad.myUserInfo && padWin.pad.myUserInfo.userId) || '';

      const assignedAuthors = new Map();
      const unassignedKeys = [];

      Object.keys(rawCounts).forEach(aKey => {
        if (aKey === 'unassigned') {
          unassignedKeys.push(aKey);
          return;
        }
        let authorName = '';
        let authorColor = null;

        const rawId = aKey.replace(/^(author[-_]|a[._-])/i, '');
        const normDot = 'a.' + rawId;
        const normHyphen = 'a-' + rawId;
        const normUnderscore = 'a_' + rawId;

        let foundAuthorObj = null;
        for (const k of [aKey, normDot, normHyphen, normUnderscore, rawId]) {
          if (authorData[k]) {
            foundAuthorObj = authorData[k];
            break;
          }
        }
        if (!foundAuthorObj) {
          for (const k of Object.keys(authorData)) {
            const kRaw = k.replace(/^(author[-_]|a[._-])/i, '');
            if (k === aKey || (rawId && (kRaw === rawId || k.includes(rawId) || aKey.includes(kRaw)))) {
              foundAuthorObj = authorData[k];
              break;
            }
          }
        }

        if (foundAuthorObj) {
          if (foundAuthorObj.name && foundAuthorObj.name !== '组员' && foundAuthorObj.name !== 'unnamed') {
            authorName = String(foundAuthorObj.name).trim();
          }
          if (foundAuthorObj.colorId !== undefined || foundAuthorObj.color) {
            authorColor = foundAuthorObj.colorId !== undefined ? foundAuthorObj.colorId : foundAuthorObj.color;
          }
        }

        // 1. 如果 authorId 是当前用户的 pad userId
        const localAuthorRaw = localAuthorId.replace(/^(author[-_]|a[._-])/i, '');
        if (localAuthorId && (aKey === localAuthorId || normDot === localAuthorId || (rawId && localAuthorRaw && rawId === localAuthorRaw))) {
          const selfMem = membersList.find(m => currUser && (m.id === currUser.id || m.name === currUser.name)) || membersList[0];
          if (selfMem) {
            assignedAuthors.set(aKey, selfMem);
            return;
          }
        }

        // 2. 名字/ID 精准匹配
        let matched = membersList.find(m => {
          if (!m) return false;
          if (authorName && (m.name === authorName || m.id === authorName || m.studentCode === authorName)) return true;
          if (m.name && m.name.length >= 2 && (aKey.includes(m.name) || (authorName && authorName.includes(m.name)))) return true;
          if (m.id && (aKey.includes(m.id) || (authorName && authorName.includes(m.id)))) return true;
          return false;
        });

        // 3. 颜色匹配
        if (!matched && authorColor !== null) {
          matched = membersList.find(m => m.color && String(m.color).toLowerCase() === String(authorColor).toLowerCase());
        }

        if (matched) {
          assignedAuthors.set(aKey, matched);
        } else {
          unassignedKeys.push(aKey);
        }
      });

      // 4. 对尚未精确匹配的 authorClass，按顺序分配给尚未匹配的组内成员（避免100%误归属给单人）
      const alreadyAssignedMemberIds = new Set(Array.from(assignedAuthors.values()).map(m => m.id));
      const remainingMembers = membersList.filter(m => !alreadyAssignedMemberIds.has(m.id));

      let remIdx = 0;
      unassignedKeys.forEach(aKey => {
        if (aKey === 'unassigned') return;
        if (remIdx < remainingMembers.length) {
          assignedAuthors.set(aKey, remainingMembers[remIdx]);
          remIdx++;
        } else {
          const fallback = membersList.find(m => currUser && (m.id === currUser.id || m.name === currUser.name)) || membersList[0];
          if (fallback) assignedAuthors.set(aKey, fallback);
        }
      });

      // 5. 累计各成员字数
      let totalAssignedChars = 0;
      Object.keys(rawCounts).forEach(aKey => {
        const count = rawCounts[aKey];
        if (count <= 0) return;
        const targetMember = assignedAuthors.get(aKey);
        if (targetMember) {
          memberCounts[targetMember.id] = (memberCounts[targetMember.id] || 0) + count;
          if (targetMember.name) memberCounts[targetMember.name] = (memberCounts[targetMember.name] || 0) + count;
          totalAssignedChars += count;
        } else if (aKey !== 'unassigned') {
          const target = membersList.find(m => currUser && (m.id === currUser.id || m.name === currUser.name)) || membersList[0];
          if (target) {
            memberCounts[target.id] = (memberCounts[target.id] || 0) + count;
            if (target.name) memberCounts[target.name] = (memberCounts[target.name] || 0) + count;
            totalAssignedChars += count;
          }
        }
      });

      // 如果有未归属文本 (例如初始模板内容)，且已有成员撰写了内容，若没有任何归属则平分给成员
      const unassignedChars = rawCounts['unassigned'] || 0;
      if (unassignedChars > 0 && totalAssignedChars === 0) {
        const splitCount = Math.floor(unassignedChars / membersList.length);
        membersList.forEach(m => {
          memberCounts[m.id] = (memberCounts[m.id] || 0) + splitCount;
          if (m.name) memberCounts[m.name] = (memberCounts[m.name] || 0) + splitCount;
        });
      }

      const resObj = {
        total: totalLen,
        memberCounts: memberCounts,
        cleanText: rawText
      };
      window._lastPadScannedText = rawText;
      window._lastPadScannedStats = resObj;
      return resObj;
    } catch (e) {
      return null;
    }
  }

  function getEtherpadTextDirect() {
    const stats = getEtherpadAuthorStats();
    return stats ? stats.cleanText : null;
  }

  const getMemberContribVal = (contribs, m) => {
    if (!contribs || !m) return 0;
    const keys = getUserAllKeys(m);
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
    
    const docLen = (state.stage2 && state.stage2.unifiedContent) ? state.stage2.unifiedContent.length : 0;
    const contribs = (state.stage2 && state.stage2.memberContributions) ? state.stage2.memberContributions : {};
    let rawTotal = 0;
    membersList.forEach(m => { rawTotal += getMemberContribVal(contribs, m); });
    
    // 如果当前正文为空，或者各成员实际字数总和为 0，展示空状态
    if (docLen === 0 || rawTotal === 0) {
      labelsEl.innerHTML = `<span style="color:#94a3b8; font-weight:600; font-size:10.5px;">⏳ 暂无撰写内容</span>`;
      barsEl.innerHTML = `<div style="width:100%; height:8px; background:#f8fafc; border-radius:4px; display:flex; align-items:center; justify-content:center; font-size:9.5px; color:#94a3b8; font-weight:600;">⏳ 在 Etherpad 中撰写或修改正文将实时累计真实贡献</div>`;
      return;
    }

    const newLabelsHtml = membersList.map((m) => {
      const rawVal = getMemberContribVal(contribs, m);
      const pct = rawTotal > 0 ? Math.round((rawVal / rawTotal) * 100) : 0;
      return `<span style="color:${rawVal > 0 ? (m.color || '#2563eb') : '#94a3b8'}; font-weight:700;">● ${m.name}: ${pct}% (${rawVal}字)</span>`;
    }).join('');

    if (labelsEl.innerHTML !== newLabelsHtml) {
      labelsEl.innerHTML = newLabelsHtml;
    }

    const newBarsHtml = membersList.map((m) => {
      const rawVal = getMemberContribVal(contribs, m);
      const pct = rawTotal > 0 ? Math.round((rawVal / rawTotal) * 100) : 0;
      return `<div class="contrib-segment" style="width:${pct}%; background:${m.color || '#2563eb'}; transition:width 0.8s ease-in-out;" title="${m.name}: ${pct}% (${rawVal}字)"></div>`;
    }).join('');

    if (barsEl.innerHTML !== newBarsHtml) {
      barsEl.innerHTML = newBarsHtml;
    }
  };

  let _padContentDebounceTimer = null;
  let _padContribDebounceTimer = null;
  let _lastReportedContribStr = '';

  const syncPadMetrics = async () => {
    try {
      // 1. 优先尝试同源 DOM 级作者与留存字数全量精准直读 (含极速脏检查)
      const authorStats = getEtherpadAuthorStats();
      let cleanTxt = authorStats ? authorStats.cleanText : null;
      
      // 2. 若 DOM 暂未就绪，低频降级尝试服务端代理接口（每 10 秒最多 1 次，严禁高频打满 PHP-FPM）
      if (cleanTxt === null) {
        const now = Date.now();
        if (!window._lastServerPadFetchTime || now - window._lastServerPadFetchTime > 10000) {
          window._lastServerPadFetchTime = now;
          const res = await fetch(`sync.php?action=get_pad_text&padId=${encodeURIComponent(padName)}`).then(r => r.json()).catch(() => null);
          if (res && res.success && typeof res.text === 'string') {
            cleanTxt = res.text.replace(/\r\n/g, '\n').trim();
          }
        }
      }

      if (cleanTxt !== null) {
        const wordCount = cleanTxt.length;
        // 实时更新字数角标
        const countBadge = document.getElementById('stage2-word-count-num');
        if (countBadge && countBadge.innerText !== String(wordCount)) {
          countBadge.innerText = String(wordCount);
        }

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
          }, 1500);
        } else {
          if (!window._firstPadScanTriggered && window.app && typeof window.app.checkAgentTriggersOnContent === 'function') {
            window._firstPadScanTriggered = true;
            window.app.checkAgentTriggersOnContent(cleanTxt);
          }
        }

        // 3. 根据实际文档内容精准更新各成员真实贡献度
        if (authorStats && authorStats.memberCounts) {
          const contribStr = JSON.stringify(authorStats.memberCounts);
          const hasContribChanged = (contribStr !== JSON.stringify(state.stage2.memberContributions));

          if (hasContribChanged) {
            state.stage2.memberContributions = authorStats.memberCounts;
            updateContribDom();

            // ⚡ 防抖节流持久化到云端 (仅在变动时触发，避免高频网络开销)
            if (_padContribDebounceTimer) clearTimeout(_padContribDebounceTimer);
            _padContribDebounceTimer = setTimeout(() => {
              if (_lastReportedContribStr === contribStr) return;
              _lastReportedContribStr = contribStr;
              fetch(`sync.php?action=report_member_contrib&groupId=${encodeURIComponent(userGroupId)}&taskId=${encodeURIComponent(activeTaskId)}&classId=${encodeURIComponent(userClassId)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  taskId: activeTaskId,
                  classId: userClassId,
                  groupId: userGroupId,
                  contribs: authorStats.memberCounts
                })
              }).catch(() => {});
            }, 1000);
          }
        } else {
          updateContribDom();
        }
      }

      // 🛡️ 工具栏守护者：只要任务处于可编辑状态，确保 Etherpad 工具栏持续常驻
      if (!isEditorReadonly) {
        const s2f = document.getElementById('stage2-etherpad-frame');
        if (s2f) {
          if (s2f._isReadonlyEnforced) {
            liftEtherpadReadonly(s2f);
          }
          ensureEtherpadUserSync(s2f, currUserName, currUserColor);
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
    if (wordBadge) {
      const liveText = (typeof getEtherpadTextDirect === 'function') ? getEtherpadTextDirect() : null;
      const curLiveLen = (liveText !== null) ? liveText.length : plainTextLen;
      if (wordBadge.innerText !== String(curLiveLen)) {
        wordBadge.innerText = String(curLiveLen);
      }
    }

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
                <span>📋 【半程修正清单】(${taskGenreKey === 'instructional' ? '教研专家' : '审稿专家'} 3 项修改要求)</span>
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
    }

    // 🌟 增量就地刷新右上角【会议打卡】与【初稿确认】小药丸
      const totalCount = membersList.length || 2;
      const subs = s2.meetingSubmissions || {};
      const subCount = Object.keys(subs).length;
      const isMeetingFullyDone = subCount >= totalCount && totalCount > 0;
      const isCurrentUserSubmitted = isMemberDone(subs, { id: currUser?.id || currUserCode, name: currUser?.name });

      const meetingLabel = taskGenreKey === 'instructional' ? '磨课' : '会议';
      const meetingTextEl = canvas.querySelector('#stage2-meeting-count-text');
      if (meetingTextEl) {
        meetingTextEl.innerText = isMeetingFullyDone ? `✅ ${meetingLabel}已全员打卡` : `📢 ${meetingLabel}: ${subCount}/${totalCount}`;
        meetingTextEl.style.color = isMeetingFullyDone ? '#059669' : '#2563eb';
        meetingTextEl.style.background = isMeetingFullyDone ? '#d1fae5' : '#eff6ff';
        meetingTextEl.style.borderColor = isMeetingFullyDone ? '#a7f3d0' : '#bfdbfe';
      }

      const meetingBtnEl = canvas.querySelector('#btn-trigger-meeting-pills');
      if (meetingBtnEl) {
        meetingBtnEl.innerText = isCurrentUserSubmitted ? `✓ 查看${meetingLabel}` : `📢 参与${meetingLabel}`;
        meetingBtnEl.style.background = isCurrentUserSubmitted ? '#ecfdf5' : 'linear-gradient(135deg, #2563eb, #1d4ed8)';
        meetingBtnEl.style.color = isCurrentUserSubmitted ? '#059669' : 'white';
        meetingBtnEl.style.border = isCurrentUserSubmitted ? '1px solid #a7f3d0' : 'none';
      }

      const confMembers = s2.confirmedMembers || {};
      const confirmedDraftCount = membersList.filter(m => isMemberDone(confMembers, m)).length;
      const isDraftFullyConfirmed = s2.isDraftConfirmed || (confirmedDraftCount >= totalCount && totalCount > 0);
      const isUserDraftConfirmed = isMemberDone(confMembers, { id: currUser?.id || currUserCode, name: currUser?.name });

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
        draftBtnEl.onclick = () => {
          if (window.app && window.app.handlers && typeof window.app.handlers.onConfirmStage2Draft === 'function') {
            window.app.handlers.onConfirmStage2Draft();
          }
        };
      }

      // 🛡️ 截止锁定横幅就地动态同步（若教师延长则 0ms 瞬间消除，无需刷新）
      let expiredBanner = canvas.querySelector('#stage2-deadline-expired-banner');
      if (isTaskDeadlineExpired) {
        if (!expiredBanner) {
          const b = document.createElement('div');
          b.id = 'stage2-deadline-expired-banner';
          b.style.cssText = 'background:#fef2f2; border:1.5px solid #fca5a5; border-radius:8px; padding:6px 14px; margin-bottom:4px; font-size:12.5px; color:#991b1b; font-weight:600; display:flex; justify-content:space-between; align-items:center; gap:12px; box-shadow:0 2px 6px rgba(239,68,68,0.08); height:38px; box-sizing:border-box; flex-shrink:0;';
          b.innerHTML = `
            <div style="display:flex; align-items:center; gap:8px; min-width:0; flex:1; overflow:hidden; white-space:nowrap; text-overflow:ellipsis;">
              <span style="font-size:15px; flex-shrink:0;">🔒</span>
              <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"><b>任务已截止锁定：</b> 本任务已于 <b>${currentTask?.deadline || '截止时间'}</b> 截止，阶段二【学术编辑部】已自动转为<b>【只读查阅模式】</b>。如需修改请联系教师延长时间。</span>
            </div>
            <span style="font-size:11.5px; color:#ffffff; background:#dc2626; padding:2px 8px; border-radius:4px; font-weight:800; flex-shrink:0; letter-spacing:0.5px;">已截止</span>
          `;
          canvas.querySelector('.card')?.prepend(b);
        }
      } else {
        if (expiredBanner) expiredBanner.remove();
      }

      if (existingFrame) {
        if (isEditorReadonly) {
          existingFrame._wasPreviouslyReadonly = true;
          enforceEtherpadReadonly(existingFrame);
        } else {
          liftEtherpadReadonly(existingFrame);
          existingFrame._wasPreviouslyReadonly = false;
        }
      }

      return;
    }

  canvas.innerHTML = `
    <div class="card" style="height:100%; flex:1; display:flex; flex-direction:column; padding:8px 12px; box-sizing:border-box; overflow:hidden;">
      
      <!-- 🌟 1. 顶部紧凑一体化协作控制台 (高度仅 36px，集成字数、范文、会议打卡与初稿确认) -->
      <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:6px 12px; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; flex-shrink:0; box-shadow:0 1px 3px rgba(15,23,42,0.03);">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:13.5px; font-weight:800; color:#0f172a; display:inline-flex; align-items:center; gap:4px;">📝 ${taskGenreKey === 'instructional' ? '教学设计' : '论文'}正文协同起草</span>
          <span style="font-size:11.5px; color:#1e40af; background:#eff6ff; padding:2px 10px; border-radius:10px; border:1px solid #bfdbfe; font-weight:800; display:inline-flex; align-items:center; gap:4px; min-width:85px; justify-content:center;" title="当前正文实时撰写字数 (达到 35% 即约 ${Math.round(targetWordCount * 0.35)} 字时将触发${taskGenreKey === 'instructional' ? '教研' : '审稿'}专家初审把脉)">✍️ 当前: <b id="stage2-word-count-num" style="color:#2563eb; font-size:12px;">${plainTextLen}</b> 字</span>
        </div>

        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <!-- 查阅参考范文按钮（置于右侧操作区，更加醒目） -->
          <button id="btn-show-case" style="background:#ffffff; border:1px solid #bfdbfe; color:#1d4ed8; padding:3px 10px; border-radius:6px; font-size:11px; cursor:pointer; font-weight:700; display:inline-flex; align-items:center; gap:4px; box-shadow:0 1px 2px rgba(37,99,235,0.06); transition:all 0.15s ease;">${paperBtnLabel}</button>
          <!-- 编辑会议打卡小药丸 -->
          ${(() => {
            const subs = s2.meetingSubmissions || {};
            const subCount = Object.keys(subs).length;
            const isMeetingFullyDone = subCount >= totalCount && totalCount > 0;
            const isCurrentUserSubmitted = isMemberDone(subs, { id: currUser?.id || currUserCode, name: currUser?.name });
            return `
              <div style="display:flex; align-items:center; gap:4px;">
                <span id="stage2-meeting-count-text" style="font-size:11px; font-weight:800; color:${isMeetingFullyDone ? '#059669' : '#2563eb'}; background:${isMeetingFullyDone ? '#d1fae5' : '#eff6ff'}; padding:1.5px 6px; border-radius:8px; border:1px solid ${isMeetingFullyDone ? '#a7f3d0' : '#bfdbfe'};">
                  ${isMeetingFullyDone ? `✅ ${taskGenreKey === 'instructional' ? '磨课' : '会议'}已全员打卡` : `📢 ${taskGenreKey === 'instructional' ? '磨课' : '会议'}: ${subCount}/${totalCount}`}
                </span>
                <button id="btn-trigger-meeting-pills" style="background:${isCurrentUserSubmitted ? '#ecfdf5' : 'linear-gradient(135deg, #2563eb, #1d4ed8)'}; border:${isCurrentUserSubmitted ? '1px solid #a7f3d0' : 'none'}; color:${isCurrentUserSubmitted ? '#059669' : 'white'}; padding:2.5px 8px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer;">
                  ${isCurrentUserSubmitted ? `✓ 查看${taskGenreKey === 'instructional' ? '磨课' : '会议'}` : `📢 参与${taskGenreKey === 'instructional' ? '磨课' : '会议'}`}
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
          let reviewChunks = [];
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

            let chunks = body.split(/(?=[①②③]|\b[123]\.|(?=[一二三]是)|(?=【核心概念对齐】|【研究方法深化】|【行文衔接规范】|【学术规范】))/g).map(c => c.trim()).filter(Boolean);
            if (chunks.length < 3) {
              chunks = body.split(/[\n；;]+/g).map(c => c.trim()).filter(Boolean);
            }
            chunks.forEach(c => {
              let clean = c.replace(/^[①②③\d\.\s\(\)一二三是：:]+/, '').replace(/[；;。]\s*$/, '').trim();
              if (clean.length > 5 && !clean.includes('请全组协同') && !clean.includes('冲刺终审定稿')) {
                reviewChunks.push(clean);
              }
            });
          }

          const subs = s2.meetingSubmissions || {};
          const allSubs = Object.values(subs);
          const hasIdeationDev = allSubs.some(s => (s.ideationConsistency || '').includes('偏离'));
          const hasTransDev = allSubs.some(s => (s.transitionState || '').includes('脱节'));
          const hasStyleDev = allSubs.some(s => (s.styleState || '').includes('割裂') || (s.styleState || '').includes('混乱') || (s.styleState || '').includes('口语'));
          const hasDivergence = hasIdeationDev || hasTransDev || hasStyleDev || !!s2.hasMeetingDivergence;

          let finalActionItems = [];
          if (hasDivergence) {
            const allIdeationSecs = Array.from(new Set(allSubs.flatMap(s => s.ideationSections || [])));
            const allTransSecs = Array.from(new Set(allSubs.flatMap(s => s.transSections || [])));
            let focusText = [...allTransSecs, ...allIdeationSecs].filter(Boolean).map(s => `【${s}】`).join('与');
            if (!focusText) focusText = '前后核心章节';

            let managingItem = '';
            if (hasTransDev && hasIdeationDev) {
              managingItem = `【内容与构思对齐】重点对齐${focusText}，消除前后构思偏差，理顺章节论述衔接。`;
            } else if (hasTransDev) {
              managingItem = `【章节逻辑衔接】重点理顺${focusText}的逻辑过渡，消除前后脱节，保持论述连贯。`;
            } else if (hasIdeationDev) {
              managingItem = `【核心构思对齐】重点针对${focusText}重新对齐全篇主旨构思，确保立意一致。`;
            } else {
              managingItem = `【语体与术语对齐】统一全篇学术术语口径与规范语体，消除口语化与风格割裂。`;
            }
            finalActionItems.push(managingItem);

            if (reviewChunks.length >= 2) {
              finalActionItems.push(reviewChunks[0]);
              finalActionItems.push(reviewChunks[1]);
            } else if (reviewChunks.length === 1) {
              finalActionItems.push(reviewChunks[0]);
              finalActionItems.push('【研究方法深化】细化核心方法实施步骤与测量工具，增强论证严密性。');
            } else {
              finalActionItems.push('【研究方法深化】细化核心方法实施步骤与测量工具，增强论证严密性。');
              finalActionItems.push('【学术规范与衔接】统一专业术语口径，补全段落间逻辑过渡与学术规范。');
            }
          } else {
            if (reviewChunks.length >= 3) {
              finalActionItems = reviewChunks.slice(0, 3);
            } else if (reviewChunks.length === 2) {
              finalActionItems = [
                reviewChunks[0],
                reviewChunks[1],
                '【学术规范与衔接】统一全篇学术术语口径，规范文献著录与行文基调。'
              ];
            } else if (reviewChunks.length === 1) {
              finalActionItems = [
                reviewChunks[0],
                '【研究方法深化】细化核心方法实施步骤与测量工具，增强论证严密性。',
                '【学术规范与衔接】统一全篇学术术语口径，规范文献著录与行文基调。'
              ];
            } else {
              finalActionItems = [
                '【核心概念对齐】补充明确的操作性定义，使文献综述直接呼应研究问题与假设。',
                '【研究方法深化】细化核心方法与测量工具的具体操作步骤，增强方法论严密性。',
                '【行文衔接规范】统一全篇学术专业术语命名，补全段落间逻辑过渡衔接。'
              ];
            }
          }

          effActionPlan = {
            isGenerated: true,
            completedMap: (effActionPlan && effActionPlan.completedMap) || {},
            items: finalActionItems.slice(0, 3)
          };
          if (!state.stage2.actionPlan) state.stage2.actionPlan = effActionPlan;
          state.stage2.actionPlan.isGenerated = true;
          state.stage2.actionPlan.items = effActionPlan.items;
        }

        if (!effActionPlan || !effActionPlan.isGenerated) {
          return `
            <div id="stage2-action-plan-card" onclick="if(window.app && window.app.forceRefreshActionPlan){ window.app.forceRefreshActionPlan(); }" title="点击可重新核对并展开最新清单" style="background:#f8fafc; border:1px dashed #cbd5e1; border-radius:6px; padding:5px 12px; margin-bottom:6px; flex-shrink:0; display:flex; justify-content:space-between; align-items:center; cursor:pointer; transition:all 0.15s ease;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='#f8fafc'">
              <div style="font-size:11.5px; font-weight:700; color:#64748b; display:flex; align-items:center; gap:6px;">
                <span>📋 【半程修正清单】</span>
                <span style="font-size:10.5px; background:#eff6ff; color:#2563eb; padding:1px 6px; border-radius:6px;">待解锁 (组内${taskGenreKey === 'instructional' ? '磨课会议' : '编辑会议'}自查对齐后，由${taskGenreKey === 'instructional' ? '教研专家' : '审稿专家'}质检下发)</span>
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
            <iframe id="stage2-etherpad-frame" src="${padUrl}" style="width:100%; height:100%; min-height:440px; border:none; display:block; background:#ffffff; ${isEditorReadonly ? 'user-select:none;' : ''}" allow="clipboard-read; clipboard-write; fullscreen" onload="const el=document.getElementById('ep-status-text-s2'); if(el) el.innerText='${isEditorReadonly ? '🔒 Etherpad 协同文档已锁定 (只读模式)' : 'Etherpad 实时协同引擎已就绪 (毫秒级 OT 协同)'}'; const f=document.getElementById('stage2-etherpad-frame'); if(f && ${isEditorReadonly ? 'true' : 'false'}) { try { if(window.enforceEtherpadReadonly) window.enforceEtherpadReadonly(f); } catch(e){} }"></iframe>
            ${isEditorReadonly ? '<div class="etherpad-readonly-shield" style="position:absolute; top:0; left:0; right:20px; bottom:0; z-index:50; background:transparent; cursor:default; pointer-events:auto;" title="🔒 正文已截止锁定为只读模式"></div>' : ''}
            ${isEditorReadonly ? '<div style="position:absolute; top:12px; right:12px; z-index:99; pointer-events:none; display:flex; align-items:center; justify-content:center;" title="🔒 正文已截止锁定为只读模式"><div style="background:rgba(15,23,42,0.8); color:#ffffff; padding:6px 14px; border-radius:6px; font-size:12px; font-weight:700; pointer-events:none; box-shadow:0 4px 12px rgba(0,0,0,0.18);">🔒 任务已截止/初稿已锁定 (只读查阅模式)</div></div>' : ''}
          </div>
        </div>
      </div>

      <!-- 🌟 4. 底部超薄一体化贡献度状态条 (高度仅 22px，彩色占比与进度条合一) -->
      <div style="background:#ffffff; padding:4px 10px; border-radius:6px; border:1px solid #cbd5e1; flex-shrink:0; display:flex; align-items:center; justify-content:space-between; gap:12px; box-shadow:0 1px 2px rgba(15,23,42,0.03);">
        <span style="font-size:11px; font-weight:800; color:#1e293b; white-space:nowrap;">📊 团队贡献:</span>
        <div class="contrib-bars" id="stage2-contrib-bars" style="flex:1; height:8px; border-radius:4px; display:flex; overflow:hidden; background:#e2e8f0;">
          ${(() => {
            const contribs = s2.memberContributions || {};
            let rawTotal = 0;
            if (plainTextLen > 0) {
              membersList.forEach(m => { rawTotal += getMemberContribVal(contribs, m); });
            }
            if (plainTextLen === 0 || rawTotal === 0) {
              return `<div style="width:100%; height:8px; background:#f8fafc; border-radius:4px; display:flex; align-items:center; justify-content:center; font-size:9.5px; color:#94a3b8; font-weight:600;">⏳ 在 Etherpad 中撰写或修改正文将实时累计真实贡献</div>`;
            }
            return membersList.map((m) => {
              const rawVal = getMemberContribVal(contribs, m);
              const pct = rawTotal > 0 ? Math.round((rawVal / rawTotal) * 100) : 0;
              return `<div class="contrib-segment" style="width:${pct}%; background:${m.color || '#2563eb'}; transition:width 0.8s ease-in-out;" title="${m.name}: ${pct}% (${rawVal}字)"></div>`;
            }).join('');
          })()}
        </div>
        <div class="contrib-labels" id="stage2-contrib-labels" style="display:flex; font-size:11px; font-weight:700; color:#475569; gap:8px; white-space:nowrap;">
          ${(() => {
            const contribs = s2.memberContributions || {};
            let rawTotal = 0;
            if (plainTextLen > 0) {
              membersList.forEach(m => { rawTotal += getMemberContribVal(contribs, m); });
            }
            if (plainTextLen === 0 || rawTotal === 0) {
              return `<span style="color:#94a3b8; font-size:10.5px; font-weight:600;">⏳ 暂无撰写内容</span>`;
            }
            return membersList.map((m) => {
              const rawVal = getMemberContribVal(contribs, m);
              const pct = rawTotal > 0 ? Math.round((rawVal / rawTotal) * 100) : 0;
              return `<span style="color:${rawVal > 0 ? (m.color || '#2563eb') : '#94a3b8'};">● ${m.name}: ${pct}% (${rawVal}字)</span>`;
            }).join('');
          })()}
        </div>
      </div>
    </div>
  `;

  if (isEditorReadonly) {
    const s2Frame = canvas.querySelector('#stage2-etherpad-frame');
    if (s2Frame) enforceEtherpadReadonly(s2Frame);
  } else {
    const s2Frame = canvas.querySelector('#stage2-etherpad-frame');
    if (s2Frame) {
      liftEtherpadReadonly(s2Frame);
      ensureEtherpadUserSync(s2Frame, currUserName, currUserColor);
    }
  }
  setTimeout(() => {
    const s2f = canvas.querySelector('#stage2-etherpad-frame');
    if (s2f) {
      if (!s2f.getAttribute('src')) s2f.src = padUrl;
      ensureEtherpadUserSync(s2f, currUserName, currUserColor);
    }
  }, 50);

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
      btnS2ManagingSummary.innerText = `⏳ ${taskGenreKey === 'instructional' ? '备课组长与教研专家' : '责任编辑与审稿专家'}总结中...`;
      if (window.app && typeof window.app.handleS2ManagingSummary === 'function') {
        await window.app.handleS2ManagingSummary();
      }
    });
  }

  const btnS2ReviewingSummary = canvas.querySelector('#btn-s2-reviewing-summary');
  if (btnS2ReviewingSummary) {
    btnS2ReviewingSummary.addEventListener('click', async () => {
      btnS2ReviewingSummary.disabled = true;
      btnS2ReviewingSummary.innerText = `⏳ ${taskGenreKey === 'instructional' ? '教研专家' : '审稿编辑'}总结冲刺中...`;
      if (window.app && typeof window.app.handleS2ReviewingSummary === 'function') {
        await window.app.handleS2ReviewingSummary();
      }
    });
  }

  const btnConfirmDraft = canvas.querySelector('#btn-confirm-stage2-draft');
  if (btnConfirmDraft) {
    btnConfirmDraft.addEventListener('click', () => {
      handlers.onConfirmStage2Draft();
    });
  }

}

function renderStage3FeedbackListHtml(s3, state, isDefenseLocked, isFinalSubmitted) {
  if (state.stage3CommitteeLoading || !s3.feedbackItems || s3.feedbackItems.length === 0) {
    return `
      <div style="background:#ffffff; border:1px solid #bfdbfe; border-radius:12px; padding:36px 24px; text-align:center; box-shadow:0 4px 12px rgba(37,99,235,0.06);">
        <div style="font-size:36px; margin-bottom:12px;">⏳</div>
        <div style="font-size:16px; font-weight:800; color:#1e40af; margin-bottom:6px;">答辩委员会专家正在审阅全篇${((window.app && window.app.authManager) ? (window.app.authManager.getTasks().find(t => t.id === state.activeTaskId)?.taskType || 'experiment') : (state.taskType || 'experiment')) === 'instructional' ? '教学设计' : '论文'}初稿...</div>
        <div style="font-size:13px; color:#64748b; line-height:1.6;">正方委员正在提取立论亮点，反方委员正在研拟针对实质询。<br>【答辩与终稿修改清单】即将在此生成，并同步呈现在右侧研讨区，请稍候！</div>
      </div>
    `;
  }
  return s3.feedbackItems.map((item, idx) => {
    const isProp = item.role === 'proponent';
    const hasResponse = !!(item.response && item.response.trim());
    let badgeText = '⏳ 待研讨', badgeBg = '#fffbeb', badgeColor = '#d97706', badgeBorder = '#fde68a';
    if (hasResponse) { badgeText = '✅ 已定案'; badgeBg = '#ecfdf5'; badgeColor = '#059669'; badgeBorder = '#a7f3d0'; } 
    else if (isProp) { badgeText = '🌟 专家肯定 (立论支持 · 默认通过)'; badgeBg = '#eff6ff'; badgeColor = '#2563eb'; badgeBorder = '#bfdbfe'; }
    return `
      <div style="background:#ffffff; padding:16px; border-radius:12px; border:1px solid ${isProp ? '#86efac' : (hasResponse ? '#a7f3d0' : '#fca5a5')}; box-shadow:0 2px 8px rgba(15,23,42,0.04);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:16px;">${isProp ? '🟢' : (hasResponse ? '✅' : '🔴')}</span>
            <span style="font-weight:800; font-size:14.5px; color:${isProp ? '#059669' : (hasResponse ? '#0f766e' : '#dc2626')};">
              ${isProp ? '专家立论支持' : `意见 ${idx}`}: ${escapeHtml(item.speaker || (isProp ? '正方委员 Agent' : '反方委员 Agent'))} - ${escapeHtml(item.title || '')}
            </span>
          </div>
          <span style="font-size:11.5px; padding:3px 10px; border-radius:12px; font-weight:700; background:${badgeBg}; color:${badgeColor}; border:1px solid ${badgeBorder};">${badgeText}</span>
        </div>
        <div style="font-size:13.5px; color:#1e293b; background:${isProp ? '#f0fdf4' : '#f8fafc'}; border:1px solid ${isProp ? '#bbf7d0' : '#e2e8f0'}; padding:12px 14px; border-radius:8px; line-height:1.6;">
          <b>${escapeHtml(item.speaker)}意见原文:</b><br>${escapeHtml(item.content || '')}
        </div>
        ${isProp ? `
          <div style="border-top:1px dashed #bbf7d0; padding-top:10px; margin-top:10px;">
            <div style="font-size:12.5px; font-weight:700; color:#15803d; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
              <span>✍️ 本组补充说明 / 强化论据 (选填)：</span>
              ${hasResponse ? '<span style="color:#059669; font-size:11.5px; font-weight:700;">✅ 已保存补充论据' + (isDefenseLocked ? ' (已锁定归档)' : '') + '</span>' : '<span style="color:#2563eb; font-size:11.5px;">(立论支持默认通过，如无补充可直接留空)</span>'}
            </div>
            <textarea class="feedback-direct-input" data-id="${item.id}" ${isDefenseLocked ? 'disabled readonly' : ''} placeholder="正方已给予高度肯定！如本组有进一步想要补充强化的论据可在此记录，无补充可直接留空..." style="width:100%; min-height:58px; padding:8px 12px; font-size:13px; line-height:1.5; border:1px solid ${hasResponse ? '#a7f3d0' : '#bbf7d0'}; background:${isDefenseLocked ? '#f8fafc' : (hasResponse ? '#f0fdf4' : '#ffffff')}; border-radius:8px; resize:vertical; box-sizing:border-box; color:#0f172a; font-family:inherit;">${escapeHtml(item.response || '')}</textarea>
            ${!isDefenseLocked ? `
              <div style="display:flex; justify-content:flex-end; margin-top:8px;">
                <button class="btn-save-feedback-direct" data-id="${item.id}" style="background:linear-gradient(135deg, #059669, #047857); border:none; color:white; padding:6px 14px; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:4px; box-shadow:0 2px 6px rgba(0,0,0,0.12);">
                  ${hasResponse ? '🔄 更新补充论据' : '💾 保存补充论据 (选填)'}
                </button>
              </div>
            ` : ''}
          </div>
        ` : `
          <div style="border-top:1px dashed #e2e8f0; padding-top:10px; margin-top:10px;">
            <div style="font-size:12.5px; font-weight:700; color:#334155; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
              <span>✍️ 本组答辩回复与修改结论：</span>
              ${hasResponse ? '<span style="color:#059669; font-size:11.5px; font-weight:700;">✅ 已保存生效' + (isDefenseLocked ? ' (已锁定归档)' : ' (可随时二次修改)') + '</span>' : '<span style="color:#64748b; font-size:11.5px;">(商定后点击上方按钮提炼定案，或直接在下方输入)</span>'}
            </div>
            <textarea class="feedback-direct-input" data-id="${item.id}" ${isDefenseLocked ? 'disabled readonly' : ''} placeholder="商讨后，在此直接输入本组针对该条意见的简要答复与修改结论..." style="width:100%; min-height:64px; padding:8px 12px; font-size:13px; line-height:1.5; border:1px solid ${hasResponse ? '#a7f3d0' : '#cbd5e1'}; background:${isDefenseLocked ? '#f8fafc' : (hasResponse ? '#f0fdf4' : '#ffffff')}; border-radius:8px; resize:vertical; box-sizing:border-box; color:#0f172a; font-family:inherit;">${escapeHtml(item.response || '')}</textarea>
            ${!isDefenseLocked ? `
              <div style="display:flex; justify-content:flex-end; margin-top:8px;">
                <button class="btn-save-feedback-direct" data-id="${item.id}" style="background:${hasResponse ? 'linear-gradient(135deg, #059669, #047857)' : 'linear-gradient(135deg, #2563eb, #1d4ed8)'}; border:none; color:white; padding:6px 14px; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:4px; box-shadow:0 2px 6px rgba(0,0,0,0.12);">
                  ${hasResponse ? '🔄 更新并保存答辩记录' : '💾 确认并保存本条答辩'}
                </button>
              </div>
            ` : ''}
          </div>
        `}
      </div>
    `;
  }).join('');
}

function bindStage3FeedbackInputs(container, handlers, isDefenseLocked) {
  if (isDefenseLocked) return;
  container.querySelectorAll('.btn-save-feedback-direct').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.id;
      const textarea = container.querySelector(`.feedback-direct-input[data-id="${id}"]`);
      if (handlers.onSaveFeedback && textarea) handlers.onSaveFeedback(id, textarea.value);
    };
  });
}

function renderStage3Canvas(canvas, state, handlers) {
  if (!canvas) return;
  const s3 = state.stage3;
  const activeTab = s3.activeTab || 'defense';
  const membersList = Object.values(state.members || {});
  const totalCount = membersList.length || 3;
  
  const currUser = (window.app && window.app.authManager) ? window.app.authManager.getCurrentUser() : null;
  const currUserCode = currUser?.id || state.currentUser || 'A';
  const confirmedRevMap = s3.confirmedMembers || {};
  const confirmedRevCount = membersList.filter(m => !!(confirmedRevMap[m.id] || (m.name && confirmedRevMap[m.name]))).length;
  const isUserRevisionConfirmed = !!(confirmedRevMap[currUserCode] || (currUser && confirmedRevMap[currUser.id]));
  const isRevisionFullyConfirmed = confirmedRevCount >= totalCount && totalCount > 0;
  
  const finalSubmittedMap = s3.finalSubmittedMembers || {};
  const finalSubmittedCount = membersList.filter(m => !!(finalSubmittedMap[m.id] || (m.name && finalSubmittedMap[m.name]))).length;
  const isUserFinalSubmitted = !!(finalSubmittedMap[currUserCode] || (currUser && finalSubmittedMap[currUser.id]));
  const isAllFinalSubmitted = state.isFinalSubmitted || (finalSubmittedCount >= totalCount && totalCount > 0);

  const allTasks = (window.app && window.app.authManager) ? window.app.authManager.getTasks() : [];
  const currentTask = allTasks.find(t => t.id === state.activeTaskId || (t.title && t.title === state.activeTaskId)) || (allTasks.length > 0 ? allTasks[0] : null);
  const taskGenreKey = currentTask?.taskType || 'experiment';
  const isTaskDeadlineExpired = isTaskExpired(currentTask);
  const isFinalSubmitted = state.isFinalSubmitted || isAllFinalSubmitted || isTaskDeadlineExpired;
  const isDefenseLocked = isRevisionFullyConfirmed || isFinalSubmitted;

  // 🛡️ Safari 滚动记忆防回弹：预先记录用户此前的滚动高度与聚焦输入状态
  const oldDefenseCard = canvas.querySelector('#stage3-defense-card');
  const oldScrollTop = oldDefenseCard ? oldDefenseCard.scrollTop : 0;
  const activeElem = document.activeElement;
  const activeElemDataId = (activeElem && activeElem.classList.contains('feedback-direct-input')) ? activeElem.dataset.id : null;
  const activeSelectionStart = activeElem ? activeElem.selectionStart : undefined;
  const activeSelectionEnd = activeElem ? activeElem.selectionEnd : undefined;

  // 🛡️ 极致单例保护
  const existingDefenseCard = canvas.querySelector('#stage3-defense-card');
  const existingEditorCard = canvas.querySelector('#stage3-editor-card');
  const existingFrame = canvas.querySelector('#stage3-etherpad-frame');

  if (existingDefenseCard && existingEditorCard) {
    existingDefenseCard.style.display = (activeTab === 'defense') ? 'block' : 'none';
    existingEditorCard.style.display = (activeTab === 'editor') ? 'flex' : 'none';

    // 🛡️ 动态同步答辩裁决与终稿修改清单内容
    const existingFeedbackContainer = canvas.querySelector('#stage3-feedback-list-container');
    if (existingFeedbackContainer) {
      const isTextareaFocused = document.activeElement && existingFeedbackContainer.contains(document.activeElement);
      if (!isTextareaFocused) {
        existingFeedbackContainer.innerHTML = renderStage3FeedbackListHtml(s3, state, isDefenseLocked, isFinalSubmitted);
        bindStage3FeedbackInputs(existingFeedbackContainer, handlers, isDefenseLocked);
      }
    }

    const btnTabDef = canvas.querySelector('#tab-btn-defense');
    if (btnTabDef) {
      btnTabDef.style.background = activeTab === 'defense' ? 'linear-gradient(135deg, #2563eb, #1d4ed8)' : '#f1f5f9';
      btnTabDef.style.color = activeTab === 'defense' ? 'white' : '#475569';
    }
    const btnTabEd = canvas.querySelector('#tab-btn-editor');
    if (btnTabEd) {
      btnTabEd.style.background = activeTab === 'editor' ? 'linear-gradient(135deg, #059669, #047857)' : (isRevisionFullyConfirmed ? '#f1f5f9' : '#f8fafc');
      btnTabEd.style.color = activeTab === 'editor' ? 'white' : (isRevisionFullyConfirmed ? '#475569' : '#94a3b8');
      btnTabEd.title = isRevisionFullyConfirmed ? '切换至终稿协同修改' : '需组内全员确认进入终稿修改后解锁';
      btnTabEd.style.cursor = isRevisionFullyConfirmed ? 'pointer' : 'not-allowed';
    }

    let expiredBanner = canvas.querySelector('#stage3-deadline-expired-banner');
    if (isTaskDeadlineExpired) {
      if (!expiredBanner) {
        const b = document.createElement('div');
        b.id = 'stage3-deadline-expired-banner';
        b.style.cssText = 'background:#fef2f2; border:1.5px solid #fca5a5; border-radius:8px; padding:6px 14px; margin-bottom:4px; font-size:12.5px; color:#991b1b; font-weight:600; display:flex; justify-content:space-between; align-items:center; gap:12px; box-shadow:0 2px 6px rgba(239,68,68,0.08); height:38px; box-sizing:border-box; flex-shrink:0;';
        b.innerHTML = `
          <div style="display:flex; align-items:center; gap:8px; min-width:0; flex:1; overflow:hidden; white-space:nowrap; text-overflow:ellipsis;">
            <span style="font-size:15px; flex-shrink:0;">🔒</span>
            <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"><b>任务已截止锁定：</b> 本任务已于 <b>${currentTask?.deadline || '截止时间'}</b> 截止，阶段三【答辩擂台】已自动转为<b>【只读查阅模式】</b>。如需修改请联系教师延长时间。</span>
          </div>
          <span style="font-size:11.5px; color:#ffffff; background:#dc2626; padding:2px 8px; border-radius:4px; font-weight:800; flex-shrink:0; letter-spacing:0.5px;">已截止</span>
        `;
        canvas.firstElementChild?.prepend(b);
      }
    } else {
      if (expiredBanner) expiredBanner.remove();
    }

    const actionBtnGroup = canvas.querySelector('#stage3-action-btn-group');
    if (actionBtnGroup) {
      actionBtnGroup.innerHTML = (activeTab === 'defense') ? (
        isDefenseLocked ? `
          <button disabled style="background:#f1f5f9; border:1px solid #cbd5e1; color:${isFinalSubmitted ? '#94a3b8' : '#059669'}; padding:8px 16px; border-radius:8px; font-weight:700; font-size:12.5px; cursor:default;">
            ${isFinalSubmitted ? `🔒 ${taskGenreKey === 'instructional' ? '教学设计' : '论文'}终稿已归档 (只读)` : '✅ 全员已确认进入终稿修改 (答辩已锁定)'}
          </button>
        ` : `
          <button id="btn-confirm-stage3-revision" ${isUserRevisionConfirmed ? 'disabled' : ''} style="background:${isUserRevisionConfirmed ? '#f1f5f9' : 'linear-gradient(135deg, #2563eb, #1d4ed8)'}; border:${isUserRevisionConfirmed ? '1px solid #cbd5e1' : 'none'}; color:${isUserRevisionConfirmed ? '#2563eb' : 'white'}; padding:8px 16px; border-radius:8px; font-weight:700; font-size:12.5px; cursor:${isUserRevisionConfirmed ? 'default' : 'pointer'}; box-shadow:${isUserRevisionConfirmed ? 'none' : '0 2px 8px rgba(37,99,235,0.2)'};">
            ${isUserRevisionConfirmed ? '✅ 您已确认进入终稿修改' : '✍️ 确认进入终稿修改'}
          </button>
        `
      ) : (
        state.isFinalSubmitted ? `
          <button disabled style="background:#ecfdf5; border:1px solid #a7f3d0; color:#059669; padding:8px 18px; border-radius:8px; font-weight:700; cursor:default; font-size:13px;">
            🔒 ${taskGenreKey === 'instructional' ? '教学设计' : '论文'}终稿已全员提交归档
          </button>
        ` : (isUserFinalSubmitted ? `
          <button disabled style="background:#f1f5f9; border:1px solid #cbd5e1; color:#059669; padding:8px 16px; border-radius:8px; font-weight:700; font-size:12.5px; cursor:default;">
            ✅ 您已确认提交终稿 (等待组员 ${finalSubmittedCount}/${totalCount})
          </button>
        ` : `
          <button id="btn-final-submit" style="background:linear-gradient(135deg, #059669, #047857); border:none; color:white; padding:8px 18px; border-radius:8px; font-weight:700; cursor:pointer; font-size:13px; box-shadow:0 3px 10px rgba(5,150,105,0.25);">
            🚀 确认提交${taskGenreKey === 'instructional' ? '教学设计' : '论文'}终稿
          </button>
        `)
      );

      const newConfirmRevBtn = actionBtnGroup.querySelector('#btn-confirm-stage3-revision');
      if (newConfirmRevBtn && !isUserRevisionConfirmed && !isDefenseLocked) {
        newConfirmRevBtn.onclick = () => {
          if (handlers.onConfirmStage3Revision) handlers.onConfirmStage3Revision();
        };
      }
      const newFinalSubmitBtn = actionBtnGroup.querySelector('#btn-final-submit');
      if (newFinalSubmitBtn && !isFinalSubmitted) {
        newFinalSubmitBtn.onclick = () => {
          if (handlers.onFinalSubmit) handlers.onFinalSubmit();
        };
      }
    }

    if (existingFrame) {
      if (isFinalSubmitted || isTaskDeadlineExpired) {
        existingFrame._wasPreviouslyReadonly = true;
        enforceEtherpadReadonly(existingFrame);
      } else {
        liftEtherpadReadonly(existingFrame);
        existingFrame._wasPreviouslyReadonly = false;
      }
    }
    return;
  }

  canvas.innerHTML = `
    <div style="height:100%; display:flex; flex-direction:column; gap:12px; overscroll-behavior-y:contain;">
      ${isTaskDeadlineExpired ? `
        <div id="stage3-deadline-expired-banner" style="background:#fef2f2; border:1.5px solid #fca5a5; border-radius:8px; padding:6px 14px; margin-bottom:4px; font-size:12.5px; color:#991b1b; font-weight:600; display:flex; justify-content:space-between; align-items:center; gap:12px; box-shadow:0 2px 6px rgba(239,68,68,0.08); height:38px; box-sizing:border-box; flex-shrink:0;">
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
              <span>🔒 本组${taskGenreKey === 'instructional' ? '教学设计' : '论文'}终稿与评估报告已全员成功归档提交至教师端！</span>
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
            🎓 答辩委员会质询与引导面板
          </button>
          <button id="tab-btn-editor" style="background:${activeTab === 'editor' ? 'linear-gradient(135deg, #059669, #047857)' : (isRevisionFullyConfirmed ? '#f1f5f9' : '#f8fafc')}; border:${isRevisionFullyConfirmed ? 'none' : '1px dashed #cbd5e1'}; color:${activeTab === 'editor' ? 'white' : (isRevisionFullyConfirmed ? '#475569' : '#94a3b8')}; padding:8px 16px; border-radius:8px; font-weight:700; font-size:13px; cursor:${isRevisionFullyConfirmed ? 'pointer' : 'not-allowed'};" title="${isRevisionFullyConfirmed ? `切换至${taskGenreKey === 'instructional' ? '教学设计' : '论文'}终稿协同修改` : '需组内全员确认进入终稿修改后解锁'}">
            ${isRevisionFullyConfirmed ? `📝 修改${taskGenreKey === 'instructional' ? '教学设计' : '论文'}终稿 (依据答辩意见完善正文)` : `📝 修改${taskGenreKey === 'instructional' ? '教学设计' : '论文'}终稿 (🔒 需全员确认进入终稿修改后解锁)`}
          </button>
        </div>
        <div id="stage3-action-btn-group" style="display:flex; gap:8px; align-items:center;">
          ${activeTab === 'defense' ? (
            isDefenseLocked ? `
              <button disabled style="background:#f1f5f9; border:1px solid #cbd5e1; color:${isFinalSubmitted ? '#94a3b8' : '#059669'}; padding:8px 16px; border-radius:8px; font-weight:700; font-size:12.5px; cursor:default;">
                ${isFinalSubmitted ? `🔒 ${taskGenreKey === 'instructional' ? '教学设计' : '论文'}终稿已归档 (只读)` : '✅ 全员已确认进入终稿修改 (答辩已锁定)'}
              </button>
            ` : `
              <button id="btn-confirm-stage3-revision" ${isUserRevisionConfirmed ? 'disabled' : ''} style="background:${isUserRevisionConfirmed ? '#f1f5f9' : 'linear-gradient(135deg, #2563eb, #1d4ed8)'}; border:${isUserRevisionConfirmed ? '1px solid #cbd5e1' : 'none'}; color:${isUserRevisionConfirmed ? '#2563eb' : 'white'}; padding:8px 16px; border-radius:8px; font-weight:700; font-size:12.5px; cursor:${isUserRevisionConfirmed ? 'default' : 'pointer'}; box-shadow:${isUserRevisionConfirmed ? 'none' : '0 2px 8px rgba(37,99,235,0.2)'};">
                ${isUserRevisionConfirmed ? '✅ 您已确认进入终稿修改' : '✍️ 确认进入终稿修改'}
              </button>
            `
          ) : (
            state.isFinalSubmitted ? `
              <button disabled style="background:#ecfdf5; border:1px solid #a7f3d0; color:#059669; padding:8px 18px; border-radius:8px; font-weight:700; cursor:default; font-size:13px;">
                🔒 ${taskGenreKey === 'instructional' ? '教学设计' : '论文'}终稿已全员提交归档
              </button>
            ` : (isUserFinalSubmitted ? `
              <button disabled style="background:#f1f5f9; border:1px solid #cbd5e1; color:#059669; padding:8px 16px; border-radius:8px; font-weight:700; font-size:12.5px; cursor:default;">
                ✅ 您已确认提交终稿 (等待组员 ${finalSubmittedCount}/${totalCount})
              </button>
            ` : `
              <button id="btn-final-submit" style="background:linear-gradient(135deg, #059669, #047857); border:none; color:white; padding:8px 18px; border-radius:8px; font-weight:700; cursor:pointer; font-size:13px; box-shadow:0 3px 10px rgba(5,150,105,0.25);">
                🚀 确认提交${taskGenreKey === 'instructional' ? '教学设计' : '论文'}终稿
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
              const isConf = confirmedRevMap[m.id]  || (m.name && confirmedRevMap[m.name]);
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
          <span style="color:#475569; font-weight:700;">🚀 终稿提交确认进度: <b style="color:${isAllFinalSubmitted ? '#059669' : '#d97706'};">${finalSubmittedCount}/${totalCount}</b> 人已确认提交 ${isAllFinalSubmitted ? '<span style="color:#059669; margin-left:6px;">(🎉 全员已确认提交)</span>' : '<span style="color:#d97706; margin-left:6px;">(需全组所有成员均确认提交后正式归档入库)</span>'}</span>
          <div style="display:flex; gap:6px;">
            ${membersList.map(m => {
              const isSub = finalSubmittedMap[m.id]  || (m.name && finalSubmittedMap[m.name]);
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
            <span>🔒 全组已全员确认进入终稿修改！答辩裁决矩阵已锁定归档（只读查阅），请在【修改${taskGenreKey === 'instructional' ? '教学设计' : '论文'}终稿】面板中完善正文。</span>
            <button onclick="document.getElementById('tab-btn-editor').click();" style="background:#059669; color:white; border:none; padding:4px 12px; border-radius:6px; font-size:11.5px; cursor:pointer; font-weight:700;">前往修改终稿 ➔</button>
          </div>
        ` : ''}
        <div class="card-title" style="margin-bottom:14px;">
          <span style="color:#0f172a;">📋 答辩与终稿修改清单 ${isFinalSubmitted ? '<span style="font-size:11px; color:#059669; margin-left:6px;">(🔒 已全盘提交归档)</span>' : (isRevisionFullyConfirmed ? '<span style="font-size:11px; color:#059669; margin-left:6px;">(🔒 全员已确认进入终稿修改 · 答辩清单已定案归档)</span>' : '')}</span>
        </div>
        <div id="stage3-feedback-list-container" style="display:flex; flex-direction:column; gap:14px;">
          ${renderStage3FeedbackListHtml(s3, state, isDefenseLocked, isFinalSubmitted)}
        </div>
      </div>

      <!-- 📝 视图 2：论文终稿协同修改 Etherpad 引擎 -->
      <div class="card" id="stage3-editor-card" style="display:${activeTab === 'editor' ? 'flex' : 'none'}; flex:1; flex-direction:column; padding:16px; min-height:600px; overscroll-behavior-y:contain; -webkit-overflow-scrolling:touch;">
        ${(() => {
          const currUser = (window.app && window.app.authManager) ? window.app.authManager.getCurrentUser() : null;
          let userClassId = state.activeStudentClassId || (currUser ? currUser.classId : null) || null;
          const activeGroupObj = (window.app && window.app.authManager) ? window.app.authManager.getStudentActiveGroup(currUser, userClassId) : null;
          let userGroupId = activeGroupObj?.id || (window.app?.cloudSyncEngine?.groupId) || (currUser?.groupId) || state.activeGroupId || null;
          let activeTaskId = state.activeTaskId || (window.app?.cloudSyncEngine?.taskId) || '';

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
          const currUserCode = currUser?.id || currUser?.studentCode || state.currentUser || '';
          let currUserName = currUser?.name || '';
          if (!currUserName && state.members && (state.members[currUserCode]?.name || state.members[state.currentUser]?.name)) {
            currUserName = state.members[currUserCode]?.name || state.members[state.currentUser]?.name || '';
          }
          if (!currUserName && window.app && window.app.authManager) {
            const matchedUser = window.app.authManager.findUserByKey ? window.app.authManager.findUserByKey(currUserCode) : window.app.authManager.getUsers().find(u => u && (u.id === currUserCode || u.studentCode === currUserCode));
            if (matchedUser && matchedUser.name) currUserName = matchedUser.name;
          }
          if (!currUserName) currUserName = currUserCode || '组员';
          const currUserColor = (state.members && state.members[currUserCode]?.color) || '#2563eb';

          const isEditorReadonly = isFinalSubmitted || isTaskDeadlineExpired;

          const targetPad = rawPadName;
          const padUrl = `/p/${encodeURIComponent(targetPad)}?userName=${encodeURIComponent(currUserName)}&userColor=${encodeURIComponent(currUserColor)}&showControls=${isEditorReadonly ? 'false' : 'true'}&showChat=false&showLineNumbers=true&lang=zh-hans${isEditorReadonly ? '&readOnly=true' : ''}`;

          return `
            <div class="card-title" style="margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:15px; font-weight:800; color:#0f172a;">📝 ${taskGenreKey === 'instructional' ? '教学设计' : '论文'}全篇终稿大正文 ${isEditorReadonly ? '<span style="font-size:11.5px; color:#059669; margin-left:6px; background:#ecfdf5; padding:2px 8px; border-radius:6px; border:1px solid #a7f3d0;">🔒 终稿已归档/截止锁定 · 100% 只读防篡改保护</span>' : '(依据答辩意见实时协同修改终稿 · Etherpad 毫秒级引擎)'}</span>
              <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:11px; background:${isEditorReadonly ? '#f1f5f9' : '#ecfdf5'}; color:${isEditorReadonly ? '#64748b' : '#059669'}; border:1px solid ${isEditorReadonly ? '#cbd5e1' : '#a7f3d0'}; padding:2px 8px; border-radius:10px; font-weight:700;">${isEditorReadonly ? '🔒 只读归档' : '🟢 Etherpad 协同就绪'}</span>
                <button onclick="const f=document.getElementById('stage3-etherpad-frame'); if(f) f.src=f.src;" style="background:transparent; color:#2563eb; border:1px solid #cbd5e1; padding:2px 8px; border-radius:4px; font-size:11px; cursor:pointer; font-weight:600;">🔄 刷新</button>
              </div>
            </div>
            <div style="flex:1; min-height:0; position:relative; background:#f1f5f9; border-radius:8px; overflow:hidden; border:1px solid #cbd5e1;">
              <iframe id="stage3-etherpad-frame" src="${padUrl}" style="width:100%; height:100%; min-height:540px; border:none; display:block; ${isEditorReadonly ? 'user-select:none;' : ''}" allow="clipboard-read; clipboard-write" onload="const f=document.getElementById('stage3-etherpad-frame'); if(f && ${isEditorReadonly ? 'true' : 'false'}) { try { if(window.enforceEtherpadReadonly) window.enforceEtherpadReadonly(f); } catch(e){} }"></iframe>
              ${isEditorReadonly ? '<div class="etherpad-readonly-shield" style="position:absolute; top:0; left:0; right:20px; bottom:0; z-index:50; background:transparent; cursor:default; pointer-events:auto;" title="🔒 正文已截止锁定为只读模式"></div>' : ''}
              ${isFinalSubmitted ? `
                <div style="position:absolute; top:12px; right:12px; z-index:99; pointer-events:none; display:flex; align-items:center; justify-content:center;" title="🔒 ${taskGenreKey === 'instructional' ? '教学设计' : '论文'}终稿已全员提交归档锁定">
                  <div style="background:rgba(15,23,42,0.85); color:#ffffff; padding:6px 14px; border-radius:6px; font-size:12px; font-weight:700; pointer-events:none; box-shadow:0 4px 12px rgba(0,0,0,0.18); display:flex; align-items:center; gap:6px;">
                    <span>🔒 ${taskGenreKey === 'instructional' ? '教学设计' : '论文'}终稿已全员提交归档 (只读查阅模式)</span>
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

  if (isFinalSubmitted || isTaskDeadlineExpired) {
    const s3Frame = canvas.querySelector('#stage3-etherpad-frame');
    if (s3Frame) enforceEtherpadReadonly(s3Frame);
  } else {
    const s3Frame = canvas.querySelector('#stage3-etherpad-frame');
    if (s3Frame) {
      liftEtherpadReadonly(s3Frame);
      ensureEtherpadUserSync(s3Frame, currUserName, currUserColor);
    }
  }

  const tabDefense = canvas.querySelector('#tab-btn-defense');
  const tabEditor = canvas.querySelector('#tab-btn-editor');
  if (tabDefense) tabDefense.addEventListener('click', () => handlers.onSwitchStage3Tab('defense'));
  if (tabEditor) {
    tabEditor.addEventListener('click', () => {
      if (!isRevisionFullyConfirmed) {
        alert(`⚠️ 需组内全员确认进入终稿修改后，方可解锁进入【修改${taskGenreKey === 'instructional' ? '教学设计' : '论文'}终稿】协同编辑！\n\n当前确认进度：${confirmedRevCount}/${totalCount} 人已确认。\n请提醒组内其他同学点击右上角【✍️ 确认进入终稿修改】！`);
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

export function renderChat(state) {
  if (typeof renderChatActionBar === 'function') {
    renderChatActionBar(state);
  }

  const presenceContainer = document.getElementById('chat-member-presence-pills');
  if (presenceContainer) {
    const members = Object.values(state.members || {});
    const presence = state.presence || {};
    const currUser = (window.app && window.app.authManager) ? window.app.authManager.getCurrentUser() : null;
    const myCode = currUser?.id || state.currentUser || '';
    const nowMs = Date.now();

    let memberList = [];
    if (Array.isArray(state.members)) memberList = state.members;
    else if (state.members && typeof state.members === 'object') memberList = Object.values(state.members);
    if (memberList.length === 0 && window.app?.authManager) {
      const u = window.app.authManager.getCurrentUser();
      const effClassId = (window.app?.authManager ? window.app.authManager.getEffectiveStudentClassId(u, window.app?.state?.activeTaskId) : (window.app?.state?.activeStudentClassId || u?.classId || null));
      const effGroup = window.app.authManager.getStudentActiveGroup(u, effClassId);
      const grpMap = window.app.authManager.getGroupMembersForWorkspace(effGroup?.id || state.activeGroupId || null);
      memberList = Object.values(grpMap || {});
    }
    if (!Array.isArray(memberList)) {
      memberList = Object.values(memberList || {});
    }

    const newPresenceHtml = memberList.map(m => {
      const uid = String(m.id || m.userId || m.studentCode || '').trim();
      const candidateKeys = [
        String(m.id || '').trim(),
        String(m.userId || '').trim(),
        String(m.studentCode || '').trim(),
        String(m.username || '').trim(),
        String(m.name || '').trim()
      ].filter(Boolean);

      const isMe = (currUser && (
        (currUser.id && (m.id === currUser.id || uid === String(currUser.id) || (m.userId && String(m.userId) === String(currUser.id)))) ||
        (currUser.studentCode && (m.studentCode === currUser.studentCode || uid === String(currUser.studentCode))) ||
        (currUser.name && m.name === currUser.name)
      )) || (uid && uid === myCode);

      let isOnline = isMe;
      if (!isOnline) {
        for (const k of candidateKeys) {
          const p = presence[k];
          if (p && !p.offline) {
            const pTime = Number(p.lastSeen || p.updatedAt || p.timestamp || 0);
            if (pTime > 0 && (nowMs - pTime <= 180000)) {
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

  const analyzingSig = state.activeAgentAnalyzing ? `${state.activeAgentAnalyzing.title}_${state.activeAgentAnalyzing.detail}` : 'none';
  const msgSignature = cleanMsgs.map(m => (m.id || `${m.sender}_${m._timeMs || m.timestamp}`)).join('|') + `__analyzing_${analyzingSig}`;
  if (stream.dataset.msgSignature === msgSignature) {
    return; // 消息与分析状态没有任何变动，绝不重绘 DOM，彻底保护打字焦点与输入法
  }
  stream.dataset.msgSignature = msgSignature;

  // 智能滚动：如果用户正在往上拉浏览历史记录，保持当前视角不被强行打断拉回底部
  const isAtBottom = (stream.scrollHeight - stream.scrollTop - stream.clientHeight) < 90;
  const prevScrollTop = stream.scrollTop;

  const allUsers = (window.app && window.app.authManager) ? window.app.authManager.getUsers() : [];
  const authUser = (window.app && window.app.authManager) ? window.app.authManager.getCurrentUser() : null;
  const myKeys = [
    currentUser,
    state.currentUser,
    authUser?.id,
    authUser?.name
  ].filter(Boolean).map(k => String(k).trim().toLowerCase());

  stream.innerHTML = cleanMsgs.map(msg => {
    const isAgent = AgentProfiles[msg.sender] !== undefined;
    const msgKeys = [
      msg.sender,
      msg.senderName,
      msg.author,
      msg.authorName
    ].filter(Boolean).map(k => String(k).trim().toLowerCase());

    const isMe = !isAgent && (
      isSameUser(authUser, msg.sender) ||
      isSameUser(authUser, msg.senderName) ||
      msgKeys.some(k => myKeys.includes(k))
    );
    
    let name = msg.senderName || msg.sender;
    let avatar = '👤';
    let color = '#2563eb';

    if (isAgent) {
      const allTasks = (window.app && window.app.authManager) ? window.app.authManager.getTasks() : [];
      const currentTask = allTasks.find(t => t.id === state.activeTaskId);
      const taskGenreKey = currentTask?.taskType || 'experiment';
      name = getAgentDisplayName(msg.sender, taskGenreKey);
      const profile = AgentProfiles[msg.sender];
      avatar = profile?.avatar || '🤖';
      color = profile?.color || '#7c3aed';
    } else {
      if (msg.senderName && msg.senderName !== '组员') {
        name = msg.senderName;
      }
      const u = allUsers.find(x => x && (x.id === msg.sender || x.id === msg.senderName || x.name === msg.sender || x.name === msg.senderName || (name && x.name === name)));
      if (u && u.name) {
        name = u.name;
      } else if (state.members) {
        const memList = Array.isArray(state.members) ? state.members : Object.values(state.members);
        const mem = memList.find(m => m && (m.id === msg.sender || m.id === msg.senderName || m.name === msg.sender || m.name === msg.senderName));
        if (mem && mem.name) name = mem.name;
      }
      if (!name || name === msg.sender) {
        const memList = Array.isArray(state.members) ? state.members : Object.values(state.members || {});
        const mem = memList.find(m => m && (m.id === msg.sender || m.name === msg.sender));
        name = mem?.name || (msg.senderName && msg.senderName !== msg.sender ? msg.senderName : '组员');
      }

      const memList = Array.isArray(state.members) ? state.members : Object.values(state.members || {});
      const memObj = memList.find(m => isSameUser(m, msg.sender) || m.id === msg.sender || m.name === msg.sender || m.name === name) || null;
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
      let formattedText = '';
      if (rawText.includes('<button') || rawText.includes('<br>') || rawText.includes('<span')) {
        // 允许受信任的智能体内置操作按键、换行与高亮标签
        formattedText = rawText
          .replace(/(@[^\s@<]+)/g, '<span class="mention-tag">$1</span>')
          .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
      } else {
        let safeText = escapeHtml(rawText);
        formattedText = safeText
          .replace(/(@[^\s@]+)/g, '<span class="mention-tag">$1</span>')
          .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
      }
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

  const lastMsg = cleanMsgs.length > 0 ? cleanMsgs[cleanMsgs.length - 1] : null;
  const lastMsgKeys = lastMsg ? [lastMsg.sender, lastMsg.senderName, lastMsg.author, lastMsg.authorName].filter(Boolean).map(k => String(k).trim().toLowerCase()) : [];
  const lastMsgIsMine = lastMsg && !AgentProfiles[lastMsg.sender] && (
    isSameUser(authUser, lastMsg.sender) ||
    isSameUser(authUser, lastMsg.senderName) ||
    lastMsgKeys.some(k => myKeys.includes(k))
  );

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
}

/**
 * ── 🌟 阶段一/阶段二/阶段三动态协同操作栏 (在表情栏正上方) ──
 * 独立渲染函数：绝不被聊天流消息去重提前 return 拦截，秒级响应时间与阶段状态推进！
 */
export function renderChatActionBar(state) {
  if (!state) return;
  const actionBar = document.getElementById('chat-agent-action-bar');
  if (!actionBar) return;

  const s2 = state.stage2 || {};
  const curStage = state.currentStage || 'stage1';
  const membersList = Object.values(state.members || []);
  const totalCount = membersList.length || 3;
  const currUser = (window.app && window.app.authManager) ? window.app.authManager.getCurrentUser() : null;
  const myCode = currUser?.id || state.currentUser || '';
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
        m?.id, m?.name,
        fullUser?.id, fullUser?.name
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
      myCode, currUser?.id, currUser?.name,
      fullUser?.id, fullUser?.name
    ].filter(Boolean).map(k => String(k).trim().toLowerCase());
    return keys.some(k => map[k] || map[String(k)]);
  };

  const s2Subs = s2.meetingSubmissions || {};
  const s2SubCount = Object.keys(s2Subs).length;
  const isS2MeetingDone = s2SubCount >= totalCount && totalCount > 0;

  const s2Chats = state.chatLogs?.stage2 || [];
  const hasFinalChecklistSummary = s2Chats.some(m => m && m.text && (m.text.includes('二审修改落实决议') || m.text.includes('修改确认与写作冲刺') || m.text.includes('修改落实确认')));

  const hasFinalReviewInLogs = s2Chats.some(m => m && m.sender === 'reviewingEditor' && (m.text?.includes('终稿行文扫描') || m.text?.includes('终审定稿总评') || m.text?.includes('审稿编辑·终审')));

  if (curStage === 'stage1') {
    const s1 = state.stage1 || {};
    let s1Start = state.timer?.startTimestamp || s1.startTime;
    if (!s1Start) {
      const s1Chats = state.chatLogs?.stage1 || [];
      for (const m of s1Chats) {
        const t = m._timeMs;
        if (t && (!s1Start || t < s1Start)) s1Start = t;
      }
      const s1Props = s1.proposals || [];
      for (const p of s1Props) {
        const t = p.createdAt || p.updatedAt;
        if (t && (!s1Start || t < s1Start)) s1Start = t;
      }
    }
    const elapsedSec = s1Start ? Math.max(0, Math.floor(((Date.now() - s1Start) / 1000) * (state.timer?.speed || 1))) : ((state.timer && state.timer.elapsedSeconds) ? state.timer.elapsedSeconds : 0);
    const hasTopic = !!(s1.mergedTitle || s1.contract?.topic);
    const hasTime = !!(s1.contract?.timeAllocations && Object.keys(s1.contract.timeAllocations).length >= 6);
    const hasTasks = !!(s1.contract?.taskAssignments && Object.keys(s1.contract.taskAssignments).length >= totalCount && totalCount > 0);
    const isThreeDone = hasTopic && hasTime && hasTasks;
    const isDraftDone = !!(s1.contractStep === 'completed' || s1.contract?.isDraftGenerated || isThreeDone);
    const isContractConfirmed = !!(s1.contract?.isConfirmed || state.groupMaxStage === 'stage2' || state.groupMaxStage === 'stage3');
    const confirmedMembers = s1.contract?.confirmedMembers || {};
    const confirmedCount = membersList.filter(m => isDoneHelper({ [m.id]: confirmedMembers[m.id] || (m.name && confirmedMembers[m.name]) })).length;

    if (isContractConfirmed) {
      actionBar.style.display = 'none';
      actionBar.innerHTML = '';
    } else if (isDraftDone) {
      actionBar.style.display = 'block';
      actionBar.innerHTML = `
        <div style="background:#f0fdf4; border:1px solid #bbf7d0; color:#166534; padding:6px 14px; border-radius:16px; font-weight:700; font-size:12px; display:inline-flex; align-items:center; gap:6px;">
          📜 公约草案已全部生成！👉 请全员在左侧公约下方核对并签署 (${confirmedCount}/${totalCount} 人已签)
        </div>
      `;
    } else if (elapsedSec >= 13 * 60) {
      actionBar.style.display = 'block';
      const isGenerating = !!(window.app && window.app._isGeneratingContract);
      const isFailed = !!(window.app && window.app._contractGenerateFailed);

      if (isGenerating) {
        actionBar.innerHTML = `
          <button id="btn-s1-auto-generate-contract" disabled style="background:#94a3b8; border:none; color:white; padding:7px 18px; border-radius:18px; font-weight:800; font-size:12.5px; cursor:not-allowed; display:inline-flex; align-items:center; gap:6px;">
            ⏳ 拍卖师正在通读研讨并提炼公约草案...
          </button>
        `;
      } else if (isFailed) {
        actionBar.innerHTML = `
          <button id="btn-s1-auto-generate-contract" style="background:linear-gradient(135deg, #ea580c, #c2410c); border:none; color:white; padding:7px 18px; border-radius:18px; font-weight:800; font-size:12.5px; cursor:pointer; display:inline-flex; align-items:center; gap:6px; box-shadow:0 3px 10px rgba(234,88,12,0.3); transition:all 0.2s;">
            🔄 提炼遇阻，点此重新提炼生成公约草案
          </button>
        `;
      } else {
        const confs = state.stepConfirmations || {};
        const count = isDoneHelper(confs.s1_full_contract);
        const isMe = isMyDoneHelper(confs.s1_full_contract);
        const isFull = count >= totalCount && totalCount > 0;
        actionBar.innerHTML = `
          <button id="btn-s1-auto-generate-contract" style="background:${isFull ? 'linear-gradient(135deg, #d97706, #b45309)' : (isMe ? 'linear-gradient(135deg, #059669, #047857)' : 'linear-gradient(135deg, #7c3aed, #6d28d9)')}; border:none; color:white; padding:7px 18px; border-radius:18px; font-weight:800; font-size:12.5px; cursor:${isFull ? 'wait' : 'pointer'}; display:inline-flex; align-items:center; gap:6px; box-shadow:0 3px 10px rgba(124,58,237,0.25); transition:all 0.2s;" ${isFull ? 'disabled' : ''}>
            ${isFull ? `⏳ 全员已确认 (${count}/${totalCount}) · 正在生成公约草案...` : (isMe ? `✅ 您已确认提炼公约 (${count}/${totalCount} 等待组员)` : `💡 [ 📋 研讨差不多了？一键提炼生成公约草案 (${count}/${totalCount}) ]`)}
          </button>
        `;
      }

      actionBar.querySelector('#btn-s1-auto-generate-contract')?.addEventListener('click', () => {
        if (!isGenerating && window.app && typeof window.app.handleOneClickGenerateContract === 'function') {
          window.app.handleOneClickGenerateContract();
        }
      });
    } else {
      actionBar.style.display = 'none';
      actionBar.innerHTML = '';
    }
  } else if (curStage === 'stage2') {
    if (s2.meetingStep === 'completed' || hasFinalChecklistSummary || hasFinalReviewInLogs) {
      actionBar.style.display = 'none';
      actionBar.innerHTML = '';
    } else {
      actionBar.style.display = 'block';
      const allTasks = (window.app && window.app.authManager) ? window.app.authManager.getTasks() : [];
      const currentTask = allTasks.find(t => t.id === state.activeTaskId);
      const taskGenreKey = currentTask?.taskType || 'experiment';
      const isInst = (taskGenreKey === 'instructional');
      const managingTitle = isInst ? '备课组长' : '责任编辑';
      const reviewingTitle = isInst ? '教研专家' : '审稿编辑';
      const meetingName = isInst ? '磨课会议' : '编辑会议';

      if (!isS2MeetingDone) {
        actionBar.innerHTML = `
          <button id="btn-s2-locked-notice" style="background:#f1f5f9; border:1px solid #cbd5e1; color:#94a3b8; padding:7px 18px; border-radius:18px; font-weight:800; font-size:12.5px; cursor:not-allowed; display:inline-flex; align-items:center; gap:6px; box-shadow:none;">
            🔒 请先全员参与【${meetingName}】打卡 (${s2SubCount}/${totalCount} 人已打卡)
          </button>
        `;
        actionBar.querySelector('#btn-s2-locked-notice')?.addEventListener('click', () => {
          alert(`🔒 请先在正文上方点击【📢 参与【${meetingName}】】完成半程自查打卡！\n\n当前打卡进度：${s2SubCount}/${totalCount} 人。\n全员打卡完成后，${managingTitle}将主持会议，届时方可点击总结。`);
        });
      } else if (!s2.meetingStep || s2.meetingStep === 'discussing_divergence' || s2.meetingStep === 'initial' || s2.meetingStep === 'discussing_agreement') {
        const count = isDoneHelper(confs.s2_managing);
        const isMe = isMyDoneHelper(confs.s2_managing);
        actionBar.innerHTML = `
          <button id="btn-s2-managing-summary" style="background:${isMe ? 'linear-gradient(135deg, #059669, #047857)' : 'linear-gradient(135deg, #d97706, #b45309)'}; border:none; color:white; padding:7px 18px; border-radius:18px; font-weight:800; font-size:12.5px; cursor:pointer; display:inline-flex; align-items:center; gap:6px; box-shadow:0 3px 10px rgba(217,119,6,0.25); transition:all 0.2s;">
            ${isMe ? `✅ 您已确认总结共识 (${count}/${totalCount} 等待组员)` : `🤝 讨论差不多了？让${managingTitle}总结 (${count}/${totalCount})`}
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
            ${isMe ? `✅ 您已确认总结清单 (${count}/${totalCount} 等待组员)` : `📝 讨论差不多了？让${reviewingTitle}总结 (${count}/${totalCount})`}
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
if (typeof window !== 'undefined') {
  window.renderChatActionBar = renderChatActionBar;
}

// 🛡️ Fail-safe compatibility exports
export function renderDefenseRoom() {}
export function renderWordEditor() {}
export function renderStageNavigation() {}
export function renderStudentWorkspace() {}
export function renderSurveyModal() {}
export function setupChatAtMentionMenu() {}
export function updateContributionUi() {}
export function showSurveyModalIfApplicable() {}

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

