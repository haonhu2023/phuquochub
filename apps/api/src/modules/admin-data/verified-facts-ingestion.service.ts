import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PlacesRepository } from '../places/repositories/places.repository';
import { PlacesService } from '../places/places.service';
import { ContactsRepository } from '../contacts/repositories/contacts.repository';
import { ContactsService } from '../contacts/contacts.service';
import { RevisionOrigin } from '../revisions/revision.enums';
import { RevisionsService } from '../revisions/revisions.service';
import { SourcesRepository } from '../sources/repositories/sources.repository';
import { SourceAttributionsRepository } from '../sources/repositories/source-attributions.repository';
import { SourceKind, SourceType } from '../sources/sources.enums';
import { VerificationsService } from '../verifications/verifications.service';
import { VerificationsRepository } from '../verifications/repositories/verifications.repository';
import { VerificationMethod, VerificationTargetType } from '../verifications/verification.enums';
import { VerificationStatus } from '../places/place.enums';
import { canonicalJson } from '../../common/canonical-json';
import {
  CONFIDENCE_BY_RETRIEVAL,
  RELIABILITY_BY_RETRIEVAL,
  VERIFIED_FACTS_ROUND1,
  type VerifiedFactTarget,
} from './verified-facts.manifest';

/**
 * VERIFIED FACTS INGESTION (2026-08-23) — ghi dữ kiện đã được owner phê duyệt qua ĐÚNG các luồng đã
 * có, KHÔNG tạo pipeline thứ hai. Chuỗi được chứng minh đầu-cuối:
 *
 *   research finding → sources → source_attributions → wiki_revisions → verifications → API công khai
 *
 *  1. `PlacesService.update()` (origin=IMPORT) — PATCH thật, tự sinh `wiki_revisions` (WF-14).
 *     CHỈ dùng cho `opening_hours` (cột trên `places`).
 *  2. `ContactsService.createForPlace()` — điện thoại/hotline là `contacts`, không phải cột trên
 *     `places`; qua service để `clearPrimary` chạy đúng.
 *  3. `source_attributions` ba lớp: `place_field` (opening_hours), `contact` (từng số),
 *     `wiki_revision` (khi có revision mới) — cùng ba lớp administrative-backfill dùng.
 *  4. `VerificationsService.submit()` + `.official()` — state machine ĐÃ CÓ, cho từng contact.
 *     KHÔNG tự set `contacts.verification_status`: cột đó là CACHE do `syncTargetCache()` ghi
 *     trong transition (ADR-008); ghi tay sẽ làm cache lệch khỏi bảng `verifications`.
 *  5. `VerificationsService.ensureOfficialFromClaim()` (method=SOURCE_MATCH) — cấp PLACE.
 *
 * KHÔNG GIẢ MẠO XÁC MINH NGƯỜI THẬT: `method` luôn là `SOURCE_MATCH` — bản ghi trung thực rằng dữ
 * kiện được đối chiếu với NGUỒN, không phải một moderator đã tự tay kiểm tra. `verified_at` do
 * chính state machine đặt bằng thời điểm transition THẬT, không truyền tay từ ngoài vào.
 *
 * MỨC TIN CẬY PHẢN ÁNH CÁCH LẤY ĐƯỢC BẰNG CHỨNG: `reliability`/`confidence` suy ra từ
 * `retrievalMethod` (xem manifest bất biến #2), nên nguồn `search_index` (VinWonders — trang 403)
 * KHÔNG bao giờ được ghi ngang với `direct_fetch` (Sun World).
 *
 * IDEMPOTENT: source theo (type, externalRef); contact theo (ownerType, ownerId, contactType,
 * value); attribution theo (entityType, entityId, field, sourceId); opening_hours so sánh CHUẨN
 * HOÁ (xem `canonicalJson`, `common/canonical-json.ts` — dời khỏi file này 2026-08-24, Slice 0.5B,
 * để `publish-manifest.contract.ts` dùng lại được mà không tạo circular import; xem comment tại
 * nơi định nghĩa). Chạy lại KHÔNG nhân bản.
 */

const PLACE_FIELD_ENTITY_TYPE = 'place_field';
const WIKI_REVISION_ENTITY_TYPE = 'wiki_revision';
const CONTACT_ENTITY_TYPE = 'contact';
const OPENING_HOURS_FIELD = 'opening_hours';
const PLACE_OWNER = 'place';

