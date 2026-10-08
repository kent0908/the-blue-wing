-- Additive migration only. Amounts are exact decimals, never float totals.
alter table model_request_events add column if not exists upstream_request_id varchar(160);
alter table model_request_events add column if not exists charge_id bigint;
alter table model_request_events add column if not exists key_slot varchar(16);
alter table usage_events add column if not exists provider_cost_source text;
alter table usage_events add column if not exists provider_cost_scope text;
create index if not exists model_request_upstream_idx on model_request_events(provider,upstream_request_id);
create index if not exists model_request_charge_idx on model_request_events(charge_id);
create table if not exists siraya_billing_syncs (
 id uuid primary key,
 scope_account_id varchar(160) not null,
 since timestamptz not null,
 until timestamptz not null check (until > since),
 state text not null check (state in ('running','complete','failed')),
 record_count integer,
 error_code varchar(80),
 started_at timestamptz not null default now(),
 finished_at timestamptz,
 initiated_by bigint references users(id) on delete set null
);
create index if not exists siraya_sync_scope_idx on siraya_billing_syncs(scope_account_id,started_at desc);
create table if not exists siraya_billing_records (
 scope_account_id varchar(160) not null,
 account_id varchar(160) not null,
 request_id varchar(160) not null,
 requested_at timestamptz not null,
 model varchar(160) not null,
 cost numeric(18,6) not null check (cost >= 0),
 currency char(3) not null,
 status varchar(64) not null,
 usage jsonb not null default '{}',
 performance jsonb not null default '{}',
 charge_id bigint,
 match_state text not null default 'unmatched' check (match_state in ('matched','unmatched','ambiguous')),
 first_synced_at timestamptz not null default now(),
 last_synced_at timestamptz not null default now(),
 primary key (scope_account_id,account_id,request_id)
);
create index if not exists siraya_billing_time_idx on siraya_billing_records(scope_account_id,requested_at desc);
create index if not exists siraya_billing_charge_idx on siraya_billing_records(charge_id);
create table if not exists siraya_billing_revisions (
 id bigint generated always as identity primary key,
 scope_account_id varchar(160) not null,
 account_id varchar(160) not null,
 request_id varchar(160) not null,
 previous_cost numeric(18,6) not null,
 next_cost numeric(18,6) not null,
 previous_currency char(3) not null,
 next_currency char(3) not null,
 changed_at timestamptz not null default now()
);
