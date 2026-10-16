import type { Locale } from '@/lib/locale';
import { isValidCoord } from './mapMarkers';

// Lỗi thật phát hiện 16/10/2026 (nghiệm thu nội dung, ảnh Bãi Sao): link "Xem trên bản đồ" trên
// 3 trang chi tiết (places/hotels/restaurants) trước đây LUÔN mở Google Maps bằng CHỈ toạ độ
// (`?q=lat,lng`) — Google Maps hiển thị đúng điểm ghim, nhưng KHÔNG hiển thị hồ sơ địa điểm (tên,
// giờ mở cửa, đánh giá...) vì không có tên/định danh nào đi kèm truy vấn. Người dùng thấy "một
// chấm trên bản đồ", không phải "hồ sơ Bãi Sao".
//
// `place_external_identifiers` (bảng GOOGLE_PLACES) đã tồn tại trong DB nhưng: 0 dòng dữ liệu cho
// MỌI địa điểm, và module backend của nó CỐ Ý không có controller ("chưa có yêu cầu API surface" —
// xem place-external-identifiers.module.ts) — nên hiện KHÔNG CÓ cách nào, kể cả qua dashboard, để
// gắn Google Place ID cho bất kỳ địa điểm nào. Vì vậy `googlePlaceId` ở đây luôn nhận được
// `undefined`/`null` từ mọi trang hiện tại — nhánh "hồ sơ đã xác nhận" bên dưới coi như CHƯA CÓ
// nhánh gọi thật nào, nhưng đã viết đúng, sẵn sàng dùng ngay khi có API surface cho bảng đó (xem
// đề xuất bổ sung API tối thiểu trong gói bàn giao, KHÔNG tự triển khai ở đây).
//
// Không có Place ID: đổi mặc định từ "chỉ toạ độ" sang "tìm theo tên (+địa chỉ nếu có)" — tăng khả
// năng Google Maps tự khớp đúng hồ sơ thật theo tên, nhưng đây VẪN LÀ TÌM KIẾM, không phải xác
// nhận — nhãn phải nói rõ "Tìm trên Google Maps", không dùng chữ ngụ ý đã xác nhận đúng hồ sơ.
//
// URL chuẩn dùng Google Maps URLs (không cần API key/billing):
//   - Tìm kiếm / hồ sơ:  https://www.google.com/maps/search/?api=1&query=<text>[&query_place_id=<id>]
//   - Chỉ đường:         https://www.google.com/maps/dir/?api=1&destination=<lat,lng>[&destination_place_id=<id>]
//   - Toạ độ tham khảo:  https://www.google.com/maps?q=<lat>,<lng>  (cơ chế CŨ, giữ lại làm lựa chọn phụ)
// https://developers.google.com/maps/documentation/urls/get-started

export interface PlaceMapLinkInput {
  lat: number;
  lng: number;
  name: string;
  address?: string | null;
  /** Google Place ID đã đối chiếu đúng cơ sở (từ place_external_identifiers, provider GOOGLE_PLACES). Hiện luôn undefined — xem ghi chú đầu file. */
  googlePlaceId?: string | null;
}

export interface MapLink {
  url: string;
  label: string;
}

export interface PlaceMapLinks {
  /** Hồ sơ đã xác nhận (có Place ID) HOẶC tìm kiếm theo tên/địa chỉ (chưa xác nhận) — PHÂN BIỆT bằng `primaryCertain`. */
  primary: MapLink;
  /** true = `primary` mở đúng hồ sơ đã đối chiếu (Place ID). false = `primary` chỉ là kết quả tìm kiếm, CHƯA bảo đảm đúng hồ sơ. */
  primaryCertain: boolean;
  /** Toạ độ tham khảo thuần (cơ chế cũ) — luôn có khi toạ độ hợp lệ, dùng làm lựa chọn phụ. */
  referencePin: MapLink;
  /** Chỉ đường tới đúng toạ độ (kèm Place ID nếu có). */
  directions: MapLink;
}

const TEXT: Record<Locale, { search: string; profile: string; pin: string; directions: string; noAddressContext: string }> = {
  vi: {
    search: 'Tìm trên Google Maps →',
    profile: 'Xem trên Google Maps →',
    pin: 'Xem toạ độ tham khảo',
    directions: 'Chỉ đường →',
    noAddressContext: 'Phú Quốc, Việt Nam',
  },
  en: {
    search: 'Find on Google Maps →',
    profile: 'View on Google Maps →',
    pin: 'View reference location',
    directions: 'Directions →',
    noAddressContext: 'Phú Quốc, Vietnam',
  },
};

/** `null` khi toạ độ không hợp lệ (cùng gate `isValidCoord` các trang đang dùng) — không có gì để dựng link. */
export function getPlaceMapLinks(input: PlaceMapLinkInput, locale: Locale): PlaceMapLinks | null {
  if (!isValidCoord(input.lng, input.lat)) return null;
  const t = TEXT[locale];
  const coord = `${input.lat},${input.lng}`;
  // Lỗi thật phát hiện 16/10/2026 (owner, duyệt gói 9f5b95b): khi KHÔNG có địa chỉ, truy vấn trước
  // đây chỉ dùng tên trần (vd. "Bãi Sao") — dễ trùng với địa điểm cùng tên ở nơi khác trên Google
  // Maps. Khi có địa chỉ thật (đã xác nhận với Novotel/Ra Khơi), địa chỉ luôn đã kèm quận/thành
  // phố/tỉnh nên đủ ngữ cảnh, không cần thêm. Chỉ bù ngữ cảnh "Phú Quốc" cho nhánh không có địa chỉ.
  const queryText = input.address ? `${input.name}, ${input.address}` : `${input.name}, ${t.noAddressContext}`;
  const encodedQuery = encodeURIComponent(queryText);

  const referencePin: MapLink = {
    url: `https://www.google.com/maps?q=${coord}`,
    label: t.pin,
  };

  if (input.googlePlaceId) {
    const placeId = encodeURIComponent(input.googlePlaceId);
    return {
      primary: {
        url: `https://www.google.com/maps/search/?api=1&query=${encodedQuery}&query_place_id=${placeId}`,
        label: t.profile,
      },
      primaryCertain: true,
      referencePin,
      directions: {
        url: `https://www.google.com/maps/dir/?api=1&destination=${coord}&destination_place_id=${placeId}`,
        label: t.directions,
      },
    };
  }

  return {
    primary: {
      url: `https://www.google.com/maps/search/?api=1&query=${encodedQuery}`,
      label: t.search,
    },
    primaryCertain: false,
    referencePin,
    directions: {
      url: `https://www.google.com/maps/dir/?api=1&destination=${coord}`,
      label: t.directions,
    },
  };
}
