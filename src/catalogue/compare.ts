import type { PopulationComparisonDto, SpeciesProfileDto } from './dto';

const NUMERIC = new Set(['exact', 'range', 'at_least', 'at_most']);
const BASIS_TEXT: Record<string, string> = {
  mature_individuals: 'mature individuals',
  breeding_pairs: 'breeding pairs',
  individuals: 'individuals (all ages)',
  other: 'another unit',
};

const label = (p: SpeciesProfileDto) => p.commonName ?? p.scientificName;
const list = (xs: string[]) => (xs.length <= 2 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

/**
 * Says whether the species' population figures can be read side by side (PLAN §4 Compare, §5.1).
 * It never adds, divides, ranks or charts values. Only wild, global, numeric estimates count; captive,
 * regional, qualitative and unknown figures are always "not directly comparable" or "unknown".
 */
export function comparePopulations(species: SpeciesProfileDto[]): PopulationComparisonDto {
  const usable = species.map((p) => ({
    p,
    bases: new Set(p.population.estimates.filter((e) => e.context === 'wild' && e.scope === 'global' && NUMERIC.has(e.form)).map((e) => e.basis)),
  }));

  const missing = usable.filter((u) => u.bases.size === 0).map((u) => label(u.p));
  if (missing.length) {
    return {
      status: 'unknown',
      basis: null,
      message: `Not directly comparable: there is no wild, global, numeric estimate for ${list(missing)}.`,
    };
  }

  const shared = [...usable[0].bases].filter((b) => usable.every((u) => u.bases.has(b)) && b !== 'other');
  if (shared.length) {
    const basis = shared.includes('mature_individuals') ? 'mature_individuals' : (shared[0] as PopulationComparisonDto['basis']);
    return {
      status: 'same_basis',
      basis,
      message: `Each species has a wild, global estimate in ${BASIS_TEXT[basis!]}. Reference years and methods can still differ; check each estimate.`,
    };
  }

  const described = usable.map((u) => `${label(u.p)}: ${[...u.bases].map((b) => BASIS_TEXT[b]).join(' or ')}`);
  return {
    status: 'not_directly_comparable',
    basis: null,
    message: `Not directly comparable: the estimates use different units (${described.join('; ')}).`,
  };
}
