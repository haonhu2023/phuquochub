import { IsEnum, IsUUID } from 'class-validator';
import { SavedItemTargetType } from '../saved-items.enums';

export class CreateSavedItemDto {
  @IsEnum(SavedItemTargetType)
  target_type!: SavedItemTargetType;

  @IsUUID()
  target_id!: string;
}
