import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { GuideArticle } from './entities/guide-article.entity';
import { GuideBlock } from './entities/guide-block.entity';
import { GuideArticlesService } from './guide-articles.service';
import { GuideArticleStatus, GuideBlockType } from './guide-article.enums';
import { MediaUrlService } from '../../core/media-url/media-url.service';
import { RevisionsService } from '../revisions/revisions.service';
import { OwnerDecisionQueueService } from '../owner-decision-queue/owner-decision-queue.service';
import { MediaStatus, MediaLicenseType } from '../media/media.enums';
import { Media } from '../media/entities/media.entity';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function uuid(n = 1): string {
  return `00000000-0000-4000-a000-${String(n).padStart(12, '0')}`;
}

const ACTOR = uuid(99);

function makeArticle(overrides: Partial<GuideArticle> = {}): GuideArticle {
  return {
    id: uuid(1),
    slug: 'phu-quoc',
    locale: 'vi',
    title: 'Cẩm nang Phú Quốc',
    intro: 'Bạn muốn ở đâu, đi đâu?',
    heroMediaId: null,
    status: GuideArticleStatus.DRAFT,
    contentVersion: 1,
    authorId: ACTOR,
    createdAt: new Date(),
    updatedAt: new Date(),
    publishedAt: null,
    publishedBy: null,
    ...overrides,
  };
}

function makeSectionHeadingBlock(articleId: string, overrides: Partial<GuideBlock> = {}): GuideBlock {
  return {
    id: uuid(10),
    articleId,
    position: 0,
    blockType: GuideBlockType.SECTION_HEADING,
    content: { text: 'Ở đâu' },
    needsDecision: false,
    decisionNote: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeDraftDto(overrides: Record<string, unknown> = {}) {
  return {
    slug: 'phu-quoc',
    locale: 'vi' as const,
    title: 'Cẩm nang Phú Quốc',
    intro: 'Bạn muốn ở đâu, đi đâu?',
    blocks: [{ blockType: GuideBlockType.SECTION_HEADING, content: { text: 'Ở đâu' } }],
    ...overrides,
  };
}

// ─── Mock factories ───────────────────────────────────────────────────────────

function makeArticleRepoMock() {
  return { findOne: jest.fn(), findOneOrFail: jest.fn(), find: jest.fn().mockResolvedValue([]) };
}

function makeBlockRepoMock() {
  return { find: jest.fn().mockResolvedValue([]), findOne: jest.fn(), save: jest.fn() };
}

function makeMediaUrlServiceMock() {
  return { fileUrl: jest.fn((id: string) => `https://api.test/media/${id}/file`) };
}

// The OUTER media repo — used by toView() to resolve attribution/licenseUrl for image_with_rights
// blocks on reads (getPublished/getDraft), distinct from the transactional
// manager.getRepository(Media) assertMediaPublishEligible() uses inside publish()'s transaction.
function makeMediaRepoMock() {
  return { find: jest.fn().mockResolvedValue([]) };
}

function makeRevisionsServiceMock() {
  return { recordGuideArticleRevision: jest.fn().mockResolvedValue({ id: uuid(200), revisionNumber: 1 }) };
}

function makeOwnerDecisionQueueServiceMock() {
  return { enqueue: jest.fn().mockResolvedValue({ id: uuid(300) }) };
}

function makeDataSourceMock(transactionImpl?: (manager: unknown) => Promise<void>) {
  const managerArticleRepo = {
    findOne: jest.fn(),
    create: jest.fn((d: Partial<GuideArticle>) => d as GuideArticle),
    save: jest.fn((a: GuideArticle) => Promise.resolve({ ...a, id: a.id ?? uuid(1) })),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    findOneOrFail: jest.fn(),
  };
  const managerBlockRepo = {
    delete: jest.fn().mockResolvedValue({}),
    create: jest.fn((d: Partial<GuideBlock>) => d as GuideBlock),
    save: jest.fn((entities: GuideBlock[]) =>
      Promise.resolve(entities.map((e, i) => ({ ...e, id: e.id ?? uuid(20 + i) }))),
    ),
    find: jest.fn().mockResolvedValue([]),
  };
  const managerMediaRepo = { find: jest.fn().mockResolvedValue([]) };

  const manager = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === GuideArticle) return managerArticleRepo;
      if (entity === GuideBlock) return managerBlockRepo;
      return managerMediaRepo;
    }),
  };

  return {
    transaction: jest.fn().mockImplementation(async (fn: (m: unknown) => Promise<unknown>) => {
      if (transactionImpl) await transactionImpl(manager);
      return fn(manager);
    }),
    manager,
    managerArticleRepo,
    managerBlockRepo,
    managerMediaRepo,
  };
}

