import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DocumentProcessingService } from '../src/modules/processing/document-processing.service';
async function run(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    const chunks = await app.get(DocumentProcessingService).process({
      documentId: 'sample-annual-report',
      metadata: {
        company: 'Example Corp',
        documentType: 'annual_report',
        financialYear: 2026,
      },
      pages: [
        {
          pageNumber: 1,
          text: '# Financial results\n\nFY2026 revenue was $12.5 million, up 15%.\nOperating margin was 23%.\n\n# Cash flow\n\nOperating cash flow was $4.2 million.',
        },
      ],
    });
    console.log(
      `Persisted ${chunks.length} chunks using live Ollama embeddings.`,
    );
  } finally {
    await app.close();
  }
}
void run().catch(function failed(error: unknown) {
  console.error(error);
  process.exitCode = 1;
}); 
