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
// 运行 node nc_login.js 扫码登录获取 Cookie
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
app.use(express.static(path.join(__dirname)));

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

// QQ 获取播放链接：https://u.y.qq.com/cgi-bin/musicu.fcg（vkey 接口，品质降级）
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
    } catch (e) {
      // 当前品质不可用，尝试下一个
    }
  }
  return null;
}

// ─────────────────────────────────────────
// 网易云音乐 API（使用 NeteaseCloudMusicApi npm 包）
// ─────────────────────────────────────────
const NeteaseCloudMusicApi = require('NeteaseCloudMusicApi');

// 网易云搜索
async function ncSearch(keyword, limit = 20, page = 1) {
  const result = await NeteaseCloudMusicApi.search({
    keywords: keyword, limit, type: 1, offset: (page - 1) * limit,
    cookie: NC_COOKIE,
  });
  const songs = result?.body?.result?.songs || [];
  if (songs.length === 0) return [];

  // search API 只返回 picId，需用 song_detail 批量拿完整 picUrl
  const ids = songs.map(s => s.id).join(',');
  let coverMap = {};
  try {
    const detailResult = await NeteaseCloudMusicApi.song_detail({ ids, cookie: NC_COOKIE });
    const details = detailResult?.body?.songs || [];
    details.forEach(d => {
      const picUrl = d.al?.picUrl || '';
      coverMap[String(d.id)] = picUrl ? picUrl.replace('http://', 'https://') : '';
    });
  } catch (e) {
    // 拿不到封面也不影响主流程
  }

  return songs.map(s => {
    return {
      id:       String(s.id),
      name:     s.name || '',
      artist:   (s.artists || []).map(a => a.name).join(' / '),
      album:    s.album?.name || '',
      cover:    coverMap[String(s.id)] || '',
      duration: s.duration || 0,
      needPay:  s.fee === 1,
      source:   'nc',
    };
  });
}

// 网易云获取播放链接
async function ncGetSongUrl(id) {
  const result = await NeteaseCloudMusicApi.song_url_v1({ id, level: 'exhigh', encrypt: '1', cookie: NC_COOKIE });
  const item = result?.body?.data?.[0];
  if (item?.url && item?.code === 200) {
    return item.url.replace('http://', 'https://');
  }
  return null;
}

// ─────────────────────────────────────────
// iTunes 备用：通过歌曲名+歌手获取播放链接
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
// 网易云热门歌单推荐
// ─────────────────────────────────────────
app.get('/api/hotlist', async (req, res) => {
  const { type = 'hot' } = req.query; // hot=热歌榜, new=新歌榜, surge=飙升榜

  // 网易云官方排行榜 idx: 0=飙升榜 1=新歌榜 3=热歌榜
  const idxMap = { hot: 3, new: 1, surge: 0 };
  const nameMap = { hot: '热歌榜', new: '新歌榜', surge: '飙升榜' };
  const idx = idxMap[type] ?? 3;

  try {
    // 先拿到排行榜 id
    const top = await NeteaseCloudMusicApi.toplist_detail({ cookie: NC_COOKIE });
    const lists = top.body?.list || [];
    const playlist = lists[idx];
    if (!playlist?.id) throw new Error('排行榜数据为空');

    // 用 playlist_track_all 获取完整歌曲列表
    const result = await NeteaseCloudMusicApi.playlist_track_all({
      id: playlist.id,
      limit: 50,
      cookie: NC_COOKIE,
    });
    const tracks = result.body?.songs || result.body?.tracks || [];

    const songs = tracks.slice(0, 50).map(t => {
      const picUrl = t.al?.picUrl || '';
      return {
        id:       String(t.id),
        name:     t.name || '',
        artist:   (t.ar || []).map(a => a.name).join(' / '),
        album:    t.al?.name || '',
        cover:    picUrl ? picUrl.replace('http://', 'https://') : '',
        duration: t.dt || 0,
        needPay:  t.fee === 1,
        source:   'nc',
      };
    });

    res.json({
      name: nameMap[type] || playlist.name,
      coverUrl: playlist.coverImgUrl || '',
      songCount: songs.length,
      songs,
    });
  } catch (e) {
    console.warn('❌ 获取热门歌单失败:', e.message);
    res.json({ name: nameMap[type], songs: [], error: e.message });
  }
});

