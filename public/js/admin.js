// ── 控制 ─────────────────────────────────────────────────────
function togglePlay() { if (isAdmin) socket.emit('toggle_play', { nickname: getNick() }); }
function nextSong() { if (isAdmin) socket.emit('next_song', { nickname: getNick() }); }
function removeSong(uid) { if (isAdmin) socket.emit('remove_song', { uid, nickname: getNick() }); }
function clearQueue() { if (isAdmin && confirm('确定清空播放队列？')) socket.emit('clear_queue', { nickname: getNick() }); }

// ── 管理员 ───────────────────────────────────────────────────
function openAdminModal() { document.getElementById('adm-modal').style.display = 'flex'; setTimeout(() => document.getElementById('apwd').focus(), 100); }
function closeAdminModal() { document.getElementById('adm-modal').style.display = 'none'; document.getElementById('apwd').value = ''; }
function submitAdmin() {
  const pwd = document.getElementById('apwd').value;
  socket.emit('admin_login', { password: pwd }, res => {
    if (res.ok) {
      isAdmin = true;
      adminShowUI();
      closeAdminModal(); toast('✅ 管理员登录成功', 'success'); renderQueue();
    } else { toast('❌ 密码错误', 'error'); }
  });
}

/**
 * 显示管理员 UI（房主自动调用 / 密码登录后调用）
 */
function adminShowControls() {
  isAdmin = true;
  adminShowUI();
  renderQueue();
}

function adminShowUI() {
  document.body.classList.add('adm');
  document.querySelectorAll('.ao').forEach(el => el.style.display = '');
  document.getElementById('btn-adm').style.display = 'none';
  document.getElementById('btn-logout').style.display = '';
}

function adminLogout() {
  // 房主不能退出管理员
  if (RoomManager && RoomManager.getIsOwner()) {
    toast('房主无法退出管理员模式', 'warning');
    return;
  }
  isAdmin = false; document.body.classList.remove('adm');
  document.querySelectorAll('.ao').forEach(el => el.style.display = 'none');
  document.getElementById('btn-adm').style.display = '';
  document.getElementById('btn-logout').style.display = 'none';
  renderQueue(); toast('已退出管理员模式', 'info');
}
