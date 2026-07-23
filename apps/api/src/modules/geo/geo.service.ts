import { Injectable, Logger } from '@nestjs/common';
import { PlacesRepository } from '../places/repositories/places.repository';
import { RedisService } from '../../core/redis/redis.service';
import { toPlaceCard } from '../places/places.mapper';
import { clampLimit } from '../../common/pagination';
import { BboxQueryDto, NearbyQueryDto } from './dto/geo.dto';

const MAX_RADIUS_M = 50000;
const NOMINATIM = process.env.NOMINATIM_URL ?? 'https://nominatim.openstreetmap.org';
const GEOCODE_TTL_S = 86400; // cache 24h (dữ liệu địa lý ổn định)
const GEOCODE_PREFIX = 'geocode:';
const BBOX_MAX = 500;

@Injectable()
export class GeoService {
  private readonly logger = new Logger(GeoService.name);

  constructor(
    private readonly placesRepo: PlacesRepository,
    private readonly redis: RedisService,
  ) {}

  async nearby(dto: NearbyQueryDto) {
    const radius = Math.min(dto.radius ?? 2000, MAX_RADIUS_M);
    const rows = await this.placesRepo.nearby({
      lat: dto.lat,
      lng: dto.lng,
      radius,
      category: dto.category,
      limit: clampLimit(dto.limit),
    });
    return rows.map(toPlaceCard);
  }

  // bbox → điểm gom cụm theo zoom (api.md §11 "clustered points"). Cell nhỏ dần khi zoom tăng →
  // ở zoom cao mỗi điểm là một cụm-1 (trả về như point).
  async bbox(dto: BboxQueryDto) {
    const zoom = Math.min(Math.max(dto.zoom ?? 12, 1), 20);
    const cellDeg = 360 / Math.pow(2, zoom + 2); // ~4 cell/tile
    const rows = await this.placesRepo.bboxClusters({
      minLng: dto.minLng,
      minLat: dto.minLat,
      maxLng: dto.maxLng,
      maxLat: dto.maxLat,
      cellDeg,
      limit: BBOX_MAX,
    });
    return rows.map((r) =>
      r.cnt > 1
        ? { type: 'cluster', count: r.cnt, lng: Number(r.lng), lat: Number(r.lat) }
        : {
            type: 'place',
            id: r.sample_id,
            slug: r.sample_slug,
            title: r.sample_name,
            lng: Number(r.lng),
            lat: Number(r.lat),
          },
    );
  }

  // Geocode qua Nominatim (OSM) + cache-aside Redis. Tôn trọng policy Nominatim (User-Agent).
  // Redis lỗi → bỏ qua cache (không làm hỏng geocode).
  async geocode(q: string) {
    const key = `${GEOCODE_PREFIX}${q.trim().toLowerCase()}`;
    const cached = await this.readCache(key);
    if (cached) {
      return cached;
    }
    const url = `${NOMINATIM}/search?format=jsonv2&limit=5&countrycodes=vn&q=${encodeURIComponent(q)}`;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'PhuQuocHub/1.0 (geocode)' } });
      if (!res.ok) {
        return [];
      }
      const data = (await res.json()) as Array<{ display_name: string; lat: string; lon: string }>;
      const result = data.map((d) => ({
        display_name: d.display_name,
        lat: Number(d.lat),
        lng: Number(d.lon),
      }));
      await this.writeCache(key, result);
      return result;
    } catch (err) {
      this.logger.warn(`Geocode lỗi: ${(err as Error).message}`);
      return [];
    }
  }

  private async readCache(key: string): Promise<unknown[] | null> {
    try {
      const raw = await this.redis.getClient().get(key);
      return raw ? (JSON.parse(raw) as unknown[]) : null;
    } catch (err) {
      this.logger.warn(`Redis get lỗi (bỏ qua cache): ${(err as Error).message}`);
      return null;
    }
  }

  private async writeCache(key: string, value: unknown): Promise<void> {
    try {
      await this.redis.getClient().set(key, JSON.stringify(value), 'EX', GEOCODE_TTL_S);
    } catch (err) {
      this.logger.warn(`Redis set lỗi (bỏ qua cache): ${(err as Error).message}`);
    }
  }
}
