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
