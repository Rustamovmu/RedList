-- Integrity rules that the ORM schema cannot express.
-- drizzle-kit diffs against its own snapshot, not the live database, so these are never dropped by later migrations.

-- 1. The published revision must belong to the same species (composite FK) and be in state 'published'.
ALTER TABLE species_revisions ADD CONSTRAINT species_revisions_id_species_uq UNIQUE (id, species_id);--> statement-breakpoint
ALTER TABLE species ADD CONSTRAINT species_published_revision_fk
  FOREIGN KEY (published_revision_id, id) REFERENCES species_revisions (id, species_id);--> statement-breakpoint

CREATE FUNCTION check_published_pointer() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.published_revision_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM species_revisions r WHERE r.id = NEW.published_revision_id AND r.state = 'published'
  ) THEN
    RAISE EXCEPTION 'published_revision_id must reference a revision in state published' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER species_published_pointer_chk BEFORE INSERT OR UPDATE OF published_revision_id ON species
  FOR EACH ROW EXECUTE FUNCTION check_published_pointer();--> statement-breakpoint

-- 2. A population estimate's assessment must belong to the same revision.
ALTER TABLE assessments ADD CONSTRAINT assessments_id_revision_uq UNIQUE (id, revision_id);--> statement-breakpoint
ALTER TABLE population_estimates ADD CONSTRAINT population_assessment_same_revision_fk
  FOREIGN KEY (assessment_id, revision_id) REFERENCES assessments (id, revision_id);--> statement-breakpoint

-- 3. Population estimate coherence: nonnegative values, min <= max, the form matches the filled columns, dates ordered, scope matches region.
ALTER TABLE population_estimates ADD CONSTRAINT population_nonnegative CHECK (
  coalesce(point_value, 0) >= 0 AND coalesce(min_value, 0) >= 0 AND coalesce(max_value, 0) >= 0);--> statement-breakpoint
ALTER TABLE population_estimates ADD CONSTRAINT population_form_coherent CHECK (
  CASE form
    WHEN 'exact'       THEN point_value IS NOT NULL AND min_value IS NULL AND max_value IS NULL
    WHEN 'range'       THEN point_value IS NULL AND min_value IS NOT NULL AND max_value IS NOT NULL AND min_value <= max_value
    WHEN 'at_least'    THEN point_value IS NULL AND min_value IS NOT NULL AND max_value IS NULL
    WHEN 'at_most'     THEN point_value IS NULL AND min_value IS NULL AND max_value IS NOT NULL
    WHEN 'qualitative' THEN point_value IS NULL AND min_value IS NULL AND max_value IS NULL AND qualitative_text IS NOT NULL
    WHEN 'unknown'     THEN point_value IS NULL AND min_value IS NULL AND max_value IS NULL
  END);--> statement-breakpoint
ALTER TABLE population_estimates ADD CONSTRAINT population_reference_dates CHECK (
  reference_start IS NULL OR reference_end IS NULL OR reference_start <= reference_end);--> statement-breakpoint
ALTER TABLE population_estimates ADD CONSTRAINT population_scope_region CHECK (
  (scope = 'global' AND region_id IS NULL) OR (scope = 'regional' AND region_id IS NOT NULL));--> statement-breakpoint
ALTER TABLE assessments ADD CONSTRAINT assessments_scope_region CHECK (
  (scope = 'global' AND region_id IS NULL) OR (scope = 'regional' AND region_id IS NOT NULL));--> statement-breakpoint
ALTER TABLE assessments ADD CONSTRAINT assessments_dates CHECK (
  assessed_on IS NULL OR published_on IS NULL OR assessed_on <= published_on);--> statement-breakpoint

-- 4. Simple format rules.
ALTER TABLE species ADD CONSTRAINT species_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');--> statement-breakpoint
ALTER TABLE regions ADD CONSTRAINT regions_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');--> statement-breakpoint
ALTER TABLE organizations ADD CONSTRAINT organizations_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');--> statement-breakpoint
ALTER TABLE organizations ADD CONSTRAINT organizations_https CHECK (website ~ '^https://');--> statement-breakpoint
ALTER TABLE support_links ADD CONSTRAINT support_links_https CHECK (url ~ '^https://');--> statement-breakpoint
ALTER TABLE revision_citations ADD CONSTRAINT revision_citations_section CHECK (section_key IN (
  'overview','classification','status','population','geography','habitat','climate','diet','biology','threats','actions','media'));--> statement-breakpoint
ALTER TABLE species_revisions ADD CONSTRAINT species_revisions_version_positive CHECK (version > 0);--> statement-breakpoint
CREATE UNIQUE INDEX species_names_one_preferred ON species_names (revision_id, language, name_type) WHERE preferred;--> statement-breakpoint

-- 5. Geometry: valid, bounded complexity (SRID 4326 is already enforced by the column type).
ALTER TABLE species_ranges ADD CONSTRAINT species_ranges_geom_valid CHECK (ST_IsValid(geom) AND ST_NPoints(geom) <= 50000);--> statement-breakpoint
ALTER TABLE regions ADD CONSTRAINT regions_geom_valid CHECK (geom IS NULL OR (ST_IsValid(geom) AND ST_NPoints(geom) <= 50000));--> statement-breakpoint

-- 6. Name search (simple config: names are proper nouns in many languages).
CREATE INDEX species_names_fts ON species_names USING gin (to_tsvector('simple', name));--> statement-breakpoint

-- 7. Submitted and published revisions are immutable. Only state, review and publish metadata may change.
CREATE FUNCTION guard_revision_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state IN ('submitted','published','withdrawn') THEN
    IF NEW.editorial IS DISTINCT FROM OLD.editorial
       OR NEW.display_group IS DISTINCT FROM OLD.display_group
       OR NEW.species_id IS DISTINCT FROM OLD.species_id
       OR NEW.version IS DISTINCT FROM OLD.version
       OR NEW.schema_version IS DISTINCT FROM OLD.schema_version
       OR NEW.author_id IS DISTINCT FROM OLD.author_id THEN
      RAISE EXCEPTION 'revision % is % and its content is immutable', OLD.id, OLD.state USING ERRCODE = '23514';
    END IF;
  END IF;
  IF OLD.state = 'published' AND NEW.state <> 'published' THEN
    RAISE EXCEPTION 'a published revision cannot change state' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER species_revisions_guard BEFORE UPDATE ON species_revisions
  FOR EACH ROW EXECUTE FUNCTION guard_revision_update();--> statement-breakpoint

CREATE FUNCTION guard_revision_children() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rev uuid; st revision_state;
BEGIN
  rev := CASE WHEN TG_OP = 'DELETE' THEN OLD.revision_id ELSE NEW.revision_id END;
  SELECT state INTO st FROM species_revisions WHERE id = rev;
  IF st IS NOT NULL AND st <> 'draft' THEN
    RAISE EXCEPTION 'cannot modify % of a % revision', TG_TABLE_NAME, st USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.revision_id IS DISTINCT FROM OLD.revision_id THEN
    RAISE EXCEPTION 'revision_id cannot change' USING ERRCODE = '23514';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['species_names','species_environments','assessments','population_estimates','species_regions',
    'species_ranges','species_habitats','species_threats','revision_citations','revision_media','revision_support_links']
  LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION guard_revision_children()', t || '_guard', t);
  END LOOP;
END $$;--> statement-breakpoint

-- 8. The audit log is append-only.
CREATE FUNCTION audit_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only' USING ERRCODE = '42501';
END $$;--> statement-breakpoint
CREATE TRIGGER audit_events_no_update BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_append_only();
