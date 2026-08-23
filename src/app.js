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
} from "./constants.js?v=20260823_v77";
import { downloadFileBlob, escapeHtml, getCaretCharacterOffsetWithin, isTaskExpired } from "./utils.js?v=20260823_v77";
import { callCozeAgentAPI } from "./agents.js?v=20260823_v77";
import { AuthManager } from "./auth.js?v=20260823_v77";
import { CloudSyncEngine } from "./sync.js?v=20260823_v77";
import { renderLoginView } from "./login.js?v=20260823_v77";
import { renderTeacherPortal } from "./teacher.js?v=20260823_v77";
import { renderStudentTaskPortal } from "./student-portal.js?v=20260823_v77";
import {
  buildWordEditorHtml,
  attachWordEditorEvents,
  renderChat,
  renderHeader,
  renderCanvas,
  renderPresencePills,
  renderRemoteCursors
} from "./editor.js?v=20260823_v77";

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

    const user = this.authManager.getCurrentUser();
    const currentGroupId = user && user.groupId ? user.groupId : 'group_1';
    this.loadGroupState(currentGroupId);

    this.cloudSyncEngine = new CloudSyncEngine(this);
    this.initTimer();
    this.renderMain();

    // 启动时立刻从 MySQL 服务器拉取最新全局教务元数据与小组协同数据
    (async () => {
      try {
        await this.authManager.pullGlobalMeta();
        this.loadGroupState(currentGroupId);
        this.renderMain();
        if (this.cloudSyncEngine) {
          this.cloudSyncEngine.updateScopeKeys();
          this.cloudSyncEngine.pullFromServer();
        }
        if (user && user.role === 'student' && this.state.studentViewMode === 'workspace') {
          this.checkUnreadAnnouncements();
        }
      } catch (e) {}
    })();
  }

  loadGroupState(groupId = 'group_1') {
    const defaultState = JSON.parse(JSON.stringify(InitialState));
    const taskId = this.state.activeTaskId || 'task_default';
    this.state.members = this.authManager.getGroupMembersForWorkspace(groupId);

    // 纯净初始内存状态，杜绝本地历史脏读
    this.state.chatLogs = { stage1: [], stage2: [], stage3: [] };
    this.state.stage1 = JSON.parse(JSON.stringify(defaultState.stage1));
    this.state.stage2 = JSON.parse(JSON.stringify(defaultState.stage2));
    this.state.stage3 = JSON.parse(JSON.stringify(defaultState.stage3));
    this.state.currentStage = 'stage1';
    this.state.isFinalSubmitted = false;

    // 立即触发云端拉取最新真实数据
    if (this.cloudSyncEngine) {
      this.cloudSyncEngine.groupId = groupId;
      this.cloudSyncEngine.taskId = taskId;
      this.cloudSyncEngine.updateScopeKeys();
      this.cloudSyncEngine.pullFromServer();
    }
  }

  initPresetMessagesForGroup(groupId) {
    this.state.chatLogs = { stage1: [], stage2: [], stage3: [] };
  }

  resetTestGroupState(groupId = 'group_1', taskId = null) {
    if (taskId) this.state.activeTaskId = taskId;
    const targetTaskId = this.state.activeTaskId || 'task_default';
    const defaultState = JSON.parse(JSON.stringify(InitialState));
    this.state.activeMonitorGroupId = groupId;
    this.state.stage1 = defaultState.stage1;
    this.state.stage2 = defaultState.stage2;
    this.state.stage3 = defaultState.stage3;
    this.state.currentStage = 'stage1';
    this.state.isFinalSubmitted = false;
    this.state.presence = {};
    this.initPresetMessagesForGroup(groupId);
    this.saveGroupState(groupId);

    // 🔔 同步清空该小组在当前任务下的通知已读与教师端追踪矩阵确认状态 (方便反复演练测试)
    try {
      const announcements = this.authManager.getAnnouncements();
      const classes = this.authManager.getClasses();
      const allUsers = this.authManager.getUsers();
      let changed = false;

      // 严格只收集当前被重置小组及其组员的标识，绝不波及其他小组
      const groupMembersKeys = new Set();
      if (groupId) groupMembersKeys.add(groupId);
      classes.forEach(c => {
        (c.groups || []).forEach(g => {
          if (g && ((g.id && g.id === groupId) || (g.name && g.name === groupId))) {
            if (g.id) groupMembersKeys.add(g.id);
            (g.members || []).forEach(m => {
              const mId = (typeof m === 'object' && m !== null) ? (m.id || m.userId || m.studentCode) : m;
              if (mId) {
                groupMembersKeys.add(mId);
                const uObj = allUsers.find(u => (u.id === mId || u.studentCode === mId || u.username === mId || u.name === mId));
                if (uObj) {
                  if (uObj.id) groupMembersKeys.add(uObj.id);
                  if (uObj.studentCode) groupMembersKeys.add(uObj.studentCode);
                  if (uObj.username) groupMembersKeys.add(uObj.username);
                }
              }
            });
          }
        });
      });

      announcements.forEach(ann => {
        const matchTask = !ann.taskId || ann.taskId === 'task_all' || ann.taskId === targetTaskId || (targetTaskId === 'task_default' && !ann.taskId);
        if (matchTask) {
          if (ann.readGroupStatus) {
            if (groupId && ann.readGroupStatus[groupId]) { delete ann.readGroupStatus[groupId]; changed = true; }
          }
          if (ann.readStatus) {
            groupMembersKeys.forEach(k => {
              if (ann.readStatus[k]) { delete ann.readStatus[k]; changed = true; }
            });
          }
          if (Array.isArray(ann.confirmedMembers)) {
            const origLen = ann.confirmedMembers.length;
            ann.confirmedMembers = ann.confirmedMembers.filter(m => {
              if (!m) return false;
              if (m.groupId === groupId) return false;
              if (m.id && groupMembersKeys.has(m.id)) return false;
              if (m.studentCode && groupMembersKeys.has(m.studentCode)) return false;
              return true;
            });
            if (ann.confirmedMembers.length !== origLen) changed = true;
          }
        }
      });

      if (changed) {
        localStorage.setItem(STORAGE_KEY_ANNOUNCEMENTS, JSON.stringify(announcements));
        this.authManager.pushGlobalMeta();
      }
    } catch (e) {}

    const currUser = this.authManager ? this.authManager.getCurrentUser() : null;
    const teacherUserId = (currUser && (currUser.id || currUser.username || currUser.studentCode)) || 'u_teacher';
    const teacherToken = (currUser && (currUser.token || currUser.activeSessionId)) || '';

    // 发送原子重置请求直达服务端 (独立通道，100% 必达，彻底清空服务端数据库与缓存)
    fetch(`sync.php?action=reset_group&groupId=${encodeURIComponent(groupId)}&taskId=${encodeURIComponent(targetTaskId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isReset: true, userId: teacherUserId, token: teacherToken })
    }).then(r => r.json()).then(res => {
      if (this.cloudSyncEngine) {
        this.cloudSyncEngine.groupId = groupId;
        this.cloudSyncEngine.taskId = targetTaskId;
        this.cloudSyncEngine.updateScopeKeys();
        this.cloudSyncEngine.isResetBroadcast = true;
        this.cloudSyncEngine.broadcastLocal({ isReset: true, resetSeq: (res && res.resetSeq) ? res.resetSeq : Date.now() });
      }
    }).catch(() => {
      if (this.cloudSyncEngine) {
        this.cloudSyncEngine.groupId = groupId;
        this.cloudSyncEngine.taskId = targetTaskId;
        this.cloudSyncEngine.updateScopeKeys();
        this.cloudSyncEngine.isResetBroadcast = true;
        this.cloudSyncEngine.pushSnapshot();
      }
    });
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
    // 彻底废除 LocalStorage 冗余脏备份，状态完全由内存状态机和云端 MySQL 统一权威托管
  }

  syncChatLogs() {
    const groupId = this.getEffectiveGroupId();
    const taskId = this.state.activeTaskId || 'task_default';
    const stage = this.state.currentStage || 'stage1';
    const logs = (this.state.chatLogs && this.state.chatLogs[stage]) ? this.state.chatLogs[stage] : [];
    const latestMsg = logs[logs.length - 1];

    if (latestMsg) {
      try {
        fetch(`sync.php?action=send_chat&groupId=${encodeURIComponent(groupId)}&taskId=${encodeURIComponent(taskId)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: latestMsg.id,
            groupId: groupId,
            taskId: taskId,
            stage: stage,
            sender: latestMsg.sender,
            senderName: latestMsg.senderName || '',
            text: latestMsg.text,
            timestamp: latestMsg.timestamp,
            _timeMs: latestMsg._timeMs || Date.now()
          })
        }).catch(() => {});
      } catch (e) {}
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
    setInterval(() => {
      const currentUser = this.authManager ? this.authManager.getCurrentUser() : null;
      // 🛡️ 严格对齐规则：进入任务工作台的学生持续上报在线心跳
      if (currentUser && currentUser.role === 'student' && this.state.studentViewMode === 'workspace' && this.state.activeTaskId) {
        if (!this.state.presence) this.state.presence = {};
        const myKeys = [currentUser.id, currentUser.studentCode, currentUser.username, currentUser.name].filter(Boolean);
        const now = Date.now();
        myKeys.forEach(k => {
          this.state.presence[k] = {
            nodeIndex: (this.state.presence[k] && this.state.presence[k].nodeIndex) || 0,
            activeSection: (this.state.presence[k] && this.state.presence[k].activeSection) || '在线协作',
            updatedAt: now
          };
        });
        if (this.cloudSyncEngine) {
          this.cloudSyncEngine.pushSnapshot();
        }
        this.renderPresenceCursors();
      }
    }, 2500);
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

        // 🌿 智能静默破冰引导已关闭，避免无人发言时责任编辑重复刷屏

        // ⏰ 全局进度与阶段间转场催促 + 阶段二智能体保底机制 (仅由组长单点触发，杜绝多人并发 AI 消息风暴)
        const isGroupLeader = !!(currentUser && (currentUser.role === 'leader' || (currentUser.roleTitle || '').includes('组长')));
        const activeTaskId = this.state.activeTaskId || 'task_default';
        const currentGroupId = (currentUser && currentUser.groupId) ? currentUser.groupId : (this.state.activeMonitorGroupId || 'group_1');
        const allTasks = (this.authManager) ? this.authManager.getTasks() : [];
        const curTask = allTasks.find(t => t.id === activeTaskId);
        const totalDurationMin = (curTask && curTask.durationMinutes) ? Number(curTask.durationMinutes) : 150;
        const totalDurationSec = totalDurationMin * 60;
        const totalProgress = (totalDurationSec > 0) ? (this.state.timer.elapsedSeconds / totalDurationSec) : 0;

        if (isGroupLeader) {
          // 1. 【20% 节点】阶段一 ➔ 阶段二防卡关 (总时间 20%)
          const isContractConfirmed = !!(this.state.stage1 && this.state.stage1.contract && this.state.stage1.contract.isConfirmed);
          const s1GateMsgId = `msg_gate_s1_${activeTaskId}_${currentGroupId}_20pct`;
          const s1AlreadySent = (this.state.chatLogs.stage1 || []).some(m => m.id === s1GateMsgId || (m.text && m.text.includes('已消耗总时间 20%')));

        if (totalProgress >= 0.20 && currentStage === 'stage1' && !isContractConfirmed && !s1AlreadySent) {
          const msgStage1 = {
            id: s1GateMsgId,
            sender: 'auctioneer',
            text: `🎪 【拍卖师·进度提示】：阶段一选题时间已达上限（已消耗总时间 20%）！请全组成员停止讨论，立即在公约卡片点击【签署确认】，马上解锁进入【阶段二：学术编辑部】开启正文写作！`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            _timeMs: nowMs
          };
          if (!this.state.chatLogs.stage1) this.state.chatLogs.stage1 = [];
          this.state.chatLogs.stage1.push(msgStage1);
          this.syncChatLogs();
          renderChat(this.state);
        }

        // 2. 【阶段二智能体保底机制】(S2 经历 65% 正常轨 + 全局 75% 极端保底轨)
        if (currentStage === 'stage2') {
          const s2MeetingMsgId = `msg_s2_meeting_${activeTaskId}_${currentGroupId}`;
          const isMeetingDone = !!(this.state.stage2 && this.state.stage2.actionPlan && this.state.stage2.actionPlan.isGenerated) ||
                                (this.state.chatLogs.stage2 || []).some(m => m.id === s2MeetingMsgId || (m.text && m.text.includes('半程会议号召')));

          if (!isMeetingDone) {
            const s2StartTime = (this.state.stage2 && this.state.stage2.stageStartTime) ? this.state.stage2.stageStartTime : null;
            const s2ElapsedMin = s2StartTime ? Math.max(0, (nowMs - s2StartTime) / 60000) : Math.max(0, min - (totalDurationMin * 0.10));
            const s2TargetMin = totalDurationMin * 0.70;

            const isNormalDue = (s2TargetMin > 0) && (s2ElapsedMin >= (s2TargetMin * 0.65));
            const isEmergencyDue = (totalProgress >= 0.75);

            if (isNormalDue || isEmergencyDue) {
              this.state.stage2MeetingTimeTriggered = true;
              const meetingCallMsg = {
                id: s2MeetingMsgId,
                sender: 'managingEditor',
                text: `🤝 【责任编辑·半程会议号召】：阶段二协作时间已达到 65%（正文骨架已搭建）！请全体小组成员点击上方【📢 发起编辑会议】完成 4 维自查打卡，稍后审稿编辑将结合全组情况进行深度学术质检与清单生成！`,
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
          // ⚡ 学生在工作台协作时：每 3 秒后台静默拉取云端，实时感知教师发布的新通知或删除的通知/文献/问卷
          if (!this._studentWorkspacePollTick) this._studentWorkspacePollTick = 0;
          this._studentWorkspacePollTick++;
          if (this._studentWorkspacePollTick % 3 === 0) {
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
      renderLoginView(appEl, this.authManager, () => {
        const u = this.authManager.getCurrentUser();
        const gId = u && u.groupId ? u.groupId : 'group_1';
        this.loadGroupState(gId);
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
      this.loadGroupState(currentGroupId);

      if (this.state.studentViewMode === 'task_list') {
        appEl.className = 'app-student-portal-mode';
        renderStudentTaskPortal(
          appEl, this.authManager, this.state,
          async (taskId) => {
            this.state.activeTaskId = taskId || 'task_default';
            this.state.studentViewMode = 'workspace';
            if (this.authManager && this.authManager.pullGlobalMeta) {
              try { await this.authManager.pullGlobalMeta(); } catch (e) {}
            }
            const latestClassId = this.state.activeStudentClassId || currentUser?.classId || 'class_101';
            const latestGroupObj = this.authManager.getStudentActiveGroup(currentUser, latestClassId);
            const targetGroupId = latestGroupObj.id || (currentUser && currentUser.groupId ? currentUser.groupId : 'group_1');
            this.loadGroupState(targetGroupId);
            
            // 🟢 进入任务工作台第 0 毫秒：立即广播在线心跳
            if (!this.state.presence) this.state.presence = {};
            const myKeys = [currentUser?.id, currentUser?.studentCode, currentUser?.username, currentUser?.name].filter(Boolean);
            const now = Date.now();
            myKeys.forEach(k => {
              this.state.presence[k] = { nodeIndex: 0, activeSection: '在线协作', updatedAt: now };
            });

            this.renderMain();
            if (this.cloudSyncEngine) {
              this.cloudSyncEngine.updateScopeKeys();
              this.cloudSyncEngine.pushSnapshot();
              this.cloudSyncEngine.pullFromServer();
            }
            this.checkUnreadAnnouncements();
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
            <div class="chat-header">
              <div class="chat-title"><span>💬 协同对话研讨</span></div>
              <div class="active-agent-pills">
                <span class="agent-pill">🎪 拍卖师</span>
                <span class="agent-pill">🤝 责任编辑</span>
                <span class="agent-pill">📝 审稿编辑</span>
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
        return p && (now - (p.updatedAt || 0) < 60000);
      });

      let primaryMember = onlineMembers.find(m => m.studentCode === 'A' || m.roleTitle?.includes('组长') || m.role === 'leader');
      if (!primaryMember && onlineMembers.length > 0) {
        primaryMember = [...onlineMembers].sort((a, b) => (a.studentCode || a.id || '').localeCompare(b.studentCode || b.id || ''))[0];
      }

      const isPrimaryGuardian = primaryMember && (primaryMember.studentCode === myCode || primaryMember.id === myCode);
      if (!isPrimaryGuardian) return;

      const stage = this.state.currentStage;
      const totalMembersCount = membersList.length;
      const activeMembersCount = onlineMembers.length;
      if (activeMembersCount < totalMembersCount) return; // 基础前提：在场成员活跃才触发情绪/冷场提醒！

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

            const comfortMsg = {
              sender: agentSender,
              text: comfortText,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              _timeMs: now
            };
            if (!this.state.chatLogs[stage]) this.state.chatLogs[stage] = [];
            this.state.chatLogs[stage].push(comfortMsg);
            this.syncChatLogs();
            if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
            renderChat(this.state);
            return;
          } else {
            // 同伴已成功出面调节，AI 默默记录并全程保持静默
            this.lastEmotionHandledId = lastNegativeChat._timeMs;
          }
        }
      }
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
            const msg = {
              sender: 'auctioneer',
              text: `💡 【拍卖师·研讨互动提示】：大家在构思选题的过程中，可以在讨论区互相交流灵感、探讨研究问题的价值与可行性，共同激发更好的提案！`,
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

        // 1. 阶段二开场超过 4 分钟完全静默且正文字数 < 50 字：提示开始起草与交叉研讨
        if (silenceDurationMs > 240000 && plainTextLen < 50) {
          if (!this.lastS2SilenceNudgeTime || now - this.lastS2SilenceNudgeTime > 300000) {
            this.lastS2SilenceNudgeTime = now;
            const msg = {
              sender: 'managingEditor',
              text: `🤝 【责任编辑·起草提示】：大家已进入协作工作区！\n• 建议组员按照阶段一公约分工开始撰写各自负责的内容；\n• 撰写同时，多阅读同伴已写好的段落，在研讨区互相提出优化建议或协助润色，共同打磨全篇！`,
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

        // 2. 🎯 进度雷达 1：正文写到【二、文献综述】或【三、研究问题与假设】➔ 审稿编辑第一次初稿微调质检
        const hasReachedLitOrHypo = /(?:二、|第二章|第二部分|文献综述|三、|第三章|第三部分|研究问题|研究假设)/i.test(s2.unifiedContent || '');
        if (hasReachedLitOrHypo && !this.state.stage2FirstQualityChecked && plainTextLen >= 120) {
          this.state.stage2FirstQualityChecked = true;
          setTimeout(() => {
            const msg = {
              sender: 'reviewingEditor',
              text: `📝 【审稿编辑·初稿立意微调建议】：关注到团队已初步搭起前置文献与研究假设框架！\n💡 **初稿质检小提示**：文献综述要紧扣研究核心变量的关联性展开述评，研究假设表述建议更加聚焦、具有可验证性，为后续实验/问卷工具设计打好坚实基础！`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              _timeMs: Date.now()
            };
            if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
            this.state.chatLogs.stage2.push(msg);
            this.syncChatLogs();
            if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
            renderChat(this.state);
          }, 1500);
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
            const msg = {
              sender: 'managingEditor',
              text: `💡 【责任编辑·协同修改交流提示】：审稿专家的诊断清单与修改处方已给出一段时间啦！\n👉 建议大家在讨论区交流一下各部分修改的进展与衔接情况，遇到瓶颈互相出谋划策，共同加速完成终稿完善！`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              _timeMs: now,
              stage: 'stage2'
            };
            if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
            this.state.chatLogs.stage2.push(msg);
            this.syncChatLogs();
            if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
            renderChat(this.state);
            return;
          }

          // ② 后续周期性提醒：第一次提醒发出后，后续每隔 5~8 分钟（动态自适应阈值）做一次跟进提示
          const dynamicPostMeetingSilenceMs = Math.min(Math.max(totalPlannedMs * 0.12, 300000), 480000);
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
              if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
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

          // 🤖 动态调用审稿编辑 API：基于真实正文尾部切片与参考文献进行针对性格式与细节微调审查
          setTimeout(async () => {
            const rawDoc = (s2.unifiedContent || '').replace(/<[^>]*>/g, '').trim();
            const tailSnippet = rawDoc.slice(-800); // 截取尾部 800 字真实参考文献与收尾段落
            const topic = (this.state.stage1 && this.state.stage1.mergedTitle) ? this.state.stage1.mergedTitle : '本组课题';
            const sprintReviewPrompt = `团队课题《${topic}》已进入收尾冲刺阶段，当前正文尾部与参考文献切片如下：\n${tailSnippet}\n请作为审稿编辑对该切片进行具体的学术格式与排版审查，发表 130~150 字的终审微调建议：肯定论证框架完整，针对切片中的参考文献规范（GB/T 7714 格式、作者/年份/刊名完整度）、各级标题序号或表格三线表，指出 1~2 点具体微调自查细节，明确强调不要大改结构、只做细节打磨！`;
            
            let sprintReviewText = await callCozeAgentAPI('reviewingEditor', sprintReviewPrompt, { stage: 'stage2', topic, actualDoc: tailSnippet });
            if (!sprintReviewText || sprintReviewText.trim().length === 0) {
              sprintReviewText = `📝 【审稿编辑·终审格式与细节微调建议】：通读全文，整体论证框架已非常完整！在最后冲刺阶段，请大家重点微调排版与格式规范：\n① 参考文献是否符合标准 GB/T 7714 格式（含著者、题目、刊名、年份）；\n② 各级标题层级序号是否规范统一；\n③ 表格是否采用标准学术三线表。\n做好细节打磨，准备进入阶段三答辩！`;
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
            const msg = {
              sender: 'neutral',
              text: `🟡 【中间委员·答辩协商提示】：正反两方委员的评审意见已送达左侧矩阵！\n• 建议全组在研讨区就反方提出的质询点展开辩护讨论，商定好共识后，**推选一位组员代表全组**录入裁决矩阵，其余成员同步在正文中落实修改！`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              _timeMs: now
            };
            if (!this.state.chatLogs.stage3) this.state.chatLogs.stage3 = [];
            this.state.chatLogs.stage3.push(msg);
            this.syncChatLogs();
            if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
            renderChat(this.state);
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
    const currentUser = this.authManager.getCurrentUser();
    if (!currentUser || currentUser.isTeacher || currentUser.role === 'teacher') return;
    const effectiveClassId = this.state.activeStudentClassId || currentUser?.classId || 'class_101';
    const activeGroupObj = this.authManager.getStudentActiveGroup(currentUser, effectiveClassId);
    const groupId = activeGroupObj.id || (currentUser && currentUser.groupId ? currentUser.groupId : 'group_1');
    const myClassIds = new Set([effectiveClassId, currentUser?.classId, ...(currentUser?.classIds || [])].filter(Boolean));
    const activeTaskId = (this.state && this.state.activeTaskId) ? this.state.activeTaskId : 'task_default';
    const allTasks = this.authManager.getTasks();

    // 🛡️ 已经截止的任务通知不论看没看都不要再弹窗骚扰学生！
    const currentTask = allTasks.find(t => t.id === activeTaskId);
    if (currentTask && isTaskExpired(currentTask)) {
      return;
    }

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

    // 过滤出本班/本组/本任务且未读的通知，且排除已截止任务的通知
    const unreadList = allAnns
      .filter(a => {
        if (a.taskId && a.taskId !== 'task_all') {
          const tObj = allTasks.find(t => t.id === a.taskId);
          if (tObj && isTaskExpired(tObj)) return false;
        }
        const matchClass = !a.classId || a.classId === 'all' || myClassIds.has(a.classId);
        const matchGroup = !a.targetGroupId || a.targetGroupId === 'all' || a.targetGroupId === groupId ||
          (Array.isArray(a.targetGroupIds) && (a.targetGroupIds.includes('all') || a.targetGroupIds.includes(groupId)));
        const matchTask = a.taskId === 'task_all' || a.taskId === activeTaskId || (!a.taskId && activeTaskId === 'task_default');
        return matchClass && matchGroup && matchTask && !isAnnRead(a);
      })
      .sort((a, b) => (b.id > a.id ? 1 : -1));

    if (unreadList.length > 0) {
      this.showAnnouncementModal(unreadList[0], true);
    }
  }

  showAnnouncementModal(targetAnn = null, isSequentialFlow = false) {
    document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
    const currentUser = this.authManager.getCurrentUser();
    const effectiveClassId = this.state.activeStudentClassId || currentUser?.classId || 'class_101';
    const activeGroupObj = this.authManager.getStudentActiveGroup(currentUser, effectiveClassId);
    const groupId = activeGroupObj.id || (currentUser && currentUser.groupId ? currentUser.groupId : 'group_1');
    const activeTaskId = (this.state && this.state.activeTaskId) ? this.state.activeTaskId : 'task_default';
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

    // 严格过滤当前班级、小组、当前任务可见的通知，按最新发布倒序排
    const myAnns = allAnns
      .filter(a => {
        const matchClass = !a.classId || a.classId === 'all' || a.classId === effectiveClassId;
        const matchGroup = !a.targetGroupId || a.targetGroupId === 'all' || a.targetGroupId === groupId ||
          (Array.isArray(a.targetGroupIds) && (a.targetGroupIds.includes('all') || a.targetGroupIds.includes(groupId)));
        const matchTask = a.taskId === 'task_all' || a.taskId === activeTaskId || (!a.taskId && activeTaskId === 'task_default');
        return matchClass && matchGroup && matchTask;
      })
      .sort((a, b) => (b.id > a.id ? 1 : -1));

    if (myAnns.length === 0) {
      if (!isSequentialFlow) alert('📢 暂无课堂教学通知！');
      return;
    }

    // 计算当前学生个人的未读列表（从新到旧）
    const unreadList = myAnns.filter(a => !isAnnRead(a));

    // 如果当前是自动弹出流且已无任何未读通知，直接静默退出
    if (isSequentialFlow && unreadList.length === 0) {
      return;
    }

    // 选中的通知：优先 targetAnn，若无则取最新未读，再无则取最新一条通知
    const selectedAnn = targetAnn || (unreadList.length > 0 ? unreadList[0] : myAnns[0]);
    const isSelectedRead = isAnnRead(selectedAnn);

    // 计算当前在未读流中的序号
    const unreadIndex = unreadList.findIndex(a => a.id === selectedAnn.id);
    const queueBadge = unreadList.length > 0 && !isSelectedRead
      ? `<span style="background:rgba(239,68,68,0.25); border:1px solid #f87171; color:#ffffff; padding:2px 8px; border-radius:10px; font-size:11px; margin-left:6px;">待确认 ${unreadIndex >= 0 ? unreadIndex + 1 : 1}/${unreadList.length}</span>`
      : '';

    const allTasks = this.authManager.getTasks();
    const annTaskObj = allTasks.find(t => t.id === selectedAnn.taskId);
    const isAnnTaskExpired = isTaskExpired(annTaskObj);

    const modal = document.createElement('div');
    modal.className = 'modal-overlay modal-announcement-popup';
    modal.dataset.annId = selectedAnn.id;
    modal.innerHTML = `
      <div style="width:620px; max-width:94vw; background:#ffffff; border-radius:16px; box-shadow:0 25px 50px -12px rgba(15,23,42,0.25); overflow:hidden; border:1px solid #e2e8f0; animation:modalFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);">
        
        <!-- 渐变高颜值头部 -->
        <div style="background:linear-gradient(135deg, ${isAnnTaskExpired ? '#991b1b, #dc2626' : '#4338ca, #6366f1'}); padding:20px 24px; display:flex; justify-content:space-between; align-items:center; color:#ffffff;">
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="width:42px; height:42px; border-radius:12px; background:rgba(255,255,255,0.2); display:flex; align-items:center; justify-content:center; font-size:22px; flex-shrink:0;">
              ${isAnnTaskExpired ? '🛑' : '🔔'}
            </div>
            <div>
              <div style="display:flex; align-items:center;">
                <h3 style="margin:0; font-size:17.5px; font-weight:800; color:#ffffff; letter-spacing:0.3px;">课堂教学通知</h3>
                ${queueBadge}
              </div>
              <div style="font-size:12px; color:#e0e7ff; margin-top:2px;">${isAnnTaskExpired ? '⚠️ 该通知关联任务已截止，仅供查阅历史教学指示' : '任课教师即时推送的教学指示与随附教学资源'}</div>
            </div>
          </div>
          <button id="btn-close-ann-popup" style="background:rgba(255,255,255,0.15); border:1px solid rgba(255,255,255,0.3); width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:#ffffff; font-size:14px; transition:all 0.15s ease;">✕</button>
        </div>

        <!-- 通知内容主体 (带历史通知切换 TAB) -->
        <div style="padding:20px 24px; max-height:65vh; overflow-y:auto; display:flex; flex-direction:column; gap:16px;">
          
          ${myAnns.length > 1 ? `
            <!-- 多条通知从新到旧快捷切换栏 -->
            <div style="display:flex; gap:8px; overflow-x:auto; padding-bottom:6px;">
              ${myAnns.map((a, idx) => {
                const isRead = isAnnRead(a);
                const isCurrent = a.id === selectedAnn.id;
                return `
                  <button class="btn-switch-ann-tab" data-id="${a.id}" style="padding:6px 12px; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer; border:1px solid ${isCurrent ? '#6366f1' : '#e2e8f0'}; background:${isCurrent ? '#eef2ff' : '#ffffff'}; color:${isCurrent ? '#4338ca' : '#64748b'}; white-space:nowrap; display:inline-flex; align-items:center; gap:6px;">
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
                📢 ${escapeHtml(selectedAnn.title)}
              </h4>
              <span style="font-size:11.5px; color:#64748b; white-space:nowrap;">${escapeHtml(selectedAnn.time || '')}</span>
            </div>

            <!-- 标签栏 -->
            <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:14px;">
              <span style="background:#f8fafc; color:#475569; border:1px solid #e2e8f0; padding:3px 10px; border-radius:6px; font-size:11.5px; font-weight:700;">
                👨‍🏫 发布教师: <b>${escapeHtml(selectedAnn.author || '任课教师')}</b>
              </span>
              <span style="background:#f5f3ff; color:#7c3aed; border:1px solid #ddd6fe; padding:3px 10px; border-radius:6px; font-size:11.5px; font-weight:700;">
                📌 关联任务: <b>${escapeHtml(selectedAnn.taskTitle || '全流程写作')}</b>
              </span>
              <span style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; padding:3px 10px; border-radius:6px; font-size:11.5px; font-weight:700;">
                🎯 受众: <b>${escapeHtml(selectedAnn.targetGroupName || '全班所有小组')}</b>
              </span>
              ${isAnnTaskExpired ? `
                <span style="background:#fef2f2; color:#dc2626; border:1px solid #fecaca; padding:3px 10px; border-radius:6px; font-size:11.5px; font-weight:800;">
                  🛑 任务已截止 · 只读查阅
                </span>
              ` : (isSelectedRead ? `
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
          <button id="btn-read-confirm" style="flex:1; background:${isSelectedRead ? '#e2e8f0' : 'linear-gradient(135deg, #059669, #047857)'}; color:${isSelectedRead ? '#64748b' : '#ffffff'}; border:none; padding:11px 24px; border-radius:8px; font-size:13.5px; font-weight:700; cursor:pointer; box-shadow:${isSelectedRead ? 'none' : '0 3px 10px rgba(5,150,105,0.2)'}; display:inline-flex; align-items:center; justify-content:center; gap:6px;">
            ${isSelectedRead ? '✅ 本条已确认已读 (点击关闭/下一条)' : (unreadList.length > 1 ? `✅ 确认本条已读并看下一条 (${unreadIndex + 1}/${unreadList.length}) ➔` : '✅ 我已阅读并确认 (已同步至教师端)')}
          </button>
        </div>

      </div>
    `;
    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    modal.querySelector('#btn-close-ann-popup').addEventListener('click', closeModal);
    modal.querySelector('#btn-close-ann-bottom').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

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

    const confirmBtn = modal.querySelector('#btn-read-confirm');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => {
        confirmBtn.style.pointerEvents = 'none';
        confirmBtn.textContent = '✅ 已确认';

        // 1. 标记本条为已读 (个人独立已读 + 小组聚合)
        this.authManager.markAnnouncementRead(selectedAnn.id, groupId);
        closeModal();

        const allTasks = this.authManager.getTasks();

        // 2. 重新获取严格属于【当前班级 + 当前任务 + 当前小组】的未读通知列表（排除刚刚已确认的本条与已截止任务）
        const updatedAllAnns = this.authManager.getAnnouncements();
        const nextUnreads = updatedAllAnns
          .filter(a => {
            if (a.id === selectedAnn.id) return false;
            if (a.taskId && a.taskId !== 'task_all') {
              const tObj = allTasks.find(t => t.id === a.taskId);
              if (tObj && isTaskExpired(tObj)) return false;
            }
            const matchClass = !a.classId || a.classId === 'all' || a.classId === effectiveClassId;
            const matchGroup = !a.targetGroupId || a.targetGroupId === 'all' || a.targetGroupId === groupId ||
              (Array.isArray(a.targetGroupIds) && (a.targetGroupIds.includes('all') || a.targetGroupIds.includes(groupId)));
            const matchTask = a.taskId === 'task_all' || a.taskId === activeTaskId || (!a.taskId && activeTaskId === 'task_default');
            return matchClass && matchGroup && matchTask && !isAnnRead(a);
          })
          .sort((a, b) => (b.id > a.id ? 1 : -1));

        // 3. 如果当前任务还有未读通知，自动连续弹出下一条让学生一一确认；如果全确认完则刷新当前视图
        if (nextUnreads.length > 0) {
          setTimeout(() => this.showAnnouncementModal(nextUnreads[0], true), 200);
        } else {
          if (window.app && window.app.showNotification) {
            window.app.showNotification('🎉 所有课堂通知已确认已读');
          }
          if (this.state.studentViewMode === 'task_list') {
            this.renderMain();
          } else {
            this.renderStudentWorkspace();
          }
        }
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
          const reader = new FileReader();
          reader.onload = (ev) => {
            const imgData = ev.target.result;
            const currentUser = this.authManager.getCurrentUser();
            const studentCode = currentUser ? (currentUser.studentCode || 'A') : 'A';
            const currentStage = this.state.currentStage;
            const msgObj = {
              sender: studentCode,
              text: `[IMG_DATA]:${imgData}`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              _timeMs: Date.now()
            };
            if (!this.state.chatLogs[currentStage]) this.state.chatLogs[currentStage] = [];
            this.state.chatLogs[currentStage].push(msgObj);
            this.syncChatLogs();
            renderChat(this.state);
          };
          reader.readAsDataURL(file);
          fileInputImg.value = '';
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

      // ── 流程图节点：阶段一全员投票完成后，检测到组内讨论差不多了，拍卖师提示学生去点击生成公约 ──
      if (currentStage === 'stage1' && !this.state.stage1.contract.isDraftGenerated && !this.state.stage1.contract.isConfirmed) {
        const s1 = this.state.stage1;
        const votesCastCount = Object.values(s1.hasVoted || {}).filter(Boolean).length;
        const totalMembersCount = Object.keys(this.state.members || {}).length || 3;
        
        if (votesCastCount >= totalMembersCount && !this.state.stage1DraftPromptSent) {
          this.stage1StudentChatCount = (this.stage1StudentChatCount || 0) + 1;
          const isDiscussionSignal = /(?:分工|我负责|负责|时间|写第|公约|章节|选题|主题|草案|生成|差不多|定下来|同意|好的|没问题|对齐)/i.test(text);
          if (this.stage1StudentChatCount >= 2 || isDiscussionSignal) {
            this.state.stage1DraftPromptSent = true;
            setTimeout(() => {
              const promptMsg = {
                sender: 'auctioneer',
                text: `🤖 【拍卖师提示】：小组成员已就研究主题、方案内容、写作分工与时间安排展开了充分研讨！\n👉 请点击左侧【🤖 研讨差不多了？一键提炼研讨共识生成公约草案】按钮，AI 将自动提炼生成公约草案。\n🔍 **草案生成后请全组成员认真检查各项分工与时间安排，并按需进行自主修改微调**，确认无误后全员签署生效！`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                _timeMs: Date.now()
              };
              this.state.chatLogs.stage1.push(promptMsg);
              this.syncChatLogs();
              if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
              renderChat(this.state);
            }, 1200);
          }
        }
      }

      // ── 智能感知：如果处于【半程会议后等待组内商讨】状态，当学生在研讨区完成交流后触发审稿编辑 ──
      if (currentStage === 'stage2' && this.state.stage2PendingReviewing) {
        this.state.stage2PendingReviewing.studentMsgCount = (this.state.stage2PendingReviewing.studentMsgCount || 0) + 1;
        const isConsensusSignal = /(?:对齐|同意|商量好了|商定好了|修改|明白了|收到|按这个改|@审稿编辑|统一了|没问题)/i.test(text);
        const hasSufficientChat = this.state.stage2PendingReviewing.studentMsgCount >= 2; // 至少进行了 2 轮发言
        if (isConsensusSignal || hasSufficientChat) {
          setTimeout(() => {
            this.triggerReviewingEditorAfterDiscussion();
          }, 1200);
          return;
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
    try {
    const stage = this.state.currentStage;
    const isExplicitMention = userMsg.includes('@');
    // 阶段一专属里程碑：学生在研讨中商定好分工/时间并确认时触发拍卖师生成合约
    const isContractFinalizeSignal = stage === 'stage1' && /(?:分工确定|确定分工|商定好了|分工好了|确定主题|生成合约|确认分工|时间分配好了|分配完毕|达成共识)/i.test(userMsg);

    if (!isExplicitMention && !isContractFinalizeSignal) return;

    let replyAgent = null;
    let defaultFallbackText = '';

    if (isContractFinalizeSignal) {
      replyAgent = 'auctioneer';
    } else if (userMsg.includes('@中间委员') || userMsg.includes('@中间委员 Agent')) {
      replyAgent = 'neutral';
      defaultFallbackText = `🟡 【中间委员回复】：收到关注！对于正反两方质询，建议团队权衡取舍，在终稿中强化论证逻辑！`;
    } else if (userMsg.includes('@正方委员') || userMsg.includes('@正方委员 Agent')) {
      replyAgent = 'proponent';
      defaultFallbackText = `🟢 【正方委员回复】：建议团队在方案中进一步突出创新点与应用价值！`;
    } else if (userMsg.includes('@反方委员') || userMsg.includes('@反方委员 Agent')) {
      replyAgent = 'opponent';
      defaultFallbackText = `🔴 【反方委员回复】：请团队审视研究设计的严谨性，在方法中必须交代抽样代表性与工具信效度！`;
    } else if (userMsg.includes('@审稿编辑') || userMsg.includes('@审稿编辑 Agent')) {
      replyAgent = 'reviewingEditor';
      defaultFallbackText = `📝 【审稿编辑针对性指导】：收到你的问询！请确保正文各级标题层级分明，理论概念与测量量表精确对应！`;
    } else if (userMsg.includes('@责任编辑') || userMsg.includes('@责任编辑 Agent')) {
      replyAgent = 'managingEditor';
      defaultFallbackText = `🤝 【责任编辑过程学伴回复】：收到 @ 呼叫！目前小组协同节奏良好，建议组员按合约分工分块推进正文写作。`;
    } else if (userMsg.includes('@拍卖师') || userMsg.includes('@拍卖师 Agent')) {
      replyAgent = 'auctioneer';
      defaultFallbackText = `🎪 【拍卖师选题顾问回复】：收到！已为您关注组内研讨进展。请大家在左侧查看《学术合作合约》，确认主题、分工与时间无误后全员签署！`;
    }

    if (!replyAgent) return;

    this.studentMsgCountSinceLastAgent = 0;
    const currentUser = this.authManager.getCurrentUser();
    const currentTopic = this.state.stage1 ? this.state.stage1.mergedTitle : '';
    const actualDocContent = (this.state.stage2 && this.state.stage2.unifiedContent) ? this.state.stage2.unifiedContent.replace(/<[^>]*>/g, '').trim() : '';

    // 直接异步直连 Coze API 获得真实大模型智能体深度审阅回复
    let replyText = await callCozeAgentAPI(replyAgent, userMsg, {
      stage: stage,
      topic: currentTopic,
      actualDoc: actualDocContent,
      userId: currentUser ? (currentUser.id || currentUser.username) : 'student_user'
    });

    if (!replyText || replyText.trim().length === 0) {
      replyText = `⚠️ 【系统提示】：大模型智能体未返回有效应答（请检查网络连接或接口状态）。`;
    }

    const agentMsgObj = {
      sender: replyAgent,
      text: replyText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      _timeMs: Date.now()
    };
    if (!this.state.chatLogs[stage]) this.state.chatLogs[stage] = [];
    this.state.chatLogs[stage].push(agentMsgObj);
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
    const isAlreadyVoted = (s1.hasVoted && (s1.hasVoted[user] || (currUserObj && (s1.hasVoted[currUserObj.id] || s1.hasVoted[currUserObj.studentCode]))));
    if (isAlreadyVoted) { alert('⚠️ 投票已被锁定！每位成员首次投票后不能再修改选项。'); return; }
    if (!s1.hasVoted) s1.hasVoted = {};
    if (!s1.votes) s1.votes = {};
    // 单一规范 key 写入，避免 id/studentCode 三键冗余导致的去重与调试混乱
    s1.votes[user] = proposalId;
    s1.hasVoted[user] = true;
    s1._lastVoteTime = Date.now();
    const proposal = (s1.proposals || []).find(p => p.id === proposalId);
    const membersList = Object.values(this.state.members || {});
    const totalMembersCount = membersList.length || 3;
    const votesCastCount = membersList.filter(m => s1.hasVoted[m.id] || s1.hasVoted[m.studentCode]).length;
    const voteMsg = { sender: user, text: `📢 [投票告知]: 我已确认投票支持提案《${proposal ? proposal.title : proposalId}》！（当前全组已集齐 ${votesCastCount}/${totalMembersCount} 票）`, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
    this.state.chatLogs.stage1.push(voteMsg);
    this.syncStage1();
    this.syncChatLogs();
    if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();

    if (votesCastCount >= totalMembersCount) {
      // ── 全员投票完成：调用大模型拍卖师 API 动态生成专业落槌播报与研讨引导 ──
      setTimeout(async () => {
        const tally = {};
        membersList.forEach(m => {
          const pId = s1.votes[m.id] || s1.votes[m.studentCode];
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

        if (!s1.mergedTitle && winningProposal) {
          s1.mergedTitle = winningProposal.title;
        }
        if (!s1.contract.timeAllocations) {
          s1.contract.timeAllocations = { background: 25, literature: 30, questions: 25, method: 40, reflection: 20, references: 10 };
        }

        const isUnanimous = (maxVotes === totalMembersCount);
        const voteContextPrompt = `全组投票已全部完成！计票结果：${proposalSummaryList}。${isUnanimous ? '全员一致投出最高票《' + (winningProposal ? winningProposal.title : '') + '》' : '投票存在分歧，最高票为《' + (winningProposal ? winningProposal.title : '') + '》'}。
请作为拍卖师发表 130~160 字的落槌定题与选题推进引导：
① 宣布竞拍落槌结果，肯定课题《${winningProposal ? winningProposal.title : ''}》的理论与实践价值；
② 给出 1~2 点具体的研究深化构思建议，启发组员将选题细化为具体研究方案；
③ 引导组长带头在讨论区组织全组围绕该选题展开深度研讨（【核心铁律】：绝不提前包揽提醒分工与时间规划！）。`;

        let summaryText = await callCozeAgentAPI('auctioneer', voteContextPrompt, {
          stage: 'stage1',
          isUnanimous,
          winningTopic: winningProposal ? winningProposal.title : '',
          tallySummary: proposalSummaryList
        });

        if (!summaryText || summaryText.trim().length === 0) {
          summaryText = `🎪 【拍卖师·落槌定题播报】\n全员投票已全部完成！计票结果：${proposalSummaryList}。\n${isUnanimous ? '🎉 全员一致推选《' + winningProposal.title + '》为本组最终研究课题！' : '⚖️ 组内存在不同视角，当前最高票为《' + winningProposal.title + '》！'}\n\n💡 该课题立意新颖且切中教学实践需求！建议组长带头在研讨区发起交流，大家共同头脑风暴细化具体的研究目标与核心切入点！`;
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
    // 🛡️ 铁律：教师端后台监控绝不触发智能体开场白生成；仅允许真实学生进入该阶段时生成
    if (isTeacher || this.state.isTeacherMonitorView || this.state.isTeacherView) {
      return;
    }

    if (!this.state.chatLogs[stage]) this.state.chatLogs[stage] = [];
    const logs = this.state.chatLogs[stage];
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // 🎪 阶段一：拍卖师欢迎开场白
    if (stage === 'stage1') {
      const hasAuctioneerIntro = logs.some(m => m.sender === 'auctioneer' && m.text.includes('欢迎来到【阶段一：学术拍卖会】'));
      if (!hasAuctioneerIntro) {
        const welcomeMsg = {
          sender: 'auctioneer',
          text: `🎪 【拍卖师开场】：欢迎来到【阶段一：学术拍卖会】！我是本阶段的选题顾问拍卖师。\n请全组成员点击左侧【提交我的选题】提出各自的研究构想，并在研讨区充分交流。我们将通过拍卖投票遴选最佳提案，并在下方《学术合作公约》中商定分工与时间分配！`,
          timestamp: now,
          _timeMs: Date.now()
        };
        logs.unshift(welcomeMsg);
        this.syncChatLogs();
        renderChat(this.state);
      }
    }

    // 🤝 阶段二：责任编辑欢迎 + 重复上轮分工时间分配 ➔ 审稿编辑提醒推送范文
    else if (stage === 'stage2') {
      const hasManagingIntro = logs.some(m => m.sender === 'managingEditor' && m.text.includes('欢迎来到【阶段二：学术编辑部】'));
      if (!hasManagingIntro) {
        const s1 = this.state.stage1 || {};
        const topic = s1.mergedTitle || '未定课题';
        const tasks = s1.contract && s1.contract.taskAssignments ? s1.contract.taskAssignments : {};
        const times = s1.contract && s1.contract.timeAllocations ? s1.contract.timeAllocations : {};
        
        let assignSummary = [];
        Object.keys(this.state.members || {}).forEach(mId => {
          const m = this.state.members[mId];
          const t = tasks[mId] || '待认领';
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
          sender: 'managingEditor',
          text: `🤝 【责任编辑开场】：欢迎来到【阶段二：学术编辑部】！我是过程学伴责任编辑。\n全组已锁定研究主题《${topic}》。\n\n📜 【阶段一公约执行与协同提醒】\n• 基础分工: ${assignSummary.join(' | ') || '全员协作'}\n• 规划时间: ${timeSummary.join(' / ') || '按需推进'}\n\n💡 **真正的协同不仅是分工起草，更要主动研读同伴写下的段落，在研讨区互评互修、打通前后逻辑！**请大家进入左侧编辑器开启深度协作！`,
          timestamp: now,
          _timeMs: Date.now()
        };
        logs.unshift(managingWelcome);
        this.syncChatLogs();
        renderChat(this.state);

        setTimeout(() => {
          const reviewingWelcome = {
            sender: 'reviewingEditor',
            text: `📝 【审稿编辑提醒】：为辅助各位高效产出高质量学术论文，已为本组匹配并推送了《课程学术参考范文库》！请大家点击上方【📚 查阅参考范文】查阅学习，注意正文三线表规范与研究设计严谨度！`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            _timeMs: Date.now()
          };
          logs.push(reviewingWelcome);
          this.syncChatLogs();
          renderChat(this.state);
        }, 3200);
      }
    }

    // 🎓 阶段三：严格按时序：① 中间委员开场 ➔ ② 正方肯定 ➔ ③ 反方质询 ➔ ④ 平台写入矩阵 ➔ ⑤ 中间委员抛题引导
    else if (stage === 'stage3') {
      const hasNeutralIntro = logs.some(m => m.sender === 'neutral' && m.text.includes('欢迎来到【阶段三：答辩擂台】'));
      if (!hasNeutralIntro && !this.state.stage3IntroStarted) {
        this.state.stage3IntroStarted = true;
        const neutralWelcome = {
          sender: 'neutral',
          text: `🟡 【中间委员开场】：各位研究者，欢迎来到【阶段三：答辩擂台】！初稿撰写完毕，答辩委员会已就位，接下来将由正方委员与反方委员分别发表评审意见！`,
          timestamp: now,
          _timeMs: Date.now()
        };
        logs.unshift(neutralWelcome);
        this.syncChatLogs();
        renderChat(this.state);

        const topic = (this.state.stage1 && this.state.stage1.mergedTitle) ? this.state.stage1.mergedTitle : '本组研究设计';
        const rawContent = (this.state.stage2 && this.state.stage2.unifiedContent) ? this.state.stage2.unifiedContent.replace(/<[^>]*>/g, '').trim() : '';

        // 2. 依次异步调用【正方】与【反方】
        setTimeout(async () => {
          const propPrompt = `针对小组论文《${topic}》，请通读其真实正文切片：
${rawContent.slice(0, 1000)}

请作为答辩正方委员，发表 130~160 字的评审意见：
① 至少提炼 2 个具体优点（既包含学术层面的立意与设计亮点，也包含行文风格与结构规范亮点）；
② 明确指出具体段落（如【一、研究背景】或【二、文献综述】）的论证优势，给予具体肯定的学术支持！`;

          let propText = await callCozeAgentAPI('proponent', propPrompt, { stage: 'stage3', topic, actualDoc: rawContent });
          if (!propText || propText.trim().length === 0) {
            propText = `🟢 【正方委员·立论支持】：通读全篇，该研究《${topic}》立意新颖，【研究背景】对核心概念阐述清晰，行文流畅严谨。同时【研究设计】结构完整，理论与实践结合紧密，具备较高的学术探讨价值与实践应用前景，值得充分肯定！`;
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
            const oppPrompt = `针对小组论文《${topic}》，请通读其真实正文切片：
${rawContent.slice(0, 1000)}

【正方委员刚才的肯定意见参考】:
${propText}

请作为答辩反方委员，发表 130~160 字的辩证审视与质询意见：
【最高原则与正反博弈边界】：正方明确夸赞的具体局部段落与具体事实严禁唱反调；但对于未被明确夸赞的具体内容维度（即使在同一章节，例如正方夸了背景立意新颖，你仍可质询其具体实证数据支撑不足），以及全篇方案的落地可行性、样本控制、量表信效度检验、行文通顺与测量严密性等，提出至少 2 个具体的学术质询点（用 ①② 分条呈现）！`;

            let oppText = await callCozeAgentAPI('opponent', oppPrompt, { stage: 'stage3', topic, actualDoc: rawContent });
            if (!oppText || oppText.trim().length === 0) {
              oppText = `🔴 【反方委员·辩证质询】：构想虽具前瞻性，但立足落地性提出两点质询：① 【四、研究设计】中样本量与平行班对照的具体控制变量未详述，外部推广度存疑；② 核心量表未交代信效度检验流程，行文中的变量测量论据略显单薄，需说明补救方案！`;
            }
            logs.push({
              sender: 'opponent',
              text: oppText,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              _timeMs: Date.now()
            });

            // 平台自动将正反评审意见写入左侧【答辩裁决矩阵】
            if (!this.state.stage3.feedbackItems || this.state.stage3.feedbackItems.length === 0) {
              this.state.stage3.feedbackItems = [
                { id: 'fb_prop', role: 'proponent', speaker: '正方委员 Agent (肯定支持)', title: '立论支持', content: propText.replace(/^[^\n]*【[^】]+】\s*/, ''), response: '', status: 'adopted' },
                { id: 'fb_opp_1', role: 'opponent', speaker: '反方委员 Agent (尖锐质询)', title: '质询 1', content: '质询 1：研究设计的落地实施中控制变量与外推效度说明不足，需明确具体控制方案。', response: '', status: 'pending' },
                { id: 'fb_opp_2', role: 'opponent', speaker: '反方委员 Agent (尖锐质询)', title: '质询 2', content: '质询 2：测量工具与核心变量论据支撑略显单薄，需补充信效度检验与操作化依据。', response: '', status: 'pending' }
              ];
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

请作为答辩委员会主席（中间委员），发表 130~160 字的主持引导：
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

    // 🛡️ 正文草稿锁存：切换前将富文本当前内容完整持久化存入内存与快照，绝不丢字
    if (this.state.currentStage === 'stage2' && window._jizhi_quill && window._jizhi_quill.root) {
      const liveHtml = window._jizhi_quill.root.innerHTML.replace(/<span class="remote-cursor-widget"[\s\S]*?<\/span>/gi, '');
      if (liveHtml && liveHtml.trim() !== '<p><br></p>') {
        if (!this.state.stage2) this.state.stage2 = {};
        this.state.stage2.unifiedContent = liveHtml;
      }
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
        this.renderMain();
      }
    );

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
      onContractChange: () => {
        this.syncStage1();
      },
      onAiGenerateContract: () => {
        const s1 = this.state.stage1;
        s1.contract.isDraftGenerated = true;
        s1.contract._draftedTime = Date.now();
        if (!s1.contract.taskAssignments) s1.contract.taskAssignments = {};

        // 1. 提炼最高票选题作为融合研究主题
        if (!s1.mergedTitle || s1.mergedTitle.trim().length === 0) {
          const tally = {};
          Object.values(s1.votes || {}).forEach(pId => { if (pId) tally[pId] = (tally[pId] || 0) + 1; });
          let winningP = null;
          let maxV = -1;
          (s1.proposals || []).forEach(p => {
            const cnt = tally[p.id] || 0;
            if (cnt > maxV) { maxV = cnt; winningP = p; }
          });
          s1.mergedTitle = winningP ? winningP.title : ((s1.proposals && s1.proposals[0]) ? s1.proposals[0].title : '基于多智能体协同的学术论文写作与研究设计方案');
        }

        // 2. 提炼 6 大章节的分工安排
        const defaultTasks = [
          '负责“一、研究背景与意义”及“二、文献综述”起草与资料整理',
          '负责“三、研究问题与假设”及“四、研究设计与方法”方案制定',
          '负责“五、不足与反思”撰写及全篇“六、参考文献”引文校对',
          '负责数据分析模型构建与研究工具问卷设计'
        ];
        Object.values(this.state.members || {}).forEach((m, idx) => {
          const taskStr = defaultTasks[idx % defaultTasks.length] || '协作撰写与统稿';
          s1.contract.taskAssignments[m.id] = taskStr;
          if (m.studentCode) s1.contract.taskAssignments[m.studentCode] = taskStr;
        });

        // 3. 提炼各模块时间规划
        s1.contract.timeAllocations = { background: 25, literature: 30, questions: 25, method: 40, reflection: 20, references: 10 };
        
        // 4. 局部填入输入框，绝不暴力销毁 DOM
        const topicInp = document.getElementById('contract-topic-input');
        if (topicInp) topicInp.value = s1.mergedTitle;

        document.querySelectorAll('.task-assignment-input').forEach(inp => {
          const mId = inp.dataset.mid;
          const code = inp.dataset.code;
          const val = s1.contract.taskAssignments[mId] || s1.contract.taskAssignments[code] || '';
          inp.value = val;
        });
        document.querySelectorAll('.contract-time-input').forEach(inp => {
          const k = inp.dataset.key;
          if (k && s1.contract.timeAllocations[k] !== undefined) {
            inp.value = s1.contract.timeAllocations[k];
          }
        });

        // 5. 拍卖师在聊天区提示学生去检查并微调修改
        const draftNoticeMsg = {
          sender: 'auctioneer',
          text: `✨ 【拍卖师·公约草案已生成】\n已基于大家的研讨共识与投票结果生成《团队协同合作学术合约草案》！\n\n👉 **请各位组员在左侧仔细检查确认各项研究模块的分工与时间预算，可直接在输入框中自主微调修改**；\n✍️ 确认无误后，请每位成员点击【确认签署公约】，全员签署后公约正式生效并解锁阶段二！`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          _timeMs: Date.now()
        };
        if (!this.state.chatLogs.stage1) this.state.chatLogs.stage1 = [];
        this.state.chatLogs.stage1.push(draftNoticeMsg);
        this.syncStage1();
        this.syncChatLogs();
        if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
        renderChat(this.state);
      },
      onConfirmContract: () => {
        if (this.state.stage1.contract.isConfirmed) {
          alert('🔒 学术合作合约已被全员确认签署并锁定！无法二次修改。');
          return;
        }
        const user = this.state.currentUser;
        const s1 = this.state.stage1;
        const totalMembersCount = Object.keys(this.state.members).length;
        if (!s1.contract.confirmedMembers) s1.contract.confirmedMembers = {};
        // 同时写入 studentCode 与 member.id，彻底杜绝 ID 不一致
        s1.contract.confirmedMembers[user] = true;
        if (this.state.members[user]) {
          s1.contract.confirmedMembers[this.state.members[user].id] = true;
        }
        const confirmedCount = Object.values(this.state.members).filter(m => s1.contract.confirmedMembers[m.id] || s1.contract.confirmedMembers[m.studentCode]).length;
        const memberName = this.state.members[user] ? this.state.members[user].name : user;
        const confirmMsg = { sender: user, text: `📢 [合约签署告知]: 我 (${memberName}) 已按键确认签署合作学术合约！（全组确认进度: ${confirmedCount}/${totalMembersCount} 人）`, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
        this.state.chatLogs.stage1.push(confirmMsg);
        this.syncStage1();
        this.syncChatLogs();
        if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
        if (confirmedCount < totalMembersCount) {
          alert(`✅ 您 (${memberName}) 已成功签署学术合作公约！\n\n当前签署进度：${confirmedCount}/${totalMembersCount} 人已签署。\n请提醒组内其他同学尽快签署，全员签署完毕后全组将自动解锁并推进至【阶段二：学术编辑部】！`);
        } else {
          s1.contract.isConfirmed = true;
          this.state.groupMaxStage = 'stage2';
          this.syncStage1();
          this.syncStageChange('stage2');
          if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
          setTimeout(() => {
            const finalMsg = { sender: 'auctioneer', text: `🎪 【拍卖师宣布】：恭喜！组内全员 ${totalMembersCount}/${totalMembersCount} 名成员已全部完成公约签署！学术合作公约正式生效，阶段一圆满结束，系统自动解锁【阶段二：学术编辑部】！`, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
            this.state.chatLogs.stage1.push(finalMsg);
            this.syncChatLogs();
            if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
            alert(`🎉 恭喜！组内全员完成公约签署！学术合作公约生效，系统自动解锁【阶段二：学术编辑部】！`);
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

        // 🚀 纯粹 CRDT 架构：打字仅驱动贡献比与智能体语境分析，0 次网络快照骚扰
        if (this._contentSyncDebounceTimer) {
          clearTimeout(this._contentSyncDebounceTimer);
        }
        this._contentSyncDebounceTimer = setTimeout(() => {
          this.updateContributionUi();
          this.checkAgentTriggersOnContent(cleanHtml);
        }, 600);
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
      onProxyGenerateActionPlan: () => {
        this.onProxyGenerateActionPlan();
      },
      onConfirmStage2Draft: () => {
        if (this.state.stage2.isDraftConfirmed) {
          alert('🔒 正文初稿已被组内确认！已解锁阶段三。');
          return;
        }
        const user = this.state.currentUser || 'A';
        const s2 = this.state.stage2;
        const membersList = Object.values(this.state.members || {});
        const totalMembersCount = membersList.length || 3;
        if (!s2.confirmedMembers) s2.confirmedMembers = {};
        s2.confirmedMembers[user] = true;
        if (this.state.members[user]) {
          s2.confirmedMembers[this.state.members[user].id] = true;
        }
        const confirmedCount = membersList.filter(m => s2.confirmedMembers[m.id] || s2.confirmedMembers[m.studentCode]).length;
        const memberName = this.state.members[user] ? this.state.members[user].name : user;
        const confirmMsg = {
          sender: user,
          text: `📢 [初稿确认告知]: 我 (${memberName}) 已确认完成正文初稿！（全组初稿确认进度: ${confirmedCount}/${totalMembersCount} 人）`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          _timeMs: Date.now()
        };
        if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
        this.state.chatLogs.stage2.push(confirmMsg);
        this.syncStage2();
        this.syncChatLogs();
        if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();

        if (confirmedCount < totalMembersCount) {
          alert(`✅ 您 (${memberName}) 已成功确认正文初稿！\n\n当前组内确认进度：${confirmedCount}/${totalMembersCount} 人已确认。\n请提醒组内其他同学尽快确认，全员确认完毕后全组将自动解锁并推进至【阶段三：答辩擂台】！`);
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
              sender: 'reviewingEditor',
              text: `🎉 【审稿编辑宣布】：恭喜！组内全员 ${totalMembersCount}/${totalMembersCount} 名成员已全部确认正文初稿定稿！阶段二圆满结束，系统自动解锁【阶段三：答辩擂台】！`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              _timeMs: Date.now()
            };
            if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
            this.state.chatLogs.stage2.push(finalMsg);
            this.syncChatLogs();
            if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
            alert(`🎉 恭喜！组内全员完成初稿确认！系统自动解锁【阶段三：答辩擂台】！`);
            this.switchStage('stage3', true);
          }, 600);
        }
        this.renderStudentWorkspace();
      },
      onConfirmStage3Revision: () => {
        const user = this.state.currentUser || 'A';
        const s3 = this.state.stage3;
        const membersList = Object.values(this.state.members || {});
        const totalMembersCount = membersList.length || 3;
        if (!s3.confirmedMembers) s3.confirmedMembers = {};
        s3.confirmedMembers[user] = true;
        if (this.state.members[user]) {
          s3.confirmedMembers[this.state.members[user].id] = true;
        }
        const confirmedCount = membersList.filter(m => s3.confirmedMembers[m.id] || s3.confirmedMembers[m.studentCode]).length;
        const memberName = this.state.members[user] ? this.state.members[user].name : user;
        const confirmMsg = {
          sender: user,
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
            text: `🏆 【中间委员·终稿就绪】：组内全员已确认终稿修改完毕！请组长或代表点击右上方【🚀 提交论文终稿】完成全盘归档！`,
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
      const contentSnippet = (methodIndex > 200) ? rawDoc.slice(0, methodIndex).trim() : rawDoc.slice(0, 1200);

      setTimeout(async () => {
        const firstReviewPrompt = `团队正在撰写课题《${topic}》，目前已写完研究背景、文献综述与研究问题章节，完整切片如下：\n${contentSnippet}\n请作为审稿编辑对该切片进行实质性学术质检，发表 130~160 字的针对性指导：肯定其背景立意与文献归纳亮点，结合切片中写到的具体概念与变量，指出文献综述与研究问题推导中的 1 处具体对应衔接建议（确保后续方法能呼应问题），绝不讲空泛套话，鼓励团队继续推进！`;
        let firstReviewText = await callCozeAgentAPI('reviewingEditor', firstReviewPrompt, { stage: 'stage2', topic, actualDoc: contentSnippet });
        if (!firstReviewText || firstReviewText.trim().length === 0) {
          firstReviewText = `📝 【审稿编辑·初稿进展建议】：通读了大家撰写的背景与文献综述部分，论证框架清晰！针对切片中梳理的文献与提出的研究问题，建议对核心变量的操作化定义再做细微补充，确保文献综述的理论依据能精准支撑后续的研究方法设计，大家在讨论区交流一下，继续稳步推进！`;
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

    // 4. 🎯 终审里程碑雷达：推进到【六、参考文献】时触发终审排版与格式规范提醒
    const hasReferenceSection = /(?:六、|第6章|第六部分|参考文献|References|gb\/t\s*7714)/i.test(newContent);
    if (hasReferenceSection && !this.state.stage2RefFormatReviewed && timeSinceLastReviewing > 60000) {
      this.state.stage2RefFormatReviewed = true;
      const refReviewMsg = {
        sender: 'reviewingEditor',
        text: `📝 【审稿编辑·终审格式与参考文献规范提醒】：关注到团队已推进至【参考文献】收尾部分，全篇已基本成型！在最终冲刺阶段，请大家重点自查排版细节：① 参考文献是否符合标准 GB/T 7714 格式（含著者、题目、刊名、年份、期卷、页码）；② 各级标题序号是否统一；③ 表格是否采用标准学术三线表。做好细节润色，准备迎接阶段三答辩！`,
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
          const leaderName = membersList[0] ? membersList[0].name : '组长';
          const ssrlWarningMsg = {
            sender: 'managingEditor',
            text: `🤝 【责任编辑·协同关怀】：关注到当前正文撰写推进中，各成员的投入占比出现了一定程度的分化。建议组长（${leaderName}）与组员在讨论区适度协调分工，鼓励尚未充分动笔的同学认领后续章节，共同推进高质量学术成稿哦~`,
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
              </div>

              <div style="background:#ffffff; padding:10px 14px; border-radius:8px; border:1px solid #e2e8f0; display:flex; flex-direction:column; gap:6px;">
                <label style="font-size:12.5px; color:#1e293b; font-weight:700;">3. 全篇衔接与贯通：各章节之间的逻辑连贯性？</label>
                <select id="meeting-transition-select" class="teacher-input" style="width:100%; padding:6px 10px; font-size:12.5px; border-radius:6px; border:1px solid #cbd5e1; background:#ffffff;">
                  <option value="环环相扣，前后呼应非常自然顺畅">✅ 环环相扣，前后呼应非常自然顺畅</option>
                  <option value="局部章节过渡稍显生硬，需商定衔接句">🔄 局部章节过渡稍显生硬，需商定衔接句</option>
                  <option value="各章节相对独立，需进一步统一主线">⚠️ 各章节相对独立，需进一步统一核心主线</option>
                </select>
              </div>

              <!-- 第4题：条件展开章节勾选框（仅在选了不同看法/商榷/生硬时展开） -->
              <div id="meeting-divergence-sections-box" style="background:#fffbeb; padding:10px 14px; border-radius:8px; border:1px solid #fef3c7; display:none; flex-direction:column; gap:6px;">
                <label style="font-size:12.5px; color:#92400e; font-weight:700;">4. 重点关注定位：组内哪些具体章节需要重点商讨或打通衔接？</label>
                <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:4px;">
                  <label style="font-size:12px; color:#451a03; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="div-sec" value="一、研究背景与意义"> 【一、研究背景与意义】</label>
                  <label style="font-size:12px; color:#451a03; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="div-sec" value="二、文献综述与前沿"> 【二、文献综述与前沿】</label>
                  <label style="font-size:12px; color:#451a03; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="div-sec" value="三、研究问题与假设"> 【三、研究问题与假设】</label>
                  <label style="font-size:12px; color:#451a03; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="div-sec" value="四、研究设计与方法"> 【四、研究设计与方法】</label>
                  <label style="font-size:12px; color:#451a03; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="div-sec" value="五、不足与反思"> 【五、不足与反思】</label>
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

    // ── 条件动态显隐监听器（只有在选了不同看法/商榷/生硬时平滑展开第4题） ──
    const peerSelect = modal.querySelector('#meeting-peer-review-select');
    const transitionSelect = modal.querySelector('#meeting-transition-select');
    const themeSelect = modal.querySelector('#meeting-theme-consistency-select');
    const divSecBox = modal.querySelector('#meeting-divergence-sections-box');

    const checkShowSections = () => {
      const pVal = peerSelect ? peerSelect.value : '';
      const tVal = transitionSelect ? transitionSelect.value : '';
      const mVal = themeSelect ? themeSelect.value : '';
      const needShow = pVal.includes('不同看法') || pVal.includes('商榷') || tVal.includes('生硬') || tVal.includes('独立') || mVal.includes('不够充分');
      if (divSecBox) {
        divSecBox.style.display = needShow ? 'flex' : 'none';
        if (!needShow) {
          divSecBox.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
        }
      }
    };

    if (peerSelect) peerSelect.addEventListener('change', checkShowSections);
    if (transitionSelect) transitionSelect.addEventListener('change', checkShowSections);
    if (themeSelect) themeSelect.addEventListener('change', checkShowSections);

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
      const checkedSections = Array.from(modal.querySelectorAll('input[name="div-sec"]:checked')).map(cb => cb.value);
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

      // ── 全员打卡完毕：汇聚全组数据生成【半程编辑修正清单】 ──
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

      this.state.stage2.actionPlan = {
        isGenerated: true,
        items: [
          `【学术构想与论证修正】(重点关注: ${sectionsFocusText}): 针对核心学术瓶颈【${primaryAcademicB}】与组内提问(${questionsList})，在对应章节中补齐操作化测量量表与理论依据。`,
          `【团队协同与分工平衡】: 针对协作难点【${primaryCollabB}】，统一各章节论述用词风格与逻辑过渡，落实 Equal Participation 均等参与。`,
          `【时间节奏与反思深化】: 针对进度难点【${primaryRhythmB}】，把控后半程节奏，优先完成五、研究设计的不足与反思。`
        ]
      };
      this.syncStage2();
      if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
      this.renderStudentWorkspace();

      alert(`🎉 恭喜！组内 ${totalMembersCount} 位成员已全部完成半程自查与互阅打卡！【审稿编辑·半程修正清单】已正式解锁并生成！`);

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

请作为学术编辑部责任编辑（协同主持人与学伴）发表一段充实、真诚、富有启发性的发言（字数控制在 180~230 字，严禁简略敷衍）：
${hasDivergence 
? `【分歧引导主线】：
1. 肯定全组认真通读了彼此撰写的段落；明确说明：通读对比后发现目前初稿中写出的部分内容，与组内部分同学在自查中提出的思路构想存在认知差异与不同看法；
2. 逐一分条列出所涉及的章节（若有多个用 📌 ① 📌 ② 客观列出 ${sectionsFocusText} 各自想商榷的思路焦点）；
3. 针对上述内容分歧给出具体的【分步协商建议】（例如建议大家：先不要急于单打独斗改字，在讨论区按照“先对齐背景的核心概念界定，再商定设计中的具体干预任务与量表指标”的步骤分步商讨，把修改方案达成全组共识；【核心铁律】：责任编辑只客观呈现分歧并给出协商建议，严禁擅自下负面优劣结论！学术对错交由审稿编辑）；
4. 末尾顺带评价时间/协作：若自查中反映了时间紧张则给 1 句调适建议；若时间把控良好/无顾虑，则真诚给予明确夸赞（如夸赞大家推进节奏很稳健）！并预告审稿专家随后将进行正文深度学术质检！`
: '【高度默契赞扬】：旗帜鲜明地给予具体肯定，大力赞扬全组对论文核心立意的高度默契与良好写作节奏，引导大家针对学术难点交流，并预告审稿专家马上为大家做正文深度学术质检！'
}`;

      let managingText = await callCozeAgentAPI('managingEditor', managingPrompt, { stage: 'stage2', topic, bottleneck: bAcademic, peerReview: peerReviewState });
      if (!managingText || managingText.trim().length === 0) {
        managingText = hasDivergence
          ? `🤝 【责任编辑·自查研判与对齐引导】：全员自查清单已生成！关注到组内对目前 ${sectionsFocusText} 的撰写构想持有不同看法想深入商榷。各章节核心论点前后衔接顺畅吗？方法设计能否很好呼应背景提出的问题？大家推进节奏很稳健！👉 请全组先在讨论区花 2~3 分钟商定修改方案、统一思路，随后审稿专家将接着为大家做正文深度学术质检！`
          : `🤝 【责任编辑·高度默契与协同赞扬】：自查清单已生成！太棒了，全组不仅对核心立意认知高度统一（${peerReviewState}），而且各章节撰写节奏顺畅、时间把控极佳！请大家保持这个优秀的团队状态，审稿专家马上接着为大家做正文深度学术质检！`;
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

    const contentSnippet = (this.state.stage2 && this.state.stage2.unifiedContent) ? this.state.stage2.unifiedContent.replace(/<[^>]*>/g, '').slice(0, 1000) : '论文初稿方案';
    const reviewingPrompt = `小组已针对责任编辑提出的自查分歧在讨论区达成了对齐共识。
【课题】: 《${ctx.topic}》
【自查勾选难点】: “${ctx.bAcademic}”
【手填开放提问/困惑】: “${ctx.userText || '无手填提问'}”
【当前真实正文切片】:
${contentSnippet}

请作为国家级核心教育期刊资深审稿编辑，发表 130~160 字的学术内容审查（严格基于上述具体内容展开）：
① 具体难点破解与开放答疑：针对勾选的难点『${ctx.bAcademic}』及手填提问，给出切中该学科具体场景的破解思路；
② 正文切片具体学术质检：通读正文切片，肯定已有框架亮点，精准指出 1 处实际存在的具体章节、具体变量/案例论据薄弱点；
③ 具体修改处方与清单落地：给出具体操作建议（如三线表指标/测量来源），引导全组对照左侧【半程修正清单】分工加速完善！（严禁空泛套话，语气专业严谨）。`;

    let reviewingText = await callCozeAgentAPI('reviewingEditor', reviewingPrompt, { stage: 'stage2', topic: ctx.topic, bottleneck: ctx.bAcademic, actualDoc: contentSnippet });
    if (!reviewingText || reviewingText.trim().length === 0) {
      reviewingText = `📝 【审稿编辑·学术质检与答疑】：针对大家勾选的难点『${ctx.bAcademic}』以及学术困惑：建议从教学任务分层与量表维度适配切入化解难点！同时重点审阅了目前正文：前文立意充分，但后续方法设计中变量的实证数据支撑略显单薄。建议在三线表中补充具体的测量维度与数据来源。请全组对照左侧【半程修正清单】分工加速完善！`;
    }

    const reviewingMsg = {
      sender: 'reviewingEditor',
      text: reviewingText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      _timeMs: Date.now(),
      stage: 'stage2'
    };
    if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
    this.state.chatLogs.stage2.push(reviewingMsg);
    this.state.stage2ReviewingFinishedTime = Date.now();
    this.syncStage2();
    this.syncChatLogs();
    if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
    renderChat(this.state);
  }

  async onProxyGenerateActionPlan() {
    if (this.state.stage2.actionPlan && this.state.stage2.actionPlan.isGenerated) return;
    const user = this.state.currentUser || 'A';
    const currUser = this.authManager.getCurrentUser();
    const isLeader = (user === 'A' || currUser?.role === 'leader' || currUser?.roleTitle?.includes('组长'));
    if (!isLeader) {
      alert('⚠️ 仅组长有权限代表全组一键生成行动清单。');
      return;
    }

    const membersList = Object.values(this.state.members || {});
    const totalCount = membersList.length || 3;
    if (!this.state.stage2.meetingSubmissions) this.state.stage2.meetingSubmissions = {};
    const submissions = this.state.stage2.meetingSubmissions;
    const submittedCount = Object.keys(submissions).length;

    const absentMembers = membersList.filter(m => !submissions[m.id] && !submissions[m.studentCode]);
    const absentNames = absentMembers.map(m => m.name).join('、') || '部分缺勤组员';

    const confirmed = confirm(
      `⚡ 【组长一键代推进】确认：\n\n` +
      `目前在场已打卡人数：${submittedCount}/${totalCount} 人。\n` +
      `未打卡成员（${absentNames}）将被系统记录为缺勤并豁免。\n\n` +
      `是否代表全组立即生成【半程编辑修正清单】并推送提醒给教师端？`
    );
    if (!confirmed) return;

    // 为未打卡的缺勤成员填充默认自查占位
    absentMembers.forEach(m => {
      submissions[m.studentCode] = {
        user: m.studentCode,
        name: m.name,
        themeConsistency: '符合核心假设 (组长代填)',
        peerReviewState: '基本认同 (组长代填)',
        transitionState: '基本连贯 (组长代填)',
        checkedSections: [],
        bAcademic: '理论框架深化',
        bCollab: '章节逻辑衔接',
        bRhythm: '后半程时间掌控',
        userText: '（组长代推进）',
        submittedAt: Date.now(),
        isProxy: true
      };
    });

    this.state.stage2.isProxyMeetingActionPlan = true;
    
    // 生成修正清单
    const topic = (this.state.stage1 && this.state.stage1.mergedTitle) ? this.state.stage1.mergedTitle : '本组课题';
    const allSubs = Object.values(submissions);
    const hasDivergence = allSubs.some(s => (s.themeConsistency || '').includes('偏离') || (s.peerReviewState || '').includes('不同看法') || ((s.checkedSections || []).length > 0));
    const allCheckedSecs = Array.from(new Set(allSubs.flatMap(s => s.checkedSections || [])));
    const sectionsFocusText = allCheckedSecs.length > 0 ? allCheckedSecs.map(sec => `【${sec}】`).join(' 与 ') : '【一、研究背景】与【四、研究设计】';
    const primaryAcademicB = allSubs[0]?.bAcademic || '理论框架与测量量表';
    const primaryCollabB = allSubs[0]?.bCollab || '章节论述过渡衔接';
    const primaryRhythmB = allSubs[0]?.bRhythm || '后半程推进把控';

    this.state.stage2.actionPlan = {
      isGenerated: true,
      items: [
        `【学术构想与论证修正】(重点关注: ${sectionsFocusText}): 针对核心学术瓶颈【${primaryAcademicB}】，在对应章节中补齐操作化测量量表与理论依据。`,
        `【团队协同与分工平衡】: 针对协作难点【${primaryCollabB}】，统一各章节论述用词风格与逻辑过渡，落实 Equal Participation 均等参与。`,
        `【时间节奏与反思深化】: 针对进度难点【${primaryRhythmB}】，把控后半程节奏，优先完成五、研究设计的不足与反思。`
      ]
    };

    // 记录教师端告警
    const activeClass = this.authManager.getClasses().find(c => c.id === this.state.activeClassId) || { name: '当前班级' };
    const task = this.authManager.getTasks().find(t => t.id === this.state.activeTaskId) || { title: '写作任务' };
    const groupName = this.state.activeMonitorGroupId || '第 1 协作小组';
    const leaderName = currUser?.name || '组长';
    const alertObj = {
      id: 'alert_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      type: 'proxy_meeting',
      stage: 'stage2',
      classId: this.state.activeClassId,
      className: activeClass.name,
      taskId: this.state.activeTaskId,
      taskTitle: task.title,
      groupId: this.state.activeMonitorGroupId,
      groupName: groupName,
      leaderName: leaderName,
      confirmedCount: submittedCount,
      totalCount: totalCount,
      absentMembers: absentMembers.map(m => m.name),
      title: '⚠️ 【阶段二：半程编辑会议】组长一键代推进提醒',
      text: `【${activeClass.name}】· 任务《${task.title}》\n【${groupName}】组长【${leaderName}】已代表全组一键生成【半程修正清单】（在场打卡: ${submittedCount}/${totalCount} 人，已豁免未到场缺勤组员 ${absentNames}）。`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      date: new Date().toLocaleDateString(),
      read: false
    };
    this.authManager.recordTeacherAlert(alertObj);

    // 责任编辑提示消息
    const managingMsg = {
      sender: 'managingEditor',
      text: `🤝 【责任编辑·半程修正清单已生成】：组长【${leaderName}】已代表全组完成半程自查与修正清单生成！请全组重点关注 ${sectionsFocusText}，对照左侧【半程修正清单】分工推进，审稿专家马上为大家进行正文深度学术质检！`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      _timeMs: Date.now(),
      stage: 'stage2'
    };
    if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
    this.state.chatLogs.stage2.push(managingMsg);

    this.state.stage2PendingReviewing = {
      topic,
      bAcademic: primaryAcademicB,
      userText: '组长代推进',
      triggeredTime: Date.now()
    };

    this.syncStage2();
    this.syncChatLogs();
    if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
    renderChat(this.state);
    this.renderStudentWorkspace();
  }

  // handleLogout() 已在 L1648 定义（含 presence 清理与云端推送），此处不再重复
}

// Global Launch (Native ESM Support)
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
  });
} else {
  window.app = new App();
}
