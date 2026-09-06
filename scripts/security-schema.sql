-- Additive security migration; no historical ledger values rewritten.
create table if not exists api_limits (
  key text primary key, bucket bigint not null, hits integer not null
);
create unique index if not exists credit_refund_once
on credit_ledger(user_id,ref) where reason='charge_refund';
