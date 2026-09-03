/**
 * JIZHI (集智) Platform - Constants & Initial State
 * Standard ES Module (ESM)
 * Version: 2.1.0 (2026-08-23)
 */

export const APP_VERSION = '20260903_v1800';
export const APP_BUILD_DATE = '2026-09-03';

export const STORAGE_KEY_USER = 'jizhi_pure_v10_user';
export const STORAGE_KEY_USERS_DB = 'jizhi_pure_v10_users_db';
export const STORAGE_KEY_CLASSES = 'jizhi_pure_v10_classes_db';
export const STORAGE_KEY_TASKS = 'jizhi_pure_v10_tasks_db';
export const STORAGE_KEY_ANNOUNCEMENTS = 'jizhi_pure_v10_ann_db';

export const DefaultClasses = [];

// 🧹 唯一种子：教师端管理账号（1001/老师）。测试学生一律不写入，教师可在教务界面自行增删学生
export const DefaultUsers = [
  { id: '1001', name: '老师', role: 'teacher', password: '123', avatar: '👩‍🏫' }
];

export const DefaultTasks = [];
export const DefaultAnnouncements = [];
export const DefaultReferencePapers = [];

export const AgentProfiles = {
  auctioneer: { id: 'auctioneer', name: '拍卖师 Agent', roleTitle: '头脑风暴 · 学术拍卖师', avatar: '🎪', color: '#8b5cf6', stage: 'stage1', cozeBotId: '7673571806476828713' },
  managingEditor: { id: 'managingEditor', name: '责任编辑 Agent', roleTitle: '责任编辑 · 过程学伴', avatar: '🤝', color: '#10b981', stage: 'stage2', cozeBotId: '7673934462736138294' },
  reviewingEditor: { id: 'reviewingEditor', name: '审稿编辑 Agent', roleTitle: '审稿编辑 · 质量把关', avatar: '📝', color: '#3b82f6', stage: 'stage2', cozeBotId: '7673943522542141476' },
  proponent: { id: 'proponent', name: '正方委员 Agent', roleTitle: '答辩委员会 · 肯定支持者', avatar: '🟢', color: '#22c55e', stage: 'stage3', cozeBotId: '7673951703640899627' },
  opponent: { id: 'opponent', name: '反方委员 Agent', roleTitle: '答辩委员会 · 尖锐质疑者', avatar: '🔴', color: '#ef4444', stage: 'stage3', cozeBotId: '7673956980344160307' },
  neutral: { id: 'neutral', name: '中间委员 Agent', roleTitle: '答辩委员会 · 裁决引导者', avatar: '🟡', color: '#eab308', stage: 'stage3', cozeBotId: '7673955430510870580' }
};

export const PresetMessages = {
  stage1: [],
  stage2: [],
  stage3: []
};

export const InitialState = {
  currentStage: 'stage1',
  groupMaxStage: 'stage1',
  currentUser: null,
  isFinalSubmitted: false,
  studentViewMode: 'task_list', // 默认强制进入任务大厅，点击后再进入协作工作台
  activeTaskId: null,
  timer: {
    elapsedSeconds: 0,
    speed: 1,
    isRunning: true,
    startTimestamp: null
  },
  teacherLevel: 'dashboard', // 'dashboard' or 'class_workspace'
  teacherDashboardTab: 'classes', // 'classes' or 'global_students'
  teacherClassTab: 'students_groups', // 'students_groups', 'tasks_resources', 'live_monitoring'
  activeClassId: null,
  activeMonitorGroupId: null,
  members: {},

  stage1: {
    mergedTitle: '',
    votes: {},
    hasVoted: {},
    proposals: [],
    contract: {
      isConfirmed: false,
      confirmedMembers: {},
      timeAllocations: {
        background: 25,
        literature: 30,
        questions: 25,
        method: 40,
        reflection: 20,
        references: 10
      },
      taskAssignments: {}
    }
  },

  stage2: {
    unifiedContent: '',
    memberContributions: {},
    isDraftConfirmed: false,
    confirmedMembers: {},
    actionPlan: {
      isGenerated: false,
      items: []
    }
  },

  stage3: {
    activeTab: 'defense', // 'defense' or 'editor'
    feedbackItems: [],
    isRevisionConfirmed: false,
    confirmedMembers: {}
  },

  presence: {},

  chatLogs: {
    stage1: [],
    stage2: [],
    stage3: []
  }
};

