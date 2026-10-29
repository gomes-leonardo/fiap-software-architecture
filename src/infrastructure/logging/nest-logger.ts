import { LoggerService } from '@nestjs/common';
import { logger } from './logger';

type PinoLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export class PinoNestLogger implements LoggerService {
  log(message: unknown, ...params: unknown[]): void {
    this.write('info', message, params);
  }

  error(message: unknown, ...params: unknown[]): void {
    this.write('error', message, params);
  }

  warn(message: unknown, ...params: unknown[]): void {
    this.write('warn', message, params);
  }

  debug(message: unknown, ...params: unknown[]): void {
    this.write('debug', message, params);
  }

  verbose(message: unknown, ...params: unknown[]): void {
    this.write('trace', message, params);
  }

  fatal(message: unknown, ...params: unknown[]): void {
    this.write('fatal', message, params);
  }

  private write(level: PinoLevel, message: unknown, params: unknown[]): void {
    const rest = [...params];
    const context = typeof rest[rest.length - 1] === 'string' ? (rest.pop() as string) : undefined;

    if (message instanceof Error) {
      logger[level]({ context, err: message }, message.message);
      return;
    }

    const stack = typeof rest[rest.length - 1] === 'string' ? (rest.pop() as string) : undefined;

    logger[level](
      { context, stack },
      typeof message === 'string' ? message : JSON.stringify(message),
    );
  }
}
