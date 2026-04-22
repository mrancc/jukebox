const express = require('express');
const http    = require('http');
const https   = require('https');
const { Server } = require('socket.io');
const path    = require('path');
const fs      = require('fs');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

// ─── 网易云 Cookie（VIP 账号支持）──────────────────────
function loadNcCookie() {
  try {
    const f = path.join(__dirname, 'nc_cookie.txt');
    if (fs.existsSync(f)) return fs.readFileSync(f, 'utf-8').trim();
  } catch(e) {}
  return '';
}
const NC_COOKIE = loadNcCookie();
if (NC_COOKIE) console.log('✅ 已加载网易云 Cookie');
else console.log('ℹ️ 未检测到网易云 Cookie（VIP 歌曲将无法播放），运行 node nc_login.js 扫码登录');

app.use(express.json());
// express.static 放在页面路由之后（见底部），防止 / 被静态 index.html 抢先匹配

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';

// ─────────────────────────────────────────
// QQ 音乐 API（直接调用底层接口，参考 NET-MusicAPI）
// ─────────────────────────────────────────
const QQ_HEADERS = {
  'Referer': 'http://y.qq.com',
  'User-Agent': 'QQ%E9%9F%B3%E4%B9%90/54409 CFNetwork/901.1 Darwin/17.6.0 (x86_64)',
  'Cookie': 'pgv_pvi=22038528; pgv_si=s3156287488; pgv_pvid=5535248600; yplayer_open=1; ts_last=y.qq.com/portal/player.html; ts_uid=4847550686; yq_index=0; qqmusic_fromtag=66; player_exist=1',
};

function httpGet(url, headers = {}) {
  const lib = url.startsWith('https') ? https : http;
  return new Promise((resolve, reject) => {
    lib.get(url, { headers }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode >= 300) reject(new Error(`HTTP ${res.statusCode}`));
        else resolve(d);
      });
    }).on('error', reject);
  });
}

function httpPost(url, body, headers = {}) {
  const lib = url.startsWith('https') ? https : http;
  return new Promise((resolve, reject) => {
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
    const req = lib.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr), ...headers },
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(d));
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

