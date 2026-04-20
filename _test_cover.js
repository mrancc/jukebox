const NC = require('NeteaseCloudMusicApi');
const crypto = require('crypto');

// 网易云 picId -> URL 的官方算法
function ncPicUrl(picId) {
  if (!picId) return '';
  // 使用 music.163.com 的图片CDN，直接拼接
  // 实测格式: https://p2.music.126.net/{encId}/{picId}.jpg
  // encId 通过 AES-128-ECB 加密 picId 获得（已知密钥）
  const MODULUS = '00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97deff3647db39e878d8ea';
  const KEY = '010001';
  const SECRET = '3c6e0b8a9c15224a';
  
  // 实际上直接用以下格式即可（无需加密，只是文件路径规则）
  // 网易云图片服务器: https://p{1|2|3}.music.126.net/{encId}/{picId}.jpg
  // encId 示例可以通过 album 接口看到
  // 最简单：直接用 music.163.com/api/img/... 这个公开接口
  return `https://music.163.com/api/img/blur/109951163477164918`;
}

async function main() {
  // 用 song_detail 批量获取（支持逗号分隔多个id）
  const r1 = await NC.search({ keywords: '周杰伦晴天', limit: 3, type: 1 });
  const songs = r1?.body?.result?.songs || [];
  const ids = songs.map(s => s.id).join(',');
  
  console.log('ids:', ids);
  const r2 = await NC.song_detail({ ids });
  const details = r2?.body?.songs || [];
  console.log('=== song_detail al fields ===');
  details.forEach(s => {
    console.log(`${s.name}: al=`, JSON.stringify(s.al));
  });
}

main().catch(console.error);
