import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permission } from '../entities/permission.entity';

@Injectable()
export class PermissionsRepository {
  constructor(
    @InjectRepository(Permission)
    private readonly repo: Repository<Permission>,
  ) {}

  findAll(): Promise<Permission[]> {
    return this.repo.find({ order: { code: 'ASC' } });
  }

  findByCode(code: string): Promise<Permission | null> {
    return this.repo.findOne({ where: { code } });
  }
}
