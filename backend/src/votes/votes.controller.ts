import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CastVoteDto } from './dto/cast-vote.dto';
import { VotesService } from './votes.service';

type VoterRequest = Request & { user?: { email: string; role: 'voter' } };

@Controller('api/votes')
@UseGuards(AuthGuard('voter-jwt'))
export class VotesController {
  constructor(private readonly votesService: VotesService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  cast(
    @Body() dto: CastVoteDto,
    @Req() req: VoterRequest,
    @Headers('user-agent') userAgent?: string,
  ) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip;
    return this.votesService.castVote(dto, req.user!.email, ip, userAgent);
  }

  @Get('status')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  status(@Req() req: VoterRequest) {
    return this.votesService.hasVoted(req.user!.email);
  }

  /** @deprecated Prefer GET /status — kept briefly for older clients */
  @Post('status')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  statusPost(@Req() req: VoterRequest) {
    return this.votesService.hasVoted(req.user!.email);
  }
}
