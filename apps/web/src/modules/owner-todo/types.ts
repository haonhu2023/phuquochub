// Kiểu dữ liệu trang "Việc cần làm" (owner todo) — bọc GET /owner-decisions (Place.Approve).
// Trường khớp trực tiếp OwnerDecisionQueueItem (apps/api/.../owner-decision-queue.entity.ts):
// controller trả thẳng entity qua TransformInterceptor (chỉ bọc { success, data, meta }, KHÔNG
// đổi tên trường) nên JSON về là camelCase y hệt property TypeORM, KHÔNG snake_case như PlaceCard/
// PlaceDetail (những kiểu đó đi qua mapper riêng, xem place-management types.ts).

export type OdqQuestionType =
  | 'identity_conflict'
  | 'address_conflict'
  | 'hours_conflict'
  | 'contact_conflict'
  | 'insufficient_sources'
  | 'photo_rights'
  | 'primary_selection';

export interface OwnerDecisionItem {
  id: string;
  placeId: string | null;
  candidateKey: string | null;
  field: string | null;
  questionType: OdqQuestionType;
  sourceAUrl: string | null;
  sourceAType: string | null;
  sourceBUrl: string | null;
  sourceBType: string | null;
  conflictSummary: string | null;
  recommendation: string | null;
  status: 'pending' | 'resolved' | 'expired' | 'withdrawn';
  expiresAt: string | null;
  createdAt: string;
}

// Nhãn tiếng Việt cho questionType — dùng ở OwnerTodoView. Không có nhãn cho 'photo_rights' nghĩa
// đen "ảnh thiếu quyền" dù ODQ hỗ trợ kiểu này: hiện chưa có nơi nào trong pipeline enqueue nó
// (chỉ source-first-ingest.service.ts và guide-articles flagContentGap() enqueue, cả hai đều dùng
// các loại xung đột dữ liệu/nguồn) — giữ nhãn sẵn để không vỡ UI nếu tương lai có, không phải vì
// đã kiểm chứng luồng đó tồn tại.
export const QUESTION_TYPE_LABELS: Record<OdqQuestionType, string> = {
  identity_conflict: 'Tên địa điểm — nguồn không khớp',
  address_conflict: 'Địa chỉ — nguồn không khớp',
  hours_conflict: 'Giờ mở cửa — nguồn không khớp',
  contact_conflict: 'Liên hệ — nguồn không khớp',
  insufficient_sources: 'Thiếu nguồn đáng tin cậy',
  photo_rights: 'Ảnh thiếu xác nhận quyền sử dụng',
  primary_selection: 'Cần chọn nguồn chính',
};

// Nơi hiển thị (không phải placeId) khi item chưa gắn với place đã tạo — chỉ còn ở dạng candidate.
export interface OwnerTodoRow extends OwnerDecisionItem {
  placeName: string | null;
  placeSlug: string | null;
}
