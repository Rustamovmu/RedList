import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';

/** Postgres integrity errors are client errors: the database rejected incoherent data (see drizzle/0002_integrity.sql). */
const PG_CLIENT_ERRORS: Record<string, { status: number; code: string; message: string }> = {
  '23514': { status: 422, code: 'INTEGRITY_RULE', message: 'Rejected by a data integrity rule' },
  '23503': { status: 422, code: 'INVALID_REFERENCE', message: 'A referenced record does not exist or does not match' },
  '23505': { status: 409, code: 'DUPLICATE', message: 'A record with the same unique value already exists' },
  '22P02': { status: 400, code: 'BAD_REQUEST', message: 'Malformed value' },
};

function pgError(e: unknown): { code: string; message: string } | null {
  if (typeof e !== 'object' || e === null) return null;
  const err = e as { code?: unknown; message?: unknown; cause?: unknown };
  if (typeof err.code === 'string' && /^[0-9A-Z]{5}$/.test(err.code) && typeof err.message === 'string') {
    return { code: err.code, message: err.message };
  }
  // Drizzle wraps driver errors.
  return err.cause ? pgError(err.cause) : null;
}

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
      const obj = typeof body === 'object' && body !== null ? (body as { message?: string | string[]; code?: string; details?: unknown }) : {};
      const message = typeof body === 'string' ? body : (obj.message ?? exception.message);
      const details = Array.isArray(message) ? message : obj.details;
      res.status(status).json({
        error: {
          code: obj.code ?? HttpStatus[status] ?? 'ERROR',
          message: Array.isArray(message) ? 'Validation failed' : message,
          ...(details !== undefined ? { details } : {}),
        },
      });
      return;
    }

    const pg = pgError(exception);
    const mapped = pg ? PG_CLIENT_ERRORS[pg.code] : undefined;
    if (pg && mapped) {
      // The constraint message names the rule, never row data, so it is safe to return as detail.
      res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message, details: [pg.message] } });
      return;
    }

    this.logger.error({ requestId: req.id, path: req.path, err: exception instanceof Error ? exception.message : 'unknown' });
    res.status(500).json({ error: { code: 'INTERNAL_SERVER_ERROR', message: 'Unexpected error' } });
  }
}
