import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from './mail.service';
import { TurnstileService } from './turnstile.service';

const LINK_TTL_MS = 15 * 60 * 1000;
const MAX_LINKS_PER_EMAIL_15M = 3;
const MAX_LINKS_PER_IP_15M = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
    private readonly turnstile: TurnstileService,
    private readonly config: ConfigService,
  ) {}

  normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!domain) return '***';
    const visible = local.slice(0, 1) || '*';
    return `${visible}***@${domain}`;
  }

  async requestLink(
    rawEmail: string,
    turnstileToken: string | undefined,
    ip: string | undefined,
  ) {
    const email = this.normalizeEmail(rawEmail);
    if (!email.includes('@')) {
      throw new BadRequestException('Enter a valid email address.');
    }

    await this.turnstile.verify(turnstileToken, ip);

    const since = new Date(Date.now() - LINK_TTL_MS);
    const [byEmail, byIp] = await Promise.all([
      this.prisma.magicLinkToken.count({
        where: { email, createdAt: { gte: since } },
      }),
      ip
        ? this.prisma.magicLinkToken.count({
            where: { ip, createdAt: { gte: since } },
          })
        : Promise.resolve(0),
    ]);

    if (byEmail >= MAX_LINKS_PER_EMAIL_15M || byIp >= MAX_LINKS_PER_IP_15M) {
      throw new HttpException(
        'Too many magic link requests. Wait a few minutes and try again.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const token = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + LINK_TTL_MS);

    await this.prisma.magicLinkToken.create({
      data: {
        email,
        tokenHash,
        expiresAt,
        ip: ip?.slice(0, 64),
      },
    });

    const frontendUrl = (
      this.config.get<string>('FRONTEND_URL') || 'http://localhost:4200'
    ).replace(/\/$/, '');
    const magicUrl = `${frontendUrl}/?magic=${token}`;

    let mailResult: { delivered: boolean; provider: string; magicUrl?: string };
    try {
      mailResult = await this.mail.sendMagicLink(email, magicUrl);
    } catch {
      throw new HttpException(
        'Could not send email. Try again shortly.',
        HttpStatus.BAD_GATEWAY,
      );
    }

    const alreadyVoted = !!(await this.prisma.vote.findUnique({
      where: { email },
      select: { id: true },
    }));

    return {
      ok: true,
      message: mailResult.delivered
        ? 'Check your inbox for a confirmation link. If it is not there, look in Spam/Promotions.'
        : 'Email is not configured on the server yet — use the open link below (local/dev).',
      emailMasked: this.maskEmail(email),
      alreadyVoted,
      expiresInSeconds: Math.floor(LINK_TTL_MS / 1000),
      mailDelivered: mailResult.delivered,
      // Never expose the raw magic URL once a real mail provider is configured.
      ...(mailResult.delivered
        ? {}
        : {
            magicUrlDev: mailResult.magicUrl || magicUrl,
            devHint: 'Mail provider not set — open this link to continue locally.',
          }),
    };
  }

  async consumeLink(rawToken: string) {
    const token = rawToken.trim();
    if (token.length < 32) {
      throw new UnauthorizedException('Invalid or expired link.');
    }

    const tokenHash = this.hashToken(token);
    const row = await this.prisma.magicLinkToken.findUnique({
      where: { tokenHash },
    });

    if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException(
        'This magic link is invalid or has expired. Request a new one.',
      );
    }

    await this.prisma.magicLinkToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    });

    const email = row.email;
    const accessToken = await this.jwt.signAsync(
      { sub: email, email, role: 'voter' },
      { expiresIn: '7d' },
    );

    const vote = await this.prisma.vote.findUnique({
      where: { email },
      include: { university: true },
    });

    return {
      ok: true,
      accessToken,
      email,
      emailMasked: this.maskEmail(email),
      voted: !!vote,
      universityId: vote?.universityId ?? null,
      universityName: vote?.university.name ?? null,
    };
  }

  async statusForEmail(email: string) {
    const normalized = this.normalizeEmail(email);
    const existing = await this.prisma.vote.findUnique({
      where: { email: normalized },
      include: { university: true },
    });
    if (!existing) {
      return { voted: false as const, email: normalized, emailMasked: this.maskEmail(normalized) };
    }
    return {
      voted: true as const,
      email: normalized,
      emailMasked: this.maskEmail(normalized),
      universityId: existing.universityId,
      universityName: existing.university.name,
    };
  }
}
