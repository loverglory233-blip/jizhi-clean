/**
 * Jizhi (集智) Multi-Agent Collaborative Writing Platform
 * Clean Standalone Full Bundle - 100% Plug & Play (Works with both file:// and http://)
 */
(function() {
  'use strict';

  // ==========================================
  // 1. AGENTS DEFINITION
  // ==========================================
  const AgentProfiles = {
    auctioneer: {
      id: 'auctioneer',
      name: '拍卖师 Agent',
      roleTitle: '头脑风暴 · 学术拍卖师',
      avatar: '🎪',
      color: '#8b5cf6',
      stage: 'stage1',
      description: '指导原则：深入剖析提案的学术价值与潜在风险，促成观点与理由的交融，绝不直接帮学生指定选题或替代决策。'
    },
    managingEditor: {
      id: 'managingEditor',
      name: '责任编辑 Agent',
      roleTitle: '学术编辑部 · 过程学伴',
      avatar: '🤝',
      color: '#10b981',
      stage: 'stage2',
      description: '指导原则：聚焦协作流转与过程监控，实时追踪字数均衡度与同伴互动，适时触发编辑会议，调节团队情绪。'
    },
    reviewingEditor: {
      id: 'reviewingEditor',
      name: '审稿编辑 Agent',
      roleTitle: '学术编辑部 · 专家指导',
      avatar: '📝',
      color: '#0284c7',
      stage: 'stage2',
      description: '指导原则：聚焦高阶认知调节，采用苏格拉底式提问引导结构衔接，提供案例参照，绝不直接替学生撰写任何正文段落。'
    },
    proponent: {
      id: 'proponent',
      name: '正方委员 Agent',
      roleTitle: '答辩委员会 · 肯定支持者',
      avatar: '🟢',
      color: '#16a34a',
      stage: 'stage3',
      description: '指导原则：强化元认知反思中的正面强化，从学术价值、结构严密性与理论结合度肯定优势，增强团队效能感。'
    },
    opponent: {
      id: 'opponent',
      name: '反方委员 Agent',
      roleTitle: '答辩委员会 · 尖锐质疑者',
      avatar: '🔴',
      color: '#dc2626',
      stage: 'stage3',
      description: '指导原则：暴露深层逻辑漏洞与文献矛盾，提出关于变量测量与统计效力的学术质疑，驱动再调节。'
    },
    neutral: {
      id: 'neutral',
      name: '中间委员 Agent',
      roleTitle: '答辩委员会 · 裁决引导者',
      avatar: '🟡',
      color: '#d97706',
      stage: 'stage3',
      description: '指导原则：不偏不倚，将判断权与抗辩权推还给学生群体，引导学生评估哪些质疑需吸纳修改、哪些需书面回应。'
    }
  };

  const PresetMessages = {
    stage1: [
      { 
        sender: 'auctioneer', 
        text: '🎪 【学术拍卖会启动】各位研究者，欢迎进入阶段一【学术拍卖会】！\n\n在接下来的 25 分钟里，请小组成员在左侧点击【+ 提交我的选题提案】，写明你们各自的【研究观点/主题】与选择该主题的【学术理由依据】。\n\n提案提交后，拍卖师将实时为你们进行学术价值鉴定并开启组内竞拍投票与合作合约签署！', 
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ],
    stage2: [
      { 
        sender: 'managingEditor', 
        text: '🤝 【学术编辑部接管】学术合作合约已全员签署生效！学术编辑部全面上线。\n\n请大家在大文本框中分工协作撰写方案。我将全程实时监控全组成员的字数贡献比与协同节奏，并在半程节点协助大家召开【编辑会议】！', 
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      },
      { 
        sender: 'reviewingEditor', 
        text: '📝 【审稿编辑认知支架】各位作者，在撰写过程中请务必注意研究问题（RQ）与研究假设（H）之间的逻辑演绎，以及自变量与测量量表的匹配。\n\n提示：审稿编辑提供结构引导与思考提问，绝不替代大家撰写正文，遇到问题可随时在聊天区 @审稿编辑！', 
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ],
    stage3: [
      { 
        sender: 'proponent', 
        text: '🟢 【正方委员·肯定支持】恭喜研究团队完成研究设计方案！正方审稿专家已就绪，我们将从学术创新性、方案严密性与理论结合度进行评审。', 
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      },
      { 
        sender: 'opponent', 
        text: '🔴 【反方委员·学术质询】反方审稿专家已审阅大家的初稿，请针对左侧提出的学术质询与方法局限开展组内答辩与论证防御！', 
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      },
      { 
        sender: 'neutral', 
        text: '🟡 【中间委员·裁决引导】请作者团队在左侧【组内裁决面板】逐项讨论：哪些质疑属于必须在正文中吸纳修改的漏洞？哪些属于可以保留并做出书面抗辩的限定条件？请记录裁决意见并修改终稿！', 
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]
  };

  // ==========================================
  // 2. INITIAL CLEAN STATE
  // ==========================================
  const InitialState = {
    currentStage: 'stage1',
    currentUser: 'A',
    timer: {
      elapsedSeconds: 0,
      totalSeconds: 150 * 60,
      speed: 1,
      isRunning: true
    },
    members: {
      'A': { id: 'liming', studentCode: 'A', name: '李明 (学生A/组长)', color: '#0284c7', avatar: '👨‍🎓' },
      'B': { id: 'wangfang', studentCode: 'B', name: '王芳 (学生B/组员)', color: '#059669', avatar: '👩‍🎓' },
      'C': { id: 'chenqiang', studentCode: 'C', name: '陈强 (学生C/组员)', color: '#7c3aed', avatar: '🧑‍🎓' }
    },
    stage1: {
      step: 1,
      proposals: [],
      votes: {},
      hasVoted: {},
      mergedTitle: '',
      contract: {
        topic: '',
        timeAllocations: {
          background: 20,
          questions: 25,
          literature: 30,
          method: 40,
          reflection: 15,
          references: 10
        },
        taskAssignments: { 'A': '', 'B': '', 'C': '' },
        isConfirmed: false,
        confirmedMembers: { 'A': false, 'B': false, 'C': false }
      }
    },
    stage2: {
      unifiedContent: '<h1>《研究设计方案》</h1><p><b>一、研究背景与意义</b></p><p>（请在此处阐述研究背景、现实痛点、理论价值与实践意义...）</p><p><br></p><p><b>二、研究问题与假设</b></p><p>（请在此处明确核心研究问题 RQ 与待检验的研究假设 H...）</p><p><br></p><p><b>三、文献综述</b></p><p>（请在此处梳理相关领域理论基础、国内外研究现状及已有研究局限...）</p><p><br></p><p><b>四、研究设计与方法</b></p><p>（请在此处详细说明实验设计、研究对象与样本、变量定义及测量工具量表...）</p><p><br></p><p><b>五、研究设计的不足与反思</b></p><p>（请在此处反思当前设计的潜在局限、威胁内部/外部效度的因素与改进预案...）</p><p><br></p><p><b>六、参考文献</b></p><p>（请在此处列出引用的学术文献规范条目...）</p>',
      memberContributions: {
        'A': { words: 0, percentage: 33 },
        'B': { words: 0, percentage: 33 },
        'C': { words: 0, percentage: 34 }
      },
      memberTypedCounts: { 'A': 0, 'B': 0, 'C': 0 },
      actionPlan: { isGenerated: false, items: [] }
    },
    stage3: {
      feedbackItems: [],
      finalSubmitted: false,
      finalSubmissionTime: null
    },
    activePresences: {},
    chatLogs: { stage1: [], stage2: [], stage3: [] }
  };

  // ==========================================
  // 3. AUTH & PERSISTENCE MANAGER
  // ==========================================
  const STORAGE_KEY_USER = 'jizhi_clean_current_user';
  const STORAGE_KEY_USERS_DB = 'jizhi_clean_users_db';
  const STORAGE_KEY_CLASSES = 'jizhi_clean_classes_db';
  const STORAGE_KEY_TASKS = 'jizhi_clean_tasks_db';
  const STORAGE_KEY_ANNOUNCEMENTS = 'jizhi_clean_announcements_db';

  const DefaultClasses = [
    {
      id: 'class_101',
      name: '《现代教育技术》2026春01班',
      code: 'MET-2026-01',
      studentIds: ['u_studentA', 'u_studentB', 'u_studentC'],
      groups: [
        {
          id: 'group_1',
          name: '第1小组 (AI与协作写作研究组)',
          members: ['u_studentA', 'u_studentB', 'u_studentC'],
          topic: ''
        }
      ]
    }
  ];

  const DefaultUsers = [
    { 
      id: 'u_teacher1', 
      username: 'teacher',
      email: 'teacher@jizhi.edu', 
      password: '123', 
      name: '张教授 (主讲教师)', 
      role: 'teacher', 
      avatar: '👩‍🏫' 
    },
    { 
      id: 'u_studentA', 
      username: 'liming',
      email: 'studentA@jizhi.edu', 
      password: '123', 
      name: '李明 (学生A/组长)', 
      role: 'student', 
      studentCode: 'A', 
      avatar: '👨‍🎓', 
      classId: 'class_101', 
      groupId: 'group_1' 
    },
    { 
      id: 'u_studentB', 
      username: 'wangfang',
      email: 'studentB@jizhi.edu', 
      password: '123', 
      name: '王芳 (学生B/组员)', 
      role: 'student', 
      studentCode: 'B', 
      avatar: '👩‍🎓', 
      classId: 'class_101', 
      groupId: 'group_1' 
    },
    { 
      id: 'u_studentC', 
      username: 'chenqiang',
      email: 'studentC@jizhi.edu', 
      password: '123', 
      name: '陈强 (学生C/组员)', 
      role: 'student', 
      studentCode: 'C', 
      avatar: '🧑‍🎓', 
      classId: 'class_101', 
      groupId: 'group_1' 
    }
  ];

  const DefaultTasks = [
    {
      id: 'task_001',
      title: '《现代教育技术》期末协作研究设计方案编写',
      classId: 'class_101',
      className: '《现代教育技术》2026春01班',
      durationMinutes: 150,
      startTime: '2026-08-02 20:00',
      deadline: '2026-08-02 22:30',
      status: 'in_progress',
      createdAt: new Date().toLocaleDateString(),
      instructions: '请在150分钟内，以小组为单位完成一份包含研究背景与意义、研究问题与假设、文献综述、研究设计与方法、不足与反思及参考文献的高质量研究方案。',
      resources: []
    }
  ];

  const DefaultAnnouncements = [
    {
      id: 'ann_001',
      taskId: 'task_001',
      taskTitle: '《现代教育技术》期末协作研究设计方案编写',
      title: '📢 课题提案与时间合约确认提醒',
      content: '请各组在【学术拍卖会】阶段认真讨论课题观点与理由，并共同签署时间分配与分工合约。',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      author: '张教授',
      readStatus: { 'group_1': false }
    }
  ];

  class AuthManager {
    constructor() {
      this.initDatabase();
    }

    initDatabase() {
      if (!localStorage.getItem(STORAGE_KEY_USERS_DB)) {
        localStorage.setItem(STORAGE_KEY_USERS_DB, JSON.stringify(DefaultUsers));
      }
      if (!localStorage.getItem(STORAGE_KEY_CLASSES)) {
        localStorage.setItem(STORAGE_KEY_CLASSES, JSON.stringify(DefaultClasses));
      }
      if (!localStorage.getItem(STORAGE_KEY_TASKS)) {
        localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(DefaultTasks));
      }
      if (!localStorage.getItem(STORAGE_KEY_ANNOUNCEMENTS)) {
        localStorage.setItem(STORAGE_KEY_ANNOUNCEMENTS, JSON.stringify(DefaultAnnouncements));
      }
    }

    getUsers() { return JSON.parse(localStorage.getItem(STORAGE_KEY_USERS_DB)) || DefaultUsers; }
    getClasses() { return JSON.parse(localStorage.getItem(STORAGE_KEY_CLASSES)) || DefaultClasses; }
    getTasks() { return JSON.parse(localStorage.getItem(STORAGE_KEY_TASKS)) || DefaultTasks; }
    getAnnouncements() { return JSON.parse(localStorage.getItem(STORAGE_KEY_ANNOUNCEMENTS)) || DefaultAnnouncements; }

    getCurrentUser() {
      const sessionData = sessionStorage.getItem(STORAGE_KEY_USER);
      if (sessionData) {
        try { return JSON.parse(sessionData); } catch (e) {}
      }
      const localData = localStorage.getItem(STORAGE_KEY_USER);
      return localData ? JSON.parse(localData) : null;
    }

    login(accountInput, password) {
      const users = this.getUsers();
      const query = accountInput.trim().toLowerCase();

      const user = users.find(u => {
        const uName = (u.username || '').toLowerCase();
        const uEmail = (u.email || '').toLowerCase();
        const uCode = (u.studentCode || '').toLowerCase();
        return (uName === query || uEmail === query || uCode === query || ('student' + uCode) === query) && u.password === password;
      });

      if (user) {
        sessionStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
        localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
        return { success: true, user };
      }

      return { success: false, message: '账号或密码错误 (默认密码均为 123)' };
    }

    register(name, email, password, role = 'student') {
      const users = this.getUsers();
      const existing = users.find(u => u.email.toLowerCase() === email.trim().toLowerCase());
      if (existing) {
        return { success: false, message: '该邮箱已被注册！' };
      }

      const newUser = {
        id: 'u_' + Date.now(),
        username: email.split('@')[0],
        email: email.trim(),
        password: password.trim(),
        name: name.trim(),
        role,
        studentCode: role === 'student' ? 'A' : null,
        avatar: role === 'teacher' ? '👩‍🏫' : '👨‍🎓',
        classId: 'class_101',
        groupId: 'group_1'
      };

      users.push(newUser);
      localStorage.setItem(STORAGE_KEY_USERS_DB, JSON.stringify(users));
      sessionStorage.setItem(STORAGE_KEY_USER, JSON.stringify(newUser));
      localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(newUser));
      return { success: true, user: newUser };
    }

    logout() {
      sessionStorage.removeItem(STORAGE_KEY_USER);
      localStorage.removeItem(STORAGE_KEY_USER);
    }

    createTask(title, classId, instructions, resources = [], startTime = null, deadline = null, durationMinutes = 150) {
      const tasks = this.getTasks();
      const classes = this.getClasses();
      const targetClass = classes.find(c => c.id === classId) || classes[0];

      const now = new Date();
      const defaultStart = startTime ? startTime.replace('T', ' ') : now.toISOString().slice(0, 16).replace('T', ' ');

      let defaultDeadline = deadline ? deadline.replace('T', ' ') : '';
      if (!defaultDeadline) {
        const dObj = new Date(now.getTime() + (parseInt(durationMinutes) || 150) * 60 * 1000);
        defaultDeadline = dObj.toISOString().slice(0, 16).replace('T', ' ');
      }

      const newTask = {
        id: 'task_' + Date.now(),
        title,
        classId,
        className: targetClass.name,
        durationMinutes: parseInt(durationMinutes) || 150,
        startTime: defaultStart,
        deadline: defaultDeadline,
        status: 'in_progress',
        createdAt: new Date().toLocaleDateString(),
        instructions,
        resources
      };

      tasks.unshift(newTask);
      localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(tasks));
      return newTask;
    }

    publishAnnouncement(taskId, title, content, attachment = null) {
      const announcements = this.getAnnouncements();
      const tasks = this.getTasks();
      const task = tasks.find(t => t.id === taskId);

      const newAnn = {
        id: 'ann_' + Date.now(),
        taskId,
        taskTitle: task ? task.title : '期末协作写作',
        title,
        content,
        attachment,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        author: '张教授',
        readStatus: { 'group_1': false }
      };

      announcements.unshift(newAnn);
      localStorage.setItem(STORAGE_KEY_ANNOUNCEMENTS, JSON.stringify(announcements));
      return newAnn;
    }

    markAnnouncementRead(annId, groupId = 'group_1') {
      const announcements = this.getAnnouncements();
      const ann = announcements.find(a => a.id === annId);
      if (ann) {
        if (!ann.readStatus) ann.readStatus = {};
        ann.readStatus[groupId] = true;
        localStorage.setItem(STORAGE_KEY_ANNOUNCEMENTS, JSON.stringify(announcements));
      }
    }

    exportGroupChatLogsToExcel(groupId = 'group_1', chatLogsState = null) {
      const currentChatLogs = chatLogsState || JSON.parse(localStorage.getItem('jizhi_clean_chat_v4')) || {};
      let csvContent = '\uFEFF名字,时间,内容\n';
      const stageNames = {
        stage1: '阶段一：学术拍卖会',
        stage2: '阶段二：学术编辑部',
        stage3: '阶段三：答辩擂台'
      };

      const users = this.getUsers();

      ['stage1', 'stage2', 'stage3'].forEach(stageKey => {
        const logs = currentChatLogs[stageKey] || [];
        if (logs.length > 0) {
          csvContent += `"[${stageNames[stageKey]}]","",""\n`;
          logs.forEach(msg => {
            let senderDisplayName = msg.sender;
            if (msg.sender === 'A' || msg.sender === 'liming') senderDisplayName = '李明 (学生A/组长)';
            else if (msg.sender === 'B' || msg.sender === 'wangfang') senderDisplayName = '王芳 (学生B/组员)';
            else if (msg.sender === 'C' || msg.sender === 'chenqiang') senderDisplayName = '陈强 (学生C/组员)';
            else if (msg.sender === 'auctioneer') senderDisplayName = '拍卖师 Agent';
            else if (msg.sender === 'managingEditor') senderDisplayName = '责任编辑 Agent';
            else if (msg.sender === 'reviewingEditor') senderDisplayName = '审稿编辑 Agent';
            else if (msg.sender === 'opponent') senderDisplayName = '反方委员 Agent';
            else if (msg.sender === 'proponent') senderDisplayName = '正方委员 Agent';
            else if (msg.sender === 'neutral') senderDisplayName = '中间委员 Agent';
            else {
              const foundUser = users.find(u => u.studentCode === msg.sender || u.username === msg.sender);
              if (foundUser) senderDisplayName = foundUser.name;
            }

            const time = msg.timestamp || '';
            const text = (msg.text || '').replace(/"/g, '""').replace(/\n/g, ' ');
            csvContent += `"${senderDisplayName}","${time}","${text}"\n`;
          });
        }
      });

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `学术协作记录表_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }

  // ==========================================
  // 4. UI RENDERER FUNCTIONS
  // ==========================================
  function renderLoginView(container, authManager, onLoginSuccess) {
    container.innerHTML = `
      <div class="login-page-container">
        <div class="login-box-card">
          <div class="login-header">
            <div class="login-logo-title">集智 JIZHI</div>
            <p class="login-subtitle">多智能体支持的在线协作写作平台 (全新纯净版)</p>
          </div>

          <div class="login-tab-bar">
            <button class="login-tab active" data-tab="login">账号登录</button>
            <button class="login-tab" data-tab="register">注册账号</button>
          </div>

          <form class="login-form-body" id="form-login">
            <div class="form-group">
              <label for="login-email">账号 / 邮箱</label>
              <input type="text" id="login-email" class="form-input" value="teacher" placeholder="输入用户名或邮箱" required>
            </div>

            <div class="form-group">
              <label for="login-password">密码</label>
              <input type="password" id="login-password" class="form-input" value="123" placeholder="请输入密码" required>
            </div>

            <div id="login-error-msg" class="error-banner" style="display:none; color:#ef4444; font-size:12px; margin-bottom:10px;"></div>

            <button type="submit" class="login-submit-btn">
              登录进入平台
            </button>
          </form>

          <form class="login-form-body" id="form-register" style="display:none;">
            <div class="form-group">
              <label for="reg-name">姓名</label>
              <input type="text" id="reg-name" class="form-input" placeholder="例如：张老师 / 李同学" required>
            </div>

            <div class="form-group">
              <label for="reg-email">注册邮箱</label>
              <input type="email" id="reg-email" class="form-input" placeholder="例如：user@jizhi.edu" required>
            </div>

            <div class="form-group">
              <label for="reg-password">设置密码</label>
              <input type="password" id="reg-password" class="form-input" placeholder="请输入密码" required>
            </div>

            <div class="form-group">
              <label for="reg-role">身份类型</label>
              <select id="reg-role" class="form-input" style="background:#ffffff; color:#0f172a;">
                <option value="student">🎓 学生端 (Student)</option>
                <option value="teacher">👩‍🏫 教师端 (Teacher)</option>
              </select>
            </div>

            <div id="reg-error-msg" class="error-banner" style="display:none; color:#ef4444; font-size:12px; margin-bottom:10px;"></div>

            <button type="submit" class="login-submit-btn">
              完成注册并登录
            </button>
          </form>

          <div class="demo-accounts-card">
            <div class="demo-title">💡 快捷演示账号（点击直接进入）：</div>
            <div class="demo-grid">
              <button class="demo-btn" data-email="teacher@jizhi.edu" data-pass="123">
                👩‍🏫 教师端 (张教授)
              </button>
              <button class="demo-btn" data-email="studentA@jizhi.edu" data-pass="123">
                👨‍🎓 学生A (李明/组长)
              </button>
              <button class="demo-btn" data-email="studentB@jizhi.edu" data-pass="123">
                👩‍🎓 学生B (王芳/组员)
              </button>
              <button class="demo-btn" data-email="studentC@jizhi.edu" data-pass="123">
                🧑‍🎓 学生C (陈强/组员)
              </button>
            </div>
          </div>

        </div>
      </div>
    `;

    const loginTab = container.querySelector('[data-tab="login"]');
    const regTab = container.querySelector('[data-tab="register"]');
    const loginForm = container.querySelector('#form-login');
    const regForm = container.querySelector('#form-register');

    loginTab.addEventListener('click', () => {
      loginTab.classList.add('active');
      regTab.classList.remove('active');
      loginForm.style.display = 'block';
      regForm.style.display = 'none';
    });

    regTab.addEventListener('click', () => {
      regTab.classList.add('active');
      loginTab.classList.remove('active');
      regForm.style.display = 'block';
      loginForm.style.display = 'none';
    });

    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = container.querySelector('#login-email').value.trim();
      const pass = container.querySelector('#login-password').value.trim();
      const res = authManager.login(email, pass);
      if (res.success) {
        onLoginSuccess(res.user);
      } else {
        const errBox = container.querySelector('#login-error-msg');
        errBox.style.display = 'block';
        errBox.textContent = res.message;
      }
    });

    regForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = container.querySelector('#reg-name').value.trim();
      const email = container.querySelector('#reg-email').value.trim();
      const pass = container.querySelector('#reg-password').value.trim();
      const role = container.querySelector('#reg-role').value;
      const res = authManager.register(name, email, pass, role);
      if (res.success) {
        onLoginSuccess(res.user);
      } else {
        const errBox = container.querySelector('#reg-error-msg');
        errBox.style.display = 'block';
        errBox.textContent = res.message;
      }
    });

    container.querySelectorAll('.demo-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const email = btn.dataset.email;
        const pass = btn.dataset.pass;
        const res = authManager.login(email, pass);
        if (res.success) {
          onLoginSuccess(res.user);
        }
      });
    });
  }

  function renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView) {
    const currentUser = authManager.getCurrentUser();
    const tasks = authManager.getTasks();
    const announcements = authManager.getAnnouncements();
    const classes = authManager.getClasses();

    container.innerHTML = `
      <div class="teacher-portal-layout" style="height:100vh; display:flex; flex-direction:column; background:#f1f5f9;">
        <header class="app-header">
          <div class="brand-section">
            <div class="brand-logo">集智 JIZHI</div>
            <div class="brand-badge" style="background:#fef3c7; color:#d97706; border-color:#fde68a;">👩‍🏫 教师端管理中心</div>
          </div>

          <div class="teacher-info" style="display:flex; align-items:center; gap:12px; font-size:13px; color:#334155;">
            <span>班级: <b>${classes[0] ? classes[0].name : '现代教育技术班'}</b></span>
            <span>主讲教师: <b>${currentUser.name}</b></span>
            <button id="btn-switch-student-preview" class="header-icon-btn" style="background:#e0f2fe; color:#0284c7;">
              👀 切换至学生协作视角
            </button>
            <button id="btn-logout" class="header-icon-btn logout">
              退出登录
            </button>
          </div>
        </header>

        <main class="teacher-content" style="flex:1; display:grid; grid-template-columns:1fr 1fr; gap:20px; padding:20px 24px; overflow-y:auto;">
          <section class="teacher-left-panel" style="display:flex; flex-direction:column; gap:16px;">
            <div class="card">
              <div class="card-title" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <span style="font-weight:700; font-size:15px; color:#0f172a;">📢 课堂即时广播通知 (含教学资源与已读追踪)</span>
                <button id="btn-open-ann-modal" style="background:#10b981; border:none; color:white; padding:6px 12px; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer;">
                  + 发布新通知
                </button>
              </div>

              <div class="announcement-history-list" style="display:flex; flex-direction:column; gap:10px; max-height:260px; overflow-y:auto;">
                ${announcements.map(a => `
                  <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                      <span style="font-weight:700; color:#0284c7; font-size:13.5px;">${a.title}</span>
                      <span style="font-size:11px; color:#64748b;">${a.time}</span>
                    </div>
                    <div style="font-size:12.5px; color:#334155; margin-bottom:6px; line-height:1.5;">${a.content}</div>
                    
                    <div style="font-size:11px; color:#64748b; display:flex; gap:12px; border-top:1px dashed #e2e8f0; padding-top:6px;">
                      <span>已读小组: <b style="color:#16a34a;">${a.readStatus && a.readStatus['group_1'] ? '✅ 第1小组 (已读)' : '无'}</b></span>
                      <span>未读小组: <b style="color:#dc2626;">${a.readStatus && !a.readStatus['group_1'] ? '⚠️ 第1小组 (未读)' : '无'}</b></span>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>

            <div class="card">
              <div class="card-title" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <span style="font-weight:700; font-size:15px; color:#0f172a;">📌 协作写作任务发布</span>
                <button id="btn-open-task-modal" style="background:#0284c7; border:none; color:white; padding:6px 12px; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer;">
                  + 发布新写作任务
                </button>
              </div>

              <div class="task-list-container" style="display:flex; flex-direction:column; gap:10px;">
                ${tasks.map(t => `
                  <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:14px;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                      <span style="font-size:15px; font-weight:700; color:#0f172a;">${t.title}</span>
                      <span style="font-size:11px; color:#0284c7; background:#e0f2fe; padding:2px 8px; border-radius:10px; font-weight:600;">${t.className}</span>
                    </div>
                    <div style="font-size:12px; color:#64748b; margin:6px 0;">时长: ${t.durationMinutes} 分钟 | 发布时间: ${t.createdAt}</div>
                    <div style="font-size:13px; color:#334155; background:#ffffff; padding:10px; border-radius:6px; border-left:3px solid #0284c7; line-height:1.5;">
                      <b style="color:#0284c7;">任务说明:</b> ${t.instructions}
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          </section>

          <section class="teacher-right-panel">
            <div class="card" style="height:100%;">
              <div class="card-title" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
                <span style="font-weight:700; font-size:15px; color:#0f172a;">📊 班级各组写作状态监控与数据导出</span>
                <button id="btn-export-all-excel" style="background:linear-gradient(135deg, #10b981, #059669); border:none; color:white; padding:6px 14px; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer;">
                  📊 一键导出 Excel 表格
                </button>
              </div>

              <table style="width:100%; border-collapse:collapse; font-size:13px; text-align:left;">
                <thead>
                  <tr style="background:#f8fafc; border-bottom:2px solid #e2e8f0; color:#475569;">
                    <th style="padding:10px;">小组名称</th>
                    <th style="padding:10px;">当前阶段</th>
                    <th style="padding:10px;">各成员字数贡献</th>
                    <th style="padding:10px;">通知已读</th>
                    <th style="padding:10px;">操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style="border-bottom:1px solid #e2e8f0;">
                    <td style="padding:12px 10px;"><b>第1小组 (AI组)</b></td>
                    <td style="padding:12px 10px;"><span style="color:#0284c7; background:#e0f2fe; padding:2px 8px; border-radius:4px; font-size:11.5px; font-weight:600;">阶段二：学术编辑部</span></td>
                    <td style="padding:12px 10px;">
                      <div style="font-size:11.5px; color:#334155;">
                        A (${state.stage2.memberContributions.A.percentage}%) | B (${state.stage2.memberContributions.B.percentage}%) | C (${state.stage2.memberContributions.C.percentage}%)
                      </div>
                    </td>
                    <td style="padding:12px 10px;">
                      ${announcements[0] && announcements[0].readStatus && announcements[0].readStatus['group_1'] 
                        ? '<span style="color:#16a34a; font-weight:600;">✅ 已读</span>' 
                        : '<span style="color:#dc2626; font-weight:600;">⚠️ 未读</span>'}
                    </td>
                    <td style="padding:12px 10px;">
                      <button class="export-single-excel-btn" data-group="group_1" style="background:#0284c7; border:none; color:white; padding:4px 10px; border-radius:4px; font-size:11.5px; cursor:pointer; font-weight:600;">
                        导出 Excel
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>
    `;

    container.querySelector('#btn-logout').addEventListener('click', () => onLogout());
    container.querySelector('#btn-switch-student-preview').addEventListener('click', () => onSwitchToStudentView());

    const exportBtn = container.querySelector('#btn-export-all-excel');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        authManager.exportGroupChatLogsToExcel('group_1', state.chatLogs);
      });
    }

    container.querySelectorAll('.export-single-excel-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        authManager.exportGroupChatLogsToExcel(btn.dataset.group, state.chatLogs);
      });
    });

    container.querySelector('#btn-open-task-modal').addEventListener('click', () => {
      document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="teacher-modal-card">
          <div class="teacher-modal-header">
            <div>
              <h3>发布全新写作任务</h3>
              <p>设置写作任务要求与受众班级</p>
            </div>
            <button class="modal-close-btn" id="btn-close-task-modal">✕</button>
          </div>
          <div class="teacher-modal-body">
            <div class="teacher-form-group">
              <label>受众班级</label>
              <select id="modal-task-class" class="teacher-input">
                ${classes.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
              </select>
            </div>
            <div class="teacher-form-group">
              <label>任务名称</label>
              <input type="text" id="modal-task-title" class="teacher-input" placeholder="输入任务名称">
            </div>
            <div class="teacher-form-group">
              <label>预估时长 (分钟)</label>
              <input type="number" id="modal-task-duration" class="teacher-input" value="150">
            </div>
            <div class="teacher-form-group">
              <label>任务说明与指导要求</label>
              <textarea id="modal-task-desc" class="teacher-textarea" placeholder="请输入任务的具体说明..."></textarea>
            </div>
          </div>
          <div class="teacher-modal-footer">
            <button class="modal-btn cancel" id="btn-cancel-task">取消</button>
            <button class="modal-btn submit" id="btn-submit-new-task">确认发布</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      const closeModal = () => modal.remove();
      modal.querySelector('#btn-close-task-modal').addEventListener('click', closeModal);
      modal.querySelector('#btn-cancel-task').addEventListener('click', closeModal);
      modal.querySelector('#btn-submit-new-task').addEventListener('click', () => {
        const classId = modal.querySelector('#modal-task-class').value;
        const title = modal.querySelector('#modal-task-title').value.trim();
        const desc = modal.querySelector('#modal-task-desc').value.trim();
        if (!title || !desc) { alert('⚠️ 请填齐任务标题与说明！'); return; }
        authManager.createTask(title, classId, desc);
        closeModal();
        renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
      });
    });

    container.querySelector('#btn-open-ann-modal').addEventListener('click', () => {
      document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="teacher-modal-card">
          <div class="teacher-modal-header">
            <div>
              <h3>发布课堂即时通知</h3>
              <p>向学生端推送广播消息与教学资源</p>
            </div>
            <button class="modal-close-btn" id="btn-close-ann-modal">✕</button>
          </div>
          <div class="teacher-modal-body">
            <div class="teacher-form-group">
              <label>关联任务</label>
              <select id="modal-ann-task" class="teacher-input">
                ${tasks.map(t => `<option value="${t.id}">${t.title}</option>`).join('')}
              </select>
            </div>
            <div class="teacher-form-group">
              <label>通知标题</label>
              <input type="text" id="modal-ann-title" class="teacher-input" placeholder="输入通知标题">
            </div>
            <div class="teacher-form-group">
              <label>通知正文</label>
              <textarea id="modal-ann-content" class="teacher-textarea" placeholder="输入推送给学生的通知内容..."></textarea>
            </div>
          </div>
          <div class="teacher-modal-footer">
            <button class="modal-btn cancel" id="btn-cancel-ann">取消</button>
            <button class="modal-btn submit" id="btn-submit-new-ann">广播发布</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      const closeModal = () => modal.remove();
      modal.querySelector('#btn-close-ann-modal').addEventListener('click', closeModal);
      modal.querySelector('#btn-cancel-ann').addEventListener('click', closeModal);
      modal.querySelector('#btn-submit-new-ann').addEventListener('click', () => {
        const taskId = modal.querySelector('#modal-ann-task').value;
        const title = modal.querySelector('#modal-ann-title').value.trim();
        const content = modal.querySelector('#modal-ann-content').value.trim();
        if (!title || !content) { alert('⚠️ 请填齐通知标题与内容！'); return; }
        authManager.publishAnnouncement(taskId, title, content);
        closeModal();
        renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
      });
    });
  }

  function renderHeader(state, currentUser, announcements, onStageChange, onSpeedChange, onLogout, onSwitchTeacher, onOpenAnnModal) {
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
    if (speedSelect) speedSelect.addEventListener('change', (e) => onSpeedChange(Number(e.target.value)));

    const logoutBtn = header.querySelector('#btn-user-logout');
    if (logoutBtn) logoutBtn.addEventListener('click', () => onLogout());

    const switchBtn = header.querySelector('#btn-switch-teacher-view');
    if (switchBtn) switchBtn.addEventListener('click', () => onSwitchTeacher());

    const annBell = header.querySelector('#btn-header-ann-bell');
    if (annBell) annBell.addEventListener('click', () => onOpenAnnModal());
  }

  function renderCanvas(state, handlers) {
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

  function renderChat(state) {
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

  // ==========================================
  // 5. APPLICATION CONTROLLER
  // ==========================================
  const STORAGE_KEY_CHAT = 'jizhi_clean_chat_v4';
  const STORAGE_KEY_STAGE1 = 'jizhi_clean_s1_v4';
  const STORAGE_KEY_STAGE2 = 'jizhi_clean_s2_v4';
  const STORAGE_KEY_STAGE3 = 'jizhi_clean_s3_v4';
  const STORAGE_KEY_STAGE_CURRENT = 'jizhi_clean_current_stage_v4';
  // Auto-detect server URL: If running on cloud/HTTP, use current host; otherwise fallback to localhost or custom IP
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
        try { this.state.stage1 = { ...this.state.stage1, ...JSON.parse(savedS1) }; } catch (e) {}
      }

      const savedS2 = localStorage.getItem(STORAGE_KEY_STAGE2);
      if (savedS2) {
        try { this.state.stage2 = { ...this.state.stage2, ...JSON.parse(savedS2) }; } catch (e) {}
      }

      const savedS3 = localStorage.getItem(STORAGE_KEY_STAGE3);
      if (savedS3) {
        try { this.state.stage3 = { ...this.state.stage3, ...JSON.parse(savedS3) }; } catch (e) {}
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
        this.bc = new BroadcastChannel('jizhi_clean_sync_channel');
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
      if (this.bc) this.bc.postMessage({ type: 'CHAT_UPDATE', chatLogs: this.state.chatLogs });
      this.pushToServer();
    }

    syncStage1() {
      localStorage.setItem(STORAGE_KEY_STAGE1, JSON.stringify(this.state.stage1));
      if (this.bc) this.bc.postMessage({ type: 'STAGE1_UPDATE', stage1: this.state.stage1 });
      this.pushToServer();
    }

    syncStage2() {
      localStorage.setItem(STORAGE_KEY_STAGE2, JSON.stringify(this.state.stage2));
      if (this.bc) this.bc.postMessage({ type: 'STAGE2_UPDATE', stage2: this.state.stage2 });
      this.pushToServer();
    }

    syncStage3() {
      localStorage.setItem(STORAGE_KEY_STAGE3, JSON.stringify(this.state.stage3));
      if (this.bc) this.bc.postMessage({ type: 'STAGE3_UPDATE', stage3: this.state.stage3 });
      this.pushToServer();
    }

    syncStageChange(stage) {
      localStorage.setItem(STORAGE_KEY_STAGE_CURRENT, stage);
      if (this.bc) this.bc.postMessage({ type: 'STAGE_CHANGE', stage });
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
              sessionStorage.setItem(STORAGE_KEY_USER, JSON.stringify(studentA));
              localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(studentA));
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
      sessionStorage.setItem(STORAGE_KEY_USER, JSON.stringify(teacher));
      localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(teacher));
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

  // ==========================================
  // 6. GLOBAL INSTANTIATION & AUTO-DISMISS LOADER
  // ==========================================
  function launchApp() {
    try {
      window.app = new App();
    } catch (e) {
      console.error('[JIZHI Launch Error]:', e);
    }
    const loader = document.getElementById('app-loading-screen');
    if (loader) {
      loader.style.opacity = '0';
      setTimeout(() => { loader.style.display = 'none'; }, 200);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', launchApp);
  } else {
    launchApp();
  }
})();
