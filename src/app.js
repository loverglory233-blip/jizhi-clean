/**
 * JIZHI (集智) Platform - Main Application Coordinator & Lifecycle
 * Standard ES Module (ESM)
 */

import {
  InitialState,
  STORAGE_KEY_ANNOUNCEMENTS,
  STORAGE_KEY_TASKS,
  STORAGE_KEY_CLASSES,
  STORAGE_KEY_USERS_DB,
  AgentProfiles
} from "./constants.js?v=20260830_v795";
import { downloadFileBlob, escapeHtml, getCaretCharacterOffsetWithin, isTaskExpired, showGlobalBannerNotice, formatStandardDateDash } from "./utils.js?v=20260830_v795";
import { callCozeAgentAPI } from "./agents.js?v=20260830_v795";
import { AuthManager } from "./auth.js?v=20260830_v795";
import { CloudSyncEngine } from "./sync.js?v=20260830_v795";
import { renderLoginView } from "./login.js?v=20260830_v795";
import { renderTeacherPortal } from "./teacher.js?v=20260830_v795";
import { renderStudentTaskPortal } from "./student-portal.js?v=20260830_v795";
import {
  buildWordEditorHtml,
  attachWordEditorEvents,
  renderChat,
  renderHeader,
  renderCanvas,
  renderPresencePills,
  renderRemoteCursors
} from "./editor.js?v=20260830_v795";

// Make renderChat available on window for sync callbacks
if (typeof window !== "undefined") {
  window.renderChat = renderChat;
}

/* ==========================================================================
   9. APP CONTROLLER (GROUP-SCOPED ISOLATION)
   ========================================================================== */
export class App {
  constructor() {
    this.authManager = new AuthManager();
    this.state = JSON.parse(JSON.stringify(InitialState));
    this.studentMsgCountSinceLastAgent = 0;

    const storedTaskId = sessionStorage.getItem('jizhi_active_task_id') || localStorage.getItem('jizhi_active_task_id');
    if (storedTaskId) this.state.activeTaskId = storedTaskId;

    const storedClassId = sessionStorage.getItem('jizhi_active_student_class_id') || localStorage.getItem('jizhi_active_student_class_id');
    if (storedClassId) this.state.activeStudentClassId = storedClassId;

    const storedViewMode = sessionStorage.getItem('jizhi_student_view_mode') || localStorage.getItem('jizhi_student_view_mode');
    this.state.studentViewMode = (storedViewMode === 'workspace' && storedTaskId) ? 'workspace' : 'task_list';

    // 🛡️ 教师端状态持久化恢复：刷新后精准停留在上次选中的班级/小组/Tab
    const storedTeacherClassId = sessionStorage.getItem('jizhi_teacher_active_class_id') || localStorage.getItem('jizhi_teacher_active_class_id');
    if (storedTeacherClassId) this.state.activeClassId = storedTeacherClassId;
    const storedTeacherGroupId = sessionStorage.getItem('jizhi_teacher_active_group_id') || localStorage.getItem('jizhi_teacher_active_group_id');
    if (storedTeacherGroupId) this.state.activeMonitorGroupId = storedTeacherGroupId;
    const storedTeacherTab = sessionStorage.getItem('jizhi_teacher_active_tab') || localStorage.getItem('jizhi_teacher_active_tab');
    if (storedTeacherTab) this.state.teacherActiveTab = storedTeacherTab;

    const user = this.authManager.getCurrentUser();
    const effectiveClassId = this.state.activeStudentClassId || user?.classId || 'class_101';
    const activeGroupObj = this.authManager.getStudentActiveGroup(user, effectiveClassId);
    const currentGroupId = activeGroupObj?.id || user?.groupId || 'group_1';
    this.loadGroupState(currentGroupId);

    this.cloudSyncEngine = new CloudSyncEngine(this);
    this.initTimer();
    this.renderMain();

    // 🛡️ 全局事件委托：确保无论阶段一如何局部刷新，点击“一键生成公约草案”/“投票”/“签署” 100% 触发
    document.addEventListener('click', (e) => {
      const genBtn = e.target.closest('#btn-generate-contract-draft');
      if (genBtn && this.handleAiGenerateContract) {
        this.handleAiGenerateContract();
        return;
      }
      const voteBtn = e.target.closest('.vote-btn:not([disabled])');
      if (voteBtn && voteBtn.dataset.id) {
        this.handleVoteCast(voteBtn.dataset.id);
        return;
      }
    });

    // 启动时立刻从 MySQL 服务器拉取最新全局教务元数据与小组协同数据
    (async () => {
      try {
        await this.authManager.pullGlobalMeta();
        if (this.cloudSyncEngine) {
          this.cloudSyncEngine.updateScopeKeys();
          this.cloudSyncEngine.pullFromServer();
        }
        if (user && (user.role === 'student' || user.isStudent)) {
          if (this.state.studentViewMode === 'task_list') {
            this.renderMain();
          } else {
            this.checkUnreadAnnouncements();
          }
        }
      } catch (e) {}
    })();
  }

