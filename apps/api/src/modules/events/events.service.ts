import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { slugify } from '@phuquochub/utils';
import { EventsRepository } from './repositories/events.repository';
import { CreateEventDto } from './dto/events.dto';
import { toEvent } from './events.mapper';
import { paginate, clampLimit, clampPage } from '../../common/pagination';

const DEFAULT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 ngày

@Injectable()
export class EventsService {
  constructor(private readonly repo: EventsRepository) {}

  async list(page?: number, limit?: number) {
    const p = clampPage(page);
    const l = clampLimit(limit);
    const [rows, total] = await Promise.all([this.repo.listEvents(l, (p - 1) * l), this.repo.count()]);
    return paginate(rows.map(toEvent), p, l, total);
  }

  async getBySlug(slug: string) {
    const row = await this.repo.getBySlug(slug);
    if (!row) {
      throw new NotFoundException('Không tìm thấy sự kiện');
    }
    return toEvent(row);
  }

  async calendar(from?: string, to?: string) {
    const fromD = from ?? new Date().toISOString();
    const toD = to ?? new Date(Date.now() + DEFAULT_WINDOW_MS).toISOString();
    const rows = await this.repo.calendar(fromD, toD);
    return rows.map(toEvent);
  }

  async create(dto: CreateEventDto, userId: string) {
    if (new Date(dto.start_at).getTime() >= new Date(dto.end_at).getTime()) {
      throw new BadRequestException('start_at phải trước end_at');
    }
    const slug = await this.uniqueSlug(dto.title);
    await this.repo.create({
      title: dto.title,
      slug,
      description: dto.description ?? null,
      startAt: dto.start_at,
      endAt: dto.end_at,
      timezone: dto.timezone,
      placeId: dto.place_id ?? null,
      organizerId: dto.organizer_id ?? null,
      eventCategory: dto.event_category ?? null,
      recurrenceRule: dto.recurrence_rule ?? null,
      createdBy: userId,
    });
    const row = await this.repo.getBySlug(slug);
    return toEvent(row!);
  }

  private async uniqueSlug(title: string): Promise<string> {
    const base = slugify(title) || 'event';
    let slug = base;
    while (await this.repo.existsBySlug(slug)) {
      slug = `${base}-${randomUUID().slice(0, 6)}`;
    }
    return slug;
  }
}
