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
import { StorageService } from './storage.service';

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

    it('HEAD có ChecksumSHA256 đáng tin cậy, khớp expected → { ok: true }, KHÔNG gọi GetObject', async () => {
      const expectedHex = 'b'.repeat(64);
      const base64OfExpected = Buffer.from(expectedHex, 'hex').toString('base64');
      mockSend.mockResolvedValueOnce({
        ContentLength: 1000,
        ContentType: 'image/jpeg',
        ChecksumSHA256: base64OfExpected,
      });
      const sut = new StorageService(makeConfig());
      const res = await sut.verifyUploadedObject({ ...baseParams, expectedChecksumSha256: expectedHex });
      expect(res).toEqual({ ok: true });
      expect(mockSend).toHaveBeenCalledTimes(1); // chỉ HEAD, không GET, không Delete
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

    it('HEAD KHÔNG có checksum → fallback GET+stream+SHA-256, khớp → { ok: true }', async () => {
      const { Readable } = jest.requireActual('stream');
      const content = Buffer.from('hello world, this is a fake jpeg body');
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

  describe('getPublicUrl', () => {
    it('forcePathStyle=true → publicUrl/bucket/objectKey', () => {
      const sut = new StorageService(makeConfig());
      expect(sut.getPublicUrl('media/abc.jpg')).toBe('http://localhost:9000/phuquochub-test/media/abc.jpg');
    });

    it('forcePathStyle=false → publicUrl/objectKey (không chèn bucket vào path)', () => {
      const sut = new StorageService(
        makeConfig({
          s3: {
            endpoint: 'http://localhost:9000',
            region: 'us-east-1',
            accessKeyId: 'minioadmin',
            secretAccessKey: 'minioadmin',
            bucket: 'phuquochub-test',
            forcePathStyle: false,
            publicUrl: 'https://media.phuquochub.com',
          },
        }),
      );
      expect(sut.getPublicUrl('media/abc.jpg')).toBe('https://media.phuquochub.com/media/abc.jpg');
    });

    it('production origin (S3_PUBLIC_URL=https://media.phuquochub.com) — trailing slash bị bỏ, không lộ endpoint nội bộ', () => {
      const sut = new StorageService(
        makeConfig({
          s3: {
            endpoint: 'http://minio:9000', // docker-internal — KHÔNG được xuất hiện trong kết quả
            region: 'us-east-1',
            accessKeyId: 'minioadmin',
            secretAccessKey: 'minioadmin',
            bucket: 'phuquochub-prod',
            forcePathStyle: true,
            publicUrl: 'https://media.phuquochub.com/',
          },
        }),
      );
      const url = sut.getPublicUrl('media/43ac8a28-a2ed-4076-995c-8536f365f13e.jpg');
      expect(url).toBe('https://media.phuquochub.com/phuquochub-prod/media/43ac8a28-a2ed-4076-995c-8536f365f13e.jpg');
      expect(url).not.toContain('minio:9000');
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
