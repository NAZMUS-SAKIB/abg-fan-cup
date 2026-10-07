import { IsISO8601, IsNotEmpty } from 'class-validator';

export class UpdateVotingEndDto {
  @IsNotEmpty()
  @IsISO8601()
  votingEndsAt!: string;
}