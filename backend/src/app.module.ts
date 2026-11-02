import { Module } from '@nestjs/common';
import { ConfigurationModule } from './config/configuration';
import { HealthModule } from './modules/health/health.module';
import { ProcessingModule } from './modules/processing/processing.module';
@Module({ imports: [ConfigurationModule, HealthModule, ProcessingModule] })
export class AppModule {}
