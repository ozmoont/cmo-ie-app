-- Add brief credits tracking to organisations table
ALTER TABLE organisations
ADD COLUMN brief_credits_used INTEGER DEFAULT 0,
ADD COLUMN brief_credits_reset_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '1 month';