// ─────────────────────────────────────────
// 歌词接口（网易云）
// ─────────────────────────────────────────
app.get('/api/lyric', async (req, res) => {
  const { id, source } = req.query;
  if (!id) return res.json({ lines: [] });

  if (source === 'nc') {
    try {
      const result = await NeteaseCloudMusicApi.lyric({ id, cookie: NC_COOKIE });
      const lrc = result.body?.lrc?.lyric || '';
      const tlyric = result.body?.tlyric?.lyric || ''; // 翻译歌词

      // 兼容多种 LRC 时间戳格式：[00:00.00], [00:00.000], [00:00.00-1]
      const timeRe = /\[(\d{2}):(\d{2})\.(\d{2,3})(?:[^\]]*)?\](.*)/;

      const tLines = {};
      // 解析翻译歌词
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
          // 过滤元信息行：跳过前 10 秒的元信息，以及匹配关键词的行
          if (time < 10) return null;
          const isMeta = skipWords.some(w => text.includes(w + '：') || text.includes(w + ':') || text.includes(w + ' ：') || text.includes(w + ' :'));
          if (isMeta) return null;
          // 组合翻译
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
    // QQ 音乐暂不支持歌词
    res.json({ lines: [] });
  }
});

// ─────────────────────────────────────────
// 搜索接口（支持按源筛选：all / nc / qq）
// ─────────────────────────────────────────
app.get('/api/search', async (req, res) => {
  const { q, limit = 20, source = 'all' } = req.query;
  if (!q) return res.json({ songs: [] });

  let qqSongs = [], ncSongs = [];

  if (source === 'all' || source === 'qq') {
    qqSongs = await qqSearch(q, limit, 1)
      .then(songs => { console.log('✅ QQ搜索命中', songs.length, '首'); return songs; })
      .catch(e => { console.warn('❌ QQ搜索失败', e.message); return []; });
  }

  if (source === 'all' || source === 'nc') {
    ncSongs = await ncSearch(q, limit, 1)
      .then(songs => { console.log('✅ 网易云搜索命中', songs.length, '首'); return songs; })
      .catch(e => { console.warn('❌ 网易云搜索失败', e.message); return []; });
  }

  // 网易云排前面，QQ 排后面
  const songs = [...ncSongs, ...qqSongs].slice(0, limit);
  return res.json({ songs });
});

// ─────────────────────────────────────────
// 播放 URL 获取（QQ / 网易云 / iTunes 三级降级）
// ─────────────────────────────────────────
app.get('/api/song/url', async (req, res) => {
  const { id, source = 'qq', name, artist } = req.query;
  if (!id) return res.json({ url: null });

  // 1. 根据来源获取
  if (source === 'nc') {
    // 网易云源
    try {
      const url = await ncGetSongUrl(id);
      if (url) {
        console.log('✅ 网易云播放链接获取成功');
        return res.json({ url });
      }
      console.warn('⚠️ 网易云返回无链接（VIP 或地域限制）');
    } catch (e) {
      console.warn('⚠️ 网易云获取失败：', e.message);
    }
  } else {
    // QQ 源
    try {
      const url = await qqGetSongUrl(id);
      if (url) {
        console.log('✅ QQ播放链接获取成功');
        return res.json({ url });
      }
      console.warn('⚠️ QQ返回无链接（VIP 或地域限制）');
    } catch (e) {
      console.warn('⚠️ QQ获取失败：', e.message);
    }
  }

  // 2. iTunes 备用
  if (!name && !artist) {
    return res.json({ url: null, error: '歌曲需要付费或无法获取' });
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
    return res.json({ url: null, error: '所有源均无法获取播放链接' });
  }
});

// ─────────────────────────────────────────
// 聚合搜索代理（解决前端 CORS 问题）
// ─────────────────────────────────────────
const NGROK_BASE = process.env.NGROK_BASE || 'https://photokinetic-readably-rosaura.ngrok-free.dev';
let ngrokSign = null;
let ngrokSignTime = 0;

