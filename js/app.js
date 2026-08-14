/**
 * Jizhi (集智) Multi-Agent Collaborative Writing Platform
 * Clean App Controller - Production Ready Engine
 */

import { InitialState } from './state.js';
import { PresetMessages, AgentProfiles } from './agents.js';
import { AuthManager } from './auth.js';
import { renderLoginView } from './login.js';
import { renderTeacherPortal } from './teacher.js';
import { renderHeader, renderCanvas, renderChat } from './ui.js';

const STORAGE_KEY_CHAT = 'jizhi_sync_chat_v4';
const STORAGE_KEY_STAGE1 = 'jizhi_sync_s1_v4';
const STORAGE_KEY_STAGE2 = 'jizhi_sync_s2_v4';
const STORAGE_KEY_STAGE3 = 'jizhi_sync_s3_v4';
const STORAGE_KEY_STAGE_CURRENT = 'jizhi_sync_current_stage_v4';

const SERVER_URL = window.location.protocol.startsWith('http')
  ? (window.location.port ? `${window.location.protocol}//${window.location.hostname}:${window.location.port}` : window.location.origin)
  : 'http://localhost:8088';
const GROUP_ID = 'group_1';
const SERVER_POLL_INTERVAL = 2000;

class App {
  constructor() {
    this.authManager = new AuthManager();
    this.state = JSON.parse(JSON.stringify(InitialState));
    this.studentMsgCountSinceLastAgent = 0;
    this._lastServerTimestamp = 0;
    this._serverAvailable = false;
    this.initSyncStorage();
    this.initRealtimeSync();
    this.initServerSync();
    this.initTimer();
    this.renderMain();
  }

  initSyncStorage() {
    const savedChat = localStorage.getItem(STORAGE_KEY_CHAT);
    if (savedChat) {
      try {
        this.state.chatLogs = JSON.parse(savedChat);
      } catch (e) {
        this.initPresetMessages();
      }
    } else {
      this.initPresetMessages();
    }

    const savedS1 = localStorage.getItem(STORAGE_KEY_STAGE1);
    if (savedS1) {
      try {
        this.state.stage1 = { ...this.state.stage1, ...JSON.parse(savedS1) };
      } catch (e) {}
    }

    const savedS2 = localStorage.getItem(STORAGE_KEY_STAGE2);
    if (savedS2) {
      try {
        this.state.stage2 = { ...this.state.stage2, ...JSON.parse(savedS2) };
      } catch (e) {}
    }

    const savedS3 = localStorage.getItem(STORAGE_KEY_STAGE3);
    if (savedS3) {
      try {
        this.state.stage3 = { ...this.state.stage3, ...JSON.parse(savedS3) };
      } catch (e) {}
    }

    const savedStage = localStorage.getItem(STORAGE_KEY_STAGE_CURRENT);
    if (savedStage) {
      this.state.currentStage = savedStage;
    }
  }

  initPresetMessages() {
    ['stage1', 'stage2', 'stage3'].forEach(stage => {
      if (!this.state.chatLogs[stage] || this.state.chatLogs[stage].length === 0) {
        this.state.chatLogs[stage] = JSON.parse(JSON.stringify(PresetMessages[stage] || []));
      }
    });
    localStorage.setItem(STORAGE_KEY_CHAT, JSON.stringify(this.state.chatLogs));
  }

