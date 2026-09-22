import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { apiGetAuth, ApiError } from '@/lib/http';

// C1 (2026-09-22) — cơ chế invalidation THẬT sau khi bỏ `no-store` toàn site cho places (xem
// modules/places/api/places.api.ts). Dashboard gọi route này SAU KHI một mutation đã ghi thành
// công (không phải trước, không phải "chắc là thành công") với đúng danh sách tag bị ảnh hưởng.
//
// Xác thực: KHÔNG dùng shared secret tĩnh (secret đó sẽ phải nhúng vào bundle client, tức là công
// khai — không bảo vệ được gì). Thay vào đó xác minh CHÍNH access token JWT của người gọi bằng
// cách gọi thật `GET /users/me` qua API — tái dùng hạ tầng auth đã có (`apiGetAuth`, giống
// `fetchCapabilities`), không phát minh cơ chế xác thực mới. Bất kỳ tài khoản đã đăng nhập hợp lệ
// nào cũng gọi được — revalidateTag() chỉ buộc lần đọc công khai TIẾP THEO phải fetch lại, không
// làm lộ hay sửa dữ liệu, nên không cần khoá tới permission cụ thể như RBAC ghi dữ liệu thật.
const ALLOWED_TAG_PREFIXES = ['place:', 'places:'];

function isAllowedTag(tag: string): boolean {
  return typeof tag === 'string' && tag.length > 0 && tag.length <= 200 && ALLOWED_TAG_PREFIXES.some((p) => tag.startsWith(p));
}

export async function POST(request: Request): Promise<NextResponse> {
  const authHeader = request.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;
  if (!token) {
    return NextResponse.json({ revalidated: false, error: 'Thiếu access token.' }, { status: 401 });
  }

  try {
    await apiGetAuth('/users/me', token, { cache: 'no-store' });
  } catch (err) {
    const status = err instanceof ApiError && err.status === 403 ? 403 : 401;
    return NextResponse.json({ revalidated: false, error: 'Access token không hợp lệ.' }, { status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ revalidated: false, error: 'Body phải là JSON.' }, { status: 400 });
  }

  const tags = (body as { tags?: unknown })?.tags;
  if (!Array.isArray(tags) || tags.length === 0 || tags.length > 20 || !tags.every(isAllowedTag)) {
    return NextResponse.json(
      { revalidated: false, error: 'tags phải là mảng 1-20 chuỗi, mỗi chuỗi bắt đầu bằng "place:" hoặc "places:".' },
      { status: 400 },
    );
  }

  for (const tag of tags as string[]) {
    // Next 16's revalidateTag() bắt buộc profile thứ hai (không còn single-arg như bản cũ hơn) —
    // `{ expire: 0 }` yêu cầu coi entry đang cache là hết hạn NGAY, không chờ một cache-life profile
    // đặt trước.
    revalidateTag(tag, { expire: 0 });
  }

  return NextResponse.json({ revalidated: true, tags });
}
