import { Body, Controller, Headers, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CastVoteDto } from './dto/cast-vote.dto';
import { VotesService } from './votes.service';

@Controller('api/votes')
export class VotesController {
  constructor(private readonly votesService: VotesService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  cast(
    @Body() dto: CastVoteDto,
    @Req() req: Request,
    @Headers('user-agent') userAgent?: string,
  ) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip;
    return this.votesService.castVote(dto, ip, userAgent);
  }

  @Post('status')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  status(@Body() body: { googleIdToken: string }) {
    return this.votesService.hasVoted(body.googleIdToken);
  }
}
