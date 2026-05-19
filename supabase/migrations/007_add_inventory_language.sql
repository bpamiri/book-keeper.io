-- ============================================================
-- Add per-inventory language support
-- ============================================================
-- A book can now exist in multiple languages at the same
-- storage location. The supported languages for the first set
-- are English, Spanish, Farsi, and Chinese.

CREATE TYPE book_language AS ENUM ('English', 'Spanish', 'Farsi', 'Chinese');

-- inventory: language column + composite uniqueness on
-- (storage_location_id, ruhi_book_id, language) so the same book
-- can be stocked in different languages at one location.
ALTER TABLE inventory
  ADD COLUMN language book_language NOT NULL DEFAULT 'English';

ALTER TABLE inventory
  DROP CONSTRAINT inventory_storage_location_id_ruhi_book_id_key;

ALTER TABLE inventory
  ADD CONSTRAINT inventory_location_book_language_key
  UNIQUE (storage_location_id, ruhi_book_id, language);

-- inventory_log: capture the language of each change for the audit trail.
ALTER TABLE inventory_log
  ADD COLUMN language book_language NOT NULL DEFAULT 'English';

-- book_requests: requests target a specific language since inventory
-- is now language-specific. This keeps fulfillment unambiguous.
ALTER TABLE book_requests
  ADD COLUMN language book_language NOT NULL DEFAULT 'English';

-- Replace the inventory-change trigger so the log row carries the
-- language from the row that changed.
CREATE OR REPLACE FUNCTION log_inventory_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO inventory_log (
      cluster_id, storage_location_id, ruhi_book_id, language,
      change_type, quantity_change, previous_quantity, new_quantity,
      performed_by, notes
    ) VALUES (
      NEW.cluster_id, NEW.storage_location_id, NEW.ruhi_book_id, NEW.language,
      'added', NEW.quantity, 0, NEW.quantity,
      NEW.updated_by, 'Initial inventory entry'
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' AND OLD.quantity IS DISTINCT FROM NEW.quantity THEN
    INSERT INTO inventory_log (
      cluster_id, storage_location_id, ruhi_book_id, language,
      change_type, quantity_change, previous_quantity, new_quantity,
      performed_by, notes
    ) VALUES (
      NEW.cluster_id, NEW.storage_location_id, NEW.ruhi_book_id, NEW.language,
      'adjustment', NEW.quantity - OLD.quantity, OLD.quantity, NEW.quantity,
      NEW.updated_by, NEW.notes
    );
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE INDEX idx_inventory_language ON inventory(language);
