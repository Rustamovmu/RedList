# Backlog (not in R1: do not build without explicit approval)

## R2 Return and learn
- Public accounts: email verification and password reset by email (needs an email service that costs nothing; none chosen), and private saved collections. Accounts themselves, with sign-up, sign-in, password change and deletion, exist since D-066
- Sign-in limits for shared addresses: a school or office behind one address shares 20 sign-in and sign-up attempts per 15 minutes (`LOGIN_IP_LIMIT`, D-066)
- Articles (Learn section)
- Editorial change summaries ("what changed")
- Scheduled imports: a worker in the same backend codebase with a PostgreSQL-backed queue, staged records, conflict review and checkpoints
- A second language, if content capacity exists

## R3 Support
- Organization review workflow, project updates
- Campaigns, donations and payment events. Sandbox first; live payments only after the operator, provider, jurisdiction and payout are settled
- Integer minor-unit money, verified idempotent webhooks, refunds and disputes

## R4 Expand
- More taxa and regions, licensed exports
- Optional cited AI explanations
- PWA and mobile improvements
- (The self-hosted Protomaps vector basemap was built early, at the owner's request: D-060.)

## Technical follow-ups
- CSV import format for full species content (R1 imports JSON only, D-023; the one CSV is the hand-checked status sheet, D-032)
- S3-compatible `StorageAdapter` (D-022; not built in M5, media is a local volume backed up by scripts/backup.sh)
- Upgrade NestJS 11 → 12 in its own task
- Rename `RedList-backent` → `RedList-backend`
- CSP without `style-src 'unsafe-inline'`: move the map legend swatches to classes and nonce-tag `next/image` styles (D-029)
- More synthetic fixture photos, so the e2e suite renders and checks the home photo strip and globe (D-067, D-064) and the photos on the source cards (D-068). Today the only fixture photo goes to the home cards, so the strip and globe are not drawn in e2e and the source cards have no photos
- Load test the API under concurrent requests and re-measure query plans at a few hundred species (DATABASE.md M5)
- Move the login throttle to PostgreSQL if the API ever runs as more than one process (D-010)
- Two-factor sign-in for staff (TOTP; PLAN only rules out SMS). Needs the owner's decision first (D-062)
- An offline breached-password list (PLAN §9 "if one is available"). It is free to use only if its licence checks out, so it is `pending` until someone verifies the licence (D-010)
