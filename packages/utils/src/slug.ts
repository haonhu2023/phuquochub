// Chuẩn hóa chuỗi tiếng Việt → slug an toàn cho URL (đặc thù Phú Quốc: nhiều dấu).
// Dùng cho slug Place/Category/Post. Bỏ dấu, hạ chữ thường, gạch nối.

const VIETNAMESE_MAP: Record<string, string> = {
  à: 'a', á: 'a', ả: 'a', ã: 'a', ạ: 'a',
  ă: 'a', ằ: 'a', ắ: 'a', ẳ: 'a', ẵ: 'a', ặ: 'a',
  â: 'a', ầ: 'a', ấ: 'a', ẩ: 'a', ẫ: 'a', ậ: 'a',
  è: 'e', é: 'e', ẻ: 'e', ẽ: 'e', ẹ: 'e',
  ê: 'e', ề: 'e', ế: 'e', ể: 'e', ễ: 'e', ệ: 'e',
  ì: 'i', í: 'i', ỉ: 'i', ĩ: 'i', ị: 'i',
  ò: 'o', ó: 'o', ỏ: 'o', õ: 'o', ọ: 'o',
  ô: 'o', ồ: 'o', ố: 'o', ổ: 'o', ỗ: 'o', ộ: 'o',
  ơ: 'o', ờ: 'o', ớ: 'o', ở: 'o', ỡ: 'o', ợ: 'o',
  ù: 'u', ú: 'u', ủ: 'u', ũ: 'u', ụ: 'u',
  ư: 'u', ừ: 'u', ứ: 'u', ử: 'u', ữ: 'u', ự: 'u',
  ỳ: 'y', ý: 'y', ỷ: 'y', ỹ: 'y', ỵ: 'y',
  đ: 'd',
};

/** Bỏ dấu tiếng Việt, giữ ký tự ASCII. */
export function removeVietnameseTones(input: string): string {
  return input
    .toLowerCase()
    .replace(/[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/g, (c) =>
      VIETNAMESE_MAP[c] ?? c,
    );
}

/** Sinh slug URL-safe: "Bãi Sao — Phú Quốc" → "bai-sao-phu-quoc". */
export function slugify(input: string): string {
  return removeVietnameseTones(input)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // dấu tổ hợp còn sót
    .replace(/[^a-z0-9\s-]/g, '') // bỏ ký tự không hợp lệ
    .trim()
    .replace(/[\s-]+/g, '-') // khoảng trắng/nhiều gạch → 1 gạch
    .replace(/^-+|-+$/g, ''); // bỏ gạch đầu/cuối
}
