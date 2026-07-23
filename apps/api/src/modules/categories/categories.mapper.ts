import { Category } from './entities/category.entity';

// Map entity (camelCase) → response snake_case (khớp openapi Category + coding-standard).
export function toCategory(c: Category) {
  return {
    id: c.id,
    slug: c.slug,
    name_vi: c.nameVi,
    name_en: c.nameEn,
    icon: c.icon,
    parent_id: c.parentId,
  };
}
