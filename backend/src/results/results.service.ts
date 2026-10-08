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
  magicLinkRequired: boolean;
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
  /** Longer TTL under concurrent load; clients poll ~5s */
  private readonly ttlMs = 4000;
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

  async getSettingRow() {
    try {
      let setting = await this.prisma.setting.findUnique({ where: { id: 1 } });
      if (!setting) {
        setting = await this.prisma.setting.create({
          data: {
            id: 1,
            votingEndsAt: this.defaultEndsAt,
            magicLinkRequired: true,
          },
        });
      }
      return setting;
    } catch (err) {
      this.logger.warn(`getSettingRow fallback: ${String(err)}`);
      return null;
    }
  }

  async getVotingEndsAt(): Promise<Date> {
    const setting = await this.getSettingRow();
    if (setting?.votingEndsAt instanceof Date && !Number.isNaN(setting.votingEndsAt.getTime())) {
      return setting.votingEndsAt;
    }
    return this.defaultEndsAt;
  }

  async isMagicLinkRequired(): Promise<boolean> {
    const setting = await this.getSettingRow();
    return setting?.magicLinkRequired !== false;
  }

  async isVotingOpen(): Promise<boolean> {
    const ends = await this.getVotingEndsAt();
    return Date.now() < ends.getTime();
  }

  async setVotingEndsAt(votingEndsAt: Date): Promise<Date> {
    const updated = await this.prisma.setting.upsert({
      where: { id: 1 },
      update: { votingEndsAt },
      create: { id: 1, votingEndsAt, magicLinkRequired: true },
    });
    this.invalidateCache();
    return updated.votingEndsAt;
  }

  async setMagicLinkRequired(magicLinkRequired: boolean): Promise<boolean> {
    const ends = await this.getVotingEndsAt();
    const updated = await this.prisma.setting.upsert({
      where: { id: 1 },
      update: { magicLinkRequired },
      create: { id: 1, votingEndsAt: ends, magicLinkRequired },
    });
    this.invalidateCache();
    return updated.magicLinkRequired;
  }

  async getResults(): Promise<ResultsPayload> {
    const now = Date.now();
    if (this.cache && now - this.cacheAt < this.ttlMs) {
      const endsMs = Date.parse(this.cache.votingEndsAt);
      return {
        ...this.cache,
        votingOpen: Number.isFinite(endsMs) ? now < endsMs : false,
        magicLinkRequired: this.cache.magicLinkRequired !== false,
        periodStats: Array.isArray(this.cache.periodStats)
          ? this.cache.periodStats
          : this.emptyPeriodStats(),
        dailyVotes: Array.isArray(this.cache.dailyVotes) ? this.cache.dailyVotes : [],
        universities: Array.isArray(this.cache.universities) ? this.cache.universities : [],
      };
    }

    try {
      const [rows, setting, dailyRaw, periodRaw] = await Promise.all([
        this.prisma.university.findMany({
          orderBy: { sortOrder: 'asc' },
          include: { count: true },
        }),
        this.getSettingRow(),
        this.queryDailyVotes(),
        this.queryPeriodLeaderRows(),
      ]);
      const votingEndsAt =
        setting?.votingEndsAt instanceof Date && !Number.isNaN(setting.votingEndsAt.getTime())
          ? setting.votingEndsAt
          : this.defaultEndsAt;
      const magicLinkRequired = setting?.magicLinkRequired !== false;

      const safeRows = Array.isArray(rows) ? rows : [];
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

      let dailyVotes: ResultsPayload['dailyVotes'] = [
        { date: this.toDhakaDateKey(new Date()), votes: 0 },
      ];
      let periodStats = this.emptyPeriodStats();
      try {
        dailyVotes = this.fillDailySeries(dailyRaw);
      } catch (err) {
        this.logger.warn(`dailyVotes failed: ${String(err)}`);
      }
      try {
        periodStats = this.mapPeriodStats(periodRaw, nameById);
      } catch (err) {
        this.logger.warn(`periodStats failed: ${String(err)}`);
        periodStats = this.emptyPeriodStats();
      }

      this.cache = {
        totalVotes,
        updatedAt: new Date().toISOString(),
        votingEndsAt: ends.toISOString(),
        votingOpen: Date.now() < ends.getTime(),
        magicLinkRequired,
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
        magicLinkRequired: true,
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

  /** Aggregate in DB — avoids loading every vote row into memory */
  private async queryDailyVotes(): Promise<Array<{ date: string; votes: number }>> {
    const rows = await this.prisma.$queryRaw<Array<{ date: string; votes: bigint | number }>>`
      SELECT to_char((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Dhaka', 'YYYY-MM-DD') AS date,
             COUNT(*)::int AS votes
      FROM votes
      GROUP BY 1
      ORDER BY 1
    `;
    return (rows || []).map((r) => ({
      date: String(r.date),
      votes: Number(r.votes) || 0,
    }));
  }

  private async queryPeriodLeaderRows(): Promise<
    Array<{ windowKey: string; universityId: number; votes: number }>
  > {
    const out: Array<{ windowKey: string; universityId: number; votes: number }> = [];
    await Promise.all(
      PERIOD_WINDOWS.map(async ({ key, ms }) => {
        const since = new Date(Date.now() - ms);
        const grouped = await this.prisma.vote.groupBy({
          by: ['universityId'],
          where: { createdAt: { gte: since } },
          _count: { _all: true },
        });
        for (const g of grouped) {
          out.push({
            windowKey: key,
            universityId: g.universityId,
            votes: g._count._all,
          });
        }
      }),
    );
    return out;
  }

  private mapPeriodStats(
    rows: Array<{ windowKey: string; universityId: number; votes: number }>,
    nameById: Map<number, string>,
  ): PeriodStat[] {
    const list = Array.isArray(rows) ? rows : [];
    return PERIOD_WINDOWS.map(({ key, label }) => {
      const bucket = list.filter((r) => r.windowKey === key && r.votes > 0);
      const totalVotes = bucket.reduce((s, r) => s + r.votes, 0);
      if (totalVotes === 0) {
        return { key, label, totalVotes: 0, leaderName: null, leaderVotes: 0 };
      }
      let leaderId: number | null = null;
      let leaderVotes = 0;
      for (const r of bucket) {
        const name = nameById.get(r.universityId) ?? '';
        const curLeaderName = leaderId === null ? '' : (nameById.get(leaderId) ?? '');
        if (
          leaderId === null ||
          r.votes > leaderVotes ||
          (r.votes === leaderVotes && name.localeCompare(curLeaderName) < 0)
        ) {
          leaderId = r.universityId;
          leaderVotes = r.votes;
        }
      }
      return {
        key,
        label,
        totalVotes,
        leaderName:
          leaderId === null
            ? null
            : nameById.get(leaderId) ?? `University #${leaderId}`,
        leaderVotes: leaderId === null ? 0 : leaderVotes,
      };
    });
  }

  private fillDailySeries(
    points: Array<{ date: string; votes: number }>,
  ): Array<{ date: string; votes: number }> {
    if (!points.length) {
      return [{ date: this.toDhakaDateKey(new Date()), votes: 0 }];
    }
    const counts = new Map(points.map((p) => [p.date, p.votes]));
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