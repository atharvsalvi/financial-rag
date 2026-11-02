import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { CONFIG, Configuration } from './config/configuration';
import { setup } from './setup';
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: new Logger('FinancialResearch'),
  });
  try {
    setup(app);
    await app.listen(app.get<Configuration>(CONFIG).port);
  } catch (error) {
    await app.close();
    throw error;
  }
}
void bootstrap().catch(function startupFailed(error: unknown) {
  new Logger('Bootstrap').error(
    error instanceof Error ? error.message : 'Startup failed',
  );
  process.exitCode = 1;
});
