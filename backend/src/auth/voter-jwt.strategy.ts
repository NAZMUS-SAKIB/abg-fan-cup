import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

export type VoterJwtPayload = {
  sub: string;
  email: string;
  role: 'voter';
};

@Injectable()
export class VoterJwtStrategy extends PassportStrategy(Strategy, 'voter-jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  validate(payload: VoterJwtPayload) {
    if (payload.role !== 'voter' || !payload.email) {
      throw new UnauthorizedException('Invalid voter session.');
    }
    const email = payload.email.trim().toLowerCase();
    return { email, role: 'voter' as const };
  }
}
