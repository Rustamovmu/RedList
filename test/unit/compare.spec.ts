/** Population comparability (PLAN §4 Compare, §5.1): units are never mixed, unknown is never zero. */
import { comparePopulations } from '../../src/catalogue/compare';
import type { EstimateDto, SpeciesProfileDto } from '../../src/catalogue/dto';

const est = (o: Partial<EstimateDto>): EstimateDto => ({
  scope: 'global', region: null, context: 'wild', basis: 'mature_individuals', form: 'range', pointValue: null, minValue: '10', maxValue: '20',
  qualitativeText: null, referenceStart: null, referenceEnd: null, method: null, uncertaintyNote: null, sourceId: 'x', ...o,
});
const sp = (name: string, estimates: EstimateDto[]) => ({ commonName: name, scientificName: name, population: { estimates, unknown: false, unknownNote: null } }) as unknown as SpeciesProfileDto;

describe('comparePopulations', () => {
  it('same_basis only when every species has a wild global numeric estimate in a shared unit', () => {
    const r = comparePopulations([sp('A', [est({})]), sp('B', [est({ form: 'exact', pointValue: '5', minValue: null, maxValue: null })])]);
    expect(r).toMatchObject({ status: 'same_basis', basis: 'mature_individuals' });
  });

  it('different units are not directly comparable', () => {
    const r = comparePopulations([sp('A', [est({})]), sp('B', [est({ basis: 'breeding_pairs' })])]);
    expect(r.status).toBe('not_directly_comparable');
    expect(r.message).toContain('A: mature individuals; B: breeding pairs');
  });

  it('captive, regional, qualitative and unknown estimates never count as comparable', () => {
    for (const other of [est({ context: 'captive' }), est({ scope: 'regional' }), est({ form: 'qualitative', minValue: null, maxValue: null }), est({ form: 'unknown', minValue: null, maxValue: null })]) {
      const r = comparePopulations([sp('A', [est({})]), sp('B', [other])]);
      expect(r).toMatchObject({ status: 'unknown', basis: null });
      expect(r.message).toContain('for B');
    }
  });

  it('a species with no estimates at all is "unknown", not zero', () => {
    expect(comparePopulations([sp('A', [])]).status).toBe('unknown');
  });

  it('"other" units are never treated as a shared basis', () => {
    expect(comparePopulations([sp('A', [est({ basis: 'other' })]), sp('B', [est({ basis: 'other' })])]).status).toBe('not_directly_comparable');
  });
});
