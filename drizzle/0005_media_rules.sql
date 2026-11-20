-- M4: media rules the ORM cannot express (PLAN §6, §8; AGENTS.md image licence allow-list).
-- An approved image must carry a credit, a creator and an allow-listed licence. The same allow-list is
-- checked in code (src/editorial/licences.ts); this is the last line of defence against a hand-edited row.
ALTER TABLE media_assets ADD CONSTRAINT media_assets_approved_attribution CHECK (
  review_state <> 'approved' OR (
    length(btrim(credit)) > 0 AND length(btrim(creator)) > 0
    AND upper(regexp_replace(btrim(license), '[[:space:]_]+', '-', 'g')) ~ '^(CC0(-1\.0)?|PDM(-1\.0)?|PUBLIC-DOMAIN-MARK(-1\.0)?|CC-BY(-SA)?(-[0-9]\.[0-9])?)$'
  ));--> statement-breakpoint
ALTER TABLE media_assets ADD CONSTRAINT media_assets_reviewed_fields CHECK (
  review_state = 'pending' OR reviewed_at IS NOT NULL);--> statement-breakpoint
ALTER TABLE media_assets ADD CONSTRAINT media_assets_dimensions CHECK (width > 0 AND height > 0 AND bytes > 0);--> statement-breakpoint
ALTER TABLE media_assets ADD CONSTRAINT media_assets_source_https CHECK (source_url IS NULL OR source_url ~ '^https://');--> statement-breakpoint
ALTER TABLE media_assets ADD CONSTRAINT media_assets_mime CHECK (mime IN ('image/webp'));--> statement-breakpoint
-- import_records rows are bookkeeping, not history: the importer upserts them. No trigger needed.
CREATE INDEX import_records_species_idx ON import_records (species_id);
