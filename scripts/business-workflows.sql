-- Isolated BYOK graphs; no consumer workflows, assets, wallets or keys are read or changed.
create table if not exists business_canvas_workflows (
  id uuid primary key,
  account_id uuid not null,
  user_id bigint not null,
  name varchar(120) not null check (char_length(name) between 1 and 120),
  graph jsonb not null default '{"nodes":[],"edges":[]}'::jsonb
    check (jsonb_typeof(graph)='object' and graph ? 'nodes' and graph ? 'edges'
      and jsonb_typeof(graph->'nodes')='array' and jsonb_typeof(graph->'edges')='array'),
  version varchar(32) not null check (version ~ '^[a-f0-9]{32}$'),
  created_at timestamptz(3) not null default now(),
  updated_at timestamptz(3) not null default now(),
  foreign key (account_id,user_id) references business_accounts(id,user_id) on delete restrict
);
create index if not exists business_canvas_workflows_owner_idx on business_canvas_workflows(account_id,user_id,updated_at desc);
