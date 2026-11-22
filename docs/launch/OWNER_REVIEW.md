# Texts and decisions the owner must approve before launch

**Who:** the owner. **Why:** these texts are published policy or name the people behind the site. The coding agent wrote drafts but cannot approve them. Some questions are legal ones it must not decide (AGENTS.md rule 3).

**How to use this list:**
- Read each text at its path.
- Edit it, or approve it as it is.
- Answer the open questions.
- Tick the box and write the date.

Nothing here has been approved yet.

## 1. Texts to approve
| ✓ | Text | File (frontend repo unless noted) | Drafted | What it commits you to |
|---|---|---|---|---|
| ☐ | **Support review criteria** (D-018) | `src/app/support/page.tsx`, section "How we review a link", plus the intro paragraph | M3, by the agent | That every link is https to the organization's own site, matches the action described, was reviewed by an editor, and is taken down "straight away" when it stops working or fitting. That the review checks the link, not the organization's effectiveness, and makes no tax-deductibility claim. |
| ☐ | **Privacy** (D-028) | `src/app/privacy/page.tsx` | 2026-11-21, by the agent; one line corrected in R1-L (below) | No visitor cookies, analytics or ads. No third-party requests while reading. Compare picks stay in localStorage. "Near me" is resolved in the browser. Short-lived technical logs. What staff data is stored. |
| ☐ | **Terms of use** (D-028) | `src/app/terms/page.tsx` | 2026-11-21, by the agent | "Educational portfolio project, offered as is." No warranty. Photo reuse follows each licence. Data attribution (GBIF CC BY 4.0, Wikidata CC0, Wikipedia CC BY-SA, Natural Earth PD). Links are not endorsements, and a click is not a donation. |
| ☐ | **About** (D-028) | `src/app/about/page.tsx` | 2026-11-21, by the agent | "Personal portfolio project". Not affiliated with IUCN, GBIF, Wikimedia or any listed organization. The list of what the site does not claim. |
| ☐ | **Methodology** (public) | `src/app/methodology/page.tsx`, and backend `docs/METHODOLOGY.md` | M5, by the agent | Sourcing and review rules you promise to follow. Examples: "when sources disagree on a name, the profile says so"; second-hand figures "are replaced when someone checks the original"; locations of sensitive species are never stored precisely. |
| ☐ | **Home page "how we source facts"** | `src/app/page.tsx` | M2, by the agent | The three-line promise on the home page |
| ☐ | **Status-check source note** | backend `src/import/status-check.ts` (`sourceFor`) | R1-L, by the agent | Each hand-checked status will be published with the note: "IUCN Red List, checked by hand on *date* by the site owner. Only the category, the assessment date, the population trend (and the criteria) were recorded; no IUCN text, data or images were copied." Change the wording before the first `--apply` if you want; a later change creates new sources. |

**Privacy correction made in R1-L:** staff sessions also store the browser's user-agent string and the session times, which the draft did not mention. The sentence now says so. The session table also has an `ip_hash` column, but the code never fills it, so the page does not mention it.

## 2. Operator name and contact
| ✓ | Decision | Where it goes | Notes |
|---|---|---|---|
| ☐ | **Operator:** name a person or organization as operator, or stay anonymous as "a personal portfolio project" | About and Terms text | PLAN §4: "Real operator details must be added before launch, with no invented affiliations or certifications." The agent has invented none. Whether a public site needs a named operator depends on where it is run from and who it serves. **That is a legal question for you to settle**, possibly with advice. |
| ☐ | **Contact:** set `NEXT_PUBLIC_CONTACT_URL` | Frontend `.env.local` for development; the web build argument in production (`deploy/.env.prod`, see DEPLOYMENT.md) | Use a project URL or a role address, not a personal one. Without it, About and Privacy show no contact link. Photo creators, sources and organizations then have no way to ask for a correction or removal. |
| ☐ | **Site name "Wildward"** | everywhere | PLAN line 3: check domain and trademark availability before launch. Not checked by the agent. |
| ☐ | **Production origin** `NEXT_PUBLIC_SITE_URL` | `deploy/.env.prod` | Canonical, sitemap and Open Graph URLs point at it (D-028). |

## 3. Open questions
1. **Jurisdiction and privacy law.** The privacy page states facts but names no legal basis, controller or rights process. Whether you need one depends on where you and your visitors are (for example GDPR in the EU/UK). Decide, with advice if needed, before a public launch.
2. **Log retention.** The privacy page promises "short-lived technical logs", but no retention period is set anywhere. Nginx access logs contain client IP addresses (DEPLOYMENT.md), and Docker keeps container logs until rotated. Pick a period (for example 14 days) and configure log rotation to match, or change the wording.
3. **Licence of Wildward's own text.** Overviews are written in our own words, but no page says how others may reuse them (all rights reserved, CC BY, CC BY-SA, …). This is a licensing choice for you.
4. **Corrections and takedown.** Terms give no way to report an error or a photo used wrongly. This needs a contact (section 2) and a sentence saying what happens next.
5. **Support directory content.** The directory is empty locally. Before launch, decide which real organizations to list, and check each against the criteria you approve in section 1. This is also needed for user-testing task 5 (`USER_TASKS.md`).
6. **IUCN terms.** `DATA_SOURCES.md` keeps IUCN as `pending`. The status check records only the category, assessment date, trend and criteria by hand, with a link. Confirm that this use is acceptable to you under the IUCN terms of use (https://www.iucnredlist.org/terms/terms-of-use), which you can read yourself. The agent cannot read them (D-027).
7. **Second-hand population figures from Wikipedia** (batch 1, 13 species) and the 42 species with no country list. Decide whether these may launch as they are (they are cited and labelled) or must be replaced by primary sources first (M5 report, "Remaining issues").
8. **Secret rotation (from M5).** Rotate the local `REVALIDATE_SECRET` whose old value is in the frontend's git history, and never reuse it.
9. **Home hero image (D-041). Launch blocker.** The collage of eight animal faces on the home page (`RedList-frontend/public/hero/wild-faces.webp`) was supplied by you without a source. Its creator and licence are unknown, and the caption says "credit and licence pending". Before a public launch, either find where it came from and confirm an allowed licence (CC0, PDM, CC BY, CC BY-SA, or written permission from the creator), then write the credit into the caption, or replace it.

## Sign-off
Approved by: ______ · Date: ______ · Remaining exceptions: ______
