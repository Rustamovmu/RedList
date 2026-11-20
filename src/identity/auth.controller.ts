import { Body, Controller, Get, HttpCode, HttpException, HttpStatus, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength } from 'class-validator';
import { eq, sql } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { audit } from '../common/audit';
import { clearCookie, setCookie } from '../common/cookies';
import { cookieNames, loadConfig } from '../config';
import { Db, InjectDb } from '../db/db.module';
import { staffUsers } from '../db/schema';
import { LoginThrottle } from './login-throttle';
import { verifyPassword } from './password';
import { SESSION_ABSOLUTE_MS, SessionService, StaffPrincipal } from './session.service';
import { assertSameOrigin, CurrentStaff, StaffGuard } from './staff.guard';

class LoginDto {
  @ApiProperty() @IsEmail() @MaxLength(254) email!: string;
  @ApiProperty() @IsString() @MaxLength(256) password!: string;
}

export class StaffMeDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ enum: ['editor', 'admin'] }) role!: 'editor' | 'admin';
}

class SessionDto {
  @ApiProperty({ type: StaffMeDto }) user!: StaffMeDto;
  @ApiProperty({ description: 'Send this back in the x-csrf-token header on every mutation. It is also set as a readable cookie.' })
  csrfToken!: string;
}

class OkDto {
  @ApiProperty({ example: true }) ok!: true;
}

const me = (s: Pick<StaffPrincipal, 'id' | 'name' | 'email' | 'role'>): StaffMeDto => ({ id: s.id, name: s.name, email: s.email, role: s.role });

@ApiTags('staff-auth')
@Controller('staff/auth')
export class AuthController {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly sessions: SessionService,
    private readonly throttle: LoginThrottle,
  ) {}

  /** Sign in. Rate limited per IP and locked out with backoff per email after repeated failures. */
  @Post('login')
  @HttpCode(200)
  @ApiOkResponse({ type: SessionDto })
  async login(@Body() body: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<SessionDto> {
    assertSameOrigin(req); // login CSRF
    const wait = this.throttle.check(req.ip ?? 'unknown', body.email);
    if (wait > 0) {
      res.setHeader('Retry-After', String(wait));
      throw new HttpException({ code: 'RATE_LIMITED', message: 'Too many sign-in attempts. Try again later.' }, HttpStatus.TOO_MANY_REQUESTS);
    }

    const [user] = await this.db
      .select()
      .from(staffUsers)
      .where(eq(sql`lower(${staffUsers.email})`, body.email.toLowerCase()))
      .limit(1);
    const ok = await verifyPassword(user && !user.disabledAt ? user.passwordHash : null, body.password);
    if (!ok || !user) {
      this.throttle.recordFailure(body.email);
      throw new UnauthorizedException('Email or password is incorrect');
    }
    this.throttle.recordSuccess(body.email);

    const { token, csrfToken } = await this.sessions.create(user.id, req.header('user-agent'));
    const { COOKIE_SECURE } = loadConfig();
    const names = cookieNames(COOKIE_SECURE);
    const maxAge = Math.floor(SESSION_ABSOLUTE_MS / 1000);
    setCookie(res, names.session, token, { httpOnly: true, secure: COOKIE_SECURE, maxAgeSeconds: maxAge });
    setCookie(res, names.csrf, csrfToken, { httpOnly: false, secure: COOKIE_SECURE, maxAgeSeconds: maxAge });
    await audit(this.db, { actorId: user.id, action: 'staff.login', entityType: 'staff_user', entityId: user.id, summary: 'Signed in' });
    return { user: me(user), csrfToken };
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(StaffGuard)
  @ApiCookieAuth()
  @ApiOkResponse({ type: OkDto })
  async logout(@CurrentStaff() staff: StaffPrincipal, @Res({ passthrough: true }) res: Response): Promise<OkDto> {
    await this.sessions.revoke(staff.sessionId);
    const { COOKIE_SECURE } = loadConfig();
    const names = cookieNames(COOKIE_SECURE);
    clearCookie(res, names.session, COOKIE_SECURE);
    clearCookie(res, names.csrf, COOKIE_SECURE);
    await audit(this.db, { actorId: staff.id, action: 'staff.logout', entityType: 'staff_user', entityId: staff.id, summary: 'Signed out' });
    return { ok: true };
  }

  @Get('me')
  @UseGuards(StaffGuard)
  @ApiCookieAuth()
  @ApiOkResponse({ type: SessionDto })
  whoami(@CurrentStaff() staff: StaffPrincipal): SessionDto {
    return { user: me(staff), csrfToken: staff.csrfToken };
  }
}
