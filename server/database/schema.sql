-- =============================================
-- FARM CONNECT DATABASE SCHEMA (PostgreSQL)
-- Mabitac, Laguna
-- =============================================

-- =============================================
-- 1. USERS TABLE (Admin, MAO, Encoder, Verifier)
-- =============================================
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(100) UNIQUE,
    avatar_url VARCHAR(255),
    google_id VARCHAR(100) UNIQUE,
    role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'mao', 'encoder', 'verifier')),
    municipality VARCHAR(100),
    contact_no VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    two_factor_enabled BOOLEAN DEFAULT FALSE,
    two_factor_secret VARCHAR(32),
    last_activity TIMESTAMP DEFAULT NULL,
    failed_login_attempts INT DEFAULT 0,
    locked_until TIMESTAMP
);

-- =============================================
-- 2. BENEFICIARIES TABLE (Unique persons – core personal data)
-- =============================================
CREATE TABLE IF NOT EXISTS beneficiaries (
    id SERIAL PRIMARY KEY,
    beneficiary_id VARCHAR(50) UNIQUE,                  -- Optional: auto-generated unique ID (e.g., RSBSA-style)

    -- Personal info (from all forms)
    salutation VARCHAR(10) NULL CHECK (salutation IN ('Mr', 'Ms', 'Mrs')),
    last_name VARCHAR(100) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100),
    extension_name VARCHAR(20),                         -- Jr, III, etc.
    barangay VARCHAR(100) NOT NULL,
    municipality VARCHAR(100) DEFAULT 'Mabitac',
    province VARCHAR(100) DEFAULT 'Laguna',
    street_sitio_purok VARCHAR(255),
    contact_no VARCHAR(20),
    date_of_birth DATE,
    place_of_birth VARCHAR(150),
    gender VARCHAR(20) NOT NULL CHECK (gender IN ('Male', 'Female')),
    civil_status VARCHAR(50) NOT NULL CHECK (civil_status IN ('Single', 'Married', 'Legally Separated', 'Widowed')),
    nationality VARCHAR(50) DEFAULT 'Filipino',

    -- Photo (mandatory)
    photo_path VARCHAR(255),

    -- Additional common fields
    educational_attainment VARCHAR(100) CHECK (educational_attainment IN ('Elementary', 'High School', 'Vocational', 'College', 'Post-Graduate', 'Others')),
    education_others VARCHAR(100),
    num_children INT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- 3. REGISTRATIONS TABLE (One per program enrollment)
-- =============================================
CREATE TABLE IF NOT EXISTS registrations (
    id SERIAL PRIMARY KEY,
    beneficiary_id INT REFERENCES beneficiaries(id) ON DELETE CASCADE,
    registration_type VARCHAR(50) NOT NULL CHECK (registration_type IN ('fishr', 'boatr', 'rsbsa', 'ncfrs')),
    reference_no VARCHAR(50) UNIQUE,
    registration_date DATE NOT NULL,
    is_renewal BOOLEAN DEFAULT FALSE,

    -- Workflow
    status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'pending_verification', 'verified', 'approved', 'rejected')),
    encoded_by INT REFERENCES users(id),
    verified_by INT REFERENCES users(id),
    approved_by INT REFERENCES users(id),
    encoded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    verified_at TIMESTAMP NULL,
    approved_at TIMESTAMP NULL,

    -- Geo data (for land-based programs)
    geo_data JSONB NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- 4. DOCUMENTS TABLE (Multiple uploads per registration)
