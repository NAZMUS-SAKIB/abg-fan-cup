import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type PeriodStat = {
  key: '24h' | '7d' | '15d';
  label: string;
  totalVotes: number;
  leaderName: string | null;
  leaderVotes: number;
};

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
  periodStats: PeriodStat[];
};

const PERIOD_WINDOWS: Array<{ key: PeriodStat['key']; label: string; ms: number }> = [
  { key: '24h', label: 'Last 24 hours', ms: 24 * 60 * 60 * 1000 },
  { key: '7d', label: 'Last 7 days', ms: 7 * 24 * 60 * 60 * 1000 },
  { key: '15d', label: 'Last 15 days', ms: 15 * 24 * 60 * 60 * 1000 },
];

@Injectable()
export class ResultsService {
  private readonly logger = new Logger(ResultsService.name);
  private cache: ResultsPayload | null = null;
  private cacheAt = 0;
  private readonly ttlMs = 1500;
  private readonly defaultEndsAt = new Date('2026-11-10T17:59:59.000Z');

  constructor(private readonly prisma: PrismaService) {}

  invalidateCache() {
    this.cache = null;
    this.cacheAt = 0;
  }

  emptyPeriodStats(): PeriodStat[] {
    return PERIOD_WINDOWS.map(({ key, label }) => ({
      key,
      label,
      totalVotes: 0,
      leaderName: null,
      leaderVotes: 0,
    }));
  }

  async getVotingEndsAt(): Promise<Date> {
    try {
      const setting = await this.prisma.setting.findUnique({ where: { id: 1 } });
      if (setting?.votingEndsAt instanceof Date && !Number.isNaN(setting.votingEndsAt.getTime())) {
        return setting.votingEndsAt;
      }
      await this.prisma.setting.create({
        data: { id: 1, votingEndsAt: this.defaultEndsAt },
      });
    } catch (err) {
      this.logger.warn(`getVotingEndsAt fallback: ${String(err)}`);
    }
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
      const endsMs = Date.parse(this.cache.votingEndsAt);
      return {
        ...this.cache,
        votingOpen: Number.isFinite(endsMs) ? now < endsMs : false,
        periodStats: Array.isArray(this.cache.periodStats)
          ? this.cache.periodStats
          : this.emptyPeriodStats(),
        dailyVotes: Array.isArray(this.cache.dailyVotes) ? this.cache.dailyVotes : [],
        universities: Array.isArray(this.cache.universities) ? this.cache.universities : [],
      };
    }

