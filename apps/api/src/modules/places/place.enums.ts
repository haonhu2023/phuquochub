// Enum cluster Place — khớp prisma/schema.prisma + Data Dictionary.

export enum PlaceStatus {
  DRAFT = 'draft',
  PENDING = 'pending',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

export enum PriceRange {
  FREE = 'free',
  LOW = 'low',
  MID = 'mid',
  HIGH = 'high',
}

// Cache verification_status trên place/contact/price_history (ADR-008).
export enum VerificationStatus {
  PENDING = 'pending',
  VERIFIED = 'verified',
  OFFICIAL = 'official',
  COMMUNITY_VERIFIED = 'community_verified',
  EXPIRED = 'expired',
  REJECTED = 'rejected',
}

export enum FaqStatus {
  PENDING = 'pending',
  PUBLISHED = 'published',
  HIDDEN = 'hidden',
}

export enum AiSummaryStatus {
  GENERATING = 'generating',
  READY = 'ready',
  STALE = 'stale',
  REJECTED = 'rejected',
}

// Toạ độ GeoJSON (SRID 4326) cho cột PostGIS geography(Point).
export interface GeoJSONPoint {
  type: 'Point';
  coordinates: [number, number]; // [lng, lat]
}