// QQ 搜索（2025.9 新接口，走 musicu.fcg）
async function qqSearch(keyword, limit = 20, page = 1) {
  const payload = {
    comm: { ct: '19', cv: '1859', uin: '0' },
    req: {
      method: 'DoSearchForQQMusicDesktop',
      module: 'music.search.SearchCgiService',
      param: { grp: 1, num_per_page: limit, page_num: page, query: keyword, search_type: 0 },
    },
  };
  const resp = JSON.parse(await httpPost('https://u.y.qq.com/cgi-bin/musicu.fcg', payload, QQ_HEADERS));
  const list = resp?.req?.data?.body?.song?.list || [];
  return list.map(s => {
    const albumMid = s.album?.mid || s.album?.albummid || '';
    return {
      id:       s.mid || String(s.id),
      name:     s.name || s.title || '',
      artist:   (s.singer || []).map(a => a.name || a.title).join(' / '),
      album:    s.album?.name || s.album?.title || '',
      cover:    albumMid ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${albumMid}.jpg` : '',
      duration: Math.floor((s.interval || s.pubtime || 0) * 1000),
      needPay:  (s.pay?.pay_play || 0) > 0,
      source:   'qq',
    };
  });
}

// QQ 获取播放链接
const QUALITY_MAP = [
  { br: 999, prefix: 'F000', ext: '.flac' },
  { br: 320, prefix: 'M800', ext: '.mp3' },
  { br: 192, prefix: 'C600', ext: '.m4a' },
  { br: 128, prefix: 'M500', ext: '.mp3' },
  { br: 96,  prefix: 'C400', ext: '.m4a' },
  { br: 48,  prefix: 'C200', ext: '.m4a' },
];

async function qqGetSongUrl(mid) {
  for (const q of QUALITY_MAP) {
    const filename = `${q.prefix}${mid}${mid}${q.ext}`;
    const payload = {
      req_1: {
        module: 'vkey.GetVkeyServer', method: 'CgiGetVkey',
        param: { filename: [filename], guid: '10000', songmid: [mid], songtype: [0], uin: '0', loginflag: 1, platform: '20' },
      },
      loginUin: '0',
      comm: { uin: '0', format: 'json', ct: 24, cv: 0 },
    };
    try {
      const resp = JSON.parse(await httpPost('https://u.y.qq.com/cgi-bin/musicu.fcg', payload, QQ_HEADERS));
      const purl = resp?.req_1?.data?.midurlinfo?.[0]?.purl;
      const sip  = resp?.req_1?.data?.sip;
      if (purl && sip?.length > 0) {
        const baseUrl = sip[1] || sip[0] || '';
        return (baseUrl + purl).replace('http://', 'https://');
      }
    } catch (e) {}
  }
  return null;
}

// ─────────────────────────────────────────
// 网易云音乐 API
// ─────────────────────────────────────────
const NeteaseCloudMusicApi = require('NeteaseCloudMusicApi');

async function ncSearch(keyword, limit = 20, page = 1) {
  const result = await NeteaseCloudMusicApi.search({
    keywords: keyword, limit, type: 1, offset: (page - 1) * limit,
    cookie: NC_COOKIE,
  });
  const songs = result?.body?.result?.songs || [];
  if (songs.length === 0) return [];

  const ids = songs.map(s => s.id).join(',');
  let coverMap = {};
  try {
    const detailResult = await NeteaseCloudMusicApi.song_detail({ ids, cookie: NC_COOKIE });
    const details = detailResult?.body?.songs || [];
    details.forEach(d => {
      const picUrl = d.al?.picUrl || '';
      coverMap[String(d.id)] = picUrl ? picUrl.replace('http://', 'https://') : '';
    });
  } catch (e) {}

  return songs.map(s => ({
    id:       String(s.id),
    name:     s.name || '',
    artist:   (s.artists || []).map(a => a.name).join(' / '),
    album:    s.album?.name || '',
    cover:    coverMap[String(s.id)] || '',
    duration: s.duration || 0,
    needPay:  s.fee === 1,
    source:   'nc',
  }));
}

async function ncGetSongUrl(id) {
  const result = await NeteaseCloudMusicApi.song_url_v1({ id, level: 'exhigh', encrypt: '1', cookie: NC_COOKIE });
  const item = result?.body?.data?.[0];
  if (item?.url && item?.code === 200) return item.url.replace('http://', 'https://');
  return null;
}

// ─────────────────────────────────────────
// iTunes 备用
// ─────────────────────────────────────────
function itunesSearch(name, artist) {
  const term = encodeURIComponent(`${name} ${artist}`);
  return new Promise((resolve, reject) => {
    https.get(`https://itunes.apple.com/search?term=${term}&media=music&limit=5`, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d).results || []); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// ─────────────────────────────────────────
// HTTP API（搜索、播放、歌词等 — 不涉及房间隔离）
// ─────────────────────────────────────────

// 热门歌单推荐
app.get('/api/hotlist', async (req, res) => {
  const { type = 'hot' } = req.query;
  const idxMap = { hot: 3, new: 1, surge: 0 };
  const nameMap = { hot: '热歌榜', new: '新歌榜', surge: '飙升榜' };
  const idx = idxMap[type] ?? 3;
  try {
    const top = await NeteaseCloudMusicApi.toplist_detail({ cookie: NC_COOKIE });
    const lists = top.body?.list || [];
    const playlist = lists[idx];
    if (!playlist?.id) throw new Error('排行榜数据为空');
    const result = await NeteaseCloudMusicApi.playlist_track_all({ id: playlist.id, limit: 50, cookie: NC_COOKIE });
    const tracks = result.body?.songs || result.body?.tracks || [];
    const songs = tracks.slice(0, 50).map(t => {
      const picUrl = t.al?.picUrl || '';
      return {
        id: String(t.id), name: t.name || '',
        artist: (t.ar || []).map(a => a.name).join(' / '),
        album: t.al?.name || '',
        cover: picUrl ? picUrl.replace('http://', 'https://') : '',
        duration: t.dt || 0, needPay: t.fee === 1, source: 'nc',
      };
    });
    res.json({ name: nameMap[type] || playlist.name, coverUrl: playlist.coverImgUrl || '', songCount: songs.length, songs });
  } catch (e) {
    console.warn('❌ 获取热门歌单失败:', e.message);
    res.json({ name: nameMap[type], songs: [], error: e.message });
  }
});

// 歌词接口
app.get('/api/lyric', async (req, res) => {
  const { id, source } = req.query;
  if (!id) return res.json({ lines: [] });
  if (source === 'nc') {
    try {
      const result = await NeteaseCloudMusicApi.lyric({ id, cookie: NC_COOKIE });
      const lrc = result.body?.lrc?.lyric || '';
      const tlyric = result.body?.tlyric?.lyric || '';
      const timeRe = /\[(\d{2}):(\d{2})\.(\d{2,3})(?:[^\]]*)?\](.*)/;
      const tLines = {};
      tlyric.split('\n').forEach(line => {
        const m = line.match(timeRe);
        if (m && m[4].trim()) {
          const time = parseInt(m[1]) * 60 + parseInt(m[2]) + parseInt(m[3]) / (m[3].length === 3 ? 1000 : 100);
          tLines[Math.round(time * 100)] = m[4].trim();
        }
      });
      const skipWords = ['作词', '作曲', '编曲', '制作', '和声', '吉他', '贝斯', '鼓', '录音', '混音', '母带', '助理', '出品', '版权', '联合', 'OP', 'OA', 'SP', 'SA', 'Publish', 'Music'];
      const lines = lrc.split('\n')
        .map(line => {
          const m = line.match(timeRe);
          if (!m) return null;
          const time = parseInt(m[1]) * 60 + parseInt(m[2]) + parseInt(m[3]) / (m[3].length === 3 ? 1000 : 100);
          const text = m[4].trim();
          if (!text) return null;
          if (time < 10) return null;
          const isMeta = skipWords.some(w => text.includes(w + '：') || text.includes(w + ':') || text.includes(w + ' ：') || text.includes(w + ' :'));
          if (isMeta) return null;
          const tKey = Math.round(time * 100);
          const translation = tLines[tKey] || '';
          const finalText = translation ? `${text} ${translation}` : text;
          return { time, text: finalText };
        })
        .filter(Boolean);
      res.json({ lines });
    } catch (e) {
      res.json({ lines: [] });
    }
  } else {
    res.json({ lines: [] });
  }
});

// 搜索接口
app.get('/api/search', async (req, res) => {
  const { q, limit = 20, source = 'all' } = req.query;
  if (!q) return res.json({ songs: [] });
  let qqSongs = [], ncSongs = [];
  if (source === 'all' || source === 'qq') {
    qqSongs = await qqSearch(q, limit, 1).catch(e => { console.warn('❌ QQ搜索失败', e.message); return []; });
  }
  if (source === 'all' || source === 'nc') {
    ncSongs = await ncSearch(q, limit, 1).catch(e => { console.warn('❌ 网易云搜索失败', e.message); return []; });
  }
  const songs = [...ncSongs, ...qqSongs].slice(0, limit);
  return res.json({ songs });
});

// 播放 URL 获取
app.get('/api/song/url', async (req, res) => {
  const { id, source = 'qq', name, artist } = req.query;
  if (!id) return res.json({ url: null });
  if (source === 'nc') {
    try {
      const url = await ncGetSongUrl(id);
      if (url) return res.json({ url });
    } catch (e) { console.warn('⚠️ 网易云获取失败：', e.message); }
  } else {
    try {
      const url = await qqGetSongUrl(id);
      if (url) return res.json({ url });
    } catch (e) { console.warn('⚠️ QQ获取失败：', e.message); }
  }
  if (!name && !artist) return res.json({ url: null, error: '歌曲需要付费或无法获取' });
  try {
    const results = await itunesSearch(name, artist);
    if (results.length > 0 && results[0].previewUrl) return res.json({ url: results[0].previewUrl, from: 'itunes' });
  } catch (e) { console.warn('❌ iTunes 备用也失败：', e.message); }
  return res.json({ url: null, error: '所有源均无法获取播放链接' });
});

// 聚合搜索代理
const NGROK_BASE = process.env.NGROK_BASE || 'https://photokinetic-readably-rosaura.ngrok-free.dev';
let ngrokSign = null;
let ngrokSignTime = 0;

async function getNgrokSign() {
  if (ngrokSign && Date.now() - ngrokSignTime < 5 * 60 * 1000) return ngrokSign;
  const r = await fetch(NGROK_BASE + '/get_sign', { headers: { 'ngrok-skip-browser-warning': 'true' } });
  const data = await r.json();
  if (data?.data?.sign) { ngrokSign = data.data.sign; ngrokSignTime = Date.now(); return ngrokSign; }
  throw new Error('获取签名失败');
}

app.post('/api/agg-search', async (req, res) => {
  const { name } = req.body;
  if (!name) return res.json({ code: 500, error: '缺少搜索关键词' });
  try {
    const sign = await getNgrokSign();
    const r = await fetch(NGROK_BASE + '/get_music', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
      body: JSON.stringify({ name, sign }),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    res.json(await r.json());
  } catch (e) {
    console.warn('⚠️ 聚合搜索失败：', e.message);
    res.json({ code: 500, error: e.message });
  }
});

// url-by-name
app.get('/api/song/url-by-name', async (req, res) => {
  const { name, artist } = req.query;
  if (!name) return res.json({ url: null, error: '缺少歌曲名' });

  async function trySource(searchFn, getUrlFn, sourceName) {
    try {
      const songs = await searchFn(name, 5, 1);
      if (!songs || songs.length === 0) return null;
      const artistParts = artist ? artist.split(/[/、,，&\s]+/).filter(Boolean) : [];
      const match =
        songs.find(s => s.name === name && artistParts.length > 0 && artistParts.some(a => s.artist.includes(a) || a.includes(s.artist.split(/[/、,，&]/)[0]))) ||
        songs.find(s => s.name === name) ||
        songs.find(s => s.name.includes(name) && artistParts.length > 0 && artistParts.some(a => s.artist.includes(a) || a.includes(s.artist.split(/[/、,，&]/)[0]))) ||
        songs.find(s => s.name.includes(name)) ||
        songs[0];
      const url = await getUrlFn(match.id);
      if (url) return { url, from: sourceName, matchedName: match.name, matchedArtist: match.artist };
    } catch (e) { console.warn('⚠️ ' + sourceName + '搜索获取失败：', e.message); }
    return null;
  }

  let result = await trySource(ncSearch, ncGetSongUrl, 'nc');
  if (result) return res.json(result);
  result = await trySource(qqSearch, qqGetSongUrl, 'qq');
  if (result) return res.json(result);
  try {
    const results = await itunesSearch(name, artist);
    if (results.length > 0 && results[0].previewUrl) return res.json({ url: results[0].previewUrl, from: 'itunes' });
  } catch (e) {}
  res.json({ url: null, error: '所有源均无法获取播放链接' });
});

// 聚合点歌：通过 play_music 接口获取真实播放链接
app.post('/api/agg-play', async (req, res) => {
  const { id } = req.body;
  if (!id) return res.json({ ok: false, error: '缺少歌曲 id' });
  try {
    const sign = await getNgrokSign();
    const r = await fetch(NGROK_BASE + '/play_music', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
      body: JSON.stringify({ sign, id }),
    });
    if (!r.ok) throw new Error('play_music HTTP ' + r.status);
    const resp = await r.json();
    // 返回格式: { code: 200, data: { id, cover_url, duration, lyrics, mp3_url }, msg }
    const d = resp.data;
    if (d && d.mp3_url) {
      res.json({
        ok: true,
        url: '/api/agg-proxy?url=' + encodeURIComponent(d.mp3_url),
        cover: d.cover_url || '',
        duration: d.duration || '',
        lyrics: d.lyrics || '',
      });
    } else {
      res.json({ ok: false, error: resp?.msg || 'play_music 未返回播放链接' });
    }
  } catch (e) {
    console.warn('⚠️ 聚合点歌失败：', e.message);
    res.json({ ok: false, error: e.message });
  }
});

// 聚合音频流代理
app.get('/api/agg-proxy', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send('missing url');
  try {
    const fetchHeaders = { 'User-Agent': 'Mozilla/5.0' };
    if (req.headers.range) fetchHeaders['Range'] = req.headers.range;
    const r = await fetch(url, { headers: fetchHeaders });
    if (!r.ok) return res.status(r.status).send('upstream error');
    const ct = r.headers.get('content-type') || 'audio/mpeg';
    const cl = r.headers.get('content-length');
    res.setHeader('Content-Type', ct);
    if (cl) res.setHeader('Content-Length', cl);
    res.setHeader('Accept-Ranges', 'bytes');
    if (req.headers.range && r.status === 206) {
      const cr = r.headers.get('content-range');
      if (cr) res.setHeader('Content-Range', cr);
      res.status(206);
    }
    const { Readable } = require('stream');
    Readable.fromWeb(r.body).pipe(res);
  } catch (e) {
    console.warn('⚠️ 聚合音频代理失败：', e.message);
    res.status(502).send('proxy error');
  }
});

// ─────────────────────────────────────────────────────────
// 认证系统
// ─────────────────────────────────────────────────────────
const { supabase, signToken, verifyToken, registerUser, loginUser } = require('./db');

// 认证中间件
function authRequired(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: '请先登录' });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: '登录已过期，请重新登录' });
  req.user = payload;
  next();
}

