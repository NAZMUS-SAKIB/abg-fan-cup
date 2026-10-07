import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type ResultsPayload = {
  totalVotes: number;
  updatedAt: string;
  votingEndsAt: string;
  votingOpen: boolean;
  universities: Array<{
    id: number;
    name: string;
    votes: number;
    percent: number;
  }>;
  dailyVotes: Array<{ date: string; votes: number }>;
};

@Injectable()
export class ResultsService {
  private cache: ResultsPayload | null = null;
  private cacheAt = 0;
  private readonly ttlMs = 1500;
  private readonly defaultEndsAt = new Date('2026-11-10T17:59:59.000Z');

  constructor(private readonly prisma: PrismaService) {}

  invalidateCache() {
    this.cache = null;
    this.cacheAt = 0;
  }

  async getVotingEndsAt(): Promise<Date> {
    const setting = await this.prisma.setting.findUnique({ where: { id: 1 } });
    if (setting?.votingEndsAt) return setting.votingEndsAt;
    await this.prisma.setting.create({
      data: { id: 1, votingEndsAt: this.defaultEndsAt },
    });
    return this.defaultEndsAt;
  }

  async isVotingOpen(): Promise<boolean> {
    const ends = await this.getVotingEndsAt();
    return Date.now() < ends.getTime();
  }

  async setVotingEndsAt(votingEndsAt: Date): Promise<Date> {
    const updated = await this.prisma.setting.upsert({
      where: { id: 1 },
      update: { votingEndsAt },
      create: { id: 1, votingEndsAt },
    });
    this.invalidateCache();
    return updated.votingEndsAt;
  }

  async getResults(): Promise<ResultsPayload> {
    const now = Date.now();
    if (this.cache && now - this.cacheAt < this.ttlMs) {
      return {
        ...this.cache,
        votingOpen: now < new Date(this.cache.votingEndsAt).getTime(),
      };
    }

    const [rows, votingEndsAt, voteTimes] = await Promise.all([
      this.prisma.university.findMany({
        orderBy: { sortOrder: 'asc' },
        include: { count: true },
      }),
      this.getVotingEndsAt(),
      this.prisma.vote.findMany({
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const mapped = rows.map((u) => ({
      id: u.id,
      name: u.name,
      votes: u.count?.count ?? 0,
    }));

    const totalVotes = mapped.reduce((sum, u) => sum + u.votes, 0);
    const universities = mapped
      .map((u) => ({
        ...u,
        percent: totalVotes === 0 ? 0 : (u.votes / totalVotes) * 100,
      }))
      .sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name));

    this.cache = {
      totalVotes,
      updatedAt: new Date().toISOString(),
      votingEndsAt: votingEndsAt.toISOString(),
      votingOpen: Date.now() < votingEndsAt.getTime(),
      universities,
      dailyVotes: this.buildDailyVotes(voteTimes.map((v) => v.createdAt)),
    };
    this.cacheAt = now;
    return this.cache;
  }

  async listUniversities() {
    return this.prisma.university.findMany({
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true },
    });
  }

  /** Bucket votes by calendar day in Asia/Dhaka; fill gaps with 0. */
  private buildDailyVotes(createdAts: Date[]): Array<{ date: string; votes: number }> {
    if (createdAts.length === 0) {
      const today = this.toDhakaDateKey(new Date());
      return [{ date: today, votes: 0 }];
    }

    const counts = new Map<string, number>();
    for (const at of createdAts) {
      const key = this.toDhakaDateKey(at);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const keys = [...counts.keys()].sort();
    const start = keys[0];
    const end = this.toDhakaDateKey(new Date());
    const series: Array<{ date: string; votes: number }> = [];

    for (let cur = start; ; ) {
      series.push({ date: cur, votes: counts.get(cur) ?? 0 });
      if (cur === end) break;
      cur = this.nextDhakaDateKey(cur);
      if (series.length > 400) break;
    }

    return series;
  }

  private toDhakaDateKey(date: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Dhaka',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }

  private nextDhakaDateKey(yyyyMmDd: string): string {
    const [y, m, d] = yyyyMmDd.split('-').map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
  }
}