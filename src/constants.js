/**
 * JIZHI (集智) Platform - Constants & Initial State
 * Standard ES Module (ESM)
 * Version: 2.1.0 (2026-08-23)
 */

export const APP_VERSION = '20260901_v1118';
export const APP_BUILD_DATE = '2026-08-26';

export const STORAGE_KEY_USER = 'jizhi_pure_v10_user';
export const STORAGE_KEY_USERS_DB = 'jizhi_pure_v10_users_db';
export const STORAGE_KEY_CLASSES = 'jizhi_pure_v10_classes_db';
export const STORAGE_KEY_TASKS = 'jizhi_pure_v10_tasks_db';
export const STORAGE_KEY_ANNOUNCEMENTS = 'jizhi_pure_v10_ann_db';

export const DefaultClasses = [];

// 🧹 唯一种子：教师端管理账号（1001/老师）。测试学生一律不写入，教师可在教务界面自行增删学生
export const DefaultUsers = [
  { id: '1001', username: '1001', studentCode: '1001', password: '123', name: '老师', role: 'teacher', avatar: '👩‍🏫' }
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
  teacherActiveTab: 'view_architecture', // 'view_architecture', 'view_publishing', 'view_monitoring'
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
    label: '实证实验方案',
    icon: '🧪',
    badge: '实证研究 / 实验设计',
    summary: '涵盖研究假设、自变量/因变量操作化、对照实验控制与测量工具',
    modules: [
      { key: 'background', title: '一、研究背景与意义', color: '#2563eb', defaultMinutes: 25 },
      { key: 'literature', title: '二、文献综述与理论基础', color: '#0284c7', defaultMinutes: 30 },
      { key: 'questions', title: '三、研究问题与假设', color: '#059669', defaultMinutes: 25 },
      { key: 'method', title: '四、实验设计与研究方法', color: '#7c3aed', defaultMinutes: 40 },
      { key: 'reflection', title: '五、预期效果与局限反思', color: '#d97706', defaultMinutes: 20 },
      { key: 'references', title: '六、参考文献著录', color: '#475569', defaultMinutes: 10 }
    ]
  },
  instructional: {
    key: 'instructional',
    label: '教学设计方案',
    icon: '📐',
    badge: '教学设计 / 课程方案',
    summary: '涵盖学情分析、教学目标(布鲁姆层级)、活动设计、技术融合与教学评价',
    modules: [
      { key: 'background', title: '一、学情分析与教学背景', color: '#2563eb', defaultMinutes: 25 },
      { key: 'literature', title: '二、教学目标与重难点设定', color: '#0284c7', defaultMinutes: 25 },
      { key: 'questions', title: '三、教学策略与技术工具融合', color: '#059669', defaultMinutes: 30 },
      { key: 'method', title: '四、教学过程与活动设计', color: '#7c3aed', defaultMinutes: 40 },
      { key: 'reflection', title: '五、教学评价与反思改进', color: '#d97706', defaultMinutes: 20 },
      { key: 'references', title: '六、教案资源与参考文献', color: '#475569', defaultMinutes: 10 }
    ]
  },
  history: {
    key: 'history',
    label: '教育技术发展史与综述',
    icon: '📜',
    badge: '学术发展史 / 理论综述',
    summary: '涵盖历史分期脉络、理论范式更迭(行为-认知-建构)、技术演变与AI启示',
    modules: [
      { key: 'background', title: '一、引言与历史脉络分期', color: '#2563eb', defaultMinutes: 25 },
      { key: 'literature', title: '二、核心理论范式流变分析', color: '#0284c7', defaultMinutes: 35 },
      { key: 'questions', title: '三、关键技术与媒体演变案例', color: '#059669', defaultMinutes: 30 },
      { key: 'method', title: '四、学术争鸣与成败反思', color: '#7c3aed', defaultMinutes: 30 },
      { key: 'reflection', title: '五、对当下AI时代的启示与展望', color: '#d97706', defaultMinutes: 20 },
      { key: 'references', title: '六、经典文献与史料著录', color: '#475569', defaultMinutes: 10 }
    ]
  }
};

export function getGenrePromptDescriptor(taskType = 'experiment') {
  if (taskType === 'instructional') {
    return `【当前任务写作文体：📐 教学设计方案】
- 核心考查维度：①学情分析与教学目标(布鲁姆认知层级)一致性；②教学活动与技术工具融合度(TPACK)；③教学过程闭环与形成性/总结性评价设计；④学生课堂认知负荷控制。
- 专家身份口吻：请以【教学设计与课程教学论资深专家】口吻展开指导、质检与答辩质询，重点切入教学策略的课堂落地可行性与技术赋能实效。`;
  }
  if (taskType === 'history') {
    return `【当前任务写作文体：📜 教育技术发展史与理论综述】
- 核心考查维度：①历史分期脉络清晰度与划分依据；②核心理论范式演进深度(行为主义-认知主义-建构主义-连接主义)；③典型教育技术/媒体演变案例论据充分性；④学术争鸣与对当下生成式AI时代的深刻启示。
- 专家身份口吻：请以【教育技术史与学术史资深教授】口吻展开指导、质检与答辩质询，重点切入史料论据客观性、理论流变严密性与现实启示价值。`;
  }
  return `【当前任务写作文体：🧪 实证实验方案 / 研究设计】
- 核心考查维度：①核心概念与研究假设逻辑对齐；②自变量/因变量操作化界定与实验组对照控制；③测量工具信效度检验与数据收集严密性；④真实教学环境下的实施可行性与预期局限。
- 专家身份口吻：请以【实证研究方法与实验设计资深教授】口吻展开指导、质检与答辩质询，重点切入实验变量控制的严密性与学术规范。`;
}
