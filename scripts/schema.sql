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

-- Expiring credits: monthly plan grants stop counting once the next renewal
-- date passes (so "unused monthly credits don't carry over" falls out of a
-- plain balance query, no separate reset job needed), and purchased credit
-- packs get a real 2-year expiry instead of being permanent. NULL = never
-- expires (admin goodwill grants, spends, refunds).
alter table credit_ledger add column if not exists expires_at timestamptz;
create index if not exists ledger_expiry_idx on credit_ledger(user_id, expires_at);

-- Dedupes the once-a-day free-tier grant the same way generations dedupes a
-- video job's ref — `ref` holds that day's date (YYYY-MM-DD) for
-- reason='daily_free' rows only, so a retried/concurrent grant is a no-op.
create unique index if not exists credit_ledger_daily_free_uidx
  on credit_ledger(user_id, ref) where reason = 'daily_free';

-- Guards against the same failed charge being refunded twice (lib/creditTransactions.ts's
-- refundCharge checks-then-inserts, which alone still has a race window —
-- this constraint is the actual backstop).
create unique index if not exists credit_refund_once
  on credit_ledger(user_id, ref) where reason = 'charge_refund';

-- Backing store for lib/rateLimit.ts's DB-shared (not per-instance-memory)
-- rate limiter — a fixed-window counter per key.
create table if not exists api_limits (
  key   text primary key,
  bucket bigint not null,
  hits  integer not null
);

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

