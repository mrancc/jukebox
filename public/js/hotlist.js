// ── 热门推荐 ─────────────────────────────────────────────────
let hotListCache = {};

async function loadHotList(type = 'hot', btnEl) {
  document.querySelectorAll('.htab').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');

  const box = document.getElementById('hot-list');

  if (hotListCache[type]) {
    renderHotList(hotListCache[type]);
    return;
  }

  box.innerHTML = '<div class="tip"><div class="spin"></div>加载中…</div>';

  try {
    const r = await fetch(`/api/hotlist?type=${type}`);
    const data = await r.json();
    hotListCache[type] = data;
    renderHotList(data);
  } catch (e) {
    box.innerHTML = `<div class="tip">加载失败：${esc(e.message)}</div>`;
  }
}

function renderHotList(data) {
  const box = document.getElementById('hot-list');
  const songs = data.songs || [];
  if (!songs.length) {
    box.innerHTML = '<div class="tip">暂无数据</div>';
    return;
  }

  box.innerHTML = songs.map((s, i) => `
    <div class="hot-item">
      <div class="hot-rank ${i < 3 ? 'top' : ''}">${i + 1}</div>
      ${s.cover
      ? `<img class="hot-cover" src="${s.cover}" onerror="this.outerHTML='<div class=hot-cover-ph>🎵</div>'" alt="">`
      : `<div class="hot-cover-ph">🎵</div>`}
      <div class="hot-info">
        <div class="hot-name">${esc(s.name)}${s.needPay ? ' <span style="font-size:.6rem;color:#fbbf24;">VIP</span>' : ''}</div>
        <div class="hot-sub">${esc(s.artist)}${s.album ? ' · ' + esc(s.album) : ''}</div>
      </div>
      ${s.duration ? `<div class="hot-dur">${fmt(s.duration)}</div>` : ''}
      <button class="hot-add" id="hotbtn-${i}" onclick="addHotSong(${i})" title="点歌">＋</button>
    </div>
  `).join('');
}

async function addHotSong(idx) {
  const data = hotListCache[document.querySelector('.htab.active')?.dataset.type || 'hot'];
  const song = data?.songs?.[idx];
  if (!song) return;

  const btn = document.getElementById('hotbtn-' + idx);
  if (!btn || btn.disabled) return;
  btn.disabled = true;
  btn.textContent = '…';

  try {
    const result = await apiSongUrl(song.id, song.source, song.name, song.artist);
    let url = result.url;
    if (!url) throw new Error(result.error || '无法获取播放链接');
    if (result.from === 'itunes') toast('💡 国内源无版权，已通过 iTunes 播放预览版', 'info');
    const nickname = document.getElementById('nk').value.trim() || '匿名';
    const songData = { ...song, url };
    if (song.source === 'agg' && song.lyrics) songData._lyrics = song.lyrics;
    socket.emit('add_song', { song: songData, nickname }, (res) => {
      if (!res.ok) {
        btn.disabled = false;
        btn.textContent = '＋';
        btn.style.borderColor = '';
        btn.style.color = '';
      }
    });
    btn.textContent = '✓';
    btn.style.borderColor = 'var(--qq-color)';
    btn.style.color = 'var(--qq-color)';
  } catch (e) {
    toast('点歌失败：' + e.message, 'error');
    btn.disabled = false;
    btn.textContent = '＋';
  }
}

// 页面加载时自动加载热歌榜
loadHotList('hot');
