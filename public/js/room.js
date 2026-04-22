/**
 * room.js — 房间管理模块
 * 负责加入/退出房间、房主状态、房间 UI（信息栏 + 退出按钮）
 * 依赖：socket（全局 socket.io 实例）
 */

window.RoomManager = (function () {
  'use strict';

  let roomName = '';
  let isOwner = false;
  let isAdmin = false;
  let nickname = '';
  let onJoined = null; // 加入成功回调

  /**
   * 从 URL 解析房间名和昵称
   * URL 格式：/room/xxx?nick=yyy
   */
  function parseUrl() {
    const pathname = window.location.pathname;
    // /room/xxx
    const match = pathname.match(/^\/room\/(.+)$/);
    const name = match ? decodeURIComponent(match[1]) : '';
    const params = new URLSearchParams(window.location.search);
    const nick = params.get('nick') || localStorage.getItem('jb_nickname') || '';
    return {
      name,
      nick,
      password: params.get('password') || '',
    };
  }

  /**
   * 加入房间
   */
  function join(callback) {
    const { name, nick, password } = parseUrl();
    if (!name) {
      // 没有房间名，跳回大厅
      window.location.href = '/';
      return;
    }
    if (!window.socket) {
      console.error('Socket 未连接');
      return;
    }
    roomName = name;
    nickname = nick;
    onJoined = callback;

    window.socket.emit('room:join', { room: roomName, nickname, password: password || null }, (res) => {
      if (res && res.ok) {
        isOwner = res.isOwner || false;
        isAdmin = res.isAdmin || false;
        console.log(`🏠 已加入房间「${roomName}」`, { isOwner, isAdmin });
        if (onJoined) onJoined(res);
      } else {
        toast(res?.msg || '加入房间失败', 'error');
        if (res?.needPassword) {
          setTimeout(() => { window.location.href = '/'; }, 1500);
        }
      }
    });
  }

  /**
   * 退出房间 → 回到大厅
   */
  function leave() {
    if (window.socket) {
      window.socket.emit('room:leave', {}, () => {
        window.location.href = '/';
      });
    } else {
      window.location.href = '/';
    }
  }

  /**
   * 获取房间信息
   */
  function getRoomName() { return roomName; }
  function getIsOwner() { return isOwner; }
  function getIsAdmin() { return isAdmin; }
  function getNickname() { return nickname; }

  /**
   * 监听房主转让
   */
  function onOwnerChanged(cb) {
    if (!window.socket) return;
    window.socket.on('room:owner_changed', (data) => {
      // 检查自己是否成了新房主
      if (data.newOwner === window.socket.id) {
        isOwner = true;
        isAdmin = true;
        toast('你已成为新房主（管理员）', 'info');
        if (cb) cb(data);
      }
    });
  }

  /**
   * 初始化房间 UI（头部信息栏 + 退出按钮）
   */
  function initUI() {
    // 在 header 区域插入房间信息
    const header = document.querySelector('.header-controls');
    if (!header) return;

    // 房间标签
    const roomTag = document.createElement('div');
    roomTag.className = 'room-tag';
    roomTag.id = 'room-tag';
    roomTag.innerHTML = `<span class="room-tag-icon">🏠</span><span class="room-tag-name"></span>`;
    header.insertBefore(roomTag, header.firstChild);

    // 退出按钮
    const leaveBtn = document.createElement('button');
    leaveBtn.className = 'btn btn-ghost btn-sm';
    leaveBtn.id = 'room-leave-btn';
    leaveBtn.textContent = '退出房间';
    leaveBtn.addEventListener('click', leave);
    header.insertBefore(leaveBtn, header.firstChild);
  }

  /**
   * 更新房间标签显示
   */
  function updateTag() {
    const nameEl = document.querySelector('#room-tag-name');
    if (nameEl) {
      const suffix = isOwner ? ' 👑' : (isAdmin ? ' ⚡' : '');
      nameEl.textContent = roomName + suffix;
    }
  }

  return {
    join,
    leave,
    getRoomName,
    getIsOwner,
    getIsAdmin,
    getNickname,
    onOwnerChanged,
    initUI,
    updateTag,
  };
})();
