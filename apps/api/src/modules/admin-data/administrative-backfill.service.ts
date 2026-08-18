import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PlacesRepository } from '../places/repositories/places.repository';
import { PlacesService } from '../places/places.service';
import { RevisionOrigin } from '../revisions/revision.enums';
import { RevisionsService } from '../revisions/revisions.service';
import { SourcesRepository } from '../sources/repositories/sources.repository';
import { SourceAttributionsRepository } from '../sources/repositories/source-attributions.repository';
import { SourceKind, SourceType } from '../sources/sources.enums';
import { VerificationsService } from '../verifications/verifications.service';
import { VerificationMethod } from '../verifications/verification.enums';
import {
  ADMINISTRATIVE_BACKFILL_SOURCE,
  ADMINISTRATIVE_BACKFILL_TARGETS,
  type AdministrativeBackfillTarget,
} from './administrative-backfill.manifest';

/**
 * Administrative Data Backfill (2026-08-18). Ghi `places.province`/`places.admin_area` cho danh
 * sách trong `administrative-backfill.manifest.ts`, đi qua ĐÚNG các luồng đã có — không tạo bảng
 * hay field mới, không bypass state machine nào:
 *
 *  1. `PlacesService.update()` (origin=IMPORT) — PATCH thật, tự sinh `wiki_revisions` (WF-14).
 *  2. `source_attributions(entity_type='place_field')` — trích dẫn CẤP TỪNG TRƯỜNG, cho
 *     `province` và `admin_area` riêng biệt (source.md §5).
 *  3. `source_attributions(entity_type='wiki_revision')` — trích dẫn CẤP REVISION (source.md §6.1:
 *     "mỗi revision trích dẫn nguồn"), CHỈ khi bước 1 thực sự tạo ra một revision mới. Ở giai đoạn
 *     này KHÔNG có job tự động "materialize" attribution cấp field từ revision đã duyệt (tài liệu
 *     hoá là việc của Sprint 4) — script này làm cả hai lớp trực tiếp thay vì chờ job chưa tồn tại.
 *  4. `VerificationsService.ensureOfficialFromClaim()` (method=SOURCE_MATCH) — CÙNG cơ chế
 *     "CLAIM -> SOURCE -> VERIFICATION" mà BusinessClaimsService dùng khi duyệt claim, tái sử dụng
 *     nguyên vẹn (không viết lại state machine): no-op nếu đã `official`, tạo/gửi lại verification
 *     nếu cần, rồi transition — tất cả trong MỘT transaction do CHÍNH phương thức đó quản lý.
 *
 * KHÔNG ATOMIC XUYÊN SUỐT BỐN BƯỚC: `PlacesRepository.updateScalars()` và
 * `SourceAttributionsRepository.save()` không nhận `EntityManager` của caller (khác
 * `SourcesRepository.save()` — đã có tiền lệ nhận `manager` tùy chọn), nên không gộp được cả bốn
 * bước vào một transaction duy nhất mà không sửa các repository đó (ngoài phạm vi cần thiết cho
 * task này). Bù lại bằng THIẾT KẾ IDEMPOTENT: mỗi bước tự kiểm tra "đã làm chưa" trước khi ghi, nên
 * chạy lại sau một lần dừng giữa chừng sẽ tự hoàn tất phần còn thiếu mà không tạo bản ghi trùng.
 */

export interface AdministrativeBackfillPlaceResult {
  slug: string;
  placeId: string | null;
  outcome: 'not_found' | 'already_correct' | 'patched' | 'error';
  provinceBefore: string | null;
  provinceAfter: string | null;
  adminAreaBefore: string | null;
  adminAreaAfter: string | null;
  revisionCreated: boolean;
  revisionId: string | null;
  placeFieldAttributionsCreated: number;
  placeFieldAttributionsAlreadyPresent: number;
  wikiRevisionAttributionCreated: boolean;
  verificationOutcome: 'official_created' | 'already_official_noop' | 'skipped_dry_run' | null;
  /** Snapshot của các trường NGOÀI phạm vi backfill (Section 13) — dùng để chứng minh không đổi. */
  preservedSnapshot: {
    name: string;
    categoryId: string;
    lat: number;
    lng: number;
    address: string | null;
    ward: string | null;
  } | null;
  error?: string;
}

