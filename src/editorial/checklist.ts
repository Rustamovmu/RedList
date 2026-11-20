import type { Editorial } from './editorial-schema';
import { isAllowedImageLicence } from './licences';

export type ChecklistItem = { key: string; ok: boolean; message: string };

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
 * Publication checklist (PLAN §7). Every item blocks submit and publish.
 * Missing ecology (diet, climate) never blocks: the profile shows "Not yet documented".
 * Reviewer attribution is recorded by the publish transaction itself, so it is not a content check.
 * Assessments, estimates and geography rows cannot exist without a source (NOT NULL source_id).
 */
export function runChecklist(i: ChecklistInput): ChecklistItem[] {
  const cited = new Set(i.citationSections);
  const e = i.editorial;
  const items: ChecklistItem[] = [
    {
      key: 'identifier',
      ok: i.identifierCount > 0,
      message: 'At least one provider identifier (for example a GBIF taxon key)',
    },
    {
      key: 'overview',
      ok: Boolean(e.overview) && cited.has('overview'),
      message: 'An overview with at least one citation',
    },
    {
      key: 'status',
      ok: (i.assessmentCount > 0) !== (e.status?.notAssessed === true),
      message: 'Either at least one assessment or an explicit "Not assessed", not both',
    },
    {
      key: 'population',
      ok: (i.estimateCount > 0) !== (e.population?.unknown === true),
      message: 'Either population estimates or an explicit "Unknown", not both',
    },
    {
      key: 'numeric-citations',
      ok: (!e.measurements?.length || cited.has('biology')) && (!e.climate?.ranges?.length || cited.has('climate')),
      message: 'Every numeric claim is cited (measurements → biology citation, climate ranges → climate citation)',
    },
    {
      key: 'images',
      ok: i.media.every((m) => m.reviewState === 'approved' && isAllowedImageLicence(m.license)),
      message: 'Every image is approved and has an allow-listed licence (CC0, PDM, CC BY, CC BY-SA)',
    },
    {
      key: 'geography-sources',
      ok: i.regionsWithoutSource === 0,
      message: 'Every geography row (region or range map) has a source',
    },
  ];
  return items;
}

export const checklistPasses = (items: ChecklistItem[]) => items.every((x) => x.ok);
