import 'reflect-metadata';
import { NestExpressApplication } from '@nestjs/platform-express';
import { resolve } from 'node:path';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { CONFIG, Configuration } from './config/configuration';
import { setup } from './setup';
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: new Logger('FinancialResearch'),
  });
  try {
    setup(app);
    app.useStaticAssets(resolve(__dirname, '../public'));
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
