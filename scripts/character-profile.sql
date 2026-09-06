-- Additive only: old characters, messages, balances and assets are untouched.
ALTER TABLE characters ADD COLUMN IF NOT EXISTS profile jsonb NOT NULL DEFAULT '{}'::jsonb;
