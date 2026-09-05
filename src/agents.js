/**
 * JIZHI (集智) Platform - Agent Service & Coze Client
 * Standard ES Module (ESM)
 */

import { AgentProfiles, PresetMessages, STORAGE_KEY_USER } from './constants.js?v=20260905_v2629';

export async function callCozeAgentAPI(botKey, userQuery, currentContext = {}) {
  // 🛡️ 终极只读熔断器：一旦任务截止进入只读模式或已终稿归档，底层彻底熔断任何大模型调用与智能体生成
  if (typeof window !== 'undefined' && window.app && typeof window.app.isCurrentTaskReadOnly === 'function' && window.app.isCurrentTaskReadOnly()) {
    const isSubmitted = !!(window.app.state && window.app.state.isFinalSubmitted);
    const msg = isSubmitted 
      ? '🔒 本任务已提交终稿并归档，进入只读模式，智能体生成已锁定。' 
      : '⏰ 当前写作任务已超过预设截止时间进入只读模式！智能体提炼功能已暂停。请在教师端将本任务点击【延期任务】或【新建一个新任务】继续测试！';
    if (typeof window.showGlobalBannerNotice === 'function') {
      window.showGlobalBannerNotice('任务已截止/只读', msg, 'warning', 7000);
    } else {
      alert(msg);
    }
    return '';
  }

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

  // 🛡️ 高可用单次调用核心：严格执行 1 次请求，带 38 秒硬性超时熔断，绝不无限挂起
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timerId = controller ? setTimeout(() => controller.abort(), 38000) : null;

  try {
    const resp = await fetch('sync.php?action=coze_chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller ? controller.signal : undefined,
      body: JSON.stringify({
        bot_key: botKey,
        bot_id: botId,
        user_id: sessionUserId || 'student_user',
        userId: sessionUserId,
        token: sessionToken,
        query: enrichedQuery,
        stage: currentContext.stage || '',
        topic: currentContext.topic || '',
        actual_doc: currentContext.actualDoc || currentContext.actual_doc || '',
        prior_review: currentContext.priorReview || currentContext.prior_review || '',
        task_type: currentContext.taskType || currentContext.task_type || '',
        milestone_key: currentContext.milestoneKey || currentContext.milestone_key || '',
        scope_key: currentContext.scopeKey || currentContext.scope_key || (typeof window !== 'undefined' && window.app && typeof window.app.getGroupScopeKey === 'function' ? window.app.getGroupScopeKey() : '')
      })
    });

    if (timerId) clearTimeout(timerId);

    if (resp.ok) {
      const data = await resp.json();
      if (data && data.success && data.reply && data.reply.trim().length > 0) {
        return data.reply.trim();
      }

      // 🛡️ 明确捕获大模型配额耗尽与错误状态，弹窗提示，绝不静默无声转圈
      if (data && (!data.success || data.error_code === 4028 || (data.message && data.message.includes('quota')))) {
        const errorMsg = (data.error_code === 4028 || (data.message && data.message.includes('quota')))
          ? '⚠️ 扣子大模型调用额度已用尽（错误码 4028）。请开通或续费个人进阶版配额！'
          : (data.message || '智能体生成服务暂时无响应');
        console.error('[Coze API Error]', data);
        if (typeof window !== 'undefined' && window.showGlobalBannerNotice) {
          window.showGlobalBannerNotice('大模型配额提示', errorMsg, 'error', 8000);
        } else if (typeof window !== 'undefined' && window.app && typeof window.app.showGlobalBannerNotice === 'function') {
          window.app.showGlobalBannerNotice('大模型配额提示', errorMsg, 'error', 8000);
        }
        return '';
      }

      // 如果后端处于生成中，采用阶梯式敏捷轮询：前 10 次 100ms 极速响应，后续 300ms/500ms 稳健等待 (最长支持 45 秒超长生成)
      if (data && data.in_progress && data.chat_id && data.conversation_id) {
        const chatId = data.chat_id;
        const convId = data.conversation_id;
        const targetBotId = data.bot_id || botId;
        const isLongDoc = (currentContext.stage === 'stage2' || currentContext.stage === 'stage3' || (currentContext.actualDoc && currentContext.actualDoc.length > 500) || (currentContext.actual_doc && currentContext.actual_doc.length > 500) || (userQuery && userQuery.length > 1000));
        const maxRetries = isLongDoc ? 150 : 85;
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
    if (timerId) clearTimeout(timerId);
    console.warn(`[Coze API] 请求偶发异常/超时:`, e.message);
  }

  return null;
}

export { AgentProfiles, PresetMessages };
