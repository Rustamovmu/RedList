import { Body, Controller, Get, Header, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiCreatedResponse, ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import type { Request, Response } from 'express';
import { AccountPrincipal } from './account-session.service';
import { AccountGuard, CurrentAccount } from './account.guard';
import { AccountService, VisitorRow } from './account.service';
import { LoginDto, OkDto } from './auth.controller';
import { PASSWORD_MIN_LENGTH } from './password';
import { assertSameOrigin } from './staff.guard';
import { StaffSignInService } from './staff-sign-in.service';

export class AccountMeDto {
  @ApiProperty() name!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

class AccountSessionDto {
  @ApiProperty({ type: AccountMeDto }) user!: AccountMeDto;
  @ApiProperty({ description: 'Send this back in the x-csrf-token header on every mutation. It is also set as a readable cookie.' })
  csrfToken!: string;
}

class SignUpDto {
  @ApiProperty({ maxLength: 80 }) @IsString() @MinLength(1) @MaxLength(80) name!: string;
  @ApiProperty() @IsEmail() @MaxLength(254) email!: string;
  @ApiProperty({ minLength: PASSWORD_MIN_LENGTH }) @IsString() @MaxLength(256) password!: string;
}

class AccountPasswordDto {
  @ApiProperty() @IsString() @MaxLength(256) currentPassword!: string;
  @ApiProperty({ minLength: PASSWORD_MIN_LENGTH }) @IsString() @MaxLength(256) newPassword!: string;
}

class DeleteAccountDto {
  @ApiProperty({ description: 'The account password, checked again before deleting' }) @IsString() @MaxLength(256) password!: string;
}

class SignInResultDto {
  @ApiProperty({ enum: ['staff', 'visitor'], description: 'staff: go to the staff area; visitor: stay on the public site' })
  kind!: 'staff' | 'visitor';
  @ApiProperty() name!: string;
  @ApiProperty({ description: 'The CSRF token of the new session, also set as a readable cookie' }) csrfToken!: string;
}

const me = (u: Pick<VisitorRow | AccountPrincipal, 'name' | 'email' | 'createdAt'>): AccountMeDto => ({
  name: u.name,
  email: u.email,
  createdAt: u.createdAt.toISOString(),
});

/**
 * The one sign-in form for everyone (D-066). A staff email signs in to the staff area exactly as
 * `POST /staff/auth/login` does (lockout, device cookies). Any other email signs in to a visitor account.
 * Either way the browser's other session ends, so it holds one identity.
 */
@ApiTags('auth')
@Controller('auth')
export class SignInController {
  constructor(
    private readonly staff: StaffSignInService,
    private readonly accounts: AccountService,
  ) {}

  @Post('sign-in')
  @HttpCode(200)
  @ApiOkResponse({ type: SignInResultDto })
  async signIn(@Body() body: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<SignInResultDto> {
    assertSameOrigin(req); // login CSRF
    const staffUser = await this.staff.find(body.email);
    if (staffUser) {
      const { user, csrfToken } = await this.staff.signIn(staffUser, body.email, body.password, req, res);
      await this.accounts.endBrowserSession(req, res);
      return { kind: 'staff', name: user.name, csrfToken };
    }
    const { user, csrfToken } = await this.accounts.signIn(body.email, body.password, req, res);
    return { kind: 'visitor', name: user.name, csrfToken };
  }
}

/** A visitor's own account (D-066). Sign-up needs no session; everything else is behind AccountGuard. */
@ApiTags('account')
@Controller('account')
export class AccountController {
  constructor(private readonly accounts: AccountService) {}

  /** Creates an account and signs it in. Checks Origin, shares the per-IP budget of sign-in. */
  @Post('sign-up')
  @ApiCreatedResponse({ type: AccountSessionDto })
  async signUp(@Body() body: SignUpDto, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<AccountSessionDto> {
    assertSameOrigin(req);
    const { user, csrfToken } = await this.accounts.signUp(body, req, res);
    return { user: me(user), csrfToken };
  }

  @Get('me')
  @UseGuards(AccountGuard)
  @ApiCookieAuth()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: AccountSessionDto })
  whoami(@CurrentAccount() account: AccountPrincipal): AccountSessionDto {
    return { user: me(account), csrfToken: account.csrfToken };
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(AccountGuard)
  @ApiCookieAuth()
  @ApiOkResponse({ type: OkDto })
  async logout(@CurrentAccount() account: AccountPrincipal, @Res({ passthrough: true }) res: Response): Promise<OkDto> {
    await this.accounts.signOut(account, res);
    return { ok: true };
  }

  /** Change the password. Every other session of the account ends; this browser stays signed in. */
  @Post('password')
  @HttpCode(200)
  @UseGuards(AccountGuard)
  @ApiCookieAuth()
  @ApiOkResponse({ type: OkDto })
  async changePassword(
    @CurrentAccount() account: AccountPrincipal,
    @Body() body: AccountPasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<OkDto> {
    await this.accounts.changePassword(account, body.currentPassword, body.newPassword, req, res);
    return { ok: true };
  }

  /** Delete the account at once, with every session of it. */
  @Post('delete')
  @HttpCode(200)
  @UseGuards(AccountGuard)
  @ApiCookieAuth()
  @ApiOkResponse({ type: OkDto })
  async deleteAccount(
    @CurrentAccount() account: AccountPrincipal,
    @Body() body: DeleteAccountDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<OkDto> {
    await this.accounts.deleteAccount(account, body.password, req, res);
    return { ok: true };
  }
}
