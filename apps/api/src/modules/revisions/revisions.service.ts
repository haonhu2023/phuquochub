import { Injectable } from '@nestjs/common';
import { RevisionsRepository } from './repositories/revisions.repository';
import { RevisionEntityType, RevisionOrigin, RevisionStatus } from './revision.enums';
import { toWikiRevision } from './revisions.mapper';

export interface RecordPlaceRevisionInput {
  placeId: string;
  // Snapshot nội dung được serialize sang jsonb → chấp nhận mọi object JSON (kể cả DTO
  // có kiểu cụ thể như PlaceCard). Record<string, unknown> quá hẹp: từ chối interface.
  snapshot: object;
  diff?: Record<string, unknown> | null;
  origin: RevisionOrigin;
  changeNote?: string | null;
  editorId?: string | null;
  status: RevisionStatus;
}

// Dịch vụ phiên bản (WikiRevision). Ghi vết mỗi thay đổi nội dung (WF-14) và
// phục vụ lịch sử công khai. Vòng đời duyệt đầy đủ (pending→approved→materialize
// snapshot) thuộc Sprint 4 (Contributions/Moderation).
@Injectable()
export class RevisionsService {
  constructor(private readonly revisionsRepo: RevisionsRepository) {}

  recordPlaceRevision(input: RecordPlaceRevisionInput): Promise<{ id: string; revisionNumber: number }> {
    return this.revisionsRepo.record({
      entityType: RevisionEntityType.PLACE,
      entityId: input.placeId,
      snapshot: input.snapshot,
      diff: input.diff ?? null,
      origin: input.origin,
      changeNote: input.changeNote ?? null,
      editorId: input.editorId ?? null,
      status: input.status,
    });
  }

  async listByPlace(placeId: string) {
    const rows = await this.revisionsRepo.listByEntity(RevisionEntityType.PLACE, placeId);
    return rows.map(toWikiRevision);
  }
}
