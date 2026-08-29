/**
 * JIZHI (集智) Platform - Collaborative Rich Text Editor & Academic Plugins
 * Standard ES Module (ESM)
 */

import { AgentProfiles } from "./constants.js?v=20260829_v689";
import { callCozeAgentAPI } from "./agents.js?v=20260829_v689";
import { downloadFileBlob, getCaretCharacterOffsetWithin, setCaretPositionWithin, escapeHtml, sanitizeUrl, isTaskExpired, formatDurationHuman, formatChatDisplayTime, filterAndDeduplicateChatLogs } from "./utils.js?v=20260829_v689";

/* ==========================================================================
   8. UI RENDERER (STUDENT CANVAS & HEADER)
   ========================================================================== */
export function renderHeader(state, currentUser, announcements, onStageChange, onSpeedChange, onLogout, onSwitchTeacher, onOpenAnnModal, onOpenSurveyModal, onBackToTaskList) {
  const header = document.getElementById('app-header');
  if (!header) return;
  const activeTaskId = (state && state.activeTaskId) ? state.activeTaskId : 'task_default';
  const allTasks = (window.app && window.app.authManager) ? window.app.authManager.getTasks() : [];
  const currentTask = allTasks.find(t => t.id === activeTaskId);
  
  let remainingMin = 150;
  if (currentTask) {
    if (currentTask.deadline) {
      const raw = String(currentTask.deadline).trim();
      if (raw && !raw.includes('无') && !raw.includes('随时') && !raw.includes('结课前') && !raw.includes('不限')) {
        const deadlineDate = new Date(raw.replace(/-/g, '/'));
        if (!isNaN(deadlineDate.getTime())) {
          const now = new Date();
          const diffMs = deadlineDate.getTime() - now.getTime();
          remainingMin = Math.max(0, Math.floor(diffMs / 60000));
        }
      }
    } else {
      const totalDurationMin = currentTask.durationMinutes ? Number(currentTask.durationMinutes) : 150;
      const elapsedMin = Math.floor((state.timer && state.timer.elapsedSeconds ? state.timer.elapsedSeconds : 0) / 60);
      remainingMin = Math.max(0, totalDurationMin - elapsedMin);
    }
  }

  const activeClassId = state.activeStudentClassId || currentUser?.classId || 'class_101';
  const activeGroupObj = (window.app && window.app.authManager) ? window.app.authManager.getStudentActiveGroup(currentUser, activeClassId) : { id: 'group_1', name: '第 1 协作小组' };
  const groupId = activeGroupObj.id || (currentUser && currentUser.groupId ? currentUser.groupId : 'group_1');
  const groupName = activeGroupObj.name || '第 1 协作小组';
  const currentTaskTitle = currentTask ? currentTask.title : (activeTaskId === 'task_default' ? '默认写作任务' : '协作写作任务');

  // 严格按【当前班级】、【当前任务】和【当前小组】三位一体过滤通知，彻底杜绝跨班级、跨任务干扰
  const relevantAnnouncements = (announcements || []).filter(a => {
    const matchClass = (a.classId === activeClassId) || (Array.isArray(a.targetClassIds) && a.targetClassIds.includes(activeClassId));
    const matchGroup = !a.targetGroupId || a.targetGroupId === 'all' || a.targetGroupId === groupId ||
      (Array.isArray(a.targetGroupIds) && (a.targetGroupIds.includes('all') || a.targetGroupIds.includes(groupId)));
    const matchTask = a.taskId === 'task_all' || a.taskId === activeTaskId || (!a.taskId && activeTaskId === 'task_default');
    return matchClass && matchGroup && matchTask;
  });
  const isAnnRead = (a) => {
    if (!a || !a.readStatus) return false;
    if (currentUser) {
      if (currentUser.id && a.readStatus[currentUser.id]) return true;
      if (currentUser.studentCode && a.readStatus[currentUser.studentCode]) return true;
      if (currentUser.username && a.readStatus[currentUser.username]) return true;
      if (currentUser.name && a.readStatus[currentUser.name]) return true;
      if (Array.isArray(a.confirmedMembers)) {
        if (a.confirmedMembers.some(m => m && (m.id === currentUser.id || m.studentCode === currentUser.studentCode || (currentUser.name && m.name === currentUser.name)))) return true;
      }
    }
    return false;
  };
  const unreadAnnCount = relevantAnnouncements.filter(a => !isAnnRead(a)).length;
  const isTaskDeadlineExpired = isTaskExpired(currentTask);
  const isFinalSubmitted = state.isFinalSubmitted || isTaskDeadlineExpired;

  const stageOrder = { stage1: 1, stage2: 2, stage3: 3 };
  const currentMaxOrder = stageOrder[state.groupMaxStage || 'stage1'] || 1;
  const isContractSigned = !!(state.stage1?.contract?.signed || (Array.isArray(state.stage1?.contract?.confirmedMembers) && state.stage1.contract.confirmedMembers.length > 0));
  // 🌟 截止后三个阶段全部解锁，允许学生自由切换查阅回看；未截止时必须签署公约才解锁阶段二
  const isS2Locked = !isTaskDeadlineExpired && (!isContractSigned && currentMaxOrder < 2);
  const isS3Locked = !isTaskDeadlineExpired && currentMaxOrder < 3;

  header.innerHTML = `
    <div class="brand-section">
      <div class="brand-logo">集智 JIZHI</div>
      <div class="brand-badge" style="background:#eff6ff; color:#1d4ed8; padding:3px 12px; border-radius:20px; font-size:12px; font-weight:700; border:1px solid #bfdbfe; display:inline-flex; align-items:center; gap:6px;">
        <span>🎓 ${escapeHtml(currentUser ? currentUser.name : '学生')}</span>
        <span style="opacity:0.35;">·</span>
        <span>👥 ${escapeHtml(groupName)}</span>
        <span style="opacity:0.35;">·</span>
        <span style="color:#1e40af; background:#ffffff; padding:1.5px 8px; border-radius:10px; border:1px solid #bfdbfe; font-weight:800;">📌 ${escapeHtml(currentTaskTitle)}</span>
        ${isFinalSubmitted ? '<span style="color:#059669; margin-left:3px;">(🔒已归档)</span>' : ''}
      </div>
      <button id="btn-header-back-tasks" style="background:#f8fafc; border:1px solid #cbd5e1; color:#334155; padding:3px 8px; border-radius:14px; font-size:11px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:3px;" title="返回我的写作任务大厅">
        📋 任务大厅
      </button>
    </div>
    <nav class="stage-nav">
      <button class="stage-btn ${state.currentStage === 'stage1' ? 'active' : ''}" data-stage="stage1" title="阶段一：学术拍卖会 (25分钟)">🎪 阶段一: 拍卖会</button>
      <button class="stage-btn ${state.currentStage === 'stage2' ? 'active' : ''} ${isS2Locked ? 'stage-locked' : ''}" data-stage="stage2" style="${isS2Locked ? 'opacity:0.65;' : ''}" title="${isS2Locked ? '🔒 待阶段一公约签署完成后解锁' : '阶段二：学术编辑部 (105分钟)'}">${isS2Locked ? '🔒 ' : ''}📰 阶段二: 编辑部</button>
      <button class="stage-btn ${state.currentStage === 'stage3' ? 'active' : ''} ${isS3Locked ? 'stage-locked' : ''}" data-stage="stage3" style="${isS3Locked ? 'opacity:0.65;' : ''}" title="${isS3Locked ? '🔒 待阶段二编辑会议与正文完成后解锁' : '阶段三：答辩擂台 (20分钟)'}">${isS3Locked ? '🔒 ' : ''}🎓 阶段三: 答辩擂台</button>
    </nav>
    <div class="header-controls">
      <button id="btn-header-survey-link" style="background:#eff6ff; border:1px solid #bfdbfe; color:#2563eb; padding:3px 8px; border-radius:14px; font-size:11px; font-weight:700; cursor:pointer;" title="课程评估问卷">
        📋 问卷
      </button>
      <button class="nav-ann-bell-btn ${unreadAnnCount > 0 ? 'has-unread' : ''}" id="btn-header-ann-bell" title="课堂教学通知与延期" style="padding:3px 10px; border-radius:14px; font-size:11.5px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:4px; background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe;">
        <span>📢 教学通知</span>${unreadAnnCount > 0 ? `<span style="background:#ef4444; color:#ffffff; font-size:10.5px; font-weight:800; padding:1px 6px; border-radius:10px; box-shadow:0 1px 4px rgba(239,68,68,0.4);">${unreadAnnCount}</span>` : ''}
      </button>
      <div class="timer-box" style="padding:2px 10px; border-radius:14px; font-size:11.5px; font-weight:700; white-space:nowrap; background:${isTaskDeadlineExpired ? '#fef2f2' : '#eff6ff'}; color:${isTaskDeadlineExpired ? '#dc2626' : '#1d4ed8'}; border:1px solid ${isTaskDeadlineExpired ? '#fecaca' : '#bfdbfe'};">
        ${isTaskDeadlineExpired ? '🛑 已截止' : `⏱️ 剩余 ${formatDurationHuman(remainingMin, true)}`}
      </div>
      <button id="btn-user-logout" style="background:#fef2f2; color:#dc2626; border:1px solid #fecaca; padding:3px 8px; border-radius:14px; font-size:11px; font-weight:700; cursor:pointer;" title="退出登录">🚪 退出</button>
    </div>
  `;

  header.querySelectorAll('.stage-btn').forEach(btn => {
    btn.addEventListener('click', () => onStageChange(btn.dataset.stage));
  });
  header.querySelector('#btn-user-logout').addEventListener('click', () => onLogout());
  header.querySelector('#btn-header-ann-bell').addEventListener('click', () => onOpenAnnModal());
  const btnBackTasks = header.querySelector('#btn-header-back-tasks');
  if (btnBackTasks && onBackToTaskList) {
    btnBackTasks.addEventListener('click', () => onBackToTaskList());
  }
  const surveyHeaderBtn = header.querySelector('#btn-header-survey-link');
  if (surveyHeaderBtn) surveyHeaderBtn.addEventListener('click', () => onOpenSurveyModal());
}

export function renderCanvas(state, handlers) {
  const canvas = document.getElementById('canvas-panel');
  if (state.currentStage === 'stage1') renderStage1Canvas(canvas, state, handlers);
  else if (state.currentStage === 'stage2') renderStage2Canvas(canvas, state, handlers);
  else if (state.currentStage === 'stage3') renderStage3Canvas(canvas, state, handlers);
}

export function buildWordEditorHtml(editorId, initialHtml, isReadonly) {
  return `
    <div class="word-editor-container" id="${editorId}-wrapper">
      ${!isReadonly ? `
        <div class="word-toolbar">
          <!-- 1. 历史操作与格式刷 -->
          <div class="word-toolbar-group">
            <button class="word-btn" id="${editorId}-btn-undo" title="撤销 (Ctrl+Z)">↩️ 撤销</button>
            <button class="word-btn" id="${editorId}-btn-redo" title="重做 (Ctrl+Y)">↪️ 重做</button>
            <button class="word-btn" id="${editorId}-btn-format-painter" title="格式刷 (复制选中文字格式并应用到下一段文字)">🖌️ 格式刷</button>
          </div>

          <!-- 2. 论文大纲与章节层级 (结构化标签) -->
          <div class="word-toolbar-group" title="设置当前段落的论文大纲层级">
            <span style="font-size:11px; font-weight:700; color:#64748b; margin-right:2px;">📑 层级:</span>
            <select class="word-select" id="${editorId}-sel-format" title="段落与大纲层级" style="width:130px; font-weight:600; color:#1e40af;">
              <option value="p">正文段落 (Body)</option>
              <option value="h1">论文总题目 (H1)</option>
              <option value="h2">一级章标题 (H2)</option>
              <option value="h3">二级节标题 (H3)</option>
              <option value="h4">三级小节 (H4)</option>
              <option value="blockquote">引文与摘要块</option>
            </select>
          </div>

          <!-- 3. 字体与字号设置 (丰富学术与通用字体库) -->
          <div class="word-toolbar-group" title="设置选中文字的字体与字号">
            <span style="font-size:11px; font-weight:700; color:#64748b; margin-right:2px;">🔤 字体字号:</span>
            <select class="word-select" id="${editorId}-sel-font" title="学术中英文字体" style="width:130px;">
              <option value="SimSun, 'Songti SC', serif">宋体 (学术标准)</option>
              <option value="SimHei, 'Heiti SC', sans-serif">黑体 (大标题)</option>
              <option value="FangSong, 'FangSong SC', serif">仿宋 (公文标准)</option>
              <option value="KaiTi, 'Kaiti SC', serif">楷体 (引文/致谢)</option>
              <option value="'Microsoft YaHei', 'PingFang SC', sans-serif">微软雅黑 / 苹方</option>
              <option value="'Times New Roman', serif">Times New Roman</option>
              <option value="Arial, sans-serif">Arial</option>
              <option value="Calibri, sans-serif">Calibri</option>
              <option value="'Courier New', monospace">Courier New (代码)</option>
              <option value="Georgia, serif">Georgia (英文期刊)</option>
            </select>
            <select class="word-select" id="${editorId}-sel-size" title="标准论文中英文字号" style="width:115px;">
              <option value="42px">初号 (42pt)</option>
              <option value="36px">小初 (36pt)</option>
              <option value="26px">一号 (26pt)</option>
              <option value="24px">小一 (24pt)</option>
              <option value="22px">二号 (22pt)</option>
              <option value="18px">小二 (18pt)</option>
              <option value="16px">三号 (16pt)</option>
              <option value="15px">小三 (15pt)</option>
              <option value="14px">四号 (14pt)</option>
              <option value="12px" selected>小四 (12pt / 正文)</option>
              <option value="10.5px">五号 (10.5pt)</option>
              <option value="9px">小五 (9pt)</option>
              <option value="7.5px">六号 (7.5pt)</option>
            </select>
          </div>

          <!-- 4. 文字修饰 -->
          <div class="word-toolbar-group">
            <button class="word-btn" id="${editorId}-btn-bold" title="粗体 (Ctrl+B)"><b>B</b></button>
            <button class="word-btn" id="${editorId}-btn-italic" title="斜体 (Ctrl+I)"><i>I</i></button>
            <button class="word-btn" id="${editorId}-btn-underline" title="下划线 (Ctrl+U)"><u>U</u></button>
            <button class="word-btn" id="${editorId}-btn-strike" title="删除线"><s>S</s></button>
            <button class="word-btn" id="${editorId}-btn-sup" title="上标 (文献角标 [1])">X²</button>
            <button class="word-btn" id="${editorId}-btn-sub" title="下标 (变量角标 H₁)">X₂</button>
          </div>

          <!-- 5. 排版、对齐、缩进设置与行间距 -->
          <div class="word-toolbar-group">
            <select class="word-select" id="${editorId}-sel-line-height" title="行间距 (行高)" style="width:96px;">
              <option value="1.5" selected>1.5倍 (标准)</option>
              <option value="1.0">单倍行距</option>
              <option value="1.25">1.25倍行距</option>
              <option value="1.75">1.75倍行距</option>
              <option value="2.0">双倍 (2.0倍)</option>
            </select>
            <!-- 首行缩进 (支持小数自定义填入) -->
            <div style="display:inline-flex; align-items:center; background:#f8fafc; border:1px solid #cbd5e1; border-radius:4px; padding:1px 6px; gap:2px;" title="首行缩进字符数 (可直接输入任意小数，如 2 或 1.5)">
              <span style="font-size:11px; font-weight:700; color:#475569;">首行:</span>
              <input type="number" id="${editorId}-num-indent" value="2" min="0" max="20" step="0.5" style="width:36px; padding:2px 2px; border:1px solid #cbd5e1; border-radius:3px; font-size:11.5px; font-weight:700; text-align:center; background:#ffffff;">
              <span style="font-size:11px; color:#64748b;">字符</span>
            </div>

            <!-- 悬挂缩进 (支持小数自定义填入) -->
            <div style="display:inline-flex; align-items:center; background:#f8fafc; border:1px solid #cbd5e1; border-radius:4px; padding:1px 6px; gap:2px;" title="悬挂缩进字符数 (参考文献格式，可输入任意小数，如 2 或 1.5，填 0 取消)">
              <span style="font-size:11px; font-weight:700; color:#475569;">⇤ 悬挂:</span>
              <input type="number" id="${editorId}-num-hanging-indent" value="2" min="0" max="20" step="0.5" style="width:36px; padding:2px 2px; border:1px solid #cbd5e1; border-radius:3px; font-size:11.5px; font-weight:700; text-align:center; background:#ffffff;">
              <span style="font-size:11px; color:#64748b;">字符</span>
              <button class="word-btn" id="${editorId}-btn-apply-hanging" style="padding:1px 5px; font-size:11px; margin-left:2px; background:#2563eb; color:white;" title="应用悬挂缩进">应用</button>
            </div>

            <button class="word-btn" id="${editorId}-btn-align-left" title="左对齐">⇤</button>
            <button class="word-btn" id="${editorId}-btn-align-center" title="居中对齐">☰</button>
            <button class="word-btn" id="${editorId}-btn-align-right" title="右对齐">⇥</button>
            <button class="word-btn" id="${editorId}-btn-align-justify" title="两端对齐 (学术正文标准)">☲</button>
            <button class="word-btn" id="${editorId}-btn-list-ul" title="项目符号">• 列表</button>
            <button class="word-btn" id="${editorId}-btn-list-ol" title="编号列表">1. 编号</button>
            <button class="word-btn" id="${editorId}-btn-hr" title="插入水平分隔线">― 分隔线</button>
          </div>

          <!-- 6. 颜色、荧光笔与清格式 -->
          <div class="word-toolbar-group">
            <label style="display:flex; align-items:center; gap:3px; font-size:11px; color:#94a3b8; cursor:pointer;" title="文字颜色">
              <span>🎨</span>
              <input type="color" id="${editorId}-color-text" value="#0f172a" style="width:18px; height:18px; border:none; background:transparent; cursor:pointer;">
            </label>
            <button class="word-btn" id="${editorId}-btn-hilite-yellow" title="黄色批注高亮" style="color:#facc15;">🖍️ 黄</button>
            <button class="word-btn" id="${editorId}-btn-hilite-green" title="绿色建议高亮" style="color:#4ade80;">🖍️ 绿</button>
            <button class="word-btn" id="${editorId}-btn-clear-format" title="清除格式">🧹 清格式</button>
          </div>

          <!-- 7. 学术论文插件套件 -->
          <div class="word-toolbar-group">
            <button class="word-btn plugin-btn" id="${editorId}-btn-insert-image" title="插入学术图表与图题说明">🖼️ 图表</button>
            <button class="word-btn plugin-btn" id="${editorId}-btn-insert-table" title="插入标准学术三线表">📊 三线表</button>
            <button class="word-btn plugin-btn" id="${editorId}-btn-insert-symbol" title="高阶学术公式与统计符号库">🔣 符号</button>
            <button class="word-btn plugin-btn" id="${editorId}-btn-insert-citation" title="插入文献引用角标 [n]">📑 [n]</button>
            <button class="word-btn plugin-btn" id="${editorId}-btn-insert-abstract" title="插入【摘要与关键词】学术前置卡片">📌 摘要</button>
            <button class="word-btn plugin-btn" id="${editorId}-btn-insert-ref-template" title="在文末插入标准参考文献模版">📚 文献</button>
            <button class="word-btn plugin-btn" id="${editorId}-btn-find-replace" title="文档内查找与替换">🔍 查找替换</button>
          </div>
        </div>

        <div class="search-replace-bar" id="${editorId}-search-bar" style="display:none; align-items:center; gap:8px; padding:8px 14px; background:#f8fafc; border-bottom:1px solid #e2e8f0; font-size:12px;">
          <span style="font-weight:700; color:#334155;">🔍 查找:</span>
          <input type="text" id="${editorId}-search-input" placeholder="输入要查找的关键词..." style="padding:4px 8px; border:1px solid #cbd5e1; border-radius:4px; font-size:12px; width:150px;">
          <button class="word-btn" id="${editorId}-btn-find-next" style="background:#2563eb; color:white; font-size:11.5px; padding:3px 10px;">下一个</button>
          <span id="${editorId}-find-count-tip" style="color:#64748b; font-size:11px;"></span>
          <span style="font-weight:700; color:#334155; margin-left:8px;">替换为:</span>
          <input type="text" id="${editorId}-replace-input" placeholder="替换内容..." style="padding:4px 8px; border:1px solid #cbd5e1; border-radius:4px; font-size:12px; width:130px;">
          <button class="word-btn" id="${editorId}-btn-do-replace" style="background:#0284c7; color:white; font-size:11.5px; padding:3px 10px;">替换当前</button>
          <button class="word-btn" id="${editorId}-btn-do-replace-all" style="background:#059669; color:white; font-size:11.5px; padding:3px 10px;">全部替换</button>
          <button class="word-btn" id="${editorId}-btn-close-search" style="background:none; border:none; color:#94a3b8; cursor:pointer; font-weight:700; margin-left:auto;">✕ 关闭</button>
        </div>
      ` : `
        <div class="word-toolbar" style="background:rgba(30,41,59,0.9); justify-content:space-between;">
          <div style="font-size:13px; font-weight:700; color:#34d399;">🔒 论文终稿已提交归档 · 只读查阅模式</div>
        </div>
      `}

      <div class="collab-presence-header" id="${editorId}-presence-header" style="display:flex; justify-content:space-between; align-items:center;">
        <div style="display:flex; align-items:center; gap:8px;">
          <div class="collab-presence-title">
            <span>👥 组员协同在线感知:</span>
          </div>
          <div class="collab-member-pills" id="${editorId}-presence-pills"></div>
        </div>
        <div style="font-size:11px; font-weight:700; padding:2px 8px; border-radius:12px; border:1px solid #a7f3d0; background:#ecfdf5; color:#059669; white-space:nowrap;">
          🟢 高可靠实时同步已就绪
        </div>
      </div>

      <div class="word-page-scroll">
        <div class="word-page" id="${editorId}">
          ${initialHtml}
        </div>
      </div>
    </div>
  `;
}

