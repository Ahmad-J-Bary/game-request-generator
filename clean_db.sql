-- Clean all data from tables but keep the structure
-- RESTART IDENTITY resets the ID counters to 1
-- CASCADE ensures that dependent rows (foreign keys) are also deleted appropriately

TRUNCATE TABLE 
    games, 
    levels, 
    purchase_events, 
    accounts, 
    account_level_progress, 
    account_purchase_event_progress 
RESTART IDENTITY CASCADE;
