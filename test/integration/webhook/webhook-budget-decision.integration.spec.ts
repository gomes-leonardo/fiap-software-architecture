/**
 * O canal externo de aprovacao/recusa de orcamento sobe aqui com HTTP de
 * verdade — guard, ValidationPipe e filtro de excecao no caminho — contra um
 * Postgres de verdade.
 *
 * O que importa nesta borda nao e so quem entra e quem toma 401: e que a
 * decisao vinda de fora produza os MESMOS efeitos do endpoint autenticado —
 * baixa de estoque, vinculo do orcamento com a OS, encerramento sem execucao na
 * recusa. Um teste que olhasse apenas o status do orcamento passaria mesmo se
 * toda essa logica tivesse sido pulada.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import * as request from 'supertest';

import { setupTestDb, teardownTestDb, truncateAllTables } from '../../helpers/test-db.helper';
import { BudgetOrmEntity } from '@infrastructure/database/typeorm/entities/budget.orm-entity';
import { PartOrmEntity } from '@infrastructure/database/typeorm/entities/part.orm-entity';
import { ServiceOrderOrmEntity } from '@infrastructure/database/typeorm/entities/service-order.orm-entity';
import { BudgetTypeOrmRepository } from '@infrastructure/database/typeorm/repositories/budget.typeorm-repository';
import { PartTypeOrmRepository } from '@infrastructure/database/typeorm/repositories/part.typeorm-repository';
import { ServiceOrderTypeOrmRepository } from '@infrastructure/database/typeorm/repositories/service-order.typeorm-repository';
import { BudgetRepository } from '@domain/budget/budget-repository.port';
import { PartRepository } from '@domain/part/part-repository.port';
import { ServiceOrderRepository } from '@domain/service-order/service-order-repository.port';
import { Budget, BudgetStatus } from '@domain/budget/budget.entity';
import { Part } from '@domain/part/part.entity';
import { ServiceOrder } from '@domain/service-order/service-order.entity';
import { ServiceOrderStatus } from '@domain/service-order/service-order-status.enum';
import { ApproveBudgetUseCase } from '@application/budget/approve-budget.use-case';
import { RefuseBudgetUseCase } from '@application/budget/refuse-budget.use-case';
import { BudgetWebhookController } from '@interfaces/http/webhook/budget-webhook.controller';
import { DomainExceptionFilter } from '@interfaces/http/filters/domain-exception.filter';

const SECRET = 'segredo-do-webhook-para-teste';
const CLIENT_ID = '11111111-1111-4111-8111-111111111111';

describe('Webhook budget decision (HTTP)', () => {
  let dataSource: DataSource;
  let app: INestApplication;
  let budgetRepo: BudgetTypeOrmRepository;
  let partRepo: PartTypeOrmRepository;
  let orderRepo: ServiceOrderTypeOrmRepository;

  beforeAll(async () => {
    dataSource = await setupTestDb();
    budgetRepo = new BudgetTypeOrmRepository(dataSource.getRepository(BudgetOrmEntity));
    partRepo = new PartTypeOrmRepository(dataSource.getRepository(PartOrmEntity));
    orderRepo = new ServiceOrderTypeOrmRepository(dataSource.getRepository(ServiceOrderOrmEntity));

    const moduleRef = await Test.createTestingModule({
      controllers: [BudgetWebhookController],
      providers: [
        ApproveBudgetUseCase,
        RefuseBudgetUseCase,
        { provide: BudgetRepository, useValue: budgetRepo },
        { provide: PartRepository, useValue: partRepo },
        { provide: ServiceOrderRepository, useValue: orderRepo },
        { provide: ConfigService, useValue: { get: () => SECRET } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    // Mesmas configuracoes globais do main.ts: sem elas o teste passaria por um
    // pipeline que nao e o que roda em producao.
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new DomainExceptionFilter());
    await app.init();
  }, 60000);

  afterAll(async () => {
    await app?.close();
    await teardownTestDb();
  });

  beforeEach(async () => {
    await truncateAllTables(dataSource);
  });

  /** OS parada em AGUARDANDO_APROVACAO, que e onde a decisao do cliente entra. */
  async function seedAwaitingOrder(): Promise<ServiceOrder> {
    const order = new ServiceOrder({ clientId: CLIENT_ID, description: 'OS semeada' });
    order.changeStatus(ServiceOrderStatus.EM_DIAGNOSTICO, 'system');
    order.changeStatus(ServiceOrderStatus.AGUARDANDO_APROVACAO, 'system');
    await orderRepo.save(order);
    return order;
  }

  async function seedPart(stockQuantity: number): Promise<Part> {
    const part = new Part({
      name: 'Filtro de oleo',
      sku: `FIL-${Math.random().toString(36).slice(2, 8)}`,
      unitPrice: 50,
      stockQuantity,
    });
    await partRepo.save(part);
    return part;
  }

  async function seedBudgetWithPart(
    order: ServiceOrder,
    part: Part,
    quantity: number,
  ): Promise<Budget> {
    const budget = new Budget({
      serviceOrderId: order.id,
      lines: [
        {
          type: 'PART',
          referenceId: part.id,
          description: part.name,
          quantity,
          frozenUnitPrice: part.unitPrice,
        },
      ],
    });
    await budgetRepo.save(budget);
    return budget;
  }

  function post(budgetId: string, action: 'approve' | 'refuse') {
    return request(app.getHttpServer()).post(`/webhooks/budgets/${budgetId}/${action}`);
  }

  describe('aprovacao', () => {
    it('aprova, da baixa no estoque e vincula o orcamento a OS', async () => {
      const order = await seedAwaitingOrder();
      const part = await seedPart(10);
      const budget = await seedBudgetWithPart(order, part, 3);

      const response = await post(budget.id, 'approve').set('Authorization', `Bearer ${SECRET}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(budget.id);
      expect(response.body.status).toBe(BudgetStatus.APROVADO);

      // A prova de que o caso de uso completo rodou, e nao so uma troca de status.
      expect((await partRepo.findById(part.id))!.stockQuantity).toBe(7);
      expect((await orderRepo.findById(order.id))!.budgetId).toBe(budget.id);
    });

    it('aceita o segredo no corpo, para integracoes que nao mandam header', async () => {
      const order = await seedAwaitingOrder();
      const part = await seedPart(5);
      const budget = await seedBudgetWithPart(order, part, 1);

      const response = await post(budget.id, 'approve').send({ token: SECRET });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe(BudgetStatus.APROVADO);
    });

    /**
     * Estoque nao pode ficar negativo: a aprovacao inteira e bloqueada e nada e
     * decrementado — nem as pecas que tinham saldo.
     */
    it('responde 400 e nao mexe em nada quando falta estoque', async () => {
      const order = await seedAwaitingOrder();
      const part = await seedPart(2);
      const budget = await seedBudgetWithPart(order, part, 5);

      const response = await post(budget.id, 'approve').set('Authorization', `Bearer ${SECRET}`);

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/Estoque insuficiente/);

      expect((await partRepo.findById(part.id))!.stockQuantity).toBe(2);
      expect((await budgetRepo.findById(budget.id))!.status).toBe(BudgetStatus.PENDENTE);
      expect((await orderRepo.findById(order.id))!.budgetId).toBeNull();
    });

    it('responde 400 quando o orcamento ja foi decidido', async () => {
      const order = await seedAwaitingOrder();
      const part = await seedPart(10);
      const budget = await seedBudgetWithPart(order, part, 1);

      const first = await post(budget.id, 'approve').set('Authorization', `Bearer ${SECRET}`);
      expect(first.status).toBe(200);

      const second = await post(budget.id, 'approve').set('Authorization', `Bearer ${SECRET}`);

      expect(second.status).toBe(400);
      expect(second.body.message).toMatch(/PENDENTE/);

      // A segunda chamada nao pode cobrar o estoque de novo.
      expect((await partRepo.findById(part.id))!.stockQuantity).toBe(9);
    });

    it('responde 400 quando o orcamento nao existe', async () => {
      const response = await post('00000000-0000-4000-8000-000000000000', 'approve').set(
        'Authorization',
        `Bearer ${SECRET}`,
      );

      expect(response.status).toBe(400);
    });
  });

  describe('recusa', () => {
    it('recusa e encerra a OS sem execucao', async () => {
      const order = await seedAwaitingOrder();
      const part = await seedPart(10);
      const budget = await seedBudgetWithPart(order, part, 3);

      const response = await post(budget.id, 'refuse').set('Authorization', `Bearer ${SECRET}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe(BudgetStatus.RECUSADO);

      expect((await orderRepo.findById(order.id))!.status).toBe(
        ServiceOrderStatus.ENCERRADA_SEM_EXECUCAO,
      );
      // Recusa nao reserva peca.
      expect((await partRepo.findById(part.id))!.stockQuantity).toBe(10);
    });

    it('responde 400 quando o orcamento ja foi recusado', async () => {
      const order = await seedAwaitingOrder();
      const part = await seedPart(10);
      const budget = await seedBudgetWithPart(order, part, 1);

      await post(budget.id, 'refuse').set('Authorization', `Bearer ${SECRET}`);
      const second = await post(budget.id, 'refuse').set('Authorization', `Bearer ${SECRET}`);

      expect(second.status).toBe(400);
      expect(second.body.message).toMatch(/PENDENTE/);
    });

    it('nao aceita recusar um orcamento ja aprovado', async () => {
      const order = await seedAwaitingOrder();
      const part = await seedPart(10);
      const budget = await seedBudgetWithPart(order, part, 1);

      await post(budget.id, 'approve').set('Authorization', `Bearer ${SECRET}`);
      const response = await post(budget.id, 'refuse').set('Authorization', `Bearer ${SECRET}`);

      expect(response.status).toBe(400);
      expect((await budgetRepo.findById(budget.id))!.status).toBe(BudgetStatus.APROVADO);
    });
  });

  describe('autenticacao', () => {
    it.each([
      ['segredo errado', 'Bearer segredo-errado'],
      ['esquema errado', SECRET],
    ])('responde 401 e nao decide nada com %s', async (_caso, authorization) => {
      const order = await seedAwaitingOrder();
      const part = await seedPart(10);
      const budget = await seedBudgetWithPart(order, part, 3);

      const response = await post(budget.id, 'approve').set('Authorization', authorization);

      expect(response.status).toBe(401);
      expect((await budgetRepo.findById(budget.id))!.status).toBe(BudgetStatus.PENDENTE);
      expect((await partRepo.findById(part.id))!.stockQuantity).toBe(10);
    });

    it('responde 401 quando nao vem credencial nenhuma', async () => {
      const order = await seedAwaitingOrder();
      const part = await seedPart(10);
      const budget = await seedBudgetWithPart(order, part, 3);

      const response = await post(budget.id, 'refuse');

      expect(response.status).toBe(401);
      expect((await budgetRepo.findById(budget.id))!.status).toBe(BudgetStatus.PENDENTE);
    });

    /**
     * A credencial no corpo nao pode virar um jeito de burlar o guard: token
     * errado no campo `token` sai igual a token errado no header.
     */
    it('responde 401 quando o token do corpo esta errado', async () => {
      const order = await seedAwaitingOrder();
      const part = await seedPart(10);
      const budget = await seedBudgetWithPart(order, part, 3);

      const response = await post(budget.id, 'approve').send({ token: 'segredo-errado' });

      expect(response.status).toBe(401);
      expect((await budgetRepo.findById(budget.id))!.status).toBe(BudgetStatus.PENDENTE);
    });
  });
});
