'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useAuth } from '@/modules/auth/AuthProvider';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import { useSingleImageUpload } from '@/modules/media/useSingleImageUpload';
import { createReview } from './api/reviews.api';
import { formatReviewDate, ratingStars, reviewMediaAlt, reviewMediaSrc } from './format';
import type { Review } from './types';
import styles from './reviews.module.css';

interface Props {
  placeId: string;
  initialReviews: Review[];
}

// Client Component: đây là luồng GHI đầu tiên của FE ngoài auth (MVP gap-analysis 2026-07-25/26,
// "Reddit" pillar). Optimistic-append sau khi tạo thành công thay vì refetch — createReview trả
// null (EmptySuccess, openapi.yaml) nên item mới được dựng từ chính dữ liệu vừa gửi + user hiện tại.
export function ReviewsSection({ placeId, initialReviews }: Props) {
  const { isAuthenticated, user } = useAuth();
  const [reviews, setReviews] = useState(initialReviews);
  const [rating, setRating] = useState(5);
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const image = useSingleImageUpload();

  const hasReviewed = !!user && reviews.some((r) => r.user_id === user.id);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const session = readSession();
    if (!session) {
      setError('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.');
      return;
    }

    setSubmitting(true);
    try {
      const trimmed = content.trim();
      await createReview(
        placeId,
        { rating, content: trimmed || undefined, media_ids: image.mediaId ? [image.mediaId] : undefined },
        session.accessToken,
      );
      setReviews((prev) => [
        {
          id: `local-${Date.now()}`,
          user_id: session.user.id,
          author_name: session.user.displayName,
          author_avatar_url: session.user.avatarUrl,
          rating,
          content: trimmed || null,
          status: 'published',
          created_at: new Date().toISOString(),
          media: [],
        },
        ...prev,
      ]);
      setContent('');
      setRating(5);
      image.reset();
    } catch (err) {
      if (err instanceof ApiError && err.isConflict) {
        setError('Bạn đã đánh giá địa điểm này rồi.');
      } else {
        setError(err instanceof Error ? err.message : 'Không gửi được đánh giá.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={styles.section} aria-label="Đánh giá">
      <h2 className={styles.sectionTitle}>Đánh giá ({reviews.length})</h2>

      {reviews.length === 0 ? (
        <p className={styles.empty}>Chưa có đánh giá nào. Hãy là người đầu tiên!</p>
      ) : (
        <ul className={styles.reviewList}>
          {reviews.map((r) => (
            <li key={r.id} className={styles.reviewItem}>
              <div className={styles.reviewHead}>
                <span className={styles.reviewAuthor}>{r.author_name}</span>
                <span className={styles.reviewStars} aria-label={`${r.rating}/5 sao`}>
                  {ratingStars(r.rating).map((filled, i) => (
                    <span key={i} aria-hidden="true">
                      {filled ? '★' : '☆'}
                    </span>
                  ))}
                </span>
                <time className={styles.reviewDate} dateTime={r.created_at}>
                  {formatReviewDate(r.created_at)}
                </time>
              </div>
              {r.content && <p className={styles.reviewContent}>{r.content}</p>}
              {r.media.length > 0 && (
                <ul className={styles.reviewMedia}>
                  {r.media.map((m) => {
                    const src = reviewMediaSrc(m);
                    if (!src) return null;
                    return (
                      <li key={m.id}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- ảnh host bên ngoài (MinIO/CDN); next/image cần cấu hình remotePatterns (ngoài phạm vi slice này), cùng quy ước PlaceCard.tsx/places/[slug]/page.tsx. */}
                        <img className={styles.reviewMediaImg} src={src} alt={reviewMediaAlt(m)} loading="lazy" />
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      {!isAuthenticated && (
        <p className={styles.hint}>
          <Link href="/login">Đăng nhập</Link> để viết đánh giá.
        </p>
      )}

      {isAuthenticated && hasReviewed && <p className={styles.hint}>Bạn đã đánh giá địa điểm này.</p>}

      {isAuthenticated && !hasReviewed && (
        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.formLabel} htmlFor="review-rating">
            Số sao
          </label>
          <select
            id="review-rating"
            className={styles.formSelect}
            value={rating}
            onChange={(e) => setRating(Number(e.target.value))}
            disabled={submitting}
          >
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {n} sao
              </option>
            ))}
          </select>

          <label className={styles.formLabel} htmlFor="review-content">
            Nhận xét (không bắt buộc)
          </label>
          <textarea
            id="review-content"
            className={styles.formTextarea}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={2000}
            rows={3}
            disabled={submitting}
          />

          <label className={styles.formLabel} htmlFor="review-image">
            Thêm ảnh (không bắt buộc)
          </label>
          <input
            id="review-image"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className={styles.formFileInput}
            onChange={image.onFileSelected}
            disabled={submitting || image.uploading}
          />
          {image.preview && (
            // eslint-disable-next-line @next/next/no-img-element -- xem trước ảnh cục bộ (object URL), không phải ảnh từ host bên ngoài.
            <img src={image.preview} alt="Ảnh xem trước" className={styles.imagePreview} />
          )}
          {image.uploading && (
            <p className={styles.hint} aria-live="polite">
              Đang tải ảnh lên…
            </p>
          )}
          {image.error && (
            <p className={styles.formError} role="alert">
              {image.error}
            </p>
          )}

          {error && (
            <p className={styles.formError} role="alert">
              {error}
            </p>
          )}

          <button type="submit" className={styles.btn} disabled={submitting || image.uploading}>
            {submitting ? 'Đang gửi…' : 'Gửi đánh giá'}
          </button>
        </form>
      )}
    </section>
  );
}
