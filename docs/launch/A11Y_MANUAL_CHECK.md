# Manual accessibility check (VoiceOver, 200% zoom, reading order)

**Who runs it:** a person, before launch. About 2–3 hours for everything, or one page group per sitting.
**Why:** automated tools find only part of WCAG 2.2 AA (PLAN §4). They do not judge whether a screen reader announces things sensibly, whether zoomed text stays usable, or whether the reading order makes sense.
**Results:** write them in the tables at the end. **The coding agent never fills these in;** they record only what a person observed.

## Already automated (no need to repeat by hand)
These checks run in `RedList-frontend` with `npm run test:e2e` and in CI:

| Check | Where |
|---|---|
| axe (WCAG 2.0–2.2 A/AA): no serious or critical issues on 18 public pages, desktop and 360 px | `e2e/release.spec.ts` |
| axe on the staff pages after signing in: species list, species, revision editor, media, support directory | `e2e/a11y-extra.spec.ts` |
| One `main` landmark, one `h1`, heading levels in order, all content inside landmarks, a bypass block | `e2e/a11y-extra.spec.ts` |
| No horizontal scrolling at 320 px (= 400% zoom of a 1280 px window) and at 640 px (= 200%) | `e2e/a11y-extra.spec.ts` |
| Keyboard-only core journey; keyboard sign-in to the staff area | `e2e/release.spec.ts`, `e2e/a11y-extra.spec.ts` |

When writing this checklist, the automated staff-page check found one issue, and it was fixed: the scrollable "Reference ids" list in the revision editor could not be reached from the keyboard. It now takes focus and has a label.

## Set-up
1. Start the site:
   - **Real content** (recommended): `npm run dev` in both repos, then open `http://localhost:3000`.
   - **Synthetic only:** run the e2e stack. Note which one you used.
2. Use **Safari** for VoiceOver on macOS; VoiceOver works best with it. Use any browser for the zoom checks.
3. **VoiceOver basics:**
   - `Cmd+F5` turns it on and off. "VO" means `Ctrl+Option`.
   - `VO+→` moves to the next item. `VO+U` opens the rotor (headings, links, landmarks, form controls); use `←`/`→` to switch lists.
   - `Tab` moves between controls. `VO+Space` activates.
4. **Zoom:** in the browser use `Cmd +` until it shows **200%**, with the window at about 1280 px wide. Also try `Cmd +` up to **400%** on the profile page.
5. **Staff pages:** sign in at `/admin` with your own admin account. Do this on a local database, never production.

## A. Checks for every page
Do these on each page in part B, then the page-specific steps.

| # | Check | How | Pass when |
|---|---|---|---|
| A1 | Page title | Listen to what VoiceOver says when the page loads | The title names the page (for example the species name), not only "Wildward" |
| A2 | Skip link | Load the page and press `Tab` once | "Skip to content" appears, is announced, and `Enter` moves focus to the main content |
| A3 | Landmarks | `VO+U` → Landmarks | Banner, navigation, main and content info are listed; "Staff" navigation on staff pages |
| A4 | Headings | `VO+U` → Headings | One level-1 heading; the list reads like a table of contents |
| A5 | Reading order | `VO+→` from the top to the end of the main content | The order matches what you see; nothing is read twice or skipped; decorative images are silent |
| A6 | Focus visible | `Tab` through the page with VoiceOver off | You can always see where focus is; it is never hidden behind a sticky bar |
| A7 | 200% zoom | Zoom to 200% and use the page | No text is cut off or overlaps; no sideways scrolling except the map itself; menus and drawers still open and close |
| A8 | Status is not colour-only | Look at every status badge, and listen | The category is written in words (for example "Endangered"), with year and scope, and announced the same way |
| A9 | Links make sense out of context | `VO+U` → Links | Every link name says where it goes; no bare "here" or "more"; external support links name the organization |

## B. Page by page

