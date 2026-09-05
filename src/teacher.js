/**
 * JIZHI (集智) Platform - Teacher Portal & Analytics Matrix
 * Standard ES Module (ESM)
 */

import {
  STORAGE_KEY_ANNOUNCEMENTS,
  STORAGE_KEY_TASKS,
  STORAGE_KEY_CLASSES,
  STORAGE_KEY_USERS_DB,
  TASK_GENRE_CONFIGS,
  AgentProfiles,
  APP_VERSION
} from "./constants.js?v=20260905_v2575";
import { parseXLSXOrCSVFile, parseCSVText, downloadFileBlob, escapeHtml, isTaskExpired, formatDurationHuman, formatChatDisplayTime, formatStandardDateDash, filterAndDeduplicateChatLogs, enforceEtherpadReadonly, showGlobalBannerNotice, isSameId, normalizeId } from "./utils.js?v=20260905_v2575";

export const getPanoGroupData = (pano, gid) => {
  if (!pano || typeof pano !== 'object' || !gid) return null;
  if (pano[gid]) return pano[gid];
  const found = Object.entries(pano).find(([k]) => isSameId(k, gid));
  return found ? found[1] : null;
};

/* ==========================================================================
   6.8 TEACHER MONITOR IN-PLACE INCREMENTAL UPDATER (PREVENT IFRAME THRASHING)
   ========================================================================== */
function updateTeacherLiveMonitorInPlace(container, state, authManager, activeClass, activeMonitorGroup, monitorTaskObj, genreCfg, monitorMembersList, monitorMembersObj, actualStage, effectiveMonitorStage, isMonitorTaskExpired) {
  if (!container || !activeMonitorGroup) return;

  // 0. 更新全组实时总览卡片 (Panorama Cards)
  if (state.monitorPanorama && activeClass) {
    (activeClass.groups || []).forEach(g => {
      const card = container.querySelector(`.btn-monitor-panorama-card[data-gid="${g.id}"]`);
      if (card) {
        const p = getPanoGroupData(state.monitorPanorama, g.id);
        const total = p ? (p.totalMembers || 0) : ((g.members || []).length || 0);
        const online = p ? (p.onlineCount || 0) : 0;
        const locks = p ? (p.activeLocks || []).length : 0;
        const final = p ? !!p.isFinalSubmitted : false;
        const stage = p ? (p.currentStage || 'stage1') : 'stage1';
        const stageLabel = stage === 'stage1' ? '🎪 阶段一' : stage === 'stage2' ? '📰 阶段二' : '🎓 阶段三';
        const absent = Math.max(0, total - online);
        let dot = '🟢', dotColor = '#16a34a', hint = '正常推进';
        if (final) { dot = '✅'; dotColor = '#059669'; hint = '已终稿'; }
        else if (total > 0 && online === 0) { dot = '🔴'; dotColor = '#dc2626'; hint = '全员离线'; }
        else if (locks > 0) { dot = '🔴'; dotColor = '#dc2626'; hint = locks + ' 字段占用'; }
        else if (absent > 0) { dot = '🟡'; dotColor = '#d97706'; hint = absent + ' 人离线'; }

        const dotSpan = card.querySelector('.card-dot') || card.querySelector('div:first-child span:last-child');
        if (dotSpan) dotSpan.innerText = dot;
        const stageEl = card.querySelector('.card-stage');
        if (stageEl) stageEl.innerText = stageLabel;
        const onlineEl = card.querySelector('.card-online');
        if (onlineEl) onlineEl.innerText = `在线 ${online}/${total}`;
        const hintEl = card.querySelector('.card-hint') || card.querySelector('div:last-child');
        if (hintEl) {
          hintEl.style.color = dotColor;
          hintEl.innerText = `${hint}${locks > 0 ? ' · 锁字段' : ''}`;
        }
      }
    });
  }

  // 1. 任务指标与倒计时
  const countdownEl = container.querySelector('#teacher-task-countdown-text');
  if (countdownEl && monitorTaskObj) {
    const calcRemain = (deadlineStr) => {
      if (!deadlineStr || deadlineStr.includes('无') || deadlineStr.includes('结课前')) return '结课前';
      try {
        const dMs = new Date(deadlineStr.replace(/-/g, '/')).getTime();
        if (isNaN(dMs)) return deadlineStr;
        const diff = dMs - Date.now();
        if (diff <= 0) return '已截止';
        const totalM = Math.floor(diff / 60000);
        const h = Math.floor(totalM / 60);
        const m = totalM % 60;
        if (h >= 24) return `剩余 ${Math.floor(h / 24)}天${h % 24}小时`;
        return `剩余 ${h}小时${m}分`;
      } catch(e) { return deadlineStr; }
    };
    const remainText = calcRemain(monitorTaskObj.deadline);
    const isExp = remainText.includes('已截止');
    countdownEl.innerHTML = `⏰ <b style="color:${isExp ? '#dc2626' : '#2563eb'}; font-weight:700;">${remainText}</b>`;
  }

  // 2. 状态标签
  const statusBadge = container.querySelector('#teacher-task-status-badge');
  if (statusBadge) {
    const isExp = isMonitorTaskExpired || state.isFinalSubmitted;
    statusBadge.style.background = isExp ? '#fef2f2' : '#ecfdf5';
    statusBadge.style.color = isExp ? '#dc2626' : '#059669';
    statusBadge.style.borderColor = isExp ? '#fecaca' : '#a7f3d0';
    statusBadge.innerText = isMonitorTaskExpired ? '已截止' : (state.isFinalSubmitted ? '已归档' : '进行中');
  }

  // 3. 实时进度文字
  const stageText = container.querySelector('#teacher-actual-stage-text');
  if (stageText) {
    stageText.innerText = actualStage === 'stage1' ? '阶段一：学术拍卖会' : actualStage === 'stage2' ? '阶段二：学术编辑部' : '阶段三：答辩擂台';
  }

  // 4. 在线/离线成员胶囊
  const onlineContainer = container.querySelector('#teacher-online-pills-container');
  if (onlineContainer) {
    const panoData = getPanoGroupData(state.monitorPanorama, activeMonitorGroup.id);
    const total = panoData ? (panoData.totalMembers || 0) : (monitorMembersList.length || 0);
    const online = panoData ? (panoData.onlineCount || 0) : 0;
    const absentList = (panoData && panoData.absentMembers) || [];
    const absentCount = Math.max(0, total - online);

    if (total > 0 && online === 0) {
      onlineContainer.innerHTML = `
        <span style="font-size:12px; font-weight:700; padding:3px 10px; border-radius:6px; background:#fef2f2; color:#dc2626; border:1px solid #fecaca; display:inline-flex; align-items:center; gap:5px;">
          <span style="width:6px; height:6px; border-radius:50%; background:#dc2626;"></span>
          全员离线 (0/${total})
        </span>
      `;
    } else if (absentCount > 0 && absentList.length > 0) {
      onlineContainer.innerHTML = `
        <span style="font-size:12px; font-weight:700; padding:3px 10px; border-radius:6px; background:#fffbeb; color:#b45309; border:1px solid #fde68a; display:inline-flex; align-items:center; gap:6px; flex-wrap:wrap;">
          <span style="display:inline-flex; align-items:center; gap:4px;">
            <span style="width:6px; height:6px; border-radius:50%; background:#f59e0b;"></span>
            离线 (${absentCount}人):
          </span>
          ${absentList.map(name => `
            <span style="background:#ffffff; color:#92400e; border:1px solid #fcd34d; padding:1px 6px; border-radius:4px; font-size:11.5px; font-weight:700;">
              ${escapeHtml(name)}
            </span>
          `).join('')}
        </span>
      `;
    } else {
      onlineContainer.innerHTML = `
        <span style="font-size:12px; font-weight:700; padding:3px 10px; border-radius:6px; background:#ecfdf5; color:#059669; border:1px solid #a7f3d0; display:inline-flex; align-items:center; gap:5px;">
          <span style="width:6px; height:6px; border-radius:50%; background:#10b981;"></span>
          全员在线 (${online}/${total || online})
        </span>
      `;
    }
  }

  // 5. 阶段二特定组件
  if (effectiveMonitorStage === 'stage2') {
    const cleanLen = (state.stage2?.unifiedContent || '').replace(/<[^>]*>/g, '').trim().length;
    const s2WordBadge = container.querySelector('#teacher-stage2-word-count-num');
    if (s2WordBadge) s2WordBadge.innerText = String(cleanLen);

    const confirmedContainer = container.querySelector('#teacher-stage2-confirmed-pills');
    if (confirmedContainer) {
      confirmedContainer.innerHTML = monitorMembersList.map(m => {
        const isConf = state.stage2?.confirmedMembers && (state.stage2.confirmedMembers[m.id] || (m.name && state.stage2.confirmedMembers[m.name]));
        return `<span style="font-size:11px; padding:1px 8px; border-radius:10px; font-weight:700; background:${isConf ? '#ecfdf5' : '#f8fafc'}; color:${isConf ? '#059669' : '#94a3b8'}; border:1px solid ${isConf ? '#a7f3d0' : '#e2e8f0'};">
          ${isConf ? '✓' : '○'} ${escapeHtml(m.name)}
        </span>`;
      }).join('');
    }

    const contribLabels = container.querySelector('#teacher-stage2-contrib-labels');
    const contribBars = container.querySelector('#teacher-stage2-contrib-bars');
    const contribs = state.stage2?.memberContributions || {};
    let rawTotal = 0;
    monitorMembersList.forEach(m => { rawTotal += Number(contribs[m.id] || 0); });

    if (contribLabels) {
      contribLabels.innerHTML = monitorMembersList.map((m) => {
        const rawVal = Number(contribs[m.id] || 0);
        const pct = rawTotal > 0 ? Math.round((rawVal / rawTotal) * 100) : 0;
        return `<span style="color:${rawVal > 0 ? (m.color || '#2563eb') : '#94a3b8'}; font-weight:700;">● ${escapeHtml(m.name)}: ${pct}%</span>`;
      }).join('');
    }
    if (contribBars) {
      if (rawTotal === 0) {
        contribBars.innerHTML = `<div style="width:100%; height:10px; background:#f8fafc; border-radius:5px; display:flex; align-items:center; justify-content:center; font-size:10px; color:#94a3b8; font-weight:600;">⏳ 暂无协作投入 (组员在 Etherpad 中撰写、修改正文或研讨后将平滑累计真实贡献)</div>`;
      } else {
        contribBars.innerHTML = monitorMembersList.map((m) => {
          const rawVal = Number(contribs[m.id] || 0);
          if (rawVal === 0) return '';
          const pct = Math.round((rawVal / rawTotal) * 100);
          return `<div style="width:${pct}%; background:${m.color || '#2563eb'}; transition:width 0.3s ease;" title="${escapeHtml(m.name)}: ${pct}% (${rawVal}字)"></div>`;
        }).join('');
      }
    }

    const tFrame2 = container.querySelector('#teacher-stage2-etherpad-frame');
    if (tFrame2) {
      const curTaskPid = monitorTaskObj ? monitorTaskObj.id : (state.activeTaskId || '');
      const curGroupPid = activeMonitorGroup ? activeMonitorGroup.id : (state.activeMonitorGroupId || 'group_1');
      const expectedPad = `jizhi_${curTaskPid}_${curGroupPid}`;
      if (tFrame2.getAttribute('data-pad') !== expectedPad) {
        tFrame2.setAttribute('data-pad', expectedPad);
        tFrame2.setAttribute('data-task', curTaskPid);
        tFrame2.setAttribute('data-group', curGroupPid);
        tFrame2.src = `/p/${encodeURIComponent(expectedPad)}?userName=${encodeURIComponent('教师监控')}&userColor=%237c3aed&showControls=false&showChat=false&showLineNumbers=true&lang=zh-hans`;
      }
      enforceEtherpadReadonly(tFrame2);
    }
  }

  // 6. 阶段三特定组件
  if (effectiveMonitorStage === 'stage3') {
    const s3CleanLen = ((state.stage3?.finalDraft || state.stage2?.unifiedContent || '').replace(/<[^>]*>/g, '').trim()).length;
    const s3WordBadge = container.querySelector('#teacher-stage3-word-count-num');
    if (s3WordBadge) s3WordBadge.innerText = String(s3CleanLen);

    const tFrame3 = container.querySelector('#teacher-stage3-etherpad-frame');
    if (tFrame3) {
      const curTaskPid = monitorTaskObj ? monitorTaskObj.id : (state.activeTaskId || '');
      const curGroupPid = activeMonitorGroup ? activeMonitorGroup.id : (state.activeMonitorGroupId || 'group_1');
      const expectedPad = `jizhi_${curTaskPid}_${curGroupPid}`;
      if (tFrame3.getAttribute('data-pad') !== expectedPad) {
        tFrame3.setAttribute('data-pad', expectedPad);
        tFrame3.setAttribute('data-task', curTaskPid);
        tFrame3.setAttribute('data-group', curGroupPid);
        tFrame3.src = `/p/${encodeURIComponent(expectedPad)}?userName=${encodeURIComponent('教师监控')}&userColor=%237c3aed&showControls=false&showChat=false&showLineNumbers=true&lang=zh-hans`;
      }
      enforceEtherpadReadonly(tFrame3);
    }
  }

  // 7. 研讨聊天流实时就地增量刷新
  const chatStream = container.querySelector('#teacher-unified-chat-stream');
  if (chatStream) {
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
    const combinedGroupChatLogs = filterAndDeduplicateChatLogs(allMsgs);

    const chatBadge = container.querySelector('#teacher-chat-count-badge');
    if (chatBadge) chatBadge.innerText = `全阶段汇总 (${combinedGroupChatLogs.length}条)`;

    const isNearBottom = (chatStream.scrollHeight - chatStream.scrollTop - chatStream.clientHeight) < 60;
    const allGlobalUsers = (authManager) ? authManager.getUsers() : [];

    chatStream.innerHTML = combinedGroupChatLogs.length > 0 ? combinedGroupChatLogs.map(m => {
      const isAgent = AgentProfiles[m.sender] !== undefined;
      const matchedUser = isAgent ? null : allGlobalUsers.find(u => u.id === m.sender || u.name === m.sender);
      const senderName = isAgent ? AgentProfiles[m.sender].name : (matchedUser ? matchedUser.name : (m.senderName || (monitorMembersObj[m.sender] ? monitorMembersObj[m.sender].name : m.sender)));
      const color = isAgent ? AgentProfiles[m.sender].color : (matchedUser ? (matchedUser.color || '#2563eb') : (monitorMembersObj[m.sender] ? monitorMembersObj[m.sender].color : '#2563eb'));
      let rawText = m.text || '';
      let formattedText = '';
      if (rawText.includes('<button') || rawText.includes('<br>') || rawText.includes('<span')) {
        formattedText = rawText
          .replace(/(@[^\s@<]+)/g, '<span style="color:#2563eb; font-weight:700;">$1</span>')
          .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
      } else {
        let safeText = escapeHtml(rawText);
        formattedText = safeText
          .replace(/(@[^\s@]+)/g, '<span style="color:#2563eb; font-weight:700;">$1</span>')
          .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
      }
      return `
        <div style="background:#ffffff; padding:8px 12px; border-radius:8px; border:1px solid #e2e8f0; border-left:3px solid ${color}; box-shadow:0 1px 2px rgba(0,0,0,0.02); word-break:break-word; overflow-wrap:break-word; max-width:100%;">
          <div style="display:flex; justify-content:space-between; margin-bottom:3px; gap:6px;">
            <b style="color:${color}; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(senderName)}</b>
            <span style="color:#94a3b8; font-size:10px; flex-shrink:0;">${escapeHtml(formatChatDisplayTime(m._timeMs || m.timestamp))}</span>
          </div>
          <div style="color:#0f172a; line-height:1.5; word-break:break-word; overflow-wrap:break-word;">${formattedText}</div>
        </div>
      `;
    }).join('') : `
      <div style="text-align:center; padding:40px 16px; color:#94a3b8; font-size:12px;">⏳ 本小组暂无研讨发言记录</div>
    `;

    if (isNearBottom) {
      chatStream.scrollTop = chatStream.scrollHeight;
    }
  }
}

/* ==========================================================================
   7. TEACHER PORTAL RENDERER (LIVE WORKSPACE MIRROR & ANNOUNCEMENT READ MATRIX)
   ========================================================================== */
