import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/** Attach a request ID to each request (reuse a well-formed upstream one) and echo it back in a header. */
export function requestId(req: Request & { id?: string }, res: Response, next: NextFunction) {
  const incoming = req.header('x-request-id');
  req.id = incoming && /^[A-Za-z0-9-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  res.setHeader('x-request-id', req.id);
  next();
}
