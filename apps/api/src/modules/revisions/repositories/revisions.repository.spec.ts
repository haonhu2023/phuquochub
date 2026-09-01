import { RevisionsRepository } from './revisions.repository';
import { RevisionEntityType, RevisionOrigin, RevisionStatus } from '../revision.enums';
import type { EntityManager, Repository } from 'typeorm';
import type { WikiRevision } from '../entities/wiki-revision.entity';

describe('RevisionsRepository.record — optional EntityManager (ADR-020 §5 transactional participation)', () => {
  const input = {
    entityType: RevisionEntityType.PLACE_TRANSLATION,
    entityId: 'row-1',
    snapshot: { translatedText: 'x' },
    origin: RevisionOrigin.IMPORT,
    status: RevisionStatus.APPROVED,
  };
  const queryResult = [{ id: 'rev-1', revision_number: 1 }];

  it('uses the module-scoped repository manager when no manager is passed (existing behavior unchanged)', async () => {
    const query = jest.fn().mockResolvedValue(queryResult);
    const repo = { manager: { query }, query } as unknown as Repository<WikiRevision>;
    const revisionsRepo = new RevisionsRepository(repo);

    const result = await revisionsRepo.record(input);

    expect(query).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ id: 'rev-1', revisionNumber: 1 });
  });

  it('runs the INSERT through the passed manager, not the module-scoped repository, when a manager IS given', async () => {
    const defaultQuery = jest.fn().mockResolvedValue(queryResult);
    const repo = { manager: { query: defaultQuery }, query: defaultQuery } as unknown as Repository<WikiRevision>;
    const revisionsRepo = new RevisionsRepository(repo);

    const txQuery = jest.fn().mockResolvedValue(queryResult);
    const manager = { query: txQuery } as unknown as EntityManager;

    const result = await revisionsRepo.record(input, manager);

    expect(txQuery).toHaveBeenCalledTimes(1);
    expect(defaultQuery).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 'rev-1', revisionNumber: 1 });
  });
});
