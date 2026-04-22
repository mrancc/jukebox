// ── 全局状态 ─────────────────────────────────────────────────
let isAdmin = false;
let state = { queue: [], currentIndex: -1, isPlaying: false, currentTime: 0 };
let masterTimer = null;
const ap = document.getElementById('ap');

// 昵称 & IP
let myIP = '';
let myIPNick = '';

function getNick() {
  const custom = (document.getElementById('nk').value || '').trim();
  if (custom && custom !== myIPNick) return custom;
  return myIPNick || '匿名';
}

// ── Socket 事件监听（房间隔离版）─────────────────────────────
socket.on('connect', () => { if (!masterTimer) startMaster(); });
socket.on('state_sync', onStateSync);
socket.on('room:joined', (data) => {
  // 加入房间后服务端推送的初始状态，立即应用播放队列和进度
  initAfterRoomJoin(data);
});
socket.on('time_sync', ({ time }) => {
  if (Math.abs(ap.currentTime - time) > 5) ap.currentTime = time;
});
socket.on('online_users', n => { document.getElementById('oc').textContent = n; });
socket.on('toast', ({ msg, type }) => toast(msg, type));

// 房主转让事件
socket.on('room:owner_changed', (data) => {
  if (data.newOwner === socket.id) {
    isAdmin = true;
    toast('房主已退出，你已成为新房主（管理员）', 'info');
  } else {
    toast(`房主「${data.oldOwner || '未知'}」已退出，管理员转让给「${data.nickname || '匿名'}」`, 'info');
  }
});

let lastLoadedUid = null;

function onStateSync(s) {
  const isFirst = !state._synced;
  state = s;
  state._synced = true;
  renderQueue();
  updatePlayerUI();

  const cur = s.queue[s.currentIndex];
  const curUid = cur?.uid ?? null;
  const shouldLoad = isFirst || (curUid !== lastLoadedUid);

  if (shouldLoad) {
    lastLoadedUid = curUid;
    if (cur && cur.url) {
      ap.src = cur.url;
      ap.currentTime = isFirst ? (s.currentTime || 0) : 0;
      if (s.isPlaying) ap.play().catch(() => { });
      fetchLyric(cur.id, cur.source, cur._lyrics || '');
    } else {
      ap.src = '';
      ap.pause();
      updateLyricUI(-1);
    }
    return;
  }

  if (s.isPlaying && ap.paused && cur) ap.play().catch(() => { });
  else if (!s.isPlaying && !ap.paused) ap.pause();

  syncAddedButtons(s.queue);
}

function syncAddedButtons(queue) {
  const queueIds = new Set(queue.map(s => s.id + '|' + (s.source || 'qq')));

  // 搜索结果列表
  searchResults.forEach((s, i) => {
    const btn = document.getElementById('addbtn-' + i);
    if (!btn) return;
    const inQueue = queueIds.has(s.id + '|' + (s.source || 'qq'));
    if (inQueue) {
      btn.disabled = true;
      btn.textContent = '✓ 已点';
    } else {
      btn.disabled = false;
      btn.textContent = '＋ 点歌';
      btn.style.borderColor = '';
      btn.style.color = '';
    }
  });

  // 热门推荐列表
  const activeType = document.querySelector('.htab.active')?.dataset.type || 'hot';
  const hotSongs = hotListCache[activeType]?.songs || [];
  hotSongs.forEach((s, i) => {
    const btn = document.getElementById('hotbtn-' + i);
    if (!btn) return;
    const inQueue = queueIds.has(s.id + '|' + (s.source || 'nc'));
    if (inQueue) {
      btn.disabled = true;
      btn.textContent = '✓';
      btn.style.borderColor = 'var(--qq-color)';
      btn.style.color = 'var(--qq-color)';
    } else {
      btn.disabled = false;
      btn.textContent = '＋';
      btn.style.borderColor = '';
      btn.style.color = '';
    }
  });
}

function startMaster() {
  masterTimer = setInterval(() => {
    if (!isAdmin) return;
    const cur = state.queue[state.currentIndex];
    if (cur) socket.emit('report_time', { uid: cur.uid, time: document.getElementById('ap').currentTime });
  }, 3000);
}

// ── 加入房间后的初始化 ──────────────────────────────────────
function initAfterRoomJoin(data) {
  isAdmin = data.isAdmin || false;

  // 如果服务端返回了初始状态，直接应用（避免等 state_sync）
  if (data.state) {
    onStateSync(data.state);
  }
  if (data.opLogs) {
    renderLogs(data.opLogs);
  }
}

// 初始化昵称
(() => {
  const s = localStorage.getItem('jk_nick');
  if (s) document.getElementById('nk').value = s;
  document.getElementById('nk').addEventListener('input', function () { localStorage.setItem('jk_nick', this.value); });
})();
