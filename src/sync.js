/**
 * JIZHI (集智) Platform - Real-Time Cloud Sync Engine
 * Standard ES Module (ESM)
 */

import { InitialState, STORAGE_KEY_TASKS } from './constants.js?v=20260904_v2511';
import { getCaretCharacterOffsetWithin, setCaretPositionWithin, isTaskExpired, showGlobalBannerNotice, showTaskExtendedUnlockModal, isSameUser, getUserAllKeys, getUserFromMap, liftEtherpadReadonly } from './utils.js?v=20260904_v2511';

export class CloudSyncEngine {
  constructor(app) {
    this.app = app;
    this.lastTimestamp = 0;
    this.isPushing = false;
    this.pendingPushCount = 0;
    this.isInitialPullDone = false;
    this.isLoggingOut = false;
    this.pollTimer = null;
    this._knownTaskDeadlines = {};
    this.updateScopeKeys();
    this.initPolling();
    this.initGlobalBroadcast();
  }

  getEffectiveGroupId() {
    const user = this.app.authManager ? this.app.authManager.getCurrentUser() : null;
    const isTeacher = user && (user.isTeacher || user.role === 'teacher');
    if (isTeacher) {
      return this.app.state.activeMonitorGroupId || this.app.state.activeGroupId || null;
    }
    const effectiveClassId = (this.app?.authManager ? this.app.authManager.getEffectiveStudentClassId(user, this.app?.state?.activeTaskId) : (this.app?.state?.activeStudentClassId || user?.classId || null));
    const activeGroupObj = this.app.authManager ? this.app.authManager.getStudentActiveGroup(user, effectiveClassId) : null;
    return this.app.state.activeGroupId || activeGroupObj?.id || user?.groupId || null;
  }

  updateScopeKeys() {
    const isTeacher = this.app.authManager?.getCurrentUser()?.role === 'teacher';
    const user = this.app.authManager?.getCurrentUser();
    const effectiveClassId = (isTeacher ? this.app.state.activeClassId : this.app.state.activeStudentClassId) || user?.classId || null;
    const groupId = this.getEffectiveGroupId();
    let taskId = (this.app.state.activeTaskId) ? this.app.state.activeTaskId : `task_${effectiveClassId}_default`;
    if (taskId === 'task_default' || !taskId) {
      taskId = `task_${effectiveClassId}_default`;
    }
    this.groupId = groupId;
    this.taskId = taskId;
    this.effectiveClassId = effectiveClassId;
    if (this.app && this.app.state) {
      this.app.state.activeTaskId = taskId;
      this.app.state.activeStudentClassId = effectiveClassId;
    }
    this.storageKey = `jizhi_cloud_snapshot_v10_pure_${effectiveClassId}_${taskId}_${groupId}`;
    this.syncEndpoints = [
      `sync.php?taskId=${taskId}&groupId=${groupId}&classId=${effectiveClassId}`
    ];

    if ('BroadcastChannel' in window) {
      try {
        if (this.bc) { try { this.bc.close(); } catch (e) {} }
        this.bc = new BroadcastChannel(`jizhi_bc_${effectiveClassId}_${this.taskId}_${this.groupId}`);
        this.bc.onmessage = (e) => {
          if (e.data && e.data.snapshot) this.handleRemoteSync(e.data.snapshot);
          if (e.data && e.data.chatMessage) {
            const cm = e.data.chatMessage;
            const stg = e.data.stage || this.app.state.currentStage || 'stage1';
            if (!this.app.state.chatLogs) this.app.state.chatLogs = { stage1: [], stage2: [], stage3: [] };
            if (!Array.isArray(this.app.state.chatLogs[stg])) this.app.state.chatLogs[stg] = [];
            const exists = this.app.state.chatLogs[stg].some(m => (cm.id && m.id === cm.id) || (m._timeMs === cm._timeMs && m.text === cm.text));
            if (!exists) {
              this.app.state.chatLogs[stg].push(cm);
              if (typeof window.renderChat === 'function') window.renderChat(this.app.state);
            }
          }
        };
      } catch (e) {}
    }
  }