-- =============================================
CREATE TABLE IF NOT EXISTS registration_documents (
    id SERIAL PRIMARY KEY,
    registration_id INT REFERENCES registrations(id) ON DELETE CASCADE,
    doc_type VARCHAR(100) NOT NULL,
    file_path VARCHAR(255) NOT NULL,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- 5. FISHR SPECIFIC
-- =============================================
CREATE TABLE IF NOT EXISTS fishr_details (
    registration_id INT PRIMARY KEY REFERENCES registrations(id) ON DELETE CASCADE,
    age INT,
    resident_since INTEGER,

    -- Emergency contact
    emergency_first_name VARCHAR(100),
    emergency_last_name VARCHAR(100),
    emergency_relationship VARCHAR(100),
    emergency_contact_no VARCHAR(20),
    emergency_barangay VARCHAR(100),
    emergency_municipality VARCHAR(100),
    emergency_province VARCHAR(100),

    -- Livelihood
    main_income_source VARCHAR(100) CHECK (main_income_source IN ('Capture Fishing', 'Aquaculture', 'Fish Vending', 'Gleaning', 'Fish Processing', 'Others')),
    main_income_specify VARCHAR(255),
    other_income_source VARCHAR(100) CHECK (other_income_source IN ('Capture Fishing', 'Aquaculture', 'Fish Vending', 'Gleaning', 'Fish Processing', 'Others', 'None')),
    other_income_specify VARCHAR(255),

    -- Organization
    organization_name VARCHAR(150),
    member_since INTEGER,
    position VARCHAR(100)
);

-- =============================================
-- 6. BOATR SPECIFIC
-- =============================================
CREATE TABLE IF NOT EXISTS boatr_details (
    registration_id INT PRIMARY KEY REFERENCES registrations(id) ON DELETE CASCADE,
    mfvr_no VARCHAR(50),
    type_of_registration VARCHAR(100) CHECK (type_of_registration IN ('Initial', 'New CN', 'Re-issuance CN')),
    homeport VARCHAR(100),
    vessel_name VARCHAR(150),
    vessel_type VARCHAR(100) CHECK (vessel_type IN ('Non-motorized', 'Motorized', 'Others')),
    vessel_type_other VARCHAR(100),
    place_built VARCHAR(100),
    year_built INTEGER,
    material VARCHAR(100) CHECK (material IN ('Wood', 'Fiberglass', 'Composite')),
    registered_length DECIMAL(8,2),
    registered_breadth DECIMAL(8,2),
    registered_depth DECIMAL(8,2),
    tonnage_length DECIMAL(8,2),
    tonnage_breadth DECIMAL(8,2),
    tonnage_depth DECIMAL(8,2),
    gross_tonnage DECIMAL(10,2),
    net_tonnage DECIMAL(10,2),
    engine_make VARCHAR(100),
    engine_serial VARCHAR(100),
    horsepower DECIMAL(8,2),
    gears JSONB NULL
);

-- =============================================
-- 7. RSBSA & NCFRS SHARED: Parcels
-- =============================================
CREATE TABLE IF NOT EXISTS farm_parcels (
    id SERIAL PRIMARY KEY,
    registration_id INT REFERENCES registrations(id) ON DELETE CASCADE,
    parcel_no INT,
    location_description TEXT,
    area_hectares DECIMAL(10,4),
    ownership_type VARCHAR(100) CHECK (ownership_type IN ('Owner', 'Tenant', 'Lessee', 'Others')),
    ownership_doc_type VARCHAR(100),
    commodity VARCHAR(100),
    farm_type VARCHAR(100) CHECK (farm_type IN ('Irrigated', 'Rainfed', 'Upland', 'Others')),
    geo_coordinates JSONB NULL
);

-- =============================================
-- 8. RSBSA SPECIFIC
-- =============================================
CREATE TABLE IF NOT EXISTS rsbsa_details (
    registration_id INT PRIMARY KEY REFERENCES registrations(id) ON DELETE CASCADE,
    is_pwd BOOLEAN DEFAULT FALSE,
    is_4ps_beneficiary BOOLEAN DEFAULT FALSE,
    is_ip BOOLEAN DEFAULT FALSE,
    ip_specify VARCHAR(100),
    with_government_id BOOLEAN DEFAULT FALSE,
    id_type VARCHAR(100),
    id_number VARCHAR(50),
    household_head BOOLEAN DEFAULT FALSE,
    mothers_maiden_name VARCHAR(150),
    spouse_name VARCHAR(150),
    gross_annual_income_farming DECIMAL(12,2),
    gross_annual_income_non_farming DECIMAL(12,2),
    main_livelihood JSONB NOT NULL
);

-- =============================================
-- 9. NCFRS SPECIFIC
-- =============================================
CREATE TABLE IF NOT EXISTS ncfrs_details (
    registration_id INT PRIMARY KEY REFERENCES registrations(id) ON DELETE CASCADE,
    household_head BOOLEAN,
    head_relationship VARCHAR(100),
    spouse_last_name VARCHAR(100),
    spouse_first_name VARCHAR(100),
    spouse_middle_name VARCHAR(100),
    spouse_extension VARCHAR(20),
    interventions JSONB,
    membership_type VARCHAR(100) CHECK (membership_type IN ('Cooperative', 'Farmers Assoc', 'Others')),
    membership_name VARCHAR(150),
    is_pwd BOOLEAN DEFAULT FALSE,
    is_ip BOOLEAN DEFAULT FALSE,
    ip_specify VARCHAR(100),
    current_occupation VARCHAR(150),
    years_in_occupation INT,
    monthly_income DECIMAL(12,2)
);

CREATE TABLE IF NOT EXISTS ncfrs_children (
    id SERIAL PRIMARY KEY,
    registration_id INT REFERENCES registrations(id) ON DELETE CASCADE,
    line_no INT,
    last_name VARCHAR(100),
    first_name VARCHAR(100),
    middle_name VARCHAR(100),
    extension VARCHAR(20),
    sex VARCHAR(1) CHECK (sex IN ('M', 'F')),
    date_of_birth DATE,
    works_on_farm BOOLEAN,
    child_status VARCHAR(100) CHECK (child_status IN ('In School', 'Out of School', 'Working', 'Others'))
);

-- =============================================
-- 10. AUDIT LOGS
-- =============================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    registration_id INT REFERENCES registrations(id),
    beneficiary_id INT REFERENCES beneficiaries(id),
    user_id INT REFERENCES users(id),
    action VARCHAR(255) NOT NULL,
    details TEXT,
    ip_address VARCHAR(50),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- 11. NFC CARDS TABLE (For offline authentication)
-- =============================================
CREATE TABLE IF NOT EXISTS nfc_cards (
    id SERIAL PRIMARY KEY,
    card_uid VARCHAR(50) UNIQUE NOT NULL,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    last_used_at TIMESTAMP NULL
);

-- =============================================
-- 12. OFFLINE QUEUE (For syncing offline submissions)
-- =============================================
CREATE TABLE IF NOT EXISTS offline_queue (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    action_type VARCHAR(20) NOT NULL CHECK (action_type IN ('create', 'update', 'delete')),
    entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN ('registration', 'beneficiary', 'document')),
    payload JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    synced_at TIMESTAMP NULL,
    is_synced BOOLEAN DEFAULT FALSE
);