export const TASK_GENRE_CONFIGS = {
  experiment: {
    key: 'experiment',
    label: '实证研究方案',
    icon: '🧪',
    badge: '实证研究 / 实验设计',
    summary: '涵盖研究假设/问题、核心概念界定、方案设计、测量工具与局限反思',
    stage1Title: '阶段一：学术拍卖会',
    stage2Title: '阶段二：学术编辑部',
    stage3Title: '阶段三：答辩擂台',
    meetingTitle: '半程编辑会议',
    agentNames: {
      auctioneer: '学术拍卖师',
      managingEditor: '责任编辑',
      reviewingEditor: '审稿编辑',
      proponent: '正方委员',
      opponent: '反方委员',
      neutral: '中间委员'
    },
    modules: [
      { key: 'background', title: '一、研究背景与意义', color: '#2563eb', defaultMinutes: 15 },
      { key: 'literature', title: '二、文献综述', color: '#0284c7', defaultMinutes: 20 },
      { key: 'questions', title: '三、研究问题与假设', color: '#059669', defaultMinutes: 15 },
      { key: 'method', title: '四、研究设计与方法', color: '#7c3aed', defaultMinutes: 35 },
      { key: 'reflection', title: '五、研究设计的不足与反思', color: '#d97706', defaultMinutes: 15 },
      { key: 'references', title: '六、参考文献', color: '#475569', defaultMinutes: 10 }
    ]
  },
  instructional: {
    key: 'instructional',
    label: '教学设计方案',
    icon: '📐',
    badge: '教学设计 / 优质课方案',
    summary: '涵盖教材学情、教学目标重难点、核心探究过程、评价与反思',
    stage1Title: '阶段一：备课工作坊',
    stage2Title: '阶段二：集体备课室',
    stage3Title: '阶段三：答辩评审会',
    meetingTitle: '半程磨课会议',
    agentNames: {
      auctioneer: '备课引导师',
      managingEditor: '备课组长',
      reviewingEditor: '教研专家',
      proponent: '正方评审专家',
      opponent: '反方质询专家',
      neutral: '答辩委员会主席'
    },
    modules: [
      { key: 'background', title: '一、教材与学情分析', color: '#2563eb', defaultMinutes: 15 },
      { key: 'literature', title: '二、教学目标与重难点', color: '#0284c7', defaultMinutes: 20 },
      { key: 'questions', title: '三、情境创设与导入', color: '#059669', defaultMinutes: 15 },
      { key: 'method', title: '四、新知探究与建构', color: '#7c3aed', defaultMinutes: 35 },
      { key: 'reflection', title: '五、巩固练习与评价', color: '#d97706', defaultMinutes: 15 },
      { key: 'references', title: '六、板书设计与反思', color: '#475569', defaultMinutes: 10 }
    ]
  }
};

export function getAgentDisplayName(agentKey, taskType = 'experiment') {
  const cfg = TASK_GENRE_CONFIGS[taskType] || TASK_GENRE_CONFIGS.experiment;
  return (cfg.agentNames && cfg.agentNames[agentKey]) || AgentProfiles[agentKey]?.name || '智能体专家';
}

export function getGenrePromptDescriptor(taskType = 'experiment') {
  if (taskType === 'instructional') {
    return `【当前任务写作文体：📐 教学设计方案】
- 核心考查维度：①教材学情与教学目标(核心素养/认知层级)一致性；②情境创设、学生活动与新知探究闭环；③随堂检测、反馈与作业分层设计；④课堂认知负荷控制与实践可操作性。
- 专家身份口吻：请以【特级教师与教学设计教研专家】口吻展开指导、质检与答辩质询，重点切入教学过程的师生互动闭环与教学难点攻坚。`;
  }
  return `【当前任务写作文体：🧪 实证研究方案】
- 核心考查维度：①核心概念与研究问题/假设逻辑对齐；②研究方法与干预/调查方案严密性；③测量工具与数据收集流程严密性；④真实教学环境下的实施可行性与预期局限。
- 专家身份口吻：请以【实证研究方法与学术规范资深教授】口吻展开指导、质检与答辩质询，重点切入研究设计严密性与学术规范。`;
}
