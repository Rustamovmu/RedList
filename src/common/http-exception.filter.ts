import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * Every error leaves the API in one shape: { error: { code, message, details? } }.
 * Unexpected errors are logged server-side and never leak internals to the client.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpError');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { id?: string }>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const message =
        typeof body === 'string' ? body : ((body as { message?: string | string[] }).message ?? exception.message);
      res.status(status).json({
        error: {
          code: HttpStatus[status] ?? 'ERROR',
          message: Array.isArray(message) ? 'Validation failed' : message,
          ...(Array.isArray(message) ? { details: message } : {}),
        },
      });
      return;
    }

    this.logger.error({ requestId: req.id, path: req.path, err: exception instanceof Error ? exception.message : 'unknown' });
    res.status(500).json({ error: { code: 'INTERNAL_SERVER_ERROR', message: 'Unexpected error' } });
  }
}
