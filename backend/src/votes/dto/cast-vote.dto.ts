import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CastVoteDto {
  @IsInt()
  @Min(1)
  universityId!: number;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  deviceKey?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  fingerprintHash?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  turnstileToken?: string;
}