export function renderTeacherPortal(container, authManager, state, onLogout) {
  const oldLayout = container.querySelector('.teacher-portal-layout') || document.querySelector('.teacher-portal-layout');
  const savedScrollTop = oldLayout ? oldLayout.scrollTop : (state._teacherScrollTop || 0);
  const savedWinY = window.scrollY || window.pageYOffset || (document.documentElement && document.documentElement.scrollTop) || (state._teacherWinY || 0);

  if ('BroadcastChannel' in window) {
    try {
      if (window._teacherPortalBc) { try { window._teacherPortalBc.close(); } catch (e) {} }
      window._teacherPortalBc = new BroadcastChannel('jizhi_global_events');
      window._teacherPortalBc.onmessage = (e) => {
        if (!e.data || !e.data.type) return;
        if (['task_created', 'task_deleted', 'task_updated', 'task_extended'].includes(e.data.type)) {
          if (!document.querySelector('.modal-overlay')) {
            renderTeacherPortal(container, authManager, state, onLogout);
          }
        }
      };
    } catch (e) {}
  }

  if (authManager && authManager.sanitizeAndDeduplicateGroups) {
    authManager.sanitizeAndDeduplicateGroups();
  }
  const currentUser = authManager ? authManager.getCurrentUser() : null;
  const tasks = authManager ? authManager.getTasks() : [];
  const announcements = authManager ? authManager.getAnnouncements() : [];
  const refPapers = authManager ? authManager.getReferencePapers() : [];
  const classes = authManager ? authManager.getClasses() : [];
  const activeClassId = state.activeClassId || (classes[0] ? classes[0].id : null);
  const activeClass = classes.find(c => c.id === activeClassId) || classes[0] || null;
  const isDashboard = (state.teacherLevel === 'dashboard' || !activeClass);
  const dashboardTab = state.teacherDashboardTab || 'classes';
  const classTab = state.teacherClassTab || 'students_groups';
  const activeTab = isDashboard ? dashboardTab : classTab;

  // 💬 保存当前研讨流的滚动状态与贴底标志
  const chatScrollPositions = state._chatScrollPositions || {};
  container.querySelectorAll('.teacher-chat-stream').forEach(st => {
    if (st.id) {
      const isAtBottom = (st.scrollHeight - st.scrollTop - st.clientHeight) < 40;
      const streamKey = `${st.id}_${state.activeMonitorGroupId || (activeClass?.groups?.[0]?.id) || null}`;
      chatScrollPositions[streamKey] = {
        scrollTop: st.scrollTop,
        isAtBottom: isAtBottom
      };
    }
  });
  state._chatScrollPositions = chatScrollPositions;

  const allUsers = authManager.getUsers();
  const classStudents = activeClass ? authManager.getClassStudents(activeClass.id) : [];

  // 🛡️ 严格按当前班级隔离写作任务、通知与文献（支持全校通用广播与多班级分发）
  const currentClassTasks = activeClass ? tasks.filter(t => !t.classId || t.classId === 'all' || t.classId === activeClass.id || (t.className && t.className === activeClass.name) || (Array.isArray(t.targetClassIds) && (t.targetClassIds.includes('all') || t.targetClassIds.includes(activeClass.id)))) : [];
  const currentClassAnnouncements = activeClass ? announcements.filter(a => (!a.classId || a.classId === 'all' || a.classId === activeClass.id || (a.className && a.className === activeClass.name) || (Array.isArray(a.targetClassIds) && (a.targetClassIds.includes('all') || a.targetClassIds.includes(activeClass.id)))) && !a.isSystemAction && !a.isExtension && !a.title?.includes('延期') && !a.title?.includes('延长至')) : [];
  const currentClassPapers = activeClass ? refPapers.filter(p => (!p.classId || p.classId === 'all' || p.classId === activeClass.id || (p.className && p.className === activeClass.name) || (Array.isArray(p.targetClassIds) && (p.targetClassIds.includes('all') || p.targetClassIds.includes(activeClass.id))))) : [];

  const classTaskExists = currentClassTasks.some(t => t.id === state.activeTaskId);
  let effectiveMonitorTaskId = (state.activeTaskId && classTaskExists)
    ? state.activeTaskId
    : (currentClassTasks[0] ? currentClassTasks[0].id : null);
  state.activeTaskId = effectiveMonitorTaskId;
  if (window.app && window.app.state) window.app.state.activeTaskId = effectiveMonitorTaskId;

  const classGroupExists = (activeClass?.groups || []).some(g => g.id === state.activeMonitorGroupId);
  const activeMonitorGId = (state.activeMonitorGroupId && classGroupExists)
    ? state.activeMonitorGroupId
    : (activeClass?.groups && activeClass.groups[0] ? activeClass.groups[0].id : null);
  state.activeMonitorGroupId = activeMonitorGId;
  if (window.app && window.app.state) window.app.state.activeMonitorGroupId = activeMonitorGId;

  const activeMonitorGroup = (activeClass?.groups || []).find(g => g.id === activeMonitorGId) || (activeClass?.groups && activeClass.groups[0]) || null;
  const monitorMembersObj = (activeClass && activeMonitorGId) ? authManager.getGroupMembersForWorkspace(activeMonitorGId, activeClass.id) : {};
  const monitorMembersList = Object.values(monitorMembersObj);

  const monitorStageMode = state.teacherMonitorStageMode || state.monitorStageTab || 'auto';
  const effectiveMonitorStage = monitorStageMode === 'auto' ? (state.currentStage || 'stage1') : monitorStageMode;
  const currentS3Tab = state.stage3TeacherTab || 'defense';



  // ⚡ 教师端自动轻量轮询：自调度循环，杜绝并发拉取与 interval 重注册竞态
  const teacherPullAndRefresh = async () => {
    const curU = authManager.getCurrentUser();
    if (!curU || curU.role !== 'teacher') return; // 非教师即停止轮询
    if (document.querySelector('.modal-overlay')) {
      window._teacherPortalSyncTimer = setTimeout(teacherPullAndRefresh, 3000);
      return;
    }

    if (!isDashboard && (classTab === 'live_monitor' || classTab === 'live_monitoring') && window.app && window.app.cloudSyncEngine) {
      const currentCId = state.activeClassId || activeClass.id || null;
      let activeTaskId = state.activeTaskId || (currentClassTasks[0] ? currentClassTasks[0].id : '');
      const currentGId = state.activeMonitorGroupId || activeMonitorGId;
      window.app.cloudSyncEngine.groupId = currentGId;
      window.app.cloudSyncEngine.taskId = activeTaskId;
      window.app.cloudSyncEngine.effectiveClassId = currentCId;
      window.app.cloudSyncEngine.updateScopeKeys();

      const getPanoDigest = (p) => {
        if (!p || typeof p !== 'object') return '';
        return Object.entries(p).map(([gid, d]) => `${gid}:${d.currentStage || 'stage1'}:${d.onlineCount || 0}:${d.totalMembers || 0}:${d.isFinalSubmitted ? 1 : 0}:${(d.activeLocks || []).length}:${(d.chatLogs?.stage1 || []).length}:${(d.chatLogs?.stage2 || []).length}:${(d.chatLogs?.stage3 || []).length}:${d.stage1?.mergedTitle || ''}:${(d.stage1?.proposals || []).length}`).join('|');
      };

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
        panorama: getPanoDigest(state.monitorPanorama)
      });

      try {
        // 📝 针对阶段二/三，从 Etherpad 提取最新正文镜像（实时单源真值，支持 Hash 增量早退）
        const padName = `jizhi_${activeTaskId}_${currentGId}`;
        if (!state._lastEpHashMap) state._lastEpHashMap = {};
        if (!state._lastMonitorHashMap) state._lastMonitorHashMap = {};
        const isGroupSwitched = (state._lastActiveGId !== currentGId);
        state._lastActiveGId = currentGId;

        let padTextChanged = isGroupSwitched;
        let latestPadText = state.stage2?.unifiedContent || '';

        if (state.currentStage === 'stage2' || state.currentStage === 'stage3') {
          const lastEpHash = isGroupSwitched ? '' : (state._lastEpHashMap[padName] || '');
          const epRes = await fetch(`sync.php?action=get_pad_html&padId=${encodeURIComponent(padName)}&clientHash=${encodeURIComponent(lastEpHash)}`).then(r => r.json()).catch(() => null);
          if (epRes && epRes.hash) {
            if (state._lastEpHashMap[padName] !== epRes.hash) {
              state._lastEpHashMap[padName] = epRes.hash;
              padTextChanged = true;
            }
          }
          if (epRes && epRes.success && !epRes.unchanged && (epRes.html || epRes.text)) {
            latestPadText = epRes.html || epRes.text;
            if (!state.stage2) state.stage2 = {};
            state.stage2.unifiedContent = latestPadText;
            padTextChanged = true;
          }
        }

        const curT = authManager.getCurrentUser();
        const tToken = (curT && (curT.activeSessionId || curT.token)) || '';
        const tId = (curT && (curT.id)) || '';
        const lastHash = isGroupSwitched ? '' : (state._lastMonitorHashMap[currentGId] || '');
        const panRes = await fetch(`sync.php?action=get_teacher_monitor_all_groups&activeGroupId=${encodeURIComponent(currentGId)}&taskId=${encodeURIComponent(activeTaskId)}&classId=${encodeURIComponent(currentCId)}&userId=${encodeURIComponent(tId)}&token=${encodeURIComponent(tToken)}&clientHash=${encodeURIComponent(lastHash)}`).then(r => r.json()).catch(() => null);
        if (panRes && panRes.success && panRes.groups) {
          state.monitorPanorama = panRes.groups;
          if (panRes.hash) state._lastMonitorHashMap[currentGId] = panRes.hash;

          // 🎯 核心修复：以 Etherpad 权威最新正文为主，杜绝被旧版全量快照覆盖
          const currentGroupData = getPanoGroupData(panRes.groups, currentGId);
          if (currentGroupData) {
            state.stage1 = currentGroupData.stage1 || { proposals: [], votes: {}, hasVoted: {}, contract: {} };
            const finalUnifiedText = latestPadText || state.stage2?.unifiedContent || currentGroupData.stage2?.unifiedContent || '';
            state.stage2 = {
              ...(currentGroupData.stage2 || {}),
              ...(state.stage2 || {}),
              unifiedContent: finalUnifiedText
            };
            state.stage3 = currentGroupData.stage3 || { feedbackItems: [] };
            state.chatLogs = currentGroupData.chatLogs || { stage1: [], stage2: [], stage3: [] };
            state.currentStage = currentGroupData.currentStage || 'stage1';
            state.isFinalSubmitted = !!currentGroupData.isFinalSubmitted;
          }

          // ⚡ 仅当数据指纹真实发生变化时，才刷新监控视图
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
            chat3: (state.chatLogs?.stage3 || []).length,
            panorama: getPanoDigest(state.monitorPanorama)
          });

          if (newFingerprint !== oldFingerprint || padTextChanged) {
            const layout = container.querySelector('.teacher-portal-layout');
            const curScroll = layout ? layout.scrollTop : 0;
            state._teacherScrollTop = curScroll;
            renderTeacherPortal(container, authManager, state, onLogout);
            const nextLayout = container.querySelector('.teacher-portal-layout');
            if (nextLayout) nextLayout.scrollTop = curScroll;
            return;
          }
        } else if (padTextChanged) {
          const layout = container.querySelector('.teacher-portal-layout');
          const curScroll = layout ? layout.scrollTop : 0;
          state._teacherScrollTop = curScroll;
          renderTeacherPortal(container, authManager, state, onLogout);
          const nextLayout = container.querySelector('.teacher-portal-layout');
          if (nextLayout) nextLayout.scrollTop = curScroll;
          return;
        }
      } catch (e) {
        console.warn('[TeacherMonitor] 监控拉取警告:', e);
      }
    }

    if (authManager && authManager.pullGlobalMeta) {
      try {
        const oldVer = authManager.globalMetaVersion || 0;
        const oldTasksJson = localStorage.getItem(STORAGE_KEY_TASKS) || '[]';
        const oldClassesJson = localStorage.getItem(STORAGE_KEY_CLASSES) || '[]';
        const oldUsersJson = localStorage.getItem(STORAGE_KEY_USERS_DB) || '[]';
        const oldAnnsJson = localStorage.getItem(STORAGE_KEY_ANNOUNCEMENTS) || '[]';
        await authManager.pullGlobalMeta();
        const newVer = authManager.globalMetaVersion || 0;
        const newTasksJson = localStorage.getItem(STORAGE_KEY_TASKS) || '[]';
        const newClassesJson = localStorage.getItem(STORAGE_KEY_CLASSES) || '[]';
        const newUsersJson = localStorage.getItem(STORAGE_KEY_USERS_DB) || '[]';
        const newAnnsJson = localStorage.getItem(STORAGE_KEY_ANNOUNCEMENTS) || '[]';
        if (oldVer !== newVer || oldTasksJson !== newTasksJson || oldClassesJson !== newClassesJson || oldUsersJson !== newUsersJson || oldAnnsJson !== newAnnsJson) {
          if (document.querySelector('.modal-overlay') || document.querySelector('#modal-extend-deadline')) {
            // 延缓至弹窗关闭后再刷
          } else {
            const layout = container.querySelector('.teacher-portal-layout');
            const curScroll = layout ? layout.scrollTop : 0;
            state._teacherScrollTop = curScroll;
            renderTeacherPortal(container, authManager, state, onLogout);
            const nextLayout = container.querySelector('.teacher-portal-layout');
            if (nextLayout) nextLayout.scrollTop = curScroll;
            return;
          }
        }
      } catch (e) {}
    }

    // ⚡ 教师同屏实时监控模式下，保持 1.8 秒极速刷新，后台窗口保持 6.0 秒
    const tInterval = document.hidden ? 6000 : 1800;
    window._teacherPortalSyncTimer = setTimeout(teacherPullAndRefresh, tInterval);
  };
  if (window._teacherPortalSyncTimer) clearTimeout(window._teacherPortalSyncTimer);

  window._lastTeacherActivity = Date.now();
  const markTeacherActive = () => {
    const wasIdle = (Date.now() - window._lastTeacherActivity > 60000);
    window._lastTeacherActivity = Date.now();
    if (wasIdle && !isDashboard && (classTab === 'live_monitor' || classTab === 'live_monitoring')) {
      teacherPullAndRefresh();
    }
  };
  ['mousemove', 'keydown', 'touchstart', 'scroll', 'click'].forEach(evt => {
    window.addEventListener(evt, markTeacherActive, { passive: true });
  });

  if (!window._teacherVisibilityHandlerAttached) {
    window._teacherVisibilityHandlerAttached = true;
    const triggerTeacherImmediate = () => {
      if (!isDashboard && (classTab === 'live_monitor' || classTab === 'live_monitoring')) {
        if (window._teacherPortalSyncTimer) clearTimeout(window._teacherPortalSyncTimer);
        teacherPullAndRefresh();
      }
    };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') triggerTeacherImmediate();
    });
    window.addEventListener('focus', triggerTeacherImmediate);
  }

  if (!window._teacherWheelHandlerAttached) {
    window._teacherWheelHandlerAttached = true;
    window.addEventListener('wheel', (e) => {
      const layout = document.getElementById('teacher-portal-layout');
      if (!layout) return;
      const target = e.target;
      if (target && target.closest) {
        if (target.closest('#teacher-unified-chat-stream')) return;
        if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.tagName === 'SELECT') return;
      }
      if (layout.scrollHeight > layout.clientHeight) {
        layout.scrollTop += e.deltaY;
      }
    }, { passive: true });
  }

  const tInitInterval = (document.hidden ? 6000 : 1800);
  window._teacherPortalSyncTimer = setTimeout(teacherPullAndRefresh, tInitInterval);

  const allStudents = allUsers.filter(u => u.role !== 'teacher');

  const existingLayout = container.querySelector('#teacher-portal-layout');
  const isSameClass = container.dataset.renderedClassId === activeClassId;
  const isSameTab = container.dataset.renderedTab === classTab;
  const isSameMonitorGroup = container.dataset.renderedGroupId === activeMonitorGId;
  const isSameMonitorTask = container.dataset.renderedTaskId === effectiveMonitorTaskId;
  const isSameMonitorStage = container.dataset.renderedStage === effectiveMonitorStage;
  const isSameMode = container.dataset.renderedMode === monitorStageMode;
  const isSameS3Tab = container.dataset.renderedS3Tab === currentS3Tab;

  if (existingLayout && !isDashboard && classTab === 'live_monitor' && isSameClass && isSameTab && isSameMonitorGroup && isSameMonitorTask && isSameMonitorStage && isSameMode && isSameS3Tab) {
    const monitorTaskObj = currentClassTasks.find(t => t.id === effectiveMonitorTaskId) || (currentClassTasks[0] || null);
    const isMonitorTaskExpired = isTaskExpired(monitorTaskObj);
    const genreCfg = TASK_GENRE_CONFIGS[monitorTaskObj?.taskType || 'experiment'] || TASK_GENRE_CONFIGS.experiment;
    const actualStage = state.currentStage || 'stage1';

    updateTeacherLiveMonitorInPlace(container, state, authManager, activeClass, activeMonitorGroup, monitorTaskObj, genreCfg, monitorMembersList, monitorMembersObj, actualStage, effectiveMonitorStage, isMonitorTaskExpired);
    return;
  }

  container.innerHTML = `
    <div class="teacher-portal-layout" id="teacher-portal-layout" style="height:100vh; background:#f0f4f9; padding:0; display:flex; flex-direction:column;">
      
      <!-- 🏛️ 1. 全局顶部导航栏 -->
      <header class="teacher-header" style="padding:16px 32px; background:#ffffff; border-bottom:1px solid #e2e8f0; width:100%; flex-shrink:0; box-shadow:0 1px 3px rgba(15,23,42,0.04); display:flex; justify-content:space-between; align-items:center;">
        <div class="brand-section" style="display:flex; align-items:center; gap:14px;">
          ${!isDashboard ? `
            <button id="btn-back-to-dashboard" style="background:#eff6ff; border:1.5px solid #bfdbfe; color:#1d4ed8; padding:7px 14px; border-radius:8px; font-size:13px; font-weight:800; cursor:pointer; display:flex; align-items:center; gap:6px;" title="返回班级大厅">
              <span>← 返回班级大厅</span>
            </button>
            <div style="height:20px; width:1.5px; background:#cbd5e1;"></div>
            <div style="font-size:16px; font-weight:800; color:#0f172a; display:flex; align-items:center; gap:8px;">
              <span>🏫 ${escapeHtml(activeClass.name)}</span>
              <span style="background:#dcfce7; color:#15803d; border:1px solid #bbf7d0; padding:2px 8px; border-radius:6px; font-size:11.5px; font-weight:700;">教学空间</span>
            </div>
          ` : `
            <div class="brand-logo" style="font-size:22px; font-weight:800; background:linear-gradient(135deg, #1e40af, #2563eb); -webkit-background-clip:text; -webkit-text-fill-color:transparent; display:flex; align-items:baseline; gap:8px;">集智 JIZHI 教学总控大厅 <span style="font-size:11px; font-weight:700; color:#94a3b8; font-family:monospace;" title="系统版本号">${APP_VERSION}</span></div>
          `}
        </div>
        <div class="teacher-info" style="display:flex; align-items:center; gap:14px;">
          <span style="font-size:13.5px; color:#334155;">教师: <b>${currentUser ? escapeHtml(currentUser.name) : '老师'}</b></span>
          <button id="btn-teacher-change-pwd" style="background:#f0fdf4; border:1px solid #bbf7d0; color:#16a34a; padding:6px 14px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:6px;" title="修改登录密码">
            <span>🔑 修改密码</span>
          </button>
          <button id="btn-logout" class="header-icon-btn logout" style="background:#fef2f2; color:#dc2626; border:1px solid #fecaca; padding:8px 16px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer;">🚪 退出登录</button>
        </div>
      </header>

      ${isDashboard ? `
        <!-- 🏛️ 一级总控大厅导航标签（我的教学班级 vs 全平台学生总库） -->
        <div style="padding:16px 32px 0 32px; background:#f0f4f9; width:100%; flex-shrink:0;">
          <div style="display:flex; gap:12px; width:100%; background:#ffffff; padding:6px; border-radius:14px; border:1px solid #e2e8f0; box-shadow:0 2px 8px rgba(15,23,42,0.04);">
            <button class="teacher-dtab-nav ${dashboardTab === 'classes' ? 'active' : ''}" data-dtab="classes" style="flex:1; padding:12px; border-radius:10px; font-size:14px; font-weight:800; cursor:pointer; border:none; color:${dashboardTab === 'classes' ? 'white' : '#475569'}; background:${dashboardTab === 'classes' ? 'linear-gradient(135deg, #1d4ed8, #2563eb)' : '#f8fafc'}; transition:all 0.2s ease;">
              🏫 教学班级空间 (${classes.length} 个教学班)
            </button>
            <button class="teacher-dtab-nav ${dashboardTab === 'global_students' ? 'active' : ''}" data-dtab="global_students" style="flex:1; padding:12px; border-radius:10px; font-size:14px; font-weight:800; cursor:pointer; border:none; color:${dashboardTab === 'global_students' ? 'white' : '#475569'}; background:${dashboardTab === 'global_students' ? 'linear-gradient(135deg, #1d4ed8, #2563eb)' : '#f8fafc'}; transition:all 0.2s ease;">
              👥 平台学生账号总库 (${allStudents.length} 名学生)
            </button>
          </div>
        </div>

        <main style="flex:1; padding:20px 32px 40px 32px; width:100%; overflow-y:visible;">
          ${dashboardTab === 'classes' ? `
            <div class="card" style="border-top:4px solid #2563eb; width:100%; padding:24px;">
              <div class="card-title" style="margin-bottom:16px; display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:17px; font-weight:800; color:#0f172a;">🏫 我的教学班级列表 (${classes.length} 个班级)</span>
                <button id="btn-v1-create-class" class="teacher-action-btn btn-trigger-create-class" style="background:linear-gradient(135deg, #1d4ed8, #2563eb); border:none; color:white; padding:8px 18px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; box-shadow:0 2px 8px rgba(37,99,235,0.25);">+ 创建全新教学班</button>
              </div>

              ${classes.length === 0 ? `
                <div style="background:#ffffff; border:2px dashed #cbd5e1; border-radius:16px; padding:36px 24px; text-align:center; box-shadow:0 1px 3px rgba(15,23,42,0.02);">
                  <div style="font-size:42px; margin-bottom:10px;">🏫</div>
                  <h3 style="margin:0 0 8px 0; font-size:17px; font-weight:800; color:#0f172a;">欢迎使用集智协作教学平台！您当前尚未创建任何教学班级</h3>
                  <p style="font-size:13px; color:#64748b; margin:0 auto 18px; max-width:480px; line-height:1.6;">
                    请点击下方按钮创建您的第一个教学班级（例如：<b>《现代教育技术》2026春01班</b>），创建后即可进入该班级教学工作台，导入学生名册、划分协作小组与发布写作任务。
                  </p>
                  <button id="btn-v1-create-class-zero" class="teacher-action-btn btn-trigger-create-class" style="background:linear-gradient(135deg, #1d4ed8, #2563eb); border:none; color:white; padding:10px 24px; border-radius:8px; font-size:13.5px; font-weight:800; cursor:pointer; box-shadow:0 4px 12px rgba(37,99,235,0.25);">
                    ➕ 立即创建第一个教学班级
                  </button>
                </div>
              ` : `
                <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(360px, 1fr)); gap:18px;">
                  ${classes.map(c => {
                    const cStds = authManager.getClassStudents(c.id);
                    const cTasks = tasks.filter(t => t.classId === c.id || (t.targetClassIds && t.targetClassIds.includes(c.id)));
                    return `
                      <div style="background:#ffffff; border:1.5px solid #e2e8f0; border-radius:14px; padding:20px; display:flex; flex-direction:column; justify-content:space-between; gap:14px; box-shadow:0 2px 6px rgba(15,23,42,0.04); transition:all 0.15s ease;">
                        <div>
                          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                            <div style="font-size:17px; font-weight:800; color:#1e40af;">🏫 ${escapeHtml(c.name)}</div>
                            <button class="btn-delete-class" data-id="${c.id}" data-name="${c.name}" style="background:#fef2f2; border:1px solid #fecaca; color:#dc2626; padding:4px 8px; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer;" title="删除此教学班级">🗑️</button>
                          </div>
                          <div style="display:flex; gap:12px; font-size:13px; color:#64748b; background:#f8fafc; padding:8px 12px; border-radius:8px; border:1px solid #e2e8f0;">
                            <span>👥 学生: <b style="color:#0f172a;">${cStds.length}</b> 人</span>
                            <span>🧩 小组: <b style="color:#0f172a;">${(c.groups || []).length}</b> 个</span>
                            <span>📝 任务: <b style="color:#0f172a;">${cTasks.length}</b> 项</span>
                          </div>
                        </div>
                        <button class="btn-enter-class" data-id="${c.id}" style="background:linear-gradient(135deg, #1d4ed8, #2563eb); color:white; border:none; padding:10px 16px; border-radius:8px; font-size:13.5px; font-weight:800; cursor:pointer; width:100%; display:flex; justify-content:center; align-items:center; gap:6px; box-shadow:0 2px 8px rgba(37,99,235,0.25);">
                          <span>🚀 进入班级教学工作台</span>
                        </button>
                      </div>
                    `;
                  }).join('')}
                </div>
              `}
            </div>
          ` : `
            <!-- 👥 全平台学生总库看板 -->
            <div class="card" style="border-top:4px solid #2563eb; width:100%; padding:24px;">
              <div class="card-title" style="margin-bottom:16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
                <div>
                  <span style="font-size:17px; font-weight:800; color:#0f172a;">👥 全平台学生账号总库 (${allStudents.length} 名学生)</span>
                  <div style="font-size:12.5px; color:#64748b; margin-top:2px;">管理系统全量学生、跨班归属查询、密码重置与批量注销</div>
                </div>
                <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                  <button id="btn-global-add-student" class="teacher-action-btn" style="background:linear-gradient(135deg, #1d4ed8, #2563eb); border:none; color:white; padding:8px 16px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; box-shadow:0 2px 8px rgba(37,99,235,0.25);">+ 单条添加学生</button>
                  <button id="btn-global-import-file" class="teacher-action-btn" style="background:linear-gradient(135deg, #1d4ed8, #2563eb); border:none; color:white; padding:8px 16px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; box-shadow:0 2px 8px rgba(37,99,235,0.25);">📥 批量导入学生 (Excel/CSV/粘贴)</button>
                  <button id="btn-batch-purge-global" style="background:#fef2f2; border:1.5px solid #fecaca; color:#dc2626; padding:8px 16px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer;">🗑️ 批量彻底删除所选</button>
                </div>
              </div>

              <div style="margin-bottom:14px; display:flex; gap:12px; align-items:center;">
                <input type="text" id="input-search-global-table" placeholder="🔍 快速按学生姓名或学号搜索全校学生..." style="flex:1; background:#ffffff; border:1.5px solid #cbd5e1; padding:9px 14px; border-radius:8px; font-size:13.5px; outline:none;">
                <label style="display:flex; align-items:center; gap:6px; font-size:13px; font-weight:700; color:#334155; cursor:pointer; white-space:nowrap; background:#f8fafc; border:1px solid #cbd5e1; padding:8px 12px; border-radius:8px;">
                  <input type="checkbox" id="chk-global-select-all" style="width:16px; height:16px; accent-color:#2563eb; cursor:pointer;">
                  全选当前结果
                </label>
              </div>

              <div style="border:1px solid #e2e8f0; border-radius:10px; overflow:hidden; background:#ffffff;">
                <table class="monitor-table" style="font-size:13px;">
                  <thead>
                    <tr>
                      <th style="width:45px;">选</th>
                      <th>序号</th>
                      <th>姓名</th>
                      <th>学号 (唯一标识)</th>
                      <th>跨班归属</th>
                      <th>密码状态</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody id="tbody-global-students">
                    ${allStudents.length === 0 ? '<tr><td colspan="7" style="text-align:center; color:#64748b; padding:32px;">平台当前暂无任何学生账号记录</td></tr>' : ''}
                    ${allStudents.map((s, idx) => {
                      const studentClasses = classes.filter(c => (s.classIds || [s.classId]).includes(c.id));
                      return `
                        <tr class="global-std-tr" data-search="${(s.name + ' ' + s.id).toLowerCase()}">
                          <td><input type="checkbox" class="chk-global-std" data-uid="${s.id}" style="width:16px; height:16px; accent-color:#2563eb; cursor:pointer;"></td>
                          <td style="color:#94a3b8; font-weight:700;">${idx + 1}</td>
                          <td><b>${s.avatar || '👤'} ${escapeHtml(s.name)}</b></td>
                          <td><code style="color:#2563eb; font-family:monospace; font-weight:700;">${escapeHtml(s.id)}</code></td>
                          <td>
                            ${studentClasses.length > 0 ? studentClasses.map(c => `<span style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; padding:2px 8px; border-radius:6px; font-size:11.5px; font-weight:700; margin-right:4px;">${escapeHtml(c.name)}</span>`).join('') : '<span style="color:#94a3b8;">⏳ 待分班学生</span>'}
                          </td>
                          <td>${(!s.password || s.password === '123') ? '<span style="color:#059669; font-weight:700;">初始 123</span>' : '<span style="color:#7c3aed; font-weight:700;">已修改密码</span>'}</td>
                          <td>
                            <div style="display:flex; gap:6px;">
                              <button class="reset-student-pwd-btn" data-account="${s.id}" data-name="${s.name}" style="background:#eff6ff; border:1px solid #bfdbfe; color:#2563eb; padding:4px 8px; border-radius:6px; font-size:12px; cursor:pointer; font-weight:700;">🔑 重置为123</button>
                              <button class="purge-student-btn" data-id="${s.id}" data-name="${s.name}" style="background:#fef2f2; border:1px solid #fecaca; color:#dc2626; padding:4px 8px; border-radius:6px; font-size:12px; cursor:pointer; font-weight:700;">🗑️ 彻底销毁</button>
                            </div>
                          </td>
                        </tr>
                      `;
                    }).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          `}
        </main>
      ` : `
        <!-- 📂 二级班级专属空间导航标签（3大核心 Tab） -->
        <div style="padding:16px 32px 0 32px; background:#f0f4f9; width:100%; flex-shrink:0;">
          <div style="display:flex; gap:12px; width:100%; background:#ffffff; padding:6px; border-radius:14px; border:1px solid #e2e8f0; box-shadow:0 2px 8px rgba(15,23,42,0.04);">
            <button class="teacher-ctab-nav ${classTab === 'students_groups' ? 'active' : ''}" data-ctab="students_groups" style="flex:1; padding:12px; border-radius:10px; font-size:14px; font-weight:800; cursor:pointer; border:none; color:${classTab === 'students_groups' ? 'white' : '#475569'}; background:${classTab === 'students_groups' ? 'linear-gradient(135deg, #1d4ed8, #2563eb)' : '#f8fafc'}; transition:all 0.2s ease;">
              👥 班级名册与分组 (${classStudents.length} 人 · ${(activeClass.groups || []).length} 组)
            </button>
            <button class="teacher-ctab-nav ${classTab === 'tasks_resources' ? 'active' : ''}" data-ctab="tasks_resources" style="flex:1; padding:12px; border-radius:10px; font-size:14px; font-weight:800; cursor:pointer; border:none; color:${classTab === 'tasks_resources' ? 'white' : '#475569'}; background:${classTab === 'tasks_resources' ? 'linear-gradient(135deg, #1d4ed8, #2563eb)' : '#f8fafc'}; transition:all 0.2s ease;">
              📝 任务与教学资料 (${currentClassTasks.length} 项任务 · ${currentClassPapers.length} 篇范文)
            </button>
            <button class="teacher-ctab-nav ${classTab === 'live_monitor' ? 'active' : ''}" data-ctab="live_monitor" style="flex:1; padding:12px; border-radius:10px; font-size:14px; font-weight:800; cursor:pointer; border:none; color:${classTab === 'live_monitor' ? 'white' : '#475569'}; background:${classTab === 'live_monitor' ? 'linear-gradient(135deg, #1d4ed8, #2563eb)' : '#f8fafc'}; transition:all 0.2s ease;">
              📊 课堂实时大屏监控
            </button>
          </div>
        </div>

        <main style="flex:1; padding:20px 32px 40px 32px; width:100%; overflow-y:visible;">
          ${classTab === 'students_groups' ? `
            <div style="display:flex; flex-direction:column; gap:20px; width:100%;">
              <!-- 1. 本班学生名册管理 -->
              <div class="card" style="border-top:4px solid #2563eb; width:100%; padding:24px;">
                <div class="card-title" style="margin-bottom:16px;">
                  <span style="font-size:17px; font-weight:800; color:#0f172a;">👨‍🎓 学生名册管理 (当前班级: ${activeClass.name})</span>
                  <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                    <button id="btn-v1-add-student" class="teacher-action-btn" style="background:linear-gradient(135deg, #1d4ed8, #2563eb); border:none; color:white; padding:8px 16px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; box-shadow:0 2px 8px rgba(37,99,235,0.25);">+ 单条创建学生账号</button>
                    <button id="btn-v1-enroll-existing-student" class="teacher-action-btn" style="background:#eff6ff; border:1.5px solid #bfdbfe; color:#1d4ed8; padding:8px 16px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer;">👥 从总库勾选拉入本班</button>
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
                  <div>💡 <b>密码说明：</b> 创建学生时可指定自定义密码（留空统一定为 <code style="color:#059669; font-weight:700;">123</code>）。建立后直接放入本班学生名册。</div>
                  <span style="color:#2563eb; font-weight:800; font-size:13.5px;">本班学生: ${classStudents.length} 人</span>
                </div>
                <div style="border:1px solid #e2e8f0; border-radius:10px; overflow:hidden; background:#ffffff;">
                  <table class="monitor-table" style="font-size:13px;">
                    <thead><tr><th>序号</th><th>姓名</th><th>学号</th><th>当前归属小组</th><th>密码状态</th><th>操作</th></tr></thead>
                    <tbody>
                      ${classStudents.length === 0 ? '<tr><td colspan="6" style="text-align:center; color:#64748b; padding:24px;">当前班级暂无学生账号，请点击右上角按钮创建或导入！</td></tr>' : ''}
                      ${(() => {
                        const _nameBuckets = {};
                        classStudents.forEach(s => { const _n = (s.name || '').trim(); if (!_n) return; (_nameBuckets[_n] = _nameBuckets[_n] || []).push(s); });
                        const _escAttr = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                        return classStudents.map((s, idx) => {
                          const grp = (activeClass.groups || []).find(g => g.members && (g.members.includes(s.id) || (typeof g.members[0] === 'object' && g.members.some(m => m && (m.id === s.id)))));
                          const stdAcc = s.id;
                          const _dupPeers = (_nameBuckets[(s.name || '').trim()] || []).filter(x => x !== s);
                          const _dupBadge = _dupPeers.length > 0 ? `<span title="${_escAttr('⚠️ 有同名同学：' + _dupPeers.map(x => x.name + '（' + x.id + '）').join(' / '))}" style="margin-left:6px; background:#fef3c7; border:1px solid #fcd34d; color:#b45309; padding:1px 7px; border-radius:999px; font-size:11px; font-weight:700; cursor:help;">⚠️ 同名 ${_dupPeers.length + 1} 人</span>` : '';
                          return `
                            <tr>
                              <td style="color:#94a3b8; font-weight:700;">${idx + 1}</td>
                              <td><b>${s.avatar || '👤'} ${escapeHtml(s.name)}</b>${_dupBadge}</td>
                              <td><span style="color:#2563eb; font-family:monospace; font-weight:700;">${escapeHtml(stdAcc)}</span></td>
                              <td>${grp ? `<span style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; padding:2px 8px; border-radius:8px; font-size:12px; font-weight:700;">${escapeHtml(grp.name)}</span>` : '<span style="color:#94a3b8;">⏳ 待划分小组</span>'}</td>
                              <td>${(!s.password || s.password === '123') ? '<span style="color:#059669; font-family:monospace; font-weight:700;">初始 123</span>' : '<span style="color:#7c3aed; font-family:monospace; font-weight:700;">已修改密码</span>'}</td>
                              <td>
                                <div style="display:flex; gap:6px; align-items:center;">
                                  <button class="reset-student-pwd-btn" data-account="${stdAcc}" data-name="${s.name}" style="background:#eff6ff; border:1px solid #bfdbfe; color:#2563eb; padding:4px 10px; border-radius:6px; font-size:12px; cursor:pointer; font-weight:700;" title="将此学生登录密码重置为 123">
                                    🔑 重置为123
                                  </button>
                                  <button class="delete-student-btn" data-id="${s.id}" style="background:#fef2f2; border:1px solid #fecaca; color:#dc2626; padding:4px 10px; border-radius:6px; font-size:12px; cursor:pointer; font-weight:700;" title="从本班移出 (账号仍保留在平台总库)">
                                    移出本班
                                  </button>
                                </div>
                              </td>
                            </tr>
                          `;
                        }).join('');
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>

              <!-- 2. 本班协作小组划分 -->
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
                        const mId = (typeof m === 'object' && m !== null) ? (m.id || m.userId ) : m;
                        return mId === s.id;
                      }));
                      return groupMembers.length > 0;
                    });

                    validGroups.forEach((g, idx) => { g.name = `第 ${idx + 1} 协作小组`; });

                    if (validGroups.length !== (activeClass.groups || []).length) {
                      activeClass.groups = validGroups;
                      localStorage.setItem(STORAGE_KEY_CLASSES, JSON.stringify(classes));
                      setTimeout(() => authManager.pushGlobalMeta(), 100);
                    }

                    if (validGroups.length === 0) {
                      return '<div style="color:#64748b; padding:20px; font-size:14px;">当前班级暂无小组。</div>';
                    }

                    return validGroups.map(grp => {
                      const groupMembers = classStudents.filter(s => (grp.members || []).some(m => {
                        const mId = (typeof m === 'object' && m !== null) ? (m.id || m.userId ) : m;
                        return mId === s.id;
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
                                ${m.avatar || '👤'} ${escapeHtml(m.name)}
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

        ${!isDashboard && classTab === 'tasks_resources' ? (() => {
          if (!activeClass) {
            return `
              <div class="card" style="border:1.5px dashed #cbd5e1; background:#ffffff; border-radius:16px; padding:48px 24px; text-align:center; box-shadow:0 1px 3px rgba(15,23,42,0.02);">
                <div style="font-size:42px; margin-bottom:10px;">📢</div>
                <h3 style="margin:0 0 8px 0; font-size:17px; font-weight:800; color:#0f172a;">暂无可用教学班级</h3>
                <p style="font-size:13px; color:#64748b; margin:0 auto 18px; max-width:420px; line-height:1.6;">
                  请先前往【班级大厅】创建您的教学班级，随后即可在此为班级发布协作任务、配置问卷链接与发布即时广播通知。
                </p>
              </div>
            `;
          }
          const currentClassTasks = tasks.filter(t => !t.classId || t.classId === 'all' || t.classId === activeClass.id || (t.className && t.className === activeClass.name) || (Array.isArray(t.targetClassIds) && (t.targetClassIds.includes('all') || t.targetClassIds.includes(activeClass.id))));
          const currentClassAnnouncements = announcements.filter(a => (!a.classId || a.classId === 'all' || a.classId === activeClass.id || (a.className && a.className === activeClass.name) || (Array.isArray(a.targetClassIds) && (a.targetClassIds.includes('all') || a.targetClassIds.includes(activeClass.id)))) && !a.isSystemAction && !a.isExtension && !a.title?.includes('延期') && !a.title?.includes('延长至'));
          const currentClassPapers = refPapers.filter(p => (!p.classId || p.classId === 'all' || p.classId === activeClass.id || (p.className && p.className === activeClass.name) || (Array.isArray(p.targetClassIds) && (p.targetClassIds.includes('all') || p.targetClassIds.includes(activeClass.id)))));

          const surveysList = authManager.getSurveysList();
          const currentSelectedSurveyUrl = authManager.getSurveyUrl(activeClass.id, currentClassTasks[0] ? currentClassTasks[0].id : '');

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
                  const genreCfg = TASK_GENRE_CONFIGS[t.taskType || 'experiment'] || TASK_GENRE_CONFIGS.experiment;
                  return `
                  <div style="background:#ffffff; border:1.5px solid ${isExpired ? '#fca5a5' : '#e2e8f0'}; padding:18px; border-radius:12px; box-shadow:0 1px 3px rgba(15,23,42,0.03);">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                      <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                        <span style="background:${isExpired ? 'linear-gradient(135deg, #ef4444, #dc2626)' : 'linear-gradient(135deg, #1d4ed8, #2563eb)'}; color:#ffffff; padding:3px 10px; border-radius:8px; font-size:12px; font-weight:800;">任务 ${taskSeqNum}${isLatest ? ' (最新)' : ''}</span>
                        <span style="font-size:16px; font-weight:800; color:#1e40af;">📌 ${t.title}</span>
                        <span style="background:#f0fdf4; color:#15803d; border:1px solid #bbf7d0; padding:2px 8px; border-radius:8px; font-size:11.5px; font-weight:700;">${genreCfg.icon} ${genreCfg.label}</span>
                        <span style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; padding:2px 8px; border-radius:8px; font-size:11.5px; font-weight:700;">受众班级: ${t.className}</span>
                        ${isExpired ? `
                          <span style="background:#fef2f2; color:#dc2626; border:1px solid #fecaca; padding:2px 8px; border-radius:8px; font-size:11.5px; font-weight:800;">🛑 已截止 · 正文只读</span>
                        ` : `
                          <span style="background:#ecfdf5; color:#059669; border:1px solid #a7f3d0; padding:2px 8px; border-radius:8px; font-size:11.5px; font-weight:700;">🟢 开放撰写中</span>
                        `}
                      </div>
                      <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                        <span style="font-size:12px; color:#64748b; margin-right:4px;">🕒 发布时间: <b>${formatStandardDateDash(t.createdAt || t.startTime) || '刚刚'}</b></span>
                        <button class="btn-export-task-chat-all" data-id="${t.id}" data-title="${t.title}" data-class="${t.classId || activeClass.id}" style="background:linear-gradient(135deg, #059669, #10b981); border:none; color:white; padding:5px 12px; border-radius:6px; font-size:12.5px; font-weight:700; cursor:pointer; box-shadow:0 2px 6px rgba(16,185,129,0.25); display:inline-flex; align-items:center; gap:4px;" title="一键导出该任务全班各小组独立研讨记录表 (分文件)">
                          📥 导出全班研讨
                        </button>
                        <button class="btn-extend-task-deadline" data-id="${t.id}" data-title="${t.title}" data-deadline="${t.deadline || ''}" data-duration="${t.durationMinutes || 150}" style="background:linear-gradient(135deg, #0284c7, #0ea5e9); border:none; color:white; padding:5px 12px; border-radius:6px; font-size:12.5px; font-weight:700; cursor:pointer; box-shadow:0 2px 6px rgba(2,132,199,0.25);" title="自由调整该任务截止时间（支持延期与提前回退）">
                          ⏱️ 调整时间
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
                      <span>🎯 <b>目标字数:</b> <span style="color:#059669; font-weight:800;">${t.targetWordCount || 3000} 字</span></span>
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
                  const allClassGroups = (activeClass && activeClass.groups && activeClass.groups.length > 0)
                    ? activeClass.groups
                    : [];

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
                              const mId = (typeof m === 'object' && m !== null) ? m.id : m;
                              const mName = (typeof m === 'object' && m !== null) ? m.name : null;
                              const uObj = mId ? allUsers.find(u => u.id === mId || u.name === mId) : null;
                              const uName = (uObj ? uObj.name : null) || mName || (typeof mId === 'string' && !mId.startsWith('u_') ? mId : null);

                              const hasRead = a.readStatus && (
                                (mId && a.readStatus[mId]) ||
                                (uObj && uObj.id && a.readStatus[uObj.id]) ||
                                (uObj && uObj.name && a.readStatus[uObj.name])
                              );
                              const inConfirmedList = (a.confirmedMembers || []).some(cm => cm && (
                                (mId && cm.id === mId) ||
                                (uObj && (cm.id === uObj.id || cm.name === uObj.name)) ||
                                (uName && cm.name === uName)
                              ));

                              if ((hasRead || inConfirmedList) && uName && !memberConfirmedNames.includes(uName)) {
                                memberConfirmedNames.push(uName);
                              }
                            });

                            // 2. 遍历 confirmedMembers 中明确属于该组的学生
                            (a.confirmedMembers || []).forEach(m => {
                              if (m && (m.groupId === g.id || m.groupId === g.name || m.groupId === g.groupId)) {
                                const showName = m.name || '学生';
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

        ${!isDashboard && classTab === 'live_monitor' ? (() => {
          if (!activeClass) {
            return `
              <div class="card" style="border:1.5px dashed #cbd5e1; background:#ffffff; border-radius:16px; padding:48px 24px; text-align:center; box-shadow:0 1px 3px rgba(15,23,42,0.02);">
                <div style="font-size:42px; margin-bottom:10px;">🖥️</div>
                <h3 style="margin:0 0 8px 0; font-size:17px; font-weight:800; color:#0f172a;">暂无可用教学班级</h3>
                <p style="font-size:13px; color:#64748b; margin:0 auto 18px; max-width:420px; line-height:1.6;">
                  请先前往【班级大厅】创建教学班级并划分协作小组，随后即可在此进行全组实操大屏与进程实时监控。
                </p>
              </div>
            `;
          }
          if (currentClassTasks.length === 0) {
            return `
              <div class="card" style="border:1.5px dashed #cbd5e1; background:#ffffff; border-radius:16px; padding:48px 24px; text-align:center; box-shadow:0 1px 3px rgba(15,23,42,0.02);">
                <div style="width:60px; height:60px; border-radius:50%; background:#eff6ff; color:#2563eb; display:flex; align-items:center; justify-content:center; margin:0 auto 16px; font-size:30px; box-shadow:0 4px 12px rgba(37,99,235,0.15);">📝</div>
                <h3 style="margin:0 0 8px 0; font-size:18px; font-weight:800; color:#0f172a;">当前班级暂无已发布的写作任务</h3>
                <p style="font-size:13.5px; color:#64748b; margin:0 auto 20px; max-width:440px; line-height:1.65;">
                  您尚未在当前班级（${escapeHtml(activeClass.name)}）发布任何写作任务（或历史任务已被删除）。<br/>
                  请前往【📝 任务与教学资料】新建并发布任务，学生进入任务后即可在此开启全景实时监控！
                </p>
                <button class="teacher-action-btn" id="btn-goto-create-task-tab" style="background:linear-gradient(135deg, #1d4ed8, #2563eb); border:none; color:white; padding:9px 20px; border-radius:8px; font-size:13.5px; font-weight:700; cursor:pointer; box-shadow:0 2px 8px rgba(37,99,235,0.25);">
                  📝 前往发布写作任务
                </button>
              </div>
            `;
          }
          const monitorStageMode = state.teacherMonitorStageMode || 'auto';
          const actualStage = state.currentStage || 'stage1';
          const effectiveMonitorStage = monitorStageMode === 'auto' ? actualStage : monitorStageMode;

          const currentClassId = activeClass.id;
          const activeTaskId = state.activeTaskId || (currentClassTasks[0] ? currentClassTasks[0].id : null);
          const currentMonitorTaskId = activeTaskId;
          const monitorTaskObj = currentClassTasks.find(t => t.id === currentMonitorTaskId) || (currentClassTasks[0] || null);
          const isMonitorTaskExpired = isTaskExpired(monitorTaskObj);
          const genreCfg = TASK_GENRE_CONFIGS[monitorTaskObj?.taskType || 'experiment'] || TASK_GENRE_CONFIGS.experiment;
          const isInst = (monitorTaskObj?.taskType === 'instructional');

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

              <div class="card" id="card-teacher-panorama" style="border-top:4px solid #7c3aed; width:100%; padding:12px 18px; flex-shrink:0;">
                <div style="display:flex; justify-content:space-between; align-items:center; cursor:pointer;" id="btn-toggle-teacher-panorama">
                  <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-size:14px; font-weight:800; color:#0f172a;">📡 全组实时总览</span>
                    <span style="font-size:11px; color:#64748b; font-weight:600;">
                      <span style="color:#16a34a;">🟢 正常</span>　<span style="color:#d97706;">🟡 部分离线</span>　<span style="color:#dc2626;">🔴 全员离线/字段占用</span>　<span style="color:#059669;">✅ 已终稿</span>
                    </span>
                  </div>
                  <span id="icon-toggle-teacher-panorama" style="font-size:11.5px; color:#7c3aed; font-weight:700;">${state._isPanoramaCollapsed ? '▼ 展开总览' : '▲ 收起'}</span>
                </div>
                <div id="body-teacher-panorama" style="display:${state._isPanoramaCollapsed ? 'none' : 'grid'}; grid-template-columns:repeat(auto-fill, minmax(170px, 1fr)); gap:10px; margin-top:10px;">
                  ${(activeClass.groups || []).map(g => {
                    const p = getPanoGroupData(state.monitorPanorama, g.id);
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
                          <span class="card-title" style="font-size:12.5px; font-weight:800; color:#0f172a;">👥 ${escapeHtml(g.name || g.id)}</span>
                          <span class="card-dot" style="font-size:14px;">${dot}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center; gap:6px;">
                          <span class="card-stage" style="font-size:11px; font-weight:700; color:#6d28d9; background:#ede9fe; padding:2px 6px; border-radius:6px;">${stageLabel}</span>
                          <span class="card-online" style="font-size:11px; color:#64748b; font-weight:600;">在线 ${online}/${total}</span>
                        </div>
                        <div class="card-hint" style="font-size:10.5px; color:${dotColor}; font-weight:700;">${hint}${locks > 0 ? ' · 锁字段' : ''}</div>
                      </button>
                    `;
                  }).join('')}
                </div>
              </div>

              <div class="card" style="background:#ffffff; border:1px solid #e2e8f0; border-radius:14px; padding:16px 22px; display:flex; flex-direction:column; gap:14px; box-shadow:0 1px 3px rgba(15,23,42,0.04);">
                
                <!-- 🌟 顶行：任务/小组选择 + 任务指标 + 状态与操作 -->
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:14px;">
                  <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
                    <div style="display:flex; align-items:center; gap:8px;">
                      <span style="font-size:13px; font-weight:700; color:#475569;">监控任务:</span>
                      <select id="sel-switch-monitor-task" class="teacher-input fancy" style="font-size:13px; font-weight:700; color:#1e40af; background:#f8fafc; border:1.5px solid #cbd5e1; padding:6px 12px; border-radius:8px; cursor:pointer; min-width:140px; max-width:200px;">
                        ${currentClassTasks.length === 0 ? '<option value="">暂无写作任务</option>' : currentClassTasks.map(t => {
                          const isSel = (state.activeTaskId || null) === t.id;
                          return `<option value="${t.id}" ${isSel ? 'selected' : ''}>${t.title}${isTaskExpired(t) ? ' (已截止)' : ''}</option>`;
                        }).join('')}
                      </select>
                    </div>

                    <div style="display:flex; align-items:center; gap:8px;">
                      <span style="font-size:13px; font-weight:700; color:#475569;">监控小组:</span>
                      <select id="sel-switch-monitor-group" class="teacher-input fancy" style="font-size:13px; font-weight:700; color:#1e40af; background:#f8fafc; border:1.5px solid #cbd5e1; padding:6px 12px; border-radius:8px; cursor:pointer; min-width:150px; max-width:220px;">
                        ${(activeClass.groups || []).map(g => {
                          const isSel = g.id === activeMonitorGId;
                          return `
                            <option value="${g.id}" ${isSel ? 'selected' : ''}>
                              ${g.name} ${isSel ? '(同屏中)' : ''}
                            </option>
                          `;
                        }).join('')}
                      </select>
                    </div>

                    <div style="height:18px; width:1px; background:#e2e8f0;"></div>

                    <!-- 🎯 任务核心指标 (简洁高对比度) -->
                    <div style="display:flex; align-items:center; gap:14px; font-size:13px; color:#475569;">
                      <span>🎯 目标: <b style="color:#059669; font-weight:800;">${monitorTaskObj?.targetWordCount || 3000} 字</b></span>
                      <span>📑 文体: <b style="color:#7c3aed; font-weight:800;">${genreCfg.label}</b></span>
                      ${(() => {
                        const calcRemain = (deadlineStr) => {
                          if (!deadlineStr || deadlineStr.includes('无') || deadlineStr.includes('结课前')) return '结课前';
                          try {
                            const dMs = new Date(deadlineStr.replace(/-/g, '/')).getTime();
                            if (isNaN(dMs)) return deadlineStr;
                            const diff = dMs - Date.now();
                            if (diff <= 0) return '已截止';
                            const totalM = Math.floor(diff / 60000);
                            const h = Math.floor(totalM / 60);
                            const m = totalM % 60;
                            if (h >= 24) {
                              const days = Math.floor(h / 24);
                              return `剩余 ${days}天${h % 24}小时`;
                            }
                            return `剩余 ${h}小时${m}分`;
                          } catch(e) { return deadlineStr; }
                        };
                        const remainText = calcRemain(monitorTaskObj?.deadline);
                        const isExp = remainText.includes('已截止');
                        return `
                          <span id="teacher-task-countdown-text">⏰ <b style="color:${isExp ? '#dc2626' : '#2563eb'}; font-weight:700;">${remainText}</b></span>
                        `;
                      })()}
                    </div>
                  </div>

                  <!-- 状态与 Excel 导出 -->
                  <div style="display:flex; align-items:center; gap:10px;">
                    <span id="teacher-task-status-badge" style="font-size:12px; font-weight:700; padding:5px 12px; border-radius:6px; background:${isMonitorTaskExpired || state.isFinalSubmitted ? '#fef2f2' : '#ecfdf5'}; color:${isMonitorTaskExpired || state.isFinalSubmitted ? '#dc2626' : '#059669'}; border:1px solid ${isMonitorTaskExpired || state.isFinalSubmitted ? '#fecaca' : '#a7f3d0'};">
                      ${isMonitorTaskExpired ? '已截止' : (state.isFinalSubmitted ? '已归档' : '进行中')}
                    </span>
                    <button id="btn-export-all-excel" style="background:#2563eb; color:white; border:none; padding:7px 16px; border-radius:8px; font-size:12.5px; font-weight:700; cursor:pointer; box-shadow:0 2px 6px rgba(37,99,235,0.2); display:inline-flex; align-items:center; gap:6px;" title="一键导出全班各组研讨记录 (分文件)">
                      📥 导出全班研讨
                    </button>
                  </div>
                </div>

                <div style="height:1px; background:#f1f5f9; width:100%;"></div>

                <!-- 🌟 底行：阶段跟随指示 + 成员在线状态 + 现代化切页分段控制器 -->
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:14px;">
                  <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
                    <span style="font-size:13px; font-weight:700; color:#334155;">
                      📍 实时进度: 当前【${activeMonitorGroup.name}】处于 <b id="teacher-actual-stage-text" style="color:#2563eb;">${actualStage === 'stage1' ? '阶段一：学术拍卖会' : actualStage === 'stage2' ? '阶段二：学术编辑部' : '阶段三：答辩擂台'}</b>
                    </span>

                    <!-- 在线/离线成员状态流线胶囊 -->
                    <span id="teacher-online-pills-container" style="display:inline-flex; align-items:center;">
                    ${(() => {
                      const panoData = getPanoGroupData(state.monitorPanorama, activeMonitorGId);
                      const total = panoData ? (panoData.totalMembers || 0) : (monitorMembersList.length || 0);
                      const online = panoData ? (panoData.onlineCount || 0) : 0;
                      const absentList = (panoData && panoData.absentMembers) || [];
                      const absentCount = Math.max(0, total - online);

                      if (total > 0 && online === 0) {
                        return `
                          <span style="font-size:12px; font-weight:700; padding:3px 10px; border-radius:6px; background:#fef2f2; color:#dc2626; border:1px solid #fecaca; display:inline-flex; align-items:center; gap:5px;">
                            <span style="width:6px; height:6px; border-radius:50%; background:#dc2626;"></span>
                            全员离线 (0/${total})
                          </span>
                        `;
                      } else if (absentCount > 0 && absentList.length > 0) {
                        return `
                          <span style="font-size:12px; font-weight:700; padding:3px 10px; border-radius:6px; background:#fffbeb; color:#b45309; border:1px solid #fde68a; display:inline-flex; align-items:center; gap:6px; flex-wrap:wrap;">
                            <span style="display:inline-flex; align-items:center; gap:4px;">
                              <span style="width:6px; height:6px; border-radius:50%; background:#f59e0b;"></span>
                              离线 (${absentCount}人):
                            </span>
                            ${absentList.map(name => `
                              <span style="background:#ffffff; color:#92400e; border:1px solid #fcd34d; padding:1px 6px; border-radius:4px; font-size:11.5px; font-weight:700;">
                                ${escapeHtml(name)}
                              </span>
                            `).join('')}
                          </span>
                        `;
                      } else {
                        return `
                          <span style="font-size:12px; font-weight:700; padding:3px 10px; border-radius:6px; background:#ecfdf5; color:#059669; border:1px solid #a7f3d0; display:inline-flex; align-items:center; gap:5px;">
                            <span style="width:6px; height:6px; border-radius:50%; background:#10b981;"></span>
                            全员在线 (${online}/${total || online})
                          </span>
                        `;
                      }
                    })()}
                    </span>
                  </div>

                  <!-- 现代化分段控制器切页 Tab (Segmented Control) -->
                  <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-size:12px; color:#64748b; font-weight:600;">同屏切页:</span>
                    <div style="display:inline-flex; background:#f1f5f9; padding:3px; border-radius:8px; border:1px solid #e2e8f0; gap:2px;">
                      <button class="btn-monitor-stage-tab ${monitorStageMode === 'auto' ? 'active' : ''}" data-stg="auto" style="background:${monitorStageMode === 'auto' ? '#ffffff' : 'transparent'}; border:none; color:${monitorStageMode === 'auto' ? '#059669' : '#64748b'}; padding:5px 12px; border-radius:6px; font-size:12px; font-weight:${monitorStageMode === 'auto' ? '800' : '600'}; cursor:pointer; box-shadow:${monitorStageMode === 'auto' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'};">
                        ⚡ 自动跟随 (${actualStage === 'stage1' ? '阶段一' : actualStage === 'stage2' ? '阶段二' : '阶段三'})
                      </button>
                      <button class="btn-monitor-stage-tab ${monitorStageMode === 'stage1' ? 'active' : ''}" data-stg="stage1" style="background:${monitorStageMode === 'stage1' ? '#ffffff' : 'transparent'}; border:none; color:${monitorStageMode === 'stage1' ? '#1d4ed8' : '#64748b'}; padding:5px 12px; border-radius:6px; font-size:12px; font-weight:${monitorStageMode === 'stage1' ? '800' : '600'}; cursor:pointer; box-shadow:${monitorStageMode === 'stage1' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'};">
                        阶段一
                      </button>
                      <button class="btn-monitor-stage-tab ${monitorStageMode === 'stage2' ? 'active' : ''}" data-stg="stage2" style="background:${monitorStageMode === 'stage2' ? '#ffffff' : 'transparent'}; border:none; color:${monitorStageMode === 'stage2' ? '#1d4ed8' : '#64748b'}; padding:5px 12px; border-radius:6px; font-size:12px; font-weight:${monitorStageMode === 'stage2' ? '800' : '600'}; cursor:pointer; box-shadow:${monitorStageMode === 'stage2' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'};">
                        阶段二
                      </button>
                      <button class="btn-monitor-stage-tab ${monitorStageMode === 'stage3' ? 'active' : ''}" data-stg="stage3" style="background:${monitorStageMode === 'stage3' ? '#ffffff' : 'transparent'}; border:none; color:${monitorStageMode === 'stage3' ? '#1d4ed8' : '#64748b'}; padding:5px 12px; border-radius:6px; font-size:12px; font-weight:${monitorStageMode === 'stage3' ? '800' : '600'}; cursor:pointer; box-shadow:${monitorStageMode === 'stage3' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'};">
                        阶段三
                      </button>
                    </div>
                  </div>
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
                  <!-- 右侧卡片：高度统一为 840px，与左侧绝对平齐，内部聊天流全高滚动，严密锁边防溢出 -->
                  <div class="card" style="padding:16px 18px; display:flex; flex-direction:column; min-width:0; box-sizing:border-box; height:840px; max-height:840px; border:1px solid #e2e8f0; box-shadow:0 2px 8px rgba(15,23,42,0.04); overflow:hidden;">
                    <div style="flex-shrink:0; font-size:14.5px; font-weight:800; color:#0f172a; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e2e8f0; padding-bottom:8px;">
                      <span>💬 团队全程研讨对话流 (${activeMonitorGroup.name})</span>
                      <span id="teacher-chat-count-badge" style="font-size:11px; background:#eff6ff; color:#2563eb; padding:2px 8px; border-radius:6px; font-weight:700;">全阶段汇总 (${combinedGroupChatLogs.length}条)</span>
                    </div>
                    <div class="teacher-chat-stream" id="teacher-unified-chat-stream" style="flex:1; min-height:0; height:100%; overflow-y:auto; overflow-x:hidden; -webkit-overflow-scrolling:touch; overscroll-behavior-y:contain; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px; font-size:12px; display:flex; flex-direction:column; gap:10px; box-sizing:border-box;">
                      ${state.activeAgentAnalyzing ? `
                        <div style="background:linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%); border:1.5px solid #93c5fd; border-radius:8px; padding:8px 12px; margin-bottom:4px; display:flex; align-items:center; justify-content:space-between; box-shadow:0 2px 8px rgba(37,99,235,0.08); flex-shrink:0;">
                          <div style="display:flex; align-items:center; gap:8px;">
                            <div style="width:16px; height:16px; border:2px solid #bfdbfe; border-top-color:#2563eb; border-radius:50%; animation:spin 0.9s linear infinite; flex-shrink:0;"></div>
                            <div>
                              <div style="font-size:12px; font-weight:800; color:#1e3a8a;">
                                ${state.activeAgentAnalyzing.icon || '🤖'} ${escapeHtml(state.activeAgentAnalyzing.title || '智能体正在分析中...')}
                              </div>
                              <div style="font-size:11px; color:#2563eb; margin-top:1px;">
                                ${escapeHtml(state.activeAgentAnalyzing.detail || '正在研读全篇并进行深度诊断...')}
                              </div>
                            </div>
                          </div>
                          <span style="font-size:10px; font-weight:800; color:#1d4ed8; background:#ffffff; border:1px solid #bfdbfe; padding:2px 8px; border-radius:10px;">
                            ⏳ 深度质检中
                          </span>
                        </div>
                      ` : ''}
                      ${combinedGroupChatLogs.length > 0 ? combinedGroupChatLogs.map(m => {
                        const allGlobalUsers = (authManager) ? authManager.getUsers() : [];
                        const isAgent = AgentProfiles[m.sender] !== undefined;
                        const matchedUser = isAgent ? null : allGlobalUsers.find(u => u.id === m.sender || u.name === m.sender);
                        const senderName = isAgent ? AgentProfiles[m.sender].name : (matchedUser ? matchedUser.name : (m.senderName || (monitorMembersObj[m.sender] ? monitorMembersObj[m.sender].name : m.sender)));
                        const color = isAgent ? AgentProfiles[m.sender].color : (matchedUser ? (matchedUser.color || '#2563eb') : (monitorMembersObj[m.sender] ? monitorMembersObj[m.sender].color : '#2563eb'));
                        let rawText = m.text || '';
                        let formattedText = '';
                        if (rawText.includes('<button') || rawText.includes('<br>') || rawText.includes('<span')) {
                          formattedText = rawText
                            .replace(/(@[^\s@<]+)/g, '<span style="color:#2563eb; font-weight:700;">$1</span>')
                            .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
                        } else {
                          let safeText = escapeHtml(rawText);
                          formattedText = safeText
                            .replace(/(@[^\s@]+)/g, '<span style="color:#2563eb; font-weight:700;">$1</span>')
                            .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
                        }
                        return `
                          <div style="background:#ffffff; padding:8px 12px; border-radius:8px; border:1px solid #e2e8f0; border-left:3px solid ${color}; box-shadow:0 1px 2px rgba(0,0,0,0.02); word-break:break-word; overflow-wrap:break-word; max-width:100%;">
                            <div style="display:flex; justify-content:space-between; margin-bottom:3px; gap:6px;">
                              <b style="color:${color}; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(senderName)}</b>
                              <span style="color:#94a3b8; font-size:10px; flex-shrink:0;">${escapeHtml(formatChatDisplayTime(m._timeMs || m.timestamp))}</span>
                            </div>
                            <div style="color:#0f172a; line-height:1.5; word-break:break-word; overflow-wrap:break-word;">${formattedText}</div>
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
                    <div style="display:grid; grid-template-columns: minmax(0, 1fr) 300px; gap:16px; width:100%; box-sizing:border-box; height:820px; max-height:820px; align-items:stretch;">
                      <!-- 左侧卡片：以阶段一左侧为主，高度统一为 820px，内部自适应滚动 -->
                      <div class="card" style="padding:18px 20px; display:flex; flex-direction:column; border:1px solid #bfdbfe; gap:12px; min-width:0; box-sizing:border-box; height:820px; max-height:820px; overflow-y:auto; -webkit-overflow-scrolling:touch; overscroll-behavior-y:contain;">
                        <div style="flex-shrink:0; font-size:16px; font-weight:800; color:#1e40af; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e2e8f0; padding-bottom:10px;">
                          <span>🎪 阶段一实操同屏: 初始提案与${isInst ? '备课' : '学术'}公约 (${activeMonitorGroup.name})</span>
                          <span style="background:#eff6ff; color:#1d4ed8; padding:3px 10px; border-radius:8px; font-size:12px; font-weight:700;">阶段一实况</span>
                        </div>

                        <!-- 1. 【第一步】💡 组员初始提案展台 -->
                        <div style="background:#f8fafc; border:1px solid #bfdbfe; border-radius:12px; padding:14px; flex-shrink:0;">
                          <div style="font-size:13.5px; font-weight:800; color:#1e40af; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
                            <span>💡 组员初始${isInst ? '教学' : '学术'}提案展台 (${(state.stage1?.proposals || []).length}/${monitorMembersList.length || 1} 人已提交):</span>
                            <span style="font-size:11.5px; background:#eff6ff; color:#2563eb; padding:2px 8px; border-radius:6px; font-weight:700;">
                              共投 ${monitorMembersList.filter(m => state.stage1?.hasVoted && (state.stage1.hasVoted[m.id] || (m.name && state.stage1.hasVoted[m.name]))).length} 票
                            </span>
                          </div>
                          ${(state.stage1?.proposals && state.stage1.proposals.length > 0) ? `
                            <div class="proposals-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:10px;">
                              ${state.stage1.proposals.map((p, idx) => {
                                const allGlobalUsers = (authManager) ? authManager.getUsers() : [];
                                const authorObj = monitorMembersList.find(m => m.id === p.author || m.name === p.authorName || m.name === p.author);
                                const authorUser = allGlobalUsers.find(u => u.id === p.author || u.name === p.authorName);
                                const authorName = authorObj ? authorObj.name : (authorUser ? authorUser.name : (p.authorName || p.author || `组员${idx+1}`));
                                const votes = monitorMembersList.filter(m => {
                                  if (!state.stage1?.votes) return false;
                                  const v = state.stage1.votes[m.id] || (m.name && state.stage1.votes[m.name]);
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

                        <!-- 2. 【第二步】📜 团队协同合作公约 (1:1 镜像学生端结构) -->
                        <div style="background:#f8fafc; border:1px solid #bfdbfe; border-radius:12px; padding:14px; display:flex; flex-direction:column; gap:12px;">
                          <div style="font-size:13.5px; font-weight:800; color:#1e40af; display:flex; justify-content:space-between; align-items:center;">
                            <span>📜 团队协同合作${isInst ? '备课' : '学术'}公约 (${activeMonitorGroup.name}):</span>
                            <span style="font-size:11.5px; background:${state.stage1?.contract?.isLocked ? '#ecfdf5' : '#eff6ff'}; color:${state.stage1?.contract?.isLocked ? '#059669' : '#2563eb'}; padding:2px 8px; border-radius:6px; font-weight:700;">
                              ${state.stage1?.contract?.isLocked ? '🔒 公约已全员签署生效' : '✍️ 协作拟定中'}
                            </span>
                          </div>

                          <!-- 📌 【槽位 1】确认融合研究/备课主题 -->
                          <div style="background:#ffffff; border:1px solid #cbd5e1; border-radius:8px; padding:10px 12px; border-left:4px solid #2563eb;">
                            <div style="font-size:11.5px; font-weight:800; color:#1e40af; margin-bottom:3px;">📌 【槽位 1】确认${isInst ? '融合教学设计课题' : '融合论文研究主题'}:</div>
                            <div style="font-size:13.5px; font-weight:800; color:#0f172a; line-height:1.4;">${escapeHtml(state.stage1?.mergedTitle || state.stage1?.contract?.topic || '（小组暂未敲定最终论题）')}</div>
                          </div>

                          <!-- 📝 【槽位 2】方案概述 / 教学构思与主线 -->
                          <div style="background:#ffffff; border:1px solid #cbd5e1; border-radius:8px; padding:10px 12px; border-left:4px solid #059669;">
                            <div style="font-size:11.5px; font-weight:800; color:#065f46; margin-bottom:3px;">
                              📝 【槽位 2】${isInst ? '教学设计整体构想与主线 (核心情境、活动主线与重难点突破)' : '研究方案概述 (具体情境、案例、聚焦点与方法)'}:
                            </div>
                            <div style="font-size:13px; font-weight:600; color:${(state.stage1?.contract?.overview || state.stage1?.researchOverview) ? '#0f172a' : '#94a3b8'}; line-height:1.5; white-space:pre-wrap; word-break:break-word;">${escapeHtml(state.stage1?.contract?.overview || state.stage1?.researchOverview || '（小组暂未录入方案概述）')}</div>
                          </div>

                          <!-- 📚 6大核心模块与时间规划 (独立模块) -->
                          <div style="background:#ffffff; padding:12px; border-radius:8px; border:1px solid #e2e8f0;">
                            <div style="font-weight:800; color:#1e40af; margin-bottom:8px; font-size:12.5px;">
                              📚 ${isInst ? '教学设计' : '研究方案'}核心模块与时间规划:
                            </div>
                            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(160px, 1fr)); gap:8px;">
                              ${(genreCfg.modules || []).map(sec => {
                                const timeAlloc = state.stage1?.contract?.timeAllocations || {};
                                const timeVal = (timeAlloc[sec.key] !== undefined) ? timeAlloc[sec.key] : sec.defaultMinutes;
                                return `
                                  <div style="background:#f8fafc; border:1px solid #e2e8f0; border-left:3.5px solid ${sec.color}; border-radius:6px; padding:6px 8px; display:flex; justify-content:space-between; align-items:center;">
                                    <span style="font-weight:700; color:#334155; font-size:11.5px;">${sec.title}</span>
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
                                const mKey = m.id   || m.name || (`mem_${idx}`);
                                const tasks = state.stage1?.contract?.taskAssignments || {};
                                const taskVal = tasks[mKey] !== undefined ? tasks[mKey] :
                                  (m.id && tasks[m.id] !== undefined ? tasks[m.id] :
                                  (m.id && tasks[m.id] !== undefined ? tasks[m.id] :
                                  (m.name && tasks[m.name] !== undefined ? tasks[m.name] : '')));
                                return `
                                  <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:6px 10px; display:flex; flex-direction:column; gap:3px;">
                                    <div style="display:flex; justify-content:space-between; align-items:center;">
                                      <span style="font-weight:800; color:${m.color || '#2563eb'}; font-size:12px;">${m.avatar || '👤'} ${escapeHtml(m.name)}:</span>
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
                                签署进度: ${monitorMembersList.filter(m => { const c = state.stage1?.contract?.confirmedMembers || {}; return c[m.id] || c[m.id] || (m.name && c[m.name]); }).length}/${monitorMembersList.length}
                              </span>
                            </div>
                            <div style="display:flex; gap:6px; flex-wrap:wrap;">
                              ${monitorMembersList.map(m => {
                                const isConf = state.stage1?.contract?.confirmedMembers && (state.stage1.contract.confirmedMembers[m.id] || state.stage1.contract.confirmedMembers[m.id] || (m.name && state.stage1.contract.confirmedMembers[m.name]));
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
                  const totalMemberCount = (monitorMembersList && monitorMembersList.length > 0) ? monitorMembersList.length : 1;
                  const confirmedDraftCount = monitorMembersList.filter(m => state.stage2?.confirmedMembers && (state.stage2.confirmedMembers[m.id]  || (m.name && state.stage2.confirmedMembers[m.name]))).length;

                  return `
                    <div style="display:grid; grid-template-columns: minmax(0, 1fr) 300px; gap:16px; width:100%; box-sizing:border-box; height:840px; max-height:840px; align-items:stretch;">
                      <!-- 左侧卡片：1:1 镜像学生端阶段二全部结构，高度统一为 840px 纵横开阔 -->
                      <div class="card" style="padding:16px 18px; display:flex; flex-direction:column; border:1px solid #bfdbfe; min-width:0; box-sizing:border-box; height:840px; max-height:840px; gap:8px; overflow:hidden;">
                        <!-- 1. 顶部标题与字数 -->
                        <div style="flex-shrink:0; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e2e8f0; padding-bottom:8px;">
                          <div style="display:flex; align-items:center; gap:8px;">
                            <span style="font-size:15px; font-weight:800; color:#1e40af;">📝 学术协作富文本编辑器 (${activeMonitorGroup.name})</span>
                            <span style="font-size:11px; background:#ecfdf5; color:#059669; padding:2px 8px; border-radius:10px; font-weight:700; border:1px solid #a7f3d0;">🟢 实时同步中</span>
                          </div>
                          <span style="font-size:12px; color:#475569;">总字数: <b id="teacher-stage2-word-count-num" style="color:#2563eb; font-size:14px;">${(state.stage2?.unifiedContent || '').replace(/<[^>]*>/g, '').trim().length}</b> 字</span>
                        </div>

                        <!-- 2. 半程修正清单 (1:1 镜像学生端：支持折叠展开与完成状态感知) -->
                        <div id="teacher-stage2-action-plan-container">
                          ${(s2ActionPlan && s2ActionPlan.isGenerated) ? `
                            <div style="background:#ecfdf5; border:1px solid #a7f3d0; border-radius:8px; padding:6px 12px; flex-shrink:0;">
                              <div style="font-size:12px; font-weight:800; color:#059669; display:flex; justify-content:space-between; align-items:center; cursor:pointer;" id="btn-toggle-teacher-action-plan">
                                <div style="display:flex; align-items:center; gap:6px;">
                                  <span>📋 【半程修正清单】(审稿专家 3 项修改要求)</span>
                                  <span style="font-size:10.5px; background:#d1fae5; color:#065f46; padding:1px 6px; border-radius:8px; font-weight:700;">已生成</span>
                                </div>
                                <span id="icon-toggle-teacher-plan" style="font-size:11px; color:#059669; font-weight:700;">▲ 收起</span>
                              </div>
                              <div id="body-teacher-action-plan" style="font-size:11.5px; color:#334155; display:flex; flex-direction:column; gap:4px; margin-top:6px;">
                                ${(s2ActionPlan.items || []).map((item, idx) => {
                                  const isChecked = !!(s2ActionPlan.completedMap && s2ActionPlan.completedMap[idx]);
                                  return `
                                    <div style="line-height:1.4; display:flex; align-items:flex-start; gap:6px; color:${isChecked ? '#166534' : '#1e293b'};">
                                      <span>${isChecked ? '✅' : '⏳'}</span>
                                      <span style="text-decoration:${isChecked ? 'line-through' : 'none'};"><b>${idx + 1}.</b> ${escapeHtml(item)}</span>
                                    </div>
                                  `;
                                }).join('')}
                              </div>
                            </div>
                          ` : `
                            <div style="background:#f8fafc; border:1px dashed #cbd5e1; border-radius:8px; padding:6px 12px; flex-shrink:0;">
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
                        </div>

                        <!-- 3. 正文初稿确认进度 (1:1 镜像学生端) -->
                        <div style="flex-shrink:0; background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:8px 12px; font-size:12px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; box-shadow:0 1px 2px rgba(15,23,42,0.02);">
                          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                            <span style="font-weight:800; color:#0f172a;">✍️ 正文初稿确认进度:</span>
                            <span style="font-weight:700; color:${state.stage2?.isDraftConfirmed ? '#059669' : '#2563eb'}; background:${state.stage2?.isDraftConfirmed ? '#ecfdf5' : '#eff6ff'}; padding:2px 8px; border-radius:10px; border:1px solid ${state.stage2?.isDraftConfirmed ? '#a7f3d0' : '#bfdbfe'}; font-size:11px;">
                              ${state.stage2?.isDraftConfirmed ? '✅ 全员已确认完成初稿' : `${confirmedDraftCount}/${totalMemberCount} 人已确认`}
                            </span>
                            <div id="teacher-stage2-confirmed-pills" style="display:flex; gap:6px; flex-wrap:wrap;">
                              ${monitorMembersList.map(m => {
                                const isConf = state.stage2?.confirmedMembers && (state.stage2.confirmedMembers[m.id] || (m.name && state.stage2.confirmedMembers[m.name]));
                                return `<span style="font-size:11px; padding:1px 8px; border-radius:10px; font-weight:700; background:${isConf ? '#ecfdf5' : '#f8fafc'}; color:${isConf ? '#059669' : '#94a3b8'}; border:1px solid ${isConf ? '#a7f3d0' : '#e2e8f0'};">
                                  ${isConf ? '✓' : '○'} ${escapeHtml(m.name)}
                                </span>`;
                              }).join('')}
                            </div>
                          </div>
                        </div>

                        <!-- 4. 协同文档视口 (纯净只读阅卷 · 实时协同直连) -->
                        ${(() => {
                          const rawPadName = `jizhi_${activeTaskId}_${activeMonitorGId}`;
                          const targetPad = rawPadName;
                          return `
                            <div class="teacher-etherpad-container" style="flex:1; min-height:560px; border-radius:8px; overflow:hidden; border:1.5px solid #cbd5e1; box-shadow:0 2px 8px rgba(15,23,42,0.04); background:#ffffff; position:relative; display:flex; flex-direction:column; overscroll-behavior:contain; overscroll-behavior-y:contain;">
                              <div style="display:flex; justify-content:space-between; align-items:center; background:#f8fafc; border-bottom:1px solid #e2e8f0; padding:6px 12px; font-size:12px; color:#475569; flex-shrink:0;">
                                <div style="display:flex; align-items:center; gap:8px;">
                                  <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#10b981;"></span>
                                  <span style="font-weight:700; color:#1e293b;">🔒 教师端正文镜像 (纯净只读阅卷 · 实时协同直连)</span>
                                </div>
                                <div style="display:flex; align-items:center; gap:8px;">
                                  <span style="font-size:11px; background:#ecfdf5; color:#059669; border:1px solid #a7f3d0; padding:1px 8px; border-radius:4px; font-weight:700;">只读监控</span>
                                  <button onclick="const f=document.getElementById('teacher-stage2-etherpad-frame'); if(f) f.src=f.src;" style="background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe; padding:2px 8px; border-radius:4px; font-size:11px; cursor:pointer; font-weight:700;">🔄 刷新镜像</button>
                                </div>
                              </div>
                              <div style="position:relative; flex:1; width:100%; height:100%; min-height:520px; display:flex; overscroll-behavior:contain; overscroll-behavior-y:contain;">
                                <iframe id="teacher-stage2-etherpad-frame" data-pad="${targetPad}" data-task="${activeTaskId}" data-group="${activeMonitorGId}" src="/p/${encodeURIComponent(targetPad)}?userName=${encodeURIComponent('教师监控')}&userColor=%237c3aed&showControls=false&showChat=false&showLineNumbers=true&lang=zh-hans" style="flex:1; width:100%; height:100%; min-height:520px; border:none; display:block; background:#ffffff; overscroll-behavior:contain; overscroll-behavior-y:contain;" title="教师端实时写作同屏镜像 (只读)"></iframe>
                              </div>
                            </div>
                          `;
                        })()}

                        <!-- 5. 📊 团队协作贡献度占比 (SSRL 群体过程感知) - 真实计算，无数据为 0% -->
                        <div style="background:#ffffff; padding:10px 14px; border-radius:8px; border:1px solid #cbd5e1; flex-shrink:0; display:flex; flex-direction:column; gap:6px; box-shadow:0 1px 3px rgba(15,23,42,0.04);">
                          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
                            <span style="font-size:12px; font-weight:800; color:#1e293b;">📊 团队协作贡献度占比 (SSRL 群体过程感知):</span>
                            <div class="contrib-labels" id="teacher-stage2-contrib-labels" style="display:flex; font-size:11.5px; font-weight:700; color:#475569; gap:10px; white-space:nowrap; flex-wrap:wrap;">
                              ${(() => {
                                const contribs = state.stage2?.memberContributions || {};
                                let rawTotal = 0;
                                monitorMembersList.forEach(m => { rawTotal += Number(contribs[m.id] || 0); });
                                return monitorMembersList.map((m) => {
                                  const rawVal = Number(contribs[m.id] || 0);
                                  const pct = rawTotal > 0 ? Math.round((rawVal / rawTotal) * 100) : 0;
                                  return `<span style="color:${rawVal > 0 ? (m.color || '#2563eb') : '#94a3b8'}; font-weight:700;">● ${escapeHtml(m.name)}: ${pct}%</span>`;
                                }).join('');
                              })()}
                            </div>
                          </div>
                          <div class="contrib-bars" id="teacher-stage2-contrib-bars" style="width:100%; height:10px; border-radius:5px; display:flex; overflow:hidden; background:#e2e8f0;">
                            ${(() => {
                              const contribs = state.stage2?.memberContributions || {};
                              let rawTotal = 0;
                              monitorMembersList.forEach(m => { rawTotal += Number(contribs[m.id] || 0); });
                              if (rawTotal === 0) {
                                return `<div style="width:100%; height:10px; background:#f8fafc; border-radius:5px; display:flex; align-items:center; justify-content:center; font-size:10px; color:#94a3b8; font-weight:600;">⏳ 暂无协作投入 (组员在 Etherpad 中撰写、修改正文或研讨后将平滑累计真实贡献)</div>`;
                              }
                              return monitorMembersList.map((m) => {
                                const rawVal = Number(contribs[m.id] || 0);
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
                    <div style="display:grid; grid-template-columns: minmax(0, 1fr) 300px; gap:16px; width:100%; box-sizing:border-box; height:840px; max-height:840px; align-items:stretch;">
                      <!-- 阶段三左侧卡片：高度统一为 840px；答辩页自适应内部滚动，终稿页与阶段二一样带贡献度 -->
                      <div class="card" style="padding:16px 18px; display:flex; flex-direction:column; border:1px solid #bfdbfe; min-width:0; box-sizing:border-box; height:840px; max-height:840px; gap:8px; overflow:hidden;">
                        <div style="flex-shrink:0; font-size:15.5px; font-weight:800; color:#1e40af; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e2e8f0; padding-bottom:8px;">
                          <span>🎓 阶段三实操同屏: 答辩擂台与终稿 (${activeMonitorGroup.name})</span>
                          <div style="display:flex; gap:6px;">
                            <button class="btn btn-sm ${!isStage3DocTab ? 'btn-primary' : 'btn-secondary'}" id="btn-tab-teacher-stage3-defense" style="padding:4px 12px; font-size:12px; font-weight:700; border-radius:6px; cursor:pointer;">🗣️ 答辩质询与答复</button>
                            <button class="btn btn-sm ${isStage3DocTab ? 'btn-primary' : 'btn-secondary'}" id="btn-tab-teacher-stage3-doc" style="padding:4px 12px; font-size:12px; font-weight:700; border-radius:6px; cursor:pointer;">📜 论文终稿镜像</button>
                          </div>
                        </div>

                        ${isStage3DocTab ? `
                          <!-- Tab 2: 论文终稿实时镜像 (纯净只读阅卷 · 实时协同直连) -->
                          <div style="flex-shrink:0; display:flex; justify-content:space-between; align-items:center;">
                            <span style="font-size:13.5px; font-weight:800; color:#1e40af;">📜 论文终稿正文全篇镜像:</span>
                            <span style="font-size:12px; color:#64748b;">终稿字数: <b id="teacher-stage3-word-count-num" style="color:#2563eb; font-size:14px;">${((state.stage3?.finalDraft || state.stage2?.unifiedContent || '').replace(/<[^>]*>/g, '').trim()).length}</b> 字</span>
                          </div>
                          ${(() => {
                            const rawPadName = `jizhi_${activeTaskId}_${activeMonitorGId}`;
                            const targetPad = rawPadName;
                            return `
                              <div class="teacher-etherpad-container" style="flex:1; min-height:560px; border-radius:8px; overflow:hidden; border:1.5px solid #cbd5e1; box-shadow:0 2px 8px rgba(15,23,42,0.04); background:#ffffff; position:relative; display:flex; flex-direction:column; overscroll-behavior:contain; overscroll-behavior-y:contain;">
                                <div style="display:flex; justify-content:space-between; align-items:center; background:#f8fafc; border-bottom:1px solid #e2e8f0; padding:6px 12px; font-size:12px; color:#475569; flex-shrink:0;">
                                  <div style="display:flex; align-items:center; gap:8px;">
                                    <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#10b981;"></span>
                                    <span style="font-weight:700; color:#1e293b;">🔒 教师端终稿镜像 (纯净只读阅卷 · 实时协同直连)</span>
                                  </div>
                                  <div style="display:flex; align-items:center; gap:8px;">
                                  <span style="font-size:11px; background:#ecfdf5; color:#059669; border:1px solid #a7f3d0; padding:1px 8px; border-radius:4px; font-weight:700;">只读监控</span>
                                  <button onclick="const f=document.getElementById('teacher-stage3-etherpad-frame'); if(f) f.src=f.src;" style="background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe; padding:2px 8px; border-radius:4px; font-size:11px; cursor:pointer; font-weight:700;">🔄 刷新镜像</button>
                                </div>
                                </div>
                                <div style="position:relative; flex:1; width:100%; height:100%; min-height:520px; display:flex; overscroll-behavior:contain; overscroll-behavior-y:contain;">
                                  <iframe id="teacher-stage3-etherpad-frame" data-pad="${targetPad}" data-task="${activeTaskId}" data-group="${activeMonitorGId}" src="/p/${encodeURIComponent(targetPad)}?userName=${encodeURIComponent('教师监控')}&userColor=%237c3aed&showControls=false&showChat=false&showLineNumbers=true&lang=zh-hans" style="flex:1; width:100%; height:100%; min-height:520px; border:none; display:block; background:#ffffff; overscroll-behavior:contain; overscroll-behavior-y:contain;" title="教师端论文终稿同屏镜像 (只读)"></iframe>
                                </div>
                              </div>
                            `;
                          })()}
                          <div style="background:#ffffff; padding:10px 14px; border-radius:8px; border:1px solid #cbd5e1; flex-shrink:0; display:flex; flex-direction:column; gap:6px; box-shadow:0 1px 3px rgba(15,23,42,0.04);">
                            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
                              <span style="font-size:12px; font-weight:800; color:#1e293b;">📊 终稿协作贡献度占比 (SSRL 群体过程感知):</span>
                              <div class="contrib-labels" id="teacher-stage3-contrib-labels" style="display:flex; font-size:11.5px; font-weight:700; color:#475569; gap:10px; white-space:nowrap; flex-wrap:wrap;">
                                ${(() => {
                                  const contribs = state.stage2?.memberContributions || {};
                                  let rawTotal = 0;
                                  monitorMembersList.forEach(m => { rawTotal += Number(contribs[m.id] || 0); });
                                  return monitorMembersList.map((m) => {
                                    const rawVal = Number(contribs[m.id] || 0);
                                    const pct = rawTotal > 0 ? Math.round((rawVal / rawTotal) * 100) : 0;
                                    return `<span style="color:${rawVal > 0 ? (m.color || '#2563eb') : '#94a3b8'}; font-weight:700;">● ${escapeHtml(m.name)}: ${pct}%</span>`;
                                  }).join('');
                                })()}
                              </div>
                            </div>
                            <div class="contrib-bars" id="teacher-stage3-contrib-bars" style="width:100%; height:10px; border-radius:5px; display:flex; overflow:hidden; background:#e2e8f0;">
                              ${(() => {
                                const contribs = state.stage2?.memberContributions || {};
                                let rawTotal = 0;
                                monitorMembersList.forEach(m => { rawTotal += Number(contribs[m.id] || 0); });
                                if (rawTotal === 0) {
                                  return `<div style="width:100%; height:10px; background:#f8fafc; border-radius:5px; display:flex; align-items:center; justify-content:center; font-size:10px; color:#94a3b8; font-weight:600;">⏳ 暂无协作投入</div>`;
                                }
                                return monitorMembersList.map((m) => {
                                  const rawVal = Number(contribs[m.id] || 0);
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
                            <div id="teacher-stage3-feedback-list" style="display:flex; flex-direction:column; gap:12px; flex:1;">
                              ${(state.stage3?.feedbackItems && state.stage3.feedbackItems.length > 0) ? state.stage3.feedbackItems.map((item, i) => {
                                const isProp = item.role === 'proponent';
                                const roleLabel = item.speaker || (isProp ? '正方委员 Agent (立论支持)' : '反方委员 Agent (学术质询)');
                                const titleLabel = item.title ? ` - ${item.title}` : '';
                                const questionText = item.content || item.question || item.comment || item.text || '质询内容生成中...';
                                return `
                                <div style="background:#ffffff; border:1.5px solid ${item.response ? '#93c5fd' : (isProp ? '#86efac' : '#fca5a5')}; border-radius:8px; padding:12px 14px; font-size:12.5px; box-shadow:0 1px 3px rgba(0,0,0,0.02);">
                                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                                    <span style="font-weight:800; color:${isProp ? '#059669' : '#0f172a'}; font-size:13px;">
                                      ${isProp ? '🟢 专家立论支持' : `💬 答辩质询 #${i+1}`} (${escapeHtml(roleLabel)}${escapeHtml(titleLabel)}):
                                    </span>
                                    <span style="font-size:11px; background:${item.response ? '#ecfdf5' : (isProp ? '#eff6ff' : '#fef3c7')}; color:${item.response ? '#059669' : (isProp ? '#2563eb' : '#b45309')}; padding:2px 8px; border-radius:4px; font-weight:700;">
                                      ${item.response ? '✅ 小组已答辩并归档' : (isProp ? '🌟 专家肯定 (立论支持无需答辩)' : '⏳ 待组内研讨答辩')}
                                    </span>
                                  </div>
                                  <div style="color:#1e293b; background:#f8fafc; padding:8px 10px; border-radius:6px; margin-bottom:8px; border-left:3px solid ${isProp ? '#10b981' : '#ef4444'}; line-height:1.5;">
                                    ${escapeHtml(questionText)}
                                  </div>
                                  ${item.response ? `
                                    <div style="color:#065f46; background:#ecfdf5; padding:8px 10px; border-radius:6px; border-left:3px solid #10b981; line-height:1.5;">
                                      <b>✍️ 小组辩护陈述与修改方案:</b> ${escapeHtml(item.response)}
                                    </div>
                                  ` : `
                                    <div style="color:#94a3b8; font-style:italic; font-size:11.5px; padding:4px 8px;">
                                      ${isProp ? '（立论支持默认通过，如无补充可直接留空）' : '（本小组尚未提交对该质询的答辩回应）'}
                                    </div>
                                  `}
                                </div>
                              `;}).join('') : `
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
      `}
    </div>
  `;

  container.dataset.renderedClassId = activeClassId;
  container.dataset.renderedGroupId = activeMonitorGId;
  container.dataset.renderedTaskId = effectiveMonitorTaskId;
  container.dataset.renderedStage = effectiveMonitorStage;
  container.dataset.renderedMode = monitorStageMode;
  container.dataset.renderedS3Tab = currentS3Tab;
  container.dataset.renderedTab = activeTab;

  // 🔒 确保教师端无论是阶段二还是阶段三的 Etherpad iframe 保持权威只读锁定
  const tFrame2 = container.querySelector('#teacher-stage2-etherpad-frame');
  if (tFrame2) {
    enforceEtherpadReadonly(tFrame2);
  }

  const tFrame3 = container.querySelector('#teacher-stage3-etherpad-frame');
  if (tFrame3) {
    enforceEtherpadReadonly(tFrame3);
  }

  const btnLogout = container.querySelector('#btn-logout');
  if (btnLogout) btnLogout.addEventListener('click', () => onLogout());

  const btnChangePwd = container.querySelector('#btn-teacher-change-pwd');
  if (btnChangePwd) {
    btnChangePwd.addEventListener('click', () => {
      authManager.openChangePasswordModal();
    });
  }

  const btnBackDashboard = container.querySelector('#btn-back-to-dashboard');
  if (btnBackDashboard) {
    btnBackDashboard.addEventListener('click', () => {
      state.teacherLevel = 'dashboard';
      state.teacherDashboardTab = 'classes';
      try {
        sessionStorage.setItem('jizhi_teacher_level', 'dashboard');
        localStorage.setItem('jizhi_teacher_level', 'dashboard');
        sessionStorage.setItem('jizhi_teacher_dtab', 'classes');
        localStorage.setItem('jizhi_teacher_dtab', 'classes');
      } catch (e) {}
      renderTeacherPortal(container, authManager, state, onLogout);
    });
  }

  container.querySelectorAll('.teacher-dtab-nav').forEach(btn => {
    btn.addEventListener('click', () => {
      state.teacherDashboardTab = btn.dataset.dtab;
      try {
        sessionStorage.setItem('jizhi_teacher_dtab', btn.dataset.dtab);
        localStorage.setItem('jizhi_teacher_dtab', btn.dataset.dtab);
      } catch (e) {}
      renderTeacherPortal(container, authManager, state, onLogout);
    });
  });

  container.querySelectorAll('.teacher-ctab-nav').forEach(btn => {
    btn.addEventListener('click', () => {
      state.teacherClassTab = btn.dataset.ctab;
      try {
        sessionStorage.setItem('jizhi_teacher_ctab', btn.dataset.ctab);
        localStorage.setItem('jizhi_teacher_ctab', btn.dataset.ctab);
      } catch (e) {}
      if (btn.dataset.ctab === 'live_monitor' && window.app) {
        try {
          window.app.loadGroupState(state.activeMonitorGroupId || (activeClass?.groups?.[0]?.id) || null);
          if (window.app.cloudSyncEngine) {
            window.app.cloudSyncEngine.updateScopeKeys();
            window.app.cloudSyncEngine.pullFromServer().catch(() => {});
          }
        } catch (e) {}
      }
      renderTeacherPortal(container, authManager, state, onLogout);
    });
  });

  const btnGotoCreateTask = container.querySelector('#btn-goto-create-task-tab');
  if (btnGotoCreateTask) {
    btnGotoCreateTask.addEventListener('click', () => {
      state.teacherClassTab = 'tasks_resources';
      try {
        sessionStorage.setItem('jizhi_teacher_ctab', 'tasks_resources');
        localStorage.setItem('jizhi_teacher_ctab', 'tasks_resources');
      } catch (e) {}
      renderTeacherPortal(container, authManager, state, onLogout);
    });
  }

  container.querySelectorAll('.btn-enter-class, .btn-select-class').forEach(btn => {
    btn.addEventListener('click', () => {
      const newCId = btn.dataset.id;
      state.activeClassId = newCId;
      state.teacherLevel = 'class_workspace';
      state.teacherClassTab = 'students_groups';
      const targetC = (authManager.getClasses() || []).find(c => c.id === newCId);
      const cTasks = (authManager.getTasks() || []).filter(t => t.classId === newCId || (targetC && t.className === targetC.name));
      state.activeTaskId = cTasks[0] ? cTasks[0].id : null;
      state.activeMonitorGroupId = (targetC && targetC.groups && targetC.groups[0]) ? targetC.groups[0].id : null;
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
      try {
        sessionStorage.setItem('jizhi_teacher_level', 'class_workspace');
        localStorage.setItem('jizhi_teacher_level', 'class_workspace');
        sessionStorage.setItem('jizhi_teacher_ctab', 'students_groups');
        localStorage.setItem('jizhi_teacher_ctab', 'students_groups');
        sessionStorage.setItem('jizhi_teacher_active_class_id', newCId);
        localStorage.setItem('jizhi_teacher_active_class_id', newCId);
        sessionStorage.setItem('jizhi_teacher_active_group_id', state.activeMonitorGroupId);
        localStorage.setItem('jizhi_teacher_active_group_id', state.activeMonitorGroupId);
      } catch (e) {}
      renderTeacherPortal(container, authManager, state, onLogout);
    });
  });

  // 🔍 搜索全校学生总库
  const searchGlobalInput = container.querySelector('#input-search-global-table');
  if (searchGlobalInput) {
    searchGlobalInput.addEventListener('input', (e) => {
      const q = (e.target.value || '').trim().toLowerCase();
      container.querySelectorAll('.global-std-tr').forEach(tr => {
        const str = tr.dataset.search || '';
        tr.style.display = (!q || str.includes(q)) ? '' : 'none';
      });
    });
  }

  // 全选全校学生
  const chkGlobalAll = container.querySelector('#chk-global-select-all');
  if (chkGlobalAll) {
    chkGlobalAll.addEventListener('change', () => {
      container.querySelectorAll('.global-std-tr').forEach(tr => {
        if (tr.style.display !== 'none') {
          const chk = tr.querySelector('.chk-global-std');
          if (chk) chk.checked = chkGlobalAll.checked;
        }
      });
    });
  }

  // 重置学生密码
  container.querySelectorAll('.reset-student-pwd-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const acc = btn.dataset.account;
      const uname = btn.dataset.name;
      if (confirm(`🔑 确认将学生【${uname} (${acc})】的登录密码重置为默认初始密码【123】吗？`)) {
        try {
          await authManager.resetStudentPassword(acc);
          alert(`✅ 已成功将学生【${uname}】的密码重置为 123！`);
          renderTeacherPortal(container, authManager, state, onLogout);
        } catch (err) {
          alert('❌ ' + err.message);
        }
      }
    });
  });

  // 单条彻底销毁
  container.querySelectorAll('.purge-student-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const uid = btn.dataset.id;
      const uname = btn.dataset.name;
      if (confirm(`⚠️ 确认彻底从系统中删除学生【${uname} (${uid})】的账号吗？删除后不可恢复！`)) {
        authManager.deleteStudent(uid, null, true);
        alert(`🎉 已成功彻底删除学生【${uname}】！`);
        renderTeacherPortal(container, authManager, state, onLogout);
      }
    });
  });

  // 批量彻底销毁全校学生
  const btnBatchPurgeGlobal = container.querySelector('#btn-batch-purge-global');
  if (btnBatchPurgeGlobal) {
    btnBatchPurgeGlobal.addEventListener('click', () => {
      const checked = Array.from(container.querySelectorAll('.chk-global-std:checked')).map(c => c.dataset.uid);
      if (checked.length === 0) { alert('⚠️ 请先勾选要彻底删除的学生！'); return; }
      if (confirm(`⚠️ 确认彻底从系统中注销并删除勾选的 ${checked.length} 名学生账号吗？删除后不可恢复！`)) {
        checked.forEach(uid => authManager.deleteStudent(uid, null, true));
        alert(`🎉 已成功彻底删除 ${checked.length} 名学生账号！`);
        renderTeacherPortal(container, authManager, state, onLogout);
      }
    });
  }

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
          const nextC = remainingClasses[0] || null;
          state.activeClassId = nextC ? nextC.id : null;
          const cTasks = nextC ? (authManager.getTasks() || []).filter(t => t.classId === nextC.id) : [];
          state.activeTaskId = cTasks[0] ? cTasks[0].id : null;
          state.activeMonitorGroupId = (nextC && nextC.groups && nextC.groups[0]) ? nextC.groups[0].id : null;
          state.monitorPanorama = null;
          state._lastMonitorHash = '';
          state._lastEpHash = '';
          state.stage1 = null;
          state.stage2 = null;
          state.stage3 = null;
          state.chatLogs = null;
          if (window.app && window.app.state) {
            window.app.state.activeClassId = state.activeClassId;
            window.app.state.activeTaskId = state.activeTaskId;
            window.app.state.activeMonitorGroupId = state.activeMonitorGroupId;
          }
          alert(`✅ 教学班级【${cName}】已成功删除！`);
          renderTeacherPortal(container, authManager, state, onLogout);
        } catch (err) {
          alert('❌ ' + err.message);
        }
      }
    });
  });

  // 🗑️ 一键清空当前班级学生（带弹窗二次确认）
  const btnClearStudents = container.querySelector('#btn-clear-class-students');
  if (btnClearStudents && activeClass) {
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
        renderTeacherPortal(container, authManager, state, onLogout);
      }
    });
  }

  // ➕ 创建班级事件绑定 (支持顶部按钮与零状态引导大按钮)
  container.querySelectorAll('.btn-trigger-create-class, #btn-v1-create-class, #btn-v1-create-class-zero').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = prompt('请输入新教学班级名称 (例如: 《现代教育技术》2026春01班):', '《现代教育技术》2026春01班');
      if (name && name.trim()) {
        try {
          const newC = authManager.createClass(name.trim());
          state.activeClassId = newC.id;
          const newCTasks = authManager.getTasksForClass ? authManager.getTasksForClass(newC.id) : [];
          state.activeTaskId = (newCTasks[0] && newCTasks[0].id) ? newCTasks[0].id : '';
          state.activeMonitorGroupId = (newC.groups && newC.groups[0]) ? newC.groups[0].id : null;
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
          renderTeacherPortal(container, authManager, state, onLogout);
        } catch (err) {
          alert('❌ ' + err.message);
        }
      }
    });
  });

  // 👨‍🎓 1. 单条创建学生账号弹窗（通用：支持班级名册与总库独立创建）
  const openSingleStudentCreateModal = (targetCls = null) => {
    document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    const classTitle = targetCls ? `加入班级: ${targetCls.name}` : `存入全平台学生总库`;
    const btnTitle = targetCls ? `👨‍🎓 确认创建并加入本班` : `👨‍🎓 确认创建并录入总库`;
    modal.innerHTML = `
      <div class="teacher-modal-card fancy-task-modal" style="width:480px; background:#ffffff; border:1px solid #e2e8f0; box-shadow:0 20px 45px rgba(15,23,42,0.12);">
        <div class="teacher-modal-header" style="background:linear-gradient(135deg, #eff6ff, #f8fafc); border-bottom:1px solid #e2e8f0; padding:18px 24px; display:flex; justify-content:space-between; align-items:center;">
          <div class="modal-header-title" style="display:flex; align-items:center; gap:10px;">
            <div class="modal-icon-badge" style="background:#dbeafe; color:#2563eb; font-size:20px; padding:6px 10px; border-radius:10px;">✏️</div>
            <div>
              <h3 style="margin:0; font-size:17px; font-weight:800; color:#0f172a;">单条创建学生账号</h3>
              <div style="font-size:12px; color:#64748b; margin-top:2px;">${classTitle}</div>
            </div>
          </div>
          <button class="modal-close-btn" id="btn-close-single-student" style="background:#f1f5f9; border:none; color:#64748b; font-size:16px; border-radius:8px; width:30px; height:30px; cursor:pointer;">✕</button>
        </div>

        <div class="teacher-modal-body" style="padding:22px 24px;">
          <div class="teacher-form-group" style="margin-bottom:14px;">
            <label style="font-size:13px; font-weight:700; color:#334155; margin-bottom:6px; display:block;"><span class="req" style="color:#dc2626;">*</span> 学生姓名</label>
            <input type="text" id="modal-std-name" class="teacher-input fancy" placeholder="请输入学生姓名" value="" style="background:#ffffff; border:1.5px solid #cbd5e1; color:#0f172a; padding:10px 14px; border-radius:8px; width:100%; font-size:13.5px;">
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
          <button class="modal-btn submit task-theme" id="btn-submit-single-std" style="background:linear-gradient(135deg, #1d4ed8, #2563eb); border:none; color:white; padding:8px 20px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer;">${btnTitle}</button>
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
        const isAlreadyExist = users.some(u => (u.id && u.id.trim().toLowerCase() === code.toLowerCase()));
        const targetUser = authManager.addStudentToClass(name, code, targetCls ? targetCls.id : null, pwd || '123');
        if (targetCls) {
          if (isAlreadyExist) {
            alert(`💡 学号【${code}】对应的学生【${targetUser.name}】已存在于系统中，已跳过重复创建并自动关联至本班级【${targetCls.name}】！`);
          } else {
            alert(`🎉 成功创建并添加新学生【${targetUser.name} (学号: ${code})】至当前班级！`);
          }
        } else {
          if (isAlreadyExist) {
            alert(`💡 学号【${code}】对应的学生【${targetUser.name}】已存在于平台总库中，已更新基本信息！`);
          } else {
            alert(`🎉 成功录入新学生【${targetUser.name} (学号: ${code})】至全平台总库！`);
          }
        }
        closeModal();
        renderTeacherPortal(container, authManager, state, onLogout);
      } catch (err) {
        alert('❌ ' + err.message);
      }
    });
  };

  const btnAddStd = container.querySelector('#btn-v1-add-student');
  if (btnAddStd && activeClass) {
    btnAddStd.addEventListener('click', () => openSingleStudentCreateModal(activeClass));
  }
  const btnGlobalAddStd = container.querySelector('#btn-global-add-student');
  if (btnGlobalAddStd) {
    btnGlobalAddStd.addEventListener('click', () => openSingleStudentCreateModal(null));
  }

  // 👥 2. 从总库挑选学生加入本班（只展示待入本班的学生）
  const btnEnrollExisting = container.querySelector('#btn-v1-enroll-existing-student');
  if (btnEnrollExisting && activeClass) {
    btnEnrollExisting.addEventListener('click', () => {
      document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
      const allUsers = authManager.getUsers();
      const currentClassStudentIds = new Set(authManager.getClassStudents(activeClass.id).map(s => s.id));
      const unenrolledStudents = allUsers.filter(u => u.role !== 'teacher' && !currentClassStudentIds.has(u.id));

      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="teacher-modal-card fancy-task-modal" style="width:620px; background:#ffffff; border:1px solid #e2e8f0; box-shadow:0 20px 45px rgba(15,23,42,0.12); border-radius:14px; overflow:hidden;">
          <div class="teacher-modal-header" style="background:linear-gradient(135deg, #eff6ff, #f8fafc); border-bottom:1px solid #e2e8f0; padding:18px 24px; display:flex; justify-content:space-between; align-items:center;">
            <div class="modal-header-title" style="display:flex; align-items:center; gap:10px;">
              <div class="modal-icon-badge" style="background:#dbeafe; color:#2563eb; font-size:20px; padding:6px 10px; border-radius:10px;">👥</div>
              <div>
                <h3 style="margin:0; font-size:17px; font-weight:800; color:#0f172a;">从总库添加已有学生至当前班级</h3>
                <div style="font-size:12px; color:#64748b; margin-top:2px;">目标班级: <b>${activeClass.name}</b> (从全校已有学生账号池中勾选拉入本班)</div>
              </div>
            </div>
            <button class="modal-close-btn" id="btn-close-enroll-modal" style="background:#f1f5f9; border:none; color:#64748b; font-size:16px; border-radius:8px; width:30px; height:30px; cursor:pointer;">✕</button>
          </div>

          <div class="teacher-modal-body" style="padding:20px 24px;">
            <div style="margin-bottom:12px;">
              <input type="text" id="modal-search-enroll-student" placeholder="🔍 搜索待入本班学生姓名或学号..." style="width:100%; box-sizing:border-box; background:#ffffff; border:1.5px solid #cbd5e1; padding:8px 12px; border-radius:8px; font-size:13px; outline:none;">
            </div>

            <div style="border:1px solid #e2e8f0; border-radius:8px; overflow:hidden; background:#ffffff; max-height:280px; overflow-y:auto;">
              <table class="monitor-table" style="font-size:13px; margin:0;">
                <thead style="position:sticky; top:0; background:#f8fafc; z-index:2;">
                  <tr>
                    <th style="width:40px; text-align:center;"><input type="checkbox" id="modal-enroll-select-all" style="accent-color:#2563eb; cursor:pointer;"></th>
                    <th>姓名</th>
                    <th>学号</th>
                    <th>当前归属班级</th>
                  </tr>
                </thead>
                <tbody id="modal-tbody-enroll-students">
                  ${unenrolledStudents.length === 0 ? '<tr><td colspan="4" style="text-align:center; color:#64748b; padding:24px;">全校学生总库中暂无待入本班学生（所有学生已在本班，或总库为空）</td></tr>' : ''}
                  ${unenrolledStudents.map(s => {
                    const studentClasses = classes.filter(c => (s.classIds || [s.classId]).includes(c.id));
                    return `
                      <tr class="modal-enroll-tr" data-search="${(s.name + ' ' + s.id).toLowerCase()}">
                        <td style="text-align:center;"><input type="checkbox" class="enroll-chk" data-uid="${s.id}" style="accent-color:#2563eb; cursor:pointer;"></td>
                        <td><b>${s.avatar || '👤'} ${escapeHtml(s.name)}</b></td>
                        <td><code style="color:#2563eb; font-family:monospace; font-weight:700;">${escapeHtml(s.id)}</code></td>
                        <td>
                          ${studentClasses.length > 0 ? studentClasses.map(c => `<span style="background:#f1f5f9; color:#475569; padding:2px 6px; border-radius:4px; font-size:11px; margin-right:4px;">${escapeHtml(c.name)}</span>`).join('') : '<span style="color:#94a3b8; font-size:12px;">待分班学生</span>'}
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px; font-size:12.5px; color:#64748b;">
              <span id="enroll-selected-count-tip">已选中 0 名学生</span>
              <span>💡 勾选后将自动为当前班级建立名册关联，支持跨班修读</span>
            </div>
          </div>

          <div class="teacher-modal-footer" style="background:#f8fafc; border-top:1px solid #e2e8f0; padding:14px 24px; display:flex; justify-content:flex-end; gap:10px;">
            <button class="modal-btn cancel" id="btn-cancel-enroll" style="background:#ffffff; border:1px solid #cbd5e1; color:#475569; padding:8px 18px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer;">取消</button>
            <button class="modal-btn submit task-theme" id="btn-submit-enroll" style="background:linear-gradient(135deg, #1d4ed8, #2563eb); border:none; color:white; padding:8px 20px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer;">👥 确认拉入本班</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      const closeModal = () => { modal.remove(); };
      modal.querySelector('#btn-close-enroll-modal').addEventListener('click', closeModal);
      modal.querySelector('#btn-cancel-enroll').addEventListener('click', closeModal);
      modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

      const updateCountTip = () => {
        const checkedCount = modal.querySelectorAll('.enroll-chk:checked').length;
        const countTip = modal.querySelector('#enroll-selected-count-tip');
        if (countTip) countTip.innerText = `已选中 ${checkedCount} 名学生`;
      };
      updateCountTip();

      const chkAll = modal.querySelector('#modal-enroll-select-all');
      if (chkAll) {
        chkAll.addEventListener('change', () => {
          modal.querySelectorAll('.modal-enroll-tr').forEach(tr => {
            if (tr.style.display !== 'none') {
              const chk = tr.querySelector('.enroll-chk');
              if (chk) chk.checked = chkAll.checked;
            }
          });
          updateCountTip();
        });
      }
      modal.querySelectorAll('.enroll-chk').forEach(c => c.addEventListener('change', updateCountTip));

      // 🔍 模糊搜索过滤
      const searchEnrollInput = modal.querySelector('#modal-search-enroll-student');
      if (searchEnrollInput) {
        searchEnrollInput.addEventListener('input', (e) => {
          const q = (e.target.value || '').trim().toLowerCase();
          modal.querySelectorAll('.modal-enroll-tr').forEach(el => {
            const str = el.dataset.search || '';
            el.style.display = (!q || str.includes(q)) ? '' : 'none';
          });
        });
      }

      // 👥 提交保存拉入本班
      modal.querySelector('#btn-submit-enroll').addEventListener('click', () => {
        const checkedUids = Array.from(modal.querySelectorAll('.enroll-chk:checked')).map(c => c.dataset.uid);
        if (checkedUids.length === 0) {
          alert('⚠️ 请先勾选要拉入本班的学生！');
          return;
        }
        const users = authManager.getUsers();
        const classes = authManager.getClasses();
        const curCls = classes.find(c => c.id === activeClass.id);
        if (!curCls) return;

        // 为选中的学生追加当前班级
        checkedUids.forEach(uid => {
          const u = users.find(x => x.id === uid);
          if (u) {
            if (!u.classIds || !Array.isArray(u.classIds)) u.classIds = u.classId ? [u.classId] : [];
            if (!u.classIds.includes(activeClass.id)) u.classIds.push(activeClass.id);
            if (!u.classId) u.classId = activeClass.id;
          }
        });

        if (!curCls.studentIds) curCls.studentIds = [];
        checkedUids.forEach(uid => {
          if (!curCls.studentIds.includes(uid)) curCls.studentIds.push(uid);
        });

        localStorage.setItem(STORAGE_KEY_USERS_DB, JSON.stringify(users));
        localStorage.setItem(STORAGE_KEY_CLASSES, JSON.stringify(classes));
        authManager.pushGlobalMeta();
        alert(`🎉 成功将选中的 ${checkedUids.length} 名学生加入班级【${activeClass.name}】！`);
        closeModal();
        renderTeacherPortal(container, authManager, state, onLogout);
      });
    });
  }

  // 📥 3. 上传 XLSX/CSV 文件或粘贴名册批量导入学生（通用：支持班级空间与总库空间）
  const openBatchImportModal = (targetCls = null) => {
    document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    const classSub = targetCls ? `（导入至班级: ${targetCls.name}）` : `（导入至全平台学生总库）`;
    modal.innerHTML = `
      <div class="teacher-modal-card fancy-task-modal" style="width:620px; background:#ffffff; border:1px solid #e2e8f0; box-shadow:0 20px 45px rgba(15,23,42,0.15); border-radius:16px; overflow:hidden;">
        <div class="teacher-modal-header" style="background:linear-gradient(135deg, #1d4ed8, #2563eb); color:#ffffff; padding:18px 24px; display:flex; justify-content:space-between; align-items:center;">
          <div class="modal-header-title" style="display:flex; align-items:center; gap:10px;">
            <div class="modal-icon-badge" style="background:rgba(255,255,255,0.2); color:#ffffff; font-size:20px; padding:6px 10px; border-radius:10px;">📥</div>
            <div>
              <h3 style="margin:0; font-size:17px; font-weight:800; color:#ffffff;">批量导入学生账号 ${classSub}</h3>
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
            <textarea id="modal-paste-textarea" class="teacher-textarea fancy" style="min-height:90px; font-family:monospace; font-size:13px; width:100%; box-sizing:border-box; padding:10px 12px; border:1.5px solid #cbd5e1; border-radius:8px; outline:none;" placeholder="每行一位学生，逗号或空格分隔：&#10;姓名, 学号, 初始密码(可选)"></textarea>
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
      const { createdCount, linkedCount, totalProcessed, linkedList } = authManager.batchAddStudentsToClass(listToImport, targetCls ? targetCls.id : null);
      let tipMsg = targetCls
        ? `🎉 名册导入完成！\n\n✅ 当前班级【${targetCls.name}】共计导入/就绪学生: ${totalProcessed} 人\n• 🆕 全新创建入库: ${createdCount} 人\n• 🔗 关联已有账号: ${linkedCount} 人`
        : `🎉 学生总库导入完成！\n\n✅ 全平台总库共计导入学生: ${totalProcessed} 人\n• 🆕 全新创建入库: ${createdCount} 人\n• 🔄 更新已有账号: ${linkedCount} 人`;
      if (linkedList && linkedList.length > 0) {
        tipMsg += `\n\n💡 以下 ${linkedList.length} 位学生已存在于系统数据库：\n` + 
          linkedList.map((s, idx) => `${idx + 1}. ${s.name} (学号: ${s.code})`).join('\n');
      }
      alert(tipMsg);
      closeModal();
      renderTeacherPortal(container, authManager, state, onLogout);
    });
  };

  const btnImportFile = container.querySelector('#btn-v1-import-file');
  if (btnImportFile && activeClass) {
    btnImportFile.addEventListener('click', () => openBatchImportModal(activeClass));
  }
  const btnGlobalImportFile = container.querySelector('#btn-global-import-file');
  if (btnGlobalImportFile) {
    btnGlobalImportFile.addEventListener('click', () => openBatchImportModal(null));
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
                const isChecked = currentMembers.some(m => {
                  const mId = String((typeof m === 'object' && m !== null) ? (m.id || m.userId || m.name) : m).trim().toLowerCase();
                  return mId === String(s.id).trim().toLowerCase() || mId === String(s.name).trim().toLowerCase();
                });
                return `
                  <div class="grp-student-item" data-search="${(s.name + ' ' + (s.id || '')).toLowerCase()}" style="display:flex; justify-content:space-between; align-items:center; background:#ffffff; border:1px solid #e2e8f0; padding:10px 14px; border-radius:8px; transition:all 0.15s;">
                    <label style="display:flex; align-items:center; gap:10px; cursor:pointer; font-size:13.5px; color:#0f172a; font-weight:600; width:100%;">
                      <input type="checkbox" class="chk-grp-member" value="${s.id}" ${isChecked ? 'checked' : ''} style="width:17px; height:17px; cursor:pointer; accent-color:#2563eb;">
                      <span>${s.avatar || '👤'} <b>${s.name}</b> <code style="color:#2563eb; font-family:monospace; margin-left:4px;">${s.id}</code></span>
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
        renderTeacherPortal(container, authManager, state, onLogout);
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

  container.querySelectorAll('.delete-student-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      authManager.deleteStudent(btn.dataset.id, activeClass.id);
      renderTeacherPortal(container, authManager, state, onLogout);
    });
  });

  container.querySelectorAll('.btn-delete-group').forEach(btn => {
    btn.addEventListener('click', () => {
      authManager.deleteGroup(activeClass.id, btn.dataset.gid);
      renderTeacherPortal(container, authManager, state, onLogout);
    });
  });

  // 🎲 随机分组 (按教师所选人数自动洗牌划分小组)
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
          renderTeacherPortal(container, authManager, state, onLogout);
          alert(`✅ 已成功将未进组学生随机分配完成！`);
        });

        modal.querySelector('#btn-rand-mode-reset').addEventListener('click', () => {
          if (confirm(`⚠️ 确认将全班 ${classStudents.length} 名学生全员打散重新分组？`)) {
            closeModal();
            authManager.autoRandomGrouping(activeClass.id, groupSize, 'reset_all');
            renderTeacherPortal(container, authManager, state, onLogout);
            alert(`✅ 已完成全员打散重组！`);
          }
        });
      } else {
        // 当前没有小组，直接执行随机分组
        const totalGroups = authManager.autoRandomGrouping(activeClass.id, groupSize, 'reset_all');
        renderTeacherPortal(container, authManager, state, onLogout);
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
        renderTeacherPortal(container, authManager, state, onLogout);
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
    const tId = selSurveyTask ? selSurveyTask.value : (currentClassTasks[0] ? currentClassTasks[0].id : '');
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
      const targetTaskId = selSurveyTask ? selSurveyTask.value : (currentClassTasks[0] ? currentClassTasks[0].id : '');
      const url = urlInput ? urlInput.value.trim() : '';
      if (!url) { alert('⚠️ 请先填入有效的问卷链接！'); return; }
      
      authManager.saveSurvey(targetClassId, targetTaskId, url);
      
      if (window.app && window.app.cloudSyncEngine) {
        window.app.cloudSyncEngine.pushSnapshot();
      }

      alert('✅ 问卷链接已成功保存并永久同步！');
      renderTeacherPortal(container, authManager, state, onLogout);
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
        renderTeacherPortal(container, authManager, state, onLogout);
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

            <div class="teacher-form-group">
              <label style="font-size:12.5px; font-weight:700; color:#334155; margin-bottom:4px; display:block;">🎯 目标字数要求</label>
              <div style="display:flex; align-items:center; gap:8px;">
                <input type="number" id="modal-edit-task-words" class="teacher-input fancy" value="${task.targetWordCount || 3000}" min="500" step="100" style="width:120px; font-size:13.5px; font-weight:700; padding:8px 12px; border:1.5px solid #cbd5e1; border-radius:8px; text-align:center;">
                <span style="font-size:13px; font-weight:700; color:#475569;">字</span>
              </div>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
              <div class="teacher-form-group">
                <label style="font-size:12.5px; font-weight:700; color:#334155; margin-bottom:4px; display:block;"><span class="req" style="color:#dc2626;">*</span> 📅 任务开始时间</label>
                <input type="datetime-local" id="modal-edit-task-start" class="teacher-input fancy" value="${currentStart}" style="width:100%; font-size:12.5px; padding:8px 10px; border:1.5px solid #cbd5e1; border-radius:8px;">
              </div>
              <div class="teacher-form-group">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                  <label style="font-size:12.5px; font-weight:700; color:#334155; margin:0;"><span class="req" style="color:#dc2626;">*</span> ⌛ 任务截止时间</label>
                  <span id="modal-edit-task-duration-badge" style="font-size:11px; font-weight:800; color:#1d4ed8; background:#eff6ff; border:1px solid #bfdbfe; padding:2px 8px; border-radius:6px;">⏱️ 总时长: ${formatDurationHuman(task.durationMinutes || 120)}</span>
                </div>
                <input type="datetime-local" id="modal-edit-task-deadline" class="teacher-input fancy" value="${currentDeadline}" style="width:100%; font-size:12.5px; padding:8px 10px; border:1.5px solid #cbd5e1; border-radius:8px;">
              </div>
            </div>

            <!-- 🕒 核心功能区：一键设定任务总时长 -->
            <div style="background:#f8fafc; border:1.5px solid #cbd5e1; border-radius:10px; padding:12px 14px;">
              <div style="font-size:12px; font-weight:700; color:#1e293b; margin-bottom:8px; display:flex; align-items:center; gap:6px;">
                <span>🕒 一键设定任务总时长</span>
              </div>
              
              <!-- 快捷总时长预设胶囊 (6列完美对称网格) -->
              <div style="display:grid; grid-template-columns:repeat(6, 1fr); gap:6px; margin-bottom:10px;">
                <button type="button" class="btn-edit-set-duration" data-mins="15" style="background:#ffffff; border:1px solid #cbd5e1; color:#1e293b; padding:5px 0; border-radius:6px; font-size:11.5px; font-weight:700; cursor:pointer; text-align:center;">15分钟</button>
                <button type="button" class="btn-edit-set-duration" data-mins="30" style="background:#ffffff; border:1px solid #cbd5e1; color:#1e293b; padding:5px 0; border-radius:6px; font-size:11.5px; font-weight:700; cursor:pointer; text-align:center;">30分钟</button>
                <button type="button" class="btn-edit-set-duration" data-mins="45" style="background:#ffffff; border:1px solid #cbd5e1; color:#1e293b; padding:5px 0; border-radius:6px; font-size:11.5px; font-weight:700; cursor:pointer; text-align:center;">45分钟</button>
                <button type="button" class="btn-edit-set-duration" data-mins="60" style="background:#ffffff; border:1px solid #cbd5e1; color:#1e293b; padding:5px 0; border-radius:6px; font-size:11.5px; font-weight:700; cursor:pointer; text-align:center;">1小时</button>
                <button type="button" class="btn-edit-set-duration" data-mins="90" style="background:#ffffff; border:1px solid #cbd5e1; color:#1e293b; padding:5px 0; border-radius:6px; font-size:11.5px; font-weight:700; cursor:pointer; text-align:center;">1.5小时</button>
                <button type="button" class="btn-edit-set-duration" data-mins="120" style="background:#eff6ff; border:1.5px solid #2563eb; color:#1d4ed8; padding:5px 0; border-radius:6px; font-size:11.5px; font-weight:800; cursor:pointer; text-align:center;">2小时</button>
                <button type="button" class="btn-edit-set-duration" data-mins="180" style="background:#ffffff; border:1px solid #cbd5e1; color:#1e293b; padding:5px 0; border-radius:6px; font-size:11.5px; font-weight:700; cursor:pointer; text-align:center;">3小时</button>
                <button type="button" class="btn-edit-set-duration" data-mins="360" style="background:#ffffff; border:1px solid #cbd5e1; color:#1e293b; padding:5px 0; border-radius:6px; font-size:11.5px; font-weight:700; cursor:pointer; text-align:center;">6小时</button>
                <button type="button" class="btn-edit-set-duration" data-mins="720" style="background:#ffffff; border:1px solid #cbd5e1; color:#1e293b; padding:5px 0; border-radius:6px; font-size:11.5px; font-weight:700; cursor:pointer; text-align:center;">12小时</button>
                <button type="button" class="btn-edit-set-duration" data-mins="1440" style="background:#eff6ff; border:1px solid #bfdbfe; color:#2563eb; padding:5px 0; border-radius:6px; font-size:11.5px; font-weight:700; cursor:pointer; text-align:center;">1天</button>
                <button type="button" class="btn-edit-set-duration" data-mins="4320" style="background:#eff6ff; border:1px solid #bfdbfe; color:#2563eb; padding:5px 0; border-radius:6px; font-size:11.5px; font-weight:700; cursor:pointer; text-align:center;">3天</button>
                <button type="button" class="btn-edit-set-duration" data-mins="10080" style="background:#f0fdf4; border:1px solid #bbf7d0; color:#16a34a; padding:5px 0; border-radius:6px; font-size:11.5px; font-weight:700; cursor:pointer; text-align:center;">1周</button>
              </div>

              <!-- 自定义时长数值 + 单位输入 (左右对称分布) -->
              <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap; padding-top:8px; border-top:1px dashed #cbd5e1;">
                <div style="display:flex; align-items:center; gap:6px;">
                  <span style="font-size:12px; color:#475569; font-weight:700;">自定义:</span>
                  <input type="number" id="modal-edit-custom-dur-num" value="2" min="0.1" step="any" style="width:55px; padding:4px 6px; border:1.5px solid #cbd5e1; border-radius:6px; font-size:12.5px; font-weight:700; text-align:center; outline:none;">
                  <select id="modal-edit-custom-dur-unit" style="padding:4px 6px; border:1.5px solid #cbd5e1; border-radius:6px; font-size:12px; font-weight:700; background:#ffffff; cursor:pointer; outline:none;">
                    <option value="minute">分钟</option>
                    <option value="hour" selected>小时</option>
                    <option value="day">天</option>
                    <option value="week">周</option>
                  </select>
                  <button type="button" id="btn-edit-apply-custom-dur" style="background:linear-gradient(135deg, #1d4ed8, #2563eb); color:white; border:none; padding:5px 12px; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer; box-shadow:0 2px 6px rgba(37,99,235,0.2);">
                    ⚡ 设定
                  </button>
                </div>
                
                <div style="display:flex; align-items:center; gap:4px;">
                  <span style="font-size:11.5px; color:#64748b; font-weight:700;">微调:</span>
                  <button type="button" class="btn-edit-nudge" data-diff="15" style="background:#ffffff; border:1px solid #cbd5e1; color:#1e293b; padding:3px 7px; border-radius:5px; font-size:11px; font-weight:700; cursor:pointer;">+15分</button>
                  <button type="button" class="btn-edit-nudge" data-diff="30" style="background:#ffffff; border:1px solid #cbd5e1; color:#1e293b; padding:3px 7px; border-radius:5px; font-size:11px; font-weight:700; cursor:pointer;">+30分</button>
                  <button type="button" class="btn-edit-nudge" data-diff="-15" style="background:#fff1f2; border:1px solid #fecdd3; color:#be123c; padding:3px 7px; border-radius:5px; font-size:11px; font-weight:700; cursor:pointer;">-15分</button>
                  <button type="button" class="btn-edit-nudge" data-diff="-30" style="background:#fff1f2; border:1px solid #fecdd3; color:#be123c; padding:3px 7px; border-radius:5px; font-size:11px; font-weight:700; cursor:pointer;">-30分</button>
                </div>
              </div>
            </div>

            <div class="teacher-form-group">
              <label style="font-size:12.5px; font-weight:700; color:#334155; margin-bottom:4px; display:block;">📝 任务说明与要求 (选填)</label>
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
      const durationBadge = modal.querySelector('#modal-edit-task-duration-badge');

      const pad = (n) => String(n).padStart(2, '0');
      const formatLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

      const updateDurationBadge = () => {
        if (!startInput || !deadlineInput) return;
        const s = new Date(startInput.value);
        const d = new Date(deadlineInput.value);
        if (!isNaN(s.getTime()) && !isNaN(d.getTime())) {
          const diffMins = Math.round((d.getTime() - s.getTime()) / (60 * 1000));
          if (diffMins > 0) {
            if (durationBadge) {
              durationBadge.innerHTML = `⏱️ 总时长: <b style="color:#1d4ed8;">${formatDurationHuman(diffMins)}</b>`;
              durationBadge.style.color = '#1d4ed8';
              durationBadge.style.background = '#eff6ff';
              durationBadge.style.borderColor = '#bfdbfe';
            }
            modal.querySelectorAll('.btn-edit-set-duration').forEach(btn => {
              const m = parseInt(btn.dataset.mins, 10);
              if (m === diffMins) {
                btn.style.background = '#eff6ff';
                btn.style.borderColor = '#2563eb';
                btn.style.color = '#1d4ed8';
                btn.style.fontWeight = '800';
                btn.style.boxShadow = '0 1px 4px rgba(37,99,235,0.2)';
              } else {
                btn.style.background = '#ffffff';
                btn.style.borderColor = '#cbd5e1';
                btn.style.color = '#1e293b';
                btn.style.fontWeight = '700';
                btn.style.boxShadow = 'none';
              }
            });
          } else {
            if (durationBadge) {
              durationBadge.innerHTML = `⚠️ 截止时间不能早于开始时间`;
              durationBadge.style.color = '#dc2626';
              durationBadge.style.background = '#fee2e2';
              durationBadge.style.borderColor = '#fca5a5';
            }
          }
        }
      };

      // 🕒 点击一键设定任务总时长胶囊（从开始时间起算）
      modal.querySelectorAll('.btn-edit-set-duration').forEach(btn => {
        btn.addEventListener('click', () => {
          const mins = parseInt(btn.dataset.mins, 10);
          if (!mins || mins <= 0) return;
          let s = new Date();
          if (startInput && startInput.value) {
            const p = new Date(startInput.value);
            if (!isNaN(p.getTime())) s = p;
          }
          const newD = new Date(s.getTime() + mins * 60 * 1000);
          if (deadlineInput) {
            deadlineInput.value = formatLocal(newD);
            deadlineInput.style.borderColor = '#2563eb';
            setTimeout(() => { if (deadlineInput) deadlineInput.style.borderColor = '#cbd5e1'; }, 400);
          }
          updateDurationBadge();
        });
      });

      // ⚡ 自定义设定总时长（从开始时间起算）
      modal.querySelector('#btn-edit-apply-custom-dur')?.addEventListener('click', () => {
        const num = parseFloat(modal.querySelector('#modal-edit-custom-dur-num')?.value) || 0;
        const unit = modal.querySelector('#modal-edit-custom-dur-unit')?.value || 'hour';
        if (num <= 0) {
          alert('请输入大于 0 的有效时长数值！');
          return;
        }
        let msMultiplier = 3600 * 1000;
        if (unit === 'minute') msMultiplier = 60 * 1000;
        else if (unit === 'hour') msMultiplier = 3600 * 1000;
        else if (unit === 'day') msMultiplier = 24 * 3600 * 1000;
        else if (unit === 'week') msMultiplier = 7 * 24 * 3600 * 1000;

        let s = new Date();
        if (startInput && startInput.value) {
          const p = new Date(startInput.value);
          if (!isNaN(p.getTime())) s = p;
        }
        const newD = new Date(s.getTime() + num * msMultiplier);
        if (deadlineInput) {
          deadlineInput.value = formatLocal(newD);
          deadlineInput.style.borderColor = '#2563eb';
          setTimeout(() => { if (deadlineInput) deadlineInput.style.borderColor = '#cbd5e1'; }, 400);
        }
        updateDurationBadge();
      });

      // 微调按钮
      modal.querySelectorAll('.btn-edit-nudge').forEach(btn => {
        btn.addEventListener('click', () => {
          const diff = parseInt(btn.dataset.diff, 10) || 0;
          if (!diff) return;
          let curD = new Date();
          if (deadlineInput && deadlineInput.value) {
            const p = new Date(deadlineInput.value);
            if (!isNaN(p.getTime())) curD = p;
          }
          const newD = new Date(curD.getTime() + diff * 60 * 1000);
          if (deadlineInput) {
            deadlineInput.value = formatLocal(newD);
            deadlineInput.style.borderColor = diff > 0 ? '#2563eb' : '#be123c';
            setTimeout(() => { if (deadlineInput) deadlineInput.style.borderColor = '#cbd5e1'; }, 400);
          }
          updateDurationBadge();
        });
      });

      startInput?.addEventListener('input', updateDurationBadge);
      startInput?.addEventListener('change', updateDurationBadge);
      deadlineInput?.addEventListener('input', updateDurationBadge);
      deadlineInput?.addEventListener('change', updateDurationBadge);
      updateDurationBadge();

      modal.querySelector('#btn-submit-edit-task').addEventListener('click', () => {
        const newTitle = modal.querySelector('#modal-edit-task-title').value.trim();
        const newStart = modal.querySelector('#modal-edit-task-start').value;
        const newDeadline = modal.querySelector('#modal-edit-task-deadline').value;
        const newDesc = modal.querySelector('#modal-edit-task-desc').value.trim();
        const newWords = parseInt(modal.querySelector('#modal-edit-task-words')?.value, 10) || 3000;

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
          authManager.updateTask(taskId, newTitle, newDesc, fmtTimeStr(newStart), fmtTimeStr(newDeadline), calculatedDuration, newWords);
          closeModal();
          alert(`✅ 写作任务《${newTitle}》已成功修改，时间与内容已全网即时同步！`);
          renderTeacherPortal(container, authManager, state, onLogout);
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
        <div class="teacher-modal-card fancy-task-modal" style="width:520px; max-width:92vw;">
          <div class="teacher-modal-header" style="background:linear-gradient(135deg, #0284c7, #0ea5e9); color:white; padding:18px 24px;">
            <div class="modal-header-title">
              <div class="modal-icon-badge" style="background:rgba(255,255,255,0.25); color:white; font-size:20px; padding:6px 10px; border-radius:10px;">⏱️</div>
              <div>
                <h3 style="margin:0; font-size:17px; font-weight:800; color:white;">调整写作任务截止时间</h3>
                <div style="font-size:11.5px; opacity:0.9; margin-top:2px;">支持自由延期或提前回退，调整后全班学生端将即时生效</div>
              </div>
            </div>
            <button class="modal-close-btn" id="btn-close-extend-modal" style="background:rgba(255,255,255,0.2); border:none; color:white; font-size:16px; border-radius:8px; width:30px; height:30px; cursor:pointer;">✕</button>
          </div>
          <div class="teacher-modal-body" style="padding:20px 24px; display:flex; flex-direction:column; gap:14px;">
            <div style="font-size:13.5px; color:#1e293b; font-weight:700;">
              任务名称：<span style="color:#0284c7;">📌 ${escapeHtml(task.title)}</span>
            </div>
            <div style="font-size:12.5px; color:#64748b; background:#f8fafc; padding:8px 12px; border-radius:8px; border:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
              <span>当前最新截止时间：<b style="color:${isPastDeadline ? '#dc2626' : '#0284c7'};">${displayCurrentDeadline}</b></span>
              ${isPastDeadline ? '<span style="background:#fee2e2; color:#dc2626; font-size:11px; font-weight:800; padding:2px 6px; border-radius:4px;">已截止 (只读模式)</span>' : '<span style="background:#ecfdf5; color:#059669; font-size:11px; font-weight:800; padding:2px 6px; border-radius:4px;">进行中 (开放编辑)</span>'}
            </div>

            <!-- 顺延与回退快捷预设 -->
            <div style="display:flex; flex-direction:column; gap:6px;">
              <label style="font-size:12.5px; font-weight:700; color:#334155;">⚡ 快捷顺延 (延长时长)：</label>
              <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:8px;">
                <button type="button" class="btn-quick-extend" data-mins="30" style="background:#f0fdf4; border:1px solid #86efac; color:#15803d; padding:8px 0; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer;">+30 分钟</button>
                <button type="button" class="btn-quick-extend" data-mins="60" style="background:#eff6ff; border:1px solid #93c5fd; color:#1d4ed8; padding:8px 0; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer;">+1 小时</button>
                <button type="button" class="btn-quick-extend" data-mins="120" style="background:#fef3c7; border:1px solid #fcd34d; color:#b45309; padding:8px 0; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer;">+2 小时</button>
                <button type="button" class="btn-quick-extend" data-mins="1440" style="background:#faf5ff; border:1px solid #d8b4fe; color:#7e22ce; padding:8px 0; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer;">+1 天</button>
              </div>
            </div>

            <div style="display:flex; flex-direction:column; gap:6px;">
              <label style="font-size:12.5px; font-weight:700; color:#64748b;">⏪ 快捷回退 (提前截止)：</label>
              <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:8px;">
                <button type="button" class="btn-quick-extend" data-mins="-15" style="background:#fff1f2; border:1px solid #fecdd3; color:#be123c; padding:6px 0; border-radius:8px; font-size:11.5px; font-weight:700; cursor:pointer;">-15 分钟</button>
                <button type="button" class="btn-quick-extend" data-mins="-30" style="background:#fff1f2; border:1px solid #fecdd3; color:#be123c; padding:6px 0; border-radius:8px; font-size:11.5px; font-weight:700; cursor:pointer;">-30 分钟</button>
                <button type="button" class="btn-quick-extend" data-mins="-60" style="background:#fff1f2; border:1px solid #fecdd3; color:#be123c; padding:6px 0; border-radius:8px; font-size:11.5px; font-weight:700; cursor:pointer;">-1 小时</button>
                <button type="button" class="btn-quick-extend" data-mins="-1440" style="background:#fff1f2; border:1px solid #fecdd3; color:#be123c; padding:6px 0; border-radius:8px; font-size:11.5px; font-weight:700; cursor:pointer;">-1 天</button>
              </div>
            </div>

            <div style="display:flex; flex-direction:column; gap:6px;">
              <label style="font-size:12.5px; font-weight:700; color:#334155;">📅 指定新的截止时间：</label>
              <input type="datetime-local" id="input-extend-deadline" class="teacher-input fancy" value="${formatLocalDateForInput(new Date(baseDate.getTime() + 60 * 60 * 1000))}" style="width:100%; font-size:13px; padding:9px 12px; border:1.5px solid #cbd5e1; border-radius:8px;">
            </div>
          </div>
          <div class="teacher-modal-footer" style="background:#f8fafc; border-top:1px solid #e2e8f0; padding:14px 24px; display:flex; justify-content:flex-end; gap:10px;">
            <button class="modal-btn cancel" id="btn-cancel-extend" style="background:#ffffff; border:1px solid #cbd5e1; color:#475569; padding:8px 18px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer;">取消</button>
            <button class="modal-btn submit" id="btn-save-extend" style="background:linear-gradient(135deg, #0284c7, #0ea5e9); border:none; color:white; padding:8px 22px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; box-shadow:0 3px 10px rgba(2,132,199,0.25);">💾 确认调整截止时间</button>
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
          // 基于当前输入框中的时间进行加减，实现连加连减
          let curDate = new Date();
          if (dlInput && dlInput.value) {
            const p = new Date(dlInput.value);
            if (!isNaN(p.getTime())) curDate = p;
          } else {
            curDate = baseDate;
          }
          const newD = new Date(curDate.getTime() + mins * 60 * 1000);
          dlInput.value = formatLocalDateForInput(newD);
          dlInput.style.borderColor = mins >= 0 ? '#0284c7' : '#be123c';
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
          showGlobalBannerNotice('✅ 调整成功', `写作任务《${task.title}》截止时间已调整至 ${newDeadlineStr}！`, 'success');
          renderTeacherPortal(container, authManager, state, onLogout);
        } catch (err) {
          alert('❌ ' + err.message);
        }
      });
    });
  });

  // 🗑️ 删除写作任务按钮（现代美观模态弹窗，杜绝浏览器自带 confirm 拦截屏蔽）
  container.querySelectorAll('.btn-delete-task').forEach(btn => {
    btn.addEventListener('click', () => {
      const taskId = btn.dataset.id;
      const taskTitle = btn.dataset.title || '此写作任务';

      document.querySelectorAll('.modal-task-confirm-overlay').forEach(el => el.remove());
      const modal = document.createElement('div');
      modal.className = 'modal-overlay modal-task-confirm-overlay';
      modal.style.cssText = 'z-index:999999; display:flex; align-items:center; justify-content:center; position:fixed; inset:0; background:rgba(15,23,42,0.65); backdrop-filter:blur(5px);';
      modal.innerHTML = `
        <div class="modal-card" style="background:#ffffff; border-radius:16px; max-width:440px; width:92%; padding:28px 24px; box-shadow:0 25px 60px -12px rgba(0,0,0,0.35); text-align:center; animation:modalPop 0.25s cubic-bezier(0.16,1,0.3,1); border:1.5px solid #fee2e2;">
          <div style="width:56px; height:56px; border-radius:50%; background:#fee2e2; color:#ef4444; display:flex; align-items:center; justify-content:center; margin:0 auto 16px; font-size:28px; box-shadow:0 4px 12px rgba(239,68,68,0.2);">🗑️</div>
          <h3 style="margin:0 0 10px; font-size:19px; color:#0f172a; font-weight:800;">确认删除写作任务？</h3>
          <p style="margin:0 0 22px; font-size:14px; color:#475569; line-height:1.65;">
            您即将删除任务《<b style="color:#dc2626;">${escapeHtml(taskTitle)}</b>》。<br/>
            删除后该任务将从所有教师端与学生端移除，正在该任务中协作的学生将自动收到撤销提示并返回大厅。
          </p>
          <div style="display:flex; gap:10px; justify-content:center;">
            <button id="btn-cancel-del-task-modal" style="flex:1; padding:10px 16px; border-radius:8px; border:1px solid #cbd5e1; background:#f8fafc; color:#475569; font-size:13.5px; font-weight:700; cursor:pointer; transition:all 0.15s ease;">取消</button>
            <button id="btn-confirm-del-task-modal" style="flex:1; padding:10px 16px; border-radius:8px; border:none; background:linear-gradient(135deg, #dc2626, #b91c1c); color:#ffffff; font-size:13.5px; font-weight:700; cursor:pointer; box-shadow:0 2px 8px rgba(220,38,38,0.3);">确认删除</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      const closeModal = () => { modal.remove(); };
      modal.querySelector('#btn-cancel-del-task-modal').addEventListener('click', closeModal);
      modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

      modal.querySelector('#btn-confirm-del-task-modal').addEventListener('click', () => {
        closeModal();
        authManager.deleteTask(taskId);
        showGlobalBannerNotice('✅ 任务已删除', `写作任务《${taskTitle}》已成功删除并同步撤销！`, 'success');
        renderTeacherPortal(container, authManager, state, onLogout);
      });
    });
  });

  // 🗑️ 删除课堂通知按钮
  container.querySelectorAll('.btn-delete-announcement').forEach(btn => {
    btn.addEventListener('click', () => {
      const annId = btn.dataset.id;
      const annTitle = btn.dataset.title || '此通知';

      document.querySelectorAll('.modal-ann-confirm-overlay').forEach(el => el.remove());
      const modal = document.createElement('div');
      modal.className = 'modal-overlay modal-ann-confirm-overlay';
      modal.style.cssText = 'z-index:999999; display:flex; align-items:center; justify-content:center; position:fixed; inset:0; background:rgba(15,23,42,0.65); backdrop-filter:blur(5px);';
      modal.innerHTML = `
        <div class="modal-card" style="background:#ffffff; border-radius:16px; max-width:440px; width:92%; padding:28px 24px; box-shadow:0 25px 60px -12px rgba(0,0,0,0.35); text-align:center; animation:modalPop 0.25s cubic-bezier(0.16,1,0.3,1); border:1.5px solid #fee2e2;">
          <div style="width:56px; height:56px; border-radius:50%; background:#fee2e2; color:#ef4444; display:flex; align-items:center; justify-content:center; margin:0 auto 16px; font-size:28px; box-shadow:0 4px 12px rgba(239,68,68,0.2);">🗑️</div>
          <h3 style="margin:0 0 10px; font-size:19px; color:#0f172a; font-weight:800;">确认删除课堂通知？</h3>
          <p style="margin:0 0 22px; font-size:14px; color:#475569; line-height:1.65;">
            您即将删除通知《<b style="color:#dc2626;">${escapeHtml(annTitle)}</b>》。<br/>
            删除后该通知将从所有学生端的弹窗和通知中心中撤销。
          </p>
          <div style="display:flex; gap:10px; justify-content:center;">
            <button id="btn-cancel-del-ann-modal" style="flex:1; padding:10px 16px; border-radius:8px; border:1px solid #cbd5e1; background:#f8fafc; color:#475569; font-size:13.5px; font-weight:700; cursor:pointer;">取消</button>
            <button id="btn-confirm-del-ann-modal" style="flex:1; padding:10px 16px; border-radius:8px; border:none; background:linear-gradient(135deg, #dc2626, #b91c1c); color:#ffffff; font-size:13.5px; font-weight:700; cursor:pointer; box-shadow:0 2px 8px rgba(220,38,38,0.3);">确认删除</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      const closeModal = () => { modal.remove(); };
      modal.querySelector('#btn-cancel-del-ann-modal').addEventListener('click', closeModal);
      modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

      modal.querySelector('#btn-confirm-del-ann-modal').addEventListener('click', () => {
        closeModal();
        authManager.deleteAnnouncement(annId);
        showGlobalBannerNotice('✅ 通知已删除', `课堂通知《${annTitle}》已成功删除！`, 'success');
        renderTeacherPortal(container, authManager, state, onLogout);
      });
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
      const deadlineDate = new Date(now.getTime() + 120 * 60 * 1000); // 默认 2 小时
      const deadlineStr = formatLocal(deadlineDate);

      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="teacher-modal-card fancy-task-modal" style="width:530px; max-width:94vw;">
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
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                  <label style="margin:0;"><span class="req">*</span> ⌛ 任务截止时间</label>
                  <span id="modal-task-duration-badge" style="font-size:11px; font-weight:800; color:#1d4ed8; background:#eff6ff; border:1px solid #bfdbfe; padding:2px 8px; border-radius:6px;">⏱️ 总时长: 2小时</span>
                </div>
                <input type="datetime-local" id="modal-task-deadline" class="teacher-input fancy" value="${deadlineStr}">
              </div>
            </div>

            <!-- 🕒 核心功能区：一键设定任务总时长 -->
            <div style="background:#f8fafc; border:1.5px solid #cbd5e1; border-radius:10px; padding:12px 14px; margin-top:8px;">
              <div style="font-size:12px; font-weight:700; color:#1e293b; margin-bottom:8px; display:flex; align-items:center; gap:6px;">
                <span>🕒 一键设定任务总时长</span>
              </div>
              
              <!-- 快捷总时长预设胶囊 (6列完美对称网格) -->
              <div style="display:grid; grid-template-columns:repeat(6, 1fr); gap:6px; margin-bottom:10px;" id="modal-create-duration-capsules">
                <button type="button" class="btn-create-set-duration" data-mins="15" style="background:#ffffff; border:1px solid #cbd5e1; color:#1e293b; padding:5px 0; border-radius:6px; font-size:11.5px; font-weight:700; cursor:pointer; text-align:center;">15分钟</button>
                <button type="button" class="btn-create-set-duration" data-mins="30" style="background:#ffffff; border:1px solid #cbd5e1; color:#1e293b; padding:5px 0; border-radius:6px; font-size:11.5px; font-weight:700; cursor:pointer; text-align:center;">30分钟</button>
                <button type="button" class="btn-create-set-duration" data-mins="45" style="background:#ffffff; border:1px solid #cbd5e1; color:#1e293b; padding:5px 0; border-radius:6px; font-size:11.5px; font-weight:700; cursor:pointer; text-align:center;">45分钟</button>
                <button type="button" class="btn-create-set-duration" data-mins="60" style="background:#ffffff; border:1px solid #cbd5e1; color:#1e293b; padding:5px 0; border-radius:6px; font-size:11.5px; font-weight:700; cursor:pointer; text-align:center;">1小时</button>
                <button type="button" class="btn-create-set-duration" data-mins="90" style="background:#ffffff; border:1px solid #cbd5e1; color:#1e293b; padding:5px 0; border-radius:6px; font-size:11.5px; font-weight:700; cursor:pointer; text-align:center;">1.5小时</button>
                <button type="button" class="btn-create-set-duration" data-mins="120" style="background:#eff6ff; border:1.5px solid #2563eb; color:#1d4ed8; padding:5px 0; border-radius:6px; font-size:11.5px; font-weight:800; cursor:pointer; text-align:center;">2小时</button>
                <button type="button" class="btn-create-set-duration" data-mins="180" style="background:#ffffff; border:1px solid #cbd5e1; color:#1e293b; padding:5px 0; border-radius:6px; font-size:11.5px; font-weight:700; cursor:pointer; text-align:center;">3小时</button>
                <button type="button" class="btn-create-set-duration" data-mins="360" style="background:#ffffff; border:1px solid #cbd5e1; color:#1e293b; padding:5px 0; border-radius:6px; font-size:11.5px; font-weight:700; cursor:pointer; text-align:center;">6小时</button>
                <button type="button" class="btn-create-set-duration" data-mins="720" style="background:#ffffff; border:1px solid #cbd5e1; color:#1e293b; padding:5px 0; border-radius:6px; font-size:11.5px; font-weight:700; cursor:pointer; text-align:center;">12小时</button>
                <button type="button" class="btn-create-set-duration" data-mins="1440" style="background:#eff6ff; border:1px solid #bfdbfe; color:#2563eb; padding:5px 0; border-radius:6px; font-size:11.5px; font-weight:700; cursor:pointer; text-align:center;">1天</button>
                <button type="button" class="btn-create-set-duration" data-mins="4320" style="background:#eff6ff; border:1px solid #bfdbfe; color:#2563eb; padding:5px 0; border-radius:6px; font-size:11.5px; font-weight:700; cursor:pointer; text-align:center;">3天</button>
                <button type="button" class="btn-create-set-duration" data-mins="10080" style="background:#f0fdf4; border:1px solid #bbf7d0; color:#16a34a; padding:5px 0; border-radius:6px; font-size:11.5px; font-weight:700; cursor:pointer; text-align:center;">1周</button>
              </div>

              <!-- 自定义时长数值 + 单位输入 (左右对称分布) -->
              <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap; padding-top:8px; border-top:1px dashed #cbd5e1;">
                <div style="display:flex; align-items:center; gap:6px;">
                  <span style="font-size:12px; color:#475569; font-weight:700;">自定义:</span>
                  <input type="number" id="modal-create-custom-dur-num" value="2" min="0.1" step="any" style="width:55px; padding:4px 6px; border:1.5px solid #cbd5e1; border-radius:6px; font-size:12.5px; font-weight:700; text-align:center; outline:none;">
                  <select id="modal-create-custom-dur-unit" style="padding:4px 6px; border:1.5px solid #cbd5e1; border-radius:6px; font-size:12px; font-weight:700; background:#ffffff; cursor:pointer; outline:none;">
                    <option value="minute">分钟</option>
                    <option value="hour" selected>小时</option>
                    <option value="day">天</option>
                    <option value="week">周</option>
                  </select>
                  <button type="button" id="btn-create-apply-custom-dur" style="background:linear-gradient(135deg, #1d4ed8, #2563eb); color:white; border:none; padding:5px 12px; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer; box-shadow:0 2px 6px rgba(37,99,235,0.2);">
                    ⚡ 设定
                  </button>
                </div>
                
                <div style="display:flex; align-items:center; gap:4px;">
                  <span style="font-size:11.5px; color:#64748b; font-weight:700;">微调:</span>
                  <button type="button" class="btn-create-nudge" data-diff="15" style="background:#ffffff; border:1px solid #cbd5e1; color:#1e293b; padding:3px 7px; border-radius:5px; font-size:11px; font-weight:700; cursor:pointer;">+15分</button>
                  <button type="button" class="btn-create-nudge" data-diff="30" style="background:#ffffff; border:1px solid #cbd5e1; color:#1e293b; padding:3px 7px; border-radius:5px; font-size:11px; font-weight:700; cursor:pointer;">+30分</button>
                  <button type="button" class="btn-create-nudge" data-diff="-15" style="background:#fff1f2; border:1px solid #fecdd3; color:#be123c; padding:3px 7px; border-radius:5px; font-size:11px; font-weight:700; cursor:pointer;">-15分</button>
                  <button type="button" class="btn-create-nudge" data-diff="-30" style="background:#fff1f2; border:1px solid #fecdd3; color:#be123c; padding:3px 7px; border-radius:5px; font-size:11px; font-weight:700; cursor:pointer;">-30分</button>
                </div>
              </div>
            </div>

            <div class="teacher-form-group" style="margin-top:8px;">
              <label><span class="req">*</span> 📝 任务写作类型</label>
              <select id="modal-task-type" class="teacher-input fancy" style="font-weight:700; background:#ffffff; cursor:pointer; width:100%;">
                <option value="experiment" selected>🧪 实证研究方案</option>
                <option value="instructional">📐 教学设计方案</option>
              </select>
            </div>

            <div class="teacher-form-group" style="margin-top:8px;">
              <label><span class="req">*</span> 写作任务名称</label>
              <input type="text" id="modal-task-title" class="teacher-input fancy" value="" placeholder="输入写作任务名称">
            </div>
            <div class="teacher-form-group">
              <label style="font-size:12.5px; font-weight:700; color:#334155; margin-bottom:4px; display:block;">🎯 目标字数要求</label>
              <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                <div style="display:flex; align-items:center; gap:8px;">
                  <input type="number" id="modal-task-words" class="teacher-input fancy" value="3000" min="500" step="100" style="width:110px; font-size:13.5px; font-weight:700; padding:8px 12px; border:1.5px solid #cbd5e1; border-radius:8px; text-align:center;">
                  <span style="font-size:13px; font-weight:700; color:#475569;">字</span>
                </div>
                <div style="display:flex; gap:6px;">
                  <button type="button" class="btn-create-quick-words" data-words="2000" style="background:#ffffff; border:1px solid #cbd5e1; color:#1e293b; padding:5px 12px; border-radius:6px; font-size:11.5px; font-weight:700; cursor:pointer;">2000字</button>
                  <button type="button" class="btn-create-quick-words" data-words="3000" style="background:#eff6ff; border:1.5px solid #2563eb; color:#1d4ed8; padding:5px 12px; border-radius:6px; font-size:11.5px; font-weight:800; cursor:pointer;">3000字</button>
                  <button type="button" class="btn-create-quick-words" data-words="5000" style="background:#ffffff; border:1px solid #cbd5e1; color:#1e293b; padding:5px 12px; border-radius:6px; font-size:11.5px; font-weight:700; cursor:pointer;">5000字</button>
                  <button type="button" class="btn-create-quick-words" data-words="8000" style="background:#ffffff; border:1px solid #cbd5e1; color:#1e293b; padding:5px 12px; border-radius:6px; font-size:11.5px; font-weight:700; cursor:pointer;">8000字</button>
                </div>
              </div>
            </div>
            <div class="teacher-form-group">
              <label>任务说明与要求 (选填)</label>
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
      const durationBadge = modal.querySelector('#modal-task-duration-badge');

      const updateDurationBadge = () => {
        if (!startInput || !deadlineInput) return;
        const s = new Date(startInput.value);
        const d = new Date(deadlineInput.value);
        if (!isNaN(s.getTime()) && !isNaN(d.getTime())) {
          const diffMins = Math.round((d.getTime() - s.getTime()) / (60 * 1000));
          if (diffMins > 0) {
            if (durationBadge) {
              durationBadge.innerHTML = `⏱️ 总时长: <b style="color:#1d4ed8;">${formatDurationHuman(diffMins)}</b>`;
              durationBadge.style.color = '#1d4ed8';
              durationBadge.style.background = '#eff6ff';
              durationBadge.style.borderColor = '#bfdbfe';
            }
            modal.querySelectorAll('.btn-create-set-duration').forEach(btn => {
              const m = parseInt(btn.dataset.mins, 10);
              if (m === diffMins) {
                btn.style.background = '#eff6ff';
                btn.style.borderColor = '#2563eb';
                btn.style.color = '#1d4ed8';
                btn.style.fontWeight = '800';
                btn.style.boxShadow = '0 1px 4px rgba(37,99,235,0.2)';
              } else {
                btn.style.background = '#ffffff';
                btn.style.borderColor = '#cbd5e1';
                btn.style.color = '#1e293b';
                btn.style.fontWeight = '700';
                btn.style.boxShadow = 'none';
              }
            });
          } else {
            if (durationBadge) {
              durationBadge.innerHTML = `⚠️ 截止时间不能早于开始时间`;
              durationBadge.style.color = '#dc2626';
              durationBadge.style.background = '#fee2e2';
              durationBadge.style.borderColor = '#fca5a5';
            }
          }
        }
      };

      // 🕒 点击一键设定任务总时长胶囊（从开始时间起算）
      modal.querySelectorAll('.btn-create-set-duration').forEach(btn => {
        btn.addEventListener('click', () => {
          const mins = parseInt(btn.dataset.mins, 10);
          if (!mins || mins <= 0) return;
          let s = new Date();
          if (startInput && startInput.value) {
            const p = new Date(startInput.value);
            if (!isNaN(p.getTime())) s = p;
          }
          const newD = new Date(s.getTime() + mins * 60 * 1000);
          if (deadlineInput) {
            deadlineInput.value = formatLocal(newD);
            deadlineInput.style.borderColor = '#2563eb';
            setTimeout(() => { if (deadlineInput) deadlineInput.style.borderColor = '#cbd5e1'; }, 400);
          }
          updateDurationBadge();
        });
      });

      // ⚡ 自定义设定总时长（从开始时间起算）
      modal.querySelector('#btn-create-apply-custom-dur')?.addEventListener('click', () => {
        const num = parseFloat(modal.querySelector('#modal-create-custom-dur-num')?.value) || 0;
        const unit = modal.querySelector('#modal-create-custom-dur-unit')?.value || 'hour';
        if (num <= 0) {
          alert('请输入大于 0 的有效时长数值！');
          return;
        }
        let msMultiplier = 3600 * 1000;
        if (unit === 'minute') msMultiplier = 60 * 1000;
        else if (unit === 'hour') msMultiplier = 3600 * 1000;
        else if (unit === 'day') msMultiplier = 24 * 3600 * 1000;
        else if (unit === 'week') msMultiplier = 7 * 24 * 3600 * 1000;

        let s = new Date();
        if (startInput && startInput.value) {
          const p = new Date(startInput.value);
          if (!isNaN(p.getTime())) s = p;
        }
        const newD = new Date(s.getTime() + num * msMultiplier);
        if (deadlineInput) {
          deadlineInput.value = formatLocal(newD);
          deadlineInput.style.borderColor = '#2563eb';
          setTimeout(() => { if (deadlineInput) deadlineInput.style.borderColor = '#cbd5e1'; }, 400);
        }
        updateDurationBadge();
      });

      // 微调按钮
      modal.querySelectorAll('.btn-create-nudge').forEach(btn => {
        btn.addEventListener('click', () => {
          const diff = parseInt(btn.dataset.diff, 10) || 0;
          if (!diff) return;
          let curD = new Date();
          if (deadlineInput && deadlineInput.value) {
            const p = new Date(deadlineInput.value);
            if (!isNaN(p.getTime())) curD = p;
          }
          const newD = new Date(curD.getTime() + diff * 60 * 1000);
          if (deadlineInput) {
            deadlineInput.value = formatLocal(newD);
            deadlineInput.style.borderColor = diff > 0 ? '#2563eb' : '#be123c';
            setTimeout(() => { if (deadlineInput) deadlineInput.style.borderColor = '#cbd5e1'; }, 400);
          }
          updateDurationBadge();
        });
      });

      startInput?.addEventListener('input', updateDurationBadge);
      startInput?.addEventListener('change', updateDurationBadge);
      deadlineInput?.addEventListener('input', updateDurationBadge);
      deadlineInput?.addEventListener('change', updateDurationBadge);
      updateDurationBadge();

      // 🎯 快速选择字数胶囊
      modal.querySelectorAll('.btn-create-quick-words').forEach(btn => {
        btn.addEventListener('click', () => {
          const w = btn.dataset.words;
          const wordsInput = modal.querySelector('#modal-task-words');
          if (wordsInput) {
            wordsInput.value = w;
            wordsInput.style.borderColor = '#2563eb';
            setTimeout(() => { if (wordsInput) wordsInput.style.borderColor = '#cbd5e1'; }, 400);
          }
          modal.querySelectorAll('.btn-create-quick-words').forEach(b => {
            b.style.background = '#ffffff';
            b.style.borderColor = '#cbd5e1';
            b.style.color = '#1e293b';
          });
          btn.style.background = '#eff6ff';
          btn.style.borderColor = '#bfdbfe';
          btn.style.color = '#2563eb';
        });
      });

      modal.querySelector('#btn-submit-new-task').addEventListener('click', () => {
        const classId = modal.querySelector('#modal-task-class').value;
        const taskType = modal.querySelector('#modal-task-type')?.value || 'experiment';
        const title = modal.querySelector('#modal-task-title').value.trim();
        const desc = modal.querySelector('#modal-task-desc').value.trim();
        const startTime = modal.querySelector('#modal-task-start') ? modal.querySelector('#modal-task-start').value : '';
        const deadline = modal.querySelector('#modal-task-deadline') ? modal.querySelector('#modal-task-deadline').value : '';
        const words = parseInt(modal.querySelector('#modal-task-words')?.value, 10) || 3000;

        if (!title) { alert('⚠️ 请输入写作任务名称！'); return; }
        if (!startTime || !deadline) { alert('⚠️ 请指定任务的开始时间与截止时间！'); return; }

        const sDate = new Date(startTime);
        const dDate = new Date(deadline);
        if (isNaN(sDate.getTime()) || isNaN(dDate.getTime()) || sDate >= dDate) {
          alert('⚠️ 任务截止时间必须晚于任务开始时间！');
          return;
        }

        const calculatedDuration = Math.max(1, Math.round((dDate.getTime() - sDate.getTime()) / (60 * 1000)));

        try {
          const newTask = authManager.createTask(title, classId, desc, [], startTime, deadline, calculatedDuration, taskType, words);
          if (newTask && newTask.id) {
            state.activeTaskId = newTask.id;
          }
          closeModal();
          const targetClassName = newTask?.className || (activeClass ? activeClass.name : '班级');
          showGlobalBannerNotice('✅ 任务发布成功', `写作任务《${title}》已成功发布至【${targetClassName}】！`, 'success');
          renderTeacherPortal(container, authManager, state, onLogout);
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
          selectedAttachment = { name: f.name, size: sizeMB, fileObj: f };
          dropText.innerHTML = `<span style="font-size:24px;">✅</span><div style="font-size:13px; color:#34d399; font-weight:700;">已选中随附文件: ${f.name} (${sizeMB})</div>`;
        }
      });

      modal.querySelector('#btn-submit-new-ann').addEventListener('click', async () => {
        const submitBtn = modal.querySelector('#btn-submit-new-ann');
        const selClassId = classSelect.value;
        const selClassObj = allClasses.find(c => c.id === selClassId);
        const selClassName = selClassId === 'all' ? '全校班级' : (selClassObj ? selClassObj.name : '指定班级');
        
        const taskId = modal.querySelector('#modal-ann-task').value;
        if (!taskId || taskId === 'task_all') {
          alert('❌ 发布失败：请先为当前班级创建具体写作任务，通知必须锁定关联至具体任务！');
          submitBtn.disabled = false;
          submitBtn.innerText = '📢 确认发布通知';
          return;
        }
        const checkedGroupCbs = Array.from(groupsContainer.querySelectorAll('input[type="checkbox"]:checked'));
        if (checkedGroupCbs.length === 0) {
          alert('❌ 发布失败：请至少勾选一个接收通知的受众小组！');
          submitBtn.disabled = false;
          submitBtn.innerText = '📢 确认发布通知';
          return;
        }
        const allGroups = (selClassObj && selClassObj.groups) ? selClassObj.groups : [];
        const isAllSelected = checkedGroupCbs.length === allGroups.length;
        const selectedGroupIds = isAllSelected ? ['all'] : checkedGroupCbs.map(cb => cb.value);
        const selectedGroupNames = checkedGroupCbs.map(cb => {
          const gObj = allGroups.find(g => g.id === cb.value);
          return gObj ? gObj.name : cb.value;
        });
        const targetGId = isAllSelected ? 'all' : selectedGroupIds[0];
        const targetGName = isAllSelected ? '全班所有小组' : selectedGroupNames.join('、');

        const title = modal.querySelector('#modal-ann-title').value.trim();
        const content = modal.querySelector('#modal-ann-content').value.trim();
        if (!title || !content) { alert('⚠️ 请填齐通知标题与内容！'); return; }

        submitBtn.disabled = true;
        submitBtn.innerText = '⏳ 正在上传资源并发布通知...';

        let finalAttachment = null;
        if (selectedAttachment && selectedAttachment.name) {
          finalAttachment = {
            name: selectedAttachment.name,
            size: selectedAttachment.size,
            url: ''
          };
          if (selectedAttachment.fileObj) {
            try {
              const currT = authManager.getCurrentUser();
              const tId = (currT && (currT.id)) || '';
              const tToken = (currT && (currT.token || currT.activeSessionId)) || '';

              const formData = new FormData();
              formData.append('file', selectedAttachment.fileObj);
              formData.append('userId', tId);
              formData.append('token', tToken);
              const upRes = await fetch('sync.php?action=upload_file', {
                method: 'POST',
                body: formData
              });
              if (upRes.ok) {
                const upJson = await upRes.json();
                if (upJson.success && upJson.url) {
                  finalAttachment.url = upJson.url;
                }
              }
            } catch (upErr) {
              console.warn('Server upload attachment warning:', upErr);
            }
          }
        }

        authManager.publishAnnouncement(taskId, title, content, finalAttachment, targetGId, targetGName, selClassId, selClassName, selectedGroupIds);
        closeModal();
        renderTeacherPortal(container, authManager, state, onLogout);
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
          const cleanTitle = f.name.replace(/\.[^\/.]+$/, '');
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
          if (!targetTaskId || targetTaskId === 'task_all') {
            alert('❌ 上传失败：请先为当前班级创建具体写作任务，参考文献必须锁定关联至具体任务！');
            submitBtn.disabled = false;
            submitBtn.innerText = '📚 确认上传并存入范文库';
            return;
          }
          
          const checkedGroupCbs = Array.from(paperGroupsContainer.querySelectorAll('input[type="checkbox"]:checked'));
          if (checkedGroupCbs.length === 0) {
            alert('❌ 上传失败：请至少勾选一个接收文献的受众小组！');
            submitBtn.disabled = false;
            submitBtn.innerText = '📚 确认上传并存入范文库';
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
            title = selectedFile.name ? selectedFile.name.replace(/\.[^\/.]+$/, '') : '学术参考范文';
          }

          submitBtn.disabled = true;
          submitBtn.innerText = '⏳ 正在上传文献到服务器...';

          let serverFileUrl = '';
          if (selectedFile.fileObj) {
            try {
              const currT = authManager.getCurrentUser();
              const tId = (currT && (currT.id)) || '';
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
          renderTeacherPortal(container, authManager, state, onLogout);
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
        const fData = paper.fileUrl || paper.fileData || (window._paperMemoryBlobMap && window._paperMemoryBlobMap.get(paperId));
        downloadFileBlob(paper.fileName || '学术参考范文.pdf', null, fData);
      }
    });
  });

  // 删除范文按钮
  container.querySelectorAll('.btn-delete-paper').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('确认从参考范文库中删除此篇文献？')) {
        authManager.deleteReferencePaper(btn.dataset.id);
        renderTeacherPortal(container, authManager, state, onLogout);
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
        window.app.loadGroupState(state.activeMonitorGroupId || (activeClass?.groups?.[0]?.id) || null);
      }
      renderTeacherPortal(container, authManager, state, onLogout);
    });
  }

  const syncGroupDataFromMemory = (targetGId) => {
    state.activeMonitorGroupId = targetGId;
    state._lastMonitorHash = '';
    state._lastEpHash = '';
    const gData = getPanoGroupData(state.monitorPanorama, targetGId);
    if (gData) {
      state.stage1 = gData.stage1 || { proposals: [], votes: {}, hasVoted: {}, contract: {} };
      state.stage2 = { ...(gData.stage2 || {}), unifiedContent: gData.stage2?.unifiedContent || '' };
      state.stage3 = gData.stage3 || { feedbackItems: [] };
      state.chatLogs = gData.chatLogs || { stage1: [], stage2: [], stage3: [] };
      state.currentStage = gData.currentStage || 'stage1';
      state.isFinalSubmitted = !!gData.isFinalSubmitted;
    }
    if (window.app) {
      window.app.state.activeMonitorGroupId = targetGId;
      window.app.loadGroupState(targetGId);
    }
    // 🛡️ 小组切换持久化：刷新后精准恢复到此次选中的小组
    try {
      sessionStorage.setItem('jizhi_teacher_active_group_id', targetGId);
      localStorage.setItem('jizhi_teacher_active_group_id', targetGId);
    } catch (e) {}
  };

  const selSwitchGroup = container.querySelector('#sel-switch-monitor-group');
  if (selSwitchGroup) {
    selSwitchGroup.addEventListener('change', (e) => {
      syncGroupDataFromMemory(e.target.value);
      renderTeacherPortal(container, authManager, state, onLogout);
    });
  }

  container.querySelectorAll('.btn-monitor-panorama-card').forEach(card => {
    card.addEventListener('click', () => {
      syncGroupDataFromMemory(card.dataset.gid);
      renderTeacherPortal(container, authManager, state, onLogout);
    });
  });

  container.querySelectorAll('.btn-switch-monitor-group').forEach(btn => {
    btn.addEventListener('click', () => {
      syncGroupDataFromMemory(btn.dataset.gid);
      renderTeacherPortal(container, authManager, state, onLogout);
    });
  });

  container.querySelectorAll('.btn-monitor-stage-tab').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const stg = btn.dataset.stg;
      state.teacherMonitorStageMode = stg;
      state.monitorStageTab = stg;
      renderTeacherPortal(container, authManager, state, onLogout);
    });
  });

  const btnStage3Def = container.querySelector('#btn-tab-teacher-stage3-defense');
  if (btnStage3Def) {
    btnStage3Def.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      state.stage3TeacherTab = 'defense';
      renderTeacherPortal(container, authManager, state, onLogout);
    });
  }
  const btnStage3Doc = container.querySelector('#btn-tab-teacher-stage3-doc');
  if (btnStage3Doc) {
    btnStage3Doc.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      state.stage3TeacherTab = 'doc';
      renderTeacherPortal(container, authManager, state, onLogout);
    });
  }

  const btnTogglePanorama = container.querySelector('#btn-toggle-teacher-panorama');
  if (btnTogglePanorama) {
    btnTogglePanorama.addEventListener('click', () => {
      state._isPanoramaCollapsed = !state._isPanoramaCollapsed;
      const bodyPano = container.querySelector('#body-teacher-panorama');
      const iconPano = container.querySelector('#icon-toggle-teacher-panorama');
      if (bodyPano) {
        bodyPano.style.display = state._isPanoramaCollapsed ? 'none' : 'grid';
      }
      if (iconPano) {
        iconPano.innerText = state._isPanoramaCollapsed ? '▼ 展开总览' : '▲ 收起';
      }
    });
  }

  const btnToggleTPlan = container.querySelector('#btn-toggle-teacher-action-plan');
  if (btnToggleTPlan) {
    btnToggleTPlan.addEventListener('click', () => {
      const bodyPlan = container.querySelector('#body-teacher-action-plan');
      const iconToggle = container.querySelector('#icon-toggle-teacher-plan');
      if (bodyPlan) {
        const isHidden = bodyPlan.style.display === 'none';
        bodyPlan.style.display = isHidden ? 'flex' : 'none';
        if (iconToggle) iconToggle.innerText = isHidden ? '▲ 收起' : '▼ 展开';
      }
    });
  }

  const btnExportExcel = container.querySelector('#btn-export-all-excel');
  if (btnExportExcel) {
    btnExportExcel.addEventListener('click', () => {
      const cId = activeClass?.id || 'class_101';
      const tId = activeMonitorTask?.id || null;
      const tTitle = activeMonitorTask?.title || '全班各组';
      authManager.openExportFormatModal({
        title: `导出【${tTitle}】全班各组研讨`,
        onSelect: (fmt) => authManager.exportAllClassGroupsChatLogsToSeparateFiles(cId, tId, fmt)
      });
    });
  }

  container.querySelectorAll('.btn-export-task-chat-all').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tId = e.currentTarget.dataset.id;
      const tTitle = e.currentTarget.dataset.title || '';
      const cId = e.currentTarget.dataset.class || activeClass?.id || 'class_101';
      authManager.openExportFormatModal({
        title: `导出【${tTitle || '该任务'}】全班各组研讨`,
        onSelect: (fmt) => authManager.exportAllClassGroupsChatLogsToSeparateFiles(cId, tId, fmt)
      });
    });
  });

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

  // 🎯 精准保持滚动条位置（同时恢复 window 视口与容器滚动条位置，彻底杜绝跳回最顶部）
  const newLayout = container.querySelector('.teacher-portal-layout') || document.querySelector('.teacher-portal-layout');
  if (savedWinY > 0) {
    window.scrollTo(0, savedWinY);
    requestAnimationFrame(() => window.scrollTo(0, savedWinY));
    setTimeout(() => window.scrollTo(0, savedWinY), 30);
  }
  if (newLayout && savedScrollTop > 0) {
    newLayout.scrollTop = savedScrollTop;
    requestAnimationFrame(() => {
      if (newLayout) newLayout.scrollTop = savedScrollTop;
    });
    setTimeout(() => {
      if (newLayout) newLayout.scrollTop = savedScrollTop;
    }, 30);
  }
}