// ── 注册 API ──
app.post('/api/auth/register', async (req, res) => {
  const { email, password, nickname } = req.body;
  if (!email || !password) return res.json({ ok: false, msg: '邮箱和密码不能为空' });
  if (password.length < 6) return res.json({ ok: false, msg: '密码至少6位' });
  try {
    const user = await registerUser(email, password, nickname);
    const token = signToken(user.userId, user.email, user.nickname);
    res.json({ ok: true, token, user: { userId: user.userId, email: user.email, nickname: user.nickname } });
  } catch (e) {
    const msg = e.message || '注册失败';
    res.json({ ok: false, msg: msg.includes('already registered') ? '该邮箱已注册' : msg });
  }
});

// ── 登录 API ──
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.json({ ok: false, msg: '邮箱和密码不能为空' });
  try {
    const user = await loginUser(email, password);
    const token = signToken(user.userId, user.email, user.nickname);
    res.json({ ok: true, token, user: { userId: user.userId, email: user.email, nickname: user.nickname } });
  } catch (e) {
    res.json({ ok: false, msg: '邮箱或密码错误' });
  }
});

// ── 获取当前用户信息（直接从 JWT 返回，不查数据库）──
app.get('/api/auth/me', authRequired, (req, res) => {
  res.json({ ok: true, user: { userId: req.user.userId, email: req.user.email, nickname: req.user.nickname } });
});

