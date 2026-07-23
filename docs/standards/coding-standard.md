# PhuQuocHub — Chuẩn viết code (Coding Standard)

## 1. Ngôn ngữ & công cụ

- **TypeScript** cho toàn bộ dự án (FE + BE), bật `strict: true`.
- **ESLint + Prettier** cấu hình chung tại `packages/config`.
- **Husky + lint-staged**: chạy lint/format trước khi commit.
- **EditorConfig**: thống nhất indent, charset, line ending.

## 2. Quy ước đặt tên

| Đối tượng | Quy ước | Ví dụ |
|---|---|---|
| Biến, hàm | camelCase | `getPlaceById` |
| Class, Type, Interface, Enum | PascalCase | `PlaceService`, `PlaceStatus` |
| Hằng số | UPPER_SNAKE_CASE | `MAX_PAGE_SIZE` |
| File component React | PascalCase | `MapContainer.tsx` |
| File khác (BE) | kebab-case | `places.service.ts` |
| Thư mục | kebab-case | `community-posts/` |
| Bảng / cột DB | snake_case | `community_posts`, `created_at` |
| Route API | kebab-case, số nhiều | `/community/posts` |

- Không dùng tiền tố `I` cho interface (`Place`, không `IPlace`).
- Boolean nên bắt đầu bằng `is/has/can`: `isActive`, `hasReview`.

## 3. Cấu trúc module (NestJS)

Mỗi module tự chứa (self-contained):
```
places/
├── places.module.ts
├── places.controller.ts      # chỉ nhận request, gọi service
├── places.service.ts         # logic nghiệp vụ
├── entities/                 # entity ORM
├── dto/                      # request/response DTO
├── repositories/             # truy vấn DB phức tạp
└── places.service.spec.ts    # test
```

**Nguyên tắc:**
- Controller **mỏng**, không chứa logic nghiệp vụ.
- Service chứa logic; truy vấn phức tạp tách ra repository.
- Không import chéo giữa các module qua đường dẫn nội bộ — chỉ qua module export.

## 4. DTO & Validation

- Mọi input từ client đi qua DTO với `class-validator`.
- DTO request và response tách riêng.
- Types dùng chung FE/BE đặt trong `packages/shared-types`.

```ts
// Ví dụ minh họa quy ước (không phải code sản phẩm)
export class CreatePlaceDto {
  @IsString() @MaxLength(200)
  name: string;

  @IsUUID()
  categoryId: string;

  @IsLatitude()  lat: number;
  @IsLongitude() lng: number;
}
```

## 5. Xử lý lỗi

- Ném exception qua các lớp của NestJS (`NotFoundException`, `BadRequestException`...).
- Một **Global Exception Filter** chuẩn hóa response lỗi theo envelope trong [api.md](../api/api.md).
- Mỗi lỗi nghiệp vụ có **mã lỗi (code)** ổn định, không chỉ message.
- Không nuốt lỗi im lặng; log đầy đủ context (không log dữ liệu nhạy cảm).

## 6. Frontend (Next.js)

- Component theo module trong `src/modules/`, UI dùng chung trong `src/components/ui`.
- Server-state dùng **React Query**; client-state dùng **Zustand**. Không lạm dụng global state.
- Ưu tiên **Server Components**; chỉ dùng `"use client"` khi cần tương tác.
- Không gọi API rải rác trong component — tập trung ở lớp `modules/*/api`.
- CSS: dùng một hệ thống nhất quán (vd Tailwind) + design tokens.

## 7. Async & Database

- Luôn `await` promise; không để promise "trôi".
- Dùng transaction cho thao tác ghi nhiều bảng liên quan.
- Không dùng `synchronize: true` ở production — chỉ migration.
- Truy vấn không gian đi qua `geo.service` (không rải raw SQL khắp nơi).

## 8. Bảo mật (bắt buộc)

- Không commit secret; dùng biến môi trường + `.env` (có `.env.example`).
- Hash mật khẩu bằng bcrypt/argon2.
- Validate & sanitize mọi input.
- Áp dụng RBAC qua Guard cho endpoint ghi.
- Tham số hóa truy vấn (tránh SQL injection).

## 9. Testing

| Loại | Công cụ | Phạm vi |
|---|---|---|
| Unit test | Jest | Service, hàm thuần |
| Integration | Jest + Testcontainers | Repository + DB thật |
| E2E API | Supertest | Luồng endpoint |
| E2E FE | Playwright | Luồng người dùng chính |

- Mục tiêu coverage cho logic nghiệp vụ lõi: ≥ 70%.
- Test đặt cạnh file nguồn (`*.spec.ts`).

## 10. Git & Quy trình

- **Branch:** `main` (production), `develop` (tích hợp), `feature/*`, `fix/*`, `chore/*`.
- **Commit:** theo [Conventional Commits](https://www.conventionalcommits.org):
  ```
  feat(places): thêm truy vấn địa điểm gần
  fix(auth): sửa refresh token hết hạn
  docs(api): cập nhật endpoint geo
  ```
- **Pull Request:** bắt buộc review ≥ 1 người; CI (lint + test + build) phải xanh.
- PR nhỏ, một mục tiêu; mô tả rõ thay đổi và cách kiểm thử.

## 11. Comment & Tài liệu

- Comment giải thích **tại sao**, không mô tả lại code làm gì.
- Hàm/public API phức tạp có JSDoc ngắn gọn.
- Cập nhật tài liệu trong `docs/` khi thay đổi contract hoặc kiến trúc.

## 12. Hiệu năng

- Cache dữ liệu đọc nhiều qua Redis (xem [architecture.md](../architecture/architecture.md)).
- Phân trang bắt buộc cho danh sách; không trả toàn bộ bảng.
- Đánh index cho cột lọc/sắp xếp thường dùng và cột `geometry`.
- Tránh N+1 query (dùng join/eager hợp lý).

---

*Tài liệu liên quan: [architecture.md](../architecture/architecture.md), [api.md](../api/api.md)*
