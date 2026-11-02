import { ArgumentsHost, Catch, HttpException, HttpStatus } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Request } from 'express';
import { DomainException } from '@domain/shared';
import { logger } from '@infrastructure/logging/logger';
import {
  recordIntegrationError,
  routeTemplate,
} from '@infrastructure/observability/integration-errors';
import { DomainExceptionFilter } from './domain-exception.filter';

/**
 * Filtro global unico. Erro de dominio segue para o `DomainExceptionFilter`
 * (400). Todo o resto e respondido pelo filtro padrao do Nest, que preserva o
 * status de HttpException e de erros HTTP do body parser (413, 415). Este
 * filtro so acrescenta a contagem e o log de stack quando a resposta e 5xx: e
 * o sinal que o alerta de falha no processamento de OS usa.
 *
 * Delegar aqui, em vez de registrar dois filtros globais, tira da equacao a
 * ordem em que o Nest avalia filtros.
 */
@Catch()
export class GlobalExceptionFilter extends BaseExceptionFilter {
  private readonly domainFilter = new DomainExceptionFilter();

  catch(exception: unknown, host: ArgumentsHost): void {
    if (exception instanceof DomainException) {
      this.domainFilter.catch(exception, host);
      return;
    }

    if (statusOf(exception) >= HttpStatus.INTERNAL_SERVER_ERROR) {
      const route = routeTemplate(host.switchToHttp().getRequest<Request>());
      recordIntegrationError('internal_error', route);
      logger.error({ err: exception, route }, 'unhandled error');
    }

    super.catch(exception, host);
  }
}

/** O mesmo status que o filtro padrao do Nest vai responder. */
function statusOf(exception: unknown): number {
  if (exception instanceof HttpException) return exception.getStatus();
  const candidate = (exception as { statusCode?: unknown; message?: unknown } | null) ?? {};
  if (typeof candidate.statusCode === 'number' && typeof candidate.message === 'string') {
    return candidate.statusCode;
  }
  return HttpStatus.INTERNAL_SERVER_ERROR;
}