export function attachWordEditorEvents(container, editorId, isReadonly, onChangeCallback, onPresenceCallback) {
  const editor = container.querySelector(`#${editorId}`);
  if (!editor) return;

  if (isReadonly) {
    editor.setAttribute('contenteditable', 'false');
    editor.contentEditable = 'false';
    editor.style.userSelect = 'text';
    editor.style.cursor = 'default';
    editor.querySelectorAll('[contenteditable]').forEach(el => {
      el.setAttribute('contenteditable', 'false');
      el.contentEditable = 'false';
    });

    const blockEdit = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C' || e.key === 'a' || e.key === 'A')) {
        return true;
      }
      e.preventDefault();
      e.stopPropagation();
      return false;
    };
    editor.addEventListener('keydown', blockEdit, true);
    editor.addEventListener('keypress', blockEdit, true);
    editor.addEventListener('paste', blockEdit, true);
    editor.addEventListener('cut', blockEdit, true);
    editor.addEventListener('drop', blockEdit, true);
  }

  if (!isReadonly) {
    // 🛡️ 核心保障：阻止工具栏按钮点击时的默认失焦事件，完美锁定用户选区
    container.querySelectorAll('.word-toolbar button').forEach(btn => {
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
      });
    });

    const exec = (cmd, val = null) => {
      document.execCommand(cmd, false, val);
      editor.focus();
      if (onChangeCallback) onChangeCallback(editor.innerHTML);
    };

    const btnUndo = container.querySelector(`#${editorId}-btn-undo`);
    if (btnUndo) btnUndo.addEventListener('click', () => exec('undo'));
    const btnRedo = container.querySelector(`#${editorId}-btn-redo`);
    if (btnRedo) btnRedo.addEventListener('click', () => exec('redo'));

    const btnFullscreen = container.querySelector(`#${editorId}-btn-fullscreen`);
    if (btnFullscreen) {
      btnFullscreen.addEventListener('click', () => {
        const wrapper = container.querySelector(`#${editorId}-wrapper`);
        if (wrapper) {
          wrapper.classList.toggle('fullscreen');
          btnFullscreen.innerText = wrapper.classList.contains('fullscreen') ? '✖ 退出全屏' : '🔲 全屏';
        }
      });
    }

    const selFormat = container.querySelector(`#${editorId}-sel-format`);
    if (selFormat) selFormat.addEventListener('change', (e) => exec('formatBlock', e.target.value));

    const selFont = container.querySelector(`#${editorId}-sel-font`);
    if (selFont) selFont.addEventListener('change', (e) => exec('fontName', e.target.value));

    const selSize = container.querySelector(`#${editorId}-sel-size`);
    if (selSize) selSize.addEventListener('change', (e) => exec('fontSize', e.target.value));

    const btnBold = container.querySelector(`#${editorId}-btn-bold`);
    if (btnBold) btnBold.addEventListener('click', () => exec('bold'));
    const btnItalic = container.querySelector(`#${editorId}-btn-italic`);
    if (btnItalic) btnItalic.addEventListener('click', () => exec('italic'));
    const btnUnderline = container.querySelector(`#${editorId}-btn-underline`);
    if (btnUnderline) btnUnderline.addEventListener('click', () => exec('underline'));
    const btnStrike = container.querySelector(`#${editorId}-btn-strike`);
    if (btnStrike) btnStrike.addEventListener('click', () => exec('strikeThrough'));
    const btnSup = container.querySelector(`#${editorId}-btn-sup`);
    if (btnSup) btnSup.addEventListener('click', () => exec('superscript'));
    const selLineHeight = container.querySelector(`#${editorId}-sel-line-height`);
    if (selLineHeight) {
      selLineHeight.addEventListener('change', (e) => {
        editor.style.lineHeight = e.target.value;
        // 🛡️ 同步写入每个段落，使行间距持久化到 innerHTML 并同步给协同用户
        editor.querySelectorAll('p, div, h1, h2, h3, h4, li, blockquote').forEach(el => {
          el.style.lineHeight = e.target.value;
        });
        if (onChangeCallback) onChangeCallback(editor.innerHTML);
      });
    }

    const selParaMargin = container.querySelector(`#${editorId}-sel-para-margin`);
    if (selParaMargin) {
      selParaMargin.addEventListener('change', (e) => {
        const val = e.target.value;
        editor.querySelectorAll('p').forEach(p => { p.style.marginBottom = val; });
        if (onChangeCallback) onChangeCallback(editor.innerHTML);
      });
    }

    const btnAlignLeft = container.querySelector(`#${editorId}-btn-align-left`);
    if (btnAlignLeft) btnAlignLeft.addEventListener('click', () => exec('justifyLeft'));
    const btnAlignCenter = container.querySelector(`#${editorId}-btn-align-center`);
    if (btnAlignCenter) btnAlignCenter.addEventListener('click', () => exec('justifyCenter'));
    const btnAlignRight = container.querySelector(`#${editorId}-btn-align-right`);
    if (btnAlignRight) btnAlignRight.addEventListener('click', () => exec('justifyRight'));
    const btnAlignJustify = container.querySelector(`#${editorId}-btn-align-justify`);
    if (btnAlignJustify) btnAlignJustify.addEventListener('click', () => exec('justifyFull'));

    const btnIndentInc = container.querySelector(`#${editorId}-btn-indent-inc`);
    if (btnIndentInc) btnIndentInc.addEventListener('click', () => exec('indent'));
    const btnIndentDec = container.querySelector(`#${editorId}-btn-indent-dec`);
    if (btnIndentDec) btnIndentDec.addEventListener('click', () => exec('outdent'));

    // 首行缩进自定义数值（支持小数，如 1.5, 2, 2.5 字符）
    const numIndent = container.querySelector(`#${editorId}-num-indent`);
    if (numIndent) {
      const applyIndent = () => {
        const rawVal = parseFloat(numIndent.value);
        const indentVal = isNaN(rawVal) ? '2em' : `${rawVal}em`;
        const selection = window.getSelection();
        let targetP = null;
        if (selection && selection.rangeCount > 0) {
          let node = selection.anchorNode ? (selection.anchorNode.nodeType === 1 ? selection.anchorNode : selection.anchorNode.parentElement) : null;
          while (node && node !== editor && !['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'BLOCKQUOTE'].includes(node.nodeName)) {
            node = node.parentElement;
          }
          if (node && node !== editor) targetP = node;
        }
        if (targetP) {
          targetP.style.textIndent = indentVal;
          targetP.style.marginLeft = '0';
        } else {
          editor.querySelectorAll('p, div').forEach(el => { el.style.textIndent = indentVal; });
        }
        if (onChangeCallback) onChangeCallback(editor.innerHTML);
      };
      numIndent.addEventListener('input', applyIndent);
      numIndent.addEventListener('change', applyIndent);
    }

    // 悬挂缩进自定义数值（支持小数，如 1.5, 2, 2.5 字符，填 0 即取消）
    const numHangingIndent = container.querySelector(`#${editorId}-num-hanging-indent`);
    const btnApplyHanging = container.querySelector(`#${editorId}-btn-apply-hanging`);
    const applyHanging = () => {
      const rawVal = parseFloat(numHangingIndent ? numHangingIndent.value : '2');
      const selection = window.getSelection();
      let targetEl = null;
      if (selection && selection.rangeCount > 0) {
        let node = selection.anchorNode ? (selection.anchorNode.nodeType === 1 ? selection.anchorNode : selection.anchorNode.parentElement) : null;
        while (node && node !== editor && !['P', 'DIV', 'LI', 'BLOCKQUOTE'].includes(node.nodeName)) {
          node = node.parentElement;
        }
        if (node && node !== editor) targetEl = node;
      }

      if (isNaN(rawVal) || rawVal <= 0) {
        if (targetEl) {
          targetEl.style.textIndent = '0';
          targetEl.style.marginLeft = '0';
        } else {
          editor.querySelectorAll('p, div').forEach(el => {
            el.style.textIndent = '0';
            el.style.marginLeft = '0';
          });
        }
      } else {
        const val = `${rawVal}em`;
        if (targetEl) {
          targetEl.style.textIndent = `-${val}`;
          targetEl.style.marginLeft = val;
          targetEl.style.paddingLeft = '0';
        } else {
          document.execCommand('formatBlock', false, 'p');
          const newSel = window.getSelection();
          let pNode = newSel.anchorNode ? (newSel.anchorNode.nodeType === 1 ? newSel.anchorNode : newSel.anchorNode.parentElement) : null;
          while (pNode && pNode !== editor && pNode.nodeName !== 'P') { pNode = pNode.parentElement; }
          if (pNode && pNode !== editor) {
            pNode.style.textIndent = `-${val}`;
            pNode.style.marginLeft = val;
          }
        }
      }
      if (onChangeCallback) onChangeCallback(editor.innerHTML);
    };

    if (btnApplyHanging) btnApplyHanging.addEventListener('click', applyHanging);
    if (numHangingIndent) {
      numHangingIndent.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyHanging(); });
      numHangingIndent.addEventListener('change', applyHanging);
    }

    const btnListUl = container.querySelector(`#${editorId}-btn-list-ul`);
    if (btnListUl) btnListUl.addEventListener('click', () => exec('insertUnorderedList'));
    const btnListOl = container.querySelector(`#${editorId}-btn-list-ol`);
    if (btnListOl) btnListOl.addEventListener('click', () => exec('insertOrderedList'));
    const btnHr = container.querySelector(`#${editorId}-btn-hr`);
    if (btnHr) btnHr.addEventListener('click', () => exec('insertHorizontalRule'));

    const colorText = container.querySelector(`#${editorId}-color-text`);
    if (colorText) colorText.addEventListener('input', (e) => exec('foreColor', e.target.value));

    const btnHiliteY = container.querySelector(`#${editorId}-btn-hilite-yellow`);
    if (btnHiliteY) btnHiliteY.addEventListener('click', () => exec('hiliteColor', '#fef08a'));
    const btnHiliteG = container.querySelector(`#${editorId}-btn-hilite-green`);
    if (btnHiliteG) btnHiliteG.addEventListener('click', () => exec('hiliteColor', '#bbf7d0'));

    const btnClearFormat = container.querySelector(`#${editorId}-btn-clear-format`);
    if (btnClearFormat) btnClearFormat.addEventListener('click', () => exec('removeFormat'));

    // 插件 1: 插入图表与学术图题 (纯净 HTTP 文件直传 uploads/，彻底杜绝 Base64 嵌入)
    const btnInsertImg = container.querySelector(`#${editorId}-btn-insert-image`);
    if (btnInsertImg) {
      btnInsertImg.addEventListener('click', () => {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.onchange = (e) => {
          if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const currentUser = window.app?.authManager ? window.app.authManager.getCurrentUser() : null;
            const studentCode = currentUser ? (currentUser.studentCode || currentUser.id || 'A') : 'A';
            const caption = prompt('请输入学术图题说明 (例如: 图 1: 研究模型与变量关系架构图):', '图 1: 研究模型与变量关系架构图');

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
                alert('图片上传失败，请检查网络后重试');
                return;
              }
              const figureHtml = `
                <div class="academic-figure" contenteditable="false" style="text-align:center; margin:16px 0;">
                  <img src="${finalUrl}" alt="${escapeHtml(caption || '学术图表')}" style="max-width:85%; border:1px solid #cbd5e1; border-radius:6px; box-shadow:0 2px 8px rgba(0,0,0,0.1); cursor:pointer;" onclick="window.open(this.src, '_blank')">
                  <p class="figure-caption" style="font-weight:700; color:#334155; margin-top:6px; font-size:13px; text-indent:0;">${escapeHtml(caption || '图 1: 学术模型与实证架构图')}</p>
                </div>
                <p><br></p>
              `;
              exec('insertHTML', figureHtml);
            })
            .catch(err => {
              alert('图表上传网络异常，请重试');
            });
          }
        };
        fileInput.click();
      });
    }

    // 插件 2: 插入标准学术三线表 (优雅弹窗配置 + 可选 p 值备注 + 完美取消)
    const btnInsertTable = container.querySelector(`#${editorId}-btn-insert-table`);
    if (btnInsertTable) {
      btnInsertTable.addEventListener('click', () => {
        document.querySelectorAll('.table-config-modal-overlay').forEach(el => el.remove());
        const modal = document.createElement('div');
        modal.className = 'modal-overlay table-config-modal-overlay';
        modal.innerHTML = `
          <div class="teacher-modal-card" style="width:480px; background:#ffffff; color:#0f172a; border-radius:12px; box-shadow:0 20px 25px -5px rgba(0,0,0,0.2);">
            <div class="teacher-modal-header" style="background:linear-gradient(135deg, #2563eb, #1d4ed8); color:white; padding:12px 18px; border-radius:12px 12px 0 0; display:flex; justify-content:space-between; align-items:center;">
              <div style="font-weight:800; font-size:15px; display:flex; align-items:center; gap:6px;">📊 插入标准学术三线表</div>
              <button id="btn-close-table-modal" style="background:none; border:none; color:white; font-size:18px; cursor:pointer;">✕</button>
            </div>
            <div style="padding:18px; display:flex; flex-direction:column; gap:12px;">
              <div>
                <label style="font-size:12.5px; font-weight:700; color:#334155;">表格标题 (表题):</label>
                <input type="text" id="input-table-title" class="teacher-input" style="width:100%; margin-top:4px; padding:6px 10px; font-size:13px;" value="表 1: 研究变量与测量指标汇总表">
              </div>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                <div>
                  <label style="font-size:12.5px; font-weight:700; color:#334155;">表格行数 (含表头):</label>
                  <input type="number" id="input-table-rows" class="teacher-input" style="width:100%; margin-top:4px; padding:6px 10px; font-size:13px;" value="4" min="2" max="20">
                </div>
                <div>
                  <label style="font-size:12.5px; font-weight:700; color:#334155;">表格列数:</label>
                  <input type="number" id="input-table-cols" class="teacher-input" style="width:100%; margin-top:4px; padding:6px 10px; font-size:13px;" value="4" min="1" max="10">
                </div>
              </div>
              <div style="display:flex; align-items:center; gap:8px; background:#f8fafc; padding:10px 12px; border-radius:8px; border:1px solid #e2e8f0; margin-top:4px;">
                <input type="checkbox" id="chk-table-pvalue" style="width:16px; height:16px; cursor:pointer;">
                <label for="chk-table-pvalue" style="font-size:12.5px; color:#475569; cursor:pointer; user-select:none;">
                  附带显著性检验标注 (<i>注：*** p < .001, ** p < .01, * p < .05</i>)
                </label>
              </div>
            </div>
            <div class="teacher-modal-footer" style="background:#f8fafc; padding:12px 18px; border-radius:0 0 12px 12px; display:flex; justify-content:flex-end; gap:10px; border-top:1px solid #e2e8f0;">
              <button class="modal-btn cancel" id="btn-cancel-table-insert" style="padding:6px 14px; font-size:13px;">取消</button>
              <button class="modal-btn submit task-theme" id="btn-confirm-table-insert" style="background:#2563eb; color:white; border:none; padding:6px 16px; border-radius:6px; font-size:13px; font-weight:700; cursor:pointer;">✅ 确认插入</button>
            </div>
          </div>
        `;
        document.body.appendChild(modal);

        const closeModal = () => { modal.remove(); if (typeof onEscKey !== 'undefined') document.removeEventListener('keydown', onEscKey); };
        modal.querySelector('#btn-close-table-modal').addEventListener('click', closeModal);
        modal.querySelector('#btn-cancel-table-insert').addEventListener('click', closeModal);

        modal.querySelector('#btn-confirm-table-insert').addEventListener('click', () => {
          const title = modal.querySelector('#input-table-title').value.trim() || '表 1: 研究变量汇总表';
          const rows = parseInt(modal.querySelector('#input-table-rows').value) || 4;
          const cols = parseInt(modal.querySelector('#input-table-cols').value) || 4;
          const hasPValue = modal.querySelector('#chk-table-pvalue').checked;
          closeModal();

          let tableHtml = `
            <p style="text-align:center; font-weight:700; color:#334155; font-size:13px; margin-bottom:4px; text-indent:0;">${escapeHtml(title)}</p>
            <table class="academic-table" style="width:100%; border-collapse:collapse; margin:10px 0; font-size:13px;">
              <thead style="border-top:2.5px solid #0f172a; border-bottom:1.5px solid #0f172a; background:#f8fafc;">
                <tr>${Array.from({length: cols}, (_, i) => `<th style="padding:8px; text-align:center;">变量 ${i + 1}</th>`).join('')}</tr>
              </thead>
              <tbody style="border-bottom:2.5px solid #0f172a;">
                ${Array.from({length: Math.max(1, rows - 1)}, () => `<tr>${Array.from({length: cols}, () => `<td style="padding:8px; border-bottom:1px solid #e2e8f0; text-align:center;">—</td>`).join('')}</tr>`).join('')}
              </tbody>
            </table>
            ${hasPValue ? `<p style="font-size:11.5px; color:#64748b; margin-top:2px; text-indent:0;"><i>注：*** p < .001, ** p < .01, * p < .05</i></p>` : ''}
            <p><br></p>
          `;
          exec('insertHTML', tableHtml);
        });
      });
    }

    // 插件 3: 插入公式符号
    const btnInsertSymbol = container.querySelector(`#${editorId}-btn-insert-symbol`);
    if (btnInsertSymbol) {
      btnInsertSymbol.addEventListener('click', () => {
        document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        const symbols = [
          'α', 'β', 'γ', 'δ', 'ε', 'ζ', 'η', 'θ', 'λ', 'μ', 'ν', 'ξ', 'π', 'ρ', 'σ', 'τ', 'φ', 'χ', 'ψ', 'ω',
          'Δ', 'Σ', 'Ω', '∑', '∏', '∫', '±', '≠', '≤', '≥', '≈', '≡', '∝', '∞', '√', '∈', '⊂', '∪', '∩', '→',
          'M', 'SD', 'SE', 'F(1, 148)', 't(148)', 'r', 'R²', 'ΔR²', 'χ²', 'df', 'p < .05', 'p < .01', 'p < .001', 'η²',
          'Cronbach\'s α', 'AVE', 'CR', 'H₁', 'H₂', 'H₃', 'RQ₁', 'RQ₂', 'N = 150', '95% CI'
        ];
        modal.innerHTML = `
          <div class="teacher-modal-card" style="width:520px; background:#1e293b; color:#f8fafc; border:1px solid rgba(255,255,255,0.15);">
            <div class="teacher-modal-header" style="background:linear-gradient(135deg, #6366f1, #4f46e5); color:white; display:flex; justify-content:space-between; align-items:center; padding:12px 18px;">
              <div style="font-weight:800; font-size:15px;">🔣 高阶学术统计公式与符号库</div>
              <button class="modal-close-btn" id="btn-close-symbol-modal" style="background:none; border:none; color:white; font-size:18px; cursor:pointer;">✕</button>
            </div>
            <div style="padding:18px; display:grid; grid-template-columns:repeat(auto-fill, minmax(88px, 1fr)); gap:8px;">
              ${symbols.map(s => `
                <button class="sym-pick-btn" data-sym="${s}" style="background:rgba(15,23,42,0.8); border:1px solid rgba(255,255,255,0.15); color:#38bdf8; font-size:13px; font-weight:700; padding:10px 4px; border-radius:6px; cursor:pointer; transition:all 0.15s;">
                  ${s}
                </button>
              `).join('')}
            </div>
          </div>
        `;
        document.body.appendChild(modal);
        const closeModal = () => { modal.remove(); if (typeof onEscKey !== 'undefined') document.removeEventListener('keydown', onEscKey); };
        modal.querySelector('#btn-close-symbol-modal').addEventListener('click', closeModal);
        modal.querySelectorAll('.sym-pick-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            exec('insertText', ' ' + btn.dataset.sym + ' ');
            closeModal();
          });
        });
      });
    }

    // 插件 4: 插入引用角标
    const btnInsertCit = container.querySelector(`#${editorId}-btn-insert-citation`);
    if (btnInsertCit) {
      btnInsertCit.addEventListener('click', () => {
        const num = prompt('请输入文献引用编号 (例如: 1 或 2, 3):', '1');
        if (num) {
          exec('insertHTML', `<sup class="citation-tag" style="color:#0284c7; font-weight:700; font-size:11px; vertical-align:super;">[${num}]</sup>&nbsp;`);
        }
      });
    }

    // 插件 5: 插入【摘要与关键词】前置卡片
    const btnInsertAbstract = container.querySelector(`#${editorId}-btn-insert-abstract`);
    if (btnInsertAbstract) {
      btnInsertAbstract.addEventListener('click', () => {
        const abstractHtml = `
          <div class="academic-abstract-box" contenteditable="true">
            <p class="abstract-title"><b>【摘 要】</b></p>
            <p style="text-indent:2em; font-size:13.5px; line-height:1.75; color:#334155;">（请在此处简要概括研究目的、研究方法、主要发现与核心结论，字数建议在 200-300 字...）</p>
            <p class="keywords-row"><b>【关键词】</b> 多智能体协同；共享调节 (SSRL)；学术写作；研究设计</p>
          </div>
          <p><br></p>
        `;
        exec('insertHTML', abstractHtml);
      });
    }

    // 插件 6: 插入参考文献条目模版
    const btnInsertRef = container.querySelector(`#${editorId}-btn-insert-ref-template`);
    if (btnInsertRef) {
      btnInsertRef.addEventListener('click', () => {
        const refHtml = `
          <p style="text-indent:-2em; margin-left:2em; font-size:13px; color:#334155;">[1] 作者名. 论文题名[J]. 期刊学报名称, 2026, 32(4): 102-115.</p>
          <p style="text-indent:-2em; margin-left:2em; font-size:13px; color:#334155;">[2] 作者名. 专著专著书名[M]. 北京: 高等教育出版社, 2025: 45-68.</p>
        `;
        exec('insertHTML', refHtml);
      });
    }

    // 插件 7: 查找与替换
    const btnFindReplace = container.querySelector(`#${editorId}-btn-find-replace`);
    const searchBar = container.querySelector(`#${editorId}-search-bar`);
    if (btnFindReplace && searchBar) {
      btnFindReplace.addEventListener('click', () => {
        searchBar.style.display = searchBar.style.display === 'none' ? 'flex' : 'none';
      });
      container.querySelector(`#${editorId}-btn-close-search`).addEventListener('click', () => {
        searchBar.style.display = 'none';
      });
      // 查找下一个
      const btnFindNext = container.querySelector(`#${editorId}-btn-find-next`);
      const findCountTip = container.querySelector(`#${editorId}-find-count-tip`);
      if (btnFindNext) {
        btnFindNext.addEventListener('click', () => {
          const searchVal = container.querySelector(`#${editorId}-search-input`).value;
          if (!searchVal) return;
          const text = editor.innerText || '';
          const matches = text.split(searchVal).length - 1;
          if (findCountTip) findCountTip.textContent = matches > 0 ? `共 ${matches} 处` : '未找到';
          // 使用浏览器原生查找高亮
          if (window.find) {
            window.find(searchVal, false, false, true);
          }
        });
      }
      // 替换当前（仅替换第一个匹配）
      container.querySelector(`#${editorId}-btn-do-replace`).addEventListener('click', () => {
        const searchVal = container.querySelector(`#${editorId}-search-input`).value;
        const replaceVal = container.querySelector(`#${editorId}-replace-input`).value;
        if (!searchVal) { alert('请输入要查找的词！'); return; }
        const html = editor.innerHTML;
        const idx = html.indexOf(searchVal);
        if (idx === -1) { alert('未找到匹配内容'); return; }
        const newHtml = html.substring(0, idx) + replaceVal + html.substring(idx + searchVal.length);
        editor.innerHTML = newHtml;
        if (onChangeCallback) onChangeCallback(newHtml);
      });
      // 全部替换
      const btnReplaceAll = container.querySelector(`#${editorId}-btn-do-replace-all`);
      if (btnReplaceAll) {
        btnReplaceAll.addEventListener('click', () => {
          const searchVal = container.querySelector(`#${editorId}-search-input`).value;
          const replaceVal = container.querySelector(`#${editorId}-replace-input`).value;
          if (!searchVal) { alert('请输入要查找的词！'); return; }
          const html = editor.innerHTML;
          const newHtml = html.split(searchVal).join(replaceVal);
          editor.innerHTML = newHtml;
          if (onChangeCallback) onChangeCallback(newHtml);
          alert(`已完成对 "${searchVal}" 的批量替换！`);
        });
      }
    }

    if (!quillInstance) {
      // 仅在未载入 Quill 的原生 DOM 模式下作为备用输入监听
      let debounceTimer = null;
      let isComposing = false;

      editor.addEventListener('compositionstart', () => { isComposing = true; });
      editor.addEventListener('compositionend', () => {
        isComposing = false;
        if (onChangeCallback) onChangeCallback(editor.innerHTML);
      });
      editor.addEventListener('input', () => {
        window._jizhi_last_keypress_time = Date.now();
        if (isComposing) return;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          if (!isComposing && onChangeCallback) {
            onChangeCallback(editor.innerHTML);
          }
        }, 300);
      });
    } else {
      // 🚀 Quill 模式：极速记录按键时间戳，供短轮询精确对齐
      editor.addEventListener('keydown', () => {
        window._jizhi_last_keypress_time = Date.now();
      }, { passive: true });
    }
  }
}

