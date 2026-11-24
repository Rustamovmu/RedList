# Admin guide

For the people who edit and publish Wildward content in the staff area at `/admin`. Visitors never need an account. Rules come from PLAN §5 and §7; decisions are named as D-0xx in `DECISIONS.md`.

## Roles
| Role | Can |
|---|---|
| **Editor** | Create species and drafts, edit drafts, add sources, upload images, submit drafts for review, read the support directory, attach approved support links to drafts. |
| **Admin** | Everything an editor can, plus: publish, request changes, roll back, approve or reject images, manage organizations and support links, manage staff accounts. |

There is no self-service sign-up. The first admin is created on the server (`admin:create`, see README or DEPLOYMENT); everyone else is invited from the **Staff** page (D-062).

## Staff accounts (admins)
- **Invite:** on **Staff**, fill in name, email and role. A one-time link appears **once**. The site sends no email, so give the link to the person yourself, through a channel you trust: anyone who opens it can set that account's password. An invite link lasts 7 days.
- **Forgotten password:** press **Password reset link** on that person's row and pass the link on (24 hours). Using it signs them out everywhere else. **New invite link** does the same for someone who never set a password. Making a new link cancels the previous one.
- **Someone leaves, or a laptop is lost:** **Disable** ends their sessions and links at once, and **Enable** lets them back in with their old password. **Sign out everywhere** ends their sessions but keeps their password.
- **Roles:** changing a role applies at once, even to an open session. You cannot change your own role or disable yourself, so the site always keeps an admin. Ask another admin for that.
- **Nobody can sign in** (for example a solo admin who forgot the password): on the server, `./deploy/compose.sh exec api node dist/cli/staff-link.js you@example.org` prints a reset link (DEPLOYMENT).
- **Your own password:** select your name in the staff bar (**Your account**). Changing it signs you out everywhere else.

## Signing in
- Go to `/admin` and sign in with your email and password (at least 12 characters).
- **Sessions:** a session ends after 12 hours without activity, and after 7 days in any case. Sign out from the staff bar when you finish on a shared computer.
- **Throttling:** after 5 wrong passwords in a row, the account is locked for 30 seconds, then for longer with each further failure, up to 15 minutes. One address may try at most 20 times in 15 minutes (D-010). A browser you have signed in with before keeps working during such a lock, so someone else's guesses cannot lock you out (D-061). That browser has its own count, so it locks only itself if it keeps guessing.

## The workflow
```
draft ──submit──▶ in review ──publish (admin)──▶ published (live)
                     └──request changes (admin)──▶ changes requested (closed; continue in a new draft)
```
- **Drafts are private.** Nothing you save shows publicly until an admin publishes it. Public pages read only the published version.
- **One species can have several drafts.** The first one published wins. Publishing another draft that started from the old version is refused with "conflict" (409), so start a new draft from the current version.
- **Two people editing one draft:** a save must start from the latest version of the draft. If someone saved in between, you get "stale draft": reload, then redo your change.
- **Self-review:** if an admin publishes their own draft, the profile says that it was published without independent review. Prefer a second person when one is available.

### Publication checklist
It runs at submit and again at publish. A draft cannot go live until every blocking item passes:
1. An overview with at least one citation.
2. Either at least one status assessment **or** an explicit "Not assessed" (not both).
3. Either population estimates **or** an explicit "Unknown" (not both).
4. Every numeric claim is cited.
5. Every image is approved and has an allow-listed licence.
6. Every geography row (country presence or range map) has a source.

One item is **advice, not a blocker** (D-057): at least one provider identifier, for example a GBIF taxon key.
It is marked "recommended, does not block" in the editor. Fill it in when you know it, because it is how an
import finds the species again later; a profile can go live without it.

## Writing content (PLAN §5)
- **Never invent anything:** no fact, number, source, date or licence. If you cannot check it, leave it out and the page shows "Unknown". Unknown is not zero.
- **Status:** use the IUCN category with its scope (global or regional), and the assessment date when known. Data Deficient and Not Evaluated are not "low risk". Record a trend only if the source states one.
- **Population:** keep the unit exactly as the source gives it (mature individuals, breeding pairs, all individuals, or a stated other unit). Also keep:
  - the place, and whether the figure counts wild or captive animals
  - the reference year and the uncertainty
  - Never add figures together, and never turn a sighting count into a population.
