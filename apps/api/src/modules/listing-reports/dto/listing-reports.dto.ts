import { IsEnum, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ListableTargetType } from '../../../common/listable-target-type.enum';
import { ListingReportReason } from '../listing-reports.enums';

export class CreateListingReportDto {
  @IsEnum(ListableTargetType)
  target_type!: ListableTargetType;

  @IsUUID()
  target_id!: string;

  @IsEnum(ListingReportReason)
  reason!: ListingReportReason;

  @IsOptional() @IsString() @MaxLength(1000)
  description?: string;
}

export class ResolveListingReportDto {
  @IsIn(['resolved', 'dismissed'])
  decision!: 'resolved' | 'dismissed';
}
