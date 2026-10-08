import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ResultsModule } from '../results/results.module';
import { VotesController } from './votes.controller';
import { VotesService } from './votes.service';

@Module({
  imports: [ResultsModule, AuthModule],
  controllers: [VotesController],
  providers: [VotesService],
})
export class VotesModule {}
