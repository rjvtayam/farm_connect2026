-- =============================================
-- Migration 011: Add Last Activity Tracking
-- =============================================
-- Adds last_activity column to both staff users and community members
-- for real-time online status tracking.
--
-- Run manually in XAMPP phpMyAdmin or CLI:
--   mysql -u root farm_connect < 011_add_last_activity.sql
-- =============================================

ALTER TABLE users ADD COLUMN last_activity DATETIME DEFAULT NULL;
ALTER TABLE community_members ADD COLUMN last_activity DATETIME DEFAULT NULL;
