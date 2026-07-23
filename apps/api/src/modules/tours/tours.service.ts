import { BadRequestException, Injectable } from '@nestjs/common';
import { PlacesService } from '../places/places.service';
import { ToursRepository } from './repositories/tours.repository';
import { CreateTourDto } from './dto/tours.dto';
import type { CreatePlaceDto } from '../places/dto/places.dto';
import { paginate, clampLimit, clampPage } from '../../common/pagination';

function mapStop(s: Record<string, unknown>) {
  const lat = s.lat as number | null;
  const lng = s.lng as number | null;
  return {
    id: s.id,
    name: s.name,
    sort_order: s.sort_order,
    time: s.time,
    note: s.note,
    location: lat !== null && lng !== null ? { lat: Number(lat), lng: Number(lng) } : null,
  };
}

function mapSchedule(s: Record<string, unknown>) {
  return {
    id: s.id,
    date: s.date,
    capacity: s.capacity,
    price: s.price !== null && s.price !== undefined ? Number(s.price) : null,
    currency: s.currency,
    valid_from: s.valid_from,
    valid_to: s.valid_to,
  };
}

// Tour = Place (category='tour') + satellite (ADR-002). create → tạo Place (pending) + tour_details.
@Injectable()
export class ToursService {
  constructor(
    private readonly placesService: PlacesService,
    private readonly repo: ToursRepository,
  ) {}

  async list(page?: number, limit?: number) {
    const p = clampPage(page);
    const l = clampLimit(limit);
    const [rows, total] = await Promise.all([this.repo.listTours(l, (p - 1) * l), this.repo.countTours()]);
    const items = rows.map((r: Record<string, unknown>) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      short_description: r.short_description,
      rating_avg: r.rating_avg !== null ? Number(r.rating_avg) : null,
      rating_count: r.rating_count,
      tour_type: r.tour_type,
      duration_minutes: r.duration_minutes,
      difficulty: r.difficulty,
      location: { lat: Number(r.lat), lng: Number(r.lng) },
    }));
    return paginate(items, p, l, total);
  }

  async getBySlug(slug: string) {
    const place = await this.placesService.getBySlug(slug);
    const details = await this.repo.detail(place.id);
    return { ...place, tour_details: details };
  }

  async getItinerary(placeId: string) {
    return (await this.repo.stops(placeId)).map(mapStop);
  }

  async getSchedule(placeId: string) {
    return (await this.repo.schedules(placeId)).map(mapSchedule);
  }

  async create(dto: CreateTourDto, userId: string) {
    const categoryId = await this.repo.tourCategoryId();
    if (!categoryId) {
      throw new BadRequestException('Danh mục "tour" chưa được khởi tạo');
    }
    const placeDto: CreatePlaceDto = {
      name: dto.name,
      category_id: categoryId,
      location: dto.location,
      short_description: dto.short_description,
      description: dto.description,
    } as CreatePlaceDto;
    const place = await this.placesService.create(placeDto, userId);
    await this.repo.createDetails(place.id as string, {
      tourType: dto.tour_type,
      durationMinutes: dto.duration_minutes ?? null,
      difficulty: dto.difficulty ?? null,
    });
    return { ...place, tour_details: await this.repo.detail(place.id as string) };
  }
}
