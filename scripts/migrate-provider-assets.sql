create table if not exists provider_assets (
 id bigserial primary key,
 user_id bigint not null references users(id) on delete cascade,
 source_asset_id bigint references assets(id) on delete set null,
 provider_asset_id text unique,
 name text not null,
 asset_type text not null check (asset_type in ('image','video','audio')),
 status text not null check (status in ('uploading','processing','active','failed','needs_review')),
 consent_at timestamptz not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (user_id, source_asset_id)
);
create index if not exists provider_assets_user_created on provider_assets(user_id,created_at desc);
