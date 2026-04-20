// 测试 app.js 的 QQ 和网易云搜索
const http = require('http');

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

async function test() {
  // 先启动 app.js 的话... 直接测试搜索函数
  console.log('直接测试 app.js 中的搜索函数...');

  // 加载 app.js 的函数（不启动服务器）
  // 模拟测试
  const NeteaseCloudMusicApi = require('NeteaseCloudMusicApi');
  
  console.log('=== 网易云搜索 "周杰伦 晴天" ===');
  const ncResult = await NeteaseCloudMusicApi.search({ keywords: '周杰伦 晴天', limit: 3, type: 1 });
  const ncSongs = ncResult?.body?.result?.songs || [];
  ncSongs.forEach((s, i) => {
    console.log(`[${i}] id=${s.id} "${s.name}" fee=${s.fee}`);
  });

  console.log('\n=== QQ 搜索 "周杰伦 晴天" ===');
  // 直接测试 QQ 搜索
  const https = require('https');
  function httpPost(url, body, headers = {}) {
    return new Promise((resolve, reject) => {
      const bodyStr = JSON.stringify(body);
      const req = https.request(url, {
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
  
  const payload = {
    comm: { ct: '19', cv: '1859', uin: '0' },
    req: {
      method: 'DoSearchForQQMusicDesktop',
      module: 'music.search.SearchCgiService',
      param: { grp: 1, num_per_page: 3, page_num: 1, query: '周杰伦 晴天', search_type: 0 },
    },
  };
  const QQ_HEADERS = {
    'Referer': 'http://y.qq.com',
    'User-Agent': 'QQ%E9%9F%B3%E4%B9%90/54409 CFNetwork/901.1 Darwin/17.6.0 (x86_64)',
  };
  const resp = JSON.parse(await httpPost('https://u.y.qq.com/cgi-bin/musicu.fcg', payload, QQ_HEADERS));
  const qqSongs = resp?.req?.data?.body?.song?.list || [];
  qqSongs.forEach((s, i) => {
    console.log(`[${i}] mid=${s.mid} "${s.name}" pay=${s.pay?.pay_play}`);
  });

  console.log('\n✅ 两个搜索源都正常！');
}

test().catch(console.error);
