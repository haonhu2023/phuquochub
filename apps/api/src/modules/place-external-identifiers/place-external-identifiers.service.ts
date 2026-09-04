import { BadRequestException, Injectable } from '@nestjs/common';
import { PlaceExternalIdentifiersRepository } from './repositories/place-external-identifiers.repository';
import { PlaceExternalIdentifier } from './entities/place-external-identifier.entity';
import { PlaceExternalIdentifierProvider } from './place-external-identifiers.enums';

export interface EnsureIdentifierInput {
  placeId: string;
  provider: PlaceExternalIdentifierProvider;
  externalId: string;
  isPrimary?: boolean;
  sourceId?: string | null;
  evidenceId?: string | null;
  verifiedAt?: Date | null;
}

// Idempotent theo (provider, external_id) — cùng nguyên tắc VerifiedFactsIngestionService.ensureSource
// (dedupe theo type+externalRef): gọi lại với đúng place + đúng identifier là no-op, không tạo hàng
// thứ hai. Gọi với CÙNG identifier nhưng KHÁC place bị từ chối — một Google Place ID không được gán
// cho hai place khác nhau trong CSDL này (xung đột danh tính, không phải điều kiện im lặng bỏ qua).
@Injectable()
export class PlaceExternalIdentifiersService {
  constructor(private readonly repo: PlaceExternalIdentifiersRepository) {}

  async ensureIdentifier(input: EnsureIdentifierInput): Promise<PlaceExternalIdentifier> {
    const existing = await this.repo.findByProviderAndExternalId(input.provider, input.externalId);
    if (existing) {
      if (existing.placeId !== input.placeId) {
        throw new BadRequestException(
          `${input.provider} identifier "${input.externalId}" is already mapped to place ${existing.placeId}; ` +
            `refusing to also map it to ${input.placeId}. Resolve the identity conflict before retrying.`,
        );
      }
      return existing; // idempotent no-op — same place, same provider, same external id
    }

    const row = this.repo.create({
      placeId: input.placeId,
      provider: input.provider,
      externalId: input.externalId,
      isPrimary: input.isPrimary ?? true,
      sourceId: input.sourceId ?? null,
      evidenceId: input.evidenceId ?? null,
      verifiedAt: input.verifiedAt ?? null,
    });
    return this.repo.save(row);
  }

  listByPlace(placeId: string): Promise<PlaceExternalIdentifier[]> {
    return this.repo.listByPlace(placeId);
  }
}
