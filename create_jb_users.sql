-- 创建用户表（自建账号系统，不依赖 Supabase Auth）
CREATE TABLE IF NOT EXISTS jb_users (
  id          TEXT PRIMARY KEY,
  email       TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  nickname    TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 关闭 RLS（service_role 已可绕过，但显式关闭更安全）
ALTER TABLE jb_users DISABLE ROW LEVEL SECURITY;

-- 如果之前有 profiles 触发器阻止 auth.users 写入，可以一并清除
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
