-- =============================================
-- FARM CONNECT — Full Database Sync Migration
-- Run this in phpMyAdmin to fix all missing columns
-- Safe to run multiple times (uses IF NOT EXISTS checks)
-- =============================================

-- =============================================
-- 1. FIX: users TABLE — add missing columns
-- =============================================

-- Add email column
SET @col = 'email';
SET @tbl = 'users';
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE table_schema = DATABASE() AND table_name = @tbl AND column_name = @col) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tbl, ' ADD COLUMN ', @col, ' VARCHAR(100) UNIQUE AFTER full_name')
));
PREPARE q FROM @stmt; EXECUTE q; DEALLOCATE PREPARE q;

-- Add avatar_url column
SET @col = 'avatar_url';
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE table_schema = DATABASE() AND table_name = @tbl AND column_name = @col) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tbl, ' ADD COLUMN ', @col, ' VARCHAR(255) AFTER email')
));
PREPARE q FROM @stmt; EXECUTE q; DEALLOCATE PREPARE q;

-- Add google_id column
SET @col = 'google_id';
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE table_schema = DATABASE() AND table_name = @tbl AND column_name = @col) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tbl, ' ADD COLUMN ', @col, ' VARCHAR(100) UNIQUE AFTER avatar_url')
));
PREPARE q FROM @stmt; EXECUTE q; DEALLOCATE PREPARE q;

-- Add municipality column
SET @col = 'municipality';
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE table_schema = DATABASE() AND table_name = @tbl AND column_name = @col) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tbl, ' ADD COLUMN ', @col, ' VARCHAR(100) AFTER role')
));
PREPARE q FROM @stmt; EXECUTE q; DEALLOCATE PREPARE q;

-- Add two_factor_enabled column
SET @col = 'two_factor_enabled';
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE table_schema = DATABASE() AND table_name = @tbl AND column_name = @col) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tbl, ' ADD COLUMN ', @col, ' BOOLEAN DEFAULT FALSE AFTER is_active')
));
PREPARE q FROM @stmt; EXECUTE q; DEALLOCATE PREPARE q;

-- Add two_factor_secret column
SET @col = 'two_factor_secret';
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE table_schema = DATABASE() AND table_name = @tbl AND column_name = @col) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tbl, ' ADD COLUMN ', @col, ' VARCHAR(32) AFTER two_factor_enabled')
));
PREPARE q FROM @stmt; EXECUTE q; DEALLOCATE PREPARE q;

-- Fix admin municipality if NULL
UPDATE users SET municipality = 'Mabitac' WHERE role = 'admin' AND (municipality IS NULL OR municipality = '');


-- =============================================
-- 2. FIX: beneficiaries TABLE — add ALL missing columns
--    Model expects many columns that don't exist in schema.sql
-- =============================================
SET @tbl = 'beneficiaries';

-- Add rsbsa_id
SET @col = 'rsbsa_id';
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE table_schema = DATABASE() AND table_name = @tbl AND column_name = @col) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tbl, ' ADD COLUMN ', @col, ' VARCHAR(50) UNIQUE AFTER id')
));
PREPARE q FROM @stmt; EXECUTE q; DEALLOCATE PREPARE q;

-- Add sex (model uses VARCHAR, not ENUM)
SET @col = 'sex';
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE table_schema = DATABASE() AND table_name = @tbl AND column_name = @col) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tbl, ' ADD COLUMN ', @col, ' VARCHAR(10) AFTER extension_name')
));
PREPARE q FROM @stmt; EXECUTE q; DEALLOCATE PREPARE q;

-- Add place_of_birth
SET @col = 'place_of_birth';
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE table_schema = DATABASE() AND table_name = @tbl AND column_name = @col) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tbl, ' ADD COLUMN ', @col, ' VARCHAR(200) AFTER date_of_birth')
));
PREPARE q FROM @stmt; EXECUTE q; DEALLOCATE PREPARE q;

-- Add spouse_name
SET @col = 'spouse_name';
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE table_schema = DATABASE() AND table_name = @tbl AND column_name = @col) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tbl, ' ADD COLUMN ', @col, ' VARCHAR(200) AFTER civil_status')
));
PREPARE q FROM @stmt; EXECUTE q; DEALLOCATE PREPARE q;

-- Add address_street
SET @col = 'address_street';
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE table_schema = DATABASE() AND table_name = @tbl AND column_name = @col) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tbl, ' ADD COLUMN ', @col, ' VARCHAR(255) AFTER spouse_name')
));
PREPARE q FROM @stmt; EXECUTE q; DEALLOCATE PREPARE q;

-- Add region
SET @col = 'region';
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE table_schema = DATABASE() AND table_name = @tbl AND column_name = @col) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tbl, ' ADD COLUMN ', @col, ' VARCHAR(100) AFTER province')
));
PREPARE q FROM @stmt; EXECUTE q; DEALLOCATE PREPARE q;

-- Add mobile_number
SET @col = 'mobile_number';
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE table_schema = DATABASE() AND table_name = @tbl AND column_name = @col) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tbl, ' ADD COLUMN ', @col, ' VARCHAR(20) AFTER region')
));
PREPARE q FROM @stmt; EXECUTE q; DEALLOCATE PREPARE q;