export function renderPresencePills(editorId, state) {
  const pillsContainer = document.getElementById(`${editorId}-presence-pills`);
  if (!pillsContainer) return;
  
  // 🛡️ 稳健自动水合：若 state.members 为空，自动从 authManager 实时加载本组成员
  let membersObj = state.members;
  if (!membersObj || (Array.isArray(membersObj) ? membersObj.length === 0 : Object.keys(membersObj).length === 0)) {
    if (window.app && window.app.authManager) {
      const activeGroup = window.app.authManager.getStudentActiveGroup(window.app.authManager.getCurrentUser(), state.activeStudentClassId);
      const gid = activeGroup?.id || state.activeMonitorGroupId || 'group_1';
      membersObj = window.app.authManager.getGroupMembersForWorkspace(gid);
      state.members = membersObj;
    }
  }
  const membersList = Array.isArray(membersObj) ? membersObj : Object.values(membersObj || {});
  const currUserObj = (window.app && window.app.authManager) ? window.app.authManager.getCurrentUser() : null;
  const currentUid = currUserObj ? String(currUserObj.id || currUserObj.studentCode || '').trim() : (state.currentUser || '');
  const presence = state.presence || {};
  const serverNow = (state && state.serverTimestamp) ? Number(state.serverTimestamp) : Date.now();
  const allUsers = (window.app && window.app.authManager) ? window.app.authManager.getUsers() : [];

  const newHtml = membersList.map(m => {
    const uid = String(m.id || m.studentCode || m.userId || '').trim();
    const candidateKeys = [
      String(m.id || '').trim(),
      String(m.studentCode || '').trim(),
      String(m.username || '').trim(),
      String(m.name || '').trim()
    ].filter(Boolean);

    const isSelf = (currUserObj && (
      (currUserObj.id && (m.id === currUserObj.id || uid === String(currUserObj.id))) ||
      (currUserObj.studentCode && (m.studentCode === currUserObj.studentCode || uid === String(currUserObj.studentCode))) ||
      (currUserObj.username && (m.username === currUserObj.username || uid === String(currUserObj.username))) ||
      (currUserObj.name && m.name === currUserObj.name)
    )) || (uid && uid === currentUid);
    
    let isOnline = isSelf;
    if (!isOnline) {
      for (const k of candidateKeys) {
        const p = presence[k];
        if (p) {
          const pTime = Number(p.lastSeen || p.updatedAt || p.timestamp || 0);
          if (pTime > 0 && Math.abs(serverNow - pTime) <= 25000) {
            isOnline = true;
            break;
          }
        }
      }
    }

    const sectionText = isSelf ? ' (我)' : (isOnline ? ' (在线)' : ' (离线)');
    const color = m.color || '#2563eb';
    let displayName = m.name || m.studentCode || uid;
    const matchedUser = allUsers.find(u => (u.id && u.id === uid) || (u.studentCode && u.studentCode === uid) || (u.username && u.username === uid));
    if (matchedUser && matchedUser.name) displayName = matchedUser.name;

    return `
      <span class="collab-presence-pill ${isOnline ? 'active' : ''}" style="${isOnline ? `border-color:${color}; color:${color}; background:#ffffff; font-weight:700;` : 'color:#94a3b8; background:#f1f5f9;'}">
        <span class="collab-presence-dot" style="background:${isOnline ? color : '#cbd5e1'};"></span>
        ${m.avatar || '👨‍🎓'} ${displayName}<span style="font-weight:normal; font-size:10px; color:${isOnline ? '#059669' : '#94a3b8'};">${sectionText}</span>
      </span>
    `;
  }).join('');

  if (pillsContainer.innerHTML !== newHtml) {
    pillsContainer.innerHTML = newHtml;
  }
}

export function renderRemoteCursors(editorId, state) {
  renderPresencePills(editorId, state);
  const editor = document.getElementById(editorId);
  if (!editor) return;

  // 🛡️ 纯净化图层：彻底清除富文本内部的任何历史残留光标 DOM
  editor.querySelectorAll('.remote-cursor-widget').forEach(el => el.remove());
}

function renderStage1Canvas(canvas, state, handlers) {
  // 🛡️ 焦点保护：记录当前正在打字的输入框与光标位置，防止短轮询重绘导致失焦与吞字
  const activeEl = canvas.querySelector('input:focus, textarea:focus');
  const activeKey = activeEl ? (activeEl.id || activeEl.dataset.key || activeEl.dataset.mkey) : null;
  const activeVal = activeEl ? activeEl.value : null;
  const activeCursor = activeEl ? activeEl.selectionStart : null;

  const s1 = state.stage1;
  const currentUser = state.currentUser;
  const currUserObj = (window.app && window.app.authManager) ? window.app.authManager.getCurrentUser() : null;
  const allUsers = (window.app && window.app.authManager) ? window.app.authManager.getUsers() : [];
  const membersList = Object.values(state.members || {});
  const totalMembersCount = membersList.length;

  if (!s1.contract.taskAssignments) s1.contract.taskAssignments = {};
  if (!s1.contract.timeAllocations) s1.contract.timeAllocations = {};

  const allTasks = (window.app && window.app.authManager) ? window.app.authManager.getTasks() : [];
  const currentTask = allTasks.find(t => t.id === state.activeTaskId);
  const isTaskDeadlineExpired = isTaskExpired(currentTask);

  // 🛡️ 稳健的多标识判定辅助函数（零破坏底层存储结构，仅在名单比对时精准去重）
  const isMemberDone = (map, m) => {
    if (!map || !m) return false;
    return !!(map[m.id] || map[m.studentCode] || map[m.username] || (m.name && map[m.name]));
  };

  const confirmedMembers = s1.contract.confirmedMembers || {};
  const confirmedCount = membersList.filter(m => isMemberDone(confirmedMembers, m)).length;
  const userHasConfirmed = isMemberDone(confirmedMembers, { id: currentUser, studentCode: currUserObj?.studentCode, username: currUserObj?.username, name: currUserObj?.name });
  
  // 🛡️ 真正的公约生效锁定判定：服务端公约已标记生效、或全员已签、或小组已进入阶段二/三、或全盘已提交/任务已截止
  const isAllConfirmed = (totalMembersCount > 0 && confirmedCount >= totalMembersCount);
  const isContractLocked = !!(s1.contract && s1.contract.isConfirmed) || isAllConfirmed || (state.groupMaxStage === 'stage2' || state.groupMaxStage === 'stage3') || state.isFinalSubmitted || isTaskDeadlineExpired;
  if (s1.contract && isAllConfirmed) s1.contract.isConfirmed = true;

  const userHasVoted = isMemberDone(s1.hasVoted, { id: currentUser, studentCode: currUserObj?.studentCode, username: currUserObj?.username, name: currUserObj?.name });
  const userVotedProposalId = s1.votes ? (s1.votes[currentUser] || (currUserObj && (s1.votes[currUserObj.id] || s1.votes[currUserObj.studentCode] || (currUserObj.name && s1.votes[currUserObj.name])))) : null;
  
  // 严格统计全组实际已投票人数
  const totalVotesCast = membersList.filter(m => isMemberDone(s1.hasVoted, m)).length;
  const isVotingComplete = (totalMembersCount > 0 && totalVotesCast >= totalMembersCount);

  // 严密判断当前登录学生是否已提交提案 (支持 id, studentCode, username, 姓名多重比对)
  const myIds = new Set([currentUser, currUserObj?.id, currUserObj?.studentCode, currUserObj?.username, currUserObj?.name].filter(Boolean));
  const hasSubmittedMyProposal = s1.proposals.some(p => myIds.has(p.author) || (currUserObj && (p.authorName === currUserObj.name || p.author === currUserObj.name)));
  const currentUserName = currUserObj ? currUserObj.name : (state.members[currentUser] ? state.members[currentUser].name : '组员');

  canvas.innerHTML = `
    ${isTaskDeadlineExpired ? `
      <div style="background:#fef2f2; border:1.5px solid #fca5a5; border-radius:8px; padding:6px 14px; margin-bottom:12px; font-size:12.5px; color:#991b1b; font-weight:600; display:flex; justify-content:space-between; align-items:center; gap:12px; box-shadow:0 2px 6px rgba(239,68,68,0.08); height:38px; box-sizing:border-box;">
        <div style="display:flex; align-items:center; gap:8px; min-width:0; flex:1; overflow:hidden; white-space:nowrap; text-overflow:ellipsis;">
          <span style="font-size:15px; flex-shrink:0;">🔒</span>
          <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"><b>任务已截止锁定：</b> 本任务已于 <b>${currentTask?.deadline || '截止时间'}</b> 截止，阶段一【学术拍卖会】已自动转为<b>【只读查阅模式】</b>。如需修改请联系教师延长时间。</span>
        </div>
        <span style="font-size:11.5px; color:#ffffff; background:#dc2626; padding:2px 8px; border-radius:4px; font-weight:800; flex-shrink:0; letter-spacing:0.5px;">已截止</span>
      </div>
    ` : (isContractLocked ? `
      <div style="background:#ecfdf5; border:1px solid #a7f3d0; border-radius:8px; padding:6px 14px; margin-bottom:12px; font-size:12.5px; color:#059669; font-weight:700; display:flex; align-items:center; justify-content:space-between; height:38px; box-sizing:border-box;">
        <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">🔒 阶段一【学术拍卖会】合作公约已全员签署生效并锁定 (可随时查阅)</span>
        <span style="font-size:11.5px; color:#065f46; background:#ffffff; border:1px solid #a7f3d0; padding:2px 8px; border-radius:4px; flex-shrink:0;">全组 ${confirmedCount}/${totalMembersCount} 人已签署</span>
      </div>
    ` : '')}

    <div class="card">
      <div class="card-title" style="display:flex; justify-content:space-between; align-items:center;">
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="font-weight:800; font-size:15px; color:#0f172a;">💡 竞拍提案池 ${isContractLocked ? '<span style="font-size:11px; color:#059669;">🔒 已锁定</span>' : ''}</span>
          <span style="font-size:12px; color:#2563eb; background:#eff6ff; padding:2px 8px; border-radius:10px; border:1px solid #bfdbfe;">
            ${isVotingComplete ? `🎉 投票已完成 (共投出 ${totalVotesCast} 票)` : `📊 投票进度: <b>${totalVotesCast}/${totalMembersCount} 人已投票</b> ${userHasVoted ? '<span style="color:#059669; font-weight:700; margin-left:4px;">(您已投票，等待其他组员)</span>' : ''}`}
          </span>
        </div>
        ${!isContractLocked ? `
          <button id="btn-open-submit-proposal" style="background:linear-gradient(135deg, #2563eb, #1d4ed8); border:none; color:white; padding:7px 16px; border-radius:8px; font-weight:700; font-size:13px; cursor:pointer; box-shadow:0 3px 10px rgba(37,99,235,0.3);">
            ${hasSubmittedMyProposal ? '✏️ 修改我的选题' : '+ 提交我的选题'}
          </button>
        ` : ''}
      </div>

      <div id="proposals-wrapper-container">
        ${s1.proposals.length === 0 ? `
          <div style="text-align:center; padding:36px; background:#f8fafc; border-radius:10px; border:2px dashed #cbd5e1; margin-top:10px;">
            <div style="font-size:32px; margin-bottom:8px;">💡</div>
            <div style="font-size:15px; font-weight:800; color:#0f172a;">目前暂无小组成员提交的选题</div>
            <div style="font-size:12.5px; color:#64748b; margin-top:4px;">请点击右上角【+ 提交我的选题】录入选题名称。</div>
          </div>
        ` : `
          <div class="proposals-grid" style="margin-top:12px;">
            ${s1.proposals.map(p => {
              // 动态聚合计算该提案的真实得票数
              const proposalVotesCount = membersList.filter(m => {
                if (!s1.votes) return false;
                const v = s1.votes[m.studentCode] || s1.votes[m.id] || s1.votes[m.username] || (m.name && s1.votes[m.name]);
                return v === p.id;
              }).length;

              const isThisVoted = userVotedProposalId === p.id;
              let btnText = '🗳️ 投票支持';
              let btnClass = 'vote-btn';
              let btnDisabled = false;
              if (isContractLocked) {
                btnText = isThisVoted ? '🔒 已确立选题' : '🔒 公约已锁定';
                btnClass = 'vote-btn disabled';
                btnDisabled = true;
              } else if (isVotingComplete) {
                if (isThisVoted) { btnText = '✅ 我的投票 (全员已完成)'; btnClass = 'vote-btn active locked'; }
                else { btnText = '未选择'; btnClass = 'vote-btn disabled'; }
                btnDisabled = true;
              } else if (userHasVoted) {
                if (isThisVoted) { btnText = '✅ 我已支持此提案'; btnClass = 'vote-btn active locked'; }
                else { btnText = '未选择'; btnClass = 'vote-btn disabled'; }
                btnDisabled = true;
              }
              const authorUser = allUsers.find(u => u.id === p.author || u.studentCode === p.author || u.username === p.author || u.name === p.author || u.name === p.authorName);
              const authorName = (authorUser ? authorUser.name : null) || p.authorName || (state.members[p.author] ? state.members[p.author].name : p.author);
              return `
                <div class="proposal-card ${isThisVoted ? 'voted' : ''}" style="display:flex; flex-direction:column; position:relative;">
                  <div class="proposal-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <div class="proposal-title" style="font-weight:800; font-size:14px; color:#0f172a;">💡 ${escapeHtml(p.title)}</div>
                    <span style="font-size:11.5px; background:${proposalVotesCount > 0 ? '#eff6ff' : '#f8fafc'}; color:${proposalVotesCount > 0 ? '#2563eb' : '#64748b'}; border:1px solid ${proposalVotesCount > 0 ? '#bfdbfe' : '#e2e8f0'}; padding:2px 8px; border-radius:10px; font-weight:700; flex-shrink:0;">
                      得票: <b>${proposalVotesCount}</b> 票
                    </span>
                  </div>
                  <div style="font-size:12px; color:#64748b; margin-bottom:10px;">提出人: <b style="color:#0f172a;">${escapeHtml(authorName)}</b></div>
                  <button class="${btnClass}" data-id="${p.id}" ${btnDisabled ? 'disabled' : ''} style="width:100%; margin-top:auto;">${btnText}</button>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>
    </div>

    <!-- 一整个统一的合作学术合约公约框架卡片 (蓝白层次风) -->
    <div class="contract-card" style="margin-top:16px; border:2px solid #3b82f6; border-radius:16px; background:#ffffff; padding:24px; box-shadow:0 10px 30px rgba(37,99,235,0.08); width:100%; box-sizing:border-box;">
      
      <div style="text-align:center; margin-bottom:20px; border-bottom:1px solid #e2e8f0; padding-bottom:16px;">
        <div style="font-size:20px; font-weight:800; color:#1e3a8a;">
          📜 团队协同合作学术合约
        </div>
        <div style="font-size:12.5px; color:#64748b; margin-top:4px;">
          ${isContractLocked ? `<span style="color:#059669; font-weight:700;">🔒 全员 ${confirmedCount}/${totalMembersCount} 人完成签署 · 归档生效中</span>` : '小组成员在研讨区商讨后，可提炼生成或自由微调各项内容，全员确认后签署生效'}
        </div>
        ${!isContractLocked ? `
          <div style="margin-top:12px; display:flex; justify-content:center;">
            ${s1.contract?.isDraftGenerated ? `
              <div style="background:#f0fdf4; border:1.5px solid #86efac; color:#15803d; padding:7px 22px; border-radius:20px; font-weight:800; font-size:13px; display:inline-flex; align-items:center; gap:6px; box-shadow:0 2px 8px rgba(34,197,94,0.15);">
                ✅ 公约草案已提炼生成（全组可直接在下方各栏目微调修改）
              </div>
            ` : `
              <button id="btn-generate-contract-draft" style="background:linear-gradient(135deg, #7c3aed, #6d28d9); border:none; color:white; padding:8px 20px; border-radius:20px; font-weight:700; font-size:13px; cursor:pointer; display:inline-flex; align-items:center; gap:6px; box-shadow:0 3px 12px rgba(124,58,237,0.25);">
                🤖 研讨差不多了？一键提炼研讨共识生成公约草案
              </button>
            `}
          </div>
        ` : ''}
      </div>

      <div style="display:flex; flex-direction:column; gap:8px; width:100%; margin-bottom:20px; background:#eff6ff; padding:16px; border-radius:12px; border:1px solid #bfdbfe; box-sizing:border-box;">
        <label style="font-size:14px; font-weight:800; color:#1e40af;">📌 确认融合论文研究主题:</label>
        <input type="text" id="contract-topic-input" class="large-contract-input" data-lock-key="topic_title" value="${s1.mergedTitle || ''}" placeholder="在此处输入研究方案最终主题..." ${isContractLocked ? 'disabled readonly style="opacity:0.8; cursor:not-allowed;"' : ''} style="width:100%; box-sizing:border-box; background:#ffffff; color:#0f172a; border:1px solid #cbd5e1; border-radius:8px; padding:12px 14px; font-size:14px; font-weight:700; font-family:sans-serif;">
      </div>

      <div style="display:flex; flex-direction:column; gap:16px; width:100%;">
        <!-- 6大研究设计方案模块与时间规划 -->
        <div style="background:#f8fafc; padding:18px; border-radius:12px; border:1px solid #bfdbfe; width:100%; box-sizing:border-box;">
          <div style="font-weight:800; color:#1e40af; margin-bottom:14px; font-size:14px;">
            📚 研究方案核心模块与时间规划:
          </div>
          
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <!-- 模块 1 -->
            <div style="background:#ffffff; border:1px solid #e2e8f0; border-left:3.5px solid #2563eb; border-radius:8px; padding:12px 14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap;">
              <span style="font-weight:800; color:#1e40af; font-size:13.5px;">一、研究背景与意义</span>
              <label style="font-size:12px; color:#475569; display:flex; align-items:center; gap:4px;">
                用时: <input type="number" class="contract-time-input" data-key="background" data-lock-key="time_background" value="${s1.contract.timeAllocations.background !== undefined ? s1.contract.timeAllocations.background : 25}" ${isContractLocked ? 'disabled readonly style="opacity:0.8; cursor:not-allowed;"' : ''} style="width:48px; padding:3px 4px; border:1px solid #cbd5e1; border-radius:4px; text-align:center; font-weight:700;"> 分钟
              </label>
            </div>

            <!-- 模块 2 -->
            <div style="background:#ffffff; border:1px solid #e2e8f0; border-left:3.5px solid #0284c7; border-radius:8px; padding:12px 14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap;">
              <span style="font-weight:800; color:#0369a1; font-size:13.5px;">二、文献综述</span>
              <label style="font-size:12px; color:#475569; display:flex; align-items:center; gap:4px;">
                用时: <input type="number" class="contract-time-input" data-key="literature" data-lock-key="time_literature" value="${s1.contract.timeAllocations.literature !== undefined ? s1.contract.timeAllocations.literature : 30}" ${isContractLocked ? 'disabled readonly style="opacity:0.8; cursor:not-allowed;"' : ''} style="width:48px; padding:3px 4px; border:1px solid #cbd5e1; border-radius:4px; text-align:center; font-weight:700;"> 分钟
              </label>
            </div>

            <!-- 模块 3 -->
            <div style="background:#ffffff; border:1px solid #e2e8f0; border-left:3.5px solid #059669; border-radius:8px; padding:12px 14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap;">
              <span style="font-weight:800; color:#065f46; font-size:13.5px;">三、研究问题与假设</span>
              <label style="font-size:12px; color:#475569; display:flex; align-items:center; gap:4px;">
                用时: <input type="number" class="contract-time-input" data-key="questions" data-lock-key="time_questions" value="${s1.contract.timeAllocations.questions !== undefined ? s1.contract.timeAllocations.questions : 25}" ${isContractLocked ? 'disabled readonly style="opacity:0.8; cursor:not-allowed;"' : ''} style="width:48px; padding:3px 4px; border:1px solid #cbd5e1; border-radius:4px; text-align:center; font-weight:700;"> 分钟
              </label>
            </div>

            <!-- 模块 4 -->
            <div style="background:#ffffff; border:1px solid #e2e8f0; border-left:3.5px solid #7c3aed; border-radius:8px; padding:12px 14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap;">
              <span style="font-weight:800; color:#6d28d9; font-size:13.5px;">四、研究设计与方法</span>
              <label style="font-size:12px; color:#475569; display:flex; align-items:center; gap:4px;">
                用时: <input type="number" class="contract-time-input" data-key="method" data-lock-key="time_method" value="${s1.contract.timeAllocations.method !== undefined ? s1.contract.timeAllocations.method : 40}" ${isContractLocked ? 'disabled readonly style="opacity:0.8; cursor:not-allowed;"' : ''} style="width:48px; padding:3px 4px; border:1px solid #cbd5e1; border-radius:4px; text-align:center; font-weight:700;"> 分钟
              </label>
            </div>

            <!-- 模块 5 -->
            <div style="background:#ffffff; border:1px solid #e2e8f0; border-left:3.5px solid #d97706; border-radius:8px; padding:12px 14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap;">
              <span style="font-weight:800; color:#b45309; font-size:13.5px;">五、研究设计的不足与反思</span>
              <label style="font-size:12px; color:#475569; display:flex; align-items:center; gap:4px;">
                用时: <input type="number" class="contract-time-input" data-key="reflection" data-lock-key="time_reflection" value="${s1.contract.timeAllocations.reflection !== undefined ? s1.contract.timeAllocations.reflection : 20}" ${isContractLocked ? 'disabled readonly style="opacity:0.8; cursor:not-allowed;"' : ''} style="width:48px; padding:3px 4px; border:1px solid #cbd5e1; border-radius:4px; text-align:center; font-weight:700;"> 分钟
              </label>
            </div>

            <!-- 模块 6 -->
            <div style="background:#ffffff; border:1px solid #e2e8f0; border-left:3.5px solid #475569; border-radius:8px; padding:12px 14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap;">
              <span style="font-weight:800; color:#334155; font-size:13.5px;">六、参考文献</span>
              <label style="font-size:12px; color:#475569; display:flex; align-items:center; gap:4px;">
                用时: <input type="number" class="contract-time-input" data-key="references" data-lock-key="time_references" value="${s1.contract.timeAllocations.references !== undefined ? s1.contract.timeAllocations.references : 10}" ${isContractLocked ? 'disabled readonly style="opacity:0.8; cursor:not-allowed;"' : ''} style="width:48px; padding:3px 4px; border:1px solid #cbd5e1; border-radius:4px; text-align:center; font-weight:700;"> 分钟
              </label>
            </div>
          </div>
        </div>

        <div style="background:#f8fafc; padding:16px; border-radius:12px; border:1px solid #e2e8f0; width:100%; box-sizing:border-box;">
          <div style="font-weight:700; color:#1e40af; margin-bottom:12px; font-size:14px; display:flex; justify-content:space-between; align-items:center;">
            <span>👥 本组小组成员分工 (共 ${totalMembersCount} 人):</span>
          </div>
          <div style="display:flex; flex-direction:column; gap:10px; width:100%;">
            ${membersList.map((m, idx) => {
              const mKey = m.id || m.studentCode || m.username || m.name || (`mem_${idx}`);
              const taskVal = (s1.contract.taskAssignments && (
                s1.contract.taskAssignments[mKey] !== undefined ? s1.contract.taskAssignments[mKey] :
                (m.id && s1.contract.taskAssignments[m.id] !== undefined ? s1.contract.taskAssignments[m.id] :
                (m.studentCode && s1.contract.taskAssignments[m.studentCode] !== undefined ? s1.contract.taskAssignments[m.studentCode] :
                (m.name && s1.contract.taskAssignments[m.name] !== undefined ? s1.contract.taskAssignments[m.name] : '')))
              )) || '';
              return `
                <div style="display:flex; flex-direction:column; gap:6px; width:100%; background:#ffffff; padding:12px 14px; border-radius:8px; border:1px solid #e2e8f0; box-sizing:border-box;">
                  <span style="font-weight:800; color:${m.color || '#2563eb'}; font-size:13px;">${m.avatar || '👤'} ${m.name} (${m.roleTitle || '组员'}):</span>
                  <input type="text" class="large-contract-input task-assignment-input" data-mkey="${mKey}" data-lock-key="task_${mKey}" value="${taskVal}" ${isContractLocked ? 'disabled readonly style="opacity:0.8; cursor:not-allowed;"' : ''} style="width:100%; box-sizing:border-box; background:#ffffff; color:#0f172a; border:1px solid #cbd5e1; border-radius:6px; padding:10px 14px; font-size:13px; font-family:sans-serif;" placeholder="在聊天中商定或在此录入具体负责的写作章节与任务...">
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>

      <div style="margin-top:16px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:14px 18px; width:100%; box-sizing:border-box;">
        <div style="font-size:13px; font-weight:700; color:#334155; margin-bottom:10px; display:flex; justify-content:space-between; flex-wrap:wrap; gap:10px;">
          <span>📌 本组全员确认签署状态矩阵 (规则：需 ${totalMembersCount}/${totalMembersCount} 人全部点击确认):</span>
          <span style="color:${confirmedCount === totalMembersCount ? '#059669' : '#d97706'}; font-weight:800;">签署进度: ${confirmedCount}/${totalMembersCount} 人已完成 ${confirmedCount === totalMembersCount ? '🎉 (合约已生效)' : ''}</span>
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:10px; font-size:13px;">
          ${membersList.map(m => {
            const isConf = isMemberDone(confirmedMembers, m);
            return `
              <span style="color:${isConf ? '#059669' : '#64748b'}; border:1px solid ${isConf ? '#a7f3d0' : '#e2e8f0'}; background:${isConf ? '#ecfdf5' : '#ffffff'}; padding:6px 12px; border-radius:8px; font-weight:600;">
                ${m.avatar || '👤'} ${m.name}: <b>${isConf ? '✅ 已确认签署' : '⏳ 未确认'}</b>
              </span>
            `;
          }).join('')}
        </div>
      </div>

      <div style="margin-top:20px; text-align:center; display:flex; justify-content:center; gap:12px; flex-wrap:wrap;">
        ${isContractLocked ? `
          <button id="btn-goto-stage2" style="background:linear-gradient(135deg, #2563eb, #1d4ed8); border:none; color:white; padding:13px 36px; border-radius:10px; font-weight:800; cursor:pointer; font-size:15px; box-shadow:0 4px 14px rgba(37,99,235,0.3); display:inline-flex; align-items:center; gap:8px;">
            🚀 全员已签署完毕！前往【阶段二：学术编辑部】开始论文起草 →
          </button>
        ` : `
          <button id="btn-confirm-contract" style="background:${userHasConfirmed ? '#eff6ff' : 'linear-gradient(135deg, #059669, #047857)'}; border:1px solid ${userHasConfirmed ? '#bfdbfe' : 'transparent'}; color:${userHasConfirmed ? '#1d4ed8' : 'white'}; padding:13px 32px; border-radius:10px; font-weight:800; cursor:pointer; font-size:14.5px; box-shadow:0 3px 12px rgba(5,150,105,0.25);">
            ${userHasConfirmed ? `✅ 我 (${currentUserName}) 已按键确认签署 (${confirmedCount}/${totalMembersCount} 人已完成)` : `✍️ 我以 (${currentUserName}) 身份按键确认签署合约 (已确认 ${confirmedCount}/${totalMembersCount} 人)`}
          </button>
        `}
      </div>

    </div>
  `;

  // 提案提交弹窗绑定 (支持新提交与修改已有选题，每人严格限制 1 个提案)
  const btnOpenProp = canvas.querySelector('#btn-open-submit-proposal');
  if (btnOpenProp) {
    btnOpenProp.addEventListener('click', () => {
      document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
      const existingProp = s1.proposals.find(p => myIds.has(p.author) || (currUserObj && (p.authorName === currUserObj.name || p.author === currUserObj.name)));
      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="teacher-modal-card fancy-task-modal" style="width:520px;">
          <div class="teacher-modal-header task-theme-gradient">
            <div class="modal-header-title">
              <div class="modal-icon-badge task">💡</div>
              <div><h3>${existingProp ? '修改我的选题提案' : '提交我的选题提案 (每人限1个)'}</h3></div>
            </div>
            <button class="modal-close-btn" id="btn-close-prop-modal">✕</button>
          </div>
          <div class="teacher-modal-body">
            <div class="teacher-form-group">
              <label><span class="req">*</span> 选题名称</label>
              <input type="text" id="prop-title-input" class="teacher-input fancy" placeholder="请输入您的选题名称..." value="${existingProp ? existingProp.title : ''}">
              <div style="font-size:12px; color:#64748b; margin-top:4px;">💡 提示：每位小组成员提交 1 份选题提案，提交后可随时修改完善。</div>
            </div>
          </div>
          <div class="teacher-modal-footer">
            <button class="modal-btn cancel" id="btn-cancel-prop">取消</button>
            <button class="modal-btn submit task-theme" id="btn-submit-prop-action">${existingProp ? '💾 保存修改' : '💡 确认提交至提案池'}</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      const closeModal = () => { modal.remove(); if (typeof onEscKey !== 'undefined') document.removeEventListener('keydown', onEscKey); };
      modal.querySelector('#btn-close-prop-modal').addEventListener('click', closeModal);
      modal.querySelector('#btn-cancel-prop').addEventListener('click', closeModal);

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

      modal.querySelector('#prop-title-input').addEventListener('input', () => {
        if (window.app) window.app.stage1LastActionTime = Date.now();
      });

      modal.querySelector('#btn-submit-prop-action').addEventListener('click', async () => {
        const title = modal.querySelector('#prop-title-input').value.trim();
        if (!title) { alert('⚠️ 请输入选题名称！'); return; }

        if (window.app) window.app.stage1LastActionTime = Date.now();

        const existingIdx = s1.proposals.findIndex(p => myIds.has(p.author) || (currUserObj && (p.authorName === currUserObj.name || p.author === currUserObj.name)));
        const nowMs = Date.now();
        if (existingIdx >= 0) {
          // 已有提案：更新标题与修改时间戳（保持每人 1 份，时间戳最新）
          s1.proposals[existingIdx].title = title;
          s1.proposals[existingIdx].authorName = currentUserName;
          s1.proposals[existingIdx].updatedAt = nowMs;
        } else {
          s1.proposals.push({
            id: 'prop_' + currentUser + '_' + nowMs,
            author: currentUser,
            authorName: currentUserName,
            title: title,
            updatedAt: nowMs
          });
        }

        const currentStage = state.currentStage;
        let memberArr = [];
        if (Array.isArray(state.members)) {
          memberArr = state.members;
        } else if (state.members && typeof state.members === 'object') {
          memberArr = Object.values(state.members);
        }
        if (memberArr.length === 0 && window.app?.authManager) {
          const u = window.app.authManager.getCurrentUser();
          const effClassId = window.app.state.activeStudentClassId || u?.classId || 'class_101';
          const effGroup = window.app.authManager.getStudentActiveGroup(u, effClassId);
          memberArr = window.app.authManager.getGroupMembersForWorkspace(effGroup?.id || 'group_1');
        }

        const memObj = memberArr.find(m => m && (m.id === currentUser || m.studentCode === currentUser || m.realStudentCode === currentUser || m.username === currentUser || m.name === currentUser));
        const authorName = memObj ? memObj.name : (currentUser || '组员');
        const totalMembersCount = memberArr.length > 0 ? memberArr.length : 0;
        const submittedAuthorsCount = new Set((s1.proposals || []).map(p => p.author || p.authorName)).size;

        const submitNoticeMsg = {
          sender: currentUser,
          senderName: authorName,
          text: `💡 【新选题提出】我 (${authorName}) 提出了新选题提案《${title}》！`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          _timeMs: Date.now()
        };
        if (!state.chatLogs[currentStage]) state.chatLogs[currentStage] = [];
        state.chatLogs[currentStage].push(submitNoticeMsg);

        closeModal();
        handlers.onRefresh();
        if (window.app) {
          window.app.syncStage1();
          if (window.app.cloudSyncEngine) {
            window.app.cloudSyncEngine.pushSnapshot();
          }
        }

        // 💡 0毫秒即时反馈：立即插入拍卖师思考气泡，让学生感知到 AI 已收到提案正在评审
        const tempThinkingId = 'thinking_eval_' + Date.now();
        const evalThinkingMsg = {
          id: tempThinkingId,
          sender: 'auctioneer',
          senderName: '头脑风暴 · 学术拍卖师',
          text: `⏳ 【学术拍卖师】：已收到《${title}》，正在通读研究构想并起草即时学术可行性评估...`,
          isThinking: true,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          _timeMs: Date.now()
        };
        if (!state.chatLogs[currentStage]) state.chatLogs[currentStage] = [];
        state.chatLogs[currentStage].push(evalThinkingMsg);
        if (window.app) {
          window.app.syncChatLogs();
          renderChat(state);
        }

        setTimeout(async () => {
          const isModify = existingIdx >= 0;
          const evalPrompt = isModify
            ? `小组成员【${authorName}】在学术拍卖会上修改了选题提案，最新题目为《${title}》。
请作为资深学术拍卖师，通读其学科场景与研究构想，给出 130~150 字充实针对性的学术点评：
【无意义内容红线审查】：先审查提案是否包含无意义乱码、重复堆砌或过于空泛到无法提取论点。若命中，严禁虚构亮点，应如实简短提醒「当前内容尚未形成可评审的实质文本」并引导补充具体问题或方法设想；
【正常实质评价】：若内容充实，必须先明确肯定该提案最出彩的 1~2 个具体优点（抓准了什么核心痛点/打破了什么教学局限），再顺势结合该方案提出 1 个具体的启发性落地建议（严禁空泛套话，纯自然语言输出，130~150字）！`
            : `小组成员【${authorName}】在学术拍卖会上提交了新选题提案《${title}》。
请作为资深学术拍卖师，通读其学科场景与研究构想，给出 130~150 字充实针对性的学术点评：
【无意义内容红线审查】：先审查提案是否包含无意义乱码、重复堆砌或过于空泛到无法提取论点。若命中，严禁虚构亮点，应如实简短提醒「当前内容尚未形成可评审的实质文本」并引导补充具体问题或方法设想；
【正常实质评价】：若内容充实，必须先明确肯定该提案最出彩的 1~2 个具体优点（抓准了什么核心痛点/打破了什么教学局限），再顺势结合该方案提出 1 个具体的启发性落地建议（严禁空泛套话，纯自然语言输出，130~150字）！`;
          
          let evalText = await callCozeAgentAPI('auctioneer', evalPrompt, { stage: 'stage1', proposalTitle: title, author: authorName, topic: title });
          if (!evalText || evalText.trim().length === 0) {
            evalText = `🎪 【拍卖师·提案评估】：收到 ${authorName} 提出的选题《${title}》！该构想切中实践痛点，通过明确的研究设计打破了传统教学局限！建议后续在研究设计中进一步细化具体的实证环节与实施步骤，这样在接下来的竞拍研讨中会更具说服力！`;
          }

          evalThinkingMsg.text = evalText;
          delete evalThinkingMsg.isThinking;
          if (window.app) {
            window.app.syncChatLogs();
            renderChat(state);
          }

          const isSubstantive = (t) => {
            const str = (t || '').trim();
            if (str.length < 4) return false;
            if (/^\d+$/.test(str)) return false; 
            if (/^([a-zA-Z0-9\u4e00-\u9fa5])\1+$/.test(str)) return false; 
            return true;
          };
          const currentProps = s1.proposals || [];
          const validProps = currentProps.filter(p => isSubstantive(p.title));
          const validAuthors = new Set(validProps.map(p => p.author || p.authorName));

          if (totalMembersCount >= 2 && validAuthors.size >= totalMembersCount && !s1._allProposalsPrompted) {
            s1._allProposalsPrompted = true;
            const allCollectedMsg = {
              sender: 'auctioneer',
              senderName: '头脑风暴 · 学术拍卖师',
              text: `🎪 【拍卖师·全员提案已集齐】：🎉 小组成员的选题提案已悉数亮相！👉 请大家先不要急于投票，先在右侧讨论区充分交流各个方案的研究看点与实施可行性；💬 研讨达成初步共识后，再在上方为最终认可的方案进行投票！`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              _timeMs: Date.now() + 100
            };
            state.chatLogs[currentStage].push(allCollectedMsg);
          }

          if (window.app) {
            window.app.syncChatLogs();
            if (window.app.cloudSyncEngine) window.app.cloudSyncEngine.pushSnapshot();
            renderChat(state);
          }
        }, 500);
      });
    });
  }

  const getLockPayload = (fieldKey, value = null) => {
    const currUser = (window.app && window.app.authManager) ? window.app.authManager.getCurrentUser() : null;
    const isTeacher = currUser && (currUser.role === 'teacher' || currUser.isTeacher);
    const effectiveClassId = (isTeacher ? window.app?.state.activeClassId : window.app?.state.activeStudentClassId) || (currUser?.classId || 'class_101');
    const activeGroupObj = window.app?.authManager ? window.app.authManager.getStudentActiveGroup(currUser, effectiveClassId) : null;
    const curGid = activeGroupObj?.id || (currUser?.groupId || 'group_1');
    let curTaskId = window.app?.state.activeTaskId || (window.app?.cloudSyncEngine?.taskId || `task_${effectiveClassId}_default`);
    if (!curTaskId || curTaskId === 'task_default') {
      curTaskId = `task_${effectiveClassId}_default`;
    }
    const uId = currUser ? (currUser.studentCode || currUser.username || currUser.id) : 'u';
    const uName = currUser ? (currUser.name || currUser.username) : '组员';
    const payload = { fieldKey, userId: uId, userName: uName, groupId: curGid, taskId: curTaskId, classId: effectiveClassId };
    if (value !== null) payload.value = value;
    return payload;
  };

  const isFieldLockedByOther = (fieldKey) => {
    const currUser = (window.app && window.app.authManager) ? window.app.authManager.getCurrentUser() : null;
    const myId = currUser ? String(currUser.studentCode || currUser.username || currUser.id || '') : '';
    const myName = currUser ? String(currUser.name || currUser.username || '') : '';
    const lock = (window.app?.state?.fieldLocks || {})[fieldKey];
    if (!lock) return false;
    const isFresh = (Date.now() - Number(lock.time || lock.timestamp || 0) <= 8500);
    const lockUser = String(lock.userId || '');
    const lockName = String(lock.userName || '');
    return isFresh && lockUser !== myId && (!myName || lockName !== myName);
  };

  const sendLock = (fieldKey, val = null) => {
    const p = getLockPayload(fieldKey, val);
    try {
      if (window.app?.cloudSyncEngine?.bc) {
        const locksObj = { ...(window.app.state.fieldLocks || {}) };
        locksObj[fieldKey] = { userId: p.userId, userName: p.userName, time: Date.now(), value: val };
        window.app.cloudSyncEngine.bc.postMessage({ snapshot: { locks: locksObj } });
      }
    } catch (e) {}

    fetch(`sync.php?action=lock_field&groupId=${encodeURIComponent(p.groupId)}&taskId=${encodeURIComponent(p.taskId)}&classId=${encodeURIComponent(p.classId || 'class_101')}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p)
    }).catch(() => {});
  };

  const sendUnlock = (fieldKey, val = null) => {
    const p = getLockPayload(fieldKey, val);
    try {
      if (window.app?.cloudSyncEngine?.bc) {
        const locksObj = { ...(window.app.state.fieldLocks || {}) };
        delete locksObj[fieldKey];
        window.app.cloudSyncEngine.bc.postMessage({ snapshot: { locks: locksObj } });
      }
    } catch (e) {}

    fetch(`sync.php?action=unlock_field&groupId=${encodeURIComponent(p.groupId)}&taskId=${encodeURIComponent(p.taskId)}&classId=${encodeURIComponent(p.classId || 'class_101')}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p)
    }).catch(() => {});
  };

  const topicInput = canvas.querySelector('#contract-topic-input');
  if (topicInput && !isContractLocked) {
    let topicTimer = null;
    let idleTimer = null;
    let heartbeatTimer = null;

    const flushTopic = () => {
      s1.mergedTitle = topicInput.value;
      if (window.app) {
        window.app.syncStage1();
        if (window.app.cloudSyncEngine) window.app.cloudSyncEngine.pushSnapshot();
      }
    };

    const startHeartbeat = () => {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      heartbeatTimer = setInterval(() => {
        if (document.activeElement === topicInput && !isFieldLockedByOther('topic_title')) {
          sendLock('topic_title', topicInput.value);
        } else {
          clearInterval(heartbeatTimer);
        }
      }, 2000);
    };

    const resetIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        // 8秒静止发呆交接：强制先入库保存，再安全释放锁
        flushTopic();
        sendUnlock('topic_title', topicInput.value);
        if (heartbeatTimer) clearInterval(heartbeatTimer);
      }, 8000);
    };

    topicInput.addEventListener('focus', (e) => {
      if (isFieldLockedByOther('topic_title')) {
        topicInput.blur();
        return;
      }
      sendLock('topic_title', topicInput.value);
      startHeartbeat();
      resetIdleTimer();
    });

    topicInput.addEventListener('compositionstart', () => {
      topicInput._isComposing = true;
      resetIdleTimer();
    });

    topicInput.addEventListener('compositionupdate', () => {
      resetIdleTimer();
    });

    topicInput.addEventListener('compositionend', (e) => {
      topicInput._isComposing = false;
      s1.mergedTitle = topicInput.value;
      sendLock('topic_title', topicInput.value);
      resetIdleTimer();
      if (topicTimer) clearTimeout(topicTimer);
      topicTimer = setTimeout(flushTopic, 300);
    });

    topicInput.addEventListener('input', (e) => {
      if (isFieldLockedByOther('topic_title')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      s1.mergedTitle = e.target.value;
      if (!topicInput._isComposing) {
        sendLock('topic_title', e.target.value);
      }
      resetIdleTimer();
      if (topicTimer) clearTimeout(topicTimer);
      topicTimer = setTimeout(flushTopic, 300);
    });

    topicInput.addEventListener('change', flushTopic);

    topicInput.addEventListener('blur', () => {
      if (idleTimer) clearTimeout(idleTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (topicInput._preemptedByOther || isFieldLockedByOther('topic_title')) {
        topicInput._preemptedByOther = false;
        return;
      }
      flushTopic();
      sendUnlock('topic_title', topicInput.value);
    });

    topicInput.addEventListener('keydown', (e) => {
      if (isFieldLockedByOther('topic_title')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      resetIdleTimer();
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Enter') { topicInput.blur(); }
    });
  }

  canvas.querySelectorAll('.contract-time-input').forEach(input => {
    if (!isContractLocked) {
      const key = input.dataset.key;
      const fieldKey = `time_${key}`;
      input.dataset.lockKey = fieldKey;
      let timeTimer = null;
      let idleTimer = null;
      let heartbeatTimer = null;

      const flushTime = () => {
        const numVal = Number(input.value) || 0;
        if (key && s1.contract.timeAllocations) {
          s1.contract.timeAllocations[key] = numVal;
          if (window.app) {
            window.app.syncStage1();
            const currUser = window.app.authManager ? window.app.authManager.getCurrentUser() : null;
            const effectiveClassId = window.app.state.activeStudentClassId || (currUser?.classId || 'class_101');
            const activeGroupObj = window.app.authManager ? window.app.authManager.getStudentActiveGroup(currUser, effectiveClassId) : null;
            const curGid = activeGroupObj?.id || (currUser?.groupId || 'group_1');
            fetch('sync.php?action=patch_contract_field', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                taskId: window.app.state.activeTaskId || 'task_default',
                groupId: curGid,
                field: 'timeAllocations',
                subKey: key,
                value: numVal
              })
            }).catch(() => {});
          }
        }
      };

      const startHeartbeat = () => {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        heartbeatTimer = setInterval(() => {
          if (document.activeElement === input && !isFieldLockedByOther(fieldKey)) {
            sendLock(fieldKey, Number(input.value) || 0);
          } else {
            clearInterval(heartbeatTimer);
          }
        }, 2000);
      };

      const resetIdleTimer = () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          flushTime();
          sendUnlock(fieldKey, Number(input.value) || 0);
          if (heartbeatTimer) clearInterval(heartbeatTimer);
        }, 8000);
      };

      input.addEventListener('focus', () => {
        if (isFieldLockedByOther(fieldKey)) {
          input.blur();
          return;
        }
        sendLock(fieldKey, Number(input.value) || 0);
        startHeartbeat();
        resetIdleTimer();
      });

      input.addEventListener('input', (e) => {
        if (isFieldLockedByOther(fieldKey)) {
          e.preventDefault();
          e.stopImmediatePropagation();
          return;
        }
        const numVal = Number(e.target.value) || 0;
        if (key && s1.contract.timeAllocations) {
          s1.contract.timeAllocations[key] = numVal;
        }
        sendLock(fieldKey, numVal);
        resetIdleTimer();
        if (timeTimer) clearTimeout(timeTimer);
        timeTimer = setTimeout(flushTime, 300);
      });

      input.addEventListener('change', flushTime);

      input.addEventListener('blur', () => {
        if (idleTimer) clearTimeout(idleTimer);
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        if (input._preemptedByOther || isFieldLockedByOther(fieldKey)) {
          input._preemptedByOther = false;
          return;
        }
        flushTime();
        sendUnlock(fieldKey, Number(input.value) || 0);
      });

      input.addEventListener('keydown', (e) => {
        if (isFieldLockedByOther(fieldKey)) {
          e.preventDefault();
          e.stopImmediatePropagation();
          return;
        }
        resetIdleTimer();
        if (e.isComposing || e.keyCode === 229) return;
        if (e.key === 'Enter') { input.blur(); }
      });
    }
  });

  canvas.querySelectorAll('.task-assignment-input').forEach(input => {
    if (!isContractLocked) {
      const mKey = input.dataset.mkey;
      const fieldKey = `task_${mKey}`;
      input.dataset.lockKey = fieldKey;
      let taskTimer = null;
      let idleTimer = null;
      let heartbeatTimer = null;

      const flushTask = () => {
        const val = input.value;
        if (!s1.contract.taskAssignments) s1.contract.taskAssignments = {};
        if (mKey) s1.contract.taskAssignments[mKey] = val;
        if (window.app) {
          window.app.syncStage1();
          const currUser = window.app.authManager ? window.app.authManager.getCurrentUser() : null;
          const effectiveClassId = window.app.state.activeStudentClassId || (currUser?.classId || 'class_101');
          const activeGroupObj = window.app.authManager ? window.app.authManager.getStudentActiveGroup(currUser, effectiveClassId) : null;
          const curGid = activeGroupObj?.id || (currUser?.groupId || 'group_1');
          fetch('sync.php?action=patch_contract_field', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              taskId: window.app.state.activeTaskId || 'task_default',
              groupId: curGid,
              field: 'taskAssignments',
              subKey: mKey,
              value: val
            })
          }).catch(() => {});
        }
      };

      const startHeartbeat = () => {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        heartbeatTimer = setInterval(() => {
          if (document.activeElement === input && !isFieldLockedByOther(fieldKey)) {
            sendLock(fieldKey, input.value);
          } else {
            clearInterval(heartbeatTimer);
          }
        }, 2000);
      };

      const resetIdleTimer = () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          flushTask();
          sendUnlock(fieldKey, input.value);
          if (heartbeatTimer) clearInterval(heartbeatTimer);
        }, 8000);
      };

      input.addEventListener('focus', () => {
        if (isFieldLockedByOther(fieldKey)) {
          input.blur();
          return;
        }
        sendLock(fieldKey, input.value);
        startHeartbeat();
        resetIdleTimer();
      });

      input.addEventListener('compositionstart', () => {
        input._isComposing = true;
        resetIdleTimer();
      });

      input.addEventListener('compositionupdate', () => {
        resetIdleTimer();
      });

      input.addEventListener('compositionend', (e) => {
        input._isComposing = false;
        if (!s1.contract.taskAssignments) s1.contract.taskAssignments = {};
        if (mKey) s1.contract.taskAssignments[mKey] = input.value;
        sendLock(fieldKey, input.value);
        resetIdleTimer();
        if (taskTimer) clearTimeout(taskTimer);
        taskTimer = setTimeout(flushTask, 300);
      });

      input.addEventListener('input', (e) => {
        if (isFieldLockedByOther(fieldKey)) {
          e.preventDefault();
          e.stopImmediatePropagation();
          return;
        }
        const val = e.target.value;
        if (!s1.contract.taskAssignments) s1.contract.taskAssignments = {};
        if (mKey) s1.contract.taskAssignments[mKey] = val;
        if (!input._isComposing) {
          sendLock(fieldKey, val);
        }
        resetIdleTimer();
        if (taskTimer) clearTimeout(taskTimer);
        taskTimer = setTimeout(flushTask, 300);
      });

      input.addEventListener('change', flushTask);

      input.addEventListener('blur', () => {
        if (idleTimer) clearTimeout(idleTimer);
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        if (input._preemptedByOther || isFieldLockedByOther(fieldKey)) {
          input._preemptedByOther = false;
          return;
        }
        flushTask();
        sendUnlock(fieldKey, input.value);
      });

      input.addEventListener('keydown', (e) => {
        if (isFieldLockedByOther(fieldKey)) {
          e.preventDefault();
          e.stopImmediatePropagation();
          return;
        }
        resetIdleTimer();
        if (e.isComposing || e.keyCode === 229) return;
        if (e.key === 'Enter') { input.blur(); }
      });
    }
  });

  if (!isContractLocked) {
    canvas.querySelectorAll('.vote-btn:not([disabled])').forEach(btn => {
      btn.addEventListener('click', () => handlers.onVote(btn.dataset.id));
    });
    const btnGenDraft = canvas.querySelector('#btn-generate-contract-draft');
    if (btnGenDraft) {
      btnGenDraft.addEventListener('click', () => {
        if (handlers.onAiGenerateContract) handlers.onAiGenerateContract();
      });
    }

    const btnConfirm = canvas.querySelector('#btn-confirm-contract');
    if (btnConfirm) {
      btnConfirm.addEventListener('click', () => {
        s1.contract._lastSignTime = Date.now();
        const currUser = (window.app && window.app.authManager) ? window.app.authManager.getCurrentUser() : null;
        const myCode = state.currentUser || (currUser ? currUser.studentCode : 'A');
        const effectiveClassId = window.app.state.activeStudentClassId || (currUser?.classId || 'class_101');
        const activeGroupObj = window.app.authManager ? window.app.authManager.getStudentActiveGroup(currUser, effectiveClassId) : null;
        const curGid = activeGroupObj?.id || (currUser?.groupId || 'group_1');
        
        fetch('sync.php?action=patch_contract_field', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskId: state.activeTaskId || 'task_default',
            groupId: curGid,
            field: 'sign_member',
            subKey: myCode,
            value: true
          })
        }).catch(() => {});

        handlers.onConfirmContract();
      });
    }

    const btnGotoS2 = canvas.querySelector('#btn-goto-stage2');
    if (btnGotoS2) {
      btnGotoS2.addEventListener('click', () => {
        if (window.app && typeof window.app.switchStage === 'function') {
          window.app.switchStage('stage2', true);
        }
      });
    }
  }

  // 🛡️ 恢复之前正在打字的输入框焦点与光标，平滑无感
  if (activeKey) {
    const restoreInput = canvas.querySelector(`#${activeKey}, [data-key="${activeKey}"], [data-mkey="${activeKey}"]`);
    if (restoreInput) {
      restoreInput.value = activeVal;
      restoreInput.focus();
      try { restoreInput.setSelectionRange(activeCursor, activeCursor); } catch (e) {}
    }
  }

  renderPresencePills('stage1-canvas', state);
}

