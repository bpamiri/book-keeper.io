-- ============================================================
-- Snapshot publication_status onto inventory (and audit / request rows)
-- ============================================================
-- Before this migration, the inventory list reads publication_status
-- live from the catalog. That means promoting a book from
-- pre-publication to published silently rewrites every existing
-- inventory row's apparent status.
--
-- We denormalize the same way we did with language in migration 007:
-- inventory carries its own publication_status, and the inventory
-- uniqueness key expands so pre-pub and published copies of the same
-- title can coexist at the same location. Audit log + requests get
-- the same column so trails and request semantics line up.

-- inventory
ALTER TABLE inventory
  ADD COLUMN publication_status publication_status;

UPDATE inventory i
SET publication_status = b.publication_status
FROM ruhi_books b
WHERE i.ruhi_book_id = b.id;

ALTER TABLE inventory
  ALTER COLUMN publication_status SET NOT NULL;

ALTER TABLE inventory
  DROP CONSTRAINT inventory_location_book_language_key;

ALTER TABLE inventory
  ADD CONSTRAINT inventory_location_book_language_status_key
  UNIQUE (storage_location_id, ruhi_book_id, language, publication_status);

CREATE INDEX idx_inventory_publication_status ON inventory(publication_status);

-- inventory_log
ALTER TABLE inventory_log
  ADD COLUMN publication_status publication_status;

UPDATE inventory_log l
SET publication_status = b.publication_status
FROM ruhi_books b
WHERE l.ruhi_book_id = b.id;

ALTER TABLE inventory_log
  ALTER COLUMN publication_status SET NOT NULL;

-- book_requests
ALTER TABLE book_requests
  ADD COLUMN publication_status publication_status;

UPDATE book_requests r
SET publication_status = b.publication_status
FROM ruhi_books b
WHERE r.ruhi_book_id = b.id;

ALTER TABLE book_requests
  ALTER COLUMN publication_status SET NOT NULL;

-- Refresh the inventory-change trigger so the audit row carries the
-- publication_status from the row that changed.
CREATE OR REPLACE FUNCTION log_inventory_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO inventory_log (
      cluster_id, storage_location_id, ruhi_book_id, language,
      publication_status,
      change_type, quantity_change, previous_quantity, new_quantity,
      performed_by, notes
    ) VALUES (
      NEW.cluster_id, NEW.storage_location_id, NEW.ruhi_book_id, NEW.language,
      NEW.publication_status,
      'added', NEW.quantity, 0, NEW.quantity,
      NEW.updated_by, 'Initial inventory entry'
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' AND OLD.quantity IS DISTINCT FROM NEW.quantity THEN
    INSERT INTO inventory_log (
      cluster_id, storage_location_id, ruhi_book_id, language,
      publication_status,
      change_type, quantity_change, previous_quantity, new_quantity,
      performed_by, notes
    ) VALUES (
      NEW.cluster_id, NEW.storage_location_id, NEW.ruhi_book_id, NEW.language,
      NEW.publication_status,
      'adjustment', NEW.quantity - OLD.quantity, OLD.quantity, NEW.quantity,
      NEW.updated_by, NEW.notes
    );
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
