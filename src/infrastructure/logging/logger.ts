import pino from 'pino';
import { pinoHttp } from 'pino-http';
import { serializeError, serializeRequest, serializeResponse } from './serializers';

const isProduction = process.env.NODE_ENV === 'production';
const pretty = !isProduction && process.env.LOG_PRETTY !== '0';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  transport: pretty
    ? {
        target: 'pino-pretty',
        options: { singleLine: true, translateTime: 'HH:MM:ss.l' },
      }
    : undefined,
});

export const httpLogger = pinoHttp({
  logger,
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customProps: (req) => ({
    route: (req as { route?: { path?: string } }).route?.path,
  }),
  serializers: {
    req: serializeRequest,
    res: serializeResponse,
    err: serializeError,
  },
});
