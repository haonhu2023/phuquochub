import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { PlaceTranslationsRepository } from './repositories/place-translations.repository';
import { PlaceTranslationRoutesRepository } from './repositories/place-translation-routes.repository';
import { PlaceTranslationSeoRepository } from './repositories/place-translation-seo.repository';
import { PlaceTranslation } from './entities/place-translation.entity';
import { PlaceTranslationRoute } from './entities/place-translation-route.entity';
import { PlaceTranslationSeo } from './entities/place-translation-seo.entity';
import { TextFormat, TranslationMethod } from './place-translations.enums';
import { computeSourceTextHash, isSourceTextStale } from './source-text-hash';
import { canonicalJson } from '../../common/canonical-json';
import { LocalesService } from '../locales/locales.service';
import { RevisionsService } from '../revisions/revisions.service';
import { RevisionOrigin, RevisionStatus } from '../revisions/revision.enums';
import {
  PublishRouteItem,
  PublishSeoItem,
  PublishTranslationBundleInput,
  PublishTranslationItem,
} from './dto/place-translation.dto';

// Dịch vụ nền tảng i18n (ADR-020). Đây KHÔNG PHẢI production-write job (chưa xây, xem ADR
// "Consequences/Negative") — đây là các primitive ghi (publish một field/locale, publish một bundle
// nhiều field/locale trong một giao dịch, rollback về một revision trước đó) mà một importer tương
// lai sẽ gọi. Không tự tạo bản dịch giả cho 49 địa điểm thật, không tự copy nội dung tiếng Việt
// sang trường SEO tiếng Anh.
@Injectable()
export class PlaceTranslationsService {
  constructor(
    private readonly translationsRepo: PlaceTranslationsRepository,
    private readonly routesRepo: PlaceTranslationRoutesRepository,
    private readonly seoRepo: PlaceTranslationSeoRepository,
    private readonly localesService: LocalesService,
    private readonly revisionsService: RevisionsService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  // Publish nhiều field/locale của MỘT place trong MỘT giao dịch — nếu một item lỗi (locale không
  // publishable, vi phạm CHECK ai_plus_human/human_review_status, …), TOÀN BỘ bundle rollback,
  // không có publish dở dang giữa vi/en (owner decision #6, test "no partial vi/en publish").
  async publishTranslationBundle(input: PublishTranslationBundleInput): Promise<PlaceTranslation[]> {
    if (input.items.length === 0) {
      throw new BadRequestException('publishTranslationBundle: items must not be empty');
    }
    // Xác thực locale TRƯỚC khi mở giao dịch — đọc thuần, không cần rollback riêng.
    for (const item of input.items) {
      await this.localesService.assertPublishableLocale(item.localeCode);
      await this.localesService.getKnownLocale(item.sourceLocaleCode);
    }
    return this.dataSource.transaction((manager) =>
      Promise.all(
        input.items.map((item) =>
          this.publishOneTranslation(
            input.placeId,
            item,
            input.origin,
            input.editorId ?? null,
            input.changeNote ?? null,
            manager,
          ),
        ),
      ),
    );
  }

  publishTranslation(
    placeId: string,
    item: PublishTranslationItem,
    origin: RevisionOrigin,
    editorId: string | null = null,
    changeNote: string | null = null,
  ): Promise<PlaceTranslation> {
    return this.publishTranslationBundle({ placeId, items: [item], origin, editorId, changeNote }).then(
      (rows) => rows[0],
    );
  }

  // Used by MultilingualPlaceImportService to run inside the importer's own batch transaction
  // instead of opening a nested one. Caller is responsible for the enclosing transaction.
  publishTranslationInTransaction(
    placeId: string,
    item: PublishTranslationItem,
    origin: RevisionOrigin,
    editorId: string | null,
    changeNote: string | null,
    manager: EntityManager,
  ): Promise<PlaceTranslation> {
    return this.publishOneTranslation(placeId, item, origin, editorId, changeNote, manager);
  }

  private async publishOneTranslation(
    placeId: string,
    item: PublishTranslationItem,
    origin: RevisionOrigin,
    editorId: string | null,
    changeNote: string | null,
    manager: EntityManager,
  ): Promise<PlaceTranslation> {
    // RULE-LANG-003 (AI cần người duyệt trước khi công khai) — sàn ở tầng CHECK DB
    // (ck_place_trans_ai_needs_review) cũng thực thi đúng điều này; kiểm ở đây để trả lỗi rõ ràng
    // hơn một constraint-violation thô, KHÔNG thay thế CHECK — cả hai cùng tồn tại có chủ đích.
    if (
      item.translationMethod === TranslationMethod.AI_PLUS_HUMAN &&
      item.humanReviewStatus !== 'APPROVED' &&
      item.isProductionData
    ) {
      throw new BadRequestException(
        `publishTranslation: AI-authored translation (place=${placeId}, field=${item.fieldKey}, locale=${item.localeCode}) requires human_review_status='APPROVED' before is_production_data=true`,
      );
    }

    const existing = await this.translationsRepo.findCurrent(placeId, item.fieldKey, item.localeCode, manager);
    const sourceTextHash = computeSourceTextHash(item.sourceText);

    // Idempotency (canonicalJson()'s own doc comment names this exact failure mode for
    // VerifiedFactsIngestionService: re-running an unchanged write silently creates a second
    // revision). Republishing byte-identical content is a no-op: no new row, no new
    // wiki_revisions entry.
    if (existing && this.isSameTranslationContent(existing, item, sourceTextHash)) {
      return existing;
    }

    const id = randomUUID();
    const revision = await this.revisionsService.recordPlaceTranslationRevision(
      {
        entityId: id,
        snapshot: {
          id,
          placeId,
          fieldKey: item.fieldKey,
          localeCode: item.localeCode,
          sourceLocaleCode: item.sourceLocaleCode,
          translatedText: item.translatedText,
          textFormat: item.textFormat ?? TextFormat.PLAIN_TEXT,
          sourceTextHash,
          translationMethod: item.translationMethod,
          translationStatus: item.translationStatus,
          humanReviewStatus: item.humanReviewStatus,
          qualityGate: item.qualityGate,
          supersedesTranslationId: existing?.id ?? null,
        },
        origin,
        editorId,
        changeNote,
        status: RevisionStatus.APPROVED,
      },
      manager,
    );

    const row = manager.getRepository(PlaceTranslation).create({
      id,
      placeId,
      fieldKey: item.fieldKey,
      localeCode: item.localeCode,
      sourceLocaleCode: item.sourceLocaleCode,
      translatedText: item.translatedText,
      textFormat: item.textFormat ?? TextFormat.PLAIN_TEXT,
      sourceTextHash,
      translationMethod: item.translationMethod,
      translationStatus: item.translationStatus,
      humanReviewStatus: item.humanReviewStatus,
      qualityGate: item.qualityGate,
      revisionId: revision.id,
      supersedesTranslationId: existing?.id ?? null,
      isCurrent: true,
      isPublic: item.isPublic,
      isProductionData: item.isProductionData,
      productionEligible: item.productionEligible,
      sourceId: item.sourceId ?? null,
      evidenceId: item.evidenceId ?? null,
      importBatchId: item.importBatchId ?? null,
    });
    const saved = await this.translationsRepo.insert(row, manager);
    if (existing) {
      await this.translationsRepo.markNotCurrent(existing.id, manager);
    }
    return saved;
  }

  // Rollback một field/locale về đúng nội dung của một revision TRƯỚC ĐÓ (không nhất thiết là bản
  // ngay trước — có thể đi xa hơn trong chuỗi supersedes_translation_id). KHÔNG BAO GIỜ UPDATE/DELETE
  // hàng lịch sử: chèn một hàng MỚI mang nội dung cũ, đánh dấu current, gắn một wiki_revisions row
  // mới (origin=IMPORT, change_note ghi rõ đây là revert) — "revert chính nó là một revision mới"
  // (ADR-020 §5).
  async rollbackTranslationTo(targetTranslationId: string, editorId: string | null = null): Promise<PlaceTranslation> {
    return this.dataSource.transaction(async (manager) => {
      const target = await this.translationsRepo.findById(targetTranslationId, manager);
      if (!target) {
        throw new BadRequestException(`rollbackTranslationTo: translation ${targetTranslationId} not found`);
      }
      const current = await this.translationsRepo.findCurrent(target.placeId, target.fieldKey, target.localeCode, manager);
      if (current && current.id === target.id) {
        return current; // đã là bản hiện hành — không có gì để rollback.
      }

      const id = randomUUID();
      const revision = await this.revisionsService.recordPlaceTranslationRevision(
        {
          entityId: id,
          snapshot: {
            id,
            placeId: target.placeId,
            fieldKey: target.fieldKey,
            localeCode: target.localeCode,
            sourceLocaleCode: target.sourceLocaleCode,
            translatedText: target.translatedText,
            textFormat: target.textFormat,
            sourceTextHash: target.sourceTextHash,
            translationMethod: target.translationMethod,
            translationStatus: target.translationStatus,
            humanReviewStatus: target.humanReviewStatus,
            qualityGate: target.qualityGate,
            supersedesTranslationId: current?.id ?? null,
            revertedFromRevisionId: target.revisionId,
          },
          origin: RevisionOrigin.IMPORT,
          editorId,
          changeNote: `Rollback to revision ${target.revisionId} (translation ${target.id})`.slice(0, 300),
          status: RevisionStatus.APPROVED,
        },
        manager,
      );

      const row = manager.getRepository(PlaceTranslation).create({
        id,
        placeId: target.placeId,
        fieldKey: target.fieldKey,
        localeCode: target.localeCode,
        sourceLocaleCode: target.sourceLocaleCode,
        translatedText: target.translatedText,
        textFormat: target.textFormat,
        sourceTextHash: target.sourceTextHash,
        translationMethod: target.translationMethod,
        translationStatus: target.translationStatus,
        humanReviewStatus: target.humanReviewStatus,
        qualityGate: target.qualityGate,
        revisionId: revision.id,
        supersedesTranslationId: current?.id ?? null,
        isCurrent: true,
        isPublic: target.isPublic,
        isProductionData: target.isProductionData,
        productionEligible: target.productionEligible,
        sourceId: target.sourceId,
        evidenceId: target.evidenceId,
        importBatchId: target.importBatchId,
      });
      const saved = await this.translationsRepo.insert(row, manager);
      if (current) {
        await this.translationsRepo.markNotCurrent(current.id, manager);
      }
      return saved;
    });
  }

  // Public Place i18n Read Path — the single seam every public read surface (Places API today,
  // any future consumer) must go through to read a localized field. Delegates the actual
  // eligibility predicate to the repository query (findCurrentPublic) rather than re-filtering
  // in application code, so there is exactly one place that can drift from "public/current/
  // production only". Returns `null` on no eligible row — callers keep their own fallback
  // (e.g. the untranslated base column), never a thrown error for "no translation yet".
  async getCurrentPublicTranslatedText(
    placeId: string,
    fieldKey: string,
    localeCode: string,
  ): Promise<string | null> {
    const row = await this.translationsRepo.findCurrentPublic(placeId, fieldKey, localeCode);
    return row ? row.translatedText : null;
  }

  isSourceTextStale(translation: PlaceTranslation, currentSourceText: string): boolean {
    return isSourceTextStale(translation.sourceTextHash, currentSourceText);
  }

  private isSameTranslationContent(
    existing: PlaceTranslation,
    incoming: PublishTranslationItem,
    incomingSourceTextHash: string,
  ): boolean {
    return (
      canonicalJson({
        translatedText: existing.translatedText,
        textFormat: existing.textFormat,
        sourceLocaleCode: existing.sourceLocaleCode,
        sourceTextHash: existing.sourceTextHash,
        translationMethod: existing.translationMethod,
        translationStatus: existing.translationStatus,
        humanReviewStatus: existing.humanReviewStatus,
        qualityGate: existing.qualityGate,
        isPublic: existing.isPublic,
        isProductionData: existing.isProductionData,
        productionEligible: existing.productionEligible,
      }) ===
      canonicalJson({
        translatedText: incoming.translatedText,
        textFormat: incoming.textFormat ?? TextFormat.PLAIN_TEXT,
        sourceLocaleCode: incoming.sourceLocaleCode,
        sourceTextHash: incomingSourceTextHash,
        translationMethod: incoming.translationMethod,
        translationStatus: incoming.translationStatus,
        humanReviewStatus: incoming.humanReviewStatus,
        qualityGate: incoming.qualityGate,
        isPublic: incoming.isPublic,
        isProductionData: incoming.isProductionData,
        productionEligible: incoming.productionEligible,
      })
    );
  }

  // Publish một route (MAP-031). Không bundle chung giao dịch với publishTranslationBundle ở giai
  // đoạn nền tảng này — mỗi route tự giao dịch riêng, cùng cơ chế current/supersede. Đổi slug
  // KHÔNG xoá hàng cũ: hàng cũ được chuyển thành redirect (is_redirect=true, is_current=false),
  // không bao giờ delete.
  async publishRoute(item: PublishRouteItem): Promise<PlaceTranslationRoute> {
    await this.localesService.assertPublishableLocale(item.localeCode);
    return this.dataSource.transaction(async (manager) => {
      // Kiểm tra va chạm slug TRONG giao dịch (không phải trước khi mở) — tránh khoảng hở TOCTOU
      // giữa lần đọc và lần ghi; partial unique index (locale_code, localized_slug) WHERE
      // is_current vẫn là nguồn thực thi cuối cùng dưới tranh chấp đồng thời, đây chỉ là lỗi rõ
      // ràng thay vì một unique-violation thô.
      const collision = await this.routesRepo.findCurrentBySlug(item.localeCode, item.localizedSlug, manager);
      if (collision && collision.placeId !== item.placeId) {
        throw new BadRequestException(
          `publishRoute: slug '${item.localizedSlug}' already current for locale '${item.localeCode}' on a different place`,
        );
      }
      const existing = await this.routesRepo.findCurrentByPlace(item.placeId, item.localeCode, manager);
      const id = randomUUID();
      const revision = await this.revisionsService.recordPlaceTranslationRevision(
        {
          entityId: id,
          snapshot: { id, ...item, supersedesRouteId: existing?.id ?? null },
          origin: item.origin,
          editorId: item.editorId ?? null,
          changeNote: item.changeNote ?? null,
          status: RevisionStatus.APPROVED,
        },
        manager,
      );
      const row = manager.getRepository(PlaceTranslationRoute).create({
        id,
        placeId: item.placeId,
        localeCode: item.localeCode,
        localizedSlug: item.localizedSlug,
        fullPath: item.fullPath,
        canonicalUrl: item.canonicalUrl,
        isCanonical: item.isCanonical ?? true,
        redirectFromSlug: null,
        isRedirect: false,
        revisionId: revision.id,
        isCurrent: true,
        isPublic: item.isPublic,
        isProductionData: item.isProductionData,
      });
      const saved = await this.routesRepo.insert(row, manager);
      if (existing) {
        // Đổi slug: hàng cũ trở thành redirect, không phải bị xoá (MAP-031).
        if (existing.localizedSlug !== item.localizedSlug) {
          await manager
            .getRepository(PlaceTranslationRoute)
            .update({ id: existing.id }, { isCurrent: false, isRedirect: true, redirectFromSlug: existing.localizedSlug });
        } else {
          await this.routesRepo.markNotCurrent(existing.id, manager);
        }
      }
      return saved;
    });
  }

  // Publish SEO cho một locale (MAP-032). KHÔNG tự copy nội dung locale khác vào đây — caller phải
  // truyền translationIdTitle/translationIdDescription trỏ tới một place_translations thật của
  // ĐÚNG locale này nếu muốn robotsIndex=true; CHECK ở migration
  // (ck_place_seo_index_needs_translation) từ chối mọi cố gắng đánh index mà không có bản dịch
  // đứng sau — đây là hình thức thực thi ở schema của "không fallback SEO tiếng Anh sang tiếng
  // Việt".
  async publishSeo(item: PublishSeoItem): Promise<PlaceTranslationSeo> {
    await this.localesService.assertPublishableLocale(item.localeCode);
    if (item.robotsIndex && !item.translationIdTitle) {
      throw new BadRequestException(
        `publishSeo: robotsIndex=true requires translationIdTitle (place=${item.placeId}, locale=${item.localeCode}) — no fallback to another locale's content is permitted`,
      );
    }
    return this.dataSource.transaction(async (manager) => {
      const existing = await this.seoRepo.findCurrent(item.placeId, item.localeCode, manager);
      const id = randomUUID();
      const revision = await this.revisionsService.recordPlaceTranslationRevision(
        {
          entityId: id,
          snapshot: { id, ...item, supersedesSeoId: existing?.id ?? null },
          origin: item.origin,
          editorId: item.editorId ?? null,
          changeNote: item.changeNote ?? null,
          status: RevisionStatus.APPROVED,
        },
        manager,
      );
      const row = manager.getRepository(PlaceTranslationSeo).create({
        id,
        placeId: item.placeId,
        localeCode: item.localeCode,
        seoTitle: item.seoTitle ?? null,
        seoDescription: item.seoDescription ?? null,
        canonicalUrl: item.canonicalUrl,
        hreflangGroupId: item.hreflangGroupId,
        robotsIndex: item.robotsIndex,
        robotsFollow: item.robotsFollow ?? true,
        ogTitle: item.ogTitle ?? null,
        ogDescription: item.ogDescription ?? null,
        translationIdTitle: item.translationIdTitle ?? null,
        translationIdDescription: item.translationIdDescription ?? null,
        revisionId: revision.id,
        isCurrent: true,
        isPublic: item.isPublic,
        isProductionData: item.isProductionData,
      });
      const saved = await this.seoRepo.insert(row, manager);
      if (existing) {
        await this.seoRepo.markNotCurrent(existing.id, manager);
      }
      return saved;
    });
  }
}
