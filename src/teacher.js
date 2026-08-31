/**
 * JIZHI (集智) Platform - Teacher Portal & Analytics Matrix
 * Standard ES Module (ESM)
 */

import {
  STORAGE_KEY_ANNOUNCEMENTS,
  STORAGE_KEY_TASKS,
  STORAGE_KEY_CLASSES,
  STORAGE_KEY_USERS_DB,
  AgentProfiles
} from "./constants.js?v=20260831_v1033";
import { parseXLSXOrCSVFile, parseCSVText, downloadFileBlob, escapeHtml, isTaskExpired, formatDurationHuman, formatChatDisplayTime, formatStandardDateDash, filterAndDeduplicateChatLogs, enforceEtherpadReadonly, showGlobalBannerNotice } from "./utils.js?v=20260831_v1033";

/* ==========================================================================
   7. TEACHER PORTAL RENDERER (LIVE WORKSPACE MIRROR & ANNOUNCEMENT READ MATRIX)
   ========================================================================== */
export function renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView) {
  const oldLayout = container.querySelector('.teacher-portal-layout') || document.querySelector('.teacher-portal-layout');
  const savedScrollTop = oldLayout ? oldLayout.scrollTop : (state._teacherScrollTop || 0);

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

  if (authManager && authManager.sanitizeAndDeduplicateGroups) {
    authManager.sanitizeAndDeduplicateGroups();
  }
  const currentUser = authManager.getCurrentUser();
  const tasks = authManager.getTasks();
  const announcements = authManager.getAnnouncements();
  const refPapers = authManager.getReferencePapers();
  const classes = authManager.getClasses();
  const activeTab = state.teacherActiveTab || 'view_architecture';
  const activeClassId = state.activeClassId || (classes[0] ? classes[0].id : null);
  const activeClass = classes.find(c => c.id === activeClassId) || classes[0] || null;

  const allUsers = authManager.getUsers();
  const classStudents = authManager.getClassStudents(activeClass.id);

  // 🛡️ 严格按当前班级隔离写作任务、通知与文献（支持全校通用广播与多班级分发）
  const currentClassTasks = tasks.filter(t => !t.classId || t.classId === 'all' || t.classId === activeClass.id || (t.className && t.className === activeClass.name) || (Array.isArray(t.targetClassIds) && (t.targetClassIds.includes('all') || t.targetClassIds.includes(activeClass.id))));
  const currentClassAnnouncements = announcements.filter(a => (!a.classId || a.classId === 'all' || a.classId === activeClass.id || (a.className && a.className === activeClass.name) || (Array.isArray(a.targetClassIds) && (a.targetClassIds.includes('all') || a.targetClassIds.includes(activeClass.id)))) && !a.isSystemAction && !a.isExtension && !a.title?.includes('延期') && !a.title?.includes('延长至'));
  const currentClassPapers = refPapers.filter(p => (!p.classId || p.classId === 'all' || p.classId === activeClass.id || (p.className && p.className === activeClass.name) || (Array.isArray(p.targetClassIds) && (p.targetClassIds.includes('all') || p.targetClassIds.includes(activeClass.id)))));

  const classTaskExists = currentClassTasks.some(t => t.id === state.activeTaskId);
  let effectiveMonitorTaskId = (state.activeTaskId && classTaskExists)
    ? state.activeTaskId
    : (currentClassTasks[0] ? currentClassTasks[0].id : `task_${activeClass.id}_default`);
  if (!effectiveMonitorTaskId || effectiveMonitorTaskId === 'task_default') {
    effectiveMonitorTaskId = `task_${activeClass.id}_default`;
  }
  state.activeTaskId = effectiveMonitorTaskId;
  if (window.app && window.app.state) window.app.state.activeTaskId = effectiveMonitorTaskId;

  const classGroupExists = (activeClass.groups || []).some(g => g.id === state.activeMonitorGroupId);
  const activeMonitorGId = (state.activeMonitorGroupId && classGroupExists)
    ? state.activeMonitorGroupId
    : (activeClass.groups && activeClass.groups[0] ? activeClass.groups[0].id : 'group_1');
  state.activeMonitorGroupId = activeMonitorGId;
  if (window.app && window.app.state) window.app.state.activeMonitorGroupId = activeMonitorGId;

  const activeMonitorGroup = (activeClass.groups || []).find(g => g.id === activeMonitorGId) || (activeClass.groups && activeClass.groups[0]) || { id: 'group_1', name: '第1小组' };
  const monitorMembersObj = authManager.getGroupMembersForWorkspace(activeMonitorGId, activeClass.id);
  const monitorMembersList = Object.values(monitorMembersObj);

  const monitorStageMode = state.teacherMonitorStageMode || state.monitorStageTab || 'auto';
  const effectiveMonitorStage = monitorStageMode === 'auto' ? (state.currentStage || 'stage1') : monitorStageMode;
  const currentS3Tab = state.stage3TeacherTab || 'defense';

  // 🛡️ 教师端单例保护：若当前已经在 view_monitoring 标签下且监控同一个班级/小组/任务/阶段/模式/子页，优先执行增量就地更新
  const existingLayout = container.querySelector('.teacher-portal-layout');
  const renderedCId = container.dataset.renderedClassId;
  const renderedGId = container.dataset.renderedGroupId;
  const renderedTaskId = container.dataset.renderedTaskId;
  const renderedStage = container.dataset.renderedStage;
  const renderedMode = container.dataset.renderedMode;
  const renderedS3Tab = container.dataset.renderedS3Tab;
  const renderedTab = container.dataset.renderedTab;

  if (existingLayout && activeTab === 'view_monitoring' && renderedTab === 'view_monitoring' &&
      renderedCId === activeClassId && renderedGId === activeMonitorGId &&
      renderedTaskId === effectiveMonitorTaskId && renderedStage === effectiveMonitorStage &&
      renderedMode === monitorStageMode &&
      (effectiveMonitorStage !== 'stage3' || renderedS3Tab === currentS3Tab)) {
    
    // 1. Stage 2 in-place update
    if (effectiveMonitorStage === 'stage2') {
      const existingFrame = container.querySelector('#teacher-stage2-etherpad-frame');
      if (existingFrame) {
        const wc = container.querySelector('#teacher-stage2-word-count-num');
        if (wc) wc.innerText = String(((state.stage2?.unifiedContent || '').replace(/<[^>]*>/g, '').trim()).length);

        const apContainer = container.querySelector('#teacher-stage2-action-plan-container');
        if (apContainer) {
          const s2ActionPlan = state.stage2?.actionPlan;
          const s2Subs = state.stage2?.meetingSubmissions || {};
          const s2SubCount = Object.keys(s2Subs).length;
          const totalMemberCount = monitorMembersList.length || 3;
          if (s2ActionPlan && s2ActionPlan.isGenerated) {
            apContainer.innerHTML = `
              <div style="background:#ecfdf5; border:1px solid #a7f3d0; border-radius:8px; padding:8px 12px; flex-shrink:0;">
                <div style="font-size:12px; font-weight:800; color:#059669; display:flex; justify-content:space-between; align-items:center;">
                  <span>📋 【半程修正清单】(3项修改要求)</span>
                  <span style="font-size:10.5px; background:#d1fae5; color:#065f46; padding:1px 6px; border-radius:10px;">已生成</span>
                </div>
                <div style="font-size:11.5px; color:#334155; display:flex; flex-direction:column; gap:2px; margin-top:4px;">
                  ${(s2ActionPlan.items || []).map(item => `<div style="line-height:1.4;">• ${escapeHtml(item)}</div>`).join('')}
                </div>
              </div>
            `;
          } else {
            apContainer.innerHTML = `
              <div style="background:#f8fafc; border:1px dashed #cbd5e1; border-radius:8px; padding:8px 12px; flex-shrink:0;">
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
            `;
          }
        }

        const pills = container.querySelector('#teacher-stage2-confirmed-pills');
        if (pills) {
          pills.innerHTML = monitorMembersList.map(m => {
            const isConf = state.stage2?.confirmedMembers && (state.stage2.confirmedMembers[m.id] || state.stage2.confirmedMembers[m.studentCode] || (m.name && state.stage2.confirmedMembers[m.name]));
            return `<span style="font-size:11px; padding:1px 8px; border-radius:10px; font-weight:700; background:${isConf ? '#ecfdf5' : '#f8fafc'}; color:${isConf ? '#059669' : '#94a3b8'}; border:1px solid ${isConf ? '#a7f3d0' : '#e2e8f0'};">
              ${isConf ? '✓' : '○'} ${escapeHtml(m.name)}
            </span>`;
          }).join('');
        }

        const contribs = state.stage2?.memberContributions || {};
        let rawTotal = 0;
        monitorMembersList.forEach(m => { rawTotal += (contribs[m.id] || 0) + (contribs[m.studentCode] || 0); });
        const cl = container.querySelector('#teacher-stage2-contrib-labels');
        if (cl) {
          cl.innerHTML = monitorMembersList.map((m) => {
            const rawVal = (contribs[m.id] || 0) + (contribs[m.studentCode] || 0);
            const pct = rawTotal > 0 ? Math.round((rawVal / rawTotal) * 100) : 0;
            return `<span style="color:${rawVal > 0 ? (m.color || '#2563eb') : '#94a3b8'}; font-weight:700;">● ${escapeHtml(m.name)}: ${pct}%</span>`;
          }).join('');
        }
        const cb = container.querySelector('#teacher-stage2-contrib-bars');
        if (cb) {
          cb.innerHTML = rawTotal === 0 ? `<div style="width:100%; height:10px; background:#f8fafc; border-radius:5px; display:flex; align-items:center; justify-content:center; font-size:10px; color:#94a3b8; font-weight:600;">⏳ 暂无协作投入 (组员在 Etherpad 中撰写、修改正文或研讨后将平滑累计真实贡献)</div>` : monitorMembersList.map((m) => {
            const rawVal = (contribs[m.id] || 0) + (contribs[m.studentCode] || 0);
            if (rawVal === 0) return '';
            const pct = Math.round((rawVal / rawTotal) * 100);
            return `<div style="width:${pct}%; background:${m.color || '#2563eb'}; transition:width 0.3s ease;" title="${escapeHtml(m.name)}: ${pct}% (${rawVal}字)"></div>`;
          }).join('');
        }
      }
    }

    // 2. Stage 3 in-place update
    if (effectiveMonitorStage === 'stage3') {
      if (currentS3Tab === 'doc') {
        const existingFrame = container.querySelector('#teacher-stage3-etherpad-frame');
        if (existingFrame) {
          const wc = container.querySelector('#teacher-stage3-word-count-num');
          if (wc) wc.innerText = String(((state.stage3?.finalDraft || state.stage2?.unifiedContent || '').replace(/<[^>]*>/g, '').trim()).length);

          const contribs = state.stage2?.memberContributions || {};
          let rawTotal = 0;
          monitorMembersList.forEach(m => { rawTotal += (contribs[m.id] || 0) + (contribs[m.studentCode] || 0); });
          const cl = container.querySelector('#teacher-stage3-contrib-labels');
          if (cl) {
            cl.innerHTML = monitorMembersList.map((m) => {
              const rawVal = (contribs[m.id] || 0) + (contribs[m.studentCode] || 0);
              const pct = rawTotal > 0 ? Math.round((rawVal / rawTotal) * 100) : 0;
              return `<span style="color:${rawVal > 0 ? (m.color || '#2563eb') : '#94a3b8'}; font-weight:700;">● ${escapeHtml(m.name)}: ${pct}%</span>`;
            }).join('');
          }
          const cb = container.querySelector('#teacher-stage3-contrib-bars');
          if (cb) {
            cb.innerHTML = rawTotal === 0 ? `<div style="width:100%; height:10px; background:#f8fafc; border-radius:5px; display:flex; align-items:center; justify-content:center; font-size:10px; color:#94a3b8; font-weight:600;">⏳ 暂无协作投入</div>` : monitorMembersList.map((m) => {
              const rawVal = (contribs[m.id] || 0) + (contribs[m.studentCode] || 0);
              if (rawVal === 0) return '';
              const pct = Math.round((rawVal / rawTotal) * 100);
              return `<div style="width:${pct}%; background:${m.color || '#2563eb'}; transition:width 0.3s ease;" title="${escapeHtml(m.name)}: ${pct}% (${rawVal}字)"></div>`;
            }).join('');
          }
        }
      } else {
        const fbList = container.querySelector('#teacher-stage3-feedback-list');
        if (fbList) {
          fbList.innerHTML = (state.stage3?.feedbackItems && state.stage3.feedbackItems.length > 0) ? state.stage3.feedbackItems.map((item, i) => {
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
          `;
        }
      }
    }

    // 3. Update right chat stream
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

      const oldScroll = chatStream.scrollTop;
      const isAtBottom = (chatStream.scrollHeight - chatStream.scrollTop - chatStream.clientHeight) < 40;
      chatStream.innerHTML = combinedGroupChatLogs.length > 0 ? combinedGroupChatLogs.map(m => {
        const allGlobalUsers = (authManager) ? authManager.getUsers() : [];
        const isAgent = AgentProfiles[m.sender] !== undefined;
        const matchedUser = isAgent ? null : allGlobalUsers.find(u => u.id === m.sender || u.studentCode === m.sender || u.username === m.sender || u.name === m.sender);
        const senderName = isAgent ? AgentProfiles[m.sender].name : (matchedUser ? matchedUser.name : (m.senderName || (monitorMembersObj[m.sender] ? monitorMembersObj[m.sender].name : m.sender)));
        const color = isAgent ? AgentProfiles[m.sender].color : (matchedUser ? (matchedUser.color || '#2563eb') : (monitorMembersObj[m.sender] ? monitorMembersObj[m.sender].color : '#2563eb'));
        return `
          <div style="background:#ffffff; padding:8px 12px; border-radius:8px; border:1px solid #e2e8f0; border-left:3px solid ${color}; box-shadow:0 1px 2px rgba(0,0,0,0.02);">
            <div style="display:flex; justify-content:space-between; margin-bottom:3px;">
              <b style="color:${color}; font-size:12px;">${escapeHtml(senderName)}</b>
              <span style="color:#94a3b8; font-size:10px;">${escapeHtml(formatChatDisplayTime(m._timeMs || m.timestamp))}</span>
            </div>
            <div style="color:#0f172a; line-height:1.5;">${escapeHtml(m.text || '')}</div>
          </div>
        `;
      }).join('') : `
        <div style="text-align:center; padding:40px 16px; color:#94a3b8; font-size:12px;">⏳ 本小组暂无研讨发言记录</div>
      `;
      if (isAtBottom) chatStream.scrollTop = chatStream.scrollHeight;
      else chatStream.scrollTop = oldScroll;
    }

    return; // Fast in-place update completed without reloading Etherpad!
  }

  // ⚡ 教师端自动轻量轮询：自调度循环，杜绝并发拉取与 interval 重注册竞态
  const teacherPullAndRefresh = async () => {
    const curU = authManager.getCurrentUser();
    if (!curU || curU.role !== 'teacher') return; // 非教师即停止轮询
    if (document.querySelector('.modal-overlay')) {
      window._teacherPortalSyncTimer = setTimeout(teacherPullAndRefresh, 3000);
      return;
    }

    if (state.teacherActiveTab === 'view_monitoring' && window.app && window.app.cloudSyncEngine) {
      const currentCId = state.activeClassId || activeClass.id || null;
      let activeTaskId = state.activeTaskId || (currentClassTasks[0] ? currentClassTasks[0].id : `task_${currentCId}_default`);
      if (!activeTaskId || activeTaskId === 'task_default') {
        activeTaskId = `task_${currentCId}_default`;
      }
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
        const lastEpHash = state._lastEpHash || '';
        const epRes = await fetch(`sync.php?action=get_pad_html&padId=${padName}&clientHash=${encodeURIComponent(lastEpHash)}`).then(r => r.json()).catch(() => null);
        if (epRes && epRes.hash) state._lastEpHash = epRes.hash;
        let latestPadText = '';
        if (epRes && epRes.success && !epRes.unchanged && (epRes.html || epRes.text)) {
          latestPadText = epRes.html || epRes.text;
          if (!state.stage2) state.stage2 = {};
          state.stage2.unifiedContent = latestPadText;
        } else if (state.stage2?.unifiedContent) {
          latestPadText = state.stage2.unifiedContent;
        }



        const curT = authManager.getCurrentUser();
        const tToken = (curT && (curT.activeSessionId || curT.token)) || '';
        const tId = (curT && (curT.id || curT.username)) || '';
        const lastHash = state._lastMonitorHash || '';
        const panRes = await fetch(`sync.php?action=get_teacher_monitor_all_groups&activeGroupId=${encodeURIComponent(currentGId)}&taskId=${encodeURIComponent(activeTaskId)}&classId=${encodeURIComponent(currentCId)}&userId=${encodeURIComponent(tId)}&token=${encodeURIComponent(tToken)}&clientHash=${encodeURIComponent(lastHash)}`).then(r => r.json()).catch(() => null);
        if (panRes && panRes.success && panRes.groups) {
          state.monitorPanorama = panRes.groups;
          if (panRes.hash) state._lastMonitorHash = panRes.hash;

          // 🎯 核心修复：以 Etherpad 权威最新正文为主，杜绝被旧版全量快照覆盖导致字数在 5000 与 8000 间反复跳动！
          const currentGroupData = panRes.groups[currentGId];
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
        }
      } catch (e) {
        console.warn('[TeacherMonitor] 监控拉取警告:', e);
      }

      const newFingerprint = JSON.stringify({
        cStage: state.currentStage,
        s1Len: (state.stage1?.proposals || []).length,
        s1Title: state.stage1?.mergedTitle,
        s1Votes: Object.keys(state.stage1?.votes || {}).length,
        s1Conf: Object.keys(state.stage1?.contract?.confirmedMembers || {}).length,
        s2Conf: Object.keys(state.stage2?.confirmedMembers || {}).length,
        s2DraftConf: !!state.stage2?.isDraftConfirmed,
        s3Len: (state.stage3?.feedbackItems || []).length,
        chat1: (state.chatLogs?.stage1 || []).length,
        chat2: (state.chatLogs?.stage2 || []).length,
        chat3: (state.chatLogs?.stage3 || []).length,
        panorama: getPanoDigest(state.monitorPanorama)
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
          // 🛡️ 若教师正打开弹窗或编辑中，绝不全量重刷页面造成闪烁与输入回退
          if (document.querySelector('.modal-overlay') || document.querySelector('#modal-extend-deadline')) {
            // 延缓至弹窗关闭后再刷
          } else {
            const layout = container.querySelector('.teacher-portal-layout');
            const curScroll = layout ? layout.scrollTop : 0;
            state._teacherScrollTop = curScroll;
            renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
            const nextLayout = container.querySelector('.teacher-portal-layout');
            if (nextLayout) nextLayout.scrollTop = curScroll;
            return; // 重渲染会重建循环
          }
        }
      } catch (e) {}
    }

    const isTeacherIdle = () => document.hidden || (Date.now() - (window._lastTeacherActivity || Date.now()) > 60000);
    const tInterval = isTeacherIdle() ? 15000 : 1800;
    window._teacherPortalSyncTimer = setTimeout(teacherPullAndRefresh, tInterval);
  };
  if (window._teacherPortalSyncTimer) clearTimeout(window._teacherPortalSyncTimer);

  window._lastTeacherActivity = Date.now();
  const markTeacherActive = () => {
    const wasIdle = (Date.now() - window._lastTeacherActivity > 60000);
    window._lastTeacherActivity = Date.now();
    if (wasIdle && state.teacherActiveTab === 'view_monitoring') {
      teacherPullAndRefresh();
    }
  };
  ['mousemove', 'keydown', 'touchstart', 'scroll', 'click'].forEach(evt => {
    window.addEventListener(evt, markTeacherActive, { passive: true });
  });

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

  const tInitInterval = (document.hidden ? 15000 : 1800);
  window._teacherPortalSyncTimer = setTimeout(teacherPullAndRefresh, tInitInterval);

  container.innerHTML = `
    <div class="teacher-portal-layout" id="teacher-portal-layout" style="height:100vh; overflow-y:auto !important; -webkit-overflow-scrolling:touch; background:#f0f4f9; padding:0; display:flex; flex-direction:column;">
      <!-- 全屏头部导航 -->
      <header class="teacher-header" style="padding:16px 32px; background:#ffffff; border-bottom:1px solid #e2e8f0; width:100%; flex-shrink:0; box-shadow:0 1px 3px rgba(15,23,42,0.04); display:flex; justify-content:space-between; align-items:center;">
        <div class="brand-section" style="display:flex; align-items:center; gap:14px;">
          <div class="brand-logo" style="font-size:22px; font-weight:800; background:linear-gradient(135deg, #1e40af, #2563eb); -webkit-background-clip:text; -webkit-text-fill-color:transparent;">集智 JIZHI 教师端</div>
        </div>
        <div class="teacher-info" style="display:flex; align-items:center; gap:14px;">
          <span style="font-size:13.5px; color:#334155;">当前班级: <b style="color:#2563eb;">${activeClass.name}</b></span>
          <span style="font-size:13.5px; color:#334155;">教师: <b>${currentUser.name}</b></span>
          <button id="btn-teacher-change-pwd" style="background:#f0fdf4; border:1px solid #bbf7d0; color:#16a34a; padding:6px 14px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:6px;" title="修改登录密码">
            <span>🔑 修改密码</span>
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
                <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                  <button id="btn-v1-add-student" class="teacher-action-btn" style="background:linear-gradient(135deg, #1d4ed8, #2563eb); border:none; color:white; padding:8px 16px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; box-shadow:0 2px 8px rgba(37,99,235,0.25);">+ 单条创建学生账号</button>
                  <button id="btn-v1-enroll-existing-student" class="teacher-action-btn" style="background:#eff6ff; border:1.5px solid #bfdbfe; color:#1d4ed8; padding:8px 16px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer;">👥 加入已有学生到班级</button>
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
                <div>💡 <b>密码说明：</b> 创建学生时可指定自定义密码（留空统一定为 <code style="color:#059669; font-weight:700;">123</code>）。建立后直接放入班级学生池。</div>
                <span style="color:#2563eb; font-weight:800; font-size:13.5px;">池内学生: ${classStudents.length} 人</span>
              </div>
              <div style="border:1px solid #e2e8f0; border-radius:10px; overflow:hidden; background:#ffffff;">
                <table class="monitor-table" style="font-size:13px;">
                  <thead><tr><th>序号</th><th>姓名</th><th>学号</th><th>当前归属小组</th><th>密码状态</th><th>操作</th></tr></thead>
                  <tbody>
                    ${classStudents.length === 0 ? '<tr><td colspan="6" style="text-align:center; color:#64748b; padding:24px;">当前班级暂无学生账号，请点击右上角按钮创建或导入！</td></tr>' : ''}
                    ${(() => {
                      // 同名提示：本班级内姓名重复的学生加一个视觉标记，方便老师区分，绝不自动合并
                      const _nameBuckets = {};
                      classStudents.forEach(s => { const _n = (s.name || '').trim(); if (!_n) return; (_nameBuckets[_n] = _nameBuckets[_n] || []).push(s); });
                      const _escAttr = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                      return classStudents.map((s, idx) => {
                      const grp = (activeClass.groups || []).find(g => g.members && (g.members.includes(s.id) || g.members.includes(s.studentCode) || (typeof g.members[0] === 'object' && g.members.some(m => m.id === s.id || m.studentCode === s.studentCode))));
                      const stdAcc = s.studentCode || s.username || s.id;
                      const _dupPeers = (_nameBuckets[(s.name || '').trim()] || []).filter(x => x !== s);
                      const _dupBadge = _dupPeers.length > 0 ? `<span title="${_escAttr('⚠️ 有同名同学：' + _dupPeers.map(x => x.name + '（' + (x.studentCode || x.username || x.id) + '）').join(' / '))}" style="margin-left:6px; background:#fef3c7; border:1px solid #fcd34d; color:#b45309; padding:1px 7px; border-radius:999px; font-size:11px; font-weight:700; cursor:help;">⚠️ 同名 ${_dupPeers.length + 1} 人</span>` : '';
                      return `
                        <tr>
                          <td style="color:#94a3b8; font-weight:700;">${idx + 1}</td>
                          <td><b>${s.avatar || '👤'} ${s.name}</b>${_dupBadge}</td>
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
                    }).join('');})()}
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
                              ${m.avatar || '👤'} ${m.name}
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
          const currentClassTasks = tasks.filter(t => !t.classId || t.classId === 'all' || t.classId === activeClass.id || (t.className && t.className === activeClass.name) || (Array.isArray(t.targetClassIds) && (t.targetClassIds.includes('all') || t.targetClassIds.includes(activeClass.id))));
          const currentClassAnnouncements = announcements.filter(a => (!a.classId || a.classId === 'all' || a.classId === activeClass.id || (a.className && a.className === activeClass.name) || (Array.isArray(a.targetClassIds) && (a.targetClassIds.includes('all') || a.targetClassIds.includes(activeClass.id)))) && !a.isSystemAction && !a.isExtension && !a.title?.includes('延期') && !a.title?.includes('延长至'));
          const currentClassPapers = refPapers.filter(p => (!p.classId || p.classId === 'all' || p.classId === activeClass.id || (p.className && p.className === activeClass.name) || (Array.isArray(p.targetClassIds) && (p.targetClassIds.includes('all') || p.targetClassIds.includes(activeClass.id)))));

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
                        <span style="font-size:12px; color:#64748b; margin-right:4px;">🕒 发布时间: <b>${formatStandardDateDash(t.createdAt || t.startTime) || '刚刚'}</b></span>
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
                      <span>📅 <b>开始时间:</b> <span style="color:#2563eb; font-weight:700;">${formatStandardDateDash(t.startTime) || '即时开启'}</span></span>
                      <span>⌛ <b>截止时间:</b> <span style="color:#dc2626; font-weight:800;">${formatStandardDateDash(t.deadline) || '无硬性限制'}</span> ${isExpired ? '<b style="color:#dc2626;">(已过截止时间)</b>' : ''}</span>
                      <span>⏱️ <b>任务时长:</b> ${formatDurationHuman(t.durationMinutes)}</span>
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

          const currentClassId = state.activeClassId || (authManager.getClasses()[0] ? authManager.getClasses()[0].id : 'class_101');
          const activeTaskId = state.activeTaskId || (currentClassTasks[0] ? currentClassTasks[0].id : `task_${currentClassId}_default`);
          const currentMonitorTaskId = activeTaskId;
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
                    const p = (state.monitorPanorama && state.monitorPanorama[g.id]) || null;
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
                          <span style="font-size:12.5px; font-weight:800; color:#0f172a;">👥 ${escapeHtml(g.name || g.id)}</span>
                          <span style="font-size:14px;">${dot}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center; gap:6px;">
                          <span style="font-size:11px; font-weight:700; color:#6d28d9; background:#ede9fe; padding:2px 6px; border-radius:6px;">${stageLabel}</span>
                          <span style="font-size:11px; color:#64748b; font-weight:600;">在线 ${online}/${total}</span>
                        </div>
                        <div style="font-size:10.5px; color:${dotColor}; font-weight:700;">${hint}${locks > 0 ? ' · 锁字段' : ''}</div>
                      </button>
                    `;
                  }).join('')}
                </div>
              </div>

              <div class="card" style="border-top:4px solid #059669; width:100%; padding:16px 20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
                <div style="display:flex; align-items:center; gap:14px; flex-wrap:wrap;">
                  <span style="font-size:15px; font-weight:800; color:#0f172a;">🖥️ 实际操作实时监控终端:</span>
                  <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-size:13px; font-weight:700; color:#475569;">监控任务:</span>
                    <select id="sel-switch-monitor-task" class="teacher-input fancy" style="font-size:13px; font-weight:700; color:#1e40af; background:#eff6ff; border:1.5px solid #3b82f6; padding:7px 14px; border-radius:8px; cursor:pointer; min-width:180px;">
                      ${currentClassTasks.length === 0 ? '<option value="task_default">📌 默认测试写作任务</option>' : currentClassTasks.map(t => {
                        const isSel = (state.activeTaskId || null) === t.id;
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

                  <!-- 🌟 方案 A：本组在线/离线成员状态标签 (单行优雅流线胶囊) -->
                  ${(() => {
                    const panoData = (state.monitorPanorama && state.monitorPanorama[activeMonitorGId]) || null;
                    const total = panoData ? (panoData.totalMembers || 0) : (monitorMembersList.length || 0);
                    const online = panoData ? (panoData.onlineCount || 0) : 0;
                    const absentList = (panoData && panoData.absentMembers) || [];
                    const absentCount = Math.max(0, total - online);

                    if (total > 0 && online === 0) {
                      return `
                        <span style="font-size:12px; font-weight:700; padding:5px 12px; border-radius:8px; background:#fef2f2; color:#dc2626; border:1px solid #fecaca; display:inline-flex; align-items:center; gap:5px;">
                          <span style="width:7px; height:7px; border-radius:50%; background:#dc2626;"></span>
                          🔴 全员离线 (0/${total})
                        </span>
                      `;
                    } else if (absentCount > 0 && absentList.length > 0) {
                      return `
                        <span style="font-size:12px; font-weight:700; padding:4px 10px; border-radius:8px; background:#fffbeb; color:#b45309; border:1px solid #fde68a; display:inline-flex; align-items:center; gap:6px; flex-wrap:wrap;">
                          <span style="display:inline-flex; align-items:center; gap:4px;">
                            <span style="width:7px; height:7px; border-radius:50%; background:#f59e0b;"></span>
                            🟡 离线 (${absentCount}人):
                          </span>
                          ${absentList.map(name => `
                            <span style="background:#ffffff; color:#92400e; border:1px solid #fcd34d; padding:1px 6px; border-radius:6px; font-size:11px; font-weight:700;">
                              👤 ${escapeHtml(name)}
                            </span>
                          `).join('')}
                        </span>
                      `;
                    } else {
                      return `
                        <span style="font-size:12px; font-weight:700; padding:5px 12px; border-radius:8px; background:#ecfdf5; color:#059669; border:1px solid #a7f3d0; display:inline-flex; align-items:center; gap:5px;">
                          <span style="width:7px; height:7px; border-radius:50%; background:#10b981;"></span>
                          🟢 全员在线 (${online}/${total || online})
                        </span>
                      `;
                    }
                  })()}
                </div>

                <!-- 任务状态感知与 Excel 导出 -->
                <div style="display:flex; align-items:center; gap:10px;">
                  <span style="font-size:12px; font-weight:700; padding:6px 12px; border-radius:8px; background:${isMonitorTaskExpired || state.isFinalSubmitted ? '#fef2f2' : '#ecfdf5'}; color:${isMonitorTaskExpired || state.isFinalSubmitted ? '#dc2626' : '#059669'}; border:1px solid ${isMonitorTaskExpired || state.isFinalSubmitted ? '#fecaca' : '#a7f3d0'};">
                    ${isMonitorTaskExpired ? '🛑 任务已截止 (只读模式)' : (state.isFinalSubmitted ? '🔒 论文终稿已提交 (已归档)' : '🟢 任务进行中 (组员协作撰写中)')}
                  </span>
                  <button id="btn-export-all-excel" style="background:linear-gradient(135deg, #2563eb, #1d4ed8); border:none; color:white; padding:8px 16px; border-radius:8px; font-size:12.5px; font-weight:800; cursor:pointer; box-shadow:0 3px 10px rgba(37,99,235,0.3);">
                    📊 导出本组研讨 Excel
                  </button>
                </div>
              </div>

              <!-- 📍 实时跟随指示条（清爽标准版） -->
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
                  <button class="btn-monitor-stage-tab ${monitorStageMode === 'auto' ? 'active' : ''}" data-stg="auto" style="background:${monitorStageMode === 'auto' ? '#ecfdf5' : '#ffffff'}; border:${monitorStageMode === 'auto' ? '1.5px solid #10b981' : '1px solid #cbd5e1'}; color:${monitorStageMode === 'auto' ? '#059669' : '#64748b'}; padding:6px 14px; border-radius:8px; font-size:12px; font-weight:${monitorStageMode === 'auto' ? '800' : '600'}; cursor:pointer; box-shadow:${monitorStageMode === 'auto' ? '0 1px 4px rgba(16,185,129,0.2)' : 'none'};">
                    ⚡ 自动跟随 (${actualStage === 'stage1' ? '阶段一' : actualStage === 'stage2' ? '阶段二' : '阶段三'}) 🟢
                  </button>
                  <button class="btn-monitor-stage-tab ${monitorStageMode === 'stage1' ? 'active' : ''}" data-stg="stage1" style="background:${monitorStageMode === 'stage1' ? '#eff6ff' : '#ffffff'}; border:${monitorStageMode === 'stage1' ? '1.5px solid #2563eb' : '1px solid #cbd5e1'}; color:${monitorStageMode === 'stage1' ? '#1d4ed8' : '#64748b'}; padding:6px 14px; border-radius:8px; font-size:12px; font-weight:${monitorStageMode === 'stage1' ? '800' : '600'}; cursor:pointer; box-shadow:${monitorStageMode === 'stage1' ? '0 1px 4px rgba(37,99,235,0.2)' : 'none'};">
                    🎪 查看阶段一
                  </button>
                  <button class="btn-monitor-stage-tab ${monitorStageMode === 'stage2' ? 'active' : ''}" data-stg="stage2" style="background:${monitorStageMode === 'stage2' ? '#eff6ff' : '#ffffff'}; border:${monitorStageMode === 'stage2' ? '1.5px solid #2563eb' : '1px solid #cbd5e1'}; color:${monitorStageMode === 'stage2' ? '#1d4ed8' : '#64748b'}; padding:6px 14px; border-radius:8px; font-size:12px; font-weight:${monitorStageMode === 'stage2' ? '800' : '600'}; cursor:pointer; box-shadow:${monitorStageMode === 'stage2' ? '0 1px 4px rgba(37,99,235,0.2)' : 'none'};">
                    📰 查看阶段二
                  </button>
                  <button class="btn-monitor-stage-tab ${monitorStageMode === 'stage3' ? 'active' : ''}" data-stg="stage3" style="background:${monitorStageMode === 'stage3' ? '#eff6ff' : '#ffffff'}; border:${monitorStageMode === 'stage3' ? '1.5px solid #2563eb' : '1px solid #cbd5e1'}; color:${monitorStageMode === 'stage3' ? '#1d4ed8' : '#64748b'}; padding:6px 14px; border-radius:8px; font-size:12px; font-weight:${monitorStageMode === 'stage3' ? '800' : '600'}; cursor:pointer; box-shadow:${monitorStageMode === 'stage3' ? '0 1px 4px rgba(37,99,235,0.2)' : 'none'};">
                    🎓 查看阶段三
                  </button>
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
                      <span style="font-size:11px; background:#eff6ff; color:#2563eb; padding:2px 8px; border-radius:6px; font-weight:700;">全阶段汇总 (${combinedGroupChatLogs.length}条)</span>
                    </div>
                    <div class="teacher-chat-stream" id="teacher-unified-chat-stream" style="flex:1; min-height:0; height:100%; overflow-y:auto; overflow-x:hidden; -webkit-overflow-scrolling:touch; overscroll-behavior-y:contain; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px; font-size:12px; display:flex; flex-direction:column; gap:10px; box-sizing:border-box;">
                      ${combinedGroupChatLogs.length > 0 ? combinedGroupChatLogs.map(m => {
                        const allGlobalUsers = (authManager) ? authManager.getUsers() : [];
                        const isAgent = AgentProfiles[m.sender] !== undefined;
                        const matchedUser = isAgent ? null : allGlobalUsers.find(u => u.id === m.sender || u.studentCode === m.sender || u.username === m.sender || u.name === m.sender);
                        const senderName = isAgent ? AgentProfiles[m.sender].name : (matchedUser ? matchedUser.name : (m.senderName || (monitorMembersObj[m.sender] ? monitorMembersObj[m.sender].name : m.sender)));
                        const color = isAgent ? AgentProfiles[m.sender].color : (matchedUser ? (matchedUser.color || '#2563eb') : (monitorMembersObj[m.sender] ? monitorMembersObj[m.sender].color : '#2563eb'));
                        return `
                          <div style="background:#ffffff; padding:8px 12px; border-radius:8px; border:1px solid #e2e8f0; border-left:3px solid ${color}; box-shadow:0 1px 2px rgba(0,0,0,0.02); word-break:break-word; overflow-wrap:break-word; max-width:100%;">
                            <div style="display:flex; justify-content:space-between; margin-bottom:3px; gap:6px;">
                              <b style="color:${color}; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(senderName)}</b>
                              <span style="color:#94a3b8; font-size:10px; flex-shrink:0;">${escapeHtml(formatChatDisplayTime(m._timeMs || m.timestamp))}</span>
                            </div>
                            <div style="color:#0f172a; line-height:1.5; word-break:break-word; overflow-wrap:break-word;">${escapeHtml(m.text || '')}</div>
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
                          <span>🎪 阶段一实操同屏: 初始提案与学术合作公约 (${activeMonitorGroup.name})</span>
                          <span style="background:#eff6ff; color:#1d4ed8; padding:3px 10px; border-radius:8px; font-size:12px; font-weight:700;">阶段一实况</span>
                        </div>

                        <!-- 1. 【第一步】💡 组员初始学术提案展台 -->
                        <div style="background:#f8fafc; border:1px solid #bfdbfe; border-radius:12px; padding:14px; flex-shrink:0;">
                          <div style="font-size:13.5px; font-weight:800; color:#1e40af; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
                            <span>💡 组员初始学术提案展台 (${(state.stage1?.proposals || []).length}/${monitorMembersList.length || 3} 人已提交):</span>
                            <span style="font-size:11.5px; background:#eff6ff; color:#2563eb; padding:2px 8px; border-radius:6px; font-weight:700;">
                              共投 ${monitorMembersList.filter(m => state.stage1?.hasVoted && (state.stage1.hasVoted[m.id] || state.stage1.hasVoted[m.studentCode] || (m.name && state.stage1.hasVoted[m.name]))).length} 票
                            </span>
                          </div>
                          ${(state.stage1?.proposals && state.stage1.proposals.length > 0) ? `
                            <div class="proposals-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:10px;">
                              ${state.stage1.proposals.map((p, idx) => {
                                const allGlobalUsers = (authManager) ? authManager.getUsers() : [];
                                const authorObj = monitorMembersList.find(m => m.id === p.author || m.studentCode === p.author || m.name === p.authorName || m.name === p.author);
                                const authorUser = allGlobalUsers.find(u => u.id === p.author || u.studentCode === p.author || u.username === p.author || u.name === p.authorName);
                                const authorName = authorObj ? authorObj.name : (authorUser ? authorUser.name : (p.authorName || p.author || `组员${idx+1}`));
                                const votes = monitorMembersList.filter(m => {
                                  if (!state.stage1?.votes) return false;
                                  const v = state.stage1.votes[m.studentCode] || state.stage1.votes[m.id] || (m.name && state.stage1.votes[m.name]);
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

                        <!-- 2. 【第二步】📜 团队协同合作学术合约 (1:1 镜像学生端结构) -->
                        <div style="background:#f8fafc; border:1px solid #bfdbfe; border-radius:12px; padding:14px; display:flex; flex-direction:column; gap:12px;">
                          <div style="font-size:13.5px; font-weight:800; color:#1e40af; display:flex; justify-content:space-between; align-items:center;">
                            <span>📜 团队协同合作学术合约 (${activeMonitorGroup.name}):</span>
                            <span style="font-size:11.5px; background:${state.stage1?.contract?.isLocked ? '#ecfdf5' : '#eff6ff'}; color:${state.stage1?.contract?.isLocked ? '#059669' : '#2563eb'}; padding:2px 8px; border-radius:6px; font-weight:700;">
                              ${state.stage1?.contract?.isLocked ? '🔒 公约已全员签署生效' : '✍️ 协作拟定中'}
                            </span>
                          </div>

                          <!-- 📌 确认融合论文研究主题 -->
                          <div style="background:#ffffff; border:1px solid #cbd5e1; border-radius:8px; padding:10px 12px; border-left:4px solid #2563eb;">
                            <div style="font-size:11.5px; font-weight:800; color:#1e40af; margin-bottom:3px;">📌 确认融合论文研究主题:</div>
                            <div style="font-size:13.5px; font-weight:800; color:#0f172a; line-height:1.4;">${escapeHtml(state.stage1?.mergedTitle || state.stage1?.contract?.topic || '（小组暂未敲定最终论题）')}</div>
                          </div>

                          <!-- 📚 6大研究方案核心模块与时间规划 (独立模块) -->
                          <div style="background:#ffffff; padding:12px; border-radius:8px; border:1px solid #e2e8f0;">
                            <div style="font-weight:800; color:#1e40af; margin-bottom:8px; font-size:12.5px;">
                              📚 研究方案核心模块与时间规划:
                            </div>
                            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(160px, 1fr)); gap:8px;">
                              ${[
                                { key: 'background', label: '一、研究背景与意义', def: 25, color: '#2563eb' },
                                { key: 'literature', label: '二、文献综述', def: 30, color: '#0284c7' },
                                { key: 'questions', label: '三、研究问题与假设', def: 25, color: '#059669' },
                                { key: 'method', label: '四、研究设计与方法', def: 40, color: '#7c3aed' },
                                { key: 'reflection', label: '五、研究设计的不足与反思', def: 20, color: '#d97706' },
                                { key: 'references', label: '六、参考文献', def: 10, color: '#475569' }
                              ].map(sec => {
                                const timeAlloc = state.stage1?.contract?.timeAllocations || {};
                                const timeVal = (timeAlloc[sec.key] !== undefined) ? timeAlloc[sec.key] : sec.def;
                                return `
                                  <div style="background:#f8fafc; border:1px solid #e2e8f0; border-left:3.5px solid ${sec.color}; border-radius:6px; padding:6px 8px; display:flex; justify-content:space-between; align-items:center;">
                                    <span style="font-weight:700; color:#334155; font-size:11.5px;">${sec.label}</span>
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
                                const mKey = m.id || m.studentCode || m.username || m.name || (`mem_${idx}`);
                                const tasks = state.stage1?.contract?.taskAssignments || {};
                                const taskVal = tasks[mKey] !== undefined ? tasks[mKey] :
                                  (m.id && tasks[m.id] !== undefined ? tasks[m.id] :
                                  (m.studentCode && tasks[m.studentCode] !== undefined ? tasks[m.studentCode] :
                                  (m.name && tasks[m.name] !== undefined ? tasks[m.name] : '')));
                                return `
                                  <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:6px 10px; display:flex; flex-direction:column; gap:3px;">
                                    <div style="display:flex; justify-content:space-between; align-items:center;">
                                      <span style="font-weight:800; color:${m.color || '#2563eb'}; font-size:12px;">${m.avatar || '👤'} ${escapeHtml(m.name)} (${m.roleTitle || '组员'}):</span>
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
                                签署进度: ${monitorMembersList.filter(m => { const c = state.stage1?.contract?.confirmedMembers || {}; return c[m.id] || c[m.studentCode] || (m.name && c[m.name]); }).length}/${monitorMembersList.length}
                              </span>
                            </div>
                            <div style="display:flex; gap:6px; flex-wrap:wrap;">
                              ${monitorMembersList.map(m => {
                                const isConf = state.stage1?.contract?.confirmedMembers && (state.stage1.contract.confirmedMembers[m.id] || state.stage1.contract.confirmedMembers[m.studentCode] || (m.name && state.stage1.contract.confirmedMembers[m.name]));
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
                  const totalMemberCount = monitorMembersList.length || 3;
                  const confirmedDraftCount = monitorMembersList.filter(m => state.stage2?.confirmedMembers && (state.stage2.confirmedMembers[m.id] || state.stage2.confirmedMembers[m.studentCode] || state.stage2.confirmedMembers[m.username] || (m.name && state.stage2.confirmedMembers[m.name]))).length;

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
                                const isConf = state.stage2?.confirmedMembers && (state.stage2.confirmedMembers[m.id] || state.stage2.confirmedMembers[m.studentCode] || (m.name && state.stage2.confirmedMembers[m.name]));
                                return `<span style="font-size:11px; padding:1px 8px; border-radius:10px; font-weight:700; background:${isConf ? '#ecfdf5' : '#f8fafc'}; color:${isConf ? '#059669' : '#94a3b8'}; border:1px solid ${isConf ? '#a7f3d0' : '#e2e8f0'};">
                                  ${isConf ? '✓' : '○'} ${escapeHtml(m.name)}
                                </span>`;
                              }).join('')}
                            </div>
                          </div>
                        </div>

                        <!-- 4. 协同文档视口 (未进入该阶段时显示优雅待命占位，不消耗任何带宽/CPU/内存；进入后自动实时同步) -->
                        ${state.currentStage === 'stage1' ? `
                          <div style="flex:1; min-height:560px; display:flex; flex-direction:column; align-items:center; justify-content:center; border-radius:8px; border:1.5px dashed #cbd5e1; background:#ffffff; color:#64748b; padding:24px; text-align:center; gap:8px;">
                            <span style="font-size:32px;">⏳</span>
                            <span style="font-size:14px; font-weight:700; color:#334155;">小组当前处于阶段一（学术公约拟定），尚未进入阶段二编辑部正文协作</span>
                            <span style="font-size:12px; color:#94a3b8;">待组员全员签署公约进入阶段二后，此处将自动实时同步正文协作画面</span>
                          </div>
                        ` : (() => {
                          const rawPadName = `jizhi_${activeTaskId}_${activeMonitorGId}`;
                          return `
                            <div class="teacher-etherpad-container" style="flex:1; min-height:560px; border-radius:8px; overflow:hidden; border:1.5px solid #cbd5e1; box-shadow:0 2px 8px rgba(15,23,42,0.04); background:#ffffff; position:relative; display:flex; flex-direction:column;">
                              <div style="display:flex; justify-content:space-between; align-items:center; background:#f8fafc; border-bottom:1px solid #e2e8f0; padding:6px 12px; font-size:12px; color:#475569; flex-shrink:0;">
                                <div style="display:flex; align-items:center; gap:8px;">
                                  <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#10b981;"></span>
                                  <span style="font-weight:700; color:#1e293b;">🔒 教师端同屏镜像 (实时协同直连)</span>
                                </div>
                                <span style="font-size:11px; background:#ecfdf5; color:#059669; border:1px solid #a7f3d0; padding:1px 8px; border-radius:4px; font-weight:700;">实时监控</span>
                              </div>
                              <div style="position:relative; flex:1; width:100%; height:100%; min-height:520px; display:flex;">
                                <div class="etherpad-readonly-shield" style="position:absolute; inset:0; z-index:25; background:transparent; cursor:not-allowed; pointer-events:none;" title="🔒 只读查阅模式 (已锁定禁止编辑)"></div>
                                <iframe id="teacher-stage2-etherpad-frame" src="/p/${encodeURIComponent(rawPadName)}?userName=${encodeURIComponent('教师监控')}&userColor=%237c3aed&showControls=false&showChat=false&showLineNumbers=true&lang=zh-hans" style="flex:1; width:100%; height:100%; min-height:520px; border:none; display:block; background:#ffffff;" title="教师端实时写作同屏镜像 (只读)"></iframe>
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
                                monitorMembersList.forEach(m => { rawTotal += (contribs[m.id] || 0) + (contribs[m.studentCode] || 0); });
                                return monitorMembersList.map((m) => {
                                  const rawVal = (contribs[m.id] || 0) + (contribs[m.studentCode] || 0);
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
                              monitorMembersList.forEach(m => { rawTotal += (contribs[m.id] || 0) + (contribs[m.studentCode] || 0); });
                              if (rawTotal === 0) {
                                return `<div style="width:100%; height:10px; background:#f8fafc; border-radius:5px; display:flex; align-items:center; justify-content:center; font-size:10px; color:#94a3b8; font-weight:600;">⏳ 暂无协作投入 (组员在 Etherpad 中撰写、修改正文或研讨后将平滑累计真实贡献)</div>`;
                              }
                              return monitorMembersList.map((m) => {
                                const rawVal = (contribs[m.id] || 0) + (contribs[m.studentCode] || 0);
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
                          <!-- Tab 2: 论文终稿实时镜像 (未进入阶段三时显示待命占位，不消耗资源) -->
                          <div style="flex-shrink:0; display:flex; justify-content:space-between; align-items:center;">
                            <span style="font-size:13.5px; font-weight:800; color:#1e40af;">📜 论文终稿正文全篇镜像:</span>
                            <span style="font-size:12px; color:#64748b;">终稿字数: <b id="teacher-stage3-word-count-num" style="color:#2563eb; font-size:14px;">${((state.stage3?.finalDraft || state.stage2?.unifiedContent || '').replace(/<[^>]*>/g, '').trim()).length}</b> 字</span>
                          </div>
                          ${(state.currentStage === 'stage1' || state.currentStage === 'stage2') ? `
                            <div style="flex:1; min-height:560px; display:flex; flex-direction:column; align-items:center; justify-content:center; border-radius:8px; border:1.5px dashed #cbd5e1; background:#ffffff; color:#64748b; padding:24px; text-align:center; gap:8px;">
                              <span style="font-size:32px;">⏳</span>
                              <span style="font-size:14px; font-weight:700; color:#334155;">小组尚未进入阶段三论文终稿与答辩阶段</span>
                              <span style="font-size:12px; color:#94a3b8;">待小组进入阶段三后，此处将自动实时呈现论文终稿镜像</span>
                            </div>
                          ` : (() => {
                            const rawPadName = `jizhi_${activeTaskId}_${activeMonitorGId}`;
                            if (!state._readOnlyPadMap) state._readOnlyPadMap = {};
                            const readOnlyPadId = state._readOnlyPadMap[rawPadName];
                            if (!readOnlyPadId) {
                              fetch(`sync.php?action=get_readonly_pad_id&padId=${rawPadName}`).then(r => r.json()).then(res => {
                                if (res && res.success && res.readOnlyID) {
                                  state._readOnlyPadMap[rawPadName] = res.readOnlyID;
                                  const f3 = document.querySelector('#teacher-stage3-etherpad-frame');
                                  if (f3 && !f3.src.includes(res.readOnlyID)) {
                                    f3.src = `/p/${res.readOnlyID}?userName=${encodeURIComponent('教师监控')}&userColor=%237c3aed&showControls=false&showChat=false&showLineNumbers=true&lang=zh-hans`;
                                  }
                                }
                              }).catch(() => {});
                            }
                            const targetPad = readOnlyPadId || rawPadName;
                            return `
                              <div class="teacher-etherpad-container" style="flex:1; min-height:560px; border-radius:8px; overflow:hidden; border:1.5px solid #cbd5e1; box-shadow:0 2px 8px rgba(15,23,42,0.04); background:#ffffff; position:relative; display:flex; flex-direction:column;">
                                <div style="display:flex; justify-content:space-between; align-items:center; background:#f8fafc; border-bottom:1px solid #e2e8f0; padding:6px 12px; font-size:12px; color:#475569; flex-shrink:0;">
                                  <div style="display:flex; align-items:center; gap:8px;">
                                    <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#10b981;"></span>
                                    <span style="font-weight:700; color:#1e293b;">🔒 教师端终稿镜像 (纯净只读阅卷 · 实时协同直连)</span>
                                  </div>
                                  <span style="font-size:11px; background:#ecfdf5; color:#059669; border:1px solid #a7f3d0; padding:1px 8px; border-radius:4px; font-weight:700;">只读监控</span>
                                </div>
                                <div style="position:relative; flex:1; width:100%; height:100%; min-height:520px; display:flex;">
                                  <div class="etherpad-readonly-shield" style="position:absolute; inset:0; z-index:25; background:transparent; cursor:not-allowed; pointer-events:none;" title="🔒 只读查阅模式 (已锁定禁止编辑)"></div>
                                  <iframe id="teacher-stage3-etherpad-frame" src="/p/${encodeURIComponent(targetPad)}?userName=${encodeURIComponent('教师监控')}&userColor=%237c3aed&showControls=false&showChat=false&showLineNumbers=true&lang=zh-hans" style="flex:1; width:100%; height:100%; min-height:520px; border:none; display:block; background:#ffffff;" title="教师端论文终稿同屏镜像 (只读)"></iframe>
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
                                  monitorMembersList.forEach(m => { rawTotal += (contribs[m.id] || 0) + (contribs[m.studentCode] || 0); });
                                  return monitorMembersList.map((m) => {
                                    const rawVal = (contribs[m.id] || 0) + (contribs[m.studentCode] || 0);
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
                                monitorMembersList.forEach(m => { rawTotal += (contribs[m.id] || 0) + (contribs[m.studentCode] || 0); });
                                if (rawTotal === 0) {
                                  return `<div style="width:100%; height:10px; background:#f8fafc; border-radius:5px; display:flex; align-items:center; justify-content:center; font-size:10px; color:#94a3b8; font-weight:600;">⏳ 暂无协作投入</div>`;
                                }
                                return monitorMembersList.map((m) => {
                                  const rawVal = (contribs[m.id] || 0) + (contribs[m.studentCode] || 0);
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
    </div>
  `;

  container.dataset.renderedClassId = activeClassId;
  container.dataset.renderedGroupId = activeMonitorGId;
  container.dataset.renderedTaskId = effectiveMonitorTaskId;
  container.dataset.renderedStage = effectiveMonitorStage;
  container.dataset.renderedMode = monitorStageMode;
  container.dataset.renderedS3Tab = currentS3Tab;
  container.dataset.renderedTab = activeTab;

  // 🔒 确保教师端无论是阶段二还是阶段三的 Etherpad iframe，均被 DOM 内核层权威锁定为只读
  const tFrame2 = container.querySelector('#teacher-stage2-etherpad-frame');
  if (tFrame2) enforceEtherpadReadonly(tFrame2);
  const tFrame3 = container.querySelector('#teacher-stage3-etherpad-frame');
  if (tFrame3) enforceEtherpadReadonly(tFrame3);

  const btnLogout = container.querySelector('#btn-logout');
  if (btnLogout) btnLogout.addEventListener('click', () => onLogout());

  const btnChangePwd = container.querySelector('#btn-teacher-change-pwd');
  if (btnChangePwd) {
    btnChangePwd.addEventListener('click', () => {
      authManager.openChangePasswordModal();
    });
  }

  const btnSwitchStudent = container.querySelector('#btn-switch-student-preview');
  if (btnSwitchStudent) btnSwitchStudent.addEventListener('click', () => onSwitchToStudentView());

  container.querySelectorAll('.teacher-tab-nav').forEach(btn => {
    btn.addEventListener('click', () => {
      state.teacherActiveTab = btn.dataset.tab;
      try {
        sessionStorage.setItem('jizhi_teacher_active_tab', btn.dataset.tab);
        localStorage.setItem('jizhi_teacher_active_tab', btn.dataset.tab);
      } catch (e) {}
      if (!state.stage1) state.stage1 = { topics: [], bidLogs: [], contract: { confirmedMembers: {}, taskAssignments: {}, timeAllocations: {} } };
      if (!state.stage2) state.stage2 = { unifiedContent: '', memberContributions: {} };
      if (!state.stage3) state.stage3 = { reviews: [] };
      if (!state.chatLogs) state.chatLogs = { stage1: [], stage2: [], stage3: [] };

      if (btn.dataset.tab === 'view_monitoring' && window.app) {
        try {
          window.app.loadGroupState(state.activeMonitorGroupId || (activeClass?.groups?.[0]?.id) || null);
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
      const newCId = btn.dataset.id;
      state.activeClassId = newCId;
      const targetC = (authManager.getClasses() || []).find(c => c.id === newCId);
      const cTasks = (authManager.getTasks() || []).filter(t => t.classId === newCId || (targetC && t.className === targetC.name) || (!t.classId && newCId === 'class_101'));
      state.activeTaskId = cTasks[0] ? cTasks[0].id : 'task_default';
      state.activeMonitorGroupId = (targetC && targetC.groups && targetC.groups[0]) ? targetC.groups[0].id : 'group_1';
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
        sessionStorage.setItem('jizhi_teacher_active_class_id', newCId);
        localStorage.setItem('jizhi_teacher_active_class_id', newCId);
        sessionStorage.setItem('jizhi_teacher_active_group_id', state.activeMonitorGroupId);
        localStorage.setItem('jizhi_teacher_active_group_id', state.activeMonitorGroupId);
      } catch (e) {}
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
          const nextC = remainingClasses[0] || { id: 'class_101', groups: [] };
          state.activeClassId = nextC.id;
          const cTasks = (authManager.getTasks() || []).filter(t => t.classId === nextC.id || (!t.classId && nextC.id === 'class_101'));
          state.activeTaskId = cTasks[0] ? cTasks[0].id : 'task_default';
          state.activeMonitorGroupId = (nextC.groups && nextC.groups[0]) ? nextC.groups[0].id : 'group_1';
          state.monitorPanorama = null;
          state._lastMonitorHash = '';
          state._lastEpHash = '';
          state.stage1 = null;
          state.stage2 = null;
          state.stage3 = null;
          state.chatLogs = null;
          if (window.app && window.app.state) {
            window.app.state.activeClassId = nextC.id;
            window.app.state.activeTaskId = state.activeTaskId;
            window.app.state.activeMonitorGroupId = state.activeMonitorGroupId;
          }
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
        state.activeTaskId = 'task_default';
        state.activeMonitorGroupId = (newC.groups && newC.groups[0]) ? newC.groups[0].id : 'group_1';
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
        renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
      }
    });
  }

  // 👨‍🎓 1. 单条创建学生账号（纯粹创建面板）
  const btnAddStd = container.querySelector('#btn-v1-add-student');
  if (btnAddStd) {
    btnAddStd.addEventListener('click', () => {
      document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="teacher-modal-card fancy-task-modal" style="width:480px; background:#ffffff; border:1px solid #e2e8f0; box-shadow:0 20px 45px rgba(15,23,42,0.12);">
          <div class="teacher-modal-header" style="background:linear-gradient(135deg, #eff6ff, #f8fafc); border-bottom:1px solid #e2e8f0; padding:18px 24px; display:flex; justify-content:space-between; align-items:center;">
            <div class="modal-header-title" style="display:flex; align-items:center; gap:10px;">
              <div class="modal-icon-badge" style="background:#dbeafe; color:#2563eb; font-size:20px; padding:6px 10px; border-radius:10px;">✏️</div>
              <div><h3 style="margin:0; font-size:17px; font-weight:800; color:#0f172a;">单条创建学生账号 (${activeClass.name})</h3></div>
            </div>
            <button class="modal-close-btn" id="btn-close-single-student" style="background:#f1f5f9; border:none; color:#64748b; font-size:16px; border-radius:8px; width:30px; height:30px; cursor:pointer;">✕</button>
          </div>

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
    });
  }

  // 👥 2. 加入已有学生到班级（独立面板）
  const btnEnrollExisting = container.querySelector('#btn-v1-enroll-existing-student');
  if (btnEnrollExisting) {
    btnEnrollExisting.addEventListener('click', () => {
      document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
      const allUsers = authManager.getUsers();
      const currentClassStudentIds = new Set(authManager.getClassStudents(activeClass.id).map(s => s.id));
      const unenrolledStudents = allUsers.filter(u =>
        u.role !== 'teacher' && !currentClassStudentIds.has(u.id)
      );

      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="teacher-modal-card fancy-task-modal" style="width:580px; background:#ffffff; border:1px solid #e2e8f0; box-shadow:0 20px 45px rgba(15,23,42,0.12);">
          <div class="teacher-modal-header" style="background:linear-gradient(135deg, #eff6ff, #f8fafc); border-bottom:1px solid #e2e8f0; padding:18px 24px; display:flex; justify-content:space-between; align-items:center;">
            <div class="modal-header-title" style="display:flex; align-items:center; gap:10px;">
              <div class="modal-icon-badge" style="background:#dbeafe; color:#2563eb; font-size:20px; padding:6px 10px; border-radius:10px;">👥</div>
              <div><h3 style="margin:0; font-size:17px; font-weight:800; color:#0f172a;">加入已有学生到班级 (${activeClass.name})</h3></div>
            </div>
            <button class="modal-close-btn" id="btn-close-enroll-modal" style="background:#f1f5f9; border:none; color:#64748b; font-size:16px; border-radius:8px; width:30px; height:30px; cursor:pointer;">✕</button>
          </div>

          <div class="teacher-modal-body" style="padding:20px 24px;">
            <div style="font-size:12.5px; color:#1e40af; background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:10px 14px; margin-bottom:12px;">
              💡 以下学生已在平台账号库中。勾选后可将其同时分配进本班级，<b>账号和密码保持不变，绝不重复生成</b>。
            </div>
            <div style="margin-bottom:10px;">
              <input type="text" id="input-search-enroll-std" placeholder="🔍 输入姓名或学号快速搜索已有学生..." style="background:#ffffff; border:1.5px solid #cbd5e1; color:#0f172a; padding:8px 12px; border-radius:8px; width:100%; font-size:13px; outline:none;">
            </div>
            <div id="enroll-std-list-box" style="max-height:280px; overflow-y:auto; display:flex; flex-direction:column; gap:8px;">
              ${unenrolledStudents.length === 0 ? `
                <div style="text-align:center; color:#64748b; padding:32px; font-size:13.5px;">
                  ✅ 平台内所有学生账号均已加入当前班级，无待加入学生
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
            <button class="modal-btn submit task-theme" id="btn-submit-enroll" style="background:linear-gradient(135deg, #1d4ed8, #2563eb); border:none; color:white; padding:8px 20px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer;">👥 确认加入本班</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      const closeModal = () => { modal.remove(); };
      modal.querySelector('#btn-close-enroll-modal').addEventListener('click', closeModal);
      modal.querySelector('#btn-cancel-enroll').addEventListener('click', closeModal);
      modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

      // 🔍 模糊搜索过滤
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

      // 提交加入本班
      modal.querySelector('#btn-submit-enroll').addEventListener('click', () => {
        const checked = modal.querySelectorAll('.enroll-chk:checked');
        if (checked.length === 0) { alert('⚠️ 请勾选至少一位学生！'); return; }
        checked.forEach(chk => {
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
        alert(`🎉 成功将选中的 ${checked.length} 位学生加入当前班级【${activeClass.name}】！`);
        renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
      });
    });
  }

  const btnImportFile = container.querySelector('#btn-v1-import-file');
  if (btnImportFile) {
    btnImportFile.addEventListener('click', () => {
      document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="teacher-modal-card fancy-task-modal" style="width:620px; background:#ffffff; border:1px solid #e2e8f0; box-shadow:0 20px 45px rgba(15,23,42,0.15); border-radius:16px; overflow:hidden;">
          <div class="teacher-modal-header" style="background:linear-gradient(135deg, #1d4ed8, #2563eb); color:#ffffff; padding:18px 24px; display:flex; justify-content:space-between; align-items:center;">
            <div class="modal-header-title" style="display:flex; align-items:center; gap:10px;">
              <div class="modal-icon-badge" style="background:rgba(255,255,255,0.2); color:#ffffff; font-size:20px; padding:6px 10px; border-radius:10px;">📥</div>
              <div>
                <h3 style="margin:0; font-size:17px; font-weight:800; color:#ffffff;">上传 XLSX / CSV 文件导入学生账号 (${activeClass.name})</h3>
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
              <textarea id="modal-paste-textarea" class="teacher-textarea fancy" style="min-height:90px; font-family:monospace; font-size:13px; width:100%; box-sizing:border-box; padding:10px 12px; border:1.5px solid #cbd5e1; border-radius:8px; outline:none;" placeholder="每行一位学生，逗号或空格分隔：&#10;姓名, 登录账号, 学号, 初始密码(可选)"></textarea>
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
                const otherGroup = (cls.groups || []).find(g => g.id !== editingGroupId && g.members && g.members.includes(s.id));
                return `
                  <div class="grp-student-item" data-search="${(s.name + ' ' + (s.studentCode || '') + ' ' + (s.username || '')).toLowerCase()}" style="display:flex; justify-content:space-between; align-items:center; background:#ffffff; border:1px solid #e2e8f0; padding:10px 14px; border-radius:8px; transition:all 0.15s;">
                    <label style="display:flex; align-items:center; gap:10px; cursor:pointer; font-size:13.5px; color:#0f172a; font-weight:600; width:100%;">
                      <input type="checkbox" class="chk-grp-member" value="${s.id}" ${isChecked ? 'checked' : ''} style="width:17px; height:17px; cursor:pointer; accent-color:#2563eb;">
                      <span>${s.avatar || '👤'} <b>${s.name}</b> <code style="color:#2563eb; font-family:monospace; margin-left:4px;">${s.studentCode || s.username}</code></span>
                      ${otherGroup ? `<span style="background:#fef3c7; color:#b45309; border:1px solid #fde68a; font-size:11.5px; padding:1px 8px; border-radius:6px; font-weight:700; margin-left:auto;">(现归属: ${otherGroup.name})</span>` : ''}
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
          const tId = (currT && (currT.studentCode || currT.username || currT.id)) || '';
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
            <div style="font-size:12.5px; color:#64748b; background:#f8fafc; padding:8px 12px; border-radius:8px; border:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
              <span>当前最新截止时间：<b style="color:${isPastDeadline ? '#dc2626' : '#2563eb'};">${displayCurrentDeadline}</b></span>
              ${isPastDeadline ? '<span style="background:#fee2e2; color:#dc2626; font-size:11px; font-weight:800; padding:2px 6px; border-radius:4px;">已过期（从当前时刻顺延）</span>' : '<span style="background:#ecfdf5; color:#059669; font-size:11px; font-weight:800; padding:2px 6px; border-radius:4px;">进行中（从原截止时间顺延）</span>'}
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
              <input type="datetime-local" id="input-extend-deadline" class="teacher-input fancy" value="${formatLocalDateForInput(new Date(baseDate.getTime() + 60 * 60 * 1000))}" style="width:100%; font-size:13px; padding:9px 12px; border:1.5px solid #cbd5e1; border-radius:8px;">
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
          dlInput.value = formatLocalDateForInput(newD);
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
          showGlobalBannerNotice('✅ 延期成功', `写作任务《${task.title}》截止时间已延长至 ${newDeadlineStr}！学生端已自动解除只读锁定。`, 'success');
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
        const startTime = modal.querySelector('#modal-task-start') ? modal.querySelector('#modal-task-start').value : '';
        const deadline = modal.querySelector('#modal-task-deadline') ? modal.querySelector('#modal-task-deadline').value : '';

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
        if (!taskId || taskId === 'task_all' || taskId === 'task_default') {
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
              const tId = (currT && (currT.studentCode || currT.username || currT.id)) || '';
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

          const targetTaskId = modal.querySelector('#modal-paper-task') ? modal.querySelector('#modal-paper-task').value : '';
          if (!targetTaskId || targetTaskId === 'task_all' || targetTaskId === 'task_default') {
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
            title = selectedFile.name ? selectedFile.name.replace(/\.[^/.]+$/, '') : '学术参考范文';
          }

          submitBtn.disabled = true;
          submitBtn.innerText = '⏳ 正在上传文献到服务器...';

          let serverFileUrl = '';
          if (selectedFile.fileObj) {
            try {
              const currT = authManager.getCurrentUser();
              const tId = (currT && (currT.studentCode || currT.username || currT.id)) || '';
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
        renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
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
      renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
    });
  }

  const syncGroupDataFromMemory = (targetGId) => {
    state.activeMonitorGroupId = targetGId;
    state._lastMonitorHash = '';
    state._lastEpHash = '';
    if (state.monitorPanorama && state.monitorPanorama[targetGId]) {
      const gData = state.monitorPanorama[targetGId];
      state.stage1 = gData.stage1 || { proposals: [], votes: {}, hasVoted: {}, contract: {} };
      state.stage2 = { ...(state.stage2 || {}), ...(gData.stage2 || {}), unifiedContent: gData.stage2?.unifiedContent || '' };
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
      renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
    });
  }

  container.querySelectorAll('.btn-monitor-panorama-card').forEach(card => {
    card.addEventListener('click', () => {
      syncGroupDataFromMemory(card.dataset.gid);
      renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
    });
  });

  container.querySelectorAll('.btn-switch-monitor-group').forEach(btn => {
    btn.addEventListener('click', () => {
      syncGroupDataFromMemory(btn.dataset.gid);
      renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
    });
  });

  container.querySelectorAll('.btn-monitor-stage-tab').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const stg = btn.dataset.stg;
      state.teacherMonitorStageMode = stg;
      state.monitorStageTab = stg;
      renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
    });
  });

  const btnStage3Def = container.querySelector('#btn-tab-teacher-stage3-defense');
  if (btnStage3Def) {
    btnStage3Def.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      state.stage3TeacherTab = 'defense';
      renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
    });
  }
  const btnStage3Doc = container.querySelector('#btn-tab-teacher-stage3-doc');
  if (btnStage3Doc) {
    btnStage3Doc.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      state.stage3TeacherTab = 'doc';
      renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
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
      authManager.exportGroupChatLogsToExcel(activeMonitorGId, state.chatLogs);
    });
  }

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