// 获取签名（缓存5分钟）
async function getNgrokSign() {
  if (ngrokSign && Date.now() - ngrokSignTime < 5 * 60 * 1000) return ngrokSign;
  const r = await fetch(NGROK_BASE + '/get_sign', { headers: { 'ngrok-skip-browser-warning': 'true' } });
  const data = await r.json();
  if (data && data.data && data.data.sign) {
    ngrokSign = data.data.sign;
    ngrokSignTime = Date.now();
    return ngrokSign;
  }
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
      body: JSON.stringify({ name, sign })
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    res.json(data);
  } catch (e) {
    console.warn('⚠️ 聚合搜索失败：', e.message);
    res.json({ code: 500, error: e.message });
  }
});

// 聚合搜索实时获取播放链接（解决 mp3_url 过期和防盗链问题）
app.get('/api/song/url-by-name', async (req, res) => {
  const { name, artist } = req.query;
  if (!name) return res.json({ url: null, error: '缺少歌曲名' });

  async function trySource(searchFn, getUrlFn, sourceName) {
    try {
      const songs = await searchFn(name, 5, 1);
      if (!songs || songs.length === 0) return null;

      // 歌手名关键词拆分（用于模糊匹配，如"周杰伦/费玉清" → ["周杰伦","费玉清"]）
      const artistParts = artist ? artist.split(/[/、,，&\s]+/).filter(Boolean) : [];

      // 匹配策略（优先级从高到低）：
      // 1. 歌名精确 + 任一歌手名包含匹配
      // 2. 歌名精确（不要求歌手匹配）
      // 3. 歌名包含 + 任一歌手名包含匹配
      // 4. 第一个搜索结果（降级）
      const match =
        songs.find(s =>
          s.name === name && artistParts.length > 0 &&
          artistParts.some(a => s.artist.includes(a) || a.includes(s.artist.split(/[/、,，&]/)[0]))
        ) ||
        songs.find(s => s.name === name) ||
        songs.find(s =>
          s.name.includes(name) && artistParts.length > 0 &&
          artistParts.some(a => s.artist.includes(a) || a.includes(s.artist.split(/[/、,，&]/)[0]))
        ) ||
        songs.find(s => s.name.includes(name)) ||
        songs[0];

      console.log(`🔍 url-by-name[${sourceName}] 搜索 "${name}" "${artist || ''}" → 匹配: "${match.name}" - "${match.artist}"`);
      const url = await getUrlFn(match.id);
      if (url) return { url, from: sourceName, matchedName: match.name, matchedArtist: match.artist };
    } catch (e) {
      console.warn('⚠️ ' + sourceName + '搜索获取失败：', e.message);
    }
    return null;
  }

  // 1. 先试网易云（免费歌曲多）
  let result = await trySource(ncSearch, ncGetSongUrl, 'nc');
  if (result) return res.json(result);

  // 2. 再试 QQ
  result = await trySource(qqSearch, qqGetSongUrl, 'qq');
  if (result) return res.json(result);

  // 3. iTunes 备用
  try {
    const results = await itunesSearch(name, artist);
    if (results.length > 0 && results[0].previewUrl) {
      return res.json({ url: results[0].previewUrl, from: 'itunes' });
    }
  } catch (e) {
    console.warn('❌ iTunes 备用也失败：', e.message);
  }

  res.json({ url: null, error: '所有源均无法获取播放链接' });
});

// 聚合搜索音频流代理（绕过防盗链 403）
app.get('/api/agg-proxy', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send('missing url');
  try {
    const fetchHeaders = { 'User-Agent': 'Mozilla/5.0' };
    // 支持 Range 请求（进度条拖拽 + 流式播放）
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
    // Node.js 内置 fetch 的 body 是 Web Stream，需转 Node Stream
    const { Readable } = require('stream');
    Readable.fromWeb(r.body).pipe(res);
  } catch (e) {
    console.warn('⚠️ 聚合音频代理失败：', e.message);
    res.status(502).send('proxy error');
  }
});

// ─────────────────────────────────────────
// 队列持久化（JSON 文件缓存）
// ─────────────────────────────────────────
const STATE_FILE = path.join(__dirname, '.state.json');

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
      if (raw && Array.isArray(raw.queue)) {
        console.log(`📂 从缓存恢复队列：${raw.queue.length} 首歌`);
        return raw;
      }
    }
  } catch (e) {
    console.warn('⚠️ 读取缓存失败，使用空队列:', e.message);
  }
  return null;
}