  initRealtimeSync() {
    if ('BroadcastChannel' in window) {
      this.bc = new BroadcastChannel('jizhi_pure_sync_channel_v4');
      this.bc.onmessage = (e) => {
        this.handleSyncMessage(e.data);
      };
    }

    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY_CHAT && e.newValue) {
        try {
          this.state.chatLogs = JSON.parse(e.newValue);
          renderChat(this.state);
        } catch (err) {}
      } else if (e.key === STORAGE_KEY_STAGE1 && e.newValue) {
        try {
          this.state.stage1 = JSON.parse(e.newValue);
          if (this.state.currentStage === 'stage1') this.renderStudentWorkspace();
        } catch (err) {}
      } else if (e.key === STORAGE_KEY_STAGE2 && e.newValue) {
        try {
          this.state.stage2 = JSON.parse(e.newValue);
          if (this.state.currentStage === 'stage2') this.renderStudentWorkspace();
        } catch (err) {}
      } else if (e.key === STORAGE_KEY_STAGE3 && e.newValue) {
        try {
          this.state.stage3 = JSON.parse(e.newValue);
          if (this.state.currentStage === 'stage3') this.renderStudentWorkspace();
        } catch (err) {}
      } else if (e.key === STORAGE_KEY_STAGE_CURRENT && e.newValue) {
        this.state.currentStage = e.newValue;
        this.renderStudentWorkspace();
      }
    });

    setInterval(() => {
      const latestChat = localStorage.getItem(STORAGE_KEY_CHAT);
      if (latestChat && latestChat !== JSON.stringify(this.state.chatLogs)) {
        try {
          this.state.chatLogs = JSON.parse(latestChat);
          renderChat(this.state);
        } catch (e) {}
      }

      const latestS1 = localStorage.getItem(STORAGE_KEY_STAGE1);
      if (latestS1 && latestS1 !== JSON.stringify(this.state.stage1)) {
        try {
          this.state.stage1 = JSON.parse(latestS1);
          if (this.state.currentStage === 'stage1') this.renderStudentWorkspace();
        } catch (e) {}
      }

      const latestS2 = localStorage.getItem(STORAGE_KEY_STAGE2);
      if (latestS2 && latestS2 !== JSON.stringify(this.state.stage2)) {
        try {
          this.state.stage2 = JSON.parse(latestS2);
          if (this.state.currentStage === 'stage2') this.renderStudentWorkspace();
        } catch (e) {}
      }

      const latestStage = localStorage.getItem(STORAGE_KEY_STAGE_CURRENT);
      if (latestStage && latestStage !== this.state.currentStage) {
        this.state.currentStage = latestStage;
        this.renderStudentWorkspace();
      }
    }, 200);
  }

  handleSyncMessage(data) {
    if (!data) return;
    if (data.type === 'CHAT_UPDATE') {
      this.state.chatLogs = data.chatLogs;
      renderChat(this.state);
    } else if (data.type === 'STAGE1_UPDATE') {
      this.state.stage1 = data.stage1;
      if (this.state.currentStage === 'stage1') this.renderStudentWorkspace();
    } else if (data.type === 'STAGE2_UPDATE') {
      this.state.stage2 = data.stage2;
      if (this.state.currentStage === 'stage2') this.renderStudentWorkspace();
    } else if (data.type === 'STAGE3_UPDATE') {
      this.state.stage3 = data.stage3;
      if (this.state.currentStage === 'stage3') this.renderStudentWorkspace();
    } else if (data.type === 'STAGE_CHANGE') {
      this.state.currentStage = data.stage;
      this.renderStudentWorkspace();
    }
  }

  syncChatLogs() {
    localStorage.setItem(STORAGE_KEY_CHAT, JSON.stringify(this.state.chatLogs));
    if (this.bc) {
      this.bc.postMessage({ type: 'CHAT_UPDATE', chatLogs: this.state.chatLogs });
    }
    this.pushToServer();
  }

  syncStage1() {
    localStorage.setItem(STORAGE_KEY_STAGE1, JSON.stringify(this.state.stage1));
    if (this.bc) {
      this.bc.postMessage({ type: 'STAGE1_UPDATE', stage1: this.state.stage1 });
    }
    this.pushToServer();
  }

  syncStage2() {
    localStorage.setItem(STORAGE_KEY_STAGE2, JSON.stringify(this.state.stage2));
    if (this.bc) {
      this.bc.postMessage({ type: 'STAGE2_UPDATE', stage2: this.state.stage2 });
    }
    this.pushToServer();
  }

  syncStage3() {
    localStorage.setItem(STORAGE_KEY_STAGE3, JSON.stringify(this.state.stage3));
    if (this.bc) {
      this.bc.postMessage({ type: 'STAGE3_UPDATE', stage3: this.state.stage3 });
    }
    this.pushToServer();
  }

  syncStageChange(stage) {
    localStorage.setItem(STORAGE_KEY_STAGE_CURRENT, stage);
    if (this.bc) {
      this.bc.postMessage({ type: 'STAGE_CHANGE', stage });
    }
    this.pushToServer();
  }

  async pushToServer() {
    if (!this._serverAvailable) return;
    const payload = {
      timestamp: Date.now(),
      chatLogs: this.state.chatLogs,
      stage1: this.state.stage1,
      stage2: this.state.stage2,
      stage3: this.state.stage3,
      currentStage: this.state.currentStage
    };
    try {
      await fetch(`${SERVER_URL}/api/snapshot?groupId=${GROUP_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      this._serverAvailable = false;
    }
  }

  async pollFromServer() {
    try {
      const res = await fetch(`${SERVER_URL}/api/snapshot?groupId=${GROUP_ID}`, {
        signal: AbortSignal.timeout(3000)
      });
      if (!res.ok) return;
      const data = await res.json();
      this._serverAvailable = true;

      if (!data || !data.timestamp || data.timestamp <= this._lastServerTimestamp) return;
      this._lastServerTimestamp = data.timestamp;

      let changed = false;

      if (data.chatLogs) {
        const localJson = JSON.stringify(this.state.chatLogs);
        const remoteJson = JSON.stringify(data.chatLogs);
        if (localJson !== remoteJson) {
          this.state.chatLogs = data.chatLogs;
          localStorage.setItem(STORAGE_KEY_CHAT, remoteJson);
          renderChat(this.state);
        }
      }

      if (data.stage1) {
        const localJson = JSON.stringify(this.state.stage1);
        const remoteJson = JSON.stringify(data.stage1);
        if (localJson !== remoteJson) {
          this.state.stage1 = data.stage1;
          localStorage.setItem(STORAGE_KEY_STAGE1, remoteJson);
          changed = true;
        }
      }

      if (data.stage2) {
        const localJson = JSON.stringify(this.state.stage2);
        const remoteJson = JSON.stringify(data.stage2);
        if (localJson !== remoteJson) {
          this.state.stage2 = data.stage2;
          localStorage.setItem(STORAGE_KEY_STAGE2, remoteJson);
          changed = true;
        }
      }

      if (data.stage3) {
        const localJson = JSON.stringify(this.state.stage3);
        const remoteJson = JSON.stringify(data.stage3);
        if (localJson !== remoteJson) {
          this.state.stage3 = data.stage3;
          localStorage.setItem(STORAGE_KEY_STAGE3, remoteJson);
          changed = true;
        }
      }

      if (data.currentStage && data.currentStage !== this.state.currentStage) {
        this.state.currentStage = data.currentStage;
        localStorage.setItem(STORAGE_KEY_STAGE_CURRENT, data.currentStage);
        changed = true;
      }

      if (changed) {
        this.renderStudentWorkspace();
      }
    } catch (e) {
      if (this._serverAvailable) {
        this._serverAvailable = false;
      }
    }
  }

  async initServerSync() {
    try {
      const res = await fetch(`${SERVER_URL}/api/snapshot?groupId=${GROUP_ID}`, {
        signal: AbortSignal.timeout(3000)
      });
      if (res.ok) {
        this._serverAvailable = true;
        await this.pollFromServer();
      }
    } catch (e) {
      this._serverAvailable = false;
    }

    setInterval(() => this.pollFromServer(), SERVER_POLL_INTERVAL);
  }

  initTimer() {
    setInterval(() => {
      const currentUser = this.authManager.getCurrentUser();
      if (currentUser && currentUser.role === 'student' && this.state.timer.isRunning) {
        this.state.timer.elapsedSeconds += 1 * this.state.timer.speed;
        
        const min = this.state.timer.elapsedSeconds / 60;
        if (min >= 25 && this.state.currentStage === 'stage1') {
          this.switchStage('stage2');
        } else if (min >= 130 && this.state.currentStage === 'stage2') {
          this.switchStage('stage3');
        }

        renderHeader(
          this.state,
          currentUser,
          this.authManager.getAnnouncements(),
          (s) => this.switchStage(s),
          (sp) => this.setSpeed(sp),
          () => this.handleLogout(),
          () => this.switchToTeacherView(),
          () => this.showAnnouncementModal()
        );
      }
    }, 1000);
  }

  renderMain() {
    const currentUser = this.authManager.getCurrentUser();
    const appEl = document.getElementById('app');
    if (!appEl) return;

    if (!currentUser) {
      appEl.className = 'app-login-mode';
      renderLoginView(appEl, this.authManager, () => this.renderMain());
      return;
    }

    if (currentUser.role === 'teacher') {
      appEl.className = 'app-teacher-mode';
      renderTeacherPortal(
        appEl,
        this.authManager,
        this.state,
        () => this.handleLogout(),
        () => {
          const users = this.authManager.getUsers();
          const studentA = users.find(u => u.username === 'liming' || u.email === 'studentA@jizhi.edu');
          if (studentA) {
            sessionStorage.setItem('jizhi_current_user', JSON.stringify(studentA));
            localStorage.setItem('jizhi_current_user', JSON.stringify(studentA));
            this.renderMain();
          }
        }
      );
    } else {
      appEl.className = 'app-student-mode';
      appEl.innerHTML = `
        <header class="app-header" id="app-header"></header>
        <div class="main-content">
          <main class="canvas-panel" id="canvas-panel"></main>
          <aside class="chat-panel">
            <div class="chat-header">
              <div class="chat-title">
                <span>💬 多智能体协同对话管道</span>
              </div>
              <div class="active-agent-pills">
                <span class="agent-pill" style="color:#8b5cf6; border-color:#8b5cf6;">🎪 拍卖师</span>
                <span class="agent-pill" style="color:#10b981; border-color:#10b981;">🤝 责任编辑</span>
                <span class="agent-pill" style="color:#0284c7; border-color:#0284c7;">📝 审稿编辑</span>
              </div>
            </div>

            <div class="chat-stream" id="chat-stream"></div>

            <!-- @ Mention Popover Menu -->
            <div class="at-mention-menu" id="at-mention-menu" style="display:none;">
              <div class="at-menu-header">👥 提示：选择需要 @ 的同学或 AI 智能体</div>
              <div class="at-menu-list">
                <div class="at-group-title">👥 小组成员</div>
                <div class="at-item" data-mention="@李明(学生A/组长)">👨‍🎓 @李明 (学生A/组长)</div>
                <div class="at-item" data-mention="@王芳(学生B/组员)">👩‍🎓 @王芳 (学生B/组员)</div>
                <div class="at-item" data-mention="@陈强(学生C/组员)">🧑‍🎓 @陈强 (学生C/组员)</div>
                
                <div class="at-group-title" style="margin-top:6px;">🤖 AI 学术智能体</div>
                <div class="at-item agent" data-mention="@拍卖师 Agent">🎪 @拍卖师 Agent (选题与竞拍指导)</div>
                <div class="at-item agent" data-mention="@责任编辑 Agent">🤝 @责任编辑 Agent (分工与过程学伴)</div>
                <div class="at-item agent" data-mention="@审稿编辑 Agent">📝 @审稿编辑 Agent (学术结构与规范导师)</div>
                <div class="at-item agent" data-mention="@反方委员 Agent">🔴 @反方委员 Agent (答辩质疑推演)</div>
              </div>
            </div>

            <!-- Emoji Picker Bar -->
            <div class="emoji-bar" id="emoji-bar">
              <span class="emoji-btn" data-emoji="😊">😊</span>
              <span class="emoji-btn" data-emoji="👍">👍</span>
              <span class="emoji-btn" data-emoji="💡">💡</span>
              <span class="emoji-btn" data-emoji="📝">📝</span>
              <span class="emoji-btn" data-emoji="📚">📚</span>
              <span class="emoji-btn" data-emoji="🎓">🎓</span>
              <span class="emoji-btn" data-emoji="🤝">🤝</span>
              <span class="emoji-btn" data-emoji="✅">✅</span>
              <span class="emoji-btn" data-emoji="❓">❓</span>
              <span class="emoji-btn" data-emoji="🚀">🚀</span>
            </div>

            <!-- Chat Input Bar -->
            <div class="chat-input-bar">
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
      this.checkUnreadAnnouncements();
    }
  }

  checkUnreadAnnouncements() {
    const anns = this.authManager.getAnnouncements();
    const unread = anns.find(a => !a.readStatus || !a.readStatus['group_1']);
    if (unread) {
      setTimeout(() => this.showAnnouncementModal(unread), 800);
    }
  }

  showAnnouncementModal(targetAnn = null) {
    document.querySelectorAll('.modal-overlay').forEach(el => el.remove());

    const anns = this.authManager.getAnnouncements();
    const ann = targetAnn || (anns.length > 0 ? anns[0] : null);
    if (!ann) {
      alert('📢 暂无新的课堂通知！');
      return;
    }

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="student-ann-modal-card">
        <div class="ann-modal-header">
          <div class="ann-header-left">
            <div class="ann-bell-icon">🔔</div>
            <div>
              <div class="ann-badge-tag">📢 课堂即时教学广播通知</div>
              <h3 class="ann-modal-title">${ann.title}</h3>
            </div>
          </div>
          <button class="modal-close-btn" id="btn-close-ann-popup">✕</button>
        </div>

        <div class="ann-modal-body">
          <div class="ann-meta-bar">
            <span>发布教师: <b>${ann.author || '主讲教师'}</b></span>
            <span>发布时间: <b>${ann.time}</b></span>
          </div>

          <div class="ann-content-box">
            ${ann.content}
          </div>

          ${ann.attachment ? `
            <div class="ann-attachment-card">
              <div class="att-info">
                <span class="att-icon">📎</span>
                <div>
                  <div class="att-name">${ann.attachment.name}</div>
                  <div class="att-size">教学随附资源文件 (${ann.attachment.size})</div>
                </div>
              </div>
              <button class="att-download-btn" onclick="alert('📥 已成功下载教学随附资源：${ann.attachment.name}')">
                📥 下载资源
              </button>
            </div>
          ` : ''}
        </div>

        <div class="ann-modal-footer">
          <button class="ann-confirm-btn" id="btn-read-confirm">
            ✅ 我已阅读并确认 (自动同步至教师端追踪矩阵)
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => document.body.removeChild(modal);
    modal.querySelector('#btn-close-ann-popup').addEventListener('click', closeModal);

    modal.querySelector('#btn-read-confirm').addEventListener('click', () => {
      this.authManager.markAnnouncementRead(ann.id, 'group_1');
      closeModal();
      this.renderStudentWorkspace();
    });
  }

  handleLogout() {
    this.authManager.logout();
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
    const atMenu = document.getElementById('at-mention-menu');
    if (!input || !sendBtn) return;

    if (emojiBar) {
      emojiBar.querySelectorAll('.emoji-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          input.value += btn.dataset.emoji;
          input.focus();
        });
      });
    }

    input.addEventListener('input', () => {
      const val = input.value;
      const lastChar = val.slice(-1);
      if (lastChar === '@' || (val.includes('@') && !val.includes(' '))) {
        atMenu.style.display = 'block';
      } else if (!val.includes('@')) {
        atMenu.style.display = 'none';
      }
    });

    atMenu.querySelectorAll('.at-item').forEach(item => {
      item.addEventListener('click', () => {
        const mentionTag = item.dataset.mention;
        const lastAtIndex = input.value.lastIndexOf('@');
        if (lastAtIndex !== -1) {
          input.value = input.value.substring(0, lastAtIndex) + mentionTag + ' ';
        } else {
          input.value += mentionTag + ' ';
        }
        atMenu.style.display = 'none';
        input.focus();
      });
    });

    const handleSend = () => {
      const text = input.value.trim();
      if (!text) return;

      const currentUser = this.authManager.getCurrentUser();
      const studentCode = currentUser ? (currentUser.studentCode || 'A') : 'A';
      const currentStage = this.state.currentStage;

      const msgObj = {
        sender: studentCode,
        text: text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      if (!this.state.chatLogs[currentStage]) {
        this.state.chatLogs[currentStage] = [];
      }
      this.state.chatLogs[currentStage].push(msgObj);

      input.value = '';
      atMenu.style.display = 'none';

      this.studentMsgCountSinceLastAgent += 1;

      this.syncChatLogs();
      renderChat(this.state);
      this.triggerAgentReplyIfNeeded(text);
    };

    sendBtn.addEventListener('click', handleSend);
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleSend();
    });
  }

  triggerAgentReplyIfNeeded(userMsg) {
    const isExplicitMention = userMsg.includes('@');
    const isMilestoneKeyword = userMsg.includes('分工') || userMsg.includes('确定') || userMsg.includes('结论') || userMsg.includes('方案') || userMsg.includes('意见') || userMsg.includes('提案');
    const hasEnoughDiscussion = this.studentMsgCountSinceLastAgent >= 3;

    if (!isExplicitMention && !isMilestoneKeyword && !hasEnoughDiscussion) {
      return;
    }

    setTimeout(() => {
      const stage = this.state.currentStage;
      let replyAgent = 'reviewingEditor';
      let replyText = '';

      if (userMsg.includes('@审稿编辑') || userMsg.includes('@审稿编辑 Agent')) {
        replyAgent = 'reviewingEditor';
        replyText = `📝 【审稿编辑针对性指导】：收到你的求助！在撰写时，请确保“三、文献综述”中提炼的核心概念与“四、研究设计与方法”中的测量量表形成严密的对应关系。审稿编辑只提供逻辑架构建议，请组员通力协作完善具体正文！`;
      } else if (userMsg.includes('@责任编辑') || userMsg.includes('@责任编辑 Agent')) {
        replyAgent = 'managingEditor';
        replyText = `🤝 【责任编辑过程学伴回复】：收到 @ 呼叫！目前小组正在积极协同。请大家注意各章节进度衔接，遇到分工难题可随时讨论拆解。`;
      } else if (userMsg.includes('@拍卖师') || userMsg.includes('@拍卖师 Agent')) {
        replyAgent = 'auctioneer';
        replyText = `🎪 【拍卖师选题顾问回复】：收到 @ 呼叫！建议从小组成员提出的提案中提取最具有创新性与可行性的核心观点，协商融合为统一主题并在合约中确认！`;
      } else if (userMsg.includes('@反方委员') || userMsg.includes('@反方委员 Agent')) {
        replyAgent = 'opponent';
        replyText = `🔴 【反方委员预演提醒】：收到 @ 呼叫！在答辩阶段，我们将重点质询研究假设的操作化定义、样本统计效力及文献逻辑冲突。请在方案中做好学术防御！`;
      } else {
        if (stage === 'stage1') {
          replyAgent = 'auctioneer';
          replyText = `🎪 【拍卖师阶段引导】组内讨论正在进行中！请大家在左侧提交各自的选题提案，并尽快完成投票与合作合约签署！`;
        } else if (stage === 'stage2') {
          replyAgent = 'reviewingEditor';
          replyText = `📝 【审稿编辑高阶引导】关注到组内的写作进展。请在研究方法章节明确变量定义，确保研究设计具备可重复性与内部效度！`;
        } else if (stage === 'stage3') {
          replyAgent = 'neutral';
          replyText = `🟡 【中间委员裁决提示】针对委员会的意见，请小组在左侧面板记录采纳方案，并对终稿完成最终校订！`;
        }
      }

      this.studentMsgCountSinceLastAgent = 0;

      const agentMsgObj = {
        sender: replyAgent,
        text: replyText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      if (!this.state.chatLogs[stage]) this.state.chatLogs[stage] = [];
      this.state.chatLogs[stage].push(agentMsgObj);

      this.syncChatLogs();
      renderChat(this.state);
    }, 1200);
  }

  handleVoteCast(proposalId) {
    const user = this.state.currentUser;
    const s1 = this.state.stage1;

    if (s1.hasVoted && s1.hasVoted[user]) {
      alert('⚠️ 投票已被锁定！每位成员首次投票后不能再修改选项。');
      return;
    }

    if (!s1.hasVoted) s1.hasVoted = {};
    if (!s1.votes) s1.votes = {};
    s1.votes[user] = proposalId;
    s1.hasVoted[user] = true;

    const proposal = (s1.proposals || []).find(p => p.id === proposalId);
    const votesCastCount = Object.values(s1.hasVoted).filter(Boolean).length;

    const voteMsg = {
      sender: user,
      text: `📢 [投票告知]: 我已确认投票支持提案《${proposal ? proposal.title : proposalId}》！（当前全组已集齐 ${votesCastCount}/3 票）`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    if (!this.state.chatLogs.stage1) this.state.chatLogs.stage1 = [];
    this.state.chatLogs.stage1.push(voteMsg);
    this.syncStage1();
    this.syncChatLogs();

    if (votesCastCount >= 3) {
      setTimeout(() => {
        const tally = {};
        Object.values(s1.votes).forEach(pId => {
          if (pId) tally[pId] = (tally[pId] || 0) + 1;
        });

        let summaryText = '🎪 【拍卖师宣布计票结果】：全员投票已完毕！\n';
        (s1.proposals || []).forEach(p => {
          summaryText += `• 《${p.title}》得票: ${tally[p.id] || 0} 票\n`;
        });
        summaryText += `\n🔨 拍卖师建议：请组长与组员根据投票结果在下方【合作学术合约卡片】中确认最终融合主题与分工细则，全员签署后即可解锁阶段二！`;

        const summaryMsg = {
          sender: 'auctioneer',
          text: summaryText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        this.state.chatLogs.stage1.push(summaryMsg);
        this.syncChatLogs();
        renderChat(this.state);
      }, 1000);
    }

    this.renderStudentWorkspace();
  }

  showProposalSubmissionModal() {
    document.querySelectorAll('.modal-overlay').forEach(el => el.remove());

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="teacher-modal-card" style="width:560px;">
        <div class="teacher-modal-header task-theme-gradient">
          <div class="modal-header-title">
            <span class="modal-icon">💡</span>
            <div>
              <h3>提交我的选题提案 (拍品)</h3>
              <p>陈述你的研究观点与学术理由，供拍卖师鉴定与组内竞拍</p>
            </div>
          </div>
          <button class="modal-close-btn" id="btn-close-prop-modal">✕</button>
        </div>

        <div class="teacher-modal-body">
          <div class="teacher-form-group">
            <label><span class="req">*</span> 研究观点 / 拟定课题名称</label>
            <input type="text" id="prop-title-input" class="teacher-input fancy" placeholder="例如：生成式AI对大学生协作学习投入度的影响机制研究">
          </div>

          <div class="teacher-form-group">
            <label><span class="req">*</span> 选题分类方向</label>
            <select id="prop-category-select" class="teacher-input fancy">
              <option value="前沿探索">🌟 前沿探索 (结合最新AI/技术)</option>
              <option value="经典实证">📑 经典实证 (聚焦学习机制/痛点)</option>
              <option value="跨界交叉">🔬 跨界交叉 (心理学/教育技术融合)</option>
            </select>
          </div>

          <div class="teacher-form-group">
            <label><span class="req">*</span> 学术理由与背景依据 (阐明选题的价值与必要性)</label>
            <textarea id="prop-rationale-input" class="teacher-textarea fancy" style="min-height:90px;" placeholder="说明选择该主题的现实背景、理论价值与实践意义..."></textarea>
          </div>
        </div>

        <div class="teacher-modal-footer">
          <button class="modal-btn cancel" id="btn-cancel-prop">取消</button>
          <button class="modal-btn submit task-theme" id="btn-submit-proposal">🚀 确认提交提案</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => document.body.removeChild(modal);
    modal.querySelector('#btn-close-prop-modal').addEventListener('click', closeModal);
    modal.querySelector('#btn-cancel-prop').addEventListener('click', closeModal);

    modal.querySelector('#btn-submit-proposal').addEventListener('click', () => {
      const title = modal.querySelector('#prop-title-input').value.trim();
      const category = modal.querySelector('#prop-category-select').value;
      const rationale = modal.querySelector('#prop-rationale-input').value.trim();

      if (!title || !rationale) {
        alert('⚠️ 请填齐提案标题与学术理由！');
        return;
      }

      const currentUser = this.authManager.getCurrentUser();
      const studentCode = currentUser ? (currentUser.studentCode || 'A') : 'A';
      const studentName = currentUser ? currentUser.name : '学生';

      const newProposal = {
        id: 'prop_' + Date.now(),
        author: studentCode,
        title,
        category,
        rationale,
        metrics: { literature: '丰富', innovation: '高', risk: '中' }
      };

      if (!this.state.stage1.proposals) this.state.stage1.proposals = [];
      this.state.stage1.proposals.push(newProposal);

      const msg = {
        sender: studentCode,
        text: `💡 我提交了提案【观点】：${title}\n【学术理由】：${rationale}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      if (!this.state.chatLogs.stage1) this.state.chatLogs.stage1 = [];
      this.state.chatLogs.stage1.push(msg);

      closeModal();
      this.syncStage1();
      this.syncChatLogs();
      this.renderStudentWorkspace();

      setTimeout(() => {
        const agentMsg = {
          sender: 'auctioneer',
          text: `🎪 【拍卖师深度鉴定】：收到 ${studentName} 提交的拍品《${title}》！选题切中【${category}】方向，理由充分。请其他伙伴继续提交提案或在提案卡片上开展竞拍投票！`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        this.state.chatLogs.stage1.push(agentMsg);
        this.syncChatLogs();
        renderChat(this.state);
      }, 800);
    });
  }

  switchStage(newStage) {
    this.state.currentStage = newStage;
    this.syncStageChange(newStage);

    if (newStage === 'stage3' && (!this.state.stage3.feedbackItems || this.state.stage3.feedbackItems.length === 0)) {
      this.state.stage3.feedbackItems = [
        {
          id: 'f1',
          role: 'opponent',
          title: '测量量表效度与变量匹配质疑',
          content: '请说明方案中提出的研究假设与测量量表之间是否存在 1 对 1 精确映射关系？如何避免自编问卷带来的效度威胁？',
          status: 'pending',
          response: ''
        },
        {
          id: 'f2',
          role: 'opponent',
          title: '样本量与统计检验力分析',
          content: '研究设计中的样本量是否经过严格的统计效力分析（如 G*Power 分析）？如何确保能够检测出预期的中等效应量？',
          status: 'pending',
          response: ''
        },
        {
          id: 'f3',
          role: 'proponent',
          title: '方案结构严密性肯定',
          content: '研究方案整体框架符合 SSRL 协作规范，概念界定与研究问题设计具有良好的学术探索价值。',
          status: 'acknowledged',
          response: '感谢肯定，小组将保持该核心设计。'
        }
      ];
      this.syncStage3();
    }

    this.renderStudentWorkspace();
  }

  setSpeed(newSpeed) {
    this.state.timer.speed = newSpeed;
    const currentUser = this.authManager.getCurrentUser();
    renderHeader(
      this.state,
      currentUser,
      this.authManager.getAnnouncements(),
      (s) => this.switchStage(s),
      (sp) => this.setSpeed(sp),
      () => this.handleLogout(),
      () => this.switchToTeacherView(),
      () => this.showAnnouncementModal()
    );
  }

  renderStudentWorkspace() {
    const currentUser = this.authManager.getCurrentUser();
    this.state.currentUser = currentUser ? (currentUser.studentCode || 'A') : 'A';

    renderHeader(
      this.state,
      currentUser,
      this.authManager.getAnnouncements(),
      (s) => this.switchStage(s),
      (sp) => this.setSpeed(sp),
      () => this.handleLogout(),
      () => this.switchToTeacherView(),
      () => this.showAnnouncementModal()
    );

    renderCanvas(this.state, {
      onVote: (propId) => {
        this.handleVoteCast(propId);
      },
      onOpenProposalModal: () => {
        this.showProposalSubmissionModal();
      },
      onContractTopicChange: (topic) => {
        if (!this.state.stage1.contract) this.state.stage1.contract = {};
        this.state.stage1.mergedTitle = topic;
        this.state.stage1.contract.topic = topic;
        this.syncStage1();
      },
      onContractTaskChange: (code, text) => {
        if (!this.state.stage1.contract) this.state.stage1.contract = {};
        if (!this.state.stage1.contract.taskAssignments) this.state.stage1.contract.taskAssignments = {};
        this.state.stage1.contract.taskAssignments[code] = text;
        this.syncStage1();
      },
      onConfirmContract: () => {
        const user = this.state.currentUser;
        const s1 = this.state.stage1;
        if (!s1.contract.confirmedMembers) {
          s1.contract.confirmedMembers = { 'A': false, 'B': false, 'C': false };
        }

        s1.contract.confirmedMembers[user] = true;
        const confirmedCount = Object.values(s1.contract.confirmedMembers).filter(Boolean).length;
        const memberName = this.state.members[user] ? this.state.members[user].name : user;

        const confirmMsg = {
          sender: user,
          text: `📢 [合约签署告知]: 我 (${memberName}) 已确认签署合作学术合约！（全组签署进度: ${confirmedCount}/3 人）`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        if (!this.state.chatLogs.stage1) this.state.chatLogs.stage1 = [];
        this.state.chatLogs.stage1.push(confirmMsg);
        this.syncStage1();
        this.syncChatLogs();

        if (confirmedCount < 3) {
          alert(`✅ 你 (${memberName}) 已成功签署合约！\n\n目前组内签署进度：${confirmedCount}/3 人。\n需全组 3 名成员全部签署后方可解锁阶段二！`);
        } else {
          s1.contract.isConfirmed = true;
          this.syncStage1();
          setTimeout(() => {
            const finalMsg = {
              sender: 'auctioneer',
              text: `🎪 【拍卖师宣布】：全员 3/3 名成员已全部完成签署！学术合作合约正式生效，阶段一圆满结束，系统自动解锁【阶段二：学术编辑部】！`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };
            this.state.chatLogs.stage1.push(finalMsg);
            this.syncChatLogs();
            alert('🎉 恭喜！组内 3 位成员全部完成签署！学术合作合约生效，系统解锁【阶段二：学术编辑部】！');
            this.switchStage('stage2');
          }, 600);
        }

        this.renderStudentWorkspace();
      },
      onUnifiedContentChange: (newContent) => {
        this.state.stage2.unifiedContent = newContent;
        const user = this.state.currentUser || 'A';
        if (!this.state.stage2.memberTypedCounts) this.state.stage2.memberTypedCounts = { 'A': 0, 'B': 0, 'C': 0 };
        this.state.stage2.memberTypedCounts[user] = (this.state.stage2.memberTypedCounts[user] || 0) + 1;

        const cleanText = newContent.replace(/<[^>]*>/g, '');
        const totalWords = cleanText.length || 1;

        const countA = (this.state.stage2.memberTypedCounts.A || 0) + 1;
        const countB = (this.state.stage2.memberTypedCounts.B || 0) + 1;
        const countC = (this.state.stage2.memberTypedCounts.C || 0) + 1;
        const totalTyped = countA + countB + countC;

        const pctA = Math.round((countA / totalTyped) * 100);
        const pctB = Math.round((countB / totalTyped) * 100);
        const pctC = 100 - pctA - pctB;

        this.state.stage2.memberContributions = {
          'A': { words: Math.round(totalWords * pctA / 100), percentage: pctA },
          'B': { words: Math.round(totalWords * pctB / 100), percentage: pctB },
          'C': { words: Math.round(totalWords * pctC / 100), percentage: pctC }
        };

        this.syncStage2();
      },
      onOpenCaseModal: () => {
        alert('📖 审稿编辑推送的【学术方案规范指南】：\n\n1. 标题与摘要：明确课题核心变量与理论切入点；\n2. 研究问题与假设：自变量与因变量形成逻辑因果闭环；\n3. 研究设计：阐述准实验/实证设计、样本抽样、测量工具与统计方法；\n4. 反思与局限：坦诚剖析威胁效度的因素并给出应对方案。');
      },
      onOpenMeetingModal: () => {
        this.showMeetingModal();
      },
      onAdoptFeedback: (id) => {
        const item = (this.state.stage3.feedbackItems || []).find(f => f.id === id);
        if (item) {
          const resp = prompt(`请代表小组输入针对【${item.title}】的统一裁决回复/修改对策：`, item.response || '已在正文中补充说明与相关文献支持。');
          if (resp) {
            item.status = 'adopted';
            item.response = resp;
            this.syncStage3();
            this.renderStudentWorkspace();
          }
        }
      },
      onFinalSubmit: () => {
        if (confirm('🚀 确认提交最终研究设计方案并归档呈递给教师端吗？提交后正文将进入只读保护状态。')) {
          this.state.stage3.finalSubmitted = true;
          this.state.stage3.finalSubmissionTime = new Date().toLocaleTimeString();
          this.syncStage3();
          alert('🎉 恭喜小组！研究方案已成功呈递至教师端！');
          this.renderStudentWorkspace();
        }
      }
    });

    renderChat(this.state);
  }

  showMeetingModal() {
    document.querySelectorAll('.modal-overlay').forEach(el => el.remove());

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="teacher-modal-card" style="width:600px;">
        <div class="teacher-modal-header ann-theme">
          <div class="modal-header-title">
            <span class="modal-icon">📢</span>
            <div>
              <h3>学术编辑部【半程编辑会议】</h3>
              <p>共享调节 3 维自评与半程修正清单动态生成</p>
            </div>
          </div>
          <button class="modal-close-btn" id="btn-close-meeting">✕</button>
        </div>

        <div class="teacher-modal-body">
          <div class="teacher-form-group">
            <label style="font-size:13px;">🌟 维度 ①：内容逻辑与学术严谨度打分 (1-5星)</label>
            <div class="rating-stars" id="star-rating-logic" style="margin:4px 0;">
              <span class="star active" data-val="1">★</span>
              <span class="star active" data-val="2">★</span>
              <span class="star active" data-val="3">★</span>
              <span class="star active" data-val="4">★</span>
              <span class="star" data-val="5">★</span>
            </div>
          </div>

          <div class="teacher-form-group">
            <label style="font-size:13px;">👥 维度 ②：团队分工与参与平衡度打分 (1-5星)</label>
            <div class="rating-stars" id="star-rating-balance" style="margin:4px 0;">
              <span class="star active" data-val="1">★</span>
              <span class="star active" data-val="2">★</span>
              <span class="star active" data-val="3">★</span>
              <span class="star active" data-val="4">★</span>
              <span class="star active" data-val="5">★</span>
            </div>
          </div>

          <div class="teacher-form-group">
            <label style="font-size:13px;">⚠️ 维度 ③：当前组内面临的核心瓶颈难点</label>
            <select id="meeting-bottleneck-select" class="teacher-input fancy">
              <option value="假设与研究设计测量工具对应不明确">假设与研究设计测量工具对应不明确</option>
              <option value="相关理论支撑与参考文献力度不足">相关理论支撑与参考文献力度不足</option>
              <option value="时间分配紧张，后半程写作进度滞后">时间分配紧张，后半程写作进度滞后</option>
              <option value="章节之间过渡衔接缺乏逻辑闭环">章节之间过渡衔接缺乏逻辑闭环</option>
            </select>
          </div>

          <div class="teacher-form-group">
            <label style="font-size:13px;">✍️ 组内自评与补充说明</label>
            <textarea id="meeting-input-text" class="teacher-textarea fancy" style="min-height:75px;" placeholder="请输入组内的自评反思或需要审稿编辑解答的问题..."></textarea>
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

    let logicRating = 4;
    let balanceRating = 5;

    modal.querySelectorAll('#star-rating-logic .star').forEach(s => {
      s.addEventListener('click', (e) => {
        logicRating = Number(e.target.dataset.val);
        modal.querySelectorAll('#star-rating-logic .star').forEach(st => {
          st.classList.toggle('active', Number(st.dataset.val) <= logicRating);
        });
      });
    });

    modal.querySelectorAll('#star-rating-balance .star').forEach(s => {
      s.addEventListener('click', (e) => {
        balanceRating = Number(e.target.dataset.val);
        modal.querySelectorAll('#star-rating-balance .star').forEach(st => {
          st.classList.toggle('active', Number(st.dataset.val) <= balanceRating);
        });
      });
    });

    modal.querySelector('#btn-submit-meeting').addEventListener('click', () => {
      const bottleneck = modal.querySelector('#meeting-bottleneck-select').value;
      const userText = modal.querySelector('#meeting-input-text').value.trim() || '组内已完成前半程撰写，正积极推进。';
      closeModal();

      this.state.stage2.actionPlan = {
        isGenerated: true,
        items: [
          `修订项①: 针对【${bottleneck}】，在第四节研究设计中强化自变量与量表工具的对应说明。`,
          `修订项②: 依据逻辑严谨度（${logicRating}星）自评结果，梳理一至三节的因果推理链条。`,
          `修订项③: 维持当前团队协同节奏（分工评价 ${balanceRating}星），在后半程重点攻克不足反思与文献表。`
        ]
      };

      const meetingMsg = {
        sender: 'managingEditor',
        text: `📢 【编辑会议① 汇总】：全员完成 3 维评价（逻辑严谨度 ${logicRating}星，分工平衡度 ${balanceRating}星，核心瓶颈：${bottleneck}）。组内自评：“${userText}”。`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      if (!this.state.chatLogs.stage2) this.state.chatLogs.stage2 = [];
      this.state.chatLogs.stage2.push(meetingMsg);
      this.syncStage2();
      this.syncChatLogs();

      setTimeout(() => {
        const feedbackMsg = {
          sender: 'reviewingEditor',
          text: `📝 【审稿编辑针对性反馈】：结合大家的自评，针对瓶颈“${bottleneck}”，建议对照学术规范，在方法部分明确操作化测量指标。请大家按照生成的修正清单分工修改！`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        this.state.chatLogs.stage2.push(feedbackMsg);
        this.syncChatLogs();
        renderChat(this.state);
        this.renderStudentWorkspace();
      }, 1000);

      renderChat(this.state);
      this.renderStudentWorkspace();
    });
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
