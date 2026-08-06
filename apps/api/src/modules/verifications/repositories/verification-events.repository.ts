import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { VerificationEvent } from '../entities/verification-event.entity';
import { VerificationMethod } from '../verification.enums';
import { VerificationStatus } from '../../places/place.enums';

export interface NewVerificationEvent {
  verificationId: string;
  fromStatus: VerificationStatus | null;
  toStatus: VerificationStatus;
  method: VerificationMethod;
  sourceId?: string | null;
  actorId: string | null;
  note?: string | null;
}

// Repository `verification_events` (verification.md §5) — APPEND-ONLY, chỉ `append()`, không có
// update/delete nào (bất biến, audit trail).
@Injectable()
export class VerificationEventsRepository {
  constructor(
    @InjectRepository(VerificationEvent)
    private readonly repo: Repository<VerificationEvent>,
  ) {}

  async append(data: NewVerificationEvent, manager?: EntityManager): Promise<VerificationEvent> {
    const repo = manager ? manager.getRepository(VerificationEvent) : this.repo;
    const entity = repo.create({
      verificationId: data.verificationId,
      fromStatus: data.fromStatus,
      toStatus: data.toStatus,
      method: data.method,
      sourceId: data.sourceId ?? null,
      actorId: data.actorId,
      note: data.note ?? null,
    });
    return repo.save(entity);
  }

  listByVerification(verificationId: string, manager?: EntityManager): Promise<VerificationEvent[]> {
    const repo = manager ? manager.getRepository(VerificationEvent) : this.repo;
    return repo.find({ where: { verificationId }, order: { createdAt: 'ASC' } });
  }
}
