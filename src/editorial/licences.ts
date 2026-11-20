/**
 * Image licence allow-list (AGENTS.md, PLAN §8): CC0, Public Domain Mark, CC BY, CC BY-SA, any version.
 * NC and ND variants are excluded. Anything else needs a recorded decision in docs/DECISIONS.md.
 */
const ALLOWED = [/^CC0(-1\.0)?$/, /^PDM(-1\.0)?$/, /^PUBLIC-DOMAIN-MARK(-1\.0)?$/, /^CC-BY(-SA)?(-\d\.\d)?$/];

export function isAllowedImageLicence(licence: string): boolean {
  const norm = licence.trim().toUpperCase().replace(/[\s_]+/g, '-');
  return ALLOWED.some((r) => r.test(norm));
}
