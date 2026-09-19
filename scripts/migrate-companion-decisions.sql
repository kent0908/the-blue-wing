-- Prepared migration; not applied automatically. Stores decisions, never copies chat text.
create table if not exists companion_decision_evaluations (
 message_id bigint not null references character_messages(id) on delete cascade,
 character_id bigint not null references characters(id) on delete cascade,
 policy_version text not null,
 status text not null check (status in ('pending','completed','failed')),
 result jsonb,
 duration_ms integer,
 error_code text,
 created_at timestamptz not null default now(),
 primary key(message_id, policy_version)
);
create index if not exists companion_decision_character_idx on companion_decision_evaluations(character_id, created_at desc);
