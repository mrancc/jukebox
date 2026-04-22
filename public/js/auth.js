/**
 * auth.js — 登录/注册逻辑
 */

(function () {
  'use strict';

  const TOKEN_KEY = 'jb_token';
  const USER_KEY = 'jb_user';

  // ── 工具 ──
  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function getUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY)); }
    catch { return null; }
  }

  function saveAuth(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  function clearAuth() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  // ── API 调用 ──
  async function apiRegister(email, password, nickname) {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, nickname }),
    });
    return res.json();
  }

  async function apiLogin(email, password) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    return res.json();
  }

  async function apiMe() {
    const token = getToken();
    if (!token) return null;
    const res = await fetch('/api/auth/me', {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    if (!res.ok) { clearAuth(); return null; }
    const data = await res.json();
    if (data.ok) {
      saveAuth(token, data.user);
      return data.user;
    }
    clearAuth();
    return null;
  }

  // ── 检查登录状态 ──
  async function checkAuth() {
    const token = getToken();
    if (!token) {
      onLoggedOut();
      return false;
    }
    const user = await apiMe();
    if (user) {
      onLoggedIn(user);
      return true;
    }
    // apiMe 失败时，token 可能过期或无效，checkAuth 已在 apiMe 里 clearAuth
    return false;
  }

  // ── 显示登录弹窗 ──
  function showAuthModal(mode = 'login') {
    // 如果已有弹窗则移除
    const existing = document.querySelector('.auth-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'auth-overlay';
    overlay.innerHTML = `
      <div class="auth-box">
        <div class="auth-avatar">${mode === 'login' ? '🎵' : '✨'}</div>
        <h3>${mode === 'login' ? '欢迎回来' : '创建账号'}</h3>
        <p class="auth-subtitle">${mode === 'login' ? '登录以继续你的音乐旅程' : '注册开始你的点歌之旅'}</p>
        <div class="auth-error" id="auth-error"></div>
        <div class="auth-field">
          <label>邮箱</label>
          <input id="auth-email" type="email" placeholder="your@email.com" autocomplete="email">
        </div>
        <div class="auth-field">
          <label>密码</label>
          <input id="auth-password" type="password" placeholder="至少6位" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}">
        </div>
        ${mode === 'register' ? `
        <div class="auth-field">
          <label>昵称</label>
          <input id="auth-nickname" type="text" placeholder="怎么称呼你？" maxlength="16" autocomplete="nickname">
        </div>
        ` : ''}
        <div class="auth-actions">
          <button class="btn-g" id="auth-cancel">取消</button>
          <button class="btn-primary" id="auth-submit">${mode === 'login' ? '登录' : '注册'}</button>
        </div>
        <div class="auth-switch">
          ${mode === 'login'
            ? '还没有账号？<a id="auth-to-register">立即注册</a>'
            : '已有账号？<a id="auth-to-login">去登录</a>'}
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const emailInput = overlay.querySelector('#auth-email');
    const passwordInput = overlay.querySelector('#auth-password');
    const nicknameInput = overlay.querySelector('#auth-nickname');
    const errorEl = overlay.querySelector('#auth-error');
    const submitBtn = overlay.querySelector('#auth-submit');
    const cancelBtn = overlay.querySelector('#auth-cancel');
    const toRegister = overlay.querySelector('#auth-to-register');
    const toLogin = overlay.querySelector('#auth-to-login');

    cancelBtn.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    if (toRegister) toRegister.addEventListener('click', () => { overlay.remove(); showAuthModal('register'); });
    if (toLogin) toLogin.addEventListener('click', () => { overlay.remove(); showAuthModal('login'); });

    async function handleSubmit() {
      const email = emailInput.value.trim();
      const password = passwordInput.value;
      const nickname = nicknameInput ? nicknameInput.value.trim() : '';

      if (!email || !password) { errorEl.textContent = '请填写邮箱和密码'; return; }
      if (mode === 'register' && password.length < 6) { errorEl.textContent = '密码至少6位'; return; }

      submitBtn.disabled = true;
      submitBtn.textContent = mode === 'login' ? '登录中...' : '注册中...';
      errorEl.textContent = '';

      try {
        const data = mode === 'login'
          ? await apiLogin(email, password)
          : await apiRegister(email, password, nickname);

        if (data.ok) {
          saveAuth(data.token, data.user);
          overlay.remove();
          onLoggedIn(data.user);
          toast(mode === 'login' ? '登录成功' : '注册成功', 'success');
          // 触发自定义事件，让 lobby.js 知道用户已登录
          window.dispatchEvent(new CustomEvent('auth:login', { detail: data.user }));
        } else {
          errorEl.textContent = data.msg || '操作失败';
        }
      } catch (e) {
        errorEl.textContent = '网络错误，请重试';
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = mode === 'login' ? '登录' : '注册';
      }
    }

    submitBtn.addEventListener('click', handleSubmit);
    // Enter 键提交
    overlay.querySelectorAll('input').forEach(input => {
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleSubmit(); });
    });

    // 聚焦到邮箱输入框
    setTimeout(() => emailInput.focus(), 100);
  }

  // ── 登录成功回调 ──
  function onLoggedIn(user) {
    const bar = document.getElementById('user-bar');
    if (bar) {
      bar.style.display = 'flex';
      bar.querySelector('.user-name').textContent = user.nickname || user.email.split('@')[0];
      bar.querySelector('.user-email').textContent = user.email;
      bar.querySelector('.user-avatar').textContent = (user.nickname || user.email)[0].toUpperCase();
    }
    // 更新昵称输入框
    const nickInput = document.getElementById('nickname-input');
    if (nickInput) nickInput.value = user.nickname || '';
  }

  // ── 未登录状态 ──
  function onLoggedOut() {
    const bar = document.getElementById('user-bar');
    if (bar) bar.style.display = 'none';
  }

  // ── 退出登录 ──
  function logout() {
    clearAuth();
    onLoggedOut();
    toast('已退出登录', 'info');
    showAuthModal('login');
    window.dispatchEvent(new CustomEvent('auth:logout'));
  }

  // ── 暴露给外部 ──
  window.Auth = {
    getToken,
    getUser,
    checkAuth,
    showAuthModal,
    logout,
    saveAuth,
  };

  // ── 页面加载时检查 ──
  document.addEventListener('DOMContentLoaded', () => {
    // 绑定退出按钮
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) logoutBtn.addEventListener('click', logout);

    // 绑定登录/注册按钮
    const loginBtn = document.getElementById('btn-login');
    if (loginBtn) loginBtn.addEventListener('click', () => showAuthModal('login'));

    checkAuth();
  });
})();