async function buildService(opts: {
  articleRepo?: ReturnType<typeof makeArticleRepoMock>;
  blockRepo?: ReturnType<typeof makeBlockRepoMock>;
  mediaRepo?: ReturnType<typeof makeMediaRepoMock>;
  mediaUrlService?: ReturnType<typeof makeMediaUrlServiceMock>;
  revisionsService?: ReturnType<typeof makeRevisionsServiceMock>;
  ownerDecisionQueueService?: ReturnType<typeof makeOwnerDecisionQueueServiceMock>;
  dataSource?: ReturnType<typeof makeDataSourceMock>;
}): Promise<GuideArticlesService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      GuideArticlesService,
      { provide: getRepositoryToken(GuideArticle), useValue: opts.articleRepo ?? makeArticleRepoMock() },
      { provide: getRepositoryToken(GuideBlock), useValue: opts.blockRepo ?? makeBlockRepoMock() },
      { provide: getRepositoryToken(Media), useValue: opts.mediaRepo ?? makeMediaRepoMock() },
      { provide: MediaUrlService, useValue: opts.mediaUrlService ?? makeMediaUrlServiceMock() },
      { provide: RevisionsService, useValue: opts.revisionsService ?? makeRevisionsServiceMock() },
      { provide: OwnerDecisionQueueService, useValue: opts.ownerDecisionQueueService ?? makeOwnerDecisionQueueServiceMock() },
      { provide: getDataSourceToken(), useValue: opts.dataSource ?? makeDataSourceMock() },
    ],
  }).compile();
  return module.get(GuideArticlesService);
}

// ─── getPublished (guest / draft-not-public) ──────────────────────────────────

