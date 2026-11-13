import {
  Injectable,
  PayloadTooLargeException,
  UnprocessableEntityException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { ExtractedPage } from '../chunking/chunk.types';

type Extraction =
  { pages: ExtractedPage[] } | { error: 'limit' | 'invalid' | 'password' };

@Injectable()
export class PdfExtractionService {
  async extract(bytes: Buffer): Promise<ExtractedPage[]> {
    if (!bytes.subarray(0, 1024).includes('%PDF-')) {
      throw new UnsupportedMediaTypeException('Expected a PDF file.');
    }
    const result = await new Promise<Extraction>(function run(resolve, reject) {
      const child = execFile(
        process.execPath,
        ['--max-old-space-size=256', join(__dirname, 'extract-pdf.mjs')],
        {
          timeout: 30000,
          maxBuffer: 16 * 1024 * 1024,
          windowsHide: true,
        },
        function finished(error, stdout) {
          if (error) {
            reject(
              error.killed
                ? new UnprocessableEntityException(
                    'PDF extraction exceeded the time limit.',
                  )
                : new Error('PDF extraction process failed.', { cause: error }),
            );
            return;
          }
          try {
            resolve(JSON.parse(stdout) as Extraction);
          } catch (cause) {
            reject(new Error('Invalid PDF extractor response.', { cause }));
          }
        },
      );
      child.stdin?.on(
        'error',
        function inputClosed(error: NodeJS.ErrnoException) {
          if (error.code !== 'EPIPE') reject(error);
        },
      );
      child.stdin?.end(bytes);
    });
    if ('error' in result) {
      if (result.error === 'limit')
        throw new PayloadTooLargeException(
          'PDF exceeds the page or extracted text limit.',
        );
      throw new UnprocessableEntityException(
        result.error === 'password'
          ? 'Upload an unlocked PDF.'
          : 'The PDF is damaged or unreadable.',
      );
    }
    if (
      !result.pages.some(function hasText(page) {
        return page.text.trim().length > 0;
      })
    ) {
      throw new UnprocessableEntityException(
        'No extractable text. For scanned reports, apply OCR before uploading.',
      );
    }
    return result.pages;
  }
}
