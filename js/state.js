/**
 * Jizhi (集智) Multi-Agent Collaborative Writing Platform
 * Clean Global State Management - Production Ready (No Mock Data)
 */

export const InitialState = {
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
    unifiedContent: `<h1>《研究设计方案》</h1><p><b>一、研究背景与意义</b></p><p>（请在此处阐述研究背景、现实痛点、理论价值与实践意义...）</p><p><br></p><p><b>二、研究问题与假设</b></p><p>（请在此处明确核心研究问题 RQ 与待检验的研究假设 H...）</p><p><br></p><p><b>三、文献综述</b></p><p>（请在此处梳理相关领域理论基础、国内外研究现状及已有研究局限...）</p><p><br></p><p><b>四、研究设计与方法</b></p><p>（请在此处详细说明实验设计、研究对象与样本、变量定义及测量工具量表...）</p><p><br></p><p><b>五、研究设计的不足与反思</b></p><p>（请在此处反思当前设计的潜在局限、威胁内部/外部效度的因素与改进预案...）</p><p><br></p><p><b>六、参考文献</b></p><p>（请在此处列出引用的学术文献规范条目...）</p>`,
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
  chatLogs: {
    stage1: [],
    stage2: [],
    stage3: []
  }
};
