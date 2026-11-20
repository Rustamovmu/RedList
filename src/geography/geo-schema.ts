import { z } from 'zod';

/**
 * Input geometry for species ranges (GeoJSON Polygon or MultiPolygon, WGS84 lon/lat).
 * Longitudes may run past ±180 (down to -540, up to 540) so a range that crosses the antimeridian can be
 * written as one shape, for example 176…184. GeoRepository splits it at ±180 before storage (PLAN §6).
 */
export const MAX_RANGE_VERTICES = 50_000; // matches the CHECK species_ranges_geom_valid in drizzle/0002_integrity.sql

const lon = z.number().finite().min(-540).max(540);
const lat = z.number().finite().min(-90).max(90);
const position = z.tuple([lon, lat]);
const ring = z
  .array(position)
  .min(4, 'A ring needs at least 4 positions')
  .refine((r) => r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1], 'A ring must be closed (first position = last)');
const polygon = z.array(ring).min(1).max(1000);

export const RangeGeometry = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Polygon'), coordinates: polygon }).strict(),
  z.object({ type: z.literal('MultiPolygon'), coordinates: z.array(polygon).min(1).max(10_000) }).strict(),
]);
export type RangeGeometry = z.infer<typeof RangeGeometry>;

export function vertexCount(g: RangeGeometry): number {
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  return polys.reduce((n, p) => n + p.reduce((m, r) => m + r.length, 0), 0);
}

/** Returns an error message, or null when the geometry is acceptable input. Never echoes coordinates. */
export function geometryProblem(raw: unknown): string | null {
  const parsed = RangeGeometry.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return `geometry is not a valid GeoJSON Polygon or MultiPolygon (${issue.path.filter((p) => typeof p === 'string').join('.') || 'shape'}: ${issue.message})`;
  }
  if (vertexCount(parsed.data) > MAX_RANGE_VERTICES) return `geometry has more than ${MAX_RANGE_VERTICES} vertices`;
  return null;
}
