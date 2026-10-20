import { createHash } from 'crypto';
import { canonicalJson } from '../../common/canonical-json';
import { JobListing } from './entities/job-listing.entity';

// Gói C, sửa phạm vi stale sau phản hồi owner (17/10/2026) — bản đầu chỉ hash 4 trường DỊCH
// (title/description/requirements/benefits). KHÔNG ĐỦ: một bản dịch tiếng Anh thường tham chiếu
// các dữ kiện KHÔNG dịch nhưng có thể đổi — "lương X, làm theo ca Y, tại Z, hình thức W" — nếu
// X/Y/Z/W đổi mà không ai cập nhật lại câu chữ tiếng Anh, bản dịch cũ có thể SAI mà hệ thống không
// biết. Field nguồn CẦN kiểm (quyết định rõ, không mơ hồ):
//   - 4 trường dịch: title/description/requirements/benefits.
//   - Dữ kiện "điều kiện giao dịch" thường được nhắc tới trong câu chữ: employer_name/
//     employer_role (ai tuyển), job_category/work_location/ward (làm gì/ở đâu), employment_type/
//     shift_info (hình thức/ca làm), salary_min/salary_max/salary_negotiable/salary_currency/
//     salary_period (lương).
// CHỦ Ý LOẠI: contact_method/contact_value (không bao giờ xuất hiện trong văn xuôi, công khai dùng
// TRỰC TIẾP giá trị hiện tại — không "đóng băng" trong bản dịch nên không thể lệch); place_id (chỉ
// một liên kết tham khảo); expires_at (đã có cơ chế riêng xử lý hết hạn, không phải lỗi dịch).
function sourceFields(row: Pick<
  JobListing,
  | 'title'
  | 'description'
  | 'requirements'
  | 'benefits'
  | 'employerName'
  | 'employerRole'
  | 'jobCategory'
  | 'workLocation'
  | 'ward'
  | 'employmentType'
  | 'shiftInfo'
  | 'salaryMin'
  | 'salaryMax'
  | 'salaryNegotiable'
  | 'salaryCurrency'
  | 'salaryPeriod'
>) {
  return {
    title: row.title,
    description: row.description,
    requirements: row.requirements,
    benefits: row.benefits,
    employerName: row.employerName,
    employerRole: row.employerRole,
    jobCategory: row.jobCategory,
    workLocation: row.workLocation,
    ward: row.ward,
    employmentType: row.employmentType,
    shiftInfo: row.shiftInfo,
    salaryMin: row.salaryMin,
    salaryMax: row.salaryMax,
    salaryNegotiable: row.salaryNegotiable,
    salaryCurrency: row.salaryCurrency,
    salaryPeriod: row.salaryPeriod,
  };
}

export type JobListingTranslationSourceRow = Parameters<typeof sourceFields>[0];

// Cùng idiom `computeSourceTextHash()` của place_translations — sha256 hex của `canonicalJson()`.
export function computeJobListingSourceHash(row: JobListingTranslationSourceRow): string {
  const bytes = Buffer.from(canonicalJson(sourceFields(row)), 'utf8');
  return createHash('sha256').update(bytes).digest('hex');
}

// Hàm THUẦN — caller truyền row job_listings HIỆN TẠI, không tự đọc DB. Dùng cho CẢ hai câu hỏi
// khác nhau (xem entity's ghi chú): so `sourceContentHash` (bản nháp) hay `publishedSourceContentHash`
// (bản đang công khai) với hash hiện tại, tuỳ caller truyền hash nào.
export function isJobListingTranslationStale(storedSourceHash: string, currentRow: JobListingTranslationSourceRow): boolean {
  return storedSourceHash !== computeJobListingSourceHash(currentRow);
}

// Gói D điểm 4 (18/10/2026, owner yêu cầu rõ) — "không coi một cảnh báo chung là đủ" khi bản dịch
// đã biết MÂU THUẪN với dữ kiện QUAN TRỌNG (ca làm/địa điểm/giá/điều kiện giao dịch — nguyên văn
// owner). Hash TỔNG (sourceFields ở trên) không phân biệt được "chỉ mô tả đổi chút ít" với "lương
// đổi hẳn" — cần một hash THỨ HAI, hẹp hơn, chỉ phủ đúng 4 nhóm owner nêu, để biết CHÍNH XÁC có
// phải dữ kiện QUAN TRỌNG đã lệch hay không (không phải suy đoán từ hash tổng).
//   - "ca làm": shiftInfo.
//   - "địa điểm": workLocation, ward.
//   - "giá": salaryMin/salaryMax/salaryNegotiable/salaryCurrency/salaryPeriod.
//   - "điều kiện giao dịch": employmentType (toàn thời gian/bán thời gian/thời vụ LÀ một điều kiện
//     giao dịch của việc làm).
// CHỦ Ý LOẠI employerName/employerRole/jobCategory — đây là "ai tuyển/làm nghề gì", không phải một
// trong bốn nhóm owner liệt kê; đổi tên công ty không kích hoạt xử lý mạnh tay hơn cảnh báo chung.
function criticalFields(row: Pick<JobListing, 'workLocation' | 'ward' | 'employmentType' | 'shiftInfo' | 'salaryMin' | 'salaryMax' | 'salaryNegotiable' | 'salaryCurrency' | 'salaryPeriod'>) {
  return {
    workLocation: row.workLocation,
    ward: row.ward,
    employmentType: row.employmentType,
    shiftInfo: row.shiftInfo,
    salaryMin: row.salaryMin,
    salaryMax: row.salaryMax,
    salaryNegotiable: row.salaryNegotiable,
    salaryCurrency: row.salaryCurrency,
    salaryPeriod: row.salaryPeriod,
  };
}

export type JobListingTranslationCriticalFieldsRow = Parameters<typeof criticalFields>[0];

export function computeJobListingCriticalFieldsHash(row: JobListingTranslationCriticalFieldsRow): string {
  const bytes = Buffer.from(canonicalJson(criticalFields(row)), 'utf8');
  return createHash('sha256').update(bytes).digest('hex');
}

export function isJobListingTranslationCriticallyStale(
  storedCriticalHash: string | null,
  currentRow: JobListingTranslationCriticalFieldsRow,
): boolean {
  if (storedCriticalHash == null) return false; // bản dịch cũ hơn tính năng này, chưa từng lưu hash — không suy diễn.
  return storedCriticalHash !== computeJobListingCriticalFieldsHash(currentRow);
}
