import { asc, eq } from 'drizzle-orm';
import { audit } from '../common/audit';
import { safeFetch, SafeFetchError } from '../common/safe-fetch';
import { Db } from '../db/db.module';
import * as s from '../db/schema';

/**
 * Link checker (PLAN §8): records the HTTP status of every support link and lists failures for review.
 * It NEVER disables a link: a failure can be temporary, and disabling is an audited admin decision (D-018).
 * Status 0 means the request did not complete (network error, timeout, blocked address, bad redirect).
 */

export type StatusProbe = (url: string, method: 'HEAD' | 'GET') => Promise<{ status: number; error?: string }>;

export const probeWithSafeFetch: StatusProbe = async (url, method) => {
  try {
    const r = await safeFetch(url, { method, maxBytes: 256_000, truncate: true, timeoutMs: 15_000, accept: 'text/html,*/*' });
    return { status: r.status };
  } catch (e) {
    return { status: 0, error: e instanceof SafeFetchError ? e.code : 'NETWORK' };
  }
};

export interface LinkCheckResult {
  linkId: string;
  organization: string;
  url: string;
  editorialStatus: string;
  status: number;
  ok: boolean;
  error?: string;
}

/** HEAD first; some servers refuse or mishandle HEAD, so a 4xx/5xx or failure is retried with GET. */
async function check(url: string, probe: StatusProbe) {
  const head = await probe(url, 'HEAD');
  if (head.status >= 200 && head.status < 400) return head;
  return probe(url, 'GET');
}

export async function checkSupportLinks(db: Db, probe: StatusProbe = probeWithSafeFetch, delayMs = 1000): Promise<LinkCheckResult[]> {
  const links = await db
    .select({ id: s.supportLinks.id, url: s.supportLinks.url, editorialStatus: s.supportLinks.editorialStatus, org: s.organizations.name })
    .from(s.supportLinks)
    .innerJoin(s.organizations, eq(s.organizations.id, s.supportLinks.organizationId))
    .orderBy(asc(s.organizations.name), asc(s.supportLinks.url));
  const results: LinkCheckResult[] = [];
  for (const [i, l] of links.entries()) {
    if (i > 0 && delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    const r = await check(l.url, probe);
    const ok = r.status >= 200 && r.status < 400;
    await db.update(s.supportLinks).set({ lastCheckedAt: new Date(), lastStatus: r.status }).where(eq(s.supportLinks.id, l.id));
    results.push({ linkId: l.id, organization: l.org, url: l.url, editorialStatus: l.editorialStatus, status: r.status, ok, ...(r.error ? { error: r.error } : {}) });
  }
  const failed = results.filter((r) => !r.ok).length;
  await audit(db, {
    actorId: null, action: 'links.check', entityType: 'support_link', entityId: null,
    summary: `Checked ${results.length} support link(s): ${failed} failed. No link was disabled.`,
  });
  return results;
}
