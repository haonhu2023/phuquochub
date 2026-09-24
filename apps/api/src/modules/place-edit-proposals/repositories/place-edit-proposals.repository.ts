import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, FindOptionsWhere, Repository } from 'typeorm';
import { PlaceEditProposal } from '../entities/place-edit-proposal.entity';
import { PlaceEditProposalStatus } from '../place-edit-proposals.enums';

export interface ListProposalsFilter {
  status?: PlaceEditProposalStatus;
  placeId?: string;
}

@Injectable()
export class PlaceEditProposalsRepository {
  constructor(
    @InjectRepository(PlaceEditProposal)
    private readonly repo: Repository<PlaceEditProposal>,
  ) {}

  private target(manager?: EntityManager): Repository<PlaceEditProposal> {
    return manager ? manager.getRepository(PlaceEditProposal) : this.repo;
  }

  create(data: Partial<PlaceEditProposal>): PlaceEditProposal {
    return this.repo.create(data);
  }

  save(row: PlaceEditProposal, manager?: EntityManager): Promise<PlaceEditProposal> {
    return this.target(manager).save(row);
  }

  findById(id: string, manager?: EntityManager): Promise<PlaceEditProposal | null> {
    return this.target(manager).findOne({ where: { id } });
  }

  // Concurrency guard for decide() (task requirement: "duyệt đồng thời không áp dụng hai lần") —
  // `pessimistic_write` takes a row-level `SELECT ... FOR UPDATE` lock inside the caller's
  // transaction. A second concurrent decide() attempt on the SAME proposal blocks here until the
  // first transaction commits, then re-reads the row and sees a non-PENDING status — the service
  // layer is what actually refuses the double-apply (this method only guarantees the read is
  // serialized, it does not itself decide anything).
  findByIdForUpdate(id: string, manager: EntityManager): Promise<PlaceEditProposal | null> {
    return manager.getRepository(PlaceEditProposal).findOne({
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
  }

  // Anti-duplicate check (task requirement: "ngăn gửi trùng") — mirrors the partial unique index
  // `uq_place_edit_proposal_pending_per_proposer_field` (belt-and-suspenders: this is the
  // friendly-error path, the index is the actual DB-level guarantee if this check is ever raced).
  findPendingByProposerFieldPlace(
    placeId: string,
    fieldKey: PlaceEditProposal['fieldKey'],
    proposerId: string,
  ): Promise<PlaceEditProposal | null> {
    return this.repo.findOne({
      where: { placeId, fieldKey, proposerId, status: PlaceEditProposalStatus.PENDING },
    });
  }

  async list(filter: ListProposalsFilter): Promise<PlaceEditProposal[]> {
    const where: FindOptionsWhere<PlaceEditProposal> = {};
    if (filter.status) where.status = filter.status;
    if (filter.placeId) where.placeId = filter.placeId;
    return this.repo.find({ where, order: { createdAt: 'DESC' } });
  }
}
