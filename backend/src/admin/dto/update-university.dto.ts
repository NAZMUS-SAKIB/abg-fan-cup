import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateUniversityDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(120)
  name!: string;
}
