import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export enum TourTypeDto {
  DIVING = 'diving',
  FISHING = 'fishing',
  TREKKING = 'trekking',
  SIGHTSEEING = 'sightseeing',
  CRUISE = 'cruise',
  OTHER = 'other',
}
export enum TourDifficultyDto {
  EASY = 'easy',
  MODERATE = 'moderate',
  HARD = 'hard',
}

class GeoPointDto {
  @IsNumber() @Min(-90) @Max(90) @Type(() => Number)
  lat!: number;
  @IsNumber() @Min(-180) @Max(180) @Type(() => Number)
  lng!: number;
}

export class CreateTourDto {
  @IsString() @MaxLength(200)
  name!: string;

  @ValidateNested() @Type(() => GeoPointDto)
  location!: GeoPointDto;

  @IsEnum(TourTypeDto)
  tour_type!: TourTypeDto;

  @IsOptional() @IsInt() @Min(1)
  duration_minutes?: number;

  @IsOptional() @IsEnum(TourDifficultyDto)
  difficulty?: TourDifficultyDto;

  @IsOptional() @IsString() @MaxLength(300)
  short_description?: string;

  @IsOptional() @IsString()
  description?: string;
}