function renderStage2Canvas(canvas, state, handlers) {
  const s2 = state.stage2;
  // 🧹 自动清理旧版本残留的预设提纲模版，确保初始纯净 0 字
  if (s2.unifiedContent && (s2.unifiedContent.includes('一、研究背景与意义') || s2.unifiedContent.includes('请在此处撰写正文'))) {
    s2.unifiedContent = '';
  }
  const actionPlan = s2.actionPlan;
  const isStage2MeetingLocked = state.currentStage === 'stage3' || state.isFinalSubmitted;
  const allTasks = (window.app && window.app.authManager) ? window.app.authManager.getTasks() : [];
  const currentTask = allTasks.find(t => t.id === state.activeTaskId);
  const isTaskDeadlineExpired = isTaskExpired(currentTask);
  const isEditorReadonly = state.isFinalSubmitted || isTaskDeadlineExpired;
  const membersList = Object.values(state.members || {});
  const plainTextLen = (s2.unifiedContent || '').replace(/<[^>]*>/g, '').trim().length;

  const currUser = (window.app && window.app.authManager) ? window.app.authManager.getCurrentUser() : null;
  const userClassId = state.activeStudentClassId || (currUser ? currUser.classId : null) || 'class_101';
  const activeGroupObj = (window.app && window.app.authManager) ? window.app.authManager.getStudentActiveGroup(currUser, userClassId) : null;
  const userGroupId = activeGroupObj?.id || (window.app?.cloudSyncEngine?.groupId) || (currUser?.groupId) || 'group_1';
  let activeTaskId = state.activeTaskId || (window.app?.cloudSyncEngine?.taskId) || (`task_${userClassId}_default`);
  if (!activeTaskId || activeTaskId === 'task_default') activeTaskId = `task_${userClassId}_default`;
  const availablePapers = (window.app && window.app.authManager) ? window.app.authManager.getReferencePapers(userGroupId, userClassId, activeTaskId) : [];
  const paperBtnLabel = availablePapers.length > 0 ? `📚 查阅参考范文 (${availablePapers.length}篇)` : '📚 查阅参考范文库';

  const confirmedDraftMap = s2.confirmedMembers || {};
  const confirmedDraftCount = membersList.filter(m => confirmedDraftMap[m.id] || confirmedDraftMap[m.studentCode]).length;
  const totalCount = membersList.length || 3;
  const currUserCode = state.currentUser || (currUser ? currUser.studentCode : 'A');
  const isUserDraftConfirmed = !!(confirmedDraftMap[currUserCode] || (currUser && confirmedDraftMap[currUser.id]));
  const isDraftFullyConfirmed = s2.isDraftConfirmed || (confirmedDraftCount >= totalCount && totalCount > 0);

  // 🛡️ 极致单例保护：若富文本编辑器已经在当前画布上活跃运行，严禁 innerHTML 销毁重绘！
  const existingEditorEl = canvas.querySelector('#stage2-word-editor.ql-container');
  if (existingEditorEl) {
    renderPresencePills('stage2-word-editor', state);
    const draftCountBadge = canvas.querySelector('#stage2-draft-count-text');
    if (draftCountBadge) {
      draftCountBadge.innerText = isDraftFullyConfirmed ? '✅ 全员已确认完成初稿' : `${confirmedDraftCount}/${totalCount} 人已确认`;
      draftCountBadge.style.color = isDraftFullyConfirmed ? '#059669' : '#2563eb';
    }
    const btnDraft = canvas.querySelector('#btn-confirm-stage2-draft');
    if (btnDraft) {
      btnDraft.disabled = isUserDraftConfirmed || isEditorReadonly;
      btnDraft.innerText = isUserDraftConfirmed ? '✅ 您已确认完成初稿' : '✍️ 确认完成正文初稿';
      btnDraft.style.background = isUserDraftConfirmed ? '#f1f5f9' : 'linear-gradient(135deg, #059669, #047857)';
    }
    return;
  }

  canvas.innerHTML = `
    ${isTaskDeadlineExpired ? `
      <div style="background:#fef2f2; border:1.5px solid #fca5a5; border-radius:8px; padding:6px 14px; margin-bottom:12px; font-size:12.5px; color:#991b1b; font-weight:600; display:flex; justify-content:space-between; align-items:center; gap:12px; box-shadow:0 2px 6px rgba(239,68,68,0.08); height:38px; box-sizing:border-box; flex-shrink:0;">
        <div style="display:flex; align-items:center; gap:8px; min-width:0; flex:1; overflow:hidden; white-space:nowrap; text-overflow:ellipsis;">
          <span style="font-size:15px; flex-shrink:0;">🔒</span>
          <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"><b>任务已截止锁定：</b> 本任务已于 <b>${currentTask?.deadline || '截止时间'}</b> 截止，写作正文已自动转为<b>【只读模式】</b>。如需继续编辑请联系教师延长时间。</span>
        </div>
        <span style="font-size:11.5px; color:#ffffff; background:#dc2626; padding:2px 8px; border-radius:4px; font-weight:800; flex-shrink:0; letter-spacing:0.5px;">已截止</span>
      </div>
    ` : ''}

    ${isStage2MeetingLocked ? `
      <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:10px 14px; margin-bottom:10px; font-size:13px; color:#1d4ed8; font-weight:700; display:flex; justify-content:space-between; align-items:center; flex-shrink:0;">
        <span>🔒 阶段二【半程编辑会议】打分与修正清单已完成并锁定 ${isEditorReadonly ? '· 全盘终稿已提交只读查阅' : '· 可随时回看'}</span>
        <span style="font-size:11.5px; color:#1e40af; background:#ffffff; border:1px solid #bfdbfe; padding:4px 8px; border-radius:4px;">归档只读</span>
      </div>
    ` : ''}

    <div class="card" style="height:100%; display:flex; flex-direction:column; padding:16px 18px 24px 18px; box-sizing:border-box; overflow-y:auto;">
      <div class="card-title" style="margin-bottom:10px; display:flex; justify-content:space-between; align-items:center; flex-shrink:0;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:15px; font-weight:800; color:#0f172a;">📝 学术协作富文本编辑器 (对标 Word 学术论文规范)</span>
          <span style="font-size:12px; color:#2563eb; background:#eff6ff; padding:2px 8px; border-radius:10px; border:1px solid #bfdbfe;">字数: <b id="stage2-word-count-num">${plainTextLen}</b> 字</span>
        </div>
        <div style="display:flex; gap:8px;">
          <button id="btn-show-case" style="background:#eff6ff; border:1px solid #bfdbfe; color:#1d4ed8; padding:6px 12px; border-radius:6px; font-size:12px; cursor:pointer; font-weight:700;">${paperBtnLabel}</button>
          <button id="btn-trigger-meeting" ${isStage2MeetingLocked ? 'disabled' : ''} style="background:${isStage2MeetingLocked ? '#f1f5f9' : 'linear-gradient(135deg, #2563eb, #1d4ed8)'}; border:${isStage2MeetingLocked ? '1px solid #cbd5e1' : 'none'}; color:${isStage2MeetingLocked ? '#94a3b8' : 'white'}; padding:6px 14px; border-radius:6px; font-size:12px; cursor:${isStage2MeetingLocked ? 'not-allowed' : 'pointer'}; font-weight:700; box-shadow:${isStage2MeetingLocked ? 'none' : '0 3px 10px rgba(37,99,235,0.25)'};">
            ${isStage2MeetingLocked ? '🔒 编辑会议已结束' : '📢 发起【编辑会议】'}
          </button>
        </div>
      </div>

      ${actionPlan && actionPlan.isGenerated ? `
        <div id="stage2-action-plan-card" style="background:#ecfdf5; border:1px solid #a7f3d0; border-radius:10px; padding:10px 16px; margin-bottom:10px; transition:all 0.2s ease; flex-shrink:0; box-shadow:0 2px 6px rgba(5,150,105,0.06);">
          <div style="display:flex; justify-content:space-between; align-items:center; cursor:pointer;" id="btn-toggle-action-plan">
            <div style="font-size:13px; font-weight:800; color:#059669; display:flex; align-items:center; gap:6px;">
              <span>📋 【半程修正清单】(审稿专家下发 3 项修改要求)</span>
              <span style="font-size:11px; background:#d1fae5; color:#065f46; padding:1px 8px; border-radius:10px; font-weight:700;">已生成</span>
            </div>
            <span id="icon-toggle-action-plan" style="font-size:11.5px; color:#059669; font-weight:700;">▲ 收起</span>
          </div>
          <div id="body-action-plan-items" style="font-size:12.5px; color:#1e293b; display:flex; flex-direction:column; gap:8px; margin-top:8px;">
            ${actionPlan.items.map((item, idx) => {
              // 针对第 2 项如果含有多子项（理论/假设/方法），进行结构化美化渲染
              let formattedItem = escapeHtml(item);
              formattedItem = formattedItem
                .replace(/(?:•\s*|【)?理论与综述层(?:】)?[:：]?/g, '<span style="display:inline-block; background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe; padding:1px 6px; border-radius:4px; font-weight:700; font-size:11.5px; margin-right:4px;">📚 理论与综述层</span>')
                .replace(/(?:•\s*|【)?假设与(?:问题|机制)层(?:】)?[:：]?/g, '<span style="display:inline-block; background:#faf5ff; color:#7c3aed; border:1px solid #e9d5ff; padding:1px 6px; border-radius:4px; font-weight:700; font-size:11.5px; margin-right:4px;">🔗 假设与机制层</span>')
                .replace(/(?:•\s*|【)?方法与量表层(?:】)?[:：]?/g, '<span style="display:inline-block; background:#ecfdf5; color:#059669; border:1px solid #a7f3d0; padding:1px 6px; border-radius:4px; font-weight:700; font-size:11.5px; margin-right:4px;">📐 方法与量表层</span>');

              return `
                <div style="line-height:1.6; background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:8px 12px; box-shadow:0 1px 3px rgba(0,0,0,0.02);">
                  <b style="color:#0f172a; margin-right:4px;">${idx + 1}.</b> ${formattedItem}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      ` : (() => {
        const subs = s2.meetingSubmissions || {};
        const subCount = Object.keys(subs).length;
        const isSelfDone = subCount >= totalCount;
        return `
          <div id="stage2-action-plan-card" style="background:#f8fafc; border:1px dashed #cbd5e1; border-radius:8px; padding:8px 14px; margin-bottom:8px; flex-shrink:0;">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
              <div style="font-size:12px; font-weight:700; color:#64748b; display:flex; align-items:center; gap:6px;">
                <span>📋 【半程修正清单】</span>
                <span style="font-size:10.5px; background:${isSelfDone ? '#ecfdf5' : subCount > 0 ? '#dbeafe' : '#e2e8f0'}; color:${isSelfDone ? '#059669' : subCount > 0 ? '#1d4ed8' : '#475569'}; padding:1px 8px; border-radius:10px; font-weight:700;">
                  ${isSelfDone ? `待解锁: 组内针对自查分歧研讨对齐中 (审稿专家质检后生成)` : (subCount > 0 ? `待解锁 (全员自查进度 ${subCount}/${totalCount}人)` : `待解锁 (0/${totalCount}人)`)}
                </span>
              </div>
              <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:11px; color:#94a3b8;">（全员自查并完成分歧研讨后，由审稿专家质检下发）</span>
              </div>
            </div>
          </div>
        `;
      })()}

      <!-- 全员确认完成初稿状态条 -->
      <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:8px 14px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; box-shadow:0 1px 3px rgba(15,23,42,0.04); flex-wrap:wrap; gap:8px;">
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <span style="font-size:12.5px; font-weight:800; color:#0f172a;">✍️ 正文初稿确认进度:</span>
          <span style="font-size:11.5px; font-weight:800; color:${isDraftFullyConfirmed ? '#059669' : '#2563eb'}; background:${isDraftFullyConfirmed ? '#d1fae5' : '#eff6ff'}; padding:2px 10px; border-radius:12px; border:1px solid ${isDraftFullyConfirmed ? '#a7f3d0' : '#bfdbfe'};">
            ${isDraftFullyConfirmed ? '✅ 全员已确认完成初稿' : `${confirmedDraftCount}/${totalCount} 人已确认`}
          </span>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            ${membersList.map(m => {
              const isConf = confirmedDraftMap[m.id] || confirmedDraftMap[m.studentCode];
              return `<span style="font-size:11px; padding:1px 8px; border-radius:10px; font-weight:700; background:${isConf ? '#ecfdf5' : '#f1f5f9'}; color:${isConf ? '#059669' : '#94a3b8'}; border:1px solid ${isConf ? '#a7f3d0' : '#e2e8f0'};">
                ${isConf ? '✓' : '○'} ${m.name}
              </span>`;
            }).join('')}
          </div>
        </div>
        <div>
          <button id="btn-confirm-stage2-draft" ${isUserDraftConfirmed || isEditorReadonly ? 'disabled' : ''} style="background:${isUserDraftConfirmed ? '#f1f5f9' : 'linear-gradient(135deg, #059669, #047857)'}; border:${isUserDraftConfirmed ? '1px solid #cbd5e1' : 'none'}; color:${isUserDraftConfirmed ? '#059669' : 'white'}; padding:6px 14px; border-radius:6px; font-size:12px; font-weight:700; cursor:${isUserDraftConfirmed || isEditorReadonly ? 'default' : 'pointer'}; box-shadow:${isUserDraftConfirmed ? 'none' : '0 2px 8px rgba(5,150,105,0.25)'};">
            ${isUserDraftConfirmed ? '✅ 您已确认完成初稿' : '✍️ 确认完成正文初稿'}
          </button>
        </div>
      </div>

      <!-- Word-grade Academic Collaborative Etherpad OT Engine Body -->
      <div style="flex:1; min-height:480px; height:calc(100vh - 380px); display:flex; flex-direction:column; margin-bottom:12px;">
        ${(() => {
          const padName = `jizhi_${activeTaskId}_${userGroupId}`;
          const currUserName = (currUser && (currUser.name || currUser.username)) || '组员';
          const currUserColor = (state.members && state.members[currUserCode]?.color) || '#2563eb';
          const padUrl = `/p/${padName}?userName=${encodeURIComponent(currUserName)}&userColor=${encodeURIComponent(currUserColor)}&showChat=false&showLineNumbers=true&showControls=true`;
          
          return `
            <div class="word-editor-container" style="display:flex; flex-direction:column; height:100%; min-height:480px; border-radius:10px; overflow:hidden; border:1px solid #cbd5e1; box-shadow:0 4px 16px rgba(15,23,42,0.06); background:#ffffff;">
              <div id="ep-loading-helper-s2" style="display:flex; align-items:center; justify-content:space-between; background:#f8fafc; border-bottom:1px solid #e2e8f0; padding:6px 14px; font-size:12px; color:#475569;">
                <div style="display:flex; align-items:center; gap:8px;">
                  <span id="ep-status-dot-s2" style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#10b981;"></span>
                  <span id="ep-status-text-s2" style="font-weight:600;">Etherpad 实时协同引擎已连接 (毫秒级 OT 协同)</span>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                  <a href="${padUrl}" target="_blank" style="background:#ffffff; color:#334155; border:1px solid #cbd5e1; padding:3px 10px; border-radius:6px; font-size:11.5px; text-decoration:none; font-weight:600; display:inline-flex; align-items:center; gap:4px; box-shadow:0 1px 2px rgba(0,0,0,0.04);">↗️ 独立新窗口打开</a>
                  <button onclick="const f=document.getElementById('stage2-etherpad-frame'); if(f) { f.src=f.src; document.getElementById('ep-status-text-s2').innerText='正在重新连接...'; }" style="background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe; padding:3px 10px; border-radius:6px; font-size:11.5px; cursor:pointer; font-weight:700;">🔄 刷新文档连接</button>
                </div>
              </div>
              <div style="flex:1; min-height:0; position:relative; background:#ffffff;">
                <iframe id="stage2-etherpad-frame" src="${padUrl}" style="width:100%; height:100%; border:none; display:block; background:#ffffff;" allow="clipboard-read; clipboard-write; fullscreen" onload="const el=document.getElementById('ep-status-text-s2'); if(el) el.innerText='Etherpad 实时协同引擎已就绪 (毫秒级 OT 协同)';"></iframe>
              </div>
            </div>
          `;
        })()}
      </div>

      <div style="background:#ffffff; padding:10px 16px; border-radius:8px; border:1px solid #cbd5e1; flex-shrink:0; display:flex; flex-direction:column; gap:6px; box-shadow:0 1px 3px rgba(15,23,42,0.04); margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:12px; font-weight:800; color:#1e293b;">📊 团队协作贡献度占比 (SSRL 群体过程感知):</span>
          <div class="contrib-labels" id="stage2-contrib-labels" style="display:flex; font-size:11.5px; font-weight:700; color:#475569; gap:12px; white-space:nowrap;">
            ${(() => {
              const contribs = s2.memberContributions || {};
              let rawTotal = 0;
              membersList.forEach(m => { rawTotal += (contribs[m.id] || 0) + (contribs[m.studentCode] || 0); });
              return membersList.map((m) => {
                const rawVal = (contribs[m.id] || 0) + (contribs[m.studentCode] || 0);
                const pct = rawTotal > 0 ? Math.round((rawVal / rawTotal) * 100) : 0;
                return `<span style="color:${rawVal > 0 ? (m.color || '#2563eb') : '#94a3b8'}; font-weight:700;">● ${m.name}: ${pct}%</span>`;
              }).join('');
            })()}
          </div>
        </div>
        <div class="contrib-bars" id="stage2-contrib-bars" style="width:100%; height:10px; border-radius:5px; display:flex; overflow:hidden; background:#e2e8f0;">
          ${(() => {
            const contribs = s2.memberContributions || {};
            let rawTotal = 0;
            membersList.forEach(m => { rawTotal += (contribs[m.id] || 0) + (contribs[m.studentCode] || 0); });
            if (rawTotal === 0) {
              return `<div style="width:100%; height:10px; background:#f8fafc; border-radius:5px; display:flex; align-items:center; justify-content:center; font-size:10px; color:#94a3b8; font-weight:600;">⏳ 暂无协作投入 (组员在 Etherpad 中撰写、修改正文或研讨后将平滑累计真实贡献)</div>`;
            }
            return membersList.map((m) => {
              const rawVal = (contribs[m.id] || 0) + (contribs[m.studentCode] || 0);
              const pct = rawTotal > 0 ? Math.round((rawVal / rawTotal) * 100) : 0;
              return `<div class="contrib-segment" style="width:${pct}%; background:${m.color || '#2563eb'}; transition:width 0.8s ease-in-out;" title="${m.name}: ${pct}% (基于正文撰写与修改累计工作量)"></div>`;
            }).join('');
          })()}
        </div>
      </div>
    </div>
  `;

  attachWordEditorEvents(canvas, 'stage2-word-editor', isEditorReadonly, (html) => handlers.onUnifiedContentChange(html), (nodeIdx, sec, charOffset) => {
    if (handlers.onPresenceChange) handlers.onPresenceChange(nodeIdx, sec, charOffset);
  });
  renderRemoteCursors('stage2-word-editor', state);

  const btnTogglePlan = canvas.querySelector('#btn-toggle-action-plan');
  if (btnTogglePlan) {
    btnTogglePlan.addEventListener('click', () => {
      const bodyItems = canvas.querySelector('#body-action-plan-items');
      const iconToggle = canvas.querySelector('#icon-toggle-action-plan');
      if (bodyItems) {
        const isHidden = bodyItems.style.display === 'none';
        bodyItems.style.display = isHidden ? 'flex' : 'none';
        if (iconToggle) iconToggle.innerText = isHidden ? '▲ 收起' : '▼ 展开';
      }
    });
  }

  canvas.querySelector('#btn-show-case').addEventListener('click', () => handlers.onOpenCaseModal());
  if (!isStage2MeetingLocked) {
    canvas.querySelector('#btn-trigger-meeting').addEventListener('click', () => handlers.onOpenMeetingModal());
  }

  const btnConfirmDraft = canvas.querySelector('#btn-confirm-stage2-draft');
  if (btnConfirmDraft && !isUserDraftConfirmed && !isEditorReadonly) {
    btnConfirmDraft.addEventListener('click', () => {
      handlers.onConfirmStage2Draft();
    });
  }

  // 🚀 实时 Etherpad 真实字数提取与贡献比动态平滑更新
  if (window._stage2WordCountTimer) clearTimeout(window._stage2WordCountTimer);
  const padName = `jizhi_${activeTaskId}_${userGroupId}`;
  
  const updateContribDom = () => {
    const labelsEl = document.getElementById('stage2-contrib-labels');
    const barsEl = document.getElementById('stage2-contrib-bars');
    if (!labelsEl || !barsEl) return;
    
    const contribs = s2.memberContributions || {};
    let rawTotal = 0;
    membersList.forEach(m => { rawTotal += (contribs[m.id] || 0) + (contribs[m.studentCode] || 0); });
    
    labelsEl.innerHTML = membersList.map((m) => {
      const rawVal = (contribs[m.id] || 0) + (contribs[m.studentCode] || 0);
      const pct = rawTotal > 0 ? Math.round((rawVal / rawTotal) * 100) : 0;
      return `<span style="color:${rawVal > 0 ? (m.color || '#2563eb') : '#94a3b8'}; font-weight:700;">● ${m.name}: ${pct}%</span>`;
    }).join('');

    if (rawTotal === 0) {
      barsEl.innerHTML = `<div style="width:100%; height:10px; background:#f8fafc; border-radius:5px; display:flex; align-items:center; justify-content:center; font-size:10px; color:#94a3b8; font-weight:600;">⏳ 暂无协作投入 (组员在 Etherpad 中撰写、修改正文或研讨后将平滑累计真实贡献)</div>`;
    } else {
      barsEl.innerHTML = membersList.map((m) => {
        const rawVal = (contribs[m.id] || 0) + (contribs[m.studentCode] || 0);
        const pct = rawTotal > 0 ? Math.round((rawVal / rawTotal) * 100) : 0;
        return `<div class="contrib-segment" style="width:${pct}%; background:${m.color || '#2563eb'}; transition:width 0.8s ease-in-out;" title="${m.name}: ${pct}% (基于正文撰写与修改累计工作量)"></div>`;
      }).join('');
    }
  };

  let _padContentDebounceTimer = null;
  const syncPadMetrics = async () => {
    try {
      // 🚀 极轻量纯文本提取：耗时 < 0.1ms，体积 1KB，彻底杜绝服务器 Node.js CPU 波动
      const txtRes = await fetch(`/p/${padName}/export/txt`);
      if (txtRes.ok) {
        const cleanTxt = (await txtRes.text()).replace(/\r\n/g, '\n').trim();
        const wordCount = cleanTxt.length;
        
        // 实时更新字数角标
        const countBadge = document.getElementById('stage2-word-count-num');
        if (countBadge) countBadge.innerText = String(wordCount);

        const prevContent = state.stage2.unifiedContent || '';
        const hasContentChanged = (cleanTxt && cleanTxt !== prevContent);

        if (hasContentChanged) {
          state.stage2.unifiedContent = cleanTxt;
          if (_padContentDebounceTimer) clearTimeout(_padContentDebounceTimer);
          _padContentDebounceTimer = setTimeout(() => {
            if (window.app && typeof window.app.syncStage2 === 'function') {
              window.app.syncStage2();
            }
            if (window.app && typeof window.app.checkAgentTriggersOnContent === 'function') {
              window.app.checkAgentTriggersOnContent(cleanTxt);
            }
          }, 1500);
        }

        // 动态贡献度计算（仅当本人正在打字时向上报增量 delta）
        const prevLen = state.stage2._prevKnownLen !== undefined ? state.stage2._prevKnownLen : wordCount;
        state.stage2._prevKnownLen = wordCount;

        const isInputFocused = document.activeElement && document.activeElement.tagName === 'IFRAME';
        if (wordCount !== prevLen && isInputFocused) {
          const delta = Math.abs(wordCount - prevLen);
          if (delta > 0) {
            fetch(`sync.php?action=report_member_contrib&groupId=${encodeURIComponent(userGroupId)}&taskId=${encodeURIComponent(activeTaskId)}&classId=${encodeURIComponent(userClassId)}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                taskId: activeTaskId,
                classId: userClassId,
                groupId: userGroupId,
                userCode: currUserCode,
                delta: delta
              })
            }).then(r => r.json()).then(res => {
              if (res.success && res.contribs) {
                state.stage2.memberContributions = res.contribs;
                updateContribDom();
              }
            }).catch(() => {});
          }
        } else {
          updateContribDom();
        }
      }
    } catch (e) {}
  };

  syncPadMetrics();
  if (window._stage2WordCountTimer) clearTimeout(window._stage2WordCountTimer);
  const getPadMetricInterval = () => (document.hidden ? 60000 : 15000);
  const scheduleNextPadMetric = () => {
    window._stage2WordCountTimer = setTimeout(() => {
      syncPadMetrics().finally(scheduleNextPadMetric);
    }, getPadMetricInterval());
  };
  scheduleNextPadMetric();
}

