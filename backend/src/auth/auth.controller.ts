import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { ConsumeLinkDto } from './dto/consume-link.dto';
import { RequestLinkDto } from './dto/request-link.dto';

type VoterRequest = Request & { user?: { email: string; role: 'voter' } };

function clientIp(req: Request): string | undefined {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.ip
  );
}

@Controller('api/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('request-link')
  @Throttle({ default: { limit: 8, ttl: 60000 } })
  requestLink(@Body() dto: RequestLinkDto, @Req() req: Request) {
    return this.auth.requestLink(dto.email, dto.turnstileToken, clientIp(req));
  }

  @Post('consume-link')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  consumeLink(@Body() dto: ConsumeLinkDto) {
    return this.auth.consumeLink(dto.token);
  }

  @Get('me')
  @UseGuards(AuthGuard('voter-jwt'))
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  me(@Req() req: VoterRequest) {
    return this.auth.statusForEmail(req.user!.email);
  }
}
