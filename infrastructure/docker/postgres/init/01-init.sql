-- ============================================================================
-- PhuQuocHub — khởi tạo extension PostgreSQL (chạy 1 lần khi tạo volume)
-- postgis: dữ liệu địa lý (geography/geometry) — kiến trúc coi geo là hạng nhất.
-- unaccent + pg_trgm: tìm kiếm tiếng Việt không dấu + fuzzy (Sprint 3).
-- pgcrypto: gen_random_uuid() cho khóa chính UUID.
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
