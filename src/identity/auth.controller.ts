import { Body, Controller, Get, Header, HttpCode, Post, Req, Res, UnprocessableEntityException, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength } from 'class-validator';
import { eq } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { audit } from '../common/audit';
import { clearCookie, readCookie } from '../common/cookies';
import { cookieNames, loadConfig } from '../config';
import { Db, InjectDb } from '../db/db.module';
import { staffUsers } from '../db/schema';
import { DeviceService } from './device.service';
import { LoginThrottle, throwIfLimited } from './login-throttle';
import { PASSWORD_MIN_LENGTH, verifyPassword } from './password';
import { SessionService, StaffPrincipal } from './session.service';
import { assertSameOrigin, CurrentStaff, StaffGuard } from './staff.guard';
import { StaffSignInService } from './staff-sign-in.service';
import { StaffUsersService } from './staff-users.service';

export class LoginDto {
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

class ChangePasswordDto {
  @ApiProperty() @IsString() @MaxLength(256) currentPassword!: string;
  @ApiProperty({ minLength: PASSWORD_MIN_LENGTH }) @IsString() @MaxLength(256) newPassword!: string;
}

class LinkTokenDto {
  @ApiProperty({ description: 'The token from the link fragment (#token=…)' }) @IsString() @MaxLength(100) token!: string;
}

class RedeemLinkDto extends LinkTokenDto {
  @ApiProperty({ minLength: PASSWORD_MIN_LENGTH }) @IsString() @MaxLength(256) password!: string;
}

class LinkInfoDto {
  @ApiProperty({ enum: ['invite', 'reset'] }) purpose!: 'invite' | 'reset';
  @ApiProperty() name!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
}

export class OkDto {
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
    private readonly devices: DeviceService,
    private readonly users: StaffUsersService,
    private readonly signIn: StaffSignInService,
  ) {}

  /** Staff sign-in (staff only). The web app's form uses `POST /auth/sign-in`, which serves everyone (D-066). */
  @Post('login')
  @HttpCode(200)
  @ApiOkResponse({ type: SessionDto })
  async login(@Body() body: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<SessionDto> {
    assertSameOrigin(req); // login CSRF
    const { user, csrfToken } = await this.signIn.signIn(await this.signIn.find(body.email), body.email, body.password, req, res);
    return { user: me(user), csrfToken };
  }

  /**
   * Change your own password. Every other session and device of the account ends, and so does any open reset
   * link; this browser stays signed in and gets a fresh device cookie. Wrong current passwords count towards the
   * same lockout as sign-in.
   */
  @Post('password')
  @HttpCode(200)
  @UseGuards(StaffGuard)
  @ApiCookieAuth()
  @ApiOkResponse({ type: OkDto })
  async changePassword(
    @CurrentStaff() staff: StaffPrincipal,
    @Body() body: ChangePasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<OkDto> {
    const names = cookieNames(loadConfig().COOKIE_SECURE);
    const deviceId = await this.devices.find(staff.id, readCookie(req, names.device));
    throwIfLimited(res, this.throttle.check(req.ip ?? 'unknown', staff.email, deviceId));
    const [user] = await this.db.select({ hash: staffUsers.passwordHash }).from(staffUsers).where(eq(staffUsers.id, staff.id)).limit(1);
    if (!(await verifyPassword(user?.hash ?? null, body.currentPassword))) {
      this.throttle.recordFailure(staff.email, deviceId);
      throw new UnprocessableEntityException({ code: 'WRONG_PASSWORD', message: 'Your current password is incorrect' });
    }
    this.throttle.recordSuccess(staff.email, deviceId);
    if (body.newPassword === body.currentPassword) {
      throw new UnprocessableEntityException({ code: 'SAME_PASSWORD', message: 'Choose a password different from the current one' });
    }
    await this.users.setOwnPassword(staff, body.newPassword);
    this.signIn.setDeviceCookie(res, await this.devices.issue(staff.id, null));
    return { ok: true };
  }

  /** What a one-time link is for (invite or reset) and whose it is. Needs no session. */
  @Post('link/check')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: LinkInfoDto })
  checkLink(@Body() body: LinkTokenDto, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<LinkInfoDto> {
    assertSameOrigin(req);
    throwIfLimited(res, this.throttle.checkIp(req.ip ?? 'unknown'));
    return this.users.inspectLink(body.token);
  }

  /** Set a password with a one-time link, then sign in. All other sessions and devices of the account end. */
  @Post('link/redeem')
  @HttpCode(200)
  @ApiOkResponse({ type: SessionDto })
  async redeemLink(@Body() body: RedeemLinkDto, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<SessionDto> {
    assertSameOrigin(req);
    throwIfLimited(res, this.throttle.checkIp(req.ip ?? 'unknown'));
    const user = await this.users.redeemLink(body.token, body.password);
    this.throttle.recordSuccess(user.email);
    const session = await this.signIn.startSession(req, res, user.id, null);
    await audit(this.db, { actorId: user.id, action: 'staff.login', entityType: 'staff_user', entityId: user.id, summary: 'Signed in with a one-time link' });
    return { user: me(user), csrfToken: session.csrfToken };
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