function saveState() {
  try {
    // 保存时去掉运行时临时字段，只保留必要数据
    const data = {
      queue: state.queue.map(s => ({
        uid: s.uid,
        id: s.id,
        source: s.source,
        name: s.name,
        artist: s.artist,
        album: s.album,
        cover: s.cover,
        url: s.url,
        duration: s.duration,
        requester: s.requester,
        _lyrics: s._lyrics || '',
      })),
      currentIndex: state.currentIndex,
      uidCounter: uidCounter,
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.warn('⚠️ 保存缓存失败:', e.message);
  }
}

// ─────────────────────────────────────────
// Socket.io 事件处理（队列 & 播放控制）
// ─────────────────────────────────────────
const cached = loadState();

const state = {
  queue: cached ? cached.queue : [],
  currentIndex: cached ? cached.currentIndex : -1,
  isPlaying: cached ? (cached.queue.length > 0 && cached.currentIndex >= 0) : false,
  currentTime: 0,
};

let uidCounter = cached ? cached.uidCounter : 0;

function broadcastState() {
  io.emit('state_sync', state);
}

// ── 操作日志 ─────────────────────────────────────
const MAX_LOG = 100;
const opLogs = []; // { time, action, nickname, ip, detail }

function addLog(socket, action, nickname, detail) {
  const ip = socket.handshake.headers['x-forwarded-for']?.split(',')[0]?.trim()
          || socket.handshake.address?.replace('::ffff:', '') || 'unknown';
  opLogs.push({ time: Date.now(), action, nickname: nickname || '匿名', ip, detail: detail || '' });
  if (opLogs.length > MAX_LOG) opLogs.splice(0, opLogs.length - MAX_LOG);
  io.emit('op_log', opLogs);
}

// 用户加入时推送状态
io.on('connection', (socket) => {
  console.log('🔌 用户连接:', socket.id);
  io.emit('online_users', io.engine.clientsCount);

  // 连接时推送当前状态 + 操作日志
  socket.emit('state_sync', state);
  socket.emit('op_log', opLogs);

  // 昵称上报（前端连接后发送），回传 IP 供前端生成昵称
  socket.on('join', ({ nickname }, callback) => {
    const ip = socket.handshake.headers['x-forwarded-for']?.split(',')[0]?.trim()
            || socket.handshake.address?.replace('::ffff:', '') || 'unknown';
    socket._nick = nickname || '匿名';
    if (callback) callback({ ip });
    addLog(socket, '加入', nickname, '进入了点歌台');
  });

  // 点歌
  socket.on('add_song', ({ song, nickname }, callback) => {
    if (!song || !song.url) {
      if (callback) callback({ ok: false, msg: '无效的歌曲' });
      return;
    }
    // 防重：同歌名同歌手只允许出现一次
    const dup = state.queue.find(s =>
      s.name.trim() === (song.name || '').trim() && s.artist.trim() === (song.artist || '').trim()
    );
    if (dup) {
      io.emit('toast', { msg: `「${song.name}」已在播放队列中，不能重复添加`, type: 'warning' });
      if (callback) callback({ ok: false, msg: '歌曲已在队列中' });
      return;
    }
    const uid = ++uidCounter;
    const item = {
      uid,
      id: song.id || '',
      source: song.source || 'qq',
      name: song.name,
      artist: song.artist,
      album: song.album || '',
      cover: song.cover || '',
      url: song.url,
      duration: song.duration || 0,
      requester: nickname || '匿名',
      _lyrics: song._lyrics || '', // 聚合搜索的歌词原文
    };
    state.queue.push(item);
    saveState();
    broadcastState();
    addLog(socket, '点歌', nickname, `点了「${song.name}」- ${song.artist || ''}`);
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

  // 上报播放进度（防抖：每次覆盖前一个定时器）
  socket._reportTimer = null;
  socket.on('report_time', ({ uid, time }) => {
    if (state.queue[state.currentIndex]?.uid === uid) {
      state.currentTime = time;
      // 防抖广播，减少频繁推送
      if (socket._reportTimer) clearTimeout(socket._reportTimer);
      socket._reportTimer = setTimeout(() => {
        io.emit('time_sync', { time: state.currentTime });
      }, 3000);
    }
  });

  // 播放/暂停（仅管理员）
  socket.on('toggle_play', ({ nickname }) => {
    if (!socket._isAdmin) return;
    state.isPlaying = !state.isPlaying;
    addLog(socket, state.isPlaying ? '播放' : '暂停', nickname, '');
    broadcastState();
  });

  // 下一首（仅管理员）
  socket.on('next_song', ({ nickname }) => {
    if (!socket._isAdmin) return;
    const cur = state.queue[state.currentIndex];
    addLog(socket, '切歌', nickname, cur ? `跳过「${cur.name}」` : '切到下一首');
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
    saveState();
    broadcastState();
  });

  // 歌曲播放结束 → 自动切下一首，并移除已播放的歌曲
  socket.on('song_ended', ({ uid }) => {
    if (state.queue[state.currentIndex]?.uid === uid) {
      const ended = state.queue[state.currentIndex];
      addLog(socket, '播完', ended ? ended.requester : '系统', `「${ended?.name || ''}」播放结束`);
      state.queue.splice(state.currentIndex, 1);

      if (state.queue.length === 0) {
        state.currentIndex = -1;
        state.isPlaying = false;
        state.currentTime = 0;
      } else {
        if (state.currentIndex >= state.queue.length) {
          state.currentIndex = 0;
        }
        state.currentTime = 0;
        state.isPlaying = true;
        state.playResetUid = state.queue[state.currentIndex]?.uid || Date.now();
      }
      saveState();
      broadcastState();
    }
  });

  // 删除歌曲（仅管理员）
  socket.on('remove_song', ({ uid, nickname }) => {
    if (!socket._isAdmin) return;
    const idx = state.queue.findIndex(s => s.uid === uid);
    if (idx !== -1) addLog(socket, '删歌', nickname, `移除了「${state.queue[idx].name}」`);
    if (idx === -1) return;
    state.queue.splice(idx, 1);

    if (idx === state.currentIndex) {
      if (state.queue.length === 0) {
        state.currentIndex = -1;
        state.isPlaying = false;
        state.currentTime = 0;
      } else {
        if (state.currentIndex >= state.queue.length) {
          state.currentIndex = 0;
        }
        state.currentTime = 0;
        state.isPlaying = true;
        state.playResetUid = state.queue[state.currentIndex]?.uid || Date.now();
      }
    } else if (idx < state.currentIndex) {
      state.currentIndex--;
    }
    saveState();
    broadcastState();
  });

  // 清空队列（仅管理员）
  socket.on('clear_queue', ({ nickname }) => {
    if (!socket._isAdmin) return;
    addLog(socket, '清空', nickname, '清空了播放队列');
    state.queue = [];
    state.currentIndex = -1;
    state.isPlaying = false;
    state.currentTime = 0;
    saveState();
    broadcastState();
  });

  // 调整队列顺序（仅管理员）
  socket.on('reorder_queue', ({ nickname, fromIndex, toIndex }) => {
    if (!socket._isAdmin) return;
    const q = state.queue;
    if (!q.length || fromIndex < 0 || toIndex < 0 || fromIndex >= q.length || toIndex >= q.length) return;
    // 不允许移动正在播放的歌曲
    if (fromIndex === state.currentIndex || toIndex === state.currentIndex) return;

    // 从队列中取出元素，插入到新位置
    const [moved] = q.splice(fromIndex, 1);

    // 如果移动发生在 currentIndex 之前，需要调整 currentIndex
    if (fromIndex < state.currentIndex && toIndex >= state.currentIndex) {
      state.currentIndex--;
    } else if (fromIndex > state.currentIndex && toIndex <= state.currentIndex) {
      state.currentIndex++;
    }

    q.splice(toIndex, 0, moved);

    saveState();
    broadcastState();
    addLog(socket, '排序', nickname, `将「${moved.name}」移到了第 ${toIndex + 1} 位`);
  });

  // 管理员登录
  socket.on('admin_login', ({ password }, callback) => {
    if (password === ADMIN_PASSWORD) {
      socket._isAdmin = true;
      if (callback) callback({ ok: true });
    } else {
      if (callback) callback({ ok: false });
    }
  });

  // 断开连接
  socket.on('disconnect', () => {
    console.log('🔌 用户断开:', socket.id);
    addLog(socket, '离开', socket._nick || '匿名', '断开了连接');
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
