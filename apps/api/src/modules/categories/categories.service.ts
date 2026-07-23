import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { slugify } from '@phuquochub/utils';
import { CategoriesRepository } from './repositories/categories.repository';
import { Category } from './entities/category.entity';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/categories.dto';
import { toCategory } from './categories.mapper';

@Injectable()
export class CategoriesService {
  constructor(private readonly repo: CategoriesRepository) {}

  async list() {
    const rows = await this.repo.findAll();
    return rows.map(toCategory);
  }

  async get(id: string) {
    return toCategory(await this.getEntity(id));
  }

  async create(dto: CreateCategoryDto) {
    const slug = dto.slug?.trim() ? slugify(dto.slug) : slugify(dto.name_vi);
    if (await this.repo.existsBySlug(slug)) {
      throw new ConflictException(`Slug đã tồn tại: ${slug}`);
    }
    const category = this.repo.create({
      slug,
      nameVi: dto.name_vi,
      nameEn: dto.name_en ?? null,
      icon: dto.icon ?? null,
      parentId: dto.parent_id ?? null,
    });
    return toCategory(await this.repo.save(category));
  }

  async update(id: string, dto: UpdateCategoryDto) {
    const category = await this.getEntity(id);
    if (dto.name_vi !== undefined) {
      category.nameVi = dto.name_vi;
    }
    if (dto.name_en !== undefined) {
      category.nameEn = dto.name_en;
    }
    if (dto.icon !== undefined) {
      category.icon = dto.icon;
    }
    if (dto.parent_id !== undefined) {
      category.parentId = dto.parent_id;
    }
    return toCategory(await this.repo.save(category));
  }

  async remove(id: string): Promise<null> {
    const category = await this.getEntity(id);
    await this.repo.remove(category);
    return null;
  }

  // Lấy entity (nội bộ, dùng cho update/remove) — throw 404 nếu không có.
  private async getEntity(id: string): Promise<Category> {
    const category = await this.repo.findById(id);
    if (!category) {
      throw new NotFoundException('Không tìm thấy danh mục');
    }
    return category;
  }
}
