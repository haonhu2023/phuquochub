import { IsEnum, IsOptional, IsString, IsUrl, IsUUID, MaxLength } from 'class-validator';
import { ScopeType } from '../../rbac/rbac.enums';

export class UpdateMeDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  display_name?: string;

  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  avatar_url?: string;
}

export class AssignRoleDto {
  @IsUUID()
  role_id!: string;

  @IsOptional()
  @IsEnum(ScopeType)
  scope_type?: ScopeType;

  @IsOptional()
  @IsUUID()
  business_id?: string;
}
