/**
 * JIZHI (集智) Platform - Agent Service & Coze Client
 * Standard ES Module (ESM)
 */

import { AgentProfiles, PresetMessages, STORAGE_KEY_USER } from './constants.js?v=20260823_v188';

export async function callCozeAgentAPI(botKey, userQuery, currentContext = {}) {
  const profile = AgentProfiles[botKey];
  const botId = profile && profile.cozeBotId ? profile.cozeBotId : '7673571806476828713';
  
  // 构建针对当前写作阶段的提示词上下文
  let enrichedQuery = userQuery;
  const docSnippet = currentContext.actualDoc ? `\n【小组当前正文真实草稿（字数：${currentContext.actualDoc.length}）】：\n${currentContext.actualDoc.slice(0, 1200)}` : '';
  if (currentContext.stage) {
    enrichedQuery = `【协作写作阶段: ${currentContext.stage === 'stage1' ? '阶段一 (选题与公约)' : currentContext.stage === 'stage2' ? '阶段二 (正文撰写)' : '阶段三 (答辩与质询)'}】\n【课题: ${currentContext.topic || '未定'}】${docSnippet}\n【用户对话/审阅指令】: ${userQuery}`;
  }

  // 🛡️ 会话凭证：从当前登录态读取 userId + session token，供服务端鉴权扣子代理
  let sessionUserId = currentContext.userId || '';
  let sessionToken = '';
  try {
    const rawUser = sessionStorage.getItem(STORAGE_KEY_USER);
    if (rawUser) {
      const u = JSON.parse(rawUser);
      sessionUserId = sessionUserId || u.id || u.username || u.studentCode || 'student_user';
      sessionToken = u.activeSessionId || u.token || '';
    }
  } catch (e) {}

  try {
    const resp = await fetch('sync.php?action=coze_chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bot_key: botKey,
        bot_id: botId,
        user_id: sessionUserId || 'student_user',
        userId: sessionUserId,
        token: sessionToken,
        query: enrichedQuery,
        stage: currentContext.stage || '',
        topic: currentContext.topic || '',
        actual_doc: currentContext.actualDoc || ''
      })
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data && data.success && data.reply && data.reply.trim().length > 0) {
        return data.reply.trim();
      }
      // 如果后端处于生成中，采用阶梯式敏捷轮询：前 10 次 300ms 极速响应，后续 600ms 平稳等待
      if (data && data.in_progress && data.chat_id && data.conversation_id) {
        const chatId = data.chat_id;
        const convId = data.conversation_id;
        const targetBotId = data.bot_id || botId;
        const maxRetries = 30; // 阶梯敏捷轮询：最长容忍 ~15 秒黄金响应区间，绝不让学生长时间干等！
        for (let p = 0; p < maxRetries; p++) {
          const pollInterval = p < 10 ? 300 : 600;
          await new Promise(r => setTimeout(r, pollInterval));
          try {
            const pollRes = await fetch(`sync.php?action=coze_poll&chat_id=${encodeURIComponent(chatId)}&conversation_id=${encodeURIComponent(convId)}&bot_id=${encodeURIComponent(targetBotId)}&userId=${encodeURIComponent(sessionUserId)}&token=${encodeURIComponent(sessionToken)}&nocache=${Date.now()}`);
            if (pollRes.ok) {
              const pollData = await pollRes.json();
              if (pollData && pollData.completed) {
                if (pollData.reply && pollData.reply.trim().length > 0) {
                  return pollData.reply.trim(); // 一旦生成完毕立刻秒回，绝不多等 1 毫秒！
                }
                break;
              }
            }
          } catch (err) {
            console.warn('[Coze Poll] 轮询请求异常:', err.message);
          }
        }
      }
    }
  } catch (e) {
    console.warn('Coze API fallback:', e);
  }
  return null;
}

export { AgentProfiles, PresetMessages };
