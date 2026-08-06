import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { User } from '../entities/user.entity';

// Repository Pattern: đóng gói truy vấn `users`, service không chạm ORM trực tiếp.
@Injectable()
export class UsersRepository {
  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
  ) {}

  /**
   * `manager` TUỲ CHỌN (ADR-015 Business Ownership Transfer) — đọc trong transaction của caller khi
   * bước xác nhận target user tồn tại PHẢI nằm trong cùng transaction (Owner Decision 4: thứ tự
   * bước cố định). Bỏ trống dùng `this.repo` như trước.
   */
  findById(id: string, manager?: EntityManager): Promise<User | null> {
    const repo = manager ? manager.getRepository(User) : this.repo;
    return repo.findOne({ where: { id } });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.repo.findOne({ where: { email } });
  }

  async existsByEmail(email: string): Promise<boolean> {
    const count = await this.repo.count({ where: { email } });
    return count > 0;
  }

  create(data: Partial<User>): User {
    return this.repo.create(data);
  }

  save(user: User): Promise<User> {
    return this.repo.save(user);
  }
}
