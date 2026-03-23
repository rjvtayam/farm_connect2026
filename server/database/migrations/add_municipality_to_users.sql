-- Migration: Add municipality column to users table
-- For Laguna municipalities selection

ALTER TABLE users ADD COLUMN municipality VARCHAR(100) AFTER role;
