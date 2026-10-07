import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleAuthService } from '../google/google-auth.service';
import { ResultsService } from '../results/results.service';
import { CastVoteDto } from './dto/cast-vote.dto';

@Injectable()
export class VotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly googleAuth: GoogleAuthService,
    private readonly results: ResultsService,
  ) {}

  async castVote(
    dto: CastVoteDto,
    ip: string | undefined,
    userAgent: string | undefined,
  ) {
    const open = await this.results.isVotingOpen();
    if (!open) {
      throw new ForbiddenException('Voting is closed.');
    }

    const identity = await this.googleAuth.verifyIdToken(dto.googleIdToken);

    const university = await this.prisma.university.findUnique({
      where: { id: dto.universityId },
    });
    if (!university) {
      throw new NotFoundException('University not found');
    }

    try {
      const vote = await this.prisma.$transaction(async (tx) => {
        const created = await tx.vote.create({
          data: {
            universityId: dto.universityId,
            googleSub: identity.googleSub,
            email: identity.email,
            ip: ip?.slice(0, 64),
            userAgent: userAgent?.slice(0, 512),
          },
        });

        await tx.voteCount.upsert({
          where: { universityId: dto.universityId },
          create: { universityId: dto.universityId, count: 1 },
          update: { count: { increment: 1 } },
        });

        return created;
      });

      this.results.invalidateCache();

      return {
        ok: true,
        universityId: vote.universityId,
        universityName: university.name,
        message: 'Your Fan Cup vote has been recorded.',
      };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'This Google account has already cast a vote.',
        );
      }
      throw err;
    }
  }

  async hasVoted(googleIdToken: string) {
    const identity = await this.googleAuth.verifyIdToken(googleIdToken);
    const existing = await this.prisma.vote.findUnique({
      where: { googleSub: identity.googleSub },
      include: { university: true },
    });
    if (!existing) {
      return { voted: false as const };
    }
    return {
      voted: true as const,
      universityId: existing.universityId,
      universityName: existing.university.name,
    };
  }
}
