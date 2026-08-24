ALTER TABLE inspections
    ADD COLUMN IF NOT EXISTS floor_count VARCHAR(10),
    ADD COLUMN IF NOT EXISTS area_sqft INT,
    ADD COLUMN IF NOT EXISTS foundation_type VARCHAR(50),
    ADD COLUMN IF NOT EXISTS heating_type VARCHAR(50),
    ADD COLUMN IF NOT EXISTS last_renovation_year INT,
    ADD COLUMN IF NOT EXISTS has_basement VARCHAR(10),
    ADD COLUMN IF NOT EXISTS has_crawlspace VARCHAR(10),
    ADD COLUMN IF NOT EXISTS has_attic VARCHAR(10);

CREATE TABLE IF NOT EXISTS inspection_security_checklist_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inspection_id UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
    item_key VARCHAR(50) NOT NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'na',
    notes TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (inspection_id, item_key)
);

CREATE INDEX IF NOT EXISTS idx_inspection_security_checklist_items_inspection_id
    ON inspection_security_checklist_items(inspection_id);
