-- =============================================
-- Migration 010: Create Community Members Table
-- =============================================
-- Community members are PUBLIC users who access Farm Connect
-- via email, Facebook, or Google login.
-- They are separate from staff users (admin, MAO, encoder, verifier).
--
-- Run manually in XAMPP phpMyAdmin or CLI:
--   mysql -u root farm_connect < 010_add_community_members.sql
-- =============================================

CREATE TABLE IF NOT EXISTS community_members (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    full_name       VARCHAR(150) NOT NULL,
    email           VARCHAR(150) UNIQUE NOT NULL,
    avatar_url      VARCHAR(500) NULL,

    -- Auth provider tracking
    auth_provider   ENUM('email', 'facebook', 'google') NOT NULL DEFAULT 'email',
    provider_id     VARCHAR(255) NULL,              -- Facebook/Google unique user ID
    password_hash   VARCHAR(255) NULL,              -- Only for email-based sign-up

    -- Profile
    municipality    VARCHAR(100) DEFAULT 'Mabitac',
    barangay        VARCHAR(100) NULL,
    contact_no      VARCHAR(20) NULL,
    bio             TEXT NULL,

    -- Status
    is_active       BOOLEAN DEFAULT TRUE,
    is_verified     BOOLEAN DEFAULT FALSE,          -- Email verified flag
    last_login_at   DATETIME NULL,

    -- Timestamps
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- Prevent duplicate provider accounts
    UNIQUE KEY uq_provider (auth_provider, provider_id)
);

-- Performance indexes
CREATE INDEX idx_cm_email ON community_members(email);
CREATE INDEX idx_cm_provider ON community_members(auth_provider);
CREATE INDEX idx_cm_municipality ON community_members(municipality);
CREATE INDEX idx_cm_active ON community_members(is_active);
