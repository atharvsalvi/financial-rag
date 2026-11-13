import { DashboardModule } from './dashboard.module';
import { Module } from '@nestjs/common';
import { ConfigurationModule } from './config/configuration';
import { HealthModule } from './modules/health/health.module';
import { IngestionModule } from './modules/ingestion/ingestion.module';
import { RetrievalModule } from './modules/retrieval/retrieval.module';
import { AnswersModule } from './modules/answers/answers.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
@Module({
  imports: [
    ConfigurationModule,
    HealthModule,
    DashboardModule,
    IngestionModule,
    RetrievalModule,
    AnswersModule,
    ConversationsModule,
  ],
})
export class AppModule {}
