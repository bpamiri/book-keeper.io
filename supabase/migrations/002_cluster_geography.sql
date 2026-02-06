-- Add structured geographical hierarchy fields to clusters
ALTER TABLE clusters
  ADD COLUMN state_code text,
  ADD COLUMN sub_region_code text,
  ADD COLUMN cluster_number integer;

-- Drop the old free-text region column
ALTER TABLE clusters
  DROP COLUMN region;

-- Once data is backfilled, make fields required:
-- (Run manually after backfill or handle via a follow-up migration)
-- ALTER TABLE clusters ALTER COLUMN state_code SET NOT NULL;
-- ALTER TABLE clusters ALTER COLUMN sub_region_code SET NOT NULL;
-- ALTER TABLE clusters ALTER COLUMN cluster_number SET NOT NULL;
