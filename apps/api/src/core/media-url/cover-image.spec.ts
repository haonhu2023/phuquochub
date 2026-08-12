import { COVER_IMAGE_COLS, withCoverImageUrl, withCoverImageUrlOne } from './cover-image';
import type { MediaUrlService } from './media-url.service';

// Ảnh bìa Place — MỘT định nghĩa dùng chung cho cả 7 repository đọc card. File này ghim các vị từ
// BẢO MẬT của mảnh SQL đó tại đúng một chỗ (trước đây chuỗi này bị chép 7 lần nên có thể lệch nhau).
describe('cover-image — mảnh SQL dùng chung', () => {
  const compact = (s: string) => s.replace(/\s+/g, ' ').trim();

  it('chỉ lấy ảnh ĐÃ PUBLISHED — pending/rejected/hidden không bao giờ ra kênh công khai', () => {
    // Vị từ này xuất hiện ở CẢ HAI subquery (url legacy và id ảnh upload) — không nhánh nào hở.
    expect(compact(COVER_IMAGE_COLS).match(/m\.status = 'published'/g)).toHaveLength(2);
  });

  it('ảnh bìa PHẢI thuộc chính cơ sở đó (chặn cover_image_id trỏ chéo cơ sở khác)', () => {
    expect(compact(COVER_IMAGE_COLS).match(/m\.place_id = p\.id/g)).toHaveLength(2);
  });

  it('bỏ qua ảnh đã xoá mềm', () => {
    expect(compact(COVER_IMAGE_COLS).match(/m\.deleted_at IS NULL/g)).toHaveLength(2);
  });

  it('chỉ dựng URL API cho dòng có object_key thật (dòng nhúng ngoài không ký được URL)', () => {
    expect(compact(COVER_IMAGE_COLS)).toContain('m.object_key IS NOT NULL) AS cover_image_media_id');
  });

  // Nếu ai đó đổi alias, subquery sẽ tham chiếu sai bảng — ghim lại giả định.
  it('giả định bảng places được alias là `p`', () => {
    expect(compact(COVER_IMAGE_COLS)).toContain('m.id = p.cover_image_id');
  });
});

describe('withCoverImageUrl — phân giải URL ảnh bìa', () => {
  const mediaUrl = { fileUrl: (id: string) => `https://api.test/api/media/${id}/file` } as MediaUrlService;

  it('ảnh đã upload (url NULL) → URL API ổn định, KHÔNG phải địa chỉ object storage', () => {
    const row = withCoverImageUrlOne({ cover_image_url: null, cover_image_media_id: 'm1' }, mediaUrl);
    expect(row.cover_image_url).toBe('https://api.test/api/media/m1/file');
    expect(row.cover_image_url).not.toContain('minio');
    expect(row.cover_image_url).not.toContain('X-Amz-Signature');
  });

  it('dòng legacy có url đã lưu → giữ nguyên (không đổi ngữ nghĩa cũ)', () => {
    const row = withCoverImageUrlOne(
      { cover_image_url: 'https://cdn.example/legacy.jpg', cover_image_media_id: null },
      mediaUrl,
    );
    expect(row.cover_image_url).toBe('https://cdn.example/legacy.jpg');
  });

  it('không có ảnh bìa (hoặc ảnh bìa không còn đủ điều kiện) → null, không ném lỗi', () => {
    const row = withCoverImageUrlOne({ cover_image_url: null, cover_image_media_id: null }, mediaUrl);
    expect(row.cover_image_url).toBeNull();
  });

  // Cột nội bộ chỉ để tầng ứng dụng dựng URL — không thuộc hợp đồng công khai nào.
  it('gỡ cột nội bộ cover_image_media_id khỏi row', () => {
    const row = withCoverImageUrlOne({ cover_image_url: null, cover_image_media_id: 'm1' }, mediaUrl);
    expect('cover_image_media_id' in row).toBe(false);
    expect(JSON.stringify(row)).not.toContain('cover_image_media_id');
  });

  it('bản danh sách xử lý mọi row, giữ nguyên thứ tự và không truy vấn thêm', () => {
    const rows = withCoverImageUrl(
      [
        { cover_image_url: null, cover_image_media_id: 'a' },
        { cover_image_url: 'https://cdn/x.jpg', cover_image_media_id: null },
        { cover_image_url: null, cover_image_media_id: null },
      ],
      mediaUrl,
    );
    expect(rows.map((r) => r.cover_image_url)).toEqual([
      'https://api.test/api/media/a/file',
      'https://cdn/x.jpg',
      null,
    ]);
  });
});
