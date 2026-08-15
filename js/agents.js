/**
 * Jizhi (集智) Multi-Agent Collaborative Writing Platform
 * Clean Academic Scaffolding Agent Profiles and Dynamic Scaffolding Guides
 */

export const AgentProfiles = {
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

export const PresetMessages = {
  stage1: [],
  stage2: [],
  stage3: []
};
