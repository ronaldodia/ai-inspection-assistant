ALTER TABLE inspections
    ADD COLUMN IF NOT EXISTS building_type VARCHAR(50),
    ADD COLUMN IF NOT EXISTS year_built INT,
    ADD COLUMN IF NOT EXISTS client_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS weather_conditions VARCHAR(50),
    ADD COLUMN IF NOT EXISTS temperature_celsius INT,
    ADD COLUMN IF NOT EXISTS humidity_percent INT;

CREATE TABLE IF NOT EXISTS inspection_checklist_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inspection_id UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
    system_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'non_inspecte',
    notes TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (inspection_id, system_type)
);

CREATE INDEX IF NOT EXISTS idx_inspection_checklist_items_inspection_id
    ON inspection_checklist_items(inspection_id);
