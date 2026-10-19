-- Additive business isolation. No consumer plan, wallet, provider key or generation is modified.
create table if not exists business_accounts (
  id uuid primary key,
  user_id bigint not null unique references users(id) on delete restrict,
  company_name varchar(120) not null,
  use_case text not null check (char_length(use_case) between 10 and 2000),
  status text not null default 'pending' check (status in ('pending','approved','rejected','suspended')),
  review_note text,
  reviewed_by bigint references users(id) on delete set null,
  reviewed_at timestamptz(3),
  created_at timestamptz(3) not null default now(),
  updated_at timestamptz(3) not null default now(),
  unique (id,user_id)
);
create index if not exists business_accounts_status_idx on business_accounts(status,updated_at desc);

-- Rotation retires a version but keeps it available to its existing jobs. Explicit deletion
-- revokes every version and erases its ciphertext. A revoked credential can never be used.
create table if not exists business_credentials (
  id uuid primary key,
  account_id uuid not null,
  user_id bigint not null,
  provider text not null default 'siraya' check (provider = 'siraya'),
  label varchar(64) not null,
  last_four varchar(4) not null,
  secret_envelope jsonb,
  is_active boolean not null default true,
  revoked_at timestamptz(3),
  created_at timestamptz(3) not null default now(),
  updated_at timestamptz(3) not null default now(),
  foreign key (account_id,user_id) references business_accounts(id,user_id) on delete restrict,
  check (not is_active or (revoked_at is null and secret_envelope is not null)),
  check (revoked_at is null or secret_envelope is null),
  unique (id,account_id,user_id)
);
create unique index if not exists business_credentials_active_idx
  on business_credentials(account_id,provider) where is_active and revoked_at is null;

-- Mutations append only; application code never updates or deletes audit rows.
-- No plaintext key, ciphertext, prompt, date of birth or email is stored in this audit.
create table if not exists business_audit_events (
  id bigint generated always as identity primary key,
  account_id uuid not null references business_accounts(id) on delete restrict,
  actor_user_id bigint references users(id) on delete set null,
  action varchar(64) not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz(3) not null default now()
);
create index if not exists business_audit_account_idx on business_audit_events(account_id,created_at desc);
