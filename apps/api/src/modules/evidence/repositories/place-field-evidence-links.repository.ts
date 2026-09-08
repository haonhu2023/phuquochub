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

  // Idempotency check theo UNIQUE(place_id, field_name, evidence_artifact_id, field_value_hash) ở
  // migration — cùng nguyên tắc EvidenceArtifactsRepository.findLink. Bao gồm fieldValueHash: cùng
  // artifact re-link SAU KHI giá trị field đổi phải là một hàng MỚI (đang hỗ trợ giá trị khác), không
  // bị coi là trùng với hàng cũ.
  findLink(placeId: string, fieldName: string, evidenceArtifactId: string, fieldValueHash: string): Promise<PlaceFieldEvidenceLink | null> {
    return this.repo.findOne({ where: { placeId, fieldName, evidenceArtifactId, fieldValueHash } });
  }

  // Lookup theo place + field — TOÀN BỘ lịch sử (mọi field_value_hash), dùng index
  // idx_place_field_evidence_link_place_field. Dùng cho audit/lịch sử — KHÔNG phải bằng chứng cho
  // giá trị hiện tại (xem listCurrentByPlaceAndField).
  listByPlaceAndField(placeId: string, fieldName: string): Promise<PlaceFieldEvidenceLink[]> {
    return this.repo.find({ where: { placeId, fieldName }, order: { createdAt: 'ASC' } });
  }

  // Chỉ những hàng có field_value_hash KHỚP giá trị hiện tại (caller tính hash từ giá trị field đọc
  // trực tiếp lúc gọi — xem EvidenceService.listCurrentEvidenceForPlaceField). Đây là truy vấn duy
  // nhất được phép diễn giải là "bằng chứng cho giá trị HIỆN TẠI".
  listCurrentByPlaceAndField(placeId: string, fieldName: string, currentFieldValueHash: string): Promise<PlaceFieldEvidenceLink[]> {
    return this.repo.find({ where: { placeId, fieldName, fieldValueHash: currentFieldValueHash }, order: { createdAt: 'ASC' } });
  }

  create(data: Partial<PlaceFieldEvidenceLink>): PlaceFieldEvidenceLink {
    return this.repo.create(data);
  }

  save(row: PlaceFieldEvidenceLink): Promise<PlaceFieldEvidenceLink> {
    return this.repo.save(row);
  }
}
