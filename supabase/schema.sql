-- ============================================================================
-- โครงสร้างฐานข้อมูล Supabase (schema.sql)
-- ระบบออกใบเสร็จรับเงิน มหาวิทยาลัยเทคโนโลยีราชมงคลสุวรรณภูมิ (RMUTSB)
-- รองรับการเพิ่ม/แก้ไขผู้ใช้งาน รหัสผ่าน และข้อมูลทั้งหมดผ่านหน้าเว็บโดยตรง
-- ============================================================================

create table if not exists public.app_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  user_id text primary key,
  username text,
  password text,
  email text,
  role text not null default 'user',
  permission_level text not null default 'issuer',
  display_name text not null,
  staff_code text,
  position text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;
alter table public.profiles enable row level security;

drop policy if exists "Allow public read write app_state" on public.app_state;
create policy "Allow public read write app_state"
  on public.app_state
  for all
  using (true)
  with check (true);

drop policy if exists "Allow public read write profiles" on public.profiles;
create policy "Allow public read write profiles"
  on public.profiles
  for all
  using (true)
  with check (true);
