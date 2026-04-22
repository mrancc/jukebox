// ── 搜索 ─────────────────────────────────────────────────────
let searchSource = 'all';
let searchTab = 'native'; // 'native' = 音乐搜索（QQ/网易云）, 'agg' = 聚合搜索

// 搜索 Tab 切换
function switchSearchTab(tab, btnEl) {
  searchTab = tab;
  document.querySelectorAll('.stab').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  const filter = document.getElementById('src-filter');
  filter.style.display = tab === 'agg' ? 'none' : '';
  searchResults = [];
  document.getElementById('search-results').innerHTML = '<div class="tip">搜索歌曲后在这里点歌 🎶</div>';
}

// 搜索源筛选
document.querySelectorAll('.src-opt').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.src-opt').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    searchSource = btn.dataset.src;
  });
});

document.getElementById('si').addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

async function doSearch() {
  const q = document.getElementById('si').value.trim();
  if (!q) return;
  const box = document.getElementById('search-results');
  const sbtn = document.getElementById('btn-search');
  box.innerHTML = '<div class="tip"><div class="spin"></div>搜索中…</div>';
  sbtn.disabled = true;

  try {
    if (searchTab === 'agg') {
      const r = await fetch('/api/agg-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: q })
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      if (data.code === 200 && Array.isArray(data.data) && data.data.length) {
        const songs = data.data.map(item => {
          let secs = 0;
          if (item.duration) {
            const parts = String(item.duration).split(':');
            secs = parts.length >= 2 ? parseInt(parts[0]) * 60 + parseInt(parts[1]) : 0;
          }
          return {
            id: String(item.id || ''),
            name: item.song_name || '',
            artist: item.singer || '',
            cover: item.cover_url || '',
            duration: secs * 1000,
            source: 'agg',
            lyrics: item.lyrics || '',
            _mp3Url: item.mp3_url || '',
          };
        });
        renderResults(songs);
      } else {
        box.innerHTML = '<div class="tip">' + esc(data.msg || '未找到相关歌曲，换个关键词试试 🎵') + '</div>';
      }
    } else {
      const data = await apiSearch(q, searchSource);
      renderResults(data.songs || []);
      if (data.error) toast('⚠️ ' + data.error, 'warning');
    }
  } catch (e) {
    box.innerHTML = `<div class="tip">搜索失败：${esc(e.message)}<br/><small>请检查网络连接后重试</small></div>`;
  } finally {
    sbtn.disabled = false;
  }
}

// 存储搜索结果
let searchResults = [];

function renderResults(songs) {
  searchResults = songs;
  const box = document.getElementById('search-results');
  if (!songs.length) {
    box.innerHTML = '<div class="tip">没有找到相关歌曲，换个关键词试试 🎵</div>';
    return;
  }
  box.innerHTML = songs.map((s, i) => {
    let srcLabel = '', srcStyle = '';
    if (s.source === 'nc') { srcLabel = '网易云'; srcStyle = 'color:var(--nc-color);background:var(--hot-active-bg)'; }
    else if (s.source === 'qq') { srcLabel = 'QQ'; srcStyle = 'color:var(--qq-color);background:rgba(var(--accent-rgb),.1)'; }
    else if (s.source === 'agg') { srcLabel = '聚合'; srcStyle = 'color:var(--accent);background:rgba(var(--accent-rgb),.1)'; }
    return `
    <div class="si">
      ${s.cover
            ? `<img class="scover" src="${s.cover}" onerror="this.outerHTML='<div class=scover-ph>🎵</div>'" alt="">`
            : `<div class="scover-ph">🎵</div>`}
      <div class="sinfo">
        <div class="sname">${esc(s.name)}${s.needPay ? ' <span style="font-size:.68rem;color:#fbbf24;background:rgba(251,191,36,.12);border-radius:3px;padding:1px 5px;">VIP</span>' : ''} <span style="font-size:.6rem;${srcStyle};border-radius:3px;padding:1px 5px;">${srcLabel}</span></div>
        <div class="smeta">${esc(s.artist)}${s.album ? ' · ' + esc(s.album) : ''}</div>
      </div>
      ${s.duration ? `<div class="sdur">${fmt(s.duration)}</div>` : ''}
      <button class="btn-add" id="addbtn-${i}" onclick="addSong(${i})">＋ 点歌</button>
    </div>`;
  }).join('');
}

async function addSong(idx) {
  const song = searchResults[idx];
  if (!song) return;
  const btn = document.getElementById('addbtn-' + idx);
  btn.disabled = true; btn.textContent = '获取中…';

  try {
    let url;
    if (song.source === 'agg') {
      // 聚合源：调 /api/agg-play 获取真实播放链接
      const pr = await fetch('/api/agg-play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: song.id }),
      });
      const pdata = await pr.json();
      if (!pdata.ok) throw new Error(pdata.error || '聚合点歌失败');
      url = pdata.url;
      // 用 play_music 返回的数据覆盖
      if (pdata.cover) song.cover = pdata.cover;
      if (pdata.lyrics) song._lyrics = pdata.lyrics;
      if (pdata.duration) {
        const parts = String(pdata.duration).split(':');
        song.duration = parts.length >= 2
          ? (parseInt(parts[0]) * 60 + parseInt(parts[1])) * 1000
          : song.duration;
      }
    } else {
      const result = await apiSongUrl(song.id, song.source, song.name, song.artist);
      url = result.url;
      if (!url) throw new Error(result.error || '无法获取播放链接');
      if (result.from === 'itunes') toast('💡 国内源无版权，已通过 iTunes 播放预览版', 'info');
    }
    const nickname = document.getElementById('nk').value.trim() || '匿名';
    const songData = { ...song, url };
    socket.emit('add_song', { song: songData, nickname }, (res) => {
      if (!res.ok) {
        btn.disabled = false;
        btn.textContent = '＋ 点歌';
      }
    });
    btn.textContent = '✓ 已点';
  } catch (e) {
    console.log(JSON.stringify(e.message))
    toast('点歌失败：' + e.message, 'error');
    btn.disabled = false; btn.textContent = '＋ 点歌';
  }
}
