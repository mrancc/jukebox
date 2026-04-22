// ── Socket.io 连接 & 事件监听 ───────────────────────────────
// 从 URL 或 localStorage 获取 token
(function () {
  const params = new URLSearchParams(window.location.search);
  const urlToken = params.get('token');
  const storedToken = localStorage.getItem('jb_token');
  const token = urlToken || storedToken;
  // 如果 URL 带了 token，同步到 localStorage
  if (urlToken && !storedToken) {
    localStorage.setItem('jb_token', urlToken);
  }
  const auth = token ? { token } : {};
  window.socket = io({ auth });
})();
