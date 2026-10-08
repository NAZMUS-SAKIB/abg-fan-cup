import {
  Injectable,
  UnauthorizedException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TurnstileService implements OnModuleInit {
  private secret = '';
  private required = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.secret = (this.config.get<string>('TURNSTILE_SECRET_KEY') || '').trim();
    this.required = this.secret.length > 0;
  }

  get isRequired() {
    return this.required;
  }

  async verify(token: string | undefined, ip?: string): Promise<void> {
    if (!this.required) {
      return;
    }
    if (!token?.trim()) {
      throw new UnauthorizedException('Complete the human verification challenge.');
    }

    const body = new URLSearchParams();
    body.set('secret', this.secret);
    body.set('response', token.trim());
    if (ip) body.set('remoteip', ip);

    const res = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      { method: 'POST', body },
    );
    const data = (await res.json()) as { success?: boolean };
    if (!data.success) {
      throw new UnauthorizedException('Human verification failed. Try again.');
    }
  }
}
