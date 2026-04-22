/**
 * lobby.js — 房间大厅逻辑
 * 负责房间列表展示、创建房间、加入房间
 */

(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const roomNameInput = $('#room-name-input');
  const roomPasswordInput = $('#room-password-input');
  const createBtn     = $('#create-btn');
  const refreshBtn    = $('#refresh-btn');
  const roomListEl    = $('#room-list');
  const nicknameInput = $('#nickname-input');
  const passwordModal = $('#password-modal');
  const joinPwdInput  = $('#join-password-input');

  // 从 localStorage 读取昵称
  nicknameInput.value = localStorage.getItem('jb_nickname') || '';

  // 保存昵称
  nicknameInput.addEventListener('change', () => {
    const val = nicknameInput.value.trim();
    if (val) localStorage.setItem('jb_nickname', val);
  });

  // 获取昵称
  function getNickname() {
    return nicknameInput.value.trim() || '匿名';
  }

  // ── 加载房间列表（带认证） ──
  let isLoadingRooms = false;
  async function loadRooms() {
    if (isLoadingRooms) return;
    const token = window.Auth?.getToken?.();
    if (!token) return;
    isLoadingRooms = true;
    if (refreshBtn) refreshBtn.classList.add('spinning');
    try {
      const res = await fetch('/api/rooms', {
        headers: { 'Authorization': 'Bearer ' + token },
      });
      if (res.status === 401) {
        // token 过期，清除并弹登录
        window.Auth?.logout?.();
        return;
      }
      const data = await res.json();
      renderRooms(data.rooms || []);
    } catch (e) {
      console.warn('loadRooms error:', e);
    } finally {
      isLoadingRooms = false;
      if (refreshBtn) refreshBtn.classList.remove('spinning');
    }
  }

  function renderRooms(rooms) {
    // 更新房间数量徽章
    const countEl = document.querySelector('.room-count');
    if (countEl) countEl.textContent = rooms.length;
    if (rooms.length === 0) {
      roomListEl.innerHTML = '<div class="room-empty">暂无房间，创建一个吧！</div>';
      return;
    }
    roomListEl.innerHTML = rooms.map(r => {
      const playingText = r.playing ? `正在播放: ${r.playing}` : '空闲';
      const lockIcon = r.hasPassword ? ' 🔒' : '';
      return `
        <div class="room-card" data-room="${esc(r.name)}" data-locked="${r.hasPassword ? '1' : '0'}">
          <div class="room-info">
            <div class="room-name">${esc(r.name)}${lockIcon}</div>
            <div class="room-meta">
              <span>👥 ${r.online} 人在线</span>
              <span>🎵 ${r.queueLen} 首歌</span>
              <span>${playingText}</span>
            </div>
          </div>
          <button class="btn btn-primary room-join-btn">进入</button>
        </div>
      `;
    }).join('');

    // 绑定点击事件
    roomListEl.querySelectorAll('.room-card').forEach(card => {
      card.addEventListener('click', () => {
        if (!window.Auth?.getToken?.()) {
          window.Auth?.showAuthModal?.('login');
          return;
        }
        const roomName = card.dataset.room;
        const isLocked = card.dataset.locked === '1';
        if (isLocked) {
          showPasswordModal(roomName);
        } else {
          joinRoom(roomName);
        }
      });
    });
  }

  // ── 创建房间 ──
  createBtn.addEventListener('click', createRoom);
  roomNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') createRoom();
  });

  async function createRoom() {
    const name = roomNameInput.value.trim();
    if (!name) {
      toast('请输入房间名', 'warning');
      roomNameInput.focus();
      return;
    }
    const password = roomPasswordInput.value.trim() || null;
    const token = window.Auth?.getToken?.();
    if (!token) {
      window.Auth?.showAuthModal?.('login');
      return;
    }
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ name, password }),
      });
      const data = await res.json();
      if (data.ok) {
        toast(`房间「${name}」创建成功！`, 'success');
        joinRoom(data.name, password);
      } else {
        toast(data.msg || '创建失败', 'error');
      }
    } catch (e) {
      toast('创建房间失败', 'error');
    }
  }

  // ── 加入房间 ──
  function joinRoom(roomName, password) {
    const nickname = getNickname();
    localStorage.setItem('jb_nickname', nickname);
    const token = window.Auth?.getToken?.() || '';
    // 跳转到播放页，房间名作为路径参数
    let url = '/room/' + encodeURIComponent(roomName)
      + '?nick=' + encodeURIComponent(nickname)
      + (token ? '&token=' + encodeURIComponent(token) : '');
    if (password) url += '&password=' + encodeURIComponent(password);
    window.location.href = url;
  }

  // ── 密码弹窗 ──
  let pendingRoomName = null;

  function showPasswordModal(roomName) {
    pendingRoomName = roomName;
    joinPwdInput.value = '';
    passwordModal.style.display = '';
    joinPwdInput.focus();
  }

  function hidePasswordModal() {
    passwordModal.style.display = 'none';
    pendingRoomName = null;
  }

  $('#join-pwd-cancel').addEventListener('click', hidePasswordModal);
  passwordModal.querySelector('.modal-overlay').addEventListener('click', hidePasswordModal);
  joinPwdInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('#join-pwd-confirm').click();
    if (e.key === 'Escape') hidePasswordModal();
  });
  $('#join-pwd-confirm').addEventListener('click', () => {
    const pwd = joinPwdInput.value.trim();
    if (!pwd) { toast('请输入密码', 'warning'); joinPwdInput.focus(); return; }
    if (!pendingRoomName) return;
    joinRoom(pendingRoomName, pwd);
    hidePasswordModal();
  });

  // ── 主题切换 ──
  const themeBtn = $('#btn-theme');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      if (typeof toggleTheme === 'function') toggleTheme();
    });
  }

  // ── 刷新 ──
  refreshBtn.addEventListener('click', loadRooms);

  // ── 初始加载（登录后自动加载） ──
  window.addEventListener('auth:login', () => loadRooms());

  // 页面就绪后检查并加载
  function tryLoad() {
    if (window.Auth?.getToken?.()) {
      loadRooms();
    } else {
      // 等待 checkAuth 完成后再试
      window.addEventListener('auth:login', () => loadRooms(), { once: true });
    }
  }

  // DOM 就绪后加载
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryLoad);
  } else {
    tryLoad();
  }

  // 每 10 秒自动刷新房间列表（仅已登录时）
  setInterval(() => {
    if (window.Auth?.getToken?.()) loadRooms();
  }, 10000);
})();
