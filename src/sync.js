/**
 * JIZHI (集智) Platform - Real-Time Cloud Sync Engine
 * Standard ES Module (ESM)
 */

import { InitialState } from './constants.js?v=20260823_v219';
import { getCaretCharacterOffsetWithin, setCaretPositionWithin } from './utils.js?v=20260823_v219';

export class CloudSyncEngine {
  constructor(app) {
    this.app = app;
    this.lastTimestamp = 0;
    this.isPushing = false;
    this.pendingPushCount = 0;
    this.isInitialPullDone = false;
    this.isLoggingOut = false;
    this.pollTimer = null;
    this.updateScopeKeys();
    this.initPolling();
  }

  getEffectiveGroupId() {
    const user = this.app.authManager ? this.app.authManager.getCurrentUser() : null;
    const isTeacher = user && (user.isTeacher || user.role === 'teacher');
    if (isTeacher) {
      return this.app.state.activeMonitorGroupId || 'group_1';
    }
    const effectiveClassId = this.app.state.activeStudentClassId || user?.classId || 'class_101';
    const activeGroupObj = this.app.authManager ? this.app.authManager.getStudentActiveGroup(user, effectiveClassId) : null;
    return activeGroupObj?.id || user?.groupId || 'group_1';
  }

  updateScopeKeys() {
    const groupId = this.getEffectiveGroupId();
    const taskId = (this.app.state.activeTaskId) ? this.app.state.activeTaskId : 'task_default';
    this.groupId = groupId;
    this.taskId = taskId;
    this.storageKey = `jizhi_cloud_snapshot_v10_pure_${taskId}_${groupId}`;
    this.syncEndpoints = [
      `sync.php?taskId=${taskId}&groupId=${groupId}`
    ];

    if ('BroadcastChannel' in window) {
      try {
        if (this.bc) { try { this.bc.close(); } catch (e) {} }
        this.bc = new BroadcastChannel(`jizhi_bc_${this.taskId}_${this.groupId}`);
        this.bc.onmessage = (e) => {
          if (e.data && e.data.snapshot) this.handleRemoteSync(e.data.snapshot);
        };
      } catch (e) {}
    }
  }

  initSSE() {}
  refreshScopeKeys() {
    this.updateScopeKeys();
  }

  initPolling() {
    this.pullFromServer();
    // ⚡ 2 秒极速心跳轮询：无论输入、发呆还是后台，全组状态实时秒级同步
    const getInterval = () => (document.hidden ? 4000 : 2000);
    const runPoll = () => {
      if (this.isLoggingOut) return;
      this.pullFromServer().finally(() => {
        if (this.isLoggingOut) return;
        this.pollTimer = setTimeout(runPoll, getInterval());
      });
    };
    this.pollTimer = setTimeout(runPoll, 2000);

    window.addEventListener('storage', (e) => {
      if (e.key === this.storageKey && e.newValue) {
        try { this.handleRemoteSync(JSON.parse(e.newValue)); } catch (err) {}
      }
    });
  }

  // 🛡️ 停止轮询并标记登出，供登出流程调用，彻底终止短轮询循环
  stopPolling() {
    this.isLoggingOut = true;
    if (this.pollTimer) { clearTimeout(this.pollTimer); this.pollTimer = null; }
  }

