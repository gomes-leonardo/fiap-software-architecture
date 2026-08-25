import { CreateServiceOrderUseCase } from '@application/service-order/create-service-order.use-case';
import { BudgetLineResolver } from '@application/budget/budget-line-resolver';
import { ServiceOrderRepository } from '@domain/service-order/service-order-repository.port';
import { BudgetRepository } from '@domain/budget/budget-repository.port';
import { ClientRepository } from '@domain/client/client-repository.port';
import { ServiceRepository } from '@domain/service/service-repository.port';
import { PartRepository } from '@domain/part/part-repository.port';
import { Client } from '@domain/client/client.entity';
import { Service } from '@domain/service/service.entity';
import { Part } from '@domain/part/part.entity';
import { ServiceOrder } from '@domain/service-order/service-order.entity';
import { ServiceOrderStatus } from '@domain/service-order/service-order-status.enum';

const SERVICE_ID = '11111111-1111-4111-8111-111111111111';
const PART_ID = '22222222-2222-4222-8222-222222222222';

describe('CreateServiceOrderUseCase', () => {
  let useCase: CreateServiceOrderUseCase;
  let mockSORepo: jest.Mocked<ServiceOrderRepository>;
  let mockClientRepo: jest.Mocked<ClientRepository>;
  let mockBudgetRepo: jest.Mocked<BudgetRepository>;
  let mockServiceRepo: jest.Mocked<ServiceRepository>;
  let mockPartRepo: jest.Mocked<PartRepository>;
  let sampleClient: Client;
  let catalogPart: Part;

  beforeEach(() => {
    sampleClient = new Client({ name: 'João', cpfCnpj: '529.982.247-25' });
    catalogPart = new Part({
      name: 'Filtro de óleo',
      sku: 'FIL-1',
      unitPrice: 25,
      stockQuantity: 10,
    });

    mockSORepo = {
      save: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ServiceOrderRepository>;
    mockClientRepo = {
      findById: jest.fn().mockResolvedValue(sampleClient),
    } as unknown as jest.Mocked<ClientRepository>;
    mockBudgetRepo = {
      save: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<BudgetRepository>;
    mockServiceRepo = {
      findById: jest
        .fn()
        .mockResolvedValue(
          new Service({ name: 'Troca de óleo', basePrice: 150, estimatedMinutes: 30 }),
        ),
    } as unknown as jest.Mocked<ServiceRepository>;
    mockPartRepo = {
      findById: jest.fn().mockResolvedValue(catalogPart),
    } as unknown as jest.Mocked<PartRepository>;

    useCase = new CreateServiceOrderUseCase(
      mockSORepo,
      mockClientRepo,
      mockBudgetRepo,
      new BudgetLineResolver(mockServiceRepo, mockPartRepo),
    );
  });

  /** A OS salva, tal como o use case a entregou ao repositorio. */
  function savedOrder(): ServiceOrder {
    return mockSORepo.save.mock.calls[0][0];
  }

  describe('sem servicos nem pecas — comportamento de sempre', () => {
    it('cria a OS em RECEBIDA, sem orcamento', async () => {
      const result = await useCase.execute({
        clientId: sampleClient.id,
        description: 'Troca de óleo',
      });

      expect(result.id).toBeDefined();
      expect(result.status).toBe(ServiceOrderStatus.RECEBIDA);
      expect(result.clientId).toBe(sampleClient.id);
      expect(result.budgetId).toBeNull();
      expect(result.createdBudgetId).toBeNull();
      expect(result.stockWarnings).toEqual([]);
      expect(mockSORepo.save).toHaveBeenCalledTimes(1);
      expect(mockBudgetRepo.save).not.toHaveBeenCalled();
    });

    it('inclui o vehicleId quando informado', async () => {
      const result = await useCase.execute({
        clientId: sampleClient.id,
        vehicleId: '33333333-3333-4333-8333-333333333333',
        description: 'Troca de pneu',
      });

      expect(result.vehicleId).toBe('33333333-3333-4333-8333-333333333333');
    });

    it('recusa quando o cliente nao existe', async () => {
      mockClientRepo.findById.mockResolvedValue(null);

      await expect(
        useCase.execute({ clientId: 'non-existent', description: 'Test' }),
      ).rejects.toThrow('not found');
      expect(mockSORepo.save).not.toHaveBeenCalled();
    });
  });

  describe('com itens inline', () => {
    it('cria o orcamento com precos congelados do catalogo', async () => {
      const result = await useCase.execute({
        clientId: sampleClient.id,
        description: 'Revisão',
        services: [{ referenceId: SERVICE_ID, quantity: 1 }],
        parts: [{ referenceId: PART_ID, quantity: 2 }],
      });

      expect(result.createdBudgetId).toBeDefined();
      expect(mockBudgetRepo.save).toHaveBeenCalledTimes(1);

      const budget = mockBudgetRepo.save.mock.calls[0][0];
      expect(budget.serviceOrderId).toBe(result.id);
      expect(budget.status).toBe('PENDENTE');
      expect(budget.total).toBe(200); // 1 x 150 (servico) + 2 x 25 (peca)
      expect(
        budget.lines.map((l) => [l.type, l.description, l.quantity, l.frozenUnitPrice]),
      ).toEqual([
        ['SERVICE', 'Troca de óleo', 1, 150],
        ['PART', 'Filtro de óleo', 2, 25],
      ]);
    });

    it('avanca a OS ate AGUARDANDO_APROVACAO sem pular etapa', async () => {
      const result = await useCase.execute({
        clientId: sampleClient.id,
        description: 'Revisão',
        services: [{ referenceId: SERVICE_ID, quantity: 1 }],
      });

      expect(result.status).toBe(ServiceOrderStatus.AGUARDANDO_APROVACAO);
      // A trilha inteira, inclusive o RECEBIDA que a OS registra ao nascer: o
      // caminho ate AGUARDANDO_APROVACAO passa por EM_DIAGNOSTICO, sem salto.
      expect(result.statusHistory.map((entry) => entry.toStatus)).toEqual([
        ServiceOrderStatus.RECEBIDA,
        ServiceOrderStatus.EM_DIAGNOSTICO,
        ServiceOrderStatus.AGUARDANDO_APROVACAO,
      ]);
    });

    /**
     * O ponto mais importante do fluxo. `budgetId` significa "orcamento
     * APROVADO" — e ele que destranca EM_EXECUCAO. Preenche-lo na criacao
     * deixaria qualquer um abrir uma OS com pecas e ir direto para execucao,
     * sem aprovacao e sem baixa de estoque.
     */
    it('NAO vincula o orcamento a OS: aprovar continua sendo obrigatorio', async () => {
      const result = await useCase.execute({
        clientId: sampleClient.id,
        description: 'Revisão',
        parts: [{ referenceId: PART_ID, quantity: 1 }],
      });

      expect(result.budgetId).toBeNull();
      expect(result.createdBudgetId).not.toBeNull();

      // E a consequencia disso, na entidade que foi persistida:
      expect(() => savedOrder().changeStatus(ServiceOrderStatus.EM_EXECUCAO, 'admin')).toThrow(
        'no approved budget',
      );
    });

    /**
     * Sem transacao no projeto, a ordem das escritas e o que define o estrago
     * de uma falha no meio. Orcamento orfao ninguem enxerga; OS em
     * AGUARDANDO_APROVACAO sem orcamento e um estado quebrado e visivel.
     */
    it('salva o orcamento antes da OS', async () => {
      await useCase.execute({
        clientId: sampleClient.id,
        description: 'Revisão',
        parts: [{ referenceId: PART_ID, quantity: 1 }],
      });

      expect(mockBudgetRepo.save.mock.invocationCallOrder[0]).toBeLessThan(
        mockSORepo.save.mock.invocationCallOrder[0],
      );
    });
  });

  describe('validacao do catalogo', () => {
    it.each([
      ['servico', { services: [{ referenceId: SERVICE_ID, quantity: 1 }] }, 'mockServiceRepo'],
      ['peca', { parts: [{ referenceId: PART_ID, quantity: 1 }] }, 'mockPartRepo'],
    ])('recusa quando o %s nao existe, sem escrever nada', async (_caso, items, repo) => {
      const target = repo === 'mockServiceRepo' ? mockServiceRepo : mockPartRepo;
      target.findById.mockResolvedValue(null);

      await expect(
        useCase.execute({ clientId: sampleClient.id, description: 'Revisão', ...items }),
      ).rejects.toThrow('not found');

      // Nem OS orfa, nem orcamento orfao: a resolucao acontece antes de qualquer escrita.
      expect(mockSORepo.save).not.toHaveBeenCalled();
      expect(mockBudgetRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('estoque', () => {
    it('avisa, mas nao bloqueia, quando falta peca', async () => {
      const result = await useCase.execute({
        clientId: sampleClient.id,
        description: 'Revisão',
        parts: [{ referenceId: PART_ID, quantity: 11 }], // catalogo tem 10
      });

      expect(result.createdBudgetId).not.toBeNull();
      expect(mockBudgetRepo.save).toHaveBeenCalledTimes(1);
      expect(result.stockWarnings).toEqual([
        "Estoque insuficiente para a peca 'Filtro de óleo': disponivel=10, necessario=11",
      ]);
    });

    it('nao avisa quando o estoque cobre o pedido', async () => {
      const result = await useCase.execute({
        clientId: sampleClient.id,
        description: 'Revisão',
        parts: [{ referenceId: PART_ID, quantity: 10 }],
      });

      expect(result.stockWarnings).toEqual([]);
    });

    /** A mesma peca pode vir em mais de uma linha; o que conta e a soma. */
    it('soma as quantidades da mesma peca antes de comparar com o estoque', async () => {
      const result = await useCase.execute({
        clientId: sampleClient.id,
        description: 'Revisão',
        parts: [
          { referenceId: PART_ID, quantity: 6 },
          { referenceId: PART_ID, quantity: 5 },
        ],
      });

      expect(result.stockWarnings).toEqual([
        "Estoque insuficiente para a peca 'Filtro de óleo': disponivel=10, necessario=11",
      ]);
    });
  });
});
