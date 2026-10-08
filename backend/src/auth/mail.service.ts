import {
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export type MailSendResult = {
  delivered: boolean;
  provider: 'resend' | 'smtp' | 'log';
  /** Only set when no real mail provider is configured (local/dev). */
  magicUrl?: string;
};

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private resendKey = '';
  private from = '';
  private smtpTransporter: Transporter | null = null;
  private smtpReady = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.resendKey = (this.config.get<string>('RESEND_API_KEY') || '').trim();
    this.from =
      (this.config.get<string>('MAIL_FROM') || '').trim() ||
      'ABG Fan Cup <abgsportscity@gmail.com>';

    const smtpUser = (this.config.get<string>('SMTP_USER') || '').trim();
    const smtpPass = (this.config.get<string>('SMTP_PASS') || '').trim();
    const smtpHost =
      (this.config.get<string>('SMTP_HOST') || '').trim() || 'smtp.gmail.com';
    const smtpPort = Number(this.config.get<string>('SMTP_PORT') || 465);

    if (smtpUser && smtpPass) {
      this.smtpTransporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPass },
      });
      this.smtpReady = true;
      this.logger.log(`SMTP mail ready via ${smtpHost} as ${smtpUser}`);
    } else if (this.resendKey) {
      this.logger.log('Resend mail ready');
    } else {
      this.logger.warn(
        'No mail provider configured (set SMTP_USER/SMTP_PASS or RESEND_API_KEY). Magic links will only appear in logs.',
      );
    }
  }

  get isConfigured() {
    return this.smtpReady || !!this.resendKey;
  }

  async sendMagicLink(email: string, magicUrl: string): Promise<MailSendResult> {
    const subject = 'Confirm your vote — ABG University Cup 2026';
    const text = [
      'ABG University Cup 2026 — Fan Cup',
      '',
      'Confirm your email to cast your one Fan Cup vote.',
      'This link works once and expires in 15 minutes:',
      '',
      magicUrl,
      '',
      'If you did not request this, you can ignore this message.',
      '',
      'Anvir Bashundhara Group',
      'abgsportscity@gmail.com',
    ].join('\n');

    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /></head>
<body style="margin:0;padding:0;background:#f4f7fb;color:#0b2748">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fb;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0">
        <tr><td style="background:#0b2748;padding:18px 24px;color:#fff;font-family:Segoe UI,Arial,sans-serif;font-size:14px;font-weight:700;letter-spacing:0.06em">ABG UNIVERSITY CUP 2026</td></tr>
        <tr><td style="padding:28px 24px;font-family:Segoe UI,Arial,sans-serif">
          <h1 style="margin:0 0 12px;font-size:22px;line-height:1.25;color:#0b2748">Confirm your Fan Cup vote</h1>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#334155">
            Tap the button below to verify this email. You can cast one vote after confirmation.
            The link expires in 15 minutes and can be used once.
          </p>
          <p style="margin:0 0 24px">
            <a href="${magicUrl}" style="display:inline-block;background:#ff9f1c;color:#132b4c;font-weight:700;text-decoration:none;padding:14px 22px;border-radius:10px;font-size:15px">
              Confirm and continue
            </a>
          </p>
          <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#64748b">
            Button not working? Paste this link into your browser:
          </p>
          <p style="margin:0 0 20px;font-size:12px;line-height:1.45;color:#64748b;word-break:break-all">${magicUrl}</p>
          <p style="margin:0;font-size:12px;line-height:1.45;color:#94a3b8">
            Sent by Anvir Bashundhara Group for Fan Cup voting. If you did not request this, ignore this email.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    if (this.smtpReady && this.smtpTransporter) {
      await this.smtpTransporter.sendMail({
        from: this.from,
        to: email,
        replyTo:
          (this.config.get<string>('MAIL_REPLY_TO') || '').trim() || undefined,
        subject,
        text,
        html,
        headers: {
          'X-Entity-Ref-ID': `abg-fan-cup-${Date.now()}`,
        },
      });
      return { delivered: true, provider: 'smtp' };
    }

    if (this.resendKey) {
      const replyTo = (this.config.get<string>('MAIL_REPLY_TO') || '').trim();
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.from,
          to: [email],
          subject,
          text,
          html,
          ...(replyTo ? { reply_to: replyTo } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        this.logger.error(`Resend failed: ${res.status} ${body}`);
        throw new ServiceUnavailableException('Failed to send magic link email');
      }
      return { delivered: true, provider: 'resend' };
    }

    this.logger.warn(
      `[DEV] Magic link for ${email} (no mail provider — open this URL):\n${magicUrl}`,
    );
    return { delivered: false, provider: 'log', magicUrl };
  }
}
