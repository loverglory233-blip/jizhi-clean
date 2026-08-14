/**
 * Jizhi (集智) Multi-Agent Collaborative Writing Platform
 * Clean Login Screen Component
 */

export function renderLoginView(container, authManager, onLoginSuccess) {
  container.innerHTML = `
    <div class="login-page-container">
      <div class="login-box-card">
        <div class="login-header">
          <div class="login-logo-title">集智 JIZHI</div>
          <p class="login-subtitle">多智能体支持的在线协作写作平台</p>
        </div>

        <div class="login-tab-bar">
          <button class="login-tab active" data-tab="login">账号登录</button>
          <button class="login-tab" data-tab="register">注册账号</button>
        </div>

        <!-- Login Form -->
        <form class="login-form-body" id="form-login">
          <div class="form-group">
            <label for="login-email">账号 / 邮箱</label>
            <input type="text" id="login-email" class="form-input" value="teacher" placeholder="输入用户名或邮箱" required>
          </div>

          <div class="form-group">
            <label for="login-password">密码</label>
            <input type="password" id="login-password" class="form-input" value="123" placeholder="请输入密码" required>
          </div>

          <div id="login-error-msg" class="error-banner" style="display:none; color:#ef4444; font-size:12px; margin-bottom:10px;"></div>

          <button type="submit" class="login-submit-btn">
            登录进入平台
          </button>
        </form>

        <!-- Register Form -->
        <form class="login-form-body" id="form-register" style="display:none;">
          <div class="form-group">
            <label for="reg-name">姓名</label>
            <input type="text" id="reg-name" class="form-input" placeholder="例如：张老师 / 李同学" required>
          </div>

          <div class="form-group">
            <label for="reg-email">注册邮箱</label>
            <input type="email" id="reg-email" class="form-input" placeholder="例如：user@jizhi.edu" required>
          </div>

          <div class="form-group">
            <label for="reg-password">设置密码</label>
            <input type="password" id="reg-password" class="form-input" placeholder="请输入密码" required>
          </div>

          <div class="form-group">
            <label for="reg-role">身份类型</label>
            <select id="reg-role" class="form-input" style="background:#ffffff; color:#0f172a;">
              <option value="student">🎓 学生端 (Student)</option>
              <option value="teacher">👩‍🏫 教师端 (Teacher)</option>
            </select>
          </div>

          <div id="reg-error-msg" class="error-banner" style="display:none; color:#ef4444; font-size:12px; margin-bottom:10px;"></div>

          <button type="submit" class="login-submit-btn">
            完成注册并登录
          </button>
        </form>

        <!-- Quick Demo Account Switcher -->
        <div class="demo-accounts-card">
          <div class="demo-title">💡 快捷演示账号（点击直接进入）：</div>
          <div class="demo-grid">
            <button class="demo-btn" data-email="teacher@jizhi.edu" data-pass="123">
              👩‍🏫 教师端 (张教授)
            </button>
            <button class="demo-btn" data-email="studentA@jizhi.edu" data-pass="123">
              👨‍🎓 学生A (李明/组长)
            </button>
            <button class="demo-btn" data-email="studentB@jizhi.edu" data-pass="123">
              👩‍🎓 学生B (王芳/组员)
            </button>
            <button class="demo-btn" data-email="studentC@jizhi.edu" data-pass="123">
              🧑‍🎓 学生C (陈强/组员)
            </button>
          </div>
        </div>

      </div>
    </div>
  `;

  const loginTab = container.querySelector('[data-tab="login"]');
  const regTab = container.querySelector('[data-tab="register"]');
  const loginForm = container.querySelector('#form-login');
  const regForm = container.querySelector('#form-register');

  loginTab.addEventListener('click', () => {
    loginTab.classList.add('active');
    regTab.classList.remove('active');
    loginForm.style.display = 'block';
    regForm.style.display = 'none';
  });

  regTab.addEventListener('click', () => {
    regTab.classList.add('active');
    loginTab.classList.remove('active');
    regForm.style.display = 'block';
    loginForm.style.display = 'none';
  });

  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = container.querySelector('#login-email').value.trim();
    const pass = container.querySelector('#login-password').value.trim();
    const res = authManager.login(email, pass);
    if (res.success) {
      onLoginSuccess(res.user);
    } else {
      const errBox = container.querySelector('#login-error-msg');
      errBox.style.display = 'block';
      errBox.textContent = res.message;
    }
  });

  regForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = container.querySelector('#reg-name').value.trim();
    const email = container.querySelector('#reg-email').value.trim();
    const pass = container.querySelector('#reg-password').value.trim();
    const role = container.querySelector('#reg-role').value;
    const res = authManager.register(name, email, pass, role);
    if (res.success) {
      onLoginSuccess(res.user);
    } else {
      const errBox = container.querySelector('#reg-error-msg');
      errBox.style.display = 'block';
      errBox.textContent = res.message;
    }
  });

  container.querySelectorAll('.demo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const email = btn.dataset.email;
      const pass = btn.dataset.pass;
      const res = authManager.login(email, pass);
      if (res.success) {
        onLoginSuccess(res.user);
      }
    });
  });
}
