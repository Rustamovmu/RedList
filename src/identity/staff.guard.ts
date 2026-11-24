import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { readCookie } from '../common/cookies';
import { cookieNames, loadConfig } from '../config';
import { SessionService, StaffPrincipal } from './session.service';

export type StaffRequest = Request & { staff?: StaffPrincipal };

/** Exported so the authorization test can list every role-restricted route from the controllers themselves. */
export const ROLES_KEY = 'staffRoles';
/** Restrict a staff route to roles. Without it, any signed-in staff member (editor or admin) may call it. */
export const Roles = (...roles: Array<'editor' | 'admin'>) => SetMetadata(ROLES_KEY, roles);

/** The signed-in staff member. Only valid on routes behind StaffGuard. */
export const CurrentStaff = createParamDecorator((_: unknown, ctx: ExecutionContext): StaffPrincipal => {
  const staff = ctx.switchToHttp().getRequest<StaffRequest>().staff;
  if (!staff) throw new UnauthorizedException('Not signed in');
  return staff;
});

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function safeEqual(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Mutations must come from the web app's origin. Browsers always send Origin on cross-site and
 * same-origin POST/PUT/DELETE, so a missing Origin is treated as a failure.
 */
export function assertSameOrigin(req: Request) {
  const origin = req.header('origin');
  if (!origin || origin !== loadConfig().WEB_ORIGIN) {
    throw new ForbiddenException({ code: 'BAD_ORIGIN', message: 'Request origin is not allowed' });
  }
}

/**
 * Guards every staff route (PLAN §9):
 * 1. a valid, unexpired, unrevoked session cookie (401 otherwise);
 * 2. on mutations, an allowed Origin and a CSRF token in `x-csrf-token` that matches both the CSRF
 *    cookie (double submit) and the token bound to the session (403 otherwise);
 * 3. the role required by @Roles (403 otherwise).
 */
@Injectable()
export class StaffGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<StaffRequest>();
    const names = cookieNames(loadConfig().COOKIE_SECURE);
    const staff = await this.sessions.resolve(readCookie(req, names.session));
    if (!staff) throw new UnauthorizedException('Not signed in');

    if (!SAFE_METHODS.has(req.method)) {
      assertSameOrigin(req);
      const header = req.header('x-csrf-token');
      if (!safeEqual(header, readCookie(req, names.csrf)) || !safeEqual(header, staff.csrfToken)) {
        throw new ForbiddenException({ code: 'CSRF', message: 'Missing or invalid CSRF token' });
      }
    }

    const roles = this.reflector.getAllAndOverride<Array<'editor' | 'admin'> | undefined>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    // An admin can do everything an editor can (PLAN §7).
    if (roles && !roles.includes(staff.role) && staff.role !== 'admin') {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Your role cannot perform this action' });
    }
    req.staff = staff;
    return true;
  }
}
