import { ExceptionFilter, Catch, ArgumentsHost, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { DomainException } from '@domain/shared';
import { logger } from '@infrastructure/logging/logger';
import {
  recordIntegrationError,
  routeTemplate,
} from '@infrastructure/observability/integration-errors';

@Catch(DomainException)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: DomainException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const route = routeTemplate(request);

    recordIntegrationError('domain_rejected', route);
    logger.warn(
      {
        err: { type: exception.name, message: exception.message },
        route,
        serviceOrderId: serviceOrderIdOf(request),
      },
      'domain exception',
    );

    response.status(HttpStatus.BAD_REQUEST).json({
      statusCode: HttpStatus.BAD_REQUEST,
      error: 'Domain Error',
      message: exception.message,
    });
  }
}

/**
 * O alerta de transicao recusada agrupa por OS, entao o log precisa dizer qual.
 * A OS chega como `:id` nas rotas de service-orders (inclusive o webhook de
 * status do parceiro), como `:serviceOrderId` nas de orcamento, ou no corpo.
 */
function serviceOrderIdOf(request: Request): string | undefined {
  const params = (request.params ?? {}) as Record<string, string | undefined>;
  const body = (request.body ?? {}) as Record<string, unknown>;
  if (params.serviceOrderId) return params.serviceOrderId;
  const route = routeTemplate(request);
  if (params.id && /^(\/webhooks)?\/service-orders\//.test(route)) return params.id;
  return typeof body.serviceOrderId === 'string' ? body.serviceOrderId : undefined;
}