describe('GuideArticlesService.getPublished', () => {
  it('returns a published article with blocks', async () => {
    const articleRepo = makeArticleRepoMock();
    const article = makeArticle({ status: GuideArticleStatus.PUBLISHED });
    articleRepo.findOne.mockResolvedValue(article);
    const blockRepo = makeBlockRepoMock();
    blockRepo.find.mockResolvedValue([makeSectionHeadingBlock(article.id)]);

    const service = await buildService({ articleRepo, blockRepo });
    const result = await service.getPublished('phu-quoc', 'vi');

    expect(result.status).toBe(GuideArticleStatus.PUBLISHED);
    expect(result.blocks).toHaveLength(1);
    expect(articleRepo.findOne).toHaveBeenCalledWith({
      where: { slug: 'phu-quoc', locale: 'vi', status: GuideArticleStatus.PUBLISHED },
    });
  });

  it('a DRAFT article is NotFoundException — draft không public, regardless of caller', async () => {
    const articleRepo = makeArticleRepoMock();
    // Query itself filters on status=published, so a draft-status row simply never matches — the
    // mock returning null here IS the guarantee under test (see the where clause assertion above).
    articleRepo.findOne.mockResolvedValue(null);

    const service = await buildService({ articleRepo });
    await expect(service.getPublished('phu-quoc', 'vi')).rejects.toThrow(NotFoundException);
  });

  it('resolves attribution/licenseUrl from the real Media row for image_with_rights blocks', async () => {
    const articleRepo = makeArticleRepoMock();
    const article = makeArticle({ status: GuideArticleStatus.PUBLISHED });
    articleRepo.findOne.mockResolvedValue(article);
    const blockRepo = makeBlockRepoMock();
    blockRepo.find.mockResolvedValue([
      { ...makeSectionHeadingBlock(article.id), blockType: GuideBlockType.IMAGE_WITH_RIGHTS, content: { mediaId: uuid(500) } },
    ]);
    const mediaRepo = makeMediaRepoMock();
    mediaRepo.find.mockResolvedValue([
      { id: uuid(500), attribution: 'Trantuonglam / Wikimedia Commons', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/' },
    ]);

    const service = await buildService({ articleRepo, blockRepo, mediaRepo });
    const result = await service.getPublished('phu-quoc', 'vi');

    expect(result.blocks[0]!.content).toMatchObject({
      imageUrl: `https://api.test/media/${uuid(500)}/file`,
      attribution: 'Trantuonglam / Wikimedia Commons',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    });
  });

  it('VI/EN resolve independently (separate slug+locale rows)', async () => {
    const articleRepo = makeArticleRepoMock();
    const viArticle = makeArticle({ id: uuid(1), locale: 'vi', title: 'Cẩm nang Phú Quốc', status: GuideArticleStatus.PUBLISHED });
    const enArticle = makeArticle({ id: uuid(2), locale: 'en', title: 'Phu Quoc Guide', status: GuideArticleStatus.PUBLISHED });
    articleRepo.findOne.mockImplementation(({ where }: { where: { locale: string } }) =>
      Promise.resolve(where.locale === 'vi' ? viArticle : enArticle),
    );
    const blockRepo = makeBlockRepoMock();

    const service = await buildService({ articleRepo, blockRepo });
    const vi = await service.getPublished('phu-quoc', 'vi');
    const en = await service.getPublished('phu-quoc', 'en');

    expect(vi.title).toBe('Cẩm nang Phú Quốc');
    expect(en.title).toBe('Phu Quoc Guide');
    expect(vi.id).not.toBe(en.id);
  });
});

// ─── listAll ──────────────────────────────────────────────────────────────────

describe('GuideArticlesService.listAll', () => {
  it('returns a lightweight summary of every article regardless of status', async () => {
    const articleRepo = makeArticleRepoMock();
    articleRepo.find.mockResolvedValue([
      makeArticle({ id: uuid(1), status: GuideArticleStatus.DRAFT }),
      makeArticle({ id: uuid(2), status: GuideArticleStatus.PUBLISHED }),
    ]);

    const service = await buildService({ articleRepo });
    const result = await service.listAll();

    expect(result).toHaveLength(2);
    expect(result[0]).not.toHaveProperty('blocks');
    expect(result.map((r) => r.status)).toEqual([GuideArticleStatus.DRAFT, GuideArticleStatus.PUBLISHED]);
  });
});

// ─── listPublished (G-D, 2026-09-22) ──────────────────────────────────────────

describe('GuideArticlesService.listPublished', () => {
  it('queries published-only for the given locale, ordered by publishedAt DESC', async () => {
    const articleRepo = makeArticleRepoMock();
    articleRepo.find.mockResolvedValue([]);

    const service = await buildService({ articleRepo });
    await service.listPublished('vi');

    expect(articleRepo.find).toHaveBeenCalledWith({
      where: { locale: 'vi', status: GuideArticleStatus.PUBLISHED },
      order: { publishedAt: 'DESC' },
      take: 100,
    });
  });

  it('trả card shape (slug/locale/title/intro/heroImageUrl/publishedAt) — KHÔNG có blocks', async () => {
    const articleRepo = makeArticleRepoMock();
    articleRepo.find.mockResolvedValue([
      makeArticle({ slug: 'phu-quoc', intro: 'Mọi thứ cần biết.', heroMediaId: uuid(500) }),
    ]);
    const mediaUrlService = makeMediaUrlServiceMock();

    const service = await buildService({ articleRepo, mediaUrlService });
    const result = await service.listPublished('vi');

    expect(result).toEqual([
      {
        slug: 'phu-quoc',
        locale: 'vi',
        title: 'Cẩm nang Phú Quốc',
        intro: 'Mọi thứ cần biết.',
        heroImageUrl: `https://api.test/media/${uuid(500)}/file`,
        publishedAt: null,
      },
    ]);
    expect(result[0]).not.toHaveProperty('blocks');
  });

  it('không có heroMediaId → heroImageUrl null, KHÔNG gọi mediaUrlService', async () => {
    const articleRepo = makeArticleRepoMock();
    articleRepo.find.mockResolvedValue([makeArticle({ heroMediaId: null })]);
    const mediaUrlService = makeMediaUrlServiceMock();

    const service = await buildService({ articleRepo, mediaUrlService });
    const result = await service.listPublished('vi');

    expect(result[0].heroImageUrl).toBeNull();
    expect(mediaUrlService.fileUrl).not.toHaveBeenCalled();
  });

  it('không có bài nào published cho locale này → mảng rỗng, không lỗi', async () => {
    const articleRepo = makeArticleRepoMock();
    articleRepo.find.mockResolvedValue([]);

    const service = await buildService({ articleRepo });
    await expect(service.listPublished('en')).resolves.toEqual([]);
  });
});

// ─── createDraft ─────────────────────────────────────────────────────────────

describe('GuideArticlesService.createDraft', () => {
  it('creates article + blocks + revision', async () => {
    const articleRepo = makeArticleRepoMock();
    articleRepo.findOne.mockResolvedValue(null); // no existing slug+locale
    const revisionsService = makeRevisionsServiceMock();
    const dataSource = makeDataSourceMock();

    const service = await buildService({ articleRepo, revisionsService, dataSource });
    const result = await service.createDraft(makeDraftDto() as never, ACTOR);

    expect(result.status).toBe(GuideArticleStatus.DRAFT);
    expect(result.contentVersion).toBe(1);
    expect(dataSource.managerBlockRepo.save).toHaveBeenCalled();
    expect(revisionsService.recordGuideArticleRevision).toHaveBeenCalledWith(
      expect.objectContaining({ editorId: ACTOR }),
      dataSource.manager,
    );
  });

  it('rejects a duplicate (slug, locale)', async () => {
    const articleRepo = makeArticleRepoMock();
    articleRepo.findOne.mockResolvedValue(makeArticle());

    const service = await buildService({ articleRepo });
    await expect(service.createDraft(makeDraftDto() as never, ACTOR)).rejects.toThrow(ConflictException);
  });

  it('rejects a malformed block (place_collection missing placeSlugs)', async () => {
    const articleRepo = makeArticleRepoMock();
    articleRepo.findOne.mockResolvedValue(null);
    const service = await buildService({ articleRepo });

    const dto = makeDraftDto({
      blocks: [{ blockType: GuideBlockType.PLACE_COLLECTION, content: { heading: 'Ở đâu', emptyStateText: 'Chưa có' } }],
    });
    await expect(service.createDraft(dto as never, ACTOR)).rejects.toThrow(BadRequestException);
  });
});

// ─── saveDraft (CAS) ──────────────────────────────────────────────────────────

describe('GuideArticlesService.saveDraft', () => {
  it('CAS success — content_version increments', async () => {
    const dataSource = makeDataSourceMock();
    dataSource.managerArticleRepo.findOne.mockResolvedValue(makeArticle({ contentVersion: 3 }));
    dataSource.managerArticleRepo.findOneOrFail.mockResolvedValue(makeArticle({ contentVersion: 4 }));

    const service = await buildService({ dataSource });
    const dto = { ...makeDraftDto(), expectedContentVersion: 3 };
    const result = await service.saveDraft(uuid(1), dto as never, ACTOR);

    expect(dataSource.managerArticleRepo.update).toHaveBeenCalledWith(
      { id: uuid(1), contentVersion: 3 },
      expect.objectContaining({ contentVersion: 4 }),
    );
    expect(result.contentVersion).toBe(4);
  });

  it('CAS conflict — stale expectedContentVersion → ConflictException', async () => {
    const dataSource = makeDataSourceMock();
    dataSource.managerArticleRepo.findOne.mockResolvedValue(makeArticle({ contentVersion: 5 }));
    dataSource.managerArticleRepo.update.mockResolvedValue({ affected: 0 });

    const service = await buildService({ dataSource });
    const dto = { ...makeDraftDto(), expectedContentVersion: 3 }; // stale
    await expect(service.saveDraft(uuid(1), dto as never, ACTOR)).rejects.toThrow(ConflictException);
  });

  it('article not found → NotFoundException', async () => {
    const dataSource = makeDataSourceMock();
    dataSource.managerArticleRepo.findOne.mockResolvedValue(null);

    const service = await buildService({ dataSource });
    const dto = { ...makeDraftDto(), expectedContentVersion: 1 };
    await expect(service.saveDraft(uuid(1), dto as never, ACTOR)).rejects.toThrow(NotFoundException);
  });
});

// ─── publish ──────────────────────────────────────────────────────────────────

describe('GuideArticlesService.publish', () => {
  it('happy path — status flips to PUBLISHED, revision APPROVED', async () => {
    const dataSource = makeDataSourceMock();
    dataSource.managerArticleRepo.findOne.mockResolvedValue(makeArticle({ contentVersion: 1, heroMediaId: null }));
    dataSource.managerBlockRepo.find.mockResolvedValue([]); // no image blocks → no media gate to fail
    dataSource.managerArticleRepo.findOneOrFail.mockResolvedValue(
      makeArticle({ contentVersion: 2, status: GuideArticleStatus.PUBLISHED, publishedAt: new Date(), publishedBy: ACTOR }),
    );
    const revisionsService = makeRevisionsServiceMock();

    const service = await buildService({ dataSource, revisionsService });
    const result = await service.publish(uuid(1), 1, ACTOR);

    expect(result.status).toBe(GuideArticleStatus.PUBLISHED);
    expect(revisionsService.recordGuideArticleRevision).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'approved' }),
      dataSource.manager,
    );
  });

  it('blocked — referenced media not published/rights-cleared', async () => {
    const dataSource = makeDataSourceMock();
    const article = makeArticle({ contentVersion: 1, heroMediaId: null });
    dataSource.managerArticleRepo.findOne.mockResolvedValue(article);
    dataSource.managerBlockRepo.find.mockResolvedValue([
      { ...makeSectionHeadingBlock(article.id), blockType: GuideBlockType.IMAGE_WITH_RIGHTS, content: { mediaId: uuid(500) } },
    ]);
    // Media row exists but is not eligible: status=pending
    dataSource.managerMediaRepo.find.mockResolvedValue([
      { id: uuid(500), status: MediaStatus.PENDING, licenseType: null },
    ]);

    const service = await buildService({ dataSource });
    await expect(service.publish(uuid(1), 1, ACTOR)).rejects.toThrow(BadRequestException);
    expect(dataSource.managerArticleRepo.update).not.toHaveBeenCalled();
  });

  it('allows publish when referenced media IS published and rights-cleared', async () => {
    const dataSource = makeDataSourceMock();
    const article = makeArticle({ contentVersion: 1, heroMediaId: null });
    dataSource.managerArticleRepo.findOne.mockResolvedValue(article);
    dataSource.managerBlockRepo.find.mockResolvedValue([
      { ...makeSectionHeadingBlock(article.id), blockType: GuideBlockType.IMAGE_WITH_RIGHTS, content: { mediaId: uuid(500) } },
    ]);
    dataSource.managerMediaRepo.find.mockResolvedValue([
      { id: uuid(500), status: MediaStatus.PUBLISHED, licenseType: MediaLicenseType.OWNER_PROVIDED },
    ]);
    dataSource.managerArticleRepo.findOneOrFail.mockResolvedValue(
      makeArticle({ contentVersion: 2, status: GuideArticleStatus.PUBLISHED }),
    );

    const service = await buildService({ dataSource });
    const result = await service.publish(uuid(1), 1, ACTOR);
    expect(result.status).toBe(GuideArticleStatus.PUBLISHED);
  });

  it('CAS conflict on publish → ConflictException', async () => {
    const dataSource = makeDataSourceMock();
    dataSource.managerArticleRepo.findOne.mockResolvedValue(makeArticle({ contentVersion: 5 }));
    dataSource.managerBlockRepo.find.mockResolvedValue([]);
    dataSource.managerArticleRepo.update.mockResolvedValue({ affected: 0 });

    const service = await buildService({ dataSource });
    await expect(service.publish(uuid(1), 1, ACTOR)).rejects.toThrow(ConflictException);
  });
});

