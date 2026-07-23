import { Injectable } from '@nestjs/common';
import { PlacesService } from '../places/places.service';
import { RestaurantsRepository } from './repositories/restaurants.repository';
import { UpdateRestaurantMenuDto } from './dto/restaurants.dto';
import { paginate, clampLimit, clampPage } from '../../common/pagination';

function mapItem(i: Record<string, unknown>) {
  return {
    id: i.id,
    name: i.name,
    price: i.price !== null && i.price !== undefined ? Number(i.price) : null,
    currency: i.currency,
    tags: i.tags ?? null,
    sort_order: i.sort_order,
  };
}

// Restaurant = Place (category='restaurant') + satellite (ADR-002).
@Injectable()
export class RestaurantsService {
  constructor(
    private readonly placesService: PlacesService,
    private readonly repo: RestaurantsRepository,
  ) {}

  async list(page?: number, limit?: number) {
    const p = clampPage(page);
    const l = clampLimit(limit);
    const [rows, total] = await Promise.all([
      this.repo.listRestaurants(l, (p - 1) * l),
      this.repo.countRestaurants(),
    ]);
    const items = rows.map((r: Record<string, unknown>) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      short_description: r.short_description,
      rating_avg: r.rating_avg !== null ? Number(r.rating_avg) : null,
      rating_count: r.rating_count,
      is_local_specialty: r.is_local_specialty,
      location: { lat: Number(r.lat), lng: Number(r.lng) },
    }));
    return paginate(items, p, l, total);
  }

  async getBySlug(slug: string) {
    const place = await this.placesService.getBySlug(slug);
    const [details, cuisines] = await Promise.all([
      this.repo.detail(place.id),
      this.repo.listCuisines(place.id),
    ]);
    return { ...place, restaurant_details: details, cuisines };
  }

  async getMenu(placeId: string) {
    const sections = await this.repo.sections(placeId);
    const items = await this.repo.itemsBySection(sections.map((s: { id: string }) => s.id));
    return sections.map((s: Record<string, unknown>) => ({
      id: s.id,
      name: s.name,
      sort_order: s.sort_order,
      items: items.filter((i: { section_id: string }) => i.section_id === s.id).map(mapItem),
    }));
  }

  async updateMenu(placeId: string, dto: UpdateRestaurantMenuDto) {
    await this.repo.replaceMenu(placeId, dto.sections);
    return this.getMenu(placeId);
  }
}