// ── 修改昵称 ──
app.put('/api/auth/nickname', authRequired, async (req, res) => {
  const { nickname } = req.body;
  if (!nickname || !nickname.trim()) return res.json({ ok: false, msg: '昵称不能为空' });
  try {
    await supabase.from('jb_users').update({ nickname: nickname.trim() }).eq('id', req.user.userId);
    // 签发新 token（含新昵称）
    const token = signToken(req.user.userId, req.user.email, nickname.trim());
    res.json({ ok: true, token, nickname: nickname.trim() });
  } catch (e) {
    res.json({ ok: false, msg: '修改失败' });
  }
});

// ─────────────────────────────────────────────────────────
// 房间系统（Supabase 持久化 + 内存缓存）
// ─────────────────────────────────────────────────────────

// 内存缓存：roomName → roomObj（在线状态、实时队列等）
const rooms = new Map();

// ── Supabase 操作 ──────────────────────────────────────

// 从 DB 创建房间记录
async function dbCreateRoom(name, creatorId, password) {
  const { data, error } = await supabase.from('rooms').upsert({
    name, creator_id: creatorId || null,
    password: password || null,
    current_index: -1, is_playing: false,
    "current_time": 0, uid_counter: 0, is_active: true,
  }, { onConflict: 'name' }).select().single();
  if (error) {
    console.error('❌ dbCreateRoom 详细错误:', JSON.stringify(error, null, 2));
    throw new Error(error.message || JSON.stringify(error));
  }
  return data;
}

// 更新房间播放状态
async function dbSaveRoomState(roomId, state, uidCounter) {
  const { error } = await supabase.from('rooms').update({
    current_index: state.currentIndex,
    is_playing: state.isPlaying,
    "current_time": state.currentTime || 0,
    uid_counter: uidCounter,
  }).eq('id', roomId);
  if (error) console.warn('⚠️ DB saveRoomState error:', error.message);
}

// 从 DB 加载房间（含歌曲队列）
async function dbLoadRoom(name) {
  const { data: roomData, error: rErr } = await supabase.from('rooms')
    .select('*').eq('name', name).eq('is_active', true).single();
  if (rErr || !roomData) return null;

  const { data: songRows } = await supabase.from('songs')
    .select('*').eq('room_id', roomData.id).order('sort_order', { ascending: true });

  const queue = (songRows || []).map(s => ({
    uid: s.uid, id: s.song_id, source: s.source,
    name: s.name, artist: s.artist, album: s.album,
    cover: s.cover, url: s.url, duration: s.duration,
    requester: s.requester, _lyrics: s.lyrics || '',
  }));

  const { data: logRows } = await supabase.from('op_logs')
    .select('*').eq('room_id', roomData.id)
    .order('created_at', { ascending: false }).limit(100);

  const opLogs = (logRows || []).reverse().map(l => ({
    time: new Date(l.created_at).getTime(),
    action: l.action, nickname: l.nickname, ip: l.ip, detail: l.detail,
  }));

  return {
    roomId: roomData.id, name: roomData.name,
    creatorId: roomData.creator_id,
    password: roomData.password || null,
    createdAt: new Date(roomData.created_at).getTime(),
    state: {
      queue,
      currentIndex: roomData.current_index ?? -1,
      isPlaying: roomData.is_playing && queue.length > 0 && roomData.current_index >= 0,
      currentTime: roomData.current_time || 0,
    },
    uidCounter: roomData.uid_counter || 0,
    opLogs,
  };
}

