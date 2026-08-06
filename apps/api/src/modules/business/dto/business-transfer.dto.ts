import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

// POST /business/{id}/transfer — UC-B7. `reason` TUỲ CHỌN — ghi vào audit context (BR-B8: transfer
// là hành động đặc quyền, audit đầy đủ), không ảnh hưởng logic transfer.
export class TransferBusinessOwnerDto {
  @IsUUID('4')
  new_owner_id!: string;

  @IsOptional() @IsString() @MaxLength(300)
  @Transform(trim)
  reason?: string;
}
