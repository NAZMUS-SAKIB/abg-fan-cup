import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ResultsService } from './results.service';

@Controller('api')
export class ResultsController {
  constructor(private readonly resultsService: ResultsService) {}

  @Get('results')
  @SkipThrottle()
  results() {
    return this.resultsService.getResults();
  }

  @Get('universities')
  @SkipThrottle()
  universities() {
    return this.resultsService.listUniversities();
  }
}
