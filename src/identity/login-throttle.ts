import { Injectable } from '@nestjs/common';

const IP_WINDOW_MS = 15 * 60_000;
const IP_MAX_ATTEMPTS = 20;
const FREE_FAILURES = 5;
const BASE_LOCK_MS = 30_000;
const MAX_LOCK_MS = 15 * 60_000;
const MAX_KEYS = 10_000;

/**
 * Login rate limiting and lockout with backoff (PLAN §9).
 * - Per IP: at most 20 attempts in a sliding 15-minute window.
 * - Per email: after 5 consecutive failures, locked for 30 s, doubling per further failure, capped at 15 min.
 * In memory, because R1 runs one API process and adds no Redis (DECISIONS D-010). A restart clears it.
 */
@Injectable()
export class LoginThrottle {
  private readonly byIp = new Map<string, number[]>();
  private readonly byEmail = new Map<string, { failures: number; lockedUntil: number }>();

  /** Returns seconds to wait, or 0 if the attempt may proceed. Counts the attempt against the IP. */
  check(ip: string, email: string, now = Date.now()): number {
    const recent = (this.byIp.get(ip) ?? []).filter((t) => now - t < IP_WINDOW_MS);
    if (recent.length >= IP_MAX_ATTEMPTS) {
      this.byIp.set(ip, recent);
      return Math.ceil((recent[0] + IP_WINDOW_MS - now) / 1000);
    }
    recent.push(now);
    this.byIp.set(ip, recent);
    this.prune(this.byIp);

    const e = this.byEmail.get(email.toLowerCase());
    if (e && e.lockedUntil > now) return Math.ceil((e.lockedUntil - now) / 1000);
    return 0;
  }

  recordFailure(email: string, now = Date.now()) {
    const key = email.toLowerCase();
    const e = this.byEmail.get(key) ?? { failures: 0, lockedUntil: 0 };
    e.failures += 1;
    if (e.failures >= FREE_FAILURES) {
      e.lockedUntil = now + Math.min(BASE_LOCK_MS * 2 ** (e.failures - FREE_FAILURES), MAX_LOCK_MS);
    }
    this.byEmail.set(key, e);
    this.prune(this.byEmail);
  }

  recordSuccess(email: string) {
    this.byEmail.delete(email.toLowerCase());
  }

  private prune(map: Map<string, unknown>) {
    if (map.size <= MAX_KEYS) return;
    const drop = map.size - MAX_KEYS;
    let i = 0;
    for (const k of map.keys()) {
      if (i++ >= drop) break;
      map.delete(k);
    }
  }
}