export interface VerifiedFactsPlaceResult {
  slug: string;
  placeId: string | null;
  outcome: 'not_found' | 'ingested' | 'already_current' | 'error';
  sourceId: string | null;
  sourceCreated: boolean;
  sourceReliabilityCorrected: boolean;
  reliability: number | null;
  retrievalMethod: string | null;
  openingHoursWritten: boolean;
  openingHoursSkippedReason: string | null;
  partialFactRecorded: boolean;
  revisionId: string | null;
  contactsCreated: number;
  contactsAlreadyPresent: number;
  contactVerificationsOfficial: number;
  attributionsCreated: number;
  attributionsAlreadyPresent: number;
  placeVerificationOutcome: 'official_created' | 'already_official_noop' | 'skipped_dry_run' | null;
  error?: string;
}

export interface VerifiedFactsSummary {
  dryRun: boolean;
  actorId: string;
  totalTargets: number;
  ingested: number;
  alreadyCurrent: number;
  notFound: number;
  errors: number;
  results: VerifiedFactsPlaceResult[];
  durationMs: number;
}

@Injectable()
export class VerifiedFactsIngestionService {
  private readonly logger = new Logger(VerifiedFactsIngestionService.name);

  constructor(
    private readonly placesRepo: PlacesRepository,
    private readonly placesService: PlacesService,
    private readonly contactsRepo: ContactsRepository,
    private readonly contactsService: ContactsService,
    private readonly revisionsService: RevisionsService,
    private readonly sourcesRepo: SourcesRepository,
    private readonly attributionsRepo: SourceAttributionsRepository,
    private readonly verificationsService: VerificationsService,
    private readonly verificationsRepo: VerificationsRepository,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async ingest(options: {
    actorId: string;
    dryRun?: boolean;
    targets?: readonly VerifiedFactTarget[];
  }): Promise<VerifiedFactsSummary> {
    const start = Date.now();
    const dryRun = options.dryRun ?? false;
    const targets = options.targets ?? VERIFIED_FACTS_ROUND1;

    const results: VerifiedFactsPlaceResult[] = [];
    for (const target of targets) {
      results.push(await this.processOne(target, options.actorId, dryRun));
    }

    return {
      dryRun,
      actorId: options.actorId,
      totalTargets: targets.length,
      ingested: results.filter((r) => r.outcome === 'ingested').length,
      alreadyCurrent: results.filter((r) => r.outcome === 'already_current').length,
      notFound: results.filter((r) => r.outcome === 'not_found').length,
      errors: results.filter((r) => r.outcome === 'error').length,
      results,
      durationMs: Date.now() - start,
    };
  }

  /**
   * Find-or-create `sources`, và SỬA LẠI `reliability`/`metadata` nếu dòng đã có lệch khỏi mức mà
   * `retrievalMethod` quy định. Việc sửa là cần: một lần chạy trước đó có thể đã ghi nguồn
   * `search_index` với reliability của `direct_fetch`, và để nguyên sẽ là khai khống mức bằng chứng.
   */
  private async ensureSource(
    target: VerifiedFactTarget,
    dryRun: boolean,
  ): Promise<{ sourceId: string | null; sourceCreated: boolean; corrected: boolean }> {
    const reliability = RELIABILITY_BY_RETRIEVAL[target.source.retrievalMethod];
    const existing = await this.sourcesRepo.findByTypeAndExternalRef(
      SourceType.OFFICIAL_WEBSITE,
      target.source.externalRef,
    );

    if (existing) {
      const metadata = (existing.metadata ?? {}) as Record<string, unknown>;
      const drifted =
        existing.reliability !== reliability || metadata.retrieval_method !== target.source.retrievalMethod;
      if (drifted && !dryRun) {
        existing.reliability = reliability;
        existing.metadata = {
          ...metadata,
          ingestion: 'verified-facts-round1-2026-08-23',
          retrieval_method: target.source.retrievalMethod,
        };
        await this.sourcesRepo.save(existing);
      }
      return { sourceId: existing.id, sourceCreated: false, corrected: drifted };
    }

    if (dryRun) return { sourceId: null, sourceCreated: false, corrected: false };

    const saved = await this.sourcesRepo.save(
      this.sourcesRepo.create({
        type: SourceType.OFFICIAL_WEBSITE,
        kind: SourceKind.URL,
        title: target.source.title,
        url: target.source.url,
        externalRef: target.source.externalRef,
        publisher: target.source.publisher,
        authorUserId: null,
        license: null,
        reliability,
        language: target.source.language,
        retrievedAt: new Date(target.source.retrievedAt),
        metadata: {
          ingestion: 'verified-facts-round1-2026-08-23',
          retrieval_method: target.source.retrievalMethod,
        },
      }),
    );
    return { sourceId: saved.id, sourceCreated: true, corrected: false };
  }

  private async processOne(
    target: VerifiedFactTarget,
    actorId: string,
    dryRun: boolean,
  ): Promise<VerifiedFactsPlaceResult> {
    const confidence = CONFIDENCE_BY_RETRIEVAL[target.source.retrievalMethod];
    const base: VerifiedFactsPlaceResult = {
      slug: target.slug,
      placeId: null,
      outcome: 'not_found',
      sourceId: null,
      sourceCreated: false,
      sourceReliabilityCorrected: false,
      reliability: RELIABILITY_BY_RETRIEVAL[target.source.retrievalMethod],
      retrievalMethod: target.source.retrievalMethod,
      openingHoursWritten: false,
      openingHoursSkippedReason: null,
      partialFactRecorded: false,
      revisionId: null,
      contactsCreated: 0,
      contactsAlreadyPresent: 0,
      contactVerificationsOfficial: 0,
      attributionsCreated: 0,
      attributionsAlreadyPresent: 0,
      placeVerificationOutcome: null,
    };

    try {
      const place = await this.placesRepo.getDetailBySlug(target.slug);
      if (!place) return base;
      base.placeId = place.id;

      const { sourceId, sourceCreated, corrected } = await this.ensureSource(target, dryRun);
      base.sourceId = sourceId;
      base.sourceCreated = sourceCreated;
      base.sourceReliabilityCorrected = corrected;

      let didWrite = sourceCreated || corrected;

      // --- 1. opening_hours ---------------------------------------------------------------
      if (target.openingHours === null) {
        base.openingHoursSkippedReason = 'manifest khai null — nguồn không nêu đủ để dựng lịch';
      } else {
        const current = canonicalJson(place.opening_hours ?? null);
        const desired = canonicalJson(target.openingHours);
        if (current === desired) {
          base.openingHoursSkippedReason = 'đã khớp giá trị hiện tại (idempotent no-op)';
        } else if (dryRun) {
          base.openingHoursSkippedReason = 'DRY RUN — sẽ ghi opening_hours ở lần chạy thật';
          didWrite = true;
        } else {
          await this.placesService.update(
            place.id,
            { opening_hours: target.openingHours },
            actorId,
            RevisionOrigin.IMPORT,
          );
          base.openingHoursWritten = true;
          didWrite = true;
          const revisions = await this.revisionsService.listByPlace(place.id);
          base.revisionId = revisions[0]?.id ?? null;
        }
      }

      // Trích dẫn cấp field cho `opening_hours` — tạo KHI CÓ giờ đã ghi HOẶC khi có dữ kiện MỘT
      // PHẦN cần lưu vết (vd Sun World: biết giờ đóng, chưa biết giờ mở). Trường hợp sau KHÔNG ghi
      // `places.opening_hours`, nên audit vẫn đúng khi báo MISSING.
      if (sourceId && (target.openingHours !== null || target.partialFactNote)) {
        const note = target.partialFactNote ?? 'Verified Facts Round 1 — 2026-08-23';
        const created = await this.ensureAttribution(
          PLACE_FIELD_ENTITY_TYPE,
          place.id,
          OPENING_HOURS_FIELD,
          sourceId,
          confidence,
          note,
          dryRun,
        );
        created ? (base.attributionsCreated += 1) : (base.attributionsAlreadyPresent += 1);
        if (target.partialFactNote) base.partialFactRecorded = true;
        if (created) didWrite = true;
      }

      if (base.revisionId && sourceId && !dryRun) {
        await this.attributionsRepo.save(
          this.attributionsRepo.create({
            sourceId,
            entityType: WIKI_REVISION_ENTITY_TYPE,
            entityId: base.revisionId,
            field: null,
            confidence,
            note: 'Verified Facts Round 1 — 2026-08-23',
            isPrimary: true,
            createdBy: null,
          }),
        );
        base.attributionsCreated += 1;
      }

      // --- 2. contacts --------------------------------------------------------------------
      const existingContacts = await this.contactsRepo.listByOwner(PLACE_OWNER, place.id);
      for (const fact of target.contacts) {
        const already = existingContacts.find(
          (c) => c.contactType === fact.contactType && c.value === fact.value,
        );
        let contactId = already?.id ?? null;

        if (already) {
          base.contactsAlreadyPresent += 1;
        } else if (!dryRun) {
          const created = await this.contactsService.createForPlace(place.id, {
            contact_type: fact.contactType,
            value: fact.value,
            label: fact.label ?? undefined,
            is_primary: fact.isPrimary,
          });
          contactId = created.id;
          base.contactsCreated += 1;
          didWrite = true;
        } else {
          base.contactsCreated += 1;
          didWrite = true;
        }

        if (!contactId || !sourceId || dryRun) continue;

        const attrCreated = await this.ensureAttribution(
          CONTACT_ENTITY_TYPE,
          contactId,
          null,
          sourceId,
          confidence,
          `Verified Facts Round 1 — trích dẫn: "${fact.quote}"`.slice(0, 300),
          dryRun,
        );
        attrCreated ? (base.attributionsCreated += 1) : (base.attributionsAlreadyPresent += 1);
        if (attrCreated) didWrite = true;

        if (await this.ensureContactOfficial(contactId, sourceId, actorId, target, confidence)) {
          base.contactVerificationsOfficial += 1;
          didWrite = true;
        }
      }

      // --- 3. verification cấp PLACE -------------------------------------------------------
      if (sourceId && !dryRun) {
        const outcome = await this.dataSource.transaction((manager) =>
          this.verificationsService.ensureOfficialFromClaim(
            place.id,
            {
              actorId,
              note: `Verified Facts Round 1 (${target.source.retrievalMethod}) — ${target.source.title}`.slice(0, 300),
              createSource: async () => sourceId,
              method: VerificationMethod.SOURCE_MATCH,
            },
            manager,
          ),
        );
        base.placeVerificationOutcome = outcome.sourceCreated ? 'official_created' : 'already_official_noop';
        if (outcome.sourceCreated) didWrite = true;
      } else if (dryRun) {
        base.placeVerificationOutcome = 'skipped_dry_run';
      }

      base.outcome = didWrite ? 'ingested' : 'already_current';
      return base;
    } catch (err) {
      this.logger.error(`Ingestion lỗi ở place '${target.slug}': ${(err as Error).message}`);
      return { ...base, outcome: 'error', error: (err as Error).message };
    }
  }

  /**
   * `true` nếu vừa TẠO attribution mới, `false` nếu đã có sẵn.
   *
   * SỬA LẠI `confidence` của dòng đã có nếu nó lệch khỏi mức mà `retrievalMethod` quy định — cùng
   * lý do `ensureSource` sửa `reliability`: một lần chạy trước có thể đã ghi attribution của nguồn
   * `search_index` với confidence của `direct_fetch`, và để nguyên là khai khống mức bằng chứng ở
   * tầng attribution dù tầng source đã đúng.
   */
  private async ensureAttribution(
    entityType: string,
    entityId: string,
    field: string | null,
    sourceId: string,
    confidence: number,
    note: string,
    dryRun: boolean,
  ): Promise<boolean> {
    const existing = await this.attributionsRepo.listByEntity(entityType, entityId, field);
    const match = existing.find((a) => a.sourceId === sourceId);
    if (match) {
      if (match.confidence !== confidence && !dryRun) {
        match.confidence = confidence;
        await this.attributionsRepo.save(match);
      }
      return false;
    }
    if (!dryRun) {
      await this.attributionsRepo.save(
        this.attributionsRepo.create({
          sourceId,
          entityType,
          entityId,
          field,
          confidence,
          note: note.slice(0, 300),
          isPrimary: true,
          createdBy: null,
        }),
      );
    }
    return true;
  }

  /**
   * Đưa MỘT contact tới `official` qua state machine đã có. `true` nếu lần gọi này thực sự chuyển
   * trạng thái.
   *
   * Ba tình huống — `submit()` KHÔNG phải lúc nào cũng gọi được:
   *  - chưa có dòng `verifications` (contact vừa tạo) → `submit()` tạo pending, rồi `official()`;
   *  - dòng ở `expired`/`rejected` → `submit()` hợp lệ (gửi lại, verification.md §3.2);
   *  - dòng ở `pending`/`verified`/`community_verified` → gọi THẲNG `official()` (submit trên các
   *    trạng thái này sẽ ném lỗi transition không hợp lệ).
   */
  private async ensureContactOfficial(
    contactId: string,
    sourceId: string,
    actorId: string,
    target: VerifiedFactTarget,
    confidence: number,
  ): Promise<boolean> {
    const existing = await this.verificationsRepo.findActiveByTarget({ contactId });
    if (existing?.status === VerificationStatus.OFFICIAL) return false;

    const note = `Verified Facts Round 1 (${target.source.retrievalMethod}) — ${target.source.publisher}`.slice(0, 300);
    const canTransitionDirectly =
      existing !== null &&
      existing.status !== VerificationStatus.EXPIRED &&
      existing.status !== VerificationStatus.REJECTED;

    const verificationId = canTransitionDirectly
      ? existing.id
      : (
          await this.verificationsService.submit(
            { target_type: VerificationTargetType.CONTACT, target_id: contactId, note },
            actorId,
          )
        ).id;

    await this.verificationsService.official(verificationId, { source_id: sourceId, confidence, note }, actorId);
    return true;
  }
}