function renderStage3Canvas(canvas, state, handlers) {
  const s3 = state.stage3;
  const activeTab = s3.activeTab || 'defense';
  const membersList = Object.values(state.members || {});
  const totalCount = membersList.length || 3;
  const plainTextLen = (state.stage2.unifiedContent || '').replace(/<[^>]*>/g, '').trim().length;

  const currUser = (window.app && window.app.authManager) ? window.app.authManager.getCurrentUser() : null;
  const currUserCode = state.currentUser || (currUser ? currUser.studentCode : 'A');
  const confirmedRevMap = s3.confirmedMembers || {};
  const confirmedRevCount = membersList.filter(m => confirmedRevMap[m.id] || confirmedRevMap[m.studentCode]).length;
  const isUserRevisionConfirmed = !!(confirmedRevMap[currUserCode] || (currUser && confirmedRevMap[currUser.id]));
  const isRevisionFullyConfirmed = confirmedRevCount >= totalCount && totalCount > 0;
  const allTasks = (window.app && window.app.authManager) ? window.app.authManager.getTasks() : [];
  const currentTask = allTasks.find(t => t.id === state.activeTaskId);
  const isTaskDeadlineExpired = isTaskExpired(currentTask);
  const isFinalSubmitted = state.isFinalSubmitted || isTaskDeadlineExpired;

  canvas.innerHTML = `
    <div style="height:100%; display:flex; flex-direction:column; gap:12px;">
      ${isTaskDeadlineExpired ? `
        <div style="background:#fef2f2; border:1.5px solid #fca5a5; border-radius:8px; padding:6px 14px; margin-bottom:4px; font-size:12.5px; color:#991b1b; font-weight:600; display:flex; justify-content:space-between; align-items:center; gap:12px; box-shadow:0 2px 6px rgba(239,68,68,0.08); height:38px; box-sizing:border-box; flex-shrink:0;">
          <div style="display:flex; align-items:center; gap:8px; min-width:0; flex:1; overflow:hidden; white-space:nowrap; text-overflow:ellipsis;">
            <span style="font-size:15px; flex-shrink:0;">🔒</span>
            <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"><b>任务已截止锁定：</b> 本任务已于 <b>${currentTask?.deadline || '截止时间'}</b> 截止，阶段三【答辩擂台】已自动转为<b>【只读查阅模式】</b>。如需修改请联系教师延长时间。</span>
          </div>
          <span style="font-size:11.5px; color:#ffffff; background:#dc2626; padding:2px 8px; border-radius:4px; font-weight:800; flex-shrink:0; letter-spacing:0.5px;">已截止</span>
        </div>
      ` : (state.isFinalSubmitted ? `
        <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:12px; padding:14px 18px; display:flex; justify-content:space-between; align-items:center; flex-shrink:0; box-shadow:0 2px 8px rgba(37,99,235,0.08);">
          <div>
            <div style="font-size:14px; font-weight:800; color:#1e40af; display:flex; align-items:center; gap:8px;">
              <span>🔒 本组论文终稿与评估报告已成功归档提交至教师端！</span>
            </div>
            <div style="font-size:12px; color:#475569; margin-top:3px;">请组内每位成员点击右侧按钮进入【课程协作体验与 SSRL 效果评估问卷】填写界面。</div>
          </div>
          <button id="btn-open-survey-page" style="background:linear-gradient(135deg, #2563eb, #1d4ed8); border:none; color:white; padding:8px 18px; border-radius:8px; font-weight:700; font-size:13px; cursor:pointer; box-shadow:0 3px 10px rgba(37,99,235,0.3);">
            📋 打开问卷填写界面 ↗
          </button>
        </div>
      ` : '')}

      <div style="display:flex; justify-content:space-between; align-items:center; background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:8px 12px; flex-shrink:0; box-shadow:0 1px 3px rgba(15,23,42,0.04); flex-wrap:wrap; gap:8px;">
        <div style="gap:10px; display:flex; flex-wrap:wrap;">
          <button id="tab-btn-defense" style="background:${activeTab === 'defense' ? 'linear-gradient(135deg, #2563eb, #1d4ed8)' : '#f1f5f9'}; border:none; color:${activeTab === 'defense' ? 'white' : '#475569'}; padding:8px 16px; border-radius:8px; font-weight:700; font-size:13px; cursor:pointer;">
            🎓 答辩委员会质询与中间委员引导面板
          </button>
          <button id="tab-btn-editor" style="background:${activeTab === 'editor' ? 'linear-gradient(135deg, #059669, #047857)' : '#f1f5f9'}; border:none; color:${activeTab === 'editor' ? 'white' : '#475569'}; padding:8px 16px; border-radius:8px; font-weight:700; font-size:13px; cursor:pointer;">
            📝 修改论文终稿 (依据答辩意见完善正文)
          </button>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          <button id="btn-confirm-stage3-revision" ${isUserRevisionConfirmed || isFinalSubmitted ? 'disabled' : ''} style="background:${isUserRevisionConfirmed ? '#f1f5f9' : 'linear-gradient(135deg, #2563eb, #1d4ed8)'}; border:${isUserRevisionConfirmed ? '1px solid #cbd5e1' : 'none'}; color:${isUserRevisionConfirmed ? '#2563eb' : 'white'}; padding:8px 14px; border-radius:8px; font-weight:700; font-size:12px; cursor:${isUserRevisionConfirmed || isFinalSubmitted ? 'default' : 'pointer'};">
            ${isUserRevisionConfirmed ? '✅ 您已确认修改终稿' : '📝 确认完成终稿修改'}
          </button>
          <button id="btn-final-submit" ${isFinalSubmitted ? 'disabled' : ''} style="background:${isFinalSubmitted ? '#ecfdf5' : 'linear-gradient(135deg, #059669, #047857)'}; border:${isFinalSubmitted ? '1px solid #a7f3d0' : 'none'}; color:${isFinalSubmitted ? '#059669' : 'white'}; padding:8px 18px; border-radius:8px; font-weight:700; cursor:${isFinalSubmitted ? 'not-allowed' : 'pointer'}; font-size:13px; box-shadow:${isFinalSubmitted ? 'none' : '0 3px 10px rgba(5,150,105,0.25)'};">
            ${isFinalSubmitted ? '🔒 论文终稿已成功提交 (归档只读)' : '🚀 提交论文终稿'}
          </button>
        </div>
      </div>

      <!-- 终稿修改确认进度提示 -->
      ${!isFinalSubmitted ? `
        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:6px 14px; display:flex; justify-content:space-between; align-items:center; font-size:12px;">
          <span style="color:#475569; font-weight:700;">📝 终稿修改确认进度: <b style="color:${isRevisionFullyConfirmed ? '#059669' : '#2563eb'};">${confirmedRevCount}/${totalCount}</b> 人已确认修改完毕</span>
          <div style="display:flex; gap:6px;">
            ${membersList.map(m => {
              const isConf = confirmedRevMap[m.id] || confirmedRevMap[m.studentCode];
              return `<span style="font-size:11px; padding:1px 8px; border-radius:10px; font-weight:700; background:${isConf ? '#ecfdf5' : '#ffffff'}; color:${isConf ? '#059669' : '#94a3b8'}; border:1px solid ${isConf ? '#a7f3d0' : '#e2e8f0'};">
                ${isConf ? '✓' : '○'} ${m.name}
              </span>`;
            }).join('')}
          </div>
        </div>
      ` : ''}

      ${activeTab === 'defense' ? `
        <div class="card" style="flex:1; overflow-y:auto; padding:20px;">
          <div class="card-title" style="margin-bottom:14px;">
            <span style="color:#0f172a;">🎓 答辩委员会改进意见与组内裁决矩阵 ${isFinalSubmitted ? '<span style="font-size:11px; color:#059669; margin-left:6px;">(🔒 已提交归档)</span>' : ''}</span>
          </div>
          <div style="display:flex; flex-direction:column; gap:14px;">
            ${s3.feedbackItems.length === 0 ? `
              <div style="text-align:center; color:#64748b; padding:32px; font-size:14px;">
                ⏳ 答辩委员会专家正在审阅初稿，请在右侧研讨区与委员开展交流答辩！
              </div>
            ` : s3.feedbackItems.map((item, idx) => `
              <div style="background:#ffffff; padding:16px; border-radius:12px; border:1px solid ${item.role === 'opponent' ? '#fca5a5' : '#86efac'}; box-shadow:0 2px 8px rgba(15,23,42,0.04);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                  <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-size:16px;">${item.role === 'opponent' ? '🔴' : '🟢'}</span>
                    <span style="font-weight:800; font-size:14.5px; color:${item.role === 'opponent' ? '#dc2626' : '#059669'};">质询点 ${idx + 1}: ${escapeHtml(item.speaker || (item.role === 'opponent' ? '反方委员 Agent' : '正方委员 Agent'))} - ${escapeHtml(item.title || '')}</span>
                  </div>
                  <span style="font-size:11.5px; padding:3px 10px; border-radius:12px; font-weight:700; background:${item.status === 'adopted' ? '#ecfdf5' : '#fffbeb'}; color:${item.status === 'adopted' ? '#059669' : '#d97706'}; border:1px solid ${item.status === 'adopted' ? '#a7f3d0' : '#fde68a'};">
                    ${item.status === 'adopted' ? '✅ 已研讨并归档' : '⏳ 待组内研讨裁决'}
                  </span>
                </div>
                <div style="font-size:13.5px; color:#1e293b; background:#f8fafc; border:1px solid #e2e8f0; padding:12px 14px; border-radius:8px; margin-bottom:12px; line-height:1.6;">
                  <b>${escapeHtml(item.speaker)}意见原文:</b><br>${escapeHtml(item.content || '')}
                </div>

                <div style="border-top:1px dashed #e2e8f0; padding-top:10px; margin-top:10px;">
                  <div style="font-size:12.5px; font-weight:700; color:#334155; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
                    <span>✍️ 本组答辩回复与修改结论：</span>
                    ${item.response ? '<span style="color:#059669; font-size:11.5px; font-weight:700;">✅ 已保存生效 (可随时二次修改)</span>' : '<span style="color:#64748b; font-size:11.5px;">(请直接在下方输入框中录入简要答复)</span>'}
                  </div>
                  <textarea 
                    class="feedback-direct-input" 
                    data-id="${item.id}" 
                    ${isFinalSubmitted ? 'disabled readonly' : ''} 
                    placeholder="商讨后，在此直接输入本组针对该条意见的简要答复与修改结论..." 
                    style="width:100%; min-height:64px; padding:8px 12px; font-size:13px; line-height:1.5; border:1px solid ${item.response ? '#a7f3d0' : '#cbd5e1'}; background:${isFinalSubmitted ? '#f8fafc' : (item.response ? '#f0fdf4' : '#ffffff')}; border-radius:8px; resize:vertical; box-sizing:border-box; color:#0f172a; font-family:inherit;"
                  >${escapeHtml(item.response || '')}</textarea>
                  
                  ${!isFinalSubmitted ? `
                    <div style="display:flex; justify-content:flex-end; margin-top:8px;">
                      <button class="btn-save-feedback-direct" data-id="${item.id}" style="background:${item.response ? 'linear-gradient(135deg, #059669, #047857)' : 'linear-gradient(135deg, #2563eb, #1d4ed8)'}; border:none; color:white; padding:6px 14px; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:4px; box-shadow:0 2px 6px rgba(0,0,0,0.12);">
                        ${item.response ? '🔄 更新并保存本条修改' : '💾 确认并保存本条答复'}
                      </button>
                    </div>
                  ` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : (() => {
        const currUser = (window.app && window.app.authManager) ? window.app.authManager.getCurrentUser() : null;
        const userClassId = state.activeStudentClassId || (currUser ? currUser.classId : null) || 'class_101';
        const activeGroupObj = (window.app && window.app.authManager) ? window.app.authManager.getStudentActiveGroup(currUser, userClassId) : null;
        const userGroupId = activeGroupObj?.id || (window.app?.cloudSyncEngine?.groupId) || (currUser?.groupId) || 'group_1';
        let activeTaskId = state.activeTaskId || (window.app?.cloudSyncEngine?.taskId) || (`task_${userClassId}_default`);
        if (!activeTaskId || activeTaskId === 'task_default') activeTaskId = `task_${userClassId}_default`;
        const padName = `jizhi_${activeTaskId}_${userGroupId}`;
        const currUserName = (currUser && (currUser.name || currUser.username)) || '组员';
        const currUserColor = (state.members && state.members[currUserCode]?.color) || '#2563eb';
        const padUrl = `/p/${padName}?userName=${encodeURIComponent(currUserName)}&userColor=${encodeURIComponent(currUserColor)}&showChat=false&showLineNumbers=true&showControls=true`;

        return `
          <div class="card" style="flex:1; display:flex; flex-direction:column; padding:16px; min-height:600px;">
            <div class="card-title" style="margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:15px; font-weight:800; color:#0f172a;">📝 论文全篇大正文 ${isFinalSubmitted ? '<span style="font-size:11px; color:#059669; margin-left:6px;">(🔒 终稿已提交 · 归档只读查阅)</span>' : '(依据答辩意见实时协同修改终稿 · Etherpad 毫秒级引擎)'}</span>
              <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:11px; background:#ecfdf5; color:#059669; border:1px solid #a7f3d0; padding:2px 8px; border-radius:10px; font-weight:700;">🟢 Etherpad 协同就绪</span>
                <button onclick="const f=document.getElementById('stage3-etherpad-frame'); if(f) f.src=f.src;" style="background:transparent; color:#2563eb; border:1px solid #cbd5e1; padding:2px 8px; border-radius:4px; font-size:11px; cursor:pointer; font-weight:600;">🔄 刷新</button>
              </div>
            </div>
            <div style="flex:1; min-height:0; position:relative; background:#f1f5f9; border-radius:8px; overflow:hidden; border:1px solid #cbd5e1;">
              <iframe id="stage3-etherpad-frame" src="${padUrl}" style="width:100%; height:100%; min-height:540px; border:none; display:block;" allow="clipboard-read; clipboard-write"></iframe>
            </div>
          </div>
        `;
      })()}
    </div>
  `;

  const tabDefense = canvas.querySelector('#tab-btn-defense');
  const tabEditor = canvas.querySelector('#tab-btn-editor');
  if (tabDefense) tabDefense.addEventListener('click', () => handlers.onSwitchStage3Tab('defense'));
  if (tabEditor) tabEditor.addEventListener('click', () => handlers.onSwitchStage3Tab('editor'));

  if (!isFinalSubmitted) {
    canvas.querySelectorAll('.feedback-direct-input').forEach(textarea => {
      let fbTimer = null;
      let idleTimer = null;
      let heartbeatTimer = null;
      const itemId = textarea.dataset.id;
      const fieldKey = `fb_${itemId}`;
      textarea.dataset.lockKey = fieldKey;

      const autoSave = () => {
        const text = textarea.value.trim();
        if (itemId && text && handlers.onSaveDirectFeedback) {
          handlers.onSaveDirectFeedback(itemId, text);
        }
      };

      const startHeartbeat = () => {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        heartbeatTimer = setInterval(() => {
          if (document.activeElement === textarea && !isFieldLockedByOther(fieldKey)) {
            sendLock(fieldKey, textarea.value);
          } else {
            clearInterval(heartbeatTimer);
          }
        }, 2000);
      };

      const resetIdleTimer = () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          autoSave();
          sendUnlock(fieldKey, textarea.value);
          if (heartbeatTimer) clearInterval(heartbeatTimer);
        }, 8000);
      };

      textarea.addEventListener('focus', () => {
        if (isFieldLockedByOther(fieldKey)) {
          textarea.blur();
          return;
        }
        sendLock(fieldKey, textarea.value);
        startHeartbeat();
        resetIdleTimer();
      });

      textarea.addEventListener('compositionstart', () => {
        textarea._isComposing = true;
        resetIdleTimer();
      });

      textarea.addEventListener('compositionupdate', () => {
        resetIdleTimer();
      });

      textarea.addEventListener('compositionend', () => {
        textarea._isComposing = false;
        sendLock(fieldKey, textarea.value);
        resetIdleTimer();
        if (fbTimer) clearTimeout(fbTimer);
        fbTimer = setTimeout(autoSave, 300);
      });

      textarea.addEventListener('input', (e) => {
        if (isFieldLockedByOther(fieldKey)) {
          e.preventDefault();
          e.stopImmediatePropagation();
          return;
        }
        if (!textarea._isComposing) {
          sendLock(fieldKey, e.target.value);
        }
        resetIdleTimer();
        if (fbTimer) clearTimeout(fbTimer);
        fbTimer = setTimeout(autoSave, 300);
      });

      textarea.addEventListener('change', autoSave);

      textarea.addEventListener('blur', () => {
        if (idleTimer) clearTimeout(idleTimer);
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        if (textarea._preemptedByOther || isFieldLockedByOther(fieldKey)) {
          textarea._preemptedByOther = false;
          return;
        }
        autoSave();
        sendUnlock(fieldKey, textarea.value);
      });

      textarea.addEventListener('keydown', (e) => {
        if (isFieldLockedByOther(fieldKey)) {
          e.preventDefault();
          e.stopImmediatePropagation();
          return;
        }
        resetIdleTimer();
      });
    });

    canvas.querySelectorAll('.btn-save-feedback-direct').forEach(btn => {
      btn.addEventListener('click', () => {
        const itemId = btn.dataset.id;
        const textarea = canvas.querySelector(`.feedback-direct-input[data-id="${itemId}"]`);
        const text = textarea ? textarea.value.trim() : '';
        if (!text) {
          alert('⚠️ 请输入本组针对该条意见的简要答复结论后再保存！');
          return;
        }
        handlers.onSaveDirectFeedback(itemId, text);
      });
    });

    const btnConfirmRev = canvas.querySelector('#btn-confirm-stage3-revision');
    if (btnConfirmRev && !isUserRevisionConfirmed) {
      btnConfirmRev.addEventListener('click', () => {
        handlers.onConfirmStage3Revision();
      });
    }
  }

  const submitBtn = canvas.querySelector('#btn-final-submit');
  if (submitBtn && !isFinalSubmitted) submitBtn.addEventListener('click', () => handlers.onFinalSubmit());

  const surveyBtn = canvas.querySelector('#btn-open-survey-page');
  if (surveyBtn) surveyBtn.addEventListener('click', () => handlers.onOpenSurveyModal());
}

