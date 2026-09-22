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
  | 'checksum_mismatch'
  | 'content_signature_mismatch';

// M1 (launch-readiness pass, 2026-09-22) — server-side file-type validation. Until this,
// `content_type_mismatch` above only compared the CLIENT-DECLARED `content_type` at presign time
// against the CLIENT-DECLARED `Content-Type` header the browser sent on the actual PUT — both
// values originate with the uploader, so a PNG renamed `.jpg` and PUT with a forged
// `Content-Type: image/jpeg` header sailed straight through. This checks the ACTUAL FIRST BYTES OF
// THE OBJECT, which the uploader does not control once the object is at rest in S3/MinIO.
//
// Signatures only for the three MIME types PresignMediaDto.content_type accepts
// (ALLOWED_MEDIA_MIME_TYPES in modules/media/dto/media.dto.ts) — this module intentionally does
// not import that feature-module DTO (core/ stays feature-agnostic); the literal union here is the
// same three strings, kept in sync by the e2e/unit tests that exercise both.
const WEBP_HEADER_BYTES = 12; // 'RIFF' (0..3) + 4-byte chunk size (4..7) + 'WEBP' (8..11)

export function detectImageSignature(header: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    header.length >= 8 &&
    header[0] === 0x89 &&
    header[1] === 0x50 &&
    header[2] === 0x4e &&
    header[3] === 0x47 &&
    header[4] === 0x0d &&
    header[5] === 0x0a &&
    header[6] === 0x1a &&
    header[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    header.length >= WEBP_HEADER_BYTES &&
    header.toString('ascii', 0, 4) === 'RIFF' &&
    header.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

export interface VerifyUploadedObjectParams {
  key: string;
  expectedContentType: string;
  expectedSize: number;
  expectedChecksumSha256: string;
}

export type VerifyUploadedObjectResult =
  | { ok: true }
  | { ok: false; reason: ObjectVerificationFailureReason };

export type DeleteForCleanupResult = { outcome: 'deleted' | 'not_found' };

// Internal signal only — never leaves computeChecksumByStreaming's caller (verifyUploadedObject
// maps it to a normal { ok: false, reason: 'too_large' } result, never an unhandled throw).
class StreamSizeExceededError extends Error {}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly nodeEnv: string;
  private readonly presignGetTtlSeconds: number;

  constructor(config: ConfigService) {
    const s3 = config.get<AppConfig['s3']>('s3')!;
    this.nodeEnv = config.get<string>('nodeEnv') ?? 'development';
    this.bucket = s3.bucket;
    this.presignGetTtlSeconds = s3.presignGetTtlSeconds;
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

  /**
   * Short-lived, signed GET URL for ONE object (Secure Private Media, 2026-08-10).
   *
   * REPLACES the deleted `getPublicUrl()`, which built an unauthenticated `S3_PUBLIC_URL/bucket/key`
   * URL. That URL only resolved because the production bucket carried a bucket-WIDE anonymous read
   * policy (`mc anonymous set download`), which grants `s3:ListBucket` as well as `s3:GetObject` —
   * i.e. anyone could enumerate every key in the bucket and fetch pending/hidden/rejected objects
   * that the API deliberately never links to. A signed URL needs no anonymous policy at all, so the
   * bucket can be fully private.
   *
   * Signed with the SAME `this.client` (and therefore the same endpoint) as
   * `createPresignedPutUrl()` below. That is deliberate and is what makes this safe to ship: SigV4
   * signs the Host header, so a presigned URL is only valid when fetched at the endpoint it was
   * signed for. Browser-side presigned PUT already works in production against that exact endpoint,
   * which is direct evidence the same endpoint is browser-reachable and signature-preserving for
   * GET too — rather than introducing a second, unproven signing origin.
   *
   * Provider-agnostic: `GetObjectCommand` + `getSignedUrl` behave identically on MinIO, AWS S3 and
   * Cloudflare R2, so the R2 migration path is unchanged. Credentials never appear in the result —
   * a presigned URL carries only a derived signature, never the secret key. Callers must still treat
   * the returned URL as sensitive (it is a bearer capability for its TTL) and never log it.
   */
  async createPresignedGetUrl(key: string, expiresInSeconds?: number): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, command, {
      expiresIn: expiresInSeconds ?? this.presignGetTtlSeconds,
    });
  }

  get presignGetTtl(): number {
    return this.presignGetTtlSeconds;
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
    // Populated only on the streaming path (a side effect of bytes already being read there) —
    // stays null on the HEAD-trustworthy-checksum path until/unless the checksum actually
    // matches, so a mismatched checksum never pays for a header fetch it won't need.
    let header: Buffer | null = null;
    if (trustworthyChecksum) {
      actualChecksum = trustworthyChecksum;
    } else {
      try {
        const streamed = await this.computeChecksumByStreaming(params.key);
        actualChecksum = streamed.checksum;
        header = streamed.header;
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

    // M1: the object's ACTUAL bytes now must match the type it claims to be — a check the
    // client-declared Content-Type comparison above (content_type_mismatch) cannot provide,
    // because both sides of that comparison are client-supplied. `header` is only still null here
    // on the HEAD-trustworthy-checksum path (currently dead in practice — see doc comment above).
    if (!header) {
      header = await this.fetchHeaderBytes(params.key);
    }
    if (detectImageSignature(header) !== params.expectedContentType) {
      await this.deleteObject(params.key);
      return { ok: false, reason: 'content_signature_mismatch' };
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

  /**
   * Media Orphan Cleanup (2026-08-02): unlike deleteObject() above (best-effort, swallows all
   * errors), this caller needs the three outcomes distinguished — the cleanup job must only
   * soft-delete the DB row after a CONFIRMED 'deleted' or 'not_found' outcome, and must leave the
   * row untouched on any other error (network/permission/etc.), per the approved execution plan.
   *
   * HEAD-first, THEN delete — discovered necessary via live e2e testing against real MinIO:
   * S3's DeleteObject API is itself idempotent and does NOT error on a missing key (it returns a
   * plain success regardless, by design — unlike HeadObject/GetObject, which do throw NotFound).
   * A naive "try DeleteObject, catch NotFound" therefore can never actually observe a 'not_found'
   * outcome. HeadObject is the only reliable existence check (same technique already used by
   * verifyUploadedObject() above) — only call DeleteObjectCommand once HEAD confirms the object is
   * really there. A 'not_found' result is treated as an already-clean object (idempotent reruns,
   * concurrent cleanup runs racing on the same key) — not an error. (A narrow HEAD-then-DELETE
   * race is possible — another process could delete the object in between — but S3 DELETE being
   * idempotent means that race just reports 'deleted' instead of 'not_found' for that one call;
   * no data loss, no incorrect DB write either way.)
   */
  async deleteObjectForCleanup(key: string): Promise<DeleteForCleanupResult> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (err) {
      if (this.isNotFound(err)) return { outcome: 'not_found' };
      throw err;
    }
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    return { outcome: 'deleted' };
  }

  // Streams the object body and hashes it WITHOUT ever buffering the whole payload — the running
  // byte count is checked on every chunk so an oversized object aborts mid-stream (defense in
  // depth beyond the HeadObject ContentLength check above, which a malicious/broken client could
  // in principle misreport).
  // M1: also captures the first WEBP_HEADER_BYTES bytes for detectImageSignature() — a side
  // effect of bytes the stream is already reading, not an extra request. This is the path every
  // real upload takes today (see verifyUploadedObject's doc comment on why the HEAD-checksum
  // branch is currently dead), so this is where the signature check matters in practice.
  private async computeChecksumByStreaming(key: string): Promise<{ checksum: string; header: Buffer }> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const body = res.Body as Readable;
    const hash = createHash('sha256');
    const headerChunks: Buffer[] = [];
    let headerBytes = 0;
    let bytesRead = 0;
    for await (const chunk of body) {
      const buf = chunk as Buffer;
      bytesRead += buf.length;
      if (bytesRead > MAX_OBJECT_BYTES) {
        body.destroy();
        throw new StreamSizeExceededError('Object exceeded the 10 MiB ceiling while streaming');
      }
      if (headerBytes < WEBP_HEADER_BYTES) {
        headerChunks.push(buf.subarray(0, WEBP_HEADER_BYTES - headerBytes));
        headerBytes += buf.length;
      }
      hash.update(buf);
    }
    return { checksum: hash.digest('hex'), header: Buffer.concat(headerChunks) };
  }

  // M1: only path reached when HeadObject already returned a trustworthy checksum — no stream was
  // read, so there's no header captured yet. Ranged GET so a signature check never costs a full
  // second download. Documented as currently-dead in practice (see verifyUploadedObject), so this
  // has no live test coverage beyond the unit-mocked branch — kept correct for when it does engage.
  private async fetchHeaderBytes(key: string): Promise<Buffer> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: `bytes=0-${WEBP_HEADER_BYTES - 1}` }),
    );
    const body = res.Body as Readable;
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks);
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
