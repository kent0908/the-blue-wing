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
