/**
 * Jizhi (集智) Multi-Agent Collaborative Writing Platform
 * Teacher Control Portal
 */

export function renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView) {
  const currentUser = authManager.getCurrentUser();
  const tasks = authManager.getTasks();
  const announcements = authManager.getAnnouncements();
  const classes = authManager.getClasses();

  container.innerHTML = `
    <div class="teacher-portal-layout" style="height:100vh; display:flex; flex-direction:column; background:#f1f5f9;">
      <!-- Teacher Header -->
      <header class="app-header">
        <div class="brand-section">
          <div class="brand-logo">集智 JIZHI</div>
          <div class="brand-badge" style="background:#fef3c7; color:#d97706; border-color:#fde68a;">👩‍🏫 教师端管理中心</div>
        </div>

        <div class="teacher-info" style="display:flex; align-items:center; gap:12px; font-size:13px; color:#334155;">
          <span>班级: <b>${classes[0] ? classes[0].name : '现代教育技术班'}</b></span>
          <span>主讲教师: <b>${currentUser.name}</b></span>
          <button id="btn-switch-student-preview" class="header-icon-btn" style="background:#e0f2fe; color:#0284c7;">
            👀 切换至学生协作视角
          </button>
          <button id="btn-logout" class="header-icon-btn logout">
            退出登录
          </button>
        </div>
      </header>

      <!-- Main Content Grid -->
      <main class="teacher-content" style="flex:1; display:grid; grid-template-columns:1fr 1fr; gap:20px; padding:20px 24px; overflow-y:auto;">
        <!-- Left Panel: Task & Announcement Management -->
        <section class="teacher-left-panel" style="display:flex; flex-direction:column; gap:16px;">
          
          <div class="card">
            <div class="card-title" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
              <span style="font-weight:700; font-size:15px; color:#0f172a;">📢 课堂即时广播通知 (含教学资源与已读追踪)</span>
              <button id="btn-open-ann-modal" style="background:#10b981; border:none; color:white; padding:6px 12px; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer;">
                + 发布新通知
              </button>
            </div>

            <div class="announcement-history-list" style="display:flex; flex-direction:column; gap:10px; max-height:260px; overflow-y:auto;">
              ${announcements.map(a => `
                <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px;">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                    <span style="font-weight:700; color:#0284c7; font-size:13.5px;">${a.title}</span>
                    <span style="font-size:11px; color:#64748b;">${a.time}</span>
                  </div>
                  <div style="font-size:12.5px; color:#334155; margin-bottom:6px; line-height:1.5;">${a.content}</div>
                  
                  ${a.attachment ? `
                    <div style="font-size:11.5px; color:#7c3aed; background:#f5f3ff; padding:3px 8px; border-radius:4px; display:inline-block; margin-bottom:6px;">
                      📎 随附资源: <b>${a.attachment.name}</b> (${a.attachment.size})
                    </div>
                  ` : ''}

                  <div style="font-size:11px; color:#64748b; display:flex; gap:12px; border-top:1px dashed #e2e8f0; padding-top:6px;">
                    <span>已读小组: <b style="color:#16a34a;">${a.readStatus && a.readStatus['group_1'] ? '✅ 第1小组 (已读)' : '无'}</b></span>
                    <span>未读小组: <b style="color:#dc2626;">${a.readStatus && !a.readStatus['group_1'] ? '⚠️ 第1小组 (未读)' : '无'}</b></span>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="card">
            <div class="card-title" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
              <span style="font-weight:700; font-size:15px; color:#0f172a;">📌 协作写作任务发布</span>
              <button id="btn-open-task-modal" style="background:#0284c7; border:none; color:white; padding:6px 12px; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer;">
                + 发布新写作任务
              </button>
            </div>

            <div class="task-list-container" style="display:flex; flex-direction:column; gap:10px;">
              ${tasks.map(t => `
                <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:14px;">
                  <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-size:15px; font-weight:700; color:#0f172a;">${t.title}</span>
                    <span style="font-size:11px; color:#0284c7; background:#e0f2fe; padding:2px 8px; border-radius:10px; font-weight:600;">${t.className}</span>
                  </div>
                  <div style="font-size:12px; color:#64748b; margin:6px 0;">时长: ${t.durationMinutes} 分钟 | 发布时间: ${t.createdAt}</div>
                  <div style="font-size:13px; color:#334155; background:#ffffff; padding:10px; border-radius:6px; border-left:3px solid #0284c7; line-height:1.5;">
                    <b style="color:#0284c7;">任务说明:</b> ${t.instructions}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </section>

        <!-- Right Panel: Group Monitor & Excel Export -->
        <section class="teacher-right-panel">
          <div class="card" style="height:100%;">
            <div class="card-title" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
              <span style="font-weight:700; font-size:15px; color:#0f172a;">📊 班级各组写作状态监控与数据导出</span>
              <button id="btn-export-all-excel" style="background:linear-gradient(135deg, #10b981, #059669); border:none; color:white; padding:6px 14px; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer;">
                📊 一键导出 Excel 表格
              </button>
            </div>

            <table style="width:100%; border-collapse:collapse; font-size:13px; text-align:left;">
              <thead>
                <tr style="background:#f8fafc; border-bottom:2px solid #e2e8f0; color:#475569;">
                  <th style="padding:10px;">小组名称</th>
                  <th style="padding:10px;">当前阶段</th>
                  <th style="padding:10px;">各成员字数贡献</th>
                  <th style="padding:10px;">通知已读</th>
                  <th style="padding:10px;">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr style="border-bottom:1px solid #e2e8f0;">
                  <td style="padding:12px 10px;"><b>第1小组 (AI组)</b></td>
                  <td style="padding:12px 10px;"><span style="color:#0284c7; background:#e0f2fe; padding:2px 8px; border-radius:4px; font-size:11.5px; font-weight:600;">阶段二：学术编辑部</span></td>
                  <td style="padding:12px 10px;">
                    <div style="font-size:11.5px; color:#334155;">
                      A (${state.stage2.memberContributions.A.percentage}%) | B (${state.stage2.memberContributions.B.percentage}%) | C (${state.stage2.memberContributions.C.percentage}%)
                    </div>
                  </td>
                  <td style="padding:12px 10px;">
                    ${announcements[0] && announcements[0].readStatus && announcements[0].readStatus['group_1'] 
                      ? '<span style="color:#16a34a; font-weight:600;">✅ 已读</span>' 
                      : '<span style="color:#dc2626; font-weight:600;">⚠️ 未读</span>'}
                  </td>
                  <td style="padding:12px 10px;">
                    <button class="export-single-excel-btn" data-group="group_1" style="background:#0284c7; border:none; color:white; padding:4px 10px; border-radius:4px; font-size:11.5px; cursor:pointer; font-weight:600;">
                      导出 Excel
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  `;

  // Listeners
  container.querySelector('#btn-logout').addEventListener('click', () => onLogout());
  container.querySelector('#btn-switch-student-preview').addEventListener('click', () => onSwitchToStudentView());

  const exportBtn = container.querySelector('#btn-export-all-excel');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      authManager.exportGroupChatLogsToExcel('group_1', state.chatLogs);
    });
  }

  container.querySelectorAll('.export-single-excel-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      authManager.exportGroupChatLogsToExcel(btn.dataset.group, state.chatLogs);
    });
  });

  // Task Modal
  container.querySelector('#btn-open-task-modal').addEventListener('click', () => {
    document.querySelectorAll('.modal-overlay').forEach(el => el.remove());

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="teacher-modal-card">
        <div class="teacher-modal-header">
          <div>
            <h3>发布全新写作任务</h3>
            <p>设置写作任务要求与受众班级</p>
          </div>
          <button class="modal-close-btn" id="btn-close-task-modal">✕</button>
        </div>

        <div class="teacher-modal-body">
          <div class="teacher-form-group">
            <label>受众班级</label>
            <select id="modal-task-class" class="teacher-input">
              ${classes.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
            </select>
          </div>

          <div class="teacher-form-group">
            <label>任务名称</label>
            <input type="text" id="modal-task-title" class="teacher-input" placeholder="输入任务名称">
          </div>

          <div class="teacher-form-group">
            <label>预估时长 (分钟)</label>
            <input type="number" id="modal-task-duration" class="teacher-input" value="150">
          </div>

          <div class="teacher-form-group">
            <label>任务说明与指导要求</label>
            <textarea id="modal-task-desc" class="teacher-textarea" placeholder="请输入任务的具体说明..."></textarea>
          </div>
        </div>

        <div class="teacher-modal-footer">
          <button class="modal-btn cancel" id="btn-cancel-task">取消</button>
          <button class="modal-btn submit" id="btn-submit-new-task">确认发布</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    modal.querySelector('#btn-close-task-modal').addEventListener('click', closeModal);
    modal.querySelector('#btn-cancel-task').addEventListener('click', closeModal);

    modal.querySelector('#btn-submit-new-task').addEventListener('click', () => {
      const classId = modal.querySelector('#modal-task-class').value;
      const title = modal.querySelector('#modal-task-title').value.trim();
      const desc = modal.querySelector('#modal-task-desc').value.trim();

      if (!title || !desc) {
        alert('⚠️ 请填齐任务标题与说明！');
        return;
      }

      authManager.createTask(title, classId, desc);
      closeModal();
      renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
    });
  });

  // Announcement Modal
  container.querySelector('#btn-open-ann-modal').addEventListener('click', () => {
    document.querySelectorAll('.modal-overlay').forEach(el => el.remove());

    let uploadedFile = null;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="teacher-modal-card">
        <div class="teacher-modal-header">
          <div>
            <h3>发布课堂即时通知</h3>
            <p>向学生端推送广播消息与教学资源</p>
          </div>
          <button class="modal-close-btn" id="btn-close-ann-modal">✕</button>
        </div>

        <div class="teacher-modal-body">
          <div class="teacher-form-group">
            <label>关联任务</label>
            <select id="modal-ann-task" class="teacher-input">
              ${tasks.map(t => `<option value="${t.id}">${t.title}</option>`).join('')}
            </select>
          </div>

          <div class="teacher-form-group">
            <label>通知标题</label>
            <input type="text" id="modal-ann-title" class="teacher-input" placeholder="输入通知标题">
          </div>

          <div class="teacher-form-group">
            <label>通知正文</label>
            <textarea id="modal-ann-content" class="teacher-textarea" placeholder="输入推送给学生的通知内容..."></textarea>
          </div>
        </div>

        <div class="teacher-modal-footer">
          <button class="modal-btn cancel" id="btn-cancel-ann">取消</button>
          <button class="modal-btn submit" id="btn-submit-new-ann">广播发布</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    modal.querySelector('#btn-close-ann-modal').addEventListener('click', closeModal);
    modal.querySelector('#btn-cancel-ann').addEventListener('click', closeModal);

    modal.querySelector('#btn-submit-new-ann').addEventListener('click', () => {
      const taskId = modal.querySelector('#modal-ann-task').value;
      const title = modal.querySelector('#modal-ann-title').value.trim();
      const content = modal.querySelector('#modal-ann-content').value.trim();

      if (!title || !content) {
        alert('⚠️ 请填齐通知标题与内容！');
        return;
      }

      authManager.publishAnnouncement(taskId, title, content, uploadedFile);
      closeModal();
      renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
    });
  });
}
