# 集智 JIZHI 平台 — 版本更新日志

**版本号**: v2.2.0
**更新时间**: 2026-08-23
**更新类型**: 安全修复 + Bug 修复 + 代码质量优化

---

## 🧹 默认账号与测试组彻底清除 (本轮新增)

### 18. 三个默认账号彻底移除
- **问题**: `u_teacher1/1001/老师`、`liming`、`studentA@jizhi.edu` 等历史测试种子账号残留在 `constants.js DefaultUsers`、`server.py default_meta`、`sync.php defaultMeta` 三处，删除后会死灰复燃
- **修复**: 三处 seed 全部置空 `[]`；同步清除 auth.js / app.js / teacher.js 中对 `1001`、`u_teacher`、`u_teacher1`、`liming`、`studentA` 的硬编码引用（教师判定、组长判定、登录匹配、教师名强制覆盖）

### 19. 测试组/强制同组逻辑移除
- **问题**: `teacher.js` 中对“测试组”的特殊识别与强制重命名（`第 1 协作小组 (测试组)`），以及 `app.js` 中 `isGroupLeader` 硬编码 `A/1001/leader`、教师“预览学生视角”硬编码 `liming/studentA` 账号
- **修复**: 测试组命名改为按序编号；组长判定改为 `role === 'leader' || roleTitle 含 '组长'`；预览视角改为取班级第一名真实学生

### 20. Yjs “already imported” 重复实例修复 (index.html)
- **问题**: `index.html` 以 `yjs.js?v=...` 引入，而 `y-websocket.js`/`y-quill.js` 内部以 `./yjs.js`（无参数）相对引入，URL 不一致导致 Yjs 被加载两次、`instanceof` 构造检查失效
- **修复**: 统一去除三个 Yjs 库的 `?v=` 查询参数，确保单一模块实例

### 21. 登录界面提示与静态资源缓存
- **问题**: 浏览器缓存陈旧 `login.js`/`yjs.mjs`，导致已删除的 placeholder 提示与旧报错反复出现
- **修复**: `server.py end_headers` 对静态资源统一追加 `Cache-Control: no-store`；入口 `app.js`/`css` 版本戳升级 `v6`

### 22. WebSocket 广播阻塞 IO 拆锁 (server.py)
- **问题**: 广播 `sendall` 在持有全局 `WS_LOCK` 期间执行，单个慢客户端阻塞全部房间的帧下发（头阻塞）
- **修复**: 新增每连接独立发送锁 `_send_lock_for()`，仅锁目标 socket，连接断开时回收锁

### 23. sync.php 教师鉴权硬编码清理
- **问题**: `verifyTeacherSession` 无 DB 时直接放行 `u_teacher/1001/teacher`，SQL 中 `OR id='u_teacher' OR username='1001'`
- **修复**: 无 DB 时 Fail-Closed 返回 false；SQL 仅按 `role='teacher'` 判定

---

## 🔴 P0 — 高危安全与功能修复

### 1. 路径遍历漏洞防护 (server.py)
- **问题**: `taskId` 和 `groupId` 直接从 URL 拼接到文件路径，攻击者可通过 `?taskId=../../../etc/&groupId=passwd` 读写服务器任意文件
- **修复**: 新增 `_safe_id()` 函数，仅允许字母、数字、下划线、短横线。全部 4 处路由（SSE stream、snapshot GET、send_chat、snapshot POST）均已加固

### 2. 全局数据库无认证覆盖 (server.py)
- **问题**: `action=save_global_meta` 端点任何人都可以覆盖所有用户账号数据
- **修复**: 增加基础会话验证，要求请求体携带 `userId` 和 `token`，并与 `SESSION_LOCKS` 比对

### 3. Session 登录路由冲突死代码 (server.py)
- **问题**: `action=session_login` 和 `/api/session/login` 共用同一 `if` 分支（L552），导致第二个独立路由（L626，含 180 秒防顶号逻辑）永远无法执行
- **修复**: 将 `action=session_login` 从合并条件中分离，两个路由各自独立处理

### 4. sanitizeAndDeduplicateGroups 空转 (auth.js)
- **问题**: `isModified` 永远为 `false`，清洗结果从未持久化到 localStorage，函数实际上什么都没做
- **修复**: 在每次修正（补 id、补 name、补 members 数组）时同步设置 `isModified = true`

---

## 🟠 P1 — 重要功能修复

### 5. hasMeetingDone 未定义 ReferenceError (app.js L1090)
- **问题**: 变量 `hasMeetingDone` 在作用域中未声明，导致阶段二终审收尾雷达功能完全失效
- **修复**: 添加 `const hasMeetingDone = !!(s2.actionPlan && s2.actionPlan.isGenerated)` 声明

### 6. handleLogout 重复定义 (app.js L1648 & L3516)
- **问题**: 第二个简单版定义覆盖第一个完整版，登出时不清理 presence 数据、不推送云端同步
- **修复**: 移除第二个重复定义，保留含 presence 清理与云端推送的完整版本

### 7. updateContributionUi 重复定义 (app.js L258 & L1840)
- **问题**: 第二版使用 class 选择器（`.contrib-bars`），第一版使用 getElementById（`#stage2-contrib-bars`），后者覆盖前者导致逻辑丢失
- **修复**: 移除第二个重复定义，保留 getElementById 精确选择器版本

### 8. 查找替换功能错位 (editor.js L774-783)
- **问题**: "替换当前"按钮实际执行全部替换（`split().join()`）；"全部替换"按钮没有事件监听器
- **修复**: 
  - "替换当前"改为 `indexOf + substring` 仅替换第一个匹配
  - 新增"全部替换"按钮的事件监听器
  - 新增"查找下一个"按钮的事件监听器与匹配计数显示

