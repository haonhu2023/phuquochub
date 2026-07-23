import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

const CONTACT_TYPES = [
  'HOTLINE', 'PHONE', 'EMAIL', 'WEBSITE', 'FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'ZALO', 'YOUTUBE', 'OTHER',
];

export class CreateContactDto {
  @IsString() @IsIn(CONTACT_TYPES)
  contact_type!: string;

  @IsString() @MaxLength(300)
  value!: string;

  @IsOptional() @IsString() @MaxLength(120)
  label?: string;

  @IsOptional() @IsBoolean()
  is_primary?: boolean;

  @IsOptional() @IsInt()
  display_order?: number;
}

export class UpdateContactDto {
  @IsOptional() @IsString() @IsIn(CONTACT_TYPES)
  contact_type?: string;

  @IsOptional() @IsString() @MaxLength(300)
  value?: string;

  @IsOptional() @IsString() @MaxLength(120)
  label?: string;

  @IsOptional() @IsBoolean()
  is_primary?: boolean;

  @IsOptional() @IsInt()
  display_order?: number;
}
