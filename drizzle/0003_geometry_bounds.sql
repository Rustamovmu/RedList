-- M3: antimeridian-safe storage as a database rule (PLAN §6 "Constraints").
-- Stored shapes stay inside -180…180 / -90…90. A range that crosses the antimeridian is split at ±180 by
-- GeoRepository before it is stored, so nothing here ever wraps the wrong way round the globe.
ALTER TABLE species_ranges ADD CONSTRAINT species_ranges_geom_bounds CHECK (
  ST_XMin(geom) >= -180 AND ST_XMax(geom) <= 180 AND ST_YMin(geom) >= -90 AND ST_YMax(geom) <= 90);--> statement-breakpoint
ALTER TABLE regions ADD CONSTRAINT regions_geom_bounds CHECK (
  geom IS NULL OR (ST_XMin(geom) >= -180 AND ST_XMax(geom) <= 180 AND ST_YMin(geom) >= -90 AND ST_YMax(geom) <= 90));
