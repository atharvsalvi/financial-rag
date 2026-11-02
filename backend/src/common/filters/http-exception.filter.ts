import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);
  catch(error: unknown, host: ArgumentsHost): void {
    const status = error instanceof HttpException ? error.getStatus() : 500;
    if (status >= 500)
      this.logger.error(
        error instanceof Error ? error.message : 'Unknown server error',
      );
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(status)
      .json({
        statusCode: status,
        error:
          error instanceof HttpException
            ? error.getResponse()
            : 'Internal server error',
        timestamp: new Date().toISOString(),
      });
  }
}