  initGlobalBroadcast() {
    if ('BroadcastChannel' in window) {
      try {
        if (this.globalBc) { try { this.globalBc.close(); } catch (e) {} }
        this.globalBc = new BroadcastChannel('jizhi_global_events');
        this.globalBc.onmessage = (e) => {
          if (e.data && e.data.type === 'task_extended' && e.data.task) {
            const t = e.data.task;
            this._knownTaskDeadlines[t.id] = t.deadline;
            if (this.app.authManager) {
              const localTasks = this.app.authManager.getTasks();
              const idx = localTasks.findIndex(lt => lt && (lt.id === t.id || (lt.title && lt.title === t.title)));
              if (idx >= 0) {
                localTasks[idx] = { ...localTasks[idx], ...t, deadline: t.deadline, durationMinutes: t.durationMinutes || localTasks[idx].durationMinutes, lastExtension: t.lastExtension };
              } else {
                localTasks.push(t);
              }
              try { localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(localTasks)); } catch (err) {}
            }
            this.handleTaskDeadlineChange(t, e.data.prevDeadline);
          }
        };
      } catch (e) {}
    }
  }

  handleTaskDeadlineChange(t, prevDeadline) {
    const isTeacherPortalUI = !!document.querySelector('.app-teacher-mode') || !!document.querySelector('.teacher-portal-layout');
    
    // 🛡️ 仅当当前标签页正处于教师管理大屏时，才不给自己弹窗；学生端（及学生视角）100% 触发弹窗
    if (isTeacherPortalUI) return;

    const currUser = this.app.authManager ? this.app.authManager.getCurrentUser() : null;
    if (!currUser || currUser.role === 'teacher') return;

    // 🛡️ 严格班级隔离校验：校验该学生是否真正属于被延期任务所在的班级（多班级归属自动穿透，非本班学生绝对不弹窗）
    const userClassIds = Array.isArray(currUser.classIds) ? currUser.classIds : (currUser.classId ? [currUser.classId] : []);
    const taskClassIds = Array.isArray(t.targetClassIds) ? t.targetClassIds : (t.classId ? [t.classId] : ['all']);
    const isStudentInTargetClass = taskClassIds.includes('all') || userClassIds.some(cid => taskClassIds.includes(cid));
    if (!isStudentInTargetClass) return;

    // ⚡ 立即同步到本地任务存储，确保后续渲染工作台时读取到权威的新截止时间
    if (this.app.authManager) {
      const localTasks = this.app.authManager.getTasks();
      const idx = localTasks.findIndex(lt => lt && (lt.id === t.id || (lt.title && lt.title === t.title)));
      if (idx >= 0) {
        localTasks[idx] = { ...localTasks[idx], ...t, deadline: t.deadline, durationMinutes: t.durationMinutes || localTasks[idx].durationMinutes, lastExtension: t.lastExtension };
      } else {
        localTasks.push(t);
      }
      try { localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(localTasks)); } catch (err) {}
    }

    let shownEvents = {};
    try { shownEvents = JSON.parse(sessionStorage.getItem('jizhi_shown_deadline_events') || '{}'); } catch (e) {}
    const eventKey = `${t.id}_${t.deadline}`;
    const isNoticeAlreadyShown = !!shownEvents[eventKey];
    shownEvents[eventKey] = true;
    try { sessionStorage.setItem('jizhi_shown_deadline_events', JSON.stringify(shownEvents)); } catch (e) {}

    const prevExpired = isTaskExpired(prevDeadline);
    const nowExpired = isTaskExpired(t.deadline);
    const isWorkspace = (this.app.state.studentViewMode === 'workspace' || !!document.getElementById('chat-stream') || !!document.querySelector('.app-layout'));
    const badgeText = document.querySelector('.brand-badge')?.innerText || '';
    const isCurrentTask = isWorkspace && (
      !this.app.state.activeTaskId ||
      this.app.state.activeTaskId === t.id ||
      (t.title && this.app.state.activeTaskId === t.title) ||
      (t.id && t.id.includes('default')) ||
      (this.app.state.activeTaskId && this.app.state.activeTaskId.includes('default')) ||
      (t.title && badgeText.includes(t.title))
    );
    const isTaskHall = !isWorkspace || this.app.state.studentViewMode === 'task_list';
    const extDurationStr = t.lastExtension?.extendDurationStr || (t.lastExtension?.addedMinutes ? `（增加了 ${t.lastExtension.addedMinutes} 分钟）` : '');

    if (isCurrentTask) {
      // 🎯 场景 1：学生正处于该任务工作台内部
      // 🛡️ 严格保护：仅解除当前未完成阶段的只读锁（已完成的历史阶段如阶段一公约、阶段二初稿始终保持只读锁定）
      if (!nowExpired) {
        const isS2Done = this.app.state.groupMaxStage === 'stage3' || (this.app.state.stage2?.isDraftConfirmed && this.app.state.currentStage === 'stage3');
        const isS3FinalDone = this.app.state.isFinalSubmitted;
        
        if (!isS2Done) {
          const f2 = document.getElementById('stage2-etherpad-frame');
          if (f2) {
            liftEtherpadReadonly(f2);
          }
        }
        if (!isS3FinalDone) {
          const f3 = document.getElementById('stage3-etherpad-frame');
          if (f3) {
            liftEtherpadReadonly(f3);
          }
        }
      }
      // ⏱️ 立即就地刷新顶部倒计时与工作台画布状态（移除过期横幅与只读锁，恢复可操作按钮）
      if (typeof this.app.renderHeader === 'function') {
        this.app.renderHeader();
      }
      if (typeof this.app.renderStudentWorkspace === 'function') {
        this.app.renderStudentWorkspace(true);
      }
      if (!isNoticeAlreadyShown) {
        showGlobalBannerNotice(
          '⏳ 任务截止时间已延长',
          `任课教师已将当前任务《${t.title || '协作写作'}》截止时间延长至 ${t.deadline} ${extDurationStr}！协作通道已畅通。`,
          'info',
          8000
        );
      }
    } else if (isTaskHall) {
      // 📋 场景 2：学生在任务大厅（就地刷新大厅任务卡片，滑出顶部通知横幅）
      this.app.renderMain();
      if (!isNoticeAlreadyShown) {
        showGlobalBannerNotice(
          '⏳ 任务延期提醒',
          `班级写作任务《${t.title || '协作任务'}》截止时间已延长至 ${t.deadline} ${extDurationStr}！`,
          'info',
          8000
        );
      }
    } else {
      // ✍️ 场景 3：学生在其他任务工作台内（当前写作 100% 保持稳定，仅顶部滑出通知横幅）
      if (!isNoticeAlreadyShown) {
        showGlobalBannerNotice(
          '⏳ 其他任务延期',
          `您的另一项写作任务《${t.title || '写作任务'}》截止时间已延长至 ${t.deadline} ${extDurationStr}。`,
          'info',
          8000
        );
      }
    }
  }

  initSSE() {}
  refreshScopeKeys() {
    this.updateScopeKeys();
  }

  // 🌿 独立轻量在线心跳：仅上报当前用户在线状态，物理隔离绝不触碰全量协作数据
  async sendPresencePing(userObj = null) {
    if (this.isLoggingOut) return;
    this.updateScopeKeys();
    const currentUser = userObj || (this.app.authManager ? this.app.authManager.getCurrentUser() : null);
    if (!currentUser) return;
    const userKey = String(currentUser.id || '').trim();
    if (!userKey) return;

    try {
      const url = `sync.php?action=presence_ping&taskId=${encodeURIComponent(this.taskId)}&groupId=${encodeURIComponent(this.groupId)}&classId=${encodeURIComponent(this.effectiveClassId || null)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userKey,
          name: currentUser.name || userKey,
          role: currentUser.role || 'student',
          timestamp: Date.now()
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.presence && typeof data.presence === 'object') {
          this.app.state.presence = { ...(this.app.state.presence || {}), ...data.presence };
          if (typeof window.renderChat === 'function') window.renderChat(this.app.state);
          this.app.renderPresenceCursors();
        }
      }
    } catch (e) {}
  }

  _getLastChatTimeMs() {
    let maxMs = 0;
    const logs = this.app?.state?.chatLogs || {};
    ['stage1', 'stage2', 'stage3'].forEach(stg => {
      if (Array.isArray(logs[stg])) {
        logs[stg].forEach(m => {
          const t = Number(m?._timeMs || 0);
          if (t > maxMs) maxMs = t;
        });
      }
    });
    return maxMs;
  }

  initPolling() {
    this.pullFromServer();
    this.sendPresencePing(); // ⚡ 进入工作台 0ms 瞬间首发上线心跳，告别等待
    // ⚡ 动静分级智能心跳与轮询阶梯（平衡实时协同与服务器开销）：
    // • 活跃态 (< 2分钟有操作): 轮询 1.5s，心跳 8s (轻量精准，彻底杜绝 PHP 进程池拥塞)
    // • 静止态 (> 2分钟无操作): 轮询 10s，心跳 20s
    // • 息屏态 (切后台/休眠): 轮询 20s，心跳 40s
    let lastUserActivity = Date.now();
    const markActive = () => {
      const wasIdle = (Date.now() - lastUserActivity > 120000);
      lastUserActivity = Date.now();
      if (wasIdle && !this.isLoggingOut) {
        this.sendPresencePing();
        this.pullFromServer();
      }
    };
    ['mousemove', 'keydown', 'touchstart', 'scroll', 'click'].forEach(evt => {
      window.addEventListener(evt, markActive, { passive: true });
    });

    const isHidden = () => document.hidden || document.visibilityState === 'hidden';
    const isIdle = () => isHidden() || (Date.now() - lastUserActivity > 120000);
    const getPollInterval = () => (isHidden() ? 20000 : (isIdle() ? 10000 : 1500));
    const getPingInterval = () => (isHidden() ? 40000 : (isIdle() ? 20000 : 8000));

    const runPoll = () => {
      if (this.isLoggingOut) return;
      this.pullFromServer().finally(() => {
        if (this.isLoggingOut) return;
        this.pollTimer = setTimeout(runPoll, getPollInterval());
      });
    };
    this.pollTimer = setTimeout(runPoll, 100);

    let lastPingTime = Date.now();
    const runPing = () => {
      if (this.isLoggingOut) return;
      const now = Date.now();
      const pInterval = getPingInterval();
      if (now - lastPingTime >= pInterval) {
        lastPingTime = now;
        this.sendPresencePing().finally(() => {
          if (this.isLoggingOut) return;
          this.pingTimer = setTimeout(runPing, 5000);
        });
      } else {
        this.pingTimer = setTimeout(runPing, 5000);
      }
    };
    this.pingTimer = setTimeout(runPing, 8000);

    window.addEventListener('storage', (e) => {
      if (e.key === this.storageKey && e.newValue) {
        try { this.handleRemoteSync(JSON.parse(e.newValue)); } catch (err) {}
      }
    });

    // 🌟 多场景感知：当切回标签页或重新获得窗口焦点时，0毫秒瞬间发送心跳并拉取全量
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && !this.isLoggingOut) {
        markActive();
        lastPingTime = Date.now();
        this.sendPresencePing();
        this.pullFromServer();
      }
    });
    window.addEventListener('focus', () => {
      if (!this.isLoggingOut) {
        markActive();
        lastPingTime = Date.now();
        this.sendPresencePing();
        this.pullFromServer();
      }
    });

    // 🚪 页面关闭/退出时立即发送离线信标，秒级通知教师端
    window.addEventListener('beforeunload', () => {
      try {
        const currentUser = this.app.authManager ? this.app.authManager.getCurrentUser() : null;
        if (currentUser) {
          const userKey = String(currentUser.id || '').trim();
          const effectiveClassId = this.effectiveClassId || currentUser.classId || null;
          const beaconUrl = `sync.php?action=presence_leave&taskId=${encodeURIComponent(this.taskId)}&groupId=${encodeURIComponent(this.groupId)}&classId=${encodeURIComponent(effectiveClassId)}`;
          if (navigator.sendBeacon) {
            navigator.sendBeacon(beaconUrl, JSON.stringify({ userId: userKey }));
          }
        }
      } catch (e) {}
    });
  }

  // 🛡️ 停止轮询并标记登出，供登出流程调用，彻底终止短轮询循环
  stopPolling() {
    this.isLoggingOut = true;
    if (this.pollTimer) { clearTimeout(this.pollTimer); this.pollTimer = null; }
    if (this.pingTimer) { clearTimeout(this.pingTimer); this.pingTimer = null; }
  }

  async pullFromServer() {
    if (this.isPulling || this.isLoggingOut) return;
    this.isPulling = true;
    this.updateScopeKeys();

    const currentUser = this.app.authManager ? this.app.authManager.getCurrentUser() : null;
    const userKey = currentUser ? currentUser.id : '';
    const sessToken = currentUser ? (currentUser.activeSessionId || currentUser.token || currentUser.sessionToken || '') : '';
    const lastRev = this._lastKnownRevisionId || 0;
    const lastChatMs = this._getLastChatTimeMs();
    const metaVer = this._lastKnownMetaVer || 0;
    const incGlobal = this._hasPulledGlobal ? 0 : 1;

    try {
      for (const endpoint of this.syncEndpoints) {
        try {
          const sep = endpoint.includes('?') ? '&' : '?';
          const url = `${endpoint}${sep}userId=${encodeURIComponent(userKey)}&sessToken=${encodeURIComponent(sessToken)}&lastRev=${lastRev}&lastChatMs=${lastChatMs}&metaVer=${metaVer}&incGlobal=${incGlobal}&nocache=${Date.now()}`;
          const res = await fetch(url, { cache: 'no-store' });
          if (res.ok) {
            const data = await res.json();
            this.isInitialPullDone = true;
            if (data && data.kicked) {
              this.isLoggingOut = true;
              this.stopPolling();
              this.app.authManager.logout();
              alert('⚠️ 您的账号已在另一台设备登录，当前页面已自动下线。');
              this.app.renderMain();
              return;
            }
            if (data && (data.unchanged || data.timestamp !== undefined || data.chatLogs || data.stage1 || data.stage2 || data.presence || data.locks)) {
              this.handleRemoteSync(data);
              return;
            }
          }
        } catch (err) {
          console.warn('[SyncEngine] Pull endpoint warning:', err);
        }
      }
    } catch (err) {
      console.error('[SyncEngine] pullFromServer fatal error:', err);
    } finally {
      this.isPulling = false;
    }
  }

  async pushSnapshot() {
    this.updateScopeKeys();
    const groupId = this.groupId;

    // 🛡️ 严格读优先防空门禁：只有在【已完成初次拉取】时才允许推送全量快照，彻底杜绝冷启动空内存反向冲刷
    if (!this.isInitialPullDone) {
      return;
    }

    const snapshot = {
      timestamp: Date.now(),
      groupId: groupId,
      revisionId: this.lastRevisionId || 0,
      members: this.app.state.members,
      presence: this.app.state.presence || {},
      chatLogs: this.app.state.chatLogs,
      stage1: this.app.state.stage1,
      stage2: this.app.state.stage2,
      stage3: this.app.state.stage3,
      stepConfirmations: this.app.state.stepConfirmations || {},
      timer: this.app.state.timer,
      currentStage: this.app.state.groupMaxStage || this.app.state.currentStage,
      isFinalSubmitted: this.app.state.isFinalSubmitted
    };

    this.lastTimestamp = snapshot.timestamp;
    const bodyStr = JSON.stringify(snapshot);

    if (this.bc) { try { this.bc.postMessage({ snapshot }); } catch (e) {} }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try { this.ws.send(JSON.stringify({ snapshot })); } catch (e) {}
    }

    if (this.isPushing) { this.pendingPushCount++; return; }
    this.isPushing = true;
    try {
      await Promise.allSettled(this.syncEndpoints.map(url =>
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: bodyStr
        }).then(r => r.json()).catch(() => null)
      ));
    } catch (e) {
    } finally {
      this.isPushing = false;
      if (this.pendingPushCount > 0) { this.pendingPushCount = 0; this.pushSnapshot(); }
    }
  }

  handleRemoteSync(remoteData) {
    if (!remoteData) return;

    // ⚡ 极速轻量处理 Delta 响应（仅更新心跳与聚焦锁，0 耗费 CPU/网络，带宽节省 99.8%）
    if (remoteData.unchanged) {
      if (remoteData.serverTimestamp) {
        this.app.state.serverTimestamp = Number(remoteData.serverTimestamp);
      }
      if (remoteData.revisionId !== undefined) {
        this._lastKnownRevisionId = remoteData.revisionId;
      }
      if (remoteData.metaVer !== undefined && remoteData.metaVer !== this._lastKnownMetaVer) {
        this._lastKnownMetaVer = remoteData.metaVer;
        if (this.app && this.app.authManager && this.app.authManager.pullGlobalMeta) {
          this.app.authManager.pullGlobalMeta().then(() => {
            if (this.app.state.studentViewMode === 'workspace' && this.app.state.activeTaskId) {
              const allTasks = this.app.authManager.getTasks();
              const isCurrentTaskAlive = allTasks.some(t => t.id === this.app.state.activeTaskId);
              if (!isCurrentTaskAlive && !this.app._isHandlingTaskRevoked) {
                this.app.showTaskRevokedModal(this.app.state.activeTaskTitle || '当前写作任务');
              }
            }
          }).catch(() => {});
        }
      }
      this._hasPulledGlobal = true;
      if (remoteData.presence) {
        let incomingPr = (typeof remoteData.presence === 'object' && !Array.isArray(remoteData.presence)) ? remoteData.presence : {};
        this.app.state.presence = { ...(this.app.state.presence || {}), ...incomingPr };
        if (typeof window.renderChat === 'function') window.renderChat(this.app.state);
        this.app.renderPresenceCursors();
      }
      if (remoteData.locks !== undefined) {
        this.app.state.fieldLocks = remoteData.locks || {};
      }
      return;
    }

    const user = this.app.authManager ? this.app.authManager.getCurrentUser() : null;
    const myGroupId = this.getEffectiveGroupId();

    if (remoteData.groupId && remoteData.groupId !== myGroupId && user?.role === 'student') return;

    if (remoteData.metaVer !== undefined) {
      this._lastKnownMetaVer = remoteData.metaVer;
    }

    if (remoteData.users || remoteData.tasks || remoteData.referencePapers) {
      this._hasPulledGlobal = true;
    }

    // 更新本地已知的服务端 revisionId 和 metaVer（每次拉到数据都对齐，彻底打通 Delta 差量通道）
    if (remoteData.revisionId !== undefined) {
      this._lastKnownRevisionId = remoteData.revisionId;
    }
    if (remoteData.metaVer !== undefined) {
      this._lastKnownMetaVer = remoteData.metaVer;
    }
    this._hasPulledGlobal = true;

    // 🌐 服务端全局教务与文献资源同步到本地（tasks/users/classes/announcements/referencePapers）
    // 教师一旦发布新范文或公告，学生端在任务工作台内 1~2 秒内自动无感对齐更新
    if (this.app.authManager) {
      if (Array.isArray(remoteData.tasks) && remoteData.tasks.length > 0) {
        const localTasks = this.app.authManager.getTasks();
        const mergedTasks = remoteData.tasks.map(remoteT => {
          const localT = localTasks.find(lt => lt.id === remoteT.id || (lt.title && lt.title === remoteT.title));
          if (localT && localT.lastExtension) {
            const localExtAt = localT.lastExtension.extendedAt || 0;
            const remoteExtAt = remoteT.lastExtension ? (remoteT.lastExtension.extendedAt || 0) : 0;
            if (localExtAt >= remoteExtAt) {
              return { ...remoteT, deadline: localT.deadline, durationMinutes: localT.durationMinutes, lastExtension: localT.lastExtension };
            }
          }
          return remoteT;
        });
        localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(mergedTasks));

        mergedTasks.forEach(t => {
          if (!t || !t.id) return;
          const oldDeadline = this._knownTaskDeadlines[t.id];
          if (oldDeadline !== undefined && t.deadline && oldDeadline !== t.deadline) {
            this._knownTaskDeadlines[t.id] = t.deadline;
            this.handleTaskDeadlineChange(t, oldDeadline);
          } else if (oldDeadline === undefined && t.lastExtension && (Date.now() - (t.lastExtension.extendedAt || 0) < 180000)) {
            this._knownTaskDeadlines[t.id] = t.deadline;
            this.handleTaskDeadlineChange(t, '');
          } else if (t.deadline) {
            this._knownTaskDeadlines[t.id] = t.deadline;
          }
        });
      }
      if (Array.isArray(remoteData.users) && remoteData.users.length > 0) {
        const key = 'jizhi_pure_v10_users_db';
        const localStr = localStorage.getItem(key) || '[]';
        const remoteStr = JSON.stringify(remoteData.users);
        if (localStr !== remoteStr) localStorage.setItem(key, remoteStr);
      }
      try {
        if (Array.isArray(remoteData.classes) && remoteData.classes.length > 0) {
          const key = 'jizhi_pure_v10_classes_db';
          const localStr = localStorage.getItem(key) || '[]';
          const remoteStr = JSON.stringify(remoteData.classes);
          if (localStr !== remoteStr) localStorage.setItem(key, remoteStr);
        }
        if (Array.isArray(remoteData.announcements) && remoteData.announcements.length > 0) {
          const key = 'jizhi_pure_v10_ann_db';
          const local = JSON.parse(localStorage.getItem(key) || '[]');
          const remoteIds = new Set(remoteData.announcements.map(a => a.id));
          const merged = [...remoteData.announcements];
          local.forEach(l => { if (l && l.id && !remoteIds.has(l.id)) merged.push(l); });
          // 最多保留最新 15 条轻量通知，杜绝 Base64 塞满配额
          const trimmed = merged.slice(0, 15);
          localStorage.setItem(key, JSON.stringify(trimmed));
          localStorage.setItem('jizhi_pure_v10_announcements', JSON.stringify(trimmed));

          // ⚡ 实时无感刷新顶部红点与未读通知弹窗
          if (this.app && typeof this.app.renderHeader === 'function') {
            this.app.renderHeader();
          }
          if (this.app && typeof this.app.checkUnreadAnnouncements === 'function') {
            this.app.checkUnreadAnnouncements();
          }
        }
        if (Array.isArray(remoteData.referencePapers) && remoteData.referencePapers.length > 0) {
          const key = 'jizhi_reference_papers_db';
          const local = JSON.parse(localStorage.getItem(key) || '[]');
          const localIds = new Set(local.map(p => p && p.id));
          const remoteIds = new Set(remoteData.referencePapers.map(p => p.id));
          const merged = [...remoteData.referencePapers];
          local.forEach(l => { if (l && l.id && !remoteIds.has(l.id)) merged.push(l); });
          const trimmed = merged.slice(0, 20);
          localStorage.setItem(key, JSON.stringify(trimmed));
          localStorage.setItem('jizhi_pure_v10_ref_papers_db', JSON.stringify(trimmed));

          // ⚡ 实时检查是否有新文献下发并提醒
          const newPapers = remoteData.referencePapers.filter(p => p && p.id && !localIds.has(p.id));
          if (newPapers.length > 0 && this.app && this.app.state && this.app.state.studentViewMode === 'workspace') {
            const newest = newPapers[0];
            showGlobalBannerNotice(
              '📚 收到新参考范文',
              `任课教师刚刚发布了学术示范文献《${newest.title || '参考范文'}》，已存入范文库！可随时点击【📚 查阅参考范文】研读。`,
              'info',
              8000
            );
            const refBtn = document.getElementById('btn-view-reference-papers') || document.querySelector('.btn-view-ref-papers');
            if (refBtn) {
              refBtn.innerText = `📚 查阅参考范文 (${trimmed.length}篇)`;
            }
          }
        }
      } catch (err) {
        // 存储超限时自动修剪历史旧快照与冗余缓存
        try {
          if (this.app?.authManager?._pruneStorageQuota) this.app.authManager._pruneStorageQuota();
        } catch (e) {}
      }
    }

    // 🛡️ 教师重置功能已废除，纯净同步阶段协作数据，绝对不误踢正在协作的学生
    this._hasInitialPullCompleted = true;
    this.isInitialPullDone = true;

    if (remoteData.timestamp || remoteData.serverTimestamp) {
      this.app.state.serverTimestamp = Number(remoteData.serverTimestamp || remoteData.timestamp);
    }

    if (remoteData.presence) {
      let incomingPr = {};
      if (typeof remoteData.presence === 'object' && !Array.isArray(remoteData.presence)) {
        incomingPr = remoteData.presence;
      } else if (Array.isArray(remoteData.presence)) {
        remoteData.presence.forEach((item, idx) => {
          if (item) {
            const k = item.id || item.userId || idx;
            incomingPr[k] = item;
          }
        });
      }
      this.app.state.presence = { ...(this.app.state.presence || {}), ...incomingPr };
      this.app.renderPresenceCursors();
    }

    // 🛡️ 保护本组成员名单不被后端的空数组冲刷覆盖
    if (remoteData.members && (Array.isArray(remoteData.members) ? remoteData.members.length > 0 : Object.keys(remoteData.members).length > 0)) {
      this.app.state.members = remoteData.members;
    } else if (!this.app.state.members || (Array.isArray(this.app.state.members) ? this.app.state.members.length === 0 : Object.keys(this.app.state.members).length === 0)) {
      if (this.app.authManager) {
        this.app.state.members = this.app.authManager.getGroupMembersForWorkspace(this.groupId);
      }
    }

    // ⚡ 天然随快照无缝更新通知与文献库，无损合并保留本地新增
    if (Array.isArray(remoteData.announcements) && remoteData.announcements.length > 0) {
      try {
        const key = 'jizhi_pure_v10_ann_db';
        const local = JSON.parse(localStorage.getItem(key) || '[]');
        const remoteIds = new Set(remoteData.announcements.map(a => a.id));
        const merged = [...remoteData.announcements];
        local.forEach(l => { if (l && l.id && !remoteIds.has(l.id)) merged.push(l); });
        localStorage.setItem(key, JSON.stringify(merged));
        localStorage.setItem('jizhi_announcements_db', JSON.stringify(merged));
      } catch (e) {}
    }
    if (Array.isArray(remoteData.referencePapers) && remoteData.referencePapers.length > 0) {
      try {
        const key = 'jizhi_reference_papers_db';
        const local = JSON.parse(localStorage.getItem(key) || '[]');
        const remoteIds = new Set(remoteData.referencePapers.map(p => p.id));
        const merged = [...remoteData.referencePapers];
        local.forEach(l => { if (l && l.id && !remoteIds.has(l.id)) merged.push(l); });
        localStorage.setItem(key, JSON.stringify(merged));
        localStorage.setItem('jizhi_pure_v10_ref_papers_db', JSON.stringify(merged));
      } catch (e) {}
    }

    if (remoteData.isFinalSubmitted !== undefined) {
      const oldLockState = !!this.app.state.isFinalSubmitted;
      const newLockState = !!remoteData.isFinalSubmitted;
      
      if (oldLockState !== newLockState) {
        this.app.state.isFinalSubmitted = newLockState;
        const currUser = this.app.authManager ? this.app.authManager.getCurrentUser() : null;
        const isStudent = currUser && (currUser.role === 'student' || currUser.isStudent);
        
        // 仅在已完成冷启动拉取、且处于工作台时，当教师在后台主动变更锁定时才弹出提醒
        if (this._hasInitialPullCompleted && isStudent && this.app.state.studentViewMode === 'workspace') {
          document.querySelectorAll('.lock-notify-modal').forEach(el => el.remove());
          const lockModal = document.createElement('div');
          lockModal.className = 'modal-overlay lock-notify-modal';
          lockModal.innerHTML = `
            <div style="width:460px; max-width:92vw; background:#ffffff; border-radius:14px; box-shadow:0 20px 25px -5px rgba(0,0,0,0.25); border:1px solid #e2e8f0; overflow:hidden; animation:modalFadeIn 0.25s ease;">
              <div style="background:${newLockState ? 'linear-gradient(135deg, #dc2626, #b91c1c)' : 'linear-gradient(135deg, #059669, #047857)'}; color:white; padding:16px 20px; font-size:16px; font-weight:800; display:flex; align-items:center; gap:8px;">
                <span>${newLockState ? '🔒 写作任务已全局锁定' : '🔓 写作任务已恢复编辑权限'}</span>
              </div>
              <div style="padding:20px; font-size:13.5px; color:#334155; line-height:1.6;">
                ${newLockState
                  ? '指导教师已将本组整个写作任务设为【全局归档锁定】！当前工作台所有阶段（阶段一公约、阶段二正文撰写、阶段三答辩矩阵）已全盘转为<b>只读模式</b>（不能继续修改编辑），如需继续修改请联系指导教师解锁。'
                  : '指导教师已【恢复本组写作任务编辑权限】！当前工作台所有阶段已重新开放，小组可以继续协作撰写与修改文稿。'}
              </div>
              <div style="padding:12px 20px; background:#f8fafc; border-top:1px solid #e2e8f0; text-align:right;">
                <button id="btn-close-lock-modal" style="background:${newLockState ? '#dc2626' : '#059669'}; color:white; border:none; padding:8px 20px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer;">
                  我知道了
                </button>
              </div>
            </div>
          `;
          document.body.appendChild(lockModal);
          lockModal.querySelector('#btn-close-lock-modal').addEventListener('click', () => lockModal.remove());

          this.app.renderStudentWorkspace(true);
        }
      }
      this._hasInitialPullCompleted = true;
    }

    if (remoteData.chatLogs) {
      if (!this.app.state.chatLogs) this.app.state.chatLogs = { stage1: [], stage2: [], stage3: [] };
      ['stage1', 'stage2', 'stage3'].forEach(stg => {
        let remoteLogs = Array.isArray(remoteData.chatLogs[stg]) ? remoteData.chatLogs[stg] : [];
        const localLogs = Array.isArray(this.app.state.chatLogs[stg]) ? this.app.state.chatLogs[stg] : [];
        
        // 🛡️ 智能保留本地未决思考气泡与 10 秒内未落库临时消息（防吞防闪烁）
        const now = Date.now();
        const localPending = localLogs.filter(m => {
          if (!m) return false;
          if (m.isThinking) return true;
          const isRecent = (now - (m._timeMs || 0) < 10000);
          if (!isRecent) return false;
          const existsInRemote = remoteLogs.some(rm => (rm.id && rm.id === m.id) || (rm._timeMs === m._timeMs && rm.text === m.text));
          return !existsInRemote;
        });

        // 🛡️ 全局过滤掉临时占位思考气泡，杜绝残留
        remoteLogs = remoteLogs.filter(m => !m || (!String(m.id).startsWith('thinking_eval') && !m.isThinking));

        let baseLogs = remoteLogs;
        if (stg === 'stage1') {
          // 🛡️ 阶段一清洗重复套娃前缀与去重
          const seenPropEvals = new Set();
          const successfulTitles = new Set();

          // 1. 先统计所有已成功生成的评估标题
          remoteLogs.forEach(m => {
            if (m && m.sender === 'auctioneer' && (m.text || '').includes('提案评估') && !((m.text || '').includes('网络提醒'))) {
              const match = (m.text || '').match(/《([^》]+)》/);
              if (match) successfulTitles.add(match[1]);
            }
          });

          // 2. 过滤掉已被成功替代的旧网络提醒气泡，并对多余的同提案速评进行去重
          baseLogs = [];
          for (let i = remoteLogs.length - 1; i >= 0; i--) {
            const m = remoteLogs[i];
            if (!m) continue;
            let t = m.text || '';

            // 如果该提案已经评估成功，清除历史的网络提醒
            if (m.sender === 'auctioneer' && t.includes('网络提醒')) {
              const match = t.match(/《([^》]+)》/);
              if (match && successfulTitles.has(match[1])) {
                continue; // 彻底隐藏过期的错误重试气泡
              }
            }

            if (t.includes('【拍卖师·选题速评】') && t.includes('【学术拍卖师·提案')) {
              t = t.replace(/^(?:🎪|🏛️)?\s*【(?:学术拍卖师|拍卖师)[·\s]*(?:选题速评|提案速评|提案评估|落槌与方案研讨)?】[：:]\s*/g, '');
              t = t.replace(/^(?:🎪|🏛️)?\s*【(?:学术拍卖师|拍卖师)[·\s]*(?:选题速评|提案速评|提案评估|落槌与方案研讨)?】[：:]\s*/g, '');
              t = `🏛️ 【学术拍卖师·提案评估】：${t.trim()}`;
              m.text = t;
            }

            // 同一提案标题的成功速评只保留最新一条
            if (m.sender === 'auctioneer' && t.includes('提案评估') && !t.includes('网络提醒')) {
              const match = t.match(/《([^》]+)》/);
              const propKey = match ? match[1] : t.substring(0, 30);
              if (seenPropEvals.has(propKey)) {
                continue;
              }
              seenPropEvals.add(propKey);
            }

            baseLogs.unshift(m);
          }
        } else if (stg === 'stage2') {
          const deduped = [];
          let seenFirstReview = false;
          let seenMeetingCall = false;
          let seenFinalReview = false;
          let seenWelcome = false;
          remoteLogs.forEach(m => {
            if (!m) return;
            const snd = m.sender || '';
            const txt = m.text || '';
            if (snd === 'reviewingEditor' && (txt.includes('初审') || txt.includes('初审微调') || txt.includes('破题把脉') || txt.includes('Research Gap'))) {
              if (seenFirstReview) return;
              seenFirstReview = true;
            }
            if (snd === 'managingEditor' && (txt.includes('半程会议号召') || txt.includes('半程研讨号召'))) {
              if (seenMeetingCall) return;
              seenMeetingCall = true;
            }
            if (snd === 'reviewingEditor' && txt.includes('终稿行文扫描')) {
              if (seenFinalReview) return;
              seenFinalReview = true;
            }
            if (snd === 'managingEditor' && (txt.includes('起草提示') || txt.includes('进度关怀'))) {
              if (seenWelcome) return;
              seenWelcome = true;
            }
            deduped.push(m);
          });
          baseLogs = deduped;
        } else if (stg === 'stage3') {
          const deduped = [];
          let seenStage3Prop = false;
          let seenStage3Opp = false;
          let seenStage3Welcome = false;
          let seenStage3ChairGuide = false;
          remoteLogs.forEach(m => {
            if (!m) return;
            const snd = m.sender || '';
            const txt = m.text || '';
            if (snd === 'proponent' && (txt.includes('正方委员') || txt.includes('立论支持') || txt.includes('通读全篇'))) {
              if (seenStage3Prop) return;
              seenStage3Prop = true;
            }
            if (snd === 'opponent' && (txt.includes('反方委员') || txt.includes('商讨质询') || txt.includes('尖锐质询'))) {
              if (seenStage3Opp) return;
              seenStage3Opp = true;
            }
            if (snd === 'neutral' && (txt.includes('中间委员开场') || txt.includes('欢迎来到【阶段三'))) {
              if (seenStage3Welcome) return;
              seenStage3Welcome = true;
            }
            if (snd === 'neutral' && (txt.includes('答辩思路引导') || txt.includes('质询 ①'))) {
              if (seenStage3ChairGuide) return;
              seenStage3ChairGuide = true;
            }
            deduped.push(m);
          });
          baseLogs = deduped;
        }

        // 合并 baseLogs 与 localPending
        const mergedList = [...baseLogs];
        localPending.forEach(lp => {
          const exists = mergedList.some(m => (lp.id && m.id === lp.id) || (m._timeMs === lp._timeMs && m.text === lp.text));
          if (!exists) mergedList.push(lp);
        });

        // 稳健补全缺省 senderName
        const allUsers = this.app.authManager ? this.app.authManager.getUsers() : [];
        const membersList = Array.isArray(this.app.state.members) ? this.app.state.members : Object.values(this.app.state.members || {});
        const _isSame = (typeof isSameUser === 'function') ? isSameUser : (a, b) => {
          if (!a || !b) return false;
          const k1 = typeof a === 'object' ? (a.id || a.name) : a;
          const k2 = typeof b === 'object' ? (b.id || b.name) : b;
          return k1 && k2 && String(k1).trim().toLowerCase() === String(k2).trim().toLowerCase();
        };
        mergedList.forEach(m => {
          if (!m.senderName && m.sender) {
            const matchedU = allUsers.find(u => _isSame(u, m.sender) || u.id === m.sender);
            if (matchedU && matchedU.name) m.senderName = matchedU.name;
            else {
              const matchedM = membersList.find(mem => _isSame(mem, m.sender) || mem.id === m.sender);
              if (matchedM && matchedM.name) m.senderName = matchedM.name;
            }
          }
        });

        mergedList.sort((a, b) => (a._timeMs || 0) - (b._timeMs || 0));
        this.app.state.chatLogs[stg] = mergedList;
      });
      if (typeof window.renderChat === 'function') window.renderChat(this.app.state);
      if (typeof window.renderChatActionBar === 'function') window.renderChatActionBar(this.app.state);
    }

    // 🔒 渲染阶段一合约与阶段三答辩的字段级排他聚焦锁
    if (remoteData.locks !== undefined) {
      this.app.state.fieldLocks = remoteData.locks || {};
      const locks = this.app.state.fieldLocks;
      const currentUser = this.app.authManager ? this.app.authManager.getCurrentUser() : null;
      const currentUserId = currentUser ? currentUser.id : '';

      // 阶段一公约与阶段三答辩矩阵字段锁更新
      document.querySelectorAll('.task-assignment-input, .contract-time-input, #contract-topic-input, .feedback-direct-input').forEach(el => {
        const fieldKey = el.dataset.lockKey || el.id || (el.dataset.mkey ? `task_${el.dataset.mkey}` : (el.dataset.key ? `time_${el.dataset.key}` : (el.dataset.id ? `fb_${el.dataset.id}` : '')));
        if (!fieldKey) return;
        el.dataset.lockKey = fieldKey;

        const lockInfo = locks[fieldKey];
        const currentUserName = currentUser ? String(currentUser.name  || '') : '';
        const nowMs = Date.now();
        const lockTime = lockInfo ? Number(lockInfo.timestamp || lockInfo.time || 0) : 0;
        const isLockFresh = lockInfo && (nowMs - lockTime <= 8500);
        const lockUser = lockInfo ? String(lockInfo.userId || '') : '';
        const lockName = lockInfo ? String(lockInfo.userName || '') : '';
        const isLockedByOther = isLockFresh && lockUser !== currentUserId && (!currentUserName || lockName !== currentUserName);

        // 查找所属卡片或外层容器
        const isTimeInput = el.classList.contains('contract-time-input');
        const mountContainer = isTimeInput ? (el.closest('div[style*="border-left"]') || el.parentElement.parentElement) : el.parentElement;
        let badge = mountContainer.querySelector(`.field-lock-badge[data-for="${fieldKey}"]`);

        if (isLockedByOther) {
          // 💡 实时呈现对方正在打的成型文字 (无论当前焦点在不在，只要对方锁定了，立即镜像最新内容！)
          if (lockInfo.value !== undefined && lockInfo.value !== null) {
            el.value = lockInfo.value;
          }
          // 🛡️ 如果自己当前正好在该输入框中，标记抢占并安全 blur，杜绝 blur 事件回写覆盖
          if (document.activeElement === el) {
            el._preemptedByOther = true;
            el.blur();
          }
          el.disabled = true;
          el.readOnly = true;
          el.style.pointerEvents = 'none';
          el.style.userSelect = 'none';
          el.style.opacity = '0.75';
          el.style.backgroundColor = '#fefce8';
          el.style.borderColor = '#f59e0b';
          el.title = `🔒 ${lockInfo.userName || '其他组员'} 正在编辑中...`;
          
          if (!badge) {
            badge = document.createElement('div');
            badge.className = 'field-lock-badge';
            badge.dataset.for = fieldKey;
            if (isTimeInput) {
              badge.style.cssText = 'font-size:11px; color:#b45309; background:#fef3c7; border:1px solid #fde68a; padding:2px 8px; border-radius:6px; margin-top:6px; font-weight:700; display:flex; align-items:center; justify-content:center; gap:4px; width:100%; flex:0 0 100%; box-sizing:border-box;';
            } else {
              badge.style.cssText = 'font-size:11px; color:#b45309; background:#fef3c7; border:1px solid #fde68a; padding:2px 8px; border-radius:6px; margin-top:4px; font-weight:700; display:inline-flex; align-items:center; gap:4px;';
            }
            badge.innerHTML = `🔒 ${lockInfo.userName || '组员'} 正在输入...`;
            mountContainer.appendChild(badge);
          } else {
            badge.innerHTML = `🔒 ${lockInfo.userName || '组员'} 正在输入...`;
          }

          // ⚡ 8.5 秒强制自毁定时器：对方若完全停手 8s 安全交接
          if (badge._selfDestructTimer) clearTimeout(badge._selfDestructTimer);
          badge._selfDestructTimer = setTimeout(() => {
            if (badge) badge.remove();
            el._preemptedByOther = false;
            if (document.activeElement !== el) {
              el.disabled = false;
              el.readOnly = false;
              el.style.pointerEvents = 'auto';
              el.style.userSelect = 'auto';
              el.style.opacity = '1';
              el.style.backgroundColor = '';
              el.style.borderColor = '';
              el.title = '';
            }
          }, 8500);
        } else {
          el._preemptedByOther = false;
          if (document.activeElement !== el) {
            el.disabled = false;
            el.readOnly = false;
            el.style.pointerEvents = 'auto';
            el.style.userSelect = 'auto';
            el.style.opacity = '1';
            el.style.backgroundColor = '';
            el.style.borderColor = '';
            el.title = '';
          }
          if (badge) {
            if (badge._selfDestructTimer) clearTimeout(badge._selfDestructTimer);
            badge.remove();
          }
        }
      });
    }

    let needWorkspaceRender = !this._hasRenderedInitialWorkspace;

    if (remoteData.stage1) {
      const localS1 = this.app.state.stage1 || { proposals: [], votes: {}, hasVoted: {}, contract: {} };
      const prevConfirmedMembersStr = JSON.stringify(this.app.state.stage1?.contract?.confirmedMembers || {});
      const prevIsConfirmed = this.app.state.stage1?.contract?.isConfirmed;
      const prevProposalsStr = JSON.stringify(this.app.state.stage1?.proposals || []);
      const prevVotesStr = JSON.stringify(this.app.state.stage1?.votes || {});
      const prevHasVotedStr = JSON.stringify(this.app.state.stage1?.hasVoted || {});
      const remoteS1 = remoteData.stage1;
      const isContractInputActive = document.activeElement && (
        document.activeElement.classList.contains('task-assignment-input') ||
        document.activeElement.classList.contains('contract-time-input') ||
        document.activeElement.id === 'contract-topic-input'
      );

      if (remoteS1.contractStep !== undefined && remoteS1.contractStep !== this.app.state.stage1.contractStep) {
        this.app.state.stage1.contractStep = remoteS1.contractStep;
        needWorkspaceRender = true;
      }
      if (remoteS1.researchOverview !== undefined) {
        this.app.state.stage1.researchOverview = remoteS1.researchOverview;
      }

      if (remoteS1.contract) {
        if (!this.app.state.stage1.contract) this.app.state.stage1.contract = {};
        if (remoteS1.contract.topic) this.app.state.stage1.contract.topic = remoteS1.contract.topic;
        if (remoteS1.contract.overview) this.app.state.stage1.contract.overview = remoteS1.contract.overview;
        if (remoteS1.contract.isDraftGenerated !== undefined) this.app.state.stage1.contract.isDraftGenerated = remoteS1.contract.isDraftGenerated;
        if (remoteS1.contract.taskAssignments) {
          this.app.state.stage1.contract.taskAssignments = {
            ...(this.app.state.stage1.contract.taskAssignments || {}),
            ...remoteS1.contract.taskAssignments
          };
        }
        if (remoteS1.contract.timeAllocations) {
          this.app.state.stage1.contract.timeAllocations = {
            ...(this.app.state.stage1.contract.timeAllocations || {}),
            ...remoteS1.contract.timeAllocations
          };
        }
        if (remoteS1.contract.confirmedMembers) {
          this.app.state.stage1.contract.confirmedMembers = {
            ...(this.app.state.stage1.contract.confirmedMembers || {}),
            ...remoteS1.contract.confirmedMembers
          };
          needWorkspaceRender = true;
        }
        if (remoteS1.contract.isConfirmed !== undefined) {
          if (remoteS1.contract.isConfirmed !== this.app.state.stage1.contract.isConfirmed) {
            this.app.state.stage1.contract.isConfirmed = remoteS1.contract.isConfirmed;
            needWorkspaceRender = true;
          }
        }
      }
      if (remoteS1.mergedTitle !== undefined) {
        this.app.state.stage1.mergedTitle = remoteS1.mergedTitle;
      }

      if (remoteS1.contract?.taskAssignments) {
        document.querySelectorAll('.task-assignment-input').forEach(inp => {
          const mKey = inp.dataset.mkey;
          const mid = inp.dataset.mid;
          let remoteVal = undefined;
          if (mKey && remoteS1.contract.taskAssignments[mKey] !== undefined) {
            remoteVal = remoteS1.contract.taskAssignments[mKey];
          } else if (mid && remoteS1.contract.taskAssignments[mid] !== undefined) {
            remoteVal = remoteS1.contract.taskAssignments[mid];
          } else {
            // 兼容性模糊匹配（如学号/用户名/ID交叉）
            for (const [k, v] of Object.entries(remoteS1.contract.taskAssignments)) {
              if (k === mKey || k === mid || (mKey && (k.endsWith(mKey) || mKey.endsWith(k)))) {
                remoteVal = v;
                break;
              }
            }
          }
          
          if (remoteVal !== undefined && document.activeElement !== inp) {
            const currentVal = inp.value;
            if (remoteVal !== '' || currentVal === '') {
              if (currentVal !== remoteVal) {
                inp.value = remoteVal;
              }
            }
          }
        });
      }
      if (remoteS1.contract?.timeAllocations) {
        if (!this.app.state.stage1.contract.timeAllocations) this.app.state.stage1.contract.timeAllocations = {};
        Object.assign(this.app.state.stage1.contract.timeAllocations, remoteS1.contract.timeAllocations);

        document.querySelectorAll('.contract-time-input').forEach(inp => {
          const k = inp.dataset.key;
          if (k && remoteS1.contract.timeAllocations[k] !== undefined) {
            if (document.activeElement !== inp) {
              const targetVal = String(remoteS1.contract.timeAllocations[k]);
              if (targetVal !== '0' || inp.value === '' || inp.value === '0') {
                if (inp.value !== targetVal) {
                  inp.value = targetVal;
                }
              }
            }
          }
        });
      }
      if (remoteS1.mergedTitle !== undefined) {
        this.app.state.stage1.mergedTitle = remoteS1.mergedTitle;
        const topicInp = document.getElementById('contract-topic-input');
        if (topicInp && document.activeElement !== topicInp) {
          const remoteTitle = remoteS1.mergedTitle || '';
          if (remoteTitle !== '' || topicInp.value === '') {
            if (topicInp.value !== remoteTitle) {
              topicInp.value = remoteTitle;
            }
          }
        }
      }

      const propMap = new Map();
      (remoteS1.proposals || []).forEach(p => {
        if (p) {
          const k = String(p.id || p.author || p.authorName).trim();
          if (k) propMap.set(k, p);
        }
      });

      (localS1.proposals || []).forEach(p => {
        if (p) {
          const k = String(p.id || p.author || p.authorName).trim();
          if (!k) return;
          const remoteP = propMap.get(k);
          if (!remoteP) {
            propMap.set(k, p);
          } else {
            const remoteTime = remoteP.updatedAt || 0;
            const localTime = p.updatedAt || 0;
            if (localTime >= remoteTime) {
              propMap.set(k, p);
            }
          }
        }
      });

      const mergedProposals = Array.from(propMap.values());

      const mergedVotes = {
        ...(localS1.votes || {}),
        ...(remoteS1.votes || {})
      };
      const mergedHasVoted = {
        ...(localS1.hasVoted || {}),
        ...(remoteS1.hasVoted || {})
      };

      const isProposalChanged = JSON.stringify(mergedProposals) !== prevProposalsStr;
      const isVoteChanged = JSON.stringify(mergedVotes) !== prevVotesStr
        || JSON.stringify(mergedHasVoted) !== prevHasVotedStr;
      const isConfirmChanged = (remoteS1.contract?.isConfirmed !== prevIsConfirmed)
        || (JSON.stringify(this.app.state.stage1.contract?.confirmedMembers || {}) !== prevConfirmedMembersStr);

      this.app.state.stage1.proposals = mergedProposals;
      this.app.state.stage1.votes = mergedVotes;
      this.app.state.stage1.hasVoted = mergedHasVoted;

      if (isProposalChanged || isVoteChanged || isConfirmChanged) {
        needWorkspaceRender = true;
      }
    }

    if (remoteData.stage2) {
      if (Array.isArray(remoteData.stage2)) {
        remoteData.stage2 = { unifiedContent: '', memberContributions: {}, confirmedMembers: {}, meetingSubmissions: {} };
      }
      if (!this.app.state.stage2 || Array.isArray(this.app.state.stage2)) {
        this.app.state.stage2 = {};
      }

      if (remoteData.stage2.pendingReviewing !== undefined) {
        this.app.state.stage2.pendingReviewing = remoteData.stage2.pendingReviewing;
        this.app.state.stage2PendingReviewing = remoteData.stage2.pendingReviewing;
      }
      if (remoteData.stage2.reviewMilestone) {
        this.app.state.stage2.reviewMilestone = remoteData.stage2.reviewMilestone;
      }
      if (remoteData.stage2.firstReviewText !== undefined && remoteData.stage2.firstReviewText) {
        this.app.state.stage2.firstReviewText = remoteData.stage2.firstReviewText;
      }

      if (remoteData.stage2.unifiedContent !== undefined) {
        let remoteHtml = remoteData.stage2.unifiedContent || '';
        if (remoteHtml.includes('一、研究背景与意义') || remoteHtml.includes('请在此处撰写正文')) {
          remoteHtml = '';
        }
        const isLocalPadActive = !!document.getElementById('stage2-etherpad-frame');
        const localLen = (this.app.state.stage2?.unifiedContent || '').length;
        if (!isLocalPadActive || remoteHtml.length >= localLen || localLen === 0) {
          this.app.state.stage2.unifiedContent = remoteHtml;
        }
      }

      if (remoteData.stage2.memberContributions) {
        if (JSON.stringify(remoteData.stage2.memberContributions) !== JSON.stringify(this.app.state.stage2.memberContributions)) {
          this.app.state.stage2.memberContributions = remoteData.stage2.memberContributions;
          this.app.updateContributionUi();
        }
      }
      if (remoteData.stage2.meetingSubmissions) {
        const localSubs = this.app.state.stage2.meetingSubmissions || {};
        const remoteSubs = remoteData.stage2.meetingSubmissions || {};
        const mergedSubs = { ...localSubs, ...remoteSubs };
        if (JSON.stringify(mergedSubs) !== JSON.stringify(localSubs)) {
          this.app.state.stage2.meetingSubmissions = mergedSubs;
          needWorkspaceRender = true;
        }
      }
      if (remoteData.stage2.confirmedMembers) {
        const localConf = this.app.state.stage2.confirmedMembers || {};
        const mergedConf = { ...localConf, ...remoteData.stage2.confirmedMembers };
        if (JSON.stringify(mergedConf) !== JSON.stringify(localConf)) {
          this.app.state.stage2.confirmedMembers = mergedConf;
          needWorkspaceRender = true;
        }
        let memberArr = [];
        if (Array.isArray(this.app.state.members)) memberArr = this.app.state.members;
        else if (this.app.state.members && typeof this.app.state.members === 'object') memberArr = Object.values(this.app.state.members);
        if (memberArr.length > 0) {
          const isMemDone = (map, m) => !!(map && (map[m.id] || (m.name && map[m.name])));
          const cCount = memberArr.filter(m => isMemDone(mergedConf, m)).length;
          if (cCount >= memberArr.length && memberArr.length > 0) {
            this.app.state.stage2.isDraftConfirmed = true;
            this.app.state.groupMaxStage = 'stage3';
            needWorkspaceRender = true;
          }
        }
      }
      if (remoteData.stage2.isDraftConfirmed !== undefined && remoteData.stage2.isDraftConfirmed !== this.app.state.stage2.isDraftConfirmed) {
        this.app.state.stage2.isDraftConfirmed = remoteData.stage2.isDraftConfirmed;
        if (remoteData.stage2.isDraftConfirmed) {
          this.app.state.groupMaxStage = 'stage3';
        }
        needWorkspaceRender = true;
      }
      if (remoteData.stage2.actionPlan) {
        if (remoteData.stage2.actionPlan.isGenerated && !this.app.state.stage2.actionPlan?.isGenerated) {
          this.app.state.stage2.actionPlan = remoteData.stage2.actionPlan;
          needWorkspaceRender = true;
        } else if (JSON.stringify(remoteData.stage2.actionPlan) !== JSON.stringify(this.app.state.stage2.actionPlan)) {
          this.app.state.stage2.actionPlan = remoteData.stage2.actionPlan;
          needWorkspaceRender = true;
        }
      }
    }

    if (remoteData.stage3) {
      const localS3 = this.app.state.stage3;
      const remoteS3 = remoteData.stage3;
      if (remoteS3) {
        if (remoteS3.proponentAnalysis !== undefined) this.app.state.stage3.proponentAnalysis = remoteS3.proponentAnalysis;
        if (remoteS3.opponentCritique !== undefined) this.app.state.stage3.opponentCritique = remoteS3.opponentCritique;
        if (remoteS3.neutralVerdict !== undefined) this.app.state.stage3.neutralVerdict = remoteS3.neutralVerdict;
        
        if (remoteS3.confirmedMembers) {
          const localConf = this.app.state.stage3.confirmedMembers || {};
          const mergedConf = { ...localConf, ...remoteS3.confirmedMembers };
          if (JSON.stringify(localConf) !== JSON.stringify(mergedConf)) {
            this.app.state.stage3.confirmedMembers = mergedConf;
            needWorkspaceRender = true;
          }
        }
        if (remoteS3.finalSubmittedMembers) {
          const localFinal = this.app.state.stage3.finalSubmittedMembers || {};
          const mergedFinal = { ...localFinal, ...remoteS3.finalSubmittedMembers };
          if (JSON.stringify(localFinal) !== JSON.stringify(mergedFinal)) {
            this.app.state.stage3.finalSubmittedMembers = mergedFinal;
            needWorkspaceRender = true;
          }
        }
        if (remoteS3.isRevisionConfirmed !== undefined && remoteS3.isRevisionConfirmed !== this.app.state.stage3.isRevisionConfirmed) {
          this.app.state.stage3.isRevisionConfirmed = remoteS3.isRevisionConfirmed;
          needWorkspaceRender = true;
        }

        const localItems = Array.isArray(localS3.feedbackItems) ? localS3.feedbackItems : [];
        const remoteItems = Array.isArray(remoteS3.feedbackItems) ? remoteS3.feedbackItems : [];
        if (remoteItems.length > 0 && localItems.length === 0) {
          this.app.state.stage3.feedbackItems = remoteItems;
          needWorkspaceRender = true;
        } else if (JSON.stringify(remoteItems) !== JSON.stringify(localItems)) {
          this.app.state.stage3.feedbackItems = remoteItems;
          remoteItems.forEach(item => {
            const textarea = document.querySelector(`.feedback-direct-input[data-id="${item.id}"]`);
            if (textarea && document.activeElement !== textarea) {
              if (textarea.value !== (item.response || '')) textarea.value = item.response || '';
              textarea.style.borderColor = item.response ? '#a7f3d0' : '#cbd5e1';
              textarea.style.background = this.app.state.isFinalSubmitted ? '#f8fafc' : (item.response ? '#f0fdf4' : '#ffffff');
            }
            const saveBtn = document.querySelector(`.btn-save-feedback-direct[data-id="${item.id}"]`);
            if (saveBtn) {
              saveBtn.innerHTML = item.response ? '🔄 更新并保存本条修改' : '💾 确认并保存本条答复';
              saveBtn.style.background = item.response ? 'linear-gradient(135deg, #059669, #047857)' : 'linear-gradient(135deg, #2563eb, #1d4ed8)';
            }
          });
          const anyCardInDom = document.querySelector('.feedback-direct-input');
          if (!anyCardInDom && this.app.state.currentStage === 'stage3') needWorkspaceRender = true;
        }
      }
    }

    if (remoteData.stepConfirmations !== undefined) {
      if (!this.app.state.stepConfirmations) this.app.state.stepConfirmations = {};
      const localStr = JSON.stringify(this.app.state.stepConfirmations);
      const remoteConfs = remoteData.stepConfirmations || {};
      for (const [stepKey, userMap] of Object.entries(remoteConfs)) {
        if (!this.app.state.stepConfirmations[stepKey]) this.app.state.stepConfirmations[stepKey] = {};
        Object.assign(this.app.state.stepConfirmations[stepKey], userMap || {});
      }
      if (JSON.stringify(this.app.state.stepConfirmations) !== localStr) {
        needWorkspaceRender = true;
      }
    }

    if (remoteData.stage1 && remoteData.stage1.startTime) {
      if (!this.app.state.stage1) this.app.state.stage1 = {};
      const remoteS1Start = Number(remoteData.stage1.startTime);
      if (remoteS1Start > 0) {
        if (!this.app.state.stage1.startTime) {
          this.app.state.stage1.startTime = remoteS1Start;
        }
      }
      if (!this.app.state.timer.startTimestamp && remoteS1Start > 0) {
        this.app.state.timer.startTimestamp = remoteS1Start;
      }
    }

    if (remoteData.stage2 && remoteData.stage2.startTime) {
      if (!this.app.state.stage2) this.app.state.stage2 = {};
      const remoteS2Start = Number(remoteData.stage2.startTime);
      const s1ConfTime = Number(this.app.state.stage1?.contract?._confirmedTime || 0);
      if (remoteS2Start > 0 && (s1ConfTime === 0 || remoteS2Start >= (s1ConfTime - 60000))) {
        if (!this.app.state.stage2.startTime) {
          this.app.state.stage2.startTime = remoteS2Start;
          this.app.stage2StartTime = remoteS2Start;
        }
      }
    }

    if (remoteData.stage3 && remoteData.stage3.startTime) {
      if (!this.app.state.stage3) this.app.state.stage3 = {};
      const remoteS3Start = Number(remoteData.stage3.startTime);
      const s2ConfTime = Number(this.app.state.stage2?._firstSignTimeMs || this.app.state.stage2?.startTime || 0);
      if (remoteS3Start > 0 && (s2ConfTime === 0 || remoteS3Start >= (s2ConfTime - 60000))) {
        if (!this.app.state.stage3.startTime) {
          this.app.state.stage3.startTime = remoteS3Start;
          this.app.stage3StartTime = remoteS3Start;
        }
      }
    }

    if (remoteData.timer && this.app.state.timer) {
      if (remoteData.timer.startTimestamp) {
        const remoteTimerStart = Number(remoteData.timer.startTimestamp);
        if (!this.app.state.timer.startTimestamp && remoteTimerStart > 0) {
          this.app.state.timer.startTimestamp = remoteTimerStart;
        }
      }
      if (remoteData.timer.speed !== undefined) {
        this.app.state.timer.speed = remoteData.timer.speed;
      }
      if (remoteData.timer.isRunning !== undefined) {
        this.app.state.timer.isRunning = remoteData.timer.isRunning;
      }
      if (this.app.state.timer.startTimestamp) {
        const speed = this.app.state.timer.speed || 1;
        const physicalElapsedSec = Math.floor((Date.now() - this.app.state.timer.startTimestamp) / 1000);
        this.app.state.timer.elapsedSeconds = Math.max(0, Math.floor(physicalElapsedSec * speed));
      }
      if (typeof window.renderChatActionBar === 'function') {
        window.renderChatActionBar(this.app.state);
      }
    }

    const stageOrder = { stage1: 1, stage2: 2, stage3: 3 };
    const currentOrder = stageOrder[this.app.state.currentStage] || 1;
    const remoteOrder = stageOrder[remoteData.currentStage] || 1;

    if (remoteData.currentStage) {
      this.app.state.groupMaxStage = remoteData.currentStage;
    }

    this.app.saveGroupState(myGroupId);
    
    // 🛡️ Safari / WebKit 核心保护：如果用户正在任意输入框、富文本或 Etherpad iframe 内打字，绝对禁止重绘工作区
    const activeEl = document.activeElement;
    const isTyping = activeEl && (
      activeEl.id === 'chat-input' ||
      activeEl.tagName === 'INPUT' ||
      activeEl.tagName === 'TEXTAREA' ||
      activeEl.tagName === 'IFRAME' ||
      activeEl.isContentEditable ||
      window._isGlobalComposing
    );
    if (!isTyping) {
      if (typeof window.renderChat === 'function') window.renderChat(this.app.state);
      if (needWorkspaceRender) {
        this.app.renderStudentWorkspace();
      }
    }
    this.app.updateContributionUi();
    this.app.renderPresenceCursors();

    // 🛡️ 本地快照极速持久化：确保下次 F5 刷新时 0 毫秒秒级呈现已有全部协作数据
    try {
      const snapCache = {
        taskId: this.taskId,
        groupId: myGroupId,
        chatLogs: this.app.state.chatLogs,
        stage1: this.app.state.stage1,
        stage2: this.app.state.stage2,
        stage3: this.app.state.stage3,
        timer: this.app.state.timer,
        currentStage: this.app.state.currentStage,
        groupMaxStage: this.app.state.groupMaxStage,
        isFinalSubmitted: this.app.state.isFinalSubmitted
      };
      localStorage.setItem(this.storageKey, JSON.stringify(snapCache));
    } catch (e) {}

    const isFirstPull = !this._hasRenderedInitialWorkspace;
    if ((isFirstPull || needWorkspaceRender) && user?.role === 'student' && this.app.state.studentViewMode === 'workspace') {
      const activeEl = document.activeElement;
      const isTypingInWorkspace = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') && (document.getElementById('canvas-panel')?.contains(activeEl) || document.querySelector('.contract-card')?.contains(activeEl));
      if (!isTypingInWorkspace) {
        this._hasRenderedInitialWorkspace = true;
        this.app.renderStudentWorkspace();
      }
    }

    // ⚡ 首次拉取就绪：纯前端局部更新右侧聊天与未读通知检查（0 数据上传）
    if (isFirstPull && user?.role === 'student' && this.app.state.studentViewMode === 'workspace') {
      if (typeof this.app.triggerStageWelcomeSpeech === 'function') {
        this.app.triggerStageWelcomeSpeech(this.app.state.currentStage || 'stage1');
      }
      if (typeof this.app.checkUnreadAnnouncements === 'function') {
        setTimeout(() => this.app.checkUnreadAnnouncements(), 300);
      }
    }
  }
}
