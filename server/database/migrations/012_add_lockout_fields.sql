-- 012_add_lockout_fields.sql
-- Add columns to users table for account lockout functionality

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS locked_until DATETIME DEFAULT NULL;
