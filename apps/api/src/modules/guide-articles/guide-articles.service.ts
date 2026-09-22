import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { GuideArticle } from './entities/guide-article.entity';
import { GuideBlock } from './entities/guide-block.entity';
import { GuideArticleStatus, GuideBlockType } from './guide-article.enums';
import { SaveGuideDraftDto } from './dto/save-guide-draft.dto';
import { UpdateGuideDraftDto } from './dto/update-guide-draft.dto';
import { Media } from '../media/entities/media.entity';
import { MediaStatus } from '../media/media.enums';
import { MediaUrlService } from '../../core/media-url/media-url.service';
import { RevisionsService } from '../revisions/revisions.service';
import { RevisionOrigin, RevisionStatus } from '../revisions/revision.enums';
import { OwnerDecisionQueueService } from '../owner-decision-queue/owner-decision-queue.service';

export interface GuideBlockView {
  id: string;
  position: number;
  blockType: GuideBlockType;
  content: Record<string, unknown>;
  needsDecision: boolean;
  decisionNote: string | null;
}

export interface GuideArticleSummary {
  id: string;
  slug: string;
  locale: string;
  title: string;
  status: GuideArticleStatus;
  updatedAt: Date;
}

// G-D (2026-09-22) — card shape for the public guide index (`/guide`). Richer than
// GuideArticleSummary (intro/heroImageUrl for the card, publishedAt to sort/display) because the
// two lists serve different audiences: this one is public-facing content, that one is the
// editor's own management table.
export interface PublishedGuideArticleSummary {
  slug: string;
  locale: string;
  title: string;
  intro: string | null;
  heroImageUrl: string | null;
  publishedAt: Date | null;
}

export interface GuideArticleView {
  id: string;
  slug: string;
  locale: string;
  title: string;
  intro: string | null;
  heroMediaId: string | null;
  heroImageUrl: string | null;
  status: GuideArticleStatus;
  contentVersion: number;
  updatedAt: Date;
  publishedAt: Date | null;
  blocks: GuideBlockView[];
}

const REVISION_ORIGIN = RevisionOrigin.MODERATOR_EDIT;

@Injectable()
export class GuideArticlesService {
  private readonly logger = new Logger(GuideArticlesService.name);

