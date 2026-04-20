const NeteaseCloudMusicApi = require('NeteaseCloudMusicApi');
const fs = require('fs');
const path = require('path');

const COOKIE_FILE = path.join(__dirname, 'nc_cookie.txt');

// 读取网易云 Cookie
function loadNcCookie() {
  try {
    if (fs.existsSync(COOKIE_FILE)) {
      const c = fs.readFileSync(COOKIE_FILE, 'utf-8').trim();
      if (c) return c;
    }
  } catch(e) {}
  return '';
}

// 扫码登录流程
async function ncQrLogin() {
  console.log('正在生成二维码...');
  const keyRes = await NeteaseCloudMusicApi.login_qr_key({});
  const unikey = keyRes.body.data.unikey;
  
  const qrRes = await NeteaseCloudMusicApi.login_qr_create({ key: unikey, qrimg: true });
  const qrurl = qrRes.body.data.qrurl;
  const qrimg = qrRes.body.data.qrimg; // base64 图片
  
  console.log('');
  console.log('========================================');
  console.log('  网易云音乐 扫码登录');
  console.log('========================================');
  console.log('');
  console.log('请用网易云音乐 APP 扫描以下二维码：');
  console.log(qrurl);
  console.log('');
  console.log('等待扫码中...');
  
  // 轮询扫码状态
  while (true) {
    await new Promise(r => setTimeout(r, 2000));
    const checkRes = await NeteaseCloudMusicApi.login_qr_check({ key: unikey });
    const code = checkRes.body.code;
    
    if (code === 802) {
      process.stdout.write('.');
    } else if (code === 803) {
      console.log('\n\n✅ 登录成功！');
      // 从 set-cookie 响应头获取 cookie
      const cookie = checkRes.body.cookie;
      if (cookie) {
        fs.writeFileSync(COOKIE_FILE, cookie, 'utf-8');
        console.log('Cookie 已保存到', COOKIE_FILE);
        return cookie;
      } else {
        console.warn('⚠️ 登录成功但未获取到 Cookie，请尝试其他方式');
        return '';
      }
    } else if (code === 800) {
      console.log('\n\n❌ 二维码已过期，请重新运行');
      return '';
    }
  }
}

// 验证 Cookie 有效性
async function verifyCookie(cookie) {
  try {
    const res = await NeteaseCloudMusicApi.login_status({ cookie });
    const profile = res.body?.data?.profile;
    if (profile) {
      console.log('✅ Cookie 有效，当前账号：', profile.nickname);
      return true;
    }
  } catch(e) {}
  console.log('❌ Cookie 无效或已过期');
  return false;
}

// 主流程
async function main() {
  const existingCookie = loadNcCookie();
  
  if (existingCookie) {
    console.log('检测到已保存的 Cookie，验证中...');
    const valid = await verifyCookie(existingCookie);
    if (valid) return;
    console.log('需要重新登录');
  }
  
  await ncQrLogin();
}

main();
