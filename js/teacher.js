/**
 * Jizhi (集智) Multi-Agent Collaborative Writing Platform
 * Teacher Control Portal - Ultra-Modern & Beautiful Task & Announcement Publishing Modals
 */

export function renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView) {
  const currentUser = authManager.getCurrentUser();
  const tasks = authManager.getTasks();
  const announcements = authManager.getAnnouncements();
  const classes = authManager.getClasses();

  container.innerHTML = `
    <div class="teacher-portal-layout">
      <!-- Teacher Header -->
      <header class="teacher-header">
        <div class="brand-section">
          <div class="brand-logo">集智 JIZHI</div>
          <div class="brand-badge teacher-badge">👩‍🏫 教师端管理中心</div>
        </div>

        <div class="teacher-info">
          <span>班级管理: <b>${classes[0] ? classes[0].name : '现代教育技术班'}</b></span>
          <span>主讲教师: <b>${currentUser.name}</b></span>
          <button id="btn-switch-student-preview" class="header-icon-btn" style="background:rgba(99,102,241,0.2); color:#a5b4fc;">
            👀 切换至学生协作视角
          </button>
          <button id="btn-logout" class="header-icon-btn logout">
            退出登录
          </button>
        </div>
      </header>

      <!-- Main Content Grid -->
      <main class="teacher-content">
        <!-- Left Panel: Task & Announcement Management -->
        <section class="teacher-left-panel">
          
          <div class="card broadcast-card">
            <div class="card-title">
              <span>📢 课堂任务即时通知发布 (含文件资源 & 小组已读追踪)</span>
              <button id="btn-open-ann-modal" class="teacher-action-btn green">
                + 发布新通知 (含资源)
              </button>
            </div>

            <div class="announcement-history-list">
              ${announcements.map(a => `
                <div class="teacher-ann-item">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                    <span style="font-weight:700; color:#38bdf8; font-size:14px;">${a.title}</span>
                    <span style="font-size:11px; color:#94a3b8;">${a.time} | 关联任务: ${a.taskTitle}</span>
                  </div>
                  <div style="font-size:13px; color:#cbd5e1; margin-bottom:6px;">${a.content}</div>
                  
                  ${a.attachment ? `
                    <div style="font-size:12px; color:#a78bfa; background:rgba(139,92,246,0.15); padding:4px 8px; border-radius:4px; display:inline-block; margin-bottom:8px;">
                      📎 随附资源: <b>${a.attachment.name}</b> (${a.attachment.size})
                    </div>
                  ` : ''}

                  <div style="font-size:11px; color:#94a3b8; display:flex; gap:12px; border-top:1px dashed rgba(255,255,255,0.1); padding-top:6px;">
                    <span>已读小组: <b style="color:#4ade80;">${a.readStatus && a.readStatus['group_1'] ? '✅ 第1小组 (已读)' : '无'}</b></span>
                    <span>未读小组: <b style="color:#f87171;">${a.readStatus && !a.readStatus['group_1'] ? '⚠️ 第1小组 (未读)' : '无'}</b></span>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="card" style="margin-top:16px;">
            <div class="card-title">
              <span>📌 课程任务发布与班级小组关联</span>
              <button id="btn-open-task-modal" class="teacher-action-btn indigo">
                + 发布新写作任务
              </button>
            </div>

            <div class="task-list-container">
              ${tasks.map(t => `
                <div class="teacher-task-card">
                  <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-size:16px; font-weight:700; color:#38bdf8;">${t.title}</span>
                    <span class="status-badge active">● 教学班: ${t.className}</span>
                  </div>
                  <div style="font-size:12px; color:#94a3b8; margin:6px 0;">时长: ${t.durationMinutes} 分钟 | 发布时间: ${t.createdAt}</div>
                  <div style="font-size:14px; color:#f1f5f9; background:rgba(15,23,42,0.8); padding:12px; border-radius:8px; border-left:4px solid var(--accent-indigo); line-height:1.6;">
                    <b style="color:#a5b4fc;">任务说明与要求:</b> ${t.instructions}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </section>

        <!-- Right Panel: Group Monitor & Excel Export -->
        <section class="teacher-right-panel">
          <div class="card">
            <div class="card-title">
              <span>📊 班级各组写作状态监控与 Excel 记录导出</span>
              <button id="btn-export-all-excel" style="background:linear-gradient(135deg, #10b981, #059669); border:none; color:white; padding:6px 14px; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer;">
                📊 一键导出 Excel 表格 (名字/时间/内容)
              </button>
            </div>

            <table class="monitor-table">
              <thead>
                <tr>
                  <th>小组名称</th>
                  <th>当前阶段</th>
                  <th>各成员字数贡献</th>
                  <th>编辑会议均分</th>
                  <th>通知已读</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><b>第1小组 (AI组)</b></td>
                  <td><span class="phase-pill p1">阶段二：学术编辑部</span></td>
                  <td>
                    <div style="font-size:11px;">
                      A (42%) | B (31%) | C (27%)
                    </div>
                  </td>
                  <td><span style="color:#f59e0b;">★ 4.0</span></td>
                  <td>
                    ${announcements[0] && announcements[0].readStatus && announcements[0].readStatus['group_1'] 
                      ? '<span style="color:#4ade80;">✅ 已读</span>' 
                      : '<span style="color:#f87171;">⚠️ 未读</span>'}
                  </td>
                  <td>
                    <button class="export-single-excel-btn" data-group="group_1" style="background:var(--accent-indigo); border:none; color:white; padding:4px 8px; border-radius:4px; font-size:11px; cursor:pointer;">
                      导出 Excel
                    </button>
                  </td>
                </tr>
                <tr>
                  <td><b>第2小组 (提问组)</b></td>
                  <td><span class="phase-pill p2">阶段一：学术拍卖会</span></td>
                  <td>竞拍中</td>
                  <td>--</td>
                  <td><span style="color:#f87171;">⚠️ 未读</span></td>
                  <td>
                    <button class="export-single-excel-btn" data-group="group_2" style="background:rgba(255,255,255,0.1); border:none; color:#94a3b8; padding:4px 8px; border-radius:4px; font-size:11px; cursor:pointer;">
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

  // Event Listeners
  container.querySelector('#btn-logout').addEventListener('click', () => onLogout());
  container.querySelector('#btn-switch-student-preview').addEventListener('click', () => onSwitchToStudentView());

  const exportBtn = container.querySelector('#btn-export-all-excel');
  exportBtn.addEventListener('click', () => {
    authManager.exportGroupChatLogsToExcel('group_1', state.chatLogs);
  });

  container.querySelectorAll('.export-single-excel-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      authManager.exportGroupChatLogsToExcel(btn.dataset.group, state.chatLogs);
    });
  });

  // 🌟 Ultra-Modern Task Publishing Modal
  container.querySelector('#btn-open-task-modal').addEventListener('click', () => {
    document.querySelectorAll('.modal-overlay').forEach(el => el.remove());

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="teacher-modal-card fancy-task-modal">
        <div class="teacher-modal-header task-theme-gradient">
          <div class="modal-header-title">
            <div class="modal-icon-badge task">📌</div>
            <div>
              <div class="modal-tag-pill">📌 教学任务管理矩阵</div>
              <h3>发布全新协作写作任务</h3>
            </div>
          </div>
          <button class="modal-close-btn" id="btn-close-task-modal">✕</button>
        </div>

        <div class="teacher-modal-body">
          <div class="form-grid-2">
            <div class="teacher-form-group">
              <label><span class="req">*</span> 关联受众教学班级</label>
              <select id="modal-task-class" class="teacher-input fancy">
                ${classes.map(c => `<option value="${c.id}">🏫 ${c.name}</option>`).join('')}
              </select>
            </div>

            <div class="teacher-form-group">
              <label><span class="req">*</span> 任务预估时长 (分钟)</label>
              <input type="number" id="modal-task-duration" class="teacher-input fancy" value="150">
              
              <div class="preset-chip-group">
                <span class="preset-chip" data-duration="60">⚡ 60m</span>
                <span class="preset-chip" data-duration="90">⏱️ 90m</span>
                <span class="preset-chip active" data-duration="150">🌟 150m (标准)</span>
                <span class="preset-chip" data-duration="180">🔥 180m</span>
              </div>
            </div>
          </div>

          <div class="teacher-form-group">
            <label><span class="req">*</span> 写作任务名称</label>
            <input type="text" id="modal-task-title" class="teacher-input fancy" value="《现代教育技术》期末协作研究设计方案编写" placeholder="输入任务名称">
            
            <div class="preset-chip-group" style="margin-top:6px;">
              <span class="preset-chip" data-title="《现代教育技术》期末协作研究设计方案编写">📑 模板 1: 期末研究设计方案</span>
              <span class="preset-chip" data-title="《生成式AI干预协作写作效果》实证论文撰写">🧪 模板 2: 生成式AI实证论文</span>
            </div>
          </div>

          <div class="teacher-form-group">
            <label><span class="req">*</span> 任务详细说明与要求 (学术指导指引)</label>
            <textarea id="modal-task-desc" class="teacher-textarea fancy" placeholder="请输入任务的具体说明与考核标准...">请在150分钟内，以小组为单位完成包含研究背景、研究问题、文献综述、研究设计与方法、不足反思与参考文献的高质量方案编写，并参加期末答辩。</textarea>
          </div>
        </div>

        <div class="teacher-modal-footer">
          <button class="modal-btn cancel" id="btn-cancel-task">取消</button>
          <button class="modal-btn submit task-theme" id="btn-submit-new-task">🚀 确认发布写作任务</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    modal.querySelector('#btn-close-task-modal').addEventListener('click', closeModal);
    modal.querySelector('#btn-cancel-task').addEventListener('click', closeModal);

    const durationInput = modal.querySelector('#modal-task-duration');
    const titleInput = modal.querySelector('#modal-task-title');

    modal.querySelectorAll('.preset-chip[data-duration]').forEach(chip => {
      chip.addEventListener('click', () => {
        modal.querySelectorAll('.preset-chip[data-duration]').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        durationInput.value = chip.dataset.duration;
      });
    });

    modal.querySelectorAll('.preset-chip[data-title]').forEach(chip => {
      chip.addEventListener('click', () => {
        titleInput.value = chip.dataset.title;
      });
    });

    modal.querySelector('#btn-submit-new-task').addEventListener('click', () => {
      const classId = modal.querySelector('#modal-task-class').value;
      const title = titleInput.value.trim();
      const desc = modal.querySelector('#modal-task-desc').value.trim();

      if (!title || !desc) {
        alert('⚠️ 请填齐任务标题与说明！');
        return;
      }

      authManager.createTask(title, classId, desc, [{ name: '研究设计指南.pdf', size: '1.5MB' }]);
      closeModal();
      renderTeacherPortal(container, authManager, state, onLogout, onSwitchToStudentView);
    });
  });

  // 🌟 Ultra-Modern Announcement Publishing Modal with Rich Drag & Drop Controls
  container.querySelector('#btn-open-ann-modal').addEventListener('click', () => {
    document.querySelectorAll('.modal-overlay').forEach(el => el.remove());

    let uploadedFile = { name: '协作写作问卷测量规范范例.pdf', size: '2.4 MB' };

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="teacher-modal-card fancy-ann-modal">
        <div class="teacher-modal-header ann-theme-gradient">
          <div class="modal-header-title">
            <div class="modal-icon-badge ann">📢</div>
            <div>
              <div class="modal-tag-pill ann">📢 课堂即时广播中心</div>
              <h3>发布课堂即时通知 (含教学资源)</h3>
            </div>
          </div>
          <button class="modal-close-btn" id="btn-close-ann-modal">✕</button>
        </div>

        <div class="teacher-modal-body">
          <div class="teacher-form-group">
            <label><span class="req">*</span> 关联写作任务</label>
            <select id="modal-ann-task" class="teacher-input fancy">
              ${tasks.map(t => `<option value="${t.id}">📌 ${t.title}</option>`).join('')}
            </select>
          </div>

          <div class="teacher-form-group">
            <label><span class="req">*</span> 通知标题</label>
            <input type="text" id="modal-ann-title" class="teacher-input fancy" value="📢 教学通知：请及时完成文献与方法衔接" placeholder="输入通知标题">
            
            <div class="preset-chip-group" style="margin-top:6px;">
              <span class="preset-chip" data-anntitle="📢 教学通知：请及时完成文献与方法衔接">📢 快捷：文献方法衔接</span>
              <span class="preset-chip" data-anntitle="⚠️ 规范提醒：严格匹配FacioneSSR测量量表">⚠️ 快捷：SSRL量表规范</span>
              <span class="preset-chip" data-anntitle="🎉 阶段一总结：竞拍结束解锁编辑部">🎉 快捷：阶段一解锁</span>
            </div>
          </div>

          <div class="teacher-form-group">
            <label><span class="req">*</span> 通知详细内容 (即时弹窗推送给学生端)</label>
            <textarea id="modal-ann-content" class="teacher-textarea fancy" placeholder="输入推送给全班学生的通知正文...">请各组在后10分钟内集中检查【研究问题与假设】，并点击弹窗确认已读。</textarea>
          </div>

          <!-- Rich Drag & Drop File Upload Control -->
          <div class="teacher-form-group">
            <label>📎 随附教学资源文件 (支持文件选择与拖拽)</label>
            
            <input type="file" id="real-file-input" style="display:none;">

            <div class="file-upload-box fancy" id="file-upload-trigger">
              <div class="file-box-content" id="file-box-display">
                <span class="file-box-icon">📁</span>
                <div>
                  <div class="file-box-name" id="file-name-text">协作写作问卷测量规范范例.pdf (2.4 MB)</div>
                  <div class="file-box-tip">点击此处选择电脑本地文件 (支持 PDF, DOCX, PPTX, ZIP)</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="teacher-modal-footer">
          <button class="modal-btn cancel" id="btn-cancel-ann">取消</button>
          <button class="modal-btn submit ann-theme" id="btn-submit-new-ann">📢 广播发布并推送弹窗</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    modal.querySelector('#btn-close-ann-modal').addEventListener('click', closeModal);
    modal.querySelector('#btn-cancel-ann').addEventListener('click', closeModal);

    const titleInput = modal.querySelector('#modal-ann-title');

    modal.querySelectorAll('.preset-chip[data-anntitle]').forEach(chip => {
      chip.addEventListener('click', () => {
        titleInput.value = chip.dataset.anntitle;
      });
    });

    const realInput = modal.querySelector('#real-file-input');
    const uploadTrigger = modal.querySelector('#file-upload-trigger');
    const fileNameText = modal.querySelector('#file-name-text');

    uploadTrigger.addEventListener('click', () => realInput.click());

    realInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
        uploadedFile = {
          name: file.name,
          size: `${sizeMB} MB`
        };
        fileNameText.textContent = `✅ 已选择: ${file.name} (${uploadedFile.size})`;
        uploadTrigger.classList.add('has-file');
      }
    });

    modal.querySelector('#btn-submit-new-ann').addEventListener('click', () => {
      const taskId = modal.querySelector('#modal-ann-task').value;
      const title = titleInput.value.trim();
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
