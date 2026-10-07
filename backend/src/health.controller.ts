import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

@Controller('health')
export class HealthController {
  @Get()
  @SkipThrottle()
  health() {
    return { ok: true, service: 'abg-fan-cup-api' };
  }
}
