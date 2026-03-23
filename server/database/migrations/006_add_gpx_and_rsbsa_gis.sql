-- =============================================
-- MIGRATION: Add GPX file path to registrations
-- For RSBSA GIS upload support
-- Applied: 2026-02-23
-- =============================================

ALTER TABLE registrations
    ADD COLUMN IF NOT EXISTS gpx_file_path VARCHAR(255) NULL COMMENT 'Uploaded GPX track file for GIS mapping';

-- Also fix farm_type enum to match the form values properly
ALTER TABLE farm_parcels
    MODIFY COLUMN farm_type ENUM('Irrigated', 'Rainfed Upland', 'Rainfed Lowland', 'Others') NULL;

-- Add attached_docs JSON column to rsbsa_details for tracking which ownership docs were checked
ALTER TABLE rsbsa_details
    ADD COLUMN IF NOT EXISTS attached_docs JSON NULL COMMENT 'JSON list of ownership document codes checked by applicant',
    ADD COLUMN IF NOT EXISTS farm_types_checked JSON NULL COMMENT 'JSON list of farm type codes checked by applicant';

-- Add GIS data columns directly to rsbsa_details for indexed access
ALTER TABLE rsbsa_details
    ADD COLUMN IF NOT EXISTS gis_latitude DECIMAL(10,6) NULL,
    ADD COLUMN IF NOT EXISTS gis_longitude DECIMAL(10,6) NULL,
    ADD COLUMN IF NOT EXISTS gis_elevation DECIMAL(8,2) NULL,
    ADD COLUMN IF NOT EXISTS gis_source VARCHAR(50) NULL,
    ADD COLUMN IF NOT EXISTS gis_boundary TEXT NULL;
