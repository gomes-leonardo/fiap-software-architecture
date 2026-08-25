import { Injectable } from '@nestjs/common';
import { ServiceOrder } from '@domain/service-order/service-order.entity';
import { ServiceOrderRepository } from '@domain/service-order/service-order-repository.port';
import { ServiceOrderStatus } from '@domain/service-order/service-order-status.enum';
import { ClientRepository } from '@domain/client/client-repository.port';
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
    private readonly budgetRepository: BudgetRepository,
    private readonly lineResolver: BudgetLineResolver,
  ) {}

  async execute(input: CreateServiceOrderInput): Promise<CreateServiceOrderResponseDto> {
    const client = await this.clientRepository.findById(input.clientId);
    if (!client) {
      throw DomainException.of(`Client with id '${input.clientId}' not found`);
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
    this.advanceToAwaitingApproval(serviceOrder);

    // Orcamento primeiro, OS depois. Nao ha transacao no projeto, entao a ordem
    // e o que define o estrago de uma falha no meio: se a segunda escrita
    // falhar, sobra um orcamento que ninguem referencia — invisivel. Na ordem
    // inversa sobraria uma OS em AGUARDANDO_APROVACAO sem orcamento nenhum
    // para aprovar, que e um estado quebrado e visivel.
    const warnings = await this.lineResolver.stockWarnings(resolvedLines);

    await this.budgetRepository.save(budget);
    await this.serviceOrderRepository.save(serviceOrder);

    return CreateServiceOrderResponseDto.from(serviceOrder, budget.id, warnings);
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
