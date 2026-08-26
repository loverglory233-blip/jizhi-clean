import { escapeHtml } from "./utils.js?v=20260827_v611";

export function renderLoginView(container, authManager, onLoginSuccess) {
  if (authManager && authManager.pullGlobalMeta) {
    authManager.pullGlobalMeta().catch(() => {});
  }

  let savedAccount = '';
  let savedRole = 'student';
  try {
    savedAccount = localStorage.getItem('jizhi_last_login_account') || '';
    savedRole = localStorage.getItem('jizhi_last_login_role') || 'student';
  } catch (e) {}

  container.innerHTML = `
    <div style="min-height:100vh; display:flex; align-items:center; justify-content:center; padding:20px; background:linear-gradient(135deg, #f0f4f9 0%, #e2e8f0 100%);">
      <div style="background:#ffffff; border:1px solid #cbd5e1; border-radius:20px; width:440px; max-width:95vw; padding:36px; box-shadow:0 20px 40px -8px rgba(15, 23, 42, 0.08), 0 4px 12px rgba(15, 23, 42, 0.04);">
        <div style="text-align:center; margin-bottom:28px;">
          <div style="font-size:32px; font-weight:800; background:linear-gradient(135deg, #1e40af, #2563eb); -webkit-background-clip:text; -webkit-text-fill-color:transparent;">集智 JIZHI</div>
          <div style="font-size:13.5px; color:#475569; margin-top:6px; font-weight:700;">面向团队协作的多智能体人机协同写作平台</div>
        </div>
        <form id="login-form" style="display:flex; flex-direction:column; gap:16px;">
          <div style="display:flex; flex-direction:column; gap:6px;">
            <label style="font-size:13px; font-weight:700; color:#334155;">工号 / 学号</label>
            <input type="text" id="login-account" class="teacher-input" placeholder="请输入工号或者学号" value="${escapeHtml(savedAccount)}" autocomplete="off" required style="width:100%;">
          </div>
          <div style="display:flex; flex-direction:column; gap:6px;">
            <label style="font-size:13px; font-weight:700; color:#334155;">密码</label>
            <input type="password" id="login-password" class="teacher-input" placeholder="请输入密码" value="" autocomplete="off" required style="width:100%;">
          </div>
          <div style="display:flex; flex-direction:column; gap:6px;">
            <label style="font-size:13px; font-weight:700; color:#334155;">登录身份</label>
            <div id="login-role-selector" style="display:flex; gap:10px;">
              <label id="role-opt-student" style="flex:1; display:flex; align-items:center; justify-content:center; gap:6px; padding:10px; border:1.5px solid #2563eb; border-radius:8px; cursor:pointer; font-size:13px; font-weight:700; color:#1e40af; background:#eff6ff;">
                <input type="radio" name="login-role" value="student" ${savedRole !== 'teacher' ? 'checked' : ''} style="accent-color:#2563eb;"> 🎓 学生
              </label>
              <label id="role-opt-teacher" style="flex:1; display:flex; align-items:center; justify-content:center; gap:6px; padding:10px; border:1.5px solid #cbd5e1; border-radius:8px; cursor:pointer; font-size:13px; font-weight:600; color:#334155; background:#ffffff;">
                <input type="radio" name="login-role" value="teacher" ${savedRole === 'teacher' ? 'checked' : ''} style="accent-color:#2563eb;"> 👩‍🏫 教师
              </label>
            </div>
          </div>
          <div id="login-error-msg" style="display:none; font-size:12px; color:#dc2626; background:#fef2f2; border:1px solid #fecaca; padding:8px 12px; border-radius:8px;"></div>
          <button type="submit" class="modal-btn submit task-theme" style="width:100%; padding:14px; font-size:15px; border-radius:10px; margin-top:8px;">
            🚀 登录集智平台
          </button>
        </form>
        <div style="text-align:center; margin-top:24px; font-size:12px; color:#94a3b8; font-weight:500;">
          <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer" style="color:#94a3b8; text-decoration:none;">浙ICP备2026066047号-1</a>
        </div>
      </div>
    </div>
  `;

  const form = container.querySelector('#login-form');
  const accountInput = container.querySelector('#login-account');
  const passwordInput = container.querySelector('#login-password');
  const errorMsg = container.querySelector('#login-error-msg');
  const roleSelector = container.querySelector('#login-role-selector');
  const roleOptStudent = container.querySelector('#role-opt-student');
  const roleOptTeacher = container.querySelector('#role-opt-teacher');

  // 🎭 身份切换高亮：让所选「教师/学生」一目了然
  const highlightRole = () => {
    const selected = (container.querySelector('input[name="login-role"]:checked') || {}).value;
    const apply = (el, active) => {
      if (!el) return;
      if (active) {
        el.style.border = '1.5px solid #2563eb';
        el.style.background = '#eff6ff';
        el.style.color = '#1e40af';
        el.style.fontWeight = '700';
      } else {
        el.style.border = '1.5px solid #cbd5e1';
        el.style.background = '#ffffff';
        el.style.color = '#334155';
        el.style.fontWeight = '600';
      }
    };
    apply(roleOptStudent, selected === 'student');
    apply(roleOptTeacher, selected === 'teacher');
  };
  if (roleSelector) roleSelector.addEventListener('change', highlightRole);
  highlightRole();

  accountInput.addEventListener('input', (e) => {
    const val = (e.target.value || '').trim().toLowerCase();
    if (val === 'teacher' || val === 'admin') {
      const teacherRadio = container.querySelector('input[name="login-role"][value="teacher"]');
      if (teacherRadio) {
        teacherRadio.checked = true;
        highlightRole();
      }
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorMsg.style.display = 'none';
    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.innerText = '⏳ 正在验证凭证...'; }
    try {
      const selectedRole = (container.querySelector('input[name="login-role"]:checked') || {}).value || 'student';
      const res = await (authManager.loginAsync ? authManager.loginAsync(accountInput.value, passwordInput.value, selectedRole) : authManager.login(accountInput.value, passwordInput.value, selectedRole));
      if (res && res.success) {
        try {
          localStorage.setItem('jizhi_last_login_account', accountInput.value.trim());
          localStorage.setItem('jizhi_last_login_role', selectedRole);
        } catch (e) {}
        onLoginSuccess();
      } else {
        errorMsg.innerText = (res && res.message) ? res.message : '❌ 账号或密码错误';
        errorMsg.style.display = 'block';
      }
    } catch (err) {
      errorMsg.innerText = '❌ 登录请求失败，请检查网络连接';
      errorMsg.style.display = 'block';
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = '🚀 登录集智平台'; }
    }
  });

  // 💡 智能光标聚焦：若已自动回填学号，直接聚焦密码框方便输入
  if (savedAccount && passwordInput) {
    setTimeout(() => { try { passwordInput.focus(); } catch (e) {} }, 100);
  } else if (accountInput) {
    setTimeout(() => { try { accountInput.focus(); } catch (e) {} }, 100);
  }
}
