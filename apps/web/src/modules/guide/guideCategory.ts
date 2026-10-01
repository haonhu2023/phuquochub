import type { Locale } from '@/lib/locale';
import type { GuideArticleCategory } from './types';

// Nhãn hiển thị cho GuideArticleCategory (2026-09-29) — DÙNG CHUNG giữa editor (chọn chuyên mục)
// và bộ lọc công khai (/guide?category=), cùng khuôn PRICE_RANGE_LABELS (lib/filters.copy.ts):
// một nguồn duy nhất để hai nơi không lệch bản dịch. Thứ tự trong mảng GUIDE_CATEGORY_VALUES là
// thứ tự hiển thị trong <select>/danh sách lọc.
export const GUIDE_CATEGORY_VALUES: GuideArticleCategory[] = [
  'kinh_nghiem',
  'am_thuc',
  'luu_tru',
  'di_chuyen',
  'lich_trinh',
  'vui_choi',
];

export const GUIDE_CATEGORY_LABELS: Record<Locale, Record<GuideArticleCategory, string>> = {
  vi: {
    kinh_nghiem: 'Kinh nghiệm du lịch',
    am_thuc: 'Ẩm thực',
    luu_tru: 'Lưu trú',
    di_chuyen: 'Di chuyển',
    lich_trinh: 'Lịch trình gợi ý',
    vui_choi: 'Vui chơi & Giải trí',
  },
  en: {
    kinh_nghiem: 'Travel tips',
    am_thuc: 'Food & drink',
    luu_tru: 'Where to stay',
    di_chuyen: 'Getting around',
    lich_trinh: 'Suggested itineraries',
    vui_choi: 'Things to do',
  },
};
