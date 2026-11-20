import { Injectable, Logger } from '@nestjs/common';
import { loadConfig } from '../config';

const TIMEOUT_MS = 3000;

/**
 * Tells the web app to drop cached pages after a publication change (PLAN §3 "Caching").
 * A failure never undoes a publish: it is logged (without the secret) and the page updates on the next revalidation.
 */
@Injectable()
export class RevalidationService {
  private readonly logger = new Logger('Revalidation');

  async revalidate(tags: string[]): Promise<boolean> {
    const { WEB_REVALIDATE_URL, REVALIDATE_SECRET } = loadConfig();
    if (!WEB_REVALIDATE_URL || !REVALIDATE_SECRET) {
      this.logger.warn('WEB_REVALIDATE_URL or REVALIDATE_SECRET not set; skipping revalidation');
      return false;
    }
    try {
      const res = await fetch(WEB_REVALIDATE_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-revalidate-secret': REVALIDATE_SECRET },
        body: JSON.stringify({ tags }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) this.logger.warn(`revalidation returned HTTP ${res.status} for ${tags.join(',')}`);
      return res.ok;
    } catch (e) {
      this.logger.warn(`revalidation failed for ${tags.join(',')}: ${e instanceof Error ? e.name : 'error'}`);
      return false;
    }
  }
}
