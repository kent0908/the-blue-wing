-- Additive, opt-in draft workflow. A reservation survives uncertain responses to prevent automatic duplicate paid calls.
create table if not exists seedance_drafts (
  id bigint generated always as identity primary key,
  user_id bigint not null references users(id) on delete cascade,
  request_id uuid not null,
  job_id text unique,
  charge_id bigint references credit_ledger(id),
  status text not null default 'submitting' check (status in ('submitting','processing','completed','failed')),
  upstream_task_id text,
  prompt text not null,
  seconds integer not null check (seconds between 4 and 30),
  aspect_ratio text not null,
  generate_audio boolean not null,
  seed integer,
  url text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  final_request_id uuid,
  final_attempt_ids uuid[] not null default '{}'::uuid[],
  final_status text check (final_status in ('submitting','processing','completed','failed','unknown')),
  final_job_id text unique,
  final_charge_id bigint references credit_ledger(id),
  final_url text,
  final_created_at timestamptz,
  unique(user_id,request_id)
);
create index if not exists seedance_drafts_user_date_idx on seedance_drafts(user_id,created_at desc);
alter table seedance_drafts add column if not exists final_attempt_ids uuid[] not null default '{}'::uuid[];
update seedance_drafts set final_attempt_ids=array_append(final_attempt_ids,final_request_id)
  where final_request_id is not null and not (final_request_id=any(final_attempt_ids));
