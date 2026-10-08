import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CastVoteDto } from './dto/cast-vote.dto';
import { VotesService } from './votes.service';

type VoterRequest = Request & { user?: { email: string; role: 'voter' } };

function clientIp(req: Request): string | undefined {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip
  );
}

@Controller('api/votes')
export class VotesController {
  constructor(private readonly votesService: VotesService) {}

  @Post()
  @UseGuards(AuthGuard('voter-jwt'))
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  cast(
    @Body() dto: CastVoteDto,
    @Req() req: VoterRequest,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.votesService.castWithEmail(
      dto,
      req.user!.email,
      clientIp(req),
      userAgent,
    );
  }

  @Post('open')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  castOpen(
    @Body() dto: CastVoteDto,
    @Req() req: Request,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.votesService.castOpen(dto, clientIp(req), userAgent);
  }

  @Get('status')
  @UseGuards(AuthGuard('voter-jwt'))
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  status(@Req() req: VoterRequest) {
    return this.votesService.hasVotedByEmail(req.user!.email);
  }

  @Get('open-status')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  openStatus(
    @Query('deviceKey') deviceKey?: string,
    @Query('fingerprintHash') fingerprintHash?: string,
  ) {
    return this.votesService.hasVotedOpen(deviceKey, fingerprintHash);
  }

  @Post('status')
  @UseGuards(AuthGuard('voter-jwt'))
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  statusPost(@Req() req: VoterRequest) {
    return this.votesService.hasVotedByEmail(req.user!.email);
  }
}
