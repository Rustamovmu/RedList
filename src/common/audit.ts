import { DbOrTx } from '../db/db.module';
import { auditEvents } from '../db/schema';

/**
 * Append-only audit log (the table rejects UPDATE and DELETE). Summaries must never contain
 * passwords, tokens, emails or coordinates: pass short, fixed descriptions plus ids.
 */
export async function audit(
  db: DbOrTx,
  e: { actorId: string | null; action: string; entityType: string; entityId?: string | null; summary: string },
) {
  await db.insert(auditEvents).values({
    actorId: e.actorId,
    action: e.action,
    entityType: e.entityType,
    entityId: e.entityId ?? null,
    summary: e.summary.slice(0, 500),
  });
}
