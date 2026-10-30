import { Injectable } from '@nestjs/common';
import { ServiceOrder } from '@domain/service-order/service-order.entity';
import { ServiceOrderRepository } from '@domain/service-order/service-order-repository.port';
import { ServiceOrderStatus } from '@domain/service-order/service-order-status.enum';
import { ClientRepository } from '@domain/client/client-repository.port';
import { VehicleRepository } from '@domain/vehicle/vehicle-repository.port';
import { Budget } from '@domain/budget/budget.entity';
import { BudgetRepository } from '@domain/budget/budget-repository.port';
import { DomainException } from '@domain/shared';
import { BudgetLineResolver, RequestedLine } from '@application/budget/budget-line-resolver';
import { CreateServiceOrderResponseDto } from './dtos/create-service-order-response.dto';

export interface RequestedItem {
  referenceId: string;
  quantity: number;
}

export interface CreateServiceOrderInput {
  clientId: string;
  vehicleId?: string;
  description: string;
  services?: RequestedItem[];
  parts?: RequestedItem[];
}

@Injectable()
export class CreateServiceOrderUseCase {
  constructor(
    private readonly serviceOrderRepository: ServiceOrderRepository,
    private readonly clientRepository: ClientRepository,
    private readonly vehicleRepository: VehicleRepository,
    private readonly budgetRepository: BudgetRepository,
    private readonly lineResolver: BudgetLineResolver,
  ) {}

  async execute(input: CreateServiceOrderInput): Promise<CreateServiceOrderResponseDto> {
    const client = await this.clientRepository.findById(input.clientId);
    if (!client) {
      throw DomainException.of(`Client with id '${input.clientId}' not found`);
    }

    if (input.vehicleId) {
      await this.assertVehicleOfClient(input.vehicleId, input.clientId);
    }

    const requestedLines = this.toRequestedLines(input);

    // Resolver ANTES de criar qualquer coisa: se um referenceId nao existe no
    // catalogo, a chamada morre aqui sem ter escrito nada. Resolver depois de
    // salvar a OS deixaria uma OS orfa toda vez que alguem errasse um id.
    const resolvedLines = requestedLines.length
      ? await this.lineResolver.resolve(requestedLines)
      : [];

    const serviceOrder = new ServiceOrder({
      clientId: input.clientId,
      vehicleId: input.vehicleId,
      description: input.description,
    });

    if (resolvedLines.length === 0) {
      await this.serviceOrderRepository.save(serviceOrder);
      return CreateServiceOrderResponseDto.from(serviceOrder, null, []);
    }

    const budget = new Budget({ serviceOrderId: serviceOrder.id, lines: resolvedLines });
    const warnings = await this.lineResolver.stockWarnings(resolvedLines);

    // Tres escritas, sem transacao no projeto, entao a ordem define o estrago
    // de uma falha no meio. A chave estrangeira budgets.service_order_id exige
    // a OS gravada antes do orcamento. A OS nasce RECEBIDA e so avanca para
    // AGUARDANDO_APROVACAO depois que o orcamento existe: se a segunda ou a
    // terceira escrita falhar, sobra uma OS RECEBIDA, estado valido e visivel,
    // e nunca uma OS aguardando aprovacao sem orcamento para aprovar.
    await this.serviceOrderRepository.save(serviceOrder);
    await this.budgetRepository.save(budget);
    this.advanceToAwaitingApproval(serviceOrder);
    await this.serviceOrderRepository.save(serviceOrder);

    return CreateServiceOrderResponseDto.from(serviceOrder, budget.id, warnings);
  }

  /**
   * A chave estrangeira garante que o veiculo existe, mas so devolveria um
   * erro de banco (500). Que ele pertenca ao cliente da OS e regra de negocio
   * que o banco nao expressa.
   */
  private async assertVehicleOfClient(vehicleId: string, clientId: string): Promise<void> {
    const vehicle = await this.vehicleRepository.findById(vehicleId);
    if (!vehicle) {
      throw DomainException.of(`Vehicle with id '${vehicleId}' not found`);
    }
    if (vehicle.ownerClientId !== clientId) {
      throw DomainException.of(`Vehicle '${vehicleId}' does not belong to client '${clientId}'`);
    }
  }

  private toRequestedLines(input: CreateServiceOrderInput): RequestedLine[] {
    return [
      ...(input.services ?? []).map((item) => ({ type: 'SERVICE' as const, ...item })),
      ...(input.parts ?? []).map((item) => ({ type: 'PART' as const, ...item })),
    ];
  }

  /**
   * A OS nasce em RECEBIDA, e a maquina de estados nao aceita salto: o caminho
   * ate AGUARDANDO_APROVACAO passa por EM_DIAGNOSTICO. Sao os mesmos dois
   * passos que `CreateBudgetUseCase` da quando o orcamento e criado pela rota
   * `POST /budgets` — abrir a OS com itens inline tem que chegar no mesmo lugar
   * que abrir a OS e orcar em seguida.
   *
   * O que NAO acontece aqui e `setBudget()`. Esse metodo significa "orcamento
   * aprovado" e e o que destranca a transicao para EM_EXECUCAO; quem o chama e
   * o `ApproveBudgetUseCase`, depois de dar baixa no estoque. Chama-lo na
   * criacao deixaria qualquer um abrir uma OS com pecas e ir direto para
   * execucao, sem aprovacao e sem reserva de estoque.
   */
  private advanceToAwaitingApproval(serviceOrder: ServiceOrder): void {
    serviceOrder.changeStatus(ServiceOrderStatus.EM_DIAGNOSTICO, 'system');
    serviceOrder.changeStatus(ServiceOrderStatus.AGUARDANDO_APROVACAO, 'system');
  }
}
