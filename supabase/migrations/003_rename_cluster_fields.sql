-- Rename state_code to region_code
ALTER TABLE clusters RENAME COLUMN state_code TO region_code;

-- Replace cluster_number (integer) with cluster_code (text) to preserve leading zeros
ALTER TABLE clusters ADD COLUMN cluster_code text;
UPDATE clusters SET cluster_code = LPAD(cluster_number::text, 2, '0') WHERE cluster_number IS NOT NULL;
ALTER TABLE clusters DROP COLUMN cluster_number;
