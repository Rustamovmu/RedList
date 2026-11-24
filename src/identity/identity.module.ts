import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { DeviceService } from './device.service';
import { LoginThrottle } from './login-throttle';
import { SessionService } from './session.service';
import { StaffGuard } from './staff.guard';
import { StaffUsersController } from './staff-users.controller';
import { StaffUsersService } from './staff-users.service';

/** Staff identity: sessions, CSRF, roles, device cookies, staff accounts. Global so every staff controller can use StaffGuard. */
@Global()
@Module({
  controllers: [AuthController, StaffUsersController],
  providers: [SessionService, DeviceService, LoginThrottle, StaffGuard, StaffUsersService],
  exports: [SessionService, StaffGuard],
})
export class IdentityModule {}