  constructor(
    @InjectRepository(GuideArticle) private readonly articleRepo: Repository<GuideArticle>,
    @InjectRepository(GuideBlock) private readonly blockRepo: Repository<GuideBlock>,
    @InjectRepository(Media) private readonly mediaRepo: Repository<Media>,
    private readonly mediaUrlService: MediaUrlService,
    private readonly revisionsService: RevisionsService,
    private readonly ownerDecisionQueueService: OwnerDecisionQueueService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  // ── Public read ──────────────────────────────────────────────────────────────

  // Only ever returns a `published` article — a draft is unreachable through this method
  // regardless of caller identity. This is the literal "draft không public" guarantee: there is
  // no separate guest-vs-editor branch to get wrong here, because the query itself excludes drafts.
  async getPublished(slug: string, locale: string): Promise<GuideArticleView> {
    const article = await this.articleRepo.findOne({
      where: { slug, locale, status: GuideArticleStatus.PUBLISHED },
    });
    if (!article) {
      throw new NotFoundException(`Guide article ${slug} (${locale}) not found or not published`);
    }
    const blocks = await this.blockRepo.find({ where: { articleId: article.id }, order: { position: 'ASC' } });
    return await this.toView(article, blocks);
  }

  // G-D (2026-09-22) — public index (`GET /guide-articles?locale=`). Published-only, same
  // guarantee as getPublished(): the query itself excludes drafts, no separate guest-vs-editor
  // branch to get wrong. No pagination yet (`take: 100`) — matches the scale of every other
  // unpaginated list in this codebase (listAll() above has the same shape); revisit if the guide
  // catalogue ever approaches that ceiling.
  async listPublished(locale: string): Promise<PublishedGuideArticleSummary[]> {
    const articles = await this.articleRepo.find({
      where: { locale, status: GuideArticleStatus.PUBLISHED },
      order: { publishedAt: 'DESC' },
      take: 100,
    });
    return articles.map((a) => ({
      slug: a.slug,
      locale: a.locale,
      title: a.title,
      intro: a.intro,
      heroImageUrl: a.heroMediaId ? this.mediaUrlService.fileUrl(a.heroMediaId) : null,
      publishedAt: a.publishedAt,
    }));
  }

  // Any status — for the editor's own preview. Gated by Guide.Edit.Any at the controller.
  async getDraft(id: string): Promise<GuideArticleView> {
    const article = await this.findArticleOrThrow(id);
    const blocks = await this.blockRepo.find({ where: { articleId: article.id }, order: { position: 'ASC' } });
    return await this.toView(article, blocks);
  }

  // Lightweight summary list (no blocks) for the dashboard's article table. Any status — editors
  // need to see their own drafts, not just published ones. Gated by Guide.Edit.Any.
  async listAll(): Promise<GuideArticleSummary[]> {
    const articles = await this.articleRepo.find({ order: { updatedAt: 'DESC' }, take: 200 });
    return articles.map((a) => ({
      id: a.id,
      slug: a.slug,
      locale: a.locale,
      title: a.title,
      status: a.status,
      updatedAt: a.updatedAt,
    }));
  }

  // ── Write path ────────────────────────────────────────────────────────────────

  async createDraft(input: SaveGuideDraftDto, actorId: string): Promise<GuideArticleView> {
    validateBlocks(input.blocks);

    const existing = await this.articleRepo.findOne({ where: { slug: input.slug, locale: input.locale } });
    if (existing) {
      throw new ConflictException(
        `A guide article already exists at slug="${input.slug}" locale="${input.locale}" — edit it instead of creating a new one`,
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const article = await manager.getRepository(GuideArticle).save(
        manager.getRepository(GuideArticle).create({
          slug: input.slug,
          locale: input.locale,
          title: input.title,
          intro: input.intro ?? null,
          heroMediaId: input.heroMediaId ?? null,
          status: GuideArticleStatus.DRAFT,
          contentVersion: 1,
          authorId: actorId,
        }),
      );

      const blocks = await this.replaceBlocks(manager, article.id, input.blocks);

      await this.revisionsService.recordGuideArticleRevision(
        {
          articleId: article.id,
          snapshot: snapshotOf(article, blocks),
          origin: REVISION_ORIGIN,
          editorId: actorId,
          changeNote: `Draft created by ${actorId}`,
          status: RevisionStatus.PENDING,
        },
        manager,
      );

      return await this.toView(article, blocks);
    });
  }

  async saveDraft(id: string, input: UpdateGuideDraftDto, actorId: string): Promise<GuideArticleView> {
    validateBlocks(input.blocks);

    return this.dataSource.transaction(async (manager) => {
      const articleRepo = manager.getRepository(GuideArticle);
      const current = await articleRepo.findOne({ where: { id } });
      if (!current) {
        throw new NotFoundException(`Guide article ${id} not found`);
      }

      const nextVersion = current.contentVersion + 1;
      const patchedForSnapshot: GuideArticle = {
        ...current,
        title: input.title,
        intro: input.intro ?? null,
        heroMediaId: input.heroMediaId ?? null,
        contentVersion: nextVersion,
      };
      const newBlocks = await this.replaceBlocks(manager, id, input.blocks);

      // Revision recorded BEFORE the CAS update, in the same transaction — a failed CAS (stale
      // expectedContentVersion) rolls this insert back too, matching
      // TranslationReviewService.reviewTranslation()'s "stale tab" guarantee.
      await this.revisionsService.recordGuideArticleRevision(
        {
          articleId: id,
          snapshot: snapshotOf(patchedForSnapshot, newBlocks),
          origin: REVISION_ORIGIN,
          editorId: actorId,
          changeNote: `Draft saved by ${actorId}`,
          status: RevisionStatus.PENDING,
        },
        manager,
      );

      const result = await articleRepo.update(
        { id, contentVersion: input.expectedContentVersion },
        {
          title: input.title,
          intro: input.intro ?? null,
          heroMediaId: input.heroMediaId ?? null,
          contentVersion: nextVersion,
        },
      );
      if (!result.affected) {
        throw new ConflictException(
          `Guide article ${id} was edited by someone else since you loaded it (expected content_version=${input.expectedContentVersion}) — reload and try again`,
        );
      }

      const saved = await articleRepo.findOneOrFail({ where: { id } });
      return await this.toView(saved, newBlocks);
    });
  }

  async publish(id: string, expectedContentVersion: number, actorId: string): Promise<GuideArticleView> {
    return this.dataSource.transaction(async (manager) => {
      const articleRepo = manager.getRepository(GuideArticle);
      const current = await articleRepo.findOne({ where: { id } });
      if (!current) {
        throw new NotFoundException(`Guide article ${id} not found`);
      }
      const blocks = await manager
        .getRepository(GuideBlock)
        .find({ where: { articleId: id }, order: { position: 'ASC' } });

      await this.assertMediaPublishEligible(current.heroMediaId, blocks, manager);

      const nextVersion = current.contentVersion + 1;
      const publishedAt = new Date();

      await this.revisionsService.recordGuideArticleRevision(
        {
          articleId: id,
          snapshot: snapshotOf({ ...current, status: GuideArticleStatus.PUBLISHED, contentVersion: nextVersion }, blocks),
          origin: REVISION_ORIGIN,
          editorId: actorId,
          changeNote: `Published by ${actorId}`,
          status: RevisionStatus.APPROVED,
        },
        manager,
      );

      const result = await articleRepo.update(
        { id, contentVersion: expectedContentVersion },
        {
          status: GuideArticleStatus.PUBLISHED,
          contentVersion: nextVersion,
          publishedAt,
          publishedBy: actorId,
        },
      );
      if (!result.affected) {
        throw new ConflictException(
          `Guide article ${id} was edited by someone else since you loaded it (expected content_version=${expectedContentVersion}) — reload and try again`,
        );
      }

      const saved = await articleRepo.findOneOrFail({ where: { id } });
      return await this.toView(saved, blocks);
    });
  }

  /**
   * G-B (2026-09-22) — gỡ công khai về `draft`, đối xứng với `publish()` ở trên: cùng CAS
   * (`expectedContentVersion`), cùng cách ghi revision TRƯỚC khi UPDATE trong CÙNG transaction
   * (một CAS thất bại rollback luôn cả insert revision — không để lại revision "unpublish" mồ côi
   * cho một lần ghi chưa từng xảy ra). KHÔNG cần `assertMediaPublishEligible` — điều kiện đó chỉ
   * áp cho việc CÔNG KHAI nội dung, không áp khi gỡ nó đi. `publishedAt`/`publishedBy` GIỮ NGUYÊN
   * (lịch sử "lần xuất bản gần nhất", không phải "đang xuất bản") — cùng nguyên tắc
   * PlacesService.unpublish() không xoá dấu vết trạng thái cũ, chỉ đổi `status`.
   */
  async unpublish(id: string, expectedContentVersion: number, actorId: string): Promise<GuideArticleView> {
    return this.dataSource.transaction(async (manager) => {
      const articleRepo = manager.getRepository(GuideArticle);
      const current = await articleRepo.findOne({ where: { id } });
      if (!current) {
        throw new NotFoundException(`Guide article ${id} not found`);
      }
      const blocks = await manager
        .getRepository(GuideBlock)
        .find({ where: { articleId: id }, order: { position: 'ASC' } });

      const nextVersion = current.contentVersion + 1;

      await this.revisionsService.recordGuideArticleRevision(
        {
          articleId: id,
          snapshot: snapshotOf({ ...current, status: GuideArticleStatus.DRAFT, contentVersion: nextVersion }, blocks),
          origin: REVISION_ORIGIN,
          editorId: actorId,
          changeNote: `Unpublished by ${actorId}`,
          status: RevisionStatus.APPROVED,
        },
        manager,
      );

      const result = await articleRepo.update(
        { id, contentVersion: expectedContentVersion },
        { status: GuideArticleStatus.DRAFT, contentVersion: nextVersion },
      );
      if (!result.affected) {
        throw new ConflictException(
          `Guide article ${id} was edited by someone else since you loaded it (expected content_version=${expectedContentVersion}) — reload and try again`,
        );
      }

      const saved = await articleRepo.findOneOrFail({ where: { id } });
      return await this.toView(saved, blocks);
    });
  }

  async flagContentGap(articleId: string, blockId: string, note: string, actorId: string): Promise<void> {
    const block = await this.blockRepo.findOne({ where: { id: blockId, articleId } });
    if (!block) {
      throw new NotFoundException(`Block ${blockId} not found on guide article ${articleId}`);
    }

    await this.ownerDecisionQueueService.enqueue({
      candidateKey: `guide-article:${articleId}:block:${blockId}`,
      field: 'guide_block_content',
      questionType: 'insufficient_sources',
      conflictSummary: note,
      recommendation: 'Confirm or supply a source before this block can publish.',
      failSafe: 'hold_publish',
      actorScope: `guide-article:${articleId}`,
    });

    block.needsDecision = true;
    block.decisionNote = note;
    await this.blockRepo.save(block);

    this.logger.log(`Content gap flagged on guide article ${articleId} block ${blockId} by ${actorId}`);
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private async findArticleOrThrow(id: string): Promise<GuideArticle> {
    const article = await this.articleRepo.findOne({ where: { id } });
    if (!article) throw new NotFoundException(`Guide article ${id} not found`);
    return article;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async replaceBlocks(manager: any, articleId: string, blocks: SaveGuideDraftDto['blocks']): Promise<GuideBlock[]> {
    const blockRepo = manager.getRepository(GuideBlock);
    await blockRepo.delete({ articleId });
    if (blocks.length === 0) return [];
    const entities = blocks.map((b, i) =>
      blockRepo.create({
        articleId,
        position: i,
        blockType: b.blockType,
        content: b.content,
        needsDecision: b.needsDecision ?? false,
        decisionNote: b.decisionNote ?? null,
      }),
    );
    return blockRepo.save(entities);
  }

  // Enforces "Ảnh chỉ dùng media đã có quyền và published." Checks the hero image (if set) and
  // every image_with_rights block's mediaId. No existing helper combines "published AND
  // rights-cleared" (the closest precedent is an ad hoc filter in
  // admin-data/data-quality-audit.service.ts) — this is the first real gate for it.
  private async assertMediaPublishEligible(
    heroMediaId: string | null,
    blocks: GuideBlock[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    manager: any,
  ): Promise<void> {
    const mediaIds = new Set<string>();
    if (heroMediaId) mediaIds.add(heroMediaId);
    for (const block of blocks) {
      if (block.blockType === GuideBlockType.IMAGE_WITH_RIGHTS) {
        const mediaId = (block.content as { mediaId?: string }).mediaId;
        if (mediaId) mediaIds.add(mediaId);
      }
    }
    if (mediaIds.size === 0) return;

    const mediaRepo = manager.getRepository(Media);
    const rows: Media[] = await mediaRepo.find({ where: [...mediaIds].map((id) => ({ id })) });
    const byId = new Map(rows.map((r) => [r.id, r]));

    const ineligible: string[] = [];
    for (const id of mediaIds) {
      const media = byId.get(id);
      if (!media || media.status !== MediaStatus.PUBLISHED || media.licenseType == null) {
        ineligible.push(id);
      }
    }
    if (ineligible.length > 0) {
      throw new BadRequestException(
        `Cannot publish: media not published/rights-cleared: ${ineligible.join(', ')}`,
      );
    }
  }

  // Async: resolves every image_with_rights block's mediaId → imageUrl + attribution + licenseUrl
  // from the real Media row, in one batch query — never duplicated into the block's own content
  // (see GuideBlockDto's shape comment). This is what makes "attribution always visible" true on
  // the actual API response, not just in the render layer's intent.
  private async toView(article: GuideArticle, blocks: GuideBlock[]): Promise<GuideArticleView> {
    const heroImageUrl = article.heroMediaId ? this.mediaUrlService.fileUrl(article.heroMediaId) : null;

    const imageMediaIds = blocks
      .filter((b) => b.blockType === GuideBlockType.IMAGE_WITH_RIGHTS)
      .map((b) => (b.content as { mediaId?: string }).mediaId)
      .filter((id): id is string => Boolean(id));
    const mediaById = new Map<string, Media>();
    if (imageMediaIds.length > 0) {
      const rows = await this.mediaRepo.find({ where: imageMediaIds.map((id) => ({ id })) });
      for (const row of rows) mediaById.set(row.id, row);
    }

    return {
      id: article.id,
      slug: article.slug,
      locale: article.locale,
      title: article.title,
      intro: article.intro,
      heroMediaId: article.heroMediaId,
      heroImageUrl,
      status: article.status,
      contentVersion: article.contentVersion,
      updatedAt: article.updatedAt,
      publishedAt: article.publishedAt,
      blocks: blocks.map((b) => ({
        id: b.id,
        position: b.position,
        blockType: b.blockType,
        content:
          b.blockType === GuideBlockType.IMAGE_WITH_RIGHTS
            ? this.resolveImageBlockContent(b.content, mediaById)
            : b.content,
        needsDecision: b.needsDecision,
        decisionNote: b.decisionNote,
      })),
    };
  }

  private resolveImageBlockContent(
    content: Record<string, unknown>,
    mediaById: Map<string, Media>,
  ): Record<string, unknown> {
    const mediaId = content.mediaId as string | undefined;
    if (!mediaId) return content;
    const media = mediaById.get(mediaId);
    return {
      ...content,
      imageUrl: this.mediaUrlService.fileUrl(mediaId),
      attribution: media?.attribution ?? null,
      licenseUrl: media?.licenseUrl ?? null,
    };
  }
}

// ─── Pure helpers ───────────────────────────────────────────────────────────────

function snapshotOf(article: GuideArticle, blocks: GuideBlock[]): object {
  return {
    slug: article.slug,
    locale: article.locale,
    title: article.title,
    intro: article.intro,
    heroMediaId: article.heroMediaId,
    status: article.status,
    contentVersion: article.contentVersion,
    blocks: blocks
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((b) => ({ position: b.position, blockType: b.blockType, content: b.content })),
  };
}

// Enforces the closed per-blockType content shape declared in the plan — the one place that keeps
// "structured content, not free HTML" true even though the DTO layer only checks "some object".
function validateBlocks(blocks: SaveGuideDraftDto['blocks']): void {
  blocks.forEach((block, index) => {
    const where = `blocks[${index}] (${block.blockType})`;
    const c = block.content;
    switch (block.blockType) {
      case GuideBlockType.SECTION_HEADING:
        requireString(c, 'text', where);
        break;
      case GuideBlockType.RICH_TEXT:
        if (!Array.isArray(c.paragraphs)) {
          throw new BadRequestException(`${where}: content.paragraphs must be an array`);
        }
        break;
      case GuideBlockType.PLACE_COLLECTION:
        requireString(c, 'heading', where);
        requireString(c, 'emptyStateText', where);
        if (!Array.isArray(c.placeSlugs)) {
          throw new BadRequestException(`${where}: content.placeSlugs must be an array`);
        }
        break;
      case GuideBlockType.CALLOUT:
        requireString(c, 'variant', where);
        requireString(c, 'text', where);
        break;
      case GuideBlockType.FAQ:
        if (!Array.isArray(c.items)) {
          throw new BadRequestException(`${where}: content.items must be an array`);
        }
        break;
      case GuideBlockType.IMAGE_WITH_RIGHTS:
        requireString(c, 'mediaId', where);
        break;
    }
  });
}

function requireString(content: Record<string, unknown>, key: string, where: string): void {
  if (typeof content[key] !== 'string' || content[key] === '') {
    throw new BadRequestException(`${where}: content.${key} must be a non-empty string`);
  }
}
