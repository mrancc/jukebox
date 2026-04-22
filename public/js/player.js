// ── 播放器 UI ────────────────────────────────────────────────
function updatePlayerUI() {
  const cur = state.queue[state.currentIndex];
  document.getElementById('btn-play').textContent = state.isPlaying ? '⏸' : '▶';
  if (cur) {
    document.getElementById('pn').textContent = cur.name;
    document.getElementById('pa').textContent = cur.artist;
    document.getElementById('pc').src = cur.cover || '';
    document.getElementById('tt').textContent = cur.duration ? fmt(cur.duration) : '–';
  } else {
    document.getElementById('pn').textContent = '暂无播放';
    document.getElementById('pa').textContent = '—';
    document.getElementById('pc').src = '';
    document.getElementById('pf').style.width = '0%';
    document.getElementById('tc').textContent = '0:00';
    document.getElementById('tt').textContent = '0:00';
    document.getElementById('lyric-cur').textContent = '';
    document.getElementById('lyric-next').textContent = '';
  }
}

function seekTo(e) {
  if (!isAdmin) return;
  const r = e.offsetX / e.currentTarget.offsetWidth;
  if (ap.duration) ap.currentTime = r * ap.duration;
}

// ── 音频事件 ─────────────────────────────────────────────────
ap.addEventListener('timeupdate', () => {
  if (!lyricModalOpen) return;
  const d = ap.duration || (state.queue[state.currentIndex]?.duration || 1000) / 1000;
  document.getElementById('lm-pf').style.width = (ap.currentTime / d * 100).toFixed(1) + '%';
  document.getElementById('lm-tc').textContent = fmt(Math.floor(ap.currentTime * 1000));
  document.getElementById('lm-tt').textContent = d > 1 ? fmt(Math.floor(d * 1000)) : '0:00';
});

ap.addEventListener('timeupdate', () => {
  const cur = state.queue[state.currentIndex];
  if (!cur) return;
  const d = ap.duration || (cur.duration || 1000) / 1000;
  document.getElementById('pf').style.width = (ap.currentTime / d * 100).toFixed(1) + '%';
  document.getElementById('tc').textContent = fmt(Math.floor(ap.currentTime * 1000));
  const newIdx = findLyricLine(ap.currentTime);
  if (newIdx !== lyricIdx) {
    lyricIdx = newIdx;
    updateLyricUI(lyricIdx);
  }
});
ap.addEventListener('ended', () => {
  updateLyricUI(-1);
  const cur = state.queue[state.currentIndex];
  if (cur) socket.emit('song_ended', { uid: cur.uid });
});
ap.addEventListener('error', () => {
  updateLyricUI(-1);
  if (!ap.src || ap.src === location.href) return;
  toast('⚠️ 当前歌曲无法播放，2秒后自动跳过', 'warning');
  setTimeout(() => {
    const cur = state.queue[state.currentIndex];
    if (cur) socket.emit('song_ended', { uid: cur.uid });
  }, 2000);
});

// 网络卡顿导致播放中断时自动恢复
ap.addEventListener('stalled', () => {
  if (ap.src && state.isPlaying) {
    setTimeout(() => {
      if (ap.paused && state.isPlaying) ap.play().catch(() => { });
    }, 1500);
  }
});
ap.addEventListener('waiting', () => {
  if (ap.src && state.isPlaying) {
    setTimeout(() => {
      if (ap.paused && state.isPlaying) ap.play().catch(() => { });
    }, 3000);
  }
});

// ── 音量控制 ────────────────────────────────────────────────
const volSlider = document.getElementById('vol-slider');
const volIcon = document.getElementById('vol-icon');
let lastVolume = 80;
let isMuted = false;

const savedVol = localStorage.getItem('jk_vol');
if (savedVol !== null) {
  volSlider.value = savedVol;
  ap.volume = savedVol / 100;
} else {
  ap.volume = 0.8;
}

function setVolume(val) {
  const v = parseInt(val);
  ap.volume = v / 100;
  isMuted = v === 0;
  lastVolume = v > 0 ? v : lastVolume;
  updateVolIcon();
  localStorage.setItem('jk_vol', v);
}

function toggleMute() {
  if (isMuted) {
    ap.volume = lastVolume / 100;
    volSlider.value = lastVolume;
    isMuted = false;
  } else {
    lastVolume = parseInt(volSlider.value) || 80;
    ap.volume = 0;
    volSlider.value = 0;
    isMuted = true;
  }
  updateVolIcon();
}

function updateVolIcon() {
  const v = ap.volume;
  if (v === 0 || isMuted) volIcon.textContent = '🔇';
  else if (v < 0.4) volIcon.textContent = '🔈';
  else if (v < 0.7) volIcon.textContent = '🔉';
  else volIcon.textContent = '🔊';
}
