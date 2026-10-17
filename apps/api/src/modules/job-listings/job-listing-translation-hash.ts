import { createHash } from 'crypto';
import { canonicalJson } from '../../common/canonical-json';
import { JobListing } from './entities/job-listing.entity';

// Cùng idiom `computeSourceTextHash()` của place_translations (source-text-hash.ts) — sha256 hex
// của `canonicalJson()`, KHÔNG JSON.stringify thô (thứ tự khoá ổn định, nhất quán với mọi digest
// khác trong repo). Hash trên CẢ BỐN trường tiếng Việt gộp lại (không phải field-riêng như
// place_translations) — khớp đúng thiết kế "một row/locale cho cả 4 trường" của bảng này.
function sourceFields(row: Pick<JobListing, 'title' | 'description' | 'requirements' | 'benefits'>) {
  return { title: row.title, description: row.description, requirements: row.requirements, benefits: row.benefits };
}

export function computeJobListingSourceHash(row: Pick<JobListing, 'title' | 'description' | 'requirements' | 'benefits'>): string {
  const bytes = Buffer.from(canonicalJson(sourceFields(row)), 'utf8');
  return createHash('sha256').update(bytes).digest('hex');
}

// Phát hiện bản dịch có thể đã lỗi thời: nội dung tiếng Việt đổi SAU KHI bản dịch được lưu lần gần
// nhất. Hàm THUẦN — caller truyền row job_listings HIỆN TẠI, không tự đọc DB.
export function isJobListingTranslationStale(
  storedSourceHash: string,
  currentRow: Pick<JobListing, 'title' | 'description' | 'requirements' | 'benefits'>,
): boolean {
  return storedSourceHash !== computeJobListingSourceHash(currentRow);
}