-- Admin-editable display name / sort order per model (lib/modelDisplay.ts).
-- NULL display_name/sort_order means "use the computed default" (cleaned-up
-- id / grouped-by-family order) — a row only needs to exist here for the
-- fields an admin actually chose to override.
create table if not exists model_display (
  model_id     text primary key,
  display_name text,
  sort_order   integer,
  updated_at   timestamptz not null default now()
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

-- Standalone 3D導演台 (/canvas/director3d) autosave — real per-account
-- storage instead of the browser's localStorage, so it's available on any
-- device you log into and isn't lost if you clear site data. One scene per
-- user (matches the standalone page's single-autosave-slot model; a
-- Canvas-node director3d's own scene still lives inline in that workflow's
-- canvas_workflows.graph, untouched by this table). Isolation is the same
-- pattern as every other per-user table here: every read/write goes through
-- `where user_id = <the authenticated user>` — see app/api/director3d/route.ts.
create table if not exists director3d_scenes (
  user_id    bigint primary key references users(id) on delete cascade,
  scene      jsonb not null,
  updated_at timestamptz not null default now()
);

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

-- 陪聊角色的「解鎖場景」——高階方案專屬：達到某個好感度階段後，可以生成一張
-- 專屬圖片或一段專屬影片留作紀念。生成本身走既有的 /api/images、/api/videos
-- （額度、模型都一樣），這張表只負責記錄「這是哪個角色、哪個階段解鎖的」。
create table if not exists character_scenes (
  id           bigint generated always as identity primary key,
  character_id bigint not null references characters(id) on delete cascade,
  user_id      bigint not null references users(id) on delete cascade,
  kind         text not null check (kind in ('image','video')),
  level_index  integer not null default 0,
  url          text not null,
  prompt       text not null,
  model        text not null,
  created_at   timestamptz not null default now()
);
create index if not exists character_scenes_char_idx on character_scenes(character_id, created_at desc);

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

-- Structured companion settings (additive).
ALTER TABLE characters ADD COLUMN IF NOT EXISTS profile jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Trusted, resumable character-scene generation requests. Additive only.
create table if not exists character_scene_requests (
  id uuid primary key,
  character_id bigint not null references characters(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  kind text not null check (kind in ('image','video')),
  level_index integer not null,
  avatar_asset_id bigint not null,
  model text not null,
  prompt text not null,
  status text not null check (status in ('submitting','processing','completed','failed')),
  job_id text,
  output_url text,
  scene_id bigint references character_scenes(id) on delete set null,
  credits_spent integer not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists character_scene_requests_active_idx
  on character_scene_requests(user_id,character_id,kind)
  where status in ('submitting','processing');
create index if not exists character_scene_requests_owner_idx
  on character_scene_requests(user_id,character_id,created_at desc);

-- Restore the previous idle-video table without deleting or replacing rows.
create table if not exists character_idle_videos (
  id bigint generated always as identity primary key,
  character_id bigint not null references characters(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','completed','failed')),
  job_id text, model text not null, prompt text not null, url text,
  free boolean not null default false,
  credits_spent integer not null default 0,
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists character_idle_videos_char_idx on character_idle_videos(character_id,created_at desc);
create unique index if not exists credit_ledger_idle_video_free_uidx on credit_ledger(user_id,ref) where reason='idle_video_free';
alter table character_idle_videos add column if not exists free_marker_id bigint;
alter table character_idle_videos add column if not exists charge_id bigint;
alter table character_idle_videos add column if not exists refund_done boolean not null default false;

alter table character_idle_videos add column if not exists source_url text;

-- Persisted, expiring generation quotes. Additive fields; existing rows retained.
alter table character_scene_requests add column if not exists credits_quoted integer not null default 0;
alter table character_scene_requests add column if not exists seconds integer;
alter table character_scene_requests add column if not exists resolution text;
alter table character_scene_requests add column if not exists summary text;
alter table character_scene_requests add column if not exists expires_at timestamptz;
alter table character_scene_requests drop constraint if exists character_scene_requests_status_check;
alter table character_scene_requests add constraint character_scene_requests_status_check check(status in ('quoted','submitting','processing','completed','failed'));
-- Owned, persistent manifests for Seedream Pro layer decomposition.
create table if not exists generation_layer_sets (
 id uuid primary key,
 user_id bigint not null references users(id) on delete cascade,
 model text not null,
 prompt text not null,
 layers jsonb not null,
 credits_spent integer not null,
 created_at timestamptz not null default now()
);
create index if not exists generation_layer_sets_owner_idx on generation_layer_sets(user_id,created_at desc);

-- Additional merged feature tables (additive).
create table if not exists landing_media (
  slot         text primary key,
  kind         text not null check (kind in ('image','video')),
  pathname     text not null,
  content_type text not null,
  updated_at   timestamptz not null default now()
);

create table if not exists character_outfit_changes (
  id            bigint generated always as identity primary key,
  character_id  bigint not null references characters(id) on delete cascade,
  user_id       bigint not null references users(id) on delete cascade,
  outfit_key    text not null,
  credits_spent integer not null default 0,
  retry_used    boolean not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists character_outfit_changes_char_idx on character_outfit_changes(character_id, created_at desc);
create table if not exists canvas_templates (
  id          bigint generated always as identity primary key,
  name        text not null,
  description text not null default '',
  graph       jsonb not null,
  created_by  bigint references users(id) on delete set null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists canvas_templates_sort_idx on canvas_templates(sort_order, created_at desc);
create table if not exists canvas_plaza_posts (
  id          bigint generated always as identity primary key,
  user_id     bigint not null references users(id) on delete cascade,
  name        text not null,
  description text not null default '',
  graph       jsonb not null,
  status      text not null default 'visible' check (status in ('visible','hidden')),
  copy_count  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists canvas_plaza_posts_status_idx on canvas_plaza_posts(status, created_at desc);
create index if not exists canvas_plaza_posts_user_idx on canvas_plaza_posts(user_id, created_at desc);
alter table character_idle_videos add column if not exists outfit_key text;
alter table character_idle_videos add column if not exists purchase_id bigint references character_outfit_changes(id) on delete set null;

-- 圖層編輯 projects (app/editor): one document per project — canvas size /
-- background + the layer list (image layers reference asset or generated-media
-- URLs, never inline bytes, so a document stays small). Versions are
-- snapshots taken around each AI step and on demand — see lib/layerProjects.ts.
create table if not exists layer_projects (
  id          bigint generated always as identity primary key,
  user_id     bigint not null references users(id) on delete cascade,
  name        text not null,
  doc         jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists layer_projects_user_idx on layer_projects(user_id, updated_at desc);

create table if not exists layer_project_versions (
  id          bigint generated always as identity primary key,
  project_id  bigint not null references layer_projects(id) on delete cascade,
  label       text not null default '',
  doc         jsonb not null,
  created_at  timestamptz not null default now()
);

create index if not exists layer_project_versions_project_idx on layer_project_versions(project_id, created_at desc);

-- 官方陪聊角色 templates (lib/companionOfficialSeed.ts, synced by the admin
-- route). Users don't chat with the template itself: opening one clones it
-- into their own `characters` row (official_key below) so affection, memory,
-- messages and the idle video stay per-user with all existing code paths.
-- content_rating: every character under 18 is 'all_ages' — friendship-only
-- ladder, no 解鎖場景 / 衣櫃 / NSFW routing (lib/characters.ts contentRules).
create table if not exists official_characters (
  key                text primary key,
  name               text not null,
  role_title         text not null default '',
  age                integer not null,
  content_rating     text not null default 'all_ages' check (content_rating in ('all_ages','adult')),
  sort               integer not null default 0,
  personality        text not null default '',
  likes              text not null default '',
  profile            jsonb not null default '{}'::jsonb,
  avatar_path        text not null,
  idle_prompt        text not null default '',
  idle_video_url     text,
  idle_video_job_id  text,
  idle_video_status  text not null default 'none' check (idle_video_status in ('none','pending','completed','failed')),
  idle_video_model   text,
  published          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table characters add column if not exists official_key text references official_characters(key) on delete set null;
alter table characters add column if not exists content_rating text not null default 'adult';
create unique index if not exists characters_official_uidx on characters(user_id, official_key) where official_key is not null;

-- ---------------------------------------------------------------------------
-- CRM (app/crm, lib/crm*.ts)
-- ---------------------------------------------------------------------------
-- Public user id shown in support / audit contexts instead of the numeric
-- primary key: two uppercase letters + eight digits (lib/uid.ts). Assigned at
-- registration; existing rows are backfilled by scripts/backfill-uids.mjs.
alter table users add column if not exists uid text unique;
alter table users add column if not exists last_seen_at timestamptz;

-- One row per (user, calendar day) with any authenticated API activity —
-- what DAU / WAU / MAU are counted from (lib/activity.ts).
create table if not exists user_activity_days (
  user_id bigint not null references users(id) on delete cascade,
  day     date   not null,
  primary key (user_id, day)
);
create index if not exists user_activity_days_day_idx on user_activity_days(day);

-- Vendor cost card: what the provider charges per unit (USD per image /
-- per second of 480p video / per 1k output tokens) and the discount this
-- account actually gets. discount_pct NULL = use the global default in
-- crm_settings. Edited from /crm/costs.
create table if not exists model_costs (
  model_id       text primary key,
  list_price_usd numeric(12,6) not null default 0,
  discount_pct   numeric(5,2),
  notes          text not null default '',
  updated_at     timestamptz not null default now()
);

create table if not exists crm_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- Every paid provider call, with the cost snapshot taken at the time
-- (list price × units × resolution multiplier, and the discounted actual).
-- Written by paidCall (lib/creditTransactions.ts); status flips to
-- 'refunded' when the charge is refunded so cost/revenue reports exclude it.
create table if not exists usage_events (
  id              bigint generated always as identity primary key,
  user_id         bigint not null references users(id) on delete cascade,
  charge_id       bigint,
  kind            text not null,
  model           text not null,
  credits         integer not null,
  units           numeric(12,4) not null default 1,
  unit            text not null default 'call',
  resolution      text,
  list_cost_usd   numeric(12,6) not null default 0,
  actual_cost_usd numeric(12,6) not null default 0,
  status          text not null default 'charged' check (status in ('charged','refunded')),
  created_at      timestamptz not null default now()
);
create index if not exists usage_events_created_idx on usage_events(created_at desc);
create index if not exists usage_events_user_idx on usage_events(user_id, created_at desc);
create index if not exists usage_events_charge_idx on usage_events(charge_id);

-- Who did what in the back office. Never stores secrets.
create table if not exists admin_audit_log (
  id             bigint generated always as identity primary key,
  admin_id       bigint references users(id) on delete set null,
  action         text not null,
  target_user_id bigint references users(id) on delete set null,
  detail         jsonb not null default '{}'::jsonb,
  ip             text,
  created_at     timestamptz not null default now()
);
create index if not exists admin_audit_log_created_idx on admin_audit_log(created_at desc);

-- How long a generation took (request → result), shown to the user in 生成紀錄.
alter table generations add column if not exists duration_ms integer;

-- Cost completeness is explicit; existing events predate verified tariffs.
alter table usage_events add column if not exists cost_known boolean not null default false;

-- Public creator attribution; email remains private.
alter table users add column if not exists nickname varchar(96);
