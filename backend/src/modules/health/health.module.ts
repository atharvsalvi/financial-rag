import {
  Controller,
  Get,
  Inject,
  Module,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CONFIG, Configuration } from '../../config/configuration';
import {
  DatabaseModule,
  DatabaseService,
} from '../../integrations/database/database.module';

@Controller('health')
export class HealthController {
  constructor(
    private readonly database: DatabaseService,
    @Inject(CONFIG) private readonly config: Configuration,
  ) {}
  @Get()
  async check() {
    const results = await Promise.allSettled([
      this.database.ping(),
      fetch(`${this.config.ollamaBaseUrl}/api/tags`, {
        signal: AbortSignal.timeout(
          Math.min(this.config.ollamaTimeoutMs, 3000),
        ),
      }).then(function checkResponse(response) {
        if (!response.ok) throw new Error('Ollama unavailable');
      }),
    ]);
    const dependencies = {
      postgres: results[0]?.status === 'fulfilled' ? 'up' : 'down',
      ollama: results[1]?.status === 'fulfilled' ? 'up' : 'down',
    };
    const result = {
      status: Object.values(dependencies).every(function isUp(value) {
        return value === 'up';
      })
        ? 'ok'
        : 'degraded',
      dependencies,
    };
    if (result.status !== 'ok') throw new ServiceUnavailableException(result);
    return result;
  }
}
@Module({ imports: [DatabaseModule], controllers: [HealthController] })
export class HealthModule {}
