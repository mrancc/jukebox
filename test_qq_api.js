const https = require('https');

const mid = '003bTgTi4Aiym2';
const filename = `M800${mid}${mid}.mp3`;
const payload = {
  req_1: {
    module: 'vkey.GetVkeyServer', method: 'CgiGetVkey',
    param: { filename: [filename], guid: '10000', songmid: [mid], songtype: [0], uin: '0', loginflag: 1, platform: '20' },
  },
  loginUin: '0',
  comm: { uin: '0', format: 'json', ct: 24, cv: 0 },
};
const body = JSON.stringify(payload);

// 完全模拟 copws 的请求 headers
const req = https.request('https://u.y.qq.com/cgi-bin/musicu.fcg', {
  method: 'POST',
  headers: {
    'accept': 'application/json, text/plain, */*',
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'content-type': 'application/json;charset=UTF-8',
    'referer': 'https://y.qq.com/',
    'cookie': 'pgv_pvi=22038528; pgv_si=s3156287488; pgv_pvid=5535248600; yplayer_open=1; ts_last=y.qq.com/portal/player.html; ts_uid=4847550686; yq_index=0; qqmusic_fromtag=66; player_exist=1',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Content-Length': Buffer.byteLength(body),
  },
}, (res) => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    const r = JSON.parse(d);
    const info = r?.req_1?.data?.midurlinfo;
    console.log('midurlinfo[0]:', JSON.stringify(info?.[0], null, 2));
  });
});
req.on('error', e => console.error(e.message));
req.write(body);
req.end();
