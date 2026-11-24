import { CanActivate, createParamDecorator, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { readCookie } from '../common/cookies';
import { cookieNames, loadConfig } from '../config';
import { AccountPrincipal, AccountSessionService } from './account-session.service';
import { assertSameOrigin, safeEqual } from './staff.guard';

export type AccountRequest = Request & { account?: AccountPrincipal };

/** The signed-in visitor. Only valid on routes behind AccountGuard. */
export const CurrentAccount = createParamDecorator((_: unknown, ctx: ExecutionContext): AccountPrincipal => {
  const account = ctx.switchToHttp().getRequest<AccountRequest>().account;
  if (!account) throw new UnauthorizedException('Not signed in');
  return account;
});

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Guards a visitor's own account routes (D-066), the same way StaffGuard guards staff routes:
 * 1. a valid visitor session cookie (401 otherwise; a staff session does not count);
 * 2. on mutations, an allowed Origin and a CSRF token in `x-csrf-token` that matches both the visitor CSRF cookie
 *    and the token bound to the session (403 otherwise).
 */
@Injectable()
export class AccountGuard implements CanActivate {
  constructor(private readonly sessions: AccountSessionService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AccountRequest>();
    const names = cookieNames(loadConfig().COOKIE_SECURE);
    const account = await this.sessions.resolve(readCookie(req, names.account));
    if (!account) throw new UnauthorizedException('Not signed in');

    if (!SAFE_METHODS.has(req.method)) {
      assertSameOrigin(req);
      const header = req.header('x-csrf-token');
      if (!safeEqual(header, readCookie(req, names.accountCsrf)) || !safeEqual(header, account.csrfToken)) {
        throw new ForbiddenException({ code: 'CSRF', message: 'Missing or invalid CSRF token' });
      }
    }
    req.account = account;
    return true;
  }
}
