# Data sources and permissions

Nothing in this file means a permission was granted unless the status says **approved** and links to the evidence. Check each provider's current terms before use. API access is not redistribution permission.

| Field(s) | Provider | Identifier | Access | Licence and terms | Display / store / redistribute | Attribution | Status |
|---|---|---|---|---|---|---|---|
| Country and ocean boundaries | Natural Earth 1:110m | slug, ISO A2 | Bundled files in `data/natural-earth/` | Public domain ([terms](https://www.naturalearthdata.com/about/terms-of-use/)) | Yes / yes / yes | Appreciated, not required | **approved** (public domain) |
| Conservation status, trend, criteria | IUCN Red List | IUCN taxon ID, assessment ID | API v4 needs a registered token | [IUCN terms](https://www.iucnredlist.org/terms/terms-of-use): restrictions on reuse and redistribution | Unknown until terms are reviewed for this site | Required | **pending**. Until resolved, editors summarize by hand with a citation and link. No bulk import. |
| Habitat and threat classification lists | IUCN Classification Schemes | code | Published documents | Must be checked | Unknown | Required | **pending**. Fallback: an in-house list. |
| Population estimates | IUCN assessments, peer-reviewed literature, national surveys | per source | Manual editorial | Facts with citation | Store the summary plus citation | Cite each estimate | per source |
| Taxon identifiers, names | GBIF Backbone Taxonomy | GBIF taxonKey | Public API | Checklist datasets mostly CC0/CC BY ([GBIF terms](https://www.gbif.org/terms)) | Must be checked per dataset | Cite GBIF and the dataset | **pending** |
| Occurrence data | GBIF | — | Public API | Per dataset (CC0, CC BY, CC BY-NC) | Not used in R1. Sightings are never population figures or ranges. | — | not used |
| Species range polygons | IUCN spatial data | — | Download on request | Non-commercial terms. Redistribution restricted. | Unknown | Required | **pending**. Without it, show country-level presence only, labelled as such. |
| Photographs | Wikimedia Commons, iNaturalist | file URL | Manual, per file | Per file. Allow-list: CC0, PDM, CC BY, CC BY-SA | Yes for allow-listed files | Creator, licence, link, modifications | per file |
| Diet, climate, biology | Literature and handbooks | DOI/URL | Manual editorial synthesis | Facts with citation, no copied text | Store our own wording | Cite | per source |

## Unavailable or unconfigured integrations
- IUCN API token: not configured.
- IUCN range maps: not requested.
- Map tiles: none needed in R1 (see DECISIONS D-004).
