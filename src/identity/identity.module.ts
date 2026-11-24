import { Global, Module } from '@nestjs/common';
import { AccountController, SignInController } from './account.controller';
import { AccountGuard } from './account.guard';
import { AccountService } from './account.service';
import { AccountSessionService } from './account-session.service';
import { AuthController } from './auth.controller';
import { DeviceService } from './device.service';
import { LoginThrottle } from './login-throttle';
import { SessionService } from './session.service';
import { StaffGuard } from './staff.guard';
import { StaffSignInService } from './staff-sign-in.service';
import { StaffUsersController } from './staff-users.controller';
import { StaffUsersService } from './staff-users.service';

/**
 * Identity: staff sessions, CSRF, roles, device cookies and staff accounts; visitor accounts (D-066), kept in their
 * own tables and cookies; and the one sign-in form for both. Global so every staff controller can use StaffGuard.
 */
@Global()
@Module({
  controllers: [AuthController, StaffUsersController, SignInController, AccountController],
  providers: [
    SessionService,
    DeviceService,
    LoginThrottle,
    StaffGuard,
    StaffUsersService,
    StaffSignInService,
    AccountSessionService,
    AccountGuard,
    AccountService,
  ],
  exports: [SessionService, StaffGuard],
})
export class IdentityModule {}
