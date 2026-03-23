-- Run these commands in your SQL Query window (XAMPP/phpMyAdmin)

-- 1. Add email column (for Email Login)
ALTER TABLE users ADD COLUMN email VARCHAR(100) UNIQUE AFTER full_name;

-- 2. Add google_id column (for Google OAuth/Gmail Login)
ALTER TABLE users ADD COLUMN google_id VARCHAR(100) UNIQUE AFTER role;
