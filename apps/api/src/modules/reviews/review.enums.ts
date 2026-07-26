// Khớp prisma/schema.prisma ReviewStatus + enum DB "review_status" (InitReviews).
export enum ReviewStatus {
  PENDING = 'pending',
  PUBLISHED = 'published',
  HIDDEN = 'hidden',
}
