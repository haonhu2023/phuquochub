import { IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateEventDto {
  @IsString() @MaxLength(200)
  title!: string;

  @IsOptional() @IsString()
  description?: string;

  @IsISO8601()
  start_at!: string;

  @IsISO8601()
  end_at!: string;

  @IsOptional() @IsString() @MaxLength(40)
  timezone?: string;

  @IsOptional() @IsUUID()
  place_id?: string;

  @IsOptional() @IsUUID()
  organizer_id?: string;

  @IsOptional() @IsString() @MaxLength(60)
  event_category?: string;

  @IsOptional() @IsString() @MaxLength(300)
  recurrence_rule?: string;
}
