-- Fix missing UNIQUE constraint on games(name)
-- This is required for "ON CONFLICT (name) DO NOTHING" to work

ALTER TABLE games 
DROP CONSTRAINT IF EXISTS games_name_key;

ALTER TABLE games 
ADD CONSTRAINT games_name_key UNIQUE (name);
