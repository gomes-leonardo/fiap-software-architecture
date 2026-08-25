/**
 * Abertura de OS com servicos e pecas inline, contra Postgres real.
 *
 * O que so este teste consegue provar: que o orcamento realmente chega ao
 * banco com as linhas certas (jsonb ida e volta), que a OS fica salva em
 * AGUARDANDO_APROVACAO com `budget_id` NULL, e — o mais importante — que o
 * caminho ate a execucao continua passando pela aprovacao, com baixa de
 * estoque. Com repositorio mockado, "o orcamento foi salvo" e so uma chamada
 * que aconteceu.
 */
import { DataSource } from 'typeorm';
import { setupTestDb, teardownTestDb, truncateAllTables } from '../../helpers/test-db.helper';

import { ClientOrmEntity } from '@infrastructure/database/typeorm/entities/client.orm-entity';
import { PartOrmEntity } from '@infrastructure/database/typeorm/entities/part.orm-entity';
import { ServiceOrmEntity } from '@infrastructure/database/typeorm/entities/service.orm-entity';
import { ServiceOrderOrmEntity } from '@infrastructure/database/typeorm/entities/service-order.orm-entity';
import { BudgetOrmEntity } from '@infrastructure/database/typeorm/entities/budget.orm-entity';

import { ClientTypeOrmRepository } from '@infrastructure/database/typeorm/repositories/client.typeorm-repository';
import { PartTypeOrmRepository } from '@infrastructure/database/typeorm/repositories/part.typeorm-repository';
import { ServiceTypeOrmRepository } from '@infrastructure/database/typeorm/repositories/service.typeorm-repository';
import { ServiceOrderTypeOrmRepository } from '@infrastructure/database/typeorm/repositories/service-order.typeorm-repository';
import { BudgetTypeOrmRepository } from '@infrastructure/database/typeorm/repositories/budget.typeorm-repository';

import { BudgetLineResolver } from '@application/budget/budget-line-resolver';
import { CreateServiceOrderUseCase } from '@application/service-order/create-service-order.use-case';
import { ApproveBudgetUseCase } from '@application/budget/approve-budget.use-case';

import { Client } from '@domain/client/client.entity';
import { Part } from '@domain/part/part.entity';
import { Service } from '@domain/service/service.entity';
import { ServiceOrderStatus } from '@domain/service-order/service-order-status.enum';

