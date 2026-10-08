import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ResultsService } from '../results/results.service';
import { TurnstileService } from '../auth/turnstile.service';
import { CastVoteDto } from './dto/cast-vote.dto';

@Injectable()
export class VotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly results: ResultsService,
    private readonly turnstile: TurnstileService,
  ) {}

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  async castWithEmail(
    dto: CastVoteDto,
    email: string,
    ip: string | undefined,
    userAgent: string | undefined,
  ) {
    if (!(await this.results.isMagicLinkRequired())) {
      throw new ForbiddenException(
        'Email voting is disabled. Refresh and vote in open mode.',
      );
    }
    return this.insertVote(
      {
        universityId: dto.universityId,
        email: this.normalizeEmail(email),
        ip,
        userAgent,
      },
      'This email has already cast a vote.',
    );
  }

  async castOpen(
    dto: CastVoteDto,
    ip: string | undefined,
    userAgent: string | undefined,
  ) {
    if (await this.results.isMagicLinkRequired()) {
      throw new ForbiddenException(
        'Open voting is disabled. Confirm your email with a magic link.',
      );
    }

    const deviceKey = dto.deviceKey?.trim();
    const fingerprintHash = dto.fingerprintHash?.trim();
    if (!deviceKey || !fingerprintHash) {
      throw new UnauthorizedException('Missing device verification.');
    }

    await this.turnstile.verify(dto.turnstileToken, ip);

    const byDevice = await this.prisma.vote.findUnique({
      where: { deviceKey },
      include: { university: true },
    });
    if (byDevice) {
      throw new ConflictException(
        `This browser already voted for ${byDevice.university.name}.`,
      );
    }

    const byFp = await this.prisma.vote.findUnique({
      where: { fingerprintHash },
      include: { university: true },
    });
    if (byFp) {
      throw new ConflictException(
        `This device already voted for ${byFp.university.name}.`,
      );
    }

    // Shared campus NAT: allow a small burst per IP, not a hard single-vote lock.
    if (ip) {
      const ipVotes = await this.prisma.vote.count({
        where: { ip: ip.slice(0, 64) },
      });
      if (ipVotes >= 8) {
        throw new ConflictException(
          'Too many votes from this network. Try again later or use email verification.',
        );
      }
    }

    return this.insertVote(
      {
        universityId: dto.universityId,
        deviceKey,
        fingerprintHash,
        ip,
        userAgent,
      },
      'You have already cast a vote.',
    );
  }

  async hasVotedByEmail(email: string) {
    const voterEmail = this.normalizeEmail(email);
    const existing = await this.prisma.vote.findUnique({
      where: { email: voterEmail },
      include: { university: true },
    });
    if (!existing) {
      return { voted: false as const, email: voterEmail };
    }
    return {
      voted: true as const,
      email: voterEmail,
      universityId: existing.universityId,
      universityName: existing.university.name,
    };
  }

  async hasVotedOpen(deviceKey?: string, fingerprintHash?: string) {
    if (deviceKey) {
      const byDevice = await this.prisma.vote.findUnique({
        where: { deviceKey },
        include: { university: true },
      });
      if (byDevice) {
        return {
          voted: true as const,
          universityId: byDevice.universityId,
          universityName: byDevice.university.name,
        };
      }
    }
    if (fingerprintHash) {
      const byFp = await this.prisma.vote.findUnique({
        where: { fingerprintHash },
        include: { university: true },
      });
      if (byFp) {
        return {
          voted: true as const,
          universityId: byFp.universityId,
          universityName: byFp.university.name,
        };
      }
    }
    return { voted: false as const };
  }

  private async insertVote(
    data: {
      universityId: number;
      email?: string;
      deviceKey?: string;
      fingerprintHash?: string;
      ip?: string;
      userAgent?: string;
    },
    conflictMessage: string,
  ) {
    const open = await this.results.isVotingOpen();
    if (!open) {
      throw new ForbiddenException('Voting is closed.');
    }

    const university = await this.prisma.university.findUnique({
      where: { id: data.universityId },
    });
    if (!university) {
      throw new NotFoundException('University not found');
    }

    try {
      const vote = await this.prisma.$transaction(async (tx) => {
        const created = await tx.vote.create({
          data: {
            universityId: data.universityId,
            email: data.email,
            deviceKey: data.deviceKey,
            fingerprintHash: data.fingerprintHash,
            ip: data.ip?.slice(0, 64),
            userAgent: data.userAgent?.slice(0, 512),
          },
        });

        await tx.voteCount.upsert({
          where: { universityId: data.universityId },
          create: { universityId: data.universityId, count: 1 },
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
        throw new ConflictException(conflictMessage);
      }
      throw err;
    }
  }
}