// 添加歌曲到 DB
async function dbAddSong(roomId, item, sortOrder) {
  await supabase.from('songs').insert({
    room_id: roomId, uid: item.uid, sort_order: sortOrder,
    source: item.source, song_id: item.id, name: item.name,
    artist: item.artist, album: item.album, cover: item.cover,
    url: item.url, duration: item.duration, requester: item.requester,
    lyrics: item._lyrics || '',
  });
}

// 删除歌曲
async function dbRemoveSong(roomId, uid) {
  await supabase.from('songs').delete().eq('room_id', roomId).eq('uid', uid);
}

// 清空房间所有歌曲
async function dbClearSongs(roomId) {
  await supabase.from('songs').delete().eq('room_id', roomId);
}

// 更新歌曲排序
async function dbUpdateSongOrder(roomId, queue) {
  for (let i = 0; i < queue.length; i++) {
    await supabase.from('songs').update({ sort_order: i })
      .eq('room_id', roomId).eq('uid', queue[i].uid);
  }
}

// 写入操作日志（异步，不阻塞）
async function dbAddLog(roomId, userId, action, nickname, ip, detail) {
  await supabase.from('op_logs').insert({
    room_id: roomId, user_id: userId || null,
    action, nickname: nickname || '匿名', ip: ip || '', detail: detail || '',
  });
}

// 获取所有活跃房间列表
async function dbListRooms() {
  const { data, error } = await supabase.from('rooms')
    .select('*').eq('is_active', true)
    .order('created_at', { ascending: false });
  if (error) { console.warn('⚠️ DB listRooms error:', error.message); return []; }
  return data || [];
}

// 标记房间不活跃
async function dbDeactivateRoom(roomId) {
  await supabase.from('rooms').update({ is_active: false }).eq('id', roomId);
}

// ── 内存操作 ───────────────────────────────────────────

async function getOrCreateRoom(name, creatorId, password) {
  if (rooms.has(name)) return rooms.get(name);

  const dbRoom = await dbLoadRoom(name);
  if (dbRoom) {
    const room = {
      roomId: dbRoom.roomId, name: dbRoom.name,
      creatorId: dbRoom.creatorId, createdAt: dbRoom.createdAt,
      password: dbRoom.password || null,
      state: dbRoom.state, uidCounter: dbRoom.uidCounter,
      opLogs: dbRoom.opLogs, members: new Map(),
    };
    rooms.set(name, room);
    console.log(`📂 房间「${name}」从 DB 恢复：${room.state.queue.length} 首歌`);
    return room;
  }

  try {
    const dbData = await dbCreateRoom(name, creatorId, password);
    const room = {
      roomId: dbData.id, name, creatorId: dbData.creator_id,
      password: password || null,
      createdAt: Date.now(),
      state: { queue: [], currentIndex: -1, isPlaying: false, currentTime: 0 },
      uidCounter: 0, opLogs: [], members: new Map(),
    };
    rooms.set(name, room);
    return room;
  } catch (e) {
    console.error('❌ 创建房间写入数据库失败:', e.message);
    throw new Error('创建房间失败：数据库写入错误');
  }
}

function saveRoomState(room) {
  if (!room || !room.roomId) return;
  dbSaveRoomState(room.roomId, room.state, room.uidCounter).catch(e =>
    console.warn('⚠️ saveRoomState failed:', e.message)
  );
}

function broadcastToRoom(roomName, event, data) {
  io.to('room:' + roomName).emit(event, data);
}

function addRoomLog(room, socket, action, nickname, detail) {
  if (!room) return;
  const ip = socket?.handshake?.headers?.['x-forwarded-for']?.split(',')[0]?.trim()
          || socket?.handshake?.address?.replace('::ffff:', '') || 'unknown';
  room.opLogs.push({ time: Date.now(), action, nickname: nickname || '匿名', ip, detail: detail || '' });
  if (room.opLogs.length > 100) room.opLogs.splice(0, room.opLogs.length - 100);
  broadcastToRoom(room.name, 'op_log', room.opLogs);
  if (room.roomId && socket?._userId) {
    dbAddLog(room.roomId, socket._userId, action, nickname, ip, detail).catch(() => {});
  }
}

function getRoomOnline(roomName) {
  const room = io.sockets.adapter.rooms.get('room:' + roomName);
  return room ? room.size : 0;
}

// 转让房主给房间内第一个非管理员成员（优先选非管理员）
function transferOwnership(room, oldOwnerNick) {
  if (room.members.size === 0) return;
  // 优先转让给非管理员（普通成员）
  let newOwnerSocketId = null;
  for (const [sid, member] of room.members) {
    if (!member.isAdmin) {
      newOwnerSocketId = sid;
      break;
    }
  }
  // 如果没有非管理员，选第一个
  if (!newOwnerSocketId) {
    newOwnerSocketId = room.members.keys().next().value;
  }
  const newMember = room.members.get(newOwnerSocketId);
  room.creatorId = newMember.userId || newOwnerSocketId;
  newMember.isAdmin = true;
  broadcastToRoom(room.name, 'room:owner_changed', {
    newOwner: newOwnerSocketId,
    nickname: newMember.nickname || '匿名',
    oldOwner: oldOwnerNick,
  });
  addRoomLog(room, null, '转让', '系统',
    `房主「${oldOwnerNick}」已退出，管理权限转让给「${newMember.nickname || '匿名'}」`);
  console.log(`🔑 房间「${room.name}」房主转让给 ${newMember.nickname || newOwnerSocketId}`);
  // 通知对应 socket 更新 admin 状态
  const targetSocket = io.sockets.sockets.get(newOwnerSocketId);
  if (targetSocket) {
    targetSocket._isAdmin = true;
    targetSocket.emit('room:you_are_admin', { isAdmin: true });
  }
}