  loadGroupState(groupId = 'group_1') {
    const defaultState = JSON.parse(JSON.stringify(InitialState));
    const user = this.authManager ? this.authManager.getCurrentUser() : null;
    const isTeacher = user && (user.isTeacher || user.role === 'teacher');
    const effectiveClassId = (isTeacher ? this.state.activeClassId : this.state.activeStudentClassId) || user?.classId || 'class_101';
    let taskId = this.state.activeTaskId || (this.cloudSyncEngine ? this.cloudSyncEngine.taskId : `task_${effectiveClassId}_default`);
    if (!taskId || taskId === 'task_default') {
      taskId = `task_${effectiveClassId}_default`;
    }
    this.state.activeTaskId = taskId;
    this.state.members = this.authManager.getGroupMembersForWorkspace(groupId, effectiveClassId);

    // 🛡️ 优先从单一轻量工作台快照恢复（仅记录当前组，0ms秒开上屏且绝不超5MB配额）
    let cached = null;
    try {
      const raw = sessionStorage.getItem('jizhi_active_workspace_snap') || localStorage.getItem('jizhi_active_workspace_snap');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.classId === effectiveClassId && parsed.taskId === taskId && parsed.groupId === groupId) {
          cached = parsed;
        }
      }
    } catch (e) {}

    if (cached) {
      this.state.chatLogs = cached.chatLogs || { stage1: [], stage2: [], stage3: [] };
      this.state.stage1 = cached.stage1 || JSON.parse(JSON.stringify(defaultState.stage1));
      this.state.stage2 = cached.stage2 || JSON.parse(JSON.stringify(defaultState.stage2));
      this.state.stage3 = cached.stage3 || JSON.parse(JSON.stringify(defaultState.stage3));
      this.state.presence = cached.presence || this.state.presence || {};
      this.state.currentStage = cached.currentStage || 'stage1';
      this.state.groupMaxStage = cached.currentStage || 'stage1';
      this.state.isFinalSubmitted = (cached.isFinalSubmitted !== undefined) ? !!cached.isFinalSubmitted : false;
    } else {
      // 🛡️ 切换到新组时，第1行代码立刻清空内存残留消息，彻底杜绝上一组的聊天残影
      this.state.chatLogs = { stage1: [], stage2: [], stage3: [] };
      this.state.stage1 = JSON.parse(JSON.stringify(defaultState.stage1));
      this.state.stage2 = JSON.parse(JSON.stringify(defaultState.stage2));
      this.state.stage3 = JSON.parse(JSON.stringify(defaultState.stage3));
      this.state.currentStage = 'stage1';
      this.state.groupMaxStage = 'stage1';
      this.state.isFinalSubmitted = false;
    }

    // 立即触发云端全量拉取当前任务对应小组的最新权威真实数据
    if (this.cloudSyncEngine) {
      this.cloudSyncEngine.groupId = groupId;
      this.cloudSyncEngine.taskId = taskId;
      this.cloudSyncEngine._lastKnownRevisionId = 0; // 重置 revisionId，确保拉取到当前任务真实数据
      this.cloudSyncEngine._hasPulledGlobal = false;
      this.cloudSyncEngine.isInitialPullDone = false;
      this.cloudSyncEngine.updateScopeKeys();
      this.cloudSyncEngine.pullFromServer();
    }
  }

  initPresetMessagesForGroup(groupId) {
    this.state.chatLogs = { stage1: [], stage2: [], stage3: [] };
  }

  getEffectiveGroupId() {
    const user = this.authManager ? this.authManager.getCurrentUser() : null;
    const isTeacher = user && (user.isTeacher || user.role === 'teacher');
    if (isTeacher) {
      return this.state.activeMonitorGroupId || 'group_1';
    }
    const effectiveClassId = this.state.activeStudentClassId || user?.classId || 'class_101';
    const activeGroupObj = this.authManager ? this.authManager.getStudentActiveGroup(user, effectiveClassId) : null;
    return activeGroupObj?.id || user?.groupId || 'group_1';
  }

  saveGroupState(groupId) {
    // 🛡️ 单一 Key 覆盖轻量快照：仅缓存当前正在操作的 1 个工作台，保障 0ms 秒开，绝不堆积碎片
    try {
      const user = this.authManager ? this.authManager.getCurrentUser() : null;
      const isTeacher = user && (user.isTeacher || user.role === 'teacher');
      const effectiveClassId = (isTeacher ? this.state.activeClassId : this.state.activeStudentClassId) || user?.classId || 'class_101';
      const snap = {
        classId: effectiveClassId,
        taskId: this.state.activeTaskId,
        groupId: groupId,
        chatLogs: this.state.chatLogs,
        stage1: this.state.stage1,
        stage2: this.state.stage2,
        stage3: this.state.stage3,
        currentStage: this.state.currentStage,
        groupMaxStage: this.state.groupMaxStage,
        presence: this.state.presence,
        isFinalSubmitted: this.state.isFinalSubmitted,
        updatedAt: Date.now()
      };
      const snapStr = JSON.stringify(snap);
      sessionStorage.setItem('jizhi_active_workspace_snap', snapStr);
      localStorage.setItem('jizhi_active_workspace_snap', snapStr);
    } catch (e) {}
  }

  // 💬 精准单条发信入库方法（确保任何来源的消息 100% 毫秒级写入 MySQL chat_messages 实体表）
  sendSingleChatMessage(msg, stage = null) {
    if (!msg) return;
    const user = this.authManager ? this.authManager.getCurrentUser() : null;
    const isTeacher = user && (user.isTeacher || user.role === 'teacher');
    const effectiveClassId = (isTeacher ? this.state.activeClassId : this.state.activeStudentClassId) || user?.classId || 'class_101';
    const groupId = this.getEffectiveGroupId();
    let taskId = this.state.activeTaskId || (this.cloudSyncEngine ? this.cloudSyncEngine.taskId : `task_${effectiveClassId}_default`);
    if (!taskId || taskId === 'task_default') {
      taskId = `task_${effectiveClassId}_default`;
    }
    const targetStage = stage || this.state.currentStage || 'stage1';

    const payload = {
      id: msg.id || ('msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6)),
      classId: effectiveClassId,
      groupId: groupId,
      taskId: taskId,
      stage: targetStage,
      sender: msg.sender,
      senderName: msg.senderName || '',
      text: msg.text,
      timestamp: msg.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      _timeMs: msg._timeMs || Date.now()
    };

    try {
      if (this.cloudSyncEngine && this.cloudSyncEngine.bc) {
        this.cloudSyncEngine.bc.postMessage({ chatMessage: payload, stage: targetStage });
      }
    } catch (e) {}

    try {
      fetch(`sync.php?action=send_chat&groupId=${encodeURIComponent(groupId)}&taskId=${encodeURIComponent(taskId)}&classId=${encodeURIComponent(effectiveClassId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(() => {});
    } catch (e) {}
  }

  syncChatLogs() {
    const user = this.authManager ? this.authManager.getCurrentUser() : null;
    const isTeacher = user && (user.isTeacher || user.role === 'teacher');
    const effectiveClassId = (isTeacher ? this.state.activeClassId : this.state.activeStudentClassId) || user?.classId || 'class_101';
    const groupId = this.getEffectiveGroupId();
    let taskId = this.state.activeTaskId || (this.cloudSyncEngine ? this.cloudSyncEngine.taskId : `task_${effectiveClassId}_default`);
    if (!taskId || taskId === 'task_default') {
      taskId = `task_${effectiveClassId}_default`;
    }
    const stage = this.state.currentStage || 'stage1';
    const logs = (this.state.chatLogs && this.state.chatLogs[stage]) ? this.state.chatLogs[stage] : [];
    const latestMsg = logs[logs.length - 1];

    if (latestMsg) {
      this.sendSingleChatMessage(latestMsg, stage);
    }
  }

  syncStage1() {
    const groupId = this.getEffectiveGroupId();
    this.saveGroupState(groupId);
    if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
  }

  syncStage2() {
    const groupId = this.getEffectiveGroupId();
    this.saveGroupState(groupId);
    if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
  }

  syncStage3() {
    const groupId = this.getEffectiveGroupId();
    this.saveGroupState(groupId);
    if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
  }

  renderPresenceCursors() {
    const stage = this.state.currentStage || 'stage1';
    if (stage === 'stage1') renderPresencePills('stage1-canvas', this.state);
    else if (stage === 'stage2') renderRemoteCursors('stage2-word-editor', this.state);
    else if (stage === 'stage3') renderRemoteCursors('stage3-word-editor', this.state);
    try { renderChat(this.state); } catch (e) {}
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
        membersList.forEach(m => { rawTotal += (contribs[m.id] || contribs[m.studentCode] || 0); });

        contribLabelsContainer.innerHTML = membersList.map((m) => {
          const rawVal = (contribs[m.id] || contribs[m.studentCode] || 0);
          const pct = rawTotal > 0 ? Math.round((rawVal / rawTotal) * 100) : 0;
          return `<span style="color:${m.color || '#2563eb'}; font-weight:700;">● ${m.name}: ${pct}%</span>`;
        }).join('');

        if (rawTotal === 0) {
          contribBarsContainer.innerHTML = `<div style="width:100%; height:10px; background:#f1f5f9; border-radius:5px; display:flex; align-items:center; justify-content:center; font-size:10.5px; color:#94a3b8;">暂无协作投入 (开始编辑正文或研讨后将自动呈现贡献占比)</div>`;
        } else {
          contribBarsContainer.innerHTML = membersList.map((m) => {
            const rawVal = (contribs[m.id] || contribs[m.studentCode] || 0);
            const pct = Math.round((rawVal / rawTotal) * 100);
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

  initGlobalPresenceHeartbeat() {
    // 🌿 实时轻量在线心跳：每 4 秒自动刷新当前在线时间戳，走专属 presence_ping 物理隔离
    const doPing = () => {
      const currentUser = this.authManager ? this.authManager.getCurrentUser() : null;
      if (currentUser && currentUser.role === 'student' && this.state.studentViewMode === 'workspace') {
        if (!this.state.presence) this.state.presence = {};
        const myKeys = [currentUser.id, currentUser.studentCode, currentUser.username, currentUser.name].filter(Boolean);
        const now = Date.now();

        myKeys.forEach(k => {
          this.state.presence[k] = { lastSeen: now, updatedAt: now };
        });
        this.renderPresenceCursors();
      }
    };
    doPing();
    setInterval(doPing, 10000);
  }

  initTimer() {
    this.initGlobalPresenceHeartbeat();
    setInterval(() => {
      // 🎧 静默期情绪安抚定时巡检（即便无人发言也按周期触发，见审查 #45）
      this.checkEmotionComfort();
      const currentUser = this.authManager.getCurrentUser();
      if (currentUser && currentUser.role === 'student' && this.state.timer.isRunning) {
        const nowMs = Date.now();
        // 统一物理时间戳计秒：全组成员按首次开启时间统一对齐，杜绝迟到成员或刷新页面导致的时间差
        if (!this.state.timer.startTimestamp) {
          this.state.timer.startTimestamp = nowMs;
        }
        const speed = this.state.timer.speed || 1;
        const physicalElapsedSec = Math.floor((nowMs - this.state.timer.startTimestamp) / 1000);
        this.state.timer.elapsedSeconds = Math.max(0, Math.floor(physicalElapsedSec * speed));

        const min = this.state.timer.elapsedSeconds / 60;
        const currentStage = this.state.currentStage || 'stage1';
        const logs = (this.state.chatLogs && this.state.chatLogs[currentStage]) || [];

        // ⏰ 全局进度与阶段间转场催促 + 阶段二智能体保底机制 (由在场学号最小的在线成员单点触发，杜绝多人并发 AI 消息风暴)
        const myCode = this.state.currentUser || (currentUser ? (currentUser.studentCode || currentUser.id) : 'A');
        const activeTaskId = this.state.activeTaskId || 'task_default';
        const currentGroupId = (currentUser && currentUser.groupId) ? currentUser.groupId : (this.state.activeMonitorGroupId || 'group_1');
        const allTasks = (this.authManager) ? this.authManager.getTasks() : [];
        const curTask = allTasks.find(t => t.id === activeTaskId);
        const totalDurationMin = (curTask && curTask.durationMinutes) ? Number(curTask.durationMinutes) : 150;
        const totalDurationSec = totalDurationMin * 60;
        const totalProgress = (totalDurationSec > 0) ? (this.state.timer.elapsedSeconds / totalDurationSec) : 0;

        const membersList = Object.values(this.state.members || {});
        const presenceMap = this.state.presence || {};
        const onlineMembers = membersList.filter(m => {
          const p = presenceMap[m.studentCode] || presenceMap[m.id];
          return p && (nowMs - (p.updatedAt || 0) < 180000);
        });
        const primaryMember = (onlineMembers.length > 0)
          ? [...onlineMembers].sort((a, b) => (a.studentCode || a.id || '').localeCompare(b.studentCode || b.id || ''))[0]
          : (membersList.length > 0 ? [...membersList].sort((a, b) => (a.studentCode || a.id || '').localeCompare(b.studentCode || b.id || ''))[0] : null);
        const isPrimaryGuardian = primaryMember && (primaryMember.studentCode === myCode || primaryMember.id === myCode);

        if (isPrimaryGuardian) {
          // 1. 【阶段一 ➔ 阶段二转场提示】(大中小任务自适应 + 防教师延时二次触发) - 归属【拍卖师 (Auctioneer)】
          if (!this.state.gate20TriggeredMap) this.state.gate20TriggeredMap = {};
          const isContractConfirmed = !!(this.state.stage1 && this.state.stage1.contract && this.state.stage1.contract.isConfirmed);
          const s1GateMsgId = `msg_gate_s1_${activeTaskId}_${currentGroupId}_transfer`;
          const allChatLogsListS1 = Object.values(this.state.chatLogs || {}).flat();
          const s1AlreadySent = !!this.state.gate20TriggeredMap[activeTaskId] ||
            allChatLogsListS1.some(m => m && (m.id === s1GateMsgId || (m.text && (m.text.includes('选题研讨的时间') || m.text.includes('签署确认')))));

          const elapsedMinS1 = (this.state.timer ? (this.state.timer.elapsedSeconds || 0) : 0) / 60;
          let isS1Due = false;
          if (totalDurationMin < 100) {
            // 小任务(<100m)：耗时达到 10 分钟触发，严格控制选题时间，提醒签署公约进入阶段二
            isS1Due = (elapsedMinS1 >= 10.0);
          } else if (totalDurationMin <= 240) {
            // 中任务(100~240m)：进度达到 20% 节点触发
            isS1Due = (totalProgress >= 0.20);
          } else {
            // 大任务(>240m)：进度达到 20%(上限耗时 35 分钟)触发
            isS1Due = (totalProgress >= 0.20) || (elapsedMinS1 >= 35.0);
          }

          if (isS1Due && currentStage === 'stage1' && !isContractConfirmed && !s1AlreadySent) {
            this.state.gate20TriggeredMap[activeTaskId] = true;
            const msgStage1 = {
              id: s1GateMsgId,
              sender: 'auctioneer',
              text: `🎪 【拍卖师·进度提示】：选题研讨的时间已经走过约 ${Math.ceil(elapsedMinS1)} 分钟啦，大家的想法也越来越清晰了～\n👉 如果研究方向已经基本确定，可以在公约卡片点击【签署确认】，随时进入【阶段二：学术编辑部】开始动笔；如果还有想补充的点子，也欢迎在后续撰写中继续深化！`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              _timeMs: nowMs
            };
            if (!this.state.chatLogs.stage1) this.state.chatLogs.stage1 = [];
            this.state.chatLogs.stage1.push(msgStage1);
            this.syncChatLogs();
            renderChat(this.state);
          }

        // 2. 【阶段二智能体保底机制】(S2 经历 60% 正常轨 + 全局 75% 极端保底轨)
        if (currentStage === 'stage2') {
          const s2MeetingMsgId = `msg_s2_meeting_${activeTaskId}_${currentGroupId}`;
          const isMeetingDone = !!(this.state.stage2 && this.state.stage2.actionPlan && this.state.stage2.actionPlan.isGenerated) ||
                                (this.state.chatLogs.stage2 || []).some(m => m.id === s2MeetingMsgId || (m.text && m.text.includes('半程会议号召')));

          if (!isMeetingDone) {
            const s2StartTime = (this.state.stage2 && this.state.stage2.stageStartTime) ? this.state.stage2.stageStartTime : null;
            const s2ElapsedMin = s2StartTime ? Math.max(0, (nowMs - s2StartTime) / 60000) : Math.max(0, min - (totalDurationMin * 0.10));
            const s2TargetMin = totalDurationMin * 0.70;

            const isNormalDue = (s2TargetMin > 0) && (s2ElapsedMin >= (s2TargetMin * 0.60));
            const isEmergencyDue = (totalProgress >= 0.75);

            if (isNormalDue || isEmergencyDue) {
              this.state.stage2MeetingTimeTriggered = true;
              const meetingCallMsg = {
                id: s2MeetingMsgId,
                sender: 'managingEditor',
                text: `🤝 【责任编辑·半程会议号召】：阶段二协作时间已达到 60%（正文骨架已搭建）！请全体小组成员点击上方【📢 发起编辑会议】完成 4 维自查打卡，稍后审稿编辑将结合全组情况进行深度学术质检与清单生成！`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                _timeMs: nowMs
              };
              if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
              this.state.chatLogs.stage2.push(meetingCallMsg);
              this.syncChatLogs();
              renderChat(this.state);
            }
          }
        }

        // 3. 【最晚转场指令节点】阶段二 ➔ 阶段三防卡关 (大中小任务自适应 + 纯提示非强制锁死 + 防教师延时二次触发)
        if (!this.state.gate90TriggeredMap) this.state.gate90TriggeredMap = {};
        const gate90MsgId = `msg_gate_transfer_${activeTaskId}_${currentGroupId}`;
        const allChatLogsList = Object.values(this.state.chatLogs || {}).flat();
        const gate90AlreadySent = !!this.state.gate90TriggeredMap[activeTaskId] ||
          allChatLogsList.some(m => m && (m.id === gate90MsgId || (m.text && (m.text.includes('转场指令') || m.text.includes('正文起草时间已达上限') || m.text.includes('紧急通牒')))));

        // 自适应触发条件：小任务(<100m)在最后10分钟(剩余<=10m)提示转入答辩；中任务(100~240m)在进度>=90%或剩余<=15m触发；大任务(>240m)在进度>=90%触发
        const elapsedSec = this.state.timer ? (this.state.timer.elapsedSeconds || 0) : 0;
        const remainingMin = Math.max(0, (totalDurationSec - elapsedSec) / 60);
        let isTransferDue = false;
        if (totalDurationMin < 100) {
          isTransferDue = (remainingMin <= 10.0);
        } else if (totalDurationMin <= 240) {
          isTransferDue = (totalProgress >= 0.90) || (remainingMin <= 15.0);
        } else {
          isTransferDue = (totalProgress >= 0.90) || (remainingMin <= 25.0);
        }

        if (isTransferDue && !gate90AlreadySent && currentStage !== 'stage3') {
          this.state.gate90TriggeredMap[activeTaskId] = true;
          let sender90 = null;
          let text90 = '';
          if (currentStage === 'stage1') {
            sender90 = 'auctioneer';
            text90 = `🎪 【拍卖师·紧急通牒】：全场剩余时间仅剩约 ${Math.ceil(remainingMin)} 分钟！本组选题严重滞后，请全员立刻在公约卡片点击【签署确认】，随时进入正文起草！`;
          } else if (currentStage === 'stage2') {
            sender90 = 'managingEditor';
            text90 = `🤝 【责任编辑·转场提示】：正文起草时间已达建议上限（最后 10 分钟已到）！建议小组成员点击上方导航栏进入【🎓 阶段三：答辩擂台】，留足时间完成答辩质询与终稿完善！`;
          }
          if (sender90) {
            const msg90 = {
              id: gate90MsgId,
              sender: sender90,
              text: text90,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              _timeMs: nowMs
            };
            if (!this.state.chatLogs[currentStage]) this.state.chatLogs[currentStage] = [];
            this.state.chatLogs[currentStage].push(msg90);
            this.syncChatLogs();
            renderChat(this.state);
          }
        }

        // 3.5. 【阶段三：答辩收尾 ➔ 提醒进入终稿润色节点】(大中小任务自适应 + 防教师延时二次触发) - 归属【中间委员 (Neutral)】
        if (!this.state.gateFinalPolishTriggeredMap) this.state.gateFinalPolishTriggeredMap = {};
        const gatePolishMsgId = `msg_gate_final_polish_${activeTaskId}_${currentGroupId}`;
        const gatePolishAlreadySent = !!this.state.gateFinalPolishTriggeredMap[activeTaskId] ||
          allChatLogsList.some(m => m && (m.id === gatePolishMsgId || (m.text && (m.text.includes('终稿润色与收尾提示') || m.text.includes('终稿润色与前后校对')))));

        // 自适应触发条件：小任务(<100m)在最后5分钟(剩余<=5.0m)触发；中大任务(>=100m)在进度>=95%触发
        let isPolishDue = false;
        if (totalDurationMin < 100) {
          isPolishDue = (remainingMin <= 5.0);
        } else {
          isPolishDue = (totalProgress >= 0.95);
        }

        if (isPolishDue && currentStage === 'stage3' && !this.state.isFinalSubmitted && !gatePolishAlreadySent) {
          this.state.gateFinalPolishTriggeredMap[activeTaskId] = true;
          const msgPolish = {
            id: gatePolishMsgId,
            sender: 'neutral',
            text: `🟡 【中间委员·终稿修改提示】：答辩研讨时间已过半（全场剩余约 ${Math.ceil(remainingMin)} 分钟）！\n👉 请小组成员抓紧收尾答辩，把答辩中的修改结论落实到大正文终稿中，做好最后的通读核对与润色！`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            _timeMs: nowMs
          };
          if (!this.state.chatLogs.stage3) this.state.chatLogs.stage3 = [];
          this.state.chatLogs.stage3.push(msgPolish);
          this.syncChatLogs();
          renderChat(this.state);
        }

        // 4. 【最晚终稿提交防漏交节点】阶段三 ➔ 终稿提交防漏交 (大中小任务自适应 + 防教师延时二次触发) - 统一归属【中间委员 (Neutral)】
        if (!this.state.gate95TriggeredMap) this.state.gate95TriggeredMap = {};
        const gate95MsgId = `msg_gate_final_submit_${activeTaskId}_${currentGroupId}`;
        const gate95AlreadySent = !!this.state.gate95TriggeredMap[activeTaskId] ||
          allChatLogsList.some(m => m && (m.id === gate95MsgId || (m.text && (m.text.includes('终稿警报') || m.text.includes('最后提交') || m.text.includes('距离全盘任务锁定')))));

        // 自适应触发条件：小任务(<100m)在最后 2.5 分钟(剩余<=2.5m)触发；中大任务(>=100m)在最后 3 分钟(剩余<=3.0m)触发
        let isFinalSubmitDue = false;
        if (totalDurationMin < 100) {
          isFinalSubmitDue = (remainingMin <= 2.5);
        } else {
          isFinalSubmitDue = (remainingMin <= 3.0);
        }

        if (isFinalSubmitDue && !this.state.isFinalSubmitted && !gate95AlreadySent) {
          this.state.gate95TriggeredMap[activeTaskId] = true;
          const msg95 = {
            id: gate95MsgId,
            sender: 'neutral',
            text: `🟡 【中间委员·终稿警报】：距离全盘任务锁定仅剩最后约 ${Math.ceil(remainingMin)} 分钟！请组内确认答辩修改无误，立即点击左侧【🚀 提交论文终稿】完成归档！`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            _timeMs: nowMs
          };
          if (!this.state.chatLogs[currentStage]) this.state.chatLogs[currentStage] = [];
          this.state.chatLogs[currentStage].push(msg95);
          this.syncChatLogs();
          renderChat(this.state);
        }
        }

        if (this.state.studentViewMode === 'workspace') {
          // ⚡ 快照已每 2 秒天然同步通知与文献，此处仅保留 20 秒轻量静默兜底
          if (!this._studentWorkspacePollTick) this._studentWorkspacePollTick = 0;
          this._studentWorkspacePollTick++;
          if (this._studentWorkspacePollTick % 20 === 0) {
            if (this.authManager && this.authManager.pullGlobalMeta) {
              this.authManager.pullGlobalMeta().then(() => {
                // 1. 若当前屏幕正打开的通知已被教师在后台删除，立即自动关闭该弹窗
                const openAnnModal = document.querySelector('.modal-announcement-popup');
                if (openAnnModal) {
                  const openAnnId = openAnnModal.dataset.annId;
                  const allCurrentAnns = this.authManager.getAnnouncements();
                  if (openAnnId && !allCurrentAnns.some(a => a.id === openAnnId)) {
                    openAnnModal.remove();
                  }
                }

                // 2. 检查是否有属于当前任务/班级/小组的新发布未读通知
                if (!document.querySelector('.modal-overlay')) {
                  this.checkUnreadAnnouncements();
                }
              }).catch(() => {});
            }
          }

          renderHeader(
            this.state, currentUser, this.authManager.getAnnouncements(),
            (s) => this.switchStage(s), (sp) => this.setSpeed(sp),
            () => this.handleLogout(), () => this.switchToTeacherView(),
            () => this.showAnnouncementModal(), () => this.showQuestionnaireModal(),
            () => this.backToTaskList()
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
      renderLoginView(appEl, this.authManager, async () => {
        const u = this.authManager.getCurrentUser();
        const gId = u && u.groupId ? u.groupId : 'group_1';
        this.loadGroupState(gId);
        try {
          await this.authManager.pullGlobalMeta();
        } catch (e) {}
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
          const studentA = users.find(u => (u.role === 'student' || u.isStudent) && u.studentCode);
          if (studentA) {
            sessionStorage.setItem('jizhi_current_user', JSON.stringify(studentA));
            localStorage.setItem('jizhi_current_user', JSON.stringify(studentA));
            this.renderMain();
          }
        }
      );
    } else {
      const effectiveClassId = this.state.activeStudentClassId || currentUser?.classId || 'class_101';
      const activeGroupObj = this.authManager.getStudentActiveGroup(currentUser, effectiveClassId);
      const currentGroupId = activeGroupObj.id || (currentUser && currentUser.groupId ? currentUser.groupId : 'group_1');

      if (this.state.studentViewMode === 'task_list') {
        appEl.className = 'app-student-portal-mode';
        renderStudentTaskPortal(
          appEl, this.authManager, this.state,
          (taskId) => {
            const actualTaskId = taskId || 'task_default';
            this.state.activeTaskId = actualTaskId;
            const targetTaskObj = (this.authManager ? this.authManager.getTasks() : []).find(t => t.id === actualTaskId);
            const taskClassId = (targetTaskObj && targetTaskObj.classId) ? targetTaskObj.classId : (this.state.activeStudentClassId || currentUser?.classId || 'class_101');
            this.state.activeStudentClassId = taskClassId;

            try {
              sessionStorage.setItem('jizhi_active_task_id', actualTaskId);
              localStorage.setItem('jizhi_active_task_id', actualTaskId);
              sessionStorage.setItem('jizhi_active_student_class_id', taskClassId);
              localStorage.setItem('jizhi_active_student_class_id', taskClassId);
            } catch (e) {}
            this.state.studentViewMode = 'workspace';
            sessionStorage.setItem('jizhi_student_view_mode', 'workspace');
            localStorage.setItem('jizhi_student_view_mode', 'workspace');

            const latestGroupObj = this.authManager.getStudentActiveGroup(currentUser, taskClassId);
            const targetGroupId = latestGroupObj.id || (currentUser && currentUser.groupId ? currentUser.groupId : 'group_1');
            this.loadGroupState(targetGroupId);

            // 🎯 保持本组推进到的真实阶段，确保历史消息与当前工作台阶段 100% 对应
            const effectiveStage = this.state.groupMaxStage || this.state.currentStage || 'stage1';
            this.state.currentStage = effectiveStage;
            this.isViewingPastStage = false;

            if (!this.state.presence) this.state.presence = {};
            const myKeys = [currentUser?.id, currentUser?.studentCode, currentUser?.username, currentUser?.name].filter(Boolean);
            const now = Date.now();
            myKeys.forEach(k => {
              this.state.presence[k] = { nodeIndex: 0, activeSection: '在线协作', updatedAt: now };
            });

            if (this.cloudSyncEngine) {
              this.cloudSyncEngine.isLoggingOut = false;
              this.cloudSyncEngine.initPolling();
            }

            // ⚡ 0 毫秒秒切进入工作台！
            this.renderMain();
            this.checkUnreadAnnouncements();

            // 🟢 后台异步静默拉取云端权威数据，绝不阻塞用户界面跳转
            setTimeout(async () => {
              if (this.authManager && this.authManager.pullGlobalMeta) {
                try { await this.authManager.pullGlobalMeta(); } catch (e) {}
              }
              if (this.cloudSyncEngine) {
                this.cloudSyncEngine.groupId = targetGroupId;
                this.cloudSyncEngine.taskId = actualTaskId;
                this.cloudSyncEngine.updateScopeKeys();
                await this.cloudSyncEngine.pullFromServer();
                if (typeof window.renderChat === 'function') window.renderChat(this.state);
              }
            }, 50);
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
            <div class="chat-header" style="display:flex; flex-direction:column; gap:6px; padding:10px 12px; border-bottom:1px solid #e2e8f0; background:#ffffff; box-sizing:border-box; width:100%; flex-shrink:0;">
              <div style="display:flex; justify-content:space-between; align-items:center; width:100%; flex-wrap:wrap; gap:6px;">
                <div class="chat-title" style="font-size:14px; font-weight:800; color:#0f172a; display:flex; align-items:center; gap:6px;"><span>💬 协同对话研讨</span></div>
                <div class="active-agent-pills" style="display:flex; gap:6px; align-items:center;">
                  <span class="agent-pill" style="font-size:11px; padding:2px 8px; border-radius:12px; font-weight:700; white-space:nowrap;">🎪 拍卖师</span>
                  <span class="agent-pill" style="font-size:11px; padding:2px 8px; border-radius:12px; font-weight:700; white-space:nowrap;">🤝 责任编辑</span>
                  <span class="agent-pill" style="font-size:11px; padding:2px 8px; border-radius:12px; font-weight:700; white-space:nowrap;">📝 审稿编辑</span>
                </div>
              </div>
              <div class="chat-presence-bar" id="chat-presence-bar" style="padding:4px 8px; background:#f8fafc; border-radius:6px; border:1px solid #e2e8f0; display:flex; align-items:center; gap:6px; width:100%; box-sizing:border-box; overflow-x:auto; white-space:nowrap;">
                <span style="font-size:11px; font-weight:800; color:#475569; flex-shrink:0;">👥 在线:</span>
                <div id="chat-member-presence-pills" style="display:flex; align-items:center; gap:4px; flex-shrink:0;"></div>
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
              <input type="text" class="chat-input modern-spacious-input" id="chat-input" placeholder="输入 @ 提及同学或智能体，或输入学术讨论..." autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
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

  // 🌐 通用智能体静默/情绪提示发射器：真 AI 生成，超时/失败自动降级为写死兜底文案
  async queueAgentNudge(botKey, prompt, fallbackText, stage) {
    let text = null;
    try { text = await callCozeAgentAPI(botKey, prompt, { stage }); } catch (e) {}
    const finalText = (text && text.trim().length > 0) ? text.trim() : fallbackText;
    const msg = {
      sender: botKey,
      text: finalText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      _timeMs: Date.now()
    };
    if (!this.state.chatLogs[stage]) this.state.chatLogs[stage] = [];
    this.state.chatLogs[stage].push(msg);
    this.syncChatLogs();
    if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
    renderChat(this.state);
  }

  initCrossStageInactivityChecker() {
    if (this.stageInactivityTimer) clearInterval(this.stageInactivityTimer);
    this.stageInactivityTimer = setInterval(() => {
      // ⚡ 单点守护主节点动态选举：优先由组长担当；若组长缺勤/掉线，自动由当前在场学号最小的在线成员接管，杜绝单点失效与并发重复！
      const currUserObj = this.authManager.getCurrentUser();
      const myCode = this.state.currentUser || (currUserObj ? (currUserObj.studentCode || currUserObj.id) : 'A');
      const now = Date.now();
      const membersList = Object.values(this.state.members || {});
      const presenceMap = this.state.presence || {};
      
      const onlineMembers = membersList.filter(m => {
        const p = presenceMap[m.studentCode] || presenceMap[m.id];
        return p && (now - (p.updatedAt || 0) < 180000); // 放宽到 3 分钟：后台标签页心跳会被浏览器节流（约 1 分钟 1 次），60 秒窗口会误判在场同学为离线
      });

      let primaryMember = (onlineMembers.length > 0)
        ? [...onlineMembers].sort((a, b) => (a.studentCode || a.id || '').localeCompare(b.studentCode || b.id || ''))[0]
        : (membersList.length > 0 ? [...membersList].sort((a, b) => (a.studentCode || a.id || '').localeCompare(b.studentCode || b.id || ''))[0] : null);

      const isPrimaryGuardian = primaryMember && (primaryMember.studentCode === myCode || primaryMember.id === myCode);
      if (!isPrimaryGuardian) return;

      const stage = this.state.currentStage;
      const totalMembersCount = membersList.length;
      const activeMembersCount = onlineMembers.length;
      if (activeMembersCount < 1) return; // 至少 1 人在线即可触发智能体巡检守护与提示

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

            // 情绪托底转真 AI：基于学生真实情绪原话 + 当前阶段生成个性化安抚与破局建议（写死文案降级为超时兜底）
            const negativeRaw = (lastNegativeChat.text || '').trim();
            const comfortPrompt = `有同学在协作中流露出了挫败/疲惫情绪，原话为：「${negativeRaw}」。请以${stage === 'stage1' ? '学术拍卖师' : stage === 'stage2' ? '责任编辑' : '中间委员'}的身份，先用 2~3 句真诚安抚这份情绪（共情但不肉麻、不说教），再结合当前写作阶段给出 1 个具体、可立即照做的小建议，帮助全组重新找回节奏。80~120 字，语气温暖自然。`;
            this.queueAgentNudge(agentSender, comfortPrompt, comfortText, stage);
            return;
          } else {
            // 同伴已成功出面调节，AI 默默记录并全程保持静默
            this.lastEmotionHandledId = lastNegativeChat._timeMs;
          }
        }
      }

      // 🌐 全局静默防轰炸：取最近一次任意静默提示时间，5 分钟内不再追加（冷场只做一次精准破冰，避免连环打扰）
      const _lastSilenceMs = Math.max(
        0,
        this.lastDiscussionNudgeTime || 0,
        this.lastZeroProposalNudgeTime || 0,
        this.lastPartialProposalNudgeTime || 0,
        this.lastVoteNudgeTime || 0,
        this.lastS2SilenceNudgeTime || 0,
        this.lastS2ContribNudgeTime || 0,
        this.lastS2MeetingNudgeTime || 0,
        this.lastS2PostMeetingSilenceNudgeTime || 0,
        this.lastS3SilenceNudgeTime || 0
      );
      if (_lastSilenceMs && (now - _lastSilenceMs < 300000)) return;

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

        // 动态三档自适应冷场阈值 (小任务<1h/60m: 2分钟; 中任务1~3h/60~180m: 3分钟; 大任务>3h/180m: 4.5分钟)
        const allTasks = (this.authManager) ? this.authManager.getTasks() : [];
        const curTask = allTasks.find(t => t.id === this.state.activeTaskId);
        const taskDurMin = (curTask && curTask.durationMinutes) ? Number(curTask.durationMinutes) : 60;
        const silenceThresholdMs = taskDurMin < 60 ? 120000 : (taskDurMin <= 180 ? 180000 : 270000);

        // 1. 【提案阶段研讨静默守护】：只有当【讨论区无人发言 > 阈值】且【左侧也无人在操作/撰写提案 > 阈值】时，才判定为真正冷场并提示！
        if (submittedCount < totalMembersCount && silenceDurationMs > silenceThresholdMs && timeSinceLastLeftAction > silenceThresholdMs) {
          if (!this.lastDiscussionNudgeTime || now - this.lastDiscussionNudgeTime > (silenceThresholdMs + 60000)) {
            this.lastDiscussionNudgeTime = now;
            const msg = {
              sender: 'auctioneer',
              text: `💡 【拍卖师·研讨互动提示】：关注到大家正在构思选题！可以在讨论区交流灵感与研究想法，构思成熟后点击左侧【提交我的选题】卡片进行提交～`,
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

        // 动态读取任务时长判定大中小任务 (小任务<1h/60m: 冷却3.5m, 静默2m; 中任务1~3h/60~180m: 冷却6m, 静默3m; 大任务>3h/180m: 冷却10m, 静默4.5m)
        const allTasks = (this.authManager) ? this.authManager.getTasks() : [];
        const curTask = allTasks.find(t => t.id === this.state.activeTaskId);
        const taskDurMin = (curTask && curTask.durationMinutes) ? Number(curTask.durationMinutes) : 60;
        const s2NudgeCooldownMs = taskDurMin < 60 ? 210000 : (taskDurMin <= 180 ? 360000 : 600000);
        const s2SilenceThresholdMs = taskDurMin < 60 ? 120000 : (taskDurMin <= 180 ? 180000 : 270000);

        // 1. 阶段二开场静默提示 (纯系统模板)：开场达到阈值完全静默且正文字数 < 50 字
        if (silenceDurationMs > s2SilenceThresholdMs && plainTextLen < 50) {
          if (!this.lastS2SilenceNudgeTime || now - this.lastS2SilenceNudgeTime > (s2SilenceThresholdMs + 60000)) {
            this.lastS2SilenceNudgeTime = now;
            const msg = {
              sender: 'managingEditor',
              text: `🤝 【责任编辑·起草提示】：大家已进入阶段二正文协作！\n👉 请组员按照阶段一公约分工开始撰写各自负责的内容；撰写同时多阅读同伴段落，在研讨区互相交流衔接，协同推进！`,
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

        // 2. 责任编辑过程守护：周期性读取【实际贡献百分比】与【研讨发言投入】
        const minContribThreshold = taskDurMin < 60 ? 150 : (taskDurMin <= 180 ? 300 : 600);
        if (!this.lastS2ContribNudgeTime || now - this.lastS2ContribNudgeTime > s2NudgeCooldownMs) {
          // 1. 计算总投入与每位成员的实际贡献百分比（100% 依据 Etherpad 真实写作字数贡献）
          let totalContrib = 0;
          membersList.forEach(m => {
            totalContrib += (contribs[m.id] || contribs[m.studentCode] || 0);
          });

          // 2. 找出“写作贡献百分比显著滞后（<= 15%）”的同学
          const severeInactiveMembers = [];
          if (totalContrib >= minContribThreshold) {
            membersList.forEach(m => {
              const memContrib = (contribs[m.id] || contribs[m.studentCode] || 0);
              const pct = totalContrib > 0 ? Math.round((memContrib / totalContrib) * 100) : 33;

              if (pct <= 15) {
                severeInactiveMembers.push(m.name);
              }
            });
          }

          if (severeInactiveMembers.length > 0) {
            this.lastS2ContribNudgeTime = now;
            const targetName = severeInactiveMembers[0];
            const tasks = (this.state.stage1 && this.state.stage1.contract && this.state.stage1.contract.taskAssignments) ? this.state.stage1.contract.taskAssignments : {};
            let targetChapter = '负责的章节';
            membersList.forEach(m => {
              if (m.name === targetName) {
                targetChapter = tasks[m.id] || tasks[m.studentCode] || tasks[m.name] || '负责的章节';
              }
            });

            const msg = {
              sender: 'managingEditor',
              text: `🤝 【责任编辑·进度关怀】：大家都在按节奏推进，看到组员们已经起草了部分板块！负责【${targetChapter}】的 ${targetName} 同学也可以逐步动笔啦。建议可以先从该章节的核心切入点着手拟写，遇到难点随时在研讨区抛出来，全组一起协同保持良好节奏！`,
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

        // 3. 🎯 半程自查与互阅倡议（推进至【不足/反思】或阶段二时间已达 60%）
        const times = (this.state.stage1 && this.state.stage1.contract && this.state.stage1.contract.timeAllocations) ? this.state.stage1.contract.timeAllocations : {};
        const totalPlannedMin = (times.background || 25) + (times.literature || 30) + (times.questions || 25) + (times.method || 40) + (times.reflection || 20) + (times.references || 10);
        const totalPlannedMs = totalPlannedMin * 60 * 1000;
        const isTimeOver60Pct = stage2DurationMs >= (totalPlannedMs * 0.6);
        const hasReachedReflection = /(?:五、|第5章|第五部分|不足与反思|研究反思|反思与不足|总结与反思|研究局限)/i.test(s2.unifiedContent || '');

        if ((hasReachedReflection || isTimeOver60Pct) && !s2.actionPlan && !this.state.stage2MeetingPrompted) {
          if (!this.lastS2MeetingNudgeTime || now - this.lastS2MeetingNudgeTime > 300000) {
            this.lastS2MeetingNudgeTime = now;
            this.state.stage2MeetingPrompted = true;
            const msg = {
              sender: 'managingEditor',
              text: `📢 【责任编辑·半程自查与互阅倡议】：关注到阶段二写作已推进过半！💡 请全组同学先暂停各自起草，花 1~2 分钟通读一下目前全组已写出的所有段落（尤其是其他组员撰写的部分）！仔细感知对比一下：目前大家写的内容，是否与我们最初商定的主题方向保持一致？各部分衔接是否存在偏差？通读感知完毕后，请点击左上角【📢 发起编辑会议】完成半程自查打卡！`,
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

        // ── 阶段二双研讨闭环守护 ──
        // 0) 半程自查分歧发出后（第 1 次讨论）：若全组达成赞同共识且静默期满（35秒），责任编辑出面小结并交棒
        const pendingRev = this.state.stage2?.pendingReviewing || this.state.stage2PendingReviewing;
        if (pendingRev && pendingRev.hasAgreement && !this._isExecutingConsensusHandover) {
          const timeSinceAgreement = now - (pendingRev.lastAgreementTime || 0);
          if (timeSinceAgreement >= 35000) { // 赞同后 35 秒无后续争执，判定研讨圆满收敛
            this._isExecutingConsensusHandover = true;
            setTimeout(async () => {
              try {
                const s2Chats = (this.state.chatLogs.stage2 || []).filter(m => m.sender && !AgentProfiles[m.sender] && m.sender !== 'system');
                const recentChats = s2Chats.slice(-8).map(m => `${m.senderName || m.sender}: ${m.text}`).join('\n');

                const evalPrompt = `小组成员已在讨论区就修改方向达成一致并表达了赞同。
【全组自查核心脱节焦点】: ${pendingRev.transFocus}，${pendingRev.styleFocus}
【小组最新研讨对话记录】:
${recentChats}

请通读以上小组成员的真实研讨发言，作为学术编辑部责任编辑发表一段 100~130 字的【一致性研讨小结与交棒】：简明肯定大家对齐的修改思路，并隆重引出审稿专家通读草稿下发 3 项修正清单！（纯自然语言，严禁输出代码块）`;

                let evalResult = await callCozeAgentAPI('managingEditor', evalPrompt, { stage: 'stage2', topic: pendingRev.topic });
                await this.triggerReviewingEditorAfterDiscussion(evalResult?.trim() || '');
              } catch (err) {
                console.warn('Consensus handover error:', err);
              } finally {
                this._isExecutingConsensusHandover = false;
              }
            }, 100);
          }
        }

        // ── 阶段二修改期静默守护：审稿编辑保持后台严肃倾听，绝不随意发无意义跟进打扰学生专注写作 ──
        // （仅在学生主动 @审稿编辑 时或到达三大官方质检里程碑时出面指导）

        // 4) 修改期后续周期性提醒 (每隔一个巡检周期做一次跟进提示)
        if (this.state.stage2ReviewingFinishedTime && this.state.stage2FirstPostReviewNudgeSent && silenceDurationMs >= s2NudgeCooldownMs) {
          if (!this.lastS2PostMeetingSilenceNudgeTime || now - this.lastS2PostMeetingSilenceNudgeTime >= s2NudgeCooldownMs) {
            this.lastS2PostMeetingSilenceNudgeTime = now;
            const msg = {
              sender: 'managingEditor',
              text: `💡 【责任编辑·协同修改推进跟进】：全组正文修改正在稳步推进！\n👉 建议大家继续在讨论区同步各章节的修改进度与段落衔接，保持全篇逻辑的一体化！`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              _timeMs: now,
              stage: 'stage2'
            };
            if (!this.state.chatLogs.stage2) {
              this.state.chatLogs.stage2 = [];
            }
            this.state.chatLogs.stage2.push(msg);
            this.syncChatLogs();
            if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
            renderChat(this.state);
            return;
          }
        }

        // ── 阶段二终审行文扫描已严格统归由 checkStage2Milestones() 权威单向状态机统一仲裁 ──
      }

      // ======================================================================
      // 🎓 阶段三：中间委员 (Neutral Committee Member) 裁决引导机制
      // ======================================================================
      else if (stage === 'stage3') {
        const s3 = this.state.stage3;
        if (!s3 || this.state.isFinalSubmitted) return;
        if (!this.stage3StartTime) this.stage3StartTime = now;

        // 🛡️ 答辩委员会尚未全部就绪或正在生成评审时，严禁静默定时器抢跑插话！
        if (this.state.stage3CommitteeLoading || this.state.stage3CommitteeEvaluating || !s3.feedbackItems || s3.feedbackItems.length === 0) {
          return;
        }

        const stage3DurationMs = now - this.stage3StartTime;
        const s3Chats = (this.state.chatLogs && this.state.chatLogs.stage3) ? this.state.chatLogs.stage3 : [];
        const lastStudentMsg = [...s3Chats].reverse().find(m => m.sender && !['neutral', 'proponent', 'opponent', 'system', 'managingEditor', 'reviewingEditor'].includes(m.sender));
        
        // 🛡️ 以中间委员下发答辩思路引导的时间为静默计时基准，预留充分的通读思考时间
        const lastChairGuide = [...s3Chats].reverse().find(m => m.sender === 'neutral' && m.text?.includes('答辩思路引导'));
        const baselineTime = lastStudentMsg ? (lastStudentMsg._timeMs || now) : (lastChairGuide ? (lastChairGuide._timeMs || now) : now);
        const silenceDurationMs = now - baselineTime;

        const feedbacks = Array.isArray(s3.feedbackItems) ? s3.feedbackItems : [];
        const pendingFeedbacks = feedbacks.filter(f => !f.response || f.response.trim().length === 0);

        // 1. 阶段三开场引导下发后，若全组静默超过 3.5 分钟且仍有未完成质询：才温和提示展开答辩
        if (silenceDurationMs > 210000 && pendingFeedbacks.length > 0) {
          if (!this.lastS3SilenceNudgeTime || now - this.lastS3SilenceNudgeTime > 240000) {
            this.lastS3SilenceNudgeTime = now;
            const s3SilenceFallback = `🟡 【中间委员·答辩研讨提示】：请大家回顾左侧矩阵中的正反方质询点展开辩护讨论；商定好共识后，由一位组员代表录入裁决矩阵，其余成员同步在正文中落实修改！`;
            this.queueAgentNudge('neutral', `正反两方评审意见已送达，但讨论区已静默一段时间。请以中间委员身份，引导大家先回看你此前在聊天框给出的引导建议，再就反方质询点展开辩护讨论，并给 1 条具体建议。80~120 字。`, s3SilenceFallback, 'stage3');
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

  async checkUnreadAnnouncements() {
    if (this.authManager && this.authManager.pullGlobalMeta) {
      try { await this.authManager.pullGlobalMeta(); } catch (e) {}
    }
    // 🛡️ 任务大厅模式下绝不弹窗打扰学生，仅在进入具体任务工作台后针对该任务精准匹配
    if (this.state.studentViewMode !== 'workspace') return;

    const currentUser = this.authManager.getCurrentUser();
    if (!currentUser || currentUser.isTeacher || currentUser.role === 'teacher') return;
    const activeTaskId = this.state.activeTaskId;
    if (!activeTaskId) return;

    const effectiveClassId = this.state.activeStudentClassId || currentUser?.classId || 'class_101';
    const classes = this.authManager.getClasses();
    const currentClassObj = classes.find(c => c.id === effectiveClassId);
    const effectiveClassName = currentClassObj ? currentClassObj.name : '';
    const activeGroupObj = this.authManager.getStudentActiveGroup(currentUser, effectiveClassId);
    const groupId = activeGroupObj.id || (currentUser && currentUser.groupId ? currentUser.groupId : 'group_1');
    const allTasks = this.authManager.getTasks();

    const isAnnRead = (a) => {
      if (!a) return false;
      if (currentUser) {
        if (currentUser.id && a.readStatus && a.readStatus[currentUser.id]) return true;
        if (currentUser.studentCode && a.readStatus && a.readStatus[currentUser.studentCode]) return true;
        if (currentUser.username && a.readStatus && a.readStatus[currentUser.username]) return true;
        if (currentUser.name && a.readStatus && a.readStatus[currentUser.name]) return true;
        if (Array.isArray(a.confirmedMembers)) {
          if (a.confirmedMembers.some(m => m && (m.id === currentUser.id || m.studentCode === currentUser.studentCode || (currentUser.name && m.name === currentUser.name)))) return true;
        }
      }
      return false;
    };

    const allAnns = this.authManager.getAnnouncements();

    // 过滤出严格属于【当前任务 + 当前班级 + 当前小组】且未读的通知
    const unreadList = allAnns
      .filter(a => {
        if (!a) return false;
        // 延期通知仅通过工作台顶部红点提示，不主动弹窗打扰
        if (a.isExtension || a.title?.includes('延期通知') || a.title?.includes('时间已延长')) return false;

        if (a.taskId && a.taskId !== 'task_all') {
          const tObj = allTasks.find(t => t.id === a.taskId);
          if (tObj && isTaskExpired(tObj)) return false;
        }
        const matchClass = (a.classId === effectiveClassId) || 
                           (effectiveClassName && a.className === effectiveClassName) ||
                           (Array.isArray(a.targetClassIds) && a.targetClassIds.includes(effectiveClassId));
        const matchGroup = !a.targetGroupId || a.targetGroupId === 'all' || a.targetGroupId === groupId ||
          (Array.isArray(a.targetGroupIds) && (a.targetGroupIds.includes('all') || a.targetGroupIds.includes(groupId)));
        const matchTask = a.taskId === 'task_all' || a.taskId === activeTaskId || (!a.taskId && activeTaskId === 'task_default');
        return matchClass && matchGroup && matchTask && !isAnnRead(a);
      })
      .sort((a, b) => (b.id > a.id ? 1 : -1));

    // 📢 教师发布的教学指示/课堂通知在工作台自动弹窗提示学生阅读并确认
    if (unreadList.length > 0) {
      this.showAnnouncementModal(unreadList[0], true);
    }
  }

  showAnnouncementModal(targetAnn = null, isSequentialFlow = false) {
    document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
    const currentUser = this.authManager.getCurrentUser();
    const effectiveClassId = this.state.activeStudentClassId || currentUser?.classId || 'class_101';
    const classes = this.authManager.getClasses();
    const currentClassObj = classes.find(c => c.id === effectiveClassId);
    const effectiveClassName = currentClassObj ? currentClassObj.name : '';
    const activeGroupObj = this.authManager.getStudentActiveGroup(currentUser, effectiveClassId);
    const groupId = activeGroupObj.id || (currentUser && currentUser.groupId ? currentUser.groupId : 'group_1');
    const isTaskListMode = (this.state && this.state.studentViewMode === 'task_list');
    const activeTaskId = this.state.activeTaskId || 'task_default';
    const allAnns = this.authManager.getAnnouncements();

    const isAnnRead = (a) => {
      if (!a) return false;
      if (currentUser) {
        if (currentUser.id && a.readStatus && a.readStatus[currentUser.id]) return true;
        if (currentUser.studentCode && a.readStatus && a.readStatus[currentUser.studentCode]) return true;
        if (currentUser.username && a.readStatus && a.readStatus[currentUser.username]) return true;
        if (currentUser.name && a.readStatus && a.readStatus[currentUser.name]) return true;
        if (Array.isArray(a.confirmedMembers)) {
          if (a.confirmedMembers.some(m => m && (m.id === currentUser.id || m.studentCode === currentUser.studentCode || (currentUser.name && m.name === currentUser.name)))) return true;
        }
      }
      return false;
    };

    const isExtensionNotice = (a) => !!(a && (a.isExtension || a.title?.includes('延期通知') || a.title?.includes('时间已延长') || a.title?.includes('延长至')));

    // 🎯 教学通知中心仅展示与统计纯正的【教学任务与作业通知】（延期由瞬时大弹窗处理，不堆积在通知中心）
    const myAnns = allAnns
      .filter(a => {
        if (!a) return false;
        if (isExtensionNotice(a)) return false; // 🚫 彻底屏蔽延期通知混入通知中心
        const matchClass = (a.classId === effectiveClassId) || 
                           (effectiveClassName && a.className === effectiveClassName) ||
                           (Array.isArray(a.targetClassIds) && a.targetClassIds.includes(effectiveClassId));
        const matchGroup = !a.targetGroupId || a.targetGroupId === 'all' || a.targetGroupId === groupId ||
          (Array.isArray(a.targetGroupIds) && (a.targetGroupIds.includes('all') || a.targetGroupIds.includes(groupId)));
        const matchTask = (a.taskId === 'task_all' || a.taskId === activeTaskId || (!a.taskId && activeTaskId === 'task_default'));
        return matchClass && matchGroup && matchTask;
      })
      .sort((a, b) => (b.id > a.id ? 1 : -1));

    if (myAnns.length === 0) {
      if (!isSequentialFlow) {
        alert('📢 暂无针对当前写作任务的教学通知！');
      }
      return;
    }

    // 选中的通知：仅在传入 targetAnn 时直接进入详情卡片，否则默认展示优雅清晰的竖排通知列表
    const unreadList = myAnns.filter(a => !isAnnRead(a));
    const showDetailDirectly = !!targetAnn;
    const selectedAnn = targetAnn || (unreadList.length > 0 ? unreadList[0] : myAnns[0]);

    const isSelectedRead = selectedAnn ? isAnnRead(selectedAnn) : true;
    const isSelectedExtension = selectedAnn ? isExtensionNotice(selectedAnn) : false;

    const allTasks = this.authManager.getTasks();
    const annTaskObj = selectedAnn ? allTasks.find(t => t.id === selectedAnn.taskId) : null;
    const isAnnTaskExpired = isTaskExpired(annTaskObj);

    const modal = document.createElement('div');
    modal.className = 'modal-overlay modal-announcement-popup';

    const renderListHtml = () => `
      <div style="width:680px; max-width:94vw; background:#ffffff; border-radius:16px; box-shadow:0 25px 50px -12px rgba(15,23,42,0.25); overflow:hidden; border:1px solid #e2e8f0; animation:modalFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);">
        <!-- 渐变高颜值头部 -->
        <div style="background:linear-gradient(135deg, #1d4ed8, #2563eb); padding:20px 24px; display:flex; justify-content:space-between; align-items:center; color:#ffffff;">
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="width:42px; height:42px; border-radius:12px; background:rgba(255,255,255,0.2); display:flex; align-items:center; justify-content:center; font-size:22px; flex-shrink:0;">
              ${isTaskListMode ? '⏳' : '📢'}
            </div>
            <div>
              <div style="display:flex; align-items:center; gap:8px;">
                <h3 style="margin:0; font-size:17.5px; font-weight:800; color:#ffffff; letter-spacing:0.3px;">${isTaskListMode ? '班级任务延期通知中心' : '班级教学通知中心'}</h3>
                ${unreadList.length > 0 ? `<span style="background:#ef4444; color:#ffffff; font-size:11px; font-weight:800; padding:2px 8px; border-radius:12px; box-shadow:0 2px 6px rgba(239,68,68,0.4);">${unreadList.length} 条未读</span>` : '<span style="background:rgba(255,255,255,0.2); color:#ffffff; font-size:11px; font-weight:700; padding:2px 8px; border-radius:12px;">全部已读</span>'}
              </div>
              <div style="font-size:12px; color:#e0e7ff; margin-top:3px;">${effectiveClassName ? `🏫 归属班级: ${escapeHtml(effectiveClassName)}` : '任课教师发布的教学指示与任务延期'} · 共 ${myAnns.length} 条通知</div>
            </div>
          </div>
          <button id="btn-close-ann-popup" style="background:rgba(255,255,255,0.15); border:1px solid rgba(255,255,255,0.3); width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:#ffffff; font-size:14px; transition:all 0.15s ease;">✕</button>
        </div>

        <!-- 竖排通知卡片列表 -->
        <div style="padding:20px 24px; max-height:62vh; overflow-y:auto; display:flex; flex-direction:column; gap:12px; background:#f8fafc;">
          ${myAnns.map((a, idx) => {
            const read = isAnnRead(a);
            const ext = isExtensionNotice(a);
            return `
              <div class="btn-open-ann-item" data-id="${a.id}" style="background:#ffffff; border:1.5px solid ${read ? '#e2e8f0' : '#bfdbfe'}; border-radius:12px; padding:15px 18px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; gap:14px; transition:all 0.15s ease; box-shadow:${read ? '0 1px 3px rgba(15,23,42,0.02)' : '0 4px 12px rgba(37,99,235,0.08)'};">
                <div style="display:flex; align-items:flex-start; gap:12px; min-width:0; flex:1;">
                  <div style="width:36px; height:36px; border-radius:10px; background:${ext ? '#fef3c7' : '#eff6ff'}; display:flex; align-items:center; justify-content:center; font-size:18px; flex-shrink:0; margin-top:2px;">
                    ${ext ? '⏳' : '📢'}
                  </div>
                  <div style="min-width:0; flex:1;">
                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px; flex-wrap:wrap;">
                      <span style="font-weight:800; font-size:14.5px; color:#0f172a; line-height:1.4;">${escapeHtml(a.title)}</span>
                      ${read 
                        ? '<span style="background:#ecfdf5; color:#059669; font-size:11px; font-weight:700; padding:1.5px 8px; border-radius:10px; border:1px solid #a7f3d0;">✅ 已读</span>' 
                        : '<span style="background:#fef2f2; color:#dc2626; font-size:11px; font-weight:800; padding:1.5px 8px; border-radius:10px; border:1px solid #fecaca;">🔴 待查看</span>'}
                      ${idx === 0 ? '<span style="background:#eff6ff; color:#2563eb; font-size:10.5px; font-weight:800; padding:1.5px 6px; border-radius:6px; border:1px solid #bfdbfe;">最新</span>' : ''}
                    </div>
                    <div style="font-size:12px; color:#64748b; margin-bottom:6px; display:flex; gap:10px; flex-wrap:wrap;">
                      <span>📌 关联任务: <b>${escapeHtml(a.taskTitle || '写作任务')}</b></span>
                      <span>👨‍🏫 <b>${escapeHtml(a.author || '任课教师')}</b></span>
                      <span>🕒 ${escapeHtml(a.time || '')}</span>
                    </div>
                    <div style="font-size:12.5px; color:#475569; line-height:1.5; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                      ${escapeHtml((a.content || '').substring(0, 75))}${a.content && a.content.length > 75 ? '...' : ''}
                    </div>
                  </div>
                </div>
                <div style="background:${read ? '#f1f5f9' : 'linear-gradient(135deg, #1d4ed8, #2563eb)'}; color:${read ? '#475569' : '#ffffff'}; padding:7px 14px; border-radius:8px; font-size:12px; font-weight:700; white-space:nowrap; flex-shrink:0; display:inline-flex; align-items:center; gap:4px;">
                  查看详情 ➔
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <!-- 底部关闭栏 -->
        <div style="padding:14px 24px; background:#f8fafc; border-top:1px solid #f1f5f9; display:flex; justify-content:flex-end; align-items:center;">
          <button id="btn-close-ann-bottom" style="background:#ffffff; border:1px solid #cbd5e1; color:#475569; padding:9px 22px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer;">
            关闭
          </button>
        </div>
      </div>
    `;

    const renderDetailHtml = (ann) => {
      const isRead = isAnnRead(ann);
      const isExt = isExtensionNotice(ann);
      const annTask = allTasks.find(t => t.id === ann.taskId);
      const isExpired = isTaskExpired(annTask);
      const unreadIdx = unreadList.findIndex(a => a.id === ann.id);

      return `
        <div style="width:640px; max-width:94vw; background:#ffffff; border-radius:16px; box-shadow:0 25px 50px -12px rgba(15,23,42,0.25); overflow:hidden; border:1px solid #e2e8f0; animation:modalFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);">
          <!-- 渐变高颜值头部 -->
          <div style="background:linear-gradient(135deg, ${isExpired ? '#991b1b, #dc2626' : '#1d4ed8, #2563eb'}); padding:18px 22px; display:flex; justify-content:space-between; align-items:center; color:#ffffff;">
            <div style="display:flex; align-items:center; gap:10px;">
              <button id="btn-back-to-list" style="background:rgba(255,255,255,0.2); border:1px solid rgba(255,255,255,0.35); color:#ffffff; padding:5px 12px; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:4px;">
                ⬅️ 全部通知
              </button>
              <h3 style="margin:0; font-size:16.5px; font-weight:800; color:#ffffff; letter-spacing:0.3px;">${isExt ? '⏳ 任务时间延期通知' : '📢 班级教学指示'}</h3>
            </div>
            <button id="btn-close-ann-popup" style="background:rgba(255,255,255,0.15); border:1px solid rgba(255,255,255,0.3); width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:#ffffff; font-size:14px; transition:all 0.15s ease;">✕</button>
          </div>

          <!-- 通知内容主体 -->
          <div style="padding:20px 24px; max-height:60vh; overflow-y:auto; display:flex; flex-direction:column; gap:16px;">
            <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:14px; padding:18px; box-shadow:0 2px 8px rgba(15,23,42,0.03);">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px; margin-bottom:12px;">
                <h4 style="margin:0; font-size:16.5px; font-weight:800; color:#0f172a; line-height:1.4;">
                  📌 ${escapeHtml(ann.title)}
                </h4>
                <span style="font-size:11.5px; color:#64748b; white-space:nowrap;">${escapeHtml(ann.time || '')}</span>
              </div>

              <!-- 标签栏 -->
              <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:14px;">
                <span style="background:#f8fafc; color:#475569; border:1px solid #e2e8f0; padding:3px 10px; border-radius:6px; font-size:11.5px; font-weight:700;">
                  👨‍🏫 发布教师: <b>${escapeHtml(ann.author || '任课教师')}</b>
                </span>
                <span style="background:#f5f3ff; color:#7c3aed; border:1px solid #ddd6fe; padding:3px 10px; border-radius:6px; font-size:11.5px; font-weight:700;">
                  📌 关联任务: <b>${escapeHtml(ann.taskTitle || '写作任务')}</b>
                </span>
                <span style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; padding:3px 10px; border-radius:6px; font-size:11.5px; font-weight:700;">
                  🎯 受众: <b>${escapeHtml(ann.targetGroupName || '全班小组')}</b>
                </span>
                ${isExt ? `
                  <span style="background:#fef3c7; color:#b45309; border:1px solid #fde68a; padding:3px 10px; border-radius:6px; font-size:11.5px; font-weight:700;">
                    ⏳ 延期信息
                  </span>
                ` : (isRead ? `
                  <span style="background:#ecfdf5; color:#059669; border:1px solid #a7f3d0; padding:3px 10px; border-radius:6px; font-size:11.5px; font-weight:700;">
                    ✅ 本组已确认阅读
                  </span>
                ` : `
                  <span style="background:#fef2f2; color:#dc2626; border:1px solid #fecaca; padding:3px 10px; border-radius:6px; font-size:11.5px; font-weight:700;">
                    🔴 待确认阅读
                  </span>
                `)}
              </div>

              <!-- 正文卡片 -->
              <div style="background:#f8fafc; border:1px solid #f1f5f9; border-radius:10px; padding:14px 16px; font-size:13.5px; color:#334155; line-height:1.7; white-space:pre-wrap; word-break:break-word;">
                ${escapeHtml(ann.content || '')}
              </div>

              <!-- 附件卡片 (如有) -->
              ${ann.attachment ? `
                <div style="margin-top:14px; background:#faf5ff; border:1px solid #e9d5ff; border-radius:10px; padding:12px 16px; display:flex; justify-content:space-between; align-items:center; gap:12px;">
                  <div style="display:flex; align-items:center; gap:10px;">
                    <span style="font-size:24px;">📎</span>
                    <div>
                      <div style="font-size:13px; font-weight:700; color:#6b21a8;">${ann.attachment.name}</div>
                      <div style="font-size:11px; color:#9333ea; margin-top:2px;">教学随附资源文献 (${ann.attachment.size || '附件'})</div>
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
              关闭
            </button>
            ${(isTaskListMode || isExt) ? `
              <button id="btn-ext-got-it" style="flex:1; background:linear-gradient(135deg, #1d4ed8, #2563eb); color:#ffffff; border:none; padding:11px 24px; border-radius:8px; font-size:13.5px; font-weight:700; cursor:pointer; box-shadow:0 3px 10px rgba(37,99,235,0.25);">
                我知道了 (关闭)
              </button>
            ` : `
              <button id="btn-read-confirm" style="flex:1; background:${isRead ? '#e2e8f0' : 'linear-gradient(135deg, #059669, #047857)'}; color:${isRead ? '#64748b' : '#ffffff'}; border:none; padding:11px 24px; border-radius:8px; font-size:13.5px; font-weight:700; cursor:pointer; box-shadow:${isRead ? 'none' : '0 3px 10px rgba(5,150,105,0.2)'}; display:inline-flex; align-items:center; justify-content:center; gap:6px;">
                ${isRead ? '✅ 本条已确认已读 (点击关闭)' : (unreadList.length > 1 ? `✅ 确认本条已读并看下一条 (${unreadIdx + 1}/${unreadList.length}) ➔` : '✅ 我已阅读并确认 (已同步至教师端)')}
              </button>
            `}
          </div>
        </div>
      `;
    };

    const closeModal = () => {
      modal.remove();
      document.removeEventListener('keydown', onEsc);
      if (this.state.studentViewMode === 'task_list') {
        this.renderMain();
      } else {
        this.renderStudentWorkspace(true);
      }
    };

    const onEsc = (e) => {
      if (e.key === 'Escape') {
        closeModal();
      }
    };
    document.addEventListener('keydown', onEsc);

    const attachListEvents = () => {
      modal.querySelector('#btn-close-ann-popup')?.addEventListener('click', closeModal);
      modal.querySelector('#btn-close-ann-bottom')?.addEventListener('click', closeModal);
      modal.querySelectorAll('.btn-open-ann-item').forEach(card => {
        card.addEventListener('click', () => {
          const annId = card.dataset.id;
          const target = myAnns.find(a => a.id === annId);
          if (target) {
            showDetail(target);
          }
        });
      });
    };

    const showDetail = (ann) => {
      // 查阅即自动消除红点，无需强制二次确认
      try {
        this.authManager.markAnnouncementRead(ann.id, groupId);
      } catch (e) {}

      modal.innerHTML = renderDetailHtml(ann);
      attachDetailEvents(ann);
    };

    const attachDetailEvents = (ann) => {
      modal.querySelector('#btn-close-ann-popup')?.addEventListener('click', closeModal);
      modal.querySelector('#btn-close-ann-bottom')?.addEventListener('click', closeModal);
      modal.querySelector('#btn-back-to-list')?.addEventListener('click', () => {
        modal.innerHTML = renderListHtml();
        attachListEvents();
      });

      modal.querySelector('#btn-ext-got-it')?.addEventListener('click', () => {
        this.authManager.markAnnouncementRead(ann.id, groupId);
        closeModal();
      });

      modal.querySelector('#btn-read-confirm')?.addEventListener('click', () => {
        this.authManager.markAnnouncementRead(ann.id, groupId);
        const myName = currentUser ? currentUser.name : '学生';
        this.authManager.markAnnouncementConfirmed(ann.id, currentUser ? (currentUser.id || currentUser.studentCode || currentUser.name) : 'temp', myName, groupId);
        
        const remainingUnread = unreadList.filter(a => a.id !== ann.id && !a.isExtension && !a.title?.includes('延期通知'));
        if (remainingUnread.length > 0) {
          showDetail(remainingUnread[0]);
        } else {
          closeModal();
        }
      });

      const downloadBtn = modal.querySelector('#btn-download-ann-file');
      if (downloadBtn && ann.attachment) {
        downloadBtn.onclick = (e) => {
          if (e) { e.preventDefault(); e.stopPropagation(); }
          const att = ann.attachment;
          const attObj = typeof att === 'string' ? (JSON.parse(att) || { url: att, name: '随附教学文献.pdf' }) : att;
          const attName = attObj.name || attObj.fileName || `${ann.title || '教学随附文献'}.pdf`;
          const attUrl = attObj.url || attObj.fileUrl || attObj.fileData || attObj.path;
          downloadFileBlob(attName, null, attUrl);
        };
      }
    };

    if (showDetailDirectly && selectedAnn) {
      modal.innerHTML = renderDetailHtml(selectedAnn);
      attachDetailEvents(selectedAnn);
    } else {
      modal.innerHTML = renderListHtml();
      attachListEvents();
    }

    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    document.body.appendChild(modal);
  }

  showQuestionnaireModal() {
    document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
    const currentUser = this.authManager.getCurrentUser();
    const currentClassId = currentUser && currentUser.classId ? currentUser.classId : 'class_101';
    const currentTaskId = this.state.activeTaskId || 'task_default';
    const tasks = this.authManager.getTasks();
    const currTaskObj = tasks.find(t => t.id === currentTaskId);
    const taskTitle = currTaskObj ? currTaskObj.title : '指定写作任务';
    const surveyUrl = this.authManager.getSurveyUrl(currentClassId, currentTaskId);
    const isConfigured = surveyUrl && surveyUrl.startsWith('http');
    const surveyDoneKey = `jizhi_survey_completed_${currentClassId}_${currentTaskId}`;
    
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
              <div style="font-size:12px; color:#64748b; margin-top:2px;">📌 当前任务: <b style="color:#2563eb;">${taskTitle}</b></div>
            </div>
          </div>
          <button id="btn-close-survey-modal" style="background:#f8fafc; border:1px solid #e2e8f0; width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:#64748b; font-size:14px; transition:all 0.15s ease;">✕</button>
        </div>

        <!-- 内容主体 -->
        <div style="padding:24px; display:flex; flex-direction:column; gap:18px;">
          
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:14px 16px; font-size:13px; color:#334155; line-height:1.6;">
            为评估本任务（<b>${taskTitle}</b>）的协作效果，请同学们点击下方按钮前往填写匿名问卷。
          </div>

          <!-- 跳转按钮区域 -->
          <div style="background:#ffffff; border:1.5px dashed #bfdbfe; border-radius:12px; padding:22px 18px; text-align:center;">
            ${isConfigured ? `
              <a href="${surveyUrl}" target="_blank" id="btn-go-survey" style="display:inline-flex; align-items:center; justify-content:center; gap:8px; background:linear-gradient(135deg, #1d4ed8, #2563eb); color:#ffffff; padding:12px 32px; border-radius:10px; font-size:14px; font-weight:700; text-decoration:none; box-shadow:0 4px 12px rgba(37,99,235,0.25); transition:transform 0.15s ease;">
                🚀 打开本任务问卷页面 ↗
              </a>
              <div style="font-size:11.5px; color:#94a3b8; margin-top:10px; word-break:break-all;">
                问卷地址: <span style="color:#2563eb;">${surveyUrl}</span>
              </div>
            ` : `
              <div style="color:#d97706; font-size:13px; font-weight:600;">
                ⚠️ 任课教师暂未为【${taskTitle}】配置独立问卷链接。
              </div>
            `}
          </div>

          <!-- 勾选确认 -->
          <div style="display:flex; align-items:center; gap:10px; background:#eff6ff; border:1px solid #bfdbfe; border-radius:10px; padding:12px 16px;">
            <input type="checkbox" id="chk-survey-done" style="width:17px; height:17px; cursor:pointer; accent-color:#2563eb;" ${localStorage.getItem(surveyDoneKey) === 'true' ? 'checked' : ''}>
            <label for="chk-survey-done" style="font-size:13px; font-weight:700; color:#1e40af; cursor:pointer; user-select:none;">
              我已完成【${taskTitle}】的问卷填写并提交
            </label>
          </div>

        </div>

        <!-- 底部确认关闭 -->
        <div style="padding:16px 24px; background:#f8fafc; border-top:1px solid #f1f5f9; display:flex; justify-content:flex-end;">
          <button id="btn-finish-survey" style="width:100%; background:linear-gradient(135deg, #1d4ed8, #2563eb); color:#ffffff; border:none; padding:11px 24px; border-radius:10px; font-size:13.5px; font-weight:700; cursor:pointer; box-shadow:0 2px 8px rgba(37,99,235,0.2);">
            完成并返回工作台
          </button>
        </div>

      </div>
    `;
    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    modal.querySelector('#btn-close-survey-modal').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    modal.querySelector('#chk-survey-done').addEventListener('change', (e) => {
      localStorage.setItem(surveyDoneKey, e.target.checked ? 'true' : 'false');
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
    const classId = user ? user.classId : null;
    const activeTaskId = (this.state && this.state.activeTaskId) ? this.state.activeTaskId : 'task_default';
    const papers = this.authManager.getReferencePapers(groupId, classId, activeTaskId);

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
                    ${(p.fileName || p.fileUrl || p.fileData || p.title) ? `
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
      btn.onclick = (e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        const paperId = btn.dataset.id;
        const paper = papers.find(p => p.id === paperId);
        if (paper) {
          const fileName = paper.fileName || `${paper.title || '学术参考范文'}.pdf`;
          const fileData = paper.fileUrl || paper.fileData || (window._paperMemoryBlobMap && window._paperMemoryBlobMap.get(paperId));
          downloadFileBlob(fileName, null, fileData);
        }
      };
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
    sessionStorage.removeItem('jizhi_student_view_mode');
    localStorage.removeItem('jizhi_student_view_mode');
    this.renderMain(); 
  }

  backToTaskList() {
    this.state.studentViewMode = 'task_list';
    sessionStorage.setItem('jizhi_student_view_mode', 'task_list');
    sessionStorage.removeItem('jizhi_active_task_id');
    localStorage.setItem('jizhi_student_view_mode', 'task_list');
    localStorage.removeItem('jizhi_active_task_id');
    if (this.cloudSyncEngine) this.cloudSyncEngine.stopPolling();
    this.renderMain();
  }

  renderHeader() {
    const currentUser = this.authManager.getCurrentUser();
    const headerEl = document.querySelector('.header-wrapper') || document.querySelector('.header');
    if (!headerEl) return;
    renderHeader(
      this.state, currentUser, this.authManager.getAnnouncements(),
      (s) => this.switchStage(s), (sp) => this.setSpeed(sp),
      () => this.handleLogout(), () => this.switchToTeacherView(),
      () => this.showAnnouncementModal(), () => this.showQuestionnaireModal(),
      () => this.backToTaskList()
    );
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
          const currentUser = this.authManager.getCurrentUser();
          const studentCode = currentUser ? (currentUser.studentCode || currentUser.id || 'A') : 'A';
          const currentStage = this.state.currentStage || 'stage1';

          // 🛡️ 纯正文件上传：直传服务端 uploads/ 目录获取物理 HTTP URL，彻底杜绝 Base64 膨胀
          const fd = new FormData();
          fd.append('file', file);
          fd.append('userId', studentCode);

          fetch('sync.php?action=upload_file', {
            method: 'POST',
            body: fd
          })
          .then(res => res.json())
          .then(resData => {
            const finalUrl = (resData && resData.url) ? resData.url : '';
            if (!finalUrl) {
              alert('图片上传失败，请检查网络或文件格式');
              return;
            }
            const msgObj = {
              id: 'msg_img_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
              sender: studentCode,
              senderName: currentUser ? currentUser.name : studentCode,
              text: `[IMG_DATA]:${finalUrl}`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              _timeMs: Date.now()
            };
            if (!this.state.chatLogs[currentStage]) this.state.chatLogs[currentStage] = [];
            this.state.chatLogs[currentStage].push(msgObj);
            this.sendSingleChatMessage(msgObj, currentStage);
            renderChat(this.state);
          })
          .catch(err => {
            alert('图片上传网络异常，请重试');
          })
          .finally(() => {
            fileInputImg.value = '';
          });
        }
      });
    }

    let isComposing = false;
    input.addEventListener('compositionstart', () => { isComposing = true; });
    input.addEventListener('compositionend', () => { isComposing = false; });

    input.addEventListener('input', (e) => {
      if (isComposing || e.isComposing) return;
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
      const studentCode = currentUser ? (currentUser.studentCode || currentUser.id || 'student') : 'student';
      const studentName = currentUser ? currentUser.name : '组员';
      const currentStage = this.state.currentStage;
      const msgObj = { 
        id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        sender: studentCode, 
        senderName: studentName,
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

      // ── 🧠 【研讨语义认知与共识判定引擎】：0 带宽、0 内存、0 额外 Token ──
      const studentChats = (this.state.chatLogs[currentStage] || []).filter(m => m.sender && !AgentProfiles[m.sender] && m.sender !== 'system');
      const hasAdversative = /(?:但是|不过|可是|然而|但|不过我建议|不如|还要再)/i.test(text || '');
      const hasAgreement = /(?:好|行|可以|同意|赞成|支持|没问题|没意见|就这个|按你说的|听你的|就这么办|就这么定|那就这样|妥了|ok|OK|okk|收到|\+1|没毛病|不错|好啊|行啊|没异议|赞同)/i.test(text || '');
      const hasValidConsensusPair = !hasAdversative && hasAgreement && studentChats.length >= 2;
      
      // 🎪 阶段一（学术拍卖会）多轮共识流转
      if (currentStage === 'stage1' && !this.state.stage1.contract.isDraftGenerated && !this.state.stage1.contract.isConfirmed) {
        const s1 = this.state.stage1;
        // 1. 若处于【分歧协商】状态，识别组员是否讨论并收敛出了融合选题
        if (this.state.stage1PendingDivergence) {
          const isTopicConsensusSignal = /(?:结合|融合|就定|赞成|同意|按照|定这个|选题|题目|基于|好主意|没问题|支持|统一|听大家的)/i.test(text);
          if (isTopicConsensusSignal || hasValidConsensusPair) {
            this.state.stage1PendingDivergence = false;
            this.state.stage1PendingRefinement = true;
            setTimeout(async () => {
              const refinePrompt = `小组成员已在讨论区就融合研究论题达成初步共识。
请作为资深学术拍卖师，发表 130~150 字的【课题深度细化建议】：
① 肯定该融合选题的学术价值与实践创新点；
② 给出 2~3 个具体的研究落脚点建议（如核心内容界定、实践情境或研究视角），启发组员深度推敲；
③ 鼓励组员就细化方案继续交流，暂时不要急于填表！`;

              let refineText = await callCozeAgentAPI('auctioneer', refinePrompt, { stage: 'stage1', topic: s1.mergedTitle || '本组融合课题' });
              if (!refineText || refineText.trim().length === 0) {
                refineText = `🤖 【拍卖师·课题细化建议】：小组成员已就论题构想达成共识！为了让方案更加扎实，建议大家围绕以下几点进一步推敲：① 明确核心研究内容与实施路径；② 细化具体应用对象与实施情境；③ 初步构想核心环节与设计方案。请大家在讨论区继续交流细化！`;
              }
              const promptMsg = {
                sender: 'auctioneer',
                text: refineText,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                _timeMs: Date.now()
              };
              if (!this.state.chatLogs.stage1) this.state.chatLogs.stage1 = [];
              this.state.chatLogs.stage1.push(promptMsg);
              this.syncChatLogs();
              if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
              renderChat(this.state);
            }, 1200);
          }
        }
        // 2. 若处于【方案细化】状态，识别组员是否讨论了具体方案细节并准备商议分工与时间
        else if (this.state.stage1PendingRefinement) {
          const isRefineDoneSignal = /(?:内容|方向|要点|维度|思路|结合|重点|案例|章节|结构|模块|模式|视角|主题|设计|方案|确定|定好|想好|差不多|可以了|赞同|分工|怎么分|谁来写|谁负责)/i.test(text);
          if (isRefineDoneSignal || hasValidConsensusPair) {
            this.state.stage1PendingRefinement = false;
            this.state.stage1PendingTasks = true;
            setTimeout(async () => {
              const taskPromptMsg = {
                sender: 'auctioneer',
                text: `🎪 【拍卖师·分工与时间规划引导】：具体研究内容已基本明晰！👉 接下来请大家在讨论区商定：① 规划 6 大章节的时间预算；② 确定各自的任务分工（大家可以按具体内容模块分工，也可以按章节分工；先定时间还是先定分工由全组自主决定）！`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                _timeMs: Date.now()
              };
              if (!this.state.chatLogs.stage1) this.state.chatLogs.stage1 = [];
              this.state.chatLogs.stage1.push(taskPromptMsg);
              this.syncChatLogs();
              if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
              renderChat(this.state);
            }, 1200);
          }
        }
        // 3. 若处于【分工与时间商议】状态，识别组员是否已完成分工与时间讨论 ➔ 提醒点击【生成公约草案】
        else if (this.state.stage1PendingTasks) {
          const isTasksDoneSignal = /(?:分工好了|时间定好|分钟|负责|我来|你来|分配|定好|差不多|可以了|赞同|生成公约|搞定|没问题|商定|确认分工)/i.test(text);
          if (isTasksDoneSignal || hasValidConsensusPair) {
            this.state.stage1PendingTasks = false;
            this.state.stage1PendingDraftClick = true;
            setTimeout(async () => {
              const draftPromptMsg = {
                sender: 'auctioneer',
                text: `📜 【拍卖师·公约草案生成提醒】：分工与时间规划已商定就绪！👉 请组员点击左侧【生成公约草案】卡片，系统将根据大家的研讨记录自动生成草案，生成后可继续微调修改！`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                _timeMs: Date.now()
              };
              if (!this.state.chatLogs.stage1) this.state.chatLogs.stage1 = [];
              this.state.chatLogs.stage1.push(draftPromptMsg);
              this.syncChatLogs();
              if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
              renderChat(this.state);
            }, 1200);
          }
        }
      }

      // 📰 阶段二（学术编辑部）双研讨闭环与按需学术答疑
      if (currentStage === 'stage2') {
        // 0. 支持学生在讨论区随时主动 @审稿编辑 咨询具体学术疑问
        const isMentioningReviewer = /(?:@审稿编辑|@审稿专家|@审稿)/i.test(text);
        if (isMentioningReviewer) {
          setTimeout(async () => {
            const topic = (this.state.stage1 && this.state.stage1.mergedTitle) ? this.state.stage1.mergedTitle : '本组课题';
            const fullDoc = (this.state.stage2 && this.state.stage2.unifiedContent) ? this.state.stage2.unifiedContent.replace(/<[^>]*>/g, '').trim() : '论文草稿';
            const userQuestion = text.replace(/@(?:审稿编辑|审稿专家|审稿)/g, '').trim() || '请问针对当前正文草稿，我们该如何进一步深化修改？';
            
            const askPrompt = `小组成员在讨论区主动向你提问咨询学术问题：
【课题】: 《${topic}》
【组员提问】: “${userQuestion}”

请通读学生真实正文草稿切片，作为国家级教育期刊资深审稿编辑，给予 80~120 字切中其实际课题的具体点拨与修改操作建议（纯自然语言输出，对靶解答，给出 1~2 个具体操作化支架）：`;

            let reviewerAnswer = await callCozeAgentAPI('reviewingEditor', askPrompt, { stage: 'stage2', topic, userQuestion, actualDoc: fullDoc });
            if (!reviewerAnswer || reviewerAnswer.trim().length === 0) {
              reviewerAnswer = `📝 【审稿编辑·即时答疑】：针对大家提出的问题『${userQuestion}』：建议从具体研究对象的操作化指标切入！如果是量表题项，可从具体行为表现拟定 2~3 个具体题项；若是文献衔接，建议在对应章节末尾增加 1~2 句承上启下的述评过渡。大家可以直接在文档中尝试补充！`;
            }

            const replyMsg = {
              sender: 'reviewingEditor',
              text: reviewerAnswer,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              _timeMs: Date.now(),
              stage: 'stage2'
            };
            if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
            this.state.chatLogs.stage2.push(replyMsg);
            this.syncChatLogs();
            if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
            renderChat(this.state);
          }, 1000);
        }

        // Loop 1: 半程自查播报后，监听组员表达赞同/达成一致 -> 静默 25 秒后判定研讨充分并交棒（或 @智能体 立即交棒）
        const pendingRev = this.state.stage2?.pendingReviewing || this.state.stage2PendingReviewing;
        if (pendingRev) {
          const hasAgreementSignal = /(?:好|行|可以|同意|赞成|支持|没问题|没意见|就这个|按你说的|听你的|就这么办|就这么定|那就这样|妥了|ok|OK|okk|收到|\+1|没毛病|不错|好啊|行啊|没异议|赞同|开始吧|开搞|就这么改|ke yi|好的|写吧|那开始吧|改吧|改一下|按这个|就按|商量好了)/i.test(text || '');
          const hasAdversativeSignal = /(?:但是|不过|可是|然而|但|不过我建议|不如|还要再|不同意|不妥)/i.test(text || '');
          const isExplicitTrigger = /(?:@审稿编辑|@责任编辑|下发清单|修正清单|清单|请审稿|请责任|讨论结束|开始修改)/i.test(text || '');

          const doHandover = async () => {
            const curCtx = this.state.stage2?.pendingReviewing || this.state.stage2PendingReviewing;
            if (!curCtx) return;

            const s2Chats = (this.state.chatLogs.stage2 || []).filter(m => m.sender && !AgentProfiles[m.sender] && m.sender !== 'system');
            const recentChats = s2Chats.slice(-8).map(m => `${m.senderName || m.sender}: ${m.text}`).join('\n');

            const evalPrompt = `小组成员已在讨论区就修改方向达成一致并表达了赞同。
【全组自查核心脱节焦点】: ${curCtx.transFocus}，${curCtx.styleFocus}
【小组最新研讨对话记录】:
${recentChats}

请通读以上小组成员的真实研讨发言，作为学术编辑部责任编辑发表一段 100~130 字的【一致性研讨小结与交棒】：简明肯定大家对齐的修改思路，并隆重引出审稿专家通读草稿下发 3 项修正清单！（纯自然语言，严禁输出代码块）`;

            let evalResult = await callCozeAgentAPI('managingEditor', evalPrompt, { stage: 'stage2', topic: curCtx.topic });
            await this.triggerReviewingEditorAfterDiscussion(evalResult?.trim() || '');
          };

          if (isExplicitTrigger) {
            // 学生明确召唤或示意讨论完毕：0秒即刻触发交棒
            if (this._consensusDebounceTimer) clearTimeout(this._consensusDebounceTimer);
            setTimeout(doHandover, 500);
          } else if (hasAgreementSignal && !hasAdversativeSignal) {
            pendingRev.hasAgreement = true;
            pendingRev.lastAgreementTime = Date.now();
            this.syncStage2();
            if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();

            // ⏱️ 赞同后启动 35 秒静默观察期（足够缓冲发言，又不会漫长假死）
            if (this._consensusDebounceTimer) {
              clearTimeout(this._consensusDebounceTimer);
            }
            this._consensusDebounceTimer = setTimeout(doHandover, 35000);
          } else if (hasAdversativeSignal && this._consensusDebounceTimer) {
            // 若组员继续提出异议或不同意见，重置计时器，让组员继续充分商榷
            clearTimeout(this._consensusDebounceTimer);
            this._consensusDebounceTimer = null;
            pendingRev.hasAgreement = false;
            this.syncStage2();
          }
        }

        // Loop 2: 清单下发后，监听学生针对具体正文修改策略与分工进行讨论
        if (this.state.stage2PendingRevisionDiscussion) {
          const isRevisionStrategySignal = /(?:文献|改|加|写|段落|引言|方法|反思|我来|你来|我负责|你负责|章节|修改|补充|润色|动笔|排版|正文|表格|图|清单|开始改)/i.test(text);
          if (isRevisionStrategySignal) {
            this.state.stage2PendingRevisionDiscussion = false;
            this.state.stage2DualActivityActive = true; // 激活动笔双静默守护

            // 审稿编辑出场收尾确认与号召动手
            setTimeout(() => {
              const concludeMsg = {
                sender: 'reviewingEditor',
                text: `📝 【审稿编辑·研讨总结与修改号召】：大家的修改思路非常清晰明确！研讨圆满结束，请大家对照上方【半程修正清单】在正文中展开针对性修改，完成对应项后可在清单逐项打勾！修改过程中若有具体学术疑问可随时在讨论区 @审稿编辑 咨询，祝大家修改顺利！`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                _timeMs: Date.now(),
                stage: 'stage2'
              };
              if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
              this.state.chatLogs.stage2.push(concludeMsg);
              this.syncChatLogs();
              if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
              renderChat(this.state);
            }, 1500);
          }
        }
      }

      // 🎓 阶段三（答辩擂台）逐条推进与主席精准总结 (支持质询 1, 2, 3... 动态识别)
      if (currentStage === 'stage3') {
        const s3Feedbacks = this.state.stage3?.feedbackItems || [];
        const pendingItem = s3Feedbacks.find(f => f.status !== 'adopted');
        const activeQueryIndex = pendingItem ? (s3Feedbacks.indexOf(pendingItem) + 1) : 1;

        if (!this.state.stage3DefenseMsgCountMap) this.state.stage3DefenseMsgCountMap = {};
        this.state.stage3DefenseMsgCountMap[activeQueryIndex] = (this.state.stage3DefenseMsgCountMap[activeQueryIndex] || 0) + 1;

        const isDefenseSignal = /(?:前测|控制|效度|协变量|样本|反思|辩护|采纳|解释|指标|修改|针对|理由|补充|同意|附录|同质|补救|预案|正文|问卷|设计|方法)/i.test(text);
        const hasEnoughDiscussion = (this.state.stage3DefenseMsgCountMap[activeQueryIndex] >= 2) || (text.length >= 15 && isDefenseSignal);

        if (!this.state.stage3SummarizedMap) this.state.stage3SummarizedMap = {};

        if (pendingItem && !this.state.stage3SummarizedMap[activeQueryIndex] && ((isDefenseSignal && hasEnoughDiscussion) || hasValidConsensusPair) && !hasAdversative) {
          this.state.stage3SummarizedMap[activeQueryIndex] = true;
          setTimeout(async () => {
            const topic = (this.state.stage1 && this.state.stage1.mergedTitle) ? this.state.stage1.mergedTitle : '本组研究设计';
            
            // 提取针对当前质询最近的 6~8 条真实组内研讨发言（精准截取当前题目的辩护上下文，绝不喂无关历史）
            const s3Logs = (this.state.chatLogs && this.state.chatLogs.stage3) ? this.state.chatLogs.stage3 : [];
            const recentDefenseChat = s3Logs.slice(-8).filter(m => m && m.sender && !['system', 'neutral', 'proponent', 'opponent'].includes(m.sender))
              .map(m => `${m.senderName || m.sender}: ${m.text}`).join('\n') || text;

            const chairSummaryPrompt = `小组成员已就反方委员的【质询 ${activeQueryIndex}（${pendingItem.content || pendingItem.title}）】在讨论区展开了充分的学术辩护研讨。
【组内针对本题的最新讨论发言切片】:
${recentDefenseChat}

请通读上述发言，作为答辩委员会主席（中间委员），发表 100~130 字的【全组针对质询 ${activeQueryIndex} 辩护决断精准总结】：
① 简明扼要提炼全组商定出的核心辩护理由与正文落地修改动作；
② 提示组员推选一位代表将本条总结结论录入左侧【答辩裁决矩阵】对应项并保存，随后推进至下一条质询！纯自然语言输出，100~130字。`;

            let chairSummaryText = await callCozeAgentAPI('neutral', chairSummaryPrompt, { stage: 'stage3', topic, queryPoint: activeQueryIndex });
            if (!chairSummaryText || chairSummaryText.trim().length === 0) {
              chairSummaryText = `🟡 【中间委员·辩护共识提炼】：全组针对质询 ${activeQueryIndex} 的辩护思路已非常清晰！主要共识：采纳反方建设性意见，在对应章节补充论证说明与补救预案。👉 请推选一位组员代表全组将本条总结录入左侧【答辩裁决矩阵】保存，完成后我们继续推进下一项质询！`;
            }
            const chairMsg = {
              sender: 'neutral',
              text: chairSummaryText,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              _timeMs: Date.now()
            };
            if (!this.state.chatLogs.stage3) this.state.chatLogs.stage3 = [];
            this.state.chatLogs.stage3.push(chairMsg);
            this.syncChatLogs();
            if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
            renderChat(this.state);
          }, 1500);
        }
      }

      // ── 情绪与同伴安抚感知：检测负向情绪与同伴是否进行安抚 ──
      const isNegativeEmotion = /(?:太难了|写不出来|不想写|没意义|烦死了|吵什么|凭什么|搞不懂|放弃了|头疼)/i.test(text);
      const isPeerSupportSignal = /(?:没事|我来写|我来帮|我们一起|别急|慢慢来|别慌|大家商量|赞同你|没关系)/i.test(text);

      if (isNegativeEmotion) {
        this.pendingNegativeEmotion = { sender: studentCode, time: Date.now(), text: text };
      } else if (isPeerSupportSignal && this.pendingNegativeEmotion) {
        // 同伴已主动给出暖心安抚，智能体保持安静，让学生自主发挥同伴互助
        this.pendingNegativeEmotion = null;
      }

      // 若同伴在 60 秒内未予回应或继续出现消极，对应阶段智能体精准介入安抚（提取为方法，发送与静默轮询共用，见审查 #45）
      this.checkEmotionComfort(currentStage);

      this.triggerAgentReplyIfNeeded(text);
    };

    sendBtn.addEventListener('click', handleSend);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        // 🛡️ Safari / WebKit 中文输入法合成防吞字：若处于输入法选词状态或 keyCode 229，绝对禁止触发发送与清空
        if (isComposing || e.isComposing || e.keyCode === 229) return;
        e.preventDefault();
        handleSend();
      }
    });
  }

  // updateContributionUi() 已在 L258 定义（含 getElementById 精确选择器），此处不再重复覆盖

  // 🎧 情绪安抚定时巡检：即便无人发言也按固定周期检查是否存在未安抚的负向情绪并介入（审查 #45）
  checkEmotionComfort(currentStage) {
    if (!this.pendingNegativeEmotion) return;
    const now = Date.now();
    if ((now - this.pendingNegativeEmotion.time) <= 60000) return;
    if (this.lastEmotionNudgeTime && (now - this.lastEmotionNudgeTime) <= 180000) return;

    this.lastEmotionNudgeTime = now;
    const stage = currentStage || this.state.currentStage;
    const targetAgent = (stage === 'stage1') ? 'auctioneer' : ((stage === 'stage2') ? 'managingEditor' : 'neutral');
    const agentTitle = (stage === 'stage1') ? '拍卖师' : ((stage === 'stage2') ? '责任编辑' : '中间委员');
    const emotionPromptMsg = {
      sender: targetAgent,
      text: `🤝 【${agentTitle}·协同支持】：关注到大家在协作中遇到了难点！学术方案设计本身就是一个不断推敲和迭代的过程，遇到卡点非常正常。建议大家在讨论区交流具体哪个环节需要支持，团队分工互助、取长补短，稳步推进！`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      _timeMs: now
    };
    this.pendingNegativeEmotion = null;
    setTimeout(() => {
      if (!this.state.chatLogs[stage]) this.state.chatLogs[stage] = [];
      this.state.chatLogs[stage].push(emotionPromptMsg);
      this.syncChatLogs();
      if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
      renderChat(this.state);
    }, 1500);
  }

  async triggerAgentReplyIfNeeded(userMsg) {
    // 🛡️ 并发锁：防止快速发送多条 @消息 导致 AI 回复乱序
    if (this._isAgentReplyInProgress) return;
    this._isAgentReplyInProgress = true;
    const stage = this.state.currentStage;
    const isExplicitMention = userMsg.includes('@');
    // 阶段一专属里程碑：学生在研讨中商定好分工/时间并确认时触发拍卖师生成合约
    const isContractFinalizeSignal = stage === 'stage1' && /(?:分工确定|确定分工|商定好了|分工好了|确定主题|生成合约|确认分工|时间分配好了|分配完毕|达成共识)/i.test(userMsg);

    if (!isExplicitMention && !isContractFinalizeSignal) {
      this._isAgentReplyInProgress = false;
      return;
    }

    let replyAgent = null;

    if (isContractFinalizeSignal) {
      replyAgent = 'auctioneer';
    } else if (userMsg.includes('@中间委员') || userMsg.includes('@中间委员 Agent')) {
      replyAgent = 'neutral';
    } else if (userMsg.includes('@正方委员') || userMsg.includes('@正方委员 Agent')) {
      replyAgent = 'proponent';
    } else if (userMsg.includes('@反方委员') || userMsg.includes('@反方委员 Agent')) {
      replyAgent = 'opponent';
    } else if (userMsg.includes('@审稿编辑') || userMsg.includes('@审稿编辑 Agent')) {
      replyAgent = 'reviewingEditor';
    } else if (userMsg.includes('@责任编辑') || userMsg.includes('@责任编辑 Agent')) {
      replyAgent = 'managingEditor';
    } else if (userMsg.includes('@拍卖师') || userMsg.includes('@拍卖师 Agent')) {
      replyAgent = 'auctioneer';
    }

    if (!replyAgent) {
      this._isAgentReplyInProgress = false;
      return;
    }

    this.studentMsgCountSinceLastAgent = 0;
    const currentUser = this.authManager.getCurrentUser();
    const currentTopic = this.state.stage1 ? this.state.stage1.mergedTitle : '';
    const actualDocContent = (this.state.stage2 && this.state.stage2.unifiedContent) ? this.state.stage2.unifiedContent.replace(/<[^>]*>/g, '').trim() : '';

    // 💡 异步非阻塞体验：立即插入动态思考气泡，学生无需干等，可自由打字与交流！
    const agentProfile = AgentProfiles[replyAgent] || { name: '智能体' };
    const tempThinkingId = 'thinking_' + Date.now();
    const thinkingMsg = {
      id: tempThinkingId,
      sender: replyAgent,
      text: `⏳ 【${agentProfile.name}】：正在通读小组论文并起草学术意见...`,
      isThinking: true,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      _timeMs: Date.now()
    };
    if (!this.state.chatLogs[stage]) this.state.chatLogs[stage] = [];
    this.state.chatLogs[stage].push(thinkingMsg);
    renderChat(this.state);

    try {
      // 异步直连 Coze API 获得真实大模型智能体深度审阅回复
      let replyText = await callCozeAgentAPI(replyAgent, userMsg, {
        stage: stage,
        topic: currentTopic,
        actualDoc: actualDocContent,
        userId: currentUser ? (currentUser.id || currentUser.username) : 'student_user'
      });

      if (!replyText || replyText.trim().length === 0) {
        thinkingMsg.text = `⚠️ 【${agentProfile.name}提示】：大模型生成超时或网络稍有延迟，可随时在讨论区再次 @ 发送提问。`;
      } else {
        thinkingMsg.text = replyText.trim();
      }
      delete thinkingMsg.isThinking;
      this.syncChatLogs();
      renderChat(this.state);
    } catch (err) {
      thinkingMsg.text = `⚠️ 【${agentProfile.name}提示】：网络连接波动，请稍后重试。`;
      delete thinkingMsg.isThinking;
      this.syncChatLogs();
      renderChat(this.state);
    } finally {
      this._isAgentReplyInProgress = false;
    }
  }

  handleVoteCast(proposalId) {
    if (this.state.stage1.contract.isConfirmed || this.state.isFinalSubmitted) {
      alert('🔒 学术合作合约已签署锁定，不可再更改投票。');
      return;
    }
    const user = this.state.currentUser;
    const s1 = this.state.stage1;
    const currUserObj = this.authManager.getCurrentUser();
    
    // 🛡️ 稳健的多标识判定辅助函数
    const isMemberDone = (map, m) => {
      if (!map || !m) return false;
      return !!(map[m.id] || map[m.studentCode] || map[m.username] || (m.name && map[m.name]));
    };

    const isAlreadyVoted = isMemberDone(s1.hasVoted, { id: user, studentCode: currUserObj?.studentCode, username: currUserObj?.username, name: currUserObj?.name });
    if (isAlreadyVoted) {
      alert('💡 您已经完成投票啦！每位成员仅有一次投票机会，请耐心等待其他组员完成投票。');
      return;
    }
    if (!s1.hasVoted) s1.hasVoted = {};
    if (!s1.votes) s1.votes = {};

    // 兼容写入多键，保证底层依赖绝对不破坏
    s1.votes[user] = proposalId;
    s1.hasVoted[user] = true;
    if (currUserObj) {
      if (currUserObj.id) { s1.votes[currUserObj.id] = proposalId; s1.hasVoted[currUserObj.id] = true; }
      if (currUserObj.studentCode) { s1.votes[currUserObj.studentCode] = proposalId; s1.hasVoted[currUserObj.studentCode] = true; }
      if (currUserObj.name) { s1.votes[currUserObj.name] = proposalId; s1.hasVoted[currUserObj.name] = true; }
    }

    s1._lastVoteTime = Date.now();
    const proposal = (s1.proposals || []).find(p => p.id === proposalId);
    const membersList = Object.values(this.state.members || {});
    const totalMembersCount = membersList.length || 3;
    const votesCastCount = membersList.filter(m => isMemberDone(s1.hasVoted, m)).length;
    const proposalTitle = proposal ? proposal.title : proposalId;

    const voteMsg = { 
      sender: user, 
      text: `📢 [投票告知]: 我已确认投票支持提案《${proposalTitle}》！（当前全组已集齐 ${votesCastCount}/${totalMembersCount} 票）`, 
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      _timeMs: Date.now()
    };
    if (!this.state.chatLogs.stage1) this.state.chatLogs.stage1 = [];
    this.state.chatLogs.stage1.push(voteMsg);
    this.syncStage1();
    this.syncChatLogs();
    if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();

    // 🌟 弹出温和、清晰、带有进度告知的友好弹窗
    alert(`🎉 投票成功！\n\n您已成功投票支持提案《${proposalTitle}》！\n\n📊 当前全组投票进度：${votesCastCount}/${totalMembersCount} 人已完成。\n💡 每位成员仅有一次投票机会，请耐心等待组内其他同学完成投票，全员投完后拍卖师将揭晓竞拍结果！`);

    if (votesCastCount >= totalMembersCount) {
      // ── 全员投票完成：调用大模型拍卖师 API 动态生成专业落槌播报与研讨引导 ──
      setTimeout(async () => {
        s1._voteCompletedTime = Date.now();
        const tally = {};
        membersList.forEach(m => {
          const pId = s1.votes[m.studentCode] || s1.votes[m.id] || s1.votes[m.username] || (m.name && s1.votes[m.name]);
          if (pId) tally[pId] = (tally[pId] || 0) + 1;
        });
        const proposalSummaryList = (s1.proposals || []).map(p => `《${p.title}》(${tally[p.id] || 0}票)`).join('，');
        
        let maxVotes = -1;
        let winningProposal = null;
        (s1.proposals || []).forEach(p => {
          const count = tally[p.id] || 0;
          if (count > maxVotes) {
            maxVotes = count;
            winningProposal = p;
          }
        });

        const isUnanimous = (winningProposal && maxVotes === totalMembersCount && totalMembersCount > 0);

        // 🛡️ 严格学术铁律：只有【全票一致】才自动确立课题；只要不是全票一致（无论 2:1 还是平票），一律算【存在分歧】，留由组员在讨论区协商确定！
        if (isUnanimous && winningProposal) {
          s1.mergedTitle = winningProposal.title;
          this.state.stage1PendingRefinement = true;
        } else {
          this.state.stage1PendingDivergence = true;
        }

        if (!s1.contract.timeAllocations) {
          s1.contract.timeAllocations = { background: 25, literature: 30, questions: 25, method: 40, reflection: 20, references: 10 };
        }

        // ── 🌟 第 1 条：系统官方计票模板播报 ──
        const tallySystemMsg = {
          sender: 'system',
          text: `📊 【选题竞拍·计票结果】：全组投票已全部完成！计票统计：${proposalSummaryList}。${isUnanimous ? '🎉 全票一致通过！' : '⚖️ 组内对选题持有不同视角（未达成全票一致）。'}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          _timeMs: Date.now()
        };
        this.state.chatLogs.stage1.push(tallySystemMsg);
        this.syncChatLogs();
        if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
        renderChat(this.state);

        // ── 🌟 智能体拍卖师（Coze 豆包 2.0 Pro）分两条独立播报：① 题目优化确立  ② 细化探究指引 ──
        if (isUnanimous) {
          const titleOptimizePrompt = `全组投票已全部完成！全组成员 ${totalMembersCount}/${totalMembersCount} 全票一致推选《${winningProposal.title}》（作者: ${winningProposal.authorName || winningProposal.author}）！
请作为资深学术拍卖师发表 70~90 字的【课题敲定与题目学术优化】：
① 隆重宣布《${winningProposal.title}》获得全票一致推选，正式确立为全组研究课题；
② 【核心任务】：基于该提案构想，将其提炼优化为一个规范严谨、高水准的学术研究论文题目（在回复中必须用《...》标出，如《基于...的...研究设计与实证分析》）。纯自然语言输出，70~90字。`;

          const guidancePrompt = `全组已全票确立研究课题《${winningProposal.title}》。
请作为资深学术拍卖师发表 70~90 字的【细化探究方向指引】：
① 针对该选题给出 2~3 条具体的细化深化探究方向建议（【严格铁律】：此时绝对不提及任务分工与时间分配！）；
② 明确引导组长带头在讨论区发起细化交流，全组共同商议完善具体实施方案。纯自然语言输出，70~90字。`;

          let msg1Text = await callCozeAgentAPI('auctioneer', titleOptimizePrompt, {
            stage: 'stage1',
            isUnanimous: true,
            winningTopic: winningProposal ? winningProposal.title : ''
          });

          let msg2Text = await callCozeAgentAPI('auctioneer', guidancePrompt, {
            stage: 'stage1',
            isUnanimous: true,
            winningTopic: winningProposal ? winningProposal.title : ''
          });

          if (!msg1Text || msg1Text.trim().length === 0) {
            msg1Text = `🎉 【学术拍卖师·课题敲定与学术定名】：恭喜全组！经全员一致推选，《${winningProposal.title}》正式确立为全组研究课题。建议本组学术论文题目正式确立为：《基于${winningProposal.title}的实证研究与方案设计》！`;
          }
          if (!msg2Text || msg2Text.trim().length === 0) {
            msg2Text = `💡 【学术拍卖师·细化探究指引】：针对该选题，建议重点围绕核心变量界定、理论框架支撑与研究方法路径深化探究。👉 请组长在讨论区带头组织大家展开细化交流！`;
          }

          // 提取优化后的题目暂存内存中（此时先不填入左侧公约，待组员点击生成公约时才填入）
          const matchTitle = msg1Text.match(/《([^》]{4,50})》/);
          if (matchTitle && matchTitle[1]) {
            s1._optimizedTitle = matchTitle[1].trim();
          } else {
            s1._optimizedTitle = winningProposal.title;
          }

          const msg1 = { sender: 'auctioneer', text: msg1Text, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), _timeMs: Date.now() };
          const msg2 = { sender: 'auctioneer', text: msg2Text, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), _timeMs: Date.now() + 100 };
          this.state.chatLogs.stage1.push(msg1, msg2);
        } else {
          // ── 分歧分支：分两条播报（① 破冰播报 ② 协商融合指引） ──
          const divergencePrompt1 = `全组投票已全部完成！计票结果清单：${proposalSummaryList}。投票存在分歧（未达成全票一致）！
请作为资深学术拍卖师发表 60~80 字的【分歧破冰播报】：
① 客观播报票数分布，指出组内对选题持有不同视角（【严格铁律】：对事不对人，严禁指名道姓批评，严禁提及谁投了谁）；
② 鼓励大家这是碰撞创新、求同存异的最佳契机。纯自然语言输出，60~80字。`;

          const divergencePrompt2 = `全组投票存在分歧，准备进入选题协商融合阶段。
请作为资深学术拍卖师发表 60~80 字的【协商融合指引】：
① 引导各提案作者在讨论区简要阐述各自构想的核心亮点；
② 引导全组在讨论区深入协商，融合各方亮点确定一个最终统一主题。纯自然语言输出，60~80字。`;

          let dMsg1 = await callCozeAgentAPI('auctioneer', divergencePrompt1, {
            stage: 'stage1',
            isUnanimous: false,
            tallySummary: proposalSummaryList
          });
          let dMsg2 = await callCozeAgentAPI('auctioneer', divergencePrompt2, {
            stage: 'stage1',
            isUnanimous: false,
            tallySummary: proposalSummaryList
          });

          if (!dMsg1 || dMsg1.trim().length === 0) {
            dMsg1 = `⚖️ 【学术拍卖师·分歧协商破冰】：计票已落槌，计票结果为：${proposalSummaryList}。注意到组内存在不同视角，这正是团队碰撞创新、求同存异的最佳契机！`;
          }
          if (!dMsg2 || dMsg2.trim().length === 0) {
            dMsg2 = `💡 【学术拍卖师·协商融合指引】：建议各提案作者在讨论区简要阐明自己的设计亮点，大家共同商讨如何取长补短，确定一个兼具理论深度与实践可行性的最终统一融合课题！`;
          }

          const msg1 = { sender: 'auctioneer', text: dMsg1, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), _timeMs: Date.now() };
          const msg2 = { sender: 'auctioneer', text: dMsg2, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), _timeMs: Date.now() + 100 };
          this.state.chatLogs.stage1.push(msg1, msg2);
        }

        this.syncStage1();
        this.syncChatLogs();
        if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
        renderChat(this.state);
        this.renderStudentWorkspace();
      }, 800);
    }
    this.renderStudentWorkspace();
  }

  async handleAiGenerateContract() {
    const s1 = this.state.stage1 || {};
    const proposals = s1.proposals || [];
    const logs = (this.state.chatLogs && this.state.chatLogs.stage1) || [];
    const userLogs = logs.filter(m => m.sender && !['auctioneer', 'editor', 'system', 'neutral'].includes(m.sender));
    let members = [];
    if (Array.isArray(this.state.members)) members = this.state.members;
    else if (this.state.members && typeof this.state.members === 'object') members = Object.values(this.state.members);
    const totalMembersCount = members.length || 3;
    const membersInfo = members.map(m => `- ${m.name || m.studentCode || m.id} (学号/ID: ${m.studentCode || m.id})`).join('\n');

    // 🛡️ 协同门禁：必须至少有 1 个选题提案
    if (proposals.length === 0) {
      document.querySelectorAll('.jizhi-custom-modal').forEach(m => m.remove());
      const hintModal = document.createElement('div');
      hintModal.className = 'modal-overlay jizhi-custom-modal';
      hintModal.innerHTML = `
        <div style="width:460px; max-width:92vw; background:#ffffff; border-radius:16px; box-shadow:0 20px 40px rgba(15,23,42,0.22); overflow:hidden; border:1px solid #e2e8f0; animation:modalFadeIn 0.25s ease;">
          <div style="background:linear-gradient(135deg, #d97706, #f59e0b); padding:18px 24px; color:#ffffff; display:flex; align-items:center; gap:12px;">
            <span style="font-size:24px;">💡</span>
            <div>
              <h3 style="margin:0; font-size:16px; font-weight:800; color:#ffffff;">研讨协商提示</h3>
              <div style="font-size:11.5px; opacity:0.9; margin-top:2px;">学术合作公约需先有选题提案</div>
            </div>
          </div>
          <div style="padding:22px 24px; font-size:13.5px; color:#334155; line-height:1.65; display:flex; flex-direction:column; gap:12px;">
            <div>
              请小组成员先点击左侧<b>【提交我的选题】</b>提出至少 1 个研究设想，再生成公约草案！
            </div>
            <div style="font-size:12px; color:#64748b; background:#f8fafc; padding:8px 12px; border-radius:8px; border:1px solid #e2e8f0;">
              👉 <b>提示</b>：全组也可以直接在左侧输入框中自主分工录入与修改。
            </div>
          </div>
          <div style="background:#f8fafc; border-top:1px solid #e2e8f0; padding:14px 24px; display:flex; justify-content:flex-end;">
            <button class="modal-btn submit" id="btn-close-hint-modal" style="background:linear-gradient(135deg, #d97706, #f59e0b); border:none; color:white; padding:8px 22px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer;">知道了</button>
          </div>
        </div>
      `;
      document.body.appendChild(hintModal);
      hintModal.querySelector('#btn-close-hint-modal').addEventListener('click', () => hintModal.remove());
      hintModal.addEventListener('click', (e) => { if (e.target === hintModal) hintModal.remove(); });
      return;
    }

    // 1. 提炼融合研究主题（区分【全票一致】与【分歧协商】）
    const tally = {};
    Object.values(s1.votes || {}).forEach(pId => { if (pId) tally[pId] = (tally[pId] || 0) + 1; });
    let winningP = null;
    let maxV = 0;
    let isUnanimous = false;

    proposals.forEach(p => {
      const cnt = tally[p.id] || 0;
      if (cnt > maxV) {
        maxV = cnt;
        winningP = p;
      }
    });

    if (winningP && maxV >= totalMembersCount && totalMembersCount > 0) {
      isUnanimous = true;
    }

    // 提取研讨切片（包含拍卖师学术定名播报与组员真实研讨）
    const s1ChatLogs = (this.state.chatLogs && this.state.chatLogs.stage1) ? this.state.chatLogs.stage1 : [];
    const voteNoticeIdx = s1ChatLogs.findIndex(m => m && m.text && (m.text.includes('计票结果') || m.text.includes('落槌定题') || m.text.includes('全票一致通过') || m.text.includes('选题确定')));
    const relevantLogs = (voteNoticeIdx >= 0) ? s1ChatLogs.slice(voteNoticeIdx) : s1ChatLogs;
    
    // 组员发言切片（用于分工规则匹配）
    const userLogsAfterVote = relevantLogs.filter(m => m && m.sender && !AgentProfiles[m.sender] && m.sender !== 'system');
    const chatSnippet = userLogsAfterVote.map(m => `${m.senderName || m.sender}: ${m.text}`).join('\n');
    
    // 包含拍卖师学术定名播报与全组讨论的完整记录（用于大模型通读上下文）
    const fullDiscussionLogs = relevantLogs.map(m => {
      const senderLabel = m.sender === 'auctioneer' ? '【学术拍卖师】' : (m.sender === 'system' ? '【系统播报】' : (m.senderName || m.sender));
      return `${senderLabel}: ${m.text}`;
    }).join('\n');

    const proposalsSummary = proposals.map((p, idx) => `提案${idx+1}: 《${p.title}》（作者: ${p.authorName || p.author}）`).join('\n');
    const tallyDesc = Object.entries(tally).map(([pid, c]) => {
      const p = proposals.find(item => item.id === pid);
      return `《${p ? p.title : pid}》(${c}票)`;
    }).join('，');

    // 🌟 点了生成公约草案后，题目直接由大模型通读全组提案与讨论后权威提炼并填入
    if (!s1.mergedTitle || s1.mergedTitle.trim().length === 0 || s1.mergedTitle === '待组员协商填入融合主题') {
      s1.mergedTitle = (winningP ? winningP.title : (proposals[0] ? proposals[0].title : '本组学术研究课题'));
    }

    if (!s1.contract) s1.contract = {};
    s1.contract.isDraftGenerated = true;
    s1.contract._draftedTime = Date.now();
    if (!s1.contract.taskAssignments) s1.contract.taskAssignments = {};
    const allTasks = (this.authManager) ? this.authManager.getTasks() : [];
    const curTask = allTasks.find(t => t.id === this.state.activeTaskId);
    const totalDurationMin = (curTask && curTask.durationMinutes) ? Number(curTask.durationMinutes) : 150;
    const stage2BudgetMin = Math.max(20, Math.round(totalDurationMin * 0.70)); // 阶段二正文起草总预算时长

    // 默认按任务时长科学比例初始化（学术黄金比例）
    s1.contract.timeAllocations = {
      background: Math.max(5, Math.round(stage2BudgetMin * 0.18)),
      literature: Math.max(5, Math.round(stage2BudgetMin * 0.22)),
      questions: Math.max(5, Math.round(stage2BudgetMin * 0.15)),
      method: Math.max(8, Math.round(stage2BudgetMin * 0.25)),
      reflection: Math.max(3, Math.round(stage2BudgetMin * 0.12)),
      references: Math.max(2, Math.round(stage2BudgetMin * 0.08))
    };

    // 本地快速规则填充
    const defaultChapterTasks = [
      '负责“一、研究背景与意义”及“二、文献综述”起草与资料整理',
      '负责“三、研究问题与假设”及“四、研究设计与方法”方案制定',
      '负责“五、不足与反思”撰写及全篇“六、参考文献”引文校对',
      '负责数据分析模型构建与研究工具问卷设计'
    ];

    members.forEach((m, idx) => {
      let assignedTask = '';
      const myName = m.name || '';
      const myCode = m.studentCode || m.id || '';
      const myMsgs = userLogsAfterVote.filter(msg => msg.sender === m.id || msg.sender === myCode || (myName && msg.senderName === myName));
      const myText = myMsgs.map(msg => msg.text || '').join(' ');

      if (myText.includes('背景') || myText.includes('综述') || myText.includes('前言')) {
        assignedTask = '负责“一、研究背景与意义”及“二、文献综述”起草与资料整理';
      } else if (myText.includes('假设') || myText.includes('方法') || myText.includes('设计') || myText.includes('问卷') || myText.includes('实验')) {
        assignedTask = '负责“三、研究问题与假设”及“四、研究设计与方法”方案制定';
      } else if (myText.includes('反思') || myText.includes('不足') || myText.includes('文献') || myText.includes('校对')) {
        assignedTask = '负责“五、不足与反思”撰写及全篇“六、参考文献”引文校对';
      } else if (myText.includes('数据') || myText.includes('量表') || myText.includes('模型')) {
        assignedTask = '负责数据分析模型构建与研究工具问卷设计';
      }
      if (!assignedTask) assignedTask = defaultChapterTasks[idx % defaultChapterTasks.length] || '协作撰写与统稿';
      s1.contract.taskAssignments[m.id] = assignedTask;
      if (m.studentCode) s1.contract.taskAssignments[m.studentCode] = assignedTask;
    });

    // ── 异步调用大模型进行公约数据结构化精修覆盖（包含前后统一的论文题目提炼） ──
    const extractPrompt = `请作为资深学术拍卖师，通读下方小组成员提出的所有选题提案、投票情况、此前拍卖师的学术定名播报以及【投票定题之后】全组关于分工与时间的真实研讨记录，提取结构化数据填入《学术合作公约草案》：

【小组成员名单】:
${membersInfo}

【全组成员提出的选题提案列表】:
${proposalsSummary || '无独立提案'}

【投票定题与计票情况】:
${isUnanimous ? `全票一致推选《${winningP ? winningP.title : ''}》` : `存在分歧，投票计票分布为：${tallyDesc}`}

【投票后的完整研讨发言记录（包含学术拍卖师学术定名与组员交流）】:
${fullDiscussionLogs || '成员协商协作撰写'}

【全场任务时长参考】: 全场总时长 ${totalDurationMin} 分钟（阶段二正文起草预算约 ${stage2BudgetMin} 分钟）

【核心提炼要求】:
1. 融合研究主题 (mergedTitle)：严格保持前后学术定名连贯性！通读此前拍卖师给出的规范学术题目及组员后续讨论：若全票一致且组员无修改异议，优先承接此前确立的规范学术论文题目（如《基于...的...研究设计与实证分析》）；若同学们在讨论中深入融合了各方亮点，则提炼出全组达成共识的最终融合学术题目；
2. 任务分工 (taskAssignments)：根据成员在聊天中的主动认领或学术背景，合理分配章节任务；
3. 时间规划 (timeAllocations)：若学生提及了具体章节时间则优先采纳；若模糊或未提全，按黄金学术比例（背景18%、综述22%、问题15%、方法25%、反思12%、文献8%）推算补齐全部 6 大章节分钟数。

请严格输出合法的 JSON 格式（严禁输出任何额外 markdown 说明或自然语言）：
{
  "mergedTitle": "前后连贯、深度提炼的学术论文研究主题",
  "taskAssignments": {
    "成员ID或学号": "提取的分工任务描述（如负责研究背景与文献综述梳理、负责问卷设计与数据分析）"
  },
  "timeAllocations": {
    "background": 25,
    "literature": 30,
    "questions": 25,
    "method": 40,
    "reflection": 20,
    "references": 10
  }
}`;

    callCozeAgentAPI('auctioneer', extractPrompt, { stage: 'stage1', topic: s1.mergedTitle }).then(llmRes => {
      if (llmRes && llmRes.includes('{')) {
        try {
          const jsonStr = llmRes.substring(llmRes.indexOf('{'), llmRes.lastIndexOf('}') + 1);
          const parsed = JSON.parse(jsonStr);
          if (parsed.mergedTitle && typeof parsed.mergedTitle === 'string' && parsed.mergedTitle.trim().length > 0) {
            s1.mergedTitle = parsed.mergedTitle.trim().replace(/^《|》$/g, '');
          }
          if (parsed.taskAssignments && typeof parsed.taskAssignments === 'object') {
            Object.assign(s1.contract.taskAssignments, parsed.taskAssignments);
          }
          if (parsed.timeAllocations && typeof parsed.timeAllocations === 'object') {
            Object.assign(s1.contract.timeAllocations, parsed.timeAllocations);
          }
          this.syncStage1();
          if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
          this.renderStudentWorkspace(true);
        } catch (e) {}
      }
    }).catch(() => {});

    this.syncStage1();
    if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
    this.renderStudentWorkspace(true);

    // 拍卖师在聊天区发布权威引导播报
    const draftNoticeMsg = {
      sender: 'auctioneer',
      text: `✨ 【拍卖师·已提炼公约草案】\n已读取学术研讨发言与选题投票结果，生成《团队协同合作学术合约草案》！\n\n📌 **融合研究主题**：《${s1.mergedTitle}》\n💡 **决策依据**：${topicDecisionReason}\n👉 **请组员仔细核查左侧分工与时间预算**：\n• 若与实际商议有出入，每位同学均可**直接在输入框中自主微调修改**；\n• 小组成员也可以不依赖提炼，完全自主在左侧分工填写；\n✍️ 确认无误后，全员点击【确认签署公约】即可正式生效并解锁阶段二！`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      _timeMs: Date.now()
    };
    const curStage = this.state.currentStage || 'stage1';
    if (!this.state.chatLogs[curStage]) this.state.chatLogs[curStage] = [];
    this.state.chatLogs[curStage].push(draftNoticeMsg);
    this.syncChatLogs();

    document.querySelectorAll('.jizhi-custom-modal').forEach(m => m.remove());
    const succModal = document.createElement('div');
    succModal.className = 'modal-overlay jizhi-custom-modal';
    succModal.innerHTML = `
      <div style="width:460px; max-width:92vw; background:#ffffff; border-radius:16px; box-shadow:0 20px 40px rgba(15,23,42,0.22); overflow:hidden; border:1px solid #e2e8f0; animation:modalFadeIn 0.25s ease;">
        <div style="background:linear-gradient(135deg, #059669, #10b981); padding:18px 24px; color:#ffffff; display:flex; align-items:center; gap:12px;">
          <span style="font-size:24px;">🎉</span>
          <div>
            <h3 style="margin:0; font-size:16px; font-weight:800; color:#ffffff;">学术合作公约草案已生成</h3>
            <div style="font-size:11.5px; opacity:0.9; margin-top:2px;">已自动填入左侧公约区域</div>
          </div>
        </div>
        <div style="padding:22px 24px; font-size:13.5px; color:#334155; line-height:1.65; display:flex; flex-direction:column; gap:12px;">
          <div>
            系统已自动在左侧填入<b>融合研究主题、各章节分工与时间规划</b>。
          </div>
          <div style="font-size:12.5px; color:#065f46; background:#ecfdf5; border:1px solid #a7f3d0; padding:10px 14px; border-radius:8px; font-weight:600;">
            👉 请小组成员仔细检查左侧公约内容（可直接在输入框微调修改），确认无误后点击下方【✍️ 确认签署公约】生效！
          </div>
        </div>
        <div style="background:#f8fafc; border-top:1px solid #e2e8f0; padding:14px 24px; display:flex; justify-content:flex-end;">
          <button class="modal-btn submit" id="btn-close-succ-modal" style="background:linear-gradient(135deg, #059669, #10b981); border:none; color:white; padding:8px 22px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer;">立即检查公约</button>
        </div>
      </div>
    `;
    document.body.appendChild(succModal);
    succModal.querySelector('#btn-close-succ-modal').addEventListener('click', () => succModal.remove());
    succModal.addEventListener('click', (e) => { if (e.target === succModal) succModal.remove(); });
  }

  async triggerStageWelcomeSpeech(stage) {
    const currUser = this.authManager ? this.authManager.getCurrentUser() : null;
    const isTeacher = currUser && (currUser.role === 'teacher' || currUser.isTeacher);
    // 🛡️ 铁律：教师端监控或尚未完成初次云端拉取前绝不触发开场白生成（防止刷新时冷启动空内存抢跑生成假新开场白）
    if (isTeacher || this.state.isTeacherMonitorView || this.state.isTeacherView) {
      return;
    }
    if (this.cloudSyncEngine && !this.cloudSyncEngine.isInitialPullDone) {
      return;
    }

    const effectiveClassId = (isTeacher ? this.state.activeClassId : this.state.activeStudentClassId) || currUser?.classId || 'class_101';
    const groupId = this.getEffectiveGroupId();
    let taskId = this.state.activeTaskId || (this.cloudSyncEngine ? this.cloudSyncEngine.taskId : `task_${effectiveClassId}_default`);
    if (!taskId || taskId === 'task_default') {
      taskId = `task_${effectiveClassId}_default`;
    }

    const welcomeFlagKey = `jizhi_welcomed_${taskId}_${groupId}_${stage}`;
    if (sessionStorage.getItem(welcomeFlagKey)) return;

    if (!this.state.chatLogs[stage]) this.state.chatLogs[stage] = [];
    const logs = this.state.chatLogs[stage];
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // 🎪 阶段一：拍卖师欢迎开场白
    if (stage === 'stage1') {
      const hasAuctioneerIntro = logs.some(m => m && (m.sender === 'auctioneer' || (m.id && String(m.id).includes('auctioneer'))) && (m.text?.includes('阶段一') || m.text?.includes('拍卖会') || m.text?.includes('拍卖师开场')));
      if (!hasAuctioneerIntro) {
        sessionStorage.setItem(welcomeFlagKey, '1');
        const welcomeMsg = {
          id: `msg_welcome_${taskId}_${groupId}_stage1`,
          classId: effectiveClassId,
          groupId: groupId,
          taskId: taskId,
          stage: 'stage1',
          sender: 'auctioneer',
          senderName: '学术拍卖师',
          text: `🎪 【拍卖师开场】：欢迎来到【阶段一：学术拍卖会】！我是本阶段的选题顾问拍卖师。\n请全组成员点击左侧【提交我的选题】提出各自的研究构想，并在研讨区充分交流。我们将通过拍卖投票遴选最佳提案，并在下方《学术合作公约》中商定分工与时间分配！`,
          timestamp: now,
          _timeMs: Date.now()
        };
        logs.unshift(welcomeMsg);
        this.sendSingleChatMessage(welcomeMsg, 'stage1');
        if (typeof window.renderChat === 'function') window.renderChat(this.state);
      } else {
        sessionStorage.setItem(welcomeFlagKey, '1');
      }
    }

    // 🤝 阶段二：必须小组真实已推进至阶段二（groupMaxStage 为 stage2/3 或公约已确认）时才触发
    else if (stage === 'stage2' && (this.state.groupMaxStage === 'stage2' || this.state.groupMaxStage === 'stage3' || this.state.stage1?.contract?.isConfirmed)) {
      const hasManagingIntro = logs.some(m => m && m.sender === 'managingEditor' && (m.text?.includes('欢迎来到【阶段二：学术编辑部】') || m.text?.includes('责任编辑开场')));
      if (!hasManagingIntro) {
        const s1 = this.state.stage1 || {};
        const topic = s1.mergedTitle || '未定课题';
        const tasks = s1.contract && s1.contract.taskAssignments ? s1.contract.taskAssignments : {};
        const times = s1.contract && s1.contract.timeAllocations ? s1.contract.timeAllocations : {};
        
        let assignSummary = [];
        let memberArr = Array.isArray(this.state.members) ? this.state.members : Object.values(this.state.members || {});
        memberArr.forEach(m => {
          if (!m) return;
          const t = tasks[m.id] || tasks[m.studentCode] || tasks[m.name] || '待认领';
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
          id: `msg_welcome_${taskId}_${groupId}_stage2_managing`,
          sender: 'managingEditor',
          senderName: '责任编辑 · 过程学伴',
          text: `🤝 【责任编辑开场】：欢迎来到【阶段二：学术编辑部】！全组已锁定研究主题《${topic}》。【公约分工与协同提醒】：${assignSummary.join(' | ') || '全员协作'}。各部分虽有分工侧重，更要主动研读同伴写下的段落、打通前后逻辑！请大家进入左侧富文本编辑器开启深度协作！`,
          timestamp: now,
          _timeMs: Date.now()
        };
        logs.unshift(managingWelcome);
        this.sendSingleChatMessage(managingWelcome, 'stage2');
        if (typeof window.renderChat === 'function') window.renderChat(this.state);

        setTimeout(() => {
          const reviewingWelcome = {
            id: `msg_welcome_${taskId}_${groupId}_stage2_reviewing`,
            sender: 'reviewingEditor',
            senderName: '审稿编辑 · 质量把关',
            text: `📝 【审稿编辑规范推送】：各位作者，为了方便大家自查，我已在界面顶部呈递了《课程学术参考范文库》，大家随时可以查阅学习标准的章节逻辑架构与学术行文规范哦！`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            _timeMs: Date.now()
          };
          logs.push(reviewingWelcome);
          this.sendSingleChatMessage(reviewingWelcome, 'stage2');
          if (typeof window.renderChat === 'function') window.renderChat(this.state);
        }, 3200);
      }
    }

    // 🎓 阶段三：严格按时序：① 中间委员开场 ➔ ② 正方肯定 ➔ ③ 反方质询 ➔ ④ 平台写入矩阵 ➔ ⑤ 中间委员抛题引导
    else if (stage === 'stage3') {
      const membersList = Object.values(this.state.members || {});
      const isLeaderClient = !membersList.length || (this.state.currentUser === membersList[0]?.studentCode || this.state.currentUser === membersList[0]?.id || this.state.currentUser === membersList[0]?.username);

      const hasProp = logs.some(m => m && m.sender === 'proponent');
      const hasOpp = logs.some(m => m && m.sender === 'opponent');
      const needsCommitteeReview = !hasProp || !hasOpp || !this.state.stage3.feedbackItems || this.state.stage3.feedbackItems.length === 0;

      if (needsCommitteeReview && isLeaderClient && !this._isStage3PipelineRunning) {
        this.runStage3CommitteePipeline();
      }
    }
  }

  async runStage3CommitteePipeline() {
    if (this._isStage3PipelineRunning) return;
    this._isStage3PipelineRunning = true;
    this.state.stage3CommitteeLoading = true;
    this.renderStudentWorkspace();

    try {
      if (!this.state.chatLogs.stage3) this.state.chatLogs.stage3 = [];
      const logs = this.state.chatLogs.stage3;
      const topic = (this.state.stage1 && this.state.stage1.mergedTitle) ? this.state.stage1.mergedTitle : '本组研究设计';
      let rawContent = (this.state.stage2 && this.state.stage2.unifiedContent) ? this.state.stage2.unifiedContent.replace(/<[^>]*>/g, '').trim() : '';
      if (!rawContent || rawContent.length < 50) {
        rawContent = `课题名称: ${topic}。正文涵盖背景意义、文献综述、问题与假设、研究设计与方法、反思等完整初稿。`;
      }

      // 1. 中间委员开场（如果尚未开场）
      const hasNeutralIntro = logs.some(m => m && m.sender === 'neutral' && (m.text?.includes('欢迎来到【阶段三') || m.text?.includes('中间委员开场')));
      if (!hasNeutralIntro) {
        const neutralWelcome = {
          id: `msg_welcome_${this.state.activeTaskId}_${this.state.currentUser}_stage3_neutral`,
          sender: 'neutral',
          senderName: '中间委员 · 裁决引导',
          text: `🟡 【中间委员开场】：各位研究者，欢迎来到【阶段三：答辩擂台】！初稿撰写完毕，答辩委员会已就位。正反两方评审专家正在通读审阅全篇论文，请大家稍候！`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          _timeMs: Date.now()
        };
        logs.push(neutralWelcome);
        this.sendSingleChatMessage(neutralWelcome, 'stage3');
        this.syncChatLogs();
        if (typeof window.renderChat === 'function') window.renderChat(this.state);
        // ⏱️ 预留 2.5 秒，让全组看清中间委员开场
        await new Promise(r => setTimeout(r, 2500));
      }

      // 2. 正方委员发表肯定意见
      const hasProp = logs.some(m => m && m.sender === 'proponent');
      let propText = '';
      if (!hasProp) {
        const propPrompt = `针对小组论文《${topic}》，请通读下方【小组当前真实正文草稿】全文，作为答辩委员会正方评审教授发表 130~150 字的肯定支持评审意见：
【基于真实正文的动态赞赏原则】：通读正文草稿全文，从 5 大赞赏维度（①行文风格与语言通顺、②选题与立意创新、③设计与方法严密、④实践落地与推广价值、⑤规范与术语统一）中，根据本篇论文的真实闪光点，动态灵活挑选 2~3 个最契合的核心亮点（必须至少 2 个，最多 3 个，严禁死板固化在某两个固定维度），紧扣具体学科与章节展开具体赞赏，为全组提供充实的正面论据支架！纯自然语言输出，130~150字。`;

        propText = await callCozeAgentAPI('proponent', propPrompt, { stage: 'stage3', topic, actualDoc: rawContent });
        if (!propText || propText.trim().length === 0) {
          propText = `🟢 【正方委员评审意见】：通读全篇，该研究展现出了极高的学术价值与实践意义！最出彩的地方体现在两点：①【选题与立意创新】：针对教学痛点提出的干预切口非常新颖独特；②【实践落地与推广价值】：方案在真实课堂中的教学活动设计可操作性极强，论据充分，为全组的深度协同点赞！`;
        }
        const propMsg = {
          sender: 'proponent',
          text: propText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          _timeMs: Date.now()
        };
        logs.push(propMsg);
        this.sendSingleChatMessage(propMsg, 'stage3');
        this.syncChatLogs();
        if (typeof window.renderChat === 'function') window.renderChat(this.state);
        // ⏱️ 预留 5.5 秒通读时间，让组员充分领会正方的肯定亮点
        await new Promise(r => setTimeout(r, 5500));
      } else {
        const existingProp = logs.find(m => m && m.sender === 'proponent');
        propText = existingProp ? existingProp.text : '';
      }

      // 3. 反方委员发表尖锐质询意见
      const hasOpp = logs.some(m => m && m.sender === 'opponent');
      let oppText = '';
      if (!hasOpp) {
        const oppPrompt = `针对小组论文《${topic}》，请通读下方【小组当前真实正文草稿】全文，结合正方委员刚才的肯定意见，作为答辩委员会反方评审教授发表 130~150 字的温和学术商榷质询意见：

【正方委员刚才的肯定意见参考】:
${propText}

【全局学术博弈红线与动态质询原则】：
1. 正方明确夸赞的具体局部段落与具体事实严禁唱反调；顺着正方赞赏的创新构想，可辩证审视其在真实教学中“落地可行性与实施挑战”；
2. 从 5 大质询维度（①具体设计落地的可行性与实施挑战、②行文风格割裂与语言表达通顺度、③变量操作化与测量工具严密性、④实验对照与变量控制逻辑、⑤正方未夸赞章节的行文与术语规范）中，根据本篇论文的真实薄弱处，动态灵活挑选 2~3 个最切中要害的质询点（必须至少 2 个，最多 3 个，严禁死板固化在某两个固定维度）；
3. 必须以清晰的序号 ① ② 分条呈现质询焦点；
4. 态度务必温和客气、极具建设性（多用“商讨/请教/小细节/落地可行性”）。纯自然语言输出，130~150字。`;

        oppText = await callCozeAgentAPI('opponent', oppPrompt, { stage: 'stage3', topic, actualDoc: rawContent });
        if (!oppText || oppText.trim().length === 0) {
          oppText = `🔴 【反方委员·商讨质询】：仔细研读了大家的成果，正方对该选题创新价值的肯定我非常赞同！在此基础上，我想从实证落地与行文严谨性的角度请教团队两个具体细节：①【具体设计/实施挑战】：在相关章节中，常态化教学中具体干预周期的落地性与认知负荷如何防范？②【行文风格/方法严密性】：在后续论述中，部分测量工具的信效度检验与前后行文风格需进一步规范。期待听听大家的从容思考与答辩~`;
        }
        const oppMsg = {
          sender: 'opponent',
          text: oppText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          _timeMs: Date.now()
        };
        logs.push(oppMsg);
        this.sendSingleChatMessage(oppMsg, 'stage3');
        this.syncChatLogs();
        if (typeof window.renderChat === 'function') window.renderChat(this.state);
        // ⏱️ 反方发言后微留 2 秒让组员看一眼反方要点
        await new Promise(r => setTimeout(r, 2000));
      } else {
        const existingOpp = logs.find(m => m && m.sender === 'opponent');
        oppText = existingOpp ? existingOpp.text : '';
      }

      // 4. 平台自动将正反评审意见【即刻同步写入】左侧【答辩裁决矩阵】
      const oppBody = (oppText || '').replace(/^[^\n]*?【[^】]+】[：:]?\s*/, '').trim();
      const oppMatches = oppBody.match(/[①②③④⑤][^①②③④⑤]*/g);
      const oppQueries = (oppMatches && oppMatches.length > 0)
        ? oppMatches.map(s => s.trim()).filter(s => s.length > 0)
        : [oppBody];
      this.state.stage3.feedbackItems = [
        { id: 'fb_prop', role: 'proponent', speaker: '正方委员 Agent (肯定支持)', title: '立论支持', content: propText.replace(/^[^\n]*?【[^】]+】[：:]?\s*/, ''), response: '', status: 'pending' }
      ];
      oppQueries.forEach((q, i) => {
        this.state.stage3.feedbackItems.push({
          id: 'fb_opp_' + (i + 1),
          role: 'opponent',
          speaker: '反方委员 Agent (尖锐质询)',
          title: '质询 ' + (i + 1),
          content: q,
          response: '',
          status: 'pending'
        });
      });
      this.state.stage3CommitteeLoading = false;
      this.syncStage3();
      this.syncChatLogs();
      if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
      renderChat(this.state);
      this.renderStudentWorkspace();
      // ⏱️ 矩阵就位后预留 3 秒通读思考，中间委员再出场下发第 1 题思路引导
      await new Promise(r => setTimeout(r, 3000));

      // 5. 中间委员独立调用 Coze API，引导第 1 题辩护
      const hasChairGuide = logs.some(m => m && m.sender === 'neutral' && (m.text?.includes('答辩思路引导') || m.text?.includes('质询 ①')));
      if (!hasChairGuide) {
        const chairPrompt = `答辩正反两方评审意见已入驻左侧矩阵。
【正方意见】: ${propText}
【反方质询】: ${oppText}

请作为答辩委员会主席（中间委员），发表 130~150 字的【针对质询 ① 独立答辩思路引导】：
① 宣布正反方评审已正式送达并入驻左侧矩阵，肯定正方的创新与实践价值，明确指出反方提出了针对实质询；
② 【单题独立引导·核心铁律】：本次只聚焦【质询 ①】，结合反方质询①的具体内容给出清晰的答辩破局/操作化补救思路支架（严禁提及或剧透质询②！）；
③ 引导全组在讨论区充分商讨，商定后由一位代表录入左侧矩阵！纯自然语言输出，130~150字。`;

        let chairText = await callCozeAgentAPI('neutral', chairPrompt, { stage: 'stage3', topic, prop: propText, opp: oppText, queryPoint: 1 });
        if (!chairText || chairText.trim().length === 0) {
          chairText = `🟡 【中间委员·针对质询 ① 答辩思路引导】：正反方评审已送达并入驻左侧矩阵！请大家通读正反方意见，首先聚焦【质询 ①】：建议结合正方提到的优势，在答辩中阐明针对质询①的具体破局与操作化补救思路！请全组在讨论区商定答辩词后，由一位代表录入左侧矩阵！`;
        }

        const chairMsg = {
          sender: 'neutral',
          text: chairText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          _timeMs: Date.now()
        };
        logs.push(chairMsg);
        this.sendSingleChatMessage(chairMsg, 'stage3');
        this.syncChatLogs();
        if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
        if (typeof window.renderChat === 'function') window.renderChat(this.state);
      }
    } catch (err) {
      console.error('Stage 3 committee pipeline error:', err);
    } finally {
      this.state.stage3CommitteeLoading = false;
      this._isStage3PipelineRunning = false;
      this.renderStudentWorkspace();
    }
  }

  switchStage(newStage, isMilestoneAdvance = false) {
    this.lastLocalStageChangeTime = Date.now();
    const stageOrder = { stage1: 1, stage2: 2, stage3: 3 };

    const s1 = this.state.stage1 || {};
    const s2 = this.state.stage2 || {};
    const s3 = this.state.stage3 || {};

    const isContractSigned = !!(s1.contract?.signed || s1.contract?.isConfirmed || (Array.isArray(s1.contract?.confirmedMembers) && s1.contract.confirmedMembers.length > 0));
    const isDraftDone = !!(s2.isDraftConfirmed || (s2.meetingSubmissions && Object.keys(s2.meetingSubmissions).length > 0) || this.state.groupMaxStage === 'stage3' || this.state.isFinalSubmitted);
    const isStage3Active = !!(this.state.groupMaxStage === 'stage3' || this.state.isFinalSubmitted || isDraftDone || (s3.confirmedMembers && Object.keys(s3.confirmedMembers).length > 0) || (s3.finalSubmittedMembers && Object.keys(s3.finalSubmittedMembers).length > 0));

    let currentGroupMax = this.state.groupMaxStage || 'stage1';
    if (isStage3Active) {
      currentGroupMax = 'stage3';
      this.state.groupMaxStage = 'stage3';
    } else if (isContractSigned || currentGroupMax === 'stage2') {
      currentGroupMax = 'stage2';
      this.state.groupMaxStage = 'stage2';
    }

    const currentGroupOrder = stageOrder[currentGroupMax] || 1;
    const targetOrder = stageOrder[newStage] || 1;

    const allTasks = (this.authManager) ? this.authManager.getTasks() : [];
    const currentTaskObj = allTasks.find(t => t.id === this.state.activeTaskId);
    const isTaskDeadlineExpired = isTaskExpired(currentTaskObj);

    // 🛡️ 阶段防越权门禁：未达成里程碑解锁时，禁止学生随意点击跳级（截止只读查阅模式下或已归档时全阶段自由放行浏览）
    if (!isTaskDeadlineExpired && !this.state.isFinalSubmitted && newStage === 'stage2' && !isMilestoneAdvance && !isContractSigned && currentGroupOrder < 2) {
      alert('⚠️ 暂未解锁【阶段二：学术编辑部】！\n请先在阶段一完成学术公约的签署与分工确认，方可进入阶段二。');
      return;
    }

    if (!isTaskDeadlineExpired && !this.state.isFinalSubmitted && targetOrder > currentGroupOrder && !isMilestoneAdvance) {
      const stageTitles = { stage2: '【阶段二：学术编辑部】', stage3: '【阶段三：答辩擂台】' };
      alert(`⚠️ 暂未解锁 ${stageTitles[newStage] || newStage}！\n必须先在当前阶段完成公约签署与阶段任务后，系统将自动全组解锁推进。`);
      return;
    }

    // 🛡️ 阶段一公约草案锁存：离开阶段一前，主动收集当前 DOM 上所有最新输入框值并立即持久化落盘
    if (this.state.currentStage === 'stage1') {
      const topicInp = document.getElementById('contract-topic-input');
      if (topicInp) {
        if (!this.state.stage1) this.state.stage1 = {};
        this.state.stage1.mergedTitle = topicInp.value;
      }
      const timeInps = document.querySelectorAll('.contract-time-input');
      if (timeInps.length > 0) {
        if (!this.state.stage1.contract) this.state.stage1.contract = {};
        if (!this.state.stage1.contract.timeAllocations) this.state.stage1.contract.timeAllocations = {};
        timeInps.forEach(inp => {
          const k = inp.dataset.key;
          if (k) this.state.stage1.contract.timeAllocations[k] = Number(inp.value) || 0;
        });
      }
      const taskInps = document.querySelectorAll('.task-assignment-input');
      if (taskInps.length > 0) {
        if (!this.state.stage1.contract) this.state.stage1.contract = {};
        if (!this.state.stage1.contract.taskAssignments) this.state.stage1.contract.taskAssignments = {};
        taskInps.forEach(inp => {
          const mk = inp.dataset.mkey;
          if (mk) this.state.stage1.contract.taskAssignments[mk] = inp.value;
        });
      }
      this.syncStage1();
      if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
    }

    // 🛡️ 正文草稿锁存：切换前从 Etherpad 实时提取最新全文存入内存与快照，绝不丢字，并供阶段三智能体深度分析
    if (this.state.currentStage === 'stage2') {
      const activeTaskId = this.state.activeTaskId || 'task_default';
      const currentUser = this.authManager ? this.authManager.getCurrentUser() : null;
      const effectiveClassId = this.state.activeStudentClassId || (currentUser?.classId || 'class_101');
      const activeGroupObj = this.authManager ? this.authManager.getStudentActiveGroup(currentUser, effectiveClassId) : null;
      const currentGroupId = activeGroupObj?.id || (currentUser?.groupId || 'group_1');
      const padName = `jizhi_${activeTaskId}_${currentGroupId}`;
      try {
        fetch(`sync.php?action=get_pad_text&padId=${padName}`)
          .then(res => res.json())
          .then(data => {
            if (data && data.success && data.text) {
              if (!this.state.stage2) this.state.stage2 = {};
              this.state.stage2.unifiedContent = data.text;
            }
          })
          .catch(() => {});
      } catch (e) {}
    }

    this.isViewingPastStage = (targetOrder < currentGroupOrder);
    this.state.currentStage = newStage;
    if (isMilestoneAdvance && targetOrder > currentGroupOrder) {
      this.state.groupMaxStage = newStage;
      this.isViewingPastStage = false;
    }
    if (newStage === 'stage2' && (!this.state.stage2 || !this.state.stage2.stageStartTime)) {
      if (!this.state.stage2) this.state.stage2 = {};
      this.state.stage2.stageStartTime = Date.now();
    }
    if (newStage === 'stage3' && (!this.state.stage3 || !this.state.stage3.stageStartTime)) {
      if (!this.state.stage3) this.state.stage3 = {};
      this.state.stage3.stageStartTime = Date.now();
    }
    this.syncStageChange(newStage);
    this.triggerStageWelcomeSpeech(newStage);
    this.renderStudentWorkspace(true);
  }

  setSpeed(newSpeed) {
    this.state.timer.speed = newSpeed;
    const currentUser = this.authManager.getCurrentUser();
    renderHeader(
      this.state, currentUser, this.authManager.getAnnouncements(),
      (s) => this.switchStage(s), (sp) => this.setSpeed(sp),
      () => this.handleLogout(), () => this.switchToTeacherView(),
      () => this.showAnnouncementModal(), () => this.showQuestionnaireModal(),
      () => this.backToTaskList()
    );
  }

  renderStudentWorkspace(isForced = false) {
    if (this.state.studentViewMode === 'task_list') {
      this.renderMain();
      return;
    }
    const isStageTransition = (this._lastRenderedStage !== this.state.currentStage);
    this._lastRenderedStage = this.state.currentStage;
    if (isStageTransition) isForced = true;

    const currentUser = this.authManager.getCurrentUser();
    const effectiveClassId = this.state.activeStudentClassId || (currentUser?.classId || 'class_101');
    const activeGroupObj = this.authManager.getStudentActiveGroup(currentUser, effectiveClassId);
    const currentGroupId = activeGroupObj.id || (currentUser && currentUser.groupId ? currentUser.groupId : 'group_1');

    this.state.members = this.authManager.getGroupMembersForWorkspace(currentGroupId);
    this.state.currentUser = currentUser ? (currentUser.studentCode || 'A') : 'A';

    renderHeader(
      this.state, currentUser, this.authManager.getAnnouncements(),
      (s) => this.switchStage(s), (sp) => this.setSpeed(sp),
      () => this.handleLogout(), () => this.switchToTeacherView(),
      () => this.showAnnouncementModal(), () => this.showQuestionnaireModal(),
      () => this.backToTaskList()
    );

    // 🔔 检查并通知当前任务的延期
    if (this.authManager) {
      const allTasks = this.authManager.getTasks();
      const currentTask = allTasks.find(t => t.id === this.state.activeTaskId);
      if (currentTask && currentTask.deadline) {
        const dlKey = `jizhi_known_deadline_${currentTask.id}`;
        const unreadKey = `jizhi_unread_deadline_ext_${currentTask.id}`;
        const prevDl = localStorage.getItem(dlKey);
        const newDlMs = new Date(currentTask.deadline.replace(/-/g, '/')).getTime();
        let shouldNotify = false;
        if (localStorage.getItem(unreadKey)) {
          shouldNotify = true;
          localStorage.removeItem(unreadKey);
        } else if (prevDl) {
          const prevDlMs = Number(prevDl);
          if (newDlMs > prevDlMs + 60000) {
            shouldNotify = true;
          }
        }
        localStorage.setItem(dlKey, String(newDlMs));

        if (shouldNotify) {
          showGlobalBannerNotice(
            `指导教师已延长本任务写作时间！`,
            `截止时间已自动更新至：${formatStandardDateDash(currentTask.deadline)}，剩余时间已增加。`
          );
        }
      }
      // 记录其他任务的未读延期标记
      allTasks.forEach(t => {
        if (!t || !t.id || t.id === this.state.activeTaskId || !t.deadline) return;
        const dlKey = `jizhi_known_deadline_${t.id}`;
        const prevDl = localStorage.getItem(dlKey);
        const newDlMs = new Date(t.deadline.replace(/-/g, '/')).getTime();
        if (prevDl && newDlMs > Number(prevDl) + 60000) {
          localStorage.setItem(`jizhi_unread_deadline_ext_${t.id}`, '1');
          localStorage.setItem(dlKey, String(newDlMs));
        }
      });
    }

    // 默认自动触发当前阶段对应智能体的开场白（如果尚未发送）
    this.triggerStageWelcomeSpeech(this.state.currentStage || 'stage1');

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

      const allUsers = this.authManager ? this.authManager.getUsers() : [];
      const myIds = new Set([this.state.currentUser, currentUser?.id, currentUser?.studentCode, currentUser?.username].filter(Boolean));
      const hasSubmittedMyProposal = s1.proposals.some(p => myIds.has(p.author) || (currentUser && (p.authorName === currentUser.name || p.author === currentUser.name)));

      const btnOpenProp = document.getElementById('btn-open-submit-proposal');
      if (btnOpenProp) {
        btnOpenProp.innerText = hasSubmittedMyProposal ? '✏️ 修改我的选题' : '+ 提交我的选题';
      }

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
                const authorUser = allUsers.find(u => u.id === p.author || u.studentCode === p.author || u.username === p.author || u.name === p.author || u.name === p.authorName);
                const authorName = (authorUser ? authorUser.name : null) || p.authorName || (this.state.members[p.author] ? this.state.members[p.author].name : p.author);
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
      const handlers = {
        onVote: (propId) => { this.handleVoteCast(propId); },
        onRefresh: () => { this.renderStudentWorkspace(); },
        onContractChange: () => { this.syncStage1(); },
        onAiGenerateContract: () => { this.handleAiGenerateContract(); },
        onConfirmContract: () => {
          const user = this.state.currentUser;
          const s1 = this.state.stage1 || {};
          if (!s1.contract) s1.contract = {};
          if (!s1.contract.confirmedMembers) s1.contract.confirmedMembers = {};

          let memberArr = [];
          if (Array.isArray(this.state.members)) memberArr = this.state.members;
          else if (this.state.members && typeof this.state.members === 'object') memberArr = Object.values(this.state.members);
          if (memberArr.length === 0 && this.authManager) {
            const u = this.authManager.getCurrentUser();
            const effClassId = this.state.activeStudentClassId || u?.classId || 'class_101';
            const effGroup = this.authManager.getStudentActiveGroup(u, effClassId);
            memberArr = this.authManager.getGroupMembersForWorkspace(effGroup?.id || 'group_1', effClassId);
          }
          const currMemObj = memberArr.find(m => m && (m.id === user || m.studentCode === user || m.username === user || m.name === user));
          const memberName = currMemObj ? currMemObj.name : user;
          const totalMembersCount = Math.max(memberArr.length, 2);

          // 检查当前点击的用户自己是否已经签署过
          const userAlreadySigned = !!(s1.contract.confirmedMembers[user] || (currMemObj && (s1.contract.confirmedMembers[currMemObj.id] || s1.contract.confirmedMembers[currMemObj.studentCode] || (currMemObj.name && s1.contract.confirmedMembers[currMemObj.name]))));

          if (userAlreadySigned && s1.contract.isConfirmed) {
            alert('🔒 学术合作公约已被全员确认签署并锁定！您可以随时点击上方【阶段二：学术编辑部】或下方按钮开始写作。');
            return;
          }
          if (userAlreadySigned) {
            alert(`✅ 您 (${memberName}) 此前已完成签署确认！正在等待组内其他同学签署。`);
            return;
          }

          // 写入当前用户的签署记录
          s1.contract.confirmedMembers[user] = true;
          if (currMemObj) {
            if (currMemObj.id) s1.contract.confirmedMembers[currMemObj.id] = true;
            if (currMemObj.studentCode) s1.contract.confirmedMembers[currMemObj.studentCode] = true;
            if (currMemObj.name) s1.contract.confirmedMembers[currMemObj.name] = true;
          }

          const confirmedCount = memberArr.filter(m => m && (s1.contract.confirmedMembers[m.id] || s1.contract.confirmedMembers[m.studentCode] || (m.name && s1.contract.confirmedMembers[m.name]))).length;

          const confirmMsg = {
            sender: user,
            senderName: memberName,
            text: `📢 [公约签署告知]: 我 (${memberName}) 已按键确认签署合作学术公约！（全组确认进度: ${confirmedCount}/${totalMembersCount} 人）`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            _timeMs: Date.now()
          };
          if (!this.state.chatLogs.stage1) this.state.chatLogs.stage1 = [];
          this.state.chatLogs.stage1.push(confirmMsg);

          if (confirmedCount >= totalMembersCount) {
            s1.contract.isConfirmed = true;
            this.state.groupMaxStage = 'stage2';
            const finalMsg = {
              sender: 'auctioneer',
              senderName: '头脑风暴 · 学术拍卖师',
              text: `🎪 【拍卖师宣布】：🎉 恭喜！组内全员 ${totalMembersCount}/${totalMembersCount} 名成员已全部完成公约签署确认！学术合作公约正式生效，阶段一圆满结束！请同学们点击上方【阶段二：学术编辑部】或下方按钮开始正文撰写！`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              _timeMs: Date.now()
            };
            this.state.chatLogs.stage1.push(finalMsg);
            this.syncStage1();
            this.syncChatLogs();
            this.syncStageChange('stage2');
            if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
            alert(`🎉 恭喜！组内全部 ${totalMembersCount} 位成员已全部完成公约签署！\n\n学术合作公约正式生效锁定！您可以随时点击上方导航栏【阶段二：学术编辑部】或下方按钮进入开始写作。`);
          } else {
            this.syncStage1();
            this.syncChatLogs();
            if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
            alert(`✅ 您 (${memberName}) 已成功签署学术合作公约！\n\n当前全组签署进度：${confirmedCount}/${totalMembersCount} 人已签署。\n⚠️ 需全组所有成员均完成签署后公约才正式生效锁定，请提醒组内其他同学尽快签署。`);
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
          this.lastPlainTextLength = 0;
          Object.keys(this.state.members || {}).forEach(mId => {
            this.state.stage2.memberContributions[mId] = 0;
          });
        } else {
          const prevLen = (this.lastPlainTextLength === undefined) ? plain.length : this.lastPlainTextLength;
          const delta = plain.length - prevLen;
          this.lastPlainTextLength = plain.length;
          if (delta > 0) {
            this.state.stage2.memberContributions[user] = (this.state.stage2.memberContributions[user] || 0) + delta;
          }
        }

        const currUserObj = (this.authManager) ? this.authManager.getCurrentUser() : null;
        if (!this.state.presence) this.state.presence = {};
        const myKeys = [user, currUserObj?.id, currUserObj?.studentCode, currUserObj?.username, currUserObj?.name].filter(Boolean);
        const nowMs = Date.now();
        myKeys.forEach(k => {
          this.state.presence[k] = {
            nodeIndex: 0,
            activeSection: '正在撰写正文',
            updatedAt: nowMs
          };
        });

        // 🚀 稳健极速同步：打字期间防抖 500ms 自动保存并推送到云端数据库
        if (this._contentSyncDebounceTimer) {
          clearTimeout(this._contentSyncDebounceTimer);
        }
        this._contentSyncDebounceTimer = setTimeout(() => {
          this.updateContributionUi();
          this.syncStage2();
          if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
          this.checkAgentTriggersOnContent(cleanHtml);
        }, 500);
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
      onConfirmStage2Draft: () => {
        if (!this.state.stage2) this.state.stage2 = {};
        const s2 = this.state.stage2;
        if (s2.isDraftConfirmed) {
          alert('🔒 正文初稿已被组内全员确认！已解锁阶段三。');
          return;
        }
        const user = this.state.currentUser || 'A';

        let memberArr = [];
        if (Array.isArray(this.state.members)) memberArr = this.state.members;
        else if (this.state.members && typeof this.state.members === 'object') memberArr = Object.values(this.state.members);
        if (memberArr.length === 0 && this.authManager) {
          const u = this.authManager.getCurrentUser();
          const effClassId = this.state.activeStudentClassId || u?.classId || 'class_101';
          const effGroup = this.authManager.getStudentActiveGroup(u, effClassId);
          memberArr = this.authManager.getGroupMembersForWorkspace(effGroup?.id || 'group_1');
        }
        const totalMembersCount = memberArr.length > 0 ? memberArr.length : 3;

        // 🛡️ 极速状态合并：提取本地持久化与内存中已有所有确认记录，防止并发冲刷
        const groupId = (typeof this.getEffectiveGroupId === 'function') ? this.getEffectiveGroupId() : (this.state.activeGroupId || 'group_1');
        const cachedRaw = localStorage.getItem(`jizhi_group_state_${groupId}`);
        if (cachedRaw) {
          try {
            const cachedState = JSON.parse(cachedRaw);
            if (cachedState && cachedState.stage2 && cachedState.stage2.confirmedMembers) {
              s2.confirmedMembers = { ...(cachedState.stage2.confirmedMembers || {}), ...(s2.confirmedMembers || {}) };
            }
          } catch(e) {}
        }
        if (!s2.confirmedMembers) s2.confirmedMembers = {};

        const isMemDone = (map, m) => {
          if (!map || !m) return false;
          return !!(map[m.id] || map[m.studentCode] || map[m.username] || (m.name && map[m.name]));
        };
        const currMemObj = memberArr.find(m => m && (m.id === user || m.studentCode === user || m.username === user || m.name === user));
        if (currMemObj) {
          if (currMemObj.id) s2.confirmedMembers[currMemObj.id] = true;
          if (currMemObj.studentCode) s2.confirmedMembers[currMemObj.studentCode] = true;
          if (currMemObj.username) s2.confirmedMembers[currMemObj.username] = true;
          if (currMemObj.name) s2.confirmedMembers[currMemObj.name] = true;
        } else {
          s2.confirmedMembers[user] = true;
        }

        const confirmedCount = memberArr.filter(m => isMemDone(s2.confirmedMembers, m)).length;
        const memberName = currMemObj ? currMemObj.name : user;
        const confirmMsg = {
          sender: user,
          senderName: memberName,
          text: `📢 [初稿确认告知]: 我 (${memberName}) 已确认完成正文初稿！（全组初稿确认进度: ${confirmedCount}/${totalMembersCount} 人）`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          _timeMs: Date.now()
        };
        if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
        this.state.chatLogs.stage2.push(confirmMsg);

        // 📝 审稿编辑终审把关兜底触发：只要有组员开始确认初稿，立刻自动送达审稿编辑终审质检反馈
        if (!this.state.stage2RefFormatReviewed) {
          this.state.stage2RefFormatReviewed = true;
          const refReviewMsg = {
            sender: 'reviewingEditor',
            text: `📝 【审稿编辑·终稿行文扫描诊断】：小组成员已开始发起初稿定稿确认！在最后收尾阶段，我重点对全文语言表达与行文规范进行了全维度扫描：①【行文与语体】：整体论述连贯，建议再次通读检查是否有口语化表达；②【错别字与标点】：重点核对前后术语与标点规范。请大家完成最后通读后，在上方逐一完成初稿确认，准备迎接终审答辩！`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            _timeMs: Date.now() + 100
          };
          this.state.chatLogs.stage2.push(refReviewMsg);
        }

        this.syncStage2();
        this.syncChatLogs();
        if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
        renderChat(this.state);
        this.renderStudentWorkspace();

        // 🛡️ 严格要求：必须全组成员每一个人都点击确认初稿后，才解锁推进至阶段三
        if (confirmedCount < totalMembersCount) {
          alert(`✅ 您 (${memberName}) 已成功确认正文初稿！\n\n当前组内确认进度：${confirmedCount}/${totalMembersCount} 人已确认。\n⚠️ 必须全组所有成员均完成确认后，系统才会正式解锁【阶段三：答辩擂台】！请提醒组内其他同学尽快确认。`);
        } else {
          s2.isDraftConfirmed = true;
          this.state.groupMaxStage = 'stage3';
          const currentUserObj = this.authManager ? this.authManager.getCurrentUser() : null;
          const activeTaskId = this.state.activeTaskId || 'task_default';
          const userGroupId = (currentUserObj && currentUserObj.groupId) ? currentUserObj.groupId : 'group_1';
          if (this.authManager && this.authManager.markAllTaskAnnouncementsRead) {
            this.authManager.markAllTaskAnnouncementsRead(activeTaskId, userGroupId);
          }

          // 责任编辑立即在阶段二聊天记录中正式宣布全员确认完毕
          const finalMsg = {
            sender: 'managingEditor',
            senderName: '责任编辑 · 过程学伴',
            text: `🎉 【责任编辑宣布】：恭喜！组内全员 ${totalMembersCount}/${totalMembersCount} 名成员已全部确认正文初稿定稿！阶段二圆满结束，系统已全员解锁【阶段三：答辩擂台】！请大家点击顶部导航进入阶段三开始答辩！`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            _timeMs: Date.now() + 50
          };
          if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
          this.state.chatLogs.stage2.push(finalMsg);
          this.syncStage2();
          this.syncChatLogs();
          if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
          renderChat(this.state);
          this.renderStudentWorkspace();

          alert(`🎉 恭喜！组内全员 (${totalMembersCount}/${totalMembersCount} 人) 已全部完成初稿确认！\n\n系统已全组解锁【阶段三：答辩擂台】！请随时点击顶部导航栏中的【阶段三：答辩擂台】进入答辩。`);
        }
        this.renderStudentWorkspace();
      },
      onConfirmStage3Revision: () => {
        const user = this.state.currentUser || 'A';
        const s3 = this.state.stage3;
        let memberArr = [];
        if (Array.isArray(this.state.members)) memberArr = this.state.members;
        else if (this.state.members && typeof this.state.members === 'object') memberArr = Object.values(this.state.members);
        if (memberArr.length === 0 && this.authManager) {
          const u = this.authManager.getCurrentUser();
          const effClassId = this.state.activeStudentClassId || u?.classId || 'class_101';
          const effGroup = this.authManager.getStudentActiveGroup(u, effClassId);
          memberArr = this.authManager.getGroupMembersForWorkspace(effGroup?.id || 'group_1');
        }
        const totalMembersCount = memberArr.length > 0 ? memberArr.length : 3;

        if (!s3.confirmedMembers) s3.confirmedMembers = {};
        s3.confirmedMembers[user] = true;
        const currMemObj = memberArr.find(m => m && (m.id === user || m.studentCode === user || m.username === user || m.name === user));
        if (currMemObj) {
          if (currMemObj.id) s3.confirmedMembers[currMemObj.id] = true;
          if (currMemObj.studentCode) s3.confirmedMembers[currMemObj.studentCode] = true;
          if (currMemObj.username) s3.confirmedMembers[currMemObj.username] = true;
          if (currMemObj.name) s3.confirmedMembers[currMemObj.name] = true;
        }

        const confirmedCount = memberArr.filter(m => m && (s3.confirmedMembers[m.id] || s3.confirmedMembers[m.studentCode] || s3.confirmedMembers[m.username] || (m.name && s3.confirmedMembers[m.name]))).length;
        const memberName = currMemObj ? currMemObj.name : user;
        const confirmMsg = {
          sender: user,
          senderName: memberName,
          text: `📢 [答辩确认]: 我 (${memberName}) 已确认完成答辩，准备进入终稿修改！（全组确认进度: ${confirmedCount}/${totalMembersCount} 人）`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          _timeMs: Date.now()
        };
        if (!this.state.chatLogs.stage3) this.state.chatLogs.stage3 = [];
        this.state.chatLogs.stage3.push(confirmMsg);

        if (confirmedCount >= totalMembersCount) {
          s3.isRevisionConfirmed = true;
          const promptMsg = {
            sender: 'neutral',
            text: `🎉 【中间委员宣布】：恭喜！组内全员 ${totalMembersCount}/${totalMembersCount} 人已全部确认完成答辩！【修改论文终稿】面板已正式解锁！请组员切换至【📝 修改论文终稿】面板完善正文，修改完毕后由代表点击【🚀 提交论文终稿】完成归档！`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            _timeMs: Date.now() + 50
          };
          this.state.chatLogs.stage3.push(promptMsg);
          this.syncStage3();
          this.syncChatLogs();
          if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
          this.renderStudentWorkspace();
          renderChat(this.state);
          alert(`🎉 恭喜！组内全员 (${totalMembersCount}/${totalMembersCount} 人) 已全部完成答辩确认！\n\n【修改论文终稿】面板已正式解锁！请切换至终稿面板协同修改并提交。`);
        } else {
          this.syncStage3();
          this.syncChatLogs();
          if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
          this.renderStudentWorkspace();
          renderChat(this.state);
          alert(`✅ 您 (${memberName}) 已成功确认完成答辩！\n\n当前组内答辩确认进度：${confirmedCount}/${totalMembersCount} 人已确认。\n⚠️ 必须全组所有成员均完成确认后，系统才会正式解锁【修改论文终稿】面板！请提醒组内其他同学尽快确认。`);
        }
      },
      onSwitchStage3Tab: (tabKey) => {
        this.state.stage3.activeTab = tabKey;
        this.syncStage3();
        this.renderStudentWorkspace();
      },
      onSaveDirectFeedback: async (id, respText) => {
        if (this.state.isFinalSubmitted || this.state.stage3?.isRevisionConfirmed) {
          alert('🔒 全组已全员确认进入终稿修改或已提交终稿，答辩裁决矩阵已处于锁定归档模式！无法再修改答辩结论。');
          return;
        }
        if (this._isSavingDirectFeedback) return;
        this._isSavingDirectFeedback = true;

        try {
          const items = this.state.stage3.feedbackItems || [];
          const currentIndex = items.findIndex(f => f.id === id);
          const item = items[currentIndex];

          if (item) {
            item.status = 'adopted';
            item.response = respText;
            const currentStage = this.state.currentStage || 'stage3';
            const currentUser = this.state.currentUser;

            const isProp = item.role === 'proponent';
            const labelTitle = isProp ? '专家立论支持' : (item.title || `质询 ${currentIndex}`);
            const discMsg = {
              sender: currentUser,
              text: `📢 [答辩质询研讨结论]: 组内已对【${item.speaker} - ${labelTitle}】完成答辩并达成共识：“${respText}”！`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              _timeMs: Date.now()
            };
            if (!this.state.chatLogs[currentStage]) this.state.chatLogs[currentStage] = [];
            this.state.chatLogs[currentStage].push(discMsg);
            this.syncStage3();
            this.syncChatLogs();
            if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
            this.renderStudentWorkspace();
            renderChat(this.state);

            // 只有反方质询且有未完成项时才顺推
            const unadoptedOppCount = items.filter(f => f.role === 'opponent' && (!f.response || f.response.trim().length === 0)).length;
            const topic = (this.state.stage1 && this.state.stage1.mergedTitle) ? this.state.stage1.mergedTitle : '论文方案';
            
            const adoptedSummaries = items.map((f, i) => `• 质询${i + 1}【${f.speaker}】: ${f.response || '待录入'}`).join('\n');

            let queryPrompt = '';
            if (unadoptedOppCount > 0) {
              const nextItem = items.find(f => f.role === 'opponent' && (!f.response || f.response.trim().length === 0));
              const nextIndex = items.indexOf(nextItem);
              queryPrompt = `小组成员刚对已完成的质询录入并达成了答辩共识：“${respText}”。
请作为答辩委员会主席（中间委员），发表 130~150 字的【针对质询 ${nextIndex} 独立答辩思路顺推】：
① 肯定前序答辩词已成功录入；
② 【单题独立顺推·核心铁律】：独立引导全组将焦点转向下一项【质询 ${nextIndex}（${nextItem.content || nextItem.title}）】，结合其具体内容给出针对性的答辩思路支架（如补强措施/量表信度说明/补救预案）；
③ 引导全组继续在讨论区商定思路，由代表录入矩阵，并同步将修改落实到论文终稿中！纯自然语言输出，130~150字。`;
            } else {
              queryPrompt = `恭喜！小组成员已对全部答辩质询完成研讨并录入全部答辩陈述！
全组答辩共识汇总：\n${adoptedSummaries}

请作为答辩委员会主席（中间委员），发表 130~150 字的【答辩终审总结裁决与交卷指引】：
① 宣布答辩委员会已审阅全组提交的全部答辩陈述与终稿，肯定全组面对质询展现出的学术反思与严谨论证逻辑；
② 隆重宣布答辩全票顺利通过，祝贺大家圆满完成研究任务；
③ 明确指引全组成员点击左侧【提交终稿】锁定入库！纯自然语言输出，130~150字。`;
            }

            let neutralReply = await callCozeAgentAPI('neutral', queryPrompt, { stage: 'stage3', topic });
            if (!neutralReply || neutralReply.trim().length === 0) {
              if (unadoptedOppCount > 0) {
                const nextItem = items.find(f => f.role === 'opponent' && (!f.response || f.response.trim().length === 0));
                const nextIndex = items.indexOf(nextItem);
                neutralReply = `🟡 【中间委员·针对质询 ${nextIndex} 答辩思路顺推】：前序答辩词已成功录入！👉 接下来请全组将焦点转向【质询 ${nextIndex}】：建议在答辩中明确阐述针对该质询的具体补强措施与设计说明！请全组继续在讨论区商定思路，由代表录入矩阵，并同步将修改落实到论文终稿中！`;
              } else {
                neutralReply = `🟡 【中间委员·答辩终审总结与裁决】：各位研究者，答辩委员会已审阅了全组提交的全部答辩陈述与终稿！团队在面对质询时展现出了扎实的学术反思与严谨的论证逻辑。答辩全票顺利通过，祝贺大家圆满完成研究任务！请全组成员点击左侧【提交终稿】锁定入库！`;
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
            if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
            renderChat(this.state);
          }
        } finally {
          this._isSavingDirectFeedback = false;
        }
      },

      onFinalSubmit: () => { 
        if (this.state.isFinalSubmitted) {
          alert('🔒 论文终稿已于此前成功全员提交！目前处于全盘只读归档模式，可随时切页查阅各阶段记录。');
          return;
        }
        const user = this.state.currentUser || 'A';
        const s3 = this.state.stage3;
        let memberArr = [];
        if (Array.isArray(this.state.members)) memberArr = this.state.members;
        else if (this.state.members && typeof this.state.members === 'object') memberArr = Object.values(this.state.members);
        if (memberArr.length === 0 && this.authManager) {
          const u = this.authManager.getCurrentUser();
          const effClassId = this.state.activeStudentClassId || u?.classId || 'class_101';
          const effGroup = this.authManager.getStudentActiveGroup(u, effClassId);
          memberArr = this.authManager.getGroupMembersForWorkspace(effGroup?.id || 'group_1');
        }
        const totalMembersCount = memberArr.length > 0 ? memberArr.length : 3;

        if (!s3.finalSubmittedMembers) s3.finalSubmittedMembers = {};
        s3.finalSubmittedMembers[user] = true;
        const currMemObj = memberArr.find(m => m && (m.id === user || m.studentCode === user || m.username === user || m.name === user));
        if (currMemObj) {
          if (currMemObj.id) s3.finalSubmittedMembers[currMemObj.id] = true;
          if (currMemObj.studentCode) s3.finalSubmittedMembers[currMemObj.studentCode] = true;
          if (currMemObj.username) s3.finalSubmittedMembers[currMemObj.username] = true;
          if (currMemObj.name) s3.finalSubmittedMembers[currMemObj.name] = true;
        }

        const finalSubmittedCount = memberArr.filter(m => m && (s3.finalSubmittedMembers[m.id] || s3.finalSubmittedMembers[m.studentCode] || s3.finalSubmittedMembers[m.username] || (m.name && s3.finalSubmittedMembers[m.name]))).length;
        const memberName = currMemObj ? currMemObj.name : user;
        const currentStage = this.state.currentStage || 'stage3';

        const submitMsg = {
          sender: user,
          senderName: memberName,
          text: `📢 [终稿提交确认]: 我 (${memberName}) 已确认提交论文终稿！（全组终稿提交确认进度: ${finalSubmittedCount}/${totalMembersCount} 人）`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          _timeMs: Date.now()
        };
        if (!this.state.chatLogs[currentStage]) this.state.chatLogs[currentStage] = [];
        this.state.chatLogs[currentStage].push(submitMsg);

        if (finalSubmittedCount >= totalMembersCount) {
          this.state.isFinalSubmitted = true;
          s3.isRevisionConfirmed = true;
          const currentUserObj = this.authManager ? this.authManager.getCurrentUser() : null;
          const activeTaskId = this.state.activeTaskId || 'task_default';
          const userGroupId = (currentUserObj && currentUserObj.groupId) ? currentUserObj.groupId : 'group_1';

          if (this.authManager && this.authManager.markAllTaskAnnouncementsRead) {
            this.authManager.markAllTaskAnnouncementsRead(activeTaskId, userGroupId);
          }

          const neutralFinalMsg = {
            sender: 'neutral',
            text: `🏆 【中间委员·答辩终审总结与祝贺】：热烈祝贺全组成员 (${totalMembersCount}/${totalMembersCount} 人) 已全部确认提交论文终稿！本组正文与答辩成果已正式全盘锁定归档呈递至教师端！请各位同学点击上方【📋 打开问卷填写界面】完成问卷！`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            _timeMs: Date.now() + 50
          };
          this.state.chatLogs[currentStage].push(neutralFinalMsg);

          this.syncStage3();
          this.syncChatLogs();
          if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
          this.renderStudentWorkspace();
          renderChat(this.state);

          alert(`🎉 恭喜！组内全员 (${totalMembersCount}/${totalMembersCount} 人) 已全部确认提交论文终稿！\n\n本组期末论文与答辩成果已正式归档提交至教师端！请每位同学填写课程体验评估问卷。`);
          setTimeout(() => {
            this.showQuestionnaireModal();
          }, 500);
        } else {
          this.syncStage3();
          this.syncChatLogs();
          if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
          this.renderStudentWorkspace();
          renderChat(this.state);

          alert(`✅ 您 (${memberName}) 已成功确认提交论文终稿！\n\n当前组内终稿提交确认进度：${finalSubmittedCount}/${totalMembersCount} 人已确认。\n⚠️ 必须全组所有成员均完成确认提交后，系统才会正式将终稿归档提交至教师端！请提醒组内其他同学尽快确认提交。`);
        }
      }
    };
    this.handlers = handlers;
    this.onConfirmStage2Draft = handlers.onConfirmStage2Draft;
    renderCanvas(this.state, handlers);
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
    if (currentStage !== 'stage2') return;

    if (!this.state.stage2) this.state.stage2 = {};
    const s2 = this.state.stage2;
    if (!s2.reviewMilestone) s2.reviewMilestone = 'none';

    const logs = this.state.chatLogs[currentStage] || [];
    const now = Date.now();
    const lastReviewingMsg = logs.slice().reverse().find(m => m.sender === 'reviewingEditor');
    const timeSinceLastReviewing = lastReviewingMsg ? (now - (lastReviewingMsg._timeMs || 0)) : 999999;

    // ⏱️ 计算阶段二物理时间进度比例（双轨保底）
    const times = (this.state.stage1 && this.state.stage1.contract && this.state.stage1.contract.timeAllocations) ? this.state.stage1.contract.timeAllocations : {};
    const totalPlannedMin = (times.background || 25) + (times.literature || 30) + (times.questions || 25) + (times.method || 40) + (times.reflection || 20) + (times.references || 10);
    const totalPlannedMs = totalPlannedMin * 60 * 1000;
    const stage2DurationMs = s2.startTime ? (now - s2.startTime) : 0;
    const isTimeOver35Pct = totalPlannedMs > 0 && stage2DurationMs >= (totalPlannedMs * 0.35);
    const isTimeOver85Pct = totalPlannedMs > 0 && stage2DurationMs >= (totalPlannedMs * 0.85);

    const rawDoc = newContent.replace(/<[^>]*>/g, '').trim();

    // ═══════════════════════════════════════════════════════════════
    // 🛡️ 严格阶梯时序门禁 1: 审稿编辑【一审】（初审微调质检）
    // 仅在初始态 'none' 时由单端触发一次，严禁多端并发重复触发
    // ═══════════════════════════════════════════════════════════════
    const s2ChatList = this.state.chatLogs?.stage2 || [];
    const hasFirstReviewInLogs = s2ChatList.some(m => m.sender === 'reviewingEditor' && (m.text.includes('初审') || m.text.includes('Research Gap')));
    if (hasFirstReviewInLogs && (s2.reviewMilestone === 'none' || s2.reviewMilestone === 'first_review_in_progress')) {
      s2.reviewMilestone = 'first_review_done';
      this.syncStage2();
    }

    const hasLayer2MethodSection = /(?:二、|三、|四、|第2章|第3章|第4章|设计|方法|路径|方案|实证|模型|过程|实施|框架|量表|样本|实验|调研|问卷|干预)/i.test(newContent);
    const isReview1MilestoneReached = (rawDoc.length >= 800) || (hasLayer2MethodSection && rawDoc.length >= 500) || (isTimeOver35Pct && rawDoc.length >= 300);
    
    // 单端触发仲裁：由组内排序第一位成员作为代表发起大模型请求，避免组员双端同时调起产生重复消息
    const membersList = Object.values(this.state.members || {});
    const isLeaderClient = !membersList.length || (this.state.currentUser === membersList[0]?.studentCode || this.state.currentUser === membersList[0]?.id || this.state.currentUser === membersList[0]?.username);

    if (!hasFirstReviewInLogs && s2.reviewMilestone === 'none' && isReview1MilestoneReached && timeSinceLastReviewing > 30000 && !this._isTriggeringFirstReview) {
      if (!isLeaderClient && membersList.length > 1) {
        return; // 非领头客户端等待领头客户端触发并同步
      }
      this._isTriggeringFirstReview = true;
      s2.reviewMilestone = 'first_review_in_progress';
      this.syncStage2();
      if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();

      const topic = (this.state.stage1 && this.state.stage1.mergedTitle) ? this.state.stage1.mergedTitle : '本组课题';
      const methodIndex = rawDoc.search(/(?:四、|第4章|第四部分|研究方法|研究设计)/i);
      const contentSnippet = (methodIndex > 200) ? rawDoc.slice(0, methodIndex).trim() : rawDoc;

      setTimeout(async () => {
        try {
          const firstReviewPrompt = `团队正在协同撰写课题《${topic}》，目前已完成立意与前序章节起草。
请通读下方【小组当前真实正文草稿】，作为国家级教育期刊资深审稿编辑，进行实质性学术初审质检（【全局红线】：顺应尊重已有构思框架，做局部微调，严禁推翻大改！严禁预设具体统计工具，定量/定性/方案均适用）：
① 肯定当前已写章节的立意、现实价值与文献梳理脉络；
② 审查研究述评（Research Gap）是否找准，启发将前文综述的理论概念与后续核心研究问题/待测变量清晰对齐；
③ 指出 1~2 处可深化的具体细节（如核心概念界定或近三年权威文献论据）。严禁空泛套话，纯自然语言输出，130~150字。`;
          let firstReviewText = await callCozeAgentAPI('reviewingEditor', firstReviewPrompt, { stage: 'stage2', topic, actualDoc: contentSnippet });
          if (!firstReviewText || firstReviewText.trim().length === 0) {
            firstReviewText = `📝 【审稿编辑·初审学术质检】：审阅了大家目前撰写的正文草稿，背景立意非常扎实，文献综述的脉络梳理清晰！建议重点优化以下两点：① 进一步凝练研究述评（Gap），将前文文献直接引向核心研究问题与假设；② 统一各组员在背景与综述中使用的核心概念界定。请全组继续稳步推进！`;
          }
          s2.firstReviewText = firstReviewText;
          s2.reviewMilestone = 'first_review_done';

          const firstReviewMsg = {
            sender: 'reviewingEditor',
            text: firstReviewText,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            _timeMs: Date.now()
          };
          if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
          this.state.chatLogs.stage2.push(firstReviewMsg);
          this.syncChatLogs();
          this.syncStage2();
          if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
          renderChat(this.state);
        } finally {
          this._isTriggeringFirstReview = false;
        }
      }, 600);
      return;
    }

    // ═══════════════════════════════════════════════════════════════
    // 🛡️ 严格阶梯时序门禁 2: 责任编辑【半程会议号召】
    // 必须在【一审完成后】(first_review_done)，且写到反思或字数达标才触发
    // ═══════════════════════════════════════════════════════════════
    const hasMeetingCalledInLogs = s2ChatList.some(m => m.sender === 'managingEditor' && m.text.includes('半程会议号召'));
    if (hasMeetingCalledInLogs && s2.reviewMilestone === 'first_review_done') {
      s2.reviewMilestone = 'meeting_called';
      this.syncStage2();
    }

    const hasLayer3ReflectionSection = /(?:五、|六、|第5章|第6章|讨论|反思|不足|局限|展望|结论|总结|对策|建议)/i.test(newContent);
    const isMeetingMilestoneReached = (rawDoc.length >= 2200) || (hasLayer3ReflectionSection && rawDoc.length >= 1500);
    const lastManagingMsg = logs.slice().reverse().find(m => m.sender === 'managingEditor');
    const timeSinceLastManaging = lastManagingMsg ? (now - (lastManagingMsg._timeMs || 0)) : 999999;

    if (!hasMeetingCalledInLogs && s2.reviewMilestone === 'first_review_done' && isMeetingMilestoneReached && timeSinceLastManaging > 30000) {
      if (!isLeaderClient && membersList.length > 1) {
        return;
      }
      s2.reviewMilestone = 'meeting_called';
      const meetingCallMsg = {
        sender: 'managingEditor',
        text: `🤝 【责任编辑·半程会议号召】：关注到全组方案与方法设计已基本成型，并逐步推进至反思讨论阶段！请大家停下各自打字，通读搭档负责的模块，点击上方【📢 发起编辑会议】完成全篇综合学术审计打卡。稍后审稿专家将结合全组情况为大家进行深度内容质检并下发【半程修正清单】！`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        _timeMs: now
      };
      if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
      this.state.chatLogs.stage2.push(meetingCallMsg);
      this.syncChatLogs();
      this.syncStage2();
      if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
      renderChat(this.state);
      return;
    }

    // ═══════════════════════════════════════════════════════════════
    // 🛡️ 严格阶梯时序门禁 3: 审稿编辑【三审·终审行文扫描】
    // 必须在【半程会议清单下发修改之后】(checklist_issued)，且【检测到撰写参考文献章节】时即刻触发！
    // ═══════════════════════════════════════════════════════════════
    const hasFinalReviewInLogs = s2ChatList.some(m => m.sender === 'reviewingEditor' && m.text.includes('终稿行文扫描'));
    if (hasFinalReviewInLogs && s2.reviewMilestone === 'checklist_issued') {
      s2.reviewMilestone = 'final_review_done';
      this.syncStage2();
    }

    const hasReferencesSection = /(?:六、|第6章|第六部分)?\s*(?:参考文献|References)/i.test(newContent);

    if (!hasFinalReviewInLogs && s2.reviewMilestone === 'checklist_issued' && hasReferencesSection && timeSinceLastReviewing > 30000) {
      if (!isLeaderClient && membersList.length > 1) {
        return;
      }
      s2.reviewMilestone = 'final_review_done';
      const refReviewMsg = {
        sender: 'reviewingEditor',
        text: `📝 【审稿编辑·终稿行文扫描诊断】：看到全组已进入最后【参考文献】的收尾阶段，整体方案非常完整！在最后定稿阶段，我对全文语言表达进行了全维度扫描：①【行文与学术语体】：部分章节中存在个别口语化表述与长句语病，建议润色为客观规范的第三人称学术语体；②【术语与概念】：前后核心概念表述需统一，建议全组通读逐一订正；③【参考文献】：核对基本著录规范。请全组成员完成通读润色后，在上方逐一完成【初稿确认】，准备迎接终审答辩！`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        _timeMs: now
      };
      if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
      this.state.chatLogs.stage2.push(refReviewMsg);
      this.syncChatLogs();
      this.syncStage2();
      if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
      renderChat(this.state);
    }

    // 3. 🤝 责任编辑 Agent: 字数贡献比严重偏斜提醒 (SSRL 共享调节)
    // 智能全维度过滤：
    // ① 必须至少有 2 名及以上组员【当前真实在线活跃】（30秒内有心跳/操作），如果人都不在线则绝不自言自语汇报！
    // ② 每次提醒后至少间隔 15 分钟 (900秒) 冷却期；
    // ③ 正文相比上次提醒至少新增推进了 150 字；
    const presence = this.state.presence || {};
    const activeOnlineCount = membersList.filter(m => {
      const p = presence[m.studentCode] || presence[m.id];
      return p && (now - (p.updatedAt || 0) < 30000); // 30秒内有活跃操作判定为在线
    }).length;

    const plainLen = newContent.replace(/<[^>]*>/g, '').trim().length;
    const lastWarnTime = this.state.lastSSRLWarnTimeMs || 0;
    const lastWarnLen = this.state.lastSSRLWarnLen || 0;
    const allTasks = (this.authManager) ? this.authManager.getTasks() : [];
    const curTask = allTasks.find(t => t.id === this.state.activeTaskId);
    const totalAllocMinutes = Object.values((this.state.stage1 && this.state.stage1.contract && this.state.stage1.contract.timeAllocations) || {}).reduce((a, b) => a + Number(b || 0), 0);
    const taskDurMin = (curTask && curTask.durationMinutes) ? Number(curTask.durationMinutes) : (totalAllocMinutes || 60);
    const ssrlCooldownMs = taskDurMin < 60 ? 210000 : (taskDurMin <= 180 ? 360000 : 600000);
    const minNewProgressLen = taskDurMin < 60 ? 100 : (taskDurMin <= 180 ? 200 : 400);
    const minContribThreshold = taskDurMin < 60 ? 150 : (taskDurMin <= 180 ? 300 : 600);
    const cooldownPassed = (now - lastWarnTime) >= ssrlCooldownMs;
    const hasMeaningfulProgress = (plainLen - lastWarnLen) >= minNewProgressLen; // 且写了新内容

    if (plainLen >= minContribThreshold && membersList.length >= 2 && cooldownPassed && (lastWarnTime === 0 || hasMeaningfulProgress)) {
      const contribs = this.state.stage2.memberContributions || {};
      let totalContrib = 0;
      membersList.forEach(m => { totalContrib += (contribs[m.id] || contribs[m.studentCode] || 0); });

      if (totalContrib >= minContribThreshold || plainLen >= minContribThreshold) {
        // 方案 A 规则：检查是否存在显著失衡：某位成员占比 >= 55%，且有成员贡献率 <= 15%
        const pcts = membersList.map(m => {
          const val = (contribs[m.id] || contribs[m.studentCode] || 0);
          return (totalContrib > 0) ? Math.round((val / totalContrib) * 100) : 0;
        });
        const hasMaxSkew = Math.max(...pcts) >= 55;
        const hasZeroMember = Math.min(...pcts) <= 15;

        if (hasMaxSkew && hasZeroMember) {
          this.state.lastSSRLWarnTimeMs = now; // 记录本次提醒时间，开启自适应静默期
          this.state.lastSSRLWarnLen = plainLen;
          const ssrlWarningMsg = {
            sender: 'managingEditor',
            text: `🤝 【责任编辑·协同关怀】：关注到当前正文撰写推进中，各成员的投入占比出现了一定程度的分化。建议全组同学在讨论区适度协调分工，鼓励尚未充分动笔的同学认领后续章节，共同推进高质量学术成稿哦~`,
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
    const currUser = this.authManager ? this.authManager.getCurrentUser() : null;
    const userKey = currUser ? (currUser.studentCode || currUser.id || 'A') : (this.state.currentUser || 'A');
    let actualGroupMembers = [];
    if (this.authManager) {
      const effClassId = this.state.activeStudentClassId || currUser?.classId || 'class_101';
      const effGroup = this.authManager.getStudentActiveGroup(currUser, effClassId);
      actualGroupMembers = this.authManager.getGroupMembersForWorkspace(effGroup?.id || this.state.activeGroupId || 'group_1');
    }
    const membersList = actualGroupMembers.length > 0 ? actualGroupMembers : Object.values(this.state.members || {});
    const subs = this.state.stage2?.meetingSubmissions || {};
    const subCount = Object.keys(subs).length;
    const totalCount = membersList.length || 2;

    const existingSub = subs[userKey] || (currUser?.name && subs[currUser.name]) || (currUser?.studentCode && subs[currUser.studentCode]) || (currUser?.id && subs[currUser.id]) || (this.state.currentUser && subs[this.state.currentUser]);
    const isCurrentUserSubmitted = !!existingSub;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="teacher-modal-card" style="width:660px; max-height:85vh; display:flex; flex-direction:column;">
        <div class="teacher-modal-header ann-theme">
          <div class="modal-header-title"><span class="modal-icon">📢</span><div><h3>学术编辑部 ·【半程全篇综合学术审计会议】</h3><p>全篇互阅 · 构思对齐 · 前后贯通 · 文风统一 · 攻克瓶颈</p></div></div>
          <button class="modal-close-btn" id="btn-close-meeting">✕</button>
        </div>
        <div class="teacher-modal-body" style="overflow-y:auto; padding:16px 20px; display:flex; flex-direction:column; gap:12px;">
          <!-- 全组成员打卡状态矩阵胶囊 -->
          <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:8px 14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
            <span style="font-size:12px; font-weight:800; color:#1e40af;">👥 全组打卡进度 (${subCount}/${totalCount}人):</span>
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
              ${membersList.map(m => {
                const uid = String(m.id || m.studentCode || m.userId || '').trim();
                const isSub = !!(subs[uid] || subs[m.name] || subs[m.studentCode] || subs[m.id]);
                return `<span style="font-size:11px; padding:2px 8px; border-radius:10px; font-weight:700; background:${isSub ? '#ecfdf5' : '#ffffff'}; color:${isSub ? '#059669' : '#64748b'}; border:1px solid ${isSub ? '#a7f3d0' : '#cbd5e1'};">
                  ${isSub ? '✅' : '⏳'} ${escapeHtml(m.name)}: ${isSub ? '已打卡' : '待打卡'}
                </span>`;
              }).join('')}
            </div>
          </div>

          <!-- 1. 全篇综合自查审计 -->
          <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:10px; padding:14px 16px; display:flex; flex-direction:column; gap:12px;">
            <div style="font-size:13px; font-weight:800; color:#1e40af;">📋 一、全篇跨作者交叉审视自查（请跳出单一分工，通读全篇后打卡）</div>
            
            <!-- Q1: 个人构思契合度 (3档) -->
            <div style="background:#ffffff; padding:10px 14px; border-radius:8px; border:1px solid #e2e8f0; display:flex; flex-direction:column; gap:6px;">
              <label style="font-size:12.5px; color:#1e293b; font-weight:700;">🎯 1. 【个人构思契合度】目前全组写出来的方案，和你自己最初预想的构思是否一致？</label>
              <select id="meeting-ideation-select" class="teacher-input" style="width:100%; padding:6px 10px; font-size:12px; border-radius:6px; border:1px solid #cbd5e1; background:#ffffff;">
                <option value="完全符合最初构思">✅ 完全符合最初构思（目前的推进方向和我的设想完全契合）</option>
                <option value="局部偏离最初构思">🔄 局部偏离最初构思（部分章节的切入角度或深度和我最初想的有些不一样）</option>
                <option value="明显偏离最初构思">⚠️ 明显偏离最初构思（整体方案与我最初的构想差异很大，需全组重新对齐）</option>
              </select>
              <div id="meeting-ideation-sections-box" style="background:#fffbeb; padding:8px 12px; border-radius:6px; border:1px solid #fef3c7; display:none; flex-direction:column; gap:4px; margin-top:4px;">
                <label style="font-size:11.5px; color:#92400e; font-weight:700;">📌 针对第 1 题：您觉得具体是哪些章节偏离了您最初的设想？(可多选)</label>
                <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:2px;">
                  <label style="font-size:11.5px; color:#451a03; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="ideation-sec" value="一、背景与意义"> 【一、背景意义】</label>
                  <label style="font-size:11.5px; color:#451a03; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="ideation-sec" value="二、文献综述"> 【二、文献综述】</label>
                  <label style="font-size:11.5px; color:#451a03; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="ideation-sec" value="三、研究问题与假设"> 【三、问题假设】</label>
                  <label style="font-size:11.5px; color:#451a03; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="ideation-sec" value="四、研究设计与方法"> 【四、设计方法】</label>
                  <label style="font-size:11.5px; color:#451a03; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="ideation-sec" value="五、不足与反思"> 【五、不足反思】</label>
                </div>
              </div>
            </div>

            <!-- Q2: 全篇前后连贯度 (3档) -->
            <div style="background:#ffffff; padding:10px 14px; border-radius:8px; border:1px solid #e2e8f0; display:flex; flex-direction:column; gap:6px;">
              <label style="font-size:12.5px; color:#1e293b; font-weight:700;">🔗 2. 【全篇前后连贯度】目前各章节写出来的内容，前后是否衔接一致？</label>
              <select id="meeting-transition-select" class="teacher-input" style="width:100%; padding:6px 10px; font-size:12px; border-radius:6px; border:1px solid #cbd5e1; background:#ffffff;">
                <option value="前后衔接非常自然">✅ 前后衔接非常自然（各章节环环相扣，逻辑自然连贯）</option>
                <option value="存在局部脱节衔接不顺">🔄 存在局部脱节衔接不顺（部分章节之间过渡生硬，前后内容未能完全呼应）</option>
                <option value="前后多处严重脱节矛盾">⚠️ 前后多处严重脱节矛盾（多处章节脱节，前后论述自相矛盾）</option>
              </select>
              <div id="meeting-transition-sections-box" style="background:#eff6ff; padding:8px 12px; border-radius:6px; border:1px solid #dbeafe; display:none; flex-direction:column; gap:4px; margin-top:4px;">
                <label style="font-size:11.5px; color:#1e40af; font-weight:700;">🔗 针对第 2 题：具体是哪几处之间衔接脱节？(可多选多处)</label>
                <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:2px;">
                  <label style="font-size:11.5px; color:#1e3a8a; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="trans-div-sec" value="背景到综述 (第一至二章)"> 【第一至二章 (背景➔综述)】</label>
                  <label style="font-size:11.5px; color:#1e3a8a; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="trans-div-sec" value="综述到假设 (第二至三章)"> 【第二至三章 (综述➔假设)】</label>
                  <label style="font-size:11.5px; color:#1e3a8a; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="trans-div-sec" value="假设到方法 (第三至四章)"> 【第三至四章 (假设➔方法)】</label>
                  <label style="font-size:11.5px; color:#1e3a8a; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="trans-div-sec" value="方法到反思 (第四至五章)"> 【第四至五章 (方法➔反思)】</label>
                </div>
              </div>
            </div>

            <!-- Q3: 文风与专业术语 (3档) -->
            <div style="background:#ffffff; padding:10px 14px; border-radius:8px; border:1px solid #e2e8f0; display:flex; flex-direction:column; gap:6px;">
              <label style="font-size:12.5px; color:#1e293b; font-weight:700;">🎨 3. 【文风与专业术语】全篇语言文风与专业词汇是否统一？</label>
              <select id="meeting-style-select" class="teacher-input" style="width:100%; padding:6px 10px; font-size:12px; border-radius:6px; border:1px solid #cbd5e1; background:#ffffff;">
                <option value="文风严谨术语统一">✅ 文风严谨术语统一（全篇均采用规范客观的学术第三人称，术语命名一致）</option>
                <option value="局部存在文风/术语割裂">🔄 局部存在文风/术语割裂（部分章节偏口语化，或同一术语前后叫法不同）</option>
                <option value="文风口语化严重/术语混乱">⚠️ 文风口语化严重/术语混乱（多处章节使用“我们觉得”等第一人称口语，术语冲突多）</option>
              </select>
              <div id="meeting-style-sections-box" style="background:#f5f3ff; padding:8px 12px; border-radius:6px; border:1px solid #ddd6fe; display:none; flex-direction:column; gap:4px; margin-top:4px;">
                <label style="font-size:11.5px; color:#6d28d9; font-weight:700;">🎨 针对第 3 题：您觉得哪些章节需要重点润色文风或统一术语？(可多选)</label>
                <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:2px;">
                  <label style="font-size:11.5px; color:#4c1d95; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="style-div-sec" value="一、背景与意义"> 【一、背景意义】</label>
                  <label style="font-size:11.5px; color:#4c1d95; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="style-div-sec" value="二、文献综述"> 【二、文献综述】</label>
                  <label style="font-size:11.5px; color:#4c1d95; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="style-div-sec" value="三、研究问题与假设"> 【三、问题假设】</label>
                  <label style="font-size:11.5px; color:#4c1d95; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="style-div-sec" value="四、研究设计与方法"> 【四、设计方法】</label>
                  <label style="font-size:11.5px; color:#4c1d95; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="style-div-sec" value="五、不足与反思"> 【五、不足反思】</label>
                </div>
              </div>
            </div>
          </div>

          <!-- Q4: 核心通俗瓶颈自查 -->
          <div style="background:#ffffff; border:1px solid #cbd5e1; border-radius:10px; padding:12px 16px; display:flex; flex-direction:column; gap:6px;">
            <label style="font-size:12.5px; font-weight:700; color:#0f172a;">💡 4. 【核心瓶颈自查】当前全篇最让大家卡壳、最难写的是什么？(单选)</label>
            <select id="meeting-bottleneck-academic" class="teacher-input" style="width:100%; padding:6px 10px; font-size:12px; border-radius:6px; border:1px solid #cbd5e1; background:#ffffff;">
              <option value="方法与问题不搭：不知道该怎么设计方法/量表来回答前面的研究问题">方法与问题不搭：不知道该怎么设计方法/量表来回答前面的研究问题</option>
              <option value="理论与文献不足：找不到足够的文献依据，理论支撑单薄">理论与文献不足：找不到足够的文献依据，理论支撑单薄</option>
              <option value="方案步骤不清晰：不知道具体的研究对象、实施过程该怎么写具体">方案步骤不清晰：不知道具体的研究对象、实施过程该怎么写具体</option>
              <option value="局限与反思卡壳：不知道该怎么客观分析方案的不足和潜在问题">局限与反思卡壳：不知道该怎么客观分析方案的不足和潜在问题</option>
            </select>
          </div>

          <!-- Q5: 整体质量打星 -->
          <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:12px 16px; display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:12.5px; font-weight:700; color:#0f172a;">🌟 5. 【整体质量自评】全篇整体学术质量与严谨度打分：</span>
            <div class="rating-stars" id="star-rating-logic" style="font-size:22px; cursor:pointer; user-select:none;">
              <span class="star" data-val="1" style="color:#f59e0b;">★</span>
              <span class="star" data-val="2" style="color:#f59e0b;">★</span>
              <span class="star" data-val="3" style="color:#f59e0b;">★</span>
              <span class="star" data-val="4" style="color:#f59e0b;">★</span>
              <span class="star" data-val="5" style="color:#475569;">★</span>
            </div>
          </div>

          <!-- Q6: 一句话修改聚焦 -->
          <div class="teacher-form-group" style="margin:0;">
            <label style="font-size:12.5px; font-weight:700; color:#0f172a;">📝 6. 【一句话修改聚焦】写下一处你认为全组目前最急需合力修改的具体问题：</label>
            <input id="meeting-input-text" class="teacher-input" style="width:100%; padding:6px 10px; font-size:12px; border-radius:6px; border:1px solid #cbd5e1; box-sizing:border-box;" placeholder="例如：在第4章方法中补齐针对第3章假设的测量维度，并统一第1章口语化表述...">
          </div>
        </div>
        <div class="teacher-modal-footer" style="padding:12px 20px; border-top:1px solid #e2e8f0; display:flex; justify-content:flex-end; gap:10px;">
          <button class="modal-btn cancel" id="btn-cancel-meeting">关闭</button>
          <button class="modal-btn submit ann-theme" id="btn-submit-meeting" ${isCurrentUserSubmitted ? 'disabled style="background:#ecfdf5; border:1px solid #a7f3d0; color:#059669; font-weight:800; cursor:default; box-shadow:none;"' : ''}>
            ${isCurrentUserSubmitted ? '✅ 您已完成打卡 (已提交)' : '🚀 提交打卡并生成【半程编辑修正清单】'}
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // 🛡️ 若已提交过，回填历史选择数据供查阅
    if (existingSub) {
      if (existingSub.ideationConsistency) modal.querySelector('#meeting-ideation-select').value = existingSub.ideationConsistency;
      if (existingSub.transitionState) modal.querySelector('#meeting-transition-select').value = existingSub.transitionState;
      if (existingSub.styleState) modal.querySelector('#meeting-style-select').value = existingSub.styleState;
      if (existingSub.bAcademic) modal.querySelector('#meeting-bottleneck-academic').value = existingSub.bAcademic;
      if (existingSub.userText) modal.querySelector('#meeting-input-text').value = existingSub.userText;
      if (Array.isArray(existingSub.ideationSections)) {
        modal.querySelectorAll('input[name="ideation-sec"]').forEach(cb => { cb.checked = existingSub.ideationSections.includes(cb.value); });
      }
      if (Array.isArray(existingSub.transSections)) {
        modal.querySelectorAll('input[name="trans-div-sec"]').forEach(cb => { cb.checked = existingSub.transSections.includes(cb.value); });
      }
      if (Array.isArray(existingSub.styleSections)) {
        modal.querySelectorAll('input[name="style-div-sec"]').forEach(cb => { cb.checked = existingSub.styleSections.includes(cb.value); });
      }
    }

    const closeModal = () => document.body.removeChild(modal);
    modal.querySelector('#btn-close-meeting').addEventListener('click', closeModal);
    modal.querySelector('#btn-cancel-meeting').addEventListener('click', closeModal);

    // 联动展开逻辑
    const ideationSel = modal.querySelector('#meeting-ideation-select');
    const ideationBox = modal.querySelector('#meeting-ideation-sections-box');
    ideationSel.addEventListener('change', () => {
      ideationBox.style.display = ideationSel.value.includes('偏离') ? 'flex' : 'none';
    });

    const transSel = modal.querySelector('#meeting-transition-select');
    const transBox = modal.querySelector('#meeting-transition-sections-box');
    transSel.addEventListener('change', () => {
      transBox.style.display = transSel.value.includes('脱节') ? 'flex' : 'none';
    });

    const styleSel = modal.querySelector('#meeting-style-select');
    const styleBox = modal.querySelector('#meeting-style-sections-box');
    styleSel.addEventListener('change', () => {
      styleBox.style.display = (styleSel.value.includes('割裂') || styleSel.value.includes('混乱') || styleSel.value.includes('口语')) ? 'flex' : 'none';
    });

    let overallRating = 4;
    modal.querySelectorAll('#star-rating-overall .star').forEach(s => {
      s.addEventListener('click', (e) => {
        overallRating = Number(e.target.dataset.val);
        modal.querySelectorAll('#star-rating-overall .star').forEach(st => {
          const v = Number(st.dataset.val);
          st.style.color = v <= overallRating ? '#f59e0b' : '#475569';
        });
      });
    });

    modal.querySelector('#btn-submit-meeting').addEventListener('click', async () => {
      const ideationConsistency = modal.querySelector('#meeting-ideation-select').value;
      const transitionState = modal.querySelector('#meeting-transition-select').value;
      const styleState = modal.querySelector('#meeting-style-select').value;
      const ideationSections = Array.from(modal.querySelectorAll('input[name="ideation-sec"]:checked')).map(cb => cb.value);
      const transSections = Array.from(modal.querySelectorAll('input[name="trans-div-sec"]:checked')).map(cb => cb.value);
      const styleSections = Array.from(modal.querySelectorAll('input[name="style-div-sec"]:checked')).map(cb => cb.value);
      const currUser = this.authManager ? this.authManager.getCurrentUser() : null;
      const userKey = currUser ? (currUser.studentCode || currUser.id || 'A') : (this.state.currentUser || 'A');
      const memberName = currUser ? currUser.name : (this.state.members[userKey]?.name || userKey);

      // 🛡️ 真实组员人数：从 authManager 严格获取当前工作区绑定的组内真实学生列表
      let actualGroupMembers = [];
      if (this.authManager) {
        const effClassId = this.state.activeStudentClassId || currUser?.classId || 'class_101';
        const effGroup = this.authManager.getStudentActiveGroup(currUser, effClassId);
        actualGroupMembers = this.authManager.getGroupMembersForWorkspace(effGroup?.id || this.state.activeGroupId || 'group_1');
      }
      const totalMembersCount = Math.max(actualGroupMembers.length, Object.keys(this.state.members || {}).length, 2);

      if (!this.state.stage2.meetingSubmissions) this.state.stage2.meetingSubmissions = {};
      this.state.stage2.meetingSubmissions[userKey] = {
        user: userKey,
        name: memberName,
        ideationConsistency,
        transitionState,
        styleState,
        ideationSections,
        transSections,
        styleSections,
        bAcademic,
        overallRating,
        userText,
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

      // 🛡️ 严格单次幂等门禁：若全组已播报过分歧，绝对不再重复调起
      if (this.state.stage2.hasBroadcastedMeetingDivergence) {
        this.syncStage2();
        if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
        this.renderStudentWorkspace();
        return;
      }
      this.state.stage2.hasBroadcastedMeetingDivergence = true;

      // ── 全员打卡完毕：汇聚全组数据并由责任编辑播报分歧（匿名宏观，不点具体人名） ──
      const topic = (this.state.stage1 && this.state.stage1.mergedTitle) ? this.state.stage1.mergedTitle : '本组课题';
      const allSubs = Object.values(submissions);
      
      const allIdeationSecs = Array.from(new Set(allSubs.flatMap(s => s.ideationSections || [])));
      const allTransSecs = Array.from(new Set(allSubs.flatMap(s => s.transSections || [])));
      const allStyleSecs = Array.from(new Set(allSubs.flatMap(s => s.styleSections || [])));
      
      const hasIdeationDev = allSubs.some(s => (s.ideationConsistency || '').includes('偏离'));
      const hasTransDev = allSubs.some(s => (s.transitionState || '').includes('脱节'));
      const hasStyleDev = allSubs.some(s => (s.styleState || '').includes('割裂') || (s.styleState || '').includes('混乱') || (s.styleState || '').includes('口语'));

      const primaryAcademicB = allSubs[0].bAcademic || '方法与问题对齐与实施设计';
      const questionsList = allSubs.filter(s => s.userText).map(s => `“${s.userText}”`).join('；') || '暂无补充提问';

      let transFocusText = allTransSecs.length > 0 ? allTransSecs.map(s => `【${s}】`).join('、') : '【假设 ↔ 方法】';
      let ideationFocusText = allIdeationSecs.length > 0 ? allIdeationSecs.map(s => `【${s}】`).join('、') : '部分核心章节';
      let styleFocusText = allStyleSecs.length > 0 ? allStyleSecs.map(s => `【${s}】`).join('、') : '【一、背景与意义】与【三、研究问题与假设】';

      this.syncStage2();
      if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
      this.renderStudentWorkspace();

      alert(`✅ 你 (${memberName}) 已成功提交半程自查与互阅打卡！\n\n目前组内已打卡：${submittedCount}/${totalMembersCount} 人。\n全组成员已集齐！责任编辑已在右侧研讨区梳理出本组自查认知分歧，请组员先在讨论区针对分歧商讨对齐，稍后审稿专家将为大家深度质检并下发【半程修正清单】！`);

      // 2. 异步调用扣子【责任编辑】Coze API: 匿名化宏观总结与分歧引导
      const avgOverallRating = (allSubs.reduce((sum, s) => sum + (s.overallRating || 5), 0) / (allSubs.length || 1)).toFixed(1);
      const managingPrompt = `全组成员已全部完成半程全篇综合自查打卡（共 ${totalMembersCount} 人）：
• 课题: 《${topic}》
• 个人构思契合度: ${hasIdeationDev ? `部分成员反馈方案局部偏离最初设想（涉及: ${ideationFocusText}）` : '全员高度符合最初设想'}
• 全篇前后连贯度: ${hasTransDev ? `多数成员明确指出存在前后脱节（涉及: ${transFocusText}）` : '全篇前后衔接自然'}
• 文风语体与术语: ${hasStyleDev ? `组内反馈存在口语化与术语不统一（涉及: ${styleFocusText}）` : '全篇文风严谨术语统一'}
• 核心学术瓶颈: ${primaryAcademicB}
• 整体质量自评打星: 均分 ${avgOverallRating} 星 / 5 星
• 组内补充建议与提问: ${questionsList}

请作为学术编辑部责任编辑（协同主持人与学伴）发表一段客观、充实、富有启发性的发言（字数控制在 130~150 字，严禁敷衍，严禁点具体学生人名，用“部分成员反馈/多数同学指出”）：
1. 肯定全组认真通读了全篇已有内容，宏观呈现诊断共识：
   ① 列出构思偏差与多处脱节焦点（如 ${transFocusText}）；
   ② 点出文风语体需统一的章节（如 ${styleFocusText}），若质量打分较高则顺带肯定整体质量；
2. 给出实用的 1 句话研讨切入指引（建议大家先别急于单干改字，先在讨论区围绕核心脱节商讨 2 分钟，把思路对齐后再动手）；
3. 预告审稿专家正在通读全篇草稿，稍后将针对大家的瓶颈与脱节下发深度质检与【半程修正清单】！`;

      let managingText = await callCozeAgentAPI('managingEditor', managingPrompt, { stage: 'stage2', topic, bottleneck: primaryAcademicB });
      if (!managingText || managingText.trim().length === 0) {
        managingText = `🤝 【责任编辑·自查研判与对齐引导】：全员半程综合打卡已完成！首先肯定大家认真通读了全篇已有内容。汇总全组自查，梳理出以下核心焦点：
  1. 🎯 构思与脱节焦点：${hasIdeationDev ? `部分成员反馈 ${ideationFocusText} 偏离了最初设想；` : ''}${hasTransDev ? `多数成员明确指出了前后脱节（重点涉及 ${transFocusText}）；` : '全篇前后衔接顺畅；'}
  2. 🎨 文风与术语规范：${hasStyleDev ? `组内指出 ${styleFocusText} 存在口语化表述与术语混用；` : '全篇文风严谨规范，'}整体质量自评给出了 ${avgOverallRating} 星的高分！
  3. 💡 核心瓶颈：全组聚焦在『${primaryAcademicB}』。
💡 【研讨切入建议】：建议大家先别急于单干改字，先在讨论区围绕『如何把假设与方法接合起来、统一学术术语』交流 2 分钟，把思路对齐后再动手！审稿专家正在通读全篇，稍后给出学术处方！`;
      }

      const managingMsg = {
        sender: 'managingEditor',
        text: managingText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        _timeMs: Date.now(),
        stage: 'stage2'
      };
      if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
      this.state.chatLogs.stage2.push(managingMsg);
      this.syncChatLogs();
      renderChat(this.state);

      // 3. 平台接管调控：设置【等待组内商讨对齐】状态 (写入 stage2.pendingReviewing 全端持久化)
      this.state.stage2.pendingReviewing = {
        topic,
        bAcademic: primaryAcademicB,
        userText: questionsList,
        transFocus: transFocusText,
        styleFocus: styleFocusText,
        timeSubmitted: Date.now(),
        studentMsgCount: 0
      };
      this.state.stage2PendingReviewing = this.state.stage2.pendingReviewing;
      this.syncStage2();
      if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
    });
  }

  async triggerReviewingEditorAfterDiscussion(customManagingSummary = '') {
    if (this._isTriggeringSecondReview) return;
    const ctx = this.state.stage2?.pendingReviewing || this.state.stage2PendingReviewing;
    if (!ctx) return;
    this._isTriggeringSecondReview = true;
    if (this.state.stage2) this.state.stage2.pendingReviewing = null;
    this.state.stage2PendingReviewing = null;
    this.syncStage2();

    // 1. 责任编辑出场做【一致性研讨小结】并交棒 (支持大模型针对具体讨论内容的深度研判总结)
    const managingText = customManagingSummary || `🤝 【责任编辑·一致性研讨小结】：太好了，看到全组已经在讨论区对齐了修改主线！下面有请审稿编辑通读全文草稿，为大家进行深度学术质检，并下发【3 项半程修正清单】！`;
    const consensusMsg = {
      sender: 'managingEditor',
      text: managingText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      _timeMs: Date.now(),
      stage: 'stage2'
    };
    if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
    this.state.chatLogs.stage2.push(consensusMsg);
    this.syncChatLogs();
    if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
    renderChat(this.state);

    const fullDoc = (this.state.stage2 && this.state.stage2.unifiedContent) ? this.state.stage2.unifiedContent.replace(/<[^>]*>/g, '').trim() : '论文初稿方案';
    const priorFirstReview = this.state.stage2FirstReviewText || (this.state.chatLogs.stage2 || []).find(m => m.sender === 'reviewingEditor')?.text || '前期初审已肯定研究背景立意与文献归纳';

    const reviewingPrompt = `小组已针对责任编辑提出的自查分歧在讨论区达成了初步对齐共识。
【课题】: 《${ctx.topic}》
【全组自查核心瓶颈】: “${ctx.bAcademic}”
【前后脱节重点章节】: ${ctx.transFocus}
【文风偏口语化章节】: ${ctx.styleFocus}
【手填开放提问/修改建议】: “${ctx.userText || '无手填提问'}”

【审稿编辑一审记录】:
"${priorFirstReview}"

请通读下方【小组当前真实正文草稿】全文，作为国家级教育类期刊资深审稿编辑，发表 130~150 字的深度学术质检（【全局红线】：讲人话、出实招！顺应已有框架微调，严禁推翻重写，有数据看数据，没数据看设计，绝不强求跑真实数据）：
① 直击脱节与瓶颈：通读学生真实草稿，针对学生卡壳的『${ctx.bAcademic}』与脱节处（${ctx.transFocus}），给出切中其具体课题的通俗化解思路；
② 文风与术语润色示范：指出口语化章节（${ctx.styleFocus}）中的典型口语问题，给出规范学术第三人称改写示范；
③ 反思与定稿冲刺：对后续反思与定稿提出明确要求，提示学生若对修改有疑问可随时 @审稿编辑 咨询！纯自然语言输出，130~150字。`;

    let reviewingText = await callCozeAgentAPI('reviewingEditor', reviewingPrompt, { stage: 'stage2', topic: ctx.topic, bottleneck: ctx.bAcademic, actualDoc: fullDoc, priorReview: priorFirstReview });
    if (!reviewingText || reviewingText.trim().length === 0) {
      reviewingText = `📝 【审稿编辑·学术质检与答疑】：通读了全组目前撰写的正文草稿，针对大家卡壳的【${ctx.bAcademic}】与衔接脱节问题：
① 假设与方法闭环：通读正文，第三章提出的核心假设与第四章测量设计存在局部脱节，建议在方法中补齐对应的测量题目或实施指标，别让假设悬空；
② 文风统一示范：通读 ${ctx.styleFocus}，消除“我们觉得”等第一人称口语，润色为规范客观的第三人称学术语体；
③ 局限预判：在接下来的第五章深入剖析方案在样本抽样与实施工具上的潜在局限。
👉 我已为大家下发了 3 项可打勾的【半程修正清单】，若对具体修改有疑问可随时 @审稿编辑 咨询，请全组分工落实！`;
    }
    this.state.stage2SecondReviewText = reviewingText;
    this.state.stage2.reviewMilestone = 'checklist_issued';
    this.state.stage2PendingReviewing = null;
    if (this.state.stage2) this.state.stage2.pendingReviewing = null;

    // 🌟 动态生成包含三大高含金量支柱的【半程修正清单】(支持交互勾选)
    this.state.stage2.actionPlan = {
      isGenerated: true,
      completedMap: {},
      items: [
        `🎯【消除前后脱节与构思分歧】(重点关注: ${ctx.transFocus}): 完善第四章方法与测量工具，确保能有效检验前文提出的全部核心假设，消除“两张皮”脱节硬伤，使主线一贯到底！`,
        `✍️【统一语言文风与专业术语】(重点关注: ${ctx.styleFocus}): 通读全篇，消除口语化表达与第一人称叙述，润色为规范严谨的客观学术语体，统一全篇核心概念命名。`,
        `💡【攻克瓶颈与局限反思冲刺】: 按照自查瓶颈（${ctx.bAcademic}），细化实施设计，并在即将起草的第五章深入剖析方案潜在局限，把控节奏，准备初稿定稿！`
      ]
    };

    // 开启第 2 轮研讨监听（讨论具体怎么修）
    this.state.stage2PendingRevisionDiscussion = true;
    this.state.stage2ReviewingFinishedTime = Date.now();

    const reviewingMsg = {
      sender: 'reviewingEditor',
      text: reviewingText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      _timeMs: Date.now(),
      stage: 'stage2'
    };
    if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
    this.state.chatLogs.stage2.push(reviewingMsg);
    this.syncStage2();
    this.syncChatLogs();
    if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
    renderChat(this.state);
    this.renderStudentWorkspace();
    this._isTriggeringSecondReview = false;
  }

  // handleLogout() 已在 L1648 定义（含 presence 清理与云端推送），此处不再重复
}

// Global Launch (Native ESM Support)
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', () => {
      window.app = new App();
    });
  } else {
    window.app = new App();
  }
}
