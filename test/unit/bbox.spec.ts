import { BboxError, bboxWidth, envelopes, parseBbox, WORLD } from '../../src/geography/bbox';
import { geometryProblem, MAX_RANGE_VERTICES } from '../../src/geography/geo-schema';

describe('parseBbox', () => {
  it('defaults to the whole world', () => {
    expect(parseBbox(undefined)).toEqual(WORLD);
    expect(parseBbox('')).toEqual(WORLD);
  });

  it('accepts a normal box and a box crossing the antimeridian', () => {
    expect(parseBbox('10,-5,20,5')).toEqual({ west: 10, south: -5, east: 20, north: 5 });
    expect(parseBbox('170,-25,-170,-10')).toEqual({ west: 170, south: -25, east: -170, north: -10 });
  });

  it.each([
    ['three values', '1,2,3'],
    ['five values', '1,2,3,4,5'],
    ['not a number', 'a,2,3,4'],
    ['NaN', 'NaN,0,10,10'],
    ['exponent', '1e2,0,10,10'],
    ['latitude above 90', '0,0,10,91'],
    ['longitude above 180', '0,0,181,10'],
    ['south equals north', '0,10,10,10'],
    ['south above north', '0,20,10,10'],
    ['west equals east', '10,0,10,10'],
  ])('rejects %s', (_, raw) => {
    expect(() => parseBbox(raw)).toThrow(BboxError);
  });
});

describe('envelopes', () => {
  it('splits a box that crosses the antimeridian into two that do not', () => {
    const b = parseBbox('170,-25,-170,-10');
    expect(envelopes(b)).toEqual([
      [170, -25, 180, -10],
      [-180, -25, -170, -10],
    ]);
    expect(bboxWidth(b)).toBe(20);
  });

  it('keeps an ordinary box whole', () => {
    expect(envelopes(parseBbox('-10,-10,10,10'))).toEqual([[-10, -10, 10, 10]]);
    expect(bboxWidth(WORLD)).toBe(360);
  });
});

describe('geometryProblem', () => {
  const square = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] };

  it('accepts a closed polygon, a multipolygon and longitudes past 180 (antimeridian crossing)', () => {
    expect(geometryProblem(square)).toBeNull();
    expect(geometryProblem({ type: 'MultiPolygon', coordinates: [square.coordinates] })).toBeNull();
    expect(geometryProblem({ type: 'Polygon', coordinates: [[[176, 0], [184, 0], [184, 1], [176, 1], [176, 0]]] })).toBeNull();
  });

  it('rejects open rings, bad latitudes, other geometry types, extra keys and too many vertices', () => {
    expect(geometryProblem({ type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1]]] })).toMatch(/at least 4|closed/);
    expect(geometryProblem({ type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 95], [0, 0]]] })).not.toBeNull();
    expect(geometryProblem({ type: 'Point', coordinates: [0, 0] })).not.toBeNull();
    expect(geometryProblem({ ...square, crs: 'x' })).not.toBeNull();
    const ring = Array.from({ length: MAX_RANGE_VERTICES + 1 }, (_, i) => [Math.cos(i) , Math.sin(i)]);
    ring[ring.length - 1] = ring[0];
    expect(geometryProblem({ type: 'Polygon', coordinates: [ring] })).toMatch(/more than/);
  });

  it('never echoes coordinates in its message', () => {
    const msg = geometryProblem({ type: 'Polygon', coordinates: [[[12.345678, 0], [1, 0], [1, 1], [0, 1]]] })!;
    expect(msg).not.toContain('12.345678');
  });
});
