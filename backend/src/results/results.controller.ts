import { Controller, Get, Logger } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ResultsService } from './results.service';

@Controller('api')
export class ResultsController {
  private readonly logger = new Logger(ResultsController.name);

  constructor(private readonly resultsService: ResultsService) {}

  @Get('results')
  @SkipThrottle()
  async results() {
    try {
      return await this.resultsService.getResults();
    } catch (err) {
      this.logger.error(`GET /api/results: ${String(err)}`);
      return {
        totalVotes: 0,
        updatedAt: new Date().toISOString(),
        votingEndsAt: new Date('2026-11-10T17:59:59.000Z').toISOString(),
        votingOpen: true,
        magicLinkRequired: true,
        universities: [],
        dailyVotes: [],
        periodStats: this.resultsService.emptyPeriodStats(),
      };
    }
  }

  @Get('universities')
  @SkipThrottle()
  async universities() {
    try {
      return await this.resultsService.listUniversities();
    } catch (err) {
      this.logger.error(`GET /api/universities: ${String(err)}`);
      return [];
    }
  }
}