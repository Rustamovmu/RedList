import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { loadConfig } from '../config';

const IP_WINDOW_MS = 15 * 60_000;
const FREE_FAILURES = 5;
const BASE_LOCK_MS = 30_000;
const MAX_LOCK_MS = 15 * 60_000;
const MAX_KEYS = 10_000;

type Lock = { failures: number; lockedUntil: number };

/**
 * Login rate limiting and lockout with backoff (PLAN §9).
 * - Per IP: at most LOGIN_IP_LIMIT (default 20) attempts in a sliding 15-minute window, for everyone.
 * - Per email, for browsers without a valid device cookie: after 5 consecutive failures, locked for 30 s,
 *   doubling per further failure, capped at 15 min.
 * - Per device, for a browser with a valid device cookie of that user (D-061): the same backoff, counted
 *   separately. Such a browser ignores the email lockout, so strangers failing on an email cannot lock its
 *   owner out, and its own failures do not lock the email for anyone else.
 * In memory, because R1 runs one API process and adds no Redis (DECISIONS D-010). A restart clears it.
 */
@Injectable()
export class LoginThrottle {
  private readonly ipMax = loadConfig().LOGIN_IP_LIMIT;
  private readonly byIp = new Map<string, number[]>();
  private readonly byEmail = new Map<string, Lock>();
  private readonly byDevice = new Map<string, Lock>();

  /**
   * Returns seconds to wait, or 0 if the attempt may proceed. Counts the attempt against the IP.
   * `deviceId` is the id of a valid device cookie for this email's user, or null.
   */
  check(ip: string, email: string, deviceId: string | null = null, now = Date.now()): number {
    const ipWait = this.checkIp(ip, now);
    if (ipWait > 0) return ipWait;
    const lock = deviceId ? this.byDevice.get(deviceId) : this.byEmail.get(email.toLowerCase());
    if (lock && lock.lockedUntil > now) return Math.ceil((lock.lockedUntil - now) / 1000);
    return 0;
  }

  /**
   * The per-IP part alone: counts the attempt and returns seconds to wait, or 0. Also used by the one-time link
   * endpoints, which share the same budget as sign-in (PLAN §9: rate limits on login and token endpoints).
   */
  checkIp(ip: string, now = Date.now()): number {
    const recent = (this.byIp.get(ip) ?? []).filter((t) => now - t < IP_WINDOW_MS);
    if (recent.length >= this.ipMax) {
      this.byIp.set(ip, recent);
      return Math.ceil((recent[0] + IP_WINDOW_MS - now) / 1000);
    }
    recent.push(now);
    this.byIp.set(ip, recent);
    prune(this.byIp);
    return 0;
  }

  recordFailure(email: string, deviceId: string | null = null, now = Date.now()) {
    const [map, key] = deviceId ? [this.byDevice, deviceId] : [this.byEmail, email.toLowerCase()];
    const lock = map.get(key) ?? { failures: 0, lockedUntil: 0 };
    lock.failures += 1;
    if (lock.failures >= FREE_FAILURES) {
      lock.lockedUntil = now + Math.min(BASE_LOCK_MS * 2 ** (lock.failures - FREE_FAILURES), MAX_LOCK_MS);
    }
    map.set(key, lock);
    prune(map);
  }

  /**
   * A success from a trusted device clears only that device's count: the email stays locked for strangers.
   * A success without one clears the email's count, as before.
   */
  recordSuccess(email: string, deviceId: string | null = null) {
    if (deviceId) this.byDevice.delete(deviceId);
    else this.byEmail.delete(email.toLowerCase());
  }
}

function prune(map: Map<string, unknown>) {
  if (map.size <= MAX_KEYS) return;
  const drop = map.size - MAX_KEYS;
  let i = 0;
  for (const k of map.keys()) {
    if (i++ >= drop) break;
    map.delete(k);
  }
}

/** Turns a wait from LoginThrottle into a 429 with Retry-After; does nothing when the wait is 0. */
export function throwIfLimited(res: Response, wait: number) {
  if (wait <= 0) return;
  res.setHeader('Retry-After', String(wait));
  throw new HttpException({ code: 'RATE_LIMITED', message: 'Too many attempts. Try again later.' }, HttpStatus.TOO_MANY_REQUESTS);
}