export interface AdministrativeBackfillSummary {
  dryRun: boolean;
  actorId: string;
  sourceId: string | null;
  sourceCreated: boolean;
  totalTargets: number;
  processed: number;
  patched: number;
  alreadyCorrect: number;
  notFound: number;
  errors: number;
  revisionsCreated: number;
  placeFieldAttributionsCreated: number;
  placeFieldAttributionsAlreadyPresent: number;
  wikiRevisionAttributionsCreated: number;
  verificationsOfficialCreated: number;
  verificationsAlreadyOfficial: number;
  results: AdministrativeBackfillPlaceResult[];
  durationMs: number;
}

const PLACE_FIELD_ENTITY_TYPE = 'place_field';
const WIKI_REVISION_ENTITY_TYPE = 'wiki_revision';
const ADMIN_FIELDS = ['province', 'admin_area'] as const;

@Injectable()
export class AdministrativeBackfillService {
  private readonly logger = new Logger(AdministrativeBackfillService.name);

  constructor(
    private readonly placesRepo: PlacesRepository,
    private readonly placesService: PlacesService,
    private readonly revisionsService: RevisionsService,
    private readonly sourcesRepo: SourcesRepository,
    private readonly attributionsRepo: SourceAttributionsRepository,
    private readonly verificationsService: VerificationsService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async backfill(options: {
    actorId: string;
    dryRun?: boolean;
    targets?: readonly AdministrativeBackfillTarget[];
  }): Promise<AdministrativeBackfillSummary> {
    const start = Date.now();
    const dryRun = options.dryRun ?? false;
    const targets = options.targets ?? ADMINISTRATIVE_BACKFILL_TARGETS;

    const { sourceId, sourceCreated } = await this.ensureSource(dryRun);

    const results: AdministrativeBackfillPlaceResult[] = [];
    for (const target of targets) {
      results.push(await this.processOne(target, sourceId, options.actorId, dryRun));
    }

    const summary: AdministrativeBackfillSummary = {
      dryRun,
      actorId: options.actorId,
      sourceId,
      sourceCreated,
      totalTargets: targets.length,
      processed: results.length,
      patched: results.filter((r) => r.outcome === 'patched').length,
      alreadyCorrect: results.filter((r) => r.outcome === 'already_correct').length,
      notFound: results.filter((r) => r.outcome === 'not_found').length,
      errors: results.filter((r) => r.outcome === 'error').length,
      revisionsCreated: results.filter((r) => r.revisionCreated).length,
      placeFieldAttributionsCreated: results.reduce((n, r) => n + r.placeFieldAttributionsCreated, 0),
      placeFieldAttributionsAlreadyPresent: results.reduce(
        (n, r) => n + r.placeFieldAttributionsAlreadyPresent,
        0,
      ),
      wikiRevisionAttributionsCreated: results.filter((r) => r.wikiRevisionAttributionCreated).length,
      verificationsOfficialCreated: results.filter((r) => r.verificationOutcome === 'official_created').length,
      verificationsAlreadyOfficial: results.filter((r) => r.verificationOutcome === 'already_official_noop')
        .length,
      results,
      durationMs: Date.now() - start,
    };
    return summary;
  }

  /**
   * Find-or-create MỘT dòng `sources` dùng chung cho toàn bộ manifest (không nhân bản nguồn cho
   * từng place — Section 8). Dedupe theo `(type, external_ref)`, đúng cơ chế
   * `SourcesRepository.findByTypeAndExternalRef()` đã có sẵn cho việc này.
   */
  private async ensureSource(dryRun: boolean): Promise<{ sourceId: string | null; sourceCreated: boolean }> {
    const existing = await this.sourcesRepo.findByTypeAndExternalRef(
      SourceType.GOVERNMENT,
      ADMINISTRATIVE_BACKFILL_SOURCE.externalRef,
    );
    if (existing) {
      return { sourceId: existing.id, sourceCreated: false };
    }
    if (dryRun) {
      // Dry-run không tạo gì — báo cáo rõ ràng "chưa có, một lần chạy thật sẽ tạo".
      return { sourceId: null, sourceCreated: false };
    }
    const saved = await this.sourcesRepo.save(
      this.sourcesRepo.create({
        type: SourceType.GOVERNMENT,
        kind: SourceKind.URL,
        title: ADMINISTRATIVE_BACKFILL_SOURCE.title,
        url: ADMINISTRATIVE_BACKFILL_SOURCE.url,
        externalRef: ADMINISTRATIVE_BACKFILL_SOURCE.externalRef,
        publisher: ADMINISTRATIVE_BACKFILL_SOURCE.publisher,
        authorUserId: null,
        license: null,
        // Không truyền reliability → SourcesService thường dùng SOURCE_TYPE_DEFAULT_RELIABILITY;
        // ở đây gọi repository trực tiếp (không qua SourcesService.createSource(), vì cần
        // findByTypeAndExternalRef trước — SourcesService không có việc đó) nên set tường minh.
        reliability: 95,
        language: ADMINISTRATIVE_BACKFILL_SOURCE.language,
        retrievedAt: new Date(ADMINISTRATIVE_BACKFILL_SOURCE.retrievedAt),
        metadata: { backfill: 'administrative-data-2026-08-18' },
      }),
    );
    return { sourceId: saved.id, sourceCreated: true };
  }

  private async processOne(
    target: AdministrativeBackfillTarget,
    sourceId: string | null,
    actorId: string,
    dryRun: boolean,
  ): Promise<AdministrativeBackfillPlaceResult> {
    try {
      const place = await this.placesRepo.getDetailBySlug(target.slug);
      if (!place) {
        return {
          slug: target.slug,
          placeId: null,
          outcome: 'not_found',
          provinceBefore: null,
          provinceAfter: null,
          adminAreaBefore: null,
          adminAreaAfter: null,
          revisionCreated: false,
          revisionId: null,
          placeFieldAttributionsCreated: 0,
          placeFieldAttributionsAlreadyPresent: 0,
          wikiRevisionAttributionCreated: false,
          verificationOutcome: null,
          preservedSnapshot: null,
        };
      }

      const preservedSnapshot = {
        name: place.name,
        categoryId: place.category_id,
        lat: place.lat,
        lng: place.lng,
        address: place.address,
        ward: place.ward,
      };

      const needsPatch = place.province !== target.province || place.admin_area !== target.adminArea;
      let revisionCreated = false;
      let revisionId: string | null = null;

      if (needsPatch && !dryRun) {
        await this.placesService.update(
          place.id,
          { province: target.province, admin_area: target.adminArea },
          actorId,
          RevisionOrigin.IMPORT,
        );
        revisionCreated = true;
        // `update()` trả về PlaceCard, không phải revision — lấy revision MỚI NHẤT (đã sắp
        // `revision_number DESC`) thay vì đổi chữ ký `update()` (dùng chung bởi PATCH /places/:id
        // công khai; đổi shape trả về sẽ lan sang controller/contract ngoài phạm vi task này).
        const revisions = await this.revisionsService.listByPlace(place.id);
        revisionId = revisions[0]?.id ?? null;
      }

      // Cấp field: 2 attribution độc lập (province, admin_area), mỗi cái tự kiểm tra tồn tại
      // trước khi ghi — SourceAttributionsRepository.attachAttribution KHÔNG tự dedupe.
      let placeFieldAttributionsCreated = 0;
      let placeFieldAttributionsAlreadyPresent = 0;
      if (sourceId) {
        for (const field of ADMIN_FIELDS) {
          const already = await this.hasAttribution(PLACE_FIELD_ENTITY_TYPE, place.id, field, sourceId);
          if (already) {
            placeFieldAttributionsAlreadyPresent += 1;
            continue;
          }
          if (!dryRun) {
            await this.attributionsRepo.save(
              this.attributionsRepo.create({
                sourceId,
                entityType: PLACE_FIELD_ENTITY_TYPE,
                entityId: place.id,
                field,
                confidence: 95,
                note: 'Administrative Data Backfill 2026-08-18',
                isPrimary: true,
                createdBy: null,
              }),
            );
          }
          placeFieldAttributionsCreated += 1;
        }
      }

      // Cấp revision: CHỈ khi một revision MỚI thực sự vừa được tạo — revision là lịch sử bất
      // biến, không dedupe theo nội dung (mỗi id một attribution, không có "revision cũ" để so).
      let wikiRevisionAttributionCreated = false;
      if (revisionId && sourceId && !dryRun) {
        await this.attributionsRepo.save(
          this.attributionsRepo.create({
            sourceId,
            entityType: WIKI_REVISION_ENTITY_TYPE,
            entityId: revisionId,
            field: null,
            confidence: 95,
            note: 'Administrative Data Backfill 2026-08-18',
            isPrimary: true,
            createdBy: null,
          }),
        );
        wikiRevisionAttributionCreated = true;
      }

      // Verification: tái dùng ensureOfficialFromClaim (no-op nếu đã official) — PHẢI trong
      // transaction của caller (verifications.service.ts: "KHÔNG mở transaction ở đây").
      let verificationOutcome: AdministrativeBackfillPlaceResult['verificationOutcome'] = null;
      if (sourceId && !dryRun) {
        const outcome = await this.dataSource.transaction((manager) =>
          this.verificationsService.ensureOfficialFromClaim(
            place.id,
            {
              actorId,
              note: `Administrative Data Backfill — ${ADMINISTRATIVE_BACKFILL_SOURCE.title}`,
              createSource: async () => sourceId,
              method: VerificationMethod.SOURCE_MATCH,
            },
            manager,
          ),
        );
        verificationOutcome = outcome.sourceCreated ? 'official_created' : 'already_official_noop';
      } else if (dryRun) {
        verificationOutcome = 'skipped_dry_run';
      }

      const provinceAfter = dryRun ? place.province : needsPatch ? target.province : place.province;
      const adminAreaAfter = dryRun ? place.admin_area : needsPatch ? target.adminArea : place.admin_area;

      return {
        slug: target.slug,
        placeId: place.id,
        outcome: needsPatch ? 'patched' : 'already_correct',
        provinceBefore: place.province,
        provinceAfter,
        adminAreaBefore: place.admin_area,
        adminAreaAfter,
        revisionCreated,
        revisionId,
        placeFieldAttributionsCreated,
        placeFieldAttributionsAlreadyPresent,
        wikiRevisionAttributionCreated,
        verificationOutcome,
        preservedSnapshot,
      };
    } catch (err) {
      // Cùng nguyên tắc `expireOverdue()`: lỗi MỘT dòng không được chặn các dòng còn lại — 49
      // place độc lập, một địa điểm lỗi không phải lý do để 48 place kia không được chuẩn hoá.
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Backfill lỗi ở place '${target.slug}': ${message}`);
      return {
        slug: target.slug,
        placeId: null,
        outcome: 'error',
        provinceBefore: null,
        provinceAfter: null,
        adminAreaBefore: null,
        adminAreaAfter: null,
        revisionCreated: false,
        revisionId: null,
        placeFieldAttributionsCreated: 0,
        placeFieldAttributionsAlreadyPresent: 0,
        wikiRevisionAttributionCreated: false,
        verificationOutcome: null,
        preservedSnapshot: null,
        error: message,
      };
    }
  }

  private async hasAttribution(
    entityType: string,
    entityId: string,
    field: string,
    sourceId: string,
  ): Promise<boolean> {
    const existing = await this.attributionsRepo.listByEntity(entityType, entityId, field);
    return existing.some((a) => a.sourceId === sourceId);
  }
}
