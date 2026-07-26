import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Review } from '../entities/review.entity';
import { ReviewStatus } from '../review.enums';

export interface ReviewRow {
  id: string;
  rating: number;
  content: string | null;
  status: ReviewStatus;
  created_at: Date;
  user_id: string;
  author_name: string;
  author_avatar_url: string | null;
}

@Injectable()
export class ReviewsRepository {
  constructor(
    @InjectRepository(Review)
    private readonly repo: Repository<Review>,
  ) {}

  existsByUser(placeId: string, userId: string): Promise<boolean> {
    return this.repo.exists({ where: { placeId, userId } });
  }

  create(data: { placeId: string; userId: string; rating: number; content: string | null }): Review {
    return this.repo.create({ ...data, status: ReviewStatus.PUBLISHED });
  }

  save(review: Review): Promise<Review> {
    return this.repo.save(review);
  }

  /** Đánh giá đã published của một Place, mới nhất trước — kèm tên/avatar người viết. */
  listPublishedByPlace(placeId: string): Promise<ReviewRow[]> {
    return this.repo.query(
      `SELECT r.id, r.rating, r.content, r.status, r.created_at,
              r.user_id, u.display_name AS author_name, u.avatar_url AS author_avatar_url
       FROM reviews r
       JOIN users u ON u.id = r.user_id
       WHERE r.place_id = $1 AND r.status = $2
       ORDER BY r.created_at DESC, r.id ASC`,
      [placeId, ReviewStatus.PUBLISHED],
    );
  }
}
