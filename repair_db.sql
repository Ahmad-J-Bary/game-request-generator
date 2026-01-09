-- COMPREHENSIVE REPAIR SCRIPT
-- This script will:
-- 1. Ensure all tables exist (including progress tables).
-- 2. Add 'updated_at' column to all tables if missing.
-- 3. Fix UNIQUE constraints on games.
-- 4. Re-apply triggers.

-- 1. Progress Tables (Ensure they exist)
CREATE TABLE IF NOT EXISTS account_level_progress (
    account_id BIGINT REFERENCES accounts(id) ON DELETE CASCADE,
    level_id BIGINT REFERENCES levels(id) ON DELETE CASCADE,
    is_completed BOOLEAN DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (account_id, level_id)
);

CREATE TABLE IF NOT EXISTS account_purchase_event_progress (
    account_id BIGINT REFERENCES accounts(id) ON DELETE CASCADE,
    purchase_event_id BIGINT REFERENCES purchase_events(id) ON DELETE CASCADE,
    is_completed BOOLEAN DEFAULT FALSE,
    days_offset INTEGER DEFAULT 0,
    time_spent INTEGER DEFAULT 0,
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (account_id, purchase_event_id)
);

-- 2. Add updated_at if missing (Idempotent)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='games' AND column_name='updated_at') THEN
        ALTER TABLE games ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='levels' AND column_name='updated_at') THEN
        ALTER TABLE levels ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='purchase_events' AND column_name='updated_at') THEN
        ALTER TABLE purchase_events ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='updated_at') THEN
        ALTER TABLE accounts ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF; -- accounts
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='account_level_progress' AND column_name='updated_at') THEN
        ALTER TABLE account_level_progress ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='account_purchase_event_progress' AND column_name='updated_at') THEN
        ALTER TABLE account_purchase_event_progress ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

-- 3. Fix Constraints
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_name_key;
ALTER TABLE games ADD CONSTRAINT games_name_key UNIQUE (name);

-- 4. Re-apply Triggers
CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_games_updated_at ON games;
CREATE TRIGGER update_games_updated_at BEFORE UPDATE ON games FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_levels_updated_at ON levels;
CREATE TRIGGER update_levels_updated_at BEFORE UPDATE ON levels FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_purchase_events_updated_at ON purchase_events;
CREATE TRIGGER update_purchase_events_updated_at BEFORE UPDATE ON purchase_events FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_accounts_updated_at ON accounts;
CREATE TRIGGER update_accounts_updated_at BEFORE UPDATE ON accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_account_level_progress_updated_at ON account_level_progress;
CREATE TRIGGER update_account_level_progress_updated_at BEFORE UPDATE ON account_level_progress FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_account_purchase_event_progress_updated_at ON account_purchase_event_progress;
CREATE TRIGGER update_account_purchase_event_progress_updated_at BEFORE UPDATE ON account_purchase_event_progress FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
