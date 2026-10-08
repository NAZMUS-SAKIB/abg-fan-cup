import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import { ResultsService } from '../results/results.service';
import { AdminLoginDto } from './dto/admin-login.dto';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly results: ResultsService,
  ) {}

  async login(dto: AdminLoginDto) {
    const admin = await this.prisma.admin.findUnique({
      where: { username: dto.username },
    });
    if (!admin) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await bcrypt.compare(dto.password, admin.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const accessToken = await this.jwt.signAsync({
      sub: admin.id,
      username: admin.username,
      role: 'admin',
    });
    return { accessToken, username: admin.username };
  }

  async summary() {
    return this.results.getResults();
  }

  async updateVotingEndsAt(iso: string) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid voting end date');
    }
    const votingEndsAt = await this.results.setVotingEndsAt(date);
    return {
      votingEndsAt: votingEndsAt.toISOString(),
      votingOpen: Date.now() < votingEndsAt.getTime(),
    };
  }

  async createUniversity(name: string) {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new BadRequestException('University name is required');
    }

    const maxOrder = await this.prisma.university.aggregate({
      _max: { sortOrder: true },
    });
    const sortOrder = (maxOrder._max.sortOrder ?? -1) + 1;

    try {
      const uni = await this.prisma.university.create({
        data: { name: trimmed, sortOrder },
      });
      await this.prisma.voteCount.create({
        data: { universityId: uni.id, count: 0 },
      });
      this.results.invalidateCache();
      return uni;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('University name already exists');
      }
      throw err;
    }
  }

  async renameUniversity(id: number, name: string) {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new BadRequestException('University name is required');
    }

    const existing = await this.prisma.university.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('University not found');
    }

    try {
      const updated = await this.prisma.university.update({
        where: { id },
        data: { name: trimmed },
      });
      this.results.invalidateCache();
      return updated;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('University name already exists');
      }
      throw err;
    }
  }

  async deleteUniversity(id: number) {
    const existing = await this.prisma.university.findUnique({
      where: { id },
      include: { count: true },
    });
    if (!existing) {
      throw new NotFoundException('University not found');
    }

    const votes = existing.count?.count ?? 0;
    if (votes > 0) {
      throw new ConflictException(
        'Cannot delete a university that has received votes',
      );
    }

    await this.prisma.$transaction([
      this.prisma.voteCount.delete({ where: { universityId: id } }),
      this.prisma.university.delete({ where: { id } }),
    ]);
    this.results.invalidateCache();
    return { ok: true };
  }

  async exportExcel(): Promise<Buffer> {
    const [votes, results] = await Promise.all([
      this.prisma.vote.findMany({
        orderBy: { createdAt: 'desc' },
        include: { university: true },
      }),
      this.results.getResults(),
    ]);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'ABG Fan Cup';
    workbook.created = new Date();

    const summary = workbook.addWorksheet('Summary');
    summary.columns = [
      { header: 'Rank', key: 'rank', width: 8 },
      { header: 'University', key: 'name', width: 48 },
      { header: 'Votes', key: 'votes', width: 12 },
      { header: 'Percent', key: 'percent', width: 12 },
    ];
    results.universities.forEach((u, i) => {
      summary.addRow({
        rank: i + 1,
        name: u.name,
        votes: u.votes,
        percent: Number(u.percent.toFixed(2)),
      });
    });
    summary.addRow({});
    summary.addRow({ rank: '', name: 'TOTAL', votes: results.totalVotes });
    summary.addRow({
      rank: '',
      name: 'Voting ends at',
      votes: results.votingEndsAt,
    });

    const detail = workbook.addWorksheet('Votes');
    detail.columns = [
      { header: 'ID', key: 'id', width: 10 },
      { header: 'University', key: 'university', width: 48 },
      { header: 'Email', key: 'email', width: 36 },
      { header: 'IP', key: 'ip', width: 18 },
      { header: 'Voted At (UTC)', key: 'createdAt', width: 24 },
    ];
    for (const v of votes) {
      detail.addRow({
        id: v.id,
        university: v.university.name,
        email: v.email,
        ip: v.ip ?? '',
        createdAt: v.createdAt.toISOString(),
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}