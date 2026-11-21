# Methodology (public-facing)

This is the text behind the public page **`/methodology`** ("How we source facts", `RedList-frontend/src/app/methodology/page.tsx`). The page is what visitors read. Keep the two in step: change the page, then this file, in the same task. The rules come from PLAN §5 and §8. The current state of each data source is in `DATA_SOURCES.md`.

## Sources and citations
- Each fact is cited to the page or dataset it came from, with that source's own date and the date we read it. All citations are listed on `/sources`.
- Names, identifiers and classification come from the GBIF Backbone Taxonomy (CC BY 4.0). When sources disagree on a name, the profile says so.
- We write summaries in our own words. We do not copy text from sources.
- Some figures are second-hand, for example an IUCN Red List category as recorded on Wikidata. The source note on the profile says so, and these are replaced when someone checks the original.

## Conservation status
- Categories follow the IUCN Red List: Extinct, Extinct in the Wild, Critically Endangered, Endangered, Vulnerable, Near Threatened, Least Concern, Data Deficient and Not Evaluated.
- Each status shows its scope (global or regional) and, when known, the assessment date. A regional status is never shown as the global one.
- Data Deficient and Not Evaluated are not "low risk". They are never grouped with Least Concern.
- A trend is shown only as the source reports it. We never infer a trend by comparing two estimates made with different methods.

## Population figures
- A population figure always keeps its unit: mature individuals, breeding pairs, all individuals, or another stated unit (for example females nesting each year).
- Each figure keeps its place (global or a named country or sea), whether it counts wild or captive animals, its reference year when known, and its uncertainty.
- We never add up overlapping figures, never turn a sighting count into a population, and never show a countdown.
- If no figure has been checked, the page says "Unknown". Unknown is not zero.
- In Compare, figures in different units are labelled "Not directly comparable". There is no overall score and no winner.

## Where species live
- Country and ocean boundaries come from Natural Earth (public domain). Range maps are shown only when a licensed source provides one, and the map labels which kind you are seeing.
- When only countries are known, whole countries are shaded and the map says so. We never draw a range we do not have.
- For species at risk from collection or poaching, locations are shown only at country level or withheld entirely. Precise locations are never stored.

## Photographs
- We use only images under CC0, the Public Domain Mark, CC BY or CC BY-SA. We do not use non-commercial or no-derivatives images.
- We check each licence on the file's source page and against the copyright notice embedded in the file. If the two disagree, we do not use the image.
- Every photo shows its creator and licence. Images are resized and re-encoded, which removes embedded data such as camera details and GPS position.

## Review and corrections
- Every profile is a reviewed version. The page shows its version, the review date and the reviewer's role, and says when an author published their own edit without independent review.
- Earlier versions are kept, and a previous version can be restored. Every change is recorded in an audit log.
- Three dates are kept apart: when the source was published, when we read it, and when we reviewed the profile.

## Where the current catalogue falls short (internal note, not on the page)
As of 2026-11-21 (COMPLETED_TASKS):
- **Status:** cited via Wikidata (second-hand), not read from IUCN (D-027).
- **Population:** some figures come from English Wikipedia (second-hand).
- **Trend:** Unknown everywhere.
- **Habitats, threats and range maps:** empty, because their licences are pending.

The page's rules are all met, because each of these cases is labelled as it is. Before a public launch, a person should replace the second-hand citations with checked primary sources.
