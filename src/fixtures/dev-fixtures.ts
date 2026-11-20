/**
 * SYNTHETIC development fixtures (PLAN §7). Every taxon, source, habitat and threat here is invented and
 * labelled as such. Nothing in this file is a scientific fact, and it must never be loaded in production
 * (the CLI refuses when NODE_ENV=production). Real regions are referenced only so the geography UI has data.
 *
 * Coverage required by PLAN §7: unknown population, a regional assessment, a wild/captive split, breeding
 * pairs, multiple estimates, a marine species, a sensitive generalized species, and estimates in different units
 * (Fictus occultus counts all individuals, the others mature individuals) so compare shows "not directly comparable".
 * M3: an antimeridian range polygon (Fictus marinus, near Fiji), a country-generalized species (Fictus generalis,
 * whose deliberately precise test polygon must never be published), and a synthetic support organization whose
 * links point at example.org, a domain reserved for documentation (RFC 2606).
 * All polygons are invented shapes, not real ranges.
 */
import type { Editorial } from '../editorial/editorial-schema';
import type { AssessmentInput, EstimateInput } from '../editorial/dto';

export const FIXTURE_SOURCE_TITLE = 'SYNTHETIC fixture source: invented for development, not a real publication';

export const FIXTURE_HABITATS = [
  { code: 'fx-forest', name: 'Forest (synthetic fixture)' },
  { code: 'fx-wetland', name: 'Wetland (synthetic fixture)' },
  { code: 'fx-open-ocean', name: 'Open ocean (synthetic fixture)' },
];
export const FIXTURE_THREATS = [
  { code: 'fx-habitat-loss', name: 'Habitat loss (synthetic fixture)' },
  { code: 'fx-bycatch', name: 'Bycatch (synthetic fixture)' },
  { code: 'fx-collection', name: 'Collection (synthetic fixture)' },
];

/** SYNTHETIC support directory: example.org is reserved for documentation, so these links can never reach a real organization. */
export const FIXTURE_ORGANIZATION = {
  slug: 'example-conservation-trust-fixture',
  name: 'Example Conservation Trust (fixture)',
  website: 'https://example.org',
  description: 'SYNTHETIC fixture organization for development. It does not exist and has never been reviewed.',
};
export const FIXTURE_LINKS = {
  volunteer: { url: 'https://example.org/fictus-captivus/volunteer', actionType: 'volunteer' as const, description: 'SYNTHETIC fixture link: an example volunteering page. Not real.', status: 'approved' as const },
  oldAppeal: { url: 'https://example.org/fictus-captivus/old-appeal', actionType: 'donate' as const, description: 'SYNTHETIC fixture link: a disabled appeal that must never be shown.', status: 'disabled' as const },
};
export type FixtureLinkKey = keyof typeof FIXTURE_LINKS;

/** The precise test polygon of Fictus generalis. Its coordinates must never appear in any public response. */
export const PRECISE_TEST_POLYGON = {
  type: 'Polygon' as const,
  coordinates: [[[39.123456, 8.654321], [39.223456, 8.654321], [39.223456, 8.754321], [39.123456, 8.754321], [39.123456, 8.654321]]],
};

type Assessment = Omit<AssessmentInput, 'sourceId' | 'regionId'> & { region?: string };
type Estimate = Omit<EstimateInput, 'sourceId' | 'regionId'> & { region?: string };

export type FixtureSpecies = {
  slug: string;
  scientificName: string;
  commonName: string;
  /** Synthetic synonyms, to exercise synonym search. */
  synonyms?: string[];
  displayGroup: 'mammal' | 'bird' | 'reptile' | 'amphibian' | 'fish' | 'insect';
  sensitivity?: 'none' | 'generalize_country' | 'hide_regions';
  environments: Array<'terrestrial' | 'freshwater' | 'marine' | 'brackish'>;
  editorial: Editorial;
  assessments: Assessment[];
  estimates: Estimate[];
  regions: Array<{ slug: string; origin?: 'native' | 'introduced'; seasonality?: 'resident' | 'breeding' | 'non_breeding' }>;
  habitats: string[];
  threats: string[];
  /** Synthetic range polygons (GeoJSON). Longitudes past 180 cross the antimeridian. */
  ranges?: Array<{ seasonality?: 'resident' | 'breeding' | 'non_breeding'; geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown[] } }>;
  supportLinks?: FixtureLinkKey[];
  /** Attach a generated, CC0 test pattern as the primary image (M4), so pages exercise the photo path. */
  photo?: boolean;
};

const NOTE = 'Synthetic fixture text for development. Not a real species.';