// ─── unpublish (G-B, 2026-09-22) — đối xứng publish() ─────────────────────────

describe('GuideArticlesService.unpublish', () => {
  it('happy path — status flips PUBLISHED → DRAFT, revision APPROVED, publishedAt/publishedBy GIỮ NGUYÊN', async () => {
    const dataSource = makeDataSourceMock();
    dataSource.managerArticleRepo.findOne.mockResolvedValue(
      makeArticle({ contentVersion: 2, status: GuideArticleStatus.PUBLISHED, publishedAt: new Date('2026-08-01'), publishedBy: ACTOR }),
    );
    dataSource.managerArticleRepo.findOneOrFail.mockResolvedValue(
      makeArticle({ contentVersion: 3, status: GuideArticleStatus.DRAFT, publishedAt: new Date('2026-08-01'), publishedBy: ACTOR }),
    );
    const revisionsService = makeRevisionsServiceMock();

    const service = await buildService({ dataSource, revisionsService });
    const result = await service.unpublish(uuid(1), 2, ACTOR);

    expect(result.status).toBe(GuideArticleStatus.DRAFT);
    expect(dataSource.managerArticleRepo.update).toHaveBeenCalledWith(
      { id: uuid(1), contentVersion: 2 },
      { status: GuideArticleStatus.DRAFT, contentVersion: 3 },
    );
    expect(revisionsService.recordGuideArticleRevision).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'approved', origin: expect.anything() }),
      dataSource.manager,
    );
  });

  it('không áp assertMediaPublishEligible — gỡ công khai một bài có ảnh chưa duyệt vẫn thành công (điều kiện đó chỉ áp cho publish, không áp cho unpublish)', async () => {
    const dataSource = makeDataSourceMock();
    const article = makeArticle({ contentVersion: 1, status: GuideArticleStatus.PUBLISHED });
    dataSource.managerArticleRepo.findOne.mockResolvedValue(article);
    dataSource.managerBlockRepo.find.mockResolvedValue([
      { ...makeSectionHeadingBlock(article.id), blockType: GuideBlockType.IMAGE_WITH_RIGHTS, content: { mediaId: uuid(500) } },
    ]);
    dataSource.managerMediaRepo.find.mockResolvedValue([
      { id: uuid(500), status: MediaStatus.PENDING, licenseType: null }, // would BLOCK publish()
    ]);
    dataSource.managerArticleRepo.findOneOrFail.mockResolvedValue(
      makeArticle({ contentVersion: 2, status: GuideArticleStatus.DRAFT }),
    );

    const service = await buildService({ dataSource });
    const result = await service.unpublish(uuid(1), 1, ACTOR);
    expect(result.status).toBe(GuideArticleStatus.DRAFT);
  });

  it('không tìm thấy article → NotFoundException, KHÔNG update/ghi revision', async () => {
    const dataSource = makeDataSourceMock();
    dataSource.managerArticleRepo.findOne.mockResolvedValue(null);
    const revisionsService = makeRevisionsServiceMock();

    const service = await buildService({ dataSource, revisionsService });
    await expect(service.unpublish(uuid(1), 1, ACTOR)).rejects.toThrow(NotFoundException);
    expect(dataSource.managerArticleRepo.update).not.toHaveBeenCalled();
    expect(revisionsService.recordGuideArticleRevision).not.toHaveBeenCalled();
  });

  it('CAS conflict on unpublish → ConflictException', async () => {
    const dataSource = makeDataSourceMock();
    dataSource.managerArticleRepo.findOne.mockResolvedValue(makeArticle({ contentVersion: 5, status: GuideArticleStatus.PUBLISHED }));
    dataSource.managerArticleRepo.update.mockResolvedValue({ affected: 0 });

    const service = await buildService({ dataSource });
    await expect(service.unpublish(uuid(1), 1, ACTOR)).rejects.toThrow(ConflictException);
  });
});

