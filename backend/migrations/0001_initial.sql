CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    certification VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inspections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    address VARCHAR(500) NOT NULL,
    inspection_type VARCHAR(50) NOT NULL,
    notes TEXT,
    lat DECIMAL(10, 8),
    lon DECIMAL(11, 8),
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    error_message TEXT,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inspection_id UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
    client_photo_id VARCHAR(100) NOT NULL,
    storage_path VARCHAR(500) NOT NULL,
    section_type VARCHAR(50) NOT NULL DEFAULT 'autre',
    photo_order INT NOT NULL,
    lat DECIMAL(10, 8),
    lon DECIMAL(11, 8),
    taken_at TIMESTAMPTZ,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (inspection_id, client_photo_id)
);

CREATE TABLE IF NOT EXISTS anomaly_detections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    photo_id UUID NOT NULL UNIQUE REFERENCES photos(id) ON DELETE CASCADE,
    anomalies JSONB NOT NULL DEFAULT '[]',
    overall_condition VARCHAR(30),
    input_tokens INT,
    output_tokens INT,
    model VARCHAR(100),
    detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed BOOLEAN NOT NULL DEFAULT false
);

CREATE SEQUENCE IF NOT EXISTS report_number_seq START 1;

CREATE TABLE IF NOT EXISTS reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inspection_id UUID NOT NULL UNIQUE REFERENCES inspections(id) ON DELETE CASCADE,
    report_number VARCHAR(50) UNIQUE,
    pdf_path VARCHAR(500),
    synthesis TEXT,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inspections_user_id ON inspections(user_id);
CREATE INDEX IF NOT EXISTS idx_inspections_status_created ON inspections(status, created_at) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_photos_inspection_id ON photos(inspection_id);
CREATE INDEX IF NOT EXISTS idx_anomaly_detections_gin ON anomaly_detections USING GIN (anomalies);
