import { trace } from '@opentelemetry/api';
import { NextFunction, Request, Response } from 'express';

export const TRACE_ID_HEADER = 'X-Trace-Id';

export function traceIdHeader(_req: Request, res: Response, next: NextFunction): void {
  const traceId = trace.getActiveSpan()?.spanContext().traceId;

  if (traceId) {
    res.setHeader(TRACE_ID_HEADER, traceId);
  }

  next();
}
