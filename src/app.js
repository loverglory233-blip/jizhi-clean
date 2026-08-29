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
} from "./constants.js?v=20260829_v651";
import { downloadFileBlob, escapeHtml, getCaretCharacterOffsetWithin, isTaskExpired, showGlobalBannerNotice, formatStandardDateDash } from "./utils.js?v=20260829_v651";
import { callCozeAgentAPI } from "./agents.js?v=20260829_v651";
import { AuthManager } from "./auth.js?v=20260829_v651";
import { CloudSyncEngine } from "./sync.js?v=20260829_v651";
import { renderLoginView } from "./login.js?v=20260829_v651";
import { renderTeacherPortal } from "./teacher.js?v=20260829_v651";
import { renderStudentTaskPortal } from "./student-portal.js?v=20260829_v651";
import {
  buildWordEditorHtml,
  attachWordEditorEvents,
  renderChat,
  renderHeader,
  renderCanvas,
  renderPresencePills,
  renderRemoteCursors
} from "./editor.js?v=20260829_v651";

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
    if (storedViewMode) this.state.studentViewMode = storedViewMode;

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
          // 1. 【20% 节点】阶段一 ➔ 阶段二防卡关 (总时间 20%)
          const isContractConfirmed = !!(this.state.stage1 && this.state.stage1.contract && this.state.stage1.contract.isConfirmed);
          const s1GateMsgId = `msg_gate_s1_${activeTaskId}_${currentGroupId}_20pct`;
          const s1AlreadySent = (this.state.chatLogs.stage1 || []).some(m => m.id === s1GateMsgId || (m.text && m.text.includes('已消耗总时间 20%')));

        if (totalProgress >= 0.20 && currentStage === 'stage1' && !isContractConfirmed && !s1AlreadySent) {
          const msgStage1 = {
            id: s1GateMsgId,
            sender: 'auctioneer',
            text: `🎪 【拍卖师·进度提示】：选题研讨的时间已经走过 20% 啦，大家的想法也越来越清晰了～\n👉 如果研究方向已经基本确定，可以在公约卡片点击【签署确认】，随时进入【阶段二：学术编辑部】开始动笔；如果还有想补充的点子，也欢迎继续在讨论区交流！`,
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

        // 3. 【90% 节点】阶段二 ➔ 阶段三防卡关 (总时间 90%) - 动态由当前所处阶段智能体接管
        const gate90MsgId = `msg_gate_90pct_${activeTaskId}_${currentGroupId}`;
        const gate90AlreadySent = (this.state.chatLogs[currentStage] || []).some(m => m.id === gate90MsgId || (m.text && m.text.includes('已消耗 90%')));

        if (totalProgress >= 0.90 && !gate90AlreadySent) {
          let sender90 = null;
          let text90 = '';
          if (currentStage === 'stage1') {
            sender90 = 'auctioneer';
            text90 = `🎪 【拍卖师·紧急通牒】：全场时间已消耗 90%！本组严重滞后，请全员立刻在公约卡片点击【签署确认】，一秒都不能再耽误了！`;
          } else if (currentStage === 'stage2') {
            sender90 = 'reviewingEditor';
            text90 = `📝 【审稿编辑·转场指令】：正文起草时间已达上限（总时间已消耗 90%）！请小组成员立即停止新增段落，点击上方导航栏进入【🎓 阶段三：答辩擂台】，留足时间完成答辩质询！`;
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

        // 4. 【95% 节点】阶段三 ➔ 终稿提交防漏交 (总时间 95%) - 动态由当前所处阶段智能体接管
        const gate95MsgId = `msg_gate_95pct_${activeTaskId}_${currentGroupId}`;
        const gate95AlreadySent = (this.state.chatLogs[currentStage] || []).some(m => m.id === gate95MsgId || (m.text && m.text.includes('最后 5%')));

        if (totalProgress >= 0.95 && !this.state.isFinalSubmitted && !gate95AlreadySent) {
          let sender95 = 'neutral';
          let text95 = `🟡 【中间委员·终稿警报】：距离全盘任务锁定仅剩最后 5% 时间！请组内确认答辩修改无误，立即点击左侧【🚀 提交论文终稿】完成归档！`;
          if (currentStage === 'stage1') {
            sender95 = 'auctioneer';
            text95 = `🚨 【拍卖师·最后通牒】：距离全盘任务锁定仅剩最后 5% 时间！请组内立刻签署公约并提交终稿，否则本次作业将被强制归档！`;
          } else if (currentStage === 'stage2') {
            sender95 = 'reviewingEditor';
            text95 = `🚨 【审稿编辑·最后通牒】：距离全盘任务锁定仅剩最后 5% 时间！请立即停止修改正文，快速提交终稿归档！`;
          }
          const msg95 = {
            id: gate95MsgId,
            sender: sender95,
            text: text95,
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
            () => {
              this.state.studentViewMode = 'task_list';
              this.renderMain();
            }
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
      if (activeMembersCount < 2) return; // 基础前提：至少 2 人在线才触发主动关心（不必全员在线，否则一人心跳掉线全组智能体就集体沉默）

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

        // 核心守护保护：同时检测【讨论区发言】与【左侧提案操作活跃态】
        const lastProposalTime = proposals.length > 0 ? Math.max(...proposals.map(p => p.updatedAt || 0)) : 0;
        const lastLeftActionTime = Math.max(lastProposalTime, this.stage1LastActionTime || 0);
        const timeSinceLastLeftAction = now - lastLeftActionTime;

        // 1. 【提案阶段研讨静默守护】：只有当【讨论区无人发言 > 3min】且【左侧也无人在操作/撰写提案 > 3min】时，才判定为真正冷场并破冰！
        if (submittedCount < totalMembersCount && silenceDurationMs > 180000 && timeSinceLastLeftAction > 180000) {
          if (!this.lastDiscussionNudgeTime || now - this.lastDiscussionNudgeTime > 240000) {
            this.lastDiscussionNudgeTime = now;
            const s1SilenceFallback = `💡 【拍卖师·研讨互动提示】：大家在构思选题的过程中，可以在讨论区互相交流灵感、探讨研究问题的价值与可行性，共同激发更好的提案！`;
            this.queueAgentNudge('auctioneer', `全组进入选题研讨后已静默一段时间（讨论区无人发言、左侧也无人撰写提案）。请以学术拍卖师身份，用一句轻松的话破冰，再给出 1~2 个能立刻激发大家发言的开放式问题（例如引导从真实教学场景或研究兴趣切入）。80~120 字，热情但不催促。`, s1SilenceFallback, 'stage1');
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

        // 1. 阶段二开场超过 4 分钟完全静默且正文字数 < 50 字：提示开始起草与交叉研讨
        if (silenceDurationMs > 240000 && plainTextLen < 50) {
          if (!this.lastS2SilenceNudgeTime || now - this.lastS2SilenceNudgeTime > 300000) {
            this.lastS2SilenceNudgeTime = now;
            const s2SilenceFallback = `🤝 【责任编辑·起草提示】：大家已进入协作工作区！\n• 建议组员按照阶段一公约分工开始撰写各自负责的内容；\n• 撰写同时，多阅读同伴已写好的段落，在研讨区互相提出优化建议或协助润色，共同打磨全篇！`;
            this.queueAgentNudge('managingEditor', `全组进入正文协作后已静默一段时间、正文尚未动笔。请以责任编辑身份，温柔提醒大家按阶段一公约分工开始起草，并给 1 条具体的起步建议（如先各自写自己负责章节的开头两三句、再交叉阅读）。80~120 字，鼓励不施压。`, s2SilenceFallback, 'stage2');
            return;
          }
        }

        // ── 责任编辑过程守护：周期性读取【实际贡献百分比】与【研讨发言投入】 ──
        // 规则：开场给充分起草时间；写作推进中（> 6分钟）每隔约 6 分钟做一次全面评估
        if (stage2DurationMs > 360000) {
          if (!this.lastS2ContribNudgeTime || now - this.lastS2ContribNudgeTime > 360000) {
            // 1. 计算总投入与每位成员的实际贡献百分比
            let totalContrib = 0;
            membersList.forEach(m => {
              totalContrib += (contribs[m.id] || contribs[m.studentCode] || 0);
            });

            // 2. 统计每位成员在阶段二的发言条数
            const memberChatCounts = {};
            s2Chats.forEach(c => {
              if (c.sender && c.sender !== 'managingEditor' && c.sender !== 'reviewingEditor' && c.sender !== 'system') {
                memberChatCounts[c.sender] = (memberChatCounts[c.sender] || 0) + 1;
              }
            });

            // 3. 找出“写作贡献百分比特别低（< 10%）且发言也极少”的严重脱节同学
            // （注：如果只是差一点如 25% vs 35% 则绝不打扰）
            const severeInactiveMembers = [];
            membersList.forEach(m => {
              const userKey = m.studentCode || m.id;
              const memContrib = (contribs[m.id] || contribs[m.studentCode] || 0);
              const pct = totalContrib > 0 ? Math.round((memContrib / totalContrib) * 100) : 33;
              const chats = (memberChatCounts[userKey] || 0) + (memberChatCounts[m.id] || 0);

              // 判定门槛：总字数已有一定规模且其占比特别低（< 10% 且发言 < 2 条）
              if (totalContrib >= 150 && pct < 10 && chats < 2) {
                severeInactiveMembers.push(m.name);
              }
            });

            if (severeInactiveMembers.length > 0) {
              this.lastS2ContribNudgeTime = now;
              const names = severeInactiveMembers.join('、');
              const msg = {
                sender: 'managingEditor',
                text: `🤝 【责任编辑·进度关怀】：全组正文撰写正在稳步推进中！\n👉 请（**${names}**）同学也逐步加入进来，在负责的章节栏目开始起草撰写，共同保持团队协同节奏！`,
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
        }

        // 3. 🎯 半程编辑会议发起号召（严格按流程图双轨制：推进到【五、不足与反思】或阶段二任务时间已过 60%）
        const times = (this.state.stage1 && this.state.stage1.contract && this.state.stage1.contract.timeAllocations) ? this.state.stage1.contract.timeAllocations : {};
        const totalPlannedMin = (times.background || 25) + (times.literature || 30) + (times.questions || 25) + (times.method || 40) + (times.reflection || 20) + (times.references || 10);
        const totalPlannedMs = totalPlannedMin * 60 * 1000;
        const isTimeOver60Pct = stage2DurationMs >= (totalPlannedMs * 0.6); // 任务时间已过 60%
        const hasReachedReflection = /(?:五、|第5章|第五部分|不足与反思|研究反思|反思与不足|总结与反思|研究局限)/i.test(s2.unifiedContent || '');

        if ((hasReachedReflection || isTimeOver60Pct) && !s2.actionPlan && !this.state.stage2MeetingPrompted) {
          if (!this.lastS2MeetingNudgeTime || now - this.lastS2MeetingNudgeTime > 300000) {
            this.lastS2MeetingNudgeTime = now;
            this.state.stage2MeetingPrompted = true;
            const reasonText = hasReachedReflection 
              ? '关注到团队已推进撰写至【研究设计的不足与反思】章节，全篇初稿框架已基本成型' 
              : '关注到阶段二撰写时间已达规划总用时的 60%';
            const msg = {
              sender: 'managingEditor',
              text: `📢 【责任编辑·半程会议号召】：${reasonText}！\n💡 **现在是全组交叉研读、分析同伴内容的最佳契机**：请大家暂停单独起草，点击左上角【📢 发起编辑会议】，全员自查并阅读同伴撰写的段落，在讨论区交流立意一致性，共同获取审稿专家诊断清单！`,
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

        // ── 阶段二修改期静默守护（严格在审稿编辑发表学术质检开方之后正式开启计时） ──
        if (this.state.stage2ReviewingFinishedTime) {
          const timeSinceReview = now - this.state.stage2ReviewingFinishedTime;
          const isFirstNudgeSent = !!this.state.stage2FirstPostReviewNudgeSent;

          // ① 第一次提醒：审稿编辑讲完后，讨论区静默达到 3 分钟（180s）
          if (!isFirstNudgeSent && timeSinceReview >= 180000 && silenceDurationMs >= 180000) {
            this.state.stage2FirstPostReviewNudgeSent = true;
            this.lastS2PostMeetingSilenceNudgeTime = now;
            const s2ModifyFallback = `💡 【责任编辑·协同修改交流提示】：审稿专家的诊断清单与修改处方已给出一段时间啦！\n👉 建议大家在讨论区交流一下各部分修改的进展与衔接情况，遇到瓶颈互相出谋划策，共同加速完成终稿完善！`;
            this.queueAgentNudge('managingEditor', `审稿编辑已给出诊断清单与修改处方，但讨论区已静默一段时间。请以责任编辑身份，引导大家就各部分修改进展与段落衔接交流，并给 1 条具体建议（如按清单逐条认领修改点）。80~120 字。`, s2ModifyFallback, 'stage2');
            return;
          }

          // ② 后续周期性提醒：第一次提醒发出后，后续每隔 5~8 分钟（动态自适应阈值）做一次跟进提示
          const dynamicPostMeetingSilenceMs = 360000; // 固定每 6 分钟一次（原 5~8 分钟动态区间过于细碎，改为单一节奏）
          if (isFirstNudgeSent && silenceDurationMs >= dynamicPostMeetingSilenceMs) {
            if (!this.lastS2PostMeetingSilenceNudgeTime || now - this.lastS2PostMeetingSilenceNudgeTime >= dynamicPostMeetingSilenceMs) {
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
        }

        // 5. 🎯 终审收尾雷达：阶段二自身时长达到 85% 或 参考文献录入完毕全文闭环
        const hasReachedReferences = /(?:六、|第6章|第六部分|参考文献|References)/i.test(s2.unifiedContent || '') && (s2.unifiedContent || '').length > 1500;
        const isTimeOver85Pct = stage2DurationMs >= (totalPlannedMs * 0.85);
        const hasMeetingDone = !!(s2.actionPlan && s2.actionPlan.isGenerated);
        if ((hasReachedReferences || isTimeOver85Pct) && !this.state.stage2FinalNudgeSent && hasMeetingDone) {
          this.state.stage2FinalNudgeSent = true;
          const msg1 = {
            sender: 'managingEditor',
            text: `🤝 【责任编辑·收尾自查提醒】：时间已推进至阶段二最后冲刺阶段，全篇方案已基本成型！\n👉 请组员先**不要大改核心框架**，重点在研讨区协同分工：对全篇段落衔接与前后逻辑进行快速自查自校，做好收尾！`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            _timeMs: now
          };
          if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
          this.state.chatLogs.stage2.push(msg1);
          this.syncChatLogs();
          if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
          renderChat(this.state);

          // 🤖 动态调用审稿编辑 API：终审专注文字润色与内容把关（错别字/通顺/文风统一 + 内容逻辑），不再做格式排版检查
          setTimeout(async () => {
            const rawDoc = (s2.unifiedContent || '').replace(/<[^>]*>/g, '').trim();
            const topic = (this.state.stage1 && this.state.stage1.mergedTitle) ? this.state.stage1.mergedTitle : '本组课题';
            const sprintReviewPrompt = `团队课题《${topic}》已进入收尾冲刺阶段，请通读下方【小组当前真实正文草稿】全文，作为审稿编辑进行终审定稿把关，发表 130~150 字的微调建议：先肯定论证框架与内容完整度，再重点从 ①错别字与标点、②语句通顺与表达精准、③全篇文风与专业术语统一 三方面指出 1~2 处具体可改点，并顺带对内容逻辑或论证严密性给出 1 条把关提示；明确强调这是定稿前润色、不要推翻既有结构！`;

            let sprintReviewText = await callCozeAgentAPI('reviewingEditor', sprintReviewPrompt, { stage: 'stage2', topic, actualDoc: rawDoc });
            if (!sprintReviewText || sprintReviewText.trim().length === 0) {
              sprintReviewText = `⚠️ 【审稿编辑提示】：大模型终审质检生成超时或网络稍有延迟，请在讨论区发送"@审稿编辑 请对当前论文正文进行终审质检"重新获取真实终审报告。`;
            }

            const msg2 = {
              sender: 'reviewingEditor',
              text: sprintReviewText,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              _timeMs: Date.now()
            };
            if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
            this.state.chatLogs.stage2.push(msg2);
            this.syncChatLogs();
            if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
            renderChat(this.state);
          }, 1200);
        }
      }

      // ======================================================================
      // 🎓 阶段三：中间委员 (Neutral Committee Member) 裁决引导机制
      // ======================================================================
      else if (stage === 'stage3') {
        const s3 = this.state.stage3;
        if (!s3 || this.state.isFinalSubmitted) return;
        if (!this.stage3StartTime) this.stage3StartTime = now;
        const stage3DurationMs = now - this.stage3StartTime;

        const s3Chats = (this.state.chatLogs && this.state.chatLogs.stage3) ? this.state.chatLogs.stage3 : [];
        const lastStudentMsg = [...s3Chats].reverse().find(m => m.sender && m.sender !== 'neutral' && m.sender !== 'proponent' && m.sender !== 'opponent' && m.sender !== 'system');
        const lastStudentMsgTime = lastStudentMsg ? (lastStudentMsg._timeMs || 0) : this.stage3StartTime;
        const silenceDurationMs = now - lastStudentMsgTime;

        const feedbacks = Array.isArray(s3.feedbackItems) ? s3.feedbackItems : [];
        const pendingFeedbacks = feedbacks.filter(f => !f.response || f.response.trim().length === 0);

        // 1. 阶段三开场或讨论中静默超过 3 分钟：提示展开答辩研讨
        if (silenceDurationMs > 180000 && pendingFeedbacks.length > 0) {
          if (!this.lastS3SilenceNudgeTime || now - this.lastS3SilenceNudgeTime > 240000) {
            this.lastS3SilenceNudgeTime = now;
            const s3SilenceFallback = `🟡 【中间委员·答辩协商提示】：正反两方委员的评审意见已送达！\n• 请先回顾中间委员此前在聊天框给出的引导建议，再就反方质询点展开辩护讨论；\n• 商定好共识后，**推选一位组员代表全组**录入裁决矩阵，其余成员同步在正文中落实修改！`;
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

    // 🎯 精确区分两大场景：
    // 1. 任务大厅模式：只展示与统计【本班级】的【任务延长信息】
    // 2. 工作台模式：三维精准对应【当前任务 + 本班级 + 本小组】的【教学通知】及【当前任务的延期通知】
    const myAnns = allAnns
      .filter(a => {
        if (!a) return false;
        const matchClass = (a.classId === effectiveClassId) || 
                           (effectiveClassName && a.className === effectiveClassName) ||
                           (Array.isArray(a.targetClassIds) && a.targetClassIds.includes(effectiveClassId));
        if (isTaskListMode) {
          return matchClass && isExtensionNotice(a);
        } else {
          const matchGroup = !a.targetGroupId || a.targetGroupId === 'all' || a.targetGroupId === groupId ||
            (Array.isArray(a.targetGroupIds) && (a.targetGroupIds.includes('all') || a.targetGroupIds.includes(groupId)));
          const matchTask = (a.taskId === 'task_all' || a.taskId === activeTaskId || (!a.taskId && activeTaskId === 'task_default'));
          return matchClass && matchGroup && matchTask;
        }
      })
      .sort((a, b) => (b.id > a.id ? 1 : -1));

    if (myAnns.length === 0) {
      if (!isSequentialFlow) {
        alert(isTaskListMode ? '⏳ 暂无本班级的任务时间延期通知！' : '📢 暂无针对当前写作任务的教学通知！');
      }
      return;
    }

    // 选中的通知：优先 targetAnn，若无则取最新一条通知
    const unreadList = myAnns.filter(a => !isAnnRead(a));
    const selectedAnn = targetAnn || (unreadList.length > 0 ? unreadList[0] : myAnns[0]);

    // 查阅即自动消除红点，无需强制二次确认
    try {
      this.authManager.markAnnouncementRead(selectedAnn.id, groupId);
    } catch (e) {}

    const allTasks = this.authManager.getTasks();
    const annTaskObj = allTasks.find(t => t.id === selectedAnn.taskId);
    const isAnnTaskExpired = isTaskExpired(annTaskObj);

    const modal = document.createElement('div');
    modal.className = 'modal-overlay modal-announcement-popup';
    modal.dataset.annId = selectedAnn.id;
    modal.innerHTML = `
      <div style="width:620px; max-width:94vw; background:#ffffff; border-radius:16px; box-shadow:0 25px 50px -12px rgba(15,23,42,0.25); overflow:hidden; border:1px solid #e2e8f0; animation:modalFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);">
        
        <!-- 渐变高颜值头部 -->
        <div style="background:linear-gradient(135deg, ${isAnnTaskExpired ? '#991b1b, #dc2626' : '#1d4ed8, #2563eb'}); padding:20px 24px; display:flex; justify-content:space-between; align-items:center; color:#ffffff;">
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="width:42px; height:42px; border-radius:12px; background:rgba(255,255,255,0.2); display:flex; align-items:center; justify-content:center; font-size:22px; flex-shrink:0;">
              ${isAnnTaskExpired ? '🛑' : '📢'}
            </div>
            <div>
              <h3 style="margin:0; font-size:17.5px; font-weight:800; color:#ffffff; letter-spacing:0.3px;">班级教学通知</h3>
              <div style="font-size:12px; color:#e0e7ff; margin-top:2px;">${effectiveClassName ? `🏫 归属班级: ${escapeHtml(effectiveClassName)}` : '任课教师发布的教学指示与任务调整'}</div>
            </div>
          </div>
          <button id="btn-close-ann-popup" style="background:rgba(255,255,255,0.15); border:1px solid rgba(255,255,255,0.3); width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:#ffffff; font-size:14px; transition:all 0.15s ease;">✕</button>
        </div>

        <!-- 通知内容主体 (带历史通知切换 TAB) -->
        <div style="padding:20px 24px; max-height:65vh; overflow-y:auto; display:flex; flex-direction:column; gap:16px;">
          
          ${myAnns.length > 1 ? `
            <!-- 多条通知切换栏 -->
            <div style="display:flex; gap:8px; overflow-x:auto; padding-bottom:6px;">
              ${myAnns.map((a, idx) => {
                const isRead = isAnnRead(a);
                const isCurrent = a.id === selectedAnn.id;
                return `
                  <button class="btn-switch-ann-tab" data-id="${a.id}" style="padding:6px 12px; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer; border:1px solid ${isCurrent ? '#2563eb' : '#e2e8f0'}; background:${isCurrent ? '#eff6ff' : '#ffffff'}; color:${isCurrent ? '#1d4ed8' : '#64748b'}; white-space:nowrap; display:inline-flex; align-items:center; gap:6px;">
                    ${isRead ? '✅' : '🔴'} 通知 ${idx + 1}${idx === 0 ? ' (最新)' : ''}
                  </button>
                `;
              }).join('')}
            </div>
          ` : ''}

          <!-- 选中的通知卡片详情 -->
          <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:14px; padding:18px; box-shadow:0 2px 8px rgba(15,23,42,0.03);">
            
            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px; margin-bottom:12px;">
              <h4 style="margin:0; font-size:16.5px; font-weight:800; color:#0f172a; line-height:1.4;">
                📌 ${escapeHtml(selectedAnn.title)}
              </h4>
              <span style="font-size:11.5px; color:#64748b; white-space:nowrap;">${escapeHtml(selectedAnn.time || '')}</span>
            </div>

            <!-- 标签栏 -->
            <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:14px;">
              <span style="background:#f8fafc; color:#475569; border:1px solid #e2e8f0; padding:3px 10px; border-radius:6px; font-size:11.5px; font-weight:700;">
                👨‍🏫 发布教师: <b>${escapeHtml(selectedAnn.author || '任课教师')}</b>
              </span>
              <span style="background:#f5f3ff; color:#7c3aed; border:1px solid #ddd6fe; padding:3px 10px; border-radius:6px; font-size:11.5px; font-weight:700;">
                📌 关联任务: <b>${escapeHtml(selectedAnn.taskTitle || '写作任务')}</b>
              </span>
              <span style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; padding:3px 10px; border-radius:6px; font-size:11.5px; font-weight:700;">
                🎯 受众: <b>${escapeHtml(selectedAnn.targetGroupName || '全班小组')}</b>
              </span>
            </div>

            <!-- 正文卡片 -->
            <div style="background:#f8fafc; border:1px solid #f1f5f9; border-radius:10px; padding:14px 16px; font-size:13.5px; color:#334155; line-height:1.7; white-space:pre-wrap; word-break:break-word;">
              ${escapeHtml(selectedAnn.content || '')}
            </div>

            <!-- 附件卡片 (如有) -->
            ${selectedAnn.attachment ? `
              <div style="margin-top:14px; background:#faf5ff; border:1px solid #e9d5ff; border-radius:10px; padding:12px 16px; display:flex; justify-content:space-between; align-items:center; gap:12px;">
                <div style="display:flex; align-items:center; gap:10px;">
                  <span style="font-size:24px;">📎</span>
                  <div>
                    <div style="font-size:13px; font-weight:700; color:#6b21a8;">${selectedAnn.attachment.name}</div>
                    <div style="font-size:11px; color:#9333ea; margin-top:2px;">教学随附资源文献 (${selectedAnn.attachment.size || '附件'})</div>
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
          ${isExtensionNotice ? `
            <button id="btn-ext-got-it" style="flex:1; background:linear-gradient(135deg, #1d4ed8, #2563eb); color:#ffffff; border:none; padding:11px 24px; border-radius:8px; font-size:13.5px; font-weight:700; cursor:pointer; box-shadow:0 3px 10px rgba(37,99,235,0.25);">
              我知道了 (关闭)
            </button>
          ` : `
            <button id="btn-read-confirm" style="flex:1; background:${isSelectedRead ? '#e2e8f0' : 'linear-gradient(135deg, #059669, #047857)'}; color:${isSelectedRead ? '#64748b' : '#ffffff'}; border:none; padding:11px 24px; border-radius:8px; font-size:13.5px; font-weight:700; cursor:pointer; box-shadow:${isSelectedRead ? 'none' : '0 3px 10px rgba(5,150,105,0.2)'}; display:inline-flex; align-items:center; justify-content:center; gap:6px;">
              ${isSelectedRead ? '✅ 本条已确认已读 (点击关闭)' : (unreadList.length > 1 ? `✅ 确认本条已读并看下一条 (${unreadIndex + 1}/${unreadList.length}) ➔` : '✅ 我已阅读并确认 (已同步至教师端)')}
            </button>
          `}
        </div>

      </div>
    `;
    document.body.appendChild(modal);

    const closeModal = () => {
      modal.remove();
      if (this.state.studentViewMode === 'task_list') {
        this.renderMain();
      }
    };
    modal.querySelector('#btn-close-ann-popup').addEventListener('click', closeModal);
    modal.querySelector('#btn-close-ann-bottom').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    modal.querySelector('#btn-ext-got-it')?.addEventListener('click', () => {
      this.authManager.markAnnouncementRead(selectedAnn.id, groupId);
      closeModal();
    });

    modal.querySelector('#btn-read-confirm')?.addEventListener('click', () => {
      if (!isSelectedRead) {
        this.authManager.markAnnouncementRead(selectedAnn.id, groupId);
        const myName = currentUser ? currentUser.name : '学生';
        this.authManager.markAnnouncementConfirmed(selectedAnn.id, currentUser ? (currentUser.id || currentUser.studentCode || currentUser.name) : 'temp', myName, groupId);
      }
      closeModal();
      const remainingUnread = unreadList.filter(a => a.id !== selectedAnn.id && !a.isExtension && !a.title?.includes('延期通知'));
      if (remainingUnread.length > 0) {
        setTimeout(() => this.showAnnouncementModal(remainingUnread[0], true), 200);
      } else {
        if (this.state.studentViewMode === 'task_list') {
          this.renderMain();
        } else {
          this.renderStudentWorkspace(true);
        }
      }
    });

    // TAB 切换
    modal.querySelectorAll('.btn-switch-ann-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const annId = btn.dataset.id;
        const target = myAnns.find(a => a.id === annId);
        if (target) {
          closeModal();
          this.showAnnouncementModal(target, false);
        }
      });
    });

    const downloadBtn = modal.querySelector('#btn-download-ann-file');
    if (downloadBtn && selectedAnn.attachment) {
      downloadBtn.addEventListener('click', () => {
        downloadFileBlob(selectedAnn.attachment.name);
      });
    }
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
                    ${p.fileName ? `
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
      btn.addEventListener('click', () => {
        const paperId = btn.dataset.id;
        const paper = papers.find(p => p.id === paperId);
        if (paper) {
          if (paper.fileUrl) {
            const a = document.createElement('a');
            a.href = paper.fileUrl;
            a.download = paper.fileName || '学术参考范文.pdf';
            a.target = '_blank';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          } else if (paper.fileData || (window._paperMemoryBlobMap && window._paperMemoryBlobMap.get(paperId))) {
            const fileData = paper.fileData || window._paperMemoryBlobMap.get(paperId);
            const a = document.createElement('a');
            a.href = fileData;
            a.download = paper.fileName || '学术参考范文.pdf';
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

      // ── 🧠 【研讨语义认知与共识判定引擎】：三阶段动态监听与智能体精准自适应介入 ──
      
      // 🎪 阶段一（学术拍卖会）多轮共识流转
      if (currentStage === 'stage1' && !this.state.stage1.contract.isDraftGenerated && !this.state.stage1.contract.isConfirmed) {
        const s1 = this.state.stage1;
        // 1. 若处于【分歧协商】状态，识别组员是否讨论并收敛出了融合选题
        if (this.state.stage1PendingDivergence) {
          const isTopicConsensusSignal = /(?:结合|融合|就定|赞成|同意|按照|定这个|选题|题目|基于|好主意|没问题|支持|统一)/i.test(text);
          if (isTopicConsensusSignal) {
            this.state.stage1PendingDivergence = false;
            this.state.stage1PendingRefinement = true;
            setTimeout(async () => {
              const refinePrompt = `小组成员已在讨论区就融合研究论题达成初步共识。
请作为资深学术拍卖师，发表 130~150 字的【课题深度细化建议】：
① 肯定该融合选题的学术价值与实践创新点；
② 给出 2~3 个具体的研究落脚点建议（如核心变量界定、具体实证情境或测量视角），启发组员深度推敲；
③ 鼓励组员就细化方案继续交流，暂时不要急于填表！`;

              let refineText = await callCozeAgentAPI('auctioneer', refinePrompt, { stage: 'stage1', topic: s1.mergedTitle || '本组融合课题' });
              if (!refineText || refineText.trim().length === 0) {
                refineText = `🤖 【拍卖师·课题细化建议】：小组成员已就融合论题达成共识！为了让方案更加扎实，建议大家围绕以下几点进一步推敲：① 明确核心自变量与因变量的具体界定；② 细化实证研究的具体对象与实验情境；③ 初步构想测量工具与数据收集方式。请大家在讨论区继续交流细化！`;
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
        // 2. 若处于【方案细化】状态，识别组员是否讨论了具体方案细节并准备分工
        else if (this.state.stage1PendingRefinement) {
          const isRefineDoneSignal = /(?:变量|情境|对象|方法|问卷|量表|实验|设计|理论|框架|差不多|定好|开始分工|怎么分)/i.test(text);
          if (isRefineDoneSignal) {
            this.state.stage1PendingRefinement = false;
            this.state.stage1PendingTasks = true;
            setTimeout(async () => {
              const taskPromptMsg = {
                sender: 'auctioneer',
                text: `🤖 【拍卖师·分工与时间规划提示】：课题细化方向已基本成型！建议大家在讨论区根据具体研究内容（如谁负责文献理论推导、谁设计实证量表与实验流程）自然商定各自的分工认领与时间分配；商定完成后，点击左侧【🤖 AI 辅助生成公约草案】即可一键生成！`,
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
      }

      // 📰 阶段二（学术编辑部）双研讨闭环
      if (currentStage === 'stage2') {
        // Loop 1: 半程自查播报后，监听学生针对分歧商讨达成共识 -> 唤醒审稿编辑下发清单
        if (this.state.stage2PendingReviewing) {
          this.state.stage2PendingReviewing.studentMsgCount = (this.state.stage2PendingReviewing.studentMsgCount || 0) + 1;
          const isConsensusSignal = /(?:对齐|同意|商量好了|商定好了|修改|明白了|收到|按这个改|@审稿编辑|统一了|没问题|行|结合)/i.test(text);
          const hasSufficientChat = this.state.stage2PendingReviewing.studentMsgCount >= 2;
          if (isConsensusSignal || hasSufficientChat) {
            setTimeout(() => {
              this.triggerReviewingEditorAfterDiscussion();
            }, 1200);
            return;
          }
        }
        // Loop 2: 清单下发后，监听学生针对具体正文修改策略进行讨论
        if (this.state.stage2PendingRevisionDiscussion) {
          const isRevisionStrategySignal = /(?:文献|量表|改|加|写|段落|引言|方法|反思|我来|你来|章节|修改|补充|润色|动笔)/i.test(text);
          if (isRevisionStrategySignal) {
            this.state.stage2PendingRevisionDiscussion = false;
            this.state.stage2DualActivityActive = true; // 激活动笔双静默守护
          }
        }
      }

      // 🎓 阶段三（答辩擂台）逐条推进与主席精准总结
      if (currentStage === 'stage3' && this.state.stage3ActivePoint === 1) {
        this.state.stage3Point1ChatCount = (this.state.stage3Point1ChatCount || 0) + 1;
        const isDefenseSignal = /(?:前测|控制|效度|协变量|样本|反思|辩护|采纳|解释|指标|修改|针对|理由|补充|同意)/i.test(text);
        if (this.state.stage3Point1ChatCount >= 2 || isDefenseSignal) {
          this.state.stage3ActivePoint = 'summarized_1';
          setTimeout(async () => {
            const topic = (this.state.stage1 && this.state.stage1.mergedTitle) ? this.state.stage1.mergedTitle : '本组研究设计';
            const chairSummaryPrompt = `小组成员已就反方委员的【第 1 条质询】在讨论区展开了充分的学术辩护研讨。
请通读组内最新讨论发言，作为答辩委员会主席（中间委员），发表 100~130 字的【全组辩护决断精准总结】：
① 简明扼要提炼全组商定出的核心辩护理由与正文落地修改动作；
② 提示组员推选一位代表将本条总结结论录入左侧【答辩裁决矩阵】对应项并保存，随后推进至下一条质询！`;

            let chairSummaryText = await callCozeAgentAPI('neutral', chairSummaryPrompt, { stage: 'stage3', topic, queryPoint: 1 });
            if (!chairSummaryText || chairSummaryText.trim().length === 0) {
              chairSummaryText = `🟡 【中间委员·辩护共识提炼】：全组针对质询 1 的辩护思路已非常清晰！主要共识：采纳反方建设性意见，在对应章节补充前测同质性检验与协变量控制说明。👉 请推选一位组员代表全组将本条总结录入左侧【答辩裁决矩阵】保存，完成后我们继续推进第 2 条质询！`;
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
    input.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSend(); });
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
          this.state.stage1PendingTasks = true;
        } else {
          this.state.stage1PendingDivergence = true;
        }

        if (!s1.contract.timeAllocations) {
          s1.contract.timeAllocations = { background: 25, literature: 30, questions: 25, method: 40, reflection: 20, references: 10 };
        }

        let voteContextPrompt = '';
        if (isUnanimous) {
          voteContextPrompt = `全组投票已全部完成！计票结果清单：${proposalSummaryList}。全组成员 ${totalMembersCount}/${totalMembersCount} 全票一致推选《${winningProposal.title}》！
请作为资深学术拍卖师发表 130~150 字的【全票一致落槌定题与细化建议】：
① 隆重宣布竞拍落槌结果，肯定《${winningProposal.title}》获得全票一致认同，正式确立为全组研究课题；
② 针对该选题给出 2~3 条具体的细化方向建议（【核心铁律】：此时绝对不提及分工与时间！）；
③ 引导组员在讨论区发起交流，全组共同商议完善具体实施方案。`;
        } else {
          voteContextPrompt = `全组投票已全部完成！计票结果清单：${proposalSummaryList}。投票存在分歧（未达成全票一致）！
请作为资深学术拍卖师发表 130~150 字的【分歧协商破冰引导】：
① 客观播报票数分布清单（【严格铁律】：严禁指名道姓批评，严禁提及谁投了谁）；
② 引导各提案作者在讨论区简要阐述各自构想的核心亮点，商讨如何取长补短、求同存异；
③ 引导全组在讨论区深入协商，确定一个兼具理论深度与实践可行性的最终统一主题（既可选用多数人看好的主题，亦可融合各方亮点）。`;
        }

        let summaryText = await callCozeAgentAPI('auctioneer', voteContextPrompt, {
          stage: 'stage1',
          isUnanimous,
          winningTopic: winningProposal ? winningProposal.title : '',
          tallySummary: proposalSummaryList
        });

        if (!summaryText || summaryText.trim().length === 0) {
          if (isUnanimous) {
            summaryText = `🎉 【拍卖师·课题敲定告知】：全员投票已完成，计票结果：${proposalSummaryList}。《${winningProposal.title}》获得全票一致推选，正式确立为全组研究课题！\n⚠️ 拍卖师智能体发言生成超时，组员可直接在讨论区发起交流、组织全组细化研究方案与分工。`;
          } else {
            summaryText = `⚖️ 【拍卖师·分歧协商告知】：投票已落槌，计票结果：${proposalSummaryList}。组内对选题存在票数分歧，请各提案作者在讨论区阐明设计亮点，全组共同商讨确定最终课题。\n⚠️ 拍卖师智能体发言生成超时，如需智能引导可在讨论区 @拍卖师。`;
          }
        }

        const summaryMsg = { sender: 'auctioneer', text: summaryText, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), _timeMs: Date.now() };
        this.state.chatLogs.stage1.push(summaryMsg);
        this.syncStage1();
        this.syncChatLogs();
        if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
        renderChat(this.state);
        this.renderStudentWorkspace();
      }, 800);
    }
    this.renderStudentWorkspace();
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
          text: `🤝 【责任编辑开场】：欢迎来到【阶段二：学术编辑部】！我是过程学伴责任编辑。\n全组已锁定研究主题《${topic}》。\n\n📜 【阶段一公约执行与协同提醒】\n• 基础分工: ${assignSummary.join(' | ') || '全员协作'}\n• 规划时间: ${timeSummary.join(' / ') || '按需推进'}\n\n💡 **真正的协同不仅是分工起草，更要主动研读同伴写下的段落，在研讨区互评互修、打通前后逻辑！**请大家进入左侧编辑器开启深度协作！`,
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
            text: `📝 【审稿编辑提醒】：为辅助各位高效产出高质量学术论文，已为本组匹配并推送了《课程学术参考范文库》！请大家点击上方【📚 查阅参考范文】查阅学习，注意正文三线表规范与研究设计严谨度！`,
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
      const hasNeutralIntro = logs.some(m => m && m.sender === 'neutral' && (m.text?.includes('欢迎来到【阶段三：答辩擂台】') || m.text?.includes('中间委员开场')));
      if (!hasNeutralIntro && !this.state.stage3IntroStarted) {
        this.state.stage3IntroStarted = true;
        const neutralWelcome = {
          id: `msg_welcome_${taskId}_${groupId}_stage3_neutral`,
          sender: 'neutral',
          senderName: '中间委员 · 裁决引导',
          text: `🟡 【中间委员开场】：各位研究者，欢迎来到【阶段三：答辩擂台】！初稿撰写完毕，答辩委员会已就位，接下来将由正方委员与反方委员分别发表评审意见！`,
          timestamp: now,
          _timeMs: Date.now()
        };
        logs.unshift(neutralWelcome);
        this.sendSingleChatMessage(neutralWelcome, 'stage3');
        if (typeof window.renderChat === 'function') window.renderChat(this.state);

        const topic = (this.state.stage1 && this.state.stage1.mergedTitle) ? this.state.stage1.mergedTitle : '本组研究设计';
        const rawContent = (this.state.stage2 && this.state.stage2.unifiedContent) ? this.state.stage2.unifiedContent.replace(/<[^>]*>/g, '').trim() : '';

        // 2. 依次异步调用【正方】与【反方】
        setTimeout(async () => {
          const propPrompt = `针对小组论文《${topic}》，请通读下方【小组当前真实正文草稿】全文，作为答辩正方委员，发表 130~150 字的评审意见：
① 至少提炼 2 个具体优点（既包含学术层面的立意与设计亮点，也包含行文风格与结构规范亮点）；
② 明确指出具体段落（如【一、研究背景】或【二、文献综述】）的论证优势，给予具体肯定的学术支持！`;

          let propText = await callCozeAgentAPI('proponent', propPrompt, { stage: 'stage3', topic, actualDoc: rawContent });
          if (!propText || propText.trim().length === 0) {
            propText = `⚠️ 【正方委员提示】：大模型生成超时或网络稍有延迟，可在讨论区发送"@正方委员 请发表立论支持"重新获取。`;
          }
          logs.push({
            sender: 'proponent',
            text: propText,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            _timeMs: Date.now()
          });
          this.syncChatLogs();
          renderChat(this.state);

          setTimeout(async () => {
            const oppPrompt = `针对小组论文《${topic}》，请通读下方【小组当前真实正文草稿】全文，结合正方委员意见，作为答辩反方委员，发表 130~150 字的辩证审视与质询意见：

【正方委员刚才的肯定意见参考】:
${propText}

【最高原则与正反博弈边界】：正方明确夸赞的具体局部段落与具体事实严禁唱反调；但对于未被明确夸赞的具体内容维度（即使在同一章节，例如正方夸了背景立意新颖，你仍可质询其具体实证数据支撑不足），以及全篇方案的落地可行性、样本控制、量表信效度检验、行文通顺与测量严密性等，提出至少 2 个具体的学术质询点（用 ①② 分条呈现）！`;

            let oppText = await callCozeAgentAPI('opponent', oppPrompt, { stage: 'stage3', topic, actualDoc: rawContent });
            const oppSucceeded = !!(oppText && oppText.trim().length > 0);
            if (!oppSucceeded) {
              oppText = `⚠️ 【反方委员提示】：大模型生成超时或网络稍有延迟，可在讨论区发送"@反方委员 请发表辩证质询"重新获取。`;
            }
            logs.push({
              sender: 'opponent',
              text: oppText,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              _timeMs: Date.now()
            });

            // 平台自动将正反评审意见写入左侧【答辩裁决矩阵】；仅当反方调用成功时才自动解析，失败时留空待学生手动录入，绝不把"超时提示"当成质询写入
            if (oppSucceeded && (!this.state.stage3.feedbackItems || this.state.stage3.feedbackItems.length === 0)) {
              // 🛡️ 反方质询必须从 Coze 反方委员真实发言中解析，绝不写死；有多少条质询就写入多少条，确保矩阵与讨论区内容完全一致
              const oppBody = (oppText || '').replace(/^[^\n]*?【[^】]+】[：:]?\s*/, '').trim();
              const oppMatches = oppBody.match(/[①②③④⑤][^①②③④⑤]*/g);
              const oppQueries = (oppMatches && oppMatches.length > 0)
                ? oppMatches.map(s => s.trim()).filter(s => s.length > 0)
                : [oppBody];
              this.state.stage3.feedbackItems = [
                { id: 'fb_prop', role: 'proponent', speaker: '正方委员 Agent (肯定支持)', title: '立论支持', content: propText.replace(/^[^\n]*?【[^】]+】[：:]?\s*/, ''), response: '', status: 'adopted' }
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
              this.syncStage3();
              this.renderStudentWorkspace();
            }

            this.syncChatLogs();
            renderChat(this.state);

            // 5. 中间委员独立调用 Coze API，引导第 1 题辩护
            setTimeout(async () => {
              const chairPrompt = `答辩正反两方意见已发表完毕。
【正方意见】: ${propText}
【反方质询】: ${oppText}

请作为答辩委员会主席（中间委员），发表 130~150 字的主持引导：
① 肯定正反双方的交锋为方案完善提供了宝贵契机；
② 【逐条推进】：引导全组开场首先聚焦反方【第 1 条质询】，在讨论区先充分商讨辩护共识；
③ 【同伴分工】：提醒达成共识后推选一位组员代表录入左侧【答辩裁决矩阵】，其余组员同步落实终稿！`;

              let chairText = await callCozeAgentAPI('neutral', chairPrompt, { stage: 'stage3', topic, prop: propText, opp: oppText });
              if (!chairText || chairText.trim().length === 0) {
                chairText = `🟡 【中间委员·答辩推进引导】：正反两方意见已入驻左侧【答辩裁决矩阵】！答辩是完善方案的绝佳契机。👉 开场请全组首先聚焦反方【第 1 条质询】在讨论区充分商讨辩护思路；达成共识后，建议推选一位组员代表全组录入矩阵对应框中，其余组员同步落实终稿！`;
              }

              logs.push({
                sender: 'neutral',
                text: chairText,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                _timeMs: Date.now()
              });
              this.syncChatLogs();
              renderChat(this.state);
            }, 2500);

          }, 2500);
        }, 2000);
      }
    }
  }

  switchStage(newStage, isMilestoneAdvance = false) {
    this.lastLocalStageChangeTime = Date.now();
    const stageOrder = { stage1: 1, stage2: 2, stage3: 3 };
    const currentGroupMax = this.state.groupMaxStage || 'stage1';
    const currentGroupOrder = stageOrder[currentGroupMax] || 1;
    const targetOrder = stageOrder[newStage] || 1;

    const allTasks = (this.authManager) ? this.authManager.getTasks() : [];
    const currentTaskObj = allTasks.find(t => t.id === this.state.activeTaskId);
    const isTaskDeadlineExpired = isTaskExpired(currentTaskObj);

    // 🛡️ 阶段防越权门禁：未达成里程碑解锁时，禁止学生随意点击跳级（截止只读查阅模式下全阶段自由放行浏览）
    const isContractSigned = !!(this.state.stage1?.contract?.signed || (Array.isArray(this.state.stage1?.contract?.confirmedMembers) && this.state.stage1.contract.confirmedMembers.length > 0));
    if (!isTaskDeadlineExpired && newStage === 'stage2' && !isMilestoneAdvance && !isContractSigned && currentGroupOrder < 2) {
      alert('⚠️ 暂未解锁【阶段二：学术编辑部】！\n请先在阶段一完成学术公约的签署与分工确认，方可进入阶段二。');
      return;
    }

    if (!isTaskDeadlineExpired && targetOrder > currentGroupOrder && !isMilestoneAdvance) {
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
    this.renderStudentWorkspace();
  }

  setSpeed(newSpeed) {
    this.state.timer.speed = newSpeed;
    const currentUser = this.authManager.getCurrentUser();
    renderHeader(
      this.state, currentUser, this.authManager.getAnnouncements(),
      (s) => this.switchStage(s), (sp) => this.setSpeed(sp),
      () => this.handleLogout(), () => this.switchToTeacherView(),
      () => this.showAnnouncementModal(), () => this.showQuestionnaireModal(),
      () => {
        this.state.studentViewMode = 'task_list';
        sessionStorage.setItem('jizhi_student_view_mode', 'task_list');
        localStorage.setItem('jizhi_student_view_mode', 'task_list');
        if (this.cloudSyncEngine) this.cloudSyncEngine.stopPolling();
        this.renderMain();
      }
    );
  }

  renderStudentWorkspace(isForced = false) {
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
      () => {
        this.state.studentViewMode = 'task_list';
        sessionStorage.setItem('jizhi_student_view_mode', 'task_list');
        localStorage.setItem('jizhi_student_view_mode', 'task_list');
        if (this.cloudSyncEngine) this.cloudSyncEngine.stopPolling();
        this.renderMain();
      }
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
      renderCanvas(this.state, {
        onVote: (propId) => { this.handleVoteCast(propId); },
        onRefresh: () => { this.renderStudentWorkspace(); },
        onContractChange: () => { this.syncStage1(); },
        onAiGenerateContract: async () => {
          const s1 = this.state.stage1 || {};
        const proposals = s1.proposals || [];
        const logs = (this.state.chatLogs && this.state.chatLogs.stage1) || [];
        const userLogs = logs.filter(m => m.sender && !['auctioneer', 'editor', 'system', 'neutral'].includes(m.sender));
        const members = Object.values(this.state.members || {});
        const totalMembersCount = members.length || 3;

        // 1. 严格计算跨成员研讨交互轮数（发言者交替次数）与参与人数
        const voteTime = s1._voteCompletedTime || 0;
        const postVoteLogs = voteTime > 0
          ? userLogs.filter(m => (m._timeMs || 0) >= (voteTime - 3000))
          : userLogs;

        let interactionTurns = 0;
        let lastSpeaker = null;
        const participantSet = new Set();

        postVoteLogs.forEach(msg => {
          const spk = msg.sender || msg.senderName;
          if (spk) {
            participantSet.add(spk);
            if (lastSpeaker !== null && lastSpeaker !== spk) {
              interactionTurns++; // 发言人交替换人，才计为 1 轮有效交互！
            }
            lastSpeaker = spk;
          }
        });

        // 拼接学生研讨文本
        const chatSnippet = userLogs.map(m => `${m.senderName || m.sender}: ${m.text}`).join('\n');
        
        // 🛡️ 严格学术协同门禁：必须提交了提案，且投票后组内交互至少达到 2 轮（跨成员交替研讨）
        if (proposals.length === 0 || interactionTurns < 2 || participantSet.size < 2) {
          document.querySelectorAll('.jizhi-custom-modal').forEach(m => m.remove());
          const hintModal = document.createElement('div');
          hintModal.className = 'modal-overlay jizhi-custom-modal';
          hintModal.innerHTML = `
            <div style="width:460px; max-width:92vw; background:#ffffff; border-radius:16px; box-shadow:0 20px 40px rgba(15,23,42,0.22); overflow:hidden; border:1px solid #e2e8f0; animation:modalFadeIn 0.25s ease;">
              <div style="background:linear-gradient(135deg, #d97706, #f59e0b); padding:18px 24px; color:#ffffff; display:flex; align-items:center; gap:12px;">
                <span style="font-size:24px;">💡</span>
                <div>
                  <h3 style="margin:0; font-size:16px; font-weight:800; color:#ffffff;">研讨协商提示</h3>
                  <div style="font-size:11.5px; opacity:0.9; margin-top:2px;">学术合作公约需由小组成员共同研讨商定</div>
                </div>
              </div>
              <div style="padding:22px 24px; font-size:13.5px; color:#334155; line-height:1.65; display:flex; flex-direction:column; gap:12px;">
                <div>
                  建议小组成员在<b>右侧协同研讨区</b>先就具体的研究细化构思、各章节分工与时间规划展开充分交流，达成共识后再点击提炼公约草案！
                </div>
                <div style="font-size:12px; color:#64748b; background:#f8fafc; padding:8px 12px; border-radius:8px; border:1px solid #e2e8f0;">
                  👉 <b>提示</b>：小组成员也可不点击智能提炼，直接在左侧输入框中自主分工录入与修改。
                </div>
              </div>
              <div style="background:#f8fafc; border-top:1px solid #e2e8f0; padding:14px 24px; display:flex; justify-content:flex-end;">
                <button class="modal-btn submit" id="btn-close-hint-modal" style="background:linear-gradient(135deg, #d97706, #f59e0b); border:none; color:white; padding:8px 22px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer;">去讨论</button>
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
        let isTieOrDivergence = false;

        proposals.forEach(p => {
          const cnt = tally[p.id] || 0;
          if (cnt > maxV) {
            maxV = cnt;
            winningP = p;
            isTieOrDivergence = false;
          } else if (cnt === maxV && maxV > 0) {
            isTieOrDivergence = true;
          }
        });

        if (winningP && maxV >= totalMembersCount && totalMembersCount > 0) {
          isUnanimous = true;
        }

        let determinedTopic = '';
        let topicDecisionReason = '';

        if (isUnanimous && winningP) {
          // 🏆 模式一：全票一致达成共识
          determinedTopic = winningP.title;
          topicDecisionReason = `🎉 小组成员以 ${maxV}/${totalMembersCount} 全票一致通过该选题！`;
        } else {
          // ⚖️ 模式二：存在分歧/平票 ➔ 深度读取研讨流中大家最终协商达成一致的题目
          const matchedFromChat = proposals.find(p => chatSnippet.includes(p.title));
          determinedTopic = matchedFromChat ? matchedFromChat.title : (winningP ? winningP.title : (proposals[0] ? proposals[0].title : ''));
          topicDecisionReason = `⚖️ 投票存在不同意见，已深度读取研讨记录中大家最终商定的共识选题。`;
        }

        if (!s1.mergedTitle || s1.mergedTitle.trim().length === 0) {
          s1.mergedTitle = determinedTopic || '待组员协商填入融合主题';
        }

        // 2. 深度读取研讨流，支持 3 大真实语言模式提取分工
        s1.contract.isDraftGenerated = true;
        s1.contract._draftedTime = Date.now();
        if (!s1.contract.taskAssignments) s1.contract.taskAssignments = {};

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

          // 模式 A：本人主动认领发言 ("蒋诚真: 我来写背景和综述")
          const myMsgs = userLogs.filter(msg => msg.sender === m.id || msg.sender === myCode || (myName && msg.senderName === myName));
          const myText = myMsgs.map(msg => msg.text || '').join(' ');

          // 模式 B：同伴统筹分配/总结发言 ("杨欣如: 诚真负责第二章，我负责设计")
          const mentionPattern = new RegExp(`(?:${myName}|${myCode})[\\s:：负责来做写]*(?:“|【)?([^，。,.\n]+)`, 'g');
          let mentionMatch = null;
          if (myName) {
            userLogs.forEach(msg => {
              if (msg.text && msg.text.includes(myName)) {
                if (msg.text.includes('背景') || msg.text.includes('综述') || msg.text.includes('前言')) {
                  assignedTask = '负责“一、研究背景与意义”及“二、文献综述”起草与资料整理';
                } else if (msg.text.includes('假设') || msg.text.includes('方法') || msg.text.includes('设计') || msg.text.includes('问卷')) {
                  assignedTask = '负责“三、研究问题与假设”及“四、研究设计与方法”方案制定';
                } else if (msg.text.includes('反思') || msg.text.includes('不足') || msg.text.includes('文献') || msg.text.includes('校对')) {
                  assignedTask = '负责“五、不足与反思”撰写及全篇“六、参考文献”引文校对';
                } else if (msg.text.includes('数据') || msg.text.includes('量表') || msg.text.includes('模型')) {
                  assignedTask = '负责数据分析模型构建与研究工具问卷设计';
                }
              }
            });
          }

          if (!assignedTask) {
            if (myText.includes('背景') || myText.includes('综述') || myText.includes('前言')) {
              assignedTask = '负责“一、研究背景与意义”及“二、文献综述”起草与资料整理';
            } else if (myText.includes('假设') || myText.includes('方法') || myText.includes('设计') || myText.includes('实验')) {
              assignedTask = '负责“三、研究问题与假设”及“四、研究设计与方法”方案制定';
            } else if (myText.includes('反思') || myText.includes('不足') || myText.includes('文献') || myText.includes('校对')) {
              assignedTask = '负责“五、不足与反思”撰写及全篇“六、参考文献”引文校对';
            } else if (myText.includes('数据') || myText.includes('问卷') || myText.includes('量表') || myText.includes('模型')) {
              assignedTask = '负责数据分析模型构建与研究工具问卷设计';
            }
          }

          if (!assignedTask) {
            assignedTask = defaultChapterTasks[idx % defaultChapterTasks.length] || '协作撰写与统稿';
          }

          s1.contract.taskAssignments[m.id] = assignedTask;
          if (m.studentCode) s1.contract.taskAssignments[m.studentCode] = assignedTask;
        });

        // 3. 时间规划：优先从研讨记录提取（支持 小时/分钟/半小时 等单位换算），未提及章节回退默认值
        if (!s1.contract.timeAllocations) {
          s1.contract.timeAllocations = { background: 25, literature: 30, questions: 25, method: 40, reflection: 20, references: 10 };
        }
        // 中文/阿拉伯数字 → 数值（含「三十」→30、「二十五」→25）
        const cnNumToInt = (s) => {
          if (/^\d/.test(s)) return parseFloat(s);
          const d = { '零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
          const i = s.indexOf('十');
          if (i >= 0) {
            const tens = s.slice(0, i), ones = s.slice(i + 1);
            return (tens ? (d[tens] ?? 1) : 1) * 10 + (ones ? (d[ones] ?? 0) : 0);
          }
          return d[s] ?? 1;
        };
        // 时间表达 → 分钟数（半小时/一刻钟/一个半小时/小时/分钟 等单位统一换算）
        const timeToMinutes = (text) => {
          if (/一个半小时|1个半小时|一个半钟|1\.5\s*小时/i.test(text)) return 90;
          if (/半小时|半个钟/.test(text)) return 30;
          if (/一刻钟/.test(text)) return 15;
          let m = text.match(/(\d+(?:\.\d+)?|[一二两三四五六七八九十]+)\s*个?\s*(小时|钟|h)/i);
          if (m) return Math.round(cnNumToInt(m[1]) * 60);
          m = text.match(/(\d+(?:\.\d+)?|[一二两三四五六七八九十]+)\s*个?\s*(分钟|分|min)/i);
          if (m) return Math.round(cnNumToInt(m[1]));
          return null;
        };
        const timeChapterKeys = [
          { key: 'background', kw: ['背景', '前言', '意义'] },
          { key: 'literature', kw: ['文献综述', '综述'] },
          { key: 'questions', kw: ['问题', '假设'] },
          { key: 'method', kw: ['方法', '设计', '问卷', '量表', '数据', '模型', '实验'] },
          { key: 'reflection', kw: ['反思', '不足', '结论'] },
          { key: 'references', kw: ['参考文献', '引用', '校对'] }
        ];
        userLogs.forEach(lm => {
          const text = lm.text || '';
          // 按标点切段，逐段匹配「章节关键词 + 时间表达」，避免一条消息里多个章节共用一个时间
          const segments = text.split(/[，。、；;,\n]+/);
          for (const seg of segments) {
            const mins = timeToMinutes(seg);
            if (mins === null) continue;
            for (const tc of timeChapterKeys) {
              if (tc.kw.some(k => seg.includes(k))) {
                s1.contract.timeAllocations[tc.key] = mins; // 讨论值覆盖默认
              }
            }
          }
        });

        this.syncStage1();
        if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
        this.renderStudentWorkspace(true);

        // 4. 拍卖师在聊天区发布权威引导播报
        const draftNoticeMsg = {
          sender: 'auctioneer',
          text: `✨ 【拍卖师·已基于研讨记录深度提炼公约草案】\n已深度读取大家的学术研讨发言与选题投票结果，生成《团队协同合作学术合约草案》！\n\n📌 **融合研究主题**：《${s1.mergedTitle}》\n💡 **决策依据**：${topicDecisionReason}\n👉 **请组员仔细核查左侧分工与时间预算**：\n• 若与实际商议有出入，每位同学均可**直接在输入框中自主微调修改**；\n• 小组成员也可以不依赖提炼，完全自主在左侧分工填写；\n✍️ 确认无误后，全员点击【确认签署公约】即可正式生效并解锁阶段二！`,
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
                系统已根据全组研讨记录自动在左侧填入<b>融合研究主题、各章节分工与时间规划</b>。
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
      },
      onConfirmContract: () => {
        if (this.state.stage1.contract.isConfirmed) {
          alert('🔒 学术合作公约已被全员确认签署并锁定！');
          return;
        }
        const user = this.state.currentUser;
        const s1 = this.state.stage1;
        
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

        if (!s1.contract.confirmedMembers) s1.contract.confirmedMembers = {};
        // 同时写入 studentCode 与 member.id，彻底杜绝 ID 不一致
        s1.contract.confirmedMembers[user] = true;
        const currMemObj = memberArr.find(m => m && (m.id === user || m.studentCode === user || m.username === user || m.name === user));
        if (currMemObj) {
          if (currMemObj.id) s1.contract.confirmedMembers[currMemObj.id] = true;
          if (currMemObj.studentCode) s1.contract.confirmedMembers[currMemObj.studentCode] = true;
          if (currMemObj.name) s1.contract.confirmedMembers[currMemObj.name] = true;
        }

        const confirmedCount = memberArr.filter(m => m && (s1.contract.confirmedMembers[m.id] || s1.contract.confirmedMembers[m.studentCode] || (m.name && s1.contract.confirmedMembers[m.name]))).length;
        const memberName = currMemObj ? currMemObj.name : user;
        const confirmMsg = {
          sender: user,
          senderName: memberName,
          text: `📢 [公约签署告知]: 我 (${memberName}) 已按键确认签署合作学术公约！（全组确认进度: ${confirmedCount}/${totalMembersCount} 人）`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          _timeMs: Date.now()
        };
        if (!this.state.chatLogs.stage1) this.state.chatLogs.stage1 = [];
        this.state.chatLogs.stage1.push(confirmMsg);
        this.syncStage1();
        this.syncChatLogs();
        if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();

        // 🛡️ 严格要求：必须小组所有成员（每一个人）都确认签署后，才解锁推进到阶段二
        if (confirmedCount < totalMembersCount || totalMembersCount < 2) {
          alert(`✅ 您 (${memberName}) 已成功签署学术合作公约！\n\n当前全组签署进度：${confirmedCount}/${totalMembersCount} 人已签署。\n⚠️ 必须全组所有成员均完成签署确认后，系统才会正式解锁并自动推进至【阶段二：学术编辑部】！请提醒组内其他同学尽快签署。`);
        } else {
          s1.contract.isConfirmed = true;
          this.state.groupMaxStage = 'stage2';
          this.syncStage1();
          this.syncStageChange('stage2');
          if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
          setTimeout(() => {
            const finalMsg = {
              sender: 'auctioneer',
              senderName: '头脑风暴 · 学术拍卖师',
              text: `🎪 【拍卖师宣布】：🎉 恭喜！组内全员 ${totalMembersCount}/${totalMembersCount} 名成员已全部完成公约签署确认！学术合作公约正式生效，阶段一圆满结束，系统自动全员解锁推进至【阶段二：学术编辑部】！`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              _timeMs: Date.now()
            };
            if (!this.state.chatLogs.stage1) this.state.chatLogs.stage1 = [];
            this.state.chatLogs.stage1.push(finalMsg);
            this.syncChatLogs();
            if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
            alert(`🎉 恭喜！组内全部 ${totalMembersCount} 位成员已全部完成公约签署！\n\n学术合作公约正式生效，系统自动全组解锁并推进至【阶段二：学术编辑部】！`);
            this.switchStage('stage2', true);
          }, 600);
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
        if (this.state.stage2.isDraftConfirmed) {
          alert('🔒 正文初稿已被组内全员确认！已解锁阶段三。');
          return;
        }
        const user = this.state.currentUser || 'A';
        const s2 = this.state.stage2;

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

        if (!s2.confirmedMembers) s2.confirmedMembers = {};
        s2.confirmedMembers[user] = true;
        const currMemObj = memberArr.find(m => m && (m.id === user || m.studentCode === user || m.username === user || m.name === user));
        if (currMemObj) {
          if (currMemObj.id) s2.confirmedMembers[currMemObj.id] = true;
          if (currMemObj.studentCode) s2.confirmedMembers[currMemObj.studentCode] = true;
          if (currMemObj.name) s2.confirmedMembers[currMemObj.name] = true;
        }

        const confirmedCount = memberArr.filter(m => m && (s2.confirmedMembers[m.id] || s2.confirmedMembers[m.studentCode] || (m.name && s2.confirmedMembers[m.name]))).length;
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
        this.syncStage2();
        this.syncChatLogs();
        if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();

        // 🛡️ 严格要求：必须全组成员每一个人都点击确认初稿后，才解锁推进至阶段三
        if (confirmedCount < totalMembersCount || totalMembersCount < 2) {
          alert(`✅ 您 (${memberName}) 已成功确认正文初稿！\n\n当前组内确认进度：${confirmedCount}/${totalMembersCount} 人已确认。\n⚠️ 必须全组所有成员均完成确认后，系统才会正式解锁并自动推进至【阶段三：答辩擂台】！请提醒组内其他同学尽快确认。`);
        } else {
          s2.isDraftConfirmed = true;
          this.state.groupMaxStage = 'stage3';
          const currentUserObj = this.authManager.getCurrentUser();
          const activeTaskId = this.state.activeTaskId || 'task_default';
          const userGroupId = (currentUserObj && currentUserObj.groupId) ? currentUserObj.groupId : 'group_1';
          if (this.authManager.markAllTaskAnnouncementsRead) {
            this.authManager.markAllTaskAnnouncementsRead(activeTaskId, userGroupId);
          }
          this.syncStage2();
          this.syncStageChange('stage3');
          if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
          setTimeout(() => {
            const finalMsg = {
              sender: 'managingEditor',
              senderName: '责任编辑 · 过程学伴',
              text: `🎉 【责任编辑宣布】：恭喜！组内全员 ${totalMembersCount}/${totalMembersCount} 名成员已全部确认正文初稿定稿！阶段二圆满结束，系统自动全员解锁推进至【阶段三：答辩擂台】！`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              _timeMs: Date.now()
            };
            if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
            this.state.chatLogs.stage2.push(finalMsg);
            this.syncChatLogs();
            if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
            alert(`🎉 恭喜！组内全部 ${totalMembersCount} 位成员已全部完成初稿确认！\n\n系统自动全组解锁并推进至【阶段三：答辩擂台】！`);
            this.switchStage('stage3', true);
          }, 600);
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
          text: `📢 [终稿修改确认]: 我 (${memberName}) 已确认完成终稿修改！（全组修改确认进度: ${confirmedCount}/${totalMembersCount} 人）`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          _timeMs: Date.now()
        };
        if (!this.state.chatLogs.stage3) this.state.chatLogs.stage3 = [];
        this.state.chatLogs.stage3.push(confirmMsg);
        this.syncStage3();
        this.syncChatLogs();
        if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();

        if (confirmedCount >= totalMembersCount) {
          s3.isRevisionConfirmed = true;
          const promptMsg = {
            sender: 'neutral',
            text: `🏆 【中间委员·终稿就绪】：组内全员已确认终稿修改完毕！请组员或代表点击右上方【🚀 提交论文终稿】完成全盘归档！`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            _timeMs: Date.now()
          };
          this.state.chatLogs.stage3.push(promptMsg);
          this.syncChatLogs();
          if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
          alert(`🎉 组内全员 (${totalMembersCount}/${totalMembersCount} 人) 已完成终稿修改确认！请点击【🚀 提交论文终稿】归档呈递至教师端！`);
        } else {
          alert(`✅ 你 (${memberName}) 已成功确认终稿修改完毕！\n\n目前组内确认进度：${confirmedCount}/${totalMembersCount} 人。`);
        }
        this.renderStudentWorkspace();
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
              neutralReply = `🟡 【中间委员·答辩裁决推进】：已成功记录本条裁决结论：“${respText}”！\n\n👉 **接下来请全组研讨攻克**【${nextItem.speaker}】：请全组成员商讨修改方案，达成共识后**由一位组员代表录入**并同步修改终稿！`;
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
        const confirmSub = confirm(`🚀 确认提交《${topicTitle}》期末方案终稿？\n\n提交后本组的方案与研讨矩阵将锁定归档呈递至教师端，其他小组不受影响！提交后将自动标记所有前置通知已读，并弹窗引导进入课程评估问卷！`);
        if (confirmSub) {
          this.state.isFinalSubmitted = true;
          const currentStage = this.state.currentStage;
          const currentUser = this.state.currentUser;
          const currentUserObj = this.authManager.getCurrentUser();
          const activeTaskId = this.state.activeTaskId || 'task_default';
          const userGroupId = (currentUserObj && currentUserObj.groupId) ? currentUserObj.groupId : 'group_1';

          // ⚡ 提交终稿后：自动将当前任务的所有前置通知/问卷标记为已读
          if (this.authManager && this.authManager.markAllTaskAnnouncementsRead) {
            this.authManager.markAllTaskAnnouncementsRead(activeTaskId, userGroupId);
          }

          const submitMsg = {
            sender: currentUser,
            text: `🎉 【期末论文终稿成功提交告知】全组已完成论文终稿与答辩质询归档，方案已锁定并提交至教师端！大家可以随时返回各阶段查阅！`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            _timeMs: Date.now()
          };
          if (!this.state.chatLogs[currentStage]) this.state.chatLogs[currentStage] = [];
          this.state.chatLogs[currentStage].push(submitMsg);

          const neutralFinalMsg = {
            sender: 'neutral',
            text: `🏆 【中间委员 Agent 祝贺】热烈祝贺小组圆满完成本期写作任务与答辩！终稿已全盘锁入云端归档库。请全组成员点击弹窗填写课程评估问卷！`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            _timeMs: Date.now()
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
    }); // end renderCanvas
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
    // 审稿编辑与责任编辑的正文规范检查仅在【阶段二】生效
    if (currentStage !== 'stage2') return;

    const logs = this.state.chatLogs[currentStage] || [];
    const now = Date.now();
    const lastReviewingMsg = logs.slice().reverse().find(m => m.sender === 'reviewingEditor');
    const timeSinceLastReviewing = lastReviewingMsg ? (now - (lastReviewingMsg._timeMs || 0)) : 999999;



    // 1. 🎯 审稿编辑第一次动态质检（检测到正文推进到【二、文献综述】或【三、研究问题与假设】写完时触发一次）
    const hasLitOrQuestionSection = /(?:二、|第2章|第二部分|文献综述|三、|第3章|第三部分|研究问题|研究假设)/i.test(newContent);
    if (hasLitOrQuestionSection && !this.state.stage2FirstReviewDone && timeSinceLastReviewing > 60000) {
      this.state.stage2FirstReviewDone = true;
      const topic = (this.state.stage1 && this.state.stage1.mergedTitle) ? this.state.stage1.mergedTitle : '本组课题';
      
      // 智能提取完整的【研究背景】+【文献综述】+【研究问题与假设】章节草稿
      const rawDoc = newContent.replace(/<[^>]*>/g, '').trim();
      // 若已推进至第四部分研究方法，则智能截取至方法之前，确保审阅完整的背景与文献综述全貌
      const methodIndex = rawDoc.search(/(?:四、|第4章|第四部分|研究方法|研究设计)/i);
      // 一审聚焦「背景+综述+问题」三章：若已推进至方法章节则截取至方法之前，否则（篇幅尚短）直接全文
      const contentSnippet = (methodIndex > 200) ? rawDoc.slice(0, methodIndex).trim() : rawDoc;

      setTimeout(async () => {
        const firstReviewPrompt = `团队正在撰写课题《${topic}》，目前已写完研究背景、文献综述与研究问题章节，请通读下方【小组当前真实正文草稿】，作为审稿编辑进行实质性学术质检，发表 130~150 字的针对性指导：肯定其背景立意与文献归纳亮点，结合正文中写到的具体概念与变量，指出文献综述与研究问题推导中的 1 处具体对应衔接建议（确保后续方法能呼应问题），绝不讲空泛套话，鼓励团队继续推进！`;
        let firstReviewText = await callCozeAgentAPI('reviewingEditor', firstReviewPrompt, { stage: 'stage2', topic, actualDoc: contentSnippet });
        if (!firstReviewText || firstReviewText.trim().length === 0) {
          firstReviewText = `⚠️ 【审稿编辑提示】：大模型学术质检生成超时或网络稍有延迟，请在讨论区发送"@审稿编辑 请对当前论文正文进行学术质检"重新获取真实质检报告。`;
        }

        const firstReviewMsg = {
          sender: 'reviewingEditor',
          text: firstReviewText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          _timeMs: Date.now()
        };
        if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
        this.state.chatLogs.stage2.push(firstReviewMsg);
        this.syncChatLogs();
        if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
        renderChat(this.state);
      }, 800);
    }

    // 2. 🎯 章节语义里程碑雷达：推进到【总结反思】时号召发起【半程编辑会议】
    const hasReflectionSection = /(?:五、|第5章|第五部分|不足与反思|研究反思|反思与不足|总结与反思|研究局限)/i.test(newContent);
    const isStage2MeetingLocked = this.state.stage2 && this.state.stage2.actionPlan && this.state.stage2.actionPlan.isGenerated;
    const lastManagingMsg = logs.slice().reverse().find(m => m.sender === 'managingEditor');
    const timeSinceLastManaging = lastManagingMsg ? (now - (lastManagingMsg._timeMs || 0)) : 999999;

    if (hasReflectionSection && !isStage2MeetingLocked && !this.state.stage2MeetingCallSent && timeSinceLastManaging > 60000) {
      this.state.stage2MeetingCallSent = true;
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

    // 4. 🎯 终审里程碑雷达：推进到【六、参考文献】时触发终审定稿润色提醒
    const hasReferenceSection = /(?:六、|第6章|第六部分|参考文献|References)/i.test(newContent);
    if (hasReferenceSection && !this.state.stage2RefFormatReviewed && timeSinceLastReviewing > 60000) {
      this.state.stage2RefFormatReviewed = true;
      const refReviewMsg = {
        sender: 'reviewingEditor',
        text: `📝 【审稿编辑·终审定稿提醒】：关注到团队已推进至【参考文献】收尾部分，全篇已基本成型！在最终冲刺阶段，请大家通读全文做定稿润色：① 检查错别字与标点；② 理顺语句通顺与表达精准；③ 统一全篇文风与专业术语。做好细节润色，准备迎接阶段三答辩！`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        _timeMs: now
      };
      logs.push(refReviewMsg);
      this.syncChatLogs();
      renderChat(this.state);
    }

    // 3. 🤝 责任编辑 Agent: 字数贡献比严重偏斜提醒 (SSRL 共享调节)
    // 智能全维度过滤：
    // ① 必须至少有 2 名及以上组员【当前真实在线活跃】（30秒内有心跳/操作），如果人都不在线则绝不自言自语汇报！
    // ② 每次提醒后至少间隔 15 分钟 (900秒) 冷却期；
    // ③ 正文相比上次提醒至少新增推进了 150 字；
    const membersList = Object.values(this.state.members || {});
    const presence = this.state.presence || {};
    const activeOnlineCount = membersList.filter(m => {
      const p = presence[m.studentCode] || presence[m.id];
      return p && (now - (p.updatedAt || 0) < 30000); // 30秒内有活跃操作判定为在线
    }).length;

    const plainLen = newContent.replace(/<[^>]*>/g, '').trim().length;
    const lastWarnTime = this.state.lastSSRLWarnTimeMs || 0;
    const lastWarnLen = this.state.lastSSRLWarnLen || 0;
    const cooldownPassed = (now - lastWarnTime) >= 900000; // 15 分钟冷却
    const hasMeaningfulProgress = (plainLen - lastWarnLen) >= 150; // 且写了新内容

    if (plainLen >= 300 && membersList.length >= 2 && cooldownPassed && (lastWarnTime === 0 || hasMeaningfulProgress)) {
      const contribs = this.state.stage2.memberContributions || {};
      let totalContrib = 0;
      membersList.forEach(m => { totalContrib += (contribs[m.id] || contribs[m.studentCode] || 0); });

      if (totalContrib >= 200 || plainLen >= 300) {
        // 检查是否存在显著失衡：某位成员占比超过 70%，且有成员贡献率低于 10%
        const pcts = membersList.map(m => {
          const val = (contribs[m.id] || contribs[m.studentCode] || 0);
          return (totalContrib > 0) ? Math.round((val / totalContrib) * 100) : 0;
        });
        const hasMaxSkew = Math.max(...pcts) >= 70;
        const hasZeroMember = Math.min(...pcts) <= 10;

        if (hasMaxSkew && hasZeroMember) {
          this.state.lastSSRLWarnTimeMs = now; // 记录本次提醒时间，开启 15 分钟静默期
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
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="teacher-modal-card" style="width:640px;">
        <div class="teacher-modal-header ann-theme">
          <div class="modal-header-title"><span class="modal-icon">📢</span><div><h3>学术编辑部【半程编辑会议】</h3><p>全篇互阅、思想碰撞与半程修正清单生成</p></div></div>
          <button class="modal-close-btn" id="btn-close-meeting">✕</button>
        </div>
        <div class="teacher-modal-body">
          <!-- 1. 全篇通读与思想碰撞 -->
          <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:10px; padding:14px 16px;">
            <div style="font-size:13px; font-weight:800; color:#1e40af; margin-bottom:12px;">📋 一、全篇通读与思想碰撞</div>
            
            <div style="display:flex; flex-direction:column; gap:10px;">
              <div style="background:#ffffff; padding:10px 14px; border-radius:8px; border:1px solid #e2e8f0; display:flex; flex-direction:column; gap:6px;">
                <label style="font-size:12.5px; color:#1e293b; font-weight:700;">1. 负责章节自查：目前自己所写部分的论述情况？</label>
                <select id="meeting-theme-consistency-select" class="teacher-input" style="width:100%; padding:6px 10px; font-size:12.5px; border-radius:6px; border:1px solid #cbd5e1; background:#ffffff;">
                  <option value="紧扣研究主旨，论点明确且论据充实">✅ 紧扣研究主旨，论点明确且论据充实</option>
                  <option value="基本契合主旨，局部论述需深化拓展">🔄 基本契合主旨，局部论述需深化拓展</option>
                  <option value="存在论证发散或核心概念界定不清">⚠️ 论据不够充分，或感觉有些偏离初衷</option>
                </select>
              </div>

              <div style="background:#ffffff; padding:10px 14px; border-radius:8px; border:1px solid #e2e8f0; display:flex; flex-direction:column; gap:6px;">
                <label style="font-size:12.5px; color:#1e293b; font-weight:700;">2. 同伴内容互阅：通读其他成员撰写内容后的想法？</label>
                <select id="meeting-peer-review-select" class="teacher-input" style="width:100%; padding:6px 10px; font-size:12.5px; border-radius:6px; border:1px solid #cbd5e1; background:#ffffff;">
                  <option value="逻辑严密连贯，高度认同同伴思路与论述">✅ 逻辑严密连贯，高度认同同伴思路与论述</option>
                  <option value="启发新思路，建议为同伴补充论据">💡 启发了新思路，想在讨论区为同伴补充论据视角</option>
                  <option value="存在不同看法，部分论证需要商榷">⚖️ 存在不同看法，对部分论据推导想和同伴商榷</option>
                  <option value="衔接非常自然，很好支撑了后续章节">🔗 章节衔接自然，很好地支撑呼应了后续研究设计</option>
                </select>
                <!-- 第2题专属子项：对同伴具体哪些章节提出商榷 -->
                <div id="meeting-peer-divergence-box" style="background:#fffbeb; padding:8px 12px; border-radius:6px; border:1px solid #fef3c7; display:none; flex-direction:column; gap:4px; margin-top:4px;">
                  <label style="font-size:12px; color:#92400e; font-weight:700;">📌 针对第 2 题：您对同伴所写的哪些具体章节想提出商榷或补充？</label>
                  <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:2px;">
                    <label style="font-size:11.5px; color:#451a03; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="peer-div-sec" value="一、研究背景与意义"> 【一、背景与意义】</label>
                    <label style="font-size:11.5px; color:#451a03; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="peer-div-sec" value="二、文献综述与前沿"> 【二、文献综述】</label>
                    <label style="font-size:11.5px; color:#451a03; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="peer-div-sec" value="三、研究问题与假设"> 【三、问题与假设】</label>
                    <label style="font-size:11.5px; color:#451a03; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="peer-div-sec" value="四、研究设计与方法"> 【四、设计与方法】</label>
                    <label style="font-size:11.5px; color:#451a03; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="peer-div-sec" value="五、不足与反思"> 【五、不足与反思】</label>
                  </div>
                </div>
              </div>

              <div style="background:#ffffff; padding:10px 14px; border-radius:8px; border:1px solid #e2e8f0; display:flex; flex-direction:column; gap:6px;">
                <label style="font-size:12.5px; color:#1e293b; font-weight:700;">3. 全篇衔接与贯通：各章节之间的逻辑连贯性？</label>
                <select id="meeting-transition-select" class="teacher-input" style="width:100%; padding:6px 10px; font-size:12.5px; border-radius:6px; border:1px solid #cbd5e1; background:#ffffff;">
                  <option value="环环相扣，前后呼应非常自然顺畅">✅ 环环相扣，前后呼应非常自然顺畅</option>
                  <option value="局部章节过渡稍显生硬，需商定衔接句">🔄 局部章节过渡稍显生硬，需商定衔接句</option>
                  <option value="各章节相对独立，需进一步统一主线">⚠️ 各章节相对独立，需进一步统一核心主线</option>
                </select>
                <!-- 第3题专属子项：哪些相邻章节之间需要打通衔接 -->
                <div id="meeting-transition-sections-box" style="background:#eff6ff; padding:8px 12px; border-radius:6px; border:1px solid #dbeafe; display:none; flex-direction:column; gap:4px; margin-top:4px;">
                  <label style="font-size:12px; color:#1e40af; font-weight:700;">🔗 针对第 3 题：您认为哪些相邻章节之间的过渡需要重点打通与统一？</label>
                  <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:2px;">
                    <label style="font-size:11.5px; color:#1e3a8a; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="trans-div-sec" value="背景到综述 (第一至二章)"> 【第一至二章 (背景➔综述)】</label>
                    <label style="font-size:11.5px; color:#1e3a8a; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="trans-div-sec" value="综述到假设 (第二至三章)"> 【第二至三章 (综述➔假设)】</label>
                    <label style="font-size:11.5px; color:#1e3a8a; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="trans-div-sec" value="假设到设计 (第三至四章)"> 【第三至四章 (假设➔方法)】</label>
                    <label style="font-size:11.5px; color:#1e3a8a; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="trans-div-sec" value="设计到反思 (第四至五章)"> 【第四至五章 (方法➔反思)】</label>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 2. 团队共享调节 3 维打星自评 -->
          <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:12px 16px; margin-top:12px; display:flex; flex-direction:column; gap:10px;">
            <div style="font-size:13px; font-weight:800; color:#0f172a;">🌟 二、团队共享调节 3 维打星自评</div>
            
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

          <!-- 3. 三维难点瓶颈全面自评 -->
          <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:10px; padding:12px 16px; margin-top:12px; display:flex; flex-direction:column; gap:10px;">
            <div style="font-size:13px; font-weight:800; color:#0f172a;">⚠️ 三、团队 3 维瓶颈自查</div>
            
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
            <label style="font-size:13px; font-weight:700;">✍️ 向审稿专家提问 / 组内核心困惑说明 (选填)</label>
            <textarea id="meeting-input-text" class="teacher-textarea" style="min-height:55px;" placeholder="请输入组内最想向审稿编辑请教的学术问题或论证困惑..."></textarea>
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

    // ── 第 2 题与第 3 题独立子项条件动态展开 ──
    const peerSelect = modal.querySelector('#meeting-peer-review-select');
    const peerDivBox = modal.querySelector('#meeting-peer-divergence-box');
    const transitionSelect = modal.querySelector('#meeting-transition-select');
    const transDivBox = modal.querySelector('#meeting-transition-sections-box');

    const updatePeerBox = () => {
      const pVal = peerSelect ? peerSelect.value : '';
      const needShow = pVal.includes('不同看法') || pVal.includes('商榷');
      if (peerDivBox) {
        peerDivBox.style.display = needShow ? 'flex' : 'none';
        if (!needShow) peerDivBox.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
      }
    };

    const updateTransBox = () => {
      const tVal = transitionSelect ? transitionSelect.value : '';
      const needShow = tVal.includes('生硬') || tVal.includes('独立');
      if (transDivBox) {
        transDivBox.style.display = needShow ? 'flex' : 'none';
        if (!needShow) transDivBox.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
      }
    };

    if (peerSelect) {
      peerSelect.addEventListener('change', updatePeerBox);
      updatePeerBox();
    }
    if (transitionSelect) {
      transitionSelect.addEventListener('change', updateTransBox);
      updateTransBox();
    }

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
      const peerReviewState = modal.querySelector('#meeting-peer-review-select').value;
      const transitionState = modal.querySelector('#meeting-transition-select') ? modal.querySelector('#meeting-transition-select').value : '环环相扣';
      const checkedSections = Array.from(modal.querySelectorAll('input[name="peer-div-sec"]:checked')).map(cb => cb.value);
      const bAcademic = modal.querySelector('#meeting-bottleneck-academic').value;
      const bCollab = modal.querySelector('#meeting-bottleneck-collab').value;
      const bRhythm = modal.querySelector('#meeting-bottleneck-rhythm').value;
      const userText = modal.querySelector('#meeting-input-text').value.trim();
      closeModal();

      const user = this.state.currentUser || 'A';
      const memberName = this.state.members[user] ? this.state.members[user].name : user;
      const totalMembersCount = Object.keys(this.state.members || {}).length;

      if (!this.state.stage2.meetingSubmissions) this.state.stage2.meetingSubmissions = {};
      this.state.stage2.meetingSubmissions[user] = {
        user,
        name: memberName,
        themeConsistency,
        peerReviewState,
        transitionState,
        checkedSections,
        bAcademic,
        bCollab,
        bRhythm,
        userText,
        logicRating,
        balanceRating,
        confidenceRating,
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

      // ── 全员打卡完毕：汇聚全组数据并由责任编辑播报分歧 ──
      const topic = (this.state.stage1 && this.state.stage1.mergedTitle) ? this.state.stage1.mergedTitle : '本组课题';
      const allSubs = Object.values(submissions);
      const hasDivergence = allSubs.some(s => s.themeConsistency.includes('偏离') || s.themeConsistency.includes('不够充分') || s.peerReviewState.includes('不同看法') || s.peerReviewState.includes('商榷') || (s.checkedSections && s.checkedSections.length > 0));
      
      // 汇总全组自查状态
      const consistencySummary = allSubs.map(s => `${s.name}: ${s.themeConsistency.slice(0, 10)}`).join('；');
      const peerSummary = allSubs.map(s => `${s.name}: ${s.peerReviewState.slice(0, 10)}`).join('；');
      const transitionSummary = allSubs.map(s => `${s.name}: ${(s.transitionState || '连贯').slice(0, 10)}`).join('；');
      const allCheckedSecs = Array.from(new Set(allSubs.flatMap(s => s.checkedSections || [])));
      const sectionsFocusText = allCheckedSecs.length > 0 ? allCheckedSecs.map(sec => `【${sec}】`).join(' 与 ') : '【一、研究背景】与【四、研究设计】';

      const primaryAcademicB = allSubs[0].bAcademic;
      const primaryCollabB = allSubs[0].bCollab;
      const primaryRhythmB = allSubs[0].bRhythm;
      const questionsList = allSubs.filter(s => s.userText).map(s => `${s.name}提问：“${s.userText}”`).join('；') || '暂无补充提问';

      // 暂不提前点亮清单，等待组内完成分歧商讨后由审稿专家质检下发
      this.syncStage2();
      if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
      this.renderStudentWorkspace();

      alert(`✅ 你 (${memberName}) 已成功提交半程自查与互阅打卡！\n\n目前组内已打卡：${submittedCount}/${totalMembersCount} 人。\n全组成员已集齐！责任编辑已在右侧研讨区梳理出本组自查认知分歧，请组员先在讨论区针对分歧商讨对齐，稍后审稿专家将为大家深度质检并下发【半程修正清单】！`);

      // 2. 异步调用扣子【责任编辑】Coze API: 全景研判 (客观呈现分歧章节 80% 主线，协作时间 20% 顺带；全员一致则全面具体赞扬)
      const managingPrompt = `全组成员已全部完成半程编辑会议自查打卡（共 ${totalMembersCount} 人）：
• 课题: 《${topic}》
• 组内重点关注/产生认知差异的具体章节: ${sectionsFocusText}
• 全组负责章节自查汇总: ${consistencySummary}
• 全组通读同伴思想研判: ${peerSummary}
• 全篇过渡与衔接感知汇总: ${transitionSummary}
• 组内核心学术瓶颈: ${primaryAcademicB} | 协作瓶颈: ${primaryCollabB} | 进度瓶颈: ${primaryRhythmB}
• 组内说明与提问汇总: ${questionsList}
• 判定状态: ${hasDivergence ? '【存在显著分歧/不同看法】' : '【全员高度一致认同】'}

请作为学术编辑部责任编辑（协同主持人与学伴）发表一段充实、真诚、富有启发性的发言（字数控制在 130~150 字，严禁简略敷衍）：
${hasDivergence 
? `【分歧引导主线】：
1. 肯定全组认真通读了彼此撰写的段落；明确说明：通读对比后发现目前初稿中写出的部分内容，与组内部分同学在自查中提出的思路构想存在认知差异与不同看法；
2. 逐一分条列出所涉及的章节（若有多个用 ① ② 客观列出 ${sectionsFocusText} 各自想商榷的思路焦点）；
3. 针对上述内容分歧给出具体的【分步协商建议】（例如建议大家：先不要急于单打独斗改字，在讨论区按照“先对齐背景的核心概念界定，再商定设计中的具体干预任务与量表指标”的步骤分步商讨，把修改方案达成全组共识；【核心铁律】：责任编辑只客观呈现分歧并给出协商建议，严禁擅自下负面优劣结论！学术对错交由审稿编辑）；
4. 末尾顺带评价时间/协作：若自查中反映了时间紧张则给 1 句调适建议；若时间把控良好/无顾虑，则真诚给予明确夸赞（如夸赞大家推进节奏很稳健）！并预告审稿专家随后将进行正文深度学术质检！`
: '【高度默契赞扬】：旗帜鲜明地给予具体肯定，大力赞扬全组对论文核心立意的高度默契与良好写作节奏，引导大家针对学术难点交流，并预告审稿专家马上为大家做正文深度学术质检！'
}`;

      let managingText = await callCozeAgentAPI('managingEditor', managingPrompt, { stage: 'stage2', topic, bottleneck: bAcademic, peerReview: peerReviewState });
      if (!managingText || managingText.trim().length === 0) {
        managingText = `⚠️ 【责任编辑提示】：大模型生成超时或网络稍有延迟，请组员在讨论区发送“@责任编辑 请对当前自查分歧进行指导”重新获取分析。`;
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

      // 3. 平台接管调控：设置【等待组内商讨对齐】状态，全景汇聚全组所有难点与提问
      this.state.stage2PendingReviewing = {
        topic,
        bAcademic: primaryAcademicB,
        userText: questionsList,
        sectionsFocus: sectionsFocusText,
        hasDivergence,
        timeSubmitted: Date.now(),
        studentMsgCount: 0
      };
      this.syncStage2();
    });
  }

  async triggerReviewingEditorAfterDiscussion() {
    if (!this.state.stage2PendingReviewing) return;
    const ctx = this.state.stage2PendingReviewing;
    this.state.stage2PendingReviewing = null;
    this.syncStage2();

    const fullDoc = (this.state.stage2 && this.state.stage2.unifiedContent) ? this.state.stage2.unifiedContent.replace(/<[^>]*>/g, '').trim() : '论文初稿方案';
    const reviewingPrompt = `小组已针对责任编辑提出的自查分歧在讨论区达成了对齐共识。
【课题】: 《${ctx.topic}》
【自查勾选难点】: “${ctx.bAcademic}”
【手填开放提问/困惑】: “${ctx.userText || '无手填提问'}”
【重点关注章节】: ${ctx.sectionsFocus}

请通读下方【小组当前真实正文草稿】全文，作为国家级教育类核心期刊资深审稿编辑，发表 130~150 字的深度学术质检（继承前期初审记忆，前后一致，绝不推翻前文）：
① 具体难点破解与立意对齐：结合讨论共识，明确统一核心概念界定与理论支撑；
② 正文具体学术质检：通读全文，肯定已有框架亮点，精准指出 2~3 处实际存在的具体章节与实证设计薄弱点；
③ 正式下发【半程修正清单】：给出具体操作处方，引导全组对照上方点亮的修正清单开展协同修改！`;

    let reviewingText = await callCozeAgentAPI('reviewingEditor', reviewingPrompt, { stage: 'stage2', topic: ctx.topic, bottleneck: ctx.bAcademic, actualDoc: fullDoc });
    if (!reviewingText || reviewingText.trim().length === 0) {
      reviewingText = `🔍 【审稿编辑·半程深度质检】：小组成员已就修改方向形成良好共识！通读正文初稿，研究背景与文献综述框架清晰；为进一步提升论证严密性，重点给出以下诊断：① 核心主线层面消除概念分歧；② 实证设计层面补充前测同质性检验与具体测量量表；③ 协同修改层面合理分工修改。请全组对照上方【半程修正清单】开展修改！`;
    }

    // 🌟 动态生成包含三大高含金量支柱的【半程修正清单】
    this.state.stage2.actionPlan = {
      isGenerated: true,
      items: [
        `【核心主线·消除立意与逻辑不一致】(重点关注: ${ctx.sectionsFocus}): 结合研讨共识，统一前后章节核心概念界定与研究假设，消除思路矛盾，确保主线一贯到底。`,
        `【学术论证与方法瓶颈深度突破】: • 理论与综述层: 深化核心理论推导与近三年顶刊文献支撑； • 假设与机制层: 明确中介/调节效应逻辑传导链条； • 方法与量表层: 补充操作化测量工具与信效度检验。`,
        `【协同修改落地与反思冲刺】: 组员分工协同修改正文，重点完善第五节【研究设计的不足与反思】，把控后半程进度节奏！`
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
