import { IsBoolean } from 'class-validator';

export class UpdateVotingSettingsDto {
  @IsBoolean()
  magicLinkRequired!: boolean;
}
