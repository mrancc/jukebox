// ── Supabase 数据库配置 ─────────────────────────────────────────
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vyzgdjegxoxymllegrsl.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ5emdkamVneG94eW1sbGVncnNsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njc0NTY4NiwiZXhwIjoyMDkyMzIxNjg2fQ.toAlsPuSvcSU8Ylt7TlAdYSnUl3PYB5Dm9a1YFf49fk';
const JWT_SECRET = process.env.JWT_SECRET || 'jukebox-secret-key-2024';

// 服务端用 service_role key，绕过 RLS
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

// ── JWT 签发/验证 ──
function signToken(userId, email, nickname) {
  return jwt.sign({ userId, email, nickname }, JWT_SECRET, { expiresIn: '30d' });
}

function verifyToken(token) {
  try { return jwt.verify(token, JWT_SECRET); }
  catch { return null; }
}

// ── 自建账号系统（存到 jb_users 表，不依赖 Supabase Auth）──
async function registerUser(email, password, nickname) {
  const lowerEmail = email.toLowerCase().trim();
  // 检查邮箱是否已存在
  const { data: existing } = await supabase
    .from('jb_users')
    .select('id')
    .eq('email', lowerEmail)
    .maybeSingle();
  if (existing) throw new Error('该邮箱已注册');

  const hash = await bcrypt.hash(password, 10);
  const userId = randomUUID();
  const nick = (nickname || '').trim() || lowerEmail.split('@')[0];

  const { error } = await supabase.from('jb_users').insert({
    id: userId,
    email: lowerEmail,
    password_hash: hash,
    nickname: nick,
  });
  if (error) {
    console.error('❌ 注册写库失败:', error.message);
    throw new Error('注册失败：' + error.message);
  }
  return { userId, email: lowerEmail, nickname: nick };
}

async function loginUser(email, password) {
  const lowerEmail = email.toLowerCase().trim();
  const { data: user, error } = await supabase
    .from('jb_users')
    .select('id, email, nickname, password_hash')
    .eq('email', lowerEmail)
    .maybeSingle();

  if (error) throw new Error('查询失败：' + error.message);
  if (!user) throw new Error('邮箱或密码错误');

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) throw new Error('邮箱或密码错误');

  return { userId: user.id, email: user.email, nickname: user.nickname };
}

module.exports = { supabase, signToken, verifyToken, registerUser, loginUser };
