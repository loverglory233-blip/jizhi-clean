/**
 * JIZHI (集智) Platform - Constants & Initial State
 * Standard ES Module (ESM)
 * Version: 2.1.0 (2026-08-23)
 */

export const APP_VERSION = '20260830_v907';
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
