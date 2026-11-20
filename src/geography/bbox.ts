/**
 * Map viewport: "west,south,east,north" in decimal degrees (WGS84).
 * west > east means the box crosses the antimeridian (e.g. 170,-25,-170,-10). It is then split into
 * two envelopes, [west, 180] and [-180, east], so no query ever wraps the wrong way round the globe.
 */
export type Bbox = { west: number; south: number; east: number; north: number };
export const WORLD: Bbox = { west: -180, south: -90, east: 180, north: 90 };

export class BboxError extends Error {}

export function parseBbox(raw: string | undefined): Bbox {
  if (raw === undefined || raw === '') return WORLD;
  if (typeof raw !== 'string' || raw.length > 100) throw new BboxError('bbox must be "west,south,east,north"');
  const parts = raw.split(',');
  if (parts.length !== 4 || parts.some((p) => !/^\s*-?\d+(\.\d+)?\s*$/.test(p))) {
    throw new BboxError('bbox must be four decimal numbers: west,south,east,north');
  }
  const [west, south, east, north] = parts.map(Number);
  if ([west, east].some((x) => x < -180 || x > 180)) throw new BboxError('bbox longitudes must be between -180 and 180');
  if ([south, north].some((y) => y < -90 || y > 90)) throw new BboxError('bbox latitudes must be between -90 and 90');
  if (south >= north) throw new BboxError('bbox south must be less than north');
  if (west === east) throw new BboxError('bbox west and east must differ');
  return { west, south, east, north };
}

export const crossesAntimeridian = (b: Bbox) => b.west > b.east;

/** One or two [west, south, east, north] envelopes, none of which crosses ±180. */
export function envelopes(b: Bbox): Array<[number, number, number, number]> {
  return crossesAntimeridian(b)
    ? [
        [b.west, b.south, 180, b.north],
        [-180, b.south, b.east, b.north],
      ]
    : [[b.west, b.south, b.east, b.north]];
}

/** Width in degrees, measured eastward from west to east. */
export const bboxWidth = (b: Bbox) => (crossesAntimeridian(b) ? 360 - b.west + b.east : b.east - b.west);
