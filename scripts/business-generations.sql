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
  -- Transport receipt for exact Console billing lookup, independent of the asynchronous model task ID.
  provider_request_id text check (provider_request_id is null or provider_request_id ~ '^[A-Za-z0-9_.:-]{1,160}$'),
  provider_http_status integer check (provider_http_status is null or provider_http_status between 100 and 599),
  provider_request_ids text[] not null default '{}' check (cardinality(provider_request_ids) between 0 and 3),
  provider_receipt_count integer not null default 0 check (provider_receipt_count between 0 and 3),
  submitted_at timestamptz,
  completed_at timestamptz,
  duration_ms bigint check (duration_ms is null or duration_ms >= 0),
  provider_cost numeric(18,6) check (provider_cost is null or provider_cost >= 0),
  provider_currency text check (provider_currency is null or provider_currency ~ '^[A-Z]{3}$'),
  billing_status text not null default 'pending' check (billing_status in ('pending','matched','unavailable')),
  billing_checked_at timestamptz,
  provider_billing_outcome text,
  provider_duration_ms bigint check (provider_duration_ms is null or provider_duration_ms >= 0),
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
alter table business_generations add column if not exists provider_request_id text
  check (provider_request_id is null or provider_request_id ~ '^[A-Za-z0-9_.:-]{1,160}$');
alter table business_generations add column if not exists provider_http_status integer
  check (provider_http_status is null or provider_http_status between 100 and 599);
alter table business_generations add column if not exists provider_request_ids text[] not null default '{}'
  check (cardinality(provider_request_ids) between 0 and 3);
alter table business_generations add column if not exists provider_receipt_count integer not null default 0
  check (provider_receipt_count between 0 and 3);
alter table business_generations add column if not exists submitted_at timestamptz;
alter table business_generations add column if not exists completed_at timestamptz;
alter table business_generations add column if not exists duration_ms bigint check (duration_ms is null or duration_ms >= 0);
alter table business_generations add column if not exists provider_cost numeric(18,6) check (provider_cost is null or provider_cost >= 0);
alter table business_generations add column if not exists provider_currency text check (provider_currency is null or provider_currency ~ '^[A-Z]{3}$');
alter table business_generations add column if not exists billing_status text not null default 'pending'
  check (billing_status in ('pending','matched','unavailable'));
alter table business_generations add column if not exists billing_checked_at timestamptz;
alter table business_generations add column if not exists provider_billing_outcome text;
alter table business_generations add column if not exists provider_duration_ms bigint check (provider_duration_ms is null or provider_duration_ms >= 0);
create index if not exists business_generations_owner_created_idx on business_generations(account_id,created_at desc);
create index if not exists business_generations_pending_idx on business_generations(account_id,status) where status in ('submitting','processing','unknown');
