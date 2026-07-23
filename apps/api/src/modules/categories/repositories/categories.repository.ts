import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from '../entities/category.entity';

@Injectable()
export class CategoriesRepository {
  constructor(
    @InjectRepository(Category)
    private readonly repo: Repository<Category>,
  ) {}

  findAll(): Promise<Category[]> {
    return this.repo.find({ order: { nameVi: 'ASC' } });
  }

  findById(id: string): Promise<Category | null> {
    return this.repo.findOne({ where: { id } });
  }

  findBySlug(slug: string): Promise<Category | null> {
    return this.repo.findOne({ where: { slug } });
  }

  async existsBySlug(slug: string): Promise<boolean> {
    const count = await this.repo.count({ where: { slug } });
    return count > 0;
  }

  create(data: Partial<Category>): Category {
    return this.repo.create(data);
  }

  save(category: Category): Promise<Category> {
    return this.repo.save(category);
  }

  async remove(category: Category): Promise<void> {
    await this.repo.remove(category);
  }
}
