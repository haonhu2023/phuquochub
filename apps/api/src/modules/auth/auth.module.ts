import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { UsersModule } from '../users/users.module';
import { RbacModule } from '../rbac/rbac.module';
import { JwtAuthGuard } from '../authz/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authz/guards/permissions.guard';

// Đăng ký guard TOÀN CỤC: JwtAuthGuard (AuthN) → PermissionsGuard (AuthZ, deny-by-default).
// Module này import JwtModule + RbacModule để guard giải được JwtService + AuthorizationService.
@Module({
  imports: [
    UsersModule,
    RbacModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.accessSecret'),
        signOptions: { expiresIn: config.get<number>('jwt.accessTtl') ?? 900 },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AuthModule {}
