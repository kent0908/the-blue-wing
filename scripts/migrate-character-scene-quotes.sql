-- Persisted, expiring generation quotes. Additive fields; existing rows retained.
alter table character_scene_requests add column if not exists credits_quoted integer not null default 0;
alter table character_scene_requests add column if not exists seconds integer;
alter table character_scene_requests add column if not exists resolution text;
alter table character_scene_requests add column if not exists summary text;
alter table character_scene_requests add column if not exists expires_at timestamptz;
alter table character_scene_requests drop constraint if exists character_scene_requests_status_check;
alter table character_scene_requests add constraint character_scene_requests_status_check check(status in ('quoted','submitting','processing','completed','failed'));
