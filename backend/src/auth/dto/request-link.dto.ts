import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class RequestLinkDto {
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(254)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  turnstileToken?: string;
}
