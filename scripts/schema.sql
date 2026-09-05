-- The Blue Wing — auth + credits schema. Idempotent; safe to re-run.

create table if not exists users (
  id             bigint generated always as identity primary key,
  email          text unique not null,
  password_hash  text not null,
  role           text not null default 'user'   check (role in ('user','admin')),
  status         text not null default 'active' check (status in ('active','banned')),
  email_verified boolean not null default false,
  verify_token   text,
  verify_expires timestamptz,
  plan_code      text not null default 'free',
  plan_renews_at timestamptz,
  created_at     timestamptz not null default now()
);

-- password reset (added after the initial users table; ALTER is idempotent)
alter table users add column if not exists reset_token   text;
alter table users add column if not exists reset_expires timestamptz;

create table if not exists sessions (
  token      text primary key,
  user_id    bigint not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists sessions_user_idx on sessions(user_id);

create table if not exists assets (
  id           bigint generated always as identity primary key,
  user_id      bigint not null references users(id) on delete cascade,
  url          text not null,
  pathname     text not null,
  content_type text not null,
  size         integer not null,
  created_at   timestamptz not null default now()
);
create index if not exists assets_user_idx on assets(user_id, created_at desc);

-- original upload filename, shown in the asset library and used as the @mention
-- label in the Composer. Nullable — older rows fall back to "素材 <id>".
alter table assets add column if not exists filename text;

create table if not exists credit_ledger (
  id         bigint generated always as identity primary key,
  user_id    bigint not null references users(id) on delete cascade,
  delta      integer not null,
  reason     text not null,
  ref        text,
  created_at timestamptz not null default now()
);
create index if not exists ledger_user_idx on credit_ledger(user_id, created_at desc);

-- per-model credit rate card (single source of truth for pricing). Seeded by
-- scripts/seed-rates.mjs; edited from /admin. credits = per image / per second
-- of video / per 1k output tokens depending on modality.
create table if not exists model_rates (
  id         bigint generated always as identity primary key,
  model_id   text not null unique,
  modality   text not null check (modality in ('image','video','text')),
  credits    integer not null,
  active     boolean not null default true,
  updated_at timestamptz not null default now()
);

-- editable home-page content: hero slides, model showcase cards, canvas templates
create table if not exists home_blocks (
  id          bigint generated always as identity primary key,
  section     text not null check (section in ('hero','showcase','template')),
  sort        integer not null default 0,
  title       text not null default '',
  subtitle    text not null default '',
  badge       text,
  asset_id    bigint references assets(id) on delete set null,
  target_mode text,
  model_id    text,
  prompt      text,
  params      jsonb not null default '{}',
  active      boolean not null default true,
  updated_at  timestamptz not null default now()
);
create index if not exists home_blocks_section_idx on home_blocks(section, sort);

-- generated results (images / videos / text). Previously the "生成紀錄" panel
-- only held in-memory React state and lost everything on reload — this makes
-- it durable per-user. `ref` (video job id) is deduped so re-polling an async
-- video doesn't insert it twice.
create table if not exists generations (
  id           bigint generated always as identity primary key,
  user_id      bigint not null references users(id) on delete cascade,
  kind         text not null check (kind in ('image','video','text')),
  model        text not null,
  prompt       text not null,
  url          text,
  text_content text,
  ref          text,
  created_at   timestamptz not null default now()
);
create index if not exists generations_user_idx on generations(user_id, created_at desc);
create unique index if not exists generations_ref_uidx on generations(user_id, ref) where ref is not null;

-- 智慧畫布 (Canvas): user-built node graphs (text/image/video/load-image nodes
-- wired together). `graph` holds the whole { nodes, edges } document — small
-- enough that jsonb-as-a-blob is simpler than normalizing nodes/edges into
-- their own tables, and matches how the client already models it.
create table if not exists canvas_workflows (
  id         bigint generated always as identity primary key,
  user_id    bigint not null references users(id) on delete cascade,
  name       text not null default 'Untitled',
  graph      jsonb not null default '{"nodes":[],"edges":[]}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists canvas_workflows_user_idx on canvas_workflows(user_id, updated_at desc);

-- 陪聊角色 IP：把資產庫裡的一張圖（通常是生成出來的圖片或數位人）綁成一個有
-- 名字、有人設的角色，之後可以長期跟它聊天。avatar_asset_id 掉了(素材被刪)
-- 就變成沒有頭像，角色本身還在。
create table if not exists characters (
  id              bigint generated always as identity primary key,
  user_id         bigint not null references users(id) on delete cascade,
  name            text not null,
  avatar_asset_id bigint references assets(id) on delete set null,
  personality     text not null default '',
  model           text not null default 'deepseek-v4-flash-0731',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists characters_user_idx on characters(user_id, updated_at desc);
alter table characters alter column model set default 'deepseek-v4-flash-0731';

-- 喜好標籤（逗號分隔的自由文字），聊到符合的話題會多拿好感度。
alter table characters add column if not exists likes text not null default '';
-- 好感度：每則訊息 +1，聊到 likes 裡的話題額外加成。決定關係階段
-- （見 lib/characters.ts 的 AFFECTION_LEVELS），階段越高語氣越親密、
-- 解鎖的敘述越多——這是讓使用者持續回來聊天的核心機制。
alter table characters add column if not exists affection integer not null default 0;
-- 累積對話輪數，用來決定何時該重新整理 memory_summary（見下）。
alter table characters add column if not exists turn_count integer not null default 0;
-- 長期記憶摘要：每 MEMORY_REFRESH_EVERY 輪對話，請模型把「重要事實／
-- 使用者偏好／關係進展」濃縮成幾條摘要存在這裡，每次對話都會帶著這份
-- 摘要，而不是只帶最近幾句——這樣角色才會「記得」很久以前聊過的事，
-- 不會被固定視窗大小限制住，prompt 也不會隨對話變長而無限膨脹。
alter table characters add column if not exists memory_summary text not null default '';

-- 每個角色的對話紀錄，跟「生成紀錄」是分開的概念——這是持續的陪聊串，不是
-- 一次性的生成結果。
create table if not exists character_messages (
  id           bigint generated always as identity primary key,
  character_id bigint not null references characters(id) on delete cascade,
  role         text not null check (role in ('user','assistant')),
  content      text not null,
  created_at   timestamptz not null default now()
);
create index if not exists character_messages_char_idx on character_messages(character_id, created_at);

-- 使用者自己的陪聊身分（跨所有角色共用一份，不是每個角色各存一份）。
create table if not exists user_personas (
  user_id    bigint primary key references users(id) on delete cascade,
  name       text not null default '',
  bio        text not null default '',
  updated_at timestamptz not null default now()
);
