import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlaceFieldEvidenceLink } from '../entities/place-field-evidence-link.entity';

@Injectable()
export class PlaceFieldEvidenceLinksRepository {
  constructor(
    @InjectRepository(PlaceFieldEvidenceLink)
    private readonly repo: Repository<PlaceFieldEvidenceLink>,
  ) {}

  // Idempotency check theo UNIQUE(place_id, field_name, evidence_artifact_id) ở migration — cùng
  // nguyên tắc EvidenceArtifactsRepository.findLink.
  findLink(placeId: string, fieldName: string, evidenceArtifactId: string): Promise<PlaceFieldEvidenceLink | null> {
    return this.repo.findOne({ where: { placeId, fieldName, evidenceArtifactId } });
  }

  // Lookup theo place + field — dùng index idx_place_field_evidence_link_place_field.
  listByPlaceAndField(placeId: string, fieldName: string): Promise<PlaceFieldEvidenceLink[]> {
    return this.repo.find({ where: { placeId, fieldName }, order: { createdAt: 'ASC' } });
  }

  create(data: Partial<PlaceFieldEvidenceLink>): PlaceFieldEvidenceLink {
    return this.repo.create(data);
  }

  save(row: PlaceFieldEvidenceLink): Promise<PlaceFieldEvidenceLink> {
    return this.repo.save(row);
  }
}
