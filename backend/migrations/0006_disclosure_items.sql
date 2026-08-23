ALTER TABLE inspections
    ADD COLUMN IF NOT EXISTS disclosure_items JSONB NOT NULL DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_inspections_disclosure_items_gin
    ON inspections USING GIN (disclosure_items);
