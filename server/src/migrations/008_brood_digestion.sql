-- Build 7 (#65): larval digestion in the Brood Hall turns Protein into Nectar over time.
-- One running job per colony, stored like build_job. Adding a nullable column is safe on live data.
ALTER TABLE colonies ADD COLUMN IF NOT EXISTS digest_job jsonb;
