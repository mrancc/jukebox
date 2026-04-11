const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path    = require('path');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

app.use(express.json());
app.use(express.static(path.join(__dirname)));

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// ─────────────────────────────────────────
// 代理到 musicAPI（默认 localhost:8001，线上通过 MUSIC_API_URL 环境变量配置）
// ─────────────────────────────────────────
const MUSIC_API = process.env.MUSIC_API_URL || 'http://localhost:8001';

function musicApiGet(apiPath) {
  const url = new URL(MUSIC_API + apiPath);
  const lib = url.protocol === 'https:' ? require('https') : http;
  return new Promise((resolve, reject) => {
    lib.get(url, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// ─────────────────────────────────────────
// 搜索接口（走 musicAPI QQ 搜索）
// ─────────────────────────────────────────
app.get('/api/search', async (req, res) => {
  const { q, limit = 20 } = req.query;
  if (!q) return res.json({ songs: [] });

  try {
    const data = await musicApiGet(`/api/search/song/qq?key=${encodeURIComponent(q)}&limit=${limit}&page=1`);
    if (!data.success) throw new Error(data.message || '搜索失败');

    const songs = (data.songList || []).map(s => ({
      id:       String(s.id),
      name:     s.name,
      artist:   s.artists?.map(a => a.name).join(' / ') || '未知',
      album:    s.album?.name || '',
      cover:    s.album?.cover || s.album?.coverSmall || '',
      duration: s.duration || 0,
      needPay:  s.needPay || false,
      source:   'qq',
    }));

    console.log('✅ QQ搜索命中，找到', songs.length, '首');
    return res.json({ songs });
  } catch (e) {
    console.warn('❌ QQ搜索失败', e.message);
    return res.json({ songs: [], error: '搜索失败：' + e.message });
  }
});

// ─────────────────────────────────────────
// iTunes 备用：通过歌曲名+歌手获取播放链接
// ─────────────────────────────────────────
const https = require('https');

function itunesSearch(name, artist) {
  const term = encodeURIComponent(`${name} ${artist}`);
  return new Promise((resolve, reject) => {
    const url = `https://itunes.apple.com/search?term=${term}&media=music&limit=5`;
    https.get(url, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const data = JSON.parse(d);
          resolve(data.results || []);
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// ─────────────────────────────────────────
// 播放 URL 获取（优先 QQ → 失败回退 iTunes）
// ─────────────────────────────────────────
app.get('/api/song/url', async (req, res) => {
  const { id, source = 'qq', name, artist } = req.query;
  if (!id) return res.json({ url: null });

  // 1. 先尝试 QQ 源
  try {
    const data = await musicApiGet(`/api/get/song/${source}?id=${encodeURIComponent(id)}`);
    if (data.success && data.url) {
      console.log('✅ QQ播放链接获取成功');
      return res.json({ url: data.url });
    }
    console.warn('⚠️ QQ返回无链接：', data.message || 'unknown');
  } catch (e) {
    console.warn('⚠️ QQ获取失败：', e.message);
  }

  // 2. QQ 失败，尝试 iTunes 备用
  if (!name && !artist) {
    return res.json({ url: null, error: 'QQ - 歌曲需要付费或无法获取' });
  }

  try {
    console.log('🔄 尝试 iTunes 备用搜索：', name, artist);
    const results = await itunesSearch(name, artist);
    if (results.length > 0 && results[0].previewUrl) {
      console.log('✅ iTunes 备用链接获取成功');
      return res.json({ url: results[0].previewUrl, from: 'itunes' });
    }
    throw new Error('iTunes 未找到预览');
  } catch (e) {
    console.warn('❌ iTunes 备用也失败：', e.message);
    return res.json({ url: null, error: 'QQ 和 iTunes 均无法获取播放链接' });
  }
});

// ─────────────────────────────────────────
// Socket.io 事件处理（队列 & 播放控制）
// ─────────────────────────────────────────
const state = {
  queue: [],
  currentIndex: -1,
  isPlaying: false,
  currentTime: 0,
};

let uidCounter = 0;

function broadcastState() {
  io.emit('state_sync', state);
}

// 用户加入时推送状态
io.on('connection', (socket) => {
  console.log('🔌 用户连接:', socket.id);
  io.emit('online_users', io.engine.clientsCount);

  // 连接时推送当前状态
  socket.emit('state_sync', state);

  // 点歌
  socket.on('add_song', ({ song, nickname }, callback) => {
    if (!song || !song.url) {
      if (callback) callback({ ok: false, msg: '无效的歌曲' });
      return;
    }
    const uid = ++uidCounter;
    const item = {
      uid,
      name: song.name,
      artist: song.artist,
      album: song.album || '',
      cover: song.cover || '',
      url: song.url,
      duration: song.duration || 0,
      requester: nickname || '匿名',
    };
    state.queue.push(item);
    broadcastState();
    io.emit('toast', { msg: `${nickname || '匿名'} 点了「${song.name}」`, type: 'success' });
    if (callback) callback({ ok: true });

    // 如果当前没有在播放，自动开始
    if (state.queue.length === 1 && state.currentIndex < 0) {
      state.currentIndex = 0;
      state.isPlaying = true;
      state.currentTime = 0;
      broadcastState();
    }
  });

  // 上报播放进度
  socket.on('report_time', ({ uid, time }) => {
    if (state.queue[state.currentIndex]?.uid === uid) {
      state.currentTime = time;
      io.emit('time_sync', { time });
    }
  });

  // 播放/暂停
  socket.on('toggle_play', () => {
    state.isPlaying = !state.isPlaying;
    broadcastState();
  });

  // 下一首
  socket.on('next_song', () => {
    if (state.currentIndex < state.queue.length - 1) {
      state.currentIndex++;
      state.currentTime = 0;
      state.isPlaying = true;
    } else if (state.queue.length > 0) {
      // 循环到第一首
      state.currentIndex = 0;
      state.currentTime = 0;
      state.isPlaying = true;
    }
    broadcastState();
  });

  // 歌曲播放结束 → 自动切下一首（不删除队列中的歌）
  socket.on('song_ended', ({ uid }) => {
    if (state.queue[state.currentIndex]?.uid === uid) {
      if (state.queue.length <= 1) {
        // 只有一首歌，循环播放
        state.currentTime = 0;
        state.isPlaying = true;
      } else if (state.currentIndex < state.queue.length - 1) {
        // 还有下一首
        state.currentIndex++;
        state.currentTime = 0;
        state.isPlaying = true;
      } else {
        // 最后一首播完，回到第一首循环
        state.currentIndex = 0;
        state.currentTime = 0;
        state.isPlaying = true;
      }
      broadcastState();
    }
  });

  // 删除歌曲
  socket.on('remove_song', ({ uid }) => {
    const idx = state.queue.findIndex(s => s.uid === uid);
    if (idx === -1) return;
    state.queue.splice(idx, 1);
    if (idx === state.currentIndex) {
      if (state.queue.length === 0) {
        state.currentIndex = -1;
        state.isPlaying = false;
        state.currentTime = 0;
      } else if (state.currentIndex >= state.queue.length) {
        state.currentIndex = 0;
        state.currentTime = 0;
      }
    } else if (idx < state.currentIndex) {
      state.currentIndex--;
    }
    broadcastState();
  });

  // 清空队列
  socket.on('clear_queue', () => {
    state.queue = [];
    state.currentIndex = -1;
    state.isPlaying = false;
    state.currentTime = 0;
    broadcastState();
  });

  // 管理员登录
  socket.on('admin_login', ({ password }, callback) => {
    if (password === ADMIN_PASSWORD) {
      if (callback) callback({ ok: true });
    } else {
      if (callback) callback({ ok: false });
    }
  });

  // 断开连接
  socket.on('disconnect', () => {
    console.log('🔌 用户断开:', socket.id);
    io.emit('online_users', io.engine.clientsCount);
  });
});

// ─────────────────────────────────────────
// 启动
// ─────────────────────────────────────────
const PORT = process.env.PORT || 3000;

// Railway 需要监听 '::' 或 '0.0.0.0'
const HOST = process.env.RAILWAY_ENVIRONMENT ? '::' : '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`🎵 三源点歌台已启动：端口 ${PORT}`);
});