describe('Service order with inline items (integration)', () => {
  let dataSource: DataSource;
  let createServiceOrder: CreateServiceOrderUseCase;
  let approveBudget: ApproveBudgetUseCase;
  let soRepo: ServiceOrderTypeOrmRepository;
  let partRepo: PartTypeOrmRepository;
  let clientRepo: ClientTypeOrmRepository;
  let serviceRepo: ServiceTypeOrmRepository;

  let client: Client;
  let service: Service;
  let part: Part;

  beforeAll(async () => {
    dataSource = await setupTestDb();

    clientRepo = new ClientTypeOrmRepository(dataSource.getRepository(ClientOrmEntity));
    serviceRepo = new ServiceTypeOrmRepository(dataSource.getRepository(ServiceOrmEntity));
    partRepo = new PartTypeOrmRepository(dataSource.getRepository(PartOrmEntity));
    soRepo = new ServiceOrderTypeOrmRepository(dataSource.getRepository(ServiceOrderOrmEntity));
    const budgetRepo = new BudgetTypeOrmRepository(dataSource.getRepository(BudgetOrmEntity));
    const resolver = new BudgetLineResolver(serviceRepo, partRepo);

    createServiceOrder = new CreateServiceOrderUseCase(soRepo, clientRepo, budgetRepo, resolver);
    approveBudget = new ApproveBudgetUseCase(budgetRepo, soRepo, partRepo);
  }, 60000);

  /** Catalogo minimo: um cliente, um servico a 150 e uma peca a 25 com estoque 10. */
  async function seedCatalog(): Promise<void> {
    client = new Client({ name: 'Cliente Inline', cpfCnpj: '529.982.247-25' });
    service = new Service({ name: 'Troca de óleo', basePrice: 150, estimatedMinutes: 30 });
    part = new Part({ name: 'Filtro de óleo', sku: 'FIL-1', unitPrice: 25, stockQuantity: 10 });
    await clientRepo.save(client);
    await serviceRepo.save(service);
    await partRepo.save(part);
  }

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    await seedCatalog();
  });

  it('persiste o orcamento com as linhas e o total do catalogo', async () => {
    const result = await createServiceOrder.execute({
      clientId: client.id,
      description: 'Revisão completa',
      services: [{ referenceId: service.id, quantity: 1 }],
      parts: [{ referenceId: part.id, quantity: 2 }],
    });

    const row = await dataSource
      .getRepository(BudgetOrmEntity)
      .findOne({ where: { id: result.createdBudgetId! } });

    expect(row).not.toBeNull();
    expect(row!.serviceOrderId).toBe(result.id);
    expect(row!.status).toBe('PENDENTE');
    expect(row!.lines).toEqual([
      {
        type: 'SERVICE',
        referenceId: service.id,
        description: 'Troca de óleo',
        quantity: 1,
        frozenUnitPrice: 150,
      },
      {
        type: 'PART',
        referenceId: part.id,
        description: 'Filtro de óleo',
        quantity: 2,
        frozenUnitPrice: 25,
      },
    ]);
    expect(Number(row!.total)).toBe(200);
  });

  it('salva a OS em AGUARDANDO_APROVACAO com budget_id NULL', async () => {
    const result = await createServiceOrder.execute({
      clientId: client.id,
      description: 'Revisão completa',
      parts: [{ referenceId: part.id, quantity: 1 }],
    });

    const row = await dataSource
      .getRepository(ServiceOrderOrmEntity)
      .findOne({ where: { id: result.id } });

    expect(row!.status).toBe(ServiceOrderStatus.AGUARDANDO_APROVACAO);
    expect(row!.budgetId).toBeNull();
  });

  it('nao decrementa estoque na abertura — a reserva e da aprovacao', async () => {
    await createServiceOrder.execute({
      clientId: client.id,
      description: 'Revisão completa',
      parts: [{ referenceId: part.id, quantity: 4 }],
    });

    const stored = await partRepo.findById(part.id);
    expect(stored!.stockQuantity).toBe(10);
  });

  /**
   * O fluxo inteiro. Se `setBudget` fosse chamado na abertura, a OS chegaria a
   * EM_EXECUCAO sem passar por aqui — e sem que uma unica peca saisse do
   * estoque.
   */
  it('so libera EM_EXECUCAO depois da aprovacao, e ai sim baixa o estoque', async () => {
    const created = await createServiceOrder.execute({
      clientId: client.id,
      description: 'Revisão completa',
      parts: [{ referenceId: part.id, quantity: 4 }],
    });

    const beforeApproval = await soRepo.findById(created.id);
    expect(() => beforeApproval!.changeStatus(ServiceOrderStatus.EM_EXECUCAO, 'admin')).toThrow(
      'no approved budget',
    );

    await approveBudget.execute(created.createdBudgetId!);

    const afterApproval = await soRepo.findById(created.id);
    expect(afterApproval!.budgetId).toBe(created.createdBudgetId);
    expect(() =>
      afterApproval!.changeStatus(ServiceOrderStatus.EM_EXECUCAO, 'admin'),
    ).not.toThrow();

    const stored = await partRepo.findById(part.id);
    expect(stored!.stockQuantity).toBe(6);
  });

  it('avisa sobre estoque insuficiente sem impedir a abertura', async () => {
    const result = await createServiceOrder.execute({
      clientId: client.id,
      description: 'Revisão completa',
      parts: [{ referenceId: part.id, quantity: 11 }],
    });

    expect(result.createdBudgetId).not.toBeNull();
    expect(result.stockWarnings).toEqual([
      "Estoque insuficiente para a peca 'Filtro de óleo': disponivel=10, necessario=11",
    ]);

    // E na aprovacao o aviso vira bloqueio, que e onde ele tem que doer.
    await expect(approveBudget.execute(result.createdBudgetId!)).rejects.toThrow(
      'Estoque insuficiente',
    );
  });

  it('nao escreve nada quando um referenceId nao existe no catalogo', async () => {
    await expect(
      createServiceOrder.execute({
        clientId: client.id,
        description: 'Revisão completa',
        parts: [{ referenceId: '99999999-9999-4999-8999-999999999999', quantity: 1 }],
      }),
    ).rejects.toThrow('not found');

    expect(await dataSource.getRepository(ServiceOrderOrmEntity).count()).toBe(0);
    expect(await dataSource.getRepository(BudgetOrmEntity).count()).toBe(0);
  });

  it('mantem o comportamento antigo quando nenhum item e informado', async () => {
    const result = await createServiceOrder.execute({
      clientId: client.id,
      description: 'Revisão completa',
    });

    expect(result.status).toBe(ServiceOrderStatus.RECEBIDA);
    expect(result.createdBudgetId).toBeNull();
    expect(await dataSource.getRepository(BudgetOrmEntity).count()).toBe(0);
  });
});