-- =============================================
-- 13. NOTIFICATIONS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message VARCHAR(500) NOT NULL,
    type VARCHAR(50) DEFAULT 'info',
    reference_id INT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- COMMUNITY SOCIAL FEED & MEMBERS
-- =============================================
CREATE TABLE IF NOT EXISTS community_members (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    avatar_url VARCHAR(500),
    auth_provider VARCHAR(50) NOT NULL DEFAULT 'email' CHECK (auth_provider IN ('email', 'facebook', 'google')),
    provider_id VARCHAR(255),
    password_hash VARCHAR(255),
    municipality VARCHAR(100) DEFAULT 'Mabitac',
    barangay VARCHAR(100),
    contact_no VARCHAR(20),
    bio TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    is_verified BOOLEAN DEFAULT FALSE,
    last_login_at TIMESTAMP,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS community_posts (
    id SERIAL PRIMARY KEY,
    user_id INT NULL REFERENCES users(id) ON DELETE SET NULL,
    author_name VARCHAR(100) NOT NULL DEFAULT 'Community Member',
    author_avatar VARCHAR(500) NULL,
    content TEXT NOT NULL,
    image_url VARCHAR(500) NULL,
    topic VARCHAR(50) NULL,
    is_pinned BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS post_reactions (
    id SERIAL PRIMARY KEY,
    post_id INT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL DEFAULT 'like',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS post_comments (
    id SERIAL PRIMARY KEY,
    post_id INT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
    user_id INT NULL REFERENCES users(id) ON DELETE SET NULL,
    author_name VARCHAR(100) NOT NULL DEFAULT 'Community Member',
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- INDEXES FOR PERFORMANCE
-- =============================================
CREATE INDEX IF NOT EXISTS idx_beneficiaries_name ON beneficiaries(last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_beneficiaries_barangay ON beneficiaries(barangay);
CREATE INDEX IF NOT EXISTS idx_registrations_status ON registrations(status);
CREATE INDEX IF NOT EXISTS idx_registrations_type ON registrations(registration_type);
CREATE INDEX IF NOT EXISTS idx_registrations_encoded_by ON registrations(encoded_by);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_nfc_cards_uid ON nfc_cards(card_uid);
CREATE INDEX IF NOT EXISTS idx_offline_queue_synced ON offline_queue(is_synced);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_community_posts_user ON community_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_community_posts_pinned ON community_posts(is_pinned, created_at);
CREATE INDEX IF NOT EXISTS idx_post_reactions_post ON post_reactions(post_id);
CREATE INDEX IF NOT EXISTS idx_post_comments_post ON post_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read);
