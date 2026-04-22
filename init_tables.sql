-- 三源点歌台：数据库初始化（所有表）
-- 在 Supabase SQL Editor 中执行此脚本

-- ── 1. 房间表 ──
CREATE TABLE IF NOT EXISTS rooms (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT UNIQUE NOT NULL,
  creator_id    TEXT,
  password      TEXT DEFAULT NULL,
  current_index INTEGER DEFAULT -1,
  is_playing    BOOLEAN DEFAULT false,
  "current_time" DOUBLE PRECISION DEFAULT 0,
  uid_counter   INTEGER DEFAULT 0,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE rooms DISABLE ROW LEVEL SECURITY;

-- ── 2. 歌曲表 ──
CREATE TABLE IF NOT EXISTS songs (
  id          BIGSERIAL PRIMARY KEY,
  room_id     BIGINT REFERENCES rooms(id) ON DELETE CASCADE,
  uid         INTEGER NOT NULL,
  sort_order  INTEGER DEFAULT 0,
  source      TEXT NOT NULL DEFAULT 'qq',
  song_id     TEXT NOT NULL,
  name        TEXT NOT NULL,
  artist      TEXT DEFAULT '',
  album       TEXT DEFAULT '',
  cover       TEXT DEFAULT '',
  url         TEXT DEFAULT '',
  duration    REAL DEFAULT 0,
  requester   TEXT DEFAULT '',
  lyrics      TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE songs DISABLE ROW LEVEL SECURITY;

-- ── 3. 操作日志表 ──
CREATE TABLE IF NOT EXISTS op_logs (
  id          BIGSERIAL PRIMARY KEY,
  room_id     BIGINT REFERENCES rooms(id) ON DELETE CASCADE,
  user_id     TEXT,
  action      TEXT NOT NULL,
  nickname    TEXT DEFAULT '匿名',
  ip          TEXT DEFAULT '',
  detail      TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE op_logs DISABLE ROW LEVEL SECURITY;

-- ── 4. 用户表（自建账号系统）──
CREATE TABLE IF NOT EXISTS jb_users (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  nickname      TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE jb_users DISABLE ROW LEVEL SECURITY;

-- ── 清理旧 Supabase Auth 触发器（如果有）──
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
