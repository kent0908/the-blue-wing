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

create table if not exists credit_ledger (
  id         bigint generated always as identity primary key,
  user_id    bigint not null references users(id) on delete cascade,
  delta      integer not null,
  reason     text not null,
  ref        text,
  created_at timestamptz not null default now()
);
create index if not exists ledger_user_idx on credit_ledger(user_id, created_at desc);
