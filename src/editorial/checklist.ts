import type { Editorial } from './editorial-schema';
import { isAllowedImageLicence } from './licences';

/**
 * `blocking: false` items are advice: they are shown to staff but never stop submit or publish.
 * Everything the plan calls blocking stays blocking (PLAN §7), except where DECISIONS records otherwise.
 */
export type ChecklistItem = { key: string; ok: boolean; blocking: boolean; message: string };

export type ChecklistInput = {
  identifierCount: number;
  editorial: Editorial;
  assessmentCount: number;
  estimateCount: number;
  citationSections: string[];
  regionsWithoutSource: number;
  media: Array<{ license: string; reviewState: string }>;
};

/**
 * Publication checklist (PLAN §7). Blocking items stop submit and publish.
 * Missing ecology (diet, climate) never blocks: the profile shows "Not yet documented".
 * Reviewer attribution is recorded by the publish transaction itself, so it is not a content check.
 * Assessments, estimates and geography rows cannot exist without a source (NOT NULL source_id).
 * The provider identifier is advice only, at the owner's request (DECISIONS D-057).
 */
export function runChecklist(i: ChecklistInput): ChecklistItem[] {
  const cited = new Set(i.citationSections);
  const e = i.editorial;
  const items: ChecklistItem[] = [
    {
      key: 'identifier',
      ok: i.identifierCount > 0,
      blocking: false,
      message: 'At least one provider identifier (for example a GBIF taxon key). Recommended, because it is how an import matches this species again.',
    },
    {
      key: 'overview',
      ok: Boolean(e.overview) && cited.has('overview'),
      blocking: true,
      message: 'An overview with at least one citation',
    },
    {
      key: 'status',
      ok: (i.assessmentCount > 0) !== (e.status?.notAssessed === true),
      blocking: true,
      message: 'Either at least one assessment or an explicit "Not assessed", not both',
    },
    {
      key: 'population',
      ok: (i.estimateCount > 0) !== (e.population?.unknown === true),
      blocking: true,
      message: 'Either population estimates or an explicit "Unknown", not both',
    },
    {
      key: 'numeric-citations',
      ok: (!e.measurements?.length || cited.has('biology')) && (!e.climate?.ranges?.length || cited.has('climate')),
      blocking: true,
      message: 'Every numeric claim is cited (measurements → biology citation, climate ranges → climate citation)',
    },
    {
      key: 'images',
      ok: i.media.every((m) => m.reviewState === 'approved' && isAllowedImageLicence(m.license)),
      blocking: true,
      message: 'Every image is approved and has an allow-listed licence (CC0, PDM, CC BY, CC BY-SA)',
    },
    {
      key: 'geography-sources',
      ok: i.regionsWithoutSource === 0,
      blocking: true,
      message: 'Every geography row (region or range map) has a source',
    },
  ];
  return items;
}

/** Advice (`blocking: false`) never stops the workflow. */
export const checklistPasses = (items: ChecklistItem[]) => items.every((x) => x.ok || !x.blocking);
