-- =============================================
-- Migration 009: Remove Google OAuth Support
-- =============================================
-- Google Sign-In has been removed from the application.
-- Only traditional login is supported (Admin, MAO, Encoder, Verifier).
--
-- Run manually:
--   mysql -u root farm_connect < 009_remove_google_oauth.sql
-- =============================================

-- Drop the google_id column from the users table
ALTER TABLE users DROP COLUMN IF EXISTS google_id;
