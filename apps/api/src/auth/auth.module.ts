import { Module } from "@nestjs/common";

import { AuthController } from "./auth.controller.js";
import { OperatorGuard, SessionGuard } from "./auth.guard.js";
import { AuthService } from "./auth.service.js";

@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionGuard, OperatorGuard],
  exports: [AuthService, SessionGuard, OperatorGuard],
})
export class AuthModule {}