- **Citations:** cite the page or dataset you actually read, with its own date and the date you read it. Write summaries in your own words; do not paste text from sources. A second-hand source (for example Wikidata for an IUCN category) must say so in its note.
- **Sensitive species:** if a species is at risk from collection or poaching, its locations are generalized to whole countries or withheld (D-017). Precise coordinates are never stored. Do not put them in notes either.

### Editing a draft
Most of a draft is edited in a **form** (D-057): the photos, the common names and synonyms, the group and
environments, the overview and classification, the "Not assessed" and "Unknown" switches, the diet and its
tags, the climate and measurement numbers, biology and conservation actions. Change what you need and choose
**Save draft**.
- **Photos:** pick from the approved images. The first photo in the list is the one visitors see on cards and
  at the top of the profile; use "Move up" to change that. Every photo needs alt text, which saving enforces.
- **Still JSON, under "Advanced":** the status assessment, the population estimates, the countries and oceans,
  habitats, threats, citations and support links. Each of those rows needs a source id, so the source picker
  and the reference ID panel below the editor are still how you fill them in (D-011).
- "Apply this JSON to the form" loads what you typed into the form above; nothing is stored until you save.
- If the content does not match the schema, saving fails and the message names the field.
- **Sources:** create one under the source panel, or edit one. Editing a source that a submitted or published version already cites creates a **new** source record, so the published citation never changes underneath you (D-025).

## Images
Go to `/admin/media`.
1. **Upload** a JPEG, PNG or WebP of at most 15 MB. Enter:
   - the creator, the credit line and (optional) the source page URL and licence deed URL
   - the licence: CC0, the Public Domain Mark, CC BY or CC BY-SA only; no NC, no ND, no "all rights reserved"
   - any changes you made
2. **Check before uploading:** the licence on the file's source page must match any copyright notice embedded in the file. If they disagree, do not use the image (METHODOLOGY).
3. **What the server does:** it keeps no original. It re-encodes the upload to WebP at several widths, which removes EXIF and GPS data.
4. **Review (admin):** Approve or Reject. Only approved images can be published. Rejecting an image that is already live removes it from public pages at once, without a new version (D-022).
5. **Edits:** changing an image's credit or licence sends it back to review. Published pages keep the credit and licence they were published with, until a new version is published.

## Rollback (admin)
On `/admin/species/<id>`, choose **"Make this version live again"** on an earlier published version and give a reason.
- The rollback is recorded in the audit log, and the public pages update at once (D-024).
- Drafts started before the rollback can no longer be published over it. Start a new draft.

## Support directory (admin)
Go to `/admin/support`.
- **New records:** organizations and links start as **pending**. Any edit sends them back to pending, so changed text or URLs are reviewed again.
- **What visitors see:** only approved links of approved organizations, on profiles and on `/support`.
- **Disable:** takes effect at once and is audited; re-enabling means approving again (D-018).
- Links must be `https`. Review an organization against the criteria published on `/support`. Those criteria are an agent's draft and need the owner's confirmation before launch.
- A listing is not a certification, and a click is a referral, not a donation. Never state funds raised or rank organizations.

## Server-side tools
Run from the backend folder in development, or inside the API container in production (DEPLOYMENT "Content").

| Task | Development | Production |
|---|---|---|
| Import species content into **drafts** (never publishes) | `npm run import -- file.json --dry-run`, then `--apply` | `node dist/cli/import.js file.json --apply` |
| Overwrite sections edited by hand | add `--reconcile` | same |
| Check every support link (records status, disables nothing) | `npm run links:check` | `node dist/cli/links-check.js` |
| Quality report over everything published | `npm run validate:catalogue` | `node dist/cli/validate-catalogue.js` |

**Imports** (D-023):
- They are idempotent: re-running the same file changes nothing.
- A section someone edited by hand is skipped and listed in the report, unless you pass `--reconcile`.
- Each run writes a report to `import-reports/`.
- Imported images are pending until an admin approves them.

**`validate:catalogue` must pass before a release.** It checks:
- no drafts are reachable publicly
- every live version still passes the checklist
- every numeric claim is cited
- every image is approved, allow-listed and present on disk
- compare never mixes units
- no synthetic fixtures are in production

## Audit
Every publish, request for changes, rollback, image review, support change and link-check run is recorded in `audit_events`, with who did it and when. There is no screen for the audit log yet; read it in the database.