### Public pages
| Page | Extra steps | Pass when |
|---|---|---|
| **Home** `/` | Search with VoiceOver: type a name, submit. Listen to the hero photo. | The search field has a spoken label. The photo has alt text and its credit is read. The "in this catalogue" numbers are read with their labels. |
| **Explore** `/species` | Apply a filter, then a second one. Remove a chip. Press Reset. At 200% zoom or a narrow window, open and close the filter drawer. | Each filter control has a label. After filtering, the new result count is announced or easy to find. Chips say what they remove. The drawer traps focus while open and returns it to its button when closed. |
| **Explore, no results** `/species?q=zzzz` | Listen to the empty state | The empty-state message is read, and a way back to all species is offered |
| **Profile** `/species/<slug>` (try one with a photo and population figures, and one with "Unknown") | Use the in-page navigation. Open and close each expandable section. Follow a citation marker `[1]` and come back. | Sections are headings. The open/closed state of each expandable is announced. Population numbers are read with their unit (for example "mature individuals") and year. "Unknown" is read with its explanation. Citation markers are announced as links to the source. |
| **Profile at 400%** | Zoom the same profile to 400% | The content reflows into one column; the sticky in-page navigation does not cover the text you are reading |
| **Compare** `/compare?species=a,b,c` | Read the table with VoiceOver (`VO+→`, or table navigation `VO+Cmd+H`). Then narrow the window to the stacked layout. Remove one species. | Row and column headers are announced with each cell. "Unknown" and "Not directly comparable" are read in words. In the stacked layout each species' block starts with its name. |
| **Map** `/map` | Do not use the map canvas. Go to the results list instead. Change a filter. Press "Near me" and listen. | The list beside the map gives the same information without the canvas. The layer labels ("Country-level presence", "Published range map") are read. "Near me" asks for location only when pressed. **Reading order:** the list and its controls come in a sensible order, and focus is not trapped in the canvas. |
| **Map: legend colours** | Compare the legend swatches with the layers on the map at normal zoom | Each legend entry matches its layer, and the legend names each layer in text |
| **Region** `/regions/<slug>` | Apply a filter. Listen to native/introduced labels. | Presence and origin are words, not only colour |
| **Support** `/support` | Listen to a support link | The organization and destination domain are read; the review criteria are reachable as a heading |
| **About, Methodology, Sources, Privacy, Terms** | Headings and links only | Headings structure the text. Source links name the source. |
| **404** `/no-such-page` | Listen | It says the page was not found and offers a way on |

### Staff pages (`/admin`)
| Page | Extra steps | Pass when |
|---|---|---|
| **Sign-in** | Sign in with VoiceOver on. Then try a wrong password. | Both fields have labels. The error is announced when it appears (role "alert"). |
| **Species list** `/admin` | Create-species form: fill in each field | Every field and option has a label. A form error is announced. |
| **Species** `/admin/species/<id>` | Revision list and "Make this version live again" | Each version link and button says which version it acts on. A confirmation or result is announced. |
| **Revision editor** `/admin/revisions/<id>` | Edit the JSON, save, read the checklist, submit. Tab into "Reference ids" and scroll it with the arrow keys. | The editor field has a label. Save success and errors are announced. The checklist states pass/fail in words. The reference list can be scrolled from the keyboard. |
| **Media** `/admin/media` | Upload form, then approve or reject an image | The file input, credit and licence fields have labels. Approve and reject say which image they act on. The preview image has alt text. |
| **Support directory** `/admin/support` | Add an organization and a link; disable a link | Each button names its target. The disabled state is written in words. |
| **All staff pages at 200%** | Zoom and repeat one action per page | No control is cut off; tables either fit or scroll inside their own box |

## C. Results (fill in by hand)
Tester: ______ · Date: ______ · macOS/iOS version: ______ · Browser and version: ______ · Content: real / synthetic

| Page | A1–A9 (note failures by number) | Page-specific result | Issue found (what you heard or saw) | Severity (blocker / serious / minor) |
|---|---|---|---|---|
| Home | | | | |
| Explore | | | | |
| Explore, no results | | | | |
| Profile (with figures) | | | | |
| Profile (Unknown) | | | | |
| Profile at 400% | | | | |
| Compare (table) | | | | |
| Compare (stacked) | | | | |
| Map | | | | |
| Map legend colours | | | | |
| Region | | | | |
| Support | | | | |
| Info pages | | | | |
| 404 | | | | |
| Staff sign-in | | | | |
| Staff species list | | | | |
| Staff species | | | | |
| Revision editor | | | | |
| Media | | | | |
| Support directory | | | | |
| Staff pages at 200% | | | | |

**After the check:**
- Send the filled-in table to whoever does the fixes.
- Any blocker or serious issue gets fixed. Where possible, its fix comes with an automated check.
- Record the date of the pass in `docs/COMPLETED_TASKS.md`.
