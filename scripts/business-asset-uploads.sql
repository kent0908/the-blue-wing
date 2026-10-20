-- Isolated B-side upload reservations. No C-side assets, wallet or history is changed.
create table if not exists business_asset_uploads (
  id uuid primary key,
  account_id uuid not null,
  user_id bigint not null,
  credential_id uuid not null,
  client_request_id uuid not null,
  pathname text not null unique,
  filename varchar(120) not null,
  content_type varchar(64) not null,
  media_type varchar(8) not null check (media_type in ('image','video','audio')),
  expected_bytes bigint not null check (expected_bytes > 0 and expected_bytes <= 52428800),
  blob_etag text,
  status varchar(20) not null default 'created' check (status in ('created','registering','processing','active','failed','unknown')),
  provider_asset_id varchar(200),
  error_code varchar(64),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (account_id,user_id) references business_accounts(id,user_id) on delete restrict,
  foreign key (credential_id,account_id,user_id) references business_credentials(id,account_id,user_id) on delete restrict,
  unique (account_id,client_request_id)
);
create index if not exists business_asset_uploads_owner_idx on business_asset_uploads(account_id,updated_at desc);
create index if not exists business_asset_uploads_provider_idx on business_asset_uploads(account_id,provider_asset_id) where provider_asset_id is not null;
