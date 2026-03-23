-- =============================================
-- Migration: Fix admin user municipality & email
-- Safe to run multiple times (idempotent)
-- =============================================

-- 1. Ensure municipality column exists
SET @dbname = DATABASE();
SET @tablename = 'users';
SET @columnname = 'municipality';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE table_name = @tablename
      AND table_schema = @dbname
      AND column_name = @columnname
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD ', @columnname, ' VARCHAR(100) AFTER role;')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- 2. Ensure email column exists
SET @columnname = 'email';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE table_name = @tablename
      AND table_schema = @dbname
      AND column_name = @columnname
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD ', @columnname, ' VARCHAR(100) UNIQUE AFTER full_name;')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- 3. Ensure avatar_url column exists
SET @columnname = 'avatar_url';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE table_name = @tablename
      AND table_schema = @dbname
      AND column_name = @columnname
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD ', @columnname, ' VARCHAR(255) AFTER email;')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- 4. Fix all admin users with NULL municipality → set to 'Mabitac'
UPDATE users
SET municipality = 'Mabitac'
WHERE role = 'admin' AND (municipality IS NULL OR municipality = '');

-- 5. Optionally set admin email if missing (uses .env value)
-- UPDATE users SET email = 'rickyjhon.tayam@gmail.com' WHERE role = 'admin' AND email IS NULL;
