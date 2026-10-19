-- Additive B2B-only job ledger. No credit_ledger / C-end history dependency.
create table if not exists business_generations (
  id uuid primary key,
  account_id uuid not null,
  user_id bigint not null,
  credential_id uuid not null,
  client_request_id uuid not null,
  kind text not null check(kind in ('image','video','text')),
  model text not null,
  prompt text not null,
  nsfw boolean not null default false,
  status text not null check(status in ('submitting','processing','completed','failed','unknown')),
  provider_task_id text,
  provider_output jsonb,
  output jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reconcile_after timestamptz,
  foreign key (account_id,user_id) references business_accounts(id,user_id),
  foreign key (credential_id,account_id,user_id) references business_credentials(id,account_id,user_id),
  unique(account_id,client_request_id)
);
alter table business_generations add column if not exists reconcile_after timestamptz;
create index if not exists business_generations_owner_created_idx on business_generations(account_id,created_at desc);
create index if not exists business_generations_pending_idx on business_generations(account_id,status) where status in ('submitting','processing','unknown');