export function renderChat(state) {
  const presenceContainer = document.getElementById('chat-member-presence-pills');
  if (presenceContainer) {
    const members = Object.values(state.members || {});
    const presence = state.presence || {};
    const currUser = (window.app && window.app.authManager) ? window.app.authManager.getCurrentUser() : null;
    const myCode = state.currentUser || (currUser ? currUser.studentCode : '');
    const nowMs = Date.now();

    // 收集近期 180 秒内发言或操作的所有成员
    const recentSpeakers = new Set();
    const visibleStages = ['stage1', 'stage2', 'stage3'];
    visibleStages.forEach(stg => {
      if (state.chatLogs && state.chatLogs[stg]) {
        state.chatLogs[stg].slice(-25).forEach(msg => {
          if (msg._timeMs && (nowMs - msg._timeMs < 180000)) {
            if (msg.sender) recentSpeakers.add(msg.sender);
            if (msg.senderName) recentSpeakers.add(msg.senderName);
          }
        });
      }
    });

    let memberList = [];
    if (Array.isArray(state.members)) memberList = state.members;
    else if (state.members && typeof state.members === 'object') memberList = Object.values(state.members);
    if (memberList.length === 0 && window.app?.authManager) {
      const u = window.app.authManager.getCurrentUser();
      const effClassId = window.app.state.activeStudentClassId || u?.classId || 'class_101';
      const effGroup = window.app.authManager.getStudentActiveGroup(u, effClassId);
      memberList = window.app.authManager.getGroupMembersForWorkspace(effGroup?.id || 'group_1');
    }

    presenceContainer.innerHTML = memberList.map(m => {
      const uid = String(m.id || m.studentCode || m.userId || '').trim();
      const candidateKeys = [
        String(m.id || '').trim(),
        String(m.studentCode || '').trim(),
        String(m.username || '').trim(),
        String(m.name || '').trim()
      ].filter(Boolean);

      const isMe = (currUser && (
        (currUser.id && (m.id === currUser.id || uid === String(currUser.id))) ||
        (currUser.studentCode && (m.studentCode === currUser.studentCode || uid === String(currUser.studentCode))) ||
        (currUser.username && (m.username === currUser.username || uid === String(currUser.username))) ||
        (currUser.name && m.name === currUser.name)
      )) || (uid && uid === myCode);

      let isOnline = isMe;
      if (!isOnline) {
        for (const k of candidateKeys) {
          const p = presence[k];
          if (p) {
            const pTime = Number(p.lastSeen || p.updatedAt || p.timestamp || 0);
            if (pTime > 0 && (nowMs - pTime <= 25000)) {
              isOnline = true;
              break;
            }
          }
        }
        if (!isOnline) {
          for (const k of candidateKeys) {
            if (recentSpeakers.has(k)) {
              isOnline = true;
              break;
            }
          }
        }
      }

      const dotColor = isOnline ? '#10b981' : '#cbd5e1';
      const bgStyle = isOnline
        ? 'background:#ecfdf5; color:#059669; border:1px solid #a7f3d0;'
        : 'background:#f1f5f9; color:#94a3b8; border:1px solid #e2e8f0;';

      return `
        <span style="font-size:11px; padding:2px 8px; border-radius:10px; font-weight:700; display:inline-flex; align-items:center; gap:4px; ${bgStyle}">
          <span style="width:6px; height:6px; border-radius:50%; background:${dotColor};"></span>
          ${m.avatar || '👤'} ${m.name}${isMe ? ' (我)' : ''}
        </span>
      `;
    }).join('');
  }

  const stream = document.getElementById('chat-stream');
  if (!stream) return;

  const currentUser = state.currentUser;
  const allStages = ['stage1', 'stage2', 'stage3'];

  // Collect all visible messages in order across all stages, auto-purging old legacy idle spam
  const allMsgs = [];
  const seenMsgKeys = new Set();
  allStages.forEach(stg => {
    if (state.chatLogs && Array.isArray(state.chatLogs[stg])) {
      state.chatLogs[stg].forEach(msg => {
        if (!msg) return;
        const txt = msg.text || '';
        if (txt.includes('已连续') || txt.includes('互动督促') || txt.includes('秒未研讨') || txt.includes('秒没有发言')) return;

        // 🛡️ 严格去重守护：同一阶段同一发送者同一文本内容（或相同 msg.id）绝不重复渲染
        const rawTxtNormalized = txt.replace(/[\s\r\n]+/g, ' ').trim();
        const contentKey = `${msg.sender}_${stg}_${rawTxtNormalized}`;
        const idKey = msg.id ? `id_${msg.id}` : null;
        if (seenMsgKeys.has(contentKey) || (idKey && seenMsgKeys.has(idKey))) {
          return;
        }
        seenMsgKeys.add(contentKey);
        if (idKey) seenMsgKeys.add(idKey);

        allMsgs.push(msg);
      });
    }
  });
  allMsgs.sort((a, b) => (Number(a._timeMs || 0) - Number(b._timeMs || 0)));
  const cleanMsgs = filterAndDeduplicateChatLogs(allMsgs);

  // 智能滚动：如果用户正在往上拉浏览历史记录，保持当前视角不被强行打断拉回底部
  const isAtBottom = (stream.scrollHeight - stream.scrollTop - stream.clientHeight) < 90;
  const prevScrollTop = stream.scrollTop;

  const allUsers = (window.app && window.app.authManager) ? window.app.authManager.getUsers() : [];

  stream.innerHTML = cleanMsgs.map(msg => {
    const isMe = msg.sender === currentUser || (window.app?.authManager?.getCurrentUser() && (msg.sender === window.app.authManager.getCurrentUser().id || msg.sender === window.app.authManager.getCurrentUser().studentCode));
    const isAgent = AgentProfiles[msg.sender] !== undefined;
    
    let name = msg.senderName || msg.sender;
    let avatar = '👤';
    let color = '#2563eb';

    if (isAgent) {
      const profile = AgentProfiles[msg.sender];
      name = profile.roleTitle || profile.name;
      avatar = profile.avatar;
      color = profile.color || '#7c3aed';
    } else {
      const u = allUsers.find(x => x.id === msg.sender || x.studentCode === msg.sender || x.username === msg.sender || x.name === msg.sender);
      if (u && u.name) {
        name = u.name;
      } else if (state.members) {
        const mem = Object.values(state.members).find(m => m.id === msg.sender || m.studentCode === msg.sender || m.username === msg.sender || m.name === msg.sender);
        if (mem && mem.name) name = mem.name;
      }

      const memObj = state.members ? (state.members[msg.sender] || Object.values(state.members).find(m => m.id === msg.sender || m.studentCode === msg.sender || m.name === name)) : null;
      if (memObj) {
        avatar = memObj.avatar || '👨‍🎓';
        color = memObj.color || '#2563eb';
      }
    }

    let formattedContent = '';
    if ((msg.text || '').startsWith('[IMG_DATA]:')) {
      const imgSrc = sanitizeUrl(msg.text.replace('[IMG_DATA]:', ''));
      formattedContent = `
        <div style="margin-top:2px;">
          <img src="${imgSrc}" class="chat-attached-img" style="max-width:220px; max-height:160px; border-radius:8px; border:1px solid #cbd5e1; cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,0.1); transition:transform 0.2s; display:block;" title="点击放大查看图片">
        </div>
      `;
    } else {
      let rawText = msg.text || '';
      let safeText = escapeHtml(rawText);
      let formattedText = safeText.replace(/(@[^\s@]+)/g, '<span class="mention-tag">$1</span>');
      formattedContent = `<div class="msg-bubble">${formattedText}</div>`;
    }

    return `
      <div class="chat-message ${isMe ? 'me' : 'other'}">
        <div class="msg-avatar" style="background:${color}22; border:1px solid ${color}; color:${color};">${escapeHtml(avatar)}</div>
        <div class="msg-body">
          <div class="msg-meta">
            <span class="msg-sender" style="color:${color};">${escapeHtml(name)} ${isMe ? '(我)' : ''}</span>
            <span style="font-size:10px; color:#64748b; margin-left:6px;">${escapeHtml(formatChatDisplayTime(msg._timeMs || msg.timestamp))}</span>
          </div>
          ${formattedContent}
        </div>
      </div>
    `;
  }).join('');

  if (isAtBottom) {
    stream.scrollTop = stream.scrollHeight;
  } else {
    stream.scrollTop = prevScrollTop;
  }

  stream.querySelectorAll('.chat-attached-img').forEach(img => {
    img.onclick = (e) => {
      e.stopPropagation();
      document.querySelectorAll('.img-preview-lightbox').forEach(el => el.remove());

      const box = document.createElement('div');
      box.className = 'img-preview-lightbox';
      box.style.cssText = 'position:fixed; inset:0; background:rgba(15,23,42,0.85); backdrop-filter:blur(8px); display:flex; flex-direction:column; align-items:center; justify-content:center; z-index:99999; animation:modalFadeIn 0.2s ease;';

      box.innerHTML = `
        <div style="position:absolute; top:20px; right:24px; display:flex; gap:10px; z-index:100000;" onclick="event.stopPropagation()">
          <button id="btn-lightbox-open-tab" style="background:#ffffff; color:#1e293b; border:none; padding:8px 14px; border-radius:8px; font-size:12.5px; font-weight:700; cursor:pointer; box-shadow:0 4px 12px rgba(0,0,0,0.15); display:flex; align-items:center; gap:6px;">
            🔗 在新标签页打开
          </button>
          <a id="btn-lightbox-download" href="${img.src}" download="jizhi_chat_img_${Date.now()}" style="background:#2563eb; color:#ffffff; border:none; padding:8px 14px; border-radius:8px; font-size:12.5px; font-weight:700; text-decoration:none; box-shadow:0 4px 12px rgba(37,99,235,0.3); display:flex; align-items:center; gap:6px;">
            💾 下载原图
          </a>
          <button id="btn-lightbox-close" style="background:#475569; color:#ffffff; border:none; width:34px; height:34px; border-radius:50%; font-size:16px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center;">
            ✕
          </button>
        </div>
        <div style="max-width:90vw; max-height:85vh; display:flex; align-items:center; justify-content:center; cursor:default;" onclick="event.stopPropagation()">
          <img src="${img.src}" style="max-width:90vw; max-height:85vh; object-fit:contain; border-radius:10px; box-shadow:0 20px 40px rgba(0,0,0,0.5); border:1.5px solid rgba(255,255,255,0.2);">
        </div>
        <div style="margin-top:14px; font-size:12px; color:#94a3b8; letter-spacing:0.5px;">按 Esc 或点击任意空白处关闭</div>
      `;

      const closeBox = () => {
        box.remove();
        document.removeEventListener('keydown', handleKey);
      };

      const handleKey = (ev) => {
        if (ev.key === 'Escape') closeBox();
      };

      box.onclick = closeBox;
      box.querySelector('#btn-lightbox-close')?.addEventListener('click', closeBox);
      box.querySelector('#btn-lightbox-open-tab')?.addEventListener('click', () => {
        window.open(img.src, '_blank');
      });
      document.addEventListener('keydown', handleKey);
      document.body.appendChild(box);
    };
  });
}

// 🛡️ Fail-safe compatibility exports
export function renderDefenseRoom() {}
export function renderWordEditor() {}
export function renderStageNavigation() {}
export function renderStudentWorkspace() {}
export function renderSurveyModal() {}
export function setupChatAtMentionMenu() {}
export function updateContributionUi() {}
export function showSurveyModalIfApplicable() {}