// 延迟清理空房间（30秒）
function scheduleCleanup(room, roomName) {
  if (room.members.size > 0) return;
  if (room._cleanupTimer) clearTimeout(room._cleanupTimer);
  room._cleanupTimer = setTimeout(async () => {
    if (room.members.size === 0) {
      saveRoomState(room);
      if (room.roomId) await dbDeactivateRoom(room.roomId).catch(() => {});
      rooms.delete(room.name);
      console.log(`🗑️ 房间「${room.name}」无人，已清理`);
    }
  }, 30000);
}

// ── 房间 REST API ─────────────────────────────────────

// 获取房间列表（需登录）— 只显示内存中有且在线人数 > 0 的房间
app.get('/api/rooms', authRequired, async (req, res) => {
  try {
    const list = [];
    for (const [name, mem] of rooms) {
      const online = getRoomOnline(name);
      if (online > 0) {
        list.push({
          name,
          creatorId: mem.creatorId,
          createdAt: mem.createdAt,
          online,
          hasPassword: !!mem.password,
          queueLen: mem.state.queue.length,
          playing: mem.state.queue[mem.state.currentIndex]?.name || '',
        });
      }
    }
    console.log(`📋 /api/rooms: 内存 ${rooms.size} 个房间，在线 ${list.length} 个`);
    res.json({ rooms: list });
  } catch (e) { res.json({ rooms: [] }); }
});

