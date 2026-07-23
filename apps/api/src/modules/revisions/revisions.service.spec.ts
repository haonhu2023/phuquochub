import { RevisionsService } from './revisions.service';
import { RevisionEntityType, RevisionOrigin, RevisionStatus } from './revision.enums';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

describe('RevisionsService', () => {
  let repo: LooseMock<ConstructorParameters<typeof RevisionsService>[0]>;
  let service: RevisionsService;

  beforeEach(() => {
    repo = createMock<ConstructorParameters<typeof RevisionsService>[0]>({
      record: jest.fn().mockResolvedValue({ id: 'r1', revisionNumber: 1 }),
      listByEntity: jest.fn().mockResolvedValue([
        {
          id: 'r2',
          revision_number: 2,
          origin: RevisionOrigin.COMMUNITY_EDIT,
          status: RevisionStatus.APPROVED,
          editor_id: 'u1',
          change_note: null,
          created_at: new Date('2026-07-14T00:00:00.000Z'),
        },
      ]),
    });
    service = new RevisionsService(repo);
  });

  it('recordPlaceRevision ghi vết với entity_type=place', async () => {
    const res = await service.recordPlaceRevision({
      placeId: 'p1',
      snapshot: { name: 'Bãi Sao' },
      origin: RevisionOrigin.COMMUNITY_EDIT,
      status: RevisionStatus.PENDING,
    });
    expect(res).toEqual({ id: 'r1', revisionNumber: 1 });
    expect(repo.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: RevisionEntityType.PLACE,
        entityId: 'p1',
        status: RevisionStatus.PENDING,
      }),
    );
  });

  it('listByPlace map row → WikiRevision (khớp openapi)', async () => {
    const res = await service.listByPlace('p1');
    expect(repo.listByEntity).toHaveBeenCalledWith(RevisionEntityType.PLACE, 'p1');
    expect(res[0]).toEqual({
      id: 'r2',
      revision_number: 2,
      origin: 'community_edit',
      status: 'approved',
      editor_id: 'u1',
      change_note: null,
      created_at: new Date('2026-07-14T00:00:00.000Z'),
    });
  });
});