### 9. DOM splitText 内存泄漏 (editor.js L964)
- **问题**: 远程光标每次更新（120ms）都调用 `splitText()` 分裂文本节点且从不合并，DOM 碎片无限增长
- **修复**: 在清除旧光标组件后调用 `editor.normalize()` 合并相邻文本节点

### 10. isInitialPullDone 竞态 (sync.js L134)
- **问题**: 在 `await res.json()` 之前设置标志，若 JSON 解析失败，推送保护锁被错误解除
- **修复**: 将 `isInitialPullDone = true` 移至 `res.json()` 成功解析之后

### 11. initWebSocket 误导性空方法 (sync.js L47-52)
- **问题**: 方法名暗示会初始化 WebSocket，但内部只调用 `updateScopeKeys()`
- **修复**: 重命名为 `refreshScopeKeys()` 并移除构造函数中的调用（`updateScopeKeys()` 已在上方直接调用）

---

## 🟡 P2 — 中等优先级修复

### 12. 通知内容 XSS 防护 (app.js)
- **问题**: `selectedAnn.title`、`selectedAnn.content`、`selectedAnn.author` 等字段直接插入 innerHTML，含 `<script>` 的通知会在学生端执行
- **修复**: 导入 `escapeHtml`，对所有通知字段进行 HTML 实体转义

### 13. 任务卡片 XSS 防护 (student-portal.js)
- **问题**: `t.title`、`t.targetGroupName`、`t.instructions` 直接插入 innerHTML
- **修复**: 导入 `escapeHtml`，对所有任务字段进行转义

### 14. JWT jti 固定后缀 (server.py L66)
- **问题**: `jti` 使用固定后缀 `1234`，同一秒内生成的 JWT jti 完全相同，违反 RFC 7519 防重放规范
- **修复**: 改用 `os.urandom(4).hex()` 生成随机后缀

### 15. SSE 断开清理不完整 (server.py L396-398)
- **问题**: `finally` 块只清理 `SSE_CLIENTS[groupId]`，未清理 `SSE_CLIENTS[channel_key]`，导致已断开客户端队列持续积累
- **修复**: 增加 `channel_key` 维度的清理

### 16. 登录页 placeholder 提示移除 (login.js)
- **问题**: 登录输入框显示"请输入工号或学号"和"请输入登录密码"的提示文字
- **修复**: 清空两个输入框的 placeholder 属性

### 17. 轮询异常静默吞掉 (agents.js L58)
- **问题**: Coze API 轮询的空 catch 导致错误完全静默
- **修复**: 添加 `console.warn` 输出轮询异常信息

---

## 📊 修改文件清单

| 文件 | 修改项数 | 涉及修复编号 |
|------|---------|------------|
| `server.py` | 8 处 | #1, #2, #3, #14, #15 |
| `src/auth.js` | 1 处 | #4 |
| `src/app.js` | 5 处 | #5, #6, #7, #12 |
| `src/editor.js` | 2 处 | #8, #9 |
| `src/sync.js` | 2 处 | #10, #11 |
| `src/student-portal.js` | 3 处 | #13 |
| `src/login.js` | 2 处 | #16 |
| `src/agents.js` | 1 处 | #17 |
| `js/bundle.js` | 全量重编译 | 所有前端修复 |

**总计**: 9 个源文件修改，17 项问题修复

---

## ⚠️ 未修复项说明（57 项审查报告最终状态）

57 项审查报告已**全部逐一对齐修复**。仅以下 1 项按用户明确要求保留原逻辑，其余全部修复或评估为无需改动：

| 编号 | 问题 | 最终处理 |
|------|------|----------|
| P0-6 | auth.js 万能密码后门 | 用户明确要求保留 `!user.password && pwd === '123'` 逻辑（已确认保留） |
| P0-7 | stream.php SSE 失效 | ✅ 已重写 stream.php（完整 SSE 循环 + 心跳 + 快照） |
| P1-13/14/15/16/18 | 轮询/竞态类 | ✅ 已逐一修复（单轮询循环、队列计数、阶段守卫） |
| P2-27 | 贡献度双重计数 | ✅ 改为单键取值 `(contribs[m.id] || contribs[m.studentCode] || 0)` |
| P2-25 | DOM diff 陈旧引用 | ✅ 评估无功能性缺陷：`Array.from(childNodes)` 返回活节点引用，每次同步前重新快照 |
| P1-11 | editor.js try-catch | ✅ 评估为误报：文件 try/catch 配平，无泄漏 |

---

## 🟢 本轮收尾修复（2026-08-23 追加）

### 24. renderChat 渲染副作用消除 (editor.js #38)
- **问题**: `renderChat` 中 `state.chatLogs[stg] = state.chatLogs[stg].filter(...)` 在渲染函数内改写状态，快速重渲染可能丢消息
- **修复**: 改为仅过滤展示的 `forEach` 遍历，绝不改写 `state.chatLogs`

### 25. 重置广播鉴权加固 (sync.js #43)
- **问题**: `handleRemoteSync` 中裸 `isReset` 分支无条件 `_applyReset`，任意客户端可伪造重置；且教师重置成功路径调用的 `broadcastLocal` 方法未定义（抛 TypeError）
- **修复**: 移除裸 `isReset` 分支，仅保留 `resetSeq 严格递增` 的单调保护；补上 `broadcastLocal(data)` 方法（经 BroadcastChannel 广播 resetSeq）

### 26. 情绪安抚定时巡检 (app.js #45)
- **问题**: 负向情绪安抚仅在“发送消息”时检测，静默期无同伴回应时安抚不触发
- **修复**: 提取 `checkEmotionComfort()` 方法，`initTimer` 秒级轮询中同步巡检

---

*此更新日志由代码审查工具生成于 2026-08-23*