// 创建房间（需登录）
app.post('/api/rooms', authRequired, async (req, res) => {
  const { name, password } = req.body;
  const creatorId = req.user.userId;
  if (!name || !name.trim()) return res.json({ ok: false, msg: '房间名不能为空' });
  const roomName = name.trim();
  if (roomName.length > 20) return res.json({ ok: false, msg: '房间名不能超过20个字符' });
  if (/[\/\\?#&=]/.test(roomName)) return res.json({ ok: false, msg: '房间名包含非法字符' });
  if (rooms.has(roomName)) return res.json({ ok: false, msg: '房间名已存在，请换一个' });
  try {
    await getOrCreateRoom(roomName, creatorId || '', password || null);
    console.log(`🏠 房间「${roomName}」已创建${password ? '（已设密码）' : ''}`);
    res.json({ ok: true, name: roomName });
  } catch (e) { res.json({ ok: false, msg: '创建失败: ' + e.message }); }
});

// ─────────────────────────────────────────────────────────
// Socket.io 事件处理（房间隔离版）
// ─────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('🔌 用户连接:', socket.id);

  // 从 handshake 的 token 中识别用户
  const token = socket.handshake.auth?.token;
  const payload = token ? verifyToken(token) : null;

  socket._roomName = null;
  socket._nick = payload?.nickname || '匿名';
  socket._isAdmin = false;
  socket._userId = payload?.userId || null;
  socket._email = payload?.email || null;

  // ── 加入房间 ──
  socket.on('room:join', async ({ room: roomName, nickname, password }, callback) => {
    if (!roomName) {
      if (callback) callback({ ok: false, msg: '房间名不能为空' });
      return;
    }
    // 先检查内存中是否已有该房间（可能在线）
    const existingRoom = rooms.get(roomName);
    const isCreator = existingRoom && (existingRoom.creatorId === socket._userId);
    if (existingRoom && existingRoom.password && !isCreator) {
      // 非房主需要密码验证
      if (!password || password !== existingRoom.password) {
        if (callback) callback({ ok: false, msg: '密码错误', needPassword: true });
        return;
      }
    }
    // 如果内存中没有但数据库有，需要加载（这种情况也校验密码）
    if (!existingRoom) {
      const dbRoom = await dbLoadRoom(roomName);
      const isDbCreator = dbRoom && (dbRoom.creatorId === socket._userId);
      if (dbRoom && dbRoom.password && !isDbCreator) {
        if (!password || password !== dbRoom.password) {
          if (callback) callback({ ok: false, msg: '密码错误', needPassword: true });
          return;
        }
      }
    }
    if (socket._roomName) {
      socket.leave('room:' + socket._roomName);
      const oldRoom = rooms.get(socket._roomName);
      if (oldRoom) oldRoom.members.delete(socket.id);
    }
    try {
      const room = await getOrCreateRoom(roomName, socket.id);
      socket.join('room:' + roomName);
      socket._roomName = roomName;
      socket._nick = nickname || '匿名';
      const isOwner = room.creatorId === socket.id || room.creatorId === socket._userId;
      if (isOwner) socket._isAdmin = true;
      room.members.set(socket.id, { nickname: socket._nick, isAdmin: socket._isAdmin, userId: socket._userId });
      socket.emit('room:joined', {
        roomName, isOwner, isAdmin: socket._isAdmin,
        state: room.state, opLogs: room.opLogs,
      });
      broadcastToRoom(roomName, 'online_users', getRoomOnline(roomName));
      addRoomLog(room, socket, '加入', socket._nick, '进入了房间');
      console.log(`🏠 ${socket._nick}(${socket.id}) 加入房间「${roomName}」`);
      if (callback) callback({ ok: true, roomName, isOwner, isAdmin: socket._isAdmin });
    } catch (e) {
      if (callback) callback({ ok: false, msg: '加入房间失败: ' + e.message });
    }
  });

  // ── 退出房间 ──
  socket.on('room:leave', ({}, callback) => {
    if (!socket._roomName) {
      if (callback) callback({ ok: false });
      return;
    }
    const roomName = socket._roomName;
    const room = rooms.get(roomName);
    if (room) {
      const isOwner = (room.creatorId === socket._userId);
      room.members.delete(socket.id);
      addRoomLog(room, socket, '离开', socket._nick, '退出了房间');
      broadcastToRoom(roomName, 'online_users', getRoomOnline(roomName));

      // 房主退出：有人则转让，无人则延迟删除
      if (isOwner) {
        if (room.members.size > 0) {
          transferOwnership(room, socket._nick);
        } else {
          scheduleCleanup(room, roomName);
        }
      } else if (room.members.size === 0) {
        scheduleCleanup(room, roomName);
      }
    }
    socket.leave('room:' + roomName);
    socket._roomName = null;
    socket._isAdmin = false;
    if (callback) callback({ ok: true });
  });

  // ── 点歌（房间隔离） ──
  socket.on('add_song', async ({ song, nickname }, callback) => {
    if (!socket._roomName) {
      if (callback) callback({ ok: false, msg: '未加入房间' });
      return;
    }
    const room = rooms.get(socket._roomName);
    if (!room) return;
    if (!song || !song.url) {
      if (callback) callback({ ok: false, msg: '无效的歌曲' });
      return;
    }
    const dup = room.state.queue.find(s =>
      s.name.trim() === (song.name || '').trim() && s.artist.trim() === (song.artist || '').trim()
    );
    if (dup) {
      broadcastToRoom(socket._roomName, 'toast', { msg: `「${song.name}」已在播放队列中`, type: 'warning' });
      if (callback) callback({ ok: false, msg: '歌曲已在队列中' });
      return;
    }
    const uid = ++room.uidCounter;
    const item = {
      uid, id: song.id || '', source: song.source || 'qq',
      name: song.name, artist: song.artist, album: song.album || '',
      cover: song.cover || '', url: song.url, duration: song.duration || 0,
      requester: nickname || '匿名', _lyrics: song._lyrics || '',
    };
    room.state.queue.push(item);
    // 持久化到 DB
    if (room.roomId) {
      await dbAddSong(room.roomId, item, room.state.queue.length - 1).catch(() => {});
      saveRoomState(room);
    }
    broadcastToRoom(socket._roomName, 'state_sync', room.state);
    addRoomLog(room, socket, '点歌', nickname, `点了「${song.name}」- ${song.artist || ''}`);
    broadcastToRoom(socket._roomName, 'toast', { msg: `${nickname || '匿名'} 点了「${song.name}」`, type: 'success' });
    if (callback) callback({ ok: true });

    if (room.state.queue.length === 1 && room.state.currentIndex < 0) {
      room.state.currentIndex = 0;
      room.state.isPlaying = true;
      room.state.currentTime = 0;
      broadcastToRoom(socket._roomName, 'state_sync', room.state);
    }
  });

  // ── 上报播放进度 ──
  socket._reportTimer = null;
  socket.on('report_time', ({ uid, time }) => {
    if (!socket._roomName) return;
    const room = rooms.get(socket._roomName);
    if (!room) return;
    if (room.state.queue[room.state.currentIndex]?.uid === uid) {
      room.state.currentTime = time;
      if (socket._reportTimer) clearTimeout(socket._reportTimer);
      socket._reportTimer = setTimeout(() => {
        broadcastToRoom(socket._roomName, 'time_sync', { time: room.state.currentTime });
      }, 3000);
    }
  });

  // ── 播放/暂停（仅管理员） ──
  socket.on('toggle_play', ({ nickname }) => {
    if (!socket._isAdmin || !socket._roomName) return;
    const room = rooms.get(socket._roomName);
    if (!room) return;
    room.state.isPlaying = !room.state.isPlaying;
    addRoomLog(room, socket, room.state.isPlaying ? '播放' : '暂停', nickname, '');
    saveRoomState(room);
    broadcastToRoom(socket._roomName, 'state_sync', room.state);
  });

  // ── 下一首（仅管理员） ──
  socket.on('next_song', ({ nickname }) => {
    if (!socket._isAdmin || !socket._roomName) return;
    const room = rooms.get(socket._roomName);
    if (!room) return;
    const cur = room.state.queue[room.state.currentIndex];
    addRoomLog(room, socket, '切歌', nickname, cur ? `跳过「${cur.name}」` : '切到下一首');
    if (room.state.currentIndex < room.state.queue.length - 1) {
      room.state.currentIndex++;
    } else if (room.state.queue.length > 0) {
      room.state.currentIndex = 0;
    }
    room.state.currentTime = 0;
    room.state.isPlaying = true;
    saveRoomState(room);
    broadcastToRoom(socket._roomName, 'state_sync', room.state);
  });

  // ── 歌曲播放结束 ──
  socket.on('song_ended', async ({ uid }) => {
    if (!socket._roomName) return;
    const room = rooms.get(socket._roomName);
    if (!room) return;
    if (room.state.queue[room.state.currentIndex]?.uid === uid) {
      const ended = room.state.queue[room.state.currentIndex];
      addRoomLog(room, socket, '播完', ended ? ended.requester : '系统', `「${ended?.name || ''}」播放结束`);
      if (room.roomId) await dbRemoveSong(room.roomId, uid).catch(() => {});
      room.state.queue.splice(room.state.currentIndex, 1);
      if (room.state.queue.length === 0) {
        room.state.currentIndex = -1;
        room.state.isPlaying = false;
        room.state.currentTime = 0;
      } else {
        if (room.state.currentIndex >= room.state.queue.length) room.state.currentIndex = 0;
        room.state.currentTime = 0;
        room.state.isPlaying = true;
        room.state.playResetUid = room.state.queue[room.state.currentIndex]?.uid || Date.now();
      }
      saveRoomState(room);
      broadcastToRoom(socket._roomName, 'state_sync', room.state);
    }
  });

  // ── 删除歌曲（仅管理员） ──
  socket.on('remove_song', async ({ uid, nickname }) => {
    if (!socket._isAdmin || !socket._roomName) return;
    const room = rooms.get(socket._roomName);
    if (!room) return;
    const idx = room.state.queue.findIndex(s => s.uid === uid);
    if (idx === -1) return;
    addRoomLog(room, socket, '删歌', nickname, `移除了「${room.state.queue[idx].name}」`);
    if (room.roomId) await dbRemoveSong(room.roomId, uid).catch(() => {});
    room.state.queue.splice(idx, 1);
    if (idx === room.state.currentIndex) {
      if (room.state.queue.length === 0) {
        room.state.currentIndex = -1; room.state.isPlaying = false; room.state.currentTime = 0;
      } else {
        if (room.state.currentIndex >= room.state.queue.length) room.state.currentIndex = 0;
        room.state.currentTime = 0; room.state.isPlaying = true;
        room.state.playResetUid = room.state.queue[room.state.currentIndex]?.uid || Date.now();
      }
    } else if (idx < room.state.currentIndex) {
      room.state.currentIndex--;
    }
    saveRoomState(room);
    broadcastToRoom(socket._roomName, 'state_sync', room.state);
  });

  // ── 清空队列（仅管理员） ──
  socket.on('clear_queue', async ({ nickname }) => {
    if (!socket._isAdmin || !socket._roomName) return;
    const room = rooms.get(socket._roomName);
    if (!room) return;
    addRoomLog(room, socket, '清空', nickname, '清空了播放队列');
    room.state.queue = [];
    room.state.currentIndex = -1;
    room.state.isPlaying = false;
    room.state.currentTime = 0;
    if (room.roomId) await dbClearSongs(room.roomId).catch(() => {});
    saveRoomState(room);
    broadcastToRoom(socket._roomName, 'state_sync', room.state);
  });

  // ── 调整队列顺序（仅管理员） ──
  socket.on('reorder_queue', async ({ nickname, fromIndex, toIndex }) => {
    if (!socket._isAdmin || !socket._roomName) return;
    const room = rooms.get(socket._roomName);
    if (!room) return;
    const q = room.state.queue;
    if (!q.length || fromIndex < 0 || toIndex < 0 || fromIndex >= q.length || toIndex >= q.length) return;
    if (fromIndex === room.state.currentIndex || toIndex === room.state.currentIndex) return;
    const [moved] = q.splice(fromIndex, 1);
    if (fromIndex < room.state.currentIndex && toIndex >= room.state.currentIndex) room.state.currentIndex--;
    else if (fromIndex > room.state.currentIndex && toIndex <= room.state.currentIndex) room.state.currentIndex++;
    q.splice(toIndex, 0, moved);
    if (room.roomId) dbUpdateSongOrder(room.roomId, q).catch(() => {});
    broadcastToRoom(socket._roomName, 'state_sync', room.state);
    addRoomLog(room, socket, '排序', nickname, `将「${moved.name}」移到了第 ${toIndex + 1} 位`);
  });

  // ── 管理员登录（房间内密码登录，仅房主之外的人需要） ──
  socket.on('admin_login', ({ password }, callback) => {
    if (password === ADMIN_PASSWORD) {
      socket._isAdmin = true;
      const room = rooms.get(socket._roomName);
      if (room) room.members.get(socket.id).isAdmin = true;
      if (callback) callback({ ok: true });
    } else {
      if (callback) callback({ ok: false });
    }
  });

  // ── 断开连接 ──
  socket.on('disconnect', async () => {
    console.log('🔌 用户断开:', socket.id);
    if (socket._roomName) {
      const room = rooms.get(socket._roomName);
      if (room) {
        const isOwner = (room.creatorId === socket._userId);
        room.members.delete(socket.id);
        addRoomLog(room, socket, '离开', socket._nick, '断开了连接');
        broadcastToRoom(socket._roomName, 'online_users', getRoomOnline(socket._roomName));

        // 房主断开：有人则转让，无人则延迟删除
        if (isOwner) {
          if (room.members.size > 0) {
            transferOwnership(room, socket._nick);
          } else {
            scheduleCleanup(room, socket._roomName);
          }
        } else if (room.members.size === 0) {
          scheduleCleanup(room, socket._roomName);
        }
      }
    }
  });
});

// ─────────────────────────────────────────
// 页面路由
// ─────────────────────────────────────────

// 默认跳转到大厅
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'lobby.html'));
});

// 房间播放页
app.get('/room/:name', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ── 静态文件（放在页面路由之后）─────────────────────────────
app.use(express.static(path.join(__dirname)));

// ─────────────────────────────────────────
// 启动
// ─────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const HOST = process.env.RAILWAY_ENVIRONMENT ? '::' : '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`🎵 三源点歌台已启动：端口 ${PORT}`);
  console.log(`🏠 房间系统已启用：访问 / 进入大厅`);
});
