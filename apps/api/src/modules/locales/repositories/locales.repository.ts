import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SupportedLocale } from '../entities/supported-locale.entity';

@Injectable()
export class LocalesRepository {
  constructor(
    @InjectRepository(SupportedLocale)
    private readonly repo: Repository<SupportedLocale>,
  ) {}

  findByCode(localeCode: string): Promise<SupportedLocale | null> {
    return this.repo.findOne({ where: { localeCode } });
  }

  findAll(): Promise<SupportedLocale[]> {
    return this.repo.find({ order: { localeCode: 'ASC' } });
  }

  // Vòng lặp public/production đọc từ đây — không hardcode danh sách vi/en ở tầng service.
  findPublic(): Promise<SupportedLocale[]> {
    return this.repo.find({ where: { isPublic: true }, order: { localeCode: 'ASC' } });
  }

  findDefault(): Promise<SupportedLocale | null> {
    return this.repo.findOne({ where: { isDefault: true } });
  }
}
