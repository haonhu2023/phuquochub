/* eslint-disable @typescript-eslint/no-explicit-any */
import { ForbiddenException } from '@nestjs/common';
import { SourceFirstIngestService } from './source-first-ingest.service';
import { CandidateInput } from './source-first-publish-evaluator.service';
import { SourceType } from '../sources/sources.enums';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

type Ctor = ConstructorParameters<typeof SourceFirstIngestService>;

const minimalCandidate = (): CandidateInput => ({
  candidateKey: 'test-001',
  name: 'Test Place',
  categorySlug: 'beach',
  lat: 10.05,
  lng: 104.0,
  address: '123 Test St',
  observations: [
    {
      field: 'name',
      observedValue: 'Test Place',
      sourceType: SourceType.OFFICIAL_WEBSITE,
      sourceUrl: 'https://official.com',
      publisher: 'Test',
      retrievedAt: new Date('2026-09-01'),
      confidence: 90,
      isPrimary: true,
    },
  ],
});

describe('SourceFirstIngestService — dry-run & permission gate', () => {
  let dataSource: LooseMock<Ctor[0]>;
  let placesService: LooseMock<Ctor[1]>;
  let placesRepo: LooseMock<Ctor[2]>;
  let categoriesRepo: LooseMock<Ctor[3]>;
  let contactsService: LooseMock<Ctor[4]>;
  let sourcesRepo: LooseMock<Ctor[5]>;
  let attributionsRepo: LooseMock<Ctor[6]>;
  let odqService: LooseMock<Ctor[7]>;
  let extIdsService: LooseMock<Ctor[8]>;
  let evaluator: LooseMock<Ctor[9]>;
  let authzService: LooseMock<Ctor[10]>;
  let revisionsService: LooseMock<Ctor[11]>;
  let service: SourceFirstIngestService;

  beforeEach(() => {
    dataSource = createMock<Ctor[0]>({
      query: jest.fn().mockResolvedValue([]),
    });
    placesService = createMock<Ctor[1]>({
      create: jest.fn(),
      approve: jest.fn(),
    });
    placesRepo = createMock<Ctor[2]>({});
    categoriesRepo = createMock<Ctor[3]>({
      findBySlug: jest.fn().mockResolvedValue({ id: 'cat-uuid', slug: 'beach' }),
    });
    contactsService = createMock<Ctor[4]>({
      createForPlace: jest.fn().mockResolvedValue({}),
    });
    sourcesRepo = createMock<Ctor[5]>({
      findByTypeAndExternalRef: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((d) => d),
      save: jest.fn().mockImplementation((d) => Promise.resolve({ ...d, id: 'src-uuid' })),
    });
    attributionsRepo = createMock<Ctor[6]>({
      listByEntity: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation((d) => d),
      save: jest.fn().mockImplementation((d) => Promise.resolve(d)),
    });
    odqService = createMock<Ctor[7]>({
      enqueue: jest.fn().mockResolvedValue({ id: 'odq-uuid' }),
    });
    extIdsService = createMock<Ctor[8]>({
      ensureIdentifier: jest.fn().mockResolvedValue({}),
    });
    evaluator = createMock<Ctor[9]>({
      evaluate: jest.fn().mockReturnValue({
        verdict: 'PUBLISH',
        holdReasons: [],
        auditNotes: [],
        autoPublishFields: ['name', 'category', 'coordinates', 'address'],
        heldFields: [],
        primarySourceUrl: 'https://official.com',
        primarySourceType: SourceType.OFFICIAL_WEBSITE,
        coverageByField: {},
      }),
    });
    authzService = createMock<Ctor[10]>({
      can: jest.fn().mockResolvedValue(true),
    });
    revisionsService = createMock<Ctor[11]>({
      recordPlaceRevision: jest.fn().mockResolvedValue({ id: 'rev-uuid', revisionNumber: 2 }),
    });

    service = new SourceFirstIngestService(
      dataSource as any,
      placesService as any,
      placesRepo as any,
      categoriesRepo as any,
      contactsService as any,
      sourcesRepo as any,
      attributionsRepo as any,
      odqService as any,
      extIdsService as any,
      evaluator as any,
      authzService as any,
      revisionsService as any,
    );
  });

  describe('dry-run guarantees zero writes', () => {
    it('does not call any write method in dry-run mode', async () => {
      await service.ingestCandidates([minimalCandidate()], {
        dryRun: true,
        actorId: 'actor-uuid',
      });

      expect(placesService.create).not.toHaveBeenCalled();
      expect(placesService.approve).not.toHaveBeenCalled();
      expect(sourcesRepo.save).not.toHaveBeenCalled();
      expect(attributionsRepo.save).not.toHaveBeenCalled();
      expect(odqService.enqueue).not.toHaveBeenCalled();
      expect(contactsService.createForPlace).not.toHaveBeenCalled();
    });

    it('does not call authz in dry-run mode', async () => {
      await service.ingestCandidates([minimalCandidate()], {
        dryRun: true,
        actorId: '',
      });

      expect(authzService.can).not.toHaveBeenCalled();
    });

    it('returns dry_run_would_publish when evaluator says PUBLISH', async () => {
      const summary = await service.ingestCandidates([minimalCandidate()], {
        dryRun: true,
        actorId: 'actor-uuid',
      });

      expect(summary.dryRun).toBe(true);
      expect(summary.results[0].outcome).toBe('dry_run_would_publish');
    });

    it('returns dry_run_would_hold when evaluator says HOLD', async () => {
      (evaluator.evaluate as jest.Mock).mockReturnValue({
        verdict: 'HOLD',
        holdReasons: [
          {
            type: 'insufficient_sources',
            field: 'name',
            summary: 'No authoritative source',
            recommendation: 'Add an official source',
            failSafe: 'hold_publish',
          },
        ],
        auditNotes: [],
        autoPublishFields: [],
        heldFields: ['name'],
        primarySourceUrl: null,
        primarySourceType: null,
        coverageByField: {},
      });

      const summary = await service.ingestCandidates([minimalCandidate()], {
        dryRun: true,
        actorId: 'actor-uuid',
      });

      expect(summary.results[0].outcome).toBe('dry_run_would_hold');
      expect(summary.results[0].holdReasons).toHaveLength(1);
    });
  });

  describe('execute mode — RBAC gate', () => {
    it('throws ForbiddenException when actor lacks Place.Create', async () => {
      (authzService.can as jest.Mock).mockImplementation((_, perm) =>
        Promise.resolve(perm === 'Place.Approve'),
      );

      await expect(
        service.ingestCandidates([minimalCandidate()], {
          dryRun: false,
          actorId: 'actor-uuid',
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(placesService.create).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when actor lacks Place.Approve', async () => {
      (authzService.can as jest.Mock).mockImplementation((_, perm) =>
        Promise.resolve(perm === 'Place.Create'),
      );

      await expect(
        service.ingestCandidates([minimalCandidate()], {
          dryRun: false,
          actorId: 'actor-uuid',
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(placesService.create).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when actorId is empty string', async () => {
      await expect(
        service.ingestCandidates([minimalCandidate()], {
          dryRun: false,
          actorId: '',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('advisory lock', () => {
    it('acquires and releases pg_advisory_lock around candidate processing', async () => {
      await service.ingestCandidates([minimalCandidate()], { dryRun: true, actorId: 'actor-uuid' });

      const queryCalls = (dataSource.query as jest.Mock).mock.calls.map((c: string[]) => c[0] as string);
      expect(queryCalls.some((q) => q.includes('pg_advisory_lock'))).toBe(true);
      expect(queryCalls.some((q) => q.includes('pg_advisory_unlock'))).toBe(true);
    });
  });

  describe('revision workflow', () => {
    it('records APPROVED IMPORT revision after publish', async () => {
      (placesService.create as jest.Mock).mockResolvedValue({ id: 'place-uuid', slug: 'test-place' });
      (placesService.approve as jest.Mock).mockResolvedValue(null);

      await service.ingestCandidates([minimalCandidate()], { dryRun: false, actorId: 'actor-uuid' });

      expect(revisionsService.recordPlaceRevision).toHaveBeenCalledWith(
        expect.objectContaining({
          placeId: 'place-uuid',
          origin: 'import',
          status: 'approved',
        }),
      );
    });

    it('does not record revision in dry-run mode', async () => {
      await service.ingestCandidates([minimalCandidate()], { dryRun: true, actorId: 'actor-uuid' });
      expect(revisionsService.recordPlaceRevision).not.toHaveBeenCalled();
    });
  });

  describe('enrich-existing path', () => {
    const mockPlaceRow = {
      id: 'existing-place-uuid',
      name: 'VinWonders Phú Quốc',
      slug: 'vinwonders-phu-quoc',
      address: 'Bãi Dài, Gành Dầu, Phú Quốc',
      short_description: null,
      lat: '10.3564',
      lng: '103.8458',
      status: 'published',
      updated_at: '2026-08-01T00:00:00.000Z',
    };

    it('returns dry_run_would_enrich_existing when targetSlug resolves with matching domain', async () => {
      // Call order: (1) lock, (2) slug lookup → found, (3) confirmByOfficialDomain place_contacts
      // → no existing website (null), accept by targetSlug assertion,
      // (4) buildEnrichDiffs contacts, (5) buildEnrichDiffs source_attributions evidence,
      // (6) unlock uses default [].
      (dataSource.query as jest.Mock)
        .mockResolvedValueOnce([]) // lock
        .mockResolvedValueOnce([mockPlaceRow]) // slug lookup
        .mockResolvedValueOnce([]); // confirmByOfficialDomain: no existing website → accept

      const summary = await service.ingestCandidates(
        [
          {
            ...minimalCandidate(),
            targetSlug: 'vinwonders-phu-quoc',
            website: 'https://vinwonders.com/page',
            observations: [
              {
                field: 'name',
                observedValue: 'VinWonders Phú Quốc',
                sourceType: SourceType.OFFICIAL_WEBSITE,
                sourceUrl: 'https://vinwonders.com/page',
                publisher: 'VinWonders',
                retrievedAt: new Date('2026-09-15'),
                confidence: 90,
                isPrimary: true,
              },
            ],
          },
        ],
        { dryRun: true, actorId: 'actor-uuid' },
      );

      expect(summary.results[0].outcome).toBe('dry_run_would_enrich_existing');
      expect(summary.results[0].placeId).toBe('existing-place-uuid');
      expect(summary.results[0].slug).toBe('vinwonders-phu-quoc');
      expect(summary.results[0].enrichResult).toBeDefined();
      expect(summary.results[0].enrichResult?.existingPlaceId).toBe('existing-place-uuid');
      expect(summary.results[0].enrichResult?.identityMethod).toBe('slug_and_domain');
      expect(summary.results[0].enrichResult?.casToken).toBe('2026-08-01T00:00:00.000Z');
      expect(summary.enrichedExisting).toBe(1);
    });

    it('fills null fields in fieldsToWrite', async () => {
      // short_description is null in mockPlaceRow → fill_null for candidate.shortDescription
      (dataSource.query as jest.Mock)
        .mockResolvedValueOnce([]) // lock
        .mockResolvedValueOnce([mockPlaceRow]) // slug lookup
        .mockResolvedValueOnce([]); // confirmByOfficialDomain → accept

      const summary = await service.ingestCandidates(
        [
          {
            ...minimalCandidate(),
            targetSlug: 'vinwonders-phu-quoc',
            website: 'https://vinwonders.com/page',
            shortDescription: 'A fun theme park.',
            observations: [
              {
                field: 'name',
                observedValue: 'VinWonders',
                sourceType: SourceType.OFFICIAL_WEBSITE,
                sourceUrl: 'https://vinwonders.com/page',
                publisher: 'VinWonders',
                retrievedAt: new Date('2026-09-15'),
                confidence: 90,
                isPrimary: true,
              },
              {
                field: 'short_description',
                observedValue: 'A fun theme park.',
                sourceType: SourceType.OFFICIAL_WEBSITE,
                sourceUrl: 'https://vinwonders.com/page',
                publisher: 'VinWonders',
                retrievedAt: new Date('2026-09-15'),
                confidence: 90,
              },
            ],
          },
        ],
        { dryRun: true, actorId: 'actor-uuid' },
      );

      const enrichResult = summary.results[0].enrichResult!;
      const descDiff = enrichResult.fieldsToWrite.find((d) => d.field === 'short_description');
      expect(descDiff).toBeDefined();
      expect(descDiff?.action).toBe('fill_null');
      expect(descDiff?.before).toBeNull();
      expect(descDiff?.after).toBe('A fun theme park.');
    });

    it('falls back to create path when official domain confirmation fails', async () => {
      // Existing website contact has a DIFFERENT domain → confirmation fails → create path.
      (dataSource.query as jest.Mock)
        .mockResolvedValueOnce([]) // lock
        .mockResolvedValueOnce([mockPlaceRow]) // slug lookup
        .mockResolvedValueOnce([{ value: 'https://competitor.com' }]); // confirmByOfficialDomain → wrong domain

      // Since create path is taken, categoriesRepo.findBySlug will be called.
      // evaluator returns PUBLISH (default mock) and placesService.create runs (but create is not mocked to return place).
      // We just check outcome is NOT dry_run_would_enrich_existing.
      const summary = await service.ingestCandidates(
        [
          {
            ...minimalCandidate(),
            targetSlug: 'vinwonders-phu-quoc',
            website: 'https://vinwonders.com/page',
            observations: [
              {
                field: 'name',
                observedValue: 'VinWonders',
                sourceType: SourceType.OFFICIAL_WEBSITE,
                sourceUrl: 'https://vinwonders.com/page',
                publisher: 'VinWonders',
                retrievedAt: new Date('2026-09-15'),
                confidence: 90,
                isPrimary: true,
              },
            ],
          },
        ],
        { dryRun: true, actorId: 'actor-uuid' },
      );

      expect(summary.results[0].outcome).not.toBe('dry_run_would_enrich_existing');
      expect(summary.results[0].outcome).toBe('dry_run_would_publish');
    });

    it('does not call any write method in dry-run enrich mode', async () => {
      (dataSource.query as jest.Mock)
        .mockResolvedValueOnce([]) // lock
        .mockResolvedValueOnce([mockPlaceRow]) // slug lookup
        .mockResolvedValueOnce([]); // confirmByOfficialDomain → accept

      await service.ingestCandidates(
        [
          {
            ...minimalCandidate(),
            targetSlug: 'vinwonders-phu-quoc',
            website: 'https://vinwonders.com/page',
            observations: [
              {
                field: 'name',
                observedValue: 'VinWonders',
                sourceType: SourceType.OFFICIAL_WEBSITE,
                sourceUrl: 'https://vinwonders.com/page',
                publisher: 'VinWonders',
                retrievedAt: new Date('2026-09-15'),
                confidence: 90,
                isPrimary: true,
              },
            ],
          },
        ],
        { dryRun: true, actorId: 'actor-uuid' },
      );

      expect(placesService.create).not.toHaveBeenCalled();
      expect(placesService.approve).not.toHaveBeenCalled();
      expect(sourcesRepo.save).not.toHaveBeenCalled();
      expect(attributionsRepo.save).not.toHaveBeenCalled();
      expect(revisionsService.recordPlaceRevision).not.toHaveBeenCalled();
    });
  });

  describe('dedup — hard vs soft', () => {
    it('skips (skipped_duplicate) on external_id match', async () => {
      // Call order with enrich path: (1) lock, (2) resolveEnrichTarget google_places JOIN → [],
      // (3) checkHardDuplicate place_external_identifiers → found.
      (dataSource.query as jest.Mock)
        .mockResolvedValueOnce([]) // pg_advisory_lock
        .mockResolvedValueOnce([]) // resolveEnrichTarget: google_places JOIN places → not found
        .mockResolvedValueOnce([{ place_id: 'existing-uuid' }]); // checkHardDuplicate → found

      const summary = await service.ingestCandidates(
        [{ ...minimalCandidate(), externalIds: [{ provider: 'google_places', externalId: 'ChIJ123' }] }],
        { dryRun: true, actorId: 'actor-uuid' },
      );

      expect(summary.results[0].outcome).toBe('skipped_duplicate');
      expect(summary.results[0].dedupMatch?.type).toBe('external_id');
    });

    it('holds (dry_run_would_hold) on proximity match — does not skip', async () => {
      // Advisory lock fires first. Candidate has no externalIds → checkHardDuplicate skips DB.
      // Second query call is the proximity check.
      (dataSource.query as jest.Mock)
        .mockResolvedValueOnce([]) // pg_advisory_lock
        .mockResolvedValueOnce([{ id: 'nearby-uuid', dist: 30 }]); // proximity check

      const summary = await service.ingestCandidates([minimalCandidate()], {
        dryRun: true,
        actorId: 'actor-uuid',
      });

      expect(summary.results[0].outcome).toBe('dry_run_would_hold');
      expect(summary.results[0].dedupMatch?.type).toBe('proximity_50m');
      expect(summary.results[0].holdReasons?.some((r) => r.type === 'identity_conflict')).toBe(true);
    });
  });
});
