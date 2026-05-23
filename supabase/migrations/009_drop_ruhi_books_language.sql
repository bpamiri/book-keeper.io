-- ============================================================
-- Drop ruhi_books.language
--
-- The catalog represents a title; language belongs to inventory
-- (already tracked by inventory.language as book_language enum,
-- with a unique key on (storage_location_id, ruhi_book_id, language)).
-- The catalog-level text field was confusing and unused as a
-- source of truth.
-- ============================================================

ALTER TABLE ruhi_books
  DROP COLUMN language;
