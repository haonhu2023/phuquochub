import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UsersRepository } from './repositories/users.repository';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { OperatorBootstrapService } from './operator-bootstrap.service';
import { RbacModule } from '../rbac/rbac.module';

// `OperatorBootstrapService` sống ở ĐÂY, không ở RbacModule: nó cần `UsersRepository` (tra người
// dùng theo email) và `UsersModule` đã import `RbacModule` — đặt ngược lại sẽ tạo circular module
// dependency. Về mặt nghiệp vụ nó cũng thuộc về đây: `UsersService.assignRole()` (đường API) và
// `OperatorBootstrapService.bootstrap()` (đường CLI, dùng khi chưa ai có `Role.Assign`) là hai lối
// vào của CÙNG một hành động — gán vai trò cho một người dùng.
@Module({
  imports: [TypeOrmModule.forFeature([User]), RbacModule],
  controllers: [UsersController],
  providers: [UsersRepository, UsersService, OperatorBootstrapService],
  exports: [UsersRepository, OperatorBootstrapService],
})
export class UsersModule {}
