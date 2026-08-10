import { ConfigService } from '@nestjs/config';
import { MediaUrlService } from './media-url.service';

function makeConfig(api: Record<string, unknown>): ConfigService {
  return { get: (key: string) => (key === 'api' ? api : undefined) } as unknown as ConfigService;
}

describe('MediaUrlService', () => {
  it('dựng URL tuyệt đối trỏ về chính API theo publicUrl + globalPrefix', () => {
    const sut = new MediaUrlService(
      makeConfig({ port: 4000, globalPrefix: 'api', publicUrl: 'https://phuquochub.com' }),
    );

    expect(sut.fileUrl('43ac8a28-a2ed-4076-995c-8536f365f13e')).toBe(
      'https://phuquochub.com/api/media/43ac8a28-a2ed-4076-995c-8536f365f13e/file',
    );
  });

  it('tôn trọng API_GLOBAL_PREFIX tuỳ biến — không hard-code "/api"', () => {
    const sut = new MediaUrlService(
      makeConfig({ port: 4000, globalPrefix: 'v2', publicUrl: 'https://phuquochub.com' }),
    );

    expect(sut.fileUrl('abc')).toBe('https://phuquochub.com/v2/media/abc/file');
  });

  it('mặc định dev (localhost:4000) — web ở :3000 vẫn tải được ảnh vì URL là tuyệt đối', () => {
    const sut = new MediaUrlService(
      makeConfig({ port: 4000, globalPrefix: 'api', publicUrl: 'http://localhost:4000' }),
    );

    expect(sut.fileUrl('abc')).toBe('http://localhost:4000/api/media/abc/file');
  });

  /**
   * SECURITY (regression): đây là bất biến trung tâm của Secure Private Media — URL phát cho client
   * KHÔNG BAO GIỜ trỏ thẳng vào object storage nữa. Nếu ai đó vô tình khôi phục `getPublicUrl()`
   * hoặc trỏ base về S3_PUBLIC_URL, test này đỏ.
   */
  it('SECURITY: URL không trỏ tới object storage và không chứa bucket/object key', () => {
    const sut = new MediaUrlService(
      makeConfig({ port: 4000, globalPrefix: 'api', publicUrl: 'https://phuquochub.com' }),
    );

    const url = sut.fileUrl('43ac8a28-a2ed-4076-995c-8536f365f13e');

    expect(url).not.toContain('media.phuquochub.com');
    expect(url).not.toContain('minio');
    expect(url).not.toContain('phuquochub-prod');
    expect(url).not.toContain('.jpg');
    // Không mang chữ ký — URL ổn định, việc cấp phép xảy ra ở mỗi lần request tới endpoint này.
    expect(url).not.toContain('X-Amz-Signature');
  });
});