// ─── flagContentGap (Owner Decision Queue hook) ───────────────────────────────

describe('GuideArticlesService.flagContentGap', () => {
  it('enqueues an ODQ item and marks the block needs_decision', async () => {
    const blockRepo = makeBlockRepoMock();
    const block = makeSectionHeadingBlock(uuid(1));
    blockRepo.findOne.mockResolvedValue(block);
    blockRepo.save.mockImplementation((b: GuideBlock) => Promise.resolve(b));
    const ownerDecisionQueueService = makeOwnerDecisionQueueServiceMock();

    const service = await buildService({ blockRepo, ownerDecisionQueueService });
    await service.flagContentGap(uuid(1), block.id, 'Chưa xác nhận giờ mở cửa', ACTOR);

    expect(ownerDecisionQueueService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateKey: `guide-article:${uuid(1)}:block:${block.id}`,
        field: 'guide_block_content',
        questionType: 'insufficient_sources',
        failSafe: 'hold_publish',
      }),
    );
    expect(blockRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ needsDecision: true, decisionNote: 'Chưa xác nhận giờ mở cửa' }),
    );
  });

  it('throws NotFoundException for a block not on this article', async () => {
    const blockRepo = makeBlockRepoMock();
    blockRepo.findOne.mockResolvedValue(null);
    const service = await buildService({ blockRepo });
    await expect(service.flagContentGap(uuid(1), uuid(2), 'note', ACTOR)).rejects.toThrow(NotFoundException);
  });
});

// ─── authorization contract ────────────────────────────────────────────────────
describe('GuideArticlesService — authorization contract', () => {
  it('every write method requires actorId (set by guard-verified @CurrentUser)', () => {
    expect(GuideArticlesService.prototype.createDraft.length).toBe(2);
    expect(GuideArticlesService.prototype.saveDraft.length).toBe(3);
    expect(GuideArticlesService.prototype.publish.length).toBe(3);
    expect(GuideArticlesService.prototype.unpublish.length).toBe(3);
    expect(GuideArticlesService.prototype.flagContentGap.length).toBe(4);
  });
});