    try {
      const [rows, votingEndsAt, votes] = await Promise.all([
        this.prisma.university.findMany({
          orderBy: { sortOrder: 'asc' },
          include: { count: true },
        }),
        this.getVotingEndsAt(),
        this.prisma.vote.findMany({
          select: { createdAt: true, universityId: true },
          orderBy: { createdAt: 'asc' },
        }),
      ]);

      const safeRows = Array.isArray(rows) ? rows : [];
      const safeVotes = Array.isArray(votes) ? votes : [];
      const nameById = new Map<number, string>();
      for (const u of safeRows) {
        if (typeof u?.id === 'number' && typeof u?.name === 'string' && u.name.trim()) {
          nameById.set(u.id, u.name.trim());
        }
      }

      const mapped = safeRows.map((u) => ({
        id: u.id,
        name: typeof u.name === 'string' ? u.name : `University #${u.id}`,
        votes: typeof u.count?.count === 'number' && u.count.count >= 0 ? u.count.count : 0,
      }));

      const totalVotes = mapped.reduce((sum, u) => sum + u.votes, 0);
      const universities = mapped
        .map((u) => ({
          ...u,
          percent: totalVotes === 0 ? 0 : (u.votes / totalVotes) * 100,
        }))
        .sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name));

      const ends =
        votingEndsAt instanceof Date && !Number.isNaN(votingEndsAt.getTime())
          ? votingEndsAt
          : this.defaultEndsAt;

      let dailyVotes: ResultsPayload['dailyVotes'] = [{ date: this.toDhakaDateKey(new Date()), votes: 0 }];
      let periodStats = this.emptyPeriodStats();
      try {
        dailyVotes = this.buildDailyVotes(
          safeVotes
            .map((v) => v?.createdAt)
            .filter((d): d is Date => d instanceof Date && !Number.isNaN(d.getTime())),
        );
      } catch (err) {
        this.logger.warn(`buildDailyVotes failed: ${String(err)}`);
      }
      try {
        periodStats = this.buildPeriodStats(safeVotes, nameById);
      } catch (err) {
        this.logger.warn(`buildPeriodStats failed: ${String(err)}`);
        periodStats = this.emptyPeriodStats();
      }

      this.cache = {
        totalVotes,
        updatedAt: new Date().toISOString(),
        votingEndsAt: ends.toISOString(),
        votingOpen: Date.now() < ends.getTime(),
        universities,
        dailyVotes,
        periodStats,
      };
      this.cacheAt = now;
      return this.cache;
    } catch (err) {
      this.logger.error(`getResults failed: ${String(err)}`);
      if (this.cache) {
        return {
          ...this.cache,
          periodStats: this.cache.periodStats ?? this.emptyPeriodStats(),
        };
      }
      return {
        totalVotes: 0,
        updatedAt: new Date().toISOString(),
        votingEndsAt: this.defaultEndsAt.toISOString(),
        votingOpen: Date.now() < this.defaultEndsAt.getTime(),
        universities: [],
        dailyVotes: [{ date: this.toDhakaDateKey(new Date()), votes: 0 }],
        periodStats: this.emptyPeriodStats(),
      };
    }
  }

  async listUniversities() {
    try {
      return await this.prisma.university.findMany({
        orderBy: { sortOrder: 'asc' },
        select: { id: true, name: true },
      });
    } catch (err) {
      this.logger.error(`listUniversities failed: ${String(err)}`);
      return [];
    }
  }

  private buildPeriodStats(
    votes: Array<{ createdAt: Date; universityId: number }>,
    nameById: Map<number, string>,
  ): PeriodStat[] {
    const list = Array.isArray(votes) ? votes : [];
    const now = Date.now();

    return PERIOD_WINDOWS.map(({ key, label, ms }) => {
      const since = now - ms;
      const counts = new Map<number, number>();
      let totalVotes = 0;

      for (const v of list) {
        if (!v || typeof v.universityId !== 'number' || !Number.isFinite(v.universityId)) continue;
        const at = v.createdAt;
        if (!(at instanceof Date) || Number.isNaN(at.getTime())) continue;
        if (at.getTime() < since) continue;
        totalVotes += 1;
        counts.set(v.universityId, (counts.get(v.universityId) ?? 0) + 1);
      }

      if (totalVotes === 0) {
        return { key, label, totalVotes: 0, leaderName: null, leaderVotes: 0 };
      }

      let leaderId: number | null = null;
      let leaderVotes = 0;
      for (const [uniId, count] of counts) {
        if (count <= 0) continue;
        const name = nameById.get(uniId) ?? '';
        const leaderName = leaderId === null ? '' : (nameById.get(leaderId) ?? '');
        if (
          leaderId === null ||
          count > leaderVotes ||
          (count === leaderVotes && name.localeCompare(leaderName) < 0)
        ) {
          leaderId = uniId;
          leaderVotes = count;
        }
      }

      const leaderName =
        leaderId === null
          ? null
          : nameById.get(leaderId) ?? `University #${leaderId}`;

      return {
        key,
        label,
        totalVotes,
        leaderName,
        leaderVotes: leaderId === null ? 0 : leaderVotes,
      };
    });
  }

  private buildDailyVotes(createdAts: Date[]): Array<{ date: string; votes: number }> {
    if (!Array.isArray(createdAts) || createdAts.length === 0) {
      return [{ date: this.toDhakaDateKey(new Date()), votes: 0 }];
    }

    const counts = new Map<string, number>();
    for (const at of createdAts) {
      if (!(at instanceof Date) || Number.isNaN(at.getTime())) continue;
      const key = this.toDhakaDateKey(at);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    if (counts.size === 0) {
      return [{ date: this.toDhakaDateKey(new Date()), votes: 0 }];
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
    const parts = (yyyyMmDd ?? '').split('-').map(Number);
    const y = parts[0];
    const m = parts[1];
    const d = parts[2];
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
      return this.toDhakaDateKey(new Date());
    }
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
  }
}