export const FIXTURE_SPECIES: FixtureSpecies[] = [
  {
    slug: 'fictus-exemplaris',
    scientificName: 'Fictus exemplaris',
    commonName: 'Example beast (fixture)',
    displayGroup: 'mammal',
    environments: ['terrestrial'],
    editorial: {
      overview: `${NOTE} A medium-sized forest mammal used to exercise an unknown population.`,
      taxonomy: { kingdom: 'Animalia', class: 'Mammalia', genus: 'Fictus' },
      population: { unknown: true, note: 'No estimate exists in the (synthetic) source.' },
      diet: { narrative: `${NOTE} Eats fruit and insects.`, tags: ['frugivore', 'insectivore'], context: 'Juveniles eat mostly insects.' },
      climate: { narrative: `${NOTE} Humid tropical lowlands.` },
      conservationActions: `${NOTE} Protected-area management.`,
    },
    assessments: [{ scope: 'global', category: 'EN', trend: 'decreasing', assessedOn: '2021-06-01', publishedOn: '2021-12-01', criteria: 'A2c' }],
    estimates: [],
    regions: [{ slug: 'kenya' }, { slug: 'tanzania' }],
    habitats: ['fx-forest'],
    threats: ['fx-habitat-loss'],
  },
  {
    slug: 'fictus-regionalis',
    scientificName: 'Fictus regionalis',
    commonName: 'Regional example bird (fixture)',
    synonyms: ['Fictus antiquus'],
    displayGroup: 'bird',
    environments: ['terrestrial', 'freshwater'],
    editorial: {
      overview: `${NOTE} A wetland bird with a global and a regional assessment and several estimates.`,
      measurements: [{ label: 'Wingspan', min: 80, max: 95, unit: 'cm' }],
      biology: `${NOTE} Breeds colonially.`,
    },
    assessments: [
      { scope: 'global', category: 'LC', trend: 'stable', assessedOn: '2020-03-01' },
      { scope: 'regional', region: 'norway', category: 'VU', trend: 'decreasing', assessedOn: '2022-05-01' },
    ],
    estimates: [
      { scope: 'global', context: 'wild', basis: 'mature_individuals', form: 'range', minValue: '20000', maxValue: '49999', referenceStart: '2019-01-01', referenceEnd: '2019-12-31', assessmentIndex: 0, uncertaintyNote: 'Wide range (synthetic).' },
      { scope: 'regional', region: 'norway', context: 'wild', basis: 'breeding_pairs', form: 'at_least', minValue: '350', referenceStart: '2022-01-01', referenceEnd: '2022-12-31', assessmentIndex: 1, method: 'Colony counts (synthetic)' },
    ],
    regions: [{ slug: 'norway', seasonality: 'breeding' }, { slug: 'brazil', seasonality: 'non_breeding' }],
    habitats: ['fx-wetland'],
    threats: ['fx-habitat-loss'],
  },
  {
    slug: 'fictus-captivus',
    scientificName: 'Fictus captivus',
    commonName: 'Captive example lizard (fixture)',
    displayGroup: 'reptile',
    environments: ['terrestrial'],
    editorial: { overview: `${NOTE} A lizard with separate wild and captive estimates.` },
    assessments: [{ scope: 'global', category: 'CR', trend: 'decreasing', assessedOn: '2023-01-15' }],
    estimates: [
      { scope: 'global', context: 'wild', basis: 'mature_individuals', form: 'range', minValue: '50', maxValue: '249', referenceStart: '2022-01-01', referenceEnd: '2022-12-31' },
      { scope: 'global', context: 'captive', basis: 'individuals', form: 'exact', pointValue: '412', referenceStart: '2023-01-01', referenceEnd: '2023-01-01', method: 'Zoo registry count (synthetic)' },
    ],
    regions: [{ slug: 'madagascar' }],
    habitats: ['fx-forest'],
    threats: ['fx-collection'],
    supportLinks: ['volunteer', 'oldAppeal'],
    photo: true,
  },
  {
    slug: 'fictus-marinus',
    scientificName: 'Fictus marinus',
    commonName: 'Example reef fish (fixture)',
    displayGroup: 'fish',
    environments: ['marine'],
    editorial: {
      overview: `${NOTE} A marine fish whose range crosses the antimeridian (Fiji) and spans oceans.`,
      climate: { ranges: [{ label: 'Water temperature', min: 24, max: 29, unit: '°C', context: 'Typical, all seasons (synthetic)' }] },
    },
    assessments: [{ scope: 'global', category: 'DD', trend: 'unknown', assessedOn: '2019-09-01' }],
    estimates: [{ scope: 'global', context: 'wild', basis: 'individuals', form: 'qualitative', qualitativeText: 'Locally common on outer reefs (synthetic)' }],
    regions: [{ slug: 'fiji' }, { slug: 'south-pacific-ocean' }, { slug: 'coral-sea' }],
    habitats: ['fx-open-ocean'],
    threats: ['fx-bycatch'],
    // An invented box across the antimeridian, written as 176…184 and split at ±180 when saved.
    ranges: [{ geometry: { type: 'Polygon', coordinates: [[[176, -20], [184, -20], [184, -15], [176, -15], [176, -20]]] } }],
  },
  {
    slug: 'fictus-generalis',
    scientificName: 'Fictus generalis',
    commonName: 'Generalized example beetle (fixture)',
    displayGroup: 'insect',
    sensitivity: 'generalize_country',
    environments: ['terrestrial'],
    editorial: {
      overview: `${NOTE} A location-sensitive beetle whose range is published only at whole-country level.`,
      population: { unknown: true, note: 'No estimate exists in the (synthetic) source.' },
    },
    assessments: [{ scope: 'global', category: 'NT', trend: 'unknown', assessedOn: '2022-02-01' }],
    estimates: [],
    regions: [{ slug: 'ethiopia' }],
    habitats: [],
    threats: [],
    ranges: [{ geometry: PRECISE_TEST_POLYGON }],
  },
  {
    slug: 'fictus-occultus',
    scientificName: 'Fictus occultus',
    commonName: 'Hidden example frog (fixture)',
    displayGroup: 'amphibian',
    sensitivity: 'hide_regions',
    environments: ['freshwater', 'terrestrial'],
    editorial: {
      overview: `${NOTE} A location-sensitive frog: its regions must never appear publicly.`,
      status: { notAssessed: true },
    },
    assessments: [],
    estimates: [{ scope: 'global', context: 'wild', basis: 'individuals', form: 'at_most', maxValue: '1000', referenceStart: '2021-01-01', referenceEnd: '2021-12-31' }],
    regions: [{ slug: 'peru' }],
    habitats: ['fx-wetland'],
    threats: ['fx-collection'],
  },
];
