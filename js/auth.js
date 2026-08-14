/**
 * Jizhi (集智) Multi-Agent Collaborative Writing Platform
 * Auth Manager - Support Name Pinyin Login & Real-Time Sync
 */

const STORAGE_KEY_USER = 'jizhi_current_user';
const STORAGE_KEY_USERS_DB = 'jizhi_users_db_v2';
const STORAGE_KEY_CLASSES = 'jizhi_classes_db';
const STORAGE_KEY_TASKS = 'jizhi_tasks_db';
const STORAGE_KEY_ANNOUNCEMENTS = 'jizhi_announcements_db';

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
    resources: [
      { name: '研究设计标准规范与格式指南.pdf', size: '1.8 MB', url: '#' },
      { name: '优秀研究设计案例参考.docx', size: '850 KB', url: '#' }
    ]
  }
];

const DefaultAnnouncements = [
  {
    id: 'ann_001',
    taskId: 'task_001',
    taskTitle: '《现代教育技术》期末协作研究设计方案编写',
    title: '📢 课题提案与时间合约确认提醒',
    content: '请各组在【学术拍卖会】阶段认真讨论课题观点与理由，并共同签署时间分配与分工合约。参考资料已附在下方。',
    attachment: { name: '学术研究设计导引指南.pdf', size: '2.1 MB' },
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    author: '张教授',
    readStatus: { 'group_1': false }
  }
];

export class AuthManager {
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
    const currentChatLogs = chatLogsState || JSON.parse(localStorage.getItem('jizhi_sync_chat_v4')) || {};
    
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
