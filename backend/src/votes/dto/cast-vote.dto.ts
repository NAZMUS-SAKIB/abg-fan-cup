import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';

export class CastVoteDto {
  @IsInt()
  @Min(1)
  universityId!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  googleIdToken!: string;
}
