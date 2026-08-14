/**
 * Jizhi (集智) Multi-Agent Collaborative Writing Platform
 * Clean UI Renderer
 */

import { AgentProfiles } from './agents.js';

export function renderHeader(state, currentUser, announcements, onStageChange, onSpeedChange, onLogout, onSwitchTeacher, onOpenAnnModal) {
  const header = document.getElementById('app-header');
  if (!header) return;
  const elapsedMin = Math.floor(state.timer.elapsedSeconds / 60);
  const remainingMin = Math.max(0, 150 - elapsedMin);
  const unreadAnnCount = announcements ? announcements.filter(a => !a.readStatus || !a.readStatus['group_1']).length : 0;

  header.innerHTML = `
    <div class="brand-section">
      <div class="brand-logo">集智 JIZHI</div>
      <div class="brand-badge">🎓 ${currentUser ? currentUser.name : '学生端'}</div>
    </div>

    <nav class="stage-nav">
      <button class="stage-btn ${state.currentStage === 'stage1' ? 'active' : ''}" data-stage="stage1">
        🎪 阶段一：学术拍卖会 (25m)
      </button>
      <button class="stage-btn ${state.currentStage === 'stage2' ? 'active' : ''}" data-stage="stage2">
        📰 阶段二：学术编辑部 (105m)
      </button>
      <button class="stage-btn ${state.currentStage === 'stage3' ? 'active' : ''}" data-stage="stage3">
        🎓 阶段三：答辩擂台 (20m)
      </button>
    </nav>

    <div class="header-controls">
      <button class="nav-ann-bell-btn ${unreadAnnCount > 0 ? 'has-unread' : ''}" id="btn-header-ann-bell" title="课堂通知">
        🔔 消息 ${unreadAnnCount > 0 ? `<span class="unread-count">${unreadAnnCount}</span>` : ''}
      </button>

      <div class="timer-box" style="font-weight:700; color:#0284c7; background:rgba(2,132,199,0.1); padding:4px 10px; border-radius:6px; border:1px solid rgba(2,132,199,0.2);">
        ⏱️ 剩余 ${remainingMin} 分钟
      </div>

      <select class="speed-selector" id="speed-select" title="流速倍率" style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:6px; padding:4px 6px; font-weight:600;">
        <option value="1" ${state.timer.speed === 1 ? 'selected' : ''}>1x 正常</option>
        <option value="5" ${state.timer.speed === 5 ? 'selected' : ''}>5x 快进</option>
        <option value="10" ${state.timer.speed === 10 ? 'selected' : ''}>10x 演示</option>
      </select>

      <button id="btn-switch-teacher-view" class="header-icon-btn" title="切换至教师端" style="background:rgba(99,102,241,0.1); color:#4f46e5; border:1px solid rgba(99,102,241,0.2);">
        👩‍🏫 教师端
      </button>
      <button id="btn-user-logout" class="header-icon-btn logout" title="退出登录" style="background:rgba(239,68,68,0.1); color:#dc2626; border:1px solid rgba(239,68,68,0.2);">
        退出
      </button>
    </div>
  `;

  header.querySelectorAll('.stage-btn').forEach(btn => {
    btn.addEventListener('click', () => onStageChange(btn.dataset.stage));
  });

  const speedSelect = header.querySelector('#speed-select');
  if (speedSelect) {
    speedSelect.addEventListener('change', (e) => onSpeedChange(Number(e.target.value)));
  }

  const logoutBtn = header.querySelector('#btn-user-logout');
  if (logoutBtn) logoutBtn.addEventListener('click', () => onLogout());

  const switchBtn = header.querySelector('#btn-switch-teacher-view');
  if (switchBtn) switchBtn.addEventListener('click', () => onSwitchTeacher());

  const annBell = header.querySelector('#btn-header-ann-bell');
  if (annBell) annBell.addEventListener('click', () => onOpenAnnModal());
}

export function renderCanvas(state, handlers) {
  const canvas = document.getElementById('canvas-panel');
  if (!canvas) return;

  if (state.currentStage === 'stage1') {
    renderStage1Canvas(canvas, state, handlers);
  } else if (state.currentStage === 'stage2') {
    renderStage2Canvas(canvas, state, handlers);
  } else if (state.currentStage === 'stage3') {
    renderStage3Canvas(canvas, state, handlers);
  }
}

