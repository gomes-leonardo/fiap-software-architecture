import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { DomainException } from '@domain/shared';
import { logger } from '@infrastructure/logging/logger';
import {
  recordIntegrationError,
  routeTemplate,
} from '@infrastructure/observability/integration-errors';
import { DomainExceptionFilter } from './domain-exception.filter';

/**
 * Filtro global unico. Erros de dominio seguem para o `DomainExceptionFilter`
 * (400). HttpException responde no mesmo formato do handler padrao do Nest.
 * Todo o resto vira 500, contado como erro interno e logado com stack: e o
 * sinal que o alerta de falha no processamento de OS usa.
 *
 * Delegar aqui, em vez de registrar dois filtros globais, tira da equacao a
 * ordem em que o Nest avalia filtros.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly domainFilter = new DomainExceptionFilter();

  catch(exception: unknown, host: ArgumentsHost): void {
    if (exception instanceof DomainException) {
      this.domainFilter.catch(exception, host);
      return;
    }

    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      const route = routeTemplate(request);
      recordIntegrationError('internal_error', route);
      logger.error({ err: exception, route }, 'unhandled error');
    }

    response.status(status).json(bodyFor(exception, status));
  }
}

function bodyFor(exception: unknown, status: number): object {
  if (!(exception instanceof HttpException)) {
    return { statusCode: status, message: 'Internal server error' };
  }
  const body = exception.getResponse();
  return typeof body === 'string' ? { statusCode: status, message: body } : body;
}
