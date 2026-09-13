-- ============================================================================
-- 寝室值日排班系统 · 数据库建表脚本
-- ----------------------------------------------------------------------------
-- 使用方法：
--   1. 打开 https://supabase.com 注册并新建一个项目（免费版够用）
--   2. 左侧菜单进入 SQL Editor → New query
--   3. 把本文件全部内容粘贴进去，点 Run
--   4. 去 Project Settings → API，复制 Project URL 和 anon public key，
--      填进项目根目录的 .env 文件（参考 .env.example）
--
-- 设计要点：
--   * 房间由 (apartment, building, room_number) 唯一确定，多人输入同样的三项
--     就会落到同一行记录上，这是"无需注册即可共享"的基础。
--   * 成员和值日内容用 deleted_at 做软删除。这样删掉一个人之后，
--     历史排班里的 member_id 仍然指向一条真实存在的记录，姓名查得到，
--     也避免了外键被破坏。
--   * 排班按"天"存（schedules 一天一行），每天的具体分工放在 assignments。
--     虽然周期内每天安排相同，但按天存才能自然地支持"仅今天调整"。
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 房间
-- ---------------------------------------------------------------------------
create table if not exists public.rooms (
  id            uuid primary key default gen_random_uuid(),
  apartment     text        not null,
  building      text        not null,
  room_number   text        not null,
  name          text        not null,
  period_days   integer     not null default 7 check (period_days between 1 and 365),
  start_date    date        not null,
  end_date      date        not null,
  rotation_mode text        not null default 'cycle',
  created_at    timestamptz not null default now(),
  constraint rooms_unique_location unique (apartment, building, room_number),
  constraint rooms_date_order check (end_date >= start_date)
);

-- ---------------------------------------------------------------------------
-- 成员
-- ---------------------------------------------------------------------------
create table if not exists public.members (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid        not null references public.rooms(id) on delete cascade,
  name        text        not null,
  order_index integer     not null default 0,
  active      boolean     not null default true,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists members_room_idx on public.members (room_id, order_index);

-- ---------------------------------------------------------------------------
-- 值日内容
-- ---------------------------------------------------------------------------
create table if not exists public.duty_items (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid        not null references public.rooms(id) on delete cascade,
  name        text        not null,
  order_index integer     not null default 0,
  color       text        not null default '#3b82f6',
  deleted_at  timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists duty_items_room_idx on public.duty_items (room_id, order_index);

-- ---------------------------------------------------------------------------
-- 排班：一天一行
-- ---------------------------------------------------------------------------
create table if not exists public.schedules (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid        not null references public.rooms(id) on delete cascade,
  date        date        not null,
  cycle_index integer     not null,
  created_at  timestamptz not null default now(),
  constraint schedules_unique_day unique (room_id, date)
);

create index if not exists schedules_room_date_idx on public.schedules (room_id, date);

-- ---------------------------------------------------------------------------
-- 分工：某一天某人负责某一项
-- ---------------------------------------------------------------------------
create table if not exists public.assignments (
  id           uuid primary key default gen_random_uuid(),
  schedule_id  uuid    not null references public.schedules(id) on delete cascade,
  member_id    uuid    not null references public.members(id) on delete cascade,
  duty_item_id uuid    not null references public.duty_items(id) on delete cascade,
  is_manual    boolean not null default false,
  note         text
);

create index if not exists assignments_schedule_idx on public.assignments (schedule_id);

-- ---------------------------------------------------------------------------
-- 历史记录
-- ---------------------------------------------------------------------------
create table if not exists public.change_logs (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid        not null references public.rooms(id) on delete cascade,
  date        date,
  action      text        not null,
  summary     text        not null default '',
  before_json jsonb,
  after_json  jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists change_logs_room_idx on public.change_logs (room_id, created_at desc);

-- ============================================================================
-- 行级安全（RLS）
-- ----------------------------------------------------------------------------
-- 系统使用 Supabase 的**匿名登录**：用户完全无感知，不需要注册，
-- 但每个设备都会拿到一个 authenticated 身份。
--
-- 因此策略写成「authenticated 可读写」，可以挡住直接拿 anon key
-- 绕过前端来爬数据的脚本。
--
-- ⚠️ 必须知道的边界：房间是由「公寓 + 楼栋 + 房间号」明码标识的，
--    知道房间号的人可以进来。值日表不是敏感信息，所以默认没做额外口令。
--    如果你需要，可以后续加一个"房间口令"字段来做二次校验。
-- ============================================================================

alter table public.rooms       enable row level security;
alter table public.members     enable row level security;
alter table public.duty_items  enable row level security;
alter table public.schedules   enable row level security;
alter table public.assignments enable row level security;
alter table public.change_logs enable row level security;

drop policy if exists rooms_authenticated_all on public.rooms;
create policy rooms_authenticated_all on public.rooms
  for all to authenticated using (true) with check (true);

drop policy if exists members_authenticated_all on public.members;
create policy members_authenticated_all on public.members
  for all to authenticated using (true) with check (true);

drop policy if exists duty_items_authenticated_all on public.duty_items;
create policy duty_items_authenticated_all on public.duty_items
  for all to authenticated using (true) with check (true);

drop policy if exists schedules_authenticated_all on public.schedules;
create policy schedules_authenticated_all on public.schedules
  for all to authenticated using (true) with check (true);

drop policy if exists assignments_authenticated_all on public.assignments;
create policy assignments_authenticated_all on public.assignments
  for all to authenticated using (true) with check (true);

drop policy if exists change_logs_authenticated_all on public.change_logs;
create policy change_logs_authenticated_all on public.change_logs
  for all to authenticated using (true) with check (true);

-- ============================================================================
-- 开启 Realtime（多设备实时同步靠它推送变化）
-- ============================================================================
do $$
declare
  t text;
begin
  foreach t in array array['rooms', 'members', 'duty_items', 'schedules', 'assignments', 'change_logs']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception
      when duplicate_object then null;  -- 已经加过就跳过
      when undefined_object then null;  -- 某些项目没有默认 publication，忽略
    end;
  end loop;
end $$;

-- ============================================================================
-- 可选：匿名登录的开关
-- ----------------------------------------------------------------------------
-- 新版 Supabase 需要在 Authentication → Sign In / Providers → Anonymous
-- 里手动打开匿名登录，否则前端调用 signInAnonymously 会报错。
-- 如果界面里没有这个开关，可以执行下面这句直接用 SQL 打开：
-- ============================================================================
-- update auth.config set enable_anonymous_sign_ins = true;
