# Backlog (not in R1: do not build without explicit approval)

## R2 Return and learn
- Public accounts with verification, reset and deletion; private saved collections
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
- Vector basemap (Protomaps)

## Technical follow-ups
- Upgrade NestJS 11 → 12 in its own task
- Rename `RedList-backent` → `RedList-backend`
- CI pipeline (GitHub Actions) running typecheck, lint, tests against a PostGIS service, and build
