import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHash } from 'crypto';
import type { Readable } from 'stream';
import type { AppConfig } from '../config/configuration';

// Media Upload Foundation (design review, 2026-07-30). S3-compatible object storage — MUST work
// identically against MinIO (dev), AWS S3, and Cloudflare R2 (all three speak the same S3 API).
// AWS SDK types (S3Client, *Command, StreamingBlobPayloadOutputTypes) never leave this file —
// every public method here returns a plain, provider-agnostic shape.

const MAX_OBJECT_BYTES = 10 * 1024 * 1024; // 10 MiB — matches PresignMediaDto's declared-size ceiling.
const PRESIGN_EXPIRES_IN_SECONDS = 600;

export interface PresignedUpload {
  key: string;
  uploadUrl: string;
  expiresIn: number;
}

export type ObjectVerificationFailureReason =
  | 'missing'
  | 'zero_byte'
  | 'too_large'
  | 'content_type_mismatch'
  | 'size_mismatch'
  | 'checksum_mismatch';

export interface VerifyUploadedObjectParams {
  key: string;
  expectedContentType: string;
  expectedSize: number;
  expectedChecksumSha256: string;
}

export type VerifyUploadedObjectResult =
  | { ok: true }
  | { ok: false; reason: ObjectVerificationFailureReason };

// Internal signal only — never leaves computeChecksumByStreaming's caller (verifyUploadedObject
// maps it to a normal { ok: false, reason: 'too_large' } result, never an unhandled throw).
class StreamSizeExceededError extends Error {}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly nodeEnv: string;

  constructor(config: ConfigService) {
    const s3 = config.get<AppConfig['s3']>('s3')!;
    this.nodeEnv = config.get<string>('nodeEnv') ?? 'development';
    this.bucket = s3.bucket;
    this.client = new S3Client({
      endpoint: s3.endpoint,
      region: s3.region,
      credentials: { accessKeyId: s3.accessKeyId, secretAccessKey: s3.secretAccessKey },
      forcePathStyle: s3.forcePathStyle,
    });
  }

  // Dev/test convenience ONLY — never runs in production, never touches an existing bucket
  // beyond a HeadBucket check. Production buckets (real R2/S3) are provisioned out-of-band; this
  // milestone explicitly excludes production R2 configuration.
  async onModuleInit(): Promise<void> {
    if (this.nodeEnv === 'production') return;
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch (err) {
      if (!this.isNotFound(err)) throw err;
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Created missing dev/test bucket "${this.bucket}"`);
    }
  }

  get bucketName(): string {
    return this.bucket;
  }

  // Presigned PUT deliberately does NOT request a checksum trailer (ChecksumAlgorithm) — doing so
  // would require every uploading client to compute and send matching x-amz-checksum-sha256
  // request headers just to satisfy the presigned URL's signature, which is unnecessary friction
  // given no frontend upload UI exists yet (backend-only scope). Object integrity is instead
  // enforced entirely post-hoc by verifyUploadedObject() below. Never logged — callers must not
  // log the returned uploadUrl either.
  async createPresignedPutUrl(key: string, contentType: string): Promise<PresignedUpload> {
    const command = new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType });
    const uploadUrl = await getSignedUrl(this.client, command, { expiresIn: PRESIGN_EXPIRES_IN_SECONDS });
    return { key, uploadUrl, expiresIn: PRESIGN_EXPIRES_IN_SECONDS };
  }

  /**
   * verifyUploadedObject — HeadObject first; if a trustworthy (server-validated) SHA-256 is
   * already available from HEAD, compare it directly. Otherwise GET the object and stream+hash it
   * server-side. On any mismatch, the object is deleted and the caller must not create a DB row.
   *
   * "Trustworthy" HEAD checksum means S3-native ChecksumSHA256 (server-computed and validated at
   * PUT time against the real bytes) — NOT a client-suppliable metadata tag, which would let a
   * malicious client fake a match while uploading different bytes. Because createPresignedPutUrl
   * above does not request a checksum trailer, HeadObject will not populate ChecksumSHA256 in
   * practice for objects uploaded through this flow — every real upload in this milestone verifies
   * via the streaming fallback (§8/9 below). The HEAD-checksum branch is still implemented and
   * would engage automatically if a client's SDK independently supplies a validated checksum, or a
   * future milestone opts into requesting one — same method, no caller-visible change needed then.
   */
  async verifyUploadedObject(params: VerifyUploadedObjectParams): Promise<VerifyUploadedObjectResult> {
    let head;
    try {
      head = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: params.key, ChecksumMode: 'ENABLED' }),
      );
    } catch (err) {
      if (this.isNotFound(err)) return { ok: false, reason: 'missing' };
      throw err;
    }

    const size = head.ContentLength ?? 0;
    if (size === 0) {
      await this.deleteObject(params.key);
      return { ok: false, reason: 'zero_byte' };
    }
    if (size > MAX_OBJECT_BYTES) {
      await this.deleteObject(params.key);
      return { ok: false, reason: 'too_large' };
    }
    if ((head.ContentType ?? '') !== params.expectedContentType) {
      await this.deleteObject(params.key);
      return { ok: false, reason: 'content_type_mismatch' };
    }
    if (size !== params.expectedSize) {
      await this.deleteObject(params.key);
      return { ok: false, reason: 'size_mismatch' };
    }

    const trustworthyChecksum = this.decodeTrustworthyChecksum(head.ChecksumSHA256);
    let actualChecksum: string;
    if (trustworthyChecksum) {
      actualChecksum = trustworthyChecksum;
    } else {
      try {
        actualChecksum = await this.computeChecksumByStreaming(params.key);
      } catch (err) {
        if (err instanceof StreamSizeExceededError) {
          await this.deleteObject(params.key);
          return { ok: false, reason: 'too_large' };
        }
        throw err;
      }
    }

    if (actualChecksum !== params.expectedChecksumSha256) {
      await this.deleteObject(params.key);
      return { ok: false, reason: 'checksum_mismatch' };
    }
    return { ok: true };
  }

  async deleteObject(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (err) {
      // Best-effort — an orphaned rejected object is a minor cleanup concern (see
      // docs/data/modules/media.md "Orphan handling"), never worth failing the caller's request.
      this.logger.warn(`Failed to delete object "${key}": ${(err as Error).message}`);
    }
  }

  // Streams the object body and hashes it WITHOUT ever buffering the whole payload — the running
  // byte count is checked on every chunk so an oversized object aborts mid-stream (defense in
  // depth beyond the HeadObject ContentLength check above, which a malicious/broken client could
  // in principle misreport).
  private async computeChecksumByStreaming(key: string): Promise<string> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const body = res.Body as Readable;
    const hash = createHash('sha256');
    let bytesRead = 0;
    for await (const chunk of body) {
      const buf = chunk as Buffer;
      bytesRead += buf.length;
      if (bytesRead > MAX_OBJECT_BYTES) {
        body.destroy();
        throw new StreamSizeExceededError('Object exceeded the 10 MiB ceiling while streaming');
      }
      hash.update(buf);
    }
    return hash.digest('hex');
  }

  private decodeTrustworthyChecksum(base64ChecksumSha256: string | undefined): string | null {
    if (!base64ChecksumSha256) return null;
    return Buffer.from(base64ChecksumSha256, 'base64').toString('hex').toLowerCase();
  }

  private isNotFound(err: unknown): boolean {
    const e = err as { name?: string; $metadata?: { httpStatusCode?: number } } | undefined;
    return e?.name === 'NotFound' || e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404;
  }
}
