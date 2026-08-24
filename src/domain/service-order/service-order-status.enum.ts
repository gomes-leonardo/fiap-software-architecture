export enum ServiceOrderStatus {
  RECEBIDA = 'RECEBIDA',
  EM_DIAGNOSTICO = 'EM_DIAGNOSTICO',
  AGUARDANDO_APROVACAO = 'AGUARDANDO_APROVACAO',
  EM_EXECUCAO = 'EM_EXECUCAO',
  PAUSADO = 'PAUSADO',
  FINALIZADA = 'FINALIZADA',
  ENTREGUE = 'ENTREGUE',
  ENCERRADA_SEM_EXECUCAO = 'ENCERRADA_SEM_EXECUCAO',
}

export interface ServiceOrderStatusRule {
  /** Quanto menor, mais cedo a OS aparece na listagem. */
  priority: number;
  /** Terminal: a OS ja saiu do fluxo de trabalho e some da listagem ativa. */
  terminal: boolean;
}

/**
 * Fonte de verdade das duas regras de listagem de OS. O mapa e total sobre o
 * enum de proposito: quem adicionar um status novo e obrigado pelo compilador a
 * decidir as duas coisas — onde ele entra na fila e se ele ainda esta em
 * andamento. Um mapa parcial deixaria o status novo escorregar para a listagem
 * ativa em silencio.
 */
export const SERVICE_ORDER_STATUS_RULES: Record<ServiceOrderStatus, ServiceOrderStatusRule> = {
  [ServiceOrderStatus.EM_EXECUCAO]: { priority: 1, terminal: false },
  [ServiceOrderStatus.AGUARDANDO_APROVACAO]: { priority: 2, terminal: false },
  [ServiceOrderStatus.EM_DIAGNOSTICO]: { priority: 3, terminal: false },
  [ServiceOrderStatus.RECEBIDA]: { priority: 4, terminal: false },
  [ServiceOrderStatus.PAUSADO]: { priority: 5, terminal: false },
  [ServiceOrderStatus.FINALIZADA]: { priority: 6, terminal: true },
  [ServiceOrderStatus.ENTREGUE]: { priority: 7, terminal: true },
  [ServiceOrderStatus.ENCERRADA_SEM_EXECUCAO]: { priority: 8, terminal: true },
};

const STATUSES_BY_PRIORITY: readonly ServiceOrderStatus[] = Object.values(ServiceOrderStatus).sort(
  (a, b) => SERVICE_ORDER_STATUS_RULES[a].priority - SERVICE_ORDER_STATUS_RULES[b].priority,
);

/** Status que aparecem na listagem operacional, ja na ordem de prioridade. */
export const ACTIVE_SERVICE_ORDER_STATUSES: readonly ServiceOrderStatus[] =
  STATUSES_BY_PRIORITY.filter((status) => !SERVICE_ORDER_STATUS_RULES[status].terminal);

/** Status terminais, excluidos da listagem operacional. */
export const EXCLUDED_FROM_ACTIVE_LISTING: readonly ServiceOrderStatus[] =
  STATUSES_BY_PRIORITY.filter((status) => SERVICE_ORDER_STATUS_RULES[status].terminal);
