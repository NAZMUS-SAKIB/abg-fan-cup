import { Module } from '@nestjs/common';
import { GoogleAuthService } from '../google/google-auth.service';
import { ResultsModule } from '../results/results.module';
import { VotesController } from './votes.controller';
import { VotesService } from './votes.service';

@Module({
  imports: [ResultsModule],
  controllers: [VotesController],
  providers: [VotesService, GoogleAuthService],
})
export class VotesModule {}
