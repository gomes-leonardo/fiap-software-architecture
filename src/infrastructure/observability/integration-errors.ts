import { metrics } from '@opentelemetry/api';

export type IntegrationErrorKind = 'webhook_unauthorized' | 'domain_rejected' | 'internal_error';

const counter = metrics.getMeter('soat-app').createCounter('soat_integration_errors', {
  description:
    'Falhas nas integracoes e no processamento de OS: webhook recusado por segredo, ' +
    'regra de dominio recusada e erro interno',
});

/**
 * Rota no formato do template (`/service-orders/:id/status`), nunca o caminho
 * concreto: um id por serie faria a cardinalidade crescer sem limite.
 */
export function routeTemplate(request: { baseUrl?: string; route?: { path?: string } }): string {
  const path = request.route?.path;
  return path ? `${request.baseUrl ?? ''}${path}` : 'unmatched';
}

export function recordIntegrationError(kind: IntegrationErrorKind, route: string): void {
  counter.add(1, { kind, route });
}
