import { BudgetLineResolver } from '@application/budget/budget-line-resolver';
import { CreateBudgetUseCase } from '@application/budget/create-budget.use-case';
import { BudgetRepository } from '@domain/budget/budget-repository.port';
import { ServiceRepository } from '@domain/service/service-repository.port';
import { PartRepository } from '@domain/part/part-repository.port';
import { ServiceOrderRepository } from '@domain/service-order/service-order-repository.port';
import { Service } from '@domain/service/service.entity';
import { Part } from '@domain/part/part.entity';
import { ServiceOrder } from '@domain/service-order/service-order.entity';
import { ServiceOrderStatus } from '@domain/service-order/service-order-status.enum';
import { Budget } from '@domain/budget/budget.entity';

describe('CreateBudgetUseCase', () => {
  let useCase: CreateBudgetUseCase;
  let mockRepo: jest.Mocked<BudgetRepository>;
  let mockServiceRepo: jest.Mocked<ServiceRepository>;
  let mockPartRepo: jest.Mocked<PartRepository>;
  let mockSORepo: jest.Mocked<ServiceOrderRepository>;
  let serviceOrder: ServiceOrder;

  const validInput = {
    serviceOrderId: 'so-123',
    lines: [
      { type: 'SERVICE' as const, referenceId: 'svc-1', quantity: 1 },
      { type: 'PART' as const, referenceId: 'part-1', quantity: 2 },
    ],
  };

  beforeEach(() => {
    mockRepo = {
      save: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn().mockResolvedValue(null),
      findByServiceOrderId: jest.fn().mockResolvedValue([]),
      findLatestByServiceOrderId: jest.fn().mockResolvedValue(null),
    } as any;

    // Catalogo: o preco vem daqui (price freezing), nao do input.
    mockServiceRepo = {
      findById: jest
        .fn()
        .mockResolvedValue(
          new Service({ name: 'Troca de óleo', basePrice: 150, estimatedMinutes: 30 }),
        ),
    } as any;
    mockPartRepo = {
      findById: jest
        .fn()
        .mockResolvedValue(
          new Part({ name: 'Filtro de óleo', sku: 'FIL-1', unitPrice: 25, stockQuantity: 100 }),
        ),
    } as any;

    serviceOrder = new ServiceOrder({ clientId: 'client-1', description: 'Revisão' });
    mockSORepo = {
      save: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn().mockResolvedValue(serviceOrder),
    } as any;

    // O resolver e real de proposito: ele e quem busca no catalogo e congela
    // o preco, que e justamente o que estes testes provam.
    useCase = new CreateBudgetUseCase(
      mockRepo,
      mockSORepo,
      new BudgetLineResolver(mockServiceRepo, mockPartRepo),
    );
  });

  it('should generate a budget from the catalog (frozen prices)', async () => {
    const result = await useCase.execute(validInput);

    expect(result.id).toBeDefined();
    expect(result.serviceOrderId).toBe('so-123');
    expect(result.lines).toHaveLength(2);
    expect(result.total).toBe(200); // 150 (catálogo) + 2 * 25 (catálogo)
    expect(result.status).toBe('PENDENTE');
    expect(result.version).toBe(1);
    expect(mockRepo.save).toHaveBeenCalledTimes(1);
  });

  it('should advance the service order to AGUARDANDO_APROVACAO', async () => {
    await useCase.execute(validInput);

    expect(serviceOrder.status).toBe(ServiceOrderStatus.AGUARDANDO_APROVACAO);
    expect(mockSORepo.save).toHaveBeenCalledTimes(1);
  });

  it('should throw when the service order does not exist', async () => {
    mockSORepo.findById.mockResolvedValue(null);
    await expect(useCase.execute(validInput)).rejects.toThrow('not found');
  });

  it('should throw when a referenced service is not in the catalog', async () => {
    mockServiceRepo.findById.mockResolvedValue(null);
    await expect(useCase.execute(validInput)).rejects.toThrow("Service 'svc-1' not found");
  });

  it('should create a new version when previous budget exists (re-budget)', async () => {
    // Primeiro orçamento
    await useCase.execute(validInput);

    // Simula orçamento anterior existente
    const existingBudget = new Budget({
      serviceOrderId: 'so-123',
      lines: [
        {
          type: 'SERVICE',
          referenceId: 'svc-1',
          description: 'Troca de óleo',
          quantity: 1,
          frozenUnitPrice: 150,
        },
      ],
      version: 1,
    });
    mockRepo.findLatestByServiceOrderId.mockResolvedValue(existingBudget);

    // Catálogo mudou de preço — o novo orçamento congela o novo preço
    mockServiceRepo.findById.mockResolvedValue(
      new Service({ name: 'Troca de óleo premium', basePrice: 250, estimatedMinutes: 40 }),
    );

    const reBudgetResult = await useCase.execute({
      serviceOrderId: 'so-123',
      lines: [{ type: 'SERVICE', referenceId: 'svc-1', quantity: 1 }],
    });

    expect(reBudgetResult.version).toBe(2);
    expect(reBudgetResult.total).toBe(250);
  });
});
