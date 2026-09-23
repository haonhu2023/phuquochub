import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { GuideArticleStatus } from '../guide-article.enums';

// Phú Quốc Guide CMS candidate (2026-09-18). One row per (slug, locale) — a single, stable,
// in-place-updated row (same shape as `places`, NOT the insert-only per-locale-row shape
// `place_translations` uses — a guide article has no per-locale review workflow to protect against
// content-vs-edit races the way a translation does).
//
// `contentVersion` is the CAS counter GuideArticlesService gates every content-changing write on:
// `UPDATE ... WHERE id = $1 AND content_version = $2`, bumped on every successful write. See
// GuideArticleSchema1720006000000's migration comment for why this is an integer counter rather
// than the state-transition-conditional-UPDATE idiom PlaceTranslationsRepository.updateReviewState()
// uses — that idiom fits a closed set of review states; arbitrary draft content edits do not have one.
@Entity('guide_articles')
@Unique(['slug', 'locale'])
@Index(['status'])
export class GuideArticle {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 160 })
  slug!: string;

  @Column({ type: 'varchar', length: 5 })
  locale!: string;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  intro!: string | null;

  @Column({ type: 'uuid', nullable: true })
  heroMediaId!: string | null;

  @Column({ type: 'enum', enum: GuideArticleStatus, enumName: 'guide_article_status', default: GuideArticleStatus.DRAFT })
  status!: GuideArticleStatus;

  @Column({ type: 'int', default: 1 })
  contentVersion!: number;

  @Column({ type: 'uuid' })
  authorId!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;

  @Column({ type: 'uuid', nullable: true })
  publishedBy!: string | null;
}