  async pullFromServer() {
    if (this.isPulling || this.isLoggingOut) return;
    this.isPulling = true;
    this.updateScopeKeys();

    const currentUser = this.app.authManager ? this.app.authManager.getCurrentUser() : null;
    const userKey = currentUser ? (currentUser.studentCode || currentUser.username || currentUser.id) : '';
    const sessToken = currentUser?.activeSessionId || '';

    try {
      for (const endpoint of this.syncEndpoints) {
        try {
          const sep = endpoint.includes('?') ? '&' : '?';
          const url = `${endpoint}${sep}userId=${encodeURIComponent(userKey)}&sessToken=${encodeURIComponent(sessToken)}&nocache=${Date.now()}`;
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
            if (data && (data.timestamp !== undefined || data.chatLogs || data.stage1 || data.stage2 || data.presence || data.locks)) {
              this.handleRemoteSync(data);
              return;
            }
          }
        } catch (e) {}
      }
    } finally {
      this.isPulling = false;
    }
  }

  async pushSnapshot(isReset = false) {
    // 🛡️ 致命防线：冷启动未完成初次云端拉取时，严禁向服务器推送快照，杜绝新设备/刷新冲刷覆盖已有云端协作数据
    if (!this.isInitialPullDone && !isReset) {
      return;
    }

    this.updateScopeKeys();
    const groupId = this.groupId;
    const isResetVal = !!this.isResetBroadcast || isReset;
    this.isResetBroadcast = false;

    const localResetSeqKey = `jizhi_reset_seq_${this.storageKey}`;
    let localResetSeq = parseInt(localStorage.getItem(localResetSeqKey) || '0', 10);
    if (isReset) {
      localResetSeq += 1;
      try { localStorage.setItem(localResetSeqKey, String(localResetSeq)); } catch (e) {}
    }

    const snapshot = {
      timestamp: Date.now(),
      groupId: groupId,
      isReset: isReset,
      resetSeq: localResetSeq,
      revisionId: this.lastRevisionId || 0,
      members: this.app.state.members,
      presence: this.app.state.presence || {},
      chatLogs: this.app.state.chatLogs,
      stage1: this.app.state.stage1,
      stage2: this.app.state.stage2,
      stage3: this.app.state.stage3,
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
      const results = await Promise.allSettled(this.syncEndpoints.map(url =>
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: bodyStr
        }).then(r => r.json()).catch(() => null)
      ));
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value && result.value.stale) {
          const serverResetSeq = result.value.resetSeq || 0;
          if (serverResetSeq > localResetSeq) {
            this._applyReset(serverResetSeq);
          }
          break;
        }
      }
    } catch (e) {
    } finally {
      this.isPushing = false;
      if (this.pendingPushCount > 0) { this.pendingPushCount = 0; this.pushSnapshot(); }
    }
  }

  _applyReset(newResetSeq) {
    const user = this.app.authManager.getCurrentUser();
    const myGroupId = (user && user.groupId) ? user.groupId : (this.app.state.activeMonitorGroupId || 'group_1');
    const taskId = this.app.state.activeTaskId || 'task_default';
    const localResetSeqKey = `jizhi_reset_seq_${this.storageKey}`;

    localStorage.setItem(localResetSeqKey, String(newResetSeq));

    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('jizhi_sync_') && (k.endsWith(`_${myGroupId}`) || k.includes(`_${myGroupId}`))) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
    } catch (e) {}

    try {
      const hasContent = (this.app.state.stage2 && this.app.state.stage2.unifiedContent) || 
                         (this.app.state.stage1 && this.app.state.stage1.proposals && this.app.state.stage1.proposals.length > 0);
      if (hasContent) {
        const emergencyDraft = {
          savedAt: new Date().toLocaleString(),
          groupId: myGroupId,
          taskId: taskId,
          stage1: this.app.state.stage1,
          stage2: this.app.state.stage2,
          stage3: this.app.state.stage3,
          chatLogs: this.app.state.chatLogs
        };
        localStorage.setItem('jizhi_lost_and_found_draft', JSON.stringify(emergencyDraft));
      }
    } catch (e) {}

    this.app.state.stage1 = JSON.parse(JSON.stringify(InitialState.stage1));
    this.app.state.stage2 = JSON.parse(JSON.stringify(InitialState.stage2));
    this.app.state.stage3 = JSON.parse(JSON.stringify(InitialState.stage3));
    this.app.state.chatLogs = { stage1: [], stage2: [], stage3: [] };
    this.app.state.currentStage = 'stage1';
    this.app.state.isFinalSubmitted = false;
    this.app.state.presence = {};

    this.lastTimestamp = 0;

    const oldContractCard = document.querySelector('.contract-card');
    if (oldContractCard) oldContractCard.remove();
    const editor = document.getElementById('stage2-word-editor') || document.getElementById('stage3-word-editor');
    if (editor) editor.innerHTML = '';

    this.app.saveGroupState(myGroupId);
    if (typeof window.renderChat === 'function') window.renderChat(this.app.state);
    this.app.updateContributionUi();
    this.app.renderPresenceCursors();

    this.updateScopeKeys();
    const userKey = user ? (user.id || user.studentCode || user.username || 'u') : 'u';
    const ackResetSeqKey = `jizhi_ack_reset_seq_${userKey}_${this.storageKey}`;
    const localAckSeq = parseInt(localStorage.getItem(ackResetSeqKey) || '0', 10);

    // 仅在首次感知到该版本重置时，才向学生弹窗提示 1 次
    if (newResetSeq > localAckSeq) {
      localStorage.setItem(ackResetSeqKey, String(newResetSeq));

      if (user?.role === 'student' || user?.isStudent) {
        document.querySelectorAll('.reset-notify-modal').forEach(m => m.remove());
        const resetModal = document.createElement('div');
        resetModal.className = 'modal-overlay reset-notify-modal';
        const isCurrentlyInWorkspace = this.app && this.app.state.studentViewMode === 'workspace';

        resetModal.innerHTML = `
          <div class="teacher-modal-card" style="width:440px; text-align:center; padding:32px 24px; background:#ffffff; border-radius:14px; box-shadow:0 20px 25px -5px rgba(0,0,0,0.25); border:1px solid #e2e8f0; animation:modalFadeIn 0.25s ease;">
            <div style="font-size:44px; margin-bottom:12px;">🔄</div>
            <div style="font-size:18px; font-weight:800; color:#0f172a; margin-bottom:8px;">课堂协同数据已重置</div>
            <div style="font-size:13.5px; color:#475569; line-height:1.6; margin-bottom:22px;">
              ${isCurrentlyInWorkspace 
                ? '指导教师已清空重置本组在当前写作任务中的分工公约、正文草稿与讨论记录。小组成员已自动安全返回【任务大厅】。' 
                : '指导教师已清空重置本组在当前写作任务中的协同数据，已为您开启全新一轮协作写作！'}
            </div>
            <button id="btn-confirm-reset-ok" style="background:linear-gradient(135deg, #2563eb, #1d4ed8); color:white; border:none; padding:12px 28px; border-radius:8px; font-size:14px; font-weight:700; cursor:pointer; width:100%; box-shadow:0 3px 10px rgba(37,99,235,0.25);">
              ${isCurrentlyInWorkspace ? '📋 我知道了 (返回任务大厅)' : '✍️ 我知道了 (开始协作)'}
            </button>
          </div>
        `;
        document.body.appendChild(resetModal);

        const handleDismiss = () => {
          resetModal.remove();
          if (isCurrentlyInWorkspace && this.app) {
            this.app.state.studentViewMode = 'task_list';
            this.app.renderMain();
          } else if (this.app) {
            this.app.renderStudentWorkspace();
          }
        };

        resetModal.querySelector('#btn-confirm-reset-ok').addEventListener('click', handleDismiss);
        resetModal.addEventListener('click', (e) => { if (e.target === resetModal) handleDismiss(); });
      }
    }
  }

  // 📡 仅向本机其他标签页广播一条本地消息（不触达服务端）；供教师重置成功后就地同步 resetSeq（修复 broadcastLocal 未定义，见审查 #43 配套）
  broadcastLocal(data) {
    if (this.bc) { try { this.bc.postMessage({ snapshot: data }); } catch (e) {} }
  }

  handleRemoteSync(remoteData) {
    if (!remoteData) return;

    const user = this.app.authManager ? this.app.authManager.getCurrentUser() : null;
    const myGroupId = this.getEffectiveGroupId();

    if (remoteData.groupId && remoteData.groupId !== myGroupId && user?.role === 'student') return;

    // 更新本地已知的服务端 revisionId（每次拉到数据都对齐，防止 since_rev 永远为 0）
    if (remoteData.revisionId !== undefined) {
      this._lastKnownRevisionId = remoteData.revisionId;
    }

    // 🌐 服务端全局教务元数据同步到本地（tasks/users/classes/announcements）
    // 这样学生端看到的任务时间、组员列表与教师端一致，不再依赖各设备本地 localStorage
    if (this.app.authManager) {
      if (Array.isArray(remoteData.tasks) && remoteData.tasks.length > 0) {
        const key = 'jizhi_pure_v10_tasks_db';
        const localStr = localStorage.getItem(key) || '[]';
        const remoteStr = JSON.stringify(remoteData.tasks);
        if (localStr !== remoteStr) localStorage.setItem(key, remoteStr);
      }
      if (Array.isArray(remoteData.users) && remoteData.users.length > 0) {
        const key = 'jizhi_pure_v10_users_db';
        const localStr = localStorage.getItem(key) || '[]';
        const remoteStr = JSON.stringify(remoteData.users);
        if (localStr !== remoteStr) localStorage.setItem(key, remoteStr);
      }
      if (Array.isArray(remoteData.classes) && remoteData.classes.length > 0) {
        const key = 'jizhi_pure_v10_classes_db';
        const localStr = localStorage.getItem(key) || '[]';
        const remoteStr = JSON.stringify(remoteData.classes);
        if (localStr !== remoteStr) localStorage.setItem(key, remoteStr);
      }
      if (Array.isArray(remoteData.announcements)) {
        const key = 'jizhi_pure_v10_ann_db';
        const localStr = localStorage.getItem(key) || '[]';
        const remoteStr = JSON.stringify(remoteData.announcements);
        if (localStr !== remoteStr) localStorage.setItem(key, remoteStr);
      }
    }

    // 🛡️ 仅在已完成冷启动拉取且 resetSeq 严格递增时才响应教师重置；首次加载时对齐记录并正常放行同步
    if (remoteData.resetSeq !== undefined) {
      const localResetSeqKey = `jizhi_reset_seq_${this.storageKey}`;
      const rawStored = localStorage.getItem(localResetSeqKey);
      const localResetSeq = parseInt(rawStored || '0', 10);
      if (!rawStored || !this._hasInitialPullCompleted) {
        localStorage.setItem(localResetSeqKey, String(remoteData.resetSeq));
      } else if (remoteData.resetSeq > localResetSeq) {
        this._applyReset(remoteData.resetSeq);
        return;
      }
    }
    this._hasInitialPullCompleted = true;

    if (remoteData.presence) {
      this.app.state.presence = { ...(this.app.state.presence || {}), ...remoteData.presence };
      this.app.renderPresenceCursors();
    }

    if (remoteData.members) {
      this.app.state.members = remoteData.members;
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
      let chatChanged = false;
      ['stage1', 'stage2', 'stage3'].forEach(stg => {
        const remoteLogs = Array.isArray(remoteData.chatLogs[stg]) ? remoteData.chatLogs[stg] : [];
        const localLogs = Array.isArray(this.app.state.chatLogs[stg]) ? this.app.state.chatLogs[stg] : [];
        
        const mergedLogs = [];
        const seenKeys = new Set();
        const allCandidate = [...localLogs, ...remoteLogs];
        allCandidate.sort((a, b) => {
          const ta = a?._timeMs ? Number(a._timeMs) : 0;
          const tb = b?._timeMs ? Number(b._timeMs) : 0;
          return ta - tb;
        });
        allCandidate.forEach(m => {
          if (!m) return;
          const idKey = m.id ? `id_${m.id}` : null;
          const contentKey = `${m.sender || ''}_${(m.text || '').trim()}_${m._timeMs ? Math.floor(Number(m._timeMs) / 3000) : (m.timestamp || '')}`;
          if (idKey && seenKeys.has(idKey)) return;
          if (seenKeys.has(contentKey)) return;
          if (idKey) seenKeys.add(idKey);
          seenKeys.add(contentKey);
          mergedLogs.push(m);
        });

        if (mergedLogs.length > 0) {
          this.app.state.chatLogs[stg] = mergedLogs;
        }
      });
      if (typeof window.renderChat === 'function') window.renderChat(this.app.state);
    }

    // 🔒 渲染阶段一合约与阶段三答辩的字段级排他聚焦锁
    if (remoteData.locks !== undefined) {
      this.app.state.fieldLocks = remoteData.locks || {};
      const locks = this.app.state.fieldLocks;
      const currentUser = this.app.authManager ? this.app.authManager.getCurrentUser() : null;
      const currentUserId = currentUser ? (currentUser.studentCode || currentUser.username || currentUser.id) : '';

      // 阶段一公约与阶段三答辩矩阵字段锁更新
      document.querySelectorAll('.task-assignment-input, .contract-time-input, #contract-topic-input, .feedback-direct-input').forEach(el => {
        const fieldKey = el.dataset.lockKey || el.id || (el.dataset.mkey ? `task_${el.dataset.mkey}` : (el.dataset.key ? `time_${el.dataset.key}` : (el.dataset.id ? `fb_${el.dataset.id}` : '')));
        if (!fieldKey) return;
        el.dataset.lockKey = fieldKey;

        const lockInfo = locks[fieldKey];
        const currentUserName = currentUser ? currentUser.name : '';
        const isLockedByOther = lockInfo && lockInfo.userId !== currentUserId && lockInfo.userName !== currentUserName;

        // 查找所属卡片或外层容器
        const isTimeInput = el.classList.contains('contract-time-input');
        const mountContainer = isTimeInput ? (el.closest('div[style*="border-left"]') || el.parentElement.parentElement) : el.parentElement;
        let badge = mountContainer.querySelector(`.field-lock-badge[data-for="${fieldKey}"]`);

        if (isLockedByOther) {
          el.disabled = true;
          el.style.opacity = '0.65';
          el.style.backgroundColor = '#f1f5f9';
          el.style.borderColor = '#94a3b8';
          el.title = `🔒 ${lockInfo.userName || '其他组员'} 正在编辑中...`;
          
          if (!badge) {
            badge = document.createElement('div');
            badge.className = 'field-lock-badge';
            badge.dataset.for = fieldKey;
            if (isTimeInput) {
              badge.style.cssText = 'font-size:11px; color:#b45309; background:#fef3c7; border:1px solid #fde68a; padding:2px 8px; border-radius:6px; margin-top:6px; font-weight:700; display:flex; align-items:center; justify-content:center; gap:4px; width:100%; box-sizing:border-box;';
            } else {
              badge.style.cssText = 'font-size:11px; color:#b45309; background:#fef3c7; border:1px solid #fde68a; padding:2px 8px; border-radius:6px; margin-top:4px; font-weight:700; display:inline-flex; align-items:center; gap:4px;';
            }
            badge.innerHTML = `🔒 ${lockInfo.userName || '组员'} 正在输入...`;
            mountContainer.appendChild(badge);
          } else {
            badge.innerHTML = `🔒 ${lockInfo.userName || '组员'} 正在输入...`;
          }
        } else {
          if (document.activeElement !== el) {
            el.disabled = false;
            el.style.opacity = '1';
            el.style.backgroundColor = '';
            el.style.borderColor = '';
            el.title = '';
          }
          if (badge) badge.remove();
        }
      });
    }

    let needWorkspaceRender = false;

    if (remoteData.stage1) {
      const localS1 = this.app.state.stage1 || { proposals: [], votes: {}, hasVoted: {}, contract: {} };
      const remoteS1 = remoteData.stage1;
      const isContractInputActive = document.activeElement && (
        document.activeElement.classList.contains('task-assignment-input') ||
        document.activeElement.classList.contains('contract-time-input') ||
        document.activeElement.id === 'contract-topic-input'
      );

      if (remoteS1.contract) {
        if (!this.app.state.stage1.contract) this.app.state.stage1.contract = {};
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
        }
        if (remoteS1.contract.isConfirmed !== undefined) {
          this.app.state.stage1.contract.isConfirmed = remoteS1.contract.isConfirmed;
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

      const localProps = Array.isArray(localS1.proposals) ? localS1.proposals : [];
      const remoteProps = Array.isArray(remoteS1.proposals) ? remoteS1.proposals : [];
      const propByAuthor = new Map();

      // 建立作者标识归一化映射
      const normalizeAuthorKey = (authorId, authorName) => {
        if (authorName && typeof authorName === 'string' && authorName.trim()) return authorName.trim();
        return String(authorId || '').trim();
      };

      localProps.forEach(p => {
        if (p && (p.author || p.authorName)) {
          const k = normalizeAuthorKey(p.author, p.authorName);
          propByAuthor.set(k, p);
        }
      });

      remoteProps.forEach(remoteP => {
        if (remoteP && (remoteP.author || remoteP.authorName)) {
          const k = normalizeAuthorKey(remoteP.author, remoteP.authorName);
          const localP = propByAuthor.get(k);
          if (!localP) {
            propByAuthor.set(k, remoteP);
          } else {
            const remoteTime = remoteP.updatedAt || 0;
            const localTime = localP.updatedAt || 0;
            if (remoteTime >= localTime) {
              propByAuthor.set(k, remoteP);
            }
          }
        }
      });
      const mergedProposals = Array.from(propByAuthor.values());

      const mergedVotes = {
        ...(localS1.votes || {}),
        ...(remoteS1.votes || {})
      };
      const mergedHasVoted = {
        ...(localS1.hasVoted || {}),
        ...(remoteS1.hasVoted || {})
      };

      const isProposalChanged = JSON.stringify(mergedProposals) !== JSON.stringify(localProps);
      const isVoteChanged = JSON.stringify(mergedVotes) !== JSON.stringify(localS1.votes || {})
        || JSON.stringify(mergedHasVoted) !== JSON.stringify(localS1.hasVoted || {});
      const isConfirmChanged = remoteS1.contract?.isConfirmed !== localS1.contract?.isConfirmed
        || JSON.stringify(remoteS1.contract?.confirmedMembers) !== JSON.stringify(localS1.contract?.confirmedMembers);

      this.app.state.stage1.proposals = mergedProposals;
      this.app.state.stage1.votes = mergedVotes;
      this.app.state.stage1.hasVoted = mergedHasVoted;

      if (isProposalChanged || isVoteChanged || isConfirmChanged) {
        needWorkspaceRender = true;
      }
    }

    if (remoteData.stage2) {
      // 🚀 100% 绝对可靠同步：当远端组员有新内容、且本地当前未在输入时，平滑呈现最新正文
      if (remoteData.stage2.unifiedContent !== undefined) {
        const remoteHtml = remoteData.stage2.unifiedContent || '';
        const localHtml = this.app.state.stage2?.unifiedContent || '';
        
        const stage2Editor = document.getElementById('stage2-word-editor');
        const qlEditor = stage2Editor ? stage2Editor.querySelector('.ql-editor') : null;
        const activeEl = document.activeElement;
        const isLocalTyping = activeEl && (
          activeEl === stage2Editor ||
          activeEl === qlEditor ||
          (stage2Editor && stage2Editor.contains(activeEl))
        );

        if (!isLocalTyping && remoteHtml && remoteHtml !== localHtml) {
          if (!this.app.state.stage2) this.app.state.stage2 = {};
          this.app.state.stage2.unifiedContent = remoteHtml;
          
          if (window._jizhi_quill && window._jizhi_quill.root) {
            if (window._jizhi_quill.root.innerHTML !== remoteHtml) {
              window._jizhi_quill.root.innerHTML = remoteHtml;
            }
          }
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
        if (JSON.stringify(remoteData.stage2.confirmedMembers) !== JSON.stringify(this.app.state.stage2.confirmedMembers)) {
          this.app.state.stage2.confirmedMembers = remoteData.stage2.confirmedMembers;
          needWorkspaceRender = true;
        }
      }
      if (remoteData.stage2.isDraftConfirmed !== undefined && remoteData.stage2.isDraftConfirmed !== this.app.state.stage2.isDraftConfirmed) {
        this.app.state.stage2.isDraftConfirmed = remoteData.stage2.isDraftConfirmed;
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

    if (remoteData.timer && this.app.state.timer) {
      if (remoteData.timer.startTimestamp) {
        // 🛡️ 修复计时器重置：接受服务端权威时间戳（无论新旧），教师重置后所有客户端同步
        this.app.state.timer.startTimestamp = remoteData.timer.startTimestamp;
      }
      if (remoteData.timer.speed !== undefined) {
        this.app.state.timer.speed = remoteData.timer.speed;
      }
      if (remoteData.timer.isRunning !== undefined) {
        this.app.state.timer.isRunning = remoteData.timer.isRunning;
      }
    }

    const stageOrder = { stage1: 1, stage2: 2, stage3: 3 };
    const currentOrder = stageOrder[this.app.state.currentStage] || 1;
    const remoteOrder = stageOrder[remoteData.currentStage] || 1;
    const groupMaxOrder = stageOrder[this.app.state.groupMaxStage || 'stage1'] || 1;

    if (remoteData.currentStage) {
      this.app.state.groupMaxStage = remoteData.currentStage;
      // 🎯 如果用户当前正在自主浏览阶段一/过往阶段，则不强制跳走，保留学生知情权与自主切换权
      if (!this.app.isViewingPastStage && remoteOrder > currentOrder && !this.app.state.isFinalSubmitted) {
        this.app.state.currentStage = remoteData.currentStage;
        needWorkspaceRender = true;
      }
    }

    this.app.saveGroupState(myGroupId);
    if (this.app && this.app.triggerStageWelcomeSpeech) {
      this.app.triggerStageWelcomeSpeech(this.app.state.currentStage || 'stage1');
    }
    if (typeof window.renderChat === 'function') window.renderChat(this.app.state);
    this.app.updateContributionUi();
    this.app.renderPresenceCursors();

    // 👨‍🏫 教师端实时同屏刷新 (当教师正在监控该小组时，实时同屏反映最新进度)
    const isTeacher = user && (user.isTeacher || user.role === 'teacher');
    if (isTeacher) {
      const appContainer = document.getElementById('app');
      if (appContainer && this.app.state.teacherActiveTab === 'view_monitoring' && typeof renderTeacherPortal === 'function') {
        const layout = appContainer.querySelector('.teacher-portal-layout');
        if (layout) this.app.state._teacherScrollTop = layout.scrollTop;
        renderTeacherPortal(appContainer, this.app.authManager, this.app.state, () => this.app.handleLogout(), () => {});
      }
    }

    if (needWorkspaceRender && user?.role === 'student' && this.app.state.studentViewMode === 'workspace') {
      const activeEl = document.activeElement;
      const isTypingInWorkspace = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') && (document.getElementById('canvas-panel')?.contains(activeEl) || document.querySelector('.contract-card')?.contains(activeEl));
      if (!isTypingInWorkspace) {
        this.app.renderStudentWorkspace();
      }
    }
  }
}
