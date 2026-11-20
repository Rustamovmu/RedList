import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { LoginThrottle } from './login-throttle';
import { SessionService } from './session.service';
import { StaffGuard } from './staff.guard';

/** Staff identity: sessions, CSRF, roles. Global so every staff controller can use StaffGuard. */
@Global()
@Module({
  controllers: [AuthController],
  providers: [SessionService, LoginThrottle, StaffGuard],
  exports: [SessionService, StaffGuard],
})
export class IdentityModule {}
