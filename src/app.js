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
  TASK_GENRE_CONFIGS,
  getAgentDisplayName,
  getGenrePromptDescriptor,
  AgentProfiles
} from "./constants.js?v=20260905_v2671";
import { downloadFileBlob, escapeHtml, getCaretCharacterOffsetWithin, isTaskExpired, showGlobalBannerNotice, formatStandardDateDash, getUserAllKeys, isSameUser, isUserInMap, getUserFromMap, isMemberDone, isScopeMatch, showResolutionBlock, safeJsonParse } from "./utils.js?v=20260905_v2671";
import { callCozeAgentAPI } from "./agents.js?v=20260905_v2671";
import { AuthManager } from "./auth.js?v=20260905_v2671";
import { CloudSyncEngine } from "./sync.js?v=20260905_v2671";
import { renderLoginView } from "./login.js?v=20260905_v2671";
import { renderTeacherPortal } from "./teacher.js?v=20260905_v2671";
import { renderStudentTaskPortal } from "./student-portal.js?v=20260905_v2671";
import {
  renderChat,
  renderHeader,
  renderCanvas,
  renderPresencePills,
  renderRemoteCursors
} from "./editor.js?v=20260905_v2671";

// Make renderChat available on window for sync callbacks and listen to global IME composition
if (typeof window !== "undefined") {
  window.renderChat = renderChat;
  window.addEventListener('compositionstart', () => { window._isGlobalComposing = true; }, true);
  window.addEventListener('compositionend', () => { window._isGlobalComposing = false; }, true);
  // 🛡️ Safari 兜底：合成被 blur/Esc 打断时 compositionend 可能不触发，导致标志永久卡 true（进而跳过重渲染）
  window.addEventListener('blur', () => { window._isGlobalComposing = false; }, true);
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
    const storedTeacherLevel = sessionStorage.getItem('jizhi_teacher_level') || localStorage.getItem('jizhi_teacher_level');
    if (storedTeacherLevel) this.state.teacherLevel = storedTeacherLevel;
    const storedTeacherDTab = sessionStorage.getItem('jizhi_teacher_dtab') || localStorage.getItem('jizhi_teacher_dtab');
    if (storedTeacherDTab) this.state.teacherDashboardTab = storedTeacherDTab;
    const storedTeacherCTab = sessionStorage.getItem('jizhi_teacher_ctab') || localStorage.getItem('jizhi_teacher_ctab');
    if (storedTeacherCTab) this.state.teacherClassTab = storedTeacherCTab;

    const user = this.authManager.getCurrentUser();
    const effectiveClassId = (this.authManager ? this.authManager.getEffectiveStudentClassId(user, this.state.activeTaskId) : (this.state.activeStudentClassId || user?.classId || null));
    const activeGroupObj = this.authManager.getStudentActiveGroup(user, effectiveClassId);
    const currentGroupId = activeGroupObj?.id || user?.groupId || this.state.activeGroupId || null;
    this.loadGroupState(currentGroupId);

    this.cloudSyncEngine = new CloudSyncEngine(this);
    this.initGlobalBroadcastListener();
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

  initGlobalBroadcastListener() {
    if ('BroadcastChannel' in window) {
      try {
        if (window._appGlobalBc) { try { window._appGlobalBc.close(); } catch (e) {} }
        window._appGlobalBc = new BroadcastChannel('jizhi_global_events');
        window._appGlobalBc.onmessage = (e) => {
          if (!e.data) return;
          const user = this.authManager ? this.authManager.getCurrentUser() : null;
          const isStudent = user && (user.role === 'student' || user.isStudent);
          if (!isStudent) return;

          // 1. 教师发布全新任务：本地同步装载并即时刷新
          if (e.data.type === 'task_created' && e.data.task) {
            if (this.authManager) {
              const localTasks = this.authManager.getTasks();
              if (!localTasks.some(lt => lt && lt.id === e.data.task.id)) {
                localTasks.unshift(e.data.task);
                try { localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(localTasks)); } catch (err) {}
              }
            }
            if (this.state.studentViewMode === 'task_list') {
              this.renderMain();
            }
          }

          // 2. 教师删除/撤销任务
          if (e.data.type === 'task_deleted') {
            const delTaskId = e.data.taskId;
            const delTaskTitle = e.data.title || '写作任务';
            if (this.authManager && delTaskId) {
              let localTasks = this.authManager.getTasks();
              localTasks = localTasks.filter(lt => lt && lt.id !== delTaskId);
              try { localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(localTasks)); } catch (err) {}
            }
            // 1) 若学生刚好在被删除的任务工作台中：全屏模态弹窗强阻断，引导安全返回大厅
            if (this.state.studentViewMode === 'workspace' && this.state.activeTaskId === delTaskId) {
              this.showTaskRevokedModal(delTaskTitle);
            } else if (this.state.studentViewMode === 'task_list') {
              // 2) 若学生在任务大厅中：大厅顶部轻量提示并即时刷新大厅卡片列表
              showGlobalBannerNotice('🗑️ 任务已删除', `写作任务《${escapeHtml(delTaskTitle)}》已被任课教师删除。`, 'info', 4000);
              this.renderMain();
            }
            // 3) 若在另一个任务工作台中：做减法，静默不打扰当前写作
          }

          // 2.5 教师更新任务
          if (e.data.type === 'task_updated' && e.data.task) {
            if (this.authManager) {
              const localTasks = this.authManager.getTasks();
              const idx = localTasks.findIndex(lt => lt && lt.id === e.data.task.id);
              if (idx >= 0) {
                localTasks[idx] = { ...localTasks[idx], ...e.data.task };
                try { localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(localTasks)); } catch (err) {}
              }
            }
            if (this.state.studentViewMode === 'task_list') {
              this.renderMain();
            }
          }

          // 3. 教师发布教学通知（秒级拉取并在工作台即时弹出）
          if (e.data.type === 'announcement_created') {
            if (e.data.announcement) {
              try {
                let localAnns = this.authManager ? this.authManager.getAnnouncements() : [];
                if (!localAnns.some(a => a.id === e.data.announcement.id)) {
                  localAnns.unshift(e.data.announcement);
                  localStorage.setItem(STORAGE_KEY_ANNOUNCEMENTS, JSON.stringify(localAnns));
                }
              } catch (err) {}
            }
            if (this.state.studentViewMode === 'workspace') {
              this.renderHeader();
              this.checkUnreadAnnouncements();
            } else if (this.state.studentViewMode === 'task_list') {
              this.renderMain();
            }
            if (this.authManager && this.authManager.pullGlobalMeta) {
              this.authManager.pullGlobalMeta().then(() => {
                if (this.state.studentViewMode === 'workspace') {
                  this.renderHeader();
                  this.checkUnreadAnnouncements();
                } else if (this.state.studentViewMode === 'task_list') {
                  this.renderMain();
                }
              }).catch(() => {});
            }
          }

          // 3.5 教师删除教学通知（秒级清除学生端本地通知与更新通知红点）
          if (e.data.type === 'announcement_deleted') {
            const delAnnId = e.data.annId;
            let localAnns = this.authManager ? this.authManager.getAnnouncements() : [];
            localAnns = localAnns.filter(a => a.id !== delAnnId);
            try { localStorage.setItem(STORAGE_KEY_ANNOUNCEMENTS, JSON.stringify(localAnns)); } catch (err) {}
            if (this.state.studentViewMode === 'task_list') {
              this.renderMain();
            }
            this.renderHeader();
          }

          // 4. 教师更新或删除问卷配置（秒级同步问卷地址）
          if (e.data.type === 'survey_updated' || e.data.type === 'survey_deleted') {
            if (this.authManager && this.authManager.pullGlobalMeta) {
              this.authManager.pullGlobalMeta().then(() => {
                const sFrame = document.getElementById('survey-iframe');
                if (sFrame && e.data.type === 'survey_updated' && e.data.url) {
                  sFrame.src = e.data.url;
                }
              }).catch(() => {});
            }
          }

          // 5. 教师上传参考范文（秒级到达学生端文献库并更新工作台按钮）
          if (e.data.type === 'paper_uploaded') {
            if (e.data.paper) {
              try {
                let localPapers = this.authManager ? this.authManager.getAllReferencePapers() : [];
                if (!localPapers.some(p => p.id === e.data.paper.id)) {
                  localPapers.unshift(e.data.paper);
                  localStorage.setItem('jizhi_reference_papers_db', JSON.stringify(localPapers));
                }
              } catch (err) {}
            }
            if (this.state.studentViewMode === 'workspace') {
              const currentUser = this.authManager ? this.authManager.getCurrentUser() : null;
              const groupId = this.state.activeGroupId || (currentUser ? currentUser.groupId : null);
              const classId = this.state.activeStudentClassId || (currentUser ? currentUser.classId : null);
              const available = this.authManager ? this.authManager.getReferencePapers(groupId, classId, this.state.activeTaskId) : [];
              const btnShowCase = document.getElementById('btn-show-case') || document.getElementById('btn-view-reference-papers');
              if (btnShowCase) {
                btnShowCase.innerText = available.length > 0 ? `📚 查阅参考范文 (${available.length}篇)` : '📚 查阅参考范文库';
              }
              showGlobalBannerNotice(
                '📚 收到新参考范文',
                `任课教师刚刚发布了学术示范文献《${e.data.paper?.title || '参考范文'}》，已存入范文库！`,
                'info',
                6000
              );
              if (document.querySelector('.modal-overlay h3')?.innerText?.includes('参考范文库')) {
                this.showReferencePapersModal();
              }
            }
            if (this.authManager && this.authManager.pullGlobalMeta) {
              this.authManager.pullGlobalMeta().catch(() => {});
            }
          }

          // 5.5 教师删除参考范文
          if (e.data.type === 'paper_deleted') {
            const delPaperId = e.data.paperId;
            let localPapers = this.authManager ? this.authManager.getAllReferencePapers() : [];
            localPapers = localPapers.filter(p => p.id !== delPaperId);
            try { localStorage.setItem('jizhi_reference_papers_db', JSON.stringify(localPapers)); } catch (err) {}
            if (this.state.studentViewMode === 'workspace') {
              const currentUser = this.authManager ? this.authManager.getCurrentUser() : null;
              const groupId = this.state.activeGroupId || (currentUser ? currentUser.groupId : null);
              const classId = this.state.activeStudentClassId || (currentUser ? currentUser.classId : null);
              const available = this.authManager ? this.authManager.getReferencePapers(groupId, classId, this.state.activeTaskId) : [];
              const btnShowCase = document.getElementById('btn-show-case') || document.getElementById('btn-view-reference-papers');
              if (btnShowCase) {
                btnShowCase.innerText = available.length > 0 ? `📚 查阅参考范文 (${available.length}篇)` : '📚 查阅参考范文库';
              }
              if (document.querySelector('.modal-overlay h3')?.innerText?.includes('参考范文库')) {
                this.showReferencePapersModal();
              }
            }
          }
        };
      } catch (e) {}
    }
  }

  loadGroupState(groupId = null) {
    const defaultState = JSON.parse(JSON.stringify(InitialState));
    const user = this.authManager ? this.authManager.getCurrentUser() : null;
    const isTeacher = user && (user.isTeacher || user.role === 'teacher');
    const isStudent = user && (user.role === 'student' || user.isStudent);
    const effectiveClassId = (isTeacher ? this.state.activeClassId : this.state.activeStudentClassId) || user?.classId || null;
    
    // 🛡️ 核心守卫：学生处于任务大厅模式时，必须保持 activeTaskId 为 null，绝不能强塞默认任务 ID
    if (isStudent && this.state.studentViewMode === 'task_list') {
      this.state.activeTaskId = null;
      this.state.activeTaskTitle = null;
      return;
    }

    let taskId = this.state.activeTaskId || (this.cloudSyncEngine ? this.cloudSyncEngine.taskId : null);
    if (!taskId && isTeacher) {
      taskId = `task_${effectiveClassId}_default`;
    }
    this.state.activeTaskId = taskId;
    this.state.activeGroupId = groupId;
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
      if (cached.timer) {
        this.state.timer = Object.assign({}, defaultState.timer, cached.timer);
      }
      let s1Start = this.state.stage1?.startTime || this.state.timer?.startTimestamp;
      if (!s1Start) {
        const s1Chats = this.state.chatLogs?.stage1 || [];
        for (const m of s1Chats) {
          const t = m._timeMs;
          if (t && (!s1Start || t < s1Start)) s1Start = t;
        }
        const s1Props = this.state.stage1?.proposals || [];
        for (const p of s1Props) {
          const t = p.createdAt || p.updatedAt;
          if (t && (!s1Start || t < s1Start)) s1Start = t;
        }
      }
      if (s1Start) {
        if (!this.state.timer) this.state.timer = Object.assign({}, defaultState.timer);
        this.state.timer.startTimestamp = s1Start;
        if (!this.state.stage1.startTime) this.state.stage1.startTime = s1Start;
        const speed = this.state.timer.speed || 1;
        const physicalElapsedSec = Math.floor((Date.now() - s1Start) / 1000);
        this.state.timer.elapsedSeconds = Math.max(0, Math.floor(physicalElapsedSec * speed));
      }
      if (this.state.stage2?.startTime) {
        this.stage2StartTime = this.state.stage2.startTime;
      }
      if (this.state.stage3?.startTime) {
        this.stage3StartTime = this.state.stage3.startTime;
      }

      // 🛡️ 阶段防越权自愈自净：若小组尚未正式确认签署阶段二初稿，严禁保留提前触发的阶段三答辩数据
      if (!this.state.isFinalSubmitted && !this.state.stage2?.isDraftConfirmed) {
        const correctMax = (this.state.stage1?.contract?.isConfirmed) ? 'stage2' : 'stage1';
        this.state.groupMaxStage = correctMax;
        if (this.state.currentStage === 'stage3') {
          this.state.currentStage = correctMax;
        }
        if (this.state.stage3) {
          this.state.stage3 = { feedbackItems: [], proponentAnalysis: null, opponentAnalysis: null, meetingSubmissions: {} };
        }
        if (this.state.chatLogs && this.state.chatLogs.stage3) {
          this.state.chatLogs.stage3 = [];
        }
        this.state.stage3CommitteeLoading = false;
      }
    } else {
      // 🛡️ 切换到新组时，第1行代码立刻清空内存残留消息，彻底杜绝上一组的聊天残影
      this.state.chatLogs = { stage1: [], stage2: [], stage3: [] };
      this.state.stage1 = JSON.parse(JSON.stringify(defaultState.stage1));
      this.state.stage2 = JSON.parse(JSON.stringify(defaultState.stage2));
      this.state.stage3 = JSON.parse(JSON.stringify(defaultState.stage3));
      this.state.timer = JSON.parse(JSON.stringify(defaultState.timer));
      this.state.currentStage = 'stage1';
      this.state.groupMaxStage = 'stage1';
      this.state.isFinalSubmitted = false;
      this.stage2StartTime = null;
      this.stage3StartTime = null;
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
      return this.state.activeMonitorGroupId || this.state.activeGroupId || null;
    }
    const effectiveClassId = (this.authManager ? this.authManager.getEffectiveStudentClassId(user, this.state.activeTaskId) : (this.state.activeStudentClassId || user?.classId || null));
    const activeGroupObj = this.authManager ? this.authManager.getStudentActiveGroup(user, effectiveClassId) : null;
    return activeGroupObj?.id || user?.groupId || this.state.activeGroupId || null;
  }

  saveGroupState(groupId) {
    // 🛡️ 单一 Key 覆盖轻量快照：仅缓存当前正在操作的 1 个工作台，保障 0ms 秒开，绝不堆积碎片
    try {
      const user = this.authManager ? this.authManager.getCurrentUser() : null;
      const isTeacher = user && (user.isTeacher || user.role === 'teacher');
      const effectiveClassId = (isTeacher ? this.state.activeClassId : this.state.activeStudentClassId) || user?.classId || null;
      const snap = {
        classId: effectiveClassId,
        taskId: this.state.activeTaskId,
        groupId: groupId,
        chatLogs: this.state.chatLogs,
        stage1: this.state.stage1,
        stage2: this.state.stage2,
        stage3: this.state.stage3,
        timer: this.state.timer,
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
    const targetStage = stage || this.state.currentStage || 'stage1';

    // 🛡️ 智能体阶段物理隔离铁律：
    // 阶段一仅允许 auctioneer；阶段二仅允许 managingEditor/reviewingEditor；阶段三仅允许 proponent/opponent/neutral
    const sender = msg.sender;
    if (['auctioneer', 'managingEditor', 'reviewingEditor', 'proponent', 'opponent', 'neutral'].includes(sender)) {
      if (targetStage === 'stage1' && sender !== 'auctioneer') {
        console.warn(`[Stage Guard] 拦截非阶段一智能体 ${sender} 试图在 stage1 发言`);
        return;
      }
      if (targetStage === 'stage2' && !['managingEditor', 'reviewingEditor'].includes(sender)) {
        console.warn(`[Stage Guard] 拦截非阶段二智能体 ${sender} 试图在 stage2 发言`);
        return;
      }
      if (targetStage === 'stage3' && !['proponent', 'opponent', 'neutral'].includes(sender)) {
        console.warn(`[Stage Guard] 拦截非阶段三智能体 ${sender} 试图在 stage3 发言`);
        return;
      }
    }

    const user = this.authManager ? this.authManager.getCurrentUser() : null;
    const isTeacher = user && (user.isTeacher || user.role === 'teacher');
    const effectiveClassId = (isTeacher ? this.state.activeClassId : this.state.activeStudentClassId) || user?.classId || null;
    let taskId = this.state.activeTaskId || (this.cloudSyncEngine ? this.cloudSyncEngine.taskId : null);
    if (!taskId) {
      if (isTeacher) taskId = `task_${effectiveClassId}_default`;
      else return; // 学生端必须有真实任务 ID
    }

    const currentUser = this.authManager ? this.authManager.getCurrentUser() : null;
    const activeGroupObj = (this.authManager && effectiveClassId) ? this.authManager.getStudentActiveGroup(currentUser, effectiveClassId) : null;
    const groupId = (typeof this.getEffectiveGroupId === 'function') ? this.getEffectiveGroupId() : (this.state.activeGroupId || this.cloudSyncEngine?.groupId || activeGroupObj?.id || currentUser?.groupId || null);

    if (!groupId) return;

    if (this.cloudSyncEngine && typeof this.cloudSyncEngine.sendPresencePing === 'function') {
      this.cloudSyncEngine.sendPresencePing(currentUser);
    }

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

    const sendWithRetry = (retries = 3) => {
      fetch(`sync.php?action=send_chat&groupId=${encodeURIComponent(groupId)}&taskId=${encodeURIComponent(taskId)}&classId=${encodeURIComponent(effectiveClassId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
      }).catch((err) => {
        if (retries > 0) {
          console.warn(`[ChatSync] 消息「${payload.text?.substring(0, 10)}」发送偶发抖动 (${err.message})，1秒后自动重试 (剩余${retries}次)...`);
          setTimeout(() => sendWithRetry(retries - 1), 1000);
        } else {
          console.error(`[ChatSync] 消息「${payload.text?.substring(0, 10)}」重试 3 次后仍未送达:`, err);
        }
      });
    };
    sendWithRetry();
  }

  syncChatLogs(specifiedMsg = null, stage = null) {
    const targetStage = stage || this.state.currentStage || 'stage1';
    if (specifiedMsg) {
      if (Array.isArray(specifiedMsg)) {
        specifiedMsg.forEach(m => this.sendSingleChatMessage(m, targetStage));
      } else {
        this.sendSingleChatMessage(specifiedMsg, targetStage);
      }
      return;
    }
    const logs = (this.state.chatLogs && this.state.chatLogs[targetStage]) ? this.state.chatLogs[targetStage] : [];
    const latestMsg = logs[logs.length - 1];

    if (latestMsg) {
      this.sendSingleChatMessage(latestMsg, targetStage);
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
    // 动态刷新下方 SSRL 贡献度条
    const contribLabelsContainer = document.getElementById('stage2-contrib-labels');
    const contribBarsContainer = document.getElementById('stage2-contrib-bars');
    if (contribLabelsContainer && contribBarsContainer) {
      const membersList = Object.values(this.state.members || {});
      const contribs = (this.state.stage2 && this.state.stage2.memberContributions) ? this.state.stage2.memberContributions : {};
      
      const getVal = (m) => {
        if (!m) return 0;
        const keys = getUserAllKeys(m);
        let maxVal = 0;
        for (const k of keys) {
          if (contribs[k] !== undefined && Number(contribs[k]) > maxVal) {
            maxVal = Number(contribs[k]);
          }
        }
        return maxVal;
      };

      let rawTotal = 0;
      membersList.forEach(m => { rawTotal += getVal(m); });

      const docLen = (this.state.stage2 && this.state.stage2.unifiedContent) ? this.state.stage2.unifiedContent.length : 0;
      contribLabelsContainer.innerHTML = membersList.map((m) => {
        const rawVal = getVal(m);
        const pct = rawTotal > 0 ? Math.round((rawVal / rawTotal) * 100) : 0;
        const displayWords = (docLen > 0 && rawTotal > 0) ? Math.round((rawVal / rawTotal) * docLen) : rawVal;
        return `<span style="color:${rawVal > 0 ? (m.color || '#2563eb') : '#94a3b8'}; font-weight:700;">● ${m.name}: ${pct}% (${displayWords}字)</span>`;
      }).join('');

      if (rawTotal === 0) {
        contribBarsContainer.innerHTML = `<div style="width:100%; height:8px; background:#f8fafc; border-radius:4px; display:flex; align-items:center; justify-content:center; font-size:9.5px; color:#94a3b8; font-weight:600;">⏳ 在 Etherpad 中撰写或修改正文将实时累计真实贡献</div>`;
      } else {
        contribBarsContainer.innerHTML = membersList.map((m) => {
          const rawVal = getVal(m);
          const pct = rawTotal > 0 ? Math.round((rawVal / rawTotal) * 100) : 0;
          return `<div class="contrib-segment" style="width:${pct}%; background:${m.color || '#2563eb'}; transition:width 0.8s ease-in-out;" title="${m.name}: ${pct}% (${rawVal}字)"></div>`;
        }).join('');
      }
    }
    this.renderPresenceCursors();
  }

  syncStageChange(stage) {
    const user = this.authManager.getCurrentUser();
    const groupId = (user && user.groupId) ? user.groupId : (this.state.activeMonitorGroupId || this.state.activeGroupId || null);
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
        const myKeys = getUserAllKeys(currentUser);
        const now = Date.now();

        myKeys.forEach(k => {
          this.state.presence[k] = { lastSeen: now, updatedAt: now };
        });
        this.renderPresenceCursors();

        if (this.cloudSyncEngine && typeof this.cloudSyncEngine.sendPresencePing === 'function') {
          this.cloudSyncEngine.sendPresencePing(currentUser);
        }
      }
    };
    doPing();
    setInterval(doPing, 8000);
  }

  initTimer() {
    this.initGlobalPresenceHeartbeat();
    setInterval(() => {
      // 🎧 静默期情绪安抚定时巡检（即便无人发言也按周期触发，见审查 #45）
      this.checkEmotionComfort();
      const currentUser = this.authManager.getCurrentUser();
      if (currentUser && currentUser.role === 'student' && this.state.timer.isRunning) {
        const nowMs = Date.now();
        if (!this.state.stage1) this.state.stage1 = {};
        // 统一物理时间戳计秒：全组成员按首次开启时间统一对齐，杜绝迟到成员或刷新页面导致的时间差
        let existingS1Start = this.state.stage1.startTime || this.state.timer.startTimestamp;
        if (!existingS1Start) {
          const s1Chats = this.state.chatLogs?.stage1 || [];
          for (const m of s1Chats) {
            const t = m._timeMs;
            if (t && (!existingS1Start || t < existingS1Start)) existingS1Start = t;
          }
          const s1Props = this.state.stage1?.proposals || [];
          for (const p of s1Props) {
            const t = p.createdAt || p.updatedAt;
            if (t && (!existingS1Start || t < existingS1Start)) existingS1Start = t;
          }
        }
        if (!this.state.timer.startTimestamp) {
          if (existingS1Start) {
            this.state.timer.startTimestamp = existingS1Start;
            this.state.stage1.startTime = existingS1Start;
          } else if (this.state.studentViewMode === 'workspace') {
            this.state.timer.startTimestamp = nowMs;
            this.state.stage1.startTime = nowMs;
            const currentGroupId = (currentUser && currentUser.groupId) ? currentUser.groupId : (this.state.activeMonitorGroupId || this.state.activeGroupId || null);
            this.saveGroupState(currentGroupId);
            if (this.cloudSyncEngine && typeof this.cloudSyncEngine.pushSnapshot === 'function') {
              this.cloudSyncEngine.pushSnapshot();
            }
          }
        }
        if (this.state.timer.startTimestamp && !this.state.stage1.startTime) {
          this.state.stage1.startTime = this.state.timer.startTimestamp;
        }
        const s1BaseStart = this.state.timer.startTimestamp || this.state.stage1.startTime || nowMs;
        const speed = this.state.timer.speed || 1;
        const physicalElapsedSec = Math.floor((nowMs - s1BaseStart) / 1000);
        this.state.timer.elapsedSeconds = Math.max(0, Math.floor(physicalElapsedSec * speed));

        if (typeof window.renderChatActionBar === 'function') {
          window.renderChatActionBar(this.state);
        }

        const currentStage = this.state.currentStage || 'stage1';
        
        // ⏰ 全局进度与阶段间转场催促 + 阶段二智能体保底机制 (由在场学号最小的在线成员单点触发，杜绝多人并发 AI 消息风暴)
        const myCode = currentUser?.id || this.state.currentUser || 'A';
        const activeTaskId = this.state.activeTaskId || null;
        const currentGroupId = (currentUser && currentUser.groupId) ? currentUser.groupId : (this.state.activeMonitorGroupId || this.state.activeGroupId || null);
        const allTasks = (this.authManager) ? this.authManager.getTasks() : [];
        const curTask = allTasks.find(t => t.id === activeTaskId);
        const totalDurationMin = (curTask && curTask.durationMinutes) ? Number(curTask.durationMinutes) : 150;
        const totalDurationSec = totalDurationMin * 60;
        const elapsedSec = (this.state.timer && this.state.timer.elapsedSeconds) ? this.state.timer.elapsedSeconds : 0;
        const remainingSec = Math.max(0, totalDurationSec - elapsedSec);
        const remainingMin = remainingSec / 60;
        const totalProgress = (totalDurationSec > 0) ? (elapsedSec / totalDurationSec) : 0;

        const membersList = Object.values(this.state.members || {});
        const presenceMap = this.state.presence || {};
        const onlineMembers = membersList.filter(m => {
          const p = presenceMap[m.id] || presenceMap[m.id];
          return p && (nowMs - (p.updatedAt || 0) < 180000);
        });
        const primaryMember = (onlineMembers.length > 0)
          ? [...onlineMembers].sort((a, b) => (a.id || a.id || '').localeCompare(b.id || b.id || ''))[0]
          : (membersList.length > 0 ? [...membersList].sort((a, b) => (a.id || a.id || '').localeCompare(b.id || b.id || ''))[0] : null);
        const isPrimaryGuardian = primaryMember && (isSameUser(primaryMember, myCode) || primaryMember.id === myCode || primaryMember.name === myCode);

        if (isPrimaryGuardian) {
          const allChatLogsList = Object.values(this.state.chatLogs || {}).flat();

          // ── 0. 【阶段一守卫：3分钟静默破冰、6分钟无提案强催促(点名)、提案全齐先交流】 ──
          const isContractConfirmed = !!(this.state.stage1 && this.state.stage1.contract && this.state.stage1.contract.isConfirmed);
          if (currentStage === 'stage1' && !isContractConfirmed) {
            const s1 = this.state.stage1 || {};
            const propList = s1.proposals || [];
            const propCount = propList.length;
            // ① 挂机防堆叠守卫：若已经超过 6 分钟，直接发送 6 分钟全员催促，自动跳过过时的 3 分钟破冰
            const lastNudgeTime = this.state._lastInactivityNudgeTimeMs || 0;
            const canSendInactivityMsg = (nowMs - lastNudgeTime > 120000);

            if (canSendInactivityMsg && elapsedSec >= 360 && propCount === 0 && !this.state.s1_6minNoPropSent) {
              this.state.s1_3minBreakSent = true;
              this.state.s1_6minNoPropSent = true;
              this.state._lastInactivityNudgeTimeMs = nowMs;
              const msgNoProp = {
                sender: 'auctioneer',
                senderName: '头脑风暴 · 学术拍卖师',
                text: `🎪 【学术拍卖师·全员提案催促】：头脑风暴已进行 6 分钟啦！目前全组尚未收到任何成员提交的初步提案。请各位研究者加紧构思，尽快在左侧卡片提交您的课题初步设想，开启组内协同研讨！`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                _timeMs: nowMs
              };
              if (!this.state.chatLogs.stage1) this.state.chatLogs.stage1 = [];
              this.state.chatLogs.stage1.push(msgNoProp);
              this.syncChatLogs(msgNoProp, 'stage1');
              renderChat(this.state);
            } else if (canSendInactivityMsg && elapsedSec >= 180 && elapsedSec < 360 && propCount === 0 && studentChatsCount === 0 && !this.state.s1_3minBreakSent) {
              this.state.s1_3minBreakSent = true;
              this.state._lastInactivityNudgeTimeMs = nowMs;
              const msg3Min = {
                sender: 'auctioneer',
                senderName: '头脑风暴 · 学术拍卖师',
                text: `🎪 【学术拍卖师·头脑风暴协同破冰】：头脑风暴已经开启 3 分钟啦～建议各位研究者在讨论区交流各自的教学关切或学术灵感，相互启发、互相支架！有初步构想随时在左侧【提交提案】卡片提交，全组一起协同打磨！`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                _timeMs: nowMs
              };
              if (!this.state.chatLogs.stage1) this.state.chatLogs.stage1 = [];
              this.state.chatLogs.stage1.push(msg3Min);
              this.syncChatLogs(msg3Min, 'stage1');
              renderChat(this.state);
            }

            // ③ 有人提交提案后满 3 分钟仍有同学未提交（点名未提交提案同学）
            const unsubmittedProps = membersList.filter(m => !propList.some(p => isSameUser(m, p.author) || isSameUser(m, p.authorName) || p.author === m.id || (m.name && p.authorName === m.name)));
            if (propCount > 0 && !this.state._firstPropTimeMs) {
              const earliestPropTime = propList.reduce((minT, p) => Math.min(minT, p.updatedAt || p.createdAt || nowMs), nowMs);
              this.state._firstPropTimeMs = earliestPropTime || nowMs;
            }
            const firstPropTime = this.state._firstPropTimeMs || nowMs;
            const timeSinceFirstProp = nowMs - firstPropTime;
            if (!this.state.s1_propPartialNudgeSent && propCount > 0 && unsubmittedProps.length > 0 && propCount < membersList.length && timeSinceFirstProp >= 180000) {
              this.state.s1_propPartialNudgeSent = true;
              const unsubmittedPropNames = unsubmittedProps.map(m => m.name || m.id).join('、');
              const msgPropNudge = {
                sender: 'auctioneer',
                senderName: '头脑风暴 · 学术拍卖师',
                text: `🎪 【学术拍卖师·提案协同催促】：组内已有同学提交了课题提案，目前全组提案进度为【${propCount}/${membersList.length} 篇】，看到 ${unsubmittedPropNames} 同学尚未提交。请大家抓紧在左侧卡片录入设想，全员提交后即可开启投票推选！`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                _timeMs: nowMs
              };
              if (!this.state.chatLogs.stage1) this.state.chatLogs.stage1 = [];
              this.state.chatLogs.stage1.push(msgPropNudge);
              this.syncChatLogs();
              renderChat(this.state);
            }

            // ③ 提案全齐且每个人的速评均已生成成功、尚未投票：提示先交流 1~2 分钟再投票
            const s1Logs = this.state.chatLogs?.stage1 || [];
            const allPropsEvaluated = propCount >= membersList.length && (s1.proposals || []).every(p => {
              return s1Logs.some(m => m && m.sender === 'auctioneer' && (m.text || '').includes('提案评估') && !((m.text || '').includes('网络提醒')) && ((m.text || '').includes(p.title) || (m.text || '').includes(p.authorName || '')));
            });
            if (!this.state.s1_allPropsGatheredSent && propCount >= membersList.length && propCount > 0 && allPropsEvaluated) {
              this.state.s1_allPropsGatheredSent = true;
              this.state._propsGatheredTimeMs = nowMs;
              const msgPropsAll = {
                id: 'all_prop_' + nowMs,
                sender: 'auctioneer',
                senderName: '头脑风暴 · 学术拍卖师',
                text: `🎪 【学术拍卖师·提案集齐与协同研讨】：太棒了！全组成员的提案与专家速评均已悉数亮相！请大家先在讨论区围绕各自提案的创新亮点与互补性展开 1~2 分钟的协同交流，深入了解彼此设想，随后点击左侧卡片投出关键的一票！`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                _timeMs: nowMs
              };
              if (!this.state.chatLogs.stage1) this.state.chatLogs.stage1 = [];
              this.state.chatLogs.stage1.push(msgPropsAll);
              if (typeof this.sendSingleChatMessage === 'function') {
                this.sendSingleChatMessage(msgPropsAll, 'stage1');
              }
              this.syncChatLogs();
              if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
              renderChat(this.state);
            }

            // ④ 投票催促：自第一位成员投票起满 3 分钟，仍有同学未投票（点名未投票同学）
            const totalVotesCast = membersList.filter(m => isMemberDone(s1.hasVoted, m)).length;
            const unvotedMembers = membersList.filter(m => !isMemberDone(s1.hasVoted, m));
            if (totalVotesCast > 0 && !this.state._firstVoteTimeMs) {
              this.state._firstVoteTimeMs = s1._firstVoteTimeMs || nowMs;
            }
            const firstVoteTime = this.state._firstVoteTimeMs || s1._firstVoteTimeMs || nowMs;
            const timeSinceFirstVote = nowMs - firstVoteTime;
            if (!this.state.s1_voteNudgeSent && totalVotesCast > 0 && unvotedMembers.length > 0 && totalVotesCast < membersList.length && timeSinceFirstVote >= 180000) {
              this.state.s1_voteNudgeSent = true;
              const unvotedNames = unvotedMembers.map(m => m.name || m.id).join('、');
              const msgVoteNudge = {
                sender: 'auctioneer',
                senderName: '头脑风暴 · 学术拍卖师',
                text: `🎪 【学术拍卖师·投票推选提示】：组内已有同学完成推选投票，目前全组投票进度为【${totalVotesCast}/${membersList.length} 人】，看到 ${unvotedNames} 同学尚未完成投票。请尽快在左侧卡片为您认同的课题方案投出关键一票！`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                _timeMs: nowMs
              };
              if (!this.state.chatLogs.stage1) this.state.chatLogs.stage1 = [];
              this.state.chatLogs.stage1.push(msgVoteNudge);
              this.syncChatLogs();
              renderChat(this.state);
            }

            // ⑤ 公约草案签署催促：自第一位成员签署起满 3 分钟，仍有同学未签署（点名未签署同学）
            const isDraftDone = !!(s1.contractStep === 'completed' || s1.contract?.isDraftGenerated);
            const confirmedMembers = s1.contract?.confirmedMembers || {};
            const confirmedCount = membersList.filter(m => isMemberDone(confirmedMembers, m)).length;
            const unsignedMembers = membersList.filter(m => !isMemberDone(confirmedMembers, m));
            if (confirmedCount > 0 && !this.state._firstSignTimeMs) {
              this.state._firstSignTimeMs = s1.contract?._firstSignTimeMs || nowMs;
            }
            const firstSignTime = this.state._firstSignTimeMs || s1.contract?._firstSignTimeMs || nowMs;
            const timeSinceFirstSign = nowMs - firstSignTime;
            if (!this.state.s1_signNudgeSent && isDraftDone && confirmedCount > 0 && unsignedMembers.length > 0 && confirmedCount < membersList.length && timeSinceFirstSign >= 180000) {
              this.state.s1_signNudgeSent = true;
              const unsignedNames = unsignedMembers.map(m => m.name || m.id).join('、');
              const msgSignNudge = {
                sender: 'auctioneer',
                senderName: '头脑风暴 · 学术拍卖师',
                text: `🏛️ 【学术拍卖师·公约签署提示】：公约草案已有成员确认签署，目前全组签署进度为【${confirmedCount}/${membersList.length} 人】，看到 ${unsignedNames} 同学尚未确认签署。请尽快在左侧公约下方核对分工与时间规划并点击【✍️ 确认签署】，全员签署后将正式解锁阶段二！`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                _timeMs: nowMs
              };
              if (!this.state.chatLogs.stage1) this.state.chatLogs.stage1 = [];
              this.state.chatLogs.stage1.push(msgSignNudge);
              this.syncChatLogs();
              renderChat(this.state);
            }
          }

          // ── 1. 【阶段二智能体全自动巡检：一审自动把脉、二审半程研讨、三审终审自动扫描、初稿签署催促】 ──
          if (currentStage === 'stage2') {
            const rawContent = (this.state.stage2 && this.state.stage2.unifiedContent) ? this.state.stage2.unifiedContent : '';
            this.checkAgentTriggersOnContent(rawContent);

            // 初稿签署确认催促（自第一位成员确认签署初稿起满 3 分钟，仍有同学未确认）
            const s2 = this.state.stage2 || {};
            const s2ConfMap = s2.confirmedMembers || {};
            const s2ConfCount = membersList.filter(m => isMemberDone(s2ConfMap, m)).length;
            const s2UnconfMembers = membersList.filter(m => !isMemberDone(s2ConfMap, m));
            if (s2ConfCount > 0 && !this.state._firstS2SignTimeMs) {
              this.state._firstS2SignTimeMs = s2._firstSignTimeMs || nowMs;
            }
            const firstS2SignTime = this.state._firstS2SignTimeMs || s2._firstSignTimeMs || nowMs;
            const timeSinceFirstS2Sign = nowMs - firstS2SignTime;
            if (!this.state.s2_signNudgeSent && s2ConfCount > 0 && s2UnconfMembers.length > 0 && s2ConfCount < membersList.length && timeSinceFirstS2Sign >= 180000) {
              this.state.s2_signNudgeSent = true;
              const s2UnconfNames = s2UnconfMembers.map(m => m.name || m.id).join('、');
              const taskType = this.getCurrentTaskType();
              const isInst = (taskType === 'instructional');
              const managingName = isInst ? '备课组长' : '责任编辑';
              const msgS2SignNudge = {
                sender: 'managingEditor',
                senderName: `协同调度 · ${managingName}`,
                text: `🤝 【${managingName}·初稿签署提示】：组内已有同学确认签署初稿，目前全组初稿确认进度为【${s2ConfCount}/${membersList.length} 人】，看到 ${s2UnconfNames} 同学尚未确认。请尽快在下方核对初稿并点击【✍️ 确认初稿】，全员确认后将正式解锁阶段三！`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                _timeMs: nowMs
              };
              if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
              this.state.chatLogs.stage2.push(msgS2SignNudge);
              this.syncChatLogs();
              renderChat(this.state);
            }
          }

          // ── 2. 【阶段三智能体全自动巡检：答辩完成确认催促、终稿全员提交催促】 ──
          if (currentStage === 'stage3') {
            const s3 = this.state.stage3 || {};
            // 阶段三：答辩/修改矩阵确认催促（自第一位成员确认起满 3 分钟）
            const s3ConfMap = s3.confirmedMembers || {};
            const s3ConfCount = membersList.filter(m => isMemberDone(s3ConfMap, m)).length;
            const s3UnconfMembers = membersList.filter(m => !isMemberDone(s3ConfMap, m));
            if (s3ConfCount > 0 && !this.state._firstS3SignTimeMs) {
              this.state._firstS3SignTimeMs = s3._firstSignTimeMs || nowMs;
            }
            const firstS3SignTime = this.state._firstS3SignTimeMs || s3._firstSignTimeMs || nowMs;
            const timeSinceFirstS3Sign = nowMs - firstS3SignTime;
            if (!this.state.s3_signNudgeSent && s3ConfCount > 0 && s3UnconfMembers.length > 0 && s3ConfCount < membersList.length && timeSinceFirstS3Sign >= 180000) {
              this.state.s3_signNudgeSent = true;
              const s3UnconfNames = s3UnconfMembers.map(m => m.name || m.id).join('、');
              const msgS3SignNudge = {
                sender: 'neutral',
                senderName: '答辩主审 · 中间委员',
                text: `🎓 【答辩主审·答辩确认提示】：组内已有同学确认完成答辩与修改清单，目前全组确认进度为【${s3ConfCount}/${membersList.length} 人】，看到 ${s3UnconfNames} 同学尚未确认。请尽快在下方核对并点击【✍️ 确认答辩】，全员确认后将解锁终稿修改面板！`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                _timeMs: nowMs
              };
              if (!this.state.chatLogs.stage3) this.state.chatLogs.stage3 = [];
              this.state.chatLogs.stage3.push(msgS3SignNudge);
              this.syncChatLogs();
              renderChat(this.state);
            }

            // 阶段三：终稿全员提交催促（自第一位成员确认提交终稿起满 3 分钟）
            const s3FinalMap = s3.finalSubmittedMembers || {};
            const s3FinalCount = membersList.filter(m => isMemberDone(s3FinalMap, m)).length;
            const s3UnfinalMembers = membersList.filter(m => !isMemberDone(s3FinalMap, m));
            if (s3FinalCount > 0 && !this.state._firstS3FinalTimeMs) {
              this.state._firstS3FinalTimeMs = s3._firstFinalSubmitTimeMs || nowMs;
            }
            const firstS3FinalTime = this.state._firstS3FinalTimeMs || s3._firstFinalSubmitTimeMs || nowMs;
            const timeSinceFirstS3Final = nowMs - firstS3FinalTime;
            if (!this.state.s3_finalNudgeSent && s3FinalCount > 0 && s3UnfinalMembers.length > 0 && s3FinalCount < membersList.length && timeSinceFirstS3Final >= 180000) {
              this.state.s3_finalNudgeSent = true;
              const s3UnfinalNames = s3UnfinalMembers.map(m => m.name || m.id).join('、');
              const msgS3FinalNudge = {
                sender: 'neutral',
                senderName: '答辩主审 · 中间委员',
                text: `🎓 【答辩主审·终稿全员提交催促】：组内已有同学确认提交终稿，目前全组提交确认进度为【${s3FinalCount}/${membersList.length} 人】，看到 ${s3UnfinalNames} 同学尚未确认提交。请尚未确认的同学尽快点击【🚀 提交终稿】，全员确认后将正式封稿归档！`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                _timeMs: nowMs
              };
              if (!this.state.chatLogs.stage3) this.state.chatLogs.stage3 = [];
              this.state.chatLogs.stage3.push(msgS3FinalNudge);
              this.syncChatLogs();
              renderChat(this.state);
            }
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
            (s) => this.switchStage(s),
            () => this.handleLogout(),
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
      document.body.className = 'app-login-mode';
      appEl.className = 'app-login-mode';
      renderLoginView(appEl, this.authManager, async () => {
        const u = this.authManager.getCurrentUser();
        const effectiveClassId = this.authManager ? this.authManager.getEffectiveStudentClassId(u) : u?.classId;
        const activeGroup = this.authManager ? this.authManager.getStudentActiveGroup(u, effectiveClassId) : null;
        const gId = activeGroup?.id || u?.groupId || null;
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
      document.body.className = 'app-teacher-mode';
      appEl.className = 'app-teacher-mode';
      renderTeacherPortal(
        appEl, this.authManager, this.state,
        () => this.handleLogout()
      );
    } else {
      const effectiveClassId = this.authManager ? this.authManager.getEffectiveStudentClassId(currentUser, this.state.activeTaskId) : (this.state.activeStudentClassId || currentUser?.classId || null);
      const activeGroupObj = this.authManager.getStudentActiveGroup(currentUser, effectiveClassId);
      const currentGroupId = activeGroupObj?.id || currentUser?.groupId || null;

      if (this.state.studentViewMode === 'task_list') {
        document.body.className = 'app-student-portal-mode';
        appEl.className = 'app-student-portal-mode';
        renderStudentTaskPortal(
          appEl, this.authManager, this.state,
          (taskId) => {
            this._isHandlingTaskRevoked = false;
            const actualTaskId = taskId || null;
            this.state.activeTaskId = actualTaskId;
            const targetTaskObj = (this.authManager ? this.authManager.getTasks() : []).find(t => t.id === actualTaskId);
            const taskClassId = (targetTaskObj && targetTaskObj.classId) ? targetTaskObj.classId : (this.authManager ? this.authManager.getEffectiveStudentClassId(currentUser, this.state.activeTaskId) : (this.state.activeStudentClassId || currentUser?.classId || null));
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
            const targetGroupId = latestGroupObj?.id || currentUser?.groupId || null;
            this.loadGroupState(targetGroupId);

            // 🎯 保持本组推进到的真实阶段，确保历史消息与当前工作台阶段 100% 对应
            const effectiveStage = this.state.groupMaxStage || this.state.currentStage || 'stage1';
            this.state.currentStage = effectiveStage;
            this.isViewingPastStage = false;

            if (!this.state.presence) this.state.presence = {};
            const myKeys = [currentUser?.id, currentUser?.name].filter(Boolean);
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
          () => this.showAnnouncementModal(),
          () => this.showQuestionnaireModal()
        );
        return;
      }

      // 🛡️ 核心守卫：如果学生处于工作台模式，但当前任务已被教师删除，立即弹窗拦截并返回任务大厅
      const allTasks = this.authManager ? this.authManager.getTasks() : [];
      if (this.state.studentViewMode === 'workspace' && this.state.activeTaskId) {
        const isCurrentTaskAlive = allTasks.some(t => t && t.id === this.state.activeTaskId);
        if (!isCurrentTaskAlive && !this._isHandlingTaskRevoked) {
          this.showTaskRevokedModal(this.state.activeTaskTitle || '当前写作任务');
          return;
        }
      }

      const membersList = Object.values(this.state.members || {});
      const curStage = this.state.currentStage || 'stage1';
      const curClassId = (this.state.activeStudentClassId || (currentUser?.classId || null));
      const curTaskId = this.state.activeTaskId || null;
      const availablePapers = (this.authManager) ? this.authManager.getReferencePapers(currentGroupId, curClassId, curTaskId) : [];
      const hasPapers = (availablePapers && availablePapers.length > 0);

      let stageAgentPills = '';
      let stageAgentMentions = '';

      const taskType = this.getCurrentTaskType();
      const isInst = (taskType === 'instructional');

      if (curStage === 'stage1') {
        stageAgentPills = `<span class="agent-pill" style="font-size:11px; padding:2px 8px; border-radius:12px; font-weight:700; white-space:nowrap; background:#f5f3ff; color:#7c3aed; border:1px solid #ddd6fe;">🎪 ${isInst ? '备课引导师' : '拍卖师'} Agent</span>`;
        stageAgentMentions = `<div class="at-item agent" data-mention="@${isInst ? '备课引导师' : '拍卖师'}">🎪 @${isInst ? '备课引导师' : '拍卖师'} (阶段一 选题与方案设计)</div>`;
      } else if (curStage === 'stage2') {
        stageAgentPills = `
          <span class="agent-pill" style="font-size:11px; padding:2px 8px; border-radius:12px; font-weight:700; white-space:nowrap; background:#ecfdf5; color:#059669; border:1px solid #a7f3d0;">🤝 ${isInst ? '备课组长' : '责任编辑'} Agent</span>
          <span class="agent-pill" style="font-size:11px; padding:2px 8px; border-radius:12px; font-weight:700; white-space:nowrap; background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe;">📝 ${isInst ? '教研专家' : '审稿编辑'} Agent</span>
        `;
        stageAgentMentions = `
          <div class="at-item agent" data-mention="@${isInst ? '备课组长' : '责任编辑'}">🤝 @${isInst ? '备课组长' : '责任编辑'} (阶段二 过程伴学与共识协同)</div>
          <div class="at-item agent" data-mention="@${isInst ? '教研专家' : '审稿编辑'}">📝 @${isInst ? '教研专家' : '审稿编辑'} (阶段二 ${isInst ? '教学质检' : '论文质检'})</div>
        `;
      } else if (curStage === 'stage3') {
        stageAgentPills = `
          <span class="agent-pill" style="font-size:11px; padding:2px 8px; border-radius:12px; font-weight:700; white-space:nowrap; background:#fefce8; color:#ca8a04; border:1px solid #fef08a;">🟡 ${isInst ? '答辩主席' : '中间委员'} Agent</span>
          <span class="agent-pill" style="font-size:11px; padding:2px 8px; border-radius:12px; font-weight:700; white-space:nowrap; background:#f0fdf4; color:#16a34a; border:1px solid #bbf7d0;">🟢 ${isInst ? '正方专家' : '正方委员'} Agent</span>
          <span class="agent-pill" style="font-size:11px; padding:2px 8px; border-radius:12px; font-weight:700; white-space:nowrap; background:#fef2f2; color:#dc2626; border:1px solid #fecaca;">🔴 ${isInst ? '反方专家' : '反方委员'} Agent</span>
        `;
        stageAgentMentions = `
          <div class="at-item agent" data-mention="@${isInst ? '答辩主席' : '中间委员'}">🟡 @${isInst ? '答辩主席' : '中间委员'} (阶段三 答辩裁决)</div>
          <div class="at-item agent" data-mention="@${isInst ? '正方专家' : '正方委员'}">🟢 @${isInst ? '正方专家' : '正方委员'} (阶段三 答辩肯定)</div>
          <div class="at-item agent" data-mention="@${isInst ? '反方专家' : '反方委员'}">🔴 @${isInst ? '反方专家' : '反方委员'} (阶段三 答辩质询)</div>
        `;
      }

      document.body.className = 'app-student-workspace-mode';
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
                  ${stageAgentPills}
                </div>
              </div>
              <div class="chat-presence-bar" id="chat-presence-bar" style="padding:4px 8px; background:#f8fafc; border-radius:6px; border:1px solid #e2e8f0; display:flex; align-items:center; gap:6px; width:100%; box-sizing:border-box; overflow-x:auto; white-space:nowrap;">
                <span style="font-size:11px; font-weight:800; color:#475569; flex-shrink:0;">👥 在线:</span>
                <div id="chat-member-presence-pills" style="display:flex; align-items:center; gap:4px; flex-shrink:0;"></div>
              </div>
            </div>
            <div class="chat-stream" id="chat-stream"></div>
            <div class="at-mention-menu" id="at-mention-menu" style="display:none;">
              <div class="at-menu-header">👥 提示：选择需要 @ 的同学或当前阶段 AI 智能体</div>
              <div class="at-menu-list">
                <div class="at-group-title">👥 小组成员 (${membersList.length}人)</div>
                ${membersList.map(m => `
                  <div class="at-item" data-mention="@${m.name}">
                    ${m.avatar || '👨‍🎓'} @${m.name}
                  </div>
                `).join('')}
                <div class="at-group-title" style="margin-top:6px;">🤖 当前阶段 AI 智能体</div>
                ${stageAgentMentions}
              </div>
            </div>
            <div id="chat-agent-action-bar" style="display:none; padding:8px 12px; background:#f8fafc; border-top:1px solid #e2e8f0; border-bottom:1px solid #e2e8f0; text-align:center; box-sizing:border-box;"></div>
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

  // 🌐 通用智能体静默/情绪提示发射器：真 AI 生成，调用期间显示 Loading 动画，失败时采用温暖兜底或提示 @智能体 重新召唤
  async queueAgentNudge(botKey, prompt, fallbackText = '', stage = 'stage2') {
    if (this._isHandlingAgentNudge || this.isCurrentTaskReadOnly()) return; // 🛡️ 严格单飞并发锁与只读锁，只读模式严禁触发大模型
    this._isHandlingAgentNudge = true;

    // 1. 在聊天框推入【正在输入/思考中...】的 Loading 状态气泡
    const loadingMsgId = 'loading_' + Date.now();
    const loadingMsg = {
      id: loadingMsgId,
      sender: botKey,
      text: '🤖 正在结合当前研讨语境生成专属学术建议...',
      isLoading: true,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      _timeMs: Date.now()
    };
    if (!this.state.chatLogs[stage]) this.state.chatLogs[stage] = [];
    this.state.chatLogs[stage].push(loadingMsg);
    if (typeof window.renderChat === 'function') window.renderChat(this.state);

    try {
      let text = await callCozeAgentAPI(botKey, prompt, { stage });
      // 2. 移除 loading 气泡
      this.state.chatLogs[stage] = this.state.chatLogs[stage].filter(m => m.id !== loadingMsgId);
      
      let finalText = (text && text.trim().length > 0) ? text.trim() : '';
      if (!finalText) {
        if (fallbackText && fallbackText.trim().length > 0) {
          finalText = fallbackText.trim();
        } else {
          const taskType = this.getCurrentTaskType();
          const isInst = (taskType === 'instructional');
          const roleMap = { auctioneer: isInst ? '备课引导师' : '拍卖师', managingEditor: isInst ? '备课组长' : '责任编辑', reviewingEditor: isInst ? '教研专家' : '审稿编辑', proponent: isInst ? '正方专家' : '正方委员', opponent: isInst ? '反方专家' : '反方委员', neutral: isInst ? '答辩主席' : '中间委员' };
          const roleName = roleMap[botKey] || (isInst ? '备课组长' : '责任编辑');
          finalText = `💡 【${roleName}】：网络响应稍微慢了一步～如果大家需要我的针对性指导，可以在讨论区输入 @${roleName} 重新召唤我！`;
        }
      }

      const msg = {
        sender: botKey,
        text: finalText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        _timeMs: Date.now()
      };
      this.state.chatLogs[stage].push(msg);
      this.syncChatLogs();
      if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
      renderChat(this.state);
    } catch (e) {
      console.warn('Agent nudge error:', e);
      this.state.chatLogs[stage] = this.state.chatLogs[stage].filter(m => m.id !== loadingMsgId);
      
      let finalText = (fallbackText && fallbackText.trim().length > 0) ? fallbackText.trim() : '';
      if (!finalText) {
        const roleName = botKey === 'auctioneer' ? '拍卖师' : (botKey === 'reviewingEditor' ? '审稿编辑' : (botKey === 'neutral' ? '中间委员' : '责任编辑'));
        finalText = `💡 【${roleName}】：网络响应稍微慢了一步～如果大家需要我的针对性指导，可以在讨论区输入 @${roleName} 重新召唤我！`;
      }
      const msg = {
        sender: botKey,
        text: finalText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        _timeMs: Date.now()
      };
      this.state.chatLogs[stage].push(msg);
      this.syncChatLogs();
      if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
      renderChat(this.state);
    } finally {
      this._isHandlingAgentNudge = false;
    }
  }

  initCrossStageInactivityChecker() {
    this._nudgeCounts = this._nudgeCounts || {};
    if (this.stageInactivityTimer) clearInterval(this.stageInactivityTimer);
    this.stageInactivityTimer = setInterval(async () => {
      const currUserObj = this.authManager ? this.authManager.getCurrentUser() : null;
      if (!currUserObj || currUserObj.role === 'teacher') return;

      // 🔄 0. 极速版本心跳同步：拉取教师端最新发布的通知、任务与延期 (基于服务端版本戳，版本未变 0 开销)
      if (this.authManager && this.authManager.pullGlobalMeta) {
        try { await this.authManager.pullGlobalMeta(); } catch (e) {}
      }

      // 🛡️ 1. 任务存在性检测：如果当前正在某个任务中，但该任务已被教师在后台删除/重置
      const allTasks = this.authManager ? this.authManager.getTasks() : [];
      if (this.state.studentViewMode === 'workspace' && this.state.activeTaskId) {
        const isCurrentTaskAlive = allTasks.some(t => t.id === this.state.activeTaskId);
        if (!isCurrentTaskAlive && !this._isHandlingTaskRevoked) {
          this.showTaskRevokedModal(this.state.activeTaskTitle || '当前写作任务');
          return;
        }
      }

      // 🛡️ 2. 全局新任务发布感知与顶部横幅通知（严格仅限实时在线期间感知的新增任务，初次登录/离线重新进入绝不弹历史提示）
      const effClassId = this.state.activeStudentClassId || currUserObj.classId || null;
      const effGroup = this.authManager ? this.authManager.getStudentActiveGroup(currUserObj, effClassId) : null;
      const visibleTasks = allTasks.filter(t => {
        if (t.classId && t.classId !== effClassId) return false;
        if (t.targetGroupId && effGroup && t.targetGroupId !== effGroup.id) return false;
        return true;
      });

      const currentTaskIds = new Set(visibleTasks.map(t => t.id));
      this._knownTaskIdsSet = currentTaskIds;

      // 🛡️ 2.5 工作台任务存活检测：仅当学生当前正在该工作台内写作时，若任务被教师实时删除才弹窗引导返回
      if (this.state.studentViewMode === 'workspace' && this.state.activeTaskId) {
        const isCurrentTaskAlive = allTasks.some(t => t.id === this.state.activeTaskId);
        if (!isCurrentTaskAlive && !this._isHandlingTaskRevoked) {
          this._isHandlingTaskRevoked = true;
          this.showTaskRevokedModal(this.state.activeTaskTitle || '当前写作任务');
          return;
        }
      }

      // 若处于任务大厅，感知任务变动后自动刷新大厅卡片
      if (!this.state.activeTaskId) {
        const currentTaskHash = visibleTasks.map(t => `${t.id}_${t.updatedAt || t.createdAt || ''}`).join('|');
        if (this._lastVisibleTaskHash && this._lastVisibleTaskHash !== currentTaskHash) {
          console.log('🔄 任务大厅检测到任务列表变动，自动刷新大厅呈现');
          this._lastVisibleTaskHash = currentTaskHash;
          this.renderStudentWorkspace();
        } else {
          this._lastVisibleTaskHash = currentTaskHash;
        }
      } else {
        // 🛡️ 3. 工作台模式下：实时检查并弹出教师新下发的教学通知与延期弹窗
        this.checkUnreadAnnouncements();

        // 🛡️ 4. 组员名单变动与换组秒级无感同步：教师在后台调整分组或移除缺勤学生时，学生端瞬间同步
        if (effGroup) {
          const curGroupHash = `${effGroup.id}_${(effGroup.members || []).map(m => (typeof m === 'object' ? (m.id || m.userId  || m.name) : m)).join(',')}`;
          if (this._lastGroupMembersHash && this._lastGroupMembersHash !== curGroupHash) {
            console.log('🔄 检测到教师后台调整了分组或小组名单，秒级无感同步最新成员与公约签署基数');
            this._lastGroupMembersHash = curGroupHash;
            if (this.cloudSyncEngine) this.cloudSyncEngine.updateScopeKeys();
            this.renderStudentWorkspace(true);
          } else {
            this._lastGroupMembersHash = curGroupHash;
          }
        }
      }

      // 🛡️ 截止只读模式下彻底关闭所有静默提醒、情绪安抚与智能体干预
      if (this.isCurrentTaskReadOnly()) return;

      // ⚡ 单点守护主节点动态选举：由当前在场学号最小的在线成员接管，杜绝单点失效与并发重复！
      const myCode = currUserObj?.id || this.state.currentUser || 'A';
      const now = Date.now();
      const membersList = Object.values(this.state.members || {});
      const presenceMap = this.state.presence || {};
      
      const stage = this.state.currentStage;
      const totalMembersCount = membersList.length;

      // ======================================================================
      // 🧠 SSRL 情绪挫败检测与社会性调节支持机制 (带 45s 同伴互助留白保护)
      // ======================================================================
      const currentStageChats = (this.state.chatLogs && this.state.chatLogs[stage]) ? this.state.chatLogs[stage] : [];
      const recentStudentChats = currentStageChats.filter(m => m.sender && !AgentProfiles[m.sender] && m.sender !== 'system');
      const lastNegativeChat = [...recentStudentChats].reverse().find(m => {
        const t = m.text || '';
        return /(?:太难了|写不出来|改不动了|不知道怎么写|全废了|搞不定|来不及了|头大|想放弃|否定我们|怎么改啊)/i.test(t);
      });

      if (lastNegativeChat && (!this.lastEmotionHandledId || this.lastEmotionHandledId !== lastNegativeChat._timeMs) && !this._isHandlingEmotion) {
        const negTime = lastNegativeChat._timeMs || (now - 60000);
        const timeSinceNeg = now - negTime;
        // 观察窗口：45 秒内给同伴留出互助安慰空间
        if (timeSinceNeg >= 45000 && timeSinceNeg < 180000) {
          // 检测 45 秒内是否有其他同伴发出了安慰/支持/解法回复
          const peerResponsesAfterNeg = recentStudentChats.filter(m => (m._timeMs || 0) > negTime && m.sender !== lastNegativeChat.sender);
          const hasPeerComforted = peerResponsesAfterNeg.some(m => /(?:没事|别慌|我们可以|一起|你看|先写|参考|我来|赞同|我觉得可以)/i.test(m.text || ''));

          // 🛡️ 情绪安抚严格执行 5 分钟 (300,000ms) 冷却期：同一次情绪安抚后 5 分钟内不重复轰炸；5 分钟后若学生再次流露挫败情绪，重新触发温暖共情！
          const timeSinceLastNegative = now - (this._lastNegativeHandledTime || 0);
          if (timeSinceLastNegative < 300000) {
            return;
          }

          if (!hasPeerComforted) {
            this.lastEmotionHandledId = lastNegativeChat._timeMs;
            this._lastNegativeHandledTime = now;
            this._isHandlingEmotion = true;
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

            const negativeRaw = (lastNegativeChat.text || '').trim();
            const comfortPrompt = `有同学在协作中流露出了挫败/疲惫情绪，原话为：「${negativeRaw}」。请以${stage === 'stage1' ? '学术拍卖师' : stage === 'stage2' ? '责任编辑' : '中间委员'}的身份，先用 2~3 句真诚安抚这份情绪（共情但不肉麻、不说教），再结合当前写作阶段给出 1 个具体、可立即照做的小建议，帮助全组重新找回节奏。80~120 字，语气温暖自然。`;
            
            setTimeout(async () => {
              try {
                await this.queueAgentNudge(agentSender, comfortPrompt, comfortText, stage);
              } finally {
                this._isHandlingEmotion = false;
              }
            }, 50);
            return;
          } else {
            // 同伴已成功出面调节，AI 默默记录并全程保持静默
            this.lastEmotionHandledId = lastNegativeChat._timeMs;
          }
        }
      }
      if (stage === 'stage1') {
        // 阶段一所有的破冰、集齐提示与公约流转已由统一状态机与单次互锁时钟管辖，此处无需冗余轮询
        return;
      }


      // ======================================================================
      // 🤝 阶段二：责任编辑 (Managing Editor) 过程学伴守护机制
      // ======================================================================
      else if (stage === 'stage2') {
        const s2 = this.state.stage2;
        if (!s2 || this.state.isFinalSubmitted) return;
        if (!s2.startTime) s2.startTime = this.stage2StartTime || now;
        if (!this.stage2StartTime) this.stage2StartTime = s2.startTime;
        const stage2DurationMs = now - (s2.startTime || this.stage2StartTime || now);

        const s2Chats = (this.state.chatLogs && this.state.chatLogs.stage2) ? this.state.chatLogs.stage2 : [];
        const lastStudentMsg = [...s2Chats].reverse().find(m => m.sender && m.sender !== 'managingEditor' && m.sender !== 'reviewingEditor' && m.sender !== 'system');
        let lastMsgMs = lastStudentMsg?._timeMs;
        if (!lastMsgMs && lastStudentMsg?.timestamp) {
          const parts = String(lastStudentMsg.timestamp).split(':');
          if (parts.length >= 2) {
            const d = new Date();
            d.setHours(parseInt(parts[0], 10), parseInt(parts[1], 10), 0, 0);
            lastMsgMs = d.getTime();
          }
        }
        const lastStudentMsgTime = lastMsgMs || this.stage2StartTime || (now - 60000);
        const silenceDurationMs = Math.max(0, now - lastStudentMsgTime);

        const plainText = (s2.unifiedContent || '').replace(/<[^>]*>/g, '').trim();
        const plainTextLen = plainText.length;

        // 动态读取任务时长判定任务规模（全系统统一：静默 3 分钟破冰，6 分钟催促，10 分钟强兜底）
        const allTasks = (this.authManager) ? this.authManager.getTasks() : [];
        const curTask = allTasks.find(t => t.id === this.state.activeTaskId);
        const taskDurMin = (curTask && curTask.durationMinutes) ? Number(curTask.durationMinutes) : 150;
        const isLargeTask = taskDurMin > 150;
        const s2SilenceThresholdMs = 180000; // 统一 3 分钟破冰

        // 🛡️ 通用消息毫秒时间戳解析工具（函数提升，全局安全访问）
        function parseMsgTime(m) {
          if (!m) return 0;
          if (m._timeMs && Number(m._timeMs) > 0) return Number(m._timeMs);
          if (m.timestamp) {
            const parts = String(m.timestamp).split(':');
            if (parts.length >= 2) {
              const d = new Date();
              d.setHours(parseInt(parts[0], 10), parseInt(parts[1], 10), parseInt(parts[2] || '0', 10), 0);
              return d.getTime();
            }
          }
          return 0;
        }

        // 1. 阶段二开场进度关怀：进入阶段二满 3 分钟（180秒）时进行一次性检查
        // 🛡️ 稳健多源实时正文字数提取（结合 DOM 实时角标、作者贡献统计与文档内容）
        let effectiveDocLen = (s2.unifiedContent || '').replace(/<[^>]*>/g, '').trim().length;
        let contribSum = 0;
        const contribs = s2.memberContributions || {};
        Object.values(contribs).forEach(v => { contribSum += Number(v || 0); });
        effectiveDocLen = Math.max(effectiveDocLen, contribSum);

        const countBadge = (typeof document !== 'undefined') ? document.getElementById('stage2-word-count-num') : null;
        if (countBadge && countBadge.innerText) {
          const badgeNum = parseInt(countBadge.innerText.replace(/[^\d]/g, ''), 10);
          if (!isNaN(badgeNum)) effectiveDocLen = Math.max(effectiveDocLen, badgeNum);
        }
        if (typeof this.lastPlainTextLength === 'number') {
          effectiveDocLen = Math.max(effectiveDocLen, this.lastPlainTextLength);
        }

        const stage2ElapsedMs = now - (s2.startTime || this.stage2StartTime || now);
        const silenceNudgeCount = this._nudgeCounts['s2_silence'] || 0;

        if (silenceNudgeCount < 1 && stage2ElapsedMs >= 180000) {
          this._nudgeCounts['s2_silence'] = 1; // 满 3 分钟已完成一次性核验，无论是否发送均不再重复
          if (effectiveDocLen < 50) {
            // 满 3 分钟且正文字数确实少于 50 字（未动笔或字数过少），发出开场进度关怀
            this.lastS2SilenceNudgeTime = now;
            const taskType = this.getCurrentTaskType();
            const isInst = (taskType === 'instructional');
            const managingName = isInst ? '备课组长' : '责任编辑';
            const msg = {
              sender: 'managingEditor',
              senderName: `协同调度 · ${managingName}`,
              text: `🤝 【${managingName}·进度关怀】：大家已进入阶段二正文协作！\n👉 请大家在左侧协同文档中积极起草与研读，撰写同时多阅读同伴段落，在研讨区互相交流衔接，群策群力协同推进！`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              _timeMs: now
            };
            if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
            this.state.chatLogs.stage2.push(msg);
            this.syncChatLogs();
            this.syncStage2();
            if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
            renderChat(this.state);
            return;
          }
        }



        // ======================================================================
        // 📌 质检/讨论梯度 B：半程会议自查打卡（3 分钟未打卡静默提醒，全场严格仅 1 次）
        // ======================================================================
        const existMeetingCheckinNudge = s2Chats.some(m => m && m.text?.includes('半程会议参与提示'));
        const lastMeetingMsg = [...s2Chats].reverse().find(m => m && m.sender === 'managingEditor' && (m.text?.includes('半程研讨号召') || m.text?.includes('半程会议号召') || m.text?.includes('半程自查') || m.text?.includes('半程会议')));
        const isMeetingActive = (lastMeetingMsg || s2.meetingStep) && s2.meetingStep !== 'completed' && !s2.isDraftConfirmed;

        if (isMeetingActive) {
          const meetingMsgTime = parseMsgTime(lastMeetingMsg) || s2.meetingCalledTime || this.stage2StartTime || (now - 60000);
          const meetingElapsed = Math.max(0, now - meetingMsgTime);

          const subs = s2.meetingSubmissions || {};
          const effClassId = this.state.activeStudentClassId || currUserObj.classId || null;
          const effGroup = this.authManager ? this.authManager.getStudentActiveGroup(currUserObj, effClassId) : null;
          const allGroupMembers = (effGroup && Array.isArray(effGroup.members) && effGroup.members.length > 0) ? effGroup.members : membersList;
          const totalCount = allGroupMembers.length || 2;

          const isMemberSubmitted = (m) => {
            if (!m) return false;
            let fullUser = (typeof m === 'object') ? m : null;
            if (!fullUser && this.authManager) {
              fullUser = this.authManager.findUserByKey ? this.authManager.findUserByKey(m) : null;
            }
            const keys = [
              typeof m === 'string' ? m : null,
              m?.id, m?.name,
              fullUser?.id, fullUser?.name
            ].filter(Boolean).map(k => String(k).trim().toLowerCase());

            // 1. 直接按 key 索引检索
            if (keys.some(k => subs[k] || subs[String(k)])) return true;
            // 2. 遍历 submissions 内部对象的 user / name 属性检索
            const subList = Object.values(subs);
            return subList.some(item => {
              if (!item) return false;
              const subKeys = [item.user, item.name, item.id, item.id].filter(Boolean).map(k => String(k).trim().toLowerCase());
              return keys.some(k => subKeys.includes(k));
            });
          };

          const unsubmittedMembers = (Object.keys(subs).length >= totalCount) ? [] : allGroupMembers.filter(m => !isMemberSubmitted(m));
          const submittedCount = totalCount - unsubmittedMembers.length;
          const hasUnsubmitted = unsubmittedMembers.length > 0;

          // 🚀 核心强制弹窗：会议发起满 3 分钟（180,000ms），凡是当前登录学生【尚未完成自查打卡】：
          // 无论何时切回或刷新，直接在屏幕正中央强制弹出自查打卡弹窗（不发群聊点名消息，清爽无感）
          const isModalOpen = !!document.querySelector('.modal-overlay');
          if (this.state.currentStage === 'stage2' && isMeetingActive && meetingElapsed >= 180000 && !isMemberSubmitted(currUserObj)) {
            if (!isModalOpen && !this._meetingModalForceShown && typeof this.showMeetingModal === 'function') {
              this._meetingModalForceShown = true;
              this.showMeetingModal();
            }
          }

          // ======================================================================
          // 📌 质检/讨论梯度 C：针对《二审修正清单》的修改方案商定（审稿编辑负责学术研讨引导与静默守护）
          // ======================================================================
          if (!hasUnsubmitted) {
            const checklistMsg = [...s2Chats].reverse().find(m => m && (m.text?.includes('二审修正清单') || m.text?.includes('半程修正清单') || m.text?.includes('半程编辑修正清单')));
            const checklistTime = parseMsgTime(checklistMsg) || meetingMsgTime || this.stage2StartTime || (now - 60000);
            const checklistElapsed = Math.max(0, now - checklistTime);
            const studentMsgAfterChecklist = s2Chats.filter(m => m && m.sender && m.sender !== 'managingEditor' && m.sender !== 'reviewingEditor' && m.sender !== 'system' && parseMsgTime(m) > checklistTime);
            const lastStudentMsgAfterChecklist = studentMsgAfterChecklist.length > 0 ? studentMsgAfterChecklist[studentMsgAfterChecklist.length - 1] : null;
            const lastStudentMsgAfterChecklistTime = parseMsgTime(lastStudentMsgAfterChecklist);
            const silenceAfterChecklist = lastStudentMsgAfterChecklistTime ? Math.max(0, now - lastStudentMsgAfterChecklistTime) : checklistElapsed;

            // 🛡️ 学生有发言即解除静默，重置讨论计数
            if (lastStudentMsgAfterChecklistTime > (this._lastNudgeActivityTime?.['s2_consistency'] || 0)) {
              this._nudgeCounts['s2_consistency_silence_3m'] = 0;
              this._nudgeCounts['s2_consistency_silence_6m'] = 0;
              if (!this._lastNudgeActivityTime) this._lastNudgeActivityTime = {};
              this._lastNudgeActivityTime['s2_consistency'] = lastStudentMsgAfterChecklistTime;
            }

            // ── ① 3 分钟没讨论：责任编辑一致性研讨破冰点拨 ──
            const exist3mNudge = s2Chats.some(m => m && (m.text?.includes('一致性研讨点拨') || m.text?.includes('自查研讨点拨') || m.text?.includes('一致性协同研讨')));
            if (studentMsgAfterChecklist.length > 0) {
              this._nudgeCounts['s2_consistency_silence_3m'] = 1;
            } else if (!exist3mNudge && checklistElapsed >= 180000 && !s2.isDraftConfirmed && (s2.pendingReviewing || this.state.stage2PendingReviewing)) {
              this._nudgeCounts['s2_consistency_silence_3m'] = 1;
              const msg = {
                sender: 'managingEditor',
                senderName: '协同调度 · 责任编辑',
                text: `🤝 【责任编辑·一致性协同研讨】：自查研判已下发！请大家对照自查暴露的前后脱节与章节偏离，在讨论区展开深度协同研讨，互相听取同伴的修改设想，共同商定全组一致的对齐思路与衔接方案！`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                _timeMs: now
              };
              if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
              this.state.chatLogs.stage2.push(msg);
              this.syncChatLogs();
              this.syncStage2();
              if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
              renderChat(this.state);
              return;
            }

            // ── ② 3 分钟没讨论修正清单：审稿编辑二审修改研讨提示 ──
            const existChecklistNudge = s2Chats.some(m => m && (m.text?.includes('二审修改研讨提示') || m.text?.includes('二审协同修改研讨')));
            const isReviewingSummaryPending = s2Chats.some(m => m && m.text?.includes('二审修正清单')) && !s2Chats.some(m => m && (m.text?.includes('修改确认与写作冲刺') || m.text?.includes('二审修改落实决议')));
            if (studentMsgAfterChecklist.length > 0) {
              this._nudgeCounts['s2_checklist_silence_3m'] = 1;
            } else if (!existChecklistNudge && isReviewingSummaryPending && checklistElapsed >= 180000 && !s2.isDraftConfirmed) {
              this._nudgeCounts['s2_checklist_silence_3m'] = 1;
              const msg = {
                sender: 'reviewingEditor',
                senderName: '学术质量 · 审稿编辑',
                text: `📝 【审稿编辑·二审协同修改研讨】：二审修正清单已送达！请全组成员围绕清单指出的诊断问题充分交流修改对策，大家集思广益共同打磨出具体的补全与完善方案；商定差不多后，点击下方【📝 讨论差不多了？让审稿编辑总结】！`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                _timeMs: now
              };
              if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
              this.state.chatLogs.stage2.push(msg);
              this.syncChatLogs();
              this.syncStage2();
              if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
              renderChat(this.state);
              return;
            }
          }
        }

        // ======================================================================
        // 📝 审稿编辑一审后静默跟进（严格在真正下发【一审破题把脉】后且 3 分钟冷场才触发）
        // ======================================================================
        const existReviewFollow = s2Chats.some(m => m && (m.text?.includes('初审跟进提示') || m.text?.includes('初审协同跟进')));
        const realFirstReviewMsg = [...s2Chats].reverse().find(m => m && m.sender === 'reviewingEditor' && (m.text?.includes('一审破题把脉') || m.text?.includes('初审破题') || m.text?.includes('初审质检') || m.text?.includes('Research Gap')) && !m.text?.includes('开场寄语') && !m.text?.includes('初审跟进提示') && !m.text?.includes('初审协同跟进'));
        const isFirstReviewIssued = !!realFirstReviewMsg || (s2.reviewMilestone === 'first_review_done' && !!s2.firstReviewText);

        // 🛡️ 智能自愈：若历史记录存在早产的“初审协同跟进”但真实一审尚未下发，自动清洗多余跟进
        if (!isFirstReviewIssued && existReviewFollow) {
          if (this.state.chatLogs && this.state.chatLogs.stage2) {
            this.state.chatLogs.stage2 = this.state.chatLogs.stage2.filter(m => !(m && m.sender === 'reviewingEditor' && (m.text?.includes('初审跟进提示') || m.text?.includes('初审协同跟进'))));
            this.syncChatLogs();
            if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
            renderChat(this.state);
          }
        }

        const hasPassedToSubsequentStages = s2Chats.some(m => m && (
          m.text?.includes('半程研讨号召') || 
          m.text?.includes('半程会议号召') || 
          m.text?.includes('半程自查') || 
          m.text?.includes('半程修正清单')
        )) || !!s2.meetingStep || !!s2.isDraftConfirmed;
        
        if (!existReviewFollow && isFirstReviewIssued && !hasPassedToSubsequentStages && realFirstReviewMsg) {
          const reviewTime = parseMsgTime(realFirstReviewMsg) || this.stage2StartTime || (now - 60000);
          const reviewElapsed = Math.max(0, now - reviewTime);
          const studentMsgAfterReview = s2Chats.filter(m => m && m.sender && m.sender !== 'managingEditor' && m.sender !== 'reviewingEditor' && m.sender !== 'system' && parseMsgTime(m) > reviewTime);

          // 💡 教学交互优化：只要一审下发后学生【曾经在研讨区发言讨论过】，说明已达成引导交流目的（随后可能已转入文档埋头打字修改），绝不再弹窗打扰；
          // 仅当一审下发后全组【连续 3 分钟从未有任何同学发言】，才触发 1 次破冰跟进提醒。
          if (studentMsgAfterReview.length > 0) {
            this._nudgeCounts['s2_first_review_silence'] = 1; // 标记已响应，不再提醒
          } else if (reviewElapsed >= 180000) {
            this._nudgeCounts['s2_first_review_silence'] = 1;
            const followMsg = {
              sender: 'reviewingEditor',
              senderName: '学术质量 · 审稿编辑',
              text: `📝 【审稿编辑·初审协同跟进】：初审破题把脉意见已于上方研讨区发出！建议大家花 1 分钟互相通读同伴起草的开头段落，参考审稿建议在研讨区共同交流核心研究问题与概念界定是否统一对齐，群策群力打牢全篇学术地基！`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              _timeMs: now
            };
            if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
            this.state.chatLogs.stage2.push(followMsg);
            this.syncChatLogs();
            if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
            renderChat(this.state);
            return;
          }
        }

        // ── ⏳ 阶段二：90% 时间收尾倒计时冲刺提醒（全场严格仅 1 次）──
        const times = (this.state.stage1 && this.state.stage1.contract && this.state.stage1.contract.timeAllocations) ? this.state.stage1.contract.timeAllocations : {};
        const totalPlannedMin = (times.background || 25) + (times.literature || 30) + (times.questions || 25) + (times.method || 40) + (times.reflection || 20) + (times.references || 10);
        const totalTaskMinutes = (curTask && (curTask.durationMinutes || curTask.duration)) ? Number(curTask.durationMinutes || curTask.duration) : (totalPlannedMin > 0 ? (totalPlannedMin / 0.70) : 150);
        const s2BaseBudgetMin = totalTaskMinutes * 0.70;
        const totalPlannedMs = Math.max(totalPlannedMin * 60 * 1000, s2BaseBudgetMin * 60 * 1000);
        const s2EntryTime = s2.startTime || s2.stageStartTime || this.stage2StartTime;
        const s2ElapsedMs = s2EntryTime ? Math.max(0, now - s2EntryTime) : stage2DurationMs;
        const timeProgress = totalPlannedMs > 0 ? (s2ElapsedMs / totalPlannedMs) : 0;

        const hasMeetingInLogs = s2Chats.some(m => m && m.sender === 'managingEditor' && (m.text?.includes('半程研讨号召') || m.text?.includes('半程会议号召') || m.text?.includes('半程自查')));
        const has90ReminderInLogs = s2Chats.some(m => m && m.sender === 'managingEditor' && (m.text?.includes('阶段二推进提示') || m.text?.includes('90% 节点') || m.text?.includes('收尾倒计时') || m.text?.includes('冲刺')));

        if (!has90ReminderInLogs && timeProgress >= 0.90 && hasMeetingInLogs && !s2.isDraftConfirmed && !this.state.s2_90ReminderSent) {
          this.state.s2_90ReminderSent = true;
          const taskType = this.getCurrentTaskType();
          const isInst = (taskType === 'instructional');
          const managingName = isInst ? '备课组长' : '责任编辑';
          const msg90 = {
            sender: 'managingEditor',
            senderName: `协同调度 · ${managingName}`,
            text: `🤝 【${managingName}·收尾倒计时冲刺】：阶段二协作时间已达 90% 冲刺节点！请全组抓紧将修改对策落实到正文中，核对无误后在上方点击【✍️ 确认初稿】，进入【🎓 阶段三：答辩评审】！`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            _timeMs: now
          };
          if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
          this.state.chatLogs.stage2.push(msg90);
          this.syncChatLogs();
          if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
          renderChat(this.state);
        }
      }

      // ======================================================================
      // 🎓 阶段三：中间委员 (Neutral Committee Member) 裁决引导机制
      // ======================================================================
      else if (stage === 'stage3') {
        const s3 = this.state.stage3;
        if (!s3 || this.state.isFinalSubmitted) return;
        if (!s3.startTime) s3.startTime = this.stage3StartTime || now;
        if (!this.stage3StartTime) this.stage3StartTime = s3.startTime;

        // 🛡️ 答辩委员会尚未全部就绪或正在生成评审时，严禁静默定时器抢跑插话！
        if (this.state.stage3CommitteeLoading || this.state.stage3CommitteeEvaluating || !s3.feedbackItems || s3.feedbackItems.length === 0) {
          return;
        }

        const stage3DurationMs = now - (s3.startTime || this.stage3StartTime || now);
        const s3Chats = (this.state.chatLogs && this.state.chatLogs.stage3) ? this.state.chatLogs.stage3 : [];
        const lastStudentMsg = [...s3Chats].reverse().find(m => m.sender && !['neutral', 'proponent', 'opponent', 'system', 'managingEditor', 'reviewingEditor'].includes(m.sender));
        
        // 🛡️ 以中间委员下发答辩思路引导的时间为静默计时基准，预留充分的通读思考时间
        const lastChairGuide = [...s3Chats].reverse().find(m => m.sender === 'neutral' && m.text?.includes('答辩思路引导'));
        const baselineTime = lastStudentMsg ? (lastStudentMsg._timeMs || now) : (lastChairGuide ? (lastChairGuide._timeMs || now) : now);
        const silenceDurationMs = now - baselineTime;

        const feedbacks = Array.isArray(s3.feedbackItems) ? s3.feedbackItems : [];
        const pendingFeedbacks = feedbacks.filter(f => f.role !== 'proponent' && (!f.response || f.response.trim().length === 0));

        // ── 🎓 阶段三静默守护与 6 分钟强兜底：中间委员引导后，3 分钟破冰，6 分钟自动提炼定案顺推
        if (pendingFeedbacks.length > 0) {
          const currentPending = pendingFeedbacks[0];
          const inqIndex = feedbacks.indexOf(currentPending);
          const inqLabel = inqIndex >= 1 ? `意见 ${inqIndex}` : '当前质询';

          // ① 挂机 3 分钟破冰启发（若学生已在研讨区交流过则不再打扰）
          const chairGuideTime = lastChairGuide ? (lastChairGuide._timeMs || 0) : 0;
          const studentMsgAfterGuide = s3Chats.filter(m => m.sender && !['neutral', 'proponent', 'opponent', 'system', 'managingEditor', 'reviewingEditor'].includes(m.sender) && (m._timeMs || 0) > chairGuideTime);
          const count = this._nudgeCounts[`s3_silence_${currentPending.id}`] || 0;

          if (studentMsgAfterGuide.length > 0) {
            this._nudgeCounts[`s3_silence_${currentPending.id}`] = 1; // 已发言交流，标记已响应
          } else if (silenceDurationMs > 180000 && silenceDurationMs <= 360000 && count < 1) {
            this._nudgeCounts[`s3_silence_${currentPending.id}`] = 1;
            const s3SilenceMsg = {
              sender: 'neutral',
              senderName: '答辩委员会主席 · 中间委员',
              text: `🟡 【中间委员·答辩协同启发】：关于【${inqLabel}】，建议全组成员集思广益、协同破局，在讨论区共同商讨出一条最有说服力的操作化补救与辩护思路；商定好后随时点击上方按钮帮全组一键提炼定案！`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              _timeMs: now
            };
            if (!this.state.chatLogs.stage3) this.state.chatLogs.stage3 = [];
            this.state.chatLogs.stage3.push(s3SilenceMsg);
            this.syncChatLogs();
            if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
            renderChat(this.state);
            return;
          }
        }

        // ── ⏳ 阶段三：总时间仅剩 5 分钟终稿冲刺提醒（全场严格仅发 1 次）──
        const allTasks = (this.authManager) ? this.authManager.getTasks() : [];
        const curTask = allTasks.find(t => t.id === this.state.activeTaskId);
        let remainingMs = Infinity;
        if (curTask && curTask.deadline) {
          const raw = String(curTask.deadline).trim();
          if (raw && !raw.includes('无') && !raw.includes('随时') && !raw.includes('结课前') && !raw.includes('不限')) {
            const dlTime = new Date(raw.replace(/-/g, '/')).getTime();
            if (!isNaN(dlTime)) remainingMs = dlTime - now;
          }
        }
        if (remainingMs === Infinity && curTask && (curTask.durationMinutes || curTask.duration)) {
          const totalDurMs = Number(curTask.durationMinutes || curTask.duration) * 60 * 1000;
          const taskStart = this.state.taskStartTime || this.state.stage1StartTime || (now - stage3DurationMs);
          remainingMs = (taskStart + totalDurMs) - now;
        }

        const taskType = this.getCurrentTaskType();
        const isInst = (taskType === 'instructional');
        const chairSenderName = isInst ? '答辩委员会主席' : '答辩委员会主席 · 中间委员';
        const docName = isInst ? '教学设计' : '论文';
        const chairShortTitle = isInst ? '答辩主席' : '中间委员';

        const exist5mReminder = s3Chats.some(m => m && m.sender === 'neutral' && (m.text?.includes('仅剩最后 5 分钟') || m.text?.includes('5 分钟终稿') || m.text?.includes('5分钟终稿')));
        if (!exist5mReminder && remainingMs <= 300000 && remainingMs > 0 && !this.state.isFinalSubmitted) {
          this._nudgeCounts['s3_5m_deadline_reminder'] = 1;
          const msg5m = {
            sender: 'neutral',
            senderName: chairSenderName,
            text: `⏳ 【${chairShortTitle}·5分钟终稿归档冲刺】：关注到本次${isInst ? '教学设计' : '学术'}任务总时间仅剩最后 5 分钟！请全组成员加快节奏，在左侧【修改${docName}终稿】面板将答辩共识快速落实到正文中，并点击【🎓 确认提交${docName}终稿】完成归档！`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            _timeMs: now
          };
          if (!this.state.chatLogs.stage3) this.state.chatLogs.stage3 = [];
          this.state.chatLogs.stage3.push(msg5m);
          this.syncChatLogs();
          if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
          renderChat(this.state);
        }
      }
    }, 10000);
  }

  async checkUnreadAnnouncements() {
    if (this.state.studentViewMode !== 'workspace') return;

    const currentUser = this.authManager ? this.authManager.getCurrentUser() : null;
    if (!currentUser || currentUser.isTeacher || currentUser.role === 'teacher') return;
    const activeTaskId = this.state.activeTaskId;
    if (!activeTaskId) return;

    const doCheck = () => {
      if (this.state.studentViewMode !== 'workspace') return;
      const effectiveClassId = this.authManager ? this.authManager.getEffectiveStudentClassId(currentUser, this.state.activeTaskId) : (this.state.activeStudentClassId || currentUser?.classId || null);
      const classes = this.authManager.getClasses();
      const currentClassObj = classes.find(c => c.id === effectiveClassId);
      const effectiveClassName = currentClassObj ? currentClassObj.name : '';
      const activeGroupObj = this.authManager.getStudentActiveGroup(currentUser, effectiveClassId);
      const groupId = this.state.activeGroupId || this.cloudSyncEngine?.groupId || activeGroupObj?.id || currentUser?.groupId || null;
      const allTasks = this.authManager.getTasks();

      const isAnnRead = (a) => {
        if (!a) return false;
        try {
          const localReadMap = JSON.parse(localStorage.getItem('jizhi_locally_read_announcements') || '{}');
          if (localReadMap[a.id]) return true;
        } catch (e) {}
        if (currentUser) {
          if (currentUser.id && a.readStatus && a.readStatus[currentUser.id]) return true;
          if (currentUser.name && a.readStatus && a.readStatus[currentUser.name]) return true;
          if (Array.isArray(a.confirmedMembers)) {
            if (a.confirmedMembers.some(m => m && (m.id === currentUser.id || (currentUser.name && m.name === currentUser.name)))) return true;
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

          if (a.taskId && a.taskId !== 'task_all' && a.taskId !== 'all') {
            const tObj = allTasks.find(t => t.id === a.taskId);
            if (tObj && isTaskExpired(tObj)) return false;
          }

          const isMatched = isScopeMatch(a, {
            userClassId: effectiveClassId || currentUser?.classId,
            userGroupId: groupId,
            currentTaskId: activeTaskId,
            userClassName: effectiveClassName
          });

          return isMatched && !isAnnRead(a);
        })
        .sort((a, b) => (b.id > a.id ? 1 : -1));

      // 📢 教师发布的教学指示/课堂通知在工作台自动弹窗提示学生阅读并确认
      if (unreadList.length > 0) {
        if (document.querySelector('.modal-announcement-popup')) {
          return;
        }
        this.showAnnouncementModal(unreadList[0], true);
      }
    };

    // 1. 本地缓存秒级校验并弹窗
    doCheck();

    // 2. 异步拉取云端最新数据后再次校验
    if (this.authManager && this.authManager.pullGlobalMeta) {
      try {
        await this.authManager.pullGlobalMeta();
        doCheck();
      } catch (e) {}
    }
  }

  showAnnouncementModal(targetAnn = null, isSequentialFlow = false) {
    if (isSequentialFlow && document.querySelector('.modal-announcement-popup')) {
      return;
    }
    document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
    const currentUser = this.authManager.getCurrentUser();
    const effectiveClassId = this.authManager ? this.authManager.getEffectiveStudentClassId(currentUser, this.state.activeTaskId) : (this.state.activeStudentClassId || currentUser?.classId || null);
    const classes = this.authManager.getClasses();
    const currentClassObj = classes.find(c => c.id === effectiveClassId);
    const effectiveClassName = currentClassObj ? currentClassObj.name : '';
    const activeGroupObj = this.authManager.getStudentActiveGroup(currentUser, effectiveClassId);
    const groupId = this.state.activeGroupId || this.cloudSyncEngine?.groupId || activeGroupObj?.id || currentUser?.groupId || null;
    const isTaskListMode = (this.state && this.state.studentViewMode === 'task_list');
    const activeTaskId = this.state.activeTaskId || null;
    const allAnns = this.authManager.getAnnouncements();

    const isAnnRead = (a) => {
      if (!a) return false;
      try {
        const localReadMap = JSON.parse(localStorage.getItem('jizhi_locally_read_announcements') || '{}');
        if (localReadMap[a.id]) return true;
      } catch (e) {}
      if (currentUser) {
        if (currentUser.id && a.readStatus && a.readStatus[currentUser.id]) return true;
        if (currentUser.name && a.readStatus && a.readStatus[currentUser.name]) return true;
        if (Array.isArray(a.confirmedMembers)) {
          if (a.confirmedMembers.some(m => m && (m.id === currentUser.id || (currentUser.name && m.name === currentUser.name)))) return true;
        }
      }
      return false;
    };

    const isExtensionNotice = (a) => !!(a && (a.isExtension || a.title?.includes('延期通知') || a.title?.includes('时间已延长') || a.title?.includes('延长至')));

    // 🎯 教学通知中心展示与统计纯正的【教学任务与作业通知】（延期由瞬时大弹窗处理）
    const myAnns = allAnns
      .filter(a => {
        if (!a) return false;
        if (isExtensionNotice(a)) return false; // 🚫 彻底屏蔽延期通知混入通知中心
        return isScopeMatch(a, {
          userClassId: effectiveClassId || currentUser?.classId,
          userGroupId: groupId,
          currentTaskId: activeTaskId,
          userClassName: effectiveClassName
        });
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
        <div style="padding:20px 24px; max-height:62vh; overflow-y:auto; overscroll-behavior:contain; display:flex; flex-direction:column; gap:12px; background:#f8fafc;">
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
          <div style="padding:20px 24px; max-height:60vh; overflow-y:auto; overscroll-behavior:contain; display:flex; flex-direction:column; gap:16px;">
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
      // ⚡ 0 延迟即时刷新右上角【教学通知】红点角标
      const bellBtn = document.getElementById('btn-header-ann-bell');
      if (bellBtn) {
        const curAllAnns = this.authManager.getAnnouncements();
        const curUnread = curAllAnns.filter(a => {
          if (!a || isExtensionNotice(a)) return false;
          const mClass = !a.classId || a.classId === 'all' || a.classId === effectiveClassId;
          const mTask = !a.taskId || a.taskId === 'task_all' || a.taskId === activeTaskId;
          return mClass && mTask && !isAnnRead(a);
        });
        if (curUnread.length === 0) {
          bellBtn.classList.remove('has-unread');
          const badge = bellBtn.querySelector('span:not(:first-child)');
          if (badge) badge.remove();
        } else {
          bellBtn.classList.add('has-unread');
          let badge = bellBtn.querySelector('span:not(:first-child)');
          if (badge) {
            badge.innerText = curUnread.length;
          } else {
            const newBadge = document.createElement('span');
            newBadge.style.cssText = 'background:#ef4444; color:#ffffff; font-size:10.5px; font-weight:800; padding:1px 6px; border-radius:10px; box-shadow:0 1px 4px rgba(239,68,68,0.4);';
            newBadge.innerText = curUnread.length;
            bellBtn.appendChild(newBadge);
          }
        }
      }
      if (this.state.studentViewMode === 'task_list') {
        this.renderMain();
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
        this.authManager.markAnnouncementConfirmed(ann.id, currentUser ? (currentUser.id || currentUser.name) : (currentUser?.id || ''), myName, groupId);
        
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
          const attObj = typeof att === 'string' ? (safeJsonParse(att, { url: att, name: '随附教学文献.pdf' })) : att;
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
    const currentClassId = this.authManager.getEffectiveStudentClassId(currentUser, this.state.activeTaskId) || currentUser?.classId || null;
    const currentTaskId = this.state.activeTaskId || null;
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
    const groupId = user && user.groupId ? user.groupId : (this.state.activeMonitorGroupId || this.state.activeGroupId || null);
    const classId = user ? user.classId : null;
    const activeTaskId = (this.state && this.state.activeTaskId) ? this.state.activeTaskId : null;
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

        <div style="padding:20px 24px; max-height:62vh; overflow-y:auto; overscroll-behavior:contain;">
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
    if (this.cloudSyncEngine) {
      this.cloudSyncEngine.sendPresenceLeave(user);
    }
    if (user) {
      const uCode = user.id;
      if (this.state.presence) {
        if (uCode) delete this.state.presence[uCode];
        if (user.studentCode) delete this.state.presence[user.studentCode];
      }
    }
    this.authManager.logout(); 
    this.state.studentViewMode = 'task_list';
    sessionStorage.removeItem('jizhi_student_view_mode');
    localStorage.removeItem('jizhi_student_view_mode');
    this.renderMain(); 
  }

  backToTaskList() {
    const user = this.authManager ? this.authManager.getCurrentUser() : null;
    if (this.cloudSyncEngine) {
      this.cloudSyncEngine.sendPresenceLeave(user);
      this.cloudSyncEngine.stopPolling();
    }
    this.state.studentViewMode = 'task_list';
    this.state.activeTaskId = null;
    this.state.activeTaskTitle = null;
    sessionStorage.setItem('jizhi_student_view_mode', 'task_list');
    sessionStorage.removeItem('jizhi_active_task_id');
    localStorage.setItem('jizhi_student_view_mode', 'task_list');
    localStorage.removeItem('jizhi_active_task_id');
    this.renderMain();
  }

  showTaskRevokedModal(taskTitle = '写作任务') {
    // 🛡️ 立即锁定撤销状态，并把全局状态直接切回任务大厅模式，终止工作台同步
    this._isHandlingTaskRevoked = true;
    const user = this.authManager ? this.authManager.getCurrentUser() : null;
    if (this.cloudSyncEngine) {
      this.cloudSyncEngine.sendPresenceLeave(user);
      this.cloudSyncEngine.stopPolling();
    }
    this.state.studentViewMode = 'task_list';
    this.state.activeTaskId = null;
    this.state.activeTaskTitle = null;
    sessionStorage.setItem('jizhi_student_view_mode', 'task_list');
    sessionStorage.removeItem('jizhi_active_task_id');
    localStorage.setItem('jizhi_student_view_mode', 'task_list');
    localStorage.removeItem('jizhi_active_task_id');

    // 立即切回大厅底层视图
    this.renderMain();

    // 确保弹窗在最顶层且全场仅保留 1 个
    document.querySelectorAll('.modal-task-deleted-overlay').forEach(el => el.remove());
    const modal = document.createElement('div');
    modal.className = 'modal-overlay modal-task-deleted-overlay';
    modal.style.cssText = 'z-index:999999; display:flex; align-items:center; justify-content:center; position:fixed; inset:0; background:rgba(15,23,42,0.75); backdrop-filter:blur(6px);';
    modal.innerHTML = `
      <div class="modal-card" style="background:#ffffff; border-radius:16px; max-width:440px; width:92%; padding:32px 26px; box-shadow:0 25px 60px -12px rgba(0,0,0,0.35); text-align:center; animation:modalPop 0.25s cubic-bezier(0.16,1,0.3,1); border:1.5px solid #fee2e2;">
        <div style="width:60px; height:60px; border-radius:50%; background:#fee2e2; color:#ef4444; display:flex; align-items:center; justify-content:center; margin:0 auto 16px; font-size:30px; box-shadow:0 4px 12px rgba(239,68,68,0.2);">🗑️</div>
        <h3 style="margin:0 0 10px; font-size:20px; color:#0f172a; font-weight:800;">写作任务已被教师删除</h3>
        <p style="margin:0 0 24px; font-size:14.5px; color:#475569; line-height:1.65;">
          您当前所在的写作任务《<b style="color:#ef4444;">${escapeHtml(taskTitle)}</b>》已被任课教师在后台删除。<br/>
          请点击下方按钮返回班级任务大厅。
        </p>
        <button id="btn-return-portal-revoked" class="btn btn-primary" style="width:100%; padding:12px 20px; font-size:15px; font-weight:700; border-radius:10px; background:linear-gradient(135deg, #2563eb, #1d4ed8); color:#fff; border:none; cursor:pointer; box-shadow:0 4px 12px rgba(37,99,235,0.3);">🚪 返回任务大厅</button>
      </div>
    `;
    document.body.appendChild(modal);

    const closeModal = () => {
      this._isHandlingTaskRevoked = false;
      if (document.body.contains(modal)) {
        modal.remove();
      }
      this.renderMain();
    };

    modal.querySelector('#btn-return-portal-revoked')?.addEventListener('click', closeModal);
  }

  renderHeader() {
    const currentUser = this.authManager.getCurrentUser();
    const headerEl = document.querySelector('.header-wrapper') || document.querySelector('.header');
    if (!headerEl) return;
    renderHeader(
      this.state, currentUser, this.authManager.getAnnouncements(),
      (s) => this.switchStage(s),
      () => this.handleLogout(),
      () => this.showAnnouncementModal(), () => this.showQuestionnaireModal(),
      () => this.backToTaskList()
    );
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
          const studentId = currentUser?.id || 'anonymous';
          const currentStage = this.state.currentStage || 'stage1';

          // 🛡️ 纯正文件上传：直传服务端 uploads/ 目录获取物理 HTTP URL，彻底杜绝 Base64 膨胀
          const fd = new FormData();
          fd.append('file', file);
          fd.append('userId', studentId);

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
              sender: studentId,
              senderName: currentUser ? currentUser.name : studentId,
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
    input.addEventListener('blur', () => { isComposing = false; });

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
      const studentId = currentUser?.id || 'student';
      const studentName = currentUser ? currentUser.name : '组员';
      const currentStage = this.state.currentStage;
      const msgObj = { 
        id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        sender: studentId, 
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
      this.state.studentChatCounts[studentId] = (this.state.studentChatCounts[studentId] || 0) + 1;

      this.syncChatLogs();
      renderChat(this.state);

      // ── 智能体答疑：仅当学生在聊天中显式 @智能体 时才触发大模型定向即时答疑 ──
      this.triggerAgentReplyIfNeeded(text);
      // 记录发送历史供极速双击防重
      input._lastSendTime = Date.now();
      input._lastSendText = text;
    };

    sendBtn.onclick = handleSend;
    input.onkeydown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        // 🛡️ Safari / WebKit 中文输入法合成防吞字：若处于输入法选词状态或 keyCode 229，绝对禁止触发发送与清空
        if (isComposing || e.isComposing || e.keyCode === 229 || window._isGlobalComposing || (e.nativeEvent && e.nativeEvent.isComposing)) return;
        const now = Date.now();
        if (input._lastSendTime && (now - input._lastSendTime < 80) && input._lastSendText === input.value.trim()) {
          return;
        }
        e.preventDefault();
        handleSend();
      }
    };
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
    let targetAgent = 'managingEditor';
    let emotionText = '';

    if (stage === 'stage1') {
      targetAgent = 'auctioneer';
      emotionText = `🎪 【拍卖师·选题启发与支持】：关注到大家在选题确定上有些纠结或顾虑～头脑风暴期思路碰撞非常正常，建议大家先放平心态，多看看彼此提案里最感兴趣的亮点，求同存异、相互融合，共同商定一个大家都认可的研究方向！`;
    } else if (stage === 'stage2') {
      targetAgent = 'managingEditor';
      emotionText = `🤝 【责任编辑·协同支持】：关注到大家在正文起草中遇到了难点！学术写作本身就是一个不断推敲和修改的过程，遇到卡点非常正常。大家可以在群里沟通具体哪个环节需要支持，全组协同探讨、相互补强，稳步推进！`;
    } else {
      targetAgent = 'neutral';
      emotionText = `🟡 【中间委员·学术答辩启发】：学术答辩中的尖锐质询正是让方案更加严谨的宝贵契机！反方的质询指出了可以进一步强化的空间，建议结合正方刚才提到的优势，从具体操作化补救的角度从容辩护！`;
    }

    const emotionPromptMsg = {
      sender: targetAgent,
      text: emotionText,
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
    // 🛡️ 截止只读锁与并发锁：只读模式下严禁触发任何 AI 回复
    if (this.isCurrentTaskReadOnly() || this._isAgentReplyInProgress) return;
    this._isAgentReplyInProgress = true;
    const stage = this.state.currentStage || 'stage1';
    let replyAgent = null;

    if (userMsg.includes('@中间委员') || userMsg.includes('@答辩主席') || userMsg.includes('@答辩委员会主席')) replyAgent = 'neutral';
    else if (userMsg.includes('@正方委员') || userMsg.includes('@正方专家') || userMsg.includes('@正方评审专家')) replyAgent = 'proponent';
    else if (userMsg.includes('@反方委员') || userMsg.includes('@反方专家') || userMsg.includes('@反方质询专家')) replyAgent = 'opponent';
    else if (userMsg.includes('@审稿编辑') || userMsg.includes('@教研专家')) replyAgent = 'reviewingEditor';
    else if (userMsg.includes('@责任编辑') || userMsg.includes('@备课组长')) replyAgent = 'managingEditor';
    else if (userMsg.includes('@拍卖师') || userMsg.includes('@备课引导师') || userMsg.includes('@引导师')) replyAgent = 'auctioneer';
    else if (userMsg.includes('@')) {
      // 学生 @ 了但没打全名，根据阶段智能匹配
      if (stage === 'stage1') replyAgent = 'auctioneer';
      else if (stage === 'stage2') replyAgent = userMsg.includes('审稿') ? 'reviewingEditor' : 'managingEditor';
      else if (stage === 'stage3') replyAgent = 'neutral';
    }

    if (!replyAgent) {
      this._isAgentReplyInProgress = false;
      return;
    }

    this.studentMsgCountSinceLastAgent = 0;
    const currentUser = this.authManager ? this.authManager.getCurrentUser() : null;
    const currentTopic = this.state.stage1 ? this.state.stage1.mergedTitle : '本组课题';
    const actualDocContent = (this.state.stage2 && this.state.stage2.unifiedContent) ? this.state.stage2.unifiedContent.replace(/<[^>]*>/g, '').trim() : '';

    const agentProfile = AgentProfiles[replyAgent] || { name: '智能体专家', avatar: '🤖', color: '#2563eb' };
    const tempThinkingId = 'thinking_' + Date.now();
    const thinkingMsg = {
      id: tempThinkingId,
      sender: replyAgent,
      senderName: agentProfile.roleTitle || agentProfile.name,
      text: `⏳ 【${agentProfile.name}】：正在通读上下文并为您起草学术意见...`,
      isThinking: true,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      _timeMs: Date.now()
    };
    if (!this.state.chatLogs[stage]) this.state.chatLogs[stage] = [];
    this.state.chatLogs[stage].push(thinkingMsg);
    renderChat(this.state);
    await new Promise(r => setTimeout(r, 1500));

    try {
      let replyText = null;
      try {
        const apiPromise = callCozeAgentAPI(replyAgent, userMsg, {
          stage: stage,
          topic: currentTopic,
          actualDoc: actualDocContent,
          userId: currentUser ? (currentUser.id ) : 'student_user'
        });
        const timeoutPromise = new Promise(r => setTimeout(() => r(null), 20000));
        replyText = await Promise.race([apiPromise, timeoutPromise]);
      } catch (err) {
        replyText = null;
      }

      if (!replyText || replyText.trim().length === 0) {
        if (replyAgent === 'managingEditor') {
          replyText = `🤝 【责任编辑】：收到同学的研讨反馈！大家在推进《${currentTopic}》时，建议先对齐本段的核心概念与前后逻辑衔接，有针对性问题可随时提出！`;
        } else if (replyAgent === 'reviewingEditor') {
          replyText = `📝 【审稿编辑】：通读了大家的研讨内容，建议大家紧扣研究问题界定与方法操作化，避免口语化表达，保持严谨学术语体！`;
        } else if (replyAgent === 'auctioneer') {
          replyText = `🏛️ 【学术拍卖师】：收到选题研讨疑问！建议在方案中进一步聚焦具体的教学情境与变量操作化，使方案更有落地推广价值！`;
        } else {
          replyText = `💡 【${agentProfile.name}】：针对同学的研讨要点，建议全组紧密围绕本题焦点展开针对性商讨，形成明确修改共识！`;
        }
      }

      thinkingMsg.text = replyText.trim();
      delete thinkingMsg.isThinking;
      
      // 🌟 核心突破：通过 sendSingleChatMessage 100% 写入 MySQL 数据库并广播全组
      this.sendSingleChatMessage(thinkingMsg, stage);
      this.syncChatLogs();
      if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
      renderChat(this.state);
    } catch (err) {
      console.warn('triggerAgentReplyIfNeeded error:', err);
    } finally {
      this._isAgentReplyInProgress = false;
    }
  }

  /**
   * 💡 阶段一：重试特定提案的学术速评
   */
  async retryProposalEvaluation(btnElement, failedMsgId, title, authorName, isModify) {
    if (btnElement) {
      btnElement.disabled = true;
      btnElement.style.opacity = '0.6';
      btnElement.style.cursor = 'not-allowed';
      btnElement.innerHTML = `⏳ 正在重新研读《${title}》...`;
    }
    await this.handleProposalSubmittedAIFeedback(title, authorName, isModify, failedMsgId);
  }

  /**
   * 💡 阶段一：学生提交/修改提案时，拍卖师调用大模型给出学术亮点速评与探究启发
   */
  async handleProposalSubmittedAIFeedback(title, authorName, isModify = false, failedMsgId = null) {
    const currentStage = this.state.currentStage || 'stage1';
    if (!this.state.chatLogs[currentStage]) this.state.chatLogs[currentStage] = [];

    const normTitle = (title || '').trim();
    const normAuthor = (authorName || '').trim();
    if (!normTitle) return;

    const taskType = this.getCurrentTaskType();
    const isInst = (taskType === 'instructional');
    const agentRole = isInst ? '备课引导师' : '学术拍卖师';
    const agentSenderName = isInst ? '头脑风暴 · 备课引导师' : '头脑风暴 · 学术拍卖师';

    // 🛡️ 1. 并发防抖与去重锁：防止同一提案同时发起多个请求造成刷屏与 Token 浪费
    this._inFlightEvaluations = this._inFlightEvaluations || new Set();
    const evalKey = `${normTitle}__${normAuthor}`;
    if (this._inFlightEvaluations.has(evalKey)) {
      console.log('🛡️ 提案速评请求进行中，已自动防抖拦截:', evalKey);
      return;
    }

    // 🛡️ 2. 如果非修改模式且非重试，且已经存在针对该提案的有效评估，直接跳过
    const s1Logs = this.state.chatLogs[currentStage] || [];
    const existingEval = s1Logs.find(m => m && m.sender === 'auctioneer' && (m.text || '').includes('提案评估') && !((m.text || '').includes('网络提醒')) && ((m.text || '').includes(normTitle)));
    if (existingEval && !isModify && !failedMsgId) {
      console.log('🛡️ 提案已有有效评估，无需重复请求:', normTitle);
      return;
    }

    this._inFlightEvaluations.add(evalKey);

    // 🛡️ 3. 清理已有的同提案失败气泡与思考中占位气泡
    this.state.chatLogs[currentStage] = this.state.chatLogs[currentStage].filter(m => {
      if (!m) return false;
      if (String(m.id).startsWith('thinking_eval') || m.isThinking) return false;
      if (failedMsgId && m.id === failedMsgId) return false;
      return true;
    });

    const thinkingAiMsg = {
      id: 'thinking_eval_' + Date.now(),
      sender: 'auctioneer',
      senderName: agentSenderName,
      text: `⏳ ${agentRole}正在研读评估《${normTitle}》（作者：${normAuthor}）的${isInst ? '教学构想与设计亮点' : '学术亮点与研讨启发'}...`,
      isThinking: true,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      _timeMs: Date.now()
    };
    this.state.chatLogs[currentStage].push(thinkingAiMsg);
    renderChat(this.state);

    const taskPrompt = `小组成员【${normAuthor}】在选题池${isModify ? '修改完善了' : '提出了新'}提案《${normTitle}》。
请作为资深${isInst ? '备课引导师/教学设计教研专家' : '学术拍卖师/实证研究专家'}：
【最高审查红线】：先审查文本是否为乱码、无意义字符或空洞套话。若是，严禁虚构亮点，直接回复：“当前提交内容尚未形成可研讨的实质提案”，引导其交流思路或@${agentRole}；
若内容真实有效，请给出 100~130 字专业点评：
① 肯定其最出彩的 1~2 个具体优点（${isInst ? '如教材学情破题/真实情境创设/活动主线设计' : '如研究切口/方法构想，或问题界定与逻辑严密性'}）；
② 提出 1 个启发性落地建议。
严禁在末尾添加任何按钮指引，纯自然语言，100~130字。`;

    try {
      const resp = await callCozeAgentAPI('auctioneer', taskPrompt, { stage: 'stage1', topic: normTitle, taskType });
      let speech = '';
      if (resp && resp.trim().length > 0) {
        let cleanResp = resp.trim().replace(/^(?:🎪|🏛️)?\s*【(?:学术拍卖师|拍卖师|备课引导师|引导师)[·\s]*(?:选题速评|提案速评|提案评估|落槌与方案研讨)?】[：:]\s*/g, '');
        if (!cleanResp.includes(`《${normTitle}》`) && !cleanResp.includes(normTitle)) {
          speech = `🏛️ 【${agentRole}·提案评估】：针对《${normTitle}》（${normAuthor} 提出）—— ${cleanResp.trim()}`;
        } else {
          speech = `🏛️ 【${agentRole}·提案评估】：${cleanResp.trim()}`;
        }
      } else {
        throw new Error('Empty response from AI');
      }

      const finalAiMsg = {
        id: 'eval_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        sender: 'auctioneer',
        senderName: agentSenderName,
        text: speech,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        _timeMs: Date.now()
      };

      // 🛡️ 彻底清除历史残留的 thinking_eval 占位气泡和针对该提案的网络提醒失败气泡
      this.state.chatLogs[currentStage] = (this.state.chatLogs[currentStage] || []).filter(m => {
        if (!m) return false;
        if (String(m.id).startsWith('thinking_eval') || m.isThinking) return false;
        if (m.sender === 'auctioneer' && (m.text || '').includes('网络提醒') && ((m.text || '').includes(normTitle) || (failedMsgId && m.id === failedMsgId))) {
          return false;
        }
        return true;
      });
      this.state.chatLogs[currentStage].push(finalAiMsg);

      if (typeof this.sendSingleChatMessage === 'function') {
        this.sendSingleChatMessage(finalAiMsg, currentStage);
      }
      this.syncChatLogs();
      if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
      renderChat(this.state);

      // 🛡️ 若本次评估成功，检查是否全员提案与对应的每位成员速评均已就绪，若是则唤起协同研讨提示
      const s1 = this.state.stage1 || {};
      const currentProps = s1.proposals || [];
      const isSubstantive = (t) => {
        const str = (t || '').trim();
        if (str.length < 4) return false;
        if (/^\d+$/.test(str)) return false; 
        if (/^([a-zA-Z0-9\u4e00-\u9fa5])\1+$/.test(str)) return false; 
        return true;
      };
      const validProps = currentProps.filter(p => isSubstantive(p.title));
      const membersList = Array.isArray(this.state.members) ? this.state.members : Object.values(this.state.members || {});
      const totalMembersCount = membersList.length || 2;
      const curS1Logs = this.state.chatLogs?.stage1 || [];

      const allEvaluated = validProps.length >= totalMembersCount && validProps.every(p => {
        return curS1Logs.some(m => m && m.sender === 'auctioneer' && (m.text || '').includes('提案评估') && !((m.text || '').includes('网络提醒')) && ((m.text || '').includes(p.title) || (m.text || '').includes(p.authorName || '')));
      });

      if (validProps.length >= totalMembersCount && allEvaluated && !s1._allProposalsPrompted && !this.state.s1_allPropsGatheredSent) {
        s1._allProposalsPrompted = true;
        this.state.s1_allPropsGatheredSent = true;
        this.state._propsGatheredTimeMs = Date.now();
        const allCollectedMsg = {
          id: 'all_prop_' + Date.now(),
          sender: 'auctioneer',
          senderName: agentSenderName,
          text: `🎪 【${agentRole}·提案集齐与协同研讨】：太棒了！全组成员的提案与专家速评均已悉数亮相！请大家先在讨论区围绕各自提案的创新亮点与互补性展开 1~2 分钟的协同交流，深入了解彼此设想，随后点击左侧卡片投出关键的一票！`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          _timeMs: Date.now() + 100
        };
        this.state.chatLogs.stage1.push(allCollectedMsg);
        if (typeof this.sendSingleChatMessage === 'function') {
          this.sendSingleChatMessage(allCollectedMsg, 'stage1');
        }
        this.syncChatLogs();
        if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
        renderChat(this.state);
      }
    } catch (e) {
      console.warn('handleProposalSubmittedAIFeedback error:', e);
      const safeTitle = normTitle.replace(/'/g, "\\'");
      const safeAuthor = normAuthor.replace(/'/g, "\\'");
      const errId = failedMsgId || ('eval_err_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5));
      const fallbackAiMsg = {
        id: errId,
        sender: 'auctioneer',
        senderName: agentSenderName,
        text: `🏛️ 【${agentRole}·网络提醒】：📡 智能体网络连接稍有延迟，未能获取到针对《${normTitle}》（作者：${normAuthor}）的即时评估。<br><button class="btn-retry-ai" onclick="window.app.retryProposalEvaluation(this, '${errId}', '${safeTitle}', '${safeAuthor}', ${isModify})" style="margin-top:6px; background:#2563eb; color:#fff; border:none; padding:4px 12px; border-radius:12px; font-size:12px; cursor:pointer; font-weight:700;">🔄 重新生成《${normTitle}》评估</button>`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        _timeMs: Date.now()
      };
      this.state.chatLogs[currentStage] = (this.state.chatLogs[currentStage] || []).filter(m => !m || (!String(m.id).startsWith('thinking_eval') && !m.isThinking));
      const existingErrIdx = this.state.chatLogs[currentStage].findIndex(m => m && m.id === errId);
      if (existingErrIdx >= 0) {
        this.state.chatLogs[currentStage][existingErrIdx] = fallbackAiMsg;
      } else {
        this.state.chatLogs[currentStage].push(fallbackAiMsg);
      }
      if (typeof this.sendSingleChatMessage === 'function') {
        this.sendSingleChatMessage(fallbackAiMsg, currentStage);
      }
      this.syncChatLogs();
      if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
      renderChat(this.state);
    } finally {
      this._inFlightEvaluations.delete(evalKey);
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

    const isAlreadyVoted = isMemberDone(s1.hasVoted, currUserObj || { id: user });
    if (isAlreadyVoted) {
      alert('💡 您已经完成投票啦！每位成员仅有一次投票机会，请耐心等待其他组员完成投票。');
      return;
    }
    if (!s1.hasVoted) s1.hasVoted = {};
    if (!s1.votes) s1.votes = {};

    const userKey = currUserObj ? currUserObj.id : user;
    s1.votes[userKey] = proposalId;
    s1.hasVoted[userKey] = true;
    if (currUserObj && currUserObj.name) {
      s1.votes[currUserObj.name] = proposalId;
      s1.hasVoted[currUserObj.name] = true;
    }

    if (!s1._firstVoteTimeMs) s1._firstVoteTimeMs = Date.now();
    s1._lastVoteTime = Date.now();
    const proposal = (s1.proposals || []).find(p => p.id === proposalId);
    const membersList = Object.values(this.state.members || {});
    const totalMembersCount = membersList.length || 3;
    const votesCastCount = membersList.filter(m => isMemberDone(s1.hasVoted, m)).length;
    const proposalTitle = proposal ? proposal.title : proposalId;

    this.syncStage1();
    if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
    // 💡 0ms 立即局部重绘视图，按钮变为【已投此提案】且得票数和进度条毫秒级跳动
    this.renderStudentWorkspace();

    if (typeof showGlobalBannerNotice === 'function') {
      showGlobalBannerNotice(`🎉 投票成功！您已支持《${proposalTitle}》`, `📊 当前全组投票进度：${votesCastCount}/${totalMembersCount} 人已完成，等待全员投票揭晓结果。`);
    }

    if (votesCastCount >= totalMembersCount) {
      // ── 全员投票完成：立即提示并调用大模型拍卖师 API 动态生成专业落槌播报与研讨引导 ──
      const progressBadge = document.getElementById('proposal-vote-progress-badge');
      if (progressBadge) {
        progressBadge.innerHTML = `🎉 全员已投完 (共投出 ${votesCastCount} 票) · 正在呼叫拍卖师落槌...`;
      }
      setTimeout(async () => {
        s1._voteCompletedTime = Date.now();
        const tally = {};
        membersList.forEach(m => {
          const pId = s1.votes[m.id] || (m.name && s1.votes[m.name]);
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
          s1.flowStep = 'refining';
          this.state.stage1PendingRefinement = true;
        } else {
          s1.flowStep = 'divergence';
          this.state.stage1PendingDivergence = true;
        }
        this.syncStage1();

        const taskType = this.getCurrentTaskType();
        const isInst = (taskType === 'instructional');

        if (!s1.contract.timeAllocations) {
          s1.contract.timeAllocations = isInst
            ? { background: 15, literature: 20, questions: 15, method: 35, reflection: 15, references: 10 }
            : { background: 25, literature: 30, questions: 25, method: 40, reflection: 20, references: 10 };
}
        const genreDesc = getGenrePromptDescriptor(taskType);
        const agentTitle = isInst ? '备课引导师' : '学术拍卖师';
        const senderName = isInst ? '头脑风暴 · 备课引导师' : '头脑风暴 · 学术拍卖师';
        const prefixTag = isInst ? '备课引导师·方案研讨' : '学术拍卖师·落槌与方案研讨';
        const docThemeNoun = isInst ? '教学主题与备课方案' : '主题与研究方案';

        const tallyText = `📊 【投票结果】：${proposalSummaryList}`;

        const tallySysMsg = {
          id: 'vote_tally_' + Date.now(),
          sender: 'system',
          senderName: '系统通知',
          text: tallyText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          _timeMs: Date.now()
        };
        this.state.chatLogs.stage1.push(tallySysMsg);
        if (typeof this.sendSingleChatMessage === 'function') {
          this.sendSingleChatMessage(tallySysMsg, 'stage1');
        }

        // ── 🌟 2. 引导智能体发言（定性分析一致性/分歧互补，严禁报数字/票数） ──
        s1.contractStep = 'topic'; // 初始锁定第一步：主题与方案提炼

        if (isUnanimous && winningProposal) {
          // 情境 A：投票全票一致
          s1.mergedTitle = winningProposal.title;
          if (!s1.contract) s1.contract = {};
          s1.contract.topic = winningProposal.title;
          s1.contract.overview = '';
          s1.researchOverview = '';

          const unanimousPrompt = `${genreDesc}

全组成员已全票一致选定${isInst ? '备课方案' : '研究课题'}《${winningProposal.title}》。
【获胜提案内容/设想】: ${winningProposal.description || '暂无详细描述'}

请作为资深${agentTitle}：
发表 90~120 字的方案细化研讨引导（【绝对严禁出现任何票数数字，如“X票”、“全票”等，系统已单独播报票数】）：
① 肯定全组就该主题《${winningProposal.title}》达成一致，直接点出其核心切入亮点；
② 顺势引导大家在群里进一步商量具体的设计细节（如教学情境/探究活动/研究方法等）；
③ 末尾提示：“商量好后，请点击左侧公约看板中的【💡 讨论差不多了？一键提炼【${docThemeNoun}】】按钮！”
（纯自然语言输出，90~120字，严禁拆分成多条，严禁提及任何票数数字）`;

          let guideText = `恭喜全员就选题《${winningProposal.title}》达成一致！该方向切口精准且具备很好的深入空间。请大家在讨论区进一步商量具体的设计细节与切入角度（如具体情境创设、核心问题与方法/活动步骤等）。商量好后，请点击左侧公约看板中的【💡 讨论差不多了？一键提炼【${docThemeNoun}】】按钮！`;

          try {
            const aiResp = await callCozeAgentAPI('auctioneer', unanimousPrompt, { stage: 'stage1', topic: winningProposal.title, taskType });
            if (aiResp && aiResp.trim().length > 0) {
              guideText = aiResp.trim();
            }
          } catch (e) {
            console.warn('Auctioneer unanimous prompt fallback', e);
          }

          // 🛡️ 智能清洗并统一前缀为标准的单层格式，并过滤可能出现的票数数字
          guideText = guideText.replace(/^(?:🤖|🎪|🏛️)?\s*【(?:学术拍卖师|备课引导师|拍卖师|引导师)[·\s]*(?:全票通过|落槌与方案研讨|方案研讨|分歧指引|定名指引)?】[：:]\s*/g, '');
          guideText = `🏛️ 【${prefixTag}】：${guideText.trim()}`;

          const guideMsg = {
            id: 'vote_unanimous_' + Date.now(),
            sender: 'auctioneer',
            senderName: senderName,
            text: guideText,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            _timeMs: Date.now() + 100
          };
          this.state.chatLogs.stage1.push(guideMsg);
          if (typeof this.sendSingleChatMessage === 'function') {
            this.sendSingleChatMessage(guideMsg, 'stage1');
          }
        } else {
          // 情境 B：投票存在分歧
          s1.mergedTitle = '';
          if (!s1.contract) s1.contract = {};
          s1.contract.topic = '';
          s1.contract.overview = '';
          s1.researchOverview = '';

          const votedProposals = (s1.proposals || []).filter(p => (tally[p.id] || 0) > 0);
          const votedTitles = (votedProposals.length > 0 ? votedProposals : (s1.proposals || [])).map(p => `《${p.title}》`).join(' 与 ');
          const votedDetails = (votedProposals.length > 0 ? votedProposals : (s1.proposals || [])).map((p, idx) => `【方向${idx + 1}：《${p.title}》】: ${p.description || '暂无详细描述'}`).join('\n');

          const divergencePrompt = `${genreDesc}

小组成员完成了选题投票，目前大家分别聚焦在不同方向：${votedTitles}（存在分歧）。
【各提案设想内容】:
${votedDetails}

请作为资深${agentTitle}：
发表 100~130 字的分歧融合与方案研讨引导（【绝对严禁出现任何票数数字，如“X票”、“Y票”等，系统已单独播报票数】）：
① 说明大家目前分别聚焦在 ${votedTitles} 等不同方向；
② 深入、客观分析不同方向的侧重点与互补优势（例如一个侧重情境载体/学情导入，一个侧重核心方法/活动建构），引导全组商量如何取长补短、融合为一个统一完善的课题与方案；
③ 末尾提示：“商量好后，请点击左侧公约看板中的【💡 讨论差不多了？一键提炼【${docThemeNoun}】】按钮！”
（纯自然语言输出，100~130字，严禁拆分成多条，严禁提及任何票数数字）`;

          let guideText = `小组成员目前分别聚焦在 ${votedTitles} 等不同方向。各个方案各有侧重且具有很强的互补性，建议大家在讨论区充分交流，取长补短确定统一方向并细化实施方案。商量好后，请点击左侧公约看板中的【💡 讨论差不多了？一键提炼【${docThemeNoun}】】按钮！`;

          try {
            const aiResp = await callCozeAgentAPI('auctioneer', divergencePrompt, { stage: 'stage1', topic: '方案分歧融合', taskType });
            if (aiResp && aiResp.trim().length > 0) {
              guideText = aiResp.trim();
            }
          } catch (e) {
            console.warn('Auctioneer divergence prompt fallback', e);
          }

          // 🛡️ 智能清洗并统一前缀为标准的单层格式
          guideText = guideText.replace(/^(?:🤖|🎪|🏛️)?\s*【(?:学术拍卖师|备课引导师|拍卖师|引导师)[·\s]*(?:全票通过|落槌与方案研讨|方案研讨|分歧指引|定名指引)?】[：:]\s*/g, '');
          guideText = `🏛️ 【${prefixTag}】：${guideText.trim()}`;

          const guideMsg = {
            id: 'vote_divergence_' + Date.now(),
            sender: 'auctioneer',
            senderName: senderName,
            text: guideText,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            _timeMs: Date.now() + 100
          };
          this.state.chatLogs.stage1.push(guideMsg);
          if (typeof this.sendSingleChatMessage === 'function') {
            this.sendSingleChatMessage(guideMsg, 'stage1');
          }
        }

        this.syncStage1();
        this.syncChatLogs();
        if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
        renderChat(this.state);
        this.renderStudentWorkspace();
      }, 800);
    }
  }

  /**
   * 🌟 通用全员协同确认包装器：需组内全员点击确认后才真正触发大模型生成并推进（原子后端 API 驱动，零覆盖）
   */
  async handleStepConfirmation(stepKey, onCompleteCallback, stepLabel) {
    if (!this.state.stepConfirmations) this.state.stepConfirmations = {};
    if (!this.state.stepConfirmations[stepKey]) this.state.stepConfirmations[stepKey] = {};

    const user = this.state.currentUser;
    const currUserObj = this.authManager ? this.authManager.getCurrentUser() : null;
    const primaryKey = String(currUserObj?.id || user || 'A').trim();
    const userKeys = [primaryKey, user, currUserObj?.id, currUserObj?.name].filter(Boolean);

    let members = [];
    if (this.authManager) {
      const u = this.authManager.getCurrentUser();
      const effClassId = (this.authManager ? this.authManager.getEffectiveStudentClassId(u, this.state.activeTaskId) : (this.state.activeStudentClassId || u?.classId || null));
      const effGroup = this.authManager.getStudentActiveGroup(u, effClassId);
      const rawG = this.authManager.getGroupMembersForWorkspace(effGroup?.id || this.state.activeGroupId || null, effClassId);
      const authMembers = Array.isArray(rawG) ? rawG : Object.values(rawG || {});
      if (authMembers.length > 0) members = authMembers;
    }
    if (members.length === 0) {
      if (Array.isArray(this.state.members)) members = this.state.members;
      else if (this.state.members && typeof this.state.members === 'object') members = Object.values(this.state.members);
    }
    if (!Array.isArray(members)) members = Object.values(members || {});
    const totalCount = Math.max(members.length, 2);

    const isAlreadyDone = userKeys.some(k => this.state.stepConfirmations[stepKey][k]);
    if (isAlreadyDone) {
      const currentCount = members.filter(m => isMemberDone(this.state.stepConfirmations[stepKey], m)).length;
      if (currentCount < totalCount) {
        alert(`💡 您已经确认过【${stepLabel}】啦！\n当前全组确认进度：${currentCount}/${totalCount} 人。\n请提醒组内其他同学点击确认，全员确认后将自动提炼并推进！`);
        return;
      }
    }

    // 1. 0ms 本地即时记录并重绘视图
    userKeys.forEach(k => { this.state.stepConfirmations[stepKey][k] = true; });
    this.renderStudentWorkspace();
    if (typeof window.renderChat === 'function') window.renderChat(this.state);

    // 2. ⚡ 原子提交至服务端 confirm_step 接口，合并全组成员点击
    const activeTaskId = this.state.activeTaskId || null;
    const effectiveClassId = this.state.activeStudentClassId || (currUserObj?.classId || null);
    const activeGroupObj = this.authManager ? this.authManager.getStudentActiveGroup(currUserObj, effectiveClassId) : null;
    const currentGroupId = activeGroupObj?.id || currUserObj?.groupId || this.state.activeGroupId || null;

    try {
      const res = await fetch('sync.php?action=confirm_step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: activeTaskId,
          groupId: currentGroupId,
          stepKey: stepKey,
          userKey: primaryKey,
          userName: currUserObj?.name || primaryKey
        })
      });
      const resData = await res.json();
      if (resData && resData.success && resData.stepConfirmations) {
        this.state.stepConfirmations = resData.stepConfirmations;
      }
    } catch (e) {
      console.warn('confirm_step API network error:', e);
    }

    // 3. 重新聚合计算全组确认达成人数
    const finalCount = members.filter(m => isMemberDone(this.state.stepConfirmations[stepKey], m)).length;
    this.renderStudentWorkspace();
    if (typeof window.renderChat === 'function') window.renderChat(this.state);

    // 4. 达成全员确认：清空服务端确认记录并触发后续大模型提炼
    if (finalCount >= totalCount) {
      try {
        fetch('sync.php?action=clear_step_confirmation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId: activeTaskId, groupId: currentGroupId, stepKey: stepKey })
        }).catch(() => {});
      } catch (e) {}

      delete this.state.stepConfirmations[stepKey];
      if (typeof onCompleteCallback === 'function') {
        onCompleteCallback();
      }
    }
  }

  /**
   * 💡 阶段一公约第一步：一键提炼【主题与研究方案】
   */
  async handleExtractTopic() {
    this.handleStepConfirmation('s1_topic', () => this._doExtractTopic(), '主题与研究方案');
  }

  async _doExtractTopic(btnElement = null) {
    if (btnElement && typeof btnElement === 'object' && btnElement.tagName) {
      btnElement.disabled = true;
      btnElement.style.opacity = '0.6';
      btnElement.style.cursor = 'not-allowed';
      btnElement.innerHTML = `⏳ 正在重新提炼【主题与方案】...`;
    }
    const s1 = this.state.stage1 || {};
    const taskType = this.getCurrentTaskType();
    const isInst = (taskType === 'instructional');
    const agentRole = isInst ? '备课引导师' : '学术拍卖师';
    const agentSenderName = isInst ? '头脑风暴 · 备课引导师' : '头脑风暴 · 学术拍卖师';

    // 🌟 在聊天区挂载正在提炼主题的思考动效与广播
    const inFlightTopicId = 'thinking_extract_topic_' + Date.now();
    const inFlightTopicMsg = {
      id: inFlightTopicId,
      isThinking: true,
      sender: 'auctioneer',
      senderName: agentSenderName,
      text: `⏳ 收到全组成员确认！${agentRole}正在根据讨论区研讨记录提炼【${isInst ? '教学课题与方案概述' : '论文主题与研究方案'}】，请稍候...`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      _timeMs: Date.now()
    };
    if (!this.state.chatLogs.stage1) this.state.chatLogs.stage1 = [];
    this.state.chatLogs.stage1.push(inFlightTopicMsg);
    if (typeof renderChat === 'function') renderChat(this.state);

    const s1ChatLogs = (this.state.chatLogs && this.state.chatLogs.stage1) ? this.state.chatLogs.stage1 : [];
    // 💡 局部精准切片：只截取投票结果出炉之后（学生集中讨论方案）的研讨记录，严格控制 token 花销
    const voteNoticeIdx = s1ChatLogs.findIndex(m => m && m.text && (m.text.includes('投票结果出炉') || m.text.includes('全票推选') || m.text.includes('投票已完成') || m.text.includes('投票完成')));
    const relevantLogs = (voteNoticeIdx >= 0) ? s1ChatLogs.slice(voteNoticeIdx) : s1ChatLogs.slice(-15);
    const validUserLogs = relevantLogs.filter(m => {
      if (!m || !m.text) return false;
      if (m.isThinking) return false;
      if (m.sender === 'system' || AgentProfiles[m.sender]) return false;
      if (m.text.startsWith('[IMG_DATA]:')) return false;
      if (m.text.includes('【投票结果出炉】') || m.text.includes('【公约草案就绪】')) return false;
      return true;
    });
    const chatSnippet = validUserLogs.map(m => {
      const name = m.senderName || m.sender || '组员';
      const cleanText = (m.text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      return `${name}: ${cleanText}`;
    }).filter(line => line.trim().length > 0).join('\n');

    // 抓取小组成员提交的提案详情（包含标题与方案说明）
    const propList = (s1.proposals && Array.isArray(s1.proposals)) ? s1.proposals : [];
    const propDetails = propList.map((p, idx) => {
      const authorStr = p.authorName ? ` (提交人: ${p.authorName})` : (p.author ? ` (提交人: ${p.author})` : '');
      const titleStr = p.title ? p.title.replace(/["'《》]/g, '').trim() : `提案${idx + 1}`;
      const descStr = p.description ? `\n   - 方案设想与说明: ${p.description.replace(/<[^>]+>/g, ' ').trim()}` : '';
      return `【提案${idx + 1}】《${titleStr}》${authorStr}${descStr}`;
    }).join('\n');

    const defaultCandidateFallback = isInst ? '优质课教学设计方案' : '学术协同研究课题';
    const currentCandidate = s1.mergedTitle || s1.contract?.topic || (propList[0] ? propList[0].title : defaultCandidateFallback);
    const allPropTitles = propList.map(p => `《${p.title}》`).join('、');

    const extractPrompt = `【任务指令：请为小组成员提炼规范${isInst ? '教学课题名称' : '论文题目'}与结构化${isInst ? '教学方案概述' : '研究方案概述'}】

【小组成员在讨论区的全部真实研讨发言（核心事实依据，组员发言为自然非制式交流）】:
${chatSnippet || (isInst ? '组员正在商讨具体学情、教学情境与探究建构方法' : '组员正在商讨具体情境、案例与研究方法')}

【小组成员提交的提案参考】:
${propDetails || (allPropTitles ? `候选提案: ${allPropTitles}` : '（组员未单独提交文本提案，主要通过上述聊天区直接研讨）')}

【提炼与提取核心要求（最高优先级：高度忠实于组员真实非制式研讨）】：
1. 真实研讨洞察：小组成员研讨往往是非制式、口语化的，且通常未在提案框中撰写详细文本说明。请务必从上述全部对话记录中，敏锐捕捉组员讨论的实际${isInst ? '教学情境、课文/知识点、活动设想、学情与突破思路' : '研究对象、实践情境、核心问题与实证方法'}；
2. 规范提炼【${isInst ? '教学课题' : '论文题目'}】：若组员在聊天或提案中有讨论聚焦的方向，提炼为学术/教学规范的课题名称；
3. 忠实提炼 120~200 字【${isInst ? '教学方案概述' : '研究方案概述'}】：必须直接反映组员在聊天中提出的具体想法与研讨要点，严禁脱离组员真实发言输出千篇一律的通用模板套话！

请务必按以下 JSON 格式输出（或严格包含对应字段）：
{
  "topic": "提炼后的规范${isInst ? '教学课题' : '论文题目'}",
  "overview": "根据上述组员真实讨论提炼的${isInst ? '教学方案概述（涵盖学情情境、教学目标重难点与探究建构活动）' : '研究方案概述（涵盖情境案例、核心科学问题与实证研究方法）'}",
  "guideText": "${isInst ? '教学课题与教学方案概述' : '论文主题与研究方案概述'}已成功生成并录入公约看板！接下来请全组在讨论区商讨 6 大${isInst ? '模块' : '章节'}的时间预算分配，商定后点击【⏱️ 时间讨论差不多了？一键提炼【时间分配】】！"
}`;

    try {
      const resp = await callCozeAgentAPI('auctioneer', extractPrompt, { stage: 'stage1', topic: currentCandidate, taskType });
      let finalTopic = currentCandidate;
      let finalOverview = '';
      let guideSpeech = `🎪 【${agentRole}·方案确立】：主题《${finalTopic}》与${isInst ? '教学' : '研究'}方案概述已成功确立并录入公约！👉 接下来请全组在讨论区商讨 6 大${isInst ? '模块' : '章节'}的时间预算分配，商定完成后点击【⏱️ 时间讨论差不多了？一键提炼【时间分配】】！`;

      if (resp && resp.trim().length > 0) {
        try {
          // 1. 先尝试清洗代码块标记并解析标准 JSON
          let cleanedResp = resp.replace(/```(?:json)?\s*/gi, '').replace(/```\s*$/gi, '').trim();
          const jsonMatch = cleanedResp.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            let jsonStr = jsonMatch[0];
            let parsed = safeJsonParse(jsonStr);
            if (!parsed) {
              // 尝试修复未转义换行符引起的 JSON 解析失败
              try {
                const fixedJson = jsonStr.replace(/"((?:\\.|[^"\\])*)"/g, (match, p1) => {
                  return '"' + p1.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t') + '"';
                });
                parsed = safeJsonParse(fixedJson);
              } catch (fixErr) {}
            }
            if (parsed) {
              const matchedTopic = parsed.topic || parsed.title || parsed.theme || parsed.name;
              const matchedOverview = parsed.overview || parsed.summary || parsed.description || parsed.scheme || parsed.plan || parsed.researchOverview || parsed.instructionalOverview;
              if (matchedTopic && typeof matchedTopic === 'string' && matchedTopic.trim().length > 0) {
                finalTopic = matchedTopic.trim().replace(/^《|》$/g, '');
              }
              if (matchedOverview && typeof matchedOverview === 'string' && matchedOverview.trim().length > 0) {
                finalOverview = matchedOverview.trim();
              }
              if (parsed.guideText || parsed.guide) guideSpeech = parsed.guideText || parsed.guide;
            }
          }

          // 2. 若 JSON 方式未能提取出 overview，无论是否有 jsonMatch，均无缝进入多级正则容错与自然语言抽取
          if (!finalOverview || !finalOverview.trim()) {
            const tMatch = resp.match(/(?:【(?:教学)?(?:研究)?(?:课题|题目|主题|topic)】|(?:课题|题目|主题|topic)[：:\s]*)[《“"]?([^》”"\n\r]+)[》”"]?/i);
            if (tMatch && tMatch[1] && tMatch[1].trim().length > 3) {
              finalTopic = tMatch[1].replace(/["'《》]/g, '').trim();
            }
            const oMatch = resp.match(/(?:【(?:教学)?(?:研究)?方案概述】|【方案设计】|【总体构想】|(?:方案概述|教学方案|研究方案|总体构想|方案设计|overview)[：:\s]*)([\s\S]+?)(?=\n\s*【|\n\s*[234]\.|\n\s*guideText|\n\s*"|$)/i);
            if (oMatch && oMatch[1] && oMatch[1].trim().length > 10) {
              finalOverview = oMatch[1].replace(/^["'：:\s]+|["'，,。;\s]+$/g, '').trim();
            }
          }
        } catch (je) {
          console.warn('Parse topic & overview JSON fail, use synthesized fallback', je);
        }
      } else {
        throw new Error('Empty topic extraction response');
      }

      // 🛡️ 兜底确保 finalOverview 绝对不为空，并深度萃取组员真实发言
      const meaningfulUtterances = validUserLogs
        .map(m => (m.text || '').replace(/<[^>]+>/g, '').trim())
        .filter(t => t.length > 1 && !t.includes('确认') && !t.includes('公约') && !t.includes('投票'));
      const userUtterances = meaningfulUtterances.slice(-8).join('；');
      const propDesc = propList.map(p => (p.description || '').replace(/<[^>]+>/g, '').trim()).filter(Boolean).join('；');
      const actualContext = [userUtterances, propDesc].filter(Boolean).join('；');

      if (!finalOverview || !finalOverview.trim() || finalOverview.length < 15) {
        if (actualContext) {
          finalOverview = isInst
            ? `本教学设计紧扣《${finalTopic}》展开，深度整合组内真实研讨要点（${actualContext.slice(0, 100)}）。立足真实学情创设情境，设计任务驱动与学生活动链，切实落实重难点突破与核心素养培育。`
            : `本研究围绕《${finalTopic}》展开，系统整合组内研讨思路（${actualContext.slice(0, 100)}）。明确核心问题与实证情境，采用定性与定量分析方法，深入探究关键影响机制与实施路径。`;
        } else {
          finalOverview = isInst 
            ? `本教学设计方案紧扣《${finalTopic}》展开，立足真实学情分析与新课标核心素养目标。全篇采用情境驱动与任务探究相结合的教学模式，设置由浅入深的学生活动链，并配以针对性过程性评价量规与分层作业，确保教学重难点有效突破。`
            : `本研究围绕《${finalTopic}》展开，立足具体实践情境与核心科学问题。研究设计采用实证方法，明确关键变量与操作化测量工具，通过系统的样本抽样与数据分析模型，深入探究关键影响机制与效应边界。`;
        }
      }

      // 🛡️ 移除正在提炼中的思考消息与残留网络提醒
      this.state.chatLogs.stage1 = (this.state.chatLogs.stage1 || []).filter(m => {
        if (!m) return false;
        if (m.id === inFlightTopicId || m.isThinking) return false;
        if (m.sender === 'auctioneer' && (m.text || '').includes('网络提醒') && (m.text || '').includes('主题与方案')) return false;
        return true;
      });

      s1.mergedTitle = finalTopic;
      if (!s1.contract) s1.contract = {};
      s1.contract.topic = finalTopic;
      s1.contract.overview = finalOverview;
      s1.researchOverview = finalOverview;
      s1.contractStep = 'time'; // 顺推至时间分配阶段

      guideSpeech = guideSpeech.replace(/^(?:🎪|🏛️)?\s*【(?:学术拍卖师|拍卖师|备课引导师|引导师)[·\s]*(?:方案确立|主题与方案确立|方案提炼)?】[：:]\s*/g, '');
      const noticeText = `🏛️ 【${agentRole}·主题与方案确立】：全组${isInst ? '教学论题' : '研究论题'}《${finalTopic}》与方案概述已成功提炼并录入公约看板！👉 接下来请全组在讨论区商讨 6 大${isInst ? '模块' : '章节'}的时间预算分配，商定完成后点击左侧【⏱️ 时间讨论差不多了？一键提炼【时间分配】】！`;

      const noticeMsg = {
        id: 'msg_topic_done_' + Date.now(),
        sender: 'auctioneer',
        senderName: agentSenderName,
        text: noticeText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        _timeMs: Date.now()
      };
      this.state.chatLogs.stage1.push(noticeMsg);
      if (typeof this.sendSingleChatMessage === 'function') {
        this.sendSingleChatMessage(noticeMsg, 'stage1');
      }

      this.syncStage1();
      this.syncChatLogs();
      if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
      this.renderStudentWorkspace();
      renderChat(this.state);
    } catch (e) {
      console.warn('Extract topic & overview error:', e);
      this.state.chatLogs.stage1 = (this.state.chatLogs.stage1 || []).filter(m => !m || (m.id !== inFlightTopicId && !m.isThinking));
      const errTopicMsg = {
        id: 'err_topic_' + Date.now(),
        sender: 'auctioneer',
        senderName: agentSenderName,
        text: `🏛️ 【${agentRole}·网络提醒】：📡 提炼《${isInst ? '教学' : '研究'}主题与方案》时网络连接稍有延迟，未能获取到即时草案。<br><button class="btn-retry-ai" onclick="window.app._doExtractTopic(this)" style="margin-top:6px; background:#2563eb; color:#fff; border:none; padding:4px 12px; border-radius:12px; font-size:12px; cursor:pointer; font-weight:700;">🔄 重新提炼【主题与方案】</button>`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        _timeMs: Date.now()
      };
      this.state.chatLogs.stage1.push(errTopicMsg);
      if (typeof this.sendSingleChatMessage === 'function') {
        this.sendSingleChatMessage(errTopicMsg, 'stage1');
      }
      this.syncChatLogs();
      if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
      this.renderStudentWorkspace();
      renderChat(this.state);
    }
  }

  /**
   * ⏱️ 阶段一公约第二步：一键提炼【时间分配】
   */
  async handleExtractTime() {
    this.handleStepConfirmation('s1_time', () => this._doExtractTime(), '时间分配');
  }

  async _doExtractTime(btnElement = null) {
    if (btnElement && typeof btnElement === 'object' && btnElement.tagName) {
      btnElement.disabled = true;
      btnElement.style.opacity = '0.6';
      btnElement.style.cursor = 'not-allowed';
      btnElement.innerHTML = `⏳ 正在重新提炼【时间分配】...`;
    }
    const s1 = this.state.stage1 || {};
    const taskType = this.getCurrentTaskType();
    const isInst = (taskType === 'instructional');
    const agentRole = isInst ? '备课引导师' : '学术拍卖师';
    const agentSenderName = isInst ? '头脑风暴 · 备课引导师' : '头脑风暴 · 学术拍卖师';

    // 🌟 在聊天区挂载正在提炼时间预算的思考动效（仅本地暂存，不写入数据库）
    const inFlightTimeId = 'thinking_extract_time_' + Date.now();
    const inFlightTimeMsg = {
      id: inFlightTimeId,
      isThinking: true,
      sender: 'auctioneer',
      senderName: agentSenderName,
      text: `⏳ 收到全组成员确认！${agentRole}正在根据讨论区研讨记录提炼【6大${isInst ? '模块' : '章节'}时间预算分配】，请稍候...`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      _timeMs: Date.now()
    };
    if (!this.state.chatLogs.stage1) this.state.chatLogs.stage1 = [];
    this.state.chatLogs.stage1.push(inFlightTimeMsg);
    if (typeof renderChat === 'function') renderChat(this.state);

    const s1ChatLogs = (this.state.chatLogs && this.state.chatLogs.stage1) ? this.state.chatLogs.stage1 : [];
    // 💡 局部精准切片：只截取主题确立后关于时间预算的研讨记录，严格控制 token 花销
    const topicNoticeIdx = s1ChatLogs.findIndex(m => m && m.text && (m.text.includes('主题与方案确立') || m.text.includes('主题确立') || m.text.includes('时间分配') || m.text.includes('时间规划')));
    const relevantLogs = (topicNoticeIdx >= 0) ? s1ChatLogs.slice(topicNoticeIdx) : s1ChatLogs.slice(-15);
    const userLogs = relevantLogs.filter(m => m && m.sender && !AgentProfiles[m.sender] && m.sender !== 'system' && !m.isThinking && !m.text.startsWith('[IMG_DATA]:'));
    const chatSnippet = userLogs.map(m => `${m.senderName || m.sender}: ${(m.text || '').replace(/<[^>]+>/g, ' ').trim()}`).filter(l => l.trim().length > 0).join('\n') || '组员正在商讨时间规划';

    const allTasks = (this.authManager) ? this.authManager.getTasks() : [];
    const curTask = allTasks.find(t => t.id === this.state.activeTaskId);
    const totalDurationMin = (curTask && curTask.durationMinutes) ? Number(curTask.durationMinutes) : 150;

    const timePrompt = `小组成员已就${isInst ? '教学设计方案 6 大模块' : '学术论文 6 大章节'}的时间预算规划在讨论区展开了非制式自由研讨。
【组内关于时间规划与各${isInst ? '模块' : '章节'}侧重的真实研讨记录（全量记录）】:
${chatSnippet}
【参考${isInst ? '备课设计' : '论文写作'}总时长】: ${totalDurationMin} 分钟

请通读上述真实讨论记录，作为资深${agentRole}：
1. 深度分析小组成员的研讨意向与侧重（组员发言较为自由口语化，请敏锐提炼）：
   - 若组员明确提到了某${isInst ? '模块' : '章节'}分配多少分钟，严格按照组员商定的时间分配；
   - 若组员提到各${isInst ? '模块' : '章节'}“平分”或“均分”，则将总时长平分给各${isInst ? '模块' : '章'}；
   - 若组员提到“重点在${isInst ? '新知探究与建构/情境创设' : '方法/重点在综述'}”，则显著增加对应${isInst ? '模块' : '章节'}的时间权重；
   - 若组员未明确提及某${isInst ? '模块' : '章节'}具体数值，依据${isInst ? '教学设计方案黄金比例（重点强化新知探究与建构）' : '学术论文标准黄金比例（重点强化研究设计与方法）'}智能补齐，使 6 大${isInst ? '模块' : '章节'}总和约为 ${totalDurationMin} 分钟；
2. 给出 1 句专业且亲切的点拨（结合组员的研讨侧重点），宣布时间分配已录入公约，并顺承引导全组在讨论区商定各自负责的${isInst ? '撰写模块' : '写作章节'}与任务分工！

输出格式必须为合法 JSON（严禁代码块以外的多余文字）：
{
  "background": 25,
  "literature": 30,
  "questions": 25,
  "method": 40,
  "reflection": 20,
  "references": 10,
  "guideText": "全篇 6 大${isInst ? '模块' : '章节'}时间预算已成功配置并录入公约看板！接下来请全组在讨论区商定各自负责认领的${isInst ? '撰写模块' : '写作章节'}与任务分工！商定完成后点击左侧【👥 一键提炼任务分工】！"
}`;

    try {
      const resp = await callCozeAgentAPI('auctioneer', timePrompt, { stage: 'stage1', topic: s1.mergedTitle || (isInst ? '教学设计' : '论文'), taskType });
      let timeAlloc = { background: 25, literature: 30, questions: 25, method: 40, reflection: 20, references: 10 };
      let guideSpeech = `全篇 6 大${isInst ? '模块' : '章节'}时间预算已成功配置并录入公约看板！👉 接下来请全组在讨论区商定各自负责认领的${isInst ? '撰写模块' : '写作章节'}与任务分工！商定完成后点击左侧【👥 研讨差不多了？一键提炼任务分工】！`;

      if (resp && resp.trim().length > 0) {
        try {
          const jsonMatch = resp.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = safeJsonParse(jsonMatch[0]);
            if (parsed && parsed.background !== undefined && !isNaN(Number(parsed.background))) timeAlloc.background = Math.max(5, Math.round(Number(parsed.background)));
            if (parsed && parsed.literature !== undefined && !isNaN(Number(parsed.literature))) timeAlloc.literature = Math.max(5, Math.round(Number(parsed.literature)));
            if (parsed && parsed.questions !== undefined && !isNaN(Number(parsed.questions))) timeAlloc.questions = Math.max(5, Math.round(Number(parsed.questions)));
            if (parsed && parsed.method !== undefined && !isNaN(Number(parsed.method))) timeAlloc.method = Math.max(5, Math.round(Number(parsed.method)));
            if (parsed && parsed.reflection !== undefined && !isNaN(Number(parsed.reflection))) timeAlloc.reflection = Math.max(5, Math.round(Number(parsed.reflection)));
            if (parsed && parsed.references !== undefined && !isNaN(Number(parsed.references))) timeAlloc.references = Math.max(5, Math.round(Number(parsed.references)));
            if (parsed && parsed.guideText && parsed.guideText.trim().length > 0) guideSpeech = parsed.guideText.trim();
          }
        } catch (e) {
          console.warn('Parse time allocation JSON fail, keep default', e);
        }
      } else {
        throw new Error('Empty time allocation response');
      }

      // 🛡️ 移除正在提炼中的思考消息与残留网络提醒
      this.state.chatLogs.stage1 = (this.state.chatLogs.stage1 || []).filter(m => {
        if (!m) return false;
        if (m.id === inFlightTimeId || m.isThinking) return false;
        if (m.sender === 'auctioneer' && (m.text || '').includes('网络提醒') && (m.text || '').includes('时间')) return false;
        return true;
      });

      if (!s1.contract) s1.contract = {};
      s1.contract.timeAllocations = timeAlloc;
      s1.contractStep = 'tasks'; // 推进至第三步：任务分工

      guideSpeech = guideSpeech.replace(/^(?:🎪|🏛️)?\s*【(?:学术拍卖师|拍卖师|备课引导师|引导师)[·\s]*(?:时间预算确立|时间分配)?】[：:]\s*/g, '');
      const noticeText = `🏛️ 【${agentRole}·时间预算确立】：6 大${isInst ? '模块' : '章节'}时间规划已提炼录入看板！👉 请全组成员在左侧仔细审查核对，如对时间规划有异议可直接在左侧输入框修改调整；接下来请在讨论区商讨组员具体分工认领，商定后点击左侧【👥 分工讨论差不多了？一键提炼【任务分工】】！`;

      const noticeMsg = {
        id: 'msg_time_done_' + Date.now(),
        sender: 'auctioneer',
        senderName: agentSenderName,
        text: noticeText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        _timeMs: Date.now()
      };
      this.state.chatLogs.stage1.push(noticeMsg);
      if (typeof this.sendSingleChatMessage === 'function') {
        this.sendSingleChatMessage(noticeMsg, 'stage1');
      }

      this.syncStage1();
      this.syncChatLogs();
      if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
      this.renderStudentWorkspace();
      renderChat(this.state);
    } catch (e) {
      console.warn('Extract time error:', e);
      this.state.chatLogs.stage1 = (this.state.chatLogs.stage1 || []).filter(m => !m || (m.id !== inFlightTimeId && !m.isThinking));
      const errTimeMsg = {
        id: 'err_time_' + Date.now(),
        sender: 'auctioneer',
        senderName: agentSenderName,
        text: `🏛️ 【${agentRole}·网络提醒】：📡 提炼《时间预算分配》时网络连接稍有延迟，未能获取到即时分配方案。<br><button class="btn-retry-ai" onclick="window.app._doExtractTime(this)" style="margin-top:6px; background:#2563eb; color:#fff; border:none; padding:4px 12px; border-radius:12px; font-size:12px; cursor:pointer; font-weight:700;">🔄 重新提炼【时间分配】</button>`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        _timeMs: Date.now()
      };
      this.state.chatLogs.stage1.push(errTimeMsg);
      if (typeof this.sendSingleChatMessage === 'function') {
        this.sendSingleChatMessage(errTimeMsg, 'stage1');
      }
      this.syncChatLogs();
      if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
      this.renderStudentWorkspace();
      renderChat(this.state);
    }
  }

  /**
   * 👥 阶段一公约第三步：一键提炼【任务分工】并生成完整草案
   */
  async handleExtractTasks() {
    this.handleStepConfirmation('s1_tasks', () => this._doExtractTasks(), '任务分工');
  }

  async _doExtractTasks(btnElement = null) {
    if (btnElement && typeof btnElement === 'object' && btnElement.tagName) {
      btnElement.disabled = true;
      btnElement.style.opacity = '0.6';
      btnElement.style.cursor = 'not-allowed';
      btnElement.innerHTML = `⏳ 正在重新提炼【任务分工】...`;
    }
    const s1 = this.state.stage1 || {};
    const taskType = this.getCurrentTaskType();
    const isInst = (taskType === 'instructional');
    const agentRole = isInst ? '备课引导师' : '学术拍卖师';
    const agentSenderName = isInst ? '头脑风暴 · 备课引导师' : '头脑风暴 · 学术拍卖师';
    const stage2Title = isInst ? '阶段二：集体备课室' : '阶段二：学术编辑部';
    const contractTitle = isInst ? '备课公约' : '学术公约';

    // 🌟 在聊天区挂载正在提炼任务分工的思考动效（仅本地暂存，不写入数据库）
    const inFlightTasksId = 'thinking_extract_tasks_' + Date.now();
    const inFlightTasksMsg = {
      id: inFlightTasksId,
      isThinking: true,
      sender: 'auctioneer',
      senderName: agentSenderName,
      text: `⏳ 收到全组成员确认！${agentRole}正在根据讨论区研讨记录提炼【小组成员任务分工】，请稍候...`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      _timeMs: Date.now()
    };
    if (!this.state.chatLogs.stage1) this.state.chatLogs.stage1 = [];
    this.state.chatLogs.stage1.push(inFlightTasksMsg);
    if (typeof renderChat === 'function') renderChat(this.state);

    let members = [];
    if (Array.isArray(this.state.members)) members = this.state.members;
    else if (this.state.members && typeof this.state.members === 'object') members = Object.values(this.state.members);

    const s1ChatLogs = (this.state.chatLogs && this.state.chatLogs.stage1) ? this.state.chatLogs.stage1 : [];
    // 💡 局部精准切片：只截取时间预算确立后关于任务分工认领的研讨记录，严格控制 token 花销
    const timeNoticeIdx = s1ChatLogs.findIndex(m => m && m.text && (m.text.includes('时间预算确立') || m.text.includes('时间分配') || m.text.includes('分工')));
    const relevantLogs = (timeNoticeIdx >= 0) ? s1ChatLogs.slice(timeNoticeIdx) : s1ChatLogs.slice(-15);
    const userLogs = relevantLogs.filter(m => m && m.sender && !AgentProfiles[m.sender] && m.sender !== 'system' && !m.isThinking && !m.text.startsWith('[IMG_DATA]:'));
    const chatSnippet = userLogs.map(m => `${m.senderName || m.sender}: ${(m.text || '').replace(/<[^>]+>/g, ' ').trim()}`).filter(l => l.trim().length > 0).join('\n') || '组员正在商定分工';

    const membersInfo = members.map(m => `- ${m.name || m.id}`).join('\n');

    const taskPrompt = `小组成员已在讨论区就 6 大${isInst ? '模块' : '章节'}的分工认领展开了非制式自由研讨。
【小组成员名单】:
${membersInfo}
【组内关于任务分工的真实研讨记录（全量记录，发言自由口语化）】:
${chatSnippet}

请通读上述真实讨论记录，作为资深${agentRole}：
1. 敏锐提炼出每位组员在聊天中实际认领或倾向负责的${isInst ? '撰写模块' : '写作章节'}与任务描述（如“${isInst ? '负责新知探究与建构、教材学情分析' : '负责研究设计与方法、文献综述'}”）；若组员未明确认领，请根据组员特点合理均衡分配；
2. 给出 1 句恭喜小结，宣布公约草案已全部生成就绪，提醒全组在下方点击【✍️ 签署确认${contractTitle}】！
输出格式必须为合法 JSON（严禁多余废话）：
{
  "assignments": {
    "组员姓名1": "负责模块描述",
    "组员姓名2": "负责模块描述"
  },
  "guideText": "太棒了！全组成员分工已全部生成就绪！请全员核对左侧公约并在下方点击【✍️ 签署确认${contractTitle}】！全员签署后将正式解锁【${stage2Title}】！"
}`;

    try {
      const resp = await callCozeAgentAPI('auctioneer', taskPrompt, { stage: 'stage1', topic: s1.mergedTitle || (isInst ? '教学设计' : '论文'), taskType });
      let taskAssignments = {};
      let guideSpeech = `📜 【${agentRole}·公约生成完毕】：🎉 太棒了！全组成员分工与公约内容已全部生成就绪！👉 请全组成员核对左侧公约内容，并在下方点击【✍️ 签署确认${contractTitle}】！全员签署后将正式解锁【${stage2Title}】！`;

      const defaultTasks = isInst ? [
        '负责“一、教材与学情分析”及“二、教学目标与重难点”起草',
        '负责“三、情境创设与导入”及“四、新知探究与建构”方案设计',
        '负责“五、巩固练习与评价”撰写及“六、板书设计与反思”梳理',
        '负责教学多媒体课件与实验/活动道具设计'
      ] : [
        '负责“一、研究背景与意义”及“二、文献综述”起草',
        '负责“三、研究问题与假设”及“四、研究设计与方法”方案制定',
        '负责“五、不足与反思”撰写及全篇“六、参考文献”引文校对',
        '负责数据分析模型构建与研究工具问卷设计'
      ];

      members.forEach((m, idx) => {
        const mKey = m.id || m.name;
        taskAssignments[mKey] = defaultTasks[idx % defaultTasks.length];
      });

      if (resp && resp.trim().length > 0) {
        try {
          const jsonMatch = resp.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = safeJsonParse(jsonMatch[0]);
            if (parsed && parsed.assignments && typeof parsed.assignments === 'object') {
              members.forEach((m, idx) => {
                const mKey = m.id || m.name;
                const matchedVal = parsed.assignments[m.name] || parsed.assignments[m.id];
                if (matchedVal) taskAssignments[mKey] = matchedVal;
              });
            }
            if (parsed && parsed.guideText) guideSpeech = parsed.guideText;
          }
        } catch (e) {}
      } else {
        throw new Error('Empty task assignment response');
      }

      // 🛡️ 移除正在提炼中的思考消息与残留网络提醒
      this.state.chatLogs.stage1 = (this.state.chatLogs.stage1 || []).filter(m => {
        if (!m) return false;
        if (m.id === inFlightTasksId || m.isThinking) return false;
        if (m.sender === 'auctioneer' && (m.text || '').includes('网络提醒') && (m.text || '').includes('分工')) return false;
        return true;
      });

      if (!s1.contract) s1.contract = {};
      s1.contract.taskAssignments = taskAssignments;
      s1.contract.isDraftGenerated = true;
      s1.contract._draftedTime = Date.now();
      s1.contractStep = 'completed'; // 提炼全部完成

      guideSpeech = guideSpeech.replace(/^(?:📜|🎪|🏛️)?\s*【(?:学术拍卖师|拍卖师|备课引导师|引导师)[·\s]*(?:公约生成完毕|任务分工|草案就绪)?】[：:]\s*/g, '');
      const noticeText = `🏛️ 【${agentRole}·公约草案就绪】：全组成员分工已成功配置，公约草案已全部生成就绪！👉 请全组成员在左侧公约看板仔细审查核对，如对论题、方案、时间或分工有异议，可直接在左侧看板修改调整或在讨论区商议；确认无误后请在公约下方点击【✍️ 签署确认${contractTitle}】！全员签署后将正式解锁【${stage2Title}】！`;

      const noticeMsg = {
        id: 'msg_tasks_done_' + Date.now(),
        sender: 'auctioneer',
        senderName: agentSenderName,
        text: noticeText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        _timeMs: Date.now()
      };
      this.state.chatLogs.stage1.push(noticeMsg);
      if (typeof this.sendSingleChatMessage === 'function') {
        this.sendSingleChatMessage(noticeMsg, 'stage1');
      }

      this.syncStage1();
      this.syncChatLogs();
      if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
      this.renderStudentWorkspace();
      renderChat(this.state);
    } catch (e) {
      console.warn('Extract tasks error:', e);
      this.state.chatLogs.stage1 = (this.state.chatLogs.stage1 || []).filter(m => !m || (m.id !== inFlightTasksId && !m.isThinking));
      const errTasksMsg = {
        id: 'err_tasks_' + Date.now(),
        sender: 'auctioneer',
        senderName: agentSenderName,
        text: `🏛️ 【${agentRole}·网络提醒】：📡 提炼《全员任务分工》时网络连接稍有延迟，未能获取到即时分工配置。<br><button class="btn-retry-ai" onclick="window.app._doExtractTasks(this)" style="margin-top:6px; background:#2563eb; color:#fff; border:none; padding:4px 12px; border-radius:12px; font-size:12px; cursor:pointer; font-weight:700;">🔄 重新提炼【任务分工】</button>`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        _timeMs: Date.now()
      };
      this.state.chatLogs.stage1.push(errTasksMsg);
      if (typeof this.sendSingleChatMessage === 'function') {
        this.sendSingleChatMessage(errTasksMsg, 'stage1');
      }
      this.syncChatLogs();
      if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
      this.renderStudentWorkspace();
      renderChat(this.state);
    }
  }

  /**
   * 📜 阶段一公约终极一键补齐/生成：需全员确认同意后触发通读研讨并提炼
   */
  async handleOneClickGenerateContract() {
    this.handleStepConfirmation('s1_full_contract', () => this._doOneClickGenerateContract(), '提炼生成公约草案');
  }

  async _doOneClickGenerateContract(btnElement = null) {
    if (btnElement && typeof btnElement === 'object' && btnElement.tagName) {
      btnElement.disabled = true;
      btnElement.style.opacity = '0.6';
      btnElement.style.cursor = 'not-allowed';
      btnElement.innerHTML = `⏳ 正在重新生成【全套公约草案】...`;
    }
    const s1 = this.state.stage1 || {};
    if (s1.contractStep === 'completed' || s1.contract?.isDraftGenerated) {
      if (typeof showGlobalBannerNotice === 'function') {
        showGlobalBannerNotice('📜 公约草案已生成', '公约草案已全部就绪，请直接在左侧公约下方核对并签署！');
      }
      return;
    }

    if (typeof showGlobalBannerNotice === 'function') {
      showGlobalBannerNotice('⏳ 正在一键智能生成全套公约草案...', '拍卖师正在分析全组投票后的全部讨论，一一对应提炼课题方案、时间规划与成员分工...', 'info', 4000);
    }

    let members = [];
    if (Array.isArray(this.state.members)) members = this.state.members;
    else if (this.state.members && typeof this.state.members === 'object') members = Object.values(this.state.members);
    const membersList = members.filter(Boolean);

    // 1. 💡 局部精准切片：只截取投票结果出炉之后的研讨记录，严格控制 token 花销
    const s1ChatLogs = (this.state.chatLogs && this.state.chatLogs.stage1) ? this.state.chatLogs.stage1 : [];
    const voteNoticeIdx = s1ChatLogs.findIndex(m => m && m.text && (m.text.includes('投票结果出炉') || m.text.includes('全票推选') || m.text.includes('投票已完成') || m.text.includes('投票完成')));
    const relevantLogs = (voteNoticeIdx >= 0) ? s1ChatLogs.slice(voteNoticeIdx) : s1ChatLogs.slice(-20);
    const allUserLogs = relevantLogs.filter(m => m && m.sender && !AgentProfiles[m.sender] && m.sender !== 'system' && !m.isThinking && !m.text.startsWith('[IMG_DATA]:'));
    const chatSnippet = allUserLogs.map(m => `${m.senderName || m.sender}: ${(m.text || '').replace(/<[^>]+>/g, ' ').trim()}`).filter(l => l.trim().length > 0).join('\n');

    // 抓取小组成员提交的提案详情（包含标题与方案说明）
    const propDetails = (s1.proposals || []).map((p, idx) => {
      const authorStr = p.authorName ? `(提交人: ${p.authorName})` : '';
      const descStr = p.description ? `\n   - 构想说明: ${p.description.replace(/<[^>]+>/g, ' ').trim()}` : '';
      return `【提案${idx + 1}】《${p.title}》${authorStr}${descStr}`;
    }).join('\n');

    // 2. 确定候选题目与任务信息
    const allTasks = (this.authManager) ? this.authManager.getTasks() : [];
    const curTask = allTasks.find(t => t.id === this.state.activeTaskId);
    const defaultTopic = s1.mergedTitle || s1.contract?.topic || (s1.proposals && s1.proposals[0] ? s1.proposals[0].title : (curTask?.title || '基于深度协作的学术探究与实践'));
    const membersInfo = membersList.map(m => `- 姓名: ${m.name || '组员'} (学号: ${m.id || '无'})`).join('\n');

    const taskType = this.getCurrentTaskType();
    const isInst = (taskType === 'instructional');
    const agentRole = isInst ? '备课引导师' : '学术拍卖师';
    const agentSenderName = isInst ? '头脑风暴 · 备课引导师' : '头脑风暴 · 学术拍卖师';
    const stage2Title = isInst ? '阶段二：集体备课室' : '阶段二：学术编辑部';
    const contractTitle = isInst ? '备课公约' : '学术公约';

    const defaultTasks = isInst ? [
      '负责“一、教材与学情分析”及“二、教学目标与重难点”起草',
      '负责“三、情境创设与导入”及“四、新知探究与建构”方案设计',
      '负责“五、巩固练习与评价”撰写及“六、板书设计与反思”梳理',
      '负责教学多媒体课件与实验/活动道具设计'
    ] : [
      '负责“一、研究背景与意义”及“二、文献综述”起草',
      '负责“三、研究问题与假设”及“四、研究设计与方法”方案制定',
      '负责“五、不足与反思”撰写及全篇“六、参考文献”引文校对',
      '负责数据分析模型构建与研究工具问卷设计'
    ];
    const defaultTimes = s1.contract?.timeAllocations && Object.keys(s1.contract.timeAllocations).length >= 6
      ? s1.contract.timeAllocations
      : (isInst ? { background: 15, literature: 20, questions: 15, method: 35, reflection: 15, references: 10 } : { background: 25, literature: 30, questions: 25, method: 40, reflection: 20, references: 10 });

    const fallbackAssignments = {};
    membersList.forEach((m, idx) => {
      const mKey = m.id || m.name;
      fallbackAssignments[mKey] = defaultTasks[idx % defaultTasks.length];
    });

    let finalTopic = defaultTopic;
    let finalOverview = '';
    let finalTimes = Object.assign({}, defaultTimes);
    let finalAssignments = Object.assign({}, fallbackAssignments);
    let isSuccess = false;

    // 🛡️ 增量保护：检查左侧已有的分步成果，已完成的绝对保留，绝不覆盖！
    const hasExistingTopic = (s1.contractStep === 'time' || s1.contractStep === 'tasks' || s1.contractStep === 'completed') && (s1.contract?.topic || s1.mergedTitle);
    const hasExistingTime = (s1.contractStep === 'tasks' || s1.contractStep === 'completed') && s1.contract?.timeAllocations && Object.keys(s1.contract.timeAllocations).length >= 6;

    let existingContextSection = '';
    let instructionSection = '';

    if (hasExistingTopic && hasExistingTime) {
      existingContextSection = `
【已确认锁定的研究课题（严格沿用，绝不修改）】: 《${s1.contract?.topic || s1.mergedTitle}》
【已确认锁定的方案概述（严格沿用，绝不修改）】: ${s1.contract?.overview || s1.researchOverview || ''}
【已确认锁定的时间预算（严格沿用，绝不修改）】: 背景:${s1.contract.timeAllocations.background}分, 综述:${s1.contract.timeAllocations.literature}分, 问题:${s1.contract.timeAllocations.questions}分, 方法:${s1.contract.timeAllocations.method}分, 反思:${s1.contract.timeAllocations.reflection}分, 参考文献:${s1.contract.timeAllocations.references}分`;
      instructionSection = `
【当前增量提炼任务】：
由于课题方案与时间分配已由小组在左侧看板确认锁定，本次你只需重点提炼补齐尚未完成的【组员任务分工】！
1. 严格沿用上述已确定的题目与时间预算；
2. 通读研讨记录，将全篇写作章节一一对应合理分配给每位组员 (assignments: 以每位组员的真实姓名或学号为键，给出具体负责的章节与职责描述)；
3. 给出 1 句恭喜小结提示，提醒全员核对并在下方签署公约 (guideText)。`;
    } else if (hasExistingTopic) {
      existingContextSection = `
【已确认锁定的研究课题（严格沿用，绝不修改）】: 《${s1.contract?.topic || s1.mergedTitle}》
【已确认锁定的方案概述（严格沿用，绝不修改）】: ${s1.contract?.overview || s1.researchOverview || ''}`;
      instructionSection = `
【当前增量提炼任务】：
课题方案已由小组在左侧看板确认锁定（严格沿用，绝不修改），本次你只需重点提炼补齐【时间分配】与【组员任务分工】！
1. 严格沿用上述已确定的题目与方案概述；
2. 给出 6 大章节的合理时间分配分钟数 (timeAllocations: background, literature, questions, method, reflection, references，总计约 ${isInst ? 110 : 150} 分钟)；
3. 将全篇写作章节一一对应合理分配给每位组员 (assignments)；
4. 给出 1 句简短小结提示，提醒全员核对并签署公约 (guideText)。`;
    } else {
      existingContextSection = `
【确定课题/候选方向】: 《${defaultTopic}》`;
      instructionSection = `
【当前全量提炼任务】：
1. 深度通读研讨记录与提案，提炼精炼的课题名称 (topic) 与 120~200 字高度忠实反映组员研讨要点的方案概述 (overview，涵盖背景、核心问题、情境载体与具体方法设计)；
2. 给出 6 大章节的合理时间分配分钟数 (timeAllocations: background, literature, questions, method, reflection, references，总计约 ${isInst ? 110 : 150} 分钟)；
3. 将全篇写作章节一一对应合理分配给每位组员 (assignments: 以每位组员的真实姓名或学号为键，给出具体负责的章节与职责描述)；
4. 给出 1 句简短小结提示，提醒全组在左侧公约卡片下方核对并签署确认 (guideText)。`;
    }

    const fullContractPrompt = `小组成员已完成了选题投票，并在讨论区就公约内容展开了非制式自由研讨。
${existingContextSection}
【小组成员名单】:
${membersInfo}
【小组成员在研讨区的全部真实发言记录（核心事实依据，发言自由口语化）】:
${chatSnippet || '（小组成员正在讨论区商讨课题构想、时间与分工）'}
【小组成员提交的提案参考】:
${propDetails || '（组员未单独提交文本提案，主要通过上述聊天区直接研讨）'}

请作为资深${agentRole}：
${instructionSection}

输出格式必须为合法 JSON（严禁代码块以外的多余文字）：
{
  "topic": "${hasExistingTopic ? (s1.contract?.topic || s1.mergedTitle) : '最终确定的规范题目'}",
  "overview": "${hasExistingTopic ? (s1.contract?.overview || s1.researchOverview || '方案概述') : '提炼后的方案概述，务必涵盖组员研讨中提及的具体情境、核心问题与探究活动/方法'}",
  "timeAllocations": {
    "background": ${hasExistingTime ? s1.contract.timeAllocations.background : (isInst ? 15 : 25)},
    "literature": ${hasExistingTime ? s1.contract.timeAllocations.literature : (isInst ? 20 : 30)},
    "questions": ${hasExistingTime ? s1.contract.timeAllocations.questions : (isInst ? 15 : 25)},
    "method": ${hasExistingTime ? s1.contract.timeAllocations.method : (isInst ? 35 : 40)},
    "reflection": ${hasExistingTime ? s1.contract.timeAllocations.reflection : (isInst ? 15 : 20)},
    "references": ${hasExistingTime ? s1.contract.timeAllocations.references : 10}
  },
  "assignments": {
    "组员姓名1": "负责章节与职责描述",
    "组员姓名2": "负责章节与职责描述"
  },
  "guideText": "太棒了！公约草案已全部生成就绪！请全组成员核对左侧公约并在下方点击【✍️ 签署确认${contractTitle}】！"
}`;

    if (hasExistingTopic) {
      finalTopic = s1.contract?.topic || s1.mergedTitle;
      finalOverview = s1.contract?.overview || s1.researchOverview || finalOverview;
    }
    if (hasExistingTime) {
      finalTimes = s1.contract.timeAllocations;
    }

    this._isGeneratingContract = true;

    // 🤖 在聊天区广播正在提炼中的思考状态
    const inFlightContractId = 'inflight_contract_' + Date.now();
    const inFlightContractMsg = {
      id: inFlightContractId,
      sender: 'auctioneer',
      senderName: agentSenderName,
      text: `🏛️ 【${agentRole}·公约提炼中】：🤖 正在通读全组研讨并一键智能提炼全套《${contractTitle}》（课题方案、时间规划与成员任务分工）...`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      _timeMs: Date.now(),
      isThinking: true
    };
    if (!this.state.chatLogs.stage1) this.state.chatLogs.stage1 = [];
    this.state.chatLogs.stage1.push(inFlightContractMsg);
    if (typeof renderChat === 'function') renderChat(this.state);

    try {
      const resp = await callCozeAgentAPI('auctioneer', fullContractPrompt, { stage: 'stage1', topic: defaultTopic });
      if (resp && resp.trim().length > 0) {
        try {
          let cleanedResp = resp.replace(/```(?:json)?\s*/gi, '').replace(/```\s*$/gi, '').trim();
          const jsonMatch = cleanedResp.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            let jsonStr = jsonMatch[0];
            let parsed = safeJsonParse(jsonStr);
            if (!parsed) {
              try {
                const fixedJson = jsonStr.replace(/"((?:\\.|[^"\\])*)"/g, (match, p1) => {
                  return '"' + p1.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t') + '"';
                });
                parsed = safeJsonParse(fixedJson);
              } catch (fixErr) {}
            }
            if (parsed) {
              const matchedTopic = parsed.topic || parsed.title || parsed.theme || parsed.name;
              const matchedOverview = parsed.overview || parsed.summary || parsed.description || parsed.scheme || parsed.plan || parsed.researchOverview || parsed.instructionalOverview;
              if (!hasExistingTopic && matchedTopic && typeof matchedTopic === 'string' && matchedTopic.trim().length > 0) {
                finalTopic = matchedTopic.trim().replace(/^《|》$/g, '');
              }
              if (!hasExistingTopic && matchedOverview && typeof matchedOverview === 'string' && matchedOverview.trim().length > 0) {
                finalOverview = matchedOverview.trim();
              }
              if (!hasExistingTime && parsed.timeAllocations && typeof parsed.timeAllocations === 'object') {
                finalTimes = Object.assign({}, defaultTimes, parsed.timeAllocations);
              }
              if (parsed.assignments && typeof parsed.assignments === 'object') {
                membersList.forEach((m, idx) => {
                  const mKey = m.id || m.name;
                  const matchedVal = parsed.assignments[m.name] || parsed.assignments[m.id];
                  if (matchedVal) finalAssignments[mKey] = matchedVal;
                });
              }
              isSuccess = true;
            }
          }

          // 2. 若 JSON 方式未能提取出 overview，无论是否有 jsonMatch，均无缝进入多级正则容错与自然语言抽取
          if (!finalOverview || !finalOverview.trim()) {
            const tMatch = resp.match(/(?:【(?:教学)?(?:研究)?(?:课题|题目|主题|topic)】|(?:课题|题目|主题|topic)[：:\s]*)[《“"]?([^》”"\n\r]+)[》”"]?/i);
            if (tMatch && tMatch[1] && !hasExistingTopic && tMatch[1].trim().length > 3) {
              finalTopic = tMatch[1].replace(/["'《》]/g, '').trim();
            }
            const oMatch = resp.match(/(?:【(?:教学)?(?:研究)?方案概述】|【方案设计】|【总体构想】|(?:方案概述|教学方案|研究方案|总体构想|方案设计|overview)[：:\s]*)([\s\S]+?)(?=\n\s*【|\n\s*[234]\.|\n\s*guideText|\n\s*"|$)/i);
            if (oMatch && oMatch[1] && !hasExistingTopic && oMatch[1].trim().length > 10) {
              finalOverview = oMatch[1].replace(/^["'：:\s]+|["'，,。;\s]+$/g, '').trim();
              isSuccess = true;
            }
          }
        } catch (je) {
          console.warn('One-click generate parse fail, fallback', je);
        }
      }
    } catch (err) {
      console.warn('One-click generate contract AI call error:', err);
    } finally {
      this._isGeneratingContract = false;
      this.state.chatLogs.stage1 = (this.state.chatLogs.stage1 || []).filter(m => !m || (m.id !== inFlightContractId && !m.isThinking));
    }

    // 🛡️ 兜底确保 finalOverview 绝对不为空，并深度萃取组员真实发言
    const meaningfulUtterances = allUserLogs
      .map(m => (m.text || '').replace(/<[^>]+>/g, '').trim())
      .filter(t => t.length > 1 && !t.includes('确认') && !t.includes('公约') && !t.includes('投票'));
    const userUtterances = meaningfulUtterances.slice(-8).join('；');
    const propDesc = (s1.proposals || []).map(p => (p.description || '').replace(/<[^>]+>/g, '').trim()).filter(Boolean).join('；');
    const actualContext = [userUtterances, propDesc].filter(Boolean).join('；');

    if (!finalOverview || !finalOverview.trim() || finalOverview.length < 15) {
      if (actualContext) {
        finalOverview = isInst
          ? `本教学设计围绕《${finalTopic}》展开，深入融合组内研讨思路（${actualContext.slice(0, 90)}...）。立足学情创设真实情境，设计任务驱动与探究建构学生活动，落实教学重难点突破与核心素养培养。`
          : `本研究围绕《${finalTopic}》展开，系统整合组内研讨重点（${actualContext.slice(0, 90)}...）。明确核心科学问题与变量测量，采用定性与定量实证方法，深入探究关键影响机制与应对策略。`;
      } else {
        finalOverview = isInst 
          ? `本教学设计方案紧扣《${finalTopic}》展开，立足真实学情分析与新课标核心素养目标。全篇采用情境驱动与任务探究相结合的教学模式，设置由浅入深的学生活动链，并配以针对性过程性评价量规与分层作业，确保教学重难点有效突破。`
          : `本研究围绕《${finalTopic}》展开，立足具体实践情境与核心科学问题。研究设计采用实证方法，明确关键变量与操作化测量工具，通过系统的样本抽样与数据分析模型，深入探究关键影响机制与效应边界。`;
      }
    }

    if (!isSuccess) {
      this._contractGenerateFailed = true;
      const errFullMsg = {
        id: 'err_full_contract_' + Date.now(),
        sender: 'auctioneer',
        senderName: agentSenderName,
        text: `🏛️ 【${agentRole}·网络提醒】：📡 一键生成《全套公约草案》时网络连接稍有延迟，未能获取到完整草案。<br><button class="btn-retry-ai" onclick="window.app._doOneClickGenerateContract(this)" style="margin-top:6px; background:#2563eb; color:#fff; border:none; padding:4px 12px; border-radius:12px; font-size:12px; cursor:pointer; font-weight:700;">🔄 重新生成【全套公约草案】</button>`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        _timeMs: Date.now()
      };
      this.state.chatLogs.stage1.push(errFullMsg);
      if (typeof this.sendSingleChatMessage === 'function') {
        this.sendSingleChatMessage(errFullMsg, 'stage1');
      }
      this.syncChatLogs();
      if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
      if (typeof renderChat === 'function') renderChat(this.state);
      return;
    }

    // 🛡️ 清理历史残留的全套公约草案网络提醒
    this.state.chatLogs.stage1 = (this.state.chatLogs.stage1 || []).filter(m => !m || !(m.sender === 'auctioneer' && (m.text || '').includes('网络提醒') && (m.text || '').includes('全套公约草案')));

    this._contractGenerateFailed = false;

    // 写入状态并单向锁定公约草案
    if (!s1.contract) s1.contract = {};
    s1.mergedTitle = finalTopic;
    s1.contract.topic = finalTopic;
    s1.contract.overview = finalOverview;
    s1.researchOverview = finalOverview;
    s1.contract.timeAllocations = finalTimes;
    s1.contract.taskAssignments = finalAssignments;
    s1.contract.isDraftGenerated = true;
    s1.contract._draftedTime = Date.now();
    s1.contractStep = 'completed'; // 提炼全部完成，左侧3个分步按钮全部退场
    s1.flowStep = 'refining';

    const noticeText = `🏛️ 【${agentRole}·全盘公约就绪】：全篇${isInst ? '教学课题' : '研究主题'}《${finalTopic}》、方案概述、时间规划与组员分工已全部提炼生成并录入左侧公约看板！👉 请全组成员在左侧公约看板仔细审查核对，如对论题、方案、时间或分工有异议，可直接在左侧看板修改调整或在讨论区商议；确认无误后请在公约下方点击【✍️ 签署确认${contractTitle}】！全员签署后将正式解锁【${stage2Title}】！`;
    const noticeMsg = {
      id: 'msg_full_contract_done_' + Date.now(),
      sender: 'auctioneer',
      senderName: agentSenderName,
      text: noticeText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      _timeMs: Date.now()
    };
    s1ChatLogs.push(noticeMsg);
    if (typeof this.sendSingleChatMessage === 'function') {
      this.sendSingleChatMessage(noticeMsg, 'stage1');
    }

    this.syncStage1();
    this.syncChatLogs();
    if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
    this.renderStudentWorkspace();
    renderChat(this.state);

    if (typeof showGlobalBannerNotice === 'function') {
      showGlobalBannerNotice('🎉 公约草案已全部生成就绪！', '请各位组员在左侧公约看板核对分工与时间规划，并在下方签署确认！', 'success', 6000);
    }
  }

  /**
   * ✍️ 阶段一：小组成员点击签署确认学术合作公约
   */
  handleConfirmContract() {
    const user = this.state.currentUser;
    const s1 = this.state.stage1 || {};
    if (!s1.contract) s1.contract = {};
    if (!s1.contract.confirmedMembers) s1.contract.confirmedMembers = {};

    let memberArr = [];
    if (this.authManager) {
      const u = this.authManager.getCurrentUser();
      const effClassId = (this.authManager ? this.authManager.getEffectiveStudentClassId(u, this.state.activeTaskId) : (this.state.activeStudentClassId || u?.classId || null));
      const effGroup = this.authManager.getStudentActiveGroup(u, effClassId);
      const rawG = this.authManager.getGroupMembersForWorkspace(effGroup?.id || this.state.activeGroupId || null, effClassId);
      const authMembers = Array.isArray(rawG) ? rawG : Object.values(rawG || {});
      if (authMembers.length > 0) memberArr = authMembers;
    }
    if (memberArr.length === 0) {
      if (Array.isArray(this.state.members)) memberArr = this.state.members;
      else if (this.state.members && typeof this.state.members === 'object') memberArr = Object.values(this.state.members);
    }
    if (!Array.isArray(memberArr)) {
      memberArr = Object.values(memberArr || {});
    }
    const currMemObj = memberArr.find(m => m && (isSameUser(m, user) || m.id === user || m.name === user));
    const memberName = currMemObj ? currMemObj.name : user;
    const totalMembersCount = Math.max(memberArr.length, 2);

    const userAlreadySigned = !!(s1.contract.confirmedMembers[user] || (currMemObj && (s1.contract.confirmedMembers[currMemObj.id] || (currMemObj.name && s1.contract.confirmedMembers[currMemObj.name]))));

    if (userAlreadySigned && s1.contract.isConfirmed) {
      this.switchStage('stage2');
      return;
    }
    if (userAlreadySigned) {
      alert(`✅ 您 (${memberName}) 此前已完成签署确认！正在等待组内其他同学签署。`);
      return;
    }

    // 写入当前用户的签署记录（以 id 与 name 记录）
    s1.contract.confirmedMembers[user] = true;
    if (currMemObj) {
      if (currMemObj.id) s1.contract.confirmedMembers[currMemObj.id] = true;
      if (currMemObj.name) s1.contract.confirmedMembers[currMemObj.name] = true;
    }
    if (!s1.contract._firstSignTimeMs) s1.contract._firstSignTimeMs = Date.now();
    s1.contract._lastSignTimeMs = Date.now();

    // 🌐 原子同步给后端数据库
    const activeGroupObj = this.authManager ? this.authManager.getStudentActiveGroup(currMemObj, this.state.activeStudentClassId || currMemObj?.classId || null) : null;
    const curGid = activeGroupObj?.id || (currMemObj?.groupId || this.state.activeGroupId || null);
    fetch('sync.php?action=patch_contract_field', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taskId: this.state.activeTaskId || null,
        groupId: curGid,
        field: 'sign_member',
        subKey: currMemObj?.id || user,
        value: true
      })
    }).catch(() => {});

    const confirmedCount = memberArr.filter(m => m && (s1.contract.confirmedMembers[m.id] || (m.name && s1.contract.confirmedMembers[m.name]))).length;

    if (confirmedCount >= totalMembersCount) {
      s1.contract.isConfirmed = true;
      s1.contract._confirmedTime = Date.now();
      this.state.groupMaxStage = 'stage2';
      if (!this.state.stage2) this.state.stage2 = {};
      const nowS2Start = Date.now();
      this.state.stage2.startTime = nowS2Start;
      this.state.stage2.stageStartTime = nowS2Start;
      this.stage2StartTime = nowS2Start;
      this.syncStage2();
      const taskType = this.getCurrentTaskType();
      const isInst = (taskType === 'instructional');
      const agentRole = isInst ? '备课引导师' : '学术拍卖师';
      const agentSenderName = isInst ? '头脑风暴 · 备课引导师' : '头脑风暴 · 学术拍卖师';
      const stage2Title = isInst ? '阶段二：集体备课室' : '阶段二：学术编辑部';
      const contractTitle = isInst ? '备课合作公约' : '学术合作公约';

      const finalMsg = {
        id: 'msg_contract_signed_' + Date.now(),
        sender: 'auctioneer',
        senderName: agentSenderName,
        text: `🏛️ 【${agentRole}宣布】：🎉 恭喜！组内全员 ${totalMembersCount}/${totalMembersCount} 名成员已全部完成公约签署确认！${contractTitle}正式生效锁定，阶段一圆满结束！请同学们开启${stage2Title}开始正文协同${isInst ? '备课' : '撰写'}！`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        _timeMs: Date.now()
      };
      if (!this.state.chatLogs.stage1) this.state.chatLogs.stage1 = [];
      this.state.chatLogs.stage1.push(finalMsg);
      if (typeof this.sendSingleChatMessage === 'function') {
        this.sendSingleChatMessage(finalMsg, 'stage1');
      }
      this.syncStage1();
      this.syncChatLogs();
      this.syncStageChange('stage2');
      if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();

      const autoKey = `jizhi_autoadvanced_${this.state.activeTaskId}_stage2`;
      if (!sessionStorage.getItem(autoKey)) {
        sessionStorage.setItem(autoKey, '1');
        this.showStageMilestoneModal({
          icon: '🎉',
          title: `全组成员已全部签署《${contractTitle}》！`,
          subtitle: `组内全员 (${totalMembersCount}/${totalMembersCount} 人) 已全部完成公约签署确认！${contractTitle}正式生效锁定，阶段一圆满结束！`,
          targetName: stage2Title,
          onProceed: () => {
            this.switchStage('stage2', true);
          }
        });
      } else {
        this.switchStage('stage2', true);
      }
    } else {
      this.syncStage1();
      this.syncChatLogs();
      if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
      if (typeof showGlobalBannerNotice === 'function') {
        showGlobalBannerNotice(`✅ 签署成功！您 (${memberName}) 已完成公约确认`, `当前全组签署进度：${confirmedCount}/${totalMembersCount} 人已签署。需全员签署后开启阶段二。`);
      }
      this.renderStudentWorkspace();
    }
  }

  /**
   * 💡 阶段二半程会议第一步：责任编辑提炼分歧并引出审稿专家修正清单
   */
  async handleS2ManagingSummary() {
    const s2 = this.state.stage2 || {};
    if (!this.state.stage2) this.state.stage2 = s2;
    if (!s2.confirmations) s2.confirmations = {};
    if (!s2.confirmations.s2_managing) s2.confirmations.s2_managing = {};

    const currUser = this.authManager ? this.authManager.getCurrentUser() : null;
    const currUserCode = this.state.currentUser || currUser?.id || currUser?.name || 'A';
    
    // 1. 记录当前用户的确认
    s2.confirmations.s2_managing[currUserCode] = true;
    if (currUser?.id) s2.confirmations.s2_managing[currUser.id] = true;
    if (currUser?.name) s2.confirmations.s2_managing[currUser.name] = true;
    if (!s2._firstManagingSummaryTimeMs) s2._firstManagingSummaryTimeMs = Date.now();
    s2._lastManagingSummaryTimeMs = Date.now();

    // 计算总组员人数
    const effClassId = this.state.activeStudentClassId || currUser?.classId || null;
    const effGroup = this.authManager ? this.authManager.getStudentActiveGroup(currUser, effClassId) : null;
    const membersList = (effGroup && Array.isArray(effGroup.members) && effGroup.members.length > 0) 
      ? effGroup.members 
      : Object.values(this.state.members || {});
    const totalCount = membersList.length || 2;

    const isDoneHelper = (map) => {
      if (!map) return 0;
      return membersList.filter(m => {
        let fullUser = (typeof m === 'object') ? m : null;
        if (!fullUser && this.authManager && this.authManager.findUserByKey) {
          fullUser = this.authManager.findUserByKey(m);
        }
        const keys = [
          typeof m === 'string' ? m : null,
          m?.id, m?.name,
          fullUser?.id, fullUser?.name
        ].filter(Boolean).map(k => String(k).trim().toLowerCase());
        return keys.some(k => map[k] || map[String(k)]);
      }).length;
    };
    const confirmedCount = isDoneHelper(s2.confirmations.s2_managing);

    // 立即同步并更新聊天框底栏按钮展示
    this.syncStage2();
    if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
    renderChat(this.state);

    // 若尚未全员确认，提示等待其他组员
    if (confirmedCount < totalCount) {
      return;
    }

    // 2. 全员已确认：开始让责任编辑与审稿编辑提炼共识并下发《二审修正清单》
    if (this._isGeneratingManagingSummary) return;
    this._isGeneratingManagingSummary = true;

    const s2ChatLogs = (this.state.chatLogs && this.state.chatLogs.stage2) ? this.state.chatLogs.stage2 : [];
    const meetingNoticeIdx = s2ChatLogs.findIndex(m => m && m.text && (m.text.includes('半程会议') || m.text.includes('自查') || m.text.includes('修改思路')));
    const relevantLogs = (meetingNoticeIdx >= 0) ? s2ChatLogs.slice(meetingNoticeIdx) : s2ChatLogs;
    const userLogs = relevantLogs.filter(m => m && m.sender && !AgentProfiles[m.sender] && m.sender !== 'system' && !m.sender.includes('Editor'));
    const chatSnippet = userLogs.map(m => `${m.senderName || m.sender}: ${m.text}`).join('\n') || '组员正在围绕论文前后脱节与论证方法深化讨论修改思路';

    // 🌟 提取全组在【编辑会议自查打卡】中填写的真实瓶颈与聚焦痛点
    const subs = s2.meetingSubmissions || {};
    const subValues = Object.values(subs);
    const bottlenecks = [...new Set(subValues.map(v => v.bAcademic).filter(Boolean))].join('；') || '方法设计操作化不足与理论文献支撑单薄';
    const focusIssues = [...new Set(subValues.map(v => v.userText).filter(Boolean))].join('；') || '核心概念统领与章节逻辑过渡';
    const transIssues = [...new Set(subValues.flatMap(v => v.transSections || []).filter(Boolean))].join('、') || '第一至二章、第三至四章';
    const styleIssues = [...new Set(subValues.flatMap(v => v.styleSections || []).filter(Boolean))].join('、') || '文献综述与方法章节';

    const topic = (this.state.stage1 && this.state.stage1.mergedTitle) ? this.state.stage1.mergedTitle : '本组课题';
    const rawDoc = (s2.unifiedContent || '').replace(/<[^>]*>/g, '').trim();

    // 责任编辑发言提炼研讨共识并交棒（严禁套话，紧扣自查瓶颈、研讨与正文实质，凡学生自查痛点全部点出）
    const managingPrompt = `小组成员已在讨论区就论文《${topic}》的前序修改方向展开了半程研讨。
【组员自查打卡反映的全部瓶颈与脱节痛点】: ${bottlenecks}
【组员自查聚焦关注点】: ${focusIssues}
【组员指出的脱节章节】: ${transIssues}
【组内关于修改思路的讨论记录】:
${chatSnippet}
【正文草稿】:
${rawDoc || '（小组成员正在协作起草正文草稿）'}

请作为责任编辑，发表 120~160 字的【半程研讨共识小结与交棒】：
① 全面、客观梳理并点明小组成员在自查中汇报的各项脱节痛点（凡是学生汇报的痛点如：${focusIssues}，均须逐一说明，绝不遗漏隐瞒）；
② 提炼总结全组在讨论区商定达成的具体修改共识要点（严禁假大空套话，【绝对严禁出现“分工”字眼】）；
③ 隆重引出审稿专家通读全篇下发《二审修正清单》，指导全组对齐落实！
（纯自然语言输出，120~160字，严禁输出代码块）`;

    try {
      const taskType = this.getCurrentTaskType();
      const genreDesc = getGenrePromptDescriptor(taskType);

      // 🌟 1. 挂载责任编辑正在分析中动态状态框
      this.state.activeAgentAnalyzing = {
        icon: '🤝',
        title: '【责任编辑】正在提炼半程研讨共识...',
        detail: '正在深度整合全组自查痛点与研讨记录，提炼修改共识要点并交棒审稿专家...'
      };
      this.renderStudentWorkspace();
      renderChat(this.state);
      await new Promise(r => setTimeout(r, 1500));

      const isInst = (taskType === 'instructional');
      const managingName = isInst ? '备课组长' : '责任编辑';
      const reviewingName = isInst ? '教研专家' : '审稿编辑';

      const respManaging = await callCozeAgentAPI('managingEditor', managingPrompt, { stage: 'stage2', topic, chatSnippet, bottlenecks, focusIssues, taskType });
      let managingText = (respManaging && respManaging.trim().length > 0) 
        ? respManaging.trim() 
        : `🤝 【${managingName}·研讨共识小结】：结合大家在自查打卡与讨论区指出的【${focusIssues.slice(0, 40)}】等全部核心诉求，全组已在${isInst ? '教学目标聚焦与新知探究活动设计' : '研究问题聚焦与方法设计'}细化上形成了明确共识。👉 接下来正式有请 @${reviewingName} 结合全篇草稿为大家下发具体的《${isInst ? '磨课修正清单' : '二审修正清单'}》，指导全组深入修改与对齐落实！`;
      if (!managingText.startsWith('🤝')) managingText = `🤝 【${managingName}·研讨共识小结】：${managingText}`;

      const msgManaging = {
        sender: 'managingEditor',
        senderName: isInst ? '协同调度 · 备课组长' : '协同调度 · 责任编辑',
        text: managingText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        _timeMs: Date.now()
      };
      s2ChatLogs.push(msgManaging);
      this.syncChatLogs();
      renderChat(this.state);

      // 🌟 2. 切换为审稿编辑/教研专家二审质检正在分析中动态状态框
      this.state.activeAgentAnalyzing = {
        icon: '📝',
        title: `【${reviewingName}】正在下发《${isInst ? '磨课修正清单' : '二审修正清单'}》...`,
        detail: '正在深度审阅正文草稿并结合自查瓶颈，生成包含【诊断问题+改进建议】的双结构清单...'
      };
      this.renderStudentWorkspace();
      renderChat(this.state);
      await new Promise(r => setTimeout(r, 1500));

      // 审稿专家结合自查瓶颈、讨论与正文下发【诊断问题 + 改进建议】双结构《二审修正清单》
      const reviewingPrompt = `${genreDesc}

针对课题《${topic}》，结合小组成员自查瓶颈【${bottlenecks}】、聚焦关注点【${focusIssues}】及下方正文草稿，作为资深审稿编辑给出言简意赅、直击要害的《二审修正清单》（140~190字）：
【正文草稿参考】:
${rawDoc || '（小组成员已完成初版主体框架起草）'}
【小组成员商定的修改思路】:
${chatSnippet}

【二审核心考查维度（结合草稿实际情况灵活诊断，不机械限定条数，一个维度可包含多条）】：
- 核心概念统领 / 教学目标贯通与难点化解
- 主体研究方法 / 课堂学生活动操作化与探究深度
- 章节过渡衔接 / 教学环节逻辑贯通与时间把控
- 学术语体规范 / 随堂评价量规与论据支撑

【核心指令】：请根据草稿实际撰写情况，具体情况具体分析，直接以序号列出最突出的修正条目（不用过于冗长，精准点明【哪里有什么问题 ➔ 怎么改】，【绝对严禁出现“分工”字眼】）：
每项格式：
①【具体问题模块/章节】
- 诊断问题：明确指出具体章节/环节存在什么问题或脱节；
- 改进建议：明确指出具体怎么改或怎么补充。

末尾必须明确提示：“请大家围绕清单在讨论区协同商定修改对策与落实方案，商定差不多后点击下方【📝 讨论差不多了？让审稿编辑总结】！”（纯自然语言输出，140~190字）`;

      const respReviewing = await callCozeAgentAPI('reviewingEditor', reviewingPrompt, { stage: 'stage2', topic, actualDoc: rawDoc, bottlenecks, focusIssues, taskType });
      let reviewingText = '';
      if (respReviewing && respReviewing.trim().length > 0) {
        reviewingText = respReviewing.trim();
        if (!reviewingText.startsWith('📝')) reviewingText = `📝 【${reviewingName}·${isInst ? '磨课修正清单' : '二审修正清单'}】：${reviewingText.replace(/^[^\n]*?【[^】]+】[：:]?\s*/, '')}`;
        // 🛡️ 清理历史残留的网络提醒错误气泡
        this.state.chatLogs.stage2 = (this.state.chatLogs.stage2 || []).filter(m => !m || !(m.sender === 'reviewingEditor' && (m.text || '').includes('网络提醒')));
      } else {
        reviewingText = `📝 【${reviewingName}·网络提醒】：📡 正在深度审阅正文草稿，网络连接稍有延迟未获取到清单。<br><button class="btn-retry-ai" onclick="window.app.handleS2ManagingSummary(this)" style="margin-top:6px; background:#059669; color:#fff; border:none; padding:4px 12px; border-radius:12px; font-size:12px; cursor:pointer; font-weight:700;">🔄 重新下发《${isInst ? '磨课修正清单' : '二审修正清单'}》</button>`;
      }

      const msgReviewing = {
        sender: 'reviewingEditor',
        senderName: isInst ? '教学质量 · 教研专家' : '学术质量 · 审稿编辑',
        text: reviewingText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        _timeMs: Date.now() + 100
      };
      s2ChatLogs.push(msgReviewing);

      // 🌟 核心突破：根据责任编辑与审稿编辑的内容动态生成左侧【半程修正清单】
      // 规则：
      // - 若存在不一致/分歧：第 1 条为【内容与构思对齐】（来自责任编辑提炼），剩下第 2、3 条看审稿编辑的质检拆分；
      // - 若不存在不一致：全部 3 条直接来自审稿编辑二审修正清单的 3 条拆分。
      let reviewChunks = [];
      let bodyText = reviewingText;
      const headerMatch = bodyText.match(/(?:二审修正清单|半程编辑修正清单|半程修正清单)[】:：\s]*/);
      if (headerMatch) {
        bodyText = bodyText.slice(headerMatch.index + headerMatch[0].length);
      }
      bodyText = bodyText.replace(/[👉\s]*请大家围绕.*$/s, '')
                         .replace(/[👉\s]*请全组围绕.*$/s, '')
                         .replace(/[👉\s]*讨论差不多.*$/s, '')
                         .replace(/[👉\s]*点击下方.*$/s, '')
                         .replace(/^本次修改需对齐三项要求[：:]*/s, '')
                         .trim();

      const chunks = bodyText.split(/(?=[①②③]|\b[123]\.|(?=[一二三]是)|(?=【核心概念对齐】|【研究方法深化】|【行文衔接规范】|【学术规范】))/g).map(c => c.trim()).filter(Boolean);
      chunks.forEach(c => {
        let clean = c.replace(/^[①②③\d\.\s\(\)一二三是：:]+/, '').replace(/[；;。]\s*$/, '').trim();
        if (clean.length > 5 && !clean.includes('请全组协同') && !clean.includes('冲刺终审定稿')) {
          reviewChunks.push(clean);
        }
      });

      // 判断是否存在自查不一致
      const subs = s2.meetingSubmissions || {};
      const allSubs = Object.values(subs);
      const hasIdeationDev = allSubs.some(s => (s.ideationConsistency || '').includes('偏离'));
      const hasTransDev = allSubs.some(s => (s.transitionState || '').includes('脱节'));
      const hasStyleDev = allSubs.some(s => (s.styleState || '').includes('割裂') || (s.styleState || '').includes('混乱') || (s.styleState || '').includes('口语'));
      const hasDivergence = hasIdeationDev || hasTransDev || hasStyleDev || !!s2.hasMeetingDivergence;

      let finalActionItems = [];
      if (hasDivergence) {
        // 🌟 存在不一致：第 1 条为责任编辑梳理的内容/构思对齐
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

        // 剩下两条看审稿编辑
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
        // 🌟 不存在不一致：全部 3 条看审稿编辑
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

      s2.actionPlan = {
        isGenerated: true,
        completedMap: (s2.actionPlan && s2.actionPlan.completedMap) || {},
        items: finalActionItems.slice(0, 3)
      };

      s2.meetingStep = 'discussing_checklist'; // 变形为第二态按钮
      s2.meetingChecklistTime = Date.now();

      this.syncStage2();
      this.syncChatLogs();
      if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
    } catch (e) {
      console.warn('handleS2ManagingSummary error:', e);
    } finally {
      this.state.activeAgentAnalyzing = null; // 🌟 研判完毕，清除动态分析框
      this._isGeneratingManagingSummary = false;
      renderChat(this.state);
      this.renderStudentWorkspace(); // 🌟 立即解锁并展开左侧正文上方的【半程修正清单】卡片！
    }
  }

  /**
   * 📝 阶段二半程会议第二步：审稿专家提炼终版要点并指导回到正文继续撰写
   */
  async handleS2ReviewingSummary() {
    const s2 = this.state.stage2 || {};
    if (!this.state.stage2) this.state.stage2 = s2;
    if (!s2.confirmations) s2.confirmations = {};
    if (!s2.confirmations.s2_reviewing) s2.confirmations.s2_reviewing = {};

    const currUser = this.authManager ? this.authManager.getCurrentUser() : null;
    const currUserCode = this.state.currentUser || currUser?.id || currUser?.name || 'A';
    
    // 1. 记录当前用户的确认
    s2.confirmations.s2_reviewing[currUserCode] = true;
    if (currUser?.id) s2.confirmations.s2_reviewing[currUser.id] = true;
    if (currUser?.name) s2.confirmations.s2_reviewing[currUser.name] = true;
    if (!s2._firstReviewingSummaryTimeMs) s2._firstReviewingSummaryTimeMs = Date.now();
    s2._lastReviewingSummaryTimeMs = Date.now();

    // 计算总组员人数
    const effClassId = this.state.activeStudentClassId || currUser?.classId || null;
    const effGroup = this.authManager ? this.authManager.getStudentActiveGroup(currUser, effClassId) : null;
    const membersList = (effGroup && Array.isArray(effGroup.members) && effGroup.members.length > 0) 
      ? effGroup.members 
      : Object.values(this.state.members || {});
    const totalCount = membersList.length || 2;

    const isDoneHelper = (map) => {
      if (!map) return 0;
      return membersList.filter(m => {
        let fullUser = (typeof m === 'object') ? m : null;
        if (!fullUser && this.authManager && this.authManager.findUserByKey) {
          fullUser = this.authManager.findUserByKey(m);
        }
        const keys = [
          typeof m === 'string' ? m : null,
          m?.id, m?.name,
          fullUser?.id, fullUser?.name
        ].filter(Boolean).map(k => String(k).trim().toLowerCase());
        return keys.some(k => map[k] || map[String(k)]);
      }).length;
    };

    const confirmedCount = isDoneHelper(s2.confirmations.s2_reviewing);

    // 立即同步并更新聊天框底栏按钮展示
    this.syncStage2();
    if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
    renderChat(this.state);

    // 若尚未全员确认，提示等待其他组员
    if (confirmedCount < totalCount) {
      return;
    }

    // 2. 全员已确认：开始让审稿编辑提炼终版要点并指导回到正文冲刺
    const s2ChatLogs = (this.state.chatLogs && this.state.chatLogs.stage2) ? this.state.chatLogs.stage2 : [];
    const checklistIdx = s2ChatLogs.findIndex(m => m && m.text && m.text.includes('二审修正清单'));
    const relevantLogs = (checklistIdx >= 0) ? s2ChatLogs.slice(checklistIdx) : s2ChatLogs;
    const userLogs = relevantLogs.filter(m => m && m.sender && !AgentProfiles[m.sender] && m.sender !== 'system');
    const chatSnippet = userLogs.map(m => `${m.senderName || m.sender}: ${m.text}`).join('\n') || '组员已商定修改落实对策';

    const topic = (this.state.stage1 && this.state.stage1.mergedTitle) ? this.state.stage1.mergedTitle : '本组课题';

    const taskType = this.getCurrentTaskType();
    const isInst = (taskType === 'instructional');
    const reviewingName = isInst ? '教研专家' : '审稿编辑';

    const summaryPrompt = `小组成员已就《${isInst ? '磨课修正清单' : '二审修正清单'}》在讨论区明确了具体的修改对策与协同落实方案。
【组内关于清单落实的讨论记录】:
${chatSnippet}

请作为${reviewingName}，发表 90~120 字的【修改落实确认与定稿冲刺寄语】：
① 肯定大家清晰务实的修改对策与严谨备课/协作态度（严禁出现“分工”字眼）；
② 鼓励全组回到左侧正文继续高效协同与修改，冲刺最终高质量${isInst ? '教学设计方案' : '学术成文'}！（纯自然语言，90~120字，严禁输出代码块）`;

    try {
      // 🌟 挂载审稿编辑/教研专家三审正在分析中动态状态框
      this.state.activeAgentAnalyzing = {
        icon: '📝',
        title: `【${reviewingName}】正在审查清单落实与定稿冲刺...`,
        detail: '正在评估全组修改对策与落实方案，起草成稿与答辩冲刺寄语...'
      };
      this.renderStudentWorkspace();
      renderChat(this.state);
      await new Promise(r => setTimeout(r, 1500));

      const respSummary = await callCozeAgentAPI('reviewingEditor', summaryPrompt, { stage: 'stage2', topic, taskType });
      let summaryText = '';
      if (respSummary && respSummary.trim().length > 0) {
        summaryText = respSummary.trim();
        if (!summaryText.startsWith('📝')) summaryText = `📝 【${reviewingName}·修改确认与${isInst ? '备课' : '写作'}冲刺】：${summaryText.replace(/^[^\n]*?【[^】]+】[：:]?\s*/, '')}`;
        // 🛡️ 清理历史残留的网络提醒错误气泡
        this.state.chatLogs.stage2 = (this.state.chatLogs.stage2 || []).filter(m => !m || !(m.sender === 'reviewingEditor' && (m.text || '').includes('网络提醒')));
      } else {
        summaryText = `📝 【${reviewingName}·网络提醒】：📡 网络连接稍有延迟，未能获取到即时决议。<br><button class="btn-retry-ai" onclick="window.app.handleS2ReviewingSummary(this)" style="margin-top:6px; background:#059669; color:#fff; border:none; padding:4px 12px; border-radius:12px; font-size:12px; cursor:pointer; font-weight:700;">🔄 重新生成修改落实决议</button>`;
      }

      const msgSummary = {
        sender: 'reviewingEditor',
        senderName: isInst ? '教学质量 · 教研专家' : '学术质量 · 审稿编辑',
        text: summaryText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        _timeMs: Date.now()
      };
      if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
      this.state.chatLogs.stage2.push(msgSummary);
      this.sendSingleChatMessage(msgSummary, 'stage2');
      s2.meetingStep = 'completed'; // 完成半程会议，收起按钮
      s2.meetingCompletedTime = Date.now();
      s2.reviewMilestone = 'second_review_done';

      this.syncStage2();
      this.syncChatLogs();
      if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
    } catch (e) {
      console.warn('handleS2ReviewingSummary error:', e);
    } finally {
      this.state.activeAgentAnalyzing = null; // 🌟 研判完毕，清除动态分析框
      renderChat(this.state);
      this.renderStudentWorkspace();
    }
  }

  /**
   * 🎓 阶段三队列式逐条研讨：一键提炼当前质询答辩词，自动回填左侧矩阵，并顺推下一题/终审裁决
   */
  async handleS3InquirySummary(btnElement = null, targetInquiry = null) {
    if (btnElement && typeof btnElement === 'object' && btnElement.tagName) {
      btnElement.disabled = true;
      btnElement.style.opacity = '0.6';
      btnElement.style.cursor = 'not-allowed';
      btnElement.innerHTML = `⏳ 正在重新生成答辩定案...`;
    }
    const s3 = this.state.stage3 || {};
    const feedbacks = Array.isArray(s3.feedbackItems) ? s3.feedbackItems : [];
    const currentInquiry = (targetInquiry && targetInquiry.role) ? targetInquiry : feedbacks.find(f => f.role === 'opponent' && (!f.response || !f.response.trim()));
    if (!currentInquiry) return;

    const inqIndex = feedbacks.indexOf(currentInquiry);
    const inqLabel = inqIndex >= 1 ? `意见 ${inqIndex}` : '当前质询';

    const s3ChatLogs = (this.state.chatLogs && this.state.chatLogs.stage3) ? this.state.chatLogs.stage3 : [];
    const lastChairIdx = s3ChatLogs.map(m => m.sender).lastIndexOf('neutral');
    const msgsForInquiry = s3ChatLogs.slice(lastChairIdx + 1).filter(m => m.sender && !AgentProfiles[m.sender] && m.sender !== 'system');
    const chatSnippet = msgsForInquiry.map(m => `${m.senderName || m.sender}: ${m.text}`).join('\n') || '组员正在商讨辩护思路与修改对策';

    const remainingOppCount = feedbacks.filter(f => f.role === 'opponent' && f !== currentInquiry && (!f.response || !f.response.trim())).length;
    const nextInquiry = feedbacks.find(f => f.role === 'opponent' && f !== currentInquiry && (!f.response || !f.response.trim()));
    const nextIndex = nextInquiry ? feedbacks.indexOf(nextInquiry) : -1;
    const nextLabel = nextIndex >= 1 ? `意见 ${nextIndex}` : '下一项质询';

    const topic = (this.state.stage1 && this.state.stage1.mergedTitle) ? this.state.stage1.mergedTitle : '论文方案';

    const taskType = this.getCurrentTaskType();
    const isInst = (taskType === 'instructional');
    const docName = isInst ? '教学设计' : '论文';
    const chairSenderName = isInst ? '答辩委员会主席' : '答辩委员会主席 · 中间委员';
    const chairShort = isInst ? '答辩主席' : '中间委员';

    const evalInquiryPrompt = `小组成员已就核心课题《${topic}》针对【反方质询 ${inqLabel}】在研讨区展开了辩护与修改商议。
【反方原始质询】: ${currentInquiry.comment || currentInquiry.content}
【小组成员的真实辩护讨论记录】:
${chatSnippet}

请作为答辩委员会主席，发表【答辩审阅定案与顺推裁决】：
1. 【提炼答辩共识与修改承诺】：精准提炼全组成员达成的核心辩护陈述、${isInst ? '教学设计理念/学情考量' : '理论/实证论据'}与终稿具体修改对策（用于回填归档，120~180字）；
2. 【委员会定案与推进】：
   ${remainingOppCount > 0
     ? `① 宣布【${inqLabel}】辩护有效并予以采纳，答辩陈述已定案回填入库；\n② 【单题顺推】：顺承引导全组将焦点转向【${nextLabel}】展开深入研讨，并给出 1 条启发性思路点拨！`
     : `① 宣布全部质询辩护完毕且均获委员会全票认可，已全部定案；\n② 发表答辩终审裁决总结，祝贺团队圆满通过答辩，提醒全组点击左侧【修改${docName}终稿】面板，将答辩修改落实到正文中准备最终归档！`}
请按以下格式输出：
答辩陈述：[提取 80~100 字逻辑严密、论据充分的正式答辩词与终稿修改对策，用于回填左侧矩阵]
主席发言：[100~130 字自然语言点评与顺推裁决]`;

    // 🌟 挂载中间委员正在提炼共识思考气泡
    this.state.activeAgentAnalyzing = {
      icon: '🟡',
      title: `【中间委员】正在研读全组讨论并提炼【${inqLabel}】答辩共识...`,
      detail: '正在整合组员辩护要点，自动定案回填矩阵并推导下一阶段裁决...'
    };
    renderChat(this.state);
    this.renderStudentWorkspace();

    try {
      const resp = await callCozeAgentAPI('neutral', evalInquiryPrompt, { stage: 'stage3', topic });
      let extractedResponse = chatSnippet.slice(0, 150);
      let chairSpeech = (remainingOppCount > 0)
        ? `🟡 【${chairShort}·答辩定案与顺推】：【${inqLabel}】辩护方案已定案归档！👉 请全组将研讨焦点转向【${nextLabel}】，继续在讨论区商定对策！商定后点击上方【💡 ${nextLabel} 讨论差不多了？帮我总结并填入】！`
        : `🟡 【${chairShort}·答辩终审总结与裁决】：🎉 各位${isInst ? '备课教师' : '研究者'}，全部质询均已辩护定案并获委员会全票认可！答辩圆满顺利通过！👉 请全组成员点击左侧【修改${docName}终稿】面板，将答辩中的修改共识落实到${docName}终稿正文中，准备最终归档！`;

      if (resp && resp.trim().length > 0) {
        const lines = resp.trim().split('\n');
        const respLine = lines.find(l => l.includes('答辩陈述：') || l.includes('答辩陈述:'));
        const speechLine = lines.find(l => l.includes('主席发言：') || l.includes('主席发言:'));
        if (respLine) extractedResponse = respLine.replace(/^.*答辩陈述[：:]\s*/, '').trim() || extractedResponse;
        if (speechLine) chairSpeech = speechLine.replace(/^.*主席发言[：:]\s*/, '').trim() || chairSpeech;
        else if (!respLine && lines.length > 0) chairSpeech = resp.trim();

        // 自动回填至左侧当前卡片并标记定案
        currentInquiry.response = extractedResponse;
        currentInquiry.isFinalized = true;
        currentInquiry.status = 'finalized';

        // 🛡️ 清理历史残留的网络提醒错误气泡
        if (this.state.chatLogs.stage3) {
          this.state.chatLogs.stage3 = this.state.chatLogs.stage3.filter(m => !m || !(m.sender === 'neutral' && (m.text || '').includes('网络提醒')));
        }
      } else {
        chairSpeech = `🟡 【${chairShort}·网络提醒】：📡 答辩审阅网络连接稍有延迟，未能获取到针对【${inqLabel}】的定案。<br><button class="btn-retry-ai" onclick="window.app.handleS3InquirySummary(this)" style="margin-top:6px; background:#d97706; color:#fff; border:none; padding:4px 12px; border-radius:12px; font-size:12px; cursor:pointer; font-weight:700;">🔄 重新生成【${inqLabel}】答辩定案</button>`;
      }

      if (!chairSpeech.startsWith('🟡')) {
        chairSpeech = `🟡 【中间委员·答辩定案与顺推】：${chairSpeech}`;
      }

      const chairMsgObj = {
        sender: 'neutral',
        senderName: '答辩委员会主席 · 中间委员',
        text: chairSpeech,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        _timeMs: Date.now()
      };
      s3ChatLogs.push(chairMsgObj);

      this.syncStage3();
      this.syncChatLogs();
      if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
    } catch (e) {
      console.warn('handleS3InquirySummary error:', e);
      currentInquiry.response = msgsForInquiry.map(m => m.text).join('；').slice(0, 150) || '全组已达成辩护共识并落实修改。';
      currentInquiry.isFinalized = true;
      this.syncStage3();
    } finally {
      this.state.activeAgentAnalyzing = null;
      this.renderStudentWorkspace();
      renderChat(this.state);
    }
  }

  async handleAiGenerateContract() {
    await this.handleExtractTasks();
  }

  async triggerStageWelcomeSpeech(stage) {
    const currUser = this.authManager ? this.authManager.getCurrentUser() : null;
    const isTeacher = currUser && (currUser.role === 'teacher' || currUser.isTeacher);
    // 🛡️ 铁律：任务截止只读、教师端、后台监控、未进入学生工作区（studentViewMode !== 'workspace'）或非学生身份时绝不触发开场白！
    if (this.isCurrentTaskReadOnly() || isTeacher || this.state.isTeacherMonitorView || this.state.isTeacherView || this.state.studentViewMode !== 'workspace' || !currUser || currUser.role !== 'student') {
      return;
    }
    if (this.cloudSyncEngine && !this.cloudSyncEngine.isInitialPullDone) {
      return;
    }

    const effectiveClassId = (isTeacher ? this.state.activeClassId : this.state.activeStudentClassId) || currUser?.classId || null;
    const groupId = this.getEffectiveGroupId();
    let taskId = this.state.activeTaskId || (this.cloudSyncEngine ? this.cloudSyncEngine.taskId : null);
    if (!taskId) {
      if (isTeacher) taskId = `task_${effectiveClassId}_default`;
      else return; // 学生未选定真实任务时绝不触发开场白
    }

    const welcomeFlagKey = `jizhi_welcomed_${taskId}_${groupId}_${stage}`;
    if (stage !== 'stage3' && sessionStorage.getItem(welcomeFlagKey)) return;

    if (!this.state.chatLogs[stage]) this.state.chatLogs[stage] = [];
    const logs = this.state.chatLogs[stage];
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // 🎪 阶段一：引导师/拍卖师欢迎开场白
    if (stage === 'stage1') {
      const taskType = this.getCurrentTaskType();
      const isInst = (taskType === 'instructional');
      const agentRole = isInst ? '备课引导师' : '学术拍卖师';
      const stage1Title = isInst ? '阶段一：备课工作坊' : '阶段一：学术拍卖会';
      const contractTitle = isInst ? '备课公约' : '学术合作公约';

      const hasAuctioneerIntro = logs.some(m => m && (m.sender === 'auctioneer' || (m.id && String(m.id).includes('auctioneer'))) && (m.text?.includes('阶段一') || m.text?.includes('拍卖会') || m.text?.includes('备课工作坊') || m.text?.includes('拍卖师开场') || m.text?.includes('引导师开场')));
      if (!hasAuctioneerIntro) {
        sessionStorage.setItem(welcomeFlagKey, '1');
        const welcomeMsg = {
          id: `msg_welcome_${taskId}_${groupId}_stage1`,
          classId: effectiveClassId,
          groupId: groupId,
          taskId: taskId,
          stage: 'stage1',
          sender: 'auctioneer',
          senderName: agentRole,
          text: `🎪 【${isInst ? '引导师开场' : '拍卖师开场'}】：欢迎来到【${stage1Title}】！我是本阶段的${isInst ? '备课与教研顾问引导师' : '选题顾问拍卖师'}。\n请全组成员点击左侧【提交我的选题】提出各自的${isInst ? '教学设计与课题构想' : '研究构想'}，并在研讨区充分交流。我们将通过${isInst ? '研讨投票' : '拍卖投票'}遴选最佳提案，并在下方《${contractTitle}》中商定分工与时间分配！`,
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
      const taskType = this.getCurrentTaskType();
      const isInst = (taskType === 'instructional');
      const managingName = isInst ? '备课组长' : '责任编辑';
      const reviewingName = isInst ? '教研专家' : '审稿编辑';
      const stage2Title = isInst ? '阶段二：集体备课室' : '阶段二：学术编辑部';

      const hasManagingIntro = logs.some(m => m && m.sender === 'managingEditor' && (m.text?.includes('阶段二') || m.text?.includes('开场欢迎') || m.text?.includes('开场')));
      const hasReviewingIntro = logs.some(m => m && m.sender === 'reviewingEditor' && (m.text?.includes('开场寄语') || m.text?.includes('开场')));

      const curClassId = this.state.activeClassId || this.state.activeStudentClassId || null;
      const availablePapers = (this.authManager) ? this.authManager.getReferencePapers(groupId, curClassId, taskId) : [];
      const hasPapers = (availablePapers && availablePapers.length > 0);

      if (!hasManagingIntro) {
        sessionStorage.setItem(welcomeFlagKey, '1');
        const s1 = this.state.stage1 || {};
        const topic = s1.contract?.topic || s1.mergedTitle || '未定课题';
        
        // 📋 提炼第一阶段公约中全组已确认的分工与时间规划
        const membersList = (this.getMemberList ? this.getMemberList(groupId) : []) || [];
        const taskMap = s1.contract?.taskAssignments || {};
        const taskList = [];
        membersList.forEach(m => {
          const mKey = m.id || m.name;
          const val = taskMap[mKey] || (m.id && taskMap[m.id]) || (m.name && taskMap[m.name]) || '';
          if (val) {
            taskList.push(`${m.name}（负责：${val}）`);
          } else {
            taskList.push(`${m.name}`);
          }
        });
        const taskSummaryStr = taskList.length > 0 ? taskList.join('、') : '全员协同撰写';

        const timeMap = s1.contract?.timeAllocations || {};
        let totalPlannedMinutes = 0;
        const timeModuleList = [];
        const defaultModules = isInst ? [
          { key: 'intro', label: '教材与学情' },
          { key: 'target', label: '教学目标' },
          { key: 'keypoint', label: '重难点' },
          { key: 'process', label: '教学过程' },
          { key: 'activity', label: '活动探究' },
          { key: 'eval', label: '板书与作业' }
        ] : [
          { key: 'intro', label: '引言与背景' },
          { key: 'lit', label: '核心概念' },
          { key: 'theory', label: '理论与假设' },
          { key: 'method', label: '研究方法' },
          { key: 'analysis', label: '数据分析' },
          { key: 'discuss', label: '讨论与建议' }
        ];
        defaultModules.forEach(mod => {
          const t = parseInt(timeMap[mod.key] || 0);
          if (t > 0) {
            totalPlannedMinutes += t;
            timeModuleList.push(`${mod.label}${t}m`);
          }
        });
        const timeSummaryStr = totalPlannedMinutes > 0 
          ? `各章节规划总用时约 ${totalPlannedMinutes} 分钟（${timeModuleList.join('、')}）` 
          : '按阶段二标准时间节奏推进';

        const welcomeText = `🤝 【${managingName}·开场欢迎】：各位${isInst ? '备课教师' : '研究者'}，欢迎来到【${stage2Title}】！全组已锁定${isInst ? '教学课题' : '研究主题'}《${topic}》。\n📋 【本组公约分工与时间规划】：\n• 成员分工：${taskSummaryStr}\n• 时间分配：${timeSummaryStr}\n👉 请大家对照公约设想展开协同起草，主动研读同伴起草的段落，共同打通前后${isInst ? '教学' : '学术'}逻辑！请进入左侧富文本编辑器开启深度协作！`;

        const managingWelcome = {
          id: `msg_welcome_${taskId}_${groupId}_stage2_managing`,
          classId: effectiveClassId,
          groupId: groupId,
          taskId: taskId,
          stage: 'stage2',
          sender: 'managingEditor',
          senderName: isInst ? '备课组长 · 过程学伴' : '责任编辑 · 过程学伴',
          text: welcomeText,
          timestamp: now,
          _timeMs: Date.now()
        };
        logs.unshift(managingWelcome);
        this.sendSingleChatMessage(managingWelcome, 'stage2');
        if (typeof window.renderChat === 'function') window.renderChat(this.state);

        // 🛡️ 审稿编辑/教研专家规则：必须在【责任编辑/备课组长之后】发言，且【仅当当前任务下发了范文/文献】时才说开场白
        if (hasPapers && !hasReviewingIntro) {
          setTimeout(() => {
            const reviewingWelcome = {
              id: `msg_welcome_${taskId}_${groupId}_stage2_reviewing`,
              classId: effectiveClassId,
              groupId: groupId,
              taskId: taskId,
              stage: 'stage2',
              sender: 'reviewingEditor',
              senderName: isInst ? '教研专家 · 质量把关' : '审稿编辑 · 质量把关',
              text: `📝 【${reviewingName}·开场寄语】：大家好！我是本阶段的${reviewingName}。在大家的${isInst ? '教学设计' : '写作'}过程中，我将分别在开篇破题、半程${isInst ? '磨课' : '研讨'}与终审定稿三个关键节点为大家提供质检把脉与修改清单，护航全篇${isInst ? '教学设计' : '学术'}质量！👉 遇到瓶颈时，建议大家参考顶部【${isInst ? '教学范例' : '学术范文'}】与参考资料支架，学习规范的${isInst ? '教学设计与活动探究架构' : '学术行文与章节论述架构'}！`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              _timeMs: Date.now()
            };
            logs.push(reviewingWelcome);
            this.sendSingleChatMessage(reviewingWelcome, 'stage2');
            if (typeof window.renderChat === 'function') window.renderChat(this.state);
          }, 2000);
        }
      } else if (hasManagingIntro && hasPapers && !hasReviewingIntro) {
        setTimeout(() => {
          const reviewingWelcome = {
            id: `msg_welcome_${taskId}_${groupId}_stage2_reviewing`,
            classId: effectiveClassId,
            groupId: groupId,
            taskId: taskId,
            stage: 'stage2',
            sender: 'reviewingEditor',
            senderName: isInst ? '教研专家 · 质量把关' : '审稿编辑 · 质量把关',
            text: `📝 【${reviewingName}·开场寄语】：大家好！我是本阶段的${reviewingName}。在大家的${isInst ? '教学设计' : '写作'}过程中，我将分别在开篇破题、半程${isInst ? '磨课' : '研讨'}与终审定稿三个关键节点为大家提供质检把脉与修改清单，护航全篇${isInst ? '教学设计' : '学术'}质量！👉 遇到瓶颈时，建议大家参考顶部【${isInst ? '教学范例' : '学术范文'}】与参考资料支架，学习规范的${isInst ? '教学设计与活动探究架构' : '学术行文与章节论述架构'}！`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            _timeMs: Date.now()
          };
          logs.push(reviewingWelcome);
          this.sendSingleChatMessage(reviewingWelcome, 'stage2');
          if (typeof window.renderChat === 'function') window.renderChat(this.state);
        }, 1200);
      }
    }

    // 🎓 阶段三：严格按时序：① 中间委员开场 ➔ ② 正反方并行生成 ➔ ③ 写入矩阵 ➔ ④ 中间委员抛题引导
    else if (stage === 'stage3') {
      const hasProp = logs.some(m => m && m.sender === 'proponent');
      const hasOpp = logs.some(m => m && m.sender === 'opponent');
      const needsCommitteeReview = !hasProp || !hasOpp || !this.state.stage3.feedbackItems || this.state.stage3.feedbackItems.length === 0;

      if (needsCommitteeReview && !this._isStage3PipelineRunning) {
        sessionStorage.setItem(welcomeFlagKey, '1');
        this.runStage3CommitteePipeline();
      }
    }
  }

  async runStage3CommitteePipeline(btnElement = null) {
    if (this.isCurrentTaskReadOnly()) return;
    if (btnElement && typeof btnElement === 'object' && btnElement.tagName) {
      btnElement.disabled = true;
      btnElement.style.opacity = '0.6';
      btnElement.style.cursor = 'not-allowed';
      btnElement.innerHTML = `⏳ 正在重新生成专家评审...`;
    }
    if (this._isStage3PipelineRunning) return;
    this._isStage3PipelineRunning = true;

    try {
      if (!this.state.chatLogs.stage3) this.state.chatLogs.stage3 = [];
      const logs = this.state.chatLogs.stage3;
      const topic = (this.state.stage1 && this.state.stage1.mergedTitle) ? this.state.stage1.mergedTitle : '本组研究设计';
      let rawContent = (this.state.stage2 && this.state.stage2.unifiedContent) ? this.state.stage2.unifiedContent.replace(/<[^>]*>/g, '').trim() : '';
      if (!rawContent || rawContent.length < 50) {
        rawContent = `课题名称: ${topic}。正文涵盖背景意义、文献综述、问题与假设、研究设计与方法、反思等完整初稿。`;
      }

      const hasFeedbackItems = this.state.stage3.feedbackItems && this.state.stage3.feedbackItems.length > 0;
      if (!hasFeedbackItems) {
        this.state.stage3CommitteeLoading = true;
        this.renderStudentWorkspace();
      }

      const taskType = this.getCurrentTaskType();
      const isInst = (taskType === 'instructional');
      const chairName = isInst ? '答辩委员会主席' : '答辩委员会主席 · 中间委员';
      const chairShort = isInst ? '答辩主席' : '中间委员';
      const stage3Title = isInst ? '阶段三：答辩评审会' : '阶段三：答辩擂台';
      const docName = isInst ? '教学设计' : '论文';

      // 1. 中间委员/答辩主席开场（如果尚未开场）
      const hasNeutralIntro = logs.some(m => m && m.sender === 'neutral' && (m.text?.includes('欢迎来到【阶段三') || m.text?.includes('开场')));
      if (!hasNeutralIntro) {
        const neutralWelcome = {
          id: `msg_s3_neutral_welcome_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          sender: 'neutral',
          senderName: chairName,
          text: `🟡 【${chairShort}开场】：各位${isInst ? '备课教师' : '研究者'}，欢迎来到【${stage3Title}】！初稿撰写完毕，答辩评审委员会已就位。正反两方评审专家正在通读审阅全篇${docName}，请大家稍候！`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          _timeMs: Date.now()
        };
        logs.unshift(neutralWelcome);
        this.sendSingleChatMessage(neutralWelcome, 'stage3');
        this.syncChatLogs();
        if (typeof window.renderChat === 'function') window.renderChat(this.state);
      }

      // 2. 正方与反方委员并行调用 Coze API（极速提效，总耗时从 40s 压缩至 10s 左右）
      const hasProp = logs.some(m => m && m.sender === 'proponent');
      const hasOpp = logs.some(m => m && m.sender === 'opponent');

      let propText = '';
      let oppText = '';
      const genreDesc = getGenrePromptDescriptor(taskType);

      if (!hasProp || !hasOpp) {
        // 🌟 挂载答辩委员会并行审阅动态思考气泡
        this.state.activeAgentAnalyzing = {
          icon: '🎓',
          title: '【答辩委员会】正反方评审专家正在审阅全篇论文...',
          detail: '正方立论专家正在提炼肯定亮点，反方商榷专家正在研拟针对实质询...'
        };
        renderChat(this.state);
        this.renderStudentWorkspace();

        const propPrompt = `${genreDesc}

针对小组论文《${topic}》，请通读下方【小组当前真实正文草稿】全文，作为答辩委员会正方评审教授发表 150~200 字的肯定支持评审意见：
【5 大正向肯定维度候选库】：
1. 行文风格与语言通顺（表述流畅、学术/教学语体规范统一）
2. 选题与立意创新（切口新颖独特、问题针对性强）
3. 设计与主体严密（概念界定清晰、探究活动/方法设计深入）
4. 实践落地与推广价值（真实课堂/实践中可操作性与示范价值强）
5. 规范与术语统一（前后口径一致、要素完整）

【核心指令】：通读正文草稿，从上述 5 大维度中根据草稿真实闪光点灵活挑选 2~3 个维度，使用序号清晰列出肯定与立论支撑（严禁指责瑕疵，只作正向赋能）：
①【{动态亮点维度1}】：{结合具体章节与设计的真实闪光点深入肯定}；
②【{动态亮点维度2}】：{结合具体设计或行文亮点的深度肯定}；
（若有第3个突出亮点可列出 ③【{动态亮点维度3}】）。
为全组提供充实坚定的正面辩护论据支架！纯自然语言输出，150~200字。`;

        const oppPrompt = `${genreDesc}

针对小组论文《${topic}》，请通读下方【小组当前真实正文草稿】全文，作为答辩委员会反方评审教授发表 200~260 字的针对实质询意见：
【5 大学术质询考查维度】：
1. 核心概念界定与论点一致性
2. 研究设计操作化与方法严密性
3. 教学干预在真实课堂中的落地挑战与认知负荷防范
4. 数据/测量工具信效度与论据支撑充分性
5. 研究局限反思与结论外推推广边界

【核心指令】：请通读当前正文草稿，从上述 5 大学术维度中，精准挑选出最切中本篇草稿真实薄弱处的【3 项质询】，使用序号 ① ② ③ 分条明确列出：
①【质询焦点 1】：指出具体章节存在的设计缺陷或论据不足，提出商榷质询；
②【质询焦点 2】：指出具体的方法论或实践落地挑战，提出针对性质询；
③【质询焦点 3】：指出反思局限或推广边界问题，提出深度质询。
态度客观严谨、温和建设，纯自然语言输出，200~260字。`;

        try {
          const timeoutPromise = new Promise(r => setTimeout(() => r(null), 45000));
          const promises = [];
          if (!hasProp) {
            promises.push(Promise.race([
              callCozeAgentAPI('proponent', propPrompt, { stage: 'stage3', topic, actualDoc: rawContent, taskType }),
              timeoutPromise
            ]));
          } else {
            const existingProp = logs.find(m => m && m.sender === 'proponent');
            promises.push(Promise.resolve(existingProp ? existingProp.text : ''));
          }

          if (!hasOpp) {
            promises.push(Promise.race([
              callCozeAgentAPI('opponent', oppPrompt, { stage: 'stage3', topic, actualDoc: rawContent, taskType }),
              timeoutPromise
            ]));
          } else {
            const existingOpp = logs.find(m => m && m.sender === 'opponent');
            promises.push(Promise.resolve(existingOpp ? existingOpp.text : ''));
          }

          const [pResult, oResult] = await Promise.all(promises);
          propText = pResult || '';
          oppText = oResult || '';
        } catch (e) {
          console.warn('[Stage3 Committee] 并行请求警告:', e);
        } finally {
          this.state.activeAgentAnalyzing = null;
        }

        if (!propText || propText.trim().length === 0 || !oppText || oppText.trim().length === 0) {
          const errPipelineMsg = {
            id: 'msg_s3_pipeline_err_' + Date.now(),
            sender: 'neutral',
            senderName: '答辩委员会主席 · 中间委员',
            text: `⚖️ 【答辩委员会·网络提醒】：📡 专家评审生成遇到网络波动，尚未全部就绪。<br><button class="btn-retry-ai" onclick="window.app.runStage3CommitteePipeline(this)" style="margin-top:6px; background:#2563eb; color:#fff; border:none; padding:4px 12px; border-radius:12px; font-size:12px; cursor:pointer; font-weight:700;">🔄 重新生成委员会评审</button>`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            _timeMs: Date.now()
          };
          logs.push(errPipelineMsg);
          this.sendSingleChatMessage(errPipelineMsg, 'stage3');
          this.syncChatLogs();
          if (typeof window.renderChat === 'function') window.renderChat(this.state);
          this.renderStudentWorkspace();
          return;
        }

        // 🛡️ 清理历史残留的网络提醒错误气泡
        this.state.chatLogs.stage3 = (this.state.chatLogs.stage3 || []).filter(m => !m || !(m.text || '').includes('网络提醒'));

        if (!hasProp) {
          const propMsg = {
            sender: 'proponent',
            senderName: '立论支持 · 正方委员',
            text: propText,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            _timeMs: Date.now()
          };
          logs.push(propMsg);
          this.sendSingleChatMessage(propMsg, 'stage3');
        }

        if (!hasOpp) {
          const oppMsg = {
            sender: 'opponent',
            senderName: '学术质询 · 反方委员',
            text: oppText,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            _timeMs: Date.now() + 500
          };
          logs.push(oppMsg);
          this.sendSingleChatMessage(oppMsg, 'stage3');
        }

        this.syncChatLogs();
        if (typeof window.renderChat === 'function') window.renderChat(this.state);
        this.renderStudentWorkspace();
      } else {
        const existingProp = logs.find(m => m && m.sender === 'proponent');
        const existingOpp = logs.find(m => m && m.sender === 'opponent');
        propText = existingProp ? existingProp.text : '';
        oppText = existingOpp ? existingOpp.text : '';
      }

      // 3. 平台自动将正反评审意见【即刻同步写入】左侧【答辩裁决矩阵】
      const oppBody = (oppText || '').replace(/^[^\n]*?【[^】]+】[：:]?\s*/, '').trim();
      const oppMatches = oppBody.match(/[①②③④⑤][^①②③④⑤]*/g);
      const oppQueries = (oppMatches && oppMatches.length > 0)
        ? oppMatches.map(s => s.trim()).filter(s => s.length > 0)
        : [oppBody];
      this.state.stage3.feedbackItems = [
        { id: 'fb_prop', role: 'proponent', speaker: isInst ? '正方评审专家 (肯定支持)' : '正方委员 Agent (肯定支持)', title: '立论支持', content: propText.replace(/^[^\n]*?【[^】]+】[：:]?\s*/, ''), response: '', status: 'pending' }
      ];
      oppQueries.forEach((q, i) => {
        this.state.stage3.feedbackItems.push({
          id: 'fb_opp_' + (i + 1),
          role: 'opponent',
          speaker: isInst ? '反方质询专家 (针对实质询)' : '反方委员 Agent (尖锐质询)',
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
      await new Promise(r => setTimeout(r, 1000));

      // 4. 中间委员独立调用 Coze API，引导第 1 题辩护
      const hasChairGuide = logs.some(m => m && m.sender === 'neutral' && (m.text?.includes('答辩思路引导') || m.text?.includes('质询 ①') || m.text?.includes('意见 1')));
      if (!hasChairGuide) {
        // 🌟 挂载中间委员思路引导思考气泡
        this.state.activeAgentAnalyzing = {
          icon: '🟡',
          title: '【中间委员】正在审阅答辩清单并生成第一题破局思路支架...',
          detail: '正在梳理正反两方专家焦点，为全组定制第一题答辩思路引导...'
        };
        renderChat(this.state);
        this.renderStudentWorkspace();

        const chairPrompt = `${genreDesc}

答辩正反两方评审意见已入驻左侧矩阵。
【正方意见】: ${propText}
【反方质询】: ${oppText}

请作为答辩委员会主席（中间委员），发表 130~150 字的【针对质询 ① 独立答辩思路引导】：
① 宣布正反方评审已正式送达并生成【答辩与终稿修改清单】，肯定正方的创新与实践价值，明确指出反方提出了针对实质询；
② 【单题独立引导·核心铁律】：本次只聚焦【意见 1 / 质询 ①】，结合上述文体特征与反方质询①的具体内容给出清晰的答辩破局/操作化补救思路支架（严禁提及或剧透后续质询！）；
③ 引导全组在讨论区充分商讨，商定差不多后点击聊天框上方【💡 意见 1 讨论差不多了？帮我总结并填入】按钮！纯自然语言输出，130~150字。`;

        let chairText = '';
        try {
          const timeoutPromise = new Promise(r => setTimeout(() => r(null), 12000));
          chairText = await Promise.race([
            callCozeAgentAPI('neutral', chairPrompt, { stage: 'stage3', topic, prop: propText, opp: oppText, queryPoint: 1, taskType }),
            timeoutPromise
          ]);
        } finally {
          this.state.activeAgentAnalyzing = null;
        }

        if (!chairText || chairText.trim().length === 0) {
          const errChairMsg = {
            id: 'msg_s3_chair_err_' + Date.now(),
            sender: 'neutral',
            senderName: chairName,
            text: `🟡 【${chairShort}·网络提醒】：📡 答辩思路引导生成稍有延迟。<br><button class="btn-retry-ai" onclick="window.app.runStage3CommitteePipeline(this)" style="margin-top:6px; background:#d97706; color:#fff; border:none; padding:4px 12px; border-radius:12px; font-size:12px; cursor:pointer; font-weight:700;">🔄 重新生成答辩思路引导</button>`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            _timeMs: Date.now()
          };
          logs.push(errChairMsg);
          this.sendSingleChatMessage(errChairMsg, 'stage3');
          this.syncChatLogs();
          if (typeof window.renderChat === 'function') window.renderChat(this.state);
          this.renderStudentWorkspace();
          return;
        }

        // 🛡️ 清理历史残留的网络提醒错误气泡
        this.state.chatLogs.stage3 = (this.state.chatLogs.stage3 || []).filter(m => !m || !(m.text || '').includes('网络提醒'));

        const chairMsg = {
          sender: 'neutral',
          senderName: '答辩委员会主席 · 中间委员',
          text: chairText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          _timeMs: Date.now()
        };
        logs.push(chairMsg);
        this.sendSingleChatMessage(chairMsg, 'stage3');
        this.syncChatLogs();
        if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
        if (typeof window.renderChat === 'function') window.renderChat(this.state);
        this.renderStudentWorkspace();
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

    const isContractSigned = !!(
      s1.contract?.isConfirmed || 
      s1.contract?.isLocked || 
      this.state.groupMaxStage === 'stage2' || 
      this.state.groupMaxStage === 'stage3'
    );
    const isDraftDone = !!(s2.isDraftConfirmed || this.state.groupMaxStage === 'stage3' || this.state.isFinalSubmitted);
    const isStage3Active = !!(this.state.groupMaxStage === 'stage3' || this.state.isFinalSubmitted || isDraftDone);

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
    const currentTaskType = this.getCurrentTaskType();
    const isInstStage = (currentTaskType === 'instructional');
    const s2Name = isInstStage ? '【阶段二：集体备课室】' : '【阶段二：学术编辑部】';
    const s3Name = isInstStage ? '【阶段三：答辩评审会】' : '【阶段三：答辩擂台】';
    const contractDocName = isInstStage ? '备课公约' : '学术公约';

    if (!isTaskDeadlineExpired && !this.state.isFinalSubmitted && newStage === 'stage2' && !isMilestoneAdvance && !isContractSigned && currentGroupOrder < 2) {
      alert(`⚠️ 暂未解锁${s2Name}！\n请先在阶段一完成${contractDocName}的签署与分工确认，方可进入阶段二。`);
      return;
    }

    if (!isTaskDeadlineExpired && !this.state.isFinalSubmitted && targetOrder > currentGroupOrder && !isMilestoneAdvance) {
      const stageTitles = { stage2: s2Name, stage3: s3Name };
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
      const overviewInp = document.getElementById('contract-overview-input');
      if (overviewInp) {
        if (!this.state.stage1) this.state.stage1 = {};
        if (!this.state.stage1.contract) this.state.stage1.contract = {};
        this.state.stage1.contract.overview = overviewInp.value;
        this.state.stage1.researchOverview = overviewInp.value;
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
      const currentUser = this.authManager ? this.authManager.getCurrentUser() : null;
      const strictCtx = (this.authManager && typeof this.authManager.resolveStudentActiveContext === 'function')
        ? this.authManager.resolveStudentActiveContext(currentUser, {
            classId: this.state.activeStudentClassId || null,
            taskId: this.state.activeTaskId || null
          })
        : null;
      // 解析不到时不构建 pad 名、不发起任何请求（彻底消除 jizhi_..._null 这类空 pad）
      if (strictCtx && strictCtx.ok) {
        const padName = `jizhi_${strictCtx.taskId}_${strictCtx.groupId}`;
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
    }

    this.isViewingPastStage = (targetOrder < currentGroupOrder);
    this.state.isViewingPastStage = (targetOrder < currentGroupOrder);
    this.state.currentStage = newStage;
    if (isMilestoneAdvance && targetOrder > currentGroupOrder) {
      this.state.groupMaxStage = newStage;
      this.isViewingPastStage = false;
      this.state.isViewingPastStage = false;
    }
    if (newStage === 'stage2') {
      if (!this.state.stage2) this.state.stage2 = {};
      if (!this.state.stage2.startTime) this.state.stage2.startTime = Date.now();
      if (!this.state.stage2.stageStartTime) this.state.stage2.stageStartTime = this.state.stage2.startTime;
      if (!this.stage2StartTime) this.stage2StartTime = this.state.stage2.startTime;
    }
    if (newStage === 'stage3') {
      if (!this.state.stage3) this.state.stage3 = {};
      if (!this.state.stage3.startTime) this.state.stage3.startTime = Date.now();
      if (!this.state.stage3.stageStartTime) this.state.stage3.stageStartTime = this.state.stage3.startTime;
      if (!this.stage3StartTime) this.stage3StartTime = this.state.stage3.startTime;
      const s3Logs = (this.state.chatLogs && this.state.chatLogs.stage3) ? this.state.chatLogs.stage3 : [];
      const hasProp = s3Logs.some(m => m && m.sender === 'proponent');
      const hasOpp = s3Logs.some(m => m && m.sender === 'opponent');
      if (!this.isCurrentTaskReadOnly()) {
        if (!this.state.stage3.feedbackItems || this.state.stage3.feedbackItems.length === 0) {
          this.state.stage3CommitteeLoading = true;
        }
        if ((!hasProp || !hasOpp || !this.state.stage3.feedbackItems || this.state.stage3.feedbackItems.length === 0) && !this._isStage3PipelineRunning) {
          this.runStage3CommitteePipeline();
        }
      }
    }
    this.syncStageChange(newStage);
    if (!this.isCurrentTaskReadOnly()) {
      this.triggerStageWelcomeSpeech(newStage);
    }
    this.renderStudentWorkspace(true);
  }

  isCurrentTaskReadOnly() {
    if (this.state.isFinalSubmitted) return true;
    const allTasks = (this.authManager) ? this.authManager.getTasks() : [];
    const curTask = allTasks.find(t => t.id === this.state.activeTaskId || (t.title && t.title === this.state.activeTaskId)) || (allTasks.length > 0 ? allTasks[0] : null);
    if (curTask && isTaskExpired(curTask)) return true;
    return false;
  }

  getCurrentTaskType() {
    const allTasks = (this.authManager) ? this.authManager.getTasks() : [];
    const currentTask = allTasks.find(t => t.id === this.state.activeTaskId);
    return currentTask?.taskType || 'experiment';
  }

  getAgentSenderName(key) {
    return getAgentDisplayName(key, this.getCurrentTaskType());
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
    const effectiveClassId = this.state.activeStudentClassId || (currentUser?.classId || null);
    const activeGroupObj = this.authManager.getStudentActiveGroup(currentUser, effectiveClassId);
    let currentGroupId = activeGroupObj?.id || currentUser?.groupId || null;

    // 🛡️ 班级/小组/成员/任务严格解析：任一解析不到 → 明确提示并阻止进入学生工作区（不再静默兜底）
    if (this.authManager && typeof this.authManager.resolveStudentActiveContext === 'function') {
      const strictCtx = this.authManager.resolveStudentActiveContext(currentUser, {
        classId: this.state.activeStudentClassId || null,
        taskId: this.state.activeTaskId || null
      });
      if (!strictCtx.ok) {
        const appEl = document.getElementById('app');
        if (appEl) appEl.innerHTML = showResolutionBlock(strictCtx.reason);
        return;
      }
      currentGroupId = strictCtx.groupId;
      this.state.activeStudentClassId = strictCtx.classId;
    }

    this.state.members = this.authManager.getGroupMembersForWorkspace(currentGroupId);
    this.state.currentUser = currentUser ? (currentUser.name || currentUser.id) : null;

    renderHeader(
      this.state, currentUser, this.authManager.getAnnouncements(),
      (s) => this.switchStage(s),
      () => this.handleLogout(),
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

    // 默认自动触发当前阶段对应智能体的开场白与阶段三专家评审（仅在可编辑状态下触发，只读模式严禁触发任何新智能体）
    if (!this.isCurrentTaskReadOnly()) {
      this.triggerStageWelcomeSpeech(this.state.currentStage || 'stage1');

      // 🎓 阶段三自愈守护：只要处于阶段三且答辩矩阵为空，立即自动拉起答辩委员会流水线
      if (this.state.currentStage === 'stage3') {
        const s3 = this.state.stage3 || {};
        const s3Logs = (this.state.chatLogs && this.state.chatLogs.stage3) ? this.state.chatLogs.stage3 : [];
        const hasProp = s3Logs.some(m => m && m.sender === 'proponent');
        const hasOpp = s3Logs.some(m => m && m.sender === 'opponent');
        if ((!hasProp || !hasOpp || !s3.feedbackItems || s3.feedbackItems.length === 0) && !this._isStage3PipelineRunning) {
          this.runStage3CommitteePipeline();
        }
      }
    }

    // ── 核心保护：全场景输入法与活动输入框智能保护 ──
    const activeEl = document.activeElement;
    const isTagInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);
    const isComposingActive = !!(window._isGlobalComposing || activeEl?.dataset?.isComposing === 'true');
    const isInputFocused = isTagInput || isComposingActive;

    const isEditorTyping = !isForced && isInputFocused;

    // 如果用户在阶段一且画布已存在，且非强制重置，做局部精准 Patch
    const existingContractCard = document.querySelector('.contract-card');
    if (!isForced && this.state.currentStage === 'stage1' && existingContractCard) {
      // 局部更新提案池卡片与投票按钮
      const proposalsWrapper = document.getElementById('proposals-wrapper-container');
      const s1 = this.state.stage1 || { proposals: [], votes: {}, hasVoted: {}, contract: {} };
      const membersList = Array.isArray(this.state.members) ? this.state.members : Object.values(this.state.members || {});
      const currentUserObj = this.authManager ? this.authManager.getCurrentUser() : null;
      const myKeys = new Set(
        [...getUserAllKeys(currentUserObj), this.state.currentUser, currentUserObj?.id]
          .filter(k => k && k !== '我' && k !== '组员')
          .map(k => String(k).trim().toLowerCase())
      );
      const isMyProposal = (p) => {
        if (!p) return false;
        const pKeys = [p.author, p.authorId, p.authorName]
          .filter(k => k && k !== '我' && k !== '组员')
          .map(k => String(k).trim().toLowerCase());
        if (pKeys.length === 0) return false;
        return pKeys.some(pk => myKeys.has(pk));
      };

      const userVotedProposalId = s1.votes ? (getUserFromMap(s1.votes, currentUserObj) || s1.votes[this.state.currentUser]) : null;
      const userHasVoted = s1.hasVoted ? (isUserInMap(s1.hasVoted, currentUserObj) || s1.hasVoted[this.state.currentUser]) : false;
      const isContractLocked = s1.contract?.isConfirmed || this.state.isFinalSubmitted;

      const allUsers = this.authManager ? this.authManager.getUsers() : [];
      const hasSubmittedMyProposal = (s1.proposals || []).some(p => isMyProposal(p));

      const btnOpenProp = document.getElementById('btn-open-submit-proposal');
      if (btnOpenProp) {
        btnOpenProp.innerText = hasSubmittedMyProposal ? '✏️ 修改我的选题' : '+ 提交我的选题';
      }

      // 🛡️ 实时动态更新顶部投票进度条 Badge (解决多端投票进度滞后未同步问题)
      const progressBadge = document.getElementById('proposal-vote-progress-badge');
      if (progressBadge) {
        const totalVotesCast = membersList.filter(m => (isUserInMap(s1.hasVoted, m) || (m && (s1.hasVoted[m.id] || s1.hasVoted[m.id]  || (m.name && s1.hasVoted[m.name]))))).length;
        const totalMembersCount = membersList.length || 2;
        const isVotingComplete = (totalMembersCount > 0 && totalVotesCast >= totalMembersCount);
        progressBadge.innerHTML = isVotingComplete
          ? `🎉 投票已完成 (共投出 ${totalVotesCast} 票)`
          : `📊 投票进度: <b>${totalVotesCast}/${totalMembersCount} 人已投票</b> ${userHasVoted ? '<span style="color:#059669; font-weight:700; margin-left:4px;">(您已投票，等待其他组员)</span>' : ''}`;
      }

      if (proposalsWrapper) {
        if (Array.isArray(s1.proposals) && s1.proposals.length > 0) {
          proposalsWrapper.innerHTML = `
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
                if (isContractLocked || userHasVoted) {
                  if (isThisVoted) { btnText = '🔒 已投此提案'; btnClass = 'vote-btn active locked'; }
                  else { btnText = '🔒 投票已锁定'; btnClass = 'vote-btn disabled'; }
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

      // 🛡️ 实时动态更新公约顶部操作提炼按钮及协同确认计数
      const contractActionBarMount = document.getElementById('stage1-contract-action-bar-mount');
      if (contractActionBarMount && !isContractLocked) {
        const confs = this.state.stepConfirmations || {};
        const totalMembersCount = membersList.length || 2;
        const totalVotesCast = membersList.filter(m => (isUserInMap(s1.hasVoted, m) || (m && (s1.hasVoted[m.id] || s1.hasVoted[m.id]  || (m.name && s1.hasVoted[m.name]))))).length;
        const isVotingComplete = (totalMembersCount > 0 && totalVotesCast >= totalMembersCount);
        const currUserCode = this.state.currentUser;

        const isDoneHelper = (map) => {
          if (!map) return 0;
          return membersList.filter(m => map[m.id]  || (m.name && map[m.name])).length;
        };
        const isMyDoneHelper = (map) => {
          if (!map) return false;
          return !!(map[currUserCode] || (currentUserObj && (map[currentUserObj.id] || map[currentUserObj.id] || map[currentUserObj.name])));
        };

        if (s1.contractStep === 'completed' || s1.contract?.isDraftGenerated) {
          contractActionBarMount.innerHTML = `
            <div style="background:#f0fdf4; border:1.5px solid #86efac; color:#15803d; padding:7px 22px; border-radius:20px; font-weight:800; font-size:13px; display:inline-flex; align-items:center; gap:6px; box-shadow:0 2px 8px rgba(34,197,94,0.15);">
              ✅ 公约草案已全部提炼生成（全组可微调修改，并在下方签署确认）
            </div>
          `;
        } else if (s1.contractStep === 'tasks') {
          const count = isDoneHelper(confs.s1_tasks);
          const isMe = isMyDoneHelper(confs.s1_tasks);
          const isFull = count >= totalMembersCount && totalMembersCount > 0;
          contractActionBarMount.innerHTML = `
            <button id="btn-extract-tasks" style="background:${isFull ? 'linear-gradient(135deg, #d97706, #b45309)' : (isMe ? 'linear-gradient(135deg, #059669, #047857)' : 'linear-gradient(135deg, #7c3aed, #6d28d9)')}; border:none; color:white; padding:9px 24px; border-radius:20px; font-weight:800; font-size:13.5px; cursor:${isFull ? 'wait' : 'pointer'}; display:inline-flex; align-items:center; gap:6px; box-shadow:0 4px 14px rgba(124,58,237,0.3); transition:all 0.2s;" ${isFull ? 'disabled' : ''}>
              ${isFull ? `⏳ 全员已确认 (${count}/${totalMembersCount}) · 正在生成公约草案...` : (isMe ? `✅ 您已确认提炼分工 (${count}/${totalMembersCount} 等待其他组员)` : `👥 研讨差不多了？一键提炼【任务分工】 (${count}/${totalMembersCount})`)}
            </button>
          `;
          if (!isFull) {
            contractActionBarMount.querySelector('#btn-extract-tasks')?.addEventListener('click', () => this.handleExtractTasks());
          }
        } else if (s1.contractStep === 'time') {
          const count = isDoneHelper(confs.s1_time);
          const isMe = isMyDoneHelper(confs.s1_time);
          const isFull = count >= totalMembersCount && totalMembersCount > 0;
          contractActionBarMount.innerHTML = `
            <button id="btn-extract-time" style="background:${isFull ? 'linear-gradient(135deg, #d97706, #b45309)' : (isMe ? 'linear-gradient(135deg, #059669, #047857)' : 'linear-gradient(135deg, #0284c7, #0369a1)')}; border:none; color:white; padding:9px 24px; border-radius:20px; font-weight:800; font-size:13.5px; cursor:${isFull ? 'wait' : 'pointer'}; display:inline-flex; align-items:center; gap:6px; box-shadow:0 4px 14px rgba(2,132,199,0.3); transition:all 0.2s;" ${isFull ? 'disabled' : ''}>
              ${isFull ? `⏳ 全员已确认 (${count}/${totalMembersCount}) · 正在提炼时间分配...` : (isMe ? `✅ 您已确认提炼时间 (${count}/${totalMembersCount} 等待其他组员)` : `⏱️ 时间讨论差不多了？一键提炼【时间分配】 (${count}/${totalMembersCount})`)}
            </button>
          `;
          if (!isFull) {
            contractActionBarMount.querySelector('#btn-extract-time')?.addEventListener('click', () => this.handleExtractTime());
          }
        } else {
          const count = isDoneHelper(confs.s1_topic);
          const isMe = isMyDoneHelper(confs.s1_topic);
          const isFull = count >= totalMembersCount && totalMembersCount > 0;
          if (!isVotingComplete) {
            contractActionBarMount.innerHTML = `
              <button id="btn-extract-topic" class="locked-pending-btn" style="background:#f1f5f9; border:1px solid #cbd5e1; color:#94a3b8; padding:9px 24px; border-radius:20px; font-weight:800; font-size:13.5px; cursor:not-allowed; display:inline-flex; align-items:center; gap:6px; box-shadow:none;">
                🔒 请先完成投票推选 (${totalVotesCast}/${totalMembersCount} 人已投)
              </button>
            `;
            contractActionBarMount.querySelector('#btn-extract-topic')?.addEventListener('click', () => {
              alert(`🔒 请先完成全员提案提交与投票推选！\n\n当前全组投票进度：${totalVotesCast}/${totalMembersCount} 人已投票。\n投票结束后拍卖师将落槌揭晓结果，随后方可开启主题与方案提炼。`);
            });
          } else {
            contractActionBarMount.innerHTML = `
              <button id="btn-extract-topic" style="background:${isFull ? 'linear-gradient(135deg, #d97706, #b45309)' : (isMe ? 'linear-gradient(135deg, #059669, #047857)' : 'linear-gradient(135deg, #2563eb, #1d4ed8)')}; border:none; color:white; padding:9px 24px; border-radius:20px; font-weight:800; font-size:13.5px; cursor:${isFull ? 'wait' : 'pointer'}; display:inline-flex; align-items:center; gap:6px; box-shadow:0 4px 14px rgba(37,99,235,0.3); transition:all 0.2s;" ${isFull ? 'disabled' : ''}>
                ${isFull ? `⏳ 全员已确认 (${count}/${totalMembersCount}) · 正在提炼【主题与研究方案】...` : (isMe ? `✅ 您已确认提炼主题与方案 (${count}/${totalMembersCount} 等待其他组员)` : `💡 讨论差不多了？一键提炼【主题与研究方案】 (${count}/${totalMembersCount})`)}
              </button>
            `;
            if (!isFull) {
              contractActionBarMount.querySelector('#btn-extract-topic')?.addEventListener('click', () => this.handleExtractTopic());
            }
          }
        }
      }

      // 🛡️ 实时动态更新公约底部签署矩阵与确认操作按钮
      const signMatrixMount = document.getElementById('stage1-contract-sign-matrix-mount');
      const signActionMount = document.getElementById('stage1-contract-sign-action-mount');
      if (signMatrixMount || signActionMount) {
        const totalMembersCount = membersList.length || 2;
        const currUserCode = this.state.currentUser;
        const matchedMem = membersList.find(m => m && (m.id   === currUserCode || m.name === currUserCode));
        const currentUserName = matchedMem?.name || currentUserObj?.name || currUserCode || '组员';
        const confirmedMembers = s1.contract?.confirmedMembers || {};
        const confirmedCount = membersList.filter(m => (confirmedMembers[m.id] || (m.name && confirmedMembers[m.name]))).length;
        const userHasConfirmed = !!(confirmedMembers[currUserCode] || (currentUserObj && (confirmedMembers[currentUserObj.id] || confirmedMembers[currentUserObj.name])));

        if (signMatrixMount) {
          signMatrixMount.innerHTML = `
            <div style="font-size:13px; font-weight:700; color:#334155; margin-bottom:10px; display:flex; justify-content:space-between; flex-wrap:wrap; gap:10px;">
              <span>📌 本组全员确认签署状态矩阵 (规则：需 ${totalMembersCount}/${totalMembersCount} 人全部点击确认):</span>
              <span style="color:${confirmedCount === totalMembersCount ? '#059669' : '#d97706'}; font-weight:800;">签署进度: ${confirmedCount}/${totalMembersCount} 人已完成 ${confirmedCount === totalMembersCount ? '🎉 (合约已生效)' : ''}</span>
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:10px; font-size:13px;">
              ${membersList.map(m => {
                const isConf = !!(confirmedMembers[m.id] || (m.name && confirmedMembers[m.name]));
                return `
                  <span style="color:${isConf ? '#059669' : '#64748b'}; border:1px solid ${isConf ? '#a7f3d0' : '#e2e8f0'}; background:${isConf ? '#ecfdf5' : '#ffffff'}; padding:6px 12px; border-radius:8px; font-weight:600;">
                    ${m.avatar || '👤'} ${m.name}: <b>${isConf ? '✅ 已确认签署' : '⏳ 未确认'}</b>
                  </span>
                `;
              }).join('')}
            </div>
          `;
        }

        if (signActionMount) {
          if (isContractLocked) {
            signActionMount.innerHTML = `
              <button id="btn-goto-stage2" style="background:linear-gradient(135deg, #2563eb, #1d4ed8); border:none; color:white; padding:13px 36px; border-radius:10px; font-weight:800; cursor:pointer; font-size:15px; box-shadow:0 4px 14px rgba(37,99,235,0.3); display:inline-flex; align-items:center; gap:8px;">
                🚀 全员已签署完毕！前往【阶段二：学术编辑部】开始论文起草 →
              </button>
            `;
            signActionMount.querySelector('#btn-goto-stage2')?.addEventListener('click', () => {
              this.switchStage('stage2');
            });
          } else {
            signActionMount.innerHTML = `
              <button id="btn-confirm-contract" style="background:${userHasConfirmed ? '#eff6ff' : 'linear-gradient(135deg, #059669, #047857)'}; border:1px solid ${userHasConfirmed ? '#bfdbfe' : 'transparent'}; color:${userHasConfirmed ? '#1d4ed8' : 'white'}; padding:13px 32px; border-radius:10px; font-weight:800; cursor:pointer; font-size:14.5px; box-shadow:0 3px 12px rgba(5,150,105,0.25);">
                ${userHasConfirmed ? `✅ 我 (${currentUserName}) 已按键确认签署 (${confirmedCount}/${totalMembersCount} 人已完成)` : `✍️ 我以 (${currentUserName}) 身份按键确认签署合约 (已确认 ${confirmedCount}/${totalMembersCount} 人)`}
              </button>
            `;
            signActionMount.querySelector('#btn-confirm-contract')?.addEventListener('click', () => {
              this.handleConfirmContract();
            });
          }
        }
      }
    } else if (!isEditorTyping) {
      const handlers = {
        onVote: (propId) => { this.handleVoteCast(propId); },
        onRefresh: () => { this.renderStudentWorkspace(); },
        onContractChange: () => { this.syncStage1(); },
        onExtractTopic: () => { this.handleExtractTopic(); },
        onExtractTime: () => { this.handleExtractTime(); },
        onExtractTasks: () => { this.handleExtractTasks(); },
        onAiGenerateContract: () => { this.handleAiGenerateContract(); },
        onConfirmContract: () => { this.handleConfirmContract(); },
        onActionPlanToggle: (idx, isCompleted) => {
          if (!this.state.stage2) this.state.stage2 = {};
          if (!this.state.stage2.actionPlan) this.state.stage2.actionPlan = { items: [], completedMap: {} };
          if (!this.state.stage2.actionPlan.completedMap) this.state.stage2.actionPlan.completedMap = {};
          this.state.stage2.actionPlan.completedMap[idx] = !!isCompleted;
          this.syncStage2();
          if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
          this.renderStudentWorkspace();
        },
        onPresenceChange: (nodeIdx, sectionTitle, charOffset) => {
          const user = this.state.currentUser;
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
        const user = this.state.currentUser;
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
        const myKeys = [user, currUserObj?.id, currUserObj?.id, currUserObj?.name].filter(Boolean);
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
        const taskType = this.getCurrentTaskType();
        const isInst = (taskType === 'instructional');
        if (this.state.currentStage === 'stage3' || this.state.isFinalSubmitted) {
          alert(`🔒 阶段二半程${isInst ? '磨课会议' : '编辑会议'}已结束并归档，不可再次发起。你可随时查阅已锁定的【半程${isInst ? '磨课' : '编辑'}修正清单】！`);
          return;
        }
        this.showMeetingModal(); 
      },
      onConfirmStage2Draft: () => {
        if (!this.state.stage2) this.state.stage2 = {};
        const s2 = this.state.stage2;
        const user = this.state.currentUser;
        const taskType = this.getCurrentTaskType();
        const isInst = (taskType === 'instructional');

        let memberArr = [];
        if (this.authManager) {
          const u = this.authManager.getCurrentUser();
          const effClassId = (this.authManager ? this.authManager.getEffectiveStudentClassId(u, this.state.activeTaskId) : (this.state.activeStudentClassId || u?.classId || null));
          const effGroup = this.authManager.getStudentActiveGroup(u, effClassId);
          const rawG = this.authManager.getGroupMembersForWorkspace(effGroup?.id || this.state.activeGroupId || null, effClassId);
          const authMembers = Array.isArray(rawG) ? rawG : Object.values(rawG || {});
          if (authMembers.length > 0) memberArr = authMembers;
        }
        if (memberArr.length === 0) {
          if (Array.isArray(this.state.members)) memberArr = this.state.members;
          else if (this.state.members && typeof this.state.members === 'object') memberArr = Object.values(this.state.members);
        }
        if (!Array.isArray(memberArr)) {
          memberArr = Object.values(memberArr || {});
        }
        const totalMembersCount = Math.max(memberArr.length, 2);

        // 🛡️ 守卫拦截：必须先走完二审半程自查与会议全流程（全员打卡完成），或者总时间临近截止（<= 5分钟），才允许点击确认初稿！
        const subs = s2.meetingSubmissions || {};
        const subCount = Object.keys(subs).length;
        const isMeetingDone = s2.isMeetingLocked || (subCount >= totalMembersCount && totalMembersCount > 0);

        const curTask = this.authManager ? this.authManager.getTasks().find(t => t.id === this.state.activeTaskId) : null;
        const isDeadlineNear = isTaskExpired(curTask) || (curTask?.deadline && (new Date(curTask.deadline.replace(/-/g, '/')).getTime() - Date.now() <= 300000));

        if (!isMeetingDone && !isDeadlineNear) {
          alert(`⚠️ 无法确认初稿：全组尚未完成【半程全篇综合自查与${isInst ? '磨课会议' : '二审会议'}】（当前打卡进度：${subCount}/${totalMembersCount} 人）！\n\n请全组成员先完成半程自查打卡与${isInst ? '磨课修改研讨' : '二审修改研讨'}，或等待任务总时间临近结束（最后 5 分钟内）再进行初稿定稿确认。`);
          if (typeof showGlobalBannerNotice === 'function') {
            showGlobalBannerNotice('⚠️ 请先完成半程自查', `当前半程${isInst ? '磨课' : '编辑'}会议打卡进度为 ${subCount}/${totalMembersCount} 人，请先走完自查研讨流程或等待临近结课再确认初稿。`, 'warning', 6000);
          }
          return;
        }

        if (s2.isDraftConfirmed) {
          this.switchStage('stage3', true);
          return;
        }

        // 🛡️ 极速状态合并：提取本地持久化与内存中已有所有确认记录，防止并发冲刷
        const groupId = (typeof this.getEffectiveGroupId === 'function') ? this.getEffectiveGroupId() : (this.state.activeGroupId || this.state.activeGroupId || null);
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
          const id = typeof m === 'object' ? (m.id || m.name) : m;
          return !!(map[m.id] || (typeof m === 'object' && m.name && map[m.name]));
        };
        const currMemObj = memberArr.find(m => m && (m.id === user || m.name === user));
        const userKey = currMemObj ? currMemObj.id : user;
        s2.confirmedMembers[userKey] = true;
        if (currMemObj && currMemObj.name) s2.confirmedMembers[currMemObj.name] = true;
        if (!s2._firstSignTimeMs) s2._firstSignTimeMs = Date.now();
        s2._lastSignTimeMs = Date.now();

        const confirmedCount = memberArr.filter(m => isMemDone(s2.confirmedMembers, m)).length;
        const currUserObj = (this.authManager) ? this.authManager.getCurrentUser() : null;
        const memberName = currMemObj?.name || currUserObj?.name || '组员';

        this.syncStage2();
        this.syncChatLogs();
        if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
        renderChat(this.state);
        this.renderStudentWorkspace();

        // 🛡️ 严格要求：必须全组成员每一个人都点击确认初稿后，才解锁推进至阶段三
        const stage3Title = isInst ? '阶段三：答辩评审会' : '阶段三：答辩擂台';
        if (confirmedCount < totalMembersCount) {
          showGlobalBannerNotice('✍️ 初稿确认成功', `您 (${memberName}) 已确认初稿！当前组内进度：${confirmedCount}/${totalMembersCount} 人已确认。全员完成后将解锁【${stage3Title}】。`, 'info', 6000);
        } else {
          s2.isDraftConfirmed = true;
          this.state.groupMaxStage = 'stage3';
          const currentUserObj = this.authManager ? this.authManager.getCurrentUser() : null;
          const activeTaskId = this.state.activeTaskId || null;
          const userGroupId = currentUserObj?.groupId || this.state.activeGroupId || this.cloudSyncEngine?.groupId || null;
          if (this.authManager && this.authManager.markAllTaskAnnouncementsRead) {
            this.authManager.markAllTaskAnnouncementsRead(activeTaskId, userGroupId);
          }

          this.syncStage2();
          this.syncChatLogs();
          if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
          renderChat(this.state);
          this.renderStudentWorkspace();

          const autoKey = `jizhi_autoadvanced_${activeTaskId}_stage3`;
          if (!sessionStorage.getItem(autoKey)) {
            sessionStorage.setItem(autoKey, '1');
            this.showStageMilestoneModal({
              icon: '🎓',
              title: `全组成员已全部完成${isInst ? '教学设计' : ''}初稿确认！`,
              subtitle: `组内全员 (${totalMembersCount}/${totalMembersCount} 人) 已全部完成初稿确认！初稿已锁定归档，现在开启【${stage3Title}】！`,
              targetName: stage3Title,
              onProceed: () => {
                this.switchStage('stage3', true);
              }
            });
          } else {
            this.switchStage('stage3', true);
          }
        }
        this.renderStudentWorkspace();
      },
      onConfirmStage3Revision: () => {
        const user = this.state.currentUser;
        const s3 = this.state.stage3;
        let memberArr = [];
        if (this.authManager) {
          const u = this.authManager.getCurrentUser();
          const effClassId = (this.authManager ? this.authManager.getEffectiveStudentClassId(u, this.state.activeTaskId) : (this.state.activeStudentClassId || u?.classId || null));
          const effGroup = this.authManager.getStudentActiveGroup(u, effClassId);
          const rawG = this.authManager.getGroupMembersForWorkspace(effGroup?.id || this.state.activeGroupId || null, effClassId);
          const authMembers = Array.isArray(rawG) ? rawG : Object.values(rawG || {});
          if (authMembers.length > 0) memberArr = authMembers;
        }
        if (memberArr.length === 0) {
          if (Array.isArray(this.state.members)) memberArr = this.state.members;
          else if (this.state.members && typeof this.state.members === 'object') memberArr = Object.values(this.state.members);
        }
        if (!Array.isArray(memberArr)) {
          memberArr = Object.values(memberArr || {});
        }
        const totalMembersCount = Math.max(memberArr.length, 2);

        // 🛡️ 守卫拦截：必须先完成全部答辩质询陈述，或者总时间临近截止（<= 5分钟），才允许点击确认答辩！
        const items = s3.feedbackItems || [];
        const unrespondedItems = items.filter(f => f.role === 'opponent' && (!f.response || f.response.trim().length === 0));
        const isAllDefenseDone = items.length > 0 && unrespondedItems.length === 0;

        const curTask = this.authManager ? this.authManager.getTasks().find(t => t.id === this.state.activeTaskId) : null;
        const isDeadlineNear = isTaskExpired(curTask) || (curTask?.deadline && (new Date(curTask.deadline.replace(/-/g, '/')).getTime() - Date.now() <= 300000));

        if (!isAllDefenseDone && !isDeadlineNear) {
          const remainCount = unrespondedItems.length > 0 ? unrespondedItems.length : (items.length === 0 ? '答辩尚未就绪' : 0);
          alert(`⚠️ 无法确认答辩：目前仍有【${remainCount} 条】反方专家的学术质询尚未完成答辩陈述！\n\n请全组成员在下方答辩卡片录入答辩结论，或等待任务总时间临近结束（最后 5 分钟内）再进行确认。`);
          if (typeof showGlobalBannerNotice === 'function') {
            showGlobalBannerNotice('⚠️ 答辩尚未完成', `目前仍有 ${remainCount} 条学术质询待答辩，请先完成答辩陈述或等待临近结课再确认。`, 'warning', 6000);
          }
          return;
        }

        if (!s3.confirmedMembers) s3.confirmedMembers = {};
        s3.confirmedMembers[user] = true;
        const currMemObj = memberArr.find(m => m && (m.id === user || m.name === user));
        if (currMemObj) {
          if (currMemObj.id) s3.confirmedMembers[currMemObj.id] = true;
          if (currMemObj.name) s3.confirmedMembers[currMemObj.name] = true;
        }
        if (!s3._firstSignTimeMs) s3._firstSignTimeMs = Date.now();
        s3._lastSignTimeMs = Date.now();

        const confirmedCount = memberArr.filter(m => m && (s3.confirmedMembers[m.id] || (m.name && s3.confirmedMembers[m.name]))).length;
        const currUserObj = (this.authManager) ? this.authManager.getCurrentUser() : null;
        const memberName = currMemObj?.name || currUserObj?.name || '组员';

        const taskType = this.getCurrentTaskType();
        const isInst = (taskType === 'instructional');
        const chairSenderTitle = isInst ? '答辩委员会主席' : '中间委员';
        const docName = isInst ? '教学设计' : '论文';

        if (confirmedCount >= totalMembersCount) {
          s3.isRevisionConfirmed = true;
          const promptMsg = {
            sender: 'neutral',
            text: `🎉 【${chairSenderTitle}宣布】：恭喜！组内全员 ${totalMembersCount}/${totalMembersCount} 人已全部确认完成答辩！【修改${docName}终稿】面板已正式解锁！请组员切换至【📝 修改${docName}终稿】面板完善正文，修改完毕后由代表点击【🚀 提交${docName}终稿】完成归档！`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            _timeMs: Date.now() + 50
          };
          this.state.chatLogs.stage3.push(promptMsg);
          this.syncStage3();
          this.syncChatLogs();
          if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
          this.renderStudentWorkspace();
          renderChat(this.state);

          const autoKey = `jizhi_autoadvanced_${this.state.activeTaskId}_stage3_editor`;
          if (!sessionStorage.getItem(autoKey)) {
            sessionStorage.setItem(autoKey, '1');
            this.showStageMilestoneModal({
              icon: '📝',
              title: '全组成员已全部确认答辩与修改清单！',
              subtitle: `组内全员 (${totalMembersCount}/${totalMembersCount} 人) 已全部完成答辩辩护与裁决矩阵确认！答辩清单已定案归档，【修改${docName}终稿】面板已正式解锁！`,
              targetName: `修改${docName}终稿`,
              onProceed: () => {
                if (this.handlers && typeof this.handlers.onSwitchStage3Tab === 'function') {
                  this.handlers.onSwitchStage3Tab('editor');
                } else {
                  this.state.stage3.activeTab = 'editor';
                  this.renderStudentWorkspace();
                }
              }
            });
          } else {
            if (this.handlers && typeof this.handlers.onSwitchStage3Tab === 'function') {
              this.handlers.onSwitchStage3Tab('editor');
            }
          }
        } else {
          this.syncStage3();
          this.syncChatLogs();
          if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
          this.renderStudentWorkspace();
          renderChat(this.state);
          showGlobalBannerNotice('✅ 答辩确认成功', `您 (${memberName}) 已成功确认完成答辩！当前组内进度：${confirmedCount}/${totalMembersCount} 人已确认。全员确认后将自动解锁【修改${docName}终稿】。`, 'info', 6000);
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
        const taskType = this.getCurrentTaskType();
        const isInst = (taskType === 'instructional');
        const docName = isInst ? '教学设计' : '论文';
        const chairSenderTitle = isInst ? '答辩委员会主席' : '中间委员';

        if (this.state.isFinalSubmitted) {
          alert(`🔒 ${docName}终稿已于此前成功全员提交！目前处于全盘只读归档模式，可随时切页查阅各阶段记录。`);
          return;
        }
        const user = this.state.currentUser;
        const s3 = this.state.stage3;
        let memberArr = [];
        if (this.authManager) {
          const u = this.authManager.getCurrentUser();
          const effClassId = (this.authManager ? this.authManager.getEffectiveStudentClassId(u, this.state.activeTaskId) : (this.state.activeStudentClassId || u?.classId || null));
          const effGroup = this.authManager.getStudentActiveGroup(u, effClassId);
          const rawG = this.authManager.getGroupMembersForWorkspace(effGroup?.id || this.state.activeGroupId || null, effClassId);
          const authMembers = Array.isArray(rawG) ? rawG : Object.values(rawG || {});
          if (authMembers.length > 0) memberArr = authMembers;
        }
        if (memberArr.length === 0) {
          if (Array.isArray(this.state.members)) memberArr = this.state.members;
          else if (this.state.members && typeof this.state.members === 'object') memberArr = Object.values(this.state.members);
        }
        if (!Array.isArray(memberArr)) {
          memberArr = Object.values(memberArr || {});
        }
        const totalMembersCount = Math.max(memberArr.length, 2);

        if (!s3.finalSubmittedMembers) s3.finalSubmittedMembers = {};
        s3.finalSubmittedMembers[user] = true;
        const currMemObj = memberArr.find(m => m && (m.id === user || m.name === user));
        if (currMemObj) {
          if (currMemObj.id) s3.finalSubmittedMembers[currMemObj.id] = true;
          if (currMemObj.name) s3.finalSubmittedMembers[currMemObj.name] = true;
        }
        if (!s3._firstFinalSubmitTimeMs) s3._firstFinalSubmitTimeMs = Date.now();
        s3._lastFinalSubmitTimeMs = Date.now();

        const finalSubmittedCount = memberArr.filter(m => m && (s3.finalSubmittedMembers[m.id] || (m.name && s3.finalSubmittedMembers[m.name]))).length;
        const currUserObj = (this.authManager) ? this.authManager.getCurrentUser() : null;
        const memberName = currMemObj?.name || currUserObj?.name || '组员';
        const currentStage = this.state.currentStage || 'stage3';

        const submitMsg = {
          sender: user,
          senderName: memberName,
          text: `📢 [终稿提交确认]: 我 (${memberName}) 已确认提交${docName}终稿！（全组终稿提交确认进度: ${finalSubmittedCount}/${totalMembersCount} 人）`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          _timeMs: Date.now()
        };
        if (!this.state.chatLogs[currentStage]) this.state.chatLogs[currentStage] = [];
        this.state.chatLogs[currentStage].push(submitMsg);

        if (finalSubmittedCount >= totalMembersCount) {
          this.state.isFinalSubmitted = true;
          s3.isRevisionConfirmed = true;
          const currentUserObj = this.authManager ? this.authManager.getCurrentUser() : null;
          const activeTaskId = this.state.activeTaskId || null;
          const userGroupId = currentUserObj?.groupId || this.state.activeGroupId || this.cloudSyncEngine?.groupId || null;

          if (this.authManager && this.authManager.markAllTaskAnnouncementsRead) {
            this.authManager.markAllTaskAnnouncementsRead(activeTaskId, userGroupId);
          }

          const neutralFinalMsg = {
            sender: 'neutral',
            text: `🏆 【${chairSenderTitle}·答辩终审总结与祝贺】：热烈祝贺全组成员 (${totalMembersCount}/${totalMembersCount} 人) 已全部确认提交${docName}终稿！本组正文与答辩成果已正式全盘锁定归档呈递至教师端！请各位同学点击上方【📋 打开问卷填写界面】完成问卷！`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            _timeMs: Date.now() + 50
          };
          this.state.chatLogs[currentStage].push(neutralFinalMsg);

          this.syncStage3();
          this.syncChatLogs();
          if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
          this.renderStudentWorkspace();
          renderChat(this.state);

          showGlobalBannerNotice(`🏆 ${docName}终稿已全员提交归档`, `热烈祝贺组内全员 (${totalMembersCount}/${totalMembersCount} 人) 已全部完成${docName}终稿提交！请全组成员填写课程体验与 SSRL 评估问卷。`, 'success', 10000);
          setTimeout(() => {
            this.showQuestionnaireModal();
          }, 300);
        } else {
          this.syncStage3();
          this.syncChatLogs();
          if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
          this.renderStudentWorkspace();
          renderChat(this.state);

          alert(`✅ 您 (${memberName}) 已成功确认提交${docName}终稿！\n\n当前组内终稿提交确认进度：${finalSubmittedCount}/${totalMembersCount} 人已确认。\n⚠️ 必须全组所有成员均完成确认提交后，系统才会正式将终稿归档提交至教师端！请提醒组内其他同学尽快确认提交。`);
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
    if (!newContent || this.state.isFinalSubmitted || this.isCurrentTaskReadOnly()) return;
    const currentStage = this.state.currentStage;
    if (currentStage !== 'stage2') return;

    if (!this.state.stage2) this.state.stage2 = {};
    const s2 = this.state.stage2;
    if (!s2.reviewMilestone) s2.reviewMilestone = 'none';

    const membersList = Object.values(this.state.members || {});
    const logs = this.state.chatLogs[currentStage] || [];
    const now = Date.now();
    const lastReviewingMsg = logs.slice().reverse().find(m => m.sender === 'reviewingEditor');
    const timeSinceLastReviewing = lastReviewingMsg ? (now - (lastReviewingMsg._timeMs || 0)) : 999999;

    // ⏱️ 计算阶段二物理时间与字数水位线（中任务 0~150 分钟 / 4300 字，大任务 >150 分钟 / 9000 字）
    const allTasks = (this.authManager) ? this.authManager.getTasks() : [];
    const curTask = allTasks.find(t => t.id === this.state.activeTaskId);
    const times = (this.state.stage1 && this.state.stage1.contract && this.state.stage1.contract.timeAllocations) ? this.state.stage1.contract.timeAllocations : {};
    const totalPlannedMin = (times.background || 25) + (times.literature || 30) + (times.questions || 25) + (times.method || 40) + (times.reflection || 20) + (times.references || 10);
    const totalTaskMinutes = (curTask && (curTask.durationMinutes || curTask.duration)) ? Number(curTask.durationMinutes || curTask.duration) : (totalPlannedMin > 0 ? (totalPlannedMin / 0.70) : 150);
    
    // ⏱️ 严格三阶段基准比例：阶段一 13% | 阶段二 70% | 阶段三 17% (合计 100%)
    const s1BudgetMin = totalTaskMinutes * 0.13;
    const s2BaseBudgetMin = totalTaskMinutes * 0.70;
    
    // 计算阶段一实际耗时与时间转移（阶段一提前结束，结余时间 70% 注入阶段二正文起草，30% 注入阶段三答辩）
    const s1StartTime = this.state.timer?.startTimestamp || this.state.stage1StartTime || (this.state.stage1 && this.state.stage1.startTime) || (s2.startTime ? (s2.startTime - (s1BudgetMin * 60 * 1000)) : (now - 60000));
    const s1EndTime = s2.startTime || s2.stageStartTime || this.stage2StartTime || (this.state.stage1 && this.state.stage1._confirmedTime) || now;
    const s1ActualMin = Math.max(0, (s1EndTime - s1StartTime) / 60000);

    let stage2BudgetMin = s2BaseBudgetMin;
    if (s1ActualMin < s1BudgetMin) {
      // 💡 阶段一提前结束：多余的时间按 7:3 分配给阶段二和阶段三（阶段二分得 70%）
      const savedMin = s1BudgetMin - s1ActualMin;
      stage2BudgetMin = s2BaseBudgetMin + (savedMin * 0.70);
    } else {
      // ⚠️ 阶段一超时延迟：阶段二依然严格按照既定 70% 预算基准推进（后面时间没了就没了）
      stage2BudgetMin = s2BaseBudgetMin;
    }

    const taskDurMin = totalTaskMinutes;
    const isLargeTask = curTask && (curTask.scale === 'large' || curTask.type === 'large' || taskDurMin > 150 || (curTask.targetWordCount && Number(curTask.targetWordCount) >= 6000));
    const targetWordCount = (curTask && curTask.targetWordCount) ? Number(curTask.targetWordCount) : (isLargeTask ? 8000 : 3000);
    const rawDoc = newContent.replace(/<[^>]*>/g, '').trim();
    const wordProgress = targetWordCount > 0 ? (rawDoc.length / targetWordCount) : 0;

    const totalPlannedMs = Math.max(totalPlannedMin * 60 * 1000, stage2BudgetMin * 60 * 1000);
    const s2EntryTime = s2.startTime || s2.stageStartTime || this.stage2StartTime;
    const stage2DurationMs = s2EntryTime ? Math.max(0, now - s2EntryTime) : 0;
    const timeProgress = totalPlannedMs > 0 ? (stage2DurationMs / totalPlannedMs) : 0;

    const s2ChatList = this.state.chatLogs?.stage2 || [];

    // ═══════════════════════════════════════════════════════════════
    // 🛡️ 第一次学术质检（目标字数的 35% / 阶段二起草时间水位 35% · 破题把脉）
    // ═══════════════════════════════════════════════════════════════
    const isReview1Due = (wordProgress >= 0.35 || timeProgress >= 0.35 || rawDoc.length >= (targetWordCount * 0.35));
    
    // 严格判定真实一审消息（排除开场寄语、初审跟进提示、终审扫描）
    const isRealFirstReviewMsg = (m) => {
      if (!m || m.sender !== 'reviewingEditor') return false;
      const txt = m.text || '';
      if (txt.includes('开场寄语') || txt.includes('初审协同跟进') || txt.includes('初审跟进提示') || txt.includes('终稿行文扫描') || txt.includes('终审')) return false;
      return true;
    };

    let hasFirstReviewInLogs = s2ChatList.some(isRealFirstReviewMsg);

    if (!hasFirstReviewInLogs && s2.firstReviewText && s2.reviewMilestone === 'first_review_done') {
      // 已经生成过一审文本但当前 chatLogs 丢失：立即补入 chatLogs
      const taskType = this.getCurrentTaskType();
      const isInstTask = (taskType === 'instructional');
      const reviewerRoleName = isInstTask ? '备课组长' : '审稿编辑';
      const formattedFirstReview = (s2.firstReviewText.includes('一审') || s2.firstReviewText.includes('初审') || s2.firstReviewText.includes('破题把脉')) ? s2.firstReviewText : `📝 【${reviewerRoleName}·一审破题把脉】：\n${s2.firstReviewText}`;
      const firstReviewMsg = {
        sender: 'reviewingEditor',
        senderName: `学术质量 · ${reviewerRoleName}`,
        text: formattedFirstReview,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        _timeMs: Date.now()
      };
      if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
      this.state.chatLogs.stage2.push(firstReviewMsg);
      this.syncChatLogs();
      renderChat(this.state);
      hasFirstReviewInLogs = true;
    }

    if (!hasFirstReviewInLogs && isReview1Due && !this._isTriggeringFirstReview) {
      this._isTriggeringFirstReview = true;
      s2.reviewMilestone = 'first_review_in_progress';
      this.syncStage2();
      if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();

      const topic = (this.state.stage1 && this.state.stage1.mergedTitle) ? this.state.stage1.mergedTitle : '本组课题';
      const contentSnippet = rawDoc || '论文草稿已起草引言与文献综述';

      // 🌟 1. 立即挂载审稿编辑一审正在质检中动态状态框
      this.state.activeAgentAnalyzing = {
        icon: '📝',
        title: '【审稿编辑】正在进行初审破题把脉质检...',
        detail: '正在全量通读当前已起草的全部正文段落，以开篇破题为主线进行通盘学术把脉...'
      };
      this.renderStudentWorkspace();
      renderChat(this.state);

      setTimeout(async () => {
        try {
          await new Promise(r => setTimeout(r, 1500));
          const taskType = this.getCurrentTaskType();
          const isInstTask = (taskType === 'instructional');
          const reviewerRoleName = isInstTask ? '备课组长' : '审稿编辑';
          const genreDocName = isInstTask ? '教学设计' : '论文';
          const genreDesc = getGenrePromptDescriptor(taskType);
          const firstReviewPrompt = `${genreDesc}

【课题】：《${topic}》
【当前${genreDocName}正文已起草的实际草稿内容（全量通读）】：
${contentSnippet}

请作为${reviewerRoleName}，全面通读当前学生已起草的全部内容（写到哪审到哪，具体情况具体分析，【绝对严禁出现“分工”字眼】）：
1. 【正文实质性与进度评估】：
   - 若当前草稿字数极少（仅有零星几个字、测试字句或尚未实质性展开正文）：直接一针见血指出正文起草严重滞后，尚未形成实质性${genreDocName}框架，督促小组成员紧扣《${topic}》尽快展开开篇实质性起草；
   - 若已有实质性起草：以开篇立意/教学目标为主线，直截了当指出【哪里有什么问题 ➔ 怎么改】（不用过于冗长，精炼务实）；
2. 【分情况审查全文衔接】：
   - 若后续章节/教学活动已有起草：明确指出开头目标/立论与后续已写段落之间是否存在脱节；
   - 若后续章节尚未起草：重点把关开头的问题界定与学情目标是否精准，并给出后续展开的衔接要求；
3. 【语体规范与严密性】：若存在口语化表述或设计步骤含糊，精准指出并给出规范建议；

输出格式：清晰列出 1~2 条核心质检条目（每条包含：· 诊断问题：指出哪里有什么问题；· 改进建议：指出具体怎么改）。纯自然语言输出，120~160字。`;
          let firstReviewText = await callCozeAgentAPI('reviewingEditor', firstReviewPrompt, { stage: 'stage2', topic, actualDoc: contentSnippet, taskType });
          if (!firstReviewText || firstReviewText.trim().length === 0) {
            if (rawDoc.length < 50) {
              firstReviewText = `📝 【${reviewerRoleName}·一审破题把脉】：通读了全组目前的撰写进度，提出以下初审质检意见：\n①【起草进度与内容实质性】\n· 诊断问题：当前正文仅有零星字句，实质性${genreDocName}开篇框架尚未建立，起草进度明显滞后；\n· 改进建议：请全组成员抓紧时间，紧扣课题《${topic}》尽快起草第一部分${isInstTask ? '学情分析与教学目标' : '引言与核心研究问题'}，充实正文内容！`;
            } else {
              firstReviewText = `📝 【${reviewerRoleName}·一审破题把脉】：通读了全组目前起草的正文草稿，提出以下初审质检意见：\n①【立意与问题聚焦】\n· 诊断问题：文献综述梳理充分，但末尾未精准聚焦初中数学课例操作化的核心缺口（Research Gap）；\n· 改进建议：收拢综述结论，直接引出核心研究问题与假设。\n②【学术语体与术语口径】\n· 诊断问题：部分段落出现第一人称口语化表述，术语叫法略有出入；\n· 改进建议：统一全篇学术术语口径，采用规范学术第三人称。请全组参考后继续稳步撰写！`;
            }
          }
          s2.firstReviewText = firstReviewText;
          s2.reviewMilestone = 'first_review_done';

          const formattedFirstReview = (firstReviewText.includes('一审') || firstReviewText.includes('初审') || firstReviewText.includes('破题把脉')) ? firstReviewText : `📝 【${reviewerRoleName}·一审破题把脉】：\n${firstReviewText}`;
          const firstReviewMsg = {
            sender: 'reviewingEditor',
            senderName: `学术质量 · ${reviewerRoleName}`,
            text: formattedFirstReview,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            _timeMs: Date.now()
          };
          if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
          this.state.chatLogs.stage2.push(firstReviewMsg);
          this.syncChatLogs();
          this.syncStage2();
          if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
        } finally {
          this.state.activeAgentAnalyzing = null;
          this._isTriggeringFirstReview = false;
          renderChat(this.state);
          this.renderStudentWorkspace();
        }
      }, 500);
      return;
    }

    // ═══════════════════════════════════════════════════════════════
    // 🛡️ 第二次学术质检与编辑会议（目标字数的 70% / 阶段二起草时间水位 70% · 深度研讨）
    // ═══════════════════════════════════════════════════════════════
    const isMeetingDue = (hasFirstReviewInLogs || s2.reviewMilestone === 'first_review_done') && (wordProgress >= 0.70 || timeProgress >= 0.70 || rawDoc.length >= (targetWordCount * 0.70));
    const hasMeetingCalledInLogs = s2ChatList.some(m => m.sender === 'managingEditor' && (m.text.includes('半程会议号召') || m.text.includes('半程研讨号召')));
    if (hasMeetingCalledInLogs && s2.reviewMilestone !== 'meeting_called' && s2.reviewMilestone !== 'action_plan_generated') {
      s2.reviewMilestone = 'meeting_called';
      this.syncStage2();
    }

    if (!hasMeetingCalledInLogs && isMeetingDue && !this._isTriggeringMeetingCall) {
      this._isTriggeringMeetingCall = true;
      s2.reviewMilestone = 'meeting_called';
      s2.meetingStep = 'discussing_divergence';
      s2.meetingCalledTime = Date.now();

      const taskType = this.getCurrentTaskType();
      const isInst = (taskType === 'instructional');
      const managingName = isInst ? '备课组长' : '责任编辑';
      const docTypeNoun = isInst ? '教案' : '论文';

      const meetingCallMsg = {
        sender: 'managingEditor',
        senderName: managingName,
        text: `🤝 【${managingName}·半程研讨号召】：关注到全组${docTypeNoun}撰写已推进过半！请大家先暂停各自起草，花 1~2 分钟通读当前全篇草稿。重点审查：各章节逻辑是否连贯？前后构思是否存在脱节或分歧？\n👉 请大家在讨论区充分交流修改思路；商定差不多后，点击聊天框上方【💡 讨论差不多了？让${managingName}总结】按钮，我们将为大家提炼共识并下发《二审修正清单》！`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        _timeMs: now
      };
      if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
      this.state.chatLogs.stage2.push(meetingCallMsg);
      this.syncChatLogs();
      this.syncStage2();
      if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
      renderChat(this.state);
      this._isTriggeringMeetingCall = false;
      return;
    }

    // ═══════════════════════════════════════════════════════════════
    // 🤝 责任编辑 90% 节点收尾倒计时推进提醒（全场严格仅 1 次）
    // ═══════════════════════════════════════════════════════════════
    const is90TimeDue = hasMeetingCalledInLogs && (timeProgress >= 0.90);
    const has90ReminderInLogs = s2ChatList.some(m => m && m.sender === 'managingEditor' && (m.text?.includes('阶段二推进提示') || m.text?.includes('90% 节点') || m.text?.includes('收尾倒计时') || m.text?.includes('冲刺')));
    if (!has90ReminderInLogs && is90TimeDue && !s2.isDraftConfirmed && !this.state.s2_90ReminderSent) {
      this.state.s2_90ReminderSent = true;
      const taskType = this.getCurrentTaskType();
      const isInst = (taskType === 'instructional');
      const managingName = isInst ? '备课组长' : '责任编辑';
      const msg90 = {
        sender: 'managingEditor',
        senderName: `协同调度 · ${managingName}`,
        text: `🤝 【${managingName}·收尾倒计时冲刺】：阶段二协作时间已达 90% 冲刺节点！请全组抓紧将修改对策落实到正文中，核对无误后在上方点击【✍️ 确认初稿】，进入【🎓 阶段三：答辩评审】！`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        _timeMs: now
      };
      if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
      this.state.chatLogs.stage2.push(msg90);
      this.syncChatLogs();
      renderChat(this.state);
    }

    // ═══════════════════════════════════════════════════════════════
    // 🤝 责任编辑·协同关怀（正文展开后，基于成员实际写作贡献比的个性化点拨）
    // ═══════════════════════════════════════════════════════════════
    if (rawDoc.length >= 300 && membersList.length >= 2 && !hasMeetingCalledInLogs && !s2.isDraftConfirmed) {
      this.checkManagingEditorContribCare(rawDoc.length, membersList, s2ChatList);
    }
  }

  async checkManagingEditorContribCare(currentDocLen, membersList, logs) {
    if (this._isTriggeringContribCare) return;
    const now = Date.now();
    const isLargeTask = this.state.activeTaskScale === 'large';
    const ssrlCooldownMs = isLargeTask ? 480000 : 360000;
    
    // 🛡️ 贡献比协同关怀自身的 6~8 分钟常规冷却：若最近已下发过协同关怀，等待冷却结束
    const recentSsrlMsg = [...(logs || [])].reverse().find(m => m && m.sender === 'managingEditor' && (m.text?.includes('协同关怀') || m.text?.includes('贡献比')));
    if (recentSsrlMsg && (now - Number(recentSsrlMsg._timeMs || 0) < ssrlCooldownMs)) return;
    if (this.lastS2ContribNudgeTime && (now - this.lastS2ContribNudgeTime < ssrlCooldownMs)) return;
    if (this.state.stage2?.lastSSRLWarnTimeMs && (now - Number(this.state.stage2.lastSSRLWarnTimeMs) < ssrlCooldownMs)) return;

    const contribs = this.state.stage2?.memberContributions || {};
    const getVal = (m) => {
      if (!m) return 0;
      const keys = getUserAllKeys(m);
      let maxVal = 0;
      for (const k of keys) {
        if (contribs[k] !== undefined && Number(contribs[k]) > maxVal) {
          maxVal = Number(contribs[k]);
        }
      }
      return maxVal;
    };

    let totalContrib = 0;
    (membersList || []).forEach(m => { totalContrib += getVal(m); });
    const effectiveTotal = Math.max(totalContrib, currentDocLen || 0);
    if (effectiveTotal < 300) return;

    // 找出写作贡献显著偏低 (<= 15%) 的组员
    const lowMembers = [];
    (membersList || []).forEach(m => {
      const val = getVal(m);
      const pct = (effectiveTotal > 0) ? Math.round((val / effectiveTotal) * 100) : 0;
      if (pct <= 15) {
        lowMembers.push(m);
      }
    });

    if (lowMembers.length > 0 && lowMembers.length < (membersList || []).length) {
      this._isTriggeringContribCare = true;
      this.lastS2ContribNudgeTime = now;
      this.state.lastSSRLWarnTimeMs = now;
      if (this.state.stage2) this.state.stage2.lastSSRLWarnTimeMs = now;
      this.syncStage2();

      const targetMember = lowMembers[0];
      const targetName = targetMember.name || targetMember.id;
      const tasks = (this.state.stage1 && this.state.stage1.contract && this.state.stage1.contract.taskAssignments) ? this.state.stage1.contract.taskAssignments : {};
      const targetChapter = tasks[targetMember.id] || tasks[targetMember.name] || '负责的章节';

      const topic = (this.state.stage1 && this.state.stage1.mergedTitle) ? this.state.stage1.mergedTitle : '本组课题';
      const taskType = this.getCurrentTaskType();
      const isInst = (taskType === 'instructional');
      const managingName = isInst ? '备课组长' : '责任编辑';

      const contribPrompt = `小组正在协作撰写《${topic}》，目前全组总字数已达到 ${effectiveTotal} 字。
组员【${targetName}】主要聚焦在【${targetChapter}】，当前写作字数贡献占比偏低（≤ 15%）。
请作为${managingName}（过程学伴），发表 80~110 字的【动态写作关怀与共同思考点拨】：
① 用温和鼓励的语气提醒 ${targetName} 同学可以逐步动笔展开起草；
② 结合其主要聚焦的【${targetChapter}】，给出 1 个具体的学术起草切入建议；
③ 【核心红线要求】：同时提醒其主动通读同伴已起草的段落，从中汲取灵感并打通前后逻辑衔接；
④ 纯自然语言，80~110字，严禁指责，【绝对严禁出现“分工”字眼】，强调共同思考与协同衔接，严禁输出代码块，严禁添加按钮。`;

      let careText = `🤝 【${managingName}·协同关怀】：大家都在按节奏推进！主要聚焦【${targetChapter}】的 ${targetName} 同学也可以逐步动笔啦。建议可以先通读同伴已起草的段落，从中汲取灵感并打通前后逻辑衔接，遇到难点随时在研讨区抛出来，全组共同思考推进！`;

      try {
        const resp = await callCozeAgentAPI('managingEditor', contribPrompt, { stage: 'stage2', topic });
        if (resp && resp.trim().length > 0) {
          const cleanResp = resp.trim().replace(/^🤝\s*/, '').replace(/^[^\n]*?【[^】]+】[：:]?\s*/, '').trim();
          if (cleanResp.length > 10) {
            careText = `🤝 【${managingName}·协同关怀】：${cleanResp}`;
          }
        }
      } catch (e) {
        console.warn('Managing editor contrib care call failed:', e);
      } finally {
        this._isTriggeringContribCare = false;
      }

      const msg = {
        sender: 'managingEditor',
        senderName: `协同调度 · ${managingName}`,
        text: careText,
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



  showStageMilestoneModal({ icon = '🎉', title, subtitle, targetName, onProceed }) {
    const existingModal = document.querySelector('.modal-stage-milestone');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.className = 'modal-overlay modal-mask modal-stage-milestone';
    modal.style.cssText = 'position:fixed; inset:0; background:rgba(15,23,42,0.72); z-index:999999; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(6px); animation:fadeIn 0.25s ease-out; overscroll-behavior:contain;';
    
    let remainingSec = 5;
    modal.innerHTML = `
      <div style="background:#ffffff; width:92%; max-width:500px; border-radius:16px; box-shadow:0 24px 48px rgba(15,23,42,0.3); border:1px solid #cbd5e1; overflow:hidden; display:flex; flex-direction:column; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; text-align:center; overscroll-behavior:contain;">
        <div style="background:linear-gradient(135deg, #1e40af, #1e293b); padding:24px 20px 20px; color:#ffffff; display:flex; flex-direction:column; align-items:center;">
          <div style="width:56px; height:56px; border-radius:50%; background:rgba(255,255,255,0.15); display:flex; align-items:center; justify-content:center; font-size:28px; margin-bottom:12px; box-shadow:0 4px 12px rgba(0,0,0,0.15);">
            ${icon}
          </div>
          <div style="font-size:18px; font-weight:800; letter-spacing:0.3px; line-height:1.4;">${title}</div>
        </div>
        <div style="padding:22px 28px; font-size:14px; color:#334155; line-height:1.7;">
          <p style="margin:0 0 10px 0; font-weight:600; color:#0f172a;">${subtitle}</p>
          <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px; padding:10px 14px; font-size:12.5px; color:#166534; display:flex; align-items:center; justify-content:center; gap:6px;">
            <span>🔒 前序阶段内容已自动锁定为只读归档</span>
          </div>
        </div>
        <div style="padding:14px 24px 20px; background:#f8fafc; border-top:1px solid #e2e8f0; display:flex; justify-content:center;">
          <button id="btn-milestone-proceed" style="background:linear-gradient(135deg, #059669, #047857); border:none; color:#ffffff; padding:10px 28px; border-radius:10px; font-size:14px; font-weight:800; cursor:pointer; box-shadow:0 3px 12px rgba(5,150,105,0.3); display:flex; align-items:center; gap:8px;">
            <span>🚀 立即进入【${targetName}】</span>
            <span id="milestone-timer-badge" style="background:rgba(255,255,255,0.25); padding:2px 7px; border-radius:10px; font-size:12px;">${remainingSec}s</span>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    let isDone = false;
    let timerId = null;

    const proceed = () => {
      if (isDone) return;
      isDone = true;
      if (timerId) clearInterval(timerId);
      modal.remove();
      if (typeof onProceed === 'function') onProceed();
    };

    timerId = setInterval(() => {
      remainingSec--;
      const badge = modal.querySelector('#milestone-timer-badge');
      if (badge) badge.innerText = `${remainingSec}s`;
      if (remainingSec <= 0) {
        proceed();
      }
    }, 1000);

    modal.querySelector('#btn-milestone-proceed')?.addEventListener('click', proceed);
  }



  showMeetingModal() {
    const currUser = this.authManager ? this.authManager.getCurrentUser() : null;
    const userKey = currUser ? (currUser.name  || currUser.id) : this.state.currentUser;
    let actualGroupMembers = [];
    if (this.authManager) {
      const effClassId = this.state.activeStudentClassId || currUser?.classId || null;
      const effGroup = this.authManager.getStudentActiveGroup(currUser, effClassId);
      actualGroupMembers = this.authManager.getGroupMembersForWorkspace(effGroup?.id || this.state.activeGroupId || this.state.activeGroupId || null);
    }
    const membersList = actualGroupMembers.length > 0 ? actualGroupMembers : Object.values(this.state.members || {});
    const subs = this.state.stage2?.meetingSubmissions || {};
    const subCount = Object.keys(subs).length;
    const totalCount = membersList.length || 2;

    const existingSub = subs[userKey] || (currUser?.name && subs[currUser.name]) || (currUser?.id && subs[currUser.id]) || (currUser?.id && subs[currUser.id]) || (this.state.currentUser && subs[this.state.currentUser]);
    const isCurrentUserSubmitted = !!existingSub;

    const taskType = this.getCurrentTaskType();
    const isInst = (taskType === 'instructional');

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="teacher-modal-card" style="width:660px; max-height:85vh; display:flex; flex-direction:column;">
        <div class="teacher-modal-header ann-theme">
          <div class="modal-header-title"><span class="modal-icon">📢</span><div><h3>${isInst ? '集体备课室 ·【半程磨课研讨与教学质检会议】' : '学术编辑部 ·【半程全篇综合学术审计会议】'}</h3><p>${isInst ? '全篇互阅 · 教学构思对齐 · 环节贯通 · 目标闭环 · 攻克备课瓶颈' : '全篇互阅 · 构思对齐 · 前后贯通 · 文风统一 · 攻克瓶颈'}</p></div></div>
          <button class="modal-close-btn" id="btn-close-meeting">✕</button>
        </div>
        <div class="teacher-modal-body" style="overflow-y:auto; padding:16px 20px; display:flex; flex-direction:column; gap:12px;">
          <!-- 全组成员打卡状态矩阵胶囊 -->
          <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:8px 14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
            <span style="font-size:12px; font-weight:800; color:#1e40af;">👥 全组打卡进度 (${subCount}/${totalCount}人):</span>
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
              ${membersList.map(m => {
                const uid = String(m.id  || m.userId || '').trim();
                const isSub = !!(subs[uid] || subs[m.name] || (m.id && subs[m.id]));
                return `<span style="font-size:11px; padding:2px 8px; border-radius:10px; font-weight:700; background:${isSub ? '#ecfdf5' : '#ffffff'}; color:${isSub ? '#059669' : '#64748b'}; border:1px solid ${isSub ? '#a7f3d0' : '#cbd5e1'};">
                  ${isSub ? '✅' : '⏳'} ${escapeHtml(m.name)}: ${isSub ? '已打卡' : '待打卡'}
                </span>`;
              }).join('')}
            </div>
          </div>

          <!-- 1. 全篇综合自查审计 -->
          <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:10px; padding:14px 16px; display:flex; flex-direction:column; gap:12px;">
            <div style="font-size:13px; font-weight:800; color:#1e40af;">📋 一、全篇跨作者交叉审视自查（请通读全篇草稿并从整体协同视角打卡）</div>
            
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
                  ${isInst ? `
                    <label style="font-size:11.5px; color:#451a03; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="ideation-sec" value="一、教材与学情分析"> 【一、教材学情】</label>
                    <label style="font-size:11.5px; color:#451a03; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="ideation-sec" value="二、教学目标与重难点"> 【二、目标重难点】</label>
                    <label style="font-size:11.5px; color:#451a03; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="ideation-sec" value="三、情境创设与导入"> 【三、情境导入】</label>
                    <label style="font-size:11.5px; color:#451a03; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="ideation-sec" value="四、新知探究与建构"> 【四、新知探究】</label>
                    <label style="font-size:11.5px; color:#451a03; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="ideation-sec" value="五、巩固练习与评价"> 【五、巩固评价】</label>
                  ` : `
                    <label style="font-size:11.5px; color:#451a03; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="ideation-sec" value="一、研究背景与意义"> 【一、背景意义】</label>
                    <label style="font-size:11.5px; color:#451a03; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="ideation-sec" value="二、文献综述"> 【二、文献综述】</label>
                    <label style="font-size:11.5px; color:#451a03; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="ideation-sec" value="三、研究问题与假设"> 【三、问题假设】</label>
                    <label style="font-size:11.5px; color:#451a03; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="ideation-sec" value="四、研究设计与方法"> 【四、设计方法】</label>
                    <label style="font-size:11.5px; color:#451a03; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="ideation-sec" value="五、研究设计的不足与反思"> 【五、不足反思】</label>
                  `}
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
                  ${isInst ? `
                    <label style="font-size:11.5px; color:#1e3a8a; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="trans-div-sec" value="学情到目标 (第一至二章)"> 【第一至二章 (学情➔目标)】</label>
                    <label style="font-size:11.5px; color:#1e3a8a; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="trans-div-sec" value="目标到导入 (第二至三章)"> 【第二至三章 (目标➔导入)】</label>
                    <label style="font-size:11.5px; color:#1e3a8a; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="trans-div-sec" value="导入到探究 (第三至四章)"> 【第三至四章 (导入➔探究)】</label>
                    <label style="font-size:11.5px; color:#1e3a8a; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="trans-div-sec" value="探究到评价 (第四至五章)"> 【第四至五章 (探究➔评价)】</label>
                  ` : `
                    <label style="font-size:11.5px; color:#1e3a8a; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="trans-div-sec" value="背景到综述 (第一至二章)"> 【第一至二章 (背景➔综述)】</label>
                    <label style="font-size:11.5px; color:#1e3a8a; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="trans-div-sec" value="综述到假设 (第二至三章)"> 【第二至三章 (综述➔假设)】</label>
                    <label style="font-size:11.5px; color:#1e3a8a; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="trans-div-sec" value="假设到方法 (第三至四章)"> 【第三至四章 (假设➔方法)】</label>
                    <label style="font-size:11.5px; color:#1e3a8a; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="trans-div-sec" value="方法到反思 (第四至五章)"> 【第四至五章 (方法➔反思)】</label>
                  `}
                </div>
              </div>
            </div>

            <!-- Q3: 文风与专业术语 (3档) -->
            <div style="background:#ffffff; padding:10px 14px; border-radius:8px; border:1px solid #e2e8f0; display:flex; flex-direction:column; gap:6px;">
              <label style="font-size:12.5px; color:#1e293b; font-weight:700;">🎨 3. 【${isInst ? '教案规范与术语口径' : '文风与专业术语'}】全篇语言表述与规范词汇是否统一？</label>
              <select id="meeting-style-select" class="teacher-input" style="width:100%; padding:6px 10px; font-size:12px; border-radius:6px; border:1px solid #cbd5e1; background:#ffffff;">
                <option value="文风严谨术语统一">✅ 文风严谨规范（全篇均采用规范客观的学术/教案用语，动词与术语一致）</option>
                <option value="局部存在文风/术语割裂">🔄 局部存在割裂（部分章节偏口语化，或同一术语/目标动词前后不统一）</option>
                <option value="文风口语化严重/术语混乱">⚠️ 口语化严重/术语混乱（多处章节使用“我们觉得”等第一人称口语，规范度不足）</option>
              </select>
              <div id="meeting-style-sections-box" style="background:#f5f3ff; padding:8px 12px; border-radius:6px; border:1px solid #ddd6fe; display:none; flex-direction:column; gap:4px; margin-top:4px;">
                <label style="font-size:11.5px; color:#6d28d9; font-weight:700;">🎨 针对第 3 题：您觉得哪些章节需要重点润色或统一规范？(可多选)</label>
                <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:2px;">
                  ${isInst ? `
                    <label style="font-size:11.5px; color:#4c1d95; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="style-div-sec" value="一、教材与学情分析"> 【一、教材学情】</label>
                    <label style="font-size:11.5px; color:#4c1d95; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="style-div-sec" value="二、教学目标与重难点"> 【二、目标重难点】</label>
                    <label style="font-size:11.5px; color:#4c1d95; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="style-div-sec" value="三、情境创设与导入"> 【三、情境导入】</label>
                    <label style="font-size:11.5px; color:#4c1d95; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="style-div-sec" value="四、新知探究与建构"> 【四、新知探究】</label>
                    <label style="font-size:11.5px; color:#4c1d95; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="style-div-sec" value="五、巩固练习与评价"> 【五、巩固评价】</label>
                  ` : `
                    <label style="font-size:11.5px; color:#4c1d95; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="style-div-sec" value="一、研究背景与意义"> 【一、背景意义】</label>
                    <label style="font-size:11.5px; color:#4c1d95; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="style-div-sec" value="二、文献综述"> 【二、文献综述】</label>
                    <label style="font-size:11.5px; color:#4c1d95; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="style-div-sec" value="三、研究问题与假设"> 【三、问题假设】</label>
                    <label style="font-size:11.5px; color:#4c1d95; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="style-div-sec" value="四、研究设计与方法"> 【四、设计方法】</label>
                    <label style="font-size:11.5px; color:#4c1d95; display:flex; align-items:center; gap:4px;"><input type="checkbox" name="style-div-sec" value="五、研究设计的不足与反思"> 【五、不足反思】</label>
                  `}
                </div>
              </div>
            </div>
          </div>

          <!-- Q4: 核心通俗瓶颈自查 -->
          <div style="background:#ffffff; border:1px solid #cbd5e1; border-radius:10px; padding:12px 16px; display:flex; flex-direction:column; gap:6px;">
            <label style="font-size:12.5px; font-weight:700; color:#0f172a;">💡 4. 【核心瓶颈自查】当前全篇最让大家卡壳、最难写的是什么？(单选)</label>
            <select id="meeting-bottleneck-academic" class="teacher-input" style="width:100%; padding:6px 10px; font-size:12px; border-radius:6px; border:1px solid #cbd5e1; background:#ffffff;">
              ${isInst ? `
                <option value="学情与目标脱节：教学目标不够具体，与学情分析对应不紧密">学情与目标脱节：教学目标不够具体，与学情分析对应不紧密</option>
                <option value="新知探究设计单薄：探究环节师生互动不足、学生活动缺乏有效支架">新知探究设计单薄：探究环节师生互动不足、学生活动缺乏有效支架</option>
                <option value="教学过程衔接生硬：情境导入到核心探究、新知讲授到巩固练习之间过渡不自然">教学过程衔接生硬：情境导入到核心探究、新知讲授到巩固练习之间过渡不自然</option>
                <option value="评价与作业针对性弱：缺少针对目标的过程性评价量规，作业分层不清晰">评价与作业针对性弱：缺少针对目标的过程性评价量规，作业分层不清晰</option>
              ` : `
                <option value="方法与问题不搭：不知道该怎么设计方法/量表来回答前面的研究问题">方法与问题不搭：不知道该怎么设计方法/量表来回答前面的研究问题</option>
                <option value="理论与文献不足：找不到足够的文献依据，理论支撑单薄">理论与文献不足：找不到足够的文献依据，理论支撑单薄</option>
                <option value="方案步骤不清晰：不知道具体的研究对象、实施过程该怎么写具体">方案步骤不清晰：不知道具体的研究对象、实施过程该怎么写具体</option>
                <option value="局限与反思卡壳：不知道该怎么客观分析方案的不足和潜在问题">局限与反思卡壳：不知道该怎么客观分析方案的不足和潜在问题</option>
              `}
            </select>
          </div>

          <!-- Q5: 整体质量打星 -->
          <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:12px 16px; display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:12.5px; font-weight:700; color:#0f172a;">🌟 5. 【整体质量自评】全篇整体质量与设计严谨度打分：</span>
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
            <input id="meeting-input-text" class="teacher-input" style="width:100%; padding:6px 10px; font-size:12px; border-radius:6px; border:1px solid #cbd5e1; box-sizing:border-box;" placeholder="${isInst ? '例如：在第4章探究环节增加学生小组互动的支架，并规范第2章教学目标动词...' : '例如：在第4章方法中补齐针对第3章假设的测量维度，并统一第1章口语化表述...'}">
          </div>
        </div>
        <div class="teacher-modal-footer" style="padding:12px 20px; border-top:1px solid #e2e8f0; display:flex; justify-content:flex-end; gap:10px;">
          <button class="modal-btn cancel" id="btn-cancel-meeting">关闭</button>
          <button class="modal-btn submit ann-theme" id="btn-submit-meeting" ${isCurrentUserSubmitted ? 'disabled style="background:#ecfdf5; border:1px solid #a7f3d0; color:#059669; font-weight:800; cursor:default; box-shadow:none;"' : ''}>
            ${isCurrentUserSubmitted ? '✅ 您已完成打卡 (已提交)' : `🚀 提交打卡并由${isInst ? '教研专家' : '审稿编辑'}生成【二审修正清单】`}
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
    modal.querySelectorAll('#star-rating-logic .star').forEach(s => {
      s.addEventListener('click', (e) => {
        overallRating = Number(e.target.dataset.val);
        modal.querySelectorAll('#star-rating-logic .star').forEach(st => {
          const v = Number(st.dataset.val);
          st.style.color = v <= overallRating ? '#f59e0b' : '#475569';
        });
      });
    });

    modal.querySelector('#btn-submit-meeting').addEventListener('click', async () => {
      const ideationConsistency = modal.querySelector('#meeting-ideation-select')?.value || '完全符合最初构思';
      const transitionState = modal.querySelector('#meeting-transition-select')?.value || '前后衔接非常自然';
      const styleState = modal.querySelector('#meeting-style-select')?.value || '文风严谨术语统一';
      const bAcademic = modal.querySelector('#meeting-bottleneck-academic')?.value || '';
      const userText = modal.querySelector('#meeting-input-text')?.value.trim() || '';
      const ideationSections = Array.from(modal.querySelectorAll('input[name="ideation-sec"]:checked')).map(cb => cb.value);
      const transSections = Array.from(modal.querySelectorAll('input[name="trans-div-sec"]:checked')).map(cb => cb.value);
      const styleSections = Array.from(modal.querySelectorAll('input[name="style-div-sec"]:checked')).map(cb => cb.value);
      const currUser = this.authManager ? this.authManager.getCurrentUser() : null;
      const userKey = currUser ? (currUser.name  || currUser.id) : this.state.currentUser;
      const memberName = currUser ? currUser.name : (this.state.members[userKey]?.name || userKey);

      // 🛡️ 真实组员人数：从 authManager 严格获取当前工作区绑定的组内真实学生列表
      let actualGroupMembers = [];
      if (this.authManager) {
        const effClassId = this.state.activeStudentClassId || currUser?.classId || null;
        const effGroup = this.authManager.getStudentActiveGroup(currUser, effClassId);
        actualGroupMembers = this.authManager.getGroupMembersForWorkspace(effGroup?.id || this.state.activeGroupId || this.state.activeGroupId || null);
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
        closeModal();
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
      const hasDivergence = hasIdeationDev || hasTransDev || hasStyleDev;

      const primaryAcademicB = allSubs[0].bAcademic || '方法与问题对齐与实施设计';
      const questionsList = allSubs.filter(s => s.userText).map(s => `“${s.userText}”`).join('；') || '暂无补充提问';

      let transFocusText = allTransSecs.length > 0 ? allTransSecs.map(s => `【${s}】`).join('、') : '【假设 ↔ 方法】';
      let ideationFocusText = allIdeationSecs.length > 0 ? allIdeationSecs.map(s => `【${s}】`).join('、') : '部分核心章节';
      let styleFocusText = allStyleSecs.length > 0 ? allStyleSecs.map(s => `【${s}】`).join('、') : '【一、背景与意义】与【三、研究问题与假设】';

      this.state.stage2.hasMeetingDivergence = hasDivergence;
      this.state.stage2.divergenceDetails = {
        hasIdeationDev,
        hasTransDev,
        hasStyleDev,
        ideationFocusText,
        transFocusText,
        styleFocusText,
        primaryAcademicB
      };

      this.syncStage2();
      if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
      this.renderStudentWorkspace();

      alert(`✅ 你 (${memberName}) 已成功提交半程自查与互阅打卡！\n\n目前组内已打卡：${submittedCount}/${totalMembersCount} 人。\n全组成员已集齐！责任编辑正在右侧研讨区梳理全组自查认知分歧，请稍候...`);

      this.state.activeAgentAnalyzing = {
        icon: '🤝',
        title: '【责任编辑】正在分析全组自查打卡与一致性分歧...',
        detail: '正在深度整合全组自查反馈、偏离脱节章节与瓶颈诉求，梳理研讨对齐焦点...'
      };
      renderChat(this.state);
      this.renderStudentWorkspace();
      await new Promise(r => setTimeout(r, 1500));

      const avgOverallRating = (allSubs.reduce((sum, s) => sum + (s.overallRating || 5), 0) / (allSubs.length || 1)).toFixed(1);
      const taskType = this.getCurrentTaskType();
      const isInst = (taskType === 'instructional');
      const managingName = isInst ? '备课组长' : '责任编辑';
      const reviewingName = isInst ? '教研专家' : '审稿编辑';

      const genreDesc = getGenrePromptDescriptor(taskType);
      const managingPrompt = `${genreDesc}

【全组半程自查打卡真实汇报数据】：
- 构思偏离/目标脱节环节：${hasIdeationDev ? ideationFocusText : '无'}
- 前后逻辑脱节环节：${hasTransDev ? transFocusText : '无'}
- 语言语体/术语规范问题环节：${hasStyleDev ? styleFocusText : '无'}
- 组员反馈的核心瓶颈：${primaryAcademicB}
- 组员自查填写的具体聚焦诉求：${questionsList}
- 质量自评均分：${avgOverallRating} 星

请作为责任编辑（过程学伴），发表 120~150 字的【自查研判与一致性研讨号召】：
① 肯定全组成员已完成自查互阅打卡；
② 【全部如实说明·绝不隐瞒】：全面、客观梳理组员在自查中汇报的各项脱节痛点（凡是学生汇报的脱节痛点如：${transFocusText}、${primaryAcademicB} 等，均须全部逐一说明，绝不遗漏）；
③ 【号召一致性研讨】：号召全组成员在讨论区围绕上述脱节环节展开深度对齐研讨，商定统一的衔接方案；商定差不多后点击下方【💡 讨论差不多了？让责任编辑总结】！
（纯自然语言输出，120~150字，【绝对严禁出现“分工”字眼】）`;

      let managingText = '';
      try {
        managingText = await callCozeAgentAPI('managingEditor', managingPrompt, { stage: 'stage2', topic, bottleneck: primaryAcademicB, taskType });
      } catch (e) {
        console.warn('managingEditor divergence analysis error:', e);
      } finally {
        this.state.activeAgentAnalyzing = null;
        renderChat(this.state);
      }
      if (!managingText || managingText.trim().length === 0) {
        managingText = `🤝 【${managingName}·自查研判与对齐引导】：全员自查打卡已完成！汇总全组反馈，提炼出核心焦点：
  1. 🎯 构思与脱节焦点：${hasIdeationDev ? `部分成员反馈 ${ideationFocusText} 偏离了最初设想；` : ''}${hasTransDev ? `多数成员明确指出了前后脱节（重点涉及 ${transFocusText}）；` : '全篇前后衔接顺畅；'}
  2. 🎨 语言规范与术语口径：${hasStyleDev ? `组内指出 ${styleFocusText} 存在口语化表述与术语混用；` : '全篇语言严谨规范，'}整体质量自评给出了 ${avgOverallRating} 星的高分！
  3. 💡 核心瓶颈：全组聚焦在『${primaryAcademicB}』。
💡 请小组成员先在讨论区围绕上述脱节章节商量对齐修改思路。商量差不多后，请点击【💡 讨论差不多了？让${managingName}总结】按钮！`;
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
    if (this._isTriggeringSecondReview || this.isCurrentTaskReadOnly()) return;
    const ctx = this.state.stage2?.pendingReviewing || this.state.stage2PendingReviewing;
    if (!ctx) return;
    this._isTriggeringSecondReview = true;
    if (this.state.stage2) this.state.stage2.pendingReviewing = null;
    this.state.stage2PendingReviewing = null;
    this.syncStage2();

    const taskType = this.getCurrentTaskType();
    const isInst = (taskType === 'instructional');
    const managingName = isInst ? '备课组长' : '责任编辑';
    const reviewingName = isInst ? '教研专家' : '审稿编辑';

    // 1. 备课组长/责任编辑出场做【一致性研讨小结】并交棒 (支持大模型针对具体讨论内容的深度研判总结)
    const managingText = customManagingSummary || `🤝 【${managingName}·一致性研讨小结】：太好了，看到全组已经在讨论区对齐了修改主线！下面有请${reviewingName}通读全文草稿，为大家进行深度${isInst ? '教研质检' : '学术质检'}，并下发【3 项半程修正清单】！`;
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

    const reviewingPrompt = `【全篇正文草稿】：
${fullDoc}

【半程会议研讨与暴露的瓶颈】：
- 核心卡壳瓶颈：『${ctx.bAcademic}』
- 前后脱节焦点：${ctx.transFocus}
- 口语化/文风章节：${ctx.styleFocus}

请依据审稿编辑角色与审查红线（顺应已有框架、绝不推翻大改、方案形态绝不索要数据图表），发表 120~150 字【二审修正清单】（必须包含 3 项具体可执行要点，纯自然语言，末尾提示商定后点击下方【📝 讨论差不多了？让审稿编辑总结】）。`;

    let reviewingText = await callCozeAgentAPI('reviewingEditor', reviewingPrompt, { stage: 'stage2', topic: ctx.topic, bottleneck: ctx.bAcademic, actualDoc: fullDoc, priorReview: priorFirstReview });
    if (!reviewingText || reviewingText.trim().length === 0) {
      reviewingText = `📝 【审稿编辑·二审修正清单】：通读了大家的方案草稿，结合大家在半程会议中汇报的核心瓶颈与攻克点：
①【前后闭环】：第三章提出的核心假设，在第四章测量工具中缺少对应题目，请补齐对应的测量题目或实施指标，别让假设悬空；
②【润色文风】：通读 ${ctx.styleFocus}，消除“我们觉得”等口语，统一润色为规范客观的第三人称学术语体；
③【预判不足】：在第五章实事求是地反思方案在样本抽样与实施工具上的潜在局限。
👉 3 项【修正清单】已在正文上方就位！请全组商定落实策略，讨论差不多后点击下方【📝 讨论差不多了？让审稿编辑总结】！`;
    }
    this.state.stage2SecondReviewText = reviewingText;
    this.state.stage2.reviewMilestone = 'checklist_issued';
    this.state.stage2PendingReviewing = null;
    if (this.state.stage2) this.state.stage2.pendingReviewing = null;

    // 🌟 动态生成包含三大高含金量支柱的【半程修正清单】(支持交互勾选)
    this.state.stage2.actionPlan = {
      isGenerated: true,
      completedMap: {},
      items: isInst ? [
        `🎯【消除前后脱节与教学分歧】(重点关注: ${ctx.transFocus}): 完善第四章新知探究与建构，确保能有效达成前文制定的教学目标与突破重难点，消除“两张皮”脱节硬伤，使教学主线一贯到底！`,
        `✍️【统一语言文风与教学术语】(重点关注: ${ctx.styleFocus}): 通读全篇，消除口语化随意表达，润色为规范严谨的教学设计规范语体，统一全篇核心概念与活动设计命名。`,
        `💡【攻克瓶颈与反思评价冲刺】: 按照自查瓶颈（${ctx.bAcademic}），细化教学活动实施，并在第五、六章深入完善巩固练习评价与板书反思，把控节奏，准备初稿定稿！`
      ] : [
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

  /**
   * 🔄 强制刷新并即时解锁【半程修正清单】卡片 (从全量聊天记录智能提取 3 项清单)
   */
  forceRefreshActionPlan() {
    if (!this.state.stage2) this.state.stage2 = {};
    const s2 = this.state.stage2;
    const allChatLogs = [
      ...(this.state.chatLogs?.stage1 || []),
      ...(this.state.chatLogs?.stage2 || []),
      ...(this.state.chatLogs?.stage3 || [])
    ];
    // 严格仅匹配审稿编辑下发的【二审修正清单】，坚决排除修改决议与讨论总结
    const revMsg = allChatLogs.find(m => m && m.text && (m.text.includes('二审修正清单') || m.text.includes('半程编辑修正清单') || m.text.includes('半程修正清单')) && !m.text.includes('修改落实决议') && !m.text.includes('修改落实要点'));
    
    let parsedItems = [];
    if (revMsg && revMsg.text) {
      let bodyText = revMsg.text;
      const headerMatch = bodyText.match(/(?:二审修正清单|半程编辑修正清单|半程修正清单)[】:：\s]*/);
      if (headerMatch) {
        bodyText = bodyText.slice(headerMatch.index + headerMatch[0].length);
      }
      bodyText = bodyText.replace(/[👉\s]*请大家围绕.*$/s, '')
                         .replace(/[👉\s]*请全组围绕.*$/s, '')
                         .replace(/[👉\s]*讨论差不多.*$/s, '')
                         .replace(/[👉\s]*点击下方.*$/s, '')
                         .trim();

      const chunks = bodyText.split(/(?=[①②③]|\b[123]\.|(?=[一二三]是))/g).map(c => c.trim()).filter(Boolean);
      chunks.forEach(c => {
        let clean = c.replace(/^[①②③\d\.\s\(\)一二三是]+/, '').replace(/[；;。]\s*$/, '').trim();
        if (clean.length > 5) {
          parsedItems.push(clean);
        }
      });
    }
    if (parsedItems.length > 0) {
      s2.actionPlan = {
        isGenerated: true,
        completedMap: (s2.actionPlan && s2.actionPlan.completedMap) || {},
        items: parsedItems.slice(0, 3)
      };
      s2.meetingStep = 'discussing_checklist';
      this.syncStage2();
      if (this.cloudSyncEngine) this.cloudSyncEngine.pushSnapshot();
      this.renderStudentWorkspace();
    }
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
