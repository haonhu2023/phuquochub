import { Global, Module } from '@nestjs/common';
import { AuthRevocationService } from './auth-revocation.service';

// H-1 — hạ tầng thu hồi access token, xuyên suốt nhiều module.
//
// `@Global()` theo ĐÚNG tiền lệ `AuditModule`/`RedisModule`/`LoggerModule` trong `core/`: ba consumer
// nằm ở ba module khác nhau (`JwtAuthGuard` trong AuthModule, `AuthService` trong AuthModule,
// `UsersService` trong UsersModule) và `AuthModule` đã import `UsersModule` — nếu đặt service này
// trong `AuthModule` thì `UsersModule` buộc phải import ngược lại `AuthModule` => VÒNG LẶP module.
// Đặt ở `core/` + `@Global()` tránh hẳn vòng lặp mà không cần `forwardRef`.
//
// Module này KHÔNG import gì: `RedisService` (RedisModule `@Global()`) và `ConfigService`
// (`ConfigModule.forRoot({isGlobal:true})`) đều đã có sẵn toàn cục.
@Global()
@Module({
  providers: [AuthRevocationService],
  exports: [AuthRevocationService],
})
export class AuthRevocationModule {}
