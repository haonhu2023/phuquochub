import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Đánh dấu endpoint bỏ qua xác thực (Guest). Không dùng cho endpoint ghi nhạy cảm.
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
