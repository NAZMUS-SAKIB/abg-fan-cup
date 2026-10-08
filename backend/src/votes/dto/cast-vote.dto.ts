import { IsInt, Min } from 'class-validator';

export class CastVoteDto {
  @IsInt()
  @Min(1)
  universityId!: number;
}
