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
