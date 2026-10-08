import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MailService } from './mail.service';
import { TurnstileService } from './turnstile.service';
import { VoterJwtStrategy } from './voter-jwt.strategy';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'voter-jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: '7d' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, MailService, TurnstileService, VoterJwtStrategy],
  exports: [AuthService, PassportModule],
})
export class AuthModule {}
