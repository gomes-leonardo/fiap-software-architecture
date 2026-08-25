import { Entity, DomainException } from '@domain/shared';
import { ServiceOrderStatus } from './service-order-status.enum';
import { StatusHistory } from './status-history.vo';

/**
 * Transition matrix defining all legal status transitions.
 *
 * Happy path:
 *   Recebida → Em diagnóstico → Aguardando aprovação → Em execução → Finalizada → Entregue
 *
 * Exception transitions:
 *   - Re-budget:  Em execução → Aguardando aprovação
 *   - Stock pause: Em execução ↔ Pausado
 *   - Refusal:    Aguardando aprovação → Encerrada sem execução
 */
const ALLOWED_TRANSITIONS: Record<ServiceOrderStatus, ServiceOrderStatus[]> = {
  [ServiceOrderStatus.RECEBIDA]: [ServiceOrderStatus.EM_DIAGNOSTICO],
  [ServiceOrderStatus.EM_DIAGNOSTICO]: [ServiceOrderStatus.AGUARDANDO_APROVACAO],
  [ServiceOrderStatus.AGUARDANDO_APROVACAO]: [
    ServiceOrderStatus.EM_EXECUCAO,
    ServiceOrderStatus.ENCERRADA_SEM_EXECUCAO,
  ],
  [ServiceOrderStatus.EM_EXECUCAO]: [
    ServiceOrderStatus.PAUSADO,
    ServiceOrderStatus.FINALIZADA,
    ServiceOrderStatus.AGUARDANDO_APROVACAO, // re-budget
  ],
  [ServiceOrderStatus.PAUSADO]: [ServiceOrderStatus.EM_EXECUCAO],
  [ServiceOrderStatus.FINALIZADA]: [ServiceOrderStatus.ENTREGUE],
  [ServiceOrderStatus.ENTREGUE]: [],
  [ServiceOrderStatus.ENCERRADA_SEM_EXECUCAO]: [],
};

export interface CreateServiceOrderProps {
  clientId: string;
  vehicleId?: string;
  description: string;
}

export class ServiceOrder extends Entity {
  private _clientId: string;
  private _vehicleId: string | null;
  private _description: string;
  private _status: ServiceOrderStatus;
  private _statusHistory: StatusHistory;
  private _budgetId: string | null;

  constructor(props: CreateServiceOrderProps, id?: string) {
    super(id);

    if (!props.clientId) {
      throw DomainException.of('Client ID is required for a service order');
    }
    if (!props.description || props.description.trim().length === 0) {
      throw DomainException.of('Service order description is required');
    }

    this._clientId = props.clientId;
    this._vehicleId = props.vehicleId ?? null;
    this._description = props.description.trim();
    this._status = ServiceOrderStatus.RECEBIDA;
    this._statusHistory = new StatusHistory();
    this._budgetId = null;

    // Record initial status
    this._statusHistory.record(null, ServiceOrderStatus.RECEBIDA, 'system');
  }

  get clientId(): string {
    return this._clientId;
  }

  get vehicleId(): string | null {
    return this._vehicleId;
  }

  get description(): string {
    return this._description;
  }

  get status(): ServiceOrderStatus {
    return this._status;
  }

  get statusHistory(): StatusHistory {
    return this._statusHistory;
  }

  get budgetId(): string | null {
    return this._budgetId;
  }

  /**
   * Transitions to a new status. Enforces:
   * 1. Only allowed transitions (based on ALLOWED_TRANSITIONS map)
   * 2. Cannot enter EM_EXECUCAO without an approved budget (budgetId set)
   * 3. Records every transition in history
   */
  changeStatus(newStatus: ServiceOrderStatus, changedBy: string): void {
    const allowed = ALLOWED_TRANSITIONS[this._status];

    if (!allowed.includes(newStatus)) {
      throw DomainException.of(
        `Invalid transition: cannot move from '${this._status}' to '${newStatus}'`,
      );
    }

    // Business rule: cannot start execution without approved budget
    if (newStatus === ServiceOrderStatus.EM_EXECUCAO && !this._budgetId) {
      throw DomainException.of('Cannot start execution: service order has no approved budget');
    }

    const previousStatus = this._status;
    this._status = newStatus;
    this._statusHistory.record(previousStatus, newStatus, changedBy);
    this.touch();
  }

  updateDescription(description: string): void {
    if (!description || description.trim().length === 0) {
      throw DomainException.of('Service order description is required');
    }
    this._description = description.trim();
    this.touch();
  }

  /**
   * Associates an approved budget with this service order.
   * Called when a budget is approved by an admin.
   */
  setBudget(budgetId: string): void {
    if (!budgetId) {
      throw DomainException.of('Budget ID is required');
    }
    this._budgetId = budgetId;
    this.touch();
  }

  /**
   * Clears the budget reference (used during re-budget flow).
   */
  clearBudget(): void {
    this._budgetId = null;
    this.touch();
  }

  static reconstitute(
    id: string,
    clientId: string,
    vehicleId: string | null,
    description: string,
    status: ServiceOrderStatus,
    statusHistory: StatusHistory,
    budgetId: string | null,
  ): ServiceOrder {
    const so = Object.create(ServiceOrder.prototype) as ServiceOrder;
    Object.defineProperty(so, 'id', { value: id, writable: false });
    Object.defineProperty(so, 'createdAt', { value: new Date(), writable: false });
    so.updatedAt = new Date();
    so._clientId = clientId;
    so._vehicleId = vehicleId;
    so._description = description;
    so._status = status;
    so._statusHistory = statusHistory;
    so._budgetId = budgetId;
    return so;
  }
}
