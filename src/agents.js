/**
 * JIZHI (集智) Platform - Agent Service & Coze Client
 * Standard ES Module (ESM)
 */

import { AgentProfiles, PresetMessages, STORAGE_KEY_USER } from './constants.js?v=20260904_v2188';

export async function callCozeAgentAPI(botKey, userQuery, currentContext = {}) {
  const profile = AgentProfiles[botKey] || { name: '智能体专家', avatar: '🤖' };
  const botId = profile && profile.cozeBotId ? profile.cozeBotId : '7673571806476828713';

  // ⚡ 直接透传结构化指令，避免与服务端 PromptFactory 二次套娃
  let enrichedQuery = userQuery;

  // 🛡️ 会话凭证：从当前登录态读取 userId + session token，供服务端鉴权扣子代理
  let sessionUserId = currentContext.userId || '';
  let sessionToken = '';
  try {
    const rawUser = sessionStorage.getItem(STORAGE_KEY_USER);
    if (rawUser) {
      const u = JSON.parse(rawUser);
      sessionUserId = sessionUserId || u.id || 'student_user';
      sessionToken = u.activeSessionId || u.token || '';
    }
  } catch (e) {}

  // 🛡️ 高可用调度核心：最多自动重试 3 次，化解偶发网络丢包与服务端瞬态抖动
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
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
          actual_doc: currentContext.actualDoc || currentContext.actual_doc || ''
        })
      });

      if (resp.ok) {
        const data = await resp.json();
        if (data && data.success && data.reply && data.reply.trim().length > 0) {
          return data.reply.trim();
        }
        // 如果后端处于生成中，采用阶梯式敏捷轮询：前 10 次 100ms 极速响应，后续 300ms/500ms 稳健等待 (最长支持 45 秒超长生成)
        if (data && data.in_progress && data.chat_id && data.conversation_id) {
          const chatId = data.chat_id;
          const convId = data.conversation_id;
          const targetBotId = data.bot_id || botId;
          const isLongDoc = (currentContext.stage === 'stage2' || currentContext.stage === 'stage3' || (currentContext.actualDoc && currentContext.actualDoc.length > 500) || (currentContext.actual_doc && currentContext.actual_doc.length > 500) || (userQuery && userQuery.length > 1000));
          const maxRetries = isLongDoc ? 150 : 85; // 5000字全文质检支持长达 65 秒；阶段一公约提炼支持 30 秒，绝不提前掐断
          for (let p = 0; p < maxRetries; p++) {
            const pollInterval = p < 10 ? 100 : (p < 50 ? 300 : 500);
            await new Promise(r => setTimeout(r, pollInterval));
            try {
              const pollRes = await fetch(`sync.php?action=coze_poll&chat_id=${encodeURIComponent(chatId)}&conversation_id=${encodeURIComponent(convId)}&bot_id=${encodeURIComponent(targetBotId)}&userId=${encodeURIComponent(sessionUserId)}&token=${encodeURIComponent(sessionToken)}&nocache=${Date.now()}`);
              if (pollRes.ok) {
                const pollData = await pollRes.json();
                if (pollData && pollData.completed) {
                  if (pollData.reply && pollData.reply.trim().length > 0) {
                    return pollData.reply.trim();
                  }
                  break;
                }
              }
            } catch (err) {
              console.warn('[Coze Poll] 轮询偶发抖动 (可自愈):', err.message);
            }
          }
        }
      }
    } catch (e) {
      console.warn(`[Coze API] 第 ${attempt}/${maxAttempts} 次请求偶发异常:`, e.message);
    }

    // 若当前重试未成功且还有剩余次数，做指数退避等待后自动进行下一次重试 (600ms, 1200ms)
    if (attempt < maxAttempts) {
      await new Promise(r => setTimeout(r, attempt * 600));
    }
  }

  return null;
}

export { AgentProfiles, PresetMessages };
