// Đa hình, enum ĐÓNG — xem migration InitSavedItems cho lý do không dùng text tự do/FK cứng.
// Định nghĩa THẬT nằm ở common/listable-target-type.enum.ts (dùng chung với listing_reports, tách
// ra khi xuất hiện consumer thứ hai, 2026-10-08) — re-export dưới tên cũ để không phải đổi mọi nơi
// đã import `SavedItemTargetType` (entity/dto/repository/service/controller/web).
export { ListableTargetType as SavedItemTargetType } from '../../common/listable-target-type.enum';
