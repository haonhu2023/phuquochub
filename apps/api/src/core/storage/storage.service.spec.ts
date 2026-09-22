import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';

const mockSend = jest.fn();
jest.mock('@aws-sdk/client-s3', () => {
  const actual = jest.requireActual('@aws-sdk/client-s3');
  return {
    ...actual,
    S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
  };
});

const mockGetSignedUrl = jest.fn();
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args: unknown[]) => mockGetSignedUrl(...args),
}));

// Import AFTER the jest.mock calls above so StorageService picks up the mocked S3Client.
import { StorageService, detectImageSignature } from './storage.service';

// M1 (2026-09-22) — real magic bytes, reused across the verifyUploadedObject tests below and the
// dedicated detectImageSignature() tests further down.
const JPEG_MAGIC_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG_MAGIC_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const WEBP_MAGIC_BYTES = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);

function makeConfig(overrides: Partial<Record<string, unknown>> = {}): ConfigService {
  const values: Record<string, unknown> = {
    nodeEnv: 'test',
    s3: {
      endpoint: 'http://localhost:9000',
      region: 'us-east-1',
      accessKeyId: 'minioadmin',
      secretAccessKey: 'minioadmin',
      bucket: 'phuquochub-test',
      forcePathStyle: true,
      publicUrl: 'http://localhost:9000',
      presignGetTtlSeconds: 300,
    },
    ...overrides,
  };
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('StorageService', () => {
  beforeEach(() => {
    mockSend.mockReset();
    mockGetSignedUrl.mockReset();
  });

  describe('onModuleInit — dev/test bucket bootstrap', () => {
    it('bucket already exists (HeadBucket succeeds) → không tạo lại', async () => {
      mockSend.mockResolvedValueOnce({}); // HeadBucketCommand ok
      const sut = new StorageService(makeConfig());
      await sut.onModuleInit();
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('bucket chưa tồn tại (HeadBucket 404) → tạo mới qua CreateBucketCommand', async () => {
      mockSend
        .mockRejectedValueOnce({ name: 'NotFound' })
        .mockResolvedValueOnce({});
      const sut = new StorageService(makeConfig());
      await sut.onModuleInit();
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('production → KHÔNG BAO GIỜ gọi HeadBucket/CreateBucket tự động', async () => {
      const sut = new StorageService(makeConfig({ nodeEnv: 'production' }));
      await sut.onModuleInit();
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('lỗi khác 404 (không phải NotFound) → ném lại, không nuốt lỗi', async () => {
      mockSend.mockRejectedValueOnce(new Error('network down'));
      const sut = new StorageService(makeConfig());
      await expect(sut.onModuleInit()).rejects.toThrow('network down');
    });
  });

  describe('createPresignedPutUrl', () => {
    it('trả về key/uploadUrl/expiresIn=600, không log URL (chỉ trả về)', async () => {
      mockGetSignedUrl.mockResolvedValue('https://minio.local/signed-put');
      const sut = new StorageService(makeConfig());
      const res = await sut.createPresignedPutUrl('media/abc.jpg', 'image/jpeg');
      expect(res).toEqual({ key: 'media/abc.jpg', uploadUrl: 'https://minio.local/signed-put', expiresIn: 600 });
      expect(mockGetSignedUrl).toHaveBeenCalledWith(expect.anything(), expect.anything(), { expiresIn: 600 });
    });
  });

  describe('verifyUploadedObject', () => {
    const baseParams = {
      key: 'media/abc.jpg',
      expectedContentType: 'image/jpeg',
      expectedSize: 1000,
      expectedChecksumSha256: 'a'.repeat(64),
    };

    it('object không tồn tại (HeadObject 404) → { ok: false, reason: missing }, không gọi Delete', async () => {
      mockSend.mockRejectedValueOnce({ name: 'NotFound' });
      const sut = new StorageService(makeConfig());
      const res = await sut.verifyUploadedObject(baseParams);
      expect(res).toEqual({ ok: false, reason: 'missing' });
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('object 0 byte → { ok: false, reason: zero_byte }, object bị xoá', async () => {
      mockSend
        .mockResolvedValueOnce({ ContentLength: 0, ContentType: 'image/jpeg' }) // HEAD
        .mockResolvedValueOnce({}); // DeleteObject
      const sut = new StorageService(makeConfig());
      const res = await sut.verifyUploadedObject(baseParams);
      expect(res).toEqual({ ok: false, reason: 'zero_byte' });
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('object > 10 MiB (theo HeadObject) → { ok: false, reason: too_large }, object bị xoá', async () => {
      mockSend
        .mockResolvedValueOnce({ ContentLength: 10 * 1024 * 1024 + 1, ContentType: 'image/jpeg' })
        .mockResolvedValueOnce({});
      const sut = new StorageService(makeConfig());
      const res = await sut.verifyUploadedObject(baseParams);
      expect(res).toEqual({ ok: false, reason: 'too_large' });
    });

    it('content_type khác khai báo → { ok: false, reason: content_type_mismatch }, object bị xoá', async () => {
      mockSend
        .mockResolvedValueOnce({ ContentLength: 1000, ContentType: 'image/png' })
        .mockResolvedValueOnce({});
      const sut = new StorageService(makeConfig());
      const res = await sut.verifyUploadedObject(baseParams);
      expect(res).toEqual({ ok: false, reason: 'content_type_mismatch' });
    });

    it('size thực tế khác size khai báo lúc presign → { ok: false, reason: size_mismatch }, object bị xoá', async () => {
      mockSend
        .mockResolvedValueOnce({ ContentLength: 999, ContentType: 'image/jpeg' })
        .mockResolvedValueOnce({});
      const sut = new StorageService(makeConfig());
      const res = await sut.verifyUploadedObject(baseParams);
      expect(res).toEqual({ ok: false, reason: 'size_mismatch' });
    });

    // M1 (2026-09-22): trước đây test này khẳng định KHÔNG gọi GetObject khi HEAD đã có checksum
    // đáng tin cậy — đúng ở thời điểm đó, nhưng checksum khớp không còn đủ: verifyUploadedObject
    // giờ còn phải xác nhận magic byte của chính nội dung object (detectImageSignature), thứ
    // HeadObject không cung cấp được. Trên nhánh HEAD-checksum (hiện chưa thật sự chạy trong thực
    // tế — xem doc comment fetchHeaderBytes), việc đó tốn đúng MỘT ranged GET bổ sung.
    it('HEAD có ChecksumSHA256 đáng tin cậy, khớp expected, magic byte đúng JPEG → { ok: true }', async () => {
      const expectedHex = 'b'.repeat(64);
      const base64OfExpected = Buffer.from(expectedHex, 'hex').toString('base64');
      const { Readable } = jest.requireActual('stream');
      mockSend
        .mockResolvedValueOnce({
          ContentLength: 1000,
          ContentType: 'image/jpeg',
          ChecksumSHA256: base64OfExpected,
        })
        .mockResolvedValueOnce({ Body: Readable.from([JPEG_MAGIC_BYTES]) }); // ranged GET cho header
      const sut = new StorageService(makeConfig());
      const res = await sut.verifyUploadedObject({ ...baseParams, expectedChecksumSha256: expectedHex });
      expect(res).toEqual({ ok: true });
      expect(mockSend).toHaveBeenCalledTimes(2); // HEAD + ranged GET (header), không Delete
    });

    it('HEAD có ChecksumSHA256 đáng tin cậy, khớp expected, nhưng magic byte KHÔNG khớp JPEG (nội dung thật là PNG) → content_signature_mismatch, object bị xoá', async () => {
      const expectedHex = 'b'.repeat(64);
      const base64OfExpected = Buffer.from(expectedHex, 'hex').toString('base64');
      const { Readable } = jest.requireActual('stream');
      mockSend
        .mockResolvedValueOnce({
          ContentLength: 1000,
          ContentType: 'image/jpeg',
          ChecksumSHA256: base64OfExpected,
        })
        .mockResolvedValueOnce({ Body: Readable.from([PNG_MAGIC_BYTES]) })
        .mockResolvedValueOnce({}); // DeleteObject
      const sut = new StorageService(makeConfig());
      const res = await sut.verifyUploadedObject({ ...baseParams, expectedChecksumSha256: expectedHex });
      expect(res).toEqual({ ok: false, reason: 'content_signature_mismatch' });
      expect(mockSend).toHaveBeenCalledTimes(3);
    });

    it('HEAD có ChecksumSHA256 nhưng KHÔNG khớp → { ok: false, reason: checksum_mismatch }, object bị xoá, không GET', async () => {
      const wrongBase64 = Buffer.from('c'.repeat(64), 'hex').toString('base64');
      mockSend
        .mockResolvedValueOnce({ ContentLength: 1000, ContentType: 'image/jpeg', ChecksumSHA256: wrongBase64 })
        .mockResolvedValueOnce({});
      const sut = new StorageService(makeConfig());
      const res = await sut.verifyUploadedObject(baseParams);
      expect(res).toEqual({ ok: false, reason: 'checksum_mismatch' });
      expect(mockSend).toHaveBeenCalledTimes(2); // HEAD + Delete, không GET
    });

    it('HEAD KHÔNG có checksum → fallback GET+stream+SHA-256, khớp, magic byte đúng JPEG → { ok: true }', async () => {
      const { Readable } = jest.requireActual('stream');
      // M1: nội dung PHẢI mở đầu bằng magic byte JPEG thật (FF D8 FF) — verifyUploadedObject giờ
      // xác nhận cả chữ ký byte, không chỉ checksum khớp.
      const content = Buffer.concat([JPEG_MAGIC_BYTES, Buffer.from('… fake jpeg body sau phần header')]);
      const expectedHex = createHash('sha256').update(content).digest('hex');
      const bodyStream = Readable.from([content]);
      mockSend
        .mockResolvedValueOnce({ ContentLength: content.length, ContentType: 'image/jpeg' }) // HEAD, no checksum
        .mockResolvedValueOnce({ Body: bodyStream }); // GetObject
      const sut = new StorageService(makeConfig());
      const res = await sut.verifyUploadedObject({
        key: 'media/abc.jpg',
        expectedContentType: 'image/jpeg',
        expectedSize: content.length,
        expectedChecksumSha256: expectedHex,
      });
      expect(res).toEqual({ ok: true });
      expect(mockSend).toHaveBeenCalledTimes(2); // HEAD + GET, không Delete
    });

    it('fallback stream: hash không khớp → { ok: false, reason: checksum_mismatch }, object bị xoá', async () => {
      const { Readable } = jest.requireActual('stream');
      const content = Buffer.from('actual bytes uploaded');
      const bodyStream = Readable.from([content]);
      mockSend
        .mockResolvedValueOnce({ ContentLength: content.length, ContentType: 'image/jpeg' })
        .mockResolvedValueOnce({ Body: bodyStream })
        .mockResolvedValueOnce({}); // DeleteObject
      const sut = new StorageService(makeConfig());
      const res = await sut.verifyUploadedObject({
        key: 'media/abc.jpg',
        expectedContentType: 'image/jpeg',
        expectedSize: content.length,
        expectedChecksumSha256: 'f'.repeat(64), // wrong on purpose
      });
      expect(res).toEqual({ ok: false, reason: 'checksum_mismatch' });
      expect(mockSend).toHaveBeenCalledTimes(3);
    });

    it('fallback stream: vượt 10 MiB khi đang đọc (dù HEAD báo size hợp lệ) → too_large, không buffer toàn bộ', async () => {
      const { Readable } = jest.requireActual('stream');
      // 3 chunk 4MiB mỗi cái = 12MiB thật, nhưng ta khai HEAD ContentLength giả là 1000 (dưới
      // ngưỡng) để mô phỏng client/HEAD báo sai — an toàn streaming phải tự bắt được, không tin
      // riêng ContentLength.
      const chunk = Buffer.alloc(4 * 1024 * 1024, 1);
      const bodyStream = Readable.from([chunk, chunk, chunk]);
      const destroySpy = jest.spyOn(bodyStream, 'destroy');
      mockSend
        .mockResolvedValueOnce({ ContentLength: 1000, ContentType: 'image/jpeg' })
        .mockResolvedValueOnce({ Body: bodyStream })
        .mockResolvedValueOnce({}); // DeleteObject
      const sut = new StorageService(makeConfig());
      const res = await sut.verifyUploadedObject({
        key: 'media/abc.jpg',
        expectedContentType: 'image/jpeg',
        expectedSize: 1000,
        expectedChecksumSha256: 'a'.repeat(64),
      });
      expect(res).toEqual({ ok: false, reason: 'too_large' });
      expect(destroySpy).toHaveBeenCalled();
    });
  });

  // Secure Private Media (2026-08-10). `getPublicUrl()` — which built an unauthenticated
  // `S3_PUBLIC_URL/bucket/key` URL and therefore REQUIRED a bucket-wide anonymous-read policy — is
  // deleted; these tests replace its suite. See the storage.service.ts doc comment.
  describe('createPresignedGetUrl', () => {
    it('ký GetObjectCommand đúng bucket/key và trả về URL đã ký', async () => {
      mockGetSignedUrl.mockResolvedValueOnce('https://signed.example/media/abc.jpg?X-Amz-Signature=deadbeef');
      const sut = new StorageService(makeConfig());

      const url = await sut.createPresignedGetUrl('media/abc.jpg');

      expect(url).toBe('https://signed.example/media/abc.jpg?X-Amz-Signature=deadbeef');
      const [, command] = mockGetSignedUrl.mock.calls[0] as [unknown, { input: Record<string, unknown> }];
      expect(command.input).toMatchObject({ Bucket: 'phuquochub-test', Key: 'media/abc.jpg' });
    });

    it('mặc định dùng TTL từ config (S3_PRESIGN_GET_TTL), không hard-code', async () => {
      mockGetSignedUrl.mockResolvedValueOnce('https://signed.example/x');
      const sut = new StorageService(
        makeConfig({
          s3: {
            endpoint: 'http://localhost:9000',
            region: 'us-east-1',
            accessKeyId: 'minioadmin',
            secretAccessKey: 'minioadmin',
            bucket: 'phuquochub-test',
            forcePathStyle: true,
            publicUrl: 'http://localhost:9000',
            presignGetTtlSeconds: 120,
          },
        }),
      );

      await sut.createPresignedGetUrl('media/abc.jpg');

      expect(mockGetSignedUrl).toHaveBeenCalledWith(expect.anything(), expect.anything(), { expiresIn: 120 });
      expect(sut.presignGetTtl).toBe(120);
    });

    it('TTL truyền tường minh ghi đè mặc định', async () => {
      mockGetSignedUrl.mockResolvedValueOnce('https://signed.example/x');
      const sut = new StorageService(makeConfig());

      await sut.createPresignedGetUrl('media/abc.jpg', 45);

      expect(mockGetSignedUrl).toHaveBeenCalledWith(expect.anything(), expect.anything(), { expiresIn: 45 });
    });

    it('SECURITY: ký bằng CÙNG client/endpoint với presigned PUT — không phát sinh origin thứ hai chưa được kiểm chứng', async () => {
      mockGetSignedUrl.mockResolvedValue('https://signed.example/x');
      const sut = new StorageService(makeConfig());

      await sut.createPresignedPutUrl('media/abc.jpg', 'image/jpeg');
      await sut.createPresignedGetUrl('media/abc.jpg');

      const [putClient] = mockGetSignedUrl.mock.calls[0] as [unknown];
      const [getClient] = mockGetSignedUrl.mock.calls[1] as [unknown];
      expect(getClient).toBe(putClient);
    });

    it('SECURITY: trả về NGUYÊN VĂN kết quả của getSignedUrl — service không tự ghép chuỗi credential vào URL', async () => {
      // Bảo đảm duy nhất về việc không lộ credential là ở CẤU TRÚC: toàn bộ việc dựng URL do AWS
      // SDK làm (chỉ nhúng chữ ký DẪN XUẤT), service không nối thêm gì từ config. Khẳng định
      // pass-through nguyên văn là cách kiểm chứng thật sự có ý nghĩa ở tầng unit test — một bản
      // sửa tương lai chuyển sang tự dựng URL thủ công (nguy cơ nhúng secret) sẽ làm test này đỏ.
      const signed = 'http://localhost:9000/phuquochub-test/media/abc.jpg?X-Amz-Signature=abc123';
      mockGetSignedUrl.mockResolvedValueOnce(signed);
      const sut = new StorageService(makeConfig());

      await expect(sut.createPresignedGetUrl('media/abc.jpg')).resolves.toBe(signed);
    });
  });

  describe('deleteObject', () => {
    it('lỗi khi xoá → nuốt lỗi (best-effort), không ném ra ngoài', async () => {
      mockSend.mockRejectedValueOnce(new Error('delete failed'));
      const sut = new StorageService(makeConfig());
      await expect(sut.deleteObject('media/abc.jpg')).resolves.toBeUndefined();
    });
  });

  describe('deleteObjectForCleanup', () => {
    // HEAD-first, rồi mới DELETE — DeleteObjectCommand tự thân idempotent, KHÔNG bao giờ báo lỗi
    // cho key không tồn tại (khác HeadObject/GetObject) — phát hiện qua e2e thật với MinIO. Chỉ
    // HEAD mới cho tín hiệu "not_found" đáng tin cậy.
    it('object tồn tại → HEAD rồi DELETE, { outcome: "deleted" }', async () => {
      mockSend.mockResolvedValueOnce({}); // HeadObject ok
      mockSend.mockResolvedValueOnce({}); // DeleteObject ok
      const sut = new StorageService(makeConfig());
      await expect(sut.deleteObjectForCleanup('media/abc.jpg')).resolves.toEqual({ outcome: 'deleted' });
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('object không tồn tại (HEAD NotFound) → { outcome: "not_found" }, KHÔNG gọi DeleteObject', async () => {
      mockSend.mockRejectedValueOnce({ name: 'NotFound' });
      const sut = new StorageService(makeConfig());
      await expect(sut.deleteObjectForCleanup('media/abc.jpg')).resolves.toEqual({ outcome: 'not_found' });
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('object không tồn tại (HEAD NoSuchKey) → { outcome: "not_found" }', async () => {
      mockSend.mockRejectedValueOnce({ name: 'NoSuchKey' });
      const sut = new StorageService(makeConfig());
      await expect(sut.deleteObjectForCleanup('media/abc.jpg')).resolves.toEqual({ outcome: 'not_found' });
    });

    it('object không tồn tại (HEAD 404 qua $metadata) → { outcome: "not_found" }', async () => {
      mockSend.mockRejectedValueOnce({ $metadata: { httpStatusCode: 404 } });
      const sut = new StorageService(makeConfig());
      await expect(sut.deleteObjectForCleanup('media/abc.jpg')).resolves.toEqual({ outcome: 'not_found' });
    });

    it('lỗi HEAD KHÁC (không phải not-found) → ném lại, KHÔNG gọi DeleteObject, KHÔNG nuốt lỗi', async () => {
      mockSend.mockRejectedValueOnce(new Error('network down'));
      const sut = new StorageService(makeConfig());
      await expect(sut.deleteObjectForCleanup('media/abc.jpg')).rejects.toThrow('network down');
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('HEAD ok nhưng DELETE lỗi → ném lại, KHÔNG nuốt lỗi', async () => {
      mockSend.mockResolvedValueOnce({}); // HeadObject ok
      mockSend.mockRejectedValueOnce(new Error('delete failed')); // DeleteObject lỗi
      const sut = new StorageService(makeConfig());
      await expect(sut.deleteObjectForCleanup('media/abc.jpg')).rejects.toThrow('delete failed');
    });
  });
});

// M1 (launch-readiness pass, 2026-09-22) — pure function, no S3 mock needed.
describe('detectImageSignature', () => {
  it('JPEG (FF D8 FF…) → image/jpeg', () => {
    expect(detectImageSignature(JPEG_MAGIC_BYTES)).toBe('image/jpeg');
  });

  it('PNG (89 50 4E 47 0D 0A 1A 0A…) → image/png', () => {
    expect(detectImageSignature(PNG_MAGIC_BYTES)).toBe('image/png');
  });

  it('WEBP (RIFF….WEBP) → image/webp', () => {
    expect(detectImageSignature(WEBP_MAGIC_BYTES)).toBe('image/webp');
  });

  it('RIFF nhưng KHÔNG phải WEBP (vd file .wav, RIFF....WAVE) → null', () => {
    const wav = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45]);
    expect(detectImageSignature(wav)).toBeNull();
  });

  it('PNG đổi tên .jpg (nội dung THẬT vẫn là PNG) → phát hiện đúng image/png, KHÔNG bị đánh lừa bởi tên file/content_type khai báo', () => {
    // Đây chính là kịch bản M1 phải chặn: kẻ tấn công đổi tên file + khai content_type=image/jpeg
    // khi presign, nhưng bytes thật của object vẫn là PNG. detectImageSignature chỉ nhìn BYTES,
    // không biết/không quan tâm content_type nào đã được khai báo.
    expect(detectImageSignature(PNG_MAGIC_BYTES)).toBe('image/png');
    expect(detectImageSignature(PNG_MAGIC_BYTES)).not.toBe('image/jpeg');
  });

  it('nội dung không phải ảnh (vd PDF %PDF-1.4) → null', () => {
    const pdf = Buffer.from('%PDF-1.4\n%âãÏÓ');
    expect(detectImageSignature(pdf)).toBeNull();
  });

  it('buffer rỗng → null, không ném lỗi', () => {
    expect(detectImageSignature(Buffer.alloc(0))).toBeNull();
  });

  it('buffer ngắn hơn chữ ký cần thiết (vd 2 byte, gần giống JPEG) → null, không đọc quá độ dài', () => {
    expect(detectImageSignature(Buffer.from([0xff, 0xd8]))).toBeNull();
  });
});
