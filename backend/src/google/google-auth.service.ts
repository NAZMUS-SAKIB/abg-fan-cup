import {
  Injectable,
  UnauthorizedException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';

export type GoogleIdentity = {
  googleSub: string;
  email?: string;
};

@Injectable()
export class GoogleAuthService implements OnModuleInit {
  private client!: OAuth2Client;
  private clientId!: string;
  private allowDevAuth = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.clientId = this.config.getOrThrow<string>('GOOGLE_CLIENT_ID');
    this.allowDevAuth =
      this.config.get<string>('ALLOW_DEV_AUTH') === 'true' ||
      this.clientId.startsWith('REPLACE_');
    this.client = new OAuth2Client(this.clientId);
  }

  async verifyIdToken(idToken: string): Promise<GoogleIdentity> {
    if (this.allowDevAuth && idToken.startsWith('dev:')) {
      const sub = idToken.slice(4).trim();
      if (!sub || sub.length > 128) {
        throw new UnauthorizedException('Invalid demo voter id');
      }
      return { googleSub: `dev:${sub}`, email: `${sub}@demo.local` };
    }

    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: this.clientId,
      });
      const payload = ticket.getPayload();
      if (!payload?.sub) {
        throw new UnauthorizedException('Invalid Google token');
      }
      if (payload.email_verified === false) {
        throw new UnauthorizedException('Google email not verified');
      }
      return {
        googleSub: payload.sub,
        email: payload.email,
      };
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Google authentication failed');
    }
  }
}