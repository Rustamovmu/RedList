# CLAUDE.md

Claude Code loads this file automatically. The project rules live in `AGENTS.md` (imported below), so there is one source of truth.

@AGENTS.md

## Claude Code specifics
- **Before any change, read** `docs/PLAN.md` (the spec), `docs/COMPLETED_TASKS.md` (where things stand) and `docs/ARCHITECTURE.md` (page and endpoint map). The milestone prompts are in `docs/CLAUDE_TASKS.md`.
- **The frontend is a sibling folder**, `../RedList-frontend`. If you cannot read it, ask the user to start the session with `claude --add-dir ../RedList-frontend` (or run `/add-dir ../RedList-frontend`).
- **One milestone per session.** At the end, update `docs/COMPLETED_TASKS.md` and stop. If context runs low, write the CHECKPOINT entry described in AGENTS.md before you stop.
- **Platform:** macOS with zsh/bash and BSD tools (`sed -i ''`, not `sed -i`). The local database is either Docker on port 5433 (`npm run db:up`) or Postgres.app on port 5432 (`npm run db:setup:local`). Check `.env` to see which one is in use, but never print its secret values.
- **Git:** commit only when the user asks. Use the commit message format from AGENTS.md.
