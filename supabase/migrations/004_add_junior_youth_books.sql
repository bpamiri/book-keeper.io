-- Add junior_youth_text to book_category enum
-- NOTE: ALTER TYPE ... ADD VALUE cannot run inside a transaction,
-- so this must be in its own migration file
ALTER TYPE book_category ADD VALUE 'junior_youth_text';
