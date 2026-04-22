// ── 歌词 ─────────────────────────────────────────────────────
let lyricLines = [];   // [{time, text}, ...]
let lyricIdx = -1;     // 当前歌词行索引
let lyricSongId = '';  // 当前歌词对应的歌曲 ID

// 解析 LRC 格式歌词为 [{time, text}, ...]
function parseLyricText(raw) {
  if (!raw || typeof raw !== 'string') return [];
  const lrcReg = /\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\](.*)/g;
  const lines = [];
  let m;
  while ((m = lrcReg.exec(raw)) !== null) {
    const min = parseInt(m[1], 10);
    const sec = parseInt(m[2], 10);
    const ms = m[3] ? parseInt(m[3].padEnd(3, '0'), 10) : 0;
    const time = min * 60 + sec + ms / 1000;
    const text = m[4].trim();
    if (text) lines.push({ time, text });
  }
  if (lines.length) {
    lines.sort((a, b) => a.time - b.time);
    return lines;
  }
  const textLines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  return textLines.map((text, i) => ({ time: i * 4, text }));
}

async function fetchLyric(id, source, lyricsRaw) {
  if (source === 'agg' && lyricsRaw) {
    lyricLines = parseLyricText(lyricsRaw);
    lyricSongId = String(id);
    lyricIdx = -1;
    updateLyricUI(-1);
    return;
  }
  if (source !== 'nc') {
    lyricLines = [];
    lyricSongId = '';
    updateLyricUI(-1);
    return;
  }
  lyricSongId = '';
  try {
    const r = await fetch(`/api/lyric?id=${id}&source=nc`);
    const data = await r.json();
    lyricLines = data.lines || [];
    lyricSongId = String(id);
    console.log('📜 歌词加载:', lyricLines.length, '行');
  } catch (e) {
    lyricLines = [];
    lyricSongId = '';
  }
  lyricIdx = -1;
  updateLyricUI(-1);
}

function updateLyricUI(idx) {
  const curEl = document.getElementById('lyric-cur');
  const nextEl = document.getElementById('lyric-next');
  const tipEl = document.getElementById('lyric-expand-tip');
  if (!lyricLines.length || idx < 0 || idx >= lyricLines.length) {
    curEl.textContent = '';
    nextEl.textContent = '';
    if (tipEl) tipEl.style.display = 'none';
    if (window._lyricFlyClear) window._lyricFlyClear();
    return;
  }
  curEl.textContent = lyricLines[idx].text;
  nextEl.textContent = (idx + 1 < lyricLines.length) ? lyricLines[idx + 1].text : '';
  if (tipEl) tipEl.style.display = 'block';
  if (window._lyricFlyTrigger) window._lyricFlyTrigger(lyricLines[idx].text);
  if (document.getElementById('lyric-modal').classList.contains('show')) {
    renderLyricModal(idx);
  }
}

function findLyricLine(time) {
  if (!lyricLines.length) return -1;
  let lo = 0, hi = lyricLines.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lyricLines[mid].time <= time) lo = mid;
    else hi = mid - 1;
  }
  return lyricLines[lo].time <= time ? lo : -1;
}

// ── 歌词全屏弹窗 ──────────────────────────────────────
let lyricModalOpen = false;
let lyricModalScrollTimer = null;

function openLyricModal() {
  const cur = state.queue[state.currentIndex];
  if (!cur) return;

  lyricModalOpen = true;
  const modal = document.getElementById('lyric-modal');
  modal.classList.add('show');

  document.getElementById('lyric-modal-name').textContent = cur.name;
  document.getElementById('lyric-modal-artist').textContent = cur.artist;
  document.getElementById('lyric-modal-cover').src = cur.cover || '';

  const body = document.getElementById('lyric-modal-body');
  if (!lyricLines.length) {
    body.innerHTML = '<div class="lyric-modal-empty">暂无歌词 🎵</div>';
    return;
  }

  body.innerHTML = lyricLines.map((l, i) => `
    <div class="lyric-modal-line" data-idx="${i}" onclick="seekToLyric(${i})">${esc(l.text)}</div>
  `).join('');

  requestAnimationFrame(() => {
    renderLyricModal(lyricIdx);
  });
}

function closeLyricModal() {
  lyricModalOpen = false;
  document.getElementById('lyric-modal').classList.remove('show');
  if (lyricModalScrollTimer) {
    clearInterval(lyricModalScrollTimer);
    lyricModalScrollTimer = null;
  }
}

function renderLyricModal(activeIdx) {
  const body = document.getElementById('lyric-modal-body');
  const lines = body.querySelectorAll('.lyric-modal-line');
  if (!lines.length) return;

  lines.forEach((el, i) => {
    el.classList.remove('active', 'near');
    if (i === activeIdx) {
      el.classList.add('active');
    } else if (Math.abs(i - activeIdx) <= 2) {
      el.classList.add('near');
    }
  });

  const activeEl = lines[activeIdx];
  if (activeEl) {
    const target = body.querySelector(`[data-idx="${activeIdx}"]`);
    if (target) {
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }
}

function seekToLyric(idx) {
  if (!isAdmin) return;
  if (lyricLines[idx]) {
    ap.currentTime = lyricLines[idx].time;
  }
}

function lyricSeekTo(e) {
  if (!isAdmin) return;
  const bar = e.currentTarget;
  const ratio = e.offsetX / bar.offsetWidth;
  if (ap.duration) ap.currentTime = ratio * ap.duration;
}
