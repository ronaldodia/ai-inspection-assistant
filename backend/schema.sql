-- Schéma de référence pour une base neuve (appliqué automatiquement par Postgres
-- via docker-entrypoint-initdb.d, docker-compose comme k8s, seulement si le volume
-- de données est vide). Pour toute base déjà existante — et pour tout changement de
-- schéma futur — ajouter un fichier numéroté dans backend/migrations/ : il sera
-- appliqué automatiquement au démarrage du backend (voir app/migrate.py). Garder ce
-- fichier synchronisé avec backend/migrations/ pour que les nouvelles bases partent
-- directement avec le schéma à jour.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    certification VARCHAR(100),
    role VARCHAR(20) NOT NULL DEFAULT 'inspector',
    is_active BOOLEAN NOT NULL DEFAULT true,
    -- NULL = utilise la limite globale par défaut (voir app.config.Settings)
    max_inspections INT,
    max_photos_per_inspection INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE inspections (
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

CREATE TABLE photos (
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

CREATE TABLE anomaly_detections (
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

CREATE SEQUENCE report_number_seq START 1;

CREATE TABLE reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inspection_id UUID NOT NULL UNIQUE REFERENCES inspections(id) ON DELETE CASCADE,
    report_number VARCHAR(50) UNIQUE,
    pdf_path VARCHAR(500),
    synthesis TEXT,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE knowledge_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL UNIQUE,
    source VARCHAR(50) NOT NULL,
    source_url VARCHAR(500),
    license_note TEXT,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE knowledge_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    reference VARCHAR(100),
    embedding VECTOR(1024) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_inspections_user_id ON inspections(user_id);
CREATE INDEX idx_inspections_status_created ON inspections(status, created_at) WHERE archived_at IS NULL;
CREATE INDEX idx_photos_inspection_id ON photos(inspection_id);
CREATE INDEX idx_anomaly_detections_gin ON anomaly_detections USING GIN (anomalies);
CREATE INDEX idx_knowledge_chunks_document_id ON knowledge_chunks(document_id);
CREATE INDEX idx_knowledge_chunks_embedding ON knowledge_chunks USING hnsw (embedding vector_cosine_ops);