function renderStage1Canvas(canvas, state, handlers) {
  const s1 = state.stage1;
  const currentUser = state.currentUser;
  const userHasVoted = s1.hasVoted && s1.hasVoted[currentUser];
  const userVotedProposalId = s1.votes ? s1.votes[currentUser] : null;
  const proposals = s1.proposals || [];

  const totalVotesCast = Object.values(s1.hasVoted || {}).filter(Boolean).length;
  const confirmedCount = Object.values((s1.contract && s1.contract.confirmedMembers) || {}).filter(Boolean).length;

  canvas.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <div class="card-title" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:16px; font-weight:700; color:#0f172a;">💡 课题竞拍提案面板 (观点+学术理由)</span>
          <span style="font-size:12px; color:#0284c7; background:#e0f2fe; padding:3px 8px; border-radius:12px; font-weight:600;">
            📊 投票进度: ${totalVotesCast}/3 人已投票 ${userHasVoted ? ' (已锁定)' : ''}
          </span>
        </div>

        <button id="btn-open-proposal-modal" style="background:linear-gradient(135deg, #0284c7, #0369a1); border:none; color:white; padding:6px 14px; border-radius:6px; font-size:13px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
          <span>+</span> 提交我的选题提案
        </button>
      </div>

      <div class="proposals-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:12px; margin-top:12px;">
        ${proposals.length === 0 ? `
          <div style="grid-column:1/-1; text-align:center; padding:40px 20px; background:#f8fafc; border:2px dashed #cbd5e1; border-radius:10px; color:#64748b;">
            <div style="font-size:32px; margin-bottom:8px;">💡</div>
            <div style="font-weight:700; font-size:15px; color:#334155;">暂无提案拍品</div>
            <div style="font-size:13px; margin-top:4px;">请点击右上角【+ 提交我的选题提案】按钮，提交你们各自的研究观点与学术理由！</div>
          </div>
        ` : proposals.map(p => {
          const isThisVoted = userVotedProposalId === p.id;
          let btnText = '投票支持此提案';
          let btnClass = 'vote-btn';

          if (userHasVoted) {
            if (isThisVoted) {
              btnText = '🔒 已投此提案 (已锁定)';
              btnClass = 'vote-btn active locked';
            } else {
              btnText = '不可修改投票';
              btnClass = 'vote-btn disabled';
            }
          }

          const authorInfo = state.members[p.author] || { name: p.author || '组员', avatar: '👤' };

          return `
            <div class="proposal-card ${isThisVoted ? 'voted' : ''}" style="background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:14px; display:flex; flex-direction:column; justify-content:space-between; box-shadow:0 2px 8px rgba(15,23,42,0.03);">
              <div>
                <div class="proposal-header" style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                  <div class="proposal-title" style="font-weight:700; font-size:14px; color:#0f172a; line-height:1.5;">${p.title}</div>
                  <span class="proposal-tag" style="background:#e0f2fe; color:#0284c7; font-size:11px; padding:2px 6px; border-radius:4px; font-weight:600; white-space:nowrap; margin-left:6px;">${p.category || '学术探索'}</span>
                </div>
                <div style="font-size:12.5px; color:#475569; margin-bottom:10px; background:#f8fafc; padding:8px 10px; border-radius:6px; line-height:1.5; border-left:3px solid #0284c7;">
                  <b style="color:#0f172a;">理由依据:</b> ${p.rationale}
                </div>
                <div style="font-size:11.5px; color:#64748b; margin-bottom:10px; display:flex; justify-content:space-between;">
                  <span>提案人: <b>${authorInfo.avatar} ${authorInfo.name}</b></span>
                  <span>文献: <b>${p.metrics ? p.metrics.literature : '待评'}</b></span>
                  <span>新意: <b>${p.metrics ? p.metrics.innovation : '待评'}</b></span>
                </div>
              </div>
              <button class="${btnClass}" data-id="${p.id}" ${userHasVoted ? 'disabled' : ''} style="width:100%; padding:8px; border-radius:6px; font-weight:700; cursor:${userHasVoted ? 'default' : 'pointer'}; border:none; background:${isThisVoted ? '#10b981' : (userHasVoted ? '#94a3b8' : '#0284c7')}; color:white;">
                ${btnText}
              </button>
            </div>
          `;
        }).join('')}
      </div>
    </div>

    <!-- Contract Card -->
    <div class="contract-card" style="background:#ffffff; border:1px solid #cbd5e1; border-radius:12px; padding:18px; box-shadow:0 4px 16px rgba(15,23,42,0.04);">
      <div class="contract-header" style="font-size:16px; font-weight:700; color:#0f172a; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
        <span>📜 合作学术合约卡片 (全员确认签署生效)</span>
        <span style="font-size:12px; color:#059669; font-weight:600;">全组签署进度: <b>${confirmedCount}/3 人</b></span>
      </div>
      
      <div style="font-weight:700; margin-bottom:14px; color:#334155; display:flex; align-items:center; gap:8px;">
        <span>确定研究主题:</span>
        <input type="text" id="contract-topic-input" value="${s1.mergedTitle || (s1.contract && s1.contract.topic) || ''}" placeholder="请输入或协商最终确定的课题题目..." style="flex:1; background:#f8fafc; border:1px solid #cbd5e1; color:#0284c7; padding:6px 10px; border-radius:6px; font-weight:700; font-size:14px;">
      </div>

      <div class="contract-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px;">
        <div style="background:#f8fafc; padding:12px; border-radius:8px; border:1px solid #e2e8f0;">
          <div style="font-weight:700; color:#0284c7; margin-bottom:8px; font-size:13px;">⏱️ 150分钟时间预算规划 (分钟):</div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:12px; color:#334155;">
            <label>背景意义: <input type="number" class="contract-time-input" data-key="background" value="${(s1.contract && s1.contract.timeAllocations && s1.contract.timeAllocations.background) || 20}" style="width:45px; background:#ffffff; color:#0f172a; border:1px solid #cbd5e1; border-radius:4px; text-align:center; padding:2px;"></label>
            <label>问题假设: <input type="number" class="contract-time-input" data-key="questions" value="${(s1.contract && s1.contract.timeAllocations && s1.contract.timeAllocations.questions) || 25}" style="width:45px; background:#ffffff; color:#0f172a; border:1px solid #cbd5e1; border-radius:4px; text-align:center; padding:2px;"></label>
            <label>文献综述: <input type="number" class="contract-time-input" data-key="literature" value="${(s1.contract && s1.contract.timeAllocations && s1.contract.timeAllocations.literature) || 30}" style="width:45px; background:#ffffff; color:#0f172a; border:1px solid #cbd5e1; border-radius:4px; text-align:center; padding:2px;"></label>
            <label>研究方法: <input type="number" class="contract-time-input" data-key="method" value="${(s1.contract && s1.contract.timeAllocations && s1.contract.timeAllocations.method) || 40}" style="width:45px; background:#ffffff; color:#0f172a; border:1px solid #cbd5e1; border-radius:4px; text-align:center; padding:2px;"></label>
            <label>不足反思: <input type="number" class="contract-time-input" data-key="reflection" value="${(s1.contract && s1.contract.timeAllocations && s1.contract.timeAllocations.reflection) || 15}" style="width:45px; background:#ffffff; color:#0f172a; border:1px solid #cbd5e1; border-radius:4px; text-align:center; padding:2px;"></label>
            <label>参考文献: <input type="number" class="contract-time-input" data-key="references" value="${(s1.contract && s1.contract.timeAllocations && s1.contract.timeAllocations.references) || 10}" style="width:45px; background:#ffffff; color:#0f172a; border:1px solid #cbd5e1; border-radius:4px; text-align:center; padding:2px;"></label>
          </div>
        </div>

        <div style="background:#f8fafc; padding:12px; border-radius:8px; border:1px solid #e2e8f0;">
          <div style="font-weight:700; color:#0284c7; margin-bottom:8px; font-size:13px;">👥 成员具体任务分工:</div>
          <div style="display:flex; flex-direction:column; gap:6px; font-size:12px; color:#334155;">
            <label><b>👨‍🎓 A (组长)</b>: <input type="text" id="task-a-input" value="${(s1.contract && s1.contract.taskAssignments && s1.contract.taskAssignments.A) || ''}" placeholder="例如：负责背景与研究问题" style="width:70%; background:#ffffff; color:#0f172a; border:1px solid #cbd5e1; border-radius:4px; padding:3px 6px;"></label>
            <label><b>👩‍🎓 B (组员)</b>: <input type="text" id="task-b-input" value="${(s1.contract && s1.contract.taskAssignments && s1.contract.taskAssignments.B) || ''}" placeholder="例如：负责文献综述" style="width:70%; background:#ffffff; color:#0f172a; border:1px solid #cbd5e1; border-radius:4px; padding:3px 6px;"></label>
            <label><b>🧑‍🎓 C (组员)</b>: <input type="text" id="task-c-input" value="${(s1.contract && s1.contract.taskAssignments && s1.contract.taskAssignments.C) || ''}" placeholder="例如：负责研究方法与反思" style="width:70%; background:#ffffff; color:#0f172a; border:1px solid #cbd5e1; border-radius:4px; padding:3px 6px;"></label>
          </div>
        </div>
      </div>

      <div style="text-align:center;">
        <button id="btn-confirm-contract" style="background:linear-gradient(135deg, #10b981, #059669); border:none; color:white; padding:10px 28px; border-radius:8px; font-weight:700; cursor:pointer; font-size:14px; box-shadow:0 4px 12px rgba(16,185,129,0.2);">
          ✅ 我确认签署此合约 (${confirmedCount}/3 人已签署)
        </button>
      </div>
    </div>
  `;

  canvas.querySelectorAll('.vote-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => handlers.onVote(btn.dataset.id));
  });

  const topicInput = canvas.querySelector('#contract-topic-input');
  if (topicInput) {
    topicInput.addEventListener('input', (e) => {
      handlers.onContractTopicChange(e.target.value);
    });
  }

  const taskAInput = canvas.querySelector('#task-a-input');
  const taskBInput = canvas.querySelector('#task-b-input');
  const taskCInput = canvas.querySelector('#task-c-input');
  [taskAInput, taskBInput, taskCInput].forEach((inp, idx) => {
    if (inp) {
      const code = ['A', 'B', 'C'][idx];
      inp.addEventListener('input', (e) => {
        handlers.onContractTaskChange(code, e.target.value);
      });
    }
  });

  const confirmBtn = canvas.querySelector('#btn-confirm-contract');
  if (confirmBtn) confirmBtn.addEventListener('click', () => handlers.onConfirmContract());

  const openProposalBtn = canvas.querySelector('#btn-open-proposal-modal');
  if (openProposalBtn) {
    openProposalBtn.addEventListener('click', () => handlers.onOpenProposalModal());
  }
}

function renderStage2Canvas(canvas, state, handlers) {
  const s2 = state.stage2;
  const wordCount = (s2.unifiedContent || '').replace(/<[^>]*>/g, '').length;
  const isFinalSubmitted = state.stage3 && state.stage3.finalSubmitted;

  canvas.innerHTML = `
    <div class="card" style="height:100%; display:flex; flex-direction:column; padding:0; overflow:hidden;">
      <!-- Word Toolbar -->
      <div class="word-ribbon-toolbar" style="background:#ffffff; border-bottom:1px solid #cbd5e1; padding:8px 16px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">
        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
          <button id="btn-format-h1" class="word-tool-btn" title="一级标题" style="font-weight:700; padding:4px 8px; border:1px solid #cbd5e1; background:#f8fafc; border-radius:4px; cursor:pointer;">H1</button>
          <button id="btn-format-h2" class="word-tool-btn" title="二级标题" style="font-weight:700; padding:4px 8px; border:1px solid #cbd5e1; background:#f8fafc; border-radius:4px; cursor:pointer;">H2</button>
          <button id="btn-format-bold" class="word-tool-btn" title="加粗 (Ctrl+B)" style="font-weight:700; padding:4px 8px; border:1px solid #cbd5e1; background:#f8fafc; border-radius:4px; cursor:pointer;"><b>B</b></button>
          <button id="btn-format-italic" class="word-tool-btn" title="斜体 (Ctrl+I)" style="font-style:italic; padding:4px 8px; border:1px solid #cbd5e1; background:#f8fafc; border-radius:4px; cursor:pointer;"><i>I</i></button>
          <button id="btn-format-ul" class="word-tool-btn" title="无序列表" style="padding:4px 8px; border:1px solid #cbd5e1; background:#f8fafc; border-radius:4px; cursor:pointer;">• 列表</button>
          <button id="btn-insert-citation" class="word-tool-btn" title="插入文献引用" style="background:#fef3c7; color:#d97706; border:1px solid #fde68a; padding:4px 8px; border-radius:4px; cursor:pointer; font-weight:600;">📌 引用</button>
        </div>

        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:12px; color:#64748b;">实时总字数: <b id="live-doc-word-count" style="color:#0284c7;">${wordCount}</b> 字</span>
          <button id="btn-show-case" style="background:#e0f2fe; border:1px solid #bae6fd; color:#0369a1; padding:4px 10px; border-radius:6px; font-size:12px; cursor:pointer; font-weight:600;">
            📖 案例规范库
          </button>
          <button id="btn-trigger-meeting" style="background:linear-gradient(135deg, #10b981, #059669); border:none; color:white; padding:4px 12px; border-radius:6px; font-size:12px; cursor:pointer; font-weight:700;">
            📢 发起【编辑会议】
          </button>
        </div>
      </div>

      <!-- Word A4 Workspace -->
      <div class="word-workspace" style="flex:1; overflow-y:auto; background:#f1f5f9; padding:20px 12px; display:flex; flex-direction:column; align-items:center;">
        
        <div id="co-writer-presence-bar" style="max-width:900px; width:100%; margin:0 auto 10px auto; display:flex; align-items:center; gap:8px; flex-wrap:wrap; background:#ffffff; border:1px solid #e2e8f0; padding:6px 12px; border-radius:20px; font-size:12px;">
          <span style="font-weight:700; color:#475569; display:inline-flex; align-items:center; gap:6px;">
            <span style="width:8px; height:8px; border-radius:50%; background:#10b981; display:inline-block;"></span>
            👥 组内协同在线感知:
          </span>
          <span style="color:#0284c7; font-weight:600;">李明 (组长)</span>
          <span style="color:#059669; font-weight:600;">王芳 (组员)</span>
          <span style="color:#7c3aed; font-weight:600;">陈强 (组员)</span>
        </div>

        <div class="editor-textarea unified-large-editor-full" id="main-unified-editor" contenteditable="${!isFinalSubmitted}" style="background:#ffffff; color:#1e293b; padding:40px 50px; border:1px solid #cbd5e1; box-shadow:0 8px 30px rgba(15,23,42,0.06); border-radius:8px; font-size:15px; line-height:1.8; min-height:550px; max-width:900px; width:100%; margin:0 auto; outline:none; font-family:SimSun, 'Times New Roman', serif;">${s2.unifiedContent}</div>
      </div>

      <!-- Sticky Contribution Bar -->
      <div style="background:#ffffff; border-top:2px solid #0284c7; padding:10px 16px; border-bottom-left-radius:8px; border-bottom-right-radius:8px;">
        <div style="font-size:12px; font-weight:700; margin-bottom:6px; color:#0f172a; display:flex; justify-content:space-between;">
          <span>📊 SSRL 小组成员贡献度动态分析 (群体感知)</span>
          <span style="color:#64748b;">实时全篇字数: <b>${wordCount}</b> 字</span>
        </div>

        <div class="contribution-bar-container">
          <div class="contrib-bars" style="height:10px; border-radius:5px; display:flex; overflow:hidden; background:#f1f5f9;">
            <div class="contrib-segment" style="width:${s2.memberContributions.A.percentage}%; background:#0284c7;" title="李明: ${s2.memberContributions.A.percentage}%"></div>
            <div class="contrib-segment" style="width:${s2.memberContributions.B.percentage}%; background:#059669;" title="王芳: ${s2.memberContributions.B.percentage}%"></div>
            <div class="contrib-segment" style="width:${s2.memberContributions.C.percentage}%; background:#7c3aed;" title="陈强: ${s2.memberContributions.C.percentage}%"></div>
          </div>
          <div style="display:flex; justify-content:space-around; font-size:11px; font-weight:600; margin-top:6px;">
            <span style="color:#0284c7;">● A (李明/组长): ${s2.memberContributions.A.percentage}% (${s2.memberContributions.A.words}字)</span>
            <span style="color:#059669;">● B (王芳/组员): ${s2.memberContributions.B.percentage}% (${s2.memberContributions.B.words}字)</span>
            <span style="color:#7c3aed;">● C (陈强/组员): ${s2.memberContributions.C.percentage}% (${s2.memberContributions.C.words}字)</span>
          </div>
        </div>
      </div>
    </div>
  `;

  const editor = canvas.querySelector('#main-unified-editor');
  if (editor && !isFinalSubmitted) {
    editor.addEventListener('input', () => {
      handlers.onUnifiedContentChange(editor.innerHTML);
    });
  }

  const btnH1 = canvas.querySelector('#btn-format-h1');
  if (btnH1) btnH1.addEventListener('click', () => document.execCommand('formatBlock', false, '<h1>'));

  const btnH2 = canvas.querySelector('#btn-format-h2');
  if (btnH2) btnH2.addEventListener('click', () => document.execCommand('formatBlock', false, '<h2>'));

  const btnBold = canvas.querySelector('#btn-format-bold');
  if (btnBold) btnBold.addEventListener('click', () => document.execCommand('bold'));

  const btnItalic = canvas.querySelector('#btn-format-italic');
  if (btnItalic) btnItalic.addEventListener('click', () => document.execCommand('italic'));

  const btnUl = canvas.querySelector('#btn-format-ul');
  if (btnUl) btnUl.addEventListener('click', () => document.execCommand('insertUnorderedList'));

  const btnCite = canvas.querySelector('#btn-insert-citation');
  if (btnCite) {
    btnCite.addEventListener('click', () => {
      const cite = prompt('请输入文献引用条目：', '[1] 作者. 论文题目[J]. 期刊名称, 2026.');
      if (cite) {
        document.execCommand('insertHTML', false, ` <span style="color:#d97706; background:#fef3c7; padding:1px 4px; border-radius:3px; font-size:12px;">${cite}</span> `);
      }
    });
  }

  const btnCase = canvas.querySelector('#btn-show-case');
  if (btnCase) btnCase.addEventListener('click', () => handlers.onOpenCaseModal());

  const btnMeeting = canvas.querySelector('#btn-trigger-meeting');
  if (btnMeeting) btnMeeting.addEventListener('click', () => handlers.onOpenMeetingModal());
}

function renderStage3Canvas(canvas, state, handlers) {
  const s3 = state.stage3;
  const feedbackItems = s3.feedbackItems || [];
  const isFinalSubmitted = s3.finalSubmitted;

  canvas.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <div class="card-title" style="display:flex; justify-content:space-between; align-items:center;">
        <span>🎓 答辩委员会改进意见清单 (组内裁决面板)</span>
        <span style="font-size:12px; color:#0284c7; font-weight:600;">阶段三：答辩与再调节</span>
      </div>

      <div style="display:flex; flex-direction:column; gap:12px; margin-top:12px;">
        ${feedbackItems.length === 0 ? `
          <div style="text-align:center; padding:30px; background:#f8fafc; border:2px dashed #cbd5e1; border-radius:8px; color:#64748b;">
            <div style="font-size:28px; margin-bottom:6px;">🎓</div>
            <div style="font-weight:700; color:#334155;">正反方审稿专家正在审阅大家的方案...</div>
            <div style="font-size:12px; margin-top:4px;">答辩委员会将在聊天区提出学术质询，质询项将自动同步展示在此处以供组内裁决！</div>
          </div>
        ` : feedbackItems.map(item => `
          <div style="background:#ffffff; padding:14px; border-radius:8px; border:1px solid ${item.role === 'opponent' ? '#fecaca' : '#bbf7d0'}; box-shadow:0 2px 6px rgba(15,23,42,0.03);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <span style="font-weight:700; color:${item.role === 'opponent' ? '#dc2626' : '#16a34a'}; font-size:14px;">
                ${item.role === 'opponent' ? '🔴 质疑要点' : '🟢 肯定要点'}: ${item.title}
              </span>
              <span style="font-size:11px; padding:2px 8px; border-radius:10px; background:#f1f5f9; font-weight:600; color:#475569;">
                状态: ${item.status === 'adopted' ? '✅ 已采纳优化' : item.status === 'acknowledged' ? '👍 已保留确认' : '⏳ 待讨论'}
              </span>
            </div>
            <div style="font-size:13px; color:#334155; margin-bottom:8px; line-height:1.5;">${item.content}</div>
            
            ${item.response ? `
              <div style="font-size:12px; color:#475569; background:#f8fafc; padding:8px 10px; border-radius:6px; border-left:3px solid #0284c7; line-height:1.5;">
                <b style="color:#0f172a;">小组成员统一裁决回复:</b> ${item.response}
              </div>
            ` : `
              <button class="adopt-btn" data-id="${item.id}" style="background:#0284c7; border:none; color:white; padding:5px 12px; border-radius:4px; font-size:12px; font-weight:700; cursor:pointer;">
                讨论并填写采纳/抗辩说明
              </button>
            `}
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Final Submission Card -->
    <div class="card" style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px; padding:16px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
        <div>
          <div style="font-weight:700; font-size:15px; color:#15803d;">终稿提交与终极反思归档</div>
          <div style="font-size:12px; color:#4b5563; margin-top:2px;">全员完成裁决与正文修改后，点击提交，报告将自动呈递给教师端。</div>
        </div>
        <button id="btn-final-submit" ${isFinalSubmitted ? 'disabled' : ''} style="background:${isFinalSubmitted ? '#94a3b8' : 'linear-gradient(135deg, #10b981, #059669)'}; border:none; color:white; padding:10px 22px; border-radius:8px; font-weight:700; cursor:${isFinalSubmitted ? 'default' : 'pointer'}; font-size:14px;">
          ${isFinalSubmitted ? '✅ 方案已成功呈递教师端' : '🚀 确认提交最终方案'}
        </button>
      </div>
    </div>
  `;

  canvas.querySelectorAll('.adopt-btn').forEach(btn => {
    btn.addEventListener('click', () => handlers.onAdoptFeedback(btn.dataset.id));
  });

  const finalBtn = canvas.querySelector('#btn-final-submit');
  if (finalBtn && !isFinalSubmitted) {
    finalBtn.addEventListener('click', () => handlers.onFinalSubmit());
  }
}

export function renderChat(state) {
  const stream = document.getElementById('chat-stream');
  if (!stream) return;
  const logs = state.chatLogs[state.currentStage] || [];

  stream.innerHTML = logs.map(msg => {
    const isAgent = AgentProfiles[msg.sender] !== undefined;
    const profile = isAgent ? AgentProfiles[msg.sender] : state.members[msg.sender];
    const avatar = profile ? profile.avatar : '👤';
    const name = profile ? (profile.name || profile.roleTitle) : msg.sender;
    const color = profile ? profile.color : '#64748b';

    return `
      <div class="chat-message ${isAgent ? 'agent' : 'user'}" style="margin-bottom:12px; display:flex; gap:8px;">
        <div class="msg-avatar" style="width:34px; height:34px; border-radius:50%; display:flex; align-items:center; justify-content:center; background:${color}15; border:1px solid ${color}40; font-size:16px; flex-shrink:0;">
          ${avatar}
        </div>
        <div class="msg-body" style="flex:1;">
          <div class="msg-meta" style="font-size:11.5px; margin-bottom:2px;">
            <span class="msg-sender" style="color:${color}; font-weight:700;">${name}</span>
            <span style="font-size:10px; color:#94a3b8; margin-left:6px;">${msg.timestamp || ''}</span>
          </div>
          <div class="msg-bubble" style="background:${isAgent ? '#f8fafc' : '#ffffff'}; border:1px solid ${isAgent ? '#e2e8f0' : '#cbd5e1'}; padding:8px 12px; border-radius:8px; font-size:13.5px; line-height:1.5; color:#1e293b; white-space:pre-wrap;">${msg.text}</div>
        </div>
      </div>
    `;
  }).join('');

  stream.scrollTop = stream.scrollHeight;
}
