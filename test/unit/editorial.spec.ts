/** Unit tests: editorial JSONB schema versioning, licence allow-list, checklist and login throttle. No database. */
import { checklistPasses, runChecklist } from '../../src/editorial/checklist';
import { CURRENT_EDITORIAL_VERSION, EditorialSchemaError, parseEditorial } from '../../src/editorial/editorial-schema';
import { isAllowedImageLicence } from '../../src/editorial/licences';
import { LoginThrottle } from '../../src/identity/login-throttle';
import { passwordPolicyError } from '../../src/identity/password';

describe('editorial schema', () => {
  it('accepts valid version-1 content and trims text', () => {
    const e = parseEditorial(1, { overview: '  Hello  ', diet: { tags: ['frugivore'] }, population: { unknown: true } });
    expect(e.overview).toBe('Hello');
  });

  it('rejects unknown keys, empty strings and incoherent ranges', () => {
    expect(() => parseEditorial(1, { overview: 'x', extra: 1 })).toThrow(EditorialSchemaError);
    expect(() => parseEditorial(1, { overview: '   ' })).toThrow(EditorialSchemaError);
    expect(() => parseEditorial(1, { measurements: [{ label: 'Length', min: 5, max: 1, unit: 'cm' }] })).toThrow(EditorialSchemaError);
  });

  it('requires a context for climate ranges (PLAN §5.4)', () => {
    expect(() => parseEditorial(1, { climate: { ranges: [{ label: 'Temp', min: 1, max: 2, unit: '°C' }] } })).toThrow(EditorialSchemaError);
  });

  it('rejects unsupported schema versions instead of guessing', () => {
    expect(() => parseEditorial(0, {})).toThrow(/Unsupported/);
    expect(() => parseEditorial(CURRENT_EDITORIAL_VERSION + 1, {})).toThrow(/Unsupported/);
  });
});

describe('image licence allow-list', () => {
  it.each(['CC0', 'CC0-1.0', 'PDM', 'Public Domain Mark', 'CC BY 4.0', 'CC-BY-SA-3.0', 'cc by-sa'])('allows %s', (l) => {
    expect(isAllowedImageLicence(l)).toBe(true);
  });
  it.each(['CC BY-NC 4.0', 'CC BY-ND 4.0', 'CC BY-NC-SA 4.0', 'All rights reserved', ''])('rejects %s', (l) => {
    expect(isAllowedImageLicence(l)).toBe(false);
  });
});

describe('publication checklist', () => {
  const base = {
    identifierCount: 1,
    editorial: { overview: 'x', population: { unknown: true } },
    assessmentCount: 1,
    estimateCount: 0,
    citationSections: ['overview'],
    regionsWithoutSource: 0,
    media: [],
  };
  it('passes a minimal complete profile; missing diet and climate do not block', () => {
    expect(checklistPasses(runChecklist(base))).toBe(true);
  });
  it('reports a missing provider identifier as advice, which does not block (D-057)', () => {
    const items = runChecklist({ ...base, identifierCount: 0 });
    expect(items.find((i) => i.key === 'identifier')).toMatchObject({ ok: false, blocking: false });
    expect(checklistPasses(items)).toBe(true);
  });
  it('blocks "Unknown" population combined with estimates, and "Not assessed" combined with assessments', () => {
    expect(checklistPasses(runChecklist({ ...base, estimateCount: 1 }))).toBe(false);
    expect(checklistPasses(runChecklist({ ...base, editorial: { ...base.editorial, status: { notAssessed: true } } }))).toBe(false);
  });
  it('blocks uncited measurements', () => {
    expect(checklistPasses(runChecklist({ ...base, editorial: { ...base.editorial, measurements: [{ label: 'L', value: 1, unit: 'cm' }] } }))).toBe(false);
  });
});

describe('password policy', () => {
  it('rejects short and placeholder passwords', () => {
    expect(passwordPolicyError('short')).toMatch(/12/);
    expect(passwordPolicyError('change-me-long-random-string')).toMatch(/placeholder/);
    expect(passwordPolicyError('aaaaaaaaaaaaaaaa')).toMatch(/placeholder/);
    expect(passwordPolicyError('a sensible long passphrase')).toBeNull();
  });
});

describe('login throttle', () => {
  it('blocks an IP after 20 attempts in 15 minutes, then frees it', () => {
    const t = new LoginThrottle();
    const now = 1_000_000;
    for (let i = 0; i < 20; i++) expect(t.check('1.2.3.4', `u${i}@x`, now)).toBe(0);
    expect(t.check('1.2.3.4', 'other@x', now)).toBeGreaterThan(0);
    expect(t.check('5.6.7.8', 'other@x', now)).toBe(0);
    expect(t.check('1.2.3.4', 'other@x', now + 15 * 60_000 + 1)).toBe(0);
  });

  it('locks an email after 5 failures with doubling backoff, and clears on success', () => {
    const t = new LoginThrottle();
    const now = 1_000_000;
    for (let i = 0; i < 4; i++) t.recordFailure('A@x', now);
    expect(t.check('ip1', 'a@x', now)).toBe(0);
    t.recordFailure('a@x', now);
    expect(t.check('ip2', 'a@x', now)).toBe(30);
    t.recordFailure('a@x', now);
    expect(t.check('ip3', 'a@x', now)).toBe(60);
    t.recordSuccess('a@x');
    expect(t.check('ip4', 'a@x', now)).toBe(0);
  });
});