-- Add landline
SET @col = 'landline';
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE table_schema = DATABASE() AND table_name = @tbl AND column_name = @col) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tbl, ' ADD COLUMN ', @col, ' VARCHAR(20) AFTER mobile_number')
));
PREPARE q FROM @stmt; EXECUTE q; DEALLOCATE PREPARE q;

-- Add govt_id_type
SET @col = 'govt_id_type';
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE table_schema = DATABASE() AND table_name = @tbl AND column_name = @col) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tbl, ' ADD COLUMN ', @col, ' VARCHAR(50) AFTER landline')
));
PREPARE q FROM @stmt; EXECUTE q; DEALLOCATE PREPARE q;

-- Add govt_id_no
SET @col = 'govt_id_no';
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE table_schema = DATABASE() AND table_name = @tbl AND column_name = @col) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tbl, ' ADD COLUMN ', @col, ' VARCHAR(50) AFTER govt_id_type')
));
PREPARE q FROM @stmt; EXECUTE q; DEALLOCATE PREPARE q;

-- Add is_pwd
SET @col = 'is_pwd';
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE table_schema = DATABASE() AND table_name = @tbl AND column_name = @col) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tbl, ' ADD COLUMN ', @col, ' BOOLEAN DEFAULT FALSE AFTER govt_id_no')
));
PREPARE q FROM @stmt; EXECUTE q; DEALLOCATE PREPARE q;

-- Add is_4ps
SET @col = 'is_4ps';
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE table_schema = DATABASE() AND table_name = @tbl AND column_name = @col) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tbl, ' ADD COLUMN ', @col, ' BOOLEAN DEFAULT FALSE AFTER is_pwd')
));
PREPARE q FROM @stmt; EXECUTE q; DEALLOCATE PREPARE q;

-- Add is_ip
SET @col = 'is_ip';
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE table_schema = DATABASE() AND table_name = @tbl AND column_name = @col) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tbl, ' ADD COLUMN ', @col, ' BOOLEAN DEFAULT FALSE AFTER is_4ps')
));
PREPARE q FROM @stmt; EXECUTE q; DEALLOCATE PREPARE q;

-- Add ip_group
SET @col = 'ip_group';
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE table_schema = DATABASE() AND table_name = @tbl AND column_name = @col) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tbl, ' ADD COLUMN ', @col, ' VARCHAR(100) AFTER is_ip')
));
PREPARE q FROM @stmt; EXECUTE q; DEALLOCATE PREPARE q;

-- Add religion
SET @col = 'religion';
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE table_schema = DATABASE() AND table_name = @tbl AND column_name = @col) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tbl, ' ADD COLUMN ', @col, ' VARCHAR(50) AFTER ip_group')
));
PREPARE q FROM @stmt; EXECUTE q; DEALLOCATE PREPARE q;

-- Add emergency_contact_name
SET @col = 'emergency_contact_name';
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE table_schema = DATABASE() AND table_name = @tbl AND column_name = @col) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tbl, ' ADD COLUMN ', @col, ' VARCHAR(150) AFTER religion')
));
PREPARE q FROM @stmt; EXECUTE q; DEALLOCATE PREPARE q;

-- Add emergency_contact_no
SET @col = 'emergency_contact_no';
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE table_schema = DATABASE() AND table_name = @tbl AND column_name = @col) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tbl, ' ADD COLUMN ', @col, ' VARCHAR(20) AFTER emergency_contact_name')
));
PREPARE q FROM @stmt; EXECUTE q; DEALLOCATE PREPARE q;


-- =============================================
-- 3. FIX: registrations TABLE — add missing columns
--    Model uses form_type, data_json, submission_date, review_date, remarks
-- =============================================
SET @tbl = 'registrations';

-- Add form_type (model uses this instead of registration_type)
SET @col = 'form_type';
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE table_schema = DATABASE() AND table_name = @tbl AND column_name = @col) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tbl, ' ADD COLUMN ', @col, ' VARCHAR(50) AFTER beneficiary_id')
));
PREPARE q FROM @stmt; EXECUTE q; DEALLOCATE PREPARE q;

-- Add submission_date
SET @col = 'submission_date';
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE table_schema = DATABASE() AND table_name = @tbl AND column_name = @col) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tbl, ' ADD COLUMN ', @col, ' DATETIME DEFAULT CURRENT_TIMESTAMP AFTER approved_by')
));
PREPARE q FROM @stmt; EXECUTE q; DEALLOCATE PREPARE q;

-- Add review_date
SET @col = 'review_date';
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE table_schema = DATABASE() AND table_name = @tbl AND column_name = @col) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tbl, ' ADD COLUMN ', @col, ' DATETIME AFTER submission_date')
));
PREPARE q FROM @stmt; EXECUTE q; DEALLOCATE PREPARE q;

-- Add remarks
SET @col = 'remarks';
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE table_schema = DATABASE() AND table_name = @tbl AND column_name = @col) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tbl, ' ADD COLUMN ', @col, ' TEXT AFTER review_date')
));
PREPARE q FROM @stmt; EXECUTE q; DEALLOCATE PREPARE q;

-- Add data_json
SET @col = 'data_json';
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE table_schema = DATABASE() AND table_name = @tbl AND column_name = @col) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tbl, ' ADD COLUMN ', @col, ' TEXT AFTER remarks')
));
PREPARE q FROM @stmt; EXECUTE q; DEALLOCATE PREPARE q;


-- =============================================
-- DONE! All tables should now match the Python models.
-- =============================================
